/**
 * S-2a — CỔNG GỬI TIN MESSENGER RA KHÁCH. HIỆN ĐANG ĐÓNG, CÓ CHỦ ĐÍCH.
 *
 * Vì sao đóng: repo **chưa có** một lời gọi nào ra Meta Send API. `graph.facebook.com`
 * chỉ xuất hiện ở `lib/crm/ads-insights.ts` (số liệu quảng cáo) và `lib/tracking.ts`
 * (Conversions API) — không chỗ nào đẩy tin nhắn tới `POST /{page-id}/messages`.
 * Biên bản đã ký (`docs/sale-hub/bien-ban-chot-14-cau-2108.md`, Q16) cũng ghi rõ
 * hội thoại khách từ Facebook là kênh **"một chiều"**.
 *
 * Trước đợt vá này, `replyAction` vẫn ghi một dòng `MessengerMessage` hướng OUT
 * rồi trả `{ ok: true }` và giao diện bắn toast "Đã gửi". Hai thiệt hại thật:
 *   1. Người trực tin là đã trả lời khách — khách không nhận được gì.
 *   2. `recordOutgoingMessage` set `MessengerConversation.respondedAt`, mà
 *      `lib/crm/sla.ts` dùng đúng cột đó để bật cảnh báo SLA-0 (chậm phản hồi).
 *      Mỗi lần bấm "Gửi" là **tắt cảnh báo** của một khách chưa ai trả lời.
 *
 * CÒN THIẾU GÌ ĐỂ MỞ (tích hợp ngoài, cần chủ dự án cấp quyền Meta):
 *   • Page Access Token **theo từng `pageId`** (repo mới có 1 biến chung
 *     `META_PAGE_ACCESS_TOKEN`, trong khi `FacebookPageMapping` cho phép nhiều Page).
 *   • Quyền `pages_messaging` + App review của Meta.
 *   • Xử lý cửa sổ nhắn tin 24h + message tag (ngoài 24h gửi thẳng là bị chặn/khoá Page).
 *   • Đối chiếu `mid` Meta trả về với `MessengerMessage` để biết tin đã đi thật.
 *
 * KHI NỐI XONG: đặt cờ dưới thành `true` và gỡ chốt chặn ở
 * `app/(admin)/admin/crm/messenger/actions.ts` + `_components/reply-box.tsx`.
 * Test `[S-2a] chốt chặn nguồn` ghim hai chiều nên không bỏ quên được bên nào.
 */
// Khai kiểu `boolean` tường minh (không để TS suy ra kiểu literal `false`): nếu để
// literal thì mọi nhánh sau `if (!CỜ) return` bị coi là mã chết, lint/typecheck kêu
// và người đọc tưởng đường gửi đã bị xoá — trong khi nó chỉ đang chờ mở cờ.
export const MESSENGER_SEND_SAN_SANG: boolean = false;

/** Câu nói với người dùng khi họ bấm "Gửi". Ngắn, đúng sự thật, chỉ việc phải làm. */
export const LY_DO_CHUA_GUI_DUOC =
  "Chưa nối kênh gửi tin — đang chờ cấu hình Meta. Tin nhắn KHÔNG tới được khách, " +
  "vui lòng trả lời trực tiếp trên Trang Facebook.";
