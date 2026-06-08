# Ticket A0-06 — AuditLog hợp nhất

| | |
|---|---|
| **PR** | PR-A0-06 | **Ưu tiên** | P1 | **Ước lượng** | 3 ngày |
| **Phụ thuộc** | A0-02 (dùng chung), A0-03 (actor) | **Feature flag** | không | **Trạng thái** | TODO |
| **Nguồn** | Doc 15 §8.1 | | | |

---

## 1. Mục tiêu & bối cảnh
Giải **P7** (8 bảng audit copy nhau). 1 bảng `AuditLog` hợp nhất + helper + policy (scope viewer, mask PII, immutable, export-được-audit-lại). Bảng cũ giữ đọc-only.

## 2. Phạm vi
**In:** model `AuditLog`; helper `writeAudit({actor, module, entityType, entityId, action, oldValues, newValues, reason?, metadata})`; viewer `/admin/audit-log` scope theo center; mask PII theo quyền; chặn sửa/xóa qua UI.
**Out:** gộp/migrate 8 bảng cũ (Phase B); AuditExportLog chi tiết (phase sau — chỉ ghi audit cho hành động export ở task này).

## 3. Thiết kế kỹ thuật
```prisma
model AuditLog {
  id         String   @id @default(cuid())
  actorId    String?            // null = System
  actorName  String             // snapshot
  module     String
  entityType String
  entityId   String
  action     String             // CREATE/UPDATE/DELETE/STATUS_CHANGE/EXPORT/SCOPE_BYPASS...
  oldValues  Json?
  newValues  Json?
  changedFields String[]
  reason     String?
  orgUnitId  String?
  ip         String?
  userAgent  String?
  createdAt  DateTime @default(now())
  @@index([entityType, entityId, createdAt])
  @@index([orgUnitId, createdAt])
  @@index([actorId, createdAt])
}
```
- Helper tự `detectChangedFields(old,new)` + lấy ip/UA từ headers.
- Viewer: query qua `scopedDb` (Center chỉ thấy `orgUnitId` thuộc mình); SUPER_ADMIN + role `audit:view-all` thấy tất cả.
- Mask: nếu actor không có `pii:view`, các field SĐT/email trong old/new hiển thị `09xx***`.
- Không có server action update/delete AuditLog.

## 4. Acceptance Criteria
- **AC1** `writeAudit` ghi đúng actor/old/new/changedFields/reason/metadata.
- **AC2** Đổi role (A0-02) → sinh AuditLog tương ứng (kèm reason).
- **AC3** CENTER_MANAGER@CS1 mở viewer → chỉ thấy log `orgUnitId` thuộc CS1.
- **AC4** Không có UI/endpoint sửa hoặc xóa AuditLog.
- **AC5** Export audit → tạo thêm 1 AuditLog `action=EXPORT` (kèm filter + reason).
- **AC6** Viewer mask SĐT/email khi actor thiếu `pii:view`.
- **AC7** System action (cron/dispatcher) ghi `actorName="System"`, actorId null.

## 5. Files dự kiến
```
prisma/schema/shared.prisma (AuditLog)
lib/audit/audit-log.ts (writeAudit, detectChangedFields, mask)
app/(admin)/admin/audit-log/page.tsx + _components/*
tests/e2e/a0/audit.spec.ts
lib/audit/audit-log.test.ts
```

## 6. Edge cases
- old/new chứa Date/Decimal → serialize an toàn (không vỡ JSON).
- entity bị xóa rồi vẫn xem được log cũ (entityId lưu plain).
- actor là cron không có session → System.
- changedFields rỗng (không đổi gì) → vẫn cho ghi nếu action=VIEW-sensitive? (không — chỉ ghi khi có thay đổi hoặc action đặc thù).
- Khối lượng lớn → index theo (entityType,entityId,createdAt); partition để phase sau (§13.2).

## 7. Rollback / flag
Bảng mới — module mới ghi vào đây; bảng cũ vẫn chạy. Rollback = revert migration (chưa phụ thuộc).

## 8. Test plan
### T1/T9 — Functional / Audit
| Case | B/E | | Mong đợi |
| A0-06-T9-01 | B | writeAudit | đúng actor/old/new/changedFields/reason (AC1) |
| A0-06-T9-02 | B | đổi role → audit | có bản ghi (AC2) |
| A0-06-T9-03 | E | system action | actorName=System (AC7) |
| A0-06-T9-04 | E | changedFields tính đúng khi đổi 2 field | đúng tập field |
### T5 — Scope viewer
| A0-06-T5-01 | B | CM@CS1 xem viewer | chỉ log CS1 (AC3) |
| A0-06-T5-02 | B | CM@CS2 | chỉ log CS2 |
| A0-06-T5-03 | B | SUPER_ADMIN | thấy tất cả |
### T10 — Security / immutability / PII
| A0-06-T10-01 | B | tìm endpoint update/delete AuditLog | không tồn tại (AC4) |
| A0-06-T10-02 | B | actor thiếu pii:view xem log có SĐT | bị mask (AC6) |
| A0-06-T10-03 | B | export audit | sinh AuditLog EXPORT (AC5) |
| A0-06-T10-04 | E | IDOR: CM@CS1 mở log id của CS2 | không thấy |
### T8 — Edge
| A0-06-T8-01 | E | old/new chứa Date/Decimal | serialize OK |
| A0-06-T8-02 | E | entity đã xóa | log cũ vẫn xem được |

## 9. Test data
seedRoles+seedOrg; tạo vài AuditLog gắn orgUnit CS1/CS2 + 1 log có SĐT.

## 10. RTM
AC1→T9-01 · AC2→T9-02 · AC3→T5-01 · AC4→T10-01 · AC5→T10-03 · AC6→T10-02 · AC7→T9-03.

## 11. DoD
```
[ ] AC1–AC7 case (B) PASS · viewer scope đúng · không sửa/xóa được
[ ] typecheck+lint+build PASS · board+RTM cập nhật
```
