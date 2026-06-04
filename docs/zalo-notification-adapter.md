# Zalo OA/ZNS adapter (Cụm C5 — SKELETON)

## Mục tiêu

Chừa sẵn adapter gửi thông báo qua Zalo OA/ZNS, **tắt an toàn khi thiếu credential**
(không lỗi, không phá luồng) → tự **fallback email**. Mọi lần gửi đều **log**.
CHƯA gọi API thật (skeleton).

## Model (additive, migration `20260601110000_zalo_adapter`)

`ZaloMessageLog` (toPhone, templateKey, payload Json, status `ZaloMessageStatus`
PENDING/SENT/FAILED/SKIPPED, providerMessageId, errorMessage, fallbackEmailed, sentAt).

## Provider (`lib/zalo/provider.ts`)

Interface `ZaloProvider` (mô phỏng OTP provider):
- `isConfigured()` = có `ZALO_APP_ID` + `ZALO_OA_ACCESS_TOKEN`.
- `isLive()` = configured **và** `ZALO_LIVE=true`.
- `send()`:
  - chưa cấu hình → `ZALO_NOT_CONFIGURED`.
  - có credential nhưng chưa live → **mô phỏng** thành công (`SIMULATED-...`), KHÔNG gọi API.
  - live → TODO tích hợp ZNS thật; hiện trả `ZALO_LIVE_NOT_IMPLEMENTED`.

## Service (`lib/zalo/service.ts` → `sendZaloNotification`)

- Chưa cấu hình → log **SKIPPED** + fallback email (nếu truyền) → trả `ok:true`.
- Đã cấu hình + gửi OK → log **SENT**.
- Lỗi → log **FAILED** + fallback email.
- KHÔNG ném lỗi ra ngoài → an toàn cho mọi caller.

## UI

- Admin `/admin/tich-hop` (gate `settings:view`): trạng thái Zalo (chưa cấu hình / mô phỏng / live)
  + 30 log gần nhất.

## Test

1. Không set env Zalo → gọi `sendZaloNotification({ toPhone, fallbackEmail })` →
   ZaloMessageLog SKIPPED, EmailQueue có 1 bản PENDING, hàm trả ok.
2. Set `ZALO_OA_ACCESS_TOKEN` (không set ZALO_LIVE) → SENT (mô phỏng), không fallback.
3. `/admin/tich-hop` hiển thị đúng trạng thái + log.

## Commit 5 — gửi thật + thông báo điểm danh

- **Provider hoàn thiện** (`lib/zalo/provider.ts`): `ZALO_OA_ID` mặc định `40213330288531842`
  (override qua env); `isConfigured` = có `ZALO_OA_ACCESS_TOKEN`; `isLive` = configured + `ZALO_LIVE=true`.
  Khi live + có `templateKey` → POST thật `business.openapi.zalo.me/message/template` (error===0 = OK),
  lỗi → service fallback EMAIL.
- **Thông báo điểm danh** (`lib/notify/attendance.ts` → `notifyAttendanceForSession`): khi GV lưu điểm
  danh (`markAttendance`) → báo phụ huynh "Bé [tên] đã điểm danh [trạng thái] buổi [ngày] lớp [tên]".
  GỘP nhiều con cùng phụ huynh; mỗi (buổi, HV) chỉ 1 lần (mốc `Attendance.notifiedAt`); đúng phụ huynh
  con đó (không lộ con khác). Email chạy ngay; Zalo khi đã cấu hình token.
- **Nhắc công nợ** (cron debt-reminder) cũng qua Zalo + fallback email (commit 4).
- ENV (xem `.env.example`): `ZALO_OA_ACCESS_TOKEN`, `ZALO_LIVE`, `ZALO_ZNS_TEMPLATE_ATTENDANCE`,
  `ZALO_ZNS_TEMPLATE_DEBT`. **CHỜ NGƯỜI DÙNG** cung cấp access token + template ZNS đã duyệt.

## Test commit 5
1. Lưu điểm danh 1 buổi (HV ZZTEST_ có email PH) → EmailQueue có thông báo điểm danh (PENDING),
   `Attendance.notifiedAt` set; lưu lại lần nữa → KHÔNG gửi trùng.
2. Có token + `ZALO_LIVE=true` + template → gửi ZNS thật; lỗi → fallback email. KHÔNG gửi thật khi test.
