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

### NỢ-2 · MẤT PHỦ TEST "hoàn tiền → công nợ" — ✅ ĐÃ DỰNG LẠI 17/09/2026

`tests/e2e/r7/hoan-tien-cong-no.spec.ts` dựng lại theo mô hình DELTA: **11 ca**, trong đó
7 xanh thật và 4 **ghim** (`test.fail`) vì chúng chỉ ra một lỗi đang có — xem `NỢ-4`.

Không dịch cú pháp: hai ca cũ `[HT-E3]`/`[HT-E3b]` đo đường **đề xuất hoàn**, mà đường ấy
nay đã bị **cầu dao** `REFUND_REQUEST_DISABLED` (08/09/2026) tắt có chủ đích. Ghim chúng sẽ
là **ghim giả** — chúng "đỏ" vì hàm trả `null` rồi deref, không phải vì phép tính sai. Nay:
`[HT-E3]` đo **cầu dao có thật sự chặn không**, `[HT-E3b]` là **dây bẫy** — gỡ cầu dao thì
nó đỏ, buộc người gỡ dựng lại hai ca chống phồng đề xuất (nguyên văn nằm trong chú thích).

Ca `[HT-E4]` (giao điểm hoàn tiền × điều chỉnh) tách làm hai: phần cơ chế delta ở cổng PH
**xanh thật**, phần giao điểm với hoàn tiền **ghim**. Thêm `[HT-E1b]` — canh bản vá không
được đẻ **nợ ma**.

5/5 phép cấy lỗi làm lưới đổi trạng thái đúng ca; chi tiết trong commit message.

⚠️ **Điểm yếu đã nói rõ trong file:** khẳng định "chưa thu đồng nào thì không đẻ yêu cầu
rỗng" của `[HT-E5]` HIỆN không đo được gì — cầu dao trả `null` trước khi hàm chạm tới cổng
ấy. Không phép cấy nào làm ca đó đổi trạng thái.

### 🔴 NỢ-4 · HOÀN TIỀN KHÔNG TRỪ Ở CỔNG PH VÀ CÔNG NỢ — TÍNH NĂNG THỨ TÁM BỊ MẤT

**Phát hiện 17/09/2026 khi dựng lại NỢ-2. Đây là lỗi TIỀN, đang sống.**

Hai bộ lọc, hai kết quả khác nhau trên cùng một dữ liệu:

| Đường đọc | Bộ lọc | Thấy dòng `REFUNDED`? |
|---|---|---|
| Doanh thu | `WHERE_THUC_THU` (`lib/finance/thuc-thu.ts`) | **CÓ** |
| Cổng PH · công nợ · đề xuất hoàn | `KHOAN_DA_XAC_NHAN` (`lib/finance/debt.ts`) | **KHÔNG** |

Đo được: phiếu 5tr, hoàn 2tr ⇒ doanh thu ra **3tr (đúng)**, cổng PH ra **5tr (sai)**.

**Là hồi quy do lượt hợp nhất.** Bản `test` trước merge đọc `WHERE_THUC_THU` ngay trong
`lib/portal/billing.ts` (`9202d782`, chú thích còn nguyên: *"KHÔNG còn lọc cứng
CONFIRMED"*); bản `main` thắng khối xung đột và mang theo `KHOAN_DA_XAC_NHAN`. Spec duy
nhất canh điều đó bị xoá **trong cùng lượt merge** — nên không gì đỏ lên.

**Đang sống, không phải lý thuyết:** `refundPayment` được gọi từ `refundPaymentAction`
(`app/(admin)/admin/payments/_actions.ts:653`), tức màn `/admin/payments` đang dùng.
Hệ quả với người thật: phụ huynh đã nhận lại tiền vẫn thấy khoản đó là "đã đóng", và công
nợ không tăng lại tương ứng.

⚠️ **ĐỪNG VÁ NGÂY THƠ.** Đã thử: cho `KHOAN_DA_XAC_NHAN` nhận thêm `REFUNDED` làm cả 4 ca
ghim lật xanh, **nhưng làm `[HT-E1b]` đỏ** — công nợ của em đã nghỉ nhảy lên nguyên học
phí, một khoản không ai còn nợ. Bản vá đúng phải tách hai câu hỏi: *"PH đã đóng bao nhiêu"*
(phải trừ dòng hoàn) khác *"ghi danh còn nợ bao nhiêu"* (không được phồng lên vì tiền đã
trả lại). `KHOAN_DA_XAC_NHAN` là bộ lọc dùng chung của nhiều đường tiền ⇒ **đợt riêng**,
cân từng nơi gọi.

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

⚠️ **Mục 1, 5, 6 sống sót nhờ gỡ xung đột đúng, KHÔNG nhờ một cổng** — loại "hàm thuần có
test, dây nối thì không". **ĐÃ BỊT (17/09/2026):**

| Lưới | Ở đâu | Bắt được gì |
|---|---|---|
| `[ZC-DN-01]` · `[ZC-DN-02]` | `lib/integrations/zalocrm/day-noi.test.ts` | bỏ `code: true` khỏi `select` · bỏ tham số `org` ở chỗ gọi · đổi nguồn `orgCodeCuaCoSo` · route cron thôi gọi `capQuyenNickZalocrm()` · **đảo thứ tự** cấp quyền ↔ nạp bù tin |
| `[SATA-BA-01]` · `[SATA-BA-02]` | fork: `backend/tests/sata-build-args-dockerfile.test.ts` | `ARG`/`ENV` sai stage · đặt SAU `RUN npm run build` · compose thôi truyền build arg |

Cả hai lưới đều đã **cấy lại lỗi để chứng minh đỏ** (5/5 và 3/3 phép cấy), không chỉ xanh
trên mã đang đúng. Chi tiết output đỏ nằm trong commit message của từng lưới.
