# cron.md — Công việc nền theo lịch (INTENDED STATE)

> Nền dùng Vercel Cron (không worker riêng). Mọi job xác thực bằng header `CRON_SECRET`; thiếu/sai → 401 và ghi log.

## Bảng job

| Job | Lịch | Hàm | Secret | Giới hạn | Idempotent bằng cách nào | Retry |
|---|---|---|---|---|---|---|
| J1 — Đối soát backfill | 02:00 hằng đêm (P1→P4) | `/api/cron/reconcile-orgunit` | CRON_SECRET | timeout 60s; chỉ đếm, không sửa | Chỉ đọc + ghi 1 bản ghi báo cáo theo ngày (upsert theo date) | Không tự retry; lệch → alert cho Dev |
| J2 — Đóng hiệu lực (báo cáo) | 03:00 hằng đêm | `/api/cron/effective-report` | CRON_SECRET | chỉ đọc | Assignment/WorkScope hết hạn TỰ tắt trong resolver — job này chỉ báo cáo danh sách sắp/đã hết hạn, không ghi | — |
| J3 — Tổng hợp log shadow | 04:00 hằng đêm (chỉ P3) | `/api/cron/shadow-digest` | CRON_SECRET | chỉ đọc log | Upsert digest theo ngày | — |

**Nguyên tắc thiết kế cố ý:** không job nào GHI thay đổi quyền. Hết hạn quyền là thuộc tính resolver kiểm lúc chạy (US-09, US-10) — nếu cron chết, quyền vẫn đúng. Cron chỉ đối soát và báo cáo.

## Vận hành

- Xem lần chạy gần nhất: bảng `CronRunLog` (job, startedAt, kết quả, số liệu chính) + Vercel dashboard.
- Job fail 2 đêm liên tiếp → chặn cổng chuyển pha cho tới khi giải thích được.
- Sau P4: J1, J3 gỡ; J2 giữ.
