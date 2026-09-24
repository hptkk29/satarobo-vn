# Checklist nghiệm thu — Hồ sơ Bộ Công Thương

**Môi trường nghiệm thu:** https://test.satarobo.vn
**Ngày đẩy lên test:** 22/09/2026
**Người nghiệm thu:** _______________  **Ngày:** ____/____/2026

> Cách dùng: mở đúng đường dẫn ghi ở cột "Mở ở đâu", nhìn đúng thứ ghi ở cột "Phải thấy".
> Đạt thì tích `[x]`. Không đạt thì ghi vào cột "Ghi chú" **thứ bạn thấy**, đừng ghi
> "sai" — câu "thấy gì" là thứ sửa được, câu "sai" thì không.
>
> Nên mở **hai lần**: một lần trên máy tính, một lần trên điện thoại. Nhiều mục chỉ hỏng
> ở điện thoại (chân trang cũ ẩn bớt nội dung ở màn hẹp).

---

## Phần 0 — Trước khi bắt đầu

| ✔ | Việc | Cách biết là xong |
|---|---|---|
| [ ] | Hai workflow trên GitHub đã xanh | `CI` và `Migrate TEST DB` đều dấu tích xanh |
| [ ] | Bảng mới đã có trên DB test | Workflow `Migrate TEST DB` báo đã áp `20260922100000_site_policy_acceptance` |
| [ ] | Đã báo CSKH | 114+ phụ huynh sẽ gặp màn xác nhận ở trang **Học phí** — xem Phần 4 |

---

## Phần 1 — Mười chính sách bắt buộc

Mở **chân trang** bất kỳ trang nào của website, tìm mục **Chính sách**.

| ✔ | Phải thấy | Ghi chú |
|---|---|---|
| [ ] | Đủ **10** đường dẫn, không thiếu mục nào | |
| [ ] | Tên in ra **đúng từng chữ** như bảng dưới (không viết tắt, không đổi chữ hoa) | |
| [ ] | Bấm từng cái đều mở được trang, **không** ra trang báo lỗi | |

Mười tên phải thấy — đọc lướt và đối chiếu:

1. Chính sách bảo mật
2. Phương thức tiếp nhận và giải quyết phản ánh, yêu cầu, khiếu nại
3. Chính sách về giá
4. Chính sách thanh toán
5. Các điều kiện và hạn chế trong việc giao hàng và cung cấp dịch vụ
6. Chính sách giao hàng
7. Phương thức cung cấp dịch vụ
8. Chính sách đổi trả hàng và hoàn tiền
9. Chính sách chấm dứt dịch vụ và hoàn tiền
10. Quyền và nghĩa vụ của các bên

| ✔ | Mở ở đâu | Phải thấy | Ghi chú |
|---|---|---|---|
| [ ] | `/chinh-sach` | Trang mục lục liệt kê đủ 10 chính sách | |
| [ ] | `/chinh-sach-cham-dut-dich-vu` | Mức hoàn phí hiện ra dưới dạng **BẢNG** (có đường kẻ ô), không phải một đoạn văn dính liền | |
| [ ] | Trang trên, mở bằng **điện thoại** | Bảng **không** tràn ra ngoài màn hình; nếu dài thì vuốt ngang được | |
| [ ] | `/chinh-sach-bao-mat` | Có mục **2.3** nói rõ tin nhắn gửi qua Zalo/Facebook được nhân viên đọc và hệ thống lưu | |
| [ ] | `/chinh-sach-thanh-toan` | Có số tài khoản `2102025686868` (MBBank) cho **riêng** gói RoboSim 490K, và **không** có số tài khoản nào khác | |
| [ ] | `/phuong-thuc-tiep-nhan-phan-anh` | Email nhận khiếu nại là `info@satarobo.vn` | |

---

## Phần 2 — Thông tin công ty

Kiểm ở **cả ba** chân trang khác nhau — website dùng ba bộ giao diện riêng, sửa một chỗ
không tự lan sang hai chỗ kia:

| ✔ | Mở ở đâu | Ghi chú |
|---|---|---|
| [ ] | Trang chủ `satarobo.vn` (và mọi trang thường) | |
| [ ] | `/khoa-hoc/laptrinhrobot` (landing cũ) | |
| [ ] | `/khoa-hoc/luyenthirobosim` (landing cũ) | |

Ở **mỗi** chân trang trên, phải thấy đủ 5 dòng:

| ✔ | Dòng | Nội dung đúng |
|---|---|---|
| [ ] | Tên công ty | CÔNG TY CỔ PHẦN CÔNG NGHỆ GIÁO DỤC SATA ROBO (viết hoa) |
| [ ] | Mã số doanh nghiệp | `0402301783 do Sở Tài chính Thành phố Đà Nẵng cấp ngày 02/10/2025` — phải có **cả** cơ quan cấp và ngày cấp |
| [ ] | Địa chỉ | `211 Nguyễn Hữu Thọ, Phường Hòa Cường, Thành phố Đà Nẵng, Việt Nam` |
| [ ] | Số điện thoại | `0837.812.860` — MỘT số duy nhất; không còn số riêng của từng cơ sở |
| [ ] | Email | `thongtin@satarobo.vn` |

| ✔ | Việc | Phải thấy | Ghi chú |
|---|---|---|---|
| [ ] | Mở ba chân trang trên bằng **điện thoại** | Khối thông tin công ty **vẫn hiện**, không biến mất | |
| [ ] | Tìm chữ **"Trụ sở chính"** trên toàn site (`Ctrl+F` ở trang chủ, `/lien-he`, `/ve-chung-toi`, hai landing cũ) | **Không còn chỗ nào** | |
| [ ] | `/lien-he` | Cơ sở 1 ghi phường **Hòa Cường** (không còn "Hải Châu") | |
| [ ] | Cổng phụ huynh `/portal` và trang đăng nhập | Có dải chữ nhỏ ở dưới cùng dẫn tới Chính sách bảo mật + mục lục chính sách | |

---

## Phần 3 — Ô tích đồng ý ở biểu mẫu

Có **4 biểu mẫu**. Với mỗi cái, làm đúng 3 bước: (a) mở form, (b) thử gửi khi **chưa** tích,
(c) tích rồi gửi.

| ✔ | Biểu mẫu | Mở ở đâu | Ghi chú |
|---|---|---|---|
| [ ] | Form liên hệ | `/lien-he` | |
| [ ] | Form đăng ký landing | `/khoa-hoc/laptrinhrobot`, kéo xuống form đăng ký | |
| [ ] | Cửa sổ tư vấn | `/khoa-hoc`, bấm nút tư vấn trên một thẻ khoá học | |
| [ ] | Trang kích hoạt tài khoản | `/kich-hoat` | |

Ở **mỗi** biểu mẫu, phải đúng cả 4 điều:

| ✔ | Điều | Ghi chú |
|---|---|---|
| [ ] | Ô vuông **chưa được tích sẵn** khi vừa mở | |
| [ ] | Câu chữ đúng: **"Tôi đã đọc và đồng ý với Chính sách bảo mật của website"** | |
| [ ] | Chỉ cụm **"Chính sách bảo mật"** là đường dẫn bấm được; bấm vào mở đúng trang chính sách | |
| [ ] | **Chưa tích mà bấm gửi thì không gửi được** (nút mờ, hoặc hiện lời nhắc) | |
| [ ] | Tích rồi gửi thì gửi được bình thường | |

| ✔ | Việc | Phải thấy | Ghi chú |
|---|---|---|---|
| [ ] | Ở cửa sổ tư vấn | **Không còn** ô tích riêng về nhận tin khuyến mãi — chỉ còn **một** ô duy nhất (quyết định BLĐ #12) | |

---

## Phần 4 — Màn xác nhận ở cổng phụ huynh

⚠️ **Phần này đổi trải nghiệm của phụ huynh thật.** Nghiệm thu bằng một tài khoản phụ huynh
trên test.

| ✔ | Việc | Phải thấy | Ghi chú |
|---|---|---|---|
| [ ] | Đăng nhập phụ huynh → vào **Học phí** | Hiện màn xác nhận chính sách **trước**, chưa thấy số tiền nào | |
| [ ] | Đọc câu giải thích | Có nói rõ **vì sao** đang bị hỏi (theo quy định của Bộ Công Thương) và **chỉ phải xác nhận một lần** | |
| [ ] | Bấm đường dẫn "đọc toàn văn" | Mở đúng trang mục lục chính sách | |
| [ ] | Bấm đồng ý | Vào được trang Học phí ngay, **không** bị đá ngược lại | |
| [ ] | Thoát ra rồi vào lại trang Học phí | **Không** hỏi lại lần nữa | |
| [ ] | Bấm F5 ở màn xác nhận vài lần rồi mới đồng ý | Vẫn vào được bình thường | |
| [ ] | Vào **Học bạ**, **Lịch học**, **Tin nhắn**, **Thông báo** | Mở bình thường — màn xác nhận chỉ chặn trang Học phí | |
| [ ] | Đăng nhập bằng tài khoản phụ huynh **khác** | Tài khoản đó cũng phải xác nhận một lần của riêng mình | |

---

## Phần 5 — Giá và sản phẩm

| ✔ | Mở ở đâu | Phải thấy | Ghi chú |
|---|---|---|---|
| [ ] | `/khoa-hoc` | **Mọi** thẻ khoá học đều in học phí bằng **con số**; không còn thẻ nào ghi "Liên hệ" hay "Liên hệ tư vấn" | |
| [ ] | `/khoa-hoc`, kéo tới bảng so sánh | Hàng **Giá** in số, **khớp** với số trên thẻ ở trên | |
| [ ] | Bấm vào từng thẻ khoá học | Trang chi tiết mở được, và học phí in ra **khớp** với thẻ vừa bấm | |
| [ ] | Đối chiếu với `/admin/courses` trên cùng môi trường | Số trên web **khớp** số trong quản trị | |
| [ ] | `/khoa-hoc/laptrinhrobot` — khối câu hỏi thường gặp, câu về học phí | Trả lời bằng **số tiền**, không còn "vui lòng liên hệ" | |
| [ ] | `/hoc-cu` | Ra trang **không tìm thấy** (404) — bộ học cụ đã ẩn vì chưa công khai giá | |
| [ ] | Menu trên cùng và menu điện thoại | **Không còn** mục "Học cụ" | |

---

## Phần 6 — Xem trên điện thoại

Mở bằng điện thoại thật, hoặc thu nhỏ trình duyệt còn khoảng 375px.

| ✔ | Trang | Phải thấy | Ghi chú |
|---|---|---|---|
| [ ] | Cả 10 trang chính sách | Chữ không bị cắt, **không phải vuốt ngang** để đọc hết dòng | |
| [ ] | `/chinh-sach-cham-dut-dich-vu` | Bảng mức hoàn phí vuốt ngang được, không đẩy cả trang lệch | |
| [ ] | Ba chân trang | Thông tin công ty vẫn hiện, không bị ẩn | |
| [ ] | 4 biểu mẫu | Ô tích và chữ nằm cùng hàng, không đè lên nhau | |

---

## Phần 7 — Việc phải làm TAY (không tự chạy theo code)

| ✔ | Việc | Ai làm | Ghi chú |
|---|---|---|---|
| [ ] | Kiểm **học phí niêm yết** của từng khoá trên `/admin/courses` đúng theo SR.QD.219 | Đào tạo / Kế toán | Web in đúng số trong quản trị, nên số sai trong quản trị sẽ ra web |
| [ ] | Kiểm chỉ những khoá **muốn bán trên web** mới bật "Đã đăng" | Đào tạo | 9 khoá Sata là khoá **dạy**, dùng ở màn tạo đơn, không nhất thiết bày trên web |
| [ ] | Sau khi lên PROD: chạy `prisma migrate deploy` | Dev | Bảng `SitePolicyAcceptance` |
| [ ] | Đo 4 số trên DB PROD rồi dán vào hồ sơ | Dev | Xem mục §H của `VIEC-CAN-LAM.md` |
| [ ] | Báo CSKH trước khi lên PROD | Vận hành | Phụ huynh sẽ gặp màn xác nhận ở trang Học phí |

---

## Phần 8 — Hai chỗ phải báo lại đơn vị tư vấn

Không phải lỗi hệ thống, nhưng bản đăng trên web **lệch** bản `.docx` đã gửi. Cần đơn vị tư
vấn gộp vào văn bản nộp, kẻo hồ sơ và website nói khác nhau:

| ✔ | Chỗ lệch | Vì sao vẫn để lệch |
|---|---|---|
| [ ] | Chính sách bảo mật có thêm **mục 2.3** (tin nhắn Zalo/Facebook được nhân viên đọc và hệ thống lưu) | Đây là một luồng dữ liệu **có thật** đang chạy. Đăng chính sách mà giấu nó đi là sai nặng hơn lệch chữ với bản `.docx` |
| [ ] | Căn cứ pháp lý ghi **Luật 91/2025/QH15 + NĐ 356/2025/NĐ-CP** | Bản `.docx` đang dẫn văn bản đã bị thay thế |

---

## Phần 9 — Còn chờ quyết định (không chặn nghiệm thu đợt này)

| Việc | Vì sao chờ |
|---|---|
| 18 chỗ nội dung marketing hứa "hoàn 100%" | Đá bảng hoàn phí 100/70/50/0% của chính sách vừa đăng. Đây là **quyết định nghiệp vụ**, không phải việc sửa mã |
| Luồng **đặt hàng trực tuyến** | Quyết định BLĐ #9 khai website CÓ nhận đặt hàng, nhưng hiện chưa có giỏ hàng / bước xác nhận tổng tiền. Là **một dự án riêng** |
| Văn bản **"Chính sách hoạt động"** riêng | Quyết định BLĐ #10 chọn phương án B (chờ tư vấn gửi). Ô tích hiện trỏ tạm về trang mục lục; khi có văn bản chỉ đổi **một dòng** |
| Giá **bộ học cụ ZMROBO** | Chưa có giá nên đang ẩn. Có giá là bật lại bằng cách **xoá một tệp** |

---

## Kết luận nghiệm thu

- [ ] **ĐẠT** — đẩy tiếp lên PROD
- [ ] **ĐẠT CÓ ĐIỀU KIỆN** — sửa các mục ghi chú ở trên rồi nghiệm thu lại
- [ ] **CHƯA ĐẠT** — lý do: _______________________________________________

Người nghiệm thu: _______________________  Ký: _______________
