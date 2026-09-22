# Hướng dẫn quy trình thao tác theo từng role

> Tài liệu vận hành + test tay trên **site test (DB dev đã seed full 23/07/2026)**.
> Mọi account bên dưới dùng chung mật khẩu **`Test@1234`**.
> Cập nhật: 23/07/2026 · Nguồn quyền: `lib/auth/permissions.ts` (matrix v1) + seed RBAC v2.

---

## 0. Tổng quan hệ thống

### 0.1. Các site & đường vào

| Site | Prod host | Dev (localhost:3000) | Dành cho |
|---|---|---|---|
| Public | `satarobo.vn` | `/` | Khách, phụ huynh chưa đăng nhập |
| Admin CMS | `admin.satarobo.vn` | `/admin` | Toàn bộ nhân sự nội bộ |
| Portal phụ huynh | `hocvien.satarobo.vn` | `/portal` | PARENT |
| Site giáo viên | `giaovien.satarobo.vn` | `/teacher` | TEACHER (flag `TEACHER_SITE_ENABLED`) |

- Đăng nhập chung tại `/login`, hệ thống tự điều hướng theo role.
- **Mẹo test nhiều role song song trên dev:** cookie tách theo host — mở đồng thời `localhost:3000` (admin), `127.0.0.1:3000` (giáo viên), `192.168.98.183:3000` (phụ huynh); mỗi host đăng nhập 1 account khác nhau.

### 0.2. Bảng account test theo role (đều `Test@1234`)

| Role | Account đề xuất | Ghi chú scope |
|---|---|---|
| SUPER_ADMIN | `admin.local@satarobo.vn` | Toàn hệ thống |
| CENTER_MANAGER | `nv.ban_giam_doc.01@seed.satarobo.test` (CS1) · `nv.ban_giam_doc.02@...` (CS2) | Theo cơ sở |
| SALES_CSM | `nv.kinh_doanh.01@seed.satarobo.test` (CS1) · `hosale.seed@satarobo.vn` (HO_SALE, chỉ xem) | Lead của mình / cơ sở |
| TEACHER | `giaovien.test@satarobo.vn` (Thầy Nam, CS1) · `trogiang.seed@satarobo.vn` (trợ giảng) | Lớp được phân công |
| TRAINING (Đào tạo) | `nv.dao_tao.01@seed.satarobo.test` | Nội dung học liệu toàn hệ thống |
| HR | `nv.hanh_chanh_nhan_su.01@seed.satarobo.test` | Nhân sự toàn hệ thống |
| ACCOUNTANT | `nv.ke_toan.01@seed.satarobo.test` (HO) · `ketoan.cs1.seed@satarobo.vn` (CS1) | Tài chính |
| MARKETING | `nv.marketing.01@seed.satarobo.test` | Nội dung public + lead |
| PARENT | `phuhuynh.test@satarobo.vn` (Chị Hương, 2 con) · `ph.00001@seed.satarobo.test` | Chỉ con của mình |

### 0.3. Nguyên tắc quyền cần nhớ khi test

- **Cách ly cơ sở (scopedDb):** user gắn CS1 không thấy dữ liệu CS2 (lớp, học viên, buổi học, điểm danh…). SUPER_ADMIN và các role HO thấy tất cả.
- **ALLOW thắng:** user nhiều role = hợp (union) quyền của các role.
- **Field-level:** lương chỉ SUPER_ADMIN/HR/ACCOUNTANT; thông tin cá nhân nhân viên chỉ SUPER_ADMIN/HR; TEACHER không xem được liên hệ phụ huynh.
- Hết hạn/không đủ quyền → hệ thống redirect về dashboard hoặc báo "Không có quyền" — đây là hành vi đúng, không phải bug.

---

## 1. SUPER_ADMIN — Quản trị hệ thống

Toàn quyền mọi module. Ngoài các quy trình của những role bên dưới (đều làm được), các việc **chỉ SUPER_ADMIN**:

### 1.1. Quản lý tài khoản & phân quyền
1. `/admin/users` → **Tạo tài khoản**: nhập email, tên, chọn role (có thể nhiều role), cơ sở → Lưu.
2. `/admin/roles` → xem/sửa RoleDef + RolePermission (RBAC v2). Mỗi thay đổi role **bắt buộc nhập lý do** (ghi audit).
3. Gán quyền lẻ per-user (ALLOW/DENY grant) tại trang chi tiết user.
4. Khóa tài khoản: `/admin/users` → chọn user → Vô hiệu hóa (không xóa cứng).

### 1.2. Cấu hình hệ thống
1. `/admin/centers` → sửa thông tin cơ sở (chỉ SUPER_ADMIN sửa được).
2. `/admin/settings` + `/admin/cau-hinh-van-hanh` → tham số vận hành.
3. `/admin/payment-methods` → cấu hình phương thức thu.
4. `/admin/tich-hop` → tích hợp ngoài (Meta, GA4…).

### 1.3. Giám sát
1. `/admin/audit-log` → tra cứu ai-làm-gì-khi-nào (lọc theo user/action/thời gian).
2. `/admin/compliance`, `/admin/canh-bao-rui-ro` → cảnh báo rủi ro.
3. Sửa **mã học viên** (`students:change-code`) — chỉ SUPER_ADMIN, có audit + lý do.

---

## 2. CENTER_MANAGER — Quản lý cơ sở

Đăng nhập → tự vào `/admin/dashboard` (KPI cơ sở mình: doanh thu/mục tiêu, KH mới, học thử hôm nay, GV hôm nay, công nợ).

### 2.1. Mở lớp mới (quy trình chuẩn)
1. `/admin/classes` → **Tạo lớp**: chọn khóa học, giáo trình, cơ sở, phòng (`/admin/rooms` phải còn ACTIVE), lịch tuần (thứ + giờ), sĩ số tối thiểu/tối đa, ngày khai giảng.
2. Gán giáo viên + trợ giảng cho lớp.
3. Lưu → hệ thống sinh buổi học theo lịch tuần (tự né ngày trong `/admin/holidays`).
4. Kiểm tra `/admin/sessions` lọc theo lớp — đủ số buổi, đúng thứ/giờ.
5. Ghi danh học viên (mục 2.2) đủ sĩ số tối thiểu → chuyển trạng thái lớp sang đang học.

### 2.2. Ghi danh / chuyển lớp / bảo lưu
1. `/admin/enrollments` → **Ghi danh**: chọn học viên + lớp. Hệ thống chặn: khác cơ sở, hoặc học viên đang có ghi danh ACTIVE/STUDYING ở lớp khác (cùng khóa → dùng **Chuyển lớp**; khác khóa → phải hoàn thành/rút trước).
2. Chuyển lớp: `/admin/chuyen-lop` → chọn học viên, lớp đích (cùng khóa) → xác nhận.
3. Bảo lưu/rút: sửa trạng thái ghi danh tại trang chi tiết (PAUSED/WITHDRAWN) kèm lý do.
4. Hủy lớp: vào trang sửa lớp → khu **Hủy lớp** (nhập lý do ≥ 5 ký tự) — hệ thống tự hủy buổi tương lai + nhu cầu học bù liên quan. Không đổi trạng thái CANCELLED qua dropdown thường.

### 2.3. Vận hành hằng ngày
1. **Điểm danh giám sát:** `/admin/attendance` → chọn lớp/buổi → xem hoặc sửa hộ GV.
2. **Học bù:** `/admin/hoc-bu` → danh sách HV vắng có nhu cầu bù → chọn buổi bù gợi ý (được phép liên cơ sở) → xếp.
3. **Duyệt media lớp:** `/admin/media` → duyệt/từ chối ảnh GV upload (chỉ ảnh duyệt mới hiện portal).
4. **Duyệt hoàn thành khóa:** `/admin/hoan-thanh-khoa` → duyệt đề xuất của GV → sinh chứng nhận.
5. **Duyệt học bạ:** `/admin/report-cards` (quyền review) + `/admin/hoc-ba`.
6. **Duyệt đề xuất sửa giáo án** của GV (lesson-change) và phản hồi.
7. **Lịch nghỉ:** `/admin/holidays` → thêm ngày nghỉ (toàn hệ thống hoặc riêng cơ sở) → buổi học trùng ngày tự dời.

### 2.4. Phân bổ lead & nhân sự cơ sở
1. `/admin/leads` → xem toàn bộ lead cơ sở → **Phân công** cho sale (`leads:assign`).
2. `/admin/ban-giao-lead` → bàn giao lead giữa các sale.
3. `/admin/nhan-su` → xem/sửa hồ sơ nhân viên cơ sở (không thấy lương).
4. `/admin/bao-cao` → báo cáo tổng hợp cơ sở.

---

## 3. SALES_CSM — Tư vấn tuyển sinh & CSKH

Phễu chuẩn SR.QD.217: **L1 (lead mới) → L2 (đã tư vấn/hẹn) → L3 (học thử) → Convert (ghi danh)**.

### 3.1. Tiếp nhận & chăm sóc lead
1. `/admin/leads` → chỉ thấy **lead của mình** (view-own). Tạo lead mới: nhập tên PH, SĐT, con (tên/tuổi), nguồn (Messenger/Form/Hotline), quan tâm khóa nào.
2. Import hàng loạt: `/admin/leads/import` → tải file mẫu `mau-lead-v2.xlsx` → điền → upload → sửa lỗi dòng đỏ (nếu có) → xác nhận.
3. Cập nhật sau mỗi lần chăm sóc: mở lead → thêm ghi chú tư vấn + đổi trạng thái + đặt lịch hẹn gọi lại.
4. `/admin/cham-soc-hv` → chăm sóc học viên hiện hữu (tái tục, upsell).

### 3.2. Xếp học thử (trial)
1. Từ lead → **Đăng ký học thử**: chọn lớp thử tại `/admin/trial-classes` (hoặc buổi trial của lớp thật) còn chỗ.
2. Sau buổi thử: xem feedback GV tại `/admin/trials` → gọi chốt với PH.
3. Nếu PH đồng ý → mục 3.3. Nếu không → cập nhật trạng thái lý do từ chối.

### 3.3. Convert: tạo học viên + đơn hàng + thu tiền
1. `/admin/students` → **Tạo học viên** từ lead (mã HV tự sinh dạng `CSx-YY-XXXX`), khai thông tin PH + `StudentConsent` (đồng ý dùng ảnh).
2. `/admin/orders` → tạo đơn: chọn khóa/gói (`/admin/course-packages`), áp voucher nếu có (`/admin/vouchers` — kiểm tra hạn/điều kiện) → ra giá cuối.
3. `/admin/payments` → **Ghi nhận thanh toán** (`payments:record`): số tiền, phương thức, ngày. ⚠️ Sale chỉ *ghi nhận* — **xác nhận** cuối là Kế toán (mục 7.2).
4. Ghi danh vào lớp (mục 2.2 — sale có quyền `enrollments:create`).
5. ⚠️ Hệ thống **chặn convert khi chưa thanh toán đủ điều kiện** (QĐ R7).

### 3.4. Xử lý yêu cầu phụ huynh
1. `/admin/parent-requests` → danh sách yêu cầu từ portal (nghỉ phép, đổi lịch, hỏi đáp, khiếu nại).
2. Mở yêu cầu → xử lý → nhập nội dung phản hồi → đổi trạng thái Đã xử lý (PH thấy ngay trên portal).
3. SLA nội bộ: yêu cầu treo > 12h sẽ hiện cảnh báo trên dashboard QL.

---

## 4. TEACHER — Giáo viên (site `giaovien.` / `/teacher`)

Trang chủ `/teacher` = việc-chưa-xong: buổi chưa chốt, bài chưa chấm, nhận xét chưa gửi.

### 4.1. Một buổi dạy chuẩn (quy trình quan trọng nhất)
1. `/teacher/lich` → xem lịch dạy hôm nay (buổi, phòng, lớp).
2. Vào lớp: `/teacher/lop` → chọn lớp → tab buổi hôm nay.
3. **Điểm danh** (`/teacher/diem-danh` hoặc trong Class Hub): tick Có mặt/Vắng từng HV; nút "Tất cả có mặt" rồi sửa lẻ. HV vắng → chọn lý do + đánh dấu cần học bù (sinh MakeupNeed cho QL xếp).
4. **Ghi chú buổi + nhận xét**: điền phiếu nhận xét buổi (rubric) tại `/teacher/nhan-xet`.
5. **Ảnh lớp:** `/teacher/anh-lop` → upload ảnh buổi học (chỉ HV có consent; ảnh chờ QL duyệt mới đến PH).
6. **Chốt buổi:** bấm "Hoàn tất buổi" trên card lịch dạy → buổi khóa lại. Cron nhắc nếu quên chốt.
7. Cần sửa giáo án → "Đề xuất sửa giáo án" trên card buổi → chờ QL/Đào tạo duyệt.

### 4.2. Giao bài & chấm bài
1. `/teacher/kho-bai-tap` → chọn mẫu bài tập có sẵn (theo giáo trình) → **Giao cho lớp** (mỗi mẫu chỉ sinh 1 bài/lớp) hoặc tự soạn bài riêng.
2. HV nộp qua portal → `/teacher/cham-bai` → mở bài nộp → chấm điểm + nhận xét → Lưu (PH thấy điểm ngay).
3. Chấm thi: bài thi tự luận trong kỳ thi được phân công.

### 4.3. Hồ sơ học viên & học bạ
1. `/teacher/hoc-vien` → HV lớp mình (4 tab: hồ sơ / trial / hoàn thành / học bạ). ⚠️ Không thấy SĐT phụ huynh — đúng thiết kế.
2. Cuối kỳ: soạn **học bạ / report card** tại `/teacher/hoc-ba` → gửi duyệt (QL review) → duyệt xong mới đến PH.
3. Hoàn thành khóa: đề xuất tại `/teacher/hoan-thanh` → QL duyệt.
4. Feedback học thử: `/teacher/trial` → chấm rubric buổi thử (đầu vào cho sale chốt).

### 4.4. Hành chính GV
1. `/teacher/don-tu` → tạo đơn (nghỉ phép, đổi buổi, dạy thay… 10 loại) → theo dõi trạng thái duyệt.
2. `/teacher/bang-cong` → xem công dạy của mình.
3. `/teacher/tai-lieu` + `/teacher/scorm` → tài liệu giảng dạy theo buổi của lớp mình.

---

## 5. TRAINING — Đào tạo (học liệu, đề thi)

Role duy nhất (ngoài SUPER_ADMIN) được **tạo/sửa** giáo trình, câu hỏi, đề thi, tài liệu.

### 5.1. Dựng giáo trình
1. `/admin/courses` → tạo/sửa khóa học.
2. `/admin/curriculums` → tạo giáo trình theo khóa, thêm **bài học (Lesson)** theo buổi: tiêu đề, mục tiêu, học cụ.
3. `/admin/documents` → upload slide/tài liệu gắn vào bài học.
4. `/admin/scorm` → upload gói SCORM (đợi xử lý; quá 15 phút chưa xong = lỗi, upload lại).
5. `/admin/course-prerequisites` → khai điều kiện tiên quyết giữa các khóa.
6. `/admin/teaching-materials` → soạn học liệu giảng dạy theo buổi.

### 5.2. Ngân hàng câu hỏi & đề thi
1. `/admin/questions` → soạn câu hỏi (trắc nghiệm/đúng-sai/tự luận ngắn) gắn giáo trình. Import: `/admin/questions/import` với `mau-ngan-hang-cau-hoi-v2.xlsx`.
2. `/admin/exams` → tạo đề: chọn câu hỏi từ ngân hàng, điểm từng câu → gắn lớp/kỳ thi → **PUBLISHED** mới đến HV. Import Word: `/admin/exams/import-word` (`mau-de-thi-word-v2.docx`).
3. Sau thi: GV chấm phần tự luận; xem kết quả tổng hợp.

### 5.3. Mẫu bài tập & duyệt giáo án
1. `/admin/assignments` → soạn **mẫu bài tập (template)** theo giáo trình để GV lấy giao lớp; theo dõi bài đã giao.
2. Duyệt "Đề xuất sửa giáo án" từ GV (lesson-change:approve) — duyệt/từ chối kèm phản hồi.
3. `/admin/evaluations` + `/admin/khao-sat` → quản lý form đánh giá buổi học, khảo sát.

---

## 6. HR — Hành chính nhân sự

### 6.1. Hồ sơ nhân viên
1. `/admin/nhan-su` → tạo hồ sơ nhân viên mới: thông tin cơ bản, liên hệ, phòng ban, cơ sở, loại phân công (chính thức/kiêm nhiệm…). Import: `mau-nhan-vien-v2.xlsx`.
2. HR xem được đủ 4 nhóm field (basic/contact/salary/personal) — các role khác bị che bớt, đúng thiết kế.
3. Nghỉ việc: đổi trạng thái + ngày hiệu lực (không xóa cứng — chỉ SUPER_ADMIN xóa).
4. ⚠️ Tạo **account đăng nhập** cho nhân viên là việc của SUPER_ADMIN (`users:manage`) — HR tạo hồ sơ, rồi báo admin cấp account.

### 6.2. Tuyển dụng & chấm công
1. `/admin/jobs` → đăng tin tuyển dụng (hiện public site `/tuyen-dung`) → sửa/đóng tin.
2. `/admin/cham-cong` → theo dõi công; đối chiếu bảng công GV.
3. Duyệt đơn từ nhân viên (nghỉ phép…) trong luồng WorkRequest.
4. `/admin/honors` → vinh danh nhân viên (lưu ý: mục vinh danh public đang ẩn có chủ đích).

---

## 7. ACCOUNTANT — Kế toán

### 7.1. Đơn hàng & doanh thu
1. `/admin/orders` → xem toàn bộ đơn; sửa/hủy đơn (`orders:manage`).
2. `/admin/products` + `/admin/course-packages` → quản lý bảng giá gói.
3. `/admin/vouchers` → tạo/khóa voucher, kiểm soát điều kiện áp dụng.

### 7.2. Thu tiền & xác nhận (checkpoint của kế toán)
1. `/admin/payments` → danh sách thanh toán do sale ghi nhận → đối chiếu chứng từ → **Xác nhận** (`payments:confirm` — chỉ SUPER_ADMIN/ACCOUNTANT).
2. Sau xác nhận: hệ thống sinh **phiếu thu (Receipt)**; đơn nhiều ghi danh được chia theo `finalPrice` (FIN-01).
3. `/admin/cong-no` → theo dõi công nợ; đôn đốc qua sale/QL.
4. Trả góp: duyệt kỳ trả góp (`installments:approve`).

### 7.3. Hoàn tiền & lương
1. `/admin/hoan-tien` → tiếp nhận yêu cầu hoàn (HV rút…) → tính số hoàn → duyệt → phiếu chi. Kiểm tra số dư 3 màn (đơn/portal/công nợ) khớp nhau.
2. Payroll: xem + chốt lương (`payroll:edit` — chỉ SUPER_ADMIN/ACCOUNTANT; HR chỉ xem).
3. `/admin/inventory` → tham gia kiểm kê kho học cụ (`inventory:audit`).

---

## 8. MARKETING

### 8.1. Nội dung public site
1. `/admin/news` → viết tin tức/blog → **Publish** (hiện `/tin-tuc` public). Xóa tin cần QL/admin.
2. `/admin/site-content` → sửa nội dung landing (hero, section…).
3. `/admin/email-templates` + `/admin/email-logs` → soạn mẫu email, theo dõi gửi.
4. `/admin/khao-sat` + `/admin/parent-feedback` → khảo sát & xem feedback PH.

### 8.2. Lead & chiến dịch
1. `/admin/leads` → Marketing xem **toàn bộ** lead (kể cả tên + SĐT — quyết định 21/07) để chạy outreach; **không** được phân công lead (việc của QL).
2. `/admin/leads/import` → nạp lead từ chiến dịch; `/admin/leads` export để đối soát (⚠️ file export chứa PII — không chia sẻ ra ngoài).
3. `/admin/marketing` + `/admin/crm` → dashboard chiến dịch, ROAS.
4. `/admin/vouchers` → tạo voucher chiến dịch.

---

## 9. PARENT — Phụ huynh (portal `hocvien.` / `/portal`)

### 9.1. Kích hoạt tài khoản (lần đầu)
1. Sale/QL tạo account PH từ trang học viên (gửi OTP kích hoạt qua email/SĐT).
2. PH mở link kích hoạt → nhập OTP → đặt mật khẩu → đăng nhập.
3. Nhà có nhiều con: chọn con đang xem bằng switcher trên đầu trang.

### 9.2. Theo dõi việc học hằng tuần
1. `/portal/lich-hoc` → lịch học của con (buổi tới, phòng, GV); ngày nghỉ hiện rõ.
2. `/portal/hoc-sinh` + `/portal/ho-so-con` → hồ sơ, lớp đang học, chuyên cần.
3. `/portal/hinh-anh` → ảnh lớp (chỉ ảnh đã duyệt).
4. `/portal/nhan-xet` → nhận xét của GV sau mỗi buổi.
5. `/portal/thong-bao` + `/portal/tin-nhan` → thông báo từ trung tâm.

### 9.3. Bài tập, bài thi, kết quả
1. `/portal/bai-tap` → xem bài được giao → nộp bài (text hoặc file) trước hạn → xem điểm + nhận xét sau khi GV chấm.
2. `/portal/bai-thi` → làm bài thi được giao (đề PUBLISHED) → `/portal/ket-qua` xem điểm.
3. `/portal/bai-giang` → nội dung bài học/SCORM được mở cho HV.
4. `/portal/hoc-ba` → học bạ cuối kỳ (sau khi QL duyệt).
5. `/portal/satacoin` → điểm thưởng của con.

### 9.4. Học phí & yêu cầu
1. `/portal/hoc-phi` → công nợ, lịch sử đóng tiền, phiếu thu.
2. `/portal/yeu-cau` → gửi yêu cầu (xin nghỉ, đổi lịch, hỏi đáp, khiếu nại) → theo dõi trạng thái → đọc phản hồi khi trung tâm xử lý xong.
3. `/portal/danh-gia` + `/portal/danh-gia-gv` + `/portal/khao-sat` → đánh giá buổi học/GV, trả lời khảo sát.

---

## 10. Luồng liên-role (E2E) — dùng khi test tổng hợp

### F1. Từ lead đến vào lớp (Sales → Kế toán → QL)
1. **Sales** tạo lead → chăm sóc → xếp học thử.
2. **Teacher** dạy thử + chấm rubric trial.
3. **Sales** chốt → tạo học viên + đơn + ghi nhận thanh toán.
4. **Kế toán** xác nhận thanh toán → phiếu thu.
5. **Sales/QL** ghi danh vào lớp → HV xuất hiện trong danh sách điểm danh của GV, PH thấy lịch học trên portal.

### F2. Buổi học & học bù (Teacher → QL → Parent)
1. **Teacher** điểm danh, đánh vắng 1 HV (cần học bù) → chốt buổi.
2. **QL** vào `/admin/hoc-bu` thấy nhu cầu bù → xếp buổi bù (được liên cơ sở).
3. **Parent** thấy điểm danh vắng + lịch bù trên portal.

### F3. Bài tập trọn vòng (Training → Teacher → Parent)
1. **Training** soạn mẫu bài tập theo giáo trình.
2. **Teacher** giao mẫu cho lớp (1 mẫu/lớp) → PH thấy bài trên portal.
3. **Parent/HV** nộp bài → **Teacher** chấm + nhận xét → **Parent** thấy điểm.

### F4. Yêu cầu phụ huynh (Parent → Sales/QL → Parent)
1. **Parent** gửi yêu cầu trên `/portal/yeu-cau`.
2. **Sales/QL** xử lý trong `/admin/parent-requests`, nhập phản hồi, đóng yêu cầu.
3. **Parent** thấy trạng thái + nội dung phản hồi. (Treo > 12h → cảnh báo dashboard QL.)

### F5. Kết thúc khóa (Teacher → QL → Parent)
1. **Teacher** đề xuất hoàn thành khóa + soạn học bạ.
2. **QL** duyệt hoàn thành + duyệt học bạ → sinh chứng nhận.
3. **Parent** xem học bạ/chứng nhận trên portal; **Sales** nhận danh sách tái tục để tư vấn khóa kế tiếp.

### F6. Kiểm tra cách ly cơ sở (test phân quyền)
1. Đăng nhập `nv.ban_giam_doc.01@...` (CS1) → `/admin/classes` chỉ thấy lớp CS1.
2. Đăng nhập `nv.ban_giam_doc.02@...` (CS2) → không thấy lớp CS1, không mở được URL chi tiết lớp CS1.
3. Đăng nhập `nv.kinh_doanh.01@...` → `/admin/leads` chỉ thấy lead mình được phân.
4. Đăng nhập `hosale.seed@` (HO_SALE) → xem được lead các cơ sở nhưng **không sửa**.

---

## Phụ lục A. File import mẫu (tải trong từng trang import)

| Nghiệp vụ | Trang | File mẫu |
|---|---|---|
| Học viên | `/admin/students/import` | `mau-hoc-vien-v2.xlsx` |
| Lead | `/admin/leads/import` | `mau-lead-v2.xlsx` |
| Lớp học | `/admin/classes/import` | `mau-lop-hoc-v2.xlsx` |
| Nhân viên | `/admin/nhan-su/import` | `mau-nhan-vien-v2.xlsx` |
| Câu hỏi | `/admin/questions/import` | `mau-ngan-hang-cau-hoi-v2.xlsx` |
| Đề thi Word | `/admin/exams/import-word` | `mau-de-thi-word-v2.docx` |
| Cơ sở / Phòng / Lịch nghỉ / Học cụ | trang import tương ứng | `mau-co-so-v2` / `mau-phong-hoc-v2` / `mau-lich-nghi-v2` / `mau-hoc-cu-v2` |

## Phụ lục B. Lưu ý riêng cho môi trường test (DB dev)

- Data seed có **chủ đích chứa edge case**: voucher hết hạn/inactive, đề thi DRAFT/CLOSED/ARCHIVED, bài tập DRAFT, phòng MAINTENANCE, lịch nghỉ riêng từng cơ sở — gặp các bản ghi này là bình thường.
- Dữ liệu seed nhận diện qua tiền tố `SEED-` / id `slms-*` / email `@seed.satarobo.test` — khi dọn dữ liệu test chỉ xóa theo các tiền tố này.
- Buổi học seed cũ có thể rơi Chủ nhật/12:00 — là data test, không phải bug sinh lịch.
- Site GV cần flag `TEACHER_SITE_ENABLED=true` (dev đã bật trong `.env.local`; PROD đang OFF theo kế hoạch 2-phase).
