# Hợp nhất `main` (prod) vào `test` — 16/09/2026

PR #279, merge commit `96098478`. 463 commit, 215 file xung đột. Ghi lại để lần sau
không phải đo lại, và để **không ai tưởng những món dưới đây đã làm xong**.

## Vì sao phân kỳ, và vì sao chọn `main` cho module trùng

`main` nhận việc của `test` bằng cherry-pick/rebase — cùng lời commit, khác SHA, cách nhau
~15 phút. Đo được bằng cách tìm cặp commit trùng thông điệp ở hai nhánh. Hệ quả: với module
cả hai bên cùng có (chấm công, media), bản `main` là bản MỚI HƠN ⇒ lấy `main`.

Phân kỳ là THẬT hai chiều, không phải ảo do squash — `git diff --shortstat` giữa hai nhánh
khác 0 theo cả hai hướng trước khi hợp nhất.

## Cách hợp nhất — dùng lại được

- Lấy nguyên file (`checkout --ours/--theirs`) **làm mất tính năng âm thầm**. Phải
  `git merge-file --diff3` trên blob của merge-base, **từng file một**.
- ⚠️ Gộp union cho xung đột add/add là **SAI**: base rỗng theo định nghĩa nên nó nối nguyên
  hai bản. Lần này 64 file bị nhân đôi, phát hiện bằng bài quét import trùng.
- MSYS nuốt đường dẫn kiểu `origin/main:path` ⇒ đặt `MSYS_NO_PATHCONV=1`, và dùng thư mục
  tạm **trong** repo.

## Bảy tính năng rơi mất — TEST bắt, không phải mắt

Ba trong số đó là bảo mật/riêng tư:

| Mất gì | Chỗ | Hậu quả nếu không bắt |
|---|---|---|
| S-9 — đồng hồ SLA chăm sóc | `app/(admin)/admin/leads/actions.ts` | đồng hồ làm mới sai người |
| S-1 — che PII | 6 màn (lớp trial, dashboard QL…) | SĐT phụ huynh hiện nguyên |
| `canSearchPhone` | `lop-trial/_lib/filters.ts` | ô tìm quét cột SĐT đã che |

⇒ **Hợp nhất xong phải chạy đủ bộ test.** Đọc không đủ.

## NỢ — chưa làm, cố ý

### 1. Gỡ VietQR khỏi màn Tích hợp (theo ý `main`)
`main` 31/08 gỡ `setVietQrConfig` + `vietqrSchema` vì giữ lại là giữ **một cửa ghi thứ hai**
vào kho cũ `IntegrationConfig` khoá `VIETQR:*` (tài khoản nhận tiền đã chuyển sang
`/admin/payment-methods`). Nhưng mã ZaloCRM của `test` nằm **trong cùng khối xung đột** —
lấy bản `main` là xoá luôn tích hợp ZaloCRM vừa nghiệm thu.

⇒ Đã **giữ bản `test`** (giữ cả hai). Gỡ VietQR là **một lượt riêng, thuần dọn dẹp** —
không phải lỗi đang chạy.

### 2. Thu hẹp phủ test: "hoàn tiền → công nợ"
`tests/e2e/r7/hoan-tien-cong-no.spec.ts` bị xoá vì viết theo mô hình cũ
(`accountantStatus in [… ADJUSTED]`) — không biên dịch được với schema sau
`20260907090000_payment_type_tach_khoi_status`. Bộ thay thế của `main`
(`tests/finance/dieu-chinh.test.ts`, đo theo `paymentType`) **không phủ y hệt** phần
"hoàn tiền → công nợ". Ghi ra để không ai tưởng phủ vẫn nguyên.

### 3. Bố cục cột bảng Lead — CHỜ CHỦ DỰ ÁN CHỐT
Đã lấy bản `main` (lưu `localStorage`, mỗi người một bộ) và **gỡ tầng lưu theo người trong
DB** của `test`: `_column-actions.ts`, `column-picker.tsx`,
`lib/validators/table-preference.{ts,test.ts}`. Bảng `UserTablePreference` **vẫn còn trong
schema nhưng không ai đọc**.

Quay lại tầng DB = nối nó vào bảng Lead bản mới của `main` ⇒ một đợt riêng.

## ⚠️ TRƯỚC KHI LÊN PROD

1. **Báo kế toán: số "Thực thu" SẼ ĐỔI.** `main` bỏ `ADJUSTED` khỏi
   `PaymentAccountantStatus`; điều chỉnh nay là dòng `paymentType = "ADJUSTMENT"` mang
   **DELTA**, trạng thái `CONFIRMED`, và **cộng dồn** với dòng gốc (dòng gốc giữ nguyên số).
   Luật chốt: `lib/finance/debt.ts` — "KHÔNG lọc theo `paymentType`".
2. Sau khi `test` → `main`: **chạy tay `.github/workflows/seed-prod-roles.yml`** (merge này
   sửa `prisma/seed-roles.ts`). Quên = prod chạy quyền cũ mà **không báo lỗi**.

## Đã kiểm, không phải nợ

- Cơ chế **duyệt đơn hàng** `main` gỡ (`a99e777c`) là cổng kế hoạch trả góp, **không phải**
  duyệt giảm giá. Cổng chống lách duyệt giảm giá (`discountApprovalStatus` ở
  `confirmSettledOrder` + `payos-ingest`) còn nguyên.
- Chốt tiền R-02 (`lib/payments/plan-money-guard.ts`) còn nguyên và độc lập với cơ chế đã gỡ.
- 15 migration `test` còn thiếu: **toàn bộ là thêm**, 0 lệnh làm mất dữ liệu. Lệnh `UPDATE`
  duy nhất chỉ đặt `soCapQuetKyVong`/`attendanceMode` cho ca `NG`.
