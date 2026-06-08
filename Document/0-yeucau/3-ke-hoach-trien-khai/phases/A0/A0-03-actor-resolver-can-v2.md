# Ticket A0-03 — ActorResolver + can() v2

| | |
|---|---|
| **PR** | PR-A0-03 | **Ưu tiên** | P0 |
| **Ước lượng** | 4 ngày | **Phụ thuộc** | A0-02 |
| **Feature flag** | `rbac_v2_enabled` (env, mặc định OFF → fallback matrix cũ) | **Trạng thái** | ✅ DONE — engine + test PASS local (2026-06-08) |

> ⚙️ **Tiến độ (2026-06-08) — đã chạy thật trên Postgres local:**
> - ✅ **Engine:** `lib/auth/actor.ts` (`buildActor()` THUẦN + `resolveActor()` React.cache — 1 query/request, lọc role hiệu lực status/effectiveFrom/To + RoleDef.isActive); `lib/auth/can.ts` (`can/assertCan` ALLOW-wins, KHÔNG DENY — OI-7; scope GLOBAL/CENTER/OWN/CHILDREN/CLASS/ASSIGNED; HO/ROOT → cross-center; `getVisibleCenterIds`/`getEffectivePermissions`/`PermissionError`); `lib/auth/shadow-compare.ts` (`decidePermission` v1↔v2 + log lệch); `lib/flags.ts` (`isRbacV2Enabled`, env `RBAC_V2_ENABLED` mặc định OFF).
> - ✅ **Test PASS:** Vitest `can.test.ts` (17) + `actor.test.ts` (10) — ma trận T4 đầy đủ (AC1–AC10, AC12, T6/T7/T8) + `can-integration.spec.ts` (4, DB thật: cross-center, cách ly, role hết hạn, SUPER_ADMIN). Toàn repo: Vitest 191 ✓, e2e a0 32 ✓.
> - 📌 **Quyết định khi code:** (1) tách `buildActor` thuần để test ma trận không cần DB (resolver DB test qua e2e a0). (2) `isSuperAdmin` chỉ khi SUPER_ADMIN tại HO/ROOT. (3) CENTER scope của role HO/ROOT = "ALL" (cross-center theo chức năng, KHÔNG từ subtree vì OI-1 subtree(HO)=[]).
> - ✅ **Runtime entry (bổ sung 2026-06-08):** `lib/auth/permission-eval.ts` (`evaluatePermission` THUẦN — tách khỏi NextAuth để test vitest) + `lib/auth/check-permission.ts` (`checkPermission`/`assertPermission` = `auth()` + `resolveActor` + v1↔v2 + shadow theo flag). Test `check-permission.test.ts` 5 case (T12-01/02/03 + action ngoài registry + null). Đây là API quyền cho **code MỚI**; flag OFF → trả v1 (không đổi hành vi prod).
> - ⏳ **Còn lại (Phase chuyển dịch, KHÔNG thuộc A0-03):** migrate hàng trăm callsite `assertCan` cũ sang `assertPermission` (Phase C "bỏ matrix"); bật `RBAC_V2_ENABLED` ở staging sau 1 tuần shadow. AC11 (1 query/request) đảm bảo bằng `React.cache` ở RSC. `visibleCenterIds` dùng cho **A0-04 (scopedDb)**.
| **Nguồn** | Doc 15 §2.4/§4.6, OI-5/OI-7/OI-8 | | |

---

## 1. Mục tiêu & bối cảnh
Lõi phân quyền mới. Giải **P8** (JWT chứa quyền): JWT chỉ còn `{userId, sessionVersion}`; quyền resolve per-request từ DB. Thực thi quy tắc **ALLOW-wins, không DENY** (OI-7) và **HO cross-center theo chức năng** (OI-5). Chạy **song song matrix cũ** + log lệch để an toàn trước khi cắt.

## 2. Phạm vi
**In:** `ActorResolver` (nạp UserOrgRole active + permissions + visibleCenterIds, cache per-request); `can(actor, action, target?)` + `assertCan`; helper `getEffectivePermissions`, `getVisibleCenterIds`; cờ `rbac_v2_enabled` + shadow-compare logger (v1 vs v2).
**Out:** scopedDb (A0-04 dùng `visibleCenterIds` từ đây); UI; bỏ matrix cũ (Phase C).

## 3. Thiết kế kỹ thuật

**Actor shape:**
```ts
type Actor = {
  userId: string;
  isSuperAdmin: boolean;
  orgRoles: { orgUnitId: string; roleCode: string }[];   // chỉ role ĐANG hiệu lực
  permissions: Set<string>;                                // 'action@scopeType@orgUnitId' đã nở
  visibleCenterIds: string[];                              // union subtree các orgUnit có role; HO → tất cả
  grantsAllow: Set<string>;                                // per-user ALLOW (5.3) giữ lại
};
```

**ActorResolver (`lib/auth/actor.ts`, bọc `React.cache` để 1 query/request):**
```
1. Lấy userId từ session JWT.
2. Query UserOrgRole WHERE userId=? AND status=ACTIVE
     AND effectiveFrom <= now AND (effectiveTo IS NULL OR effectiveTo >= now)   ← lọc hiệu lực
   include RoleDef.permissions.
3. isSuperAdmin = có role SUPER_ADMIN tại HO/ROOT.
4. visibleCenterIds = union getSubtreeCenterIds(orgUnitId) cho mỗi role; nếu có role tại HO/ROOT → toàn bộ center.
5. Nạp UserPermissionGrant ALLOW (DENY bỏ qua — OI-7).
```

**can(actor, action, target?) — thứ tự (OI-7, KHÔNG DENY):**
```
1. actor.isSuperAdmin → true
2. action ∈ grantsAllow → true
3. Với mỗi role của actor: nếu RolePermission(action) tồn tại VÀ scope khớp target → true
     - GLOBAL: luôn khớp
     - CENTER: target.centerId ∈ subtree(orgUnit của role)  (role tại HO → mọi center)
     - CLASS/ASSIGNED: target gắn class/được phân công cho actor
     - OWN: target.createdById == actor.userId
     - CHILDREN: target.parentUserId == actor.userId
4. Mặc định false   ← ALLOW-wins: chỉ cần 1 role match là true
```
`assertCan` → throw `PermissionError('PERMISSION_DENIED')` nếu false.

**Shadow compare:** khi `rbac_v2_enabled=false`, dùng kết quả matrix cũ NHƯNG vẫn chạy can() v2 và `log.warn` nếu lệch (action, user, v1, v2) → thu thập 1 tuần trước khi bật.

## 4. Acceptance Criteria
- **AC1** User nhiều role, ≥1 role ALLOW đúng scope → `can()`=true (ALLOW-wins).
- **AC2** HO_ACCOUNTANT@HO: `can('finance:view', targetCS1)` & `targetCS2` = true (cross-center theo chức năng).
- **AC3** HO_ACCOUNTANT@HO: `can('students:edit', x)` = false nếu role HO_ACCOUNTANT không có action đó (HO ≠ siêu quyền).
- **AC4** CENTER_ACCOUNTANT@CS1: `finance:view` target CS1 = true; target CS2 = false.
- **AC5** Role hết hạn (`effectiveTo < now`) hoặc status≠ACTIVE → không tính quyền.
- **AC6** Per-user grant ALLOW thêm quyền; **grant DENY KHÔNG làm mất quyền** (OI-7, hành vi phase này).
- **AC7** SUPER_ADMIN@HO/ROOT → mọi action = true.
- **AC8** `getVisibleCenterIds`: CENTER role → center đó; HO role → tất cả center.
- **AC9** TEACHER scope CLASS/ASSIGNED: chỉ true cho lớp được phân công.
- **AC10** PARENT scope CHILDREN: chỉ true cho con mình.
- **AC11** ActorResolver chạy **1 query/request** (cache).
- **AC12** Shadow compare log đúng khi v1≠v2.

## 5. Files dự kiến
```
lib/auth/actor.ts            (ActorResolver + cache)
lib/auth/can.ts              (can, assertCan, scope matchers)
lib/auth/shadow-compare.ts   (logger v1 vs v2)
lib/flags.ts                 (rbac_v2_enabled)
lib/auth/can.test.ts         (Vitest — ma trận lớn)
lib/auth/actor.test.ts       (Vitest)
tests/e2e/a0/can-integration.spec.ts  (Playwright — qua 1 route thật)
```

## 6. Edge cases & xử lý lỗi
- User không có UserOrgRole nào → actor rỗng, mọi `can()`=false (trừ public).
- Role tồn tại nhưng `isActive=false` ở RoleDef → bỏ.
- `effectiveTo` đúng bằng `now` (biên) → còn hiệu lực (<=).
- target null cho action GLOBAL → vẫn xét được; target null cho action cần scope CENTER/OWN → false (an toàn).
- User có cả role HO và role CENTER cùng action → ALLOW-wins (HO thắng phạm vi rộng).
- Cùng action 2 role khác scopeType → match scope rộng nhất hợp lệ.
- grant ALLOW cho action không trong registry → bỏ qua (defensive).

## 7. Rollback / Feature flag
`rbac_v2_enabled=false` → dùng matrix cũ (an toàn tuyệt đối). Bật theo môi trường: dev → staging → 1 tuần shadow → production.

## 8. Test plan (đầy đủ — ma trận role×action×scope)

### T1 — Functional core
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-03-T1-01 | B | SUPER_ADMIN mọi action | true (AC7) |
| A0-03-T1-02 | B | user 1 role ALLOW đúng scope | true (AC1) |
| A0-03-T1-03 | B | user không role | false |
| A0-03-T1-04 | E | grant ALLOW thêm 1 action ngoài role | true (AC6) |

### T4 — Permission matrix (đầy đủ theo role §2.3 × scope)
| Case | B/E | Actor → action(target) | Mong đợi |
|---|---|---|---|
| A0-03-T4-01 | B | HO_ACCOUNTANT@HO → finance:view(CS1) | true (AC2) |
| A0-03-T4-02 | B | HO_ACCOUNTANT@HO → finance:view(CS2) | true (AC2) |
| A0-03-T4-03 | B | HO_ACCOUNTANT@HO → students:edit | false (AC3) |
| A0-03-T4-04 | B | CENTER_ACCOUNTANT@CS1 → finance:view(CS1) | true (AC4) |
| A0-03-T4-05 | B | CENTER_ACCOUNTANT@CS1 → finance:view(CS2) | false (AC4) |
| A0-03-T4-06 | B | HO_HR@HO → hr:edit(CS1+CS2) | true |
| A0-03-T4-07 | B | HO_MARKETING@HO → marketing:view(all) | true |
| A0-03-T4-08 | B | HO_MARKETING@HO → finance:approve | false |
| A0-03-T4-09 | B | HO_SALE@HO → lead:view(scope A&B) | true |
| A0-03-T4-10 | B | HO_SALE@HO → lead:edit(lead đã thuộc CS) | **false** (OI-5 xem-không-sửa) |
| A0-03-T4-11 | B | CENTER_MANAGER@CS1 → mọi action CS1 trong quyền | true |
| A0-03-T4-12 | B | CENTER_MANAGER@CS1 → action target CS2 | false |
| A0-03-T4-13 | B | TEACHER → attendance:mark(lớp được phân công) | true (AC9) |
| A0-03-T4-14 | B | TEACHER → attendance:mark(lớp khác) | false (AC9) |
| A0-03-T4-15 | B | PARENT → student:view(con mình) | true (AC10) |
| A0-03-T4-16 | B | PARENT → student:view(con người khác) | false (AC10) |
| A0-03-T4-17 | E | ASSISTANT_TEACHER scope tương tự TEACHER nhưng hẹp hơn | đúng |

### T5 — visibleCenterIds (nền A0-04)
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-03-T5-01 | B | getVisibleCenterIds(CENTER_MANAGER@CS1) | =[CS1] (AC8) |
| A0-03-T5-02 | B | getVisibleCenterIds(HO_ACCOUNTANT@HO) | =[CS1,CS2,...] (AC8) |
| A0-03-T5-03 | E | user multi-role HO+CS1 | = tất cả (HO trùm) |

### T6 — ALLOW-wins / multi-role
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-03-T6-01 | B | 2 role: 1 cho phép 1 không | true (AC1) |
| A0-03-T6-02 | B | grant DENY action mà role cho phép | **vẫn true** (không DENY override — AC6) |
| A0-03-T6-03 | E | role HO + role CENTER cùng action | true, scope rộng (HO) |

### T7 — Effective time / lifecycle
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-03-T7-01 | B | role `effectiveTo` < now | không tính (AC5) |
| A0-03-T7-02 | B | role `effectiveFrom` > now (chưa tới) | không tính |
| A0-03-T7-03 | B | role `effectiveTo` == now (biên) | còn tính (<=) |
| A0-03-T7-04 | B | role status=SUSPENDED | không tính |
| A0-03-T7-05 | E | RoleDef.isActive=false | không tính |

### T8 — Resilience / edge
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-03-T8-01 | E | target null + action GLOBAL | xét được |
| A0-03-T8-02 | B | target null + action cần scope CENTER | false (an toàn) |
| A0-03-T8-03 | E | grant ALLOW action ngoài registry | bỏ qua, không crash |

### T11 — Non-functional
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-03-T11-01 | B | ActorResolver gọi nhiều lần trong 1 request | 1 query DB (cache) — AC11 |
| A0-03-T11-02 | E | can() 1000 lần | < 5ms tổng (in-memory sau resolve) |

### T12 — Shadow compare / regression
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-03-T12-01 | B | flag OFF: dùng kết quả matrix cũ | true |
| A0-03-T12-02 | B | v1≠v2 → log.warn đúng nội dung | AC12 |
| A0-03-T12-03 | E | flag ON: dùng can() v2 | đúng |

### Integration (Playwright qua route thật)
| Case | B/E | | Mong đợi |
|---|---|---|---|
| A0-03-IT-01 | B | CENTER_ACCOUNTANT@CS1 gọi 1 endpoint finance CS2 | 403 PERMISSION_DENIED |
| A0-03-IT-02 | B | HO_ACCOUNTANT mở dashboard finance | thấy cả 2 center |

## 9. Test data
`seedRoles()+seedOrg()`; users: superAdmin, hoAccountant, centerAccountantCS1, hoMarketing, hoSale, centerManagerCS1, teacherCS1(assigned class), parent(child), multiRole(HO+CS1), expiredRole user.

## 10. RTM
| AC | Case (B) | File |
|---|---|---|
| AC1 | T1-02, T6-01 | can.test.ts |
| AC2 | T4-01/02 | can.test.ts |
| AC3 | T4-03 | can.test.ts |
| AC4 | T4-04/05 | can.test.ts |
| AC5 | T7-01 | can.test.ts |
| AC6 | T6-02 | can.test.ts |
| AC7 | T1-01 | can.test.ts |
| AC8 | T5-01/02 | actor.test.ts |
| AC9 | T4-13/14 | can.test.ts |
| AC10 | T4-15/16 | can.test.ts |
| AC11 | T11-01 | actor.test.ts |
| AC12 | T12-02 | can.test.ts |

## 11. DoD
```
[ ] AC1–AC12 có case (B) PASS
[ ] Toàn bộ ma trận T4 (16 case B) xanh — đây là lõi bảo mật
[ ] T6-02 (không DENY override) PASS đúng quyết định OI-7
[ ] Shadow compare chạy + log lệch (chưa bật v2 ở prod)
[ ] typecheck+lint+build PASS
[ ] Cập nhật board A0 + RTM
```
