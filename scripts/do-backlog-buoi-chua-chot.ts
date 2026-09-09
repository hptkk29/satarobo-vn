/**
 * scripts/do-backlog-buoi-chua-chot.ts — ĐO backlog buổi đã qua ngày mà chưa chốt.
 *
 * CHỈ ĐỌC. Không có chế độ ghi, không tham số nào bật ghi.
 *
 * ── Câu hỏi nó trả lời ──────────────────────────────────────────────────────────
 *
 * Cổng tự đóng buổi (`#TU-HOAN-TAT`) live từ 04/09/2026 nhưng hỏng hai chỗ, vá ngày
 * 07–08/09 (`4df347b4` so ngày sai · `a94e5aa7` so số đếm thay vì giao tập). Cổng chỉ
 * chạy khi giáo viên LƯU điểm danh, nên backlog buổi cũ nằm im mãi.
 *
 * Trước khi bàn "có đóng hàng loạt không", phải biết: trong đám buổi đang treo, bao
 * nhiêu buổi THOẢ CỔNG ĐÃ SỬA? Script này đếm đúng câu đó, tách theo tháng.
 *
 *   • phần lớn THOẢ   → một script chạy tay đóng đúng nhóm đó là hợp lý;
 *   • phần lớn KHÔNG  → chúng chưa từng được điểm danh đủ, đóng chúng là BỊA DỮ LIỆU.
 *
 * ⚠️ Dùng CHÍNH `quyetDinhTuHoanTat` — không chép lại luật. Số đo mà lệch với cổng thật
 * thì nó chỉ là một ý kiến.
 *
 * CHẠY:
 *   pnpm tsx scripts/do-backlog-buoi-chua-chot.ts
 */
// `_load-env` phải chạy TRƯỚC `_script-db` — Prisma đọc DATABASE_URL ngay lúc khởi tạo.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";
import { quyetDinhTuHoanTat } from "../lib/lms/tu-hoan-tat-buoi";
import { rosterWhere } from "../lib/enrollment-scope";
import { vnDateOnly, vnYmd } from "../lib/time/vn";

const db = scriptDb();

type LyDo =
  | "THOA"
  | "DIEM_DANH_THIEU"
  | "SI_SO_RONG"
  | "CHUA_TOI_NGAY"
  | "DA_XONG";

function dong(nhan: string, n: number | string) {
  console.log(`  ${nhan.padEnd(46)} ${String(n).padStart(8)}`);
}

async function main() {
  console.log(`[backlog] DB: ${currentDbHost()} · CHỈ ĐỌC`);
  inQuyen(await kiemQuyen(db), false);

  const homNayUtcMs = vnDateOnly(new Date()).getTime();

  // Buổi ĐANG TREO: chưa chốt, chưa huỷ, đã tới/qua ngày. Lấy cả IN_PROGRESS vì cổng
  // nhận cả hai trạng thái đó.
  const buoi = await db.classSession.findMany({
    where: {
      status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      class: { deletedAt: null },
    },
    select: {
      id: true,
      classId: true,
      status: true,
      date: true,
      lessonId: true,
      plan: { select: { lessonId: true } },
    },
    orderBy: { date: "asc" },
  });
  const daQua = buoi.filter((b) => vnDateOnly(b.date).getTime() <= homNayUtcMs);

  if (buoi.length === 0) {
    console.log(
      "\n⚠️ Không đọc được buổi nào. Nếu đây là prod thì con số 0 này KHÔNG phải sự thật —\n" +
        '   xem docs/cham-cong/USER-CHI-DOC-PROD.md mục "Nếu số đo ra 0".',
    );
    return;
  }

  console.log(
    `[backlog] ${buoi.length} buổi chưa chốt · ${daQua.length} buổi ĐÃ QUA NGÀY\n`,
  );
  if (daQua.length === 0) return;

  // Ba truy vấn gộp, không N+1.
  const classIds = [...new Set(daQua.map((b) => b.classId))];
  const sessionIds = daQua.map((b) => b.id);
  const [ghiDanh, diemDanh] = await Promise.all([
    db.enrollment.findMany({
      where: { classId: { in: classIds }, ...rosterWhere("dang-hoc") },
      select: { classId: true, studentId: true },
    }),
    db.attendance.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { sessionId: true, studentId: true },
    }),
  ]);

  const siSoTheoLop = new Map<string, string[]>();
  for (const e of ghiDanh) {
    const arr = siSoTheoLop.get(e.classId) ?? [];
    arr.push(e.studentId);
    siSoTheoLop.set(e.classId, arr);
  }
  const dauTheoBuoi = new Map<string, string[]>();
  for (const a of diemDanh) {
    const arr = dauTheoBuoi.get(a.sessionId) ?? [];
    arr.push(a.studentId);
    dauTheoBuoi.set(a.sessionId, arr);
  }

  // thang -> lyDo -> số buổi
  /** ID buổi THOẢ cổng — dùng lại ở mục 'trước/sau bản vá', không tính lại. */
  const thoaIds: string[] = [];
  const theoThang = new Map<string, Map<LyDo, number>>();
  const tong = new Map<LyDo, number>();
  const themVao = (thang: string, ly: LyDo) => {
    const m = theoThang.get(thang) ?? new Map<LyDo, number>();
    m.set(ly, (m.get(ly) ?? 0) + 1);
    theoThang.set(thang, m);
    tong.set(ly, (tong.get(ly) ?? 0) + 1);
  };

  for (const b of daQua) {
    const qd = quyetDinhTuHoanTat({
      trangThaiBuoi: b.status,
      ngayBuoi: b.date,
      homNayUtcMs,
      siSoStudentIds: siSoTheoLop.get(b.classId) ?? [],
      daDanhDauStudentIds: dauTheoBuoi.get(b.id) ?? [],
    });
    themVao(vnYmd(b.date).slice(0, 7), qd.tuHoanTat ? "THOA" : qd.lyDo);
    if (qd.tuHoanTat) thoaIds.push(b.id);
  }

  const COT: LyDo[] = [
    "THOA",
    "DIEM_DANH_THIEU",
    "SI_SO_RONG",
    "CHUA_TOI_NGAY",
    "DA_XONG",
  ];

  console.log("══ THOẢ CỔNG ĐÃ SỬA hay không, theo tháng (giờ VN) ══");
  console.log(
    `  ${"tháng".padEnd(9)}${COT.map((c) => c.padStart(17)).join("")}${"tổng".padStart(9)}`,
  );
  for (const thang of [...theoThang.keys()].sort()) {
    const m = theoThang.get(thang)!;
    const t = COT.reduce((s, c) => s + (m.get(c) ?? 0), 0);
    console.log(
      `  ${thang.padEnd(9)}${COT.map((c) => String(m.get(c) ?? 0).padStart(17)).join("")}${String(t).padStart(9)}`,
    );
  }

  console.log("\n══ TỔNG ══");
  for (const c of COT) dong(c, tong.get(c) ?? 0);

  // ── BÁN KÍNH ẢNH HƯỞNG nếu backfill để `assignMode` rơi về mặc định "NOW" ──────
  //
  // `completeSession` đặt `assignMode: opts.assignMode ?? "NOW"` vào payload
  // `session.taught`. Handler R7-14 khi đó GIAO BÀI TẬP cho mọi học viên đang học, và
  // R7-17 bắn thông báo "Bài tập mới" tới học viên/phụ huynh — cho một buổi tháng 4.
  //
  // Điều kiện thật để sinh bài (lib/lms/assignment.ts:125-137): buổi có `lessonId`
  // (hoặc qua `plan`), VÀ bài đó có ≥1 `Exam` PUBLISHED dùng chung hoặc của đúng lớp.
  // Đo số đó để biết chặn `assignMode` là bắt buộc hay chỉ cho chắc.
  const thoaBuoi = daQua.filter((b) => {
    const qd = quyetDinhTuHoanTat({
      trangThaiBuoi: b.status,
      ngayBuoi: b.date,
      homNayUtcMs,
      siSoStudentIds: siSoTheoLop.get(b.classId) ?? [],
      daDanhDauStudentIds: dauTheoBuoi.get(b.id) ?? [],
    });
    return qd.tuHoanTat;
  });
  const coBai = new Set<string>();
  const capLesson = thoaBuoi
    .map((b) => ({
      id: b.id,
      classId: b.classId,
      lessonId: b.lessonId ?? b.plan?.lessonId ?? null,
    }))
    .filter(
      (x): x is { id: string; classId: string; lessonId: string } =>
        x.lessonId != null,
    );
  if (capLesson.length > 0) {
    const exams = await db.exam.findMany({
      where: {
        lessonId: { in: [...new Set(capLesson.map((x) => x.lessonId))] },
        status: "PUBLISHED",
      },
      select: { lessonId: true, classId: true },
    });
    for (const x of capLesson) {
      const hop = exams.some(
        (e) =>
          e.lessonId === x.lessonId &&
          (e.classId == null || e.classId === x.classId),
      );
      if (hop) coBai.add(x.id);
    }
  }

  console.log("");
  console.log("══ NẾU backfill KHÔNG chặn assignMode (rơi về mặc định NOW) ══");
  dong("Buổi THOẢ có gắn bài học", capLesson.length);
  dong("→ trong đó SẼ SINH BÀI TẬP hồi tố", coBai.size);
  console.log(
    coBai.size > 0
      ? "  🔴 Phải chặn: backfill sẽ giao bài + bắn 'Bài tập mới' cho buổi đã qua nhiều tháng."
      : "  Không buổi nào sinh bài — nhưng VẪN chặn: đây là số đo của HÔM NAY; thêm một Exam PUBLISHED trước lúc chạy là con số đổi.",
  );

  const thoa = tong.get("THOA") ?? 0;
  const pct =
    daQua.length > 0 ? ((thoa / daQua.length) * 100).toFixed(1) : "0.0";
  console.log(
    `\n  ${thoa}/${daQua.length} buổi (${pct}%) sẽ đóng được nếu chạy lại cổng đã sửa.`,
  );
  console.log(
    "  Phần còn lại KHÔNG được đóng: chúng chưa từng điểm danh đủ sĩ số, đóng là bịa dữ liệu.",
  );
  console.log(
    "\n  ⚠️ SI_SO_RONG = lớp không còn ai đang học (khoá đã kết thúc / chưa xếp học viên).\n" +
      "     Đây KHÔNG phải buổi 'còn nợ việc' — đừng gộp nó vào nhóm cần xử lý.",
  );

  // ── 90 BUỔI THOẢ: chúng trở nên ĐỦ ĐIỂM DANH trước hay sau BẢN VÁ? ────────────────────
  //
  // Câu hỏi: cổng tự đóng có đang nổ không. Nếu nó chạy, thì mọi buổi trở nên đủ điểm danh
  // SAU khi bản vá lên prod phải đã tự đóng — còn nằm trong danh sách THOẢ là cổng không nổ.
  //
  // MỐC: PR #227 lên `main` lúc 2026-09-08T01:30:54Z (08:30:54 +07). Ba commit vá đều nằm
  // trong đó: `4df347b4` (so ngày với ngày), `a94e5aa7` (so tập studentId), `9635260f`
  // (hỏng thì để lại dấu). Merge vào `main` = prod đổi ngay (Vercel Git integration).
  //
  // ⚠️ VÌ SAO `max(Attendance.createdAt)` LÀ ĐÚNG THƯỚC, không phải một phép xấp xỉ:
  // cổng hỏi "mọi học viên trong sĩ số ĐÃ CÓ DÒNG điểm danh chưa" — nó đếm SỰ TỒN TẠI của
  // dòng, không đọc `status`. Nên dòng cuối cùng được tạo CHÍNH LÀ thời điểm buổi trở nên
  // đủ điều kiện. (`Attendance` không có `updatedAt`, và ở đây không cần.)
  //
  // ⚠️ MỘT ĐƯỜNG KHÁC LÀM BUỔI THOẢ MÀ KHÔNG QUA ĐIỂM DANH — phải trừ ra khi đọc:
  // sĩ số CO LẠI (học viên rời lớp) cũng làm buổi trở nên "đủ" mà không ai lưu điểm danh.
  // Cổng chỉ chạy TRONG đường lưu điểm danh, nên buổi kiểu đó kẹt vĩnh viễn và đó KHÔNG
  // phải "cổng không nổ". Script in kèm mốc thay đổi ghi danh mới nhất của lớp để nhận ra.
  const MOC_VA = new Date("2026-09-08T01:30:54Z");
  console.log("\n== 90 BUOI THOA: du diem danh TRUOC hay SAU ban va ==");
  console.log(`  Mốc bản vá lên prod: ${MOC_VA.toISOString()} (PR #227)`);
  if (thoaIds.length === 0) {
    console.log("  Không buổi nào THOẢ — không có gì để chia.");
  } else {
    const [diemDanhThoa, buoiThoa] = await Promise.all([
      db.attendance.findMany({
        where: { sessionId: { in: thoaIds } },
        select: { sessionId: true, createdAt: true },
      }),
      db.classSession.findMany({
        where: { id: { in: thoaIds } },
        select: { id: true, classId: true, date: true },
      }),
    ]);
    const lopCua = new Map(buoiThoa.map((b) => [b.id, b.classId]));
    const ngayBuoi = new Map(buoiThoa.map((b) => [b.id, b.date]));
    const ghiDanhDoi = await db.enrollment.findMany({
      where: { classId: { in: [...new Set(buoiThoa.map((b) => b.classId))] } },
      select: { classId: true, updatedAt: true },
    });
    const ghiDanhMoiNhat = new Map<string, Date>();
    for (const e of ghiDanhDoi) {
      const cu = ghiDanhMoiNhat.get(e.classId);
      if (!cu || e.updatedAt > cu) ghiDanhMoiNhat.set(e.classId, e.updatedAt);
    }

    const cuoiCua = new Map<string, Date>();
    for (const a of diemDanhThoa) {
      const cu = cuoiCua.get(a.sessionId);
      if (!cu || a.createdAt > cu) cuoiCua.set(a.sessionId, a.createdAt);
    }

    const truoc: string[] = [];
    const sau: string[] = [];
    const khongCo: string[] = [];
    for (const id of thoaIds) {
      const c = cuoiCua.get(id);
      if (!c) khongCo.push(id);
      else if (c < MOC_VA) truoc.push(id);
      else sau.push(id);
    }

    dong("THOẢ, lượt điểm danh cuối TRƯỚC bản vá", truoc.length);
    dong("THOẢ, lượt điểm danh cuối SAU bản vá", sau.length);
    dong("THOẢ nhưng KHÔNG có dòng điểm danh nào", khongCo.length);

    if (sau.length === 0) {
      console.log(
        "\n  ⇒ 0 buổi thuộc nhóm SAU. 90 buổi này là BACKLOG CŨ — chúng đủ điểm danh từ\n" +
          "    trước khi bản vá lên, và cổng chỉ chạy trong đường lưu điểm danh nên không\n" +
          "    ai đánh thức chúng. KHÔNG kết luận được là cổng đúng (luật 15) — cần `nguonChot`.",
      );
    } else {
      console.log(
        `\n  🔴 ${sau.length} buổi đủ điểm danh SAU bản vá mà VẪN chưa đóng.\n` +
          "    Trừ nhóm 'sĩ số co lại' ở dưới ra; phần còn lại là CỔNG KHÔNG NỔ.",
      );
      console.log("\n  Chi tiết (tối đa 15 dòng):");
      console.log(
        `    ${"buổi".padEnd(28)}${"ngày buổi".padEnd(13)}${"điểm danh cuối".padEnd(26)}ghi danh đổi gần nhất`,
      );
      for (const id of sau.slice(0, 15)) {
        const c = cuoiCua.get(id)!;
        const gd = ghiDanhMoiNhat.get(lopCua.get(id) ?? "");
        // Ghi danh đổi SAU lượt điểm danh cuối ⇒ buổi thoả do sĩ số CO LẠI, không phải do
        // một lượt lưu điểm danh — cổng không có cơ hội chạy.
        const nghiSiSo = gd && gd > c ? "  ← sĩ số co lại" : "";
        console.log(
          `    ${id.padEnd(28)}${vnYmd(ngayBuoi.get(id)!).padEnd(13)}${c.toISOString().padEnd(26)}${gd ? gd.toISOString() : "—"}${nghiSiSo}`,
        );
      }
      const doSiSo = sau.filter((id) => {
        const c = cuoiCua.get(id)!;
        const gd = ghiDanhMoiNhat.get(lopCua.get(id) ?? "");
        return gd ? gd > c : false;
      }).length;
      console.log(
        `\n    Trong ${sau.length} buổi nhóm SAU: ${doSiSo} buổi có ghi danh đổi SAU lượt điểm danh cuối\n` +
          `    (nghi do sĩ số co lại — cổng không có cơ hội chạy) · ${sau.length - doSiSo} buổi CÒN LẠI đáng đào.`,
      );
    }
  }

  // ── BUỔI MỚI CHỐT, theo ngày ────────────────────────────────────────────────────────
  //
  // Vì sao đo riêng: cột `THOA` ở trên nói còn bao nhiêu buổi ĐÁNG đóng mà chưa đóng. Nó
  // KHÔNG nói cổng có đang đóng buổi mới hay không — hai câu khác nhau.
  //
  // 🔴 GIỚI HẠN PHẢI ĐỌC TRƯỚC KHI TIN CON SỐ NÀY (đo 09/09/2026)
  //
  // Hiện KHÔNG phân biệt được "buổi tự đóng" với "người bấm chốt". Cả hai đường đều gọi
  // `completeSession` với CÙNG `actorId` (đường tự đóng truyền id của chính giáo viên vừa
  // lưu điểm danh — `teacher/lop/_actions.ts`), cùng ghi `action: "COMPLETE_SESSION"`,
  // cùng `assignMode: "DEFER"`. Không cột nào, không trường audit nào khác nhau.
  //
  // Bản đầu của mục này CHIA hai cột theo `completedById = null` và in ra "tự động 1 /
  // người bấm 39". Con số đó VÔ NGHĨA — `completedById` có giá trị ở cả hai đường. Đã gỡ.
  //
  // ⇒ Muốn trả lời "cổng tự đóng có chạy không" thì phải THÊM MỘT DẤU: một trường
  //   `nguonChot: "TU_DONG" | "TAY"` bắt buộc ở `completeSession`, ghi vào `newValues` của
  //   audit. Đó là thay đổi ở module LMS, ngoài phạm vi module chấm công — chờ chốt.
  const tuNgay = new Date(Date.now() - 14 * 86_400_000);
  const chotGanDay = await db.classSession.findMany({
    where: { status: "COMPLETED", completedAt: { gte: tuNgay } },
    select: { completedAt: true },
    orderBy: { completedAt: "asc" },
  });
  console.log("\n== BUOI MOI CHOT - 14 ngay gan nhat (theo completedAt, gio VN) ==");
  if (chotGanDay.length === 0) {
    console.log(
      "  0 buổi. Đọc CẠNH cột THOA ở trên trước khi kết luận cổng hỏng (luật 15):\n" +
        "  THOA > 0 mà 0 buổi mới chốt trong 14 ngày mới là dấu hiệu đáng đào.",
    );
  } else {
    const theoNgay = new Map<string, number>();
    for (const b of chotGanDay) {
      if (!b.completedAt) continue;
      const k = vnYmd(b.completedAt);
      theoNgay.set(k, (theoNgay.get(k) ?? 0) + 1);
    }
    console.log(`  ${"ngày".padEnd(14)}${"buổi chốt".padStart(12)}`);
    for (const k of [...theoNgay.keys()].sort()) {
      console.log(`  ${k.padEnd(14)}${String(theoNgay.get(k) ?? 0).padStart(12)}`);
    }
    console.log(`\n  Tổng ${chotGanDay.length} buổi chốt trong 14 ngày.`);
    console.log(
      "  ⚠️ KHÔNG tách được tự-đóng / bấm-tay — xem chú thích ở mã nguồn mục này.",
    );
  }

  console.log("\n[backlog] Xong. Không ghi gì.");
}

main()
  .catch((e) => {
    console.error("[backlog] lỗi:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
