# PRD — KHU VỰC E: Dashboard / Tab Tương tác KH

**Trạng thái:** Draft
**Nguồn spec (đã chốt):** `docs/specs/spec-dashboard-qlcs-duyet-media-lead.md` — KHU VỰC E (E-01 → E-04)
**Phạm vi:** CHỈ E-01…E-04. Không mở rộng sang A/B/C/D/F/G.
**Phụ thuộc:** `docs/prd/A-nen-tang.md` — bộ lọc A-02 (`resolveScopeFilters` / `scope-filter-bar.tsx`) và ràng buộc **A-02-7**.
**Luật cứng bắt buộc đọc kèm:** `docs/chat-realtime/00-dieu-chinh-cho-repo.md` (mục E, E-bis, E-ter).
**Nhánh khảo sát:** `hptkk29/runhop20_08`

> Mọi khẳng định hiện trạng đều kèm `file:dòng` đọc trực tiếp từ mã nguồn trên nhánh này.
> Chỗ nào chưa tồn tại được ghi rõ **CHƯA CÓ**.



## 0. Quyết định chủ dự án & chốt kỹ thuật — 24/08 + 26/08/2026 (THẮNG phần thân bài)

Nguồn: `docs/plan/cau-hoi-can-quyet.md`.

**Chốt kỹ thuật 24/08/2026 (Dev):**

| Mã | Quyết định | Ai chốt |
|---|---|---|
| **OQ-4** | Quyền cấp trang: khai key MỚI **`dashboard:view`**; từng tab gate thêm bằng key lĩnh vực sẵn có. ❌ Không mượn `chat:read` | ⚙️ Dev |
| **OQ-5** | Giáo viên phụ trách = `substituteTeacherId ?? actualTeacherId ?? class.teacherId`, đặt trong **một helper dùng chung** | ⚙️ Dev |
| **OQ-6** | **Mở rộng** `/admin/attendance` (thêm `dateFrom`/`dateTo`), không dựng trang mới | ⚙️ Dev |
| **OQ-8** | **Có** thêm `@@index([senderId, createdAt])` trên `Message`, dùng `CREATE INDEX CONCURRENTLY` | ⚙️ Dev |

**Chốt 26/08/2026 — chủ dự án: *"khu vực E làm theo đề xuất"*.** Ba câu chặn cứng đóng theo **đúng
khuyến nghị đã ghi trong PRD này**, nghĩa của thân bài không đổi. Chi tiết + hệ quả ở **§7**.

| Mã | Quyết định | Ai chốt |
|---|---|---|
| **OQ-1** | "PH đã tương tác" = **(A) PH đã gửi ≥ 1 tin trong khoảng ngày**. Câu con: **CÓ** tính kênh 1-1 ⇒ 🔴 **KHÔNG** lọc phạm vi qua `Conversation.centerId` | Chủ dự án |
| **OQ-2** | Mẫu số dùng đúng `ENROLLMENT_ACTIVE_STATUS_LIST` = `ACTIVE · CONFIRMED · STUDYING · PAUSED` — **giữ `PAUSED`, loại `COMPLETED`** | Chủ dự án |
| **OQ-3** | **(a) cho P0** (dropdown chỉ liệt kê kênh người xem là participant; mục 1-1 hiện mờ kèm lý do) · **(b) cho P2** (chỉ `SUPER_ADMIN`, màn tra cứu **chỉ-đọc**, `reason` + audit) · **(c) LOẠI**. 🔴 **Tuyệt đối không nới `assertActiveParticipant`** | Chủ dự án |

✅ **Ba câu chặn cứng đã đóng ⇒ E-02/E-04 code được** (E-01 vốn không bị chúng chặn).
✅ ~~⚠️ **E-03 thì CHƯA** — nó bị **OQ-7** chặn~~ → **OQ-7 ĐÃ CHỐT 27/08/2026 ⇒ E-03 hết chặn.**

**Chốt 27/08/2026 — chủ dự án:**

| Mã | Quyết định | Ai chốt |
|---|---|---|
| **OQ-7** | **KHÔNG** — **E-03 KHÔNG xuất hiện trên site giáo viên.** E-03 chỉ sống trên admin | Chủ dự án |

**Hệ quả phải làm — ghi rõ để sau này không ai mở lại mà không biết đã trả lời:**

1. **Phạm vi test PII KHÔNG rộng thêm một site.** Không thêm bề mặt `app/(teacher)/**` vào bộ test PII,
   không thêm ca *"GV mở E-03 không thấy SĐT"*. Bộ test PII của E **giữ nguyên** đúng như đã lập ở §8.2 bước E.1.
2. **`canViewParentContact` giữ NGUYÊN** — không thêm, không bớt vai. `TEACHER` vẫn nằm ngoài danh sách 4 vai
   `SUPER_ADMIN · CENTER_MANAGER · ACCOUNTANT · SALES_CSM` (`lib/auth/permissions.ts:957-962`, hàm `:965`),
   đúng chủ đích chống lộ SĐT toàn lớp đã ghi ngay trên nó (`:955-956`).
3. ⚠️ Câu chốt này **chỉ nói về E-03**, không phải luật chung *"GV không bao giờ thấy SĐT PH ở đâu cả"*.
   Sau này ai muốn đưa một bảng có SĐT PH lên `app/(teacher)/**` thì đó là **quyết định mới**, phải hỏi lại —
   không mượn được câu này.

🎉 **Khu vực E HẾT câu hỏi mở.** OQ-1…OQ-8 đóng hết ⇒ **E-01, E-02, E-03, E-04 đều code được.**

⚠️ `dashboard:view` là key MỚI ⇒ **chạy `seed-prod-roles.yml` sau khi merge lên `main`**, nếu không
**không ai vào được dashboard**.

---

## 1. Executive Summary

Khu vực E có bốn spec, và chúng **không cùng độ khó**:

| Mã | Bản chất công việc | Đánh giá |
|---|---|---|
| E-01 | Đếm + trang danh sách buổi còn thiếu việc | **Dữ liệu đã có đủ**, phải chọn đúng một trong hai hệ đang song song và gắn range ngày |
| E-02 | Một tỉ lệ | **Mẫu số CHƯA CÓ** — phải định nghĩa "PH đang có con học" bằng bộ trạng thái enrollment nào |
| E-03 | Một bảng có SĐT phụ huynh | **Cổng quyền là phần khó**, không phải truy vấn |
| E-04 | Mở chat ngay trên dashboard | **Component đã có, tái sử dụng được**; phần khó là *nạp dữ liệu cho nó* và *phạm vi hội thoại QLCS mở được* |

Bốn kết luận chịu lực của khảo sát:

1. **E-04 KHÔNG viết lại chat.** `ChatThread` (`components/chat/staff/chat-thread.tsx:140`) là Client Component tự chứa, root là một `<div className="flex h-full min-h-[60vh] flex-col overflow-hidden rounded-xl border …">` (`:447`) — nhúng được vào panel/drawer **miễn là container cấp chiều cao**. Nhưng nó **không tự resolve dữ liệu nào**: toàn bộ 30 tin đầu, thành viên, quyền, ảnh, thông báo ghim đều do RSC nạp. Mẫu sao chép nguyên vẹn là `ThreadPanel` (`components/chat/staff/chat-workspace.tsx:188-283`).
2. **🔴 Phạm vi hội thoại của QLCS hẹp hơn spec giả định.** Mọi đường đọc chat gác bằng `assertActiveParticipant` (`lib/chat/queries.ts:415-452`) — người xem **phải là participant còn hiệu lực**. QLCS được sinh vào nhóm lớp (`DerivedFrom.CENTER_MANAGER`, `prisma/schema.prisma:6488`) nhưng **không** vào kênh 1-1 GV↔PH / Sale↔PH; và họ cũng **không mở được** kênh 1-1 mới với PH vì `DmKind` chỉ có `TEACHER_PARENT | SALE_PARENT` (`lib/chat/dm.ts:67`) và `openDmTargetOf` ép `centerId: null` để "QLCS/Giáo vụ (scope CENTER) tự deny" (`lib/chat/dm.ts:135, 139`). ⇒ Dropdown "kênh 1-1" của E-04 **không thể mở được cho QLCS** bằng đường chat thường. Đây là **quyết định phải chốt**, không phải chi tiết hiện thực (OQ-3).
3. **🔴 Hai luật ngược chiều về scope, chọn sai là hỏng im lặng theo hai kiểu khác nhau.** Đường **ĐỌC CHAT** của người dùng **cấm** bọc `scopedDb` (`lib/chat/unread.ts:26-28`: GV dạy chéo cơ sở mất sạch hội thoại). Đường **SỐ LIỆU** đọc `Conversation` thì **bắt buộc** tự lọc `centerId ∈ getVisibleCenterIds(actor)` vì `Conversation` nằm trong `SCOPE_EXEMPT` (`lib/db-scope.ts:125`). E-02/E-03 thuộc vế thứ hai; E-04 thuộc vế thứ nhất. **Cùng một màn hình, hai luật.**
4. **`components/ui/sheet.tsx` tồn tại nhưng CHƯA có call-site nào trong repo** (grep `ui/sheet` / `SheetContent` / `<Sheet` trên toàn `app/`, `components/`, `lib/` → 0 kết quả ngoài chính file định nghĩa). E-04 sẽ là call-site **đầu tiên** — kèm ba cái bẫy đã đọc trong mã: `side="bottom"` là `h-auto`, `sm:max-w-sm` = 384px quá hẹp, và **override chiều rộng bằng class thường sẽ THUA** (§6.5.1).

---

## 2. Background & Context

### 2.1 Chat realtime — hiện trạng đã lên production

Ba bề mặt, **hai** bộ component:

| Bề mặt | Route | Component khung |
|---|---|---|
| Admin | `app/(admin)/admin/tin-nhan/page.tsx:59` | `StaffChatWorkspace` (`components/chat/staff/chat-workspace.tsx:85`) |
| Giáo viên | `app/(teacher)/teacher/tin-nhan/page.tsx:43` | **CÙNG** `StaffChatWorkspace` |
| Phụ huynh | `app/(portal)/portal/tin-nhan/[conversationId]/page.tsx` | `ChatThread` bản portal (`components/chat/portal/chat-thread.tsx:72`) |

Mô hình dữ liệu: `Conversation` (`prisma/schema.prisma:6497`) / `ConversationParticipant` (`:6526`) / `Message` (`:6549`) / `MessageAttachment` (`:6574`) / `AnnouncementRead` (`:6587`), realtime qua Supabase Broadcast private channel (`docs/chat-realtime/00-dieu-chinh-cho-repo.md` mục B).

`ConversationType` có 4 giá trị: `CLASS_GROUP · DM_TEACHER_PARENT · DM_SALE_PARENT · DM_STAFF` (`prisma/schema.prisma:6455-6460`) — trong đó `DM_STAFF` ghi rõ **"reserve cho cây B, chưa dùng ở P0"**.

### 2.2 Phạm vi đọc chat là participant-based, KHÔNG center-based

`assertActiveParticipant` (`lib/chat/queries.ts:415-452`) chặn ba lớp: không có bản ghi participant → chặn; `leftAt !== null` → chặn; hội thoại ARCHIVED quá hạn với PH → chặn. Nó nằm ở đầu **cả ba** hàm đọc mà E-04 cần: `getMessagesPage` (`:662`), `getConversationMembers` (`:764`), `listAnnouncements` (`lib/chat/announcements.ts:779`).

Hệ quả cho E-04: **không có tham số nào, không có cờ nào** cho phép QLCS đọc một hội thoại họ không thuộc về. Đường duy nhất là `adminLookupConversationAsActor` (`lib/chat/admin.ts:513`) — gate `chat:admin`, **bắt buộc `reason`**, ghi `writeAudit` **trước khi** đọc một dòng tin nào (`lib/chat/admin.ts:497-512`), và chỉ `SUPER_ADMIN` được seed action đó (`prisma/seed-roles.ts:50`; `CENTER_MANAGER` cố ý **không** có — `:533`).

Bộ quyền chat theo vai (`prisma/seed-roles.ts`):

| Vai | chat:read | chat:send | chat:announce | chat:moderate | chat:admin |
|---|---|---|---|---|---|
| `SUPER_ADMIN` (`:33`) | GLOBAL | GLOBAL | GLOBAL | GLOBAL | GLOBAL |
| `CENTER_MANAGER` (`:400`) | CENTER (`:536`) | CENTER (`:537`) | CENTER (`:538`) | — | — |
| `CENTER_CLASS_MANAGER` (`:557`) | CENTER (`:571`) | CENTER (`:572`) | CENTER (`:573`) | — | — |
| `TEACHER` (`:670`) | ASSIGNED (`:727`) | ASSIGNED | ASSIGNED | ASSIGNED | — |
| `CENTER_SALES_CSM` (`:609`) | OWN (`:640`) | OWN (`:641`) | — | — | — |
| `PARENT` (`:805`) | OWN (`:812`) | OWN (`:813`) | — | — | — |

`scopeMatches` nhánh `CENTER` **đòi `target.centerId`**, thiếu là false (`lib/auth/can.ts:26`); nhánh `OWN` đòi `target.createdById === actor.userId` (`:37`); `ASSIGNED` đòi `target.classId ∈ actor.assignedClassIds` (`:41`). ALLOW-wins, **không có DENY** (`:52-58`).

### 2.3 Hiện trạng E-01 — dữ liệu ĐÃ CÓ ĐỦ, nhưng có hai hệ song song

**Hệ 1 — `sessionIncomplete`** (`lib/pending-tasks.ts:235-263`), đang chạy trên dashboard quản lý:

- Điều kiện: `date < startOfToday` **và** `status != "COMPLETED"` (`:240-241`).
- Phạm vi cơ sở: `scope(user)` → `centerScope = isCM && !isSuper ? user.centerId : null` (`lib/pending-tasks.ts:109-116`) — **đơn trị**, đọc `session.user.centerId`.
- Đọc bằng `db` **trần** (`lib/pending-tasks.ts:1`), `take: 50` (`:245`).

🔴 Hệ này **mâu thuẫn trực tiếp với A-01** (QLCS đa cơ sở): một QLCS giữ 2 cơ sở chỉ thấy 1. Và nó **không có range ngày** — E-01 yêu cầu "đếm theo range ngày đã chọn".

**Hệ 2 — bộ `attendance-queue` / `session-order`**, chuẩn 3 việc chốt 21/08:

- `sessionWorkState(input)` (`lib/lms/attendance-queue.ts:107`) ráp ba câu trả lời: `attendanceCoversRoster` + `summarizeSessionFeedback` + `mediaCoversAttendees` (`lib/lms/session-order.ts:106, 164`; `lib/lms/session-feedback-roster.ts:59`).
- `resolveAttendanceQueuePhase` (`lib/lms/attendance-queue.ts:153`) chia 6 bậc: `PENDING · TODAY · UPCOMING · DONE · NO_ROSTER · CANCELLED` (`:45-52`), nhãn ở `:64-72`, thứ tự ở `:54-62`.
- **PURE, không DB** (`lib/lms/attendance-queue.ts:32`) ⇒ dùng được ở RSC lẫn test.
- Đang được dùng thật ở `app/(admin)/admin/attendance/page.tsx` (3 cấp: danh sách lớp → danh sách buổi → bảng điểm danh, chú thích `:1-22`).

⚠️ `/admin/attendance` **KHÔNG có bộ lọc range ngày** — searchParams chỉ có `{ sessionId, classId, centerId }` (`app/(admin)/admin/attendance/page.tsx:67`).

⚠️ **"Giáo viên phụ trách" của một buổi đang được suy theo 4 thứ tự KHÁC NHAU trong repo:**

| Nơi | Thứ tự |
|---|---|
| `lib/lms/schedule-conflict.ts:109` | `substituteTeacherId ?? actualTeacherId ?? class.teacherId` |
| `lib/students/birthday-notify.ts:102` | `substituteTeacherId ?? actualTeacherId ?? class.teacherId` |
| `lib/lms/session-teacher-notify.ts:120` | `actualTeacherId ?? substituteTeacherId ?? class.teacherId` |
| `lib/_handlers/r7-lifecycle.ts:62`, `app/(admin)/admin/bao-cao/hieu-suat-gv/page.tsx:285` | `actualTeacherId ?? class.teacherId` (**bỏ qua dạy thay**) |

E-01 yêu cầu cột "giáo viên phụ trách" ⇒ phải chốt **một** thứ tự (OQ-1), nếu không con số của E-01 sẽ không khớp với báo cáo hiệu suất GV.

### 2.4 Hiện trạng E-02 — mẫu số CHƯA CÓ

**CHƯA CÓ** hàm nào đếm "tổng phụ huynh đang có con học". Có sẵn:

- Quan hệ PH→HV: `Student.parentUserId` (`prisma/schema.prisma:1570`), có index (`:1617`).
- Bộ trạng thái "đang thuộc lớp": `ENROLLMENT_ACTIVE_STATUS_LIST = [ACTIVE, CONFIRMED, STUDYING, PAUSED]` (`lib/enrollment-status.ts:17-19`) — được khai là **"nguồn chân lý DUY NHẤT"** (`:1`).
- **Khuôn SQL `DISTINCT parentUserId` chép được nguyên vẹn**: `listAssignableParentsForSale` (`lib/chat/dm.ts:356-396`) — `SELECT DISTINCT s."parentUserId" … FROM "Enrollment" e JOIN "Student" s … JOIN "User" u …` với 5 điều kiện lọc: `e."deletedAt" IS NULL`, `e."status" = ANY(ENROLLMENT_ACTIVE_STATUS_LIST)`, `s."deletedAt" IS NULL`, `u."deletedAt" IS NULL`, `u."isActive" = true` (`:373-378`).

Enum đầy đủ có **9** giá trị: `ACTIVE · CANCELLED · PENDING · CONFIRMED · STUDYING · PAUSED · COMPLETED · WITHDREW · TRANSFERRED` (`prisma/schema.prisma:71-84`). ⇒ Câu "loại PH có con đã nghỉ/thôi học" phải được dịch thành **danh sách trạng thái cụ thể** — xem OQ-2.

### 2.5 Hiện trạng E-03/E-04 — "đã tương tác" KHÔNG TỒN TẠI

Không có cột, bảng, hay enum nào mang nghĩa "phụ huynh đã tương tác". Những gì thật sự có trong schema:

| Tín hiệu | Vị trí | Có mốc thời gian dùng cho range không? |
|---|---|---|
| PH **gửi** tin | `Message.senderId` (`prisma/schema.prisma:6552`) + `Message.createdAt` (`:6561`) | ✅ **Có** — lọc được `createdAt BETWEEN` chính xác |
| PH **đọc** hội thoại | `ConversationParticipant.lastReadAt` (`:6566`) | ⚠️ Chỉ giữ **lần cuối** — trả lời được "có đọc sau ngày X không", **không** trả lời được "có đọc trong tháng 7 không" |
| PH đọc **thông báo** | `AnnouncementRead.readAt` (`:6590`) | ✅ Có, nhưng chỉ phủ tin `kind = ANNOUNCEMENT` |
| PH **đăng nhập** | `User.lastLoginAt` (`:1093`) | ⚠️ Vô hướng, bị ghi đè mỗi lần đăng nhập — cùng hạn chế như `lastReadAt` |
| Hội thoại có hoạt động | `Conversation.lastMessageAt` (`:6514`) | ⚠️ Là hoạt động của **cả nhóm**, không phân biệt ai |

🔴 **Đính chính một giả định trong đề bài:** "PH đã gửi tin trong khoảng thời gian" **KHÔNG** phải tín hiệu gián tiếp — nó **đo trực tiếp được** từ `Message.senderId` + `Message.createdAt`. Ba tín hiệu còn lại (`lastReadAt`, `lastLoginAt`, `Conversation.lastMessageAt`) mới là gián tiếp và **không cộng dồn theo khoảng**.

⚠️ **Chỉ số hiệu năng phải biết trước:** `Message` chỉ có 2 index và cả hai đều bắt đầu bằng `conversationId` (`prisma/schema.prisma:6570-6571`); `@@unique([conversationId, senderId, clientMsgId])` (`:6569`) cũng vậy. **Không có index nào bắt đầu bằng `senderId` hay `createdAt`.** Truy vấn `senderId IN (…) AND createdAt BETWEEN …` sẽ quét bảng.

### 2.6 Prior art bắt buộc đọc trước khi code E-02/E-03

`lib/chat/pilot-stats.ts` + `app/(admin)/admin/bao-cao/chat-pilot/page.tsx` **đã giải đúng bài toán "thống kê trên dữ liệu chat, cách ly theo cơ sở"**:

- `getChatPilotStats(actor, { centerId })` (`lib/chat/pilot-stats.ts:171`) — đọc `db` **trần**, lọc **tay** theo `getVisibleCenterIds(actor)` (`:175`), **6 truy vấn cố định, không N+1** (`:169`).
- Nhóm lớp có `centerId = NULL` **bị bỏ qua, fail-closed** (`:165-167`).
- Phần thuần tách riêng để unit test (`buildPilotClassStats` `:93`, `sumPilotTotals` `:140`, `pct` `:81`).
- Trang gác bằng `checkPermission("chat:admin")` **không target** và giải thích rõ vì sao **không** mượn `chat:read` (`app/(admin)/admin/bao-cao/chat-pilot/page.tsx:10-14`).

🔴 **Nhưng nó chốt ngược với E-03 ở một điểm:** trang đó tuyên bố *"TRANG NÀY KHÔNG HIỆN MỘT CHỮ NỘI DUNG NÀO: chỉ đếm. Không tên phụ huynh, không tên người chưa đọc…"* (`:16-18`). E-03 yêu cầu hiện **tên PH + SĐT PH**. Hai chuẩn khác nhau trên cùng một loại dữ liệu ⇒ E-03 phải tự dựng cổng quyền riêng (§6.3), không được viện dẫn tiền lệ chat-pilot.

### 2.7 Hạ tầng UI panel

- `components/ui/sheet.tsx` — `Sheet` / `SheetTrigger` / `SheetClose` / `SheetContent` / `SheetHeader` / `SheetFooter` / `SheetTitle` / `SheetDescription` (`:129-138`). Dựng trên **Base UI** `Dialog` (`:4`), **không** phải Radix.
- **0 call-site** trong repo.
- Anh em cùng primitive là `components/ui/dialog.tsx` (34 file import) — dùng `open` / `onOpenChange` (vd `app/(admin)/admin/audit-log/_components/audit-log-detail-modal.tsx:57`, `components/chat/staff/delete-message-dialog.tsx:78`), nên `<Sheet open onOpenChange>` là hợp lệ với đúng bộ prop đó.
- Repo **không có** `vaul` và **không có** parallel/intercepting route nào (`find app -type d | grep -E "\(\.\)|@"` → rỗng).

---

## 3. Objectives & Success Metrics

### Goals

1. QLCS mở tab "Tương tác KH" thấy ngay **buổi còn nợ việc** trong khoảng ngày đang lọc, và bấm được sang danh sách chi tiết (E-01).
2. Có **một** con số tỉ lệ tương tác với **mẫu số định nghĩa được bằng văn bản** và tính lại được bằng tay (E-02).
3. Nhân sự có quyền xem được **ai đã tương tác với PH nào**, và **SĐT PH không lọt sang người không được xem** (E-03).
4. Từ bảng E-03 mở được cửa sổ chat **ngay trên dashboard**, **không rời trang**, **không viết lại chat**, và **đóng lại thì bộ lọc dashboard còn nguyên** (E-04).

### Non-Goals (cố ý không làm trong E)

1. **Không** viết mới bất kỳ component chat nào. Không fork `ChatThread`, không "bản rút gọn cho panel".
2. **Không** nới `assertActiveParticipant`, **không** thêm tham số bỏ qua nó, **không** thêm `DmKind` mới cho QLCS. Mọi nhu cầu "QLCS đọc kênh 1-1" đi qua đường `chat:admin` có audit hoặc bị từ chối (OQ-3).
3. **Không** bọc `scopedDb` quanh đường đọc chat của người dùng (`lib/chat/unread.ts:26-28`).
4. **Không** xây bộ lọc cơ sở/ngày riêng cho tab E — dùng đúng bộ của A-02.
5. **Không** đưa `Conversation` vào `SCOPED_MODELS` để "cho tiện" — lý do đã ghi tại chỗ (`lib/db-scope.ts:119-125`): DM có `centerId = null`, đưa vào là ẩn nhầm toàn bộ DM khỏi chính người trong cuộc.
6. **Không** đổi `lib/pending-tasks.ts` — đó là dashboard "việc tồn đọng", ngoài phạm vi E.
7. **Không** thêm thư viện drawer mới (`.claude/rules/ui-libraries.md`: "NEVER auto-add").

### Success Metrics

| Chỉ số | Hiện tại | Đích | Cách đo |
|---|---|---|---|
| E-01 đếm đúng theo range ngày | 0 (hệ hiện có không có range) | 100% | e2e: tạo 3 buổi ở 3 ngày, đổi range → số đổi theo |
| E-01 hoạt động với QLCS 2 cơ sở | Không (`lib/pending-tasks.ts:114` đơn trị) | 100% | e2e A-01: QLCS giữ CS1+CS2 → đếm gộp cả hai |
| E-02 mẫu số tính lại được bằng tay | Không đo được | Lệch 0 | Chạy SQL đối chiếu với con số trên màn |
| Rò `Conversation` chéo cơ sở qua E-02/E-03 | Chưa có test | 0 dòng | e2e: QLCS CS1 → 0 dòng của CS2 |
| SĐT PH lọt sang người không có quyền | Chưa có test | 0 | e2e: GV / PH gọi endpoint E-03 → 403 hoặc payload không có trường `phone` |
| E-04 mở chat mà **không** rời dashboard | — | 100% | e2e: mở panel, gửi 1 tin, đóng → URL vẫn ở `/dashboard`, `?center=`/`?dateFrom=`/`?dateTo=` nguyên vẹn |
| E-04 số dòng mã chat viết mới | — | **0** trong `components/chat/**` | Diff review: E-04 chỉ được thêm file ngoài `components/chat/` |
| Panel mở kênh không được phép | — | Báo lỗi rõ, không 500 | e2e: QLCS bấm kênh 1-1 → thông điệp VI, không stack trace |

---

## 4. Target Users & Segments

| Vai | Cần gì từ E | Ràng buộc kỹ thuật đã đo |
|---|---|---|
| **QLCS** (`CENTER_MANAGER`) | Cả 4 spec | Là participant của **nhóm lớp** thuộc cơ sở mình (`DerivedFrom.CENTER_MANAGER`); **không** vào DM; `chat:read/send/announce` scope **CENTER** ⇒ mọi `checkPermission` phải truyền `target.centerId` (`lib/auth/can.ts:26`) |
| **Quản lý lớp học / Giáo vụ** (`CENTER_CLASS_MANAGER`) | E-01, E-02, E-04 | Bộ quyền chat y hệt QLCS (`prisma/seed-roles.ts:571-573`) |
| **SUPER_ADMIN** | Cả 4 + tra cứu hội thoại ngoài phạm vi | Vai **duy nhất** có `chat:admin` (`prisma/seed-roles.ts:50`); đường tra cứu bắt buộc `reason` + audit trước khi đọc |
| **Giáo viên** (`TEACHER`) | Không phải người dùng chính của tab E | Nếu tab E lộ ra site GV thì SĐT PH phải bị chặn: `canViewParentContact` **cố ý loại TEACHER** (`lib/auth/permissions.ts:946-954`) |
| **Sale** (`CENTER_SALES_CSM`) | Không phải người dùng của tab E | `chat:read/send` scope **OWN** ⇒ chỉ kênh mình là participant |
| **Phụ huynh** | **Không bao giờ** thấy tab E | Luật cứng module chat: SĐT/email PH không bao giờ vào payload trả cho PH khác |

---

## 5. User Stories & Requirements

### P0 — Must Have

| # | User story | Acceptance criteria |
|---|---|---|
| **E-01-1** | Là QLCS, tôi thấy số buổi học & đánh giá còn thiếu **trong khoảng ngày đang lọc**. | Con số đếm `ClassSession` có `date` trong `[dateFrom, dateTo]` của A-02, `centerId ∈` phạm vi đã chọn, và `resolveAttendanceQueuePhase(...) === "PENDING"` (`lib/lms/attendance-queue.ts:153`). Đổi range → số đổi. **KHÔNG** dùng lại `sessionIncomplete` (`lib/pending-tasks.ts:235`) vì nó cứng `date < startOfToday` và scope đơn trị. |
| **E-01-2** | Bấm vào con số, tôi sang được danh sách chi tiết. | Trang đích liệt kê tối thiểu 4 cột spec đòi: **buổi chưa điểm danh · chưa đánh giá · buổi sắp tới · giáo viên phụ trách**. Ba chip trạng thái lấy thẳng từ `sessionWorkState` (`attendanceDone / feedbackDone / photoDone`, `lib/lms/attendance-queue.ts:107-121`) — **không** định nghĩa lại "đủ". |
| **E-01-3** | Con số của tôi khớp với thứ tôi thấy khi bấm vào. | Cùng một hàm phân bậc, cùng một bộ lọc. Nếu trang đích là `/admin/attendance` thì trang đó **phải** nhận thêm `dateFrom`/`dateTo` (hiện chỉ có `{sessionId, classId, centerId}` — `app/(admin)/admin/attendance/page.tsx:67`), nếu không thì con số và danh sách sẽ lệch. |
| **E-01-4** | QLCS 2 cơ sở đếm gộp cả hai. | Truy vấn dùng `centerId: { in: … }` lấy từ bộ lọc A-02 (đã cắt theo `actor.visibleCenterIds`), **không** đọc `session.user.centerId`. |
| **E-02-1** | Là QLCS, tôi thấy tỉ lệ "PH đã tương tác / tổng PH đang có con học". | Hiển thị dạng **phân số + phần trăm** (`12/20 · 60%`), mẫu số 0 → `—` **không phải 0%** (dùng `pct` sẵn có, `lib/chat/pilot-stats.ts:81`). |
| **E-02-2** | Mẫu số loại được PH có con đã nghỉ/thôi học. | Chỉ đếm PH có ≥1 `Enrollment` với `status ∈` danh sách chốt ở **OQ-2**, `deletedAt IS NULL`, `Student.deletedAt IS NULL`, `User.deletedAt IS NULL AND isActive = true` — sao đúng bộ điều kiện của `lib/chat/dm.ts:373-378`. **Một PH hai con đếm là 1** (spec §G, "E-02 … đếm theo PH"). |
| **E-02-3** | Tử số dùng định nghĩa "đã tương tác" đã chốt. | Định nghĩa nằm ở **OQ-1**; dù chọn phương án nào, PRD/`documentation/` phải ghi nguyên văn định nghĩa cạnh con số trên UI (tooltip hoặc chú thích), vì đây là chỉ số dễ bị hiểu sai nhất của tab E. |
| **E-02-4** | Số của tôi không lẫn cơ sở khác. | Mọi truy vấn chạm `Conversation` phải tự lọc `centerId ∈ getVisibleCenterIds(actor)` (`lib/auth/can.ts:66`). 🔴 **Và phải ghi rõ trong mã**: DM luôn có `centerId = null` (`lib/chat/dm.ts:623`) ⇒ bộ lọc này **loại sạch mọi kênh 1-1**. Nếu định nghĩa "đã tương tác" bao gồm kênh 1-1 thì **không được** lọc qua `Conversation.centerId`; phải lọc qua cơ sở của **học viên/enrollment**. |
| **E-03-1** | Là nhân sự có quyền, tôi xem bảng chi tiết PH tương tác. | Cột: tên PH · SĐT PH · danh sách người đã tương tác. Nguồn SĐT là `User.phone` (`prisma/schema.prisma:1051`) của tài khoản PH — **không** phải `Student.parentPhone` (`:1536`), hai trường này rời nhau và lệch được. |
| **E-03-2** | 🔴 Bảng này **chỉ nhân sự được xem**, và cột SĐT có cổng riêng. | Hai cổng **tách nhau**: (a) vào được trang/tab → quyền cấp trang; (b) thấy được cột SĐT → `canViewParentContact(session.user)` (`lib/auth/permissions.ts:957`) — chỉ `SUPER_ADMIN · CENTER_MANAGER · ACCOUNTANT · SALES_CSM` (`:949-954`), **TEACHER bị loại có chủ đích**. Không đạt (b) ⇒ **không đưa trường `phone` vào payload RSC**, không phải ẩn bằng CSS. |
| **E-03-3** | Payload không mang PII thừa. | Áp đúng tiền lệ `StaffChatMember` (`components/chat/staff/types.ts:31-40`): kiểu truyền xuống Client Component **cố ý không có** `contact`, vì "MỌI khoá của nó đi xuống trình duyệt trong payload RSC, kể cả khoá không component nào render". |
| **E-03-4** | Bảng không rò nội dung tin nhắn. | E-03 chỉ hiện **metadata**: ai, kênh gì, lần cuối khi nào. Nội dung chỉ xuất hiện trong panel E-04, và panel đó gác bằng `assertActiveParticipant`. |
| **E-04-1** | Bấm một kênh → chat mở **ngay trên dashboard**, không điều hướng. | Panel/drawer che một phần màn hình; URL vẫn là `/dashboard`; header/sidebar không remount. |
| **E-04-2** | Chat trong panel là **đúng component đang chạy prod**. | Render `ChatThread` từ `components/chat/staff/chat-thread.tsx:140`. Diff của E-04 **không được** thêm/sửa file nào trong `components/chat/**` (trừ trường hợp §6.5.3 buộc phải thêm prop, khi đó phải thêm **optional**, mặc định giữ nguyên hành vi cho 2 call-site cũ). |
| **E-04-3** | Đóng panel, bộ lọc dashboard còn nguyên. | Đóng = xoá **đúng một** searchParam (`?chat=`), giữ nguyên mọi param còn lại của A-02 (`center`, `dateFrom`, `dateTo`, `tab`…). Cơ chế cụ thể ở §6.5.2. |
| **E-04-4** | 🔴 Không có link nào trong panel làm tôi rời dashboard. | Ba prop `announcementsHref` / `membersHref` / `backHref` render thành `<Link>` thật (`components/chat/staff/chat-thread.tsx:452, 465, 489`). Phải xử lý theo §6.5.3 — **không được** để nguyên trỏ về `/tin-nhan`. |
| **E-04-5** | Kênh tôi không được phép mở thì báo rõ, không vỡ trang. | Người xem không phải participant → `assertActiveParticipant` ném (`lib/chat/queries.ts:434`). Panel bắt lỗi và hiện thông điệp tiếng Việt + lối đi thay thế; **không** để lỗi nổi lên thành 500. |
| **E-04-6** | 🔴 Ô nhập tin không bị xám oan trên prod. | `sendTarget` phải là **bản sao khớp hệt server**: `{ classId: sendClassId, centerId, createdById: userId }` (`components/chat/staff/chat-workspace.tsx:230`), với `sendClassId = type === "CLASS_GROUP" ? classId : await dmWitnessClassId(conversationId, userId)` (`:214-215`). Bỏ `createdById` ⇒ vai scope OWN bị xám ô nhập **trên prod** trong khi Server Action vẫn cho gửi, và **không lộ ở máy local** (local chạy RBAC v1 tĩnh — `:216-229`). |

### P1 — Should Have

| # | User story | Acceptance criteria |
|---|---|---|
| **E-01-5** | Tôi phân biệt được "chưa điểm danh" với "chưa đánh giá" ngay trên thẻ số. | Tách con số tổng thành 3 chip theo `attendanceDone / feedbackDone / photoDone`. |
| **E-03-5** | Tôi lọc/sắp xếp được bảng PH theo "lần tương tác gần nhất". | Sắp xếp giảm dần theo mốc thời gian của tín hiệu đã chốt ở OQ-1. |
| **E-04-7** | Panel nhớ vị trí cuộn khi tôi mở lại cùng một kênh. | Không bắt buộc; nếu làm thì bằng state client, không thêm searchParam. |
| **E-02-5** | Con số có ghi rõ "đang chạy" khi range chưa kết thúc. | Học tiền lệ `windowClosed` (`lib/chat/pilot-stats.ts:71-77`): đừng để dashboard báo một tỉ lệ như thể nó đã chốt. |

### P2 — Nice to Have / Future

| # | User story | Acceptance criteria |
|---|---|---|
| **E-04-8** | SUPER_ADMIN mở được kênh 1-1 mình không thuộc, ngay từ bảng E-03. | Đi qua `adminLookupConversationAction` (`lib/chat/_actions.ts:152`) — **bắt buộc `reason`**, audit trước khi đọc. Giao diện là **bản tra cứu chỉ-đọc**, KHÔNG phải `ChatThread`. |
| **E-03-6** | Xuất Excel bảng E-03. | Nếu làm thì áp đúng khuôn A-03 (quyền gán được + audit + mask PII), không tự chế cổng mới. |
| **E-01-6** | Cảnh báo khi buổi quá hạn chốt N ngày. | Ngưỡng để trong Cấu hình vận hành, không hard-code. |

---

## 6. Solution Overview

### 6.1 E-01 — Buổi học & đánh giá còn thiếu

**Chọn hệ nào:** dùng **bộ `attendance-queue`**, bỏ `sessionIncomplete`. Lý do đọc được từ mã:

| Tiêu chí | `sessionIncomplete` | `attendance-queue` |
|---|---|---|
| Định nghĩa "còn thiếu" | `status != COMPLETED` (`lib/pending-tasks.ts:241`) — một cờ | 3 việc xét **theo từng học viên** (`lib/lms/attendance-queue.ts:17-23`) |
| Range ngày | Không (`date < startOfToday`) | Không tự có, nhưng là hàm **thuần** nên range do người gọi cấp |
| Đa cơ sở | ❌ `user.centerId` đơn trị (`:114`) | ✅ không dính scope, người gọi tự lọc |
| Khớp với màn điểm danh admin | ❌ | ✅ cùng nguồn (`app/(admin)/admin/attendance/page.tsx:41-47`) |

**Hình dạng đề nghị** (file mới, KHÔNG sửa file cũ):

```
lib/dashboard/tuong-tac/session-gaps.ts
  // đọc db trần + tự lọc centerId ∈ getVisibleCenterIds(actor) — cùng khuôn pilot-stats.ts
  export async function countSessionGaps(actor, filters: ScopeFilters): Promise<{
    pending: number; missingAttendance: number; missingFeedback: number; missingMedia: number;
  }>
```

Ràng buộc bắt buộc:

1. **Không N+1 theo số buổi.** Mẫu chuẩn là `getChatPilotStats` — 6 truy vấn cố định (`lib/chat/pilot-stats.ts:169`). Cần: buổi trong range → roster theo lớp → attendance theo buổi → feedback theo buổi → media theo buổi (`SESSION_MEDIA_SELECT`, `lib/lms/session-order.ts:145`).
2. **Phần thuần đã có, đừng viết lại**: `sessionWorkState`, `resolveAttendanceQueuePhase`, `sortAttendanceQueue` (`lib/lms/attendance-queue.ts:107, 153, 200`).
3. **Trang đích:** ưu tiên mở rộng `/admin/attendance` bằng 2 searchParam ngày thay vì dựng trang thứ hai — nó đã là đích của thông báo và của nút ở `/admin/sessions`, đổi đường dẫn là gãy link cũ trong hộp thông báo người dùng (`app/(admin)/admin/attendance/page.tsx:9-11`).
4. **`ClassSession` ∈ `SCOPED_MODELS`** (chú thích `prisma/schema.prisma:1948-1950`) ⇒ nếu đi qua `scopedDb` thì đã được cách ly; nếu đi `db` trần (để join raw) thì **phải** tự lọc.

### 6.2 E-02 — Tỉ lệ PH đã tương tác

**Mẫu số** — hàm mới, khuôn SQL chép từ `lib/chat/dm.ts:364-380`:

```sql
SELECT COUNT(DISTINCT s."parentUserId")
FROM "Enrollment" e
JOIN "Student" s ON s."id" = e."studentId"
JOIN "User"    u ON u."id" = s."parentUserId"
WHERE e."centerId" = ANY(<visibleCenterIds ∩ bộ lọc A-02>)
  AND e."deletedAt" IS NULL
  AND e."status"    = ANY(<danh sách chốt ở OQ-2>)
  AND s."deletedAt" IS NULL
  AND s."parentUserId" IS NOT NULL
  AND u."deletedAt" IS NULL
  AND u."isActive"  = true
```

`Enrollment.centerId` là cột denormalize từ lớp và **đã** vào `SCOPED_MODELS` (`prisma/schema.prisma:1823-1825`) ⇒ dùng được làm trục cách ly.

**Tử số** — phụ thuộc OQ-1. Ba phương án, kèm hệ quả kỹ thuật đã đo:

| Phương án | Truy vấn | Ưu | Nhược |
|---|---|---|---|
| **A. PH đã GỬI ≥1 tin trong range** | `Message.senderId ∈ parentIds AND createdAt BETWEEN AND deletedAt IS NULL` | Đo **đúng** khoảng thời gian; là "tương tác" theo nghĩa thông thường | Không có index phù hợp (`prisma/schema.prisma:6569-6571`) ⇒ phải thêm index hoặc chấp nhận quét |
| **B. PH đã ĐỌC (`lastReadAt ≥ dateFrom`)** | `ConversationParticipant.lastReadAt` | Rẻ, có sẵn | **Không cộng dồn theo khoảng** — chỉ biết mốc cuối; đọc-rồi-thôi vẫn tính là "đã tương tác" mãi mãi |
| **C. Kết hợp: gửi tin **hoặc** đọc thông báo trong range** | A ∪ `AnnouncementRead.readAt BETWEEN` | Gần với "có phản hồi hệ thống" nhất | Hai nguồn ⇒ hai chỗ có thể lệch; phải khử trùng theo `userId` |

🔴 **Bẫy chung cho cả ba:** nếu lọc phạm vi qua `Conversation.centerId` thì **mọi kênh 1-1 rơi hết** (DM luôn `centerId = null`, `lib/chat/dm.ts:623`) — và đó thường lại là kênh PH tương tác thật. Trục cách ly đúng cho E-02 là **cơ sở của enrollment**, không phải cơ sở của hội thoại.

### 6.3 E-03 — Bảng chi tiết PH tương tác (và cổng quyền của nó)

**Hai cổng tách nhau, không gộp:**

```
(a) Vào tab/endpoint  → quyền cấp trang (xem OQ-4)
(b) Thấy cột SĐT      → canViewParentContact(session.user)   lib/auth/permissions.ts:957
```

Quy tắc hiện thực:

1. Không đạt (b) ⇒ **RSC không select `phone`**, không đưa trường đó vào object truyền xuống client. Tiền lệ và lý do: `components/chat/staff/types.ts:31-34`.
2. **Không chép lại danh sách vai** vào chỗ mới. `hidesContactOf` đã từng phải dọn đúng lỗi này và chú thích ghi rõ *"hai bản sao là hai luật, và lần trước chính hai bản sao đẻ ra mâu thuẫn này"* (`lib/chat/queries.ts:228-231`).
3. ⚠️ `canViewParentContact` đọc **vai v1** (`Role` enum: `SALES_CSM`…, `lib/auth/permissions.ts:949-954`), trong khi RBAC v2 dùng mã RoleDef khác (`CENTER_SALES_CSM`, `prisma/seed-roles.ts:609`). Hai bộ mã **không trùng nhau**. Nếu E-03 cần gác theo v2 thì phải dùng `checkPermission` với một action khai mới, **không** tự map tay hai bộ mã.
4. **Cột "danh sách người đã tương tác"** là metadata về ai đã nói chuyện với PH. Nó tiết lộ *quan hệ* (PH X ↔ GV Y) chứ không tiết lộ nội dung. Xếp cùng cổng (a); nội dung vẫn phải qua `assertActiveParticipant`.
5. E-03 **không** được viện dẫn `/bao-cao/chat-pilot` làm tiền lệ hiển thị: trang đó tuyên bố không hiện một chữ nội dung nào và không hiện tên PH (`app/(admin)/admin/bao-cao/chat-pilot/page.tsx:16-18`).

### 6.4 E-04 — PHẦN BẮT BUỘC 1: component tái sử dụng được

#### 6.4.1 Xác định chính xác

| Bản | File | Export | Loại |
|---|---|---|---|
| **Nhân viên (staff)** — **DÙNG BẢN NÀY cho dashboard QLCS** | `components/chat/staff/chat-thread.tsx` | `ChatThread` (`:140`), kiểu props `ChatThreadProps` (`:110`) | **Client Component** (`"use client"` dòng 1) |
| Khung ngoài của bản staff (danh sách + luồng) | `components/chat/staff/chat-workspace.tsx` | `StaffChatWorkspace` (`:85`) | **Server Component** (async, không `"use client"`) |
| Phụ huynh (portal) | `components/chat/portal/chat-thread.tsx` | `ChatThread` (`:72`) — props khai **inline**, không có type export | **Client Component** (`"use client"` dòng 1) |

**Vì sao bản staff, không phải bản portal** — khác biệt thật, đọc từ mã:

| | staff | portal |
|---|---|---|
| Quyền | `capabilities: { canSend, canAnnounce, canModerate }` (`staff/types.ts:60-64`) | chỉ `canSend: boolean` (`portal/chat-thread.tsx:78`) |
| Gửi thông báo | có `AnnouncementComposer` (`staff/chat-thread.tsx:472`) | không |
| Gỡ tin người khác | có `DeleteMessageDialog` | không |
| Thông báo ghim | `pinnedAnnouncement` prop (`staff/chat-thread.tsx:128`) | không có prop này |
| Link thành viên / thông báo / quay lại | có 3 prop (`:133, 135, 137`) | không |

QLCS giữ `chat:announce` scope CENTER (`prisma/seed-roles.ts:538`) ⇒ dùng bản portal là **cắt mất** một quyền họ đang có trên prod.

#### 6.4.2 Chữ ký props — TRÍCH NGUYÊN VĂN

`components/chat/staff/chat-thread.tsx:110-138`:

```typescript
export type ChatThreadProps = {
  conversationId: string;
  currentUserId: string;
  title: string;
  /** Nhãn phụ dưới tên hội thoại (vd "Nhóm lớp · 24 thành viên"). */
  subtitle: string;
  initialMessages: StaffChatMessage[];
  /** Ảnh của đúng những tin trên, cũng do RSC tải (US-11). */
  initialAttachments: MessageAttachmentRow[];
  initialHasMore: boolean;
  initialCursor: string | null;
  members: StaffChatMember[];
  capabilities: StaffChatCapabilities;
  /** Thông báo ghim (US-09 AC2) — lấy từ `listAnnouncements` nên không phụ thuộc 30 tin đầu. */
  pinnedAnnouncement: StaffChatMessage | null;
  /**
   * Lý do KHÔNG-PHẢI-KHOÁ làm ô nhập vô hiệu (US-09 AC3) — hiện chỉ có "đã lưu trữ".
   * Việc khoá đi đường riêng qua `initialLocked` + broadcast, vì nó đổi được GIỮA PHIÊN.
   */
  disabledReason: string | null;
  /** US-15 AC3 — trạng thái khoá lúc server render; broadcast `conversation.locked` đè lên. */
  initialLocked: boolean;
  /** Link màn "Xem tất cả thông báo". */
  announcementsHref: string;
  /** Link màn danh sách thành viên (nơi đặt nút "Nhắn riêng" — US-13 AC1). */
  membersHref: string;
  /** Link quay lại danh sách (chỉ hiện ở mobile). */
  backHref: string;
};
```

Ba kiểu phụ trợ, `components/chat/staff/types.ts`:

```typescript
export type StaffChatKind = "CHAT" | "ANNOUNCEMENT" | "SYSTEM";           // :13

export type StaffChatMessage = {                                          // :16-26
  id: string;
  conversationId: string;
  kind: StaffChatKind;
  senderId: string | null;
  body: string;
  deleted: boolean;
  replyToId: string | null;
  clientMsgId: string | null;
  createdAt: Date;
};

export type StaffChatMember = {                                           // :36-40
  userId: string;
  displayName: string;
  roleLabel: string;
};

export type StaffChatCapabilities = {                                     // :60-64
  canSend: boolean;
  canAnnounce: boolean;
  canModerate: boolean;
};
```

`MessageAttachmentRow` đến từ `components/chat/attachments/use-message-attachments` (import ở `staff/chat-thread.tsx:60-63`).

#### 6.4.3 Client hay Server? Có tự fetch không?

- **Client Component.** `"use client"` ở dòng 1 của `components/chat/staff/chat-thread.tsx`.
- **KHÔNG tự resolve dữ liệu ban đầu.** Nó chỉ "NỐI ba tầng đã có sẵn" (`:5-8`): `useChatChannel` + `chat-store` + cầu Server Action.
- **Tự lo hai thứ, đừng làm hộ:**
  1. **Realtime.** `useChatChannel` tự gọi `/api/chat/realtime-token` (`components/chat/use-chat-channel.ts:167-171`) và tự nối lại có backoff. RSC **không** phải cấp vé.
  2. **Tải thêm sau khi mount:** tin cũ hơn (`getMessagesPageAction`), bù tin khi rớt kết nối (`fetchMessagesSinceAction`), mốc đã đọc (`markConversationReadAction`), thu hồi (`recallOwnMessageAction`), gửi (`sendChatMessageAction`) — tất cả import từ `lib/chat/_actions.ts` (`staff/chat-thread.tsx:47-53`), ảnh qua `useMessageAttachments`.
- ⚠️ Nó gọi `router.refresh()` khi có thông báo mới (`staff/chat-thread.tsx:208`). Trong panel, `refresh()` sẽ **dựng lại toàn bộ RSC của trang dashboard**. Đây là hành vi đã có, không được gỡ (khung ghim là prop từ RSC) — chỉ cần biết để bọc các khối nặng của dashboard bằng `<Suspense>`.

#### 6.4.4 DANH SÁCH CHÍNH XÁC những gì RSC phải nạp trước

Đọc từ `ThreadPanel` (`components/chat/staff/chat-workspace.tsx:188-283`). **Bảy lời gọi**, không thiếu cái nào:

| # | Hàm | File:dòng định nghĩa | Cấp prop nào | Ghi chú |
|---|---|---|---|---|
| 1 | `listConversationsForUser(userId)` | `lib/chat/queries.ts:529` | `title` · `subtitle` · `initialLocked` · `disabledReason` · nguồn `classId`/`centerId`/`status`/`type` | **Đồng thời là chốt chống IDOR**: chỉ mở hội thoại nằm trong danh sách của chính mình, id lạ rơi về "chưa chọn" (`chat-workspace.tsx:107-111`) |
| 2 | `dmWitnessClassId(conversationId, userId)` | `lib/chat/dm.ts:479` | thành phần `classId` của `sendTarget` | **Chỉ** khi `type !== "CLASS_GROUP"`; thiếu nó thì GV thấy ô nhập xám ở mọi hội thoại riêng (`chat-workspace.tsx:207-213`) |
| 3 | `getMessagesPage(conversationId, userId)` | `lib/chat/queries.ts:662` | `initialMessages` · `initialHasMore` · `initialCursor` | 30 tin, cursor `(createdAt, id)` |
| 4 | `getConversationMembers(conversationId, userId)` | `lib/chat/queries.ts:764` | `members` | **Map xuống đúng 3 khoá** `userId/displayName/roleLabel`; **KHÔNG** kèm `contact` (`chat-workspace.tsx:241-248`) |
| 5 | `listAnnouncements(conversationId, userId, { limit: 1 })` | `lib/chat/announcements.ts:779` | `pinnedAnnouncement` | Lấy bản `!deleted` đầu tiên (`chat-workspace.tsx:250`) |
| 6 | `checkPermission(...)` ×3 | `lib/auth/check-permission.ts:25` | `capabilities` | `("chat:send", sendTarget)` · `("chat:announce", groupTarget)` · `("chat:moderate", groupTarget)` — **hai target khác nhau là CÓ CHỦ ĐÍCH** (`chat-workspace.tsx:207-213, 236-238`) |
| 7 | `listChatAttachments(conversationId, userId, messageIds)` | `lib/chat/messages.ts:723` | `initialAttachments` | **Chạy SAU (3)** vì cần danh sách id (`chat-workspace.tsx:252-257`) |

Ba giá trị **suy ra**, không phải gọi hàm:

```typescript
const sendTarget  = { classId: sendClassId, centerId, createdById: userId };  // :230
const groupTarget = { classId, centerId };                                    // :231
disabledReason = status === "ARCHIVED"
  ? "Lớp đã kết thúc — hội thoại đã lưu trữ, chỉ xem lại."                    // :63-66
  : null;
initialLocked = status === "LOCKED";                                          // :277
```

Thứ tự thực thi đúng: (1) → \[(2) nếu DM] → `Promise.all([3,4,5,6a,6b,6c])` → (7).

#### 6.4.5 Mẫu tham chiếu để sao chép

**`ThreadPanel` — `components/chat/staff/chat-workspace.tsx:188-283`.** Chép nguyên khối, đổi 3 href ở `:278-280` theo §6.5.3.

Bốn khối chú thích trong đó là **cảnh báo đã trả giá**, phải giữ khi chép:

- `:207-213` — hai target khác nhau cho gửi và cho thông báo/gỡ tin.
- `:216-229` — vì sao `createdById` bắt buộc, và vì sao lỗi này **không lộ ở máy local**.
- `:241-243` — vì sao `members` không mang `contact`.
- `:9-12` (đầu file) — vì sao đọc chat đi `db` trần chứ **không** `scopedDb`.

#### 6.4.6 Nếu không đi đường RSC

`lib/chat/_actions.ts` có **10** Server Action (`:106, 119, 134, 152, 169, 182, 201, 220, 242, 258`). Đối chiếu với bảng §6.4.4:

| RSC cần | Có action tương ứng? |
|---|---|
| (3) trang tin | ✅ `getMessagesPageAction` (`:258`) |
| (7) ảnh | ✅ `listChatAttachmentsAction` (`:242`) |
| (4) thành viên | ❌ **KHÔNG CÓ** |
| (5) thông báo ghim | ❌ **KHÔNG CÓ** |
| (6) quyền | ❌ **KHÔNG CÓ** |
| (1) tiêu đề/trạng thái/loại/centerId | ❌ **KHÔNG CÓ** |

⇒ Panel thuần client sẽ phải **thêm 3–4 Server Action mới** vào bề mặt HTTP của module chat. Đó là lý do §6.5 chọn đường RSC.

### 6.5 E-04 — PHẦN BẮT BUỘC 2: cách nhúng vào panel

#### 6.5.1 Component drawer dùng được — và ba cảnh báo

**Dùng `components/ui/sheet.tsx`.** Export: `Sheet · SheetTrigger · SheetClose · SheetContent · SheetHeader · SheetFooter · SheetTitle · SheetDescription` (`:129-138`).

`SheetContent` (`:39-48`):

```typescript
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
})
```

`Sheet` = `SheetPrimitive.Root` (`:10-12`) trên Base UI `Dialog` (`:4`) ⇒ nhận `open` / `onOpenChange` (đã dùng thật với cùng primitive ở `components/ui/dialog.tsx` + `components/chat/staff/delete-message-dialog.tsx:78`).

> 🔴 **Cảnh báo 1 — CHIỀU CAO. `side="bottom"` và `side="top"` là `h-auto`.**
> Chuỗi class ở `sheet.tsx:56` chứa `data-[side=bottom]:h-auto` và `data-[side=top]:h-auto`; chỉ `left`/`right` mới có `h-full`.
> `ChatThread` root là `flex h-full min-h-[60vh] flex-col overflow-hidden` (`chat-thread.tsx:447`) — `h-full` trong một cha `h-auto` **không có gì để tham chiếu** ⇒ chỉ còn `min-h-[60vh]` giữ nó khỏi sụp, và vùng cuộn tin bên trong sẽ hành xử sai.
> ⇒ **Dùng `side="right"`** (hoặc `left`). Nếu buộc phải `bottom` (mobile) thì phải cấp chiều cao tường minh cho `SheetContent`, vd `data-[side=bottom]:h-[85dvh]`.

> 🔴 **Cảnh báo 2 — CHIỀU RỘNG. `sm:max-w-sm` = 384px, quá hẹp cho chat, và override kiểu thường sẽ THUA.**
> `sheet.tsx:56` có `data-[side=left]:sm:max-w-sm` và `data-[side=right]:sm:max-w-sm`.
> Truyền `className="sm:max-w-2xl"` **không ăn**, vì hai lý do cộng dồn:
> 1. `cn()` = `twMerge(clsx(...))` (`lib/utils.ts:4`). tailwind-merge gom theo **bộ modifier**; `data-[side=right]:sm:max-w-sm` có modifier `{data-[side=right], sm}`, còn `sm:max-w-2xl` có `{sm}` — **khác bộ** ⇒ **không** khử nhau, cả hai cùng tồn tại.
> 2. Class có biến thể `data-[side=…]` biên dịch thành selector kèm attribute ⇒ **độ đặc hiệu cao hơn** class thường ⇒ nó thắng.
> ⇒ Override **bằng đúng cùng bộ modifier**: `className="data-[side=right]:sm:max-w-2xl"` (hoặc `lg:data-[side=right]:sm:max-w-3xl`). Kiểm bằng mắt trên 375px / 768px / 1440px trước khi báo PASS.

> ⚠️ **Cảnh báo 3 — KHOẢNG ĐỆM.** `SheetContent` có `flex flex-col gap-4` và **không** tự padding (padding nằm ở `SheetHeader`/`SheetFooter`, `:87, :97`). `ChatThread` tự có viền + bo góc riêng ⇒ bọc nó trong `<div className="min-h-0 flex-1 p-0">` và cân nhắc `gap-0` để không có khe 16px lơ lửng dưới header. Không sửa `sheet.tsx` cho riêng E-04 — nó là component dùng chung, mà E-04 mới là call-site đầu tiên.

**Cấu trúc đề nghị:**

```tsx
// components/admin/tuong-tac/chat-panel.tsx   ("use client")
<Sheet open={open} onOpenChange={(o) => { if (!o) closePanel(); }}>
  <SheetContent
    side="right"
    className="data-[side=right]:sm:max-w-2xl gap-0 p-0"
  >
    <SheetHeader className="sr-only">
      <SheetTitle>Hội thoại</SheetTitle>   {/* a11y: Dialog cần title */}
    </SheetHeader>
    <div className="min-h-0 flex-1">
      {children}   {/* ← nội dung do RSC dựng, xem 6.5.2 */}
    </div>
  </SheetContent>
</Sheet>
```

`children` là `ReactNode` do **Server Component cha** truyền xuống — hợp lệ trong App Router và là cách duy nhất để `ChatThread` nhận đủ 7 nguồn dữ liệu ở §6.4.4 mà không phải sinh action mới.

#### 6.5.2 Giữ nguyên trạng thái bộ lọc dashboard — cơ chế cụ thể

**Chốt: dùng `searchParams`, không dùng state client, không dùng shallow routing.**

Ba lý do đọc được từ mã:

1. Bộ lọc A-02 sống trong URL. `ReportFilterBar` là **form GET server-component** (`components/admin/report-filter-bar.tsx:23-25`) và `resolveReportFilters` đọc `sp.center / sp.dateFrom / sp.dateTo` (`lib/reports/filters.ts:50-53, 67-75`). Bộ lọc **không có** bản sao trong state client để mà giữ.
2. Nội dung panel phải do RSC dựng (§6.4.6). State client thuần không kéo được nó về mà không thêm 4 action mới.
3. Next.js App Router **không có** shallow routing kiểu Pages Router. `router.replace(url, { scroll: false })` vẫn chạy lại RSC của route.

**Luồng chốt:**

| Thao tác | Cơ chế | Kết quả |
|---|---|---|
| **Mở** kênh | `router.replace(\`${pathname}?${new URLSearchParams({ ...currentParams, chat: id })}\`, { scroll: false })` — build từ `useSearchParams()` hiện tại | Mọi param của A-02 **được chép nguyên**; thêm đúng 1 khoá |
| **Đóng** panel | Xoá **duy nhất** khoá `chat`, giữ phần còn lại, `router.replace(..., { scroll: false })` | Bộ lọc còn nguyên; dashboard render lại đúng khoảng ngày cũ |
| Đổi bộ lọc **trong lúc panel mở** | Form GET của A-02 chỉ submit field của chính nó ⇒ `?chat=` **rụng** | Đúng ý muốn: lọc lại thì đóng panel |
| Người dùng bấm Back | Trình duyệt trả về URL trước đó | Panel đóng/mở theo lịch sử, bộ lọc không đổi |

Trang cha (RSC) chỉ cần:

```tsx
// app/(admin)/admin/dashboard/page.tsx  (RSC)
const sp = await searchParams;                     // { center?, dateFrom?, dateTo?, tab?, chat? }
…
{sp.chat ? (
  <ChatPanel open>                                  {/* client wrapper, 6.5.1 */}
    <DashboardThreadPanel                           {/* RSC — bản chép của ThreadPanel */}
      userId={session.user.id}
      conversationId={sp.chat}
    />
  </ChatPanel>
) : null}
```

Ba điểm phải nói rõ với người hiện thực:

- **Chỉ render panel khi `sp.chat` có giá trị.** Render sẵn khi đóng nghĩa là chạy cả 7 truy vấn của §6.4.4 mỗi lần vào dashboard.
- **Không có hoạt ảnh đóng.** Điều hướng xảy ra ngay, panel biến mất cùng lúc. Nếu cần hiệu ứng ra thì phải giữ một state trung gian ở client — không bắt buộc cho P0.
- **`router.refresh()` của `ChatThread`** (`chat-thread.tsx:208`) chạy lại RSC dashboard. Bọc các khối số liệu nặng của 4 tab bằng `<Suspense>` để panel không bị chặn bởi truy vấn của tab.

#### 6.5.3 Xử lý ba prop điều hướng làm người dùng RỜI dashboard

`announcementsHref` / `membersHref` / `backHref` được render thành `<Link>` thật:

| Prop | Nơi render | Trong panel sẽ gây gì |
|---|---|---|
| `backHref` | `chat-thread.tsx:452` — nút mũi tên, `lg:hidden` | Trên **mobile** (dưới `lg`) hiện ra và bấm là rời trang |
| `membersHref` | `:465` — chữ "N thành viên" gạch chân | Rời trang sang tab thành viên |
| `announcementsHref` | `:489` — "Xem tất cả thông báo" trong khung ghim | Rời trang sang tab thông báo |

**Phương án chốt cho P0 — trỏ về chính dashboard, giữ bộ lọc:**

```typescript
const stay = `${pathname}?${paramsGiuNguyen}`;   // paramsGiuNguyen = mọi param A-02 + chat=<id>
backHref          = stay;   // bấm = không đi đâu cả (mobile)
membersHref       = stay;
announcementsHref = stay;
```

Ưu: **0 dòng sửa trong `components/chat/**`**. Nhược: hai link kia trở thành nút chết — chấp nhận được vì trong một panel hẹp, danh sách thành viên và trang thông báo đều không phải việc của tab E.

**Nếu chủ dự án muốn hai màn đó dùng được** (P1): thêm **prop optional** vào `ChatThreadProps`, không đổi hành vi 2 call-site cũ. Vd `onNavigate?: (dich: "members" | "announcements" | "back") => void`; khi có thì render `<button>` thay `<Link>`. Ràng buộc: prop **optional**, mặc định `undefined` ⇒ `app/(admin)/admin/tin-nhan/page.tsx` và `app/(teacher)/teacher/tin-nhan/page.tsx` không phải đổi một dòng nào. Đây là ngoại lệ **duy nhất** được phép chạm `components/chat/**` trong E-04.

⚠️ **Đừng dùng lại `OpenDmButton`** (`components/chat/open-dm-button.tsx:22`) để mở kênh từ bảng E-03: nó `router.push(hrefTemplate…)` (`:76`) — **điều hướng thật**, đúng thứ E-04 cấm. Nếu cần mở kênh mới thì gọi `openDmAction` (`lib/chat/_actions.ts:134`) rồi tự `router.replace` thêm `?chat=<id>` theo §6.5.2.

#### 6.5.4 🔴 Nếu sinh Server Action mới — luật E-bis #1

File `"use server"` **CHỈ được export `async function`**.

Nguồn: `docs/chat-realtime/00-dieu-chinh-cho-repo.md:71` — *"Server-actions loader sinh export VALUE cho tên chỉ có ở tầng type ⇒ `ReferenceError` lúc eval module ⇒ chết TOÀN BỘ action trong module đó."*

Bản thân `lib/chat/_actions.ts` đã gim luật này ở đầu file (`:5-10`):

```
//   - KHÔNG `export type`, KHÔNG `export const`, KHÔNG re-export `export { x } from`.
//   - Cần type ở nơi khác → import thẳng từ file định nghĩa (`lib/chat/queries.ts`, …).
```

Bằng chứng file đó tuân thủ: **10 dòng `^export` và cả 10 đều là `export async function`** (`:106, 119, 134, 152, 169, 182, 201, 220, 242, 258`); các type nó cần đều đi bằng `import type` (`:37-44`).

⚠️ **`pnpm typecheck` + `pnpm lint` + `pnpm build` đều XANH khi vi phạm** — đây là 1 trong 5 bug lọt mọi cổng test ở nghiệm thu 09/08 (`00-dieu-chinh-cho-repo.md:67-71`). Nên với E-04:

1. Ưu tiên **không sinh action mới** (đường RSC ở §6.5.2 không cần cái nào).
2. Nếu buộc phải: đặt trong file `"use server"` riêng, kiểm bằng mắt rằng **mọi** `export` đều là `async function`, và **chạy thử thật** — không tin ba cổng build.
3. Type/hằng dùng chung đặt ở file **thường** (không `"use server"`), như `lib/enrollment-status.ts:6` ghi rõ *"File THƯỜNG (không `use server`) để được export const an toàn"*.

### 6.6 Ràng buộc cứng dùng chung cho cả khu vực E

| # | Luật | Nguồn | Vi phạm thì hỏng thế nào |
|---|---|---|---|
| 1 | **KHÔNG** bọc `scopedDb` quanh đường đọc chat của người dùng | `lib/chat/unread.ts:26-28`; `chat-workspace.tsx:9-12`; E-bis #5 | GV dạy chéo cơ sở **mất sạch hội thoại, im lặng** |
| 2 | Màn **SỐ LIỆU** đọc `Conversation` **phải** tự lọc `centerId ∈ getVisibleCenterIds(actor)` | `lib/db-scope.ts:125`; `lib/auth/can.ts:66`; mẫu `lib/chat/pilot-stats.ts:175` | Rò dữ liệu chéo cơ sở |
| 3 | Bộ lọc `Conversation.centerId` **loại sạch DM** | `lib/chat/dm.ts:623` | E-02 đếm thiếu mà không ai thấy |
| 4 | Mọi kiểm quyền đi qua `can()`/`checkPermission`, cấm điều kiện quyền inline | CLAUDE.md "Nền Hệ thống" luật #1; `eslint.config.mjs:62-102, 306` | Build fail (hoặc tệ hơn: lọt vì file nằm trong allowlist) |
| 5 | `checkPermission` với action scope **CENTER** phải truyền `target.centerId` | `lib/auth/can.ts:26` | Trả `false` ⇒ khoá cửa QLCS **trên prod**, xanh ở local |
| 6 | Cấm import `@/lib/db` trần trong `app/(admin)/**` | `eslint.config.mjs:165-170` | ESLint error. Helper đặt ở `lib/**` thì **được phép** ⇒ trang trông sạch mà dữ liệu vẫn không scope (A-nen-tang §9/RT-2) |
| 7 | Bảng mới (nếu có) **bắt buộc** cột `orgUnitId`, **không** thêm `centerId` mới | CLAUDE.md "Nền Hệ thống" luật #3 | Lệch nền tổ chức |
| 8 | Test đỏ viết **trước** Server Action | CLAUDE.md "Nền Hệ thống" luật #5 | Story chưa đủ điều kiện làm |
| 9 | SĐT/email PH **không bao giờ** vào payload trả cho PH khác | Luật cứng module chat; `lib/chat/queries.ts:189-197` | Rò PII |

---

## 7. Open Questions

| # | Câu hỏi | Vì sao chặn | Chủ | Hạn |
|---|---|---|---|---|
| ~~**OQ-1**~~ | ~~Chốt định nghĩa "PH đã tương tác" — (A) gửi tin / (B) `lastReadAt` / (C) kết hợp?~~ | ✅ **ĐÃ CHỐT 26/08/2026: phương án (A) — PH đã GỬI ≥ 1 tin trong khoảng ngày.** Lý do giữ đúng khuyến nghị: chỉ (A) đo đúng **khoảng thời gian**; `lastReadAt` (`prisma/schema.prisma:6566`) và `lastLoginAt` (`:1093`) là **vô hướng, bị ghi đè** nên "đã tương tác trong tháng 7" không tính được từ chúng. **Câu con cũng chốt: CÓ tính kênh 1-1.** 🔴 Hệ quả bắt buộc: **KHÔNG được lọc phạm vi qua `Conversation.centerId`** — DM luôn `centerId = null` (`lib/chat/dm.ts:623`), lọc kiểu đó là **rơi sạch** kênh 1-1, đúng kênh PH tương tác thật (§6.2 bẫy chung); trục cách ly của E-02/E-03 là **cơ sở của enrollment** (`Enrollment.centerId`, đã ở `SCOPED_MODELS`). Kéo theo: **(1) OQ-8 thành bắt buộc** — không có `@@index([senderId, createdAt])` thì mỗi lần mở dashboard là một lần quét toàn bảng `Message`; **(2)** tử số là phép **ĐẾM**, không đi qua `getMessagesPage` nên không dính `assertActiveParticipant` — đổi lại nó **không được** trả ra một chữ nội dung nào (§6.3 luật 5); **(3)** tử số phải **khử trùng theo `parentUserId`** như mẫu số — một PH nhắn 50 tin vẫn là **1** (spec §G: E-02 đếm theo PH); **(4)** định nghĩa này phải in **nguyên văn** cạnh con số trên UI (E-02-3). | — | Đóng |
| ~~**OQ-2**~~ | ~~E-02 lọc `Enrollment.status` nào trong 9 giá trị?~~ | ✅ **ĐÃ CHỐT 26/08/2026: dùng đúng hằng `ENROLLMENT_ACTIVE_STATUS_LIST`** (`lib/enrollment-status.ts:17`) = `ACTIVE · CONFIRMED · STUDYING · PAUSED`. ⇒ **(a) `PAUSED` CÓ tính** (tạm dừng vẫn thuộc lớp — `lib/enrollment-status.ts:5`); **(b) `COMPLETED` KHÔNG tính**, cùng `WITHDREW · TRANSFERRED · CANCELLED · PENDING`. Lý do giữ đúng khuyến nghị: mẫu số E-02 **khớp với sĩ số mà điểm danh đang dùng** — hai màn cùng một tập người thì mới đối chiếu được. **Hệ quả:** dùng **hằng có sẵn**, **không** chép danh sách trạng thái sang file mới (bản sao thứ hai là nguồn của lệch — cùng bài học `hidesContactOf`, `lib/chat/queries.ts:228-231`); và PH có con **vừa học xong khoá, chưa ghi danh khoá mới** rơi khỏi mẫu số ⇒ tỉ lệ **nhích lên** ở kỳ nhiều lớp kết thúc — đó là hành vi **đúng theo định nghĩa đã chốt**, không phải lỗi, nhưng phải nói trước với người đọc số. | — | Đóng |
| ~~**OQ-3**~~ | ~~E-04: QLCS bấm vào kênh 1-1 thì xảy ra gì?~~ | ✅ **ĐÃ CHỐT 26/08/2026: (a) cho P0 · (b) cho P2 · (c) LOẠI.** **(a)** dropdown E-04 **chỉ liệt kê hội thoại mà người xem là participant còn hiệu lực** (QLCS ⇒ **chỉ nhóm lớp**); mục 1-1 **hiện mờ kèm lý do**, **không ẩn** — ẩn thì người dùng tưởng hệ thống hỏng, hiện mờ thì họ đọc được vì sao. **(b)** ở **P2**, **chỉ `SUPER_ADMIN`** mở được 1-1, qua `adminLookupConversationAsActor` (`lib/chat/admin.ts:513`, gọi qua Server Action `adminLookupConversationAction` — `lib/chat/_actions.ts:152`): **bắt buộc `reason`**, `writeAudit` **trước khi** đọc dòng tin đầu tiên (`:497-512`), và là **màn tra cứu CHỈ-ĐỌC** — **không** phải `ChatThread`. **(c)** thêm `DmKind` mới / mở `DM_STAFF` cho QLCS: **LOẠI** (nới quyền thật, ngoài phạm vi E). 🔴 **Luật cứng đi kèm: TUYỆT ĐỐI KHÔNG nới `assertActiveParticipant`** (`lib/chat/queries.ts:415-452`) — không thêm cờ, không thêm tham số bỏ qua, không thêm nhánh ngoại lệ. Đó là **Non-Goal 2** của E; nới nó là mở quyền **đọc tin nhắn riêng** cho một vai chưa ai trao quyền đó. Kèm theo: `CENTER_MANAGER` **cố ý không** có `chat:admin` (`prisma/seed-roles.ts:545`) ⇒ (b) **không** mở cho QLCS kể cả ở P2. | — | Đóng |
| ⚙️ ~~**OQ-4**~~ | ~~Quyền cấp trang cho tab E là gì?~~ | ✅ **CHỐT KỸ THUẬT 24/08/2026 (Dev): khai key MỚI `dashboard:view` (scope `GLOBAL`)** gác trang dashboard 4 tab; **từng tab** gate thêm bằng key lĩnh vực sẵn có — **B** → `payments:view` · **C** → `leads:view-all` · **D** → `dashboard:view` · **E** → `dashboard:view` (cột SĐT phụ huynh vẫn qua `canViewParentContact`). ❌ **Không mượn `chat:read`** — scope `CENTER`/`ASSIGNED` nên gọi không target luôn trả `false`: xanh ở local (v1), **khoá cửa trên prod** (v2). 📌 Nợ: `canEditAds` (`lib/crm/ads-insights.ts:44-49`) so `roleCode` bằng tay, trái luật Nền Hệ thống #1 — đưa quyền ads vào registry là việc của D (OQ-D5). ⚠️ Key mới ⇒ **chạy `seed-prod-roles.yml` sau merge**. | — | Đóng |
| ⚙️ ~~**OQ-5**~~ | ~~Thứ tự suy "giáo viên phụ trách" của một buổi?~~ | ✅ **CHỐT KỸ THUẬT 24/08/2026 (Dev): `substituteTeacherId ?? actualTeacherId ?? class.teacherId`** (`lib/lms/schedule-conflict.ts:109`) — người **thật sự đứng lớp** mới chịu trách nhiệm buổi đó. **Bắt buộc kèm:** đưa thứ tự này vào **một helper dùng chung** (vd `lib/lms/session-teacher.ts`), E-01 gọi helper chứ không tự viết lại — nếu không repo có **thứ tự thứ năm**. Chuyển 4 chỗ cũ (có `hieu-suat-gv/page.tsx:285`) sang helper là **ticket riêng**, không gánh trong E: đổi chúng làm số hiệu suất GV nhảy, phải báo trước. | — | Đóng |
| ⚙️ ~~**OQ-6**~~ | ~~E-01 trang đích: mở rộng `/admin/attendance` hay dựng trang mới?~~ | ✅ **CHỐT KỸ THUẬT 24/08/2026 (Dev): MỞ RỘNG `/admin/attendance`**, thêm `dateFrom`/`dateTo` vào `searchParams` (hiện chỉ `{sessionId, classId, centerId}` — `page.tsx:67`). Trang đó là **đích của link trong hộp thông báo** (`:9-11`) — đổi đường dẫn là gãy link cũ, và hai trang cùng chức năng sớm muộn lệch nhau. Ràng buộc: thiếu `dateFrom`/`dateTo` ⇒ hành vi **y hệt hôm nay**. | — | Đóng |
| ~~**OQ-7**~~ | ~~**E-03 có xuất hiện trên site giáo viên không?**~~ | ✅ **ĐÃ CHỐT 27/08/2026: KHÔNG — E-03 KHÔNG lên site giáo viên**, chỉ sống trên admin. **Hệ quả:** (1) phạm vi test PII **KHÔNG rộng thêm một site** — không thêm bề mặt `app/(teacher)/**`, không thêm ca "GV mở E-03 không thấy SĐT"; bộ test PII ở §8.2 bước E.1 **giữ nguyên**; (2) `canViewParentContact` **giữ nguyên**, không thêm không bớt vai — `TEACHER` vẫn ngoài danh sách 4 vai `SUPER_ADMIN · CENTER_MANAGER · ACCOUNTANT · SALES_CSM` (`lib/auth/permissions.ts:957-962`, hàm `:965`, chú thích chủ đích `:955-956`); (3) hai cổng quyền của E-03 (§8.2 bước E.4) **vẫn tách nhau** như cũ — câu này chỉ bỏ bớt một bề mặt, không nới cổng nào. ⚠️ Chỉ áp cho **E-03**: muốn đưa bảng có SĐT PH lên `app/(teacher)/**` sau này là **quyết định mới**, phải hỏi lại. | — | Đóng |
| ⚙️ ~~**OQ-8**~~ | ~~Có chấp nhận thêm index cho `Message(senderId, createdAt)` không?~~ | ✅ **CHỐT KỸ THUẬT 24/08/2026 (Dev): CÓ.** Migration **thêm index**, không đụng cột có dữ liệu ⇒ không vi phạm luật cứng #4, nhưng nằm **trong story E-02**, không tách lẻ. Không có nó thì mỗi lần mở dashboard là một lần **quét toàn bảng `Message`** — bảng lớn nhanh nhất hệ thống. ⚠️ Bảng đang chạy ⇒ dùng `CREATE INDEX CONCURRENTLY` (viết tay trong file migration) để không khoá ghi. | — | Đóng |

---

## 8. Timeline & Phasing

### 8.1 Điều kiện vào

E **không** chặn ai và **không** bị F/G chặn (spec "Thứ tự thi công đề xuất" mục 5: *"E — chat đã lên prod nên không còn phụ thuộc, có thể đẩy lên song song với C/D"*). Nhưng E **phụ thuộc A**:

| Phụ thuộc | Vì sao |
|---|---|
| **A-02** (`resolveScopeFilters` + `scope-filter-bar.tsx`) | Cả 4 spec E đều đọc theo cơ sở + range ngày. Không có A-02 thì E phải tự dựng bộ lọc thứ hai — đúng thứ A-02 sinh ra để tránh |
| **A-02-7** | Tab E đọc `Conversation` ∈ `SCOPE_EXEMPT` ⇒ theo A-02-7, tab E **chưa** được bật tuỳ chọn "Tất cả cơ sở" cho tới khi có đường lọc tay + test cách ly. §6.6 luật #2 chính là đường lọc tay đó |
| **A-01** | E-01/E-02 phải chạy đúng với QLCS đa cơ sở; nếu vẫn đọc `session.user.centerId` thì hỏng đúng như `lib/pending-tasks.ts:114` |

**Ba câu phải chốt trước dòng mã đầu tiên:** OQ-1, OQ-2, OQ-3.

### 8.2 Thứ tự thi công

| Bước | Nội dung | Phụ thuộc | Ghi chú |
|---|---|---|---|
| **E.0** | Chốt OQ-1, OQ-2, OQ-3 | — | Ba câu này định nghĩa dữ liệu; không chốt thì code phải viết lại |
| **E.1** | Test đỏ trước (luật Nền Hệ thống #5): cách ly cơ sở E-02/E-03 · 403/không-có-cột-SĐT cho vai không được xem · panel E-04 giữ nguyên searchParams · người không phải participant mở panel → thông điệp VI | E.0 | Bộ ma trận quyền chat đặt `tests/chat/`, chạy vitest node + `runAction` (delta E.10) |
| **E.2** | **E-01** — `countSessionGaps` + gắn vào tab + mở rộng `/admin/attendance` 2 param ngày | A-02, E.1, OQ-5, OQ-6 | Tái dùng `attendance-queue`; **không** sửa `lib/pending-tasks.ts` |
| **E.3** | **E-02** — mẫu số + tử số + thẻ tỉ lệ | E.1, OQ-1, OQ-2 (+ OQ-8 nếu chọn (A)) | Khuôn `getChatPilotStats`: N truy vấn cố định, phần thuần tách để unit test |
| **E.4** | **E-03** — bảng + hai cổng quyền tách nhau (**chỉ admin** — OQ-7 chốt 27/08: không lên site GV) | E.3, OQ-4, ~~OQ-7~~ (đóng 27/08) | Payload **không** mang `phone` khi không đạt cổng (b) |
| **E.5** | **E-04** — `chat-panel.tsx` (client) + `DashboardThreadPanel` (RSC chép từ `ThreadPanel`) + đường mở/đóng bằng searchParams | E.4, OQ-3 | Diff **0 dòng** trong `components/chat/**` (trừ ngoại lệ §6.5.3) |
| **E.6** | Nghiệm thu tay | E.5 | Xem §8.4 |
| **E.7** | Cập nhật `documentation/` + `docs/chat-realtime/permissions.md` nếu E-04 đụng ma trận quyền | E.6 | Luật Nền Hệ thống #10 |

### 8.3 Ràng buộc môi trường

- `test.satarobo.vn` và máy local **dùng chung một DB** (CLAUDE.md). E không có migration DROP/RENAME; nếu chọn OQ-8 thì đó là **thêm index**, an toàn.
- **Máy local chạy RBAC v1 tĩnh, prod chạy v2 động** (CLAUDE.md; `lib/flags.ts:8`). Mọi kết luận về quyền của E-04 (ô nhập xám, cột SĐT, cửa vào tab) **không được** rút ra từ local. Đây là đúng lớp bug mà `chat-workspace.tsx:227-229` đã ghi lại.
- Chat trên prod cần seed quyền và backfill nhóm lớp (`00-dieu-chinh-cho-repo.md:196-203`) — E giả định các bước đó **đã xong**, vì spec ghi "chat realtime đã lên production". Nếu tab E lên prod mà `/tin-nhan` vẫn rỗng thì lỗi nằm ở đó, không phải ở E.

### 8.4 Nghiệm thu tay bắt buộc (không cổng tự động nào bắt được)

Bốn việc dưới đây **xanh hết ở `typecheck` + `lint` + `build` + unit test** mà vẫn hỏng thật:

1. **Chiều rộng/chiều cao panel** — §6.5.1 cảnh báo 1 & 2. Kiểm mắt ở 375px / 768px / 1440px, và kiểm rằng vùng cuộn tin cuộn **bên trong** panel chứ không đẩy trang.
2. **Ô nhập tin có xám không** — chỉ lộ trên prod/test (v2), không lộ ở local (v1). Đăng nhập đúng vai QLCS thật, mở một nhóm lớp, xem con trỏ có gõ được không.
3. **Đóng panel có mất bộ lọc không** — mở dashboard với `?center=<CS2>&dateFrom=…&dateTo=…`, mở panel, đóng, so URL từng ký tự.
4. **Server Action mới (nếu có)** — §6.5.4. Gọi thật một lần; `ReferenceError` chỉ xuất hiện lúc eval module trên runtime.
