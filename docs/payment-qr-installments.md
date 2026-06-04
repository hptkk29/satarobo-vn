# Thanh toán QR + 2 đợt + nhắc công nợ (commit 4)

## Tài khoản nhận tiền (VietQR) — CHỜ NGƯỜI DÙNG cung cấp
- Cấu hình ở **/admin/tich-hop** (gate `settings:edit`): Mã NH (BIN 6 số), Số TK, Chủ TK.
- Lưu ở `IntegrationConfig` provider="VIETQR" (KHÔNG hardcode số tài khoản).
- Helper `lib/payments/vietqr.ts`: `getPaymentConfig/setPaymentConfig`,
  `buildTransferContent(studentName, parentPhone, courseName)`,
  `buildVietQrImageUrl(cfg, amount, addInfo)` → ảnh public `img.vietqr.io` (không cần API key).
- Chưa cấu hình → QR hiển thị "Chưa cấu hình" + link tới Tích hợp.

## QR ở đơn hàng
- `/admin/orders/[id]`: mục "Thanh toán & QR". Nội dung CK = `<Tên HV> <SĐT PH> <Tên khoá>`.
- Chốt deal xong → toast có nút "Đơn & QR thanh toán" mở đơn.

## 2 đợt (OrderInstallment — migration `20260604030000_order_installment`)
- Model: orderId, soDot(1/2), amount, status PENDING/PAID, dueDate, paidAt, lastReminderAt.
- `lib/orders/installments.ts`: `recordInstallmentPlan` (tổng 2 đợt = totalAmount, đợt 1 PAID ngay
  + đợt 2 PENDING có dueDate), `markInstallmentPaid`, tự `recompute` Order.paidAt/status.
- UI ghi nhận ở order detail (gate `orders:manage`). Tối đa 2 đợt.

## Nhắc công nợ đợt 2
- Cron **/api/cron/debt-reminder** (vercel.json `0 3 * * *`): quét OrderInstallment soDot=2 PENDING
  có dueDate trong ≤14 ngày tới → enqueue EMAIL nhắc (chống spam 1 nhắc/ngày qua `lastReminderAt`).
- Đóng đủ (status PAID) → ngừng nhắc. **Zalo OA** cắm ở commit 5.

## CHỜ NGƯỜI DÙNG
- Thông tin tài khoản ngân hàng (bank BIN + STK + chủ TK) để bật QR.
- (commit 5) ZALO_OA_ACCESS_TOKEN + template ZNS để nhắc qua Zalo.

## Test (KHÔNG đụng data thật, ZZTEST_)
1. Cấu hình VietQR ở /tich-hop → mở 1 đơn ZZTEST_ → thấy QR + nội dung CK đúng.
2. Ghi 2 đợt (đợt 1 đã thu + đợt 2 còn lại, hẹn ≤14 ngày) → Order status cập nhật.
3. Chạy GET /api/cron/debt-reminder (header cron) → EmailQueue có nhắc đợt 2 (PENDING), chạy lại trong
   ngày → bỏ qua (lastReminderAt). Đánh dấu đợt 2 đã đóng → không nhắc nữa.
