# cron.md — Việc định kỳ

| Việc | Lịch | Hàm | Secret | Giới hạn | Idempotent | Thử lại |
|---|---|---|---|---|---|---|
| Tính quá hạn + nhắc sale | Hằng ngày 07:00 (giờ VN) | `cron/qua-han-hoc-phi` | `CRON_SECRET` | Toàn bộ gia đình có ghi danh ACTIVE; phân trang 500 | Upsert bảng tổng hợp theo (ngày, enrollmentId); thông báo dedupeKey `hocphi.quahan:<guardianId>:<yyyy-mm-dd>` | Vercel tự không thử lại; lần chạy sau sẽ ghi đè cùng ngày |
| Kiểm cân gia đình | Hằng ngày 02:00 | `cron/kiem-can-gia-dinh` | `CRON_SECRET` | Toàn bộ gia đình × đơn vị kế toán | Kết quả upsert theo (ngày, guardianId, accountingUnitId); thông báo dedupeKey theo ngày | Như trên |
| Cảnh báo không nhận giao dịch | Mỗi giờ, 08:00–21:00 | `cron/giam-sat-sepay` | `CRON_SECRET` | 1 truy vấn đếm | dedupeKey theo khung giờ | — |
| Nhắc "Cần xử lý" tồn | Mỗi 2 giờ, 08:00–21:00 | `cron/nhac-can-xu-ly` | `CRON_SECRET` | Dòng tồn > `billing.unmatchedAlertHours` | dedupeKey theo dòng + ngày | — |
| Hết hạn bảo lưu | Hằng ngày 07:00 | gộp trong `cron/qua-han-hoc-phi` | `CRON_SECRET` | Ghi danh PAUSED quá `pauseUntil` | dedupeKey theo enrollmentId + ngày | — |
| Shadow-compare công nợ (có sẵn) | Theo workflow | `shadow-compare-cong-no.yml` | Secret GitHub chỉ-đọc | — | Chỉ-đọc | — |

## Luật an toàn

1. **Không cron nào ghi dòng tiền** (`Payment`, `PaymentRequest`, `GuardianWalletEntry`). Phí trễ (nếu bật) được **gợi ý** trong danh sách quá hạn; sale/QLCS bấm để ghi qua `ghiNghiepVuTien`.
2. Mọi route cron từ chối khi thiếu hoặc sai `CRON_SECRET` (401), kiểm bằng so sánh thời gian hằng.
3. Cron chạy theo giờ VN; Vercel Cron dùng UTC — lịch ở trên phải quy đổi khi khai báo `vercel.json`.
4. Xem lần chạy gần nhất: bảng kết quả kiểm cân (theo ngày) và log Vercel Cron.
5. Trước đây có 5 cron chạm tiền chưa từng chạy trên test: mọi cron ở trên phải chạy thử trên test.satarobo.vn ít nhất 3 lần trước khi bật prod.
