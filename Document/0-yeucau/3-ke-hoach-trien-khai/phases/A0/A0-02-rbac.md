# Ticket A0-02 — RoleDef + RolePermission + UserOrgRole + UI cấp quyền

| | |
|---|---|
| **PR** | PR-A0-02 | **Ưu tiên** | P0 |
| **Ước lượng** | 6 ngày | **Phụ thuộc** | A0-01, A0-06 (audit — có thể song song, gắn sau) |
| **Feature flag** | không (data mới; can() v2 bật ở A0-03) | **Trạng thái** | TODO |
| **Nguồn** | Doc 15 §2.2/§2.3, OI-2/OI-3/OI-8/OI-9 | | |

---

## 1. Mục tiêu & bối cảnh
Giải **P2** (ma trận quyền hardcode trong `permissions.ts`) + nền cho **P1/P8**. Đưa role + permission + gán-quyền vào DB, admin tự cấu hình qua UI, mỗi user nhiều vai ở nhiều OrgUnit có hiệu lực theo thời gian.

## 2. Phạm vi
**In:** 3 model (`RoleDef`, `RolePermission`, `UserOrgRole`); `ACTION_REGISTRY` (danh mục action hợp lệ, code); seed bộ role §2.3; CRUD role + gán permission qua `/admin/roles` (chỉ SUPER_ADMIN, reason bắt buộc, audit); gán/thu hồi `UserOrgRole` qua `/admin/users/[id]/permissions`.
**Out:** can()/ActorResolver (A0-03); scopedDb (A0-04); xóa `User.role/roles[]` (Phase C).

## 3. Thiết kế kỹ thuật

```prisma
enum ScopeType { GLOBAL CENTER CLASS OWN CHILDREN ASSIGNED }
enum AssignStatus { ACTIVE SUSPENDED EXPIRED }

model RoleDef {
  id        String   @id @default(cuid())
  code      String   @unique         // HO_ACCOUNTANT, CENTER_MANAGER...
  name      String
  isSystem  Boolean  @default(false)  // SUPER_ADMIN, PARENT — không xóa/sửa code
  isActive  Boolean  @default(true)
  permissions RolePermission[]
  userRoles   UserOrgRole[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
model RolePermission {
  roleId    String
  action    String        // validate qua ACTION_REGISTRY
  scopeType ScopeType
  role      RoleDef @relation(fields:[roleId], references:[id], onDelete: Cascade)
  @@id([roleId, action])
}
model UserOrgRole {
  userId        String
  orgUnitId     String
  roleId        String
  effectiveFrom DateTime  @default(now())
  effectiveTo   DateTime?            // null = vô thời hạn
  status        AssignStatus @default(ACTIVE)
  grantedById   String               // ai cấp (audit)
  createdAt     DateTime @default(now())
  @@id([userId, orgUnitId, roleId])
  @@index([userId])
  @@index([orgUnitId])
}
```

**ACTION_REGISTRY** (`lib/auth/action-registry.ts`): mảng const mọi action `'<resource>:<verb>'` (single source — validator + UI dropdown đọc từ đây). Gán action ngoài registry → từ chối.

**Seed role §2.3** (`prisma/seed-roles.ts`): SUPER_ADMIN*(isSystem), HO_ACCOUNTANT, HO_HR, HO_MARKETING, HO_SALE, CENTER_MANAGER, CENTER_SALES_CSM, TEACHER, ASSISTANT_TEACHER, CENTER_ACCOUNTANT, PARENT*(isSystem). **KHÔNG seed HO_MANAGER.** Mỗi role seed kèm RolePermission mẫu + scopeType (HO_* → GLOBAL theo module; CENTER_* → CENTER; TEACHER → CLASS/ASSIGNED; PARENT → CHILDREN).

**Server actions (`/admin/roles/actions.ts`):** `createRole/updateRole/deleteRole/setRolePermissions` — đầu mỗi action: `auth()` + `assertCan(actor,'roles:manage')` + **chỉ SUPER_ADMIN** + Zod parse + **reason bắt buộc** + ghi AuditLog (old/new).
**`/admin/users/[id]/permissions/actions.ts`:** `assignUserOrgRole/revokeUserOrgRole` (kèm effectiveFrom/To) — `roles:assign`, audit.

## 4. Acceptance Criteria
- **AC1** SUPER_ADMIN tạo role mới + gán ≥1 permission (action+scopeType) qua UI → lưu OK, dùng được ngay (không deploy).
- **AC2** Non-SUPER_ADMIN truy cập `/admin/roles` (mọi action CRUD) → bị chặn (403/redirect).
- **AC3** Tạo/sửa/xóa role hoặc gán quyền KHÔNG có `reason` → bị chặn.
- **AC4** Mọi thay đổi role/permission/assignment → ghi AuditLog đúng actor + old/new + reason.
- **AC5** Gán action ngoài `ACTION_REGISTRY` → bị từ chối.
- **AC6** 1 user gán 3 `UserOrgRole` (HO/HO_MARKETING + CS1/CENTER_SALES_CSM + CS2/...) → đọc lại đủ 3.
- **AC7** `UserOrgRole` lưu đúng effectiveFrom/To/status.
- **AC8** Seed KHÔNG tồn tại role `HO_MANAGER`; có đủ 11 role §2.3.
- **AC9** Role `isSystem` (SUPER_ADMIN/PARENT) không cho đổi `code`/xóa.

## 5. Files dự kiến
```
prisma/schema/identity.prisma           (3 model + 2 enum)
prisma/migrations/<ts>_add_dynamic_rbac/
prisma/seed-roles.ts
lib/auth/action-registry.ts
lib/validators/role.ts                   (roleSchema, rolePermissionSchema, assignSchema — reason required)
app/(admin)/admin/roles/page.tsx + _components/* + actions.ts
app/(admin)/admin/users/[id]/permissions/page.tsx + actions.ts
tests/e2e/a0/rbac.spec.ts
lib/auth/action-registry.test.ts
lib/auth/role-validator.test.ts
```

## 6. Edge cases & xử lý lỗi
- Xóa role đang được gán cho user → **chặn** (hoặc yêu cầu thu hồi trước) + cảnh báo số user bị ảnh hưởng.
- Đổi `code` role isSystem → từ chối.
- Gán cùng (user,orgUnit,role) 2 lần → upsert/idempotent, không nhân đôi.
- `effectiveTo < effectiveFrom` → từ chối.
- Gán UserOrgRole với orgUnit đã soft-deleted → từ chối.
- Tạo role `code` trùng → CONFLICT.
- Permission action có trong registry nhưng `scopeType` không hợp lệ với action (vd action global gán scope CLASS) → cảnh báo/từ chối (nếu định nghĩa ràng buộc).

## 7. Rollback / Feature flag
Data mới — chưa ai dùng cho tới A0-03 (can() v2 sau cờ). Rollback = revert migration. Matrix cũ `permissions.ts` vẫn nguyên.

## 8. Test plan (đầy đủ)

### T1 — Functional
| Case | B/E | Bước | Mong đợi |
|---|---|---|---|
| A0-02-T1-01 | B | SUPER_ADMIN tạo role + gán permission | OK (AC1) |
| A0-02-T1-02 | B | Seed roles | đủ 11 role §2.3, không HO_MANAGER (AC8) |
| A0-02-T1-03 | B | Gán 3 UserOrgRole cho 1 user | đọc lại đủ 3 (AC6) |
| A0-02-T1-04 | E | Sửa name role thường (non-system) | OK |
| A0-02-T1-05 | E | Thu hồi 1 UserOrgRole | bản ghi mất/EXPIRED |

### T2 — Negative / Validation
| Case | B/E | Input | Mong đợi |
|---|---|---|---|
| A0-02-T2-01 | B | Tạo role không reason | chặn (AC3) |
| A0-02-T2-02 | B | Gán action ngoài registry | từ chối (AC5) |
| A0-02-T2-03 | B | `code` role trùng | CONFLICT |
| A0-02-T2-04 | E | `code` sai định dạng | VALIDATION_ERROR |
| A0-02-T2-05 | B | `effectiveTo < effectiveFrom` | từ chối |
| A0-02-T2-06 | E | Gán role cho orgUnit soft-deleted | từ chối |

### T4 — Permission / RBAC
| Case | B/E | Actor | Mong đợi |
|---|---|---|---|
| A0-02-T4-01 | B | CENTER_MANAGER mở /admin/roles | 403/redirect (AC2) |
| A0-02-T4-02 | B | HO_HR thử tạo role | từ chối (chỉ SUPER_ADMIN) |
| A0-02-T4-03 | E | Anonymous /admin/roles | redirect /login |
| A0-02-T4-04 | E | SUPER_ADMIN thực hiện được mọi CRUD | OK |

### T7 — State / Lifecycle
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-02-T7-01 | B | UserOrgRole lưu effectiveFrom/To/status | đúng (AC7) |
| A0-02-T7-02 | B | Đổi code role isSystem | từ chối (AC9) |
| A0-02-T7-03 | B | Xóa role isSystem | từ chối (AC9) |
| A0-02-T7-04 | E | Xóa role đang gán user | chặn + cảnh báo |
| A0-02-T7-05 | E | Gán trùng (user,org,role) | idempotent |

### T9 — Audit
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-02-T9-01 | B | Sau create/update/delete role | AuditLog đúng actor+old/new+reason (AC4) |
| A0-02-T9-02 | B | Sau assign/revoke UserOrgRole | AuditLog ghi |
| A0-02-T9-03 | E | AuditLog không sửa được qua UI | đúng (liên kết A0-06) |

### T10 — Security
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-02-T10-01 | B | Gọi thẳng action `createRole` bằng tài khoản non-SA (bỏ qua UI) | assertCan chặn (không chỉ ẩn nút) |
| A0-02-T10-02 | E | Inject action string lạ qua API | registry chặn |
| A0-02-T10-03 | E | IDOR: HO_HR gọi assignUserOrgRole cho user khác | chặn nếu thiếu quyền |

### T12 — Regression
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-02-T12-01 | B | Hệ thống cũ (matrix permissions.ts + User.role) vẫn hoạt động | true (chưa cắt) |

## 9. Test data
`seedRoles()` + `seedOrg()`; user fixture `superAdmin`, `hoHr`, `centerManagerCS1`, `multiRoleUser`.

## 10. RTM
| AC | Case (B) | File |
|---|---|---|
| AC1 | T1-01 | rbac.spec.ts |
| AC2 | T4-01 | rbac.spec.ts |
| AC3 | T2-01 | rbac.spec.ts |
| AC4 | T9-01/02 | rbac.spec.ts |
| AC5 | T2-02 | action-registry.test.ts |
| AC6 | T1-03 | rbac.spec.ts |
| AC7 | T7-01 | role-validator.test.ts |
| AC8 | T1-02 | rbac.spec.ts |
| AC9 | T7-02/03 | rbac.spec.ts |

## 11. DoD
```
[ ] AC1–AC9 có case (B) PASS
[ ] T10-01 PASS (chặn ở server action, không chỉ ẩn UI)
[ ] typecheck+lint+build PASS · migration tên rõ
[ ] seed roles idempotent, đúng 11 role
[ ] Cập nhật board A0 + RTM
```
