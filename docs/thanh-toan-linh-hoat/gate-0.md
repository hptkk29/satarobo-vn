# GATE 0 — đo trên repo và DB trước khi thi công (US-01)

> **Chỉ đọc.** Phiên này không sửa một dòng mã chạy thật, không sửa `schema.prisma`, không chạy
> lệnh GHI nào trên bất kỳ DB nào. Mọi con số dưới đây kèm nguồn: `file:dòng` hoặc câu SQL đã chạy.
>
> Đo ngày **16/09/2026**, trên nhánh `hptkk29/Sửa-luồng-phương-thức-thanh-toán-cho-từng-trung-tâm`
> (`3fe515b3`), DB `satarobo_local`.

---

## 0. Đọc mục này trước: tài liệu KHÔNG khớp hiện trạng ở 7 điểm

Bộ tài liệu tự ghi *"có thể sẽ sai hiện trạng"*, và đo được là đúng như vậy. Bảy điểm dưới đây
**đổi thiết kế**, không phải đổi tên gọi. Ai mở phiên US-xx mà bỏ qua mục này sẽ xây một mô hình
không cắm được vào hệ thống đang chạy.

| # | Tài liệu nói | Đo được | Hệ quả |
|---|---|---|---|
| **X1** | Hạt tiền là **`Enrollment`**; `PaymentRequest.enrollmentId NOT NULL` (BA 5.1, US-03/AC2) | `/orders/new` **KHÔNG tạo `Enrollment`** — ghi danh do `convert-lead` sinh SAU khi chốt. Lúc tạo đơn chỉ có `OrderItem` | Hạt phải là **`OrderItem`**, không phải `Enrollment`. Chủ dự án đã chốt `PaymentRequest.orderItemId` ngày 16/09 và migration `20260916120000_payment_request_theo_con` đã hiện thực |
| **X2** | Có thực thể **"gia đình" (`guardianId`)** làm khoá gom ví, kỳ thu, khoá transaction (BA 3, 5.2) | **Không có bảng nào** tên `Guardian`/`Customer`/`Parent`. Phụ huynh là các CỘT rời: `Lead.parentName`/`Lead.phone`, `Student.parentName`/`parentPhone`/`parentUserId` | Khoá "gia đình" phải chọn: `Order` (đã có, một đơn = một nhà) hay `Student.parentUserId` (chỉ có với PH đã cấp tài khoản). Chủ dự án chốt **theo ĐƠN** |
| **X3** | **US-13 Ghi nhận tiền mặt** + `method CASH` + `billing:record-cash` (US-13, TS-27, F-05) | — | **BỊ CHỦ DỰ ÁN HUỶ 16/09**: *"Cash: KHÔNG. 100% tiền ở sổ 2 phải truy được về một giao dịch ngân hàng THẬT. Không nút ghi tiền mặt, không gõ tay số CK, không `provider='CASH'`."* PH đưa tiền mặt tại quầy thì QLCS/kế toán nộp vào tài khoản công ty với nội dung là mã phiếu → về qua webhook. **US-13 và TS-27 bỏ** |
| **X4** | CS1, CS2 là **hai đơn vị kế toán** (giả định A5, Q1, bất biến B8, Pre-mortem T4) | `SELECT o.code, l."taxCode" FROM "OrgUnit" o LEFT JOIN "LegalEntity" l …` → **CS1 và CS2 CÙNG pháp nhân `0402301783`** | B8 vẫn nên cài (nhượng quyền sẽ cần), nhưng **hôm nay nó không chặn ca nào**. Đừng để `accountingUnitId` chặn tiến độ Đợt 1 |
| ~~**X5**~~ | Công tắc là `SystemSetting billing.flexV1Enabled` **theo `orgUnitId`** | **ĐÍNH CHÍNH — tài liệu ĐÚNG, báo cáo này SAI.** Bản đầu của mục X5 viết "khoá phẳng, không khai được theo cơ sở" vì chỉ đọc `model SystemSetting`. Đo lại: có bảng **`CenterSetting`** khoá `@@id([orgUnitId, key])` + `getSetting(key, { orgUnitId })` + cờ `centerOverridable` trong registry — tức cơ chế **đã tồn tại đầy đủ** | Không phải quyết định gì. Đã khai `billing.flexV1Enabled` (`default: false`, `centerOverridable: true`) và `lib/finance/feature.ts` là nơi đọc duy nhất |
| **X6** | `allocateByWeight` là thứ phải bỏ (BA 2, architecture R3, US-11/AC6) | Nó có **HAI** đường dùng khác hẳn nhau: `lib/finance/chia-khoan-theo-don.ts:117,138` (chia tiền cho nhiều ghi danh theo tỷ trọng — **đúng thứ phải bỏ**) và `lib/payments/ke-hoach-dot.ts:49` (**làm tròn largest-remainder** khi chia học phí một người thành đợt) | Cấm cả hàm là phá phép làm tròn của kế hoạch đợt. Chỉ cấm **`chia-khoan-theo-don`** trên luồng mới |
| **X7** | `PaymentBill` mang `guardianId`, `accountingUnitId`, `code` 8 ký tự, `virtualAccount` (BA 5.2) | Bảng `PaymentBill` **đã tồn tại** từ `20260916120000`, mang `orderId` + `matchKey`, chưa có `code`/`virtualAccount` | Không dựng bảng mới. Bổ sung cột khi tới US-10, additive |

**Một điểm nữa, không phải mâu thuẫn mà là thiếu:** ngân sách nội dung CK. Tài liệu đề xuất
`<mã kỳ thu 8> <SĐT 10>` = 19 ký tự (BA 4.3, P3). Đo ở `lib/payments/noi-dung-ck.ts:36-40`: ngân
sách thật là **17 (khoá) + 1 (dấu nối) + 7 (`TRANSFER_NAME_MIN`) = 25 KHÍT**. Mã 8 ký tự vừa
ngân sách khoá, nhưng **bỏ SĐT đi** thì mất đường lùi nhánh (d); giữ SĐT 10 số thì phần tên con
còn 25−8−1−10 = 6 < 7. Phải chọn, và chọn đó thuộc US-10.

---

## 1. G0-1 · `PaymentRequest` có `enrollmentId` chưa? Có mang VA/QR không?

**KHÔNG có `enrollmentId`.** Cột hiện có (`prisma/schema.prisma`, `model PaymentRequest`):

```
id · orderId · orderItemId (mới 16/09) · centerId · orgUnitId
installmentNo · amountDue · dueDate · matchKey @unique · status · sortOrder
createdAt · updatedAt
```

**Không mang VA/QR.** Mã QR nằm ở bảng RIÊNG `QrSession` (`paymentRequestId` NOT NULL,
`providerOrderCode @unique`, `amountShown`, `qrContent`, `expiresAt`, `status`). Khoá đối khớp là
`PaymentRequest.matchKey`.

⇒ **Không phải tách bảng.** "Đợt công nợ" và "phiếu QR" VỐN ĐÃ là hai bảng. Việc còn lại của
thiết kế là cho `QrSession` trỏ được vào **phiếu gộp** (`PaymentBill`), hiện chưa được:
`QrSession.paymentRequestId` là `NOT NULL`.

## 2. G0-2 · Thực thể phụ huynh tên gì?

**Không có.** Đo bằng `grep -n "^model \(Guardian\|Customer\|Parent\)" prisma/schema.prisma` → 0 kết quả.

| Nơi giữ thông tin phụ huynh | Cột |
|---|---|
| `Lead` (`schema.prisma:1347`) | `parentName`, `phone` |
| `LeadChild` (`:1605`) | con của lead, có `parentPhone` riêng |
| `Student` (`:1662`) | `parentName`, `parentPhone`, `parentEmail`, `parentRelation`, `parent2Name`, `parent2Phone`, `parentUserId` → `User` |

Đường lead-nhiều-con sang ghi danh: `LeadChild` → `convert-lead-v2` → `Student` + `Enrollment`.
`OrderItem.studentId` (thêm 15/09) là chỗ duy nhất một DÒNG ĐƠN biết nó mua cho con nào **trước
khi** có `Enrollment`.

⇒ Khoá "gia đình" khả dĩ: **`Order.id`** (một đơn = một lần chốt của một nhà — chủ dự án đã
chốt), hoặc `Student.parentUserId` (chỉ có với PH đã cấp tài khoản — đo thấy `@@index` tồn tại
nhưng không phải PH nào cũng có `User`).

## 3. G0-3 · Bảng log giao dịch SePay, có unique theo mã ngân hàng không?

**`BankTransaction`**, và **CÓ** unique: `@@unique([provider, providerTxnId])`.

```
provider ("PAYOS" | "SEPAY") · providerTxnId · amount · transferredAt
accountNumber · referenceCode · content · rawPayload · status (BankTransactionStatus)
unmatchedNote · centerId · orgUnitId
```

⇒ **Pre-mortem T5 (webhook bắn lại → ghi trùng) đã có lưới ở tầng DB.** Rủi ro còn lại không
phải "trùng `bankTxnId`" mà là "một `BankTransaction` bị phân bổ hai lần" — lưới cho ca đó là
`@@unique([bankTransactionId, paymentRequestId])` trên `PaymentAllocation`, cũng đã có.

## 4. G0-4 · Dữ liệu "buổi đã diễn ra" có đủ tin không?

### Kết luận: **ĐỦ TIN một chiều — `COMPLETED` không bao giờ SAI, nhưng THIẾU.**

Đo trên `satarobo_local`:

```sql
SELECT CASE WHEN date < now() THEN 'QUA KHU' ELSE 'TUONG LAI' END, status, count(*)
FROM "ClassSession" GROUP BY 1,2;
```

| Mốc | Trạng thái | Số buổi |
|---|---|---|
| QUÁ KHỨ | `SCHEDULED` | **93** |
| QUÁ KHỨ | `COMPLETED` | 461 |
| TƯƠNG LAI | `SCHEDULED` | 55 |

```sql
SELECT count(*) FROM "ClassSession" s WHERE s.status='COMPLETED'
  AND NOT EXISTS (SELECT 1 FROM "Attendance" a WHERE a."sessionId"=s.id);
```
→ **0**. Mọi buổi `COMPLETED` đều có điểm danh (3.584 dòng / 461 buổi ≈ 7,8 HV/buổi).

**Đọc số này cho đúng:** `COMPLETED` **không có dương tính giả** (0 buổi COMPLETED mà không có
điểm danh), nhưng có **93 âm tính giả** — buổi đã qua mà trạng thái chưa ai cập nhật, tức
**16,8%** số buổi quá khứ. Đếm "buổi đã dùng" bằng `status = 'COMPLETED'` là **đếm THIẾU 1/6**,
và đếm thiếu nghĩa là **quyết toán trả lại cho phụ huynh nhiều hơn thực tế**.

**Hệ quả cho US-14 (dừng học):**
1. Công thức "buổi đã dùng" phải đếm theo **`ClassSession.date ≤ mốc`** của lớp con đó, KHÔNG
   theo `status`. Ngày là sự thật của tờ lịch; `status` là một cột phải có người bấm.
2. Vẫn giữ nguyên luật BA 4.6 *"hệ thống gợi ý, sale xác nhận"* — 93 buổi kia là bằng chứng nó
   cần thiết, không phải thủ tục.
3. ⚠️ `ClassSession.date` là `@db.Timestamptz(6)` **MANG GIỜ THẬT**, khác 9 model khác dùng
   `@db.Date` (nửa đêm đúng). So sánh theo tên cột là sai — xem `docs/luat-doc-so-va-ket-luan.md`.

⇒ Không chặn Đợt 3, nhưng **US-14 phải viết công thức theo `date`, và có ca test cho đúng 93 buổi
này** (buổi quá khứ còn `SCHEDULED` vẫn phải được tính là đã dùng).

## 5. G0-5 · OrgUnit có cờ đơn vị kế toán chưa? CS1/CS2 có phải 2 pháp nhân?

**CÓ cờ.** `OrgUnit.legalEntityId` → `model LegalEntity` (`schema.prisma:386`):
`taxCode @unique`, `legalName`, `isPrimary`, `isActive`, `deletedAt`.

**CS1 và CS2 KHÔNG phải hai pháp nhân.** Đo:

| OrgUnit | type | path | Pháp nhân (MST) |
|---|---|---|---|
| HO | HO | `/ho/` | 0402301783 |
| DANANG | REGION | `/ho/danang/` | 0402301783 |
| **CS1** | CENTER | `/ho/danang/cs1/` | **0402301783** |
| **CS2** | CENTER | `/ho/danang/cs2/` | **0402301783** |

Có 2 dòng `LegalEntity` cùng `legalName`, khác MST; chỉ `0402301783` là `isPrimary = true` và là
pháp nhân duy nhất được OrgUnit nào trỏ tới. `0402179999` **mồ côi** — không đơn vị nào dùng.

⇒ **Câu treo Q1 và giả định A5 của PRD đã có câu trả lời, và là NGƯỢC lại.** Bất biến B8 và cột
`accountingUnitId` vẫn nên cài (nhượng quyền sẽ cần, và cài sau khó hơn cài trước), nhưng
**không được để chúng chặn tiến độ Đợt 1**, và mọi kịch bản "chuyển chéo đơn vị kế toán"
(TS-38 bước 3, TS-42) hôm nay **không dựng được bằng dữ liệu thật** — phải dựng pháp nhân thứ hai
trong fixture.

⚠️ Đo trên `satarobo_local`. **Phải xác nhận lại trên prod** bằng đúng câu SQL trên trong Supabase
SQL Editor trước khi chốt — máy dev không có chuỗi kết nối prod.

## 6. G0-6 · Số dòng sổ tiền

Trên `satarobo_local` (KHÔNG phải prod):

| Bảng | Số dòng |
|---|---|
| `Order` | 507 |
| `OrderItem` | 510 |
| `Enrollment` | 531 |
| `Payment` | 416 |
| `OrderInstallment` | **37** |
| `PaymentRequest` | 426 |
| `PaymentAllocation` | 295 |
| `BankTransaction` | 431 |
| `CreditBalance` | 24 |

⚠️ **Đây KHÔNG phải số của prod, và khoảng cách là điều đáng chú ý nhất.** PRD viết *"prod gần như
0 dòng tiền (07/09: `Payment` 1 dòng)"* và dựng cả luận điểm "đổi mô hình lúc này gần như không
tốn chi phí chuyển đổi" lên đó. Nhưng **14/09 prod đã nhập giao dịch cũ hàng loạt** — chính chủ
dự án báo: *"ở prod thì đã nhập các giao dịch cũ vào hệ thống rồi"*, và phép quét prod ngày 16/09
tìm thấy **18 đơn / 24 khoản / 178.544.000đ** tiền đã về mà chưa gắn ghi danh.

⇒ **Luận điểm "chuyển đổi rẻ" của PRD đã hết hạn.** US-25 (chuyển sổ B) phải đo lại trên prod
trước khi lập kế hoạch, và P1 của Pre-mortem ("chuyển đổi dữ liệu cũ không đáng lo") phải nâng
mức.

## 7. G0-7 · Mọi chỗ đọc/ghi `OrderInstallment`, `allocateByWeight`, và cộng tiền ngoài `lib/finance/`

### 7a · GHI `OrderInstallment` — 8 đường (bỏ test)

| File | Thao tác |
|---|---|
| `lib/orders/installments.ts` | `deleteMany` · `create` · `update` (PAID) |
| `lib/crm/backfill-order.ts` | `createMany` |
| `lib/finance/debt.ts` | `update` (`lastReminderAt`) |
| `app/api/cron/debt-reminder/route.ts` | `update` (`lastReminderAt`) |
| `scripts/cleanup-test-data.ts` | `deleteMany` |
| `prisma/seed-lms/crm.ts` | `createMany` |

⇒ US-05/AC4 ("cờ bật → mọi đường ghi sổ B ném `SO_B_DA_DONG_BANG`") phải chặn **6 đường mã chạy
thật**, và 2 đường `lastReminderAt` **không nên chặn** — chúng ghi mốc nhắc nợ, không ghi tiền.
Chặn nhầm là cron nhắc nợ chết.

### 7b · ĐỌC `OrderInstallment` — 9 file

`lib/finance/debt.ts` · `lib/orders/installments.ts` · `lib/payments/payment-request.ts` ·
`lib/portal/billing-student.ts` · `lib/portal/dashboard.ts` · `app/api/cron/debt-reminder/route.ts` ·
`app/api/public/webhook/sepay/route.ts` · `scripts/cleanup-test-data.ts` ·
`scripts/do-hien-trang-tien.ts`

Hai file `lib/portal/**` là **cổng phụ huynh** — đây là chỗ hai sổ lệch nhau sẽ lộ ra với NGƯỜI
NGOÀI trước tiên. Ưu tiên chuyển về `debt.ts` cao hơn các file khác.

### 7c · `allocateByWeight` — 2 đường dùng, chỉ MỘT là thứ phải bỏ

| Nơi | Vai trò | Xử lý |
|---|---|---|
| `lib/finance/chia-khoan-theo-don.ts:117,138` (qua `lib/finance/payment.ts:13`) | chia MỘT khoản tiền cho NHIỀU ghi danh theo tỷ trọng | **Đúng thứ phải bỏ** trên luồng mới |
| `lib/payments/ke-hoach-dot.ts:49` (`chiaDotHocPhi`) | làm tròn largest-remainder khi chia học phí của MỘT người thành n đợt | **Giữ** — không liên quan chia cho nhiều con |

⚠️ Cấm cả hàm `allocateByWeight` (như architecture R3 gợi ý) là **phá phép làm tròn của kế hoạch
đợt**, tức đúng thứ Pre-mortem T12 sợ. Cấm phải nhắm vào `chia-khoan-theo-don`.

### 7d · Cộng tiền ngoài `lib/finance/`

Đo bằng grep, bỏ test:

| Kiểu | Số chỗ |
|---|---|
| `_sum: { amount … }` | **13** |
| `.reduce` trên `amount`/`amountDue`/`totalAmount`/`finalPrice` | **22** |

Nhóm đáng lo nhất (đọc tiền rồi HIỂN THỊ cho người ngoài hoặc quyết định nghiệp vụ):
`app/(admin)/admin/orders/[id]/page.tsx:167,341` · `app/(admin)/admin/thieu-hoc-phi/page.tsx:95-130`
· `app/(admin)/admin/payments/_actions.ts:259` · `app/api/public/webhook/sepay/route.ts:153` ·
`app/api/cron/payment-reconcile/route.ts:125,133` · `lib/portal/phieu-thu.ts:87`.

⇒ Con số BA nêu ("15 trục A + 4 trục B") là **ảnh chụp cũ**; số đo hôm nay là 13 + 22. US-05/AC5
phải dùng danh sách này, không dùng con số trong BA.

## 8. G0-8 · Catalog quyền hiện có

Đo: `grep -oE '\{ action: "[a-z0-9:_-]+"' prisma/seed-roles.ts | sort -u | wc -l` → **176 quyền**
(tài liệu ghi 202 — số cũ).

| Nhóm | Đã có |
|---|---|
| `payments:*` | `adjust` · `confirm` · `manage` · `record` · `view` · `view-pii` |
| `enrollments:*` | `cancel` · `create` · `edit` · `transfer` · `view-all` · `view-own` |
| `billing:*` | **0 — chưa có quyền nào** |
| `billing-policy:*` | **0** |

⇒ Cả **12 quyền `billing:*`** và 4 quyền `enrollments:stop|pause|resume|change-course` trong
permissions.md đều là **tên MỚI**, không đụng tên cũ. Nhưng phải nhớ hai điều đã đo trước đây:

1. **Seed vai KHÔNG tự chạy theo deploy** — prod phải bấm workflow `seed-prod-roles.yml` tay.
   Merge file seed mà không bấm thì quyền mới **không tồn tại trên prod** và mọi màn mới trả 403.
2. **`can()` v2 không có nhánh DENY** (`lib/auth/can.ts:36-44`). Đừng thiết kế bất kỳ luật nào
   dựa trên `grant=DENY` — nó bị bỏ qua IM LẶNG.

## 9. AC6 · Phân kỳ migration

| Nhánh | Số migration |
|---|---|
| `origin/main` | 247 |
| `origin/test` | 250 |
| `HEAD` (nhánh này) | **252** |

`comm` giữa `HEAD` và `origin/main`:
- **main có mà HEAD thiếu: 0** ⇒ nhánh KHÔNG tụt về migration.
- HEAD có mà main chưa: 5 — `20260914120000_hoa_don_thong_tin_nguoi_mua`,
  `20260915090000_order_item_hoc_vien`, `20260915140000_order_item_giam_gia`,
  `20260915170000_order_item_nhieu_giam_gia`, `20260916120000_payment_request_theo_con`.

`git rev-list`: nhánh đứng **sau main 2 commit**, **trước main 52 commit**. Hai commit kia không
chạm `prisma/migrations/`.

⚠️ `origin/test` có 250 mà main 247 — **test đi TRƯỚC main 3 migration**. Đó là hình dạng bình
thường của repo này (test là nhánh tiền-prod), nhưng nghĩa là **DB test đã có schema mà prod
chưa**, nên đừng suy hiện trạng prod từ DB test.

## 10. Bảng ánh xạ tên thiết kế → tên thật

| Tên trong BA/architecture | Tên thật trong repo | Tình trạng |
|---|---|---|
| Gia đình / `guardianId` | **không có bảng** — dùng `Order.id`; PH ở `Lead.phone` / `Student.parentPhone` / `Student.parentUserId` | X2 |
| Ghi danh | `Enrollment` | có sẵn, nhưng **sinh SAU khi chốt đơn** (X1) |
| Đợt thu | `PaymentRequest` (hạt = `orderItemId`, không phải `enrollmentId`) | có sẵn + cột mới 16/09 |
| Kỳ thu | `PaymentBill` | **đã tạo** 16/09 (`orderId`, `matchKey`, `status`, `amountDue`) — chưa có `code`/`virtualAccount` |
| Dòng kỳ thu | `PaymentBillLine` | **đã tạo** (`billId`, `paymentRequestId`, `sortOrder`, `amount`) |
| Ví gia đình / `GuardianWalletEntry` | **`CreditBalance`** (đã có, 24 dòng): `parentUserId?` · `studentId?` · `orderId?` · `bankTransactionId?` · `amount` · `note` · **`settledAt` / `settledById`** | **khác vai** — xem dưới |
| Dòng tiền / `Payment` | `Payment` (Ledger-A) + `PaymentAllocation` (Ledger-B) — **hai sổ, không phải một** | khác thiết kế |
| Log giao dịch ngân hàng | `BankTransaction` | có sẵn, `@@unique([provider, providerTxnId])` |
| Mã QR | `QrSession` | có sẵn, `paymentRequestId` NOT NULL |
| `EnrollmentPriceSegment` | **chưa có** | bảng mới |
| `EnrollmentDiscount` | một phần ở `OrderItem.discounts` (JSON, 15/09) + `Enrollment.discountAmount` | chưa có bảng riêng |
| `EnrollmentEvent` | **chưa có** | bảng mới |
| `MoneyOperation` | **chưa có**; gần nhất là `AuditLog` + `OrderStatusHistory` | bảng mới |
| `BillingPolicyVersion` | **chưa có**; tham số vận hành hiện ở `SystemSetting` (khoá phẳng) | bảng mới; xem X5 |
| `accountingUnitId` | `OrgUnit.legalEntityId` → `LegalEntity` | có sẵn; CS1=CS2 (X4) |
| `lib/finance/ledger/ghiNghiepVuTien` | **chưa có** | đường ghi mới |
| `lib/finance/feature.ts` | **chưa có**; cờ hiện ở `lib/flags.ts` (`isThuTheoConEnabled`, env) | xem X5 |

### ⚠️ `CreditBalance` KHÔNG cùng vai với `GuardianWalletEntry` — đọc kỹ trước US-12

Hai bảng trông giống nhau nhưng khác nhau ở đúng chỗ quyết định thiết kế:

| | `GuardianWalletEntry` (thiết kế) | `CreditBalance` (thật) |
|---|---|---|
| Là gì | **Số dư** — cộng các dòng ± ra số tiền đang giữ | **Danh sách việc** — `settledAt` đánh dấu kế toán đã xử lý TAY (chú thích ngay trong schema: *"xử lý TAY, hệ thống không tự động"*) |
| Loại dòng | `kind`: DEPOSIT_UNSPLIT · OVERPAY · TRANSFER_IN/OUT · REFUND · UNMATCHED_TO_WALLET | **không có cột `kind`** |
| Dấu | `amount` ± (ra/vào) | chỉ đo được là tiền thừa; không có đường ghi âm |
| Khoá gom | `guardianId` × `accountingUnitId` | `parentUserId?` / `studentId?` / `orderId?` — **cả ba đều nullable** |

⇒ US-12 ("chia ví") **không phải thêm một màn lên bảng có sẵn** — nó là đổi `CreditBalance` từ
danh-sách-việc thành sổ-số-dư: thêm `kind`, cho phép dòng âm, và chọn khoá gom. Đó là công việc
của một migration, không phải của một màn. Ước lượng của PRD cho US-12 đang thiếu phần này.

---

## 11. Việc phải chốt trước khi mở phiên tiếp theo

| # | Việc | Chặn story nào |
|---|---|---|
| ~~1~~ | ~~Công tắc ở đâu~~ — **ĐÃ CHỐT 16/09 chiều**: `SystemSetting billing.flexV1Enabled` (toàn hệ) + `CenterSetting` override theo cơ sở. Cờ env `PAYMENT_PER_CHILD_ENABLED` đã gỡ | xong |
| 2 | **Khoá "gia đình"** — `Order.id` (đã chốt) đủ cho ví và kỳ thu chưa, khi một nhà có nhiều đơn ở nhiều đợt? | US-12 |
| 3 | Nội dung CK: 25 ký tự chia thế nào giữa mã kỳ thu, SĐT và tên con | US-10 |
| 4 | Xác nhận X4 (CS1/CS2 cùng pháp nhân) **trên prod** | US-03 |
| 5 | Đo lại G0-6 **trên prod** sau đợt nhập giao dịch cũ 14/09 | US-25 |

## 12. Những gì GATE 0 này KHÔNG trả lời được

- **Mọi số ở mục 6 và 4 là của `satarobo_local`, không phải prod.** Máy dev không có chuỗi kết nối
  prod (`.env` trỏ DB dev); đường duy nhất là Supabase SQL Editor. Ba câu SQL cần chạy trên prod
  đã ghi nguyên văn ở mục 5, 6 và mục 11.
- **G0-4 đo trên dữ liệu seed**, nên tỷ lệ 93/554 là tỷ lệ của `satarobo_local`. Điều **không phụ
  thuộc dữ liệu** là hình dạng lỗi: `status` là cột phải có người bấm, còn `date` thì không —
  và đó mới là thứ quyết định công thức của US-14.
