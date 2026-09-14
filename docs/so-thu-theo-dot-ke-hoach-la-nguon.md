# Kế hoạch là NGUỒN, "đã thu" là KẾT QUẢ — bỏ ô gõ tay

> Chốt của chủ dự án 14/09/2026: *"chỉ cần set đúng kế hoạch thanh toán và bấm lưu thì ra
> QR và công nợ khi xác nhận thanh toán là luôn đúng"*. Tức kế hoạch chỉ khai **số tiền +
> hạn**; ô ☑ "đã thu" trên form
> (`app/(admin)/admin/orders/_components/order-payment-section.tsx:385`) biến mất, và
> "đợt này đã thu chưa" **suy ra từ tiền thật**.
>
> Tài liệu này là bản thiết kế thi hành. Đọc kèm `docs/so-thu-theo-dot.md` (nền sổ thu
> 03/08) — bốn quyết định ở đó vẫn sống, chỉ QĐ-4 ("phiếu đợt chỉ sinh khi duyệt") đã bị
> đảo hai lần và nay không còn.

---

## 1. Vì sao ô "đã thu" tồn tại — và vì sao không gỡ trắng được

Repo có **hai sổ**, và ô ☑ là cây cầu gõ tay duy nhất giữa chúng.

| | Sổ A — `Payment` | Sổ B — `PaymentRequest` + `PaymentAllocation` |
|---|---|---|
| Ai đọc | `/cong-no`, cổng phụ huynh, ZNS, `congNoDon` trên màn đơn | **Mã QR** (`_qr-core.ts:418` → `outstandingOfRequest`), webhook đối khớp |
| Đường GHI | `recordPayment` (tiền mặt) · `ensureOrderPaymentRecorded` (marker) · `payos-ingest.ts:1059` · `backfill-order.ts:112` · bút toán âm hoàn tiền | **CHỈ** `allocateToOrder` (`payos-ingest.ts:897`) |

`PaymentAllocation.bankTransactionId` là **FK BẮT BUỘC** (`prisma/schema.prisma:6289`), và
`BankTransaction` chỉ sinh ở `payos-ingest.ts:800` — tức trong webhook cổng. **Tiền mặt tại
quầy không có đường nào vào sổ B.** Không ai tính được "đợt 1 đã thu chưa", nên phải hỏi
người dùng. Đó là toàn bộ lý do tồn tại của cái ô.

⇒ **Việc phải làm không phải là "gỡ ô". Việc phải làm là mở cho sổ B nhận được tiền không
qua ngân hàng.** Gỡ ô trước khi mở cửa là biến mọi đơn thành "chưa thu đồng nào".

### Bằng chứng lệch đang sống

Đơn `ORD-260913-000001` (satarobo_local, 8.000.000đ):
`OrderInstallment D1 = PAID` · 1 `Payment` 1.000.000đ `[backfill-import]` ·
`PaymentRequest` D1/D2/D3 đã rót **0đ** · **0 `PaymentAllocation`**.
Trên 496 đơn: 77 đã thu một phần chưa có kế hoạch · 116 chưa thu đồng nào · 303 đã thu đủ ·
0 đơn có kế hoạch (trước khi chủ dự án tự tạo đơn trên).

---

## 2. Quyết định thiết kế

**QĐ-A — Cửa tiền mặt là một `BankTransaction` giả.** `provider` là `String` tự do
(`schema.prisma:6259`) và `@@unique([provider, providerTxnId])` cho idempotency sẵn. Tiền mặt
đi qua `provider: "CASH"`, đối soát ngược dữ liệu cũ đi qua `"BACKFILL"`, hoàn tiền đi qua
`"REFUND"`.
**0 MIGRATION cho toàn bộ 5 đợt.** `PaymentAllocation.amount` là `INTEGER NOT NULL` không
CHECK ⇒ nhận số âm cho đợt hoàn tiền. Không đụng bảng có dữ liệu prod = không chạm luật cứng #4.

⚠️ **KHÔNG chọn phương án "cho `bankTransactionId` nullable + thêm `paymentId`"**: đó là
ALTER trên bảng đang có dữ liệu prod, và nó đẻ một nhánh thứ hai trong `allocateToOrder` —
nhánh mà webhook không bao giờ chạy qua nên không ai biết nó hỏng.

**QĐ-B — MỌI tiền rót vào sổ B đi qua đúng `allocateToOrder`.** Chú thích ở
`payos-ingest.ts:880-890` đã nói vì sao: rót tiền không chỉ là ghi một dòng — còn advisory
lock theo đơn, đọc lại trong khoá chống rót đôi, tính lại trạng thái **từ sổ**, ghi
`CreditBalance` cho tiền dư, ghi song song sổ A, rồi mới tới chốt đơn + cấp tài khoản PH.
Bản thứ hai chắc chắn bỏ sót.

**QĐ-C — `OrderInstallment` là bảng KẾ HOẠCH, `PaymentRequest` là bảng TIỀN.** Không gộp,
không chuyển cron sang đọc phiếu. Cái duy nhất đổi chủ: ai quyết `OrderInstallment.status`.
Sau cutover **đồng bộ MỘT CHIỀU `PaymentRequest → OrderInstallment`**, không bao giờ ngược.

⚠️ Hai chiều là bảo đảm đánh nhau: hôm nay `markInstallmentPaid`
(`lib/orders/installments.ts:455`) chạy chiều ngược (OrderInstallment PAID → ghi sổ A).
Đợt 3 phải cắt chiều đó, không để hai người viết cùng một ô.

**QĐ-D — `amountDue` của phiếu có LUẬT SÀN, không VOID-tạo-mới.** Xem §3.5.

---

## 3. Năm ca đã đo là sẽ vỡ — trả lời từng ca

### 3.1 Tiền mặt tại quầy đi đường nào

File mới `lib/payments/cua-tien-mat.ts`:

```ts
export async function cuaTienMat(params: {
  order: AllocationOrder;        // đã qua passesScope ở Server Action
  soTien: number;
  paymentId: string;             // dòng Payment (sổ A) người gọi VỪA ghi
  now: Date;                     // ⚠️ BẮT BUỘC — luật 19, hàm không đọc đồng hồ
  provider: "CASH" | "BACKFILL";
}): Promise<IngestOutcome>
```

1. `bankTransaction.create({ provider, providerTxnId: paymentId, amount, transferredAt: now,
   centerId: order.centerId, status: "UNMATCHED" })`.
2. Tra phiếu chưa đóng đủ sớm nhất → `allocateToOrder({ …, ghiSoCu: { kieu: "DA_GHI", paymentId } })`.

`providerTxnId = paymentId` là chọn có chủ đích: khoá `@@unique(provider, providerTxnId)`
làm idempotency **và** làm dấu vết ngược "dòng phân bổ này sinh từ khoản thu nào" — thứ mà
đợt hoàn tiền (§3.4) cần để biết rút tiền ra khỏi phiếu nào.

⚠️ **`ghiSoCu` là tham số BẮT BUỘC, KHÔNG mặc định** (luật 7). `allocateToOrder` hiện ghi sổ
A vô điều kiện ở `payos-ingest.ts:1042-1070`. Nếu cửa tiền mặt gọi mà không tắt khối đó thì
**cộng đôi**: `recordPayment` ghi một dòng, `allocateToOrder` ghi dòng thứ hai marker
`[auto:cash:…]`. Để `ghiSoCu` có mặc định `"TU_DONG"` là mời đúng lỗi đó ở mọi call-site sau
này; bỏ mặc định thì `tsc` liệt kê cả 2 chỗ gọi hiện có (`payos-ingest.ts:862`,
`bien-dong-so-du/_actions.ts:185`) và bắt chỗ mới khai ra.

⚠️ **`centerId` phải đặt ngay lúc `create`, không đợi `allocateToOrder` update.**
`BankTransaction` nằm trong `NULL_IS_GLOBAL_MODELS` (`lib/db-scope.ts:135`): `centerId = NULL`
nghĩa là *chưa khớp cơ sở nào* và **hiện với mọi người**. Đường webhook để null là đúng (chưa
biết đơn nào); cửa tiền mặt thì biết thừa — để null là phơi giao dịch của CS1 sang CS2 trong
khoảng giữa hai lệnh ghi.

⚠️ **`/bien-dong-so-du` phải lọc `provider: { in: ["PAYOS", "SEPAY"] }`.** Màn đó là hàng chờ
đối soát *ngân hàng*; không lọc thì mỗi lần sale thu tiền mặt là thêm một dòng vào sổ sao kê
và kế toán mất niềm tin vào màn đó trong đúng một tuần.

⚠️ **Quyền ở NGOÀI cửa.** Hai chỗ gọi mang hai quyền khác nhau —
`recordPaymentAction` gác `payments:record`, `markOrderInstallmentPaidAction` gác
`orders:manage`. Không nhét `checkPermission` vào `cuaTienMat`; giữ nếp repo (gác ở Server
Action) và giữ cho hàm này gọi được từ script đối soát chạy không có session.

### 3.2 R-02 sau khi bỏ ô — chặn cái gì, thôi chặn cái gì

Cổng hiện tại `keHoachLamMatTien` (`lib/payments/plan-money-guard.ts:69`) có hai nhánh:

* (a) `fullOrderAllocated > 0` → chặn. **GIỮ NGUYÊN**, không liên quan tới cái ô.
* (b) `boSot = daThu − max(tienCacDotDaThu, daRot) > 0` → chặn.

Bỏ ô ⇒ `tienCacDotDaThu` không còn tồn tại **như một khái niệm**, không phải bằng 0. Truyền
0 vào công thức cũ là chặn mọi đơn có tiền ở sổ A. Nên trường đó bị **gỡ khỏi
`PlanMoneyState`** và nhánh (b) rút gọn:

```
boSot = daThu − daRot      // Σ Payment RECORDED  −  Σ PaymentAllocation
```

Ý nghĩa cũng đổi, và đây là điểm quan trọng nhất của cả cổng: nó **thôi đo "kế hoạch nhận
thiếu"** và bắt đầu **đo "hai sổ đang lệch"**. Đó vẫn là lý do chặn chính đáng — lưu kế
hoạch sẽ VOID phiếu toàn đơn đang là chỗ duy nhất ghi nhận khoản lệch ấy
(`payment-request.ts:319-324` VOID vô điều kiện), và `outstandingOf` trả 0 cho phiếu VOID
(`allocation.ts:43`) ⇒ tiền rơi khỏi mọi phép tính.

Sau khi cửa tiền mặt sống + dữ liệu cũ đã đối soát ngược, `daThu == daRot` cho mọi đơn ⇒
nhánh (b) **im lặng ở ca thường** và chỉ kêu khi có lệch thật. Nhưng thứ tự là bắt buộc:

⚠️ **Chạy §3.6 (đối soát ngược) TRƯỚC khi gỡ ô.** Làm ngược lại thì 77 đơn "đã thu một phần"
+ 1 đơn ORD-260913-000001 đều có `daThu > 0, daRot = 0` ⇒ **cổng chặn mọi lượt lưu kế hoạch
trên toàn bộ đơn cũ**. Đó là khoá cứng màn đơn, không phải bảo vệ.

⚠️ **Câu nói của cổng phải đổi.** Hiện nó bảo *"Sửa số tiền đợt 1 cho khớp"*
(`plan-money-guard.ts:96`) — sau khi bỏ ô thì người bấm **không còn ô nào để sửa**, và một
cổng chỉ đường tới nơi không tồn tại thì người ta học cách bỏ qua nó. Câu mới phải trỏ
`/bien-dong-so-du` và nêu đúng số lệch.

### 3.3 Cửa sổ nhắc nợ SAI trong lúc chuyển đổi

Cron đọc `OrderInstallment` — `status: "PENDING"` + `dueDate: { not: null }`
(`app/api/cron/debt-reminder/route.ts:35-40`, và `remindOverdueInstallments`
`lib/finance/debt.ts:329`). `PaymentRequest` không có `reminderDays`/`lastReminderAt` ⇒
**không chuyển cron sang sổ B** (QĐ-C).

**Có hai cửa sổ sai, khác nhau, phải đóng khác nhau.**

**Cửa sổ 1 — tiền đã về mà đợt còn PENDING.** Đóng bằng `dongBoSoDotCu(tx, orderId)` gọi
cuối `recomputeRequestStatuses` (`payment-request.ts:420`), **trong cùng transaction**: với
mỗi `PaymentRequest` `installmentNo > 0` mà `status = PAID` → đặt `OrderInstallment` cùng
`soDot` thành `status: PAID, paidAt: now, dueDate: null`.
`dueDate: null` không phải tiện tay: đó chính là điều kiện `dueDate: { not: null }` đang giữ
cho lượt quét không ôm đợt đã thu (chú thích `debt-reminder/route.ts:33-34`).

⚠️ **MỘT CHIỀU.** Không bao giờ hạ `PAID → PENDING`, kể cả khi allocation biến mất. Hạ
xuống là gửi giấy đòi nợ cho người đã đóng — hỏng theo hướng tệ nhất có thể.

**Cửa sổ 2 — kế hoạch vừa lưu, chưa ai kịp thu.** Đây là cửa sổ do chính việc bỏ ô sinh ra và
**dễ bị bỏ quên nhất**. Hôm nay đợt đã thu được ghi `dueDate: null`
(`order-payment-section.tsx:157`). Bỏ ô ⇒ **mọi** đợt đều có hạn, và `hanChoDot`
(`ke-hoach-dot.ts:67`) cho đợt 1 đến hạn **NGAY hôm nay** — có chủ đích, chú thích ở đó nói
rõ. Với `reminderDays` mặc định 14, `isReminderDue(dueDate, 14, now)` là `dueDate − 14 ≤ now`
⇒ **đúng buổi tối hôm lưu kế hoạch, phụ huynh nhận tin nhắc đóng khoản vừa đưa tiền mặt ở
quầy chiều đó.**

Đóng bằng một điều kiện, không bằng việc dời hạn: thêm `finance.debtReminderGraceHours`
(mặc định 24) — bỏ qua đợt có `OrderInstallment.createdAt > now − grace`. Rẻ, một dòng,
test được, và nó nói đúng rủi ro thật: *kế hoạch vừa lập, chưa ai kịp thu.*

⚠️ Đừng "vá" bằng cách cho đợt 1 hạn +30 ngày. Hạn là con số báo cho phụ huynh và in vào
mọi màn công nợ; sửa nó để né một con cron là nói dối trên bốn màn để chữa một chỗ.

### 3.4 Đơn đã hoàn tiền

`grep PaymentRequest lib/finance/refund.ts` = **0**. Hoàn tiền hôm nay ghi một `Payment`
**âm**, kế thừa `saleStatus: RECORDED`, `accountantStatus: REFUNDED`
(`lib/finance/payment.ts:884-894`). Hệ quả sau cutover:

* Sổ A giảm (dòng âm được cộng vì `KHOAN_DA_GHI_NHAN` chỉ lọc `saleStatus` + `deletedAt`).
* Sổ B **không đổi** ⇒ `daRot > daThu` ⇒ nhánh (b) của R-02 có điều kiện `daRot < daThu` nên
  **KHÔNG chặn oan**. Hoàn tiền **không phải vật cản của cutover.**
* Cái hỏng thật, và nó cụ thể: phiếu vẫn `PAID` ⇒ `outstandingOfRequest = 0` ⇒
  `guardIssuable` (`_qr-core.ts:406`) trả *"Phiếu thu đã đóng đủ — không xuất QR nữa"*.
  **`/cong-no` báo còn thiếu mà sale không xuất được mã để thu.** Ca sống: hoàn một phần rồi
  học tiếp.

Vá ở **đợt 5, độc lập**: `hoanTienTrenSoMoi(tx, { paymentId, orderId, soTien })` — dựng
`BankTransaction { provider: "REFUND", providerTxnId: <id dòng Payment âm>, amount: −soTien }`
rồi ghi `PaymentAllocation` **âm**, rút từ phiếu theo `sortOrder` **GIẢM DẦN** (trả lại đợt
muộn nhất trước — đợt sớm đã tiêu vào buổi học rồi), xong gọi `recomputeRequestStatuses`.

Không cần luật mới nào: `deriveStatus` đã có `allocated <= 0 → PENDING`
(`allocation.ts:108`), `outstandingOf` đã kẹp ≥ 0 (`:44`), và rollup lên Order đã **một
chiều** (`payment-request.ts:417`) nên phiếu tụt xuống PARTIAL cũng không lật ngược một đơn
đã CONFIRMED.

⚠️ Cho tới khi đợt 5 xong, đây là **lệch đã biết, có tên**: đơn hoàn một phần khoá nút xuất
QR. Người vận hành xử lý bằng đường gán tay ở `/bien-dong-so-du`. Ghi vào runbook, đừng để
nó là bất ngờ của người trực.

### 3.5 Nợ ghim `[PR-02d]` — LUẬT SÀN, không VOID-tạo-mới

Đã đo: lối "VOID + tạo phiếu mới cùng `installmentNo`" là **ngõ cụt**. Migration
`20260803045047_payment_requests_ledger` có **hai** unique chặn:
`PaymentRequest_orderId_installmentNo_key` và `PaymentRequest_matchKey_key`. Phiếu cũ VOID
vẫn chiếm cả hai khoá; đổi `matchKey` để lách thì phá bất biến #3 của `docs/so-thu-theo-dot.md`
(tiền của mã QR đã phát rơi trượt đích).

Vá ở `payment-request.ts:284`:

```ts
const daRot = soCuaPhieu(allocated, cur.id).allocated;
const soMoi = Math.max(dot.amount, daRot);   // SÀN: không hạ dưới số đã rót
if (cur.amountDue !== soMoi) patch.amountDue = soMoi;
```

Đo hiện trạng để đối chiếu: phiếu đợt 1 giữ **6.000.000đ đã rót**, lưu lại kế hoạch với đợt 1
= 1.000.000đ ⇒ `amountDue` thành 1.000.000đ, phiếu hoá *"thu vượt 5.000.000đ"*.

⚠️ Sàn cắn thì **kế hoạch và phiếu bất đồng**, và Σ phiếu ≠ `totalAmount`. Phải **nói ra**,
không được nuốt: ghi audit `PAYMENT_REQUEST_AMOUNT_FLOORED` + trả cảnh báo lên màn
*"Đợt 1 đã nhận 6.000.000đ — kế hoạch mới ghi 1.000.000đ, hệ thống giữ số đã nhận."*
**Cho phép lưu, không chặn**: R-02 chặn khi tiền *mất dấu*; ở đây tiền còn nguyên trên phiếu.

⚠️ **Ba đường gọi `materializeInstallmentRequests` phải đo cùng lượt** —
`lib/orders/installments.ts:332`, `:500`, `lib/crm/backfill-order.ts:153`. Lỗ có sẵn từ
trước đợt gỡ duyệt.

⚠️ Cổng R-02 **cố ý không** che ca này (nó canh phiếu *thu toàn đơn*, phiếu bị VOID vô điều
kiện — còn phiếu theo đợt vốn được tha ở `:309`). Đừng "vá" R-02, nó không hở.

### 3.6 Dữ liệu CŨ — có, phải có script đối soát ngược

`scripts/pttt-doi-soat-nguoc-so-thu.ts`, **dry-run mặc định, người vận hành chạy tay** (luật
cứng #4). Trên prod chỉ có một đường: **GitHub workflow** — `.env` máy trỏ DB DEV.

Với mỗi đơn:

1. `daThu` = Σ `Payment` `KHOAN_DA_GHI_NHAN` (trục B, `lib/finance/ghi-nhan.ts:43`).
2. `daRot` = Σ `PaymentAllocation` của mọi phiếu của đơn.
3. `lech = daThu − daRot`. `lech ≤ 0` → bỏ qua.
4. `lech > 0` → dựng **một** `BankTransaction { provider: "BACKFILL",
   providerTxnId: "ORDER:<orderId>:<yyyymmdd>", amount: lech,
   transferredAt: max(Payment.paidDate), centerId: order.centerId }` rồi rót qua
   `allocateToOrder` với `ghiSoCu: { kieu: "DA_GHI" }`.

**Nó quyết định đúng ba việc, không hơn:**

* Rót `lech` vào phiếu nào — theo waterfall `sortOrder` sẵn có, không tự nghĩ luật.
* **Gỡ VOID cho phiếu đợt 1 bị `backfill-order.ts:157` huỷ.** Đó là cách vá cũ cho đúng vấn
  đề này (tiền đợt 1 nằm ở sổ A, phiếu đứng "chờ thu" nên bị VOID cho khuất mắt). Giờ tiền
  vào được sổ B thì phiếu phải sống lại — không thì `outstandingOf(VOID) = 0`, waterfall
  nhảy qua, tiền rơi vào đợt 2 hoặc thành `CreditBalance`. Nhận diện: `installmentNo = 1` +
  `status = VOID` + 0 allocation + đơn có `Payment` mang `[backfill-import]`.
  **Liệt kê từng đơn trong dry-run** — đây là quyết định duy nhất nó làm mà người phải xem.
* `daRot > daThu` (sổ B nhiều hơn sổ A) → **BÁO, không ghi.** Người quyết.

**KHÔNG bao giờ** đụng `Payment`, `totalAmount`, `discountAmount`.

⚠️ `providerTxnId` phải **kèm ngày** để chạy lại được. `"ORDER:<id>"` trần thì lượt hai đụng
unique và script thành dùng-một-lần — trong khi đúng tình huống cần chạy lại là: chạy lần 1,
ai đó tick ô "đã thu" (ô vẫn còn cho tới đợt 4), lệch sinh lại.

⚠️ `allocateToOrder` gọi `recomputeRequestStatuses`, hàm này có thể đẩy `Order.status`
`PENDING_PAYMENT → CONFIRMED` + đặt `paidAt` (`payment-request.ts:452-457`) cho 303 đơn "đã
thu đủ". **Đã kiểm: nhánh này không `publishEvent`, không gửi ZNS, không sinh Receipt** —
khác hẳn `confirmSettledOrder` của webhook. Nên không có bão thông báo. Vẫn phải đếm số đơn
đổi trạng thái trong báo cáo dry-run và cho chủ dự án nhìn trước.

⚠️ Script cần `DIRECT_URL` (bài học `scripts/backfill-media-assets.ts` dính `42P05`).

---

## 4. Năm đợt commit

| Đợt | Việc | Quay lại được? |
|---|---|---|
| 1 | Cửa tiền mặt + `ghiSoCu` bắt buộc | ✅ code thuần |
| 2 | **Đối soát ngược dữ liệu cũ (chạy prod)** | ⛔ **ĐIỂM KHÔNG QUAY LẠI #1** |
| 3 | Hai nút "đã thu" đi qua cửa mới + đồng bộ một chiều | ✅ code thuần |
| 4 | **Bỏ ô ☑ + luật sàn + R-02 mới + ân hạn cron** | ⛔ **ĐIỂM KHÔNG QUAY LẠI #2** |
| 5 | Hoàn tiền ghi sổ mới | ✅, độc lập, không chặn |

### Đợt 1 — cửa tiền mặt (chưa ai gọi)

Sửa: `lib/payments/cua-tien-mat.ts` (mới) · `lib/payments/payos-ingest.ts` (thêm tham số
`ghiSoCu` **bắt buộc** vào `allocateToOrder`, bọc khối ghi sổ cũ `:1042-1070`) ·
`app/(admin)/admin/bien-dong-so-du/_actions.ts:185` (khai `{ kieu: "TU_DONG" }`) ·
`app/(admin)/admin/bien-dong-so-du/page.tsx` (lọc provider).

**Nhất quán sau đợt 1:** có. Hành vi chạy thật không đổi một ly — webhook và gán tay đều
khai `TU_DONG`, cửa mới chưa ai gọi.

**Test viết TRƯỚC** (`lib/payments/cua-tien-mat.test.ts`, bộ chạm DB →
`vitest.db.config.ts`, KHÔNG để lọt vào `test:unit`):
`[CTM-01]` tiền mặt 3tr vào đơn 8tr có 3 phiếu → đúng 1 `BankTransaction` provider `CASH`
`status = MATCHED` `centerId` ≠ null, allocation 3tr trên đợt 1, phiếu → `PARTIAL`, **đúng 1
dòng `Payment`**.
`[CTM-02]` gọi lại cùng `paymentId` → vẫn 1 allocation, 1 Payment (`DUPLICATE`).
`[CTM-03]` **lưới ghim mã nguồn**: đọc `payos-ingest.ts`, khẳng định `ghiSoCu` **không có
dấu `=`** theo sau trong chữ ký (không mặc định), và đếm **đúng 1** lần khớp. Neo hẹp, không
cờ `/s` (luật 11 — chú thích giải thích bản vá hay chứa đúng chuỗi đang tìm).
**Cấy lại lỗi:** gán `ghiSoCu = { kieu: "TU_DONG" }` làm mặc định rồi gọi `cuaTienMat` →
`[CTM-01]` phải ĐỎ với 2 dòng `Payment`. Dán output vào commit.

### Đợt 2 — đối soát ngược ⛔

Sửa: `scripts/pttt-doi-soat-nguoc-so-thu.ts` (mới) · `.github/workflows/` (workflow chạy tay).

**Vì sao không quay lại được:** nó ghi `BankTransaction` + `PaymentAllocation` thật lên prod.
Cả hai FK là `onDelete: Restrict` (`schema.prisma:6290`, `:6292`) và **repo không có đường
gỡ allocation nào**. Rollback = phải viết script nghịch, và script nghịch ghi tiền thì nó là
một dự án riêng chứ không phải một nút.

**Test viết TRƯỚC** (`lib/payments/doi-soat-nguoc.test.ts`), theo đúng 4 nhóm đã đo:
`[DSN-01]` đơn đã thu một phần chưa có kế hoạch (77 đơn) → allocation = `daThu`, phiếu toàn
đơn `PARTIAL`.
`[DSN-02]` đơn chưa thu đồng nào (116) → **0 ghi**.
`[DSN-03]` đơn đã thu đủ (303) → phiếu `PAID`, `Order.status` không tụt.
`[DSN-04]` hình dạng `ORD-260913-000001`: `OrderInstallment D1 = PAID` đối diện phiếu D1 rót
0đ, 1 `Payment` 1tr `[backfill-import]` → rót đúng 1.000.000đ vào D1, hai sổ khớp.
`[DSN-05]` phiếu đợt 1 VOID kiểu `backfill-order.ts:157` → gỡ VOID rồi mới rót; **cấy ngược**
(bỏ bước gỡ VOID) phải thấy tiền rơi sang đợt 2 và ca ĐỎ.
`[DSN-06]` `daRot > daThu` → 0 ghi, có dòng báo.
`[DSN-07]` chạy hai lần **cùng ngày** → idempotent; hai lần **khác ngày** sau khi lệch mới
sinh → rót phần mới.

⚠️ **Đợt 2 và 3 phải lên `test` CÙNG một lượt đẩy.** Giữa hai đợt, ô ☑ vẫn sống và vẫn ghi
sổ A không ghi sổ B ⇒ mỗi lượt tick là một lệch mới, và cổng R-02 mới (đợt 4) sẽ chặn đúng
những đơn đó. Trên prod: **chạy script lại NGAY TRƯỚC khi merge đợt 4.**

### Đợt 3 — hai nút "đã thu" đi qua cửa mới

Sửa: `app/(admin)/admin/payments/_actions.ts:404` (`recordPaymentAction` → gọi `cuaTienMat`
sau `recordPayment`) · `lib/orders/installments.ts:455` (`markInstallmentPaid`: **thôi tự đặt
`status: PAID`**, chỉ ghi tiền; sync sẽ lật mirror) · `lib/payments/payment-request.ts:420`
(`dongBoSoDotCu` cuối `recomputeRequestStatuses`).

⚠️ `markInstallmentPaid` có **2 chỗ gọi**, một trong số đó là webhook:
`app/(admin)/admin/orders/_actions.ts:1144` và `app/api/public/webhook/sepay/route.ts:344`.
Đường webhook đã ghi sổ A bằng marker `[auto:sepay:<txn>]`, nên nhánh đó **không được** đi
qua cửa tiền mặt lần nữa. Đây là chỗ dễ cộng đôi nhất của cả đợt.

⚠️ `isInstallmentPlanActive` (`lib/payments/installment-plan.ts:50`) đang mang TODO(PHA-2)
"gỡ hẳn". **Đợt này đừng gỡ.** Nó còn một nhánh sống (`REJECTED`) và gỡ nó ở đây là trộn hai
thay đổi tiền vào một lượt review.

**Nhất quán sau đợt 3:** có — ô ☑ vẫn còn nhưng tick nó nay sinh **cả hai** sổ.

**Test viết TRƯỚC** (`tests/e2e/r7/…` hoặc bộ DB tuỳ nơi đặt):
`[DSC-01]` bấm "Đánh dấu đã đóng" đợt 2 → có allocation, phiếu `PAID`, `OrderInstallment`
`PAID` + `dueDate: null`, **đúng 1** `Payment`.
`[DSC-02]` bấm 2 lần → 1 allocation, 1 Payment.
`[DSC-03]` đồng bộ **không hạ cấp**: xoá tay allocation rồi chạy `recomputeRequestStatuses` →
`OrderInstallment` vẫn `PAID`.
`[DSC-04]` webhook SePay đường `soDot != null` → **1** dòng `Payment` (không phải 2).
**Cấy lại:** cho `markInstallmentPaid` gọi `cuaTienMat` cả ở nhánh webhook → `[DSC-04]` ĐỎ.

### Đợt 4 — bỏ ô ☑ ⛔

Sửa: `order-payment-section.tsx` (gỡ `DotForm.daThu`, gỡ ô, gỡ `disabled={d.daThu}`) ·
`app/(admin)/admin/orders/_actions.ts:1072` (bỏ `daThu` khỏi payload) ·
`lib/orders/installments.ts` (`DotGhi.daThu` gỡ; **gỡ khối ghi sổ A khỏi đường lưu kế
hoạch** — `phanBoGhiTheoDot` + `ensureOrderPaymentRecorded`; `coDotChuaThu` gỡ, mọi kế hoạch
đều qua R-02) · `lib/payments/ke-hoach-dot.ts` (`kiemKeHoachDot` bỏ `daThu`; **giữ**
`phanBoGhiTheoDot` nếu còn chỗ gọi, ngược lại gỡ luôn cả test của nó) ·
`lib/payments/plan-money-guard.ts` (gỡ `tienCacDotDaThu`, công thức + câu nói mới) ·
`lib/payments/payment-request.ts:284` (**luật sàn** §3.5) · `debt-reminder/route.ts` +
`lib/finance/debt.ts` (ân hạn) · `lib/settings` (`finance.debtReminderGraceHours`).

**Vì sao không quay lại được:** đơn lưu sau đợt 4 không còn khoản marker
`[auto:order-installment:dotN]` nào. Quay lại bản cũ thì `phanBoGhiTheoDot` đo `daCoTrongSo`
từ sổ, thấy thiếu marker, và **ghi bù** cho đúng những đợt đã có tiền qua cửa tiền mặt ⇒
cộng đôi. `ensureOrderPaymentRecorded` dedupe theo marker (`lib/finance/payment.ts:95`), mà
tiền cửa mới mang `[auto:cash:<id>]` — **không marker nào dedupe marker nào**.

**Test viết TRƯỚC:**
`[KH-01]` đơn 8tr chưa thu đồng nào, lưu kế hoạch 2 đợt → **0** `Payment` mới, 2 phiếu
`PENDING`, QR đợt 1 in đúng 4.000.000đ.
`[KH-02]` đơn legacy `daThu = 1tr, daRot = 0` → R-02 **chặn**, câu nói chứa số 1.000.000đ và
trỏ `/bien-dong-so-du`.
`[KH-03]` cùng đơn đó sau khi chạy §3.6 → **cho qua**. (Hai ca này khoá cả hai chiều — bỏ ca
sau là cổng chặn-tất-cả vẫn xanh.)
`[KH-04]` `[PR-02d]` **gỡ `test.fail`** và phải XANH; thêm khẳng định audit
`PAYMENT_REQUEST_AMOUNT_FLOORED` có ghi.
`[KH-05]` ân hạn: đợt vừa tạo, hạn hôm nay → cron **không** gửi; lùi `createdAt` 25 giờ →
cron gửi.
`[KH-06]` **lưới ghim mã nguồn**: `plan-money-guard.ts` **không** còn chuỗi
`tienCacDotDaThu`, và `lib/orders/installments.ts` **không** còn `ensureOrderPaymentRecorded`
trong thân `recordInstallmentPlan`. Đếm số lần khớp, không dùng `/s`.
**Cấy lại:** khôi phục dòng `ensureOrderPaymentRecorded` trong `recordInstallmentPlan` →
`[KH-01]` ĐỎ (1 Payment thừa) và `[KH-06]` ĐỎ. Hoàn nguyên, dán output vào commit.

⚠️ **15 chỗ gọi `recordInstallmentPlan` trong bộ e2e** dùng đường cũ
`{dot1Amount, dot2Amount, dot2DueDate}` (`tests/e2e/r6/tuition-installments.spec.ts`,
`tests/e2e/fl/convert-installment.spec.ts`, `tests/e2e/r7/payment-request-lifecycle.spec.ts`).
Đường cũ quy `daThu: d1 > 0` (`installments.ts:182`). Gỡ `daThu` là **cả 15 ca đổi nghĩa**.
Phải chuyển hết sang `dots` trong CÙNG đợt 4 — để lại là bộ test đỏ giả, và bộ đỏ giả ăn mòn
cổng nhanh hơn bộ không có (sự cố 09/09, `.claude/rules/prisma-db.md`).

⚠️ **Mỗi ca phải XANH khi chạy MỘT MÌNH** (luật 18). Chữ ký lớp lỗi này: cấy vào thì *"chạy 1
ca ĐỎ, cả bộ XANH"*.

### Đợt 5 — hoàn tiền (sau, độc lập)

Sửa: `lib/payments/hoan-tien-so-moi.ts` (mới) · `lib/finance/payment.ts:853`
(`refundPayment` gọi nó trong cùng tx). Test: `[HT-01]` hoàn 2tr trên đơn 8tr đã PAID → phiếu
đợt cuối tụt `PARTIAL`, `outstanding` = 2tr, **nút xuất QR mở lại**; `[HT-02]` `Order` đã
CONFIRMED **không** bị lật ngược.

---

## 5. Bẫy chung — đọc trước khi mở bất kỳ tệp nào

⚠️ **`scopedDb` KHÔNG che write.** Mọi đường mới (`cuaTienMat`, `dongBoSoDotCu`, script) ghi
xuống phải neo vào bản ghi **đã qua `findUnique` có scope**, không nhận id từ client.
`recordPaymentAction` đã làm đúng (`payments/_actions.ts:430`); `markOrderInstallmentPaidAction`
đã có `expectedOrderId` chống IDOR ghi tiền (`installments.ts:465`) — giữ nguyên cả hai.

⚠️ **`publishEvent` trong transaction hỏng (`25P02`).** Cửa tiền mặt chạy trong tx của
`allocateToOrder` ⇒ **không publish event ở đó.** Side-effect (ZNS, biên nhận) chỉ sau commit,
đúng nếp `payos-ingest.ts:1206`.

⚠️ **0 migration.** Nếu thiết kế nào ở đây làm bạn muốn viết SQL, bạn đã đi lệch — quay lại
§2 QĐ-A. `prisma migrate dev` vẫn **CẤM** (drift 14 bảng, chốt 08/09).

⚠️ **Test chạm DB phải nằm ở `vitest.db.config.ts`**, không lọt `pnpm test:unit` — `resetDb()`
TRUNCATE mọi bảng, và DB làm việc hằng ngày cũng là `127.0.0.1/satarobo_test`.

⚠️ **Test canh lỗi chỉ được tin sau khi CẤY LẠI lỗi và thấy nó ĐỎ.** Mỗi đợt ở trên đã ghi
sẵn ca cấy; bỏ bước đó thì coi như chưa có lưới, và một regex viết sai vẫn xanh vĩnh viễn
trong khi trông y hệt một lưới đang làm việc.

⚠️ **Hàm mới nhận `now: Date` BẮT BUỘC** (luật 19). Ba đợt ở trên đều có ca phụ thuộc mốc
thời gian (ân hạn cron, `transferredAt`, `paidAt`); một mặc định `new Date()` là bom hẹn giờ
— cùng commit, CI xanh hôm nay đỏ ngày kia, không diff nào ở giữa.
