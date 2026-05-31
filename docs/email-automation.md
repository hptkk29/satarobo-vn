# Email tự động (Cụm A2)

Nền email tự động bằng **Resend** + **hàng đợi** (decouple khỏi transaction nghiệp vụ) + worker/cron retry.
Tái dùng `EmailTemplate` (render theo `code`) — không tạo trùng.

## Thành phần

- Model `EmailQueue` (`status` PENDING/SENT/FAILED, `attempts`, `error`, `scheduledAt`, `sentAt`, `payload`).
- `lib/email/queue.ts`:
  - `enqueueEmail(input)` — chỉ TẠO bản ghi PENDING (gọi an toàn ngoài transaction; **không gửi ngay**).
  - `processEmailQueue(limit)` — worker: render (template theo `templateKey`/`code` HOẶC inline) + gửi + retry.
  - `retryEmailQueueItem(id)` — gửi lại bản FAILED.
- `lib/email/triggers.ts` — enqueue helper cho từng trigger (a→g). **Mỗi email chỉ chứa dữ liệu của CON liên quan.**
- `app/api/cron/email-queue/route.ts` — chạy worker (cron `*/5 * * * *` trong `vercel.json`, auth bằng `CRON_SECRET`;
  admin có `emails:view` cũng chạy thủ công được).

## Trigger phase đầu (`lib/email/triggers.ts`)

| Mã | Trigger | Đã wire |
|---|---|---|
| a | Tài khoản phụ huynh kích hoạt | ✅ `kich-hoat/_actions.ts` (activateAccount) |
| b | Xác nhận đăng ký khoá | ✅ flow chuyển lead (A3) |
| c | Nhắc lịch học/học thử | helper sẵn (dùng cron) |
| d | Nhắc học phí/công nợ | helper sẵn |
| e | Nhận xét mới | ✅ `sessions/[id]/_actions.ts` (saveSessionFeedback) |
| f | Bài tập mới | helper `enqueueNewAssignment` |
| g | Bài đã chấm | helper `enqueueAssignmentGraded` |

> Các helper chưa wire vào event có thể gọi tại chỗ tạo assignment/grade/nhắc — đã chuẩn hoá input.

## Quy tắc an toàn

- **Center scope**: trigger gọi từ action đã gate quyền/cơ sở.
- **Không lộ dữ liệu con khác**: mỗi enqueue nhận 1 recipient + 1 child cụ thể; nội dung chỉ về bé đó.
- **Retry**: lỗi gửi → `attempts++`, lùi lịch 5'; vượt `maxAttempts` (3) → `FAILED`.
- Email đã gửi tạo `EmailLog` → xem ở trang **Email Logs** hiện có.

## Env

```
RESEND_API_KEY=...
RESEND_FROM_EMAIL="Sata Robo <no-reply@satarobo.vn>"
CRON_SECRET=...   # Vercel cron Authorization: Bearer <CRON_SECRET>
```

## Test (không gửi tới địa chỉ thật)

1. Kích hoạt 1 trigger (vd tạo nhận xét) → `EmailQueue` có bản ghi PENDING đúng người nhận.
2. Gọi `/api/cron/email-queue` → bản ghi → SENT (hoặc FAILED nếu thiếu API key) + tạo `EmailLog`.
3. Nội dung chỉ chứa dữ liệu con liên quan.
