# Màn kế toán — Hoá đơn điện tử · PLAN v2 [25/09/2026]

> Nhánh `hptkk29/module-ketoan` (dựng lại trên `origin/test` @ `0c71d9c8`). **Chưa code.**
> Cách làm ra plan này:
>
> - **Đọc:** 17 agent. Có 8 mảng, mỗi mảng một người đọc bằng CodeGraph và một người kiểm chéo, cộng 1 người rà toàn cục.
> - **Phản biện v1:** 50 agent soi theo 4 góc (tiền · quyền · luật lần thu · vận hành). Mỗi phát hiện nặng được một người khác cố bác bỏ. Kết quả: **58 phát hiện đứng vững, 4 bị bác**. v2 này sửa theo cả 58.
>
> Plan này là **GĐ 7** của `docs/quy-trinh-thanh-toan-2209.md`.

---

## 0. Bốn quyết định đã chốt (25/09) và MỘT chỗ phải hỏi lại

| # | Câu | Chốt |
|---|---|---|
| Q1 | Tờ phiếu thu kế toán tải về ra đời lúc nào | **Bản CHỜ XÁC NHẬN tải được ngay khi tiền về. Số RCP cấp khi bấm Xác nhận** |
| Q2 | Khoản nào vào hàng chờ | **Mọi khoản thu thật.** Có nút "Không xuất / đã xuất ngoài hệ thống", bắt buộc lý do |
| Q3 | Xác nhận có bắt buộc có file không | **Bắt buộc có file mới xác nhận** |
| Q4 | Một hoá đơn ứng với gì | **Theo LẦN THU.** Số lệch với đợt thì phải gắn thêm giao dịch cho đủ, rồi mới tính là một lần thu |

### ⛔ 0.1 Q3 CÓ chạm phần khác. Phải hỏi lại trước GĐ 5

Chủ dự án nói *"phần này không liên quan phần nào cả, chỉ chạm khâu trả hoá đơn cho KH"*. Mã
đang chạy nói khác:

- "PH đã đóng" = `TRANG_THAI_THUC_THU = ["CONFIRMED","REFUNDED"]` (`lib/finance/thuc-thu.ts:46`).
  Khoản `PENDING` **không được cộng**.
- Những nơi đọc con số đó:
  - cổng phụ huynh `/portal/hoc-phi` (`lib/portal/billing.ts:169,286`, `billing-student.ts:74`) và trang chủ portal (`lib/portal/dashboard.ts:69,213`);
  - màn `/cong-no` (`lib/finance/debt.ts:325`);
  - báo cáo doanh thu, bảng điều khiển QLCS;
  - đề xuất hoàn tiền (`lib/finance/cho-de-xuat-hoan-tien.ts:217`).
- Nếu "Xác nhận" (tức chuyển khoản sang `CONFIRMED`) phải chờ file hoá đơn thì **phụ huynh đã
  chuyển khoản vẫn thấy "còn nợ" trên cổng** cho tới khi kế toán làm xong hoá đơn bên MISA.

| | Nghĩa của nút "Xác nhận" trên màn mới | Hệ quả |
|---|---|---|
| (a) | = xác nhận **khoản thu** (`PENDING→CONFIRMED`, cấp RCP) **và** chốt hoá đơn, chỉ làm được khi có file | Công nợ và cổng PH trễ theo tốc độ làm hoá đơn |
| **(b)** 👍 | = **chốt hoá đơn** (bắt buộc có file, rồi gửi email). Xác nhận khoản thu vẫn làm được ở `/payments` như hôm nay. Khoản còn chờ thì màn mới xác nhận luôn trong cùng lần bấm | Công nợ không trễ. Đúng câu "chỉ chạm khâu trả hoá đơn" |

Plan viết theo **(b)**. Nếu chốt (a) thì chỉ GĐ 5 đổi.

---

## 1. Hiện trạng đã đo

### 1.1 Tiền về tự làm gì, và KHÔNG làm gì

```
SePay/payOS ─► ingestPayosWebhook (lib/payments/payos-ingest.ts:737)
  ├─ BankTransaction  @@unique([provider, providerTxnId]) — provider lưu "SEPAY"/"PAYOS"
  ├─ thuTheoPhieuGop (phieu-gop.ts:686) ─► Payment MỖI CON một dòng · RECORDED/PENDING
  └─ allocateToOrder ─► PaymentAllocation theo đợt (waterfall, có dung sai làm tròn)
                     ─► MỘT Payment = tổng đã rót · RECORDED/PENDING
                     ─► tiền thừa ─► CreditBalance
  Đường lùi SePay (route.ts:307-373) ─► Payment [auto:order-confirm] bằng CHÍNH tiền CK,
                                        trong khi BankTransaction đó vẫn UNMATCHED
```

- **Không có `Receipt` (RCP) nào tự sinh.** `issueReceipt` chỉ có một chỗ gọi, trong
  `confirmPayment` (`lib/finance/payment.ts:626`). Khoản PENDING thì route PDF trả 404. Thứ chủ dự
  án thấy "tự tạo phiếu thu" thực ra là **đợt (`PaymentRequest`) và phiếu gộp (`PaymentBill`)
  chuyển PAID**. Đó là phiếu ĐÒI tiền, không phải chứng từ thu có số.
- `Payment` **không có khoá ngoại** tới `BankTransaction` hay đợt. Chỉ nối được qua marker trong
  `note`, gồm ba họ:
  - **họ ngân hàng:** `[auto:<provider-thường>:<txn>]` · `[gan-tay:<btId>]`;
  - **họ lời khai:** `[auto:order-confirm]` · `[auto:order-installment:dotN]`. Họ này KHÔNG mang giao dịch nào;
  - **họ tách/chuyển:** `[tách k/n]` · `[tach:<id>]` · `[chuyen:<id>]`.

  Nguồn: `lib/finance/payment-markers.ts`, `ghi-tien-don.ts:223,234,1171`.
- **Đảo bút toán giữ nguyên dòng gốc.** Tách khoản, gỡ gắn, hoàn tiền và điều chỉnh đều để dòng gốc
  sống nguyên (PAYMENT, số dương) rồi ghi thêm dòng trỏ `adjustmentOfId`
  (`ghi-tien-don.ts:779-795,1050-1103`; `payment.ts:880-900,1052-1067`). ⇒ **số tiền của một khoản
  phải tính RÒNG** (§3.1).
- **Ngày.** `Payment.paidDate` là lúc máy ghi hoặc lúc gắn tay. Ngày tiền về thật là
  `BankTransaction.transferredAt`, và cột này **lưu giờ VN như thể là UTC**, tức lệch 7 tiếng.

### 1.2 Hoá đơn: đã có gì

- 4 cột người mua trên `Order` (`invoiceBuyerName/CompanyName/TaxCode/Email`), đọc qua
  `nguoiMuaChoDon`. Email nhận = `invoiceEmail ?? customerEmail`.
- Tầng thuần `lib/finance/hoa-don/*`: thuế, người mua, `thieuChoHoaDon`, pháp nhân, số bằng chữ.
  CS1 và CS2 đều là **SATA ROBO, MST 0402301783** (BLĐ, 22/09, `1ad32e37`).
- Ý đồ ghi rõ: **hệ thống KHÔNG tự phát hành hoá đơn**. Kế toán phát hành ở MISA.
- **Chưa có:** bảng/cột file hoá đơn, số hoá đơn, trạng thái "đã xuất", key `invoices:*`.
  ⚠️ `invoice-code.ts` và Counter `invoice:` là **mã ĐƠN INV-…**, nên bảng mới **không đặt tên `Invoice`**.

### 1.3 Năm lỗ hạ tầng. Mỗi lỗ là một việc phải làm

| Lỗ | Bằng chứng | Việc |
|---|---|---|
| Bucket mặc định là **CDN công khai** | `lib/storage/signed-url.ts:37-47` | Bucket **riêng** + getter fail-closed + **CORS** (§6) |
| Presign trả **403** cho kế toán, không nhận `.xml` | `app/api/admin/upload-url/route.ts:27-47` | Route riêng (§6) |
| Email **không có đính kèm** | `lib/email/send.ts:4-25`, `queue.ts:14-26` | SDK `resend@6.12.3` có sẵn `attachments[].path` + `idempotencyKey` (§7) |
| `confirmPayment` từ chối khoản thiếu `enrollmentId`, và `Receipt.enrollmentId` NOT NULL | `payment.ts:601-603`, `schema.prisma:6834-6840` | Đơn **kit/thi** không bao giờ có RCP ⇒ Q-mở 2 |
| Kế toán cơ sở **không sửa được** người mua; **không ai** sửa được địa chỉ/CCCD sau khi tạo đơn | `orders/_actions.ts:766-769` (`orders:manage`, CENTER_ACCOUNTANT không có) | Q-mở 3 |

### 1.4 Ràng buộc trang đơn

`/admin/orders/[id]` có **đúng 11 `await`, bằng trần** của `[DST-01]`. Dữ liệu hoá đơn phải vào một
lô `Promise.all` có sẵn. Khi cờ `billing.flexV1Enabled` TẮT, trang không liệt kê từng khoản.

---

## 2. Mô hình dữ liệu

### 2.1 Đơn vị nguyên tử = một `Payment` thu thật. Hoá đơn gom 1..n khoản thành một LẦN THU

Vì sao không chọn thứ khác:

- **Đợt:** không có khoá từ `Payment`.
- **Phiếu gộp:** chỉ có khi cờ bật.
- **Receipt:** không có cho đơn kit, và không có `centerId`.
- **BankTransaction:** tiền mặt không có giao dịch.
- **`Payment` thì có đủ:** đã được scope, có `centerId`, và **bất biến sau CONFIRMED**.

Tệp mới `lib/finance/hoa-don/du-dieu-kien.ts` (THUẦN) chứa **MỘT hàm `duDieuKienHoaDon(khoan, ngữ cảnh)`**,
dùng chung cho hàng chờ, khối trang đơn và cổng xác nhận:

```
rong(k)  = k.amount + Σ amount của mọi dòng có adjustmentOfId = k.id, deletedAt IS NULL
           (KHÔNG lọc theo paymentType — dòng hoàn là PAYMENT/REFUNDED; dòng đảo bị REJECTED
            vẫn cộng, cùng lý lẽ debt.ts:607-614)
ngayThu(k) = BT.transferredAt (hiểu là giờ VN) nếu k có marker họ ngân hàng, ngược lại paidDate

ĐỦ ĐIỀU KIỆN khi TẤT CẢ:
  · paymentType = PAYMENT · k.amount > 0 · rong(k) > 0 · deletedAt IS NULL
  · accountantStatus ≠ REJECTED · method ≠ 'chuyen-noi-bo'
  · KHÔNG mang [backfill-import] / [sheet:…]           (lịch sử, đã xuất ngoài hệ thống)
  · đơn có centerId (đơn NULL ⇒ dòng "Gán cơ sở cho đơn trước", không vào hàng chờ)
KHÔNG dùng `daBiDao` (debt.ts:616) làm tập loại — nó gom cả điều chỉnh MỘT PHẦN.
```

Đơn `CANCELLED` / `REFUNDED` **không** vào "Chờ xuất". Khoản của các đơn này ra tab riêng
**"Đơn đã huỷ"**, và ở đó kế toán chỉ chọn được `KHONG_XUAT` hoặc xuất theo số đã thu (kèm lý do).

### 2.2 Ba bảng mới (SQL tay, timestamp > `20260924180000`, RLS cho CẢ BA)

```prisma
enum HoaDonTrangThai { NHAP  DA_XAC_NHAN  THAY_THE  KHONG_XUAT }

model HoaDonDienTu {
  id String @id @default(cuid())
  orderId       String
  centerId      String            // NOT NULL — bảng mới, chưa có dữ liệu; đơn thiếu cơ sở bị từ chối
  orgUnitId     String?           // ghi kép tự động (lib/org/dual-write.ts)
  trangThai     HoaDonTrangThai
  kyHieu String?  soHoaDon String?  ngayPhatHanh DateTime? @db.Date  maTraCuu String?
  // BẢN CHỤP — pháp nhân đã đảo 2 lần trong 7 ngày; người mua chụp ở bước ② (xem §4)
  phapNhanMa String? phapNhanTen String? phapNhanMst String?
  nguoiMuaTen String? nguoiMuaDonVi String? nguoiMuaMst String? nguoiMuaDiaChi String?
  emailNhan  String?             // NGUỒN DUY NHẤT của người nhận email — không đọc lại Order
  nguoiMuaHashLucIn String?      // hash người mua lúc tải phiếu chờ (②) — ⑤ so để cảnh báo
  tongTien   Int                 // Σ HoaDonKhoan.soTien (ròng)
  tienThaLamTron Int @default(0) // phần dung sai được tha của các đợt nó phủ — hiện riêng
  tepPdfKey String? tepPdfTen String? tepPdfCo Int? tepPdfSha256 String?
  tepXmlKey String? tepXmlTen String? tepXmlCo Int?
  lyDo String?  thayTheChoId String?
  xuatTheoSoDaThu Boolean @default(false)  // Q-mở 1 — lần thu THIẾU mà vẫn xuất, bắt buộc lyDo
  taoBoiId String  xacNhanBoiId String?  xacNhanLuc DateTime? @db.Timestamptz(6)
  createdAt/updatedAt @db.Timestamptz(6)
}
model HoaDonKhoan { hoaDonId String  paymentId String  soTien Int  hieuLuc Boolean @default(true)
                    @@id([hoaDonId, paymentId]) }
model HoaDonGuiEmail { id  hoaDonId  lanGui Int  toi String
                       trangThai String  // CHO · DANG_GUI · DA_GUI · LOI
                       emailQueueId String?  loi String?  guiBoiId String?  createdAt …
                       @@unique([hoaDonId, lanGui]) }
// (GĐ 1: bỏ `phienBan` — thay hoá đơn là tạo DÒNG MỚI, bản cũ THAY_THE; tệp của một hoá đơn
//  đã DA_XAC_NHAN là bất biến ⇒ không có "phiên bản" nào trong cùng một dòng để mà đánh số.)
// (GĐ 1: thêm `guiEmailKhach Boolean @default(true)` — xem §7.)
```

**Chỉ mục viết tay:**

- `UNIQUE (paymentId) WHERE hieuLuc`: một khoản chỉ thuộc **tối đa một** hoá đơn đang hiệu lực, dù ở trạng thái NHAP, DA_XAC_NHAN hay KHONG_XUAT.
- `UNIQUE (phapNhanMst, kyHieu, soHoaDon) WHERE trangThai IN ('NHAP','DA_XAC_NHAN')`: không để hai lần thu mang **cùng một số hoá đơn**.

**Vì sao bảng nối mà không thêm cột vào `Payment`:** không ALTER bảng tiền đang có dữ liệu prod (luật cứng #4), và giữ được lịch sử khi hoá đơn bị thay.

**Khai báo bắt buộc:** `HoaDonDienTu` vào `SCOPED_MODELS`, `getModelPrefixes()` (`["payments:"]`) và `BACKFILL_SPECS` (`BAT_BUOC`).

**Luật đọc bảng con.** `HoaDonKhoan` và `HoaDonGuiEmail` KHÔNG được scope, nên:

- đọc trước `sdb.hoaDonDienTu`, rồi `include` bảng con;
- có **lưới ghim** cấm truy vấn top-level `hoaDonKhoan.` / `hoaDonGuiEmail.` trong `app/`, ngoại trừ các cổng không-scope đã khai.

**Không** thêm bảng nào vào publication realtime.

**Cờ "Cần điều chỉnh" SUY RA khi đọc, không lưu cột** (để khỏi chạm ba đường tiền). Một hoá đơn `DA_XAC_NHAN` cần điều chỉnh khi có một trong ba điều sau:

- có dòng trỏ `adjustmentOfId` vào khoản của nó, tạo sau `xacNhanLuc`;
- đơn đã `CANCELLED` / `REFUNDED`;
- Σ `rong` hiện tại ≠ `tongTien`.

Hàm thuần có test. Cờ tự hết khi có hoá đơn mới với `thayTheChoId` trỏ vào.

Drift: công thức `--from-url` (CLAUDE.md mục 6). Cổng đạt khi: **0 dòng nhắc bảng mới, ngoài các dòng của chỉ mục từng phần đã khai**.

---

## 3. Luật "LẦN THU" và "đủ tiền" (Q4) — `lib/finance/hoa-don/lan-thu.ts`, THUẦN

### 3.1 Nguồn của mỗi khoản

| Họ marker | Giao dịch | Ghi chú |
|---|---|---|
| `[auto:<prov>:<txn>]` | BT theo `provider` **không phân biệt hoa thường** + `providerTxnId` | marker viết thường, cột lưu `SEPAY` |
| `[gan-tay:<btId>]` | BT theo `id` | |
| họ tách `[tách k/n]`, `[tach:<id>]` | theo marker ngân hàng được chép sang | dòng gốc đã đảo có `rong = 0` nên tự rơi |
| `[auto:order-confirm]`, `[auto:order-installment:dotN]` | **không có** — là **LỜI KHAI** | xem 3.3 |
| không marker / tiền mặt / COD | không có | mỗi khoản một lần thu |
| provider `BACKFILL` (`backfill:<paymentId>`) | **giao dịch giả** | ánh xạ ngược về Payment bằng cách cắt tiền tố; **không bao giờ** là ứng viên gắn |

### 3.2 Gom nhóm — MỘT bước, KHÔNG bắc cầu

```
1. Mỗi giao dịch (của đơn đang xét) ⇒ "đợt đích" = đợt nhận phần phân bổ LỚN NHẤT từ nó
   (lọc PaymentAllocation theo paymentRequest.orderId = đơn này)
2. Lần thu = mọi giao dịch có CÙNG đợt đích  +  khoản không-giao-dịch mà kế toán CHỦ ĐỘNG gắn vào
   · phần tràn sang đợt sau / vào ví ĐI THEO giao dịch của nó, chỉ HIỆN "kèm 12.000đ trả trước Đợt 2"
   · khoản không có giao dịch nào ⇒ mỗi khoản một lần thu
   · đợt đích là phiếu "thu toàn đơn" (đơn cũ, không có kế hoạch đợt) ⇒ mỗi giao dịch một lần thu
3. phaiThu(đợt X) = amountDue(X) − roundingWaived(X)
                  − Σ phân bổ vào X từ giao dịch KHÔNG thuộc nhóm (phần tràn của nhóm khác)
                  − Σ phần của X đã nằm trong hoá đơn hiệu lực
4. Trạng thái (so bằng TIỀN, không bằng status của đợt — vì tiền mặt không bao giờ vào sổ đợt):
     DU        Σ rong(nhóm) ≥ phaiThu(X)
     THIEU     Σ rong(nhóm) < phaiThu(X)  ⇒ "Thiếu 1.000.000đ so với Đợt 2"
     DOT_HUY   có phân bổ vào đợt VOID ⇒ tab "Đơn đã huỷ / cần điều chỉnh", không bao giờ THIEU
     KHONG_DOI_CHIEU   khoản không giao dịch, không đợt ⇒ đủ theo số đã ghi
     LOI_KHAI  khoản họ lời khai (3.3)
5. Khoản đang khoá vào hoá đơn khác ⇒ KHÔNG BAO GIỜ được đề xuất gộp.
```

**Ca test bắt buộc:**

- **Ba lần chuyển số tròn** (4.500.000 × 3 cho đợt 4.488.000) ⇒ **3 lần thu DU**, không bắc cầu thành một.
- **Hai lần chuyển cho cùng một đợt** (2tr + 1tr cho đợt 3tr) ⇒ **1 lần thu**, THIEU trước khi có lần thứ hai, DU sau.
- **Tiền mặt + chuyển khoản cùng một đợt** ⇒ THIEU cho tới khi kế toán gắn khoản tiền mặt vào, sau đó DU.
- **Chuyển thiếu 3.000đ, được tha** ⇒ DU, hiện riêng "tha 3.000đ".
- **Tách 2 bé** ⇒ Σ nhóm = 1× số tiền chuyển khoản.
- **Gỡ gắn** ⇒ khoản rời hàng chờ.
- **Hoàn tiền toàn phần trước khi xuất** ⇒ khoản rời hàng chờ.
- **Điều chỉnh một phần** ⇒ khoản vẫn ở hàng chờ với số ròng.
- **Đợt bị VOID** ⇒ DOT_HUY.
- **Chuyển khoản lúc 23:30 ngày 30/09** ⇒ lần thu thuộc tháng 9.

### 3.3 Lời khai và nghi trùng

Khoản `[auto:order-confirm]` / `[auto:order-installment:dotN]` có thể **chính là** tiền chuyển khoản
(đường lùi SePay), hoặc là lời sale khai lúc xác nhận đơn bằng tay. Nếu **cùng đơn** có khoản họ
ngân hàng, hoặc có BT `UNMATCHED` trùng SĐT hay số tiền, thì dòng đó mang **NGHI_TRUNG**: nút Xác
nhận tắt, kèm câu *"Khoản khai tay này có thể trùng giao dịch FT24…, hãy từ chối một bên trước"*.
Giao dịch đã "được đại diện" bởi một lời khai thì bị loại khỏi danh sách gắn thêm.

### 3.4 "Gắn thêm cho đủ" (dòng THIEU)

- **(i) Khoản chưa xuất của CÙNG đơn** (kể cả tiền mặt): chọn là gộp vào nhóm. Chỉ đổi cách nhóm, **không ghi sổ tiền**.
- **(ii) Giao dịch chưa khớp:** **dùng lại nguyên component `xu-ly-giao-dich.tsx`**, component này tự rẽ nhánh theo `laThuTienLinhHoatBat(order.orgUnitId)`:
  - cờ TẮT: `allocateToOrder` với `target.paymentRequestId` = **đợt đang THIẾU**. Không dùng `ganGiaoDichVaoDon`, vì hàm đó rót vào đợt mở **sớm nhất**;
  - cờ BẬT: màn chia theo con `ganGiaoDichTheoConAction`, điền sẵn đợt đang thiếu.

  Loại khỏi danh sách: provider `BACKFILL`, và giao dịch đã được lời khai đại diện.

Nút Xác nhận chỉ sáng khi DU. Ca THIẾU mà PH không bao giờ trả nốt: xem Q-mở 1.

**Tiền thừa (`CreditBalance`):** hiện **chưa có đường nào rót tiền thừa vào đơn** ⇒ **ngoài phạm
vi**. GĐ 0 đo tổng. Xem Q-mở 5.

---

## 4. Luồng màn kế toán — `/admin/payments/hoa-don`

Đặt dưới segment `payments`:

- **không** phải thêm `ADMIN_ROUTE_SEGMENTS`;
- **mọi phép ghi nằm trong action ở `app/(admin)/admin/payments/hoa-don/_actions.ts` hoặc trong `lib/finance/hoa-don/*`**, là những chỗ lưới `cong-truoc-phep-ghi` và luật cấm `@/lib/db` quét tới;
- các route chỉ làm ba việc: ký URL, kiểm byte, ghi audit. Route đặt ở `app/(admin)/admin/payments/hoa-don/**/route.ts`, không đặt ở `app/api/admin/`, để ăn luật lint.

```
① Tiền về            ─► dòng ở "Chờ xuất" (DU) / "Lệch số" (THIEU, NGHI_TRUNG) / "Đơn đã huỷ"
② [Tải phiếu thu]    ─► PDF bản CHỜ XÁC NHẬN, dấu nền "CHỜ XÁC NHẬN · CHƯA CÓ SỐ".
                         Lần thu có 2 khoản (2 con) ⇒ 1 file, 2 trang. Ghi nguoiMuaHashLucIn.
③ (kế toán làm hoá đơn ở MISA)
④ [Tải lên hoá đơn]  ─► ký URL theo orderId ─► PUT thẳng R2 ─► /xong (kiểm tiền tố + byte + sha256)
                     ─► action: TẠO NHAP + HoaDonKhoan trong transaction (khoá khoản vào hoá đơn)
                         ký hiệu điền sẵn theo mẫu 1C{YY}TSR với YY = năm của ngayPhatHanh
⑤ [Xác nhận]         ─► (HEAD bucket làm TRƯỚC transaction)
                         transaction, MỌI cổng đứng trước phép ghi đầu tiên:
                           · khoaDonTrongTx + SELECT … FOR UPDATE các khoản
                           · đơn KHÔNG CANCELLED/REFUNDED · nhóm vẫn DU · rong(k) = soTien đã chụp
                           · mỗi khoản: passesScope + thuộc tập cơ sở KẾ TOÁN của actor (§9)
                           · khoản PENDING: AC5 (recordedById ≠ actor) · có enrollmentId
                         phép ghi ĐẦU TIÊN = updateMany NHAP→DA_XAC_NHAN có điều kiện (chống bấm đôi)
                         rồi xacNhanKhoanTrongTx(tx, …) cho khoản còn PENDING (cấp RCP)
                         rồi (nếu `guiEmailKhach`) tạo HoaDonGuiEmail(toi = emailNhan, lanGui = 1) + publishEvent
⑥ Sau commit         ─► có email ⇒ gửi ĐÍNH KÈM · không có ⇒ báo sale + hiện trên trang đơn
```

**Tách lõi xác nhận:** viết `xacNhanKhoanTrongTx(tx, {paymentId, confirmedById, now})` **ngay trong
`lib/finance/payment.ts`**. Tệp này đã nằm trong `NGOAI_LE` của lưới `truc-a`, nên chép lõi sang tệp
khác là lưới đỏ. `confirmPayment` và action hoá đơn cùng gọi hàm này, nên chỉ còn một chỗ phát
`payment.confirmed`. Hàm mang theo:

- **AC5** và **passesScope**. Hai cổng này hiện chỉ nằm ở tầng action.
- **Cổng `rong > 0`.** Hôm nay `/payments` xác nhận được cả dòng gốc đã bị đảo và cấp RCP cho tiền đã gỡ. Bản vá này đóng luôn lỗ đó.
- **Cổng "sau `updateMany` đọc lại, khác CONFIRMED thì throw".** Không dùng lối "raced ⇒ coi như xong".

Action hoá đơn revalidate đủ tập đường của `confirmPaymentAction`, cộng `/orders/<id>` và `/payments/hoa-don`.

**Không xuất:** chọn lý do (*Đã xuất ngoài hệ thống · Khách không lấy hoá đơn · Khác…*) ⇒
`KHONG_XUAT`, không có file. **Không có mốc ngày và không có thao tác đánh dấu hàng loạt** (chốt
26/09): chủ dự án xác nhận mọi khoản thu thật đã có hoá đơn xuất ở MISA — hệ thống chỉ thiếu chỗ
tải lên. Đo prod: 32 khoản, toàn tháng 8–9/2026 ⇒ kế toán tải từng tệp lên là đủ, không cần công cụ lô.

**Thay hoá đơn sai:** tải bản mới ⇒ bản cũ `THAY_THE`, `hieuLuc = false`, bản mới trỏ `thayTheChoId`.
Hỏi trước khi gửi lại.

**Gửi lại:** action riêng (quyền `payments:confirm`, có audit), tạo `HoaDonGuiEmail` với `lanGui + 1`
và `idempotencyKey` mới. Mặc định gửi tới `emailNhan`. Được chọn email hiện tại của đơn, nhưng chỉ
kèm hỏi xác nhận, và phải ghi audit.

---

## 5. Móc an toàn vào sổ tiền (R7) — MỘT cổng, LUÔN CHẠY, không phụ thuộc cờ

Cổng dùng chung: `khoanDaKhoaHoaDon(tx, paymentIds)`.

- Tra **KHÔNG-SCOPE** (bài học `method-lookup.ts`: tra qua scope thì đúng dòng cần chặn bị lọc mất).
- Coi là "đã khoá" khi khoản thuộc hoá đơn `NHAP | DA_XAC_NHAN | KHONG_XUAT` mà `hieuLuc` còn true.
- **Tắt cờ không mở lại được** `rejectPayment` trên khoản đã có hoá đơn. Có ca test canh riêng.

| Đường có sẵn | Cách móc |
|---|---|
| `rejectPayment` (hiện từ chối được cả khoản CONFIRMED) | **Chặn**, báo *"Khoản đã có hoá đơn 1C26TSR-127, hãy thay/huỷ hoá đơn trước"* |
| `goGanTheoCon`, `tachKhoanChoCon`, `updatePendingPayment` | **Chặn** |
| `linkRecordedPaymentsToEnrollments` (convert lead), `ganGhiDanhChoKhoanCuaDon` (chạy ngầm trong `ensureOrderPaymentRecorded`), lưu kế hoạch luồng cũ (xoá mềm khoản `[auto:order-*]`) | **Bỏ qua khoản đang khoá** bằng `hoaDonKhoan: { none: { hieuLuc: true } }` trong `where`. KHÔNG throw, vì throw là làm vỡ cả lượt convert |
| `refundPayment`, `adjustPayment`, huỷ đơn | **Không chặn, không sửa.** Cờ "cần điều chỉnh" suy ra khi đọc (§2.2) |

Mọi cổng đều đứng trước phép ghi đầu tiên. Có ca R7 cho cả 6 đường.

---

## 6. Lưu tệp

- **Bucket:** `R2_INVOICE_BUCKET_NAME` (prod) và bản `-test`, **không gắn tên miền**. Getter
  fail-closed, khuôn `lib/calls/kho-ghi-am.ts`: env thiếu hoặc trùng bucket công khai / chat /
  elearning / call ⇒ **ném lỗi** ⇒ màn trả 503 *"chưa cấu hình kho hoá đơn"*.
- **CORS:** thêm chế độ `hoa-don` vào `scripts/apply-r2-cors.ts`, và **chạy cho prod + test**. Thiếu
  CORS thì bước ký vẫn trả 200 nhưng PUT chết câm, và test giả lập tầng mạng không bắt được.
- **Ký URL:** khoá `hoa-don/<centerCode>/<yyyy>/<orderId>/<uuid>.<pdf|xml>`, ký theo **orderId**
  (không cần hoá đơn tồn tại trước). Gác bằng `checkPermission("payments:confirm")` + scopedDb (đơn
  thuộc cơ sở mình) + tập cơ sở kế toán (§9) + rateLimit.
- **Bước `/xong`:**
  - kiểm khoá mang đúng tiền tố của đơn đã scope;
  - `HEAD` lấy cỡ thật;
  - đọc 8 byte đầu, phải là `%PDF-` hoặc `<?xml`;
  - PDF ≤ 10 MB, XML ≤ 2 MB;
  - tính sha256, và cảnh báo khi cùng tệp đã gắn cho một hoá đơn khác.

  Tệp đã lên mà không ai tạo NHAP thì trở thành tệp mồ côi. Dọn bằng cron hằng tuần theo tiền tố
  (dùng lại khe cron có sẵn, xem §7).
- **Tải về:** scope ⇒ quyền ⇒ **ghi audit TRƯỚC khi cấp URL** (khuôn `lib/calls/nghe-ghi-am.ts`) ⇒ ký GET
  300 giây ⇒ redirect, `Cache-Control: no-store`.
  - Vai không có `payments:confirm` (sale): **chỉ tải được bản `DA_XAC_NHAN`**. NHAP và THAY_THE trả 404.
  - Ca test đối chứng dương: kế toán tải NHAP ⇒ 302.

---

## 7. Email hoá đơn

```
tx ⑤ ─► HoaDonGuiEmail(CHO, toi = hoaDon.emailNhan) + publishEvent("hoa-don.gui",
          {guiId}, dedupeKey: `hoa-don.gui:${guiId}`)
dispatch-events ─► handler, MỘT transaction:
                     giành chỗ updateMany CHO→DANG_GUI  +  enqueueEmail(…, { tx })   (thêm tham số tx)
                     + lưu emailQueueId. Enqueue lỗi ⇒ cả hai rollback ⇒ lượt thử lại vẫn gửi được
email-queue     ─► với dòng loại hoá đơn: ĐỌC LẠI hoá đơn — chỉ gửi khi trangThai = DA_XAC_NHAN
                   (bản THAY_THE thì không gửi); lệch ⇒ FAILED "đã bị thay" (chặn gửi bản cũ mang PII người khác)
                ─► attachments[].path = URL ký GET 300s (bucket từ getter, key phải có tiền tố hoa-don/)
                   ⇒ không tải byte trong hàm; idempotencyKey `hoa-don:${guiId}`
```

- **Payload.** `EmailQueue.payload` là `vars` đưa vào `renderTemplate`. Chỉ đính kèm ngữ cảnh ở
  khoá riêng `payload.__hoaDon = {guiId}`, và **không bao giờ** chở bucket/key. Worker không tin
  payload.
- **Trạng thái hiển thị** đọc từ `EmailQueue` (status, sentAt, error) lúc render, không phụ thuộc
  cột phải có ai cập nhật.
- **Đối soát:** `DANG_GUI` quá N phút mà không có `EmailQueue` thì trả về `CHO`, chạy trong cron
  `email-queue` sẵn có.
- **Route cron** `email-queue` khai `maxDuration = 60` (tiền lệ trong repo).
- **Mẫu email** viết inline trong mã, **không** seed template, nên không có bước chạy tay trên prod.
- **`luuThongTinHoaDonAction` thêm `writeAudit`** (giá trị cũ → mới). Sửa người mua **sau** khi đã
  xuất thì vẫn lưu, nhưng khối trên trang đơn hiện nhãn *"Người mua đã đổi sau khi xuất, cần hoá đơn
  thay thế"*.
- **Không có email:** gửi `StaffNotification` với tiền tố `hoa-don.khong-email:<hoaDonId>`, khai
  catalog (nhóm action_required) **+ dòng trong `KHOA_DANG_CHAY`**. Ảnh chụp đó gõ tay, quên thì
  thông báo rơi về "Hệ thống/P3" mà không ca nào đỏ. Người nhận: `lead.assignedToId` → nếu không có
  thì `order.createdById` → nếu không có thì mọi QLCS của cơ sở → nếu không ai thì ghi AuditLog
  "không có người nhận".
- ⚠️ **Test env không có `RESEND_API_KEY`.** Nghiệm thu trên test bằng dòng `EmailQueue` +
  `HoaDonGuiEmail`. Gửi thật chỉ smoke được trên prod.

---

## 8. Trang đơn — khối "Hoá đơn" cho sale

- **Vị trí:** cột phải, dưới "Người mua trên hoá đơn".
- **Nội dung:** mỗi LẦN THU một dòng:
  - ngày thu (`ngayThu`), số tiền, mã giao dịch hoặc "Tiền mặt";
  - trạng thái hoá đơn, **[Tải PDF] [Tải XML]**;
  - trạng thái email: *Đã gửi tới a…@gmail.com lúc 14:02*, hoặc *Khách không có email — tải về gửi qua Zalo*.
- **Dữ liệu:** thêm vào một lô `Promise.all` sẵn có. `[DST-01]` giữ **11**.
- **View-model dựng ở SERVER.** Người không có `orders:view-pii` thì email bị che (`maskEmail`), bỏ
  MST và địa chỉ, và **không gửi khoá tệp xuống client**. Ca test: RSC payload của vai đó không chứa
  email hay MST thật.
- **Bảng:** 1–6 dòng mỗi đơn ⇒ khai `MIEN_TRU` cho `bang-coverage`, kèm lý do.
- **Zalo:** hệ thống không gửi file qua Zalo được. Sale tải về rồi gửi tay, đúng như mô tả.

---

## 9. Quyền

- **Hỏi quyền bằng `checkPermission(...)`**, giống mọi cổng tiền hiện có. **Không** gọi thẳng `can()`,
  vì gọi thẳng là đi vòng qua grant, qua nhánh v1 ở local/CI, và qua lưới `rbac-scope`.
- **Kiêm nhiệm.** Tầm nhìn theo tiền tố `payments:` là **phép hợp của mọi vai**. Người vừa là
  CENTER_ACCOUNTANT@CS1 vừa là CENTER_SALES_CSM@CS2 sẽ *thấy* khoản của CS2. Vì vậy mọi thao tác GHI
  kiểm thêm `hoaDon.centerId ∈ tập cơ sở của đúng dòng quyền payments:confirm`, tức `centerScope`
  của `PermEntry` có `action === "payments:confirm"`.

| Việc | Quyền | Vai có sẵn |
|---|---|---|
| Vào màn, tải phiếu chờ, tải lên, xác nhận, không xuất, thay, gửi lại | `payments:confirm` + tập cơ sở kế toán | HO_ACCOUNTANT (`seed-roles.ts:153`), CENTER_ACCOUNTANT (`:1157`) |
| Gắn giao dịch chưa khớp | quyền của đường có sẵn (`xu-ly-giao-dich.tsx`) | — |
| Xem khối Hoá đơn / tải bản DA_XAC_NHAN | `orders:view` / `orders:view-pii` | sale, QLCS, kế toán theo cơ sở |

**Không tạo quyền mới** ⇒ không phải seed. GĐ 0 đo số người giữ `payments:confirm` mà còn có vai
`payments:*` ở cơ sở khác.

---

## 10. Thiết kế (impeccable · shape) — mode **Operate**

**Người dùng.** Kế toán, ngồi quầy, dùng desktop, xử lý theo lô, mắt nhảy qua lại với MISA. Mỗi dòng
qua 4 bước: tải phiếu → làm ở MISA → tải lên → xác nhận.

**Luận đề: "Bàn chứng từ".** Mỗi dòng là một **bộ chứng từ của một lần thu**, và bộ đó có tiến trình.
Cấu trúc là **danh sách + ngăn xử lý đứng CẠNH nhau**. Khoảnh khắc chính: xác nhận xong thì ngăn
**chuyển sang dòng kế tiếp** và hàng chờ vơi đi ngay trước mắt.

```
┌ Hoá đơn điện tử ────────────────────────────── [CS1 ▾] [Tháng 9 ▾] ┐
│ Chờ xuất 23 · Lệch số 2 · Đã tải file 4 · Đã xuất 118 · Không xuất 9 │
│ Đơn đã huỷ 1 · Cần điều chỉnh 1                                      │
├───────────────────────────────────────────┬─────────────────────────┤
│ NGÀY   ĐƠN · KHÁCH            SỐ TIỀN  TT  │ LẦN THU · 24/09 14:02   │
│ 24/09  ORD…0001 N.P.Quỳnh Anh 3.000.000 Chờ│ 3.000.000đ · Đợt 1/3    │
│ 24/09  ORD…0007 Trần M. Khang 5.200.000 Chờ│ FT2426… · VCB           │
│ 23/09  ORD…0003 Lê Bảo Châu   2.000.000 Thiếu│ [Có TT hoá đơn]        │
│ …                                          │─────────────────────────│
│                                  1–25/31 › │ ① Phiếu thu      [Tải]  │
│                                            │ ② Hoá đơn  [Chọn tệp]   │
│                                            │    1C26TSR · số · ngày  │
│                                            │ ③ [Xác nhận & gửi tới   │
│                                            │     q…@gmail.com]       │
└───────────────────────────────────────────┴─────────────────────────┘
```

**Những thứ chốt từ phản biện, builder KHÔNG được tự chế:**

- **Desktop (≥ md):** lưới 2 cột cố định, ngăn là `<aside>` thường. **Không dùng `Sheet`**: `Sheet`
  của repo là Dialog modal có lớp phủ mờ, khoá danh sách phía sau, và rộng mặc định 384px.
  **Dưới md:** mới dùng `Sheet` với `className="w-full sm:max-w-none"`, danh sách thành thẻ.
- **Bảng ≤ 5 cột** khi có ngăn (ngày · đơn/khách · số tiền · nguồn · trạng thái). **Một dòng 44px**,
  `whitespace-nowrap` trên `th` và `td` (DESIGN.md §2), bọc `PhanTrangBang cuonNgang`. Dòng bấm để mở
  ngăn theo khuôn `<tr relative cursor-pointer>` + trigger `after:inset-0` (lưới `affordance-coverage`).
- **Khoá định danh `lanThuKey`, bất biến:** id BankTransaction nếu có, ngược lại hash danh sách
  paymentId đã sắp xếp. Chọn dòng = `?chon=<key>` bằng `router.replace`. **Thân ngăn đặt
  `key={lanThuKey}`**, nên mỗi dòng mount lại từ đầu, **reset cả tệp đã chọn và ô số**. Đây là chỗ
  chặn bẫy `router.refresh` không reset form: không có nó thì PDF (có MST, CCCD) của khách A bị gắn
  vào lần thu của khách B rồi gửi email đi.
- **Dòng kế tiếp** do **server tính trên danh sách mới** và trả về trong kết quả action (`keKe`).
  `PhanTrangBang` không có prop điều khiển trang, nên nếu dòng kế nằm ở trang sau thì phải chuyển
  trang theo `keKe`.
- **Nhãn bằng chữ:** pill **"Có TT hoá đơn"** (tone info) thay cho ✉ (ký hiệu phong bì dễ đọc thành
  "đã gửi email"). Nút lấy nhãn theo dữ liệu, từ hàm thuần `nhanNutXacNhan`: *"Xác nhận & gửi tới
  q…@gmail.com"* hoặc *"Xác nhận (khách không có email — báo sale)"*. Nút tắt thì **có câu lý do**:
  THIẾU, NGHI_TRUNG, AC5, cần gắn ghi danh, thiếu thông tin người mua, kho chưa cấu hình.
- **Màu chỉ lấy từ token** (`.admin-scope`). Thang ngữ nghĩa: Chờ = `warning` · Thiếu/Nghi trùng =
  `danger` · Đã xuất = `success` · Không xuất = `muted` · Có TT hoá đơn = `info`. Không gradient,
  bóng tối đa `shadow-sm`, chuyển động chỉ CSS 150–200 ms.
- **Bốn trạng thái + một:** tải (skeleton đúng hình bảng + ngăn) · rỗng (*"Không còn khoản nào chờ
  xuất ở CS1 tháng 9"* + đường sang tab Đã xuất) · lỗi (câu thường + thử lại) · **không có quyền**
  (thiếu `payments:confirm`, hỏi ai) · **kho hoá đơn chưa cấu hình**.
- **Trang đơn:** khối "Hoá đơn" nói cùng ngôn ngữ với khối "Người mua" ngay trên nó.

Tạo hình chi tiết làm ở GĐ 4 bằng `/impeccable craft` trên đúng brief này. Chạy `detect.mjs` một lần
khi xong.

---

## 11. Giai đoạn, cổng, test (luật 5: test ĐỎ trước khi viết action)

Test **thuần** đặt ở `lib/finance/hoa-don/*.test.ts`. Test **chạm DB** đặt ở
`tests/finance/hoa-don-*.test.ts`, chạy bằng `pnpm test:finance-db`.

| GĐ | Việc | Cổng ra |
|---|---|---|
| **0 · Đo prod (chỉ-đọc)** | Xem §12 | Điền bảng số |
| **1 · Schema** | Migration 3 bảng + enum + 2 chỉ mục từng phần + RLS ×3 · khai 3 chỗ scope · setting | Drift (§2.2) · `[US-07-IT-08b]` · **R7 hai shard, tuần tự** |
| **2 · Luật thuần** | `du-dieu-kien.ts` · `lan-thu.ts` · `can-dieu-chinh.ts` · `trang-thai-hoa-don.ts` (khuôn `qr-theo-dot.ts`) · `nhanNutXacNhan` · `kyHieuTheoNam` | Ca §3.2 + **cấy lỗi** (luật 14) · **R7** |
| **3 · Kho tệp** | Getter · CORS · route ký/xong/tải · audit | Bucket thiếu ⇒ 503 · trùng bucket công khai ⇒ ném · sai byte ⇒ từ chối · khác cơ sở ⇒ 404 · sale tải NHAP ⇒ 404 (đối chứng: kế toán ⇒ 302) |
| **4 · Màn kế toán** | Trang + ngăn + tab + sidebar (cờ tên **`hoaDon`**, camelCase, để lưới `[SB-FLAG]` bắt được; nối đủ `layout → admin-shell → sidebar`) | `nav-coverage` · `bang-coverage` · `affordance-coverage` · e2e "sang dòng 2 thì ô số và tệp RỖNG" · smoke 375px · `detect.mjs` |
| **5 · Xác nhận + móc** | `xacNhanKhoanTrongTx` · action tải lên / xác nhận / không xuất / thay / gửi lại · cổng §5 cho 6 đường | `cong-truoc-phep-ghi` (thêm tên hàm lõi vào regex GHI) · `truc-a` · **R7** · ca: kế toán tự ghi khoản rồi gộp vào hoá đơn ⇒ bị từ chối · cờ OFF + hoá đơn đã chốt ⇒ `rejectPayment` vẫn bị chặn |
| **6 · Email** | `enqueueEmail({tx})` · handler · đính kèm URL ký · đối soát | Enqueue ném sau khi giành chỗ ⇒ lượt thử lại gửi đúng 1 lần · xác nhận → thay → chạy queue ⇒ 0 lượt gửi bản cũ · gửi lại ⇒ lượt mới |
| **7 · Trang đơn** | Khối Hoá đơn + view-model che PII | `[DST-01]` = 11 · RSC payload không PII · sale khác cơ sở KHÔNG tải được (**kèm đối chứng dương**) |
| **8 · Nghiệm thu** | Bốn cổng + R7 + `test:unit` với DB giả cổng 59999 + smoke upload THẬT trên test.satarobo.vn | Báo cáo kèm output |

**Cờ: setting DB `billing.hoaDonEnabled`, không dùng env.** Registry đã ghi lý do: cờ env tiền như
`PAYMENT_LEDGER_V2` có trong mã mà không ai thấy, không có audit. `centerOverridable: false` (chỉ
một kế toán, không có ca pilot theo cơ sở). Đọc ở MỘT hàm `laHoaDonBat()` —
`lib/finance/hoa-don/feature.ts`, lưới `[HDF-02]`. ~~Tham số mốc `billing.hoaDonTuNgay`~~ **[BỎ 26/09]**.

| Cờ TẮT thì | |
|---|---|
| Trang `/payments/hoa-don`, các route ký/tải | `notFound()` / 404 JSON |
| Handler email | bỏ qua, event vẫn DONE |
| Khối trên trang đơn | ẩn |
| **Móc §5** | **VẪN CHẠY** |

**Việc người vận hành làm tay:**

- tạo bucket `satarobo-hoa-don` và `-test`;
- khai `R2_INVOICE_BUCKET_NAME` trên Vercel (prod + test);
- chạy `apply-r2-cors.ts hoa-don` cho cả hai;
- bật `billing.hoaDonEnabled`.

---

## 12. Câu còn mở

| # | Câu | Mặc định | Chặn |
|---|---|---|---|
| **0.1** | **Nút Xác nhận: (a) hay (b)?** (§0.1) | ✅ **(b) — CHỦ DỰ ÁN CHỐT 25/09** ("làm như đề xuất") | — |
| 1 | Lần thu THIẾU mà PH không bao giờ trả nốt: cho "xuất theo số đã thu", bắt buộc lý do? | Cho, ghi audit | GĐ 5 |
| 2 | Đơn **kit/thi** (không có ghi danh ⇒ không có RCP). ~~(b) xác nhận không cần RCP~~ và ~~(c) cho `Receipt.enrollmentId` nullable~~ **bị loại**: cả hai sinh khoản CONFIRMED thiếu ghi danh, làm hai hàm gắn ghi danh THROW, vỡ convert lead và lưu kế hoạch | Chỉ còn (a): xuất hoá đơn không có RCP, khoản vẫn chờ kế toán xác nhận ở chỗ khác. Đo ở GĐ 0 | GĐ 5 |
| 3 | **Thiếu thông tin người mua:** (1) mở ô sửa 4 cột ngay trong ngăn, gác `payments:confirm` + audit (đây là đường GHI mới lên `Order`); hay (2) dòng hiện *"Nhờ QLCS/sale bổ sung"* kèm link sang đơn | ✅ **(2), và CHỈ CẢNH BÁO — không chặn Xác nhận** (GĐ 2, 26/09): tờ hoá đơn đã xuất ở MISA rồi, hồ sơ trên hệ thống thiếu không làm tờ đó sai. Không mở đường ghi mới | — |
| 4 | Hoá đơn ghi **số thu thật** hay **số của đợt** (khi có dung sai được tha)? | Số thu thật, tha hiện riêng | GĐ 2 |
| 5 | Tiền thừa (`CreditBalance`) có phải xuất hoá đơn không? Hiện chưa có đường rót | Ngoài phạm vi | — |
| 6 | ~~Ngày cụ thể cho mốc hàng chờ~~ | ✅ **BỎ MỐC — chốt 26/09**: mọi khoản thu thật đã có hoá đơn ở MISA, chỉ thiếu chỗ tải lên | — |
| 7 | Một hoá đơn phủ hai đơn · báo chuông kế toán mỗi ngày (dùng lại cron `payment-reconcile`) · PH tự tải trên cổng | Chưa · có · để sau | — |
| 8 | Khoản đơn khoá học chưa gắn ghi danh | Nút gọi `ganGhiDanhChoKhoanCuaDon`, khớp qua lead/SĐT (có R7). **Không** dùng `ganGhiDanhChoKhoanAction`, vì hàm đó từ chối đúng tập đơn lập từ lead | — |

### Phát hiện kèm — lỗi CÓ SẴN, không do đợt này sinh ra

1. **`confirmPayment` xác nhận được dòng gốc đã bị đảo** (tách/gỡ gắn), và cấp RCP cho tiền đã gỡ.
   **Được vá luôn** trong `xacNhanKhoanTrongTx` (§4), vì `/payments` gọi chung hàm này.
2. **Phép kiểm trùng ở `payos-ingest.ts:1102`** không loại dòng đã bị đảo. Hệ quả: *gỡ gắn → gắn lại
   qua `allocateToOrder`* ghi sai sổ. **Không tự vá.** Ghi thành ticket riêng kèm ca R7, vì nó nằm ở
   đường webhook.

### Số đo GĐ 0 (workflow chỉ-đọc, điền sau)

**Cách chạy (HÔM NAY):** Actions → **"Ngưỡng thanh toán · PROD · ĐỌC"** → *Run workflow* trên
nhánh **`test`**, ô **`bao_cao` = `hoa-don-gd0`**. Vì sao mượn nút: GitHub chỉ nhận lệnh chạy tay
cho workflow đã từng lên `main`, mà `hoa-don-prod-chi-doc.yml` mới nằm trên `test` (HTTP 404,
25/09) — chủ dự án chọn mượn thay vì đẩy thẳng `main`. Khi tệp riêng lên `main` thì chạy nút
riêng và gỡ lựa chọn mượn. Báo cáo ở job summary + artifact `bao-cao-hoa-don-gd0` (3 ngày). Script: `scripts/bao-cao-hoa-don-gd0.ts` — định nghĩa "khoản thu
thật", nguồn giao dịch và số ròng đi qua `lib/finance/hoa-don/nguon-khoan.ts` (dùng chung với màn).
Lưới: `[NK-*]` + `[HDG0-*]`.

**Đo 25/09/2026** — run `36149509909` (nhánh `test`, user `satarobo_readonly`, ghi được: KHÔNG).
Tập nền: 154 dòng `Payment` còn sống · **32 khoản thu thật** (23 đơn, Σ ròng 212.016.000đ) · 59
`BankTransaction` (toàn SEPAY). 122 dòng còn lại bị `laKhoanThuThat` loại — **chưa tách lý do loại**
(báo cáo không in phân bố đó; đừng đoán là "toàn nhập lịch sử").

| Số | Giá trị | Hệ quả cho thiết kế |
|---|---|---|
| Đơn PRODUCT/EXAM có ≥ 1 Payment thật | **0** (32/32 khoản thuộc đơn COURSE) | Q-mở 2 **hoãn** — không có ca thật |
| Payment PENDING thiếu `enrollmentId` | **22/31 khoản CHỜ** (Σ 160.714.000đ) · trong đó đơn từ lead chưa có học viên: **2** | 🔴 **Đa số**, không phải ca biên. Bấm "Xác nhận" (phương án b) KHÔNG được phụ thuộc vào việc xác nhận khoản thành công — xem §12 "Điều chỉnh sau GĐ 0" |
| Người giữ `payments:confirm` | **1 người** (HO_ACCOUNTANT @ HO) · kiêm vai tiền ở đơn vị khác: **0** · khoản CHỜ do chính người đó ghi: **0** | Không có kế toán cơ sở trên prod. Cổng kiêm nhiệm (§9) vẫn làm (dữ liệu mở cơ sở mới là thêm data) nhưng không chặn ai hôm nay |
| Khoản thu thật theo tháng | **2026-08: 14** (89.222.000đ) · **2026-09: 18** (122.794.000đ) · trước 08/2026: 0 | Toàn bộ tiền thật nằm trong 2 tháng ⇒ mốc đề xuất **01/08/2026** |
| Đã xác nhận / tổng khoản thu thật | **1/32** | Kế toán gần như chưa dùng nút ✓ ở `/payments` — hàng chờ mới sẽ mở ra với gần như toàn bộ 32 khoản |
| Đơn có CẢ lời khai LẪN ngân hàng (nghi trùng) | **2 đơn**: `ORD-260910-000002` (lời khai 8.976.000đ + CK 8.976.000đ — **cùng số**) · `ORD-260910-000007` (lời khai 2.000.000đ + 2 CK Σ 11.424.000đ) | 🔴 `…000002` nhiều khả năng là **CÙNG một khoản tiền ghi hai lần** trên trục B (đã ghi nhận). Cần người xem đơn — ngoài phạm vi màn hoá đơn |
| `BankTransaction` provider `BACKFILL` | **0** | Bỏ nhánh ánh xạ ngược BACKFILL ở `lan-thu.ts` (giữ lưới loại provider này khỏi danh sách gắn) |
| Khoản thu thật trên đơn `centerId` NULL | **0** | `centerId` NOT NULL không kẹt ai |
| `CreditBalance` chưa rót | **0 dòng · 0đ** | Q-mở 5 đóng — không có tiền thừa |
| Dòng gốc bị đảo trọn (phát hiện kèm) | **0** | Lỗ `confirmPayment` có thật trong mã nhưng chưa sinh dữ liệu sai; vá ở GĐ 5 như kế hoạch |

### Điều chỉnh sau GĐ 0

1. **Nút "Xác nhận" (phương án b) tách hẳn khỏi việc xác nhận khoản.** 22/31 khoản chờ thiếu ghi
   danh ⇒ `xacNhanKhoanTrongTx` sẽ từ chối đa số. Luật: chốt hoá đơn LUÔN làm được khi đủ file +
   lần thu DU; trong cùng transaction, khoản nào ĐỦ điều kiện (có ghi danh, qua AC5, `rong > 0`) thì
   xác nhận + cấp RCP, khoản nào không thì GIỮ PENDING và dòng hiện *"Khoản chưa xác nhận — cần gắn
   ghi danh"* kèm nút gọi `ganGhiDanhChoKhoanCuaDon`. Không một khoản thiếu ghi danh nào được chặn
   việc trả hoá đơn cho khách (đúng câu chốt của chủ dự án).
2. ~~Mốc `billing.hoaDonTuNgay`~~ **BỎ (26/09)** — danh sách = mọi khoản thu thật CHƯA có hoá đơn trên
   hệ thống. Kế toán tải tệp đã xuất ở MISA lên. Ô **"Gửi email hoá đơn cho khách"** (mặc định bật,
   cột `guiEmailKhach`) để bỏ tick với hoá đơn cũ MISA đã gửi khách rồi.
3. **Q-mở 2 và Q-mở 5 hoãn** (0 ca thật). Lưới vẫn giữ: đơn kit/thi vào hàng chờ phải hiện đúng, không sập.
