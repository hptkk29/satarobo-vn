# automation.md — Tự động hoá: webhook SePay

Module không có agent/LLM. Đường tự động hoá duy nhất là webhook SePay.

| Mục | Nội dung |
|---|---|
| Kích hoạt | SePay gọi POST khi có biến động số dư tài khoản nhận |
| Chủ sở hữu | Dev lead (mã), Kế toán (đối soát) |
| Chạy tự động hay chờ duyệt | Tự động hoàn toàn cho khớp kỳ thu OPEN; mọi trường hợp khác chỉ đưa tiền vào ví hoặc "Cần xử lý" để người xử lý |
| Đầu vào được đọc | Payload SePay (số tiền, nội dung, mã giao dịch, số tài khoản/VA, thời gian); bảng kỳ thu, gia đình, SĐT |
| Được phép ghi | Log giao dịch; `Payment` loại PAYMENT; `GuardianWalletEntry` loại OVERPAY / UNMATCHED_TO_WALLET; `MoneyOperation` loại RECEIPT_ALLOCATE; thông báo nội bộ |
| Không được phép | TRANSFER, REFUND, QUYẾT TOÁN, đổi trạng thái ghi danh, đổi đợt thu, huỷ kỳ thu, gọi `allocateByWeight`, gọi ra ngoài |
| Rào chắn cứng (không phải cấu hình mềm) | Xác thực khoá; unique `bankTxnId`; khoá gia đình; bất biến B1–B9; kỳ thu không OPEN → không phân bổ vào ghi danh |
| Hợp đồng đầu ra | Luôn trả 200 sau khi đã lưu log (kể cả khi không khớp); 401 khi sai khoá (có log cảnh báo); 500 chỉ khi không lưu được log |
| Xử lý lỗi ghi | Bất biến vi phạm → rollback phân bổ, log vẫn còn, dòng "Cần xử lý: lỗi ghi", thông báo Dev lead |
| Nhật ký | Log giao dịch + `MoneyOperation` + trang `/admin/bien-dong-so-du` |
| Giới hạn tần suất | Không giới hạn phía app (SePay là nguồn tin cậy sau xác thực); chống trùng bằng `bankTxnId` |
| Công tắc tắt khẩn | `billing.flexV1Enabled` TẮT → webhook quay về đường cũ; khoá SePay đổi → dừng hẳn |
| Giám sát im lặng | `cron/giam-sat-sepay` (US-24/AC3) |
