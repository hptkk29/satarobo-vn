# 00 — Điều chỉnh bộ bàn giao cho repo satarobo-vn (chốt 08/08/2026)

> File này là **delta bắt buộc đọc** trước khi thực hiện bất kỳ story nào trong `backlog/`.
> Bộ docs gốc (architecture/flows/permissions/variables/cron/tests) giữ NGUYÊN VĂN bàn giao 07/08 — khi lệch với file này, **file này thắng** vì nó phản ánh hiện trạng repo + 4 quyết định user chốt 08/08 sau spike G2/G4.

## A. Bốn quyết định user chốt 08/08/2026

| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Kênh realtime | **Supabase Realtime Broadcast, private channel** (đúng bàn giao). Xây cầu Auth.js → JWT tự ký (mục B). |
| Q2 | Storage ảnh đính kèm | **Cloudflare R2** (không dùng Supabase Storage). Tái dùng `lib/storage/r2-client.ts` + signed URL sẵn có; **bổ sung kiểm magic bytes** (mẫu: `lib/exams/docx-import.ts:89`). Yêu cầu giữ nguyên: bucket/key private, read URL hạn 5 phút, ảnh của tin đã gỡ → 403. |
| Q3 | Hệ chat cũ `ConversationMessage` | **Thay thế ngay trong Đợt 1**: chuyển tab `/portal/tin-nhan` + `/admin/tin-nhan` sang hệ mới, migrate dữ liệu `ConversationMessage` → `Conversation/Message`, thêm lối vào chat cho site teacher. Đợt 0 KHÔNG đụng hệ cũ. |
| Q4 | Phạm vi đợt chạy | **Đợt 0 rồi dừng nghiệm thu** (US-01 → US-02 → US-05 → US-03 → US-04). Cổng ra: 2 user nhắn nhau qua private channel trên DEV; PH bị gỡ khỏi lớp không đọc được lịch sử. |

## B. Kết quả spike G2 — cầu auth (thay thế giả định A1 của BA)

Repo **không dùng Supabase Auth**: Auth.js v5 (Credentials, session JWT-JWE, secret `NEXTAUTH_SECRET`), `User.id` là **cuid** (không phải UUID), không có `@supabase/supabase-js`. Vì vậy:

- **KHÔNG** dùng `auth.uid()` trong policy (cast cuid → uuid sẽ lỗi). **KHÔNG** thêm cột `User.authId`, **KHÔNG** provision `auth.users`. → US-01 AC5 **bị thay thế** bằng thiết kế dưới.
- Server mint **JWT HS256 ngắn hạn (TTL ≤ 15 phút)** ký bằng `SUPABASE_JWT_SECRET`, claims tối thiểu: `role: "authenticated"`, `sub` (uuid v5 derive từ `User.id` — chỉ để hợp lệ hình thức), **`app_user_id` = `User.id` (cuid)**, `exp`. Endpoint cấp token phải `auth()` trước, và kiểm `tokenVersion` mỗi lần cấp lại (JWT Supabase không tự chết khi force-logout — TTL ngắn là mitigation).
- Policy SELECT trên `realtime.messages` (US-02) viết lại theo claim:
  ```sql
  ... where p."userId" = (select auth.jwt() ->> 'app_user_id')
        and p."leftAt" is null
        and 'conv:' || p."conversationId" = (select realtime.topic())
        and realtime.messages.extension = 'broadcast'
  ```
  (join thẳng `ConversationParticipant.userId`, không cần join bảng `User`.)
- Client subscribe bằng `supabase.realtime.setAuth(<jwt mint>)` + channel `private: true`.
- **Env cần user cấp** (DEV `.env.local` + Vercel env `test`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (2 key này đã có chỗ trống trong `.env.example:181-182`), `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`. ⚠️ DEV và test.satarobo.vn **dùng chung DB dev** → chung 1 project Supabase → chung bộ key; prod là project khác, key khác.
- Dependency mới cần cài: `@supabase/supabase-js` (client + broadcast server-side), `jose` (ký HS256 — hiện chỉ transitive).
- Broadcast phía server: dùng REST endpoint broadcast hoặc supabase-js với service role key — **service role key SERVER ONLY**, cấm bundle client (canary CI: grep build output, `variables.md`).

## C. Kết quả spike G4 — Realtime hiện trạng

- Repo **không có client Realtime nào** → tắt "Allow public access" trên Realtime Settings **an toàn**, không hỏng gì. (Spike G4 coi như XONG.)
- Realtime duy nhất đang chạy = polling 60s ở 2 chuông thông báo (`components/admin/notification-bell.tsx`, teacher bell) — không đụng.

## D. Ánh xạ thuật ngữ docs → repo

| Docs bàn giao | Repo thật |
|---|---|
| vai "QLCS" | `Role.CENTER_MANAGER` (v1) / RoleDef `CENTER_MANAGER` (v2) |
| vai "Sale", `role=SALE` | `Role.SALES_CSM` / RoleDef `CENTER_SALES_CSM` — P0 chat: **mọi endpoint trả 403** |
| vai "Admin HO" | `Role.SUPER_ADMIN` |
| vai "GV" | `Role.TEACHER`; phân công qua `Class.teacherId` / `Class.assistantId` (dạy chéo cơ sở — KHÔNG lọc theo `User.centerId`) |
| vai "PH" | `Role.PARENT`; quan hệ PH→học viên qua `User.children` |
| "Class chuyển sang hoạt động" | `Class.status` sang ACTIVE (xem enum thật trong schema khi làm US-03) |
| bảng `conversation_participant` trong policy mẫu | tên bảng Prisma thật: `"ConversationParticipant"` (PascalCase, có quotes trong SQL) |
| Supabase Storage bucket `chat-attachments` | R2 prefix `chat-attachments/` + signed URL (Q2) |
| Push Web Push/FCM (US-14) | Chưa có hạ tầng (0 service worker/VAPID) — dựng mới ở Đợt 2, chốt công nghệ khi làm US-14 |

## E. Quy ước tích hợp repo (bắt buộc cho mọi story)

1. **Server Actions** qua `defineAction` (`lib/actions/define.ts`) — được miễn phí auth→zod→can→scopedDb→audit. Core thuần test bằng `runAction`.
2. **Action mới phải khai** ở `lib/auth/permissions.ts` (union `Action` + `PERMISSIONS`) → tự vào `ACTION_REGISTRY`; seed RolePermission v2 trong `prisma/seed-roles.ts`. Đề xuất bộ action: `chat:read`, `chat:send`, `chat:announce`, `chat:moderate` (gỡ tin nhóm mình), `chat:admin` (khoá/tra cứu/audit — chỉ SUPER_ADMIN). (Ghi chú B-09 của BA cũ 29/07 "đừng tạo quyền chat:*" đã LỖI THỜI — RBAC v2 nay enforce trên prod, seed v2 + v1 cùng lúc là an toàn.)
3. **Quyền đọc/gửi chat là participant-based** (từ `ConversationParticipant`), không phải center-based. `Conversation` có `centerId` cho truy vấn quản trị nhưng **đặt vào `SCOPE_EXEMPT`** với lý do ghi rõ (DM có `centerId=null`; nếu đưa vào `SCOPED_MODELS` thì null bị hiểu sai). Cách ly cơ sở cho màn admin: filter tay theo `getVisibleCenterIds(actor)`.
4. **Audit** qua `writeAudit({ module: "chat", ... , tx })` — tra cứu của admin ghi audit TRƯỚC khi trả nội dung (F-AUDIT).
5. **Rate limit** qua `lib/rate-limit.ts` (`rateLimit({key:'chat:send:'+userId, max:20, windowMs:60_000})`).
6. **Cron** qua `withCron` (`lib/cron/handler.ts`) + entry `vercel.json` — job đối soát 02:00 VN = `0 19 * * *` UTC.
7. **Side-effect notification** (push/ZNS về sau) đi `publishEvent` outbox — KHÔNG dùng outbox làm kênh đẩy tin realtime (độ trễ 1 phút).
8. **Soft delete + `deletedAt` filter** ở mọi query đọc; không hard delete.
9. TZ: mọi logic "15 phút thu hồi", "quota 10/ngày/lớp" tính bằng mốc UTC thuần (`Date.now()`); riêng "ngày" của quota theo ngày VN — dùng `lib/time/vn.ts`, không `new Date(y,m,d)` trần.
10. Test: unit đặt cạnh source (vitest); bộ ma trận quyền US-05 đặt `tests/chat/` chạy bằng vitest node + `runAction` với actor seed (không cần HTTP); e2e Playwright thêm sau theo pattern `tests/e2e/a0/`. ⚠️ Postgres local trong sandbox máy này hay hỏng — nghiệm thu DB-touching bằng script ZZTEST trên DB dev (xoá sau khi xong) theo quy ước sẵn có; CI mới là nơi chạy đủ.
11. **Đặt tên tránh đụng**: repo đã có `ConversationMessage` (hệ cũ), `ConversationSide`, `MessengerConversation/Message`. Model mới đúng tên bàn giao: `Conversation`, `ConversationParticipant`, `Message`, `MessageAttachment`, `AnnouncementRead` — đều chưa tồn tại, an toàn.

## F. Trạng thái giả định của BA sau spike

| Giả định | Kết quả |
|---|---|
| A1 (User ↔ auth.uid) | SAI như dự đoán → thay bằng thiết kế mục B (custom claim), không backfill |
| A2 (PH có tài khoản) | Luồng cấp TK PH ĐÃ TỒN TẠI trên repo (satarobo.vn/kich-hoat + OTP Zalo + ZNS) → E3 coi như đã chốt: **SĐT + mật khẩu, kích hoạt qua link + OTP**. US-16 hết blocker kỹ thuật; còn lại là vận hành pilot. |
| A3 (query PH-theo-lớp 1 query) | Kiểm bằng EXPLAIN khi làm US-03 (schema có index `Enrollment`/`Student.parentId` sẵn — xác nhận lúc code) |
| A4 (tắt public access an toàn) | ĐÚNG — mục C |
