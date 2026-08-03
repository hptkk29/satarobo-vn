# 01 — Ý định ↔ Hiện thực

**Ngày đo:** 28/07/2026 · **Phạm vi:** BƯỚC 1 · **Nền:** [`00-baseline.md`](00-baseline.md) · [`00-scope-gap.md`](00-scope-gap.md) · [`00-dryrun.md`](00-dryrun.md)
**Phương pháp:** skill `pm-ai-shipping:intended-vs-implemented`. Mỗi khoảng cách phải có **4 vế**: trích nguyên văn ý định (+ `file:dòng`) · điểm enforce thật trong code (+ `file:dòng`) · ai chạm được dữ liệu của ai · cách vá cụ thể. Không đủ 4 vế = **câu hỏi**, không phải finding.

**Quy mô:** soi **6 ranh giới** → **100 khoảng cách** + chấm riêng **D1–D12** + **11** phép đo bổ sung từ vòng phê bình tính đầy đủ.
**Kiểm chứng:** 68 khoảng cách rủi ro đã qua **kiểm chứng viên độc lập có nhiệm vụ BÁC BỎ** → 42 giữ nguyên · **26 bị sửa/hạ mức** · 0 bị bác hoàn toàn. Mọi chỗ bị sửa đều đánh dấu ⚠️.

| Verdict | Số lượng |
|---|---|
| **KHỚP** — tài liệu nói đúng, code làm đúng | **32** |
| **LỆCH** — tài liệu nói một đằng, code làm một nẻo | **60** |
| **DOC_LỖI_THỜI** — code đúng, tài liệu cũ | **8** |
| *Trong đó* **có ranh giới bị vượt** (`matters=CÓ`) | **28** |

---

## 0. Ba câu trả lời cho ba câu hỏi lớn nhất

**Câu 1 — Cổng cách ly dữ liệu có đóng không?** `[QS]` **Đóng đúng nửa dưới, hở toàn bộ nửa trên.**
CLAUDE.md tuyên bố *"Cổng DB ĐÃ ĐÓNG (không còn là 'target')… Allowlist còn đúng 3 file exception"* (`CLAUDE.md:19`). Rule ESLint **có thật, severity `error` thật**, allowlist **đúng 3 entry thật** — nhưng chỉ áp cho `app/(admin)/**`, `app/(portal)/**`, `app/(teacher)/**` (`eslint.config.mjs:100-168`). **`lib/**` — nơi chứa toàn bộ logic nghiệp vụ — nằm ngoài cổng.** Đếm lại: **156 file** `lib/` import `@/lib/db` trần, **94 file** trong đó **ĐỌC** `SCOPED_MODELS`, **29 file GHI**. Allowlist "3 exception" tạo ấn tượng cổng gần như kín; bề mặt thật lớn hơn ~50 lần.

**Câu 2 — 12 quyết định đã chốt có triển khai được không?** `[QS]` **2/12 đã có · 6/12 có một phần · 2/12 không có · 4 quyết định TẮC vì thiếu tiền đề.** Chi tiết §2.

**Câu 3 — Điều gì nguy hiểm nhất mà chưa ai nêu?** `[QS]` **Media trên R2 là URL công khai vĩnh viễn.** Doc 15 vẽ *"R2 private bucket, signed URL 15'"*; thực tế cả 3 đường upload đều lưu `getPublicUrl(key)` vào DB rồi render thẳng (`lib/storage/r2-client.ts:75-78`, `app/api/admin/upload-url/route.ts:112-116`, `app/api/portal/upload-url/route.ts:88`), lớp ký URL nằm sau cờ `MEDIA_SIGNED_URL` **mặc định OFF** (`lib/flags.ts:56-58`, `lib/storage/signed-url.ts:47`). Ảnh học viên tải trực tiếp từ R2 không kèm cookie ứng dụng → object **bắt buộc phải public-read** thì trang mới hiển thị được.
→ Ai từng nhận link (phụ huynh đã nghỉ, GV đã nghỉ việc, người được chuyển tiếp link) **đọc vĩnh viễn ảnh/tài liệu học viên của MỌI cơ sở** — không cần đăng nhập, không hết hạn, không thu hồi được. Gate `StudentConsent` (`lib/portal/photos.ts:18-19`) chỉ chặn đường hiển thị trong portal, **không chặn object**.

---

## 1. Khoảng cách VƯỢT RANH GIỚI — xếp theo mức nghiêm trọng

> 28 khoảng cách `matters=CÓ`. Nhóm lại thành **7 nguyên nhân gốc** thay vì liệt kê rời.

### G1 — Cổng cách ly đặt sai tầng (`lib/` ngoài vùng phủ)

| | |
|---|---|
| **Ý định** | *"⚠️ Cổng DB ĐÃ ĐÓNG (không còn là 'target'): import `@/lib/db` trần trong `app/(admin\|portal\|teacher)/**` = ESLint **error**. Allowlist còn đúng 3 file exception… code mới KHÔNG xin thêm vào."* — `CLAUDE.md:19` |
| **Hiện thực** | Rule đúng như mô tả cho 3 route group. Nhưng `files:` trong `eslint.config.mjs:86-178` **không có mục nào bắt đầu bằng `lib/`**. 156 file `lib/` dùng `db` trần; 94 đọc `SCOPED_MODELS`; 40 file vừa bị `app/(admin\|teacher)` import trực tiếp vừa liệt kê `SCOPED_MODELS`. Nặng nhất: `lib/pending-tasks.ts` chạm **9** model scoped, `lib/portal/schedule.ts` 5, `lib/students/renewal.ts` 5. |
| **Ai chạm ai** | Đây là **nguyên nhân gốc** của 2 ca rò rỉ nặng nhất ở BƯỚC 0 (`Enrollment` qua `renewal.ts`, `Lead` qua `pending-tasks.ts`) — cả hai đều trên model **đã được scope**. |
| **Vá** | Thêm block `files: ['lib/**/*.ts']` với `dbBlockedImports` + allowlist riêng cho `lib/`. Không flip một lần (156 file) — flip theo thư mục, bắt đầu từ `lib/pending-tasks.ts` và `lib/students/renewal.ts`. |
| **Đụng shadow?** | KHÔNG |

**Rò rỉ MỚI xác nhận trong lúc soi ranh giới này:** `getInventoryStats()` (`lib/inventory-stats.ts:38-60`) **không nhận actor**, gọi `db.stockBalance.findMany()` **không có `where`** và `db.stockMovement.count()` chỉ lọc theo thời gian → trả `centers[]` (tên cơ sở, số mặt hàng, tổng giá trị) và `lowStockAlerts[]` của **mọi cơ sở**. `StockBalance`/`StockMovement` **đều nằm trong** `SCOPED_MODELS` — tức chỉ cần đổi sang `scopedDb` là hết. ✅ Phản biện xác nhận DÚNG toàn bộ.

### G2 — 115 điểm quyết định quyền gác bằng ROLE THÔ, `DENY` và grant không với tới

| | |
|---|---|
| **Ý định** | *"**RBAC 2 tầng:** quyền action = `can()` v1 matrix tĩnh — đang enforce… Multi-role: `User.roles[]` (quyền = union). Per-user grant ALLOW/DENY: `UserPermissionGrant`"* — `CLAUDE.md:21, :85` |
| **Hiện thực** | 95 call-site `hasRole/hasStaffRole/hasAnyRole` trong `app/`, 20 trong `lib/`, 8 `isSuperAdmin()` — **so sánh tên role trực tiếp**, không qua `can()`/`checkPermission()` → **không đọc matrix, không đọc per-user grant**. Nặng nhất: 3 API route hardcode mảng `allowedRoles` và đọc `session.user.role` **số ít** (bỏ luôn quy ước multi-role union). |
| **Ai chạm ai** | ⚠️ **`DELETE /api/admin/upload-delete`** (`route.ts:21-24`) chỉ kiểm role ∈ `[SUPER_ADMIN, CENTER_MANAGER]` và key bắt đầu `uploads/` (`:56-62`) — **không kiểm cơ sở, không kiểm chủ sở hữu**. `CENTER_MANAGER` của CS1 xoá vĩnh viễn file R2 của CS2 hoặc của HO. Audit ghi **sau khi đã xoá** (`:73-81`). |
| **Vá** | Đổi 3 route sang `assertPermission(...)`; **và trước đó phải đổi bố cục khoá R2** (xem G3). |
| **Đụng shadow?** | KHÔNG (125 điểm này vô hình với đồng hồ shadow — xem `00-baseline.md` §5) |

### G3 — Lưu trữ R2 không mang thông tin cơ sở, và mặc định công khai

`[QS]` Hai lỗi cộng dồn:

1. **Khoá R2 chia theo LOẠI file, không theo cơ sở** — `uploads/images|documents|videos|submissions/…` (`lib/storage/upload-config.ts:12-13,26-27`). Không suy được cơ sở chủ sở hữu từ khoá → **không vá được bằng RBAC đơn thuần**, phải đổi bố cục khoá trước: `uploads/<orgUnitId>/<loại>/<năm-tháng>/<file>`.
2. **Bucket đang phục vụ công khai** (đã nêu ở §0 câu 3).

→ Bài nộp của phụ huynh (`uploads/submissions/`, `app/api/portal/upload-url/route.ts:88`) nằm chung không gian tên với asset marketing, xoá được bởi bất kỳ `CENTER_MANAGER` nào.

### G4 — `unitType` đang là công tắc quyền, không phải nhãn (phá thẳng **D2**)

| | |
|---|---|
| **Ý định** | **D2**: *"unitType là NHÃN MÔ TẢ, KHÔNG phải ràng buộc cấu trúc."* |
| **Hiện thực** | `unitType` là ràng buộc cứng ở **13 điểm**. Nặng nhất: `isHoRoot(node)` = type `HO`\|`ROOT` (`lib/auth/actor.ts:92-93`) → `isHoLevel` (`:133`, **không lọc `roleCode`**) → `rowCenters = everyCenter` (`:145-146`) và `centerScope = "ALL"` cho **MỌI** permission của role đó (`:161`). Cộng `lib/db-scope.ts:218` trả `"ALL"` khi model thiếu map prefix. |
| **Ai chạm ai** | Bất kỳ nhân sự nào được gán **một** vai trò bất kỳ tại node HO (kể cả vai trò hẹp cấp phòng ban đặt nhầm dưới HO) → **đọc dữ liệu của MỌI cơ sở**. Khi thêm nhãn trung gian (`REGION`/`DEPARTMENT`) mà chưa sửa `isHoRoot`, **rủi ro nhân lên theo số node**. |
| **Vá — THỨ TỰ KHÔNG ĐẢO ĐƯỢC** | (1) Sửa `isHoLevel` **trước**: chỉ true khi `roleCode` nằm trong danh sách cross-center khai báo tường minh, hoặc bỏ hẳn nhánh `everyCenter` và để `RolePermission.scopeType = GLOBAL` diễn đạt cross-center. (2) Rồi mới dựng đường tạo `OrgUnit`. (3) Rồi mới thêm cột/enum. |
| **Đụng shadow?** | **KHÔNG RÕ** — cần đánh giá riêng trước khi chạm |

### G5 — Nội dung chương trình dạy: 3/4 điều kiện của **D8** không được kiểm

`[QS]` Soi từng điều kiện, mỗi cái một finding riêng:

| ĐK | Trạng thái | Bằng chứng |
|---|---|---|
| **(1) giữ vai trò GV** | ❌ **Không có điểm kiểm nào.** Cổng mở SCORM chỉ so `userId` với 3 trường trên `Class`/`ClassSession`; không đọc `UserOrgRole`, không đọc `User.roles`, không gọi `can()`. Người **bị gỡ vai trò GV** mà còn tên trong lớp vẫn mở được. | `lib/scorm/access.ts:30-42`, `:54-59` |
| **(2) được add vào MỘT lớp cụ thể** | ⚠️ **Một phần.** Có kiểm, nhưng tồn tại **hai định nghĩa "GV của buổi" lệch nhau** (`lib/scorm/access.ts:37-41` có `actualTeacherId` — `lib/auth/actor.ts:204-207` không). Nghiêm trọng hơn: **nhánh dự phòng** ở trang play nới quyền từ "một lớp" sang "bất kỳ lớp nào tôi dạy có cùng `curriculumId`, hoặc cùng `courseId`". | `.../scorm/play/[id]/page.tsx:90-113` (cả admin lẫn teacher) |
| **(3) lớp đó DÙNG chương trình này** | ❌ **Không kiểm trên đường chính.** `packageId` và `sessionId` là **2 tham số độc lập do client cung cấp**; khi có `sessionId`, trang chỉ hỏi "actor có phải GV của buổi đó không" rồi cho qua — **không có mệnh đề nào nối `pkg.lessonId` với buổi**. | `.../play/[id]/page.tsx:60-72, :76-85, :89`; `app/api/scorm/runtime/route.ts:115-127` |
| **(4) buổi đã tới CỬA SỔ MỞ KHOÁ** | ❌ **Khái niệm không tồn tại.** Toàn schema chỉ có `openAt` trên `Exam` (`prisma/schema.prisma:2318`). `Lesson` (`:2123-2167`), `ClassSession` (`:1440-1460`), `ScormPackage` (`:4622-4650`) đều không có trường thời gian mở. GV mở giáo án buổi cuối khoá ngay ngày đầu. | grep `openAt\|availableFrom\|unlockAt\|visibleFrom` → chỉ `Exam` |

**"Quản lý chỉ thấy DANH SÁCH, không thấy nội dung"** — đường `/admin/curriculums` **ĐÚNG** ✅ (list gate `curriculum:view` chỉ select tên + `_count.lessons`; nội dung gate `curriculum:edit` = chỉ `SUPER_ADMIN`+`TRAINING`). Nhưng **thủng ở hai chỗ khác**:

- **`/admin/documents`** — `documents:view` = `[SUPER_ADMIN, TRAINING, CENTER_MANAGER, TEACHER]` (`lib/auth/permissions.ts:499`), không lọc theo lớp/khoá/cơ sở, và render thẳng `<a href={d.fileUrl}>` (`page.tsx:326`) — URL public R2, **không vé, không hết hạn, không watermark, không log**. `Document` chính là nơi đính giáo án/slide vào `Lesson`.
- **Tự leo thang:** `classes:edit` thuộc `CENTER_MANAGER`; guard server duy nhất khi gán GV là `assertTeachersInCenter` — **chỉ so `centerId`, không kiểm người được gán có vai trò GV** (`app/(admin)/admin/classes/_actions.ts:54-73`). Lọc `TEACHER` chỉ ở dropdown (client-side). Tự gán `teacherId = chính mình` → `canOpenScorm` trả true.

**Đã có và đúng mô tả** ✅: watermark động (mã NV · tên GV · đồng hồ 1s, re-render mỗi giây) + blur khi đổi tab/thu nhỏ + chặn contextmenu (`components/admin/slide-stage.tsx:50-52, 57-81, 86-95`).
**Thiếu:** *"ghi log MỌI lượt xem"* — `ScormAccessLog` chỉ ghi **1 lần khi mở player**; route proxy asset (`app/api/scorm/asset/[...path]/route.ts:31-104`) **0 dòng log**; đường xem `Document` **không log gì**.

### G6 — Quyền của giáo viên rộng hơn ý định, theo hai hướng

`[QS]` `actor.assignedClassIds` = mọi `Class` chưa xoá mềm có `teacherId` **hoặc** `assistantId` = userId — **không lọc `centerId`, không đối chiếu `UserOrgRole` còn hiệu lực** (`lib/auth/actor.ts:202-206`). Toàn bộ site GV (22/29 điểm vào) gác đọc bằng đúng tập này.

→ **GV đã chuyển sang CS2** (đổi `User.centerId`/`UserOrgRole`) nhưng lớp cũ ở CS1 chưa đổi `teacherId`: vẫn mở được danh sách học viên, **học bạ PDF**, ảnh lớp, nhận xét của lớp CS1. Tương tự với GV đã hết hiệu lực `UserOrgRole` mà tài khoản còn `isActive` + `roles` chứa `TEACHER` (cổng vào site GV gác bằng `hasRole(session.user, "TEACHER")` — đọc **JWT**, không đọc `UserOrgRole`).

✅ Phản biện xác nhận phần còn lại của site GV **an toàn**: 7 điểm vào không dùng `assignedClassIds` đều có cổng khác hợp lệ; **0 file `app/(teacher)` dùng `db` trần**.

### G7 — Soft-delete chỉ phủ 4/10 model → học viên đã xoá vẫn hiện kèm PII

| | |
|---|---|
| **Ý định** | *"Soft delete: filter `WHERE deletedAt IS NULL` **luôn**, không hard delete trừ khi SUPER_ADMIN."* — `.claude/rules/prisma-db.md` |
| **Hiện thực** | 10 model có cột `deletedAt` (`OrgUnit`, `User`, `Lead`, `Student`, `ClassGroup`, `Class`, `Enrollment`, `Order`, `Payment`, `Receipt`). `SOFT_DELETE_MODELS` chỉ chứa **4 model tài chính** (`Order`/`Payment`/`Receipt`/`Enrollment` — `lib/soft-delete.ts:12-17`). `Student`, `Lead`, `Class`, `User`, `ClassGroup`, `OrgUnit` **không được auto-lọc**. |
| **Ai chạm ai** | Học viên đã xoá vẫn xuất hiện ở `/admin/search` (`app/(admin)/admin/search/page.tsx:86`) **kèm PII phụ huynh**. |
| **Vá** | ⚠️ Phản biện lưu ý: **không nhét thẳng `Student` vào set** nếu có màn "thùng rác" — `injectSoftDelete` có override qua `where.deletedAt`, nhưng nested include thì không. Rà call-site trước. |

---

## 2. Bảng chấm D1–D12

| | Quyết định | Mức độ | Ghi chú quyết định |
|---|---|---|---|
| **D1** | Giữ monolith | ✅ **ĐÃ CÓ** | 1 app, 1 project Vercel, hàng đợi trong DB, 15 cron nội bộ. `pnpm-workspace.yaml` không có `packages:`. `proxy.ts:75-79` chỉ rewrite nội bộ. |
| **D2** | Cây tổ chức một hình dạng | 🟠 **1/5 thành phần + MÂU THUẪN** | Tự tham chiếu ✅ · materialized path ❌ · `unitType` thiếu `GROUP/REGION/DEPARTMENT` ❌ · `relationshipType` ❌ · cờ hạch toán ❌. **Và `unitType` đang là công tắc quyền** (G4). **TẮC**: không có đường tạo `OrgUnit` trên UI. |
| **D3** | Tách ba trục | 🟠 **1/3 trục đúng hình** | `UserOrgRole` ✅ đúng hình (khoá 3 trường, UI chọn OrgUnit tự do, `buildActor` không đọc `User.centerId`). Employment ❌ **ba** nguồn sự thật (`Employee.centerId` + `Employee.orgUnitId` + `PRIMARY assignment`), không unique chống 2 PRIMARY. Assignment ❌ model đủ trường nhưng `createAssignment()` **0 call-site production**. **`derivedFrom` = 0 hit toàn repo.** |
| **D4** | Ba mô hình quyền + che trường ở tầng truy vấn | 🟠 **1/3 + sai tầng** | Theo cây đơn vị ✅ đang chạy. Theo chủ sở hữu 🟠 chỉ có khung (`OWN` **0 dòng seed**, call-site không truyền target). Theo cây nội dung ❌ không có. Che trường ❌ **4/4 `$extends` đều hook `query:`, 0 hook `result:`**. |
| **D5** | Giữ DENY | 🔴 **MÂU THUẪN** | v1 (đang enforce) tôn trọng DENY; v2 **vứt DENY im lặng** (`lib/auth/actor.ts:166-170`). **UI vẫn cho tạo DENY mới** (`lib/validators/permission-grant.ts:11`). Doc 15 OI-7 (`:879`) và `CLAUDE.md:92` chốt **ngược** với D5. ⚠️ Và: ca sử dụng ví dụ của chính D5 (chặn quản lý xem nội dung) **hiện không được giải bằng DENY ở bất kỳ đâu**. |
| **D6** | Danh mục 3 mức + khuôn mẫu đơn vị | 🔴 **KHÔNG CÓ khuôn mẫu** | Kế thừa **2 tầng phẳng**, **không leo lên cha** (`lib/settings/resolve.ts:13-29`) → có khối vùng thì mức "vùng" không tồn tại. 18/45 khoá `centerOverridable`. Danh mục nghiệp vụ: 15 bảng **buộc dùng chung** vì không có trường phạm vi — ba mức tồn tại **ngẫu nhiên theo từng bảng**, không theo khai báo. `createCenter` tạo **đúng 1 dòng `Center`**. |
| **D7** | Bỏ hẳn học bù liên cơ sở | 🔴 **MÂU THUẪN THẲNG** | Đã xây trọn vẹn theo **QĐ-O2 đã ký**, tiêu chí thứ 6 là "LIÊN CƠ SỞ", cờ **mặc định BẬT** và **fail-OPEN** (`lib/makeup/service.ts:104`). Đã khoét **ngoại lệ đọc chéo cơ sở** cho 4 model trong lớp cách ly. Đếm được (audit `MAKEUP_CROSS_CENTER`) nhưng **không có giao dịch nội bộ để đối trừ**. |
| **D8** | Chương trình dạy thuộc HO + 4 điều kiện | 🟠 **hở ở phần cốt lõi** | Xem G5. *"THUỘC HO"* **không diễn đạt được** — `Curriculum`/`Course` 0 trường sở hữu. Nên *"FRANCHISEE không sửa gì"* **không có cách nào phát biểu**. |
| **D9** | FranchiseContract có vòng đời | 🔴 **KHÔNG CÓ** | 0 model. **TẮC** vì thiếu 2 tiền đề: `derivedFrom` (D3) và nhãn `FRANCHISEE` thực sự sinh phạm vi (D2). Thu hồi quyền hiện là **từng-dòng-một** (`lib/auth/rbac-service.ts:235-262`, 0 `updateMany`). Không có khái niệm **quyền chỉ-đọc-tạm** — hết hiệu lực là mất sạch. |
| **D10** | Phạm vi tài chính suy từ quyền sở hữu chương trình | 🔴 **ĐỨT Ở MẮT CUỐI** | ✅ Mắt `Class → Curriculum` **ĐÃ CÓ** (`Class.courseId` bắt buộc `:1272`, `curriculumId` nullable `:1309-1310`, `Curriculum.courseId` `:2084`) — chính đường trang SCORM đang dùng. ❌ Mắt `Curriculum → chủ sở hữu`: **0 trường**. Vế cấm (lương/mặt bằng/lợi nhuận) **khớp ngẫu nhiên** vì hệ chưa có dữ liệu đó. |
| **D11** | Chỉ báo cáo vận hành hợp nhất | ✅ **ĐÃ CÓ** | `lib/reports/` 9 nhóm, toàn hàm thuần chỉ số vận hành. Không sổ cái/bút toán/P&L. `MISA AMIS` chưa live. |
| **D12** | Hoãn engine hoá | 🟠 **đã đi xa hơn D12 mô tả** | Bộ giải người thực hiện **đã chạy** (`LeadAssignmentConfig` 3 chế độ, có runtime + UI). Luật tự động: `CoinRuleConfig` đã migrate nhưng **0 dòng code đọc** — chi phí đã tiêu chưa dùng. **8 luồng duyệt** đang tồn tại. ⚠️ Phản biện: những thứ này có **TRƯỚC** khi D12 được chốt → D12 nên đọc là *"cấm xây thêm"*, không phải *"đang vi phạm"*. |

### Bốn quyết định KHÔNG THỂ triển khai như đang phát biểu

`[SĐ]` Nếu ra lệnh làm ngay, đội sẽ tắc ở đúng chỗ này:

- **D2** tắc vì **không có đường tạo `OrgUnit` trên giao diện**. Thêm bao nhiêu cột cũng không dùng được.
- **D6** tắc vì thiếu nhãn `DEPARTMENT` (D2) và vì kế thừa cấu hình **không leo lên cha**.
- **D9** tắc vì thiếu `derivedFrom` (D3) và vì nhãn `FRANCHISE` **không sinh phạm vi** (D2).
- **D10** tắc vì thiếu **đúng MỘT trường**: chương trình không có chủ sở hữu.

### Một trường mở khoá hai quyết định

`[SĐ]` **`Curriculum.ownerOrgUnitId`** (backfill = OrgUnit HO, thêm additive 2 pha) là **chi phí nhỏ nhất, đòn bẩy lớn nhất** trong 12 quyết định — đồng thời làm được vế *"chương trình THUỘC HO / FRANCHISEE không sửa"* của **D8** và **toàn bộ chuỗi suy diễn** của **D10**. Nếu chỉ làm được một việc, làm việc này.

### Thứ tự phụ thuộc (không đảo được)

```
D2 (sửa isHoLevel → dựng đường tạo OrgUnit) → D3 (derivedFrom + đường tạo điều động) → D6 (kế thừa N tầng + khuôn mẫu) → D9 (hợp đồng nhượng quyền)

nhánh song song, độc lập:  D8 / D10  (ownerOrgUnitId + vá 3/4 điều kiện xem nội dung)
```

---

## 3. Điều ĐÃ ĐÚNG — ghi lại để chặn kết luận bi quan sai

`[QS]` 32 mệnh đề KHỚP. Những cái đáng nhớ nhất:

- **Mọi Server Action/API route ĐỀU có cổng xác thực.** Script riêng của repo `scripts/check-action-guards.mjs` quét 157 file / 441 hàm export và **PASS** — không hàm nào thiếu guard. ⚠️ Nhưng script **không được nối vào CI** (`grep "check-action-guards" .github package.json` → 0 hit) → bất biến đang đúng mà **không có gì chặn hồi quy**.
- **Portal cách ly đúng.** 0 file `app/(portal)` dùng `db` trần; 15 file dùng `portalDb`. `studentId` **không lộ trên URL** — con đang chọn lấy từ cookie httpOnly **ký HMAC**, và sau khi verify chữ ký còn phải nằm trong danh sách con của phụ huynh đang login (`lib/portal/session.ts:86-91`) → chống cả forge lẫn tamper.
- **CI CÓ chạy test cách ly thật** (không phải lời hứa): 3 job — `e2e-a0` (12 case hai chiều CS1↔CS2 + IDOR + HO cross-center + bypass audit), `e2e-fl` (16 case), `e2e-r7` (5 case).
- **Idempotency webhook + confirm payment: CÓ THẬT, hai lớp.** `Lead.eventId` `@unique` ở DB + kiểm trước + bắt race P2002 + chống trùng SĐT 90 ngày; confirm payment có `IdempotencyKey` đọc trước **và ghi trong cùng tx**.
- **Tiền: mọi đường ghi đều trong `$transaction`** — cả 5 hàm (`recordPayment`, `confirmPayment`, `rejectPayment`, `adjustPayment`, `refundPayment`).
- **Export nhạy cảm đủ 3 lớp** ở cả 3 route: mask PII theo quyền + watermark truy vết + ghi `AuditLog`.
- **Chống rò rỉ nội dung** (watermark động + blur + chặn contextmenu) **đã có và đúng mô tả**.
- **Học viên KHÔNG xem được SCORM** — 0 route SCORM trong portal; route asset buộc **vé HMAC** + so `session.user.id === payload.userId`, vé chỉ ký ở 2 trang play đã gate.
- **Cổng cron fail-CLOSED và phủ 15/15 route**; 4 webhook công khai đều verify shared-secret/HMAC. (Bác bỏ giả định "cron không được bảo vệ".)
- **Không `any`** — ESLint chặn cứng. **`$queryRawUnsafe` = 0.** **Honor cột cũ còn nguyên** (2-phase migration được tôn trọng). **Scope đã LOẠI không quay lại** — 0 dấu vết AI camera/Web3/marketplace/student login riêng.
- **Site giáo viên (đã LIVE) không phải bề mặt rò rỉ mới** — 22/29 điểm vào gác bằng `assignedClassIds`, 7 điểm còn lại đều có cổng khác hợp lệ. Rủi ro nằm ở **định nghĩa tập lớp** (G6), không ở từng trang.

---

## 4. Tài liệu LỖI THỜI hoặc TỰ MÂU THUẪN

`[QS]` Phải sửa **trước** khi ai đó dùng làm căn cứ:

| Nơi | Nói gì | Thực tế |
|---|---|---|
| `.claude/rules/admin-site.md:12-38` | Mẫu code bắt buộc dùng `assertCan(session.user.role, …)` **và** `import { db } from "@/lib/db"` | **Copy mẫu này = build đỏ** (ESLint chặn `db` trần trong admin). Và truyền **chuỗi** role rơi vào Path 1 legacy (`permissions.ts:640-647`) → **bỏ qua cả `roles[]` lẫn `grants`**. Trong production **không còn call-site nào** dùng mẫu này. |
| `CLAUDE.md:92` vs **D5** | *"Conflict: ALLOW thắng… KHÔNG dùng DENY override"* | D5 chốt **GIỮ DENY**. Và `CLAUDE.md:84` (cùng file) cảnh báo bật v2 sẽ *"âm thầm vô hiệu hoá mọi DENY"* — **hai dòng trong cùng một file nói ngược nhau**. |
| `CLAUDE.md:21` | *"phải `auth()` + `assertCan(...)`"* | Đường chính là `checkPermission`/`assertPermission` (507 call-site); `assertCan` **chỉ còn 2 call-site**. |
| `CLAUDE.md:54` + `eslint.config.mjs:120` | `components/jobs/` | **Thư mục không tồn tại.** ESLint vẫn liệt nó trong danh sách client-scope → rule áp vào hư không. Sơ đồ thư mục còn thiếu 10 mục thật. |
| `CLAUDE.md:129` | *"GV không tải được file nguồn"* | **D8 đã hạ cấp** (*"KHÔNG đầu tư DRM/chặn tải"*). Thực tế nửa vời: zip gốc SCORM không lộ, nhưng PDF proxy nguyên tệp về trình duyệt và `Document` có hẳn nút tải. |
| `CLAUDE.md:141` | *"6 trụ kiến trúc"* liệt **login chung** như đã có | Hai cờ độc lập **cùng OFF**: `COMMON_LOGIN_AT_ROOT` và `AUTH_COOKIE_DOMAIN`. Mặc định `satarobo.vn/login` **307 sang admin**; cookie host-only nên mỗi subdomain là một phiên riêng. |
| Doc 15 `:35, :41, :930` | Nhượng quyền = *"quá xa MVP"* | **Mâu thuẫn thẳng với D9/D10 đã chốt.** Code đang đứng theo Doc 15. |
| Doc 15 `:884, :908` (NC-5/OI-11) | **cố ý loại `REGION`** khỏi `OrgUnitType` | **D2 đòi `REGION`.** Đây là tài liệu cũ chống lại QĐ mới, không phải code lỡ quên. |
| Doc 15 `:540` | Liệt 5 lệnh CI | `package.json` **không có** `test:permissions` và `test:events` → 2 lệnh này **chưa bao giờ chạy**. |
| `.dependency-cruiser.cjs:52,58` | allowlist *"25 exception"* | Còn **3**. |
| `docs/luong-lms-hien-trang.md:4,8` | Tự khai mô tả trạng thái **chưa commit** trên nhánh `FixPublicSite` ngày **29/06** | Nhánh đó đã biến mất; sau 29/06 có site GV lật cờ ON (10/07), vá 13 điểm rò RBAC (`f2d47a20`), guard ghi per-model (`913dda68`). **Không dùng làm hiện trạng cho PRD.** |
| `lib/auth/actor.ts:191` | *"cây OrgUnit cache cross-request"* | Trái với `:10-15` cùng file: REQ-02 đã **REVERTED**, đọc **trần mỗi request**. |

---

## 5. Nợ kiến trúc — không vượt ranh giới nhưng chặn việc mở rộng

`[QS]` Xếp theo mức ảnh hưởng tới PRD nhượng quyền:

1. **`modules/integration` không tồn tại** — CLAUDE.md nói *"External call CHỈ qua `modules/integration`"*, thực tế **17 file gọi thẳng provider ngoài**, **9 file nằm ngay trong `app/**`**. Rule depcruise dựng để chặn có `from: { path: "^modules/(?!integration/)" }` → khớp **0 file**, no-op tuyệt đối.
2. **Outbox chưa atomic** — **26** call-site `publishEvent` (tự đếm lại, chốt số): **16 truyền `tx`**, **10 không**. ⚠️ Con số này khác cả hai agent đưa ra; đã kiểm bằng script đọc trọn biểu thức lời gọi. `lib/crm/convert-lead-v2.ts:265,270` publish **sau commit và không `dedupeKey`** → crash giữa commit và publish = **mất luôn email xác nhận, không dò lại được**.
3. **`AuditLog` chưa hợp nhất** — 14 model chứa chữ "Audit"; 9 helper vẫn ghi vào 9 bảng cũ mà schema tự khai *"giữ đọc-only"*, tổng **~63 điểm ghi**.
4. **API contract là TARGET, chưa hiện thực** — `lib/api/response.ts` viết đúng contract nhưng **0 importer**; trong 52 route chỉ **1** route trả `error` dạng object, và cả route đó cũng thiếu `requestId`; 40 route trả `{ error: "chuỗi tiếng Việt" }` phẳng.
5. **Không có đường replay `DomainEvent` FAILED** — webhook **có** đủ đường replay (trang admin + action); `DomainEvent` thì **không có trang, không có action, không có cron nào đọc lại `FAILED`**. Reaper chỉ vớt `PROCESSING`. Metric đếm FAILED có sẵn (`lib/observability/slo.ts:45`) nhưng **0 importer**.
6. **Job nền không có danh tính** — `SYSTEM_ACTOR` được thiết kế làm actor cho cron/webhook nhưng **0 call-site**. 15 cron + 4 webhook chạy `db` trần, **không tầng phạm vi, không actor audit**, và **không nhận tham số đơn vị**. `[SĐ]` Trước khi có FRANCHISEE phải cho phép chạy job **theo từng orgUnit** để không trộn dữ liệu hai pháp nhân.
7. **`/api/cron/email-queue` chấp nhận phiên người dùng** — nhân viên có `emails:view` ép gửi hàng đợi của **mọi cơ sở** (`route.ts:12-20`), có thể lặp để bào quota Resend.
8. **`User` được miễn cách ly cơ sở** và `createUserAction`/`updateUserAction` nhận `orgUnitId` từ form **không đối chiếu `actor.visibleOrgUnitIds`**. Hiện an toàn **chỉ vì** `users:manage` = đúng một vai trò `SUPER_ADMIN`. `[SĐ]` **Trở thành đường leo thang tenant NGAY khi PRD giao quyền tạo tài khoản xuống cơ sở/FRANCHISEE.**
9. **Test cách ly có lỗ phủ:** 4 spec CI chỉ dựng **4 mã vai trò** (`CENTER_MANAGER` 26 lần, `SUPER_ADMIN` 7, `HO_ACCOUNTANT` 3, `TEACHER` 1) — **5 vai trò cấp cơ sở chưa bao giờ bị test**, đúng chỗ code đang lỗi (`SALES_CSM@CS1` rơi vào `centerScope = null`). Spec cách ly **đường GHI** (`tests/e2e/crm/import-registered-isolation.spec.ts`, 235 dòng) **không có job CI nào chạy**. Spec cách ly qua trình duyệt thật (`tests/manual/i3-isolation.spec.ts:39-49`) chỉ `console.log`, **không có `expect()` nào** — luôn xanh dù dữ liệu CS2 hiện đầy màn hình. ⚠️ Phản biện: đây là **script chẩn đoán chạy tay** (header tự khai), không phải cổng CI bị hỏng.
10. **`proxy.ts` có nhánh gác host×role thứ hai** ngoài `decideRoute()` — BRANCH 3 (`proxy.ts:154-226`) tự cài lại logic role cho host "unknown" (localhost/preview/Host lạ). Vi phạm quy ước *"sửa rule host×role CHỈ ở `decideRoute()`"*.
11. **3 thư viện UI ngoài bộ đã chốt, chưa cập nhật tài liệu:** `@base-ui/react` (đã **THAY** Radix ở 15 component), `embla-carousel-react`, `components/aceternity/`.

---

## 6. Tài liệu IM LẶNG — câu hỏi cho Ban dự án, không phải finding

`[QS]` Không bịa ý định để chế ra khoảng cách. 9 vùng **không có văn bản nào** để đối chiếu:

1. **Ai được tạo/sửa/xoá `OrgUnit`, qua màn hình nào.** Doc 15 §2.1 chỉ mô tả hình cây; ticket A0-01 chỉ yêu cầu service + rule. Việc thiếu màn hình quản trị **không vi phạm câu chữ nào** — nó chỉ vô hiệu hoá hệ quả của `CLAUDE.md:90`.
2. **"Phòng ban" là node trong cây hay bảng phẳng.** Hiện `DepartmentDef` phẳng, gắn thẳng vào `Employee`. Cơ cấu đích nói *"cơ sở tỉnh có 3 bộ phận"* nhưng không nói bộ phận là `OrgUnit` hay thuộc tính. **Không quyết điều này thì D6 không có "phòng ban chuẩn" nào để tự sinh.**
3. **Trạng thái cuối của `Center` vs `OrgUnit`.** Schema chỉ ghi *"PR-A: trỏ Center cũ"*, *"flip ở PR-D"*; **không tài liệu nào định nghĩa PR-D gồm gì, ai làm, khi nào, `Center` có bị bỏ không.**
4. **Vòng đời tài khoản khi nhân sự chuyển/nghỉ:** `teacherId` trên lớp cũ có phải gỡ không, ai gỡ, trong bao lâu. D3 nói *"nguồn mất thì quyền mất"* nhưng nguồn ở đây là **trường `teacherId` trên `Class`**, không phải `UserOrgRole` — không văn bản nào nối hai thứ.
5. **Job nền chạy với danh tính gì, phạm vi gì.** Chỉ có comment trong `lib/auth/system-actor.ts`. Với D9/D10: **"cron chạy một lần cho cả tập đoàn hay một lần cho mỗi pháp nhân?"** chưa ai trả lời.
6. **Ai được ĐỌC file trên R2 và bằng cơ chế nào.** Doc 15 chỉ vẽ một ô trong sơ đồ. Không có điều khoản về bố cục khoá, thời hạn lưu, thu hồi khi phụ huynh rút consent hay khi học viên nghỉ.
7. **`Document.isPublic` nghĩa là ai được xem.** Trường có trong schema, nhưng **truy vấn portal bỏ qua nó** (`lib/portal/learning.ts:245-248`) — cờ do người biên soạn tắt vẫn hiển thị/tải được cho phụ huynh. **Cần Ban chốt ý định trước khi gọi là lỗi.**
8. **Số phận `sale.satarobo.vn` trong zone cookie.** Chỉ có cảnh báo trong comment `lib/auth.ts:16-20`. `[SĐ]` Đây là **chặn cứng kỹ thuật** của toàn bộ hướng SSO: đặt `AUTH_COOKIE_DOMAIN='.satarobo.vn'` sẽ gửi cookie phiên kèm mọi request tới `sale.satarobo.vn` — trang chứa mã nhúng bên thứ ba (MISA).
9. **Quan hệ giữa "role trong JWT (`User.roles`)" dùng mở cổng site và "`UserOrgRole` trong DB" dùng tính phạm vi.** Hai hệ song song, chỉ nối bằng `tokenVersion`. **Không văn bản nào nói cái nào là nguồn đúng.**

Riêng cho D7/D9/D12, ba câu chưa có định nghĩa: *"đếm số ca"* nghĩa là đếm để báo cáo hay để **đối trừ tiền**? · *"thời gian chuyển tiếp"* sau khi cắt hợp đồng dài bao lâu và *"dữ liệu học viên của chính mình"* gồm những gì? · *"1 luồng duyệt thật sự cần"* là luồng nào và 8 luồng đang chạy có bị tính vào không?

---

## 7. Hai điều kiện CHẶN — phải chốt bằng văn bản trước khi viết dòng code nào

`[SĐ]` Đây là kết luận cứng nhất của BƯỚC 1:

1. **D5 vs Doc 15 OI-7** — chưa văn bản ký sau nào phân xử. **Trong lúc chưa chốt, KHÔNG được bật `RBAC_V2_ENABLED`**: bật là mọi `UserPermissionGrant` DENY hiện hữu **hết hiệu lực im lặng**, không log, không cảnh báo. Trước khi bàn, chạy kiểm kê read-only để biết đang bàn về **bao nhiêu bản ghi**.
2. **D7 vs QĐ-O2** — nếu chọn thi hành D7 thì **phải gỡ ngoại lệ đọc chéo cơ sở trong lớp cách ly CÙNG LÚC**; nếu không thì đã trả giá kiến trúc mà **không còn thu lợi nghiệp vụ**.

**Vùng đụng cửa sổ shadow-compare:** 5 khoảng cách `touches_shadow=CÓ`, 5 `KHÔNG RÕ`. Nặng nhất là **G4** (sửa `isHoLevel`) và **D5**. Bổ sung vào "3 vùng mù" đã ghi ở `00-baseline.md` §5: **SCORM gate (`lib/scorm/access.ts:46-47`) không chỉ mù shadow — nó còn PHÁ mệnh đề "v2 nằm sau cờ"** của `CLAUDE.md:21`, vì nó chạy RBAC v2 thẳng bất kể `RBAC_V2_ENABLED`, và **không tôn trọng DENY** → thu hồi quyền bằng DENY **không cắt được SCORM**.
