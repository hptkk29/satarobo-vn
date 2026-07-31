# OTP Service (Cụm A1 → AUTH-SĐT P4)

Dịch vụ OTP cho **kích hoạt tài khoản phụ huynh**, **quên mật khẩu**, **đổi liên hệ**.
Từ P4: **provider chọn theo LOẠI target** — SĐT → **Zalo ZNS** (mẫu Xác thực đã duyệt),
email → **Resend**. SMS đã **bỏ hẳn** (QĐ-H 30/07); email là kênh dự phòng vĩnh viễn (QĐ-3).

> Viết lại toàn bộ 31/07 — bản cũ sai 3 chỗ: "chỉ dùng EMAIL" (đã có ZALO),
> "`getPrimaryOtpProvider()` đọc env `OTP_PRIMARY_PROVIDER`" (hàm lẫn env đã GỠ),
> bảng env `OTP_TTL_MINUTES`… (tham số đọc động từ SystemSetting từ P0).

## Kiến trúc

- `lib/otp/provider.ts` — interface `OtpProvider` + `emailOtpProvider` (Resend) +
  **`getOtpProviderFor(target)`**: SĐT (canonical được) → `zaloOtpProvider`, email → Resend.
  Trả `null` cho SĐT khi cờ break-glass `AUTH_ZNS_DEGRADED` bật.
- `lib/zalo/otp-provider.ts` — kênh ZALO: template đọc từ **SystemSetting
  `zalo.znsTemplateOtp`** (đổi mẫu không cần deploy; default = mẫu A `616128` duyệt 31/07),
  params `{code, minutes}` **phải khớp tên tham số trong mẫu đã duyệt**. Map mã lỗi ZNS
  thành key ổn định (`ZNS_ERROR_KEY`): `-118` NO_ZALO_ACCOUNT · `-119` USER_UNREACHABLE ·
  `-133` QUIET_HOURS · `-139`/`-141` USER_REFUSED · `-147` USER_LIMIT.
- `lib/otp/service.ts` — `requestOtp` + `verifyAndConsumeOtp` (nguyên tử, CAS — P0 §3.1).
  **Fallback có điều kiện:** ZNS fail (hoặc degraded) + user có **email đã verify** →
  gửi email, ghi `OtpDeliveryLog` **thứ 2** cùng request (2 delivery/1 request).
  Không email verified → `deliveryFailed=true`, không giả vờ thành công.
- Model: `OtpRequest` (code **HMAC-SHA256**, không lưu plain) + `OtpDeliveryLog`
  (target của delivery = địa chỉ THẬT đã gửi; `OtpRequest.target` luôn là định danh
  người dùng nhập — verify không đổi khi fallback email).

## Tham số vận hành — SystemSetting nhóm `otp.*` (KHÔNG phải env)

Đổi qua `/admin/cau-hinh-van-hanh`, hiệu lực ≤60s, không cần deploy:
`otp.ttlMinutes` (5) · `otp.maxAttempts` (5) · `otp.resendCooldownSec` (60) ·
`otp.dailyLimit` (8/số/ngày) · `otp.ipMaxPerHour` (5) · `otp.globalDailyCap` (300 ≈ 90.000đ/ngày)
· `otp.globalKillSwitch` (500) · `zalo.znsTemplateOtp` (616128).

Chỉ tin gửi **THÀNH CÔNG** mới đốt cooldown/hạn mức (P0 §3.5) — khớp cách Zalo
tính phí (tin fail không trừ tiền — văn bản ZBS 31/07).

## Ràng buộc từ văn bản ZBS (31/07)

1. Mẫu Xác thực = Tin Giao dịch (Tag 1) → gửi **24/7**, không dính khung cấm (`-133` chỉ là phòng hờ).
2. **Timeout gửi 15 giây** — không tới thiết bị trong 15s là fail (không tính phí) → UX chờ mã ~15–30s rồi gợi ý đường email.
3. Rate limit API 4000 req/phút — dư xa trần 300 tin/ngày.
4. Zalo không giới hạn resend Tag 1 — cooldown/hạn mức của TA là van chi phí nội bộ, giữ nguyên.

## Env (chỉ credentials + cờ, KHÔNG phải tham số vận hành)

```
ZALO_APP_ID / ZALO_APP_SECRET / ZALO_OA_REFRESH_TOKEN   # creds OA (đã set 30/07)
ZALO_LIVE="true"          # CHƯA BẬT — thiếu thì mọi lệnh gửi ZNS chỉ mô phỏng (SIMULATED)
AUTH_ZNS_DEGRADED="true"  # break-glass: ZNS chết hàng loạt → SĐT đi thẳng email dự phòng
RESEND_API_KEY=...        # kênh email (dùng chung lib/email)
```

`OTP_PRIMARY_PROVIDER` **đã gỡ** — trước đây `"zalo"` trong .env.example bị code
nuốt im lặng; nay provider chọn theo target, env này không còn chỗ đứng.

## Quan sát

- **`/admin/otp-logs`** — tra "phụ huynh báo không nhận được mã": mỗi request kèm các
  lần gửi (kênh, trạng thái, key lỗi), bộ đếm hôm-nay vs trần, chi phí ước tính.
  Quyền: `emails:view` (cùng nhóm trực hỗ trợ với /email-logs).
- **SLO** (`lib/observability/slo.ts`): `otpSentToday` (≤300) · `otpDeliveryFailToday`
  (≤20) · `znsUserErrorToday` (≤30) · `otpCostTodayVnd` (≤90.000). TODO: quota ZNS
  còn lại qua API Zalo — chốt endpoint theo bảng tra cứu ZBS khi bật live.

## Bật live (checklist — làm ĐÚNG THỨ TỰ)

1. Merge P4 + deploy (ZALO_LIVE chưa set → vẫn mô phỏng, an toàn).
2. Smoke **development mode**: gửi thử tới SĐT admin OA (dev mode chỉ gửi được cho
   admin OA — số khác trả `-127`, là bình thường). Nếu ZNS chê `template_data`:
   tên tham số trong mẫu 616128 không phải `code`/`minutes` → sửa 1 chỗ
   `lib/zalo/otp-provider.ts` cho khớp.
3. Set `ZALO_LIVE="true"` (scope Production) + redeploy.
4. Theo dõi `/admin/otp-logs` + SLO ngày đầu; sự cố → gỡ `ZALO_LIVE` (về mô phỏng)
   hoặc bật `AUTH_ZNS_DEGRADED` (dồn về email) — cả hai đều không cần revert code.

## Runbook — mất refresh_token Zalo (OA ngừng gửi được ZNS)

refresh_token **xoay vòng mỗi lần refresh**; refresh đã có khoá chống đua
(`lib/zalo/token.ts`, advisory lock + re-read + persist cứu ngoài transaction).
Nếu vẫn thấy log `❌❌ MẤT REFRESH TOKEN` (token mới không lưu được, token cũ đã chết):

1. Vào developers.zalo.me → App Sata Robo → chạy lại flow cấp quyền OA (OAuth) →
   lấy cặp access_token + refresh_token MỚI.
2. Cập nhật env `ZALO_OA_REFRESH_TOKEN` (scope Production).
3. Xoá row `IntegrationConfig` provider=`ZALO_OA` (Supabase SQL Editor:
   `DELETE FROM "IntegrationConfig" WHERE provider = 'ZALO_OA';`) — để hệ thống seed
   lại từ env thay vì dùng token rác trong DB.
4. Redeploy. Kiểm chứng: cron `/api/cron/zalo-token-refresh` chạy kế tiếp không còn warn.

## Luồng kích hoạt phụ huynh (không đổi ở P4 — P5 sẽ chuyển target sang SĐT)

1. Tài khoản tạo qua chuyển lead: `accountStatus = PENDING_ACTIVATION`, `password = null`.
2. `/kich-hoat` → nhập định danh → `requestOtp` (kênh theo target).
3. Nhập mã 6 số + đặt mật khẩu → `verifyAndConsumeOtp` → `accountStatus = ACTIVE`.
4. Đăng nhập `/login` (SĐT hoặc email — P3) → portal.

## Cửa test (P2)

`OTP_TEST_FIXED_CODE` (6 chữ số) → mã sinh ra luôn bằng giá trị đó — chỉ non-prod;
production khởi động mà thấy biến này là throw. Xem `lib/otp/service.ts`.
