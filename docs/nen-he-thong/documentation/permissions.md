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
