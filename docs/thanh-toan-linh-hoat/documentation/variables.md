# variables.md — Biến môi trường và cấu hình

Nguyên tắc V1: **không thêm biến môi trường mới** nếu tránh được. Công tắc và tham số nghiệp vụ nằm trong DB (`SystemSetting`, `BillingPolicyVersion`), không nằm trong env — tránh lặp lại cờ chết `PAYMENT_LEDGER_V2` (có trong mã, không có trong 40 biến env prod).

## 1. Biến môi trường

| Tên | Dùng bởi | Phạm vi | Nguồn | Xoay vòng | Rủi ro |
|---|---|---|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` (có sẵn) | Prisma | server | Vercel env | Theo Supabase | Lộ = toàn quyền DB (RLS không che service connection) |
| Khoá xác thực webhook SePay (có sẵn — tên thật đo ở US-01) | `app/api/…/webhook/sepay` | server | Vercel env | Khi nghi lộ; đổi đồng thời bên SePay | Lộ = giả mạo tiền về → ví gia đình bị bơm tiền ảo |
| `CRON_SECRET` (xác nhận có sẵn ở US-01) | Route cron | server | Vercel env | 6 tháng | Lộ = gọi cron; cron chỉ-đọc nên thấp |
| Token API SePay tạo VA (chỉ thêm nếu A2 cần gọi API) | `lib/finance/matching` / F-02 bước 3 | server | Vercel env | Theo SePay | Lộ = tạo VA rác |

**Xác nhận:** không biến nào ở trên có tiền tố `NEXT_PUBLIC_`; không biến nào được import từ file `"use client"`. Kiểm bằng grep ở pre-go-live.

**Bẫy đã biết:** `.claude/hooks/block-env-add.sh` không chạy (đọc biến không tồn tại); lưới an toàn thật là `.gitignore`. Không dựa vào hook khi thêm biến.

## 2. Cấu hình trong DB

| Khoá | Nơi | Mặc định | Ai đổi | Rủi ro khi sai |
|---|---|---|---|---|
| `billing.flexV1Enabled` (theo `orgUnitId`) | `SystemSetting` | TẮT | Admin | Bật khi chưa chuyển dữ liệu sổ B → đơn cũ không có đợt thu mới |
| Mọi tham số chính sách (BA mục 10) | `BillingPolicyVersion.params` | Xem BA | Admin (`billing-policy:manage`) | Bật phí dừng / không hoàn khi chưa có văn bản → khiếu nại |
| `billing.cashSelfConfirmBlocked` | `SystemSetting` | BẬT | Admin | Tắt = một người vừa ghi vừa xác nhận tiền mặt |
| `billing.unmatchedAlertHours` | `SystemSetting` | 12 | Admin | Quá lớn = tiền treo không ai thấy |
| `billing.noTransactionAlertHours` | `SystemSetting` | 4 (giờ làm việc) | Admin | Quá lớn = webhook chết im lặng lâu |

## 3. Checklist trước go-live

- [ ] Grep: 0 biến mới có `NEXT_PUBLIC_` liên quan tiền.
- [ ] Khoá webhook SePay prod ≠ test; bắn thử webhook sai khoá → 401 **và** có log cảnh báo.
- [ ] `CRON_SECRET` có trên prod và test; gọi cron không header → 401.
- [ ] `billing.flexV1Enabled` TẮT trên mọi `orgUnitId` trước khi deploy; bật tay cho cơ sở pilot.
- [ ] Phiên bản chính sách 1 trên prod có số văn bản BGĐ ký.
- [ ] Không nhân bản token xoay vòng (vd Zalo OA) sang môi trường test khi dựng dữ liệu thử.
