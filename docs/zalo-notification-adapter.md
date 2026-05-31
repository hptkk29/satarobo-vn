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
2. Set `ZALO_APP_ID` + `ZALO_OA_ACCESS_TOKEN` (không set ZALO_LIVE) → SENT (mô phỏng), không fallback.
3. `/admin/tich-hop` hiển thị đúng trạng thái + log.
