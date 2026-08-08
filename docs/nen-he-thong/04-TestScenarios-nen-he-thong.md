# Test Scenarios — Nền Hệ thống satarobo

> Skill: pm-execution:test-scenarios · Bám 18 user story · Nhãn: **AUTO-CI** (chạy tự động, chặn merge) / **TAY** (người kiểm)
> Fixture chuẩn dùng chung (từ US-04): cây `HO → {Vùng-A, Đà Nẵng} → {CS-F (FRANCHISEE, Vùng-A), CS1 (OWNED), CS-L (AFFILIATE)}`, hợp đồng FC-1 ACTIVE cho CS-F, chương trình CUR-1 (LOCKED) do HO sở hữu, giáo viên GV-HO biên chế HO, quản lý QL-CS1, admin ADMIN-HO, phụ huynh PH-1 có con HS-1 tại CS1.

---

## TS-01 · Registry chặn key trùng — AUTO-CI (US-01)
**Mục tiêu:** hai module không thể khai cùng một permission key.
**Điều kiện đầu:** registry đã nạp `class.session.update` từ module CLASS.
**Bước & kỳ vọng:** nạp file khai báo module khác chứa cùng key → quá trình seed/deploy fail, thông báo nêu rõ key và 2 module xung đột; registry giữ nguyên trạng thái trước đó.

## TS-02 · DENY thắng ALLOW qua nhóm — AUTO-CI (US-02, US-03)
**Mục tiêu:** thứ tự DENY > ALLOW đúng khi grant đến từ 2 nguồn.
**Điều kiện đầu:** QL-CS1 có Role cấp ALLOW `student.view` scope UNIT_ONLY; QL-CS1 nằm trong UserGroup có DENY `student.view` fieldMask `[phone]`.
**Bước & kỳ vọng:** gọi API xem học viên CS1 → được danh sách nhưng trường phone bị che; gỡ QL-CS1 khỏi nhóm → request kế tiếp thấy phone (cache theo request, không dính phiên).

## TS-03 · Lint chặn kiểm quyền ngoài can() — AUTO-CI (US-02)
**Mục tiêu:** KR3 = 0 được thực thi bằng máy, không bằng kỷ luật.
**Bước & kỳ vọng:** thêm một Server Action ghi dữ liệu không gọi `can()` vào nhánh test → CI fail, chỉ đúng file/dòng vi phạm.

## TS-04 · Ma trận 4 scope × 3 relationship — AUTO-CI (US-04)
**Mục tiêu:** hành vi resolver đóng băng bằng bảng chân trị.
**Bước & kỳ vọng:** với mỗi tổ hợp (ALL / UNIT_AND_BELOW / UNIT_ONLY / OWN) × (OWNED / FRANCHISEE / AFFILIATE) × (ALLOW/DENY), fixture có sẵn actor + target kỳ vọng; toàn bộ 24 case pass; sửa resolver làm lệch 1 case → CI đỏ.

## TS-05 · Path cập nhật khi dời node — AUTO-CI (US-05)
**Mục tiêu:** dời một cơ sở sang vùng khác không làm hỏng phạm vi.
**Điều kiện đầu:** CS-F thuộc Vùng-A, path `/ho/vung-a/cs-f`.
**Bước & kỳ vọng:** dời CS-F về Đà Nẵng → path CS-F và toàn bộ con cháu đổi trong 1 transaction; query UNIT_AND_BELOW của Vùng-A không còn thấy dữ liệu CS-F, của Đà Nẵng thấy; tạo quan hệ vòng (gán Vùng-A làm con của CS-F) → bị chặn.

## TS-06 · Pháp nhân không xoá được khi còn đơn vị — AUTO-CI (US-06)
**Bước & kỳ vọng:** xoá LegalEntity đang gắn CS1 ACTIVE → từ chối kèm danh sách đơn vị chặn; đóng CS1 (CLOSED) rồi xoá → được.

## TS-07 · Đối soát backfill 2 chiều — AUTO-CI + TAY (US-07)
**Mục tiêu:** T2 pre-mortem — không có bản ghi mồ côi.
**Bước & kỳ vọng:** (AUTO) chạy script đối soát trên fixture có chủ đích 1 bản ghi lệch → alert nêu đúng bảng + số lượng; chạy backfill lần 2 → số bản ghi không đổi (idempotent). (TAY) trên PROD: đọc báo cáo đêm 7 ngày liên tục trước cổng P4, Dev ký xác nhận.

## TS-08 · Quyền theo Position, không theo người — AUTO-CI (US-08)
**Bước & kỳ vọng:** user U1 nhận Assignment vào Position "QL CS1" → có quyền QL; gỡ Assignment → request kế tiếp 403; user U2 nhận cùng Position → có đúng bộ quyền đó mà không cấu hình thêm.

## TS-09 · Chống vòng lặp cây báo cáo — AUTO-CI (US-08)
**Bước & kỳ vọng:** đặt `reportsToPositionId` của Position A trỏ về B khi B đã báo cáo về A (trực tiếp hoặc qua chuỗi) → bị chặn ở tầng ghi với thông báo nêu chuỗi vòng.

## TS-10 · Assignment hết hạn tự tắt quyền — AUTO-CI (US-09)
**Bước & kỳ vọng:** Assignment CONCURRENT có `effectiveTo` = hôm qua → `can()` không tính grant từ nó, không cần job dọn; lịch sử vẫn đọc được.

## TS-11 · WorkScope mở/đóng truy cập cơ sở — AUTO-CI (US-10)
**Mục tiêu:** B2 (giáo viên HO tác nghiệp cơ sở) chạy đúng hai chiều.
**Bước & kỳ vọng:** GV-HO chưa có WorkScope CS1 → xem lớp CS1: 403; thêm WorkScope CS1 reason TEACHING → thấy đúng lớp mình được phân công tại CS1, KHÔNG thấy lớp khác của CS1; WorkScope hết hạn → 403 trở lại, quyền HO của GV-HO không đổi.

## TS-12 · Dry-run backfill nhân sự — TAY (US-11)
**Bước & kỳ vọng:** chạy dry-run trên bản sao dữ liệu nhân sự → file đối chiếu liệt kê từng người → Position/Assignment sẽ sinh + danh sách người thiếu dữ liệu; Dev duyệt tay từng dòng rồi mới chạy thật; người thiếu dữ liệu KHÔNG bị đoán đơn vị.

## TS-13 · Shadow không chặn, chỉ ghi — AUTO-CI (US-12)
**Bước & kỳ vọng:** trong pha shadow, request mà resolver mới trả DENY nhưng logic cũ ALLOW → request vẫn thành công, log ghi đủ (actor, permission, target, kết quả 2 bên); dashboard đếm đúng số lệch theo ngày.

## TS-14 · Rollback cutover 1 thao tác — TAY (US-13)
**Bước & kỳ vọng:** trên staging, bật flag resolver chặn thật → tắt flag → hệ về hành vi cũ ngay, không deploy; đo thời gian rollback < 1 phút; ghi lại quy trình vào runbook.

## TS-15 · OWN của phụ huynh qua Guardian–Student — AUTO-CI (US-13)
**Bước & kỳ vọng:** PH-1 xem tiến độ HS-1 → được; PH-1 đổi ID sang học viên khác cùng lớp → 403 (IDOR); gỡ liên kết Guardian–Student → 403.

## TS-16 · Cắt hợp đồng một thao tác — AUTO-CI (US-14)
**Mục tiêu:** KR2 — hành vi giá trị nhất của toàn nền.
**Điều kiện đầu:** FC-1 ACTIVE; giáo viên tại CS-F đang xem được CUR-1 (đủ 4 điều kiện).
**Bước & kỳ vọng:** ADMIN-HO chuyển FC-1 → TERMINATED (một thao tác) → request kế tiếp của giáo viên CS-F vào nội dung CUR-1: 403; CS-F vẫn ĐỌC được hồ sơ học viên của chính họ (GRACE); chuyển trạng thái không hợp lệ (DRAFT → CLOSED) → bị chặn; audit log có đủ dòng chuyển trạng thái.

## TS-17 · Chính sách ghi đè 3 loại — AUTO-CI (US-15)
**Bước & kỳ vọng:** CS-F sửa nội dung CUR-1 (LOCKED) → từ chối; CS-F đặt giá lệch +20% trên bảng giá BOUNDED biên độ ±15% → từ chối nêu biên độ, −10% → được và giữ `parentItemId`; HO publish version mới của bảng giá → bản kế thừa nhận version mới, bản ghi đè giữ nguyên kèm cờ "gốc đã đổi".

## TS-18 · Chuỗi 4 điều kiện — 4 case DENY — AUTO-CI (US-16)
**Mục tiêu:** R3 — hạng mục IDOR rủi ro cao nhất.
**Bước & kỳ vọng:** lần lượt bỏ đúng MỘT điều kiện (role sai / không phân công lớp / lớp không liên kết CUR-1 / buổi ngoài cửa sổ mở) → cả 4 case đều 403; đủ 4 → 200; QL-CS1 gọi cùng endpoint → chỉ nhận danh sách tên chương trình; giáo viên CS-F (tỉnh khác, FC ACTIVE, đủ 4 điều kiện) → 200.

## TS-19 · Wizard mở đơn vị nguyên tử — AUTO-CI + TAY (US-17)
**Bước & kỳ vọng:** (AUTO) ép lỗi giữa transaction wizard → không còn bản ghi rác nào (OrgUnit/Position/Role/Grant đều rollback); khuôn FRANCHISEE không có FC DRAFT → không cho ACTIVE. (TAY) KR1: một admin chưa từng dùng wizard dựng CS mới từ khuôn, bấm giờ ≤ 30 phút.

## TS-20 · Audit log bất biến + log việc xem log — AUTO-CI (US-18)
**Bước & kỳ vọng:** đổi một grant → sinh dòng log đủ trước/sau; gọi API sửa/xoá dòng log → không tồn tại endpoint (404) hoặc 403; mở màn log → sinh thêm một dòng log truy cập.

---

**Tổng:** 20 kịch bản · 17 AUTO-CI · 3 có phần TAY (TS-07, TS-12, TS-14, TS-19). Toàn bộ AUTO-CI là điều kiện chặn merge vào `main`.
