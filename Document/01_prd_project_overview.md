# Sata Robo VN — PRD & Project Overview

## 1. Tổng quan dự án (Project Overview)

### 1.1. Mục tiêu dự án
Dự án **Sata Robo VN** là một hệ thống tích hợp toàn diện đóng vai trò là:
*   **Brand Hub**: Trang thông tin chính thức, giới thiệu thương hiệu và các khoá học của Sata Robo.
*   **Admin CMS/CRM**: Hệ thống quản trị nội dung (CMS) kết hợp quản lý quan hệ khách hàng (CRM) và vận hành nội bộ (ERP thu nhỏ) cho cán bộ nhân viên.
*   **Parent Portal (Học viên Portal)**: Cổng thông tin tương tác dành riêng cho phụ huynh để theo dõi lộ trình học tập, chuyên cần, kết quả học tập và giao tiếp với trung tâm.

### 1.2. Vấn đề cần giải quyết
*   **Quản lý Lead (CRM)**: Quy trình thu thập, phân loại, chăm sóc và chuyển đổi lead từ các nguồn (Website, Facebook Webhook, Zalo Webhook, Google Form) còn rời rạc. Cần một quy trình Pipeline 12 bước tự động hoá và tối ưu tỉ lệ chuyển đổi.
*   **Vận hành Lớp học & Học viên**: Quản lý thông tin học sinh, lịch học, điểm danh, học bù, bảo lưu, chuyển lớp và đánh giá năng lực học sinh theo chuẩn giáo dục STEM/Robotics.
*   **Quản lý Nhân sự & Chấm công**: Theo dõi ca làm việc, chấm công bằng QR Code định vị địa lý (Geofencing), phân quyền chi tiết (8 vai trò) và bảo mật thông tin nhạy cảm.
*   **Quản lý Kho & Tài chính**: Theo dõi thiết bị học cụ (ZMRoboKit), nhập xuất tồn kho; quản lý đơn hàng, thanh toán trả góp (tối đa 2 đợt), áp dụng mã giảm giá (Voucher).
*   **Kênh tương tác Phụ huynh**: Cung cấp cổng thông tin trực tuyến giúp phụ huynh cập nhật lịch học, nhận xét từ giáo viên, hình ảnh lớp học thực tế, theo dõi ví điểm thưởng SataCoin và gửi yêu cầu trực tiếp đến trung tâm.

---

## 2. Đối tượng sử dụng & Cấu trúc phân hệ (Stakeholders & System Partition)

### 2.1. Phân hệ trang Web (Sites)
Hệ thống được chia thành 3 subdomains chính phục vụ các đối tượng khác nhau:
1.  **satarobo.vn (Public Marketing)**: Trang công cộng giới thiệu Sata Robo, các khoá học, tin tức tuyển dụng, vinh danh học viên xuất sắc.
2.  **admin.satarobo.vn (CMS/CRM/ERP)**: Phân hệ quản trị nội bộ dành cho nhân viên trung tâm.
3.  **hocvien.satarobo.vn (Parent Portal)**: Phân hệ dành riêng cho Phụ huynh học viên (đăng nhập bằng tài khoản được cấp khi nhập học).

### 2.2. Vai trò người dùng (User Roles & Permissions)
Hệ thống hỗ trợ 8 vai trò (Roles) phân quyền nghiêm ngặt:
*   **SUPER_ADMIN**: Toàn quyền kiểm soát hệ thống, cấu hình nâng cao, xem toàn bộ báo cáo tài chính và audit logs.
*   **CENTER_MANAGER**: Quản lý vận hành toàn bộ hoạt động của một hoặc nhiều cơ sở được gán.
*   **HR**: Quản lý thông tin nhân sự, hợp đồng, ca làm việc, duyệt bảng công và lịch làm việc.
*   **SALES_CSM**: Chăm sóc khách hàng, quản lý và tư vấn Lead, tạo đơn hàng, đăng ký lớp học thử (Trial Class) cho học sinh.
*   **TEACHER**: Xem lịch dạy, thực hiện điểm danh, viết nhận xét buổi học, đánh giá kỹ năng học viên, kiểm tra bài tập/bài thi.
*   **MARKETING**: Quản lý các chiến dịch lead, viết bài tin tức (CMS), vinh danh, quản lý cấu hình SEO và mã giảm giá (Voucher).
*   **ACCOUNTANT**: Quản lý tài chính, xác nhận thanh toán hoá đơn, xử lý công nợ trả góp, quản lý nhập/xuất kho.
*   **PARENT**: Vai trò dành riêng cho phụ huynh trên cổng Portal, không có quyền truy cập vào phân hệ Admin.

---

## 3. Phạm vi tính năng (Product Scope)

### 3.1. Tính năng cốt lõi (In-Scope)
*   **Quản lý Lead (CRM Pipeline)**: Pipeline 12 trạng thái (`NEW` -> `ASSIGNED` -> `CONTACTED` -> `CONSULTING` -> `TRIAL_SCHEDULED` -> `TRIAL_ATTENDED` -> `AWAITING_DECISION` -> `ENROLLED` và các nhánh kết thúc `NO_ANSWER`, `NURTURING`, `LOST`, `DUPLICATE`). Cơ chế tự động phân chia lead (Auto-Assignment) cho Sales theo cơ sở (Round Robin hoặc Close Rate).
*   **Quản lý Học viên & Lớp học**: Quản lý vòng đời học sinh từ lúc học thử, nhập học, chuyển lớp, bảo lưu, hoàn thành khoá học. Quy trình phê duyệt trạng thái lớp học (Planned -> Recruiting -> Pending Approval -> Active -> Completed/Cancelled).
*   **Điểm danh & Học bù (Attendance & Makeup)**: Ghi nhận chuyên cần từng buổi (Present, Absent, Late, Excused). Tự động tạo nhu cầu học bù (`MakeupNeed`) khi học sinh vắng có phép/không phép và xếp lớp bù tự động.
*   **Hệ thống LMS**: Quản lý giáo trình, bài giảng, ngân hàng câu hỏi (5 loại câu hỏi), bài thi trắc nghiệm trực tuyến, nộp bài tập về nhà và chấm điểm theo Rubric 6 tiêu chí Robotics.
*   **Quản lý Kho & Học cụ**: Theo dõi danh mục sản phẩm, bộ kit robot (ZMRoboKit), nhập xuất kho vật lý, kiểm kê kho định kỳ.
*   **Đơn hàng & Thanh toán (Billing & Order)**: Tạo đơn hàng, áp dụng Voucher giảm giá, hỗ trợ thanh toán nhiều đợt (Installment - tối đa 2 đợt), ghi nhận phương thức thanh toán và lịch sử đổi trạng thái đơn hàng.
*   **Quản lý Nhân sự & Chấm công**: Hồ sơ nhân viên, quản lý cấp bậc giáo viên (Rank 1-5). Chấm công bằng cách quét mã QR động đổi liên tục theo thời gian (HMAC OTP) kết hợp kiểm tra toạ độ định vị Geofencing.
*   **Hall of Fame (Vinh danh)**: Trang vinh danh học viên xuất sắc đạt giải thưởng lớn hoặc có đóng góp tích cực tại trung tâm.
*   **Kênh Tương tác & Thông báo**:
    *   Gửi email tự động qua Resend (kết hợp hàng đợi EmailQueue).
    *   Tích hợp Zalo OA gửi tin nhắn chăm sóc khách hàng (ZNS).
    *   Hệ thống điểm thưởng SataCoin cho học viên (tích luỹ từ chuyên cần, bài tập tốt để đổi quà/voucher).
    *   Khảo sát chỉ số hài lòng khách hàng (NPS Survey).

### 3.2. Ngoài phạm vi phát triển (Out-of-Scope)
*   **Mobile App Native**: Hệ thống hoạt động hoàn toàn trên Web Responsive (thiết kế tối ưu cho mobile viewport 375px).
*   **Real-time Chat**: Các trao đổi trực tiếp được thực hiện qua các kênh Zalo/Hotline truyền thống, không tích hợp live-chat tự xây dựng trên web.
*   **Cổng thanh toán tự động (Online Payment Gateway)**: Hiện tại chỉ hỗ trợ xác nhận thanh toán thủ công bằng cách đối soát ngân hàng (Bank Transfer) hoặc Tiền mặt (Cash). Việc tích hợp VNPay/Tingee tự động được hoãn lại ở các giai đoạn sau.
*   **Hệ thống Multi-tenant SaaS**: Hệ thống được thiết kế độc quyền cho Sata Robo VN, không chia sẻ hạ tầng dạng SaaS thương mại cho các trung tâm khác.

---

## 4. Các khoá học & Gói sản phẩm chủ lực (Core Offerings)

### 4.1. Danh mục khoá học
Sata Robo tập trung vào 2 dòng khoá học chính:
1.  **Lập trình Robot (Offline K-9 - Slug: `laptrinhrobot`)**: Học trực tiếp tại cơ sở dành cho học sinh từ lớp 1 đến lớp 9. Chương trình học chia nhỏ từ Sata 1 đến Sata 8 sử dụng các bộ kit lắp ráp chuyên dụng.
2.  **Luyện thi RoboSim (Online + Coaching - Slug: `luyenthirobosim`)**: Khoá học trực tuyến kết hợp với giáo viên kèm cặp, tập trung ôn luyện cho các kỳ thi mô phỏng robot quốc tế và quốc gia.

### 4.2. Gói học phí (Course Packages)
*   Các gói học phí đơn lẻ theo từng cấp độ học: Sata 1, Sata 2, ..., Sata 8.
*   Các gói Combo (ví dụ: Combo Sata 1-3, Combo Sata 4-6) đi kèm chính sách chiết khấu học phí đặc biệt và tặng kèm học cụ ZMRoboKit.

---

## 5. Công nghệ lựa chọn & Lý do (Tech Stack & Rationale)

Hệ thống được phát triển dựa trên bộ công nghệ hiện đại, ổn định và tối ưu hoá cho đội ngũ phát triển tinh gọn:

| Thành phần | Công nghệ lựa chọn | Lý do lựa chọn |
| :--- | :--- | :--- |
| **Core Framework** | Next.js 16 (App Router) | Hỗ trợ Server Components tối ưu SEO, cơ chế Routing mạnh mẽ, tối ưu hóa tốc độ tải trang (ISR/SSR). |
| **UI Library** | React 19 + TypeScript (Strict) | TypeScript đảm bảo type-safe chặt chẽ. React 19 tối ưu hóa hiệu năng render. |
| **Styling** | Tailwind CSS v4 | Build size cực nhẹ, biên dịch nhanh, giúp xây dựng giao diện responsive mobile-first nhanh chóng. |
| **Component Base** | shadcn/ui | Cung cấp các headless components dễ dàng tùy biến giao diện và khả năng truy cập (Accessibility). |
| **Aesthetics (Client)** | Magic UI & Framer Motion | Tạo ra các hiệu ứng micro-animations, border beam mượt mà, tăng trải nghiệm thị giác cao cấp ở trang chủ. |
| **Database** | PostgreSQL (Supabase) | Cơ sở dữ liệu quan hệ mạnh mẽ, hỗ trợ tốt các truy vấn phức tạp của CRM/ERP, tích hợp sẵn trên Supabase. |
| **ORM** | Prisma 5 | Khai báo schema tập trung, tự động tạo migrations an toàn, type-safe hoàn toàn khi kết hợp với TypeScript. |
| **Authentication** | Auth.js v5 (NextAuth) | Bảo mật cao, hỗ trợ cơ chế JWT cookie HTTP-only chống tấn công XSS, phân quyền linh hoạt qua session. |
| **File Storage** | Cloudflare R2 | Giải pháp lưu trữ hình ảnh/tài liệu tương thích S3 với chi phí băng thông ra (egress bandwidth) bằng 0. |
| **Email Service** | Resend | Gửi email marketing và email giao dịch với tốc độ nhanh, tỉ lệ vào inbox cao, API đơn giản sạch sẽ. |
| **Error Tracking** | Sentry | Theo dõi lỗi thời gian thực trên cả client, serverless function và edge middleware. |
| **Rate Limiting** | Upstash Redis | Hạn chế spam lead, brute-force login với cơ chế serverless Redis có độ trễ cực thấp. |

---

## 6. Sơ đồ các bên liên quan (Stakeholder Map)

*   **CEO - Hồ Đắc Phúc**: Người phê duyệt yêu cầu nghiệp vụ cấp cao, định hướng kinh doanh và ngân sách dự án.
*   **Dev Team**: Chịu trách nhiệm thiết kế hệ thống, lập trình phát triển giao diện (Frontend), cơ sở dữ liệu và API nghiệp vụ (Backend), bảo mật và triển khai hạ tầng.
*   **Marketing Team**: Sử dụng hệ thống CMS để đăng tải bài viết, thiết lập Voucher khuyến mãi, theo dõi hiệu quả thu thập Lead từ các nguồn quảng cáo.
*   **Sales & CSM Team**: Đối tượng tương tác chính trên CRM, tiếp nhận Lead tự động phân chia, thực hiện gọi điện tư vấn, xếp lớp học thử và chốt đơn học phí.
*   **Teacher Team**: Sử dụng phân hệ quản trị để xem lịch dạy, điểm danh học sinh, nhận xét bài học và đánh dấu kỹ năng của học sinh.
*   **Parent (Phụ huynh)**: Người sử dụng Cổng Portal để cập nhật thông tin học tập của con em, gửi yêu cầu xin nghỉ hoặc tương tác với trung tâm.

---

## 7. Bối cảnh Kinh doanh & Tên miền cũ (Business Context & Legacy Redirection)

Công ty Cổ phần Công nghệ Giáo dục Sata Robo có trụ sở chính tại Đà Nẵng. Trước khi tích hợp hệ thống đồng nhất này, trung tâm sử dụng hai tên miền độc lập cho hai sản phẩm chính. Để tránh mất mát lượng truy cập SEO lịch sử, hệ thống thực hiện cấu hình redirect vĩnh viễn (301 redirect) tại lớp Middleware Edge (`proxy.ts`):
*   `laptrinhrobot.vn` -> `satarobo.vn/khoa-hoc/laptrinhrobot`
*   `luyenthirobosim.vn` -> `satarobo.vn/khoa-hoc/luyenthirobosim`
