-- =============================================================================
-- AUTH-SĐT — BACKFILL SĐT về canonical `84XXXXXXXXX`, bản SQL của
-- `pnpm phone:backfill --apply` (dùng khi không có mật khẩu DB prod — chạy trong
-- Supabase Dashboard → project PROD → SQL Editor).
--
-- ⚠️ FILE NÀY CÓ GHI. Khác hẳn `phone-audit.sql` (chỉ đọc).
--
-- ── THỨ TỰ BẮT BUỘC ──
--   BƯỚC 1  chạy CÂU 1 (chỉ đọc) → **copy toàn bộ kết quả ra chỗ khác**.
--           Đó chính là dữ liệu hoàn tác: (bảng, id, giá trị cũ).
--           Không có bước này thì không có đường lùi.
--   BƯỚC 2  chạy CÂU 2 (ghi). Là MỘT câu lệnh ⇒ nguyên tử: hoặc xong hết,
--           hoặc không đổi gì.
--   BƯỚC 3  chạy CÂU 3 (chỉ đọc) → cột "Dạng cũ" phải về 0.
--
-- ── KHÔNG đụng vào ──
--   `Order.customerPhone`, `VoucherRedemption.customerPhone` — **snapshot hoá
--   đơn**, giữ nguyên văn tại thời điểm phát hành; sửa lại là sửa chứng từ.
--   `ZaloMessageLog.toPhone`, `OtpRequest.target` — cột log, ghi lại sự việc đã
--   xảy ra.
--
-- ── Vì sao chạy lúc nào cũng được ──
--   Mọi đường ĐỌC theo SĐT đã dùng `phoneVariants()` (`lib/phone.ts:105-113`)
--   nên khớp cả `84…` lẫn `0…`. Backfill là DỌN DẸP, không phải việc phải đi
--   cùng deploy, và chạy lại nhiều lần vô hại (idempotent).
--
-- Logic canonical bám `lib/phone.ts:54-76` — giống hệt `phone-audit.sql`.
-- Sửa `lib/phone.ts` thì phải sửa cả hai file SQL theo.
--
-- ── ĐÃ CHẠY XONG TRÊN PROD 29/07/2026 ──
-- Đo lúc audit:  44 trường cần đổi (41 Lead · **2** Student.parentPhone · 1 Employee).
-- Thực ghi:      **43** trường (`lead_phone` 41 · `student_3_cot` **1** · `employee_phone` 1).
-- Nghiệm thu:    "Dạng cũ" = 0 ở cả 3 cột.
--
-- ⚠️ **Chênh 44 vs 43 — đã truy, không phải lỗi của lệnh này.** Giữa lúc audit và lúc
-- chạy, một bản ghi `Student` rời khỏi phạm vi `deletedAt IS NULL AND parentPhone <> ''`
-- (bị xoá mềm, hoặc `parentPhone` bị xoá trắng). Chính CÂU 1 lúc chạy đã chỉ liệt kê
-- **1** dòng `Student.parentPhone`, nên lệnh ghi đúng bằng số nó thấy.
-- **Bài học cho lần sau:** con số của audit chỉ đúng tại **thời điểm đo**. Luôn lấy số
-- của CÂU 1 (xem trước) làm mốc đối chiếu cho CÂU 2, KHÔNG lấy số của audit cũ.
-- Kiểm bản ghi đã xoá mềm còn giữ dạng cũ: **CÂU E** của `phone-audit.sql`.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- CÂU 1 — XEM TRƯỚC (chỉ đọc). COPY KẾT QUẢ LẠI TRƯỚC KHI CHẠY CÂU 2.
-- ─────────────────────────────────────────────────────────────────────────────
WITH raw AS (
  SELECT 'Lead.phone'           AS col, l.id AS id, l.phone          AS v FROM "Lead"     l WHERE l."deletedAt" IS NULL AND btrim(coalesce(l.phone,''))          <> ''
  UNION ALL
  SELECT 'Student.parentPhone',        s.id,       s."parentPhone"       FROM "Student"  s WHERE s."deletedAt" IS NULL AND btrim(coalesce(s."parentPhone",''))  <> ''
  UNION ALL
  SELECT 'Student.parent2Phone',       s.id,       s."parent2Phone"      FROM "Student"  s WHERE s."deletedAt" IS NULL AND btrim(coalesce(s."parent2Phone",'')) <> ''
  UNION ALL
  SELECT 'Student.phone',              s.id,       s.phone               FROM "Student"  s WHERE s."deletedAt" IS NULL AND btrim(coalesce(s.phone,''))          <> ''
  UNION ALL
  SELECT 'Employee.phone',             e.id,       e.phone               FROM "Employee" e WHERE btrim(coalesce(e.phone,''))                                    <> ''
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
SELECT col AS "Bảng.cột", id AS "id", v AS "giá trị CŨ (dữ liệu hoàn tác)", canonical AS "sẽ thành"
FROM canon
WHERE canonical IS NOT NULL AND v <> canonical
ORDER BY col, id;


-- ─────────────────────────────────────────────────────────────────────────────
-- CÂU 2 — GHI THẬT. Một câu lệnh duy nhất ⇒ nguyên tử.
-- Trả về số trường đã đổi theo từng cột; tổng phải khớp số dòng của CÂU 1.
--
-- Ba cột của "Student" gộp vào MỘT `UPDATE`: nếu tách thành ba CTE ghi riêng mà
-- cùng chạm một hàng thì Postgres không bảo đảm kết quả (data-modifying CTE).
-- ─────────────────────────────────────────────────────────────────────────────
WITH raw AS (
  SELECT 'Lead.phone'           AS col, l.id AS id, l.phone          AS v FROM "Lead"     l WHERE l."deletedAt" IS NULL AND btrim(coalesce(l.phone,''))          <> ''
  UNION ALL
  SELECT 'Student.parentPhone',        s.id,       s."parentPhone"       FROM "Student"  s WHERE s."deletedAt" IS NULL AND btrim(coalesce(s."parentPhone",''))  <> ''
  UNION ALL
  SELECT 'Student.parent2Phone',       s.id,       s."parent2Phone"      FROM "Student"  s WHERE s."deletedAt" IS NULL AND btrim(coalesce(s."parent2Phone",'')) <> ''
  UNION ALL
  SELECT 'Student.phone',              s.id,       s.phone               FROM "Student"  s WHERE s."deletedAt" IS NULL AND btrim(coalesce(s.phone,''))          <> ''
  UNION ALL
  SELECT 'Employee.phone',             e.id,       e.phone               FROM "Employee" e WHERE btrim(coalesce(e.phone,''))                                    <> ''
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
todo AS (
  SELECT col, id, v, canonical FROM canon WHERE canonical IS NOT NULL AND v <> canonical
),
stu AS (
  SELECT id,
         max(canonical) FILTER (WHERE col = 'Student.parentPhone')  AS pp,
         max(canonical) FILTER (WHERE col = 'Student.parent2Phone') AS pp2,
         max(canonical) FILTER (WHERE col = 'Student.phone')        AS ph
  FROM todo WHERE col LIKE 'Student.%' GROUP BY id
),
u_lead AS (
  UPDATE "Lead" t SET phone = k.canonical
  FROM todo k WHERE k.col = 'Lead.phone' AND t.id = k.id
  RETURNING 1
),
u_stu AS (
  UPDATE "Student" t SET
    "parentPhone"  = coalesce(k.pp,  t."parentPhone"),
    "parent2Phone" = coalesce(k.pp2, t."parent2Phone"),
    phone          = coalesce(k.ph,  t.phone)
  FROM stu k WHERE t.id = k.id
  RETURNING (k.pp IS NOT NULL)::int + (k.pp2 IS NOT NULL)::int + (k.ph IS NOT NULL)::int AS n
),
u_emp AS (
  UPDATE "Employee" t SET phone = k.canonical
  FROM todo k WHERE k.col = 'Employee.phone' AND t.id = k.id
  RETURNING 1
)
SELECT (SELECT count(*)          FROM u_lead) AS lead_phone,
       (SELECT coalesce(sum(n),0) FROM u_stu) AS student_3_cot,
       (SELECT count(*)          FROM u_emp) AS employee_phone;


-- ─────────────────────────────────────────────────────────────────────────────
-- CÂU 3 — NGHIỆM THU (chỉ đọc). Cột "Dạng cũ (backfill)" phải = 0 ở mọi hàng.
-- Đây là CÂU A của `phone-audit.sql`, chạy lại sau khi ghi.
-- ─────────────────────────────────────────────────────────────────────────────
WITH raw AS (
  SELECT 'Lead.phone'           AS col, l.phone         AS v FROM "Lead"     l WHERE l."deletedAt" IS NULL AND btrim(coalesce(l.phone,''))         <> ''
  UNION ALL
  SELECT 'Student.parentPhone',        s."parentPhone"       FROM "Student"  s WHERE s."deletedAt" IS NULL AND btrim(coalesce(s."parentPhone",''))  <> ''
  UNION ALL
  SELECT 'Student.parent2Phone',       s."parent2Phone"      FROM "Student"  s WHERE s."deletedAt" IS NULL AND btrim(coalesce(s."parent2Phone",'')) <> ''
  UNION ALL
  SELECT 'Student.phone',              s.phone               FROM "Student"  s WHERE s."deletedAt" IS NULL AND btrim(coalesce(s.phone,''))          <> ''
  UNION ALL
  SELECT 'Employee.phone',             e.phone               FROM "Employee" e WHERE btrim(coalesce(e.phone,''))                                    <> ''
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
