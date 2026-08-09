# cron.md — Công việc theo lịch

Module chat có **một** job. (Vercel Cron của hệ thống có thể có job khác ngoài module — ngoài phạm vi tài liệu này.)

| Job | Lịch | Hàm | Secret | Giới hạn | Retry |
|---|---|---|---|---|---|
| Đối soát thành viên (US-04) | Hằng đêm 02:00 Asia/Ho_Chi_Minh | `reconcileConversationMembership` | `CRON_SECRET` header — sai/thiếu → 401 trước mọi việc | Chỉ lớp ACTIVE; timeout theo hạn mức Vercel — nếu vượt, chia batch theo cơ sở | Không auto-retry (đêm sau chạy lại là đủ); fail → log ERROR |

## Hành vi

1. Với mỗi lớp ACTIVE: tính lại tập thành viên dẫn xuất (GV phân công + PH học viên + QLCS) và so với participant DERIVED hiện có.
2. **Lệch REMOVE** (người phải rời mà chưa) → set `leftAt` NGAY trong job, rồi log — rò rỉ quyền không chờ người xử lý.
3. **Lệch ADD** (người phải có mà thiếu) → CHỈ log, chờ người xử lý — thêm nhầm người vào nhóm là rủi ro riêng tư, không tự thi hành.
4. Không lệch → log một dòng `0 drift` (phân biệt "sạch" với "job không chạy" — thiếu dòng này 2 đêm liên tiếp là tín hiệu điều tra).

## Idempotency & an toàn

- Chạy job 2 lần liên tiếp → kết quả y hệt (set `leftAt` đã set là no-op).
- Job **không** tạo participant, **không** hard delete, **không** đụng message — bề mặt ghi duy nhất là `leftAt` + bảng log drift.
- Log drift ghi: lớp · user · loại lệch · timestamp · gợi ý luồng nghi vấn. Xem tại route admin (US-04.3).

## Vận hành

- Xem lần chạy gần nhất: Vercel Cron dashboard + dòng log `0 drift`/danh sách drift.
- Trước Đợt 2: kiểm log 3 đêm liên tiếp trên staging (TS-07.4).
- Kill switch: tắt cron entry trên Vercel — hệ chạy tiếp bình thường, chỉ mất lưới đối soát (sync chính vẫn trong transaction nghiệp vụ).
