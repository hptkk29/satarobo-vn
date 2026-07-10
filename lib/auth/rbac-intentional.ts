// #09 — danh sách THU HẸP CÓ CHỦ ĐÍCH khi flip RBAC v2 (nguồn sự thật DUY NHẤT).
//
// Trước đây nằm trong rbac-parity.test.ts; tách ra vì shadow-report cũng cần nó:
// v1 runtime (đang authoritative) vẫn cấp các quyền này và UI vẫn hiện nút, nên người
// giữ role bị siết sẽ ĐẺ LỆCH `v1=true/v2=false` MỖI LẦN chạm trang cho tới khi flip.
// Đó là lệch ĐÚNG THIẾT KẾ — cổng flip phải đếm "lệch cần xử lý" (ngoài danh sách này),
// không phải đếm thô, nếu không cổng không bao giờ về 0.
//
// ⚠️ Mỗi dòng ở đây là một quyền NGƯỜI THẬT sẽ MẤT ngay khi flip — chỉ thêm khi đã
// được ký (phiếu/chat chốt), ghi rõ nguồn.
import type { Role } from "@prisma/client";

/**
 * INTENTIONAL[role] = các action role đó có ở v1 nhưng CỐ Ý không có ở v2.
 * Nguồn: de-xuat-scope-v2-center-manager-teacher.md (Kiệt duyệt 09/07/2026)
 * + addendum HR Phương án A (06/07) + user chốt leads:delete (09/07), câu 5-6 (09/07).
 */
export const INTENTIONAL: Partial<Record<Role, readonly string[]>> = {
  HR: [
    "employees:create",
    "employees:view-personal",
    "employees:view-salary",
    "payroll:view",
    // TTS Nhân sự không phụ trách nội dung marketing / vinh danh.
    "blog:view",
    "courses:view",
    "honors:create",
    "honors:edit",
    "honors:view",
    "news:view",
  ],
  /** Kiệt duyệt 09/07/2026 — de-xuat-scope-v2-center-manager-teacher.md §3.3. */
  CENTER_MANAGER: [
    // Nội dung đối ngoại → HO_MARKETING
    "blog:create", "blog:edit",
    "news:create", "news:edit", "news:publish", "news:delete",
    "site-content:view", "site-content:edit",
    "honors:create", "honors:edit", "honors:settings",
    "emails:view", "emails:manage",
    // Chương trình & giáo án → TRAINING
    "courses:create", "courses:edit", "course-packages:edit",
    "lesson-change:approve", "trials:config",
    // Tiền & kho tập trung → HO_ACCOUNTANT
    "payments:manage", "orders:manage", "installments:approve",
    "vouchers:manage", "products:manage",
    "inventory:edit", "inventory:audit", "kits:edit",
    // Nhân sự & tuyển dụng → CENTER_HR
    "employees:edit", "jobs:create", "jobs:edit",
    // Cấu hình toàn hệ thống → SUPER_ADMIN
    "holidays:edit",
    // Xoá cứng → SUPER_ADMIN. QL dùng enrollments:cancel (CLAUDE.md).
    "students:delete", "enrollments:delete",
    // User chốt 09/07 (đồng ý sau khi được hỏi lại): không hard-delete lead.
    "leads:delete",
  ],
  /** Kiệt duyệt 09/07/2026 — §4.4 + câu 5 (giữ satacoin) và câu 6 (bỏ inventory:movement). */
  TEACHER: [
    "completions:manage", // QL cơ sở xác nhận hoàn thành khoá
    "sessions:create", // GV chốt buổi (sessions:edit), không xếp lịch — câu 48
    "inventory:movement", // câu 6: "không"
  ],
};

/**
 * Mismatch (v1=true, v2=false) của user có ĐÚNG THIẾT KẾ không: mọi role v1 cấp
 * action đó cho user đều đã ký siết. Còn ≥1 nguồn cấp không nằm trong danh sách
 * → lệch THẬT, phải xử lý.
 */
export function isIntentionalMismatch(
  action: string,
  userRoles: readonly string[],
  v1Permissions: Record<string, readonly string[]>,
): boolean {
  const sources = (v1Permissions[action] ?? []).filter(
    (r) => r !== "SUPER_ADMIN" && userRoles.includes(r),
  );
  if (sources.length === 0) return false; // v1 không cấp qua role thường → không phải narrowing
  return sources.every((r) => INTENTIONAL[r as Role]?.includes(action) ?? false);
}
