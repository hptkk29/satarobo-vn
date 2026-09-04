/**
 * Site Sale — DỮ LIỆU cho màn `/sale/sinh-nhat` (Sinh nhật học viên).
 *
 * ══ ĐÂY LÀ BẢN ĐÔI CỦA TRUY VẤN TRONG `app/(admin)/admin/sinh-nhat/page.tsx` ══
 *
 * Chủ dự án chốt 04/09/2026: màn site Sale tách bản riêng, không dùng chung
 * component với khu quản trị. Bản admin truy vấn thẳng trong `page.tsx` nên
 * không có hàm nào để gọi lại; chép vào đây để phần trôi lệch nằm ở MỘT tệp có
 * tên, thay vì nằm trong JSX của hai trang.
 *
 * ── DÙNG LẠI ĐƯỢC GÌ Ở `lib/` (KHÔNG chép) ─────────────────────────────────
 *   `scopedDb(actor)`                          — cách ly cơ sở
 *   `vnDayKey` · `shiftDayKey` · `vnDayStartUtc` · `formatDayKeyDMY`
 *                                              — lib/students/birthday-dates
 * Phần chép thật sự chỉ còn 1 truy vấn Prisma + bảng nhãn ZNS.
 *
 * ── NỢ TRÔI LỆCH: sửa bên nào cũng phải sửa bên kia ─────────────────────────
 *   1. CỬA SỔ HIỂN THỊ `[hôm nay − 7 ngày, hôm nay + 31 ngày)`. Bảy ngày đã qua
 *      là CÓ CHỦ ĐÍCH (soát việc bị lỡ), đừng "dọn" thành chỉ ngày tương lai.
 *   2. `orderBy: [celebrationDate asc, birthdayDate asc]` + `take: 300`.
 *   3. Bốn nhãn ZNS. `SIMULATED` phải nói rõ **chưa gửi thật** — đọc nhầm ô này
 *      là không ai chúc bé, mà bảng vẫn trông như đã xong việc.
 *
 * ── KHÔNG CÓ PII Ở ĐÂY, VÀ ĐÓ LÀ CHỦ ĐÍCH ──────────────────────────────────
 * Màn này KHÔNG đọc `phone`/`parentPhone` của ai: nó chỉ cần tên học viên để
 * người đi chúc biết chúc ai. Muốn thêm SĐT phụ huynh vào bảng thì phải đi qua
 * `canViewLeadPii()` + `maskPhone` như `lib/sale/messenger.ts` — bài kiểm
 * `lib/lead/lead-pii-callsites.test.ts` quét cả `lib/sale/**` và sẽ đỏ nếu quên.
 */
import "server-only";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import {
  formatDayKeyDMY,
  shiftDayKey,
  vnDayKey,
  vnDayStartUtc,
} from "@/lib/students/birthday-dates";
import type { PillTone } from "@/components/admin/ui/status-pill";

/** Một dòng của bảng — đã tính sẵn mọi thứ, tầng vẽ không phải suy luận gì. */
export type DongSinhNhat = {
  id: string;
  studentId: string;
  tenHocVien: string;
  /** "26/09/2026" — đã định dạng ở máy chủ để hai site không lệch múi giờ. */
  ngaySinhNhat: string;
  /** `null` = chưa xếp được buổi nào (HV chưa xếp lớp / lớp đã kết thúc). */
  ngayToChuc: string | null;
  /** `null` = có ngày nhưng không gắn buổi cụ thể ⇒ không có gì để bấm vào. */
  maBuoiToChuc: string | null;
  /** Đúng hôm nay là sinh nhật bé — dòng được đánh dấu HÔM NAY. */
  homNay: boolean;
  /** Buổi tổ chức KHÁC ngày sinh nhật (xếp vào buổi học gần nhất trước đó). */
  toChucTruoc: boolean;
  /** Buổi tổ chức đã qua mà chưa ai bấm "Đã chúc" — việc bị lỡ. */
  daLo: boolean;
  daChuc: boolean;
  /** `null` = chưa tới ngày gửi. */
  zns: { nhan: string; tone: PillTone } | null;
};

/**
 * Nhãn + tone cho `StudentBirthdayGreeting.znsStatus`.
 *
 * ⚠️ Bản admin gõ tay chuỗi class cho từng trạng thái
 * (`bg-state-success-soft text-state-success-ink`…). Ở site Sale, màu trạng thái
 * đi qua thang ngữ nghĩa của `StatusPill` — `lib/sale/ky-luat-mau.test.ts` cấm
 * class màu rời, và một site có hai thang màu là một site có hai sự thật.
 *
 * `SKIPPED` là `muted` chứ không phải `warning`: "chưa có mẫu/SĐT" là tình trạng
 * dữ liệu, không phải việc người trực phải làm gấp. `SIMULATED` mới là cảnh báo
 * thật — hệ thống nghĩ đã xong mà phụ huynh không nhận gì.
 */
const ZNS: Record<string, { nhan: string; tone: PillTone }> = {
  SENT: { nhan: "Đã gửi", tone: "success" },
  SIMULATED: { nhan: "Mô phỏng (chưa gửi thật)", tone: "warning" },
  SKIPPED: { nhan: "Bỏ qua (mẫu/SĐT chưa có)", tone: "muted" },
  FAILED: { nhan: "Lỗi gửi", tone: "danger" },
};

export async function layDanhSachSinhNhat({
  actor,
  bayGio = new Date(),
}: {
  actor: Actor;
  /** Tiêm được để bài kiểm không phụ thuộc đồng hồ thật. */
  bayGio?: Date;
}): Promise<{ dong: DongSinhNhat[]; khoaHomNay: string }> {
  const khoaHomNay = vnDayKey(bayGio);

  // Cách ly cơ sở do `scopedDb` lo — `StudentBirthdayGreeting` ∈ SCOPED_MODELS.
  const rows = await scopedDb(actor).studentBirthdayGreeting.findMany({
    where: {
      birthdayDate: {
        gte: vnDayStartUtc(shiftDayKey(khoaHomNay, -7)),
        lt: vnDayStartUtc(shiftDayKey(khoaHomNay, 31)),
      },
    },
    orderBy: [{ celebrationDate: "asc" }, { birthdayDate: "asc" }],
    take: 300,
    select: {
      id: true,
      birthdayDate: true,
      celebrationDate: true,
      celebrationSessionId: true,
      celebratedAt: true,
      znsStatus: true,
      student: { select: { id: true, name: true } },
    },
  });

  const dong = rows.map((r): DongSinhNhat => {
    const khoaSinhNhat = vnDayKey(r.birthdayDate);
    const khoaToChuc = r.celebrationDate ? vnDayKey(r.celebrationDate) : null;
    return {
      id: r.id,
      studentId: r.student.id,
      tenHocVien: r.student.name,
      ngaySinhNhat: formatDayKeyDMY(khoaSinhNhat),
      ngayToChuc: khoaToChuc ? formatDayKeyDMY(khoaToChuc) : null,
      maBuoiToChuc: r.celebrationSessionId,
      homNay: khoaSinhNhat === khoaHomNay,
      toChucTruoc: khoaToChuc !== null && khoaToChuc !== khoaSinhNhat,
      // So chuỗi khoá ngày (YYYY-MM-DD) chứ không so `Date`: cùng cách bản admin
      // làm, và là cách duy nhất không lệch khi buổi tổ chức nằm đúng ranh giới
      // nửa đêm giờ VN.
      daLo: r.celebratedAt === null && khoaToChuc !== null && khoaToChuc < khoaHomNay,
      daChuc: r.celebratedAt !== null,
      zns: r.znsStatus ? (ZNS[r.znsStatus] ?? null) : null,
    };
  });

  return { dong, khoaHomNay };
}
