// lib/push/allowlist.ts — loại thông báo nào ĐƯỢC đẩy Web Push. Web Push Đợt 4.
//
// THUẦN: không DB, không mạng, không `server-only`.
//
// ── VÌ SAO LÀ DANH SÁCH TRẮNG, KHÔNG PHẢI DANH SÁCH ĐEN ────────────────────────────────
// Chuông nhân sự có ~55 tiền tố `dedupeKey` đang chạy thật và mỗi đợt lại thêm. Nếu mặc định
// là GỬI thì mọi loại thông báo mới ra đời sẽ tự động rung điện thoại của người ta mà không ai
// quyết định điều đó — người thêm một `notifyStaff` cho việc nội bộ hoàn toàn không biết mình
// vừa bật một kênh đẩy. Cái giá của một đợt push rác không phải tiền: người dùng tắt quyền
// thông báo ở CẤP TRÌNH DUYỆT, và code không có cách nào xin lại — nút "Bật thông báo" từ đó
// chỉ hiện dòng "Bạn đã chặn thông báo".
//
// Hai loại đã đo thấy là mìn nếu mở bừa:
//  · `lead.nhap_lai:` nhét `now.getTime()` vào khoá (`lib/lead/assign-lead.ts`) ⇒ khách điền
//    form 10 lần là 10 mục chuông MỚI, không trần nào chặn — 10 lần rung máy.
//  · 4 nơi đang bật `reopen: true` (điểm danh sửa lần hai, v.v.) kéo bản đã đọc về chưa đọc
//    ⇒ mỗi lần sửa là một lần `canRung` ⇒ một lần đẩy.
// Allowlist tự vô hiệu hoá cả hai mà không phải sửa nơi gọi.
//
// ⚠️ THÊM TIỀN TỐ VÀO ĐÂY LÀ QUYẾT ĐỊNH VẬN HÀNH, không phải dọn code. Trước khi thêm, trả lời
// được: loại này một ngày sinh bao nhiêu mục cho MỘT người, và người đó có cần biết trong vòng
// một phút không? Không trả lời được thì đừng thêm.

/**
 * Tiền tố `dedupeKey` được đẩy. Đợt 4 đúng MỘT giá trị.
 *
 * `lead.moi:` — sale được chia một lead mới. Đây là loại duy nhất mà "chậm 30 phút" có giá
 * thật (khách đang so 3 trung tâm), và tần suất bị chặn sẵn: một lead sinh đúng một mục cho
 * đúng một người, `@@unique([userId, dedupeKey])` lo phần còn lại.
 */
export const TIEN_TO_DUOC_DAY: readonly string[] = ["lead.moi:"];

/**
 * Khoá này có được đẩy push không.
 *
 * So bằng TIỀN TỐ chứ không bằng đoạn trước dấu `:` — cố ý trùng cách khoá của
 * `lib/notifications/catalog.ts`. Nếu tách bằng `split(":")[0]` thì `lead.moi` và
 * `lead.moi_gi_do` sẽ khác nhau ở catalog nhưng giống nhau ở đây: hai bảng cùng đọc một khoá
 * mà luật khớp lệch nhau là đúng loại lệch không ai nhìn thấy cho tới lúc gửi nhầm.
 */
export function duocDayPush(dedupeKey: string): boolean {
  if (!dedupeKey) return false;
  return TIEN_TO_DUOC_DAY.some((t) => dedupeKey.startsWith(t));
}
