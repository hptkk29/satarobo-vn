# Runbook — Nhập liệu ban đầu CS1/CS2 & cấp tài khoản phụ huynh

> Bối cảnh: data vận hành prod đã dọn sạch 01/08/2026. Lead cũ (đã đăng ký khoá
> từ trước) nhập lại từ file Excel của Sale. Mục tiêu: **học viên vào lớp + phụ
> huynh có tài khoản đăng nhập bằng SĐT** với ít thao tác tay nhất.

## Quy trình 5 bước

### Bước 0 — Chuẩn bị (1 lần)
- Dựng đủ **lớp học** cho CS1/CS2 (`/admin/classes/new`): đúng khoá học, đúng cơ
  sở, GV chính + phòng. Chưa cần duyệt lớp ngay — màn chốt hàng loạt nhận lớp ở
  trạng thái PLANNED/RECRUITING/ACTIVE.
- File Excel gốc của Sale (nhiều sheet theo tháng) — giữ nguyên, không cần sửa.

### Bước 1 — Import lead: `/admin/leads/import/registered`
- Upload file → **Xem thử (dry-run)** → đọc kỹ: lỗi dòng, sales/khoá/cơ sở không
  khớp, SĐT trùng cơ sở khác → **Ghi**.
- Kết quả: mỗi SĐT = 1 Lead **Đã đăng ký** + mỗi dòng học viên = 1 con (LeadChild).
  Import lại cùng file = không đổi (idempotent).

### Bước 2 — Chốt hàng loạt: `/admin/leads/bulk-convert` (MỚI)
- Quyền: SUPER_ADMIN / CENTER_MANAGER (leads:import + students:create + enrollments:create).
- Mỗi dòng = 1 học viên: chọn **lớp** (lọc sẵn đúng khoá + đúng cơ sở; có nút
  "Gán lớp nhanh" cho cả loạt), tick **đồng ý ảnh** nếu PH đã ký consent.
- Ô **"Đã đóng (đ) · ngày"** per lead:
  - Nhập số tiền + ngày đóng thật (lùi ngày được) → hệ thống tạo Đơn hàng +
    khoản thu RECORDED gắn vào ghi danh → **công nợ phản ánh đúng phần còn thiếu**
    (kế toán xác nhận sau ở /payments như khoản thường).
  - Bỏ trống nếu chưa tra được tiền → vẫn chốt được (audit lý do BACKFILL_IMPORT),
    bổ sung khoản thu sau ở màn đơn hàng.
- Bấm **Chốt N lead** → chạy theo lô 20, có tiến độ + kết quả từng dòng. Dòng lỗi
  sửa xong bấm chốt lại (idempotent — không sợ tạo trùng).
- Mỗi lead chốt xong: Học viên (mã HV mới) + Ghi danh vào lớp + **TK phụ huynh
  khoá SĐT, trạng thái CHỜ KÍCH HOẠT**. Lead → "Đã chốt".

### Bước 3 — Phụ huynh kích hoạt tài khoản
- PH vào `hocvien.satarobo.vn/kich-hoat` → nhập **SĐT** → nhận mã OTP qua Zalo
  (mẫu 616128 — ĐÃ live) → đặt mật khẩu → đăng nhập portal.
- **Không cần chờ mẫu ZNS 616899**: OTP kích hoạt đi mẫu Xác thực đã duyệt. Mẫu
  616899 chỉ là tin *chủ động báo* "đã cấp TK".

### Bước 4 — Theo dõi & đốc thúc: `/admin/students/tai-khoan` (MỚI)
- Danh sách TK chờ kích hoạt (lọc theo cơ sở với QLCS) + trạng thái gửi ZNS.
- Khi mẫu **616899 chưa duyệt**: bấm **Xuất CSV** → gọi điện / nhắn Zalo OA tay
  hướng dẫn PH vào /kich-hoat. Nút "Gửi lại OTP" dùng khi PH đang thao tác.
- Khi mẫu **616899 đã duyệt**: đối chiếu bảng tham số trên ZBS (đúng 2 tham số
  `name` + `login_id`) → đặt env `ZALO_ZNS_TEMPLATE_ACCOUNT="616899"` + redeploy
  → quay lại màn này bấm **"Gửi ZNS tất cả chưa nhận"** (tự bỏ qua số đã nhận,
  100 tin/lượt). Badge "Mô phỏng" = ZALO_LIVE chưa bật, tin CHƯA thực sự đi.
- PH không nhận được ZNS (chưa có Zalo / chặn tin OA): dùng **"Cấp mã tại quầy"**
  ở trang học viên (bắt buộc nhập lý do, có audit).

## Bẫy cần nhớ
- SĐT lead là **số bàn** → không chốt được (TK đăng nhập = SĐT di động, ZNS không
  gửi số bàn). Sửa SĐT lead trước rồi chốt lại.
- Lead **chưa gắn cơ sở** (cột Cơ sở trống trong Excel) → không chốt được — gán
  cơ sở ở trang lead trước.
- Lớp phải **cùng cơ sở** với lead — hệ thống chặn ghi danh chéo cơ sở.
- ĐỪNG đặt env `ZALO_ZNS_TEMPLATE_ATTENDANCE` / `_DEBT` khi chưa đăng ký mẫu và
  đối chiếu tham số — 2 call-site đó chưa có hợp đồng tham số (`lib/zalo/templates.ts`),
  đặt bừa là lặp lại bug -1122 (tin fail im lặng). Theo dõi tổng thể ở
  `/admin/tich-hop` (log ZNS, có badge mô phỏng).

## Ảnh lớp học (kho ảnh — MỚI)
- GV vào site giáo viên → **Ảnh lớp**: upload nhiều ảnh cùng lúc vào **kho của
  buổi học** (ảnh nằm kho, PH CHƯA thấy).
- Sau buổi học, GV mở kho → chọn ảnh → tick học viên có mặt trong ảnh (HV chưa
  có consent ảnh sẽ bị khoá) hoặc "Ảnh chung cả lớp" → **Gửi cho phụ huynh**.
- GV gửi → ảnh vào hàng **chờ duyệt**; Quản lý cơ sở duyệt ở `/admin/media` →
  PH thấy trên portal (mục Hình ảnh / Nhận xét buổi học). QLCS tự gửi thì hiển
  thị ngay không cần duyệt.
- Nguyên tắc riêng tư giữ nguyên: ảnh không tag ai + không đánh dấu "cả lớp" =
  không PH nào thấy; thu hồi consent = ảnh có tag con đó ẩn ngay.
