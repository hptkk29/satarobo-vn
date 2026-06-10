# 05 — Luồng nghiệp vụ chính (end-to-end)

> Các chuỗi nghiệp vụ xuyên admin ↔ BE ↔ portal. Dùng khi cần biết "đụng vào đâu" để thêm tính năng.

## 1. Lead → Enrollment → Buổi học (phễu SR.QD.217)
```
Messenger webhook ─▶ MessengerConversation (idempotent mid, scope theo FacebookPageMapping→center)
   │ lib/crm/messenger-service.ts
   ▼ qualifyConversationToLead()  (L1→L2: SĐT hợp lệ, dedup phone 90d)
Lead (NEW)
   ▼ handoverLead() HO→CS (centerId+handedAt) ─▶ confirmReceived() ─▶ assignSale() ─▶ recordFirstContact()
Lead (ASSIGNED→CONTACTED→CONSULTING→TRIAL→AWAITING_DECISION)
   │  [cron sla-check 15' → StaffNotification nếu quá hạn từng mốc]
   ▼ convertLeadToEnrollment(actor, input)   ⚠️ 1 TRANSACTION (lib/crm/convert-lead.ts)
       Lead→ENROLLED · User(PARENT, PENDING_ACTIVATION, no password) · Student
       · Enrollment · Order(code = nextInvoiceCode, status CONFIRMED nếu đã trả) · writeAudit
   ▼ publishEvent("lead.converted")  [SAU commit]
       → onLeadConverted → enqueueEnrollmentConfirmation (email qua EmailQueue → cron email 5')
```
**Chốt L3 = transaction**, side-effect (email) qua event. Trùng phone lúc convert → `findConvertDuplicates` cảnh báo (UI).

## 2. Tạo lớp + tự sinh buổi học (đặt lịch)
```
/admin/classes/new (ClassForm)
  chọn: course → center → classGroup → room → teacher + assistant → lịch (ngày tuần + giờ) → sức chứa → mã lớp → ngày khai giảng
  ▼ createClass()  → Class (status PLANNED)
  ▼ generateClassSessions(class, curriculum, holidays)
      lib/lms/session-gen.ts generateSessionDates({start, count, weekdays, holidays})
      → sinh ClassSession theo thứ trong tuần, BỎ ngày trùng Holiday (dời sang ngày cùng-thứ tuần sau)
      → mỗi ClassSession gắn lessonId theo thứ tự Lesson của Curriculum (version cố định)
```
- **Curriculum version isolation:** ClassSession trỏ `lessonId` cụ thể → ra giáo trình version mới KHÔNG ảnh hưởng lớp cũ.
- **Trùng lịch/sức chứa:** `lib/lms/scheduling.ts` `detectScheduleConflict` (phòng/GV) + `hasCapacity`.

## 3. Điểm danh → học bù → tiến độ
```
/admin/sessions/[id]  (GV điểm danh)
  ▼ recordAttendance(actor, {sessionId, studentId, status})   lib/lms/attendance-record.ts
      Attendance (PRESENT/ABSENT/LATE/EXCUSED) — SOURCE OF TRUTH
      status=ABSENT → tạo MakeupNeed (PENDING) + Attendance.makeupStatus=NEEDS_MAKEUP + audit (idempotent)
  ▼ saveSessionFeedback(sessionId, [{studentId, comment, rating}])  → StudentSessionFeedback
Học bù: requestMakeup → scheduleMakeup (PENDING→SCHEDULED) → completeMakeup (→COMPLETED)  lib/lms/makeup-service.ts
Tỉ lệ điểm danh: computeAttendanceRate = (present+late)/total   lib/lms/attendance-rate.ts
```
Portal phụ huynh đọc lại: `/portal/lich-hoc` (tiến độ), `/portal/ket-qua`, `/portal/nhan-xet`.

## 4. Bài tập / Bài thi
```
Admin: /assignments/new (gắn lesson + dueAt) · /exams/[id]/builder (+câu hỏi từ Question bank)
Portal: /portal/bai-tap/[id] → submitAssignment({text/file})  → LATE nếu now > dueAt, else SUBMITTED
        /portal/bai-thi/[id] → start → answer → submit (timer, auto-submit hết giờ) → GV chấm → điểm + feedback
Chỉ thấy bài của con đang chọn (requireActiveStudent).
```

## 5. Setup / kích hoạt tài khoản phụ huynh
```
convert-lead tạo User(PARENT, PENDING_ACTIVATION, KHÔNG mật khẩu mặc định)
PH vào hocvien.satarobo.vn → /kich-hoat:
  1. nhập email → requestActivationOtp (OtpRequest, gửi OTP email; chống dò email; cooldown 60s)
  2. nhập OTP + mật khẩu → activateAccount: verifyOtp → bcrypt → accountStatus=ACTIVE → email welcome + audit
  3. → /login → vào portal, chọn con (SiteSwitcher)
```
OTP abstraction: `lib/otp/provider.ts` (EMAIL mặc định; SMS để mở rộng).

## 6. Media + consent (privacy trẻ em)
```
Admin upload ClassSessionMedia (status PENDING→APPROVED) + tag học viên (MediaStudentTag)
  tagStudentToMedia yêu cầu StudentConsent CLASS_MEDIA = GRANTED (lib/lms/media-consent.ts)
Portal /portal/hinh-anh: chỉ hiện media APPROVED + có tag con + consent GRANTED
PH cấp/thu hồi consent → revoke = ẩn ảnh NGAY. studentId không lên URL; object key không chứa tên HS (TTL 900s).
```

## 7. Chấm công nhân viên (HR — geofence CHỈ nhân viên)
```
NV /cham-cong/lich-ca-nhan-vien → saveMyShifts(date, shifts)  → ShiftRegistration
    (>2 ngày = REGISTERED; <2 ngày = LEAVE_REQUESTED khẩn, max 3/tháng)
QL /cham-cong/duyet-ca → approveShiftRegistration → APPROVED
NV /cham-cong/man-hinh (QR cố định cơ sở) → quét + GPS → recordCheckin:
    verifyQrToken(token, centerId) + withinGeofence(gps, center)  (Haversine, 100m)
    → EmployeeCheckin (type, latitude, longitude, distanceMeters, withinGeofence)
    Ngoài bán kính → withinGeofence=false (GHI NHẬN, không chặn cứng — QL xét)
QL /cham-cong (theo ngày) → computeShiftAttendance → OK/LATE/OVERTIME/MISSING_OUT/OUT_OF_GEOFENCE
Chỉnh công: /chinh-cong → TimesheetAdjustmentRequest → duyệt → TimesheetEditLog. Export: shift-excel.
```
> ⚠️ Geofence/định vị **chỉ áp dụng EmployeeCheckin (nhân viên)** — Student KHÔNG có toạ độ (test introspection R5-C3.4).

## 8. Phân quyền & tài khoản
```
SUPER_ADMIN /users/new → User + role → /[id]/edit link Employee → /[id]/permissions override (UserPermissionGrant)
/[id]/org-roles → UserOrgRole (org×role, RBAC v2 — chỉ hiệu lực khi RBAC_V2_ENABLED=true)
/roles → RoleDef + RolePermission (mọi thay đổi audit + reason). Reset password → tokenVersion++ → logout all devices.
```

## 9. Nhắc nợ / email tự động (cron)
- Trả góp đợt 2 ≤14 ngày → `/api/cron/debt-reminder` (Zalo + fallback email).
- Đơn lẻ quá hạn → `/api/cron/order-debt-reminder` (Resend, chống spam 1/ngày).
- Nhắc lịch học (12–48h) · gia hạn (13–15 ngày) · SLA lead (15') · marketing alerts.
