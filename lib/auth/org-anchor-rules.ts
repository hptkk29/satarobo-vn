// lib/auth/org-anchor-rules.ts — A-01-3 (bất biến `L-A5`): vai nào KHÔNG được neo ở HO/ROOT.
//
// VÌ SAO LÀ MODULE RIÊNG (25/08/2026): luật này có HAI đường ghi, không phải một.
//   1. GÁN TAY  — `assignUserOrgRole` (`lib/auth/rbac-service.ts`), màn /admin/users/[id]/org-roles.
//   2. ĐỒNG BỘ  — `reconcileUserOrgRoles` (`lib/auth/org-role-sync.ts`), chạy khi admin sửa
//      `roles[]` hoặc ô "Đơn vị" ở /admin/users/[id]/edit và /admin/nhan-su.
// Bản trước chỉ rào đường (1). Đường (2) đi thẳng qua `planOrgRoleTargets`
// (`lib/auth/legacy-role-map.ts`: `CENTER_MANAGER → { org: "CENTER" }` ánh xạ sang
// `anchorOrgUnitId` bất kể đơn vị đó là gì) và picker đơn vị CÓ liệt kê Hội sở, nên chỉ cần
// đổi ô "Đơn vị" của một QLCS sang "Hội sở" là sinh `UserOrgRole(CENTER_MANAGER @ HO)`.
//
// Hậu quả của đúng MỘT dòng đó: `buildActor` bật `isHoLevel` (`lib/auth/actor.ts` — "bất kỳ
// role nào tại HO/ROOT"), và `visibleCenterIds` thành MỌI cơ sở còn sống. Quản lý một cơ sở
// lặng lẽ thấy lead / học viên / thanh toán của toàn hệ thống. Không cảnh báo, không audit
// bất thường.
//
// THUẦN + LÁ: không import gì (kể cả @prisma/client) ⇒ cả rbac-service lẫn org-role-sync
// import được mà không tạo vòng. Một luật, một chỗ định nghĩa — hai bản sao là hai bản sẽ
// trôi lệch, và bản trôi lệch chính là lỗ hổng này.

/**
 * Danh sách CỐ Ý chỉ có `CENTER_MANAGER`: §6.10 KHÔNG cấm neo tại HO nói chung, vì HR cần
 * tạo nhân sự Hội sở (HO_ACCOUNTANT tại HO là việc thường ngày). Đây KHÔNG phải rào bịt hết
 * đường `isHoLevel` — đừng mô tả nó như vậy.
 */
const HO_ROOT_FORBIDDEN_ROLE_CODES: readonly string[] = ["CENTER_MANAGER"];

/** Mã RoleDef này có bị cấm neo tại đơn vị cấp HO/ROOT không? */
export function roleBlockedAtHoRoot(roleCode: string): boolean {
  return HO_ROOT_FORBIDDEN_ROLE_CODES.includes(roleCode);
}

/** `OrgUnit.type` này có phải cấp Hội sở/gốc không? */
export function isHoRootOrgType(orgType: string): boolean {
  return orgType === "HO" || orgType === "ROOT";
}

/**
 * Câu giải thích DÙNG CHUNG cho cả hai đường ghi — người dùng gặp cùng một lời khuyên dù họ
 * đang ở màn gán vai hay màn sửa hồ sơ tài khoản.
 */
export function loiNeoHoRoot(roleCode: string, orgType: string): string {
  return (
    `Không được neo vai ${roleCode} tại đơn vị cấp ${orgType}: chỉ cần MỘT dòng vai ở ` +
    "HO/ROOT là tài khoản thành cấp Hội sở và thấy dữ liệu của mọi cơ sở. Hãy neo vai " +
    "này tại từng đơn vị cấp CENTER (hoặc REGION nếu các cơ sở cùng một vùng)."
  );
}
