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

## Mẫu "Chúc mừng sinh nhật" (06/08/2026) — VIỆC CÒN LẠI CỦA NGƯỜI DÙNG

Tính năng sinh nhật học viên đã chạy đủ (nhắc việc Sale/QLCS/GV, màn `/admin/sinh-nhat`,
cron `student-birthday`). Riêng **tin nhắn ZNS chưa gửi được** vì mẫu chưa tồn tại trên ZBS —
hệ thống tự `SKIPPED` an toàn cho tới khi có mẫu, không nổ lỗi, không chặn phần còn lại.

Các bước bật:

1. **Tạo mẫu trên ZBS** — loại *Mẫu tuỳ chỉnh*, mục đích **Chăm sóc khách hàng**.
   Khai đúng **2 tham số**, đúng tên (tên là hợp đồng, sai tên → Zalo trả `-1122`, tin không tới
   mà log ứng dụng vẫn sạch — xem `lib/zalo/templates.ts`):

   | Tham số | Kiểu | Giới hạn | Ví dụ |
   |---|---|---|---|
   | `studentName` | string | 50 | `Nguyễn Văn A` |
   | `date` | string | 20 | `20/08/2026` |

2. **Chờ Zalo duyệt** (2–3 ngày làm việc). Đừng đặt ID mẫu chưa duyệt vào cấu hình.
3. Duyệt xong: mở bảng "Nội dung tham số" thật trên ZBS **đối chiếu** với
   `ZNS_BIRTHDAY_PARAM_SPEC` trong `lib/zalo/templates.ts`. Lệch → sửa bảng khai trong code
   (test bất biến `templates.test.ts` sẽ bắt nếu hàm dựng params không khớp).
4. Vào `/admin/cau-hinh-van-hanh` → key `zalo.znsTemplateBirthday` → nhập **có nháy kép**:
   `"616xxx"` (ô nhận JSON; gõ số trần sẽ thành number và bị Zod chặn).
5. Kiểm trên prod: `/admin/sinh-nhat` cột "Tin Zalo".
   - `Đã gửi` = tin thật đã đi.
   - `Mô phỏng (chưa gửi thật)` = `ZALO_LIVE` chưa bật ⇒ **phụ huynh KHÔNG nhận gì**.
   - `Bỏ qua` = chưa có mẫu hoặc phụ huynh không có SĐT.

⚠️ Tin CSKH **dính khung cấm 22:00–06:00** (`-133`), khác tin Xác thực được miễn. Cron chạy
`0 1 * * *` UTC = **08:00 giờ VN** nên an toàn — đừng dời lịch cron ra ngoài khung 06:00–22:00.

⚠️ Không kiểm được trên `test`: credential Zalo chỉ có ở scope Production và **cấm nhân bản
`ZALO_OA_REFRESH_TOKEN`** sang môi trường 2 (token xoay vòng, hai môi trường giết token của nhau).
Tắt riêng tin sinh nhật mà vẫn giữ nhắc việc: đặt `student.birthdayZnsEnabled` = `false`.
