# Ticket A0-07 — DomainEvent outbox + dispatcher

| | |
|---|---|
| **PR** | PR-A0-07 | **Ưu tiên** | P1 | **Ước lượng** | 4 ngày |
| **Phụ thuộc** | A0-01 | **Feature flag** | `dispatcher_enabled` (tắt được) | **Trạng thái** | TODO |
| **Nguồn** | Doc 15 §4.5 | | | |

---

## 1. Mục tiêu & bối cảnh
Giải **P4** (side-effects gọi dính chùm inline). Cơ chế outbox: ghi `DomainEvent` trong transaction nghiệp vụ → dispatcher (cron) gọi các handler đăng ký theo `type`, idempotent + retry. Thêm consumer mới = 1 dòng đăng ký, không sửa publisher.

## 2. Phạm vi
**In:** model `DomainEvent`; `publishEvent(type, payload, {tx})`; registry `on(type, handler)`; dispatcher cron `/api/cron/dispatch-events` (1') xử lý batch PENDING; retry + maxAttempts + FAILED; idempotency key. Demo `demo.ping` với 2 handler để chứng minh.
**Out:** chuyển luồng thật (order.confirmed/attendance.marked) sang event — làm ở R1/R2/R3 khi tới (ở A0 chỉ dựng cơ chế + demo).

## 3. Thiết kế kỹ thuật
```prisma
model DomainEvent {
  id           String   @id @default(cuid())
  type         String
  payloadJson  Json
  status       String   @default("PENDING")  // PENDING/PROCESSING/DONE/FAILED
  attempts     Int      @default(0)
  maxAttempts  Int      @default(5)
  lastError    String?
  dedupeKey    String?  @unique               // idempotency producer-side
  createdAt    DateTime @default(now())
  processedAt  DateTime?
  @@index([status, createdAt])
  @@index([type])
}
```
- `publishEvent` nhận `tx` (Prisma transaction client) → ghi event **trong cùng transaction** với nghiệp vụ → commit mới PENDING.
- Dispatcher: `findMany({status:PENDING, take:N})` → set PROCESSING → chạy handlers theo type (Promise.allSettled) → DONE; lỗi → attempts++, nếu < maxAttempts giữ PENDING (backoff), else FAILED.
- Handler tự idempotent (dùng `event.id` làm khóa chống chạy lại; hoặc kiểm tra hệ quả đã tồn tại).
- Registry: `on('order.confirmed', handler)` — nhiều handler/1 type.

## 4. Acceptance Criteria
- **AC1** `publishEvent` trong transaction: rollback transaction → KHÔNG có event (atomic).
- **AC2** Commit transaction → event PENDING; dispatcher xử lý → DONE.
- **AC3** Handler lỗi → attempts++; còn lượt → giữ PENDING; hết lượt → FAILED + lastError.
- **AC4** Handler idempotent: cùng event chạy 2 lần → hệ quả 1 lần.
- **AC5** Thêm handler thứ 2 cho cùng type = 1 dòng `on()`, KHÔNG sửa publisher; cả 2 handler đều chạy.
- **AC6** 1 handler fail không chặn handler khác cùng event (allSettled).
- **AC7** `dedupeKey` trùng → không tạo event trùng.
- **AC8** `dispatcher_enabled=false` → dispatcher không chạy (rollback).

## 5. Files dự kiến
```
prisma/schema/shared.prisma (DomainEvent)
lib/events/publish.ts · lib/events/registry.ts · lib/events/dispatcher.ts
app/api/cron/dispatch-events/route.ts (CRON_SECRET)
lib/events/_demo/ping-handlers.ts
lib/events/publish.test.ts · lib/events/dispatcher.test.ts
```
+ vercel.json: cron `*/1 * * * *`.

## 6. Edge cases
- Dispatcher chạy chồng (2 cron tick) → lock optimistic (status PROCESSING + updatedAt) tránh xử lý đôi.
- Handler ném lỗi không bắt → allSettled cô lập; event không DONE.
- Event PROCESSING treo (crash giữa chừng) → reaper đưa về PENDING sau timeout.
- payload lớn → giới hạn kích thước, cảnh báo.
- maxAttempts đạt → FAILED, không chạy nữa, hiện ở viewer để xử lý tay.
- Thứ tự event không đảm bảo strict → handler không phụ thuộc thứ tự (idempotent).

## 7. Rollback / flag
`dispatcher_enabled=false` dừng xử lý (event vẫn tích PENDING, không mất). Có thể replay sau.

## 8. Test plan
### T1/T6 — Functional / atomic / idempotent
| Case | B/E | | Mong đợi |
| A0-07-T6-01 | B | publish trong tx rồi rollback | không có event (AC1) |
| A0-07-T1-01 | B | commit → dispatcher | event DONE (AC2) |
| A0-07-T6-02 | B | handler chạy 2 lần cùng event | hệ quả 1 lần (AC4) |
| A0-07-T6-03 | B | dedupeKey trùng | không tạo trùng (AC7) |
| A0-07-T6-04 | E | 2 dispatcher tick song song | không xử lý đôi |
### T8 — Retry / resilience
| A0-07-T8-01 | B | handler fail | attempts++, giữ PENDING (AC3) |
| A0-07-T8-02 | B | fail tới maxAttempts | FAILED + lastError (AC3) |
| A0-07-T8-03 | B | 1 trong 2 handler fail | handler kia vẫn DONE (AC6) |
| A0-07-T8-04 | E | event PROCESSING treo | reaper đưa về PENDING |
### T5 (extensibility) / T12
| A0-07-T5-01 | B | thêm handler thứ 2 = 1 dòng on() | cả 2 chạy, publisher không đổi (AC5) |
| A0-07-T12-01 | B | dispatcher_enabled=false | không chạy (AC8) |
### T11
| A0-07-T11-01 | E | 100 event PENDING | xử lý theo batch, không quá tải |

## 9. Test data
Demo type `demo.ping` + 2 handler (handlerA ghi marker, handlerB ghi marker). Event fixture PENDING/FAILED.

## 10. RTM
AC1→T6-01 · AC2→T1-01 · AC3→T8-01/02 · AC4→T6-02 · AC5→T5-01 · AC6→T8-03 · AC7→T6-03 · AC8→T12-01.

## 11. DoD
```
[ ] AC1–AC8 case (B) PASS · cron đăng ký · cờ tắt hoạt động
[ ] typecheck+lint+build PASS · board+RTM cập nhật
```
