// lib/auth/managed-centers.ts — A-01-6b (bất biến `L-A6`): "các cơ sở người này đang QUẢN LÝ".
//
// VÌ SAO CÓ FILE NÀY (26/08/2026 — vá lỗ do chính A-01-6 mở ra):
// Bản A-01-6 đo "cơ sở đang quản lý" bằng phép AND của hai vế, và CẢ HAI đều đo sai thứ:
//
//   (1) `actor.visibleCenterIds` — tầm nhìn ĐỌC gộp của MỌI vai. `buildActor` cho
//       `rowCenters = everyCenter` với BẤT KỲ vai nào neo ở HO/ROOT (`lib/auth/actor.ts`,
//       nhánh `hoRoot`), nên chỉ cần kiêm một vai Hội sở là vế này thành "mọi cơ sở".
//   (2) `passesScope("Class"|"Student", …)` — tầm nhìn theo MODEL, khớp quyền theo TIỀN TỐ
//       action (`lib/db-scope.ts` `getModelPrefixes`/`getModelVisibleCenterIds`). Một quyền
//       CHỈ-ĐỌC như `classes:view-all` / `students:view-all` đến từ VAI KHÁC cũng làm vế này
//       nở ra, vì nó không biết quyền đó thuộc vai nào.
//
// Hai vế cùng nở theo vai kiêm nhiệm ⇒ AND không cắt được gì. Hai ca đo được:
//   · CENTER_MANAGER@CS1 kiêm CENTER_ACCOUNTANT@CS2 (`prisma/seed-roles.ts` — vai kế toán
//     cơ sở mang `students:view-all` + `classes:view-all`): cổng GHI mở ở CS2, nơi người
//     này chỉ là kế toán. Chốt buổi / sửa điểm danh / chấm bài / chấm năng lực ở CS2.
//   · `roles = [CENTER_MANAGER, MARKETING]`, ô "Đơn vị" = CS1: `planOrgRoleTargets`
//     (`lib/auth/legacy-role-map.ts`) LUÔN neo MARKETING → `HO_MARKETING @ HO`, và L-A5
//     (`lib/auth/org-anchor-rules.ts`) chỉ cấm CENTER_MANAGER ở HO nên cấu hình này HỢP LỆ.
//     Hệ quả: `isHoLevel` ⇒ vế (1) = mọi cơ sở; `HO_MARKETING` mang `classes:view-all`
//     GLOBAL tại HO ⇒ `centerScope: "ALL"` ⇒ vế (2) = mọi cơ sở. Quản lý một cơ sở ghi được
//     lên buổi học của cơ sở chưa từng thấy. Đường ACCOUNTANT/HR neo HO cho kết quả y hệt.
//
// PHÉP ĐO ĐÚNG: chỉ nhìn các permission SINH RA TỪ CHÍNH VAI đang xét. `PermEntry` mang
// `roleCode` + `centerScope` tính theo ĐÚNG dòng `UserOrgRole` đẻ ra nó (`buildActor`:
// `centerScope: hoRoot ? "ALL" : rowCenters`, với `rowCenters` = cơ sở trong subtree của
// đơn vị neo ∪ WorkScope). Lọc theo `roleCode` là cách duy nhất tách được "cơ sở tôi làm
// QUẢN LÝ" khỏi "cơ sở tôi tình cờ ĐỌC được vì kiêm một vai khác".
//
// Tập trả về LUÔN LÀ CON của `actor.visibleCenterIds` (mọi `rowCenters` đều được đổ vào
// `visible` trong cùng vòng lặp) ⇒ AND thêm vế (1) là thừa, và giữ nó lại chỉ tạo ảo giác
// "hai lớp bảo vệ". Cũng KHÔNG cộng `grantsAllow`: grant per-user không đi qua `UserOrgRole`
// nên không phải là "được giao quản lý cơ sở" — đây là thứ giữ cho ca "grant per-user
// `classes:edit` vẫn TỪ CHỐI cơ sở thứ ba" đứng vững.
//
// THUẦN + LÁ: chỉ import KIỂU (erase lúc compile) ⇒ không tạo vòng, unit-test không cần DB.
import type { Actor } from "@/lib/auth/actor";

/**
 * Các cơ sở mà `actor` đang giữ vai `roleCode`.
 *
 * `"ALL"` chỉ xuất hiện khi chính vai đó được neo tại đơn vị cấp HO/ROOT — nghĩa "vai
 * cross-center theo chức năng" của `buildActor`. Với `CENTER_MANAGER` thì L-A5
 * (`roleBlockedAtHoRoot`) đã chặn CẢ HAI đường ghi tạo ra cấu hình đó, nên trên dữ liệu
 * đúng chuẩn hàm này trả danh sách hữu hạn.
 */
export function centerIdsManagedByRole(actor: Actor, roleCode: string): "ALL" | string[] {
  const out = new Set<string>();
  for (const p of actor.permissions) {
    if (p.roleCode !== roleCode) continue;
    if (p.centerScope === "ALL") return "ALL";
    if (Array.isArray(p.centerScope)) p.centerScope.forEach((c) => out.add(c));
  }
  return [...out];
}

/**
 * `actor` có đang giữ vai `roleCode` TẠI cơ sở `centerId` không?
 *
 * `centerId` rỗng/null → `false` (fail-closed): bản ghi chưa gắn cơ sở không thuộc phạm vi
 * quản lý của ai cả, và đây là hành vi cũ của mọi cổng gọi hàm này.
 */
export function roleManagesCenter(
  actor: Actor,
  roleCode: string,
  centerId: string | null | undefined,
): boolean {
  if (!centerId) return false;
  const scope = centerIdsManagedByRole(actor, roleCode);
  return scope === "ALL" || scope.includes(centerId);
}
