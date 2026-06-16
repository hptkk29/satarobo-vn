# Sata Robo VN — Infrastructure & Operations Spec

## 1. Bản đồ Phân bổ Hạ tầng (Cloud Topology)

Hệ thống được thiết kế dạng **Cloud-native Serverless**, tận dụng tối đa dịch vụ managed SaaS để giảm thiểu gánh nặng quản trị vận hành.

*   **Hosting**: Triển khai trên **Vercel** dưới dạng Next.js Serverless Functions và Edge Middleware.
    *   *Khu vực triển khai (Region):* `hnd1` (Tokyo, Nhật Bản) là lựa chọn tối ưu để giảm thiểu ping time về Việt Nam (khoảng 30-40ms), đảm bảo trải nghiệm sử dụng nhanh nhất cho người dùng trong nước.
*   **Managed Database**: PostgreSQL được cung cấp và quản lý bởi **Supabase**.
    *   Hệ thống sử dụng cổng 6543 để đi qua PgBouncer connection pooler trong môi trường runtime.
*   **File Storage**: Lưu trữ hình ảnh và tài liệu thông qua **Cloudflare R2**.
    *   *Bucket:* `satarobo-uploads`
    *   *Tên miền phân phối (CDN Domain):* `cdn.satarobo.vn` cấu hình DNS qua Cloudflare Edge Caching với egress bandwidth free hoàn toàn.
*   **Email Engine**: Gửi email qua **Resend API**.
    *   *Domain gửi đi:* `@satarobo.vn` (đã xác thực SPF, DKIM và DMARC).
*   **Rate Limiting Service**: Serverless Redis cung cấp bởi **Upstash**.
    *   Sử dụng để tính toán số lần gửi yêu cầu trên mỗi IP (Rate Limiting) và chống tấn công từ chối dịch vụ (DDoS) cấp ứng dụng.
*   **Error & Log Tracking**: Sử dụng **Sentry**.
    *   Cấu hình cơ chế Tunneling qua endpoint `/monitoring` của Next.js nhằm bypass các bộ chặn quảng cáo (Ad-blockers) trên trình duyệt người dùng, đảm bảo bắt được 100% lỗi client-side.

---

## 2. CI/CD & Quy trình Triển khai (CI/CD Pipeline)

Quy trình phát triển và kiểm thử được tự động hoá hoàn toàn thông qua tích hợp GitHub và Vercel:

```
[ Git Push / Merge to 'main' ]
             │
             ▼
[ Vercel Trigger Build ]
             │
             ├─► 1. Run Pre-install hook (pnpm install)
             ├─► 2. Run Database Client Generation (prisma generate)
             └─► 3. Run Production Build (next build)
             │
             ▼
[ Smoke Test Run (E2E Smoke Testing) ]
             │
             ▼
[ Route Traffic to New Serverless Functions (Instant Rollout) ]
```

### Build Command trên Vercel:
`prisma generate && next build`

---

## 3. Các tác vụ nền định kỳ (Cron Jobs - `vercel.json`)

Hệ thống quản lý các cron jobs chạy định kỳ bằng cách đăng ký cấu hình trong file `vercel.json`. Khi deploy, Vercel Edge sẽ tự động trigger các API tương ứng theo đúng thời gian biểu (UTC):

```json
{
  "crons": [
    {
      "path": "/api/cron/class-reminder",
      "schedule": "0 1 * * *"
    },
    {
      "path": "/api/cron/renewal-reminder",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/email-queue",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/debt-reminder",
      "schedule": "0 3 * * *"
    }
  ]
}
```

### Giải nghĩa thời gian biểu và tác vụ:
1.  **class-reminder (`0 1 * * *` - Hằng ngày vào lúc 08:00 AM VN)**:
    *   Tìm các lớp học có buổi học diễn ra vào ngày mai.
    *   Tìm danh sách phụ huynh của các học sinh thuộc lớp đó.
    *   Tạo tin nhắn nhắc lịch học gửi qua ZNS (Zalo Notification Service) hoặc Email.
2.  **renewal-reminder (`0 2 * * *` - Hằng ngày vào lúc 09:00 AM VN)**:
    *   Lọc ra các gói đăng ký học viên (Enrollment) sẽ hết hạn trong vòng 14 ngày tới mà chưa đăng ký khoá học mới.
    *   Gửi thông báo nhắc phụ huynh chuẩn bị tái đăng ký khoá học mới.
3.  **email-queue (`*/5 * * * *` - Mỗi 5 phút một lần)**:
    *   Quét bảng `EmailQueue` tìm các bản ghi có trạng thái `PENDING`.
    *   Tiến hành render template email và gửi đi thông qua Resend.
    *   Cập nhật trạng thái `SENT` hoặc `FAILED` (có hỗ trợ tự động thử lại tối đa 3 lần).
4.  **debt-reminder (`0 3 * * *` - Hằng ngày vào lúc 10:00 AM VN)**:
    *   Tìm các đợt trả góp học phí (`OrderInstallment`) ở trạng thái `PENDING` đã quá hạn thanh toán (`dueDate`).
    *   Gửi thông báo nhắc nợ học phí tự động cho phụ huynh.

---

## 4. Danh sách Biến Môi trường (Environment Variables)

Các biến môi trường bắt buộc cấu hình trên trang quản trị dự án Vercel. Dưới đây là danh sách chi tiết trích từ file `.env.example`:

| Tên biến | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `DATABASE_URL` | String | Chuỗi kết nối Postgres qua PgBouncer Transaction Pooler (Port 6543, pgbouncer=true). |
| `DIRECT_URL` | String | Chuỗi kết nối Postgres trực tiếp đến Supabase (Port 5432, dùng cho migrations). |
| `NEXT_PUBLIC_APP_URL` | String | URL chính thức của ứng dụng (ví dụ: `https://satarobo.vn`). |
| `NEXTAUTH_URL` | String | URL dùng cho Auth.js xác thực session (ở production trỏ về trang đăng nhập chung). |
| `NEXTAUTH_SECRET` | String | Khóa ký mã hóa token JWT sử dụng trong Auth.js (sinh ngẫu nhiên qua openssl). |
| `RESEND_API_KEY` | String | API Key lấy từ trang quản trị Resend để gửi email. |
| `R2_ACCESS_KEY_ID` | String | Access Key ID của Cloudflare R2 Token. |
| `R2_SECRET_ACCESS_KEY` | String | Secret Access Key tương ứng của Cloudflare R2 Token. |
| `R2_BUCKET_NAME` | String | Tên bucket R2 lưu trữ file (`satarobo-uploads`). |
| `R2_ENDPOINT` | String | URL endpoint S3-compatible của Cloudflare R2. |
| `NEXT_PUBLIC_CDN_URL` | String | Tên miền phân phối file công cộng (`https://cdn.satarobo.vn`). |
| `META_PIXEL_ID` | String | Mã ID định danh của Meta Pixel phục vụ tracking quảng cáo. |
| `META_CAPI_TOKEN` | String | Access Token của Meta Conversions API (CAPI) gửi sự kiện từ phía server. |
| `GA4_ID` | String | ID định danh của Google Analytics 4 (G-XXXXXX). |
| `GA4_API_SECRET` | String | API Secret để gửi sự kiện GA4 từ Server qua Measurement Protocol. |
| `UPSTASH_REDIS_REST_URL` | String | Endpoint REST URL của Upstash Redis Serverless. |
| `UPSTASH_REDIS_REST_TOKEN`| String | Token bảo mật tương ứng của Upstash Redis. |
| `SENTRY_DSN` | String | Mã DSN lấy từ project Sentry để bắt lỗi ứng dụng. |
| `ZALO_OA_ID` | String | ID của tài khoản Zalo Official Account. |
| `ZALO_ACCESS_TOKEN` | String | Access Token hoạt động gửi tin nhắn ZNS. |

---

## 5. Chính sách Quản lý Secret & Bảo mật mã nguồn (Secrets Security)

*   **Tuyệt đối cấm commit các file cấu hình môi trường**: File `.env`, `.env.local` hoặc bất kỳ file nào có tiền tố `.env` (ngoại trừ file mẫu `.env.example`) được đưa vào `.gitignore` và bị chặn bởi Git pre-commit hook trước khi đẩy lên GitHub.
*   **Không hardcode thông tin nhạy cảm**: Toàn bộ khoá API, thông tin kết nối cơ sở dữ liệu bắt buộc phải được đọc thông qua biến toàn cục `process.env.X`.
*   **Quản lý key và chứng chỉ ngoại tuyến**: Các chứng chỉ dạng `*.bak`, `*.backup`, `*.key`, `*.pem` bị cấm commit lên repository và được lưu giữ ngoại tuyến an toàn trên các công cụ quản lý key chuyên dụng.

---

## 6. CDN & Cấu hình Phân phối Hình ảnh (CDN Remote Patterns)

Để tăng tốc độ tải trang và bảo mật, Next.js hình ảnh (`next/image`) được cấu hình nghiêm ngặt chỉ cho phép render hình ảnh từ các domains được chỉ định trong file `next.config.ts`:

```typescript
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.satarobo.vn' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'img.youtube.com' }
    ]
  }
}
```

---

## 7. Chiến lược Sao lưu dữ liệu & Khôi phục thảm hoạ (Backup & DR Strategy)

*   **Cơ sở dữ liệu (PostgreSQL)**:
    *   Sử dụng tính năng automated daily backups có sẵn của Supabase (lưu trữ 7 ngày gần nhất).
    *   Kích hoạt Point-in-Time Recovery (PITR) cho phép khôi phục cơ sở dữ liệu chính xác về từng giây khi xảy ra sự cố hỏng dữ liệu hoặc thao tác nhầm lẫn trong production.
*   **Tệp tin lưu trữ (Cloudflare R2)**:
    *   Bật tính năng Versioning trên bucket R2 để lưu giữ lịch sử các phiên bản file tải lên, giúp khôi phục dễ dàng khi người dùng vô tình xoá đè hoặc file bị tấn công phá hoại.
*   **Mã nguồn (GitHub)**:
    *   Mã nguồn lưu giữ trên GitHub Cloud. Bật branch protection trên nhánh `main`, yêu cầu vượt qua linting, typecheck và chạy tests thành công trước khi được phép merge.
