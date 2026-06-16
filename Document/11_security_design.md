# Sata Robo VN — Security Design Document

Tài liệu này đặc tả kiến trúc bảo mật toàn diện của hệ thống Sata Robo VN, bảo vệ dữ liệu khách hàng và đảm bảo tính tuân thủ vận hành.

---

## 1. Cơ chế Xác thực (Authentication - AuthN)

*   **Auth.js v5 (NextAuth)**: Hệ thống sử dụng thư viện Auth.js v5 cấu hình chế độ **JWT Strategy** (mã hóa cookie phiên làm việc thay vì lưu phiên trong database) để giảm thiểu tải truy vấn DB và tương thích tốt với môi trường serverless.
*   **Credentials Provider (Đăng nhập mật khẩu)**:
    *   Tài khoản đăng nhập bằng Email và Password.
    *   Mật khẩu được mã hoá và đối soát thông qua thuật toán băm bảo mật **bcrypt** ở phía máy chủ.
    *   *Cookie bảo mật:* JWT được mã hoá và lưu trữ trong Cookie dạng `HTTP-only`, kích hoạt thuộc tính `Secure` (chỉ gửi qua HTTPS) và `SameSite=Lax` để chống các cuộc tấn công CSRF và XSS đánh cắp token.
*   **trustHost: true**: Cấu hình bắt buộc khi triển khai trên Vercel với tên miền tuỳ chỉnh để bảo vệ tính hợp lệ của header host chuyển tiếp.
*   **Token Version Rotation (Thu hồi phiên làm việc)**:
    *   Mỗi tài khoản `User` trong database chứa một trường số nguyên `tokenVersion` (mặc định = 1).
    *   Khi người dùng thay đổi mật khẩu hoặc quản trị viên thay đổi phân quyền của user đó, trường `tokenVersion` trong DB được tăng lên 1 đơn vị.
    *   Tại mỗi request, layout component (RSC) đối soát `tokenVersion` trong JWT của cookie với giá trị thực tế trong DB. Nếu không khớp, session lập tức bị huỷ bỏ, ép buộc người dùng phải đăng nhập lại để nhận token mới.
*   **Trạng thái tài khoản (Account Statuses)**:
    *   `PENDING_ACTIVATION`: Tài khoản phụ huynh mới đăng ký tự động trên web, đang chờ kích hoạt bằng mã OTP gửi qua Email.
    *   `ACTIVE`: Tài khoản hoạt động bình thường.
    *   `DISABLED`: Tài khoản bị khóa tạm thời hoặc vĩnh viễn, chặn hoàn toàn quyền đăng nhập.
*   **Dịch vụ OTP (One-Time Password)**:
    *   Mã OTP gồm 6 chữ số ngẫu nhiên được băm bằng thuật toán **HMAC-SHA256** kết hợp khóa bí mật trước khi lưu vào bảng `OtpRequest` (không lưu mã OTP dạng văn bản thô).
    *   Giới hạn tối đa 5 lần thử nhập sai (`maxAttempts = 5`), quá số lần mã OTP lập tức hết hiệu lực.
    *   Kênh gửi OTP hiện tại sử dụng email (`EMAIL`), kênh SMS được chuẩn bị sẵn cấu trúc để tích hợp sau.

---

## 2. Cơ chế Phân quyền (Authorization - AuthZ)

Hệ thống triển khai mô hình phân quyền kết hợp **RBAC (Role-Based Access Control)** và **Per-User Overrides** (Quyền ghi đè theo từng tài khoản cụ thể).

### 2.1. Ma trận Phân quyền mặc định (Default Role Matrix)
Hệ thống quản lý hơn 100+ hành động nghiệp vụ. Dưới đây là bảng tóm tắt quyền hạn mặc định của các vai trò chính:

| Nhóm chức năng | Hành động nghiệp vụ | SUPER_ADMIN | CENTER_MANAGER | HR | SALES_CSM | TEACHER | ACCOUNTANT |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **CRM / Leads** | Xem danh sách leads | X | X | | X | | |
| | Sửa thông tin leads | X | X | | X | | |
| | Xoá leads (Soft Delete) | X | X | | | | |
| **Học viên** | Xem hồ sơ học viên | X | X | | X | X | X |
| | Cập nhật hồ sơ học viên | X | X | | X | | |
| **Lớp học** | Tạo lớp học mới | X | X | | | | |
| | Phê duyệt mở lớp | X | X | | | | |
| | Điểm danh / Nhận xét | X | | | | X | |
| **Tài chính** | Tạo đơn hàng (Order) | X | X | | X | | |
| | Duyệt thanh toán đơn | X | | | | | X |
| **Nhân sự** | Quản lý thông tin nhân viên | X | | X | | | |
| | Duyệt bảng chấm công | X | | X | | | |

*   **PARENT (Phụ huynh)**: Tuyệt đối không có bất kỳ quyền nào trong bảng quản trị Admin. Chỉ được phép truy cập cổng Portal tại subdomain `hocvien.satarobo.vn` để đọc thông tin của con em mình.

### 2.2. Bảo vệ thông tin nhạy cảm (PII & Field-Level Visibility)
Hệ thống kiểm soát hiển thị thuộc tính của nhân viên (`Employee`) và học viên ở mức độ trường dữ liệu (Field-level):
*   **Thông tin cơ bản (basic)**: Họ tên, ảnh đại diện, chức vụ, phòng ban -> Cho phép tất cả nhân viên xem.
*   **Thông tin liên hệ (contact)**: Số điện thoại, email cá nhân -> Chỉ cho phép `SUPER_ADMIN`, `CENTER_MANAGER`, và `HR` xem.
*   **Thông tin lương thưởng (salary)**: Lương cơ bản, phụ cấp, tài khoản ngân hàng -> Chỉ cho phép `SUPER_ADMIN`, `HR`, và `ACCOUNTANT` xem.
*   **Thông tin cá nhân nhạy cảm (personal)**: Số CCCD/Passport, ngày cấp, địa chỉ thường trú -> Chỉ cho phép `SUPER_ADMIN` và `HR` xem.

---

## 3. Bảo mật lớp Middleware (`proxy.ts`)

Middleware chạy ở mức Edge Network đóng vai trò là chốt chặn đầu tiên:
*   **Chặn truy cập chéo (Cross-access prevention)**: Nếu người dùng đăng nhập có cookie session hợp lệ nhưng chứa vai trò `PARENT` cố tình truy cập vào đường dẫn `/admin/*` của trang quản trị, middleware sẽ lập tức thực hiện redirect về `/portal`.
*   **Phòng thủ chiều sâu (Defense-in-depth)**:
    1.  *Lớp 1 (Edge Middleware):* Kiểm tra tính hợp lệ của cấu trúc JWT cookie.
    2.  *Lớp 2 (Layout RSC):* Thực hiện gọi database kiểm tra trạng thái hoạt động thực tế (`isActive`) và so khớp phiên bản token (`tokenVersion`).
    3.  *Lớp 3 (Server Actions / APIs):* Gọi hàm xác thực quyền hạn `assertCan()` ngay tại server trước khi thực hiện bất kỳ thay đổi dữ liệu nào.

---

## 4. Tuân thủ tiêu chuẩn bảo mật OWASP Top 10

Hệ thống thiết kế tuân thủ nghiêm ngặt các khuyến nghị bảo mật của OWASP:

*   **A01: Broken Access Control (Lỗi kiểm soát truy cập)**: Phòng ngừa bằng cơ chế xác thực 3 lớp đã nêu ở mục 3 kết hợp với hàm kiểm tra phân quyền `assertCan` trong tất cả Server Actions.
*   **A02: Cryptographic Failures (Lỗi mã hóa)**:
    *   Toàn bộ mật khẩu lưu dưới dạng mã băm bcrypt.
    *   Mã OTP lưu dưới dạng mã băm HMAC-SHA256.
    *   Ép buộc sử dụng HTTPS trên toàn hệ thống (cấu hình SSL tự động qua Vercel & Cloudflare).
*   **A03: Injection (Tấn công chèn mã)**:
    *   Sử dụng Prisma ORM thực hiện truy vấn tham số hoá (Parameterized Queries), triệt tiêu hoàn toàn nguy cơ SQL Injection. Tuyệt đối cấm sử dụng `$queryRawUnsafe` để nối chuỗi SQL thô.
    *   Xác thực kiểu dữ liệu đầu vào nghiêm ngặt bằng Zod schemas.
*   **A05: Security Misconfiguration (Cấu hình sai bảo mật)**:
    *   Bảo vệ các tệp tin cấu hình môi trường bằng pre-commit hooks.
    *   Cấu hình `X-Robots-Tag` chặn crawler index trang admin.
    *   Xóa bỏ các tệp tin mã nguồn bản đồ (Source Maps) sau khi upload lên Sentry để tránh lộ mã nguồn thô ở trình duyệt client.
*   **A09: Security Logging and Monitoring (Thiếu nhật ký bảo mật)**: Triển khai 10+ bảng Audit Logs ghi nhận toàn bộ lịch sử thay đổi dữ liệu kèm theo thông tin định danh nhân sự thực hiện thao tác.
