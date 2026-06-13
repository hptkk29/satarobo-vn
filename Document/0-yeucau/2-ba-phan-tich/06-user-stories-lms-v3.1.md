# BA #06 — User Stories LMS v3.1 (phase R7)

> **Input:** `05-gap-analysis-lms-v3.1.md` (gap + QĐ-O1…O10) · SRS v3.1 · chuẩn `00-tieu-chuan-phan-tich-yeu-cau.md`.
> **Quy ước:** ID `US-<EPIC>-<n>` · AC dạng Given/When/Then rút gọn, map được sang Vitest/Playwright (T1–T12) · **Truy vết:** mục SRS v3.1 (+ QĐ SRS §30, AC nghiệm thu §28) · Doc 15 § · đợt R7a/R7b. Case test `[R7-xx-Cn]` gắn khi lập ticket (bước 3).
> **Phạm vi ngoài (inverse):** Satacoin runtime (PENDING — chỉ schema config) · OTP/Zalo login (SRS §8.7 "phase sau") · app mobile/FLAG_SECURE (SRS §12.4) · skill AI tạo bài tập (ngoài hệ thống — chỉ đồng bộ template §0.7) · auto nhận diện khuôn mặt để làm mờ ảnh (scope ĐÃ LOẠI Doc 15 §0) · tracking SCORM theo học viên (SRS §12.1, QĐ-18).
> **Trạng thái:** 🟢 **ĐÃ DUYỆT 12/06/2026** cùng BA #05 (XĐ-8 chốt phương án 2 → US-MKP-3 hết TBD). Map sang ticket: `phases/R7/` (R7-00…R7-17).

---

## EPIC LEAD — Lead & LeadChild (SRS §5, §7 · R7a)

**US-LEAD-1** · Là **Sale/CRM**, tôi muốn **khai báo nhiều con (LeadChild) trong một Lead bằng nút "Thêm con" inline** để **theo dõi từng trẻ riêng khi gia đình có nhiều con quan tâm**.
- Ưu tiên: Must · Loại: FR
- AC1: Given form lead mặc định hiển thị 1 trẻ, When Sale bấm "Thêm con", Then mở thêm nhóm trường (họ tên, DOB/tuổi, giới tính, trường, lớp, khóa + cơ sở quan tâm, ghi chú) ngay dưới con trước, không giới hạn số con.
- AC2: Given lead có 2 LeadChild, When xem chi tiết lead, Then mỗi con hiển thị trạng thái học thử + lớp trải nghiệm + điểm danh riêng.
- AC3: Given lead cũ chỉ có `childName/childAge` phẳng, When mở lead cũ, Then hệ thống KHÔNG migrate tự động (QĐ-O8) — hiển thị dữ liệu cũ đọc-only, cho phép tạo LeadChild mới thủ công.
- Truy vết: SRS §5.2, §28.1 · QĐ-1/3 SRS · 05-gap 2.A · R7a

**US-LEAD-2** · Là **Quản lý cơ sở/Admin**, tôi muốn **được cảnh báo khi Lead ở trạng thái Mới/Đã phân công quá 24h không có hoạt động chăm sóc** để **không bỏ rơi lead**.
- Ưu tiên: Must · Loại: FR + NFR(ops)
- AC1: Given lead NEW không có LeadActivity nào trong 24h, When cron SLA chạy, Then lead bị highlight trên danh sách + StaffNotification gửi QL cơ sở/Admin (dedupe — không lặp mỗi 15').
- AC2: Given Admin đổi ngưỡng 24h→12h trong SystemSetting, When cron chạy kỳ kế, Then áp ngưỡng mới không cần deploy.
- AC3: Given Sale ghi chú/gọi điện/đổi trạng thái, When hoạt động được lưu, Then `lastActivityAt` của lead cập nhật và đồng hồ SLA reset.
- Truy vết: SRS §5.1 (SLA), QĐ-28 SRS · phụ thuộc R6 SystemSetting · R7a

**US-LEAD-3** · Là **Sale/CRM**, tôi muốn **luồng trạng thái lead có thêm "Đang học thử" và "Đã đăng ký"** để **phản ánh đúng giai đoạn trước/sau khi phụ huynh đóng tiền** (QĐ-O9).
- Ưu tiên: Must · Loại: FR
- AC1: Given LeadChild đã tham dự ≥1 buổi của lớp trải nghiệm đang hoạt động, When điểm danh buổi đó được lưu, Then lead chuyển `TRIAL_IN_PROGRESS` (Đang học thử).
- AC2: Given Sale nhập form đăng ký + ghi nhận ≥1 khoản thanh toán (đợt 1/full), When lưu, Then lead = `REGISTERED` (Đã đăng ký); convert thành công → `ENROLLED` (Đã chuyển đổi); lead gốc không bị xóa.
- AC3: Given lead đổi trạng thái bất kỳ, Then ghi lịch sử (người, thời gian, từ→đến) — tái dùng LeadAuditLog; chuyển trạng thái không hợp lệ (vd NEW→REGISTERED) bị chặn (T7).
- AC4 (T12): Given báo cáo phễu SR217, When thêm 2 trạng thái mới, Then L1/L2/L3 + hoa hồng giữ nguyên định nghĩa, số liệu không gãy.
- Truy vết: SRS §7, §28.1 · Doc 15 §5 · R7a

## EPIC TRIAL — Lớp trải nghiệm linh động số buổi (SRS §6 + QĐ-O10 · R7a)

**US-TRIAL-1** · Là **Bộ phận Đào tạo**, tôi muốn **cấu hình số buổi của chương trình trải nghiệm qua trang admin** để **đổi mô hình trải nghiệm không cần dev** (QĐ-O10).
- Ưu tiên: Must · Loại: FR
- AC1: Given quyền Đào tạo/Admin, When đặt số buổi N=4 (hoặc 3, 5…), Then lưu thành công + ghi AuditLog; Sale không có quyền sửa (T4).
- AC2: Given cấu hình đổi 4→5, When Sale tạo lớp trải nghiệm MỚI, Then lớp sinh 5 buổi; lớp đã tạo trước đó giữ nguyên số buổi cũ.
- Truy vết: QĐ-O10 (thay SRS §6.4 "đúng 4 buổi") · 05-gap 2.B · R7a

**US-TRIAL-2** · Là **Sale/CRM**, tôi muốn **tạo lớp trải nghiệm (loại TRIAL_ROBOSIM) và hệ thống tự sinh N buổi** để **xếp lịch học thử nhanh, đúng chuẩn**.
- Ưu tiên: Must · Loại: FR
- AC1: Given cấu hình N buổi, When Sale tạo lớp (mã, tên, cơ sở, phòng, ngày bắt đầu, giờ, sức chứa), Then sinh đúng N TrialClassSession theo lịch; từng buổi chỉnh được ngày/giờ/phòng/GV riêng.
- AC2: Given lớp đã tạo, Then lớp bắt buộc gắn 1 cơ sở (`centerId`); user cơ sở khác không thấy lớp này (T5 — sau scopedDb).
- Truy vết: SRS §6.2–6.4, §28.1 · R7a

**US-TRIAL-3** · Là **Sale/CRM**, tôi muốn **xếp LeadChild vào lớp trải nghiệm với ràng buộc 1 lớp active/trẻ và kiểm tra sức chứa** để **không loạn danh sách học thử**.
- Ưu tiên: Must · Loại: FR
- AC1: Given LeadChild đang thuộc 1 lớp trải nghiệm active, When xếp vào lớp thứ 2, Then hệ thống từ chối kèm thông báo (T2/T7); 2 con cùng lead được phép học 2 lớp khác nhau.
- AC2: Given lớp đủ sức chứa, When xếp thêm, Then cảnh báo vượt sức chứa; chỉ người có quyền xác nhận mới thêm được (audit).
- Truy vết: SRS §5.2 (quy tắc), §6.4, §28.1 · R7a

**US-TRIAL-4** · Là **Quản lý cơ sở**, tôi muốn **gán giáo viên/nhân sự hỗ trợ cho lớp trải nghiệm**, và là **Giáo viên**, tôi muốn **điểm danh + nhận xét từng LeadChild theo từng buổi** để **đánh giá khả năng tiếp nhận của trẻ**.
- Ưu tiên: Must · Loại: FR
- AC1: Given QL cơ sở gán GV, When GV mở lớp trải nghiệm, Then thấy danh sách LeadChild + N buổi; Sale không gán được GV (T4).
- AC2: Given buổi diễn ra, When GV điểm danh (có mặt/vắng) + nhập nhận xét, Then lưu per-LeadChild per-buổi; PH chưa thấy gì (chưa có portal account).
- Truy vết: SRS §6.2, §28.1 · R7a

**US-TRIAL-5** · Là **hệ thống**, tôi muốn **tự chuyển LeadChild sang "Đã học thử" khi hoàn thành buổi cuối** để **Sale biết thời điểm tư vấn chốt**; lead KHÔNG tự sang "Chờ quyết định".
- Ưu tiên: Must · Loại: FR
- AC1: Given LeadChild đã có điểm danh buổi thứ N (buổi cuối), When buổi đóng, Then LeadChild = "Đã học thử"; khi TẤT CẢ LeadChild đang xét xong học thử → lead = TRIAL_ATTENDED.
- AC2: Given lead TRIAL_ATTENDED, Then trạng thái "Chờ quyết định" chỉ do Sale chuyển tay (không auto) (T7).
- Truy vết: SRS §6.4, §7 · R7a

## EPIC CONV — Convert có điều kiện thanh toán (SRS §8 · R7a)

**US-CONV-1** · Là **hệ thống**, tôi muốn **chặn convert khi chưa có khoản thanh toán nào được Sale ghi nhận** để **không tạo hồ sơ chính thức "miệng"** (QĐ-O6).
- Ưu tiên: Must · Loại: BR
- AC1: Given hồ sơ convert có Enrollment nhưng 0 khoản thanh toán ghi nhận, When bấm convert, Then từ chối với lỗi rõ (`{ok:false, error:{code:'PAYMENT_REQUIRED', message VI}}`); lead vẫn ở REGISTERED trở về trước.
- AC2: Given ≥1 khoản (đợt 1 hoặc full) Sale đã ghi nhận, When convert, Then đi tiếp; Kế toán CHƯA cần xác nhận tại thời điểm convert.
- AC3: Given Enrollment giá-phải-thu = 0đ (học bổng toàn phần), When convert, Then coi như thỏa điều kiện (không có gì để thu) — ghi chú lý do trong audit.
- AC4 (T6): Given double-click convert, Then chỉ tạo 1 bộ Parent/Student/Enrollment (idempotency-key); lỗi giữa chừng → rollback toàn bộ (§27.4).
- Truy vết: SRS §8.1, §28.2, QĐ-4 SRS · Doc 15 Q4 (transaction) · R7a

**US-CONV-2** · Là **Sale/CRM**, tôi muốn **nhập nhiều học viên trong 1 form convert ("Thêm học viên") và mỗi con tự có Enrollment riêng** để **gia đình nhiều con đăng ký 1 lần**.
- Ưu tiên: Must · Loại: FR
- AC1: Given form convert mặc định 1 học viên, When bấm "Thêm học viên", Then mở nhóm trường tương tự ngay dưới; không giới hạn số con; mỗi con chọn khóa học riêng → Enrollment riêng.
- AC2: Given form dài, When nhập dở, Then autosave draft — quay lại không mất dữ liệu (§27.5).
- AC3: Given convert N con thành công, Then tạo đủ N Student + N Enrollment + snapshot giá từng Enrollment trong 1 transaction.
- Truy vết: SRS §8.3, §28.2, QĐ-5 SRS · R7a

**US-CONV-3** · Là **hệ thống**, tôi muốn **kiểm tra trùng phụ huynh theo CẢ email và SĐT; khi xung đột thì khóa convert chuyển Admin** để **không sinh hồ sơ trùng/gộp sai**.
- Ưu tiên: Must · Loại: BR
- AC1: Given email + phone chưa tồn tại, When convert, Then tạo Parent mới.
- AC2: Given email hoặc phone khớp đúng 1 Parent, When convert, Then hiển thị hồ sơ hiện có để Sale xác nhận chọn — không tạo Parent trùng; Student mới gắn vào Parent cũ.
- AC3: Given phone thuộc Parent A và email thuộc Parent B, When convert, Then **khóa thao tác** + tạo mục chờ Admin xử lý + log xung đột; Sale không tự chọn được (T7/T9).
- Truy vết: SRS §8.4, §26.1–3, §28.2 · R7a

**US-CONV-4** · Là **Sale/CRM**, tôi muốn **được cảnh báo khi học viên trùng (cùng Parent + họ tên chuẩn hóa + ngày sinh)** để **chọn lại Student cũ thay vì tạo mới**.
- Ưu tiên: Must · Loại: BR
- AC1: Given Parent đã có Student "Nguyễn Văn  A" (chuẩn hóa khoảng trắng/hoa thường) DOB 01/02/2018, When nhập học viên trùng cả 3 tiêu chí, Then cảnh báo + cho chọn Student cũ; chọn cũ → chỉ tạo Enrollment mới cho khóa mới.
- Truy vết: SRS §8.5, §26.5, §28.2, QĐ-7 SRS · R7a

**US-CONV-5** · Là **Sale/CRM**, tôi muốn **xử lý cờ đồng ý sử dụng hình ảnh học viên ngay tại form convert (sau khi trao đổi trực tiếp với PH), hệ thống ghi người tick + thời điểm** để **tuân thủ NĐ 13/2023 về dữ liệu trẻ em**.
- Ưu tiên: Must · Loại: FR + NFR(security/PII)
- AC1: Given form convert, Then có ô tick consent ảnh per học viên kèm nội dung cam kết; When convert thành công, Then tạo `StudentConsent(CLASS_MEDIA, GRANTED/REVOKED)` + AuditLog (actor = Sale, thời điểm) (T9).
- AC2: Given PH muốn đổi consent sau này, When gửi yêu cầu chính thức qua portal, Then trạng thái đổi + log đầy đủ; ảnh đang hiển thị tuân thủ ngay (ẩn nếu revoke — cơ chế query hiện có).
- Truy vết: SRS §8.2, QĐ-29 SRS · Doc 15 §6.3 consent · code `StudentConsent` schema:585–596 · R7a

**US-CONV-6** · Là **hệ thống**, tôi muốn **sinh mã học viên format mới `<MA_CO_SO>-<YY>-<RANDOM>`** để **mã không đoán được và quản lý tốt khi nhiều chi nhánh** (QĐ-O4).
- Ưu tiên: Must · Loại: FR
- AC1: Given convert tại CS1 năm 2026, When tạo Student, Then mã dạng `CS1-26-A7K9P2` (viết hoa; random bỏ ký tự dễ nhầm 0/O/1/I/L); unique toàn hệ thống; trùng → tự sinh lại (T6).
- AC2: Given Student có mã, When user thường sửa mã, Then bị chặn; chỉ SUPER_ADMIN sửa được + audit + reason (T4/T9). Mã cũ `CS1.HV.26.001` giữ nguyên (2-phase).
- Truy vết: SRS §8.6, §28.2, QĐ-8 SRS · R7a

## EPIC CRS — Khóa học, giá, ưu đãi (SRS §9 · R7a)

**US-CRS-1** · Là **Admin/Đào tạo (được phân quyền)**, tôi muốn **cấu hình ưu đãi theo khóa học (giảm tiền / giảm % / học bổng / ưu đãi chương trình)** để **Sale áp dụng thống nhất khi convert**.
- Ưu tiên: Must · Loại: FR
- AC1: Given khóa có giá niêm yết 10.000.000đ + ưu đãi giảm 10%, When Sale chọn khóa + ưu đãi ở form convert, Then hệ thống tự tính: giảm 1.000.000đ, phải thanh toán 9.000.000đ.
- AC2: Given giá khóa áp dụng toàn hệ thống (không khác theo cơ sở), Then không có trường giá per-center (QĐ-9 SRS).
- Truy vết: SRS §9.1–9.2, §28.3 · R7a

**US-CRS-2** · Là **hệ thống**, tôi muốn **lưu snapshot giá đầy đủ tại Enrollment (niêm yết / loại ưu đãi / số giảm / phải thanh toán)** để **giá đã chốt không đổi khi bảng giá cập nhật**.
- Ưu tiên: Must · Loại: BR
- AC1: Given Enrollment tạo với giá 10tr − 1tr = 9tr, When Admin đổi giá khóa thành 12tr, Then Enrollment giữ nguyên 4 giá trị snapshot (T1/T12).
- Truy vết: SRS §9.2, §26.8, §28.3, QĐ-8 SRS (snapshot) · R7a

**US-CRS-3** · Là **Đào tạo**, tôi muốn **khóa học có độ tuổi/trình độ và 1 khung chương trình mặc định đang xuất bản** để **lớp tự nhận chương trình đúng**.
- Ưu tiên: Should · Loại: FR
- AC1: Given khóa chưa có curriculum trạng thái xuất bản, When tạo/kích hoạt lớp chính thức cho khóa đó, Then bị chặn kèm hướng dẫn (T2).
- Truy vết: SRS §9.1, §11.7 · R7a (guard) + R7b (UI đầy đủ)

## EPIC PAY — Thanh toán 2 tầng & công nợ (SRS §10 · R7a)

**US-PAY-1** · Là **Kế toán**, tôi muốn **mọi khoản thu có 2 tầng trạng thái (Sale ghi nhận ↔ Kế toán xác nhận thực thu / từ chối / hoàn / điều chỉnh)** để **tách trách nhiệm ghi nhận và xác nhận tiền**.
- Ưu tiên: Must · Loại: FR + BR
- AC1: Given Sale ghi nhận khoản 5tr (kèm ngày, phương thức, chứng từ), Then khoản ở "Sale đã ghi nhận / Chờ kế toán xác nhận"; PH **chưa** thấy.
- AC2: Given Kế toán xác nhận thực thu, Then công nợ giảm tương ứng + PH thấy khoản này trên portal + notify (T1); Kế toán từ chối → trạng thái "Từ chối/xác minh lại" + lý do bắt buộc + Sale được báo.
- AC3: Given khoản đã xác nhận, When cần sửa, Then KHÔNG xóa cứng — tạo bút toán/phiếu điều chỉnh có log (T9); refund đánh dấu "Đã hoàn tiền".
- AC4 (T4): Sale không tự xác nhận thực thu; Kế toán không sửa bản ghi nhận của Sale (chỉ đổi trạng thái tầng kế toán).
- Truy vết: SRS §10.1, §10.3–10.4, §26.10/22, §28.3, QĐ-11 SRS · Doc 15 §6.4/Q14 · R7a

**US-PAY-2** · Là **Sale/CRM**, tôi muốn **lập kế hoạch 2 đợt: hệ thống tự tính số còn lại đợt 2, PH chọn ngày đợt 2, nhắc trước X ngày (mặc định 14, tôi nhập X thì dùng X)** để **không quên thu nợ** (QĐ-O7).
- Ưu tiên: Must · Loại: FR
- AC1: Given giá phải thanh toán 9tr, đợt 1 = 5tr, Then hệ thống tự tính đợt 2 = 4tr; Sale nhập ngày dự kiến đợt 2 (PH chọn) và X (bỏ trống → 14).
- AC2: Given dueDate đợt 2 = 30/07, X = 7, When đến 23/07, Then tạo nhắc công nợ (in-app + email; 1 lần/ngày chống spam) (T3 biên: nhắc đúng ngày 23/07, không 22 hay 24).
- AC3: Given ngày nhắc tính ra ≤ hôm nay, When lưu kế hoạch, Then tạo nhắc NGAY + cảnh báo Sale trên màn hình.
- Truy vết: SRS §10.2, §28.3, QĐ-10 SRS · code OrderInstallment + cron debt-reminder · R7a

**US-PAY-3** · Là **Kế toán**, tôi muốn **phiếu thu tách riêng theo từng Enrollment (không gộp hóa đơn nhiều con), một Enrollment có thể nhiều phiếu thu** để **đối soát từng con rõ ràng**.
- Ưu tiên: Must · Loại: FR
- AC1: Given PH đăng ký 2 con, When thu tiền, Then mỗi Enrollment có phiếu thu riêng mã `RCP-{CENTER}-{YY}-{SEQ}`; không có phiếu gộp (T1).
- AC2: Given Enrollment trả 2 đợt, Then 2 phiếu thu riêng cho 2 đợt; mọi điều chỉnh có log, không xóa cứng (T9).
- Truy vết: SRS §10.4, §26.7, §28.3, QĐ-12 SRS · R7a

**US-PAY-4** · Là **Kế toán/QL cơ sở**, tôi muốn **màn hình công nợ đa chiều (Enrollment / học viên / PH / cơ sở / Sale / ngày đến hạn / mức quá hạn)** để **đòi nợ đúng người đúng hạn**.
- Ưu tiên: Should · Loại: FR
- AC1: Given dữ liệu nhiều cơ sở, When QL CS1 mở công nợ, Then chỉ thấy CS1 (T5); công thức: phải-thu − tổng-kế-toán-đã-xác-nhận (T1).
- Truy vết: SRS §10.5, §24.6 · R7a

## EPIC PROG — Khung chương trình (SRS §11 · R7b)

**US-PROG-1** · Là **Đào tạo**, tôi muốn **nhập "Số buổi = N" để hệ thống sinh N mục buổi; tăng thêm vào cuối, giảm phải cảnh báo và lưu trữ thay vì xóa** để **chỉnh chương trình an toàn dữ liệu**.
- Ưu tiên: Must · Loại: FR
- AC1: Given N=12, Then sinh đủ Buổi 1..12 (accordion); tăng 12→14 → thêm buổi 13,14 cuối, dữ liệu cũ nguyên vẹn.
- AC2: Given giảm 12→10 và buổi 11 có SCORM/bài tập, When xác nhận giảm, Then liệt kê rõ buổi bị loại + bắt confirm; buổi loại chuyển lưu trữ (archive) — không xóa cứng (T7).
- Truy vết: SRS §11.4, §28.4 · R7b

**US-PROG-2** · Là **Đào tạo**, tôi muốn **trạng thái từng buổi (Chưa hoàn thiện / Đã hoàn thiện / Đang sử dụng / Cần cập nhật / Đã khóa) + tiếp nhận đề xuất chỉnh sửa từ GV** để **kiểm soát chất lượng nội dung**.
- Ưu tiên: Should · Loại: FR
- AC1: Given buổi "Đã khóa chỉnh sửa", When GV/Đào tạo viên thường sửa, Then bị chặn (T4); GV gửi đề xuất chỉnh sửa → Đào tạo xử lý (chấp nhận/từ chối + phản hồi).
- Truy vết: SRS §11.6, §3.5–3.6 · R7b

**US-PROG-3** · Là **hệ thống**, tôi muốn **chỉ cho kích hoạt lớp khi khóa học có chương trình đang xuất bản, và lớp lưu phiên bản được dùng** để **mọi lớp luôn có nội dung chuẩn** (xem US-CLASS-1).
- Ưu tiên: Must · Loại: BR
- AC1: Given Course không có curriculum PUBLISHED/ACTIVE, When kích hoạt lớp, Then chặn (T2). Given có, Then lớp ghi `curriculumVersion` đã gắn.
- Truy vết: SRS §11.7, §28.4 · Doc 15 §6.3 · R7a (guard đi cùng EPIC CLASS)

## EPIC SCORM — Bài giảng SCORM (SRS §12 · R7b)

**US-SCORM-1** · Là **Đào tạo**, tôi muốn **upload gói SCORM .zip: hệ thống validate manifest, giải nén vào vùng riêng, lưu metadata, qua bước xem thử rồi mới xuất bản** để **bài giảng chuẩn trước khi đến lớp**.
- Ưu tiên: Must · Loại: FR
- AC1: Given file .zip có `imsmanifest.xml` hợp lệ (SCORM 1.2/2004), When upload (có progress), Then job nền giải nén vào R2 prefix riêng + xác định launch URL + lưu metadata (tên, version, lesson, size, người upload, ngày) + trạng thái "chờ kiểm thử".
- AC2: Given zip thiếu manifest/sai loại file/vượt size, Then từ chối với lỗi rõ ràng (T2); job lỗi giữa chừng → trạng thái FAILED + thử lại được (T8).
- AC3: Given Đào tạo xem thử OK, When bấm xuất bản, Then SCORM PUBLISHED gắn vào buổi chương trình; GV chưa thấy bản chưa xuất bản.
- Truy vết: SRS §12.2–12.3, §28.4 · Doc 15 Q4 (job DB-queue + cron) · QĐ-O5 · R7b

**US-SCORM-2** · Là **Giáo viên**, tôi muốn **mở SCORM trên website để trình chiếu (không có nút tải, học viên/PH không mở được)** để **dạy bằng tài liệu chính thống mà không lộ file nguồn**.
- Ưu tiên: Must · Loại: FR + NFR(security)
- AC1: Given GV được phân công lớp, When mở buổi → bấm "Mở SCORM", Then player chạy qua signed URL ngắn hạn; KHÔNG có nút tải; truy cập file trực tiếp khi URL hết hạn → 403 (T10).
- AC2: Given user role PARENT/profile học viên gọi route SCORM (kể cả sửa id — IDOR), Then bị chặn (T10); GV không phụ trách lớp cũng bị chặn (T4).
- AC3: Given GV mở SCORM, Then ghi log: ai, lớp, buổi, thời gian (T9). Không tracking theo học viên (QĐ-18 SRS — inverse).
- Truy vết: SRS §12.1, §12.4, §28.4 · R7b

**US-SCORM-3** · Là **trung tâm**, tôi muốn **player tự làm mờ khi mất focus/PrintScreen/DevTools/chia sẻ màn hình + watermark động (tên + mã GV + thời gian, vị trí đổi ngẫu nhiên)** để **hạn chế quay/chụp và truy vết được bản rò rỉ**.
- Ưu tiên: Must · Loại: FR + NFR(security)
- AC1: Given player đang mở, When tab `blur`/`visibilitychange`, Then lớp phủ mờ che nội dung; focus lại → hiện lại.
- AC2: Given phím PrintScreen (Windows), Then phủ mờ + ghi đè clipboard; mở DevTools / tab bị share màn hình (API trình duyệt phát hiện được) → phủ mờ.
- AC3: Given player hiển thị, Then watermark chéo mờ (tên + mã GV + thời gian thực) dịch vị trí ngẫu nhiên định kỳ.
- AC4 (nghiệm thu trung thực — QĐ-O5): các biện pháp ở mức tối đa trình duyệt hỗ trợ; quay bằng điện thoại/phần mềm ngoài KHÔNG chặn tuyệt đối — wording này giữ trong biên bản nghiệm thu.
- Truy vết: SRS §12.4 (đã chốt bổ sung), QĐ-30 SRS · R7b

**US-SCORM-4** · Là **Đào tạo**, tôi muốn **versioning SCORM: bản mới không xóa bản cũ, 1 bản active/buổi, lớp giữ bản đã gắn trừ khi chủ động cập nhật (audit)** để **lớp đang dạy không bị đổi tài liệu giữa chừng**.
- Ưu tiên: Must · Loại: BR
- AC1: Given buổi có SCORM v1 và lớp A đã bắt đầu, When upload + publish v2, Then lớp A vẫn mở v1; lớp tạo mới nhận v2.
- AC2: Given người có quyền chủ động đổi lớp A sang v2, Then yêu cầu reason + ghi AuditLog (T9).
- Truy vết: SRS §12.5, QĐ-17 SRS · R7b

## EPIC HW — Bài tập trắc nghiệm + import Word (SRS §13 · R7b)

**US-HW-1** · Là **Đào tạo**, tôi muốn **gắn bài tập vào buổi chương trình với cấu hình đầy đủ (thời lượng, số lần làm, hạn mặc định, cách tính điểm, điểm đạt, trộn câu/đáp án, hiển thị kết quả)** để **chuẩn hóa bài về nhà từng buổi**.
- Ưu tiên: Must · Loại: FR
- AC1: Given Exam DRAFT gắn Lesson buổi 3 + cấu hình, When xuất bản, Then bài sẵn sàng để auto-giao khi lớp dạy buổi 3.
- AC2 (T4): chỉ Đào tạo/Admin CRUD bài gốc; GV chỉ xem — sửa câu hỏi/đáp án bị chặn.
- Truy vết: SRS §13.1–13.2, QĐ-16 SRS · R7b

**US-HW-2** · Là **Đào tạo**, tôi muốn **import bài tập từ Word .docx theo template field cố định (QUESTION_CODE/QUESTION_TYPE/…/CORRECT_ANSWER) có ảnh nhúng, với màn preview cho sửa từng câu trước khi xác nhận, import thành bản nháp** để **đưa ngân hàng câu hỏi vào nhanh, ít lỗi**.
- Ưu tiên: Must · Loại: FR
- AC1: Given file .docx đúng template (block/bảng per câu hỏi) có ảnh chèn trực tiếp, When upload, Then parse đủ field + trích ảnh từ package docx + map ảnh đúng câu/đáp án theo vị trí block; chỉ nhận .docx (.doc bị từ chối — T2).
- AC2: Given file có lỗi (mã trùng, CORRECT_ANSWER trỏ option không tồn tại, thiếu QUESTION_TEXT, sai QUESTION_TYPE), Then màn preview đánh dấu lỗi từng dòng + cho sửa inline trước khi xác nhận; câu lỗi không chặn câu đúng.
- AC3: Given xác nhận import, Then câu hỏi vào trạng thái NHÁP idempotent theo QUESTION_CODE (import lại không nhân đôi — T6); chỉ Đào tạo xuất bản.
- AC4: Given Đào tạo cần template, Then tải được file mẫu chuẩn từ hệ thống; template đồng bộ với skill AI ngoài hệ thống (SRS §0.7 — kiểm tra chéo khi nghiệm thu).
- AC5 (NFR §27.2): file lớn chạy job nền, có trạng thái tiến trình.
- Truy vết: SRS §13.4, §28.5, QĐ-15/33 SRS · R7b

**US-HW-3** · Là **Giáo viên**, tôi muốn **hệ thống tự giao bài tập đã xuất bản cho lớp/học viên khi tôi đánh dấu buổi "đã dạy" (tôi được chọn hạn nộp hoặc trì hoãn giao)** để **không phải giao tay từng bài**.
- Ưu tiên: Must · Loại: FR
- AC1: Given buổi 3 có Exam PUBLISHED gắn sẵn, When GV hoàn tất buổi (US-SESS-1), Then HomeworkAssignment tự tạo cho mọi học viên active của lớp với hạn mặc định; event handler idempotent — hoàn tất 2 lần không giao trùng (T6).
- AC2: Given GV chọn "trì hoãn giao" hoặc hạn khác, Then tôn trọng lựa chọn; GV không sửa được câu hỏi gốc (T4).
- AC3: Given bài được giao, Then học viên thấy trong portal + notify PH/HV.
- Truy vết: SRS §13.5, §28.5 · Doc 15 Q4 (event) · R7b

**US-HW-4** · Là **Phụ huynh**, tôi muốn **chỉ thấy tình trạng bài tập của con (đã giao/đã làm, x/y bài, trạng thái, điểm tổng quan nếu trung tâm bật) — KHÔNG thấy nội dung câu hỏi/đáp án** để **theo dõi mà không làm hộ**.
- Ưu tiên: Must · Loại: FR + NFR(security)
- AC1: Given profile PH (site phụ huynh), When xem mục bài tập của con, Then chỉ render dữ liệu aggregate; API trả chi tiết câu hỏi cho PH → bị chặn (T4/T10).
- AC2: Given chuyển sang profile học viên, Then học viên xem + làm được bài CỦA MÌNH (đúng Enrollment/lớp); không xem bài lớp khác (T5).
- Truy vết: SRS §13.6, §18.5, §28.5/28.8, QĐ-20 SRS · R7b

## EPIC CLASS — Lớp chính thức, snapshot, gán học viên (SRS §14–15 · R7a)

**US-CLASS-1** · Là **CRM**, tôi muốn **tạo lớp theo khóa học: hệ thống tự gắn chương trình mặc định, tạo snapshot phiên bản, sinh đủ lịch buổi** để **mở lớp một bước, nội dung khớp khóa**.
- Ưu tiên: Must · Loại: FR
- AC1: Given khóa SATA 3 có curriculum v2 PUBLISHED 48 buổi, When tạo lớp (ngày bắt đầu, thứ 2+4, giờ, phòng, sức chứa), Then tự gắn curriculum v2 + tạo ClassProgramSnapshot + sinh đủ 48 ClassSession đúng thứ/giờ, né Holiday (tái dùng generate.ts).
- AC2: Given curriculum lên v3 sau đó, Then lớp đang chạy GIỮ v2 (xem US-PROG-3/US-SCORM-4); muốn nhận v3 phải thao tác chủ động + audit.
- AC3: Given lớp đã tạo, Then đổi thứ tự bài/ghi chú buổi của lớp KHÔNG sửa Program gốc.
- Truy vết: SRS §14.1–14.3, §14.6, §28.6, QĐ-13/16 SRS · Doc 15 §6.3 · R7a

**US-CLASS-2** · Là **CRM/QL cơ sở**, tôi muốn **đổi lịch lặp (thứ học/số buổi mỗi tuần) với preview + chỉ tính lại buổi tương lai + thông báo PH/GV** để **điều chỉnh vận hành mà không vỡ dữ liệu cũ**.
- Ưu tiên: Must · Loại: FR
- AC1: Given lớp học T2+T4 còn 20 buổi tương lai, When đổi sang T3+T5, Then preview lịch mới + danh sách buổi bị thay đổi; xác nhận mới áp dụng; buổi đã hoàn thành/đã khóa giữ nguyên; tổng số buổi chương trình bảo toàn (T3/T7).
- AC2: Given áp dụng đổi lịch, Then notify PH + GV (event) + lưu lịch sử người đổi (T9).
- Truy vết: SRS §14.4, §28.6, QĐ-14 SRS · code class-reschedule (tái dùng) · R7a

**US-CLASS-3** · Là **QL cơ sở**, tôi muốn **điều chỉnh từng buổi (đổi ngày/giờ/GV/phòng, đánh dấu nghỉ lễ, hủy, tạo buổi bù, đổi thứ tự bài theo quyền) — mọi thay đổi có lịch sử và thông báo** để **xử lý phát sinh thực tế**.
- Ưu tiên: Must · Loại: FR
- AC1: Given buổi 12/08 đổi GV + phòng, Then lưu người đổi + before/after (T9) + notify bên liên quan nếu ảnh hưởng lịch.
- AC2: Given hủy buổi, Then buổi đánh dấu hủy (không xóa) + phương án bù được tạo để bảo toàn tổng buổi.
- Truy vết: SRS §14.5, §28.6 · R7a

**US-CLASS-4** · Là **CRM**, tôi muốn **dropdown gán học viên chỉ hiển thị Enrollment hợp lệ (đúng khóa, đúng cơ sở, "Chờ xếp lớp", chưa thuộc lớp active, không bảo lưu) và nút "Thêm toàn bộ" áp theo bộ lọc với kiểm tra sức chứa** để **xếp lớp nhanh, không sai người**.
- Ưu tiên: Must · Loại: FR
- AC1: Given Enrollment khác khóa/khác cơ sở/PAUSED/đã có lớp active, Then KHÔNG xuất hiện trong dropdown (T5: enrollment CS2 không hiện cho lớp CS1).
- AC2: Given bấm "Thêm toàn bộ" với 12 enrollment hiển thị và lớp còn 10 chỗ, Then hiển thị số sẽ thêm + cảnh báo vượt sức chứa; chỉ người có quyền xác nhận mới thêm vượt (audit).
- AC3: Given gán thành công, Then Enrollment → "Đã xếp lớp" + sinh tiến độ theo buổi + quyền bài tập + lịch hiện trên portal + notify PH (event).
- Truy vết: SRS §15.1–15.3, §26.11, §28.6 · R7a

## EPIC SESS — Giáo viên vận hành buổi học (SRS §16 · R7a)

**US-SESS-1** · Là **Giáo viên**, tôi muốn **vận hành buổi học theo luồng chuẩn (mở buổi → SCORM → điểm danh → nhận xét lớp + từng HV → ảnh → "Hoàn tất buổi")**, trong đó "Hoàn tất buổi" là cổng kích hoạt giao bài + cập nhật tiến độ + thông báo, để **một thao tác đóng buổi kéo theo mọi việc hậu cần**.
- Ưu tiên: Must · Loại: FR
- AC1: Given buổi hôm nay, When GV hoàn tất buổi, Then trong transaction: buổi = COMPLETED + lưu nội dung đã dạy, GV thực dạy, giờ/phòng thực tế; sau commit: event giao bài (US-HW-3) + tiến độ + notify (Doc 15 Q4 atomic vs event).
- AC2: Given chưa điểm danh, When bấm hoàn tất, Then cảnh báo bắt xác nhận (chống quên); hoàn tất 2 lần → idempotent (T6).
- AC3: Given buổi hoàn tất, Then dữ liệu sau buổi đầy đủ theo SRS §16.2 (điểm danh, lý do vắng, cần học bù, nhận xét, bài giao, hạn, ảnh, ghi chú nội bộ).
- Truy vết: SRS §16, §28.7 · Doc 15 §6.3 "Hoàn tất buổi" · R7a

**US-SESS-2** · Là **Giáo viên**, tôi muốn **nhập nhận xét chung cả lớp bên cạnh nhận xét từng học viên** để **PH nắm không khí buổi học**.
- Ưu tiên: Should · Loại: FR
- AC1: Given buổi học, When GV lưu nhận xét lớp, Then hiển thị cho mọi PH có con trong lớp; nhận xét từng HV chỉ PH của HV đó thấy (T5).
- Truy vết: SRS §16.1–16.2 · code StudentSessionFeedback (tái dùng) · R7a

## EPIC MKP — Học bù liên cơ sở (SRS §17 + QĐ-O2 · R7a)

**US-MKP-1** · Là **Phụ huynh**, tôi muốn **khi con vắng, hệ thống đề xuất các buổi học bù phù hợp ở MỌI cơ sở (ưu tiên cơ sở con đang học trước, rồi tới lịch gần nhất) để tôi gửi yêu cầu; CRM/Quản lý xác nhận** để **con không hổng nội dung buổi đã vắng**.
- Ưu tiên: Must · Loại: FR + BR
- AC1: Given con vắng buổi có nội dung "Bài 5", Then danh sách đề xuất chỉ gồm buổi: cùng khóa + cùng nội dung/bài 5 + chưa diễn ra/còn tham gia được + còn sức chứa + không trùng lịch khác của con + không vượt tiến độ lớp gốc (Doc 15 §6.3).
- AC2: Given CS1 (cơ sở nhà) và CS2 đều có buổi phù hợp, Then sort: CS1 trước → còn lại theo lịch gần nhất (T3: cùng cơ sở khác ngày, cùng ngày khác cơ sở).
- AC3: Given PH chọn buổi CS2 và gửi yêu cầu, When CRM/QL xác nhận, Then tạo lượt học bù chéo cơ sở qua **exception có kiểm soát của scopedDb** + AuditLog ghi rõ (học viên, từ CS, sang CS, buổi, người duyệt) (T9/T5).
- AC4: Given GV lớp CS2 điểm danh buổi đó, Then thấy học viên học bù trong danh sách buổi (chỉ buổi đó); điểm danh "Học bù" → sync về tiến độ lớp gốc (`makeupStatus=MADE_UP`).
- Truy vết: SRS §17.3–17.4, §28.9, QĐ-19/31 SRS · QĐ-O2 · code lib/makeup/service.ts (mở rộng) · R7a

**US-MKP-2** · Là **Phụ huynh/Học viên**, tôi muốn **dashboard hiển thị tách bạch 5 chỉ số: tổng buổi chương trình / đã tham gia / vắng / cần học bù / đã học bù** để **nhìn 1 phát biết tiến độ thật**.
- Ưu tiên: Must · Loại: FR
- AC1: Given chương trình 48 buổi, con học 20, vắng 3, đã bù 2, Then hiển thị: tổng 48 · tham gia 22 (20 + 2 bù tính vào hoàn thành nội dung) · vắng 3 · cần bù 1 · đã bù 2; buổi bù KHÔNG làm tăng tổng 48 (T1/T3).
- Truy vết: SRS §17.5, §18.4, §28.9 · helper Vitest · R7a

**US-MKP-3** · Là **hệ thống**, tôi muốn **hiển thị đủ 6 nhãn trạng thái điểm danh theo SRS (Có mặt/Vắng có phép/Vắng không phép/Đi muộn/Học bù/Buổi hủy)** theo phương án lưu trữ được chốt ở XĐ-8.
- Ưu tiên: Must · Loại: FR · **TBD-1: chờ Owner chốt XĐ-8** (khuyến nghị: enum Doc 15 + map nhãn từ status/makeupStatus/sessionStatus)
- AC1: Given buổi hủy, Then mọi HV buổi đó hiển thị "Buổi học bị hủy" và không tính vắng (T3).
- Truy vết: SRS §17.1–17.2 · Doc 15 §6.3 · R7a

## EPIC PORTAL — Dashboard PH/HV bổ sung (SRS §18 · R7a)

**US-PORTAL-1** · Là **Phụ huynh**, tôi muốn **dashboard tổng hợp: các con, lịch sắp tới, thông báo, học phí ĐÃ XÁC NHẬN, công nợ còn lại + ngày đến hạn, yêu cầu học bù, khảo sát đang mở** để **một màn nắm hết việc của gia đình**.
- Ưu tiên: Must · Loại: FR
- AC1: Given PH có 2 con + công nợ đợt 2 đến hạn 30/07, Then dashboard hiện công nợ 4tr + ngày 30/07 (chỉ tính các khoản kế toán đã xác nhận vào "đã nộp") (T1).
- AC2: Given khảo sát trung tâm đang mở cho cơ sở của con, Then thấy mục "Khảo sát đang mở" dẫn tới form.
- Truy vết: SRS §18.3, §28.8 · R7a (phần học phí/học bù) + R7b (khảo sát)
- 
**US-PORTAL-2** · Là **Học viên (qua profile trong tài khoản PH)**, tôi muốn **dashboard cá nhân đủ mục: khóa/lớp/GV, lịch, 5 chỉ số buổi, danh sách buổi, nhận xét, bài tập (x/y), kết quả, ảnh lớp, học bạ, mục Đánh giá giáo viên** để **tự theo dõi việc học của mình**.
- Ưu tiên: Must · Loại: FR
- AC1: Given chuyển profile sang Học viên 1, Then toàn bộ menu/dữ liệu chỉ của Học viên 1; route không lộ studentId (cookie HMAC hiện có); không trộn dữ liệu anh/chị/em (T5/T10 — tái dùng cơ chế R4).
- Truy vết: SRS §18.2, §18.4, §28.8, QĐ-21 SRS · Doc 15 Q10 · R7a

## EPIC MEDIA — Hình ảnh lớp theo buổi + consent (SRS §19 · R7a)

**US-MEDIA-1** · Là **GV của lớp / Sale phụ trách lớp / QL/Admin**, tôi muốn **upload ảnh gắn đúng lớp + buổi + ngày chụp, tag học viên** để **PH xem ảnh con đúng ngữ cảnh buổi học**.
- Ưu tiên: Must · Loại: FR
- AC1: Given GV upload ảnh cho buổi 12/08, Then ảnh gắn classId + sessionId + ngày + người upload; PH chỉ thấy ảnh lớp con đang học, ưu tiên ảnh có tag con (T5).
- AC2: Given Sale KHÔNG phụ trách lớp, When upload, Then bị chặn (T4).
- Truy vết: SRS §19.1–19.3 · code ClassSessionMedia/MediaStudentTag (mở rộng) · R7a

**US-MEDIA-2** · Là **người upload**, tôi muốn **được cảnh báo khi lớp có học viên CHƯA đồng ý sử dụng hình ảnh (kèm danh sách) và hệ thống không cho tag các em đó** để **tuân thủ NĐ 13/2023 mà không lỡ tay**.
- Ưu tiên: Must · Loại: FR + NFR(PII)
- AC1: Given lớp có 2 HV chưa consent, When mở màn upload, Then banner cảnh báo nêu tên 2 em + hướng dẫn (làm mờ thủ công trước khi đăng hoặc loại khỏi khung hình); chọn tag em chưa consent → bị chặn (T2).
- AC2: Given HV không consent xuất hiện trong ảnh chung KHÔNG tag, Then ảnh vẫn không hiển thị em đó cho PH khác qua tag/tìm kiếm; **hệ thống KHÔNG tự nhận diện khuôn mặt để làm mờ** (scope ĐÃ LOẠI — Doc 15 §0): trách nhiệm làm mờ thủ công thuộc người upload, hệ thống chỉ cảnh báo + enforce tag/hiển thị.
- AC3: Given PH thu hồi consent, Then ảnh có tag con ẩn ngay khỏi portal các PH khác (cơ chế query hiện có — T1 regression).
- Truy vết: SRS §19.3, §8.2, QĐ-29 SRS · Doc 15 §6.3/§8.3 · R7a

**US-MEDIA-3** · Là **hệ thống**, tôi muốn **phục vụ ảnh lớp qua signed URL ngắn hạn** để **không truy cập được ảnh lớp khác qua URL trần**.
- Ưu tiên: Must · Loại: NFR(security)
- AC1: Given URL ảnh hết hạn/đổi id ảnh lớp khác, When truy cập, Then 403 (T10-IDOR).
- Truy vết: SRS §19.3, §27.1 · Doc 15 §8.3 · R7a

## EPIC RC — Học bạ theo Enrollment (SRS §20 · R7b)

**US-RC-1** · Là **Giáo viên**, tôi muốn **nhập học bạ cho từng Enrollment (tỷ lệ tham gia, vắng, bù, kết quả bài tập, nhận xét theo giai đoạn, năng lực theo tiêu chí khóa học, nhận xét tổng kết)** để **đánh giá trọn vẹn một khóa của học viên**.
- Ưu tiên: Must · Loại: FR
- AC1: Given Enrollment khóa SATA 3, Then học bạ tự đổ sẵn số liệu (tỷ lệ tham gia/vắng/bù từ Attendance, kết quả bài tập từ ExamAttempt) + GV nhập phần nhận xét/năng lực theo bộ tiêu chí của Course (tái dùng nền StudentSkillAssessment).
- AC2: Given học viên học 2 khóa, Then 2 học bạ riêng (gắn Enrollment, không gắn chung học viên) (T1).
- Truy vết: SRS §20, §28.8, QĐ-23 SRS · R7b

**US-RC-2** · Là **Quản lý/Đào tạo**, tôi muốn **duyệt và PHÁT HÀNH học bạ — chỉ bản đã phát hành mới hiển thị cho phụ huynh** để **kiểm soát chất lượng trước khi ra ngoài**.
- Ưu tiên: Must · Loại: FR + BR
- AC1: Given học bạ DRAFT/PENDING_REVIEW, Then PH KHÔNG thấy trên portal (T4); When duyệt + phát hành, Then PH thấy + nhận thông báo "Học bạ được phát hành" (event).
- AC2: Given học bạ đã phát hành, When cần sửa, Then thu hồi→sửa→phát hành lại, có log (T9); xuất PDF tái dùng lib/pdf.
- Truy vết: SRS §20, §23, §28.8 · R7b

## EPIC EVAL — Đánh giá GV (học viên) + khảo sát trung tâm (PH) với form builder giới hạn (SRS §21 + QĐ-O3 · R7b)

**US-EVAL-1** · Là **Admin**, tôi muốn **tự cấu hình bộ câu hỏi cho từng đợt đánh giá/khảo sát với đúng 4 loại câu hỏi: thang mức 1–5 sao, radio, checkbox, textbox** để **đổi câu hỏi theo từng kỳ mà không cần dev** (QĐ-O3).
- Ưu tiên: Must · Loại: FR
- AC1: Given Admin tạo form gồm 1 câu 5-sao + 1 radio (4 phương án) + 1 checkbox (5 phương án) + 1 textbox, Then form render đúng trên portal; loại câu hỏi ngoài 4 loại → không tồn tại lựa chọn (inverse — IR-2 cập nhật).
- AC2: Given form dùng cho trẻ nhỏ, Then câu thang mức hiển thị dạng biểu tượng cảm xúc/sao đơn giản (SRS §21.1).
- AC3: Given form đã có người trả lời, When Admin sửa câu hỏi, Then chặn sửa phá vỡ dữ liệu (chỉ cho nhân bản thành đợt mới) (T7).
- Truy vết: SRS §21.1–21.2, QĐ-27 SRS · QĐ-O3 · R7b

**US-EVAL-2** · Là **Học viên (trong profile con)**, tôi muốn **đánh giá giáo viên đang/đã dạy mình theo đợt (giữa/cuối khóa), mỗi đợt 1 lần** để **phản hồi trực tiếp về người dạy tôi**.
- Ưu tiên: Must · Loại: FR
- AC1: Given đợt đánh giá mở cho lớp của con, When vào profile học viên → mục Đánh giá GV, Then chỉ thấy GV đang/đã dạy mình (gắn Enrollment + lớp + GV); GV chưa từng dạy → không xuất hiện (T2).
- AC2: Given đã gửi đánh giá trong đợt, When gửi lại, Then chặn trùng theo (đợt × enrollment × GV) (T6).
- AC3: Given kết quả, Then GV chỉ xem TỔNG HỢP nếu được phân quyền; QL/Admin xem chi tiết; kết quả vào báo cáo trung tâm + hồ sơ chất lượng GV (T4).
- Truy vết: SRS §21.1, §28.8, QĐ-24/27 SRS · R7b

**US-EVAL-3** · Là **Phụ huynh**, tôi muốn **làm khảo sát đánh giá trung tâm/cơ sở con đang học khi có đợt mở** để **góp ý chất lượng chăm sóc, cơ sở vật chất, lịch học**.
- Ưu tiên: Must · Loại: FR
- AC1: Given đợt khảo sát mở cho CS1, Then chỉ PH có con đang học CS1 nhận được (đủ điều kiện); PH cơ sở khác không thấy (T5).
- AC2: Given PH hoàn thành, Then chống gửi trùng theo đợt; kết quả tổng hợp vào báo cáo chất lượng trung tâm.
- Truy vết: SRS §21.2, §28.8, QĐ-25 SRS · tái dùng Survey/SurveyResponse · R7b

## EPIC NOTIF — Thông báo (SRS §23 · R7a/R7b theo module nguồn)

**US-NOTIF-1** · Là **Phụ huynh/nhân sự liên quan**, tôi muốn **nhận thông báo in-app + email cho đủ 17 sự kiện của SRS §23** để **không bỏ lỡ việc của con/lớp**.
- Ưu tiên: Must · Loại: FR + NFR(ops)
- AC1: Given từng sự kiện (kích hoạt, xếp lớp trải nghiệm/chính thức, đổi lịch/GV/phòng, bài tập mới/sắp hết hạn, nhận xét, vắng, học bù đề xuất/xác nhận, thanh toán xác nhận, nhắc nợ, quá hạn, học bạ phát hành, khảo sát mở), Then có notification in-app (+email theo loại); danh sách 17 trigger là checklist nghiệm thu từng dòng trong ticket.
- AC2: Given handler lỗi/chạy lại, Then không gửi trùng (DomainEvent idempotent — T6/T8); mọi side-effect notify nằm NGOÀI transaction nghiệp vụ (Doc 15 Q4).
- Truy vết: SRS §23 · Doc 15 §4.5 · trải theo epic nguồn R7a/R7b

## EPIC RPT — Báo cáo (SRS §24 · R7b, sau khi module nguồn xong)

**US-RPT-1** · Là **QL cơ sở/Admin**, tôi muốn **báo cáo Lead + lớp trải nghiệm (lead nhiều con, tỷ lệ xếp học thử, tỷ lệ đủ N buổi, tỷ lệ học thử→đăng ký, thời gian trung bình lead→đăng ký, chuyển đổi theo lớp/GV/Sale)** để **đo hiệu quả phễu trải nghiệm**.
- Ưu tiên: Must · Loại: FR
- AC1: Given dữ liệu trial + convert, Then các tỷ lệ tính đúng theo định nghĩa SRS §24.1–24.2 (Vitest cho công thức); user CS1 chỉ thấy số CS1 (T5).
- Truy vết: SRS §24.1–24.2, §28.10 · R7b

**US-RPT-2** · Là **Đào tạo**, tôi muốn **báo cáo đào tạo: chương trình nháp/xuất bản, buổi thiếu SCORM, buổi thiếu bài tập, phiên bản SCORM, tỷ lệ hoàn thành nội dung lớp, kết quả bài tập theo buổi/khóa, học bạ đã/chưa phát hành** để **biết nội dung nào đang hổng**.
- Ưu tiên: Should · Loại: FR
- AC1: Given chương trình 48 buổi có 3 buổi chưa gắn SCORM, Then báo cáo liệt kê đúng 3 buổi đó (T1).
- Truy vết: SRS §24.5, §28.10 · R7b

**US-RPT-3** · Là **Ban điều hành**, tôi muốn **báo cáo học viên / lớp học / tài chính / trung tâm theo SRS §24.3–24.7, đúng phạm vi vai trò và cơ sở** để **điều hành bằng số liệu**.
- Ưu tiên: Should · Loại: FR + NFR(T5)
- AC1: Given role HO xem toàn hệ thống, QL CS chỉ cơ sở mình (scopedDb); báo cáo nặng dùng snapshot/cache (§27.2).
- Truy vết: SRS §24.3–24.7, §28.10 · R7b

---

## Traceability 2 chiều — SRS v3.1 ↔ User Stories

| SRS | Module | US |
|---|---|---|
| §5 (5.1–5.2) | Lead & LeadChild | US-LEAD-1, US-LEAD-2 |
| §6 | Lớp trải nghiệm | US-TRIAL-1…5 |
| §7 | Trạng thái Lead | US-LEAD-3, US-TRIAL-5 |
| §8 (8.1–8.7) | Convert | US-CONV-1…6 |
| §9 | Khóa học & giá | US-CRS-1…3 |
| §10 (10.1–10.5) | Thanh toán & công nợ | US-PAY-1…4 |
| §11 | Khung chương trình | US-PROG-1…3, US-CRS-3 |
| §12 | SCORM | US-SCORM-1…4 |
| §13 | Bài tập | US-HW-1…4 |
| §14 | Lớp chính thức | US-CLASS-1…3 |
| §15 | Gán học viên | US-CLASS-4 |
| §16 | GV vận hành buổi | US-SESS-1…2 |
| §17 | Điểm danh & học bù | US-MKP-1…3 |
| §18 | Portal | US-PORTAL-1…2, US-HW-4 |
| §19 | Hình ảnh lớp | US-MEDIA-1…3 |
| §20 | Học bạ | US-RC-1…2 |
| §21 | Đánh giá & khảo sát | US-EVAL-1…3 |
| §22 | Trạng thái HV/Enrollment | US-LEAD-3 (lead) + gap 2.X (enum — ticket kỹ thuật, không cần US riêng) |
| §23 | Thông báo | US-NOTIF-1 |
| §24 | Báo cáo | US-RPT-1…3 |
| §26 | Quy tắc dữ liệu | nhúng trong AC: US-CONV-1/3/4/6, US-CRS-2, US-PAY-1/3, US-CLASS-1/4 |
| §27 | NFR | nhúng AC các US + gap BA#05 mục 3 |
| §28 | Tiêu chí nghiệm thu | mỗi US ghi §28.x tương ứng ở dòng Truy vết |
| §2 Satacoin | PENDING | không có US (schema-only — gap 2.X) |

**Tổng: 40 user stories / 17 epic.** Chiều ngược (US → SRS): xem dòng "Truy vết" trong từng story.

---

## Checklist chất lượng bộ yêu cầu (theo `00-tieu-chuan-phan-tich-yeu-cau.md`)

- [x] Mọi US atomic, testable (AC Given/When/Then), in-scope, traceable 2 chiều
- [x] Phủ exception/boundary: chặn convert (T2/T7), sức chứa (T3), trùng đợt đánh giá (T6), xung đột parent (T7), buổi hủy (T3)
- [x] Inverse requirements khai báo rõ (đầu file)
- [x] FR + NFR đủ 5 nhóm (security/PII, performance/job, usability/autosave/375px, ops/notify idempotent, reliability/rollback)
- [x] TBD có owner + hạn: TBD-1 (XĐ-8 — TGĐ, lúc duyệt file này), TBD-2/4 (Tech Lead, lúc viết ticket), TBD-3 (TGĐ, trước R7)
- [x] Guardrails: scopedDb/RBAC động/privacy trẻ em/atomic-vs-event/API contract — nhúng trong AC; không vi phạm scope ĐÃ LOẠI (không face-detect, không tracking SCORM theo HV, không student login riêng)
