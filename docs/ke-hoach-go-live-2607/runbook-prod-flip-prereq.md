# Runbook — Chuẩn bị PROD trước khi flip #04 & #09

> **Mục tiêu:** 3 việc trên **PROD DB** làm điều kiện mở khoá flip `attendance:edit`/Attendance-SCOPED (#04) và flip `RBAC_V2_ENABLED` (#09).
> **Ai chạy:** người có quyền prod (TGĐ/Kiệt). Agent KHÔNG có credential prod.
> **Nguồn:** task `satarobo_task/02-prod-backfill-seed` + `01-shadow-compare-van-hanh`; script gốc `satarobo-requiment/backfill_attendance_centerid.sql` (đã diễn tập DEV sạch 06/07).
> **Cập nhật:** 2026-07-08 (sau khi đã push batch 7 task + seed prod v2 verified).

---

## 0. Bối cảnh — cái gì ĐÃ xong, cái gì runbook này lo

| Việc | Trạng thái |
|---|---|
| Schema prod (gồm `Student.parentNationalId`) | ✅ tự chạy qua `deploy.yml` → `prisma migrate deploy` |
| Backfill `Enrollment/ClassSession.centerId` | ✅ tự chạy qua migration `20260624010000_fl_backfill_centerid` |
| Seed RBAC v2 (RoleDef + RolePermission) | ✅ chạy qua workflow `seed-prod-roles.yml`, verify PASS (14 role) |
| **Backfill `Attendance.centerId`** | 🔴 runbook này — Phần A (prep #04) |
| **Check `UserPermissionGrant` DENY** | 🔴 runbook này — Phần B (prereq #09) |
| **Shadow-compare sạch ≥3–5 ngày** | 🔴 runbook này — Phần C (cổng #09) |

> ⚠️ Runbook này chỉ **nạp/kiểm dữ liệu**. Bản thân việc **flip** (#04 = code chuyển Attendance sang SCOPED + deploy; #09 = đổi env `RBAC_V2_ENABLED=true` trên Vercel + redeploy) là bước SAU, làm khi cả 3 phần dưới đều xanh.

---

## 1. Chuẩn bị truy cập PROD

**Cách 1 — Supabase SQL Editor (khuyên dùng cho query đọc + UPDATE idempotent):**
1. Đăng nhập <https://supabase.com/dashboard> → chọn **project PROD** (KHÔNG phải DEV `mqvojwccdhqbagfnjhfo`).
2. Menu trái → **SQL Editor** → **New query** → dán SQL → **Run** (Ctrl/Cmd+Enter).

**Cách 2 — psql (bắt buộc nếu muốn BEGIN/COMMIT thủ công ở Phần A):**
1. Supabase → **Project Settings → Database → Connection string** → chọn **Session mode** (port `5432`).
2. `psql "postgresql://postgres.<ref>:<password>@aws-...pooler.supabase.com:5432/postgres"`

> 🔒 **An toàn:** mọi SQL dưới đây **chỉ đọc hoặc UPDATE idempotent** (chỉ động dòng `centerId IS NULL`, không ghi đè bằng NULL, không DELETE). Chạy lại bao nhiêu lần cũng ra cùng kết quả. Phần A có bước dry-run bắt buộc trước khi ghi.

---

## 2. PHẦN A — Backfill `Attendance.centerId` (prep #04)

**Vì sao:** #04 sẽ chuyển `Attendance` từ `SCOPE_EXEMPT` → `SCOPED_MODELS`. Khi đó `scopedDb` tự chèn `centerId IN (...)`; dòng nào `centerId = NULL` sẽ **bị ẩn nhầm** với mọi role theo cơ sở (CM/Sale/Kế toán/GV). Nên phải nạp `centerId` = 100% TRƯỚC.
**Chuỗi suy ra:** `Attendance."sessionId"` → `ClassSession` → `COALESCE(ClassSession."centerId", Class."centerId")`.
**Hiện tại vô hại:** Attendance đang EXEMPT trong code prod → nạp giờ KHÔNG đổi hành vi, chỉ chuẩn bị.

### A1 — Dry-run (CHỈ ĐỌC — chạy trước, không đổi gì)

```sql
WITH resolved AS (
  SELECT a.id, COALESCE(cs."centerId", c."centerId") AS derived_center_id
  FROM "Attendance" a
  LEFT JOIN "ClassSession" cs ON cs.id = a."sessionId"
  LEFT JOIN "Class" c ON c.id = cs."classId"
  WHERE a."centerId" IS NULL
)
SELECT COUNT(*) AS tong_null,
       COUNT(*) FILTER (WHERE derived_center_id IS NOT NULL) AS backfill_duoc,
       COUNT(*) FILTER (WHERE derived_center_id IS NULL)     AS orphan
FROM resolved;
```

**Ghi lại 3 số:** `tong_null` / `backfill_duoc` / `orphan`.
- Kỳ vọng: `backfill_duoc + orphan = tong_null`.
- Nếu `tong_null = 0` → Attendance đã có centerId đủ (có thể migration/đường tạo mới đã set) → **bỏ qua A2, sang A3 verify**.

### A1b — Nếu `orphan > 0`: xem lý do TRƯỚC khi ghi

```sql
WITH resolved AS (
  SELECT a.id AS attendance_id, a."sessionId" AS session_id,
         cs.id AS session_found, cs."classId" AS class_id, c.id AS class_found,
         COALESCE(cs."centerId", c."centerId") AS derived_center_id
  FROM "Attendance" a
  LEFT JOIN "ClassSession" cs ON cs.id = a."sessionId"
  LEFT JOIN "Class" c ON c.id = cs."classId"
  WHERE a."centerId" IS NULL
)
SELECT attendance_id, session_id,
  CASE
    WHEN session_id IS NULL THEN 'sessionId NULL trên Attendance'
    WHEN session_found IS NULL THEN 'ClassSession không tồn tại (FK gãy)'
    WHEN class_id IS NULL THEN 'ClassSession.classId NULL'
    WHEN class_found IS NULL THEN 'Class không tồn tại (FK gãy)'
    WHEN derived_center_id IS NULL THEN 'ClassSession.centerId & Class.centerId đều NULL'
    ELSE 'OK'
  END AS ly_do_orphan
FROM resolved WHERE derived_center_id IS NULL ORDER BY attendance_id;
```
→ Quyết định xử lý tay từng orphan (vd gán class/center đúng cho ClassSession mồ côi). Orphan hợp lệ (dữ liệu rác cũ) có thể để nguyên NULL — sau flip #04 nó sẽ ẩn, cân nhắc xoá nếu là rác. **Gửi bảng này cho tôi nếu cần tư vấn.**

### A2 — Backfill thật

**Cách an toàn nhất (psql, có COMMIT thủ công):**
```sql
BEGIN;

UPDATE "Attendance" a
SET "centerId" = COALESCE(cs."centerId", c."centerId")
FROM "ClassSession" cs
LEFT JOIN "Class" c ON c.id = cs."classId"
WHERE a."sessionId" = cs.id
  AND a."centerId" IS NULL
  AND COALESCE(cs."centerId", c."centerId") IS NOT NULL;
-- psql in ra "UPDATE <n>"  → n PHẢI = backfill_duoc ở A1

SELECT COUNT(*) AS con_null_sau_update FROM "Attendance" WHERE "centerId" IS NULL;
-- con_null_sau_update PHẢI = orphan ở A1
```
- Nếu `con_null_sau_update == orphan` (A1) → gõ `COMMIT;`
- Nếu khác / nghi ngờ → gõ `ROLLBACK;` (không mất gì) → báo tôi.

**Supabase SQL Editor** (tự commit từng lần Run): chạy thẳng khối `UPDATE ...` ở trên (bỏ `BEGIN;`). Vì idempotent + chỉ động dòng NULL nên an toàn; sau đó chạy A3.

### A3 — Verify sau backfill (PHẢI = 0)

```sql
SELECT COUNT(*) AS lech_center_phai_bang_0
FROM "Attendance" a
JOIN "ClassSession" cs ON cs.id = a."sessionId"
LEFT JOIN "Class" c ON c.id = cs."classId"
WHERE a."centerId" IS NOT NULL
  AND COALESCE(cs."centerId", c."centerId") IS NOT NULL
  AND a."centerId" <> COALESCE(cs."centerId", c."centerId");
```
→ `lech_center_phai_bang_0 = 0` là ĐẠT. **Ghi lại A1 (3 số) + A3 (=0)** để mở khoá phần Attendance của #04.

**✅ DoD Phần A:** `lech = 0` và số dòng `centerId IS NULL` còn lại = số orphan đã hiểu rõ (0 nếu không có rác).

---

## 3. PHẦN B — Check `UserPermissionGrant` DENY (prereq #09)

**Vì sao:** RBAC v2 dùng nguyên tắc **ALLOW-wins, KHÔNG có DENY override**. Nếu prod còn grant `effect = DENY` (v1 tôn trọng, v2 bỏ qua) → sau flip #09 người đó **được cấp quyền ngoài ý muốn**.

```sql
SELECT "userId", "action", "effect", "createdAt"
FROM "UserPermissionGrant"
WHERE "effect" = 'DENY';
```

| Kết quả | Xử lý |
|---|---|
| **0 dòng** | ✅ PASS — ghi nhận, không cần gì |
| **Có dòng** | 🔴 **KHÔNG flip #09** cho tới khi xử lý mỗi dòng: (1) thay bằng thu hẹp role của user đó, HOẶC (2) vô hiệu grant (set inactive/xoá) + ghi `RbacAuditLog` lý do. Gửi tôi danh sách → tôi tư vấn cách convert an toàn |

**✅ DoD Phần B:** query trả **0 dòng** (hoặc đã convert hết + audit).

---

## 4. PHẦN C — Shadow-compare sạch ≥3–5 ngày (cổng #09)

**Cơ chế:** mỗi `checkPermission()` trên prod chạy **song song v1 (matrix tĩnh) + v2 (RoleDef/UserOrgRole)**; nếu lệch (`v1 ≠ v2`) ghi 1 dòng `RbacShadowDiff` (fire-and-forget, không chặn request). Runtime vẫn dùng **v1** (vì `RBAC_V2_ENABLED=false`); v2 chỉ chạy ngầm để so.
**Cổng flip #09:** `isSafeToEnableRbacV2` = **`COUNT(RbacShadowDiff trong N ngày) === 0`**. BGĐ chốt **3–5 ngày liên tục sạch** trên traffic thật.

### C0 — Reset đồng hồ (chạy 1 LẦN, ngay sau khi đã seed v2 prod)

```sql
-- TRƯỚC khi seed v2, mọi check v2 = false (chưa có RolePermission) → RbacShadowDiff
-- đầy "lệch giả". Đã seed + verify xong (08/07) → xoá noise, đồng hồ sạch tính từ đây.
TRUNCATE "RbacShadowDiff";
```
> Chỉ chạy 1 lần sau seed. Sau này chỉ TRUNCATE lại khi bạn SỬA seed/code làm đổi hành vi v2 (xem C3).

### C1 — Theo dõi hằng ngày (mỗi ngày 1 lượt, trong 3–5 ngày)

```sql
SELECT DATE("createdAt") AS ngay, action,
       COUNT(*) AS so_lech, COUNT(DISTINCT "userId") AS so_user
FROM "RbacShadowDiff"
GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC;
```
- Bảng rỗng / không có dòng ngày hôm nay = ngày đó sạch.

### C2 — Cổng "sạch" (khớp `isSafeToEnableRbacV2`)

```sql
SELECT COUNT(*) AS lech_7_ngay
FROM "RbacShadowDiff"
WHERE "createdAt" >= now() - interval '7 days';
```
→ `= 0` **liên tục** qua 3–5 ngày có traffic thật → **ĐÈN XANH flip #09**.
> Lưu ý: cần có **traffic thật** (nhiều vai trò thao tác leads/students/cham-cong...) thì cổng mới có ý nghĩa. Bảng trống vì "không ai dùng" ≠ đã kiểm chứng.

### C3 — Khi CÓ lệch: phân loại + xử lý

```sql
SELECT action, v1, v2, "targetKey", COUNT(*) AS n
FROM "RbacShadowDiff"
WHERE "createdAt" >= now() - interval '1 day'
GROUP BY action, v1, v2, "targetKey" ORDER BY n DESC;
```

| Dấu hiệu | Nguyên nhân | Xử lý |
|---|---|---|
| `v1=true, v2=false` | (a) seed v2 thiếu action cho role; HOẶC (b) gate check trước khi có `targetKey` (thiếu centerId ở action CENTER-scope — đã biết trước) | (a) thêm vào `prisma/seed-roles.ts` → chạy lại workflow **seed-prod-roles** → **TRUNCATE (C0) reset đồng hồ**; (b) whitelist có ghi chú "lệch có chủ đích" |
| `v1=false, v2=true` | v2 rộng hơn v1 | Xem `lib/auth/can.ts`: v2 đúng hơn → whitelist; v2 sai → sửa code + deploy + reset đồng hồ |

> **Quy tắc vàng:** bất kỳ lần sửa seed/code làm đổi hành vi v2 → **TRUNCATE + đếm lại từ đầu**. Chỉ tính "ngày sạch" khi KHÔNG còn thay đổi.

**✅ DoD Phần C:** `lech_7_ngay = 0` liên tục 3–5 ngày (trừ whitelist ghi rõ) trên traffic thật.

---

## 5. Sau khi cả A/B/C xanh — bước flip (KHÔNG thuộc runbook này)

1. **Flip #04** (Attendance SCOPED + `attendance:edit` call-site): việc CODE (chuyển `Attendance` vào `SCOPED_MODELS` trong `lib/db-scope.ts` + đảo test + carve-out học bạ chuyển cơ sở) → PR + deploy. Backfill Phần A là điều kiện tiên quyết.
2. **Flip #09** (`RBAC_V2_ENABLED=true`): đổi env trên **Vercel → Project → Settings → Environment Variables (Production)** → redeploy. **Rollback tức thì** = đổi lại `false` + redeploy. Điều kiện: A ✅ + B ✅ + C ✅ + smoke 8 vai trò sau flip.
3. Giữ shadow đảo chiều theo dõi 1 tuần sau flip.

---

## 6. Checklist tổng (tick khi xong)

```
[ ] C0  TRUNCATE RbacShadowDiff (reset đồng hồ sau seed v2)          — 1 lần, làm ĐẦU TIÊN
[ ] A1  Dry-run Attendance backfill → ghi tong_null/backfill_duoc/orphan
[ ] A1b (nếu orphan>0) xem lý do + xử lý tay
[ ] A2  UPDATE backfill (psql BEGIN/COMMIT hoặc SQL Editor)
[ ] A3  Verify lech_center = 0
[ ] B   Query DENY → 0 dòng (hoặc convert hết + audit)
[ ] C1/C2 (ngày 1..5) đếm lệch mỗi ngày → 0 liên tục
[ ] C3  (nếu có lệch) phân loại + sửa + reset đồng hồ
[ ] → Đủ 3–5 ngày sạch + A ✅ + B ✅  ⇒ đèn xanh flip #04/#09
```

---

## 7. Tham chiếu nhanh (cột/bảng — kiểm nếu schema đổi)

- `Attendance."sessionId"` → FK `ClassSession.id`
- `ClassSession."classId"` → FK `Class.id`; `ClassSession."centerId"` (ưu tiên); `Class."centerId"` (fallback)
- `UserPermissionGrant."effect"` ∈ {ALLOW, DENY}
- `RbacShadowDiff(action, userId, v1, v2, targetKey, createdAt)` — helper: `lib/auth/shadow-report.ts` (`getShadowDiffStats`, `isSafeToEnableRbacV2`)
- Seed prod v2: workflow `seed-prod-roles.yml` (Actions → Run workflow); nguồn `prisma/seed-roles.ts`
