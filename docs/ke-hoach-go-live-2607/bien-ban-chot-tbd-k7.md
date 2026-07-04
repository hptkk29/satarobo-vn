# Biên bản chốt 3 quyết định treo (K7) — GO-LIVE 26/07

> **Người quyết:** TGĐ Hồ Đắc Phúc (+ Kế toán cho TBD-2) · **Chuẩn bị:** Kiệt · **Hạn chốt:** 04/07/2026
> Trạng thái: ⬜ CHỜ CHỐT — điền mục "QUYẾT ĐỊNH" từng phần rồi đổi trạng thái thành ✅.

---

## TBD-2 — Công thức hoàn tiền / pro-rate / clawback

**Bối cảnh:** treo từ 11/06 (BA R6 §7). Toàn bộ code hoàn tiền đang bị CẤM viết cho đến khi chốt. Không chặn go-live (hoàn tiền ngoài scope v4) nhưng sau 26/07 ca rút giữa khoá sẽ phải xử tay nếu chưa có quyết định.

**4 câu cần chốt:**

| # | Câu hỏi | Phương án đề xuất | QUYẾT ĐỊNH |
|---|---|---|---|
| 2.1 | Công thức hoàn khi rút giữa khoá? | `hoàn = Σ đã thu (confirmed) − (số buổi đã học × đơn giá buổi)`, đơn giá = học phí ÷ tổng buổi | ⬜ |
| 2.2 | Phí hành chính khấu trừ? | 0đ / số cố định / % số tiền hoàn — chọn 1 | ⬜ |
| 2.3 | Thời hiệu được hoàn? Chuyển lớp khác mức phí tính chênh lệch theo cùng công thức? | Ví dụ: chỉ hoàn nếu rút trước 50% số buổi; chênh lệch chuyển lớp dùng cùng công thức | ⬜ |
| 2.4 | Clawback hoa hồng khi lead đã tính hoa hồng (kỳ APPROVED) bị hoàn? | Kỳ sau tự sinh dòng âm tương ứng (cơ chế đã thiết kế — US-R6E-2 AC3, DomainEvent idempotent) | ⬜ |

**QUYẾT ĐỊNH (TGĐ + Kế toán):** _(điền)_
**Ngày chốt:** _____ · **Người chốt:** _____

---

## TBD-3 — Quy trình migrate prod (từ nay đến 26/07)

**Bối cảnh:** phần "apply lần đầu" ĐÃ XONG (K1): DB Supabase up-to-date 155/155 migrations, seed OrgUnit/RoleDef/UserOrgRole hoàn tất 03/07. Còn lại là hợp thức hoá quy trình cho các đợt migrate tiếp theo tới go-live.

| # | Câu hỏi | Phương án đề xuất | QUYẾT ĐỊNH |
|---|---|---|---|
| 3.1 | Ai được chạy migrate prod? | Chỉ Kiệt (tech-lead) | ⬜ |
| 3.2 | Chạy lúc nào? | Ngoài giờ học (trước 8h / sau 21h) | ⬜ |
| 3.3 | Backup trước mỗi lần `migrate deploy` là điều kiện cứng? | CÓ — Supabase backup (RPO 24h / RTO 4–8h theo blueprint Doc 15) | ⬜ |
| 3.4 | Rollback chấp nhận được? | Restore backup gần nhất + revert deploy Vercel (chấp nhận mất dữ liệu tối đa từ lần backup gần nhất) | ⬜ |

**QUYẾT ĐỊNH (TGĐ):** _(điền)_
**Ngày chốt:** _____ · **Người chốt:** _____

---

## TBD-4 — Mức quét file SCORM zip (chặn K6 — bật SCORM prod 15–17/07)

**Bối cảnh:** R7-11 yêu cầu chốt trước PR bật prod. Người upload là nhân sự nội bộ (Đào tạo/GV) — rủi ro thấp.

**3 mức:**
- **(a) Validate cấu trúc** — kiểm `imsmanifest.xml`, chặn zip-slip/path-traversal, giới hạn dung lượng + số file, chặn đuôi nguy hiểm (.exe/.php…). Rẻ, nhanh.
- **(b) = (a) + kiểm soát khi render** — CSP trên player chặn script gọi ra ngoài (player đã có vé HMAC 10 phút + blur/watermark).
- **(c) = (b) + antivirus scan** (ClamAV/dịch vụ ngoài) — thêm chi phí + độ trễ upload.

**Đề xuất:** mức **(b)**. Mức (c) chỉ cần khi mở upload từ bên ngoài.

**QUYẾT ĐỊNH (TGĐ + Tech lead):** _(điền)_
**Ngày chốt:** _____ · **Người chốt:** _____
