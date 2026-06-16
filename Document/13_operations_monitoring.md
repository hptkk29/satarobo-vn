# Sata Robo VN — Operations & Monitoring Document

Tài liệu này đặc tả quy trình vận hành, giám sát lỗi và xử lý sự cố thời gian thực đối với hệ thống Sata Robo VN trên môi trường sản phẩm.

---

## 1. Giám sát lỗi với Sentry (Error Tracking)

Hệ thống tích hợp **Sentry** để theo dõi lỗi phát sinh từ cả phía người dùng (Client-side), máy chủ ứng dụng (Server-side) và lớp máy chủ biên (Edge Network).

### 1.1. Cấu hình tích hợp
*   **Tệp tin cấu hình:**
    *   `sentry.server.config.ts`: Quản lý lỗi phát sinh từ Next.js API Routes và Server Actions.
    *   `sentry.edge.config.ts`: Quản lý lỗi phát sinh từ Edge Middleware (`proxy.ts`).
    *   `instrumentation.ts` & `instrumentation-client.ts`: Khởi chạy Sentry SDK ngay khi ứng dụng bắt đầu khởi động.
*   **Bảo mật mã nguồn (Source Maps):**
    *   Hệ thống cấu hình thuộc tính `deleteSourcemapsAfterUpload: true` trong cấu hình Next.js.
    *   Các tệp tin source maps sẽ được tải lên máy chủ Sentry để hỗ trợ giải mã ngược vị trí lỗi dòng code thô, sau đó sẽ bị xóa bỏ hoàn toàn khỏi bản build production để tránh lộ cấu trúc code gốc cho người dùng.
*   **Cơ chế Sentry Tunneling:**
    *   Các trình duyệt cài bộ chặn quảng cáo (Ad-blockers) thường chặn các gói tin gửi về tên miền của Sentry.
    *   Hệ thống thiết lập đường dẫn Tunnel `/monitoring` đi qua Next.js server để chuyển tiếp dữ liệu lỗi về Sentry dưới dạng cùng nguồn (Same-origin traffic), đảm bảo không bỏ sót lỗi phía client.

---

## 2. Ghi nhật ký Ứng dụng (Application Logging)

*   **Server Logs (Next.js Logs)**:
    *   Sử dụng câu lệnh `console.error` và `console.warn` có cấu trúc tại Server Actions và API Routes để ghi lại dấu vết dữ liệu đầu vào khi gặp lỗi nghiệp vụ hoặc bot phá hoại.
    *   Các dòng log này được Vercel tự động thu thập và hiển thị thời gian thực trên bảng điều khiển Vercel Console.
*   **Nhật ký Kênh truyền thông**:
    *   `EmailLog`: Ghi nhận nhật ký gửi email qua Resend (các trường thông tin bao gồm: trạng thái `SENT`/`FAILED`, thời gian gửi, số lần thử lại, chi tiết lỗi nếu thất bại).
    *   `ZaloMessageLog`: Lưu trữ lịch sử tin nhắn ZNS gửi đi thông qua hệ thống Zalo OA.
*   **Đường ống Audit Trail (Kiểm toán nội bộ)**:
    *   Lưu trữ lịch sử thay đổi của 10+ thực thể cơ sở dữ liệu quan trọng.
    *   Hệ thống cung cấp trang quản trị `/admin/audit-log` cho phép người dùng có quyền `SUPER_ADMIN` tra cứu hoạt động chỉnh sửa dữ liệu của nhân viên.
    *   *Thời gian lưu trữ (Retention Policy):* Lưu giữ vô thời hạn. Bản ghi audit log chỉ bị xoá khi thực thể cha (ví dụ: lead, học sinh) bị xóa vĩnh viễn khỏi hệ thống (xóa cascade).

---

## 3. Giám sát Cơ sở dữ liệu & Lưu trữ (Database & Storage Monitoring)

*   **Supabase Dashboard (Database)**:
    *   *Giám sát kết nối:* Theo dõi số lượng kết nối đồng thời và tỷ lệ sử dụng PgBouncer connection pooler để tăng dung lượng pool kịp thời nếu có đột biến traffic.
    *   *Hiệu năng truy vấn:* Sử dụng công cụ phân tích truy vấn chậm (Slow Query Analysis) để phát hiện và bổ sung indexes phù hợp cho database.
    *   *Prisma Client Cache:* Khi có thay đổi schema database và chạy migration, bắt buộc phải khởi động lại máy chủ phát triển (Dev server) để Prisma Client cập nhật cache types mới nhất trong bộ nhớ RAM, tránh lỗi stale client.
*   **Cloudflare R2 (Storage)**:
    *   Theo dõi băng thông (Bandwidth), dung lượng lưu trữ tệp tin và số lượng yêu cầu tải lên qua bảng điều khiển Cloudflare.

---

## 4. Báo cáo Tình trạng Hệ thống (Uptime & Health Status)

*   **Web Vitals & Performance**:
    *   Tận dụng công cụ Vercel Analytics để theo dõi chỉ số tương tác thực tế của người dùng: LCP (tốc độ tải), CLS (bố cục ổn định), FID (độ trễ tương tác đầu tiên).
*   **Không tự xây dựng endpoint Health Check**:
    *   Hệ thống không sử dụng các API kiểm tra sức khoẻ tự chế để giảm tải xử lý cho serverless functions.
    *   Uptime và tính sẵn sàng của hệ thống được giám sát gián tiếp qua cơ chế giám sát tự động của Vercel (Uptime monitoring) và cảnh báo tỷ lệ lỗi đột biến trên Sentry.

---

## 5. Quy trình ứng phó Sự cố (Incident Response Runbook)

Khi phát hiện hệ thống gặp sự cố nghiêm trọng (Lỗi 500 hàng loạt, lỗi dữ liệu, sập trang web):

```
       [ Phát hiện sự cố qua Sentry / Feedback Khách hàng ]
                                │
                                ▼
         [ Đánh giá mức độ & Xác định nguyên nhân lỗi ]
                                │
       ┌────────────────────────┴────────────────────────┐
       ▼ (Lỗi do phiên bản Deploy mới)                   ▼ (Lỗi do sai dữ liệu DB)
[ Nhấn Instant Rollback trên Vercel ]          [ Chạy Supabase PITR Khôi phục ]
       │                                                 │
       └────────────────────────┬────────────────────────┘
                                ▼
          [ Deploy bản vá nóng sửa lỗi & Xác minh ]
```

1.  **Rollback mã nguồn**: Nếu sự cố xảy ra ngay sau một đợt deploy phiên bản mới, tiến hành nhấn nút **Instant Rollback** trên Vercel Dashboard để đưa ứng dụng về phiên bản chạy ổn định trước đó trong vòng dưới 10 giây.
2.  **Khôi phục Cơ sở dữ liệu (Supabase PITR)**: Nếu dữ liệu bị hỏng hàng loạt do lỗi script di chuyển dữ liệu hoặc thao tác xóa nhầm, Kỹ sư hệ thống sử dụng tính năng Point-in-Time Recovery trên Supabase để khôi phục trạng thái database về thời điểm chính xác trước khi xảy ra sự cố.
3.  **Hủy kích hoạt các phiên làm việc (Session Revocation)**: Nếu nghi ngờ có rò rỉ khóa bảo mật JWT hoặc tài khoản bị xâm nhập, thực hiện chạy script tăng `tokenVersion` của toàn bộ người dùng trong DB để ép buộc tất cả thoát phiên đăng nhập ngay lập tức.
