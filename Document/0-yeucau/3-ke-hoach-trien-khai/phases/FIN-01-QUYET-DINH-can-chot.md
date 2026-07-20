# FIN-01 — 2 quyết định nghiệp vụ cần chốt (đơn giản, chọn A/B/C rồi báo)

> ## ✅ ĐÃ CHỐT 20/07
> - **Q1 = A — ĐÃ LÀM** (commit `65eaa60`): chia tiền theo `finalPrice` từng ghi danh (`allocateByWeight` bất biến tổng), Payment con + Receipt riêng per-Enrollment. e2e `[FIN-01-Q1A]` xanh.
> - **Q2 = KHÔNG auto-confirm mù** → tách thành **[[FIN-02-doi-soat-ngan-hang]]**: trang Đối soát ngân hàng + auto-match + **người có quyền bấm ✓** (đúng số tiền + đúng người gửi). Hiện tại bước ✓ đã có ở `/admin/payments` (thủ công). **CHẶN: chốt nguồn dữ liệu bank** (Casso/SePay / import sao kê / MISA / thủ công) — xem FIN-02 §2.
> - **Q3 = để sau** — khi làm tính năng **đăng ký tài khoản**: bắt buộc đăng ký + nhập đủ thông tin mới cho mua/thuê thiết bị; lưu hồ sơ nếu mua/thuê. Chưa build giờ.
> - **Q4 = ĐÃ LÀM** — đổi nhãn `Đã xác nhận TT` → **`Đã xác nhận đơn`** (commit `cbea86f`).


> Đọc mục **Bối cảnh** trước, rồi ở mỗi quyết định chỉ cần điền dòng **➡️ CHỐT: ___**.
> Nền tảng: xem [[FIN-01-order-enrollment-reconcile]]. Trạng thái hiện tại đã verify E2E: convert **1 học viên/1 đơn** → tiền vào ghi danh → kế toán confirm → Receipt → công nợ giảm. ✅

---

## Bối cảnh (30 giây)

Khi phụ huynh đóng tiền, hệ thống ghi 1 khoản `Payment` gắn vào **đơn hàng**. Trước đây khoản này **không bao giờ gắn vào ghi danh** của học viên → kế toán không xuất được phiếu thu, `/cong-no` "Tổng nợ (đăng ký)" không nhúc nhích. Tôi đã vá: **lúc convert lead, tự gắn khoản tiền của đơn vào ghi danh vừa tạo** — nhưng mới chỉ xử lý trường hợp **1 đơn = 1 ghi danh**. Hai câu dưới quyết định cách xử lý phần còn lại.

---

## ❶ QUYẾT ĐỊNH 1 — Đơn tạo NHIỀU ghi danh thì chia tiền thế nào?

**Tình huống:** 1 phụ huynh 1 đơn, nhưng convert tạo **nhiều ghi danh** (2 con cùng học, hoặc 1 con học combo nhiều khoá). Khoản tiền của đơn (ví dụ 12.000.000đ) nên gắn vào đâu?

| PA | Cách làm | Ưu | Nhược |
|---|---|---|---|
| **A. Chia theo giá từng ghi danh** | Tách khoản 12M thành nhiều khoản con theo `finalPrice` mỗi ghi danh (vd 6M + 6M) | Công nợ **từng học viên đúng tỉ lệ** | Phải tách 1 Payment → nhiều Payment + nhiều Receipt; xử lý **lẻ tiền làm tròn**; code + test nặng |
| **B. Gắn hết vào 1 ghi danh "chính"** | Dồn cả 12M vào khoá đầu/đắt nhất | Đơn giản, 1 Receipt | Công nợ hiển thị **sai**: 1 HV nợ 0đ, HV kia nợ đủ dù đã đóng |
| **C. KHÔNG tự gắn khi >1 — kế toán gắn tay** *(hiện tại)* | Đơn 1:1 tự chạy; đơn nhiều ghi danh để kế toán gắn từng khoản thủ công | Kế toán **kiểm soát**, không sai tiền tự động | Có thao tác tay; dễ quên nếu không nhắc |

**Khuyến nghị:** **C** trước mắt (an toàn tiền tuyệt đối), lên roadmap **A** khi làm tính năng tách Payment/Receipt theo từng ghi danh. **Tránh B** (gây sai công nợ hiển thị).

**➡️ CHỐT 1: _______**
*(Nếu chọn A: 1 Receipt tổng hay tách Receipt theo từng ghi danh? _______)*

---

## ❷ QUYẾT ĐỊNH 2 — Convert xong có TỰ xác nhận thu tiền (auto-confirm) không?

**Hiện tại:** convert chỉ **gắn** khoản vào ghi danh, trạng thái vẫn "Chờ kế toán". Phải **kế toán bấm ✓** thì mới thành "Đã thu" + sinh Receipt + công nợ giảm.

| PA | Cách làm | Ưu | Nhược |
|---|---|---|---|
| **A. Chỉ gắn, kế toán confirm sau** *(hiện tại)* | Người convert (sale/CSM) gắn tiền; kế toán duyệt riêng | Giữ **tách vai** (sale ≠ kế toán) → chốt kiểm soát nội bộ; đúng nguyên tắc kế toán | Thêm 1 bước; công nợ chưa giảm cho tới khi kế toán duyệt |
| **B. Convert xong tự confirm luôn** | Tiền vào sổ ngay khi convert | Nhanh, công nợ giảm tức thì | **Bỏ chốt kiểm soát kế toán** — sale tự "xác nhận đã thu" (rủi ro đối soát/gian lận nội bộ) |
| **C. Tự confirm CÓ điều kiện** | Chỉ auto khi **người convert có quyền kế toán** (`payments:confirm`); còn lại như A | Cân bằng: kế toán-kiêm-sale đỡ thao tác, người khác vẫn qua chốt | Logic điều kiện phức tạp hơn chút |

**Khuyến nghị:** **A** (giữ tách vai — chuẩn kiểm soát tài chính). Chọn **C** nếu ở CS nhỏ một người vừa convert vừa làm kế toán và muốn bớt 1 cú bấm.

**➡️ CHỐT 2: _______**

---

## Ảnh hưởng khi triển khai (để ước lượng)

- **Q1 → A:** cần logic tách/gán khoản theo tỉ lệ + (có thể) đổi cách sinh Receipt + test lệch tiền + migration nếu thêm bảng nối. Rủi ro tiền cao → làm sau, test kỹ, rollout sau 1 kỳ đối soát.
- **Q1 → C / Q2 → A:** **không phải sửa gì thêm** (đúng hành vi hiện tại).
- **Q2 → B/C:** sửa `lib/crm/convert-lead-v2.ts` gọi `confirmPayment` nội bộ (guard `enrollmentId` đã sẵn) — thay đổi nhỏ, nhưng đụng sổ tiền nên vẫn cần test.

## Còn 2 câu phụ (chưa gấp, ghi để không quên)

- **Q3 — Đơn sản phẩm/kit (không có ghi danh):** Receipt hiện đòi `enrollmentId`. Nếu muốn xuất phiếu thu cho đơn bán kit độc lập → cần cho Receipt cấp theo Order. *(Chưa cần nếu chưa bán kit rời.)*
- **Q4 — Nhãn trạng thái đơn "Đã xác nhận TT":** đang gây hiểu nhầm vì đó là "đợt đã đóng" (sổ đơn) ≠ "kế toán đã thu" (sổ ghi danh). Cân nhắc đổi tên "Đã ghi nhận đủ (chờ kế toán)". *(Cosmetic, không đụng tiền.)*

---
*File tạo 20/07 — trả lời bằng cách điền 2 dòng ➡️ CHỐT, tôi sẽ code theo.*
