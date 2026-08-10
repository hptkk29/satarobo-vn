# permissions.md — Ma trận quyền tĩnh

> Bản đối chiếu cho audit access-control. `flows.md` là bản động; `tests.md` cho biết ô nào đã được test pin.

## Vai & nguồn scope

| Vai | Xác định bằng | Scope dẫn xuất từ |
|---|---|---|
| PH | `User.role=PARENT` | Quan hệ PH→học viên→lớp (DB, không phải token) |
| GV | `User.role=TEACHER` | Phân công dạy lớp (DB) — KHÔNG theo `centerId` của user (GV biên chế HO dạy chéo cơ sở) |
| QLCS | Quản lý `Center` | `Class.centerId` của lớp (DB) |
| Sale | `User.role=SALES_CSM` / RoleDef `CENTER_SALES_CSM` | **F5 mở lại 10/08/2026**: CHỈ kênh 1-1 với phụ huynh mình được gán (`Enrollment.saleId`). ❌ ở MỌI ô nhóm lớp |
| Admin HO | Quản trị hệ thống | Toàn cục, nhưng đọc nội dung ngoài thành viên phải qua F-AUDIT |

Mọi scope tính từ **DB tại thời điểm request**, không nhúng vào JWT — trừ TB2 (subscribe) nơi policy RLS tự query DB lúc join.

## Ma trận resource × operation × vai

Ký hiệu: ✅ cho phép · ❌ từ chối (kèm test pin ô đó) · ⚠️ cho phép có điều kiện.

### Nhóm lớp (CLASS_GROUP)

| Operation | PH | GV | QLCS | Sale | Admin |
|---|---|---|---|---|---|
| Đọc tin | ✅ lớp của con | ✅ lớp mình dạy | ✅ lớp cơ sở mình | ❌ | ⚠️ qua F-AUDIT nếu không phải thành viên |
| Gửi CHAT | ✅ | ✅ | ✅ | ❌ | ❌ (nếu không phải thành viên) |
| Gửi ANNOUNCEMENT | ❌ | ✅ | ✅ | ❌ | ✅ |
| Xem thành viên | ✅ **bản ẩn liên hệ** (BR-30: không SĐT/email trong payload) | ✅ đầy đủ | ✅ đầy đủ | ❌ | ✅ |
| Xem đã-đọc ANNOUNCEMENT | ❌ | ✅ | ✅ | ❌ | ✅ |
| Thu hồi tin mình ≤15' | ✅ | ✅ | ✅ | — | ✅ |
| Gỡ tin người khác | ❌ | ✅ nhóm mình + lý do | ❌ | ❌ | ✅ + lý do |

### 1-1 giáo viên ↔ phụ huynh (DM_TEACHER_PARENT)

| Operation | PH | GV | QLCS | Sale | Admin |
|---|---|---|---|---|---|
| Tạo/mở | ⚠️ chỉ với GV đang dạy con mình (quan hệ hiệu lực) | ⚠️ chỉ với PH của học viên lớp mình | ❌ | ❌ | ❌ |
| Đọc | ✅ của mình | ✅ của mình | ❌ | ❌ | ⚠️ F-AUDIT bắt buộc lý do + audit |
| Gửi | ✅ khi ACTIVE | ✅ khi ACTIVE | ❌ | ❌ | ❌ |
| Thu hồi tin mình ≤15' | ✅ | ✅ | ❌ | ❌ | ✅ |
| Gỡ tin người khác | ❌ | ❌ | ❌ | ❌ | ✅ + lý do |
| Xem liên hệ (SĐT/email) của người kia | ❌ | ❌ | — | — | — |

### 1-1 tư vấn viên ↔ phụ huynh (DM_SALE_PARENT) — F5, mở lại 10/08/2026

Phạm vi GIAI ĐOẠN 1: chỉ phụ huynh **đã có tài khoản**. Lead đang học thử chưa có `User`
nào (học thử gắn `LeadChild`, không phải `Student`) — xem
[`f5-giai-doan-2-cap-tai-khoan-tu-trial.md`](./f5-giai-doan-2-cap-tai-khoan-tu-trial.md).

| Operation | PH | Sale được gán | Sale khác | GV | QLCS | Admin |
|---|---|---|---|---|---|---|
| Tạo/mở | ⚠️ chỉ với sale đang phụ trách con mình | ⚠️ chỉ với PH mình được gán | ❌ | ❌ | ❌ | ❌ |
| Đọc | ✅ của mình | ✅ của mình | ❌ | ❌ | ❌ | ⚠️ F-AUDIT bắt buộc lý do + audit |
| Gửi | ✅ khi ACTIVE | ✅ khi ACTIVE | ❌ | ❌ | ❌ | ❌ |
| Thu hồi tin mình ≤15' | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Gửi ANNOUNCEMENT | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Định nghĩa "sale được gán"** (`findSaleAssignedEnrollmentIds`, `lib/chat/dm.ts`): tồn tại
≥1 `Enrollment` với `saleId = sale`, `deletedAt IS NULL`, `status ∈
ENROLLMENT_ACTIVE_STATUSES`, và học viên của nó có `parentUserId = PH`.

**Ba điều dễ hiểu nhầm, ghi rõ để khỏi "sửa cho tiện":**

1. **Cố ý KHÔNG ràng `Class.status = 'ACTIVE'`** như kênh dạy học. Kênh tư vấn sống theo
   *phân công chăm sóc*, không theo việc lớp đã khai giảng chưa — ghi danh `PENDING`/
   `CONFIRMED` chính là lúc phụ huynh cần hỏi sale nhất.
2. **"Tệp của sale" = CHỈ phụ huynh mình được gán** (chốt của chủ dự án 10/08). KHÔNG mở
   sang lead dùng chung của cơ sở (`Lead.isSharedWithTeam`): lead dùng chung thì trao đổi
   trong nhóm lớp, không đẻ thêm kênh riêng. Nới ra là nhiều sale cùng nhắn riêng một PH.
3. **Sale giữ `chat:read`/`chat:send` scope `OWN`, TUYỆT ĐỐI không phải `CENTER`.**
   `scopeMatches` nhánh CENTER chỉ đòi `target.centerId` khớp, mà nhóm lớp LUÔN có
   `centerId` ⇒ cấp CENTER là mở toang cửa nhóm lớp cho Sale. Pin ở
   `lib/auth/chat-permissions.test.ts` ("[F5] Sale KHÔNG lọt vào nhóm lớp").

**`dmKey` mang tiền tố loại** (`TP:` / `SP:`) từ F5: một nhân sự kiêm `TEACHER` +
`SALES_CSM` có thể có ĐỒNG THỜI hai quan hệ với cùng một phụ huynh. Không có tiền tố thì
hai kênh dùng chung một `Conversation`, và job đối soát archive nó khi *hết quan hệ dạy
học* — cắt luôn kênh tư vấn còn hiệu lực, im lặng.

**Ghi chú hiện thực 1-1 (09/08/2026) — `lib/chat/dm.ts`:**

- Ô "Gửi ✅ khi ACTIVE" của GV **dựa vào `dmWitnessClassId`**: 1-1 có `subjectType = NONE`
  nên không có `subjectId` làm `target.classId`, mà TEACHER/ASSISTANT_TEACHER chỉ giữ
  `chat:send` scope **ASSIGNED**. Target của mọi thao tác trong 1-1 (gửi + thu hồi) phải
  lấy **một lớp ACTIVE mà chính người thao tác đang dạy con của người kia**. Bỏ nó đi là
  quay lại bug "hộp câm một chiều" (PH gửi được, GV `PERMISSION_DENIED`) — pin ở
  `tests/chat/dm-us13.spec.ts`, nhóm "mở xong là nhắn được".
- Hệ quả **có chủ đích**: quan hệ dạy học hết ⇒ GV mất luôn quyền gửi kể cả khi hội thoại
  chưa kịp chuyển ARCHIVED (fail-closed, khớp AC3).
- Ô "Gỡ tin người khác = ❌" cho GV trong 1-1 là **cố ý giữ nguyên**: `moderateTargetOf`
  KHÔNG dùng lớp làm chứng. Muốn mở thì sửa bảng này TRƯỚC.
- Ô "Xem liên hệ = ❌": màn thành viên của 1-1 chỉ có hai người, không ai cần tra SĐT ở
  đó ⇒ `getConversationMembers` không trả khoá `contact` cho hội thoại KHÁC nhóm lớp
  (`hidesContactOf`, lib/chat/queries.ts).
- `openDm` có **trần 20 lượt/phút/người**, chặn TRƯỚC khi đọc DB (`OPEN_DM_RATE_MAX`).
- Đóng 1-1 vì hết quan hệ — dù đi lối tức thời (bấm "Nhắn riêng") hay job đêm — đều qua
  MỘT hàm: ARCHIVED + tin SYSTEM báo lý do + **1 dòng AuditLog**.

### Quản trị

| Operation | QLCS | Admin |
|---|---|---|
| `/admin/hoi-thoai` | ❌ | ✅ |
| Khoá/mở hội thoại | ❌ | ✅ + lý do + audit |
| Xem AuditLog | ❌ | ✅ |

**Bổ sung khi hiện thực US-15 (09/08/2026) — `lib/chat/admin.ts`:**

- Cả 3 ô trên gác bằng **`chat:admin`**, quyền CHỈ `SUPER_ADMIN` giữ (`prisma/seed-roles.ts`; QLCS cố ý không có). Kiểm ở 3 tầng: gate trang · `can()` trong `listAdminConversations` · `can()` trong từng action.
- **Lý do bắt buộc kể cả khi Admin TÌNH CỜ là thành viên** hội thoại đó. AC nói "hội thoại mình không phải thành viên", nhưng tự thêm mình vào một nhóm là việc làm được — nới ở đây là mở sẵn đường vòng. Admin đọc nhóm mình thuộc về thì vào `/tin-nhan` như mọi người.
- **Mỗi lượt xem = 1 dòng AuditLog** (`action = "READ"`), kể cả lượt "xem thêm tin cũ hơn". `writeAudit` chạy TRƯỚC truy vấn nội dung; audit hỏng ⇒ trả `AUDIT_FAILED`, KHÔNG trả nội dung.
- Màn tra cứu **hiện nguyên văn body của tin đã gỡ** (kèm cờ + `deletedReason`) — đúng mục đích US-12 giữ `body` trong DB "để đối chất khi có khiếu nại". Đây là bề mặt DUY NHẤT làm việc đó.
- **LOCKED chỉ đi từ/về ACTIVE**: `Conversation.status` là một cột, khoá một hội thoại ARCHIVED sẽ đè mất trạng thái lưu trữ. Khoá hội thoại đã lưu trữ → `CONVERSATION_ARCHIVED` (nó vốn đã không gửi tin được).
- `orgUnitId` của dòng audit lấy theo hội thoại; DM có `orgUnitId = null` ⇒ chỉ người có scope `"ALL"` (SUPER_ADMIN) thấy lại trong `/admin/audit-log`. Có chủ đích.

## ĐIỂM CẦN CHỦ DỰ ÁN CHỐT (mở 09/08/2026 — chưa xử lý)

**GV có được thấy SĐT/email phụ huynh trong màn "Thành viên" của NHÓM LỚP không?**

Hai luật trong repo nói ngược nhau, và bản vá 09/08 **giữ nguyên luật của module chat**
(GV ✅ đầy đủ) chứ không tự quyết:

| Nói CÓ | Nói KHÔNG |
|---|---|
| Bảng "Nhóm lớp · Xem thành viên · GV ✅ đầy đủ" (file này) | `canViewParentContact` chặn `TEACHER` (`lib/auth/permissions.ts`, nhắc lại trong CLAUDE.md "Field-level visibility") |
| `lib/chat/queries.test.ts` — `shouldHideContacts({role:"TEACHER"})` = `false` | Quy ước "Câu 46" áp nhất quán khắp `app/(teacher)/**`: màn GV chỉ hiện TÊN học viên, không hiện liên hệ PH |
| `tests/chat/db-invariants.spec.ts` BT-5 "đối chứng dương: GV thấy ĐẦY ĐỦ liên hệ" | |

Từ 09/08 việc này **nhìn thấy được** trên site giáo viên: `/teacher/tin-nhan?c=<id>&tab=thanh-vien`
in ra `PH của Bảo · 0905xxxxxx · me@gmail.com`. Trước đó không bề mặt nhân viên nào render
`contact` nên xung khắc chưa lộ.

Nếu chốt là KHÔNG: sửa `hidesContactOf` (`lib/chat/queries.ts`) — thêm mệnh đề
"thành viên là `CLASS_STUDENT_PARENT` và người xem không qua `canViewParentContact`" —
rồi sửa **cả ba** artefact ở cột trái. Một dòng code, ba chỗ pin.

## Trạng thái đè lên tất cả

| Trạng thái | Hiệu lực |
|---|---|
| ARCHIVED | Đọc ✅ (PH hết hạn sau 90 ngày — GV/QLCS/Admin không hết hạn) · Gửi ❌ mọi vai |
| LOCKED | Đọc ✅ thành viên · Gửi ❌ mọi vai kể cả GV |
| Participant `leftAt` đã set | Đọc tin sau `leftAt` ❌ · trước `leftAt` ✅ trong hạn 90 ngày · Gửi ❌ |

## RLS vs code-enforced

| Bề mặt | Cơ chế |
|---|---|
| Subscribe channel (TB2) | **RLS** — policy SELECT duy nhất trên `realtime.messages`; KHÔNG có policy INSERT cho client |
| Toàn bộ còn lại (đọc lịch sử, gửi, file, admin) | **Code-enforced** trong Server Actions — client không query trực tiếp bảng chat |
| Bảng `Conversation/Participant/Message/...` | Không expose qua PostgREST/RLS ở P0 — nếu sau này bật, phải viết RLS tương đương ma trận này trước |
