# NHÓM 02 — Guard sweep checklist (T1b) + đóng gap flip-readiness (T2)

> Sinh ra từ `scripts/check-action-guards.mjs` (chạy `node scripts/check-action-guards.mjs`)
> + rà tay các trường hợp script không tự tin (helper gián tiếp, service-layer check).
> Ngày chạy: 04/07/2026. Phạm vi quét: mọi file có directive `'use server'` dưới
> `app/` + `lib/` (không tính comment) + mọi `app/api/**/route.ts`.

## 1. Kết quả script (sau khi vá)

```
[check-action-guards] scanned 142 files, 422 exported functions (2 pre-resolved-actor helpers skipped).
PASS — all exported async Server Actions / API routes have a guard.
```

- **Trước khi vá script (naive, chỉ check literal `auth(` trong THÂN hàm, không theo call-graph):** 263 "vi phạm" — nhưng ~99% là **false positive**: đa số action file dùng pattern `async function requireXxx() { const session = await auth(); ...; return session.user }` cục bộ trong file rồi mọi action export gọi `requireXxx()` — literal `auth(` không nằm trong thân hàm export nên bị đếm nhầm.
- **Sau khi thêm resolve theo call-graph** (đệ quy: hàm export gọi hàm nào, hàm đó có gọi `auth()`/known guard không) **+ whitelist helper cross-file đã verify** (`requireActiveStudent`, `assertOwnsStudent`, `getPortalContext` — `lib/portal/session.ts`; `verifyCronAuth` — `lib/cron/auth.ts`) **+ loại trừ hàm nhận `actor: Actor`/`user: {...role}` đã resolve sẵn** (helper ownership, không phải entry point): còn đúng **1 vi phạm thật** → đã vá (xem §2).

## 2. Vi phạm THẬT đã vá (T1b)

| File | Hàm | Vấn đề | Vá |
|---|---|---|---|
| `app/(admin)/admin/enrollments/_actions.ts` | `checkPrerequisites(studentId, courseId)` | Export Server Action, KHÔNG `auth()`/`assertCan` — bất kỳ ai (kể cả không đăng nhập, nếu có network path tới action reference) có thể tra cứu trạng thái hoàn thành khoá tiên quyết của MỘT studentId bất kỳ (oracle nhỏ, IDOR đọc nhẹ). | Thêm `const session = await auth()` + `assertCan(session.user, "enrollments:edit")` đầu hàm (khớp quyền `createEnrollment` cùng file). |

## 3. Gap "auth() có nhưng permission-check lệch matrix" — phát hiện + vá (không nằm trong scope tự động của script, rà tay theo §4 mục 5 kỹ thuật)

Trong lúc rà, phát hiện 2 file dùng **mảng role hard-code cục bộ** (`CAN_EDIT = [...]`) thay vì `assertCan()` từ `lib/auth/permissions.ts` — LỆCH so với ma trận `PERMISSIONS` (nguồn đúng nhất):

| File | Hàm | Trước (hard-code) | Matrix `permissions.ts` (đúng) | Vá |
|---|---|---|---|---|
| `app/(admin)/admin/honors/actions.ts` | `createHonorAction`, `updateHonorAction`, `toggleFeaturedAction`, `togglePublishedAction`, `createTimelineAction`, `updateTimelineAction` | `CAN_EDIT=[SUPER_ADMIN, CENTER_MANAGER]` | `honors:create`/`honors:edit` = `[SUPER_ADMIN, CENTER_MANAGER, HR, MARKETING]` | Đổi sang `assertCan(session.user, "honors:create"/"honors:edit")` — HR + MARKETING giờ đúng quyền theo matrix. `honors:settings` (updatePageContentAction) giữ nguyên phạm vi (SUPER_ADMIN/CENTER_MANAGER — không đổi hành vi). |
| `app/(admin)/admin/jobs/actions.ts` | `createJobAction`, `updateJobAction`, `duplicateJobAction`, `changeJobStatusAction`, `deleteJobAction` | `CAN_EDIT=[SUPER_ADMIN, CENTER_MANAGER]`; `deleteJobAction` chỉ `SUPER_ADMIN` | `jobs:create`/`jobs:edit` = `[SUPER_ADMIN, CENTER_MANAGER, HR]`; `jobs:delete` = `[SUPER_ADMIN, HR]` | Đổi sang `assertCan(session.user, "jobs:create"/"jobs:edit"/"jobs:delete")` — HR giờ đúng quyền theo matrix (kể cả xoá JD). |

Cả 2 module này KHÔNG nằm trong danh sách cấm (students/classes/leads/portal hình-ảnh-bài-giảng-bài-tập-yêu-cầu/parent-feedback) nên đã sửa trực tiếp.

## 4. Đã RÀ nhưng KHÔNG phải gap (loại false-positive, ghi lại để khỏi rà lại)

| File | Hàm | Vì sao KHÔNG phải gap |
|---|---|---|
| `app/(admin)/admin/news/_actions.ts` | `createNews`/`updateNews`/`deleteNews`/`toggleNewsPublished` | `requireAdmin()` cục bộ check role ∈ `[SUPER_ADMIN, CENTER_MANAGER, MARKETING]` — khớp đúng matrix `news:create/edit` (không lệch). |
| `app/(admin)/admin/attendance/_actions.ts` | `markAttendance`, `deleteAttendance` | `requireTeacherOrAdmin()` + `canManageSessionClass()` (owner-scope lớp) — có guard, chỉ không dùng literal `auth(`/`assertCan` text nên script false-positive ban đầu. |
| `app/(admin)/admin/cau-hinh-van-hanh/actions.ts` | `saveGlobalSettingAction`, `saveCenterSettingAction` | Uỷ quyền check cho `lib/settings/service.ts` (`setGlobalSetting`/`setCenterSetting`) — có `actor.isSuperAdmin`/role CENTER_MANAGER check trong service. |
| `app/(admin)/admin/roles/actions.ts`, `app/(admin)/admin/users/[id]/org-roles/actions.ts` | tất cả action RBAC mutation | Uỷ quyền cho `lib/auth/rbac-service.ts` (`requireManage`/`requireAssign` dùng `can(actor, "roles:manage"/"roles:assign")`) + `logRbacAudit` + `reason` bắt buộc qua Zod schema — **đã đáp ứng T2 mục 4 (RbacAuditLog + reason)** từ trước, không cần vá thêm. |
| `app/(admin)/admin/orders/_components/_installment-approval-actions.ts` | `approveInstallmentPlanAction`, `rejectInstallmentPlanAction` | `lib/orders/installments.ts` tự `assertCan("installments:approve")` (ghi rõ trong comment đầu file) + wrapper đã `scopedDb` chống IDOR chéo cơ sở. |
| `app/(admin)/admin/settings/actions.ts` | `changePassword` | Tự-phục vụ (đổi mật khẩu CHÍNH MÌNH), scope theo `session.user.id`, xác minh mật khẩu cũ trước — không cần action-matrix (không thao tác dữ liệu người khác). |
| `app/api/admin/upload-url/route.ts`, `upload/route.ts`, `upload-delete/route.ts` | `POST`/`DELETE` | Có `allowedRoles` array check role trước khi ký URL R2 — guard tồn tại, chỉ không match regex ban đầu. |
| `app/(portal)/portal/**/actions.ts` (ho-so, bai-tap, bai-thi, danh-gia, yeu-cau, khao-sat) | mọi action | Dùng `requireActiveStudent()`/`getPortalContext()`/`assertOwnsStudent()` (`lib/portal/session.ts`) — auth() + role PARENT + ownership đã baked-in trong helper; portal không dùng ma trận admin `can()` (đúng thiết kế — PARENT không có action nào trong PERMISSIONS). |
| `app/api/scorm/asset/[...path]/route.ts`, `app/api/scorm/runtime/route.ts` | `GET`/`POST` | `auth()` trực tiếp + vé HMAC (`verifyScormTicket`)/`canOpenScorm` ownership check. |
| `app/(admin)/admin/tin-nhan/_actions.ts` | `staffOwnsEnrollment(actor, enrollmentId)` | Helper nhận `actor: Actor` đã resolve sẵn từ caller — không phải entry point (loại theo `PRE_RESOLVED_PARAM_RE`). |
| `app/(admin)/admin/sessions/[id]/_actions.ts` | `canManageSessionClass(user, cls)` | Helper nhận `user: {id, role, centerId}` đã resolve sẵn — tương tự trên. |
| `app/(admin)/admin/enrollments/_actions.ts` | (đã vá — xem §2) | — |
| Cron routes (11 file `app/api/cron/**/route.ts`) | `GET` | Đều gọi `verifyCronAuth(req)` (`lib/cron/auth.ts` — check `CRON_SECRET` header) — không phải literal `CRON_SECRET` trong route nhưng vẫn có guard qua helper import. |
| Webhook routes (`app/api/webhooks/meta/messenger`, `app/api/public/webhook/{facebook,google-form,zalo}`) | `GET`/`POST` | Check `verify_token`/`WEBHOOK_*_SECRET`/`verifyMetaSignature` — đúng chuẩn riêng cho webhook (không cần session auth). |
| `app/api/leads/route.ts` | `POST` | Public lead-capture có chủ đích (rate-limit + honeypot + dedupe) — loại trừ tường minh theo technical.md §3 mục 4. |

## 5. T2 — Đóng gap flip-readiness

### a) Độ phủ action-registry

`lib/auth/action-registry.ts` → `ACTION_REGISTRY = ALL_ACTIONS = Object.keys(PERMISSIONS)` (import trực tiếp từ `permissions.ts`) — **tự động 100% đồng bộ với matrix v1** theo thiết kế (không cần khai báo tay).

Rà thêm: mọi call-site `can(actor, "...")`/`assertCan(actor, "...")` dùng chữ ký **v2** (`lib/auth/can.ts`, nhận `action: string` — KHÔNG có compile-time check như v1) — grep toàn repo (`app/`, `lib/`, loại `.test.ts`) ra 16 lời gọi, tất cả action string đều **đã có** trong `ACTION_REGISTRY`:
`report-cards:review`, `training:manage`, `classes:view-all`, `classes:edit`, `classes:view-own`, `media:upload`, `media:view`, `media:approve`, `parent-requests:manage`, `sessions:view`, `employees:view-all`, `hr_attendance:adjust`, `leads:view-all`, `leads:view-own`, `enrollments:view-all`, `enrollments:view-own`.

→ **Không có action nào đang dùng mà thiếu khai báo trong registry.** Không cần thêm dòng nào (đúng theo yêu cầu "chỉ khai báo, không tự gán quyền" — trường hợp này không phát sinh việc phải làm).

### b) UserPermissionGrant — rà DENY grant tồn tại

- Grep `prisma/**/*.ts` (seed scripts) cho `grant: "DENY"` / `"DENY"` gắn với `userPermissionGrant` → **0 kết quả**. Không có seed nào tạo grant DENY.
- **CHƯA kiểm tra được dữ liệu PROD thật** (không có quyền truy vấn Supabase prod trong phiên này — theo `.claude/rules/prisma-db.md`, việc này cần chạy ngoài sandbox với quyền mạng + xác nhận riêng). **Khuyến nghị: BGĐ/người có quyền chạy 1 query nhanh trước khi flip:**
  ```sql
  SELECT "userId", action, grant FROM "UserPermissionGrant" WHERE grant = 'DENY';
  ```
  Nếu có kết quả → theo LUAN.md rủi ro bảng "DENY grant cũ xung đột ALLOW-wins": cần convert (thu hẹp role) hoặc vô hiệu hoá TRƯỚC khi flip `RBAC_V2_ENABLED=true` (vì v2 là ALLOW-wins, không đọc DENY).

### c) ScopeType `ASSIGNED` trong `can.test.ts`

- **Trước:** `can.test.ts` có 1 dòng dựng actor với role `ASSISTANT_TEACHER` + `scopeType: "ASSIGNED"` (dòng 68) nhưng CHỈ dùng làm dữ liệu nền cho 1 test khác (`leads:view-all`) — **không có assertion nào thật sự kiểm tra hành vi của `ASSIGNED`**.
- **Đã thêm** test case mới `[NHÓM02-T2c]` (lib/auth/can.test.ts): `ASSISTANT_TEACHER` với `attendance:view` scopeType `ASSIGNED` → lớp được phân công `true`, lớp khác `false`, thiếu `target.classId` → `false` (an toàn, không suy diễn ngầm — cùng hành vi với `CLASS` vì `scopeMatches()` gộp chung nhánh `CLASS`/`ASSIGNED`).
- Test suite `lib/auth/can.test.ts`: **19/19 PASS** (18 cũ + 1 mới).

### d) RbacAuditLog + reason bắt buộc

Đã có sẵn từ A0-02 (`lib/auth/rbac-service.ts`): `createRole`/`updateRole`/`deleteRole`/`setRolePermissions`/`assignUserOrgRole`/`revokeUserOrgRole` đều `requireManage`/`requireAssign` + Zod schema bắt `reason` + `logRbacAudit(...)`. Không cần vá thêm (xem §4 bảng false-positive).

## 6. Gap CÒN TỒN (cần người khác / BGĐ quyết định)

1. **Shadow-compare chưa bật ghi trên prod thật** (L4, ngoài scope phiên này) — `check-permission.ts`/`shadow-report.ts` đã có code nhưng **0 call-site** gọi `checkPermission`/`assertPermission` trong `app/**` (toàn bộ code hiện tại vẫn gọi thẳng `can()`/`assertCan()` v1 hoặc v2 riêng lẻ, KHÔNG qua bridge song song). Muốn có báo cáo lệch v1↔v2 thật để đếm "7 ngày sạch" cần: (a) đổi call-site sang `checkPermission`, HOẶC (b) chấp nhận review thủ công matrix v1 ↔ seed `RolePermission` (việc T2 mục 2 kỹ thuật — seed RolePermission khớp matrix v1 — KHÔNG làm trong phiên này, cần soát 135 action-grant × role, khối lượng lớn, đề xuất tách phiên riêng).
2. **UserPermissionGrant DENY trên PROD** — chưa xác minh được (mục 5b) do không có quyền truy vấn DB prod trong phiên; cần BGĐ/DevOps chạy query xác nhận trước khi flip.
3. **RBAC_V2_ENABLED vẫn OFF** — đúng theo kế hoạch (chưa tới hạn 17-18/07); không đổi trong phiên này.

## 7. Việc CI

`scripts/check-action-guards.mjs` đã sẵn sàng chạy trong CI (Node script thuần, không phụ thuộc DB/network). Khuyến nghị thêm bước vào workflow CI (song song `dependency-cruiser`):
```yaml
- run: node scripts/check-action-guards.mjs
```
Script FAIL (exit 1) nếu có Server Action/API route export async không có guard reachable (trực tiếp hoặc qua helper cùng file/known cross-file helper).
