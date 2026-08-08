# User Stories — Module Chat Realtime SataRobo

> Ngày lập: 07/08/2026 · Phạm vi: **P0 sau gói cắt pre-mortem** (bỏ F5, đính kèm chỉ jpg/png/webp, push không gộp)
> Input: `PRD-chat-realtime-satarobo.md` v1.0 · `PreMortem-...-2026-08-07.md`
> Người thực hiện: Kiệt (dev) + Dev (review phân quyền, vận hành pilot)
> Quy ước: mỗi story ≤ 1 sprint-người; AC là hợp đồng — test scenario dịch 1:1 từ AC
> Design: chưa có Figma — mô tả màn hình theo mục 7.1 PRD (M1–M4); Kiệt dựng bằng shadcn, Dev duyệt trên staging

---

## EPIC 0 — Nền tảng & phân quyền (Đợt 0)

### US-01 · Schema & migration chat
**Là** dev, **tôi muốn** có schema `Conversation / ConversationParticipant / Message / MessageAttachment / AnnouncementRead` trên DEV **để** mọi story sau có nền dữ liệu chung.

**AC:**
1. Migration chạy sạch trên DEV, `prisma migrate diff` không lệch với schema mục 4 BA.
2. Ràng buộc unique `(type, subjectType, subjectId)` từ chối tạo nhóm lớp thứ hai cho cùng một `Class`.
3. Ràng buộc unique `dmKey` từ chối tạo hội thoại 1-1 trùng cặp khi hai request chạy đồng thời (test bằng 2 insert song song trong transaction riêng).
4. Index `(conversationId, createdAt DESC)` và `(userId, leftAt)` tồn tại; EXPLAIN trên query "danh sách hội thoại của tôi" và "30 tin mới nhất" không seq-scan.
5. Cột `User.authId` (ánh xạ `auth.uid()`) tồn tại, unique, backfill xong cho toàn bộ user active — **story này chặn nếu spike G2 phát hiện chưa có cột**.

### US-02 · Private channel + policy RLS đọc broadcast
**Là** dev, **tôi muốn** client chỉ nhận được broadcast của hội thoại mình là thành viên **để** không tenant/lớp nào đọc chéo nhau.

**AC:**
1. "Allow public access" trên Realtime Settings đã tắt (DEV + staging); rà và ghi lại các chỗ đang dùng Realtime trước khi tắt (G4).
2. Policy SELECT trên `realtime.messages` đúng mẫu mục 7.2 BA; **không** có policy INSERT cho client.
3. User là participant còn hiệu lực subscribe topic `conv:{id}` → trạng thái `SUBSCRIBED`.
4. User không phải participant (hoặc `leftAt` đã set) subscribe → `CHANNEL_ERROR`, không nhận được tin nào.
5. Client gọi `channel.send()` trực tiếp → bị từ chối (không có quyền INSERT).
6. Test 3–5 tự động hoá trong bộ test ma trận quyền, chạy trong CI.

### US-03 · Service đồng bộ thành viên `syncConversationMembership`
**Là** hệ thống, **tôi muốn** thành viên nhóm lớp luôn dẫn xuất đúng từ dữ liệu lớp **để** không ai phải thêm tay và không ai bị bỏ sót/thừa.

**AC:**
1. `Class` chuyển sang hoạt động → tạo `Conversation(CLASS_GROUP)` + participant: GV được phân công = `MODERATOR/CLASS_TEACHER`, PH của học viên = `MEMBER/CLASS_STUDENT_PARENT`, QLCS = `MEMBER/CENTER_MANAGER` (chốt 07/08: QLCS là MEMBER).
2. Gỡ phân công GV → `leftAt` set trong **cùng transaction** với thao tác gỡ; tin SYSTEM ghi vào nhóm.
3. Học viên chuyển lớp → PH rời nhóm cũ, vào nhóm mới trong cùng transaction; PH có 2 con cùng lớp mà 1 con nghỉ → PH **vẫn ở lại** (điều kiện theo tập học viên).
4. Học viên có 2 PH → cả 2 là participant riêng biệt.
5. Mọi điểm gọi được liệt kê thành checklist trong PR (danh sách luồng: mở lớp, phân công/gỡ GV, thêm/chuyển/nghỉ học viên, đổi QLCS, kết thúc lớp) — PR không merge nếu checklist thiếu luồng.
6. Chạy lại service trên lớp đã sync (idempotent) → không tạo bản ghi trùng, không đổi `joinedAt` cũ.

### US-04 · Job đối soát đêm + tự thi hành lệch REMOVE
**Là** dev, **tôi muốn** phát hiện lệch giữa participant thực tế và tập dẫn xuất tính lại **để** rò rỉ quyền không sống qua đêm.

**AC:**
1. Vercel Cron chạy hằng đêm, tính lại tập dẫn xuất cho mọi lớp ACTIVE, so với participant DERIVED hiện có.
2. Lệch loại REMOVE (người lẽ ra phải rời mà chưa) → **tự set `leftAt` ngay** rồi log; lệch loại ADD → chỉ log, chờ người xử lý (theo pre-mortem T5).
3. Log lệch ghi rõ: lớp, user, loại lệch, luồng nghi vấn; có trang/route admin xem log.
4. Đêm không lệch → log một dòng "0 drift" (phân biệt "sạch" với "job không chạy").

### US-05 · Bộ test ma trận quyền (người review thứ hai)
**Là** Dev (product owner), **tôi muốn** ma trận quyền mục 6 BA chạy thành test tự động chặn merge **để** bù việc không còn peer review (pre-mortem T2).

**AC:**
1. Test sinh đủ tổ hợp: 5 actor (PH, GV, QLCS, Sale, Admin) × hành động (đọc nhóm, gửi CHAT, gửi ANNOUNCEMENT, xem thành viên, thu hồi, gỡ tin người khác, mở 1-1 GV↔PH, đọc 1-1 người khác) × trạng thái (ACTIVE/ARCHIVED/LOCKED, participant hiệu lực/đã rời).
2. Cập nhật theo chốt 07/08: QLCS gửi được CHAT + ANNOUNCEMENT trong lớp thuộc cơ sở mình; Sale ở P0 **không có** hành động nào (F5 đã dời) — mọi endpoint chat với actor Sale trả 403.
3. Từng ô của ma trận có ≥1 assertion; ô ❌ assert đúng mã lỗi, không chỉ "không 200".
4. CI đỏ khi bất kỳ assertion sai → chặn merge (branch protection).
5. Chạy được trên DEV DB bằng seed cố định (2 cơ sở, 2 lớp, GV dạy chéo, PH 2 con).

---

## EPIC 1 — Gửi/nhận tin & nhóm lớp (Đợt 1)

### US-06 · Gửi tin CHAT qua Server Action
**Là** PH/GV/QLCS trong nhóm, **tôi muốn** gửi tin nhắn và thấy nó hiện ngay **để** trao đổi tự nhiên như app chat quen dùng.

**AC:**
1. Server Action kiểm: participant hiệu lực + hội thoại ACTIVE + rate limit (20 tin/phút/user) — vi phạm trả lỗi có thông điệp tiếng Việt rõ ràng, client hiển thị nguyên văn.
2. Transaction ghi: message + `lastMessageAt` + tăng `unreadCount` mọi participant trừ người gửi.
3. Broadcast sau commit, bằng service role, ngoài transaction; broadcast lỗi → tin vẫn tồn tại, log warning, **không** báo lỗi cho người gửi.
4. Client gửi kèm `clientMsgId`; optimistic render ngay; broadcast dội về được khử trùng theo `clientMsgId` — không bao giờ hiện 2 bản.
5. Nội dung > 4000 ký tự bị chặn từ client và cả server.
6. Mất mạng lúc gửi → tin ở trạng thái "đang gửi", tự thử lại 3 lần, sau đó có nút gửi lại; không mất nội dung đã gõ.

### US-07 · Nhận tin realtime + reconcile
**Là** thành viên đang mở hội thoại, **tôi muốn** thấy tin mới trong ≤2 giây và không bao giờ mất tin khi chập mạng **để** tin tưởng được kênh này.

**AC:**
1. Hai máy cùng mở hội thoại: máy A gửi, máy B thấy ≤ 2s (P95 đo trên staging).
2. Máy B tắt mạng 30s, máy A gửi 5 tin, máy B bật mạng → channel về `SUBSCRIBED` → client gọi `fetchMessagesSince(lastSeenMessageId)` → đủ 5 tin, đúng thứ tự, không trùng.
3. Nhận event `participant.removed` cho chính mình → unsubscribe, điều hướng ra danh sách, hội thoại biến mất.
4. Nhận event `message.deleted` → tin đổi thành "Tin nhắn đã được gỡ" tại chỗ, không reload.
5. `unreadCount` reset và `lastReadMessageId` cập nhật khi hội thoại đang mở ở foreground.

### US-08 · Danh sách hội thoại (M1)
**Là** người dùng, **tôi muốn** thấy mọi hội thoại của mình sắp theo tin mới nhất kèm số chưa đọc **để** biết ngay chỗ nào cần vào.

**AC:**
1. PH thấy: nhóm lớp các con + 1-1 của mình; GV: nhóm lớp mình dạy + 1-1; QLCS: nhóm lớp cơ sở mình + 1-1. Không ai thấy thừa (assert bằng seed US-05).
2. Sắp theo `lastMessageAt` giảm dần; badge `unreadCount`; dòng preview tin cuối (tin đã gỡ hiện "Tin nhắn đã được gỡ").
3. Tin mới đến khi đang mở danh sách → dòng đó nhảy lên đầu + badge tăng, không reload trang.
4. Hội thoại ARCHIVED xếp dưới nhóm ACTIVE, có nhãn "Đã lưu trữ".
5. Mobile 360px: mỗi dòng chạm được ≥44px, không vỡ layout tên lớp dài.

### US-09 · Luồng nhóm lớp + phân trang (M2)
**Là** thành viên nhóm lớp, **tôi muốn** đọc lịch sử cuộn mượt và thấy thông báo ghim trên cùng **để** không sót thông tin quan trọng.

**AC:**
1. Mở hội thoại tải 30 tin mới nhất; cuộn lên tải tiếp cursor-based theo `(createdAt, id)` — không OFFSET, không trùng/sót tin ở ranh giới trang.
2. ANNOUNCEMENT mới nhất ghim trên cùng; nút "Xem tất cả thông báo" mở danh sách lọc `kind=ANNOUNCEMENT`.
3. Hội thoại ARCHIVED/LOCKED: ô nhập vô hiệu, hiện đúng lý do ("Lớp đã kết thúc" / "Hội thoại đang bị khoá").
4. Tin SYSTEM hiển thị kiểu riêng (giữa luồng, không avatar), không đếm vào unread.
5. Reply 1 cấp: bấm trả lời một tin → tin mới hiện trích dẫn tin gốc; bấm trích dẫn cuộn tới tin gốc.

### US-10 · Gửi & theo dõi ANNOUNCEMENT (M2 + M4)
**Là** GV/QLCS, **tôi muốn** gửi thông báo ghim và biết chính xác PH nào đã đọc **để** không phải nhắn Zalo xác nhận từng người.

**AC:**
1. Chỉ GV (MODERATOR), QLCS (MEMBER/CENTER_MANAGER) và Admin thấy nút "Gửi thông báo"; PH không thấy (assert cả UI lẫn server).
2. Giới hạn 10 ANNOUNCEMENT/ngày/lớp — vượt bị chặn kèm gợi ý gộp nội dung.
3. PH mở hội thoại có ANNOUNCEMENT chưa đọc → ghi `AnnouncementRead` khi thông báo vào viewport (không phải khi mở app).
4. GV/QLCS xem "Đã đọc 12/30" + danh sách tên ai chưa đọc, cập nhật không cần reload.
5. ANNOUNCEMENT đẩy push tới mọi PH **kể cả đã mute** (mute chỉ áp cho CHAT).

### US-11 · Đính kèm ảnh (gói cắt: jpg/png/webp)
**Là** thành viên, **tôi muốn** gửi ảnh trong hội thoại **để** chia sẻ hình ảnh buổi học/bài làm.

**AC:**
1. Server Action cấp signed upload URL sau khi kiểm quyền + mime (`jpg png webp`) + size ≤10MB + ≤5 ảnh/tin; sai loại/quá cỡ chặn từ client và cả server (đổi đuôi file không lách được — kiểm magic bytes).
2. Bucket private; ảnh render bằng signed URL hạn 5 phút, cấp lại khi hết hạn; URL dán sang trình duyệt ẩn danh sau 5 phút → 403.
3. Người không phải participant gọi API xin signed URL của ảnh trong hội thoại đó → 403 (vào bộ test US-05).
4. Ảnh hiện thumbnail trong luồng, bấm mở lớn; upload có tiến trình và huỷ được.
5. `heic/pdf` bị từ chối với thông điệp "Định dạng chưa hỗ trợ" (ghi nhận fast-follow).

### US-12 · Thu hồi & gỡ tin
**Là** người gửi, **tôi muốn** thu hồi tin trong 15 phút; **là** GV/Admin, **tôi muốn** gỡ tin vi phạm có lý do **để** nhóm lớp sạch mà vẫn giữ bằng chứng.

**AC:**
1. Người gửi thu hồi được tin của mình khi `now - createdAt ≤ 15'` — quá 15' nút biến mất và server cũng từ chối.
2. GV gỡ được tin người khác trong nhóm mình; Admin gỡ mọi nơi; cả hai bắt buộc nhập lý do; QLCS/PH không gỡ được tin người khác.
3. Luôn soft delete: `deletedAt/deletedBy/deletedReason` set; API đọc không bao giờ trả `body` tin đã xoá cho user thường; DB vẫn giữ nguyên nội dung.
4. Người gỡ ≠ tác giả → tin SYSTEM "Một tin nhắn đã được quản trị viên gỡ" ghi vào nhóm.
5. Ảnh của tin bị gỡ: mọi signed URL cấp sau đó bị từ chối.

---

## EPIC 2 — Pilot phụ huynh (Đợt 2)

### US-13 · 1-1 GV↔PH
**Là** PH, **tôi muốn** nhắn riêng đúng GV đang dạy con mình **để** hỏi việc riêng của con không đưa lên nhóm.

**AC:**
1. Nút "Nhắn riêng" hiện cạnh tên GV trong danh sách thành viên nhóm lớp (và chiều ngược lại phía GV).
2. Server tính `dmKey`, `findOrCreate` — cặp GV–PH từng có hội thoại archive (lớp trước) → mở lại đúng hội thoại đó, `status=ACTIVE`, lịch sử cũ còn nguyên.
3. Quan hệ dạy học không còn hiệu lực → không tạo mới được; hội thoại hiện có chuyển ARCHIVED (đọc được, không gửi được).
4. QLCS/Sale/PH khác không đọc được nội dung 1-1 (assert trong bộ test US-05); Admin đọc phải qua US-15.
5. Hai người bấm "Nhắn riêng" đồng thời → vẫn chỉ một hội thoại (unique `dmKey`).

### US-14 · Push notification (gói cắt: không gộp)
**Là** người dùng offline, **tôi muốn** nhận push khi có tin mới **để** không phải mở app canh.

**AC:**
1. User offline/app nền > 2 phút khi tin đến → nhận push tiêu đề tên hội thoại + preview ngắn; bấm push mở đúng hội thoại (deeplink).
2. ANNOUNCEMENT luôn push bất kể mute; CHAT không push nếu hội thoại đã mute.
3. User đang mở đúng hội thoại đó ở foreground → không push.
4. Thiết bị đăng ký/huỷ token khi đăng nhập/đăng xuất; token chết được dọn.
5. Không có logic gộp ở P0 — mỗi tin một push (chấp nhận theo gói cắt; theo dõi phàn nàn để kích hoạt fast-follow).

### US-15 · Trang quản trị: tra cứu có lý do + khoá hội thoại + audit
**Là** Admin HO, **tôi muốn** tra cứu hội thoại khi xử lý khiếu nại và khoá nhóm vi phạm, mọi bước có vết **để** quyền admin không thành cửa hậu.

**AC:**
1. `/admin/hoi-thoai` tìm theo lớp/cơ sở/người; bấm xem hội thoại mình không phải thành viên → modal **bắt buộc** nhập lý do trước khi nội dung hiện; không có route/API nào vòng qua modal (assert server-side: thiếu lý do → 403).
2. Mỗi lần xem ghi AuditLog: ai, khi nào, hội thoại nào, lý do; trang audit liệt kê + lọc được.
3. Khoá hội thoại → status LOCKED, mọi client đang mở thấy ô nhập vô hiệu ngay (broadcast event); mở khoá tương tự; cả hai ghi audit.
4. Chế độ xem của Admin là chỉ đọc — không gửi được tin vào hội thoại mình không phải thành viên.
5. QLCS **không** truy cập được trang này (phân quyền route).

### US-16 · Onboarding PH vào chat (pilot)
**Là** PH lớp pilot, **tôi muốn** vào được nhóm lớp ngay trong lần đăng nhập đầu **để** thấy giá trị trước khi kịp bỏ cuộc.

**AC:**
1. PH kích hoạt tài khoản (theo luồng cấp tài khoản — phụ thuộc E3, story này **chặn** nếu E3 chưa chốt) → đăng nhập lần đầu thấy ngay tab Tin nhắn với nhóm lớp của con, không cần thao tác join.
2. Lần đầu vào chat hiện trang chính sách sử dụng ngắn (1 màn hình, tiếng Việt) — bấm đồng ý mới vào; lưu mốc đồng ý.
3. Nhóm lớp pilot đã có sẵn ≥1 ANNOUNCEMENT chào mừng của GV trước ngày mở PH (checklist vận hành, không phải code).
4. Dashboard đo pilot: % kích hoạt và % đọc thông báo đầu trong 48h theo từng lớp — nguồn số cho cổng Đợt 2 (KR2, pre-mortem T1). Dạng đơn giản nhất chấp nhận được: một trang admin đọc từ `AnnouncementRead` + bảng user.

---

## Thứ tự thực hiện đề xuất cho Kiệt

```
Đợt 0: US-01 → US-02 → US-05 (khung test trước) → US-03 → US-04
Đợt 1: US-06 → US-07 → US-08 → US-09 → US-10 → US-12 → US-11
Đợt 2: US-13 → US-14 → US-15 → US-16
```

Lý do US-05 lên sớm: viết khung test ma trận **trước** khi viết Server Action đầu tiên — mỗi story sau chỉ thêm assertion vào khung có sẵn, và không tồn tại giai đoạn "code xong rồi mới viết test" vốn là chỗ dễ bỏ nhất khi chỉ còn một dev.

Dời khỏi backlog này (đã chốt theo gói cắt): F5 Sale↔PH (Đợt 3) · heic/pdf · push gộp · F10 report · F11 mute UI đầy đủ (US-14 chỉ cần cờ mute tối thiểu) · ZNS.
