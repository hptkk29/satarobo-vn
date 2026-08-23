# PRD — KHU VỰC G: Module Lead

**Trạng thái:** Draft
**Nguồn spec (đã chốt):** `docs/specs/spec-dashboard-qlcs-duyet-media-lead.md` — KHU VỰC G (G-01 → G-07)
**Phạm vi:** CHỈ G-01…G-07. Không mở rộng sang A/B/C/D/E/F.
**PRD nền phụ thuộc:** `docs/prd/A-nen-tang.md` (đặc biệt §10 — danh sách khoá schema SL-00…SL-15)
**Nhánh khảo sát:** `hptkk29/runhop20_08`

> Mọi khẳng định hiện trạng trong PRD này đều kèm `file:dòng`, đọc trực tiếp từ mã nguồn trên nhánh này.
> ⛔ **G-05 (bỏ trường cũ) trong tài liệu này CHỈ có định hướng.** Kế hoạch migration chi tiết nằm ở
> `docs/migration/G-lead-migration-plan.md` (do người khác viết). Đừng viết trùng — ở đây chỉ chốt
> nguyên tắc và ràng buộc mà kế hoạch đó phải tuân.

---

## 1. Executive Summary

Khu vực G làm ba việc, theo đúng thứ tự phụ thuộc:

1. **Khoá lại hình dạng dữ liệu lead** — tách rõ hai tầng: `Lead` (một phụ huynh) và `LeadChild`
   (N học sinh). Bảng `LeadChild` **đã tồn tại** (`prisma/schema.prisma:1461`) và đã nối
   `Enrollment.leadChildId` (`:1833`) — G-07 là **mở rộng bảng này**, KHÔNG tạo bảng thứ ba.
2. **Bù các trường còn thiếu của G-01 + G-06** vào đúng tầng, và **kéo 3 mẩu dữ liệu đang bị nhét
   vào `Lead.note` dạng text ra thành cột thật** (tỉnh/TP, địa chỉ, mã NV nhập lead).
3. **G-04 — tuỳ chọn cột kiểu MISA**, lưu theo từng user. Repo **chưa có** model preference nào và
   **chưa có** thư viện kéo-thả nào (kiểm chứng: `package.json` không có `@dnd-kit`, `react-dnd`,
   `sortablejs`, `react-beautiful-dnd`; `react-dropzone` có nhưng là upload file, không phải sắp xếp).

**Điểm nặng nhất, phải chốt trước dòng code đầu tiên:** G-07 nói *doanh số và trạng thái chốt ghi nhận
**theo từng học sinh***. Đường tiền hiện tại là `Lead → Order.leadId → Payment.orderId`, và **`Order`
KHÔNG có `leadChildId`** — chỉ có `leadId` (`prisma/schema.prisma:3687`). Có một đường vòng
(`Payment.enrollmentId` → `Enrollment.leadChildId`) nhưng **không phủ hết** (xem §6.4). Chốt sai chỗ này
thì mọi con số của C-03 đều phải quy lại bằng tay.

---

## 2. Background & Context

### 2.1 Hai bảng đang có

| Bảng | Dòng | Số trường vô hướng | Có `centerId`? | Có `orgUnitId`? | ∈ `SCOPED_MODELS`? |
|---|---|---|---|---|---|
| `Lead` | `prisma/schema.prisma:1309` | **49** | ✅ `:1315` | ✅ `:1316` | ✅ `lib/db-scope.ts:12` |
| `LeadChild` | `prisma/schema.prisma:1461` | **14** | ❌ **KHÔNG** | ❌ **KHÔNG** | ❌ **KHÔNG** |

Danh sách trường thật (đo bằng `awk` trên đúng khoảng dòng của từng model):

```
Lead (49):    id parentName phone email childName childAge centerId orgUnitId courseId
              assignedToId isSharedWithTeam sharedAt sharedById status source utmSource
              utmMedium utmCampaign utmContent utmTerm fbclid gclid fbp fbc eventId
              landingPage referrer ipAddress userAgent consentMarketing note handoverNote
              convertedById convertedAt qualifiedAt handedAt receivedConfirmedAt assignedAt
              firstContactAt commissionSource adminId affiliateId orderKind expectedCourseId
              expectedProductId deletedAt createdAt updatedAt lastActivityAt

LeadChild (14): id leadId fullName dob ageYears gender schoolName gradeLevel
                interestedCourseId interestedCenterId note trialStatus createdAt updatedAt
```

`LeadChild` **không có cột cách ly nào** ⇒ `scopedDb` không auto-scope nó; cách ly hiện chỉ gián tiếp
qua `Lead` cha. Đây chính là **SL-08** trong `docs/prd/A-nen-tang.md` §10.3, và nó trở thành lỗ hổng
thật ngay khi `LeadChild` mang doanh số (G-07).

### 2.2 Bốn khoản nợ dữ liệu đang có trên đường lead (đo trên mã, không suy đoán)

| # | Nợ | Bằng chứng | Hệ quả |
|---|---|---|---|
| **N-1** | 🔴 Tỉnh/TP + địa chỉ + mã NV nhập lead **bị nhét vào `Lead.note`** dưới dạng dòng text | `lib/lead/intake/map-sale-form.ts:122` `noteLines.push(\`Tỉnh/TP: …\`)`, `:127` `\`Địa chỉ: …\``, `:130` `\`Nhân viên nhập: …\`` | Không lọc/nhóm/xuất được theo địa bàn. **Tệ hơn:** `note` nằm trong `sensitiveFields` của `leads:view-pii` (`lib/permissions/registry/crm.ts:15`) và bị `maskFreeText` thay bằng chuỗi `"••• (cần quyền…)"` (`lib/lead/pii.ts:26,30,50`) ⇒ người không có quyền PII **mất luôn cả địa chỉ lẫn mã NV**, dù hai thứ đó không phải PII |
| **N-2** | 🔴 **"Người nhập lead" bị trộn với "sale phụ trách"** | `lib/lead/intake/ingest.ts:157` trả `assignedToId: account.id` từ chính mã NV trên phiếu; `:352` ghi thẳng vào `Lead.assignedToId` + `status: "ASSIGNED"`. Mã NV **không** được lưu ở cột riêng nào — chỉ nằm trong `note` (chú thích tự thừa nhận ở `ingest.ts:106`) | Không phân biệt được ai *mang lead về* với ai *đang chăm*. Khi người nhập không giữ vai `SALES_CSM` thì mã NV rơi hẳn vào `note` (`ingest.ts:148-153`) — công nhập biến mất khỏi mọi báo cáo |
| **N-3** | 🔴 **Dedup nhập tay bỏ sót bản ghi `0…` cũ** | Đường công khai dùng `phoneVariants` khớp **cả** `84…` lẫn `0…` (`lib/lead/dedup.ts:18` → `lib/phone.ts:112` trả `[c, "0"+c.slice(2)]`). Đường nhập tay ở admin so khớp **chuỗi đúng-bằng**: `app/(admin)/admin/leads/actions.ts:596` `where: { phone: d.phone, deletedAt: null }` (tạo mới) và `:731` (đổi SĐT) | Sale nhập tay một SĐT đã tồn tại ở dạng `0…` sẽ **tạo lead trùng**. Trớ trêu: file này nằm trong allowlist ESLint **chính vì** dedup được thiết kế cố ý cross-center (`lib/eslint/db-import-allowlist.mjs`, mục "Loại B") — ý đồ là dedup toàn hệ thống, hiện thực thì hụt một nửa dữ liệu. **Đã xác minh tĩnh, chưa đo trên DB** |
| **N-4** | 🔴 `Lead.lastActivityAt` **không phản ánh đủ hoạt động** | Chỉ 3 chỗ ghi: `app/(admin)/admin/leads/actions.ts:346`, `:395`, `:431`. Trong khi có **13 chỗ** tạo `LeadActivity` (grep `leadActivity.create`), trong đó `lib/lead/assign.ts:126`, `lib/lead/auto-assign.ts:184`, `lib/lead/dedup.ts:40`, `lib/finance/payment.ts:157`, `lib/lead/intake/ingest.ts:203/230/380` **không** cập nhật `lastActivityAt` | Đồng hồ SLA "số ngày chưa tiếp cận lại" của **C-05** sai. Cũng ảnh hưởng `isLeadIdle` (`lib/crm/sla.ts:100`) — cột này rơi ngược về `createdAt`, che mất lead đã có hoạt động thật |

### 2.3 Trạng thái lead hôm nay

`LeadStatus` (`prisma/schema.prisma:37-55`) có đúng **15** giá trị. Chỉ **6** giá trị được mã **ghi tự động**:

| Giá trị | Nơi ghi tự động |
|---|---|
| `NEW` | `lib/lead/intake/ingest.ts` (mặc định), `app/api/leads/route.ts:101`, `app/api/admin/import/leads/route.ts:255`, `app/(admin)/admin/leads/actions.ts:647` |
| `ASSIGNED` | `lib/lead/assign.ts:113`, `lib/lead/auto-assign.ts:171`, `:233`, `lib/lead/intake/ingest.ts:352`, `app/(admin)/admin/leads/actions.ts:942` |
| `TRIAL_IN_PROGRESS` | `lib/trial/service.ts:641` |
| `AWAITING_DECISION` | `lib/trial/service.ts:633` |
| `REGISTERED` | `lib/finance/payment.ts:154` (chỉ từ `AWAITING_DECISION`), `app/api/admin/import/leads/registered/route.ts:511` |
| `ENROLLED` | `lib/crm/convert-lead.ts:77`, `lib/crm/convert-lead-v2.ts:170` |

9 giá trị còn lại (`CONTACTED`, `NO_ANSWER`, `CONSULTING`, `TRIAL_SCHEDULED`, `TRIAL_ATTENDED`,
`NURTURING`, `LOST`, `DUPLICATE`, `DEMO_SCHEDULED`) **chỉ đổi được bằng tay** qua `updateLeadStatus`
(`app/(admin)/admin/leads/actions.ts:127`). Guard chuyển trạng thái là **permissive** — chặn đúng một
đường `→ REGISTERED` (`lib/leads/status.ts:117-133`).

### 2.4 Lịch sử chuyển sale nằm ở 3 bảng, 3 người ghi khác nhau

| Bảng | Nơi ghi (đường DUY NHẤT) | Phủ được gì |
|---|---|---|
| `LeadAssignmentHistory` (`:5241`) | `lib/lead-handover/service.ts:95` | Bàn giao qua module handover |
| `LeadTransfer` (`:3503`) | `app/(admin)/admin/leads/actions.ts:963` | Chuyển sale/cơ sở ở màn admin |
| `LeadActivity` type `HANDOVER` (`:3527`, enum `:3479`) | `app/(admin)/admin/leads/actions.ts:951` | Dòng timeline của cùng thao tác trên |

Không bảng nào phủ hết. `lib/lead/assign.ts` và `lib/lead/auto-assign.ts` (đường tự chia)
**không ghi vào bảng nào trong ba bảng này** — chỉ ghi `LeadActivity` + `logLeadAudit`.

### 2.5 Audit lead đã hợp nhất — đừng làm lại

`LeadAuditLog` (`:3445`) **đã đóng băng từ 09/07/2026**: `lib/audit/legacy-log.ts:1-4` ghi rõ *"chỉ đọc,
không bao giờ ghi"*; helper `logLeadAudit` (`lib/audit/log.ts:128-156`) gọi thẳng `writeAudit(...)` vào
bảng `AuditLog` hợp nhất với `module: "leads"`, `entityType: "Lead"`, kèm `orgUnitId` resolve
(`:151`), `ip`/`userAgent`. Có **19 call-site** `logLeadAudit` trên toàn repo.

⇒ **G-02 không cần cơ chế audit mới.** Cái thiếu là **UI**: trang chi tiết lead
(`app/(admin)/admin/leads/[id]/page.tsx`) hiện chỉ đọc `activities` (`:54`, `:483`) —
**không có mục nào đọc `AuditLog`**. Grep `auditLog` trên file này = 0 kết quả.

---

## 3. Objectives & Success Metrics

### Goals

1. Một phụ huynh có N con là **một** `Lead` + **N** `LeadChild`; nhập con thứ hai **không** phải tạo lead trùng.
2. Doanh số và trạng thái chốt truy được về **đúng đứa con**, không phải về phụ huynh.
3. Mọi trường trong G-01 + G-06 có **cột thật** ở đúng tầng — không còn dữ liệu sống trong `note`.
4. Sale sửa được lead; sửa 3 trường định danh để lại vết **đọc được ngay trên trang chi tiết lead**.
5. Mỗi user tự chọn/sắp xếp cột danh sách lead, khôi phục mặc định bằng một nút.

### Non-Goals (cố ý không làm trong G)

1. **Không** viết kế hoạch migration G-05 ở đây (file riêng — xem đầu tài liệu).
2. **Không** drop `Lead.childName` / `Lead.childAge` trong giai đoạn G — SL-15 + chú thích schema
   `:1459-1460` (*"giữ đọc-only (2-phase, KHÔNG drop)"*) + luật cứng #4.
3. **Không** drop giá trị nào của enum `LeadStatus` — SL-14, dữ liệu PROD đang mang 15 giá trị.
4. **Không** xây tab dashboard C/D — G chỉ giao **dữ liệu** cho C/D đọc.
5. **Không** thêm thư viện UI mới cho G-04 (`.claude/rules/ui-libraries.md`: *"NEVER auto-add"*).
6. **Không** đổi cơ chế export/quyền export — thuộc A-03 (`docs/prd/A-nen-tang.md` §6.3). G-03 chỉ tham chiếu.

### Success Metrics

| Chỉ số | Hiện tại | Đích | Cách đo |
|---|---|---|---|
| Địa chỉ/tỉnh-TP truy vấn được bằng SQL | 0 (nằm trong `note` dạng text) | 100% lead mới | `SELECT count(*) FROM "Lead" WHERE city IS NOT NULL` sau khi bật đường ghi mới |
| Người nhập lead tách khỏi sale phụ trách | Trộn (`ingest.ts:157` → `assignedToId`) | 2 cột riêng | e2e: phiếu có mã NV của một GV (không phải Sale) → `createdByCode` = mã đó, `assignedToId` = sale được auto-chia |
| Doanh số quy được về từng con | Không quy được (`Order` chỉ có `leadId`) | 100% đơn mới | e2e: 1 PH 2 con, 2 đơn → C-03 hiện đúng 2 dòng, tổng khớp `Payment` |
| Cách ly cơ sở của `LeadChild` | Không có cột để lọc | `scopedDb` chặn được | e2e: actor CS1 đọc `LeadChild` của CS2 → 0 dòng |
| Dedup nhập tay bắt được `0…` cũ | Bỏ sót (`actions.ts:596`) | Bắt đủ | test: tạo lead phone `0905…`, nhập tay `84905…` → bị chặn |
| `lastActivityAt` phản ánh đủ hoạt động | 3/13 đường ghi | 13/13 | test: mỗi đường tạo `LeadActivity` → `lastActivityAt` bump |
| Người dùng tự cấu hình cột | Không có model | Lưu + khôi phục < 5s | e2e: ẩn 2 cột, đổi thứ tự, F5 → giữ nguyên; bấm Khôi phục → về mặc định |
| Sửa tên/SĐT để lại vết **nhìn thấy được** | Ghi `AuditLog` nhưng UI không hiện | Hiện trên trang chi tiết | e2e: sửa `parentName` → mục "Lịch sử thay đổi" hiện cũ → mới |

---

## 4. Target Users & Segments

| Vai | Cần gì từ G |
|---|---|
| **Sale (`SALES_CSM`)** | Nhập/sửa lead đủ trường (G-01/G-02); đánh dấu rớt kèm lý do (C-06); thêm con thứ hai không tạo lead mới (G-07); tự chọn cột danh sách (G-04) |
| **QLCS (`CENTER_MANAGER`)** | Soi lead treo, xem lịch sử chuyển sale, xem doanh số theo con của cơ sở mình |
| **Marketing (`MARKETING` / `HO_MARKETING`)** | Nguồn lead có **danh mục** thay vì chuỗi tự do; campaign/ad ID để nối CPL–CPA (D-04/D-05). Lưu ý: vai này **không** có `leads:view-pii` mặc định ⇒ vẫn thấy bản mask (`lib/lead/pii.ts:5-6`) |
| **Kế toán / BGĐ** | Doanh số theo học sinh khớp sổ `Payment` |
| **Người nhập lead không phải Sale** (GV, lễ tân thu số ở sự kiện) | Công nhập được ghi nhận ở cột riêng, không rơi vào `note` (N-2) |

---

## 5. User Stories & Requirements

### P0 — Must Have

| # | User story | Acceptance criteria |
|---|---|---|
| **G-07-1** | Là Sale, tôi thêm đứa con thứ hai vào lead sẵn có mà không phải tạo lead trùng SĐT. | Màn chi tiết lead có bảng con (`app/(admin)/admin/leads/_components/lead-children.tsx` đã có `addLeadChild`/`updateLeadChild`/`deleteLeadChild`). Thêm con **không** đụng `Lead.childName`. Đường công khai đã làm sẵn ca này (`lib/lead/intake/ingest.ts:167` `attachExtraChild`) — giữ nguyên hành vi. |
| **G-07-2** | Là QLCS, tôi thấy trạng thái chốt **của từng đứa con**, không phải của phụ huynh. | `LeadChild.status` kiểu enum **mới** `LeadChildStatus` (§6.5). `Lead.status` giữ nguyên 15 giá trị, **không** bị ghi đè bởi trạng thái con. |
| **G-07-3** | 🔴 Là BGĐ, tôi xem doanh số quy về **đúng từng con**. | Chốt **một** cách nối `Order` ↔ `LeadChild` (§6.4) **trước** khi C-03 chạy. AC: 1 PH – 2 con – 2 đơn → tổng doanh số 2 dòng = tổng `Payment` của lead; 1 đơn chia 2 con → tổng phần chia = `Order.totalAmount` (bất biến tổng). |
| **G-07-4** | 🔴 Là QLCS cơ sở 1, tôi **không** đọc được `LeadChild` của cơ sở 2. | `LeadChild` thêm `centerId String?` + `orgUnitId String?`; khai vào `SCOPED_MODELS` (`lib/db-scope.ts:11`) **và** `BACKFILL_SPECS` (`lib/org/center-bridge.ts:45`) — thiếu chỗ thứ hai thì test `[US-07-IT-08b]` đỏ. ⚠️ `scopedDb` **không che write** (`lib/db-scope.ts:4-5`) ⇒ mọi `create` `LeadChild` phải tự set `centerId`. |
| **G-01-1** | Là Sale, tôi nhập **địa chỉ** (tỉnh/TP · phường/xã · chi tiết) vào ô riêng. | 3 cột thật trên `Lead`. Đường ghi từ form Sale **ngừng** nhét vào `note` (`map-sale-form.ts:122,127`). Picker tỉnh/phường dùng `vietnam-address-data` — **đã có sẵn trong repo** và đã dùng ở `app/(admin)/admin/orders/_components/order-create-form.tsx:174` (mô hình 2 cấp 2025). |
| **G-01-2** | 🔴 Là QLCS, tôi biết **ai mang lead về**, tách khỏi **ai đang chăm**. | `Lead.createdById` + `Lead.createdByCode` (mã NV) là cột riêng. `assignedToId` giữ nghĩa "sale phụ trách". Đường `ingest.ts:157` **thôi** dùng mã NV làm `assignedToId` mặc định; mã NV luôn được ghi vào `createdByCode` kể cả khi người đó không phải Sale (vá N-2). |
| **G-01-3** | Là Sale, tôi ghi **lớp học tại trung tâm** của từng con. | `LeadChild.classId String?` (tham chiếu `Class`). Phân biệt rõ với `LeadChild.interestedCenterId` (`:1470`, cơ sở quan tâm) và với `Enrollment` (chỉ có sau khi convert — `Enrollment.leadChildId:1833` với chú thích *"Enrollment tạo trực tiếp → null"*). |
| **G-06-1** | Là Sale, khi đánh dấu **Rớt** tôi **bắt buộc** chọn lý do. | Server Action từ chối nếu thiếu `lostReasonId`. Lý do lấy từ **bảng danh mục** `LeadLostReason` (§6.6), không phải enum Postgres. |
| **G-06-2** | Là admin, tôi thêm/sửa/ẩn **lý do rớt** và **nguồn lead** mà không cần deploy. | Hai bảng danh mục `LeadLostReason` + `LeadSource` với `(code, label, isActive, displayOrder)`. `Lead.source` hiện là **String tự do** (`:1327`, validator `actions.ts:575` `z.string().max(100)`, filter `page.tsx:119` dùng `contains`) — không có danh mục nào trong repo (grep `LEAD_SOURCE`/`SOURCE_OPTIONS` = 0 kết quả). |
| **G-06-3** | Là Marketing, tôi bóc CPL/CPA **theo campaign**. | `Lead.campaignId` + `Lead.adsetId` + `Lead.adId`. `utm*` đã có (`:1328-1332`) nhưng là **nhãn chiến dịch**, không phải ID của Meta; `fbclid/fbp/fbc` (`:1333,1335,1336`) là tham số click/cookie, **không** phải Ad ID. |
| **G-02-1** | Là Sale được cấp quyền, tôi sửa được lead. | Giữ nguyên gate hiện có: `checkPermission('leads:edit')` + `passesScope('Lead', …)` + `actorMayMutateLead` (`actions.ts:50-56`: chủ lead **hoặc** `leads:view-all`). Bộ trường sửa được mở rộng theo G-01/G-06. |
| **G-02-2** | 🔴 Là QLCS, tôi **nhìn thấy** ai sửa Tên PH / Tên HS / SĐT, lúc nào, cũ → mới. | Ghi audit đã có (`logLeadAudit` → `AuditLog`, `lib/audit/log.ts:141-155`). **Việc phải làm là UI**: thêm mục "Lịch sử thay đổi" trên `app/(admin)/admin/leads/[id]/page.tsx` đọc `AuditLog` (`module='leads'`, `entityId=leadId`) — hiện trang này **chỉ** đọc `activities` (`:54`). Sửa `LeadChild.fullName` cũng phải ghi (đã có tiền lệ `lib/students/sync-name.ts:126`). |
| **G-04-1** | Là user bất kỳ, tôi chọn cột hiển thị / kéo thả thứ tự / xoá cột trên danh sách lead, và cấu hình đó **là của riêng tôi**. | Bảng mới `UserTablePreference` unique `[userId, tableKey]` (§7). Server Action **luôn** lấy `userId` từ `session`, **không bao giờ** nhận từ client. |
| **G-04-2** | Là user, tôi bấm **Khôi phục mặc định** và bảng trở về nguyên trạng. | Một nút → xoá dòng preference → render theo hằng số `LEAD_TABLE_COLUMNS` tầng mã. |
| **G-04-3** | 🔴 Cột bị gỡ khỏi hệ thống không được làm hỏng bảng của tôi. | Khoá lạc trong JSON **bị bỏ qua im lặng** khi render; cột mới trong catalog mà cấu hình chưa biết → chèn theo `defaultVisible` của catalog. Chi tiết + bảng quy tắc: §7.5. |
| **G-04-4** | 🔴 Tuỳ chọn cột **không** được biến thành cổng quyền. | Cột PII (`parentName`, `phone`, `email`, `childName`, `note`) vẫn đi qua mask theo `leads:view-pii` ở **server** (`lib/lead/pii.ts:42-51`) dù user có bật cột hay không. Người không có quyền bật cột `phone` thì thấy `090•••` — không phải thấy số thật. |
| **G-05-1** | Là dev, tôi biết chắc trường nào là nguồn sự thật sau khi tách. | Bảng phân loại §6.3 là **hợp đồng**. `Lead.childName`/`childAge` chuyển sang **đọc-only** (2-phase, không drop — SL-15). Chi tiết migration: file riêng. |

### P1 — Should Have

| # | User story | Acceptance criteria |
|---|---|---|
| **G-06-4** | Là Sale, tôi đặt **ngày hẹn follow-up kế tiếp** ngay trên lead. | `Lead.nextFollowUpAt DateTime?`. Hôm nay chỉ có đường gián tiếp qua `LeadTask.dueAt` (`:3550`) — mà `LeadTask` là bảng việc, không phải thuộc tính lead; cron `assignment-due-soon` đọc `dueAt` của bảng khác hẳn (`app/api/cron/assignment-due-soon/route.ts:23`). |
| **G-06-5** | Là Sale, tôi đánh dấu **mức độ tiềm năng** và **kênh liên hệ ưu tiên**. | `Lead.potential` (Nóng/Ấm/Lạnh) + `Lead.preferredChannel` (Gọi/Zalo/FB). |
| **G-06-6** | Là Sale, tôi lưu **số Zalo khác SĐT**. | `Lead.zaloPhone String?`, chuẩn hoá qua `canonicalPhone` như `phone`. |
| **G-06-7** | 🔴 Là QLCS, tôi xem được **một** lịch sử chuyển sale, không phải ba mảnh. | Chốt **một** bảng là nguồn sự thật (đề xuất `LeadAssignmentHistory`) và ép **mọi** đường chuyển ghi vào đó — kể cả đường tự chia (`lib/lead/assign.ts`, `lib/lead/auto-assign.ts` hiện **không** ghi vào bảng nào trong ba bảng). Hai bảng còn lại giữ đọc-only. |
| **G-06-8** | 🔴 Đồng hồ "chưa tiếp cận lại" đúng. | Vá N-4: gom việc ghi `LeadActivity` + bump `lastActivityAt` vào **một** helper duy nhất, dùng ở cả 13 call-site. **Đây là điều kiện cần của C-05** — không vá thì cột "số ngày chưa tiếp cận lại" sai. |
| **G-06-9** | 🔴 Dedup nhập tay bắt được cả `0…` lẫn `84…`. | Vá N-3: `actions.ts:596` và `:731` đổi sang `phone: { in: phoneVariants(d.phone) }` (đúng khuôn `lib/lead/dedup.ts:18`). **Giữ nguyên** tính cross-center có chủ đích (lý do file này ở trong allowlist ESLint). |
| **G-01-4** | Giới tính / ngày sinh **phụ huynh** có ô nhập. | `Lead.parentGender Gender?` + `Lead.parentDob DateTime? @db.Date`. Enum `Gender` (`MALE/FEMALE/OTHER`) đã tồn tại `:2414`. |
| **G-01-5** | Link Facebook phụ huynh có ô riêng. | `Lead.facebookUrl String?`. Không tái dùng `fbclid`/`fbp`/`fbc` — ba cột đó là tham số quảng cáo. |
| **G-03-1** | Xuất Excel lead theo quyền. | **Thuộc A-03.** G chỉ bổ sung: file xuất phải có các cột mới của G-01/G-06 và **doanh số theo con**. Định dạng CSV↔xlsx là OQ-6 của khu vực A, không mở lại ở đây. |

### P2 — Nice to Have / Future

| # | User story | Acceptance criteria |
|---|---|---|
| **G-04-5** | Tuỳ chọn cột dùng lại được cho bảng khác (học viên, đơn hàng…). | `tableKey` là chuỗi tự do có namespace (`admin.leads.list`) ⇒ bảng thứ hai chỉ cần khai catalog riêng, không đổi schema. |
| **G-04-6** | Nhớ cả độ rộng cột / số dòng mỗi trang. | Chỗ chứa đã có sẵn (`pageSize`, khoá `widths` trong JSON) — không hiện thực ở v1. |
| **G-06-10** | Chuẩn hoá `LeadChild.gender` về enum. | Hôm nay là `String?` (`:1468`), UI ép 3 lựa chọn `["Nam","Nữ","Khác"]` ở tầng client (`lead-children.tsx:71`) — không có ràng buộc DB. Đổi kiểu cột đang có dữ liệu PROD ⇒ luật cứng #4 ⇒ phải 2-phase, xem OQ-G8. |
| **G-06-11** | Ô "đã học thử" tổng hợp trên từng con. | Hiện đọc được từ `LeadChild.trialStatus` (`:1476`) + `LeadTrialHistory` (`:6117`, có `firstAttendedAt`/`lastAttendedAt`/`outcome`). **Không thêm cột** ở v1 — xem OQ-G9 cho ca học thử ngoài `TrialClassV2`. |

---

## 6. Solution Overview — thiết kế schema G-07

### 6.1 Quyết định gốc: mở rộng `LeadChild`, KHÔNG tạo bảng thứ ba

Tên nghiệp vụ trong spec là `lead_student`. Trong repo, vai đó **đã có người đóng**:

| Bằng chứng `LeadChild` đã là `lead_student` | Dòng |
|---|---|
| Quan hệ 1 `Lead` – N con, `onDelete: Cascade` | `prisma/schema.prisma:1463` |
| Chú thích schema: *"1 Lead có N con. Nền cho lớp trải nghiệm (R7-02)"* | `:1458` |
| Đã nối ghi danh chính thức | `Enrollment.leadChildId` `:1833` + relation `:1881` |
| Đã nối học thử | `TrialEnrollment.leadChildId` `:6169`, `LeadTrialHistory.leadChildId` `:6119` |
| Đã có UI CRUD con | `app/(admin)/admin/leads/_components/lead-children.tsx` |
| Đường công khai đã tự tách con thứ hai | `lib/lead/intake/ingest.ts:167` `attachExtraChild` |

⇒ **Chốt: `lead_student` = `LeadChild` mở rộng.** Tạo bảng thứ ba là đẻ ra hai nguồn sự thật cho cùng
một thứ, và phải viết lại 4 quan hệ đang chạy trên prod.

### 6.2 Nguyên tắc phân loại — một câu, áp cho mọi trường

> **Trường thuộc `lead` (cấp phụ huynh)** khi nó mô tả **người lớn** hoặc **cuộc liên lạc với người lớn**:
> danh tính PH, phương tiện liên lạc, địa chỉ nhà, nguồn/quảng cáo dẫn tới cuộc liên lạc, người giới
> thiệu (AFF), ai nhập, ai chăm, cơ sở phụ trách, nhịp chăm sóc.
>
> **Trường thuộc `lead_student` (cấp từng đứa trẻ)** khi nó mô tả **một đứa trẻ cụ thể** hoặc **thương vụ
> của riêng đứa trẻ đó**: tên/giới tính/ngày sinh, trường-lớp đang học ở ngoài, khoá quan tâm, lớp tại
> trung tâm, học thử, **trạng thái chốt**, **doanh số**.
>
> **Phép thử:** *"Phụ huynh có hai con — trường này có thể mang hai giá trị khác nhau không?"*
> Có → `lead_student`. Không → `lead`.

Hệ quả trực tiếp: **trạng thái chốt, thời điểm chốt, giá trị hợp đồng, lý do rớt** đều nằm ở
`lead_student` — vì con thứ nhất có thể ghi danh trong khi con thứ hai rớt.

### 6.3 BẢNG PHÂN LOẠI TỪNG TRƯỜNG

Ký hiệu: **ĐÃ CÓ** = cột thật đang tồn tại (ghi kèm tên cột thật) · **THÊM MỚI** = phải migrate additive.

#### 6.3.a — G-01 (mở rộng trường thông tin KH)

| Trường (theo spec) | Thuộc | Lý do |
|---|---|---|
| Tên PH — **ĐÃ CÓ** `Lead.parentName` · `String` (NOT NULL) | `lead` | Danh tính người lớn; một PH một tên |
| SĐT PH — **ĐÃ CÓ** `Lead.phone` · `String` (NOT NULL) | `lead` | Phương tiện liên lạc của người lớn; cũng là khoá dedup |
| Tên HS — **ĐÃ CÓ** `LeadChild.fullName` · `String` (NOT NULL) | `lead_student` | Hai con hai tên → phép thử §6.2 |
| Giới tính PH — **THÊM MỚI** `Lead.parentGender` · `Gender?` | `lead` | Thuộc tính người lớn. Enum `Gender` đã có `:2414` |
| Giới tính HS — **ĐÃ CÓ** `LeadChild.gender` · `String?` ⚠️ **tự do** | `lead_student` | Đúng tầng rồi, sai **kiểu**: không ràng buộc DB, chỉ ép 3 lựa chọn ở client (`lead-children.tsx:71`). Chuẩn hoá = OQ-G8 |
| Ngày sinh PH — **THÊM MỚI** `Lead.parentDob` · `DateTime? @db.Date` | `lead` | Thuộc tính người lớn |
| Ngày sinh HS — **ĐÃ CÓ** `LeadChild.dob` · `DateTime? @db.Date` | `lead_student` | Mỗi con một ngày sinh |
| Email PH — **ĐÃ CÓ** `Lead.email` · `String?` | `lead` | Liên lạc người lớn. PII (`crm.ts:15`) |
| Link FB — **THÊM MỚI** `Lead.facebookUrl` · `String?` | `lead` | Profile của **người lớn**. KHÔNG tái dùng `fbclid`/`fbp`/`fbc` (`:1333,1335,1336`) — đó là tham số click/cookie quảng cáo |
| Địa chỉ · Tỉnh/TP — **THÊM MỚI** `Lead.city` · `String?` | `lead` | Nhà của gia đình. Hôm nay bị nhét text vào `note` (`map-sale-form.ts:122`) — nợ N-1 |
| Địa chỉ · Phường/xã — **THÊM MỚI** `Lead.ward` · `String?` | `lead` | Như trên. Mô hình 2 cấp 2025 (`vietnam-address-data`, đã dùng ở `order-create-form.tsx:174`) |
| Địa chỉ · Chi tiết — **THÊM MỚI** `Lead.addressLine` · `String?` | `lead` | Hôm nay nhét text vào `note` (`map-sale-form.ts:127`) |
| Nguồn lead — **ĐÃ CÓ** `Lead.source` · `String?` **tự do** + **THÊM MỚI** `Lead.sourceId` · `String?` → `LeadSource` | `lead` | Nguồn dẫn tới **cuộc liên lạc**, không thuộc riêng đứa nào. Cần danh mục vì spec đòi "cấu hình được" |
| Người nhập lead (`mãNV_tên`) — **THÊM MỚI** `Lead.createdById` · `String?` + `Lead.createdByCode` · `String?` | `lead` | Công nhập gắn với **lần thu thập liên hệ**. 🔴 Hôm nay không có cột nào: mã NV chỉ nằm trong `note` (`map-sale-form.ts:130`) và bị quy thẳng ra `assignedToId` (`ingest.ts:157`) — nợ N-2 |
| Khoá quan tâm — **ĐÃ CÓ** `LeadChild.interestedCourseId` · `String?` (và `Lead.courseId` `:1317` giữ đọc-only) | `lead_student` | Con lớp 2 và con lớp 7 quan tâm khoá khác nhau → phép thử §6.2. `Lead.courseId` là di sản cấp PH, hiển thị nhãn "Khoá quan tâm" ở `leads/[id]/page.tsx:302` |
| Ngày nhận lead — **ĐÃ CÓ** `Lead.createdAt` · `DateTime` | `lead` | Mốc của **cuộc liên lạc**. (Các mốc phễu khác `qualifiedAt/handedAt/receivedConfirmedAt` `:1352-1354` giữ nguyên) |
| Ngày tương tác mới nhất — **ĐÃ CÓ** `Lead.lastActivityAt` · `DateTime?` | `lead` | Nhịp chăm sóc **người lớn** — sale gọi cho PH, không gọi cho từng con. ⚠️ Đang sai (nợ N-4) |
| Ghi chú — **ĐÃ CÓ** `Lead.note` · `Text` **và** `LeadChild.note` · `Text?` | **cả hai** | Cấp PH: bối cảnh gia đình. Cấp con: ghi chú riêng từng bé. Cả hai đã tồn tại; sau G-01 thì `Lead.note` **thôi** phải gánh địa chỉ/mã NV |
| Sale phụ trách — **ĐÃ CÓ** `Lead.assignedToId` · `String?` | `lead` | Một sale chăm **một gia đình**, không chia theo con |
| Cơ sở — **ĐÃ CÓ** `Lead.centerId` `:1315` + `Lead.orgUnitId` `:1316` · `String?` | `lead` (+ **nhân bản** xuống `lead_student`) | Cấp PH là nguồn. **Nhưng** `lead_student` phải mang **bản sao** `centerId`/`orgUnitId` để `scopedDb` lọc được — xem G-07-4 / SL-08 |
| Lớp học tại trung tâm — **THÊM MỚI** `LeadChild.classId` · `String?` | `lead_student` | Mỗi con một lớp. Phân biệt với `LeadChild.interestedCenterId` `:1470` (cơ sở quan tâm) và với `Enrollment` (chỉ có **sau** convert — `:1831-1832` *"Enrollment tạo trực tiếp → null"*) |
| Trường/lớp đang học ở ngoài — **ĐÃ CÓ** `LeadChild.schoolName` · `String?` + `LeadChild.gradeLevel` · `String?` | `lead_student` | Trường của **đứa trẻ** |
| AFF — **ĐÃ CÓ** `Lead.affiliateId` · `String?` (relation `:1361`) | `lead` | Người giới thiệu ra **gia đình này**, gán khi vào site qua `?ref=` (`:1358-1359`). ⚠️ Hiển thị ở `leads/[id]/page.tsx:306-309` nhưng **không** có ô sửa trong `lead-form.tsx` |

#### 6.3.b — G-06 nhóm BẮT BUỘC

| Trường (theo spec) | Thuộc | Lý do |
|---|---|---|
| Trạng thái lead (6 giá trị) — **THÊM MỚI** `LeadChild.status` · enum **mới** `LeadChildStatus` (§6.5) | `lead_student` | 🔴 G-07: *"trạng thái chốt ghi nhận theo từng học sinh"*. Con A ghi danh trong khi con B rớt là ca thường. `Lead.status` (`:1322`, 15 giá trị) **giữ nguyên**, mang nghĩa "tình trạng liên hệ với PH" |
| Lý do rớt (enum cấu hình) — **THÊM MỚI** `LeadChild.lostReasonId` · `String?` → `LeadLostReason` | `lead_student` | Đi kèm trạng thái rớt ⇒ cùng tầng. Con A rớt vì "xa nhà", con B rớt vì "học phí" — hai lý do khác nhau trên cùng một PH. ⚠️ **Lệch có chủ đích so với SL-10** (`A-nen-tang.md` §10.3 đặt ở `Lead`) — xem OQ-G3 |
| Ghi chú rớt — **THÊM MỚI** `LeadChild.lostNote` · `Text?` | `lead_student` | Cùng tầng với lý do rớt |
| Thời điểm rớt — **THÊM MỚI** `LeadChild.lostAt` · `DateTime?` | `lead_student` | Cùng tầng. grep `lostReason`/`lostAt` toàn `schema.prisma` = **0 kết quả** |
| Thời điểm chốt — **THÊM MỚI** `LeadChild.closedAt` · `DateTime?` | `lead_student` | C-03 tính *thời gian chốt = chốt − vào hệ thống*, đơn vị là **học sinh**. `Lead.convertedAt` (`:1347`) là mốc của cả lead — không thay được |
| Giá trị hợp đồng / doanh số — **THÊM MỚI** `LeadChild.contractValue` · `Int?` (VND) **+ đường nối tiền thật** (§6.4) | `lead_student` | 🔴 G-07 nói rõ *"doanh số ghi nhận theo từng học sinh"*. `contractValue` là **con số Sale cam kết**; **doanh số thực thu** phải suy từ `Payment` qua đường nối §6.4 — hai thứ khác nhau, đừng gộp |
| Campaign — **THÊM MỚI** `Lead.campaignId` · `String?` | `lead` | Quảng cáo dẫn tới **cuộc liên lạc**, không thuộc riêng đứa con nào |
| Ad set — **THÊM MỚI** `Lead.adsetId` · `String?` | `lead` | Như trên; cần cho phân bổ D-06/D-07 |
| Ad ID — **THÊM MỚI** `Lead.adId` · `String?` | `lead` | Như trên. `utm*` (`:1328-1332`) là **nhãn**, không phải ID Meta |
| UTM nguồn — **ĐÃ CÓ** `Lead.utmSource/utmMedium/utmCampaign/utmContent/utmTerm` · `String?` ×5 | `lead` | Giữ nguyên, không đụng |

#### 6.3.c — G-06 nhóm NÊN CÓ

| Trường (theo spec) | Thuộc | Lý do |
|---|---|---|
| Ngày hẹn follow-up kế tiếp — **THÊM MỚI** `Lead.nextFollowUpAt` · `DateTime?` | `lead` | Sale hẹn gọi lại cho **PH**, không hẹn riêng từng con. Hôm nay chỉ gián tiếp qua `LeadTask.dueAt` (`:3550`) — bảng việc, không phải thuộc tính lead |
| Mức độ tiềm năng (Nóng/Ấm/Lạnh) — **THÊM MỚI** `Lead.potential` · enum `LeadPotential?` | `lead` | Đo mức sẵn sàng của **người quyết định chi tiền** = phụ huynh; dùng để xếp thứ tự chăm sóc |
| Kênh liên hệ ưu tiên (Gọi/Zalo/FB) — **THÊM MỚI** `Lead.preferredChannel` · enum `LeadContactChannel?` | `lead` | Thuộc tính liên lạc với người lớn |
| Số Zalo (nếu khác SĐT PH) — **THÊM MỚI** `Lead.zaloPhone` · `String?` | `lead` | Phương tiện liên lạc của người lớn. Chuẩn hoá bằng `canonicalPhone` (`lib/phone.ts`) như `phone` |
| Đã học thử: có/không — **ĐÃ CÓ** `LeadChild.trialStatus` · `LeadChildTrialStatus` (`:1476`, enum `:58`) | `lead_student` | Mỗi con học thử độc lập |
| Ngày học thử + kết quả — **ĐÃ CÓ** `LeadTrialHistory.firstAttendedAt` / `.lastAttendedAt` / `.outcome` (`:6117-6135`) | `lead_student` (bảng con) | Đã có bảng lịch sử đủ dùng, **không thêm cột**. ⚠️ Chỉ ghi khi đi qua `TrialClassV2` — xem OQ-G9 |
| Nhiều học sinh trên một PH — **ĐÃ CÓ** (cấu trúc `Lead 1–N LeadChild`, `:1463`) | cấu trúc | Chính là G-07 |
| Cờ trùng lặp (check theo SĐT) — **ĐÃ CÓ** bảng `LeadDuplicate` (`:3560`) | bảng riêng | Không phải cột trên lead. ⚠️ Chỉ được ghi ở **một** chỗ: `lib/lead/dedup.ts:37` (đường công khai). Đường nhập tay ở admin **không ghi** và còn bỏ sót `0…` — nợ N-3 |
| Lịch sử chuyển sale — **ĐÃ CÓ** 3 bảng rời (`LeadAssignmentHistory:5241` · `LeadTransfer:3503` · `LeadActivity` type `HANDOVER`) | bảng riêng, cấp `lead` | Sale phụ trách là thuộc tính cấp PH ⇒ lịch sử cũng cấp PH. ⚠️ 3 đường ghi khác nhau, không bảng nào phủ hết (§2.4) |

#### 6.3.d — 49 trường `Lead` đang có: phân loại đầy đủ

| Nhóm | Trường | Thuộc | Lý do |
|---|---|---|---|
| Khoá & hệ thống | `id` · `createdAt` · `updatedAt` · `deletedAt` · `eventId` (`:1338`, `@unique` — chống trùng webhook) | `lead` | Metadata bản ghi PH |
| Danh tính & liên lạc PH | `parentName` · `phone` · `email` | `lead` | §6.3.a |
| **Di sản 1 con** | `childName` (`:1313`) · `childAge` (`:1314`) | `lead` — **đọc-only, KHÔNG drop** | SL-15 + chú thích `:1459-1460`. Nguồn sự thật chuyển sang `LeadChild.fullName`/`ageYears`. Đo phạm vi ảnh hưởng: **109 lần xuất hiện / 28 file** (grep `childName\|childAge` trong `app/(admin)/admin/leads`, `app/api/admin/import/leads`, `app/api/admin/leads`, `app/api/leads`, `lib/lead`, `lib/crm`) |
| Phạm vi | `centerId` · `orgUnitId` | `lead` (+ nhân bản xuống `lead_student`) | §6.3.a |
| Khoá quan tâm (di sản cấp PH) | `courseId` (`:1317`) · `expectedCourseId` (`:1370`) · `expectedProductId` (`:1371`) · `orderKind` (`:1366`) | `lead` — giữ nguyên | Gợi ý loại đơn khi tạo `Order`; `Order` gắn ở cấp PH nên các cột này ở đúng tầng |
| Phân công & chia sẻ | `assignedToId` · `isSharedWithTeam` (`:1319`) · `sharedAt` · `sharedById` · `adminId` (`:1356`) | `lead` | "Dùng chung trong cơ sở" là thuộc tính của **hồ sơ PH** |
| Trạng thái cấp PH | `status` (`LeadStatus`, 15 giá trị) | `lead` — giữ nguyên | §6.5: **không** tái dùng cho con |
| Nguồn & quảng cáo | `source` · `utmSource` · `utmMedium` · `utmCampaign` · `utmContent` · `utmTerm` · `fbclid` · `gclid` · `fbp` · `fbc` · `landingPage` · `referrer` | `lead` | Bối cảnh của **cuộc liên lạc** |
| Kỹ thuật & đồng ý | `ipAddress` · `userAgent` · `consentMarketing` (`:1343`) | `lead` | Bằng chứng submit của người lớn |
| Ghi chú | `note` · `handoverNote` (`:1345`) | `lead` | §6.3.a |
| Mốc phễu SR.QD.217 | `qualifiedAt` · `handedAt` · `receivedConfirmedAt` · `assignedAt` · `firstContactAt` · `commissionSource` (`:1355`) | `lead` | Phễu vận hành trên **hồ sơ PH** |
| Chuyển đổi | `convertedById` · `convertedAt` | `lead` | Mốc "lead này đã convert". ⚠️ **Không** thay được `LeadChild.closedAt` — một lead 2 con có thể chốt 2 thời điểm |
| Giới thiệu | `affiliateId` | `lead` | §6.3.a |
| Nhịp chăm sóc | `lastActivityAt` | `lead` | §6.3.a; nợ N-4 |

#### 6.3.e — 14 trường `LeadChild` đang có

| Trường | Thuộc | Ghi chú |
|---|---|---|
| `id` · `leadId` · `createdAt` · `updatedAt` | `lead_student` | Khoá & metadata |
| `fullName` · `dob` · `ageYears` · `gender` | `lead_student` | Danh tính đứa trẻ. `gender` sai kiểu (OQ-G8) |
| `schoolName` · `gradeLevel` | `lead_student` | Trường/lớp ngoài |
| `interestedCourseId` · `interestedCenterId` | `lead_student` | Khoá + cơ sở **quan tâm** (chú thích `:1471-1472`: tham chiếu mềm, không FK cứng) |
| `note` | `lead_student` | Ghi chú riêng của con |
| `trialStatus` | `lead_student` | Học thử |

### 6.4 🔴 DOANH SỐ THEO TỪNG HỌC SINH — đường tiền hiện tại và cách nối

**Đường tiền hôm nay, đọc trên schema:**

```
Lead (:1309)
  └── Order.leadId  String?        (:3687, relation :3688, @@index :3758)   ← CHỈ có leadId
        └── Payment.orderId String (:5689, onDelete: Restrict)
              └── Payment.enrollmentId String?  (:5691, onDelete: SetNull)   ← nullable
                    └── Enrollment.leadChildId String?  (:1833, onDelete: SetNull) ← nullable
```

**`Order` KHÔNG có `leadChildId`.** Xác minh: model `Order` (`:3668-3762`) có `studentId` (`:3685`),
`leadId` (`:3687`), `centerId` (`:3690`) — không có trường nào trỏ `LeadChild`; các `@@index`
(`:3755-3762`) cũng không có.

**Có một đường vòng, nhưng nó thủng bốn chỗ.** `lib/finance/payment.ts:184`
`linkRecordedPaymentsToEnrollments` gắn `Payment.enrollmentId` cho các khoản `saleStatus: "RECORDED"`,
`enrollmentId: null`, `order.leadId = leadId` — và **chia theo trọng số** khi nhiều ghi danh
(`:210-245`, bất biến tổng qua `allocateByWeight`). Lỗ hổng:

| # | Lỗ hổng | Bằng chứng |
|---|---|---|
| 1 | Chỉ chạy ở **một** call-site và **một lần / lead** | Grep `linkRecordedPaymentsToEnrollments` = 1 caller: `lib/crm/convert-lead-v2.ts:337`. Chú thích `payment.ts:181-182`: *"Idempotent nhờ cổng convert … chỉ chạy 1 lần / lead"* |
| 2 | Đường convert **v1** không gọi nó | `lib/crm/convert-lead.ts` không import hàm này |
| 3 | `Enrollment.leadChildId` **null** với ghi danh không sinh từ convert | Chú thích schema `:1831-1832`: *"Enrollment tạo trực tiếp → null"*. Chỉ 2 chỗ set: `lib/crm/convert-lead-v2.ts:292`, `lib/crm/bulk-convert.ts:169` |
| 4 | Đơn **không sinh ghi danh** thì không bao giờ có `enrollmentId` | `Lead.orderKind` (`:1366`) có nhánh `PRODUCT` → `expectedProductId` (`:1371`); đơn bán học cụ không đẻ `Enrollment` |

⇒ **Không thể dựng C-03 trên đường vòng này.** Phải chốt một cách nối tường minh.

#### Hai phương án

| | **(a) `Order.leadChildId`** | **(b) Bảng `OrderLeadChildAllocation`** |
|---|---|---|
| Schema | `Order.leadChildId String?` + relation + `@@index([leadChildId])` | Bảng mới `(orderId, leadChildId, amount Int, centerId?, orgUnitId?)`, `@@unique([orderId, leadChildId])` |
| Loại migration | ADDITIVE, 1 cột | BẢNG MỚI |
| Một đơn cho **một** con | ✅ tự nhiên | ✅ 1 dòng |
| Một đơn cho **hai** con (combo anh em) | ❌ **không diễn đạt được** — phải tách thành 2 đơn | ✅ 2 dòng, tổng = `Order.totalAmount` |
| Doanh số theo con | `SUM(Payment.amount)` group by `Order.leadChildId` | Chia `Payment` theo tỷ lệ `amount` của bảng phân bổ |
| Rủi ro lệch sổ | Thấp (không có phép chia) | **Có**: tổng phân bổ phải luôn = `Order.totalAmount`; cần ràng buộc + test bất biến tổng |
| Sức nặng hiện thực | Nhỏ: sửa đường tạo đơn + backfill | Lớn: UI phân bổ, validate tổng, backfill đoán tỷ lệ |
| Ưu đãi/giảm giá cấp đơn | Không phải chia | Phải quyết chia theo tỷ lệ nào (`discountAmount` `:3699`) |
| Hỏng thế nào khi sai | Đơn combo bị quy hết về một con → con kia hiện doanh số 0 | Tổng phân bổ ≠ tổng đơn → **lệch sổ**, và lệch âm thầm |

**Khuyến nghị: (a) `Order.leadChildId`, kèm quy tắc vận hành "một đơn – một con".**

Lý do:

1. Repo **đã có tiền lệ chia tiền theo trọng số** và nó nằm ở tầng `Payment`, không phải `Order`
   (`payment.ts:210-245`). Thêm một cơ chế chia thứ hai ở tầng `Order` là hai nguồn sự thật cho cùng
   một câu hỏi "khoản này của ai".
2. Ràng buộc "một đơn – một con" ép được ở tầng UI/Server Action, rẻ hơn nhiều so với dựng bảng phân bổ
   + bất biến tổng + backfill đoán tỷ lệ.
3. (b) vẫn mở được sau, **additive**, nếu combo anh em trở thành ca thật (khi đó `Order.leadChildId`
   thành "con chính" và bảng phân bổ là chi tiết).

**Điều kiện đi kèm — không có thì phương án (a) cũng sai:**

- **Chốt nguồn số của "doanh số"**: theo **thực thu** = `SUM(Payment.amount)` với `saleStatus`/
  `accountantStatus` đúng trạng thái, **không** phải `Order.totalAmount`. Lý do: khu vực B đã chốt
  *"ghi nhận theo thực thu"* (spec §KHU VỰC B). Dùng `Order.totalAmount` cho C-03 và `Payment` cho B
  là hai con số vênh nhau trên cùng một màn hình.
- `LeadChild.contractValue` (§6.3.b) là **cam kết của Sale**, hiển thị riêng, **không** thay doanh số thực thu.
- Backfill đơn cũ: chỉ suy được `leadChildId` khi lead có **đúng một** `LeadChild`. Lead nhiều con →
  để `null` + đưa vào danh sách rà tay. **Đừng đoán.**
- 🔴 Chốt **trước** khi C-03 chạy. `A-nen-tang.md` §10.3 SL-09b nói đúng: chốt sau = quy lại toàn bộ đơn cũ bằng tay.

### 6.5 Enum trạng thái con — `LeadChildStatus` RIÊNG, không tái dùng `LeadStatus`

**Đề xuất:**

```prisma
enum LeadChildStatus {
  NEW              // Mới
  CONSULTING       // Đang tư vấn
  TRIAL_SCHEDULED  // Hẹn học thử
  TRIAL_ATTENDED   // Đã học thử
  ENROLLED         // Chốt
  LOST             // Rớt
}
```

Sáu giá trị khớp đúng sáu bước spec G-06 nêu (*Mới → Đang tư vấn → Hẹn học thử → Đã học thử → Chốt → Rớt*).

**Vì sao KHÔNG tái dùng `LeadStatus`:**

| Lý do | Bằng chứng |
|---|---|
| `LeadStatus` có **15** giá trị, đang mang **dữ liệu PROD** | `prisma/schema.prisma:37-55`. Luật cứng #4 cấm drop/đổi cột-enum trên bảng có dữ liệu prod ⇒ không thể rút còn 6 |
| Chỉ **6/15** được mã ghi tự động; 9 giá trị còn lại chỉ đổi tay | §2.3 (bảng đầy đủ nơi ghi) |
| 15 giá trị mang nghĩa **cấp PH** (`ASSIGNED`, `NO_ANSWER`, `DUPLICATE`, `NURTURING`) — vô nghĩa với một đứa trẻ | Không ai "gọi cho đứa trẻ mà không nghe máy" |
| Tái dùng ⇒ mỗi báo cáo tự chọn tập giá trị hợp lệ khác nhau | SL-14 đã cảnh báo đúng ca này cho cấp lead |
| Guard chuyển trạng thái hiện tại gắn chặt vào ngữ cảnh PH | `lib/leads/status.ts:117-133` chặn `→ REGISTERED` dựa trên `getLeadPaymentSummary(leadId)` — logic cấp lead, không cấp con |

**Quan hệ hai enum (chốt tường minh, tránh mỗi báo cáo hiểu một kiểu):**

| Sự kiện | `LeadChild.status` | `Lead.status` |
|---|---|---|
| Con ghi danh | `ENROLLED` + `closedAt` | Giữ đường hiện tại (`convert-lead*` set `ENROLLED`) |
| Con rớt, còn con khác đang chăm | `LOST` + `lostReasonId`/`lostAt` | **Không đổi** |
| **Mọi** con đều `LOST` | — | Cho phép Sale set `LOST` bằng tay; **không** tự động |
| Báo cáo C-02 "tỷ lệ thành công" | Đếm theo **con** | Không dùng |
| Chỉ tiêu C-01 | Spec đề xuất đếm **học sinh** | — |

⚠️ **Không** viết cron/trigger tự đồng bộ hai enum. Luật cứng Nền Hệ thống #8 cấm cron ghi thay đổi quyền;
tinh thần tương tự ở đây: suy diễn trạng thái là việc của **resolver lúc đọc**, không phải job ghi đè.

### 6.6 Hai bảng danh mục cấu hình được

Spec đòi "enum **cấu hình được**" ⇒ **bảng danh mục**, không phải enum Postgres (đổi enum = migration,
trái hẳn tinh thần "admin tự set" và trái luật cứng #4).

```prisma
model LeadLostReason {
  id           String   @id @default(cuid())
  code         String   @unique      // "TOO_FAR", "PRICE", "NO_TIME"
  label        String                // "Nhà quá xa cơ sở"
  isActive     Boolean  @default(true)
  displayOrder Int      @default(0)
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime @updatedAt @db.Timestamptz(6)

  @@index([isActive, displayOrder])
}

model LeadSource {
  id           String   @id @default(cuid())
  code         String   @unique      // "FB_ADS", "REFERRAL", "WALK_IN"
  label        String
  isActive     Boolean  @default(true)
  displayOrder Int      @default(0)
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime @updatedAt @db.Timestamptz(6)

  @@index([isActive, displayOrder])
}
```

**Cả hai KHÔNG mang `centerId`/`orgUnitId`** — danh mục dùng chung toàn hệ thống, không phải dữ liệu theo
đơn vị. Đây là cùng loại ngoại lệ mà `Affiliate` đang hưởng (`lib/db-scope.ts` `SCOPE_EXEMPT`, chú thích:
*"Affiliate là DANH MỤC nguồn giới thiệu dùng chung… inject `centerId IN [...]` sẽ ẩn mất mã toàn hệ thống"*).

**Về `Lead.source` (String tự do):** đo được — validator `actions.ts:575` cho phép chuỗi bất kỳ ≤100 ký tự,
mặc định `'Nhập tay'` (`:645`, `:673`), filter dùng `contains` (`page.tsx:119`), và **không tồn tại** hằng
số danh mục nào (grep `LEAD_SOURCE` / `SOURCE_OPTIONS` / `sourceOptions` = 0 kết quả).
⇒ 2-phase: thêm `Lead.sourceId` (nguồn sự thật mới), giữ `Lead.source` đọc-only để không vỡ báo cáo cũ,
map chuỗi cũ → `LeadSource.code` bằng bảng ánh xạ trong kế hoạch migration (file riêng).

**Không được xoá cứng dòng danh mục đã dùng.** Ẩn bằng `isActive = false`. Nếu FK là `Restrict` thì DB
đã chặn; nếu là `SetNull` thì xoá = mất lý do rớt lịch sử, tức mất chính thứ C-05/C-06 cần.

### 6.7 Cách ly cơ sở cho `lead_student` (SL-08)

`LeadChild` phải mang **cả hai** cột phạm vi:

```prisma
model LeadChild {
  // … 14 trường hiện có …
  centerId  String?   // ⚠️ BẮT BUỘC dù luật cứng #3 nói "bảng mới chỉ orgUnitId"
  orgUnitId String?
  @@index([centerId])
  @@index([orgUnitId])
}
```

Lý do phải có **cả** `centerId` — đây chính là **SL-00** trong `A-nen-tang.md` §10: `injectScope` **chỉ**
chèn `centerId: { in: [...] }` cho tới khi cờ cutover `orgScope.cutoverEnabled` được bật. Bảng chỉ có
`orgUnitId` sẽ có cột đẹp mà **không bao giờ được lọc**.

Ba việc đi kèm, thiếu một là hỏng im lặng:

1. Khai `"LeadChild"` vào `SCOPED_MODELS` (`lib/db-scope.ts:11`).
2. Khai vào `BACKFILL_SPECS` (`lib/org/center-bridge.ts:45`) với `nullMeaning: "BAT_BUOC"`, `scoped: true`,
   nguồn suy = `lead.centerId`. Quên → test `[US-07-IT-08b]` đỏ.
3. Thêm `"LeadChild"` vào `getModelPrefixes` (`lib/db-scope.ts:135-140`) trả `["leads:"]` — cùng họ quyền
   với `Lead`/`MessengerConversation`.
   ⚠️ Kèm hệ quả đã ghi ở `A-nen-tang.md` §6.3b: quyền `leads:*` cấp per-user sẽ nới luôn tầm nhìn model
   này. Rào chặn nằm ở A-03-7, không phải ở G.
4. `scopedDb` **không che write** (`lib/db-scope.ts:4-5`) ⇒ **mọi** `create` `LeadChild` phải tự set
   `centerId` + `orgUnitId`. Các đường tạo hiện có phải rà: `lib/lead/intake/ingest.ts:200`
   (`attachExtraChild`, đã có biến `centerId` trong tầm tay), và `addLeadChild` ở
   `app/(admin)/admin/leads/actions.ts`.

### 6.8 G-05 — chỉ định hướng (chi tiết ở `docs/migration/G-lead-migration-plan.md`)

Ở PRD này chốt **nguyên tắc**, không chốt bước:

| # | Nguyên tắc | Ràng buộc nguồn |
|---|---|---|
| 1 | **Additive trước, drop sau khi prod ổn định** (2-phase) | Luật cứng #4 + `.claude/rules/prisma-db.md` |
| 2 | `Lead.childName` / `Lead.childAge` **KHÔNG drop trong G** | SL-15 + chú thích schema `:1459-1460` |
| 3 | Không drop giá trị nào của `LeadStatus`; chốt **bảng ánh xạ** 15 → 6 | SL-14 |
| 4 | Mỗi bản ghi lead cũ → 1 `lead` + 1 `lead_student`; **không** tự động merge bản ghi trùng SĐT | Spec §G-06, mục "Hệ quả cần xử lý trong migration" |
| 5 | Bóc `note` (tỉnh/TP · địa chỉ · mã NV) ra cột thật là **backfill có thể sai** — phải dry-run, đối chiếu mẫu, giữ nguyên `note` gốc | Nợ N-1; định dạng do `map-sale-form.ts:122,127,130` sinh nên parse được, nhưng `note` cũng chứa cảnh báo tự do (`buildNote`, `ingest.ts:340`) |
| 6 | 🔴 **SL-09b + SL-12 khoá DANH SÁCH CỘT CUỐI CÙNG trước khi bật G-04** | `A-nen-tang.md` §10.5 mục 3: G-04 lưu cấu hình theo tên cột; đổi danh sách **sau** khi user đã lưu ⇒ cấu hình mồ côi |
| 7 | Người vận hành chạy tay trên PROD, có dry-run | Luật cứng #4 |
| 8 | ⚠️ `test.satarobo.vn` và máy local **dùng chung một DB** | `CLAUDE.md` — migration DROP/RENAME xoá dữ liệu đang làm việc ở local |

---

## 7. G-04 — TUỲ CHỌN CỘT KIỂU MISA (đặc tả đầy đủ)

### 7.1 Hiện trạng — không có gì để dựa vào

| Thứ cần | Có trong repo? | Bằng chứng |
|---|---|---|
| Model lưu preference theo user | ❌ **KHÔNG** | grep `Preference` / `columnPref` / `visibleColumns` / `SavedView` / `TableView` / `userSetting` trên `prisma/schema.prisma` = **0 kết quả** |
| `SystemSetting` có chiều `userId`? | ❌ | `:5546-5553` — `key` là `@id`, **toàn cục**, không có `userId` |
| `CenterSetting` có chiều `userId`? | ❌ | `:5556-5568` — `@@id([orgUnitId, key])`, theo **đơn vị**, không có `userId` |
| Thư viện kéo-thả | ❌ **KHÔNG CÓ** | `package.json`: grep `dnd` / `sortable` / `drag` = **0 kết quả**. Có `react-dropzone@^14.4.1` nhưng đó là **thả file để upload**, không phải sắp xếp danh sách |
| Tiền lệ kéo-thả **không cần thư viện** | ✅ **CÓ** | `app/(admin)/admin/leads/_components/leads-kanban.tsx` — HTML5 DnD thuần: `onDragOver:140` · `onDrop:146` · `draggable:173` · `onDragStart:174` · `onDragEnd:175` |
| Bảng lead hiện tại | Cột **cứng** trong JSX | `leads-table.tsx:391-415` — 7 `<th>` cố định: Phụ huynh/học sinh · Số điện thoại · Khóa quan tâm · Trạng thái · Cơ sở · Sale phụ trách · Ngày đăng ký (+ cột Hành động có điều kiện `showActions`) |

⇒ G-04 xây từ đầu, **và không được thêm thư viện** (`.claude/rules/ui-libraries.md`: *"NEVER auto-add.
Ask user first"*). Kéo-thả dùng HTML5 DnD thuần theo đúng khuôn kanban đã chạy trên prod.

### 7.2 Bảng lưu cấu hình

```prisma
/// G-04 — tuỳ chọn cột danh sách theo TỪNG USER (kiểu MISA).
/// ⚠️ CỐ Ý KHÔNG CÓ centerId/orgUnitId — xem chú thích dưới model.
model UserTablePreference {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tableKey  String                              // "admin.leads.list"
  columns   Json                                // xem §7.3
  pageSize  Int?                                // P2 — chưa dùng ở v1
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @db.Timestamptz(6)

  @@unique([userId, tableKey])
  @@index([userId])
}
```

| Cột | Kiểu | Bắt buộc | Vai trò |
|---|---|---|---|
| `id` | `String @id @default(cuid())` | ✅ | Khoá kỹ thuật |
| `userId` | `String` | ✅ | Chủ sở hữu. FK `User`, `onDelete: Cascade` — user nghỉ thì preference đi theo |
| `tableKey` | `String` | ✅ | Định danh bảng, có namespace: `admin.leads.list`. Cho phép tái dùng cho bảng khác mà **không** đổi schema (G-04-5) |
| `columns` | `Json` | ✅ | Cấu hình cột (§7.3) |
| `pageSize` | `Int?` | ❌ | Dành sẵn cho P2; v1 luôn `null` |
| `createdAt` / `updatedAt` | `DateTime @db.Timestamptz(6)` | ✅ | Theo quy ước timestamp của repo |

**Khoá duy nhất:** `@@unique([userId, tableKey])` — một user × một bảng = một dòng. Upsert theo khoá này.

**🔴 Bảng này CỐ Ý KHÔNG mang `centerId` / `orgUnitId`.**

Đây là **ngoại lệ có chủ đích của luật cứng Nền Hệ thống #3** (*"Mọi bảng mới có dữ liệu theo đơn vị BẮT
BUỘC có `orgUnitId`"*) và phải được viết ra, không để người sau tự đoán:

1. Dữ liệu ở đây là **sở thích cá nhân**, không phải dữ liệu nghiệp vụ theo đơn vị. Nó không trả lời câu
   hỏi "bản ghi này thuộc cơ sở nào" — nó trả lời "người này thích nhìn thấy gì".
2. Cách ly đã đủ và mạnh hơn: **mọi** truy vấn khoá cứng `userId = session.user.id`. Không có màn hình nào
   đọc preference của người khác, nên không có gì để `scopedDb` bảo vệ.
3. QLCS đa cơ sở (A-01) chỉ có **một** bộ cấu hình cột, không phải một bộ mỗi cơ sở — nếu mang `centerId`
   thì đúng người đó sẽ thấy cột nhảy loạn khi đổi bộ lọc phạm vi.
4. Khai vào `SCOPED_MODELS` sẽ **phản tác dụng**: `injectScope` chèn `centerId IN (...)` (`lib/db-scope.ts:277-279`)
   ⇒ cấu hình `centerId = null` biến mất khỏi chính chủ nhân của nó.

Đây đúng là ngoại lệ mà `A-nen-tang.md` §10 SL-00 đã dự phòng: *"bảng không phải dữ liệu theo đơn vị
(vd sở thích cá nhân — SL-13) thì không mang cột nào cả"*.

**Không thêm permission key mới.** Không cần `can()` cho preference của chính mình — nhưng Server Action
vẫn phải `auth()` ở dòng đầu và **lấy `userId` từ session**, tuyệt đối không nhận từ payload.

### 7.3 Hình dạng JSON `columns` — ví dụ dữ liệu THẬT

```json
{
  "v": 1,
  "visible": [
    "parentName",
    "phone",
    "child.fullName",
    "child.status",
    "center",
    "assignedTo",
    "lastActivityAt"
  ],
  "hidden": [
    "email",
    "source",
    "child.interestedCourse",
    "createdByCode",
    "child.contractValue"
  ]
}
```

| Khoá JSON | Kiểu | Ý nghĩa |
|---|---|---|
| `v` | `number` | Phiên bản hình dạng. Bản ghi thiếu `v` hoặc `v` lạ ⇒ **coi như chưa có cấu hình**, dùng mặc định. Cho phép đổi hình dạng sau mà không migrate JSON |
| `visible` | `string[]` | Cột hiện, **theo đúng thứ tự này** (thứ tự mảng = thứ tự cột trên màn hình) |
| `hidden` | `string[]` | Cột user đã **chủ động** tắt. Cần tách khỏi "chưa biết" để phân biệt với cột mới thêm sau |

**Vì sao cần cả `hidden`, không chỉ `visible`:** nếu chỉ lưu `visible`, mọi cột mới thêm vào hệ thống sẽ
**không bao giờ** xuất hiện với user đã lưu cấu hình — họ phải tự vào bật. Có `hidden` thì phân biệt được
ba trạng thái: *đang hiện* · *đã tắt có chủ ý* · *chưa biết đến* (→ dùng `defaultVisible` của catalog).

Khoá cột dùng **dấu chấm** để phân tầng: không tiền tố = cột cấp `lead`; tiền tố `child.` = cột cấp
`lead_student`. Đây là mã định danh **của catalog**, không phải tên cột DB — đổi tên cột DB không làm
hỏng cấu hình đã lưu.

### 7.4 "Mặc định" định nghĩa ở đâu

**Hằng số tầng mã**, không phải bản ghi DB. Đề xuất `lib/tables/lead-columns.ts`:

```ts
export type TableColumnDef = {
  key: string;            // "parentName" | "child.fullName"
  label: string;          // nhãn tiếng Việt
  defaultVisible: boolean;
  defaultOrder: number;   // thứ tự khi chưa có cấu hình / khi chèn cột mới
  pii?: boolean;          // true ⇒ giá trị vẫn qua mask theo leads:view-pii
  scope: "lead" | "child";
};

export const LEAD_TABLE_KEY = "admin.leads.list";
export const LEAD_TABLE_COLUMNS: readonly TableColumnDef[] = [ /* … */ ];
```

Vì sao là hằng số tầng mã, không phải bảng DB:

- Cột chỉ tồn tại khi **có mã render nó** — để catalog trong DB thì admin thêm được dòng "cột X" mà không
  có cột X nào để hiện.
- Mặc định đổi theo đợt phát hành, đi cùng mã, review được trong PR.
- Không đẻ thêm màn quản trị và một migration nữa cho thứ không ai sửa lúc vận hành.

**Mặc định v1 = 7 cột đang cứng trong `leads-table.tsx:391-415`** (`defaultVisible: true`), mọi cột mới của
G-01/G-06 vào catalog với `defaultVisible: false`. Bảng hôm nay của mọi người **không đổi hình dạng** sau
khi bật G-04 — đây là lựa chọn cố ý: bật tính năng không được làm giao diện của ai nhảy.

**Nút "Khôi phục mặc định"** = xoá dòng `UserTablePreference` của `(userId, tableKey)` → lần render sau
rơi về `LEAD_TABLE_COLUMNS`. Không ghi một JSON "bản mặc định" vào DB — làm vậy thì mặc định bị **đóng
băng** ở thời điểm bấm nút, và đợt sau thêm cột thì người đã bấm "khôi phục" lại là người **không** nhận
được cột mới.

### 7.5 🔴 Quy tắc cấu hình mồ côi (khoá lạc) — bắt buộc

Cột bị gỡ khỏi hệ thống trong khi user đã lưu nó. Quy tắc, áp **ở tầng render**, không ở tầng DB:

| Tình huống | Xử lý | Vì sao |
|---|---|---|
| Khoá trong `visible`/`hidden` **không có** trong catalog | **Bỏ qua im lặng** khi render. **Giữ nguyên** trong DB, không tự dọn | Cột có thể tạm ẩn sau cờ tính năng; xoá ngay = mất cấu hình khi cờ bật lại. Không log lỗi — đây là trạng thái hợp lệ, không phải sự cố |
| Cột **có** trong catalog nhưng **không** ở cả `visible` lẫn `hidden` (cột mới) | Chèn theo `defaultVisible`; nếu hiện thì đặt vào vị trí `defaultOrder` giữa các cột đang hiện | Người dùng nhận được cột mới mà không mất cấu hình cũ |
| Sau khi lọc, `visible` **rỗng** | Dùng nguyên bộ mặc định | Không bao giờ render bảng 0 cột |
| `columns` không parse được / `v` lạ / không phải object | Dùng mặc định, **không** throw | Một dòng JSON hỏng không được làm chết trang danh sách lead |
| User bấm **Lưu** | Ghi đè bằng **tập khoá hợp lệ hiện tại** (khoá lạc bị loại khỏi bản ghi mới) | Tự dọn theo nhịp người dùng, không cần cron dọn rác |
| Cột `pii: true` mà user bật | Vẫn qua mask server theo `leads:view-pii` (`lib/lead/pii.ts:42-51`) | **Tuỳ chọn cột không phải cổng quyền** — G-04-4 |

Ràng buộc validator (Zod, `lib/validators/table-preference.ts`):

- `tableKey` ∈ danh sách khoá bảng đã đăng ký (`z.enum`), không nhận chuỗi tự do từ client.
- Phần tử `visible`/`hidden`: chuỗi ≤ 64 ký tự, tổng số phần tử ≤ 64 (chặn nhồi JSON).
- `visible` không được trùng phần tử; một khoá không được đồng thời ở `visible` và `hidden`.
- Validator **không** từ chối khoá lạc — chỉ từ chối khoá **sai định dạng**. Từ chối khoá lạc sẽ khoá cứng
  user ra khỏi màn hình sau khi một cột bị gỡ.

### 7.6 Cơ chế thao tác (UI)

| Yêu cầu spec | Cách làm | Ràng buộc |
|---|---|---|
| Nút "Tuỳ chọn cột" trên danh sách lead | Nút mở popover/dialog cạnh bộ lọc hiện có ở `app/(admin)/admin/leads/page.tsx` | shadcn/ui thuần (`.claude/rules/admin-site.md`: admin = shadcn/ui + Recharts) |
| Chọn trường hiển thị | Danh sách checkbox theo catalog, nhóm theo `scope` (Phụ huynh / Học sinh) | — |
| **Kéo thả sắp xếp thứ tự** | HTML5 DnD thuần theo khuôn `leads-kanban.tsx:140-176` (`draggable` + `onDragStart`/`onDragOver`/`onDrop`/`onDragEnd`) | **KHÔNG** thêm thư viện |
| Xoá cột | Nút `X` trên từng chip trong danh sách "đang hiện" → chuyển sang `hidden` | Khác với "gỡ khỏi hệ thống" — chỉ đổi chỗ giữa 2 mảng |
| Nút khôi phục mặc định | Gọi `resetLeadTableColumnsAction()` → `deleteMany({ where: { userId, tableKey } })` | §7.4 |
| Lưu | Server Action `saveTableColumnsAction(tableKey, columns)` → `upsert` theo `[userId, tableKey]` | `auth()` dòng đầu; `userId` **từ session** |
| Bàn phím / a11y | Kéo-thả HTML5 **không** dùng được bằng bàn phím ⇒ phải có nút "▲/▼" đổi thứ tự | `eslint-plugin-jsx-a11y` đang bật trong `package.json` |

**Mobile 375px:** dialog tuỳ chọn cột phải dùng được; kéo-thả trên cảm ứng thì HTML5 DnD **không chạy** —
nút ▲/▼ là đường chính trên mobile, kéo-thả là tiện ích trên desktop. (`.claude/rules/client-site.md`:
viewport 375px must work.)

---

## 8. Open Questions

| # | Câu hỏi | Vì sao chặn | Chủ | Hạn |
|---|---|---|---|---|
| **OQ-G1** | 🔴 Chốt **(a) `Order.leadChildId`** hay **(b) bảng `OrderLeadChildAllocation`**? | Toàn bộ C-03 đứng trên đây. Chốt sau khi báo cáo chạy = quy lại toàn bộ đơn cũ bằng tay (SL-09b). PRD khuyến nghị (a) + quy tắc "một đơn – một con" | Chủ dự án | **Trước dòng code đầu tiên của G** |
| **OQ-G2** | 🔴 "Doanh số theo học sinh" lấy từ **`Payment` thực thu** hay **`Order.totalAmount`**? | Khu vực B đã chốt *thực thu*. Nếu C-03 dùng `Order.totalAmount` thì hai tab cùng màn hình cho hai con số khác nhau. PRD khuyến nghị `Payment` | Chủ dự án | Cùng OQ-G1 |
| **OQ-G3** | 🔴 **Lý do rớt** đặt ở `lead_student` (PRD này) hay `Lead` (SL-10 trong `A-nen-tang.md` §10.3)? | Hai tài liệu đang lệch nhau. G-07 nói trạng thái chốt theo học sinh ⇒ rớt cũng theo học sinh; nhưng C-06 viết "sale đổi trạng thái **lead** sang Rớt". Chốt sai = phải migrate cột sang bảng khác sau khi có dữ liệu | Chủ dự án | Trước khi sinh migration G |
| **OQ-G4** | Khi **mọi** con đã `LOST`, `Lead.status` có tự chuyển `LOST` không? | PRD đề xuất **không** tự động (§6.5). Nếu chủ dự án muốn tự động thì phải quyết nơi chạy (resolver lúc đọc vs job ghi) và ai chịu trách nhiệm số liệu | Chủ dự án | Trước khi code C-02 |
| **OQ-G5** | Một lead có bao nhiêu con là **thực tế tối đa**? Có cần trần không? | Ảnh hưởng UI bảng con và cách hiển thị doanh số gộp trên dòng lead | Chủ dự án | Trước khi code G-07 UI |
| **OQ-G6** | Danh mục **lý do rớt** ban đầu gồm những giá trị nào? Danh mục **nguồn lead** gồm những gì? | Spec ghi rõ hai giá trị này *"đang để trống trong Cấu hình vận hành"*. Không có danh sách thì G-06-1 không nghiệm thu được, và migrate `Lead.source` (String tự do) không có đích để map | Chủ dự án + Marketing | Trước khi seed danh mục |
| **OQ-G7** | 🔴 **Người nhập lead** hiển thị theo dạng `mãNV_tên` (spec G-01). Lưu 2 cột (`createdById` + `createdByCode`) hay 1 chuỗi ghép? | PRD đề xuất 2 cột (`createdById` để nối `User`, `createdByCode` để giữ mã kể cả khi người đó nghỉ). Chuỗi ghép thì không join được | Chủ dự án | Trước khi sinh migration G |
| **OQ-G8** | `LeadChild.gender` (`String?` tự do) có chuẩn hoá về enum `Gender` không? | Đổi kiểu cột đang có dữ liệu PROD ⇒ luật cứng #4 ⇒ phải 2-phase (thêm cột enum, backfill "Nam"→`MALE`, đọc song song, drop sau). Có đáng làm trong G không, hay để nợ? | Chủ dự án | Trước khi sinh migration G |
| **OQ-G9** | Học thử **không** đi qua `TrialClassV2` (xếp tay, buổi lẻ) có cần chỗ lưu riêng không? | Hôm nay "ngày học thử + kết quả" chỉ có ở `LeadTrialHistory` (`:6117`), mà bảng đó gắn cứng `trialClassId` (`:6119`). Không có ca ad-hoc thì bỏ qua; có thì cần 2 cột denormalize trên `LeadChild` | Chủ dự án / Vận hành | Trước khi code G-06 |
| **OQ-G10** | 🔴 Bảng nào là **nguồn sự thật** cho lịch sử chuyển sale trong 3 bảng đang có? | §2.4 — 3 bảng, 3 đường ghi, không bảng nào phủ hết; đường tự chia (`assign.ts`/`auto-assign.ts`) không ghi vào bảng nào. PRD đề xuất `LeadAssignmentHistory`. Chốt sai = tranh chấp hoa hồng vẫn không giải được | Chủ dự án | Trước khi code G-06-7 |
| **OQ-G11** | Bộ cột **mặc định** của danh sách lead sau G có giữ đúng 7 cột hiện tại không? | PRD đề xuất **giữ nguyên** (§7.4) để bật G-04 không làm giao diện của ai nhảy. Nếu chủ dự án muốn đổi mặc định thì phải chốt **trước** khi user bắt đầu lưu cấu hình | Chủ dự án | Trước khi bật G-04 |
| **OQ-G12** | File **xuất Excel** có theo cấu hình cột của người xuất không, hay luôn xuất bộ cột cố định? | Spec không nói. Theo cấu hình thì hai người xuất ra hai file khác nhau — khó đối chiếu. PRD nghiêng về **bộ cột cố định**, tách khỏi G-04 | Chủ dự án | Trước khi làm G-03 |

---

## 9. Timeline & Phasing

Theo spec, thứ tự thi công là **A → F → G → C/D/B → E**; G độc lập với F nên chạy song song được.
Trong nội bộ G:

| Bước | Nội dung | Phụ thuộc | Ghi chú |
|---|---|---|---|
| **G.0** | Trả lời **OQ-G1, OQ-G2, OQ-G3, OQ-G7** | — | 🔴 Bốn câu này khoá **danh sách cột cuối cùng**. Không có chúng thì G.2 sinh migration sai |
| **G.1** | Test đỏ trước: cách ly `LeadChild` theo cơ sở · dedup `0…`/`84…` · doanh số theo con | G.0 | Luật cứng Nền Hệ thống #5: *"Story chưa có test đỏ thì chưa được viết Server Action"* |
| **G.2** | Migration additive: SL-08 (`LeadChild.centerId/orgUnitId`) → SL-09 (`LeadChildStatus`, `closedAt`, `contractValue`) → **SL-09b** (đường nối tiền) → SL-10 (nhóm bắt buộc G-06) → SL-11 (2 bảng danh mục) → SL-12 (6 trường G-01 còn thiếu) → SL-13 (`UserTablePreference`) | G.1 | Additive **toàn bộ**. Khai `SCOPED_MODELS` + `BACKFILL_SPECS` + `getModelPrefixes` cùng lúc với cột |
| **G.3** | Đường ghi: ngừng nhét `note`, tách người-nhập khỏi sale-phụ-trách, set `centerId` cho mọi `create` `LeadChild` | G.2 | Vá N-1, N-2 |
| **G.4** | G-02: mở rộng form sửa + mục "Lịch sử thay đổi" đọc `AuditLog` trên trang chi tiết lead | G.3 | Audit đã có; việc là UI |
| **G.5** | Vá N-3 (dedup `phoneVariants`) + N-4 (`lastActivityAt` một helper) | G.2 | N-4 là **điều kiện cần của C-05** |
| **G.6** | G-04: catalog cột + bảng preference + dialog + kéo-thả HTML5 + nút khôi phục | G.2 **và** danh sách cột đã khoá (G.0) | 🔴 Bật G-04 **sau** khi danh sách cột chốt — nếu không, cấu hình user lưu hôm nay thành mồ côi ngày mai |
| **G.7** | G-03: bổ sung cột mới vào file xuất | A-03 xong | Quyền/định dạng thuộc khu vực A |
| **G.8** | G-05: chạy kế hoạch migration ở `docs/migration/G-lead-migration-plan.md` | G.3–G.6 ổn định | Người vận hành chạy tay trên PROD, có dry-run (luật cứng #4) |
| **G.9** | Cập nhật `documentation/` phần đã làm + liệt kê file đổi | G.2–G.8 | Luật cứng Nền Hệ thống #10 |

**Ràng buộc môi trường:** `test.satarobo.vn` và máy local **dùng chung một DB** (`CLAUDE.md`). Toàn bộ G.2
là additive nên an toàn; bước drop (giai đoạn sau G) mới là bước phải cẩn thận.

---
