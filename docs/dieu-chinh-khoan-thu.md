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
- [x] **Bước 1c** — cầu dao `ADJUST_PAYMENT_DISABLED` (chặn cả SUPER_ADMIN). **ĐÃ GỠ ở Bước 7.**
- [x] **Bước 2** — thêm `paymentType: PAYMENT | ADJUSTMENT`; bỏ `ADJUSTED` khỏi enum
      `accountantStatus`; backfill `paymentType = PAYMENT`
      (migration `20260907090000`, có `down.sql` chạy tay).
- [x] **Bước 3** — viết lại `adjustPayment` theo delta + tách `updatePendingPayment`
      + chốt chặn cứng ở nhánh tách khoản. Đã smoke-test 19/19 trên DB thật.
- [x] **Bước 3b** — UI: tách hai nhóm nút theo trạng thái, nhãn nói rõ "số đúng của
      PHIẾU THU NÀY", hiện delta kèm dấu trước khi lưu.
- [x] **Bước 4** — `KHOAN_DA_XAC_NHAN` (where) + `laKhoanDaXacNhan` (JS) +
      `tongDaXacNhan` + `sumConfirmed` trong `lib/finance/debt.ts` là NHÀ DUY NHẤT.
      Xoá 3 bản chép tay; rà đủ 15 chỗ trục A.
- [x] **Bước 4b** — `KHOAN_DA_GHI_NHAN` + `sumRecorded(orderId)` trong
      `lib/finance/ghi-nhan.ts` là NHÀ DUY NHẤT của trục B. Gom 9 bản chép tay
      (4 chỗ Σ tiền + 2 chỗ đếm idempotent + 3 chỗ cổng chốt lead). Khoá giữ nguyên
      theo từng chỗ: đơn · lead · `enrollmentId: null` — hằng chỉ khai *cái gì được
      tính là tiền đã ghi nhận*, không khai khoá. Cổng `ghi-nhan.test.ts` chặn mọc lại.
- [x] **Bước 5** — hiển thị phía phụ huynh: dòng gốc GIỮ số cũ + nhãn "Đã điều chỉnh";
      bút toán điều chỉnh là dòng riêng (số có dấu + lý do); "Tổng đã xác nhận" ở cuối.
      Logic xếp thuần ở `lib/portal/phieu-thu.ts`; vẽ ở CẢ HAI đường (v1 + v2).
- [x] **Bước 6** — test: 19 ca thuần (CI luôn chạy) + 24 ca chạm Postgres thật.
- [x] **Bước 7** — gỡ cầu dao; cấp `payments:adjust` cho kế toán ở RBAC v2.

## Bước 6 — checklist bắt buộc trước khi mở lại

- [x] Điều chỉnh **tăng**, **giảm** (delta âm), **nhiều lần chồng** trên MỘT phiếu thu.
- [x] Trả góp: 2 phiếu CONFIRMED cùng ghi danh → điều chỉnh đúng phiếu đợt 1, phiếu đợt 2
      không đổi, `sumConfirmed` đúng.
- [x] `adjustPayment` trên phiếu PENDING → **reject**.
- [x] `updatePendingPayment` trên phiếu CONFIRMED → **reject**.
- [x] Dòng gốc **không đổi một field nào** sau điều chỉnh (so sánh toàn bộ).
- [x] Chạm trần trên (`finalPrice ?? tuition`) và chạm 0 → **reject**, không tự cắt số.
      Biên chính xác: **đúng bằng** trần → cho qua · **vượt** trần → từ chối; tổng **đúng
      0** → cho qua · tổng **âm** → từ chối. Cả hai ca từ chối đều kiểm thêm "không đẻ
      bản ghi nào" — cắt âm thầm còn tệ hơn từ chối.
- [x] Khoản `deletedAt != null` không được cộng ở cả 15 chỗ trục A — nay chứng minh bằng
      CỔNG mã nguồn (`lib/finance/truc-a.test.ts`) chứ không đếm tay: mọi nơi ĐỌC phải đi
      qua `KHOAN_DA_XAC_NHAN`, nên `deletedAt: null` không còn là thứ phải nhớ.
- [x] **Chênh lệch trục A / trục B được bảo toàn** — dùng fixture riêng
      (`tests/fixtures/hai-truc-tien.ts`), KHÔNG dựa vào seed.
- [x] **XOÁ CẦU DAO** — đã xoá `lib/finance/cau-dao-dieu-chinh.ts` + test của nó + chỗ
      gọi trong `app/(admin)/admin/payments/_actions.ts`.

### Bộ test ở đâu

| Bộ | Chạy bằng | CI |
|---|---|---|
| `lib/portal/phieu-thu.test.ts` (11 ca) · `lib/finance/truc-a.test.ts` (8) · `lib/finance/ghi-nhan.test.ts` (6) · `lib/auth/payments-adjust-quyen.test.ts` (6) | `pnpm test:unit` | job **Unit tests** (bắt buộc để merge) |
| `tests/finance/dieu-chinh.test.ts` (24 ca, Postgres thật) | `pnpm test:finance-db` | job **db-tests** (đã thêm bước) |

⚠️ Bộ chạm DB **tự SKIP** khi chạy `pnpm test:unit` trần (thiếu `ALLOW_DB_RESET=1`) — đó
là chủ đích của `tests/_helpers/db-gate.ts` sau sự cố mất DB 04/09. Skip ≠ xanh: muốn
nghiệm thu thì phải chạy đúng script `test:finance-db`.

## Ghi chú kỹ thuật cần nhớ

- **Không khoá được SUPER_ADMIN bằng quyền.** `can()` v2 (`lib/auth/can.ts:52`) trả `true`
  vô điều kiện cho SUPER_ADMIN; repo lại có bất biến bắt v1 khớp v2 (`permissions.test.ts`)
  và cấm phình danh sách ngoại lệ. Đó là lý do Bước 1c phải dựng cầu dao ở tầng tính năng
  thay vì tưởng rằng ma trận khoá được.
- **`payments:adjust` KHÔNG đối xứng giữa hai tầng RBAC — cố ý.** v1 chỉ `SUPER_ADMIN`;
  kế toán nhận quyền ở v2 (`prisma/seed-roles.ts`). Hệ quả phải nhớ: **trên máy dev/CI
  (chạy v1) nút "Điều chỉnh" ẨN với kế toán**, trên prod (v2 đang bật) thì hiện. Đừng
  "sửa cho khớp" bằng cách thêm `ACCOUNTANT` vào ma trận v1 mà không hỏi.
- **Nhánh tách khoản lúc convert** (`linkRecordedPaymentsToEnrollments`) **SỬA `amount`
  của dòng gốc**. Chỉ đúng khi dòng còn PENDING/RECORDED ("PENDING là nháp"). ✅ Bước 3 đã
  thêm chốt chặn cứng: gặp dòng CONFIRMED thì `throw`, không sửa im lặng.
- **KHÔNG đổ `Payment.note` của phiếu thu thường ra cổng phụ huynh** — nó chứa ghi chú
  nội bộ + marker máy sinh (`[auto:order-confirm]`). Chỉ dòng ADJUSTMENT mới lộ `note`,
  vì `note` của nó chính là lý do do người nhập gõ.
- **`reason` của bút toán điều chỉnh lưu ở `Payment.note`.** Bảng không có cột `reason`
  riêng, mà Bước 5 phải in lý do ngay cạnh con số cho phụ huynh. AuditLog vẫn giữ bản sao.
- **Khoá lạc quan đổi cách làm.** Mẹo cũ ghi đè `updatedAt` của dòng gốc để chốt lock —
  đó là một UPDATE lên dòng gốc, đúng thứ mô hình cấm. Nay `expectedUpdatedAt` chỉ SO
  SÁNH, còn tuần tự hoá dùng `SELECT … FOR UPDATE` (khoá hàng, không đổi cột nào).
- **Ràng buộc DB trên `Payment.amount`:** chỉ có `payment_amount_nonzero: CHECK (amount <> 0)`
  (`migrations/20260617040000_check_constraints`). Cột là `integer` CÓ DẤU — **không có gì
  chặn số âm**, nên `amount = delta` âm lưu được. Ràng buộc này còn CỘNG HƯỞNG với luật
  "delta = 0 thì không tạo bản ghi": DB tự chặn nếu code quên.
- **Mọi dòng CONFIRMED đều có `enrollmentId`** — `confirmPayment:400` từ chối xác nhận
  khoản chưa gắn ghi danh. Nên `sumConfirmed(enrollmentId)` không thể sót tiền đã xác nhận.
  Trục B thì `enrollmentId` có thể null (`payos-ingest.ts:1044` không bao giờ set) ⇒
  **không** được ép khoá `enrollmentId` cho trục B.

## Việc phải làm TAY sau khi lên prod

1. **Migration** — `20260907090000_payment_type_tach_khoi_status` chạy TỰ ĐỘNG qua
   `deploy.yml` (`prisma migrate deploy`) khi merge vào `main`. Đo prod 07/09: đúng **1**
   bản ghi `Payment` (CONFIRMED, 3.686.000 đ), **0** ADJUSTED, **0** xoá mềm ⇒ bước đổi
   enum không đụng dữ liệu. `down.sql` có sẵn, chạy tay nếu phải lùi.
2. **⚠️ SEED VAI — PHẢI BẤM TAY.** Seed vai không chạy theo deploy. Chưa chạy thì
   `RolePermission` trên prod không có dòng `payments:adjust` ⇒ **kế toán vẫn không thấy
   nút** dù mã đã lên, và nhìn y hệt "tính năng không hoạt động". Bấm workflow seed vai
   (`prisma/seed-roles.ts`) sau khi deploy xong.
3. **Nghiệm thu 1 phiếu thật**: điều chỉnh một khoản ở CS1, rồi mở cổng phụ huynh của
   chính học viên đó — phải thấy **hai dòng** (phiếu gốc số cũ + dòng điều chỉnh có dấu
   và lý do) và "Tổng đã xác nhận" bằng số đúng.
