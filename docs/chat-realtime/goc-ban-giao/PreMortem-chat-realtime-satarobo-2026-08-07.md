# Pre-Mortem — Module Chat Realtime SataRobo

> Ngày lập: 07/08/2026 · Kịch bản: giả định đã launch Đợt 2 (pilot PH) và **thất bại** — PH không dùng, hoặc có sự cố làm mất uy tín. Truy ngược nguyên nhân.
> Input: `PRD-chat-realtime-satarobo.md` v1.0 · Ràng buộc mới: **đội dev chỉ còn Kiệt** (Luân, Vy, Trí, Huy không còn tham gia)
> Phương pháp: Tigers / Paper Tigers / Elephants → phân loại Launch-Blocking / Fast-Follow / Track

---

## Bối cảnh nguồn lực — thay đổi so với lúc viết PRD

PRD ước lượng ~7 tuần dựa trên tốc độ của đội cũ. Hiện thực mới: **một dev (Kiệt) + Dev (product owner kiêm dev)**, trong khi Kiệt đã từng được xác định là nút thắt critical-path ngay từ đợt go-live RBAC, và Vy — người phụ trách frontend — không còn. Điều này không chỉ kéo dài timeline; nó **đổi thứ hạng rủi ro**: các rủi ro loại "làm ẩu vì thiếu người review" và "không ai vá kịp sau launch" leo từ Track lên Tiger.

---

## TIGERS — Rủi ro thật, phải hành động

### T1 · PH không kích hoạt tài khoản → chat là thị trấn ma
**Loại: LAUNCH-BLOCKING** (đã có cổng chặn trong PRD, giữ nguyên và siết thêm)

Chuỗi thất bại: cấp tài khoản qua ZNS/tin nhắn → PH không bấm → lớp pilot 30 PH chỉ 8 người vào → GV đăng thông báo nhưng vẫn phải nhắn Zalo cho 22 người còn lại → GV kết luận "phải làm hai lần việc" → GV bỏ, quay về Zalo → chat chết trong 3 tuần dù không có lỗi kỹ thuật nào.

Điểm dễ ảo tưởng nhất: **đo "kích hoạt" thay vì đo "dùng"**. PH được GV cầm tay bấm kích hoạt tại lớp vẫn có thể không bao giờ mở app lần hai. Cổng Đợt 2 phải đo cả hai: ≥70% kích hoạt **và** ≥50% đọc thông báo đầu trong 48h (đã có trong PRD — giữ như điều kiện cứng, không thương lượng).

### T2 · Một mình Kiệt gánh cả module chạm dữ liệu trẻ em, không ai review phân quyền
**Loại: LAUNCH-BLOCKING**

Đây là Tiger mới sinh ra từ thay đổi nhân sự. Ba mặt của nó:

1. **Không còn peer review.** Policy RLS, service `syncConversationMembership`, ma trận quyền — trước đây Luân review kiến trúc, giờ không ai. Một lỗi IDOR trong chat = PH lớp này đọc tin lớp khác, có ảnh trẻ em trong đó. Security review trước đây đã xếp IDOR/BOLA là ưu tiên số 1 của hệ thống.
2. **Bus factor = 1.** Kiệt ốm một tuần trong Đợt 2 là pilot đứng hình giữa lúc PH đang nhìn vào.
3. **Frontend mồ côi.** Vy đi, UI mobile-first cho PH — đối tượng khó tính nhất — không có người chuyên trách.

Mitigation không phải "tuyển người" (ngoài tầm PRD) mà là **đổi cách làm**:
- Toàn bộ code phân quyền (RLS policy + Server Action guard + sync service) phải có **test tự động như người review thứ hai**: bộ test ma trận quyền chạy đủ tổ hợp actor × hành động × trạng thái (mục 6 của BA dịch thẳng thành test case). Không merge khi ma trận chưa xanh.
- Dùng công cụ pentest AI (hướng strix đã tham khảo) chạy riêng vào các endpoint chat trước Đợt 2.
- Cắt phạm vi P0 thêm một nấc (xem T3) để khối lượng khớp với 1,5 người.

### T3 · Ước lượng 7 tuần vô hiệu — nguy cơ "làm cho xong" đúng phần nguy hiểm nhất
**Loại: LAUNCH-BLOCKING** (ở dạng quyết định phạm vi, phải chốt trước Đợt 0)

Với đội cũ, 7 tuần là chặt. Với 1,5 người, giữ nguyên phạm vi P0 đồng nghĩa hoặc trượt dài, hoặc — tệ hơn — cắt góc ở chỗ không được phép cắt (test phân quyền, reconcile, soft delete). Pre-mortem này đề xuất **cắt trước, chủ động, ở chỗ an toàn**:

| Cắt khỏi P0 | Lý do an toàn | Dời về |
|---|---|---|
| F5 (1-1 Sale↔PH) | Không chạm nhóm lớp; sale đang có kênh MISA/Zalo | Đợt 3 giữ nguyên |
| F6 thu hẹp: chỉ ảnh `jpg png webp`, bỏ `heic pdf` | heic cần transcode, pdf mở rộng bề mặt kiểm duyệt | Fast-follow |
| F9 push: chỉ khi app đóng, bỏ logic gộp thông minh | Logic gộp là chỗ ngốn thời gian tinh chỉnh | Fast-follow |
| Đợt 1 gộp vào Đợt 2 nếu tiến độ căng | Giữ nguyên tắc GV dùng trước PH 1 tuần, nhưng trong cùng đợt phát hành | — |

**Không được cắt trong mọi kịch bản:** test ma trận quyền, reconcile khi reconnect, soft delete + audit, ẩn liên hệ PH (BR-30), signed URL cho ảnh.

### T4 · "Không SLA, ai nhận thì rep" + kỳ vọng realtime của PH
**Loại: FAST-FOLLOW**

Chat realtime tự nó tạo kỳ vọng trả lời nhanh — khác với Zalo cá nhân, nơi PH biết mình đang nhắn cho một con người có đời sống. Kịch bản thất bại: PH nhắn 20:30 hỏi "mai con có học bù không", không ai trả lời tới trưa hôm sau, PH chụp màn hình đăng nhóm phụ huynh ngoài → thiệt hại uy tín lớn hơn khi chưa có chat.

QLCS-là-MEMBER là lưới đỡ đúng, nhưng lưới chỉ hoạt động nếu QLCS **biết có tin đang chờ**. Mitigation rẻ, làm trong 30 ngày sau launch: (a) digest cho QLCS — "cơ sở bạn có N tin chưa ai trả lời quá 12h"; (b) auto-reply ngoài 21h–8h: "Tin nhắn đã được ghi nhận, thầy cô sẽ trả lời trong giờ làm việc" — một dòng SYSTEM, không phải chatbot.

### T5 · Đồng bộ thành viên lệch thầm lặng
**Loại: FAST-FOLLOW**

`syncConversationMembership` phải được gọi từ mọi luồng đổi phân công/chuyển lớp — mà các luồng đó viết trước khi chat tồn tại, và giờ chỉ một người rà. Xác suất sót một điểm gọi là cao. Hậu quả chia hai cấp: sót ADD (PH mới vào lớp không thấy nhóm — khó chịu, không nguy hiểm) và sót REMOVE (PH đã rút khỏi lớp vẫn đọc được tin — rò rỉ). Job đối soát đêm trong BA là đúng; nâng cấp một nấc: **lệch loại REMOVE thì tự thi hành ngay (set leftAt) rồi mới log**, chỉ lệch loại ADD mới chờ người xử lý. Rò rỉ không được phép chờ sáng.

### T6 · Ảnh trẻ em trong hệ thống — trách nhiệm mới về chất
**Loại: TRACK, nhưng phải có quy trình từ ngày đầu**

Khi PH và GV gửi ảnh học viên vào nhóm, công ty trở thành bên lưu trữ hình ảnh trẻ em có định danh (gắn tên, lớp, cơ sở). Kỹ thuật đã chặn đúng (bucket private, signed URL 5'), nhưng thiếu quy trình con người: ai xử lý khi PH yêu cầu xoá ảnh con mình? Khi một PH lưu ảnh con người khác rồi dùng sai chỗ? Cần một trang chính sách sử dụng ngắn hiển thị lần đầu vào chat + nút report (F10 giữ ở P1 nhưng report ảnh nói riêng nên kéo lên fast-follow).

---

## PAPER TIGERS — Nghe đáng sợ nhưng không đáng đầu tư

| Lo ngại | Vì sao không đáng |
|---|---|
| "Supabase Realtime không chịu nổi tải" | 200 hội thoại × 30 người, đỉnh 3 tiếng/ngày — cỡ này bé hơn benchmark công khai của Supabase vài bậc. Kiến trúc đã đúng (Broadcast + reconcile). Đừng tốn ngày nào cho load test cầu kỳ ở P0. |
| "PH sẽ spam / cãi nhau loạn nhóm" | Nhóm có mặt GV + QLCS công khai — hiệu ứng lớp học kiềm hành vi. Rate limit + gỡ tin đã có. Vấn đề thật của nhóm lớp là **im lặng**, không phải ồn ào. |
| "Phải làm E2E encryption" | Sai bài toán: yêu cầu nghiệp vụ là công ty *phải* đọc được khi xử lý vi phạm (BR-32/33). Audit-when-read đúng hơn E2E ở ngữ cảnh trường học. |
| "Cache quyền theo connection là lỗ hổng lớn" | Cửa sổ rò rỉ chỉ là vài phút của một phiên đang mở, sau khi người đó *vừa mới* còn là thành viên hợp lệ; API lịch sử chặn ngay. Mitigation `participant.removed` đã đủ. Đừng xây cơ chế kick-connection phức tạp. |
| "Không có Vy thì UI sẽ xấu" | Xấu không giết pilot; **khó dùng** mới giết. Dùng shadcn + một luồng màn hình tối giản (M1–M4 của PRD) là đủ. Đầu tư vào tốc độ mở màn hình và độ tin cậy gửi tin, không phải polish. |

---

## ELEPHANTS — Chưa ai nói to, cần trả lời trước Đợt 2

### E1 · Ai thật sự là chủ vận hành module này?
Dev là product owner, Kiệt là dev — nhưng **vận hành hằng ngày** (duyệt report, xử lý khiếu nại, mở khoá hội thoại, trả lời "sao tôi không vào được nhóm") là việc của ai? Với module hướng khách hàng, câu này không có chủ là ticket sẽ dồn về chính Dev/Kiệt và ăn vào thời gian code. Đề xuất: giao QLCS làm mức 1 (việc trong cơ sở mình), Admin HO mức 2 — và ghi thành văn bản trước pilot.

### E2 · Zalo vẫn ở đó — có dám "đốt thuyền" không?
Nếu GV vừa nhắn nhóm Zalo vừa đăng hệ thống "cho chắc", PH không có lý do đổi thói quen và KR3 (100% thông báo qua ANNOUNCEMENT) thất bại âm thầm. Câu hỏi cần Dev quyết như một quyết định **quản trị, không phải kỹ thuật**: kể từ ngày lớp pilot bật chat, nhóm Zalo của lớp đó có bị đóng không? Pre-mortem này khuyến nghị: có, sau 2 tuần chạy song song có thông báo trước — kèm thông điệp rõ cho PH.

### E3 · Tài khoản PH được cấp bằng định danh gì?
"Sẽ triển khai trong thời gian gần nhất" đang che một câu hỏi kỹ thuật chưa chốt: PH đăng nhập bằng SĐT+OTP hay email+mật khẩu? SĐT của PH trong DB trùng nhau (một SĐT hai con), sai, đổi số — chất lượng dữ liệu này quyết định luôn G2 (ánh xạ `auth.uid()`). Nếu luồng cấp tài khoản chưa thiết kế xong thì **nó, chứ không phải chat, là critical path thật của Đợt 2** — và cần được ước lượng như một hạng mục riêng trong kế hoạch của Kiệt.

### E4 · Dev có thời gian làm product owner không?
Dev đang trải trên marketing, sales ops, nhập hàng, và giờ kiêm dev bù cho đội đã rút. Pilot Đợt 2 cần một người theo sát từng ngày: gọi GV, đo số kích hoạt, sửa nội dung hướng dẫn. Nếu tuần pilot rơi đúng đợt bận việc khác, pilot sẽ thất bại vì **không ai chăm**, và số liệu sai sẽ dẫn tới kết luận sai ("PH không cần chat"). Cân nhắc: chọn tuần pilot theo lịch của Dev, không theo lịch code xong.

---

## KẾ HOẠCH HÀNH ĐỘNG — cho các Tiger LAUNCH-BLOCKING

| Rủi ro | Hành động cụ thể | Chủ trì | Hạn quyết |
|---|---|---|---|
| **T1** PH không dùng | Giữ cổng kép (≥70% kích hoạt + ≥50% đọc trong 48h) làm điều kiện cứng mở rộng; kịch bản kích hoạt tại lớp do GV cầm tay; chọn 2–3 lớp pilot có GV nhiệt nhất, không chọn ngẫu nhiên | Dev | Trước ngày chốt danh sách lớp pilot |
| **T2** Không ai review phân quyền | (a) Bộ test ma trận quyền tự động — actor × hành động × trạng thái, chặn merge khi đỏ; (b) chạy pentest AI vào endpoint chat trên staging; (c) Dev tự review chéo phần RLS của Kiệt như một nghi thức bắt buộc, checklist theo mục 6 BA | Kiệt (a,b) · Dev (c) | Xong (a) trước khi viết UI; (b,c) trước Đợt 2 |
| **T3** Phạm vi vượt sức 1,5 người | Chốt gói cắt đề xuất (bỏ F5/heic/pdf/push-gộp khỏi P0) hoặc phương án thay thế; ước lượng lại timeline với đội mới **trước** khi mở Đợt 0 | Dev | Trong tuần này, trước Đợt 0 |

**Fast-follow (≤30 ngày sau Đợt 2):** T4 digest tin-chưa-trả-lời cho QLCS + auto-reply ngoài giờ · T5 job đối soát tự thi hành lệch REMOVE · T6 report ảnh + trang chính sách sử dụng.

**Track:** hành vi lưu/chia sẻ ảnh sai mục đích · tỉ lệ GV chủ động dùng (G5) · chi phí Realtime khi số lớp tăng.

**Lịch xem lại:** mở lại tài liệu này 1 tuần trước Đợt 2, tick từng mitigation — cái nào chưa xong thì hoặc hoãn pilot, hoặc ghi nhận rủi ro có chữ ký của Dev.
