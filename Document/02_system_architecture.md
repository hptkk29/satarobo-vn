# Sata Robo VN — System Architecture Document

## 1. Sơ đồ tổng thể hệ thống (System Topology)

Hệ thống Sata Robo VN sử dụng mô hình **Monolith Serverless** triển khai hoàn toàn trên nền tảng đám mây để đơn giản hoá quản lý hạ tầng, dùng chung Typescript Types trên toàn bộ hệ thống và tăng tốc độ phát triển.

```mermaid
graph TD
    %% Clients
    Browser[Trình duyệt Khách hàng / Nhân viên]

    %% Network & Edge
    Edge[Vercel Edge Network / Middleware proxy.ts]
    
    %% Application Layer (Next.js Serverless)
    SubscriptPublic[Next.js Serverless: app/\(public\)/]
    SubscriptAdmin[Next.js Serverless: app/\(admin\)/admin/]
    SubscriptPortal[Next.js Serverless: app/\(portal\)/portal/]
    APIRoutes[Next.js API Routes / Server Actions]
    
    %% Services & Storage
    Database[(Supabase PostgreSQL Database)]
    Pooler[PgBouncer Connection Pooler :6543]
    R2[Cloudflare R2 File Storage]
    Resend[Resend Email Service]
    Redis[Upstash Redis Rate Limit / Cache]
    Sentry[Sentry Error Tracking Tunnel]

    %% Flow connections
    Browser -->|HTTPS| Edge
    Edge -->|Routing Domain / Rewrite| SubscriptPublic
    Edge -->|Routing Domain / Rewrite| SubscriptAdmin
    Edge -->|Routing Domain / Rewrite| SubscriptPortal
    Edge -->|API Calls / Mutations| APIRoutes
    
    APIRoutes -->|Prisma ORM / Transaction Pooler| Pooler
    Pooler --> Database
    APIRoutes -->|AWS S3 SDK| R2
    APIRoutes -->|Resend REST API| Resend
    APIRoutes -->|Redis SDK / HTTP| Redis
    APIRoutes -->|Error Tunnel /monitoring| Sentry
```

---

## 2. Định tuyến tên miền & Middleware (Domain Routing & Edge Middleware)

### 2.1. Middleware Định tuyến (`proxy.ts`)
Toàn bộ yêu cầu đi qua Edge Middleware (`proxy.ts`) trước khi đến các Serverless Functions. Middleware này đảm nhận:
*   **Host Detection (Nhận diện Host)**: Phân tích Header `Host` để phân loại yêu cầu đến từ subdomain nào:
    *   `satarobo.vn` -> Trang tin tức, giới thiệu công cộng.
    *   `admin.satarobo.vn` -> Hệ thống quản trị nội bộ.
    *   `hocvien.satarobo.vn` -> Cổng Portal học viên.
    *   `localhost` / Môi trường Dev -> Sử dụng tiền tố đường dẫn (Path Prefix) để giả lập: `/admin/*` tương đương subdomain admin, `/portal/*` tương đương subdomain portal.
*   **Route Policy Resolution**: Đọc chính sách định tuyến từ `@/lib/auth/route-policy.ts` để kiểm tra quyền truy cập nhanh dựa trên token JWT có trong Cookie.
*   **Rewrite & Redirect**:
    *   Thực hiện rewrite đường dẫn nội bộ (Internal Rewrite) để Next.js route vào đúng Route Group tương ứng mà người dùng không nhìn thấy trong URL thanh địa chỉ.
    *   Tự động phát hiện 2 domain cũ (`laptrinhrobot.vn`, `luyenthirobosim.vn`) để redirect 301 về đúng trang khoá học tương ứng trên domain chính `satarobo.vn`.

### 2.2. Route Groups trong Next.js App Router
Thư mục `app/` được tổ chức chặt chẽ thành các Route Group độc lập nhằm tách biệt logic, layout và bảo mật:
*   `app/(public)/`: Chứa các trang marketing công cộng của `satarobo.vn`.
*   `app/(admin)/admin/`: Phân hệ quản trị `admin.satarobo.vn`. Việc cấu hình route group này đảm bảo tất cả các trang admin đều nằm sau lớp bảo vệ authentication và phân quyền.
*   `app/(portal)/portal/`: Phân hệ portal dành cho phụ huynh `hocvien.satarobo.vn`.
*   `app/(auth)/`: Chứa trang đăng nhập chung `/login` và các logic liên quan đến Auth.js.
*   `app/(legacy)/`: Chứa mã xử lý chuyển hướng cho các domain cũ hoặc URL cũ.

---

## 3. Cấu trúc các Phân hệ & Trang (Page Map & Modules)

### 3.1. Các trang Công cộng (Public Pages - Subdomain: `satarobo.vn`)
*   ` / `: Trang chủ với banner giới thiệu, đối tác, các tính năng nổi bật của Sata Robo.
*   `/khoa-hoc`: Danh sách khoá học.
*   `/khoa-hoc/[slug]`: Chi tiết khoá học (Lập trình Robot hoặc Luyện thi RoboSim).
*   `/vinh-danh`: Hall of Fame giới thiệu các học viên tiêu biểu.
*   `/tin-tuc`: Trang tin tức, hoạt động, thông tin giáo dục STEM.
*   `/tin-tuc/[slug]`: Chi tiết bài viết tin tức.
*   `/tuyen-dung`: Danh sách tin tuyển dụng nhân sự.
*   `/tuyen-dung/[id]`: Chi tiết tin tuyển dụng và form nộp CV.
*   `/lien-he`: Form liên hệ trực tiếp cho khách hàng.
*   `/ve-chung-toi`: Giới thiệu về ban lãnh đạo, tầm nhìn, sứ mệnh Sata Robo.
*   `/hoc-cu`: Giới thiệu về các bộ học cụ thông minh (ZMRoboKit) được sử dụng.
*   Các trang pháp lý: Chính sách bảo mật, Điều khoản dịch vụ.

### 3.2. Phân hệ Quản trị (Admin Modules - Subdomain: `admin.satarobo.vn`)
Hệ thống Admin chứa 58+ modules vận hành chi tiết:
*   **Tổng quan**: `dashboard` (Báo cáo doanh thu, số lượng học viên hoạt động, trạng thái lead).
*   **CRM & Leads**: `leads` (Danh sách lead, phễu pipeline 12 bước, ghi chú chăm sóc, chuyển giao lead, xếp lớp trial).
*   **Học viên & Đăng ký**: `students` (Hồ sơ học sinh), `enrollments` (Đăng ký khoá học, bảo lưu, chuyển lớp).
*   **Lớp học & Lịch học**: `classes` (Thông tin lớp, lịch học cố định), `sessions` (Buổi học cụ thể trong ngày), `attendance` (Bảng điểm danh, ghi nhận xét).
*   **L LMS & Khảo thí**: `curriculums` (Chương trình học), `questions` (Ngân hàng câu hỏi trắc nghiệm/tự luận), `exams` (Bài kiểm tra định kỳ), `assignments` (Bài tập về nhà), `documents` (Tài liệu tham khảo).
*   **Đơn hàng & Voucher**: `orders` (Quản lý đơn hàng, duyệt thanh toán), `products` (Danh mục sản phẩm, bộ kit), `vouchers` (Mã giảm giá).
*   **Kho & Học cụ**: `inventory` (Nhập kho, xuất kho học cụ, kiểm kê tồn kho).
*   **Nhân sự & Chấm công**: `nhan-su` (Danh sách nhân viên, hợp đồng, chức vụ), `cham-cong` (Bảng công, lịch làm việc, lịch sử Checkin QR).
*   **Cấu hình & Tiện ích**: `users` (Tài khoản người dùng), `centers` (Cơ sở phòng học), `holidays` (Lịch nghỉ lễ), `audit-log` (Nhật ký hành vi hệ thống), `email-templates` (Mẫu email), `settings` (Cấu hình chung hệ thống).

### 3.3. Phân hệ Cổng phụ huynh (Portal Pages - Subdomain: `hocvien.satarobo.vn`)
Giao diện portal đơn giản, mượt mà tập trung vào các tính năng tương tác chính:
*   `lich-hoc`: Xem lịch học trong tuần/tháng, thông tin phòng học, giáo viên phụ trách.
*   `nhan-xet`: Đọc nhận xét chi tiết của giáo viên sau mỗi buổi học.
*   `hinh-anh`: Kho lưu trữ hình ảnh/video thực tế của con em trong lớp học.
*   `hoc-ba`: Bảng tổng hợp kết quả học tập qua từng học kỳ, đánh giá 10 kỹ năng STEM.
*   `bai-tap` & `bai-thi`: Xem danh sách bài tập về nhà cần nộp, kết quả bài thi trắc nghiệm trực tuyến.
*   `hoc-phi`: Tra cứu hoá đơn học phí, trạng thái đóng học phí (đã đóng/trả góp đợt 2).
*   `yeu-cau`: Tạo yêu cầu xin nghỉ học, xin học bù, chuyển lớp hoặc bảo lưu khoá học.
*   `satacoin`: Theo dõi số dư xu tích luỹ, nhật ký giao dịch cộng/trừ xu và danh sách quà tặng đổi xu.

---

## 4. Kiến trúc Component (Component Architecture)

Các components được phân tách rõ ràng để tránh cross-import làm ảnh hưởng hiệu năng và bundle size (được kiểm soát bởi cấu hình ESLint nghiêm ngặt):

```
components/
├── ui/         # [SHARED] Các UI components cơ bản từ shadcn/ui (Button, Input, Table...)
├── magic/      # [CLIENT ONLY] Các components hiệu ứng đặc biệt của Magic UI (Particles, ShimmerButton...)
├── motion/     # [CLIENT ONLY] Các Wrapper Framer Motion cho hiệu ứng cuộn trang, fade-in
├── charts/     # [ADMIN ONLY] Các wrapper Recharts vẽ biểu đồ doanh thu, báo cáo leads
├── admin/      # [ADMIN ONLY] Layout admin, thanh sidebar điều hướng, bộ lọc CRM chuyên dụng
├── public/     # [PUBLIC ONLY] Layout trang marketing, Header, Footer, SEO Meta Pixel
├── honors/     # [PUBLIC ONLY] Các layout trình diễn danh sách vinh danh học viên xuất sắc
├── blog/       # [PUBLIC ONLY] Bộ kết xuất bài viết Markdown, nút chia sẻ mạng xã hội
├── jobs/       # [PUBLIC ONLY] Chi tiết tin tuyển dụng, Form nộp CV đính kèm file
└── seo/        # [SHARED] Trình tạo JSON-LD cấu trúc dữ liệu cho Google Search
```

---

## 5. Chiến lược tối ưu hóa & Mở rộng (Scaling & Performance Strategy)

### 5.1. Vercel Serverless Auto-scale
Next.js API Routes và Server Actions được deploy dưới dạng các hàm Serverless Functions trên Vercel (Region: `hnd1` - Tokyo để giảm thiểu độ trễ mạng về Việt Nam). Hệ thống tự động co giãn (auto-scale) theo lưu lượng truy cập thực tế mà không cần cấu hình cụ thể.

### 5.2. Quản lý Kết nối Database với Connection Pooling
Vì Serverless sinh ra và huỷ liên tục có thể gây nghẽn kết nối (Connection Exhaustion) đến PostgreSQL, hệ thống cấu hình:
*   **DATABASE_URL (Runtime)**: Kết nối qua cổng PgBouncer Transaction Pooler (`:6543`) của Supabase. Connection pooler này giữ kết nối tồn tại lâu dài và chia sẻ cho các serverless function xử lý nhanh giao dịch.
*   **DIRECT_URL (Migrations)**: Kết nối trực tiếp đến database (`:5432`) chỉ sử dụng cho các tác vụ thay đổi schema (Prisma Migrations).

### 5.3. Chiến lược CDN & Caching (Incremental Static Regeneration - ISR)
Để đảm bảo tốc độ tải trang dưới 2.5s (Lighthouse Mobile > 85), hệ thống áp dụng cơ chế ISR:
*   Các trang danh sách khoá học, tin tức, vinh danh được cache tĩnh trên Vercel CDN và revalidate định kỳ:
    *   Trang danh sách: `revalidate = 60` (tự động build lại sau tối đa 60 giây).
    *   Trang chi tiết bài viết/khoá học: `revalidate = 300` (tự động build lại sau tối đa 5 phút).
*   Hình ảnh tĩnh và hình ảnh tải lên được phân phối qua Cloudflare CDN sử dụng tên miền phụ `cdn.satarobo.vn` trỏ về R2 Bucket để giảm tải tối đa cho Next.js server.
