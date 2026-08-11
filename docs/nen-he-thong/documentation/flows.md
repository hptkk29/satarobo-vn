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

## AS-BUILT — P1 · US-07: ghi kép `centerId` → `orgUnitId` (11/08/2026)

**Vì sao là một cơ chế chứ không phải 60 lần sửa tay.** PR-A (15/06) thêm `orgUnitId` cho 28 bảng rồi backfill MỘT LẦN, và để việc ghi kép cho từng call-site tự nhớ. Đo lại hôm nay: >60 call-site production vẫn chỉ ghi `centerId`. Bằng chứng đanh nhất là migration `20260624010000` backfill `Enrollment.centerId` hồi 24/06, vậy mà 05/08 vẫn phải viết `scripts/backfill-enrollment-center.ts` vá tay — vì đường ghi mới tiếp tục đẻ dòng thiếu. Nợ không đứng yên.

⇒ Ghi kép làm ở **tầng client** (`lib/org/dual-write.ts`), cắm vào `lib/db.ts` ngay sau extension soft-delete nên `scopedDb` cũng thừa hưởng.

**Luật của cơ chế — cố ý hẹp:**

| Tình huống | Hành vi | Vì sao |
|---|---|---|
| có `centerId`, thiếu `orgUnitId` | điền | đúng việc của AC2 |
| người gọi tự set `orgUnitId` | **không đè** | 50 call-site đang gọi `orgUnitIdForCenter()` tay vẫn đúng; không đẻ nguồn ghi thứ hai |
| `centerId: null` tường minh | **không đoán** | ở nhiều bảng null nghĩa là "toàn hệ thống" / "chưa đối khớp" |
| không ánh xạ được | để null, **không ném lỗi** | ném ở tầng này là biến một cột phụ thành thứ chặn cả nghiệp vụ |
| `updateMany` | **không hook** | một khối `data` áp cho nhiều dòng nhiều cơ sở; suy một giá trị chung là gán sai hàng loạt |
| SQL thô / migration / script | **không đi qua** | đây chính là lý do phải có đối soát đêm — ghim ở `[US-07-IT-10]` |

**Cầu ánh xạ hai nhánh.** `OrgUnit.centerId = Center.id`, HOẶC `OrgUnit.code = Center.code`. Nhánh hai là cầu cho **Center mồ côi**: `Center("hoi-so")` (code "HO") không được OrgUnit nào trỏ tới vì luật V7 cấm đơn vị HO mang `centerId`. US-05 đã thử nới luật đó và phải **gỡ** — nới ra là màn nhân sự neo vai người Hội sở tại HO ⇒ `isHoLevel` ⇒ thấy mọi cơ sở. Cầu theo `code` giải đúng bài toán ánh xạ mà không nạp thêm nghĩa cho cột `centerId`, và **không đường quyền nào đọc nó**.

**Cache.** Chỉ cache kết quả CÓ; tra hụt luôn hỏi lại DB. Khác biệt cố ý với lần cache cây OrgUnit đã phải gỡ (REQ-02): lần đó cache cả kết quả rỗng nên actor thấy cây cũ và phạm vi về rỗng. Ở đây sai lầm tệ nhất là một dòng thiếu `orgUnitId` — đối soát đêm nhặt được, và không ai mất quyền vì nó.

**Ba nhóm, không phải hai** (`lib/org/center-bridge.ts` — nguồn sự thật dùng chung cho migration, ghi kép và đối soát):

- `BAT_BUOC` (16 bảng) — `centerId` luôn phải có; thiếu `orgUnitId` là lỗi thật.
- `NULL_TOAN_HE_THONG` (6) — Affiliate, EvaluationRound, RevenueTarget, SataCoinRule, WorkShiftConfig, FacebookPageMapping. Điền vào là khoá dữ liệu dùng chung về một cơ sở.
- `NULL_CHUA_KHOP` (2) — BankTransaction (tiền về chưa đối khớp), WorkRequest. Điền vào là giấu mất việc đang tồn đọng.
- `CHUA_RA_SOAT` (28 bảng PR-A) — chưa ai rà nghĩa của NULL. Đếm và hiện, **không** báo động; chỉ "sai ánh xạ" mới báo. Rà xong thì chuyển nhóm kèm bằng chứng.

⚠️ **Đừng dùng `NULL_IS_GLOBAL_MODELS` của `lib/db-scope.ts` làm định nghĩa nhóm.** Tập đó gộp `BankTransaction` chung rổ với `Survey` dù ngữ nghĩa hoàn toàn khác.

**Đối soát đêm** (`/api/cron/orgunit-drift`, 03:00 VN) — chỉ đọc, ghi `OrgUnitDriftRun` + `OrgUnitDriftItem`, tự dọn log quá 30 ngày. Có bản ghi *run* riêng để "đêm sạch" không trông giống "job không chạy". **Không tự sửa dữ liệu**: sửa mù trên 52 bảng lúc 3h sáng là cách nhanh nhất biến lỗi nhỏ thành sự cố lớn.

Luật cứng #8 ("không cron nào GHI thay đổi quyền") không bị chạm: job không đụng `UserOrgRole`/`PermissionGrant`/`RoleDef`, và tới hết P4 phạm vi quyền vẫn resolve theo `centerId`.

Cách chạy trên DB thật: `docs/nen-he-thong/RUNBOOK-P1.md`.
