# architecture.md — Module Chat Realtime SataRobo

> **Trạng thái tài liệu: INTENDED-STATE (viết TRƯỚC khi code).** Bộ shipping-artifacts chuẩn được reverse-engineer từ code; ở đây code chưa tồn tại nên bộ này mô tả *ý định* — sau Đợt 1, chạy lại `/document-app` để đối chiếu code thật với bộ này (phương pháp intended-vs-implemented). Mọi lệch phát hiện được là bug hoặc là quyết định phải cập nhật tài liệu.

## Tổng quan

Module chat realtime bên trong satarobo.vn: nhóm lớp (PH + GV + QLCS) và 1-1 GV↔PH. Phạm vi P0 theo gói cắt pre-mortem 07/08: **không** có Sale↔PH, đính kèm chỉ ảnh `jpg/png/webp`, push không gộp.

**Giả định then chốt** (nguồn: PRD mục 7.4): PH sẽ được cấp tài khoản trong thời gian gần — release bật theo lớp, cổng ≥70% kích hoạt. Định danh cấp tài khoản (E3: SĐT+OTP hay email) **chưa chốt** — là blocker của US-16.

## Tech stack

| Tầng | Công nghệ |
|---|---|
| App | Next.js 16 App Router, một app duy nhất trên Vercel |
| Nghiệp vụ | Server Actions (không có backend tách riêng) |
| DB | Supabase Postgres, truy cập qua Prisma |
| Realtime | Supabase Realtime **Broadcast**, private channel — KHÔNG dùng Postgres Changes |
| Storage | Supabase Storage, bucket private `chat-attachments` |
| Jobs | Vercel Cron (job đối soát đêm) |
| Push | Web Push / FCM (chốt khi làm US-14) |

## Luồng auth & claims

1. User đăng nhập → Supabase Auth phát JWT chứa `auth.uid()`.
2. Bảng `User` của app ánh xạ qua cột `User.authId` (unique) — **điều kiện tồn tại của mọi policy RLS chat** (spike G2).
3. Server Actions xác thực session server-side; **toàn bộ RBAC nghiệp vụ nằm ở tầng application** (Prisma + guard trong Server Action).
4. RLS **chỉ** dùng cho một chỗ: policy SELECT trên `realtime.messages` để chặn subscribe channel. Không có RLS trên bảng nghiệp vụ chat ở P0 — client không bao giờ query trực tiếp các bảng đó.

## Trust boundaries

| # | Ranh giới | Đi qua bằng | Kiểm soát |
|---|---|---|---|
| TB1 | Browser → Server Action | HTTPS + session | Guard participant + rate limit tại từng action |
| TB2 | Browser → Supabase Realtime (subscribe) | WebSocket + JWT | Private channel + RLS SELECT trên `realtime.messages`; **"Allow public access" phải TẮT** — bật lại là vô hiệu toàn bộ (canary: TS-02.5) |
| TB3 | Server → Realtime (broadcast) | Service role key | Chỉ server giữ key; client không có quyền INSERT nên không tự phát tin |
| TB4 | Browser → Storage | Signed URL | Upload URL cấp sau kiểm quyền/mime/size; read URL hạn 5 phút |
| TB5 | Vercel Cron → app | Cron secret header | Job đối soát xác thực bằng secret, idempotent |

## Rủi ro đã biết / chấp nhận

| Rủi ro | Vị trí trong thiết kế | Mức |
|---|---|---|
| Quyền Realtime cache theo connection: người vừa bị gỡ vẫn nhận broadcast tới khi ngắt kết nối | flows.md F-KICK; mitigation `participant.removed` + API lịch sử chặn ngay; độ trễ đo ở TS-11.4 | Chấp nhận, có số liệu |
| Broadcast fire-and-forget, có thể rớt | NT1: DB là nguồn sự thật; client reconcile bắt buộc (US-07) | Đã xử lý bằng thiết kế |
| Bus factor = 1 (chỉ Kiệt) | Bộ test ma trận US-05 đóng vai người review thứ hai; CI chặn merge | Giảm nhẹ, không triệt tiêu |
| Ảnh trẻ em có định danh trong hệ thống | TB4 + soft delete + trang chính sách (US-16); quy trình xử lý yêu cầu xoá: **chưa có** — fast-follow T6 | Mở, có kế hoạch |
| Drift thành viên do luồng quên gọi sync | Job đối soát tự thi hành lệch REMOVE (US-04) | Đã xử lý bằng thiết kế |

## Tài liệu liên quan

- `flows.md` — các luồng chạm quyền/side effect
- `permissions.md` — ma trận quyền tĩnh
- `variables.md` — biến cấu hình & secrets
- `cron.md` — job đối soát đêm
- `tests.md` — bản đồ kiểm chứng (dẫn xuất từ TestScenarios)
- Không gửi email giao dịch → **không có `emails.md`** (thông báo đi push/ZNS, ZNS ở P1)
- Không có route công khai cần SEO trong module chat → **không có `seo.md`**
- Không nhúng agent/LLM/webhook ngoài trong P0 → **không có `automation.md`** (SePay webhook thuộc module thanh toán, ngoài phạm vi bộ docs này)
