# OTP Service (Cụm A1)

Dịch vụ OTP cho **kích hoạt tài khoản phụ huynh**, **quên mật khẩu**, **đổi email/SĐT**.
Giai đoạn đầu **chỉ dùng EMAIL** (Resend) — SMS (SpeedSMS) cắm sau khi có brandname.

## Kiến trúc

- `lib/otp/provider.ts` — interface `OtpProvider` + `emailOtpProvider` (Resend, tái dùng `lib/email/send.ts`).
  `getPrimaryOtpProvider()` đọc env `OTP_PRIMARY_PROVIDER` (mặc định `email`). SMS chưa build → luôn fallback email.
- `lib/otp/service.ts` — `requestOtp`, `verifyOtp`, `consumeOtp`.
- Model: `OtpRequest` (code **HMAC-SHA256**, không lưu plain) + `OtpDeliveryLog`.

## Quy tắc (cấu hình trong `service.ts`)

| Quy tắc | Giá trị |
|---|---|
| Hết hạn | 5 phút (`OTP_TTL_MINUTES`) |
| Số lần thử | 5 (`OTP_MAX_ATTEMPTS`) |
| Cooldown gửi lại | 60s (`OTP_RESEND_COOLDOWN_SEC`) |
| Giới hạn / target / ngày | 8 (`OTP_DAILY_LIMIT`) |

CHỈ dùng cho kích hoạt / quên mật khẩu / đổi liên hệ — **KHÔNG** dùng cho mọi lần login.

## Luồng kích hoạt phụ huynh

1. Tài khoản tạo qua chuyển lead có `User.accountStatus = PENDING_ACTIVATION`, `password = null`.
2. Phụ huynh vào `/kich-hoat` (link từ `/login`) → nhập email → `requestActivationOtp` gửi OTP email.
3. Nhập mã 6 số + đặt mật khẩu → `activateAccount` verify OTP → set password + `accountStatus = ACTIVE`.
4. Đăng nhập `/login` → portal `hocvien.satarobo.vn`.

> Phụ huynh **đã ACTIVE** không bị reset mật khẩu khi thêm con mới (activation chỉ áp cho `PENDING_ACTIVATION`).

## Env

```
OTP_PRIMARY_PROVIDER=email   # email (mặc định). 'sms' chưa khả dụng → fallback email.
RESEND_API_KEY=...           # dùng chung lib/email
NEXTAUTH_SECRET=...          # secret HMAC hash OTP
```

## Audit & log

- `OtpDeliveryLog` ghi mỗi lần gửi (SENT/FAILED).
- `logUserAudit` ghi gửi/verify OTP (UPDATE/ENABLE).
- Email OTP cũng vào `EmailLog` (qua `sendEmail`).

## Routing

`/kich-hoat` là trang auth công khai (như `/login`) — xem `isPublicAuthPath` trong `lib/auth/route-policy.ts`.

## TODO (SMS)

Khi có brandname: thêm `smsOtpProvider` (SpeedSMS) trong `provider.ts`, set `OTP_PRIMARY_PROVIDER=sms`.
Không cần đổi `service.ts`.
