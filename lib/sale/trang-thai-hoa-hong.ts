/**
 * Site Sale — thang màu cho trạng thái KỲ hoa hồng.
 *
 * ── BẢN ĐÔI CỦA CÁI GÌ ──────────────────────────────────────────────────────
 * Bản gốc là một dòng trong `app/(admin)/admin/crm/commission/page.tsx`:
 *
 *     <Badge variant={s.status === "APPROVED" ? "default" : "secondary"}>{s.status}</Badge>
 *
 * ⚠️ CHỮ giữ nguyên: bản admin in THẲNG mã enum (`DRAFT` / `APPROVED` /
 *    `REOPENED`), không dịch. Tệp này KHÔNG dịch hộ. Dịch là đổi NỘI DUNG màn,
 *    đúng thứ đợt tách 04/09/2026 không được phép làm — và tệ hơn: kế toán đang
 *    đối chiếu bảng kê theo mã đó với người ở khu quản trị, hai bên gọi hai tên
 *    là cãi nhau. Muốn có nhãn tiếng Việt thì phải đổi CẢ HAI khu cùng lúc, và
 *    đó là một yêu cầu riêng.
 *
 * ── VÌ SAO CHỈ HAI MÀU CHO BA TRẠNG THÁI ───────────────────────────────────
 * Bản admin cũng chỉ có hai: `APPROVED` một kiểu, còn lại một kiểu. Và đó khớp
 * đúng cách màn này hành xử — ba nút bên phải rẽ nhánh y hệt (`status !==
 * "APPROVED"` → "Tính lại" + "Duyệt"; ngược lại → "Mở lại"). Cho `REOPENED` một
 * màu thứ ba là dựng một khác biệt mà chính màn hình không có.
 *
 * Ánh xạ sang thang ngữ nghĩa (chữ mang GIAI ĐOẠN, màu mang MỨC CẦN ĐỘNG TAY):
 *   `APPROVED`            → success — kỳ đã chốt sổ, không còn việc.
 *   `DRAFT` / `REOPENED`  → warning — kỳ đang chờ duyệt, có người phải làm gì đó.
 *
 * ⚠️ KHÔNG dùng tone `brand` cho `APPROVED` dù bản admin cho nó `variant="default"`
 *    (tức màu thương hiệu). Trên site Sale tím là màu của NÚT và MỤC ĐANG ĐỨNG;
 *    gán thêm nghĩa "kỳ đã duyệt" là hỏng cả hai nghĩa (tiền lệ
 *    `trang-thai-dang-ky.ts`, TRANSFERRED brand→muted).
 *
 * Hàm THUẦN: không DB, không env, không `Date`.
 */
import type { CommissionStatus } from "@prisma/client";
import type { PillTone } from "@/components/admin/ui/status-pill";

/** `Record` đầy đủ — thêm trạng thái mà quên khai là lỗi typecheck, không phải lỗi lúc chạy. */
const TONE_THEO_TRANG_THAI: Record<CommissionStatus, PillTone> = {
  DRAFT: "warning",
  REOPENED: "warning",
  APPROVED: "success",
};

export function toneKyHoaHong(trangThai: CommissionStatus): PillTone {
  return TONE_THEO_TRANG_THAI[trangThai];
}
