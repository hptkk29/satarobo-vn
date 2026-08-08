# permissions.md — Ai được làm gì (INTENDED STATE)

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
