# Sata Robo VN — Database Design Document

## 1. Hạ tầng Cơ sở dữ liệu & Cấu hình ORM (Database Infrastructure & ORM Config)

Hệ thống sử dụng cơ sở dữ liệu quan hệ **PostgreSQL** chạy trên nền tảng đám mây **Supabase**, được truy cập thông qua ORM **Prisma 5**.

### 1.1. Cấu hình Chuỗi Kết nối (Connection Strings)
Do hạ tầng Vercel chạy serverless, cơ sở dữ liệu cấu hình 2 chuỗi kết nối riêng biệt để tối ưu hoá kết nối và tránh lỗi cạn kiệt tài nguyên:
*   **DATABASE_URL (Runtime)**: Kết nối qua cổng PgBouncer Transaction Pooler (`:6543`), có thêm tham số `?pgbouncer=true`. Sử dụng cho các truy vấn đọc/ghi thông thường của ứng dụng trong môi trường runtime.
*   **DIRECT_URL (Session)**: Kết nối trực tiếp đến database thông qua cổng session pooler (`:5432`), sử dụng riêng cho các tác vụ thay đổi schema cơ sở dữ liệu (Prisma Migrations: `pnpm db:migrate`).
*   *Lưu ý về lỗi Supabase IPv6:* Khi kết nối trực tiếp từ môi trường local không có IPv6, các kết nối trực tiếp qua IPv6 có thể bị lỗi phân giải DNS (AAAA record). Do đó, cấu hình connection strings phải sử dụng IPv4 pooler proxy được cung cấp bởi Supabase để đảm bảo kết nối ổn định.

---

## 2. Sơ đồ Quan hệ Thực thể (Entity Relationship Diagram - ERD)

Dưới đây là sơ đồ Mermaid ERD biểu diễn các domain thực thể cốt lõi trong hệ thống:

```mermaid
erDiagram
    %% Auth & Users
    User {
        string id PK
        string email
        string password
        string role
        string[] roles
        int tokenVersion
        string status
    }
    UserPermissionGrant {
        string id PK
        string userId FK
        string action
        string effect
    }
    User ||--o{ UserPermissionGrant : "overrides"

    %% Core Business & CRM
    Center {
        string id PK
        string name
        string code
        string address
        string geofencePolygon
    }
    Course {
        string id PK
        string name
        string slug
        string category
    }
    Lead {
        string id PK
        string parentName
        string phone
        string status
        string centerId FK
        string courseId FK
        string assignedToId FK
    }
    Center ||--o{ Lead : "receives"
    Course ||--o{ Lead : "interested_in"
    User ||--o{ Lead : "manages"

    %% Students & Academics
    Student {
        string id PK
        string code
        string fullName
        string parentId FK
    }
    Class {
        string id PK
        string code
        string name
        string status
        string courseId FK
        string centerId FK
    }
    Enrollment {
        string id PK
        string studentId FK
        string classId FK
        string status
    }
    User ||--o{ Student : "parent_of"
    Course ||--o{ Class : "follows"
    Center ||--o{ Class : "hosts"
    Student ||--o{ Enrollment : "has"
    Class ||--o{ Enrollment : "registers"

    %% Financial
    Order {
        string id PK
        string code
        string status
        string parentId FK
        float totalAmount
    }
    OrderItem {
        string id PK
        string orderId FK
        string type
        string enrollmentId FK
    }
    Order ||--o{ OrderItem : "contains"
    User ||--o{ Order : "buys"
    Enrollment ||--o{ OrderItem : "billed_via"
```

---

## 3. Chi tiết các Domain Cơ sở dữ liệu (Database Domains & Schemas)

Hệ thống được thiết kế với 17 domain bảng biểu để đáp ứng toàn bộ các yêu cầu vận hành:

1.  **Auth & Users**:
    *   `User`: Quản lý tài khoản (8 vai trò, hỗ trợ đăng nhập đa vai trò qua mảng `roles[]`, phiên bản token `tokenVersion` để hủy session khi đổi mật khẩu/phân quyền, trạng thái hoạt động `status`).
    *   `Account`, `VerificationToken`: Bảng hỗ trợ lưu giữ phiên đăng nhập và mã token xác nhận cho Auth.js.
    *   `UserPermissionGrant`: Lưu giữ cấu hình ghi đè quyền cụ thể từng user (ALLOW/DENY) thay vì chỉ phụ thuộc vào role tĩnh.
2.  **Core Business**:
    *   `Center`: Cơ sở trung tâm (chứa thông tin tọa độ phục vụ geofencing chấm công, mã định danh cơ sở).
    *   `Room`: Phòng học trực thuộc cơ sở.
    *   `Holiday`: Lịch nghỉ lễ của trung tâm để tính công và lịch học tự động.
    *   `Course`: Khoá học (2 dòng khoá học chính: `LAP_TRINH_ROBOT`, `LUYEN_THI_ROBOSIM`).
    *   `CoursePrerequisite`: Điều kiện tiên quyết để được đăng ký học khoá tiếp theo.
    *   `CoursePackage`: Gói sản phẩm bán kèm (Sata 1-8 hoặc các Combo kèm học cụ).
3.  **CRM & Leads**:
    *   `Lead`: Thông tin khách hàng tiềm năng, phễu tư vấn (12 trạng thái), nguồn lead, mã tracking Meta/Google.
    *   `LeadActivity`: Nhật ký chăm sóc (cuộc gọi, cuộc gặp, email).
    *   `LeadTask`: Đầu việc cần xử lý cho lead (gọi lại, đặt lịch học thử).
    *   `LeadDuplicate`: Lưu giữ lịch sử phát hiện trùng số điện thoại trong 90 ngày.
    *   `LeadAssignmentConfig`: Cấu hình phân chia lead tự động cho từng cơ sở (Round Robin, Close Rate).
4.  **Students & Academic**:
    *   `Student`: Hồ sơ chi tiết học viên (thông tin sức khoẻ, trường học phổ thông, người bảo hộ).
    *   `ClassGroup`: Nhóm lớp (lớp gộp).
    *   `Class`: Lớp học (Planned, Recruiting, Pending Approval, Active, Completed, Cancelled).
    *   `Enrollment`: Đăng ký học (Studying, Paused, Completed, Withdrew, Transferred).
    *   `Attendance`: Chuyên cần từng buổi dạy (Present, Absent, Late, Excused).
    *   `MakeupNeed`: Quản lý danh sách vắng cần được sắp xếp học bù.
5.  **LMS (Learning Management System)**:
    *   `Curriculum`: Chương trình học cụ thể cho từng khoá.
    *   `Lesson`: Bài học chi tiết trong khoá.
    *   `Question` & `Choice`: Ngân hàng câu hỏi trắc nghiệm/tự luận phục vụ ra đề thi.
    *   `Exam`, `ExamQuestion`, `ExamAttempt`: Đề thi và bài làm thi của học viên.
    *   `Assignment`, `AssignmentSubmission`: Bài tập về nhà và bài nộp của học sinh.
    *   `SubmissionRubricScore`: Bảng chấm điểm bài nộp theo Rubric 6 tiêu chí giáo dục Robotics.
6.  **Teachers**:
    *   `TeacherProfile`: Hồ sơ giáo viên (cấp bậc giáo viên Rank 1-5).
    *   `TeacherCourse`: Danh sách môn học giáo viên được phép giảng dạy.
    *   `ClassSession`: Buổi dạy thực tế (chứa checklist chuẩn bị buổi học).
    *   `StudentSessionFeedback`: Nhận xét của giáo viên dành cho học viên sau buổi học.
    *   `StudentSkillAssessment`: Đánh giá 10 kỹ năng STEM/Robotics của học viên theo chu kỳ học.
7.  **HR & Employee**:
    *   `Employee`: Thông tin nhân sự chi tiết (phòng ban, loại hợp đồng, lương thưởng cơ bản).
    *   `EmployeeCheckin`: Lịch sử checkin/checkout chấm công thông qua QR Code Geofence.
    *   `ShiftRegistration`, `TimesheetAdjustmentRequest`: Đăng ký ca làm việc và yêu cầu sửa bảng công.
8.  **Financial (Tài chính & Hoá đơn)**:
    *   `Order`: Đơn đặt hàng học phí hoặc học cụ (Draft, Pending Payment, Confirmed, Completed, Cancelled).
    *   `OrderItem`: Chi tiết sản phẩm trong đơn (liên kết đa hình đến Enrollment, CoursePackage, Product).
    *   `OrderInstallment`: Quản lý trả góp (tối đa 2 đợt, ngày đáo hạn, số tiền cần đóng).
    *   `PaymentMethod`: Phương thức thanh toán được áp dụng (Tiền mặt, Chuyển khoản).
    *   `Voucher`, `VoucherRedemption`: Mã giảm giá và lịch sử sử dụng voucher.
9.  **Product & Inventory**:
    *   `Product`: Danh mục sản phẩm kinh doanh (Robot kit, phụ kiện lắp ráp).
    *   `InventoryItem`: Chi tiết thiết bị học cụ lưu trữ tại kho của từng cơ sở.
    *   `StockBalance`, `StockMovement`: Báo cáo số dư kho và nhật ký nhập xuất điều chuyển kho.
10. **Content & Marketing (CMS)**:
    *   `News`: Bài viết tin tức trên website.
    *   `Honor`: Danh sách học viên xuất sắc vinh danh tại Hall of Fame.
    *   `TimelineItem`: Cột mốc lịch sử phát triển của Sata Robo.
    *   `JobPosting`, `JobApplication`: Tin tuyển dụng nhân sự và danh sách hồ sơ CV nộp ứng tuyển.
11. **Communication**:
    *   `EmailTemplate`, `EmailLog`, `EmailQueue`: Quản lý gửi email và lịch sử gửi qua Resend.
    *   `ZaloMessageLog`: Lưu trữ lịch sử tin nhắn chăm sóc gửi qua Zalo OA (ZNS).
    *   `OtpRequest`, `OtpDeliveryLog`: Mã xác minh OTP cấp qua email cho phụ huynh đăng nhập.
12. **Student Lifecycle**:
    *   `StudentReserve`: Yêu cầu bảo lưu học tập.
    *   `StudentRiskAlert`: Cảnh báo rủi ro học viên nghỉ học nhiều hoặc sắp hết hạn đăng ký mà không gia hạn.
    *   `StudentCareTask`: Công việc chăm sóc của Sales đối với học viên gặp rủi ro học tập.
13. **Surveys**:
    *   `Survey`, `SurveyQuestion`, `SurveyResponse`: Khảo sát ý kiến phụ huynh (NPS).
14. **Media**:
    *   `ClassSessionMedia`: Hình ảnh/Video lớp học giáo viên đăng lên.
    *   `MediaStudentTag`: Đánh dấu học sinh trong ảnh để gửi thông báo riêng cho phụ huynh của học sinh đó.
15. **Integration**:
    *   `IntegrationConfig`, `IntegrationLog`: Cấu hình và nhật ký đồng bộ dữ liệu với bên thứ ba (như MISA AMIS).
16. **Audit Logs (Nhật ký Thay đổi)**:
    *   Các bảng Audit chuyên biệt (như `UserAuditLog`, `LeadAuditLog`, `ClassAuditLog`, `StudentAuditLog`...) lưu lại snapshot thay đổi dưới dạng JSON (`oldValues` / `newValues`) để phục vụ thanh tra hệ thống.
17. **Utility**:
    *   `Counter`: Tạo số thứ tự tăng dần nguyên tử (atomic counter) để sinh các mã định danh chuẩn hoá (ví dụ: `CS1.HV.26.0001`).

---

## 4. Chiến lược Đánh Index (Indexing Strategy)

Để đảm bảo hiệu năng truy vấn nhanh khi dữ liệu tăng lớn, hệ thống thiết lập các indexes chiến lược trong `schema.prisma`:
*   **Soft Delete Index**: Mọi bảng đều chứa trường `deletedAt`. Các index composite được tạo dạng `@@index([deletedAt, status])` hoặc `@@index([deletedAt, centerId])` để tối ưu các truy vấn lọc bỏ dữ liệu đã xóa tạm.
*   **CRM Lookups**: Đánh index unique trên trường điện thoại của Lead (`@@index([phone])`) để hỗ trợ việc kiểm tra và cảnh báo trùng lead trong vòng 90 ngày.
*   **URL Lookups**: Đánh index unique trên trường slug của các thực thể hiển thị công cộng: `Course.slug`, `News.slug`, `Honor.slug` để truy vấn tĩnh (static generation) chạy ngay lập tức.
*   **Chuyên cần & Lịch học**: Đánh index composite trên `Attendance(studentId, classSessionId)` và `ClassSession(centerId, date)` để tăng tốc độ kết xuất thời khóa biểu trên Portal và bảng điểm danh của Giáo viên.

---

## 5. Quy trình Migration 2 Bước (2-Phase Migration Pattern)

Khi có yêu cầu thay đổi schema của các bảng đang hoạt động trong production (ví dụ: đổi tên cột, cấu trúc lại dữ liệu cũ), dev team bắt buộc phải áp dụng quy trình Migration 2 bước để tránh downtime hệ thống:
*   **Phase A (Deploy Tương thích ngược)**:
    1.  Tạo migration thêm cột mới (cột mới bắt buộc ở chế độ cho phép Null - `Nullable`).
    2.  Giữ nguyên cột cũ để code phiên bản cũ đang chạy trên production không bị lỗi.
    3.  Cập nhật code ứng dụng: đọc/ghi dữ liệu song song vào cả cột mới và cột cũ (sử dụng các helper logic để đồng bộ).
    4.  Chạy script di chuyển dữ liệu (Data Migration Script) để copy toàn bộ dữ liệu từ cột cũ sang cột mới ở background.
*   **Phase B (Dọn dẹp)**:
    1.  Sau 2-3 ngày hệ thống chạy ổn định và 100% dữ liệu cũ đã được chuyển đổi hoàn tất.
    2.  Tiến hành tạo migration thứ hai: xóa bỏ cột cũ, cấu hình cột mới thành `Not Null` (nếu cần).
    3.  Dọn dẹp code ứng dụng: bỏ phần ghi song song, chỉ thao tác trực tiếp trên cột mới.

---

## 6. Dữ liệu mẫu (Seed Data)

Quy trình khởi tạo dữ liệu mẫu sử dụng lệnh `pnpm db:seed` để chạy file `prisma/seed.ts` đảm bảo tính lũy tích (Idempotent Upsert) - chạy nhiều lần không làm hỏng dữ liệu hiện tại:
*   `seed.ts`: Khởi tạo danh sách các cơ sở (Centers), phòng học (Rooms), tài khoản Super Admin mặc định, và cấu hình phân quyền ban đầu.
*   `seed-courses.ts`: Khởi tạo 2 khoá học chính và sơ đồ các cấp độ khoá học kèm theo thông tin bài học mẫu.
*   `seed-teacher-profiles.ts`: Tạo tài khoản giáo viên mẫu và cấu hình cấp bậc giảng dạy.
*   `seed-honors.ts`: Tạo danh sách học viên danh dự mẫu để kiểm tra hiển thị trên Hall of Fame.
