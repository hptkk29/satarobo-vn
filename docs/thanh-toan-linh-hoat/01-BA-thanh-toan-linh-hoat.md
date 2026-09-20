# BA — Thu học phí linh hoạt cho phụ huynh nhiều con (v1.0)

Hệ thống: satarobo-vn · Module: Thanh toán / Công nợ học phí
Người đọc: Dev (Claude Code), Kế toán, QLCS, Sale
Tài liệu nối tiếp: `02-PRD` → `03-PreMortem` → `04-UserStories` → `05-TestScenarios` → `documentation/`

---

## 1. Mục tiêu

Sale tự xử lý **mọi** tình huống đóng tiền của một phụ huynh có 1..n con — đóng full, chia đợt tuỳ ý, cọc, bỏ bớt con, thêm con, đổi khoá, bảo lưu, chuyển tiền giữa các con — mà **không cần dev sửa dữ liệu**, và số tiền của **từng con luôn đúng tới từng đồng** theo đúng khoá của con đó.

Thước đo "xong": 30 ngày sau go-live, 0 lần dev phải chạy SQL tay trên dữ liệu tiền; kiểm cân hằng đêm lệch 0đ.

## 2. Hiện trạng cần biết (as-is)

| Điểm | Hiện trạng | Hệ quả với module này |
|---|---|---|
| Sổ tiền | 3 sổ song song: `Payment` (sổ A, nguồn mọi số hiển thị), `OrderInstallment` (sổ B, tối đa 2 đợt), `PaymentRequest`/`PaymentAllocation` (sổ C) | Chọn **một** sổ công nợ duy nhất; sổ B phải ngừng ghi |
| Chốt 13/09 | Xây trên ghi kép, không lật cutover. `PaymentRequest` đã là sổ n-đợt (`installmentNo`, unique `[orderId, installmentNo]`). `PAYMENT_LEDGER_V2` là cờ chết | Đợt thu xây trên `PaymentRequest`, nhưng **đổi hạt từ đơn sang ghi danh** |
| Hạt tiền | `Payment.enrollmentId` là FK đúng hạt; `confirmPayment` từ chối khoản chưa gắn ghi danh; chuyển khoản gộp đang tách bằng `allocateByWeight` | Giữ hạt ghi danh; **bỏ chia theo tỉ trọng** cho luồng mới |
| Điều chỉnh | `adjustPayment` ghi DELTA, dòng gốc bất biến, `SELECT … FOR UPDATE`; `PaymentType = PAYMENT \| ADJUSTMENT`; `lib/finance/debt.ts` là nhà duy nhất của `sumConfirmed` | Mở rộng cùng khuôn: thêm loại dòng, không đổi triết lý |
| Trạng thái kế toán | `accountantStatus = PENDING \| CONFIRMED \| REJECTED \| REFUNDED`; hai trục cộng: A = `sumConfirmed` (kế toán), B = `sumRecorded` (QR/webhook/ZNS) | "Đã thu" để chuyển/hoàn chỉ dùng trục A |
| Duyệt | Đã BỎ màn `/admin/orders`; đơn không còn trạng thái chờ duyệt, thay bằng log. Cột `installmentApprovalStatus` / `discountApprovalStatus` còn trong schema | Kiểm soát bằng **giới hạn cấu hình + quyền**, không bằng hàng chờ duyệt |
| Cổng tiền | SePay; quyết định 03/08: VA/phiếu riêng theo đợt, khớp theo VA không theo số tiền, sổ phân bổ waterfall, webhook không từ chối vì lệch số | Mở rộng thành **kỳ thu gom nhiều con**, 1 VA/kỳ thu |
| Nội dung CK | `TenCon_SdtPH_MaKhoa`, trần 25 ký tự, SĐT là khoá đối khớp cuối | Không chứa được nhiều con → nội dung mới theo mã kỳ thu |
| Giám sát | `/admin/bien-dong-so-du` (3 trạng thái), `shadow-compare-cong-no.yml` chỉ-đọc | Tái dùng làm cửa "Cần xử lý" và kiểm cân |
| Luật repo | Bảng mới bắt buộc `orgUnitId`; CẤM `prisma migrate dev` (drift 14 bảng); migration SQL tay + RLS; DB dev đang phân kỳ với main | Mọi migration của module theo luật này |
| Dữ liệu prod | 07/09: `Payment` prod chỉ 1 dòng (hệ thanh toán chưa dùng thật) | Chuyển đổi dữ liệu cũ gần như không rủi ro — **đo lại** trước khi làm |

### GATE 0 — phải đo trên repo trước khi thi công (chỉ đọc)

| # | Câu hỏi đo | Vì sao cần |
|---|---|---|
| G0-1 | `PaymentRequest` có cột `enrollmentId` chưa? có mang VA/QR/mã chuyển khoản không? | Quyết định tách "đợt công nợ" và "phiếu QR" thành 2 bảng hay đổi tên |
| G0-2 | Thực thể phụ huynh tên gì (Customer/Parent/Guardian)? Ghi danh trỏ tới phụ huynh qua đường nào? Lead nhiều con đi qua `LeadChild` như thế nào sang `Enrollment`? | Khoá "gia đình" để gom kỳ thu và ví |
| G0-3 | Bảng log giao dịch SePay tên gì, có unique theo mã giao dịch ngân hàng không? | Chống ghi trùng khi webhook bắn lại |
| G0-4 | Có nguồn "buổi đã diễn ra" tin được không (`ClassSession` + trạng thái buổi, `Attendance`)? Đã vá bug lệch buổi học chưa? | Công thức giá trị đã dùng |
| G0-5 | Cây `orgUnit` có cờ "đơn vị kế toán / pháp nhân" chưa? CS1, CS2 có phải 2 pháp nhân? | Ví và chuyển tiền chỉ trong một đơn vị kế toán |
| G0-6 | Số dòng prod hiện có ở `Payment`, `OrderInstallment`, `PaymentRequest` | Kế hoạch chuyển đổi dữ liệu |
| G0-7 | Danh sách mọi chỗ đọc `OrderInstallment` và `allocateByWeight` | Phạm vi cắt sổ B |
| G0-8 | Catalog quyền `payments:*`, `enrollments:*` hiện có trong RBAC v2 | Tránh đặt trùng tên quyền |

## 3. Thuật ngữ

| Thuật ngữ | Nghĩa trong tài liệu này |
|---|---|
| Gia đình | Một phụ huynh (người chịu trách nhiệm đóng tiền) và các con của họ. Ông bà/bố/mẹ chuyển tiền hộ chỉ là **người nộp**, không phải gia đình khác |
| Ghi danh | 1 con × 1 khoá × 1 cơ sở. Đơn vị nhỏ nhất mang giá, ưu đãi, công nợ |
| Bảng giá buổi | Giá của từng đoạn buổi trong ghi danh (vd buổi 1–24 giá 180.000/buổi). Là căn cứ tính **giá trị đã dùng** |
| Đợt thu | Một khoản phải thu của **một** ghi danh, có hạn. Loại: CỌC, ĐỢT, QUYẾT TOÁN |
| Kỳ thu | Phiếu gom nhiều dòng đợt thu (của 1 hoặc nhiều con) để phát 1 QR/VA. Không mang công nợ |
| Ví gia đình | Tiền đã nhận nhưng chưa thuộc ghi danh nào: cọc chưa chia, tiền thừa, tiền dư chuyển về. Không phải doanh thu |
| Nghiệp vụ tiền | Một lần bấm xác nhận của người dùng; sinh 1..n dòng bút toán cùng `nghiepVuId` |
| Quyết toán | Tính lại phải thu của ghi danh khi dừng/đổi khoá, dựa trên giá trị đã dùng |
| Giới hạn (guardrail) | Điều kiện cấu hình mà thao tác của sale phải nằm trong; ngoài giới hạn thì nút khoá với sale |

## 4. Luật nghiệp vụ

### 4.1 Năm luật gốc

- **L1 — Tiền thuộc về ghi danh.** Mọi đồng đã nhận phải nằm ở đúng một trong ba chỗ: một ghi danh, ví gia đình, hoặc đã hoàn ra ngoài.
- **L2 — Không chia theo tỉ trọng.** Tiền về khớp kỳ thu thì chia đích danh theo dòng; không khớp thì vào ví. Sale chia ví bằng tay có xem trước.
- **L3 — Không sửa, không xoá dòng tiền.** Chỉ huỷ (đợt, kỳ thu) và ghi bù (dòng âm/dương cùng `nghiepVuId`).
- **L4 — Sale không gõ công nợ.** Sale chọn ý định (dừng, chuyển, bảo lưu…), hệ thống tính và hiện "trước → sau" từng con, sale xác nhận.
- **L5 — Chính sách có phiên bản, chụp vào ghi danh lúc chốt.** Đổi chính sách không làm đổi số của ghi danh cũ, trừ khi admin chủ động "áp chính sách mới cho ghi danh X" (có log).

### 4.2 Bất biến (hệ thống phải giữ ở mọi thời điểm, kiểm trong transaction ghi)

| Mã | Bất biến |
|---|---|
| B1 | Với mỗi ghi danh: `0 ≤ Đã thu ≤ Phải thu`. Tiền vượt phải thu **bắt buộc** đi sang ví hoặc ghi danh khác trong cùng nghiệp vụ |
| B2 | Với mỗi giao dịch tiền về: Σ dòng PAYMENT sinh từ nó + Σ dòng vào ví sinh từ nó = số tiền giao dịch |
| B3 | Với mỗi nghiệp vụ chuyển nội bộ: Σ (ghi danh ±) + Σ (ví ±) = 0 |
| B4 | Số dư ví gia đình (theo từng đơn vị kế toán) ≥ 0 |
| B5 | Với mỗi gia đình × đơn vị kế toán: Σ tiền vào đã gán = Σ Đã thu các ghi danh + Số dư ví + Σ đã hoàn |
| B6 | Với ghi danh ACTIVE/PAUSED: Σ đợt thu không huỷ = Giá trị bảng giá buổi (toàn khoá). Với STOPPED: Σ đợt thu không huỷ = Giá trị quyết toán |
| B7 | Mỗi đợt thu nằm trong tối đa **một** kỳ thu đang mở |
| B8 | Chuyển tiền và ví chỉ trong cùng một gia đình **và** cùng một đơn vị kế toán |
| B9 | Chỉ phần tiền trục A (CONFIRMED) mới được chuyển, hoàn, hoặc dùng để cấn trừ |

### 4.3 Luật khớp tiền về

1. Khớp theo **VA của kỳ thu** → nếu không có, theo **mã kỳ thu** trong nội dung → nếu không có, theo **SĐT** (chỉ để tìm gia đình).
2. Khớp kỳ thu đang mở: lấp các dòng theo **thứ tự dòng** của kỳ thu (mặc định: QUYẾT TOÁN trước, rồi hạn sớm nhất, rồi thứ tự con do sale xếp). Trả thiếu → dòng sau cùng thiếu. Trả thừa → phần thừa vào ví.
3. Khớp kỳ thu đã huỷ/đã đóng → toàn bộ vào ví + dòng "Cần xử lý".
4. Chỉ khớp được SĐT của đúng một gia đình trong đúng một đơn vị kế toán → vào ví + "Cần xử lý: chia ví".
5. Không khớp gì hoặc SĐT trùng nhiều gia đình → "Cần xử lý: chưa gán", tiền chưa vào đâu (vẫn nằm ở log giao dịch, tính vào cảnh báo tồn).
6. Webhook **không bao giờ từ chối** vì lệch số (giữ quyết định 03/08).

Nội dung chuyển khoản mới: `<mã kỳ thu 8 ký tự> <SĐT 10 số>` (19 ký tự, dưới trần 25). Ví dụ `KT7F3K9A 0905123456`.

### 4.4 Luật giá và ưu đãi

- Học phí thực của ghi danh = Σ giá bảng giá buổi. Khi chốt đơn: bảng giá có 1 đoạn `[1..N] × (Niêm yết − ưu đãi)/N`.
- Làm tròn: đơn giá làm tròn xuống tới 1.000đ; phần lẻ dồn vào **buổi cuối** của đoạn (lưu thành đoạn 1 buổi riêng nếu cần). Không bao giờ để Σ lệch học phí thực.
- Ưu đãi là dòng riêng trên ghi danh, có thể có **điều kiện liên đới** ("có ít nhất 1 anh/chị em khác ACTIVE hoặc PAUSED trong cùng gia đình").
- Ưu đãi anh em áp cho **con có học phí niêm yết thấp hơn** (mặc định, cấu hình được). Không cộng dồn với ưu đãi đóng full (mặc định).
- Khi điều kiện liên đới mất hiệu lực: k = buổi đầu tiên **của con được ưu đãi** diễn ra sau ngày buổi cuối của con bị dừng. Bảng giá tách đoạn tại k, đoạn sau tính giá không ưu đãi. Không truy thu đoạn trước (mặc định `BO_TU_DOAN_CHUA_HOC`).
- Điều chỉnh phải thu sau khi bảng giá đổi: đợt **chưa có tiền** → huỷ và tạo đợt mới đúng số; đợt **đã có tiền** → giữ, thêm dòng QUYẾT TOÁN ±chênh.

### 4.5 Luật đợt thu

- Số đợt không hard-code; trần cấu hình (mặc định 6, không tính cọc).
- Mẫu kế hoạch: FULL · THEO_BUOI (chia đều theo số buổi) · THEO_THANG · COC_ROI_THEO_BUOI · TUY_CHINH.
- Sale sửa số tiền/hạn các đợt **chưa có tiền**; đợt cuối tự cân để giữ B6.
- Giới hạn mặc định: đợt đầu (gồm cọc) ≥ 25% học phí thực; cọc ≥ 500.000; hạn của đợt phải ≤ ngày của buổi đầu tiên mà đợt đó phủ + 7 ngày ân hạn.
- **Trạng thái đợt là suy ra**, không lưu tay: chạy waterfall Đã thu của ghi danh qua các đợt không huỷ theo thứ tự (hạn, stt) → CHƯA_THU / THU_MOT_PHAN / DA_THU; cộng hạn → QUA_HAN.

### 4.6 Luật dừng học và quyết toán

- Buổi đã dùng = số buổi của lớp **đã diễn ra** tính tới buổi cuối sale chọn, kể cả buổi vắng không phép; trừ buổi vắng có phép chưa được xếp bù (mặc định, cấu hình được). Hệ thống gợi ý, **sale xác nhận con số** (không tự động tuyệt đối — vì dữ liệu buổi học từng lệch).
- Giá trị đã dùng = Σ đơn giá bảng giá cho các buổi đã dùng.
- Giá trị quyết toán = Giá trị đã dùng + Phí dừng (cấu hình) + Phần không hoàn (nếu chọn và chính sách cho phép) − Miễn giảm (quyền QLCS).
- Hệ thống: huỷ mọi đợt có trạng thái suy ra CHƯA_THU (đợt THU_MOT_PHAN và DA_THU giữ nguyên); thêm 1 dòng QUYẾT TOÁN = Giá trị quyết toán − Σ đợt còn lại → giữ B6.
- Chênh = Đã thu − Giá trị quyết toán:
  - Chênh > 0 → sale **bắt buộc** chọn nơi đi của khoản dư trước khi xác nhận (giữ B1): chuyển sang ghi danh khác của gia đình, vào ví, hoặc chuyển sang kế toán hoàn.
  - Chênh < 0 → còn nợ; dòng QUYẾT TOÁN hiện trong kỳ thu kế tiếp của gia đình.
  - Chênh = 0 → ghi danh STOPPED, đóng.
- Trung tâm huỷ lớp (lý do `TRUNG_TAM_HUY`): phí dừng = 0, không cho chọn "không hoàn".
- Kỳ thu đang mở chứa dòng của con bị dừng: nếu kỳ thu chưa nhận đồng nào → huỷ và phát hành lại cho các dòng còn lại; nếu đã nhận một phần → đóng kỳ thu (CLOSED_PARTIAL), phần còn lại của các con khác đưa vào kỳ thu mới.

### 4.7 Luật bảo lưu và học lại

- Bảo lưu: ghi danh PAUSED, tiền đứng yên, đợt thu chưa tới hạn **dời hạn** theo số ngày bảo lưu; không tính quá hạn trong thời gian bảo lưu.
- Thời hạn bảo lưu tối đa (mặc định 90 ngày). Hết hạn → nhắc sale; không tự dừng.
- Học lại: ACTIVE, xếp lớp mới; bảng giá giữ nguyên các buổi còn lại (không áp giá mới) trừ khi đổi khoá.
- Con đang PAUSED vẫn giữ điều kiện ưu đãi anh em cho con khác.

### 4.8 Luật đổi khoá / đổi cơ sở

- Đổi khoá = Dừng ghi danh cũ (quyết toán theo buổi đã dùng, phí dừng = 0) + Tạo ghi danh mới + Chuyển khoản dư sang ghi danh mới, **trong một nghiệp vụ**.
- Chuyển buổi giữa hai con / hai khoá luôn **bằng tiền**, không bằng số buổi.
- Đổi sang cơ sở thuộc **đơn vị kế toán khác**: không chuyển nội bộ; sinh yêu cầu hoàn cho kế toán nguồn + ghi chú thu mới cho đơn vị đích (B8).

### 4.9 Luật hoàn tiền, miễn giảm, trễ hạn

- Hoàn tiền ra ngoài: chỉ kế toán; nguồn là ví hoặc khoản dư quyết toán; bắt buộc thông tin người nhận + chứng từ; dòng REFUND âm.
- Miễn giảm nợ / miễn phí trễ: QLCS; dòng QUYẾT TOÁN âm có lý do.
- Quá hạn: suy ra hằng ngày; phí trễ mặc định 0; không tự khoá điểm danh (cấu hình được).

## 5. Mô hình dữ liệu (thiết kế đích)

> Tên bảng là tên thiết kế; ánh xạ tên thật sau GATE 0. Mọi bảng mới có `orgUnitId` (luật #4), bật RLS, migration SQL tay.

```
Gia đình (thực thể phụ huynh hiện có)
 ├─ GuardianWalletEntry*        ví, theo đơn vị kế toán
 ├─ Enrollment (có sẵn)         1 con × 1 khoá × 1 cơ sở
 │   ├─ EnrollmentPriceSegment* bảng giá buổi
 │   ├─ EnrollmentDiscount*     ưu đãi, điều kiện liên đới
 │   ├─ PaymentRequest (có sẵn, đổi hạt) đợt thu
 │   ├─ Payment (có sẵn, mở rộng loại)   dòng tiền
 │   └─ EnrollmentEvent*        dừng/bảo lưu/học lại/đổi khoá
 ├─ PaymentBill* + PaymentBillLine*   kỳ thu
 └─ MoneyOperation*             nghiệp vụ tiền (header của mọi bút toán)
BillingPolicyVersion*           chính sách có phiên bản
```
`*` = bảng mới.

### 5.1 Thay đổi trên bảng có sẵn

| Bảng | Thay đổi | Ghi chú |
|---|---|---|
| `Enrollment` | + `guardianId` (nếu chưa có đường), `policyVersionId`, `listPrice`, `netTuition`, `totalSessions`, `status` (ACTIVE/PAUSED/STOPPED), `accountingUnitId` | Snapshot lúc chốt |
| `PaymentRequest` | + `enrollmentId` NOT NULL; unique đổi thành `[enrollmentId, installmentNo]`; + `kind` (DEPOSIT/INSTALLMENT/SETTLEMENT), `sessionFrom`, `sessionTo`, `cancelledAt`, `cancelReason`, `settlementReason`, `operationId`; `amount` được âm khi `kind = SETTLEMENT` | Không lưu trạng thái đã thu (suy ra) |
| `Payment` | `PaymentType` + `TRANSFER`, `REFUND`; + `operationId`, `billId?`, `bankTxnId?`, `payerName?`, `method` (BANK/CASH/OTHER) | `amount` âm cho TRANSFER ra và REFUND |
| `OrderInstallment` | Ngừng ghi (chỉ đọc) sau chuyển đổi | Sổ B giải thể |

### 5.2 Bảng mới

**MoneyOperation** — header của mọi nghiệp vụ tiền
`id, orgUnitId, guardianId, type (RECEIPT_ALLOCATE, WALLET_SPLIT, TRANSFER, STOP_SETTLE, PAUSE, RESUME, CHANGE_COURSE, ADD_CHILD, PLAN_EDIT, BILL_ISSUE, BILL_CANCEL, REFUND, WAIVE), actorId, reason, previewSnapshot (JSON trước→sau), idempotencyKey unique, createdAt`

**GuardianWalletEntry** — ví
`id, orgUnitId, guardianId, accountingUnitId, amount (±), kind (DEPOSIT_UNSPLIT, OVERPAY, TRANSFER_IN, TRANSFER_OUT, REFUND, UNMATCHED_TO_WALLET), operationId, bankTxnId?, note, createdAt`

**EnrollmentPriceSegment** — bảng giá buổi
`id, orgUnitId, enrollmentId, sessionFrom, sessionTo, unitPrice, reason (INITIAL, DISCOUNT_LOST, COURSE_CHANGE), operationId, supersededAt?`

**EnrollmentDiscount**
`id, orgUnitId, enrollmentId, type (SIBLING, FULL_PAY, VOUCHER, MANUAL), amount | percent, conditionType (NONE, SIBLING_ACTIVE), effectiveFromSession, endedAtSession?, operationId`

**PaymentBill** — kỳ thu
`id, orgUnitId, guardianId, accountingUnitId, code (8 ký tự, unique), virtualAccount?, totalAmount, status (OPEN, PAID, CLOSED_PARTIAL, CANCELLED), issuedBy, operationId, cancelledAt?`

**PaymentBillLine**
`id, billId, paymentRequestId, amount, sortOrder, filledAmount (suy ra khi đọc, có thể cache)`

**EnrollmentEvent**
`id, orgUnitId, enrollmentId, type (STOP, PAUSE, RESUME, CHANGE_COURSE, CANCEL_BY_CENTER), lastSession?, usedSessions?, usedValue?, fee?, forfeit?, waiver?, settlementValue?, surplus?, surplusDestination (TO_ENROLLMENT, TO_WALLET, TO_REFUND, NONE), targetEnrollmentId?, pauseUntil?, operationId`

**BillingPolicyVersion**
`id, orgUnitId, version, params (JSON theo mục 10), effectiveFrom, createdBy, reason`

### 5.3 Vòng đời

**Ghi danh:** `ACTIVE ⇄ PAUSED → STOPPED` (STOPPED là cuối; "học lại sau dừng" = ghi danh mới).

**Kỳ thu:** `OPEN → PAID` (đủ) · `OPEN → CLOSED_PARTIAL` (bị đóng khi đã nhận một phần) · `OPEN → CANCELLED` (chưa nhận đồng nào). Không có trạng thái hết hạn — VA bất biến.

**Đợt thu:** chỉ có `cancelledAt` được lưu; mọi trạng thái khác suy ra (mục 4.5).

## 6. Công thức (tính trong `lib/finance/debt.ts`, không chỗ nào khác cộng)

| Đại lượng | Công thức |
|---|---|
| Học phí thực | Σ (sessionTo − sessionFrom + 1) × unitPrice của các đoạn hiệu lực |
| Phải thu | Σ `PaymentRequest.amount` với `cancelledAt IS NULL` |
| Đã thu (A) | Σ `Payment.amount` CONFIRMED, `deletedAt IS NULL`, mọi `paymentType` |
| Đang chờ xác nhận (B−A) | Σ RECORDED chưa CONFIRMED và không REJECTED |
| Còn nợ | Phải thu − Đã thu |
| Số QR phải thu ngay | Σ dòng kỳ thu − (Đã thu A + Đang chờ xác nhận) phân bổ theo thứ tự dòng |
| Giá trị đã dùng(k) | Σ unitPrice của buổi 1..k (theo đoạn) |
| Số dư ví | Σ `GuardianWalletEntry.amount` theo gia đình × đơn vị kế toán |

## 7. Nghiệp vụ theo thao tác (Use case)

Mọi UC đi qua khuôn chung: **Chọn ý định → hệ thống tính → Màn xem trước (bảng từng con: Phải thu / Đã thu / Còn nợ trước → sau, ví trước → sau, kỳ thu bị ảnh hưởng) → Xác nhận → 1 MoneyOperation + các dòng → thông báo.**

| UC | Tên | Actor | Kết quả chính |
|---|---|---|---|
| UC-01 | Tạo đơn nhiều con | Sale | 1..n ghi danh, bảng giá, ưu đãi, kế hoạch đợt; cấn trừ ví cọc nếu có |
| UC-02 | Sửa kế hoạch đợt | Sale | Huỷ/tạo đợt chưa có tiền; đợt cuối tự cân |
| UC-03 | Phát hành kỳ thu | Sale | Kỳ thu + VA + QR; tick con, tick đợt, số tiền từng dòng ≤ còn nợ dòng |
| UC-04 | Tiền về tự phân bổ | Hệ thống (webhook) | Dòng PAYMENT theo dòng kỳ thu; thừa/không khớp vào ví hoặc "Cần xử lý" |
| UC-05 | Ghi nhận tiền mặt / đa phương thức | Sale ghi, Kế toán xác nhận | Giống UC-04 nhưng nguồn là phiếu tiền mặt |
| UC-06 | Gán giao dịch chưa khớp + chia ví | Sale | Ví → các ghi danh (≤ còn nợ từng con) |
| UC-07 | Chuyển tiền giữa các con | Sale | TRANSFER −/+ (chỉ phần CONFIRMED) |
| UC-08 | Dừng học + quyết toán | Sale | STOPPED, huỷ đợt, dòng QUYẾT TOÁN, xử lý dư/thiếu, tính lại ưu đãi liên đới của anh/chị em |
| UC-09 | Bảo lưu / Học lại | Sale | PAUSED/ACTIVE, dời hạn đợt |
| UC-10 | Thêm con vào gia đình đang học | Sale | Như UC-01 + tính lại ưu đãi anh em cho các đợt chưa có tiền |
| UC-11 | Đổi khoá / đổi cơ sở | Sale (cùng đơn vị kế toán), Kế toán (khác) | Dừng + tạo mới + chuyển dư trong 1 nghiệp vụ |
| UC-12 | Hoàn tiền | Kế toán | REFUND từ ví/khoản dư |
| UC-13 | Miễn giảm nợ / phí trễ | QLCS | QUYẾT TOÁN âm có lý do |
| UC-14 | Cấu hình chính sách | Admin | Phiên bản chính sách mới |
| UC-15 | Kiểm cân hằng đêm | Cron | Báo lệch B5 |

### UC-08 chi tiết (ca trọng tâm)

**Tiền điều kiện:** ghi danh ACTIVE/PAUSED; người thao tác có quyền trên **mọi** ghi danh bị chạm (ghi danh dừng + ghi danh nhận dư + ghi danh bị tính lại ưu đãi).

**Luồng chính**
1. Sale chọn con → "Dừng học". Chọn lý do (PH_CHU_DONG / TRUNG_TAM_HUY / KHAC) và buổi cuối.
2. Hệ thống gợi ý "buổi đã dùng" từ dữ liệu lớp; sale xác nhận hoặc sửa (sửa bắt buộc ghi chú).
3. Hệ thống tính: giá trị đã dùng, phí dừng, đã thu, chênh.
4. Hệ thống quét ưu đãi liên đới của anh/chị em: con nào mất ưu đãi từ buổi nào, đợt nào tăng bao nhiêu.
5. Nếu chênh > 0: sale chọn nơi đi — anh/chị em (chọn con, mặc định con còn nợ nhiều nhất), ví, hoặc hoàn (chuyển kế toán). Được chia khoản dư cho nhiều nơi, Σ phải đúng bằng chênh.
6. Nếu chính sách cho phép "không hoàn": hiện lựa chọn, bắt buộc lý do.
7. Màn xem trước. Xác nhận.
8. Hệ thống ghi trong 1 transaction có khoá gia đình: EnrollmentEvent, huỷ đợt, QUYẾT TOÁN, TRANSFER/ví, tách bảng giá + huỷ-tạo đợt cho anh/chị em, xử lý kỳ thu đang mở, MoneyOperation.
9. Thông báo nội bộ cho kế toán nếu có hoàn; ZNS cho PH theo mẫu có sẵn (ngoài phạm vi V1 nếu chưa có mẫu).

**Luồng phụ**
- 2a. Buổi đã dùng > số buổi đã đóng tiền → chênh < 0, dòng QUYẾT TOÁN dương, hiện cảnh báo "học lố".
- 5a. Tiền của con dừng còn phần chưa CONFIRMED → chỉ phần CONFIRMED được chọn nơi đi; phần chờ xác nhận khi được xác nhận sẽ tự vào ví + "Cần xử lý".
- 8a. Hai người thao tác cùng gia đình cùng lúc → người sau nhận lỗi "Dữ liệu gia đình vừa thay đổi, mở lại xem trước" (so `previewSnapshot` hash).

## 8. Ma trận 45 trường hợp → thao tác

| # | Tình huống (tóm tắt) | UC |
|---|---|---|
| 1–4 | Full cho các con, khoá khác, ngày bắt đầu lệch, hình thức khác nhau | UC-01 |
| 5 | Mỗi đợt đóng gộp cho các con | UC-01 + UC-03 |
| 6, 7 | Lịch đợt riêng từng con, số tiền không đều | UC-01, UC-02 |
| 8 | Một đợt tách nhiều lần đóng | UC-03 (kỳ thu chỉ tick 1 phần) |
| 9 | Đóng thiếu | UC-04 (waterfall theo dòng) |
| 10 | Trễ hạn | Suy ra QUA_HAN; UC-13 nếu miễn phí trễ |
| 11 | Tất toán sớm | UC-02 (gộp đợt) + ưu đãi FULL_PAY nếu chính sách cho |
| 12 | Chuyển khoản không chỉ rõ con | UC-04 → ví → UC-06 |
| 13 | Cọc giữ chỗ | UC-01 mẫu COC_ROI_THEO_BUOI |
| 14 | Cọc chung cả nhà | UC-04/05 → ví (DEPOSIT_UNSPLIT) → UC-01 cấn trừ |
| 15 | Cọc 3 con, chỉ 2 học | UC-08 cho con thứ 3 (buổi đã dùng = 0) |
| 16 | Chuyển cọc sang con khác | UC-07 hoặc UC-08 |
| 17 | Cọc rồi không con nào học | UC-08 cho từng con → ví → UC-12 nếu hoàn |
| 18 | Cọc 1 con, chốt thêm 2 con | UC-10 |
| 19 | Full, nghỉ giữa khoá | UC-08 |
| 20 | Đợt 2 chỉ đóng cho một phần các con (3 biến thể) | UC-08 (dư / 0 / học lố) |
| 21 | Mất ưu đãi anh em | UC-08 bước 4 (tự động) |
| 22 | Nghỉ rồi học lại | STOPPED → ghi danh mới (UC-10); PAUSED → UC-09 |
| 23 | Bảo lưu một con | UC-09 |
| 24 | Cả nhà nghỉ | UC-08 lần lượt; dư vào ví → UC-12 |
| 25 | Thêm con từ đợt 2 | UC-10 (không tính lùi ưu đãi) |
| 26 | Gộp lịch đợt con mới với anh chị | UC-03 (kỳ thu gom, lịch đợt vẫn riêng) |
| 27 | Con cũ full, con mới trả góp | UC-10 |
| 28 | Dùng buổi còn lại của con này cho con khác | UC-08 → chuyển dư bằng tiền |
| 29 | Tiền dư con này trừ vào con khác | UC-07 / UC-08 |
| 30 | Lên cấp khoá đắt hơn | UC-11 |
| 31 | Đổi cơ sở | UC-11 (B8) |
| 32 | Đổi lớp ít buổi | UC-11 |
| 33–36 | Ưu đãi: thứ tự, cộng dồn, voucher, hết khuyến mãi | UC-14 cấu hình + snapshot L5 |
| 37, 38 | Bố/mẹ/ông bà nộp | `Payment.payerName`, không đổi phân bổ |
| 39 | Tiền mặt + chuyển khoản | UC-05 + UC-04 cùng kỳ thu |
| 40 | Ghi nhầm tên con | Không ảnh hưởng (khớp VA/mã kỳ thu); nếu đã phân bổ sai → UC-07 |
| 41 | Hoá đơn tách theo con | Xuất theo ghi danh (ngoài phạm vi V1, dữ liệu sẵn) |
| 42 | Đóng rồi chưa học, rút hết | UC-08 (0 buổi) → UC-12 |
| 43 | Trung tâm huỷ lớp | UC-08 lý do TRUNG_TAM_HUY |
| 44 | Chuyển thừa | UC-04 → ví → UC-06 hoặc UC-12 |
| 45 | Đóng trùng | UC-04 → ví → UC-12 |

## 9. Ví dụ số — gia đình mẫu `GD-MAU` (dùng cho test)

**Chốt đơn**

| | An | Bình |
|---|---|---|
| Khoá | Sata3 · 48 buổi | Sata5 · 48 buổi |
| Niêm yết | 9.600.000 | 12.000.000 |
| Ưu đãi anh em 10% (con học phí thấp hơn) | −960.000 (điều kiện SIBLING_ACTIVE) | — |
| Học phí thực | 8.640.000 | 12.000.000 |
| Bảng giá | buổi 1–48 × 180.000 | buổi 1–48 × 250.000 |
| Đợt 1 (buổi 1–24) | 4.320.000 | 6.000.000 |
| Đợt 2 (buổi 25–48) | 4.320.000 | 6.000.000 |

**Kỳ thu KT-01** = An·Đợt 1 4.320.000 + Bình·Đợt 1 6.000.000 = **10.320.000**. PH chuyển đủ → PAYMENT An 4.320.000, Bình 6.000.000.

**Tình huống A — Bình dừng sau buổi 20, dư chuyển sang An** (giả định: tới ngày buổi 20 của Bình, An đã học 24 buổi)

| Bước | An | Bình |
|---|---|---|
| Giá trị đã dùng | — | 20 × 250.000 = 5.000.000 |
| Huỷ đợt chưa có tiền | — | Huỷ Đợt 2 (6.000.000) |
| QUYẾT TOÁN | — | 5.000.000 − 6.000.000 = −1.000.000 |
| Phải thu Bình | — | 6.000.000 − 1.000.000 = 5.000.000 |
| Chênh | — | 6.000.000 − 5.000.000 = dư 1.000.000 |
| Ưu đãi liên đới | Mất từ buổi 25: bảng giá 1–24 × 180.000, 25–48 × 200.000 | — |
| Đợt 2 An (chưa có tiền) | Huỷ 4.320.000, tạo mới 4.800.000 | — |
| TRANSFER | +1.000.000 | −1.000.000 |
| **Sau cùng** Phải thu / Đã thu / Còn nợ | 9.120.000 / 5.320.000 / **3.800.000** | 5.000.000 / 5.000.000 / **0 → STOPPED** |

Kỳ thu KT-02 = An·Đợt 2 **3.800.000**. Kiểm B5: tiền vào 10.320.000 = Đã thu 5.320.000 + 5.000.000 + ví 0 + hoàn 0 ✓.

**Tình huống B — Bình học lố tới buổi 26 rồi dừng**
Giá trị đã dùng 26 × 250.000 = 6.500.000 → QUYẾT TOÁN +500.000 → Bình còn nợ 500.000. An mất ưu đãi từ buổi 25 như trên. KT-02 = An·Đợt 2 4.800.000 + Bình·Quyết toán 500.000 = **5.300.000**, thứ tự lấp: Bình·Quyết toán trước.

**Tình huống C — cọc 1.000.000/con, Bình không học buổi nào**
Bình: đã dùng 0, quyết toán −1.000.000 (dư 1.000.000). An mất ưu đãi từ buổi 1 → bảng giá 1–48 × 200.000, học phí thực 9.600.000; đợt 1 An huỷ-tạo 4.800.000. Chuyển dư sang An. Còn nợ Đợt 1 An = 4.800.000 − 1.000.000 (cọc An) − 1.000.000 (từ Bình) = **2.800.000**.

**Tình huống D — cọc gộp 2.000.000 không ghi con**
Vào ví (DEPOSIT_UNSPLIT). Khi UC-01, màn tạo đơn bắt buộc hiển thị "Ví có 2.000.000" và cho chia; sale chia An 1.000.000 / Bình 1.000.000 hoặc giữ ví có lý do.

**Tình huống E — chuyển thừa 500.000 ở KT-02 của tình huống A**
PH chuyển 4.300.000 cho KT-02 (3.800.000): An +3.800.000 (PAID), ví +500.000 (OVERPAY), "Cần xử lý". Sale để trong ví hoặc chuyển kế toán hoàn.

## 10. Cấu hình chính sách (`BillingPolicyVersion.params`)

| Nhóm | Khoá | Kiểu | Mặc định |
|---|---|---|---|
| Đợt | `maxInstallments` | số | 6 |
| | `minFirstPaymentPercent` | % | 25 |
| | `minDeposit` | đồng | 500.000 |
| | `graceDaysAfterFirstSession` | ngày | 7 |
| | `planTemplates` | danh sách | FULL, THEO_BUOI_2, THEO_BUOI_4, COC_ROI_THEO_BUOI |
| Ưu đãi | `siblingDiscountTiers` | [%] theo con thứ 2, 3+ | [10, 15] |
| | `siblingDiscountTarget` | LOWEST_LIST_PRICE / LATER_ENROLLED | LOWEST_LIST_PRICE |
| | `stackSiblingWithFullPay` | bool | false |
| | `fullPayDiscountPercent` | % | 0 (BGĐ chốt) |
| | `onSiblingLost` | KEEP / BO_TU_DOAN_CHUA_HOC / CLAW_BACK_ALL | BO_TU_DOAN_CHUA_HOC |
| | `pausedSiblingKeepsDiscount` | bool | true |
| Dừng học | `usedSessionRule` | HELD_SESSIONS / ATTENDED_ONLY | HELD_SESSIONS |
| | `excusedAbsenceNotCounted` | bool | true |
| | `stopFeeFixed` / `stopFeePercentOfRemaining` | đồng / % | 0 / 0 |
| | `allowForfeit` | bool | false |
| | `maxForfeitAmount` | đồng | 0 |
| | `defaultSurplusDestination` | SIBLING / WALLET | SIBLING |
| Bảo lưu | `maxPauseDays` | ngày | 90 |
| Trễ hạn | `lateFeeFixed` | đồng | 0 |
| | `lockAttendanceWhenOverdueDays` | ngày / null | null |
| Chuyển tiền | `allowCrossAccountingUnitTransfer` | bool | false |

Mọi mặc định đánh dấu "BGĐ chốt" hoặc có tiền đi ra khỏi PH (`allowForfeit`, phí dừng, phí trễ) **không được bật** trước khi có văn bản chính sách ký.

## 11. Phân quyền

| Quyền (`module:action`, tên dự kiến) | Sale | QLCS | Kế toán | Admin | Phạm vi mặc định |
|---|---|---|---|---|---|
| `billing:view-family` | ✓ | ✓ | ✓ | ✓ | Sale OWN, còn lại CENTER |
| `billing:create-order` | ✓ | ✓ | | ✓ | |
| `billing:edit-plan` (trong giới hạn) | ✓ | ✓ | | ✓ | |
| `billing:issue-bill` | ✓ | ✓ | ✓ | ✓ | |
| `billing:record-cash` | ✓ | ✓ | ✓ | ✓ | |
| `billing:split-wallet` | ✓ | ✓ | ✓ | ✓ | |
| `billing:transfer` (cùng gia đình, cùng đơn vị) | ✓ | ✓ | ✓ | ✓ | |
| `enrollments:stop` / `pause` / `resume` / `change-course` | ✓ | ✓ | | ✓ | |
| `billing:forfeit` | | ✓ | | ✓ | |
| `billing:waive` | | ✓ | | ✓ | |
| `billing:out-of-guardrail` | | ✓ | | ✓ | |
| `payments:confirm` (có sẵn) | | | ✓ | ✓ | |
| `billing:refund` | | | ✓ | ✓ | |
| `payments:adjust` (có sẵn) | | | ✓ | ✓ | |
| `billing-policy:manage` | | | | ✓ | GLOBAL |

Luật: một thao tác chạm nhiều ghi danh thì người thao tác phải có quyền trên **tất cả**. Sale OWN nghĩa là sale phụ trách gia đình (chủ lead) **hoặc** sale phụ trách ghi danh đó.

## 12. Tác động doanh thu, hoa hồng, hoá đơn

- **Doanh thu (thực thu):** ghi nhận ở dòng PAYMENT vào ghi danh, theo ngày giao dịch. Tiền vào ví **chưa** là doanh thu; ghi nhận tại ngày chia ví vào ghi danh. TRANSFER dời doanh thu giữa hai ghi danh tại ngày chuyển, tổng không đổi. REFUND trừ doanh thu tại ngày hoàn. *(Câu treo Q3 — cần kế toán xác nhận.)*
- **Hoa hồng (module chưa làm):** dữ liệu để sẵn — PAYMENT sinh hoa hồng; TRANSFER không sinh; REFUND và QUYẾT TOÁN âm sau khi đã trả hoa hồng → khoản trừ hoa hồng kỳ sau. Không cài logic hoa hồng trong module này.
- **Hoá đơn VAT:** ngoài phạm vi V1; dữ liệu theo ghi danh đủ để xuất tách hoặc gộp theo kỳ thu.

## 13. Câu treo (đề xuất sẵn phương án)

| # | Câu hỏi | Đề xuất | Người chốt |
|---|---|---|---|
| Q1 | CS1, CS2 có phải 2 đơn vị kế toán riêng? | Coi là riêng cho tới khi kế toán xác nhận ngược lại | Kế toán + Dev |
| Q2 | Sale có được chuyển tiền giữa các con không cần kế toán? | Có, trong cùng gia đình + cùng đơn vị, chỉ phần CONFIRMED, có log | BGĐ |
| Q3 | Tiền vào ví có tính doanh thu thực thu không? | Không, tính khi chia vào ghi danh | Kế toán |
| Q4 | Cọc có hoàn khi PH tự huỷ? | Không mất cọc mặc định (`allowForfeit=false`); chuyển hoặc hoàn | BGĐ |
| Q5 | Ưu đãi anh em áp cho con nào, mất thế nào? | Con học phí thấp hơn; bỏ từ đoạn chưa học, không truy thu | BGĐ |
| Q6 | Buổi vắng không phép có tính là đã dùng? | Có | BGĐ |
| Q7 | Học lại sau khi đã dừng: giá cũ hay giá mới? | Giá hiện hành (ghi danh mới) | BGĐ |
| Q8 | Ưu đãi anh em khi 2 con học 2 cơ sở khác nhau? | Vẫn áp (gia đình là một) nhưng không chuyển tiền chéo đơn vị | BGĐ |
| Q9 | Có khoá điểm danh khi quá hạn? | Không | QLCS |

## 14. Ngoài phạm vi V1

Hoá đơn VAT; logic tính hoa hồng; cổng payOS; PH tự thao tác trên app (V1 chỉ nhân viên); mẫu ZNS mới; trả góp qua bên thứ ba; đa tiền tệ.
