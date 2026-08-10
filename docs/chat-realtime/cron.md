# cron.md — Công việc theo lịch

Module chat có **hai** job. (Vercel Cron của hệ thống có thể có job khác ngoài module — ngoài phạm vi tài liệu này.)

| Job | Lịch | Hàm | Secret | Giới hạn | Retry |
|---|---|---|---|---|---|
| Đối soát thành viên (US-04) | Hằng đêm 02:00 Asia/Ho_Chi_Minh | `reconcileConversationMembership` | `CRON_SECRET` header — sai/thiếu → 401 trước mọi việc | Chỉ lớp ACTIVE; timeout theo hạn mức Vercel — nếu vượt, chia batch theo cơ sở | Không auto-retry (đêm sau chạy lại là đủ); fail → log ERROR |
| Nhắc tin nhắn qua ZNS (US-14) | Mỗi 30 phút (`*/30 * * * *`) | `sendChatZnsNotifications` | `CRON_SECRET` header | `chat.znsMaxPerRun` tin/lượt; 500 cặp ứng viên; nhìn lại 7 ngày | Không auto-retry — lượt sau (30 phút) nhặt lại phần còn tồn |

## Hành vi

1. Với mỗi lớp ACTIVE: tính lại tập thành viên dẫn xuất (GV phân công + PH học viên + QLCS) và so với participant DERIVED hiện có.
2. **Lệch REMOVE** (người phải rời mà chưa) → set `leftAt` NGAY trong job, rồi log — rò rỉ quyền không chờ người xử lý.
3. **Lệch ADD** (người phải có mà thiếu) → CHỈ log, chờ người xử lý — thêm nhầm người vào nhóm là rủi ro riêng tư, không tự thi hành.
4. Không lệch → log một dòng `0 drift` (phân biệt "sạch" với "job không chạy" — thiếu dòng này 2 đêm liên tiếp là tín hiệu điều tra).

## Idempotency & an toàn

- Chạy job 2 lần liên tiếp → kết quả y hệt (set `leftAt` đã set là no-op).
- Job **không** tạo participant, **không** hard delete, **không** đụng message — bề mặt ghi duy nhất là `leftAt` + bảng log drift.
- Log drift ghi: lớp · user · loại lệch · timestamp · gợi ý luồng nghi vấn. Xem tại route admin (US-04.3).

## Nhắc tin nhắn qua ZNS (US-14) — hành vi

> Chốt chủ dự án 09/08/2026: kênh là **ZNS Zalo**, KHÔNG phải Web Push (Web Push để đợt sau).

1. Chỉ hội thoại **CLASS_GROUP** đang ACTIVE. **Nhắn riêng (DM) TUYỆT ĐỐI KHÔNG GỬI** — luật cứng nằm ngay ở mệnh đề `where` của truy vấn ứng viên, không có công tắc nào mở được.
2. Chỉ tin của **GV / quản lý cơ sở**; tin của phụ huynh khác trong nhóm không kích hoạt (`isStaffSender`, fail-closed).
3. Chỉ khi phụ huynh **chưa đọc quá ngưỡng**: `chat.znsUnreadMinutes` (mặc định 360 = 6 tiếng), THÔNG BÁO dùng ô riêng `chat.znsAnnouncementUnreadMinutes` để hạ xuống 30 phút mà không cần deploy.
4. Tin mốc = tin **cũ nhất** chưa đọc đã quá ngưỡng — tất định giữa các lượt quét, nhờ vậy khoá UNIQUE mới chặn được trùng.
5. `muted`: tin thường bị bỏ qua, THÔNG BÁO vẫn gửi (US-14 AC2).
6. **Khung cấm 22:00–06:00 giờ VN** (tin CSKH, mã Zalo `-133`): lượt rơi vào khung trả `reason: "QUIET_HOURS"` và không gửi gì. Việc "dời sang 06:00 sáng hôm sau" là hệ quả tự nhiên của cơ chế quét — và nếu trong đêm phụ huynh đã đọc thì sáng ra tin không còn trong danh sách ⇒ **tự huỷ, không tốn tiền**.
7. **Nội dung tin nhắn KHÔNG bao giờ rời hệ thống** (BR-30): mẫu ZNS chỉ có 3 tham số `className` / `senderName` / `time`.

### Idempotency & tiền

- Sổ `ChatZnsNotification` + UNIQUE `(conversationId, userId, messageId)`. Quy trình: **giành chỗ (PENDING) → gửi → ghi kết quả**. Hai lượt cron chồng nhau thì lượt sau đâm UNIQUE và bỏ qua.
- Trần chống bão: 1 tin/phụ huynh/hội thoại trong `chat.znsCooldownMinutes` (mặc định 360). Trần lượt: `chat.znsMaxPerRun` (mặc định 100).
- Trạng thái ghi đúng sự thật: `SIMULATED` khi provider mô phỏng (`ZALO_LIVE` tắt) — **phụ huynh không nhận gì**, đừng đọc nhầm thành đã nhắc. Trên `test.satarobo.vn` mọi tin đều SIMULATED (creds Zalo chỉ có ở Production).
- Không có email dự phòng (khác `birthday-zns.ts`, cố ý): thiếu credential Zalo là tình trạng thường trực của môi trường test, fallback sẽ bắn email thật cho phụ huynh thật từ site UAT.

### Kill switch

Nhanh nhất **không phải** xoá cron mà là tắt `chat.znsNotifyEnabled` ở `/admin/cau-hinh-van-hanh` (hiệu lực ≤5 phút theo cache setting). Xoá `chat.znsTemplateNewMessage` cũng dừng gửi (`reason: "NO_TEMPLATE"`).

## Vận hành

- Xem lần chạy gần nhất: Vercel Cron dashboard + dòng log `0 drift`/danh sách drift.
- Trước Đợt 2: kiểm log 3 đêm liên tiếp trên staging (TS-07.4).
- Kill switch: tắt cron entry trên Vercel — hệ chạy tiếp bình thường, chỉ mất lưới đối soát (sync chính vẫn trong transaction nghiệp vụ).
