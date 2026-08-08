# BA — Module Chat Realtime, hệ thống SataRobo

> Ngày lập: 07/08/2026 · Giai đoạn: Solution space (sau OST 05/08) · Trạng thái: DRAFT v0.1 chờ Dev duyệt
> Input: OST 05/08 (Cây A ưu tiên), khảo sát MISA AMIS 27/07, security review IDOR/BOLA

---

## 0. Khung quyết định

### 0.1 Ranh giới tài liệu này

Tài liệu này **không** bàn "có nên làm chat không" — OST đã trả lời. Nó trả lời: *hệ thống phải làm đúng cái gì, theo luật nghiệp vụ nào, trên cấu trúc dữ liệu nào.* Đây là đầu vào trực tiếp cho PRD + backlog.

### 0.2 Quyết định khung: KHÔNG dựng nền data-scope 4 mức trước

Phiên trước để treo câu hỏi "làm lớp phân quyền kiểu MISA trước hay schema chat trước". **Chốt: schema chat trước, lớp phân quyền mỏng nhúng trong module.**

Lý do:

- Nền data-scope `ALL | UNIT_AND_BELOW | UNIT_ONLY | OWN` là hạng mục 4–6 tuần và chạm vào toàn bộ 14 module đang chạy PROD. Đưa nó thành tiền đề của chat là biến một module 3 tuần thành một dự án quý.
- Chat nhóm lớp **không tiêu thụ data-scope**. Thành viên nhóm lớp dẫn xuất từ quan hệ `Class → phân công GV / học viên`, không dẫn xuất từ cây đơn vị. Đây là ngoại lệ may mắn: module đầu tiên lại là module ít phụ thuộc cây tổ chức nhất.
- Chỗ **thật sự** chạm cây đơn vị chỉ là 2 quyền quản trị: "quản lý cơ sở xem danh sách hội thoại của cơ sở mình" và "HO tra cứu". Hai quyền này giải bằng cột `Conversation.centerId` + check application-layer, không cần nền.

Hệ quả: nền data-scope vẫn phải làm, nhưng làm **sau**, và chat sẽ là ca test thật đầu tiên của nó thay vì là con tin.

### 0.3 Ba nguyên tắc kiến trúc bất di bất dịch

| # | Nguyên tắc | Vì sao |
|---|---|---|
| **NT1** | **Postgres là nguồn sự thật duy nhất. Broadcast chỉ là kênh đẩy.** | Supabase Broadcast là fire-and-forget, không đảm bảo delivery. Client mất mạng 3 giây là mất tin. Mọi client phải reconcile bằng `fetch` khi (re)connect. |
| **NT2** | **Client chỉ ĐỌC realtime, không GHI realtime.** | Gửi tin đi qua Server Action (RBAC application-layer đã có) → ghi DB → server broadcast bằng service role. Client vì thế **chỉ cần policy SELECT** trên `realtime.messages`, không cần INSERT. Bề mặt tấn công giảm một nửa. |
| **NT3** | **Không hard-code `classId` vào bảng tin nhắn.** | 4 loại hội thoại dùng chung `Conversation`/`Participant`/`Message`. Một policy RLS phủ cả 4. |

---

## 1. Phạm vi

### 1.1 TRONG phạm vi P0

| Mã | Loại hội thoại | Mô tả |
|---|---|---|
| **C1** | `CLASS_GROUP` | Nhóm lớp: PH của học viên trong lớp + GV được phân công + quản lý cơ sở. Vừa thông báo lịch học, vừa trò chuyện. |
| **C2** | `DM_TEACHER_PARENT` | 1-1 giáo viên ↔ phụ huynh. Chỉ mở khi tồn tại quan hệ dạy học đang hiệu lực. |
| **C3** | `DM_SALE_PARENT` | 1-1 sale ↔ phụ huynh **đã có tài khoản** (đã ghi danh hoặc đang học thử có account). |

### 1.2 NGOÀI phạm vi P0 (có lý do, không phải quên)

| Hạng mục | Lý do hoãn | Mở lại khi |
|---|---|---|
| **PH ↔ PH 1-1** | Rủi ro kiểm duyệt cao nhất, giá trị thấp nhất. SataRobo trở thành bên vận hành kênh liên lạc riêng tư giữa hai khách hàng — tranh chấp, quấy rối, chào bán chéo đều đổ về công ty. | Có công cụ report + ẩn/chặn + quy trình xử lý khiếu nại |
| **Sale ↔ lead chưa có account** | Lead từ Facebook/landing page chưa có user trên hệ thống. Không có identity thì không có hội thoại. | Kênh này thuộc Zalo OA, **không** phải module chat |
| **Chat nội bộ nhân viên** | Cây B của OST. Đang có Discord gánh được. | Sau khi C1–C3 chạy ổn định 1 tháng |
| **Gọi thoại / video** | Không thuộc bài toán | — |
| **Sửa nội dung tin nhắn** | Chỉ cho **thu hồi** (xoá mềm), không cho sửa. Sửa tin trong ngữ cảnh trường học tạo tranh chấp bằng chứng. | Không dự kiến |
| **Reactions, thread trả lời lồng nhau** | Không đáng ở P0. Chỉ giữ `replyToId` một cấp. | P1 |

### 1.3 Giả định phải xác minh trước khi code (BLOCKER)

| Mã | Giả định | Cách xác minh | Nếu sai thì sao |
|---|---|---|---|
| **A1** | Bảng `User` của app có ánh xạ được sang `auth.uid()` của Supabase | Kiểm tra schema: có cột `supabaseUserId`/`authId` không, có index không | Policy RLS không viết được → phải bổ sung cột + backfill trước |
| **A2** | Phụ huynh đã có tài khoản đăng nhập thật trên satarobo.vn (không phải chỉ là bản ghi contact) | Đếm PH có `User` active / tổng PH đang học | Chat không có người dùng. Phải làm onboarding tài khoản PH **trước** — hạng mục riêng |
| **A3** | Quan hệ `Class → học viên → phụ huynh` là truy vấn được trong 1 query, có index | Chạy EXPLAIN trên query dẫn xuất thành viên | Đồng bộ thành viên chậm → phải denormalize |
| **A4** | Realtime đã bật, và "Allow public access" **tắt được** mà không hỏng tính năng nào đang chạy | Kiểm tra Realtime Settings trên PROD | Nếu có module khác đang dùng public channel thì phải migrate trước |

> **A2 là rủi ro lớn nhất của cả dự án.** Chat không có PH đăng nhập là một tính năng chết. Xác minh A2 trước khi viết dòng code nào.

---

## 2. Actor

| Actor | Định nghĩa trong hệ thống | Vai trò trong chat |
|---|---|---|
| **Phụ huynh (PH)** | `User` có `role=PARENT`, gắn ≥1 học viên | Thành viên nhóm lớp; chủ thể 1-1 với GV/Sale |
| **Giáo viên (GV)** | `User` có `role=TEACHER`, biên chế HO, được phân công dạy lớp | Chủ nhóm lớp; gửi được ANNOUNCEMENT |
| **Quản lý cơ sở (QLCS)** | `User` quản lý một `Center` | Quan sát viên trong nhóm lớp thuộc cơ sở mình |
| **Sale** | `User` có `role=SALE` tại cơ sở | 1-1 với PH thuộc tệp mình phụ trách |
| **Admin HO** | Quản trị hệ thống | Tra cứu có kiểm soát, xử lý báo cáo vi phạm |
| **Hệ thống** | — | Tác giả của tin `kind=SYSTEM` |

---

## 3. Luật nghiệp vụ (Business Rules)

### 3.1 Vòng đời hội thoại

| Mã | Luật |
|---|---|
| **BR-01** | Nhóm lớp được tạo **tự động** khi `Class` chuyển sang trạng thái đang hoạt động. Không có nút "tạo nhóm lớp" thủ công. |
| **BR-02** | Một `Class` có **đúng một** nhóm lớp. Ràng buộc unique trên `(type='CLASS_GROUP', subjectType='CLASS', subjectId)`. |
| **BR-03** | Khi lớp kết thúc → hội thoại chuyển `ARCHIVED`: **đọc được, không gửi được**. Không xoá. |
| **BR-04** | Sau `ARCHIVED` 90 ngày, PH mất quyền đọc; GV/QLCS/Admin vẫn đọc được (nghĩa vụ lưu vết). |
| **BR-05** | Hội thoại 1-1 GV↔PH chỉ tạo được khi tồn tại quan hệ dạy học đang hiệu lực. Quan hệ chấm dứt → `ARCHIVED` theo BR-03. |
| **BR-06** | Hội thoại 1-1 là **duy nhất theo cặp người**. Cùng một cặp GV–PH qua 3 lớp khác nhau vẫn chỉ một hội thoại, lịch sử liên tục. |
| **BR-07** | Admin HO có thể `LOCKED` một hội thoại (khoá do vi phạm) — không ai gửi được kể cả GV, cho tới khi mở lại. Mọi lần khoá/mở đều ghi audit. |

### 3.2 Thành viên

| Mã | Luật |
|---|---|
| **BR-10** | Thành viên nhóm lớp **dẫn xuất**, không thêm tay. `Participant.source = DERIVED`. |
| **BR-11** | Nguồn dẫn xuất: (a) GV được phân công dạy lớp → `MODERATOR`; (b) PH của học viên đang học lớp → `MEMBER`; (c) QLCS của cơ sở chứa lớp → `OBSERVER`. |
| **BR-12** | Thay đổi phân công GV / học viên chuyển lớp / học viên nghỉ → thành viên nhóm **tự đồng bộ** trong cùng transaction của thao tác gốc. Không dựa vào cron. |
| **BR-13** | Rời nhóm = `leftAt` có giá trị, **không xoá bản ghi**. Người đã rời không đọc được tin sau `leftAt`, vẫn đọc được tin trước đó nếu còn trong hạn BR-04. |
| **BR-14** | Một học viên có 2 PH (bố + mẹ) → cả hai đều là thành viên, đều `MEMBER`. |
| **BR-15** | `Participant.source = MANUAL` chỉ dùng cho hội thoại 1-1 và cho ngoại lệ do Admin HO thêm (có audit). Không dùng cho nhóm lớp. |

### 3.3 Tin nhắn

| Mã | Luật |
|---|---|
| **BR-20** | `Message.kind ∈ {CHAT, ANNOUNCEMENT, SYSTEM}`. ANNOUNCEMENT được ghim đầu luồng, hiển thị khác biệt, và đẩy thông báo ở mức cao nhất. |
| **BR-21** | Chỉ `MODERATOR` (GV) và Admin gửi được ANNOUNCEMENT. PH chỉ gửi CHAT. |
| **BR-22** | SYSTEM do hệ thống sinh: "Lớp đã đổi lịch buổi 12", "GV Nguyễn Văn A tham gia nhóm". Không ai gửi tay được. |
| **BR-23** | Tin đã gửi **không sửa được**. Chỉ thu hồi (soft delete) trong **15 phút** kể từ lúc gửi. Sau 15 phút chỉ Admin xoá được, và để lại vết "Tin nhắn đã bị quản trị viên gỡ". |
| **BR-24** | Xoá luôn là soft delete. `deletedAt`, `deletedBy` bắt buộc. Không có hard delete trong module này. |
| **BR-25** | Giới hạn: nội dung ≤ 4000 ký tự; ≤ 5 tệp/tin; mỗi tệp ≤ 10 MB; định dạng cho phép P0: `jpg, png, webp, heic, pdf`. |
| **BR-26** | Rate limit: PH tối đa **20 tin/phút**; ANNOUNCEMENT tối đa **10/ngày/lớp**. Vượt → chặn ở Server Action, trả lỗi rõ ràng. |

### 3.4 Riêng tư — mục quan trọng nhất về pháp lý/uy tín

| Mã | Luật |
|---|---|
| **BR-30** | Trong nhóm lớp, PH **không** nhìn thấy số điện thoại, email, địa chỉ của PH khác. Chỉ hiện tên hiển thị + "PH của <tên học viên>". |
| **BR-31** | Danh sách thành viên nhóm lớp PH xem được, nhưng ở dạng đã ẩn liên hệ như BR-30. |
| **BR-32** | Nội dung hội thoại **1-1** không ai đọc được ngoài hai người trong đó — kể cả QLCS. Admin HO chỉ đọc được khi có yêu cầu xử lý vi phạm, thao tác bắt buộc nhập lý do và ghi `AuditLog` (BR-33). |
| **BR-33** | Mọi lần đọc hội thoại bởi người **không phải thành viên** (Admin tra cứu) ghi audit: ai, khi nào, hội thoại nào, lý do. |
| **BR-34** | Nhóm lớp không riêng tư theo nghĩa 1-1: QLCS là `OBSERVER` hợp lệ, và điều này phải **hiển thị công khai** trong danh sách thành viên. Không giám sát ngầm. |

---

## 4. Mô hình dữ liệu

```prisma
enum ConversationType {
  CLASS_GROUP
  DM_TEACHER_PARENT
  DM_SALE_PARENT
  DM_STAFF            // reserve cho cây B, chưa dùng ở P0
}

enum ConversationSubjectType {
  CLASS
  NONE
}

enum ConversationStatus {
  ACTIVE
  ARCHIVED
  LOCKED
}

enum ParticipantRole {
  OWNER
  MODERATOR
  MEMBER
  OBSERVER
}

enum ParticipantSource {
  DERIVED
  MANUAL
}

enum DerivedFrom {
  CLASS_TEACHER
  CLASS_STUDENT_PARENT
  CENTER_MANAGER
}

enum MessageKind {
  CHAT
  ANNOUNCEMENT
  SYSTEM
}

model Conversation {
  id            String                  @id @default(uuid())
  type          ConversationType
  status        ConversationStatus      @default(ACTIVE)

  // Phạm vi tổ chức — phục vụ quyền quản trị, KHÔNG dùng để suy ra thành viên
  centerId      String?
  orgUnitId     String?

  // Đa hình
  subjectType   ConversationSubjectType @default(NONE)
  subjectId     String?

  // Khoá duy nhất cho hội thoại 1-1: sort 2 userId rồi nối — chống tạo trùng
  dmKey         String?                 @unique

  title         String?
  lastMessageAt DateTime?
  createdById   String?
  createdAt     DateTime                @default(now())
  archivedAt    DateTime?

  participants  ConversationParticipant[]
  messages      Message[]

  @@unique([type, subjectType, subjectId])
  @@index([centerId, status, lastMessageAt])
}

model ConversationParticipant {
  id                String            @id @default(uuid())
  conversationId    String
  userId            String

  role              ParticipantRole   @default(MEMBER)
  source            ParticipantSource @default(DERIVED)
  derivedFrom       DerivedFrom?

  joinedAt          DateTime          @default(now())
  leftAt            DateTime?

  lastReadMessageId String?
  lastReadAt        DateTime?
  unreadCount       Int               @default(0)
  muted             Boolean           @default(false)

  conversation      Conversation      @relation(fields: [conversationId], references: [id])

  @@unique([conversationId, userId])
  @@index([userId, leftAt])          // truy vấn "danh sách hội thoại của tôi"
}

model Message {
  id             String       @id @default(uuid())
  conversationId String
  senderId       String?      // null khi kind = SYSTEM
  kind           MessageKind  @default(CHAT)

  body           String       @db.Text
  replyToId      String?      // một cấp, không lồng nhau

  createdAt      DateTime     @default(now())
  deletedAt      DateTime?
  deletedById    String?
  deletedReason  String?

  conversation   Conversation @relation(fields: [conversationId], references: [id])
  attachments    MessageAttachment[]

  @@index([conversationId, createdAt(sort: Desc)])
  @@index([conversationId, kind, createdAt(sort: Desc)])  // lọc ANNOUNCEMENT
}

model MessageAttachment {
  id          String  @id @default(uuid())
  messageId   String
  storagePath String          // Supabase Storage, bucket private
  fileName    String
  mimeType    String
  sizeBytes   Int
  width       Int?
  height      Int?
  message     Message @relation(fields: [messageId], references: [id])
}

// Chỉ dùng cho ANNOUNCEMENT — GV cần biết PH nào đã đọc thông báo lịch học
model AnnouncementRead {
  messageId String
  userId    String
  readAt    DateTime @default(now())
  @@id([messageId, userId])
}
```

### 4.1 Ghi chú thiết kế

- **`dmKey`**: với hội thoại 1-1, ghi `min(userA,userB) + ':' + max(userA,userB) + ':' + type`. Unique index này là thứ thực thi BR-06, chống race condition hai người cùng bấm "nhắn tin" một lúc.
- **`unreadCount` denormalize**: đếm bằng `COUNT(*)` mỗi lần mở danh sách hội thoại sẽ chết ở 200 lớp. Tăng bằng UPDATE trong cùng transaction gửi tin; reset khi đọc.
- **Không có bảng `MessageRead` cho CHAT**: chỉ dùng `lastReadMessageId`. Read receipt từng-người-từng-tin cho nhóm 30 PH là bài toán ghi khuếch đại không đáng ở P0.
- **`@@unique([type, subjectType, subjectId])`** thực thi BR-02, nhưng lưu ý Postgres coi nhiều NULL là khác nhau — với `subjectType=NONE` ràng buộc này vô hiệu, đó là đúng ý (hội thoại 1-1 dùng `dmKey`).

---

## 5. Quy tắc đồng bộ thành viên

Đây là phần dễ sai nhất. Viết một service duy nhất `syncConversationMembership(classId)` và gọi nó từ **mọi** điểm thay đổi, trong cùng transaction:

| Sự kiện gốc | Hành động |
|---|---|
| `Class` mở | Tạo `Conversation`, sync lần đầu |
| Phân công GV vào lớp | Thêm participant `MODERATOR / CLASS_TEACHER` |
| Gỡ phân công GV | Set `leftAt`, gửi SYSTEM message |
| Học viên vào lớp | Thêm tất cả PH của học viên đó → `MEMBER / CLASS_STUDENT_PARENT` |
| Học viên chuyển lớp / nghỉ | Set `leftAt` cho PH đó **nếu** không còn học viên nào khác của PH đó trong lớp |
| Đổi QLCS của cơ sở | Chuyển `OBSERVER` |
| `Class` kết thúc | `status = ARCHIVED`, `archivedAt = now()` |

**Bẫy**: một PH có 2 con cùng lớp → chỉ một bản ghi participant. Khi một con nghỉ, PH vẫn ở lại vì con còn lại. Điều kiện `leftAt` phải kiểm tra theo *tập học viên*, không theo *một học viên*.

**Job đối soát**: chạy hằng đêm, so sánh tập participant DERIVED với tập dẫn xuất tính lại từ đầu, log lệch. Không tự sửa — lệch là dấu hiệu có luồng nào đó quên gọi service, phải sửa luồng chứ không vá dữ liệu.

---

## 6. Ma trận quyền

| Hành động | PH | GV (được phân công) | QLCS | Sale | Admin HO |
|---|:--:|:--:|:--:|:--:|:--:|
| Đọc tin nhóm lớp | ✅ (lớp của con mình) | ✅ (lớp mình dạy) | ✅ (cơ sở mình) | ❌ | ✅ (có audit) |
| Gửi CHAT trong nhóm lớp | ✅ | ✅ | ❌ (observer) | ❌ | ❌ |
| Gửi ANNOUNCEMENT | ❌ | ✅ | ❌ | ❌ | ✅ |
| Xem danh sách thành viên | ✅ (đã ẩn liên hệ) | ✅ (đầy đủ) | ✅ (đầy đủ) | ❌ | ✅ |
| Thu hồi tin của mình (<15') | ✅ | ✅ | — | ✅ | ✅ |
| Gỡ tin của người khác | ❌ | ✅ (trong nhóm mình) | ❌ | ❌ | ✅ |
| Mở 1-1 với GV | ✅ | ✅ | ❌ | ❌ | — |
| Mở 1-1 với PH | — | ✅ | ❌ | ✅ (tệp mình phụ trách) | — |
| Đọc nội dung 1-1 của người khác | ❌ | ❌ | ❌ | ❌ | ✅ (bắt buộc nhập lý do + audit) |
| Khoá/mở hội thoại | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 7. Kiến trúc realtime

### 7.1 Luồng gửi tin

```
[Client PH/GV]
   │  (1) Server Action sendMessage(conversationId, body, files[])
   ▼
[Next.js Server Action]
   │  (2) Kiểm quyền: participant còn hiệu lực? status=ACTIVE? rate limit?
   │  (3) BEGIN TX
   │        INSERT message
   │        UPDATE conversation.lastMessageAt
   │        UPDATE participant.unreadCount (mọi người trừ sender)
   │      COMMIT
   │  (4) Broadcast bằng service role → topic "conv:{conversationId}"
   │  (5) Enqueue push/ZNS cho người đang offline
   ▼
[Supabase Realtime] ──► các client đang subscribe topic đó
```

**Điểm mấu chốt**: bước (4) nằm **ngoài** transaction và được phép fail im lặng. Nếu broadcast lỗi, tin vẫn nằm trong DB và client sẽ nhận được ở lần reconcile kế tiếp. Không bao giờ rollback tin nhắn vì broadcast lỗi.

### 7.2 Luồng nhận tin

Client subscribe **private channel**: <cite index="8-1">kênh riêng tư yêu cầu người dùng đã xác thực và vượt qua kiểm tra RLS định nghĩa trong policy của database</cite>.

Cơ chế: <cite index="3-1">Supabase kiểm soát truy cập Realtime Broadcast và Presence bằng RLS policy trên bảng `realtime.messages`; việc kiểm tra thực hiện lúc client kết nối và tham gia topic</cite>. <cite index="4-1">Kiểm tra được thực hiện bằng cách chạy truy vấn SELECT/INSERT trên bảng đó rồi rollback, nên không có gì được lưu lại</cite>.

Policy cần viết — **chỉ SELECT**, theo NT2:

```sql
create policy "participant_can_receive_conversation_broadcast"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1
    from public.conversation_participant p
    join public."User" u on u.id = p."userId"
    where u."authId" = (select auth.uid())          -- phụ thuộc giả định A1
      and p."leftAt" is null
      and 'conv:' || p."conversationId" = (select realtime.topic())
  )
);
```

Bắt buộc kèm: <cite index="2-1">để ép kênh ở chế độ riêng tư phải tắt thiết lập "Allow public access" trong Realtime Settings</cite> — nếu không, mọi policy ở trên là trang trí.

### 7.3 Ba cái bẫy phải xử lý ở tầng nghiệp vụ

| Bẫy | Bản chất | Xử lý |
|---|---|---|
| **Quyền được cache theo connection** | Policy tính **một lần lúc join**. PH bị gỡ khỏi lớp lúc 10:00 vẫn tiếp tục nhận broadcast tới khi ngắt kết nối. | Khi `leftAt` được set, server broadcast một event `participant.removed` xuống chính topic đó; client nhận được thì tự `unsubscribe` và điều hướng ra. Đồng thời **API đọc lịch sử vẫn chặn ngay lập tức** ở Server Action — nên rò rỉ tối đa là các tin phát sinh trong vài phút của một phiên đang mở. Ghi rõ mức chấp nhận rủi ro này trong tài liệu bảo mật. |
| **Broadcast không đảm bảo delivery** | Mất mạng thoáng qua = mất tin, vĩnh viễn. | Client giữ `lastSeenMessageId`. Mỗi lần trạng thái channel về `SUBSCRIBED`, gọi `fetchMessagesSince(lastSeenMessageId)`. Bắt buộc, không phải tối ưu. |
| **Trùng tin** | Optimistic UI + broadcast về = hiện 2 lần. | Client sinh `clientMsgId` (uuid) gửi kèm; server trả lại trong payload; client khử trùng theo `clientMsgId`. |

### 7.4 Tệp đính kèm

Bucket Supabase Storage **private**. Client upload trực tiếp bằng signed upload URL do Server Action cấp (kèm kiểm quyền + kiểm mime/size trước khi cấp). Đọc bằng signed URL hạn 5 phút, cấp lại mỗi lần render. Không bao giờ public URL — ảnh trong nhóm lớp là ảnh trẻ em.

---

## 8. Use case chi tiết

### UC-01 — GV gửi thông báo lịch học tới nhóm lớp

- **Actor**: GV được phân công · **Tiền điều kiện**: hội thoại `ACTIVE`, GV là `MODERATOR`
- **Luồng chính**:
  1. GV mở nhóm lớp, chọn "Gửi thông báo"
  2. Nhập nội dung, tuỳ chọn đính kèm
  3. Hệ thống kiểm BR-21, BR-25, BR-26
  4. Ghi `Message(kind=ANNOUNCEMENT)`, ghim đầu luồng
  5. Đẩy realtime + push/ZNS **cho tất cả PH bất kể muted** (thông báo là ngoại lệ của mute)
  6. GV thấy bộ đếm "đã đọc 12/30", chi tiết theo `AnnouncementRead`
- **Ngoại lệ**: vượt 10 thông báo/ngày → chặn, gợi ý gộp nội dung
- **Acceptance**: PH đang mở app thấy trong ≤ 2s; PH offline nhận push; thông báo luôn nằm trên cùng dù có 200 tin chat sau đó

### UC-02 — PH nhắn trong nhóm lớp

- **Tiền điều kiện**: participant còn hiệu lực, hội thoại `ACTIVE`
- **Luồng chính**: nhập → optimistic render → Server Action → DB → broadcast → khử trùng theo `clientMsgId`
- **Ngoại lệ**:
  - Hội thoại `ARCHIVED`/`LOCKED` → ô nhập bị vô hiệu kèm lý do
  - Mất mạng → tin ở trạng thái "đang gửi", tự thử lại 3 lần, sau đó cho gửi lại thủ công
  - Vượt rate limit → thông báo rõ, không im lặng nuốt tin

### UC-03 — Học viên chuyển lớp

- **Trigger**: nghiệp vụ chuyển lớp (module lớp học), không phải thao tác trong chat
- **Luồng**: trong cùng transaction chuyển lớp → `syncConversationMembership` cho **cả lớp cũ và lớp mới** → SYSTEM message ở cả hai nhóm → broadcast `participant.removed` xuống nhóm cũ
- **Acceptance**: PH mở app thấy nhóm cũ biến mất khỏi danh sách, nhóm mới xuất hiện, không cần đăng nhập lại

### UC-04 — PH mở 1-1 với GV

- **Tiền điều kiện**: tồn tại quan hệ dạy học hiệu lực (BR-05)
- **Luồng**: bấm "Nhắn riêng" từ danh sách thành viên → server tính `dmKey` → `findOrCreate` → mở hội thoại
- **Ngoại lệ**: đã có hội thoại cũ (đã archive từ lớp trước) → **mở lại** cùng hội thoại đó, `status` về `ACTIVE`, giữ nguyên lịch sử (BR-06)

### UC-05 — Admin tra cứu hội thoại để xử lý khiếu nại

- **Luồng**: Admin vào `/admin/hoi-thoai` → tìm theo lớp/cơ sở/người → bấm xem → **modal bắt buộc nhập lý do** → ghi `AuditLog` → hiển thị nội dung ở chế độ chỉ đọc
- **Acceptance**: không có đường nào xem được nội dung mà không đi qua modal lý do; trang audit liệt kê được mọi lần truy cập

### UC-06 — Gỡ tin vi phạm

- **Luồng**: GV/Admin bấm gỡ → nhập lý do → soft delete → broadcast `message.deleted` → mọi client thay nội dung bằng "Tin nhắn đã được gỡ" → SYSTEM message trong nhóm nếu người gỡ không phải tác giả
- **Acceptance**: nội dung gốc vẫn còn trong DB cho mục đích đối chất; API đọc không bao giờ trả `body` của tin đã xoá cho người dùng thường

---

## 9. Thông báo ngoài app

| Loại | Kênh | Điều kiện |
|---|---|---|
| ANNOUNCEMENT | Push + ZNS | Luôn gửi, bỏ qua `muted` |
| CHAT trong nhóm lớp | Push | Chỉ khi user offline > 2 phút, gộp theo hội thoại ("Nhóm Sata4-A: 5 tin mới"), không gửi nếu `muted` |
| CHAT 1-1 | Push | Như trên, ngưỡng gộp thấp hơn |
| SYSTEM | Không đẩy | Chỉ hiển thị trong luồng |

Ràng buộc ZNS: mẫu ZNS phải đăng ký trước, không gửi được nội dung tin nhắn tự do → ZNS chỉ dùng cho ANNOUNCEMENT dạng "Bạn có thông báo mới từ lớp X", kèm deeplink. Đây là ràng buộc nền tảng, không phải lựa chọn thiết kế.

---

## 10. Phi chức năng

| Hạng mục | Yêu cầu |
|---|---|
| Độ trễ | P95 từ lúc gửi tới lúc hiện trên máy người nhận đang online ≤ 1,5s |
| Tải | 200 hội thoại hoạt động, 30 thành viên/nhóm, đỉnh 17:00–20:00 |
| Phân trang | Cursor-based theo `(createdAt, id)`, 30 tin/trang. **Không** dùng OFFSET |
| Lưu trữ | Tin nhắn giữ vĩnh viễn. Tệp đính kèm giữ 24 tháng rồi chuyển cold storage |
| Audit | Mọi thao tác gỡ tin, khoá hội thoại, tra cứu bởi non-participant |
| Ngôn ngữ | Tiếng Việt, có dấu, emoji. Kiểm tra collation và độ dài byte của `@db.Text` |
| Mobile | Nhóm lớp sẽ dùng trên điện thoại là chính — thiết kế mobile-first, không phải responsive-sau |

---

## 11. Câu hỏi mở cần chốt trước khi sang PRD

1. **A2 — PH đã có tài khoản chưa?** Bao nhiêu % PH đang học có `User` active? Nếu dưới 30%, module chat phải xếp sau module onboarding tài khoản PH.
2. **QLCS là OBSERVER hay MEMBER?** Tài liệu này chọn OBSERVER (thấy, không nói). Nếu thực tế QLCS phải trả lời PH thay GV thì đổi thành MEMBER — ảnh hưởng ma trận quyền.
3. **PH có được nhắn 1-1 với Sale không, hay chỉ Sale mở trước?** Ảnh hưởng luồng UC-04 và khối lượng công việc của Sale.
4. **Lớp học thử 4 buổi có nhóm lớp không?** Nếu có thì `Class` của lớp trải nghiệm phải cùng thực thể — cần xác nhận với module lớp học.
5. **Ai chịu trách nhiệm trực nhóm lớp ngoài giờ?** Câu này không phải kỹ thuật nhưng quyết định thành bại: PH nhắn 21:00, không ai trả lời tới 9:00 hôm sau → trải nghiệm tệ hơn là không có chat. Cần SLA phản hồi và có thể cần auto-reply ngoài giờ.

---

## 12. Đề xuất bước kế tiếp

| Thứ tự | Việc | Ghi chú |
|---|---|---|
| 1 | Xác minh A1–A4 (spike 1 ngày) | Chặn mọi thứ phía sau |
| 2 | Trả lời 5 câu hỏi mục 11 | Chủ yếu là quyết định của Dev, không cần research |
| 3 | `pm-execution:create-prd` | Tài liệu này là input |
| 4 | `pm-execution:pre-mortem` | Tigers/Paper Tigers/Elephants |
| 5 | `pm-execution:user-stories` + `test-scenarios` | Xuống backlog |
| 6 | `pm-ai-shipping:shipping-artifacts` | Bắt buộc: permission flow + trust boundary trước khi lên PROD |
