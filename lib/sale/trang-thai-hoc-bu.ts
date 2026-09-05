/**
 * Site Sale — nhãn + THANG MÀU NGỮ NGHĨA cho trạng thái nhu cầu học bù.
 *
 * ── Vì sao file này tồn tại (04/09/2026) ────────────────────────────────────
 * Chủ dự án chốt 04/09: màn `/sale/hoc-bu` TÁCH BẢN RIÊNG, không mount lại
 * component của khu quản trị nữa. Hai bảng `STATUS_BADGE` / `STATUS_LABEL` gõ
 * tay trong `app/(admin)/admin/hoc-bu/_components/makeup-row.tsx` KHÔNG export
 * được (chúng là hằng nội bộ của component), nên nhãn phải nằm ở một chỗ dùng
 * chung — chỗ đó là file này.
 *
 * ⚠️ ĐÂY LÀ BẢN ĐÔI CÓ CHỦ ĐÍCH. Nhãn ở đây phải KHỚP TỪNG CHỮ với `STATUS_LABEL`
 *    của component nói trên. Đổi nhãn một bên mà quên bên kia thì hai site gọi
 *    cùng một trạng thái bằng hai cái tên — kiểu trôi lệch tệ nhất vì không có
 *    lỗi nào nổ ra.
 *
 * ⚠️ TONE KHỚP ĐÚNG bản admin, không tự ý xếp lại: `PENDING`→warning,
 *    `SCHEDULED`→info, `COMPLETED`→success, `CANCELLED`→muted. Khác biệt duy nhất
 *    là ĐƯỜNG ĐI: admin ghép class Tailwind ngay trong JSX, site Sale đi qua
 *    `<StatusPill tone={…}>` — luật `lib/sale/ky-luat-mau.test.ts`.
 *
 * ⚠️ Bảng KHÔNG phải `Record` đầy đủ vì `MakeupNeed.status` là `String` trong
 *    schema chứ không phải enum — không có gì để typecheck bắt hộ. Giá trị lạ rơi
 *    về chính chuỗi đó + tone `muted`, y như bản admin (`STATUS_LABEL[s] ?? s`).
 *
 * Hàm THUẦN: không đọc DB, không đọc env, không đụng `Date` — nên client
 * component import được mà không kéo theo Prisma.
 */
import type { PillTone } from "@/components/admin/ui/status-pill";

/** Khớp từng chữ với `STATUS_LABEL` ở `app/(admin)/admin/hoc-bu/_components/makeup-row.tsx`. */
const NHAN: Record<string, string> = {
  PENDING: "Chờ xếp bù",
  SCHEDULED: "Đã xếp bù",
  COMPLETED: "Đã bù xong",
  CANCELLED: "Đã huỷ",
};

const TONE: Record<string, PillTone> = {
  // Việc DUY NHẤT trên màn này đòi người trực động tay: chưa xếp được buổi bù.
  PENDING: "warning",
  // Đã xếp — còn một nhịp nữa (đánh dấu đã bù), nhưng không phải việc gấp.
  SCHEDULED: "info",
  COMPLETED: "success",
  // Đã huỷ: lùi về sau mắt, đừng tô đỏ. Đỏ để dành cho thứ hỏng, không phải thứ
  // đã kết thúc theo đúng ý người dùng.
  CANCELLED: "muted",
};

export function nhanTrangThaiHocBu(trangThai: string): string {
  return NHAN[trangThai] ?? trangThai;
}

export function toneTrangThaiHocBu(trangThai: string): PillTone {
  return TONE[trangThai] ?? "muted";
}
