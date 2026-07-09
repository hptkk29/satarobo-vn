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

**Deadlock bootstrap (phát hiện 09/07).** Không thể set cơ sở cho tài khoản qua UI: picker "Đơn vị"
(`app/(admin)/admin/users/new/page.tsx:69` → `getSelectableOrgUnits(actor)` → `lib/org/org-tree.ts:150-158`)
lọc theo `isSuperAdmin / isHoLevel / visibleCenterIds / roleOrgUnitIds` — cả bốn đều suy từ `UserOrgRole`.
`admin@` không có dòng nào ⇒ picker rỗng ⇒ không gán được đơn vị, kể cả Hội sở (HO là **đơn vị**, không phải
role — `lib/validators/user.ts:6`). Triệu chứng đã ghi sẵn trong header `prisma/patch-rbac-admins.ts` (RC-A).
⇒ **Phải chạy patch TRƯỚC, sửa tài khoản SAU.** Đuôi email `.cs1@`/`.cs2@` là escape hatch cho đúng ca này.

**Dry-run `patch-rbac-staff` (prod, 09/07) — chứng từ cấp quyền.**
Script gán `UserOrgRole` **không đi qua `rbac-service`** ⇒ **không sinh `RbacAuditLog`**. Mục này là chứng từ thay thế.

```
[dry] admin@satarobo.vn        → SUPER_ADMIN @ HO
[dry] daotao@satarobo.vn       → TRAINING    @ HO
[dry] giaovien.cs1@satarobo.vn → TEACHER     @ CS1
🔎 DRY-RUN: sẽ ghi 3 · giữ nguyên 0 UserOrgRole.
```
Không có mục "Bỏ qua", không dòng `KÍCH HOẠT LẠI`, không cấp role chức năng `HO_*`. → duyệt apply.

**⚠️ `giữ nguyên 0` = prod chưa có bất kỳ `UserOrgRole` nào, và chỉ có 3 tài khoản nhân viên active.**
Thiếu QL cơ sở / Sale-CSM / Kế toán / HR / Marketing ⇒ đồng hồ sẽ **xanh giả**: 5 ngày sạch chỉ chứng minh
được 3 role, trong khi flip #09 tác động 8 role. Phải provisioning đủ tài khoản TRƯỚC khi bấm đồng hồ.

**Việc phải làm trước khi bấm đồng hồ (đúng thứ tự):**

- [x] `patch-rbac-staff` `mode=apply` → 3 `UserOrgRole` đầu tiên; `admin@` thành SUPER_ADMIN thật ở v2. *(09/07)*
- [x] Xác nhận picker "Đơn vị" ở `/admin/users/new` đã hiện `Hội sở / Cơ sở 1 / Cơ sở 2`. *(09/07 — deadlock RC-A đã gỡ)*
- [ ] Tạo **đủ** tài khoản nhân sự thật (GV CS2, QL cơ sở, Sale-CSM, Kế toán, HR, Marketing) + set Đơn vị.
- [ ] Gán `UserOrgRole` cho các tài khoản mới — ưu tiên `/admin/users/[id]/org-roles` (qua `rbac-service`
      → có `RbacAuditLog` + reason); hoặc chạy lại patch (idempotent, suy cơ sở qua `centerId`).
- [ ] Chạy lại report → P1 = 0 dòng.
- [ ] `TRUNCATE "RbacShadowDiff";` → ghi mốc bấm đồng hồ vào bảng "Trạng thái" ở trên.

**Khi nào PHẢI reset đồng hồ (làm rõ — bản 09/07 trước đó viết quá tay):**

| Thay đổi | Reset? | Vì sao |
|---|---|---|
| Sửa `seed-roles.ts` / `can.ts` / `permissions.ts` | **Có** | Đổi mapping role→permission cho mọi người ⇒ quan sát cũ vô nghĩa |
| Thêm user vào role × đơn vị **đã** có tài khoản thao tác trong cửa sổ | Không | Không sinh dòng lệch nào; mapping không đổi |
| Thêm role × đơn vị **chưa từng** có tài khoản nào chạy qua | Không (kỹ thuật) | Nhưng ngày sạch cũ **không chứng minh gì** cho tổ hợp mới ⇒ phủ đủ tổ hợp TRƯỚC khi bấm đồng hồ |

---

### Mẫu dòng nhật ký hằng ngày

```
### DD/MM/2026 — <sạch | có lệch>
- Lệch trong ngày: N (link run Actions)
- Traffic thật: <ai · vai trò · thao tác gì>  ← bắt buộc, không có = ngày không tính
- Phân loại (nếu có lệch): action · v1/v2 · nguyên nhân · xử lý
- Đồng hồ: ngày sạch thứ K/5  |  RESET vì <lý do>
```
