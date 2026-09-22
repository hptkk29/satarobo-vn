# 04 — Migrate chat CŨ sang hệ MỚI (sóng 3, Đợt 1)

> Tài liệu cho **người vận hành**. Đọc hết mục 1 và 2 trước khi gõ `--apply`.
>
> - Lõi: [`lib/chat/migrate-legacy.ts`](../../lib/chat/migrate-legacy.ts) · unit test: `lib/chat/migrate-legacy.test.ts`
> - CLI: [`scripts/migrate-chat-cu-sang-moi.ts`](../../scripts/migrate-chat-cu-sang-moi.ts)
> - Quyết định gốc: Q3 trong [`00-dieu-chinh-cho-repo.md`](./00-dieu-chinh-cho-repo.md) — hệ mới **thay thế** hệ cũ ở Đợt 1, nhưng theo 2-phase: **KHÔNG xoá bảng/service cũ**. Script này **chỉ ĐỌC** `ConversationMessage`, không sửa/xoá một dòng nào.

---

## 1. Hai điều phải quyết TRƯỚC khi chạy

### 1.1. Riêng tư đổi bản chất — đây là quyết định của chủ dự án, không phải của người chạy script

| | Hệ CŨ (`ConversationMessage`) | Hệ MỚI (`Conversation`/`Message`) |
|---|---|---|
| Đơn vị hội thoại | **1 luồng / 1 `enrollmentId`** | **1 nhóm / 1 lớp** (`CLASS_GROUP`) |
| Ai đọc được | PH của **đúng học viên đó** + nhân viên | **Mọi** thành viên nhóm lớp: tất cả PH của lớp + GV + trợ giảng + QLCS |

Hệ mới **không có** khái niệm hội thoại-theo-enrollment, nên tin cũ chỉ có một chỗ để về: nhóm lớp của `enrollment.classId`. Hệ quả: **tin cũ vốn riêng tư giữa một phụ huynh và nhân viên sẽ hiện với toàn bộ nhóm lớp sau khi migrate.**

Đây là hệ quả của chính việc "thay hệ cũ bằng hệ mới", không phải lỗi script. Nhưng nó là một quyết định về dữ liệu cá nhân ⇒ **phải do chủ dự án chốt**, không được chạy `--apply` vì "thấy dry-run đẹp".

Dry-run in sẵn thước đo độ lớn: `Trong đó N/M lớp có từ 2 học viên trở lên từng nhắn tin` — đó là các lớp mà PH này chắc chắn sẽ đọc được lịch sử của PH kia.

Ba lựa chọn nếu không chấp nhận việc phơi này (cần quyết định riêng, script hiện tại **không** làm):

1. Không migrate — để hệ cũ chạy song song ở chế độ chỉ-đọc cho tới khi lịch sử hết giá trị.
2. Chỉ migrate tin của các lớp có đúng 1 học viên từng nhắn (`--classes <danh sách>`).
3. Đổ vào `DM_TEACHER_PARENT` thay vì nhóm lớp — giữ được tính riêng tư nhưng phải chốt "nhân viên nào là đầu bên kia" cho luồng cũ vốn là PH ↔ *nhiều* nhân viên. Đây là một thiết kế khác, không phải một cờ.

### 1.2. Lớp đã đóng thì không có nhóm để đổ tin vào

`syncConversationMembership` chỉ dựng nhóm cho lớp **ACTIVE** (BR-01). Lớp `COMPLETED`/`CANCELLED`/xoá mềm mà **chưa từng** có nhóm ⇒ không có chỗ đổ ⇒ tin bị đánh `NO_CONVERSATION` và **bỏ qua**.

Script **cố ý không bịa nhóm mới** cho lớp đã đóng: tạo nhóm cho lớp đã kết thúc là trái BR-01 và làm phụ huynh thấy một nhóm "sống lại" trong danh sách. Nếu lớp đã đóng **đã có** nhóm (vì lớp từng ACTIVE) thì tin vẫn đổ vào bình thường.

⚠️ Trên dữ liệu thật, đây nhiều khả năng là rổ **lớn nhất** — phần lớn lịch sử chat thuộc về các lớp đã học xong. Chạy dry-run để biết con số trước khi bàn tiếp.

---

## 2. Bảng ánh xạ trường

### 2.1. Tin nhắn

| Hệ cũ `ConversationMessage` | Hệ mới `Message` | Ghi chú |
|---|---|---|
| `id` | `clientMsgId` = `legacy:<id>` | **Khoá idempotent + dấu truy vết.** `id` cũ là cuid nên duy nhất toàn hệ. Muốn biết một tin đến từ đâu → nhìn `clientMsgId`. |
| — | `id` | uuid mới, sinh lúc lập kế hoạch |
| `enrollmentId` → `enrollment.classId` | `conversationId` của `Conversation(CLASS_GROUP, CLASS, classId)` | Mục 1.1 |
| `authorSide = PARENT` | `senderId` | Ưu tiên **`authorUserId`** (hệ cũ ghi người gửi thật ở cả 2 phía, cột NOT NULL). Tài khoản đó đã xoá → rơi về `student.parentUserId`. Không có nốt → **bỏ tin**, không gán bừa. |
| `authorSide = STAFF` | `senderId` | Ưu tiên `authorUserId`. Đã xoá → `Class.teacherId`, rồi `Class.assistantId` — **đây là SUY ĐOÁN**, đếm riêng ở dòng "Người gửi SUY ĐOÁN" của dry-run, và luôn truy ngược được về tin gốc qua `clientMsgId`. |
| `body` | `body` (đã `trim`) | Rỗng sau trim → bỏ (`Message.body` NOT NULL) |
| `createdAt` | `createdAt` | **Giữ nguyên mốc gốc** — thứ tự lịch sử là thứ quan trọng nhất khi migrate |
| — | `kind` | Luôn `CHAT` |
| `centerId` | — | Không chép: `Conversation` mang `centerId` của lớp, `Message` không có cột này |
| `readByParentAt` | `ConversationParticipant.lastReadAt` + `.lastReadMessageId` của **PH của chính học viên đó** | Xem 2.2 |
| `readByStaffAt` | **KHÔNG migrate** | Xem 2.2 |

### 2.2. Trạng thái đã đọc

- **Phía PH — migrate được.** `readByParentAt` nằm trên tin của STAFF mà PH đã đọc, và chủ thể xác định được (`student.parentUserId`). Với mỗi PH trong mỗi lớp, lấy tin **đã đọc có `createdAt` lớn nhất** → `lastReadMessageId`, và `readByParentAt` của tin đó → `lastReadAt`.
- **Phía STAFF — KHÔNG migrate được.** Hệ cũ đánh dấu theo **PHÍA** (`readByStaffAt` là một mốc dùng chung cho mọi nhân viên), không ghi *ai* đã đọc. Hệ mới đọc theo **từng participant**. Không có cách suy ra người đọc mà không bịa ⇒ bỏ hẳn. Hệ quả thực tế: sau migrate, GV/QLCS thấy lịch sử ở trạng thái "chưa đặt mốc đọc" — vô hại vì `unreadCount` không bị bơm (dưới đây).
- **`unreadCount` — cố ý KHÔNG đụng.** Lịch sử migrate coi như đã đọc. Nếu bơm `unreadCount` thì mỗi phụ huynh mở app sẽ thấy badge "N tin chưa đọc" cho những tin từ nhiều tháng trước — phiền và vô nghĩa.
- Mốc đọc chỉ **TIẾN, không lùi**: participant đã có `lastReadAt` mới hơn thì giữ nguyên.

### 2.3. Hội thoại và thành viên

- Nhóm lớp chưa có → gọi **`syncConversationMembership`** (nguồn dựng nhóm + thành viên duy nhất của repo). Script **không tự `create` Conversation/participant** — làm vậy sẽ lệch luật dẫn xuất (GV, PH của HV đang thuộc lớp, QLCS) và lệch việc ghi kép `centerId`/`orgUnitId`.
- Nhóm lớp **đã có** → dùng lại, **không** gọi sync. Lý do: sync trên nhóm đã tồn tại sẽ diff thành viên và có thể sinh SYSTEM message "đã tham gia/rời nhóm" + event kick. Một lần chạy migrate dữ liệu **không được đẻ ra thông báo cho phụ huynh**.
- `Conversation.lastMessageAt` chỉ **TIẾN, không lùi** — lịch sử cũ không đẩy hội thoại đang sống tụt xuống cuối danh sách.
- Người gửi **không nhất thiết là thành viên nhóm** (vd nhân viên Sale đã nghỉ phụ trách lớp). Hệ mới không ràng buộc FK cho `senderId`, tin vẫn hiển thị được — nhưng nếu UI hiện tên rỗng thì đây là lý do.

---

## 3. Những gì KHÔNG migrate được

| Mã | Nghĩa | Vì sao không migrate |
|---|---|---|
| `NO_CONVERSATION` | Lớp không ACTIVE và chưa có nhóm | Mục 1.2 — không bịa nhóm cho lớp đã đóng |
| `ENROLLMENT_DELETED` | `Enrollment.deletedAt` khác null | Hệ cũ **đã ẩn** luồng này (`lib/conversation/service.ts` lọc `deletedAt: null`). Migrate = hồi sinh nội dung đã bị ẩn ⇒ cố ý bỏ |
| `SENDER_UNRESOLVED` | Không xác định được người gửi | Tin PH mà tác giả đã xoá **và** học viên chưa có tài khoản PH (`parentUserId` null); hoặc tin STAFF mà lớp không còn GV/trợ giảng nào. Gán bừa = vu cho người ta câu họ không nói |
| `EMPTY_BODY` | Nội dung rỗng sau `trim` | `Message.body` NOT NULL |
| `CLASS_MISSING` | Không suy được lớp từ enrollment | Phòng thủ; `Enrollment.classId` là FK NOT NULL nên thực tế không xảy ra |
| `ENROLLMENT_MISSING` | Không còn enrollment | Phòng thủ; `ConversationMessage.enrollmentId` là FK `onDelete: Cascade` nên thực tế không xảy ra |

"Đã migrate ở lần chạy trước" (`alreadyMigrated`) **không** nằm trong rổ này — nó là kết quả bình thường của việc chạy lại.

Bất biến kiểm được: `plannedMessages + alreadyMigrated + skipped == totalRows`.

---

## 4. Cách chạy

### 4.1. Dry-run (mặc định — không ghi gì)

```bash
pnpm exec tsx scripts/migrate-chat-cu-sang-moi.ts                # toàn bộ
pnpm exec tsx scripts/migrate-chat-cu-sang-moi.ts --limit 200    # 200 tin cũ đầu (theo createdAt)
pnpm exec tsx scripts/migrate-chat-cu-sang-moi.ts --classes id1,id2
```

Dòng đầu output luôn in `DB host` và `DB target`. **Đọc kỹ 2 dòng đó.**

> ⚠️ **DB của môi trường `test` CHÍNH LÀ DB dev** (CLAUDE.md, mục "Nhánh & môi trường"). Chạy `--apply` ở máy local là đổi luôn dữ liệu đang hiện trên `test.satarobo.vn`.

### 4.2. Apply (ghi thật)

```bash
MIGRATE_CONFIRM=<project ref in ở dòng "DB target"> \
  pnpm exec tsx scripts/migrate-chat-cu-sang-moi.ts --apply
```

`MIGRATE_CONFIRM` phải khớp **project ref Supabase** đang trỏ tới. Cố ý **không** dùng tên database: Supabase đặt tên `postgres` cho mọi project, gõ `MIGRATE_CONFIRM=postgres` thì prod và dev giống hệt nhau và hàng rào thành vô dụng.

Cách chạy an toàn được khuyến nghị:

1. Dry-run toàn bộ → đọc số liệu, chốt mục 1.1 với chủ dự án.
2. `--apply --classes <1 lớp>` → kiểm bằng mục 5.
3. `--apply` toàn bộ.

Mỗi lớp là **một transaction riêng** (`timeout: 30_000`). Lớp lỗi được log `[chat-migrate] ERROR class=…` và **không kéo theo lớp khác**; chạy lại chỉ đụng phần còn thiếu.

### 4.3. Idempotent — chạy lại bao nhiêu lần cũng được

Khoá là `clientMsgId = legacy:<id cũ>`. Kiểm ở **3 tầng**:

1. Lúc lập kế hoạch — tin đã có `clientMsgId` tương ứng trong bảng `Message` không được lên kế hoạch lần hai.
2. Lúc vào transaction — đọc lại `clientMsgId` đã có trong chính hội thoại đó (kế hoạch có thể đã cũ vài phút).
3. Unique `(conversationId, senderId, clientMsgId)` ở schema + `skipDuplicates`.

Tầng 2 là tầng quan trọng nhất: unique ở tầng 3 **không** bắt được trường hợp hai lần chạy suy ra `senderId` khác nhau (tài khoản GV bị xoá giữa hai lần chạy) — kiểm theo `clientMsgId` mới đúng.

`lastReadMessageId` tra theo `clientMsgId` **lúc apply**, không dùng id dự kiến trong kế hoạch — nên chạy lại vẫn trỏ đúng tin đã nằm sẵn trong DB từ lần trước.

---

## 5. Kiểm sau khi chạy

```sql
-- 1) Đếm tin đã migrate (phải khớp `Tin đã chèn` cộng dồn qua các lần chạy)
SELECT count(*) FROM "Message" WHERE "clientMsgId" LIKE 'legacy:%';

-- 2) Không tin nào bị nhân đôi (phải trả 0 dòng)
SELECT "clientMsgId", count(*) FROM "Message"
WHERE "clientMsgId" LIKE 'legacy:%' GROUP BY 1 HAVING count(*) > 1;

-- 3) Mốc thời gian gốc được giữ (min/max phải khớp bảng cũ)
SELECT min("createdAt"), max("createdAt") FROM "Message" WHERE "clientMsgId" LIKE 'legacy:%';
SELECT min("createdAt"), max("createdAt") FROM "ConversationMessage";

-- 4) Đối chiếu tổng: tin cũ = đã migrate + không migrate được
SELECT count(*) FROM "ConversationMessage";

-- 5) Bảng cũ phải NGUYÊN VẸN (script chỉ đọc) — so với số đếm trước khi chạy
SELECT count(*) FROM "ConversationMessage";

-- 6) Không có tin migrate nào lọt vào hội thoại KHÔNG phải nhóm lớp (phải trả 0)
SELECT count(*) FROM "Message" m JOIN "Conversation" c ON c."id" = m."conversationId"
WHERE m."clientMsgId" LIKE 'legacy:%' AND c."type" <> 'CLASS_GROUP';
```

Trên giao diện: mở `/admin/hoi-thoai` (hoặc nhóm lớp tương ứng ở portal) — lịch sử cũ phải nằm **đúng thứ tự thời gian**, ở **đầu** hội thoại, và tin mới nhất của nhóm không bị đẩy sai vị trí trong danh sách.

Đo số liệu **trước** khi chạy (chạy trên Supabase SQL Editor của môi trường đích — với prod đây là đường duy nhất):

```sql
SELECT count(*) AS tong_tin,
       count(DISTINCT e."classId") AS so_lop,
       count(*) FILTER (WHERE e."deletedAt" IS NOT NULL) AS tin_enrollment_xoa_mem,
       count(*) FILTER (WHERE cl."status" <> 'ACTIVE' OR cl."deletedAt" IS NOT NULL) AS tin_lop_khong_active,
       count(*) FILTER (WHERE cm."authorSide" = 'PARENT' AND s."parentUserId" IS NULL) AS tin_ph_chua_co_tk
FROM "ConversationMessage" cm
JOIN "Enrollment" e ON e."id" = cm."enrollmentId"
JOIN "Class" cl ON cl."id" = e."classId"
JOIN "Student" s ON s."id" = e."studentId";
```

---

## 6. Quay lui

Toàn bộ tin migrate mang `clientMsgId` bắt đầu bằng `legacy:` ⇒ gỡ sạch bằng một câu:

```sql
-- Xem trước sẽ xoá bao nhiêu
SELECT count(*) FROM "Message" WHERE "clientMsgId" LIKE 'legacy:%';

-- Gỡ mốc đọc trỏ vào tin sắp xoá (nếu không, cột trỏ tới id không còn tồn tại)
UPDATE "ConversationParticipant" p
SET "lastReadMessageId" = NULL
WHERE p."lastReadMessageId" IN (
  SELECT "id" FROM "Message" WHERE "clientMsgId" LIKE 'legacy:%'
);

-- Xoá đính kèm (migrate không tạo đính kèm — câu này chỉ để chắc chắn)
DELETE FROM "MessageAttachment" a
USING "Message" m
WHERE a."messageId" = m."id" AND m."clientMsgId" LIKE 'legacy:%';

-- Xoá tin đã migrate
DELETE FROM "Message" WHERE "clientMsgId" LIKE 'legacy:%';
```

Sau khi xoá:

- **Bảng cũ không cần khôi phục** — script chưa bao giờ đụng vào nó (2-phase: `ConversationMessage` + `lib/conversation/service.ts` vẫn nguyên).
- `Conversation.lastMessageAt` có thể còn trỏ mốc cũ. Vô hại (chỉ ảnh hưởng thứ tự danh sách); muốn dọn sạch:
  ```sql
  UPDATE "Conversation" c SET "lastMessageAt" = (
    SELECT max(m."createdAt") FROM "Message" m WHERE m."conversationId" = c."id"
  );
  ```
- `lastReadAt` của participant có thể còn mốc suy từ hệ cũ. Vô hại (chỉ là dấu "đã đọc").
- **Nhóm lớp do lần migrate dựng ra sẽ Ở LẠI.** Đúng như vậy: nhóm lớp là dữ liệu của US-03, lẽ ra đã tồn tại từ khi lớp chuyển ACTIVE; migrate chỉ tình cờ là thứ chạy `syncConversationMembership` trước. Xoá nhóm là gỡ nhầm thứ không thuộc phạm vi rollback này.

---

## 7. Trạng thái nghiệm thu (09/08/2026)

- Dry-run trên **DB dev**: `ConversationMessage` có **0 dòng** ⇒ mọi số liệu đều bằng 0. Dev/test không có lịch sử chat cũ để đo — số thật **chỉ có ở prod**, đo bằng câu SQL ở mục 5 trên Supabase SQL Editor.
- Đường đọc + lập kế hoạch + ghi đã được nghiệm thu trên DB dev bằng bộ dữ liệu ZZTEST dựng tạm rồi xoá (8 tin cũ phủ đủ 4 nhánh bỏ qua + suy đoán người gửi + mốc đọc + chạy lại): 7/7 PASS, 2 lần liên tiếp. Bộ ZZTEST **không** nằm trong repo.
- `lib/chat/migrate-legacy.test.ts`: 20 case, phủ toàn bộ luật ánh xạ ở mục 2 và 3.
