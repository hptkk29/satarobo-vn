-- VIỆC DỮ LIỆU TRƯỚC PHIÊN A — ba câu hỏi của chủ dự án (16/09/2026)
--
-- ⚠️ CHỈ ĐỌC. Không câu nào ghi/xoá/đổi gì. Chạy lại được nhiều lần.
-- ⚠️ SĐT đã CHE còn 4 số cuối ở mọi chỗ. Tên học viên/phụ huynh không bao giờ hiện nguyên
--    văn — chỗ nào cần so tên thì dùng md5 rút gọn, đủ để biết "giống hay khác" mà không
--    đọc được tên.
--
-- Chạy trên Supabase SQL Editor (prod). Máy dev KHÔNG có kết nối prod.
--
-- Ba câu đã được CHẠY THỬ trên `satarobo_local` để chắc không lỗi cú pháp và không có tên
-- cột ma — kết quả rỗng vì local không có các đơn đó, nhưng SQL chạy sạch.

-- ═══════════════════════════════════════════════════════════════════════════
-- CÂU 1 · ORD-260829-000001 vs ORD-260831-000001 — có trùng đơn không?
-- ═══════════════════════════════════════════════════════════════════════════
-- SO HAI ĐƠN CẠNH NHAU — CHỈ ĐỌC. Một SELECT, không CTE ghi, không hàm ghi.
-- CHE DỮ LIỆU: SĐT chỉ 4 số cuối; HỌ TÊN KHÔNG in ra ở bất kỳ đâu (chỉ md5 rút gọn +
-- độ dài, đủ để so "có giống nhau không"); nội dung CK chỉ md5; ghi chú hệ thống bị
-- xoá mọi dãy >= 9 chữ số (đó là chỗ SĐT đầy đủ hay nằm).
-- CỐ Ý KHÔNG đụng cột/bảng chưa lên prod: OrderItem."studentId", OrderItem."discountAmount",
-- OrderItem."discounts", PaymentRequest."orderItemId", "PaymentBill", "PaymentBillLine".
-- Order."createdById" đọc qua to_jsonb → prod chưa có cột thì ra ∅ chứ không lỗi 42703.
WITH don AS (
  SELECT o."id", o."code",
         o."status"::text AS trang_thai,
         o."type"::text   AS loai_don,
         o."centerId", o."leadId", o."studentId",
         o."customerName", o."customerPhone",
         o."subtotal", o."discountAmount", o."totalAmount",
         o."paidAt", o."confirmedAt", o."createdAt", o."deletedAt",
         o."bankReference", o."gatewayTxnId",
         o."installmentApprovalStatus"::text AS duyet_tra_gop,
         to_jsonb(o) ->> 'createdById'       AS nguoi_tao_id
    FROM "Order" o
   WHERE o."code" IN ('ORD-260829-000001','ORD-260831-000001')
),
sdt AS (
  SELECT DISTINCT right(regexp_replace(COALESCE(t.p,''),'\D','','g'),9) AS so9
    FROM (
      SELECT d."customerPhone" AS p FROM don d
      UNION ALL
      SELECT s."parentPhone" FROM don d JOIN "Student" s ON s."id" = d."studentId"
      UNION ALL
      SELECT u."phone" FROM don d
             JOIN "Student" s ON s."id" = d."studentId"
             JOIN "User"    u ON u."id" = s."parentUserId"
    ) t
   WHERE length(regexp_replace(COALESCE(t.p,''),'\D','','g')) >= 9
),
gd_raw AS (
  SELECT d."code" AS ma, oi."enrollmentId" AS eid, 'dòng hàng'::text AS nguon
    FROM don d JOIN "OrderItem" oi ON oi."orderId" = d."id"
   WHERE oi."enrollmentId" IS NOT NULL
  UNION ALL
  SELECT d."code", p."enrollmentId", 'khoản tiền'::text
    FROM don d JOIN "Payment" p ON p."orderId" = d."id"
   WHERE p."enrollmentId" IS NOT NULL
  UNION ALL
  SELECT d."code", e."id", 'Order.studentId'::text
    FROM don d JOIN "Enrollment" e ON e."studentId" = d."studentId"
   WHERE d."studentId" IS NOT NULL
  UNION ALL
  SELECT d."code", e."id", 'Lead→con'::text
    FROM don d JOIN "LeadChild"  lc ON lc."leadId"     = d."leadId"
               JOIN "Enrollment" e  ON e."leadChildId" = lc."id"
   WHERE d."leadId" IS NOT NULL
),
gd AS (
  SELECT r.ma, r.eid, string_agg(DISTINCT r.nguon, ' + ') AS nguon
    FROM gd_raw r GROUP BY r.ma, r.eid
)
SELECT * FROM (
  SELECT 'A · ĐƠN'::text AS phan, d."code"::text AS ma_don,
         'tổng quan'::text AS chi_tiet,
         (d.trang_thai || ' · ' || d.loai_don
          || ' · cơ sở=' || COALESCE(ct."code",'∅')
          || ' · lead='  || CASE WHEN d."leadId"    IS NULL THEN '∅' ELSE left(md5(d."leadId"),6)    END
          || ' · HV='    || CASE WHEN d."studentId" IS NULL THEN '∅' ELSE left(md5(d."studentId"),6) END)::text AS gia_tri,
         d."totalAmount"::bigint AS so_tien,
         d."createdAt" AS moc,
         ('SĐT …' || right(regexp_replace(COALESCE(d."customerPhone",''),'\D','','g'),4)
          || ' · khách md5=' || left(md5(lower(btrim(d."customerName"))),8) || '/' || length(btrim(d."customerName"))
          || ' · người tạo=' || CASE WHEN d.nguoi_tao_id IS NULL THEN '∅'
                                     ELSE COALESCE(left(u."name",2) || '***','(có id)') END
          || ' · subtotal=' || d."subtotal" || ' giảm=' || d."discountAmount"
          || ' · paidAt='   || COALESCE(to_char(d."paidAt",'YYYY-MM-DD HH24:MI'),'∅')
          || ' · confirmedAt=' || COALESCE(to_char(d."confirmedAt",'YYYY-MM-DD HH24:MI'),'∅')
          || ' · gatewayTxn='  || COALESCE(d."gatewayTxnId",'∅')
          || ' · bankRef='     || COALESCE(d."bankReference",'∅')
          || ' · duyệt trả góp=' || COALESCE(d.duyet_tra_gop,'∅')
          || ' · xoá mềm='     || COALESCE(d."deletedAt"::text,'không'))::text AS ghi_chu,
         1 AS thu_tu
    FROM don d
    LEFT JOIN "Center" ct ON ct."id" = d."centerId"
    LEFT JOIN "User"   u  ON u."id"  = d.nguoi_tao_id

  UNION ALL
  SELECT 'B · DÒNG HÀNG', d."code", oi."type"::text,
         ('tên md5=' || left(md5(lower(btrim(oi."itemName"))),8) || '/' || length(btrim(oi."itemName")))::text,
         oi."totalPrice"::bigint, oi."createdAt",
         ('SL=' || oi."quantity" || ' · đơn giá=' || oi."unitPrice"
          || ' · ghi danh=' || COALESCE(left(md5(oi."enrollmentId"),6),'∅')
          || ' · gói='      || CASE WHEN oi."packageId" IS NULL THEN '∅' ELSE 'có' END
          || ' · sp='       || CASE WHEN oi."productId" IS NULL THEN '∅' ELSE 'có' END
          || ' · 6 ký tự đầu="' || left(btrim(oi."itemName"),6) || '"')::text,
         2
    FROM don d JOIN "OrderItem" oi ON oi."orderId" = d."id"

  UNION ALL
  SELECT 'C · PHIẾU THU (sổ B)', d."code", ('đợt ' || pr."installmentNo")::text,
         pr."status"::text, pr."amountDue"::bigint, pr."createdAt",
         ('đã rót=' || COALESCE((SELECT sum(pa."amount")         FROM "PaymentAllocation" pa WHERE pa."paymentRequestId" = pr."id"),0)
          || ' · tha làm tròn=' || COALESCE((SELECT sum(pa."roundingWaived") FROM "PaymentAllocation" pa WHERE pa."paymentRequestId" = pr."id"),0)
          || ' · QR đã phát='   || (SELECT count(*) FROM "QrSession" q WHERE q."paymentRequestId" = pr."id")
          || ' · matchKey='     || COALESCE(pr."matchKey",'∅')
          || ' · hạn='          || COALESCE(to_char(pr."dueDate",'YYYY-MM-DD'),'∅'))::text,
         3
    FROM don d JOIN "PaymentRequest" pr ON pr."orderId" = d."id"

  UNION ALL
  SELECT 'C2 · ĐỢT (bảng cũ)', d."code", ('đợt ' || oin."soDot")::text,
         oin."status"::text, oin."amount"::bigint, COALESCE(oin."paidAt", oin."createdAt"),
         ('hạn=' || COALESCE(to_char(oin."dueDate",'YYYY-MM-DD'),'∅')
          || ' · paidAt=' || COALESCE(to_char(oin."paidAt",'YYYY-MM-DD HH24:MI'),'∅'))::text,
         3
    FROM don d JOIN "OrderInstallment" oin ON oin."orderId" = d."id"

  UNION ALL
  SELECT 'D · KHOẢN (sổ A)', d."code", (p."method" || ' · ' || p."paymentType"::text)::text,
         (CASE
            WHEN position('[sheet:'            IN COALESCE(p."note",'')) > 0 THEN 'NHẬP GIAO DỊCH CŨ (dòng sheet)'
            WHEN position('[backfill-import]'  IN COALESCE(p."note",'')) > 0 THEN 'NHẬP LỊCH SỬ (backfill)'
            WHEN position('[auto:order-confirm]' IN COALESCE(p."note",'')) > 0 THEN 'TỰ SINH khi XÁC NHẬN ĐƠN'
            WHEN position('[auto:order-installment:dot' IN COALESCE(p."note",'')) > 0 THEN 'TỰ SINH theo ĐỢT'
            WHEN COALESCE(p."note",'') ~ '\[auto:[a-z0-9._-]+:' THEN 'TIỀN THẬT QUA CỔNG'
            ELSE 'NGƯỜI GÕ TAY'
          END || ' · ' || p."saleStatus"::text || '/' || p."accountantStatus"::text)::text,
         p."amount"::bigint, p."paidDate",
         ('ghi danh=' || COALESCE(left(md5(p."enrollmentId"),6),'∅')
          || ' · điều chỉnh của=' || COALESCE(left(md5(p."adjustmentOfId"),6),'∅')
          || ' · người ghi='      || CASE WHEN p."recordedById" IS NULL THEN '∅ (hệ thống)' ELSE 'có' END
          || ' · có dấu sheet='   || CASE WHEN position('[sheet:' IN COALESCE(p."note",'')) > 0 THEN 'có' ELSE 'không' END
          || ' · xoá mềm='        || COALESCE(p."deletedAt"::text,'không'))::text,
         4
    FROM don d JOIN "Payment" p ON p."orderId" = d."id"

  UNION ALL
  SELECT 'E · TIỀN VỀ (phân bổ)', d."code", (bt."provider" || ' ' || bt."status"::text)::text,
         ('vào đợt ' || pr."installmentNo" || ' · ref=' || COALESCE(bt."referenceCode",'∅'))::text,
         pa."amount"::bigint, bt."transferredAt",
         ('txn=' || bt."providerTxnId"
          || ' · tiền GD=' || bt."amount"
          || ' · tha làm tròn=' || pa."roundingWaived"
          || ' · md5 nội dung CK=' || left(md5(COALESCE(bt."content",'')),8))::text,
         5
    FROM don d JOIN "PaymentRequest"    pr ON pr."orderId"          = d."id"
              JOIN "PaymentAllocation" pa ON pa."paymentRequestId" = pr."id"
              JOIN "BankTransaction"   bt ON bt."id"               = pa."bankTransactionId"

  UNION ALL
  SELECT 'E2 · GD MANG SĐT NHÀ NÀY', '(mọi đơn)'::text, (bt."provider" || ' ' || bt."status"::text)::text,
         ('ref=' || COALESCE(bt."referenceCode",'∅'))::text,
         bt."amount"::bigint, bt."transferredAt",
         ('txn=' || bt."providerTxnId"
          || ' · đã rót=' || COALESCE((SELECT sum(pa2."amount") FROM "PaymentAllocation" pa2 WHERE pa2."bankTransactionId" = bt."id"),0)
          || ' · md5 nội dung CK=' || left(md5(COALESCE(bt."content",'')),8)
          || ' · lý do lệch=' || COALESCE(left(regexp_replace(bt."unmatchedNote",'[0-9]{9,}','…','g'),44),'∅'))::text,
         6
    FROM "BankTransaction" bt
   WHERE EXISTS (
           SELECT 1 FROM sdt
            WHERE position(sdt.so9 IN regexp_replace(COALESCE(bt."content",''),'\D','','g')) > 0
         )

  UNION ALL
  SELECT 'F · GHI DANH', gd.ma, e."status"::text,
         ('lớp=' || COALESCE(cl."classCode", left(cl."name",12), '∅')
          || ' · khoá=' || COALESCE(co."slug", left(co."name",12), '∅'))::text,
         COALESCE(e."finalPrice", e."tuition", 0)::bigint, e."enrolledAt",
         ('HV=' || left(md5(e."studentId"),6)
          || ' · nối qua ' || gd.nguon
          || ' · tái tục='  || CASE WHEN e."renewedFromEnrollmentId" IS NULL THEN 'không' ELSE 'CÓ' END
          || ' · xoá mềm=' || COALESCE(e."deletedAt"::text,'không'))::text,
         7
    FROM gd
    JOIN "Enrollment" e  ON e."id"  = gd.eid
    LEFT JOIN "Class"  cl ON cl."id" = e."classId"
    LEFT JOIN "Course" co ON co."id" = e."courseId"

  UNION ALL
  SELECT 'G · LỊCH SỬ ĐƠN', d."code", (h."fromStatus"::text || '→' || h."toStatus"::text)::text,
         COALESCE(left(regexp_replace(h."reason",'[0-9]{9,}','…','g'),30),'∅')::text,
         NULL::bigint, h."createdAt",
         ('bởi ' || CASE WHEN h."changedByName" IN ('SePay webhook','Hệ thống','System')
                         THEN h."changedByName"
                         ELSE left(h."changedByName",2) || '***' END
          || ' · có userId=' || CASE WHEN h."changedByUserId" IS NULL THEN 'không' ELSE 'có' END)::text,
         8
    FROM don d JOIN "OrderStatusHistory" h ON h."orderId" = d."id"

  UNION ALL
  SELECT 'H · AUDIT', d."code", al."action"::text, al."module"::text,
         NULL::bigint, al."createdAt",
         ('bởi ' || left(al."actorName",2) || '***')::text, 9
    FROM don d JOIN "AuditLog" al ON al."entityType" = 'Order' AND al."entityId" = d."id"

  UNION ALL
  SELECT 'I · ĐƠN KHÁC CÙNG SĐT', o2."code", o2."status"::text,
         ('lead=' || CASE WHEN o2."leadId"    IS NULL THEN '∅' ELSE left(md5(o2."leadId"),6)    END
          || ' · HV=' || CASE WHEN o2."studentId" IS NULL THEN '∅' ELSE left(md5(o2."studentId"),6) END)::text,
         o2."totalAmount"::bigint, o2."createdAt",
         ('khách md5=' || left(md5(lower(btrim(o2."customerName"))),8)
          || ' · SĐT …' || right(regexp_replace(COALESCE(o2."customerPhone",''),'\D','','g'),4)
          || ' · xoá mềm=' || COALESCE(o2."deletedAt"::text,'không'))::text,
         10
    FROM "Order" o2
    LEFT JOIN "Student" s2 ON s2."id" = o2."studentId"
   WHERE o2."code" NOT IN ('ORD-260829-000001','ORD-260831-000001')
     AND (
       right(regexp_replace(COALESCE(o2."customerPhone",''),'\D','','g'),9) IN (SELECT so9 FROM sdt)
       OR right(regexp_replace(COALESCE(s2."parentPhone",''),'\D','','g'),9) IN (SELECT so9 FROM sdt)
     )
) t
ORDER BY thu_tu, ma_don, moc NULLS FIRST
LIMIT 120;

-- ═══════════════════════════════════════════════════════════════════════════
-- CÂU 2 · ORD-260910-000001 — 134.400đ lệch đi đâu?
-- ═══════════════════════════════════════════════════════════════════════════
WITH d AS (
  SELECT * FROM "Order" WHERE "code" = 'ORD-260910-000001'
),
it AS (
  SELECT oi."id" AS id,
         left(oi."itemName", 20) AS ten,
         oi."quantity"::numeric  AS sl,
         oi."unitPrice"::numeric AS don_gia,
         oi."totalPrice"::numeric AS tam_tinh,
         COALESCE((to_jsonb(oi) ->> 'discountAmount')::numeric, 0) AS giam,
         COALESCE(to_jsonb(oi) ->> 'discountPercent', '-')         AS pct,
         COALESCE(left(to_jsonb(oi) ->> 'discounts', 70), '-')     AS ds,
         CASE WHEN to_jsonb(oi) ->> 'studentId' IS NULL THEN 'null' ELSE 'co' END AS hv,
         CASE WHEN oi."enrollmentId" IS NULL THEN 'null' ELSE 'co' END AS enr,
         COALESCE(oi."metadata" ->> 'coachFormat', '-') AS coach,
         COALESCE(oi."metadata" ->> 'soBuoi', '-')      AS so_buoi
  FROM "OrderItem" oi JOIN d ON oi."orderId" = d."id"
),
pm AS (
  SELECT p."id" AS id, p."amount"::numeric AS amount, p."paidDate" AS paid_date,
         p."saleStatus"::text AS ss, p."accountantStatus"::text AS ac, p."deletedAt" AS del,
         p."enrollmentId" AS enr, p."adjustmentOfId" AS adj_of, left(p."method",12) AS method,
         COALESCE(to_jsonb(p) ->> 'paymentType', 'PAYMENT') AS ptype,
         CASE WHEN p."centerId" IS NOT DISTINCT FROM d."centerId" THEN 'khop'
              WHEN p."centerId" IS NULL THEN 'NULL'
              ELSE 'KHAC' END AS cs,
         CASE
           WHEN p."note" LIKE '%[auto:sepay:%'             THEN '[auto:sepay]'
           WHEN p."note" LIKE '%[auto:payos:%'             THEN '[auto:payos]'
           WHEN p."note" LIKE '%[auto:order-installment:%' THEN '[auto:dot]'
           WHEN p."note" LIKE '%[auto:order-confirm]%'     THEN '[auto:confirm]'
           WHEN p."note" LIKE '%[backfill-import]%'        THEN '[backfill-import]'
           WHEN p."note" IS NULL OR btrim(p."note") = ''   THEN '(trong)'
           ELSE '(ghi tay)'
         END AS dau
  FROM "Payment" p JOIN d ON p."orderId" = d."id"
),
pr AS (
  SELECT r."id" AS id, r."installmentNo" AS so_dot, r."amountDue"::numeric AS phai_thu,
         r."status"::text AS st, r."dueDate" AS han,
         CASE WHEN to_jsonb(r) ->> 'orderItemId' IS NULL THEN 'toan don' ELSE 'theo con' END AS pham_vi
  FROM "PaymentRequest" r JOIN d ON r."orderId" = d."id"
),
al AS (
  SELECT a."paymentRequestId" AS pr_id, a."bankTransactionId" AS bt_id,
         a."amount"::numeric AS amount, a."roundingWaived"::numeric AS tha
  FROM "PaymentAllocation" a JOIN pr ON a."paymentRequestId" = pr.id
),
en AS (
  SELECT e."id" AS id, e."listPrice"::numeric AS gia_goc, e."discountAmount"::numeric AS giam,
         e."finalPrice"::numeric AS gia_chot, e."tuition"::numeric AS hoc_phi_cu,
         e."status"::text AS st, COALESCE(e."discountType",'-') AS d_type,
         e."deletedAt" AS del, e."courseId" AS course_id
  FROM "Enrollment" e
  WHERE e."id" IN (SELECT oi."enrollmentId" FROM "OrderItem" oi JOIN d ON oi."orderId"=d."id"
                    WHERE oi."enrollmentId" IS NOT NULL)
     OR e."id" IN (SELECT enr FROM pm WHERE enr IS NOT NULL)
     OR e."studentId" IN (SELECT "studentId" FROM d WHERE "studentId" IS NOT NULL)
),
tb AS (SELECT COALESCE(SUM(amount),0) AS v FROM pm
        WHERE del IS NULL AND ss IN ('RECORDED','COLLECT_CONFIRMED'))
SELECT 1 AS stt, 'A - DON' AS muc, d."code" AS chi_tiet,
       d."subtotal"::numeric AS so_a, d."discountAmount"::numeric AS so_b,
       d."shippingFee"::numeric AS so_c, d."totalAmount"::numeric AS so_d,
       'so_a=subtotal | so_b=discountAmount | so_c=shippingFee | so_d=totalAmount (o "Tong phai dong") >> '
       || d."status"::text || ' | pct don=' || COALESCE(d."discountPercent"::text,'-')
       || ' | duyet giam=' || COALESCE(d."discountApprovalStatus"::text,'-')
       || ' | voucher=' || COALESCE(d."voucherCode",'-')
       || ' | duyet gop=' || COALESCE(d."installmentApprovalStatus"::text,'-')
       || ' | co so don=' || COALESCE(right(d."centerId",6),'NULL')
       || ' | tao ' || to_char(d."createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh','dd/MM/yy HH24:MI')
       || ' | SDT...' || right(regexp_replace(COALESCE(d."customerPhone",''),'\D','','g'),4) AS ghi_chu,
       '1' AS sap
FROM d
UNION ALL SELECT 2,'B - HEADER vs DONG','tong cac dong',
  (SELECT COALESCE(SUM(tam_tinh),0) FROM it),
  d."subtotal"::numeric - (SELECT COALESCE(SUM(tam_tinh),0) FROM it),
  d."discountAmount"::numeric - (SELECT COALESCE(SUM(giam),0) FROM it),
  d."totalAmount"::numeric - (d."subtotal"::numeric - d."discountAmount"::numeric + d."shippingFee"::numeric),
  'so_a=SUM(OrderItem.totalPrice) | so_b=subtotal-so_a (khac 0 => header KHONG do cac dong sinh ra) | so_c=Order.discountAmount - SUM(giam tung dong): don TRUOC 15/09 thi so_c = DUNG BANG Order.discountAmount va do la BINH THUONG, KHONG phai loi | so_d=totalAmount-(subtotal-discountAmount+ship) (khac 0 => header TU MAU THUAN)','2'
FROM d
UNION ALL SELECT 3,'C - DONG HANG', it.ten, it.don_gia, it.sl, it.tam_tinh, it.giam,
  'so_a=unitPrice | so_b=qty | so_c=totalPrice | so_d=giam dong >> thanh tien='
  || (it.tam_tinh - it.giam)::text || ' | pct=' || it.pct
  || ' | coach=' || it.coach || ' | soBuoi=' || it.so_buoi
  || ' | discounts=' || it.ds || ' | enrollment=' || it.enr || ' | hocvien=' || it.hv,
  '3' || it.id
FROM it
UNION ALL SELECT 4,'D - KHOAN THU (Payment)',
  to_char(pm.paid_date AT TIME ZONE 'Asia/Ho_Chi_Minh','dd/MM/yy'),
  pm.amount, NULL::numeric, NULL::numeric, NULL::numeric,
  pm.ptype || ' | sale=' || pm.ss || ' | ketoan=' || pm.ac
  || CASE WHEN pm.del IS NOT NULL THEN ' | XOA MEM ' || to_char(pm.del AT TIME ZONE 'Asia/Ho_Chi_Minh','dd/MM HH24:MI') ELSE '' END
  || CASE WHEN pm.adj_of IS NOT NULL THEN ' | TRO VE PHIEU GOC' ELSE '' END
  || ' | ' || pm.method || ' | dau=' || pm.dau
  || ' | enr=' || CASE WHEN pm.enr IS NULL THEN 'null' ELSE 'co' END
  || ' | co so=' || pm.cs,
  '4' || pm.id
FROM pm
UNION ALL SELECT 5,'E - TONG THU theo TRUC','tong',
  (SELECT v FROM tb),
  (SELECT COALESCE(SUM(amount),0) FROM pm WHERE del IS NULL AND ac = 'CONFIRMED'),
  (SELECT COALESCE(SUM(amount),0) FROM pm WHERE del IS NOT NULL),
  d."totalAmount"::numeric - (SELECT v FROM tb),
  'so_a=TRUC B = o "Da thu" tren man don | so_b=TRUC A (ke toan xac nhan, dung o /cong-no) | so_c=tong khoan DA XOA MEM | so_d=CHINH PHAN LECH dang hoi','5a'
FROM d
UNION ALL SELECT 5,'E2 - KHOAN DAC BIET','tong',
  (SELECT COALESCE(SUM(amount),0) FROM pm WHERE del IS NULL AND amount < 0),
  (SELECT COALESCE(SUM(amount),0) FROM pm WHERE del IS NULL AND adj_of IS NOT NULL),
  (SELECT COALESCE(SUM(amount),0) FROM pm WHERE del IS NULL AND ac = 'REJECTED'),
  (SELECT COALESCE(SUM(amount),0) FROM pm WHERE del IS NULL AND ss IN ('RECORDED','COLLECT_CONFIRMED') AND cs <> 'khop'),
  'so_a=SUM khoan AM (hoan tien + dieu chinh giam) | so_b=SUM khoan tro ve phieu goc | so_c=SUM khoan ke toan TU CHOI - CANH BAO: van NAM TRONG truc B, KHONG lam "Da thu" tut | so_d=SUM khoan co centerId KHAC/NULL so voi don => scopedDb GIAU khoi nguoi cap co so (SUPER_ADMIN van thay)','5b'
FROM d
UNION ALL SELECT 6,'F - PHIEU THU (PaymentRequest)','dot ' || pr.so_dot::text,
  pr.phai_thu,
  (SELECT COALESCE(SUM(amount),0) FROM al WHERE al.pr_id = pr.id),
  (SELECT COALESCE(SUM(tha),0)    FROM al WHERE al.pr_id = pr.id),
  pr.phai_thu - (SELECT COALESCE(SUM(amount + tha),0) FROM al WHERE al.pr_id = pr.id),
  'so_a=amountDue | so_b=da rot | so_c=THA lam tron | so_d=con thieu >> ' || pr.st
  || ' | ' || pr.pham_vi || ' | han=' || COALESCE(to_char(pr.han AT TIME ZONE 'Asia/Ho_Chi_Minh','dd/MM/yy'),'-'),
  '6' || lpad(pr.so_dot::text, 3, '0')
FROM pr
UNION ALL SELECT 7,'G - TONG PHIEU vs DON','tong phieu chua VOID',
  (SELECT COALESCE(SUM(phai_thu),0) FROM pr WHERE st <> 'VOID' AND so_dot > 0),
  (SELECT COALESCE(SUM(phai_thu),0) FROM pr WHERE st <> 'VOID'),
  d."totalAmount"::numeric,
  d."totalAmount"::numeric - (SELECT COALESCE(SUM(phai_thu),0) FROM pr WHERE st <> 'VOID'),
  'so_a=dot>0 chua VOID | so_b=MOI phieu chua VOID | so_c=totalAmount | so_d=LECH. so_d=134400 => so PHIEU thieu dung phan lech','7'
FROM d
UNION ALL SELECT 8,'H - DOT (OrderInstallment)','dot ' || oi2."soDot"::text,
  oi2."amount"::numeric, NULL::numeric, NULL::numeric, NULL::numeric,
  oi2."status"::text || ' | han=' || COALESCE(to_char(oi2."dueDate" AT TIME ZONE 'Asia/Ho_Chi_Minh','dd/MM/yy'),'-')
  || ' | paidAt=' || COALESCE(to_char(oi2."paidAt" AT TIME ZONE 'Asia/Ho_Chi_Minh','dd/MM/yy'),'-'),
  '8' || lpad(oi2."soDot"::text, 3, '0')
FROM "OrderInstallment" oi2 JOIN d ON oi2."orderId" = d."id"
UNION ALL SELECT 9,'I - GHI DANH', COALESCE(c."code", left(c."name",18), '-'),
  en.gia_goc, en.giam, en.gia_chot, en.hoc_phi_cu,
  'so_a=listPrice | so_b=discountAmount | so_c=finalPrice (/cong-no + portal doc) | so_d=tuition >> '
  || en.st || ' | discType=' || en.d_type
  || ' | Course.price=' || COALESCE(c."price"::text,'-')
  || ' | soBuoi khoa=' || COALESCE(c."totalSessions"::text,'-')
  || CASE WHEN en.del IS NOT NULL THEN ' | GHI DANH DA XOA MEM' ELSE '' END,
  '9' || en.id
FROM en LEFT JOIN "Course" c ON c."id" = en.course_id
UNION ALL SELECT 10,'J - VOUCHER', left(v."voucherId", 12),
  v."discountApplied"::numeric, NULL::numeric, NULL::numeric, NULL::numeric,
  'so_a=discountApplied. Neu =134400 => voucher da ghi ma totalAmount chua tru (hoac nguoc lai)','10'
FROM "VoucherRedemption" v JOIN d ON v."orderId" = d."id"
UNION ALL SELECT 11,'K - GD NGAN HANG lien quan don',
  bt."provider" || ' ' || to_char(bt."transferredAt" AT TIME ZONE 'Asia/Ho_Chi_Minh','dd/MM HH24:MI'),
  bt."amount"::numeric,
  (SELECT COALESCE(SUM(amount),0) FROM al WHERE al.bt_id = bt."id"),
  NULL::numeric,
  bt."amount"::numeric - (SELECT COALESCE(SUM(amount),0) FROM al WHERE al.bt_id = bt."id"),
  'so_a=NH bao | so_b=rot vao don nay | so_d=phan KHONG rot (thanh CreditBalance) >> ' || bt."status"::text
  || ' | noi voi don bang: ' || CASE WHEN bt."id" IN (SELECT bt_id FROM al) THEN 'PaymentAllocation' ELSE 'gatewayTxnId/bankReference (so cu, KHONG co allocation)' END,
  '11' || bt."id"
FROM "BankTransaction" bt, d
WHERE bt."id" IN (SELECT bt_id FROM al)
   OR (d."gatewayTxnId" IS NOT NULL AND bt."providerTxnId" = d."gatewayTxnId")
   OR (d."bankReference" IS NOT NULL AND bt."referenceCode" = d."bankReference")
UNION ALL SELECT 12,'L - TIEN DU (CreditBalance)',
  to_char(cb."createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh','dd/MM/yy'),
  cb."amount"::numeric, NULL::numeric, NULL::numeric, NULL::numeric,
  'tien khach chuyen ma KHONG rot duoc vao phieu nao cua don | daXuLy='
  || CASE WHEN cb."settledAt" IS NULL THEN 'chua' ELSE 'roi' END,
  '12' || cb."id"
FROM "CreditBalance" cb JOIN d ON cb."orderId" = d."id"
UNION ALL SELECT 13,'M - SO HOC cua phan lech','lech',
  d."totalAmount"::numeric - (SELECT v FROM tb),
  ROUND((d."totalAmount"::numeric - (SELECT v FROM tb)) * 100 / NULLIF(d."subtotal",0), 4),
  ROUND((d."totalAmount"::numeric - (SELECT v FROM tb)) * 100 / NULLIF(d."totalAmount",0), 4),
  ROUND(d."subtotal"::numeric / NULLIF(d."totalAmount"::numeric - (SELECT v FROM tb), 0), 4),
  'so_a=lech | so_b=lech theo % cua subtotal | so_c=% cua totalAmount | so_d=subtotal/lech. so_b=1.0000 (hay so_d=100) => lech DUNG MOT DIEM PHAN TRAM giam gia','13'
FROM d
UNION ALL SELECT 14,'N - GD NH = DUNG phan lech (moi don)',
  bt2."provider" || ' ' || bt2."status"::text,
  bt2."amount"::numeric, NULL::numeric, NULL::numeric, NULL::numeric,
  'ngay ' || to_char(bt2."transferredAt" AT TIME ZONE 'Asia/Ho_Chi_Minh','dd/MM/yy HH24:MI')
  || ' - co giao dich dung bang phan lech dang troi noi khong',
  '14' || bt2."id"
FROM "BankTransaction" bt2, d
WHERE d."totalAmount"::numeric - (SELECT v FROM tb) <> 0
  AND bt2."amount"::numeric = d."totalAmount"::numeric - (SELECT v FROM tb)
UNION ALL SELECT 15,'O - NHAT KY (AuditLog)',
  left(a."entityType",8) || '/' || left(a."action",16),
  CASE WHEN a."newValues" ->> 'totalAmount'    ~ '^-?[0-9]+$' THEN (a."newValues" ->> 'totalAmount')::numeric
       WHEN a."newValues" ->> 'amount'         ~ '^-?[0-9]+$' THEN (a."newValues" ->> 'amount')::numeric END,
  CASE WHEN a."newValues" ->> 'discountAmount' ~ '^-?[0-9]+$' THEN (a."newValues" ->> 'discountAmount')::numeric END,
  CASE WHEN a."newValues" ->> 'subtotal'       ~ '^-?[0-9]+$' THEN (a."newValues" ->> 'subtotal')::numeric END,
  NULL::numeric,
  to_char(a."createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh','dd/MM/yy HH24:MI')
  || ' | giam tung dong=' || COALESCE(left(a."newValues" ->> 'giamTungDong', 90), '-')
  || ' | trangthai=' || COALESCE(a."newValues" ->> 'accountantStatus', a."newValues" ->> 'status', '-')
  || ' | ly do=' || COALESCE(left(regexp_replace(COALESCE(a."reason",''),'[0-9]{4,}','#','g'), 50), '-'),
  '15' || a."id"
FROM "AuditLog" a, d
WHERE (a."entityType" = 'Order'   AND a."entityId" = d."id")
   OR (a."entityType" = 'Payment' AND a."entityId" IN (SELECT id FROM pm))
ORDER BY stt, sap;

-- ═══════════════════════════════════════════════════════════════════════════
-- CÂU 3 · Giao dịch 8.700.000đ ghi hợp đồng SR.HD.230801 — có phải học phí không?
-- ═══════════════════════════════════════════════════════════════════════════
-- CHỈ ĐỌC. 5 khối SELECT nối UNION ALL. Không CTE ghi, không hàm ghi. ~20-35 dòng.
--
-- VÌ SAO CÓ LẤY CHỮ TRONG NỘI DUNG CK / GHI CHÚ:
--   Câu hỏi CHÍNH LÀ "chuỗi SR.HD.230801 nghĩa là gì" và "6 dòng IGNORED kia là tiền
--   gì". Số hợp đồng không tồn tại ở cột nào khác (grep 'SR.HD' toàn repo = 0 dòng) —
--   nó chỉ nằm trong `content`; còn lý do bỏ qua chỉ nằm trong `unmatchedNote` và
--   `AuditLog.reason`. Không đọc chúng thì câu hỏi không trả lời được.
--
-- CHE SỐ (bắt buộc, và KHÔNG chỉ cho cột SĐT):
--   Mọi DÃY ≥9 CHỮ SỐ LIỀN NHAU bị rút còn '***' + 4 số cuối. Đó đúng là hình dạng SĐT
--   mà hệ thống nhận (10 số '0…' / 11 số '84…' — payos-ingest.ts:273-277), VÀ
--   `unmatchedNote` do MÁY dựng có in SĐT NGUYÊN VĂN (payos-ingest.ts:560, :604, :344)
--   kèm một bản sao nguyên văn của memo (:824-830). Che ở cột `content` thôi là chưa đủ.
--   Số hợp đồng 230801 (6 số) và số tiền KHÔNG bị che. Mã đơn ORD-YYMMDD-NNNNNN hiện
--   thành 'ORD***NNNN' — vẫn đủ nhận ra "có mã đơn".
--   KHÔNG select cột SĐT/họ tên của bảng nào (customerPhone, customerName, student.name).
--   `content` vẫn có thể còn TÊN CON ở 60 ký tự đầu — đọc tại chỗ, đừng dán ra ngoài.

SELECT
  'A · memo nhắc HỢP ĐỒNG, hoặc số tiền đúng 8.700.000'                              AS nhom,
  t.provider                                                                          AS nguon,
  to_char(t."transferredAt" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI')   AS ngay_vn,
  t.amount                                                                            AS so_tien,
  t.status::text || CASE WHEN t."centerId" IS NULL THEN ' ·cs:trống' ELSE ' ·cs:đã gán' END AS trang_thai,
  pb.so_dong_pb                                                                       AS so_dong_phan_bo,
  pb.da_rot                                                                           AS da_rot,
  left(regexp_replace(coalesce(t.content, ''), '(\d{5,})(\d{4})', '***\2', 'g'), 60)  AS noi_dung_60,
  left(regexp_replace(
         coalesce(t."unmatchedNote", '')
         || coalesce(' || audit[' || au.action || ']: ' || coalesce(au.reason, '(không reason)'), ''),
         '(\d{5,})(\d{4})', '***\2', 'g'), 150)                                       AS ghi_chu
FROM "BankTransaction" t
LEFT JOIN LATERAL (
  SELECT count(*)::int AS so_dong_pb, coalesce(sum(a.amount), 0)::bigint AS da_rot
  FROM "PaymentAllocation" a WHERE a."bankTransactionId" = t.id
) pb ON true
LEFT JOIN LATERAL (
  SELECT g.action, g.reason FROM "AuditLog" g
  WHERE g."entityType" = 'BankTransaction' AND g."entityId" = t.id
    AND g.action IN ('TXN_IGNORED', 'TXN_MATCHED_MANUAL')
  ORDER BY g."createdAt" DESC LIMIT 1
) au ON true
WHERE t.content ILIKE '%SR.HD%'
   OR t.content ILIKE '%HD.%'
   OR t.content ILIKE '%hop dong%'
   OR t.content ILIKE '%hợp đồng%'
   -- ngân hàng hay xoá dấu chấm/khoảng trắng: 'SR.HD.230801' → 'SRHD230801'
   OR upper(regexp_replace(coalesce(t.content, ''), '[^A-Za-z0-9]', '', 'g')) LIKE '%SRHD%'
   OR upper(regexp_replace(coalesce(t.content, ''), '[^A-Za-z0-9]', '', 'g')) LIKE '%HOPDONG%'
   OR t.amount = 8700000

UNION ALL

SELECT
  'B · MỌI giao dịch đang IGNORED',
  t.provider,
  to_char(t."transferredAt" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'),
  t.amount,
  t.status::text || CASE WHEN t."centerId" IS NULL THEN ' ·cs:trống' ELSE ' ·cs:đã gán' END,
  pb.so_dong_pb,
  pb.da_rot,
  left(regexp_replace(coalesce(t.content, ''), '(\d{5,})(\d{4})', '***\2', 'g'), 60),
  left(regexp_replace(
         coalesce(t."unmatchedNote", '')
         || coalesce(' || audit[' || au.action || ']: ' || coalesce(au.reason, '(không reason)'), ' || audit: (KHÔNG CÓ DÒNG AUDIT)'),
         '(\d{5,})(\d{4})', '***\2', 'g'), 150)
FROM "BankTransaction" t
LEFT JOIN LATERAL (
  SELECT count(*)::int AS so_dong_pb, coalesce(sum(a.amount), 0)::bigint AS da_rot
  FROM "PaymentAllocation" a WHERE a."bankTransactionId" = t.id
) pb ON true
LEFT JOIN LATERAL (
  SELECT g.action, g.reason FROM "AuditLog" g
  WHERE g."entityType" = 'BankTransaction' AND g."entityId" = t.id
    AND g.action = 'TXN_IGNORED'
  ORDER BY g."createdAt" DESC LIMIT 1
) au ON true
WHERE t.status = 'IGNORED'

UNION ALL

SELECT
  'C · phiếu thu CÒN PHẢI THU đúng 8.700.000 (đã loại phiếu VOID)',
  'phiếu thu',
  to_char(pr."createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'),
  pr."amountDue",
  pr.status::text,
  NULL::int,
  coalesce(al.da_rot, 0),
  left(o.code || ' · ' || o.type::text || ' · đợt ' || pr."installmentNo", 60),
  left('đơn ' || o.status::text || ' · matchKey ' || coalesce(pr."matchKey", '(chưa có)'), 150)
FROM "PaymentRequest" pr
JOIN "Order" o ON o.id = pr."orderId"
LEFT JOIN LATERAL (
  SELECT coalesce(sum(a.amount), 0)::bigint  AS da_rot,
         coalesce(sum(a."roundingWaived"), 0)::bigint AS tha
  FROM "PaymentAllocation" a WHERE a."paymentRequestId" = pr.id
) al ON true
WHERE o."deletedAt" IS NULL
  AND pr.status <> 'VOID'
  AND pr."amountDue" - coalesce(al.da_rot, 0) - coalesce(al.tha, 0) = 8700000

UNION ALL

SELECT
  'D · ĐƠN có tổng tiền đúng 8.700.000',
  'đơn hàng',
  to_char(o."createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'),
  o."totalAmount",
  o.status::text,
  NULL::int,
  NULL::bigint,
  left(o.code || ' · loại ' || o.type::text, 60),
  left('giảm giá ' || o."discountAmount"::text || 'đ · paidAt='
       || coalesce(to_char(o."paidAt" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'), '(chưa)'), 150)
FROM "Order" o
WHERE o."deletedAt" IS NULL
  AND o."totalAmount" = 8700000

UNION ALL

SELECT
  'E · sổ CŨ (Payment) — khoản đúng 8.700.000 đã ghi nhận',
  'sổ A',
  to_char(p."paidDate" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'),
  p.amount,
  p."saleStatus"::text || '/' || p."accountantStatus"::text,
  NULL::int,
  NULL::bigint,
  left(o.code || ' · pt=' || p.method, 60),
  left(regexp_replace('đơn ' || o.status::text || ' · ' || coalesce(p.note, '(không ghi chú)'),
                      '(\d{5,})(\d{4})', '***\2', 'g'), 150)
FROM "Payment" p
JOIN "Order" o ON o.id = p."orderId"
WHERE p."deletedAt" IS NULL
  AND p.amount = 8700000

ORDER BY 1, 3;