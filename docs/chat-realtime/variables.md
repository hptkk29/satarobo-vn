# variables.md — Biến cấu hình & secrets

> **Cập nhật 09/08/2026 sau bước đối chiếu intended-vs-implemented.** Bản gốc 07/08 ghi
> "tên biến là dự kiến"; nay đã có code nên bảng dưới là **tên thật đang dùng**, kèm
> file đọc nó. Ba biến từng thiếu hẳn (`SUPABASE_JWT_SECRET`, `R2_*`, `R2_CHAT_BUCKET_NAME`)
> đã bổ sung — thiếu chúng trong sổ đăng ký nghĩa là khi có sự cố không ai biết phải xoay gì.

| Biến | Dùng bởi | Scope | Nguồn | Xoay khi | Rủi ro nếu lộ |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server (`lib/chat/supabase-client.ts`) | **client OK** | Vercel env | — | Thấp (public by design) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client subscribe realtime | **client OK** | Vercel env | Khi Supabase deprecate key cũ (cuối 2026) | Thấp — quyền chặn bằng RLS + private channel, **với điều kiện "Allow public access" TẮT**. ⚠️ Từ 09/08 mọi bảng `public` đã bật RLS deny-all (migration `20260809140000`), trước đó 31 bảng hở. |
| **`SUPABASE_JWT_SECRET`** | server mint JWT realtime cho client (`lib/chat/realtime-token.ts`) | **SERVER ONLY** | Vercel env (encrypted) | Ngay khi nghi lộ | **Nghiêm trọng ngang service role**: ký được JWT bất kỳ với claim `app_user_id` tuỳ ý ⇒ mạo danh mọi user để subscribe mọi hội thoại, và là credential hợp lệ cho toàn bộ Data API dưới role `authenticated`. |
| `SUPABASE_SERVICE_ROLE_KEY` | server broadcast (TB3) — `lib/chat/broadcast.ts` | **SERVER ONLY — tuyệt đối không bundle client** | Vercel env (encrypted) | Ngay khi nghi lộ | **Nghiêm trọng nhất**: đọc/ghi toàn DB, phát broadcast giả vào mọi nhóm |
| `DATABASE_URL` / `DIRECT_URL` | Prisma (`lib/db.ts`); script/cron đi `DIRECT_URL` | server only | Vercel env | Theo sự cố | Nghiêm trọng — toàn DB |
| **`R2_CHAT_BUCKET_NAME`** | kho ảnh chat (`lib/storage/chat-storage.ts`) | server only | Vercel env | Theo sự cố | Trung bình. ⚠️ **PHẢI là bucket RIÊNG**: không Public Access, không custom domain, không bật cả URL `r2.dev`. Điền trùng `R2_BUCKET_NAME` → code **từ chối** (503) chứ không âm thầm dùng bucket công khai. |
| `R2_ACCOUNT_ID` · `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` | ký signed URL R2 (dùng chung với SCORM/media) | server only | Vercel env | Theo sự cố | Nghiêm trọng — toàn bộ kho file |
| `R2_BUCKET_NAME` · `R2_PUBLIC_URL` | kho media **CÔNG KHAI** (SCORM, ảnh lớp, honors) | server only | Vercel env | — | ⚠️ Bucket này phát công khai qua `R2_PUBLIC_URL`. **Ảnh chat KHÔNG được nằm ở đây** — xem mục "Bài học" bên dưới. |
| `CRON_SECRET` | xác thực Vercel Cron → job đối soát (`lib/cron/auth.ts`) | server only | Vercel env | 6 tháng/lần | Trung bình — kích hoạt job trái phép (job idempotent nên thiệt hại giới hạn, nhưng lệch REMOVE tự thi hành có thể bị lạm dụng → job kiểm secret TRƯỚC mọi việc, đã xác minh 401 khi thiếu/sai) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` (hoặc `KV_REST_API_*`) | rate limit (`lib/rate-limit.ts`) | server only | Vercel env | Theo sự cố | Thấp — mất thì fallback in-memory, rate limit yếu đi chứ không hở dữ liệu |
| `PUSH_*` (VAPID/FCM) | **CHƯA DÙNG** — US-14 thuộc Đợt 2 | server only (public key client OK) | — | — | — |

## Xác nhận bắt buộc trước go-live

Trạng thái tính đến 09/08/2026:

- [ ] `grep` build output: không chuỗi `service_role`/`sb_secret` nào trong bundle client — **CHƯA có bước CI làm việc này**; hiện chỉ đảm bảo gián tiếp bằng `import "server-only"` ở `broadcast.ts`/`realtime-token.ts`/`chat-storage.ts` (bundler nổ nếu client import). Nên thêm một step sau `pnpm build` trong job Quality.
- [x] "Allow public access" trên Realtime Settings **TẮT** — xác minh 09/08 bằng canary TS-02.5 (`scripts/_zztest-chat-us02.ts` bước 5), không kiểm bằng mắt. Canary này đỏ ngay nếu ai bật lại.
- [x] Kho ảnh chat **private, không public read** — từ 09/08 đi bucket riêng `R2_CHAT_BUCKET_NAME`; xác minh bằng ZZTEST US-11 case 6c (URL ký không dính bucket/host công khai) **và** thử `curl` một key `chat-attachments/…` qua tên miền công khai → 404.
- [x] Mọi bảng `public` đã bật RLS — 31 bảng vá ở `20260809140000`, đã lên PROD 09/08. Bảng mới từ nay **phải tự bật RLS trong chính migration tạo bảng** (luật E-bis #3).
- [ ] DEV và PROD dùng hai bộ key hoàn toàn tách — ⚠️ lưu ý: **DB của env `test` CHÍNH LÀ DB dev** (chủ đích, xem CLAUDE.md), nên "tách" ở đây chỉ đúng giữa dev/test và prod.
- [x] `CRON_SECRET` fail-closed — xác minh 09/08: gọi cron trên test thiếu secret → 401, sai secret → 401.
- [ ] Không secret nào hardcode trong repo (quét lại bằng công cụ đã dùng đợt 27/07)

## Ứng phó sự cố

Thứ tự xoay khi nghi lộ: `SUPABASE_SERVICE_ROLE_KEY` → **`SUPABASE_JWT_SECRET`** → `DATABASE_URL` → `R2_SECRET_ACCESS_KEY` → `CRON_SECRET`.
Sau xoay service role hoặc JWT secret: **redeploy Vercel ngay** (key cũ chết theo build cũ), rồi kiểm broadcast còn chạy (TS-12) và client còn subscribe được (TS-02).
⚠️ Xoay `SUPABASE_JWT_SECRET` làm **mọi JWT realtime đang lưu hành chết ngay** — client sẽ rớt kênh và tự xin token mới ở lần re-subscribe kế tiếp; tin nhắn không mất vì reconcile bắt buộc (NT1).

## Bài học đã trả giá — đừng lặp lại

Bản gốc tài liệu này viết "bucket private" như một điều hiển nhiên. Thực tế code đầu tiên ghi ảnh chat vào **đúng bucket đang phát công khai** qua `R2_PUBLIC_URL`; vì signed URL chứa nguyên đường dẫn file, người nhận chỉ cần ghép `https://<tên-miền-công-khai>/<đường-dẫn>` là có bản vĩnh viễn — không chữ ký, không hạn 5 phút, **tải được cả sau khi tin đã bị gỡ**. Ba bảo đảm của F-FILE và US-12 AC5 khi đó chỉ là hình thức.

Bài học: một dòng checklist chưa tick **không** có nghĩa là "sẽ tick sau" — nó có nghĩa là bảo đảm đó **chưa tồn tại**, và mọi thứ xây trên nó đều đang đứng trên giả định sai.
