# NỢ — thống nhất đơn giá hoàn tiền (cần đo TRƯỚC/SAU trên prod)

> **Trạng thái: GHI NHẬN, CHƯA LÀM.** Chủ dự án chốt 21/09/2026 khi duyệt PR #322:
> *"Hai đơn giá giữ tách, ghi ticket … không làm trong phiên này."*
>
> Tệp này tồn tại để ngày ai đó định gộp hai con số thì họ gộp **có chủ đích**, không phải
> vì tưởng chúng vốn là một.

## Hai đơn giá, hai mẫu số

| Đường | Mẫu số | Ở đâu |
|---|---|---|
| **Dừng học** (PHIÊN D, 21/09/2026) | `Course.totalSessions` — số buổi **CAM KẾT** của khoá | `lib/finance/dung-hoc.ts` |
| **Hoàn tiền** (W3-1 / LMS-9, có từ trước) | `count(ClassSession != CANCELLED)` — số buổi **ĐÃ XẾP** của lớp | `lib/finance/refund.ts` → `computeRefund` |

Hai đường còn khác nhau ở **tử số phụ** nữa, và điều đó đáng nói không kém mẫu số:

| | Dừng học | Hoàn tiền |
|---|---|---|
| học phí lấy từ | `OrderItem.totalPrice − discountAmount` | `Enrollment.finalPrice ?? tuition` |
| số buổi đã học đếm theo | **NGÀY** ≤ buổi cuối người xác nhận | `status = COMPLETED` |
| làm tròn | xuống tới **1.000đ**, phần lẻ dồn buổi cuối | `Math.round(finalPrice / sessionsTotal)` |

⚠️ Khác biệt "học phí lấy từ đâu" **không phải chuyện nhỏ**: `Enrollment.finalPrice` đang
mang **giá LỚP NHÓM** cho các đơn Coach 1-1/1-2/1-4 — nợ đã ghim ở `[HTL-09]`
(`lib/orders/hinh-thuc-lop.test.ts`). Tức đường hoàn tiền cũ đang đọc một con số **đã biết
là sai** cho một nhóm đơn; đường dừng học đọc `OrderItem` nên không dính. Thống nhất mà
thống nhất về phía `Enrollment.finalPrice` là **kéo cái sai sang chỗ đang đúng**.

## Vì sao KHÔNG gộp ngay

Gộp là đổi con số tiền mà kế toán sẽ chi. Đúng lớp việc bắt buộc phải có phép đo TRƯỚC/SAU
trên prod (khuôn: `docs/truoc-sau-hoan-tien-no4.md`), và lượt PHIÊN D đã đủ dài.

Chưa có gì hỏng ngay: hai đường phục vụ hai câu hỏi khác nhau và hiện **không cộng vào
nhau** ở bất kỳ báo cáo nào. Cái giá của việc để tách là một dòng khó giải thích trên màn
`/admin/hoan-tien` khi cùng một bé có cả hai loại dòng — `orderCode` phân biệt được.

## Làm gì khi tới lượt

1. **Đo trước.** Chạy câu 3 của `docs/do-khoa-thieu-so-buoi-cam-ket.md` trên prod: nó in ra
   từng lớp có `buổi đã xếp ≠ totalSessions`, và cột `lech` chính là chỗ hai đơn giá rẽ.
   `lech = 0` ở mọi lớp ⇒ gộp không đổi số nào, việc thành dọn dẹp thuần.
2. **Chọn mẫu số**, và chọn có lý do viết ra. Khuyến nghị của người viết PHIÊN D: lấy
   `Course.totalSessions` — phụ huynh mua "48 buổi", không mua "số buổi phòng đào tạo xếp
   được". Nhưng đó là quyết định của chủ dự án, không phải của mã.
3. **Vá `[HTL-09]` trước hoặc cùng lượt** nếu chọn giữ `Enrollment.finalPrice` làm tử số.
4. **Bảng TRƯỚC/SAU** cho mọi `RefundRequest` còn `PENDING` + mọi ghi danh sẽ đổi số, gửi
   kế toán trước khi deploy.
5. Ba cột snapshot của `RefundRequest` (`sessionsTotal` · `sessionsLearned` · `unitPrice`)
   **đang mang hai nghĩa** tuỳ dòng sinh ra từ đường nào — xem khối chú thích ở
   `taoYeuCauHoanTuDungHoc`. Gộp xong thì chúng về một nghĩa; trước đó thì **đừng cộng hai
   nhóm dòng lại**.

## Cái ticket này KHÔNG bao gồm

- Đổi cách đếm buổi đã học của đường hoàn tiền cũ (`COMPLETED` → theo NGÀY). Đó là một
  quyết định riêng, và `lib/finance/lop-chua-chot-buoi.ts` đã viết hẳn lý do vì sao đường
  cũ **cố ý** từ chối thay vì tự đoán.
