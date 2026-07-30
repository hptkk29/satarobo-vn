# AUTH-SĐT — Kế hoạch chuyển mô hình xác thực Email → Số điện thoại (Zalo ZNS)

| | | | | | |
|---|---|---|---|---|---|
| **Phase** | AUTH-SĐT | **Ưu tiên** | P0 (mục §3) | **Ước lượng** | P0 2–3 ngày · P1–P6 chưa chốt (phụ thuộc §7) |
| **Phụ thuộc** | A0-05 (login chung, DONE) · R2-04 (activation OTP, DONE) | **Feature flag** | `AUTH_PHONE_PROVISIONING` · `AUTH_ZNS_DEGRADED` | **Trạng thái** | 🟡 DỰ THẢO — đã verify code 29/07, chờ chốt §7 |
| **Nguồn** | Doc 15 **Q9** (`parent (phone/email) → hocvien`) · Q13 (OTP provider abstraction) | **Test ID** | `[AUTH-SDT-<task>-C<n>]` | **Liên quan** | R2-05 Duplicate phone UX |

> Ngày lập: 28/07/2026 · Verify lại toàn bộ file:dòng 29/07/2026.
> Phạm vi tài liệu này: **tầng xác thực**. Việc gửi ZNS xác nhận học phí tách thành **Nhánh B** (§6) vì nó KHÔNG phụ thuộc tầng auth.

---

## 0. Kết luận điều hành (đọc cái này là đủ)

**Việc này KHÔNG phải "đổi 1 dòng where-clause".** Khảo sát 13 hướng trên repo cho ra 3 kết luận chi phối toàn bộ kế hoạch:

1. **Có 2 lỗ hổng bảo mật ĐANG TỒN TẠI trên OTP, phải vá TRƯỚC khi động vào bất cứ thứ gì.** Hôm nay chúng vô hại vì target là email (không ai đoán được). Ngày SĐT thành target — thứ ai cũng đoán được, liệt kê được — chúng biến thành đường chiếm tài khoản và đường đốt tiền. Chi tiết §3.

2. **Dữ liệu SĐT hiện KHÔNG đủ tư cách làm khoá đăng nhập.** Repo có **6 hàm chuẩn hoá SĐT khác nhau + 3 chỗ viết tay**, cho ra **3 định dạng mâu thuẫn**, và **0 cột SĐT nào trong 5443 dòng schema có ràng buộc `@unique`**. Phải dọn trước, không dọn được thì migration đặt unique sẽ **fail giữa chừng trên PROD** (vì `deploy.yml:61` tự chạy `prisma migrate deploy` khi push main).

3. **ZNS không thể là đường đăng nhập DUY NHẤT.** Số không có Zalo → lỗi `-118`, tin mất vĩnh viễn; user tự tắt nhận tin OA (`-139/-141`) thì CSKH **không bật hộ được**; và Zalo **không có fallback SMS gốc**. Nếu bỏ email, một tỉ lệ phụ huynh sẽ bị khoá ngoài hệ thống không có đường vào.

**Khuyến nghị:** đi theo mô hình **"cộng thêm khoá SĐT, hạ email xuống kênh dự phòng vĩnh viễn"** — KHÔNG phải "thay email bằng SĐT". Hệ thống chấp nhận đăng nhập bằng **SĐT hoặc email**, mọi tài khoản mới cấp bằng SĐT, email chỉ còn là phao cứu sinh. Đây là cách duy nhất đạt được yêu cầu nghiệp vụ mà không tạo ra rủi ro "cả trung tâm không đăng nhập được".

> ✅ **Khuyến nghị này KHÔNG chệch blueprint — nó chính là điều Doc 15 đã chốt.** Doc 15 §1 **Q9** ghi nguyên văn: *"parent (**phone/email**) → hocvien"*. Tức "đăng nhập bằng SĐT **hoặc** email" là thiết kế gốc đã duyệt, không phải nhượng bộ kỹ thuật phát sinh. Ngược lại **Q13** (*"Core: activation qua **Resend email**, OTP provider abstraction để cắm SMS/Zalo sau"*) và §7 (`lead.converted → Gửi email/OTP activation`) mô tả kênh mặc định là email — **P5 làm xong phải amend Doc 15 Q13** để blueprint không còn mâu thuẫn với code (Doc 15 là nguồn đúng nhất theo CLAUDE.md; PR nào đảo Q13 thì PR đó cập nhật Q13).

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

> 🔴 **Canonical phải áp XUỐNG TẬN `lib/otp/service.ts`, không dừng ở validator.** `requestOtp`/`verifyOtp` hiện chỉ `.trim().toLowerCase()` target (`service.ts:65,160`) — với SĐT đó là **no-op**. Hai hệ quả, cả hai đều câm:
> - **Verify không bao giờ khớp:** lúc cấp tài khoản lưu `84905…` nhưng `/kich-hoat` gửi lên `0905…` → `findFirst({where:{target}})` không thấy bản ghi → phụ huynh nhận được mã nhưng nhập vào báo *"Chưa có mã hoặc mã đã dùng"*.
> - **Thủng chính lá chắn chống đốt tiền của §3.2:** cooldown (`:77`) và daily-limit (`:94`) đếm theo chuỗi `target`. Hai định dạng = **hai bộ đếm** = gấp đôi hạn mức 8 tin/ngày, và cooldown 60s bị vượt chỉ bằng cách đổi cách gõ số.
>
> ⇒ `requestOtp`/`verifyOtp` phải `canonicalPhone(target) ?? target.toLowerCase()` **ngay đầu hàm** (nhánh email giữ nguyên lowercase). Việc này thuộc P1 (cùng lúc ra đời `lib/phone.ts`), **không** để tới P4/P5.

> ✅ **CẬP NHẬT 29/07 — ràng buộc "backfill cùng deploy" ĐÃ ĐƯỢC GỠ (P1 đã làm).** Thay vì bắt hai việc phải đi cùng nhau (rủi ro: quên một cái là hỏng im lặng trên PROD), mọi đường **ĐỌC** theo SĐT nay tra bằng `phoneVariants()` → `{ phone: { in: ["84…", "0…"] } }`, tức khớp được **cả hai dạng**. Backfill trở thành việc **dọn dẹp, chạy lúc nào cũng được, chạy lại vô hại**. Đây là đúng mẫu 2-phase migration mà `.claude/rules/prisma-db.md` quy định. Cảnh báo bên dưới giữ lại làm **lý do lịch sử** — nó mô tả chính xác điều gì sẽ xảy ra nếu ai đó gỡ `phoneVariants` trước khi `phone-audit` xác nhận PROD sạch.
>
> ⚠️ **(Ràng buộc gốc — nay chỉ còn hiệu lực nếu bỏ `phoneVariants`)** Đổi đường GHI sang `84…` mà **chưa backfill** dữ liệu cũ (`0…`) sẽ **phá dedupe ngay ngày deploy** — `findRecentDuplicate` hết bắt trùng 90 ngày, tính năng **gộp con theo SĐT vừa ship ở `f39b94d` ngừng match lead cũ**, `findParentMatch` không tìm ra phụ huynh. Âm thầm, không test nào bắt. **Backfill phải nằm trong CÙNG deploy.**

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

> **Tiến độ 30/07:** ✅ xác thực OA doanh nghiệp · ✅ email 4 câu đã gửi (chờ trả lời) · ✅ App + ZCA + nạp tiền · ✅ env `ZALO_APP_ID`/`ZALO_APP_SECRET`/`ZALO_OA_REFRESH_TOKEN` trên Vercel (chưa bật `ZALO_LIVE` — đúng kế hoạch) · ⏳ **còn: nộp duyệt 2 mẫu QĐ-G + nhận văn bản trả lời 4 câu.** SMS brandname: **bỏ hẳn theo QĐ-H 30/07**.

- Xác thực OA Sata Robo **loại doanh nghiệp** → tạo App + ZCA → liên kết OA–ZCA → **nạp tiền trả trước**. Cần **GPKD + MST** Công ty CP Công nghệ Giáo dục Sata Robo.
- Nộp duyệt **2 mẫu tin** (1–3 ngày làm việc mỗi lần, bị từ chối là làm lại) theo QĐ-G §7: **A · Xác thực (OTP)** · **B · Xác nhận học phí + cấp tài khoản** (gộp).
- **Gửi `support@zalo.cloud` hỏi 4 điểm không có nguồn công khai** — 4 điểm này ảnh hưởng trực tiếp tới thiết kế, **không được suy đoán**:
  1. Tin OTP có được **miễn khung cấm 22:00–06:00** (mã `-133`) không? *(Nếu không → không đăng nhập được ban đêm.)*
  2. **Rate limit req/s** của API gửi ZNS? *(Không biết trần thì không thiết kế được retry/burst giờ cao điểm.)*
  3. Tần suất gửi tối đa/số — **nút "Gửi lại mã" có vi phạm** quy định "mỗi sự kiện 1 tin/người nhận" không?
  4. **Tin thất bại có bị tính phí** không?
- Xin **báo giá SMS brandname dự phòng** từ ≥2 nhà cung cấp (eSMS, VietGuys/Infobip). Zalo **không có fallback SMS gốc**; chi phí/độ trễ fallback không có nguồn public nào.
- Đặt env Vercel: `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_OA_REFRESH_TOKEN`. **Chưa bật `ZALO_LIVE`.**

**DoD:** có **2** `template_id` đã duyệt trong tay (QĐ-G) + ZCA có số dư + **văn bản trả lời 4 câu hỏi**. Verify bằng: gửi thử ở *development mode* tới SĐT admin OA, thấy tin thật về máy. *(Development mode **chỉ gửi được cho admin OA** — mã `-127`; không test được với SĐT phụ huynh thật trước khi mẫu được duyệt.)*

---

### P1 · Canonical SĐT + đo dữ liệu + backfill *(không đụng auth)*

- **Tạo `lib/phone.ts`** (chưa tồn tại): `canonicalPhone(raw) → "84XXXXXXXXX" | null` · `formatPhoneVN(canonical) → "0XXXXXXXXX"` · `isValidPhoneVN()`. Xử lý: bỏ `[\s.\-()]`, `+84→84`, `0084→84`, `+840…→84`, `0XXXXXXXXX→84…`, 9 chữ số mất số 0 đầu (Excel) `→84…`, chặn đầu số ngoài `3/5/7/8/9`.
- **Gộp 6 helper + 3 chỗ inline + 5 bản regex `PHONE_VN` về đây.** Validator đổi sang `.transform(canonicalPhone)` — **chuẩn hoá** chứ không chỉ chấp nhận.
- **Canonical hoá `target` trong `lib/otp/service.ts:65,160`** (xem cảnh báo đỏ ở QĐ-4). Làm ở P1 vì đây là điều kiện đúng-đắn của cả cooldown/daily-limit lẫn verify — để tới P5 thì lỗi chỉ lộ ra khi phụ huynh thật không kích hoạt được.
- **Sửa 2 test đang khoá cứng 2 dạng đối nghịch** (`lib/lead/import.test.ts:31-35`, `lib/crm/lead-qualify.test.ts:6-9`).
- **Vá lỗi đang mất lead thật:** client gửi SĐT có khoảng trắng → server chặn 400 → **nuốt lỗi im lặng** (`components/legacy-laptrinhrobot/_utils/tracking.ts:104,123-129` · `components/khoa-hoc/consult-modal.tsx:67,94`). Sau khi SĐT thành khoá đăng nhập, cùng lỗi này thành *"phụ huynh không tạo được tài khoản"* mà không ai biết.
- **`scripts/phone-audit.ts` (CHỈ ĐỌC — `pnpm phone:audit`)** chạy trên **PROD**: 5 mục — phân bố định dạng từng cột · số nhóm trùng sau canonical · **cặp "1 SĐT → nhiều User"** (mỗi cái CHẶN `User.phone @unique` ở P3) · **nhóm "cùng SĐT khác tên phụ huynh"** (§8 — mỗi nhóm là một cặp gia đình sẽ thấy con của nhau nếu gộp nhầm) · `ConvertConflict status=OPEN`.
- **`scripts/phone-backfill.ts` (`pnpm phone:backfill`, mặc định DRY-RUN, `--apply` mới ghi)**: `Lead.phone`, `Student.parentPhone/parent2Phone/phone`, `Employee.phone` — theo lô 500, idempotent. **Không backfill** `Order.customerPhone`/`VoucherRedemption.customerPhone` (snapshot hoá đơn — sửa lại là sửa chứng từ) và các cột log (`ZaloMessageLog.toPhone`, `OtpRequest.target` — ghi lại sự việc đã xảy ra).
  > Không còn bắt buộc cùng deploy (xem cập nhật ở QĐ-4). `Employee.phone` là trường tự do có thể chứa số bàn cơ sở — script chỉ đổi khi nhận ra là **di động**, số cố định giữ nguyên.

**DoD:** grep toàn repo còn **đúng 1** định nghĩa `normalizePhone` và **1** regex `PHONE_VN` · `lib/phone.test.ts` xanh (phủ case `"+84 0905 123 456"` hiện đang cho ra `"00905123456"` sai) · **báo cáo phone-audit trên PROD có số liệu thật, không phải ước lượng** · dedupe lead vẫn bắt trùng sau backfill · test khẳng định `requestOtp("0905…")` và `requestOtp("84905…")` **dùng CHUNG một bộ đếm cooldown/daily-limit**.

**Rollback:** revert PR — chưa migration, chưa đụng auth.

---

### P2 · Lưới test + chốt cửa test OTP

- **Viết `lib/otp/service.test.ts`** — `lib/otp` hiện có **0 file test**. Pattern mock copy từ `lib/zalo/token.test.ts:7-25`.
- **Chốt cơ chế cửa test cho OTP TRƯỚC khi viết helper login** (nếu chốt sau sẽ phải làm helper 2 lần): `codeHash` là HMAC một chiều (`schema:4120`) nên e2e không đọc ngược được mã. Đề xuất `OTP_TEST_FIXED_CODE` — chỉ hoạt động khi `NODE_ENV !== "production"`, và **production khởi động mà thấy biến này thì THROW**.
- **Gộp 12 bản sao logic login** về `tests/e2e/_helpers/auth.ts` (10 file `tests/manual/*` + `teacher-site-pii.spec.ts`). Giữ nguyên pattern `toPass()` chống **hydration-wipe của form Waves**.
- **`seedUser` giữ nguyên field `email`**, tự sinh `phone` duy nhất bên trong helper → **90 call-site không phải sửa dòng nào**.
- Chạy tay **32 spec không có job CI** (`test:e2e:r1..r6` + `:crm` — r1=12, r2=2, r3=3, r4=2, r5=1, r6=10, crm=2) lấy **đường cơ sở xanh** trước khi đụng identity. Cộng **10 file `tests/manual/`** (nằm ngoài `testDir` của mọi config → không lệnh nào chạy được cả cụm) là **42 spec** ngoài tầm CI.
  > CI thật có **7 job** (`quality`, `unit-tests`, `e2e`, `e2e-a0`, `e2e-r7`, `e2e-fl`, `e2e-teacher`). Job `e2e` chạy config mặc định với `testIgnore: a0|r[0-9]*|fl|crm|teacher` → chỉ còn `smoke.spec.ts` + `smoke-lms/`. Nghĩa là **toàn bộ r1–r6 + crm không ai gác**.

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

**DoD:** tài khoản cũ đăng nhập bằng email **vẫn vào được y hệt** · tài khoản test set phone thủ công đăng nhập bằng SĐT vào được · `0905…` và `84905…` cùng một bucket cooldown · 7 job CI xanh + 32 spec chạy tay không hồi quy.

> ❌ **Đừng trông cậy vào typecheck ở phase này.** Có một niềm tin sai phổ biến rằng "nới `email` thành nullable sẽ làm vỡ typecheck các `findUnique({where:{email}})`". **Không.** Prisma giữ nguyên trường nullable-unique trong `WhereUniqueInput` — bằng chứng: `User.employeeId String? @unique` (`schema:738`) vẫn sinh ra `employeeId?: string`. Typecheck sẽ **PASS và không cảnh báo gì**. Phải kiểm bằng grep + test dữ liệu.

**Danh sách grep phải rà — 15 call-site khoá theo email** (`grep -rn "where: { email" app lib scripts prisma`). Không có bảng này thì "kiểm bằng grep" là câu nói suông:

| Call-site | Loại | Xử lý |
|---|---|---|
| `lib/auth.ts:109` | login | **P3** — đổi sang `findFirst` + `OR` |
| `app/(auth)/kich-hoat/_actions.ts:24,68` | kích hoạt | **P5** — đổi target sang phone |
| `app/(admin)/admin/students/_actions.ts:968` | cấp TK phụ huynh | **P5** — kiểm trùng theo phone |
| `lib/crm/convert-lead-v2.ts:161` · `lib/crm/convert-lead.ts:76` | convert lead (`user.upsert`) | **P5** — ⚠️ `upsert` với `where:{email: undefined}` **ném lỗi runtime**, không phải trả null. Đây là điểm vỡ nặng nhất khi lead không có email |
| `lib/crm/dedupe.ts:50` | dedupe parent | **P5** — thêm nhánh tra `User.phone` |
| `app/(admin)/admin/users/_actions.ts:64,213` · `app/(admin)/admin/nhan-su/actions.ts:198` | tạo/sửa TK nhân sự | **Không đổi** (QĐ-C: nhân sự giữ email) — nhưng phải khẳng định bằng test là email vẫn **bắt buộc** ở nhánh staff, nếu không sẽ tạo được staff `email = null` rồi vỡ ở `upsert` sau |
| `prisma/seed.ts:374` · `seed-test-{admin,parent,teacher,profile}.ts` (5 chỗ) | seed | **P2** — giữ email, `seedUser` tự sinh phone (đã nêu ở P2) |

**Rollback:** revert code — migration additive, email còn nguyên dữ liệu, mọi tài khoản cũ login như cũ. **Đây chính là lý do không backfill ở bước này.**

---

### P4 · Kênh ZALO cho OTP + khả năng quan sát

- **`lib/zalo/otp-provider.ts`** theo QĐ-5. Map `-118/-119/-139/-141/-133/-147` thành error code riêng để tầng trên hiển thị đúng.
- `getPrimaryOtpProvider()` chọn **theo loại target** (SĐT → zalo, email → resend), không theo env. Sửa `.env.example:110` (`OTP_PRIMARY_PROVIDER="zalo"` đang bị code nuốt im lặng) và **viết lại `docs/otp-service.md`** — file này sai ở **3 chỗ, không phải 1**: `:3` (*"Giai đoạn đầu chỉ dùng EMAIL"*), `:9` (*"`getPrimaryOtpProvider()` đọc env `OTP_PRIMARY_PROVIDER`"* — code hardcode email), và `:17-20` (bảng ghi tên env `OTP_TTL_MINUTES`/`OTP_MAX_ATTEMPTS`/… trong khi code đọc động từ `SystemSetting` qua `getSetting("otp.*")`). Sửa lẻ 4 dòng sẽ để lại tài liệu vẫn sai.
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
  > Trùng phạm vi trực tiếp với **R2-05 "Duplicate phone UX"** trong lộ trình Doc 15 (§lộ trình R2). Nếu R2-05 chưa làm thì P5 **nuốt luôn** nó (SĐT thành khoá ⇒ UX trùng SĐT không còn là tuỳ chọn); nếu đã làm thì P5 chỉ mở rộng, không dựng lại. Kiểm tra trạng thái R2-05 trước khi ước lượng phase này.
- `app/(admin)/admin/students/_actions.ts:925-1025`: `parentAccountSchema` đổi email bắt buộc → **phone bắt buộc**, email tuỳ chọn; kiểm trùng theo phone; `requestOtp({target: phone})`.
  > Tin tốt: `scopedDb` **không** scope model `User` → kiểm trùng SĐT không bị mù chéo cơ sở.
- `app/(auth)/kich-hoat/`: `emailSchema` → `phoneSchema`; `emailVerified` → `phoneVerifiedAt`; form đổi `type="tel"`, label *"Số điện thoại phụ huynh"*, *"Mã OTP (6 số gửi qua Zalo)"*.
  > ⚠️ **Bẫy dễ sót:** dòng `:85` `enqueueAccountActivated({ to: email })` — khi target thành SĐT, chuỗi `84…` sẽ bị đẩy vào `EmailQueue.toEmail` rồi worker gửi Resend → rác hàng đợi + lỗi lặp mỗi lần có người kích hoạt. **Typecheck không bắt** (kiểu vẫn là `string`).
  > `lib/crm/_handlers/lead-converted.ts:23-26` có **rủi ro NGƯỢC LẠI, cách vá khác hẳn** — đừng gộp chung: file này đọc `parent.email` từ DB và đã có guard `if (!parent?.email || !student) return`, nên **không** đẩy rác vào queue. Cái hỏng của nó là **im lặng bỏ qua email xác nhận ghi danh** cho mọi phụ huynh không có email — hôm nay là ngoại lệ hiếm, sau P5 thành **trường hợp phổ biến**. Vá = chuyển sang gửi ZNS khi thiếu email (hoặc ít nhất log/đếm được số lần bỏ qua), không phải chặn chuỗi `84…`.
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

### ✅ Đã chốt cho P0 (29/07/2026) — ĐÃ TRIỂN KHAI

| # | Quyết định | Hệ quả đã ghi vào code |
|---|---|---|
| **P0-a** | **Phương án (A)** — gộp verify+consume thành một thao tác nguyên tử. | `verifyOtp` + `consumeOtp` **bị thay bằng `verifyAndConsumeOtp`**; không còn trạng thái verified-chưa-consume để khai thác. Thực hiện bằng CAS (`updateMany` guard `consumedAt: null`) nên 2 request đồng thời chỉ 1 cái thắng. **Ghi nợ UX:** `/quen-mat-khau` (P6) BẮT BUỘC nhập mã + mật khẩu mới trên **cùng 1 màn**. Cần tách 2 bước ⇒ phải chuyển sang (B), **không** khôi phục `verifiedAt` 2 pha. |
| **P0-b** | **5 req/IP/giờ · trần 300 tin/ngày · kill-switch 500.** | 3 key SystemSetting mới (`otp.ipMaxPerHour`, `otp.globalDailyCap`, `otp.globalKillSwitch`) — đổi ngưỡng **không cần deploy**. Trần ngày đặt trong `requestOtp` (mọi đường đi qua, kể cả admin gửi lại); rate-limit IP đặt ở Server Action công khai. |
| **P0-c** | **Bịt oracle + bù bằng dòng hướng dẫn tĩnh trên form.** | Mọi kết quả phụ thuộc target (không tồn tại / đã ACTIVE / cooldown / vượt hạn mức của số đó / gửi hỏng) trả **cùng một** phản hồi, kèm **sàn thời gian 900ms** để chênh lệch độ trễ không thành oracle. Chỉ lỗi không phụ thuộc target mới nói thật, nhận diện bằng cờ `systemHalt` — **không** suy từ hình dạng kết quả (bẫy: "vượt hạn mức ngày" có hình dạng y hệt "trần hệ thống" nhưng chỉ xảy ra với target có thật). |
| **P0-d** | **Bắt buộc trước P3, P0 chạy trước không cần chờ.** | Env đã có sẵn giá trị — chỉ cần add vào Vercel (xem §9). `rateLimit()` tự nhận `UPSTASH_REDIS_REST_*` hoặc `KV_REST_API_*`, fail-soft về memory nếu thiếu. **✅ 30/07: env đã add Prod + Preview (2 DB riêng)** — có hiệu lực sau redeploy; kiểm chứng theo §9. |
| **P0-e** | **`maskPhone` GIỮ NGUYÊN 3+3** — không siết 2+2. | Xem §9: sale + quản lý cơ sở **không hề bị mask** (có `leads:view-pii`), nên việc siết không giải quyết vấn đề gì mà chỉ siết thêm GV/HR — đúng nhóm chính sách đã cố ý chặn. Nút "hiện số" cho GV là **đổi chính sách so với Doc 15**, tách ra chốt riêng. |
| **P0-f** | **Retention dấu vết OTP = 90 ngày.** | Cron `/api/cron/otp-cleanup` chạy 08:00 hằng ngày; `OtpDeliveryLog` cascade theo `OtpRequest` nên 1 lệnh xoá là đủ. |

### ✅ Chốt tiếp 29/07 — ngân sách + nội dung 3 mẫu

**QĐ-E · Ngân sách ZNS = 300 tin/ngày** (≈ 90.000đ/ngày ở đơn giá 300đ/tin mã xác thực). Khớp đúng default `otp.globalDailyCap` đã cài ở P0 ⇒ không phải chỉnh gì. **SMS brandname dự phòng vẫn chưa duyệt** — nghĩa là ở v1, phụ huynh không có Zalo (`-118`) hoặc tắt nhận tin OA (`-139/-141`) **chỉ còn đường email/mật khẩu**. Đây chính là chỗ QĐ-3 (giữ email vĩnh viễn) gánh rủi ro; đừng bỏ email khi chưa có SMS.

**QĐ-F · Tách đúng 3 mẫu, KHÔNG gộp.** Bản nháp nội dung do BGĐ soạn 29/07 (cảm ơn + link đăng nhập + tên đăng nhập là SĐT + hotline + emoji) **rất tốt cho email/chat nhưng sẽ bị kiểm duyệt ZNS từ chối**, vì gộp 3 mẫu vào 1 và vi phạm cùng lúc 3 điều cấm: **có link** · **có số hotline** · **in SĐT phụ huynh ra chữ**. Riêng mẫu **Xác thực** còn không cho nút CTA / ảnh / emoji — mà đây lại là loại **DUY NHẤT gửi được cho người chưa từng tương tác với OA**, tức đúng thứ cần cho phụ huynh mới. Nhồi nội dung dài vào đó = mất luôn khả năng gửi cho người chưa follow OA.

**QĐ-G · Rút xuống 2 mẫu (chốt 29/07)** — gộp *cấp tài khoản* vào *xác nhận học phí*. **Gộp được, và về kỹ thuật còn hợp lý hơn 3 mẫu:**

| Mẫu | Nội dung nộp duyệt | Bắn khi nào |
|---|---|---|
| **A · Xác thực (OTP)** | *Mã xác thực Sata Robo của quý phụ huynh là `{code}`. Tài khoản đăng nhập chính là số điện thoại nhận tin này. Mã có hiệu lực `{minutes}` phút, vui lòng không chia sẻ.* | Lúc phụ huynh xin mã kích hoạt / quên mật khẩu. **Đây là tin CHẠM ĐẦU TIÊN** |
| **B · Học phí + tài khoản** *(gộp)* | *Sata Robo xác nhận đã nhận học phí khóa `{courseName}` của bé `{studentName}`, số tiền `{amount}`đ, phiếu thu `{receiptCode}`. Quý phụ huynh đăng nhập bằng chính số điện thoại nhận tin này để theo dõi lịch học, điểm danh và nhận xét của thầy cô.* | Sự kiện `payment.confirmed`. Loại giao dịch — nếu Zalo cho nút thì đặt **nút "Đăng nhập"**, KHÔNG dán link vào thân tin |

**Vì sao gộp được:**
- `confirmPayment` **chặn nếu khoản chưa gắn `enrollmentId`** (`payment.ts:359-361`) ⇒ ghi danh (và tài khoản) **luôn có trước** lúc xác nhận học phí. Thời điểm `payment.confirmed` là lúc **cả hai dữ kiện đều đã đúng** — không phải ghép gượng.
- Mẫu Xác thực là **loại DUY NHẤT gửi được cho người chưa từng tương tác với OA**. Nghĩa là mẫu "cấp tài khoản" (loại giao dịch) **vốn dĩ đã không thể là tin chạm đầu tiên** cho phụ huynh mới. Gộp nó vào tin học phí **không mất gì**, vì cả hai đều là tin "đến sau".
- Tiết kiệm **200đ/phụ huynh mới** (500đ thay vì 700đ) và **bớt 1 lần chờ duyệt 1–3 ngày**.

**Hai điều phải chấp nhận khi gộp — ghi ra để sau không bất ngờ:**
1. **Trả góp:** tin B bắn mỗi lần kế toán xác nhận một đợt ⇒ câu "đăng nhập bằng số điện thoại này" **lặp lại ở mọi đợt**. Câu chữ trên đã viết trung tính để đọc như lời nhắc, không như lỗi. Muốn tránh hẳn thì phải quay lại 3 mẫu.
2. **Cấp tài khoản KHÔNG kèm học phí** (admin cấp tay từ `/admin/students`, học thử) ⇒ **không có tin B**. Phụ huynh chỉ nhận mẫu A — nhưng A đã nói *"tài khoản đăng nhập chính là số điện thoại này"* nên vẫn đủ nghĩa, không cần mẫu thứ ba.

**Phần cảm ơn + hotline + link** trong bản nháp → chuyển sang **email chào mừng** (đã có sẵn `enqueueAccountActivated`) hoặc tin Zalo/Messenger do sale gửi tay. Ở hai kênh đó không bị kiểm duyệt, và đó mới là chỗ đặt giọng văn ấm áp.

> ⚠️ Ba mẫu trên dựa vào quy định ZNS ghi tại §2 QĐ-6 (nguồn zalo.solutions) — **chưa xác minh lại tại thời điểm nộp**. Quy định Zalo có thay đổi. Vẫn phải gửi `support@zalo.cloud` 4 câu ở P0′ TRƯỚC khi nộp, đặc biệt câu **OTP có được miễn khung cấm 22:00–06:00 (`-133`)** — nếu không thì ban đêm không ai kích hoạt/đăng nhập được.

**QĐ-H · Bỏ hẳn SMS brandname (chốt 30/07)** — không xin báo giá, không ký nhà cung cấp SMS nào. Thông báo + OTP chỉ đi **Zalo (ZNS)**; email là kênh dự phòng vĩnh viễn (QĐ-3). Hệ quả chấp nhận: phụ huynh không dùng Zalo hoặc ZNS lỗi (`-118`/`-139`/`-141`) chỉ còn đường email/mật khẩu; không có cả email lẫn Zalo → cấp mã kích hoạt tạm tại quầy (P6). **P4 hết bị chặn bởi SMS** — chỉ còn chờ 2 `template_id` được duyệt.

### ⏳ Còn mở *(đã đóng hết 30/07 — không còn mục nào)*

5. ~~**SMS brandname dự phòng** — xin báo giá ≥2 nhà cung cấp (eSMS, VietGuys/Infobip), có ký hay không.~~ **[ĐẢO 30/07 — QĐ-H: bỏ hẳn SMS.]**
   > ~~Chặn: **P4** (fallback khi ZNS chết). Không chặn P0–P3.~~ P4 chỉ còn chờ template duyệt.

**Câu hỏi phụ nên chuẩn bị sẵn câu trả lời:** phụ huynh bấm gửi lại mã 10 lần thì ai trả tiền? · ông bà đưa đón có xem được lịch học không? · phụ huynh đổi số **và đã mất số cũ** thì lấy lại tài khoản kiểu gì?

---

## 8. Ba con số cần đo trước khi cam kết bất cứ mốc nào

Toàn bộ kế hoạch trên có **3 ẩn số chưa đo được từ code** — phải có số liệu thật trước khi chốt lịch:

1. **Số nhóm SĐT trùng trên PROD** sau canonical (chạy `scripts/phone-audit.ts` ở P1). DEV đã có ít nhất **1 SĐT trỏ 2 User phụ huynh khác nhau**. Con số PROD quyết định P5 mất mấy ngày dọn tay.
2. **Tỉ lệ phụ huynh có Zalo hoạt động.** Không đo được cho tới khi gửi thật. Đây là con số quyết định **có bắt buộc ký SMS brandname hay không**.
3. ~~Bao nhiêu tài khoản nhân sự không có SĐT~~ — **đã hết ý nghĩa sau QĐ-C**: nhân sự giữ email + mật khẩu, `User.phone` để `null`. *(Số liệu tham khảo: DEV có 24/53 tài khoản staff không có SĐT ở bất kỳ đâu — chính con số này biện minh cho QĐ-C.)*

Thay vào đó, con số thứ 3 cần đo là: **bao nhiêu nhóm "cùng SĐT nhưng khác tên phụ huynh"** trong dữ liệu lead/học viên. QĐ-A chốt *1 SĐT = 1 hộ*, nên mỗi nhóm như vậy là một **cặp gia đình sẽ nhìn thấy con của nhau** nếu gộp nhầm. Báo cáo `phone-audit` (P1) phải liệt kê riêng nhóm này để duyệt tay.

---

## 9. Đính chính hiện trạng che SĐT (29/07) — vì sao P0-e giữ 3+3

Việc che SĐT phải đọc theo **2 tầng**: tầng route (`PAGE_GATES` — ai vào được trang) rồi mới tới tầng PII (`*:view-pii` — vào rồi thì thấy đầy đủ hay bị che). Bỏ tầng 1 sẽ kết luận sai. Bảng dưới đây đã đối chiếu cả hai (29/07):

| Trang | Ai vào được (PAGE_GATES / gate trong page) | Trong số đó ai BỊ mask |
|---|---|---|
| `/admin/leads` | `leads:view-all` (SUPER_ADMIN · CENTER_MANAGER · MARKETING) **hoặc** `leads:view-own` (SUPER_ADMIN · SALES_CSM) — `leads/page.tsx:40-43` | **KHÔNG AI.** Cả 4 vai vào được đều có `leads:view-pii` (`:309`) ⇒ nhánh mask là **code chết** |
| `/admin/students` | `students:view-all` = SUPER_ADMIN · CENTER_MANAGER · SALES_CSM · MARKETING · **ACCOUNTANT · HR** (`:383`) | **HR + Kế toán** (không có `leads:view-pii`) — đây là chỗ mask thực sự có tác dụng |
| `/admin/enrollments` | `enrollments:view-all` = SUPER_ADMIN · CENTER_MANAGER · SALES_CSM · **ACCOUNTANT** (`:406`) | **Kế toán** |
| `/admin/orders/[id]` | `orders:view` = SUPER_ADMIN · CENTER_MANAGER · SALES_CSM · ACCOUNTANT (`:565`) | **KHÔNG AI** — `orders:view-pii` (`:568`) trùng y hệt danh sách `orders:view` ⇒ **code chết** |
| `/admin/classes/[id]/progress` | GV vào được | GV **không thấy gì cả** — `canViewParentContact()` (`:822`) ẩn hẳn cột, không phải mask |

**`TEACHER` không có mặt ở bất kỳ dòng nào bên trên** — GV bị chặn từ tầng route (`PAGE_GATES` ghi rõ *"Danh sách HV toàn cơ sở. GV KHÔNG vào"*), không phải từ tầng mask.

⇒ **Mask 3+3 hiện chỉ áp cho HR và Kế toán, ở màn học viên/ghi danh.** Siết xuống 2+2 vì thế chỉ làm khó đúng 2 vai đó, không đụng gì tới sale/quản lý cơ sở (họ vốn thấy số đầy đủ) và cũng không liên quan GV. Lợi ích an ninh nhỏ, rủi ro hiểu nhầm lớn ⇒ **P0-e giữ 3+3**.

> ⚠️ **ĐÍNH CHÍNH (29/07) — KHÔNG có lỗ hở quyền ở đây.** Bản trước của mục này kết luận *"MARKETING đang xem PII lead trái quyết định đã ký"* và đề xuất gỡ quyền. **Sai.** Quyết định 10/07 (che PII cho MARKETING) **đã bị ĐẢO ngày 21/07**: `permissions.ts:305-308` ghi rõ *"21/07 (user chốt): MARKETING XEM ĐƯỢC tên + SĐT lead (làm outreach/chiến dịch cần liên hệ) → thêm MARKETING (ĐẢO quyết định 'che PII cho MARKETING' của a+b 20/07)"*, và `seed-roles.ts:150` chép lại đúng lý do đó cho `HO_MARKETING`. **Ma trận `:309` là hiện trạng ĐÚNG; gỡ MARKETING khỏi đó là đảo ngược quyết định của BGĐ.**
>
> Thứ thật sự sai chỉ là **2 comment lạc hậu** vẫn mô tả quyết định 10/07 đã bị thay thế — và chính chúng đã làm bản đánh giá đầu tiên của tài liệu này kết luận sai **hai lần**:
> - `permissions.ts:66` — *"MARKETING mặc định KHÔNG có, cấp per-user qua grant"*.
> - `leads/page.tsx:126` — lấy *"(vd MARKETING)"* làm ví dụ vai bị che.
>
> Và **nhánh mask KHÔNG phải code chết** như bản trước viết: `UserPermissionGrant` cho phép **DENY per-user**, nên admin thu quyền `leads:view-pii`/`orders:view-pii` của một người cụ thể là nhánh mask có tác dụng ngay. Nó là lớp phòng thủ còn sống, đừng gỡ.

### GV/trợ giảng + chat–call real-time: cấp *năng lực liên hệ*, KHÔNG cấp *định danh* (định hướng 29/07)

Kế hoạch tương lai: tích hợp chat real-time và gọi điện GV ↔ phụ huynh. Câu hỏi kèm theo — *"vậy có nên để lộ SĐT cho GV không?"* — **khuyến nghị: KHÔNG**, và chính tính năng đó là lý do không cần lộ.

- Chat/call trong app cho GV **đúng thứ họ cần** (liên hệ được phụ huynh) mà **không cần** thứ họ không cần (chuỗi 10 chữ số mang đi được). Đây là mô hình *masked calling* — hệ thống ghép cuộc, hai đầu không thấy số nhau, có log.
- Sau AUTH-SĐT, SĐT **không còn là thông tin liên lạc — nó là tên đăng nhập**. Phát username của toàn bộ phụ huynh cho nhóm nhân sự biến động cao nhất là mở rộng bề mặt tấn công đúng vào cái khoá vừa dựng.
- Doc 15 §PII đã chốt *"TEACHER không mặc định xem SĐT phụ huynh"*; đảo lại cần phiếu BGĐ (như đã làm với site GV 04/07).
- NĐ 13/2023 + rủi ro cạnh tranh: GV nghỉ việc mang theo danh bạ phụ huynh.
- **Hạ tầng đã có sẵn:** `/admin/tin-nhan` là hội thoại PH ↔ GV, gate `["parent-requests:manage", "classes:view-own"]` — GV vào được **vì trang có lọc theo lớp phân công**. Kênh chat không phải dựng mới, chỉ cần gắn call lên trên.

**Vẫn phải có đường cứu hộ:** nút *"Hiện số"* break-glass cho tình huống khẩn (bé ốm, gọi trong app không được) — Server Action có `assertCan` + **bắt buộc nhập lý do + ghi audit**, đúng mẫu `payments:view-pii` đang chạy. Như vậy GV liên hệ được 100% trường hợp mà **không ai cầm được danh bạ**.

> Đây là **định hướng**, chưa phải quyết định thi hành: phần call cần chọn nhà cung cấp (proxy số nhà mạng hay VoIP) và có chi phí riêng. Ghi ở đây để khi làm chat/call không mặc định "cứ hiện SĐT cho tiện".

### Thêm Upstash vào đâu (P0-d) — kể cả site test

Hai giá trị **không paste vào chat, không commit vào repo**.

| Môi trường | Đặt ở đâu | Dùng Upstash DB nào |
|---|---|---|
| **Production** | Vercel → Project → Settings → Environment Variables → scope **Production** | DB prod |
| **Site test / Preview** | Cùng chỗ, scope **Preview** (hoặc Branch cụ thể nếu muốn riêng 1 nhánh) | ⚠️ **DB KHÁC prod.** Key rate-limit (`otp:activation:ip:*`) là chuỗi chung — dùng chung DB thì traffic test đốt bộ đếm của prod và ngược lại |
| **Local dev** | `.env.local` (đã `.gitignore`) | DB test hoặc bỏ trống |
| **Chạy test** (vitest / Playwright) | **ĐỪNG SET** | — |

**Vì sao test không set:** `rateLimit()` fail-soft về bộ đếm in-memory, mỗi lần chạy đếm lại từ 0 → test tất định. Trỏ vào Redis dùng chung thì chạy suite 2 lần liên tiếp sẽ **đỏ giả** vì bộ đếm còn dư từ lần trước. Nếu bắt buộc kiểm chính hành vi Redis thì tạo DB thứ ba và xoá sạch trước mỗi lần chạy.

**Sau khi thêm phải REDEPLOY** — env chỉ nạp lúc build/khởi động; không redeploy thì code vẫn chạy nhánh memory dù đã điền đúng.

**KHÔNG** đặt vào `.env.example`, và **đừng set cả 2 bộ tên** (`UPSTASH_*` lẫn `KV_*`) — xem ghi chú dưới.

> `lib/rate-limit.ts:49-52` đọc `UPSTASH_REDIS_REST_*` trước, fallback `KV_REST_API_*` (tên do tích hợp Upstash trên Vercel Marketplace tự đặt) — dùng bộ nào cũng chạy, **đừng đặt cả hai** kẻo không biết bộ nào đang có hiệu lực. Kiểm chứng đã ăn: bấm "Gửi mã kích hoạt" quá `otp.ipMaxPerHour` lần trong 1 giờ từ cùng một máy phải bị chặn **kể cả khi tải trang lại nhiều lần** (bộ đếm memory sẽ reset theo instance, Redis thì không).
