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

### NỢ-4 · HOÀN TIỀN KHÔNG TRỪ Ở CỔNG PH VÀ CÔNG NỢ — ✅ ĐÃ VÁ 17/09/2026

Tính năng thứ TÁM bị mất trong lượt hợp nhất, và là lỗi TIỀN đang sống. Cổng PH + công nợ
đọc `KHOAN_DA_XAC_NHAN` (CHỈ `CONFIRMED`) nên dòng hoàn `REFUNDED` vô hình, trong khi doanh
thu (`WHERE_THUC_THU`) thì thấy: phiếu 5tr hoàn 2tr ⇒ doanh thu **3tr đúng**, cổng PH
**5tr sai**. Phụ huynh đã nhận lại tiền vẫn thấy khoản đó là "đã đóng".

**Vá theo hướng TÁCH HAI BỘ LỌC** (không nhồi thêm trạng thái vào một bộ lọc). Trước khi
sửa đã liệt kê đủ **13 đường đọc** và gán từng đường theo CÂU NÓ HỎI:

| Câu hỏi | Bộ lọc | Đường đọc |
|---|---|---|
| **A · "PH đã đóng bao nhiêu"** (ròng, trừ dòng hoàn) | `KHOAN_DA_DONG` | cổng PH: danh sách biên lai · `paid` mỗi ghi danh · màn theo từng con · đề xuất hoàn (`paidConfirmed`) · trần học phí khi điều chỉnh · bản xuất dữ liệu học viên · báo cáo doanh thu · biểu đồ doanh thu 6 tháng |
| **B · "ghi danh còn nợ bao nhiêu"** | `computeEnrollmentDebt(.., .., status)` | `getDebtRows` · `outstanding` cổng PH · `outstanding` theo con · công nợ tổng quan PH · công nợ từng con |
| **Trục A** (đối soát, GỘP — cố ý khác A) | `KHOAN_DA_XAC_NHAN` | `sumConfirmed` · khối `congNoDon` + `accounting` ở trang chi tiết đơn |

⚠️ **Ngoại lệ DUY NHẤT của câu B:** ghi danh đã RỜI LỚP (`WITHDREW`/`TRANSFERRED`/`CANCELLED`)
thì KHÔNG trừ bút toán hoàn. Không có nó, em nghỉ-học-hoàn-đủ bỗng "nợ" đúng số vừa được
hoàn — hệ thống đi đòi tiền một người vừa được trả lại tiền. Ngoại lệ KHÔNG áp cho bút toán
ĐIỀU CHỈNH. `enrollmentStatus` là tham số **bắt buộc** nên quên truyền là `tsc` đỏ.

⚠️ **Trang chi tiết đơn CỐ Ý giữ bộ lọc GỘP.** Đã thử đổi sang ròng rồi trả lại: `congNoDon`
tính `choXacNhan = trục B − trục A`, mà trục B (`KHOAN_DA_GHI_NHAN`) không trừ hoàn — để A
ròng còn B gộp thì sau mỗi lần hoàn màn báo "chờ xác nhận" một khoản không tồn tại, biến
tín hiệu đối soát webhook thành báo động giả. **Hệ quả còn lại:** khối kế toán của trang đơn
KHÔNG hiện bút toán hoàn; muốn hiện thì thêm một dòng riêng, đừng đổi trục A.

**Nghiệm thu:** 4 ca ghim `[HT-E4b]` `[HT-E1]` `[HT-E2]` `[HT-E7b]` LẬT sang xanh và
`[HT-E1b]` GIỮ xanh (lật 4 ca mà làm `[HT-E1b]` đỏ chính là bản vá ngây thơ đã bị loại).
6/6 phép cấy làm đúng ca đổi trạng thái.

### 🔴 NỢ-5 · BA CRON CÓ BẢN VÁ ĐÚNG NHƯNG KHÔNG BAO GIỜ CHẠY TRÊN `test`

**Lớp lỗi, không phải một ca lẻ.** Lịch `schedule:` của GitHub **luôn chạy bản workflow ở
NHÁNH MẶC ĐỊNH** (`main`). Vá `cron-pump-test.yml` trên nhánh `test` nên **không có tác
dụng gì** cho tới khi bản vá ấy lên `main` — mà triệu chứng là "cron không chạy", rất dễ bị
chẩn nhầm thành lỗi của chính cron.

Đo 17/09/2026, vòng `for p in …`:

| Khe | `test` | `main` (bản THẬT SỰ chạy) | Hệ quả trên `test.satarobo.vn` |
|---|---|---|---|
| `zalocrm-doi-soat` | có | **THIẾU** | không ai được cấp quyền nick ⇒ vai `member` thấy hộp thư RỖNG |
| `sla-check` | có | **THIẾU** | không có chuông SLA cho Sale — nghiệm thu S-7 không chạy được |
| `webhook-retention` | có | **THIẾU** | dấu vết webhook cũ không được dọn, phình dần |

Chiều ngược lại (`main` có mà `test` thiếu): **không có**.

`vercel.json` (điều khiển cron trên PROD) thiếu 2 khe so với `test`: `webhook-retention`,
`zalocrm-doi-soat` — hai khe này **sẽ có** khi `test` → `main`, nên không phải nợ đứng.

**Bằng chứng lịch chạy bản `main`:** 6/6 lượt gần nhất của `cron-pump-test` đều `ref=main`.

**Cách đóng:** ba khe đã nằm sẵn trên nhánh `test` ⇒ tự đóng khi `test` → `main`. **Trước
khi merge**, muốn chạy tay một lượt trên test thì `gh workflow run cron-pump-test.yml --ref test`
(dispatch dùng đúng bản của nhánh được chỉ định, khác `schedule`).

⚠️ **Cảnh báo kèm theo:** `capQuyenNickZalocrm` đẩy quyền bằng `PUT …/access` **THAY CẢ
TẬP** — ai không nằm trong danh sách tính ra sẽ **bị GỠ**, kể cả quyền gán tay trong giao
diện ZaloCRM, miễn là tài khoản đó có `externalId` (tức đến từ Sata). Nên lượt chạy tay đầu
tiên là phép thử: quyền gán tay còn giữ ⇒ chính sách phủ đúng; mất ⇒ thiếu vai hoặc thiếu cơ sở.

### 🔴 NỢ-6 · CHƯA CÓ ORG THỨ HAI BÊN FORK — mục ⑤⑥ nghiệm thu không chạy được

Đo fork 17/09/2026: **đúng 1 tổ chức** `e4b4b2ff "Sata Robo"`, **1 khoá `public_api_key`**,
cả 2 nick và 5 user đều thuộc org đó. Thiết kế giả định **ba org (CS1, CS2, TEST)**.

Hệ quả: CS1 và CS2 phải ánh xạ về cùng một `orgCode`; `chonCoSoZaloCrm` khử trùng theo
`orgCode` và thanh chọn chỉ hiện khi `danhSach.length > 1` ⇒ **hộp chọn cơ sở không hiện**,
và `?org=cs2` không có đích để rơi về. Hai mục nghiệm thu ⑤ (đổi cơ sở) và ⑥ (cách ly) vì
thế ghi **"CHƯA KIỂM ĐƯỢC — thiếu org thứ hai bên fork"**, KHÔNG phải ĐẠT.

**Việc hạ tầng GĐ0 — các bước để chạy một lượt:**

1. **Fork** — tạo tổ chức thứ hai (ví dụ tên `Sata Robo — CS2`). Ghi lại `organizations.id`.
2. **Fork** — sinh khoá Public API cho org mới: thêm dòng `app_settings` với
   `setting_key = 'public_api_key'`, `org_id = <id org mới>`, `value_plain = <khoá mới>`.
   *(Kiểm: `select count(distinct org_id) from app_settings where setting_key='public_api_key';`
   phải ra 2.)*
3. **Fork** — nối một nick Zalo vào org mới, hoặc chuyển bớt một nick sang. Không có nick thì
   `capQuyenNickZalocrm` trả `CHUA_CO_NICK` và bỏ qua org đó.
4. **Vercel (env `test`)** — thêm khoá mới vào `ZALOCRM_API_KEYS` (JSON theo `orgCode`,
   ví dụ `{"cs1":"zcrm_…","cs2":"zcrm_…"}`) và thêm bí mật HMAC cho org mới vào
   `ZALOCRM_WEBHOOK_SECRETS`. **Redeploy.**
5. **Sata** — sửa tham số vận hành `zalocrm.orgCodes` thành hai dòng, ví dụ
   `{"CS1":"cs1","CS2":"cs2"}` (khoá = `Center.code`, giá trị khớp `KHUON_ORG_CODE`
   `^[a-z0-9-]{1,32}$`).
6. **Kiểm** — tài khoản neo cả hai cơ sở mở `/zalo-crm` phải thấy hộp chọn 2 mục; tài khoản
   chỉ neo CS1 mở `?org=cs2` phải rơi về CS1 kèm băng vàng. Rồi mở lại mục ⑤⑥ ở
   [`tich-hop-zalocrm/05-nghiem-thu-vai-tren-test.md`](tich-hop-zalocrm/05-nghiem-thu-vai-tren-test.md).

⚠️ Nhắc: tunnel hiện là `trycloudflare` **tạm** — dựng lại máy chủ là đổi địa chỉ, phải sửa
`ZALOCRM_APP_URL` + `ZALOCRM_BASE_URL` trên Vercel **và** `APP_URL` bên fork. Làm hạ tầng
org thứ hai là dịp tốt để chuyển sang tên miền cố định.

### CHỐT 17/09/2026 · F5 "Mở lead" — nhánh phụ huynh CHƯA TỪNG NHẮN

Chủ dự án chốt: **giữ `?compose=<SĐT>`**, **không tự động tra số**, **không thêm màn cảnh báo**.

Vì sao đây là giới hạn chứ không phải lỗi: nick Zalo CÁ NHÂN không có hội thoại với người
chưa từng liên hệ, nên không có gì để mở. Và mỗi lượt tra số là một `PhoneSearchEvent` tính
vào hạn mức Zalo của **cả công ty** — tra tự động biến mỗi cú bấm thành một lượt đốt hạn mức
cho một người có thể không dùng Zalo; hạn mức cạn thì mọi cơ sở mất khả năng tra.

Ba mắt xích đã đo (17/09/2026), để lần thi công không phải dò lại:

| Hỏi | Trả lời |
|---|---|
| Sata đã gọi `PUT /contacts/:id/external-ref` chưa? | **CHƯA** — `datKhoaPhieuZalocrm` có ở `lib/integrations/zalocrm/client.ts:240` nhưng **0 đường gọi** ⇒ `Contact.externalRef` rỗng toàn bộ |
| Fork tra được theo gì? | `GET /api/public/contacts?search=<chuỗi>` khớp `fullName`/`phone`/`email` bằng `contains`. **Không** lọc theo `externalRef`. `GET /api/public/conversations` chỉ nhận `limit`/`since` |
| Màn chat nhận tham số URL? | **CÓ, đã có sẵn** — `?contactId=` (`frontend/src/views/ChatView.vue:629-640`) tự tra ra `convId` rồi `router.replace` sang `/chat/:convId`; `?compose=<SĐT>` mở hộp soạn tin điền sẵn |

⇒ **Không cần sửa fork.** Việc còn lại nằm bên Sata: tra `contact.id` theo SĐT rồi dựng
`?contactId=`, không có thì giữ nguyên `?compose=`.

**Một SĐT khớp nhiều contact** — thứ tự: (1) contact thuộc đúng nick của cơ sở phiếu;
(2) trong đó lấy hội thoại `last_message_at` mới nhất; (3) vẫn còn nhiều hơn một thì
**KHÔNG đoán** — mở `?compose=` để sale tự chọn, vì mở nhầm hội thoại là nhắn nhầm người.

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
