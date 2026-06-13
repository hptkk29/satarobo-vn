# R7-04 — Payment 2 tầng + Receipt + kế hoạch 2 đợt X ngày + công nợ đa chiều

**ID** R7-04 · **PR** 3 (PR1 Payment model+confirm flow, PR2 installment X + cron, PR3 Receipt + công nợ UI) · **Ưu tiên** P0 (nền cho convert) · **Ước lượng** XL · **Phụ thuộc** R7-03 · **Trạng thái** TODO · **US** US-PAY-1..4 · **SRS** §10, §26, §28.3 · **QĐ** O7

## 1. Mục tiêu & bối cảnh
Hiện trạng: Order.status đơn tầng + `confirmedByUserId/confirmedAt` (schema:2711–2713), `confirmOrderPayment` idempotent; `OrderInstallment` 2 đợt nhưng nhắc cứng 14 ngày (debt-reminder route.ts:19); không có Receipt/phiếu điều chỉnh; PH thấy theo Order.status. SRS đòi 2 tầng trạng thái đầy đủ (Sale ↔ Kế toán: xác nhận/từ chối/hoàn/điều chỉnh), phiếu thu riêng per Enrollment, X ngày override.

## 2. Phạm vi
- **In:** model `Payment` 2 tầng; flow Kế toán xác nhận/từ chối/hoàn/điều chỉnh; `Receipt` per Enrollment (nhiều phiếu); `reminderDays` per installment (QĐ-O7); cron nhắc đọc per-row + nhắc-ngay; trang công nợ đa chiều; portal đổi nguồn sang Payment đã xác nhận.
- **Out:** cổng thanh toán online (Q14 — backlog); refund WORKFLOW đầy đủ của BA #04 US-R6E-2 (chỉ trạng thái REFUNDED + bút toán âm; công thức hoàn chờ TBD-2 của BA #04).

## 3. Thiết kế kỹ thuật
- `Payment{id, orderId FK, enrollmentId FK?, amount, method, paidDate, evidenceUrl?, note?, saleStatus enum(RECORDED/COLLECT_CONFIRMED), accountantStatus enum(PENDING/CONFIRMED/REJECTED/REFUNDED/ADJUSTED), recordedById, confirmedById?, confirmedAt?, rejectReason?, adjustmentOfId? self-FK, centerId}` — KHÔNG xóa cứng khi accountantStatus=CONFIRMED (chỉ tạo bản ghi ADJUSTED trỏ `adjustmentOfId`).
- 2-phase map: Order CONFIRMED hiện hữu được helper đọc như "đã xác nhận" (không backfill — dữ liệu cũ là test, QĐ-O6/E6).
- `Receipt{id, code 'RCP-{CENTER}-{YY}-{SEQ}' (Counter), enrollmentId, paymentId, issuedById, issuedAt}` — sinh khi Kế toán CONFIRMED; mỗi Enrollment nhiều Receipt; không gộp hóa đơn nhiều con (§10.4).
- OrderInstallment + `reminderDays Int?` (null→đọc SystemSetting default 14). Cron debt-reminder: `dueDate − reminderDays ≤ today` → nhắc (giữ chống spam `lastReminderAt`); khi tạo kế hoạch mà ngày nhắc ≤ hôm nay → tạo nhắc NGAY + cảnh báo UI cho Sale.
- Công nợ: `debt(enrollment) = finalPrice − Σ Payment(accountantStatus=CONFIRMED)`; trang `/admin/cong-no` group theo Enrollment/HV/PH/cơ sở/Sale + bucket quá hạn (chưa/1–7/8–30/>30 ngày); scopedDb.
- Transaction cho mọi mutation tiền; AuditLog đủ before/after + reason (reject/adjust/refund bắt buộc reason). Event sau commit: `payment.confirmed` → notify PH + portal.

## 4. Acceptance Criteria
- AC1: Sale ghi nhận khoản → saleStatus=RECORDED, accountantStatus=PENDING; PH **không** thấy.
- AC2: Kế toán CONFIRMED → công nợ giảm, Receipt sinh, PH thấy + nhận thông báo.
- AC3: REJECTED bắt buộc reason → Sale được báo; REFUNDED/ADJUSTED không xóa bản gốc, tạo bản điều chỉnh trỏ gốc.
- AC4: Kế hoạch 2 đợt: đợt 2 tự tính; X mặc định 14 từ setting, Sale nhập X=7 → nhắc đúng D-7; ngày nhắc ≤ hôm nay → nhắc ngay + cảnh báo.
- AC5: Sale không bấm được nút xác nhận thực thu; Kế toán không sửa nội dung bản ghi của Sale (chỉ đổi tầng kế toán).
- AC6: Công nợ đa chiều đúng công thức + đúng scope cơ sở.

## 5. Files dự kiến
schema + migration `add_payment_two_tier_receipt` · `lib/finance/{payment.ts,receipt.ts,debt.ts}` (+tests) · `app/(admin)/admin/payments/*` · `app/(admin)/admin/cong-no/page.tsx` · sửa `app/api/cron/debt-reminder/route.ts` · `lib/portal/billing.ts` · `tests/e2e/r7/payment-two-tier.spec.ts` · Vitest `lib/finance/*.test.ts`.

## 6. Edge cases & xử lý lỗi
Xác nhận 2 lần (idempotent — giữ pattern confirmOrderPayment) · tổng Payment CONFIRMED > finalPrice → cảnh báo thừa, cho phép (hoàn sau) · đợt 2 đổi ngày sau khi tạo → tính lại ngày nhắc + reset lastReminderAt · reminderDays > khoảng cách tới dueDate → nhắc ngay 1 lần · Kế toán reject khoản đã sinh Receipt → thu hồi receipt (status VOID) + audit.

## 7. Rollback / Feature flag
PR1 đứng sau flag UI (menu Payments ẩn được); cron giữ tương thích: row không có reminderDays → hành vi cũ 14 ngày. Không drop Order flow cũ trong R7.

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-04-C1 | T1/T5 | B | Sale ghi nhận → login PH | portal không hiện khoản | Playwright |
| R7-04-C2 | T1 | B | Kế toán confirm | nợ giảm + Receipt + PH thấy + notify | Playwright |
| R7-04-C3 | T9/T7 | B | reject không reason / adjust khoản CONFIRMED | reason bắt buộc; bản gốc còn nguyên + bản ADJUSTED trỏ gốc | Playwright |
| R7-04-C4 | T3 | B | X=7, dueDate=D → chạy cron D-8/D-7/D-6 | chỉ D-7 sinh nhắc (1 lần/ngày) | Vitest inject now |
| R7-04-C5 | T3 | B | tạo kế hoạch có ngày nhắc = hôm qua | nhắc ngay + cảnh báo Sale | Vitest |
| R7-04-C6 | T4 | B | Sale gọi confirm action; KT sửa amount bản Sale | đều chặn | Playwright |
| R7-04-C7 | T1/T5 | B | trang công nợ: số đúng công thức; QL@CS1 chỉ thấy CS1 | đúng | Playwright |
| R7-04-C8 | T6 | B | double-click confirm | 1 Receipt duy nhất | Playwright |
| R7-04-C9 | T8 | E | lỗi DB giữa confirm (mock) | rollback, không Receipt mồ côi | Vitest |

## 9. Test data
Enrollment finalPrice 9tr; khoản đợt 1=5tr; installment đợt 2=4tr dueDate +20d; users Sale/Kế toán/PH; SystemSetting default 14.

## 10. RTM
AC1↔C1 · AC2↔C2,C8 · AC3↔C3 · AC4↔C4,C5 · AC5↔C6 · AC6↔C7 · resilience↔C9.

## 11. DoD
DoD chuẩn + demo D3 + cập nhật docs/payment-qr-installments.md (mục X override).
