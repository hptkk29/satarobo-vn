# Biên bản chốt — 8 câu đóng sổ bản đầu Site Sale + chính sách hoa hồng + mở 4 trục tích hợp

> **Ngày chốt:** 27/08/2026 · **Người chốt:** chủ dự án · **Người ghi:** trợ lý kỹ thuật
> **Căn cứ trình:** bản gỡ kẹt Site Sale 27/08 (8 câu chờ trả lời) + phần trạng thái 4 trục tích hợp ngoài
> **Hiệu lực:** ngay. Bốn câu cần sửa mã đã giao thực hiện cùng ngày; bốn câu còn lại đóng bằng chính văn bản này.

---

## 1. Tám câu — quyết định

| # | Câu | **QUYẾT ĐỊNH 27/08** | Cần sửa mã? |
|:--:|---|---|:--:|
| **1** | Marketing có bị che số điện thoại khách không? | ❌ **KHÔNG che.** Nguyên văn: *"không che vì marketing là người cung cấp sđt cho sale mà"* — Marketing là **nguồn** số, không phải bên tiêu thụ số. Che họ là chặn chính người đang cấp dữ liệu | Không |
| **2** | "Khách của tôi" có gồm phiếu do mình nhập không? | ✅ **CÓ** — cho site Sale khớp trang quản trị (được giao **HOẶC** mình nhập) | **Có** |
| **3** | Quyền "xem liên hệ phụ huynh": gộp một khoá hay giữ hai? | ✅ **TÁCH RIÊNG** — giữ nguyên hai khoá quyền | Không (nhưng phải ghi tài liệu) |
| **4** | Ghi chú vào phiếu khách của đồng nghiệp: cho hay cấm? | ✅ **SIẾT** — vẫn ghi chú được, nhưng **chỉ chủ phiếu và cấp quản lý mới tắt được đồng hồ nhắc chăm sóc** | **Có** |
| **5** | Ký xác nhận ba nguyên tắc máy đang chạy theo | ✅ **KIỆT KÝ CẢ BA** (mục 2 dưới) | Không |
| **6** | Bật site Sale cho người thật khi nào? | ✅ **Theo đề xuất** — bật ở môi trường thử trước, tổ Sale dùng một tuần, rồi mới bật thật | Không |
| **7** | Địa chỉ trang nhập khách lệch biên bản đã ký | ✅ **GIỮ NGUYÊN ĐỊA CHỈ HIỆN TẠI** — ký phụ lục xác nhận, không sửa mã | Không |
| **8** | Màu và thanh điều hướng site Sale | ✅ **Theo đề xuất** — màu tím thương hiệu `#7C3AED`, thanh điều hướng gom **8 nhóm** theo thiết kế FINAL 16/07 | **Có** |

### 1.1 Ghi chú bắt buộc cho câu 3 (tách riêng)

Giữ hai khoá quyền riêng cho cùng một số điện thoại là **lựa chọn có chủ đích**, không phải sót.
Hệ quả phải chấp nhận và phải giải thích được khi có người kiểm tra: **cùng một người có thể
thấy số ở màn này mà không thấy ở màn kia.** Nếu sau này ai đó báo "lỗi hiển thị không nhất
quán", câu trả lời là dòng này — không được âm thầm gộp hai khoá lại để "cho gọn", vì gộp là
siết quyền của người đang cần dùng.

### 1.2 Ghi chú bắt buộc cho câu 7 (giữ nguyên địa chỉ)

Biên bản 4 cổng (21/08) ghi một địa chỉ, mã nguồn đặt ở địa chỉ khác. Quyết định 27/08 xác
nhận **địa chỉ trong mã nguồn là đúng**; biên bản 21/08 được đính chính bằng chính văn bản này.
Không sửa mã, không báo lại người đang dùng.

---

## 2. Ba nguyên tắc đã ký (câu 5)

Ba điều dưới đây **máy đã chạy theo từ trước**, nay có văn bản chống lưng:

1. **Không chia lead xuyên cơ sở.**
2. **Tư vấn viên chỉ được XEM lớp trải nghiệm, không được sửa.**
3. **Người mới vào vòng chia được xếp ngang người đang ít lượt nhất, không phải bắt đầu từ 0.**
   (Nếu bắt đầu từ 0 thì người mới hút sạch lead cho tới khi bằng người khác.)

---

## 3. Chính sách hoa hồng — CHỐT MỚI 27/08

| # | Nguyên tắc | Trạng thái hạ tầng |
|:--:|---|---|
| **HH-1** | Hoa hồng tính trên **TIỀN ĐÃ THU**, không phải giá trị đơn hàng | ⬜ phải viết — hiện chưa có |
| **HH-2** | Tính **theo tháng** | ✅ `CommissionStatement.period` đã là `"YYYY-MM"` |
| **HH-3** | Khách hoàn tiền ⇒ **hoa hồng bị trừ lại** | ✅ khuôn có sẵn: `CommissionLine.isClawback` + `amount` âm |

> ⚠️ **Trần 8% không đổi.** `MAX_TOTAL_RATE = 0.08` và tổng 4 tầng Sale đúng bằng 8,00%.
> Thêm tầng thứ năm là mọi lần tính hoa hồng đều ném lỗi vượt trần. Nâng trần là quyết định
> chính sách tiền của Ban giám đốc, không phải việc kỹ thuật.

> ⚠️ **Máy tính hoa hồng chưa từng sinh ra một dòng nào trên thực tế.** Ba nguyên tắc trên là
> chính sách; việc cho nó chạy thật là phần đang làm.

---

## 4. Bốn trục tích hợp ngoài — CHỦ DỰ ÁN YÊU CẦU LÀM NGAY

Nguyên văn 27/08: *"hộp thư đa kênh, zalo 2 chiều, gọi điện ghi âm, chấm điểm ttv đưa vào thực
hiện luôn, tôi rất cần phần này không được hoãn nữa"*.

**Ghi rõ để sau này không tranh cãi:** trợ lý kỹ thuật đã nêu trước rằng hai trục Zalo và gọi
điện còn thiếu **văn bản nhà cung cấp** (gói Zalo OA có Open API; endpoint thật + giá bóc băng
+ cước viễn thông của OmiCall) và **bài thử SDK trên React 19**. Chủ dự án đã nghe và vẫn quyết
định làm ngay. Cách thực hiện đã thống nhất:

> Dựng **trọn phần không phụ thuộc thông tin nhà cung cấp** — mô hình dữ liệu, màn hình, khuôn
> nối, điểm nhận dữ liệu về — sao cho ngày có khoá kết nối chỉ còn **đổ biến môi trường + chạy
> thử** là chạy. Mọi đường nối ra ngoài chạy ở **chế độ mô phỏng** khi thiếu khoá, và **giao
> diện phải nói thật là chưa gửi đi được** — tuyệt đối không có nút báo thành công giả.

| Trục | Làm được ngay | Còn chờ |
|---|---|---|
| Hộp thư đa kênh | Mô hình dữ liệu, ánh xạ danh tính ngoài ↔ phiếu khách, màn hình, khuôn nối | — |
| Zalo OA hai chiều | Điểm nhận tin, đường gửi, hộp thư | Gói Open API (**2.500.000đ/12 tháng**) |
| Gọi điện + ghi âm | Mô hình cuộc gọi, điểm nhận dữ liệu cuộc gọi, kho ghi âm riêng tư, trang thử | Văn bản OmiCall (5 mục) + bài thử SDK 2 ngày |
| Chấm điểm tư vấn viên | Bộ máy chấm, thẻ điểm mẫu (đã có 21/08), cờ tắt + trần chi phí | Trần chi phí/tháng |

**Ràng buộc pháp lý không được bỏ khi làm trục gọi điện:**

- Bắt buộc chọn **mục đích cuộc gọi** trước khi gọi (*chăm sóc* vs *chào bán*). Gọi quảng cáo
  sai quy định: phạt **80–100 triệu**.
- **Lời thông báo ghi âm đầu cuộc gọi** + lưu cờ đã thông báo. Khách từ chối vẫn gọi được, chỉ
  tắt ghi âm. Căn cứ Luật 91/2025 + NĐ 15/2020, phạt tới 10 triệu cá nhân / 20 triệu tổ chức.
- **Ghi âm tuyệt đối không vào kho ảnh mặc định** (kho đó gắn `cdn.satarobo.vn`, mọi tệp tải
  được vô danh). Mọi lượt nghe đi qua điểm kiểm quyền + ghi nhật ký.

**Ràng buộc nghiệp vụ đã xác minh, không sửa được bằng mã:** Zalo OA **không nhắn trước được**
cho người chưa bấm "Quan tâm", và tin khách gửi tới **không bao giờ kèm số điện thoại**. Muốn
dùng OA thì phải kéo phụ huynh bấm Quan tâm trước — mã QR tại quầy, trên phiếu học thử, trên
trang cảm ơn. Đó là việc của lễ tân và marketing.

---

## 5. Ba khoá kết nối MISA — ĐÃ TÌM LẠI ĐƯỢC, không cần chờ ai

Ba tham số `MISA_WEBFORM_ID` / `MISA_WEBFORM_COMPANYCODE` / `MISA_WEBFORM_KEY` **đã có sẵn
trong lịch sử kho**, dưới dạng ba ô ẩn của biểu mẫu tĩnh cũ:

```bash
git show aeed5bd0:public/sale/nhap-lieu.html | grep -E 'name="(ID|Companycode|FormKey)"'
```

Chép ba giá trị đó vào ba biến môi trường tương ứng là xong. **Không cần quyền quản trị MISA
cho bước này.**

> 🔴 **Nhưng có một tham số thứ tư phải xác nhận từ MISA, và sai nó thì hỏng câm.**
> `MISA_WEBFORM_ALLOWURL` **phải trùng từng ký tự** với mã nhúng hiện tại của biểu mẫu bên MISA.
> Sai giá trị này thì **MISA vứt phiếu mà vẫn trả về mã 302 như thành công** — không lỗi, không
> cảnh báo, phiếu bốc hơi. Bài học 22/08/2026, đã mất nửa buổi vì nó.
> Hồ sơ đang có **hai giá trị mâu thuẫn**: mã nguồn mặc định `"*"`, biểu mẫu tĩnh cũ ghi
> `https://sale.satarobo.vn`. **Phải mở trang quản trị MISA đọc mã nhúng hiện tại để biết cái
> nào đúng** — đây chính là chỗ cần quyền quản trị MISA của Kiệt.

> ⚠️ **Lưu ý an toàn:** ba giá trị này từng nằm trong một tệp HTML **công khai** ở
> `sale.satarobo.vn` — bất kỳ ai xem mã nguồn trang đều đọc được, và về lý thuyết có thể bơm
> phiếu rác vào MISA. Sau khi trang nhập khách có đăng nhập tiếp quản, **nên đổi khoá biểu mẫu
> bên MISA** rồi cập nhật lại biến môi trường.

---

## 6. Trạng thái hạ tầng tại thời điểm chốt

| Việc | Trạng thái |
|---|---|
| Biến `SALE_SITE_ENABLED` | ✅ đã thêm — ⚠️ **CHƯA TRIỂN KHAI LẠI, nên chưa có hiệu lực** |
| Khoá nhánh `main` + `test` | ✅ đã bật |
| Nạp lại bảng quyền môi trường thật (`seed-prod-roles.yml`) | ⬜ **phải chạy mỗi lần đưa lên nhánh chính** — trợ lý có nhiệm vụ nhắc |

---

## 7. Việc phát sinh

| # | Việc | Từ | Ai làm |
|:--:|---|:--:|---|
| 1 | Site Sale hiểu "khách của tôi" khớp trang quản trị | câu 2 | kỹ thuật |
| 2 | Siết quyền tắt đồng hồ nhắc chăm sóc | câu 4 | kỹ thuật |
| 3 | Màu tím + thanh điều hướng 8 nhóm | câu 8 | kỹ thuật |
| 4 | Hoa hồng trên tiền đã thu, theo tháng, trừ lại khi hoàn tiền | HH-1..3 | kỹ thuật |
| 5 | Bốn trục tích hợp — phần không phụ thuộc nhà cung cấp | mục 4 | kỹ thuật |
| 6 | **Triển khai lại** để `SALE_SITE_ENABLED` có hiệu lực | mục 6 | người vận hành |
| 7 | Đọc mã nhúng MISA lấy giá trị `AllowURL` đúng | mục 5 | **Kiệt** (quản trị MISA) |
| 8 | Đòi văn bản OmiCall (5 mục) + xác nhận gói Zalo OA | mục 4 | chủ dự án |
| 9 | Duyệt **trần chi phí/tháng** cho Zalo · cước gọi · chấm điểm | mục 4 | chủ dự án + kế toán |
| 10 | Ký phụ lục xác nhận địa chỉ trang nhập khách | câu 7 | chủ dự án |

---

## 8. Bảy quyết định bổ sung — cùng ngày 27/08, sau khi 5 luồng đầu về

| # | Câu | **QUYẾT ĐỊNH** |
|:--:|---|---|
| **8.1** | Ai hưởng QC 1%? | **QC phụ trách cơ sở tại thời điểm kế toán xác nhận thu tiền**, lưu bằng **liên kết tài khoản**, không phải chuỗi tên. ⇒ quan hệ có hiệu lực theo thời gian; đổi người phụ trách KHÔNG viết lại lịch sử hoa hồng đã tính. Chủ dự án sẽ cấp danh sách cơ sở → tài khoản QC. |
| **8.2** | Ai hưởng Quản lý trung tâm 2%? | Thêm **`managerUserId`** (liên kết tài khoản) vào bảng cơ sở, điền tay một lần cho các cơ sở hiện có, **bắt buộc khi tạo cơ sở mới**. Chuỗi chữ hiện có **giữ nguyên, chỉ để hiển thị**. |
| **8.3** | Sửa lỗi hoàn tiền không trừ công nợ / cổng phụ huynh? | ✅ **CÓ — ưu tiên cao, tách đợt riêng, KHÔNG gộp vào PR nào khác.** Thứ tự bắt buộc: (1) xuất danh sách mọi ca đã hoàn, đối chiếu số phụ huynh đang thấy với số đúng; (2) mới đổi công thức; (3) thông báo cho phụ huynh bị lệch. Lý do: đây là **đường hoàn dư** — hoàn lần hai tính trên số gộp như thể lần một chưa xảy ra. |
| **8.4** | Trần chi phí/tháng | **Zalo 2.000.000đ · cước gọi 3.000.000đ · chấm điểm AI 1.000.000đ — tổng 6.000.000đ/tháng.** Kèm **dừng cứng khi chạm trần** + **cảnh báo mốc 80%**. Con số là tạm, điều chỉnh theo thực tế tháng sau ⇒ phải sửa được **không cần triển khai lại**. |
| **8.5** | 5 ô số bảng điều khiển Sale lọc theo gì? | **Giữ nguyên "được giao cho tôi"**, chỉ **đổi nhãn** thành *"Việc của tôi hôm nay"*. Bảng điều khiển để biết hôm nay gọi ai, không phải để đếm thành tích; xem "khách của tôi" đã có màn danh sách riêng. |
| **8.6** | Siết quyền chốt kỳ hoa hồng? | ✅ **CÓ.** Kế toán một cơ sở bấm được chốt kỳ cho cả công ty là rủi ro không cần thiết. **Đưa vào cùng đợt nạp lại bảng quyền sắp tới, đừng làm riêng.** |
| **8.7** | `centerId` hay `orgUnitId`? | **Sửa văn bản trước, di chuyển cơ chế sau.** `CLAUDE.md` luật cứng #3 đang nói ngược hệ thống đang chạy: cách ly cơ sở vẫn đo bằng `centerId`, nên bảng theo đúng luật thì **mất cách ly tự động**. Nay cho phép **giữ cả hai cột**, ghi rõ `centerId` là cột cơ chế đang đọc, `orgUnitId` là hướng đích. Chuyển cơ chế sang `orgUnitId` là **đợt riêng, chưa lên lịch** — không gấp tuần này nhưng đừng để sang tháng. |

### 8.8 Hai câu con của 8.1 mà quyết định chưa phủ

- **Một cơ sở có nhiều QC** thì chia đều hay một người đứng tên? — chủ dự án yêu cầu "chốt luôn quy tắc" nhưng chưa nêu quy tắc. Kỹ thuật tự quyết theo hướng **an toàn về tiền** và ghi rõ lựa chọn; chủ dự án đảo được bất cứ lúc nào.
- **Cơ sở chưa khai người hưởng** ⇒ tiền **treo, hiện rõ trên màn chốt kỳ, không gán bừa**. Giữ nguyên cơ chế đang có.

### 8.9 Hạ tầng

`SALE_SITE_ENABLED` — ✅ **đã triển khai lại 27/08**, biến đã có hiệu lực trên môi trường thử.
