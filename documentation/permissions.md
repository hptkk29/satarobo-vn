# Phân quyền — hiện trạng mã nguồn

Tài liệu mô tả **những gì code đang làm**, không phải thiết kế mong muốn. Mọi khẳng định kèm `file:dòng`.

> ⚠️ Đọc trước 3 điều, nếu không sẽ kết luận sai toàn bộ:
> 1. **Có HAI thế hệ RBAC chạy chồng nhau.** Thế hệ cũ (A0-02/03): `RoleDef` + `RolePermission` + `UserOrgRole` + `UserPermissionGrant`. Thế hệ mới (Nền Hệ thống P0): `PermissionDescriptor` + `PermissionGrant` + `UserGroup`. Hai bảng grant trùng tên gần giống nhau nhưng **hành vi ngược nhau** ở nhánh DENY.
> 2. **Local/dev/CI chạy v1, PROD chạy v2.** Cờ `RBAC_V2_ENABLED` mặc định OFF trong code (`lib/flags.ts:7-9`). Kết quả thử quyền ở máy local KHÔNG suy ra được hành vi prod.
> 3. **`scopeType` KHÔNG phải nơi cách ly cơ sở.** Cách ly cơ sở đến từ `scopedDb`. Đặt `scopeType: CENTER` cho một action mà call-site gọi trần = **khoá trắng** vai đó (`prisma/seed-roles.ts:11-29`).

---

## 1. Danh sách vai (enum `Role`)

`prisma/schema.prisma:17-27` — enum legacy 9 giá trị, dùng cho `User.role` / `User.roles[]` và ma trận v1.

| Vai | Ý nghĩa |
|---|---|
| `SUPER_ADMIN` | Quản trị tối cao. Bypass toàn bộ `can()` v2 (`lib/auth/can.ts:53`) và bypass `scopedDb` (`lib/db-scope.ts:128-130`). |
| `CENTER_MANAGER` | Quản lý cơ sở. Đổi tên từ `MANAGER` (Phase T0.1) — có shim legacy trong JWT callback. |
| `HR` | Nhân sự. |
| `SALES_CSM` | Tư vấn & chăm sóc học viên. Đổi tên từ `SALES`. |
| `TEACHER` | Giáo viên — chỉ lớp được phân công. |
| `TRAINING` | Đào tạo — quản lý TOÀN BỘ LMS (curriculum/SCORM/câu hỏi/bài tập). KHÁC `TEACHER`. |
| `MARKETING` | Marketing. |
| `ACCOUNTANT` | Kế toán. |
| `PARENT` | Phụ huynh (portal `hocvien.satarobo.vn`), KHÔNG vào `/admin`. Là **vai quan hệ** — xem mục 10. |

**Enum `Role` KHÔNG phải danh sách vai của v2.** v2 dùng `RoleDef.code` trong DB — hiện **15 vai** seed ở `prisma/seed-roles.ts`, chỉ trùng tên 5 vai với enum:

| `RoleDef.code` | dòng | Ghi chú |
|---|---|---|
| `SUPER_ADMIN` | `prisma/seed-roles.ts:33` | `isSystem` |
| `HO_ACCOUNTANT` | `:79` | Kế toán Hội sở |
| `HO_HR` | `:127` | |
| `CENTER_HR` | `:184` | |
| `HO_MARKETING` | `:217` | |
| `TRAINING` | `:282` | |
| `HO_SALE` | `:374` | Sale Hội sở — **chỉ xem** |
| `CENTER_MANAGER` | `:400` | |
| `CENTER_CLASS_MANAGER` | `:557` | Quản lý lớp học |
| `CENTER_SALES_CSM` | `:609` | |
| `TEACHER` | `:670` | |
| `ASSISTANT_TEACHER` | `:740` | |
| `CENTER_ACCOUNTANT` | `:763` | |
| `AUDITOR` | `:785` | Kiểm toán đào tạo, chỉ đọc |
| `PARENT` | `:805` | `isSystem` |

**KHÔNG có `HO_MANAGER`** (`prisma/seed-roles.ts:2`). Ánh xạ legacy → v2 dùng khi so parity: `lib/auth/rbac-parity.test.ts:15-24` (`ACCOUNTANT→HO_ACCOUNTANT`, `MARKETING→HO_MARKETING`, `HR→CENTER_HR`, `SALES_CSM→CENTER_SALES_CSM`…).

---

## 2. Nguồn quyền — bảng nào làm gì

### 2.1 Sơ đồ quan hệ

```
THẾ HỆ CŨ (A0-02/03) — đường enforce chính hiện nay
  User ──< UserOrgRole >── RoleDef ──< RolePermission (action, scopeType)
              │                 ▲
         orgUnitId          PositionRole ──< Position ──< PositionAssignment >── User
              │                                              └──< WorkScope (orgUnitId)
           OrgUnit
  User ──< UserPermissionGrant (action, grant ALLOW|DENY)   ← per-user, TOÀN CỤC

THẾ HỆ MỚI (Nền Hệ thống P0) — cắm TRƯỚC đường cũ
  PermissionDescriptor (key) ──< PermissionGrant (subjectType ROLE|GROUP,
                                  subjectId, effect, dataScope, fieldMask)
  UserGroup ──< UserGroupMember >── User
```

### 2.2 Từng bảng

| Bảng | file:dòng | Làm gì | Sinh quyền? |
|---|---|---|---|
| `RoleDef` | `prisma/schema.prisma:405-416` | Danh mục vai. `code @unique`, `isSystem` (không xoá/đổi code), `isActive`. | Gián tiếp |
| `RolePermission` | `prisma/schema.prisma:418-426` | Vai này được làm gì. Cột: `roleId`, `action` (String, validate qua ACTION_REGISTRY), `scopeType`. **PK ghép `@@id([roleId, action])`** — không có `id`, không `createdAt`, không `reason`. | ✅ |
| `UserOrgRole` | `prisma/schema.prisma:525-567` | Gắn người × đơn vị × vai. `effectiveFrom/To`, `status AssignStatus`, `grantedById`, **`source String? @default("AUTO")`** (`:560` — AUTO = máy sinh, MANUAL = người gán tay, xem §11.1). **PK ghép `@@id([userId, orgUnitId, roleId])`** ⇒ 1 user gắn được N dòng ở N đơn vị, KHÔNG ràng buộc DB nào chặn gắn nhiều nhánh cây (rào duy nhất là A-01-3 ở tầng service, §11.2). | ✅ **nguồn chính** |
| `UserPermissionGrant` | `prisma/schema.prisma:1124-1140` | Grant per-user: `userId`, `action`, `grant GrantType`, `reason`, `grantedBy`, `@@unique([userId, action])`. **KHÔNG có orgUnitId/centerId (toàn cục), KHÔNG có effectiveFrom/To.** | ⚠️ chỉ nhánh ALLOW |
| `PermissionDescriptor` | `prisma/schema.prisma:432-446` | Registry key tập trung: `key @id`, `module`, `action`, `scopable`, `sensitiveFields[]`, `isActive`. Nạp từ `lib/permissions/registry/*.ts`. Key vắng khỏi khai báo → `isActive=false`, **KHÔNG DELETE**. | Không (mô tả) |
| `PermissionGrant` | `prisma/schema.prisma:468-487` | Grant thế hệ mới: `subjectType ROLE\|GROUP`, `subjectId` (polymorphic, **không FK có chủ đích**), `permissionKey` (FK Restrict), `effect ALLOW\|DENY`, `dataScope`, `fieldMask[]`, `reason`. | ✅ **nơi DUY NHẤT có DENY thật** |
| `UserGroup` / `UserGroupMember` | `prisma/schema.prisma:496-522` | Nhóm ad-hoc. Nhóm soft-delete (`deletedAt`) ⇒ grant nhóm vô hiệu ngay lần resolve kế. Thành viên hard-delete. | Gián tiếp |
| `Position` / `PositionRole` / `PositionAssignment` / `WorkScope` | `prisma/schema.prisma:632-727` | Vị trí công việc gắn vai. `lib/org/positions.ts:157-224` trả về đúng khuôn `UserOrgRoleRow`, đổ chung vào `buildActor`. | ✅ **nguồn thứ hai** |
| `EmployeeOrgAssignment` | `prisma/schema.prisma:736-753` | Nhân sự / kiêm nhiệm / phân bổ lương. | ❌ **KHÔNG sinh quyền** — khẳng định tại `lib/org/assignment-service.ts:2` |
| `RbacAuditLog` | `prisma/schema.prisma:543-559` | Vết mọi thay đổi RBAC. `reason` **bắt buộc** (NOT NULL). | Không |

### 2.3 Ràng buộc quan trọng

- **`RolePermission` có PK ghép `(roleId, action)`** ⇒ **một vai chỉ mang ĐÚNG MỘT `scopeType` cho mỗi action.** Không thể cấp cho cùng 1 vai vừa `leads:view-all` GLOBAL vừa CENTER. Muốn 2 mức → tách 2 `RoleDef`.
- **`UserPermissionGrant` toàn cục + vô thời hạn** ⇒ cấp một lần là vĩnh viễn, áp mọi cơ sở, phải xoá dòng mới gỡ.
- `UserOrgRole.userId` / `orgUnitId` là **cột trần, không FK** ⇒ xoá `OrgUnit` không cascade.
- **`UserOrgRole.source` quyết định ai được thu hồi dòng đó.** Bất biến ĐÚNG là: đồng bộ tự động không đụng dòng `MANUAL` **đang còn hiệu lực**; `AUTO` hoặc `null` (dòng cũ trước migration) ⇒ được thu hồi. ⚠️ **KHÔNG phải "MANUAL thì máy không bao giờ đụng"**: nhánh GÁN của cùng hàm `reconcileUserOrgRoles` **hồi sinh dòng `MANUAL` đã hết hiệu lực và đổi nhãn nó về `AUTO`** (`lib/auth/org-role-sync.ts:238-266`) — đánh đổi có chủ đích, xem §11.1. Miền giá trị ép bằng CHECK `userorgrole_source_domain`, không phải enum Postgres (`prisma/migrations/20260825090000_sl01_userorgrole_source/migration.sql:51-60`). Chi tiết + 3 nhánh của đường gán tay: §11.1.
- **Vai `CENTER_MANAGER` không được neo tại đơn vị type `HO`/`ROOT`** — chặn ở tầng service, cả hai đường ghi (§11.2).

---

## 3. Enum `ScopeType` và runtime đối chiếu với cái gì

`prisma/schema.prisma:390-397` — **6 giá trị**. Logic đối chiếu: `lib/auth/can.ts:13-45` (`scopeMatches`).

| ScopeType | Runtime đối chiếu với | Thiếu target thì |
|---|---|---|
| `GLOBAL` | không đối chiếu gì — `return true` (`can.ts:15-16`) | vẫn true |
| `CENTER` | `target.centerId` ⟷ `p.centerScope` (tính sẵn lúc `buildActor`) — `can.ts:26-30` | **`return false`** (fail-closed) |
| `CLASS` | `target.classId` ∈ `actor.assignedClassIds` (`can.ts:40-42`) | false |
| `OWN` | `target.studentId` ∈ `actor.guardedStudentIds`, HOẶC `target.createdById === actor.userId` (`can.ts:31-37`) | false |
| `CHILDREN` | `target.parentUserId === actor.userId` (`can.ts:38-39`) | false |
| `ASSIGNED` | như `CLASS` — cùng nhánh `can.ts:40-42` | false |

**`p.centerScope` được tính lúc dựng actor**, không tính lúc gọi:
- `lib/auth/actor.ts:339` — `centerScope: hoRoot ? "ALL" : rowCenters`
- `rowCenters` = tập `centerId` trong cây con của `OrgUnit` neo vai + `WorkScope` (`lib/auth/actor.ts:276-281`)
- Vai neo tại node `type` HO/ROOT ⇒ `"ALL"` ⇒ khớp mọi `centerId`

**Nhánh cutover (P4 · US-13):** khi `actor.orgScopeCutover === true` thì `CENTER` đo bằng `target.orgUnitId` ⟷ `p.orgUnitScope` thay vì `centerId` (`lib/auth/can.ts:20-25`). Cờ này đọc từ `SystemSetting("orgScope.cutoverEnabled")` (`lib/auth/actor.ts:97-105`), **không phải env**.

**Phân bố scope thực tế trong seed** (414 dòng `RolePermission`):

| scopeType | số dòng |
|---|---|
| GLOBAL | 375 |
| CENTER | 24 |
| ASSIGNED | 9 |
| OWN | 4 |
| CLASS | 1 |
| CHILDREN | 1 |

375/414 để GLOBAL là **có chủ đích**, không phải lười: `prisma/seed-roles.ts:11-29` ghi rõ quy tắc "action còn ≥1 call-site gọi trần ⇒ GLOBAL". Kiểm bằng `pnpm exec tsx scripts/rbac-scope-audit.ts` (CI: `lib/auth/rbac-scope.test.ts`).

---

## 4. Cơ chế đánh giá quyền

### 4.1 Chuỗi thực tế khi gọi `checkPermission()`

```
checkPermission(action, target?)              lib/auth/check-permission.ts:26-30
  ├─ auth() → session
  ├─ resolveActor(userId)                     lib/auth/actor.ts:535 (React.cache — resolve MỘT LẦN/request,
  │                                             KHÔNG phải 1 query: 8-11 query, xem ghi chú dưới)
  └─ decidePermissionWithGrant(...)           lib/auth/permission-decision.ts:40-61
       ├─ resolveGrant(actor, action, target) lib/permissions/can.ts:109-145   ← bảng PermissionGrant MỚI
       │    └─ hit  → TRẢ NGAY decision.allowed  (grant là nguồn sự thật)
       └─ miss → evaluatePermission(...)      lib/auth/permission-eval.ts
            ├─ v1 = canMatrix(sessionUser, action)   lib/auth/permissions.ts:764
            ├─ v2 = canV2(actor, action, target)     lib/auth/can.ts:52
            ├─ ghi shadow-diff khi v1 ≠ v2
            └─ trả  flagOn ? v2 : v1                 lib/auth/shadow-compare.ts:27
```

> **Ghi chú số truy vấn:** `React.cache` bảo đảm `resolveActor` chạy **một lần mỗi request**, KHÔNG phải "1 query". `resolveActorUncached` bắn **7 nhánh song song** trong `Promise.all` (`lib/auth/actor.ts:425-458`: `userOrgRole.findMany`, `getOrgTree`→`orgUnit.findMany`, `userPermissionGrant.findMany`, `class.findMany`, `userGroupMember.findMany`, `loadRelationshipRoles`, `loadPositionRoleRows`), rồi thêm `permissionGrant.findMany` (`:465-487`), rồi `student.findMany` + `getGlobalSetting` (`:492-500`); riêng `loadRelationshipRoles` bên trong còn 1-2 query (`:400`, `:409`). Tổng **8-11 query/request**. Comment `actor.ts:534` ghi "1 lần truy vấn/request" là sai và không nên chép lại.


### 4.2 Cờ `RBAC_V2_ENABLED`

```ts
// lib/flags.ts:7-9
export function isRbacV2Enabled(): boolean {
  return process.env.RBAC_V2_ENABLED === "true";
}
```

- **Mặc định OFF trong code** (`lib/flags.ts:4-5`) ⇒ local/dev/CI chạy **v1 matrix tĩnh**.
- Chuỗi `"1"` / `"TRUE"` / `"yes"` đều ra `false` — phải đúng chuỗi `"true"`.
- Tài liệu (`.github/workflows/seed-prod-roles.yml:13`) khẳng định **PROD đang bật** (xác minh 29/07/2026). **Không xác minh được từ repo** — chỉ là comment, không phải cấu hình chạy.

### 4.3 `can()` v2 — ALLOW-wins thuần

```ts
// lib/auth/can.ts:52-59
export function can(actor: Actor, action: string, target?: Target): boolean {
  if (actor.isSuperAdmin) return true;
  if (actor.grantsAllow.has(action)) return true;
  for (const p of actor.permissions) {
    if (p.action === action && scopeMatches(p, actor, target)) return true;
  }
  return false;
}
```

### 4.4 🔴 Tình trạng nhánh DENY

| Đường | Có nhánh DENY? | Bằng chứng |
|---|---|---|
| v1 (`lib/auth/permissions.ts`) | ✅ CÓ — `DENY > ALLOW > role matrix` | `lib/auth/permissions.ts:793-796` |
| **v2 (`lib/auth/can.ts`)** | ❌ **KHÔNG** — không tồn tại biến `grantsDeny` trong file | `lib/auth/can.ts:47-59` + comment `:48-51` "KHÔNG có DENY override (OI-7)" |
| `buildActor` nạp grant | Chỉ nạp ALLOW: `.filter((g) => g.grant === "ALLOW" && validActions.has(g.action))` | `lib/auth/actor.ts:367-371` |
| Engine mới (`lib/permissions/can.ts`) | ✅ CÓ — trên bảng `PermissionGrant`, DENY `fieldMask` rỗng chặn hẳn action | `lib/permissions/can.ts:117-122` |

**Hệ quả phải nhớ:**
- Dòng `UserPermissionGrant` có `grant = 'DENY'` bị **vứt IM LẶNG** khi chạy v2 — không lỗi, không log.
- Hành vi này là **thiết kế được ghim bằng test**, không phải bug chưa vá: `lib/auth/can.test.ts:129-135` `[A0-03-T6-02] grant DENY KHÔNG làm mất quyền role`.
- Engine mới **tuyệt đối không đọc bảng cũ** (`lib/permissions/can.ts:3-5`).
- **Luật tạm:** muốn chặn một quyền của ai đó thì **gỡ `UserOrgRole`**, đừng tạo grant DENY trên bảng cũ.

### 4.5 🔴 Giao diện đang nói sai về DENY

Màn `/admin/users/[id]/permissions` in cho người dùng:

> "Per-user overrides cho phép cấp (ALLOW) hoặc thu hồi (DENY) một quyền cụ thể bất kể role. Thứ tự ưu tiên: **DENY > ALLOW > role matrix**."
> — `app/(admin)/admin/users/[id]/permissions/page.tsx:107-111`

Câu này **đúng với v1, SAI với v2 đang enforce trên prod**. Form vẫn cho chọn radio `DENY` (`.../add-grant-form.tsx:120-125`).

---

## 5. Ma trận resource × operation × vai

Nguồn: `prisma/seed-roles.ts` (v2, DB) đối chiếu `lib/auth/permissions.ts:317-805` (v1, tĩnh). `[G]` = GLOBAL, `[C]` = CENTER.

> 🔴 **Cột "Vai v2 giữ (seed)" đọc từ FILE `seed-roles.ts`, KHÔNG phải từ DB đang chạy.** Nguồn quyền v2 thật là bảng `RolePermission`; thứ ghi xuống bảng đó là `seedRoles()` — `deleteMany` + `createMany` mỗi vai, trong một transaction (`prisma/seed-roles.ts:848-871`) — và trên PROD nó **chỉ chạy khi có người bấm tay workflow `seed-prod-roles.yml`** (`workflow_dispatch`, `.github/workflows/seed-prod-roles.yml:71` — xem bước **B4**). Merge code **không** đồng bộ bảng này (khác `prisma migrate deploy`, thứ *có* tự chạy khi push `main`). ⇒ Mọi ô "đã gỡ / đã thêm" trong mục 5 là trạng thái **sau khi re-seed**; trước đó DB prod vẫn giữ hàng cũ.

### 5.1 Lead (CRM)

| Key | Vai v2 giữ (seed) | Vai v1 (matrix) |
|---|---|---|
| `leads:view-all` | HO_MARKETING`[G]`, HO_SALE`[G]`, CENTER_MANAGER`[G]` | SUPER_ADMIN, CENTER_MANAGER, MARKETING (`permissions.ts:346`) |
| `leads:view-own` | CENTER_SALES_CSM`[G]` | SUPER_ADMIN, SALES_CSM (`:350`) |
| `leads:view-pii` | HO_MARKETING`[G]`, CENTER_MANAGER`[G]`, CENTER_SALES_CSM`[G]` | SUPER_ADMIN, CENTER_MANAGER, SALES_CSM, MARKETING (`:356`) |
| `leads:create` | HO_MARKETING`[G]`, CENTER_MANAGER`[G]`, CENTER_SALES_CSM`[G]` | SUPER_ADMIN, CENTER_MANAGER, SALES_CSM, MARKETING (`:357`) |
| `leads:edit` | HO_MARKETING`[G]`, CENTER_MANAGER`[G]`, CENTER_SALES_CSM`[G]` | như trên (`:358`) |
| `leads:assign` | CENTER_MANAGER`[G]` | SUPER_ADMIN, CENTER_MANAGER (`:359`) |
| `leads:assign-config` | *(không vai nào ngoài SUPER_ADMIN bypass)* | SUPER_ADMIN (`:360`) |
| `leads:delete` | *(không vai nào — thu hẹp có chủ đích, `lib/auth/rbac-intentional.ts`)* | SUPER_ADMIN, CENTER_MANAGER (`:361`) |
| `leads:import` | CENTER_MANAGER`[G]`, CENTER_SALES_CSM`[G]` | SUPER_ADMIN, CENTER_MANAGER, SALES_CSM (`:366`) |
| `leads:export` | *(**không vai nào trong FILE seed** — gỡ 25/08; ⚠️ DB prod chỉ đổi theo sau khi chạy `seed-prod-roles.yml`, xem §11.4)* | SUPER_ADMIN (`:370`) |

Vị trí seed (dòng khai `code`): HO_MARKETING `prisma/seed-roles.ts:226` · HO_SALE `:384` · CENTER_MANAGER `:410` · CENTER_SALES_CSM `:621`.

### 5.2 Tài chính (thanh toán / đơn hàng)

| Key | Vai v2 giữ (seed) | Vai v1 |
|---|---|---|
| `payments:manage` | HO_ACCOUNTANT`[G]`, CENTER_ACCOUNTANT`[G]` | SUPER_ADMIN, ACCOUNTANT (`permissions.ts:617`) |
| `payments:view` | HO_ACCOUNTANT`[G]`, CENTER_ACCOUNTANT`[G]`, CENTER_MANAGER`[G]` | SUPER_ADMIN, CENTER_MANAGER, ACCOUNTANT (`:618`) |
| `payments:record` | HO_ACCOUNTANT`[G]`, CENTER_ACCOUNTANT`[G]`, CENTER_MANAGER`[G]`, CENTER_SALES_CSM`[G]` | SUPER_ADMIN, CENTER_MANAGER, SALES_CSM, ACCOUNTANT (`:619`) |
| `payments:confirm` | HO_ACCOUNTANT`[G]`, CENTER_ACCOUNTANT`[G]` | SUPER_ADMIN, ACCOUNTANT (`:620`) |
| `payments:view-pii` | HO_ACCOUNTANT`[G]`, CENTER_ACCOUNTANT`[G]` | SUPER_ADMIN, ACCOUNTANT (`:624`) |
| `orders:view` | HO_ACCOUNTANT`[G]`, CENTER_ACCOUNTANT`[G]`, CENTER_MANAGER`[G]`, CENTER_SALES_CSM`[G]` | SUPER_ADMIN, CENTER_MANAGER, SALES_CSM, ACCOUNTANT (`:635`) |
| `orders:manage` | HO_ACCOUNTANT`[G]`, CENTER_MANAGER`[G]` | SUPER_ADMIN, CENTER_MANAGER, ACCOUNTANT (`:636`) |
| `orders:view-pii` | HO_ACCOUNTANT`[G]`, CENTER_ACCOUNTANT`[G]`, CENTER_MANAGER`[G]`, CENTER_SALES_CSM`[G]` | SUPER_ADMIN, CENTER_MANAGER, SALES_CSM, ACCOUNTANT (`:638`) |

⚠️ **Toàn bộ quyền tiền là `[G]` GLOBAL.** Cách ly cơ sở của tiền KHÔNG đến từ `scopeType` mà từ `scopedDb` (`Payment`, `Order`, `PaymentRequest`, `PaymentAllocation`, `CreditBalance`, `BankTransaction` ∈ `SCOPED_MODELS`, `lib/db-scope.ts:11-50`).

⚠️ Endpoint **xuất Excel hoa hồng** gác bằng `payments:manage` (`app/api/admin/crm/commission-export/route.ts:19`), **không phải** một key export riêng.

### 5.3 Nhân sự

| Key | Vai v2 giữ (seed) | Vai v1 |
|---|---|---|
| `employees:view-all` | HO_HR`[G]`, CENTER_HR**`[C]`** | SUPER_ADMIN, HR (`permissions.ts:319`) |
| `employees:view-public` | HO_ACCOUNTANT`[G]`, HO_HR`[G]`, HO_MARKETING`[G]`, CENTER_HR`[C]`, CENTER_MANAGER`[G]`, CENTER_SALES_CSM`[C]`, TEACHER`[G]` | `:320-322` |
| `employees:create` | HO_HR`[G]` | SUPER_ADMIN, HR (`:323`) |
| `employees:edit` | HO_HR`[G]`, CENTER_HR**`[C]`** | SUPER_ADMIN, HR, CENTER_MANAGER (`:324`) |
| `employees:delete` | *(không vai nào)* | SUPER_ADMIN (`:325`) |
| `employees:view-salary` | HO_ACCOUNTANT`[G]`, HO_HR`[G]` | SUPER_ADMIN, HR, ACCOUNTANT (`:326`) |
| `employees:view-personal` | HO_HR`[G]` | SUPER_ADMIN, HR (`:327`) |
| `hr_attendance:checkin` | HO_ACCOUNTANT, HO_HR, CENTER_HR, HO_MARKETING, TRAINING, CENTER_MANAGER, CENTER_SALES_CSM, TEACHER — tất cả`[G]` | `:415-418` |
| `hr_attendance:view` | HO_HR`[G]`, CENTER_HR**`[C]`**, CENTER_MANAGER**`[C]`** | SUPER_ADMIN, CENTER_MANAGER, HR (`:419`) |
| `hr_attendance:adjust` | CENTER_MANAGER`[G]` | SUPER_ADMIN, CENTER_MANAGER (`:421`) |

`CENTER_HR` là **thu hẹp CÓ CHỦ ĐÍCH** (duyệt 06/07/2026): 9 action vận hành tại 1 cơ sở, KHÔNG gồm lương / hồ sơ cá nhân / payroll / tạo nhân sự — `lib/auth/rbac-parity.test.ts:27-31` + `lib/auth/rbac-intentional.ts`.

### 5.4 Tổ chức / phân quyền

| Key | Vai v2 giữ | Vai v1 |
|---|---|---|
| `roles:manage` | SUPER_ADMIN`[G]` (`seed:35`) | SUPER_ADMIN (`permissions.ts:613`) |
| `roles:assign` | SUPER_ADMIN`[G]` (`seed:36`) **+ HO_HR`[G]` (`seed:137`)** — mở 24/08/2026, kèm 3 rào (§11.3) | SUPER_ADMIN (`:620`) |
| `user-groups:manage` | SUPER_ADMIN`[G]` (`seed:38`) | SUPER_ADMIN (`:614`) |
| `users:manage` | *(không seed cho vai nào — chỉ SUPER_ADMIN qua bypass)* | SUPER_ADMIN (`:611`) |
| `settings:view` / `settings:edit` | *(không seed)* | SUPER_ADMIN (`:609-610`) |
| `audit-logs:view` / `audit-logs:view-pii` | *(không seed)* | SUPER_ADMIN (`:605-606`) |

Mọi mutation RBAC đi qua `lib/auth/rbac-service.ts` đều **ghi `RbacAuditLog` + đòi `reason` bắt buộc** (`lib/validators/role.ts:16` — `min(3)` sau trim).

⚠️ **`roles:assign` KHÔNG còn là quyền của riêng SUPER_ADMIN** kể từ 24/08/2026: seed v2 cấp thêm cho `HO_HR` (`prisma/seed-roles.ts:137`), đi kèm 3 rào chống nhân bản quyền + đổi cổng hành động sang đúng hệ quyền của cổng trang — xem §11.3. Ma trận v1 vẫn chỉ có SUPER_ADMIN (`lib/auth/permissions.ts:620`), nên **local/dev/CI ≠ prod** ở đúng key này.

Chống leo thang trên đường gán, theo thứ tự chạy trong `assertAssignGuards` (`lib/auth/rbac-service.ts:160-210`): SEC-M13 chỉ SUPER_ADMIN gán được vai `SUPER_ADMIN` (`:172-178`, `FORBIDDEN_ROLE`) → A-01-3 cấm neo tại HO/ROOT (`:183-185`, `ORG_TYPE_FORBIDDEN`) → R1 cấm gán vai mang quyền cấp quyền (`:188-195`, `FORBIDDEN_PRIVILEGED_ROLE`) → R2 cấm tự gán cho chính mình (`:202-209`, `SELF_ASSIGN_FORBIDDEN`). Đường thu hồi có bản đối ngẫu của SEC-M13 + R1 (`assertRevokeGuards`, `:219-243`).

---

## 6. Danh sách đầy đủ key `leads:*` và mọi key `*:export`

### 6.1 `leads:*` — đúng 10 key

Khai báo ở `lib/auth/permissions.ts:60-67` (contiguous) + `:74` (`leads:view-pii` nằm tách ra):

| Key | union | ma trận | registry |
|---|---|---|---|
| `leads:view-all` | `permissions.ts:60` | `:346` | `lib/permissions/registry/crm.ts:9` |
| `leads:view-own` | `:61` | `:350` | `crm.ts:10` |
| `leads:create` | `:62` | `:357` | `crm.ts:16` |
| `leads:edit` | `:63` | `:358` | `crm.ts:17` |
| `leads:assign` | `:64` | `:359` | `crm.ts:18` |
| `leads:assign-config` | `:65` | `:360` | `crm.ts:19-25` |
| `leads:delete` | `:66` | `:361` | `crm.ts:26` |
| `leads:export` | `:67` | `:370` | `crm.ts:29` |
| `leads:import` | `:68` | `:366` | `crm.ts:30-33` |
| `leads:view-pii` | `:74` | `:356` | `crm.ts:11-15` (có `sensitiveFields: ["parentName","phone","email","childName","note"]`) |

### 6.2 Mọi key kết thúc `:export` — đúng 2 key, nay **1 sống 1 chết**

| Key | Khai ở | Có call-site enforce? |
|---|---|---|
| `leads:export` | `permissions.ts:67`, `:370`; `registry/crm.ts:29`; **không còn trong seed vai nào** | ✅ **CÓ, từ A-03 (25/08/2026)** — `app/api/admin/leads/export/route.ts:40` (cổng), `app/(admin)/admin/leads/page.tsx:283` (ẩn nút) |
| `elearning:report:export` | `permissions.ts:311`, `:716`; `registry/elearning.ts:124`; seed `:70,:170,:369,:549,:801` | ❌ **KHÔNG** |

Không có key nào bắt đầu bằng `export:`.

**Đường xuất lead sau A-03** (chi tiết §11.4): route đòi **CẢ HAI** `leads:view-all` **AND** `leads:export`; key `leads:export` đã bị **gỡ khỏi mọi vai trong FILE seed v2** và chỉ còn `SUPER_ADMIN` trong ma trận v1 (`lib/auth/permissions.ts:370`) ⇒ người thường nhận quyền này qua **nhóm** (`PermissionGrant` `subjectType=GROUP`, màn `/admin/user-groups`).

> 🔴 **Chưa chạy `seed-prod-roles.yml` thì lỗ vẫn mở.** Merge lên `main` chỉ đổi MÃ; bảng `RolePermission` trên prod vẫn giữ dòng `leads:export` GLOBAL của `HO_MARKETING` và `CENTER_MANAGER` cho tới khi có người bấm workflow. Trong khoảng đó cổng AND **cho qua** hai vai đó ⇒ họ **vẫn xuất được toàn bộ lead trong tầm nhìn**. Đừng đóng mục rủi ro #17 dựa trên bảng §5.1.
> ⚠️ Chiều ngược lại cũng đau: khi seed CHẠY, `CENTER_MANAGER` **mất quyền xuất ngay lập tức** và hiện chưa có nhóm nào được tạo để cấp bù ⇒ phải báo trước cho QLCS + dựng nhóm `/admin/user-groups` **trước** khi bấm.

Các endpoint xuất file khác vẫn gác bằng key của module mình:

| Endpoint | Gate thật | file:dòng |
|---|---|---|
| Xuất **.xlsx** lead | `leads:view-all` **AND** `leads:export` | `app/api/admin/leads/export/route.ts:38-42` |
| Xuất Excel lịch ca chấm công | `hr_attendance:view` (có truyền `centerId`) | `app/api/admin/cham-cong/shift-export/route.ts:35` |
| Xuất Excel hoa hồng | `payments:manage` | `app/api/admin/crm/commission-export/route.ts:19` |

**Hệ quả còn nguyên cho `elearning:report:export`:** gỡ key đó khỏi một vai để "chặn xuất file" vẫn **không có tác dụng gì**. Cần quyền xuất riêng cho module mới thì phải **vừa khai key vừa sửa call-site**, đừng tin là có sẵn.

> 🔴 **`leads:export` cấp qua `UserPermissionGrant` per-user là một công tắc TẮT CÁCH LY CƠ SỞ — nay đã bị chặn cứng.** Cơ chế không đổi: `getModelVisibleCenterIds` quét `actor.grantsAllow`, thấy action khớp prefix `leads:` là đặt `hasAll = true` và trả `"ALL"` (`lib/db-scope.ts:248-256`) ⇒ `scopedDb` ngừng cách ly `Lead`, `MessengerConversation` (`lib/db-scope.ts:133-137`) và `LeadTrialHistory` (`:180-184`).
> Rào A-03-7 (25/08/2026): màn `/admin/users/[id]/permissions` **cấm mọi khoá khớp tiền tố `leads:`** — không chỉ `leads:export` mà cả `leads:view-pii` — ở **cả** `addGrantAction` **và** `updateGrantAction`, và **chặn cả `DENY`** (bịt đường vòng "tạo DENY rồi sửa thành ALLOW"): `app/(admin)/admin/users/[id]/permissions/_actions.ts:35-53` (danh sách + hàm kiểm), `:104` (thêm), `:184` (sửa).
> ⇒ Đường cấp quyền xuất lead **duy nhất** là nhóm; grant nhóm đi vào `actor.permissionGrants`, KHÔNG đổ vào `grantsAllow`, nên `scopedDb` vẫn cách ly.

---

## 7. ⭐ Cách thêm MỘT permission key mới

Đây là phần quan trọng nhất của tài liệu. **Có BA nguồn phải giữ đồng bộ bằng tay** — bỏ sót bước nào cũng hỏng theo kiểu im lặng.

### B1 — Khai vào danh mục gốc: `lib/auth/permissions.ts`

⚠️ **`lib/auth/action-registry.ts` KHÔNG phải danh mục gốc** — file chỉ 20 dòng, re-export `ALL_ACTIONS` (`action-registry.ts:5-8`). Danh mục gốc là hằng `PERMISSIONS` (`permissions.ts:317`, hiện **182 key**), và `ALL_ACTIONS = Object.keys(PERMISSIONS)` (`permissions.ts:806`).

Sửa 2 chỗ trong cùng file:
1. Thêm nhánh vào union `Action` (`permissions.ts:36`) — `| "resource:verb"`.
2. Thêm dòng vào `PERMISSIONS` (`permissions.ts:317`) kèm **danh sách vai v1**: `"resource:verb": ["SUPER_ADMIN", ...]`.

`ALL_ACTIONS` + `ACTION_REGISTRY` tự theo. Không sửa `action-registry.ts`.

> 🔴 **Bỏ bước này = grant vô hiệu im lặng.** `buildActor` lọc grant theo `validActions` (`lib/auth/actor.ts:240` + `:369`) — key không có trong `PERMISSIONS` thì mọi grant mang key đó bị lọc mất, không lỗi, không log. Cảnh báo ghi tại `permissions.ts:673-693`.

### B2 — Khai vào registry: `lib/permissions/registry/<module>.ts`

11 module: `chat`, `crm`, `students`, `classes`, `lms`, `hr`, `finance`, `content`, `inventory`, `system`, `elearning` (`lib/permissions/registry/index.ts:32-44`). **Mỗi prefix `resource:` nằm ĐÚNG MỘT module** — trùng key giữa 2 module thì `collectDescriptors` ném `DuplicatePermissionKeyError` (`registry/index.ts:21-29`).

Thêm một `PermissionDecl`:
```ts
{ key: "resource:verb", action: "verb", scopable?: true, sensitiveFields?: [...], description?: "..." }
```

Bắt buộc, vì test parity ép **hai chiều**:
- `(a)` mọi action của `ALL_ACTIONS` phải có descriptor — `lib/permissions/registry.test.ts:70-74`
- `(b)` mọi descriptor dạng `resource:verb` phải nằm trong `ALL_ACTIONS` — `registry.test.ts:76-85`

### B3 — Phân bổ cho vai: `prisma/seed-roles.ts`

Thêm `{ action: "resource:verb", scopeType: "GLOBAL" }` vào `perms` của từng `RoleDef` trong `ROLE_SEED` (`prisma/seed-roles.ts:31`).

**Chọn scopeType theo quy tắc cứng** (`prisma/seed-roles.ts:11-29`): action còn ≥1 call-site gọi trần (không truyền `target`) ⇒ **phải để GLOBAL**. Đặt CENTER/OWN/CLASS cho action đó = khoá trắng vai, không phải siết scope.

Test chặn: `lib/auth/rbac-parity.test.ts` — action có ở v1 mà thiếu ở v2 sẽ đỏ, trừ khi nằm trong `INTENTIONAL` (`lib/auth/rbac-intentional.ts`) hoặc `KNOWN_GAPS` (hiện rỗng, `rbac-parity.test.ts:40`).

### B4 — Chạy seed

| Môi trường | Lệnh |
|---|---|
| Local / dev | `pnpm db:seed:roles` (`package.json:25` → `tsx prisma/seed-roles.ts`) |
| Local / dev | `pnpm db:seed:permissions` (`package.json:26` → `tsx prisma/seed-permission-registry.ts`) |
| test | `db:seed:permissions` **tự chạy** khi push nhánh `test` (`.github/workflows/migrate-test.yml:85`) |
| PROD | `db:seed:permissions` **tự chạy** sau `migrate deploy` (`.github/workflows/deploy.yml:73`) |
| PROD | `db:seed:roles` **KHÔNG tự chạy** — phải bấm tay workflow `seed-prod-roles.yml` (`workflow_dispatch`, `.github/workflows/seed-prod-roles.yml:71`) |

> 🔴 **Bỏ B4 (nhánh prod-roles) = tính năng trắng trơn trên prod mà không báo lỗi.** Prod enforce v2 đọc `RolePermission` từ DB; key mới trong code nhưng chưa seed thì không vai nào giữ.
> 🔴 `seedRoles()` **reset toàn bộ `RolePermission`** theo định nghĩa trong code. Chỉnh role runtime qua UI mà không đưa vào `seed-roles.ts` sẽ bị xoá (`seed-prod-roles.yml:27-28`). Toàn bộ chạy trong MỘT `$transaction` (`prisma/seed-roles.ts:4-5`) — tách ra = mất quyền toàn hệ thống giữa lúc seed.

### B5 — Nếu key dùng để gác TRANG

1. Khai route vào `PAGE_GATES` (`lib/auth/page-gates.ts:20`) — **nguồn duy nhất cho "ai vào trang nào"**.
2. Dùng **chính mảng đó** làm `perm` của mục menu trong `NAV_GROUPS` (`components/admin/sidebar.tsx:97`).
3. `lib/auth/page-gates.test.ts` khoá bất biến menu ≡ cổng. Lệch = một trong hai lỗi: dead-link (menu hiện, trang đá ra) hoặc hở quyền theo URL (`page-gates.ts:3-11`).
4. Route admin mới còn phải thêm segment vào `ADMIN_ROUTE_SEGMENTS` (`lib/auth/route-policy.ts`) + test, nếu không proxy từ chối.

### B6 — Gọi ở call-site

```ts
// Server Action / API route — ngay đầu hàm
const ok = await checkPermission("resource:verb", { centerId: row.centerId });   // check-permission.ts:26
await assertPermission("resource:verb", { centerId: row.centerId });             // check-permission.ts:50-52
```
Hoặc qua pipeline chuẩn `runAction` (`lib/actions/factory.ts:100-144`) — nhưng pipeline này **chỉ module chat đang dùng** (5 file `lib/chat/*`), 297 file dưới `app/` gọi `checkPermission`/`assertPermission` trực tiếp.

⚠️ Đường factory **không đi qua cờ `RBAC_V2_ENABLED`** — `lib/permissions/can.ts:146` fallback thẳng `canV2` bất kể cờ. Nghĩa là chat chạy v2 kể cả ở local.

### B7 — Kiểm tra trước khi báo xong

```bash
pnpm exec tsx scripts/rbac-scope-audit.ts     # scope non-GLOBAL + call-site gọi trần = khoá trang
pnpm typecheck && pnpm lint && pnpm build
# test liên quan: registry.test.ts (parity 2 chiều) · rbac-parity.test.ts (v1↔v2) ·
#                 rbac-scope.test.ts · page-gates.test.ts · nav-coverage.test.ts
```

### Tóm tắt bảng kiểm

| # | File / lệnh | Bỏ sót thì sao |
|---|---|---|
| B1 | `lib/auth/permissions.ts` (union + `PERMISSIONS`) | Mọi grant mang key bị **lọc mất im lặng** |
| B2 | `lib/permissions/registry/<module>.ts` | `registry.test.ts` đỏ; key không vào `PermissionDescriptor` ⇒ không tạo được `PermissionGrant` (FK Restrict) |
| B3 | `prisma/seed-roles.ts` | `rbac-parity.test.ts` đỏ |
| B4 | `pnpm db:seed:roles` + `db:seed:permissions`; PROD: workflow `seed-prod-roles.yml` | Prod trắng trơn, không báo lỗi |
| B5 | `lib/auth/page-gates.ts` + `components/admin/sidebar.tsx` + `route-policy.ts` | Dead-link hoặc hở quyền theo URL; route mới bị proxy từ chối |
| B6 | call-site `checkPermission`/`assertPermission` | Key chết — vd `elearning:report:export` (khai đủ 5 chỗ seed, **không** call-site nào) |
| B7 | `scripts/rbac-scope-audit.ts` + typecheck/lint/build | Khoá trắng vai khi flip |

---

## 8. Gán quyền cho TỪNG NGƯỜI (không theo vai)

**CÓ, hai đường, cả hai đều có UI.**

### 8.1 Per-user trên bảng CŨ `UserPermissionGrant`

| Hạng mục | Chi tiết |
|---|---|
| Route | `/admin/users/[id]/permissions` |
| File | `app/(admin)/admin/users/[id]/permissions/page.tsx` + `_actions.ts` + `_components/{add-grant-form,grants-table,effective-matrix}.tsx` |
| Cổng | `checkPermission("users:manage")` (`_actions.ts:20`, `page.tsx:24-26`) |
| Ghi | `tx.userPermissionGrant.create/update/delete` (`_actions.ts:96, 158, 203`) |
| Phụ trợ | Mỗi thao tác **tăng `tokenVersion`** ⇒ ép đăng xuất mọi thiết bị (`_actions.ts:108, 165, 207`) |
| Chặn | Không override được SUPER_ADMIN (chống self-lockout) — `page.tsx:114-121` |

**Hạn chế cứng:**
- ❌ **Không có phạm vi đơn vị** — bảng không có `orgUnitId`/`centerId` (`prisma/schema.prisma:1124-1140`) ⇒ grant áp **mọi cơ sở**.
- ❌ **Không có hiệu lực theo thời gian** — không `effectiveFrom/To` ⇒ vĩnh viễn tới khi xoá dòng.
- 🔴 **Nút DENY không có tác dụng trên prod** (mục 4.4). UI vẫn quảng cáo "DENY > ALLOW > role matrix".
- ⚠️ Một grant **ALLOW** khớp prefix model làm `getModelVisibleCenterIds` trả `"ALL"` toàn hệ thống cho model đó (`lib/db-scope.ts:248-254` — comment `per-user grants are global exceptions`). Cấp một quyền hẹp lại **mở tầm nhìn dữ liệu toàn bộ**.

### 8.2 Per-nhóm trên bảng MỚI `PermissionGrant`

| Hạng mục | Chi tiết |
|---|---|
| Route | `/admin/user-groups`, `/admin/user-groups/[id]` |
| File | `app/(admin)/admin/user-groups/_actions.ts` |
| Cổng | `assertPermission("user-groups:manage")` ở **mọi action** (`_actions.ts:64, 125, 186, 235, 307, 363, 459`) — chỉ SUPER_ADMIN |
| Ghi | `tx.permissionGrant.create({ subjectType: "GROUP", subjectId: groupId, permissionKey, effect, dataScope, fieldMask, reason })` (`_actions.ts:405-412`) |
| Đặc điểm | Có `effect ALLOW\|DENY` **thật sự chạy**, có `dataScope`, có `fieldMask` (che trường) |
| Hạn chế P0 | `dataScope` **chỉ nhận `ALL`** — siết 09/08 (`_actions.ts:14`, `:368`). ⚠️ Comment schema (`prisma/schema.prisma:493-495`) vẫn ghi `ALL\|OWN` — **lệch, tin validator** |
| Gán cho 1 người | = thêm người đó vào nhóm (`UserGroupMember`) |
| Gỡ nhanh | Soft-delete nhóm ⇒ grant vô hiệu ngay lần resolve kế, không cần dọn grant (`schema.prisma:490-493`) |

### 8.3 Cái KHÔNG có

- ❌ **KHÔNG có UI sửa danh sách quyền của một `RoleDef`.** `setRolePermissionsAction` tồn tại (`app/(admin)/admin/roles/actions.ts:73`) nhưng **grep toàn repo cho thấy 0 caller**; thư mục `_components/` chỉ có `create-role-form.tsx`. Sửa quyền vai hiện **phải qua `prisma/seed-roles.ts` + chạy seed**.
- ❌ **KHÔNG có UI tạo `PermissionGrant` với `subjectType = "ROLE"`.** Grep `subjectType` trong `app/` chỉ ra `"GROUP"` (`user-groups/_actions.ts:407, 470`).

---

## 9. RLS hay code-enforced?

**Cả hai đều có, nhưng cách ly đa cơ sở là 100% code-enforced.**

### 9.1 Postgres CÓ bật RLS — nhưng không phải để cách ly cơ sở

`prisma/migrations/20260617000000_enable_rls_all_public/migration.sql` bật `ENABLE ROW LEVEL SECURITY` cho **toàn bộ bảng schema `public`** bằng vòng lặp `DO $$` (`:21-33`).

Đọc kỹ ý đồ ghi trong chính migration (`:1-19`):
- Mục đích là **phòng thủ chiều sâu cho bề mặt PostgREST / role `anon` của Supabase**, không phải cách ly tenant của app.
- Bật RLS mà **chưa tạo policy nào = chặn hết** với role thường (`anon`/`authenticated`).
- **Chỉ dùng `ENABLE`, KHÔNG dùng `FORCE`** (`:7-13`): Prisma kết nối bằng role owner, mà `ENABLE` không áp cho owner ⇒ **app đọc/ghi bình thường, RLS vô hiệu với đường app**. Dùng `FORCE` sẽ chặn luôn Prisma và vỡ toàn bộ app.
- Migration bổ sung `20260809140000_rls_backfill_bang_tao_sau_20260617` bật RLS cho bảng tạo sau.

**Policy THẬT chỉ tồn tại cho chat realtime** (Supabase Realtime chạy bằng role non-owner nên policy có hiệu lực):
- `20260809100000_chat_realtime_rls_broadcast/migration.sql:37` — `CREATE POLICY "participant_can_receive_conversation_broadcast"`
- `20260809110000_chat_realtime_rls_participant_fn/migration.sql:52`
- `20260809130000_chat_rls_lockdown/migration.sql:27-33, :94`
- `20260809160000_chat_user_topic_rls/migration.sql:58` — `CREATE POLICY "user_can_receive_own_user_broadcast"`

### 9.2 Cách ly đa cơ sở: hoàn toàn ở tầng code

| Lớp | Cơ chế | file:dòng |
|---|---|---|
| Quyền hành động | `can()` — v1 matrix hoặc v2 actor | `lib/auth/can.ts:52`, `lib/auth/permissions.ts:764` |
| Cách ly dữ liệu ĐỌC | `scopedDb(actor)` inject `centerId IN (...)` | `lib/db-scope.ts:268-282` |
| Phạm vi hook | **Đúng 7 method đọc**: `findMany`, `findFirst`, `count`, `aggregate`, `groupBy`, `findUnique`, `findFirstOrThrow` | `lib/db-scope.ts:347-375` |
| Bypass | `actor.isSuperAdmin` (chỉ SUPER_ADMIN, **không phải** `isHoLevel`) | `lib/db-scope.ts:128-130` |

**Ba lỗ đã biết, có chủ đích:**
1. 🔴 **`scopedDb` KHÔNG che WRITE** — không hook `create`/`createMany`/`update`/`updateMany`/`delete`/`deleteMany`/`upsert`. Mọi `update`/`delete` phải tự gọi `passesScope()` (`lib/db-scope.ts:284-301`); mọi `create` trên `SCOPED_MODELS` phải tự set `centerId` (quên = bản ghi vô hình với actor cấp cơ sở).
2. 🔴 **Nested `include` không được auto-scope** — client extension chỉ chạy ở query top-level (`lib/db-scope.ts:4-5`).
3. 🔴 **Fail-open cho model chưa map prefix** — model không có case trong `getModelPrefixes` rơi vào fallback `actor.isHoLevel ? "ALL" : actor.visibleCenterIds` (`lib/db-scope.ts:222-228` và `:256-261`). Đã dính một lần với `Attendance` (`lib/db-scope.ts:176-180`).

### 9.3 Lint chặn viết điều kiện quyền tay

`no-inline-authz` **có thật**, 2 tầng, trong `eslint.config.mjs`:
- Tầng (a): `no-restricted-syntax` 4 selector — cấm `hasRole()`/`isParentOnly()`/`getEffectiveRoles()`, `.roles.includes(...)`, so sánh `.role ===`, so sánh `.centerId ===` (`eslint.config.mjs:62-106`).
- Tầng (b): plugin cục bộ `authz/require-can-in-write-action` (`lib/eslint/require-can-in-write-action.mjs:28-44, :120-129`) — hàm async export có lời gọi GHI mà thân hàm không có `can`/`assertCan`/`checkPermission`/... = lỗi.
- Phạm vi: **chỉ 5 glob file action dưới `app/`** (`eslint.config.mjs:108-114`). Route handler `app/api/**/route.ts` và logic trong `lib/**` **KHÔNG bị quét**.
- **39 file được miễn tạm** (grandfather) trong `lib/eslint/inline-authz-allowlist.mjs`, tắt cả hai tầng (`eslint.config.mjs:333-343`).

---

## 10. Vai quan hệ `PARENT` — ngoại lệ có chủ đích

`RELATIONSHIP_ROLE_CODES = ["PARENT"] as const` — `lib/auth/actor.ts:192`. Hiện chỉ 1 phần tử.

### Cơ chế

1. **Nạp thẳng từ `RoleDef`, không cần `UserOrgRole`.** `loadRelationshipRoles(userId)` đọc `User.role` + `User.roles`, giao với `RELATIONSHIP_ROLE_CODES`; không khớp thì trả `[]` và **không truy vấn `RoleDef`** (đường nóng nhân viên không tốn thêm) — `lib/auth/actor.ts:399-421`.
2. **Chỉ đổ permission vào, KHÔNG chạm gì khác.** Vòng lặp riêng `lib/auth/actor.ts:348-365` push permission với `orgUnitId: ""`, `centerScope: null`, `orgUnitScope: null`; **cố ý không chạm** `visible` (`visibleCenterIds`), `visibleOrg`, `isHoLevel`, `orgRoles`.
3. **Fail-closed với scope CENTER.** `centerScope: null` ⇒ `can.ts:26-30` không bao giờ khớp; nhánh cutover cũng chặn qua `os == null → return false` (`can.ts:23`). Comment `actor.ts:360-362` cảnh báo: bản đo bằng đơn vị phải giữ y hệt, nếu không P4 nới quyền phụ huynh im lặng.
4. **Học viên được giám hộ** chỉ truy vấn khi `relationshipRoles.length > 0` (`lib/auth/actor.ts:489-500`) → `guardedStudentIds`, phục vụ scope `OWN` (`can.ts:36`).

### Quyền của PARENT trong seed

`prisma/seed-roles.ts:817-827` — `isSystem`, đúng 3 quyền:

| action | scopeType |
|---|---|
| `parent-feedback:view` | `CHILDREN` |
| `chat:read` | `OWN` |
| `chat:send` | `OWN` |

### Vì sao có ngoại lệ này

Sự cố 10/08/2026 (`lib/auth/actor.ts:166-191`): **114 tài khoản PARENT / 0 dòng `UserOrgRole`** ⇒ `actor.permissions` rỗng ⇒ phụ huynh không gửi được tin nhắn nào (`PERMISSION_DENIED`). Lỗi ẩn kỹ vì đường **ĐỌC** chat kiểm theo tư cách thành viên hội thoại chứ không qua `can()` — PH vào đọc bình thường, chỉ không gửi được.

Cách vá bằng `UserOrgRole` đã bị **LOẠI**: phải backfill 114 tài khoản cũ + nhớ mãi cho tài khoản mới, và gắn ở ROOT còn biến PH thành HO-level thấy mọi cơ sở.

### Luật khi mở rộng

- **`RoleDef` vẫn là nơi DUY NHẤT định nghĩa PH được làm gì** — sửa quyền PH = sửa `prisma/seed-roles.ts` rồi chạy seed, y hệt mọi vai khác (`lib/auth/actor.ts:189-191`).
- Thêm vai quan hệ mới thì **thêm code vào `RELATIONSHIP_ROLE_CODES`**, đừng chế cơ chế thứ hai.
- Vì vai này không đóng góp `visibleCenterIds`, `scopedDb` của phụ huynh **không được bảo vệ bởi tầm nhìn cơ sở**. Cách ly dữ liệu PH nằm ở `portalDb` + ownership check (`assertOwnsStudent`), không ở đây.

---

## 11. Đợt A (24–26/08/2026) — SL-01 · A-01-3 · OQ-7 · A-03 · A-01-6b

🔴 **Trạng thái GIT (đo 26/08/2026, `git status --porcelain` + `git log --oneline -1`): bốn thay đổi dưới đây nằm trong WORKING TREE, CHƯA COMMIT.** Commit đầu nhánh `hptkk29/runhop20_08` hiện là `9fa86af9 docs(dot-dashboard): …` — một commit **tài liệu**, không chứa mã A-01/A-02/A-03/SL-01. Mọi file liệt kê ở các mục "File đã đổi" (gồm `lib/auth/org-anchor-rules.ts`, `lib/auth/rbac-service.ts`, `app/api/admin/leads/export/route.ts`, `components/admin/scope-filter-bar.tsx`, thư mục `prisma/migrations/20260825090000_sl01_userorgrole_source/`) đang ở dạng `M`/`??`, chưa commit và chưa push.

⇒ **`git fetch && git checkout hptkk29/runhop20_08` KHÔNG cho ra mã này.** Đừng mở PR `test` từ nhánh đó để "đưa SL-01 lên tiền-prod" — sẽ là một PR rỗng. Phải commit + push trước; cập nhật lại đoạn này khi đã push.

Nguồn quyết định: `docs/prd/A-nen-tang.md`.

### 11.1 `UserOrgRole.source` — máy sinh hay người gán tay (SL-01)

Cột mới `source String? @default("AUTO") @db.VarChar(16)` (`prisma/schema.prisma:560`). Miền giá trị ép bằng CHECK `userorgrole_source_domain`, **không** phải enum Postgres (`prisma/migrations/20260825090000_sl01_userorgrole_source/migration.sql:51-60`). Migration thuần thêm cột + backfill `NULL → 'AUTO'`, idempotent.

🔴 **Migration này TỰ ÁP khi merge — không có cổng chạy tay nào chặn.** `.github/workflows/deploy.yml` trigger `on: push: branches: [main]` (`:22-24`) và chạy `pnpm exec prisma migrate deploy` với `PROD_DATABASE_URL`/`PROD_DIRECT_URL` (`:60-64`); `.github/workflows/migrate-test.yml:26-28` làm y hệt cho nhánh `test`. Nghĩa là **merge = `ALTER TABLE "UserOrgRole" ADD COLUMN "source"` + `UPDATE … SET source='AUTO'` + `VALIDATE CONSTRAINT` chạy ngay trên prod**, không dry-run. Luật cứng Nền #4 ("agent không chạy migration") là luật cho **agent trong phiên làm việc**, **không** phải mô tả CI — đừng đọc nó thành "sẽ còn một bước người bấm tay".

⇒ **Thứ tự bắt buộc phải giữ bằng kỷ luật MERGE, không phải bằng CI:** đo prod theo §6.9 (Đ1–Đ4) **TRƯỚC**, rồi mới merge SL-01, rồi mới backfill (`migration.sql:40-45`, `docs/prd/A-nen-tang.md:508`). Merge trước khi đo là mất luôn cơ hội đo trạng thái cũ.

**Vì sao cần.** Trước bản vá, reconcile phân biệt "máy sinh" với "gán tay" bằng cách suy lại `prevPlan` từ **một** đơn vị neo — suy luận, không phải bằng chứng. Khi đơn vị neo cũ trùng đúng cơ sở được gán tay, dòng gán tay rơi vào `prevPlan` và bị `EXPIRED` bởi một thao tác **không nhằm thu hồi quyền** (chỉ sửa ô "Đơn vị") — `lib/auth/org-role-sync.ts:15-22`.

**Đường GÁN TAY** (`assignUserOrgRole`, `lib/auth/rbac-service.ts:374-481`) — 3 nhánh, chép đúng, đừng "đơn giản hoá":

| Trạng thái dòng ở khoá `(userId, orgUnitId, roleId)` | Ghi `source` | Vì sao |
|---|---|---|
| chưa có → nhánh `create` | **luôn `MANUAL`** (`:463`) | DEFAULT của cột là `AUTO`; quên ghi = dòng gán tay đội lốt dòng máy sinh ⇒ SL-01 vô hiệu |
| có, **hết** hiệu lực → nhánh `update` | **`MANUAL`** (`:452`, qua `nhanNguon`) | hồi sinh dòng = người vừa nhận trách nhiệm |
| có, **đang** sống → nhánh `update` | **KHÔNG đụng** (`undefined` — `:439-440`) | `upsert` chạy `update` cho MỌI dòng đã tồn tại ở khoá, kể cả dòng `AUTO` do reconcile sinh. Ghi `MANUAL` vô điều kiện thì một cú bấm "Gán" trùng cặp (gia hạn / bấm cho chắc) lật `AUTO→MANUAL` **vĩnh viễn** ⇒ sau đó hạ vai ở `/admin/nhan-su` báo "thành công" mà quyền cũ **không** bị thu hồi |

Ranh giới "đang sống" dùng **chung đúng một hàm** với đường đồng bộ: `isLiveOrgRole` export từ `lib/auth/org-role-sync.ts:104`.

**Đường THU HỒI** (`reconcileUserOrgRoles`) chỉ đụng dòng **KHÁC `MANUAL`**: `mayThuHoiDuoc(source) = source !== "MANUAL"` (`lib/auth/org-role-sync.ts:93-94`).

- So theo chiều "khác MANUAL" chứ không phải "bằng AUTO" là **có chủ đích**: dòng sinh trước migration mang `null`. Lọc cứng `= "AUTO"` thì dòng `null` trượt khỏi bộ lọc và **không bao giờ thu hồi được nữa** — đổi một lỗ hổng (mất quyền im lặng) lấy một lỗ hổng ngược chiều (quyền kẹt vĩnh viễn).
- Điều kiện ép ở **cả hai tầng**: bộ nhớ (`:300`) và câu lệnh DB — `updateMany` mang `OR: [{ source: "AUTO" }, { source: null }]` trong `where` (`:307-314`), nên một đường ghi đồng thời đổi nhãn sang `MANUAL` cũng không lọt. Viết `OR` chứ không `{ not: "MANUAL" }` vì ngữ nghĩa NULL của `not` phụ thuộc phiên bản Prisma.
- `count === 0` ⇒ **không** ghi audit `REVOKE` (`:316`).

🔴 **Đừng đọc SL-01 thành "dòng `MANUAL` là bất khả xâm phạm" — chỉ nhánh THU HỒI mới tôn trọng nhãn đó.** Nhánh **GÁN** của cùng hàm `reconcileUserOrgRoles` chạy `upsert` với `update: { status: "ACTIVE", …, source: "AUTO" }` (`lib/auth/org-role-sync.ts:238-266`). Guard `liveKeys.has(rowKey(t))` (`:238`) chỉ bảo vệ dòng **đang CÒN hiệu lực**; một dòng `MANUAL` đã **hết** hiệu lực (`effectiveTo` đã qua, hoặc vừa bị revoke ở `/org-roles`) sẽ được nhánh này **hồi sinh và đổi nhãn về `AUTO`**. Đây là đánh đổi có chủ đích, tự nhận ngay trong mã (`:244-248`): khoá ghép `(userId, orgUnitId, roleId)` không cho tồn tại hai dòng cùng khoá, nên máy buộc phải dùng lại đúng dòng đó; giữ nhãn `MANUAL` ⇒ dòng do máy cấp mà máy không gỡ được ⇒ quyền kẹt vĩnh viễn.

  **Hệ quả vận hành phải nhớ:** với QLCS đa cơ sở, một dòng `MANUAL` rơi vào trạng thái hết hiệu lực sẽ bị lần sửa ô "Đơn vị" **kế tiếp** đổi thành `AUTO`; lần sửa ô "Đơn vị" **sau nữa**, `mayThuHoiDuoc` cho qua và dòng bị `EXPIRED` im lặng — đúng lỗ hổng SL-01 định vá. ⇒ Sau mỗi lần sửa hồ sơ tài khoản đa cơ sở, **kiểm lại cột `source`**, đừng tin nhãn `MANUAL` là vĩnh viễn.

⚠️ Script backfill đánh dấu `MANUAL` cho các cấu hình QLCS đa cơ sở **đang gán tay trên prod** là việc RIÊNG, **chưa có trong repo**. Thứ tự bắt buộc: đo prod → SL-01 → backfill (`migration.sql:40-45`). Migration cố ý để "tất cả = AUTO", không đoán dòng nào là gán tay.

**File đã đổi:** `prisma/schema.prisma` · `prisma/migrations/20260825090000_sl01_userorgrole_source/migration.sql` (mới) · `lib/auth/org-role-sync.ts` · `lib/auth/rbac-service.ts` · `lib/auth/org-role-sync.test.ts` (mới) · `lib/auth/rbac-service.test.ts` (mới).

### 11.2 Cấm neo `CENTER_MANAGER` tại HO/ROOT — gác **cả hai** đường ghi (A-01-3)

Luật ở **một chỗ duy nhất**: `lib/auth/org-anchor-rules.ts` — `HO_ROOT_FORBIDDEN_ROLE_CODES = ["CENTER_MANAGER"]` (`:26`), `roleBlockedAtHoRoot()` (`:29`), `isHoRootOrgType()` (`:34`), câu giải thích dùng chung `loiNeoHoRoot()` (`:42`). Module **thuần, không import gì** (kể cả `@prisma/client`) để cả `rbac-service` lẫn `org-role-sync` import được mà không tạo vòng.

| Đường ghi | Nơi gác | Hành vi khi vi phạm |
|---|---|---|
| Gán tay `/admin/users/[id]/org-roles` | `assertAssignGuards` (`lib/auth/rbac-service.ts:183-185`) | `RbacError("ORG_TYPE_FORBIDDEN")` — **áp cho MỌI actor, kể cả SUPER_ADMIN** |
| Đồng bộ khi sửa ô "Đơn vị" ở `/admin/users/[id]/edit` · `/admin/nhan-su` | `reconcileUserOrgRoles` (`lib/auth/org-role-sync.ts:167-176`) | `OrgRoleSyncError` → rollback cả transaction của caller; chỉ soi `nextPlan` (thu hồi một dòng neo sai ở trạng thái TRƯỚC là việc **nên** xảy ra) |

Bản trước chỉ rào đường 1, mà đường 2 dễ đi hơn nhiều: `planOrgRoleTargets` ánh xạ `CENTER_MANAGER → { org: "CENTER" }` sang thẳng `anchorOrgUnitId` bất kể đơn vị đó là gì, và picker đơn vị **có** liệt kê Hội sở.

**Hậu quả nếu thủng:** đúng **một** dòng vai tại HO/ROOT bật `isHoLevel` (`lib/auth/actor.ts:255`) ⇒ `visibleCenterIds` = **mọi cơ sở còn sống** (`lib/auth/actor.ts:277-280`) ⇒ quản lý một cơ sở lặng lẽ đọc lead / học viên / thanh toán của toàn hệ thống. Không cảnh báo, không audit bất thường.

⚠️ Danh sách **cố ý chỉ có `CENTER_MANAGER`**. Đây KHÔNG phải rào bịt hết đường `isHoLevel`: HR vẫn phải tạo được nhân sự Hội sở (`HO_ACCOUNTANT` neo tại HO là việc thường ngày) — `lib/auth/org-anchor-rules.ts:21-25`. Đừng mô tả nó rộng hơn thực tế.

**File đã đổi:** `lib/auth/org-anchor-rules.ts` (mới) · `lib/auth/rbac-service.ts` · `lib/auth/org-role-sync.ts` · `app/(admin)/admin/users/[id]/org-roles/page.tsx` · `app/(admin)/admin/users/[id]/org-roles/_components/org-roles-manager.tsx` · `lib/auth/rbac-service.test.ts` (mới) · `lib/auth/org-role-sync.test.ts` (mới).

### 11.3 `roles:assign` mở cho `HO_HR` + 3 rào (OQ-7)

Seed v2 cấp `{ action: "roles:assign", scopeType: "GLOBAL" }` cho `HO_HR` (`prisma/seed-roles.ts:137`). `GLOBAL` vì call-site gác trang gọi **trần** — scope hẹp = khoá trang.

> 🔴 **`roles:assign` là KEY ĐÃ SEED.** Sau khi merge `test` → `main` **phải chạy `seed-prod-roles.yml`**; quên là HR trên prod vẫn không gán được vai, và đây là loại hỏng "không có lỗi, chỉ là nút không làm gì".

Kèm theo, cổng **hành động** được đổi sang đúng hệ quyền mà cổng **trang** dùng. Trước bản vá: trang gác bằng `checkPermission("roles:assign")` (grant → v1/v2 theo cờ), còn `assignUserOrgRole`/`revokeUserOrgRole` gác bằng `can()` **v1 ma trận tĩnh** — nơi `roles:assign` chỉ có `SUPER_ADMIN`, và ma trận v1 chỉ biết enum `Role` legacy nên không biết mã vai v2 `HO_HR`. Nay cả hai đi qua `decidePermissionWithGrant` (`lib/auth/rbac-service.ts:81-93`).

| Rào | Nội dung | Nơi enforce |
|---|---|---|
| **R1** | Không gán / không thu hồi được vai **mang quyền cấp quyền** — kiểm theo **quyền của vai đích đọc từ DB**, không theo tên vai: tiền tố `roles:` hoặc `users:manage` (`isPrivilegedRole`, `lib/auth/rbac-service.ts:128-142`) | gán `:188-195` · thu hồi `assertRevokeGuards` `:219-243` |
| **R2** | Không **tự gán cho chính mình**. SUPER_ADMIN được miễn **có chủ đích** (prod đang có người vừa QLCS vừa SUPER_ADMIN — OQ-5) | `:202-209`, `SELF_ASSIGN_FORBIDDEN` |
| **R3** | `reason` **bắt buộc** (≥3 ký tự sau trim) cho cả gán lẫn thu hồi, + `logRbacAudit` | `lib/validators/role.ts:16`, `:60`, `:72`; parse ở `rbac-service.ts:385` (gán) và `:490` (thu hồi) |

⚠️ Cả 3 rào nằm ở **service**, không phải ở form: trang gán vai nhận `orgUnitId`/`roleId` thô từ client, nên khoá dropdown chỉ là lớp **giải thích**. Trang truyền xuống UI hai cờ do server suy ra bằng **đúng hàm** mà service dùng để chặn (`isPrivilegedRole`, `roleBlockedAtHoRoot`) + một định nghĩa "ai là SUPER_ADMIN" dùng chung (`laSuperAdminActor`, `lib/auth/rbac-service.ts:104-111`) — trước đó UI đọc `viewer.isSuperAdmin` (v2/DB) còn server đọc `session.user.role` (legacy), hai bên nói ngược nhau được.

**File đã đổi:** `prisma/seed-roles.ts` · `lib/auth/rbac-service.ts` · `app/(admin)/admin/users/[id]/org-roles/page.tsx` · `app/(admin)/admin/users/[id]/org-roles/_components/org-roles-manager.tsx` · `lib/auth/rbac-service.test.ts` (mới).

### 11.4 Xuất file lead — cổng **AND**, quyền không đến từ vai (A-03)

| Điểm | Trước | Sau (25/08/2026) |
|---|---|---|
| Cổng route | chỉ `leads:view-all` | **`leads:view-all` AND `leads:export`** — `app/api/admin/leads/export/route.ts:38-42` |
| Nguồn quyền `leads:export` | seed v2: `HO_MARKETING` + `CENTER_MANAGER`; ma trận v1: `SUPER_ADMIN`, `CENTER_MANAGER`, `MARKETING` | **gỡ khỏi mọi vai trong FILE seed** (`prisma/seed-roles.ts:238-239` HO_MARKETING, `:420-422` CENTER_MANAGER); v1 chỉ còn `SUPER_ADMIN` (`lib/auth/permissions.ts:370`) ⇒ người thường nhận qua **nhóm** `/admin/user-groups`. ⚠️ **DB prod chỉ đổi sau khi bấm `seed-prod-roles.yml`** — xem hộp đỏ dưới |
| Định dạng | CSV tự nối chuỗi | **`.xlsx`** (SheetJS), watermark ở sheet `_watermark` riêng (`route.ts:137-146`), `runtime = "nodejs"` (`:19`) |
| Nút trên UI | render vô điều kiện | chỉ hiện khi có `leads:export` (`app/(admin)/admin/leads/page.tsx:283` → `_components/leads-table.tsx:388`) |

🔴 **Cổng phải là AND, tuyệt đối không THAY THẾ `leads:view-all`.** Thay thế mở đúng một đường: người neo vai tại HO mà **không** có `leads:*` nào rơi vào nhánh `!hasAnyPermissionForModel` → `isHoLevel` → `"ALL"` (`lib/db-scope.ts:257-263`) ⇒ xuất được lead **toàn hệ thống**. `leads:view-all` = "được đọc danh sách"; `leads:export` = "được cầm file mang đi" — hai việc khác nhau, cấp riêng nhau.

⚠️ **Giữ khoá `leads:export` trong `PERMISSIONS`, chỉ làm rỗng danh sách vai.** Xoá khoá thì `ALL_ACTIONS` mất mục này và `buildActor` **vứt im lặng** mọi grant mang nó (`lib/auth/actor.ts:367-371`). `SUPER_ADMIN` ở lại trong v1 là **bắt buộc**, không phải sót: ma trận v1 là tra bảng thuần (không có bypass như v2) và `lib/auth/permissions.test.ts:313-322` ghim "mọi action trong ALL_ACTIONS đều cấp cho SUPER_ADMIN".

🔴 **A-03 CHƯA đóng khi merge — chỉ đóng khi đã re-seed.** `seed-roles.ts` là FILE; nguồn quyền v2 là bảng `RolePermission`, chỉ đổi khi `seedRoles()` chạy (`:848-871`), và trên prod nó **chỉ chạy bằng tay** qua `seed-prod-roles.yml` (`workflow_dispatch`). Trình tự bắt buộc, đúng như §11.3 đã ghi cho `roles:assign`:

1. Dựng nhóm `/admin/user-groups` + cấp `leads:export` cho người thực sự cần, **báo trước cho QLCS** rằng nút "Xuất Excel" sắp biến mất khỏi vai của họ.
2. Merge `test` → `main`.
3. Bấm `seed-prod-roles.yml`.

Bỏ bước 3: `HO_MARKETING` và `CENTER_MANAGER` **vẫn xuất được lead** (cổng AND cho qua vì DB vẫn còn dòng cũ) — rủi ro #17 vẫn mở dù tài liệu nói đã đóng. Bỏ bước 1: QLCS mất quyền xuất giữa ngày làm việc, không ai được báo.

Rào đi kèm A-03-7 (cấm cấp `leads:*` qua override từng người): xem hộp cảnh báo cuối §6.2.

**File đã đổi:** `app/api/admin/leads/export/route.ts` · `app/api/admin/leads/export/route.test.ts` (mới) · `app/(admin)/admin/leads/page.tsx` · `app/(admin)/admin/leads/_components/leads-table.tsx` · `app/(admin)/admin/leads/_components/leads-table.test.tsx` (mới) · `lib/auth/permissions.ts` · `prisma/seed-roles.ts` · `lib/auth/leads-export-role.test.ts` (mới) · `app/(admin)/admin/users/[id]/permissions/_actions.ts` · `app/(admin)/admin/users/[id]/permissions/_actions.test.ts` (mới).

### 11.5 Cổng GHI của QLCS đa cơ sở — đo bằng VAI, không bằng tầm nhìn đọc (A-01-6b, 26/08)

**Vá lỗ do chính A-01-6 mở ra.** A-01-6 (25/08) đổi 3 cổng GHI từ `record.centerId === user.centerId` sang `actor.visibleCenterIds.includes(...)` **AND** `passesScope(model, record, actor)`. Cả hai vế đều đo **tầm nhìn ĐỌC gộp của mọi vai**, nên phép AND không cắt được gì:

| Vế | Nở ra vì | Bằng chứng |
|---|---|---|
| `visibleCenterIds` | `buildActor` gán `rowCenters = everyCenter` cho **bất kỳ** vai nào neo ở HO/ROOT | `lib/auth/actor.ts:255`, `:278-281` |
| `passesScope` | `getModelVisibleCenterIds` khớp quyền theo **tiền tố action**, không biết quyền đó thuộc vai nào ⇒ một `classes:view-all`/`students:view-all` CHỈ-ĐỌC của vai khác cũng tính; vai neo HO còn cho `centerScope: "ALL"` | `lib/db-scope.ts:149-157`, `:236-244`; `lib/auth/actor.ts:339` |

Hai ca đo được bằng test chạy thật (`buildActor` + gate thật, chỉ thay đường nạp actor):

- **CA1 — kiêm nhiệm ngang:** `CENTER_MANAGER@CS1` + `CENTER_ACCOUNTANT@CS2`. Vai kế toán cơ sở mang `students:view-all` + `classes:view-all` (`prisma/seed-roles.ts:783-784`) ⇒ cổng mở ở CS2, nơi người này chỉ là **kế toán**: bắt đầu/chốt buổi, sửa–xoá điểm danh, chấm bài, chấm năng lực. `CENTER_SALES_CSM` dính y hệt (`:632`, `:634`).
- **CA2 — kiêm nhiệm lên HO, đi được bằng UI thường ngày:** `roles = [CENTER_MANAGER, MARKETING]`, ô "Đơn vị" = CS1. `planOrgRoleTargets` **luôn** neo MARKETING → `HO_MARKETING @ HO` bất kể ô Đơn vị (`lib/auth/legacy-role-map.ts:28`, `:105-106`); rào L-A5 chỉ cấm `CENTER_MANAGER` ở HO (§11.2) nên cấu hình này **hợp lệ**. ⇒ `isHoLevel` + `classes:view-all` GLOBAL tại HO ⇒ cổng mở ra **toàn hệ thống**. Đường `ACCOUNTANT`/`HR` neo HO (`HO_ACCOUNTANT`/`HO_HR`) cho kết quả y hệt.

**Phép đo mới — một vế duy nhất, đúng thứ cần đo:** `roleManagesCenter(actor, "CENTER_MANAGER", record.centerId)` (`lib/auth/managed-centers.ts`). Nó gom `PermEntry.centerScope` **chỉ của các entry có `roleCode` khớp**, tức suy từ đúng dòng `UserOrgRole` đẻ ra quyền. Tính chất:

- Tập trả về **luôn ⊆ `visibleCenterIds`** (mọi `rowCenters` đều đổ vào `visible` trong cùng vòng lặp) ⇒ giữ lại vế cũ là **thừa**, không phải "lớp thứ hai".
- **Không** đọc `actor.grantsAllow`: một dòng `UserPermissionGrant` không phải là "được giao quản lý cơ sở" — đây là thứ giữ cho ca "grant per-user `classes:edit` vẫn TỪ CHỐI cơ sở thứ ba" đứng vững (bẫy #13 ở phụ lục).
- Vai neo tại **REGION** ⇒ quản lý mọi cơ sở trong vùng, không hơn. Vai neo tại HO/ROOT ⇒ `"ALL"`; với `CENTER_MANAGER` thì L-A5 (§11.2) đã chặn cả hai đường ghi tạo ra cấu hình đó.

**Bán kính:** cổng buổi học dùng chung cho `attendance/_actions.ts:99` (đánh + sửa điểm danh) và `:288` (xoá), `assignments/_actions.ts:81`, `exams/_actions.ts:48`, checklist + `startSession`/`completeSession`, `sessions/[id]/page.tsx:92`. `scopedDb` **không** chặn hộ: `update`/`delete` đi thẳng, và `loadSessionForGate` cũng trả buổi của cơ sở lạ vì `ClassSession` bám cùng tiền tố `classes:`.

**Kèm theo:** `students/[id]/_actions.ts` chuyển sang đọc vai bằng `getFreshGateUser` (như cổng buổi học) — trước đó nó đọc vai từ JWT (`session.user`, không có mảng `roles`) nên **gỡ vai QLCS trong DB không có tác dụng cho tới khi người đó đăng xuất**.

⚠️ **Còn lệch, chưa sửa (ngoài phạm vi đợt này):** UI gate ở `app/(admin)/admin/students/[id]/edit/page.tsx:119-120` vẫn so `student.centerId === session.user.centerId` ⇒ QLCS 2 cơ sở **không thấy** editor năng lực ở cơ sở thứ hai dù server đã cho phép. Cổng thật ở server; đây là lớp hiển thị.

**File đã đổi:** `lib/auth/managed-centers.ts` (mới) · `lib/auth/managed-centers.test.ts` (mới) · `app/(admin)/admin/sessions/[id]/_actions.ts` · `app/(admin)/admin/sessions/[id]/_actions.test.ts` · `app/(admin)/admin/students/[id]/_actions.ts` · `app/(admin)/admin/students/[id]/_actions.test.ts` · `lib/lms/skill-access.ts` · `lib/lms/skill-access.test.ts`.

---

## Phụ lục — bẫy đã biết, tóm tắt

| # | Bẫy | Bằng chứng |
|---|---|---|
| 1 | Hai bảng grant trùng tên, hành vi ngược. Đọc nhầm bảng = kết luận sai hoàn toàn | `lib/permissions/can.ts:3-5` |
| 2 | `can()` v2 không có nhánh DENY; grant DENY bảng cũ bị vứt im lặng, có test ghim | `lib/auth/can.ts:52-59`, `lib/auth/can.test.ts:129-135` |
| 3 | UI `/admin/users/[id]/permissions` nói dối về hiệu lực DENY | `page.tsx:107-111` |
| 4 | `elearning:report:export` là key CHẾT, không call-site nào. (`leads:export` **đã nối** 25/08 — §11.4) | `lib/auth/permissions.ts:716`; `app/api/admin/leads/export/route.ts:38-42` |
| 5 | `action-registry.ts` không phải danh mục gốc, chỉ re-export | `action-registry.ts:5-8` |
| 6 | Key không khai trong `PERMISSIONS` ⇒ grant bị lọc mất im lặng | `lib/auth/actor.ts:240, :369` |
| 7 | Cờ v2 mặc định OFF trong code, tài liệu nói prod ON — không xác minh được từ repo | `lib/flags.ts:7-9` vs `.github/workflows/seed-prod-roles.yml:13` |
| 8 | Đường `runAction`/chat không qua cờ, luôn chạy v2 | `lib/permissions/can.ts:146` |
| 9 | `scopeType: CENTER` cho action call-site gọi trần = khoá trắng vai | `prisma/seed-roles.ts:11-29`, `lib/auth/can.ts:26` |
| 10 | `RolePermission` PK ghép ⇒ 1 vai chỉ 1 scopeType/action | `prisma/schema.prisma:424` |
| 11 | Lint `no-inline-authz` chỉ quét 5 glob dưới `app/`; 39 file được miễn | `eslint.config.mjs:108-114`, `lib/eslint/inline-authz-allowlist.mjs` |
| 12 | Không có UI sửa quyền của một `RoleDef` — phải qua seed | `roles/actions.ts:73` không có caller |
| 13 | Một grant ALLOW per-user mở `visibleCenterIds = "ALL"` cho cả model | `lib/db-scope.ts:248-254` |
| 14 | `isHoLevel` bật chỉ cần MỘT dòng vai neo tại HO/ROOT ⇒ thấy mọi cơ sở | `lib/auth/actor.ts:255`, `:276-281` |
| 15 | `scopedDb` không che write; nested include không scope; model chưa map prefix fail-open | `lib/db-scope.ts:347-375, :4-5, :226-228` |
| 16 | `visibleCenterIds` và `passesScope` đo **tầm nhìn ĐỌC gộp của mọi vai** ⇒ AND hai thứ đó **không** ra "cơ sở đang quản lý". Cổng GHI phải lọc theo `roleCode` (§11.5) | `lib/auth/managed-centers.ts`; `lib/db-scope.ts:236-244`; `lib/auth/actor.ts:255`, `:339` |
| 17 | Nhánh **GÁN** của `reconcileUserOrgRoles` hồi sinh dòng `MANUAL` **đã hết hiệu lực** và đổi nhãn về `AUTO` ⇒ "MANUAL bất khả xâm phạm" chỉ đúng với dòng **còn** hiệu lực (§11.1) | `lib/auth/org-role-sync.ts:238-266`, `:244-248` |
| 18 | `prisma migrate deploy` **TỰ chạy** khi push `main`/`test`, còn `seedRoles()` thì **KHÔNG** — quyền trong DB chỉ đổi khi bấm tay `seed-prod-roles.yml`. Trộn hai thứ này là nguồn của cả "lỗ tưởng đã vá" lẫn "mất quyền không báo trước" | `.github/workflows/deploy.yml:22-24`, `:60-64`; `migrate-test.yml:26-28`; `seed-prod-roles.yml:71` |
