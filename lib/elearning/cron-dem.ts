import { db } from "@/lib/db";
import { publishEvent } from "@/lib/events/publish";
import {
  chonQuaHan,
  mocDonTang2,
  mocDonTaiDo,
  chonTaiDoDeHuy,
  type DongQuaHan,
} from "@/lib/elearning/dem-quyet-dinh";
import { donTaiDo } from "@/lib/elearning/cleanup-multipart";
import { runDynamicAudienceSync } from "@/lib/elearning/dynamic-audience-run";
import { thuLaiHangDoiNhanSu } from "@/lib/elearning/retry-queue";

/**
 * EL-06 — CRON ĐÊM `elearning-dem`, chạy 00:47 giờ Việt Nam (`47 17 * * *` UTC).
 *
 * SÁU việc tuần tự, mỗi việc idempotent. Thứ tự KHÔNG đổi được:
 *
 *   1. quét quá hạn → `OVERDUE` + phát sự kiện
 *   2. tập ĐỘNG §10.4 — người mới khớp luật thì thêm, rời tập thì thu hồi
 *   3. chứng nhận T-30/T-7 + tự giao lại khi hết hiệu lực  ⛔ CHƯA LÀM ĐƯỢC
 *   4. dọn dữ liệu tầng 2 (QĐ-CDA-14)
 *   6. dọn lượt tải nhiều phần bỏ dở trên R2 (EL-10)
 *   5. thử lại hàng đợi "chờ dữ liệu Nhân sự"
 *
 * Việc (6) mang số 6 nhưng chạy TRƯỚC việc (5): nó thuộc nhóm DỌN, và số thứ tự
 * giữ nguyên theo đặc tả để đối chiếu được. Đổi số cho "gọn" là làm mọi trích
 * dẫn tài liệu trỏ sai chỗ.
 *
 * ⚠️ Việc (4) phải chạy SAU (1) và (3), không chạy trước: cả hai việc kia ĐỌC
 * trạng thái của kỳ đang chốt, còn (4) thì xoá dữ liệu — dọn trước là rút thảm
 * dưới chân hai việc chưa chạy.
 *
 * ⚠️ ĐÚNG HAI khe cron cho cả module (QĐ-CDA-14 điểm 2). Việc dọn GỘP vào đây,
 * không xin khe thứ ba. Cron tập ĐỘNG riêng của EL-05 cũng đã gộp vào việc (2)
 * và trả lại khe của nó — `vercel.json` sau PR này có đúng 25 cron.
 */

export type KetQuaDem = {
  quaHan: number;
  tapDong: { themMoi: number; thuHoi: number; choDuLieuNhanSu: number };
  chungNhan: { chuaLamDuoc: string } | { nhac: number };
  don: { videoSession: number; bitmap: number; examAttempt: number | null };
  thuLai: { taoMoi: number; vanKet: number; nguoiVanKet: string[] };
  /** EL-10 việc (6) — lượt tải nhiều phần bỏ dở, đã huỷ trên R2. */
  taiDo: { daHuy: number; conGiu: number } | { chuaLamDuoc: string };
  loi: { viec: string; message: string }[];
};

/** Trần thời gian mềm cho cả lượt chạy — cron không được kéo dài vô hạn. */
const TRAN_MS = 4 * 60 * 1000;
const LO = 500;

export async function runElearningDem(now = new Date()): Promise<KetQuaDem> {
  const batDau = Date.now();
  const conGio = () => Date.now() - batDau < TRAN_MS;
  const ket: KetQuaDem = {
    quaHan: 0,
    tapDong: { themMoi: 0, thuHoi: 0, choDuLieuNhanSu: 0 },
    chungNhan: {
      // ⛔ Việc (3) chưa làm được: bảng `TrnCertificate` thuộc EL-16 và CHƯA tồn
      // tại. Nói ra ở đây thay vì bỏ trống lặng lẽ — một cron báo "xong" trong
      // khi có việc chưa chạy là thứ khó phát hiện nhất.
      chuaLamDuoc: "TrnCertificate chưa tồn tại (EL-16)",
    },
    don: { videoSession: 0, bitmap: 0, examAttempt: null },
    thuLai: { taoMoi: 0, vanKet: 0, nguoiVanKet: [] },
    taiDo: { daHuy: 0, conGiu: 0 },
    loi: [],
  };

  // ── Việc 1: quá hạn ───────────────────────────────────────────────────────
  try {
    let con = true;
    while (con && conGio()) {
      const rows = (await db.trnEnrollment.findMany({
        where: {
          status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
          dueAt: { lt: now },
          pausedAt: null,
        },
        select: { id: true, status: true, dueAt: true, pausedAt: true, userId: true },
        take: LO,
      })) as (DongQuaHan & { userId: string })[];
      con = rows.length === LO;
      if (!rows.length) break;

      const ids = chonQuaHan(rows, now);
      if (!ids.length) break;

      await db.trnEnrollment.updateMany({
        where: { id: { in: ids } },
        data: { status: "OVERDUE" },
      });
      ket.quaHan += ids.length;

      // Sự kiện phát NGOÀI vòng cập nhật, một dòng cho mỗi người: handler báo
      // người học + quản lý trực tiếp + Đào tạo. `dedupeKey` chặn báo lại đêm
      // sau nếu vì lý do gì đó dòng bị quét lại.
      for (const r of rows.filter((x) => ids.includes(x.id))) {
        await publishEvent(
          "elearning.enrollment.overdue",
          { enrollmentId: r.id, userId: r.userId },
          { dedupeKey: `el.over:${r.id}` },
        );
      }
    }
  } catch (e) {
    ket.loi.push({ viec: "qua-han", message: String(e) });
  }

  // ── Việc 2: tập ĐỘNG ──────────────────────────────────────────────────────
  try {
    const r = await runDynamicAudienceSync(now);
    ket.tapDong = {
      themMoi: r.soThemMoi,
      thuHoi: r.soThuHoi,
      choDuLieuNhanSu: r.soChoDuLieuNhanSu,
    };
    for (const l of r.loi) ket.loi.push({ viec: `tap-dong:${l.assignmentId}`, message: l.message });
  } catch (e) {
    ket.loi.push({ viec: "tap-dong", message: String(e) });
  }

  // ── Việc 3: chứng nhận — xem ghi chú ở `ket.chungNhan` ────────────────────

  // ── Việc 4: dọn dữ liệu tầng 2 (SAU việc 1 và 3) ──────────────────────────
  try {
    const moc = mocDonTang2(now);

    // (a) Nhịp xem hết hạn lưu — xoá CỨNG. `TrnVideoSession` cố ý nằm ngoài
    // `SOFT_DELETE_MODELS` đúng để câu này xoá được thật.
    const xoaVideo = await db.trnVideoSession.deleteMany({
      where: { purgeAfter: { lt: moc.videoSessionTruoc } },
    });
    ket.don.videoSession = xoaVideo.count;

    // (b) Bản đồ đoạn xem của bài ĐÃ XONG và im ắng quá 90 ngày.
    // ⚠️ KHÔNG chạm cột `status` của bất kỳ bảng nào (QĐ-CDA-14): dọn là xoá dữ
    // liệu thô, không phải đổi kết luận nghiệp vụ.
    const xoaBitmap = await db.trnLessonProgress.updateMany({
      where: {
        status: "DONE",
        lastActivityAt: { lt: moc.bitmapLastActivityTruoc },
        segmentBitmap: { not: null },
      },
      data: { segmentBitmap: null, bitmapPurgedAt: now },
    });
    ket.don.bitmap = xoaBitmap.count;

    // (c) `TrnExamAttempt.ipHash`/`deviceClass` — bảng thuộc EL-14, CHƯA tồn
    // tại. `null` (không phải 0) để phân biệt "chưa làm được" với "không có gì
    // để dọn"; 0 ở đây sẽ đọc thành đã dọn và không có gì, tức nói dối.
    ket.don.examAttempt = null;
  } catch (e) {
    ket.loi.push({ viec: "don-tang-2", message: String(e) });
  }

  // ── Việc 6: dọn lượt tải nhiều phần bỏ dở ─────────────────────────────────
  // Chạy CÙNG nhóm việc dọn (sau việc 1 và 3, trước việc 5) và KHÔNG xin khe
  // cron thứ ba — ngân sách của module là đúng hai khe.
  try {
    ket.taiDo = await donTaiDo(chonTaiDoDeHuy, mocDonTaiDo(now));
  } catch (e) {
    ket.loi.push({ viec: "don-tai-do", message: String(e) });
  }

  // ── Việc 5: thử lại hàng đợi "chờ dữ liệu Nhân sự" ────────────────────────
  try {
    const r = await thuLaiHangDoiNhanSu(now);
    ket.thuLai = r;
  } catch (e) {
    ket.loi.push({ viec: "thu-lai-hang-doi", message: String(e) });
  }

  return ket;
}
