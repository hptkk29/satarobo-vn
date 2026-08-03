# Checklist nghiệm thu — đợt 01–03/08/2026

> Nghiệm thu trên **test.satarobo.vn** trước khi merge `test` → `main`.
> Phạm vi: 17 commit (PR #81 → #86).
>
> ⚠️ **DB của site test CHÍNH LÀ DB dev** — data nghịch ở đây hiện luôn trên máy
> local và ngược lại. Đừng nhập số liệu thật.

Ký hiệu: **[C]** = ca chốt chặn, đỏ là không được merge. **[P]** = phụ, ghi nhận rồi đi tiếp.

---

## 0. Chuẩn bị (làm một lần, ~15 phút)

- [ ] Có tài khoản test cho 4 vai: **QLCS** (CS1), **Sale** (CS1), **GV** (CS1), **Đào tạo**
- [ ] **Khoá học có GIÁ > 0** — bắt buộc, chốt hàng loạt sẽ từ chối khoá chưa cấu hình giá
- [ ] Có lớp đang mở ở **CS1 và CS2** (cần cả hai để thử cách ly cơ sở)
- [ ] File Excel "khách đã đăng ký" thật của Sale
- [ ] Biết trước: OTP trên test luôn **mô phỏng** — lấy mã ở `/admin/otp-logs`, không có tin Zalo thật

---

## A. Nhập liệu ban đầu

### A1 — Import lead

> ⚠️ **HAI màn import khác nhau, đừng nhầm — nhầm là ra "0 hợp lệ / toàn lỗi":**
> | File | Màn đúng | Tiêu đề cột nó đòi |
> |---|---|---|
> | **Template hệ thống sinh** (3 sheet: Lead · 📖 HƯỚNG DẪN · ✅ VÍ DỤ) — vd `CS2_Lead_Import_v2.xlsx` | `/admin/leads/import` | `Tên phụ huynh · SĐT · Tên con · …` |
> | File thô của Sale (nhiều sheet theo tháng) | `/admin/leads/import/registered` | `Số điện thoại · Họ và Tên học viên` |
>
> **Đã chạy 03/08 với file thật `CS2_Lead_Import_v2.xlsx` (37 dòng):** xem thử báo
> **37 hợp lệ / 0 lỗi / 3 dòng gộp**; ghi vào hệ thống ra **6 tạo mới + 31 dòng trùng
> đã có sẵn** (dữ liệu này đã nhập từ 07/07 nên gộp là đúng, không đẻ lead trùng).
> Hệ thống cũng tự cảnh báo ca đáng ngờ: dòng 21–22 **cùng số `0905090762` nhưng khác
> tên phụ huynh** → cần xác minh trước khi chạy trên prod (hiện sẽ gộp thành 1 lead).

- [ ] Upload file .xlsx nhiều sheet → bấm **Xem thử** (không được ghi gì ở bước này)
- [ ] Bảng xem thử hiện: sẽ tạo / sẽ gộp / lỗi dòng / ngoài phạm vi cơ sở
- [ ] Bấm **Ghi** → lead hiện ở `/admin/leads` trạng thái **Đã đăng ký**
- [ ] **[C]** Upload lại **đúng file đó** lần 2 → kết quả "không đổi", **không** tạo lead trùng
- [ ] Sau khi ghi có link **"Bước tiếp theo: chốt hàng loạt →"**

### A2 — Chốt hàng loạt · `/admin/leads/bulk-convert`
- [ ] **[C]** Đăng nhập bằng **Sale** → **không thấy** nút "Chốt hàng loạt" ở `/admin/leads`, gõ thẳng URL thì bị đá về `/leads`
- [ ] Đăng nhập QLCS → thấy danh sách lead "Đã đăng ký", mỗi dòng là 1 học viên
- [ ] Dropdown lớp chỉ hiện lớp **cùng cơ sở** với lead và **đúng khoá** con đó quan tâm
- [ ] Nút **"Gán lớp nhanh"** áp cho các em chưa gán, không đè lên lựa chọn đã có
- [ ] Chốt 2–3 lead có nhập **"Đã đóng"** → mở `/admin/orders`: có đơn, có khoản thu, **công nợ = phần còn thiếu** (không phải 0, không phải nguyên giá)
- [ ] Chốt 1 lead **bỏ trống ô tiền** → vẫn chốt được, không có khoản thu nào bịa ra
- [ ] Học viên hiện ở `/admin/students`, ghi danh đúng lớp đã chọn
- [ ] **[C]** Bấm chốt lại các lead vừa xong → báo "đã chốt trước đó", **không** tạo học viên/đơn trùng
- [ ] **[P]** Lead có SĐT bàn (02363…) → báo lỗi rõ, không chốt
- [ ] **[P]** Lead chưa gắn cơ sở → báo lỗi rõ
- [ ] **[P]** Chọn lớp khác cơ sở với lead → bị chặn

### A3 — Tài khoản phụ huynh · `/admin/students/tai-khoan`
- [ ] Thấy đúng những phụ huynh vừa tạo ở A2, trạng thái **Chờ kích hoạt**
- [ ] Cột "ZNS báo cấp TK" hiện **"Mẫu chưa cấu hình"** (đúng — 616899 chưa duyệt)
- [ ] Bấm **Xuất CSV** → tải được file có tên, SĐT, tên học viên
- [ ] Bấm **Gửi lại OTP** → báo thành công (hoặc cảnh báo có đường thoát), mã xem ở `/admin/otp-logs`
- [ ] **[C]** Đăng nhập **QLCS cơ sở khác** → **không** thấy phụ huynh của cơ sở này

### A4 — Phụ huynh kích hoạt · `satarobo.vn/kich-hoat`
- [x] Mở link trên **domain chính** (không phải hocvien.*) → trang hiện ra
- [x] Nhập **SĐT** phụ huynh → form sang bước OTP + đặt mật khẩu, có đếm ngược gửi lại
- [ ] Nhập mã → **đặt mật khẩu** *(người dùng tự làm — không nhập hộ mật khẩu)*
- [ ] **[C]** Đăng nhập portal bằng **SĐT + mật khẩu vừa đặt** → vào được, thấy đúng con mình

> ⚠️ **Trên `test` KHÔNG lấy mã qua Zalo được.** Chạy 03/08: `OtpRequest` sinh đúng
> (kênh ZALO, hạn 5 phút) nhưng `OtpDeliveryLog` = **FAILED · `ZNS_ERROR:ZALO_NOT_CONFIGURED`**
> — creds Zalo chỉ có ở Production. Màn kích hoạt vẫn báo "đã gửi mã" (cố ý, chống
> dò tài khoản), nên **muốn biết tin có đi hay không phải xem `/admin/otp-logs`**.
> Mã cũng lưu dạng hash ⇒ không đọc ngược được từ DB.
>
> **Đường lấy mã trên test (và cả trên prod khi ZNS chết):** hồ sơ học viên →
> **Cấp mã tại quầy** → nhập lý do ≥10 ký tự → mã hiện **một lần** trên màn hình,
> ghi AuditLog kèm lý do, kênh ghi `OFFLINE` nên không tính vào SLO gửi tin.
> Đã chạy thử đường này 03/08: ra mã 6 số bình thường.
>
> **Chuỗi đã dựng sẵn để nghiệm thu:** đơn `ORD-260803-000003` (Sata3, 7.920.000đ,
> SĐT `0328545229`) → xác nhận đơn → **hệ thống tự cấp tài khoản PH** (role PARENT,
> `Chờ kích hoạt`) → tạo HV *Be Nghiem Thu A4* → bấm **Cấp tài khoản phụ huynh** trên
> hồ sơ HV thì nó **dùng lại đúng tài khoản cũ** ("liên kết 1 con") chứ không đẻ tài
> khoản thứ hai — nhờ `canonicalPhone` nên `0328545229` và `84328545229` là một.

---

## B. Đơn hàng · thanh toán

### B1 — Tạo đơn · `/admin/orders/new`
- [ ] **[C]** **Không còn ô "Mã voucher"** trên form
- [ ] **[C]** Vào thẳng `/vouchers` → **404** (hệ mã khuyến mãi đã gỡ)
- [ ] Chọn loại đơn Khoá học → chọn đúng khoá → giá tự điền
- [ ] Chọn **Giảm theo số tiền**, nhập số → tổng tự trừ
- [ ] Chuyển sang **Giảm theo %**, nhập 10 → tổng tự tính lại
- [ ] **[C]** Có giảm giá mà **bỏ trống giải trình** → không tạo được đơn, báo lỗi rõ
- [ ] Tạo xong: đơn ở trạng thái **chờ duyệt giảm giá**

### B2 — Duyệt giảm giá
- [ ] Đăng nhập **QLCS** → mở đơn → thấy nút **Duyệt / Từ chối** giảm giá
- [ ] Duyệt → đơn hết trạng thái chờ duyệt
- [ ] **[P]** Từ chối mà không nhập lý do → bị chặn

> Nếu QLCS **không thấy nút duyệt**: đó là do quyền `discounts:approve` chưa seed lên
> môi trường đó — xem mục F, không phải lỗi code.

### B3 — Kế hoạch 2 đợt + phiếu thu
- [ ] Trên đơn, lập kế hoạch **2 đợt** (đợt 1 + đợt 2 + ngày hẹn)
- [ ] **[C]** Kế hoạch **chưa duyệt** → màn đơn chỉ có **1 dòng "Thu toàn bộ đơn"**, kèm câu giải thích vì sao chưa có tuỳ chọn theo đợt
- [ ] QLCS **duyệt kế hoạch** → xuất hiện **2 dòng phiếu thu**: `Đợt 1/2 — số tiền — hạn — Chưa thu`
- [ ] **[C]** Đợt 1 ở trạng thái **chưa thu** (không tự nhảy "đã thu")

### B4 — Xuất QR theo đợt
- [x] Bấm **Xuất QR** trên dòng **Đợt 1** → hiện QR
- [x] **[C]** QR ghi rõ **"Đợt 1: <số tiền đợt 1>"** — **không phải tổng đơn**. *(Đây chính là bug gốc.)*
- [x] Có **đồng hồ đếm ngược** và dòng nhắc *"QR hết hạn vẫn nhận được tiền"*
- [x] Bấm **Xuất QR** lần nữa ngay → **không** đẻ mã thứ hai, trả lại đúng mã đang sống
- [x] Bấm **Tạo lại QR** vài lần → mã mới, nhưng nội dung chuyển khoản (định danh đợt) **không đổi**
- [x] **[P]** Phiếu đã thu đủ → nút Xuất QR bị chặn

> **Đã chạy 03/08 trên `test.satarobo.vn`** — đơn `ORD-260803-000002` (7.128.000đ, 2 đợt
> 4.000.000 + 3.128.000). QR đợt 1 in **"Đợt 1/2: 4.000.000đ"**, nội dung CK
> `ORD260803000002D1`; đợt 2 in **3.128.000đ** / `…D2`. Sau nhiều lượt bấm + 1 lượt
> "Tạo lại QR": đợt 1 có 2 phiên (1 EXPIRED + **đúng 1 ACTIVE**), `matchKey` không đổi;
> dòng "Thu toàn bộ đơn" đã VOID nên **không có nút Xuất QR** (ca chặn). Ca phiếu đã
> PAID và ca bấm 2 lần trả lại đúng phiên cũ do test tự động phủ
> (`tests/e2e/r7/qr-session.spec.ts` QR-02, QR-04).
>
> ⚠️ Trước khi bấm được, phải nhập **tài khoản nhận tiền của cơ sở** ở `/admin/tich-hop`
> → VietQR. Chưa nhập thì nút báo *"Chưa cấu hình tài khoản nhận tiền cho cơ sở này"*.

### B5 — Biến động số dư · `/admin/bien-dong-so-du`
- [ ] Vào được từ sidebar nhóm **Tài chính**
- [ ] 3 tab: Tất cả / Cần xử lý / Đã khớp
- [ ] Có khu **"Tiền thừa chưa xử lý"** và khu log SePay cũ bên dưới
- [ ] **Bảng trống là ĐÚNG** ở giai đoạn này — `SEPAY_WEBHOOK_API_KEY` đang gỡ nên chưa có tiền về

---

## C. Quản lý lớp học — site GV (`giaovien.satarobo.vn`)

> **Đã chạy 03/08 bằng tài khoản `uat.giaovien@satarobo.vn` trên `test`.**
> Tài khoản này ban đầu **không được gán lớp nào** (0 lớp / 0 HV / 0 buổi) nên phải
> dựng fixture trước: gán lớp `LOP-CS1-0012`, thêm buổi ngày mai, dời 1 buổi vào
> tuần này (màn Nhận xét chỉ nhìn lại **14 ngày**), gán 1 buổi **dạy thay** ở lớp
> `LOP-CS1-0010`, và dời 1 buổi trial vào cửa sổ lịch (**3 ngày trước → 28 ngày tới**).
> ⚠️ Dữ liệu test đã bị sửa theo cách đó — không phải hiện trạng ban đầu.


### C1 — Điểm danh ✅ ĐÃ CHẠY, ĐẠT
- [x] `/teacher/diem-danh` liệt kê buổi cần điểm danh
- [x] Điểm danh một lớp: có mặt / đi muộn / **vắng có phép** / **vắng không phép** → lưu được
- [x] **[C]** Đánh **vắng không phép** → email ghi *"Bé Hồ Thị Dung đã điểm danh **Vắng không phép** buổi 30/6/2026…"*, **không** có chuỗi `ABSENT_UNEXCUSED` (soi thẳng `EmailQueue`)
- [x] **[C]** Buổi **ngày mai** → không lọt vào màn điểm danh, ở hub lớp nút hiện **"Chưa tới giờ"** (không bấm được)
- [x] Vắng không phép → sinh `MakeupNeed` trạng thái **PENDING**
- [x] Sửa lại thành **có mặt** → yêu cầu học bù chuyển **CANCELLED**, và **không sinh email lần hai** (vẫn 9 email như trước)
- [ ] **[P]** Vắng 2 buổi liên tiếp → có cảnh báo ở `/admin/canh-bao-rui-ro` *(chưa chạy — cần đăng nhập admin)*

### C2 — GV dạy thay ✅ ĐÃ CHẠY — phát hiện 1 lỗi, đã vá
- [x] Gán một buổi cho GV khác làm **dạy thay**
- [x] **[C]** GV dạy thay mở `/teacher/lich` → thấy buổi có nhãn **"Dạy thay"** → bấm "Mở điểm danh" → **vào được bảng điểm danh** (10 HV, sửa được)
- [x] **[C]** GV dạy thay **nhận xét được** học viên buổi đó

> 🐞 **Lỗi tìm thấy 03/08 — đã vá (commit `2e6c8d66`).** Mở tab **Nhận xét** của lớp
> dạy thay (`/teacher/lop?classId=…&tab=nhan-xet`) thì màn **rơi im lặng về "Lớp học
> của tôi"** — URL giữ nguyên, không một chữ báo. Nguyên nhân: hub lớp gác bằng
> `assignedClassIds`, mà dạy thay không nằm trong tập đó (nhánh điểm danh đã tự gác
> bằng `isSessionOwnedByTeacher`, nhánh hub thì chưa). Nay tab Nhận xét đưa sang
> `/teacher/nhan-xet` (route này vốn đã xét `substituteTeacherId`, đã xác minh chạy
> đúng: hiện đủ 10 HV), các tab khác trả "không phải lớp của bạn" thay vì im lặng.
> Người chỉ dạy thay 1 buổi vẫn KHÔNG mở được roster / học bạ / tài liệu / kho ảnh.

### C3 — Nhận xét học viên
- [x] `/teacher/lop` → tab Nhận xét → chấm **rubric** cho vài em → lưu
- [x] **[C]** Sang `/teacher/nhan-xet` cùng buổi đó, bấm **"Lưu tất cả"** → **rubric vẫn còn nguyên**
- [ ] Sửa nhận xét 1 em rồi lưu lại → phụ huynh **không** nhận email lần hai cho các em không đổi

> **Bằng chứng 03/08:** lưu phiếu rubric cho *Bùi Thị Hoa* (tên dự án + 4 mục +
> 9 tiêu chí). Sang màn nhận xét nhanh gõ lời cho *Bùi Tuấn Cường* rồi bấm "Lưu tất
> cả" (toast *"Đã lưu nhận xét 1 học viên"* — chứng minh hành động ĐÃ chạy, không
> phải no-op). Soi lại DB: phiếu của Bùi Thị Hoa còn **đủ** `projectName` + `notes`
> + `rubric` 9 tiêu chí. Lỗi xoá trắng cũ đã hết.
- [ ] **[C]** Mở portal phụ huynh → mục Nhận xét: **thấy đủ** rubric / 4 mục / tên dự án (không phải card trống)

### C4 — Kho ảnh buổi học ⚠️ MỚI KIỂM ĐƯỢC PHẦN GIAO DIỆN
> Hộp thoại "Đăng ảnh lớp" có đủ: 2 chế độ **"Đưa vào kho (nhiều ảnh)"** / "Đăng ngay
> 1 ảnh", câu giải thích *"Ảnh vào KHO (chưa gửi phụ huynh)"*, ô chọn **buổi cho cả
> lô**, ô chọn nhiều file (`multiple`, `image/*`), và **cảnh báo consent**: *"Học viên
> CHƯA đồng ý dùng hình ảnh: Đặng Thanh Oanh — Không thể gắn thẻ các em này."*
> **Chưa tải được ảnh thật**: điều khiển tự động không nhét được file vào ô chọn ảnh
> (thử 3 lần, ô luôn về 0 file). Phần tải ảnh → duyệt → gửi phụ huynh **cần người làm tay**.

- [ ] `/teacher/anh-lop` → **Đưa vào kho** → chọn **nhiều ảnh cùng lúc** → có tiến độ x/y
- [ ] Ảnh vào khu **"Kho ảnh — chưa gửi phụ huynh"**, badge *Trong kho*
- [ ] **[C]** Mở portal phụ huynh lúc này → **không thấy** ảnh nào trong kho
- [ ] Chọn nhiều ảnh → tick học viên (em **chưa có consent** phải bị khoá) → chọn buổi → **Gửi cho phụ huynh**
- [ ] Ảnh chuyển sang **chờ duyệt**; QLCS duyệt ở `/admin/media`
- [ ] **[C]** Portal phụ huynh: thấy ảnh của **đúng con mình**, nhóm theo buổi
- [ ] **[P]** Tab "Ảnh lớp" trong hub lớp có link sang trang Ảnh lớp

### C5 — Học thử (trial)
- [ ] Sale tạo **lớp trải nghiệm** → **[C]** bấm **"Thêm buổi"** (ngày/giờ/GV) → buổi được tạo
- [ ] **[C]** Lớp **chưa có buổi** mà xếp con vào → báo lỗi rõ ("thêm buổi trước")
- [ ] Xếp con vào lớp (không chọn buổi) → tự gán buổi gần nhất
- [x] **[C]** GV mở `/teacher/trial` → **thấy học viên** trong danh sách (Nguyễn A · 18:00–19:30 · "Đã hẹn" · nút Nhập phiếu)
- [ ] GV nhận được thông báo khi được gán buổi trial

> Lưu ý khi nghiệm thu: màn này chỉ hiện buổi trong **3 ngày trước → 28 ngày tới**.
> Buổi ngoài cửa sổ đó vắng mặt là ĐÚNG, không phải lỗi — lúc đầu tôi tưởng hỏng.
> Các mục còn lại của C5 do **Sale** thao tác, chưa chạy.

### C6 — Bài tập
- [x] `/teacher/cham-bai` → giao bài từ **Thư viện Đào tạo**
- [x] **[C]** Chọn đề trong thư viện → **giao được** (toast "Đã giao bài cho lớp"; dòng *QA4-BTVN buổi 2 · Lớp CS1.0012 · Kiểm tra · 0/11 · Đang mở*)
- [ ] Portal phụ huynh/học viên: thấy bài, **nộp được file**
- [ ] GV chấm → thấy **đủ số file** học viên đã nộp
- [ ] **[P]** Sau khi HV làm bài kiểm tra → thẻ "Đã làm x/N" trên portal **tăng** (trước đây đứng im 0/N)

### C7 — Chuông thông báo site GV
- [x] Góc trên phải site GV có **chuông**, có badge số, mở ra danh sách thật (*"Học viên sắp hết khoá — 9 việc cần xử lý"*, có nút "Đọc hết")
- [x] **[C]** CSKH sửa điểm danh → GV thấy thông báo — **đã chạy 03/08**: QLCS sửa 1 em ở buổi 30/6 lớp CS1.0012 → GV nhận ngay `StaffNotification` *"Điểm danh buổi học bị chỉnh sửa … bởi UAT Quản lý"*; link trong thông báo map đúng sang site GV (`/attendance` → `/diem-danh`, có unit test)

---

## D. Portal phụ huynh (`hocvien.satarobo.vn`)

> **Đã chạy 03/08 bằng `uat.phuhuynh@satarobo.vn`.** Con *Trần UAT Minh*, lớp
> `ZZTEST-S2-01`. Lớp này **chưa có buổi nào lên lịch** nên ban đầu mọi màn đều rỗng;
> phải dựng fixture: 2 buổi (28/07 + 01/08), điểm danh 1 có mặt / 1 vắng, 1 phiếu
> nhận xét đủ rubric, và 3 tài liệu + 2 bài tập để thử luật hiển thị.
> ⚠️ Dữ liệu của tài khoản PH này đã bị sửa như vậy.

- [x] **[C] Tài liệu**: mục Bài giảng chỉ hiện **file GV đã giao cho lớp** — **không** thấy giáo án nội bộ *(luật chốt 02/08)*
- [x] Hồ sơ con: thấy lớp, lịch học, tiến độ buổi
- [x] Chuyên cần khớp với số GV đã điểm danh
- [x] Học phí: công nợ khớp với dữ liệu ghi danh
- [ ] **[C]** Đổi mật khẩu ở Hồ sơ → **bị đưa ra đăng nhập lại**; mật khẩu cũ không dùng được nữa *(người dùng tự làm — tôi không đặt mật khẩu hộ)*
- [ ] **[P]** Có 2 con → chuyển đổi giữa các con hoạt động đúng *(tài khoản này chỉ có 1 con)*

> 🔒 **Ca chốt chặn 02/08 — đã thử bằng MỒI NHỬ, đạt.** Dựng 3 tài liệu cùng gắn vào
> lesson của buổi đã dạy:
> | Tài liệu | Đường vào | Kỳ vọng | Thực tế |
> |---|---|---|---|
> | "GIÁO ÁN NỘI BỘ" `isPublic=true`, **không giao bài** | ngân hàng tài liệu | KHÔNG được thấy | ✅ không thấy |
> | "Phiếu bài tập buổi 1" đính vào bài **PUBLISHED** của đúng lớp | GV giao bài | PHẢI thấy | ✅ thấy |
> | "Đề nháp auto-sinh" đính vào bài **DRAFT** | auto-sinh từ template | KHÔNG được thấy | ✅ không thấy |
>
> Nguồn tài liệu trong code là Assignment PUBLISHED/CLOSED của chính lớp + đúng lesson
> (`lib/portal/learning.ts:228`), **không dùng `Document.isPublic`** — đúng luật đã chốt.

> **Các mốc khác đã xác minh:**
> · Lịch học: 32 tổng buổi, **1 đã học / 1 vắng** — khớp đúng điểm danh đã tạo.
> · Nhận xét: hiện **tên dự án + 4 mục + đủ 9 tiêu chí rubric** (4 nhóm Kiến thức /
>   Kỹ năng / Sản phẩm / Thái độ), không phải card trống. Thang rubric là
>   **1 = tốt nhất → 5 = cần cố gắng**, portal hiển thị đúng mức GV chấm.
> · Học phí: công nợ **2.400.000đ** = `finalPrice` của ghi danh ĐANG HỌC; ghi danh đã
>   nghỉ (WITHDREW) bị loại đúng. Màn nói rõ "chỉ hiện khoản kế toán đã xác nhận".
> · Bài tập: bài GV giao hiện ở tab **"Học viên (làm bài)"** (tab phụ huynh chỉ xem
>   tiến độ — đúng thiết kế); bài **DRAFT không lộ**.
> · 12/12 mục sidebar portal đều mở được (200), không link chết.
>
> **Chưa chạy được:** nộp file bài tập và xem ảnh lớp — cả hai cần tải tệp thật, mà
> điều khiển tự động không nhét được file vào ô chọn (đã thử 3 lần ở mục C4).

---

## E. Vai trò & sidebar

Với **từng vai** (QLCS · Sale · GV · Đào tạo), đăng nhập và:

- [x] **[C]** Bấm thử **mọi mục** trên sidebar → không mục nào bị đá về dashboard (link chết) — **QLCS: 69/69 mục mở được, 0 link chết**
- [x] QLCS thấy: Chốt hàng loạt ✅ · Tài khoản PH ✅ · Điểm danh ✅ · ~~Biến động số dư~~ **KHÔNG — và đó là ĐÚNG, xem bên dưới**

> ⚠️ **Dòng "QLCS thấy Biến động số dư" trong checklist này VIẾT SAI** (viết theo bảng
> quyền v1). RBAC v2 đã **cố ý** chuyển `payments:manage` khỏi Quản lý cơ sở sang
> HO_ACCOUNTANT / CENTER_ACCOUNTANT (quyết định #09, Kiệt duyệt 09/07/2026 — ghi ngay
> trong `prisma/seed-roles.ts`). Nên QLCS **vừa không thấy mục, vừa bị chặn khi gõ
> thẳng URL** — hai thứ khớp nhau, không phải link chết.
- [ ] Sale thấy: Tài khoản PH · Điểm danh (sửa hồi tố) — **không** thấy Chốt hàng loạt
- [ ] Đào tạo mở được `/cham-cong/checkin` *(trước đây bị đá ra)*
- [ ] **[P]** Đào tạo chỉ thấy ~12 mục (giáo trình + LMS + học bạ) — **đúng thiết kế** theo chốt 24/07, không phải lỗi

> **Đã soi tĩnh 03/08 (không cần đăng nhập từng vai):** cả **84 mục** sidebar admin đều
> trỏ tới route có thật, và **không mục nào** quảng cáo quyền rộng hơn gate của chính
> trang đó — tức không còn lớp lỗi "thấy link rồi bị đá về dashboard" do thiếu route
> hoặc lệch quyền. 15/15 mục sidebar site GV cũng có route thật. Việc còn lại khi
> đăng nhập từng vai chỉ là xác nhận **đúng vai thấy đúng mục** (dòng gạch đầu dòng ở trên).


### 🚨 E-bis — QLCS KHÔNG duyệt được trả góp và KHÔNG xuất được QR (cần quyết)

Đo trực tiếp trên DB test 03/08 với `uat.quanly@satarobo.vn` (role `CENTER_MANAGER`,
85 quyền):

| Quyền | Ai giữ trong `seed-roles.ts` | QLCS có? | Chặn việc gì |
|---|---|---|---|
| `discounts:approve` | HO_ACCOUNTANT, **CENTER_MANAGER** | **thiếu trong DB** | Duyệt giảm giá (B2) |
| `installments:approve` | **chỉ** HO_ACCOUNTANT | không | **Duyệt kế hoạch 2 đợt (B3)** |
| `orders:manage` | **chỉ** HO_ACCOUNTANT | không | **Xuất QR theo đợt (B4)** |
| `payments:manage` | HO_ACCOUNTANT, CENTER_ACCOUNTANT | không | Công nợ · Biến động số dư · Hoàn tiền |

Hai việc khác nhau, đừng gộp:

1. **`discounts:approve` — chỉ là seed cũ.** Seed đã có, DB chưa có. Chạy workflow ở
   mục F.1 là xong. (Đây đúng là thứ ghi chú ở B2 đã cảnh báo.)
2. **`installments:approve` + `orders:manage` — KHÔNG có trong seed cho QLCS.** Chạy
   seed bao nhiêu lần cũng không có. Nghĩa là theo thiết kế hiện tại, **người ở quầy
   cơ sở không xuất được QR và không duyệt được kế hoạch trả góp** — phải là kế toán
   Hội sở làm. Việc này **va thẳng vào luồng đã mô tả** ("sale tạo đơn → QLCS duyệt →
   xuất QR cho khách quét tại quầy").

**ĐÃ CHỐT 03/08/2026 — chủ dự án cấp thêm cho Quản lý cơ sở.** `seed-roles.ts` nay
khai thêm `installments:approve` + `orders:manage` (scope GLOBAL theo R1; cách ly cơ
sở vẫn do `scopedDb` gác nên QLCS CS1 không đụng đơn của CS2). Đã chạy seed trên DB
test: CENTER_MANAGER từ 85 → **88 quyền**. **Trên prod phải chạy workflow ở mục F.1
thì mới có hiệu lực.**

---

## F. Sau khi merge `test` → `main` (không phải nghiệm thu — việc bấm tay)

1. [ ] Chạy workflow **Seed Production RolePermission** — **bắt buộc**. Đợt này đổi bảng quyền. Sau khi chạy, Quản lý cơ sở mới có đủ **3 quyền**: `discounts:approve` (thiếu từ 31/07), và `installments:approve` + `orders:manage` (chủ dự án cấp thêm 03/08 để quầy tự duyệt trả góp + xuất QR). **Chưa chạy = QLCS trên prod không duyệt giảm giá, không duyệt kế hoạch 2 đợt, không bấm được Xuất QR.**
2. [ ] Đặt lại `SEPAY_WEBHOOK_API_KEY` + **redeploy** → tiền mới chảy vào, trang Biến động mới có dữ liệu.
3. [ ] Kiểm env `SESSION_LIFECYCLE_V2` — nút "Hoàn tất buổi" + auto giao bài về nhà nằm sau cờ này.
4. [ ] Chạy `pnpm payments:backfill --apply` trên **DEV**, rồi `pnpm payments:shadow-compare`, đọc bảng chênh lệch. **Chưa lật cờ sổ mới.**
5. [ ] Khi mẫu ZNS **616899** được duyệt: đối chiếu bảng tham số trên ZBS → đặt `ZALO_ZNS_TEMPLATE_ACCOUNT` → redeploy → dùng nút "Gửi ZNS tất cả chưa nhận".

---

## Việc còn treo cần quyết (không chặn merge)

- **Đơn có dòng trả góp nhưng kế hoạch chưa duyệt**: màn QR tính là đang thu đợt 1, sổ mới coi là thu toàn đơn. Số tiền khớp, nhưng hai bên hiểu khác nhau về "đang thu đợt nào".
- **Sửa kế hoạch trên đơn ĐÃ duyệt**: phiếu thu giữ số tiền cũ. Cần chốt: cho đồng bộ lại, hay bắt duyệt lại từ đầu.
- **payOS**: chờ TGĐ xác thực doanh nghiệp. Code sẵn sàng, chạy chế độ mô phỏng.
