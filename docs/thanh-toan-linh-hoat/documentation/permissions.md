# permissions.md — Quyền của module thu học phí linh hoạt

## 1. Vai trò và nguồn phạm vi

| Vai trò | Nguồn | Phạm vi mặc định trong module |
|---|---|---|
| Sale (sale_cs) | Phiên + RBAC v2 (DB) | OWN = chủ gia đình (chủ lead) **hoặc** chủ ghi danh |
| QLCS | RBAC v2 | CENTER (cơ sở của ghi danh) |
| Kế toán | RBAC v2 | CENTER hoặc REGION theo phân công |
| Admin | RBAC v2 | GLOBAL |
| SUPER_ADMIN | `can()` trả true trước khi tra bảng | GLOBAL — bất biến B1–B9 vẫn áp |
| SYSTEM_WEBHOOK | Khoá SePay | Chỉ sinh PAYMENT, ví OVERPAY / UNMATCHED_TO_WALLET |
| SYSTEM_CRON | `CRON_SECRET` | Chỉ-đọc dữ liệu tiền; ghi bảng tổng hợp quá hạn, kết quả kiểm cân |

Phạm vi được tính **ở server** từ DB, không lấy từ tham số client. Tên quyền dưới đây là tên dự kiến — đối chiếu catalog 202 quyền hiện có ở US-01 (G0-8) trước khi seed.

## 2. Ma trận tài nguyên × thao tác × vai trò

| Tài nguyên | Thao tác | Quyền | Sale | QLCS | Kế toán | Admin | Webhook | Cron |
|---|---|---|---|---|---|---|---|---|
| Hồ sơ gia đình | Xem | `billing:view-family` | OWN | ✓ | ✓ | ✓ | — | — |
| Ghi danh | Tạo (tạo đơn / thêm con) | `billing:create-order` | OWN | ✓ | — | ✓ | — | — |
| Đợt thu | Sửa trong giới hạn | `billing:edit-plan` | OWN | ✓ | — | ✓ | — | — |
| Đợt thu / chính sách | Vượt giới hạn cho 1 thao tác | `billing:out-of-guardrail` | — | ✓ | — | ✓ | — | — |
| Kỳ thu | Phát hành / huỷ / đóng | `billing:issue-bill` | OWN | ✓ | ✓ | ✓ | — | — |
| Dòng tiền | Ghi tiền mặt (RECORDED) | `billing:record-cash` | OWN | ✓ | ✓ | ✓ | — | — |
| Dòng tiền | Ghi PAYMENT từ ngân hàng | (nội bộ) | — | — | — | — | ✓ | — |
| Dòng tiền | Xác nhận / từ chối | `payments:confirm` | — | — | ✓ | ✓ | — | — |
| Dòng tiền | Điều chỉnh (có sẵn) | `payments:adjust` | — | — | ✓ | ✓ | — | — |
| Ví | Gán giao dịch vào gia đình / chia ví | `billing:split-wallet` | OWN | ✓ | ✓ | ✓ | — | — |
| Ví | Đảo gán nhầm gia đình | `payments:confirm` | — | — | ✓ | ✓ | — | — |
| Dòng tiền | Chuyển giữa các con | `billing:transfer` | OWN (cả 2 ghi danh) | ✓ | ✓ | ✓ | — | — |
| Ghi danh | Dừng / bảo lưu / học lại / đổi khoá | `enrollments:stop` · `pause` · `resume` · `change-course` | OWN | ✓ | — | ✓ | — | — |
| Quyết toán | Không hoàn | `billing:forfeit` | — | ✓ | — | ✓ | — | — |
| Quyết toán | Miễn giảm | `billing:waive` | — | ✓ | — | ✓ | — | — |
| Ví / dòng tiền | Hoàn tiền | `billing:refund` | — | — | ✓ | ✓ | — | — |
| Chính sách | Xem / lưu phiên bản | `billing-policy:manage` | — | xem | xem | ✓ | — | — |
| Báo cáo nghiệp vụ theo nhân viên | Xem | `billing:report-operations` | — | CENTER | — | ✓ | — | — |
| Kiểm cân / quá hạn | Chạy | (nội bộ) | — | — | — | — | — | ✓ |

## 3. Luật đặc biệt

1. **Mọi ghi danh bị chạm.** Thao tác sinh dòng trên nhiều ghi danh (dừng học có chuyển dư, ưu đãi liên đới, đổi khoá) chỉ thành công khi actor có quyền tương ứng trên **tất cả** ghi danh đó. Kiểm trong `ghiNghiepVuTien` từ dòng sinh ra.
2. **Tách vai tiền mặt.** Khuyến nghị: người ghi tiền mặt không tự xác nhận khoản của mình (cấu hình; mặc định chặn).
3. **Cùng gia đình, cùng đơn vị kế toán.** Không quyền nào vượt được B8 trong V1.
4. **Deny không lộ tồn tại.** Gia đình ngoài phạm vi → 404; lỗi không in số tiền, tên con.
5. **Ẩn nút không phải kiểm quyền.** Mọi Server Action tự kiểm; test deny gọi action trực tiếp.

## 4. RLS và kiểm tra bằng mã

| Bảng | RLS | Chặn thật nằm ở |
|---|---|---|
| `MoneyOperation`, `GuardianWalletEntry`, `EnrollmentPriceSegment`, `EnrollmentDiscount`, `PaymentBill`, `PaymentBillLine`, `EnrollmentEvent`, `BillingPolicyVersion` | ENABLE, 0 policy (chặn mọi truy cập qua anon/authenticated key) | Mã server qua Prisma (service connection) |
| `Payment`, `PaymentRequest`, `Enrollment` (có sẵn) | Theo hiện trạng — đo ở US-01 | Mã server |

Hệ quả: an toàn dữ liệu tiền phụ thuộc hoàn toàn vào kiểm quyền server + đường ghi duy nhất. Không có truy vấn client-side trực tiếp tới Supabase cho các bảng này.
