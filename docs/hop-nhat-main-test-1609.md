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

### NỢ-1 · Gỡ VietQR khỏi màn Tích hợp (theo ý `main`)
`main` 31/08 gỡ `setVietQrConfig` + `vietqrSchema` vì giữ lại là giữ **một cửa ghi thứ hai**
vào kho cũ `IntegrationConfig` khoá `VIETQR:*` (tài khoản nhận tiền đã chuyển sang
`/admin/payment-methods`). Nhưng mã ZaloCRM của `test` nằm **trong cùng khối xung đột** —
lấy bản `main` là xoá luôn tích hợp ZaloCRM vừa nghiệm thu.

⇒ Đã **giữ bản `test`** (giữ cả hai). Gỡ VietQR là **một lượt riêng, thuần dọn dẹp** —
không phải lỗi đang chạy.

### NỢ-2 · MẤT PHỦ TEST: "hoàn tiền → công nợ" — PHẢI LÀM TRƯỚC PR `test` → `main`

**Không phải đổi chỗ. Là mất.**

`tests/e2e/r7/hoan-tien-cong-no.spec.ts` (361 dòng, **8 ca**) bị xoá vì viết theo mô hình
cũ `accountantStatus in [… ADJUSTED]` — không biên dịch được với schema sau
`20260907090000_payment_type_tach_khoi_status`.

Bộ được coi là "thay thế", `tests/finance/dieu-chinh.test.ts` (435 dòng, 24 ca), nhắc
`refund` / `hoàn tiền` / `REFUNDED` **ĐÚNG 0 LẦN**. Nó phủ cơ chế DELTA ở tầng sổ (hai
trục A/B, xoá mềm, trần học phí, khoá lạc quan, AuditLog) — **không chạm đường hoàn tiền,
không chạm màn phụ huynh**.

**Tám ca mất, ghi tên để dựng lại:**

| Ca | Phủ gì |
|---|---|
| `[HT-E1]` | hoàn TOÀN BỘ — PH thấy đã thu về 0, biên lai có dòng hoàn, **công nợ không đẻ nợ ma** |
| `[HT-E2]` | hoàn MỘT PHẦN — trừ đúng phần đã trả lại trên **cả 3 màn PH** |
| `[HT-E3]` | hoàn HAI LẦN liên tiếp — đề xuất lần hai KHÔNG tính lại trên số gộp |
| `[HT-E3b]` | đã DUYỆT hoàn nhưng kế toán chưa ghi bút toán âm → đề xuất kế tiếp vẫn không phồng |
| `[HT-E4]` | hoàn SAU KHI ĐÃ ĐIỀU CHỈNH — bản gốc bị loại, bút toán âm bị trừ |
| `[HT-E5]` | ghi danh CHƯA THU ĐỒNG NÀO — mọi màn giữ nguyên, không tạo yêu cầu hoàn rỗng |
| `[HT-E6]` | khoản `PENDING` vẫn KHÔNG hiện tiền cho PH (AC1 không bị đợt vá nới ra) |
| `[HT-E7]` | màn ĐANG ĐÚNG không được đổi số — doanh thu thực thu khớp tổng PH thấy |

**Phần còn được phủ ở nơi khác** (unit, tầng sổ — KHÔNG thay được 8 ca trên):
`lib/finance/thuc-thu.test.ts` · `lib/finance/truc-a.test.ts` ·
`lib/portal/trang-thai-ghi-danh.test.ts` · `lib/reports/revenue-*.test.ts`.

**Vì sao phải làm TRƯỚC khi lên prod:** đúng lượt này đổi cách ghi điều chỉnh
(`ADJUSTMENT` mang DELTA, cộng dồn). Ca `[HT-E4]` là ca duy nhất từng canh giao điểm
**hoàn tiền × điều chỉnh** — tức canh đúng chỗ vừa bị thay cơ chế. Bản dựng lại phải viết
theo mô hình `paymentType`, không chép lại bản cũ.

### NỢ-3 · Bố cục cột bảng Lead — CHỜ CHỦ DỰ ÁN CHỐT
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

## Rà ZaloCRM sau merge — sáu điểm không có test khoá đầy đủ

Toàn bộ việc ZaloCRM nằm trên nhánh MỚI HƠN `main`, nên mọi file ZaloCRM dính xung đột
đều có thể bị kéo ngược — đúng cơ chế đã làm mất bảy tính năng. Đọc mã trên `96098478`:

| # | Kiểm gì | Kết luận | Có test khoá? |
|---|---|---|---|
| 1 | nút "Nhắn Zalo" suy `?org=` từ `Center.code` của phiếu | **CÒN** | hàm thuần CÓ · **chỗ gọi KHÔNG** |
| 2 | `CENTER_CLASS_MANAGER` đã bỏ · `CENTER_MANAGER` = `member` · chỉ `SUPER_ADMIN` = `admin` | **CÒN** | CÓ — `[ZC-SSO-07a]` |
| 3 | `seed-roles.ts`: `zalocrm:use` vẫn bị gỡ khỏi Giáo vụ | **CÒN** | CÓ — `[ZC-Q-03]` chốt cứng cả tập |
| 4 | `vercel.json` còn khe `zalocrm-doi-soat` | **CÒN** | CÓ — `lib/cron/dang-ky-cron.test.ts` |
| 5 | `cap-quyen-nick.ts` + gắn vào cron 5 phút | **CÒN** | mô-đun CÓ · **dây nối KHÔNG** |
| 6 | fork: build args `VITE_SATA_ORIGIN` + `VITE_SOURCE_URL` | **CÒN** | KHÔNG (repo khác) |

Bằng chứng từng mục:

1. `app/(admin)/admin/leads/[id]/page.tsx:76` giữ `center: { select: { name: true, code: true } }`;
   `:188` gọi `duongDanNhanZalo(lead.phone, lead.id, orgCodeCuaCoSo(lead.center?.code, orgCodesZalo))`.
2. `VAI_ZALOCRM` = `{ SUPER_ADMIN: "admin", CENTER_MANAGER: "member", CENTER_SALES_CSM: "member", SALES_CSM: "member" }`.
   `[ZC-SSO-07a]` khẳng định `"CENTER_CLASS_MANAGER" in VAI_ZALOCRM === false`.
3. `zalocrm:use` chỉ ở `SUPER_ADMIN` (d.54) · `CENTER_MANAGER` (d.677) · `CENTER_SALES_CSM` (d.951).
   Dưới `CENTER_CLASS_MANAGER` chỉ còn khối chú thích ⛔. `[ZC-Q-03]` dùng `toEqual` trên cả tập
   nên vai THỪA cũng đỏ — seed của `main` KHÔNG cấp lại.
4. JSON hợp lệ, 29 khe, 0 trùng, `{ "path": "/api/cron/zalocrm-doi-soat", "schedule": "*/5 * * * *" }`.
5. `app/api/cron/zalocrm-doi-soat/route.ts` gọi `capQuyenNickZalocrm()` TRƯỚC `doiSoatZalocrm()`.
6. `docker/Dockerfile` khai `ARG`/`ENV` cả hai **trong Stage 1 `frontend-builder`, trước
   `RUN npm run build`** (Vite nướng lúc build — đặt sai stage là rỗng mà build vẫn xanh);
   `docker-compose.yml` truyền từ env; `.env` đặt `VITE_SATA_ORIGIN=https://test.satarobo.vn`.

⚠️ **Mục 1 và 5 sống sót nhờ gỡ xung đột đúng, KHÔNG nhờ một cổng.** Cả hai đều là loại
"hàm thuần có test, dây nối thì không" — bỏ `code: true` khỏi `select`, hoặc bỏ một dòng
trong route cron, thì test vẫn xanh và hỏng câm. Đây là cùng một lớp lỗi với bảy tính năng
đã mất. Bịt bằng lưới ghim mã nguồn (mẫu ở CLAUDE.md) là việc nên làm trước lượt hợp nhất sau.
