// lib/auth/managed-centers.ts — bất biến `L-A6`: "các cơ sở người này THỰC SỰ được ghi".
//
// Hai phép đo, cùng một luật, khác nhau ở TRỤC lọc `PermEntry`:
//   · `roleManagesCenter(actor, roleCode, centerId)`   — A-01-6b, cổng gắn với MỘT vai
//     (buổi học/học viên: chỉ CENTER_MANAGER). Trục = `PermEntry.roleCode`.
//   · `actionCoversCenter(actor, action, centerId)`    — A-01-6c, cổng mà NHIỀU vai đi
//     qua (LMS bài tập/đề thi: TRAINING + CENTER_MANAGER + TEACHER). Trục = `PermEntry.action`.
// Cả hai đều KHÔNG gom theo tiền tố model. Về `grantsAllow` thì KHÁC NHAU, có chủ đích:
// trục `roleCode` không bao giờ đọc (câu hỏi là "giữ VAI nào ở đâu"), trục `action` có đọc
// nhưng chỉ trong `visibleCenterIds` và không bao giờ thành "ALL" — xem lý lẽ tại chỗ.
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
// "hai lớp bảo vệ". Trục `roleCode` cũng KHÔNG cộng `grantsAllow`: grant per-user không đi
// qua `UserOrgRole` nên không phải là "được giao quản lý cơ sở" — đây là thứ giữ cho ca
// "grant per-user `classes:edit` vẫn TỪ CHỐI cơ sở thứ ba" đứng vững.
//
// THUẦN + LÁ: chỉ import KIỂU (erase lúc compile) ⇒ không tạo vòng, unit-test không cần DB.
import type { Actor } from "@/lib/auth/actor";

/**
 * Các cơ sở mà `actor` đang giữ vai `roleCode`.
 *
 * `"ALL"` chỉ xuất hiện khi chính vai đó được neo tại đơn vị cấp HO/ROOT — nghĩa "vai
 * cross-center theo chức năng" của `buildActor`.
 *
 * ⚠️ ĐỪNG đọc câu trên thành "với `CENTER_MANAGER` thì không bao giờ có ALL". L-A5
 * (`roleBlockedAtHoRoot`) rào các ĐƯỜNG GHI sinh ra cấu hình đó, và tính tới 26/08/2026
 * có BA đường chứ không phải hai:
 *   1. `assignUserOrgRole`      — lib/auth/rbac-service.ts (gán vai tay);
 *   2. `reconcileUserOrgRoles`  — lib/auth/org-role-sync.ts (đổi `roles[]`/ô "Đơn vị");
 *   3. `luuViTri`               — app/(admin)/admin/nhan-su/vi-tri/_actions.ts (VỊ TRÍ
 *      công việc mang bộ RoleDef; `loadPositionRoleRows` (lib/org/positions.ts) đổ
 *      PositionRole vào `buildActor` ĐÚNG khuôn `UserOrgRoleRow`, nên một vị trí neo tại
 *      Hội sở mà tích `CENTER_MANAGER` cho ra `centerScope: "ALL"` y hệt đường 1/2).
 * Đường (3) trước 26/08 KHÔNG có rào nào và cũng không cảnh báo gì — nó vừa được rào
 * bằng chính `roleBlockedAtHoRoot`.
 *
 * ⚠️ Hàm này KHÔNG tự lọc: dữ liệu CŨ tạo trước bản vá (Position @HO có CENTER_MANAGER,
 * hoặc `UserOrgRole` gán tay trước A-01-3) vẫn cho "ALL". Rà bằng runbook, không bằng
 * cách nới/siết ở đây.
 */
export function centerIdsManagedByRole(actor: Actor, roleCode: string): "ALL" | string[] {
  return unionCenterScope(actor, (p) => p.roleCode === roleCode);
}

/**
 * Các cơ sở mà `actor` đang giữ CHÍNH quyền `action` — khớp **đúng chuỗi** action, không
 * theo tiền tố.
 *
 * ── VÌ SAO CÓ HÀM NÀY (A-01-6c, 26/08/2026) ────────────────────────────────────────
 * Cùng một bất biến L-A6, nhưng cho nhóm cổng mà "vai đang xét" KHÔNG phải một vai duy
 * nhất: `assignments:*` / `exams:*` được ba vai khác nhau nắm (`prisma/seed-roles.ts` —
 * TRAINING soạn/sửa/chấm toàn LMS; CENTER_MANAGER và TEACHER chỉ `*:grade`), nên
 * `centerIdsManagedByRole` không dùng được. Trục đo đúng ở đó là CHÍNH ACTION mà cổng
 * thô (`checkPermission`) vừa kiểm — "cơ sở mà tôi đang giữ quyền đang thực hiện".
 *
 * Vẫn là một phép đo KHÔNG NỞ, y hệt hàm trên, vì cùng đọc `PermEntry`:
 *   · khớp đúng chuỗi action ⇒ `classes:view-all` của vai KIÊM NHIỆM (kế toán cơ sở,
 *     HO_MARKETING…) không lọt vào — khác `getModelVisibleCenterIds`, vốn gom theo TIỀN
 *     TỐ model nên một quyền CHỈ-ĐỌC của vai khác cũng làm nó nở (`lib/db-scope.ts`);
 *   · grant per-user KHÔNG BAO GIỜ trả "ALL" ⇒ một dòng `UserPermissionGrant` ALLOW không
 *     biến cổng thành toàn hệ thống. `getModelVisibleCenterIds` bật `hasAll = true` chỉ vì
 *     grant khớp tiền tố (db-scope.ts:248-253) — đó đúng là lỗ ngược chiều đang vá.
 *
 * `"ALL"` chỉ xuất hiện khi chính quyền đó được neo tại đơn vị cấp HO/ROOT — nghĩa
 * "cross-center theo chức năng" của `buildActor`, ví dụ Đào tạo (toàn LMS) tại HO.
 */
export function centerIdsGrantedByAction(actor: Actor, action: string): "ALL" | string[] {
  const fromRoles = unionCenterScope(actor, (p) => p.action === action);
  if (fromRoles === "ALL") return "ALL";
  // ── A-01-6d (26/08/2026) — GRANT PER-USER, vá lỗ do chính A-01-6c mở ra ───────────
  // Cổng THÔ và cổng CƠ SỞ phải đọc CÙNG một nguồn quyền. `checkPermission` → `can()` cho
  // ALLOW ngay khi `actor.grantsAllow` có action (lib/auth/can.ts:54). Bản 26/08 sáng bỏ
  // hẳn `grantsAllow` ở đây ⇒ grant cho ĐÚNG action này trả tập RỖNG ⇒ `actionCoversCenter`
  // false ở MỌI cơ sở: quyền cấp riêng từng người vô hiệu hoàn toàn, mà lỗi lại hiện ra
  // dưới dạng "Đề thi không tồn tại" trong khi màn /admin/users/[id]/permissions vẫn khoe
  // ALLOW. Đó là siết ngoài ý định, không phải bất biến L-A6.
  //
  // Ranh giới GIỮ NGUYÊN: grant không phải "được giao quản lý cơ sở" nên KHÔNG trả "ALL".
  // Nó chỉ có hiệu lực trong tầm nhìn cơ sở sẵn có của chính người được cấp
  // (`visibleCenterIds`) — cấp `exams:edit` cho nhân sự CS1 thì họ sửa được đề của CS1,
  // không phải của cơ sở họ chưa từng thấy. Trục `roleCode` (`centerIdsManagedByRole`)
  // vẫn TUYỆT ĐỐI không đọc `grantsAllow`: ở đó câu hỏi là "giữ VAI nào ở đâu".
  if (!actor.grantsAllow.has(action)) return fromRoles;
  return [...new Set([...fromRoles, ...actor.visibleCenterIds])];
}

/** Hợp `centerScope` của các `PermEntry` thoả `keep` — "ALL" nuốt mọi thứ còn lại. */
function unionCenterScope(actor: Actor, keep: (p: Actor["permissions"][number]) => boolean) {
  const out = new Set<string>();
  for (const p of actor.permissions) {
    if (!keep(p)) continue;
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

/**
 * Điều kiện `where` cho màn DANH SÁCH của một cổng đo bằng `roleManagesCenter`.
 *
 * ── VÌ SAO CÓ HÀM NÀY (A-01-6d, 26/08/2026) ────────────────────────────────────────
 * Bản A-01-6b chuyển các cổng GHI sang `roleManagesCenter` nhưng để nguyên các trang
 * LIỆT KÊ, vốn lọc bằng `session.user.centerId` — MỘT cơ sở neo chụp lúc đăng nhập. Hai
 * thước khác nhau trên cùng một nghiệp vụ, và cái sai không kêu:
 *   · quản lý giữ CS1+CS2 mở /admin/don-tu: đơn của CS2 KHÔNG BAO GIỜ hiện ⇒ không ai bấm
 *     Duyệt ⇒ buổi đáng lẽ bị huỷ/gán GV dạy thay vẫn chạy như thường;
 *   · chiều ngược lại: vai neo @CS2 nhưng JWT còn `centerId = "cs-1"` ⇒ danh sách hiện đơn
 *     CS1, bấm Duyệt thì action trả "Đơn thuộc cơ sở khác".
 * Dùng CHUNG một hàm với cổng ghi là cách duy nhất để hai bên không trôi lệch lần nữa.
 *
 * `"ALL"` → KHÔNG thêm điều kiện (vai cross-center theo chức năng). Ngược lại luôn trả
 * `centerId IN (…)`, kể cả khi tập RỖNG: "không giữ vai đó ở đâu cả" nghĩa là không thấy
 * dòng nào — KHÔNG được suy thành "bỏ lọc" (đó chính là hành vi cũ của
 * `...(centerScope ? { centerId: centerScope } : {})` khi `User.centerId` null).
 *
 * ⚠️ Bản ghi `centerId = null` nằm NGOÀI `IN (…)` ⇒ không hiện. Cố ý, và khớp
 * `roleManagesCenter` (fail-closed trên centerId rỗng).
 */
export function centerWhereManagedByRole(
  actor: Actor,
  roleCode: string,
): { centerId?: { in: string[] } } {
  const scope = centerIdsManagedByRole(actor, roleCode);
  return scope === "ALL" ? {} : { centerId: { in: scope } };
}

/**
 * `actor` có đang giữ quyền `action` TẠI cơ sở `centerId` không?
 *
 * `centerId` rỗng/null → `false` (fail-closed) — cùng lý do với `roleManagesCenter`:
 * bản ghi chưa gắn cơ sở không thuộc phạm vi ghi của ai cả. Chỗ gọi nào có ngoại lệ
 * hợp lệ cho `null` (vd đề thi NGÂN HÀNG dùng chung 2 cơ sở) thì tự xử lý nhánh `null`
 * TRƯỚC khi hỏi hàm này, đừng nới hàm này.
 */
export function actionCoversCenter(
  actor: Actor,
  action: string,
  centerId: string | null | undefined,
): boolean {
  if (!centerId) return false;
  const scope = centerIdsGrantedByAction(actor, action);
  return scope === "ALL" || scope.includes(centerId);
}
