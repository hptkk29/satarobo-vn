# User Stories — Nền Hệ thống satarobo

> Skill: pm-execution:user-stories · 18 story / 6 epic, bám 6 pha của PRD
> Quy ước: mỗi phiên Claude Code làm đúng MỘT story. Design: chưa có Figma — UI admin dùng pattern bảng + form sẵn có của satarobo; story nào cần UI mới sẽ ghi chú.

---

## Epic 1 — Registry quyền & `can()` (P0)

### US-01 · Registry quyền tập trung
**Là** dev module nghiệp vụ, **tôi muốn** khai báo quyền của module vào một registry duy nhất, **để** không module nào tự chế cơ chế quyền riêng.
**AC:**
1. Bảng `PermissionDescriptor` (key, module, action, scopable, sensitiveFields) tồn tại; seed nạp từ file khai báo mỗi module lúc deploy.
2. Key trùng → deploy fail với thông báo rõ ràng.
3. Có lệnh liệt kê toàn bộ quyền theo module.
4. Quyền của module chat hiện tại được khai báo lại vào registry mà không đổi hành vi.

### US-02 · Hàm `can()` hợp nhất
**Là** dev, **tôi muốn** một hàm `can(actor, permissionKey, target)` duy nhất, **để** mọi Server Action kiểm quyền cùng một chỗ.
**AC:**
1. Trả về ALLOW/DENY theo công thức BA §2.5: DENY > ALLOW tường minh > kế thừa.
2. Hợp nhất grant từ cả Role và UserGroup (Q1) trong cùng một lần resolve.
3. Chưa có dữ liệu OrgUnit (trước P1) thì fallback về logic centerId hiện hành — đúng hợp đồng adapter của đợt chat.
4. Có cache theo request; một request gọi `can()` 20 lần chỉ query grant 1 lần.
5. Lint rule/CI check: mọi Server Action ghi dữ liệu phải gọi `can()`; vi phạm → build fail.

### US-03 · Nhóm người dùng (Q1 — làm ngay)
**Là** admin HO, **tôi muốn** tạo nhóm người dùng và gán quyền cho nhóm, **để** cấp quyền ad-hoc cho ít người mà không phải sửa vai trò chuẩn.
**AC:**
1. CRUD `UserGroup`, thêm/gỡ thành viên; một người thuộc nhiều nhóm.
2. `PermissionGrant.subjectType = ROLE | GROUP` hoạt động; DENY của nhóm cũng thắng ALLOW của vai trò.
3. Gỡ khỏi nhóm → quyền mất ngay ở request kế tiếp (cache theo request, không cache phiên).
4. UI admin: màn danh sách nhóm + màn chi tiết (pattern bảng sẵn có).

### US-04 · Khung test ma trận quyền
**Là** dev, **tôi muốn** bộ test tự động sinh theo ma trận dataScope × relationshipType × ALLOW/DENY, **để** mọi thay đổi resolver bị chặn nếu phá hành vi.
**AC:**
1. Fixture dựng cây mẫu: HO → 2 vùng → 3 cơ sở (1 OWNED, 1 FRANCHISEE, 1 AFFILIATE).
2. Ma trận 4 scope × 3 relationship × 2 effect chạy CI, fail là chặn merge.
3. Case chuỗi 4 điều kiện chương trình dạy có test riêng, gồm cả 4 case DENY (thiếu từng điều kiện một).
4. Test viết TRƯỚC khi resolver thật tồn tại (chạy đỏ với fallback là chấp nhận được, đánh dấu expected-fail).

## Epic 2 — Cây tổ chức & pháp nhân (P1)

### US-05 · Bảng OrgUnit + materialized path
**Là** admin HO, **tôi muốn** cây đơn vị 3 tầng với loại đơn vị và loại quan hệ, **để** biểu diễn được khối vùng và đơn vị nhượng quyền.
**AC:**
1. Schema đúng BA §2.2 (path, depth, unitType, relationshipType, legalEntityId, templateId, status, effective range).
2. Tạo/sửa node tự cập nhật `path` và `depth` của toàn bộ cây con trong một transaction.
3. Không cho tạo vòng lặp cha–con; không cho CENTER làm cha của REGION.
4. UI cây (expand/collapse) chỉ đọc + form tạo/sửa node.

### US-06 · LegalEntity tách khỏi đơn vị
**Là** kế toán HO, **tôi muốn** pháp nhân là thực thể riêng gắn vào đơn vị, **để** doanh thu ghi nhận đúng pháp nhân sở hữu.
**AC:**
1. CRUD `LegalEntity`; một pháp nhân gắn nhiều OrgUnit, một OrgUnit đúng một pháp nhân.
2. Pháp nhân gốc `isPrimary` duy nhất; CS1/CS2 seed về pháp nhân gốc.
3. Không xoá được pháp nhân còn đơn vị ACTIVE trỏ vào.

### US-07 · Backfill centerId → orgUnitId chạy song song
**Là** dev, **tôi muốn** mọi bảng có `centerId` được backfill `orgUnitId` và ghi kép cả hai cột, **để** cutover sau này không mất dữ liệu.
**AC:**
1. Script backfill idempotent, chạy lại không nhân đôi.
2. Mọi đường ghi mới ghi cả hai cột (trigger hoặc tầng Prisma middleware).
3. Script đối soát đêm: đếm theo `centerId` vs `orgUnitId` từng bảng, lệch → alert; log giữ 30 ngày.
4. KHÔNG đụng dữ liệu còn nằm sheet của Sale (ngoài phạm vi — E5 pre-mortem).

## Epic 3 — Vị trí, phân công, nơi tác nghiệp (P2)

### US-08 · Position gắn cây + vai trò gắn Position
**Là** admin HO, **tôi muốn** vị trí công việc thuộc đơn vị và mang bộ vai trò, **để** người đổi chỗ thì quyền tự đổi theo vị trí.
**AC:**
1. Schema Position đúng BA §2.4, gồm `reportsToPositionId` (Q2).
2. Gán Role cho Position; người nhận Assignment vào Position là hưởng đủ quyền của nó.
3. Gỡ Assignment → mất quyền ngay; Position giữ nguyên bộ quyền cho người kế nhiệm.
4. Ràng buộc chống vòng lặp trên `reportsToPositionId` (DB constraint hoặc check ở tầng ghi, kèm test).

### US-09 · Assignment PRIMARY / CONCURRENT / DELEGATED
**Là** admin HO, **tôi muốn** một người giữ nhiều phân công có thời hạn, **để** mô hình hoá kiêm nhiệm và uỷ quyền.
**AC:**
1. Một user đúng một PRIMARY còn hiệu lực; CONCURRENT/DELEGATED không giới hạn.
2. Hết `effectiveTo` → quyền từ assignment đó tắt tự động, không cần cron gỡ tay.
3. Lịch sử assignment không xoá — chỉ đóng hiệu lực.

### US-10 · WorkScope — nơi tác nghiệp
**Là** giáo viên biên chế HO, **tôi muốn** được điều đến cơ sở dạy mà không đổi biên chế, **để** vào được dữ liệu lớp ở cơ sở đó.
**AC:**
1. Thêm WorkScope (orgUnitId, reason, effective range) cho một assignment.
2. `can()` tính phạm vi = đơn vị trực thuộc ∪ các WorkScope còn hiệu lực.
3. Hết hiệu lực WorkScope → mất truy cập dữ liệu cơ sở đó ngay, quyền HO không đổi.
4. UI admin: màn điều động (chọn giáo viên → thêm cơ sở + lý do + thời hạn).

### US-11 · Backfill nhân sự → Position/Assignment
**Là** admin HO, **tôi muốn** 26 hồ sơ nhân sự hiện tại được chuyển thành Position + Assignment, **để** P2 xong là hệ chạy trên mô hình mới với người thật.
**AC:**
1. Script đọc bảng nhân sự hiện có, sinh Position theo đơn vị + chức danh, Assignment PRIMARY cho từng người.
2. Bản đối chiếu xuất ra cho Dev duyệt tay TRƯỚC khi ghi (dry-run bắt buộc).
3. Người thiếu dữ liệu (thiếu đơn vị/chức danh) → vào danh sách chờ xử lý tay, không đoán.

## Epic 4 — Resolver dataScope & cutover (P3–P4)

### US-12 · Resolver 4 mức chạy shadow
**Là** dev, **tôi muốn** resolver dataScope chạy song song logic cũ và ghi log khác biệt, **để** cutover không có bất ngờ.
**AC:**
1. 4 mức đúng BA §2.5, `UNIT_AND_BELOW` dùng `path LIKE prefix`.
2. Mọi request: chạy cả logic cũ (centerId) lẫn mới (resolver), so kết quả, lệch → ghi log có đủ ngữ cảnh tái hiện.
3. Không request nào bị chặn bởi resolver mới trong pha shadow.
4. Dashboard/lệnh xem tổng khác biệt theo ngày.

### US-13 · Cutover P4
**Là** dev, **tôi muốn** bật resolver chặn thật và gỡ đường cũ, **để** hệ chạy hẳn trên nền mới.
**AC:**
1. Cổng: log shadow 0 khác biệt chưa giải thích ≥ 7 ngày liên tục (KR5).
2. Feature flag bật/tắt resolver — rollback trong 1 thao tác, không cần deploy.
3. Sau 7 ngày ổn định: gỡ ghi kép `centerId`, cột cũ đánh dấu deprecated (chưa drop).
4. `OWN` cho phụ huynh resolve qua bảng liên kết Guardian–Student (E3 pre-mortem).

## Epic 5 — Nhượng quyền & danh mục (P5)

### US-14 · FranchiseContract vòng đời đầy đủ
**Là** admin HO, **tôi muốn** hợp đồng nhượng quyền là thực thể có trạng thái, **để** cắt quyền bên nhận trong một thao tác.
**AC:**
1. Schema + máy trạng thái đúng BA §2.6; chuyển trạng thái không hợp lệ bị chặn.
2. Grant của bên nhận đều mang `derivedFrom = contractId`; resolver kiểm trạng thái hợp đồng lúc chạy.
3. ACTIVE → TERMINATED: quyền chương trình cắt ngay ở request kế tiếp; GRACE giữ quyền đọc học viên của chính họ.
4. Mọi lần đổi trạng thái ghi audit log (ai, lúc nào, từ→đến).

### US-15 · CatalogItem + 4 chính sách ghi đè
**Là** đội Đào tạo HO, **tôi muốn** xuất bản danh mục với chính sách ghi đè theo loại, **để** franchise dùng được nhưng không sửa được tài sản thương hiệu.
**AC:**
1. Schema đúng BA §3.1; CURRICULUM mặc định LOCKED, bảng giá BOUNDED có `overrideBounds`.
2. Đơn vị con tạo bản ghi đè: LOCKED → từ chối; BOUNDED → kiểm biên độ; OVERRIDABLE → cho, giữ `parentItemId`.
3. HO xuất bản version mới → đơn vị dùng bản kế thừa nhận version mới, bản ghi đè giữ nguyên và được đánh dấu "gốc đã đổi".

### US-16 · Chuỗi 4 điều kiện xem nội dung buổi học
**Là** giáo viên, **tôi muốn** chỉ xem được nội dung buổi của lớp mình khi buổi đã mở, **để** tài liệu không bị tuồn ra ngoài.
**AC:**
1. Server kiểm đủ 4 điều kiện (role ∧ phân công lớp ∧ lớp liên kết chương trình ∧ buổi trong cửa sổ mở) — thiếu một là 403.
2. Quản lý gọi cùng endpoint chỉ nhận danh sách tên chương trình, không nhận nội dung.
3. Giáo viên cơ sở nhượng quyền tỉnh khác đủ 4 điều kiện thì XEM ĐƯỢC (chốt 27/07).
4. Không truy cập được bằng ID đoán (test IDOR: đổi sessionId sang lớp khác → 403).

### US-17 · UnitTemplate + wizard mở đơn vị
**Là** admin HO, **tôi muốn** mở cơ sở mới từ khuôn mẫu bằng wizard, **để** dựng franchise trong 30 phút thay vì một tuần.
**AC:**
1. Schema UnitTemplate đúng BA §3.3; seed 2 khuôn: CENTER-OWNED và CENTER-FRANCHISEE.
2. Wizard: chọn khuôn → nhập pháp nhân + thông tin đơn vị → preview những gì sẽ sinh → xác nhận → sinh trong một transaction.
3. Khuôn FRANCHISEE bắt buộc gắn FranchiseContract DRAFT trước khi đơn vị ACTIVE.
4. Chạy lại wizard fail giữa chừng không để rác (transaction toàn phần).

## Epic 6 — Vận hành nền

### US-18 · Audit log thao tác hệ thống
**Là** ban giám đốc, **tôi muốn** mọi thao tác trên lõi (đổi cây, đổi quyền, đổi hợp đồng) được ghi vết, **để** truy được ai đổi gì khi có sự cố — và việc xem log cũng bị ghi vết.
**AC:**
1. Ghi: actor, hành động, đối tượng, trước/sau, thời điểm — cho OrgUnit, Role, Grant, Assignment, Contract, CatalogItem.
2. Log chỉ ghi thêm, không sửa/xoá qua ứng dụng.
3. Truy cập màn log cũng sinh một dòng log.
4. Lọc theo đơn vị, người, khoảng thời gian.
