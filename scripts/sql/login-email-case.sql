-- AUTH-SĐT P3 — đo TRƯỚC khi (nếu) chuẩn hoá lowercase email ở login.
-- Chạy trong Supabase SQL Editor (PROD) — DATABASE_URL prod bị Vercel che nên
-- không chạy được từ máy dev (xem scripts/sql/phone-audit.sql cùng lý do).
--
-- Bối cảnh: login hiện so email PHÂN BIỆT hoa/thường (lib/auth.ts — giữ nguyên
-- ngữ nghĩa qua P3). Muốn đổi sang so lowercase (thân thiện người dùng hơn)
-- thì phải chắc chắn không có 2 tài khoản chỉ khác hoa/thường.
--
-- Đọc kết quả: 0 dòng → đổi được an toàn. Có dòng nào → PHẢI xử lý tay từng
-- nhóm (gộp/đổi email) trước, tuyệt đối chưa đổi code.
SELECT
  lower(email)     AS email_lower,
  count(*)         AS so_tai_khoan,
  array_agg(email) AS cac_bien_the
FROM "User"
WHERE email IS NOT NULL
  AND "deletedAt" IS NULL
GROUP BY lower(email)
HAVING count(*) > 1;
