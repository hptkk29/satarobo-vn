# flows.md — Luồng có tiền, quyền và tác dụng phụ

Chỉ ghi luồng chạm tiền, quyền, toàn vẹn dữ liệu hoặc tác dụng phụ bên ngoài. Mọi bước "Ghi" đều là một lần gọi `ghiNghiepVuTien` (khoá gia đình → quyền trên dòng → bất biến → commit).

Ký hiệu cột **Từ chối khi**: trường hợp phải deny, kèm mã lỗi.

---

## F-01 · Tạo đơn nhiều con

**Actor:** Sale · **Điều kiện:** lead "Đã đăng ký", công tắc bật cho `orgUnitId` · **Thành công:** 1..n ghi danh + bảng giá + ưu đãi + đợt thu; ví được chia nếu có

| # | Bước | Tầng | Kiểm quyền | Từ chối khi | Ghi / tác dụng phụ |
|---|---|---|---|---|---|
| 1 | Mở form từ lead | UI → Server | `billing:create-order` trên lead (OWN) | Lead ngoài phạm vi → 404 | — |
| 2 | Chọn con, khoá, mẫu kế hoạch | UI | — | — | — |
| 3 | Tính xem trước (giá, ưu đãi, đợt, ví) | Server `preview.ts` | như 1 | Giới hạn chính sách bị vượt mà thiếu `billing:out-of-guardrail` → `NGOAI_GIOI_HAN` | Trả `expectedHash` |
| 4 | Xác nhận | Server → Ghi | Quyền trên mọi ghi danh sinh ra | Hash lệch → `DU_LIEU_DA_DOI`; bất biến → `B*` | Enrollment, PriceSegment, Discount, PaymentRequest, WalletEntry (nếu chia), MoneyOperation, AuditLog |
| 5 | Sau commit | Server | — | — | Lead đóng theo luồng hiện có; thông báo nội bộ (không bắn khi rollback) |

## F-02 · Phát hành kỳ thu

**Actor:** Sale/Kế toán · **Thành công:** PaymentBill OPEN + dòng + VA/QR

| # | Bước | Kiểm quyền | Từ chối khi | Ghi / tác dụng phụ |
|---|---|---|---|---|
| 1 | Tick con, đợt, số tiền dòng | `billing:issue-bill` trên mọi ghi danh được tick | Đợt đã trong kỳ thu OPEN → `B7`; dòng > còn nợ đợt → `VUOT_CON_NO`; hai đơn vị kế toán → `B8` | — |
| 2 | Xác nhận | như 1 | — | PaymentBill, PaymentBillLine, MoneyOperation |
| 3 | Xin VA | Server → SePay (nếu dùng VA) | — | Lỗi SePay → kỳ thu vẫn OPEN, dùng mã kỳ thu trong nội dung | Gọi ra ngoài **sau** commit; lưu VA bằng cập nhật riêng |

## F-03 · Huỷ / đóng kỳ thu

| # | Bước | Kiểm quyền | Từ chối khi | Ghi |
|---|---|---|---|---|
| 1 | Huỷ | `billing:issue-bill` | Kỳ thu đã nhận ≥ 1đ → `KY_THU_DA_CO_TIEN` | status CANCELLED |
| 2 | Đóng | như trên | Kỳ thu chưa nhận đồng nào → dùng Huỷ | status CLOSED_PARTIAL |

## F-04 · Tiền về từ SePay

**Actor:** SePay (hệ thống) · **Ranh giới:** internet → webhook

| # | Bước | Kiểm | Từ chối khi | Ghi / tác dụng phụ |
|---|---|---|---|---|
| 1 | Nhận POST | Khoá xác thực SePay | Sai khoá → 401 **và** ghi log cảnh báo (không im lặng) | Log giao dịch |
| 2 | Chống trùng | `bankTxnId` đã có | Đã có → 200, không làm gì | — |
| 3 | Khớp VA → mã kỳ thu → SĐT | `lib/finance/matching` | — | — |
| 4a | Khớp kỳ thu OPEN | Ghi (actor SYSTEM_WEBHOOK, khoá gia đình) | Bất biến → rollback, đánh dấu "Cần xử lý: lỗi ghi" | PAYMENT theo dòng; thừa → ví OVERPAY |
| 4b | Kỳ thu không OPEN | Ghi | — | Ví + "Cần xử lý" |
| 4c | SĐT duy nhất | Ghi | — | Ví UNMATCHED_TO_WALLET + "Cần xử lý: chia ví" |
| 4d | Không khớp | — | — | Chỉ log + "Cần xử lý: chưa gán" |
| 5 | Phản hồi | — | — | Luôn 200 sau bước 2 (không từ chối vì lệch số) |
| 6 | Sau commit | — | — | Thông báo nội bộ cho sale phụ trách khi có "Cần xử lý" |

Webhook **không** gọi `allocateByWeight`, không sinh TRANSFER/REFUND/QUYẾT TOÁN.

## F-05 · Ghi tiền mặt

| # | Bước | Kiểm quyền | Từ chối khi | Ghi |
|---|---|---|---|---|
| 1 | Sale ghi trên kỳ thu | `billing:record-cash` | Kỳ thu không OPEN | PAYMENT RECORDED theo dòng (method CASH) |
| 2 | Kế toán xác nhận / từ chối | `payments:confirm` | Người ghi = người xác nhận (khuyến nghị tách vai) | CONFIRMED / REJECTED; dòng kỳ thu mở lại khi REJECTED |

## F-06 · Gán giao dịch và chia ví

| # | Bước | Kiểm quyền | Từ chối khi | Ghi |
|---|---|---|---|---|
| 1 | Gán giao dịch "chưa gán" vào gia đình | `billing:split-wallet` + phạm vi trên gia đình | Giao dịch đã gán → `DA_GAN` | WalletEntry +, liên kết `bankTxnId` |
| 2 | Chia ví cho các con | như trên + trên mọi ghi danh nhận | Tiền chưa CONFIRMED → `B9`; vượt còn nợ → `B1`; vượt ví → `B4` | WalletEntry −, PAYMENT (loại TRANSFER từ ví, hoặc PAYMENT gắn `bankTxnId` gốc — chốt ở US-12) |
| 3 | Đảo gán nhầm gia đình | `payments:confirm` (kế toán) | Ví gia đình sai không đủ số dư → phải thu hồi từ ghi danh trước | WalletEntry −/+ hai gia đình, cùng operation |

## F-07 · Dừng học và quyết toán (luồng rủi ro cao nhất)

**Actor:** Sale · **Thành công:** ghi danh STOPPED, không còn khoản treo

| # | Bước | Kiểm quyền | Từ chối khi | Ghi / tác dụng phụ |
|---|---|---|---|---|
| 1 | Chọn lý do + buổi cuối | `enrollments:stop` trên ghi danh | Ghi danh STOPPED → `DA_DUNG` | — |
| 2 | Gợi ý buổi đã dùng; sale sửa | như 1 | Sửa không ghi chú → chặn | — |
| 3 | Xem trước: quyết toán + ưu đãi liên đới + kỳ thu mở | `enrollments:stop` + đọc mọi ghi danh anh/chị em | — | `expectedHash` |
| 4 | Chọn nơi đi của khoản dư | `billing:transfer` trên ghi danh đích; `billing:forfeit` nếu không hoàn | Σ ≠ chênh → `B1`; khác đơn vị → `B8`; không hoàn khi `allowForfeit=false` hoặc vượt trần → `NGOAI_GIOI_HAN` | — |
| 5 | Xác nhận | Quyền trên **mọi** ghi danh bị chạm (dừng, nhận dư, bị tính lại ưu đãi) | Hash lệch → `DU_LIEU_DA_DOI` | EnrollmentEvent; huỷ đợt CHƯA_THU; QUYẾT TOÁN; TRANSFER/ví; PriceSegment tách; huỷ-tạo đợt anh/chị em hoặc QUYẾT TOÁN +; huỷ/đóng kỳ thu; MoneyOperation |
| 6 | Sau commit | — | — | Chọn hoàn → việc cho kế toán; thông báo nội bộ |

**Điểm có thể bị bỏ qua nếu làm sai:** kiểm quyền ở bước 5 chỉ trên ghi danh dừng (bỏ sót ghi danh nhận dư và anh/chị em) → sale chạm tiền con do sale khác phụ trách. Test TS-06.

## F-08 · Chuyển tiền giữa các con

| # | Bước | Kiểm quyền | Từ chối khi | Ghi |
|---|---|---|---|---|
| 1 | Chọn nguồn, đích, số | `billing:transfer` trên cả hai | Khác gia đình / khác đơn vị → `B8`; vượt CONFIRMED nguồn → `B9`; đích vượt phải thu → `B1` | TRANSFER −/+ |

## F-09 · Bảo lưu / Học lại

| # | Bước | Kiểm quyền | Từ chối khi | Ghi |
|---|---|---|---|---|
| 1 | Bảo lưu | `enrollments:pause` | Quá `maxPauseDays` mà thiếu `billing:out-of-guardrail` | EnrollmentEvent; cập nhật `dueDate` của đợt chưa tới hạn (hạn không phải số tiền nên được cập nhật tại chỗ; hạn cũ lưu trong `previewSnapshot` của MoneyOperation) |
| 2 | Học lại | `enrollments:resume` | Không PAUSED | EnrollmentEvent; status ACTIVE |

## F-10 · Đổi khoá / đổi cơ sở

Gộp F-07 (phí = 0) + F-01 (một ghi danh) + F-08 trong **một** `MoneyOperation`. Khác đơn vị kế toán: không có F-08; dư vào ví đơn vị cũ; sinh việc hoàn.

## F-11 · Hoàn tiền

| # | Bước | Kiểm quyền | Từ chối khi | Ghi / tác dụng phụ |
|---|---|---|---|---|
| 1 | Chọn khoản chờ hoàn / ví | `billing:refund` | Vượt số dư ví → `B4`; thiếu chứng từ | WalletEntry REFUND −; Payment REFUND (nếu từ ghi danh) |
| 2 | Chi tiền thật | Ngoài hệ thống (ngân hàng) | — | Hệ thống **không** gọi chuyển tiền ra; chỉ lưu chứng từ |

## F-12 · Miễn giảm / vượt giới hạn

| # | Bước | Kiểm quyền | Từ chối khi | Ghi |
|---|---|---|---|---|
| 1 | Miễn giảm | `billing:waive` | > còn nợ | QUYẾT TOÁN − có lý do |
| 2 | Mở khoá giới hạn cho 1 thao tác | `billing:out-of-guardrail` | Không có lý do | Cờ trên MoneyOperation của thao tác đó |

## F-13 · Cấu hình chính sách

| # | Bước | Kiểm quyền | Từ chối khi | Ghi |
|---|---|---|---|---|
| 1 | Lưu phiên bản | `billing-policy:manage` (GLOBAL) | Thiếu lý do / số văn bản; giá trị ngoài khoảng | BillingPolicyVersion mới; AuditLog |
