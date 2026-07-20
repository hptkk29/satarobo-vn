# FIN-02 — Đối soát ngân hàng (trang xác nhận tiền vào tài khoản)

> Trạng thái: **SPEC — nguồn bank ĐÃ CHỐT (D nay → A sau, admin tự setup cổng)** · Ưu tiên: P1 (sau FIN-01) · Nguồn: chốt Q2 của BGĐ 20/07. Chưa build (hiện dùng D thủ công).
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

**➡️ ĐÃ CHỐT 20/07:** **Hiện tại = D (thủ công, đã có ở `/admin/payments`).** **Tương lai = A**, NHƯNG bắt buộc **admin tự cấu hình cổng thu, TÙY theo ngân hàng** — không hardcode 1 cổng/1 bank. ⇒ FIN-02 phải thiết kế cổng thu **data-driven** (thêm bank/nhà cung cấp = thêm data + nhập credential qua UI, KHÔNG sửa code). Chưa chốt nhà cung cấp cụ thể (SePay/Casso/VietQR…) — để admin chọn lúc setup.

### 2b. Admin tự setup cổng thu (yêu cầu chốt 20/07) — thiết kế data-driven

- **Model `PaymentGatewayConfig`** (admin quản qua UI, KHÔNG hardcode): `id, provider (SEPAY|CASSO|VIETQR|MANUAL…), bankCode, accountNumber, accountName, webhookSecret (mã hoá at-rest), isActive, centerId? (cổng theo cơ sở nếu cần), createdBy, note`. Nhiều cổng song song (mỗi bank/tài khoản 1 dòng).
- **Trang `/admin/settings/cong-thu`** (RBAC chỉ SUPER_ADMIN / vai tài chính cấp cao): thêm/sửa/bật-tắt cổng, dán credential + secret, test kết nối. Secret mask khi hiển thị (như quy ước PII), audit mọi thay đổi (đây là "standing config" — cần xác nhận + audit + reason theo rule chung).
- **Webhook `/api/public/webhook/bank/[provider]`**: đọc config theo provider/bank đang active để verify chữ ký + parse payload → tạo `BankTxn`. Provider mới = thêm 1 adapter trong `modules/integration` + 1 dòng config, KHÔNG đụng route.
- **Chuyển D→A không đổi luồng đối soát**: dù nguồn là webhook (A) hay import sao kê (B) hay thủ công (D), trang đối soát + nút ✓ người duyệt GIỮ NGUYÊN — chỉ khác cách `BankTxn` được nạp vào.
- ⚠️ Credential/secret cổng thu = bí mật: `process.env` cho khoá hệ thống, phần admin nhập lưu **mã hoá at-rest** (KHÔNG plaintext DB), KHÔNG log, KHÔNG lộ ra client.

## 3. Hiện trạng (đã có — bước D thủ công)

- `/admin/payments` đã cho kế toán bấm **✓ xác nhận** từng khoản `PENDING` có `enrollmentId` (FIN-01 đã gate: khoản chưa convert hiện "Chờ convert"). Bấm ✓ = `confirmPayment` → Receipt → nợ giảm.
- ⇒ Bước "người có quyền tick" (yêu cầu #3) **ĐÃ CHẠY**. FIN-02 = **thêm auto-match + gom thành trang đối soát** quanh nút ✓ sẵn có, KHÔNG làm lại từ đầu.

## 4. Phạm vi build (khi bật A — hiện đang D)

- **Model `PaymentGatewayConfig`** (admin tự setup — xem §2b): provider/bank/account/webhookSecret(mã hoá)/isActive.
- **Model** `BankTxn` (id, gatewayConfigId, bankAccount, amount, transferredAt, counterpartyName, content, raw, matchedPaymentId?, status UNMATCHED/MATCHED/CONFIRMED/IGNORED). Idempotency theo mã giao dịch bank (chống nhận trùng webhook).
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
