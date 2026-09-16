# User Stories — Thu học phí linh hoạt

Nguồn: `01-BA` (luật L1–L5, bất biến B1–B9, UC-01→UC-15), `02-PRD`, `03-PreMortem`.
Thiết kế: chưa có Figma; bố cục màn theo PRD 7.1, khuôn tab theo module Chấm công.
Quy ước: mỗi story = một phiên Claude Code. AC đánh số để test scenario trỏ tới (vd `US-14/AC3`).

## Bản đồ đợt

| Đợt | Story |
|---|---|
| 0 — Đo & khung test | US-01, US-02 |
| 1 — Nền sổ | US-03, US-04, US-05 |
| 2 — Thu tiền nhiều con | US-06 → US-13 |
| 3 — Thay đổi giữa chừng | US-14 → US-20 |
| 4 — Kế toán & vận hành | US-21 → US-26 |

---

## Đợt 0

### US-01 · Khảo sát GATE 0 (chỉ đọc)

**Mô tả:** Là Dev lead, tôi muốn có báo cáo đo 8 câu hỏi G0-1→G0-8 trên repo và DB, để thiết kế ánh xạ đúng tên bảng thật trước khi viết migration.

**AC**
1. Báo cáo `docs/thanh-toan-linh-hoat/gate-0.md` trả lời đủ G0-1→G0-8, mỗi câu có đường dẫn file:dòng hoặc câu SQL đã chạy và kết quả.
2. Không có commit nào sửa mã chạy thật hay schema; không chạy lệnh ghi trên DB nào.
3. Có bảng ánh xạ "tên thiết kế → tên thật" cho mọi bảng/cột trong BA mục 5.
4. Liệt kê đầy đủ chỗ đọc/ghi `OrderInstallment`, `allocateByWeight`, và mọi phép cộng `amount` ngoài `lib/finance/`.
5. Kết luận rõ G0-4 (dữ liệu buổi đã diễn ra) là ĐỦ TIN / KHÔNG ĐỦ TIN kèm số đo; nếu không đủ tin, ghi hệ quả cho US-14.
6. Đo lại phân kỳ migration main / test / dev sau khi merge `origin/main` vào nhánh làm việc.

**Phụ thuộc:** không.

### US-02 · Fixture gia đình mẫu và bộ kiểm bất biến

**Mô tả:** Là Dev, tôi muốn có dữ liệu mẫu `GD-MAU` và hàm kiểm 9 bất biến, để mọi story ghi tiền sau này đều bị test chặn nếu làm lệch số.

**AC**
1. `tests/fixtures/gia-dinh-mau.ts` dựng gia đình ở BA mục 9 (An Sata3 có ưu đãi, Bình Sata5), idempotent, dọn sạch; kèm hằng `KY_VONG_*` cho tình huống A–E, không để test tự cộng nhẩm.
2. `lib/finance/ledger/kiem-bat-bien.ts` có hàm thuần kiểm B1–B9 trên một ảnh chụp dữ liệu gia đình, trả danh sách vi phạm có mã (vd `B5`).
3. Test thuộc tính: 1.000 bộ (học phí, số buổi, số đợt) ngẫu nhiên → Σ bảng giá = học phí thực và Σ đợt = học phí thực.
4. Mỗi bất biến có ít nhất 1 test "vi phạm thì bị bắt".
5. Chưa có Server Action ghi tiền mới nào được merge trước story này.

**Phụ thuộc:** US-01.

---

## Đợt 1

### US-03 · Migration nền

**Mô tả:** Là Dev, tôi muốn có schema cho ghi danh, bảng giá, ưu đãi, đợt thu theo ghi danh, kỳ thu, ví, sự kiện, nghiệp vụ tiền và chính sách, để các story sau có chỗ ghi.

**AC**
1. Migration A (additive thuần): thêm các bảng mới và cột mới ở BA 5.1–5.2; mọi bảng mới có `orgUnitId` và `ENABLE ROW LEVEL SECURITY`; viết SQL tay, áp bằng `migrate deploy`.
2. Migration B (tách riêng): backfill `PaymentRequest.enrollmentId`; chỉ đổi unique sang `[enrollmentId, installmentNo]` khi câu kiểm `enrollmentId IS NULL` = 0 dòng; nếu > 0 thì migration dừng có thông báo.
3. `PaymentType` thêm `TRANSFER`, `REFUND`; không đổi dòng cũ.
4. Unique `bankTxnId` trên dòng PAYMENT (nơi khác NULL) và trên `GuardianWalletEntry` (nơi khác NULL); unique `MoneyOperation.idempotencyKey`; unique `PaymentBill.code`.
5. SQL ↔ `schema.prisma` lệch 0 dòng (đo bằng DB nháp + `migrate diff`); RLS bật trên mọi bảng mới.
6. Không chạy `prisma migrate dev`.

**Phụ thuộc:** US-01.

### US-04 · Đường ghi tiền duy nhất

**Mô tả:** Là Dev, tôi muốn mọi thao tác tiền (của sale, kế toán, webhook, cron) đi qua `ghiNghiepVuTien`, để khoá, quyền và bất biến chỉ nằm một chỗ.

**AC**
1. `ghiNghiepVuTien({ guardianId, type, actor, idempotencyKey, build })` mở transaction, lấy `pg_advisory_xact_lock` theo gia đình, gọi `build` để sinh dòng, kiểm B1–B9, rồi commit; vi phạm bất kỳ → rollback và ném lỗi có mã bất biến.
2. Gọi lại cùng `idempotencyKey` → trả kết quả lần đầu, không sinh dòng mới.
3. Kiểm quyền: actor phải có quyền của thao tác trên **mọi** ghi danh bị chạm (đọc từ dòng sinh ra, không tin tham số UI); thiếu một ghi danh → từ chối.
4. Nhận `expectedHash` của màn xem trước; hash trạng thái gia đình hiện tại khác → lỗi `DU_LIEU_DA_DOI`.
5. Ghi `MoneyOperation` với `previewSnapshot` trước → sau và `AuditLog`.
6. Có test lint/grep: không file nào ngoài `lib/finance/ledger/` gọi `prisma.payment.create`, `prisma.paymentRequest.create|update`, `prisma.guardianWalletEntry.create` (trừ các đường cũ được liệt kê tên khi cờ tắt).

**Phụ thuộc:** US-02, US-03.

### US-05 · Công nợ theo ghi danh, trạng thái đợt suy ra, công tắc tính năng

**Mô tả:** Là Kế toán, tôi muốn mọi màn và báo cáo đọc cùng một con số Phải thu / Đã thu / Còn nợ của từng con, để không bao giờ có hai số khác nhau.

**AC**
1. `lib/finance/debt.ts` thêm `congNoGhiDanh(enrollmentId)`, `trangThaiDot(enrollmentId)` (waterfall), `canGiaDinh(guardianId, accountingUnitId)`, `soDuVi(...)` đúng công thức BA mục 6.
2. Khớp hằng `KY_VONG_*` của fixture ở cả 5 tình huống.
3. `SystemSetting billing.flexV1Enabled` (mặc định TẮT) đọc ở đúng một hàm `laThuTienLinhHoatBat(orgUnitId)`; test: tắt → màn/webhook cũ; bật → đường mới.
4. Khi cờ bật: mọi đường ghi `OrderInstallment` ném lỗi `SO_B_DA_DONG_BANG`; có test.
5. Các chỗ đọc sổ B và phép cộng ngoài `lib/finance/` liệt kê ở G0-7 được chuyển về `debt.ts` hoặc ghi rõ trong ticket nợ nếu nằm ngoài luồng thu tiền.

**Phụ thuộc:** US-04.

---

## Đợt 2

### US-06 · Admin cấu hình chính sách thu học phí

**Mô tả:** Là Admin, tôi muốn chỉnh các tham số chính sách (đợt, cọc, ưu đãi, dừng học, bảo lưu, trễ hạn) mà không cần dev, để chính sách thay đổi theo mùa vẫn chạy.

**AC**
1. Màn cấu hình hiện đủ khoá ở BA mục 10, có kiểm kiểu và khoảng hợp lệ.
2. Lưu = tạo `BillingPolicyVersion` mới; bắt buộc nhập lý do và số văn bản chính sách.
3. Ghi danh đã chốt giữ phiên bản cũ; màn hiện "đang có N ghi danh dùng phiên bản X".
4. Khoá có tiền đi khỏi phụ huynh (`allowForfeit`, phí dừng, phí trễ) hiện cảnh báo đỏ khi bật.
5. Chỉ quyền `billing-policy:manage` thấy màn; sale gọi action trực tiếp → từ chối.

**Phụ thuộc:** US-03.

### US-07 · Màn hồ sơ thu tiền gia đình

**Mô tả:** Là Sale, tôi muốn một màn thấy toàn bộ tiền của gia đình theo từng con, để trả lời phụ huynh ngay "bé nào còn nợ bao nhiêu".

**AC**
1. Một mục sidebar, 5 tab: Tổng quan · Đợt thu · Kỳ thu · Ví · Dòng thời gian (PRD 7.1).
2. Thẻ mỗi con hiện khoá, trạng thái, buổi đã học/tổng, Phải thu · Đã thu · Còn nợ · Chờ xác nhận; số lấy duy nhất từ `debt.ts`.
3. Ví hiện số dư theo từng đơn vị kế toán; con khác đơn vị kế toán có nhãn phân biệt.
4. Dòng thời gian liệt kê mọi `MoneyOperation`: người, lúc, loại, bảng trước → sau.
5. Sale chỉ mở được gia đình trong phạm vi OWN; truy cập URL gia đình khác → 404 (không lộ tồn tại).
6. Nút thao tác chỉ hiện khi có quyền; nút ẩn không có nghĩa là action không kiểm quyền.

**Phụ thuộc:** US-05.

### US-08 · Tạo đơn nhiều con

**Mô tả:** Là Sale, tôi muốn tạo đơn cho 1..n con cùng lúc, mỗi con một khoá, để chốt cả nhà trong một lần mà giá từng con vẫn riêng.

**AC**
1. Từ lead "Đã đăng ký", danh sách con của lead hiện sẵn; sale tick con, chọn khoá, cơ sở, ngày bắt đầu cho từng con.
2. Hệ thống tính ưu đãi anh em theo chính sách (đối tượng áp, bậc %, cộng dồn) và hiện rõ con nào được giảm, vì sao.
3. Mỗi ghi danh chụp `policyVersionId`, niêm yết, học phí thực, số buổi, bảng giá 1 đoạn đúng luật làm tròn.
4. Nếu ví gia đình có tiền (vd cọc gộp), bước cuối bắt buộc hiện ví và cho chia vào các con hoặc giữ lại có lý do.
5. Ưu đãi ngoài chính sách chỉ nhập được với quyền `billing:out-of-guardrail`.
6. Xác nhận sinh đúng một `MoneyOperation` loại ADD_CHILD/CREATE; test tình huống gốc `GD-MAU` khớp hằng kỳ vọng.

**Phụ thuộc:** US-04, US-06, US-07.

### US-09 · Kế hoạch đợt linh hoạt và cọc

**Mô tả:** Là Sale, tôi muốn chọn mẫu kế hoạch rồi sửa số đợt, số tiền, hạn cho từng con, để theo đúng khả năng đóng của phụ huynh.

**AC**
1. Mẫu FULL, THEO_BUOI_n, THEO_THANG, COC_ROI_THEO_BUOI, TUY_CHINH; đợt chia theo buổi có `sessionFrom/To`.
2. Sale sửa số tiền/hạn của đợt CHƯA_THU; đợt cuối tự cân để Σ = học phí thực (B6); đợt đã có tiền bị khoá.
3. Giới hạn (số đợt tối đa, đợt đầu tối thiểu, cọc tối thiểu, hạn ≤ buổi đầu + ân hạn) chặn nút xác nhận với lý do cụ thể; người có `billing:out-of-guardrail` vượt được, bắt buộc ghi lý do.
4. Sửa đợt đang nằm trong kỳ thu mở chưa nhận tiền → xem trước báo "kỳ thu KT-x sẽ bị huỷ và phát hành lại".
5. Tất toán sớm: gộp các đợt còn lại thành 1; nếu chính sách có ưu đãi đóng full thì hiện số giảm, không tự áp khi `stack…=false` và đã có ưu đãi anh em.
6. Không còn trần 2 đợt ở bất kỳ chỗ nào khi cờ bật.

**Phụ thuộc:** US-08.

### US-10 · Phát hành kỳ thu gom nhiều con

**Mô tả:** Là Sale, tôi muốn tạo một QR gom các khoản của nhiều con, để phụ huynh chuyển một lần mà tiền vẫn vào đúng từng con.

**AC**
1. Sale tick con → tick đợt → sửa số tiền từng dòng (≤ còn nợ của đợt); xếp thứ tự dòng (mặc định QUYẾT TOÁN, hạn sớm, thứ tự con).
2. Kỳ thu có mã 8 ký tự duy nhất, VA (nếu SePay cấp được), QR ghi rõ từng dòng "An · Đợt 2: 3.800.000đ"; nội dung CK `<mã> <SĐT>` ≤ 25 ký tự.
3. Một đợt chỉ nằm trong tối đa một kỳ thu OPEN (B7): tick đợt đang nằm kỳ thu mở → chặn, gợi ý huỷ kỳ thu cũ.
4. Huỷ kỳ thu chỉ khi chưa nhận đồng nào; đã nhận một phần → chỉ "Đóng kỳ thu" (CLOSED_PARTIAL).
5. Kỳ thu không có hết hạn; QR tải lại được bất kỳ lúc nào khi còn OPEN.
6. Không phát hành kỳ thu gom con thuộc hai đơn vị kế toán khác nhau.

**Phụ thuộc:** US-09.

### US-11 · Tiền về tự phân bổ đích danh

**Mô tả:** Là Kế toán, tôi muốn tiền chuyển khoản tự vào đúng từng con theo kỳ thu, để không phải chia tay và không ai chia theo tỉ trọng.

**AC**
1. Webhook SePay đi qua `ghiNghiepVuTien`; khớp VA → mã kỳ thu → SĐT theo BA 4.3.
2. Khớp kỳ thu OPEN: lấp dòng theo thứ tự; thiếu → dòng cuối thiếu; thừa → ví `OVERPAY` + dòng "Cần xử lý".
3. Khớp kỳ thu CANCELLED/CLOSED_PARTIAL → toàn bộ vào ví + "Cần xử lý".
4. Chỉ khớp SĐT duy nhất một gia đình trong một đơn vị kế toán → ví `UNMATCHED_TO_WALLET`; SĐT trùng hoặc không khớp → "Cần xử lý: chưa gán", không ghi dòng tiền.
5. Cùng `bankTxnId` bắn lại → không sinh dòng mới (unique + idempotency).
6. Không gọi `allocateByWeight` trên đường mới; webhook không từ chối vì lệch số tiền.
7. Trang `/admin/bien-dong-so-du` hiện kỳ thu khớp và cách chia từng dòng.

**Phụ thuộc:** US-10.

### US-12 · Gán giao dịch chưa khớp và chia ví

**Mô tả:** Là Sale, tôi muốn gán khoản chuyển khoản sai nội dung vào đúng gia đình rồi chia cho các con, để không phải chờ admin/kế toán.

**AC**
1. Dòng "Cần xử lý: chưa gán" có nút "Gán vào gia đình": tìm theo SĐT/tên con, chỉ trong phạm vi quyền.
2. Gán = tiền vào ví của gia đình (chưa phải doanh thu); ghi `MoneyOperation` loại RECEIPT_ALLOCATE.
3. "Chia ví": nhập số cho từng con, mỗi con ≤ còn nợ (B1), Σ ≤ số dư ví (B4); phần còn lại ở ví.
4. Khoản chưa CONFIRMED chỉ được gán, chưa chia được (B9) — hiện rõ "chờ kế toán xác nhận".
5. Gán nhầm gia đình → sửa bằng nghiệp vụ đảo (ví gia đình A −, gia đình B +) cần quyền kế toán; dòng gốc giữ nguyên.

**Phụ thuộc:** US-11.

### US-13 · Ghi nhận tiền mặt và nhiều phương thức

**Mô tả:** Là Sale, tôi muốn ghi khoản phụ huynh đưa tiền mặt (một phần tiền mặt, một phần chuyển khoản) vào kỳ thu, để công nợ phản ánh ngay.

**AC**
1. Trên kỳ thu OPEN, nút "Ghi tiền mặt": số tiền, người nộp, ảnh phiếu thu (tuỳ chọn).
2. Dòng tiền mặt vào trạng thái RECORDED, phân bổ theo thứ tự dòng như tiền chuyển khoản; tính vào "Chờ xác nhận".
3. Kế toán xác nhận → CONFIRMED; từ chối → REJECTED, công nợ con tự quay lại, dòng kỳ thu mở lại.
4. Một kỳ thu nhận được cả tiền mặt và chuyển khoản; tổng thừa → ví.
5. `payerName` (bố/mẹ/ông bà) không đổi cách phân bổ.

**Phụ thuộc:** US-11.

---

## Đợt 3

### US-14 · Dừng học — tính quyết toán và xem trước

**Mô tả:** Là Sale, tôi muốn bấm "Dừng học" cho một con và thấy ngay con đó dư hay thiếu bao nhiêu, để trả lời phụ huynh chính xác.

**AC**
1. Chọn lý do (PH_CHU_DONG / TRUNG_TAM_HUY / KHAC) và buổi cuối; hệ thống gợi ý số buổi đã dùng theo `usedSessionRule` và hiện danh sách buổi được tính.
2. Sale sửa số buổi đã dùng → bắt buộc ghi chú; ghi chú lưu vào `EnrollmentEvent`.
3. Xem trước hiện: giá trị đã dùng (theo từng đoạn bảng giá), phí dừng, đã thu (CONFIRMED), chờ xác nhận, chênh.
4. Học lố (đã dùng > đã thu) hiện cảnh báo và số còn nợ.
5. `TRUNG_TAM_HUY` → phí = 0, ẩn "không hoàn".
6. Tình huống A và B của `GD-MAU` ra đúng hằng kỳ vọng ở bước xem trước (chưa ghi).

**Phụ thuộc:** US-05, G0-4.

### US-15 · Dừng học — xử lý dư/thiếu và kỳ thu đang mở

**Mô tả:** Là Sale, tôi muốn chọn nơi đi của khoản dư (anh/chị em, ví, hoàn) và để hệ thống tự dọn đợt thu, kỳ thu, để không còn khoản treo.

**AC**
1. Chênh > 0: bắt buộc phân hết khoản dư vào một hoặc nhiều nơi (con khác — mặc định con còn nợ nhiều nhất, ví, chuyển kế toán hoàn); Σ = chênh, không đủ thì nút xác nhận khoá.
2. "Không hoàn" chỉ hiện khi `allowForfeit=true` và người thao tác có `billing:forfeit`; tối đa `maxForfeitAmount`.
3. Xác nhận: huỷ đợt CHƯA_THU, thêm QUYẾT TOÁN, TRANSFER/ví, ghi danh STOPPED, `EnrollmentEvent` — trong một `MoneyOperation`.
4. Kỳ thu OPEN chứa dòng của con dừng: chưa nhận tiền → huỷ + phát hành lại cho dòng còn lại (hỏi sale trong xem trước); đã nhận một phần → CLOSED_PARTIAL.
5. Chênh < 0: dòng QUYẾT TOÁN dương xuất hiện trong danh sách chọn của kỳ thu kế tiếp, đứng đầu thứ tự.
6. Kiểm cân gia đình sau thao tác: B5 đúng; tình huống A, B, C khớp hằng kỳ vọng.
7. Chọn "hoàn" → sinh việc cho kế toán (thông báo nội bộ), tiền nằm ở ví trạng thái chờ hoàn cho tới US-21.

**Phụ thuộc:** US-14, US-17 (dùng chung bút toán chuyển).

### US-16 · Ưu đãi liên đới tự tính lại

**Mô tả:** Là Sale, tôi muốn hệ thống tự báo con nào mất ưu đãi anh em khi một con dừng, và tăng đợt bao nhiêu, để tôi báo phụ huynh trước khi bấm.

**AC**
1. Khi một ghi danh chuyển STOPPED (không tính PAUSED nếu `pausedSiblingKeepsDiscount=true`), quét ưu đãi `SIBLING_ACTIVE` của anh/chị em trong gia đình.
2. Không còn anh/chị em đủ điều kiện → tách bảng giá tại k (buổi đầu của con được ưu đãi sau ngày buổi cuối của con dừng) theo `onSiblingLost`.
3. Đợt CHƯA_THU → huỷ và tạo mới đúng số; đợt đã có tiền → thêm QUYẾT TOÁN dương.
4. Gia đình còn ≥ 2 con đủ điều kiện → giữ nguyên, nhưng nếu bậc % đổi (3 con còn 2) thì tính lại bậc theo chính sách.
5. Thay đổi hiện trong xem trước của US-14/15 và ghi chung `MoneyOperation`.
6. Tình huống A: đợt 2 An từ 4.320.000 thành 4.800.000.

**Phụ thuộc:** US-08.

### US-17 · Chuyển tiền giữa các con

**Mô tả:** Là Sale, tôi muốn chuyển tiền đã đóng của con này sang con khác trong cùng gia đình, để xử lý khi phụ huynh đổi ý mà không cần hoàn rồi thu lại.

**AC**
1. Chọn con nguồn, con đích, số tiền; nguồn chỉ tính phần CONFIRMED; sau chuyển nguồn vẫn ≥ 0 và đích ≤ phải thu (B1).
2. Nguồn là ghi danh ACTIVE → cảnh báo "con nguồn sẽ phát sinh nợ X".
3. Chặn chuyển khác đơn vị kế toán (B8) và khác gia đình.
4. Sinh cặp TRANSFER −/+ cùng `operationId`, Σ = 0 (B3).
5. Ghi danh đích chuyển tiếp dư sang ví nếu vượt phải thu — không cho vượt (người dùng phải chọn).

**Phụ thuộc:** US-05, US-07.

### US-18 · Bảo lưu và học lại

**Mô tả:** Là Sale, tôi muốn bảo lưu một con trong khi các con khác vẫn học và đóng tiền, để giữ tiền của con đó mà không tính quá hạn.

**AC**
1. Bảo lưu: nhập ngày dự kiến học lại ≤ `maxPauseDays`; ghi danh PAUSED.
2. Đợt chưa tới hạn dời hạn theo số ngày bảo lưu; không có đợt nào của con đó thành QUA_HAN trong thời gian PAUSED.
3. Ưu đãi anh em của con khác giữ nguyên theo `pausedSiblingKeepsDiscount`.
4. Học lại: ACTIVE, gợi ý xếp lớp; bảng giá các buổi còn lại giữ nguyên.
5. Quá ngày dự kiến học lại → thông báo nội bộ cho sale phụ trách; không tự dừng.

**Phụ thuộc:** US-05.

### US-19 · Thêm con vào gia đình đang học

**Mô tả:** Là Sale, tôi muốn thêm con mới vào gia đình đang học ở giữa khoá, để con mới có kế hoạch riêng và ưu đãi anh em được tính đúng từ lúc thêm.

**AC**
1. Luồng như US-08 cho con mới; lịch đợt con mới độc lập; kỳ thu vẫn gom được với anh/chị em.
2. Ưu đãi anh em áp cho đối tượng theo chính sách từ đoạn chưa học trở đi; **không** tính lùi đợt đã có tiền.
3. Nếu đối tượng giảm là con cũ: đợt CHƯA_THU của con cũ huỷ-tạo mới số thấp hơn; không tạo quyết toán âm cho đợt đã thu.
4. Con cũ đóng full, con mới trả góp: được, không ràng buộc hình thức.
5. Xem trước hiện rõ số thay đổi của từng con.

**Phụ thuộc:** US-08, US-16.

### US-20 · Đổi khoá / đổi cơ sở

**Mô tả:** Là Sale, tôi muốn chuyển một con sang khoá khác (lên cấp, lớp ít buổi hơn) hoặc cơ sở khác, để tiền đã đóng được mang theo chính xác.

**AC**
1. Một thao tác: dừng ghi danh cũ (phí dừng = 0, quyết toán theo buổi đã dùng) + tạo ghi danh mới (chính sách hiện hành) + chuyển dư sang ghi danh mới.
2. Chuyển bằng tiền: dư 1.000.000 từ khoá 250.000/buổi sang khoá 200.000/buổi hiện "tương đương 5 buổi" chỉ để tham khảo.
3. Khoá mới đắt hơn → phần còn thiếu thành đợt của ghi danh mới; rẻ hơn và dư vượt học phí mới → phần vượt vào ví.
4. Cơ sở đích khác đơn vị kế toán → không chuyển; ghi danh cũ quyết toán, dư vào ví đơn vị cũ, sinh việc hoàn cho kế toán nguồn và ghi chú thu mới cho đơn vị đích.
5. Ưu đãi liên đới được xét lại như US-16.

**Phụ thuộc:** US-15, US-16, US-17.

---

## Đợt 4

### US-21 · Hoàn tiền

**Mô tả:** Là Kế toán, tôi muốn hoàn tiền từ ví gia đình ra ngoài có chứng từ, để đóng các khoản phụ huynh rút hoặc chuyển thừa.

**AC**
1. Chỉ quyền `billing:refund`; danh sách "chờ hoàn" gồm khoản sale chuyển sang từ US-15/US-20 và khoản ví bất kỳ.
2. Bắt buộc: số tiền ≤ số dư ví đơn vị đó, người nhận, số tài khoản nhận hoặc tiền mặt, ảnh chứng từ.
3. Sinh dòng ví `REFUND` âm và `Payment` loại REFUND âm (nếu hoàn thẳng từ ghi danh qua ví, đi hai bước trong cùng nghiệp vụ).
4. B4, B5 đúng sau hoàn; không hoàn quá số tiền đã từng vào.
5. Dòng hoàn có cờ để module hoa hồng sau này trừ.

**Phụ thuộc:** US-15.

### US-22 · Miễn giảm và vượt giới hạn

**Mô tả:** Là QLCS, tôi muốn miễn phần nợ nhỏ hoặc phí trễ và cho phép một kế hoạch ngoài giới hạn, để xử lý ngoại lệ mà không cần hàng chờ duyệt.

**AC**
1. `billing:waive`: thêm QUYẾT TOÁN âm có lý do, không lớn hơn còn nợ của ghi danh.
2. `billing:out-of-guardrail`: QLCS mở khoá một giới hạn cho một thao tác cụ thể, bắt buộc lý do; không đổi chính sách chung.
3. Sale gọi trực tiếp action miễn giảm → từ chối (test deny ở action, không chỉ ẩn nút).
4. Báo cáo tháng: tổng miễn giảm và số lần vượt giới hạn theo QLCS.

**Phụ thuộc:** US-05.

### US-23 · Quá hạn và nhắc

**Mô tả:** Là Sale, tôi muốn thấy danh sách con quá hạn theo gia đình mỗi sáng, để nhắc phụ huynh đúng người đúng số.

**AC**
1. Cron hằng ngày tính trạng thái suy ra, ghi bảng tổng hợp đọc nhanh (không phải nguồn sự thật).
2. Danh sách "Quá hạn" theo gia đình, gom các con, hiện số ngày quá, gợi ý phát hành kỳ thu gộp.
3. Thông báo nội bộ cho sale phụ trách mỗi sáng; không bắn trùng trong ngày (dedupeKey theo ngày).
4. PAUSED không vào danh sách.
5. Phí trễ chỉ phát sinh khi chính sách > 0, dưới dạng QUYẾT TOÁN có lý do `PHI_TRE`.

**Phụ thuộc:** US-05, US-18.

### US-24 · Kiểm cân hằng đêm

**Mô tả:** Là Dev lead, tôi muốn mỗi đêm hệ thống tự kiểm cân mọi gia đình và báo ngay khi lệch, để lỗi tiền được thấy trước khi phụ huynh thấy.

**AC**
1. Cron chạy `kiemBatBien` (US-02) trên mọi gia đình × đơn vị kế toán; kết quả lưu theo ngày.
2. Có vi phạm → thông báo nội bộ cho Dev lead và kế toán, liệt kê gia đình, mã bất biến, số lệch.
3. Kiểm thêm: không nhận giao dịch SePay nào trong N giờ làm việc (N cấu hình) → cảnh báo (E7).
4. Kiểm thêm: dòng "Cần xử lý" tồn quá 12 giờ → nhắc QLCS cơ sở.
5. Tích hợp vào `shadow-compare-cong-no.yml` hoặc cron Vercel có xác thực `CRON_SECRET`; chạy chỉ-đọc.

**Phụ thuộc:** US-02, US-11.

### US-25 · Chuyển dữ liệu sổ B

**Mô tả:** Là Kế toán, tôi muốn các đơn cũ theo `OrderInstallment` được chuyển sang mô hình mới mà số không đổi, để chỉ còn một sổ.

**AC**
1. Script khô (dry-run) in bảng: mỗi đơn cũ → ghi danh, đợt mới, Phải thu/Đã thu trước và sau; mọi dòng lệch 0đ.
2. Chạy thật trong transaction, idempotent, có `MoneyOperation` loại MIGRATE cho từng gia đình.
3. Sau chạy: kiểm cân gia đình toàn bộ sạch; `OrderInstallment` chỉ đọc.
4. Chạy trên test trước, chụp kết quả; prod chạy sau khi pilot xanh.
5. Có kế hoạch lùi: cờ tắt + dữ liệu sổ B vẫn nguyên (không xoá).

**Phụ thuộc:** US-05, US-24.

### US-26 · Báo cáo nghiệp vụ tiền theo nhân viên

**Mô tả:** Là QLCS, tôi muốn xem mỗi tuần sale nào đã chuyển tiền, dừng học, gán ví bao nhiêu lần và bao nhiêu tiền, để phát hiện thao tác bất thường.

**AC**
1. Bảng theo nhân viên × loại nghiệp vụ: số lần, tổng tiền, số lần sửa số buổi đã dùng.
2. Lọc theo cơ sở, khoảng ngày; bấm vào mở dòng thời gian gia đình.
3. Đánh dấu bất thường: chuyển tiền từ con có nợ quá hạn; sửa số buổi đã dùng lệch gợi ý > 2 buổi.
4. Chỉ QLCS (CENTER) và Admin; xuất Excel theo quyền xuất hiện có.

**Phụ thuộc:** US-07.
