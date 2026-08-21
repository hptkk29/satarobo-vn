-- ============================================================================
-- CHẨN ĐOÁN PROD — chạy trên Supabase SQL editor của project PRODUCTION.
-- CHỈ ĐỌC. Không UPDATE, không DELETE, không tạo gì.
--
-- ĐÂY LÀ ĐƯỜNG TẠM. Đường chính là workflow `elearning-actor-audit.yml`, nhưng
-- GitHub chỉ cho `workflow_dispatch` chạy khi file ĐÃ có trên nhánh MẶC ĐỌNH
-- (`main`) — workflow đó hiện mới nằm trên `test`. Sau khi `test` → `main`, dùng
-- workflow thay cho file này: nó in cùng bốn nhóm nhưng theo đúng logic của
-- `buildActor`, không phải bản chép tay có thể trôi.
--
-- Đã kiểm cú pháp bằng cách chạy thật trên DB dev.
-- ============================================================================

-- ─── (A) AI ĐANG THẤY MỌI CƠ SỞ (HO-level) ─────────────────────────────────
-- Bất kỳ vai nào neo tại OrgUnit type HO/ROOT ⇒ isHoLevel ⇒ thấy toàn hệ thống.
-- Đối chiếu TỪNG DÒNG với danh sách Hội sở đã duyệt.
SELECT u.name                        AS ho_ten,
       u.email,
       ou.code                       AS neo_tai,
       rd.code                       AS vai,
       e."employeeCode",
       e."jobTitle"                  AS chuc_danh,
       e.department                  AS phong_ban
FROM "UserOrgRole" uor
JOIN "RoleDef" rd ON rd.id = uor."roleId" AND rd."isActive"
JOIN "OrgUnit" ou ON ou.id = uor."orgUnitId" AND ou."deletedAt" IS NULL
JOIN "User"    u  ON u.id  = uor."userId"    AND u."deletedAt" IS NULL
LEFT JOIN "Employee" e ON e.id = u."employeeId"
WHERE uor.status = 'ACTIVE'
  AND uor."effectiveFrom" <= now()
  AND (uor."effectiveTo" IS NULL OR uor."effectiveTo" >= now())
  AND ou.type IN ('HO', 'ROOT')
ORDER BY rd.code, u.name;


-- ─── (B) TOÀN BỘ NHÂN SỰ ĐANG LÀM VIỆC — đơn vị / cơ sở / neo vai ───────
-- Prod chỉ có ~14 người nên liệt kê HẾT, không lọc theo tên (lọc là sót).
-- Đọc theo cột:
--   co_so_ho_so  trống  ⇒ vô hình với quản lý cơ sở (trừ người Hội sở, đúng thiết kế)
--   neo_vai      có "HO/" ⇒ người đó ĐANG THẤY MỌI CƠ SỞ
SELECT e."fullName"          AS ho_ten,
       e."employeeCode",
       e."jobTitle"          AS chuc_danh,
       e.department          AS phong_ban,
       c.name                AS co_so_ho_so,      -- Employee.centerId
       ou_e.code             AS don_vi_ho_so,     -- Employee.orgUnitId
       ou_u.code             AS don_vi_tai_khoan, -- User.orgUnitId
       (SELECT string_agg(ou2.code || '/' || rd2.code, ', ' ORDER BY ou2.code)
          FROM "UserOrgRole" r2
          JOIN "RoleDef" rd2 ON rd2.id = r2."roleId" AND rd2."isActive"
          JOIN "OrgUnit" ou2 ON ou2.id = r2."orgUnitId"
         WHERE r2."userId" = u.id
           AND r2.status = 'ACTIVE'
           AND r2."effectiveFrom" <= now()
           AND (r2."effectiveTo" IS NULL OR r2."effectiveTo" >= now())
       )                     AS neo_vai
FROM "Employee" e
LEFT JOIN "Center"  c    ON c.id    = e."centerId"
LEFT JOIN "OrgUnit" ou_e ON ou_e.id = e."orgUnitId"
LEFT JOIN "User"    u    ON u."employeeId" = e.id AND u."deletedAt" IS NULL
LEFT JOIN "OrgUnit" ou_u ON ou_u.id = u."orgUnitId"
WHERE e."isActive" AND e.status = 'ACTIVE'
ORDER BY e."fullName";


-- ─── (C) BỐN NHÓM — số đếm tổng quan ───────────────────────────────────────
WITH ns AS (
  SELECT u.id, u."employeeId", u."orgUnitId"
  FROM "User" u
  WHERE u."deletedAt" IS NULL
    AND EXISTS (
      SELECT 1 FROM unnest(
        CASE WHEN COALESCE(array_length(u.roles, 1), 0) > 0
             THEN u.roles ELSE ARRAY[u.role] END) AS r
      WHERE r::text <> 'PARENT')
), song AS (
  SELECT uor."userId", bool_or(ou.type IN ('HO','ROOT')) AS co_neo_ho
  FROM "UserOrgRole" uor
  JOIN "RoleDef" rd ON rd.id = uor."roleId" AND rd."isActive"
  JOIN "OrgUnit" ou ON ou.id = uor."orgUnitId" AND ou."deletedAt" IS NULL
  WHERE uor.status = 'ACTIVE'
    AND uor."effectiveFrom" <= now()
    AND (uor."effectiveTo" IS NULL OR uor."effectiveTo" >= now())
  GROUP BY uor."userId"
)
SELECT
  count(*)                                                        AS tk_nhan_su,
  count(*) FILTER (WHERE s."userId" IS NOT NULL
                     AND NOT s.co_neo_ho)                         AS da_du_o_co_so,
  count(*) FILTER (WHERE s."userId" IS NULL
                     AND ns."employeeId" IS NOT NULL)             AS nhom1_va_3,
  count(*) FILTER (WHERE s."userId" IS NULL
                     AND ns."employeeId" IS NULL)                 AS nhom2_khong_ho_so,
  count(*) FILTER (WHERE s.co_neo_ho)                             AS nhom4_ho_level
FROM ns
LEFT JOIN song s ON s."userId" = ns.id;
