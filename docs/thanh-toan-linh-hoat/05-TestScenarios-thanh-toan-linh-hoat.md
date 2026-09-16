# Test Scenarios — Thu học phí linh hoạt

Nguồn: `04-UserStories`. Dữ liệu: fixture `GD-MAU` (BA mục 9) trừ khi ghi khác.
Loại: **unit** · **integration** (DB test cục bộ, SePay mock) · **guarded live** (SePay thật, sau cờ) · **manual**.
Mọi scenario integration kết thúc bằng `kiemBatBien(gia đình) = []` — không nhắc lại ở từng mục.

## Dữ liệu gốc `GD-MAU`

| | An | Bình |
|---|---|---|
| Khoá / buổi | Sata3 / 48 | Sata5 / 48 |
| Học phí thực | 8.640.000 (ưu đãi anh em −960.000) | 12.000.000 |
| Bảng giá | 1–48 × 180.000 | 1–48 × 250.000 |
| Đợt 1 / Đợt 2 | 4.320.000 / 4.320.000 | 6.000.000 / 6.000.000 |

Kỳ thu gốc `KT-01` = An·Đợt 1 4.320.000 + Bình·Đợt 1 6.000.000 = 10.320.000, SĐT PH `0905123456`.

---

## Đợt 0–1 · Nền

### TS-01 · Bộ kiểm bất biến bắt được vi phạm
**Trỏ:** US-02/AC2, AC4 · **Loại:** unit
**Điều kiện đầu:** ảnh chụp dữ liệu `GD-MAU` sau khi KT-01 đã trả đủ.
**Bước:**
1. Chạy `kiemBatBien` trên ảnh chụp gốc → `[]`.
2. Sửa ảnh chụp: thêm PAYMENT +100.000 vào Bình → trả về `B1` (Đã thu > Phải thu).
3. Sửa ảnh chụp: TRANSFER −500.000 Bình, +400.000 An → trả về `B3`.
4. Sửa ảnh chụp: ví −1 → `B4`.
5. Sửa ảnh chụp: xoá một dòng PAYMENT của giao dịch T1 → `B2` và `B5`.
6. Sửa ảnh chụp: TRANSFER giữa hai ghi danh khác `accountingUnitId` → `B8`.
**Kỳ vọng:** mỗi bất biến B1–B9 có ít nhất một ca đỏ; không có ca dương tính giả trên ảnh chụp gốc.

### TS-02 · Làm tròn bảng giá không bao giờ lệch tổng
**Trỏ:** US-02/AC3, BA 4.4 · **Loại:** unit
**Bước:**
1. Học phí 10.000.000, 48 buổi → đơn giá 208.000 cho buổi 1–47, buổi 48 = 224.000.
2. Σ bảng giá = 10.000.000.
3. Chạy thuộc tính 1.000 bộ ngẫu nhiên (học phí 1–50 triệu, 1–96 buổi, 1–6 đợt).
**Kỳ vọng:** Σ bảng giá = học phí thực và Σ đợt = học phí thực ở mọi bộ; không có đơn giá âm.

### TS-03 · Migration đổi unique dừng khi còn đợt chưa có ghi danh
**Trỏ:** US-03/AC2 · **Loại:** integration
**Điều kiện đầu:** DB nháp dựng từ main + migration A; chèn 1 `PaymentRequest` có `enrollmentId` NULL không backfill được.
**Bước:**
1. Chạy migration B → dừng, thông báo nêu số dòng NULL = 1.
2. Xoá dòng lỗi, chạy lại → unique `[enrollmentId, installmentNo]` được tạo.
**Kỳ vọng:** không có trạng thái nửa vời (unique cũ còn nguyên khi bước 1 dừng); `migrate diff` 0 dòng sau bước 2; RLS bật trên mọi bảng mới.

### TS-04 · Webhook và "Dừng học" chạy cùng lúc trên một gia đình
**Trỏ:** US-04/AC1, AC4 · **Pre-mortem:** T2 · **Loại:** integration
**Điều kiện đầu:** KT-01 đã trả; KT-02 OPEN gồm An·Đợt 2 4.320.000 + Bình·Đợt 2 6.000.000; Bình đã học 20 buổi.
**Bước:**
1. Sale mở xem trước "Dừng học Bình" (lấy hash H1).
2. Song song: webhook 10.320.000 vào KT-02 và sale xác nhận với H1.
3. Chạy 50 lần với thứ tự ngẫu nhiên.
**Kỳ vọng:** mỗi lần, đúng một trong hai: (a) webhook trước → xác nhận của sale bị `DU_LIEU_DA_DOI`; (b) sale trước → KT-02 bị huỷ, tiền webhook vào ví + "Cần xử lý". Không lần nào có dòng tiền vào đợt đã huỷ; bất biến sạch cả 50 lần.

### TS-05 · Idempotency của nghiệp vụ tiền
**Trỏ:** US-04/AC2 · **Loại:** integration
**Bước:**
1. Gọi `ghiNghiepVuTien` chuyển 500.000 Bình → An với key K1 → thành công.
2. Gọi lại y hệt với K1 → trả kết quả lần 1.
**Kỳ vọng:** chỉ một cặp TRANSFER; một `MoneyOperation`.

### TS-06 · Từ chối khi chạm ghi danh ngoài phạm vi
**Trỏ:** US-04/AC3 · **Pre-mortem:** T14 · **Loại:** integration
**Điều kiện đầu:** An do sale S1 phụ trách; Bình do sale S2 phụ trách; gia đình chủ lead S1; phạm vi OWN = chủ gia đình **hoặc** chủ ghi danh.
**Bước:**
1. Sale S3 (không liên quan) gọi action chuyển 500.000 Bình → An → từ chối.
2. Sale S2 gọi action chuyển 500.000 Bình → An (An thuộc S1, gia đình thuộc S1) → từ chối vì không có quyền trên An.
3. Sale S1 gọi cùng action → thành công (chủ gia đình).
**Kỳ vọng:** kiểm quyền dựa trên dòng sinh ra, không dựa trên tham số UI; lỗi không lộ số tiền.

### TS-07 · Công tắc tính năng có hiệu lực thật
**Trỏ:** US-05/AC3, AC4 · **Pre-mortem:** T8 · **Loại:** integration
**Bước:**
1. Cờ TẮT: tạo đơn qua đường cũ → ghi `OrderInstallment` thành công; màn hồ sơ gia đình không hiện.
2. Cờ BẬT: đường cũ ghi `OrderInstallment` → lỗi `SO_B_DA_DONG_BANG`.
3. Grep repo: số chỗ đọc `billing.flexV1Enabled` ngoài `laThuTienLinhHoatBat` = 0.
**Kỳ vọng:** cờ đổi hành vi ở cả UI, action, webhook.

### TS-08 · Trạng thái đợt suy ra theo waterfall
**Trỏ:** US-05/AC1 · **Loại:** unit
**Bước:**
1. Bình đã thu 7.500.000 → Đợt 1 DA_THU, Đợt 2 THU_MOT_PHAN (1.500.000/6.000.000).
2. Hạn Đợt 2 là hôm qua → Đợt 2 QUA_HAN.
3. REJECTED 2.000.000 → Đợt 1 THU_MOT_PHAN (5.500.000), Đợt 2 CHƯA_THU.
**Kỳ vọng:** không có cột trạng thái đợt nào được ghi; mọi trạng thái đổi theo dữ liệu tiền.

---

## Đợt 2 · Thu tiền nhiều con

### TS-09 · Đổi chính sách không đổi ghi danh cũ
**Trỏ:** US-06/AC2, AC3 · **Loại:** integration
**Bước:**
1. Admin đổi `siblingDiscountTiers` từ [10, 15] thành [5, 10], nhập lý do + số văn bản → phiên bản 2.
2. Mở hồ sơ `GD-MAU` → An vẫn −960.000 (phiên bản 1).
3. Tạo gia đình mới 2 con → con được giảm nhận 5%.
**Kỳ vọng:** màn cấu hình hiện "2 ghi danh dùng phiên bản 1".

### TS-10 · Sale không sửa được chính sách
**Trỏ:** US-06/AC5 · **Loại:** integration
**Bước:** gọi Server Action lưu chính sách bằng phiên sale → từ chối; mở URL màn cấu hình → không truy cập được.

### TS-11 · Sale không mở được gia đình ngoài phạm vi
**Trỏ:** US-07/AC5 · **Loại:** integration
**Bước:** sale S3 mở `/…/gia-dinh/<id GD-MAU>` → 404, không có chuỗi tên con/số tiền trong phản hồi.

### TS-12 · Tạo đơn 2 con — ưu đãi vào đúng con
**Trỏ:** US-08/AC2, AC3, AC6 · **Loại:** integration
**Điều kiện đầu:** lead "Đã đăng ký" có 2 con An (lớp 2), Bình (lớp 5); chính sách phiên bản 1.
**Bước:**
1. Sale tick cả hai, chọn Sata3 cho An, Sata5 cho Bình, mẫu THEO_BUOI_2.
2. Xem trước → An −960.000 lý do "Anh/chị em — con học phí thấp hơn"; Bình không giảm.
3. Xác nhận.
**Kỳ vọng:** 2 ghi danh, bảng giá 180.000 và 250.000, 4 đợt khớp bảng dữ liệu gốc; 1 `MoneyOperation`; `policyVersionId` = 1.

### TS-13 · Cọc gộp chưa chia (tình huống D)
**Trỏ:** US-08/AC4, US-11/AC4 · **Loại:** integration
**Bước:**
1. Trước khi có đơn, webhook 2.000.000 nội dung "coc 2 be 0905123456" → khớp SĐT duy nhất → ví `UNMATCHED_TO_WALLET` +2.000.000.
2. Sale tạo đơn như TS-12 → bước cuối hiện "Ví gia đình: 2.000.000", bắt buộc chọn.
3. Chia An 1.000.000, Bình 1.000.000 → xác nhận.
**Kỳ vọng:** ví 0; An còn nợ 7.640.000; Bình còn nợ 11.000.000; doanh thu ghi nhận ngày chia (bước 3), không phải ngày bước 1.

### TS-14 · Sửa đợt tự cân và giới hạn
**Trỏ:** US-09/AC2, AC3 · **Loại:** integration
**Bước:**
1. Bình chọn TUY_CHINH 3 đợt; sửa Đợt 1 = 2.000.000 → chặn "Đợt đầu tối thiểu 25% = 3.000.000".
2. Sửa Đợt 1 = 5.000.000, Đợt 2 = 4.000.000 → Đợt 3 tự thành 3.000.000.
3. Thêm đợt thứ 7 → chặn "Tối đa 6 đợt".
4. QLCS mở khoá vượt giới hạn cho Đợt 1 = 2.000.000, nhập lý do → được.
**Kỳ vọng:** Σ luôn 12.000.000; log vượt giới hạn ghi người + lý do.

### TS-15 · Không còn trần 2 đợt
**Trỏ:** US-09/AC6 · **Loại:** integration
**Bước:** An mẫu THEO_BUOI_4 → 4 đợt × 2.160.000, buổi 1–12, 13–24, 25–36, 37–48 → xác nhận thành công; phát hành kỳ thu Đợt 3 → QR đúng 2.160.000.

### TS-16 · Sửa đợt đang trong kỳ thu mở
**Trỏ:** US-09/AC4 · **Loại:** integration
**Điều kiện đầu:** KT-01 OPEN, chưa nhận tiền.
**Bước:** sửa Đợt 1 Bình từ 6.000.000 thành 5.000.000 → xem trước báo "KT-01 sẽ bị huỷ và phát hành lại" → xác nhận.
**Kỳ vọng:** KT-01 CANCELLED; KT mới OPEN 9.320.000 với mã mới; Đợt 2 Bình thành 7.000.000.

### TS-17 · Phát hành kỳ thu gom 2 con
**Trỏ:** US-10/AC1, AC2 · **Loại:** integration
**Bước:** tick An·Đợt 1, Bình·Đợt 1 → phát hành.
**Kỳ vọng:** mã 8 ký tự duy nhất; QR hiện 2 dòng có tên con; nội dung CK dạng `XXXXXXXX 0905123456` dài 19 ký tự; tổng 10.320.000.

### TS-18 · Một đợt không nằm ở hai kỳ thu mở
**Trỏ:** US-10/AC3 · **Loại:** integration
**Bước:** KT-01 OPEN có An·Đợt 1; phát hành kỳ thu mới tick An·Đợt 1 → chặn, gợi ý huỷ KT-01; ép qua action trực tiếp → lỗi `B7`.

### TS-19 · Huỷ và đóng kỳ thu
**Trỏ:** US-10/AC4 · **Loại:** integration
**Bước:**
1. KT-01 chưa nhận tiền → huỷ được.
2. KT-01' nhận 4.000.000 → nút Huỷ bị ẩn; action huỷ → từ chối; "Đóng kỳ thu" → CLOSED_PARTIAL.
**Kỳ vọng:** 4.000.000 vẫn nằm đúng dòng đã lấp.

### TS-20 · Tiền về đủ, chia đích danh
**Trỏ:** US-11/AC1, AC2, AC6 · **Loại:** integration
**Bước:** webhook VA của KT-01, 10.320.000, `bankTxnId` T1.
**Kỳ vọng:** PAYMENT An 4.320.000 và Bình 6.000.000 đúng `enrollmentId`; KT-01 PAID; ví 0; `allocateByWeight` không được gọi (spy); `/admin/bien-dong-so-du` hiện KT-01 và 2 dòng chia.

### TS-21 · Trả thiếu — lấp theo thứ tự dòng
**Trỏ:** US-11/AC2 · **Loại:** integration
**Bước:** webhook 8.000.000 vào KT-01 (thứ tự An rồi Bình).
**Kỳ vọng:** An 4.320.000 (DA_THU), Bình 3.680.000 (THU_MOT_PHAN, còn 2.320.000 ở Đợt 1); KT-01 vẫn OPEN; không tỉ trọng.

### TS-22 · Trả thừa (tình huống E)
**Trỏ:** US-11/AC2 · **Loại:** integration
**Điều kiện đầu:** đã chạy xong TS-30 (KT-02 = An·Đợt 2 3.800.000).
**Bước:** webhook 4.300.000 vào KT-02.
**Kỳ vọng:** An +3.800.000 (còn nợ 0); ví `OVERPAY` +500.000; một dòng "Cần xử lý".

### TS-23 · Chuyển vào kỳ thu đã huỷ
**Trỏ:** US-11/AC3 · **Pre-mortem:** T9 · **Loại:** integration
**Bước:** huỷ KT-01 (chưa nhận tiền); webhook VA KT-01 10.320.000.
**Kỳ vọng:** ví +10.320.000; không có PAYMENT vào ghi danh; "Cần xử lý" nêu "kỳ thu đã huỷ".

### TS-24 · Webhook bắn lại
**Trỏ:** US-11/AC5 · **Pre-mortem:** T5 · **Loại:** integration
**Bước:** bắn TS-20 lần hai cùng `bankTxnId` T1; bắn lần ba đồng thời với lần hai.
**Kỳ vọng:** vẫn đúng 2 dòng PAYMENT; phản hồi 200 cho mọi lần (không để SePay thử lại vô hạn).

### TS-25 · Khớp theo SĐT
**Trỏ:** US-11/AC4 · **Loại:** integration
**Bước:**
1. Webhook 1.000.000, nội dung chỉ có `0905123456`, không VA/mã → ví `GD-MAU` +1.000.000.
2. Tạo gia đình thứ hai dùng cùng SĐT; webhook tương tự → "Cần xử lý: chưa gán", không dòng tiền nào.
3. Webhook nội dung rác → "Cần xử lý: chưa gán".

### TS-26 · Gán giao dịch và chia ví
**Trỏ:** US-12/AC1–AC4 · **Loại:** integration
**Bước:**
1. Từ ca "chưa gán" của TS-25 bước 3 (3.000.000, CONFIRMED), sale gán vào `GD-MAU` → ví +3.000.000.
2. Chia An 5.000.000 → chặn (vượt số dư ví 3.000.000, bất biến B4).
3. Chia An 2.000.000, Bình 1.000.000 → thành công, ví 0.
4. Ca khác còn PENDING → gán được, nút chia khoá "chờ kế toán xác nhận".

### TS-27 · Tiền mặt và chuyển khoản trong một kỳ thu
**Trỏ:** US-13/AC1–AC4 · **Loại:** integration
**Bước:**
1. KT-01: sale ghi tiền mặt 3.000.000 (người nộp "Bà ngoại") → An 3.000.000 RECORDED, "Chờ xác nhận".
2. Webhook 7.320.000 → An +1.320.000, Bình +6.000.000 (QR phải thu ngay đã trừ phần chờ xác nhận).
3. Kế toán REJECTED khoản tiền mặt → An còn nợ Đợt 1 3.000.000, KT-01 về OPEN.
**Kỳ vọng:** `payerName` không đổi phân bổ; không có giai đoạn nào Đã thu > Phải thu.

---

## Đợt 3 · Thay đổi giữa chừng

### TS-28 · Xem trước dừng học (tình huống A)
**Trỏ:** US-14/AC1, AC3, AC6 · **Loại:** integration
**Điều kiện đầu:** KT-01 đã trả đủ; Bình đã học 20 buổi; tới ngày buổi 20 của Bình, An đã học 24 buổi (buổi kế tiếp của An là 25).
**Bước:** Sale → Dừng học Bình, lý do PH_CHU_DONG, buổi cuối 20.
**Kỳ vọng xem trước:** danh sách 20 buổi; đã dùng 5.000.000; phí 0; đã thu 6.000.000; **dư 1.000.000**; cảnh báo "An mất ưu đãi từ buổi 25, Đợt 2 An 4.320.000 → 4.800.000". Chưa có dòng nào được ghi.

### TS-29 · Sửa số buổi đã dùng bắt buộc ghi chú
**Trỏ:** US-14/AC2 · **Loại:** integration + manual
**Bước:** đổi 20 → 18 không ghi chú → nút khoá; ghi chú "2 buổi nghỉ có phép chưa bù" → dư thành 1.500.000.
**Kỳ vọng:** `EnrollmentEvent.usedSessions = 18` kèm ghi chú; báo cáo US-26 đánh dấu lệch gợi ý 2 buổi (không > 2 nên không bất thường).

### TS-30 · Dừng học, chuyển dư sang anh (tình huống A đầy đủ)
**Trỏ:** US-15/AC1, AC3, AC6 · US-16/AC2, AC3, AC6 · **Loại:** integration
**Bước:** tiếp TS-28, chọn nơi đi: An 1.000.000 → xác nhận.
**Kỳ vọng:**

| | An | Bình |
|---|---|---|
| Bảng giá | 1–24 × 180.000; 25–48 × 200.000 | không đổi |
| Đợt | Đợt 2 cũ huỷ, Đợt 2 mới 4.800.000 | Đợt 2 huỷ; QUYẾT TOÁN −1.000.000 |
| TRANSFER | +1.000.000 | −1.000.000 |
| Phải thu / Đã thu / Còn nợ | 9.120.000 / 5.320.000 / 3.800.000 | 5.000.000 / 5.000.000 / 0 |
| Trạng thái | ACTIVE | STOPPED |

Một `MoneyOperation` STOP_SETTLE; B5: 10.320.000 = 5.320.000 + 5.000.000 + 0 + 0.

### TS-31 · Chưa phân hết khoản dư thì không xác nhận được
**Trỏ:** US-15/AC1 · **Loại:** integration
**Bước:** tiếp TS-28, nhập An 600.000, ví 300.000 (tổng 900.000) → nút khoá "còn 100.000 chưa phân"; ép action → lỗi `B1`.

### TS-32 · Học lố (tình huống B)
**Trỏ:** US-14/AC4, US-15/AC5 · **Loại:** integration
**Bước:** Bình buổi cuối 26 → xem trước "đã dùng 6.500.000, còn nợ 500.000" → xác nhận → phát hành kỳ thu kế tiếp tick tất cả.
**Kỳ vọng:** Bình QUYẾT TOÁN +500.000; kỳ thu 5.300.000, dòng 1 = Bình·Quyết toán 500.000, dòng 2 = An·Đợt 2 4.800.000; webhook 500.000 → lấp Bình trước.

### TS-33 · Cọc từng con, một con không học (tình huống C)
**Trỏ:** US-15, US-16 · **Loại:** integration
**Điều kiện đầu:** mẫu COC_ROI_THEO_BUOI; cọc 1.000.000 mỗi con đã trả; chưa học buổi nào.
**Bước:** Dừng học Bình buổi cuối 0, chuyển dư sang An.
**Kỳ vọng:** Bình quyết toán −1.000.000, STOPPED; An mất ưu đãi từ buổi 1 → học phí thực 9.600.000; An còn nợ Đợt 1 = 2.800.000; An còn nợ tổng 7.600.000.

### TS-34 · Lựa chọn "không hoàn"
**Trỏ:** US-15/AC2 · **Loại:** integration
**Bước:**
1. `allowForfeit=false` → không có lựa chọn; ép action → từ chối.
2. `allowForfeit=true`, `maxForfeitAmount=500.000`, sale thao tác → không có lựa chọn (thiếu `billing:forfeit`).
3. QLCS thao tác, không hoàn 1.000.000 → chặn (vượt trần); không hoàn 500.000 + chuyển An 500.000 → được.
**Kỳ vọng:** Bình phải thu = 5.500.000 (đã dùng 5.000.000 + không hoàn 500.000).

### TS-35 · Dừng học khi kỳ thu mở đã nhận một phần
**Trỏ:** US-15/AC4 · **Loại:** integration
**Điều kiện đầu:** KT-02 (An·Đợt 2 4.320.000 → dòng 1, Bình·Đợt 2 6.000.000 → dòng 2) đã nhận 2.000.000 (lấp An).
**Bước:** Dừng học Bình buổi 20, dư vào ví.
**Kỳ vọng:** KT-02 CLOSED_PARTIAL; xem trước đã hỏi và phát hành kỳ thu mới cho phần còn lại của An theo số mới (Đợt 2 An = 4.800.000 đã có 2.000.000 → còn 2.800.000; vì Đợt 2 đã có tiền nên thêm QUYẾT TOÁN +480.000 thay vì huỷ-tạo).

### TS-36 · Trung tâm huỷ lớp
**Trỏ:** US-14/AC5 · **Loại:** integration
**Bước:** chính sách `stopFeeFixed=200.000`, `allowForfeit=true`; Dừng học Bình lý do TRUNG_TAM_HUY.
**Kỳ vọng:** phí 0; không có lựa chọn không hoàn; dư = đúng tiền buổi chưa học.

### TS-37 · Ba con còn hai — bậc ưu đãi đổi
**Trỏ:** US-16/AC4 · **Loại:** unit + integration
**Điều kiện đầu:** thêm con Chi, khoá giả định 8.000.000 / 40 buổi; bậc [10, 15]; áp theo học phí niêm yết giảm dần: Bình 0%, An 10%, Chi 15% (bảng giá Chi 170.000).
**Bước:** Dừng học Bình sau khi An và Chi đã học 10 buổi.
**Kỳ vọng:** An mất ưu đãi (còn 2 con → An là con học phí cao nhất); Chi từ 15% xuống 10% → đoạn buổi chưa học của Chi 180.000; các đợt CHƯA_THU của An và Chi huỷ-tạo đúng số; không truy thu 10 buổi đã học.

### TS-38 · Chuyển tiền giữa các con — các chặn
**Trỏ:** US-17/AC1–AC3 · **Loại:** integration
**Bước:**
1. Bình có 6.000.000 CONFIRMED + 1.000.000 PENDING; chuyển 6.500.000 sang An → chặn (chỉ 6.000.000 được chuyển) và chặn thêm vì An chỉ còn nợ 4.320.000.
2. Chuyển 3.000.000 → được; cảnh báo "Bình sẽ phát sinh nợ 3.000.000".
3. An đổi sang ghi danh thuộc đơn vị kế toán khác; chuyển 100.000 → chặn `B8`.
4. Chuyển sang con của gia đình khác qua action → chặn.

### TS-39 · Bảo lưu không làm quá hạn
**Trỏ:** US-18/AC1–AC3, AC5 · **Loại:** integration
**Bước:**
1. Bình bảo lưu 30 ngày khi Đợt 2 còn 10 ngày tới hạn.
2. Chạy cron quá hạn ở ngày 15 và ngày 35.
3. Hết 30 ngày chưa học lại.
**Kỳ vọng:** hạn Đợt 2 dời 30 ngày; ngày 15 không QUA_HAN; ưu đãi An giữ nguyên; bước 3 có thông báo cho sale, ghi danh vẫn PAUSED.

### TS-40 · Thêm con giữa khoá không tính lùi
**Trỏ:** US-19/AC2, AC3 · **Loại:** integration
**Điều kiện đầu:** gia đình chỉ có Bình (12.000.000, Đợt 1 đã trả, Đợt 2 chưa trả), Bình đang ở buổi 26.
**Bước:** thêm An Sata3 mẫu FULL.
**Kỳ vọng:** An (học phí thấp hơn) nhận 10% → 8.640.000 ngay từ buổi 1 của An; Bình không đổi; không có quyết toán âm nào; kỳ thu gom được Bình·Đợt 2 và An·Full.

### TS-41 · Đổi sang khoá rẻ hơn, dư vượt học phí mới
**Trỏ:** US-20/AC1–AC3 · **Loại:** integration
**Bước:** Bình học 20 buổi, đổi sang khoá giả định 600.000 (tổng).
**Kỳ vọng:** ghi danh cũ STOPPED, dư 1.000.000; ghi danh mới nhận 600.000 (còn nợ 0); ví +400.000; phí dừng 0 dù chính sách có phí; ưu đãi An xét lại (Bình vẫn ACTIVE ở ghi danh mới → An giữ ưu đãi).

### TS-42 · Đổi cơ sở khác đơn vị kế toán
**Trỏ:** US-20/AC4 · **Loại:** integration
**Bước:** An chuyển sang cơ sở thuộc đơn vị kế toán khác, đã học 22 buổi.
**Kỳ vọng:** không có TRANSFER chéo đơn vị; ghi danh cũ quyết toán, dư vào ví đơn vị cũ; sinh việc hoàn cho kế toán nguồn; ghi danh mới ở đơn vị đích còn nợ toàn bộ; màn hồ sơ hiện 2 ví tách biệt.

---

## Đợt 4 · Kế toán & vận hành

### TS-43 · Hoàn tiền
**Trỏ:** US-21/AC1–AC4 · **Loại:** integration
**Bước:**
1. Sale gọi action hoàn → từ chối.
2. Kế toán hoàn 600.000 khi ví 500.000 → chặn.
3. Kế toán hoàn 500.000 thiếu ảnh chứng từ → chặn; đủ thông tin → thành công.
**Kỳ vọng:** ví 0; dòng REFUND có cờ cho hoa hồng; B5 đúng.

### TS-44 · Miễn giảm và vượt giới hạn
**Trỏ:** US-22/AC1–AC3 · **Loại:** integration
**Bước:**
1. Sale gọi action miễn giảm 500.000 của Bình (TS-32) → từ chối.
2. QLCS miễn 600.000 → chặn (vượt còn nợ 500.000); miễn 500.000 có lý do → Bình còn nợ 0.

### TS-45 · Danh sách quá hạn
**Trỏ:** US-23/AC1–AC4 · **Loại:** integration
**Bước:** An và Bình cùng quá hạn Đợt 2, Chi PAUSED quá hạn; chạy cron 2 lần trong ngày.
**Kỳ vọng:** 1 dòng gia đình gồm An, Bình (không có Chi); đúng 1 thông báo cho sale trong ngày.

### TS-46 · Kiểm cân đêm bắt lỗi cài cắm
**Trỏ:** US-24/AC1–AC4 · **Loại:** integration
**Bước:**
1. Chèn thẳng bằng SQL một PAYMENT +100.000 vào Bình (bỏ qua đường ghi).
2. Chạy cron kiểm cân.
3. Giả lập 0 giao dịch SePay trong N giờ làm việc; giả lập "Cần xử lý" tồn 13 giờ.
**Kỳ vọng:** thông báo cho Dev lead + kế toán nêu `GD-MAU`, `B1`, `B5`, lệch 100.000; cảnh báo không nhận giao dịch; nhắc QLCS; cron không ghi dữ liệu tiền.

### TS-47 · Chuyển dữ liệu sổ B
**Trỏ:** US-25/AC1–AC3 · **Loại:** integration
**Điều kiện đầu:** 3 đơn cũ: full 1 lần; 2 đợt đã trả đợt 1; 2 đợt chưa trả.
**Bước:** dry-run → bảng trước/sau; chạy thật; chạy lại lần hai.
**Kỳ vọng:** dry-run 0 dòng lệch; lần hai không sinh gì mới; kiểm cân sạch; `OrderInstallment` không bị xoá.

### TS-48 · Báo cáo bất thường theo nhân viên
**Trỏ:** US-26/AC1–AC3 · **Loại:** integration
**Bước:** sale S1 chuyển tiền từ con có đợt quá hạn; sửa số buổi đã dùng lệch gợi ý 3 buổi.
**Kỳ vọng:** bảng tuần của S1 có 2 dòng đánh dấu bất thường; bấm mở đúng dòng thời gian gia đình.

### TS-49 · Hai người cùng xem trước một gia đình
**Trỏ:** US-04/AC4 · **Loại:** integration
**Bước:** sale S1 mở xem trước chuyển tiền; QLCS mở xem trước dừng học cùng gia đình; QLCS xác nhận trước; S1 xác nhận.
**Kỳ vọng:** S1 nhận `DU_LIEU_DA_DOI`, không có dòng nào của S1 được ghi.

### TS-50 · Thử với sale thật
**Trỏ:** PRD A3, KR5 · **Loại:** manual
**Điều kiện đầu:** test.satarobo.vn, 2 sale chưa xem tài liệu, 5 phiếu tình huống giấy (A, B, C, D, E).
**Bước:** mỗi sale tự làm 5 tình huống, người quan sát bấm giờ, không hướng dẫn.
**Kỳ vọng:** ≥ 4/5 tình huống đúng số lần đầu; trung vị "dừng 1 con" ≤ 3 phút; ghi lại mọi chỗ sale hỏi để sửa câu chữ màn xem trước.

---

## Ma trận AC → TS (tóm tắt)

| Story | TS |
|---|---|
| US-02 | 01, 02 |
| US-03 | 03 |
| US-04 | 04, 05, 06, 49 |
| US-05 | 07, 08 |
| US-06 | 09, 10 |
| US-07 | 11 |
| US-08 | 12, 13 |
| US-09 | 14, 15, 16 |
| US-10 | 17, 18, 19 |
| US-11 | 13, 20–25 |
| US-12 | 26 |
| US-13 | 27 |
| US-14 | 28, 29, 32, 36 |
| US-15 | 30–35 |
| US-16 | 28, 30, 33, 37 |
| US-17 | 05, 38 |
| US-18 | 39 |
| US-19 | 40 |
| US-20 | 41, 42 |
| US-21 | 43 |
| US-22 | 14, 44 |
| US-23 | 45 |
| US-24 | 46 |
| US-25 | 47 |
| US-26 | 29, 48 |
| US-01 | Không có TS — nghiệm thu bằng review báo cáo GATE 0 |
