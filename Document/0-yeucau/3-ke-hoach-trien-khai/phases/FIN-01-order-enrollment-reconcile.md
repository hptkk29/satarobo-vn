# FIN-01 — Link Order ↔ Enrollment lúc convert (reconcile công nợ)

> Trạng thái: **BACKLOG** (chưa làm) · Ưu tiên: **P0 tiền** · Loại: schema + luồng convert + kế toán
> Bối cảnh phát hiện: test tay admin 20/07 (batch FixAdminSite). Xem [[project_admin_bug_batch_2007]].

## 1. Vấn đề

Hệ thống có **HAI sổ nợ độc lập, không đối soát được**:

| Sổ | Nguồn | Nơi hiển thị |
|---|---|---|
| **Nợ theo ghi danh** | `Enrollment.finalPrice − Σ Payment(accountantStatus=CONFIRMED, enrollmentId=<enr>)` | `/cong-no` "Tổng nợ (đăng ký)" (`getDebtRows`), lead detail, portal |
| **Nợ theo đơn** | `OrderInstallment` (status PENDING/PAID) | `/cong-no` ô tuổi nợ, `/orders/[id]` |

**Gốc rễ:** `Order` **KHÔNG có relation `Enrollment`**; khoản Payment sinh từ đơn (`ensureOrderPaymentRecorded`) **KHÔNG set `enrollmentId`** (chỉ `orderId`). Nên:

1. Khoản order-ledger **không bao giờ** vào `getDebtRows` (vốn cộng theo `enrollment.payments`) → đóng đợt bao nhiêu, "Tổng nợ (đăng ký)" **không đổi**.
2. `confirmPayment` có chốt `if (!enrollmentId) fail("Khoản chưa gắn ghi danh, không thể sinh phiếu thu")` (Receipt scoped theo Enrollment) → khoản order-ledger **không thể CONFIRMED** → mãi ở `RECORDED` / "Chờ kế toán", **không có Receipt**.
3. Đây **đúng thiết kế one-way hiện tại**: `convert-lead-v2.ts` ghi chú *"confirmPayment sinh per Enrollment nên chỉ confirm được SAU khi convert tạo Enrollment; đòi CONFIRMED trước convert = deadlock"* — NHƯNG **luồng convert hiện KHÔNG hoàn tất mắt xích**: sau khi tạo Enrollment, nó **không** link + confirm các khoản RECORDED của đơn.

## 2. Triệu chứng (test tay xác nhận)

- Đơn `ORD-260629-000002` (studentId=null, **chưa convert**): đợt-1 4M *PAID* + đợt-2 4.64M PENDING, nhưng Payment = 1 khoản 8.64M `RECORDED`. `/cong-no` không phản ánh; hàng `luancon` vẫn 8.64M.
- Order-status "**Đã xác nhận TT**" (Ledger-B: đợt đã đóng) vs Payment "**Chờ kế toán / RECORDED**" (Ledger-A) — **nhãn lệch nhau**.
- `/payments` hiện nút **✓ xác nhận** cho khoản order-ledger *chưa convert* → bấm sẽ **lỗi** `"Khoản chưa gắn ghi danh"` (confirm button hiện sai chỗ).
- `/cong-no` "Tổng nợ (đăng ký)" ≠ Σ ô tuổi nợ (đã thêm ghi chú "2 phạm vi khác nhau" ở commit `9b71e58` để đỡ hiểu nhầm — nhưng đó chỉ là band-aid).

## 3. Giải pháp đề xuất (cần chốt trước khi code)

**Mắt xích thiếu = link + confirm lúc convert.** Tại `lib/crm/convert-lead-v2.ts`, sau khi tạo Enrollment(s) trong transaction:

1. **Link**: set `enrollmentId` cho các Payment `RECORDED` của order (theo `orderId`) → đúng Enrollment tương ứng.
2. **Confirm**: gọi `confirmPayment` cho từng khoản (giờ có `enrollmentId` → sinh Receipt hợp lệ) — hoặc để kế toán confirm tay (giờ nút ✓ chạy được).
3. Sau đó `getDebtRows` phản ánh khoản CONFIRMED → `/cong-no` "Tổng nợ (đăng ký)" khớp.

### Câu hỏi phải chốt (BGĐ / nghiệp vụ)
- **1 order → nhiều Enrollment** (dedupe student cùng phụ huynh, combo nhiều khoá): khoản của đơn **chia** cho các enrollment thế nào? (theo `finalPrice` từng enrollment? gán hết vào 1 enrollment "chính"?)
- Convert xong có **auto-confirm** khoản (kế toán khỏi bấm) hay chỉ **link** rồi để kế toán confirm tay? (auto-confirm = bỏ chốt kiểm soát kế toán; link-only = giữ kiểm soát nhưng nút ✓ mới chạy được).
- Đơn **sản phẩm/kit** (không có Enrollment) xử lý sao? (Receipt hiện đòi enrollmentId → cần Receipt cho order không-enrollment, hoặc miễn).
- Order-status "Đã xác nhận TT" nên đổi tên/nghĩa? (ví dụ "Đã ghi nhận đủ (chờ kế toán)" tới khi Payment thật CONFIRMED).

### Việc kèm theo
- **Ẩn/khoá nút ✓ confirm** trên `/payments` cho khoản `enrollmentId=null` (chưa convert) + tooltip "confirm sau khi convert" — thay vì để bấm ra lỗi.
- Cân nhắc **cho phép Receipt cấp cho Order** (không chỉ Enrollment) nếu muốn confirm order-payment độc lập convert.

## 4. Acceptance criteria

- [ ] Convert lead có ≥1 Payment RECORDED → sau convert, khoản có `enrollmentId` + trạng thái theo quyết định (CONFIRMED có Receipt / hoặc PENDING confirm-được).
- [ ] `/cong-no` "Tổng nợ (đăng ký)" của HV giảm đúng số đã CONFIRMED.
- [ ] Nút ✓ trên `/payments` chỉ hiện cho khoản có thể confirm (enrollmentId set); khoản chưa convert không hiện (hoặc disabled + lý do).
- [ ] Idempotent: re-convert / double mark không sinh Receipt trùng, không link đôi.
- [ ] Đơn nhiều-enrollment: tổng khoản link = tổng finalPrice (không lệch tiền).
- [ ] Test: Vitest cho hàm link/split (thuần) + e2e convert→confirm→cong-no giảm.

## 5. Rủi ro
- Thay đổi **sổ tiền** — sai split/confirm làm lệch công nợ nặng hơn. Bắt buộc test kỹ + rollout sau khi kế toán đối soát 1 kỳ.
- Migration nếu thêm `Order.enrollmentId` / bảng nối `OrderEnrollment` (many-to-many): 2-phase (add nullable → backfill → dùng → drop cũ).

## 6. KHÔNG làm (đã loại)
- ❌ Auto-confirm ở `markInstallmentPaid` (đã thử `35ba475`, revert `b9d3b73`): confirm trước convert = deadlock (không enrollmentId → confirmPayment fail).
