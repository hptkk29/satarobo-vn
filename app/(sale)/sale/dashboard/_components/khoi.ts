/**
 * Site Sale — lớp CSS của một "khối" trên màn `/sale/dashboard`.
 *
 * Ở file riêng vì ba component của màn đều dùng: chép chuỗi này vào từng nơi là
 * cách chắc chắn để ba khối trôi lệch nhau sau vài lần sửa — đúng lỗi mà đợt
 * 28/08 phải đi dẹp ở bảng dữ liệu (mật độ rải vào từng màn thay vì nằm ở CSS).
 *
 * Số đo lấy đúng của màn chủ `app/(sale)/sale/page.tsx` để hai màn liền kề nhau
 * trông là một sản phẩm: `rounded-xl` + viền + nền thẻ + `--bong-the` (bóng CÓ
 * offset, không phải quầng sáng bao quanh).
 *
 * ⚠️ KHÔNG dùng `KhungDuLieu` cho các khối này. Khung đó là bề mặt của MỘT màn
 *    dữ liệu (đầu · lọc · thân · chân) và luật của nó là "một màn = một khung,
 *    không lồng khung trong khung". Bảng điều khiển vốn là NHIỀU khối ngang
 *    hàng, nên nó dùng đúng khuôn `section` mà màn chủ đang dùng.
 */
export const LOP_KHOI =
  "rounded-xl border border-border bg-card p-4 shadow-[var(--bong-the)]";
