# Ticket A0-01 — OrgUnit schema + seed ROOT/HO/CS1/CS2

| | |
|---|---|
| **PR** | PR-A0-01 | **Ưu tiên** | P0 (chặn toàn bộ A0) |
| **Ước lượng** | 5 ngày | **Phụ thuộc** | A0-00 (test infra) |
| **Feature flag** | không (additive thuần) | **Trạng thái** | 🟡 IN PROGRESS — lớp domain thuần + tests DONE (2026-06-08); DB layer chờ env có Postgres |
| **Nguồn** | Doc 15 §2.1, §11 OI-1/OI-2/OI-11/OI-12 | | |

> ⚙️ **Tiến độ thực thi (2026-06-08):**
> - ✅ **DONE + test xanh (29/29 Vitest, typecheck 0, lint 0, depcruise 0):** lớp domain THUẦN `lib/org/{types,orgunit-rules,org-tree}.ts` + `lib/validators/orgunit.ts` + tests. Đây là toàn bộ thuật toán + validation rule (V2/V3/V5/V6/V7) + helper cây — decoupled khỏi Prisma nên test được không cần DB.
> - ✅ **DB LAYER DONE (authored; typecheck 0 / lint 0 / `prisma validate` ✓ / `playwright --list` 11 spec ✓):** `model OrgUnit` + `enum OrgUnitType` (schema.prisma), migration tay `prisma/migrations/20260608010000_add_orgunit/`, `lib/org/org-service.ts` (create/get/list/update/softDelete + tree helper DB-backed gọi lại rule thuần), `prisma/seed-orgunit.ts` (idempotent, tái dùng cho helper test `seedOrg`), e2e `tests/e2e/a0/orgunit.spec.ts` (11 case AC1–AC8).
> - ✅ **ĐÃ CHẠY THẬT (2026-06-08):** Postgres local (scoop portable, không admin), `prisma migrate deploy` apply migration `20260608010000_add_orgunit` sạch, `pnpm test:e2e:a0` → **11/11 case orgunit PASS** (AC1–AC8). Lệnh nhanh: `A0_SKIP_WEBSERVER=1 pnpm exec playwright test -c playwright.a0.config.ts` (không cần Next/browser cho test thuần-DB).
> - 📌 **2 quyết định khi code (cần biết):** (1) coverage org-service đặt ở **e2e a0** (DB-backed), KHÔNG để Vitest — giữ `pnpm test:unit` không cần DB (CI unit-tests job không có Postgres). (2) **T7-05** code đã soft-delete KHÔNG tái dùng được (cột `code` unique toàn cục) — muốn dùng lại thì khôi phục bản cũ. centerId là scalar `@unique` (không phải Prisma relation) để không đụng model `Center`.
>
> 🛠️ **SỬA MÂU THUẪN ticket vs Doc 15 (phát hiện khi code):** AC5 bản gốc ghi `getSubtreeCenterIds(HO) = [CS1,CS2]` — **SAI** theo Doc 15 OI-1 (ROOT → HO/CS1/CS2 độc lập ngang hàng; HO KHÔNG phải cha CS1/CS2). Đã sửa: `getSubtreeCenterIds(HO) = []`; `getSubtreeCenterIds(ROOT) = [CS1,CS2]`. Quyền **cross-center của role HO KHÔNG đến từ subtree** mà do `ActorResolver`/`isHO()` xử lý riêng (ticket A0-03 §3).

---

## 1. Mục tiêu & bối cảnh
Giải **P1** (hệ thống không có khái niệm Hội sở; tổ chức chỉ là cột `User.centerId` phẳng). Tạo cây tổ chức `OrgUnit` để biểu diễn ROOT → HO/CS1/CS2 độc lập, làm nền cho RBAC (A0-02), scopedDb (A0-04), nhân sự (A0-08). Đây là task **additive** — không đụng `Center`/`centerId` hiện hữu.

## 2. Phạm vi
**In scope:**
- Model `OrgUnit` + enum `OrgUnitType`.
- Ràng buộc: unique `code`, chặn parent-cycle, soft-delete.
- Liên kết 1-1 tạm thời sang `Center` cũ (`centerId` nullable) để tương thích.
- Seed idempotent: ROOT(SataRobo) + HO + CS1 + CS2.
- Helper đọc cây: `getSubtreeCenterIds(orgUnitId)`, `getAncestors(orgUnitId)`.

**Out of scope:** Location model (OI-12 — KHÔNG làm); xóa `User.centerId` (để Phase C); RBAC/scope (A0-02/04).

## 3. Thiết kế kỹ thuật

```prisma
enum OrgUnitType { ROOT HO CENTER CAMPUS PARTNER FRANCHISE }

model OrgUnit {
  id        String      @id @default(cuid())
  type      OrgUnitType
  code      String      @unique          // "SATAROBO","HO","CS1","CS2"
  name      String
  address   String?                       // chỉ thông tin, KHÔNG suy ra quản lý
  parentId  String?
  parent    OrgUnit?    @relation("tree", fields: [parentId], references: [id])
  children  OrgUnit[]   @relation("tree")
  centerId  String?     @unique           // Phase A: trỏ Center cũ (CENTER type)
  isActive  Boolean     @default(true)
  deletedAt DateTime?
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  @@index([type])
  @@index([parentId])
  @@index([deletedAt])
}
```

**Validation rules (tầng service `lib/org/org-service.ts`, không chỉ DB):**
| Rule | Nội dung |
|---|---|
| V1 | `code` unique (DB unique + check thân thiện trước khi insert) |
| V2 | `code` non-empty, `^[A-Z0-9_]{2,20}$` (chuẩn hóa uppercase) |
| V3 | Chỉ **1 ROOT** trong hệ thống; ROOT có `parentId = null` |
| V4 | Non-ROOT bắt buộc `parentId` hợp lệ (tồn tại, chưa soft-deleted) |
| V5 | **No cycle**: set parent không được tạo vòng (A→B→A, hoặc A là tổ tiên của parent mới) |
| V6 | Không tự làm parent của chính mình |
| V7 | `centerId` chỉ set cho `type=CENTER`; unique |
| V8 | Soft-delete: không xóa OrgUnit còn `children` active (hoặc cascade có cảnh báo — chọn: **chặn**) |

**Helper contract:**
```ts
getSubtreeCenterIds(orgUnitId): Promise<string[]>  // mọi centerId thuộc subtree (HO → tất cả)
getAncestors(orgUnitId): Promise<OrgUnit[]>         // từ node lên ROOT
isAncestor(a, b): Promise<boolean>                  // a có là tổ tiên b?
```

**Seed (`prisma/seed-orgunit.ts`, idempotent qua upsert theo `code`):**
```
ROOT  code=SATAROBO type=ROOT   parent=null
HO    code=HO       type=HO     parent=ROOT  address="114 Hoàng Diệu, Đà Nẵng"
CS1   code=CS1      type=CENTER parent=ROOT  address="211 Nguyễn Hữu Thọ, Đà Nẵng"  centerId=<Center CS1 cũ>
CS2   code=CS2      type=CENTER parent=ROOT  address="114 Hoàng Diệu, Đà Nẵng"      centerId=<Center CS2 cũ>
```

## 4. Acceptance Criteria
- **AC1** Tạo được OrgUnit hợp lệ với đủ field; đọc lại đúng.
- **AC2** Seed tạo đúng 4 OrgUnit; `HO.parentId = ROOT.id` (KHÔNG = CS2); CS1/CS2 cùng cấp HO.
- **AC3** HO và CS2 cùng `address` ("114 Hoàng Diệu") nhưng khác `id/code/type` — vẫn tạo được.
- **AC4** Vi phạm V1–V8 đều bị từ chối với lỗi rõ ràng (mã + message tiếng Việt).
- **AC5** (SỬA theo Doc 15 OI-1) `getSubtreeCenterIds(ROOT)` = [CS1.centerId, CS2.centerId]; `getSubtreeCenterIds(CS1)` = [CS1.centerId]; **`getSubtreeCenterIds(HO)` = []** (HO độc lập, không phải cha CS1/CS2 — cross-center của HO do A0-03 ActorResolver xử lý).
- **AC6** Thêm CS3 (type CENTER, parent ROOT) → tree hợp lệ, helper tự gồm CS3, **không sửa code seed/helper**.
- **AC7** Soft-delete CS1 → không xuất hiện ở query mặc định; subtree HO không còn CS1.
- **AC8** Seed chạy 2 lần → không tạo trùng (idempotent).

## 5. Files dự kiến
```
prisma/schema/organization.prisma        (model OrgUnit, enum)   [hoặc schema.prisma nếu chưa multi-file]
prisma/migrations/<ts>_add_orgunit/       (migration)
prisma/seed-orgunit.ts                    (seed idempotent)
lib/org/org-service.ts                    (create/update/softDelete + V1–V8)
lib/org/org-tree.ts                       (getSubtreeCenterIds, getAncestors, isAncestor)
lib/validators/orgunit.ts                 (Zod schema)
tests/e2e/a0/orgunit.spec.ts              (Playwright)
lib/org/org-service.test.ts               (Vitest)
lib/org/org-tree.test.ts                  (Vitest)
```

## 6. Edge cases & xử lý lỗi
- Tạo OrgUnit con trỏ parent đã soft-deleted → từ chối (V4).
- Đổi parent của 1 node sao cho thành tổ tiên của chính nó → từ chối (V5).
- `code` viết thường "cs1" → tự uppercase thành "CS1" (V2) → nếu đã có "CS1" thì báo trùng (V1).
- Set `centerId` cho type=HO → từ chối (V7).
- Xóa HO khi còn CS con? HO không phải parent của CS (cùng cấp) → xóa HO chỉ ảnh hưởng HO; nhưng xóa ROOT khi còn con → **chặn** (V8).
- Race: 2 request tạo cùng `code` đồng thời → DB unique bắt; service trả lỗi CONFLICT (không 500).

## 7. Rollback / Feature flag
Additive — rollback = revert migration (chưa có dữ liệu phụ thuộc ngoài seed). Không cần flag. `Center`/`centerId` cũ nguyên vẹn.

## 8. Test plan (đầy đủ — B: bắt buộc, E: mở rộng)

### T1 — Functional / Happy
| Case | B/E | Bước | Mong đợi |
|---|---|---|---|
| A0-01-T1-01 | B | Tạo OrgUnit CENTER hợp lệ | Tạo OK, đọc lại đủ field (AC1) |
| A0-01-T1-02 | B | Chạy seed | Đúng 4 OrgUnit, HO.parent=ROOT (AC2) |
| A0-01-T1-03 | B | `getSubtreeCenterIds(HO)` | =[CS1,CS2] (AC5) |
| A0-01-T1-04 | B | `getSubtreeCenterIds(CS1)` | =[CS1] (AC5) |
| A0-01-T1-05 | E | `getAncestors(CS1)` | [CS1, ROOT] |
| A0-01-T1-06 | E | `isAncestor(ROOT, CS2)` | true; `isAncestor(CS1, CS2)` false |

### T2 — Negative / Validation
| Case | B/E | Input | Mong đợi |
|---|---|---|---|
| A0-01-T2-01 | B | `code` trùng (CS1) | CONFLICT, message rõ (AC4/V1) |
| A0-01-T2-02 | B | `code` rỗng | VALIDATION_ERROR (V2) |
| A0-01-T2-03 | E | `code`="cs 1" (khoảng trắng/ký tự lạ) | VALIDATION_ERROR (V2) |
| A0-01-T2-04 | B | non-ROOT thiếu `parentId` | VALIDATION_ERROR (V4) |
| A0-01-T2-05 | B | `parentId` không tồn tại | VALIDATION_ERROR (V4) |
| A0-01-T2-06 | E | `parentId` trỏ node đã soft-deleted | VALIDATION_ERROR (V4) |
| A0-01-T2-07 | B | Tạo ROOT thứ 2 | VALIDATION_ERROR (V3) |
| A0-01-T2-08 | B | `centerId` set cho type=HO | VALIDATION_ERROR (V7) |
| A0-01-T2-09 | E | `name` rỗng | VALIDATION_ERROR |

### T3 — Boundary
| Case | B/E | Input | Mong đợi |
|---|---|---|---|
| A0-01-T3-01 | E | `code` 2 ký tự (min) | OK |
| A0-01-T3-02 | E | `code` 20 ký tự (max) | OK; 21 ký tự → từ chối |
| A0-01-T3-03 | B | HO & CS2 cùng address | Tạo được (AC3) |

### T5 — Data isolation (chuẩn bị nền cho A0-04; ở task này test helper)
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-01-T5-01 | B | `getSubtreeCenterIds(CS1)` không chứa CS2 | true (AC5) — nền cách ly |
| A0-01-T5-02 | E | Thêm CS3 → subtree(HO) tự gồm CS3 | true (AC6) |

### T6 — Concurrency
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-01-T6-01 | E | 2 request tạo cùng `code` song song | đúng 1 thành công, 1 CONFLICT (không 500) |
| A0-01-T6-02 | B | Seed chạy 2 lần | idempotent, không trùng (AC8) |

### T5b/T7 — Lifecycle / cycle
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-01-T7-01 | B | Set parent tạo cycle A→B→A | từ chối (AC4/V5) |
| A0-01-T7-02 | B | Node tự làm parent chính nó | từ chối (V6) |
| A0-01-T7-03 | B | Soft-delete CS1 | không hiện ở query mặc định; subtree(HO) mất CS1 (AC7) |
| A0-01-T7-04 | E | Soft-delete ROOT khi còn con | chặn (V8) |
| A0-01-T7-05 | E | Soft-delete rồi tạo lại `code`=CS1 | tùy policy: cho phép (vì cũ đã deleted) — xác nhận hành vi |

### T11 — Non-functional
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-01-T11-01 | E | `getSubtreeCenterIds` với cây 50 node | < 50ms, không N+1 (1-2 query) |

### T12 — Regression
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-01-T12-01 | B | `Center`/`User.centerId` cũ vẫn đọc/ghi bình thường sau migration | true |

## 9. Test data
`seedOrg(["HO","CS1","CS2"])` (helper A0-00) + Center cũ tương ứng. Fixture `orgUnit.cs3` để test AC6.

## 10. RTM (AC ↔ Case ↔ File)
| AC | Case bắt buộc | File |
|---|---|---|
| AC1 | T1-01 | org-service.test.ts |
| AC2 | T1-02 | orgunit.spec.ts |
| AC3 | T3-03 | org-service.test.ts |
| AC4 | T2-01..08, T7-01..02 | org-service.test.ts |
| AC5 | T1-03/04, T5-01 | org-tree.test.ts |
| AC6 | T5-02 | org-tree.test.ts |
| AC7 | T7-03 | org-service.test.ts |
| AC8 | T6-02 | orgunit.spec.ts |

## 11. DoD
```
[ ] AC1–AC8 đều có ≥1 case bắt buộc PASS
[ ] Toàn bộ case (B) xanh; case (E) đã viết hoặc ghi rõ lý do hoãn
[ ] typecheck + lint + build PASS
[ ] migration tên rõ + restart dev (Prisma cache)
[ ] seed idempotent
[ ] Cập nhật bảng board A0 + RTM
```
