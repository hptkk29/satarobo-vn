-- scripts/gd5-dem-truoc-khi-doi-enum.sql — GĐ5.
--
-- CHẠY TRƯỚC khi apply migration 20260825180000_lead_status_rut_gon_10.
-- Chạy ở Supabase SQL Editor (đường duy nhất chạm được DB prod từ máy dev).
--
-- Vì sao phải đếm chứ không đoán: migration đổi KIỂU cột `Lead.status`. Nếu DB có giá
-- trị nào ngoài 15 cái đã biết thì nhánh `ELSE 'MOI'` sẽ nuốt nó im lặng — lead rơi về
-- đầu phễu mà không ai hay. Đếm trước thì biết trước.

-- ─── 1. Phân bố hiện tại. Đây là con số phải đối chiếu SAU khi chạy migration. ──
SELECT
  status::text                            AS trang_thai_cu,
  COUNT(*)                                AS so_dong,
  COUNT(*) FILTER (WHERE "deletedAt" IS NULL) AS con_song
FROM "Lead"
GROUP BY status
ORDER BY so_dong DESC;

-- ─── 2. Dự đoán phân bố SAU khi gộp. So với lượt đếm lại sau migration. ────────
SELECT
  CASE status::text
    WHEN 'NEW'               THEN 'MOI'
    WHEN 'ASSIGNED'          THEN 'MOI'
    WHEN 'CONTACTED'         THEN 'DA_LIEN_HE'
    WHEN 'NO_ANSWER'         THEN 'DA_LIEN_HE'
    WHEN 'CONSULTING'        THEN 'DANG_TU_VAN'
    WHEN 'TRIAL_SCHEDULED'   THEN 'DA_HEN_HOC_THU'
    WHEN 'DEMO_SCHEDULED'    THEN 'DA_HEN_HOC_THU'
    WHEN 'TRIAL_IN_PROGRESS' THEN 'DANG_HOC_THU'
    WHEN 'TRIAL_ATTENDED'    THEN 'DA_HOC_THU'
    WHEN 'AWAITING_DECISION' THEN 'CHO_QUYET_DINH'
    WHEN 'REGISTERED'        THEN 'DA_DANG_KY'
    WHEN 'ENROLLED'          THEN 'DA_DANG_KY'
    WHEN 'NURTURING'         THEN 'DANG_NUOI_DUONG'
    WHEN 'LOST'              THEN 'DA_MAT'
    WHEN 'DUPLICATE'         THEN 'DA_MAT'
    ELSE '⚠️ GIÁ TRỊ LẠ — XEM MỤC 3'
  END                AS trang_thai_moi,
  COUNT(*)           AS so_dong
FROM "Lead"
GROUP BY 1
ORDER BY 2 DESC;

-- ─── 3. Giá trị LẠ. Kết quả phải RỖNG. Có dòng nào là DỪNG, xử lý trước. ───────
SELECT status::text AS gia_tri_la, COUNT(*) AS so_dong
FROM "Lead"
WHERE status::text NOT IN (
  'NEW','ASSIGNED','CONTACTED','NO_ANSWER','CONSULTING',
  'TRIAL_SCHEDULED','TRIAL_ATTENDED','TRIAL_IN_PROGRESS','AWAITING_DECISION',
  'REGISTERED','ENROLLED','NURTURING','LOST','DUPLICATE','DEMO_SCHEDULED'
)
GROUP BY 1;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3b + 3c — BA CỘT ENUM CÒN LẠI. Mục 1–3 ở trên MỚI CHỈ ĐẾM `Lead.status`.
--
-- Migration 20260825180000 cast BỐN cột chứ không phải một:
--   Lead.status · Lead.droppedAtStage · LeadStatusHistory.fromStatus/.toStatus
-- Nhánh `ELSE 'MOI'` áp cho cả bốn. Cột nào không đếm trước thì không ai biết nó
-- vừa nuốt gì — và với `droppedAtStage` thì mất luôn dấu "lead rụng ở bậc nào",
-- tức là mất đúng cái mà GĐ1 dựng bảng sổ để đo.
--
-- ⚠️ Vì sao ba cột này phải viết vòng vèo qua `query_to_xml` chứ không SELECT thẳng:
-- chúng ra đời ở migration 20260825120000 (sổ trạng thái). Nếu DB đích chưa apply
-- migration đó thì bảng/cột CHƯA TỒN TẠI, mà Postgres phân giải tên bảng/cột ngay ở
-- bước PHÂN TÍCH CÚ PHÁP — câu SQL nhắc thẳng tên sẽ nổ 42P01/42703 và cả script dừng,
-- không ra được số nào, kể cả các mục đã chạy được. `query_to_xml` nhận câu truy vấn
-- dưới dạng CHUỖI nên chỉ phân giải lúc chạy, và `CASE` bảo đảm nhánh đó không chạy
-- khi `to_regclass` / `information_schema` nói là chưa có.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 3b. Preflight: ba cột kia đã tồn tại chưa? ──────────────────────────────
-- Chạy TRƯỚC mục 3c. Cột nào `false` thì mục 3c cố ý không trả dòng nào cho nó —
-- "không có dòng" ở đó nghĩa là CHƯA CÓ CỘT, không phải "cột rỗng".
SELECT
  to_regclass('public."LeadStatusHistory"') IS NOT NULL AS co_bang_leadstatushistory,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Lead'
      AND column_name = 'droppedAtStage'
  ) AS co_cot_lead_droppedatstage;

-- ─── 3c. Phân bố giá trị của ba cột ──────────────────────────────────────────
-- Đọc như mục 1: đây là con số phải đối chiếu SAU migration.
-- `gia_tri` nào KHÔNG nằm trong 15 giá trị liệt kê ở mục 3 là cùng một cảnh báo đỏ —
-- DỪNG, xử lý trước khi cast.
WITH co_gi AS (
  SELECT
    to_regclass('public."LeadStatusHistory"') IS NOT NULL AS co_lsh,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Lead'
        AND column_name = 'droppedAtStage'
    ) AS co_dropped
),
nguon AS (
  SELECT 'Lead.droppedAtStage' AS cot,
         CASE WHEN (SELECT co_dropped FROM co_gi)
           THEN xpath('/table/row', query_to_xml(
                  'SELECT "droppedAtStage"::text AS gia_tri, count(*) AS so_dong
                     FROM "Lead"
                    WHERE "droppedAtStage" IS NOT NULL
                    GROUP BY 1',
                  false, false, ''))
           ELSE ARRAY[]::xml[]
         END AS dong
  UNION ALL
  SELECT 'LeadStatusHistory.fromStatus',
         CASE WHEN (SELECT co_lsh FROM co_gi)
           -- fromStatus NULL là HỢP LỆ (dòng sổ đầu tiên của lead, không có bậc trước).
           -- COALESCE để nó hiện thành một hàng có tên, thay vì biến mất khỏi bảng đếm.
           THEN xpath('/table/row', query_to_xml(
                  'SELECT COALESCE("fromStatus"::text, ''(NULL — dòng sổ đầu)'') AS gia_tri,
                          count(*) AS so_dong
                     FROM "LeadStatusHistory"
                    GROUP BY 1',
                  false, false, ''))
           ELSE ARRAY[]::xml[]
         END
  UNION ALL
  SELECT 'LeadStatusHistory.toStatus',
         CASE WHEN (SELECT co_lsh FROM co_gi)
           THEN xpath('/table/row', query_to_xml(
                  'SELECT "toStatus"::text AS gia_tri, count(*) AS so_dong
                     FROM "LeadStatusHistory"
                    GROUP BY 1',
                  false, false, ''))
           ELSE ARRAY[]::xml[]
         END
)
SELECT
  n.cot,
  (xpath('/row/gia_tri/text()', r.x))[1]::text          AS gia_tri,
  (xpath('/row/so_dong/text()', r.x))[1]::text::bigint  AS so_dong
FROM nguon n, unnest(n.dong) AS r(x)
ORDER BY n.cot, so_dong DESC;

-- ─── 4. Điều kiện tiên quyết: lead ĐÃ CONVERT phải có convertedAt ─────────────
-- Sau khi gộp, "đã chốt" được nhận biết bằng `convertedAt` chứ không bằng trạng thái.
-- Lead nào status=ENROLLED mà convertedAt NULL sẽ mất dấu "đã chốt" sau migration.
-- Kết quả nên RỖNG. Có dòng thì phải điền convertedAt trước, hoặc chấp nhận mất dấu.
SELECT id, "parentName", phone, "createdAt"
FROM "Lead"
WHERE status::text = 'ENROLLED' AND "convertedAt" IS NULL AND "deletedAt" IS NULL
ORDER BY "createdAt" DESC;

-- ─── 5. Chiều ngược lại: có convertedAt mà chưa ENROLLED ──────────────────────
-- Không chặn migration, nhưng là dấu hiệu dữ liệu lệch đáng xem.
SELECT status::text, COUNT(*)
FROM "Lead"
WHERE "convertedAt" IS NOT NULL AND status::text <> 'ENROLLED' AND "deletedAt" IS NULL
GROUP BY 1;

-- ─── 6. Cột nào còn dùng kiểu cũ ─────────────────────────────────────────────
-- Chạy SAU migration nếu bước DROP TYPE nổ vì "còn phụ thuộc".
-- SELECT table_name, column_name FROM information_schema.columns
-- WHERE udt_name = 'LeadStatus_old';
