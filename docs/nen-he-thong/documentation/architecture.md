# architecture.md — Nền Hệ thống satarobo (INTENDED STATE)

> Tài liệu tả trạng thái ĐÍCH sau P5, không phải hiện trạng. Dùng làm chuẩn so sánh cho audit "documented == implemented".

## AS-BUILT — P1 · US-05 (OrgUnit path) + US-06 (LegalEntity), 11/08/2026

**Hình cây ĐÃ CHỐT — và vì sao phải chốt bằng người.** Ba tài liệu đã ký mâu thuẫn nhau:

| Nguồn | Hình cây | Hệ quả |
|---|---|---|
| Doc 15 OI-1 + CLAUDE.md + seed + 3 test đang ghim | `ROOT → HO, CS1, CS2` ngang hàng | `getSubtreeCenterIds(HO) = []` là hành vi CỐ Ý |
| QĐ-A ký 28/07 (`docs/taicautruc/QUYET-DINH.md:10`) | `ROOT → {HO, Vùng}` | HO **không** phải tổ tiên của cơ sở |
| BA 08/08 §1.1 + fixture P0 `matrix-fixture.ts:39-61` | `HO → REGION → CENTER` | HO **là** tổ tiên mọi cơ sở |

Chủ dự án chốt **bản BA** ngày 11/08/2026, đúng luật README bàn giao §1 ("xung đột ở đâu → BA thắng") và khớp fixture mà P0 đã ký. Ba khẳng định trong `tests/e2e/a0/orgunit.spec.ts` đổi chiều theo — đó là **nội dung của quyết định**, không phải test hỏng.

Đây **không phải nới quyền**: `buildActor()` vốn đã cấp cross-center cho mọi role đặt tại HO/ROOT qua nhánh `isHoLevel` riêng. Sau P1, đường `path` và đường `isHoLevel` cho **cùng một kết quả** — bớt đi một chỗ để lệch.

**Materialized path.** `"/ho/danang/cs1/"` — segment = `code` viết thường, `_` → `-`. Dấu `/` ở **cuối** là bắt buộc chứ không phải thẩm mỹ: thiếu nó thì `UNIT_AND_BELOW` của `/ho/danang/cs1` nuốt luôn dữ liệu của `cs10`. Công thức slug tồn tại ở **hai nơi** (`lib/org/path.ts` và SQL backfill trong migration) — test `[US-05-U-05]` là dây nối giữ hai chỗ bằng nhau; lệch nhau là path DB khác path app ⇒ scope hụt im lặng.

**Trả nợ P0 — hai mức dataScope nay khác nhau thật.** `Actor.roleCenterScope` đổi shape từ `"ALL" | string[]` sang `"ALL" | { unitOnly, unitAndBelow }`. Trước P1 chỉ có một danh sách nên `can()` không phân biệt nổi `UNIT_ONLY` với `UNIT_AND_BELOW` (nợ ghi ở `permissions.md`). Đơn vị đo **vẫn là `centerId`** — `Target` cố ý chưa mang `orgUnitId`, đó là việc của P3/P4 (luật cứng #2). 24 ô ma trận TS-04 giữ nguyên chân trị; chỉ builder fixture đổi.

**Ba cờ sống/chết + một khoảng hiệu lực → một hàm.** OrgUnit sau P1 có `deletedAt`, `isActive`, `status`, `effectiveFrom/To`. `status` là **cột gương** của `isActive` (ACTIVE ⇔ true, SUSPENDED ⇔ false, CLOSED ⇔ xoá mềm), nguồn sự thật vẫn là cặp cũ tới hết P4. Mọi câu hỏi "đơn vị còn sống không" đi qua `lib/org/status.ts` — nếu không, ràng buộc US-06 AC3 ("không xoá pháp nhân còn đơn vị ACTIVE") thành không xác định.

**Lỗ đã bịt: Center `hoi-so` mồ côi.** Trước P1 luật cấm HO mang `centerId`, nên không `OrgUnit` nào trỏ tới `Center("hoi-so")` ⇒ `orgUnitIdForCenter('hoi-so')` trả `null` **im lặng** ⇒ mọi bản ghi của Hội sở không bao giờ nhận `orgUnitId`, và tới P4 (lật scope sang `orgUnitId`) là biến mất sạch. V7 nới cho HO; `getSubtreeCenterIds` vẫn lọc `type === "CENTER"` nên centerId của HO **không** lọt vào phạm vi cơ sở của ai.

**Migration additive tuyệt đối, tách làm hai file.** `ALTER TYPE ... ADD VALUE` không dùng được giá trị mới trong **cùng** transaction, mà Prisma chạy mỗi file migration trong một transaction ⇒ file `20260811020000` chỉ chứa `ALTER TYPE`, file `20260811030000` mới dùng tới. Backfill `path` bằng recursive CTE có mệnh đề `CYCLE` — dữ liệu bẩn có vòng cha-con thì dừng nhánh thay vì treo migration.

**Việc dời node KHÔNG nằm trong migration** (luật cứng #4). `scripts/nen-p1-reshape-org-tree.ts` — dry-run mặc định, `--apply` mới ghi, chạy trong một transaction, chuyển `UserOrgRole` từ ROOT sang HO trước khi đóng ROOT.

**Cố ý không làm:** không thêm `REGION` vào `DEFAULT_SELECTABLE_TYPES`. 6 màn gọi `getSelectableOrgUnits()` không truyền `types` và ghi kết quả vào cột `centerId`; REGION có `centerId = null`, mà `null` ở nhiều bảng nghĩa là "áp dụng toàn hệ thống" (`lib/db-scope.ts:62-70`) — cho vùng lọt picker là biến "nghỉ lễ của Vùng Đà Nẵng" thành "nghỉ lễ toàn hệ thống" mà không ai báo lỗi. Mở picker cho REGION là việc P2.

### AS-BUILT — US-05 AC4: màn quản trị cây tổ chức `/admin/to-chuc` (11/08/2026)

**Cây chỉ đọc bằng `<details>/<summary>`**, không thêm thư viện: trang là Server Component, dựng cây từ `parentId` trong bộ nhớ (dữ liệu < 50 node — không tối ưu sớm, không truy vấn đệ quy). Mỗi node hiện mã, tên, loại (nhãn tiếng Việt), quan hệ sở hữu, trạng thái, `path` và pháp nhân. Chỉ 3 nút thao tác (Sửa · Thêm đơn vị con · Xoá mềm) là client component; form nằm trong Dialog shadcn.

**Không có luật nghiệp vụ nào trong `app/`.** 3 Server Action (`app/(admin)/admin/to-chuc/_actions.ts`) gọi thẳng `createOrgUnit`/`updateOrgUnit`/`softDeleteOrgUnit` của `lib/org/org-service.ts` rồi dịch `OrgRuleError` (code EN + message VI) thành `{ ok:false, error }`. Path/depth cả nhánh, chống vòng lặp, "CENTER không làm cha REGION", "không xoá đơn vị còn con sống" vẫn chỉ tồn tại ở một chỗ.

**Quyền dùng key CÓ SẴN, không chế key mới:** đọc `centers:view`, ghi `centers:edit` (registry `lib/permissions/registry/system.ts`; ma trận v1 = `["SUPER_ADMIN"]`, vốn đã là gate của mọi thao tác "cấu trúc tổ chức" ở `/admin/centers`). Registry là một nguồn sự thật và có test chặn trùng key — thêm `org-units:manage` là việc phải đi kèm seed `RolePermission` + migration `PermissionDescriptor`, không làm lén trong story UI.

**Lọc tầm nhìn phải làm TAY.** `OrgUnit ∈ SCOPE_EXEMPT` (`lib/db-scope.ts`) nên `scopedDb` **không** cách ly cây. Trang lọc như `/centers`: SUPER_ADMIN + cấp Hội sở thấy cả cây; người cấp cơ sở chỉ thấy nhánh cơ sở mình kèm đường tổ tiên (để cây không gãy đoạn), không lộ cơ sở khác.

**Cố ý không phơi trên form:** (1) `code` khi SỬA — mã nằm trong `path`, tức nằm trong đường tính quyền, sửa nhầm kéo theo cả cây con (service vẫn hỗ trợ đổi mã); (2) `centerId` — cầu ánh xạ Center cũ do backfill US-07 quản, để người dùng tự gắn là tự tay tạo lệch ánh xạ 1-1; (3) `loại đơn vị` khi SỬA — loại quyết định luật cha/con.

**Nợ ghi lại:** thao tác trên cây **chưa** ghi audit log (US-18 mới là story ghi vết OrgUnit/Role/Grant/Assignment/Contract). Ai làm US-18 nhớ cắm vào 3 action này.

## Tổng quan

Lõi "Thiết lập › Hệ thống" của satarobo: cây tổ chức 3 tầng + pháp nhân, vị trí/phân công/nơi tác nghiệp, registry quyền + resolver `can()` 4 mức dataScope, nhóm người dùng, hợp đồng nhượng quyền, danh mục kế thừa, khuôn mẫu đơn vị, audit log. Mọi module nghiệp vụ (chat, lớp học, học phí, chấm công...) cắm vào lõi này — không module nào tự chế cơ chế quyền.

**Giả định then chốt:** (1) một dev thi công tuần tự theo 6 pha, không song song với đợt chat; (2) dữ liệu sheet của Sale nằm ngoài phạm vi backfill; (3) MISA giữ Kế toán + Tiền lương/BHXH/Thuế TNCN — seam là file bảng công + doanh thu tháng đẩy sang.

## Stack

Next.js App Router (một app duy nhất) · Server Actions là tầng nghiệp vụ · Prisma → Supabase Postgres · Vercel (+ Vercel Cron) · Không backend tách riêng, không microservice (quyết định 26/07).

## Auth & claims end-to-end

1. Đăng nhập Supabase Auth → session JWT chứa `userId` (KHÔNG nhúng role/scope vào token — nguồn quyền là DB, tránh token cũ giữ quyền đã thu).
2. Mỗi Server Action: lấy `userId` từ session → `can(actor, permissionKey, target)`.
3. `can()` resolve: Assignment còn hiệu lực → Position → Role + UserGroup → PermissionGrant (DENY > ALLOW > kế thừa) → dataScope theo `OrgUnit.path` ∪ WorkScope → với grant `derivedFrom`: kiểm trạng thái FranchiseContract tại thời điểm chạy.
4. Cache resolve theo request, không cache phiên.

## Ranh giới tin cậy

| Ranh giới | Luật |
|---|---|
| Browser → Server Action | Mọi input validate (zod); không tin ID client gửi — mọi target đi qua `can()` |
| Service-role key (Supabase) | Chỉ server; client dùng anon key + RLS |
| Job (Vercel Cron) → app | Xác thực bằng secret riêng (xem variables.md), idempotent |
| satarobo → MISA (seam kế toán) | Một chiều đẩy file; MISA không gọi ngược vào satarobo |
| Phụ huynh | Ngoài cây tổ chức; scope duy nhất = OWN qua bảng Guardian–Student |

## Known risks / assumptions (bám mã)

- Fallback `can()` về logic `centerId` tồn tại từ P0 đến P4 — hai đường quyền song song, chỉ được gỡ sau cutover (xem flows.md F6).
- `path LIKE prefix` là điểm nóng hiệu năng duy nhất của resolver; index prefix bắt buộc, đo ở P3.
- Cột `centerId` deprecated sau P4 nhưng chưa drop — code mới cấm đọc nó (lint).
- Chuỗi 4 điều kiện chương trình dạy là bề mặt IDOR rủi ro nhất — bắt buộc kiểm ở server, TS-18 chặn merge.

## Tài liệu liên quan

flows.md · permissions.md · variables.md · cron.md · tests.md
Không có emails.md (nền không gửi email — ZNS/notification thuộc module khác). Không có seo.md (toàn bộ là màn admin sau đăng nhập). Không có automation.md (nền không nhúng agent; Claude Code là công cụ thi công, không phải thành phần runtime).
