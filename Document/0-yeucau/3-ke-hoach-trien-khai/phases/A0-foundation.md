# Phase A0 — Foundation Architecture (bảng tổng)

> 📂 **TASK-TICKET CHI TIẾT (cấp giao việc + test phủ tối đa):** xem thư mục **[`A0/`](A0/README.md)** — mỗi task 1 ticket đầy đủ 11 mục (mục tiêu, thiết kế kỹ thuật, AC, edge case, rollback, **test plan 12 nhóm**, RTM, DoD). File này chỉ là bảng tổng nhanh.

> **Mục tiêu phase:** dựng nền OrgUnit + RBAC động + scopedDb + login chung + outbox + audit — để mọi phase sau xây trên nền chuẩn. **~3 tuần.**
> **Nguồn:** Doc 15 §2/§4/§9 (A0 PR breakdown)/§10 (DoD)/§11 (Open Items).
> **Quy trình:** theo `00-quy-trinh-thuc-hien.md` — Task → Test → Check.
> **An toàn:** additive trước (không drop field cũ), can() v2 chạy song song matrix cũ, mọi thứ có cờ rollback.

---

## 0. Bảng task tổng (8 PR + 1 setup)

| Task ID | PR | Mô tả | Phụ thuộc | Test bắt buộc | Trạng thái | Người | Ngày DONE |
|---|---|---|---|---|---|---|---|
| A0-00 | — | Setup test infra (helpers, scripts test:e2e:a0, CI gate) | — | C0.1–C0.2 | TODO | | |
| A0-01 | PR-A0-01 | OrgUnit schema + seed ROOT/HO/CS1/CS2 | A0-00 | C1.1–C1.6 | TODO | | |
| A0-02 | PR-A0-02 | RoleDef + RolePermission + UserOrgRole + UI cấp quyền | A0-01 | C2.1–C2.7 | TODO | | |
| A0-03 | PR-A0-03 | ActorResolver + can() v2 (song song matrix cũ) | A0-02 | C3.1–C3.6 | TODO | | |
| A0-04 | PR-A0-04 | scopedDb + ESLint boundary | A0-03 | C4.1–C4.6 | TODO | | |
| A0-05 | PR-A0-05 | Common login `satarobo.vn/login` + redirect | A0-03 | C5.1–C5.5 | TODO | | |
| A0-06 | PR-A0-06 | AuditLog hợp nhất | A0-02 | C6.1–C6.4 | TODO | | |
| A0-07 | PR-A0-07 | DomainEvent outbox + dispatcher | A0-01 | C7.1–C7.4 | TODO | | |
| A0-08 | PR-A0-08 | EmployeeOrgAssignment foundation | A0-01 | C8.1–C8.4 | TODO | | |

> Thứ tự thực thi đề xuất: A0-00 → 01 → 02 → (03, 06, 07, 08 song song được sau 02/01) → 04 → 05.

---

## A0-00 — Setup test infra

**Việc:**
- `tests/e2e/_helpers/`: `auth.ts` (`loginAs(page,{role,orgUnit})`), `seed.ts` (`seedOrg`, `seedUser`, `resetDb`), `fixtures.ts`.
- Thêm scripts `test:e2e:a0`, `test:phase` (mục 5.3 quy trình).
- CI: thêm job `e2e-a0` chạy `playwright test tests/e2e/a0` trên Postgres service.

**Test case bắt buộc:**
| ID | Loại | Nội dung |
|---|---|---|
| C0.1 | Playwright | `loginAs` tạo được session cho 1 role/orgUnit và vào được trang admin |
| C0.2 | Playwright | `resetDb + seedOrg(["HO","CS1","CS2"])` tạo đúng 4 OrgUnit (ROOT+3) |

**Check (DoD):** helpers chạy được · `pnpm test:e2e:a0` chạy (kể cả 0 test) · CI job xanh.

---

## A0-01 — OrgUnit schema + seed

**Việc (Doc 15 §2.1):**
- Model `OrgUnit`: `id, type(ROOT|HO|CENTER|CAMPUS|PARTNER|FRANCHISE), code(unique), name, address?, parentId?, isActive, deletedAt`.
- Validate: unique `code`; chặn **parent cycle**; soft delete.
- Seed: ROOT(SataRobo) → HO, CS1(211 Nguyễn Hữu Thọ), CS2(114 Hoàng Diệu) — **độc lập ngang hàng dưới ROOT**.
- ⚠️ HO và CS2 **cùng address được phép** nhưng khác id/code/type; **không** tạo Location model.

**Test case bắt buộc:**
| ID | Loại | Nội dung |
|---|---|---|
| C1.1 | Playwright/seed | Seed tạo đúng ROOT + HO + CS1 + CS2; HO.parentId = ROOT (KHÔNG = CS2) |
| C1.2 | Vitest | Tạo OrgUnit trùng `code` → bị từ chối |
| C1.3 | Vitest | Set parentId tạo vòng lặp (A→B→A) → bị từ chối |
| C1.4 | Vitest | HO và CS2 cùng `address` nhưng khác id/type → tạo được |
| C1.5 | Vitest | Soft delete OrgUnit → không xuất hiện ở query mặc định |
| C1.6 | Vitest | Thêm CS3 (type CENTER) → tree hợp lệ, không cần đổi logic seed |

**Check (DoD):** migration tên rõ + restart dev · seed idempotent · 6 case xanh.

---

## A0-02 — RoleDef + RolePermission + UserOrgRole

**Việc (Doc 15 §2.2/§2.3, OI-2/OI-3/OI-8):**
- `RoleDef(code unique, name, isSystem)`; `RolePermission(roleId, action, scopeType)`; `UserOrgRole(userId, orgUnitId, roleId, effectiveFrom, effectiveTo, status)`.
- `ACTION_REGISTRY` (code) — validate action string khi gán.
- Seed role §2.3: SUPER_ADMIN*, HO_ACCOUNTANT, HO_HR, HO_MARKETING, HO_SALE, CENTER_MANAGER, CENTER_SALES_CSM, TEACHER, ASSISTANT_TEACHER, CENTER_ACCOUNTANT, PARENT*. (**Không HO_MANAGER.**)
- UI `/admin/roles`: chỉ SUPER_ADMIN CRUD role + gán permission; mọi thay đổi → AuditLog + **reason bắt buộc**.

**Test case bắt buộc:**
| ID | Loại | Nội dung |
|---|---|---|
| C2.1 | Playwright | SUPER_ADMIN tạo role mới qua UI + gán 1 permission → lưu OK |
| C2.2 | Playwright | Non-SUPER_ADMIN mở `/admin/roles` → bị chặn (redirect/403) |
| C2.3 | Playwright | Tạo/sửa role KHÔNG nhập `reason` → bị chặn |
| C2.4 | Playwright | Sau khi sửa role → có bản ghi AuditLog (kèm reason) |
| C2.5 | Vitest | Gán action ngoài `ACTION_REGISTRY` → bị từ chối |
| C2.6 | Playwright/seed | 1 user gán 3 UserOrgRole (HO + CS1 + CS2) → đọc lại đủ 3 |
| C2.7 | Vitest | Seed KHÔNG tồn tại role `HO_MANAGER` |

**Check (DoD):** chỉ SUPER_ADMIN quản role · reason bắt buộc · audit ghi đủ · 7 case xanh.

---

## A0-03 — ActorResolver + can() v2

**Việc (Doc 15 §2.4/§4.6, OI-5/OI-7):**
- `ActorResolver`: từ `userId` (JWT) → nạp **tất cả UserOrgRole đang hiệu lực** (`effectiveFrom ≤ now ≤ effectiveTo`, status active) + permissions + `visibleCenterIds`.
- `can(actor, action, target?)`: SUPER_ADMIN bypass → grant ALLOW → **RolePermission tại OrgUnit của target / tổ tiên / tại HO (cross-center theo chức năng)**. **ALLOW thắng nếu ≥1 role cho phép — KHÔNG DENY override.**
- Chạy **song song matrix cũ**: cờ `rbac_v2_enabled`; log lệch (v1 vs v2) để đối chiếu trước khi cắt.

**Test case bắt buộc:**
| ID | Loại | Nội dung |
|---|---|---|
| C3.1 | Vitest | User nhiều role, 1 role ALLOW đúng scope → `can()` = true |
| C3.2 | Vitest | HO_ACCOUNTANT@HO → `can('finance:view', targetCS1)` = true (cross-center) |
| C3.3 | Vitest | CENTER_ACCOUNTANT@CS1 → `can('finance:view', targetCS2)` = false |
| C3.4 | Vitest | Role hết hạn (`effectiveTo < now`) → không tính quyền |
| C3.5 | Vitest | KHÔNG có DENY override (grant DENY không làm mất quyền role) — xác nhận hành vi phase này |
| C3.6 | Vitest | SUPER_ADMIN@HO → mọi action = true |

**Check (DoD):** ActorResolver per-request (cache) · log lệch v1/v2 hoạt động · 6 case xanh.

---

## A0-04 — scopedDb + ESLint boundary

**Việc (Doc 15 §4.4/§4.10, P3):**
- `scopedDb(actor)` Prisma extension: tự inject `centerId IN visibleCenterIds` cho bảng nghiệp vụ; HO role → bỏ filter (theo chức năng).
- ESLint: chặn `import @/lib/db` trong `app/**` (whitelist module hạ tầng) → bắt buộc đi qua scopedDb.
- Thêm `pnpm lint:boundaries`.

**Test case bắt buộc:**
| ID | Loại | Nội dung |
|---|---|---|
| C4.1 | Playwright | CENTER_MANAGER@CS1 mở list dữ liệu → **KHÔNG** thấy record CS2 |
| C4.2 | Playwright | CENTER_MANAGER@CS2 → **KHÔNG** thấy record CS1 |
| C4.3 | Playwright | Truy cập trực tiếp record CS2 bằng id (get-by-id) khi đang ở CS1 → 404/403 |
| C4.4 | Playwright | HO_ACCOUNTANT@HO → thấy record cả CS1 + CS2 |
| C4.5 | Vitest | scopedDb tự thêm filter khi actor không phải HO (kiểm tra câu query) |
| C4.6 | CI | `pnpm lint:boundaries` fail khi cố import `@/lib/db` trong `app/**` (test cố tình vi phạm → đỏ) |

**Check (DoD):** không đường tắt qua scopedDb · ESLint boundary bật trong CI · 6 case xanh. **Đây là cổng an toàn dữ liệu — không đóng A0 nếu C4.1–C4.4 chưa xanh.**

---

## A0-05 — Common login + redirect

**Việc (Doc 15 §3.1, Q9):** cổng `satarobo.vn/login` → staff (`@satarobo.vn`) redirect admin; PARENT redirect hocvien; anonymous vào admin/portal → đẩy về `/login?callbackUrl=` (sanitize). Sửa `lib/auth/route-policy.ts` + `route-policy.test.ts`.

**Test case bắt buộc:**
| ID | Loại | Nội dung |
|---|---|---|
| C5.1 | Playwright | Staff login → tới admin |
| C5.2 | Playwright | Parent login → tới portal |
| C5.3 | Playwright | Anonymous vào trang admin → bị đẩy về `/login` (giữ callbackUrl) |
| C5.4 | Playwright | Parent cố vào admin → redirect portal (không lọt) |
| C5.5 | Vitest | `sanitizeCallbackUrl` chặn open-redirect (`//evil`, `http://...`) |

**Check (DoD):** route-policy tests mở rộng xanh · 5 case xanh.

---

## A0-06 — AuditLog hợp nhất

**Việc (Doc 15 §8.1):** bảng `AuditLog(actorId, module, entityType, entityId, action, oldValues, newValues, orgUnitId, ip, userAgent, createdAt)`; helper ghi audit; viewer scope (Center chỉ xem audit của mình); không sửa/xóa qua UI; mask PII theo quyền; export audit phải audit lại.

**Test case bắt buộc:**
| ID | Loại | Nội dung |
|---|---|---|
| C6.1 | Playwright | Đổi role → sinh AuditLog đúng (actor, old/new, reason) |
| C6.2 | Playwright | CENTER_MANAGER@CS1 xem audit → chỉ thấy bản ghi scope CS1 |
| C6.3 | Playwright | Không có UI nào sửa/xóa AuditLog |
| C6.4 | Playwright | Export audit (nếu có) → sinh thêm 1 AuditLog cho hành động export |

**Check (DoD):** 4 case xanh; module mới dùng được bảng chung.

---

## A0-07 — DomainEvent outbox + dispatcher

**Việc (Doc 15 §4.5):** `DomainEvent(type, payloadJson, status PENDING/PROCESSING/DONE/FAILED, attempts, lastError, createdAt, processedAt)`; dispatcher cron 1'; handler idempotent + retry. Demo: 1 sự kiện mẫu (`demo.ping`) với 2 handler.

**Test case bắt buộc:**
| ID | Loại | Nội dung |
|---|---|---|
| C7.1 | Vitest | Ghi event trong transaction → commit xong mới PENDING |
| C7.2 | Vitest | Dispatcher xử lý PENDING → DONE; lỗi → attempts++ (giữ PENDING tới maxAttempts → FAILED) |
| C7.3 | Vitest | Handler idempotent: chạy 2 lần cùng event → kết quả 1 lần |
| C7.4 | Vitest | Thêm handler thứ 2 cho cùng type = 1 dòng đăng ký, không sửa publisher |

**Check (DoD):** 4 case xanh; cờ tắt dispatcher hoạt động (rollback).

---

## A0-08 — EmployeeOrgAssignment foundation

**Việc (Doc 15 §2.2, OI-6/OI-8/OI-9/OI-10):** `EmployeeOrgAssignment(employeeId, orgUnitId, roleInOrg, assignmentType PRIMARY|SECONDARY|SUPPORT|SUBSTITUTE|SHARED, effectiveFrom, effectiveTo, status, allocationPercent)`. **KHÔNG sinh quyền.**

**Test case bắt buộc:**
| ID | Loại | Nội dung |
|---|---|---|
| C8.1 | Vitest | Tạo assignment đủ 5 loại assignmentType + allocationPercent |
| C8.2 | Playwright | NV chỉ có EmployeeOrgAssignment (không UserOrgRole) → **không có quyền** vào dữ liệu center đó |
| C8.3 | Playwright | NV có thêm UserOrgRole tương ứng → có quyền đúng role |
| C8.4 | Vitest | Assignment hết hạn (`effectiveTo<now`) → không còn active |

**Check (DoD):** 4 case xanh; tách bạch nhân sự vs quyền rõ ràng.

---

## EXIT CRITERIA — cổng đóng Phase A0 (Doc 15 §10 DoD)

```
[ ] 8 task (A0-01..08) + A0-00 = DONE
[ ] pnpm test:phase xanh (Vitest + tests/e2e/a0)
[ ] Mọi "Test case bắt buộc" (C0.1..C8.4) có case tương ứng — đối chiếu Traceability dưới
[ ] DEMO 6 kịch bản nghiệm thu:
    [ ] Tạo role mới qua UI → user dùng ngay, 0 deploy
    [ ] HO_ACCOUNTANT thấy toàn hệ thống; CENTER_ACCOUNTANT@CS1 chỉ CS1
    [ ] Query thiếu filter trong module đã chuyển → vẫn bị scope chặn
    [ ] Thêm consumer event = 1 dòng đăng ký
    [ ] Đổi quyền role → hiệu lực request kế tiếp (không re-login)
    [ ] Login chung redirect đúng 2 nhánh
[ ] route-policy + permission tests mở rộng cover OrgUnit — xanh
```

## Traceability matrix (đối chiếu trước khi đóng phase)

| Task | Test case bắt buộc | File test |
|---|---|---|
| A0-00 | C0.1, C0.2 | `tests/e2e/a0/_setup.spec.ts` |
| A0-01 | C1.1–C1.6 | `tests/e2e/a0/orgunit.spec.ts` + `lib/org/*.test.ts` |
| A0-02 | C2.1–C2.7 | `tests/e2e/a0/rbac.spec.ts` |
| A0-03 | C3.1–C3.6 | `lib/auth/can.test.ts` |
| A0-04 | C4.1–C4.6 | `tests/e2e/a0/scoped-db.spec.ts` |
| A0-05 | C5.1–C5.5 | `tests/e2e/a0/login-redirect.spec.ts` + `lib/auth/route-policy.test.ts` |
| A0-06 | C6.1–C6.4 | `tests/e2e/a0/audit.spec.ts` |
| A0-07 | C7.1–C7.4 | `lib/events/*.test.ts` |
| A0-08 | C8.1–C8.4 | `tests/e2e/a0/employee-assignment.spec.ts` |

**Kiểm tra nhanh thiếu case:** `grep -rho "\[A0-[0-9]*-C[0-9]*\]" tests/ lib/ | sort -u` → so với danh sách C* trên.
