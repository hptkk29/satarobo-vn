# MISA AMIS sync (Cụm C6 — SKELETON)

## Mục tiêu

Chừa sẵn đồng bộ dữ liệu kế toán sang MISA AMIS. **Bật/tắt qua config**;
**KHÔNG push API thật** khi tắt hoặc thiếu credential. Mọi lần đều ghi `IntegrationLog`.

## Model (additive, migration `20260601120000_misa_integration`)

- `IntegrationConfig` (provider @unique, isEnabled, settings Json) — bật/tắt từng provider.
- `IntegrationLog` (provider, direction PUSH/PULL, action, status `IntegrationStatus`
  PENDING/SUCCESS/SKIPPED/FAILED, requestPayload, responsePayload, errorMessage) — log dùng chung.

## Service (`lib/misa/service.ts`)

- `isMisaConfigured()` = có `MISA_CLIENT_ID` + `MISA_CLIENT_SECRET` + `MISA_API_URL`.
- `isMisaLive()` = configured **và** `MISA_LIVE=true`.
- `getMisaConfig()` / `setMisaEnabled(bool)` — đọc/ghi cờ bật-tắt (IntegrationConfig).
- `syncToMisa({ action, payload })`:
  - tắt config **hoặc** thiếu credential → **SKIPPED** (không push, không lỗi).
  - bật + có credential nhưng chưa live → **SUCCESS mô phỏng** (KHÔNG gọi API).
  - live → TODO push thật; hiện **FAILED** `MISA_LIVE_NOT_IMPLEMENTED`.

## UI

- Admin `/admin/tich-hop` (gate `settings:view`): mục MISA hiển thị trạng thái + log.
  Nút **Bật/Tắt sync** + **Chạy thử** (gate `settings:edit` = SUPER_ADMIN).

## Test

1. Mặc định tắt → "Chạy thử" → IntegrationLog SKIPPED ("MISA sync đang tắt").
2. Bật sync (chưa có credential) → Chạy thử → SKIPPED ("Thiếu credential MISA").
3. Set env MISA_* (không MISA_LIVE) + bật → Chạy thử → SUCCESS (mô phỏng), responsePayload.simulated=true.
4. `/admin/tich-hop` hiển thị đúng trạng thái + log.
