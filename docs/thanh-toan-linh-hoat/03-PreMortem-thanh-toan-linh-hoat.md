# Pre-Mortem — Thu học phí linh hoạt (16/09/2026)

**Giả định thất bại:** 14 ngày sau khi bật cho cả hai cơ sở, kế toán báo số công nợ trên màn không khớp sao kê, sale quay lại ghi Excel, phụ huynh phàn nàn bị nhắc nợ sai, và dev lại phải sửa dữ liệu tay. Chuyện gì đã xảy ra?

---

## Tigers — rủi ro thật

| # | Rủi ro | Bằng chứng / logic | Mức |
|---|---|---|---|
| T1 | **Hai sổ cùng sống.** Màn mới đọc `PaymentRequest`, còn báo cáo, ZNS nhắc học phí, trang đơn cũ vẫn đọc `OrderInstallment` hoặc tự cộng tiền → hai con số cho cùng một con | Đã từng có 5 định nghĩa "đã thu", 15 chỗ cộng trục A + 4 chỗ trục B; 3 chỗ quên `deletedAt` | **Chặn go-live** |
| T2 | **Webhook và sale ghi cùng lúc** trên cùng gia đình: tiền về đúng lúc sale bấm "Dừng học" → quyết toán dựa trên Đã thu cũ, phần tiền mới rơi vào đợt đã huỷ | Webhook là đường ghi độc lập; sự cố 8 cho thấy đường này ít được quan sát | **Chặn go-live** |
| T3 | **Số buổi đã dùng sai** do dữ liệu lớp/điểm danh lệch → quyết toán sai, tranh chấp với phụ huynh | Đã có bug lệch tên bài học giữa `ClassSession` và giáo trình; điểm danh sự kiện từng nằm ở sheet | **Chặn go-live** |
| T4 | **Chuyển tiền chéo pháp nhân.** Con A học CS1, con B học CS2; sale chuyển dư từ B sang A → tiền đi giữa hai công ty con mà kế toán không có chứng từ | AMIS đặt CS1/CS2 ở cấp "Công ty con"; mô hình nhượng quyền sẽ nhân lên | **Chặn go-live** |
| T5 | **Webhook bắn lại / ghi trùng** một giao dịch → Đã thu gấp đôi, dư ảo đi vào ví, sale chuyển tiền ảo | Chưa xác nhận log SePay có unique theo mã giao dịch ngân hàng (G0-3) | **Chặn go-live** |
| T6 | **Chính sách chưa ký nhưng mặc định đã chạy.** Sale bấm "không hoàn cọc" hoặc có phí dừng khi BGĐ chưa đồng ý → khiếu nại | Các con số phí, cọc, ưu đãi đều là câu treo Q4–Q8 | **Chặn go-live** |
| T7 | **Migration vỡ trên DB dev/test** vì DB đang phân kỳ với main, drift 14 bảng, và bảng đổi unique `PaymentRequest` có dữ liệu | 08/09 đo được main 242 / test 248 / dev 242 migration | **Chặn go-live** |
| T8 | **Cờ bật tính năng là cờ chết** — bật mà không đổi hành vi, hoặc tắt mà luồng mới vẫn chạy | `PAYMENT_LEDGER_V2` có 0 đường gọi thật | **Chặn go-live** |
| T9 | **Kỳ thu cũ bị phụ huynh chụp màn hình** rồi chuyển sau khi kỳ thu đã huỷ → tiền "mất tích" | QR bất biến là cố ý; phụ huynh hay lưu ảnh QR | Fast-follow (đã có luật vào ví, cần test + cảnh báo) |
| T10 | **Hoàn tiền sau khi hoa hồng đã tính** → hoa hồng trả thừa, không ai truy | Hoa hồng chia 3 vai theo tháng thu; module hoa hồng chưa làm | Fast-follow (để sẵn dữ liệu, ghi rõ trong tài liệu) |
| T11 | **Sale lạm dụng chuyển tiền** giữa các con để né nợ quá hạn hoặc làm đẹp số KPI | Không còn màn duyệt; thao tác có hiệu lực ngay | Fast-follow (báo cáo nghiệp vụ chuyển theo sale; QLCS xem hằng tuần) |
| T12 | **Làm tròn đơn giá buổi** làm Σ lệch vài trăm đồng, kiểm cân đêm báo đỏ liên tục, mọi người quen bỏ qua cảnh báo | 9.600.000 ÷ 48 tròn, nhưng khoá 10.000.000 ÷ 48 không tròn | Chặn go-live (luật phần lẻ vào buổi cuối + test) |
| T13 | **Tiền "chờ xác nhận" bị tính hai lần**: QR trừ phần RECORDED, quyết toán dùng CONFIRMED; kế toán REJECTED sau đó → phụ huynh bị báo nợ tăng bất ngờ | Hai trục A/B đã được đo lệch 3.500.000 trên fixture | Fast-follow |
| T14 | **Sale thao tác trên gia đình có con do sale khác phụ trách** → vi phạm phạm vi OWN, chạm tiền khách của người khác | Sale OWN theo chủ lead; hai con có thể khác sale | Chặn go-live |

## Paper Tigers — lo nhưng không đáng

| # | Mối lo | Vì sao không đáng |
|---|---|---|
| P1 | Chuyển đổi dữ liệu cũ phức tạp | Prod gần như 0 dòng tiền (07/09: 1 dòng). Vẫn đo lại ở G0-6, nhưng quy mô nhỏ |
| P2 | Hiệu năng khi tính waterfall mỗi lần đọc | ~200 học viên; mỗi gia đình vài chục dòng. Cache chỉ khi đo được chậm |
| P3 | Nội dung chuyển khoản vượt 25 ký tự | Mã kỳ thu 8 + khoảng trắng + SĐT 10 = 19 ký tự |
| P4 | Sale không hiểu khái niệm "ví" | Sale không cần hiểu kế toán; màn xem trước nói bằng tiền từng con. Kiểm bằng A3 |
| P5 | Phải xây lại toàn bộ hệ thanh toán | Xây trên `Payment` + `PaymentRequest` có sẵn, chỉ thêm bảng và loại dòng |

## Elephants — chưa ai nói tới

| # | Điều chưa ai đào | Cách điều tra |
|---|---|---|
| E1 | **Theo kế toán, tiền trong ví có phải doanh thu thực thu không?** Nếu có, báo cáo doanh thu tháng lệch với định nghĩa đang dùng cho dashboard QLCS | Hỏi kế toán trước Đợt 2 (Q3), ghi quyết định vào BA |
| E2 | **Phụ huynh có đồng ý số buổi đã dùng không?** Tranh chấp vắng không phép | Chốt Q6 bằng văn bản; in số buổi đã dùng + danh sách buổi trong màn xem trước để sale gửi phụ huynh |
| E3 | **Luật bảo vệ người tiêu dùng về giữ cọc/không hoàn** | Để `allowForfeit=false`; BGĐ hỏi pháp chế trước khi bật |
| E4 | **Ưu đãi anh em có áp khi hai con khác cơ sở/khác pháp nhân?** Ai chịu phần giảm | Q8; nếu áp thì phần giảm thuộc ghi danh được giảm, không chuyển chéo |
| E5 | **Khoá đổi số buổi giữa chừng** (chương trình 48 buổi sửa thành 45) thì bảng giá buổi của học viên đang học tính sao | Chụp `totalSessions` lúc chốt; đổi chương trình không đụng ghi danh cũ |
| E6 | **Ai sở hữu vận hành màn "Cần xử lý"** khi sale nghỉ ca? | Gán theo cơ sở của gia đình + nhắc QLCS khi tồn > 12 giờ |
| E7 | **Sự cố webhook 401 im lặng có tái diễn?** Nếu tái diễn, KR3/KR4 vô nghĩa | Kiểm tra cảnh báo webhook không nhận giao dịch trong N giờ giờ làm việc đã có chưa |

## Kế hoạch cho Tiger chặn go-live

| Rủi ro | Biện pháp | Chủ | Hạn |
|---|---|---|---|
| T1 | Cấm ghi `OrderInstallment` khi cờ bật (chặn ở đường ghi + test); liệt kê mọi chỗ đọc sổ B (G0-7) và chuyển về `debt.ts`; lint rule cấm `.reduce` trên `amount` ngoài `lib/finance/` | Kiệt | Đợt 1 chặn ghi (US-05); Đợt 4 chuyển dữ liệu (US-25) |
| T2 | Webhook dùng **cùng** `ghiNghiepVuTien` với khoá gia đình; màn xem trước mang hash trạng thái, lệch thì bắt mở lại | Kiệt | Đợt 1 (US-04), test ở Đợt 3 |
| T3 | Sale xác nhận số buổi đã dùng (sửa có ghi chú); hiển thị danh sách buổi; GATE G0-4 phải xanh trước Đợt 3 | Dev | Trước Đợt 3 |
| T4 | Bất biến B8 ở đường ghi; `accountingUnitId` trên ví và ghi danh; đổi cơ sở khác đơn vị → sinh việc cho kế toán thay vì chuyển | Kiệt | Đợt 1 (schema, US-03) + Đợt 3 (US-20) |
| T5 | Unique `bankTxnId` trên dòng PAYMENT và dòng ví; `idempotencyKey` trên `MoneyOperation`; test bắn webhook 2 lần | Kiệt | Đợt 2 (US-11) |
| T6 | Chính sách V1 tạo bởi admin sau khi có văn bản; các khoá phí/không hoàn mặc định 0/false; màn cấu hình ghi số văn bản chính sách | Dev + BGĐ | Trước pilot |
| T7 | Merge `origin/main` vào nhánh, đo lại phân kỳ; migration additive thuần; đổi unique `PaymentRequest` là migration riêng sau khi backfill `enrollmentId` = 100% | Kiệt | Đợt 1 (US-03) |
| T8 | `billing.flexV1Enabled` đọc ở đúng 1 hàm; test: cờ tắt → màn cũ + webhook cũ; cờ bật → đường mới; grep 0 chỗ đọc cờ ngoài hàm đó | Kiệt | Đợt 1 |
| T12 | Luật phần lẻ + test thuộc tính: Σ bảng giá = học phí thực với 1.000 bộ số ngẫu nhiên | Kiệt | Đợt 1 (US-02) |
| T14 | Luật "quyền trên mọi ghi danh bị chạm" nằm trong đường ghi, không chỉ ở UI; test deny | Kiệt | Đợt 1 (US-04) |

## Thay đổi đưa ngược vào kế hoạch

1. Thêm US-02 (khung test bất biến) **trước** mọi Server Action ghi tiền.
2. Đổi unique `PaymentRequest` tách thành migration thứ hai, có điều kiện backfill 100%.
3. Thêm kiểm "không nhận giao dịch trong N giờ" vào kiểm cân đêm (E7) nếu chưa có.
4. Màn xem trước dừng học bắt buộc hiển thị danh sách buổi đã tính (E2).
