// #13 (câu 11 BGĐ) — "Chuyển vai trò" cho người kiêm nhiều vai (Toại: QL cơ sở + GV +
// Đào tạo; Kiệt: SUPER_ADMIN + GV).
//
// ⚠️ ĐÂY LÀ TIỆN ÍCH GIAO DIỆN, KHÔNG PHẢI CƠ CHẾ BẢO MẬT.
// Quyền KHÔNG đổi: `resolveActor` vẫn union mọi UserOrgRole, `can()`/`checkPermission()`
// vẫn xét toàn bộ vai trò. Chuyển vai chỉ lọc MENU + panel dashboard mặc định, để người
// kiêm nhiều vai không phải bơi trong menu của cả 3 vai cùng lúc.
//
// Muốn thu hẹp quyền thật theo vai đang chọn (least-privilege) thì phải nhét `activeRole`
// vào JWT + lọc trong `resolveActor` (đang React.cache theo userId → phải đổi cache key)
// + đổi `scopedDb` theo vai. Việc đó ĐỔI HÀNH VI v2 ⇒ reset đồng hồ shadow và làm flip #09
// mang thêm rủi ro. Đã chốt 09/07: giai đoạn này chỉ đổi giao diện.
import type { Role } from "@prisma/client";
import { getEffectiveRoles } from "@/lib/auth/permissions";

export const ACTIVE_ROLE_COOKIE = "sr_active_role";

/**
 * Vai trò đang dùng, ĐÃ kiểm chứng nằm trong danh sách vai trò user thực sự giữ.
 * Cookie do client set → không tin; giá trị lạ/không sở hữu → trả null (dùng union).
 */
export function resolveActiveRole(
  user: { role?: Role | string | null; roles?: (Role | string)[] | null },
  cookieValue: string | undefined | null,
): Role | null {
  if (!cookieValue) return null;
  const owned = getEffectiveRoles(user);
  return owned.find((r) => r === cookieValue) ?? null;
}

/**
 * `user` dùng để lọc menu: nếu đang chọn 1 vai thì chỉ xét vai đó. Grant riêng
 * (`UserPermissionGrant` ALLOW) GIỮ NGUYÊN — nó gắn với con người, không gắn với vai.
 */
export function menuUserForRole<T extends { role?: Role | string | null; roles?: (Role | string)[] | null }>(
  user: T,
  activeRole: Role | null,
): T {
  if (!activeRole) return user;
  return { ...user, role: activeRole, roles: [activeRole] };
}
