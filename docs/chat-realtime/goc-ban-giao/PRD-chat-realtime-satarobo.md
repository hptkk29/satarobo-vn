# PRD — Module Chat Realtime, hệ thống SataRobo

> Ngày lập: 07/08/2026 · Phiên bản: v1.0 DRAFT · Trạng thái: chờ duyệt
> Tài liệu nguồn: `OST-chat-realtime-satarobo.md` (05/08) · `BA-chat-realtime-satarobo.md` (07/08)
> Khuôn mẫu: pm-execution:create-prd (8 phần)

---

## 1. Tóm tắt

Xây module chat realtime bên trong hệ thống satarobo.vn để phụ huynh, giáo viên, quản lý cơ sở và sale trao đổi trực tiếp trên nền tảng của công ty thay vì phân tán qua Zalo cá nhân. Phiên bản đầu gồm nhóm lớp (thông báo + trò chuyện) và nhắn tin 1-1 có kiểm soát quan hệ. Module này đồng thời là viên gạch đầu tiên của kế hoạch thay thế dần Văn phòng số MISA.

---

## 2. Đầu mối

| Tên | Vai trò | Ghi chú |
|---|---|---|
| Dev | Product owner + Lead developer | Quyết định cuối về phạm vi và kiến trúc |
| Kiệt | IAM / RolePermission | Duyệt phần ma trận quyền và policy RLS |
| Luân | Senior engineer | Review kiến trúc realtime + schema |
| Vy | Frontend | UI chat trên site PH/GV (mobile-first) |
| Đại diện QLCS | Nghiệp vụ cơ sở | Xác nhận luồng vận hành nhóm lớp |

---

## 3. Bối cảnh

**Hiện trạng.** Liên lạc giữa cơ sở và phụ huynh đang đi qua Zalo cá nhân của giáo viên và sale. Hệ quả: công ty không có lịch sử trao đổi, nhân viên nghỉ việc là mất kênh, thông báo lịch học trôi lẫn trong tin nhắn đời thường, và không có cách nào kiểm soát chất lượng giao tiếp với khách hàng.

**Vì sao là bây giờ.** Ba thứ vừa hội đủ:

1. Nền tảng satarobo.vn đã go-live (26/07) với dữ liệu lớp học, phân công giáo viên, học viên — nguồn dẫn xuất thành viên nhóm chat đã có sẵn trong DB.
2. Công ty đã chốt định hướng bỏ MISA (giữ lại Kế toán), xây lại Văn phòng số bên trong satarobo. Chat là module đầu tiên cắm vào nền đó.
3. Tài khoản phụ huynh sắp được triển khai đại trà. Chat là lý do mạnh nhất để PH đăng nhập thường xuyên — hai việc này kéo nhau.

**Điều kiện tiên quyết (từ BA, giả định A2 đã có câu trả lời).** Phụ huynh **hiện chưa có tài khoản**; kế hoạch là vận hành và đưa cho PH dùng trong thời gian gần nhất. Vì vậy PRD này ràng buộc: **release chat cho PH đi cùng đợt kích hoạt tài khoản PH, theo từng lớp**, không phát hành đại trà khi tỉ lệ PH kích hoạt của lớp đó dưới ngưỡng (xem mục 8).

---

## 4. Mục tiêu

**Mục tiêu.** Đưa toàn bộ trao đổi giữa nhà trường và phụ huynh về một kênh chính thức thuộc sở hữu công ty, gắn trực tiếp vào dữ liệu lớp học.

**Lợi ích.**

- *Cho công ty:* giữ được lịch sử giao tiếp với khách hàng như một tài sản; giảm phụ thuộc vào Zalo cá nhân của nhân viên; tạo lý do đăng nhập hằng ngày cho PH — nền cho các module sau (học phí, tiến độ học tập).
- *Cho phụ huynh:* một nơi duy nhất để nhận lịch học, hỏi giáo viên, không bị trôi tin.
- *Cho chiến lược:* chứng minh mô hình "copy cách thiết lập của MISA, xây trong satarobo" chạy được trên một module thật trước khi nhân rộng.

**Key Results (đo sau 3 tháng kể từ khi lớp đầu tiên bật chat):**

| KR | Chỉ tiêu | Cách đo |
|---|---|---|
| KR1 | ≥ 60% lớp đang hoạt động có tương tác PH↔GV phát sinh mỗi tuần | Query `Message` theo lớp/tuần |
| KR2 | ≥ 70% PH của các lớp đã bật chat kích hoạt tài khoản và đọc ≥ 1 thông báo | `AnnouncementRead` / tổng PH |
| KR3 | 100% thông báo lịch học của lớp đã bật chat đi qua kênh ANNOUNCEMENT (không còn qua Zalo cá nhân) | Đối chiếu với QLCS |
| KR4 | 0 sự cố lộ dữ liệu chéo tenant/lớp | Audit + pentest |

---

## 5. Phân khúc người dùng

Phân khúc theo **việc cần làm**, không theo nhân khẩu:

| Phân khúc | Việc họ cần làm | Ràng buộc |
|---|---|---|
| **PH có con đang học** | Nắm lịch học/lịch bù không sót; hỏi nhanh GV về con mình; liên hệ sale phụ trách khi cần việc học phí/ghi danh | Dùng điện thoại là chính; chưa quen đăng nhập hệ thống; độ kiên nhẫn thấp với app lỗi |
| **Giáo viên** | Gửi thông báo tới cả lớp một lần, biết ai đã đọc; trả lời PH mà không lộ Zalo cá nhân | Dạy nhiều lớp ở nhiều cơ sở; thời gian trả lời rải rác trong ngày |
| **Quản lý cơ sở** | Theo dõi và **trực tiếp tham gia** trao đổi với PH trong các lớp thuộc cơ sở mình; đỡ lời khi GV bận | Là MEMBER đầy đủ trong nhóm lớp (chốt 07/08), không phải quan sát viên |
| **Sale** | Chăm sóc PH thuộc tệp mình phụ trách sau ghi danh; nhận câu hỏi từ PH của lead/học viên được gán cho mình | Chỉ tiếp cận được PH thuộc tệp mình — không thấy tệp của sale khác |
| **Admin HO** | Xử lý khiếu nại, gỡ nội dung vi phạm, tra cứu có kiểm soát | Mọi lần đọc hội thoại không phải của mình đều phải ghi vết |

**Ngoài phân khúc:** lead chưa có tài khoản (đi kênh Zalo OA), PH↔PH (hoãn, lý do kiểm duyệt), nhân viên↔nhân viên (Cây B, đang có Discord).

---

## 6. Tuyên bố giá trị

| Việc của khách | Cái họ được | Nỗi đau tránh được | Hơn giải pháp hiện tại (Zalo cá nhân) ở chỗ |
|---|---|---|---|
| Nhận lịch học | Thông báo ghim đầu luồng, đẩy push/ZNS, GV thấy ai đã đọc | Trôi tin, mở nhóm 200 tin không biết cái nào là lịch | Zalo không tách được "thông báo" khỏi "tán gẫu"; không có đã-đọc theo từng PH |
| Hỏi GV về con | 1-1 gắn đúng GV đang dạy con mình, lịch sử liên tục qua các lớp | Xin số Zalo, nhắn nhầm người, GV nghỉ là mất lịch sử | Quan hệ dạy-học được hệ thống xác thực; đổi GV thì hệ thống tự nối đúng người |
| Việc học phí/ghi danh | 1-1 với đúng sale phụ trách | Bị nhiều sale cùng chăm, thông tin lệch nhau | Hệ thống gán đúng chủ tệp, sale khác không thấy |
| (Công ty) kiểm soát chất lượng giao tiếp | Lịch sử thuộc công ty, audit được, gỡ được nội dung vi phạm | Nhân viên nghỉ mang theo toàn bộ quan hệ khách hàng | Zalo cá nhân là tài sản của cá nhân, không phải của công ty |

Điểm khác biệt cốt lõi so với mọi app chat ngoài: **thành viên nhóm sinh ra từ dữ liệu nghiệp vụ** (phân công dạy, danh sách lớp) chứ không phải từ thao tác thêm tay — đổi phân công là nhóm tự đổi theo.

---

## 7. Giải pháp

### 7.1 UX / Luồng màn hình

Thiết kế **mobile-first** (PH dùng điện thoại là chính). Bốn màn hình chính:

**M1 — Danh sách hội thoại** (tab "Tin nhắn" trên ParentDashboard / site GV)
- Sắp theo `lastMessageAt`, badge số chưa đọc, phân biệt icon nhóm lớp / 1-1
- PH thấy: nhóm lớp của các con + các 1-1 của mình. GV thấy: nhóm các lớp mình dạy + 1-1. QLCS thấy: nhóm các lớp thuộc cơ sở + 1-1 của mình.

**M2 — Luồng nhóm lớp**
- ANNOUNCEMENT mới nhất ghim trên cùng, có nút "Xem tất cả thông báo" (lọc `kind=ANNOUNCEMENT`)
- Tin CHAT cuộn vô hạn, phân trang cursor 30 tin
- Ô nhập: PH/GV/QLCS gõ CHAT; GV/QLCS có thêm nút "Gửi thông báo" mở form riêng
- Hội thoại ARCHIVED/LOCKED: ô nhập vô hiệu kèm dòng lý do

**M3 — Luồng 1-1**
- Mở từ: danh sách thành viên nhóm lớp (nút "Nhắn riêng" cạnh tên GV), trang thông tin học viên (nút liên hệ sale phụ trách), hoặc danh sách hội thoại
- Cùng khung tin nhắn với M2, không có ANNOUNCEMENT

**M4 — Thành viên & thông báo đã đọc**
- Danh sách thành viên: PH thấy bản ẩn liên hệ (BR-30); GV/QLCS thấy đầy đủ
- Với mỗi ANNOUNCEMENT: GV/QLCS xem "Đã đọc 12/30" + danh sách ai chưa đọc

Trang quản trị: `/admin/hoi-thoai` (tra cứu có lý do + audit), quản lý báo cáo vi phạm, khoá/mở hội thoại.

### 7.2 Tính năng chính

| # | Tính năng | Mô tả ngắn | Ưu tiên |
|---|---|---|---|
| F1 | Nhóm lớp tự động | Tạo khi lớp mở, thành viên dẫn xuất (GV=MODERATOR, PH=MEMBER, **QLCS=MEMBER**), tự đồng bộ khi đổi phân công/chuyển lớp trong cùng transaction | P0 |
| F2 | Thông báo (ANNOUNCEMENT) | GV/QLCS/Admin gửi; ghim; đẩy push/ZNS bỏ qua mute; đếm đã đọc từng PH | P0 |
| F3 | Chat nhóm | CHAT trong nhóm lớp, optimistic UI, khử trùng theo `clientMsgId`, reconcile khi reconnect | P0 |
| F4 | 1-1 GV↔PH | Chỉ khi có quan hệ dạy học hiệu lực; duy nhất theo cặp (`dmKey`); lịch sử liên tục qua các lớp | P0 |
| F5 | 1-1 Sale↔PH | **Hai chiều**: sale mở với PH thuộc tệp mình; PH mở với đúng sale được gán phụ trách lead/học viên của mình. PH không tự chọn sale khác | P0 |
| F6 | Đính kèm | ≤5 tệp/tin, ≤10MB/tệp, `jpg png webp heic pdf`; bucket private, signed URL 5 phút | P0 |
| F7 | Thu hồi & gỡ tin | Tự thu hồi <15'; GV gỡ trong nhóm mình; Admin gỡ mọi nơi có lý do; luôn soft delete | P0 |
| F8 | Quản trị & audit | Khoá hội thoại, tra cứu bắt buộc nhập lý do, trang audit | P0 |
| F9 | Thông báo ngoài app | Push khi offline >2', gộp theo hội thoại; ZNS chỉ cho ANNOUNCEMENT (mẫu đăng ký trước + deeplink) | P0 (push), P1 (ZNS) |
| F10 | Báo cáo vi phạm | PH bấm report tin nhắn → hàng đợi cho Admin | P1 |
| F11 | Mute theo hội thoại | Tắt push CHAT, ANNOUNCEMENT vẫn xuyên qua | P1 |
| F12 | Chat nội bộ nhân viên | Cây B — dùng lại toàn bộ hạ tầng, thêm `DM_STAFF`/nhóm phòng ban | P2 |

**Điều chỉnh so với BA (theo chốt 07/08):**

- **QLCS là MEMBER, không phải OBSERVER.** QLCS gửi được CHAT và cả ANNOUNCEMENT trong nhóm lớp thuộc cơ sở mình. Ma trận quyền của BA sửa 2 ô tương ứng. BR-34 sửa lại thành: sự hiện diện của QLCS hiển thị bình thường trong danh sách thành viên như một thành viên.
- **Lớp trial không có nhóm lớp.** Học thử 4 buổi đã bị cắt; trial hiện là 1-1 kéo dài 1–3 buổi tuỳ học viên. Kênh liên lạc giai đoạn trial là **F5 (1-1 Sale↔PH)** — không sinh `CLASS_GROUP` cho trial. Điều kiện tạo nhóm lớp trong F1 ghi rõ: chỉ `Class` chính khoá.
- **Không có SLA trực nhóm.** Vận hành theo nguyên tắc ai nhận tin thì trả lời; QLCS là MEMBER chính là lưới đỡ khi GV bận. Không xây tính năng phân ca/nhắc trực ở P0. *Rủi ro ghi nhận:* nếu sau launch xuất hiện khiếu nại "nhắn không ai trả lời", giải pháp P1 là chỉ báo "thời gian phản hồi trung bình" cho QLCS, không phải hệ thống trực ca.

### 7.3 Công nghệ

Tóm tắt từ BA (chi tiết ở tài liệu BA, mục 7):

- Supabase Realtime **Broadcast, private channel** — không dùng Postgres Changes, không phải hạ RBAC xuống RLS toàn hệ thống
- Client **chỉ đọc** realtime; gửi tin qua Server Action → DB → server broadcast bằng service role. Chỉ cần 1 policy SELECT trên `realtime.messages`
- Postgres là nguồn sự thật; client reconcile `fetchMessagesSince()` mỗi lần re-SUBSCRIBED
- Schema đa hình `Conversation`/`Participant`/`Message` (BA mục 4), reserve sẵn `DM_STAFF` cho Cây B
- Tắt "Allow public access" trong Realtime Settings — điều kiện để private channel có hiệu lực

### 7.4 Giả định (chưa chứng minh — phải xác minh)

| # | Giả định | Trạng thái | Kế hoạch xác minh |
|---|---|---|---|
| G1 | PH sẽ kích hoạt và dùng tài khoản khi được đưa (A2) | **Chưa chứng minh — rủi ro số 1** | Pilot 2–3 lớp: đo tỉ lệ kích hoạt sau khi GV hướng dẫn trực tiếp tại lớp. Ngưỡng đạt: ≥70%/lớp |
| G2 | `User` ánh xạ được sang `auth.uid()` (A1) | Chưa kiểm | Spike 0,5 ngày trên schema |
| G3 | Query dẫn xuất PH-theo-lớp chạy 1 query có index (A3) | Chưa kiểm | EXPLAIN trên DEV |
| G4 | Tắt "Allow public access" không hỏng tính năng đang chạy (A4) | Chưa kiểm | Rà các chỗ đang dùng Realtime trên PROD |
| G5 | GV chấp nhận trả lời PH trong hệ thống thay vì Zalo | Chưa chứng minh | Phỏng vấn 3–5 GV trước pilot; theo dõi tỉ lệ GV chủ động dùng trong pilot |
| G6 | Mẫu ZNS "có thông báo mới + deeplink" được Zalo duyệt | Chưa kiểm | Nộp mẫu sớm — thời gian duyệt ngoài tầm kiểm soát, vì vậy ZNS xếp P1 |

### 7.5 Ngoài phạm vi phiên bản này

PH↔PH · sale↔lead chưa có account (Zalo OA) · sửa tin nhắn · reactions/thread lồng nhau · gọi thoại/video · phân ca trực · chat nội bộ nhân viên (P2, dùng lại hạ tầng).

---

## 8. Kế hoạch phát hành

Không cam kết ngày tuyệt đối; tính bằng tuần tương đối, sau khi các spike G2–G4 xong.

### Đợt 0 — Spike & nền (≈ 1 tuần)
Xác minh G2/G3/G4 · schema + migration trên DEV · policy RLS + tắt public access · service `syncConversationMembership` + job đối soát đêm.
**Cổng ra:** demo được 2 user nhắn nhau qua private channel trên DEV, PH bị gỡ khỏi lớp không đọc được lịch sử.

### Đợt 1 — Nhóm lớp nội bộ trước (≈ 2 tuần)
F1 + F2 + F3 + F6 + F7, phát hành cho **GV và QLCS dùng trước, chưa mở PH**: GV các lớp thật bắt đầu đăng thông báo và làm quen. Chạy `pre-mortem` + `shipping-artifacts` (permission flow, trust boundary) trong đợt này.
**Cổng ra:** GV của các lớp pilot đăng thông báo đều trong 1 tuần; 0 lỗi phân quyền.

### Đợt 2 — Pilot phụ huynh (≈ 2 tuần, phụ thuộc lịch cấp tài khoản PH)
Chọn 2–3 lớp; GV hướng dẫn PH kích hoạt tài khoản tại lớp; bật F4 (1-1 GV↔PH) + F9 push.
**Cổng ra = kiểm chứng G1:** ≥70% PH của lớp pilot kích hoạt; ≥50% đọc thông báo đầu tiên trong 48h. **Không đạt thì dừng mở rộng** và quay lại bài toán onboarding tài khoản — không phải bài toán chat.

### Đợt 3 — Mở rộng + Sale (≈ 2 tuần)
Bật dần theo lớp khi lớp đạt ngưỡng kích hoạt · F5 (1-1 Sale↔PH hai chiều theo gán tệp) · F10, F11 · ZNS nếu mẫu đã được duyệt.

### Đợt 4 — Cây B (sau ổn định ≥ 1 tháng)
`DM_STAFF` + nhóm phòng ban trên cùng hạ tầng; khi đó mới bàn tắt Chat của Văn phòng số MISA.

**Tổng ước lượng Đợt 0→3: ~7 tuần lịch**, giả định tốc độ AI-assisted như các module trước và không phát sinh từ spike.

---

## Phụ lục — Thay đổi so với BA v0.1

| Mục BA | Trước | Sau (chốt 07/08) |
|---|---|---|
| Vai QLCS | OBSERVER (thấy, không nói) | **MEMBER** — gửi CHAT + ANNOUNCEMENT trong nhóm lớp cơ sở mình |
| BR-34 | Giám sát công khai của observer | QLCS hiện diện như thành viên bình thường |
| F5 chiều mở | Chỉ sale mở trước | **Hai chiều**, PH chỉ mở được với sale được gán |
| Nhóm lớp trial | Câu hỏi mở | **Không có** — trial là 1-1 (1–3 buổi), liên lạc qua F5 |
| SLA phản hồi | Câu hỏi mở, đề xuất SLA + auto-reply | **Không SLA** — ai nhận thì trả lời; QLCS-MEMBER là lưới đỡ |
| Điều kiện release | — | Bật theo lớp, gắn với tỉ lệ PH kích hoạt tài khoản ≥70% |
