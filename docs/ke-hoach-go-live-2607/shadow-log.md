# Nhật ký shadow-compare (#01) — cổng flip RBAC v2 (#09)

> DoD #01: **3–5 ngày VN liên tiếp 0 lệch, trên traffic thật**. Xem cơ chế ở
> [`runbook-prod-flip-prereq.md` §4](runbook-prod-flip-prereq.md).
> Đọc số liệu hằng ngày: Actions → **Shadow-compare report (read-only)** (`workflow_dispatch`, chỉ đọc).

## Quy tắc đồng hồ

1. Đồng hồ chỉ được bấm khi **preflight coverage = 0** (mọi nhân viên đều có `UserOrgRole` ACTIVE).
   v2 lấy quyền **duy nhất** từ `UserOrgRole → RoleDef → RolePermission` (`lib/auth/actor.ts:164`).
   Thiếu dòng đó ⇒ v2 deny sạch ⇒ lệch giả tràn bảng, và flip #09 sẽ **khoá** tài khoản đó.
2. Bấm đồng hồ = `TRUNCATE "RbacShadowDiff"` **một lần**, sau khi preflight xanh.
3. **Quy tắc vàng:** mọi thay đổi làm đổi hành vi v2 (sửa `seed-roles.ts`, `can.ts`, gán/rút `UserOrgRole`)
   ⇒ `TRUNCATE` + đếm lại từ đầu. Vì vậy **#17 không được deploy prod / không chạy `seed-prod-roles`**
   cho tới sau flip #09 — nó sửa cả v1 matrix lẫn v2 seed (`report-cards:*`).
4. Bảng trống vì **không ai dùng prod** ≠ đã kiểm chứng. Mỗi ngày phải ghi rõ *ai đã thao tác gì*.

## Trạng thái đồng hồ

| | |
|---|---|
| Trạng thái | 🔴 **CHƯA CHẠY** — chặn bởi preflight P1 (3 nhân viên thiếu `UserOrgRole`) |
| Ngày sạch liên tiếp | 0 |
| Mốc bấm đồng hồ | *(chưa)* — bấm sau khi P1 = 0 dòng |

---

## Nhật ký

### 09/07/2026 — preflight ĐỎ, đồng hồ chưa hợp lệ

**P1 — nhân viên thiếu `UserOrgRole` ACTIVE: 3 dòng (phải = 0).**

| email | role (v1) | roles[] | centerId | Hệ quả nếu flip #09 ngay |
|---|---|---|---|---|
| admin@satarobo.vn | SUPER_ADMIN | {SUPER_ADMIN} | null | **Mất toàn bộ quyền.** `can.ts:40` bypass theo `actor.isSuperAdmin`, cờ này chỉ bật khi có `UserOrgRole` code `SUPER_ADMIN` tại OrgUnit type HO/ROOT. Mất luôn `roles:assign` ⇒ **tự khoá, chỉ sửa được bằng SQL** |
| daotao@satarobo.vn | TRAINING | {TRAINING} | null | Toại mất quyền đào tạo (câu 8 provisioning chưa làm) |
| giaovien@satarobo.vn | TEACHER | {TEACHER} | null | GV mất quyền; `centerId = null` nên `patch-rbac-staff.ts` sẽ **SKIP** (không đoán bừa cơ sở) |

**P2 — prod đã chạy build có wiring: ✅** Bằng chứng nằm ngay trong P3: `RbacShadowDiff` có dòng lúc
`2026-07-09 01:14 UTC` (08:14 VN). Chỉ code đã wire `checkPermission()` mới ghi được vào bảng này.
(Cách kiểm khác: Vercel → Deployments → Production → commit SHA ≥ `58c7d34`.)

**P3 — bảng shadow trước khi đụng vào:** 77 dòng, từ `2026-07-08 11:09 UTC` (18:09 VN 08/07)
đến `2026-07-09 01:14 UTC` (08:14 VN 09/07).

**⚠️ Mâu thuẫn số liệu:** P3 có 77 dòng với `moi_nhat` = hôm nay, nhưng C2 (`lệch trong 7 ngày`) = 0.
Hai kết quả này không thể cùng đúng trên cùng một DB. Giả thuyết: đã chạy `TRUNCATE` (Bước 1) giữa P3
và C1/C2 — khớp với việc C1 trả về rỗng. **Cần xác nhận.** Nếu đúng, 77 dòng đã bị xoá **trước khi được
phân loại**; nhiều khả năng toàn bộ là `v1=true, v2=false` sinh bởi đúng 3 tài khoản ở P1.

**Kết luận: KHÔNG tính 08/07 là ngày sạch.** Hai lý do độc lập:
1. P1 đỏ ⇒ 3 tài khoản này còn đẻ lệch mỗi lần thao tác.
2. Vá P1 = gán `UserOrgRole` = **đổi hành vi v2** ⇒ quy tắc vàng bắt `TRUNCATE` + đếm lại.

**Việc phải làm trước khi bấm đồng hồ:**

- [ ] Gán `UserOrgRole` cho `admin@` (SUPER_ADMIN @ HO) và `daotao@` (TRAINING @ HO)
      → `prisma/patch-rbac-staff.ts` (idempotent, không reset RolePermission).
- [ ] `giaovien@satarobo.vn`: set `User.centerId` (CS1 hay CS2?) rồi chạy lại patch, **hoặc** gán tay qua
      `/admin/users/[id]/org-roles` (đi qua `rbac-service` → có `RbacAuditLog` + reason — đường ưu tiên).
- [ ] Chạy lại report → P1 = 0 dòng.
- [ ] `TRUNCATE "RbacShadowDiff";` → ghi mốc bấm đồng hồ vào bảng "Trạng thái" ở trên.

---

### Mẫu dòng nhật ký hằng ngày

```
### DD/MM/2026 — <sạch | có lệch>
- Lệch trong ngày: N (link run Actions)
- Traffic thật: <ai · vai trò · thao tác gì>  ← bắt buộc, không có = ngày không tính
- Phân loại (nếu có lệch): action · v1/v2 · nguyên nhân · xử lý
- Đồng hồ: ngày sạch thứ K/5  |  RESET vì <lý do>
```
