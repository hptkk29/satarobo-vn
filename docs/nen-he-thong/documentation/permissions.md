# permissions.md — Ai được làm gì (INTENDED STATE)

## AS-BUILT — US-01 Registry quyền (09/08/2026, nhánh feat/nen-he-thong-p0)

- **Bảng `PermissionDescriptor` đã tồn tại** (migration `20260808183000_add_permission_descriptor`, SQL idempotent `IF NOT EXISTS` — chủ đích vì DB dev dùng chung nhiều nhánh): key (PK), module, action, scopable, sensitiveFields[], description, isActive, createdAt/updatedAt.
- **Key GIỮ NGUYÊN format v1 `resource:verb`** (162 key = 157 hiện có + 5 key chat khai trước) — KHÔNG remap sang `module.resource.action`; `module` là cột riêng. Lý do: zero-behavior-change, 81 file đang import matrix v1.
- **`action` là String verb thô, không phải enum 6 giá trị của BA §2.5** — repo có 20+ verb thực tế; enum hoá là việc pha sau nếu muốn.
- Khai báo per-module ở `lib/permissions/registry/{chat,crm,students,classes,lms,hr,finance,content,inventory,system}.ts`; `collectDescriptors()` pure, key trùng → `DuplicatePermissionKeyError` nêu key + 2 module (TS-01). Chat KHAI TRƯỚC từ nhánh feat/chat-realtime (AC4) — khi chat merge, test parity (c) trong `lib/permissions/registry.test.ts` buộc rút exception `PRE_DECLARED_V1_KEYS`.
- Sync: `pnpm db:seed:permissions` (`prisma/seed-permission-registry.ts`) — check trùng TRƯỚC transaction, 1 `$transaction`, upsert theo key, key vắng khai báo → `isActive=false` (không DELETE). Chạy tự động sau migrate trong `deploy.yml` + `migrate-test.yml` (user duyệt 09/08), DB URL = SESSION pooler (tiền lệ seed-prod-roles).
- Liệt kê: `pnpm permissions:list` (+`--db` đối chiếu DB, `--strict` exit≠0 khi lệch).
- **Registry chưa có consumer runtime** — `can()` v1/v2 CHƯA đọc nó (đó là US-02). `RoleDef`/`RolePermission`/`UserOrgRole` giữ nguyên; quyết định thiết kế: `PermissionGrant` (US-02/03) sẽ trỏ `subjectId = RoleDef.id` khi `subjectType=ROLE` — KHÔNG tạo bảng Role mới.
- **Shape cam kết cho US-02/US-03** (đông cứng để khỏi trôi): `PermissionGrant { subjectType ROLE|GROUP, subjectId, permissionKey → PermissionDescriptor.key, effect ALLOW|DENY, dataScope, fieldMask String[], derivedFrom String? }` — cột dataScope/fieldMask/derivedFrom có mặt ngay migration US-02 dù engine chưa dùng (BA §6 "chừa cột trước").

## AS-BUILT — US-02 Hàm can() hợp nhất (09/08/2026)

- **Engine `lib/permissions/can.ts`** (PURE+SYNC): `resolveGrant` → DENY(fieldMask rỗng) thắng ALLOW cùng key khi scope khớp; DENY có fieldMask = DENY cấp trường (không chặn action, chỉ che trường); ALLOW hit + scope fail → **false, KHÔNG fallback** (grant là nguồn sự thật về key nó nói); không grant khớp → fallback NGUYÊN TRẠNG đường cũ (v1/v2/shadow/flag). Bảng `PermissionGrant` ship RỖNG ⇒ zero-behavior-change có test parity khẳng định.
- **Điều chỉnh sau review đối kháng 09/08** (13 agent, 8 finding vá): (1) `UNIT_AND_BELOW` per-role qua `roleCenterScope[subjectId]` — KHÔNG dùng union `visibleCenterIds` toàn actor (chặn rò ngang qua role kiêm nhiệm; pre-P1 hai mức UNIT_* trùng nhau khi role gán tại CENTER, phân biệt thật ở P1 bằng `OrgUnit.path`); (2) row ALLOW mang fieldMask = invalid → engine bỏ qua + warn (US-03 chặn cứng ở write path); (3) `checkPermissionDetail` trả mask VÔ ĐIỀU KIỆN qua `decidePermissionDetailWithGrant` — DENY cấp trường đơn độc vẫn che trường khi ALLOW đến từ đường cũ.
- **Điểm cắm:** `lib/auth/check-permission.ts` (cửa của 279 call-site) → lõi `lib/auth/permission-decision.ts` (tách file để test integration import không kéo next-auth). Grant hit → KHÔNG chạy shadow-compare (không nhiễu RbacShadowDiff). `defineAction`/factory chuyển sang can hợp nhất (0 consumer production). SUPER_ADMIN bypass grant — lệch CÓ CHỦ ĐÍCH so với "DENY tuyệt đối" (chống tự khoá admin).
- **Cache theo request (AC4):** grant nạp 1 lần trong `resolveActorUncached` (query thứ 5, skip khi roleIds rỗng — PARENT không tốn query) + `React.cache` sẵn có ⇒ 20 lần can() = 0 query thêm. KHÔNG cache cross-request.
- **Schema `PermissionGrant`** đúng shape cam kết US-01; subjectId polymorphic (RoleDef.id | UserGroup.id) không FK — validate ở write path (US-03); `@@unique([subjectType,subjectId,permissionKey,effect])`; KHÔNG có orgUnitId (grant gắn Role/Group toàn hệ, phạm vi nằm trong dataScope — không phải "dữ liệu theo đơn vị" của luật #3). Migration idempotent IF NOT EXISTS (`20260809120000`).
- **Lint no-inline-authz 2 tầng (TS-03/AC5):** (a) `no-restricted-syntax` chặn so `.role`/`.roles.includes`/`hasRole`/`.centerId` (đã loại trừ so với undefined/null — giảm bắt oan guard partial-update); (b) rule local `require-can-in-write-action` duyệt AST (không regex text — comment không tắt được rule; bắt cả `export { fn }`/`export default ident`). Scope 5 glob phủ cả `_*-actions.ts`/`_*-core.ts`/`_actions/**`. **Allowlist grandfather 71 file** (`lib/eslint/inline-authz-allowlist.mjs` — phần lớn do action gọi checkPermission qua wrapper cục bộ mà rule không xuyên) + freshness test chống mục thừa. ⚠️ "Vi phạm → build fail" nghĩa thực = job `pnpm lint` CI đỏ chặn merge (`pnpm build` không chạy eslint).
- **Nợ ghi nhận cho story sau:** helper aggregate (menu-permissions, widget-registry) chưa biết grant DENY — cập nhật khi grant có dữ liệu thật (US-03); GROUP resolve trả rỗng tới US-03; màn `/admin/users/[id]/permissions` (UserPermissionGrant cũ) freeze + story deprecate riêng SAU US-03 (user duyệt 09/08); trả nợ allowlist 71 file dần theo story.

## AS-BUILT — US-04 Khung test ma trận quyền (09/08/2026)

- **Ma trận TS-04 ở tầng unit thuần** (`lib/permissions/matrix.test.ts` + `matrix-fixture.ts`): 24 case (4 dataScope × 3 relationshipType × 2 effect) + tripwire + case biên = 26 test. Cây mẫu AC1 là **mô hình tham chiếu in-memory** (`TREE` — HO → {Vùng-A, Đà Nẵng} → {CS-F FRANCHISEE, CS1 OWNED, CS-L AFFILIATE}) vì schema hiện tại chưa có REGION/relationshipType (US-05/P1) — builder `matrixActor/matrixTarget` path-resolve tại fixture-time, **P1 chỉ đổi builder, 24 dòng kỳ vọng giữ nguyên**. KHÔNG tầng integration DB trong US-04 (buộc migration = vi phạm luật #4) — integration ma trận là việc P3 shadow (US-12).
- **20 case chạy thật** với engine US-02; **4 case pending** `[US-04→P5]` (ALLOW × {ALL, UNIT_AND_BELOW} × {FRANCHISEE, AFFILIATE} — chân trị false theo BA §4 "HO chỉ thấy số đếm tổng hợp" + R5 mặc định DENY chi tiết).
- **Quy ước expected-fail MỚI của repo (vitest): `it.fails` + tripwire.** `it.fails` assertion viết theo CHÂN TRỊ TƯƠNG LAI — hôm nay sai → CI xanh; resolver P5 lên làm case pass → `it.fails` tự ĐỎ ("Expect test to fail") → buộc gỡ mark. Tripwire là test THƯỜNG pin hành vi hôm nay của đúng các ô pending — resolver đổi bất kỳ hướng nào cũng đỏ, không ô nào bị gỡ lặng lẽ. Đã kiểm FLIP 2 chiều khi giao. (Khác `test.fixme` Playwright — fixme chỉ skip, không flip.)
- **TS-18 pin HỢP ĐỒNG** chuỗi 4 điều kiện qua skeleton `lib/permissions/session-content-gate.ts` (`canViewSessionContent` throw `NotImplementedYetError` — user duyệt tạo code sản phẩm 09/08): 7 case `it.fails` (4 DENY thiếu từng điều kiện · đủ 4 → CONTENT · MANAGER → LIST_ONLY · GV CS-F FC ACTIVE → CONTENT, chốt 27/07) + tripwire toThrow. **US-16 BẮT BUỘC hiện thực đúng hàm này** và Server Action trả nội dung buổi phải gọi qua nó (luật #7); tripwire ép gỡ 7 `.fails` cùng commit hiện thực.
- **Nợ ghi cho story sau:** US-05 dựng seed DB từ chính `TREE` (giữ 1 nguồn hình dạng cây); US-12 chạy ma trận ở tầng integration/shadow; P5 flip 4 ô pending + TS-18.

## Nguồn quyền

- **Token KHÔNG chứa quyền.** JWT chỉ mang `userId`; toàn bộ role/scope resolve từ DB mỗi request (cache theo request). Lý do: thu quyền phải hiệu lực tức thì (F3).
- Chuỗi resolve: User → Assignment (hiệu lực) → Position → Role ∪ UserGroup → PermissionGrant → dataScope (path ∪ WorkScope) → kiểm FranchiseContract cho grant `derivedFrom`.
- Thứ tự: **DENY > ALLOW tường minh > kế thừa.**

## Vai trò chuẩn (isSystemRole, khoá cứng)

| Role | Cấp | Ghi chú |
|---|---|---|
| ADMIN_HO | HO | Toàn quyền lõi; thao tác flag cutover |
| TRAINING_HO | HO | Duy nhất (cùng ADMIN_HO) được sửa CURRICULUM |
| REGION_MANAGER | REGION | UNIT_AND_BELOW trong vùng |
| CENTER_MANAGER | CENTER | UNIT_ONLY; chương trình: chỉ danh sách |
| TEACHER | — (gắn Position Đào tạo) | Nội dung buổi qua chuỗi 4 điều kiện |
| SALE | CENTER | Lead/học viên UNIT_ONLY; 1-1 chỉ với PH mình phụ trách (theo BA chat) |
| ACCOUNTANT_HO | HO | Xuất seam kế toán |
| GUARDIAN (PH) | ngoài cây | Chỉ OWN qua Guardian–Student |

Vai trò tuỳ biến: đơn vị tự tạo trong phạm vi mình (LOCAL_ONLY), không sửa vai trò chuẩn.

## Ma trận tài nguyên × thao tác × vai trò (rút gọn theo nghiệp vụ chốt)

| Tài nguyên | ADMIN_HO | TRAINING_HO | REGION_MGR | CENTER_MGR | TEACHER | GUARDIAN | FRANCHISEE (đơn vị) |
|---|---|---|---|---|---|---|---|
| OrgUnit | CRUD ALL | — | R (below) | R (unit) | — | — | R (unit) |
| Role/Grant | CRUD ALL | — | R | R (unit) + tạo role LOCAL_ONLY | — | — | tạo role LOCAL_ONLY |
| Position/Assignment/WorkScope | CRUD ALL | — | CRUD (below) | R (unit) | R (mình) | — | CRUD (unit, theo FC) |
| Học viên | R ALL* | — | R (below)* | CRUD (unit) | R (lớp mình) | R (con mình) | CRUD (unit của họ) |
| Chương trình — nội dung | CRUD | CRUD | **DENY** | **DENY** | R (chuỗi 4 đk) | — | **DENY sửa**; GV họ R theo chuỗi |
| Chương trình — danh sách | R | R | R | R | R | — | R |
| Học phí/doanh thu | R ALL trên OWNED; franchise: tổng hợp + khoản tính phí | — | như ADMIN trong vùng | CRUD (unit) | — | R (đơn của con) | CRUD (unit; pháp nhân họ) |
| FranchiseContract | CRUD + transition | — | R (vùng) | — | — | — | R (hợp đồng của mình), **DENY transition** |
| CatalogItem ghi đè | theo policy | publish GLOBAL | theo policy vùng | theo policy | — | — | LOCKED chặn / BOUNDED kiểm biên / OVERRIDABLE cho |
| Audit log | R ALL (bị log) | — | R (below) | R (unit) | — | — | R (unit) |

\* Học viên của đơn vị FRANCHISEE: HO/vùng chỉ thấy số đếm tổng hợp, không thấy hồ sơ chi tiết (ranh giới pháp lý, BA §4).

## RLS vs kiểm ở code

| Lớp | Phạm vi |
|---|---|
| Supabase RLS | Bảng realtime của module chat (theo Participant — đã chốt ở BA chat); các bảng client đọc trực tiếp |
| `can()` ở Server Action | TOÀN BỘ thao tác ghi + đọc qua server. Đây là lớp chính của nền |
| DB constraint | Chống vòng lặp cây (OrgUnit, reportsToPositionId), unique PRIMARY assignment, máy trạng thái FC |

Quy tắc bất biến: **không Server Action nào kiểm quyền ngoài `can()`** — thực thi bằng lint (TS-03).
