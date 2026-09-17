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

🔴 **ĐỌC `NỢ-8` TRƯỚC KHI LÀM PHẦN NÀY (17/09/2026).** Kế hoạch 6 bước dưới đây tách org
theo **CƠ SỞ** (cs1/cs2). Sau khi phát hiện nhiều môi trường Sata cùng bắn vé vào một org,
việc tách phải tính **theo MÔI TRƯỜNG trước** (`test` / `prod` / `local`), rồi mới tới cơ sở.
Dựng theo kế hoạch cũ rồi phải làm lại là nhân bản tài khoản thêm một lượt nữa. Hai nợ này
**thi công CHUNG một lượt** — kế hoạch gộp nằm ở `NỢ-8`.

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

### 🔴 NỢ-7 · LAYOUT MOBILE CỦA FORK KHÔNG NẠP DANH SÁCH NICK — mới TRÁNH, chưa SỬA

Bản vá 17/09 (PR #285) đặt `min-w-[900px]` cho khung nhúng để fork luôn khởi động ở chế độ
desktop. Nó **TRÁNH đường mobile, KHÔNG SỬA đường mobile.** Đường ấy vẫn hỏng y hệt ở ba
tình huống sẽ xảy ra:

1. **Sale mở trên điện thoại** — chắc chắn xảy ra, chỉ là khi nào.
2. **Ai đó mở fork trực tiếp** (`https://…trycloudflare.com/`) trên màn hẹp — không qua
   khung Sata nên `min-w` không cứu được.
3. **Thu nhỏ cửa sổ** xuống dưới 768px rồi tải lại trang.

#### Đo được gì (17/09/2026)

`frontend/src/composables/use-mobile.ts:5,13` — `MOBILE_BREAKPOINT = 768`,
`isMobile = window.innerWidth < 768`. Không có đường vượt (không query param, không
localStorage). Trong iframe, `innerWidth` là bề rộng **của khung**, không phải trình duyệt.

`frontend/src/views/ChatView.vue:651-653` — **TOÀN BỘ lượt nạp nằm trong nhánh desktop**:

| Nằm trong `if (!isMobile.value)` | Bản mobile có làm thay không |
|---|---|
| `fetchZaloAccounts()` | ❌ **KHÔNG** — đây là gốc của "Phạm vi xem 0 · 0" |
| `restoreScope()` | ❌ không |
| `fetchConversations()` | ✅ có — `MobileChatView.vue:111-112` tự gọi |
| `fetchPriorityUnread()` · `fetchFollowingPairs()` | ❌ không |
| tạo socket + gắn listener `chat:inbound-message`, `zalo-labels-synced` | ❌ không |

`MobileChatView.vue` **không** `import useZaloAccounts`, **không** render
`ConversationFilterSidebar` ⇒ không có bộ chọn nick, không có khối "Phạm vi xem".

⚠️ **Hỏng nặng hơn khi khung LẬT từ mobile sang desktop:** `onMounted` chạy **một lần** và
**không có `watch(isMobile)`** nạp bù. Mở lúc hẹp → `MobileChatView` nạp hội thoại; rộng ra
sau đó → `MobileChatView` gỡ, giao diện desktop dựng lên với **mọi thứ rỗng** (không nick,
không hội thoại, không socket). Đây chính là trạng thái chủ dự án nhìn thấy.

Lưu ý để khỏi chẩn sai lần sau: danh sách hội thoại **có** được lọc theo quyền ở máy chủ
(`backend/src/modules/chat/chat-routes.ts:150-157`, `zaloAccountId in displayableIds`), nên
"mobile không thấy gì" **không** phải lỗi phân quyền.

#### Sửa ở đâu (bên fork)

- `frontend/src/views/ChatView.vue` — đưa lượt nạp dữ liệu RA NGOÀI guard `isMobile`
  (nạp không phụ thuộc layout), hoặc thêm `watch(isMobile)` nạp bù khi lật sang desktop.
- `frontend/src/views/MobileChatView.vue` — nạp `useZaloAccounts` và cho phép chọn nick,
  hoặc nói rõ trên màn rằng bản mobile không có bộ chọn nick.
- `frontend/src/composables/use-mobile.ts` — cân nhắc một đường vượt (`?desktop=1`) cho
  ca nhúng trong iframe.

#### Vì sao lượt này KHÔNG sửa

Đụng fork = **build lại frontend + restart container `zalo-crm-app`**. Nick
*Satarobo - Cô Liên* đang `connected` và phiên Zalo do tiến trình giữ ⇒ restart nhiều khả
năng **rớt nick, phải quét QR lại**. Giữa lượt nghiệm thu thì cái giá đó không chấp nhận
được, nên chủ dự án chốt phương án A (sửa bên Sata).

**Gộp vào đợt nào:** làm cùng `NỢ-6` (dựng org thứ hai bên fork) — lúc đó dù sao cũng phải
restart fork, nên trả giá một lần.

### 🔴 NỢ-8 · NHIỀU MÔI TRƯỜNG SATA BẮN VÉ SSO VÀO **MỘT** ORG FORK — phải xử TRƯỚC KHI LÊN PROD

**Chốt phương án: A′ — mỗi môi trường một org riêng bên fork. KHÔNG đụng lõi SSO.**

#### Nguyên nhân THẬT (đo 17/09/2026)

Fork ghép người theo `externalId = claims.sub = User.id` **bên Sata**
(`backend/src/modules/auth/sata-sso-service.ts:191`). Mà `User.id` chỉ **duy nhất trong
phạm vi MỘT database**. Một org fork nhận vé từ nhiều môi trường ⇒ **cùng một người thành
nhiều tài khoản**.

Ba thế hệ id cho cùng hai tài khoản, đo được:

| Thế hệ | `uat.admin` | `uat.sale1` | Nguồn | Tài khoản fork |
|---|---|---|---|---|
| vân `10l4` | `cmtorabag00031…` | `cmtorabb5000b1…` | **`satarobo_local`** (đã xác nhận) | tạo 07–08/09 |
| vân `d755` | `cmtcd2f6f0003d…` | `cmtcd2idk000bd…` | **DB của env `test`** *(chưa chốt — xem dưới)* | tạo 16–17/09 |
| vân `x6d5` | `cmtaew99p0003…` | `cmtaewc1n000b…` | Supabase DEV `mqvojw…` | **chưa từng** vào fork |

Bộ đếm giữa **giống hệt** ở cả ba (`0003` admin, `000b` sale1) — cùng thứ tự seed; chỉ vân
máy khác. Tức **ba lượt seed trên ba database**, KHÔNG phải `User.id` bị đổi.

⚠️ **Giả thuyết đầu của tôi SAI và đã bị loại bằng mã:** seed UAT dùng
`upsert({ where: { email } })` (`prisma/seed-uat/00-tai-khoan.ts:127-128`) nên chạy lại seed
**giữ nguyên `id`**. "Reseed sinh cuid mới" là kết luận sai.

#### Câu còn mở — phải chốt trước khi thi công

Vân `d755` đến từ đâu: **DB của env `test`**, hay **PROD**? Fork cho phép nhúng từ cả hai
(`frame-ancestors … https://admin.satarobo.vn https://test.satarobo.vn`). Nếu là PROD thì
**người dùng thật đã SSO vào cùng org này rồi**, và mức khẩn cấp cao hơn hẳn.

Cách chốt: Vercel → env `test` → `DATABASE_URL` → so **project-ref** với `mqvojwccdhqbagfnjhfo`.
Khác ⇒ `d755` là DB của `test`. Giống ⇒ `d755` chỉ có thể là PROD.

#### 🔴 Điều kiện xảy ra trên PROD

**Prod sẽ là môi trường THỨ TƯ bắn vé vào cùng org fork nếu không tách org trước.** Hậu quả
với dữ liệu thật, không phải giả định:

- Mỗi nhân viên có **hai tài khoản fork** — một từ `test`, một từ prod — và fork không biết
  đó là một người.
- Email trùng ⇒ tài khoản thứ hai sinh ra **KHÔNG CÓ EMAIL**
  (`sata-sso-service.ts:283-285`), nên trên màn quản lý nick nó hiện là một dòng trống,
  người vận hành **gán quyền nhầm tài khoản** — đúng chuyện đã xảy ra ngày 17/09.
- `capQuyenNickZalocrm` đẩy quyền theo `externalIds` của **một** môi trường ⇒ mỗi lượt cron
  từ môi trường này sẽ **GỠ** quyền mà môi trường kia vừa cấp (`PUT …/access` thay cả tập).
  Hai môi trường cùng chạy cron = quyền **lật qua lật lại**, Sale mất quyền đọc nick giữa
  ca làm việc.
- Hội thoại và tin nhắn thật gắn vào tài khoản nào thì nằm ở đó; đổi môi trường là **mất
  lịch sử phân công** dù dữ liệu vẫn còn.

**Phải dựng xong TRƯỚC ngày Sale dùng thật** — xem kế hoạch gộp bên dưới.

#### Tình trạng mồ côi hiện tại (đo 17/09, ĐỪNG XOÁ)

7 tài khoản fork; **4 nghi mồ côi** (2 bản `uat.*` cũ từ `satarobo_local`, 2 bản
`@chat-us05.test.local`). **Không** tài khoản nào giữ hội thoại / contact / tin nhắn —
toàn bộ dữ liệu thật (479 contact, 3 nick) thuộc tài khoản `owner`, vốn **không** sinh từ
SSO. Bốn tài khoản kia chỉ mang `activity_logs` (`uat.admin` cũ: 639 dòng).

⇒ **Không xoá.** Xoá là mất dấu vết kiểm toán mà không thu lại gì. Xử lý đúng là **bỏ mặc
chúng ở org cũ** sau khi tách org.

#### Kế hoạch thi công — GỘP với `NỢ-6`

Cả hai đều cần dựng org bên fork, nên làm **một lượt**, một lần restart:

1. **Fork** — dựng org theo MÔI TRƯỜNG, không theo cơ sở nữa. Tối thiểu:
   `sata-test` và `sata-prod`. (Nếu vẫn muốn tách CS1/CS2 như `NỢ-6` thì thành
   `test-cs1`, `test-cs2`, `prod-cs1`, `prod-cs2` — quyết định trước khi tạo, đổi sau là
   nhân bản thêm một lượt nữa.)
2. **Fork** — mỗi org một `app_settings.public_api_key` riêng.
   Kiểm: `select count(distinct org_id) from app_settings where setting_key='public_api_key';`
3. **Fork** — nối nick vào đúng org của môi trường sẽ dùng nó. Org không nick thì
   `capQuyenNickZalocrm` trả `CHUA_CO_NICK` và bỏ qua — vô hại.
4. **Vercel env `test`** — `ZALOCRM_API_KEYS` + `ZALOCRM_WEBHOOK_SECRETS` trỏ org `test`.
   **Vercel env Production** — trỏ org `prod`, **khoá và bí mật KHÁC**.
5. **Sata** — `zalocrm.orgCodes` khai theo từng môi trường (tham số vận hành nằm trong DB
   nên mỗi môi trường tự có bản riêng — kiểm lại cả hai sau khi đổi).
6. **Máy dev** — hoặc trỏ về org `test`, hoặc dựng org `local` riêng. Đừng để localhost
   bắn vé vào org của `test`: đó chính là cách bốn tài khoản mồ côi hiện nay ra đời.
7. **Kiểm sau khi dựng** — đăng nhập cùng một người từ `test` và từ prod, xác nhận fork
   sinh **hai tài khoản ở HAI org khác nhau** và cron của môi trường này **không gỡ** quyền
   của môi trường kia.

#### Việc kèm theo — rà lại tài liệu

Phát hiện này mâu thuẫn với một câu đang nằm trong `CLAUDE.md:326`:
*"DB của env `test` CHÍNH LÀ DB dev"*. Câu đó đã làm lệch hướng điều tra một lượt. Bốn chỗ
khác dựa vào cùng giả định, phải rà cùng lúc:

| Chỗ | Rủi ro nếu giả định sai |
|---|---|
| `CLAUDE.md:326` | gốc của giả định |
| `docs/chat-realtime/04-migrate-chat-cu.md:105` | *"chạy `--apply` ở local là đổi luôn dữ liệu trên test"* — **thao tác**, sai là chạy nhầm DB |
| `docs/chat-realtime/00-dieu-chinh-cho-repo.md:30` | *"chung 1 project Supabase → chung bộ key"* — sai là cấu hình Realtime hỏng |
| `Document/4-test/huong-dan-quy-trinh-theo-role.md:3, :316` | *"site test (DB dev đã seed full)"* — sai là hướng dẫn nghiệm thu trỏ nhầm DB |

**CHƯA sửa** — chờ chủ dự án đối chiếu project-ref rồi mới sửa hoặc xác nhận lại.

### 🔴 NỢ-9 · NGƯỜI SSO LẦN ĐẦU KHÔNG ĐỌC ĐƯỢC NICK NÀO CHO TỚI LƯỢT ĐỐI SOÁT KẾ TIẾP

**Đo 17/09/2026, tái hiện hai lần, có đối chứng dương.**

Tài khoản fork chỉ sinh ra ở **lần SSO đầu tiên** của một người. `capQuyenNickZalocrm` thì
đẩy quyền theo danh sách `externalIds` — fork bỏ qua id nào nó chưa biết (bộ đếm
`unknown` / `chuaCoTaiKhoan` trong `capQuyenMotOrg`). Nên:

> **Ai đăng nhập lần đầu SAU lượt cron gần nhất sẽ không có quyền đọc nick nào cho tới
> lượt cron KẾ TIẾP.**

Bằng chứng đo được:

| | mốc | quyền |
|---|---|---|
| cron chạy | 10:41:24 | — |
| `uat.giamdoc` SSO lần đầu ⇒ fork tạo tài khoản | **16:39:58** (sau 6 tiếng) | **0 nick** |
| cron chạy lại | 17:0x | **2 nick** ✅ |
| *(đối chứng dương)* `uat.sale1`, tài khoản có TRƯỚC lượt 10:41 | — | 2 nick suốt |

Không phải lỗi phân quyền: `CENTER_MANAGER` **có** trong `VAI_DUOC_CAP_NICK`, và `role`
`member` bên fork là **đúng thiết kế** — tầm nhìn của QLCS đến từ `ZaloAccountAccess`.

#### Vì sao phải xử trước khi Sale dùng thật

Trên prod cron chạy 5 phút một lượt ⇒ độ trễ **tới 5 phút**. Nghe nhỏ, nhưng hình dạng của
nó rất xấu: **Sale mới vào ca mở hộp thư ra thấy TRỐNG, không một dòng chữ giải thích.**
Họ sẽ báo hỏng, và người trực sẽ đi truy đúng cái đã tốn của chúng ta cả buổi 17/09 —
`getZaloScope`, `zalo_account_access`, vai, cơ sở — trong khi chỉ cần đợi.

Trên `test` còn tệ hơn: cron **không chạy theo lịch** (`NỢ-5`) nên độ trễ là **vô hạn**,
phải có người bấm tay.

#### Ba cách xử — chờ chủ dự án chốt

**1 · Cấp quyền NGAY trong luồng mở màn, không chờ cron**
Trang `/zalo-crm` (Sata) gọi `capQuyenNickZalocrm` cho cơ sở của người đang mở, **không
chặn màn** (fire-and-forget hoặc timeout ngắn), có tiết chế (mỗi người tối đa 1 lượt/giờ).
· Được: **xoá hẳn khoảng trễ**, kể cả trên `test` nơi cron không chạy.
· Mất: thêm một lượt gọi mạng sang fork mỗi lần mở màn (đã tiết chế thì không đáng kể);
  và phải **fail-safe** — fork chết thì màn vẫn mở bình thường, tuyệt đối không để lượt
  gọi phụ này làm hỏng đường chính.
· Phạm vi: **chỉ bên Sata**, không build lại fork.

**2 · Giữ cron, nhưng NÓI RÕ trên màn**
Thay khung rỗng im lặng bằng *"Đang thiết lập quyền truy cập, thử lại sau ít phút"*.
· Được: người dùng biết chuyện gì đang xảy ra, không báo hỏng.
· Mất: **không xoá** khoảng trễ, chỉ giải thích nó. Và chữ nằm trong giao diện fork ⇒
  phải sửa fork ⇒ build lại + restart ⇒ **rủi ro rớt nick đang `connected`**.
· Phạm vi: bên fork.

**3 · Cả hai** — (1) xoá khoảng trễ ở đường thường, (2) là lưới hứng cho ca (1) hỏng.

Khuyến nghị: **(1) làm trước** vì nằm gọn bên Sata và xoá được vấn đề; **(2) gộp vào đợt
dựng org** (`NỢ-6`/`NỢ-8`) khi dù sao cũng phải restart fork.

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
