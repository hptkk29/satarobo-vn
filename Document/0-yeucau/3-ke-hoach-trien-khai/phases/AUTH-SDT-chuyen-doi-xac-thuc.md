# AUTH-SĐT — Kế hoạch chuyển mô hình xác thực Email → Số điện thoại (Zalo ZNS)

> Ngày lập: 28/07/2026 · Trạng thái: **DỰ THẢO — chờ chốt 6 câu ở §7**
> Phạm vi tài liệu này: **tầng xác thực**. Việc gửi ZNS xác nhận học phí tách thành **Nhánh B** (§6) vì nó KHÔNG phụ thuộc tầng auth.

---

## 0. Kết luận điều hành (đọc cái này là đủ)

**Việc này KHÔNG phải "đổi 1 dòng where-clause".** Khảo sát 13 hướng trên repo cho ra 3 kết luận chi phối toàn bộ kế hoạch:

1. **Có 2 lỗ hổng bảo mật ĐANG TỒN TẠI trên OTP, phải vá TRƯỚC khi động vào bất cứ thứ gì.** Hôm nay chúng vô hại vì target là email (không ai đoán được). Ngày SĐT thành target — thứ ai cũng đoán được, liệt kê được — chúng biến thành đường chiếm tài khoản và đường đốt tiền. Chi tiết §3.

2. **Dữ liệu SĐT hiện KHÔNG đủ tư cách làm khoá đăng nhập.** Repo có **6 hàm chuẩn hoá SĐT khác nhau + 3 chỗ viết tay**, cho ra **3 định dạng mâu thuẫn**, và **0 cột SĐT nào trong 5443 dòng schema có ràng buộc `@unique`**. Phải dọn trước, không dọn được thì migration đặt unique sẽ **fail giữa chừng trên PROD** (vì `deploy.yml:61` tự chạy `prisma migrate deploy` khi push main).

3. **ZNS không thể là đường đăng nhập DUY NHẤT.** Số không có Zalo → lỗi `-118`, tin mất vĩnh viễn; user tự tắt nhận tin OA (`-139/-141`) thì CSKH **không bật hộ được**; và Zalo **không có fallback SMS gốc**. Nếu bỏ email, một tỉ lệ phụ huynh sẽ bị khoá ngoài hệ thống không có đường vào.

**Khuyến nghị:** đi theo mô hình **"cộng thêm khoá SĐT, hạ email xuống kênh dự phòng vĩnh viễn"** — KHÔNG phải "thay email bằng SĐT". Hệ thống chấp nhận đăng nhập bằng **SĐT hoặc email**, mọi tài khoản mới cấp bằng SĐT, email chỉ còn là phao cứu sinh. Đây là cách duy nhất đạt được yêu cầu nghiệp vụ mà không tạo ra rủi ro "cả trung tâm không đăng nhập được".

**Đường găng không nằm ở code:** thủ tục ZBS (xác thực OA doanh nghiệp → ZCA → nạp tiền → duyệt mẫu **1–3 ngày làm việc mỗi lần**) phải khởi động **ngày 1, song song**, nếu không toàn bộ P4–P6 nằm chờ.

---

## 1. Hiện trạng đã verify (file:dòng có thật)

| Mảng | Hiện trạng | Nguồn |
|---|---|---|
| Khoá đăng nhập | `User.email String @unique` **NOT NULL**. User **KHÔNG có cột phone**. | `prisma/schema.prisma:708-773` (email :711) |
| Điểm quyết định danh tính | **Đúng 1 chỗ**: `db.user.findUnique({where:{email}})` | `lib/auth.ts:91-121` |
| Rate-limit login | `login:ip:` (10/60s) + `login:email:` (5/60s), break-glass `LOGIN_RATELIMIT_DISABLED=1` | `lib/auth.ts:98-106` |
| ⚠️ Phân biệt hoa/thường | Chỉ **key rate-limit** được `.toLowerCase()`; **where-clause dùng nguyên chuỗi user gõ** | `lib/auth.ts:100` vs `:109` |
| Hạ tầng OTP | **Đã có và dùng lại được nguyên vẹn**: `requestOtp/verifyOtp/consumeOtp`, HMAC-SHA256, TTL/cooldown/daily-limit đọc động từ `SystemSetting` | `lib/otp/service.ts` · `lib/settings/registry.ts:315-346` |
| Kênh OTP | `getPrimaryOtpProvider()` **hardcode `emailOtpProvider`**. `OTP_PRIMARY_PROVIDER="zalo"` trong `.env.example:110` **bị nuốt im lặng**. Enum `OtpChannel` chỉ `EMAIL\|SMS` | `lib/otp/provider.ts:11,66-77` · `schema:4103-4106` |
| Hạ tầng Zalo | `znsProvider` **production-ready**: tự refresh token, retry mã auth, `normalizePhone` 0→84 | `lib/zalo/provider.ts` · `lib/zalo/token.ts` |
| ⚠️ Bẫy SIMULATED | `ZALO_LIVE !== "true"` → trả `{ok:true, providerMessageId:"SIMULATED-…"}` **không gọi API** | `lib/zalo/provider.ts:102-105` |
| Luồng gần đích nhất | `/kich-hoat` (OTP + đặt mật khẩu + `accountStatus` PENDING→ACTIVE) — chỉ cần đổi target & kênh | `app/(auth)/kich-hoat/_actions.ts` |
| Luồng quên mật khẩu | **KHÔNG TỒN TẠI**. `OtpPurpose.RESET` đã khai nhưng **0 call-site** | `schema:4110` · `app/(auth)/` chỉ có `login/`, `kich-hoat/` |
| SĐT trong DB | 12 cột trên 11 model, **0 cột nào unique**. Phụ huynh tra gián tiếp qua `Student.parentPhone` (chỉ `@@index`) | `schema:1141,1220` · `lib/crm/dedupe.ts:42-59` |
| Chuẩn hoá SĐT | **6 helper + 3 inline → 3 dạng output khác nhau**, 2 dạng bị unit test khoá cứng đối nghịch nhau | `lib/lead/import.test.ts:31-35` (`0…`) vs `lib/crm/lead-qualify.test.ts:6-9` (`84…`) |
| Mặt test | Tập trung ở **3 helper** (`tests/e2e/_helpers/{seed,auth,fixtures}.ts`) — che cho 90 lần `seedUser`. Nhưng có **12 bản sao logic login** rải rác, trong đó **10 file `tests/manual/` không có job CI** | `tests/e2e/_helpers/auth.ts:21` · `smoke.spec.ts:56` |
| Deploy | `deploy.yml:60-64` tự chạy `prisma migrate deploy` lên PROD, **không có bước backfill riêng** | `.github/workflows/deploy.yml` |

**2 phụ thuộc email ẩn** dễ bị bỏ sót vì typecheck không bắt:
- `prisma/patch-rbac-staff.ts:97` — suy cơ sở nhân sự từ **đuôi email** `/\.cs([12])@/`
- `scripts/shadow-report.ts:70,82,115` — **raw SQL** `SELECT u.email`, chạy cron 01:00 hằng ngày

---

## 2. Sáu quyết định kiến trúc (khuyến nghị — chốt ở §7)

### QĐ-1 · Thêm `User.phone String? @unique` — **KHÔNG** dựng bảng `UserIdentity`

Ta chỉ cần **2 loại danh tính** (SĐT chính + email dự phòng) cho **~99 tài khoản**. Nới `User.email` thành `String? @unique` rồi thêm `User.phone String? @unique` cho **đúng năng lực đó** với ít máy móc hơn hẳn. Bảng `UserIdentity` chỉ đáng khi cần **nhiều identity cùng loại** hoặc **thêm loại mới thường xuyên** — chưa phải trường hợp này. Nếu sau này làm "Đăng nhập bằng Zalo" (OAuth), lúc đó mới tách bảng, và đó là việc của 1 PR riêng.

> Đánh đổi: nếu 6 tháng nữa thật sự cần đa-danh-tính thì phải refactor. Chấp nhận — chi phí refactor lúc đó nhỏ hơn chi phí duy trì 2 nguồn sự thật cho email suốt từ giờ.

### QĐ-2 · **Giữ mật khẩu**, không làm passwordless ở v1

Mỗi tin ZNS mẫu Xác thực = **300đ chưa VAT** ([bảng giá chính thức](https://zalo.solutions/zns/pricing)). Passwordless nghĩa là **mỗi lần đăng nhập là một lần trả tiền**, và biến ZNS thành điểm chết đơn của toàn hệ thống. OTP chỉ dùng ở 3 nơi tần suất thấp: **cấp tài khoản · quên mật khẩu · đổi SĐT**.

> Nếu sau 1 tháng số liệu thật từ `/admin/otp-logs` cho thấy tỉ lệ gửi thành công cao và chi phí chấp nhận được → mở passwordless cho **riêng phụ huynh** ở v2.

### QĐ-3 · Email **không bị bỏ** — hạ cấp thành kênh dự phòng vĩnh viễn

`User.email` chuyển `String? @unique` (nới NOT NULL, **giữ unique**, **không drop cột**). Lý do cứng: 4 điểm chết của ZNS nằm ngoài tầm kiểm soát — `-118` (số không có Zalo), `-139/-141` (user tự chặn OA), `-133` (khung cấm 22:00–06:00, **ngoại lệ cho OTP chưa có nguồn chính thức của Zalo**), và ZBS có thể **bị tạm ngưng tự động** nếu thông tin lệch ĐKKD quốc gia.

**Nguyên tắc bất di bất dịch: KHÔNG ai chỉ có 1 đường vào.** Nhân sự luôn có mật khẩu. Phụ huynh luôn có ít nhất 1 trong: mật khẩu đã đặt / email còn hiệu lực / mã tạm do admin cấp có audit.

### QĐ-4 · Canonical SĐT = `84XXXXXXXXX`, **một hàm duy nhất** `lib/phone.ts`

Chọn `84…` (không phải `+84…`, không phải `0…`) vì: (a) khớp thẳng payload ZNS nên không phải convert lúc gửi; (b) ký tự `+` bị Excel hiểu là công thức — repo import/export Excel rất nhiều; (c) 2/9 điểm chuẩn hoá hiện tại đã ra dạng này.

> ⚠️ **Thứ tự bắt buộc:** đổi đường GHI sang `84…` mà **chưa backfill** dữ liệu cũ (`0…`) sẽ **phá dedupe ngay ngày deploy** — `findRecentDuplicate` hết bắt trùng 90 ngày, tính năng **gộp con theo SĐT vừa ship ở `f39b94d` ngừng match lead cũ**, `findParentMatch` không tìm ra phụ huynh. Âm thầm, không test nào bắt. **Backfill phải nằm trong CÙNG deploy.**

### QĐ-5 · OTP qua Zalo đi **provider riêng**, `SIMULATED` = **FAILED** ở production

`lib/zalo/otp-provider.ts` gọi thẳng `znsProvider.send`, **không** đi qua `sendZaloNotification`. Ba lý do:
- `sendZaloNotification` cố tình **trả `ok:true` khi SKIPPED** (`lib/zalo/service.ts:67`) — đúng cho thông báo, **sai chết người** cho OTP.
- Nó **ghi nguyên `params` vào `ZaloMessageLog.payload`** (`:51`) → mã 6 số nằm **plain text** trong DB, phá nguyên tắc chỉ-lưu-HMAC.
- `znsProvider` trả `SIMULATED` khi chưa live → hệ thống báo "đã gửi mã", `OtpDeliveryLog` ghi `SENT`, người dùng bị khoá ngoài mà không ai biết.

**Luật cứng:** `!isLive() && NODE_ENV === "production"` → `{ok:false, error:"ZALO_NOT_LIVE"}`. Và chiều ngược lại: `NODE_ENV !== "production"` → **cấm gọi provider thật** (chống CI/Preview lỡ có `ZALO_LIVE` mà đốt tiền).

### QĐ-6 · Nội dung tin "cấp tài khoản" **không in SĐT ra chữ**

Quy định kiểm duyệt ZNS **cấm chèn số điện thoại và link vào nội dung tin** ([nguồn](https://zalo.solutions/business-message/guidelines/en/quy-dinh-chung-khi-kiem-duyet-mau-zbs-template-message)); mẫu Xác thực còn không cho nút CTA, không cho ảnh. Tin gửi **đến chính số đó** nên vẫn đủ nghĩa:

> *"Mã xác thực của bạn là `<otp>`. Tài khoản đăng nhập của quý phụ huynh chính là số điện thoại này. Mã có hiệu lực 5 phút."*

Đây là điểm **lệch với câu chữ yêu cầu** ("SĐT + mã gửi chung 1 tin") — cần anh xác nhận cách diễn đạt, vì mỗi lần mẫu bị từ chối là **mất 1–3 ngày làm việc**.

**Điểm sáng:** mẫu Xác thực là loại **DUY NHẤT được gửi cho người chưa từng tương tác với OA** — đúng thứ cần cho phụ huynh mới chưa follow OA Sata Robo.

---

## 3. P0 — Vá an toàn OTP · **CHẶN TRƯỚC MỌI THỨ** (2–3 ngày)

Sáu việc dưới đây **không đụng nghiệp vụ, không đụng schema**, nhưng nếu bỏ qua thì mọi phase sau đều xây trên nền thủng.

### 3.1 🔴 Lỗ hổng bypass mã OTP — `lib/otp/service.ts:163-172`

```ts
const otp = await db.otpRequest.findFirst({ where: { target, purpose, consumedAt: null }, ... });
if (!otp) return { ok: false, ... };
if (otp.verifiedAt) return { ok: true, otpId: otp.id, userId: otp.userId };  // ← :168
if (otp.expiresAt.getTime() < Date.now()) ...                                 // ← :170 KHÔNG BAO GIỜ CHẠY
const match = safeEqualHex(otp.codeHash, hashCode(code));                     // ← :177 KHÔNG BAO GIỜ CHẠY
```

Một OTP **đã verify nhưng chưa consume** trở thành **vé vào cửa vĩnh viễn**: mọi lần `verifyOtp` sau đó trả `ok` với **bất kỳ mã nào**, **bỏ qua cả hạn dùng**.

Hôm nay luồng `/kich-hoat` thoát nạn **do tình cờ** — nó chặn lại bằng `accountStatus !== "PENDING_ACTIVATION"` ở `_actions.ts:73`, không phải nhờ thiết kế. Luồng **quên mật khẩu** (P6) và **đổi SĐT** (P6) đi theo đúng mẫu 2 bước verify→consume tách rời sẽ **không có tấm chắn đó**.

**Vá:** gộp verify+consume vào một giao dịch, hoặc phát **token 1 lần có hạn riêng** cho bước 2 thay vì dựa vào `verifiedAt`.

### 3.2 🔴 Không có rate-limit nào trên đường OTP → đường đốt tiền

`requestActivationOtp` là **Server Action công khai** (chưa đăng nhập), **không import `rate-limit`**. Chặn duy nhất là cooldown DB theo `(target, purpose)`.

Phép tính: 1 IP quét danh sách SĐT → mỗi số PENDING cho **8 tin/purpose/ngày × 3 purpose = 24 tin × 300đ = 7.200đ/số/ngày**. 500 số = **3,6 triệu/ngày**, không có gì chặn. Toàn repo chỉ có **6 call-site `rateLimit`**, **không cái nào** trên đường OTP.

**Vá:** rate-limit theo IP + theo thiết bị trên `requestOtp`; **trần tin/ngày toàn hệ thống** kèm kill-switch tự động; cảnh báo khi vượt ngưỡng chi phí.

### 3.3 🟠 Upstash chưa cấu hình → rate-limit chạy bằng bộ nhớ trong tiến trình

`.env.example:121-125` để trống cả 4 biến `UPSTASH_*`/`KV_*`. Trên Vercel serverless **mỗi instance có bộ đếm riêng** → rate-limit gần như vô hiệu. Với email thì tạm chấp nhận được; với SĐT (dễ đoán hơn email rất nhiều) thì đây là **cửa brute-force mật khẩu**.

**Vá:** Upstash thành **điều kiện bắt buộc** trước khi bật SĐT làm khoá, không phải tuỳ chọn fail-soft.

### 3.4 🟠 Liệt kê tài khoản (account enumeration)

`kich-hoat/_actions.ts:29-35` trả **2 thông điệp khác nhau**: *"Tài khoản đã kích hoạt…"* cho user ACTIVE, `{ok:true}` im lặng cho số không tồn tại.

Với email đây là oracle vô hại. Với SĐT — **không gian liệt kê được** — nó cho phép thu hoạch danh sách *"số nào là phụ huynh Sata Robo"*: vừa là danh sách khách hàng có giá trị thương mại, vừa là dữ liệu cá nhân theo Nghị định 13/2023.

**Vá:** đồng nhất phản hồi **và** đồng nhất thời gian phản hồi cho mọi nhánh.

### 3.5 🟠 Gửi thất bại vẫn đốt cooldown + hạn mức ngày

`OtpRequest` được **tạo trước khi gửi** (`:105`), còn cooldown (`:77-91`) và daily-limit (`:94-99`) **đếm mọi bản ghi bất kể gửi thành công hay không**. Với email (tỉ lệ gửi ổn định) thì vô hại. Với ZNS có `-118/-139/-147`/quota thì **mỗi lần thất bại vẫn trừ 1 trong 8 lượt/ngày và khoá 60s** — phụ huynh bị chặn resend **đúng lúc cần resend nhất**.

**Vá:** chỉ tính bản ghi gửi thành công, hoặc tách bộ đếm.

### 3.6 🟠 Login không kiểm `accountStatus`

`lib/auth.ts:120-125` chỉ chặn `!password || deletedAt || !isActive`. Tài khoản `PENDING_ACTIVATION`/`DISABLED` hiện bị chặn **tình cờ** vì `password = null`. Hàng rào đó biến mất ngay khi có bất kỳ đường đăng nhập nào không dựa vào mật khẩu.

**Vá:** thêm `accountStatus` vào `select` + guard.

### 3.7 Kèm theo trong cùng PR

- **Siết `maskPhone`** (`lib/utils.ts:16-20`): hiện giữ 3 đầu + 3 cuối → lộ **6/10 chữ số** (chỉ còn 10.000 tổ hợp). Khi SĐT thành username, "đã mask" trở thành hình thức. Đưa về mẫu 2+2 như `maskValue` của audit (`lib/audit/audit-log.ts:60-67`).
- **Mở rộng `PII_KEY_RE`** (`lib/audit/audit-log.ts:58`): hiện khớp `phone|sdt|mobile|email|tel` — **không khớp** `identifier`/`target`/`username` là những tên field sắp sinh ra.
- **Cron dọn `OtpRequest`/`OtpDeliveryLog`** (giữ 90 ngày): hiện **15 cron, không có cái nào dọn**; đây là bảng ghi lại mọi lần một SĐT chạm hệ thống, không có chính sách lưu trữ.

**DoD P0:** `pnpm typecheck && lint && build` PASS · `lib/otp/service.test.ts` (file này **hiện chưa tồn tại**) phủ được: OTP đã verify chưa consume **không** cho qua với mã sai · rate-limit IP chặn ở lần thứ N · gửi fail không trừ hạn mức.

---

## 4. Lộ trình

> **P0′ chạy song song từ ngày 1** — đây là đường găng, không rút ngắn được bằng code.

### P0′ · Thủ tục ZBS/ZNS (hành chính, **không phải việc code**)

- Xác thực OA Sata Robo **loại doanh nghiệp** → tạo App + ZCA → liên kết OA–ZCA → **nạp tiền trả trước**. Cần **GPKD + MST** Công ty CP Công nghệ Giáo dục Sata Robo.
- Nộp duyệt **3 mẫu tin** (1–3 ngày làm việc mỗi lần, bị từ chối là làm lại): ① Xác thực (OTP) · ② Cấp tài khoản · ③ Xác nhận đã thu học phí.
- **Gửi `support@zalo.cloud` hỏi 4 điểm không có nguồn công khai** — 4 điểm này ảnh hưởng trực tiếp tới thiết kế, **không được suy đoán**:
  1. Tin OTP có được **miễn khung cấm 22:00–06:00** (mã `-133`) không? *(Nếu không → không đăng nhập được ban đêm.)*
  2. **Rate limit req/s** của API gửi ZNS? *(Không biết trần thì không thiết kế được retry/burst giờ cao điểm.)*
  3. Tần suất gửi tối đa/số — **nút "Gửi lại mã" có vi phạm** quy định "mỗi sự kiện 1 tin/người nhận" không?
  4. **Tin thất bại có bị tính phí** không?
- Xin **báo giá SMS brandname dự phòng** từ ≥2 nhà cung cấp (eSMS, VietGuys/Infobip). Zalo **không có fallback SMS gốc**; chi phí/độ trễ fallback không có nguồn public nào.
- Đặt env Vercel: `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_OA_REFRESH_TOKEN`. **Chưa bật `ZALO_LIVE`.**

**DoD:** có 3 `template_id` đã duyệt trong tay + ZCA có số dư + **văn bản trả lời 4 câu hỏi**. Verify bằng: gửi thử ở *development mode* tới SĐT admin OA, thấy tin thật về máy. *(Development mode **chỉ gửi được cho admin OA** — mã `-127`; không test được với SĐT phụ huynh thật trước khi mẫu được duyệt.)*

---

### P1 · Canonical SĐT + đo dữ liệu + backfill *(không đụng auth)*

- **Tạo `lib/phone.ts`** (chưa tồn tại): `canonicalPhone(raw) → "84XXXXXXXXX" | null` · `formatPhoneVN(canonical) → "0XXXXXXXXX"` · `isValidPhoneVN()`. Xử lý: bỏ `[\s.\-()]`, `+84→84`, `0084→84`, `+840…→84`, `0XXXXXXXXX→84…`, 9 chữ số mất số 0 đầu (Excel) `→84…`, chặn đầu số ngoài `3/5/7/8/9`.
- **Gộp 6 helper + 3 chỗ inline + 5 bản regex `PHONE_VN` về đây.** Validator đổi sang `.transform(canonicalPhone)` — **chuẩn hoá** chứ không chỉ chấp nhận.
- **Sửa 2 test đang khoá cứng 2 dạng đối nghịch** (`lib/lead/import.test.ts:31-35`, `lib/crm/lead-qualify.test.ts:6-9`).
- **Vá lỗi đang mất lead thật:** client gửi SĐT có khoảng trắng → server chặn 400 → **nuốt lỗi im lặng** (`components/legacy-laptrinhrobot/_utils/tracking.ts:104,123-129` · `components/khoa-hoc/consult-modal.tsx:67,94`). Sau khi SĐT thành khoá đăng nhập, cùng lỗi này thành *"phụ huynh không tạo được tài khoản"* mà không ai biết.
- **`scripts/phone-audit.ts` (CHỈ ĐỌC)** chạy trên **PROD**: đếm số bản ghi lệch dạng + **số nhóm trùng sau canonical** trên `Lead.phone`, `Student.parentPhone/parent2Phone`, `Employee.phone`, `Order.customerPhone`; liệt kê cặp *"1 SĐT → nhiều User"*; đếm `ConvertConflict status=OPEN`.
- **Backfill trong CÙNG deploy** (xem cảnh báo QĐ-4): `Lead.phone`, `Student.parentPhone/parent2Phone/phone`, `Employee.phone`. **Không backfill** `Order.customerPhone`/`VoucherRedemption.customerPhone` (snapshot hoá đơn, cố ý giữ lịch sử) và các cột log.

**DoD:** grep toàn repo còn **đúng 1** định nghĩa `normalizePhone` và **1** regex `PHONE_VN` · `lib/phone.test.ts` xanh (phủ case `"+84 0905 123 456"` hiện đang cho ra `"00905123456"` sai) · **báo cáo phone-audit trên PROD có số liệu thật, không phải ước lượng** · dedupe lead vẫn bắt trùng sau backfill.

**Rollback:** revert PR — chưa migration, chưa đụng auth.

---

### P2 · Lưới test + chốt cửa test OTP

- **Viết `lib/otp/service.test.ts`** — `lib/otp` hiện có **0 file test**. Pattern mock copy từ `lib/zalo/token.test.ts:7-25`.
- **Chốt cơ chế cửa test cho OTP TRƯỚC khi viết helper login** (nếu chốt sau sẽ phải làm helper 2 lần): `codeHash` là HMAC một chiều (`schema:4120`) nên e2e không đọc ngược được mã. Đề xuất `OTP_TEST_FIXED_CODE` — chỉ hoạt động khi `NODE_ENV !== "production"`, và **production khởi động mà thấy biến này thì THROW**.
- **Gộp 12 bản sao logic login** về `tests/e2e/_helpers/auth.ts` (10 file `tests/manual/*` + `teacher-site-pii.spec.ts`). Giữ nguyên pattern `toPass()` chống **hydration-wipe của form Waves**.
- **`seedUser` giữ nguyên field `email`**, tự sinh `phone` duy nhất bên trong helper → **90 call-site không phải sửa dòng nào**.
- Chạy tay **39 spec không có job CI** (`test:e2e:r1..r6` + `:crm`) lấy **đường cơ sở xanh** trước khi đụng identity.

---

### P3 · `User.phone` + login nhận **cả SĐT lẫn email**

- **Migration additive:** `User.phone String? @unique` + `User.phoneVerifiedAt DateTime?` + `@@index([phone])`; `User.email String @unique` → `String? @unique` (DROP NOT NULL, **giữ unique**). **Không backfill trong migration** → unique index trên toàn NULL **không thể fail trên PROD**.
- **Migration riêng:** `ALTER TYPE "OtpChannel" ADD VALUE 'ZALO'` — Postgres bắt buộc tách transaction. Repo đã có tiền lệ đúng luật tại `prisma/migrations/20260516153636_add_adjustment_enum_values/`.
- `lib/validators/auth.ts:3-6`: `email` → `identifier` (là email hợp lệ **HOẶC** canonical hoá được).
- `lib/auth.ts:91-121`: `findUnique({where:{email}})` → `findFirst` với `OR`.
  > ⚠️ **Bẫy chết người:** chỉ thêm mệnh đề `phone` **khi `canonical !== null`**. Nếu user nhập email thì `canonical` trả `null`, mệnh đề thành `{phone: null}` → Prisma dịch ra `phone IS NULL` → **khớp toàn bộ user**, `findFirst` trả về một user ngẫu nhiên.
- Rate-limit key `login:email:` → `login:id:<canonical hoặc email lower>` — **chuẩn hoá trước khi làm key**, nếu không `0818…` và `84818…` là 2 key khác nhau = bypass.
- Thêm `phone` vào **4 chỗ**: `declare module` + `authorize` + `jwt` + `session`.
- **Sweep fallback tên actor** (28 call-site mẫu `name ?? email ?? "Unknown"`): đổi sang `name ?? phone ?? userId`. **Không dùng SĐT cho `actorName`** — `lib/audit/audit-log.ts:256-271` trả `actorName` **nguyên bản không mask** cho mọi người đọc audit.
- `login-form.tsx`: label *"Số điện thoại hoặc Email"*, `inputMode="tel"`, `autoComplete="username"`. Thông báo lỗi đổi thành *"Thông tin đăng nhập hoặc mật khẩu không đúng"*.
- **Khai báo rõ 1 thay đổi hành vi:** login hiện **phân biệt hoa/thường ở email** (`lib/auth.ts:109` dùng nguyên chuỗi). Chuẩn hoá về lowercase là **thay đổi ngữ nghĩa thật** — phải đo `SELECT lower(email), count(*) … HAVING count(*)>1` trên PROD trước.

**DoD:** tài khoản cũ đăng nhập bằng email **vẫn vào được y hệt** · tài khoản test set phone thủ công đăng nhập bằng SĐT vào được · `0905…` và `84905…` cùng một bucket cooldown · 7 job CI xanh + 39 spec chạy tay không hồi quy.

> ❌ **Đừng trông cậy vào typecheck ở phase này.** Có một niềm tin sai phổ biến rằng "nới `email` thành nullable sẽ làm vỡ typecheck các `findUnique({where:{email}})`". **Không.** Prisma giữ nguyên trường nullable-unique trong `WhereUniqueInput` — bằng chứng: `User.employeeId String? @unique` (`schema:738`) vẫn sinh ra `employeeId?: string`. Typecheck sẽ **PASS và không cảnh báo gì**. Phải kiểm bằng grep + test dữ liệu.

**Rollback:** revert code — migration additive, email còn nguyên dữ liệu, mọi tài khoản cũ login như cũ. **Đây chính là lý do không backfill ở bước này.**

---

### P4 · Kênh ZALO cho OTP + khả năng quan sát

- **`lib/zalo/otp-provider.ts`** theo QĐ-5. Map `-118/-119/-139/-141/-133/-147` thành error code riêng để tầng trên hiển thị đúng.
- `getPrimaryOtpProvider()` chọn **theo loại target** (SĐT → zalo, email → resend), không theo env. Sửa `.env.example:110` và `docs/otp-service.md:17-20` (cả hai đang mô tả **sai** so với code).
- **Fallback có điều kiện:** ZNS fail + user **có email đã verify** → thử email, ghi `OtpDeliveryLog` thứ 2 (mô hình 2 delivery/1 request **đã hỗ trợ sẵn**, `schema:4137-4155`). Không có email → trả `deliveryFailed=true`, **không giả vờ thành công**.
- Template id đọc từ `SystemSetting` (`zalo.znsTemplateOtp`) chứ không chỉ env — **để đổi template không cần deploy** khi Zalo bắt sửa mẫu.
- **Dựng `/admin/otp-logs`** — hiện có **0 UI nào đọc `OtpRequest`/`OtpDeliveryLog`**. Không có màn này thì sau khi chuyển sang Zalo, nhân viên **mất hoàn toàn** khả năng trả lời *"phụ huynh báo không nhận được mã"*. Nhớ thêm segment vào `ADMIN_ROUTE_SEGMENTS` (`lib/auth/route-policy.ts`) **+ test** — gotcha đã biết của dự án.
- **Giám sát (bắt buộc, không hoãn):** bộ SLO hiện có **4 metric, 0 cái cho Zalo/OTP** (`lib/observability/slo.ts:10-15`). Thêm: tỉ lệ gửi OTP thành công · tỉ lệ `-118/-139` · quota ZNS còn lại (Zalo **có API** tra quota) · chi phí/ngày.
- **Vá đua refresh token:** `lib/zalo/token.ts:84-105` — `refresh_token` **xoay vòng mỗi lần refresh**, không có khoá chống đua, thất bại **chỉ `console.warn`**. Nếu ghi DB lỗi sau khi Zalo đã xoay → token trong DB thành rác, **OA chết vĩnh viễn**, phải OAuth lại thủ công. Cần lock + cảnh báo + runbook khôi phục viết sẵn.
- **Cờ break-glass** `AUTH_ZNS_DEGRADED`: khi ZBS chết hàng loạt, tạm mở lại đường email/mật khẩu **có kiểm soát + audit**. Cờ break-glass duy nhất hiện nay của tầng auth là tắt rate-limit login.

---

### P5 · Cấp tài khoản + kích hoạt bằng SĐT — **1 tin ZNS**

*(Đây là phần đáp đúng yêu cầu gốc.)*

- **Điều kiện vào phase:** đã dọn trùng SĐT theo báo cáo P1 + **đóng hết `ConvertConflict status=OPEN`**.
- `app/(admin)/admin/students/_actions.ts:925-1025`: `parentAccountSchema` đổi email bắt buộc → **phone bắt buộc**, email tuỳ chọn; kiểm trùng theo phone; `requestOtp({target: phone})`.
  > Tin tốt: `scopedDb` **không** scope model `User` → kiểm trùng SĐT không bị mù chéo cơ sở.
- `app/(auth)/kich-hoat/`: `emailSchema` → `phoneSchema`; `emailVerified` → `phoneVerifiedAt`; form đổi `type="tel"`, label *"Số điện thoại phụ huynh"*, *"Mã OTP (6 số gửi qua Zalo)"*.
  > ⚠️ **Bẫy dễ sót:** dòng `:85` `enqueueAccountActivated({ to: email })` — khi target thành SĐT, chuỗi `84…` sẽ bị đẩy vào `EmailQueue.toEmail` rồi worker gửi Resend → rác hàng đợi + lỗi lặp mỗi lần có người kích hoạt. **Typecheck không bắt** (kiểu vẫn là `string`). Cùng lỗi ở `lib/crm/_handlers/lead-converted.ts:23-26`.
- **Convert lead:** `lib/crm/convert-lead-v2.ts` + `app/(admin)/admin/leads/[id]/convert/actions.ts` — gỡ ràng buộc `.email()` bắt buộc ở **cả 3 tầng type → zod → form**; sót 1 tầng là lỗi runtime mà typecheck không bắt. Xử lý luôn đường legacy `convert-lead.ts` (dùng khi `CONVERT_V2_ENABLED=false`) hoặc khai tử nó.
- `lib/crm/dedupe.ts:42-59`: `findParentMatch` tra `User.phone` **trực tiếp** thay vì đi vòng qua `Student.parentPhone`. Đổi nghĩa `ConvertConflict` thành *"trùng SĐT giữa 2 hồ sơ"*.
- **Backfill `User.phone`** (script riêng, **không nhét vào migration**), chạy theo lô, log case trùng để xử lý tay. Nhân sự chưa có SĐT → để `null`, **họ vẫn đăng nhập bằng email**.
  > ⚠️ Nguồn `Employee.phone` là **chuỗi tự do không validate** (`lib/validators/employee.ts:83`) → phải bắt buộc + chuẩn hoá ở form/import nhân sự **trước** khi backfill, nếu không sẽ đưa rác vào cột định danh.

**DoD:** cấp tài khoản cho 1 học viên thật → phụ huynh nhận **đúng 1 tin ZNS** trên máy → vào `hocvien.satarobo.vn`, nhập SĐT + mã, đặt mật khẩu, đăng nhập thành công. Convert 1 lead **không có email** → tạo được tài khoản.

**Rollback:** cờ `AUTH_PHONE_PROVISIONING=false` → 3 luồng cấp tài khoản quay lại nhánh email cũ.

---

### P6 · Quên mật khẩu + đổi SĐT có kiểm soát

- **Dựng `/quen-mat-khau`** dùng `OtpPurpose.RESET` — enum đã khai nhưng **0 call-site**, đây là chỗ trống sạch. Sau khi đặt mật khẩu mới: **`tokenVersion++`** để ép logout mọi thiết bị. Cơ chế đã có sẵn (`lib/auth/live-session.ts:16-26`), mẫu có sẵn ở `admin/users/_actions.ts:454-498` — **chỉ thiếu 1 dòng ở luồng mới**. Không làm thì phiên cũ sống tới **30 ngày** (JWT mặc định, `lib/auth.ts:60` không đặt `maxAge`).
- **Khoá đường đổi SĐT tự do:** `app/(portal)/portal/ho-so/actions.ts:113-121` hiện cho phụ huynh sửa SĐT `max(20)` không chuẩn hoá và **ghi đè xuống TẤT CẢ Student của họ**.
  > Đính chính một hiểu lầm dễ mắc: màn này **chỉ sửa `Student.parentPhone`**, *không* chạm `User`. Rủi ro thật **không phải** "tự đổi định danh" mà là **lệch dữ liệu** — sau P5, `User.phone` và `Student.parentPhone` trôi khác nhau, kéo theo sai luồng gộp anh chị em (`students/_actions.ts:1000-1006`) và **sai người nhận ZNS điểm danh** (`lib/notify/attendance.ts:60`). Vá đúng = chuyển sang `CHANGE_CONTACT` + đồng bộ 1 nguồn.
- **Đường cứu hộ có kiểm soát:** nút *"Cấp mã kích hoạt tạm"* cho nhân viên (hiện 1 lần trên màn hình, đọc qua điện thoại), **bắt buộc nhập lý do + ghi audit** — dùng khi ZNS chết. Thay cho câu hướng dẫn cũ *"xem mã trong Email logs"* (`students/_actions.ts:1056`) sắp mất tác dụng.
- **Xử lý 3 mã lỗi ZNS thành UX rõ ràng:** `-118` (số chưa có Zalo) · `-139/-141` (user tắt nhận tin) → màn báo cụ thể + đường thoát, **không** báo lỗi chung chung.
- **Vá 2 phụ thuộc email ẩn:** `prisma/patch-rbac-staff.ts:97` (suy cơ sở từ đuôi email — script có `--apply` chạy trên PROD) và `scripts/shadow-report.ts:70,82,115` (raw SQL, cron 01:00, **typecheck không bắt được**).

---

### P7 · *(Có điều kiện)* Đo & quyết định về email

**Không đặt lịch cho phase này.** Điều kiện vào: ≥95% user có `phoneVerifiedAt != null` · tỉ lệ gửi ZNS thành công đo được trên `/admin/otp-logs` đạt ngưỡng BGĐ chốt · 100% nhân sự có kênh dự phòng.

Theo QĐ-3, **khuyến nghị là không bao giờ drop email** — chỉ giữ nullable làm phao. Nếu vẫn muốn tiến xa hơn thì đây là lúc đặt lại câu hỏi, với số liệu thật trong tay.

---

## 5. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| **Duyệt mẫu ZNS là đường găng ngoài tầm kiểm soát** — 1–3 ngày làm việc/lần, từ chối là làm lại | P0′ chạy từ ngày 1, song song. Soạn sẵn 2 phương án nội dung. P0–P3 **không phụ thuộc Zalo** nên vẫn tạo giá trị nếu duyệt trễ |
| **`-118`/`-139`/`-141` → mã không bao giờ tới, Zalo không có fallback SMS gốc** | Đây chính là lý do QĐ-3 giữ email vĩnh viễn. Song song xin báo giá SMS brandname ở P0′ |
| **Migration `@unique` fail giữa chừng trên PROD** (deploy.yml tự chạy khi push main) | P3 tạo `phone` **nullable, không backfill** → unique trên toàn NULL không thể fail. Backfill là script riêng chạy tay ở P5, sau khi phone-audit cho số liệu thật |
| **Đổi canonical mà chưa backfill → phá dedupe âm thầm** | Backfill **cùng deploy** với đổi đường ghi (QĐ-4). DoD P1 có bước xác nhận dedupe vẫn bắt trùng |
| **Report từ tin marketing kéo tụt quota kênh OTP** (report >2% quota ngày → tụt 1 bậc) | Kỷ luật: OA này **chỉ gửi Tag 1 (giao dịch)**, không gửi marketing. Cân nhắc tách OA |
| **ZBS bị tạm ngưng tự động** nếu thông tin lệch ĐKKD quốc gia → toàn bộ phụ huynh mất đường vào cùng lúc | Cờ break-glass `AUTH_ZNS_DEGRADED` (P4) + email/mật khẩu luôn còn |
| **CI/Preview lỡ có `ZALO_LIVE` → e2e gửi tin thật, đốt tiền** | Khẳng định cứng trong code: `NODE_ENV !== "production"` → cấm gọi provider thật; kèm kiểm tra trong CI |
| **10 file `tests/manual/` không có job CI** → hỏng âm thầm đúng lúc cần kiểm thử tay | P2 gộp 12 bản sao về 1 helper **trước** khi đổi login (diff từ 12 file xuống 1) |
| **Hydration-wipe của form Waves** — validation chặn, `signIn` không bao giờ bắn, **fail câm** | Giữ pattern `toPass()`; thêm e2e khẳng định submit ngay sau load vẫn gửi được request |

---

## 6. Nhánh B — ZNS xác nhận đóng học phí *(độc lập, ship được sớm)*

**Không đụng tầng auth**, chỉ chờ P0′ (mẫu đã duyệt) + P1 (canonical). Có thể ship trong **1 tuần** sau khi có template.

Điểm móc đã có sẵn và **sạch**: `publishEvent("payment.confirmed", …)` phát **trong transaction** kèm `dedupeKey`, payload có sẵn `amount` + `receiptCode` (`lib/finance/payment.ts:403-414`). Thêm handler mới = **thêm 1 dòng** vào `lib/events/register.ts`; dispatcher dùng `Promise.allSettled` nên không ảnh hưởng handler Notification đang chạy.

**Ba cảnh báo cho người làm nhánh này:**

1. **Đừng coi outbox là "hàng đợi có retry" đáng tin.** Thực tế: retry lại **toàn bộ** handler của event (mọi handler khác **phải idempotent**); **không có backoff** (cron mỗi phút, `maxAttempts` 5) → sự cố ZNS quá ~5 phút là event **FAILED vĩnh viễn**, không có UI/cron nào re-drive.
2. **Đừng dedupe bằng `ZaloMessageLog`.** `sendZaloNotification` **ghi log cả khi FAILED** → lần hỏng đầu tiên đã tạo bản ghi mang khoá, lần retry thấy "đã có" và **bỏ qua** — tức chính cơ chế retry sẽ không bao giờ gửi lại được. Dedupe theo trạng thái `SENT`, không theo sự tồn tại của bản ghi.
3. **Hai lỗ nghiệp vụ đã biết:** `confirmPayment` **chặn** nếu khoản chưa gắn `enrollmentId` (`:359-361`) → **lần đóng tiền đầu tiên trước convert sẽ không có tin nào**. Và `adjustPayment`/`refundPayment` **không publish event** → phụ huynh nhận tin *"đã thu X"* nhưng **không nhận tin khi khoản bị điều chỉnh/hoàn**.

Đồng thời cần rà **2 call-site Zalo đang chạy production** (`lib/notify/attendance.ts:86`, `app/api/cron/debt-reminder/route.ts:114`) — cả hai **nuốt lỗi bằng `.catch(() => {})`** và không kiểm consent. Sau khi bật `ZALO_LIVE=true` chúng bắt đầu gửi thật, im lặng khi lỗi, và **chính là nguồn report có thể kéo tụt bậc chất lượng OA** — tức làm hỏng luôn hạ tầng đăng nhập.

> Ghi thêm: khoá gộp thông báo điểm danh hiện là `email ?? phone:<số>` (`lib/notify/attendance.ts:57-66`) — **email đứng trước**. Khi email thành nullable, khoá gộp **đổi âm thầm**: phụ huynh 2 con trước nhận 1 tin, sau có thể nhận 2 tin (**nhân đôi chi phí**) hoặc gộp nhầm 2 hộ trùng số.

---

## 7. Quyết định

### ✅ Đã chốt (28/07/2026)

| # | Quyết định | Hệ quả lên kế hoạch |
|---|---|---|
| **QĐ-A** | **1 SĐT = 1 tài khoản = 1 hộ.** Bố và mẹ dùng chung 1 số → chung 1 tài khoản, nhìn thấy tất cả các con. | `User.phone @unique` khả thi → kế hoạch chạy đúng như đã viết. *Đây cũng là hành vi hệ thống đang có (`students/_actions.ts:999-1011`).* **Bổ sung bắt buộc ở P5:** import lead hiện gộp **cả khi tên phụ huynh khác nhau** (`import/leads/route.ts:143-145,208-218`) — phải thêm **cảnh báo bắt buộc xác nhận** khi gộp 2 tên khác nhau, tránh 2 hộ lạ nhìn thấy con của nhau. |
| **QĐ-B** | **Chưa làm đa-phụ-huynh.** Mỗi học viên 1 người đại diện (`Student.parentUserId` giữ nguyên 1-1). | **Không** dựng `StudentGuardian` → tiết kiệm 1 phase. `parent2Name/parent2Phone` vẫn chỉ là thông tin liên lạc, không sinh tài khoản. **Ghi nợ:** nếu sau này cần tách, phải làm **trước khi** có nhiều dữ liệu thật gắn `parentUserId`. |
| **QĐ-C** | **Nhân sự giữ email + mật khẩu.** Chỉ phụ huynh dùng SĐT. | `User.phone` của staff để `null` — hợp lệ vì cột nullable. **Không cần** chiến dịch thu SĐT nhân sự, **không cần** siết validate `Employee.phone` trước backfill (§P5 bỏ được bước này). Câu "nhân viên có con học tại trung tâm" **hết chặn** ở v1: staff vẫn vào bằng email, `route-policy.ts:251-254` giữ nguyên. |
| **QĐ-D** | **P0 (vá bảo mật OTP) làm ngay, PR riêng.** | Tách khỏi mọi thứ còn lại. Không phụ thuộc ZBS, không phụ thuộc câu trả lời nào. Bắt đầu được ngay hôm nay. |

> QĐ-C **giảm rủi ro đáng kể**: kịch bản tệ nhất của cả kế hoạch — *"ZBS chết → cả trung tâm không đăng nhập được"* — không còn xảy ra, vì toàn bộ nhân sự vận hành không đi qua Zalo. Phạm vi ảnh hưởng của sự cố ZNS thu hẹp về **riêng cổng phụ huynh**.

### ⏳ Còn mở (không chặn P0–P2)

5. **Ngân sách ZNS.** 300đ/tin chưa VAT cho mã xác thực, 200đ/tin cho xác nhận học phí. Có duyệt không? Và có duyệt **ký thêm SMS brandname dự phòng** (chưa có báo giá) không?
   > Chặn: **P0′** (nạp tiền ZCA) và **P4**.

6. **Cách diễn đạt tin "cấp tài khoản".** Quy định ZNS **cấm chèn số điện thoại vào nội dung tin**. Chấp nhận *"Tài khoản đăng nhập chính là số điện thoại này + mã `<otp>`"* (không in số ra chữ) chứ ạ?
   > Chặn: **P0′** (nộp mẫu duyệt). Cần chốt sớm vì mỗi lần từ chối mất 1–3 ngày làm việc.

**Câu hỏi phụ nên chuẩn bị sẵn câu trả lời:** phụ huynh bấm gửi lại mã 10 lần thì ai trả tiền? · ông bà đưa đón có xem được lịch học không? · phụ huynh đổi số **và đã mất số cũ** thì lấy lại tài khoản kiểu gì?

---

## 8. Ba con số cần đo trước khi cam kết bất cứ mốc nào

Toàn bộ kế hoạch trên có **3 ẩn số chưa đo được từ code** — phải có số liệu thật trước khi chốt lịch:

1. **Số nhóm SĐT trùng trên PROD** sau canonical (chạy `scripts/phone-audit.ts` ở P1). DEV đã có ít nhất **1 SĐT trỏ 2 User phụ huynh khác nhau**. Con số PROD quyết định P5 mất mấy ngày dọn tay.
2. **Tỉ lệ phụ huynh có Zalo hoạt động.** Không đo được cho tới khi gửi thật. Đây là con số quyết định **có bắt buộc ký SMS brandname hay không**.
3. ~~Bao nhiêu tài khoản nhân sự không có SĐT~~ — **đã hết ý nghĩa sau QĐ-C**: nhân sự giữ email + mật khẩu, `User.phone` để `null`. *(Số liệu tham khảo: DEV có 24/53 tài khoản staff không có SĐT ở bất kỳ đâu — chính con số này biện minh cho QĐ-C.)*

Thay vào đó, con số thứ 3 cần đo là: **bao nhiêu nhóm "cùng SĐT nhưng khác tên phụ huynh"** trong dữ liệu lead/học viên. QĐ-A chốt *1 SĐT = 1 hộ*, nên mỗi nhóm như vậy là một **cặp gia đình sẽ nhìn thấy con của nhau** nếu gộp nhầm. Báo cáo `phone-audit` (P1) phải liệt kê riêng nhóm này để duyệt tay.
