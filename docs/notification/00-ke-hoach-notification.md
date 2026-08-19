# Kế hoạch — Hệ thống Notification cho Sata Robo

**Nguồn yêu cầu:** `D:\Web SataRobo\satarobo-notificarion\PRD-He-Thong-Notification-Web.md` (PRD-NOTI-WEB-v1.0, 19/08/2026) + `prototype-notification.html`
**Ngày lập:** 19/08/2026
**Trạng thái:** ĐANG THỰC THI — Q-C và Q-D đã chốt 19/08; N0→N3 đã code (xem §10 Nhật ký)

> **Đọc trước một điều:** PRD được viết cho một hệ thống **chưa có gì** (tên giả "WorkHub", route `/work/tasks`, `/inbox/conversations`, bảng `notifications` + `notification_recipients`, kênh SSE, counter Redis).
> Satarobo **đã có sẵn** một hệ thống chuông đang chạy prod với 15+ nguồn sinh thông báo, và đã có hạ tầng realtime riêng.
> Vì vậy đây **không phải dự án làm mới** — đây là **nâng cấp + vá nợ**. Chép nguyên PRD vào repo là dựng hệ thứ hai song song với hệ đang chạy.

---

## 1. Hiện trạng repo (đã đo, có file:line)

| Thành phần | Đã có ở đâu | Khớp PRD tới đâu |
|---|---|---|
| **Bảng lưu thông báo per-user** | `StaffNotification` — `prisma/schema.prisma:4304` (userId, category, title, body, href, dedupeKey, readAt, unique `[userId,dedupeKey]`) | ≈ 60% bảng `notification_recipients` PRD. **Thiếu:** `priority`, `group_key`, `seen_at`, `entity_type/entity_id`, `aggregate_count`, `expires_at`, `state` |
| **Engine sinh việc tồn** | `lib/pending-tasks.ts` — 14 loại `PendingTaskType`, đã lọc theo quyền + cơ sở | PRD không có khái niệm này. Đây là **tài sản riêng của satarobo**, mạnh hơn PRD |
| **Đồng bộ + đọc/chưa đọc** | `lib/staff-notifications.ts` | Có `dedupeKey`, có mark-read/mark-all. **Có 1 lỗi nặng — xem §3** |
| **API chuông** | `app/api/admin/notifications/bell/route.ts` (GET + POST) | Chưa tách `/summary`; chưa có phân trang; chưa có nhóm |
| **UI chuông** | `components/admin/notification-bell.tsx` **và** `app/(teacher)/teacher/_components/notification-bell.tsx` (2 bản copy-paste) | Badge `>9 → 9+` đã đúng. **Thiếu:** quy tắc `1 = chỉ chấm`, ring P1, chip lọc nhóm, seen≠read, undo, skeleton/empty/error, a11y |
| **Nguồn sinh thông báo** | 15+ file: cron `sla-check`, `session-close-reminder`, `substitute-teacher-notify`, `parent-request-reminder`, `payment-reconcile`, `reserve-expiry` + handler `lib/_handlers/*`, `lib/notify/attendance.ts`, `lib/crm/*`, `lib/trial/service.ts`… | PRD gọi đây là W-1 "phải dựng mới". **Đã dựng rồi** |
| **Realtime** | Supabase Broadcast private channel `user:{User.id}` — `lib/chat/broadcast.ts`, `components/chat/user-channel.ts` (hub refcount + resync + gia hạn vé), badge chat realtime ở `components/admin/sidebar.tsx:331` | PRD đề xuất SSE. **Không cần** — xem Đ2 |
| **Outbox sự kiện** | `lib/events/` + cron `dispatch-events` mỗi phút | Đủ để làm fan-out bất đồng bộ |
| **Feed phụ huynh** | `Notification` (broadcast) + `/portal/thong-bao` — hệ **riêng biệt**, không dùng chung | PRD không nhắc. Giữ nguyên, không gộp ở V1 |
| **Giờ làm việc chuẩn** | **KHÔNG CÓ.** `lib/locations.ts:37` chỉ là chuỗi marketing `"T2 - T7: 8:00 - 20:00"`. Có `model Holiday` (`schema.prisma:1023`) | PRD Q2 chặn W-7 — đúng, và ở đây là **chặn thật** |

---

## 2. Quyết định điều chỉnh PRD (6 điều, ai review cũng phải đọc)

### Đ1 — Route `/notifications` ĐÃ BỊ CHIẾM, trang mới đặt tên `/thong-bao`
`app/(admin)/admin/notifications/` là **CMS thông báo gửi phụ huynh** (`notifications:manage`), **đang nằm trên sidebar** (`components/admin/sidebar.tsx:186` — "Thông báo PH").
→ Trang "Tất cả thông báo" của PRD đổi thành **`/thong-bao`** trên host admin + host giáo viên.
→ Ràng buộc cốt lõi của PRD **giữ nguyên**: `/thong-bao` **không** được thêm vào sidebar; chỉ vào từ chuông hoặc URL.
→ Việc phải làm kèm: thêm `"thong-bao"` vào `ADMIN_ROUTE_SEGMENTS` (`lib/auth/route-policy.ts:90`) + test — quên bước này là 404 ở host admin (bài học đã ghi trong memory dự án).

### Đ2 — BỎ SSE. Realtime đi bằng kênh `user:{id}` đã chạy thật
PRD W-6 muốn SSE + leader election + BroadcastChannel. Repo đã có **đúng cái cần**: private channel `user:{User.id}`, policy đọc, endpoint vé, hub refcount client, `resync` mỗi lần `SUBSCRIBED`.
Thêm SSE nghĩa là: trên Vercel mỗi tab giữ một function chạy dài, và dựng lại từ đầu toàn bộ phần chống-join-trùng mà `components/chat/user-channel.ts` đã trả giá để có (xem cảnh báo `realtime.setAuth` giết kênh trong file đó).
→ Server phát thêm 1 event nhẹ `notification.bumped` (không PII, không body) trên topic sẵn có. Client mở rộng `UserChannelEvent`.
→ **Rủi ro T6 của PRD (spike SSE) đóng luôn, không cần sprint 0 cho nó.**

### Đ3 — KHÔNG tách 2 bảng `notifications` + `notification_recipients`
PRD thiết kế bảng gốc + bảng fan-out. `StaffNotification` vốn đã là **bảng fan-out** (mỗi dòng = 1 người nhận), 15+ producer đang ghi vào nó trên prod.
Tách 2 bảng = migrate toàn bộ 15 producer + dữ liệu prod, đổi lấy một lợi ích (khử trùng nội dung) mà quy mô hiện tại không cần.
→ **Giữ 1 bảng, thêm cột** (§4). 2-phase migration theo luật `.claude/rules/prisma-db.md`.
→ Luật Nền Hệ thống #3 ("bảng mới phải có `orgUnitId`") **không áp dụng**: bảng này là dữ liệu **theo người**, không theo đơn vị; phạm vi đã được ép ở đường sinh (`getPendingTasks` lọc theo actor). Ghi rõ ở đây để reviewer không bắt lỗi nhầm.

### Đ4 — KHÔNG dùng Redis counter, KHÔNG có job đối soát counter
PRD T2 sinh ra từ giả định "counter Redis lệch DB". Ở quy mô satarobo (≈ trăm nhân sự), `/summary` là **1 câu `groupBy` trên index `(userId, readAt)`** — nhanh hơn ngưỡng 150ms mà không cần tầng cache nào.
→ Bớt luôn một nguồn lỗi mà PRD tự xếp hạng "chặn phát hành".

### Đ5 — Bảng deep-link 7.7 phải viết lại 100%
Không route nào trong PRD tồn tại ở đây. Ánh xạ thật:

| Mã PRD | Route thật (host admin) | Host giáo viên | Ghi chú |
|---|---|---|---|
| `MSG.PARENT_NEW` | `/tin-nhan?c={conversationId}` | `/tin-nhan` | `lib/_handlers/conversation-notif.ts`. **Vá 19/08:** trước đó ghi `?e={enrollmentId}` — trang `/tin-nhan` đã sang hệ chat mới, chỉ đọc `c`, nên chuông rơi vào hộp thư rỗng. Hội thoại tra là `CLASS_GROUP` của `enrollment.classId` (ánh xạ chuẩn ở `lib/chat/migrate-legacy.ts`); lớp chưa có nhóm → `/tin-nhan` trần. Dòng cũ trên prod vẫn mang `?e=` (upsert không ghi đè `update`) |
| `ACTION.CHECKIN_REQUIRED` | `/attendance?sessionId={id}` | `/diem-danh?sessionId={id}` | `lib/notify/attendance.ts` |
| `ACTION.APPROVAL_PENDING` | `/don-tu`, `/de-xuat-giao-an`, `/hoan-tien`, `/chuyen-lop` … | `/don-tu` | **Nhiều màn duyệt, không phải một** |
| `TASK.*` | **KHÔNG CÓ module "đầu việc" chung** | — | Việc ở satarobo là `LeadTask`, `StudentCareTask`, `WorkRequest`, `ParentRequest` — 4 mô hình khác nhau |
| `DUE.*` | Theo từng module | — | |
| `ACTION.REPORT_MISSING` | `/cham-cong/checklist-co-so` | — | |
| `SYS.*` | `/thong-bao/{id}` | `/thong-bao/{id}` | |

→ **Việc bắt buộc ở N0:** dựng `lib/notifications/catalog.ts` — mỗi loại khai đủ **6 trường** (mã, nhóm, mức, người nhận, deep-link, dedupeKey) như PRD §7.4 yêu cầu, và **test chặn merge** nếu thiếu trường.

### Đ6 — 3 site chứ không phải 1
Chuông phải sống ở **admin** + **giáo viên** (và **sale** khi site đó lên). `href` lưu dạng **canonical đường admin**, resolve theo host bằng cách mở rộng `lib/teacher/notification-href.ts`.
Hiện `teacherHref` trả `null` cho đường không map được ⇒ **GV thấy thông báo nhưng bấm không đi đâu**. Phải phủ hết bảng ở Đ5.

### Đ7 — Portal phụ huynh KHÔNG nằm trong V1
PRD viết cho "nhân sự". Portal đã có feed riêng. Gộp 2 hệ là một dự án khác — ghi vào V2, không làm lẫn.

---

## 3. Nợ đang có trong repo — phải vá TRƯỚC khi làm PRD

### 🔴 BUG-1 — Chuông tự dập đọc mọi thông báo không sinh từ `getPendingTasks`
`lib/staff-notifications.ts:71-80`:

```ts
const stale = await db.staffNotification.findMany({
  where: { userId: user.id, readAt: null },          // ← LẤY TẤT CẢ
});
const toRead = stale.filter((s) => !desiredKeys.has(s.dedupeKey));  // ← desiredKeys chỉ có "<type>:pending" / "<type>:overdue"
await db.staffNotification.updateMany({ where: { id: { in: toRead } }, data: { readAt: new Date() } });
```

`desiredKeys` **chỉ** chứa key sinh từ `getPendingTasks`. Mọi producer khác dùng key riêng — `attendance.edited:{sessionId}` (`lib/notify/attendance.ts:170`), `session.close-reminder:{id}`, `session.substitute:{id}` (`lib/lms/session-teacher-notify.ts:79,122`), `sla:{rule}:{leadId}` (`lib/crm/sla.ts:141`), `conversation.message_posted:{msgId}`, `intake-failing:*`, sinh nhật, yêu cầu PH…

**Hệ quả:** `getStaffNotifications()` gọi `syncStaffNotifications()` **trước khi** trả danh sách ⇒ nhóm thông báo đó bị set `readAt` **ngay trong chính request mở chuông**, badge **không bao giờ đếm chúng**. Người dùng thấy chúng ở trạng thái đã-đọc, mờ, lẫn dưới đáy danh sách.

Đây chính là rủi ro **T4 của PRD** ("mở panel làm badge về 0") — nhưng ở dạng nặng hơn: không phải toàn bộ badge biến mất, mà **một nửa hệ thống thông báo chưa từng phát ra tín hiệu nào**. Bao gồm: điểm danh bị sửa hồi tố, lịch dạy thay, nhắc chốt buổi, SLA lead quá hạn, tin nhắn phụ huynh.

**Vá:** thêm cột `sourceKind` (`PENDING_SYNC` | `EVENT`), reconcile chỉ đụng `PENDING_SYNC`. Backfill theo hậu tố dedupeKey. Test hồi quy bắt buộc.

### 🟠 BUG-2 — Mở chuông = chạy toàn bộ engine việc tồn
`GET /api/admin/notifications/bell` → `getStaffNotifications` → `syncStaffNotifications` → `getPendingTasks` (14 nhóm, hàng chục query, `resolveActor`, `getSetting`). Và cả 2 chuông **poll mỗi 60 giây** (`components/admin/notification-bell.tsx:38`, `.../teacher/_components/notification-bell.tsx:51`).
⇒ Mỗi nhân sự online tạo ~1 lần quét toàn hệ/phút. Không có cách nào đạt `/summary` p95 < 150ms với kiến trúc này.
**Vá:** tách `/summary` (1 câu `groupBy`, không sync) khỏi `/list` (mới sync). Sync chuyển sang chạy theo cron + theo sự kiện, không chạy trong đường đọc.

### 🟠 BUG-3 — 2 bản chuông copy-paste
Sửa một bên quên bên kia là chắc chắn. Gộp về `components/notifications/` dùng chung, khác nhau chỉ ở hàm resolve href theo host.

### 🟡 BUG-4 — `teacherHref` trả `null` ⇒ thông báo mất link ở site GV
`lib/teacher/notification-href.ts` phủ 8 tiền tố; các đường còn lại (leads, cham-soc-hv, don-tu duyệt, hoc-bu…) rơi về `null`.

---

## 4. Thiết kế đích (bản satarobo)

### 4.1 Migration `StaffNotification` (2-phase, additive trước)

```prisma
model StaffNotification {
  // giữ nguyên: id, userId, category, title, body, href, dedupeKey, readAt, createdAt, updatedAt
  groupKey       String   @default("system")  // action_required|parent_message|new_task|due_date|system
  priority       Int      @default(2)         // 1=P1 khẩn, 2=P2, 3=P3
  sourceKind     String   @default("EVENT")   // PENDING_SYNC | EVENT  ← vá BUG-1
  seenAt         DateTime? @db.Timestamptz(6) // "đã nhìn thấy" ≠ "đã đọc"
  entityType     String?                      // conversation|session|lead|request|…
  entityId       String?
  aggregateCount Int      @default(1)
  expiresAt      DateTime? @db.Timestamptz(6)
  state          String   @default("ACTIVE")  // ACTIVE | EXPIRED | REVOKED

  @@index([userId, state, readAt, createdAt(sort: Desc)])
  @@index([userId, groupKey, readAt])
}
```

Backfill: `groupKey`/`priority` suy từ `category` + tiền tố `dedupeKey` (script dry-run, **người vận hành chạy tay** — luật Nền Hệ thống #4). `sourceKind = PENDING_SYNC` cho key khớp `^(<14 loại>):(pending|overdue)$`, còn lại `EVENT`.

**Không drop cột nào.** `preview` dùng lại `body` (đã có), không thêm cột.

### 4.2 Catalog — nguồn sự thật duy nhất cho loại thông báo

`lib/notifications/catalog.ts` (thuần, test được bằng Vitest):

```ts
export const NOTI_CATALOG = {
  "ATTENDANCE.EDITED": {
    group: "action_required", priority: 1, entity: "session",
    href: (p) => `/attendance?sessionId=${p.sessionId}`,
    dedupe: (p) => `attendance.edited:${p.sessionId}`,
  },
  // … mỗi loại đủ 6 trường
} satisfies Record<string, NotiDef>;
```

Test chặn merge: mọi key trong catalog phải đủ 6 trường; mọi `dedupeKey` producer đang dùng phải có mặt trong catalog (quét bằng grep-test) — đây là cách thi hành quy tắc PRD §7.4 "thiếu 1 trong 6 → không được merge".

### 4.3 API

| Method | Endpoint | Ghi chú |
|---|---|---|
| GET | `/api/notifications/summary` | `{ total_unread, has_priority_1, badge:{show_dot,label}, groups[] }`. **Badge do BE tính** (giữ đúng W-2 của PRD). 1 câu `groupBy`, không sync |
| GET | `/api/notifications?group=&status=&cursor=&limit=20` | Cursor pagination; **chỉ endpoint này** chạy `syncStaffNotifications` |
| POST | `/api/notifications/[id]/read` · `/unread` · `/read-all` | `read-all` nhận `{group?}` — tôn trọng chip đang lọc |
| GET/PUT | `/api/notifications/preferences` | N4 |

Endpoint cũ `/api/admin/notifications/bell` **giữ nguyên, proxy sang endpoint mới** trong 1 phase rồi mới gỡ (2-phase — 2 chuông prod đang gọi nó).

### 4.4 Realtime

- Server: trong helper ghi `StaffNotification`, sau commit → `broadcastUserEvent(userId, "notification.bumped", { unread })` (fail-and-forget, đúng luật `lib/chat/broadcast.ts`: broadcast hỏng **không** rollback).
- Client: mở rộng `UserChannelEvent` trong `components/chat/user-channel.ts` thêm `{ type: "noti" }`; nghe được → gọi `/summary`. Mỗi lần `resync` cũng gọi `/summary`.
- Đa tab: hub refcount đã lo (1 kết nối/trình duyệt). Không cần `BroadcastChannel` + leader election riêng như PRD.
- Polling dự phòng: `/summary` mỗi 90s (thay vì 60s gọi full engine như hiện tại).

### 4.5 FE

```
components/notifications/
  notification-bell.tsx      # chuông + badge (0 / chấm / 2–9 / 9+ / ring P1)
  notification-panel.tsx     # 420px, chip 5 nhóm, sắp theo score §7.5, seen≠read
  notification-item.tsx
  use-notification-summary.ts
  tab-badge.ts               # (N) đầu document.title + chấm đỏ trơn favicon (canvas)
app/(admin)/admin/thong-bao/page.tsx     # trang tất cả — KHÔNG lên sidebar
```

shadcn only (luật `.claude/rules/ui-libraries.md`). `tab-badge.ts` làm đúng **phương án A** của PRD: số ở title, chấm trơn ở favicon, suy biến im lặng nếu trình duyệt không đổi được favicon.

---

## 5. Kế hoạch theo giai đoạn

Ước lượng theo nhịp thực tế của repo (1 người dev + review).

### N0 — Vá nợ + đo thật (≈ 3 ngày) · **làm trước, không phụ thuộc PRD**
| # | Việc | Xong là gì |
|---|---|---|
| N0-1 | Vá BUG-1: cột `sourceKind`, reconcile chỉ `PENDING_SYNC` | Test: tạo notif cron → mở chuông → **vẫn chưa đọc**, badge đếm |
| N0-2 | Tách `/summary` khỏi sync (BUG-2) | `/summary` không gọi `getPendingTasks`; đo p95 |
| N0-3 | Gộp 2 chuông về `components/notifications/` (BUG-3) | 1 component, 2 site dùng chung |
| N0-4 | **Đo tải thật** (PRD T3): đếm StaffNotification/người/ngày trên 30 ngày prod | Nếu p90 > 25 → siết cửa sổ gộp **trước** khi code FE |
| N0-5 | **Audit deep-link** (PRD T1): dựng catalog, đánh dấu loại nào không có đích ổn định | Loại nào không trỏ được → **hoãn khỏi V1**, không phát hành nửa vời |

**Cổng ra N0:** N0-5 cho thấy < 70% loại trỏ được đúng chỗ → thu hẹp scope, không hạ chuẩn.

### N1 — Lõi dữ liệu (≈ 4 ngày)
Migration §4.1 (dry-run + chạy tay) · backfill · `lib/notifications/catalog.ts` + test 6-trường · API `/summary` + `/list` + read/read-all/undo · endpoint cũ proxy.

### N2 — Chuông + panel + nhãn tab (≈ 6 ngày) — *trái tim của PRD*
Badge 4 mốc + ring P1 · panel 5 nhóm + chip đếm · sắp xếp theo `score` §7.5 · **seen ≠ read** (mở panel không về 0 — rủi ro T4) · mark-read + undo 10s · optimistic + rollback · skeleton/empty/error · a11y (focus trap, `Esc`, ↑↓, `aria-live` throttle 10s) · `(N)` title + favicon dot · realtime qua `user:{id}` · bottom sheet < 1024px.

### N3 — Trang `/thong-bao` (≈ 3 ngày)
Rail lọc (nhóm/trạng thái/thời gian) · filter đồng bộ URL · cuộn vô hạn 20 mục · gộp theo ngày · `ADMIN_ROUTE_SEGMENTS` + test · **ảnh chụp sidebar trước/sau** (DoD của PRD).

### N4 — Chống nhiễu + escalation + cài đặt (≈ 5 ngày) = V1.1 của PRD
Cửa sổ gộp theo loại + `aggregateCount` · trần 30/ngày · im lặng ngoài giờ **(chặn bởi Q-C, xem §7)** · escalation QLTT theo cơ sở (`MSG.PARENT_WAITING`, `DUE.OVERDUE`) · `NotificationPreference` per user · tìm kiếm trong `/thong-bao`.

### Ngoài V1 (không làm đợt này)
Push trình duyệt · Zalo/Email cho P1 · digest buổi sáng · snooze · gộp feed phụ huynh · bàn giao thông báo khi nghỉ việc (PRD E2).

**Tổng V1 (N0→N3): ≈ 3,5 tuần.** N4 thêm ≈ 1 tuần.

---

## 6. Ưu tiên — RICE điều chỉnh theo hiện trạng

| Hạng mục | PRD xếp | Ở đây | Vì sao lệch |
|---|---|---|---|
| Vá BUG-1 (N0-1) | không có trong PRD | **cao nhất** | Không vá thì mọi thứ xây lên trên đều đo sai; 1 ngày công |
| Nhãn tab (W-8) | RICE 250 — cao nhất | **giữ cao** | Vẫn rẻ (< 1 ngày), vẫn mở rộng tiếp cận ngoài tab |
| Nền tảng (W-1) | RICE 100 | **thấp hơn** | Đã có 80%, chỉ còn thêm cột |
| Realtime SSE (W-6) | RICE 56 | **rẻ hơn nhiều** | Hạ tầng đã chạy — chỉ thêm 1 event |
| Deep-link (W-4) | RICE 80 | **đắt hơn PRD tưởng** | Phải viết lại toàn bộ bảng ×3 site + không có module "task" chung |

---

## 7. Câu hỏi phải chốt trước khi code

| # | Câu hỏi | Ai quyết | Chặn gì |
|---|---|---|---|
| Q-A | Trang tất cả thông báo đặt tên **`/thong-bao`** (vì `/notifications` đã là CMS thông báo PH) — duyệt? | Chủ dự án | Chặn N3 |
| Q-B | Có làm chuông cho **portal phụ huynh** không, hay chỉ nhân sự như PRD? | Chủ dự án | Chặn phạm vi |
| Q-C | **Giờ làm việc chuẩn từng cơ sở** (để tính "2 giờ làm việc" + im lặng ngoài giờ). Repo **không có dữ liệu này** — chỉ có `Holiday` và chuỗi marketing | HR | **Chặn N4** (như PRD Q2) |
| Q-D | Dữ liệu "đã đọc lúc mấy giờ" **có được dùng để đánh giá nhân sự không?** | BGĐ | **Chặn phát hành** (PRD Q3/E1 — nếu không chốt, nhân sự sẽ mở panel để "xoá badge" và mọi chỉ số thành vô nghĩa) |
| Q-E | Giữ thông báo bao lâu? Đề xuất: hiện 90 ngày, lưu 1 năm | Chủ dự án | Ảnh hưởng index + job dọn |
| Q-F | Badge mốc 1: **chỉ chấm** (theo PRD) hay hiện số ngay? Chuông hiện tại đang hiện số từ 1 | Chủ dự án | Nhỏ — 1 hằng số |
| Q-G | Có bật chuông cho **site sale** khi site đó lên không? | Chủ dự án | Ảnh hưởng thiết kế resolve href |

---

## 8. Definition of Done (rút từ PRD Phụ lục A, bỏ mục không áp dụng)

- [ ] Sidebar **không** thêm mục nào — có ảnh chụp trước/sau
- [ ] Badge đúng 4 mốc: 0 / 1 / 2–9 / ≥10 (`9+`) + ring khi có P1
- [ ] **Mở panel KHÔNG set `readAt`**, badge không về 0 (test hồi quy bắt buộc — rủi ro T4)
- [ ] **Thông báo do cron/handler sinh vẫn đếm vào badge** (test hồi quy BUG-1)
- [ ] `(N)` ở **đầu** `document.title`, trả nguyên gốc khi hết chưa đọc
- [ ] Favicon **chấm đỏ trơn, không ký tự**, tương phản ở cả nền sáng/tối, suy biến im lặng nếu không đổi được
- [ ] Số chỉ xuất hiện ở **một chỗ** (title), không lặp ở favicon
- [ ] Mọi loại trong catalog trỏ đúng vị trí + highlight **ở cả 2 host** (admin + GV) — không loại nào rơi về `null`
- [ ] Đủ 4 nhánh lỗi deep-link: xoá / mất quyền / thiếu anchor / mất mạng
- [ ] Realtime: badge đổi ≤ 3s (p95), 1 kết nối/trình duyệt, `resync` bù sau mất mạng
- [ ] **Không có SĐT / số tiền trong `title` và `body`** — test tự động chặn regex
- [ ] Trạng thái rỗng / tải / lỗi đủ cho panel và trang
- [ ] a11y: bàn phím, `aria-label`, `aria-live` throttle, `prefers-reduced-motion`
- [ ] `pnpm typecheck && pnpm lint && pnpm build` PASS + smoke 375px

---

## 9. Việc KHÔNG làm (ghi rõ để không ai "sửa" ngược)

- ❌ Không thêm tab "Thông báo" vào sidebar bất kỳ site nào (PRD T7 — kể cả khi test khả dụng cho thấy trang khó tìm; cách xử lý là onboarding hoặc menu avatar).
- ❌ Không dựng SSE song song với Supabase Broadcast.
- ❌ Không tách `StaffNotification` thành 2 bảng ở V1.
- ❌ Không gộp feed phụ huynh (`Notification`) vào hệ nhân sự ở V1.
- ❌ Không thêm counter Redis + job đối soát.
- ❌ Không popup tự bung, không âm thanh mặc định bật.

---

## 10. Nhật ký thực thi — 19/08/2026

Chủ dự án chốt 2 câu chặn, phần còn lại được thực hiện liền mạch.

### Hai câu đã chốt

| # | Câu hỏi | Chốt | Hệ quả đã làm |
|---|---|---|---|
| **Q-C** | Giờ làm việc chuẩn từng cơ sở | Chung **T3–CN 07:45–21:00, tuỳ cơ sở** (số liệu từng cơ sở cung cấp sau). **Quản trị tự khai trên web**, và **sau này từng vai có giờ khác nhau** → phải linh động, không sửa code | Bảng `WorkingHourRule` (orgUnit × vai × thứ) + engine `lib/working-hours/` + màn khai trong cấu hình cơ sở |
| **Q-D** | Mốc "đã đọc" có dùng đánh giá nhân sự không | **CÓ** | `seenAt`/`readAt` tách bạch và **chỉ ghi một lần, không đè lại** — nếu không thì số liệu dùng để đánh giá sẽ sai. Rủi ro hành vi (PRD E1: người dùng mở panel để "xoá badge") đã nêu, chủ dự án đã quyết, ghi lại ở đây để sau này đọc số biết mà trừ hao |

### Đã làm

**Vá nợ (N0)**
- 🔴 **BUG-1 đã vá** — `lib/notifications/pending-sync.ts` + `lib/staff-notifications.ts`. Vòng đồng bộ việc tồn nay chỉ đụng khoá của chính nó; thông báo do cron/handler sinh không còn bị dập đã-đọc trong chính request mở chuông. 23 test khoá hành vi.
- **BUG-2 đã vá** — `/api/notifications/summary` là một câu `groupBy`, KHÔNG chạy `getPendingTasks`. Đồng bộ việc tồn chuyển sang đường liệt kê (chỉ khi mở panel).
- **BUG-3 đã vá** — hai bản chuông copy-paste bị xoá, thay bằng `components/notifications/notification-bell.tsx` dùng chung.
- **BUG-4 đã vá** — `teacherHref` không còn làm rơi id (`/classes/c1` → `/teacher/lop?classId=c1`).

**Deep-link gãy tìm thấy khi audit (ngoài dự kiến của kế hoạch ban đầu)**
| Chỗ gãy | Trước | Sau |
|---|---|---|
| Tin nhắn phụ huynh | `/tin-nhan?e={enrollmentId}` — trang đã sang hệ chat mới, chỉ đọc `?c=` ⇒ tới **hộp thư rỗng** | `/tin-nhan?c={conversationId}` (tra hội thoại `CLASS_GROUP` của lớp) |
| Dạy thay + nhắc chốt buổi | `/lich` — segment thiếu trong `ADMIN_ROUTE_SEGMENTS` ⇒ admin host 308 → **404**; `teacherHref` trả null ⇒ GV bấm không đi đâu | khai segment + map sang `/teacher/lich` |
| Hết bảo lưu | `/students/{id}` — **không có `page.tsx`** | `/students/{id}/edit` |
| Buổi học hoàn tất | **không set href** — text chết | `/sessions/{id}` |
| Gán GV lớp trải nghiệm | `/teacher/trial` — không phải admin route ⇒ 404 | `/trials` |
| Nguồn lead hỏng | `/admin/crm/webhook-replay` — href duy nhất còn tiền tố `/admin`, ăn thêm 1 hop | `/crm/webhook-replay` |
| Đối soát ngân hàng | `/bien-dong-so-du` không tham số ⇒ rơi vào tab 200 dòng | `?status=unmatched`; nhánh "trả thiếu quá hạn" trỏ `/cong-no` |

- 🔴 **Lỗi có sẵn phát hiện thêm:** trên host giáo viên, nhánh "chuẩn hoá path lạc khu" chạy TRƯỚC nhánh rewrite clean URL, nên **5 clean URL của chính site GV** (`don-tu`, `hoc-ba`, `huong-dan`, `scorm`, `tin-nhan` — trùng tên segment admin) bị ném về trang chủ, im lặng, không lỗi. Đã đảo thứ tự hỏi trong `decideRoute()` + `TEACHER_ROUTE_SEGMENTS` + test khoá cả 6 tên (kể cả `lich` mới thêm).
- 🟡 **Lỗi có sẵn chưa vá (ngoài phạm vi):** mục sidebar admin "Lịch tổng" → `/lich` là **link chết** trước bản vá này; nay đã sống. Còn `runReserveExpiryCheck` (`lib/students/reserve-expiry.ts`) là **code mồ côi** — không caller nào, trong khi cron thật dùng route handler riêng.

**Lõi (N1)**
- Migration `20260819110000_noti_v2_staff_notification_fields` — thuần thêm 8 cột + 2 index, không đổi/bỏ cột nào.
- `lib/notifications/catalog.ts` — nguồn sự thật duy nhất về nhóm/mức/đối tượng, khai theo tiền tố `dedupeKey`, khớp tiền tố dài nhất, `:overdue` tự nâng P1. Test khoá **26 khoá đang chạy thật**; chạy trên DB dev: **237/237 bản ghi phân loại được, 0 khoá lạ**.
- `lib/notifications/notify.ts` — đường ghi DUY NHẤT. **17 nguồn sinh đã gom về đây** (26 `dedupeKey` giữ nguyên byte-for-byte). Kèm chốt chặn PII: che số điện thoại trước khi lưu, cảnh báo khi có số tiền (PRD T5).
- `lib/notifications/badge.ts` — quy tắc badge + công thức sắp xếp §7.5, **do backend quyết** (PRD W-2).
- API `/api/notifications` + `/api/notifications/summary`. Endpoint cũ `/api/admin/notifications/bell` chưa gỡ (còn dùng được, gỡ ở pha sau).
- `scripts/noti-backfill-classification.ts` — dry-run mặc định, idempotent, đã chạy trên dev.

**Chuông + panel + trang (N2, N3)**
- Chuông dùng chung 2 site: badge 4 mốc + viền đỏ khi có P1, chip 5 nhóm kèm số, sắp theo độ khẩn, **mở panel chỉ đặt `seen` — badge KHÔNG về 0**, đánh dấu đã đọc + Hoàn tác 10 giây, skeleton/rỗng/lỗi, bàn phím ↑↓/Enter/R/Esc, `aria-live`, bottom-sheet dưới 1024px.
- **Nhãn tab trình duyệt** (phương án A): `(N)` ở đầu `document.title` + chấm đỏ trơn trên favicon, theo dõi `<title>` để chuyển trang không mất số, suy biến im lặng nếu trình duyệt không đổi được favicon.
- **Realtime**: event mới `notification.bumped` trên kênh `user:{id}` ĐÃ CÓ — không SSE, không topic mới, không migration policy. Payload chỉ là mốc thời gian (BR-30: không PII, **không đẩy cả con số đếm**).
- Trang `/thong-bao` (admin) + `/teacher/thong-bao` — rail lọc nhóm/trạng thái/thời gian/tìm kiếm, bộ lọc đồng bộ URL, gộp theo ngày, tải thêm bằng cursor. **Không lên sidebar**; đã khai vào allowlist của `components/admin/nav-coverage.test.ts` kèm lý do.

**Giờ làm việc (Q-C)**
- Migration `20260819120000_working_hour_rule` (bảng mới, sentinel `"*"` thay NULL để `@@unique` hoạt động đúng).
- `lib/working-hours/` — engine thuần (`isWorkingTime`, `nextWorkingMoment`, `elapsedBusinessMs`) + tầng đọc DB với chuỗi rơi 5 bậc (đơn vị×vai → đơn vị → vai → mặc định → lưới cuối trong code).
- Màn khai giờ trong cấu hình cơ sở.

### Chưa làm (có chủ đích)

| Việc | Vì sao chưa |
|---|---|
| **Chuyển SLA sang "giờ làm việc"** (`lib/crm/sla.ts` đang tính wall-clock thuần) | Đổi cách tính quá hạn là **đổi hành vi nghiệp vụ đang chạy prod** — phải do chủ dự án quyết, không lồng vào đợt này. Engine đã sẵn sàng |
| Gộp/chống nhiễu + trần 30 mục/ngày + im lặng ngoài giờ (N4) | Phụ thuộc engine giờ làm việc vừa xong; và cần **số liệu thật** (PRD T3: mô phỏng 30 ngày) trước khi chọn cửa sổ gộp |
| Cài đặt thông báo per-user, escalation QLTT | V1.1 theo kế hoạch |
| Gộp feed phụ huynh | V2 |
| Thông báo cho 5 màn duyệt (`/don-tu`, `/de-xuat-giao-an`, `/hoan-tien`, `/chuyen-lop`, `/hoc-bu`) | Audit phát hiện **không có producer nào** — tạo đơn/đề xuất hiện KHÔNG báo ai. Là tính năng mới, không phải bug của đợt này |

### Cần người vận hành làm khi lên môi trường khác

1. `prisma migrate deploy` (2 migration mới) — CI `migrate-test.yml`/`deploy.yml` tự chạy.
2. `pnpm tsx scripts/noti-backfill-classification.ts` (dry-run) rồi `--apply` — **bắt buộc**, không chạy thì mọi thông báo cũ nằm ở nhóm "Hệ thống" và chip lọc trống.
3. Seed giờ làm việc mặc định.
