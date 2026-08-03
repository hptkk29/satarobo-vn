# Câu hỏi làm rõ — Lane Kiệt (FIN · Deploy · SIS · LMS · NOTIF · SCORM)

> **Mục đích:** chốt các điểm chưa rõ / mâu thuẫn / lỗ hổng phát hiện khi audit codebase 03/07/2026 so với kế hoạch KIET.md + biên bản TBD-K7. Điền trả lời để Kiệt bắt đầu code đúng, không đoán mù.
> **Người điền:** PM (satarobo.it) · một số câu cần TGĐ / Kế toán / Tech-lead phối hợp (đánh dấu ⓣ / ⓚ).
> **Cách điền:** đánh dấu `[x]` vào ô chọn, hoặc viết vào dòng `→ Trả lời:`. Câu nào chưa quyết cứ để trống, Kiệt sẽ không tự làm phần đó.
> **Trạng thái:** ⬜ CHỜ TRẢ LỜI · Ngày tạo: 03/07/2026

---

## NHÓM A — Kế hoạch & giấy tờ

### A1. Cho phép dọn giấy tờ GĐ0? ⬜
**Bối cảnh:** Biên bản `bien-ban-chot-tbd-k7.md` trong repo vẫn ở trạng thái "⬜ CHỜ CHỐT" (chưa điền quyết định), file `.docx` bạn vừa điền đang **untracked** (chưa git add). Cả bộ kế hoạch KIET/LUAN/VY/README + thư mục v4/ cũng chưa commit — runbook K9 (đã push) link tới các file này nên teammate pull về sẽ gặp **link vỡ**. Runbook cũng chưa cập nhật 3 chi tiết TBD-3 vừa chốt.

**Kiệt xin phép làm:** (1) điền Kết luận 3 TBD vào file `.md` theo đúng docx; (2) commit cả bộ docs go-live; (3) sync runbook K9 theo TBD-3 (chỉ Kiệt chạy migrate / sau 21h / backup lưu 7 ngày / thêm checklist bật feature-flag prod).

- [ ] Đồng ý làm cả 3
- [ ] Chỉ làm... (ghi rõ)
- [ ] Chưa, để tôi tự làm

→ Ghi chú: _______________________________________________

---

### A2. ⓣ SCORM trên prod đã thực sự chạy gói NHIỀU FILE chưa?
**Bối cảnh:** SCORM được báo "LIVE prod từ 03/07". Audit phát hiện (độ tin **trung bình**) một rủi ro kiến trúc: route asset dùng **302-redirect sang link R2 tạm** → với gói SCORM nhiều file, các file con (js/css/ảnh) có thể bị **403**, và phần **ghi điểm/tiến độ (SCORM API)** có thể không chạy do khác origin (iframe cross-origin). Cần bạn xác nhận thực tế để biết đây là bug thật hay báo động nhầm.

**Câu hỏi:** trên prod, giáo viên đã **play thành công 1 gói SCORM nhiều file** (không phải chỉ 1 file HTML) và **điểm/tiến độ có ghi về hệ thống** chưa?

- [ ] Rồi, chạy tốt gói nhiều file + có ghi điểm → (Kiệt bỏ qua nghi vấn này)
- [ ] Mới chỉ thử gói 1 file / chưa test kỹ → (Kiệt đưa vào H6 để kiểm chứng + vá)
- [ ] Chưa ai test play thật trên prod → (Kiệt ưu tiên e2e trước go-live)

→ Ghi chú: _______________________________________________

---

### A3. Chốt giảm tải (tổng vẫn quá tải ~23–29 ngày-công / ~20 ngày còn lại)
**Bối cảnh:** Sau audit, K5 + phần lớn H4/H7 nhẹ hơn dự kiến (đã build sẵn), NHƯNG H2 nặng hơn (thiếu cả đường nộp bài) và TBD-4 vừa đẻ ra việc mới (CSP cho SCORM). Vẫn cần cắt bớt. Chọn (có thể nhiều):

- [ ] **H4** chỉ làm subset email P0 (kích hoạt TK · xác nhận thu · nhắc nợ · vắng buổi · học bạ phát hành), phần còn lại cuốn chiếu sau 26/07
- [ ] **H7** chuyển thành verify-only (chỉ vá lỗi chặn luồng, không thêm tính năng)
- [ ] **CSP + e2e SCORM** (H6/K6 mức b) dời sang tuần sau go-live — chấp nhận SCORM chạy với mức bảo mật hiện tại đến khi bổ sung
- [ ] Không cắt, giữ nguyên phạm vi (chấp nhận rủi ro trễ / cần thêm người)

→ Ghi chú: _______________________________________________

---

## NHÓM B — Quyết định kỹ thuật / nghiệp vụ theo task

### B1. ⓚ Cách tính "đã nộp" khi có ĐIỀU CHỈNH và HOÀN TIỀN (chặn K3 + K5)
**Bối cảnh:** Khi kế toán điều chỉnh 1 khoản (ví dụ 6.000.000 → 5.000.000), code hiện tạo **1 bản ghi mới** đánh dấu `ADJUSTED` trỏ về bản gốc, **không xoá bản gốc**. Chỗ tổng hợp "đã nộp" lại đếm **cả hai** → hiện ra **11.000.000** (sai). Đây là bug cộng đôi còn sót của K3.

**B1a. Sau điều chỉnh 6tr → 5tr, tổng "đã nộp" phải hiện bao nhiêu?** (đề xuất: **5tr**)
→ Trả lời: _______________________________________________

**B1b. Cách xử lý kỹ thuật** (Kiệt đề xuất phương án (a)):
- [ ] (a) Giữ cả 2 bản ghi, khi tổng hợp **loại bản gốc bị điều chỉnh**, chỉ đếm bản mới (5tr) — giữ được lịch sử điều chỉnh
- [ ] (b) Khi điều chỉnh thì **xoá mềm bản gốc** rồi ghi bản mới
- [ ] (c) Khác: _______________________________________________

**B1c. Bút toán HOÀN TIỀN (âm):** hiện khoản hoàn tiền **không** bị trừ khỏi "Đã thanh toán" ở cả admin lẫn portal → sau khi hoàn, phụ huynh vẫn thấy "đã đóng đủ 100%". Có trừ khoản hoàn vào tổng không?
- [ ] Có, trừ khoản hoàn khỏi "đã thanh toán"
- [ ] Không (vì đã chốt gần như không hoàn tiền — để nguyên)
- [ ] Khác: _______________________________________________

---

### B2. Sale (SALES_CSM) được ghi nhận khoản thu ở đâu?
**Bối cảnh:** Requirement K4 nói "Sale ghi nhận khoản", nhưng hiện **Sale thuần không vào được UI nào để ghi nhận**: trang `/admin/payments` và luồng "kế hoạch 2 đợt" trên trang đơn đều chặn Sale. Chỉ Sale kiêm role khác mới ghi được.

**Chọn cách mở cho Sale:**
- [ ] Hạ quyền vào trang `/admin/payments` xuống mức "ghi nhận" — Sale **thấy UI ghi nhận** nhưng **không thấy nút xác nhận** (chỉ kế toán xác nhận)
- [ ] Sale **chỉ** ghi nhận khoản qua luồng **convert lead** (khi biến lead thành học viên), không vào trang payments
- [ ] Sale không cần tự ghi nhận — để kế toán nhập hết
- [ ] Khác: _______________________________________________

→ Ghi chú: _______________________________________________

---

### B3. "Tiền + ghi danh cùng 1 giao dịch (atomic)" — chốt mức độ
**Bối cảnh:** Hiện tiền và ghi danh nằm ở **2 giao dịch tách rời** (ghi tiền trước → convert sau, nếu bước tiền lỗi chỉ báo cảnh báo, không đảo ngược convert). Có comment ghi rõ đây là chủ đích.

- [ ] Chấp nhận thiết kế 2 giao dịch hiện tại (Kiệt **đề xuất** — gộp 1 tx rủi ro cao, ít lợi)
- [ ] Bắt buộc gộp tiền + ghi danh vào **1 transaction** duy nhất
- [ ] Khác: _______________________________________________

---

### B4. Rule "vắng → sinh học bù + cảnh báo" (H1)
**Bối cảnh:** DoD ghi "vắng → tạo MakeupNeed (nhu cầu học bù) + StudentRiskAlert (cảnh báo rủi ro) + thông báo phụ huynh". Rule đang chạy khác một chút: **MakeupNeed chỉ tạo khi GV chủ động tick "Cần học bù"** (không tự động mọi lượt vắng); **RiskAlert chỉ tạo khi vắng 2 buổi liên tiếp**.

**B4a. Mỗi lượt vắng có TỰ ĐỘNG tạo nhu cầu học bù không?**
- [ ] Giữ như hiện tại — chỉ khi GV tick "Cần học bù" (Kiệt **đề xuất**, tránh tạo rác)
- [ ] Tự động mọi lượt vắng đều tạo nhu cầu học bù

**B4b. Cảnh báo rủi ro giữ rule "2 buổi vắng liên tiếp"?**
- [ ] Giữ nguyên
- [ ] Đổi thành: _______________________________________________

---

### B5. Xác nhận đúng "6 nhãn điểm danh" cần hiện trên UI
**Bối cảnh:** Bộ nhãn trong code (chuẩn SRS) gồm 6 nhãn: **Có mặt · Đi muộn · Vắng có phép · Vắng không phép · Chờ học bù · Đã học bù**. Trong đó "Chờ học bù / Đã học bù" thực chất là **trạng thái học bù đi kèm**, không phải trạng thái điểm danh gốc.

**Giáo viên khi điểm danh cần bấm chọn trong mấy nhãn?**
- [ ] Đúng 6 nhãn trên (điểm danh gộp cả trạng thái học bù)
- [ ] 4 nhãn điểm danh (Có mặt/Đi muộn/Vắng có phép/Vắng không phép) + ô riêng đánh dấu học bù
- [ ] Khác (liệt kê chính xác các nhãn): _______________________________________________

---

### B6. Thiết kế chuyển trạng thái bài tập (H2)
**Bối cảnh:** Bài tập hiện **kẹt ở "Chưa làm"** mãi mãi — không có đường nộp, không có bước chấm cập nhật trạng thái. Cần chốt vài điểm để xây đúng:

**B6a. Điểm của bài lấy từ lần làm nào?** (học viên có thể làm nhiều lần)
- [ ] Điểm **cao nhất** (đang hiển thị kiểu này ở portal)
- [ ] Lần làm **mới nhất**

**B6b. Bài trắc nghiệm tự động chấm ngay khi nộp — trạng thái nhảy thế nào?**
- [ ] Nhảy thẳng sang "Đã chấm"
- [ ] Dừng ở "Đã nộp", chờ giáo viên xác nhận

**B6c. Bài thi "dùng chung" (không gắn lớp cụ thể) đang được giao nhưng học viên KHÔNG làm được:**
- [ ] Mở đường cho học viên làm cả loại dùng chung
- [ ] Ngừng giao loại dùng chung (chỉ giao bài gắn lớp)

**B6d. Có cần tự động đánh dấu "Quá hạn" cho bài không nộp đúng hạn trước go-live không?**
- [ ] Có (thêm cron quét quá hạn)
- [ ] Không cần trong go-live, làm sau

---

### B7. Convert lead — chặn thêm điều kiện nào? (H3)
**Bối cảnh:** Sẽ thêm 2 chốt chặn còn thiếu: **không cho vượt sĩ số lớp** (kể cả 2 người convert cùng lúc) và **chặn nếu thiếu khoá tiên quyết**.

**Có cần chặn thêm theo trạng thái lớp không?**
- [ ] Chỉ 2 chốt trên là đủ
- [ ] Chặn thêm: không cho convert vào lớp **đã khai giảng / đã kết thúc**
- [ ] Khác: _______________________________________________

---

### B8. Phòng Đào tạo (TRAINING) được cấp quyền gì với học bạ? (H5)
**Bối cảnh:** TRAINING hiện **không có quyền gì** với học bạ / hoàn thành khoá → bị chặn ngay. Cần cấp quyền.

**Kiệt đề xuất:** cấp `duyệt/phát hành/thu hồi học bạ` + `xác nhận hoàn thành khoá & cấp chứng chỉ`; **KHÔNG** cấp quyền tự nhập điểm học bạ (nhập là việc của giáo viên).

- [ ] Đồng ý như đề xuất
- [ ] Cấp cả quyền nhập điểm học bạ cho Đào tạo
- [ ] Chỉ cấp duyệt/phát hành, KHÔNG cấp hoàn thành khoá
- [ ] Khác: _______________________________________________

---

### B9. ⓣ Những sự kiện nào BẮT BUỘC gửi email? (H4)
**Bối cảnh:** Tài liệu liệt kê 17 sự kiện thông báo nhưng **không nói cái nào bắt buộc gửi email** (hiện đa số chỉ hiện thông báo trong app). Cần bạn chốt danh sách gửi email thật.

**Kiệt đề xuất bắt buộc email (P0):** ✅ kích hoạt tài khoản phụ huynh · ✅ kế toán xác nhận đã thu · ✅ nhắc công nợ · ✅ con vắng buổi học · ✅ học bạ được phát hành · ✅ nhắc lịch học sắp tới.

Đánh dấu cái nào **giữ**, gạch cái nào **bỏ**, thêm nếu thiếu:
- [ ] Kích hoạt tài khoản phụ huynh
- [ ] Kế toán xác nhận đã thu (có phiếu thu)
- [ ] Nhắc công nợ / công nợ quá hạn
- [ ] Con vắng buổi học
- [ ] Học bạ được phát hành
- [ ] Nhắc lịch học sắp tới
- [ ] Nhận xét buổi học của giáo viên
- [ ] Khác: _______________________________________________

---

### B10. Giữ mô hình gửi thông báo "lai" (một số chạy bằng lịch quét)? (H4)
**Bối cảnh:** Requirement viết "17 sự kiện đều theo cơ chế DomainEvent", nhưng thực tế đã nghiệm thu: **3 loại nhắc nhở** (bài sắp hết hạn, nhắc nợ, nợ quá hạn) chạy bằng **lịch quét định kỳ (cron)** thay vì sự kiện — vì bản chất chúng theo thời gian, không theo hành động.

- [ ] Giữ mô hình lai (cron cho 3 loại nhắc) — Kiệt **đề xuất**, chỉ sửa lại câu chữ tài liệu
- [ ] Bắt buộc chuyển hết sang cơ chế sự kiện (tốn công refactor, ít lợi)

---

### B11. ⓣ Kiến trúc CSP cho SCORM (từ quyết định TBD-4 mức b)
**Bối cảnh:** TGĐ chọn mức (b) = "CSP trên player chặn script gọi ra ngoài". Repo **chưa có dòng CSP nào** → việc mới. Trở ngại kỹ thuật: nội dung SCORM hiện được **redirect sang link R2** để chạy, nên CSP đặt ở tầng ứng dụng **không phủ được** nội dung thật — phải đổi cách phục vụ file.

**B11a. Cách phủ CSP** (Kiệt đề xuất (a)):
- [ ] (a) **Đổi sang phục vụ file SCORM xuyên qua hệ thống** (thay vì redirect) để gắn CSP lên từng file — chuẩn nhất, thêm chút độ trễ + công
- [ ] (b) Đặt header ở tầng lưu trữ R2 / tên miền riêng
- [ ] Để Kiệt cân nhắc chọn phương án tối ưu rồi báo lại

**B11b. Mức chặn:** CSP chặt có thể làm hỏng gói SCORM hợp lệ nếu gói cần tải font/thư viện từ mạng ngoài.
- [ ] Chặt (chỉ cho tải tài nguyên nội bộ) — an toàn nhất, rủi ro vài gói cũ lỗi
- [ ] Nới (cho phép tài nguyên ngoài phổ biến) — ưu tiên dạy học không gián đoạn (theo tinh thần "fail-open" đã chốt trước đây)

---

### B12. Dựng tầng "cổng gọi dịch vụ ngoài" (modules/integration) trước hay sau go-live?
**Bối cảnh:** Quy ước kiến trúc yêu cầu mọi lời gọi dịch vụ ngoài (gửi email Resend, Zalo...) đi qua 1 tầng tập trung `modules/integration`. Tầng này **chưa tồn tại**, hiện gọi thẳng từ code — vẫn chạy đúng, chỉ chưa đúng chuẩn kiến trúc.

- [ ] Ghi nợ kỹ thuật, làm **sau 26/07** (Kiệt **đề xuất** — không ảnh hưởng chức năng)
- [ ] Dựng trước go-live

---

### B13. ⓣ Ai cấu hình "đợt đánh giá buổi học" trên prod? (H7)
**Bối cảnh:** Giáo viên chỉ điền được phiếu đánh giá buổi khi **đã có sẵn 1 đợt đánh giá đang mở** cho khóa/cơ sở đó. Code **không tự tạo** đợt này — phải tạo bằng tay.

- [ ] Kiệt seed sẵn đợt đánh giá cho các khóa đang chạy trước go-live
- [ ] Phòng Đào tạo tự tạo qua giao diện quản trị (Kiệt chỉ hướng dẫn)
- [ ] Khác: _______________________________________________

---

## NHÓM C — Lỗ hổng từ quyết định hoàn tiền (TBD-2)

### C1. ⓣⓚ Code hoàn tiền / voucher / VietQR đang chạy — giữ hay ẩn?
**Bối cảnh:** Kế hoạch ghi "KHÔNG làm hoàn tiền/voucher/VietQR trong đợt này", nhưng thực tế **cả 3 đã được viết xong và đang nối vào giao diện** (có trang `/admin/hoan-tien` + link menu, có xem trước voucher, có VietQR). "Không làm mới" khác với "gỡ cái đang chạy".

- [ ] **Giữ nguyên** như đang có cho go-live
- [ ] **Ẩn/khóa** các tính năng này khỏi giao diện đến khi hoàn thiện đúng quyết định
- [ ] Khác: _______________________________________________

**Nếu GIỮ:** công thức hoàn tiền trong code hiện là **chia theo số buổi đã học** (pro-rata) — **mâu thuẫn** với quyết định "không hoàn tiền, chỉ hoàn 100% sau buổi 1". Có khóa lại chỉ cho phép đúng ca "100% sau buổi đầu tiên" không?
- [ ] Có, khóa chỉ cho ca "100% sau buổi 1"
- [ ] Giữ cả công thức pro-rata (dùng nội bộ, cân nhắc từng ca)
- [ ] Khác: _______________________________________________

---

### C2. ⓣ Luồng "hoàn 100% sau buổi đầu tiên" — làm trong hệ thống hay xử lý tay?
**Bối cảnh:** Quyết định TBD-2 tạo ra 1 ca hoàn tiền hợp lệ duy nhất ("100% sau buổi 1 nếu không muốn học tiếp"). **Chưa có task nào** trong kế hoạch cho việc này.

- [ ] Làm **trong hệ thống** trước go-live (thêm nút/luồng duyệt hoàn 100%)
- [ ] **Xử lý tay** ngoài hệ thống sau go-live (kế toán tự chi + ghi chú)
- [ ] Khác: _______________________________________________

---

### C3. ⓣ Câu 2.3 trong biên bản còn bỏ trống: chuyển lớp khác mức phí
**Bối cảnh:** Biên bản TBD-2 câu 2.3 hỏi "chuyển lớp khác mức phí có tính chênh lệch theo cùng công thức không?" — phần này **chưa được trả lời** trong docx.

**Khi học viên chuyển sang lớp có học phí cao hơn / thấp hơn:**
- [ ] Thu thêm / hoàn lại **đúng phần chênh lệch** học phí
- [ ] Chỉ thu thêm nếu lớp mới đắt hơn, **không hoàn** nếu rẻ hơn
- [ ] Không xử lý chênh lệch trong đợt go-live (làm sau)
- [ ] Khác: _______________________________________________

---

## Tóm tắt cần ai trả lời

| Nhóm | Câu | Người quyết chính |
|---|---|---|
| Cho phép làm việc | A1, A2, A3 | PM (A2 cần người đã test SCORM prod) |
| Kỹ thuật thuần (Kiệt tự quyết nếu bạn uỷ quyền) | B2, B3, B6, B7, B10, B12 | PM / Tech-lead |
| Nghiệp vụ đào tạo | B4, B5, B8, B13 | PM + Phòng Đào tạo |
| Tiền / kế toán | B1, B9, C1, C2, C3 | PM + Kế toán + **TGĐ** |
| Bảo mật SCORM | B11 | Tech-lead + TGĐ |

> Điền xong gửi lại, Kiệt sẽ khởi động theo đúng thứ tự: **dọn giấy tờ (A1) → K3 → H1 → K4 → H2 → H3 → K5 → H5 → H4 → SCORM → H7**. Câu nào chưa có đáp án, phần việc tương ứng sẽ tạm dừng chờ chốt.
