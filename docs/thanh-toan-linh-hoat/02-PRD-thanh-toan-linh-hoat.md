# PRD — Thu học phí linh hoạt cho phụ huynh nhiều con

## 1. Tóm tắt

Tài liệu mô tả tính năng giúp sale tự xử lý mọi cách đóng học phí của một phụ huynh có nhiều con: đóng full, chia nhiều đợt, cọc, bỏ bớt con, thêm con, bảo lưu, đổi khoá. Số tiền của từng con luôn đúng theo khoá của con đó, và dev không cần sửa dữ liệu tay nữa. Chi tiết nghiệp vụ nằm ở `01-BA-thanh-toan-linh-hoat.md`.

## 2. Người liên quan

| Vai trò | Người / bộ phận | Ghi chú |
|---|---|---|
| Chủ sản phẩm, Dev lead | Dev | Chốt thiết kế, review mọi migration |
| Dev thực thi | Kiệt + Claude Code | Mỗi phiên Claude Code một user story |
| Chính sách học phí | Ban giám đốc | Chốt Q4–Q8 và các con số phí |
| Kế toán | Kế toán tổng hợp HO + cơ sở | Chốt Q1, Q3; nhận việc hoàn tiền, xác nhận tiền mặt |
| Người dùng chính | Sale CS1, CS2 | Thao tác hằng ngày |
| Giám sát | QLCS | Miễn giảm, vượt giới hạn, xem báo cáo |

## 3. Bối cảnh

**Hiện nay** sale tạo đơn và QR bằng tay. Hệ thống chỉ cho tối đa 2 đợt, số tiền gõ tay, không có cọc, không có quá hạn, không có nút huỷ kế hoạch. Tiền đang nằm ở 3 sổ không ràng buộc nhau, có 5 định nghĩa "đã thu" khác nhau. Chuyển khoản gộp được chia theo tỉ trọng, nên khi phụ huynh bỏ bớt một con, không ai biết chắc con nào đã đóng bao nhiêu. Mọi ca lệch đều phải báo admin, kế toán, rồi dev.

**Vì sao làm bây giờ:**
- Hệ thanh toán chưa đưa vào dùng thật (prod gần như 0 dòng tiền), nên đổi mô hình lúc này gần như không tốn chi phí chuyển đổi.
- Đã có sẵn nền: `PaymentRequest` n-đợt, bút toán điều chỉnh kiểu delta, trang biến động số dư, workflow shadow-compare.
- Trang Lead đã tách bảng nhiều con, nên đầu vào "một phụ huynh nhiều con" đã có.

## 4. Mục tiêu

**Mục tiêu:** Sale tự xử lý 45 tình huống đóng tiền đã liệt kê, trong vài phút, và số tiền từng con luôn khớp.

**Lợi ích:**
- Phụ huynh: được linh hoạt đóng tiền, luôn thấy rõ con nào còn nợ bao nhiêu, không bị thu nhầm.
- Công ty: không thất thoát khi phụ huynh bỏ bớt con; doanh thu theo khoá và theo con đúng; mở đường cho module hoa hồng.
- Đội dev: hết việc sửa dữ liệu tiền bằng tay.

**Gắn với chiến lược:** hệ thống sẵn sàng nhượng quyền cần luồng tiền tự vận hành, cấu hình được, và tách đúng đơn vị kế toán.

**Kết quả then chốt (đo sau 30 ngày go-live):**

| KR | Chỉ số | Mục tiêu |
|---|---|---|
| KR1 | Số lần dev chạy SQL/sửa tay dữ liệu tiền | 0 |
| KR2 | Kiểm cân gia đình hằng đêm (bất biến B5) lệch | 0đ trong 30 đêm liên tiếp |
| KR3 | Giao dịch tiền về tự phân bổ đích danh (không cần người) | ≥ 90% |
| KR4 | Dòng "Cần xử lý" tồn quá 24 giờ | 0 |
| KR5 | Thời gian sale hoàn tất thao tác "dừng 1 con" (từ bấm tới xác nhận) | ≤ 3 phút trung vị |
| KR6 | Đơn nhiều đợt được tự xác nhận khi phụ huynh chuyển đúng QR | ≥ 95% |

## 5. Đối tượng

| Nhóm | Việc cần làm | Ràng buộc |
|---|---|---|
| Sale cơ sở | Chốt đơn và thu tiền nhiều con, xử lý khi phụ huynh đổi ý | Không rành kế toán; làm trên máy tính tại quầy và điện thoại |
| Kế toán | Xác nhận tiền, hoàn tiền, đối soát | Mỗi cơ sở có thể là một đơn vị kế toán riêng |
| QLCS | Cho phép ngoại lệ, theo dõi nợ | Không muốn hàng chờ duyệt |
| Phụ huynh (gián tiếp) | Đóng tiền đúng, rõ ràng | Quét QR; hay chuyển gộp, hay ghi sai nội dung |

## 6. Giá trị mang lại

| Việc của người dùng | Nỗi đau hiện tại | Sau khi có tính năng |
|---|---|---|
| Thu tiền 2–3 con một lần | Một QR theo tổng đơn, chia tiền theo tỉ trọng | Một kỳ thu nhiều dòng, tiền chia đích danh từng con |
| Phụ huynh bỏ một con giữa chừng | Không biết con đó dư hay thiếu, phải nhờ dev | Nút "Dừng học" tự quyết toán, chọn chuyển dư sang con khác |
| Phụ huynh chuyển gộp, sai nội dung | Báo admin, kế toán xử lý tay | Tiền vào ví gia đình, sale chia ví trong vài cú bấm |
| Cọc cho cả nhà | Không có khái niệm cọc | Cọc vào ví hoặc từng con, tự cấn trừ khi chốt |
| Mất ưu đãi anh em | Tính nhẩm, dễ sai | Hệ thống tự tính lại và hiện trước cho sale báo phụ huynh |
| Kiểm soát sale | Màn duyệt tất-cả-hoặc-không (đã bỏ) | Giới hạn cấu hình + quyền + log từng thao tác |

## 7. Giải pháp

### 7.1 Trải nghiệm

**Màn "Hồ sơ thu tiền gia đình"** — một mục sidebar, nhiều tab (theo mẫu module Chấm công):

| Tab | Nội dung |
|---|---|
| Tổng quan | Thẻ từng con: khoá, trạng thái, buổi đã học / tổng, Phải thu · Đã thu · Còn nợ · Chờ xác nhận; thẻ Ví gia đình; nút thao tác |
| Đợt thu | Bảng đợt theo từng con, trạng thái suy ra, hạn, quá hạn |
| Kỳ thu | Danh sách kỳ thu, QR, dòng, số đã lấp |
| Ví | Sổ ví, nguồn từng khoản, nút chia ví |
| Dòng thời gian | Mọi nghiệp vụ tiền: ai làm, lúc nào, trước → sau |

**Khuôn thao tác chung:** chọn ý định → form ngắn → **màn xem trước** (bảng từng con trước → sau, ví trước → sau, kỳ thu bị ảnh hưởng, cảnh báo) → xác nhận. Không có ô nào cho sale gõ số công nợ.

**Thao tác có trên màn:** Tạo đơn · Sửa đợt · Phát hành kỳ thu · Ghi tiền mặt · Chia ví · Chuyển tiền giữa các con · Dừng học · Bảo lưu / Học lại · Thêm con · Đổi khoá / cơ sở · (Kế toán) Hoàn tiền · (QLCS) Miễn giảm.

**Cửa vào khác:** trang biến động số dư có nút "Gán vào gia đình" cho dòng Cần xử lý; trang lead khi "Đã đăng ký" mở thẳng Tạo đơn nhiều con từ danh sách con của lead.

### 7.2 Tính năng chính

1. **Mô hình tiền theo ghi danh** — mỗi con × khoá có bảng giá buổi, ưu đãi, đợt thu, công nợ riêng. Đợt thu thuộc ghi danh, không thuộc đơn.
2. **Kỳ thu gom nhiều con** — một QR/VA bất biến cho nhiều dòng; tiền về chia đích danh theo thứ tự dòng; thiếu thì lấp dần, thừa vào ví.
3. **Ví gia đình** — giữ tiền chưa thuộc con nào; không phải doanh thu.
4. **Kế hoạch đợt tuỳ biến** — mẫu có sẵn, sửa tự do trong giới hạn; không trần cứng 2 đợt.
5. **Dừng học có quyết toán** — tính giá trị đã dùng, dư/thiếu, ưu đãi liên đới, xử lý kỳ thu đang mở, trong một thao tác.
6. **Chuyển tiền giữa các con** — cùng gia đình, cùng đơn vị kế toán, chỉ tiền đã xác nhận.
7. **Bảo lưu, thêm con, đổi khoá, đổi cơ sở** — đều quy về các bút toán trên.
8. **Cấu hình chính sách có phiên bản** — admin chỉnh; ghi danh chụp phiên bản lúc chốt.
9. **Đường ghi tiền duy nhất + bất biến** — mọi thao tác đi qua một hàm, khoá theo gia đình, kiểm 9 bất biến trước khi commit.
10. **Kiểm cân hằng đêm** — lệch là cảnh báo ngay.

### 7.3 Công nghệ

- Next.js 16 Server Actions; Prisma → Supabase Postgres; SePay webhook; Vercel Cron.
- Hàm ghi duy nhất `lib/finance/ledger/ghiNghiepVuTien.ts`: transaction + `pg_advisory_xact_lock(hash(guardianId))` + kiểm bất biến + `idempotencyKey`.
- Mọi phép cộng tiền ở `lib/finance/debt.ts` (giữ vai trò nhà duy nhất).
- Migration viết tay, additive trước; RLS cho bảng mới; không dùng `prisma migrate dev`.
- Công tắc bật tính năng là `SystemSetting billing.flexV1Enabled` có đường gọi thật và test chứng minh cờ tắt thì luồng cũ chạy — không lặp lại bài học cờ chết `PAYMENT_LEDGER_V2`.

### 7.4 Giả định (chưa chứng minh)

| # | Giả định | Cách kiểm |
|---|---|---|
| A1 | Dữ liệu buổi đã diễn ra đủ tin để gợi ý số buổi đã dùng | GATE 0 (G0-4); sale vẫn xác nhận con số |
| A2 | SePay cấp được VA động theo kỳ thu với khối lượng hiện tại | Đo tài khoản SePay; fallback mã kỳ thu trong nội dung |
| A3 | Sale hiểu màn xem trước mà không cần đào tạo dài | Thử 5 ca với 2 sale trước go-live |
| A4 | Phụ huynh chấp nhận quy tắc "chuyển buổi bằng tiền" | Sale thử nói với 5 phụ huynh thật |
| A5 | CS1 và CS2 là hai đơn vị kế toán riêng | Kế toán xác nhận (Q1) |
| A6 | Tiền trong ví chưa tính doanh thu | Kế toán xác nhận (Q3) |

## 8. Phát hành

**Ước lượng:** 5 đợt, khoảng 26 phiên Claude Code; với một dev review, khoảng 4–6 tuần làm tuần tự.

| Đợt | Nội dung | Điều kiện qua đợt |
|---|---|---|
| 0 — Đo & khung test | GATE 0 chỉ-đọc; fixture gia đình mẫu; bộ kiểm bất biến | Có báo cáo GATE 0; test bất biến chạy được trên dữ liệu giả |
| 1 — Nền sổ | Migration additive; đường ghi duy nhất; công nợ theo ghi danh; cờ tắt mặc định | tsc sạch, test xanh, SQL↔schema 0 dòng lệch, RLS đúng |
| 2 — Thu tiền nhiều con | Chính sách; tạo đơn; kế hoạch đợt; kỳ thu; webhook phân bổ đích danh; ví; tiền mặt; màn hồ sơ gia đình | Chạy trọn tình huống D, E của gia đình mẫu trên test.satarobo.vn |
| 3 — Thay đổi giữa chừng | Dừng học + quyết toán; ưu đãi liên đới; chuyển tiền; bảo lưu; thêm con; đổi khoá/cơ sở | Chạy trọn tình huống A, B, C trên test |
| 4 — Kế toán & vận hành | Hoàn tiền; miễn giảm; quá hạn; kiểm cân đêm; chuyển dữ liệu sổ B; khoá ghi sổ B | 7 đêm kiểm cân sạch trên test; pilot 1 cơ sở |

**V1 gồm:** Đợt 0–4. **Sau V1:** phụ huynh tự xem công nợ trên app, hoá đơn VAT theo con, hoa hồng đọc từ dòng tiền, payOS, nhắc nợ ZNS theo kỳ thu.

**Bật tính năng:** pilot 1 cơ sở (chọn cơ sở có ít đơn nhiều đợt đang dở nhất tại thời điểm bật) trong 2 tuần, sau đó bật toàn hệ thống. Đơn tạo trước khi bật đi đường chuyển đổi của Đợt 4.
