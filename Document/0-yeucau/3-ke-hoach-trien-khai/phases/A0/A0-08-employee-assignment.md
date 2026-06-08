# Ticket A0-08 — EmployeeOrgAssignment foundation

| | |
|---|---|
| **PR** | PR-A0-08 | **Ưu tiên** | P1 | **Ước lượng** | 3 ngày |
| **Phụ thuộc** | A0-01 | **Feature flag** | không | **Trạng thái** | 🟡 model+service+test PASS local (2026-06-08); UI nhan-su boy-scout |

> ⚙️ **Tiến độ (2026-06-08) — chạy thật trên PG local:**
> - ✅ **Model `EmployeeOrgAssignment` + enum `AssignmentType`** (migration `20260608050000`).
> - ✅ **`lib/org/assignment-service.ts`:** createAssignment/updateAssignment + `validateAllocation`/`isActiveAssignment` (thuần) + `getActiveAssignments`/`getStaffOfCenter` (OI-6). Rule: allocation [0,100], tổng>100 → cảnh báo (không chặn), effectiveTo≥From, orgUnit active, ≤1 PRIMARY active. Ghi AuditLog (A0-06).
> - ✅ **Test PASS:** Vitest 7 (validateAllocation/isActiveAssignment) + e2e 11 — **đặc biệt T4-01 (AC2): NV chỉ có assignment, KHÔNG UserOrgRole → can()=false** (assignment KHÔNG sinh quyền, OI-4); T4-02 thêm UserOrgRole → có quyền (AC3); + 5 type, validation, PRIMARY-unique, getStaffOfCenter, lifecycle, audit.
> - ⏳ **Deferred:** UI `/admin/nhan-su/[id]/assignments` (boy-scout); công thức lương/chi phí = phase sau (chỉ chuẩn bị data).
| **Nguồn** | Doc 15 §2.2, OI-6/OI-8/OI-9/OI-10 | | | |

---

## 1. Mục tiêu & bối cảnh
Tách **nhân sự/kiêm nhiệm/lương** khỏi **quyền hệ thống**. `EmployeeOrgAssignment` ghi nhận 1 NV thuộc/kiêm nhiệm OrgUnit nào, loại phân công, thời hạn, % phân bổ chi phí — **KHÔNG sinh quyền** (quyền chỉ từ UserOrgRole). Nền cho phân bổ lương (phase sau) + quy tắc Center Manager quản HO staff (OI-6).

## 2. Phạm vi
**In:** model `EmployeeOrgAssignment` (assignmentType 5 loại, effectivity, allocationPercent); CRUD qua `/admin/nhan-su/[id]/assignments` (quyền HR/SUPER_ADMIN); helper `getActiveAssignments(employeeId)`, `getStaffOfCenter(orgUnitId)`.
**Out:** công thức tính lương/chi phí (phase sau — chỉ chuẩn bị data); tự sinh quyền (cấm).

## 3. Thiết kế kỹ thuật
```prisma
enum AssignmentType { PRIMARY SECONDARY SUPPORT SUBSTITUTE SHARED }
model EmployeeOrgAssignment {
  id             String   @id @default(cuid())
  employeeId     String
  orgUnitId      String
  roleInOrg      String?           // mô tả vai trò nghiệp vụ (không phải RoleDef)
  assignmentType AssignmentType
  effectiveFrom  DateTime @default(now())
  effectiveTo    DateTime?
  status         AssignStatus @default(ACTIVE)
  allocationPercent Int?           // 0..100 — phân bổ chi phí/lương
  createdById    String
  createdAt      DateTime @default(now())
  @@index([employeeId, status])
  @@index([orgUnitId, status])
}
```
**Validation:** allocationPercent ∈ [0,100]; tổng allocationPercent active của 1 employee ≤ 100 (cảnh báo nếu >100); effectiveTo ≥ effectiveFrom; orgUnit tồn tại & active; mỗi employee ≤ 1 PRIMARY active.
**Helper:** `getStaffOfCenter(orgUnitId)` = NV có assignment active tại đó (phục vụ OI-6 — Center Manager quản người có assignment).

## 4. Acceptance Criteria
- **AC1** Tạo assignment đủ 5 loại assignmentType + allocationPercent.
- **AC2** NV chỉ có EmployeeOrgAssignment (không UserOrgRole) → **KHÔNG có quyền** vào dữ liệu center đó.
- **AC3** NV có thêm UserOrgRole tương ứng → có quyền đúng role.
- **AC4** Assignment hết hạn (`effectiveTo < now`) hoặc status≠ACTIVE → không còn active.
- **AC5** `effectiveTo < effectiveFrom` → từ chối.
- **AC6** allocationPercent ngoài [0,100] → từ chối; tổng active >100 → cảnh báo.
- **AC7** Mỗi employee chỉ 1 PRIMARY active.
- **AC8** `getStaffOfCenter(CS1)` chỉ trả NV có assignment active tại CS1 (OI-6 — nền cho Center Manager).
- **AC9** Thay đổi assignment → ghi AuditLog.

## 5. Files dự kiến
```
prisma/schema/organization.prisma (EmployeeOrgAssignment + enum)
lib/org/assignment-service.ts (CRUD + validation)
app/(admin)/admin/nhan-su/[id]/assignments/page.tsx + actions.ts
tests/e2e/a0/employee-assignment.spec.ts
lib/org/assignment-service.test.ts
```

## 6. Edge cases
- Tạo SUBSTITUTE có hạn (dạy thay 1 tháng) → effectiveTo set; hết hạn tự inactive.
- allocationPercent null (chưa khai) → cho phép, không tính vào tổng.
- Xóa employee → assignment xử lý ra sao (cascade/giữ lịch sử) → giữ + status EXPIRED.
- Assignment tại orgUnit soft-deleted → từ chối tạo.
- NV có PRIMARY ở CS1, SUPPORT ở CS2 cùng lúc → hợp lệ (kiêm nhiệm).

## 7. Rollback / flag
Data mới, không cấp quyền → revert migration an toàn.

## 8. Test plan
### T1 — Functional
| Case | B/E | | Mong đợi |
| A0-08-T1-01 | B | tạo đủ 5 assignmentType | OK (AC1) |
| A0-08-T1-02 | B | getStaffOfCenter(CS1) | đúng tập NV active CS1 (AC8) |
| A0-08-T1-03 | E | NV PRIMARY@CS1 + SUPPORT@CS2 | cả 2 active |
### T2/T3 — Validation / boundary
| A0-08-T2-01 | B | effectiveTo < effectiveFrom | từ chối (AC5) |
| A0-08-T2-02 | B | allocationPercent = 101 | từ chối (AC6) |
| A0-08-T3-01 | E | allocationPercent = 0 và =100 (biên) | OK |
| A0-08-T2-03 | E | tổng allocation active = 120 | cảnh báo (AC6) |
| A0-08-T2-04 | B | tạo PRIMARY thứ 2 active | từ chối (AC7) |
| A0-08-T2-05 | E | orgUnit soft-deleted | từ chối |
### T4/T10 — Quyền KHÔNG sinh từ assignment (cốt lõi OI-4)
| A0-08-T4-01 | B | NV chỉ assignment, không UserOrgRole → mở dữ liệu CS đó | **bị chặn** (AC2) |
| A0-08-T4-02 | B | NV thêm UserOrgRole → mở dữ liệu | có quyền (AC3) |
### T7 — Lifecycle
| A0-08-T7-01 | B | effectiveTo < now | không active (AC4) |
| A0-08-T7-02 | B | status=EXPIRED | không active |
| A0-08-T7-03 | E | effectiveTo == now (biên) | còn active |
| A0-08-T7-04 | E | xóa employee | assignment giữ lịch sử, EXPIRED |
### T9
| A0-08-T9-01 | B | sửa assignment | AuditLog ghi (AC9) |

## 9. Test data
employee fixtures: empAssignOnly (chỉ assignment), empWithRole (assignment + UserOrgRole), empMultiCenter.

## 10. RTM
AC1→T1-01 · AC2→T4-01 · AC3→T4-02 · AC4→T7-01 · AC5→T2-01 · AC6→T2-02 · AC7→T2-04 · AC8→T1-02 · AC9→T9-01.

## 11. DoD
```
[ ] AC1–AC9 case (B) PASS — ĐẶC BIỆT T4-01 (assignment KHÔNG sinh quyền)
[ ] typecheck+lint+build PASS · board+RTM cập nhật
```
