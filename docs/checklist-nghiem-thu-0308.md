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

### A1 — Import lead · `/admin/leads/import/registered`
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
- [ ] Mở link trên **domain chính** (không phải hocvien.*) → trang hiện ra
- [ ] Nhập **SĐT** phụ huynh → nhận mã (lấy ở `/admin/otp-logs`) → đặt mật khẩu
- [ ] **[C]** Đăng nhập portal bằng **SĐT + mật khẩu vừa đặt** → vào được, thấy đúng con mình

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
- [ ] Bấm **Xuất QR** trên dòng **Đợt 1** → hiện QR
- [ ] **[C]** QR ghi rõ **"Đợt 1: <số tiền đợt 1>"** — **không phải tổng đơn**. *(Đây chính là bug gốc.)*
- [ ] Có **đồng hồ đếm ngược** và dòng nhắc *"QR hết hạn vẫn nhận được tiền"*
- [ ] Bấm **Xuất QR** lần nữa ngay → **không** đẻ mã thứ hai, trả lại đúng mã đang sống
- [ ] Bấm **Tạo lại QR** vài lần → mã mới, nhưng nội dung chuyển khoản (định danh đợt) **không đổi**
- [ ] **[P]** Phiếu đã thu đủ → nút Xuất QR bị chặn

### B5 — Biến động số dư · `/admin/bien-dong-so-du`
- [ ] Vào được từ sidebar nhóm **Tài chính**
- [ ] 3 tab: Tất cả / Cần xử lý / Đã khớp
- [ ] Có khu **"Tiền thừa chưa xử lý"** và khu log SePay cũ bên dưới
- [ ] **Bảng trống là ĐÚNG** ở giai đoạn này — `SEPAY_WEBHOOK_API_KEY` đang gỡ nên chưa có tiền về

---

## C. Quản lý lớp học — site GV (`giaovien.satarobo.vn`)

### C1 — Điểm danh
- [ ] `/teacher/diem-danh` liệt kê buổi cần điểm danh
- [ ] Điểm danh một lớp: có mặt / đi muộn / **vắng có phép** / **vắng không phép** → lưu được
- [ ] **[C]** Đánh **vắng không phép** cho HV có email phụ huynh → mở `/admin/email-logs`: nội dung ghi **"Vắng không phép"**, **không** có chuỗi `ABSENT_UNEXCUSED`
- [ ] **[C]** Buổi **ngày mai** → không điểm danh được (bị chặn)
- [ ] Vắng không phép → sinh yêu cầu học bù ở `/admin/hoc-bu`
- [ ] Sửa lại thành **có mặt** → yêu cầu học bù đó **bị huỷ**
- [ ] **[P]** Vắng 2 buổi liên tiếp → có cảnh báo ở `/admin/canh-bao-rui-ro`

### C2 — GV dạy thay
- [ ] Gán một buổi cho GV khác làm **dạy thay**
- [ ] **[C]** GV dạy thay mở `/teacher/lich` → bấm "Mở điểm danh" → **vào được bảng điểm danh** (trước đây rơi im lặng về danh sách lớp)
- [ ] **[C]** GV dạy thay **nhận xét được** học viên buổi đó

### C3 — Nhận xét học viên
- [ ] `/teacher/lop` → tab Nhận xét → chấm **rubric** cho vài em → lưu
- [ ] **[C]** Sang `/teacher/nhan-xet` cùng buổi đó, bấm **"Lưu tất cả"** → quay lại kiểm: **rubric vẫn còn nguyên** *(trước đây bị xoá sạch, im lặng)*
- [ ] Sửa nhận xét 1 em rồi lưu lại → phụ huynh **không** nhận email lần hai cho các em không đổi
- [ ] **[C]** Mở portal phụ huynh → mục Nhận xét: **thấy đủ** rubric / 4 mục / tên dự án (không phải card trống)

### C4 — Kho ảnh buổi học
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
- [ ] **[C]** GV mở `/teacher/trial` → **thấy học viên** trong danh sách *(trước đây trống trơn)*
- [ ] GV nhận được thông báo khi được gán buổi trial

### C6 — Bài tập
- [ ] `/teacher/cham-bai` → giao bài từ **Thư viện Đào tạo**
- [ ] **[C]** Chọn đề mà hệ thống đã tự sinh nháp lúc tạo lớp → **giao được** (trước đây báo "đã giao rồi" mà không mở được bài)
- [ ] Portal phụ huynh/học viên: thấy bài, **nộp được file**
- [ ] GV chấm → thấy **đủ số file** học viên đã nộp
- [ ] **[P]** Sau khi HV làm bài kiểm tra → thẻ "Đã làm x/N" trên portal **tăng** (trước đây đứng im 0/N)

### C7 — Chuông thông báo site GV
- [ ] **[C]** Góc trên phải site GV có **chuông**; CSKH sửa điểm danh → GV thấy thông báo (trước đây GV không bao giờ nhận được)

---

## D. Portal phụ huynh (`hocvien.satarobo.vn`)

- [ ] **[C] Tài liệu**: mục Bài giảng chỉ hiện **file GV đã giao cho lớp** — **không** thấy giáo án nội bộ *(luật chốt 02/08)*
- [ ] Hồ sơ con: thấy lớp, lịch học, tiến độ buổi
- [ ] Chuyên cần khớp với số GV đã điểm danh
- [ ] Học phí: công nợ khớp với `/admin/cong-no`
- [ ] **[C]** Đổi mật khẩu ở Hồ sơ → **bị đưa ra đăng nhập lại**; mật khẩu cũ không dùng được nữa
- [ ] **[P]** Có 2 con → chuyển đổi giữa các con hoạt động đúng

---

## E. Vai trò & sidebar

Với **từng vai** (QLCS · Sale · GV · Đào tạo), đăng nhập và:

- [ ] **[C]** Bấm thử **mọi mục** trên sidebar → không mục nào bị đá về dashboard (link chết)
- [ ] QLCS thấy: Chốt hàng loạt · Tài khoản PH · Biến động số dư · Điểm danh
- [ ] Sale thấy: Tài khoản PH · Điểm danh (sửa hồi tố) — **không** thấy Chốt hàng loạt
- [ ] Đào tạo mở được `/cham-cong/checkin` *(trước đây bị đá ra)*
- [ ] **[P]** Đào tạo chỉ thấy ~12 mục (giáo trình + LMS + học bạ) — **đúng thiết kế** theo chốt 24/07, không phải lỗi

---

## F. Sau khi merge `test` → `main` (không phải nghiệm thu — việc bấm tay)

1. [ ] Chạy workflow **Seed Production RolePermission** — **bắt buộc**. Đợt này đổi bảng quyền, và `discounts:approve` từ 31/07 tới giờ vẫn chưa lên prod (QLCS đang không duyệt được giảm giá trên prod).
2. [ ] Đặt lại `SEPAY_WEBHOOK_API_KEY` + **redeploy** → tiền mới chảy vào, trang Biến động mới có dữ liệu.
3. [ ] Kiểm env `SESSION_LIFECYCLE_V2` — nút "Hoàn tất buổi" + auto giao bài về nhà nằm sau cờ này.
4. [ ] Chạy `pnpm payments:backfill --apply` trên **DEV**, rồi `pnpm payments:shadow-compare`, đọc bảng chênh lệch. **Chưa lật cờ sổ mới.**
5. [ ] Khi mẫu ZNS **616899** được duyệt: đối chiếu bảng tham số trên ZBS → đặt `ZALO_ZNS_TEMPLATE_ACCOUNT` → redeploy → dùng nút "Gửi ZNS tất cả chưa nhận".

---

## Việc còn treo cần quyết (không chặn merge)

- **Đơn có dòng trả góp nhưng kế hoạch chưa duyệt**: màn QR tính là đang thu đợt 1, sổ mới coi là thu toàn đơn. Số tiền khớp, nhưng hai bên hiểu khác nhau về "đang thu đợt nào".
- **Sửa kế hoạch trên đơn ĐÃ duyệt**: phiếu thu giữ số tiền cũ. Cần chốt: cho đồng bộ lại, hay bắt duyệt lại từ đầu.
- **payOS**: chờ TGĐ xác thực doanh nghiệp. Code sẵn sàng, chạy chế độ mô phỏng.
