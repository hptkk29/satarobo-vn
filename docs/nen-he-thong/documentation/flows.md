# flows.md — Các luồng chịu lực (INTENDED STATE)

> Chỉ gồm luồng chạm quyền / toàn vẹn dữ liệu / tác dụng phụ. Không phải spec tính năng.
> Mẫu ghi: Actor · Tiền đề · Kết quả · Các bước (kiểm quyền + DENY kỳ vọng ở từng bước) · Tác dụng phụ.

## F1 — Wizard mở đơn vị nhượng quyền

Actor: ADMIN-HO · Tiền đề: UnitTemplate FRANCHISEE tồn tại · Kết quả: OrgUnit ACTIVE + bộ máy sinh đủ.
1. Mở wizard → `can(admin, "org.unit.create", HO)` — DENY: quản lý cơ sở gọi → 403.
2. Nhập LegalEntity + thông tin đơn vị → validate zod, taxCode duy nhất.
3. Preview (chưa ghi) → liệt kê phòng ban/vị trí/vai trò/danh mục sẽ sinh.
4. Xác nhận → **một transaction**: OrgUnit (relationshipType=FRANCHISEE, cập nhật path) + Position + Role + Grant (tất cả `derivedFrom` = FC DRAFT vừa tạo) + tham chiếu CatalogItem. Lỗi giữa chừng → rollback toàn phần, không rác.
5. Đơn vị chỉ chuyển ACTIVE khi FC chuyển ACTIVE.
Tác dụng phụ: audit log từng thực thể sinh ra.

## F2 — Điều giáo viên HO sang cơ sở (WorkScope)

Actor: ADMIN-HO · Tiền đề: GV có Assignment PRIMARY tại HO/Đào tạo · Kết quả: GV vào được dữ liệu lớp tại cơ sở đích.
1. Màn điều động → `can(admin, "hr.workscope.create", targetUnit)` — DENY: admin vùng A điều người sang vùng B ngoài phạm vi → 403.
2. Ghi WorkScope (reason, effective range) → audit log.
3. Request kế tiếp của GV: resolver tính scope = HO ∪ WorkScope → thấy đúng lớp được phân công tại cơ sở, KHÔNG thấy lớp khác (giao với phân công lớp).
4. Hết `effectiveTo` → tự mất truy cập, không job dọn.
Ranh giới tin cậy: không có — nội bộ server.

## F3 — Cắt hợp đồng nhượng quyền (luồng giá trị nhất)

Actor: ADMIN-HO · Tiền đề: FC ACTIVE · Kết quả: quyền dẫn xuất tắt trong một thao tác.
1. `can(admin, "franchise.contract.transition", FC)` — DENY: admin của chính bên nhận tự chuyển trạng thái → 403.
2. Máy trạng thái kiểm chuyển hợp lệ (ACTIVE→TERMINATED ok; DRAFT→CLOSED chặn).
3. Ghi trạng thái + audit log. KHÔNG quét sửa từng grant — resolver kiểm `derivedFrom` lúc chạy nên hiệu lực tức thì ở request kế tiếp.
4. GRACE: grant đọc hồ sơ học viên của chính bên nhận vẫn ALLOW; grant chương trình dạy DENY.
Tác dụng phụ: chỉ 1 bản ghi trạng thái + log — đây là điểm thiết kế cố ý.

## F4 — Giáo viên mở nội dung buổi học (chuỗi 4 điều kiện)

Actor: Giáo viên · Kết quả: nội dung buổi hoặc 403.
1. `can(gv, "curriculum.session.view", session)` mở rộng thành 4 kiểm tra server: role ∧ phân công lớp ∧ lớp↔chương trình ∧ buổi trong cửa sổ mở.
2. DENY kỳ vọng: thiếu bất kỳ điều kiện nào → 403 (TS-18 có đủ 4 case); đổi sessionId lớp khác → 403 (IDOR).
3. Quản lý gọi cùng endpoint → nhánh trả DANH SÁCH tên chương trình, không bao giờ trả nội dung.
Ranh giới: browser→server; response nội dung không cache CDN.

## F5 — Backfill centerId→orgUnitId (P1, ghi kép)

Actor: hệ thống (script + middleware) · Kết quả: hai cột đồng bộ cho tới cutover.
1. Script backfill idempotent chạy tay có dry-run.
2. Prisma middleware: mọi write có `centerId` → tự ghi `orgUnitId` tương ứng (và ngược lại).
3. Job đối soát đêm (cron.md J1) đếm 2 chiều từng bảng → lệch → alert.
DENY/ngoại lệ: bản ghi không map được → bảng chờ xử lý tay, KHÔNG đoán.

## F6 — Shadow → Cutover resolver (P3→P4)

Actor: hệ thống + Dev · Kết quả: đường quyền cũ gỡ an toàn.
1. P3: mỗi request chạy cả 2 đường, so kết quả, lệch → log (không chặn).
2. Cổng P4: 0 lệch chưa giải thích ≥ 7 ngày (Dev ký, TS-07 TAY).
3. Bật feature flag chặn thật; rollback = tắt flag, < 1 phút, không deploy.
4. +7 ngày ổn định → gỡ ghi kép, `centerId` deprecated.
Đây là luồng duy nhất có "công tắc" đổi hành vi quyền toàn hệ — flag chỉ ADMIN-HO + Dev thao tác, có audit log.

## F7 — Seam kế toán sang MISA

Actor: Kế toán HO · Kết quả: file bảng công + doanh thu tháng đẩy sang MISA.
1. `can(kt, "report.payroll-export.create", HO)` — DENY: quản lý cơ sở → 403.
2. Xuất file theo kỳ; số liệu franchise chỉ gồm khoản HO được thấy (tổng hợp + căn cứ phí).
3. Một chiều: satarobo → người → MISA import. MISA không có credential gọi vào satarobo.
Định dạng file: CHƯA CHỐT (E1 pre-mortem) — chặn P5, không chặn P0–P4.
