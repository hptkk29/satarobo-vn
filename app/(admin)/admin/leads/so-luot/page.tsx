// Sổ lượt chia lead — ĐÃ GỘP vào màn "Quản lý chia lead" (29/08/2026).
//
// Bảng cũ chỉ đọc, chỉ có đúng cột "ai đã tới lượt bao nhiêu lần" — nay là cột
// "Lượt đã nhận" của tab Cấu hình pool, đứng cạnh thứ người xem luôn hỏi tiếp:
// tổng lead đang giữ, lần chia gần nhất, và nút bật/tắt.
//
// Giữ route để đường dẫn cũ (dấu trang, link trong thông báo đã gửi) không vỡ.
import { redirect } from "next/navigation";

export default function SoLuotRedirectPage() {
  redirect("/quan-ly-chia-lead");
}
