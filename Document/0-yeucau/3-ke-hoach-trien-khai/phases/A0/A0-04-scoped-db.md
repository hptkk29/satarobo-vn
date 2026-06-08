# Ticket A0-04 — scopedDb + ESLint boundary

| | |
|---|---|
| **PR** | PR-A0-04 | **Ưu tiên** | P0 — CỔNG AN TOÀN DỮ LIỆU |
| **Ước lượng** | 4 ngày | **Phụ thuộc** | A0-03 |
| **Feature flag** | `scoped_db_enforced` (bypass cho hotfix) | **Trạng thái** | TODO |
| **Nguồn** | Doc 15 §4.4/§4.10, P3 | | |

---

## 1. Mục tiêu & bối cảnh
Giải **P3** (chặn xem chéo cơ sở bằng "trí nhớ dev"). Đưa cách ly dữ liệu vào TẦNG truy vấn: `scopedDb(actor)` tự inject filter center; ESLint chặn import `db` trần trong `app/**` để không có đường tắt. **Đây là rủi ro tiền bạc lớn nhất — không đóng A0 nếu task này chưa xanh.**

## 2. Phạm vi
**In:** Prisma Client Extension `scopedDb(actor)` cho danh sách `SCOPED_MODELS` (bảng có `centerId`); ESLint rule cấm `@/lib/db` trong `app/**` (whitelist module hạ tầng); `pnpm lint:boundaries`; áp dụng scopedDb cho ≥1 module thật để chứng minh (đề xuất: đọc Lead/Order). Bypass flag cho hotfix (audit khi dùng).
**Out:** chuyển toàn bộ module (làm dần theo phase — boy-scout); ghi (write) scope (giai đoạn này tập trung đọc + get-by-id; write vẫn assertCan).

## 3. Thiết kế kỹ thuật

```ts
// lib/db-scope.ts
const SCOPED_MODELS = ['lead','order','student','class','classSession','invoice',
  'payment','attendance','messengerConversation','commissionItem', /* ...mọi bảng có centerId */];

export function scopedDb(actor: Actor) {
  return db.$extends({ query: { $allModels: {
    async findMany({ model, args, query }) { return query(inject(model, args, actor)); },
    async findFirst({ model, args, query }) { return query(inject(model, args, actor)); },
    async findUnique({ model, args, query }) {           // get-by-id phải lọc luôn (chống IDOR)
      const r = await query(args);
      return r && passesScope(model, r, actor) ? r : null;
    },
    async count({ model, args, query }) { return query(inject(model, args, actor)); },
    async aggregate({ model, args, query }) { return query(inject(model, args, actor)); },
    async groupBy({ model, args, query }) { return query(inject(model, args, actor)); },
  }}});
}
function inject(model, args, actor) {
  if (!SCOPED_MODELS.includes(model) || actor.isSuperAdmin || isHO(actor)) return args; // HO: theo chức năng
  args.where = { AND: [args.where ?? {}, { centerId: { in: actor.visibleCenterIds } }] };
  return args;
}
```

**ESLint (`eslint.config` — mở rộng cơ chế UI-split sẵn có):**
```
no-restricted-imports trong app/**: cấm "@/lib/db" (chỉ cho phép @/lib/db-scope + module public API)
script: "lint:boundaries": "eslint app --rule ..."  (hoặc dependency-cruiser)
```

**Bypass flag:** `scopedDb(actor,{bypass:true})` chỉ dùng trong job hạ tầng/migration, ghi AuditLog `SCOPE_BYPASS`.

## 4. Acceptance Criteria
- **AC1** CENTER_MANAGER@CS1 list bảng scoped → KHÔNG có record CS2.
- **AC2** CENTER_MANAGER@CS2 list → KHÔNG có record CS1.
- **AC3** get-by-id record CS2 khi đang ở CS1 → null/404 (chống IDOR).
- **AC4** count/aggregate cũng bị scope (không lộ tổng số/tổng tiền CS2).
- **AC5** HO_ACCOUNTANT@HO → thấy record cả CS1+CS2 (cross-center).
- **AC6** SUPER_ADMIN → thấy tất cả.
- **AC7** Query qua quan hệ (vd Order.include Student) không lộ child cross-center.
- **AC8** ESLint `lint:boundaries` FAIL khi `app/**` import `@/lib/db`.
- **AC9** Bảng KHÔNG có centerId (vd RoleDef) không bị inject sai → vẫn truy vấn bình thường.
- **AC10** Bypass flag hoạt động + ghi audit.

## 5. Files dự kiến
```
lib/db-scope.ts
lib/db-scope.test.ts                 (Vitest — kiểm tra câu query injected)
eslint.config.mjs                    (rule no-restricted-imports cho app/**)
package.json                         (script lint:boundaries)
app/(admin)/admin/leads/page.tsx + orders/page.tsx  (chuyển sang scopedDb — chứng minh)
tests/e2e/a0/scoped-db.spec.ts       (Playwright — 6 góc isolation)
tests/e2e/a0/_fixtures/scoped-seed.ts (record gắn nhãn CS1-ONLY / CS2-ONLY)
```

## 6. Edge cases & xử lý lỗi
- `actor.visibleCenterIds` rỗng (user không center nào) → list trả rỗng (không lộ gì), không crash.
- Record có `centerId=null` (dữ liệu cũ/HO-level) → policy: chỉ HO/SUPER_ADMIN thấy; center user không thấy → tránh rò rỉ. Ghi rõ + test.
- Nested write/connect cross-center → ngoài scope task (assertCan ở action lo); ghi chú để R2 lưu ý.
- findUnique trả record ngoài scope → trả null (không throw lộ tồn tại).
- Model mới quên thêm vào SCOPED_MODELS → rủi ro: thêm test "mọi model có cột centerId phải nằm trong SCOPED_MODELS" (introspection) để chống miss.
- HO role nhưng action không thuộc chức năng → scope vẫn mở (vì isHO) NHƯNG can() ở action chặn → kết hợp 2 lớp; test để đảm bảo không dựa mình scopedDb cho quyền.

## 7. Rollback / Feature flag
`scoped_db_enforced=false` → scopedDb passthrough (= db thường) cho hotfix khẩn; mọi lần bypass ghi audit + cảnh báo. Không để OFF ở production quá 1 phiên hotfix.

## 8. Test plan (đầy đủ — T5 là trọng tâm, đủ 6 góc)

### T5 — Data isolation (6 góc bắt buộc, ×2 chiều)
| Case | B/E | Góc | Bước | Mong đợi |
|---|---|---|---|---|
| A0-04-T5-01 | B | list | CM@CS1 GET /admin/orders | không có "CS2-ONLY" (AC1) |
| A0-04-T5-02 | B | list (chiều ngược) | CM@CS2 GET /admin/orders | không có "CS1-ONLY" (AC2) |
| A0-04-T5-03 | B | get-by-id | CM@CS1 GET order id của CS2 | 404/null (AC3) |
| A0-04-T5-04 | B | search/filter | CM@CS1 search keyword khớp record CS2 | 0 kết quả |
| A0-04-T5-05 | B | count/aggregate | CM@CS1 đếm/tổng tiền orders | chỉ tính CS1 (AC4) |
| A0-04-T5-06 | B | relation/join | CM@CS1 Order.include Student của CS2 | student cross-center không lộ (AC7) |
| A0-04-T5-07 | E | groupBy | thống kê theo trạng thái | chỉ CS1 |
| A0-04-T5-08 | E | export | (nếu có ở task này) export Excel | chỉ CS1 |

### T4 — HO / SUPER_ADMIN cross-center
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-04-T4-01 | B | HO_ACCOUNTANT@HO list orders | thấy CS1+CS2 (AC5) |
| A0-04-T4-02 | B | SUPER_ADMIN list | thấy tất cả (AC6) |
| A0-04-T4-03 | E | HO_ACCOUNTANT get-by-id order CS2 | thấy (cross-center) |

### T1/T9 — Functional / model không-scope / bypass
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-04-T1-01 | B | Query RoleDef (không centerId) | trả bình thường, không inject (AC9) |
| A0-04-T1-02 | E | Bypass flag job hạ tầng | thấy tất cả + AuditLog SCOPE_BYPASS (AC10) |

### T8 — Edge / resilience
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-04-T8-01 | B | actor.visibleCenterIds rỗng | list rỗng, không crash |
| A0-04-T8-02 | B | record centerId=null + center user | không thấy (an toàn) |
| A0-04-T8-03 | E | record centerId=null + HO | thấy |

### T10 — Security (IDOR/bypass)
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-04-T10-01 | B | Đổi URL id sang record CS2 | 404 (AC3 — IDOR) |
| A0-04-T10-02 | B | Thử import `@/lib/db` trong app/ rồi build | lint:boundaries FAIL (AC8) |
| A0-04-T10-03 | E | Cố truyền where rỗng để lấy tất cả | vẫn bị AND scope |

### T11 — Non-functional
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-04-T11-01 | E | scopedDb overhead | không thêm query thừa (chỉ thêm WHERE) |

### T12 — Anti-miss (introspection)
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-04-T12-01 | B | Liệt kê mọi model có cột `centerId` | tất cả ∈ SCOPED_MODELS (fail nếu thiếu) |

## 9. Test data
`scoped-seed.ts`: tạo Order/Lead/Student gắn nhãn `CS1-ONLY-*`, `CS2-ONLY-*`, 1 record centerId=null. Users: centerManagerCS1, centerManagerCS2, hoAccountant, superAdmin, userNoCenter.

## 10. RTM
| AC | Case (B) | File |
|---|---|---|
| AC1 | T5-01 | scoped-db.spec.ts |
| AC2 | T5-02 | scoped-db.spec.ts |
| AC3 | T5-03, T10-01 | scoped-db.spec.ts |
| AC4 | T5-05 | scoped-db.spec.ts |
| AC5 | T4-01 | scoped-db.spec.ts |
| AC6 | T4-02 | scoped-db.spec.ts |
| AC7 | T5-06 | scoped-db.spec.ts |
| AC8 | T10-02 | CI / boundary test |
| AC9 | T1-01 | db-scope.test.ts |
| AC10 | T1-02 | db-scope.test.ts |

## 11. DoD
```
[ ] AC1–AC10 có case (B) PASS — ĐẶC BIỆT T5-01..06 (6 góc) hai chiều
[ ] T12-01 PASS (mọi bảng centerId đều được scope — chống miss model)
[ ] lint:boundaries vào CI; build FAIL nếu app/ import db trần
[ ] Bypass flag có audit
[ ] typecheck+lint+build PASS
[ ] Cập nhật board A0 + RTM
```
