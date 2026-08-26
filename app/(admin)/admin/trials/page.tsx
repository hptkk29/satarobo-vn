// /trials — MÀN CŨ "Học thử" (hệ V1). ĐÃ GỘP vào "Lớp Trial" (26/08/2026).
//
// Hệ có hai khái niệm trial song song từ R7-02 và chúng KHÔNG BAO GIỜ gặp nhau:
//   • V1 `TrialClass`  — một dòng = một CUỘC HẸN của lead (màn này).
//   • V2 `TrialClassV2` + buổi + ghi danh — theo TỪNG CON (màn /trial-classes cũ).
// Bảng Trial của site giáo viên chỉ đọc V2, nên mọi lịch đặt qua màn V1 là giáo viên
// KHÔNG thấy. Chủ dự án 26/08 chốt gộp cả hai về MỘT màn duy nhất: "Lớp Trial"
// (`/lop-trial`) — nó ôm cả hai: tab "Lịch hẹn" (V1) và danh sách lớp (V2).
//
// Dữ liệu V1 chuyển sang V2 bằng `scripts/gop-trial-v1-sang-v2.ts` (có --dry-run,
// idempotent). Script CHẠY TAY — xem "Việc chạy tay sau merge" trong phiếu nghiệm thu.
//
// Vì sao CHUYỂN HƯỚNG chứ không xoá thư mục:
//   1. `/trials` còn nằm trong bookmark, trong thông báo đã gửi (không sửa hồi tố được),
//      và trong link của các phiếu cũ. Ném 404 vào mặt người đang làm việc là cách tệ
//      nhất để thông báo một quyết định gộp.
//   2. Gỡ segment khỏi ADMIN_ROUTE_SEGMENTS thì admin host bật link cũ về public rồi 404.
//   3. `actions.ts` CỐ Ý còn nằm lại: nó là mốc mà `lib/lead/status-trail.test.ts` và
//      `lib/notifications/catalog.test.ts` soi để chốt "không còn đường đổi trạng thái
//      nào ghi kiểu riêng". Xoá file là hai bộ test đó mất mốc.
//
// Gỡ hẳn khi nào? Cùng lúc drop bảng `TrialClass` — đúng nếp 2-phase của repo (additive
// trước, drop sau khi prod ổn định), VÀ khi không còn thông báo cũ nào trong DB trỏ tới
// đây. Đừng gỡ theo lịch, hãy gỡ theo số đo.
import { redirect } from "next/navigation";

export const metadata = { title: "Học thử | Admin" };

export default function TrialsRedirectPage() {
  // Thẳng tới đích, KHÔNG qua /trial-classes: màn đó cũng chỉ là một chuyển hướng nữa
  // về /lop-trial, đi hai chặng là thêm một vòng round-trip cho không.
  redirect("/lop-trial");
}
