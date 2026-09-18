# Việc dữ liệu trước PHIÊN A — ba câu hỏi

> **Không code.** Tra repo + tính số, dựng ba câu SQL **chỉ đọc** để chủ dự án chạy trên prod.
> Số điện thoại che còn 4 số cuối; tên không bao giờ hiện nguyên văn (so bằng md5 rút gọn).
>
> Đo **16/09/2026**, sau `9b700c90`.

**Câu SQL: `viec-du-lieu-PROD.sql`** — cả ba câu đã **chạy thử trên `satarobo_local`**: không lỗi
cú pháp, không tên cột ma. Kết quả rỗng ở local (không có các đơn đó), nhưng câu chạy sạch.

---

## Câu 2 — **đã trả lời được**, không cần prod

### 134.400đ là **đúng một điểm phần trăm giảm giá của khoá Sata6**

Số học trước:

```
11.558.400 ÷ 134.400 = 86   (chẵn)
11.424.000 ÷ 134.400 = 85   (chẵn)

13.440.000 × 86% = 11.558.400   ← "phải thu"
13.440.000 × 85% = 11.424.000   ← "đã thu"
```

Và `13.440.000` không phải số ngẫu nhiên:

> `Sata6 — Chinh Phục Đấu Trường` · lớp 6–7 · **48 buổi** · **280.000đ/buổi** · `listPrice: 13440000`
> — `components/legacy-laptrinhrobot/_data/courses-pricing.ts:78`

Đó là **khoá duy nhất** trong toàn bộ danh mục có giá đó (`grep 13440000` → 1 kết quả). Và mức
giảm đang dùng thật trên dữ liệu là `10` và `15` phần trăm — kiểm trên `satarobo_local`: một dòng
`discountPercent = 15` cho `discountAmount = 1.584.000`, tức nền `10.560.000` = giá Sata3. Cơ chế
phần trăm → số tiền chạy đúng.

⇒ **Phụ huynh đóng theo mức giảm 15%. Đơn ghi mức giảm 14%.** 134.400đ không phải phí, không phải
làm tròn, không phải tiền lẻ — nó là một điểm phần trăm trên giá niêm yết.

### Hai cách đọc, dẫn tới hai việc khác hẳn nhau

| | Nếu | Thì |
|---|---|---|
| **A** | Đơn ghi sai mức giảm (lưu 14% trong khi đã thoả thuận 15%) | Sửa dữ liệu đơn. **Phụ huynh không nợ gì.** |
| **B** | Đơn ghi đúng 14%, phụ huynh tự tính 15% rồi chuyển | **Còn nợ thật 134.400đ.** Đi nhắc. |

Câu 2 trong tệp SQL bóc 16 vế để phân biệt — quan trọng nhất là **dòng A** (`subtotal`,
`discountAmount`, `discountPercent` của đơn) và **dòng B** (header có tự nhất quán không).

### Nhưng 134.400đ còn **11 cơ chế kỹ thuật khác** có thể tạo ra, và chúng phải bị loại trước

Bản phản biện tìm ra ba cơ chế mà bản điều tra đầu **bỏ sót**, và cả ba đều làm "đã thu" tụt
xuống mà không ai làm gì sai:

| Cơ chế | Vì sao nó giấu tiền | Bằng chứng |
|---|---|---|
| **Hoàn tiền** — `refundPayment` tạo dòng ÂM kế thừa `saleStatus`, trục B trừ nó ra | 134.400đ là tiền **đã trả lại** phụ huynh, không phải nợ | `lib/finance/payment.ts:1037-1105` |
| **`scopedDb` giấu khoản lệch cơ sở** — `Payment` ∈ `SCOPED_MODELS`, ∉ `NULL_IS_GLOBAL_MODELS` | "Đã thu" **khác nhau tuỳ ai mở màn đơn**. Mở lại bằng SUPER_ADMIN là biết ngay | `lib/db-scope.ts:11-22,118-151` · `orders/[id]/page.tsx:165-168` |
| **Payment bị xoá mềm khi ai đó bấm "Lưu kế hoạch"** — bản lỗi cũ quét cả marker của tiền thật | Tiền **không mất** (dòng còn đó), nhưng trục B ngừng cộng | `lib/orders/installments.ts:210-252` · `lib/finance/payment-markers.ts:1-25` |

Và một đính chính quan trọng của phản biện: **khoản `REJECTED` KHÔNG giải thích phần lệch.**
`KHOAN_DA_GHI_NHAN` không lọc `accountantStatus`, và `rejectPayment` không đụng
`saleStatus`/`deletedAt` — nên khoản bị kế toán từ chối **vẫn được trục B cộng**. Bản điều tra
đầu kết luận ngược; nếu tin nó thì sẽ đi tìm sai chỗ.

⇒ Chỉ có **hai** lý do khiến một khoản tồn tại mà trục B không cộng: **đã xoá mềm**, hoặc **chưa
gắn vào đơn này**.

---

## Câu 1 — **chưa trả lời được**, và phát hiện lớn nhất là *vì sao* chưa

### Ba "chữ ký" hiển nhiên nhất đều là bằng chứng **chưa tồn tại** vào cuối tháng 8

Đây là thứ đáng giá nhất của cả phiên, và nó suýt làm hỏng phép đo:

| Chữ ký định dùng | Vì sao vô dụng với đơn 29–31/08 |
|---|---|
| `Order.createdById` ("cùng người tạo") | Cột do migration `20260831140000_don_hang_nguoi_tao` thêm, và **schema tự ghi**: *"Đơn TẠO TRƯỚC ngày này để NULL vĩnh viễn"* (`prisma/schema.prisma:4079-4086`). Đơn 29/08 chắc chắn `∅`; đơn 31/08 gần như chắc chắn `∅` — nó là đơn ĐẦU TIÊN của ngày (`-000001`) còn migration đóng dấu 14:00 |
| `AuditLog` action `CREATE` | Đường tạo đơn chỉ bắt đầu ghi audit từ **13/09/2026** (`82ea4114`), và chú thích tại chỗ ghi rõ *"Trước bản này đường tạo đơn KHÔNG ghi một dòng AuditLog nào"*. Rỗng là **mặc định**, không phải phát hiện |
| `_actions.ts:866` (cảnh báo tạo trùng) | Khối đó thuộc bản **15/09/2026** (`2e7b860f`) — chưa tồn tại ngày 29–31/08 |

Bài học chung: **một cột chỉ là bằng chứng kể từ ngày migration của nó chạy.** Dùng nó để suy về
dữ liệu cũ hơn là đọc `NULL` thành "không có ai làm".

Câu SQL vì thế thay ba thứ đó bằng `OrderStatusHistory.changedByName` (`NOT NULL`, có từ lâu) +
`gatewayTxnId`/`bankReference` + **phân loại NGUỒN của từng khoản tiền**.

### Sáu cơ chế đẻ ra hai đơn cho một nhà

| # | Cơ chế | Bằng chứng |
|---|---|---|
| 1 | **Đơn KHÔNG SỬA ĐƯỢC ⇒ sửa = tạo đơn mới.** `grep "orderItem\.(update\|delete\|upsert\|create)"` toàn `app/`+`lib/` → **0 kết quả**; không có route `/orders/[id]/edit`. Sale gõ sai khoá/giá/tên con thì đường duy nhất là tạo đơn mới, đơn cũ **ở lại vĩnh viễn** và trông y hệt đơn thật | `orders/_actions.ts` (toàn bộ export, không action nào chạm `OrderItem`) · `ls orders/[id]/` → chỉ `page.tsx` |
| 2 | **Không có cổng chống trùng.** `createOrderManualAction` gác QUYỀN, không gác TRÙNG — không truy vấn nào hỏi "SĐT này đã có đơn đang mở chưa" trước `order.create` | `orders/_actions.ts:248-680` · `lib/orders/create-guard.ts:53-87` |
| 3 | **"PAID" có thể chỉ là người bấm Xác nhận đơn.** `changeOrderStatusAction` tự đặt `paidAt = now()` rồi gọi `ensureOrderPaymentRecorded` → `payment.create` với `method="auto"`. **Một dòng tiền không chứng minh tiền đã về** | `orders/_actions.ts:1013-1057` · `lib/finance/payment.ts:84,121-140` |
| 4 | **Đường SePay CŨ tự chốt đơn** — `updateMany(CONFIRMED)` + `OrderStatusHistory` mang `changedByName = "SePay webhook"`, **không** tạo `BankTransaction` cũng không tạo `PaymentAllocation` | `app/api/public/webhook/sepay/route.ts:281-330` |
| 5 | **Chốt lead khai "đã thu" đẻ đơn thứ hai.** Cổng idempotent của backfill tìm `Payment` mang marker `[backfill-import]` **của đơn thuộc lead đó** — đơn sale tạo tay không có marker nào ⇒ cổng không thấy ⇒ tạo thêm đơn `CONFIRMED` | `lib/crm/backfill-order.ts:58-127` · `convert-lead-v2.ts:302-312` |
| 6 | **Mua hợp lệ hai lần** — và trước 15/09 đơn **không ghi được là mua cho con nào**: `OrderItem.studentId` chưa lên prod (prod báo `42703`) | `lib/orders/don-nhiem.ts:30-34` |

### Mức cao nhất có thể kết luận hôm nay

`OrderItem.studentId` chưa lên prod ⇒ **không có cách nào chứng minh tuyệt đối hai dòng là cùng
một đứa trẻ.** Thứ mạnh nhất còn lại là `md5(itemName)` + `oi.type`. Nếu hai đơn có md5 tên
giống hệt, cùng `type`, cùng số tiền → **nghi trùng rất mạnh**, và đó là trần của dữ liệu hôm nay.

⚠️ **Và đừng dùng nhãn "PAID" để chọn đơn nào được giữ** — cơ chế 3 và 7 nói rõ nhãn đó có thể
chỉ là một người bấm nút, hoặc SePay rót theo **số tiền** chứ không theo đơn đúng.

⚠️ Một cảnh báo vận hành phải biết ngay: **huỷ đơn KHÔNG tự VOID phiếu thu**, và tầng đối khớp
`matchKey`/`QrSession` **không kiểm trạng thái đơn** (`payos-ingest.ts:662-687`). Nghĩa là đơn
29/08 dù bị huỷ vẫn có thể **hút tiền** nếu phụ huynh quét lại QR cũ. Câu SQL có phần C đếm
`QR đã phát` đúng để thấy chuyện đó.

---

## Câu 3 — **chưa trả lời được**, nhưng cách đọc câu hỏi đã bị lật ngược

### `UNMATCHED` **không** có nghĩa "tiền chưa được ghi nhận"

Đây là phát hiện mà bản phản biện bổ sung, và nó đổi hẳn việc cần làm: sổ A (`Payment`) ghi tay
**không chạm** `BankTransaction`. Kế toán hoàn toàn có thể đã ghi 8.700.000đ vào một đơn rồi, còn
dòng `BankTransaction` chỉ là **rác còn kẹt trong hàng chờ**.

⇒ Việc đầu tiên không phải "khoản này có phải học phí không" mà là **"khoản này đã được ghi ở
đâu chưa"**. Khối E của câu SQL hỏi đúng điều đó.

### `IGNORED` **100% do người bấm**, không luật máy nào

Không có đường tự động nào đặt `IGNORED`; nút "Bỏ qua" bắt buộc nhập lý do, và lý do đó ghi vào
`AuditLog` action `TXN_IGNORED`. ⇒ **Sáu lý do của 6 dòng IGNORED trên prod chính là câu trả lời
cho "công ty coi loại tiền đó là gì"** — đọc chúng trước khi làm gì khác.

### Ba cảnh báo

- **Cửa một chiều.** Bấm "Bỏ qua" xong thì **không rót tiền được nữa**, mà giao diện vẫn báo
  thành công. Đừng bấm để "dọn hàng chờ".
- **"Cùng loại" có thể chỉ là ấn tượng.** Màn hình **không có tab `IGNORED`** — người ta chỉ làm
  việc ở tab "Cần xử lý", nên "giao dịch cùng loại kia là IGNORED" rất có thể hình thành từ một
  tab thiếu. Khối A của SQL liệt kê **mọi** dòng mang `SRHD`/`HD.` bất kể trạng thái.
- **Parser mã 5 ký tự (US-10) sẽ không cứu ca này**, và nó **chưa được nối** vào đường chạy nào.
  Memo mang số hợp đồng thì không khoá đối khớp nào đọc được.

---

## Việc cần anh làm

Chạy `docs/thanh-toan-linh-hoat/viec-du-lieu-PROD.sql` trên Supabase SQL Editor — ba câu, chỉ
đọc, SĐT đã che. Dán kết quả về, tôi đọc theo bảng "nếu… thì…" đã dựng sẵn cho từng câu.

Nếu chỉ chạy được một câu thì chạy **câu 2** trước: nó là câu duy nhất đã có lời giải, và chỉ
cần xác nhận một trong hai cách đọc để quyết "sửa đơn" hay "đi đòi 134.400đ".

---

## Ghi chú về cách làm

Ba nhánh điều tra chạy song song, mỗi nhánh có **một lượt phản biện độc lập** đọc lại kết quả và
tìm lỗi. Lượt phản biện đó đáng giá: nó bắt được **ba chữ ký dựa trên cột chưa tồn tại** (câu 1),
**một kết luận ngược về khoản `REJECTED`** (câu 2), và **bốn lỗi logic trong SQL** (câu 3) — gồm
một lỗi mà `LATERAL` đọc `AuditLog` không lọc `action`, khiến một dòng `TXN_MATCHED_MANUAL` ghi
sau sẽ **xoá trắng lý do bỏ qua** trong kết quả, im lặng.
