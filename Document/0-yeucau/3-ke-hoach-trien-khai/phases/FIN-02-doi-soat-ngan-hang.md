# FIN-02 — Đối soát ngân hàng (trang xác nhận tiền vào tài khoản)

> Trạng thái: **SPEC — chờ 1 quyết định (nguồn dữ liệu giao dịch bank)** · Ưu tiên: P1 (sau FIN-01) · Nguồn: chốt Q2 của BGĐ 20/07.
> Liên quan: [[FIN-01-order-enrollment-reconcile]] · [[FIN-01-QUYET-DINH-can-chot]]

## 1. Yêu cầu (BGĐ chốt 20/07)

> "cần 1 trang để check bank đã nhận được đúng tiền hay chưa, và hệ thống cần tự xác nhận theo 1 phương thức nào đó để tự động phần này, **nhưng vẫn cần 1 người có quyền bấm tick để chắc chắn đúng số tiền và đúng người chuyển**."

Diễn giải thành 3 phần:
1. **Trang Đối soát ngân hàng** — liệt kê giao dịch tiền vào tài khoản ngân hàng ↔ các khoản `Payment` đang chờ (RECORDED / accountantStatus=PENDING), khớp hay chưa.
2. **Tự động khớp (auto-match)** — hệ thống gợi ý ghép giao dịch bank ↔ khoản chờ theo **số tiền + nội dung CK (mã đơn/mã HV) + tên người gửi**.
3. **Người có quyền bấm ✓** — kế toán/QL (`payments:confirm`) xác nhận **đúng số tiền + đúng người chuyển** → gọi `confirmPayment` → sinh Receipt → `getDebtRows` giảm nợ. **KHÔNG bỏ bước người duyệt** (auto chỉ gợi ý, không tự chốt tiền).

→ Đây chính là bước "ngân hàng đã nhận khoản thanh toán hợp lệ" trong Q2. FIN-01 lo **link/chia** lúc convert; FIN-02 lo **xác nhận** khoản đã link.

## 2. ⚠️ QUYẾT ĐỊNH CHẶN — Nguồn dữ liệu giao dịch ngân hàng

Muốn "tự xác nhận" thì hệ thống phải BIẾT tài khoản ngân hàng nhận được gì. Chọn 1 (hoặc kết hợp):

| PA | Nguồn | Cách hoạt động | Ưu | Nhược |
|---|---|---|---|---|
| **A. Cổng thu hộ / bank API tự động** (Casso, SePay, VietQR-Pro…) | Webhook đẩy MỌI giao dịch tiền vào realtime | Auto-match ngay, gần như tức thời | Ưu: tự động thật, ít thao tác. | Phí dịch vụ hàng tháng; phụ thuộc bên thứ 3; cần tài khoản/hợp đồng. |
| **B. Import sao kê** (CSV/Excel từ Internet Banking) | Kế toán tải sao kê → upload định kỳ (ngày/tuần) | Không phí; chủ động | Không realtime; thao tác tải + upload tay. |
| **C. MISA** (nếu đã dùng MISA kế toán) | Đồng bộ giao dịch từ MISA | Gộp về 1 sổ kế toán | Cần tích hợp MISA (nằm ở `modules/integration`, chưa wire). |
| **D. Thủ công 100%** (tạm) | Không có nguồn tự động; người duyệt tự xem app bank rồi tick | Làm được ngay, 0 phụ thuộc | Không có "auto-match" — chỉ là /payments hiện tại. |

**Khuyến nghị lộ trình:** **D ngay (đã có) → A hoặc B khi chốt nhà cung cấp.** SePay/Casso (PA A) là phổ biến nhất cho SMB VN (webhook + match theo nội dung CK). Cần BGĐ chốt: **dùng cổng nào? có ngân sách phí tháng không?**

**➡️ CHỐT nguồn bank: _______**  (A-cổng nào? / B / C / D-tạm)

## 3. Hiện trạng (đã có — bước D thủ công)

- `/admin/payments` đã cho kế toán bấm **✓ xác nhận** từng khoản `PENDING` có `enrollmentId` (FIN-01 đã gate: khoản chưa convert hiện "Chờ convert"). Bấm ✓ = `confirmPayment` → Receipt → nợ giảm.
- ⇒ Bước "người có quyền tick" (yêu cầu #3) **ĐÃ CHẠY**. FIN-02 = **thêm auto-match + gom thành trang đối soát** quanh nút ✓ sẵn có, KHÔNG làm lại từ đầu.

## 4. Phạm vi build (khi chốt nguồn)

- **Model** `BankTxn` (id, bankAccount, amount, transferredAt, counterpartyName, content, raw, matchedPaymentId?, status UNMATCHED/MATCHED/CONFIRMED/IGNORED). Idempotency theo mã giao dịch bank (chống nhận trùng webhook).
- **Ingest** (theo nguồn đã chốt): webhook `/api/public/webhook/bank/*` (PA A) HOẶC importer sao kê (PA B) — đi qua `modules/integration`, idempotent.
- **Auto-match** (thuần, test được): ghép `BankTxn` ↔ `Payment` PENDING theo `amount` khớp + `content` chứa mã đơn/mã HV (+ fuzzy tên người gửi). Trả điểm tin cậy; chỉ **gợi ý**, không tự confirm.
- **Trang `/admin/doi-soat-ngan-hang`**: 2 cột (giao dịch bank chưa khớp | khoản chờ), nút ✓ (đúng số tiền + đúng người) → `confirmPayment`, nút "bỏ qua". RBAC `payments:confirm`. scopedDb theo cơ sở.
- **Audit**: mọi confirm/ignore ghi audit + ai bấm.

## 5. Acceptance (nháp)
- [ ] Giao dịch bank vào → hiện ở trang đối soát, auto-match gợi ý đúng khoản (khi nội dung có mã).
- [ ] Người có quyền bấm ✓ → `confirmPayment` → Receipt + nợ giảm; KHÔNG ai khác confirm được (RBAC).
- [ ] Nhận webhook/import trùng → không tạo `BankTxn` trùng (idempotency).
- [ ] Số tiền / người gửi lệch → auto-match KHÔNG gợi ý (bắt người duyệt kiểm tay).
- [ ] Cách ly cơ sở: đối soát chỉ thấy khoản thuộc cơ sở của người dùng.

## 6. KHÔNG làm
- ❌ Auto-confirm không người duyệt (BGĐ yêu cầu giữ bước tick).
- ❌ Lưu số tài khoản/PII người chuyển lên URL; mask theo quyền như phần còn lại.
