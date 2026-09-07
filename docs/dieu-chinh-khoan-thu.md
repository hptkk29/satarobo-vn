# Bút toán "Điều chỉnh khoản thu" — sổ theo dõi

Chủ dự án giao 07/09/2026. Mỗi bước một commit, không gộp.

## Lỗi đang sửa

`adjustPayment` ghi **số tuyệt đối** vào một dòng `Payment` mới mang
`accountantStatus = ADJUSTED` (`lib/finance/payment.ts:612`). Hệ có **hai trục cộng
tiền**, và bút toán điều chỉnh rơi khỏi cả hai theo hai kiểu ngược nhau:

| Trục | Bộ lọc | Dùng ở | Bút toán ADJUSTED |
|---|---|---|---|
| A · đã xác nhận | `accountantStatus = CONFIRMED` | công nợ · portal · học phí · báo cáo | **không được cộng** → số kế toán vừa sửa không tới phụ huynh |
| B · đã ghi nhận | `saleStatus = RECORDED` | mã QR · webhook SePay · tin ZNS · cổng chốt lead | **cộng cả dòng gốc lẫn dòng điều chỉnh** → nhân đôi tiền |

## Quyết định thiết kế (đã chốt — không mở lại)

- Dòng `CONFIRMED` là tiền thật đã đối soát sao kê → **bất biến**.
- Điều chỉnh là bút toán **cộng thêm**, lưu **delta**, không sửa dòng gốc.
- UI nhận **số đúng cuối cùng của DÒNG ĐÓ**; backend tự tính delta.
- `ADJUSTED` là **loại** bút toán, không phải trạng thái.
- **Giữ hai hàm** `sumConfirmed` / `sumRecorded`. Không gộp — chênh lệch giữa hai số là
  tín hiệu phát hiện webhook hỏng.
- Enum `accountantStatus`: giữ `REJECTED` + `REFUNDED`, chỉ bỏ `ADJUSTED`. Không đổi tên cột.
- Khoá tính tổng: `enrollmentId`. Khoá **thao tác điều chỉnh**: `paymentId`.
- Hoàn tiền **ngoài phạm vi** đợt này.

## Số đo trước khi sửa (07/09/2026)

| | local | Supabase dev/test | **PROD** |
|---|---|---|---|
| `Payment` tổng | 379 | 379 | **1** |
| CONFIRMED | 335 | 335 | **1** (3.686.000 đ) |
| **ADJUSTED** | **0** | **0** | **0** |
| REFUNDED | 0 | 0 | 0 |
| `deletedAt != null` | 0 | 0 | **0** |
| Σ `saleStatus = RECORDED` | 0 | 0 | — |

Lỗi **tiềm ẩn**: nổ ở lần đầu tiên có người bấm nút, không âm ỉ sẵn.
Seed đặt toàn bộ payment thành `COLLECT_CONFIRMED` ⇒ **trục B rỗng** trên mọi môi trường
test → phải tự dựng fixture, xem Bước 6.

## Tiến độ

- [x] **Bước 0** — điều tra: 23 nơi cộng tiền (15 trục A · 4 trục B · 3 thiếu `deletedAt`),
      7 chỗ tham chiếu `ADJUSTED`, 0 nơi ĐỌC nó để cộng.
- [x] **Bước 1** — khoá nút bằng quyền `payments:adjust` (3 lớp: quyền · Server Action · UI).
- [x] **Bước 1b** — vá 3 chỗ cộng tiền quên `deletedAt` (đang sai 0 đ, tiềm ẩn);
      `take: 5000` cắt câm → trần 50.000 + cảnh báo đầu trang.
- [x] **Bước 1c** — cầu dao `ADJUST_PAYMENT_DISABLED` (chặn cả SUPER_ADMIN).
- [x] **Bước 2** — thêm `paymentType: PAYMENT | ADJUSTMENT`; bỏ `ADJUSTED` khỏi enum
      `accountantStatus`; backfill `paymentType = PAYMENT`
      (migration `20260907090000`, có `down.sql` chạy tay).
- [ ] **Bước 3** — viết lại `adjustPayment` theo delta + tách `updatePendingPayment`.
- [ ] **Bước 3b** — UI: nói rõ "số đúng của DÒNG NÀY", hiện delta trước khi lưu.
- [ ] **Bước 4** — một predicate dùng chung; `computeEnrollmentDebt` là nhà duy nhất.
- [ ] **Bước 4b** — trục B giữ khoá riêng (đơn/QR), không ép `enrollmentId`.
- [ ] **Bước 5** — hiển thị phía phụ huynh.
- [ ] **Bước 6** — test (xem dưới).

## Bước 6 — checklist bắt buộc trước khi mở lại

- [ ] Điều chỉnh **tăng**, **giảm** (delta âm), **nhiều lần chồng** trên MỘT phiếu thu.
- [ ] Trả góp: 2 phiếu CONFIRMED cùng ghi danh → điều chỉnh đúng phiếu đợt 1, phiếu đợt 2
      không đổi, `sumConfirmed` đúng.
- [ ] `adjustPayment` trên phiếu PENDING → **reject**.
- [ ] `updatePendingPayment` trên phiếu CONFIRMED → **reject**.
- [ ] Dòng gốc **không đổi một field nào** sau điều chỉnh (so sánh toàn bộ).
- [ ] Chạm trần trên (`finalPrice ?? tuition`) và chạm 0 → **reject**, không tự cắt số.
- [ ] Khoản `deletedAt != null` không được cộng ở cả 15 chỗ trục A.
- [ ] **Chênh lệch trục A / trục B được bảo toàn** — dùng fixture riêng
      (`tests/fixtures/hai-truc-tien.ts`), KHÔNG dựa vào seed.
- [ ] **XOÁ CẦU DAO** — cả `lib/finance/cau-dao-dieu-chinh.ts` lẫn chỗ gọi trong
      `app/(admin)/admin/payments/_actions.ts`, và mở lại `payments:adjust` cho vai
      nghiệp vụ (hiện chỉ `SUPER_ADMIN`).

## Ghi chú kỹ thuật cần nhớ

- **Không khoá được SUPER_ADMIN bằng quyền.** `can()` v2 (`lib/auth/can.ts:52`) trả `true`
  vô điều kiện cho SUPER_ADMIN; repo lại có bất biến bắt v1 khớp v2 (`permissions.test.ts`)
  và cấm phình danh sách ngoại lệ. Đó là lý do phải có cầu dao ở tầng tính năng.
- **Nhánh tách khoản lúc convert** (`linkRecordedPaymentsToEnrollments`,
  `lib/finance/payment.ts:262`) **SỬA `amount` của dòng gốc**. Chỉ đúng khi dòng còn
  PENDING/RECORDED ("PENDING là nháp"). Bước 3 phải thêm assertion chặn cứng nếu nó chạy
  trúng dòng CONFIRMED.
- **Ràng buộc DB trên `Payment.amount`:** chỉ có `payment_amount_nonzero: CHECK (amount <> 0)`
  (`migrations/20260617040000_check_constraints`). Cột là `integer` CÓ DẤU — **không có gì
  chặn số âm**, nên `amount = delta` âm lưu được. Ràng buộc này còn CỘNG HƯỞNG với luật
  "delta = 0 thì không tạo bản ghi": DB tự chặn nếu code quên.
- **Mọi dòng CONFIRMED đều có `enrollmentId`** — `confirmPayment:400` từ chối xác nhận
  khoản chưa gắn ghi danh. Nên `sumConfirmed(enrollmentId)` không thể sót tiền đã xác nhận.
  Trục B thì `enrollmentId` có thể null (`payos-ingest.ts:1044` không bao giờ set) ⇒
  **không** được ép khoá `enrollmentId` cho trục B.
