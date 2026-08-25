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
