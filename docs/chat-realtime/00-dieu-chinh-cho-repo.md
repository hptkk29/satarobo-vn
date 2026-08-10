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

## E-bis. Luật rút ra từ nghiệm thu từ xa 09/08 (5 bug lọt mọi cổng test)

Cả 5 đều XANH ở `typecheck` + `lint` + `build` + 1644 unit test, chỉ lộ khi chạy thật:

1. **Cấm `export type { X }` (và mọi export không phải async function) trong file `"use server"`.** Server-actions loader sinh export VALUE cho tên chỉ có ở tầng type ⇒ `ReferenceError` lúc eval module ⇒ chết TOÀN BỘ action trong module đó. Nơi cần type thì import thẳng từ file định nghĩa.
2. **Mọi `$transaction` có gọi `syncConversationMembership` phải đặt `{ timeout: 30_000, maxWait: 10_000 }`.** Trần 5s mặc định của Prisma đứt giữa chừng khi tx gánh thêm phần sync (đã vá 22 điểm + cron).
3. **Migration tạo bảng mới trong `public` PHẢI kèm `ENABLE ROW LEVEL SECURITY`.** `20260617000000` là thao tác một lần; bảng sinh sau ra đời RLS tắt trong khi Supabase cấp sẵn anon/authenticated đủ DML. Đo 09/08: 31 bảng hở, đã vá ở `20260809140000`.
4. **Hàm helper SQL không đặt ở schema `public`.** PostgREST phơi hàm schema public thành RPC `/rest/v1/rpc/<tên>`, và `REVOKE ALL FROM PUBLIC` không gỡ grant mặc định của anon/authenticated. Đặt ở `private`, và đừng nhận tham số cho phép hỏi hộ người khác (đọc claim của chính người gọi).
5. **Dẫn xuất thành viên là thao tác MỨC HỆ THỐNG — phải đọc KHÔNG qua scope.** `loadDerivedMembership` từng dùng `tx.student.findMany` trong khi `Student` ∈ `SCOPED_MODELS` và mọi call-site truyền tx của `scopedDb` ⇒ học viên ngoài tầm nhìn actor bị hiểu là "đã rời lớp" ⇒ PH bị GỠ khỏi nhóm + sinh tin SYSTEM sai. Nay đi `tx.$queryRaw` (raw không dính client extension), có chú thích tại chỗ.

## E-ter. Luật rút ra từ ĐO THẬT kênh realtime 10/08 (4 điểm mù, 0 test nào bắt được)

Nguồn số đo: `scripts/_zztest-chat-token-va-lo.ts` (LỖ 3 + LỖ 4) và
`scripts/_zztest-chat-ro-giua-phien.ts` (LỖ 1 + LỖ 2), chạy trên Supabase DEV.
Cả 4 đều XANH ở `typecheck` + `lint` + `build` + toàn bộ unit test — vì unit test của
nhánh realtime là fake-timer + transport giả, còn test broadcast thì `fetch` giả luôn trả 202.

1. **CẤM `realtime.setAuth(jwt)` giữa phiên khi còn kênh đang `joined`.**
   Đo: kênh gọi `setAuth` CHẾT ở nhịp heartbeat kế tiếp (≤25s sau lời gọi) và **không tự hồi**
   (R: setAuth@+25,0s → CLOSED@+40,2s · R3: setAuth@+45,1s → CLOSED@+64,5s trong khi vé gốc
   còn tới +187,4s ⇒ chết sớm 122s). Kênh đối chứng không gọi `setAuth` đi qua đúng các nhịp
   heartbeat đó vẫn SUBSCRIBED 94/94 tick. Nguyên nhân trong thư viện: `_performAuth` đẩy
   `push(access_token)` xuống mọi kênh `joined` khi giá trị token đổi.
   ⇒ Đổi vé là thao tác **mức KẾT NỐI**: rời hết kênh → `setAuth` → join lại. Đã hiện thực ở
   `lib/chat/supabase-client.ts` (`applyRealtimeAuth`).
   ⚠️ **ĐÍNH CHÍNH 10/08 (đo lại, bác bỏ một câu của chính mục này):** *"`client.channel()` là
   singleton dùng chung nên gia hạn của kênh `conv:` giết luôn kênh `user:`"* là **SAI**. Phép
   thử V2 — hai kênh private `conv:` + `user:` trên **một** kết nối, cùng dòng thời gian —
   cho **91/91** và **67/67** tick, không kênh nào bị đóng. Hình dạng "một tab, hai kênh" là
   LÀNH; thủ phạm nằm ở mục 1-bis.

   **1-bis. Vé phải được `await` XONG rồi mới join. Không chờ = kênh chết CÂM.**
   Hai kênh RAW khác nhau đúng một biến (`scripts/_zztest-chat-token-va-lo.ts`, V1 vs V2a/CTRL):

   | biến thể | kết quả |
   |---|---|
   | `void setAuth(vé)` rồi join NGAY | **0/91 tick**, SUBSCRIBED rồi **CLOSED sau 2,7–3,5s**, không lý do |
   | `await setAuth(vé)` rồi join | **91/91 tick**, không bao giờ bị đóng |

   Bản vá đầu tiên vẫn dính đúng bẫy này ở nhánh "vé đầu tiên" (`void setAuth` + join ngay,
   với lý lẽ "chưa kênh nào joined nên vô hại"), và trả giá đúng như bảng trên: kênh `conv:`
   của module SUBSCRIBED rồi CLOSED sau 1,5–3,5s, nhận **1** tick trong khi CONTROL nhận 92.
   Sau khi cho vé đầu đi chung `swapAuth` (có `await`): **91 tick, không CLOSED lần nào**, khe
   hở lúc rời-join còn **0,5s** (trước đó 7,5s).

   **1-ter. PHẢI tự cấp callback `accessToken` khi tạo client — nếu không vé bị thay bằng ANON KEY.**
   `SupabaseClient` **luôn** truyền `accessToken: _getAccessToken` xuống `RealtimeClient`, và hàm
   đó rơi về `supabaseKey` (anon key) khi không có phiên Supabase Auth — repo này dùng Auth.js
   nên nó LUÔN rơi về anon key. Vì `this.accessToken` tồn tại, `_performAuth` đặt
   `_manuallySetToken = false`, và `_wrapHeartbeatCallback` gọi `_setAuthSafely()` mỗi nhịp 25s
   ⇒ `accessTokenValue` bị ghi đè bằng anon key. Mà `RealtimeChannel.subscribe()` nhét chính
   `socket.accessTokenValue` vào payload JOIN.
   Hệ quả đo được (V3, client mặc định, join mới ở +60,3s sau ≥2 nhịp heartbeat, người dùng
   VẪN là participant hợp lệ):
   `CHANNEL_ERROR: Unauthorized: You do not have permissions to read from this Channel topic`
   lặp ở +65,6 / +71,4 / +78,2 / +88,5 / +103,4 / +118,2s — **không bao giờ vào lại được**.
   Đây đúng là đường mà bản vá dựa vào (join lại khi gia hạn, và join lại khi tự nối lại sau
   CLOSED) ⇒ thiếu callback này thì realtime chết vĩnh viễn tới khi tải lại trang.
2. **Kênh Supabase đã `CLOSED` thì KHÔNG bao giờ tự SUBSCRIBED lại** (theo dõi thêm 56–81s: 0 lần).
   Mọi nơi nghe realtime phải tự nối lại có backoff. `setStatus("closed")` rồi thôi = mất realtime
   ÂM THẦM: không lỗi, không dấu hiệu, người dùng vẫn thấy giao diện chat bình thường.
3. **Policy RLS chỉ được đánh giá LÚC JOIN.** Người bị set `leftAt` mà cố ý không rời kênh nhận
   đủ tin thật, payload **có nguyên trường `body`**; ân hạn ≈ 0 giây, cửa sổ = đúng phần đời còn
   lại của vé (xác nhận chéo 3 TTL). Kiểm ngược: người ngoài join → CHANNEL_ERROR, chính người đã
   bị gỡ join LẠI → cũng CHANNEL_ERROR ⇒ policy vẫn chạy, chỉ là không đánh giá lại.
   ⇒ `REALTIME_TOKEN_TTL_SECONDS` là **cận trên của một lỗ rò**, không phải một nút tinh chỉnh
   hiệu năng.
   **Hai cận trên KHÁC NHAU cho hai kẻ đe doạ — đừng gộp làm một:**
   • *client SỬA ĐỔI* (đúng mô hình đe doạ: nó cố tình không rời kênh) cũng sẽ không tự gia
     hạn ⇒ cận trên = **đúng TTL = 300s**. Nó không kéo dài được vì kéo dài đòi JOIN LẠI, mà
     join lại thì bị chặn. Vậy chính việc hạ 900→300 mới là thứ chặn kẻ tấn công (giảm 3 lần).
   • *client THẬT* gia hạn ở 80% TTL, mỗi lần gia hạn là một chu kỳ rời-đổi-JOIN LẠI ⇒ cận
     trên = **240s**. Đo 10/08 (`_zztest-chat-ro-giua-phien.ts` phần B5, đủ đối chứng dương
     trong CÙNG lần chạy: trước gia hạn CÓ rò 1/1, nhân chứng nhận 3/3, tai nạn nhân còn
     sống, và chu kỳ chứng minh được là đã chạy): sau MỘT chu kỳ, người bị gỡ nhận **0/3**
     tin; Realtime từ chối kênh của họ **4,8s** sau lời gọi `applyRealtimeAuth`.
   ⚠️ Bẫy khi đo lại: `applyRealtimeAuth` có luật *"vé đang áp còn hơn NỬA đời vé mới thì giữ
   nguyên"*. Gia hạn bằng một vé dài ngay sau khi vừa đặt vé ⇒ vé mới BỊ BỎ, chu kỳ không
   chạy, và phép đo báo nhầm *"lỗ chưa đóng"* (đã dính đúng bẫy này một lần). Muốn đo thì
   dựng đúng tỉ lệ của sản phẩm: vé đang áp còn ~20% đời so với vé mới.
4. **Trần lô của endpoint `/realtime/v1/api/broadcast` thấp hơn ta tưởng nhiều.** Đo: n≤80 → 202;
   n=95 → 502; n=200 → **429** `Too many messages to broadcast, please reduce the batch size` và
   **0 người nhận**. `BROADCAST_MAX_PER_POST` để 60 (không phải 80: lúc endpoint xuống cấp đo
   ~0,68 s/phần tử và n=90 chạm trần gateway 60s). Bắn nhiều lô song song không giới hạn cũng
   hỏng: 4×65 và 8×65 → 12/12 lô vượt `BROADCAST_TIMEOUT_MS` ⇒ trần đồng thời 2 lô + ngân sách
   tổng cho cả lượt (hàm này chạy TRONG Server Action, người dùng ngồi đợi).
5. **Dẫn xuất người nhận cho broadcast phải đọc TRONG transaction, SAU một câu khoá dòng
   participant.** Đọc ngoài tx bằng `db` trần ⇒ người đang bị gỡ (tx chưa commit) vẫn nhận tín
   hiệu; tái hiện tất định ở đường gỡ tin, trong khi đường gửi tin thì không. Khuôn chuẩn:
   `lib/chat/messages.ts` (`updateMany` khoá → `findMany` cùng tx); nay `lib/chat/moderation.ts`
   dùng chung khuôn qua `lockAndReadRecipients`. Thứ tự khoá bắt buộc **Message → Conversation →
   ConversationParticipant** ở mọi đường, nếu không sẽ deadlock giữa "gửi tin" và "gỡ tin".

### E-ter.bis — 5 luật trên được GIM bằng test nào

| Luật E-ter | Test khoá nó | Đột biến đã kiểm ngược (sửa vào là ĐỎ) |
|---|---|---|
| 1 — cấm `setAuth` khi còn kênh `joined` | `lib/chat/supabase-client.test.ts` → *"gia hạn: rời HẾT kênh → setAuth → join lại"*, *"subscribe MỚI giữa chu kỳ"*, *"unsubscribe GIỮA lúc gia hạn"* | bỏ bước rời-kênh trong `swapAuth`; bỏ guard `if (!swapInFlight)`; bỏ CẢ `entries.delete` lẫn cờ `released` |
| **1-ter — phải tự cấp callback `accessToken`** (bổ sung 10/08, xem ghi chú dưới bảng) | `lib/chat/supabase-client.test.ts` → nhóm *"LUẬT 1-ter — vé phải sống qua nhịp heartbeat"*: *"createClient PHẢI nhận callback"*, *"kênh mở MUỘN sau nhịp heartbeat vẫn join bằng VÉ"*, *"gia hạn vé ⇒ callback trả vé MỚI"* | xoá `accessToken:` khỏi `createClient`; giữ callback nhưng bỏ `ticketForConnection = current.token` trong `swapAuth` (**cả hai đều làm 17 test cũ VẪN XANH**) |
| 2 — kênh CLOSED không tự hồi ⇒ phải tự nối lại có backoff | `components/chat/use-chat-channel.test.ts` + `user-channel.test.ts` → nhóm *"tự nối lại khi kênh đóng ngoài ý muốn"* | `setStatus("closed")` rồi thôi; bỏ nhân đôi backoff; gia hạn vé nuốt mất lượt nối lại (`clearTimers` thay `clearTokenTimers`) |
| 3 — TTL vé là CẬN TRÊN của lỗ rò | `lib/chat/realtime-token.test.ts` → *"TTL 5 phút"* | nâng TTL về 900s |
| 4 — trần lô thật của endpoint | `lib/chat/broadcast.test.ts` → *"mảng 205 → [60,60,60,25]"*, *"endpoint mô phỏng theo SỐ ĐO THẬT"*, *"lô ĐẦY rụng ⇒ log truy ra được ai mất tin"*, **+ *"hết ngân sách tổng ⇒ BỎ lô còn lại"*** | trần lô về 200; nuốt lỗi HTTP; bỏ trần đồng thời; log chỉ in `batch[0].topic`; **vô hiệu hoá guard `remainingBudget <= 0`** |
| 5 — đọc người nhận trong tx, sau câu khoá, đúng thứ tự khoá | `lib/chat/moderation-broadcast.test.ts` → *"đọc người nhận NẰM TRONG transaction…"*, *"đường kiểm duyệt: … khoá participant SAU conversation.update"* | đưa việc đọc ra ngoài tx; bỏ câu `updateMany` khoá; bỏ `{timeout:30_000,maxWait:10_000}`; khoá participant trước `conversation.update` |

> ⚠️ **Luật 1-ter từng nằm trong tài liệu mà KHÔNG có dòng test nào khoá** (rà lại 10/08 sau
> khi vá): mock `createClient` của `supabase-client.test.ts` vứt bỏ tham số options, nên xoá
> `accessToken: async () => ticketForConnection ?? anonKey` vẫn cho typecheck + lint + build +
> **toàn bộ** unit test XANH — trong khi hậu quả thật là realtime **chết vĩnh viễn** tới khi
> tải lại trang. Nay mock mô phỏng đúng cơ chế đã đọc trong thư viện: `realtime.setAuth(jwt)`
> đặt `accessTokenValue`, `heartbeat()` ghi đè nó bằng giá trị callback trả về (thiếu callback
> ⇒ anon key), và `subscribe()` ghi lại ĐÚNG giá trị đó làm vé JOIN. Bài giữa nhóm tái dựng
> đường thật đã đo (V3): kênh thứ hai mount MUỘN khi vé cũ còn hạn ⇒ `applyRealtimeAuth` thoát
> sớm, không `setAuth`, nên vé JOIN chính là thứ heartbeat vừa ghi đè.
>
> ⚠️ Bộ test này chỉ có răng nhờ hai thứ, đừng gỡ khi refactor: `fetch` giả của
> `broadcast.test.ts` **mô phỏng đúng ngưỡng từ chối đã đo** (n≥95 hỏng) thay vì luôn trả 202
> — bản cũ luôn-202 chính là thứ đã bảo lãnh cho ngưỡng 200 hỏng; và mock Prisma của
> `moderation-broadcast.test.ts` **lọc thật theo `where`** + ghi nhật ký thao tác theo thứ tự
> (`tx:start → message.updateMany → participant.lock → participant.read → tx:end`).

## F. Trạng thái giả định của BA sau spike

| Giả định | Kết quả |
|---|---|
| A1 (User ↔ auth.uid) | SAI như dự đoán → thay bằng thiết kế mục B (custom claim), không backfill |
| A2 (PH có tài khoản) | Luồng cấp TK PH ĐÃ TỒN TẠI trên repo (satarobo.vn/kich-hoat + OTP Zalo + ZNS) → E3 coi như đã chốt: **SĐT + mật khẩu, kích hoạt qua link + OTP**. US-16 hết blocker kỹ thuật; còn lại là vận hành pilot. |
| A3 (query PH-theo-lớp 1 query) | Kiểm bằng EXPLAIN khi làm US-03 (schema có index `Enrollment`/`Student.parentId` sẵn — xác nhận lúc code) |
| A4 (tắt public access an toàn) | ĐÚNG — mục C |

## G. Checklist bắt buộc khi đưa chat lên PROD (chưa làm — chat mới chỉ ở `test`)

Ba việc dưới đây **không** thể làm trước, vì code chat chưa có trên `main`:

1. **Chạy workflow `Seed Production RolePermission (Supabase)`** sau khi merge. Đã xác minh 09/08: `origin/main:prisma/seed-roles.ts` có **0 dòng `chat:`** ⇒ prod hiện chưa có quyền chat nào, và cũng chưa từng dính lỗi "TRAINING có `chat:read` GLOBAL" (lỗi đó chỉ sống trong nhánh feature, đã gỡ ở `2fb3b20e`). Không chạy seed = mọi vai trên prod vào `/tin-nhan` đều bị chặn.
2. **Chạy `scripts/backfill-nhom-lop-chat.ts --apply`** trên prod. `syncConversationMembership` chỉ chạy theo **sự kiện nghiệp vụ**; lớp đã ở trạng thái ACTIVE từ trước ngày phát hành **không bao giờ** có sự kiện nào để kích hoạt ⇒ nhóm không tự sinh, GV/PH mở trang chỉ thấy "Chưa có hội thoại nào". Trên `test` đo được 24 lớp ACTIVE / 0 nhóm trước khi backfill. Chạy `--apply` xong kiểm bằng `/admin/hoi-thoai/doi-soat` (phải ra 0 drift).
3. **Điền `R2_CHAT_BUCKET_NAME` cho scope Production** (bucket riêng, không Public Access, không `r2.dev`). Thiếu → luồng ảnh trả 503 (fail-closed, có chủ đích).

> Bài học từ nghiệm thu 09/08: hai việc 1 và 2 đều **không** có test nào bắt được, vì cả hai là trạng thái dữ liệu/môi trường chứ không phải code. Trang danh sách rỗng nhìn giống hệt "tính năng chưa chạy".
