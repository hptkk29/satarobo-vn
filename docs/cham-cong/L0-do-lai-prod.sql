-- L0 — đo lại trên PROD (Supabase SQL Editor, chỉ đọc). Dump 01/08 đã 5 tuần.
-- Dán từng khối, chép kết quả vào KE-HOACH-CHAM-CONG-v3.md §1.3.

-- M1/M2: 5 bảng chấm công cũ còn 0 dòng không? (kế hoạch: đóng băng, không backfill)
SELECT 'EmployeeCheckin' AS bang, count(*) FROM "EmployeeCheckin"
UNION ALL SELECT 'ShiftRegistration', count(*) FROM "ShiftRegistration"
UNION ALL SELECT 'WorkRequest', count(*) FROM "WorkRequest"
UNION ALL SELECT 'TimesheetAdjustmentRequest', count(*) FROM "TimesheetAdjustmentRequest"
UNION ALL SELECT 'TimesheetEditLog', count(*) FROM "TimesheetEditLog"
UNION ALL SELECT 'WorkShiftConfig', count(*) FROM "WorkShiftConfig";

-- M5: ghép Sheet ↔ User theo SĐT — bao nhiêu nhân sự đang hoạt động có SĐT hợp lệ?
SELECT
  count(*) FILTER (WHERE u."isActive" AND u."deletedAt" IS NULL)                                   AS user_hoat_dong,
  count(*) FILTER (WHERE u."isActive" AND u."deletedAt" IS NULL AND u.phone ~ '^0[0-9]{9}$')        AS co_sdt_10_so,
  count(*) FILTER (WHERE u."isActive" AND u."deletedAt" IS NULL AND (u.phone IS NULL OR u.phone = '')) AS thieu_sdt
FROM "User" u
WHERE u.role <> 'PARENT';

-- Lễ: 1/9, 2/9 đã có (chủ dự án xác nhận 05/09); 24/11 chưa → nhập qua màn /holidays.
SELECT id, name, date, "endDate", type, "centerId" FROM "Holiday" WHERE date >= '2026-09-01' ORDER BY date;

-- Toạ độ cơ sở: 0/3 lúc dump — đo thực địa rồi nhập ở /centers/<id>/edit.
SELECT code, name, latitude, longitude, "allowedRadiusMeters" FROM "Center" ORDER BY code;

-- Vai v2: sau khi bấm seed-prod-roles.yml, 4 vai này phải có hr_attendance:checkin.
SELECT r.code, rp.action, rp."scopeType"
FROM "RolePermission" rp JOIN "RoleDef" r ON r.id = rp."roleId"
WHERE rp.action = 'hr_attendance:checkin'
ORDER BY r.code;

-- (Bổ sung 05/09 sau khi đo: User.phone trống 0/21) — SĐT nhân sự nằm ở Employee?
SELECT
  count(*) FILTER (WHERE e.status = 'ACTIVE')                                            AS employee_active,
  count(*) FILTER (WHERE e.status = 'ACTIVE' AND e.phone ~ '^0[0-9]{9}$')                AS co_sdt_10_so,
  count(*) FILTER (WHERE e.status = 'ACTIVE' AND u.id IS NOT NULL)                       AS da_lien_ket_user
FROM "Employee" e LEFT JOIN "User" u ON u."employeeId" = e.id;
