# Sổ thu theo đợt + phân bổ waterfall

> Chốt 03/08/2026. Đây là nguồn đúng nhất cho phần tiền của luồng
> *tạo đơn → giảm giá → 1/2 đợt → QR → tiền về → tự xác nhận → cấp TK phụ huynh*.

## Vì sao phải làm

QR in theo **tổng đơn**, còn webhook **từ chối mọi giao dịch nhỏ hơn tổng đơn**.
Khách chọn 2 đợt, quét QR đóng đợt 1 → QR sai số tiền, giao dịch bị xếp vào diện
"trả thiếu, chờ xử lý tay". **Cơ chế tự xác nhận chưa bao giờ chạy được với khách
trả góp** — chỉ đúng với khách đóng một lần đủ tiền.

## Bốn quyết định của chủ dự án

| # | Quyết định | Hệ quả |
|---|---|---|
| 1 | **payOS thật, VA per phiếu thu** | Thêm `lib/payments/payos.ts`; SePay GIỮ làm đường dự phòng, không gỡ |
| 2 | **Đợt 1 mặc định `PENDING`**, chỉ `PAID` khi tiền về | Đổi ngữ nghĩa cũ ("đợt 1 = tiền mặt sale đã thu tại quầy") — chỉ áp cho sổ MỚI, `OrderInstallment` giữ nguyên |
| 3 | **Sổ mới là nguồn sự thật**; `Payment`/`OrderInstallment` thành dẫn xuất | Cutover phải sau cờ, sau shadow-compare |
| 4 | **Phiếu thu theo đợt CHỈ sinh khi QLCS bấm duyệt** | `recordInstallmentPlan` thành bản nháp; `approveInstallmentPlan` là nơi duy nhất sinh phiếu |

## Bất biến — vi phạm cái nào là sai thiết kế

1. **Hạn 5–10 phút của QR KHÔNG BAO GIỜ là điều kiện đối khớp.** `expiresAt` chỉ để
   (a) hiển thị đếm ngược, (b) chặn 2 QR sống song song. PH quét QR hết hạn mà tiền
   vẫn về thì tiền đó **phải phân bổ bình thường**. Mọi đoạn
   `if (session.expiresAt < now) return reject()` trong đường webhook là **tái tạo
   lại đúng con bug đang sửa**.
2. **Số tiền không phải khoá đối khớp.** Khoá là `matchKey` (VA) hoặc
   `providerOrderCode`. Số tiền chỉ dùng để *phân bổ*, không dùng để *chấp nhận /
   từ chối*.
3. **Một đợt có nhiều QR trong đời, tất cả trỏ về đúng một phiếu thu.** Sale tạo lại
   QR lần thứ 5 thì tiền vẫn rơi đúng đợt đó ⇒ `matchKey` bền theo đời phiếu,
   `regenerateQr` **không được đụng** vào nó.
4. **Phiếu thu theo đợt chỉ sinh bởi `materializeInstallmentRequests`**, gọi từ
   đường duyệt kế hoạch. Đơn chưa duyệt → đúng **một** phiếu `installmentNo = 0`.
   Nếu không, quét QR đợt 1 thành đường lách quy trình duyệt trả góp.
5. **Idempotent tuyệt đối** theo `providerTxnId` — cổng retry là chuyện thường.
6. **Chống race** bằng `$transaction` + `pg_advisory_xact_lock` theo `orderId`.
   ⚠️ Dùng `$executeRaw`, **không** `$queryRaw` (hàm trả `void` → Prisma ném
   "Failed to deserialize column of type 'void'" — bug PR #76, có test hồi quy).
7. **Cách ly cơ sở** qua `scopedDb` + `SCOPED_MODELS`. Riêng `BankTransaction` nằm
   trong `NULL_IS_GLOBAL_MODELS`: `centerId = null` nghĩa là *chưa khớp được về cơ
   sở nào*, và đó chính là nhóm mọi người đối soát cần thấy.

## Mô hình

```
Order ──< PaymentRequest ──< QrSession        (nhiều QR / 1 phiếu, matchKey bền)
                │
                └──< PaymentAllocation >── BankTransaction   (sổ phân bổ)
                                              │
                                              └── dư → CreditBalance
```

`PaymentRequest.status` **là kết quả tính** từ `PaymentAllocation`
(`deriveStatus`), không phải cờ gán tay.

## Luồng webhook

1. Verify chữ ký → sai: 401 + log, dừng.
2. Upsert `BankTransaction` theo `providerTxnId`. Đã xử lý → 200 ngay.
3. `$transaction` + advisory lock theo `orderId`.
4. Tìm đích: `matchKey` → `providerOrderCode`/`QrSession` → không ra thì
   `UNMATCHED` (**ngoại lệ thật duy nhất được rơi vào xử lý tay**).
5. `planAllocation` (waterfall): rót phiếu đích → tràn sang phiếu chưa đủ kế tiếp
   → hết phiếu thì `CreditBalance`. Thiếu → `PARTIAL`, **không từ chối, không hoàn**.
6. Dung sai làm tròn: thiếu ≤ `payment.roundingToleranceVnd` (mặc định 5.000đ) →
   coi `PAID`, ghi phần tha.
7. Tính lại status phiếu + rollup Order.
8. **Sau commit** mới side-effect (xác nhận đơn, cấp TK phụ huynh, biên nhận).
   Không gọi API ngoài trong transaction.

## Cutover

Sổ mới chạy **song song** sổ cũ. Cờ `PAYMENT_LEDGER_V2` **mặc định TẮT** — prod vẫn
tính công nợ như cũ. Chỉ lật sau khi `scripts/shadow-compare-debt.ts` không còn
chênh lệch chưa giải thích được. `OrderInstallment` đang được đọc ở **10 file**,
công nợ tính ở **14 file** (có cả màn học phí của phụ huynh) — đây là lý do cutover
là bước riêng, không gộp.

## Việc còn phải làm tay

- Cấp credential payOS trên Vercel: `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`,
  `PAYOS_CHECKSUM_KEY`, `PAYOS_LIVE`. Thiếu → chạy **chế độ mô phỏng**, không đụng
  tiền thật (mẫu `ZALO_LIVE`).
- Chạy backfill + shadow-compare trên DEV trước, đọc bảng chênh lệch, rồi mới quyết
  cutover. **Không chạy trên prod khi chưa duyệt.**
