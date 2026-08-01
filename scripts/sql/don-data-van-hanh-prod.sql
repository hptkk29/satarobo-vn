-- =============================================================================
-- DỌN DỮ LIỆU VẬN HÀNH TRÊN PROD — lead · học viên · đơn hàng · lớp học
-- Chốt 01/08/2026 (chủ dự án): data cũ không đạt kết quả mong muốn, nhập lại tay.
--
-- ⚠️⚠️ FILE NÀY XOÁ DỮ LIỆU THẬT, KHÔNG CÓ ĐƯỜNG HOÀN TÁC ⚠️⚠️
-- Khác mọi file khác trong thư mục này (các file kia thuần SELECT).
--
-- VÌ SAO LÀ SQL CHỨ KHÔNG PHẢI SCRIPT TS: `DATABASE_URL` prod trên Vercel đánh
-- dấu Sensitive, không đọc ngược được (kể cả `vercel env pull`) → không chạy được
-- `tsx scripts/...` trỏ vào prod. Đường duy nhất:
--   **Supabase Dashboard → project PROD → SQL Editor**
--
-- ── DANH SÁCH BẢNG DƯỚI ĐÂY ĐÃ ĐƯỢC KIỂM CHỨNG BẰNG MÁY (01/08/2026) ─────────
-- Sinh bằng: gốc 4 nhóm + đóng closure theo khoá ngoại + quét bảng có cột
-- studentId/classId/leadId/orderId/enrollmentId. Bước quét theo TÊN CỘT là bắt
-- buộc, không thừa: **21/69 cột tham chiếu trong DB này KHÔNG có khoá ngoại**
-- (ClassSessionMedia.classId, StudentConsent.studentId, MediaStudentTag.studentId,
-- ReportCard.enrollmentId, HomeworkAssignment.studentId, ParentFeedback.studentId,
-- SurveyResponse.*, ConvertConflict.leadId, LeadTransfer.leadId, ProductMovement
-- .orderId, WorkRequest.classId…). Chỉ dựa vào khoá ngoại là bỏ sót đúng 21 chỗ
-- đó và để lại data mồ côi.
-- Đã tự kiểm 2 điều: (1) không bảng danh mục nào lọt vào; (2) closure đóng kín
-- nên TRUNCATE không cần CASCADE.
--
-- ── PHẠM VI ĐÃ CHỐT ──────────────────────────────────────────────────────────
--  XOÁ  · toàn bộ data vận hành (97 bảng dưới)
--       · tài khoản đăng nhập của PHỤ HUYNH (role PARENT thuần)
--       · sổ log + vết kiểm toán
--  GIỮ  · danh mục nền: Course, CoursePackage, Curriculum, Lesson, ScormPackage,
--         Center, OrgUnit, Room, Voucher, Product, EmailTemplate,
--         **SystemSetting** (⚠️ chứa cấu hình template ZNS — mất là ZNS chết),
--         CenterSetting, PaymentMethod, Survey/EvalForm (mẫu), Holiday…
--       · RBAC: RoleDef, RolePermission, UserOrgRole
--       · nhân sự: Employee + User nhân sự (QĐ-C: họ đăng nhập bằng email)
--       · nội dung website: News, Honor, PageContent, JobPosting…
--       · **ngân hàng câu hỏi** Question/Choice (xem bước C2)
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC A — SAO LƯU. KHÔNG BỎ QUA.
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ Dự án đang dùng Supabase bản **FREE → KHÔNG có backup/PITR của Supabase**.
-- Không có lưới an toàn sẵn. Phải tự dựng, bằng MỘT trong hai cách dưới (hoặc cả
-- hai — A1 chống mất cả DB, A2 khôi phục nhanh khi lỡ xoá nhầm).
--
-- ── A1. pg_dump ra máy (KHUYẾN NGHỊ — bản sao nằm NGOÀI Supabase) ───────────
-- Công cụ đã có sẵn trên máy (cài qua scoop, xem .claude/rules/prisma-db.md):
--     ~/scoop/apps/postgresql/current/bin/pg_dump.exe   → v18.4, dump được
--     server Supabase (pg_dump mới hơn server thì OK, ngược lại thì không).
--
-- Chuỗi kết nối lấy Ở ĐÂU: **Supabase Dashboard → Project Settings → Database
-- → Connection string → chọn "Session pooler" (cổng 5432)**. KHÔNG lấy từ
-- Vercel — trên đó `DATABASE_URL` là Sensitive, đọc ra chỉ thấy `[SENSITIVE]`.
-- Quên mật khẩu DB thì đặt lại ngay trang đó (đổi mật khẩu KHÔNG ảnh hưởng
-- Vercel vì Vercel giữ chuỗi riêng — nhưng đổi xong nhớ cập nhật lại Vercel).
-- Dùng session pooler :5432, ĐỪNG dùng transaction pooler :6543 (pg_dump cần
-- prepared statement, cổng 6543 tắt cái đó).
--
--     pg_dump "postgresql://postgres.<ref>:<mat-khau>@aws-1-<region>.pooler.supabase.com:5432/postgres" \
--       -Fc -f satarobo-prod-20260801.dump
--
--     # kiểm file có nội dung thật (vài MB trở lên, KHÔNG phải 0 byte):
--     ls -lh satarobo-prod-20260801.dump
--     pg_restore --list satarobo-prod-20260801.dump | head
--
-- Khôi phục sau này (chỉ 1 bảng, không phải cả DB):
--     pg_restore -d "<chuoi-ket-noi>" --data-only -t '"Student"' satarobo-prod-20260801.dump
--
-- ── A2. Ảnh chụp NGAY TRONG DB (chạy được hoàn toàn ở SQL Editor) ───────────
-- Chép 97 bảng sang schema `bak_20260801`. Nhanh, không cần công cụ, và khôi
-- phục lại đúng bảng lỡ xoá nhầm chỉ bằng một câu INSERT.
-- ⚠️ Hạn chế phải biết: bản sao nằm CÙNG database, nên nó KHÔNG cứu được nếu
-- hỏng/mất cả project. Nó chỉ cứu tình huống "xoá nhầm" — mà đó đúng là rủi ro
-- lớn nhất ở đây. Free tier giới hạn 500MB: chạy câu đo dung lượng ngay dưới
-- trước, nếu tổng đã sát trần thì bỏ A2, dùng A1.

-- Đo dung lượng phần sắp xoá (chỉ đọc):
SELECT pg_size_pretty(sum(pg_total_relation_size(c.oid))) AS kich_thuoc_phan_se_xoa
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN (
    'Lead','Student','Order','Class','Enrollment','Attendance','Payment',
    'ClassSession','AuditLog','DomainEvent','EmailQueue','EmailLog','OtpRequest',
    'OtpDeliveryLog','IntegrationLog','MessengerMessage','ZaloMessageLog'
  );

-- Tạo ảnh chụp (chạy 1 lần; lặp lại sẽ báo schema đã tồn tại — đó là chủ ý):
DO $$
DECLARE t text;
BEGIN
  EXECUTE 'CREATE SCHEMA bak_20260801';
  FOREACH t IN ARRAY ARRAY[
    'Affiliate','Assignment','AssignmentAttachment','AssignmentDocument',
    'AssignmentSubmission','AssignmentSubmissionFile','Attendance','AuditLog',
    'Class','ClassAuditLog','ClassGroup','ClassScheduleSlot','ClassSession',
    'ClassSessionMedia','ClassSessionPlan','CommissionLine','CommissionStatement',
    'ConversationMessage','ConvertConflict','CourseCompletion',
    'CourseCompletionRequest','DomainEvent','EmailLog','EmailQueue','Enrollment',
    'EnrollmentAuditLog','EvalAnswer','EvalResponse','Exam','ExamAnswer',
    'ExamAttempt','ExamQuestion','HomeworkAssignment','IdempotencyKey',
    'IntegrationLog','Lead','LeadActivity','LeadAssignmentHistory','LeadAuditLog',
    'LeadChild','LeadDuplicate','LeadTask','LeadTransfer','LeadTrialHistory',
    'MakeupNeed','MediaStudentTag','MessengerConversation','MessengerMessage',
    'Note','Notification','Order','OrderInstallment','OrderItem',
    'OrderStatusHistory','OtpDeliveryLog','OtpRequest','ParentFeedback',
    'ParentRequest','Payment','PermissionGrantAuditLog','ProductMovement',
    'ProgressReportLog','RbacAuditLog','RbacShadowDiff','Receipt','RefundRequest',
    'ReportCard','ReportCardScore','RoleAuditLog','SataCoinTransaction',
    'ScormAccessLog','ScormAttempt','StaffNotification','Student',
    'StudentAuditLog','StudentCareTask','StudentCenterHistory','StudentConsent',
    'StudentReserve','StudentRiskAlert','StudentSessionFeedback',
    'StudentSkillAssessment','StudentTransferRequest','SubmissionRubricScore',
    'SurveyResponse','TrialAttendance','TrialClass','TrialClassSession',
    'TrialClassV2','TrialEnrollment','TrialFeedback','TrialProgramConfig',
    'UserAuditLog','VoucherRedemption','WebhookDelivery','WorkRequest',
    'ZaloMessageLog','User','Question','Choice'   -- + 3 bảng bị đụng một phần
  ] LOOP
    EXECUTE format('CREATE TABLE bak_20260801.%I AS TABLE public.%I', t, t);
  END LOOP;
END $$;

-- Kiểm ảnh chụp có thật (số dòng phải khớp bước B):
SELECT 'bak Lead' AS bang, count(*) FROM bak_20260801."Lead"
UNION ALL SELECT 'bak Student', count(*) FROM bak_20260801."Student"
UNION ALL SELECT 'bak Order',   count(*) FROM bak_20260801."Order"
UNION ALL SELECT 'bak User',    count(*) FROM bak_20260801."User"
ORDER BY 1;

-- Khôi phục 1 bảng nếu lỡ xoá nhầm (ví dụ Student):
--   INSERT INTO public."Student" SELECT * FROM bak_20260801."Student";
-- Dọn ảnh chụp khi đã yên tâm (nhớ làm — nó chiếm chỗ trong 500MB free tier):
--   DROP SCHEMA bak_20260801 CASCADE;
--
-- Ghi lại: đã backup bằng cách nào, lúc mấy giờ, file/schema tên gì.


-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC B — ĐẾM TRƯỚC (chỉ đọc). Giữ kết quả để so với bước D.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'Lead' AS bang, count(*) FROM "Lead"
UNION ALL SELECT 'Student',    count(*) FROM "Student"
UNION ALL SELECT 'Order',      count(*) FROM "Order"
UNION ALL SELECT 'Class',      count(*) FROM "Class"
UNION ALL SELECT 'Enrollment', count(*) FROM "Enrollment"
UNION ALL SELECT 'Payment',    count(*) FROM "Payment"
UNION ALL SELECT 'Attendance', count(*) FROM "Attendance"
UNION ALL SELECT 'User (TẤT CẢ)', count(*) FROM "User"
UNION ALL SELECT 'User (PARENT thuần — SẼ XOÁ)', count(*) FROM "User" u
  WHERE u."employeeId" IS NULL AND u."role" = 'PARENT'
    AND NOT EXISTS (SELECT 1 FROM unnest(u."roles") r WHERE r <> 'PARENT')
    AND NOT EXISTS (SELECT 1 FROM "UserOrgRole" uor WHERE uor."userId" = u.id)
UNION ALL SELECT 'User (nhân sự — PHẢI CÒN NGUYÊN)', count(*) FROM "User" u
  WHERE u."employeeId" IS NOT NULL OR u."role" <> 'PARENT'
     OR EXISTS (SELECT 1 FROM unnest(u."roles") r WHERE r <> 'PARENT')
     OR EXISTS (SELECT 1 FROM "UserOrgRole" uor WHERE uor."userId" = u.id)
UNION ALL SELECT 'Question — NGÂN HÀNG (giữ)',   count(*) FROM "Question" WHERE "assignmentId" IS NULL
UNION ALL SELECT 'Question — trong bài tập (mất)', count(*) FROM "Question" WHERE "assignmentId" IS NOT NULL
ORDER BY 1;


-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC C — XOÁ THẬT. ĐIỂM KHÔNG QUAY LẠI.
-- ═══════════════════════════════════════════════════════════════════════════
-- Chạy CẢ KHỐI từ BEGIN tới trước COMMIT trong MỘT lần. Postgres cho DDL nằm
-- trong transaction nên lỡ sai vẫn ROLLBACK được nguyên vẹn.

BEGIN;

-- ── C1. Gỡ TẠM ràng buộc Question → Assignment ─────────────────────────────
-- Vì sao cần: TRUNCATE kiểm ở mức RÀNG BUỘC TỒN TẠI, không phải bảng có rỗng
-- hay không. Còn ràng buộc này thì không TRUNCATE được "Assignment", mà không
-- TRUNCATE được "Assignment" thì cũng không TRUNCATE được "Class"
-- (Assignment.classId → Class). Hệ quả dây chuyền là muốn xoá lớp học thì phải
-- xoá cả NGÂN HÀNG CÂU HỎI — cái ta muốn giữ. Gỡ tạm rồi gắn lại y nguyên ở C3.
ALTER TABLE "Question" DROP CONSTRAINT "Question_assignmentId_fkey";

-- ── C2. Câu hỏi soạn TRỰC TIẾP trong bài tập thì đi theo bài tập ────────────
-- (bình thường ON DELETE CASCADE lo việc này; ràng buộc vừa gỡ nên làm tay).
-- Câu hỏi trong NGÂN HÀNG (assignmentId IS NULL) KHÔNG bị đụng.
DELETE FROM "Choice"   WHERE "questionId" IN (SELECT id FROM "Question" WHERE "assignmentId" IS NOT NULL);
DELETE FROM "Question" WHERE "assignmentId" IS NOT NULL;

-- ── C3. Dọn 97 bảng vận hành ────────────────────────────────────────────────
-- KHÔNG dùng CASCADE: CASCADE sẽ lặng lẽ kéo theo bảng không liệt kê — đúng thứ
-- không được phép xảy ra trên prod. Bỏ CASCADE thì Postgres BÁO LỖI kèm tên bảng
-- còn thiếu; lỗi đó là tính năng, không phải trục trặc.
--
-- ⚠️ HAI DÒNG CÓ THỂ BẠN MUỐN GIỮ, tự cân nhắc rồi xoá khỏi danh sách nếu cần:
--    · "Affiliate"          — danh sách nguồn giới thiệu (BGĐ 31/07). Là DANH MỤC
--                             hay data rác? Muốn giữ thì bỏ tên này khỏi danh sách.
--    · "TrialProgramConfig" — cấu hình chương trình học thử. Muốn giữ thì bỏ ra.
--   (Bỏ ra là an toàn: chúng không bị bảng nào khác trỏ tới bắt buộc.)
TRUNCATE TABLE
  "Affiliate", "Assignment", "AssignmentAttachment", "AssignmentDocument",
  "AssignmentSubmission", "AssignmentSubmissionFile", "Attendance", "AuditLog",
  "Class", "ClassAuditLog", "ClassGroup", "ClassScheduleSlot", "ClassSession",
  "ClassSessionMedia", "ClassSessionPlan", "CommissionLine", "CommissionStatement",
  "ConversationMessage", "ConvertConflict", "CourseCompletion",
  "CourseCompletionRequest", "DomainEvent", "EmailLog", "EmailQueue", "Enrollment",
  "EnrollmentAuditLog", "EvalAnswer", "EvalResponse", "Exam", "ExamAnswer",
  "ExamAttempt", "ExamQuestion", "HomeworkAssignment", "IdempotencyKey",
  "IntegrationLog", "Lead", "LeadActivity", "LeadAssignmentHistory", "LeadAuditLog",
  "LeadChild", "LeadDuplicate", "LeadTask", "LeadTransfer", "LeadTrialHistory",
  "MakeupNeed", "MediaStudentTag", "MessengerConversation", "MessengerMessage",
  "Note", "Notification", "Order", "OrderInstallment", "OrderItem",
  "OrderStatusHistory", "OtpDeliveryLog", "OtpRequest", "ParentFeedback",
  "ParentRequest", "Payment", "PermissionGrantAuditLog", "ProductMovement",
  "ProgressReportLog", "RbacAuditLog", "RbacShadowDiff", "Receipt", "RefundRequest",
  "ReportCard", "ReportCardScore", "RoleAuditLog", "SataCoinTransaction",
  "ScormAccessLog", "ScormAttempt", "StaffNotification", "Student",
  "StudentAuditLog", "StudentCareTask", "StudentCenterHistory", "StudentConsent",
  "StudentReserve", "StudentRiskAlert", "StudentSessionFeedback",
  "StudentSkillAssessment", "StudentTransferRequest", "SubmissionRubricScore",
  "SurveyResponse", "TrialAttendance", "TrialClass", "TrialClassSession",
  "TrialClassV2", "TrialEnrollment", "TrialFeedback", "TrialProgramConfig",
  "UserAuditLog", "VoucherRedemption", "WebhookDelivery", "WorkRequest",
  "ZaloMessageLog"
RESTART IDENTITY;

-- ── C4. Gắn lại ràng buộc vừa gỡ, Y NGUYÊN định nghĩa cũ ───────────────────
ALTER TABLE "Question"
  ADD CONSTRAINT "Question_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "Assignment"(id)
  ON UPDATE CASCADE ON DELETE CASCADE;

-- ── C5. Tài khoản phụ huynh ────────────────────────────────────────────────
-- Siết 4 lớp để TUYỆT ĐỐI không chạm nhân sự:
--   · không gắn Employee
--   · vai trò chính là PARENT
--   · không giữ vai trò nào khác trong mảng roles (nhân sự có con học tại trung tâm)
--   · không có UserOrgRole nào (ai có phân công tổ chức đều là người của công ty)
DELETE FROM "User" u
WHERE u."employeeId" IS NULL
  AND u."role" = 'PARENT'
  AND NOT EXISTS (SELECT 1 FROM unnest(u."roles") r WHERE r <> 'PARENT')
  AND NOT EXISTS (SELECT 1 FROM "UserOrgRole" uor WHERE uor."userId" = u.id);

-- ── C6. ĐẾM LẠI NGAY TRONG TRANSACTION — nhìn số rồi mới quyết ─────────────
SELECT 'Lead' AS bang, count(*) FROM "Lead"
UNION ALL SELECT 'Student', count(*) FROM "Student"
UNION ALL SELECT 'Order',   count(*) FROM "Order"
UNION ALL SELECT 'Class',   count(*) FROM "Class"
UNION ALL SELECT 'User còn lại (phải khớp số nhân sự ở bước B)', count(*) FROM "User"
UNION ALL SELECT 'Question ngân hàng (phải giữ nguyên số ở bước B)', count(*) FROM "Question"
UNION ALL SELECT 'Course (phải > 0)',        count(*) FROM "Course"
UNION ALL SELECT 'SystemSetting (phải > 0)', count(*) FROM "SystemSetting"
ORDER BY 1;

-- 👉 Số đúng như mong đợi → chạy:  COMMIT;
-- 👉 Có gì lạ              → chạy:  ROLLBACK;
-- KHÔNG đóng tab trình duyệt khi transaction còn mở.

-- COMMIT;
-- ROLLBACK;


-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC D — KIỂM DANH MỤC NỀN CÒN NGUYÊN (chạy SAU khi COMMIT)
-- ═══════════════════════════════════════════════════════════════════════════
-- Mấy bảng này mà về 0 là hỏng chuyện, không phải "dọn sạch".
SELECT 'Course' AS bang, count(*) FROM "Course"
UNION ALL SELECT 'CoursePackage',  count(*) FROM "CoursePackage"
UNION ALL SELECT 'Curriculum',     count(*) FROM "Curriculum"
UNION ALL SELECT 'Lesson',         count(*) FROM "Lesson"
UNION ALL SELECT 'ScormPackage',   count(*) FROM "ScormPackage"
UNION ALL SELECT 'Center',         count(*) FROM "Center"
UNION ALL SELECT 'OrgUnit',        count(*) FROM "OrgUnit"
UNION ALL SELECT 'RoleDef',        count(*) FROM "RoleDef"
UNION ALL SELECT 'RolePermission', count(*) FROM "RolePermission"
UNION ALL SELECT 'UserOrgRole',    count(*) FROM "UserOrgRole"
UNION ALL SELECT 'Employee',       count(*) FROM "Employee"
UNION ALL SELECT 'EmailTemplate',  count(*) FROM "EmailTemplate"
UNION ALL SELECT 'Question',       count(*) FROM "Question"
UNION ALL SELECT 'SystemSetting (⚠️ cấu hình ZNS)', count(*) FROM "SystemSetting"
ORDER BY 1;

-- Ràng buộc đã được gắn lại đúng chưa (phải ra đúng 1 dòng):
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'Question_assignmentId_fkey';


-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC E — SAU KHI DỌN: 3 việc, đừng quên
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ĐĂNG NHẬP LẠI BẰNG MỘT TÀI KHOẢN NHÂN SỰ NGAY. Nếu bước C5 lỡ chạm "User"
--    ngoài dự kiến thì đây là lúc phát hiện, khi còn kịp khôi phục từ bước A.
--
-- 2. SystemSetting giữ nguyên nên cấu hình ZNS còn — vào /tich-hop bấm
--    "Gửi thử ZNS" xác nhận template 616128 vẫn chạy. Cứ thử cho chắc.
--
-- 3. Việc "backfill User.phone" của AUTH-SĐT P5 **tự biến mất** sau lần dọn này:
--    không còn phụ huynh cũ để backfill; mọi tài khoản tạo sau đều đi đường P5
--    nên có `User.phone` ngay từ đầu. Gạch khỏi danh sách việc.
-- =============================================================================
