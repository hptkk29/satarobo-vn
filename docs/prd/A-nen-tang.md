# PRD — KHU VỰC A: Nền phạm vi & phân quyền QLCS

**Trạng thái:** Draft
**Nguồn spec (đã chốt):** `docs/specs/spec-dashboard-qlcs-duyet-media-lead.md` — KHU VỰC A (A-01, A-02, A-03)
**Phạm vi:** CHỈ A-01, A-02, A-03. Không mở rộng sang B/C/D/E/F/G.
**Nhánh khảo sát:** `hptkk29/runhop20_08`

> Mọi khẳng định hiện trạng trong PRD này đều kèm `file:dòng` đọc trực tiếp từ mã nguồn.
> Tài liệu hiện trạng đầy đủ: `documentation/architecture.md`, `documentation/permissions.md`.

---

## 0. Quyết định chủ dự án — 24/08/2026 (THẮNG phần thân bài)

Nguồn: `docs/plan/cau-hoi-can-quyet.md` §"Quyết định của chủ dự án — chốt 24/08/2026".

| Mã | Quyết định | Ảnh hưởng trong PRD này |
|---|---|---|
| **B1** | Bảng mới mang **CẢ HAI** `centerId` + `orgUnitId` | SL-00 **đóng** — không còn là mâu thuẫn cần chốt |
| **B4** | `Order.leadChildId` (phương án **(a)**), một đơn – một con | SL-09b **đóng** |
| **12(b)** | Lý do rớt = **ô ghi chú tự do**, KHÔNG danh mục | SL-10 bỏ `lostReasonId`; SL-11 chỉ còn `LeadSource` |
| **B5** | Ô ghi chú lý do rớt đặt ở **`Lead`** | ✅ **SL-10 giữ nguyên tầng như đang viết** — `G-lead.md` §6.3.b là bên phải sửa |
| **OQ-4** | **Mặc định GỘP, có công tắc "Tách theo cơ sở"** *(sửa lần 2 trong ngày — bản đầu ghi "không tách", chủ dự án đã chỉnh)* | Truy vấn của B/C/D/E phải nhận tham số `groupByCenter` và trả **được cả hai dạng**. Công tắc chỉ hiện khi đang chọn ≥ 2 cơ sở |
| **OQ-5** | Prod **đã có** QLCS đa cơ sở thật: **anh Phúc — vừa QLCS vừa `SUPER_ADMIN`** | 🔴 Nâng **SL-01** thành việc gấp, **giữ đủ V-1 → V-2 → V-3**. ⚠️ Hai hệ quả ở §6.9.1: (a) **không nghiệm thu A-01 bằng tài khoản anh Phúc** — `SUPER_ADMIN` luôn xanh dù A-01 hỏng; (b) mất dòng `UserOrgRole` ⇒ anh ấy **âm thầm rời nhóm chat lớp của cơ sở thứ hai** trong khi dashboard vẫn đủ |
| **OQ-7** | **MỞ `roles:assign` cho `HO_HR`** *(sửa lần 2 trong ngày — bản đầu ghi "giữ chỉ SUPER_ADMIN")* | Seed thêm quyền cho `HO_HR` + **3 rào chống nhân bản quyền** (xem §6.10). ⚠️ Sau khi merge `test` → `main` **phải chạy `seed-prod-roles.yml`**, quên là HR trên prod vẫn không gán được |
| **OQ-8** | Cơ sở của một QLCS **có thể thuộc vùng khác thật** | Phải có **REGION thứ hai** trong dữ liệu (hiện chỉ `DANANG`) cho e2e A-01; cây `HO → REGION → CENTER` giữ nguyên, không hardcode vùng |
| **OQ-B9** | Range mặc định tab B = **"01 → hôm nay"**, như 3 tab kia | Bốn tab dùng chung đúng một bộ lọc; đổi tab không nhảy số |
| **B11** | "Từ cấp quản lý trở lên" = QLCS → quản lý khu vực → giám đốc | OQ-2 **đóng**; A-03 v1 chỉ dựng được 2/3 tầng (xem OQ-2) |
| **B12** | Xuất lead đổi sang **`.xlsx`** (SheetJS đã có) | OQ-6 **đóng** |
| **B3** | "Thực thu" = `Payment` CONFIRMED toàn hệ thống | SL-09b bỏ phần "chốt nguồn số": nguồn số là `Payment` |

⏳ **Còn treo, ảnh hưởng trực tiếp A/G:** **OQ-8** (cơ sở thứ hai của QLCS có thuộc REGION khác thật không —
chặn dữ liệu test A-01) · danh mục **nguồn lead** (`LeadSource` chưa có giá trị nào).

🔴 **Việc MỚI sinh ra từ OQ-5:** đo prod → backfill `UserOrgRole` cho cấu hình đa cơ sở đang gán tay, và
làm **SL-01 trước** khi đụng vào hai màn `users/_actions.ts` / `nhan-su/actions.ts`.

---

## 1. Executive Summary

Khu vực A là **nền** của cả đợt phát triển: A chặn B, C, D, E (theo "Thứ tự thi công đề xuất" của spec). Ba việc:

- **A-01** — một tài khoản QLCS được gán N cơ sở, các cơ sở **không bắt buộc cùng vùng**.
- **A-02** — một bộ lọc phạm vi (chọn cơ sở + khoảng ngày) dùng chung cho cả 4 tab dashboard.
- **A-03** — quyền xuất Excel lead **gán được cho từng quản lý**, admin bật/tắt, **không hard-code theo role**.

**Kết luận khảo sát:** phần lớn nền đã có sẵn trong repo. A-01 **không cần đổi schema**. A-02 là **mở rộng** cặp `lib/reports/filters.ts` + `components/admin/report-filter-bar.tsx` đang phục vụ 8 trang báo cáo, không phải xây mới. A-03 có sẵn **hai** cơ chế cấp quyền ngoài role và có sẵn màn quản trị cho cả hai — việc còn lại là chọn một cơ chế và nối `leads:export` (hiện là **key chết**) vào call-site thật.

---

## 2. Background & Context

### 2.1 Hai thế hệ RBAC đang chạy chồng nhau

| Thế hệ | Bảng | Engine | Có DENY? |
|---|---|---|---|
| Cũ (A0-02/A0-03) | `RoleDef` + `RolePermission` + `UserOrgRole` + `UserPermissionGrant` | `lib/auth/can.ts` (v2) / `lib/auth/permissions.ts` (v1 ma trận tĩnh) | **KHÔNG** — ALLOW-wins thuần (`lib/auth/can.ts:52-59`) |
| Mới (Nền Hệ thống P0, US-01..US-04) | `PermissionDescriptor` + `PermissionGrant` + `UserGroup`/`UserGroupMember` | `lib/permissions/can.ts` | **CÓ** (`lib/permissions/can.ts:118-122`) |

Đường chạy thật: `lib/auth/check-permission.ts` → `lib/auth/permission-decision.ts` → tra `PermissionGrant` **trước**; hit thì grant là nguồn sự thật; miss thì rơi xuống `evaluatePermission` (v1/v2 + shadow).

⚠️ Hai bảng tên gần giống nhau, hành vi khác hẳn — `UserPermissionGrant` (cũ, per-user, **toàn cục**) và `PermissionGrant` (mới, per-ROLE/GROUP, có `dataScope` + `fieldMask`). Engine mới **cố ý không đọc bảng cũ** (`lib/permissions/can.ts:3-5`).

### 2.2 Cây tổ chức

`OrgUnitType` có 8 giá trị: `ROOT | HO | REGION | DEPARTMENT | CENTER | CAMPUS | PARTNER | FRANCHISE`. Hình cây thật sau reshape P1 (11/08/2026): **HO (gốc) → REGION → CENTER**, materialized path dạng `/ho/danang/cs1/`.

Đơn vị đo quyền **lúc chạy vẫn là `Center.id`** (cột `centerId`); `orgUnitId` mới chỉ ghi song song (`lib/org/dual-write.ts`) và đối soát bằng cron. Cutover sang `orgUnitId` có cờ `SystemSetting("orgScope.cutoverEnabled")`, mặc định TẮT (`lib/auth/actor.ts:97-105`).

### 2.3 Cách ly dữ liệu

`scopedDb(actor)` tự chèn `centerId IN (visibleCenterIds)` cho `SCOPED_MODELS` (`lib/db-scope.ts:2`). `Lead` và `Payment` đều nằm trong `SCOPED_MODELS` (`lib/db-scope.ts:11-56`).

⚠️ `scopedDb` **chỉ che 7 method đọc top-level**. Mọi `create/update/delete/updateMany` không được che; nested `include` cũng không (`lib/db-scope.ts:4-5`).

---

## 3. Objectives & Success Metrics

### Goals

1. Một tài khoản QLCS gán được N cơ sở **khác vùng**, và khi đăng nhập nhìn thấy **đúng hợp** dữ liệu của N cơ sở đó — không nhiều hơn (không rò sang cơ sở thứ N+1), không ít hơn (không bị rơi về 1 cơ sở).
2. Bốn tab dashboard dùng **cùng một** component lọc và **cùng một** resolver phạm vi phía server; đổi tab không mất bộ lọc.
3. Admin bật/tắt quyền xuất Excel lead **cho từng quản lý cụ thể**, không phải sửa role, không phải deploy.

### Non-Goals (cố ý không làm trong A)

1. **Không** cutover đơn vị đo từ `centerId` sang `orgUnitId` — đó là việc P4/US-13, có cờ riêng.
2. **Không** vá nhánh DENY thiếu của `can()` v2 (`lib/auth/can.ts`) — A-03 đi đường không cần DENY (xem §6.3).
3. **Không** dọn hết 78 call-site / 44 file đọc `session.user.centerId` trên toàn repo. **Nhưng A BẮT BUỘC dọn** các cổng **GHI** trên đường đi của 4 tab dashboard, của điểm danh/chốt buổi, và của luồng export lead (xem A-01-6) — nếu không, A xanh hết chỉ số mà QLCS 2 cơ sở vẫn không làm việc được ở cơ sở thứ hai.
4. **Không** thêm thư viện date-picker mới. Cả repo đang dùng `<input type="date">` native ở 36 file; thêm `react-day-picker`/shadcn Calendar vi phạm `.claude/rules/ui-libraries.md` ("NEVER auto-add. Ask user first").
5. **Không** xây tab/nội dung của B, C, D, E — A chỉ giao **khung lọc** và **khung quyền**.
6. **Không** đổi `Lead` schema — đó là khu vực G.

### Success Metrics

| Chỉ số | Hiện tại | Đích | Cách đo |
|---|---|---|---|
| QLCS đa cơ sở thấy đúng tập cơ sở được gán | Không đo được (chưa có QLCS đa cơ sở) | 100% | e2e: user gán CS1+CS2 khác REGION → `visibleCenterIds` đúng 2 phần tử; đọc `Lead` trả đúng 2 cơ sở, cơ sở thứ 3 = 0 dòng |
| Rò dữ liệu chéo cơ sở qua bộ lọc | Chưa có test | 0 | e2e: truyền `?center=<id ngoài phạm vi>` → bị bỏ qua, không lỗi 500, không trả dữ liệu |
| Số trang dashboard dùng chung 1 resolver lọc | 0/4 | 4/4 | grep: 4 tab đều gọi `resolveScopeFilters()` |
| Quản lý được cấp `leads:export` riêng lẻ | 0 (key chết) | Bật/tắt trong ≤1 phút, không deploy | Thao tác trên `/admin/user-groups`, kiểm bằng gọi endpoint export |
| Người **không** được cấp gọi endpoint export | Hiện **bất kỳ ai có `leads:view-all`** đều xuất được | 403 | e2e: QLCS không thuộc nhóm → 403 |
| QLCS đa cơ sở **GHI** được ở cơ sở thứ hai | Không (10 cổng so với `user.centerId` đơn trị) | 100% | e2e: điểm danh + chốt buổi một lớp ở cơ sở thứ hai → thành công |
| Cấp `leads:*` per-user làm rò lead toàn hệ thống | **Có thể** (không có rào) | Bị chặn | e2e: thử cấp `leads:export` ở `/admin/users/[id]/permissions` → bị từ chối |

---

## 4. Target Users & Segments

| Vai | Ai | Cần gì từ A |
|---|---|---|
| **QLCS đa cơ sở** (`CENTER_MANAGER` giữ N cơ sở) | Quản lý phụ trách nhiều hơn 1 cơ sở, có thể khác tỉnh/TP. **Đã tồn tại trên prod, đang gán tay** (OQ-5, 24/08/2026) | A-01 + A-02: số **gộp theo đúng phạm vi đang chọn** — chọn tất cả thì gộp hết, chọn một cơ sở thì chỉ cơ sở đó (OQ-4) |
| **QLCS đơn cơ sở** | Đa số hiện tại | Không được hồi quy: vẫn chỉ thấy cơ sở mình |
| **SUPER_ADMIN / cấp Hội sở** | Ban giám đốc, kế toán HO, marketing HO | Chọn "Tất cả cơ sở"; bật/tắt quyền export cho từng quản lý |
| **Sale (`SALES_CSM`)** | Nhân viên tư vấn | **Không** được xuất Excel lead trừ khi được cấp riêng (spec: "chỉ từ cấp quản lý trở lên") |

Quy mô hiện tại: HO + CS1 (211 Nguyễn Hữu Thọ) + CS2 (114 Hoàng Diệu). Thiết kế phải chịu được CS3/CS4… **thêm bằng dữ liệu, không sửa mã** (CLAUDE.md).

---

## 5. User Stories & Requirements

### P0 — Must Have

| # | User story | Acceptance criteria |
|---|---|---|
| **A-01-1** | Là SUPER_ADMIN, tôi gán một tài khoản QLCS vào N cơ sở khác vùng, để người đó quản lý cả N. | Tại `/admin/users/[id]/org-roles`, thêm được N dòng `UserOrgRole` neo ở N `OrgUnit` type `CENTER` khác nhau, **khác REGION cha**. Không có ràng buộc nào chặn. Mỗi lần thêm ghi `RbacAuditLog` + `grantedById`. |
| **A-01-2** | Là QLCS đa cơ sở, tôi đăng nhập và thấy dữ liệu **hợp** của mọi cơ sở được gán. | `buildActor()` trả `visibleCenterIds` = hợp của N cơ sở (`lib/auth/actor.ts:268-286`). `scopedDb` đọc `Lead`/`Payment`/`Student` trả đúng N cơ sở. Cơ sở **không** được gán → 0 dòng. |
| **A-01-3** | Là SUPER_ADMIN, tôi **không** vô tình biến QLCS thành người thấy toàn hệ thống. | Form gán vai **chặn cứng** việc neo vai `CENTER_MANAGER` tại `OrgUnit` type `HO`/`ROOT`, kèm giải thích. Lý do: `isHoLevel` bật chỉ cần **một** dòng vai tại HO/ROOT, và khi đó `visibleCenterIds` = **mọi** cơ sở sống (`lib/auth/actor.ts:255, 278-281`). |
| **A-02-1** | Là người dùng dashboard, tôi chọn cơ sở (`all` hoặc nhiều cơ sở trong phạm vi được gán) và khoảng ngày. | Component render: (a) tuỳ chọn "Tất cả cơ sở" — hiện với **mọi** người có ≥2 cơ sở trong phạm vi, không chỉ HO; (b) multi-select trong đúng `visibleCenterIds`; (c) 2 ô `<input type="date">`. 🔴 Tuỳ chọn "Tất cả" **chỉ được bật cho tab nào mọi model của nó đã được `scopedDb` cách ly** — xem A-02-7. |
| **A-02-2** | Mặc định là `all` + từ ngày 01 tháng hiện tại → ngày hiện tại. | Không có searchParams → `centerIds = null` (nghĩa "toàn bộ phạm vi **cho phép của actor**"), `dateFrom` = ngày 01 tháng hiện tại theo giờ VN, `dateTo` = hôm nay cuối ngày. 🔴 `null` **KHÔNG** tự an toàn — xem A-02-7. |
| **A-02-3** | Bốn tab dùng lại đúng một component + một resolver. | 4 tab đều import cùng `components/admin/scope-filter-bar.tsx` và gọi cùng `resolveScopeFilters()` trong `lib/reports/filters.ts`. Đổi tab **giữ nguyên** bộ lọc (cùng searchParams). |
| **A-02-4** | Truyền cơ sở ngoài phạm vi qua URL không rò dữ liệu. | `?center=<id ngoài visibleCenterIds>` → bị loại im lặng, kết quả = phạm vi hợp lệ còn lại; không 500. (Giữ đúng hành vi chống IDOR sẵn có ở `lib/reports/filters.ts:67-73`.) |
| **A-02-7** | 🔴 Bật được "Tất cả cơ sở" cho một tab **chỉ khi** mọi model tab đó đọc đều đã cách ly được. | Trước khi giao khung lọc cho một tab: mọi model tab đó đọc **phải** nằm trong `SCOPED_MODELS`, **hoặc** có đường lọc tay + test cách ly. Model chưa cách ly được (`AdsInsightDaily`, `MarketingCostPeriod`, `Conversation`, `RevenueTarget`) ⇒ tab đó **chưa** được bật "Tất cả". Lý do: `injectScope` thoát ngay ở `lib/db-scope.ts:269` với model ngoài `SCOPED_MODELS` (§9/RT-2). |
| **A-01-6** | QLCS đa cơ sở **làm việc được** ở cơ sở thứ hai, không chỉ xem được. | Các cổng **GHI** trên đường dashboard + điểm danh phải chấp nhận mọi cơ sở trong `actor.visibleCenterIds`, không so với `session.user.centerId`. ✅ **ĐÃ LÀM 26/08/2026** cho **5** cổng: `canManageSessionClass` · `canManageSessionRecord` (`_feedback-core.ts` — cổng nhận xét, **chặn `completeSession`** nên bỏ sót là mở nửa vời) · `students/[id]/_actions.ts` · `lib/lms/skill-access.ts` · gate UI `students/[id]/edit/page.tsx` (không sửa thì server cho mà nút không hiện). ⚠️ **Luật đúng là `roleManagesCenter(actor, "CENTER_MANAGER", centerId)`** (`lib/auth/managed-centers.ts`), **KHÔNG** phải `visibleCenterIds`: vế đó nở theo vai kiêm nhiệm ⇒ QLCS@CS1 kiêm kế toán@CS2 sẽ ghi được lên CS2. 🔴 Còn ~13 cổng cùng khuôn chưa dọn — `docs/plan/ket-va-cach-go.md` K-18. e2e trình duyệt: chưa có. |
| **A-01-7** | Người vừa được gán cơ sở thứ hai không phải đoán vì sao chưa thấy gì. | `session.user.centerId` là **ảnh chụp lúc đăng nhập** (`lib/auth.ts:203-215`); `assignUserOrgRole` **không** bump `tokenVersion` (`lib/auth/rbac-service.ts:172-241`). ⇒ Hoặc bump `tokenVersion` khi gán/gỡ `UserOrgRole`, hoặc hiện cảnh báo "cần đăng xuất/đăng nhập lại" ngay trên màn gán vai. |
| **A-03-7** | 🔴 Không ai vô tình tắt được cách ly cơ sở của `Lead`. | Màn `/admin/users/[id]/permissions` **chặn cứng** mọi key khớp `leads:*` (mở rộng blocklist ở `app/(admin)/admin/users/[id]/permissions/_actions.ts:65-77`, hiện chỉ chặn `roles:*` + `users:manage`). Lý do: §6.3b. **Đây là yêu cầu, không phải câu hỏi mở.** |
| **A-03-1** | Là admin, tôi bật/tắt quyền xuất Excel lead **cho từng quản lý**. | Thao tác trên `/admin/user-groups`: thêm/bớt người khỏi nhóm mang grant `leads:export`. Có `reason` bắt buộc, ghi `RbacAuditLog`. Không sửa mã, không deploy. |
| **A-03-2** | Người không được cấp thì không xuất được. | `app/api/admin/leads/export/route.ts:29` yêu cầu **CẢ HAI** `leads:view-all` **AND** `leads:export`; thiếu bất kỳ cái nào → 403. 🔴 **Không được THAY THẾ** `leads:view-all` — xem §6.3 bước 1. |
| **A-03-3** | Quyền export **không** đến từ role. | `leads:export` bị **gỡ** khỏi mọi `RolePermission` seed và khỏi ma trận v1; không role nào tự có. |
| **A-03-4** | Dữ liệu xuất ra vẫn bị cách ly cơ sở. | File xuất chỉ chứa lead trong `visibleCenterIds` của người xuất — do query đi qua `scopedDb`, không do permission scope. |

### P1 — Should Have

| # | User story | Acceptance criteria |
|---|---|---|
| **A-02-5** | Bộ lọc dùng một quy ước URL duy nhất. | Chốt `?center=` (quy ước của `ReportFilterBar`); giá trị: `ALL` hoặc danh sách id ngăn cách dấu phẩy. Ghi rõ trong `documentation/` rằng ~14 trang khác vẫn dùng `?centerId=` và **không** đổi trong đợt A. |
| **A-03-5** | ~~Mọi lần xuất file lead đều để lại vết.~~ **ĐÃ CÓ SẴN — không phải làm.** | `app/api/admin/leads/export/route.ts:115-127` đã gọi `writeAudit({ action: 'EXPORT', newValues: { count, status, q, piiMasked } })`, kèm watermark dòng cuối (`:109`) và mask PII theo `canViewLeadPii()` (`:80, :90-102`). A-03 chỉ **giữ nguyên** phần này khi đổi gate. |
| **A-03-6** | Người xuất biết file có bị cắt bớt hay không. | Endpoint đang `take: 5000` **im lặng** (`app/api/admin/leads/export/route.ts:55`). Khi số dòng chạm trần phải báo rõ trên UI/file, không cắt âm thầm. |
| **A-01-4** | Màn gán vai cho biết người này đang giữ mấy cơ sở. | Trang `/admin/users/[id]/org-roles` hiện danh sách vai hiện có + tổng số cơ sở trong tầm nhìn suy ra. |

### P2 — Nice to Have / Future

| # | User story | Acceptance criteria |
|---|---|---|
| **A-02-6** | Preset khoảng ngày ("Tháng này", "30 ngày qua"). | Nút đặt sẵn giá trị vào 2 ô date hiện có — **không** thêm thư viện. |
| **A-01-5** | Dọn nốt các call-site `session.user.centerId` ngoài phạm vi dashboard. | 63 call-site / 39 file; xử lý dần theo module, không nằm trong A. |

---

## 6. Solution Overview

### 6.1 A-01 — QLCS đa cơ sở

**Câu hỏi bắt buộc trả lời: model hiện tại đã hỗ trợ 1 user ↔ N cơ sở khác vùng chưa?**

> **RỒI — ở tầng quyền và tầng truy vấn. Thay đổi schema tối thiểu = KHÔNG CÓ.**

Bằng chứng:

| Điểm | Bằng chứng | Kết luận |
|---|---|---|
| `UserOrgRole` khoá chính ghép `[userId, orgUnitId, roleId]` | `prisma/schema.prisma` model `UserOrgRole` | Một user gắn được **N dòng** ở N đơn vị |
| Không ràng buộc "cùng nhánh" | Không có unique/check nào trên `userId` đơn lẻ; không validator nào chặn | Gán **khác vùng** hợp lệ |
| `buildActor()` hợp nhất mọi dòng | `lib/auth/actor.ts:268` `for (const r of liveRows)` → `:281` `rowCenters.forEach(c => visible.add(c))` | `visibleCenterIds` = **hợp** N cơ sở |
| `scopedDb` lọc bằng mảng | `lib/db-scope.ts:2` `centerId IN visibleCenterIds`; `:228, :262` trả `actor.visibleCenterIds` | Truy vấn chịu được N cơ sở |
| `Lead`, `Payment` được cách ly | `lib/db-scope.ts:11-56` | Dữ liệu của A-03 và tab B đã nằm trong vòng cách ly |

**Vậy nghẽn nằm ở đâu?** Ở mã, không ở schema:

1. **Nghẽn cứng — `lib/reports/filters.ts:68`**
   `const defaultSelection = isGlobalAllowed ? "ALL" : (visibleCenters[0]?.id ?? "ALL")`
   Người **không** phải HO/SUPER mặc định bị ghim vào **cơ sở đầu tiên**. QLCS gán 2 cơ sở mở dashboard ra chỉ thấy 1.
2. **Nghẽn cứng — `lib/reports/filters.ts:70`**
   `if (requested === "ALL" && isGlobalAllowed) selection = "ALL"`
   `isGlobalAllowed = actor.isSuperAdmin || actor.isHoLevel` (`:54`). QLCS đa cơ sở **không phải** HO-level ⇒ **không chọn được "tất cả"**. Hôm nay QLCS đa cơ sở không có cách nào xem gộp N cơ sở của mình.
3. **Kiểu dữ liệu đơn trị** — `ReportFilters.centerId: string | null` (`:11`) chỉ diễn đạt được "một cơ sở" hoặc "toàn bộ". A-02 cần **tập con**.
4. **78 chỗ / 44 file** đọc `session.user.centerId` (một giá trị, snapshot trong JWT). Hai chỗ nguy hiểm nhất:
   - `lib/pending-tasks.ts:114` — `const centerScope = isCM && !isSuper ? (user.centerId ?? null) : null`, dùng `db` **TRẦN** (không qua `scopedDb`), rồi ép xuống 8 chỗ (`:126, :153, :181, :210, :244, :281, :400`). Đây là nguồn "Việc cần xử lý" của dashboard — đúng thứ 4 tab sẽ đọc.
   - `app/(teacher)/teacher/don-tu/_actions.ts:145` — `if (!isSuper && req.centerId !== (session.user.centerId ?? null))`: **chặn cứng cơ sở thứ hai**.

5. 🔴 **CHỈ SUPER_ADMIN gán được đa cơ sở.** Đường duy nhất là `/admin/users/[id]/org-roles`, gác bằng `roles:assign` (`lib/auth/rbac-service.ts:176`), và `roles:assign` được seed cho **đúng một vai**: `SUPER_ADMIN` (`prisma/seed-roles.ts:36` — grep toàn file chỉ 1 hit). `CENTER_MANAGER`, `HO_HR`, `HO_MARKETING` **đều không** gán được. Cần chốt: có mở cho `HO_HR` không (OQ-7).

6. 🔴 **"KHÁC VÙNG" là đường CHƯA AI ĐI.** Model chịu được, nhưng:
   - Seed chỉ có **đúng một** REGION (`DANANG`) — chưa từng tồn tại kịch bản 2 vùng (`prisma/seed-orgunit.ts:44-51`).
   - `OrgAnchor` chỉ có 3 giá trị `"HO" | "CENTER" | "CENTER_OR_HO"` — **không có `REGION`** (`lib/auth/legacy-role-map.ts:13`) ⇒ đường đồng bộ tự động **không bao giờ** sinh nổi vai neo ở REGION.
   - Không `RoleDef` nào trong seed được thiết kế cho cấp vùng (15 vai, không vai nào mang nghĩa REGION).

   ⇒ A-01 phải tạo REGION thứ hai trong dữ liệu test và **gán tay ở cấp CENTER**, không trông vào cấp REGION.
5. **`WorkScope` (điều động) chỉ hiệu lực với vai hưởng qua `PositionAssignment`** — `resolveActorUncached` map `UserOrgRole` mà **không** set `workScopeOrgUnitIds` (`lib/auth/actor.ts:511-526`; chỉ `lib/org/positions.ts:203-206` set). Điều động một người chỉ có `UserOrgRole` là **no-op im lặng**. ⇒ A-01 dùng **N dòng `UserOrgRole`**, không dùng `WorkScope`.

**Dòng gán tay có bị màn nhân sự xoá mất không? — KHÔNG.**

`reconcileUserOrgRoles()` (`lib/auth/org-role-sync.ts:75`) được gọi từ 4 màn (`nhan-su/actions.ts:644`, `teachers/_actions.ts:88`, `users/_actions.ts:159, :372`). Vòng thu hồi **chỉ duyệt `prevPlan.targets`** — tức chỉ những dòng do bảng ánh xạ vai↔đơn vị **tự sinh** (`lib/auth/org-role-sync.ts:200-203`). Chú thích ngay trong mã nói rõ: *"Chỉ đụng dòng do bảng ánh xạ sinh ra — vai gán tay nằm ngoài prevPlan."*

⇒ N dòng `UserOrgRole` gán tay cho QLCS đa cơ sở **sống sót** qua mọi lần sửa hồ sơ nhân sự — **trong đa số trường hợp**.

🔴 **NHƯNG có một trường hợp va chạm làm mất dòng gán tay** (phát hiện ở vòng red-team, xem §9):
`prevPlan` được **suy lại** từ **một** đơn vị neo cũ (`lib/auth/legacy-role-map.ts:96-122`), chứ không đọc cờ "dòng này do ai tạo" — **schema không có cột nào ghi nguồn gốc dòng**. Khi đơn vị neo cũ **trùng đúng** cơ sở đã gán tay, dòng gán tay **rơi vào `prevPlan`** và bị `EXPIRED` như dòng máy sinh.

Ít nhất **hai màn** kích hoạt đường này:
- `app/(admin)/admin/users/_actions.ts:363-380` — chỉ đổi ô "Đơn vị".
- `app/(admin)/admin/nhan-su/actions.ts:377` → `lib/hr/sync-employee-unit.ts:77-89` — sửa "đơn vị làm việc" trên hồ sơ nhân sự.

⇒ Đây là **thay đổi schema duy nhất mà khu vực A cần** — xem SL-01 ở §10.

**Cách làm:**

- Gán QLCS đa cơ sở = **N dòng `UserOrgRole`, mỗi dòng neo ở một `OrgUnit` type `CENTER`**.
- Cùng vùng thì **có thể** neo một dòng ở `REGION` (subtree cho ra mọi CENTER trong vùng). Khác vùng thì bắt buộc N dòng CENTER.
- **Tuyệt đối không** neo ở `HO`/`ROOT` để "cho tiện" → `isHoLevel` ⇒ thấy **mọi** cơ sở (A-01-3 chặn việc này).

**Thay đổi schema cho A-01: KHÔNG.** Chỉ đổi `lib/reports/filters.ts`, form gán vai, và các call-site trên đường dashboard.

### 6.2 A-02 — Bộ lọc phạm vi dùng chung

**Câu hỏi bắt buộc trả lời: đặt ở đâu để 4 tab tái sử dụng?**

> **Mở rộng cặp đã có, không tạo cặp thứ hai:**
> - **Server resolver:** `lib/reports/filters.ts` — thêm `resolveScopeFilters()` (bản đa cơ sở) cạnh `resolveReportFilters()` hiện có.
> - **UI:** `components/admin/scope-filter-bar.tsx` — bản đa chọn, đặt cạnh `components/admin/report-filter-bar.tsx`.
> - **Nơi 4 tab dùng:** `app/(admin)/admin/dashboard/` — filter đặt ở **page cha**, 4 tab là 4 nhánh đọc **cùng** `searchParams`.

Vì sao chỗ này, không phải chỗ khác:

| Lý do | Bằng chứng |
|---|---|
| Cặp này **đã** là component lọc dùng chung duy nhất của admin, đang phục vụ 8 trang `/bao-cao/*` | `components/admin/report-filter-bar.tsx` được import ở churn, cohort, dao-tao, doanh-thu, hieu-suat-gv, lead, trial, trung-tam |
| Resolver đã có sẵn logic chống IDOR + lọc theo `visibleCenterIds` | `lib/reports/filters.ts:63-73` |
| Đã có sẵn `reportFilterCacheKey` + `reportDateWhere` để 4 tab tính cache/where đồng nhất | `lib/reports/filters.ts:88-101` |
| Dashboard hiện **không có bộ lọc nào** — không có gì phải giữ tương thích | `app/(admin)/admin/dashboard/page.tsx` (139 dòng, union panel theo vai, 0 filter) |

Hình dạng đề nghị:

```
lib/reports/filters.ts
  export type ScopeFilters = {
    centerIds: string[] | null   // null = toàn bộ phạm vi cho phép của actor
    dateFrom: Date               // mặc định: ngày 01 tháng hiện tại (giờ VN) — OQ-B9 chốt 24/08
    dateTo: Date                 // mặc định: hôm nay, cuối ngày
    groupByCenter: boolean       // OQ-4 (24/08): false = gộp (mặc định) · true = tách từng cơ sở
  }
  export async function resolveScopeFilters(actor, sp): Promise<ScopeFilterContext>

components/admin/scope-filter-bar.tsx   // form GET, multi-select + 2 input date + công tắc "Tách theo cơ sở"

app/(admin)/admin/dashboard/
  page.tsx        // đọc searchParams -> resolveScopeFilters -> render <ScopeFilterBar> + tab đang chọn
  _tabs/tai-chinh.tsx | kinh-doanh.tsx | chi-phi-marketing.tsx | tuong-tac-kh.tsx
```

**Bẫy phải tránh (đã đo trong repo):**

1. **`Center` nằm trong `SCOPE_EXEMPT`** (`lib/db-scope.ts:105-107`) ⇒ `scopedDb(actor).center.findMany()` là **pass-through, trả MỌI cơ sở**. Phần lớn trang list đang đổ thẳng kết quả này vào dropdown. Selector của A-02 **bắt buộc** lọc theo `actor.visibleCenterIds` (đúng như `lib/reports/filters.ts:63-65` đang làm), tuyệt đối không gọi `sdb.center.findMany()` trần.
2. **Hai quy ước URL cùng tồn tại:** `?center=` + giá trị `ALL` (ReportFilterBar) và `?centerId=` + chuỗi rỗng (~14 trang khác). A chốt `?center=`; **không** đổi 14 trang kia trong đợt này.
3. **Công tắc "Tách theo cơ sở" (OQ-4) phải nằm trong `ScopeFilters`, không phải state của từng tab.** Bốn tab đọc **cùng** `searchParams` (`?split=1`), nếu không thì bật ở tab này sang tab kia lại tắt. Công tắc **chỉ render khi `centerIds.length >= 2`**; một cơ sở thì tách và gộp cho ra cùng con số.
4. **Mỗi hàm số liệu của B/C/D/E nhận `groupByCenter` ngay từ bản đầu tiên.** Viết cứng dạng gộp rồi "thêm tách sau" là viết lại toàn bộ tầng truy vấn của 4 tab — đúng cái bẫy mà OQ-4 sinh ra để tránh.
3. **`lib/dashboard/widget-registry.ts` là mã chết** — có `DASHBOARD_WIDGETS` + `visibleWidgets(actor)` nghe rất giống thứ A-02 cần, nhưng **không dòng sản phẩm nào import** (chỉ file test của chính nó). Đừng xây lên trên nó, cũng đừng tưởng đã có sẵn.
4. **`getSelectableOrgUnits()` tự nhận là "nguồn duy nhất cho mọi center-picker"** (`lib/org/org-service.ts:352-354`) nhưng **không bộ lọc list nào gọi nó** — chỉ các màn form. Đừng tin doc-comment đó.
5. `components/ui/select.tsx` và `combobox.tsx` dựng trên **Base UI**, không phải Radix — đừng dán snippet shadcn/Radix vào. Repo **chưa có** multi-select; A-02 phải tự dựng bằng primitive sẵn có hoặc `<select multiple>` native.

**🔴 Ba ràng buộc cứng cho A-02 (từ vòng red-team — vi phạm là hỏng im lặng):**

6. **KHÔNG đổi kiểu `ReportFilters.centerId`** (`lib/reports/filters.ts:11`). Đổi sang mảng làm vỡ **11 chỗ đọc trong 8 page** (`churn:56`, `cohort:60`, `dao-tao:266`, `doanh-thu:69,77,107`, `hieu-suat-gv:208`, `lead:55`, `trial:51`, `trung-tam:333,356`) + **8 chỗ** `selection={fc.selection}` — và lan sang **đường GHI**: `doanh-thu/page.tsx:160` truyền `fc.selection` vào `RevenueTargetForm` → `bao-cao/doanh-thu/_actions.ts:48` `formData.get("centerId")`. Bộ lọc **đọc** kéo theo form **ghi mục tiêu doanh thu**.
   ⇒ A-02 thêm **hàm và kiểu MỚI** (`resolveScopeFilters` / `ScopeFilters`), để nguyên `resolveReportFilters` / `ReportFilters`.

7. **PHẢI cập nhật khoá cache.** `reportFilterCacheKey` (`lib/reports/filters.ts:88-90`) chỉ ghép `centerId|dateFrom|dateTo` và là **discriminator DUY NHẤT**: cả 8 trang gọi `safeCache(() => compute(actor, fc.filters), [...], { revalidate: 120 })` với **closure 0 tham số** (`doanh-thu:112-115`, `hieu-suat-gv:78-85`, `trung-tam:90-97`, `churn:116`, `cohort:145`, `dao-tao:92`, `lead:106`, `trial:118`). Thêm trường vào bộ lọc mà quên sửa key ⇒ **hai bộ lọc khác nhau dùng chung một entry, sai số liệu im lặng 120 giây**.

8. **`ReportFilterSearchParams` được export nhưng KHÔNG page nào import** — cả 9 trang tự khai lại `center?: string` inline (`churn:101`, `doanh-thu:54`, `lead:87`, `trial:105`, `cohort:124`, `dao-tao:69`, `hieu-suat-gv:59`, `trung-tam:71`, `chat-pilot:81`). ⇒ Nới kiểu ở `filters.ts` **không lan ra**; `pnpm typecheck` vẫn xanh trong khi runtime cầm mảng. 4 tab mới **phải import** kiểu dùng chung, không khai lại inline.

### 6.3 A-03 — Phân quyền export lead

**Câu hỏi bắt buộc trả lời: mô hình hoá thế nào trong RolePermission hiện có, KHÔNG hard-code theo role?**

Hiện trạng `leads:export` — **key chết**:

| Nơi | Có? | Bằng chứng |
|---|---|---|
| Union type `Action` + ma trận v1 | ✅ hard-code 3 role | `lib/auth/permissions.ts:67`, `:362` → `["SUPER_ADMIN","CENTER_MANAGER","MARKETING"]` |
| `ACTION_REGISTRY` (validator) | ✅ (qua `ALL_ACTIONS = Object.keys(PERMISSIONS)`) | `lib/auth/action-registry.ts:8`, `lib/auth/permissions.ts:806` |
| Registry mới `PermissionDescriptor` | ✅ | `lib/permissions/registry/crm.ts:29` |
| Seed vào role | ✅ 2 role, scope `GLOBAL` | `prisma/seed-roles.ts:229`, `:411` |
| **Call-site enforce thật** | ❌ **KHÔNG CÓ** | grep toàn repo: chỉ xuất hiện trong test |
| Endpoint export lead thật đang gác bằng gì | `leads:view-all` | `app/api/admin/leads/export/route.ts:29` |

⇒ Hôm nay **bất kỳ ai đọc được danh sách lead đều xuất được file**, và `leads:export` chỉ là khai báo trang trí. Đúng hai điều A-03 cấm: quyền đến từ role, và không tách được xuất-file khỏi xem-danh-sách.

**Những gì endpoint hiện tại ĐÃ làm đúng — giữ nguyên, đừng viết lại:**

| Đã có | Bằng chứng |
|---|---|
| Cách ly cơ sở thật (đi qua `scopedDb`) | `app/api/admin/leads/export/route.ts:54` `scopedDb(actor).lead.findMany` |
| Mask PII cho người không có `leads:view-pii` | `:80`, `:90-102` |
| Watermark truy vết cuối file | `:109` (`exportWatermark`) |
| Audit `EXPORT` | `:115-127` (`writeAudit`) |
| Chống IDOR qua query string | Không nhận tham số `centerId` từ URL — phạm vi hoàn toàn do `scopedDb` quyết |

**Hai lệch so với spec cần chốt:**

1. **Định dạng.** Spec A-03/G-03 nói "xuất **Excel**"; endpoint hiện sinh **CSV** (`:129-133`, `Content-Type: text/csv`). Repo có `xlsx` (SheetJS) sẵn trong `package.json`, không có `exceljs`. Cần chốt: giữ CSV hay đổi sang `.xlsx`.
2. **Trần 5000 dòng im lặng** (`:55` `take: 5000`). Người xuất không biết file bị cắt.

**Ba đường khả dĩ:**

| | Cơ chế | Gán cho từng người? | Có DENY? | Có UI? | Vấn đề |
|---|---|---|---|---|---|
| (a) | `UserPermissionGrant(userId, action, ALLOW)` | ✅ trực tiếp | ❌ DENY bị **vứt im lặng** (`lib/auth/actor.ts:367-371`, ghim bằng test `[A0-03-T6-02]`) | ✅ `/admin/users/[id]/permissions` | ALLOW là **vô điều kiện, bỏ qua scope** (`lib/auth/can.ts:54`). Màn hình còn in "DENY > ALLOW > role matrix" — **sai** với v2 đang enforce |
| (b) | `UserGroup` + `PermissionGrant(subjectType=GROUP)` | ✅ qua thành viên nhóm | ✅ DENY thật (`lib/permissions/can.ts:118-122`) | ✅ `/admin/user-groups` | `dataScope` bị validator ép chỉ `ALL` cho GROUP |
| (c) | Thêm `USER` vào `GrantSubjectType` | ✅ | ✅ | ❌ phải xây | **Đổi schema** |

**Khuyến nghị: (b) — `UserGroup` + `PermissionGrant`.**

Lý do:
- Đúng thế hệ mới, có nhánh DENY thật, `reason` bắt buộc 5..500 ký tự, ghi `RbacAuditLog` (`app/(admin)/admin/user-groups/_actions.ts:368-371`).
- Đã có màn quản trị: `/admin/user-groups` với `group-members.tsx` + `group-grants.tsx`. Bật/tắt cho một quản lý = **thêm/bớt một dòng `UserGroupMember`**.
- `leads:export` **không** nằm trong `NON_GROUP_GRANTABLE_KEYS` (`lib/validators/user-group.ts:47-55` — chỉ 7 khoá quản trị) ⇒ cấp qua nhóm hợp lệ.
- `PermissionDescriptor` đã có key sẵn ⇒ FK `Restrict` thoả, không cần seed thêm key.

**Ràng buộc phải chấp nhận — `dataScope` chỉ được `ALL`:**
Validator P0 ép grant nhóm chỉ `dataScope: ALL` (`app/(admin)/admin/user-groups/_actions.ts:14, 368`). Đây **không** phải hạn chế tuỳ tiện: `scopeSatisfied()` tra `actor.roleCenterScope[grant.subjectId]`, mà bảng đó **khoá theo `RoleDef.id`**, không có mục nào cho `UserGroup.id` ⇒ grant nhóm mang `UNIT_ONLY`/`UNIT_AND_BELOW` **luôn trả false**, "trông như có mà không bao giờ chạy" (ghim bằng test `[PIN]` `lib/permissions/can.test.ts:279-293`).

⇒ Quyền `leads:export` là **quyền toàn cục "được phép bấm nút xuất"**; **cách ly cơ sở do `scopedDb` lo ở tầng truy vấn**, không do permission scope.

Đây **đúng tiền lệ đã ship** trong repo: `canViewLeadPii()` (`lib/auth/check-permission.ts:88-98`) — `leads:view-pii` seed `GLOBAL`, gọi `checkPermission` **không truyền target**, kèm chú thích *"cách ly cơ sở đã do scopedDb ở tầng query"*. A-03 sao chép nguyên mô hình đó.

**Việc phải làm:**

1. Thêm call-site ở `app/api/admin/leads/export/route.ts:29`: yêu cầu **CẢ HAI** — `leads:view-all` **AND** `leads:export`.
   🔴 **BẮT BUỘC là AND, không được THAY THẾ.** Nếu thay `leads:view-all` bằng `leads:export`, một thành viên nhóm mang vai neo tại HO nhưng **không có `leads:*` nào** sẽ rơi vào nhánh `lib/db-scope.ts:256-262` → `isHoLevel` → `"ALL"` → **xuất lead toàn hệ thống**. (AC A-03-2 phải đọc theo câu này, không theo cách viết tắt.)
2. **GIỮ NGUYÊN key `leads:export` trong `lib/auth/permissions.ts`** — chỉ đổi **giá trị** dòng `:362` thành mảng rỗng `[]`.
   🔴 **TUYỆT ĐỐI KHÔNG xoá key khỏi `PERMISSIONS`.** `ALL_ACTIONS = Object.keys(PERMISSIONS)` (`:806`) → `ACTION_REGISTRY` (`lib/auth/action-registry.ts:8`) → `buildActor` lọc grant qua `validActions` (`lib/auth/actor.ts:240, 369`). Mất key = **mọi grant mang key đó bị vứt im lặng**, đúng lớp sự cố 114 tài khoản PARENT. Ngoài ra `lib/validators/permission-grant.ts:6` dùng `z.enum(ALL_ACTIONS)` và form thêm grant lọc dropdown theo `ALL_ACTIONS` → key biến mất khỏi UI. Và CI đỏ ngay: `lib/permissions/registry.test.ts:76-85` bắt mọi descriptor `resource:verb` phải có trong `ALL_ACTIONS`, trong khi `leads:export` **buộc phải ở lại** `lib/permissions/registry/crm.ts:29` vì `PermissionGrant.permissionKey` là FK `onDelete: Restrict`.
3. **Gỡ** `leads:export` khỏi `prisma/seed-roles.ts:229` và `:411`. Chạy `pnpm db:seed:permissions` rồi `pnpm db:seed:roles`; trên prod dùng `seed-prod-roles.yml` **sau khi** `test` → `main`.
4. Tạo nhóm "Được xuất Excel lead", cấp `PermissionGrant(GROUP, leads:export, ALLOW, dataScope=ALL, reason=...)`, thêm từng quản lý làm thành viên.
5. 🔴 **CẤM cấp `leads:export` qua màn per-user `/admin/users/[id]/permissions`** — xem §6.3b.

✅ **OQ-1 đã được trả lời bằng mã, không còn chặn:** grant mới thắng **không nhờ cờ**. `lib/auth/permission-decision.ts:48-49` gọi `resolveGrant()` **trước** và `return decision.allowed` ngay khi hit — chưa hề đọc `isRbacV2Enabled()`; cờ chỉ được đọc ở `:55` khi grant **miss**. Vì bước 2 giữ key và chỉ làm rỗng danh sách role, đường v1 cũng không còn cấp `leads:export` cho ai. ⇒ Không phụ thuộc trạng thái `RBAC_V2_ENABLED` trên prod.

### 6.3b — 🔴 Vì sao CẤM đường per-user `UserPermissionGrant` cho quyền `leads:*`

Đây là phát hiện nặng nhất của vòng red-team.

`lib/db-scope.ts:247-253`: **bất kỳ** action nào trong `actor.grantsAllow` khớp **prefix** của model sẽ đặt `hasAll = true` → `getModelVisibleCenterIds` trả `"ALL"` → `injectScope` trả `args` **nguyên vẹn** (`:269-272`). Chú thích tại `:250` ghi thẳng: *per-user grants are global exceptions*.

⇒ Cấp `leads:export` cho một người qua `/admin/users/[id]/permissions` sẽ **TẮT cách ly cơ sở trên toàn bộ model `Lead`** cho người đó. CSV xuất ra chứa lead **mọi cơ sở**, và danh sách lead trên UI cũng vậy. Màn per-user **không chặn** key này — guard chống leo thang ở `app/(admin)/admin/users/[id]/permissions/_actions.ts:65-77` chỉ chặn `roles:*` và `users:manage`.

**Hệ quả cho A-03:**
- Cơ chế (b) `UserGroup` + `PermissionGrant` **không** dính lỗi này — `resolveGrant` đọc `actor.permissionGrants`, không đổ vào `grantsAllow`.
- Phải **thêm `leads:*` vào danh sách chặn** của màn per-user (`NON_GROUP_GRANTABLE_KEYS` là của nhóm; màn per-user cần blocklist riêng ở `_actions.ts:65-77`).
- Lập luận "scopedDb lo cách ly" là **vòng tròn** nếu không có rào này: tầm nhìn cơ sở của `Lead` được suy **từ chính tập quyền `leads:*`** của actor (`lib/db-scope.ts:225-264`) — cấp thêm quyền `leads:*` có thể tự nới cái hàng rào đang được viện dẫn.

---

## 6.10 Mở `roles:assign` cho `HO_HR` — 3 rào bắt buộc (OQ-7, 24/08/2026)

Quyền `roles:assign` là quyền **cấp quyền**. Mở trần cho `HO_HR` nghĩa là Nhân sự Hội sở tự gán được cho
chính mình gần như mọi vai — không phải vì ai đó có ý xấu, mà vì hệ thống không có gì ngăn. Đo trên mã:

- ✅ **Đã có sẵn một rào:** `assignUserOrgRole` chặn gán vai `SUPER_ADMIN` nếu actor không phải SUPER_ADMIN
  (SEC-M13 — `lib/auth/rbac-service.ts:184-193`). Rào này **đủ** cho đúng một vai, và **không** đủ cho phần còn lại.
- 🔴 **Chưa có rào nào cho:** tự gán cho chính mình · gán vai **mang chính `roles:*`** (nhân bản quyền cấp
  quyền) hoặc `users:manage` · gán vai tại node **HO** (neo vai ở HO ⇒ `isHoLevel` ⇒ **thấy mọi cơ sở**).

**Ba rào phải viết cùng lúc với việc seed quyền — không tách ra "làm sau":**

| # | Rào | Ghi chú hiện thực |
|---|---|---|
| **R1** | Actor **không phải SUPER_ADMIN** thì **không gán được vai chứa `roles:*` hoặc `users:manage`** | Đúng tiền lệ đang có ở màn per-user: blocklist `_actions.ts:65-77`. Đây là rào chống **nhân bản quyền** |
| **R2** | **Không tự gán cho chính mình** (`parsed.userId === actor.id` ⇒ từ chối) | Muốn đổi quyền của chính mình thì nhờ SUPER_ADMIN — đúng tinh thần "hai người cho một việc nhạy cảm" |
| **R3** | `reason` **bắt buộc**, ghi `logRbacAudit` (đã có hàm) | Doc 15 §2 vốn đã đòi "audit + reason bắt buộc" cho mọi thay đổi vai |

**Không** thêm rào cấm gán tại node HO: HR cần tạo được nhân sự Hội sở (HO_ACCOUNTANT ở HO là việc thường
ngày). R1 + R2 đã chặn đúng đường leo thang mà vẫn để HR làm việc của họ — và đường nguy hiểm nhất trong đó
(**neo `CENTER_MANAGER` tại HO/ROOT ⇒ `isHoLevel` ⇒ thấy mọi cơ sở**) **đã** bị chặn sẵn bởi **A-01-3**
(bất biến `L-A5` trong `docs/plan/test-coverage.md`). Nghĩa là mở `roles:assign` cho HR **không** mở lại
đường đó, miễn A-01-3 được hiện thực đúng — nên A-01-3 và §6.10 phải lên cùng một đợt, không tách.

⚠️ **Sau khi merge `test` → `main`: chạy `seed-prod-roles.yml`.** Quên bước này thì trên prod HR vẫn không
gán được, và không có thông báo lỗi nào giải thích vì sao — tiền lệ đã ghi trong `MEMORY.md`.

---

## 6.9 Đo prod trước A-01 — BẮT BUỘC (sinh ra từ OQ-5, 24/08/2026)

> ✅ **ĐÃ CHẠY TRÊN PROD 26/08/2026** — kết quả thật ở **§6.9.2**. Bốn truy vấn dưới giữ nguyên làm
> **bản gốc để chạy lại**; §6.9.2 mới là thứ dùng để ra quyết định.

Chủ dự án xác nhận **đã có QLCS phụ trách từ 2 cơ sở trở lên trên prod, đang xử lý tạm bằng tay**. Trước khi
viết A-01 hay bất kỳ script backfill nào, phải biết **hiện có bao nhiêu cấu hình như vậy** và **đã mất dòng
nào chưa**. Bốn truy vấn dưới **chỉ đọc**, chạy an toàn trên prod.

```sql
-- [A-01-Đ1] Ai đang giữ nhiều hơn 1 cơ sở qua UserOrgRole (nguồn quyền thật)?
SELECT u.id, u.name, u.email,
       count(DISTINCT o.id)                    AS so_co_so,
       string_agg(DISTINCT o.code, ', ')       AS cac_co_so,
       string_agg(DISTINCT r.code, ', ')       AS cac_vai
FROM "UserOrgRole" uor
JOIN "OrgUnit" o ON o.id = uor."orgUnitId" AND o.type = 'CENTER'
JOIN "RoleDef" r ON r.id = uor."roleId"
JOIN "User"    u ON u.id = uor."userId"
WHERE uor.status = 'ACTIVE'
  AND (uor."effectiveTo" IS NULL OR uor."effectiveTo" > now())
GROUP BY u.id, u.name, u.email
HAVING count(DISTINCT o.id) > 1
ORDER BY so_co_so DESC;

-- [A-01-Đ2] Dòng ĐÃ BỊ THU HỒI (dấu vết của lỗ hổng SL-01: gán tay bị reconcile EXPIRED).
--           Có kết quả ⇒ cấu hình tay ĐÃ từng bị xoá, không phải rủi ro lý thuyết.
SELECT u.name, o.code AS co_so, r.code AS vai, uor.status,
       uor."effectiveFrom", uor."effectiveTo", uor."grantedById"
FROM "UserOrgRole" uor
JOIN "OrgUnit" o ON o.id = uor."orgUnitId" AND o.type = 'CENTER'
JOIN "RoleDef" r ON r.id = uor."roleId"
JOIN "User"    u ON u.id = uor."userId"
WHERE uor.status <> 'ACTIVE' OR (uor."effectiveTo" IS NOT NULL AND uor."effectiveTo" <= now())
ORDER BY uor."effectiveTo" DESC NULLS LAST
LIMIT 100;

-- [A-01-Đ3] Lệch giữa "cơ sở neo" trên User và tập cơ sở có quyền thật.
--           Đây là tập mà cách xử lý tay hiện nay dễ để lại mâu thuẫn nhất.
SELECT u.id, u.name, c.code AS center_id_tren_user,
       string_agg(DISTINCT o.code, ', ') AS co_so_co_quyen
FROM "User" u
LEFT JOIN "Center" c ON c.id = u."centerId"
LEFT JOIN "UserOrgRole" uor ON uor."userId" = u.id AND uor.status = 'ACTIVE'
LEFT JOIN "OrgUnit"    o   ON o.id = uor."orgUnitId" AND o.type = 'CENTER'
WHERE u."deletedAt" IS NULL AND u."isActive"
GROUP BY u.id, u.name, c.code
HAVING count(DISTINCT o.id) > 1
    OR (c.code IS NOT NULL AND count(DISTINCT o.id) = 0);
```

### 6.9.1 Người đó là **anh Phúc — vừa QLCS vừa `SUPER_ADMIN`** (chủ dự án xác nhận 24/08/2026)

Đây **không** phải chi tiết nhân sự, nó đổi hai thứ trong kế hoạch:

**(a) Tài khoản anh Phúc KHÔNG dùng để nghiệm thu A-01 được.** `SUPER_ADMIN` đi vào nhánh `isHoLevel` của
`buildActor()` và thấy **mọi** cơ sở bất kể cấu hình đa cơ sở đúng hay sai. Đăng nhập bằng tài khoản đó để
"kiểm tra QLCS 2 cơ sở chạy chưa" sẽ **luôn xanh**, kể cả khi A-01 hỏng hoàn toàn. ⇒ UAT và e2e A-01
**bắt buộc** dùng một tài khoản **QLCS thuần** (không `SUPER_ADMIN`, không vai HO nào) giữ 2 cơ sở
**khác vùng** — khớp bất biến `L-A1` trong `docs/plan/test-coverage.md`.

**(b) Lỗ hổng SL-01 trên tài khoản anh Phúc là loại hỏng ÂM THẦM — hỏng thật, nhưng không hỏng ở chỗ ai
cũng nhìn.** Đo trên mã:

- Tư cách thành viên **nhóm chat lớp** của QLCS dẫn xuất từ `UserOrgRole` có `role.code ∈`
  `CHAT_CENTER_MANAGER_ROLE_CODES` = `["CENTER_MANAGER", "CENTER_CLASS_MANAGER"]`
  (`lib/chat/sync-membership.ts:155-158`). **`SUPER_ADMIN` KHÔNG nằm trong danh sách này.**
- Đường v1 dự phòng chỉ khớp `User.roles[]` chứa `CENTER_MANAGER` **và** `User.centerId` = cơ sở của lớp
  (`lib/chat/sync-membership.ts:15-16`) ⇒ nó chỉ đỡ được **một** cơ sở: cơ sở neo trên `User`.
- ⇒ Với **cơ sở thứ hai**, chỗ duy nhất giữ anh Phúc trong nhóm lớp là **dòng `UserOrgRole` v2**. Nếu
  `reconcileUserOrgRoles` `EXPIRED` dòng đó (đúng lỗ hổng SL-01), anh ấy **lặng lẽ rời mọi nhóm chat lớp
  của cơ sở thứ hai**, trong khi **mọi báo cáo và dashboard vẫn hiện đủ** vì `SUPER_ADMIN` che.

Nói cách khác: hiện trạng "xử lý tạm bằng tay đang chạy được" **không chứng minh** cấu hình đa cơ sở đang
lành — nó chỉ chứng minh `SUPER_ADMIN` che được phần nhìn thấy. Phần **không** che được là chat.

⇒ **Giữ nguyên cả V-1 → V-2 → V-3.** Không có nhánh "bỏ backfill".

```sql
-- [A-01-Đ4] Anh Phúc (hoặc bất kỳ ai vừa SUPER_ADMIN vừa CENTER_MANAGER) có đang
--           BỊ RỚT khỏi nhóm chat lớp của cơ sở mình quản không?
--           Có dòng trả về = dấu hiệu SL-01 ĐÃ nổ, dù dashboard vẫn hiện đủ.
WITH ql AS (   -- ai đang giữ vai QLCS/giáo vụ tại một cơ sở, qua UserOrgRole
  SELECT uor."userId", o.id AS org_id, o.code AS co_so
  FROM "UserOrgRole" uor
  JOIN "OrgUnit" o ON o.id = uor."orgUnitId" AND o.type = 'CENTER'
  JOIN "RoleDef" r ON r.id = uor."roleId"
  WHERE uor.status = 'ACTIVE'
    AND (uor."effectiveTo" IS NULL OR uor."effectiveTo" > now())
    AND r.code IN ('CENTER_MANAGER', 'CENTER_CLASS_MANAGER')
)
SELECT u.name, ql.co_so, count(c.id) AS nhom_lop_bi_rot
FROM ql
JOIN "User" u ON u.id = ql."userId"
JOIN "OrgUnit" o ON o.id = ql.org_id
JOIN "Conversation" c
  ON c."orgUnitId" = o.id AND c.type = 'CLASS_GROUP' AND c.status = 'ACTIVE'
LEFT JOIN "ConversationParticipant" cp
  ON cp."conversationId" = c.id AND cp."userId" = ql."userId" AND cp."leftAt" IS NULL
WHERE cp.id IS NULL
GROUP BY u.name, ql.co_so
ORDER BY nhom_lop_bi_rot DESC;
```

⚠️ Truy vấn Đ4 giả định `Conversation.type = 'CLASS_GROUP'` và `orgUnitId` đã được ghi kép — nếu dữ liệu cũ
còn `centerId` mà thiếu `orgUnitId` thì đổi vế `JOIN` sang `c."centerId"`. Kiểm bằng
`SELECT count(*) FILTER (WHERE "orgUnitId" IS NULL) FROM "Conversation";` trước khi tin kết quả.

**Đọc kết quả:**

| Kết quả | Nghĩa | Việc kéo theo |
|---|---|---|
| Đ1 trả **0 dòng** nhưng chủ dự án nói "có" | Cấu hình tay **không nằm ở `UserOrgRole`** (nhiều khả năng đang chữa bằng cách đổi `User.centerId` qua lại, hoặc cấp `leads:view-all`) | Backfill phải **dựng lại từ đầu**, không phải chép cột |
| Đ1 trả > 0 | Có cấu hình thật để backfill | Ghi lại **nguyên trạng** trước khi chạy SL-01 |
| Đ2 có dòng `EXPIRED` gần đây | 🔴 Lỗ hổng SL-01 **đã nổ ít nhất một lần** | Ưu tiên SL-01 lên trước mọi việc khác của A; báo cho người bị mất quyền |
| Đ3 có dòng | Hai nguồn sự thật đang lệch | Chốt nguồn nào thắng **trước** khi A-02 đọc phạm vi |

⚠️ **Thứ tự bắt buộc: đo (§6.9) → SL-01 → backfill.** Làm backfill trước khi có cột `source` là nhân bản đúng
những dòng mà `reconcileUserOrgRoles` sẽ thu hồi ở lần sửa ô "Đơn vị" kế tiếp.

---

### 6.9.2 KẾT QUẢ ĐO PROD — 26/08/2026 (dữ liệu THẬT, chủ dự án chạy)

Bốn truy vấn §6.9 đã chạy trên Supabase **prod**. Ghi **nguyên văn, không làm tròn**.

#### [A-01-Đ1] — chỉ **MỘT** người giữ nhiều hơn 1 cơ sở

| Người | Email | `User.id` | Cơ sở | Vai |
|---|---|---|---|---|
| Hồ Đắc Phúc | `hodacphuc.sr@satarobo.vn` | `cmrd3yfgv000h9xkd7bmucaio` | **CS1 + CS2** | `CENTER_MANAGER` |

⇒ Khớp đúng OQ-5: cấu hình đa cơ sở thật **có tồn tại** và **chỉ có một**. Phần backfill V-3 vì thế
**rất nhỏ**. Nhưng §6.9.1 giữ nguyên: đây là tài khoản **kiêm `SUPER_ADMIN`** ⇒ **không** dùng để
nghiệm thu A-01.

#### [A-01-Đ2] — 🔴 **SL-01 ĐÃ NỔ THẬT.** Không còn là rủi ro lý thuyết

| Người | Cơ sở | Vai | Trạng thái | `effectiveFrom` | `effectiveTo` | `grantedById` |
|---|---|---|---|---|---|---|
| Phan Thanh Toại | CS1 | `CENTER_MANAGER` | `EXPIRED` | 2026-07-10 03:22:40 | **2026-08-20 03:46:14** | `cmrd3u3bq000rm1laztmlac0u` |
| Lê Thị Phương Liên | CS2 | `CENTER_MANAGER` | `EXPIRED` | 2026-07-10 03:22:42 | **2026-08-20 03:44:39** | `cmrd3qm0s000em1lag3ait8hk` |

Hai dòng bị thu hồi **cùng một ngày**, cách nhau **~1 phút 35 giây** — dấu vết của một lượt thao tác
liên tiếp trên màn quản trị, đúng khuôn `reconcileUserOrgRoles` mà SL-01 mô tả (`users/_actions.ts:363-380`
· `nhan-su/actions.ts:377`). Cả hai được cấp cùng lúc **10/07/2026**, sống được ~41 ngày rồi mất.

🔴 **Đối chiếu Đ1 ↔ Đ2 (chủ dự án tự rà khi chạy): hai người này KHÔNG còn dòng `UserOrgRole` cấp cơ sở
nào.** ⚠️ Kết luận này **không suy ra được từ việc họ vắng mặt ở Đ1** — Đ1 có `HAVING count(DISTINCT o.id) > 1`,
nên vắng mặt ở Đ1 chỉ nói họ giữ **≤ 1** cơ sở. Đây là đối chiếu **thủ công lúc đo**; ai chạy lại sau
này muốn xác nhận thì bỏ mệnh đề `HAVING` và lọc theo `userId`.

⇒ **Nếu họ vẫn đang làm quản lý cơ sở thì họ đang hỏng trên prod ngay lúc này.** Và khác anh Phúc, họ
**không có `SUPER_ADMIN` che** ⇒ mất luôn cả phần nhìn thấy (dashboard, danh sách lớp), không chỉ mất chat.

⚠️ **Đ4 KHÔNG bắt được hai người này** — mệnh đề `ql` của Đ4 lọc `uor.status = 'ACTIVE'` (§6.9, dòng
`WHERE uor.status = 'ACTIVE'`). Người đã mất dòng quyền thì rơi khỏi tập nguồn ⇒ **con số "nhóm lớp bị
rớt" của Đ4 là số ĐÁY, không phải số thật.** Muốn biết Toại/Liên rớt bao nhiêu nhóm thì phải đo riêng
theo `userId`, không dùng lại Đ4.

**Việc phải làm, trước mọi việc khác của A:**
1. Hỏi vận hành: hai người này **còn giữ vai QLCS không?**
2. **Còn** ⇒ khôi phục dòng `UserOrgRole` **ngay**, không đợi SL-01 — rồi mới chạy `syncConversationMembership`.
3. **Không còn** ⇒ ghi vào biên bản là thu hồi **có chủ đích**, để lần đo sau không báo động lại.

#### [A-01-Đ3] — 78 dòng lệch giữa `User.centerId` và quyền thật

**78 không đọc thẳng thành "78 lỗi".** Truy vấn Đ3 đang trộn ba nhóm khác hẳn nhau:

| Nhóm | Nghĩa | Xử lý |
|---|---|---|
| `PARENT` — **phần lớn** | **Ngoại lệ CÓ CHỦ ĐÍCH**: vai quan hệ nạp quyền thẳng từ `RoleDef`, **không** cần dòng `UserOrgRole` nào (CLAUDE.md · `RELATIONSHIP_ROLE_CODES` trong `lib/auth/actor.ts`) | ❌ **KHÔNG phải lỗi.** Tuyệt đối **không** "vá" bằng cách gắn `UserOrgRole` cho phụ huynh — đúng cách làm đã bị LOẠI sau sự cố 10/08/2026 |
| **Nhân sự** | Nguyễn Hữu Thảo Vi · Võ Thị Kim Phụng · Lê Thị Phương · Huỳnh Thị Thanh Tuyền · Nguyễn Thị Hoa · Lisa Dương Hà… | 🔴 **Đây mới là tập nghi hỏng thật.** Phải **lọc ra riêng và rà từng người** |
| **Trùng tên** | Có **tài khoản "Hồ Đắc Phúc" THỨ HAI**: `cmsiq238k009zaafadq01ul14`, `centerId` = CS1, **không quyền nào** — trùng tên với tài khoản `SUPER_ADMIN` ở Đ1 | ⚠️ Bẫy cho **mọi** thao tác chọn người theo tên: gán quyền nhầm vào tài khoản rỗng ⇒ triệu chứng "đã gán rồi mà vẫn không có quyền", không có thông báo lỗi nào |

⇒ **Đ3 cần một biến thể lọc bỏ vai quan hệ trước khi dùng làm danh sách việc.** Ở dạng hiện tại nó
trộn ngoại lệ hợp lệ với lỗi thật, và **78 là con số gây hoảng sai** — báo cáo con số trần này lên cấp
trên sẽ dẫn tới quyết định sai.

#### [A-01-Đ4] — cú rớt nhóm chat lớp đã xảy ra thật

**Đinh Thảo My — CS2 — rớt khỏi 5 nhóm chat lớp của chính cơ sở mình quản.**

Đây đúng là kiểu hỏng âm thầm §6.9.1 dự báo: vẫn đăng nhập được, vẫn thấy báo cáo, chỉ **lặng lẽ không
còn trong nhóm lớp** — không thông báo lỗi nào. Nhưng nó nổ **khác chỗ dự báo hai điểm**:

- **Không phải anh Phúc.** Dự báo nhắm vào tài khoản kiêm `SUPER_ADMIN`; thực tế nạn nhân là một QLCS
  **thường**.
- **Đây là kiểu hỏng THỨ HAI, không phải Đ2.** Đ4 chỉ trả về người **đang có** `UserOrgRole` `ACTIVE`
  ⇒ Đinh Thảo My **vẫn còn quyền**, chỉ mất **tư cách thành viên chat**. Đ2 thì ngược lại: mất quyền.
  Hai ca này **chữa bằng hai việc khác nhau** — đừng gộp.

⇒ Khôi phục dòng `UserOrgRole` **không tự** kéo người ta về nhóm chat. Sau mọi lượt khôi phục quyền
**phải chạy lại `syncConversationMembership`** (luật cứng chat #5: đổi phân công phải sync **trong cùng
transaction** — ở đây là vá tay nên phải gọi tường minh).

#### Tổng kết bốn phép đo

| Điều §6.9 giả định | Số đo nói gì |
|---|---|
| SL-01 có thể thu hồi im lặng cấu hình gán tay | ✅ **Đúng** — 2 dòng mất ngày 20/08/2026 |
| Chỗ đau nằm ở tài khoản anh Phúc | ❌ **Sai người.** Anh Phúc được `SUPER_ADMIN` che; đau thật là 3 người khác **không có gì che** |
| Cấu hình đa cơ sở thật là số nhiều | ❌ **Chỉ 1** ⇒ backfill V-3 nhỏ hơn dự tính nhiều |
| Đ3 chỉ ra danh sách việc | ⚠️ **Một phần** — 78 dòng trộn ngoại lệ `PARENT` hợp lệ với lỗi thật |

⇒ **Giữ nguyên V-1 → V-2 → V-3** (số đo không bác bỏ việc nào), và **chèn thêm một việc số 0 đứng
trước cả SL-01**: chữa **3 tài khoản có dấu vết hỏng trên prod** — Đinh Thảo My **chắc chắn hỏng**
(còn quyền, mất chat); Phan Thanh Toại và Lê Thị Phương Liên **hỏng nếu họ còn giữ vai QLCS**, mà điều
đó chỉ vận hành trả lời được. SL-01 bịt lỗ cho tương lai; việc số 0 là chữa người đang đau hôm nay —
hai việc khác nhau, đừng để việc sau nuốt việc trước.

---

## 7. Open Questions

| # | Câu hỏi | Vì sao chặn | Chủ | Hạn |
|---|---|---|---|---|
| ~~**OQ-1**~~ | ~~`RBAC_V2_ENABLED` trên prod đang ON hay OFF?~~ | ✅ **ĐÃ GIẢI — không còn chặn.** `lib/auth/permission-decision.ts:48-49` trả kết quả grant **trước khi** đọc cờ; cờ chỉ dùng khi grant miss (`:55`). Cách làm ở §6.3 giữ key trong `ALL_ACTIONS` và chỉ làm rỗng danh sách role, nên không phụ thuộc trạng thái cờ. | — | Đóng |
| ~~**OQ-1b**~~ | ~~Có chặn cứng `leads:*` khỏi màn per-user không?~~ | ✅ **ĐÃ CHUYỂN THÀNH YÊU CẦU A-03-7.** Một rào an toàn không được để ở dạng câu hỏi mở. | — | Đóng |
| ~~**OQ-6**~~ | ~~Endpoint export giữ **CSV** hay đổi sang **`.xlsx`**?~~ | ✅ **ĐÃ CHỐT 24/08/2026 (B12): đổi sang `.xlsx`**, dùng `xlsx` (SheetJS) đã có ở `package.json:112` — không thêm thư viện. Sửa `route.ts:129-133` từ sinh CSV sang sinh workbook; header/`Content-Type` đổi theo. | — | Đóng |
| ~~**OQ-2**~~ | ~~"Từ cấp quản lý trở lên" trong A-03 gồm đúng những vai nào?~~ | ✅ **ĐÃ CHỐT 24/08/2026 (B11): quản lý từng cơ sở → quản lý khu vực (tỉnh/TP hoặc vùng) → giám đốc.** ⚠️ Hệ thống hôm nay **chỉ dựng được 2/3 tầng**: `CENTER_MANAGER` có; giám đốc = `SUPER_ADMIN`; **không có vai quản lý khu vực** (15 RoleDef ở `prisma/seed-roles.ts`, không vai nào neo REGION) và picker đơn vị **cố ý** loại node REGION (`lib/org/org-tree.ts:172-178`). ⇒ **nhóm A-03 v1 = `CENTER_MANAGER` + `SUPER_ADMIN`**; tầng khu vực = thêm RoleDef + mở neo vai tại REGION, để P2. Vai **chức năng** Hội sở (`HO_HR`/`HO_ACCOUNTANT`/`HO_MARKETING`/`HO_SALE`) **không** thuộc nhóm này. | — | Đóng |
| ⚙️ ~~**OQ-3**~~ | **Chốt kỹ thuật 24/08/2026 (đề xuất của Dev, chờ phản đối):** dropdown **checkbox** dựng bằng `Popover` + `Checkbox` của shadcn đã có trong repo — **không** thêm thư viện, **không** dùng `<select multiple>` native (rất khó bấm ở viewport 375px, và không hiện được nhãn "Tất cả cơ sở"). | Repo **chưa có** multi-select và **cấm** thêm thư viện UI mới. | Dev | Trước khi code A-02 |
| ~~**OQ-4**~~ | ~~Khi QLCS chọn nhiều cơ sở, các con số của 4 tab hiển thị **gộp** hay **tách theo cơ sở**?~~ | ✅ **ĐÃ CHỐT 24/08/2026: MẶC ĐỊNH GỘP + CÔNG TẮC "Tách theo cơ sở".** Mở tab ra là số gộp của phạm vi đang chọn; bật công tắc thì mỗi cơ sở một dòng/cột, kèm dòng **Tổng**. ⇒ Mọi truy vấn của B/C/D/E nhận `groupByCenter: boolean` và **trả được cả hai dạng** — không được viết cứng một dạng rồi chắp vá sau. Công tắc **chỉ hiện khi đang chọn ≥ 2 cơ sở** (1 cơ sở thì tách = gộp, hiện ra chỉ gây nhiễu). | — | Đóng |
| ~~**OQ-5**~~ | ~~Có QLCS đa cơ sở nào **thật** trên prod chưa?~~ | 🔴 **ĐÃ TRẢ LỜI 24/08/2026: CÓ RỒI, đang xử lý tạm bằng tay.** ⇒ (1) **cần script backfill `UserOrgRole`** cho các cấu hình tay hiện có; (2) **SL-01 thành việc gấp, không phải việc "nên có"** — hôm nay cấu hình gán tay có thể bị `reconcileUserOrgRoles` thu hồi im lặng khi ai đó sửa ô "Đơn vị" ở `users/_actions.ts:363-380` hoặc `nhan-su/actions.ts:377`; (3) **phải đo prod trước** (đếm user có >1 `UserOrgRole` cơ sở, đối chiếu `User.centerId`) rồi mới viết backfill. | — | Đóng, sinh việc mới |
| ~~**OQ-7**~~ | ~~Có mở `roles:assign` cho `HO_HR` không?~~ | ✅ **ĐÃ CHỐT 24/08/2026: MỞ cho `HO_HR`** (đảo lại quyết định đầu ngày). Seed thêm `roles:assign` cho `HO_HR` trong `prisma/seed-roles.ts`, **kèm 3 rào ở §6.10** — nếu mở trần thì HR tự cấp được gần như mọi quyền cho chính mình. ⚠️ Sau merge `test` → `main` **phải chạy `seed-prod-roles.yml`**. | — | Đóng |
| ~~**OQ-8**~~ | ~~Cơ sở thứ hai của QLCS có thuộc REGION khác thật không?~~ | ✅ **ĐÃ CHỐT 24/08/2026: CÓ — cơ sở khác vùng là ca thật, phải đỡ được.** ⇒ (1) dữ liệu test A-01 **bắt buộc** có **REGION thứ hai** (hiện chỉ `DANANG`); (2) e2e phải phủ ca "một QLCS giữ 2 cơ sở **khác vùng**"; (3) không chỗ nào được suy phạm vi từ vùng — đi qua `getSubtreeCenterIds` như cũ. | — | Đóng |

---

## 8. Timeline & Phasing

Theo spec: **A chặn tất cả phần còn lại**. Thứ tự trong A:

| Bước | Nội dung | Phụ thuộc | Ghi chú |
|---|---|---|---|
| **A.1** | Test đỏ trước (luật cứng Nền Hệ thống #5): e2e đa cơ sở khác vùng + e2e chống IDOR bộ lọc + e2e 403 export | — | Chưa có test đỏ thì chưa được viết Server Action |
| **A.2** | A-01: chặn neo vai tại HO/ROOT ở form gán vai; hiện số cơ sở đang giữ | A.1 | Không đổi schema |
| **A.3** | A-02: `resolveScopeFilters()` + `scope-filter-bar.tsx` + khung 4 tab | A.2 (cần `visibleCenterIds` đúng) | Sửa `lib/reports/filters.ts`; **không** đụng 8 trang `/bao-cao/*` đang dùng `resolveReportFilters()` |
| **A.4** | A-03: call-site `leads:export` + gỡ khỏi role/seed + nhóm quyền + audit | OQ-1 đã trả lời | Cần chạy `seed-prod-roles.yml` sau merge `main` |
| **A.5** | Cập nhật `documentation/permissions.md` + `documentation/flows.md` | A.2–A.4 | Luật cứng #10: kết thúc phiên phải cập nhật tài liệu |

**Ràng buộc môi trường:** `test.satarobo.vn` và máy local **dùng chung một DB** (CLAUDE.md). Mọi migration DROP/RENAME sẽ xoá dữ liệu đang làm việc ở local. A không có migration nào thuộc loại đó.

---

## 9. Red-team — tấn công chính giả định của PRD này

Năm mũi tấn công độc lập, mỗi mũi được giao nhiệm vụ **bác bỏ** một khẳng định chịu lực bằng cách đọc mã, không phải xác nhận nó.

| # | Khẳng định bị tấn công | Kết luận |
|---|---|---|
| RT-1 | A-01 không cần đổi schema | ⚠️ **Đúng nhưng có điều kiện** — đúng nghĩa "có chỗ để lưu", sai nghĩa "đã đủ" |
| RT-2 | A-02 cho chọn "tất cả cơ sở" là an toàn vì scopedDb vẫn chặn | 🔴 **BÁC BỎ** |
| RT-3 | A-03 `dataScope=ALL` an toàn vì scopedDb lo cách ly | ⚠️ **Đúng nhưng có điều kiện** — chỉ đúng nếu cấm đường per-user |
| RT-4 | Gỡ `leads:export` khỏi v1 là an toàn vì prod chạy v2 | ⚠️ **Đúng nhưng lý do SAI**, và cách gỡ ngây thơ sẽ hỏng |
| RT-5 | Mở rộng `lib/reports/filters.ts` không phá 8 trang báo cáo | ⚠️ **Đúng trên đúng một đường** (additive), sai nếu đổi kiểu |

### RT-2 — 🔴 BÁC BỎ: "centerIds = null thì scopedDb vẫn chặn"

`injectScope` **thoát ngay** nếu model không thuộc `SCOPED_MODELS` và trả `args` nguyên vẹn (`lib/db-scope.ts:269`). Với các model của 4 tab, điều đó có nghĩa:

| Model | Vấn đề | Bằng chứng |
|---|---|---|
| `AdsInsightDaily` | **Không có cột `centerId`** ⇒ scopedDb về nguyên tắc không chặn được | `prisma/schema.prisma:947-961` |
| `MarketingCostPeriod` | **Không có cột `centerId`**; unique theo `period` đơn | `prisma/schema.prisma:935-944` |
| `Conversation` | Nằm trong `SCOPE_EXEMPT` — cách ly phải **filter TAY** | `lib/db-scope.ts:125` |
| `RevenueTarget` | Nằm trong `SCOPE_EXEMPT`; `centerId = null` nghĩa **mục tiêu toàn hệ thống** | `lib/db-scope.ts:86`; `prisma/schema.prisma:6022` |

**Đã rò từ hôm nay, không phải rủi ro tương lai:** `lib/crm/funnel-query.ts:15` gom `spend` bằng `db` **trần**, `aggregate` **không có `where`**; trang `app/(admin)/admin/marketing/funnel/page.tsx:18` chỉ gác `leads:view-all` — quyền mà `CENTER_MANAGER` **đã có** (`prisma/seed-roles.ts:400-403`). ⇒ QLCS hiện đã xem được chi phí quảng cáo **toàn hệ thống**.

**Vì sao ESLint không bắt:** lệnh cấm import `@/lib/db` trần chỉ áp cho `app/(admin|portal)/**` (`eslint.config.mjs:158, 211`). Helper trong `lib/**` đi đường vòng **hợp lệ** — trang dashboard trông sạch mà dữ liệu vẫn không được scope.

**Hệ quả riêng cho A-01 + A-02 (sai số, không chỉ rò):** `RevenueTarget` có `@@unique([centerId, period])` và Postgres coi `NULL` là DISTINCT. Query hiện tại `where: { centerId: filters.centerId }` (`bao-cao/doanh-thu/page.tsx:76-79`) khi `centerId = null` sẽ đọc đúng **dòng mục tiêu toàn công ty**. QLCS 2 cơ sở chọn "tất cả" sẽ bị so **doanh thu 2 cơ sở của mình** với **mục tiêu cả công ty**. Chuyển sang `{ in: [...] }` lại **loại mất** dòng `centerId = null` đó.

### RT-3 — Điều kiện để A-03 an toàn

Ba hướng tấn công **thất bại** (tức PRD đúng): route dùng `scopedDb` (`route.ts:53-54`), **không** nhận `centerId` từ query string (`:31-37`), `select` **không** nested include model scoped nào (`:58-75`).

Nhưng lập luận "scopedDb lo cách ly" là **vòng tròn**: tầm nhìn cơ sở của `Lead` được suy **từ chính tập quyền `leads:*`** của actor (`lib/db-scope.ts:225-264`). Chi tiết + biện pháp: §6.3b.

### RT-4 — Cách gỡ khỏi v1 phải rất cụ thể

Lý do trong PRD gốc ("prod chạy v2") **sai về cơ chế**: grant thắng **không nhờ cờ** (`lib/auth/permission-decision.ts:48-49`). Và cách gỡ ngây thơ — xoá key khỏi `PERMISSIONS` — sẽ: (a) làm `ALL_ACTIONS` mất key ⇒ `buildActor` vứt im lặng mọi grant mang key đó (`lib/auth/actor.ts:369`); (b) làm key biến mất khỏi `z.enum(ALL_ACTIONS)` (`lib/validators/permission-grant.ts:6`) và khỏi dropdown thêm grant; (c) **CI đỏ** vì `lib/permissions/registry.test.ts:76-85`. Cách đúng ở §6.3 bước 2.

### RT-1 — A-01: "có chỗ để lưu" ≠ "đã đủ"

Không bác được phần schema: `@@id([userId, orgUnitId, roleId])` (`prisma/schema.prisma:536`), không validator nào chặn (`lib/validators/role.ts:53-66`), `getSubtreeCenterIds` trả `[self.centerId]` cho node `CENTER` (`lib/org/org-tree.ts:58-71`) ⇒ hai cơ sở khác vùng cộng đúng.

Nhưng **đường ghi và các cổng quyền vẫn so với MỘT giá trị**:

| Loại | Số lượng | Ví dụ nặng nhất |
|---|---|---|
| Cổng dạng `record.centerId === user.centerId` | ~10 | `canManageSessionClass` — `app/(admin)/admin/sessions/[id]/_actions.ts:38` (khoá **điểm danh / chốt buổi**); `students/[id]/_actions.ts:27`; `lib/lms/skill-access.ts:19` |
| Đường tạo bản ghi lấy thẳng `session.user.centerId` | ~8 | `cham-cong/chinh-cong/_actions.ts:45`; `duyet-ca/_actions.ts:48-50` (**ÉP** về cơ sở JWT); `lib/lead/import.ts:72-80` |

⇒ Hệ quả cụ thể: **QLCS 2 cơ sở XEM được lớp CS2 nhưng KHÔNG điểm danh / chốt buổi được.**

`session.user.centerId` là **ảnh chụp lúc đăng nhập** (`lib/auth.ts:203-215`); gán vai mới **không** bump `tokenVersion` (`lib/auth/rbac-service.ts:172-241`) ⇒ người vừa được gán cơ sở thứ hai phải **đăng xuất/đăng nhập lại**.

### RT-5 — A-02: additive thì được, đổi kiểu thì vỡ

Chi tiết ở §6.2 mục 6–8. Tóm tắt: đổi `ReportFilters.centerId` vỡ 11 chỗ đọc + 8 chỗ `selection` + **1 đường ghi** (form mục tiêu doanh thu); quên sửa `reportFilterCacheKey` gây **trộn cache 120 giây**; `ReportFilterSearchParams` không được page nào import nên typecheck **không** bảo vệ.

### Những chỗ PRD đã lập luận đúng — không bịa nghi ngờ

- `UserOrgRole` **thật sự** đủ để lưu N cơ sở khác vùng; `buildActor` union đúng; `getSubtreeCenterIds` cho node `CENTER` đúng.
- Endpoint export **thật sự** đã đi qua `scopedDb`, **không** nhận `centerId` từ URL, **không** nested include model scoped, đã mask PII + watermark + audit.
- Chọn cơ chế **(b) `UserGroup` + `PermissionGrant`** thay vì (a) per-user là **đúng**, và red-team làm rõ lý do mạnh hơn PRD gốc nêu.
- `resolveReportFilters` **thật sự** đã chống IDOR đúng cách và là chỗ đúng để mở rộng.
- `leads:export` **thật sự** là key chết, và endpoint **thật sự** đang gác nhầm bằng `leads:view-all`.

---

## 10. DANH SÁCH THAY ĐỔI SCHEMA CẦN KHOÁ TRƯỚC KHI BẮT ĐẦU F VÀ G

Đây là kết quả chính của vòng red-team. Ba luật cứng chi phối mọi mục dưới đây:

- **Luật #3** — bảng **mới** có dữ liệu theo đơn vị **bắt buộc** có `orgUnitId` (**không** thêm `centerId` mới); bảng **cũ** ghi kép cả hai tới hết P4.
- **Luật #4** — không tự ý sinh migration đổi/bỏ cột trên bảng đang có dữ liệu PROD; chỉ trong story được giao, có dry-run, Dev chạy tay.
- Model mới phải khai **cả hai** nơi: `SCOPED_MODELS` (`lib/db-scope.ts:11`) **và** `BACKFILL_SPECS` (`lib/org/center-bridge.ts:45`). Quên → test `[US-07-IT-08b]` đỏ hoặc dữ liệu rò im lặng.

> ✅ **SL-00 — ĐÃ CHỐT 24/08/2026 (quyết định B1): bảng mới mang CẢ HAI cột.** Phần dưới giữ nguyên làm lý lẽ.
>
> 🔴 ~~**SL-00 — MÂU THUẪN PHẢI CHỐT TRƯỚC DÒNG CODE ĐẦU TIÊN CỦA F VÀ G.**~~
> Luật #3 nói bảng **mới** mang `orgUnitId`, **không** thêm `centerId` mới. Nhưng `injectScope` **chỉ** chèn `centerId: { in: [...] }` (`lib/db-scope.ts:277-279`) — cho tới khi cutover `orgScope.cutoverEnabled` được bật.
> ⇒ **Bảng mới nào cần `scopedDb` cách ly thì BẮT BUỘC mang CẢ HAI cột** `centerId` + `orgUnitId`, nếu không nó sẽ có `orgUnitId` đẹp đẽ mà **không bao giờ được lọc**.
> Ngoại lệ có chủ đích: bảng **không** phải dữ liệu theo đơn vị (vd sở thích cá nhân — SL-13) thì **không** mang cột nào cả.
> F + G cộng lại đẻ **ít nhất 5 bảng mới**; mỗi bảng ra đời theo một cách hiểu khác nhau là một lần đánh cược, và sửa sau = migration trên bảng đã có dữ liệu prod (luật #4).

### 10.1 Khoá trước **A** (1 mục — chặn chính A-01)

| # | Bảng | Thay đổi | Vì sao phải khoá trước | Loại |
|---|---|---|---|---|
| 🔴 **SL-01** (GẤP — xem OQ-5) | `UserOrgRole` | ⚠️ **24/08/2026: mức độ đổi từ "nên có" thành GẤP.** Chủ dự án xác nhận **trên prod ĐANG có cấu hình đa cơ sở gán tay** ⇒ lỗ hổng dưới đây **không còn là giả thuyết**, nó đang chờ nổ ở lần sửa ô "Đơn vị" tiếp theo. Thêm cột nguồn gốc dòng, vd `source` (`AUTO` / `MANUAL`, mặc định `AUTO`, additive nullable rồi backfill). Nhánh thu hồi của `reconcileUserOrgRoles` **chỉ** được đụng dòng `source = AUTO`. | Hôm nay reconcile phân biệt "tự sinh" vs "gán tay" bằng cách **suy lại `prevPlan` từ MỘT đơn vị neo** (`lib/auth/legacy-role-map.ts:96-122`) — schema **không có cột nào ghi ai tạo ra dòng**. Khi đơn vị neo cũ **trùng đúng** cơ sở được gán tay, dòng gán tay rơi vào `prevPlan` và bị `EXPIRED` (`lib/auth/org-role-sync.ts:198-229`). Hai màn kích hoạt: `users/_actions.ts:363-380`, `nhan-su/actions.ts:377` → `lib/hr/sync-employee-unit.ts:77-89`. ⇒ Cấu hình đa cơ sở bị phá bởi một thao tác **không nhằm thu hồi quyền**. | **ADDITIVE** |

> Có thể vá thuần code (bỏ qua dòng không do lần sync trước tạo), nhưng cách bền là ghi nguồn ngay trên dòng. **Đây là thay đổi schema duy nhất khu vực A cần.**

### 10.2 Khoá trước **F** (kho media & duyệt ảnh/video)

Hiện trạng: **có** `ClassSessionMedia` (`prisma/schema.prisma:4501`) + `MediaStudentTag` (`:4557`) + enum `MediaStatus` (`:4492` — `PENDING/APPROVED/REJECTED/DRAFT`). Luồng ảnh lớp đã chạy thật trên prod. Nhưng toàn bộ là **ẢNH-ONLY**.

| # | Bảng | Thay đổi | Vì sao phải khoá trước F | Loại |
|---|---|---|---|---|
| **SL-02** | `ClassSessionMedia`, `MediaStudentTag` | Thêm `orgUnitId String?` (+ `centerId String?` ghi kép, vì là bảng **cũ**); khai vào `SCOPED_MODELS` **và** `BACKFILL_SPECS`; index `[centerId, status]`. | 🔴 **Cả hai model KHÔNG có `centerId`, KHÔNG có `orgUnitId`, KHÔNG nằm trong `SCOPED_MODELS`** — cách ly cơ sở hiện làm **TAY** qua tập `classId` đã scope. Trang duyệt F-10/F-12 và báo cáo SLA F-30 của **QLCS đa cơ sở** sẽ **không có gì để lọc**, và `injectScope` thoát ngay ở `lib/db-scope.ts:269`. Đây là mục **nặng nhất** của cả danh sách. | **ADDITIVE** |
| **SL-03** | enum `MediaStatus` | Thêm `DELETED` — **đặt CUỐI** enum (khớp thứ tự `ALTER TYPE ADD VALUE`, đúng quy ước đã ghi tại `:4495-4497`). Đồng thời chốt: F-03 nói "xoá khỏi R2, **không** soft-delete" ⇒ nếu xoá hẳn row thì phải có bảng vết xoá; nếu giữ row thì `DELETED` là trạng thái. | Enum hiện có `REJECTED`, **không có** `DELETED`; đường duyệt `app/(admin)/admin/media/actions.ts:385-387` chỉ nhận `APPROVED` / `REJECTED`. Và **xoá hiện KHÔNG đụng R2**: `actions.ts:439` chỉ `delete` row DB; `lib/lms/media-publish.ts:12` ghi thẳng điều đó. Đường xoá object R2 duy nhất (`app/api/admin/upload-delete/route.ts:64`) **không** được luồng media nào gọi. ⚠️ Thêm `deletedAt`/`deletedById`/`deleteReason`: **xoá cứng là mất vĩnh viễn**, mỗi ngày trôi qua trước khi khoá là một ngày số liệu SLA F-30 **không thể khôi phục**. | **ADDITIVE** (enum + 3 cột); phần xoá R2 là code |
| **SL-04** | `ClassSessionMedia` | Thêm `kind` (`IMAGE` / `VIDEO`), `mimeType String?`, `durationSec Int?`, và trạng thái nén (vd `transcodeStatus`). | F-17/F-18/F-19 (video duyệt chung luồng, bắt buộc xem hết, badge tiến độ) **bất khả thi** nếu không phân biệt được ảnh với video. Hôm nay upload lọc cứng `image/*` (`teacher/anh-lop/_components/upload-photo-dialog.tsx:159`, `admin/media/_components/media-client.tsx:279`) và **không field nào** phân biệt. F-02 (H.264/720p) cũng không có chỗ lưu trạng thái. | **ADDITIVE** |
| **SL-05** | **BẢNG MỚI** `MediaWatchProgress` | `(userId, mediaId, watchedSeconds Int, durationSec Int?, completedAt DateTime?, centerId String?, orgUnitId String?)`, unique `[mediaId, userId]`. Ngưỡng 95% là **hằng số tầng mã**, không nhét vào schema. | F-18 đòi theo dõi `watchedDuration >= 95% duration` **theo user + media**, và tua nhanh không tính. **Không tồn tại gì tương đương.** Nút "Duyệt tất cả" (F-13) phụ thuộc trực tiếp vào bảng này. Mang **cả hai** cột phạm vi — xem SL-00. Khoá unique là thứ **không sửa rẻ** sau khi có dữ liệu. | **BẢNG MỚI** |
| **SL-06** | **BẢNG MỚI** `ClassMediaReviewDay` | `(classId, reviewDate Date, status, noPhotoNote Text?, deadlineAt DateTime, reviewedById, reviewedAt, centerId String?, orgUnitId String?)`, unique `[classId, reviewDate]`. | Gánh **bốn** yêu cầu chưa có chỗ lưu: F-14 ghi chú giải trình "hôm nay không có ảnh"; F-13 mốc "đã duyệt cả folder"; F-20 hạn duyệt (mặc định 10h sáng hôm sau); F-30..F-32 báo cáo SLA (`Chưa duyệt` / `Đã duyệt` / `Phê duyệt trễ` / `Không có ảnh` + cột Ghi chú). Không có bảng này thì **không dựng nổi bảng SLA**. Mang **cả hai** cột phạm vi — xem SL-00. | **BẢNG MỚI** |
| **SL-07** | `ClassSessionMedia` ↔ `ReportCard` | Thêm liên kết (cột `reportCardId` hoặc bảng nối) + `retentionDueAt DateTime?`. | F-05 (xoá sau 12 tháng **nếu học bạ đã xuất**; giữ lại + ghi log nếu học bạ **chưa xuất**) cần biết media thuộc học bạ nào. Hôm nay `ReportCard` **không có** field media nào, không có bảng nối. `lib/compliance/retention.ts:11` mặc định **5 NĂM** và áp cho hồ sơ học viên, không phải media; cron `retention-scan` chỉ `console.warn` đếm số, **không xoá gì**. | **ADDITIVE** |

### 10.3 Khoá trước **G** (module Lead)

Hiện trạng: `Lead` 46 trường vô hướng, **có cả** `centerId` lẫn `orgUnitId`, đã ở trong `SCOPED_MODELS`. `LeadChild` (`:1461`) đã đóng vai "1 PH – N con" và **đã nối `Enrollment` qua `leadChildId`** (`:1833`, `:1881`).

🔴 **ĐÍNH CHÍNH:** điều đó **CHƯA đủ** để "doanh số theo học sinh". Tiền nằm ở `Order` → `Payment`, mà **`Order` chỉ có `leadId`, KHÔNG có `leadChildId`** (`prisma/schema.prisma` model `Order`, chỉ `leadId String?` + `@@index([leadId])`). Một phụ huynh hai con ⇒ không quy được đơn về đúng con. Xem **SL-09b**.

| # | Bảng | Thay đổi | Vì sao phải khoá trước G | Loại |
|---|---|---|---|---|
| **SL-08** | `LeadChild` | Thêm `centerId String?` + `orgUnitId String?`; khai vào `SCOPED_MODELS` + `BACKFILL_SPECS`. | `LeadChild` **không có cột cách ly nào** ⇒ `scopedDb` không auto-scope; cách ly chỉ gián tiếp qua `Lead` cha. G-07 nói **doanh số và trạng thái chốt ghi nhận theo từng học sinh** ⇒ `LeadChild` trở thành **đơn vị sinh doanh thu** và bảng C-03 đọc thẳng nó. Không khoá trước = rò chéo cơ sở ở đúng bảng tiền. | **ADDITIVE** |
| **SL-09** | `LeadChild` | Thêm enum **MỚI** `LeadChildStatus` (tối thiểu `NEW`, `CONSULTING`, `TRIAL_SCHEDULED`, `TRIAL_ATTENDED`, `ENROLLED`, `LOST`) + cột `status`, `closedAt DateTime?`, `contractValue Int?`. **KHÔNG tái dùng `LeadStatus` 15 giá trị** của cấp phụ huynh. | G-07 + C-03 đòi "thời điểm chốt", "giá trị", "% trên tổng doanh thu" **theo học sinh**. Hôm nay `LeadChild` chỉ có `trialStatus` (`NONE/SCHEDULED/IN_PROGRESS/ATTENDED`) — **học thử**, không phải chốt. `Lead.convertedAt` (`:1347`) là mốc của **lead**, không của từng con. | **ADDITIVE** |
| **SL-09b** | `Order` | ✅ **CHỐT 24/08/2026 (B4): phương án (a)** — `Order.leadChildId String?` + relation + `@@index([leadChildId])`, quy tắc **một đơn – một con**. Phương án (b) `OrderLeadChildAllocation` **loại**. Nguồn số của "doanh số theo học sinh" = **`Payment` CONFIRMED** (B3), không phải `Order.totalAmount`. Đơn cũ: backfill tự động chỉ khi lead có **đúng 1** con; còn lại để `null` và báo cáo phải hiện dòng "chưa quy được về con". | G-07 "doanh số ghi nhận theo **TỪNG học sinh**" **không hiện thực được** với schema hiện tại: `Order` chỉ có `leadId`. Chốt **sau** khi báo cáo C-03 đã chạy = phải quy lại **toàn bộ đơn cũ bằng tay**. | **ADDITIVE** |
| **SL-10** | `Lead` — ✅ **tầng đã chốt 24/08/2026 (câu B5)** | Nhóm **bắt buộc** của G-06, đã bỏ danh mục theo quyết định 12(b): ~~`lostReasonId`~~ **`lostNote Text?` (ô ghi chú tự do, BẮT BUỘC khi đánh dấu rớt)** + `lostAt DateTime?`; `contractValue Int?`; `campaignId` / `adId`. ⚠️ Trạng thái rớt vẫn ở `LeadChild.status` (SL-09) — chỉ **lý do** ở cấp phụ huynh, và con rớt sau **ghi đè** ghi chú của con trước. | C-05/C-06 **không chạy được** nếu thiếu: "lý do rớt (enum cấu hình)" là **bắt buộc** khi sale đánh dấu rớt. grep `lostReason` / `lostAt` toàn schema = **0 hit**. `utm*` + `fbclid/fbp/fbc` đã có nhưng **không phải** Ad/Campaign ID ⇒ D-04/D-05 chỉ tính CPL mức tổng, không bóc theo campaign. | **ADDITIVE** |
| **SL-11** | **BẢNG MỚI** ~~`LeadLostReason`~~ **`LeadSource`** | ✅ 24/08/2026: **bỏ `LeadLostReason`** — lý do rớt là ô ghi chú tự do (12(b)). Còn **một** danh mục cấu hình được: `(code, label, isActive, displayOrder)`. ⏳ Giá trị khởi tạo của `LeadSource` **vẫn chờ** vận hành. `Lead.source` hiện là **String tự do** (`:1327`) — không enum, không danh mục. | Spec nói "enum **cấu hình được**" ⇒ phải là bảng danh mục, không phải enum Postgres (đổi enum = migration, trái tinh thần "admin tự set"). Đang để trống trong Cấu hình vận hành (mục cuối spec). | **BẢNG MỚI** |
| **SL-12** | `Lead` | G-01 còn thiếu **6 trường**: giới tính PH, ngày sinh PH, link Facebook PH, địa chỉ (TP / phường / chi tiết), người nhập lead (`createdById` + `createdByName` dạng `mãNV_tên`), lớp tại trung tâm. | Đối chiếu thật: `Lead` **không có** `gender` / `dob` cho PH (chỉ `LeadChild.gender:1468`, `LeadChild.dob:1466`); `fbclid/fbp/fbc` là tham số quảng cáo **không phải** link profile; **không có** cột địa chỉ (mẫu có sẵn ở `Student.address/ward/district/city:1545-1548`); **không có** `createdById` — chỉ suy gián tiếp từ `LeadAuditLog action='CREATE'`, tức **mất** với dữ liệu tạo trước khi bật audit. | **ADDITIVE** |
| **SL-13** | **BẢNG MỚI** `UserTablePreference` | `(userId, tableKey, columns Json, pageSize Int?, updatedAt)`, unique `[userId, tableKey]`. **Chốt tường minh: bảng này KHÔNG mang `centerId`/`orgUnitId`** — là sở thích cá nhân, không phải dữ liệu theo đơn vị (ngoại lệ có chủ đích của SL-00). | G-04 "tuỳ chọn cột kiểu MISA, lưu theo **từng user**" — grep `Preference` / `columnPref` / `visibleColumns` / `SavedView` / `TableView` trên schema = **0 kết quả**. `SystemSetting` theo key toàn cục, `CenterSetting` theo `(orgUnitId, key)` — **cả hai không có chiều `userId`**. Phải tạo mới. | **BẢNG MỚI** |
| **SL-14** | enum `LeadStatus` | **Chốt bảng ánh xạ**, không drop giá trị. | Spec G-06 nêu **6** trạng thái; enum hiện có **15** (`:37-55`). 6 giá trị ánh xạ được (`NEW`, `CONSULTING`, `TRIAL_SCHEDULED`, `TRIAL_ATTENDED`, `ENROLLED`, `LOST`), còn **9 giá trị thừa** đang có dữ liệu PROD. Luật #4 cấm drop ⇒ phải chốt ánh xạ **trước** khi C-02/C-03 đếm, nếu không mỗi báo cáo đếm một kiểu. | **KHÔNG đổi schema** — chốt quy ước |
| **SL-15** | `Lead.childName`, `Lead.childAge` | **KHÔNG drop ở giai đoạn G.** Làm 2-phase: G ghi vào `LeadChild`, giữ 2 cột cũ đọc-only; drop ở phase sau khi prod ổn định. | G-05 nói "bỏ trường cũ, **thay thế hoàn toàn**" — **xung đột trực tiếp** với chú thích ngay trong schema (`:1459-1460`: *"giữ đọc-only (2-phase, KHÔNG drop)"*) và với luật cứng #4. | **PHÁ VỠ nếu làm theo câu chữ spec** |

### 10.4 Ngoài phạm vi câu hỏi nhưng **cùng loại nợ** — chặn C và D, không chặn F/G

Ghi ở đây để không bị quên khi sang giai đoạn dashboard (chi tiết ở §9 / RT-2):

| Bảng | Vấn đề | Chặn |
|---|---|---|
| `AdsInsightDaily` (`prisma/schema.prisma:947-961`) | **Không có `centerId`** ⇒ scopedDb không thể chặn. Cần `orgUnitId` + `SCOPED_MODELS` + map prefix; hoặc khai vào `NULL_IS_GLOBAL_MODELS` và **công khai** rằng số này là toàn hệ thống. | D |
| `MarketingCostPeriod` (`:935-944`) | **Không có `centerId`**; unique theo `period` đơn ⇒ không tách được theo cơ sở. Cần `@@unique([period, centerId])` hoặc bảng phân bổ `MarketingCostAllocation`. | D |
| `RevenueTarget` (`:6022`) | Nằm trong `SCOPE_EXEMPT` (`lib/db-scope.ts:86`); `centerId = null` nghĩa **mục tiêu toàn hệ thống**, và `@@unique([centerId, period])` coi `NULL` là DISTINCT. Query hiện tại `where: { centerId: filters.centerId }` khi null sẽ đọc đúng dòng toàn công ty. | B |
| `Conversation` | Nằm trong `SCOPE_EXEMPT` (`lib/db-scope.ts:125`) — cách ly phải **filter TAY**. | E |

### 10.5 Thứ tự khoá đề nghị

0. **SL-00 trước tất cả** — chốt quy ước `centerId` + `orgUnitId` cho bảng mới, viết vào `documentation/` **trước dòng code đầu tiên** của F và G. Đây là quyết định, không phải migration, nhưng sai nó thì 5 bảng mới đều phải sửa lại.
1. **SL-01** ngay trong A (chặn chính A-01) — cũng chặn cả F và G, vì cả hai đứng trên cấu hình đa cơ sở: cấu hình mục nát thì mọi nghiệm thu F/G đều là ảo.
2. Trước khi mở giai đoạn **F**: SL-02 → SL-03 → SL-04 → SL-05 → SL-06 → SL-07. Trong đó **SL-02 là điều kiện cần**: mọi bảng phụ của F đều trỏ về `ClassSessionMedia`; bảng gốc không có cột phạm vi thì mọi bảng con buộc phải lọc TAY, và mỗi màn mới là một lần phải nhớ.
3. Trước khi mở giai đoạn **G**: SL-08 → SL-09 → **SL-09b** → SL-10 → SL-11 → SL-12 → SL-13, kèm **chốt** SL-14 và SL-15 (hai mục này là quyết định, không phải migration).
   ⚠️ **SL-09b và SL-12 khoá DANH SÁCH CỘT CUỐI CÙNG** của bảng lead. G-04 (tuỳ chọn cột theo user) lưu cấu hình theo tên cột — đổi danh sách **sau** khi người dùng đã lưu thì cấu hình thành mồ côi.
4. Mọi migration ở trên: **additive trước, drop sau khi prod ổn định** (2-phase), có dry-run, người vận hành chạy tay trên PROD (luật #4).

> ⚠️ Nhắc lại ràng buộc môi trường: `test.satarobo.vn` và máy local **dùng chung một DB**. Migration DROP/RENAME sẽ xoá dữ liệu đang làm việc ở local — thêm một lý do để mọi mục trên đều đi đường additive.
