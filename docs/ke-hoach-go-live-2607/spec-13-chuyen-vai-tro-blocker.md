# #13 — "Chuyển vai trò": phân tích chặn + đường đi khi mở khoá (trình Kiệt)

> Ngày 09/07/2026 · lane #13 (P1, câu 11 BGĐ) · **KHÔNG code bây giờ** — 3 tiền đề chưa đạt (mục 3).
> Nguồn câu 11: nút "Chuyển vai trò" dưới "Hồ sơ cá nhân"; chọn vai → sang **đúng khu vực**; login vào
> khu vực của **vai trò chính**; quyền **cộng dồn (union)** không đổi khi chuyển.

## 1. Vì sao chưa code được (2 phát hiện từ audit code 09/07)

### 1.1 "Gán role HO không nhận" — KHÔNG phải lỗi quyền, nhưng CÓ staleness tầng session
**Hoà giải với README §63 (đã ký 07/07):** đúng — đây KHÔNG phải lỗi permission. `HO_*` chỉ tồn tại ở RBAC v2
(`UserOrgRole`+`RoleDef`); runtime chạy v1 matrix (`RBAC_V2_ENABLED=false`) nên v1 path không đọc `HO_*`;
assignment ĐÃ ghi đúng DB, kích hoạt tại flip #09. `actor.ts` union cũng KHÔNG lỗi (gộp HO+CS đúng).

**Điểm #13 phải lưu (không mâu thuẫn README):** menu đọc vai trò từ đâu? Nếu đọc `session.user.roles`
(=`User.roles`) thì có **staleness tầng session** — 2 writer không đồng bộ:

| Writer | Ghi gì | KHÔNG ghi gì | Hệ quả |
|---|---|---|---|
| `assignUserOrgRole()` (`lib/auth/rbac-service.ts:171-221`) — UI org-roles | `UserOrgRole` | **không** đụng `User.roles`, **không** bump `tokenVersion` | Session/JWT (`decideRoute` + `hasRole`) KHÔNG biết role mới → "gán HO mà không nhận" ở tầng routing/menu |
| `changeEmployeeRoleAction()` (`app/(admin)/admin/nhan-su/actions.ts:418-505`) | `User.role`+`roles`+`tokenVersion++` | **không** tạo `UserOrgRole` | `resolveActor` (scope CHỈ từ `UserOrgRole`) cấp **0 quyền** cho role đó |

→ Không có gì sync `User.roles ⇄ UserOrgRole`. Ghi tech-debt RC-A: `Document/R7-LMS-test-session-record.md:112`.
Menu "Chuyển vai trò" đọc từ `session.user.roles` sẽ **hiện thiếu/sai vai trò** đúng vì bug này.

### 1.2 Chuyển vai staff↔staff KHÔNG phải "host-switch" — mà là "đổi panel trong admin"
`decideRoute()` phân khu theo **union role**: mọi role ≠ PARENT → host **admin**; chỉ PARENT → **portal**;
chỉ TEACHER (flag ON) → **teacher**. **KHÔNG có host riêng cho từng role staff.**
⇒ Toại (`TRAINING@HO` + `CENTER_MANAGER@CS1`) — cả 2 vai đều host `admin`. "Chuyển khu vực Đào tạo ↔ QL CS1"
là **đổi panel/ngữ cảnh TRONG admin** (việc của #10 dashboard đa-vai + `activeArea`), **không** là điều hướng host.
"Chuyển vai trò" theo nghĩa host chỉ có hiệu lực khi bắc **qua ranh giới** PARENT ↔ TEACHER ↔ staff.

## 2. Hệ quả: code lúc này = dead code
- Flag `TEACHER_SITE_ENABLED` **OFF** ⇒ TEACHER cũng map host admin ⇒ **không user nào** có ≥2 khu-vực-host phân biệt.
- Menu chỉ hiện khi ≥2 khu vực ⇒ với dữ liệu hiện tại **menu không bao giờ hiện** → không test/demo được.

## 3. Tiền đề mở khoá (đủ 3 mới code)
- [ ] **Fix desync 1.1** — chọn 1 (mục 5). Đây là sửa auth/session → làm **task riêng, sau go-live**, không gộp gần mốc 26/07.
- [ ] **`TEACHER_SITE_ENABLED` = ON** (#06 flip) — để host teacher khác admin, "chuyển vai" mới có hiệu lực nhìn thấy.
- [ ] **#10 panel đa-vai + `activeArea`** — cho ca staff↔staff (Toại) đổi panel trong admin (host không đổi).

## 4. Đường đi khi mở khoá (để không phải điều tra lại)
1. **Nguồn danh sách vai trò = `resolveActor().orgRoles`** (role×orgUnit ACTIVE), **KHÔNG** `session.user.roles` (né bug 1.1).
   Join tên: pattern có sẵn ở `app/(admin)/admin/users/[id]/org-roles/page.tsx:32-53` (`listUserOrgRoles`+`listRoles`+`orgUnit.findMany`).
2. **Menu**: `components/admin/topbar.tsx:52-79` — chèn `DropdownMenuItem "Chuyển vai trò"` giữa "Hồ sơ cá nhân" và Đăng xuất;
   CHỈ hiện khi có **≥2 khu vực đích phân biệt** (không phải ≥2 role — 2 role cùng host admin thì ẩn ở giai đoạn host-switch).
3. **Map role→khu vực**: viết helper thuần `listSwitchableAreas(actor)` theo đúng quy tắc `decideRoute`
   (PARENT→portal, TEACHER-only+flag→teacher, staff→admin) → trả các host phân biệt + `HOST_BY_KIND` (`proxy.ts:30-35`).
   **Đây là mảnh code an toàn ĐẦU TIÊN** (pure + unit test), có thể làm trước cả khi menu lên — dùng chung với #10.
4. **Login redirect**: đã do `decideRoute` lo (route-policy `STAFF_HOME=/dashboard`, `PORTAL_HOME=/`, `TEACHER_HOME=/`).
   Nếu cần `primaryRole` do user tự chọn → thêm `User.primaryRoleId` (nullable, additive) — hiện **chưa có** field này.
5. **Không nâng quyền vòng**: chỉ liệt kê vai trò user THỰC có trong `UserOrgRole`; host-access vẫn do `decideRoute` gác (đã unit-test).

## 5. Fix desync (1.1) — 2 phương án cho Kiệt chọn
- **(A) Sync tại nguồn ghi**: `assignUserOrgRole`/`revoke` cập nhật luôn `User.roles` (union từ UserOrgRole) + `tokenVersion++`;
  `changeEmployeeRoleAction` tạo/thu `UserOrgRole` tương ứng. Ưu: 2 hệ luôn khớp. Nhược: đụng 2 writer + refresh token.
- **(B) Bỏ `User.roles` khỏi đường quyết định**: `decideRoute`/`hasRole` đọc role từ `UserOrgRole` (như `resolveActor`),
  `User.roles` chỉ còn cache hiển thị. Ưu: 1 nguồn sự thật. Nhược: đụng auth callback + login-redirect, rủi ro cao hơn — **sau go-live**.

## 6. DoD (giữ nguyên plan gốc, chỉ code khi mục 3 xong)
- [ ] User 1 vai trò (1 khu vực) → KHÔNG thấy "Chuyển vai trò".
- [ ] Toại: thấy 2 vai, chuyển được (khi #06 flip + #10 panel) — Đào tạo(HO) ↔ QL CS1; login đáp xuống vai chính.
- [ ] Quyền union giữ nguyên khi chuyển; e2e: chuyển sang khu vực không quyền → `decideRoute` chặn.

## 7. Hai mảnh #13 — đừng nhầm (chốt 09/07)
Có **2 file khác concept**, cùng phục vụ câu 11 nhưng ở 2 tầng khác nhau:

| File | Concept | Trạng thái |
|---|---|---|
| `lib/auth/active-role.ts` + `app/(admin)/admin/_actions/active-role.ts` + `components/admin/role-switcher.tsx` | **phase-1 ĐÃ ship**: bộ lọc vai trò cookie-based **trong admin** — chỉ đổi MENU + panel dashboard, **cùng host, không đổi quyền** (user chốt 09/07). | ✅ chạy thật |
| `lib/auth/switchable-areas.ts` (`listSwitchableAreas`) | **tương lai**: chuyển **cross-host** admin↔teacher↔portal (mục 4.3), probe qua `decideRoute`. | ⏳ chưa wire |

→ active-role = đổi ngữ cảnh **trong** admin (host không đổi); switchable-areas = bắc **qua** ranh giới host. Không chồng chéo.

## Trạng thái
🔴 **CHẶN** bởi 3 tiền đề (mục 3) cho phần MENU cross-host. ✅ Đã ship phase-1 (menu/panel trong admin) qua
`active-role.ts` (mục 7). ✅ Mảnh an toàn cross-host ĐÃ LÀM: helper `lib/auth/switchable-areas.ts`
`listSwitchableAreas` (mục 4.3) — pure, probe qua `decideRoute`, Vitest 11/11 (commit 4218da5), **hiện chưa import
ở đâu** (building block đã test, chờ `TEACHER_SITE_ENABLED` ON / #10 wiring), dùng chung #10.
Còn lại của #13 (menu cross-host + login primaryRole) chờ 3 tiền đề.
