-- =============================================================================
-- AUTH-SĐT — BÁO CÁO CHỈ ĐỌC, bản SQL của `pnpm phone:audit`.
--
-- VÌ SAO CÓ FILE NÀY: `DATABASE_URL` trên Vercel được đánh dấu **Sensitive**,
-- không đọc ngược lại được (kể cả `vercel env pull` — nó ghi ra `[SENSITIVE]`).
-- Ai không giữ mật khẩu DB prod thì chạy các câu dưới đây trong
-- **Supabase Dashboard → project PROD → SQL Editor** (xác thực bằng tài khoản
-- Supabase, không cần mật khẩu DB).
--
-- ⚠️ TOÀN BỘ FILE CHỈ `SELECT`. Không DDL, không tạo function, không ghi.
-- Chạy trên PROD an toàn tuyệt đối.
--
-- Logic chuẩn hoá bám đúng `lib/phone.ts:54-76` (canonical = `84XXXXXXXXX`):
--   · bỏ khoảng trắng / `.` / `-` / `()`, kể cả non-breaking space U+00A0
--   · `+84…` · `0084…` · `84…` · `840…` (thừa số 0) · `0…` · 9 số trần (Excel)
--   · CHỈ nhận di động, đầu số 3/5/7/8/9 — số cố định trả NULL
-- Sửa `lib/phone.ts` thì phải sửa file này theo, nếu không hai bên lệch nhau.
--
-- ── Lịch sử chạy trên PROD ──
-- 29/07/2026 (trước backfill): cần backfill 44 · rác 0 · 1 SĐT→nhiều User 0
--   · cùng SĐT khác tên PH 0 · ConvertConflict OPEN 0.
-- 29/07/2026 (sau `phone-backfill.sql`): **"Dạng cũ" = 0 ở cả 3 cột** —
--   Employee.phone 1/1 · Lead.phone 41/41 · Student.parentPhone 1/1 đã canonical.
--
-- ⚠️ HAI ĐIỀU PHẢI BIẾT KHI ĐỌC CON SỐ "0" NÀY:
-- (1) **Chỉ phủ bản ghi CHƯA xoá mềm.** Cả CÂU A và `phone-backfill.sql` đều lọc
--     `deletedAt IS NULL` cho `Lead`/`Student` (`Employee` **không có** cột `deletedAt`).
--     Bản ghi đã xoá mềm **giữ nguyên dạng `0…`**. Không sao cho việc đọc — mọi đường
--     tra đi qua `phoneVariants()` (`lib/phone.ts:105-113`) nên khớp cả hai dạng —
--     nhưng nếu **phục hồi** một bản ghi thì SĐT của nó trở lại dạng cũ.
--     Truy vấn kiểm khoảng hở này ở cuối file (CÂU E).
-- (2) **Mẫu số rất nhỏ.** 43 trường trên toàn prod. "0 dạng cũ" ở đây nghĩa là
--     *"đã dọn hết những gì đang có"*, KHÔNG phải *"đã kiểm trên tập lớn"*.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- CÂU A — phân bố định dạng theo từng cột
-- ─────────────────────────────────────────────────────────────────────────────
WITH raw AS (
  SELECT 'Lead.phone'           AS col, l.phone         AS v, l."parentName" AS nm, NULL::text        AS puid FROM "Lead"     l WHERE l."deletedAt" IS NULL AND btrim(coalesce(l.phone,''))         <> ''
  UNION ALL
  SELECT 'Student.parentPhone',        s."parentPhone",       s."parentName",       s."parentUserId"       FROM "Student"  s WHERE s."deletedAt" IS NULL AND btrim(coalesce(s."parentPhone",''))  <> ''
  UNION ALL
  SELECT 'Student.parent2Phone',       s."parent2Phone",      s."parentName",       s."parentUserId"       FROM "Student"  s WHERE s."deletedAt" IS NULL AND btrim(coalesce(s."parent2Phone",'')) <> ''
  UNION ALL
  SELECT 'Student.phone',              s.phone,               s."parentName",       s."parentUserId"       FROM "Student"  s WHERE s."deletedAt" IS NULL AND btrim(coalesce(s.phone,''))          <> ''
  UNION ALL
  SELECT 'Employee.phone',             e.phone,               NULL,                 NULL                   FROM "Employee" e WHERE btrim(coalesce(e.phone,''))                                    <> ''
),
a AS (SELECT raw.*, regexp_replace(v, '([[:space:].()-]|' || chr(160) || ')', '', 'g') AS x FROM raw),
b AS (SELECT a.*,   CASE WHEN x LIKE '+%'    THEN substr(x,2) ELSE x END AS y FROM a),
c AS (SELECT b.*,   CASE WHEN y LIKE '0084%' THEN substr(y,3) ELSE y END AS z FROM b),
canon AS (
  SELECT c.*, CASE
    WHEN z !~ '^[0-9]+$'                                                THEN NULL
    WHEN z LIKE '84%' AND substr(z,3) LIKE '0%'
                      AND substr(z,4) ~ '^[35789][0-9]{8}$'             THEN '84' || substr(z,4)
    WHEN z LIKE '84%' AND substr(z,3) NOT LIKE '0%'
                      AND substr(z,3) ~ '^[35789][0-9]{8}$'             THEN '84' || substr(z,3)
    WHEN z LIKE '84%'                                                   THEN NULL
    WHEN z LIKE '0%'  AND substr(z,2) ~ '^[35789][0-9]{8}$'             THEN '84' || substr(z,2)
    WHEN z LIKE '0%'                                                    THEN NULL
    WHEN z ~ '^[35789][0-9]{8}$'                                        THEN '84' || z
    ELSE NULL
  END AS canonical
  FROM c
)
SELECT col                                                             AS "Cột",
       count(*)                                                        AS "Có dữ liệu",
       count(*) FILTER (WHERE canonical IS NOT NULL AND v =  canonical) AS "Đã canonical",
       count(*) FILTER (WHERE canonical IS NOT NULL AND v <> canonical) AS "Dạng cũ (backfill)",
       count(*) FILTER (WHERE canonical IS NULL)                        AS "Không chuẩn hoá được"
FROM canon GROUP BY col ORDER BY col;


-- ─────────────────────────────────────────────────────────────────────────────
-- CÂU B — 5 con số TÓM TẮT (khớp khối `═══ TÓM TẮT ═══` của scripts/phone-audit.ts)
--   · "1 SĐT → nhiều User"  khác 0 ⇒ P3 phải dọn tay trước `User.phone @unique`
--   · "Cùng SĐT khác tên PH" = số cặp gia đình sẽ thấy con của nhau nếu gộp nhầm
-- ─────────────────────────────────────────────────────────────────────────────
WITH raw AS (
  SELECT 'Lead.phone'           AS col, l.phone         AS v, l."parentName" AS nm, NULL::text        AS puid FROM "Lead"     l WHERE l."deletedAt" IS NULL AND btrim(coalesce(l.phone,''))         <> ''
  UNION ALL
  SELECT 'Student.parentPhone',        s."parentPhone",       s."parentName",       s."parentUserId"       FROM "Student"  s WHERE s."deletedAt" IS NULL AND btrim(coalesce(s."parentPhone",''))  <> ''
  UNION ALL
  SELECT 'Student.parent2Phone',       s."parent2Phone",      s."parentName",       s."parentUserId"       FROM "Student"  s WHERE s."deletedAt" IS NULL AND btrim(coalesce(s."parent2Phone",'')) <> ''
  UNION ALL
  SELECT 'Student.phone',              s.phone,               s."parentName",       s."parentUserId"       FROM "Student"  s WHERE s."deletedAt" IS NULL AND btrim(coalesce(s.phone,''))          <> ''
  UNION ALL
  SELECT 'Employee.phone',             e.phone,               NULL,                 NULL                   FROM "Employee" e WHERE btrim(coalesce(e.phone,''))                                    <> ''
),
a AS (SELECT raw.*, regexp_replace(v, '([[:space:].()-]|' || chr(160) || ')', '', 'g') AS x FROM raw),
b AS (SELECT a.*,   CASE WHEN x LIKE '+%'    THEN substr(x,2) ELSE x END AS y FROM a),
c AS (SELECT b.*,   CASE WHEN y LIKE '0084%' THEN substr(y,3) ELSE y END AS z FROM b),
canon AS (
  SELECT c.*, CASE
    WHEN z !~ '^[0-9]+$'                                                THEN NULL
    WHEN z LIKE '84%' AND substr(z,3) LIKE '0%'
                      AND substr(z,4) ~ '^[35789][0-9]{8}$'             THEN '84' || substr(z,4)
    WHEN z LIKE '84%' AND substr(z,3) NOT LIKE '0%'
                      AND substr(z,3) ~ '^[35789][0-9]{8}$'             THEN '84' || substr(z,3)
    WHEN z LIKE '84%'                                                   THEN NULL
    WHEN z LIKE '0%'  AND substr(z,2) ~ '^[35789][0-9]{8}$'             THEN '84' || substr(z,2)
    WHEN z LIKE '0%'                                                    THEN NULL
    WHEN z ~ '^[35789][0-9]{8}$'                                        THEN '84' || z
    ELSE NULL
  END AS canonical
  FROM c
),
multi_user AS (
  SELECT canonical FROM canon
  WHERE col = 'Student.parentPhone' AND canonical IS NOT NULL AND puid IS NOT NULL
  GROUP BY canonical HAVING count(DISTINCT puid) > 1
),
name_conf AS (
  SELECT count(*) AS n FROM (
    SELECT canonical FROM canon
    WHERE col = 'Lead.phone' AND canonical IS NOT NULL AND btrim(coalesce(nm,'')) <> ''
    GROUP BY canonical
    HAVING count(DISTINCT lower(btrim(regexp_replace(nm,'[[:space:]]+',' ','g')))) > 1
  ) q
  UNION ALL
  SELECT count(*) FROM (
    SELECT canonical FROM canon
    WHERE col = 'Student.parentPhone' AND canonical IS NOT NULL AND btrim(coalesce(nm,'')) <> ''
    GROUP BY canonical
    HAVING count(DISTINCT lower(btrim(regexp_replace(nm,'[[:space:]]+',' ','g')))) > 1
  ) q
)
SELECT 'Cần backfill'                  AS chi_tieu, (SELECT count(*) FROM canon WHERE canonical IS NOT NULL AND v <> canonical)::bigint AS so_luong
UNION ALL SELECT 'Rác phải sửa tay',                (SELECT count(*) FROM canon WHERE canonical IS NULL)
UNION ALL SELECT '1 SĐT → nhiều User (CHẶN P3)',    (SELECT count(*) FROM multi_user)
UNION ALL SELECT 'Cùng SĐT khác tên PH',            (SELECT sum(n)  FROM name_conf)
UNION ALL SELECT 'ConvertConflict OPEN',            (SELECT count(*) FROM "ConvertConflict" WHERE status = 'OPEN');


-- ─────────────────────────────────────────────────────────────────────────────
-- CÂU C — ảnh chụp RBAC. Không thuộc AUTH-SĐT, nhưng đo cùng một lần vào
-- SQL Editor thì tiện. `grant` là TỪ KHOÁ SQL ⇒ bắt buộc bọc nháy kép `"grant"`.
--
-- Bối cảnh: `RBAC_V2_ENABLED = "true"` trên Vercel Production, trong khi
-- `lib/auth/can.ts:36-44` khai thẳng "ALLOW-wins, KHÔNG có DENY override" và
-- `grantsDeny` không tồn tại trong `lib/auth/`. ⇒ Số DENY dưới đây là số lệnh
-- cấm đang bị bỏ qua trên prod.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'UserPermissionGrant ALLOW' AS chi_tieu, count(*)::bigint AS so_luong
  FROM "UserPermissionGrant" WHERE "grant" = 'ALLOW'
UNION ALL SELECT 'UserPermissionGrant DENY  ← quyết định mức nghiêm trọng',
                 count(*) FROM "UserPermissionGrant" WHERE "grant" = 'DENY'
UNION ALL SELECT 'UserOrgRole (tổng)',             count(*) FROM "UserOrgRole"
UNION ALL SELECT 'RbacShadowDiff (tổng)',          count(*) FROM "RbacShadowDiff"
UNION ALL SELECT 'RbacShadowDiff 7 ngày gần nhất', count(*) FROM "RbacShadowDiff"
                 WHERE "createdAt" >= now() - interval '7 days';


-- ─────────────────────────────────────────────────────────────────────────────
-- CÂU D — các điểm v1 ≠ v2 đang thực sự xảy ra.
--
-- ⚠️ Ý nghĩa của bảng này ĐÃ ĐỔI sau khi cờ được bật:
--   · cờ OFF → mỗi dòng là DỰ BÁO ("bật cờ thì chỗ này sẽ đổi")
--   · cờ ON  → mỗi dòng là SỰ VIỆC ("chỗ này đang xử khác ma trận cũ")
-- Đường ghi (`lib/auth/check-permission.ts:31-35`) KHÔNG phụ thuộc cờ, nên bảng
-- vẫn đầy lên sau khi flip.
--
--   v1=true,  v2=false → QUYỀN BỊ MẤT   (người dùng bị chặn việc trước làm được)
--   v1=false, v2=true  → QUYỀN ĐƯỢC NỚI (nghiêm trọng hơn — làm được việc ma trận cũ cấm)
--
-- Không lấy `userId` ⇒ không lộ danh tính ai.
--
-- Kết quả 29/07/2026: chỉ 2 nhóm, cả hai đều là quyền BỊ MẤT, KHÔNG có nhóm nới.
--   leads:delete    63 dòng (25→28/07) — SIẾT CÓ CHỦ ĐÍCH, `lib/auth/rbac-intentional.ts:54-55`
--   students:delete  2 dòng (24→25/07) — SIẾT CÓ CHỦ ĐÍCH, `:53`
-- ⚠️ Đừng đọc số dòng thành "số lần thao tác bị chặn". `app/(admin)/admin/leads/page.tsx:257`
-- gọi `checkPermission('leads:delete')` để ẩn/hiện nút ⇒ MỖI LẦN MỞ TRANG là một
-- dòng. 63 ở đây gần với số lượt xem trang hơn là số lần bấm xoá.
-- Dùng `scripts/shadow-report.ts` (phân loại CÓ CHỦ ĐÍCH vs CẦN XỬ LÝ) thay vì
-- đọc thô bảng này.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT action,
       v1,
       v2,
       count(*)         AS so_dong,
       min("createdAt") AS lan_dau,
       max("createdAt") AS lan_cuoi
FROM "RbacShadowDiff"
GROUP BY action, v1, v2
ORDER BY so_dong DESC
LIMIT 40;


-- ─────────────────────────────────────────────────────────────────────────────
-- CÂU E — khoảng hở soft-delete: bản ghi ĐÃ XOÁ MỀM còn giữ SĐT dạng cũ.
-- `phone-backfill.sql` cố ý KHÔNG chạm chúng (lọc `deletedAt IS NULL`).
-- `Employee` không có cột `deletedAt` nên không xuất hiện ở đây.
-- Đọc: > 0 KHÔNG phải lỗi — chỉ là "nếu phục hồi bản ghi này thì SĐT về dạng cũ".
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'Lead.phone (đã xoá mềm)'            AS chi_tieu, count(*)::bigint AS so_luong
  FROM "Lead"    WHERE "deletedAt" IS NOT NULL AND btrim(coalesce(phone,''))          LIKE '0%'
UNION ALL SELECT 'Student.parentPhone (đã xoá mềm)',  count(*)
  FROM "Student" WHERE "deletedAt" IS NOT NULL AND btrim(coalesce("parentPhone",''))  LIKE '0%'
UNION ALL SELECT 'Student.parent2Phone (đã xoá mềm)', count(*)
  FROM "Student" WHERE "deletedAt" IS NOT NULL AND btrim(coalesce("parent2Phone",'')) LIKE '0%'
UNION ALL SELECT 'Student.phone (đã xoá mềm)',        count(*)
  FROM "Student" WHERE "deletedAt" IS NOT NULL AND btrim(coalesce(phone,''))          LIKE '0%';
