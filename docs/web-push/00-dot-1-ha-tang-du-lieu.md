# Web Push (US-14b) — sổ thi công Đợt 1 → 5

Thông báo đẩy vào điện thoại **nhân viên** khi có lead mới. Kênh **DUY NHẤT**, VAPID thuần —
không Firebase, không dịch vụ bên thứ ba, không fallback.

> **Trạng thái 13/09/2026 — Đợt 1→5 xong. KÊNH CHƯA MỞ.**
> ~~Chưa có service worker, chưa có màn đăng ký thiết bị~~ — cả hai đã có (§11, §12).
> ~~Chưa có một dòng code nào đọc 3 biến VAPID~~ — cả ba nay được đọc (§13).
> ~~Công tắc `push.webPushEnabled` chưa có đường đọc~~ — engine đọc nó ở dòng đầu mỗi lượt cron.
>
> **VẪN ĐÚNG, và là điều quan trọng nhất của trang này: chưa một dòng push nào được bắn.**
> Hai cổng độc lập đang đóng, và cả hai đều phải mở bằng TAY:
> 1. `push.webPushEnabled` = **`false`** (mặc định trong registry, không ai bật);
> 2. ba biến `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` **chưa khai**
>    ở môi trường nào — engine trả `reason: "NO_VAPID"` và không đụng dòng nào.
>
> **Migration hai bảng push chưa chạy ở đâu tính tới lúc viết** — nhưng ĐỪNG hiểu thành "phải
> chạy tay": `.github/workflows/migrate-test.yml` chạy `prisma migrate deploy` trên MỌI push vào
> `test`, và `.github/workflows/deploy.yml` làm y hệt với `main`. Nghĩa là **ngay lần merge đầu
> tiên, hai bảng tự được tạo**. Trong khoảng giữa (nhánh đã merge, migration chưa kịp chạy) đường
> ghi vẫn an toàn: `ghiOutboxPush` nuốt lỗi P2021 và chỉ log — thông báo trong ứng dụng không hề
> bị ảnh hưởng.

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

- ~~**`manualAssignLead` không gọi `notifyStaff`**~~ — **ĐÃ VÁ 08/09/2026**, commit riêng.
  `baoSaleCoLeadMoi` nay được export và là cửa dùng chung cho mọi đường đổi chủ; gán tay gọi nó
  sau khi transaction commit. Test hồi quy: `lib/lead/manual-assign-notify.test.ts` (9 ca, đã
  chứng minh 4 ca đỏ khi gỡ lời gọi).
- ✅ **`transferLead` ĐÃ VÁ 08/09/2026** (commit riêng): người nhận có chuông
  `lead.moi:<leadId>`; ca `toSaleId = null` (đổi cơ sở mà cơ sở đích không còn ai nhận lead)
  báo quản lý cơ sở đích theo khuôn `baoPoolRong` thay vì im lặng. Test hồi quy
  `lib/lead/transfer-notify.test.ts` — đã chứng minh: gỡ chuông ra thì 3/9 đỏ, gỡ thu hồi ra thì 1/9 đỏ.
- ✅ **THU HỒI chuông của chủ cũ — đã có, áp cho MỌI đường đổi chủ có chuông.**
  `thuHoiThongBao` (`lib/notifications/notify.ts`) đưa bản ghi ACTIVE về `REVOKED`;
  `thuHoiChuongLeadCu` (`lib/lead/assign-lead.ts`) là cửa dùng chung, đã cắm vào
  `chiaChoLead` · `manualAssignLead` · `transferLead`. REVOKED chứ không xoá: `conHieuLuc`
  chỉ đếm ACTIVE nên mục biến khỏi badge lẫn panel, mà vẫn giữ vết "đã từng báo cho ai".
  Chỉ thu hồi khi quyền sở hữu THẬT SỰ sang người khác — ca pool rỗng cố ý không thu hồi.
- ⏸️ **`bulkReassignLeads` (bàn giao hàng loạt) — HOÃN theo chốt chủ dự án 08/09.** Nó cần một
  `dedupeKey` GỘP mới ("bạn vừa nhận N lead bàn giao") chứ không phải N chuông, tức thêm một
  dòng catalog và một quy ước khoá mới. Không gộp vào đợt này.
- ⚠️ **Vẫn còn 3 đường câm** sau hai bản vá: `autoAssignNewLead` (tạo lead thủ công ở
  `/admin/leads/new`, và là NHÁNH LÙI của cả form web lẫn quatang khi `centerId` không giải
  được), `autoAssignLead` (nút "Chia tự động" trên kanban), `reassignOpenLeads` (chia lại lead
  của sale nghỉ việc). Chờ quyết định.
- ⚠️ **Sau hai bản vá: 3/11 đường đổi chủ có chuông.** Đo 08/09: repo có **11 đường làm lead
  đổi/nhận chủ**, trước hôm nay **đúng 1** có chuông (`chiaChoLead`); nay thêm `manualAssignLead`
  và `transferLead`. **Đừng báo cáo "đã vá xong lead không có chuông"** — chưa.
- ✅ ~~Bản vá làm tăng số chuông mồ côi~~ — **ĐÃ XỬ**: thu hồi chuông chủ cũ (xem gạch đầu dòng
  trên). Nợ còn lại của cùng họ: chuông `lead.pool_rong:<leadId>` gửi quản lý cơ sở **không bao
  giờ được thu hồi** — lead sau đó được giao tay thì dòng "Lead chưa được phân công" vẫn nằm trong
  badge của quản lý. Dùng lại đúng `thuHoiThongBao` với danh sách người nhận của `baoPoolRong` là
  đủ; chưa làm vì ngoài phạm vi hai bản vá này.
- ⚠️ **Quản lý tự gán lead cho CHÍNH MÌNH vẫn nhận chuông.** `baoSaleCoLeadMoi` chỉ thoát sớm khi
  `source === "SELF"` (sale tự gõ phiếu), còn gán tay truyền `MANAGER`. Ca này hiếm — đòi một tài
  khoản mang cả `CENTER_MANAGER` (để có `leads:assign`) lẫn `SALES_CSM` (để nhận). Chọn **luôn
  rung** thay vì thêm `saleId !== actor.actorId`: một chuông thừa thì người dùng thấy và báo lại,
  một chuông thiếu thì không ai biết. Đảo lại là một dòng ở `lib/lead/auto-assign.ts`.
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

## 10. Đợt sau — ĐÃ ĐÓNG HẾT 08/09/2026

| Đợt | Việc |
|---|---|
| ~~2~~ | ✅ **XONG 08/09/2026** — `public/manifest.json` + `public/sw.js` + đăng ký worker. Xem §11 |
| ~~3~~ | ✅ **XONG 08/09/2026** — xem §12. Màn bật thông báo + Server Action đăng ký/gỡ. `userId` từ phiên, `origin` từ request — **không bao giờ nhận từ client**. Chỉ ghi từ `parsed.data`, không bao giờ từ input thô (schema là `z.object` STRIP, nó *bỏ* khoá lạ chứ không *từ chối*). Ghi `displayMode` từ `matchMedia("(display-mode: standalone)")` và `vapidKeyId` từ `vapidKeyIdTuKhoa()` |
| ~~4~~ | ✅ **XONG 08/09/2026** — xem §13. Engine gửi + cron. Xử 404/410 → `EXPIRED`; 429 → tôn trọng `Retry-After`; 5xx → nhân đôi; 4xx khác → `DEAD`. Reaper đo theo **`claimedAt`**. Cron riêng thì **nhớ khai vào `.github/workflows/cron-pump-test.yml`**, không thì lần chạy thật đầu tiên rơi thẳng vào prod |

---

## 11. Đợt 2 — PWA + service worker (xong 08/09/2026)

| File | Việc |
|---|---|
| `public/manifest.json` | `display: standalone` (điều kiện iOS), scope `/`, theme cam `#f97316` |
| `public/icons/satarobo-500.png` | Bản sao `app/icon.png` (500×500 thật) |
| `public/sw.js` | Handler `push` + `notificationclick` + vòng đời. **Không có handler `fetch`, không cache gì** |
| `components/push/service-worker-register.tsx` | Đăng ký worker sau sự kiện `load`, **không xin quyền** |
| `app/(admin)/admin/layout.tsx` | `metadata.manifest` + `viewport.themeColor` + mount component trên |
| `lib/push/sw.test.ts` · `lib/push/manifest.test.ts` | 15 + 10 test |

### Đường phục vụ — đo, không đoán

- **`/sw.js` không đi qua middleware.** Matcher của `proxy.ts` loại theo ĐUÔI FILE và `js` nằm
  trong danh sách. Đây là lý do worker đặt ở `public/` với đuôi `.js` chứ không phải một route
  handler. Test `[PUSH-MANIFEST-T03]` chạy chính chuỗi regex đó trên `/sw.js` để khoá lại.
- **Dùng `public/manifest.json`, CỐ Ý không dùng `app/manifest.ts`.** File quy ước của Next phát
  ra `/manifest.webmanifest`, mà `isInfraPath` (`lib/auth/route-policy.ts:273`) chỉ mở đúng chuỗi
  `/manifest.json`; matcher **không** loại đuôi `.json` nên request nặc danh mà trình duyệt dùng
  để lấy manifest sẽ rơi vào luật host×role. Không lỗi, không log — web app chỉ đơn giản không
  cài được, và cả nhánh iOS chết câm.
  ⚠️ **Đính chính một khẳng định tôi đưa ra sớm hơn:** cái "308 vĩnh viễn" là của **BRANCH 1**
  (`*.vercel.app` → host chuẩn, `proxy.ts:119`), KHÔNG phải của host admin thật. Trên
  `admin.satarobo.vn`, dòng đầu nhánh admin trong `decideRoute` là
  `if (isInfraPath(pathname)) return { type: "next" }` — nên `/manifest.json` đi thẳng. Kết luận
  thực hành không đổi; lý do thì đổi.

### Luật của đợt này nằm trong test, không nằm trong lời hứa

- **Mọi push PHẢI hiện thông báo.** `sw.js` không bao giờ ném: payload rỗng, JSON hỏng, JSON đúng
  nhưng sai kiểu (mảng/số/chuỗi/null), trường rỗng — tất cả rơi về tiêu đề mặc định. Không phải
  cẩn thận thừa: handler `push` ném lỗi thì Chrome tự chèn *"This site has been updated in the
  background"* và sau vài lần **thu hồi quyền push**. Một lỗi phân tích JSON có thể giết cả kênh.
- **Bấm vào thông báo ưu tiên tab đang mở** cùng origin (`focus` + `navigate`), chỉ mở cửa sổ mới
  khi không có tab nào. Tab của origin KHÁC không bị cướp.
- **Test chạy CHÍNH `public/sw.js`**, không chép logic sang module khác: file được đọc rồi chạy
  trong một `self` giả bằng `node:vm`. Chép logic là hai file sẽ lệch nhau đúng lúc không ai nhìn.
- **Test manifest so với BYTE THẬT:** đọc IHDR của PNG (offset 16) và đối chiếu với trường `sizes`.
  Khai `512x512` cho một file 500×500 là lời nói dối im lặng — trình duyệt vẫn tải, biểu tượng chỉ
  bị co méo, không cảnh báo ở đâu.

### Nợ của Đợt 2

- **Bộ icon còn tạm.** Chỉ có MỘT icon 500×500 (bản sao `app/icon.png`), khai đúng kích thước thật.
  Chrome chấp nhận (yêu cầu hiện tại là ≥144px) và iOS dùng `apple-touch-icon` mà Next đã phát ra
  từ `app/apple-icon.png`. Nhưng **bộ chuẩn 192 + 512 + một bản `maskable`** là việc của thiết kế —
  worktree không có thư viện xử lý ảnh và co ảnh bằng tay sẽ ra biểu tượng xấu. Đưa file vào
  `public/icons/` rồi sửa mảng `icons` là xong, test sẽ tự kiểm kích thước.
- **`theme_color` = `#f97316`**, lấy đúng `--primary` của app (`app/globals.css:196`). Kế hoạch
  ban đầu ghi `#610B8A` — chuỗi đó chỉ xuất hiện MỘT lần trong `globals.css:906` như ghi chú
  tương phản cho portal, không phải màu chính của admin. Đổi là một dòng ở hai chỗ.
- **Worker chỉ mount ở host admin.** Site giáo viên (`giaovien.satarobo.vn`) chưa đăng ký worker —
  GV thuần làm việc ở đó sẽ không nhận push cho tới khi mount thêm. Cột `origin` của
  `WebPushSubscription` đã chịu được "một người nhiều host"; việc còn lại là mount component.
- **Chưa chạy `pnpm build` được ở worktree này** (không có `.env`, `next build` chết ở prerender).
  `typecheck` + `lint` + 5708 test đều xanh; khâu build do CI `Quality` canh.

**Escalation** (lead "Mới" quá N phút chưa ai mở → báo QLCS) vẫn ngoài phạm vi: đó là tầng nghiệp
vụ, không phải kênh.

---

## 12. Đợt 3 — màn bật thông báo + đăng ký thiết bị (xong 08/09/2026)

| File | Việc |
|---|---|
| `lib/push/client-key.ts` | base64url → `Uint8Array` cho trình duyệt. **KHÔNG dùng `Buffer`** |
| `lib/push/ui-state.ts` | Quyết định hiển thị + nhận diện iOS + nhãn + 5 bước cài iOS (thuần) |
| `lib/push/origin.ts` | Suy origin từ `Headers` (thuần) |
| `lib/push/thiet-bi.ts` | Đọc thiết bị `ACTIVE` của một người |
| `app/(admin)/admin/settings/_push-actions.ts` | 3 Server Action: đăng ký · gỡ theo id · gỡ theo endpoint |
| `components/push/bat-thong-bao.tsx` | Giao diện dùng chung hai site |
| `app/(teacher)/teacher/layout.tsx` | `manifest` + `themeColor` + mount `ServiceWorkerRegister` |
| `app/(admin)/admin/settings/page.tsx` · `app/(teacher)/teacher/ho-so/page.tsx` | Khối UI |

### Host đã mount worker — và host TUYỆT ĐỐI KHÔNG

| Host | Cổng quyền THẬT ở layout | |
|---|---|---|
| `admin.satarobo.vn` | `auth()` + `hasStaffRole` → PARENT bị đá `/portal` | ✅ Đợt 2 |
| `giaovien.satarobo.vn` | `auth()` + cờ + `hasRole(TEACHER)` + liveness | ✅ **Đợt 3** |
| `e-learning.satarobo.vn` | 4 tầng, tầng cuối đòi hồ sơ `Employee` đang làm việc | ⏸️ được phép, chưa mount (cờ mặc định OFF, layout chưa có shell) |
| `sale.satarobo.vn` | `isSaleOnly` | ⏸️ chưa mount (cờ OFF, Sale thuần đang ở lại admin) |
| `hocvien.satarobo.vn` | layout đá **mọi người CÓ vai nhân viên** đi ⇒ tập còn lại đúng bằng phụ huynh | ❌ |
| `satarobo.vn` · `(legacy)` | **không có `auth()` nào** | ❌ |
| **`app/(auth)/layout.tsx`** | `"use client"`, không `auth()`, phục vụ trên **CẢ SÁU host** kể cả `/login` của cổng phụ huynh | ❌ **bẫy nặng nhất** |

Vì sao GV bắt buộc phải có: `TEACHER_SITE_ENABLED` mặc định **ON**, nên `decideRoute` đá GV
thuần khỏi admin sang `giaovien.satarobo.vn`. Không mount ở đó là đúng nhóm người đó không
bao giờ đăng ký được thiết bị nào.

Ràng buộc này nay có test canh: `[PUSH-D3-T14]` quét `app/(portal|public|legacy|auth)/**` và
đòi không tệp nào chứa `components/push/` hay `lib/push/`.

### Lỗi lăng kính phản biện bắt được (sau khi ba cổng đã xanh)

- **File Server Action thoát khỏi cổng `no-inline-authz` chỉ vì TÊN TỆP.** Rule chỉ soi
  `actions.ts` hoặc `_*actions*.ts`; `push-actions.ts` không khớp cái nào ⇒ 3 hàm ghi
  (`upsert`/`updateMany`) không bị kiểm một dòng nào, lint vẫn xanh. Chứng minh bằng cách chép
  nguyên tệp sang một tên khớp glob → **3 lỗi** nổ ra. Đã đổi tên thành `_push-actions.ts` và
  khai `eslint-disable-next-line` kèm lý do — đúng lối thoát mà chính thông điệp của rule chỉ.
  ⚠️ Dòng miễn trừ phải nằm **ngay trước `export`**; chèn chú thích xen vào giữa là nó vô hiệu
  và ESLint chỉ báo "Unused eslint-disable directive" chứ không nói rule kia vẫn đỏ.
- **Bật/gỡ xong màn hình nói ngược với DB.** Không action nào `revalidatePath`, và `thietBi` là
  prop đóng băng từ lượt tải trang ⇒ bật thành công xong vẫn hiện nút "Bật thông báo" và
  "Chưa có thiết bị nào" **ngay cạnh** dòng "Đã bật"; gỡ xong bấm lại lần hai ra chữ đỏ cho
  một thao tác vừa THÀNH CÔNG. Đã thêm `revalidatePath` (cả hai màn) + `router.refresh()`.
- **`tatMayNay` huỷ ở trình duyệt TRƯỚC rồi bỏ qua kết quả máy chủ.** `unsubscribe()` không
  hoàn tác được, nên phiên hết hạn giữa chừng là DB còn một dòng `ACTIVE` trỏ endpoint đã chết.
  Đã đảo thứ tự (máy chủ trước) + kiểm `kq.ok` + thêm `catch`.

### Nợ của Đợt 3

- ~~**CẦN QUYẾT ĐỊNH: công tắc `push.webPushEnabled` chưa có đường đọc**~~ — **ĐÃ CHỐT (B),
  08/09/2026.** Nút "Bật thông báo" **vẫn hiện** kể cả khi công tắc TẮT, để nhân viên đăng ký sẵn;
  engine của Đợt 4 mới là chỗ đọc công tắc thật (§13.6). Câu chữ trên màn hình giữ nguyên vì nó
  đúng ở CẢ HAI trạng thái ("sẽ tới ngay khi hệ thống mở kênh gửi") — không phải sửa lại lần nữa
  vào ngày mở kênh.
- **Một điện thoại có thể sinh HAI dòng** nếu người đó dùng cả admin lẫn site GV (worker khoá
  theo origin). Giao diện phân biệt bằng nhãn host (`nhanHost`). ~~Đợt 4 phải khử trùng trước khi
  bắn~~ — **Đợt 4 đã xét và CỐ Ý KHÔNG khử trùng**: mọi cách đoán "hai dòng này là một máy" đều có
  thể bỏ sót đúng cái máy còn sống, mà gửi thiếu tệ hơn gửi trùng. Lý lẽ đầy đủ + cách sửa sạch
  (cần một cột mới ⇒ migration) ở §13.8.
- **`scopedDb` + `resolveActor` trong 3 action không gác gì**: `scopedDb` chỉ cắm 7 method ĐỌC,
  còn `upsert`/`updateMany` không đi qua nó; `WebPushSubscription` cũng không có cột `centerId`.
  Giữ vì đó là khuôn của tệp anh em cùng thư mục và là đường hợp lệ để không import `@/lib/db`
  trần trong `app/(admin)/**`. Cách ly thật nằm ở `userId` của phiên trong mọi câu ghi.
- ~~**`lib/push/thiet-bi.ts` chưa có test**~~ — **ĐÃ TRẢ ở Đợt 5** (11 ca, xem §15.4).
- **Chưa mount ở `e-learning` và `sale`** (cả hai cờ mặc định OFF). Mount thêm là một dòng mỗi
  layout khi nào cờ bật.

---

## 13. Đợt 4 — engine gửi + cron (xong 08/09/2026)

### 13.1 Bản đồ file

| File | Vai | THUẦN? |
|---|---|---|
| `lib/push/allowlist.ts` | tiền tố `dedupeKey` nào được đẩy — đợt này đúng `lead.moi:` | ✅ |
| `lib/push/payload.ts` | dựng gói tin 4 khoá + cắt về ≤ 3993 byte + đường mở theo host | ✅ |
| `lib/push/ket-qua.ts` | phân loại mã HTTP · `Retry-After` · backoff · băm endpoint · chốt số phận dòng | ✅ |
| `lib/push/outbox.ts` | ĐƯỜNG GHI — `createMany` từ `canRung` | ❌ (DB) |
| `lib/push/engine.ts` | ĐƯỜNG GỬI — công tắc · khoá · reaper · giành chỗ · gửi · dọn | ❌ (DB + `web-push`) |
| `app/api/cron/push-outbox/route.ts` | vỏ cron, 3 dòng | ❌ |

Ba file THUẦN gánh phần lớn ma trận lỗi: chúng test được không cần Prisma, không cần jsdom, không
cần giả một push service, và **gọi được từ script `tsx`** (không `import "server-only"`, đúng lý
do đã ghi ở `vapid.ts`).

### 13.2 Dependency đầu tiên và duy nhất: `web-push@3.6.7`

Tự ký JWT VAPID thì được (repo đã có `jose`), nhưng tự viết mã hoá payload RFC 8291 thì không —
đó là mã mật mã, sai một byte đệm là push service trả 400 cho **mọi** tin và không ai đọc ra vì sao.

Đã đo, không suy: cây phụ thuộc 5 gói + 5 gói bắc cầu, **toàn JS thuần, không native addon,
không postinstall**. `pnpm build` xanh, route mới có mặt trong bảng route. Ba việc phải nhớ:

- **Giấy phép MPL-2.0** (khác MIT của repo). Dùng nguyên gói thì không phát sinh nghĩa vụ; **sửa
  file trong `node_modules/web-push` rồi vendor vào repo thì CÓ**. Cần hành vi khác thì bọc ngoài.
- **`http_ece` bị ghim CỨNG `1.2.0`** (không có `^`) trong `dependencies` của `web-push`, và đó
  chính là mã mã hoá payload. Có CVE thì ta không tự nâng được, phải chờ `web-push` phát hành.
  Ghi sổ rủi ro, không chặn.
- **`supportedContentEncodings.AES_128_GCM` có kiểu `never`** — `@types/web-push` gõ nhầm
  `"aws128gcm"` (aws thay vì aes). `never` gán đi đâu cũng được nên **tsc không cảnh báo**, hằng
  đó chỉ đơn giản vô nghĩa. Đừng đụng, và không cần: `aes128gcm` đã là mặc định của gói.

### 13.3 Điểm móc — dòng thứ ba của `notifyStaff`

```ts
const kq = await ghiThongBaoNhanSu(params);
await broadcastNotificationBump(kq.canRung);
await ghiOutboxPush({ userIds: kq.canRung, dedupeKey, expiresAt });   // ← Đợt 4
```

Ba điều kiện của chỗ móc này, mỗi cái có một ca test canh:

1. **Bám `kq.canRung`, KHÔNG bám `params.userIds`.** `canRung` = "ai vừa có mục MỚI hoặc vừa được
   mở lại". Bám nhầm là đẻ lại đúng bão egress 05/09, với hệ quả nặng hơn: mỗi dòng ở đây là một
   lần rung điện thoại, không chỉ một POST realtime.
2. **Ở `notifyStaff`, KHÔNG ở `ghiThongBaoNhanSu`.** Ranh giới giữa hai hàm là cố ý: `lib/crm/sla.ts`
   đi cửa dưới CHÍNH VÌ không muốn rung, và nó chạm ~1.800 vi phạm mỗi lượt — đúng nguồn đã thổi
   Supabase vượt trần egress. Đo được: **0 dòng outbox** sinh ra từ `sla-check`.
3. **Ngoài mọi transaction, SAU khi chuông đã ghi xong.** Hệ quả chấp nhận có ý thức: tiến trình
   chết đúng giữa hai dòng thì có chuông mà không có push, và lượt gọi lại thấy nội dung y hệt ⇒
   `canRung` rỗng ⇒ **không ghi bù, không để lại vết**. Mất một push, giữ được thông báo — đúng
   thứ tự ưu tiên. Đảo lại (ghi outbox trước) là đẩy push cho một mục chưa chắc tồn tại.

**Loại ngoài allowlist VẪN ghi một dòng, thẳng `SKIPPED`.** Đây là sổ trả lời câu "vì sao tôi
không nhận được thông báo X": không có dòng nào thì người hỏi không phân biệt được "loại này cố ý
không đẩy" với "kênh hỏng", và cách duy nhất tìm ra là đọc mã nguồn.

Số dòng `SKIPPED` sinh ra bám theo lưu lượng CHAT chứ không phải theo số nhân sự — bản đầu của
trang này ước lượng sai nguồn. Ba khoá không có trần tần suất nào:
`conversation.message_posted:<messageId>` (`lib/_handlers/conversation-notif.ts`) mang MESSAGE ID
⇒ **mỗi tin nhắn phụ huynh gửi vào nhóm lớp là một khoá mới**, nhân với số người nhận (GV chính +
trợ giảng) ⇒ 1–2 dòng mỗi tin; `lead.nhap_lai:<leadId>:<mốc ms>` và `shift.changed:<...>:<mốc ms>`
nhét `Date.now()` vào khoá ⇒ mỗi thao tác một dòng. Cộng các nguồn nhịp-ngày (`shift.brief:` ~1
dòng/người-có-ca) thì bậc thật là **hàng trăm dòng/ngày ở mức chat hiện tại, và tăng tuyến tính
theo lưu lượng chat** — không phải 50–150 như bản đầu viết. Đó là lý do engine có bước dọn
(§13.5), và cũng là lý do bước dọn KHÔNG chạy khi công tắc tắt là một nợ có thật (§13.8).

### 13.4 Engine — ba lỗi của tiền lệ, cố ý không kế thừa

| Tiền lệ | Lỗi | Ở đây |
|---|---|---|
| `lib/events/dispatcher.ts` reaper | lọc theo **`createdAt`** (lúc SINH việc) ⇒ dòng chờ lâu bị kéo về `PENDING` ngay trong lúc đang gửi ⇒ **gửi đôi** | lọc theo **`claimedAt`** (+ vế `claimedAt: null` để dòng ghi tay không kẹt vĩnh viễn) |
| `lib/events/dispatcher.ts` attempts | tăng ở **cuối** ⇒ chết giữa chừng là dòng độc quay vòng vô hạn | tăng **cùng câu với lúc giành chỗ** |
| `lib/email/queue.ts` | **không giành chỗ gì cả**, chỉ `findMany` rồi gửi ⇒ hai lượt cron chồng nhau là gửi trùng | `updateMany` nguyên tử có điều kiện trạng thái; `count === 0` ⇒ bỏ qua |

Cái giá của gửi trùng không phải tiền: người dùng tắt quyền thông báo ở **cấp trình duyệt**, mất
kênh vĩnh viễn, và code không có cách nào xin lại.

**Bốn cổng bỏ qua, theo thứ tự** — mỗi cổng ghi `SKIPPED` chứ không `FAILED` (không phải lỗi hệ
thống): dòng quá hạn → ngoài allowlist → chuông không còn / không `ACTIVE` / đã hết hạn → không
còn thiết bị `ACTIVE`.

**Cổng thứ ba là cổng chặn ca THU HỒI**, và đó là ca có thật xảy ra trong vài phút: lead chuyển
A→B thì `thuHoiChuongLeadCu` đặt chuông của A về `REVOKED`, nhưng dòng outbox của A vẫn nằm đó.
Không đọc lại lúc gửi thì cron nổ "Bạn có lead mới" trên màn hình khoá của A về một lead họ không
còn giữ — bấm vào thì `scopedDb` lọc mất, ra trang "không tồn tại". **Push đã nổ thì không thu
hồi được.**

**Ma trận mã trả về:**

| Mã | Xử lý dòng | Xử lý thiết bị |
|---|---|---|
| 2xx (thật là **201**) | thành công cho endpoint đó, không bao giờ bắn lại | `lastSuccessAt`, `failureCount = 0` |
| 404 · 410 | không thử lại | **`EXPIRED`** — mã DUY NHẤT được đổi `status` |
| 429 | `FAILED` + `Retry-After` (đọc **cả** số giây lẫn HTTP-date, khoá header **viết thường**) | chỉ đếm lỗi |
| 5xx · 408 · đứt mạng · socket timeout | `FAILED` + backoff nhân đôi (1→2→4→8→16 phút, trần 30) | chỉ đếm lỗi |
| 400 · 413 · **403** | `DEAD` ngay lượt đầu | chỉ đếm lỗi — **KHÔNG gỡ** |

**403 không gỡ thiết bị** vì mã đó gần như luôn là `VapidPkHashMismatch`: khoá server vừa xoay,
máy người dùng vẫn tốt. Gỡ hàng loạt lúc đó là bắt cả công ty bật lại thông báo bằng tay, trong
khi việc phải làm là dán lại khoá. Cột `vapidKeyId` sinh ra để phân biệt đúng ca này và nó chỉ có
ích nếu ta không xoá mất bằng chứng.

**Một dòng, nhiều máy:** gửi song song; máy đã thành công ở lượt trước **không bao giờ được bắn
lại** (tra `resultJson` theo băm endpoint). Chốt cuối: còn máy đáng thử và chưa cạn lượt ⇒
`FAILED`; hết đường thử ⇒ có ít nhất một máy nhận được thì `SENT`, không máy nào thì `DEAD`.

**`resultJson` khoá theo BĂM endpoint, không theo endpoint trần** — lệch với chú thích schema bản
đầu, và cố ý. Endpoint là một *khả năng gửi*: ai có chuỗi đó gửi được push rỗng vào máy nhân viên
(service worker hiện câu mặc định), không cần `p256dh`/`auth`. Luật của việc này là "không log đầy
đủ endpoint ở bất kỳ đâu — cắt hoặc băm", và một bảng ai đọc được cũng đọc được thì không khác một
cái log. Băm vẫn tất định nên vẫn tra lại được "máy này đã nhận chưa"; kèm nhãn cắt (`host/…6 ký
tự cuối`) để người trực còn lần ra được là máy nào.

**Cổng cấu hình có BA lớp, không phải hai** (lớp thứ ba thêm sau vòng lăng kính): hình dạng
khoá công khai → hình dạng khoá riêng → `VAPID_SUBJECT` → **và hai nửa có phải MỘT CẶP không**.
Lớp cuối cần vì `VAPID_PRIVATE_KEY` là biến RUNTIME còn `NEXT_PUBLIC_VAPID_PUBLIC_KEY` bị Next
thay bằng CHUỖI LITERAL lúc BUILD — cho cả bundle server, không riêng client. Người vận hành xoay
khoá trên Vercel rồi không deploy lại (thao tác trông hoàn toàn hợp lý) sẽ có khoá riêng MỚI ghép
khoá công khai CŨ; push service trả 403 cho MỌI thiết bị, mà 403 là `DEAD` ngay lượt đầu ⇒ cả
hàng đợi chết trong vài phút, triệu chứng duy nhất là im lặng. `khoaCongKhaiTuKhoaRieng` suy nửa
kia từ khoá riêng (`createECDH`) rồi so — biến ca đó thành một dòng lỗi nói thẳng.

**Hai điều engine KHÔNG làm, có chủ đích:**
- **Không dùng `setVapidDetails`.** Hàm đó ghi vào biến module-scope của gói; lambda Vercel dùng
  lại tiến trình ấm nên thứ tự nạp module thành một điều kiện ngầm, và trong test nó rò trạng thái
  giữa các ca. Truyền `vapidDetails` mỗi lượt gửi.
- **Không so `vapidKeyId` của thiết bị với khoá đang chạy trước khi gửi.** Nghe hợp lý (tiết kiệm
  một cú 403), nhưng cột có `@default("v1")`: một dòng mang `"v1"` sẽ bị coi là lệch và **gỡ oan**
  một thiết bị tốt. Và không tiết kiệm được bao nhiêu — 403 đã là `DEAD` ngay lượt đầu, không đốt
  5 attempt.

### 13.5 Cron

`/api/cron/push-outbox` — `* * * * *` (mỗi phút). Đã khai ở **cả hai** nơi bắt buộc:
`vercel.json` (nay 27 dòng cron; `lib/cron/dang-ky-cron.test.ts` canh cả hai chiều) **và**
`.github/workflows/cron-pump-test.yml` (Vercel Cron không chạy trên environment `test`, thiếu
bước bơm thì **lần chạy thật đầu tiên của engine sẽ là trên PROD**, thẳng vào điện thoại nhân viên).

`export const runtime = "nodejs"` **bắt buộc** — `web-push` dùng `node:https` + `node:crypto`,
rơi vào Edge là chết câm. `maxDuration = 60`, còn engine tự dừng ở 45s để phần chưa xử giữ nguyên
`PENDING` cho lượt sau.

**Dọn:** mỗi lượt xoá `DEAD`/`SKIPPED` cũ hơn 30 ngày (index `[status, createdAt]` đã dựng sẵn
đúng cho câu này). Lỗi dọn không làm hỏng lượt gửi.

### 13.6 Kill switch — nói đúng con số

Tắt `push.webPushEnabled` ở `/admin/cau-hinh-van-hanh`. **Hiệu lực trong ≤5 phút, KHÔNG phải ngay:**
`getSetting` cache `revalidate: 300`, và nhánh xoá cache theo tag chỉ chạy được trong Server Action.
Màn cấu hình sửa qua Server Action nên thường ăn ngay, nhưng một lượt cron đang giữ bản cache vẫn
có thể gửi thêm trong tối đa 5 phút.

*(Docstring ở đầu `lib/settings/service.ts` ghi "cache TTL 60s" — con số đó **SAI** so với code
`revalidate: 300`. Đừng chép lại.)*

### 13.7 Đã kiểm những gì

- `pnpm typecheck` **exit=0** · `pnpm lint` **exit=0** (2 cảnh báo có sẵn từ trước, 0 lỗi) ·
  `pnpm test:unit` **exit=0** — **5994 ca qua** (432 tệp), +129 ca mới · `pnpm build` **exit=0**,
  route `/api/cron/push-outbox` có mặt và `web-push` bundle sạch.
  (Bắt mã thoát tường minh, không đặt lệnh kiểm sau dấu ống.)
- **CẤY LẠI LỖI — 14/14 ca đỏ đúng chỗ**, mỗi ca đều grep xác minh phép thay thật sự đã đổi file
  trước khi chạy test, và đối chiếu byte sau khi khôi phục:

  | Cấy | Số ca đỏ |
  |---|---|
  | reaper đo theo `createdAt` | 2 |
  | gỡ dòng đọc lại trạng thái chuông lúc gửi | 1 |
  | gỡ bộ lọc "máy đã nhận ở lượt trước" | 1 |
  | gỡ đường đọc công tắc | 3 |
  | `Retry-After` chỉ đọc khoá viết HOA | 8 |
  | gộp 403 vào `HET_HAN` | 2 |
  | điểm móc bám `userIds` thay `canRung` | 2 |
  | `createMany` bỏ `skipDuplicates` | 1 |
  | gỡ bộ lọc "thiết bị còn sống" khỏi quyết định | 1 |
  | trả phần dựng gói tin ra ngoài `try` **và** gỡ nhánh `rejected` | 1 |
  | câu giành chỗ bỏ `nextAttemptAt` | 1 |
  | gỡ ghi sổ `resultJson` sớm | 1 |
  | gỡ cổng so khớp cặp khoá VAPID | 1 |
  | kẹp `Retry-After` về trần backoff | 2 |
  | câu quét bỏ `FAILED` | 1 |
  | nới cổng ngân sách thời gian | 1 |

  ⚠️ Hai ca trong bảng chỉ đỏ khi cấy **CẢ HAI** nửa của bản vá (dựng-gói-tin-trong-`try` và
  nhánh `rejected`): chúng là hai lưới chồng nhau, gỡ một nửa thì nửa kia đỡ. Ghi ra đây vì lần
  đầu tôi cấy một nửa, thấy xanh, và suýt kết luận nhầm rằng test không canh gì.

- **Một ca KHÔNG có test**: dòng `console.error` khi `getSetting` ném. Nó chỉ ảnh hưởng thứ
  người trực đọc trong log, không đổi hành vi (cả hai nhánh đều fail-closed về `DISABLED`).
  Ghi ra thay vì dựng một ca test giả vờ canh nó.

### 13.8 Nợ của Đợt 4 — chấp nhận có ý thức

- ⚠️ **MỘT ĐIỆN THOẠI VẪN CÓ THỂ NHẬN HAI THÔNG BÁO.** Người dùng cả admin lẫn site GV có hai dòng
  `WebPushSubscription` cho cùng một máy (service worker khoá theo origin), và engine gửi cho
  **mọi** thiết bị `ACTIVE` — đúng như đã chốt ("thiết bị phân giải theo `userId` lúc gửi, chỉ lấy
  `status = ACTIVE`"). **Cố ý không khử trùng bằng suy đoán:** mọi cách đoán "hai dòng này là một
  máy" (so `userAgent`, chọn origin khớp `href`) đều có thể **bỏ sót đúng cái máy còn sống**, mà
  gửi thiếu tệ hơn gửi trùng. Ca này gần như không xảy ra ở đợt đầu — `decideRoute` đá GV thuần
  khỏi admin và đá người không-phải-GV khỏi giaovien, nên phải là người kiêm **TEACHER +
  SALES_CSM** và đã bấm "Bật thông báo" ở cả hai host. **Cách sửa sạch cần một cột mới** (id thiết
  bị do client sinh) ⇒ migration ⇒ ngoài phạm vi đợt này.
- ⚠️ **Ca A→B→A mất push (không mất chuông).** Lead chuyển từ A sang B rồi quay lại A: chuông của
  A mở lại được (bản vá 08/09), nhưng dòng outbox `(A, lead.moi:<id>)` đã tồn tại nên
  `skipDuplicates` nuốt im lặng ⇒ A **có chuông, không có push**. Đây là hệ quả trực tiếp của hai
  quyết định đã chốt — "reopen gặp dòng đã `SENT`: BỎ QUA" và `createMany({ skipDuplicates })` —
  nên **không tự chế luật thứ ba để lách**. Muốn đóng thì phải chốt riêng: hồi sinh dòng `SKIPPED`
  *do chính sách* (`lastErrorCode IS NULL`) trong khi để `DEAD` bất động, hoặc chạy tay một script
  khi mở allowlist. Cả hai đều là quyết định vận hành, không phải việc dọn code.
- **Đường mở trên máy đăng ký ở origin giáo viên là `/teacher`**, không phải trang lead:
  `teacherHref("/leads/…")` trả `null` vì site GV không có màn lead. Xử lý tường minh (không để
  `undefined` chui vào `data.url` — `JSON.stringify` sẽ NUỐT HẲN khoá đó). Ca này chỉ xảy ra cùng
  với ca "hai dòng một máy" ở trên.
- ~~**`lib/push/thiet-bi.ts` vẫn chưa có test**~~ — **ĐÃ TRẢ ở Đợt 5** (§15.4).
- **Bảng vẫn phình khi công tắc TẮT.** Cổng công tắc đứng TRƯỚC mọi thứ (đúng yêu cầu "tắt thì
  thoát sạch, không đánh dấu gì"), nên bước dọn cũng không chạy. Ở mức 50–150 dòng/ngày thì vài
  tuần trước ngày mở kênh là không đáng kể; nếu kênh nằm tắt hàng năm thì phải dọn tay.
- **Lỗi trong engine im lặng với Sentry.** Repo không gọi `captureException` ở đâu (đã grep toàn
  `app/` + `lib/`), nên người trực chỉ đọc được số liệu ở response của route
  (`sent`/`failed`/`dead`/`skippedRows`/`reaped`/`purged`).
- **`notifyStaff` trả `soNguoi` (số người NHẬN), không phải số push đã đẩy.** 4 nơi đang cộng dồn
  nó vào biến tên `notified`. Đừng dùng con số đó để báo cáo về push.

### 13.8b HAI LỖ CỦA MÁY DÙNG CHUNG — ~~CẦN CHỦ DỰ ÁN QUYẾT~~ **ĐÃ VÁ Ở ĐỢT 5, xem §14**

Lăng kính phản biện của Đợt 4 tìm ra hai lỗ này. Cả hai nằm ngoài phạm vi "engine + cron" và cả
hai đều đổi HÀNH VI đã chốt của Đợt 3, nên Đợt 4 **cố ý không tự sửa** — ghi lại để quyết riêng.

> ✅ **ĐÃ VÁ 13/09/2026 (Đợt 5).** Chủ dự án chốt hướng và cả hai lỗ đã đóng: (a) ở §14 (đăng xuất
> thu hồi đăng ký, hai nửa client + server), (b) ở §15 (chuyển chủ khi endpoint đổi người, và
> `thiet-bi.ts` thôi trả endpoint đầy đủ xuống HTML). **Giữ nguyên phần mô tả dưới đây** — nó là
> lời khai bệnh, và §14.4 nói rõ cửa sổ nào VẪN còn hở.

**(a) Đăng xuất KHÔNG thu hồi đăng ký push.** Service worker khoá theo ORIGIN, không theo phiên
đăng nhập. Máy lễ tân dùng chung ở cơ sở, một hồ sơ Chrome: Sale A đăng nhập, bấm "Bật thông
báo" ⇒ dòng `(endpoint E, userId = A, ACTIVE)`. A đăng xuất, Sale B đăng nhập trên đúng hồ sơ đó.
Đăng ký E vẫn sống và vẫn mang `userId = A`, nên **mọi lead chia cho A từ nay nổ trên màn hình
khoá của máy B đang cầm** — kèm tên phụ huynh. B không có lý do nào để bấm "Bật thông báo" (nút
vẫn hiện, nhưng đó là thao tác tự nguyện), nên không có gì tự chữa.
Ba đường xử, đều là quyết định chứ không phải dọn code: (i) đường đăng xuất gọi luôn
`huyThietBiTheoEndpointAction` + `unsubscribe()`; (ii) engine so `userId` của đăng ký với phiên
gần nhất trên máy đó — cần cột mới; (iii) chấp nhận và ghi vào quy chế "không bật thông báo trên
máy dùng chung". Đường (i) rẻ nhất nhưng đụng `app/(auth)/dang-xuat` và `lib/auth/logout-client.ts`.

**(b) `upsert` theo `endpoint` không có vế `userId` ⇒ cướp được đăng ký.**
`dangKyThietBiAction` nhận `subscription.endpoint` nguyên văn từ client rồi upsert theo cột
`endpoint` (`@unique` toàn cục), nhánh `update` ghi đè `userId` thành người đang gọi. Không vế nào
kiểm người gọi thật sự sở hữu endpoint đó. Nhân viên B biết endpoint của A — đọc được ngay trên
trang `/settings` của A, vì `lib/push/thiet-bi.ts` trả **endpoint ĐẦY ĐỦ** xuống HTML — thì gọi
action với chuỗi ấy là chiếm luôn: từ đó A mất push im lặng (dòng của họ đã đổi chủ), còn B nhận
thông báo của A.
Đây KHÔNG phải sơ suất mà là hệ quả của một chốt có chủ đích ("máy dùng chung: ai bật sau thì
máy thuộc về người đó" — chú thích trong chính action). Sửa thì phải đổi chốt đó, và `upsert`
theo khoá `@unique` không nhận thêm điều kiện, nên phải viết lại thành đọc-rồi-ghi có kiểm.
Việc rẻ và độc lập nên làm trước dù chọn đường nào: **`lib/push/thiet-bi.ts` đừng trả endpoint đầy
đủ xuống client** — giao diện chỉ cần nhãn cắt, đúng thứ `nhanEndpoint` đã có.

### 13.9 Việc người vận hành phải làm — theo đúng thứ tự

1. **Migration: KHÔNG phải việc chạy tay.** `20260908000000_web_push_ha_tang` tự apply khi
   nhánh merge vào `test` (`migrate-test.yml`) và vào `main` (`deploy.yml`). Việc của người vận
   hành chỉ là **kiểm hai workflow đó XANH** sau merge. Chúng đỏ mà cứ đi tiếp thì mọi
   `ghiOutboxPush` nuốt P2021 và kênh im lặng hoàn toàn — không hỏng gì khác, nhưng cũng không
   có gì chạy.
2. **Sinh cặp khoá VAPID**: `pnpm tsx scripts/tao-khoa-vapid.ts` (in ra stdout, **không ghi file nào**).
3. **Dán vào Vercel**: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` **Non-sensitive** (biến Sensitive không tồn
   tại lúc build ⇒ trình duyệt nhận `undefined`, không ai đăng ký được, và server không thấy lỗi
   gì) · `VAPID_PRIVATE_KEY` **Sensitive** · `VAPID_SUBJECT` = `mailto:<hộp thư CÓ NGƯỜI ĐỌC>`.
4. **Nghiệm thu trên `test`** — bấm "Bật thông báo" trên điện thoại, tạo một lead, chờ ≤1 phút.
5. **Chỉ sau đó** mới bật `push.webPushEnabled` trên prod.

Bỏ qua bước 4 là để lần chạy thật đầu tiên rơi thẳng vào điện thoại nhân viên.

---

## 14. Đợt 5 — vá hai lỗ bảo mật của máy dùng chung (13/09/2026)

Việc **CHẶN**: chủ dự án không merge vào `test` cho tới khi hai lỗ ở §13.8b đóng, và không ai
được đăng ký thiết bị thật trước đó.

### 14.1 Bản đồ mọi đường đăng xuất — đo trước khi sửa

Bốn nhóm, và điều quan trọng nhất là **nhóm nào client chạy được**:

| Nhóm | Nơi | Client chạy được? |
|---|---|---|
| **1. Tự bấm, qua `logoutToGate()`** | `components/admin/topbar.tsx` · `app/(teacher)/teacher/_components/user-menu.tsx` · `app/(portal)/portal/_components/site-switcher.tsx` · `components/portal/v2-shell.tsx` | ✅ |
| **2. Điều hướng thẳng `/dang-xuat`** | `components/sale/sale-nav.tsx` (`<a href>`) · `app/(portal)/portal/ho-so/_components/profile-form.tsx` (sau đổi mật khẩu) | ❌ |
| **3. Server đá ra khi phiên chết** | 4 layout: `admin:82,85,88` · `teacher:87,88,90` · `portal:44` · `sale:76,77,79` → `redirect("/dang-xuat?reason=…")` | ❌ |
| **4. Không có đường nào** | đóng thẳng tab · JWT hết hạn tự nhiên · xoá cookie tay · mất mạng lúc bấm | ❌ |

Hai điều thuận lợi đo được: **chỉ `admin` + `giaovien` mount push** (portal/sale/auth/public đều
không), và **cả hai nút bấm của hai host đó đi qua đúng một hàm `logoutToGate()`** ⇒ một điểm cắm.

### 14.2 Hai nửa, phạm vi CỐ Ý KHÁC NHAU

Đây là quyết định vận hành, không phải chuyện gọn gàng — gộp một nửa là sai ở đầu còn lại.

**Nửa client — người dùng TỰ bấm ⇒ chỉ gỡ ĐÚNG MÁY ĐANG NGỒI.**
`lib/auth/logout-client.ts`: đọc `pushManager.getSubscription()` → gọi
`huyThietBiTheoEndpointAction({ endpoint })` → `sub.unsubscribe()` → rồi mới `signOut`.
Gỡ hết ở đây mới là quá tay: người ta đăng xuất hằng ngày, và đăng ký của điện thoại riêng
cùng origin `admin.satarobo.vn` sẽ chết theo mỗi lần họ rời máy công ty.

**Nửa server — tài khoản CHẾT (theo DB) ⇒ gỡ TẤT CẢ.**
`app/(auth)/dang-xuat/route.ts`: đọc `auth()` rồi gọi **`thuHoiNeuTaiKhoanChet`** — hàm này tự
đọc DB và tự quyết. Ở ca tài khoản chết, "gỡ hết" là ĐÚNG: tài khoản đã chết thì không được nhận
push ở đâu cả. Đây cũng là ca **nguy hiểm nhất** mà hướng client không với tới — nhân viên vừa rời
công ty, client không chạy.

> ⚠️⚠️ **"CHẾT" PHẢI ĐO BẰNG `deletedAt`/`isActive`, KHÔNG BẰNG `checkSessionLiveness` — lỗ thứ
> HAI do chính Đợt 5 đẻ ra** (lăng kính lượt 2 tìm ra, sau khi lượt 1 đã vá lỗ `?reason=`).
> `checkSessionLiveness` trả **cùng một nhãn** `session-invalidated` cho hai việc khác hẳn nhau:
> tài khoản bị xoá/vô hiệu hoá (chết thật) **và** `tokenVersion` lệch (chỉ là "buộc đăng nhập
> lại"). Mà bump `tokenVersion` là thao tác **thường ngày** — đo được **9 nơi**: đổi vai
> (`nhan-su/actions.ts`, `users/_actions.ts`), cấp/thu quyền per-user
> (`users/[id]/permissions/_actions.ts`, 3 nơi), force logout (3 nơi), tự đặt lại mật khẩu.
>
> Chuỗi hỏng cụ thể: SUPER_ADMIN cấp thêm **một** quyền cho một Sale đã bật thông báo trên điện
> thoại + máy bàn ⇒ lượt tải trang kế tiếp bị layout đá qua `/dang-xuat?reason=session-invalidated`
> ⇒ **gỡ sạch push trên cả hai máy**. Không màn nào báo; họ chỉ đơn giản không nhận lead nữa.
>
> Cố ý **không** nới `SessionLiveness` thêm lý do thứ ba: kiểu đó do đường auth sở hữu và ba
> layout đang dùng — đổi hợp đồng của nó để phục vụ một việc của module push là đặt rủi ro ở sai
> chỗ. `thuHoiNeuTaiKhoanChet` đọc đúng hai cột nói về SỰ SỐNG, và có ca test khẳng định nó
> **không** đọc `tokenVersion`.

> ⚠️ **`?reason=` KHÔNG PHẢI BẰNG CHỨNG — bản đầu của Đợt 5 tin nó, và đó là một lỗ bảo mật do
> chính bản vá đẻ ra** (lăng kính phản biện tìm ra sau khi bốn cổng đã xanh). `reason` là tham
> số URL, ai cũng đặt được, và cookie phiên khai `sameSite: "lax"` nên một **điều hướng
> top-level** (link trong tin nhắn, `window.open`) tới `/dang-xuat?reason=session-disabled`
> mang cookie đi theo. Trước Đợt 5 hậu quả chỉ là "bị đăng xuất" — đăng nhập lại là xong; tin
> vào `reason` biến nó thành **phá trạng thái lâu dài**: mất push trên mọi máy, phải đi bật tay
> từng cái mà không hiểu vì sao. Không cần kẻ tấn công cũng chạm được: route `force-dynamic`,
> nên sau khi bị đá ra rồi đăng nhập lại, **bấm Back hai nhịp** là gọi lại GET này với cookie
> MỚI trên một tài khoản còn sống nguyên.
>
> Nay `reason` chỉ còn dùng để hiện thông báo ở `/login`. Lý do GHI VÀO SỔ thu hồi là lý do của
> **DB**, không phải chuỗi người gọi tự khai.

Cổng liveness chạy cho **mọi** lượt ghé route, không chỉ khi có `reason` — nhờ vậy đóng thêm
được nút đăng xuất của site Sale (`components/sale/sale-nav.tsx`, `<a href="/dang-xuat">` không
kèm reason). Cái giá là một câu tra DB cho mỗi lượt ghé, mà route này chỉ được ghé bởi phiên đã
chết + nút đó — không phải đường nóng.

### 14.3 Ba thứ tự bắt buộc, mỗi thứ tự có một ca test canh

1. **`auth()` TRƯỚC `signOut()`** trong route. Sau `signOut` cookie đã dọn, không còn cách nào
   biết vừa thu hồi cho ai — và lỗi đó IM LẶNG: không ai bị gỡ, không ai báo gì.
2. **Máy chủ TRƯỚC `unsubscribe()`** ở client. `unsubscribe` không hoàn tác được, gọi trước là
   phá mất thứ duy nhất định danh được dòng cần thu hồi (đúng bài học `tatMayNay` ở Đợt 3).
3. **Dọn push TRƯỚC `signOut`** ở client. Action lấy `userId` từ phiên server; sau `signOut` nó
   chỉ trả "Chưa đăng nhập".

**Chỉ `unsubscribe()` khi máy chủ XÁC NHẬN vừa thu hồi một dòng CỦA MÌNH (`soDong > 0`).**

⚠️ Đây là **đảo ngược** so với bản đầu của Đợt 5, vì lăng kính đưa ra một dữ kiện bản đầu không
tính tới. Bản đầu huỷ **vô điều kiện** với lý lẽ "một endpoint đã huỷ thì không giao được cho ai,
nên cứ huỷ vẫn an toàn hơn". Lý lẽ đó **sai ở môi trường MỘT ORIGIN**: `test.satarobo.vn` và
`localhost` đi nhánh không-chia-subdomain của `proxy.ts`, nên admin/portal/teacher **dùng chung
một origin ⇒ chung một service worker**. Mà `logoutToGate` được gọi cả từ portal. Hệ quả đo được:
một **phụ huynh** bấm Đăng xuất trên `test.satarobo.vn` sẽ `getSubscription()` ra đăng ký của
**nhân viên**, action từ chối ("Không có quyền"), rồi bản đầu vẫn `unsubscribe()` — **giết đăng ký
của người khác**. Triệu chứng trên UAT: "bật rồi mà không nhận được gì", trong khi `/settings` vẫn
báo thiết bị đang hoạt động. Đúng môi trường mà việc nghiệm thu sẽ diễn ra.

Nên: `huyThietBiTheoEndpointAction` nay trả về `soDong` (số dòng thật sự thu hồi). `> 0` nghĩa là
endpoint này thật sự thuộc người đang đăng xuất ⇒ huỷ. `0`, `ok: false`, hoặc action ném ⇒ **không
huỷ**; lưới còn lại là `bat()` (nó luôn `unsubscribe()` đăng ký cũ trước khi đăng ký mới) và nửa
server ở `/dang-xuat`. Đánh đổi có ý thức: mất một lượt dọn trong ca mạng hỏng, để **không bao giờ
giết đăng ký của người khác**.

*(`ok` không dùng được cho việc này: action cố ý trả `ok: true` khi 0 dòng khớp — hành vi có từ
Đợt 3, vì "người dùng vừa tắt máy này và DB không còn bản ghi" đúng là kết quả họ muốn.)*

**Trần thời gian chờ 1,5 giây.** Người bấm "Đăng xuất" trên máy dùng chung là đang muốn ĐỨNG LÊN
ĐI; mạng chậm mà chờ vô hạn thì họ bỏ đi với phiên còn mở — tệ hơn hẳn cái đang cố vá.

### 14.4 ⚠️ CỬA SỔ CÒN HỞ — đừng đọc §14 như thể đã kín

**Nhóm 4 KHÔNG đóng được từ client, và Đợt 5 không đóng nó.** Các ca còn hở:

- **đóng thẳng tab / tắt trình duyệt** — không có sự kiện nào chạy kịp (`beforeunload` không
  await được một lượt gọi mạng, và `sendBeacon` thì không mang được kết quả để biết đã thu hồi);
- **JWT hết hạn tự nhiên** — không ai ghé `/dang-xuat`;
- **xoá cookie bằng tay / dùng cửa sổ ẩn danh rồi đóng**;
- **mất mạng đúng lúc bấm đăng xuất** — quá 1,5 giây là bỏ qua, `signOut` vẫn chạy (và nay cũng
  không `unsubscribe()`, vì không biết endpoint của ai — xem §14.3);
- **`/api/auth/signout` của NextAuth** (`app/api/auth/[...nextauth]/route.ts` xuất cả `GET` và
  `POST`, matcher của `proxy.ts` không loại `/api/*`) — **đường thứ 5**. ~~không nửa nào thu
  hồi~~ **[ĐÃ CÓ LƯỚI TỪ ĐỢT 6]** nửa **POST** nay đi qua `events.signOut` (§18.2). Còn hở:
  `GET /api/auth/signout` chỉ render trang xác nhận nên **không bắn event**; phiên đã hết cookie
  (`if (!sessionToken) return` ở `signout.js`); cookie rác làm `jwt.decode` ném (cùng một khối
  `try` với event); và handler quá **trần 1,5 giây**. Không UI nào của repo trỏ tới nó, và POST
  đòi CSRF token của NextAuth, nên hiện là đường **lý thuyết**; vẫn ghi ra.

- **LÚC TÀI KHOẢN CHẾT thì KHÔNG LƯỚI NÀO CHẠY** — cửa sổ hở thứ 7, lăng kính Đợt 6 tìm ra, và
  là cái hở **lớn nhất còn lại**. Cả ba nửa đều đòi **một lượt đăng xuất**. HR vô hiệu hoá một
  Sale lúc 17h thứ Sáu; người đó đóng laptop và không bao giờ mở lại trình duyệt công ty ⇒ không
  lượt đăng xuất nào ⇒ dòng `(endpoint, userId = người đã nghỉ, ACTIVE)` sống mãi, và engine phân
  giải thiết bị theo `userId` lúc gửi mà **không hỏi `User` còn sống không** ⇒ thông báo tiếp tục
  nổ trên **điện thoại riêng** của người đã nghỉ, kèm tên phụ huynh. Không có mã 410 để tự chữa
  vì thiết bị vẫn tồn tại và vẫn nhận.
  **Hai đường xử, chốt sau (NGOÀI phạm vi Đợt 6):** (a) gọi `thuHoiMoiThietBiCuaNguoi` ngay trong
  action xoá/vô hiệu hoá nhân sự — rẻ, nhưng phải tìm hết các cửa ghi `isActive`/`deletedAt`;
  (b) cho câu lấy thiết bị của engine join `user: { isActive: true, deletedAt: null }` — **một
  câu**, fail-closed, và đóng được cả nhóm 4 ở trên. Hướng (b) rẻ hơn và mạnh hơn.

- **`accountStatus` là cột sống THỨ BA mà cả ba lưới đều bỏ qua.** `authorize` coi
  `accountStatus !== "ACTIVE"` là chết (chặn đăng nhập), nhưng `thuHoiNeuTaiKhoanChet` chỉ đọc
  `isActive`/`deletedAt` (và có ca test **pin đúng hai cột đó**). Hôm nay vô hại: không mã sản
  xuất nào ghi `accountStatus: "DISABLED"`. ⚠️ **Ai làm màn "tạm khoá tài khoản nhân viên" bằng
  cột đó phải sửa `thuHoiNeuTaiKhoanChet` CÙNG LÚC** — nếu không, người bị khoá không đăng nhập
  được nữa mà JWT cũ vẫn sống tới hết hạn và push vẫn chảy về máy họ.

### ✅ HỆ QUẢ NÀY ĐÃ QUYẾT VÀ ĐÃ LÀM Ở ĐỢT 6 — xem §18.1

Lăng kính lượt 2 chỉ ra một hệ quả mà §14 bản đầu không ghi: **không có gì bật lại đăng ký sau
khi đăng nhập.** Nên ai đăng xuất buổi tối thì **hôm sau không nhận gì** tới khi tự vào `/settings`
bấm "Bật thông báo". Trên máy tính để bàn — nơi người ta đăng xuất hằng ngày — điều đó gần như
vô hiệu hoá tính năng.

Đây là hệ quả **trực tiếp của hướng đã chốt** ("đăng xuất thu hồi đăng ký"), không phải lỗi cài
đặt: nó đến từ việc thu hồi **DÒNG**, không phải từ `unsubscribe()`. Bỏ `unsubscribe()` cũng không
chữa được, vì dòng đã `REVOKED` thì engine không gửi nữa.

⚠️ **BẢN ĐÃ LÀM (Đợt 6) RỘNG HƠN bản đề xuất ở đây.** Bản đề xuất là "nếu `permission === granted`
**mà `getSubscription()` trả `null`** thì tự đăng ký lại". Bản đã làm cũng chạy **khi ĐANG CÓ đăng
ký**: nó ghi lại dòng DB một lần mỗi phiên tab, và **huỷ-rồi-đăng-ký-lại** khi khoá VAPID lệch.
Chính phần rộng ra đó sinh **hai lỗ** mà lăng kính Đợt 6 phải vá bằng một cổng thứ năm ở server
(§18.3): tự ghi danh người đăng nhập SAU trên máy dùng chung, và nút "Gỡ từ xa" tự mọc lại.

⚠️ Và **câu "grep `getSubscription` trong `ServiceWorkerRegister` = 0" nay ĐÚNG CHỮ mà SAI NGHĨA**
— grep vẫn ra 0 vì lời gọi đã dời sang `lib/push/tu-dang-ky-lai.ts`. Đó là một khẳng định dựa vào
phép grep **sống sót qua đúng thay đổi mà nó sinh ra để phát hiện**; đừng dùng lại phép đo đó.

Trong mọi ca ở trên, dòng `(endpoint, userId = người cũ, ACTIVE)` **còn sống**. Thứ thật sự bảo vệ
người ngồi sau là **`bat()`**: nó luôn `unsubscribe()` đăng ký cũ trước khi đăng ký mới, nên ngay
khi người mới bấm "Bật thông báo", endpoint của người cũ **chết** (push service trả 410 ⇒ engine
đánh `EXPIRED`). Nhưng nó chỉ bật khi có người **chủ động** bấm — nếu người ngồi sau không bấm,
thông báo của người cũ vẫn nổ trên máy đó tới khi có một lượt gửi chạm 410.

**Kết luận trung thực: hai lỗ ở §13.8b nay đóng ở mọi đường CÓ MÃ CHẠY, không phải ở mọi đường.**
Muốn kín hẳn thì cần một cột "thiết bị do client sinh id" để engine so với phiên gần nhất trên
máy đó ⇒ migration ⇒ phải quyết riêng.

---

## 15. Đợt 5 — chuyển chủ đăng ký + thôi lộ endpoint (13/09/2026)

Lỗ §13.8b(b). Trước bản vá, `dangKyThietBiAction` `upsert` khoá theo **mỗi `endpoint`** và nhánh
`update` ghi đè `userId` thành người đang gọi, **không vế nào kiểm người gọi có sở hữu endpoint
đó**. Ai biết endpoint của người khác thì gọi action với chuỗi ấy là chiếm luôn: nạn nhân mất
push **im lặng** (dòng đã đổi chủ), còn máy của họ từ đó rung cho việc của kẻ chiếm.

### 15.1 Hai nửa của bản vá

**(1) Bịt đầu vào — `lib/push/thiet-bi.ts` thôi trả endpoint.** Đây là nửa quan trọng hơn: kết
quả hàm đó là **prop của một Client Component**, tức được tuần tự hoá thẳng vào HTML của
`/settings` và `/teacher/ho-so` — ai mở "xem mã nguồn" là đọc được endpoint của **mọi** thiết bị
mình có. Chính nó biến lỗ trên từ lý thuyết thành khả thi.
Nay trả **băm** (`bamEndpoint`, sha256 16 hex) + **nhãn cắt** (`host/…6 ký tự cuối`, **hiện
trong danh sách thiết bị** — nó là thứ duy nhất phân biệt được hai trình duyệt trông giống hệt
nhau qua `tenMay`, vd hai máy Chrome/Windows). Màn hình vẫn đánh dấu đúng "máy này" vì client tự
băm endpoint của chính nó bằng `bamEndpointOClient`
(`lib/push/client-key.ts`, `crypto.subtle`) rồi so chuỗi — chính xác tuyệt đối, không lộ gì.
Hai bản băm **phải khớp từng byte** và có test so hai đầu, đúng khuôn cặp
`khoaVapidSangBytes` / `giaiBase64Url` đã có từ Đợt 3.
`p256dh`/`auth` thì **không còn được đọc lên khỏi DB** ở đường này — không có gì để lộ thì không
lộ được, mạnh hơn "đọc lên rồi nhớ bỏ đi".

**(2) Chuyển chủ KHÔNG ĐƯỢC IM LẶNG.** Không thể gác bằng "chứng minh sở hữu": trình duyệt là
thứ duy nhất biết endpoint nào của nó, và server không có cách nào xác thực điều đó. Mà **đổi
chủ vẫn là hành vi ĐÚNG** — máy lễ tân dùng chung, người đang ngồi là chủ hợp pháp của endpoint
trình duyệt vừa cấp, và chính việc đổi chủ mới là thứ bảo vệ họ khỏi nhận thông báo của người
trước. Nên chốt là: **cho đổi chủ, nhưng để lại vết**.

Trình tự khi phát hiện endpoint đang thuộc người khác:

1. `findUnique({ where: { endpoint } })` — **KHÔNG lọc theo `userId`.** Đây là bài học
   `lib/payments/method-lookup.ts`: câu tra dùng để CHẶN mà bị lọc mất đúng dòng cần chặn thì
   nó trả `null`, và cổng đọc `null` thành "không có gì, cho qua" ⇒ mở toang đúng lúc phải đóng.
2. `updateMany({ where: { endpoint, userId: { not: me } } })` → `REVOKED` + `revokedReason` rõ.
   **Thu hồi TRƯỚC, ghi chủ mới SAU** — hai câu, không gộp: nếu câu ghi chủ mới hỏng giữa đường
   (mạng, pooler chập) thì trạng thái còn lại phải là "người cũ ĐÃ mất quyền", không phải "người
   cũ vẫn đang nhận". Fail-safe đúng chiều; cùng lắm người đang ngồi bấm lại một lần.
3. `upsert` → `ACTIVE` cho người đang đăng nhập, reset `failureCount`/`lastErrorCode`.
4. `writeAudit({ action: "TAKEOVER", … })` — vết dài hạn.

### 15.2 ⚠️ MỘT CHỖ KHÔNG LÀM ĐƯỢC ĐÚNG CHỮ CỦA YÊU CẦU — ràng buộc schema

Yêu cầu viết: *"thu hồi dòng cũ (status REVOKED, revokedReason ghi rõ) **rồi tạo dòng mới** cho
người đang đăng nhập"*. **Không làm được đúng như vậy**, và lý do là ràng buộc DB:

`WebPushSubscription.endpoint` là **`@unique` TOÀN CỤC** (`prisma/schema.prisma`). Một endpoint
chỉ được có **đúng một dòng**, nên không thể giữ dòng `REVOKED` của người cũ **cạnh** một dòng
`ACTIVE` mới của người mới. Hạ ràng buộc đó xuống `@@unique([endpoint, userId])` là **migration
trên bảng đã có dữ liệu** — mà đợt này cấm chạy migration, và cột `@unique` ấy còn là khoá UPSERT
của cả đường ghi (lý lẽ đầy đủ ở chú thích model, §2).

Nên bản vá làm **đúng tinh thần, khác hình thức**: vẫn có bước `REVOKED` với `revokedReason` ghi
rõ (bước 2 ở trên — và nó có giá trị thật, là chốt fail-safe), nhưng **trạng thái đó chỉ sống tới
câu `upsert` ngay sau**. Vết **dài hạn** nằm ở `AuditLog` (`module: "push"`,
`action: "TAKEOVER"`, `oldValues.userId` → `newValues.userId`).

⚠️ Gọi nó là **"vết nỗ lực tối đa"**, đừng gọi là "nơi duy nhất và luôn có" — bản đầu của §15.2
viết quá mạnh. Nó best-effort ở **hai** lớp: (a) bốn câu (`findUnique` → `updateMany` → `upsert`
→ `writeAudit`) **không nằm trong một transaction**, nên nếu dòng được TẠO trong khe giữa câu 1
và câu 3 (hai phiên đăng ký song song cùng một endpoint) thì `chuyenChu` đứng ở `false` và `upsert`
đổi chủ **im lặng**; (b) `writeAudit` bọc `try/catch` để sổ hỏng không chặn một thao tác tự phục vụ
hợp lệ.

⚠️ Và **dòng `TAKEOVER` VÔ HÌNH ở `/admin/audit-log`** với mọi người có audit scope ≠ ALL:
`orgUnitId = null` (bảng này không có cột đơn vị), mà `buildUnifiedAuditWhere` lọc
`orgUnitId: { in: scope }` — `in` không khớp `NULL`, đúng hiện tượng mà `lib/audit/audit-log.ts`
tự khai. Chỉ SUPER_ADMIN / vai audit neo ở HO đọc được. Muốn người cấp cơ sở thấy thì phải quyết
riêng.

`AuditLog.entityId` ghi **nhãn cắt**, tuyệt đối không endpoint đầy đủ — cùng luật đã áp cho log
và `resultJson`: endpoint là một **khả năng gửi**, không để nó nguyên ở bất kỳ đâu. Có ca test
khẳng định chuỗi endpoint không xuất hiện trong bản ghi audit.

> ⚠️ **NHÁNH CHUYỂN CHỦ GẦN NHƯ KHÔNG BAO GIỜ CHẠY TỪ GIAO DIỆN — đừng chờ sổ `TAKEOVER` có
> dòng.** Lăng kính đo được: `bat()` **luôn `unsubscribe()` đăng ký cũ** trước khi `subscribe()`
> (mã Đợt 3, để né 403 `VapidPkHashMismatch`), nên push service cấp **endpoint MỚI** ⇒
> `findUnique({ endpoint })` trả `null` ⇒ `chuyenChu = false`. Nghĩa là thứ thật sự bảo vệ người
> ngồi sau trên máy dùng chung là **`unsubscribe()` ở `bat()`**, không phải cơ chế chuyển chủ.
>
> Nhánh chuyển chủ vẫn cần, cho đúng hai ca: (i) push service cấp **lại cùng một endpoint** sau
> khi huỷ (không có gì bảo đảm nó không làm vậy), và (ii) có kẻ gọi action với endpoint của người
> khác — tức ca mà §15.1(1) vừa lấy sạch đầu vào. Cả hai đều hiếm, nên **sổ `TAKEOVER` rỗng là
> BÌNH THƯỜNG, không phải dấu hiệu bản vá không chạy.**
>
> Hệ quả còn lại, ghi rõ: sau khi `bat()` huỷ endpoint cũ, dòng `(E_cũ, người cũ, ACTIVE)` **vẫn
> nằm đó** cho tới lượt gửi đầu tiên chạm 410. Trong khoảng đó `/settings` của người cũ vẫn liệt
> nó là "thiết bị đang nhận" — một dòng nói sai, không phải một lỗ bảo mật (endpoint đã chết,
> không giao được cho ai).

### 15.3 Kết quả rà soát: còn chỗ nào trả endpoint / p256dh / auth ra ngoài?

Đã quét `app/` + `components/` + `lib/` (grep `endpoint: true` · `p256dh` · `auth` · `.endpoint`):

| Nơi | Trước Đợt 5 | Nay |
|---|---|---|
| `lib/push/thiet-bi.ts` | **trả `endpoint` đầy đủ vào HTML 2 trang** | băm + nhãn cắt ✅ |
| `lib/push/engine.ts` | đọc `endpoint`+`p256dh`+`auth` để GỬI | giữ nguyên — server-only, và mọi thứ nó **phát ra** (`resultJson`, log, `lastError`) đã băm/cắt từ Đợt 4 ✅ |
| `components/push/bat-thong-bao.tsx` | so `tb.endpoint === ep` | so băm; hai chỗ còn lại đọc endpoint của **chính trình duyệt** (bắt buộc, để gọi action gỡ) ✅ |
| `console.*` trong `lib/push/**` | — | **19** lời gọi (Đợt 6: +4 ở `tu-dang-ky-lai`, +2 ở `thu-hoi`), **không lời nào chạm endpoint** — đã đo lại toàn bộ 19, và có ca test `[PUSH-D6-T07]` canh ở tầng hành vi ✅ |
| Sentry | — | ⚠️ **LÝ LẼ CŨ SAI, kết luận vẫn đúng.** ~~repo không gọi `captureException` ở đâu~~ — không gọi TAY không có nghĩa là không gửi: `instrumentation-client.ts` đặt `replaysOnErrorSampleRate: 1.0` và SDK Next của Sentry **tự bắt lỗi chưa xử lý**. An toàn vì hai lý do KHÁC: (i) `networkDetailAllowUrls` chưa khai ⇒ Replay chỉ ghi URL+method+status+size, **không ghi thân request** (thân POST của `dangKyThietBiAction` mang endpoint + p256dh + auth); (ii) `maskAllText: true`. ⚠️ **Khai `networkDetailAllowUrls` cho một việc chẩn đoán khác là MỞ kênh này** ✅ |
| `AuditLog` | không có bản ghi push nào | 1 bản ghi mới, **nhãn cắt** ✅ |

**Kết luận: không còn đường nào phát endpoint/khoá ra ngoài server.**

### 15.4 Trả nợ Đợt 3

`lib/push/thiet-bi.ts` **nay có test** (11 ca) — nợ ghi ở §12 từ Đợt 3. Bộ đó pin luôn ràng buộc
mới: kết quả không chứa endpoint, `select` không đọc `p256dh`/`auth`, băm khớp `bamEndpoint`,
lọc đúng `userId` + `ACTIVE`, `Date` → ISO.

### 15.5 Nợ còn lại sau Đợt 5

- **Chuyển chủ vẫn CHO PHÉP, chỉ là không im lặng nữa.** Không có cách nào chứng minh quyền sở
  hữu endpoint ở tầng server. Thiệt hại của một lần chiếm trái phép nay là **gây nhiễu / cắt push
  của nạn nhân**, không phải đọc trộm nội dung: payload mã hoá bằng `p256dh`/`auth` mà kẻ chiếm
  gửi lên, nên máy nạn nhân không giải mã được và service worker chỉ hiện câu mặc định. Cộng với
  §15.1(1) (không còn cách biết endpoint của người khác), ca này còn lại gần như không có đầu vào.
- **Cửa sổ hở của đăng xuất vẫn nguyên như §14.4** — Đợt 5 không đóng nhóm 4.
- Muốn đóng cả hai hẳn thì cùng một thứ: **một cột "id thiết bị do client sinh"** để engine so với
  phiên gần nhất trên máy đó ⇒ migration ⇒ quyết riêng.

---

## 16. Đợt 5 — ba lỗi lăng kính phản biện tìm ra SAU khi bốn cổng đã xanh

Chạy **tuần tự, một agent mỗi lượt, cấm ghi tệp**, và đối chiếu `git status` giữa mỗi lượt — yêu
cầu cứng sau sự cố Đợt 4 (agent nền tự cấy lỗi vào `lib/push/` rồi không phục nguyên, làm hai
lượt chạy test cho kết quả mâu thuẫn trong cùng một trạng thái mã).

| # | Lỗi | Mức | Đã vá ở |
|---|---|---|---|
| 1 | **`?reason=` bị tin làm bằng chứng "tài khoản đã chết"** ⇒ gỡ oan MỌI thiết bị của một tài khoản CÒN SỐNG. Chạm được bằng một link (cookie `sameSite: "lax"`), và cả bằng **bấm Back hai nhịp** không cần kẻ tấn công. **Lỗ do chính bản vá Đợt 5 đẻ ra.** | NẶNG | §14.2 |
| 2 | **Một ORIGIN ⇒ phụ huynh đăng xuất giết đăng ký của nhân viên.** `test.satarobo.vn`/`localhost` không chia subdomain nên chung service worker; bản đầu `unsubscribe()` vô điều kiện. Đúng môi trường sẽ nghiệm thu. | VỪA | §14.3 |
| 3 | **Nhánh chuyển chủ gần như không bao giờ chạy** (vì `bat()` luôn huỷ đăng ký cũ trước) ⇒ hai câu trong §14.4 và §15.2 nói sai về "lưới thứ hai". | VỪA | §14.4, §15.2 |

Kèm hai mục nhỏ: **đường đăng xuất thứ 5** (`/api/auth/signout` của NextAuth — lý thuyết, ghi vào
§14.4) và **`ThietBiView.nhan` là dữ liệu chết** (nay hiện trong danh sách thiết bị, §15.1).

**Một lỗ TEST mà chính vòng cấy lỗi lộ ra:** hợp đồng "`huyThietBiTheoEndpointAction` trả về
`soDong`" không bộ nào canh — `lib/auth/logout-client.test.ts` **mock** chính action đó, nên gỡ
`soDong: kq.count` khỏi giá trị trả về vẫn để bộ đó xanh. Mà mất `soDong` là `logoutToGate` **không
bao giờ `unsubscribe()` nữa** — im lặng trở thành không-làm-gì. Đã thêm `[PUSH-D5-T13]` canh đúng
hợp đồng đó, và cấy lại thấy đỏ.

**Lăng kính cũng phản bác được 6 nghi vấn** (ghi lại để người sau không đi lại): `Promise.race`
không treo/không rò (`setTimeout` không clear nhưng timer chờ không ngăn promise resolve);
`getRegistration()` **không** treo vô hạn — thứ treo là `navigator.serviceWorker.ready`, và đường
đăng xuất không dùng nó; iOS Safari chưa cài PWA vẫn có `'serviceWorker' in navigator` nên
`getSubscription()` trả `null` và thoát sớm; `tokenVersion` bị bump ở máy khác **không** làm mất
thu hồi (callback `jwt`/`session` không đọc DB nên `auth()` vẫn trả người dùng); danh sách trắng
`reason` phủ đủ chiều GỬI (mọi layout đều kèm reason, nguồn động duy nhất là `checkSessionLiveness`
vốn chỉ trả 2 chuỗi); phụ huynh đổi mật khẩu **không** gỡ oan của ai (`hasStaffRole` chặn nên họ
có 0 dòng).

---

## 17. Đợt 5 — lăng kính lượt 2 (lỗ b + test xanh giả)

Cũng chạy **tuần tự, cấm ghi tệp**; `git status` sạch suốt, `HEAD` không đổi trong lúc agent chạy.

| # | Lỗi | Mức | Đã vá ở |
|---|---|---|---|
| 1 | **`tokenVersion` lệch bị coi là "tài khoản đã chết"** ⇒ đổi vai / cấp quyền / force logout **gỡ sạch push trên mọi máy**, im lặng. 9 nơi bump `tokenVersion` và hầu hết không phải chết. **Lỗ thứ hai do chính Đợt 5 đẻ ra** — lần này ở bản vá của lượt lăng kính TRƯỚC. | NẶNG | §14.2 |
| 2 | **Cổng `[PUSH-D3-T14]` lách được ở hai chỗ ngay cạnh**: `app/layout.tsx` (layout GỐC, phục vụ cả sáu host kể cả cổng phụ huynh) và `components/portal/**` (~20 tệp) đều **ngoài** phạm vi quét. | NẶNG | đã nới `cam` + `tepCam` |
| 3 | Câu thu hồi lúc chuyển chủ **không lọc `status`** ⇒ ghi đè `revokedAt`/`revokedReason` của lần thu hồi trước — phá đúng bất biến mà `thu-hoi.test.ts` tự pin. | NHẸ | `_push-actions.ts` |
| 4 | **§15.2 nói quá mạnh** ("AuditLog là nơi duy nhất và luôn có") — vết là *nỗ lực tối đa*, hở ở hai lớp. | NHẸ | §15.2 |
| 5 | **Dòng `TAKEOVER` vô hình** ở `/admin/audit-log` với audit scope ≠ ALL (`orgUnitId = null`). | NHẸ | §15.2 |
| 6 | **Đăng xuất xong push TẮT tới khi tự bấm lại** — không gì bật lại sau đăng nhập. Hệ quả trực tiếp của hướng đã chốt. **CHƯA VÁ, cần chốt.** | — | §14.4 |

**Ba lỗ TEST mà lăng kính chứng minh bộ cũ không bắt được** — đã bịt và cấy lại thấy đỏ:

| Phép cấy | Hậu quả thật nếu lọt | Ca nay canh |
|---|---|---|
| siết `chuyenChu` thêm `&& status === "ACTIVE"` | chiếm một dòng `REVOKED` của người khác thì **không thu hồi, không ghi sổ** — mà đó là hình dạng phổ biến nhất của dòng cũ (vừa `REVOKED` lúc người trước đăng xuất) ⇒ lỗ §13.8b(b) quay lại, im lặng | `[PUSH-D5-T07]` ca "dòng cũ đang REVOKED của NGƯỜI KHÁC" |
| gỡ `try/catch` quanh `Promise.race` ở `logoutToGate` | trình duyệt nào `getRegistration()` reject (hồ sơ Chrome hỏng, cửa sổ riêng tư) thì **nút Đăng xuất không làm gì** — trên đúng máy dùng chung mà cả §14 tồn tại vì nó | `[PUSH-D5-T05]` ca "getRegistration() NÉM" |
| `const bam = ep` (so endpoint trần với băm server) | `daDangKy` vĩnh viễn `false`, không bao giờ có nhãn "máy này" ⇒ người dùng bấm bật lại, **mỗi cú bấm đẻ một dòng `ACTIVE` mồ côi** | **`components/push/bat-thong-bao.test.tsx` — tệp MỚI** |

Mục cuối là lỗ lớn nhất: `components/push/bat-thong-bao.tsx` **chưa có một tệp test nào**, tức
toàn bộ dây nối nửa client của Đợt 5 (băm ở client, so `t.bam === bam`, nhãn "máy này", không rò
endpoint ra DOM) không ai canh. `client-key.test.ts` chỉ khoá HAI HÀM, không khoá chỗ GỌI.

### 17.1 Nợ còn lại sau lượt 2

- **Cổng `[PUSH-D3-T14]` không đi theo cây import.** Nó chỉ đọc chuỗi trong chính tệp của các
  thư mục bị cấm, nên bắc cầu qua `lib/` là vô hình — và **Đợt 5 vừa tạo đúng một cây cầu như
  vậy**: `app/(portal)/portal/_components/site-switcher.tsx` → `@/lib/auth/logout-client` (tệp
  `"use client"`) → `@/app/(admin)/admin/settings/_push-actions`. Hôm nay vô hại (import Server
  Action chỉ thành stub tham chiếu; đã **đo**: grep chuỗi server-only trong `.next/static` = 0 tệp,
  với đối chứng dương là chuỗi UI push tìm thấy ở 2 chunk). Nhưng thêm **một dòng**
  `import { bamEndpointOClient } from "@/lib/push/client-key"` vào `logout-client.ts` — việc rất
  dễ nghĩ tới ở đợt sau — là mã push client vào bundle phụ huynh mà cổng vẫn xanh. Bịt đúng thì
  phải đi theo cây import (dependency-cruiser), việc lớn hơn một ca test.
- **Chuỗi import không literal** (`await import(\`@/lib/push/${x}\`)`) không khớp regex của cổng.
- **Endpoint KHÔNG phải "khả năng gửi" đứng một mình** — chú thích ở `ket-qua.ts`/`thiet-bi.ts`
  nói quá mạnh. Đăng ký của ta tạo với `applicationServerKey`, nên push service đòi JWT ký bằng
  ĐÚNG cặp khoá VAPID của ta; ai có endpoint mà không có khoá riêng thì không gửi được gì. Việc
  che endpoint vẫn đúng, nhưng vì hai lý do khác: nó là **đầu vào duy nhất của đường chiếm đăng
  ký**, và nó là định danh thiết bị. Sửa lại câu chữ ở đợt sau, không đáng một commit riêng.

---

## 18. Đợt 6 — đợt CUỐI trước khi bật (13/09/2026)

Phạm vi ĐÓNG BĂNG, đúng hai việc: **tự đăng ký lại sau đăng nhập** (§18.1) và **lưới thứ ba ở
`events.signOut`** (§18.2). Mọi thứ lăng kính tìm ra ngoài hai việc đó nằm ở §18.6, KHÔNG vá.

### 18.1 VIỆC 1 — tự đăng ký lại sau đăng nhập, KHÔNG xin quyền lần nào

Vá mục "CHƯA QUYẾT" của §14.4. Đường mới: `lib/push/tu-dang-ky-lai.ts`, gọi từ
`components/push/service-worker-register.tsx` (đã mount ở admin + site GV, hai layout đều `auth()`
+ `redirect("/login")` nên "sau khi đăng nhập" là điều kiện SẴN CÓ).

**RÀNG BUỘC KHÔNG SỬA ĐƯỢC SAU:** đường này TUYỆT ĐỐI không gọi `Notification.requestPermission()`.
Gọi xin quyền ngoài một cú bấm là cách chắc chắn để nhân viên bấm "Chặn" theo phản xạ, và trình
duyệt **không hỏi lại** ⇒ kênh push của máy đó chết vĩnh viễn, code không có đường lấy lại.
`permission` khác `"granted"` — **kể cả `"default"`** — thì hàm không làm gì.

Điều luật đó được canh ở **hai lớp**, và lớp thứ hai ra đời vì lăng kính chỉ ra lớp thứ nhất không
đủ: cổng hành vi cũ chỉ nằm trong tệp test của MODULE, nên thêm một lời gọi xin quyền vào CHÍNH
`service-worker-register.tsx` (đúng chỗ Đợt 6 vừa mở đường) thì cả bộ vẫn xanh — jsdom không có
`Notification`, nên rào `typeof` của chính kẻ vi phạm che nó đi. Nay:
`[PUSH-D6-T12]` dựng `Notification` thật với `permission: "default"` (trạng thái nguy hiểm nhất) và
đếm ở MỌI ca **kèm đối chứng dương**, cộng một **cổng NGUỒN** quét ba tệp của đường tự động
(`service-worker-register.tsx` · `tu-dang-ky-lai.ts` · `bo-nho-may.ts`) — cố ý KHÔNG quét
`bat-thong-bao.tsx`, nơi DUY NHẤT được phép xin quyền (`rg requestPermission` toàn repo ⇒ đúng một
lời gọi, ở đó).

**NĂM CỔNG, theo thứ tự:**

| # | Cổng | Không có nó thì |
|---|---|---|
| 1 | `Notification.permission === "granted"` (chỉ ĐỌC) | mất kênh vĩnh viễn ở máy bấm "Chặn" |
| 2 | chính người này chưa `da-tat-tay` trên máy này | nút "Tắt"/"Gỡ" thành VÔ NGHĨA — lượt tải kế dựng lại |
| 3 | khoá VAPID của đăng ký cũ KHỚP khoá server | 403 `VapidPkHashMismatch` câm vĩnh viễn (403 cố ý không EXPIRE) |
| 4 | endpoint chưa được người này đồng bộ trong phiên tab | mỗi lượt tải trang cứng = 1 Server Action + 2 `revalidatePath` + `resolveActor` (≈9 câu DB) |
| 5 | **ở SERVER** — `tuDong: true` (xem §18.3) | hai lỗ máy-dùng-chung, xem §18.3 |

Cổng 3 có ba nhánh và nhánh thứ ba là nhánh phải nghĩ lâu nhất: **không đọc được**
`sub.options.applicationServerKey` (Safari cũ) ⇒ **KHÔNG LÀM GÌ CẢ**. Hai đường kia đều tệ hơn —
tái dùng mù là 403 câm, còn huỷ-rồi-đăng-ký-lại mỗi lượt tải trang là đẻ một endpoint mới + một
dòng mồ côi **mỗi lần**.

**Hai mẩu trạng thái ở trình duyệt** (`lib/push/bo-nho-may.ts`) fail sang **hai chiều NGƯỢC NHAU**,
mỗi chiều có lý do riêng và mỗi chiều có ca test khoá:

| Mẩu | Kho | Đọc lỗi ⇒ | Vì sao chiều đó |
|---|---|---|---|
| `da-tat-tay` | `localStorage` (sống qua đóng tab) | `true` = "đừng tự bật lại" | đoán sai chiều này chỉ bắt bấm một lần; chiều kia là tự bật lại thứ họ vừa tắt ⇒ người ta đi chặn quyền ở cấp trình duyệt |
| `da-dong-bo` | `sessionStorage` (CHẾT theo tab) | `false` = "ghi thêm một lượt" | mất mốc chỉ tốn; coi như đã đồng bộ khi không chắc là MẤT đăng ký |

⚠️ **CẢ HAI KHOÁ MANG THEO `nguoiDung` (`session.user.id`), KHÔNG theo origin** — đây là bản vá
của hai chuỗi hỏng mà lăng kính đo được, cả hai IM LẶNG:

- **mốc `da-dong-bo` theo endpoint đơn ⇒ RÒ DỮ LIỆU.** `sessionStorage` **sống qua đăng xuất trong
  cùng tab** (redirect về `/login` không xoá nó). Chuỗi tất định: quản trị bump `tokenVersion` (9
  nơi làm việc đó) ⇒ layout đá A sang `/dang-xuat` ⇒ tài khoản **còn sống** nên không thu hồi gì,
  và vì là redirect phía server nên **không nửa client nào chạy** ⇒ đăng ký E còn sống ⇒ B đăng
  nhập **trong cùng tab** ⇒ mốc khớp E ⇒ đường tự động trả "đã đồng bộ" và **không gọi máy chủ** ⇒
  **không chuyển chủ** ⇒ mọi lead của A nổ trên màn hình khoá máy B đang cầm, **kèm tên phụ
  huynh**, và B không nhận gì cả ngày. Cổng 4 khi đó chặn đúng lời gọi tạo nên **"lưới thứ hai"**
  của Đợt 5.
- **cờ `da-tat-tay` theo origin ⇒ BỊT MIỆNG NGƯỜI KHÁC.** A bấm "Tắt trên máy này" cuối buổi ⇒
  sáng sau B đăng nhập trên đúng máy lễ tân đó và **không bao giờ** được đăng ký lại, trong khi
  `NHAN.DA_BAT` vẫn hứa "thông báo sẽ tới máy này" — tức nhân viên đang **được dặn** rằng "chưa
  nhận gì" là bình thường.

`nguoiDung` **không phải dữ liệu mới trong HTML**: `components/admin/topbar.tsx` và
`app/(teacher)/teacher/layout.tsx` đã truyền đúng `session.user.id` cho client từ trước (đã đo).

**Dây nối phải là `register() → navigator.serviceWorker.ready → tuDangKyLaiPush(reg, nguoiDung)`:**
- không dùng registration mà `register()` trả về — worker có thể còn `installing`, và
  `pushManager.subscribe()` trên registration chưa có `active` worker ném `InvalidStateError`, tức
  **đúng lượt tải ĐẦU của một máy mới** (lượt duy nhất thật sự cần) sẽ hỏng còn mọi lượt sau lại
  chạy ⇒ bug không tái hiện được khi đi thử. `[PUSH-D6-T08]` cho `register()` và `ready` trả **hai
  đối tượng khác nhau** rồi khẳng định hàm nhận đúng bản của `ready`;
- không tách ra một `useEffect` riêng — việc cài worker bị hoãn tới sự kiện `load`, nên effect độc
  lập chạy TRƯỚC và không thấy registration nào ở lượt tải đầu.

### 18.2 VIỆC 2 — lưới THỨ BA ở `events.signOut` của Auth.js

`lib/push/thu-hoi.ts → thuHoiKhiAuthSignOut`, cắm ở `lib/auth.ts`. Giữ nguyên hai nửa cũ; đây là
lưới **thứ ba**, không thay thế.

**Nó phủ THÊM gì:** mọi lượt **POST** tới endpoint signout — đo ở
`@auth/core/lib/actions/signout.js`. Cụ thể là ai POST thẳng `/api/auth/signout`, gồm trang xác
nhận đăng xuất mặc định của Auth.js (repo không khai `pages.signOut`, không link nào trỏ tới, nên
đường đó reachable chứ chưa ai dùng).

**Nó KHÔNG phủ gì** (đọc mã thật, không suy diễn): `if (!sessionToken) return` ở đầu hàm ⇒ phiên
đã hết cookie thì không bắn · `jwt.decode` ném (cookie rác, khoá lệch) ⇒ không bắn, vì cùng một
khối `try` · `GET /api/auth/signout` chỉ render trang xác nhận · và **cả trên đường nó phủ, nó chỉ
phủ NẾU hai truy vấn xong dưới trần 1,5 giây**.

⚠️ **HAI NỬA CŨ ĐI QUA EVENT THEO HAI CÁCH KHÁC NHAU**, và khác biệt đó là lý do không nửa nào
thay thế được nửa nào (bản đầu của chú thích gộp chúng làm một — lăng kính sửa):
- nửa **SERVER** (`/dang-xuat` → `signOut()` của `@/lib/auth`) dựng một **POST nội tiến trình** ⇒
  không thể bị huỷ giữa đường;
- nửa **CLIENT** (`logoutToGate` → `signOut` của `next-auth/react`) là một **`fetch` từ trình
  duyệt** ⇒ **HUỶ ĐƯỢC**: mất mạng đúng lúc bấm, bấm Stop, đóng tab giữa lúc chờ thì server **không
  bao giờ** chạy event. Nên `goDangKyPushCuaMayNay` vẫn là nửa không thay thế được.

**GỌI `thuHoiNeuTaiKhoanChet`, TUYỆT ĐỐI KHÔNG `thuHoiMoiThietBiCuaNguoi`** — đây là cả ngữ nghĩa
của việc. Event phát ở MỌI lượt đăng xuất, kể cả lượt thường ngày của một tài khoản còn sống. Cắm
sai hàm là đảo ngược quyết định vận hành ở §14.2: đăng xuất ở máy công ty buổi tối thành **mất push
trên điện thoại riêng**, im lặng.

**Trần chờ 1,5 giây là BẮT BUỘC, và nó phải ĐỂ LẠI VẾT.** `@auth/core` gọi
`await events.signOut?.({ token })` **không có timeout nào**. Nhánh "tài khoản đã chết" tốn **hai**
lượt DB (`findUnique` + `updateMany`) — tức nhánh duy nhất bắt buộc phải xong lại là nhánh **chậm
gấp đôi**, nên nó dễ vượt trần nhất. Khi vượt, vế thua của `Promise.race` **không bao giờ settle**
nên `catch` không chạy và `console.warn` của `thuHoiMoiThietBiCuaNguoi` cũng không chạy ⇒ trước bản
vá này, ca test thực chất đang **PHÊ CHUẨN sự bỏ qua im lặng**. Nay trần thắng thì log một dòng
tường minh kèm `userId`, và timer được `clearTimeout` ở `finally`. `[PUSH-D6-T10]` còn **chặn trên
và chặn dưới** giá trị hằng (500 ≤ `CHO_SIGNOUT_MS` ≤ 2000) — không có vế đó thì đổi nó thành
`120_000` vẫn xanh, mà mỗi lượt đăng xuất có thể treo hai phút khi pooler chập.

⚠️ **`/dang-xuat` nay tính cùng một quyết định HAI LẦN — TRÙNG CÓ CHỦ ĐÍCH, đừng "dọn".** Chi phí
đo được: 2 lượt đọc + tối đa 2 lượt ghi cho một lượt ghé route (lượt ghi thứ hai lọc
`status: "ACTIVE"` ra 0 dòng nên **idempotent**, và mốc/lý do của lượt đầu còn nguyên — lăng kính
phản bác được nỗi lo "ba nửa ghi đè nhau"). Giữ cả hai vì chúng **không cùng tính chất**: lời gọi
trong route **không có trần**, nên nó là lượt duy nhất **chắc chắn hoàn tất** cho một tài khoản đã
chết; lưới ở event có trần (đăng xuất không được treo) và bù lại phủ những lượt POST mà repo không
tự gọi.

**Trần cộng dồn của một cú bấm Đăng xuất nay là 3,0 giây xấu nhất** (1,5s client cho
`goDangKyPushCuaMayNay` + 1,5s server cho event trước khi dọn cookie). Ghi ra để không ai ngạc
nhiên lúc nghiệm thu. Thiệt hại là **cảm giác treo**, không phải phiên còn mở: nếu người dùng bỏ
đi, trình duyệt vẫn hoàn tất POST nên phiên vẫn bị dọn. Hạ `CHO_SIGNOUT_MS` xuống ~800ms là lựa
chọn có sẵn (nhánh sống chỉ cần 1 lượt đọc) — **chưa làm, cần chủ dự án chốt**.

**`import "server-only"` trong bundle middleware: ĐÃ ĐO, không ném.** `proxy.ts` import `auth`, nên
`lib/auth.ts` (và qua nó `lib/push/thu-hoi.ts`) vào bundle middleware. `pnpm build` exit=0; chunk
middleware 720.305 → 721.637 byte (+1,3 KB); `@prisma/client` vẫn external. Lăng kính đo thêm:
trên đúng chunk đó, chuỗi log của `thu-hoi` có mặt nhưng chuỗi `"cannot be imported from a Client
Component"` **không** ⇒ `server-only` phân giải ra bản server. Và proxy được biên dịch cho **node**,
không phải edge (`functions-config-manifest.json` → `"/_middleware": { "runtime": "nodejs" }`).

### 18.3 CỔNG THỨ NĂM ở server — vá HAI LỖ mà VIỆC 1 tự đẻ ra

Lăng kính Đợt 6 tìm ra hai lỗ **NẶNG**, cả hai là hệ quả trực tiếp của việc bản đã làm **rộng hơn**
bản đề xuất ở §14.4. Cả hai luật dưới đây **phải ở server**: client không có danh tính đáng tin, và
cái máy cần chặn thì ta **không với tới được** để cắm cờ. Đường tự động gửi `tuDong: true`; đường
bấm tay **cố ý không gửi** — chính nó là chỗ người dùng tạo tiền sử.

**LUẬT 1 — "người này đã từng ĐỒNG Ý trên trang này".** Quyền thông báo thuộc về **ORIGIN**, không
thuộc về ai. Máy lễ tân, một hồ sơ Chrome: Sale A bấm "Bật" (quyền origin thành `granted` vĩnh
viễn) rồi đăng xuất; Sale B đăng nhập và **lượt tải trang đầu tiên tự ghi danh B**. B chưa bao giờ
được hỏi, mà từ đó mọi lead của B nổ trên màn hình khoá của cái máy **đặt ở sảnh**, kèm tên phụ
huynh, trong tầm mắt khách đang chờ. Nay `tuDong: true` đòi **ít nhất một dòng** `(userId của
phiên, origin của header)` — bất kể trạng thái, vì dòng của lần bật cũ đã bị đăng xuất đưa về
`REVOKED`. Không có tiền sử ⇒ từ chối, **không tạo gì**.

**LUẬT 2 — không hồi sinh một dòng bị thu hồi vì lý do KHÁC "vừa rời ghế".** Nút "Gỡ" một thiết bị
**Ở XA** (mất điện thoại; hoặc một máy ở cơ sở khác) không thể `unsubscribe()` — ta không với tới
trình duyệt đó. **Trước Đợt 6, gỡ từ xa là DỨT ĐIỂM.** Với đường tự động, lượt tải trang kế tiếp
trên đúng máy đó thấy đăng ký cũ còn sống, khoá vẫn khớp, rồi nhánh `update` dọn
`revokedAt`/`revokedReason`/`failureCount` và đặt lại `ACTIVE` ⇒ **hồi sinh đúng dòng vừa gỡ**, và
danh sách thiết bị không có gì báo là nó đã quay lại (`createdAt` vẫn là ngày cũ). Nay chỉ **một**
lý do được hồi sinh: `"Tắt trên máy này"` — lý do mà nút "Tắt" và nửa client của đăng xuất cùng
dùng, và nút "Tắt" còn cắm cờ `da-tat-tay` nên đường tự động không tới được đó ⇒ phần còn lại đúng
là đăng xuất. Ba lý do còn lại (tự gỡ · tài khoản chết · chuyển chủ) đều là **một quyết định của
con người** mà máy không được tự lật lại ⇒ đòi một cú bấm.

Lý do đó là **một hằng dùng chung** (`LY_DO_TAT_MAY_NAY`) giữa câu ghi và cổng đọc. Hằng dùng chung
**không tự canh** được việc ai đó thay một chỗ bằng chuỗi gõ tay — đã cấy đúng lỗi đó và bộ test
vẫn xanh — nên `[PUSH-D6-T14]` **đọc chuỗi THẬT** từ câu ghi của đường đăng xuất rồi nạp lại vào
cổng, kèm một vế đối chứng với một chuỗi khác.

⚠️ Cờ `tuDong` **chỉ SIẾT, không bao giờ nới** — đó là lý do nhận nó từ client vẫn an toàn: kẻ gửi
`tuDong: false` chỉ nhận đúng đường mà nút bấm tay vốn đã có, không thêm quyền nào. Có ca test pin
đúng tính chất đó; ngày nào cờ này nới được điều gì thì lập luận này sập.

### 18.4 Một phát hiện MÔI TRƯỜNG phải ghi ra, kẻo bộ test sau xanh giả

Trong bộ test của repo, biến toàn cục **`localStorage` KHÔNG phải `Storage` của jsdom** mà là một
object rỗng prototype `null` — **Node 25 tự phát ra** một `localStorage` toàn cục (kèm cảnh báo
`--localstorage-file` không có đường dẫn hợp lệ) và bản đó thắng bản của jsdom ⇒
`localStorage.getItem` ném `TypeError`. `sessionStorage` thì **vẫn là bản thật** — càng dễ nhầm, vì
một nửa trông như đang chạy.

Hệ quả nếu không dựng stub: mọi hàm trong `bo-nho-may.ts` đi nhánh `catch`, `daTatTayOMayNay()` luôn
trả `true` ⇒ đường tự động **luôn thoát ở cổng 2**, và cả bộ test XANH mà không kiểm gì.
`tests/_helpers/storage-gia.ts` tồn tại vì điều đó và mang cả phép đo trong chú thích. Ca
`[PUSH-D6-T03]` còn có một vế **chống xanh vô nghĩa**: `expect(new Set(ketCuc).size)
.toBeGreaterThan(4)` — nếu tám lượt cùng thoát ở một cổng thì phép đếm `requestPermission` xanh một
cách vô nghĩa, và đó chính là điều xảy ra khi quên cắm storage.

Kèm một thay đổi nhỏ có lý do đo được: dời lời đọc `NEXT_PUBLIC_VAPID_PUBLIC_KEY` từ **module
scope** vào **trong `bat()`**. Đọc ở module scope thì `vi.stubEnv` **vô tác dụng** (module đã nạp
trước khi `beforeEach` chạy) — đó là lý do nhánh `bat()` chưa từng có ca test nào, và là lý do dòng
`stubEnv("…", "x")` trong bộ test cũ không kiểm gì. Trên prod không đổi: `NEXT_PUBLIC_*` nhúng lúc
build.

### 18.5 Đã kiểm những gì

| Cổng | Kết quả |
|---|---|
| `pnpm typecheck` | exit=0 |
| `pnpm lint` | exit=0 — 2 cảnh báo CÓ SẴN, không đổi |
| `pnpm test:unit` | exit=0 — **6148 qua**, 440 tệp (trước Đợt 6: 6057 / 437) |
| `pnpm build` | exit=0 |
| `pnpm lint:boundaries` | exit=0 — 34 cảnh báo, **không đổi** |
| Cấy lại lỗi | **46/46 ĐỎ đúng chỗ** (18 VIỆC 1 · 7 VIỆC 2 · 21 bản vá lăng kính). Mỗi ca grep xác minh phép thay đã ăn rồi mới chạy; đối chiếu byte sau khi khôi phục |

**Đo bundle client** (grep `.next/static`, **có đối chứng dương**): ba chuỗi server-only của module
push → **0 tệp**; đối chứng dương `"Bật thông báo"` → 2 tệp; chuỗi của đường mới → đúng 2 chunk
client đó. Không dùng được bản đồ chunk→route: build Turbopack **không phát**
`app-build-manifest.json` (nợ, §18.6).

**Lăng kính phản biện** chạy **tuần tự, chỉ đọc**, bốn góc nhìn (VIỆC 1 · VIỆC 2 · test thật? · bán
kính nổ). `git status` giữ nguyên suốt và HEAD không đổi; cả bốn agent tự khai `da_ghi_tep = false`
— yêu cầu cứng sau sự cố Đợt 4. Nó tìm ra **hai lỗ NẶNG** (§18.3), **8 mục VỪA/NHẸ đã vá**, và
**7 ca test XANH GIẢ** mà bộ cũ không bắt được — đáng kể nhất:

- `[PUSH-D6-T11]` pin `events.signOut` bằng `toContain` trên **văn bản nguồn** ⇒ lách được bằng
  **đúng một dấu `//`** (chú thích cũng là text; `@typescript-eslint/no-unused-vars` chỉ ở mức
  `warn` và `pnpm lint` không có `--max-warnings` nên lint exit 0). Nay pin bằng **AST** qua
  `typescript` (đã có sẵn, **không thêm dependency**): đúng một khoá `events`, không spread nào
  mang `events`, `signOut` là một **định danh trần** tên `thuHoiKhiAuthSignOut`. Kèm pin
  `session.strategy === "jwt"` **đặt cạnh** — repo có `adapter: PrismaAdapter(db)` nên mặc định
  của `@auth/core` là chiến lược *database*; ai "dọn" dòng `strategy` (nó trông như mặc định dư
  thừa) thì thư viện bắn `({ session })` chứ không `({ token })`, cổng `!("token" in message)`
  thoát sớm, và **lưới thứ ba tắt im lặng**.
- vế `expect(src).not.toContain("thuHoiMoiThietBiCuaNguoi")` là **ĐỎ GIẢ**: repo viết chú thích dài
  giải thích "đừng làm X", nên nêu tên hàm bị cấm trong một lời cảnh báo là đủ làm test đỏ mà hành
  vi y nguyên. Nay chỉ xét đúng biểu thức được cắm.
- cổng `huy` **nằm trong chuỗi Promise** (cửa sổ "đang cài, người dùng bấm sang trang khác") chưa
  có ca nào — ca mang tên đó chỉ chứng minh `removeEventListener` chạy. Nay có ca giữ `ready` để
  mở đúng cửa sổ đó.
- không cổng nào canh **"không log endpoint đầy đủ"** trên đường nóng mới, trong khi **Sentry
  browser đang bật** với `replaysOnErrorSampleRate: 1.0`. Nay `[PUSH-D6-T07]` chạy 5 nhánh lỗi rồi
  khẳng định log không chứa endpoint / `p256dh` / `auth`, **kèm đối chứng dương** là đã log gì đó.
- hai nhánh thoát của cổng khoá (`THIEU_KHOA`, `KHOA_KHONG_DOI_CHIEU_DUOC`) **không để lại vết
  nào**. Ca thật đang chờ sẵn: người vận hành đặt ba biến VAPID trên Vercel rồi **không deploy
  lại** — `NEXT_PUBLIC_*` nhúng lúc BUILD, nên đường tự động của **cả công ty** chết và triệu chứng
  duy nhất là "sao tôi không nhận được thông báo". Nay mỗi nhánh log một dòng, và có ca đếm.

**Lăng kính cũng PHẢN BÁC được** (ghi để người sau không đo lại): ba nửa **không** ghi đè
`revokedAt`/`revokedReason` của nhau (vế `status: "ACTIVE"` trong `where` lo việc đó) · **không**
đếm sai `soDong` · Đợt 6 thêm **đúng 1–2** lượt DB cho một cú bấm đăng xuất (cú bấm vốn đã ≈10
lượt, phần lớn do `resolveActor`) · vế thua của `Promise.race` **không thể** gây
`unhandledRejection` (cả hai lượt DB tự `try/catch`) · `updateMany` là **một câu autocommit** nên
thực thể bị đóng băng để lại "đã áp dụng" hoặc "chưa", không bao giờ nửa hàng · **không** tìm được
đường nào gỡ sạch push của một nhân viên **còn sống** · phụ huynh trên môi trường một-origin
**không thể** gỡ push của nhân viên qua lưới mới (vế `userId` lo) · lưới mới **không** mở đường cho
kẻ ngoài kích hoạt thu hồi từ xa (POST đòi CSRF token) · **không** module nào khác trong repo xin
quyền thông báo ⇒ **trên prod, ngày merge và ngày bật công tắc, cổng 1 thoát cho 100% nhân viên**,
nên VIỆC 1 im lặng hoàn toàn tới lần có người bấm "Bật" đầu tiên (hệ quả dùng được: ba phát hiện
nặng sẽ lộ ra **trên `test.satarobo.vn` trước**, nơi UAT đã bấm).

### 18.6 Nợ — ghi có ý thức, KHÔNG vá trong đợt này

Phạm vi đóng băng. Mọi mục dưới đây lăng kính tìm ra nhưng **ngoài hai việc**, hoặc thuộc mã của
đợt khác.

1. **Cổng `[PUSH-D3-T14]` KHÔNG đi theo cây import** — nợ chủ dự án đã chỉ đích danh "ghi sổ, đừng
   sửa". Nay **đo được** chứ không còn là lý thuyết: `app/(portal)` import từ **sáu** thư mục
   component dùng chung (`components/{assignments,chat,lms,portal,report-card,transcript,ui}`) mà
   cổng chỉ quét đúng `components/portal` ⇒ thêm `<ServiceWorkerRegister/>` vào một component
   `components/chat/**` mà trang portal đang vẽ là cài worker lên `hocvien.satarobo.vn` **mà cổng
   vẫn xanh**. Hướng đóng: đảo từ blacklist sang **whitelist**, hoặc cho cổng đi theo cây import từ
   mỗi `page.tsx`/`layout.tsx` của bốn nhóm route.
2. **LÚC TÀI KHOẢN CHẾT không lưới nào chạy** — xem §14.4 (cửa sổ hở thứ 7). Đây là **việc đáng làm
   nhất tiếp theo**; hướng (b) là một câu join trong engine.
3. **`accountStatus` là cột sống thứ ba** — xem §14.4.
4. **Nhánh `LOI` lặp lại ở mọi lượt tải trang cứng, không có lùi.** Mốc `da-dong-bo` cố ý chỉ đặt
   khi THÀNH CÔNG (để thử lại), nên một lỗi server dai dẳng ⇒ mỗi lượt tải trang cứng một lượt gọi
   action. Ca kích hoạt đang chờ: nếu ai bấm "Bật" **trước** khi migration chạy thì quyền thành
   `granted` vĩnh viễn và `dangKyThietBiAction` ném P2021 mãi. Hai việc rẻ khi làm: một mốc "vừa
   thử và TRƯỢT" theo phiên tab (~10 phút), và bọc phần DB của action để nó **trả** `ok:false` thay
   vì ném (ném ở Server Action là một ngoại lệ "server error" vào Sentry cho việc người dùng không
   yêu cầu).
5. **Xoay khoá VAPID: dòng cũ vẫn `ACTIVE`.** Đường tự động `unsubscribe()` đăng ký cũ nhưng
   **không thu hồi dòng cũ** ở máy chủ. Phần lớn tự chữa (endpoint đã huỷ ⇒ push service trả 410 ⇒
   `EXPIRED`); phần không tự chữa là khi `unsubscribe()` **thất bại** — lúc đó dòng cũ sống, engine
   gửi bằng khoá mới ⇒ **403 `CHET`** ⇒ `DEAD` ngay lượt đầu, và người dùng thấy một **dòng ma**
   trong `/settings` không biết gỡ cái nào. `bat()` có **đúng cùng lỗ** ⇒ sửa thì phải sửa cả hai
   (mã Đợt 3). Đo kèm: **cửa sổ giữa lúc xoay khoá và lượt tải admin kế tiếp là MẤT TIN, không phải
   hoãn tin** (403 → `DEAD` ngay, không `THU_LAI`).
6. **`navigator.serviceWorker.ready` có thể không bao giờ resolve** ⇒ chuỗi treo im lặng, `.catch`
   không chạy, **không một dòng log**. Rẻ khi làm: `Promise.race` với 15s rồi `console.warn`.
7. **`public/sw.js` không có handler `pushsubscriptionchange`** — sự kiện DUY NHẤT trình duyệt bắn
   khi chính nó xoay/thu hồi đăng ký. Đợt 6 **giảm** nợ này (lượt tải admin kế tiếp dựng lại) nhưng
   nó vẫn là đường duy nhất chữa được cho người **không mở tab admin nào** — đúng nhóm mà push sinh
   ra để phục vụ. Khi làm: service worker **không có Server Action**, phải POST vào một route xác
   thực bằng cookie ⇒ quyết riêng.
8. **`layThietBiCuaToi` không `.catch`** ⇒ nếu mã lên **trước** migration thì `/admin/settings` và
   `/teacher/ho-so` trả trang lỗi cho mọi nhân viên (câu `centers` ngay dưới nó thì CÓ
   `.catch(() => [])`, nên đây là chỗ sót chứ không phải quyết định). Mã Đợt 3; và thứ tự bật ở
   §18.7 đã xử lý được ca này.
9. **Công tắc `push.webPushEnabled` KHÔNG gác VIỆC 1.** Nó chỉ được đọc ở đầu `chayLuotGuiPush`
   (engine). Đường **đăng ký** thiết bị không đọc nó — cố ý từ Đợt 3, để nghiệm thu được đường ghi
   trước khi mở kênh. Hệ quả phải nhớ: **cần rollback nhanh của VIỆC 1 là biến env + redeploy,
   KHÔNG phải công tắc.**
10. **Cờ `da-tat-tay` theo (người × origin), không theo thiết bị.** Cùng người, hai trình duyệt
    trên cùng một máy là hai cờ rời — đúng, vì đăng ký cũng rời. Nhưng nhánh `!sub` của
    `tatMayNay()` (nay cắm cờ) **gần như không tới được từ giao diện** và không có ca test: nút chỉ
    hiện khi `tt === "DA_BAT"`, mà trạng thái đó đòi `getSubscription()` đã trả một sub ⇒ chỉ tới
    được trong một cuộc đua. Không phải lỗi; ghi để người sau đừng tưởng nó có lưới.
11. **Cổng khoá VAPID lệch của đường BẤM TAY chưa từng được ca nào chạy** (`[PUSH-D6-T09]` bấm
    "Bật" với `endpointHienTai = null`). Đường TỰ ĐỘNG thì có. Mã Đợt 3.
12. **Không có bản đồ chunk→route** để khẳng định mã push client không được phục vụ trên origin phụ
    huynh: build Turbopack không phát `app-build-manifest.json`. Phép đo hiện dùng là grep
    `.next/static` cho chuỗi `server-only` (0 tệp) **kèm đối chứng dương** — nó chứng minh mã
    server không lọt xuống client, **không** chứng minh mã client tới host nào.

### 18.7 Việc người vận hành phải làm — theo đúng thứ tự

Công tắc `push.webPushEnabled` vẫn **TẮT**. Không migration nào được chạy tay: `migrate-test.yml`
tự chạy `prisma migrate deploy` khi push `test`.

1. Merge PR vào `test`. Đợi **cả hai** workflow xong: `CI` và `Migrate TEST DB`.
2. Nạp **ba biến env VAPID** cho môi trường `test`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. ⚠️ Cả ba phải là **Non-sensitive**, và
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY` **nhúng lúc BUILD** ⇒ **phải redeploy** sau khi đặt, nếu không
   bundle đang chạy vẫn mang `undefined` (nay có một dòng log nói ra ca đó).
3. Vào `/settings` trên `test.satarobo.vn`, bấm **"Bật thông báo"** một lần. Đây là bước tạo **tiền
   sử** mà LUẬT 1 của §18.3 đòi; không có nó, đường tự động cố ý không làm gì.
4. Bật công tắc `push.webPushEnabled` ở màn Cấu hình vận hành.
5. Tạo một lead mới để sinh một thông báo `lead.moi:` (allowlist đợt này chỉ có đúng tiền tố đó).

Ba phát hiện nặng của §18.3 sẽ lộ ra **trên `test` trước prod** — trên prod chưa ai bấm "Bật" nên
cổng 1 thoát cho 100% nhân viên.
