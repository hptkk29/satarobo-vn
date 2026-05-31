# Chuyển lead → Đã đăng ký (Cụm A3)

Flow 1-bấm chuyển lead sang **ĐÃ ĐĂNG KÝ**, tạo gộp hồ sơ để giảm nhập tay.
Tái dùng model hiện có (Lead, Student, Enrollment, Order, User PARENT), `lib/codegen.ts`,
OTP service (A1), EmailQueue (A2). **Không tạo bảng quan hệ mới** (dùng `User.children` — ParentChildren).

## Giao diện

- Nút **"Chuyển sang Đã đăng ký"** trên: trang chi tiết lead, Kanban, bảng lead.
- Mở form xác nhận (lớp, học phí, đã đóng, tạo tài khoản phụ huynh) → submit.

## Hành động (action `closeLeadAsEnrolled` — `app/(admin)/admin/leads/actions.ts`)

Center scope: SALE (view-own) chỉ chuyển lead **của mình**. Tất cả trong **1 transaction** (rollback nếu lỗi):

1. **Chống trùng phụ huynh** theo EMAIL hoặc SĐT (qua `children.parentPhone`) → dùng lại, không tạo trùng / không reset mật khẩu.
2. **Tài khoản phụ huynh** mới = role PARENT, `accountStatus = PENDING_ACTIVATION` (không mật khẩu).
3. **Học sinh** — mã HV qua `genStudentCode` (CS1.HV.26.xxx); liên kết `parentUserId`.
4. **Enrollment** (status CONFIRMED) + audit; thêm HS vào lớp (kiểm tra còn chỗ).
5. **Hoá đơn (Order)** nếu có học phí — `generateOrderCode` (ORD-YYMMDD-NNNNNN), type COURSE, OrderItem
   COURSE_ENROLLMENT link enrollment; subtotal/discount/total; trạng thái PENDING_PAYMENT/CONFIRMED.
6. **Lead → ENROLLED** + `convertedById/convertedAt` + audit + activity.
7. **Care task** "Chăm sóc sau đăng ký" (LeadTask) cho SALE phụ trách (hạn +2 ngày).
8. Buổi học thử đang mở → ENROLLED.

Sau transaction (không chặn nghiệp vụ nếu lỗi phụ):
- **OTP kích hoạt** gửi email (A1) cho tài khoản phụ huynh mới (`requestOtp` purpose ACTIVATION).
- **Email xác nhận đăng ký** đẩy vào EmailQueue (A2) — chỉ dữ liệu con liên quan.

## Kết quả UI

Toast báo: đã tạo HV (mã), hoá đơn (ORD-…), tài khoản PH (đã gửi email kích hoạt). Không tạo trùng nếu cùng email/SĐT.

## Test (dùng lead `ZZTEST_`, KHÔNG đụng data thật)

1. Lead ZZTEST_ CS1 → "Chuyển sang Đã đăng ký" → form → submit.
2. Kiểm tra: Student (mã HV) · Enrollment · Order · User PENDING_ACTIVATION · OtpRequest (ACTIVATION) ·
   LeadTask · audit; Lead = ENROLLED + convertedBy.
3. Chạy lại cùng SĐT/email → KHÔNG tạo phụ huynh trùng (dùng lại).
4. Cố tình lỗi giữa chừng (vd lớp đầy) → rollback sạch (không tạo nửa vời).
5. Phụ huynh /kich-hoat nhập email → OTP → đặt mật khẩu → ACTIVE → vào portal thấy đúng con.
