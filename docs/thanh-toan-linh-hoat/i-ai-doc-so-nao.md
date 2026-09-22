# PHIÊN I — AI ĐỌC SỔ NÀO. Đo trước, cutover sau.

> **Phiên này CHỈ ĐO.** Không đổi một dòng mã chạy nào. US-25 ("chuyển dữ liệu sổ B") hỏi
> *"chuyển các đơn cũ sang mô hình mới mà số không đổi"* — nhưng trước khi chuyển DỮ LIỆU thì
> phải biết **ai đang đọc sổ nào**, kẻo chuyển xong mới phát hiện còn bốn màn vẫn đọc bảng cũ.
>
> Đo ngày **22/09/2026**, trên `origin/test` tại `9747b428`.

---

## 0 · Hai cái sổ, và một cái sổ thứ ba mà người ta hay quên

| tên gọi trong repo | bảng | ai ghi |
|---|---|---|
| **Trục A** | `Payment` (+ `accountantStatus`) | ghi tay của kế toán · `ensureOrderPaymentRecorded` · `payos-ingest` |
| **Trục B** | `PaymentRequest` + `PaymentAllocation` | `materializeInstallmentRequests` · `taoDotChoCon` · `payos-ingest` |
| **Sổ B CŨ** | `OrderInstallment` | `recordInstallmentPlan` (kế hoạch 2 đợt của đơn) |

`OrderInstallment` **không phải** Trục B. Nó là bảng kế hoạch đời cũ, vẫn đang được ghi, và
vẫn là thứ **quyết định số tiền in lên mã QR ở trang đơn**. Gộp nó vào "Trục B" khi lập kế
hoạch cutover là bỏ sót đúng bảng còn sống.

⚠️ Cờ `PAYMENT_LEDGER_V2` **không nối vào đâu cả** — `isPaymentLedgerV2Enabled()` có 0 đường
gọi trong mã chạy thật, và biến env không tồn tại trên Production (CLAUDE.md đã ghi, đo lại
22/09 vẫn đúng). **Bật nó không đổi hành vi gì.** Cutover là viết phần nối, không phải bật cờ.

---

## 1 · Bảng đo — bốn nơi tiêu thụ, mỗi nơi đọc một sổ khác nhau

| # | nơi tiêu thụ | tệp · dòng | đọc sổ nào | hệ quả |
|---|---|---|---|---|
| 1 | **QR ở TRANG ĐƠN** | `app/(admin)/admin/orders/[id]/page.tsx:182-191` → `computeDueNow` | `OrderInstallment` + `Payment` | Đơn có **đợt theo CON** (chỉ nằm ở `PaymentRequest`) thì `order.installments` RỖNG ⇒ QR in **toàn bộ còn thiếu của đơn**, không phải đợt sale vừa hẹn |
| 2 | **Ngưỡng đối khớp SePay** | `app/api/public/webhook/sepay/route.ts:149-165` | `OrderInstallment` + `Payment` | cùng con số với (1) — đúng chủ ý "QR và máy đối khớp phải cùng một số", nhưng **cùng sai một chỗ** |
| 3 | **ZNS học phí** | `lib/notify/order.ts:64` (`totalFee`) · `:55` (`paidFee`) | `Order.totalAmount` + `Payment` | `totalFee` là **tổng đơn**, không phải phần của con — đã ghim ở `[HTL-09]` cho ca Coach 1-1 |
| 4 | **Cổng đẩy lead lên "Đã đăng ký"** | `lib/finance/payment.ts:176` · `:582` | `Payment` (đường GHI, không phải đường đọc) | xem mục 3 — **đường tiền tự động KHÔNG đi qua nó** |

Và một nơi tiêu thụ thứ năm, đọc ĐÚNG sổ mới:

| 5 | **QR của PHIẾU THU** | `app/(admin)/admin/orders/_qr-core.ts:454` (`outstandingOfRequest`) | `PaymentRequest` | đúng |

⇒ **Hai đường QR cùng tồn tại**, đọc hai sổ khác nhau. Đây là thứ phải quyết định trước tiên,
không phải thứ để lại cho đợt chuyển dữ liệu.

Ba nơi đọc còn lại của công nợ — cùng một kết luận:

```
lib/finance/debt.ts:175,291,392,434   → Payment + OrderInstallment
lib/portal/billing-student.ts:63,101  → Payment + OrderInstallment
lib/portal/dashboard.ts:68,75,212     → Payment + OrderInstallment
```

**Không tệp nào trong ba tệp trên nhắc tới `paymentRequest`.** Đo bằng `grep -n
"paymentRequest" <tệp>` → 0 dòng cả ba.

---

## 2 · Lỗ đo được số một — mã QR ở trang đơn không biết gì về đợt theo con

`computeDueNow` (`lib/payments/due-now.ts:49`) nhận `installments` từ
`order.installments`, tức `OrderInstallment`. Đợt tạo bằng `taoDotChoCon`
(`lib/finance/ghi-tien-don.ts:86`) sinh **`PaymentRequest`**, KHÔNG sinh `OrderInstallment`.

Nên với một đơn đi theo luồng linh hoạt:

```
order.installments = []              (không có kế hoạch 2 đợt đời cũ)
⇒ computeDueNow → nhánh "còn thiếu của cả đơn"
⇒ QR in TOÀN BỘ số còn nợ
```

Hình dạng này **giống hệt** bug tiền thật đã đo ngày 13/09 (`PaymentRequest` có phiếu đợt 1
3.000.000đ mà `computeDueNow` in QR cả 5.000.000đ học phí) — lần đó nguyên nhân là điều kiện
"kế hoạch còn hiệu lực" bị đảo, và đã vá. Lần này nguyên nhân khác: **đọc sai bảng**.

**Chưa kết luận là đang gây thiệt hại**, vì sale được hướng dẫn xuất QR **từ phiếu thu**
(đường số 5 ở bảng trên, đọc đúng sổ) chứ không từ khối QR của trang đơn. Đo xem khối QR trang
đơn có còn được dùng không là **việc của người vận hành**, không suy từ mã được.

---

## 3 · Lỗ đo được số hai — tiền về tự động KHÔNG đẩy lead lên "Đã đăng ký"

Đo:

```
grep -rn "maybeAdvanceLeadToRegistered" app/ lib/   → 3 dòng, tất cả trong lib/finance/payment.ts
  :176  trong ensureOrderPaymentRecorded
  :582  trong recordPayment            (kế toán ghi TAY)
grep -rni "lead" lib/payments/payos-ingest.ts       → 0 dòng
grep -rni "lead" lib/finance/ghi-tien-don.ts        → 0 dòng
```

Đường tiền tự động hôm nay là: SePay → `extractOrderCode` → **null** → nhánh
`MANUAL && !order` → `ingestPayosWebhook` → `PaymentAllocation` + `tx.payment.create`
(`lib/payments/payos-ingest.ts:1210`).

`extractOrderCode` tìm `/ORD(\d{12})/` trong nội dung CK. Nội dung CK **không còn mang mã đơn
từ 20/08/2026** (chủ dự án đảo quy ước — `lib/payments/vietqr.ts:311-322`, tham số `orderCode`
đã bỏ hẳn khỏi chữ ký). Nên với giao dịch thật, `order` **luôn null**, nhánh CONFIRM cũ
(`route.ts:321`, nơi có `ensureOrderPaymentRecorded`) **không chạy**, và cổng đẩy lead không
bao giờ nổ.

**Hậu quả — nói đúng mức, đừng nói quá:**

- ✅ **KHÔNG chặn việc chốt lead.** Cả `convertLead` lẫn `convertLeadV2` khoá theo
  `convertedAt IS NULL`, **không** khoá theo trạng thái (`lib/crm/convert-lead.ts:75,82` ·
  `convert-lead-v2.ts:277-288`). Chú thích cũ ở `payment.ts:175` ghi *"mở khoá convert"* —
  câu đó **đã lỗi thời** kể từ GĐ5, và là một câu dễ làm người đọc sau hoảng nhầm.
- ❌ **Sổ đếm phễu SAI.** Gia đình đã chuyển tiền mà lead vẫn nằm ở *"Chờ quyết định"*.
- ❌ **Mất vết trong nhật ký.** `recordLeadStatusLedger(source: "payment")` không có dòng nào,
  nên mốc *"tiền vào → Đã đăng ký"* biến khỏi mục "Lịch sử thay đổi" của trang lead — đúng thứ
  C-07 đã dựng ra để bịt, chỉ là nó bịt cho đường TAY.

---

## 4 · Đề xuất — ba đợt RIÊNG, theo thứ tự, không gộp

### Đợt I-1 · Nối cổng lead vào đường tiền tự động  ⟵ **làm trước, rẻ nhất, hết lỗ số hai**

Thêm một lời gọi `maybeAdvanceLeadToRegistered` vào đúng chỗ `payos-ingest.ts:1210` vừa tạo
`Payment`, **trong cùng transaction**. `leadId` lấy từ `order.leadId` (phải thêm vào `select`
của lượt tra đơn — hôm nay nó không select cột đó).

- Hàm đã **idempotent** (`updateMany` có guard `status = CHO_QUYET_DINH`), nên gọi lại vô hại.
- Không đụng số tiền nào ⇒ không phải đợt tiền, nhưng **vẫn chạm `lib/payments/**`** ⇒ theo
  luật R7 của repo thì **phải chạy bộ R7**.
- Ca test: tiền về qua webhook cho đơn có `leadId` ở `CHO_QUYET_DINH` ⇒ lead lên `DA_DANG_KY`
  **và** có dòng `LeadStatusLedger source="payment"`. Kèm **đối chứng dương/âm**: lead ở trạng
  thái khác KHÔNG bị đụng.

### Đợt I-2 · Quyết định SỐ PHẬN của khối QR ở trang đơn  ⟵ **quyết định nghiệp vụ, không phải kỹ thuật**

Hai lựa chọn, và phải chọn một chứ không để cả hai cùng sống:

**(a) GỠ khối QR khỏi trang đơn**, để mã QR chỉ phát từ phiếu thu. Đơn giản nhất, đúng hướng
đi của PHIÊN C, và xoá hẳn lỗ số một. Cái giá: đơn **chưa có phiếu thu nào** thì không còn chỗ
nào phát QR — phải kiểm xem ca đó có thật không.

**(b) Cho `computeDueNow` đọc `PaymentRequest` khi có**, rơi về `OrderInstallment` khi không.
Giữ được cả hai đường, nhưng đẻ ra một hàm phải hiểu **ba** bảng, và mọi bản vá sau này phải
sửa đúng cả ba — đúng hình dạng đã sinh ra bug 13/09.

> **Cần chủ dự án chốt.** Đây là *"mã QR ở trang đơn có còn dùng không"*, và câu trả lời nằm ở
> chỗ sale đang bấm gì, không nằm trong mã nguồn.

### Đợt I-3 · Cutover đường ĐỌC công nợ  ⟵ **to nhất, làm sau cùng**

Chuyển `lib/finance/debt.ts` · `lib/portal/billing-student.ts` · `lib/portal/dashboard.ts` ·
màn `/orders/[id]` · `/cong-no` sang đọc `PaymentRequest`. Đây là phần mà CLAUDE.md gọi là
*"dự án riêng"*, và nó vẫn là dự án riêng.

**Điều kiện mở đợt này** — đo bằng workflow chỉ-đọc `shadow-compare-cong-no.yml`, KHÔNG chạy ở
máy dev (máy dev đo DB DEV, không nói gì về prod):

1. mọi đơn còn nợ đều đã có `PaymentRequest` tương ứng — nếu chưa thì US-25 (chuyển dữ liệu)
   phải chạy TRƯỚC;
2. hai sổ cho ra cùng con số trên **100%** đơn đang mở, đo liên tiếp đủ số ngày mà chủ dự án
   chốt;
3. đợt I-1 và I-2 đã xong.

---

## 5 · Cái chưa đo được, và vì sao

**Số lượng đơn/lead thật sự dính hai lỗ trên — CHƯA ĐO.** Máy dev không nối được DB prod
(`.env` trỏ DEV; `DATABASE_URL` của Vercel là Sensitive), nên con số phải lấy bằng workflow
chỉ-đọc. Hai câu dưới đây là thứ cần chạy, **chỉ đọc, không ghi**:

```sql
-- (I-a) Lead đã có tiền về nhưng vẫn nằm ở "Chờ quyết định"
SELECT count(*) AS so_lead
FROM "Lead" l
WHERE l.status = 'CHO_QUYET_DINH'
  AND l."deletedAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "Order" o
    JOIN "Payment" p ON p."orderId" = o.id AND p."deletedAt" IS NULL
    WHERE o."leadId" = l.id
  );

-- (I-b) Đơn có đợt theo CON (sổ mới) mà KHÔNG có kế hoạch đời cũ
--       ⇒ đúng tập đơn mà QR trang đơn in sai số
SELECT count(DISTINCT pr."orderId") AS so_don
FROM "PaymentRequest" pr
WHERE pr."orderItemId" IS NOT NULL
  AND pr.status IN ('PENDING', 'PARTIAL')
  AND NOT EXISTS (
    SELECT 1 FROM "OrderInstallment" oi WHERE oi."orderId" = pr."orderId"
  );
```

⚠️ **Đừng hạ mức nghiêm trọng của lỗ nào theo kết quả hai câu này.** Luật đọc số của repo:
*"0 dòng trên prod KHÔNG hạ được mức nghiêm trọng — phân loại theo đường ghi còn sống hay
chết"*. Cả hai đường ghi ở đây đều đang **sống**. Con số chỉ nói **đợt nào làm trước**, không
nói đợt nào được bỏ.
