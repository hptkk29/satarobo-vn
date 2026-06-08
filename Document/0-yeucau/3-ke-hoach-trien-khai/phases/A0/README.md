# Phase A0 — Board & Task Tickets (chi tiết cấp giao việc)

> Mỗi task = 1 **ticket đầy đủ 11 mục** (đủ để dev cầm là code, tester cầm là test) theo template ở `../00-quy-trinh-thuc-hien.md` §5c.
> Test viết theo **taxonomy 12 nhóm** (§5b) — phủ tối đa, không chỉ "bắt buộc". Case `(B)` = cổng tối thiểu, `(E)` = mở rộng.

## Board

| Task | Ticket | Ưu tiên | Ước lượng | Phụ thuộc | Số AC | Số test (B/tổng ~) | Trạng thái |
|---|---|---|---|---|---|---|---|
| A0-00 | [Test infra](A0-00-test-infra.md) | P0 | 2d | — | 4 | 2/4 | ✅ DONE — harness + e2e PASS trên Postgres local (2026-06-08); AC1–AC4 xanh; seedRoles chờ A0-02 |
| A0-01 | [OrgUnit](A0-01-orgunit.md) | P0 | 5d | 00 | 8 | 13/24 | ✅ DONE — domain (29 ✓) + DB layer; migration apply OK + 11 e2e PASS trên Postgres local (2026-06-08) |
| A0-02 | [RBAC động](A0-02-rbac.md) | P0 | 6d | 01 | 9 | 14/25 | 🟡 data+service+seed+UI DONE; 22 test PASS local (8 Vitest + 14 e2e, AC1–AC9); browser-UI e2e + setPermissions UI nâng cao deferred |
| A0-03 | [ActorResolver + can() v2](A0-03-actor-resolver-can-v2.md) | P0 | 4d | 02 | 12 | 28/40 | ✅ DONE — engine (actor/can/shadow/flag); 31 test PASS local (27 Vitest + 4 e2e, AC1–AC12); wire runtime + shadow ở phase chuyển dịch |
| A0-04 | [scopedDb](A0-04-scoped-db.md) | P0 ⚠️ | 4d | 03 | 10 | 16/24 | 🟡 cơ chế scopedDb + 25 test PASS local (14 Vitest + 11 e2e, T5 6 góc 2 chiều, IDOR, bypass); flip ESLint→error + AC7 nested chờ migrate (219 callsite) |
| A0-05 | [Common login](A0-05-common-login.md) | P0 | 3d | 03 | 7 | 9/14 | ✅ DONE — lõi decideRoute/sanitize có sẵn + flag + 7 test AC (2026-06-08) |
| A0-06 | [AuditLog](A0-06-audit-log.md) | P1 | 3d | 02 | 7 | 10/15 | 🟡 model+writeAudit+mask+scope; 9 test PASS local; viewer UI boy-scout (2026-06-08) |
| A0-07 | [DomainEvent outbox](A0-07-domain-event-outbox.md) | P1 | 4d | 01 | 8 | 11/15 | TODO |
| A0-08 | [EmployeeOrgAssignment](A0-08-employee-assignment.md) | P1 | 3d | 01 | 9 | 12/18 | TODO |

> Số test là ước lượng để tester biết khối lượng — con số thực tế khi viết có thể nhiều hơn (khuyến khích phủ thêm case E).

## Thứ tự thực thi
```
A0-00 → A0-01 → A0-02 → { A0-03 → (A0-04, A0-05) }  ‖  (A0-06, A0-07, A0-08 song song sau 01/02)
```

## Cổng đóng Phase A0 (Exit Criteria — Doc 15 §10)
```
[ ] 9 ticket = DONE (mọi AC có case B PASS)
[ ] pnpm test:phase (Vitest + tests/e2e/a0) xanh
[ ] Đối chiếu RTM mỗi ticket: không AC nào thiếu case
[ ] A0-04 T5 (6 góc isolation, 2 chiều) + A0-03 T4 (ma trận quyền) toàn xanh — cổng bảo mật
[ ] DEMO 6 kịch bản: tạo role qua UI / HO thấy toàn hệ thống · CS1 chỉ CS1 / scope chặn query thiếu filter / thêm consumer 1 dòng / đổi quyền hiệu lực ngay / login chung redirect đúng
```

## Lệnh chống miss case (chạy trước khi đóng phase)
```bash
# Liệt kê mọi case đã viết trong code, so với RTM từng ticket
grep -rho "\[A0-[0-9]\+-[A-Za-z0-9.-]\+\]" tests/ lib/ | sort -u
```
