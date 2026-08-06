-- =============================================================================
-- SỬA DỮ LIỆU PROD — bug múi giờ buổi học (06/08/2026)
--
-- Bug: Node trên Vercel chạy TZ=UTC (repo không set env TZ), code cũ dựng ngày
-- buổi bằng `new Date(y,m,d,h,min)` ⇒ ghi bằng đồng hồ UTC. Lớp 17:30 T7 20/06
-- được lưu `2026-06-20T17:30:00Z`, ở VN đọc ra 00:30 CN 21/06 → lệch 1 ngày.
-- Lớp học ban ngày thì ngày đúng nhưng GIỜ lệch +7h (08:00 hiện 15:00).
--
-- ⚠️ CHẠY SAU KHI ĐÃ DEPLOY CODE VÁ LÊN PROD. Sửa data trước khi deploy thì
--    mỗi lần bấm "Sinh buổi học" lại đẻ ra dữ liệu sai mới.
--
-- Chạy trong Supabase SQL Editor, LẦN LƯỢT từng bước. SQL Editor KHÔNG giữ
-- transaction giữa các lần bấm Run ⇒ bước 1 (backup) là phao cứu sinh duy nhất.
--
-- Quy ước nhận diện, KHÔNG đoán bừa:
--   [UTC-WRITE] đọc theo UTC thì thứ+giờ khớp lịch lớp, đọc theo VN thì không
--               → hiểu lại đúng số giờ đó là giờ VN.
--   [HAND-FIX]  buổi đã chỉnh tay qua nút "Điều chỉnh" (lưu 00:00Z = 07:00 VN):
--               ngày VN đã đúng lịch, chỉ sai giờ → gắn lại giờ của thứ đó.
--   Buổi không khớp dấu vết nào (buổi bù lệch thứ, giờ tự đặt, lớp chưa có
--   lịch/giờ) → GIỮ NGUYÊN, phải xem tay.
-- =============================================================================


-- ── BƯỚC 1 — BACKUP (bắt buộc, chạy trước tiên) ─────────────────────────────
CREATE TABLE IF NOT EXISTS "_bak_session_tz_20260806" AS
SELECT id, date AS old_date, now() AS backed_up_at FROM "ClassSession";

SELECT count(*) AS so_buoi_da_backup FROM "_bak_session_tz_20260806";


-- ── View dùng chung cho bước 2 & 3 (tạo 1 lần) ──────────────────────────────
-- Lịch hiệu lực mỗi lớp: thứ lấy từ Class."scheduleDays"; giờ của từng thứ lấy
-- ClassScheduleSlot (nếu có), thiếu thì lùi về Class."startTime" (giờ chung).
CREATE OR REPLACE VIEW "_v_session_tz_fix" AS
WITH slot AS (
  SELECT c.id AS class_id,
         w.weekday,
         COALESCE(s."startTime", c."startTime") AS start_time
  FROM "Class" c
  CROSS JOIN LATERAL unnest(c."scheduleDays") AS w(weekday)
  LEFT JOIN "ClassScheduleSlot" s ON s."classId" = c.id AND s.weekday = w.weekday
  WHERE c."deletedAt" IS NULL
),
sess AS (
  SELECT cs.id,
         cs."classId",
         cs.date,
         cs.status,
         c.name AS class_name,
         (cs.date AT TIME ZONE 'Asia/Ho_Chi_Minh') AS vn_ts,   -- đồng hồ VN
         (cs.date AT TIME ZONE 'UTC')              AS utc_ts   -- đồng hồ UTC (thứ code cũ đã ghi)
  FROM "ClassSession" cs
  JOIN "Class" c ON c.id = cs."classId"
  WHERE c."deletedAt" IS NULL
    AND cs.status <> 'CANCELLED'
)
SELECT
  s.id,
  s.class_name,
  s.status,
  s.date AS old_date,
  sv.start_time AS slot_theo_thu_vn,
  su.start_time AS slot_theo_thu_utc,
  CASE
    WHEN sv.start_time IS NOT NULL AND to_char(s.vn_ts, 'HH24:MI') = sv.start_time
      THEN 'OK'
    WHEN su.start_time IS NOT NULL AND to_char(s.utc_ts, 'HH24:MI') = su.start_time
      THEN 'UTC-WRITE'
    WHEN sv.start_time IS NOT NULL AND to_char(s.utc_ts, 'HH24:MI') = '00:00'
      THEN 'HAND-FIX'
    ELSE 'XEM-TAY'
  END AS kind,
  CASE
    WHEN sv.start_time IS NOT NULL AND to_char(s.vn_ts, 'HH24:MI') = sv.start_time
      THEN NULL
    WHEN su.start_time IS NOT NULL AND to_char(s.utc_ts, 'HH24:MI') = su.start_time
      THEN s.utc_ts AT TIME ZONE 'Asia/Ho_Chi_Minh'
    WHEN sv.start_time IS NOT NULL AND to_char(s.utc_ts, 'HH24:MI') = '00:00'
      THEN (date_trunc('day', s.vn_ts) + sv.start_time::interval) AT TIME ZONE 'Asia/Ho_Chi_Minh'
    ELSE NULL
  END AS new_date
FROM sess s
LEFT JOIN slot sv ON sv.class_id = s."classId" AND sv.weekday = EXTRACT(DOW FROM s.vn_ts)::int
LEFT JOIN slot su ON su.class_id = s."classId" AND su.weekday = EXTRACT(DOW FROM s.utc_ts)::int;


-- ── BƯỚC 2 — XEM TRƯỚC (không ghi gì) ───────────────────────────────────────
-- 2a. Tổng quan: mỗi nhóm bao nhiêu buổi.
SELECT kind, count(*) AS so_buoi
FROM "_v_session_tz_fix"
GROUP BY kind ORDER BY so_buoi DESC;

-- 2b. Chi tiết những buổi SẼ ĐỔI (đọc kỹ cột cũ → mới trước khi chạy bước 3).
SELECT class_name, status, kind,
       to_char(old_date AT TIME ZONE 'Asia/Ho_Chi_Minh', 'Dy DD/MM/YYYY HH24:MI') AS truoc_khi_sua,
       to_char(new_date AT TIME ZONE 'Asia/Ho_Chi_Minh', 'Dy DD/MM/YYYY HH24:MI') AS sau_khi_sua
FROM "_v_session_tz_fix"
WHERE new_date IS NOT NULL AND new_date <> old_date
ORDER BY class_name, old_date;

-- 2c. Những buổi KHÔNG tự sửa được — phải xem tay (buổi bù, giờ tự đặt,
--     lớp chưa khai báo lịch/giờ). Nếu danh sách này dài thì dừng lại, báo trước.
SELECT class_name, status, slot_theo_thu_vn,
       to_char(old_date AT TIME ZONE 'Asia/Ho_Chi_Minh', 'Dy DD/MM/YYYY HH24:MI') AS dang_luu
FROM "_v_session_tz_fix"
WHERE kind = 'XEM-TAY'
ORDER BY class_name, old_date;


-- ── BƯỚC 3 — GHI THẬT ───────────────────────────────────────────────────────
-- Mặc định CHỈ sửa buổi chưa dạy. Muốn gồm cả buổi đã COMPLETED thì bỏ dòng
-- `AND cs.status IN (...)` (điểm danh/nhận xét gắn theo sessionId nên không mất,
-- nhưng ngày trên học bạ/báo cáo sẽ đổi theo — cân nhắc).
UPDATE "ClassSession" cs
SET date = f.new_date
FROM "_v_session_tz_fix" f
WHERE f.id = cs.id
  AND f.new_date IS NOT NULL
  AND f.new_date <> cs.date
  AND cs.status IN ('SCHEDULED', 'IN_PROGRESS');


-- ── BƯỚC 4 — ĐỒNG BỘ BẢN SAO NGÀY ───────────────────────────────────────────
-- StudentBirthdayGreeting."celebrationDate" là bản nhân đôi ngày buổi tổ chức
-- (để lọc "sắp tới hạn" không phải join) → phải kéo lại theo ngày mới.
UPDATE "StudentBirthdayGreeting" g
SET "celebrationDate" = cs.date
FROM "ClassSession" cs
WHERE cs.id = g."celebrationSessionId"
  AND g."celebrationDate" IS DISTINCT FROM cs.date;


-- ── BƯỚC 5 — KIỂM LẠI ───────────────────────────────────────────────────────
-- Kỳ vọng: không còn dòng UTC-WRITE / HAND-FIX nào ở trạng thái chưa dạy.
SELECT kind, status, count(*) FROM "_v_session_tz_fix"
GROUP BY kind, status ORDER BY kind, status;

-- Soi mắt thường vài lớp: thứ + giờ đã khớp lịch lớp chưa.
SELECT c.name, c."scheduleDays", c."startTime",
       to_char(cs.date AT TIME ZONE 'Asia/Ho_Chi_Minh', 'Dy DD/MM/YYYY HH24:MI') AS buoi
FROM "ClassSession" cs
JOIN "Class" c ON c.id = cs."classId"
WHERE c."deletedAt" IS NULL AND cs.status = 'SCHEDULED'
ORDER BY c.name, cs.date
LIMIT 60;


-- ── DỌN DẸP (chỉ chạy sau khi đã nghiệm thu xong trên giao diện) ────────────
-- DROP VIEW "_v_session_tz_fix";
-- DROP TABLE "_bak_session_tz_20260806";


-- ── HOÀN TÁC (nếu sửa hỏng — cần bảng backup ở bước 1) ──────────────────────
-- UPDATE "ClassSession" cs SET date = b.old_date
-- FROM "_bak_session_tz_20260806" b
-- WHERE b.id = cs.id AND cs.date <> b.old_date;
