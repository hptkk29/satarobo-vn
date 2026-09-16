-- CHẠY BÓNG PARSER — BỘ CÂU HỎI CHO PROD (Supabase SQL Editor)
--
-- ⚠️ CHỈ ĐỌC. Không câu nào ghi, xoá, hay đổi gì. Chạy được nhiều lần.
--
-- Vì sao cần chạy tay: máy dev KHÔNG có chuỗi kết nối prod (worktree này không có `.env`;
-- `.env.local` trỏ `satarobo_local`). Bốn câu dưới đây thay cho việc đó — câu 1–3 cho số ngay,
-- câu 4 xuất JSON để chạy parser thật ở máy.
--
-- Bối cảnh: `satarobo_local` có 431 giao dịch nhưng **toàn bộ là dữ liệu seed** — 380 dòng
-- `BACKFILL` mang chuỗi do script ghi (`Backfill sổ cũ · đơn ORD--CS1--20-2`) và 51 dòng
-- `SEPAY` mang chuỗi seed (`Hoc phi 0053`). Không dòng nào là nội dung chuyển khoản thật của
-- ngân hàng. Nên mọi tỷ lệ đo ở máy KHÔNG nói gì về prod, và bốn câu này mới là phép đo thật.

-- ─────────────────────────────────────────────────────────────────────────────
-- CÂU 1 · Có bao nhiêu giao dịch, và bao nhiêu thật sự mang nội dung của NGÂN HÀNG
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  provider,
  status,
  count(*)                                                        AS so_giao_dich,
  count(*) FILTER (WHERE content IS NOT NULL AND content <> '')   AS co_noi_dung,
  count(*) FILTER (WHERE content ILIKE 'Backfill%')               AS la_chuoi_backfill,
  sum(amount)                                                     AS tong_tien
FROM "BankTransaction"
GROUP BY provider, status
ORDER BY provider, status;

-- ─────────────────────────────────────────────────────────────────────────────
-- CÂU 2 · Giao dịch CHƯA có phân bổ nào — tiền đã về mà chưa vào phiếu thu
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  count(*)    AS so_giao_dich_chua_gan,
  sum(bt.amount) AS tong_tien
FROM "BankTransaction" bt
WHERE NOT EXISTS (
  SELECT 1 FROM "PaymentAllocation" pa WHERE pa."bankTransactionId" = bt.id
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CÂU 3 · "18 đơn / 178.544.000đ" — tiền ĐÃ VỀ mà khoản chưa gắn GHI DANH
--
-- ⚠️ Đây là phép đo KHÁC câu 2. Câu 2 hỏi "giao dịch đã vào phiếu thu chưa"; câu này hỏi
-- "khoản tiền đã gắn học viên nào chưa" — hai sổ khác nhau, và con số 18 đơn của ngày 16/09
-- là con số của câu NÀY.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  count(DISTINCT p."orderId") AS so_don,
  count(*)                    AS so_khoan,
  sum(p.amount)               AS tong_tien
FROM "Payment" p
WHERE p."enrollmentId" IS NULL
  AND p."deletedAt" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- CÂU 4 · XUẤT dữ liệu để chạy parser thật ở máy
--
-- Trả về ĐÚNG MỘT ô JSON. Bấm vào ô đó, copy toàn bộ, dán lại cho tôi.
--
-- ⚠️ ĐÃ CHE SỐ ĐIỆN THOẠI: chỉ giữ 4 số cuối (`sdt_duoi`). Nội dung chuyển khoản (`content`)
-- thì GIỮ NGUYÊN VĂN vì đó chính là thứ cần parse — nếu nội dung có SĐT thì nó nằm trong đó,
-- và đó là dữ liệu cần thiết cho phép đo. Nếu không muốn nội dung rời prod, chạy câu 1–3 và
-- báo số; phép đo sẽ hẹp hơn nhưng vẫn dùng được.
--
-- Giới hạn 800 dòng để tránh ô JSON quá lớn; đổi `LIMIT` nếu cần.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT json_agg(t)::text FROM (
  SELECT
    bt.id,
    bt.provider,
    bt.amount,
    bt.content,
    bt.status::text                                   AS bt_status,
    -- Phân bổ hiện tại của giao dịch này (có thể nhiều dòng)
    (
      SELECT json_agg(json_build_object(
        'paymentRequestId', pa."paymentRequestId",
        'amount',           pa.amount,
        'matchKey',         pr."matchKey",
        'orderCode',        o.code
      ))
      FROM "PaymentAllocation" pa
      JOIN "PaymentRequest" pr ON pr.id = pa."paymentRequestId"
      JOIN "Order" o           ON o.id  = pr."orderId"
      WHERE pa."bankTransactionId" = bt.id
    ) AS gan_hien_tai
  FROM "BankTransaction" bt
  ORDER BY bt."transferredAt" DESC
  LIMIT 800
) t;

-- ─────────────────────────────────────────────────────────────────────────────
-- CÂU 5 · Danh mục phiếu thu để tra mã (kèm SĐT ĐÃ CHE)
--
-- Cũng trả một ô JSON. Cần cả hai câu 4 và 5 thì parser mới tra được mã ra phiếu.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT json_agg(t)::text FROM (
  SELECT
    pr.id,
    pr."matchKey",
    pr.status::text      AS pr_status,
    pr."amountDue",
    o.code               AS "orderCode",
    COALESCE((SELECT sum(pa.amount) FROM "PaymentAllocation" pa
              WHERE pa."paymentRequestId" = pr.id), 0)::int AS "daRot",
    -- CHE: chỉ 4 số cuối
    right(regexp_replace(COALESCE(s."parentPhone", l.phone, ''), '\D', '', 'g'), 4) AS sdt_duoi
  FROM "PaymentRequest" pr
  JOIN "Order" o    ON o.id = pr."orderId"
  LEFT JOIN "Student" s ON s.id = o."studentId"
  LEFT JOIN "Lead" l    ON l.id = o."leadId"
  ORDER BY pr."createdAt" DESC
  LIMIT 1200
) t;
