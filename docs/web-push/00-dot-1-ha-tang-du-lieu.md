# Web Push — Đợt 1: tầng dữ liệu & khoá (08/09/2026)

Thông báo đẩy vào điện thoại **nhân viên** khi có lead mới. Kênh **DUY NHẤT**, VAPID thuần —
không Firebase, không dịch vụ bên thứ ba, không fallback.

> **Đợt 1 chỉ dựng tầng dữ liệu và khoá.** Chưa có service worker, chưa có màn đăng ký thiết bị,
> chưa có engine gửi. **Chưa dòng push nào được bắn, và chưa có một dòng code nào đọc 3 biến
> VAPID hay đọc công tắc `push.webPushEnabled`.**

---

## 1. Phạm vi đã chốt — và câu đã đóng

**Chỉ nhân viên nội bộ. Phụ huynh KHÔNG nhận Web Push.**

Phụ huynh đi ZNS theo chốt 09/08/2026 (`lib/chat/zns-notify.ts:20`), đã hiện thực xong dạng cron
quét. Lý do phạm vi dừng ở đây không phải kỹ thuật: cơ chế này đứng được là nhờ **ép được** nhân
viên iPhone "Thêm vào màn hình chính" — đó là công cụ làm việc, bắt được. Phụ huynh không ép được,
và đó chính xác là lập luận đã thắng hồi 09/08.

⚠️ **Đây là câu đã đóng hai lần.** Nếu ai đó định cho outbox đọc thêm nguồn nội dung thứ hai để
phục vụ phụ huynh, họ đang mở lại một quyết định bằng đúng lập luận đã thua. Đọc mục này trước.

**Không nhầm với US-14.** US-14 (module chat) là báo tin nhắn lớp cho **phụ huynh**, đã xong bằng
ZNS, mã đó đã đóng. Việc đang làm mang mã riêng **US-14b**. Điểm móc
`lib/chat/announcements.ts:12` (`chat.announcement_created`) **giữ nguyên cho ZNS**, Đợt 1 không
đụng tới.

---

## 2. Vì sao hai bảng này KHÔNG có cột đơn vị

Luật Nền Hệ thống #3 nói *"bảng mới có **dữ liệu theo đơn vị** bắt buộc có `orgUnitId`"*. Hai bảng
này là dữ liệu **theo người**: một cái điện thoại thuộc về một nhân viên, không thuộc về cơ sở nào.

| Căn cứ | Ở đâu |
|---|---|
| **Tiền lệ có lý do viết thành văn** — nhưng viết cho `StaffNotification`, không phải cho hai bảng này | `docs/notification/00-ke-hoach-notification.md:48`: *"luật Nền Hệ thống #3 … không áp dụng: bảng này là dữ liệu theo người, không theo đơn vị; phạm vi đã được ép ở đường sinh (`getPendingTasks` lọc theo actor)"* |
| Tiền lệ cùng loại, đang chạy prod, 0 cột đơn vị | `StaffNotification`, `ChatZnsNotification`, `AttendanceTicket`, `OtpRequest`, `UserPermissionGrant` |

⚠️ Dòng 48 kia là **tiền lệ**, không phải phán quyết cho `WebPushSubscription`/`WebPushOutbox` —
đừng trích nó như một chữ ký đã có sẵn. Phán quyết cho hai bảng này là quyết định của chủ dự án
ngày 08/09/2026, dựa trên tiền lệ đó cộng các phép đo dưới đây.

**Đo được: chọn 0 cột làm đỏ 0 test, 0 lint.** Hai guard chỉ nổ theo *hình dạng cột*, không theo
ngữ nghĩa bảng — `[A0-04-T12-01]` chỉ quét model **có `centerId`**; `[US-07-IT-08b]` chỉ quét bảng
**có đủ hai cột**. Bảng không có cột đơn vị nào thì cả hai đều im. **Hệ quả: không có lưới nào giữ
chốt này** — nếu ai đó thêm cột đơn vị vào sau, cũng không test nào kêu.

**Vì sao thêm `orgUnitId` là tệ hơn, không phải an toàn hơn:** `scopedDb` chỉ chèn theo `centerId`,
và `lib/org/dual-write.ts` chỉ kích hoạt khi khối `data` **có** `centerId`. Nên cột đó sẽ **không
bao giờ được ghi tự động**, và sẽ **ôi thiu ngay lần nhân viên chuyển cơ sở đầu tiên**. Cách ly cơ
sở ép ở **đường sinh danh sách người nhận**, không ở tầng bảng — đúng mô hình `StaffNotification`.

⚠️ Đừng khai hai bảng này vào `SCOPED_MODELS`, `NULL_IS_GLOBAL_MODELS`, `getModelPrefixes`
(`lib/db-scope.ts`) hay `BACKFILL_SPECS` (`lib/org/center-bridge.ts`). Khai nhầm là hoặc lọc mất
dòng, hoặc làm `[US-07-IT-08b]` đỏ.

---

## 3. Vì sao là bảng thứ tư, không dùng `DomainEvent`

Repo đã có ba bảng gần vai (`DomainEvent`, `EmailQueue`, `ChatZnsNotification`), nên bảng thứ tư
phải tự biện minh. Ba phép đo, không phải ý kiến:

1. **`DomainEvent` không lùi được lịch.** `lib/events/dispatcher.ts` quét `PENDING` theo `createdAt`
   **không kèm điều kiện thời gian nào**; cron chạy `* * * * *`; `maxAttempts` mặc định 5. ⇒ nhịp
   thử lại **cố định 60 giây**, một lượt gửi hỏng **chết hẳn sau ~5 phút**, và không có chỗ nào ghi
   được `Retry-After` của 429.
2. **Một dòng `DomainEvent` có đúng MỘT cặp `status`/`attempts` cho cả sự kiện**, trong khi 3 thiết
   bị của cùng một người trả 3 số phận khác nhau (201 / 410 Gone / 429). `decideOutcome` chỉ biết
   `anyFailed` ⇒ hỏng 1 máy là cả sự kiện về `PENDING` ⇒ **lượt sau bắn lại vào máy đã nhận**. Muốn
   không trùng thì handler buộc phải nhớ trạng thái theo từng thiết bị — tức chính cái bảng này.
   **Nên nó không phải một lựa chọn: nó bắt buộc phải tồn tại.**
3. **Repo đã tự trả lời bằng tiền lệ.** Handler `DomainEvent` **duy nhất** gửi ra ngoài
   (`lib/crm/_handlers/lead-converted.ts`) không tự gửi — nó đẩy vào `EmailQueue`. Kiến trúc đã chốt
   sẵn: **`DomainEvent` = sự kiện miền · `EmailQueue` = sổ gửi của một kênh.** Push là kênh thứ hai
   ⇒ **sổ gửi thứ hai, không phải bus thứ hai.**

`DomainEvent` **không bị sửa một dòng nào** — xương sống của 20 handler đang chạy giữ nguyên.

**Một lỗi có sẵn phải né, đừng kế thừa:** reaper của dispatcher đo theo `createdAt` chứ không theo
mốc bắt đầu xử lý, nên việc tồn đọng quá ngưỡng bị kéo về `PENDING` **ngay trong lúc đang chạy**.
Với push đó là gửi trùng. Vì thế `WebPushOutbox` có cột **`claimedAt`** riêng, và engine ở Đợt 4
**phải** đo theo cột đó.

---

## 4. Hợp đồng đường ghi — chốt (A), không phải (B)

Đợt 1 khoá hình dạng bảng thì phải khoá luôn **ai ghi dòng `PENDING`**, vì hai hướng cho ra hai
schema khác nhau và đổi về sau là ALTER trên bảng có dữ liệu.

**Chốt: hướng (A) — ghi trong `notifyStaff()`, dùng `canRung`.**

- `notifyStaff()` (`lib/notifications/notify.ts:171`) hiện là `ghiThongBaoNhanSu()` +
  `broadcastNotificationBump(kq.canRung)`. Push là **dòng thứ ba** ngay cạnh.
- Phải đọc **`kq.canRung`**, KHÔNG phải `params.userIds`. `canRung` là tập người thực sự có bản ghi
  mới hoặc vừa mở lại — vốn đã được siết sau sự cố egress 05/09 ("nội dung không đổi ⇒ không ghi,
  không rung"). Móc nhầm vào `userIds` là biến push thành nguồn spam đúng hình thái sự cố đó: mỗi
  lượt `sla-check` (~1.800 vi phạm, `*/15`) sẽ đẻ 1.800 dòng outbox.
- **KHÔNG** móc vào `ghiThongBaoNhanSu()`: hàm đó là đường cho cron quét hàng loạt và **cố ý không
  bắn realtime** — nhét push vào đó là cron đẩy push trong khi lẽ ra chỉ gom badge.
- `notifyStaff` **không nhận `tx`** và điều đó là cố ý (broadcast phải chạy sau commit). Ghi outbox
  ở đây cũng chạy ngoài transaction nghiệp vụ. **Đừng nới hàm để nhận `tx`.**
- Ghi bằng `createMany({ data, skipDuplicates: true })` một câu cho cả mảng `canRung`. **Không**
  `upsert` với `update: {}` — Prisma vẫn phát UPDATE, đụng `updatedAt` và làm nhiễu sổ.
- Ca `reopen` gặp dòng đã `SENT`: **BỎ QUA, không reset về `PENDING`.** Đúng chốt "chấp nhận mất
  push lặp". Viết `update: { status: 'PENDING' }` là mở đường cho vòng push vô hạn.

Hướng (B) — cron quét `StaffNotification` bằng ANTI-JOIN như `chat-zns-notify` — **đã loại**; nếu
sau này đảo lại thì phải thêm index vào migration lúc bảng còn trống.

**Allowlist tiền tố `dedupeKey`**, đợt đầu đúng một giá trị `lead.moi:`; loại khác ghi `SKIPPED`
chứ không gửi. Cần vì `lead.nhap_lai:` nhét `now.getTime()` vào khoá
(`lib/lead/assign-lead.ts:345`) ⇒ khách điền form 10 lần là 10 dòng chuông mới, không trần nào
chặn. Mở thêm từng loại một, mỗi lần là một quyết định có ý thức.

---

## 5. Bảy lỗi đã sửa so với bản kế hoạch đầu

Bốn lỗi chặn cứng phát hiện lúc thiết kế, và ba lỗi nữa do bốn lăng kính phản biện tìm ra **sau
khi code đã viết xong và ba cổng đã xanh**:

| Lỗi | Vì sao chặn | Đã sửa thành |
|---|---|---|
| `endpoint @unique` + `deletedAt` | Trình duyệt cấp lại **đúng endpoint cũ** khi bật lại thông báo trên cùng máy + cùng khoá. Dòng cũ vẫn nằm trong bảng ⇒ INSERT **vỡ P2002**, người dùng thấy lỗi lạ và không có cách tự khỏi. Thêm nữa `lib/soft-delete.ts` chỉ tự lọc `deletedAt` cho 4 model tài chính | Bỏ `deletedAt`; dùng `status` + `revokedAt` + `revokedReason`. Đường ghi là **UPSERT theo `endpoint`** |
| Outbox không có khoá chống trùng | Cron chạy lại / deploy lại là gửi lặp. Cái giá của gửi đôi không phải tiền — là người dùng **tắt quyền thông báo ở cấp trình duyệt**, mất kênh vĩnh viễn, code không lấy lại được | `@@unique([userId, dedupeKey])`, mang **thẳng** khoá gốc của chuông |
| 4 biến env, 2 biến giữ cùng một khoá công khai | Lệch nhau ⇒ push service trả 403 `VapidPkHashMismatch` cho **mọi** subscription, và **không typecheck/lint/build nào bắt được**. Repo đã có vết y hệt: `AUTH_SECRET` vs `NEXTAUTH_SECRET` | **3 biến.** Server đọc `NEXT_PUBLIC_VAPID_PUBLIC_KEY` bình thường |
| Migration không bật RLS | 15/243 migration có `ENABLE ROW LEVEL SECURITY`. Riêng bảng này lưu `endpoint` + `p256dh` + `auth` — **đủ nguyên liệu để ai đọc được qua PostgREST tự gửi push giả mạo vào điện thoại nhân viên**, hoặc xoá sạch đăng ký để giết kênh | `ALTER TABLE … ENABLE ROW LEVEL SECURITY` cho **cả hai** bảng. Chỉ ENABLE, không FORCE, không policy |
| **Cổng endpoint chỉ chặn scheme, không chặn đích** | `https://169.254.169.254/…`, `https://10.0.0.5/x`, `https://127.0.0.1:8443/x` đều là https hợp lệ và **đều lọt**. Engine Đợt 4 sẽ tự POST vào đó từ runtime Vercel **kèm header VAPID thật** rồi ghi mã trả về vào `lastErrorCode` ⇒ SSRF **có kênh đọc kết quả**. Chú thích cũ còn tuyên bố đã bịt — tức người viết Đợt 4 sẽ không thêm gì nữa | `laHostAnToan()`: loại IP literal (IPv4 + `[::1]`) và host một nhãn (`localhost`, `metadata`). Danh sách **chặn** chứ không **cho phép** — mọi push service thật đều nhiều nhãn nên 0 dương tính giả, còn allowlist cứng sẽ âm thầm giết trình duyệt chưa liệt kê |
| **Trần endpoint đếm ký tự, btree đếm byte** | `.max()` của Zod đếm code unit UTF-16. Chuỗi 2015 ký tự nhiều byte nặng >4000 byte vẫn lọt, rồi ném Postgres 54000 *index row size exceeds btree maximum* ở tận môi trường thật | `Buffer.byteLength(s) <= 2048` |
| **Endpoint không chuẩn hoá** | `https://FCM.GOOGLEAPIS.COM/x` và `https://fcm.googleapis.com/x ` (thừa dấu cách) là hai chuỗi khác nhau nhưng **cùng một thiết bị**. Cột `@unique` + upsert ⇒ hai dòng ⇒ engine lấy theo `userId+status` sẽ **bắn hai lần vào cùng một máy** | `.transform((s) => new URL(s).href)` trước khi đo độ dài |

Kèm đổi tên `PushSubscription` → **`WebPushSubscription`**: tên cũ trùng type toàn cục của DOM
(lỗi câm khi viết TypeScript ở tầng client). Đổi lúc bảng chưa có dữ liệu là miễn phí.

**Hai cột thêm vào lúc bảng còn 0 dòng** (thêm sau là ALTER — luật cứng #4 chặn):

- **`displayMode`** — chế độ hiển thị lúc đăng ký. Đây là cột **đo được điều kiện mà toàn bộ lý lẽ
  phạm vi đứng lên**: iOS Safari chỉ giao push khi đã "Thêm vào màn hình chính". Thiếu nó thì khi
  nhân viên iPhone không nhận gì, màn quản trị chỉ thấy `status=ACTIVE, lastSuccessAt=null` và
  không phân biệt được "chưa cài PWA" với "push service bóp".
- **`vapidKeyId` nay suy từ chính khoá** (`vapidKeyIdTuKhoa()` = 8 ký tự hex đầu của SHA-256 khoá
  công khai) thay vì hằng `"v1"` gõ tay. Cột này được biện minh là "phân biệt khoá đổi với người
  dùng gỡ quyền" — nếu giá trị phụ thuộc trí nhớ người vận hành thì đúng ngày cần nó nhất nó sẽ nói
  dối, và không test/lint nào bắt.

**Một index đổi khoá thứ hai:** `@@index([status, sentAt])` → `@@index([status, createdAt])`. Mọi
thông báo ngoài allowlist ghi một dòng `SKIPPED`, mà `SKIPPED`/`DEAD` luôn có `sentAt = NULL` — với
allowlist đợt đầu đúng một tiền tố, gần như cả bảng sẽ là `SKIPPED` và câu dọn tự nhiên
(`status IN ('DEAD','SKIPPED') AND createdAt < X`) không có index nào dẫn.

---

## 6. File đã đổi

| File | Việc |
|---|---|
| `prisma/schema.prisma` | +2 enum, +2 model, nối vào **cuối file** (4/4 commit thêm model gần nhất đều append đuôi file) |
| `prisma/migrations/20260908000000_web_push_ha_tang/migration.sql` | SQL viết tay, additive thuần, RLS bật cho cả hai bảng |
| `lib/push/vapid.ts` | Sinh cặp khoá VAPID + kiểm hình dạng + nhãn phiên bản khoá. Thuần `node:crypto` |
| `lib/push/vapid.test.ts` | **15 test** |
| `lib/push/subscription.ts` | Hợp đồng Zod cho đăng ký từ trình duyệt |
| `lib/push/subscription.test.ts` | **17 test** |
| `scripts/tao-khoa-vapid.ts` | Sinh khoá, **chỉ in ra stdout** |
| `.env.example` | Nhóm VAPID — 3 biến |
| `lib/settings/registry.ts` | `push.webPushEnabled`, mặc định **TẮT** |
| `docs/notification/00-ke-hoach-notification.md` | Thêm mục **US-14b**, chú thích lại dòng Ngoài-V1 |
| `docs/chat-realtime/{variables,00-dieu-chinh-cho-repo,architecture}.md` | 3 dòng nay đã sai: sổ đăng ký secret thiếu 3 biến VAPID thật và ghi sai tiền tố (`PUSH_*`); hai dòng còn lại vẫn nói US-14 sẽ đi Web Push |

**KHÔNG thêm dependency nào.** Đo trong worktree này (Node v25.9.0): `node:crypto` thuần sinh đủ
cặp khoá đúng khuôn Web Push. `pnpm-lock.yaml` không đổi. Việc ký JWT VAPID lúc gửi để Đợt sau
quyết riêng (repo đã có sẵn `jose`).

---

## 7. Đã kiểm những gì

| Cổng | Kết quả |
|---|---|
| `pnpm typecheck` | sạch |
| `pnpm lint` | **0 lỗi** (2 cảnh báo đều là file có sẵn: `app/(teacher)/teacher/trial/page.tsx`, `lib/elearning/mark-lesson-read.test.ts`) |
| `pnpm exec vitest run` (toàn bộ) | **5667 qua / 0 hỏng** |
| `pnpm exec vitest run lib/push` | **32 qua** |
| **SQL viết tay có khớp `schema.prisma` không** | **KHỚP TUYỆT ĐỐI — 0 dòng lệch.** Dựng DB nháp `satarobo_push_check` trên Postgres local, `prisma migrate deploy` toàn bộ 244 migration, rồi `prisma migrate diff --from-url <db> --to-schema-datamodel prisma/schema.prisma`. Diff ra 59 dòng, **0 dòng nhắc `WebPush`** — toàn bộ là lệch CÓ SẴN của repo trên 14 bảng khác (`Timestamptz` vs `Timestamp(3)`, `ScopeShadowDiff.dataScope`, `OrgUnit_path_idx`). DB nháp đã xoá sau khi đo |
| RLS thật sự bật | `psql`: cả hai bảng `relrowsecurity = t`, `relforcerowsecurity = f`, **0 policy** (⇒ deny-all cho anon/authenticated, Prisma là chủ bảng nên bypass) |
| Tên index | 9 index, tên khớp quy ước Prisma từng cái |

⚠️ **Phát hiện phụ, KHÔNG phải do đợt này gây ra:** phép đo trên cho thấy repo đang có **lệch sẵn
giữa migrations và `schema.prisma` ở 14 bảng**. Ai chạy `prisma migrate dev` sau này sẽ thấy một
migration "sửa kiểu cột" bất ngờ. Ngoài phạm vi Đợt 1 — ghi lại để không ai tưởng là do Web Push.

### Lệnh chạy lại

```bash
pnpm exec prisma generate                    # worktree này chưa có node_modules/.prisma
pnpm exec vitest run lib/push                # 32 test, thuần, không chạm DB
pnpm typecheck && pnpm lint
```

Test đặt ở **`lib/push/*.test.ts`** là có chủ đích: `lib/**/*.test.{ts,tsx}` là glob **đầu tiên**
của `include` trong `vitest.config.ts`, tức chỗ **duy nhất** cổng merge required (`Quality` +
`Unit tests (Vitest)`) thật sự chạy. Đặt ở `tests/push/**` là **xanh giả** — `include` là bộ lọc
CỨNG, `vitest run tests/push` sẽ báo *"No test files found"* và job vẫn xanh.

Test Đợt 1 **không chạm Postgres**: job `Unit tests (Vitest)` không có service postgres và không
bật `ALLOW_DB_RESET`, nên mọi test chạm DB **skip im lặng** — tưởng có cổng mà không có.

---

## 8. Việc người vận hành phải làm tay

1. **Sinh khoá:** `pnpm exec tsx scripts/tao-khoa-vapid.ts`. Dán vào `.env.local` + Vercel.
   Script cố ý in `VAPID_SUBJECT=mailto:<ĐIỀN HỘP THƯ CÓ NGƯỜI ĐỌC>` — dán nguyên là hỏng ngay và
   thấy ngay, thay vì hỏng câm vào đúng ngày push service gửi cảnh báo.
   ⚠️ **Đừng chạy lệnh này để "kiểm thử" rồi dùng lại cặp khoá đã in** — nó nằm trong lịch sử
   terminal. Chạy một lần, dùng ngay cặp đó, hoặc chạy lại để lấy cặp mới.
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` **phải Non-sensitive** — biến Sensitive không tồn tại lúc build,
     mà `NEXT_PUBLIC_` được nhúng vào bundle **lúc build**. Để Sensitive là trình duyệt nhận
     `undefined`, không đăng ký được thiết bị nào, và server không thấy lỗi gì.
   - `VAPID_PRIVATE_KEY` để Sensitive.
2. **Chạy migration.** ⚠️ **DB dev CHÍNH LÀ DB của `test.satarobo.vn`** — apply là `test` có 2 bảng
   mới ngay. Chủ dự án đã chấp nhận có ý thức: additive thuần, 2 bảng mới, 0 ALTER.
   ```bash
   pnpm exec prisma migrate deploy      # với DATABASE_URL/DIRECT_URL của môi trường đích
   pnpm exec prisma generate
   ```
   Đừng dùng `pnpm db:migrate` (= `prisma migrate dev`): nó cần shadow DB trên Supabase và có thể
   đề nghị reset. **Tuyệt đối không** `prisma migrate diff --shadow-database-url` trỏ Supabase —
   lệnh đó RESET database đích, đã xoá sạch DB dev/test ngày 26/08.
3. **PROD chưa chạy** (đúng ràng buộc Đợt 1). Cần xếp lịch ai bấm và lúc nào — Đợt 2 sẽ kẹt ở bước
   này nếu để mở.
4. **Không cần seed** cho `push.webPushEnabled`: `lib/settings/resolve.ts` rơi về `default` khi DB
   trống.

---

## 9. Nợ đã biết — chấp nhận có ý thức

- **`manualAssignLead` không gọi `notifyStaff`** (`lib/lead/auto-assign.ts:333`) ⇒ gán tay đã không
  có chuông và sẽ không có push. **Lỗ chặn giá trị, phải vá trước khi tuyên bố kênh chạy** — kẻo
  nhân viên tin vào push rồi bỏ lỡ đúng loại lead mà Sale tự nhập tay.
- **Công tắc `push.webPushEnabled` hiện ngay trên `/admin/cau-hinh-van-hanh` nhưng KHÔNG có đường
  đọc.** Màn đó map toàn bộ `SETTING_KEYS` ra giao diện, không lọc. `label` mang hậu tố
  *"CHƯA HOẠT ĐỘNG, có hiệu lực từ Đợt 4"* để người vận hành không tưởng đã bật được kênh — **gỡ
  hậu tố khi engine gửi thật sự đọc key này.**
- **Gán lại lead cho chính người cũ không đẻ push thứ hai.** Chặn xảy ra ở chuông
  (`lib/notifications/notify.ts:140`), **trước** khi có dòng outbox nào — `baoSaleCoLeadMoi` không
  truyền `reopen`. Đây là đánh đổi đã ký từ 30/08 và được giữ nguyên.
  ⚠️ Đừng gỡ `@@unique` của outbox vì tưởng nó gây mất push — gỡ thì vẫn không có push, mà lại mất
  lưới chống trùng cho hai lượt cron chồng nhau.
- **4 nơi đang bật `reopen: true`** (`lib/notify/attendance.ts:182`, `lib/trial/notify-training.ts:72`,
  `lib/trial/service.ts:208`, `lib/cham-cong/request-actions.ts:156`) là chỗ **duy nhất** khoá unique
  của outbox thật sự nuốt một thông báo khác nội dung. Hiện vô hại vì cả 4 nằm **ngoài allowlist**
  `lead.moi:`. Ghi lại để 3 tháng nữa không ai đi truy một bug ma.
- **Đổi người phụ trách không thu hồi chuông của người cũ** — `href /leads/<id>` vẫn nằm trong
  chuông người không còn giữ lead. Push không làm tệ hơn, nhưng cũng chưa xử lý.
- **Chưa có allowlist DƯƠNG theo host push service.** Cổng hiện tại là danh sách **chặn** (IP
  literal, host một nhãn). Allowlist dương (`fcm.googleapis.com`, `*.push.services.mozilla.com`,
  `web.push.apple.com`, `*.notify.windows.com`) chặt hơn nhưng có thể âm thầm giết trình duyệt chưa
  liệt kê — quyết ở Đợt 3/4 **sau khi đo thiết bị thật của nhân viên**.
- **`lib/chat/announcements.ts:10-11` vẫn viết "Hạ tầng push chưa tồn tại trên repo (0 service
  worker / 0 VAPID)"** — nay đã sai một nửa (VAPID có rồi, service worker thì chưa). **Cố ý không
  sửa**: chủ dự án chốt không đụng file đó để giữ nguyên điểm móc cho ZNS. Sửa câu chữ ở đợt nào có
  lý do chạm file này.
- **`.claude/hooks/block-env-add.sh` KHÔNG chạy** (đo 08/09/2026: nó đọc `$CLAUDE_COMMAND`, biến đó
  không tồn tại nên hook `exit 0` im lặng). Lưới an toàn thật cho khoá riêng chỉ còn `.gitignore`.
  **Ticket riêng, ngoài phạm vi Đợt 1** — nhưng nguy hiểm vì `CLAUDE.md` ghi "hook block" nên cả
  người lẫn agent đang yên tâm nhầm.
- **Không có cơ chế giới hạn IP nào trong repo** (đã đo, kể cả `proxy.ts`).
  `WorkLocation.ipAllowlist` là **cột chết** — 0 đường đọc. Mối lo "4G bị chặn IP" đã rút lại.
  Rủi ro 4G thật nhưng khác bản chất: rate-limit `login:ip:` 10 lượt/phút (`lib/auth.ts:131`) đếm
  **chung** cho mọi người sau cùng một NAT — cả cơ sở phát wifi từ một SIM 4G có thể đá nhau khỏi
  màn đăng nhập. Ticket riêng, không liên quan push.

---

## 10. Đợt sau (chưa làm)

| Đợt | Việc |
|---|---|
| 2 | `manifest.json` + service worker. ⚠️ Đã đo: `/sw.js` an toàn (matcher `proxy.ts` loại mọi đường `.js`), nhưng `app/manifest.ts` của Next phát ra `/manifest.webmanifest` mà `isInfraPath` chỉ mở đúng chuỗi `/manifest.json` ⇒ trên `admin.satarobo.vn` đường đó **ăn 308 vĩnh viễn** về `satarobo.vn`. Service worker khoá theo **origin**: 4 host = 4 đăng ký rời |
| 3 | Màn bật thông báo + Server Action đăng ký/gỡ. `userId` từ phiên, `origin` từ request — **không bao giờ nhận từ client**. Chỉ ghi từ `parsed.data`, không bao giờ từ input thô (schema là `z.object` STRIP, nó *bỏ* khoá lạ chứ không *từ chối*). Ghi `displayMode` từ `matchMedia("(display-mode: standalone)")` và `vapidKeyId` từ `vapidKeyIdTuKhoa()` |
| 4 | Engine gửi + cron. Xử 404/410 → `EXPIRED`; 429 → tôn trọng `Retry-After`; 5xx → nhân đôi; 4xx khác → `DEAD`. Reaper đo theo **`claimedAt`**. Cron riêng thì **nhớ khai vào `.github/workflows/cron-pump-test.yml`**, không thì lần chạy thật đầu tiên rơi thẳng vào prod |

**Escalation** (lead "Mới" quá N phút chưa ai mở → báo QLCS) vẫn ngoài phạm vi: đó là tầng nghiệp
vụ, không phải kênh.
