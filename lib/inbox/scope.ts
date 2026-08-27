// lib/inbox/scope.ts — TẦM NHÌN THEO ĐƠN VỊ cho hộp thư đa kênh.
//
// 🔴 VÌ SAO FILE NÀY TỒN TẠI: ba bảng `Inbox*` mang `orgUnitId` chứ KHÔNG mang
// `centerId` (luật cứng Nền Hệ thống #3), mà `scopedDb` chỉ auto-scope theo
// `centerId`. Nghĩa là hộp thư KHÔNG được cách ly tự động — đi qua `scopedDb` ở
// đây cho "đúng nếp" là tự lừa mình: nó sẽ trả về mọi dòng của mọi cơ sở.
//
// Cách ly thật nằm ở hai thứ, và chỉ hai thứ:
//   1. Mọi `where` đọc đều gộp `inboxOrgScopeWhere(actor)`.
//   2. Mọi thao tác trên MỘT dòng đều qua `passesInboxScope(actor, row)` trước.
// `lib/inbox/cong-truy-cap.test.ts` đỏ nếu có file ngoài `lib/inbox/` chạm thẳng
// `db.inbox*` — đó là lưới thứ ba, chống việc quên hai thứ trên.
//
// ── `orgUnitId = NULL` nghĩa là gì ở đây ─────────────────────────────────────
// CHƯA NỐI ĐƯỢC ĐƠN VỊ — hội thoại mồ côi. Trạng thái BÌNH THƯỜNG, không phải lỗi:
// webhook `user_send_text` của Zalo không bao giờ kèm SĐT, nên tin đầu tiên của một
// người lạ luôn chưa biết thuộc cơ sở nào.
//
// Nhóm NULL hiện với MỌI người mở được hộp thư. Đây là quyết định có chủ đích, cùng
// lý do `BankTransaction` được xếp `NULL_CHUA_KHOP` (`lib/org/center-bridge.ts`):
// giấu tồn đọng khỏi chính người phải xử lý nó là cách chắc chắn nhất để nó không
// bao giờ được xử lý — khách nhắn vào rồi không ai trả lời.
// Đánh đổi phải nói thẳng: một hội thoại chưa gán đơn vị thì Sale cơ sở khác cũng
// đọc được. Nó hết mồ côi ngay khi được nối `Lead` hoặc được gán người phụ trách.
import type { Actor } from "@/lib/auth/actor";

/** Hình dạng `where` gộp được vào truy vấn Prisma của cả ba bảng `Inbox*`. */
export type InboxOrgScopeWhere =
  | Record<string, never>
  | { OR: [{ orgUnitId: { in: string[] } }, { orgUnitId: null }] };

/** Actor nhìn xuyên đơn vị? (Quản trị tối cao, hoặc có vai neo ở HO/ROOT.) */
export function nhinXuyenDonVi(actor: Actor): boolean {
  return actor.isSuperAdmin || actor.isHoLevel;
}

/**
 * Mảnh `where` giới hạn tầm nhìn. GỘP vào truy vấn bằng `AND`, đừng trải phẳng —
 * trải phẳng thì một `OR` khác trong cùng truy vấn sẽ NUỐT mất mảnh này.
 *
 * @example
 *   where: { AND: [{ deletedAt: null }, inboxOrgScopeWhere(actor)] }
 */
export function inboxOrgScopeWhere(actor: Actor): InboxOrgScopeWhere {
  if (nhinXuyenDonVi(actor)) return {};
  return {
    OR: [{ orgUnitId: { in: actor.visibleOrgUnitIds ?? [] } }, { orgUnitId: null }],
  };
}

/**
 * Actor được đụng vào dòng này không. Dùng TRƯỚC mọi `update`/xoá mềm —
 * `inboxOrgScopeWhere` chỉ lọc đường ĐỌC, y hệt giới hạn đã biết của `scopedDb`.
 *
 * Fail-closed: dòng không tồn tại (null/undefined) ⇒ false.
 */
export function passesInboxScope(
  actor: Actor,
  row: { orgUnitId: string | null } | null | undefined,
): boolean {
  if (!row) return false;
  if (nhinXuyenDonVi(actor)) return true;
  if (row.orgUnitId === null) return true; // mồ côi — ai cũng phải xử lý được
  return (actor.visibleOrgUnitIds ?? []).includes(row.orgUnitId);
}
