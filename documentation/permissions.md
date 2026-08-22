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
| `UserOrgRole` | `prisma/schema.prisma:525-540` | Gắn người × đơn vị × vai. `effectiveFrom/To`, `status AssignStatus`, `grantedById`. **PK ghép `@@id([userId, orgUnitId, roleId])`** ⇒ 1 user gắn được N dòng ở N đơn vị, KHÔNG ràng buộc nào chặn gắn nhiều nhánh cây. | ✅ **nguồn chính** |
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
| `leads:export` | HO_MARKETING`[G]` (`seed:229`), CENTER_MANAGER`[G]` (`seed:411`) | SUPER_ADMIN, CENTER_MANAGER, MARKETING (`:362`) |

Vị trí seed: HO_MARKETING `prisma/seed-roles.ts:219-229` · HO_SALE `:376` · CENTER_MANAGER `:403-411` · CENTER_SALES_CSM `:611-618`.

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
| `roles:assign` | SUPER_ADMIN`[G]` (`seed:36`) | SUPER_ADMIN (`:612`) |
| `user-groups:manage` | SUPER_ADMIN`[G]` (`seed:38`) | SUPER_ADMIN (`:614`) |
| `users:manage` | *(không seed cho vai nào — chỉ SUPER_ADMIN qua bypass)* | SUPER_ADMIN (`:611`) |
| `settings:view` / `settings:edit` | *(không seed)* | SUPER_ADMIN (`:609-610`) |
| `audit-logs:view` / `audit-logs:view-pii` | *(không seed)* | SUPER_ADMIN (`:605-606`) |

Cả 4 nhóm này chỉ SUPER_ADMIN, và mọi mutation RBAC đi qua `lib/auth/rbac-service.ts` đều **ghi `RbacAuditLog` + đòi `reason` bắt buộc**. Chống leo thang: chỉ SUPER_ADMIN được gán vai `SUPER_ADMIN` (`lib/auth/rbac-service.ts:186-193`, mã lỗi `FORBIDDEN_ROLE`).

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
| `leads:export` | `:67` | `:362` | `crm.ts:29` |
| `leads:import` | `:68` | `:366` | `crm.ts:30-33` |
| `leads:view-pii` | `:74` | `:356` | `crm.ts:11-15` (có `sensitiveFields: ["parentName","phone","email","childName","note"]`) |

### 6.2 Mọi key kết thúc `:export` — đúng 2 key, **cả hai đều CHẾT**

| Key | Khai ở | Có call-site enforce? |
|---|---|---|
| `leads:export` | `permissions.ts:67`, `:362`; `registry/crm.ts:29`; seed `:229`, `:411` | ❌ **KHÔNG** |
| `elearning:report:export` | `permissions.ts:311`, `:716`; `registry/elearning.ts:124`; seed `:70,:170,:369,:549,:801` | ❌ **KHÔNG** |

Không có key nào bắt đầu bằng `export:`.

**🔴 Đây là mâu thuẫn quan trọng nhất của mục này.** `grep "leads:export"` trên `app/` + `lib/` chỉ ra 8 hit, **toàn bộ** nằm trong file khai báo (`permissions.ts`, `registry/crm.ts`) hoặc file test (`lib/auth/active-role.test.ts:32`, `lib/auth/menu-permissions.test.ts:121,122,193,194`). **Không một `checkPermission("leads:export")` nào tồn tại.**

Các endpoint xuất file THẬT gác bằng key khác:

| Endpoint | Gate thật | file:dòng |
|---|---|---|
| Xuất CSV lead | `leads:view-all` | `app/api/admin/leads/export/route.ts:29` |
| Xuất Excel lịch ca chấm công | `hr_attendance:view` (có truyền `centerId`) | `app/api/admin/cham-cong/shift-export/route.ts:35` |
| Xuất Excel hoa hồng | `payments:manage` | `app/api/admin/crm/commission-export/route.ts:19` |

**Hệ quả:** gỡ `leads:export` của một vai để "chặn xuất file" là **không có tác dụng gì**. Cần quyền xuất riêng cho module mới thì phải **vừa khai key vừa sửa call-site**, đừng tin là có sẵn.

> 🔴 **ĐÍNH CHÍNH QUAN TRỌNG — `leads:export` KHÔNG vô hại.** Câu "không có tác dụng gì" chỉ đúng cho đường **role**. Cấp `leads:export` = `ALLOW` qua **`UserPermissionGrant`** (màn `/admin/users/[id]/permissions`) thì `getModelVisibleCenterIds` quét `actor.grantsAllow`, thấy action bắt đầu bằng prefix `leads:` là đặt `hasAll = true` và trả `"ALL"` (`lib/db-scope.ts:248-256`) ⇒ **`scopedDb` NGỪNG cách ly cơ sở** cho `Lead`, `MessengerConversation` (`lib/db-scope.ts:133-136`) và `LeadTrialHistory` (`:180-183`).
> Tức key "chết" này thực chất là một **công tắc mở tầm nhìn lead TOÀN HỆ THỐNG** cho người được cấp. Guard chống leo thang ở `app/(admin)/admin/users/[id]/permissions/_actions.ts:65-77` chỉ chặn `roles:*` và `users:manage` — **không** chặn key này.

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
| B6 | call-site `checkPermission`/`assertPermission` | Key chết như `leads:export` |
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

`prisma/seed-roles.ts:805-815` — `isSystem`, đúng 3 quyền:

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

## Phụ lục — bẫy đã biết, tóm tắt

| # | Bẫy | Bằng chứng |
|---|---|---|
| 1 | Hai bảng grant trùng tên, hành vi ngược. Đọc nhầm bảng = kết luận sai hoàn toàn | `lib/permissions/can.ts:3-5` |
| 2 | `can()` v2 không có nhánh DENY; grant DENY bảng cũ bị vứt im lặng, có test ghim | `lib/auth/can.ts:52-59`, `lib/auth/can.test.ts:129-135` |
| 3 | UI `/admin/users/[id]/permissions` nói dối về hiệu lực DENY | `page.tsx:107-111` |
| 4 | `leads:export` + `elearning:report:export` là key CHẾT, không call-site nào | grep `app/` `lib/` = 0 hit ngoài khai báo/test |
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
