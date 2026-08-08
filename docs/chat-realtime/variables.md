# variables.md — Biến cấu hình & secrets

> Tên biến là dự kiến — chốt tên thật khi code, nhưng **scope và rủi ro** dưới đây là ràng buộc thiết kế.

| Biến | Dùng bởi | Scope | Nguồn | Xoay khi | Rủi ro nếu lộ |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | **client OK** | Vercel env | — | Thấp (public by design) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (hoặc `sb_publishable_...`) | client subscribe realtime | **client OK** | Vercel env | Khi Supabase deprecate key cũ (cuối 2026) | Thấp — mọi quyền chặn bằng RLS/private channel, **với điều kiện "Allow public access" TẮT** |
| `SUPABASE_SERVICE_ROLE_KEY` (hoặc `sb_secret_...`) | server broadcast (TB3), cấp signed URL | **SERVER ONLY — tuyệt đối không bundle client** | Vercel env (encrypted) | Ngay khi nghi lộ | **Nghiêm trọng nhất**: đọc/ghi toàn DB, phát broadcast giả vào mọi nhóm |
| `DATABASE_URL` | Prisma | server only | Vercel env | Theo sự cố | Nghiêm trọng — toàn DB |
| `CRON_SECRET` | xác thực Vercel Cron → job đối soát | server only | Vercel env | 6 tháng/lần | Trung bình — kích hoạt job trái phép (job idempotent nên thiệt hại giới hạn, nhưng lệch REMOVE tự thi hành có thể bị lạm dụng → job phải kiểm secret TRƯỚC mọi việc) |
| `PUSH_*` (VAPID/FCM key) | server gửi push | server only (public key client OK) | Vercel env | Theo sự cố | Trung bình — push giả mạo thương hiệu |
| `RATE_LIMIT_*` (nếu tách config) | Server Actions | server | env/hằng số | — | Thấp |

## Xác nhận bắt buộc trước go-live

- [ ] `grep` build output: không chuỗi `service_role`/`sb_secret` nào trong bundle client (đưa vào CI như một bước — kinh nghiệm từ đợt quét secret LandingPageQuaTang)
- [ ] "Allow public access" trên Realtime Settings: **TẮT** ở cả DEV, staging, PROD — kiểm bằng canary test TS-02.5, không kiểm bằng mắt
- [ ] Bucket `chat-attachments`: private, không có policy public read
- [ ] DEV và PROD dùng hai bộ key hoàn toàn tách (đã tách org từ 16/07 — xác nhận không có env trỏ chéo)
- [ ] `CRON_SECRET` đặt trên PROD trước khi bật cron (job chạy không secret phải fail đóng, không fail mở)
- [ ] Không secret nào hardcode trong repo (quét lại bằng công cụ đã dùng đợt 27/07)

## Ứng phó sự cố

Thứ tự xoay khi nghi lộ: `SUPABASE_SERVICE_ROLE_KEY` → `DATABASE_URL` → `CRON_SECRET` → push keys. Sau xoay service role: redeploy Vercel ngay (key cũ chết theo build cũ), kiểm broadcast còn chạy (TS-12).
