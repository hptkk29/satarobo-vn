# F5 giai đoạn 2 — cấp tài khoản phụ huynh từ lúc HỌC THỬ

> **Trạng thái: ĐẶC TẢ, CHƯA DUYỆT, CHƯA CODE.** Viết ngày 10/08/2026 khi mở lại phạm vi
> F5. Giai đoạn 1 (kênh 1-1 sale↔phụ huynh **đã có tài khoản**) đã làm — xem commit
> `679339ee`. File này mô tả phần còn thiếu và cái giá của nó, để chủ dự án quyết.

## 1. Vì sao giai đoạn 1 chưa đủ

PRD nói thẳng F5 sinh ra để làm **kênh liên lạc giai đoạn học thử**:

> *"Lớp trial không có nhóm lớp. Học thử 4 buổi đã bị cắt; trial hiện là 1-1 kéo dài 1–3
> buổi tuỳ học viên. Kênh liên lạc giai đoạn trial là **F5 (1-1 Sale↔PH)** — không sinh
> `CLASS_GROUP` cho trial."* — `goc-ban-giao/PRD-chat-realtime-satarobo.md:137`

Nhưng mô hình dữ liệu hiện tại **không có ai ở đầu bên kia** trong giai đoạn đó:

| Giai đoạn | Đứa trẻ là gì | Phụ huynh là gì | Có `User` không |
|---|---|---|---|
| Lead / học thử | `LeadChild` (qua `TrialEnrollment`) | vài cột trên `Lead` (`name`, `phone`) | ❌ **không** |
| Sau chuyển đổi | `Student` | `User` (role `PARENT`), nối qua `Student.parentUserId` | ✅ có |

`Lead` **không có cột nào trỏ tới `User`**. Tài khoản phụ huynh chỉ ra đời lúc convert
lead → học viên (hoặc cấp tay ở `/admin/students/tai-khoan`).

⇒ Giai đoạn 1 phục vụ đúng tệp phụ huynh **đã chuyển đổi**. Với lead đang học thử, sale
vẫn phải dùng Zalo cá nhân như trước.

## 2. Giai đoạn 2 đòi hỏi những gì

Đây là **thay đổi nghiệp vụ**, không phải thêm màn hình.

### 2.1 Quyết định nghiệp vụ cần chủ dự án chốt

1. **Có cấp tài khoản cổng phụ huynh ngay khi lead vào học thử không?**
   Hệ quả: phụ huynh chưa mua gì đã có tài khoản đăng nhập. Cần biết họ được thấy gì —
   chỉ chat, hay cả lịch học thử / nhận xét buổi thử?
2. **Ai bấm cấp?** Sale khi xếp lịch học thử (tự động), hay một bước tay riêng?
3. **Tài khoản đó sống tiếp hay bị bỏ khi lead không chuyển đổi?** Nếu bỏ thì bỏ thế nào
   (khoá `isActive`, hay giữ nguyên để lần sau quay lại vẫn dùng)?
4. **Khi lead chuyển đổi thành học viên, tài khoản cũ có được dùng lại không** hay luồng
   convert lại tạo một `User` thứ hai bằng cùng số điện thoại? (Đây là chỗ dễ đẻ tài khoản
   trùng nhất — xem §3.)

### 2.2 Việc kỹ thuật kéo theo

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Cột nối `Lead → User` (ví dụ `Lead.parentUserId`) + migration | Không có nó thì không cách nào biết "phụ huynh của lead này là tài khoản nào" |
| 2 | Luồng cấp tài khoản từ lead | Dùng lại được hạ tầng sẵn có: `satarobo.vn/kich-hoat` + OTP Zalo (mẫu `616899` đã duyệt) |
| 3 | Mở rộng quan hệ nền của F5 | `findSaleAssignedEnrollmentIds` hiện chỉ đọc `Enrollment.saleId`; giai đoạn 2 phải cộng thêm nhánh `Lead.assignedToId` ↔ `Lead.parentUserId` **khi lead còn đang học thử** |
| 4 | Điều kiện đóng kênh | Hiện là "hết ghi danh còn hiệu lực". Thêm: lead chuyển `LOST`/quá hạn ⇒ ARCHIVED. Phải định nghĩa dứt khoát, nếu không kênh sống mãi |
| 5 | Hợp nhất khi convert | Lúc lead → học viên, kênh học thử và kênh sau chuyển đổi là **cùng một cặp user** ⇒ cùng `dmKey` (`SP:a:b`) ⇒ **tự động là một hội thoại, lịch sử liền mạch**. Đây là lợi ích sẵn có của thiết kế khoá hiện tại, đừng phá bằng cách đẻ khoá riêng cho lead |
| 6 | Test | Nhân bản bộ test F5 cho nhánh lead; thêm ca "lead LOST ⇒ ARCHIVED" và "convert ⇒ vẫn một hội thoại" |

## 3. Rủi ro phải nói trước

- **Tài khoản trùng theo số điện thoại.** Repo đã đăng nhập bằng SĐT (`AUTH-SĐT`). Cấp
  tài khoản ở giai đoạn lead rồi lại cấp lần nữa lúc convert là đẻ hai `User` cùng số —
  hoặc lỗi unique giữa luồng convert đang chạy tốt. **Phải xử lý ở bước thiết kế, không
  phải lúc gặp lỗi trên prod.**
- **Phụ huynh chưa mua gì đã có tài khoản.** Cần chốt họ thấy gì; lộ nhầm dữ liệu học viên
  thật là sự cố quyền, không phải lỗi giao diện.
- **Tăng tải cấp OTP.** Mỗi lead học thử là một lượt ZNS OTP (tiền thật). Nên có trần và
  chỉ cấp khi sale chủ động bấm.
- **`TrialEnrollment` gắn `LeadChild`, không phải `Student`.** Mọi truy vấn của giai đoạn 2
  đi nhánh dữ liệu KHÁC hẳn giai đoạn 1 — đừng cố nhồi vào cùng một câu SQL, tách hàm.

## 4. Đề xuất

Làm giai đoạn 2 **sau khi giai đoạn 1 chạy thật ít nhất một chu kỳ tuyển sinh**. Lý do:
giai đoạn 1 trả lời được câu hỏi quan trọng nhất mà hiện chưa ai biết — *sale có thực sự
dùng kênh trong app không, hay vẫn quay về Zalo?* Nếu câu trả lời là "vẫn Zalo", thì toàn
bộ §2 là công sức đổ vào một kênh không ai dùng.

Số đo để quyết: tỉ lệ sale mở kênh 1-1 và số lượt trả lời trong 30 ngày đầu — lấy được từ
`/admin/bao-cao/chat-pilot` sau khi bổ sung một dòng cho `DM_SALE_PARENT`.
