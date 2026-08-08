# Test Scenarios — Module Chat Realtime SataRobo

> Ngày lập: 07/08/2026 · Input: `UserStories-chat-realtime-satarobo.md`
> Vai trò tài liệu: với đội 1 dev không có QA riêng, đây vừa là kịch bản test tay trên staging vừa là đặc tả cho bộ test tự động US-05. Kịch bản đánh dấu **[AUTO]** bắt buộc nằm trong CI; **[TAY]** chạy tay trước mỗi đợt phát hành.

---

## Seed chuẩn (dùng chung mọi kịch bản)

| Đối tượng | Dữ liệu |
|---|---|
| Cơ sở | CS1, CS2 |
| Lớp | `LopA` (CS1, ACTIVE) · `LopB` (CS2, ACTIVE) · `LopC` (CS1, đã kết thúc → ARCHIVED) |
| GV | `gv1` dạy LopA · `gv2` dạy LopB · `gv3` dạy cả LopA và LopB (dạy chéo cơ sở) |
| QLCS | `ql1` quản CS1 · `ql2` quản CS2 |
| PH | `ph1` có 2 con cùng LopA · `ph2` có con ở LopA và con ở LopB · `ph3` con ở LopB · `ph4` con đã rời LopA (leftAt đã set) |
| Sale | `sale1` (CS1) — ở P0 không có quyền chat nào |
| Admin | `admin1` (HO) |

---

## NHÓM 1 — Ma trận phân quyền [AUTO toàn bộ]

### TS-01 · Cách ly đọc theo lớp và cơ sở
**Mục tiêu:** không ai đọc được hội thoại ngoài phạm vi của mình (US-02, US-08).
**Bước & kỳ vọng:**
1. `ph1` gọi API danh sách hội thoại → chỉ thấy nhóm LopA. Không thấy LopB, LopC.
2. `ph1` gọi API đọc tin nhóm LopB trực tiếp bằng ID → 403.
3. `ph2` (con ở cả 2 lớp) → thấy đúng 2 nhóm LopA + LopB.
4. `ql1` → thấy nhóm LopA + LopC (cùng CS1), không thấy LopB. `ql1` đọc LopB bằng ID → 403.
5. `gv3` (dạy chéo) → thấy cả LopA + LopB dù 2 cơ sở khác nhau — membership theo phân công, không theo centerId của user.
6. `sale1` gọi mọi endpoint chat → 403 toàn bộ (F5 đã dời).
7. `ph4` (đã rời) đọc lịch sử LopA → 403 ngay lập tức, không có "grace period" ở API.

### TS-02 · Cách ly realtime channel
**Mục tiêu:** RLS trên `realtime.messages` chặn đúng người ở tầng subscribe (US-02).
**Bước & kỳ vọng:**
1. `ph1` subscribe `conv:{LopA}` private → `SUBSCRIBED`.
2. `ph3` subscribe `conv:{LopA}` → `CHANNEL_ERROR`, và trong suốt phiên không nhận được payload nào của LopA.
3. `ph4` (leftAt đã set) subscribe `conv:{LopA}` → `CHANNEL_ERROR`.
4. `ph1` gọi `channel.send()` trực tiếp lên topic → bị từ chối (không có policy INSERT).
5. Tắt cờ private (giả lập cấu hình sai) trong môi trường test → test PHẢI đỏ — đây là canary phát hiện "Allow public access" bị bật lại.

### TS-03 · Ma trận hành động ghi
**Mục tiêu:** đúng người làm đúng việc (US-06, US-10, US-12).
**Bước & kỳ vọng** (mỗi dòng một assertion):
1. `ph1` gửi CHAT vào LopA → 200. Gửi ANNOUNCEMENT → 403.
2. `gv1` gửi ANNOUNCEMENT vào LopA → 200. Vào LopB (không dạy) → 403.
3. `ql1` gửi CHAT + ANNOUNCEMENT vào LopA → 200 cả hai (chốt QLCS=MEMBER). Vào LopB → 403.
4. `admin1` gửi ANNOUNCEMENT vào LopA → 200; gửi CHAT vào hội thoại mình không phải thành viên → 403 (US-15 AC4).
5. `ph1` thu hồi tin mình gửi 10' trước → 200; tin gửi 20' trước → 403.
6. `ph1` gỡ tin của `ph2` → 403. `gv1` gỡ tin của `ph2` trong LopA không nhập lý do → 400; có lý do → 200. `ql1` gỡ tin người khác → 403.
7. Gửi vào LopC (ARCHIVED) với mọi actor → 403 kèm mã lỗi phân biệt với "không phải thành viên".

### TS-04 · Riêng tư 1-1 và tra cứu admin
**Mục tiêu:** 1-1 kín tuyệt đối trừ đường audit (US-13, US-15).
**Bước & kỳ vọng:**
1. Tạo 1-1 `gv1↔ph1`. `ql1`, `gv2`, `ph2`, `sale1` đọc bằng ID → 403 toàn bộ.
2. `admin1` mở hội thoại đó qua trang quản trị không nhập lý do → nội dung không trả về (403/400). Nhập lý do → 200 + một bản ghi AuditLog đúng (ai/khi nào/hội thoại/lý do).
3. Gọi thẳng API nội dung bằng token admin, bỏ qua UI, không kèm lý do → 403 — xác nhận modal không phải chốt chặn duy nhất.
4. `ph1` xem danh sách thành viên LopA → SĐT/email của PH khác không có trong payload (kiểm response JSON, không chỉ UI). `gv1` xem → có đầy đủ.

---

## NHÓM 2 — Vòng đời & đồng bộ thành viên

### TS-05 · Chuyển lớp giữa chừng [AUTO]
**Mục tiêu:** membership đổi ngay trong transaction nghiệp vụ (US-03).
**Điều kiện đầu:** con của `ph3` đang ở LopB.
**Bước & kỳ vọng:**
1. Thao tác chuyển con `ph3` từ LopB sang LopA → trong cùng transaction: participant LopB set `leftAt`, participant LopA tạo mới.
2. Tin SYSTEM xuất hiện ở cả hai nhóm.
3. `ph3` gọi danh sách hội thoại → LopB biến mất (hoặc chỉ còn đọc tới `leftAt` nếu trong hạn BR-04), LopA xuất hiện.
4. Rollback giả lập: transaction chuyển lớp fail ở bước sau cùng → không có thay đổi participant nào (không sync nửa vời).

### TS-06 · PH hai con, một con nghỉ [AUTO]
**Mục tiêu:** điều kiện rời nhóm tính theo tập học viên (US-03 AC3 — bẫy số 1 của BA).
**Bước & kỳ vọng:**
1. `ph1` có 2 con ở LopA. Cho con thứ nhất nghỉ → participant của `ph1` KHÔNG set `leftAt`.
2. Cho con thứ hai nghỉ → lúc này mới set `leftAt`.
3. Suốt quá trình chỉ tồn tại một bản ghi participant cho `ph1` tại LopA.

### TS-07 · Job đối soát tự thi hành [AUTO + TAY]
**Mục tiêu:** lệch REMOVE không sống qua đêm (US-04).
**Bước & kỳ vọng:**
1. Cố ý tạo drift: xoá tay quan hệ học của con `ph3` khỏi LopA bằng SQL (giả lập luồng quên gọi sync) — participant `ph3` vẫn ACTIVE.
2. Chạy job → `ph3.leftAt` được set tự động + log loại REMOVE ghi rõ lớp/user.
3. Tạo drift ngược (thêm học viên bằng SQL, không sync) → job CHỈ log loại ADD, không tự thêm participant.
4. Đêm không drift → log "0 drift". [TAY] kiểm log trên staging sau 3 đêm liên tiếp trước Đợt 2.

### TS-08 · Lớp kết thúc và hạn đọc 90 ngày [AUTO]
**Mục tiêu:** BR-03/BR-04 (US-09).
**Bước & kỳ vọng:**
1. Kết thúc LopA → status ARCHIVED, mọi client đang mở thấy ô nhập vô hiệu kèm "Lớp đã kết thúc".
2. `ph1` vẫn đọc được lịch sử. Tua thời gian +91 ngày (mock clock) → `ph1` đọc → 403; `gv1`, `ql1`, `admin1` vẫn đọc được.

---

## NHÓM 3 — Realtime & độ tin cậy

### TS-09 · Mất mạng không mất tin [TAY, kèm AUTO phần API]
**Mục tiêu:** reconcile là bắt buộc và chạy đúng (US-07 — NT1 của BA).
**Vai:** 2 thiết bị thật, `ph1` (điện thoại, mạng 4G bật/tắt được) + `gv1` (máy tính).
**Bước & kỳ vọng:**
1. Cả hai mở nhóm LopA. `gv1` gửi 1 tin → `ph1` thấy ≤2s.
2. `ph1` bật chế độ máy bay 30s. `gv1` gửi 5 tin liên tiếp.
3. `ph1` tắt máy bay → trong vòng vài giây channel resubscribe, đủ 5 tin hiện đúng thứ tự, không trùng tin nào với tin đã có.
4. [AUTO] gọi `fetchMessagesSince(id_cũ)` → trả đúng tập tin sau id đó, phân trang đúng nếu >30.
5. Lặp bước 2–3 nhưng tắt mạng 10 phút → vẫn đủ tin (reconcile không phụ thuộc buffer của channel).

### TS-10 · Khử trùng optimistic [AUTO]
**Mục tiêu:** không bao giờ hiện tin đôi (US-06 AC4).
**Bước & kỳ vọng:**
1. Client gửi tin với `clientMsgId=X`, render optimistic ngay.
2. Broadcast dội về payload chứa `clientMsgId=X` → client thay thế bản optimistic, tổng số tin +1 đúng một.
3. Giả lập broadcast về TRƯỚC khi response Server Action về (race) → vẫn chỉ một bản.
4. Gửi lại sau lỗi mạng với cùng `clientMsgId` → server idempotent, không tạo tin thứ hai.

### TS-11 · Kick giữa phiên đang mở [TAY]
**Mục tiêu:** cửa sổ rò rỉ do cache quyền được đóng chủ động (US-07 AC3 — pre-mortem đã chấp nhận rủi ro còn lại, kịch bản này xác nhận mitigation chạy).
**Bước & kỳ vọng:**
1. `ph3` đang mở nhóm LopB trên điện thoại. Admin/thao tác nghiệp vụ gỡ con `ph3` khỏi LopB.
2. Trong vài giây, app `ph3` nhận `participant.removed` → tự thoát về danh sách, nhóm LopB biến mất.
3. `ph3` bấm back/deeplink quay lại hội thoại → API lịch sử 403, màn hình lỗi thân thiện, không màn hình trắng.
4. Đo và ghi lại độ trễ từ lúc gỡ tới lúc client thoát — ghi vào tài liệu bảo mật như số liệu của mức rủi ro chấp nhận.

### TS-12 · Broadcast fail không phá gửi tin [AUTO]
**Mục tiêu:** NT1 — DB là nguồn sự thật (US-06 AC3).
**Bước & kỳ vọng:**
1. Mock lỗi ở bước broadcast (service role trả 500). `ph1` gửi tin → response 200, tin có trong DB.
2. Log warning ghi nhận; người gửi không thấy lỗi.
3. `gv1` không nhận realtime nhưng mở lại/reconcile → thấy tin.

---

## NHÓM 4 — Thông báo (ANNOUNCEMENT) & đính kèm

### TS-13 · Vòng đầy đủ của một thông báo lịch học [TAY — kịch bản pilot chính]
**Vai:** `gv1` + 2 PH thật trên điện thoại.
**Bước & kỳ vọng:**
1. `gv1` gửi ANNOUNCEMENT "Lớp nghỉ ngày X, học bù ngày Y" → ghim đầu luồng cả 2 máy PH, đẩy push tới PH đang offline (kể cả PH đã mute nhóm).
2. PH1 mở app, cuộn tới thông báo → sau khi thông báo vào viewport, phía `gv1` bộ đếm "Đã đọc 1/2" tăng, tên PH1 rời danh sách chưa đọc — không reload.
3. PH2 không mở → sau 48h vẫn nằm danh sách chưa đọc (số liệu này chính là nguồn của cổng pilot US-16 AC4).
4. `gv1` gửi thông báo thứ 11 trong ngày → chặn kèm gợi ý gộp.
5. Gửi tiếp 30 tin CHAT vào nhóm → thông báo vẫn ghim trên cùng.

### TS-14 · Đính kèm: quyền và vòng đời signed URL [AUTO + TAY]
**Bước & kỳ vọng:**
1. [AUTO] `ph1` xin signed upload URL cho file `virus.exe` đổi tên `.jpg` → server kiểm magic bytes → từ chối. File 12MB → từ chối. File heic → "Định dạng chưa hỗ trợ".
2. [AUTO] `ph3` (không phải thành viên LopA) xin signed URL đọc ảnh trong LopA → 403.
3. [TAY] `ph1` gửi 3 ảnh → thumbnail hiện, bấm mở lớn nét. Copy URL ảnh sang tab ẩn danh, đợi 6 phút, mở lại → 403; trong app ảnh vẫn hiện (tự xin URL mới).
4. [AUTO] Tin chứa ảnh bị gỡ → mọi yêu cầu signed URL cho ảnh đó sau thời điểm gỡ → 403.

### TS-15 · Push notification [TAY]
**Bước & kỳ vọng:**
1. `ph1` thoát app > 2'. `gv1` gửi CHAT → push đến, bấm mở đúng hội thoại.
2. `ph1` đang mở đúng hội thoại → gửi tiếp → KHÔNG push.
3. `ph1` mute nhóm LopA → CHAT không push; ANNOUNCEMENT vẫn push.
4. `ph1` đăng xuất → gửi tin → thiết bị đó không nhận push.

---

## NHÓM 5 — Quản trị & pilot

### TS-16 · Khoá hội thoại khẩn cấp [TAY]
**Bước & kỳ vọng:**
1. Trong nhóm LopA đang có 3 client mở, `admin1` bấm khoá kèm lý do → cả 3 client thấy ô nhập vô hiệu trong vài giây kèm "Hội thoại đang bị khoá", không cần reload.
2. `gv1` cố gửi qua API → 403. AuditLog có bản ghi khoá.
3. Mở khoá → gửi lại bình thường, audit ghi lần mở.

### TS-17 · Ngày đầu của PH pilot [TAY — chạy như diễn tập trước ngày mở]
**Vai:** một tài khoản PH tạo mới hoàn toàn theo đúng luồng cấp tài khoản thật (phụ thuộc E3 đã chốt).
**Bước & kỳ vọng:**
1. Kích hoạt tài khoản trên điện thoại thật, mạng 4G → đăng nhập lần đầu.
2. Màn chính sách sử dụng hiện, bấm đồng ý → vào thẳng tab Tin nhắn, nhóm lớp của con đã có sẵn với ANNOUNCEMENT chào mừng.
3. Tổng thời gian từ bấm link kích hoạt tới đọc được thông báo đầu: **≤ 3 phút, không cần trợ giúp**. Quá 3 phút hoặc kẹt bước nào → ghi lại, sửa trước khi mở lớp thật.
4. Dashboard pilot ghi nhận đúng: PH này lên số "đã kích hoạt" và "đã đọc trong 48h".

---

## Ma trận bao phủ (truy vết story ↔ scenario)

| Story | Scenario |
|---|---|
| US-01 | ngầm trong seed + TS-05/06 (ràng buộc unique kiểm trong US-01 AC bằng test migration riêng) |
| US-02 | TS-02 |
| US-03 | TS-05, TS-06 |
| US-04 | TS-07 |
| US-05 | TS-01→TS-04 chính là nội dung bộ test |
| US-06 | TS-03, TS-10, TS-12 |
| US-07 | TS-09, TS-11 |
| US-08 | TS-01 (danh sách), phần UI kiểm tay trong TS-13 |
| US-09 | TS-08, TS-13 (ghim) |
| US-10 | TS-13 |
| US-11 | TS-14 |
| US-12 | TS-03 (5–6), TS-14 (4) |
| US-13 | TS-04 |
| US-14 | TS-15 |
| US-15 | TS-04, TS-16 |
| US-16 | TS-17 |

**Định nghĩa "sẵn sàng Đợt 2":** toàn bộ [AUTO] xanh trong CI 3 lần chạy liên tiếp + toàn bộ [TAY] pass trên staging trong một buổi diễn tập có Dev chứng kiến + TS-17 đạt mốc ≤3 phút.
