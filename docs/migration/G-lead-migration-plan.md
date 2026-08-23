# G-05 — Kế hoạch migration trường lead cũ + kịch bản kiểm thử

**Nguồn spec:** `docs/specs/spec-dashboard-qlcs-duyet-media-lead.md` — KHU VỰC G (G-01, G-05, G-06, G-07)
**Nguồn khoá schema:** `docs/prd/A-nen-tang.md` §10.3 (SL-08 → SL-15) và §10.5 (thứ tự khoá)
**Nhánh khảo sát:** `hptkk29/runhop20_08`

> Mọi khẳng định hiện trạng đều kèm `file:dòng` đọc trực tiếp từ mã nguồn trên nhánh này.
> Tài liệu này KHÔNG sửa mã, KHÔNG chạy migration. Nó là sổ rà soát + quy tắc + kịch bản test.

---

## 0. Ba đính chính bắt buộc đọc trước

### 0.1 `lead_student` của spec **ĐÃ TỒN TẠI** trong repo với tên `LeadChild` — và **đã có dữ liệu**

Spec G-07 mô tả bảng mới `lead_student`. Trong schema đã có `LeadChild` (`prisma/schema.prisma:1461-1487`) làm đúng việc đó: `leadId` + `fullName` + `dob` + `ageYears` + `gender` + `schoolName` + `gradeLevel` + `interestedCourseId` + `interestedCenterId` + `trialStatus`, index `[leadId]`, `onDelete: Cascade`. Nó đã được nối vào `TrialEnrollment`, `Enrollment` (`Enrollment.leadChildId`) và `LeadTrialHistory`.

Bảng này **đang được ghi trên prod** bởi ít nhất 5 đường:

| Đường ghi | File:dòng |
|---|---|
| Intake (form Sale + quatang) | `lib/lead/intake/ingest.ts:368-376` |
| Intake — gắn thêm con khi trùng SĐT (QĐ-D1) | `lib/lead/intake/ingest.ts:194-201` |
| Import Excel lead (nhiều con cùng SĐT) | `app/api/admin/import/leads/route.ts:257-266`, gộp `:317-330` |
| Import Excel "đã đăng ký" | `app/api/admin/import/leads/registered/route.ts:513-522`, `:544-560` |
| Màn quản lý con trên chi tiết lead | `app/(admin)/admin/leads/actions.ts:1055`, `:1106` |

⇒ **G-05 KHÔNG phải "tạo bảng mới rồi đổ toàn bộ lead cũ vào".** Nó là:
1. **Mở rộng** `LeadChild` (SL-08 cột phạm vi, SL-09 trạng thái/chốt/giá trị);
2. **Backfill có điều kiện**: chỉ tạo `LeadChild` cho lead nào `childName IS NOT NULL` **VÀ** chưa có dòng `LeadChild` nào;
3. **Đổi đường đọc/ghi** của 44 file ở Phần 1.

Bỏ qua điều kiện (2) = **nhân đôi con** trên mọi lead đã đi qua 5 đường trên. Đây là kịch bản test bắt buộc `G05-T09`.

### 0.2 Spec G-05 "thay thế hoàn toàn" **XUNG ĐỘT** với chú thích schema và luật cứng #4

| Nguồn | Nói gì |
|---|---|
| Spec G-05 | "Bộ trường G-01 **thay thế hoàn toàn** bộ trường lead cũ" |
| `prisma/schema.prisma:1459-1460` | *"Field phẳng cũ (Lead.childName/childAge) giữ đọc-only (2-phase, **KHÔNG drop**)"* |
| CLAUDE.md — luật cứng Nền Hệ thống #4 | "Không tự ý sinh migration đổi/bỏ cột trên bảng đang có dữ liệu PROD" |
| `docs/prd/A-nen-tang.md` SL-15 | "**KHÔNG drop ở giai đoạn G.** Làm 2-phase; drop ở phase sau khi prod ổn định" |

**Kết luận đã chốt ở PRD A: 2-phase thắng.** Giai đoạn G **chỉ làm Phase A** (additive + ghi kép + đọc qua helper). Phase B (drop 2 cột) là **story riêng sau G**, không nằm trong G-05. Xem §2.5.

### 0.3 `Order` chưa quy được về từng con ⇒ "doanh số theo học sinh" chưa hiện thực được

`prisma/schema.prisma:3687-3688` — model `Order` chỉ có `leadId String?` + relation `LeadOrders`. Grep `leadChildId` trên schema = 10 hit, **không hit nào thuộc `Order`**.
`contractValue` / `closedAt` / `lostReason` / `lostAt` / `LeadLostReason` / `LeadSource` / `UserTablePreference` trên schema = **0 hit** (đã grep).

⇒ Migration G-05 chỉ chuyển được **danh tính con**. Cột tiền (`contractValue`) sẽ backfill = `NULL` cho 100% bản ghi cũ và phải đánh cờ để người vận hành biết. Xem SL-09b, §2.3.

---

# PHẦN 1 — CHECKLIST RÀ SOÁT TOÀN REPO

Quy ước cột **Việc phải làm**:
- `HELPER` = đổi sang đọc qua helper `getLeadChildView(lead)` (Phase A), không đọc thẳng cột phẳng.
- `GHI KÉP` = Phase A vẫn ghi `Lead.childName` **và** ghi `LeadChild`; Phase B mới bỏ vế cũ.
- `OR SEARCH` = thêm nhánh `children: { some: { fullName: { contains: q } } }` vào mệnh đề OR, **giữ nguyên** nhánh `childName` cho tới Phase B.
- `KIỂM` = không có `childName`, nhưng nằm trên đường đi và phải xác minh không hỏng.

---

## 1. Form nhập/sửa lead (admin + sale + public)

| File:dòng | Đọc hay Ghi | Trường cũ | Việc phải làm | Rủi ro nếu bỏ sót |
|---|---|---|---|---|
| `app/(admin)/admin/leads/_components/lead-form.tsx:23-24, 51-52, 72-73` | Ghi (state → action) | `childName`, `childAge` | Bỏ 2 ô khỏi form lead; chuyển sang khối con của `LeadChildrenManager`. Giữ prop `initial.childName` cho tới Phase B để không vỡ typecheck. | Sale tiếp tục gõ tên con vào cột phẳng ⇒ đẻ thêm dữ liệu cũ **sau** ngày backfill, lô backfill thành không đủ. |
| `app/(admin)/admin/leads/_components/lead-form.tsx:119, 122` | Ghi (input DOM) | `childName`, `childAge` | Gỡ 2 `<input>`. | Như trên. |
| `app/(admin)/admin/leads/actions.ts:570-571` (`manualLeadSchema`) | Ghi (Zod) | `childName`, `childAge` | Bỏ 2 khoá khỏi schema **sau khi** UI đã bỏ; thêm mảng `children[]` theo `leadChildSchema` (`lib/validators/lead.ts`). | Đây là **1 trong 2 schema Zod song song** — xem mục 7. Sửa `lib/validators/lead.ts` mà quên chỗ này = đường admin vẫn nhận trường cũ. |
| `app/(admin)/admin/leads/actions.ts:640-641` (`createLeadManual`) | **GHI** | `childName`, `childAge` | `GHI KÉP`: giữ `childName` + tạo `children: { create: [...] }` trong cùng `db.lead.create`. | Lead tạo tay sau ngày backfill không có `LeadChild` ⇒ màn convert prefill rỗng, báo cáo C-03 đếm thiếu. |
| `app/(admin)/admin/leads/actions.ts:670` (`logLeadAudit` newValues) | Ghi (audit) | `childName` | Thêm tên con vào `newValues` từ `children[]`. | Audit G-02 (3 trường định danh phải có vết) mất vế "Tên HS". |
| `app/(admin)/admin/leads/actions.ts:708-709` (`before` select của `updateLeadFields`) | Đọc | `childName`, `childAge` | Thêm `children: { select: { id, fullName } }` để diff audit đúng. | Sửa tên con không sinh dòng audit ⇒ vi phạm G-02. |
| `app/(admin)/admin/leads/actions.ts:749-750` (`updateData`) | **GHI** | `childName`, `childAge` | `GHI KÉP` + gọi `syncLeadChildNameToStudents` (đã import sẵn ở `:23`). | Lead sửa tay sau backfill lệch giữa 2 nơi. |
| `app/(admin)/admin/leads/[id]/edit/page.tsx:41-42` | Đọc (select) | `childName`, `childAge` | Giữ tới Phase B (còn nuôi khối legacy `:123-124`). | — |
| `app/(admin)/admin/leads/[id]/edit/page.tsx:95-96` | Đọc (prefill form) | `childName`, `childAge` | Gỡ cùng lúc với `lead-form.tsx`. | Form vẫn hiện ô cũ. |
| `app/(admin)/admin/leads/[id]/edit/page.tsx:123-124` | Đọc (prop legacy) | `childName`, `childAge` | Giữ nguyên Phase A — đây chính là khối "nút Tạo LeadChild mới" phục vụ dọn tay. | Mất lối dọn tay cho lead backfill không tự động được. |
| `app/(admin)/admin/leads/_components/lead-children.tsx:239, 245-247` | Đọc (hiển thị legacy read-only) | `legacyChildName`, `legacyChildAge` | Giữ Phase A; bổ sung badge "dữ liệu cũ, chưa tách" khi lead vừa có `childName` vừa **chưa** có `LeadChild`. | Người vận hành không thấy lead nào còn nợ tách con. |
| `app/(public)/lien-he/_components/contact-form.tsx:325, 352` | Ghi (payload → `/api/leads`) | `childName` | Đổi payload sang `children: [{ fullName, schoolName, gradeLevel }]`; xem thêm mục 4. | Form liên hệ công khai tiếp tục bơm dữ liệu cũ. |
| `app/(public)/lien-he/_components/contact-form.tsx:334-346` | Ghi (nhồi `note`) | `Lead.note` | Ô Trường/Lớp/Tỉnh phải vào cột thật (`LeadChild.schoolName`, `.gradeLevel`, `Lead.city`), không nhồi `note`. | Dữ liệu G-01 tiếp tục chảy vào `note` sau khi đã có cột — công bóc note ở §2.4 thành vô nghĩa. |
| `components/khoa-hoc/consult-modal.tsx:29, 102, 274` | Ghi (payload) | `childName` | Như contact-form. | Như trên. |
| `components/legacy-laptrinhrobot/RegistrationForm.tsx:169` | Ghi (payload) | `childName` | Như contact-form. | Như trên. |
| `components/legacy-laptrinhrobot/_utils/tracking.ts:19-20, 89, 114, 119, 134` | Ghi (payload API + payload Google Sheet) | `childName` | Đổi payload API. **KHÔNG đổi** khoá gửi Google Sheet (`:89` — Apps Script đọc theo tên, đổi là gãy sheet ngoài repo). | Đổi cả 2 = mất cột trên sheet marketing đang dùng. |
| `components/legacy-laptrinhrobot/_utils/tracking.ts:119-131` | Ghi (nhồi `note`) | `Lead.note` | Khoá/Cơ sở/Trường/Lớp/Tỉnh → cột thật. | Như contact-form. |
| `app/api/public/lead-intake/sale-form/route.ts:146` | Ghi (endpoint form Sale) | qua `mapSaleForm` | `KIỂM` — mapper đã trả `child` đúng; chỉ cần chắc `ingestIntakeLead` thôi ghi `Lead.childName` ở Phase B. | — |
| `lib/lead/intake/map-sale-form.ts:23, 45, 58, 103, 139-141` | Ghi (mapper) | `SALE_FORM_FIELDS.childName = "LastName"` | `KIỂM` — đã sinh `child: { fullName, schoolName, gradeLevel }`, **không** set `childName`. Đây là **mẫu đúng** để copy cho 3 webhook cũ. | Đổi tên trường MISA ở đây làm gãy đường mirror MISA (`lib/lead/intake/misa-mirror.ts`). |
| `lib/lead/intake/map-quatang.ts:25, 49, 119, 171-173` | Ghi (mapper) | `QUATANG_FIELDS.childName` | `KIỂM` — như trên. | — |

## 2. Import Excel lead (route + parser + cột template)

| File:dòng | Đọc hay Ghi | Trường cũ | Việc phải làm | Rủi ro nếu bỏ sót |
|---|---|---|---|---|
| `lib/lead/import.ts:13-23` (`LEAD_IMPORT_COLUMNS`) | — (định nghĩa cột) | `"Tên con"` (D), `"Tuổi con"` (E) | Giữ **nguyên 9 cột** ở Phase A. G-01 muốn thêm cột thì đó là đợt template v3, không kèm vào G-05. | Đổi cột = file mẫu người dùng đang cầm hết dùng được, mà `parseLeadImportRow` khớp theo **tên header** nên hỏng im lặng (dòng bị coi là thiếu tên con). |
| `lib/lead/import.ts:86-87` (`ParsedLeadRow`) | — (type) | `childName`, `childAge` | Đổi tên field trong type thành `child: { fullName, ageYears }` **hoặc** giữ nguyên và map ở route. Khuyến nghị giữ nguyên — type này là hợp đồng với 4 call-site. | Đổi tên lan sang `import.test.ts:76` và route. |
| `lib/lead/import.ts:126-127` | Đọc (parse ô Excel) | `cell(raw,"Tên con")`, `parseChildAge` | Giữ. | — |
| `lib/lead/import.ts:44-49` (`parseChildAge`) | — (validate 3..18) | `childAge` | Giữ nguyên trần 3–18 để khớp `LeadChild.ageYears`. | Nới trần ở một nơi mà không nơi kia = dòng import lọt vào rồi form sửa lại từ chối. |
| `lib/lead/template.ts:23-26, 40` | — (vá file mẫu) | cột `E` (Tuổi con), cột `K` ẩn | `KIỂM` — file này vá XML theo **chữ cái cột cứng** (`E`, `K`, `<dimension ref="A1:I121">`). Thêm/bớt cột là phải sửa cả 3 hằng. | Thêm cột vào template mà quên `LIST_COL` = dropdown khoá học đè lên cột dữ liệu mới. |
| `public/templates/mau-lead-v2.xlsx` | — (asset nhị phân) | 9 cột soạn tay | **Sửa TAY** trong Excel nếu đổi cột. `build:templates` **đã bị xoá** khỏi repo — không có đường sinh lại. | Sửa `LEAD_IMPORT_COLUMNS` mà quên file mẫu ⇒ mọi dòng import báo "Thiếu tên phụ huynh". |
| `app/api/admin/import/leads/route.ts:84-85` (`Valid`) | — (type) | `childName`, `childAge` | Giữ Phase A. | — |
| `app/api/admin/import/leads/route.ts:143, 154-155, 162` | Ghi (gom nhóm theo SĐT) | `d.childName`, `d.childAge` | Giữ — đây là logic gộp con **đã đúng**. | — |
| `app/api/admin/import/leads/route.ts:175, 193-194, 215` (`legacyChild`) | Đọc lead cũ để gộp | `ex.childName`, `ex.childAge` | Giữ Phase A. Đây là **tiền lệ backfill đã ship**: `:289-295` tự đẩy `childName` cũ thành `LeadChild` khi lead chưa có con nào. Script backfill §2.1 dùng **đúng luật này**. | Bỏ đi = import gộp con sẽ bỏ sót đứa con cũ đang nằm ở cột phẳng. |
| `app/api/admin/import/leads/route.ts:248-249` | **GHI** | `childName`, `childAge` | `GHI KÉP`. Lưu ý: hiện chỉ tạo `LeadChild` khi **có >1 con** (`:238-241` — `g.children.length > 1`); lead 1 con vẫn chỉ có cột phẳng. **Phải đổi thành luôn tạo `LeadChild`.** | 🔴 Đây là **nguồn đẻ dữ liệu cũ lớn nhất còn sống**: mọi lead import 1 con vẫn ra cột phẳng, backfill chạy xong hôm trước hôm sau lại có lead mới thiếu `LeadChild`. |
| `app/api/admin/import/leads/precheck/route.ts:49` | Đọc (preview trùng) | `childName` | `OR SEARCH` — thêm `children: { select: { fullName } }` vào `select`. | Màn xem trước hiện "(chưa ghi tên con)" cho lead đã tách con ⇒ Sale tưởng lead trống, tạo trùng. |
| `app/(admin)/admin/leads/import/page.tsx:54, 64` | Đọc (render preview) | `m.childName` | Đọc thêm danh sách con. | Như trên. |
| `app/(admin)/admin/leads/import/page.tsx:56-59` | Đọc (map kết quả) | khoá `m.phone` | 🔴 **Lỗi có sẵn, không do G-05**: API trả `phone` **thô từ DB** (có thể là `0…`), client tra bằng `normalizePhone()` (ra `84…`) ⇒ **trượt đúng những lead cũ**. Phải dùng `phoneKey()` (`lib/phone.ts:128-137` mô tả đúng lớp lỗi này). | Preview báo "không trùng" rồi import thật lại gộp — người dùng mất niềm tin vào bước xem trước. Đây là case biên của `G05-T05`. |
| `app/api/admin/import/leads/registered/route.ts:500-534, 542-560` | Ghi | **KHÔNG** ghi `childName` | `KIỂM` — route này chỉ ghi `children: { create: [...] }`. **Đây là mẫu đích của cả G-05.** | — |

## 3. Export

| File:dòng | Đọc hay Ghi | Trường cũ | Việc phải làm | Rủi ro nếu bỏ sót |
|---|---|---|---|---|
| `app/api/admin/leads/export/route.ts:46` | Đọc (**khoá tìm kiếm**) | `childName` trong `where.OR` | `OR SEARCH` | 🔴 Xuất file theo từ khoá tên con sẽ **thiếu dòng im lặng** với lead đã tách con. |
| `app/api/admin/leads/export/route.ts:63-64` | Đọc (select) | `childName`, `childAge` | Thêm `children: { select: { fullName, ageYears } }`. | — |
| `app/api/admin/leads/export/route.ts:80-84` (headers) | — | `'Tên con'`, `'Tuổi'` | Quyết định hình dạng file: **1 dòng/lead** (nối tên con bằng `; `) hay **1 dòng/con**. Spec C-03 đếm theo **học sinh** ⇒ khuyến nghị 1 dòng/con. | Đổi sau khi Sale đã quen file = phải đào tạo lại. |
| `app/api/admin/leads/export/route.ts:93-94` | Đọc (ghi ô CSV) | `lead.childName`, `lead.childAge` | Theo quyết định trên. Giữ nguyên `maskPersonName` cho từng tên con. | Bỏ mask = rò PII tên học sinh cho vai không có `leads:view-pii`. |
| `app/api/admin/leads/export/route.ts:55` | Đọc | `take: 5000` | `KIỂM` — chuyển sang 1 dòng/con thì **5000 lead thành >5000 dòng**; trần đang cắt **im lặng** (đã ghi nhận ở PRD A, A-03-6). | File thiếu dòng mà không ai biết. |

> Xác nhận: **chỉ có ĐÚNG MỘT** chỗ xuất file lead trong repo — grep `leads/export` trả về duy nhất route này.

## 4. API routes (gồm webhook công khai)

| File:dòng | Đọc hay Ghi | Trường cũ | Việc phải làm | Rủi ro nếu bỏ sót |
|---|---|---|---|---|
| `app/api/leads/route.ts:90-119` | **GHI** (`db.lead.create` TRỰC TIẾP) | `childName:94`, `childAge:95` | `GHI KÉP` + tạo `LeadChild`. | 🔴 **Đường ghi này KHÔNG đi qua `lib/lead/intake/ingest.ts`.** Nó phục vụ 3 form công khai (contact-form, consult-modal, legacy RegistrationForm). Bỏ sót = phần lớn lead từ website vẫn chỉ có cột phẳng. |
| `app/api/leads/route.ts:143` | Đọc | `lead.childName` | Đổi sang tên con đầu tiên trong `children`. | Email báo lead tư vấn mất tên con. |
| `lib/validators/lead.ts:33-34` (`leadCreateSchema`) | Ghi (Zod đường công khai) | `childName` max100, `childAge` 3-18 | Thêm `children[]`; giữ 2 khoá cũ optional tới Phase B. | Đây là **schema Zod thứ nhất** trong 2 cái song song — mục 7. |
| `lib/lead/intake/ingest.ts:349` | **GHI** | `childName: mapped.child?.fullName ?? mapped.childName` | `GHI KÉP` — Phase B bỏ vế `childName`, giữ `LeadChild` (`:368-376`). | — |
| `lib/lead/intake/ingest.ts:184-190` | Đọc (chống trùng tên con) | `lead.childName` | Giữ tới Phase B: hàm `attachExtraChild` so tên mới với **cả** `LeadChild.fullName` **và** `Lead.childName`. Bỏ vế `childName` **trước** khi backfill xong = đẻ con trùng. | 🔴 Trùng SĐT + trùng tên con ⇒ tạo `LeadChild` thứ hai cho cùng một đứa trẻ. |
| `lib/lead/intake/types.ts:37, 40` (`MappedLead.childName`) | — (type) | `childName` | Gỡ ở Phase B, cùng lúc với `lib/lead/ingest.ts`. | — |
| `lib/lead/ingest.ts:13, 27, 59` | Ghi (lớp bọc 3 webhook cũ) | `childName` | 🔴 **Quyết định phải chốt:** hiện `child: null` **cố ý** (`:56-58`) — 3 webhook cũ moi tên con từ text tự do nên không đẻ `LeadChild`. G-05 hoặc (a) giữ nguyên và chấp nhận 3 nguồn này vĩnh viễn thiếu `LeadChild`, hoặc (b) đẻ `LeadChild` kèm cờ `lowConfidence`. | Chọn (a) mà không ghi ra = báo cáo C-03 (đếm theo học sinh) hụt toàn bộ lead facebook/zalo/google-form. |
| `lib/lead/webhook.ts:157, 224, 357` (`extractLeadFields`) | Đọc (bóc payload) | `childName` từ alias `child_name`/`ten_con`/`tenCon` | Giữ; nếu chọn (b) ở trên thì đây là nguồn `fullName`. | — |
| `app/api/public/webhook/{facebook,zalo,google-form}/route.ts` | Ghi (qua `processLeadWebhook`) | gián tiếp | `KIỂM` — cả 3 chỉ gọi `processLeadWebhook` (`facebook:2`, `zalo:2`, `google-form:2`). Không có `childName` trong route. | — |
| `app/api/public/webhook/google-form/route.ts:24` | — (comment mô tả payload) | `childName: (r['Tên con']||[''])[0]` | Cập nhật comment nếu đổi hợp đồng payload. | Người viết Apps Script đọc comment này để soạn payload. |
| `app/api/public/webhook/quatang/route.ts:31-39` | Ghi (qua `mapQuatang` + `ingestIntakeLead`) | gián tiếp | `KIỂM` — đã đi đường `child`. | — |
| `lib/crm/webhook-replay.ts:43-49` | Ghi (phát lại phiếu Sale) | qua `mapSaleForm` | `KIỂM` — phát lại phải cho ra **cùng** kết quả với đường ghi mới, nếu không replay sinh dữ liệu khác lô gốc. | Replay sau khi đổi mapper tạo lead thiếu `LeadChild`. |
| `lib/email/consult-notification.ts:12, 48` | Đọc (nội dung email) | `childName` param | Đổi nguồn sang tên con đầu. | Email nội bộ mất tên con. |
| `lib/lead/pii.ts:39, 49` (`maskLeadPiiFields`) | Đọc + biến đổi | `childName` | 🔴 Phải mask **cả** `children[].fullName`, không chỉ cột phẳng. | Rò tên học sinh cho vai `MARKETING` (không có `leads:view-pii`) qua đúng cột vừa thêm. |

## 5. Báo cáo (`lib/reports/**`, `app/(admin)/admin/bao-cao/**`)

| File:dòng | Đọc hay Ghi | Trường cũ | Việc phải làm | Rủi ro nếu bỏ sót |
|---|---|---|---|---|
| `lib/reports/lead.ts:6-13` (`LeadReportRecord`) | Đọc | **KHÔNG có** `childName`/`childAge` — chỉ `status`, `source`, `centerId`, `commissionSource`, `createdAt`, `convertedAt` | `KHÔNG PHẢI SỬA` cho G-05. **Nhưng** C-03 đòi đếm theo **học sinh** ⇒ khi làm khu vực C phải đổi record này sang cấp `LeadChild`, không phải cấp `Lead`. | Đếm theo lead trong khi spec nói đếm theo học sinh ⇒ PH hai con bị đếm 1. |
| `lib/reports/trial.ts:18-22, 126-129` | Đọc | `leadChildId`, `leadChildTrialStatus`, `leadStatus` | `KIỂM` — đã ở cấp con, **mẫu đúng**. Khi SL-09 thêm `LeadChild.status` phải chốt quan hệ với `trialStatus` để không đếm hai lần. | Hai cột trạng thái trên cùng một bảng, mỗi báo cáo đọc một cột. |
| `app/(admin)/admin/bao-cao/**` (9 trang) | Đọc | — | `KHÔNG PHẢI SỬA` — grep `childName`/`childAge` trên toàn cây = **0 hit**. | — |

> ✅ Đây là mảng **sạch nhất**. Tầng báo cáo hiện có hoàn toàn không phụ thuộc cột phẳng.

## 6. Job / cron

| File:dòng | Đọc hay Ghi | Trường cũ | Việc phải làm | Rủi ro nếu bỏ sót |
|---|---|---|---|---|
| `app/api/cron/**` (23 job) | — | — | `KHÔNG PHẢI SỬA` — grep `childName`/`childAge`/`parentName` trên `lead-intake-health`, `sla-check`, `marketing-alerts` = 0 hit; các job còn lại không chạm `Lead`. | — |
| `lib/crm/sla.ts`, `lib/lead/intake/health.ts`, `lib/crm/marketing-alerts.ts` | — | — | `KHÔNG PHẢI SỬA` — 0 hit. | — |
| `lib/pending-tasks.ts:631` | Đọc (select) | `childName` | `HELPER` | — |
| `lib/pending-tasks.ts:643` | Đọc (nhãn hiển thị) | `` `${r.childName ?? r.parentName} — chưa chốt ghi danh` `` | `HELPER` | 🔴 **Dễ quên**: file nằm ở `lib/`, phục vụ panel "Việc cần xử lý" của **dashboard** — đúng thứ khu vực B/C sẽ đọc. Bỏ sót ⇒ danh sách việc hiện **tên phụ huynh** thay vì tên con, không sai rõ ràng nên không ai báo lỗi. |
| `app/(admin)/admin/dashboard/_components/sales-dashboard.tsx:82` | Đọc (select qua `lead`) | `childName` | `HELPER` | — |
| `app/(admin)/admin/dashboard/_components/sales-dashboard.tsx:180` | Đọc (hiển thị) | `t.lead.childName ?? t.lead.parentName` | `HELPER` | Cùng lớp lỗi với `pending-tasks.ts:643`. |

## 7. Validator (Zod)

🔴 **Có BỐN schema Zod cho cùng một thực thể, ở bốn file khác nhau.** Sửa một chỗ là bỏ sót ba chỗ.

| File:dòng | Đọc hay Ghi | Trường cũ | Việc phải làm | Rủi ro nếu bỏ sót |
|---|---|---|---|---|
| `lib/validators/lead.ts:31-61` (`leadCreateSchema`) | Ghi | `childName:33` max100, `childAge:34` 3-18, `note:56` **max 500** | Thêm `children[]`. Trần `note` 500 là **khác** đường admin. | Form công khai gửi note dài hơn 500 → 400, client nuốt lỗi (đã ghi ở `contact-form.tsx:337`, `tracking.ts:128`). |
| `lib/validators/lead.ts:63-…` (`leadUpdateSchema`) | Ghi | kế thừa `.partial()` + enum 15 trạng thái | Đồng bộ với SL-14. | — |
| `lib/validators/lead.ts` (`leadChildSchema`) | Ghi | — | Đây là schema **đích** — mở rộng theo SL-09 (`status`, `closedAt`, `contractValue`). | — |
| `app/(admin)/admin/leads/actions.ts:566-577` (`manualLeadSchema`) | Ghi | `childName:570`, `childAge:571`, `note:576` **max 2000** | Sửa song song với `lib/validators/lead.ts`. | 🔴 **Hai trần `note` lệch nhau (500 vs 2000)**. Bóc note ở §2.4 phải chịu được cả hai. |
| `app/(admin)/admin/leads/actions.ts:677` (`updateLeadFieldsSchema`) | Ghi | `= manualLeadSchema.partial()` | Tự theo. | — |
| `app/(admin)/admin/leads/actions.ts:25-40` (`statusSchema`) | Ghi | 15 giá trị `LeadStatus` | `KIỂM` — SL-14 chốt **ánh xạ**, không drop. Nếu thêm `LeadChild.status` (SL-09) thì đây là schema cấp **lead**, không dùng lại cho cấp con. | Tái dùng enum 15 giá trị cho con = đúng thứ SL-09 cấm. |
| `app/(admin)/admin/leads/[id]/convert/actions.ts:39-75` (`convertSchema`) | Ghi | không có `childName`; có `students[].name` | `KIỂM` — schema thứ tư, đường convert. | Thêm trường bắt buộc vào `LeadChild` mà quên đây = convert 400. |
| `lib/lead/import.ts:44-49` (`parseChildAge`) | Ghi (validate thuần) | `childAge` 3-18 | Giữ trùng trần với `LeadChild.ageYears`. | — |

## 8. Trang danh sách + chi tiết lead

| File:dòng | Đọc hay Ghi | Trường cũ | Việc phải làm | Rủi ro nếu bỏ sót |
|---|---|---|---|---|
| `app/(admin)/admin/leads/page.tsx:127` | Đọc (**khoá tìm kiếm**) | `childName` trong `where.OR` | `OR SEARCH` | 🔴 Gõ tên con vào ô tìm ⇒ **không ra lead** đã tách con. Hỏng **im lặng**: không lỗi, không cảnh báo, chỉ thiếu dòng. |
| `app/(admin)/admin/leads/page.tsx:216` | Đọc (payload Kanban) | `l.childName` | `HELPER` | Card Kanban mất tên con. |
| `app/(admin)/admin/leads/page.tsx:286-287` | Đọc (payload Table) | `lead.childName`, `lead.childAge` | `HELPER` | — |
| `app/(admin)/admin/leads/_components/leads-table.tsx:23-24` | — (type `LeadRow`) | `childName`, `childAge` | Thêm `children: { id, fullName, ageYears }[]`. | — |
| `app/(admin)/admin/leads/_components/leads-table.tsx:227-228` | Đọc (panel chi tiết) | `lead.childName`, `lead.childAge` | `HELPER` — PH nhiều con phải hiện đủ. | 1 PH 2 con chỉ hiện 1. |
| `app/(admin)/admin/leads/_components/leads-table.tsx:441-444` | Đọc (dòng bảng) | `Con: {lead.childName} · {childAge} tuổi` | `HELPER` | — |
| `app/(admin)/admin/leads/_components/leads-kanban.tsx:20` | — (type) | `childName` | Thêm danh sách con. | — |
| `app/(admin)/admin/leads/[id]/page.tsx:104` | Đọc (vào `maskLeadPiiFields`) | `childName` | `HELPER` + mask cả `children`. | Rò PII — xem mục 4 (`lib/lead/pii.ts`). |
| `app/(admin)/admin/leads/[id]/page.tsx:300-301` | Đọc (ô "Tên con"/"Tuổi") | `piiLead.childName`, `lead.childAge` | `HELPER` | Chi tiết lead hiện 1 con trong khi có 2. |
| `app/(admin)/admin/leads/[id]/page.tsx:364-365` | Đọc (prop legacy) | `childName`, `childAge` | Giữ Phase A. | Mất lối dọn tay. |
| `app/(admin)/admin/search/page.tsx:83` | Đọc (**khoá tìm kiếm** toàn cục) | `childName` | `OR SEARCH` | 🔴 Cùng lớp với `leads/page.tsx:127` — tìm kiếm toàn hệ thống thiếu kết quả im lặng. |
| `app/(admin)/admin/search/page.tsx:90` | Đọc (select) | `childName` | Thêm `children`. | — |
| `app/(admin)/admin/search/page.tsx:177-178` | Đọc (hiển thị) | `l.childName` | `HELPER` | — |
| `app/(admin)/admin/trials/page.tsx:77` | Đọc (select qua `lead`) | `childName` | `HELPER` — trang này **đã** select `children` ở `:79-81`, chỉ cần bỏ vế cũ. | — |
| `app/(admin)/admin/trials/page.tsx:132` | Đọc (payload) | `t.lead.childName` | `HELPER` | — |
| `app/(admin)/admin/trials/_components/trials-list.tsx:43` | — (type) | `childName` | — | — |
| `app/(admin)/admin/trials/_components/trials-list.tsx:94` | Đọc (**lọc client**) | `it.childName?.toLowerCase().includes(s)` | `OR SEARCH` phía client. | Ô lọc học thử không tìm ra theo tên con. |
| `app/(admin)/admin/trials/_components/trials-list.tsx:274` | Đọc (hiển thị) | `item.childName` | `HELPER` | — |

## 9. Chuyển đổi lead → học viên (convert)

| File:dòng | Đọc hay Ghi | Trường cũ | Việc phải làm | Rủi ro nếu bỏ sót |
|---|---|---|---|---|
| `app/(admin)/admin/leads/[id]/convert/page.tsx:45` | Đọc (select) | `childName` | Giữ Phase A (nuôi fallback `:99-113`). | — |
| `app/(admin)/admin/leads/[id]/convert/page.tsx:99-113` (`prefillStudents`) | Đọc (**đường sản phẩm thật**) | `lead.childName ?? ''` khi `lead.children` rỗng | Giữ Phase A; sau backfill nhánh này chỉ còn dùng cho lead tạo mới thiếu con. | 🔴 Bỏ nhánh fallback **trước** khi backfill xong ⇒ màn convert prefill **tên rỗng**, nhân viên phải gõ tay tên từng học viên. |
| `lib/crm/convert-lead.ts:57, 126` | Ghi (`Student.name = input.childName ?? lead.childName ?? lead.parentName`) | `childName` | ⚠️ **MÃ CHẾT TRÊN PROD.** Grep `convertLeadToEnrollment` toàn repo: định nghĩa (`:64`) + **chỉ các file test** (`tests/e2e/r2/convert-lead.spec.ts`, `tests/e2e/r6/race-guard.spec.ts`). **Không có call-site sản phẩm nào.** Đường thật là `convertLeadV2`. | Rủi ro thật ≈ 0 (không ai gọi). Rủi ro **giả**: nếu ai đó nối lại file này sau khi drop cột, học viên bị đặt tên bằng **tên phụ huynh**. ⇒ Nên xoá hoặc gắn cảnh báo `@deprecated` trong G-05. |
| `lib/crm/convert-lead-v2.ts:55-56, 260-292` | Ghi | **KHÔNG** phụ thuộc `childName`; dùng `s.name` từ input + ghi `Enrollment.leadChildId:292` | `KIỂM` — **mẫu đúng**. | — |
| `app/(admin)/admin/leads/[id]/convert/actions.ts:12, 39-75` | Ghi | `students[].name` | `KIỂM` — thêm trường bắt buộc vào `LeadChild` phải cập nhật cả đây. | Convert 400 sau migration. |
| `lib/crm/bulk-convert.ts:19` | Ghi | qua `convertLeadV2` | `KIỂM` — 0 hit `childName`. | — |
| `prisma/schema.prisma:3687-3688` (`Order.leadId`) | — | **thiếu `leadChildId`** | 🔴 **SL-09b** — chốt (a) `Order.leadChildId` hay (b) bảng phân bổ, **trước** khi C-03 chạy. | Chốt sau ⇒ phải quy tay lại toàn bộ đơn cũ về từng con. |

## 10. Mọi nơi khác chạm `childName`/`childAge`

| File:dòng | Đọc hay Ghi | Trường cũ | Việc phải làm | Rủi ro nếu bỏ sót |
|---|---|---|---|---|
| `lib/students/sync-name.ts:104-115` | **GHI** (`tx.lead.updateMany data:{ childName: newName }`) | `childName` | `GHI KÉP` Phase A; Phase B chỉ còn ghi `LeadChild.fullName` (`:88-92`). | 🔴 **DỄ QUÊN NHẤT.** Đường ghi này nằm ở **module HỌC VIÊN**, không ở module Lead. Đổi tên học viên ở `/admin/students` sẽ ghi ngược vào `Lead.childName`. Sau Phase B mà quên gỡ = ghi vào cột đã drop ⇒ **runtime error trên đường đổi tên học viên**, không phải trên đường lead. |
| `lib/students/sync-name.ts:95-97` | — (chú thích) | mô tả "2-phase, KHÔNG drop" | Cập nhật khi sang Phase B. | — |
| `lib/students/sync-name.ts:131-133` | Ghi (audit) | `oldValues:{childName}`, `changedFields:["children","childName"]` | Đổi cùng lúc. | Audit ghi tên cột không còn tồn tại. |
| `lib/permissions/registry/crm.ts:15` | — (khai báo `sensitiveFields`) | `["parentName","phone","email","childName","note"]` | Thêm tên trường mới (vd `children.fullName`). | 🔴 **Chuỗi, không phải symbol — `pnpm typecheck` KHÔNG bắt.** Bỏ sót = `fieldMask` của hệ quyền mới không che cột tên con mới. |
| `instrumentation-client.ts:44` | — (danh sách xoá PII trước khi gửi Sentry) | `["phone","email","parentName","childName"]` | Thêm tên trường mới. | 🔴 Cùng lớp: chuỗi, typecheck không bắt. Bỏ sót = **tên học sinh chảy vào Sentry**. |
| `scripts/cleanup-zztest.ts:33` | Đọc (lọc dữ liệu test) | `{ childName: { startsWith: P } }` | Thêm nhánh `children: { some: { fullName: { startsWith: P } } }`. | Dữ liệu test `zztest` không được dọn ⇒ lẫn vào số liệu báo cáo. |
| `prisma/schema.prisma:1314-1315` | — (định nghĩa cột) | `childName String?`, `childAge Int?` | Giữ Phase A. | — |
| `prisma/schema.prisma:1459-1460` | — (chú thích) | "giữ đọc-only, 2-phase, KHÔNG drop" | Là căn cứ pháp lý của quyết định 2-phase — **đừng sửa** cho khớp câu chữ spec. | — |
| `prisma/seed-lms/crm.ts:413-414` | Ghi (seed dev) | `db.lead.createMany` + `db.leadChild.createMany` | Cập nhật để seed sinh dữ liệu **đúng hình dạng mới** + cố ý sinh vài lead "chỉ có cột phẳng" làm mồi test backfill. | Seed sạch quá ⇒ không tái hiện được ca backfill trên máy dev. |
| `lib/crm/lead-qualify.ts:87-97` | **GHI** (`db.lead.create`) | **KHÔNG** set `childName` | `KIỂM` — đường tạo Lead thứ 5 (từ hội thoại Messenger). Thêm cột **NOT NULL** vào `Lead` là gãy ngay đây. | Thêm trường bắt buộc mà quên = luồng chuẩn hoá lead Messenger chết. |
| `app/(admin)/admin/audit-log/_actions.ts:214`, `lib/audit/legacy-log.ts:75` | Đọc/Xoá | `leadAuditLog` | `KIỂM` — `LeadAuditLog` **đã đóng băng**: `logLeadAudit` (`lib/audit/log.ts:128-156`) ghi vào `AuditLog` qua `writeAudit`, **không** ghi bảng cũ. Test ghim: `tests/e2e/a0/audit-freeze-legacy.spec.ts:54`. | Viết audit migration vào bảng cũ = không ai đọc thấy. |

### Trùng tên biến — **KHÔNG** phải trường `Lead` (đừng sửa nhầm)

| File:dòng | Nguồn thật |
|---|---|
| `app/(admin)/admin/trial-classes/_actions.ts:324, 376`, `trial-class-detail.tsx:24, 33, 468, 527, 545, 613, 636`, `trial-classes/[id]/page.tsx:106` | `LeadChild.fullName` |
| `app/(auth)/kich-hoat/_actions.ts:190` | `user.children[0].name` (Student) |
| `app/(portal)/portal/hoc-sinh/thong-bao/page.tsx:15, 22`, `components/portal/thong-bao-page.tsx:278-280`, `lib/portal/notification-feed.ts:34, 98-201` | Trường `childName` **của chính feed thông báo**, nguồn là `Student.name` |
| `app/(portal)/portal/tin-nhan/page.tsx:166-168`, `lib/chat/dm.ts:254-384`, `lib/chat/queries.ts:321-854` | `Student.name` qua SQL thô |
| `lib/_handlers/trial-notif.ts:28` | `leadChild.fullName` |
| `lib/email/triggers.ts:24-39` | tham số truyền vào từ `Student` |
| `lib/lead/intake/normalize.ts:40-41` | tên **tham số** của `parentNameFallback` |
| `prisma/seed-lms/parents-students.ts:73, 78` | biến cục bộ sinh tên |
| `app/(admin)/admin/students/_actions.ts:314`, `app/api/admin/import/students/route.ts:300` | **comment**, không phải mã |

### Tổng kết Phần 1

| Nhóm | Số mục |
|---|---|
| File mã nguồn **phải sửa** | **44** |
| File **chỉ phải kiểm** (không sửa nếu kiểm xanh): `import/leads/registered/route.ts`, `webhook/google-form/route.ts`, `convert/actions.ts`, `convert-lead-v2.ts`, `lead-qualify.ts` | 5 |
| Asset nhị phân phải soạn tay: `public/templates/mau-lead-v2.xlsx` | 1 |
| **Tổng mục trong sổ** | **50** |
| File test phải cập nhật | 6 (`lib/lead/import.test.ts`, `lib/lead/pii.test.ts`, `lib/lead/intake/map-quatang.test.ts`, `lib/lead/intake/map-sale-form.test.ts`, `tests/lead-intake/ingest.spec.ts`, `tests/e2e/r2/convert-lead.spec.ts` + `tests/e2e/fl/dashboard-scope.spec.ts:134`) |
| File có tên biến trùng — **không** sửa | 9 nhóm ở bảng trên |

### 🔴 Bảy chỗ "dễ quên nhất" — xếp theo mức khó phát hiện

| # | Chỗ | Vì sao dễ quên | Hỏng ra sao |
|---|---|---|---|
| 1 | `lib/students/sync-name.ts:104-115` | Đường **GHI** vào `Lead.childName` nằm trong module **Học viên**, không nằm ở `lib/lead/**` hay `app/(admin)/admin/leads/**`. Không ai grep module lead mà ra nó. | Phase B drop cột ⇒ **đổi tên học viên** ném lỗi runtime, ở màn hoàn toàn khác. |
| 2 | 4 khoá tìm kiếm: `leads/page.tsx:127`, `search/page.tsx:83`, `export/route.ts:46`, `trials-list.tsx:94` | Không phải cột hiển thị, là **mệnh đề `where`**. Không có test nào tìm theo tên con. | **Thiếu kết quả IM LẶNG.** Không lỗi, không cảnh báo. Người dùng kết luận "lead không có trong hệ thống" rồi tạo trùng. |
| 3 | `instrumentation-client.ts:44` + `lib/permissions/registry/crm.ts:15` | Danh sách tên trường dạng **chuỗi**; `pnpm typecheck` không bắt. | Tên học sinh chảy vào Sentry; `fieldMask` hệ quyền mới không che cột mới. |
| 4 | `public/templates/mau-lead-v2.xlsx` + `lib/lead/template.ts:23-26` | File nhị phân soạn tay, **không có script sinh lại** (`build:templates` đã bị xoá). Vá theo chữ cái cột cứng `E`/`K`/`A1:I121`. | Đổi cột trong mã mà quên file ⇒ mọi dòng import báo lỗi tên phụ huynh. |
| 5 | `app/api/leads/route.ts:90-119` | Nằm ngoài `lib/lead/intake/**` — dễ tin nhầm "chỉ có một lối intake". Thực tế đây là đường ghi của **3 form công khai**. | Backfill xong hôm trước, hôm sau website lại đẻ lead chỉ có cột phẳng. |
| 6 | `app/api/admin/import/leads/route.ts:238-241` | Chỉ tạo `LeadChild` khi **`g.children.length > 1`**. Lead import **1 con** vẫn ra cột phẳng. | Nguồn đẻ dữ liệu cũ lớn nhất còn sống sau backfill. |
| 7 | `lib/pending-tasks.ts:643` + `sales-dashboard.tsx:180` | Cả hai đều `childName ?? parentName` — bỏ sót thì hiện **tên phụ huynh**, trông vẫn hợp lý. | Sai âm thầm, không ai báo lỗi. |

---

# PHẦN 2 — QUY TẮC CHUYỂN DỮ LIỆU

## 2.1 Ánh xạ từng cột

**Đơn vị chuyển:** mỗi bản ghi `Lead` **thoả cả 3 điều kiện** dưới đây sinh ra **đúng 1** dòng `LeadChild`:

```
Lead.childName IS NOT NULL AND btrim(Lead.childName) <> ''
AND NOT EXISTS (SELECT 1 FROM "LeadChild" lc WHERE lc."leadId" = Lead.id)
AND Lead."deletedAt" IS NULL          -- xem G05-T11 cho lead xoá mềm
```

Lead **không** thoả ⇒ **không đụng tới** (không tạo, không sửa). Luật này sao chép đúng logic đã ship ở `app/api/admin/import/leads/route.ts:289-295` (`if (m.existingNames.length === 0 && m.legacyChild?.name) toCreate.push(m.legacyChild)`).

### Bảng A — cột cũ trên `Lead` → cột trên `LeadChild`

| Cột cũ (`Lead`) | Cột mới (`LeadChild`) | Quy tắc chuyển | Nếu không chuyển được |
|---|---|---|---|
| `childName` (`schema:1314`) | `fullName` (NOT NULL) | `btrim()`. Chuỗi rỗng sau trim ⇒ **không tạo dòng** (không dùng placeholder). | cờ `MISSING_CHILD_NAME` |
| `childAge` (`schema:1315`) | `ageYears` | copy nguyên. Ngoài khoảng 3–18 ⇒ `NULL` + cờ (trần lấy từ `lib/lead/import.ts:44-49`). | cờ `AGE_OUT_OF_RANGE` |
| — | `dob` | **`NULL` tuyệt đối.** 🔴 **KHÔNG suy từ `ageYears`** — sai ±1 năm và không có tháng/ngày; ngày sinh sai đi thẳng vào học bạ và giấy chứng nhận. | cờ `NO_DOB` |
| — | `gender` | `NULL`. Dữ liệu cũ không có. | cờ `NO_GENDER` |
| (bóc từ `note`) | `schoolName` | §2.4 — chỉ khi bóc được với độ tin cao. | để `NULL` |
| (bóc từ `note`) | `gradeLevel` | §2.4 | để `NULL` |
| `courseId` (`schema:1319`) | `interestedCourseId` | copy. Lead 1 con ⇒ khoá quan tâm của lead **chính là** của con đó. | `NULL` |
| `centerId` (`schema:1316`) | `interestedCenterId` | copy. | `NULL` |
| `centerId` | **`centerId` (SL-08, cột MỚI)** | copy — cột cách ly `scopedDb`. | `NULL` (ý nghĩa NULL phải khai vào `BACKFILL_SPECS` — `lib/org/center-bridge.ts`) |
| `orgUnitId` (`schema:1317`) | **`orgUnitId` (SL-08, cột MỚI)** | copy. | `NULL` |
| `status` (`schema:1326`) | **`status` (SL-09, enum MỚI)** | ánh xạ 15 → 6 theo Bảng C. | `NEW` + cờ `STATUS_UNMAPPED` |
| `convertedAt` (`schema:1354`) | **`closedAt` (SL-09)** | copy **CHỈ KHI** lead có đúng 1 con **và** `status ∈ {ENROLLED, REGISTERED}`. | `NULL` |
| — | **`contractValue` (SL-09)** | 🔴 `NULL` cho **100% bản ghi cũ**. Không suy từ `Order` được — `Order` không có `leadChildId` (`schema:3687-3688`). | cờ `NO_CONTRACT_VALUE` (đặt cho **mọi** con backfill có `status ∈ {ENROLLED, REGISTERED}`) |
| — | `trialStatus` | giữ mặc định `NONE`. Không suy ngược từ `LeadStatus` — hai hệ khác nhau. | — |
| `createdAt` | `createdAt` | 🔴 **Đặt bằng `Lead.createdAt`, KHÔNG dùng `now()`.** Báo cáo C-03 tính "thời gian chốt = chốt − vào hệ thống"; dùng `now()` làm mọi lead cũ có tuổi 0 ngày. | — |

### Bảng B — cột mới trên `Lead` (SL-10, SL-11, SL-12)

| Cột mới | Nguồn | Quy tắc | Nếu trống |
|---|---|---|---|
| `lostReasonId` → `LeadLostReason` (SL-11) | — | Lead `status = 'LOST'` ⇒ trỏ tới bản ghi danh mục **`code = 'KHONG_RO_DU_LIEU_CU'`** (seed sẵn, `isActive = false` để không ai chọn tay). | `NULL` cho lead khác `LOST` |
| `lostNote` | `Lead.note` | Không bóc. Giữ nguyên `note`. | `NULL` |
| `lostAt` | `Lead.updatedAt` | **Proxy, độ tin THẤP** — schema không có lịch sử trạng thái. Ghi cờ `LOST_AT_IS_PROXY` để C-05 không dùng nó tính SLA. | `NULL` |
| `sourceId` → `LeadSource` (SL-11) | `Lead.source` (String tự do, `schema:1327`) | Tra danh mục theo `normalizeVi()` (`lib/lead/intake/normalize.ts:16-25`). Không khớp ⇒ `NULL` + **giữ nguyên `Lead.source`** + tạo bản ghi `LeadSource` `isActive=false` để admin gộp tay sau. | `NULL` |
| `createdById` / `createdByName` (SL-12) | `AuditLog` `action='lead.create'`, `entityType='Lead'`, `entityId=lead.id` | Chỉ có với lead tạo **sau** khi bật audit. Không có ⇒ `NULL`. Không suy từ `assignedToId` (người phụ trách ≠ người nhập). | cờ `NO_CREATOR` |
| `gender`, `dob` (PH) | — | `NULL`. | cờ |
| `facebookUrl` | — | `NULL`. 🔴 **KHÔNG lấy từ `fbclid`/`fbp`/`fbc`** — đó là tham số quảng cáo, không phải link profile (đã nêu ở PRD A SL-12). | cờ |
| `city` / `ward` / `addressDetail` | `Lead.note` | §2.4 — bóc, độ tin theo nguồn. | `NULL` |
| `campaignId` / `adId` (SL-10) | — | `NULL`. `utmCampaign` là **tên** chiến dịch, không phải ID. | cờ `NO_CAMPAIGN_ID` |

### Bảng C — ánh xạ `LeadStatus` (15) → `LeadChildStatus` (6) · **SL-14**

| `LeadStatus` (`schema:37-55`) | `LeadChildStatus` (SL-09) | Ghi chú |
|---|---|---|
| `NEW` | `NEW` | |
| `ASSIGNED` | `NEW` | đã phân sale nhưng chưa chạm khách |
| `CONTACTED` | `CONSULTING` | |
| `NO_ANSWER` | `CONSULTING` | vẫn đang chăm, chưa rớt (spec: rớt là **thủ công**) |
| `CONSULTING` | `CONSULTING` | |
| `TRIAL_SCHEDULED` | `TRIAL_SCHEDULED` | |
| `DEMO_SCHEDULED` | `TRIAL_SCHEDULED` | schema ghi "deprecated — data đã map sang TRIAL_SCHEDULED" (`:52`) |
| `TRIAL_IN_PROGRESS` | `TRIAL_SCHEDULED` | 🔴 **Mất thông tin** — bộ 6 của spec không có ô "đang học thử". Ghi cờ `STATUS_LOSSY`. |
| `TRIAL_ATTENDED` | `TRIAL_ATTENDED` | |
| `AWAITING_DECISION` | `TRIAL_ATTENDED` | 🔴 Mất thông tin. Cờ `STATUS_LOSSY`. |
| `NURTURING` | `CONSULTING` | 🔴 Mất thông tin. Cờ `STATUS_LOSSY`. |
| `REGISTERED` | `ENROLLED` | |
| `ENROLLED` | `ENROLLED` | |
| `LOST` | `LOST` | |
| `DUPLICATE` | `LOST` | 🔴 Mất thông tin. Cờ `STATUS_LOSSY` + cờ `WAS_DUPLICATE`. |

> ⚠️ **`LeadStatus` gốc KHÔNG được đổi, KHÔNG được drop giá trị nào** (luật cứng #4 — enum đang có dữ liệu prod). Bảng này là ánh xạ **một chiều** khi sinh `LeadChild.status`.

## 2.2 🔴 KHÔNG tự động gộp bản ghi trùng SĐT — chỉ ĐÁNH DẤU

**Quyết định (spec §"ĐÃ CHỐT" khu vực G):** *"các bản ghi trùng SĐT PH gom lại thủ công sau, không tự động merge"*.

Migration **tuyệt đối không**: không xoá lead, không set `deletedAt`, không đổi `status` sang `DUPLICATE`, không chuyển `LeadChild`/`Order`/`Note`/`LeadActivity` giữa các lead, không đổi `assignedToId`.

### Cơ chế đánh dấu — 3 lớp

**Lớp 1 — nhóm trùng (chỉ đọc, không ghi DB).**
Gom theo **`phoneKey()`** (`lib/phone.ts:128-137`), **không** theo `Lead.phone` thô:

```sql
-- Khoá gom: bỏ tiền tố 84/0 rồi lấy phần lõi (đúng logic phoneSearchTerm, lib/phone.ts:147-153)
SELECT
  regexp_replace(phone, '^(84|0)', '') AS phone_core,
  count(*)                              AS n,
  array_agg(id ORDER BY "createdAt")    AS lead_ids
FROM "Lead"
WHERE "deletedAt" IS NULL
GROUP BY 1
HAVING count(*) > 1;
```

🔴 **Bắt buộc dùng phần lõi.** Gom theo `phone` thô sẽ tách `0905123456` và `84905123456` thành hai nhóm — đúng lỗ hổng mà `lib/phone.ts:105-118` (`phoneVariants`) sinh ra để vá, và là lỗ hổng đường admin đang mắc (`app/(admin)/admin/leads/actions.ts:596`, `:731` so khớp **đúng bằng** chuỗi canonical).

**Lớp 2 — cờ máy đọc được: cột additive `Lead.migrationFlags String[] @default([])`.**

| Ưu | Nhược |
|---|---|
| Lọc/đếm được bằng SQL (`WHERE 'DUP_SUSPECT' = ANY("migrationFlags")`) | Thêm 1 cột (additive, nullable-an-toàn, drop rẻ ở Phase B) |
| Là chỗ đựng chung cho **mọi** cờ ở §2.3 | |
| Không đụng bảng nào khác | |

Cờ trùng SĐT: `DUP_SUSPECT` cho **mọi** lead trong nhóm `n > 1`, kèm `DUP_GROUP:<phone_core>` để nhóm lại được.

**Lớp 3 — vết người đọc được: 1 dòng `LeadActivity` cho mỗi lead bị đánh dấu.**

`LeadActivity` (`schema:3527-3539`) đã có `type`, `content`, `metadata Json?`, hiện ngay trên trang chi tiết lead:

```
type: NOTE
actorName: "Hệ thống (migration G-05)"
content: "[Nghi trùng SĐT] Có <n> hồ sơ cùng số <phone>. Migration KHÔNG tự gộp.
          Các hồ sơ liên quan: <id1>, <id2>… — cần người rà và gộp tay."
metadata: { migration: "G-05", flag: "DUP_SUSPECT", groupKey: "<phone_core>", peers: [...] }
```

**Không dùng `LeadDuplicate`** (`schema:3560-3570`): bảng đó ghi *"có submit mới cùng SĐT"* (`primaryLeadId` + `duplicatePhone` + `source`), **không có** `duplicateLeadId` nên không diễn đạt được cặp hồ sơ. Muốn dùng thì phải thêm cột — chi phí bằng `migrationFlags` mà kém rõ nghĩa hơn.

**Không dùng `LeadAuditLog`** — đã đóng băng (§1 mục 10).

### Nghi ngờ trùng **KHÁC** SĐT — cố ý KHÔNG làm

Không dò trùng theo tên PH, tên con, hay email. Tỷ lệ dương tính giả cao (trùng tên là chuyện thường ở VN), và spec chỉ nói tới SĐT. Ghi ra đây để không ai "bổ sung cho đủ" về sau.

## 2.3 Bản ghi cũ thiếu trường bắt buộc mới

**Luật gốc: migration KHÔNG BAO GIỜ được fail cả lô vì một bản ghi thiếu dữ liệu.**

Hệ quả cứng lên schema:

> 🔴 **Mọi cột thêm ở SL-09/SL-10/SL-12 phải là `NULLABLE` hoặc có `@default`.**
> Thêm cột `NOT NULL` không default vào bảng đang có dữ liệu prod = migration đổ ngay ở bước `ALTER TABLE`, và vi phạm luật cứng #4.
> Kiểm chứng: `lib/crm/lead-qualify.ts:87-97` tạo `Lead` chỉ với 7 trường (`parentName`, `phone`, `note`, `centerId`, `qualifiedAt`, `commissionSource`, `adminId`) — thêm bất kỳ trường bắt buộc nào là chết luồng lead Messenger.

| Trường mới thiếu | Giá trị điền | Cờ ghi vào `migrationFlags` | Ai bổ sung sau |
|---|---|---|---|
| `LeadChild.dob` | `NULL` | `NO_DOB` | Sale, khi gọi lần tới |
| `LeadChild.gender` | `NULL` | `NO_GENDER` | Sale |
| `LeadChild.contractValue` | `NULL` | `NO_CONTRACT_VALUE` (chỉ đặt khi `status ∈ {ENROLLED, REGISTERED}` — lead chưa chốt thì không có giá trị là **đúng**, không phải thiếu) | Kế toán / QLCS |
| `LeadChild.closedAt` | `NULL` nếu lead >1 con | `CLOSED_AT_AMBIGUOUS` | QLCS |
| `Lead.lostReasonId` | danh mục `KHONG_RO_DU_LIEU_CU` | `LOST_REASON_UNKNOWN` | Sale phụ trách |
| `Lead.lostAt` | `updatedAt` (proxy) | `LOST_AT_IS_PROXY` | — (không sửa được, chỉ để báo cáo biết đừng tin) |
| `Lead.createdById` | `NULL` | `NO_CREATOR` | — |
| `Lead.city` / `ward` / `addressDetail` | `NULL` hoặc bóc từ note (§2.4) | `ADDRESS_FROM_NOTE` / `NO_ADDRESS` | Sale |
| `Lead.campaignId` / `adId` | `NULL` | `NO_CAMPAIGN_ID` | Marketing (chỉ có từ ngày bật D-01 trở đi, không truy ngược được) |
| `Lead.sourceId` | `NULL` | `SOURCE_UNMAPPED` | Admin, ở màn danh mục |
| `LeadChild.status` | `NEW` | `STATUS_UNMAPPED` | Sale |
| — (mất nghĩa khi ánh xạ) | — | `STATUS_LOSSY` | — |

**Lối vào cho người vận hành** (phải có, nếu không cờ chỉ là rác trong DB):
- Bộ lọc `?flag=<CỜ>` trên `/admin/leads`, đọc `migrationFlags`.
- Badge trên chi tiết lead khi `migrationFlags` khác rỗng.
- Một truy vấn đếm theo cờ, chạy hằng tuần cho tới khi về 0 (xem bảng đối soát §3 cuối).

## 2.4 Dữ liệu đang bị nhét trong `Lead.note`

### Có bóc ra không? **CÓ — nhưng chỉ 3 trường, chỉ ở chế độ dry-run trước, và KHÔNG xoá text gốc.**

Đây **không** chỉ là chuyện của form Sale. Có **năm** nơi sinh `note` có cấu trúc, hai định dạng khác nhau:

| Nguồn | File:dòng | Khoá sinh ra | Dấu nối |
|---|---|---|---|
| Form Sale (MISA) | `lib/lead/intake/map-sale-form.ts:119-130` | `Tỉnh/TP:`, `Địa chỉ:`, `Nhân viên nhập:` | `\n` (`buildNote`, `lib/lead/intake/normalize.ts:129-138`) |
| Quà tặng | `lib/lead/intake/map-quatang.ts:135-155` | `Tỉnh/TP:`, `NV giới thiệu:`, `Mã link giới thiệu:`, `Aff clickId:`, `UTM:` | `\n` |
| Trang liên hệ | `app/(public)/lien-he/_components/contact-form.tsx:334-346` | `Cơ sở:`, `Trường:`, `Lớp:`, `Tỉnh/TP:`, `Chủ đề:`, `Quan tâm:` | **` \| `** (một dòng) |
| Landing cũ | `components/legacy-laptrinhrobot/_utils/tracking.ts:119-131` | `Khoá:`, `Cơ sở:`, `Trường:`, `Lớp:`, `Tỉnh/TP:` | **` \| `** (một dòng) |
| Modal tư vấn khoá | `components/khoa-hoc/consult-modal.tsx:90-96` | `[TƯ VẤN TỪ TRANG …]`, `Khóa quan tâm:`, `Thời gian muốn liên hệ:` | `\n` |

Ngoài ra `buildNote` gắn tiền tố `⚠️ ` cho mọi dòng cảnh báo (`normalize.ts:133`) — parser phải bỏ qua các dòng đó.

### Bóc gì, độ tin bao nhiêu

| Khoá trong note | Đích | Đánh giá độ tin | Lý do |
|---|---|---|---|
| `Nhân viên nhập: <mã>` | `Lead.createdByName` (+ join `Employee.employeeCode` → `createdById`) | **CAO** | Chỉ do form Sale sinh, giá trị là mã NV có trần 50 ký tự (`map-sale-form.ts:52`) và đã được `resolveOwner` tra DB (`lib/lead/intake/ingest.ts:109-113`). Đối chiếu được với bảng `Employee` ⇒ **tự kiểm chứng được**. |
| `Địa chỉ: <chuỗi>` | `Lead.addressDetail` | **CAO** | Chỉ do form Sale sinh, nằm trên dòng riêng (`\n`), trần 255 (`map-sale-form.ts:55`). |
| `Tỉnh/TP: <chuỗi>` | `Lead.city` | **TRUNG BÌNH — khác nhau theo nguồn** | Form Sale: giá trị đi qua `misaProvinceName()` (tập đóng) ⇒ **cao**. Ba nguồn còn lại: người dùng gõ tự do ⇒ phải chuẩn hoá `normalizeVi()` rồi khớp danh mục; không khớp thì **để trống**, không đoán. |
| `Trường: <chuỗi>` | `LeadChild.schoolName` | **TRUNG BÌNH** | Chỉ đúng khi lead có **đúng 1** con. Lead nhiều con ⇒ **bỏ qua**, không gán bừa. |
| `Lớp: <chuỗi>` | `LeadChild.gradeLevel` | **TRUNG BÌNH** | Như trên. |
| `Cơ sở: <chuỗi>` | — | **KHÔNG BÓC** | `Lead.centerId` đã được `matchCenter()` giải quyết lúc nhập (`lib/lead/intake/normalize.ts:88-118`, `ingest.ts:268-271`). Bóc lại là chạy song song hai nguồn sự thật cho cùng một trường. |
| `Khoá:` / `Khóa quan tâm:` / `Quan tâm:` | — | **KHÔNG BÓC** | `Lead.courseId` là nguồn thật. Chuỗi trong note là tên hiển thị, khớp lỏng. |
| `NV giới thiệu:` / `Mã link giới thiệu:` / `Aff clickId:` / `UTM:` | — | **KHÔNG BÓC** | `map-quatang.ts:139-142` ghi rõ đây là hệ affiliate **riêng của quatang**, KHÁC `Affiliate.code` của repo. Gán bừa = chia hoa hồng sai người. |
| `Chủ đề:` / `Thời gian muốn liên hệ:` / `[TƯ VẤN TỪ TRANG …]` | — | **KHÔNG BÓC** | Không có cột đích trong G-01. |
| `⚠️ <cảnh báo>` | — | **KHÔNG BÓC** | Là ghi chú vận hành, phải ở lại `note`. |

### Cái KHÔNG bóc được — nói rõ để không ai kỳ vọng

- **Lead từ 3 webhook cũ** (facebook/zalo/google-form): `note` lấy từ `pick("note","message","noi_dung","ghi_chu")` (`lib/lead/webhook.ts:225`) — **text tự do, không cấu trúc**. Recall = **0**.
- **Lead nhập tay** qua `/admin/leads/new`: `note` là ô tự do trần 2000 (`actions.ts:576`). Recall = **0**.
- **Lead import Excel**: `note` = cột "Ghi chú" tự do (`lib/lead/import.ts:132`). Recall = **0**.

⇒ Bóc note **chỉ phủ được** phần lead sinh từ 5 nguồn có cấu trúc. **Không đoán trước tỷ lệ** — con số thật phải đo bằng dry-run (xem `G05-T13`).

### Cách chạy

1. Chạy `--dry-run` (mặc định), xuất CSV `leadId, nguồn, dòng note gốc, khoá, giá trị bóc được, đích, mức tin`.
2. Người vận hành soi mẫu **≥ 100 dòng mỗi mức tin**, ký duyệt.
3. Chạy `--apply` — ghi vào cột mới, đặt cờ `ADDRESS_FROM_NOTE` / `SCHOOL_FROM_NOTE`.
4. 🔴 **Phase A: KHÔNG xoá dòng đã bóc khỏi `note`.** Giữ nguyên text gốc. Xoá chỉ được làm ở Phase B, sau khi UI mới đã hiển thị cột thật ≥ 2 tuần.

Theo mẫu đã ship trong repo: `scripts/phone-backfill.ts:1-20` (`--apply` mới ghi, mặc định dry-run, idempotent, in `DB host` trước khi chạy).

## 2.5 Chiến lược 2 PHASE — bắt buộc

Căn cứ: luật cứng Nền Hệ thống **#4**, chú thích `prisma/schema.prisma:1459-1460` (*"giữ đọc-only, 2-phase, KHÔNG drop"*), và kết luận **SL-15** ở `docs/prd/A-nen-tang.md`.

### Phase A — nằm TRONG G-05

| Việc | Chi tiết |
|---|---|
| Migration schema | **Chỉ ADDITIVE.** `LeadChild`: `centerId?`, `orgUnitId?`, `status?`, `closedAt?`, `contractValue?`. `Lead`: `lostReasonId?`, `lostNote?`, `lostAt?`, `sourceId?`, `createdById?`, `createdByName?`, `gender?`, `dob?`, `facebookUrl?`, `city?`, `ward?`, `addressDetail?`, `campaignId?`, `adId?`, `migrationFlags String[] @default([])`. Bảng mới: `LeadLostReason`, `LeadSource`, `UserTablePreference`. **KHÔNG `ALTER … DROP`, KHÔNG `RENAME`, KHÔNG `SET NOT NULL`.** |
| Khai vào 2 nơi | `LeadChild` thêm vào `SCOPED_MODELS` (`lib/db-scope.ts:11-56`) **và** `BACKFILL_SPECS` (`lib/org/center-bridge.ts`). Quên ⇒ test `[US-07-IT-08b]` đỏ hoặc rò chéo cơ sở im lặng. |
| Backfill | Script `scripts/g05-backfill-lead-student.ts`, mặc định dry-run, `--apply` mới ghi, idempotent. |
| Đường đọc | Tất cả qua helper `getLeadChildView(lead)`. Cột phẳng **chỉ** còn được đọc bên trong helper + khối legacy `lead-children.tsx`. |
| Đường ghi | **GHI KÉP** ở 5 chỗ: `api/leads/route.ts:90`, `leads/actions.ts:635` + `:756`, `import/leads/route.ts:243`, `intake/ingest.ts:344`, `students/sync-name.ts:111`. |
| Cột cũ | `Lead.childName` / `childAge` **giữ nguyên, còn được ghi**. |

### Phase B — story RIÊNG, SAU G-05, không kèm vào G

| Việc | Chi tiết |
|---|---|
| Ngừng ghi cột cũ | Bỏ vế `childName` ở 5 đường ghi trên. |
| Chờ ổn định | Xem điều kiện dưới. |
| Drop | `ALTER TABLE "Lead" DROP COLUMN "childName", DROP COLUMN "childAge";` + có thể drop `migrationFlags`. |

### Điều kiện chuyển Phase A → Phase B (phải thoả **tất cả**)

| # | Điều kiện | Cách đo |
|---|---|---|
| 1 | ≥ **14 ngày** liên tục trên prod với Phase A, không rollback | nhật ký deploy |
| 2 | Truy vấn đối soát trả **0** chênh lệch **7 ngày liên tiếp** | `SELECT count(*) FROM "Lead" l WHERE l."deletedAt" IS NULL AND btrim(coalesce(l."childName",'')) <> '' AND NOT EXISTS (SELECT 1 FROM "LeadChild" c WHERE c."leadId"=l.id);` phải `= 0` |
| 3 | Grep `childName`/`childAge` trên mã sản phẩm còn **0 hit** ngoài helper + script migration + khối legacy | `grep -rn "childName\|childAge" app lib components --include=*.ts --include=*.tsx` |
| 4 | 4 khoá tìm kiếm (§1 mục 8) đã có nhánh `children` và có test | `pnpm test:unit` + e2e |
| 5 | `instrumentation-client.ts:44` và `lib/permissions/registry/crm.ts:15` đã cập nhật (typecheck **không** bắt được — phải soi tay) | review |
| 6 | Số lead mang cờ `DUP_SUSPECT` **đã được người vận hành xử hết** hoặc BGĐ chấp nhận để lại | truy vấn đếm cờ |
| 7 | Đã chốt **SL-09b** (`Order.leadChildId` hay bảng phân bổ) | quyết định ký |

### Ai quyết

| Bước | Người quyết |
|---|---|
| Nội dung migration additive, script backfill | Dev — nằm trong story G-05 |
| **Chạy migration + backfill trên PROD** | **Người vận hành chạy tay** sau khi Dev đưa dry-run — luật cứng #4. Không tự chạy qua CI. |
| Mở story Phase B | **Chủ dự án**, dựa trên 7 điều kiện trên |
| Chạy `DROP COLUMN` trên PROD | Người vận hành chạy tay, có bản backup ngay trước đó |

### 🔴 Ràng buộc môi trường phải nhớ

`test.satarobo.vn` và **máy local dùng chung một DB** (CLAUDE.md, xác nhận 01/08). Migration `DROP`/`RENAME` sẽ **xoá thẳng dữ liệu đang làm việc ở local**. Đây là lý do thứ hai (ngoài luật #4) để Phase B không kèm vào G-05.

## 2.6 Thứ tự chạy

| # | Bước | Nội dung | Cổng qua bước sau |
|---|---|---|---|
| **0** | Khoá schema | Chốt SL-08 → SL-15 + **SL-09b** + **SL-00** (bảng mới mang **cả** `centerId` và `orgUnitId`) ghi vào `documentation/`. | Chủ dự án ký. **SL-09b và SL-12 khoá danh sách cột CUỐI CÙNG** — G-04 (tuỳ chọn cột) lưu theo tên cột, đổi sau là mồ côi cấu hình người dùng. |
| **1** | Test đỏ trước | Viết trọn bộ Phần 3 **trước** khi viết Server Action (luật cứng #5). | Test chạy và **đỏ**. |
| **2** | Migration schema (ADDITIVE) | `pnpm db:migrate --name g05_lead_student_additive`. Dry-run trên DB test local trước. | `pnpm typecheck && pnpm lint && pnpm build` xanh. |
| **3** | Khai `SCOPED_MODELS` + `BACKFILL_SPECS` | `lib/db-scope.ts` + `lib/org/center-bridge.ts`. | Test `[US-07-IT-08b]` xanh + test cách ly cơ sở của `LeadChild` xanh. |
| **4** | **Backfill** (dry-run → apply) | `scripts/g05-backfill-lead-student.ts`. Đọc, đếm, in báo cáo. Rồi `--apply`. | Bảng đối soát §3 khớp 100%. |
| **5** | **Đổi đường ĐỌC** | 4 khoá tìm kiếm + mọi `HELPER` ở Phần 1. Cột phẳng vẫn còn, vẫn đúng ⇒ **an toàn để đi trước**. | E2E `G05-T15` (tìm theo tên con ra đủ) xanh. |
| **6** | **Đổi đường GHI (ghi kép)** | 5 đường ghi + form. **Phải sau bước 5**: nếu đi trước, lead mới có `LeadChild` mà UI vẫn đọc cột phẳng ⇒ lead mới **vô hình**. | E2E tạo lead qua cả 5 đường → thấy đủ ở mọi màn. |
| **7** | Backfill **lần hai** (vét) | Chạy lại script — bắt lead sinh trong khoảng bước 4 → 6. Idempotent nên vô hại. | Truy vấn đối soát `= 0`. |
| **8** | Bóc `note` | Dry-run → duyệt tay → apply (§2.4). | Người vận hành ký mẫu. |
| — | *(Phase B — story riêng)* | Ngừng ghi cột cũ → chờ 7 điều kiện → drop. | — |

> Thứ tự **đọc trước, ghi sau** là điểm dễ làm ngược nhất. Lý do: sau bước 4 mọi lead đều có `LeadChild`, nên đường đọc mới **đã đúng ngay**; còn nếu ghi trước thì có một cửa sổ mà dữ liệu mới nằm ở nơi UI chưa nhìn.

## 2.7 Kế hoạch ROLLBACK

| Bước | Cách quay lại | Mất gì | Thời gian |
|---|---|---|---|
| **2** (migration additive) | `git revert` commit schema. **Không** cần `DROP COLUMN` — cột thừa nullable là vô hại, mã cũ không biết tới nó. Nếu buộc phải dọn: `ALTER TABLE … DROP COLUMN` **chỉ khi bước 4 chưa chạy**. | Không mất gì | phút |
| **3** (`SCOPED_MODELS`) | `git revert`. `LeadChild` quay về "không auto-scope" — **đúng hiện trạng hôm nay**. | Không | phút |
| **4** (backfill) | `DELETE FROM "LeadChild" WHERE id IN (SELECT id FROM "LeadChild" WHERE <cờ nguồn>)`. 🔴 **Bắt buộc**: script phải ghi dấu nguồn để xoá lại đúng dòng mình tạo — dùng `LeadChild.note` bắt đầu bằng `[G-05]` **hoặc** ghi danh sách id ra file `.json` khi `--apply`. Không có dấu ⇒ **không rollback được** (không phân biệt với con do người dùng nhập). | Cột mới trên `Lead` giữ nguyên (vô hại) | ~10 phút |
| **5** (đường đọc) | `git revert` + redeploy. Cột phẳng vẫn nguyên vẹn nên UI cũ chạy lại ngay. | Không | 1 deploy |
| **6** (ghi kép) | `git revert` + redeploy. Ghi kép nên cột phẳng luôn đủ ⇒ **không mất lead nào**. `LeadChild` sinh trong thời gian đó **để lại**, không xoá (là dữ liệu thật). | Không | 1 deploy |
| **7** (backfill lần hai) | như bước 4 | — | — |
| **8** (bóc note) | `UPDATE "Lead" SET city=NULL, ward=NULL, "addressDetail"=NULL, "createdByName"=NULL WHERE 'ADDRESS_FROM_NOTE' = ANY("migrationFlags");` — an toàn vì **`note` gốc chưa bị đụng**. | Không | phút |
| *(Phase B — drop)* | 🔴 **KHÔNG rollback được bằng mã.** Chỉ khôi phục từ backup Supabase (RPO 24h). ⇒ Bắt buộc snapshot ngay trước khi chạy. | Tới 24h dữ liệu nếu phải restore | giờ |

**Điểm không quay lại:** chỉ có **một** — `DROP COLUMN` ở Phase B. Toàn bộ G-05 (bước 0–8) rollback được bằng `git revert` + một câu `DELETE`/`UPDATE`.

---

# PHẦN 3 — KỊCH BẢN KIỂM THỬ MIGRATION

Môi trường: **Postgres local** (`satarobo_test`), theo `.claude/rules/prisma-db.md`. `resetDb()` assert URL là `127.0.0.1`/`localhost` trước khi xoá. 🔴 **Không bao giờ trỏ vào Supabase.**

## 3.1 Ba kịch bản bắt buộc

### (i) Phụ huynh có 2 con

| | |
|---|---|
| **ID** | `G05-T01` |
| **Tình huống** | PH có 2 con. Trong dữ liệu cũ, chuyện này tồn tại ở **hai hình dạng khác nhau** — phải test cả hai và cho ra kết quả **khác nhau**. |
| **Loại** | happy path |

**Nhánh (i-a) — 1 `Lead` đã có 2 `LeadChild` (dữ liệu R7-01 chuẩn):**

```
Lead        { id: "L-A", parentName: "Trần Thị Mai", phone: "84905111222",
              childName: "Trần Minh An", childAge: 8, status: "CONSULTING",
              centerId: CS1, courseId: C-Sata1, createdAt: 2026-03-01 }
LeadChild   { leadId: "L-A", fullName: "Trần Minh An",  ageYears: 8 }
LeadChild   { leadId: "L-A", fullName: "Trần Minh Bảo", ageYears: 6 }
```

**Bước:** chạy backfill `--apply`.
**Kết quả mong đợi:**
- `LeadChild WHERE leadId='L-A'` vẫn **đúng 2 dòng**. 🔴 **KHÔNG** tạo dòng thứ ba từ `childName`.
- Cả 2 dòng được **cập nhật** `centerId`/`orgUnitId`/`status` (SL-08/SL-09), **không** đụng `fullName`/`ageYears`.
- `Lead.childName` vẫn `"Trần Minh An"` (Phase A không xoá).
- Không cờ `DUP_SUSPECT` (chỉ 1 lead).

**Nhánh (i-b) — 2 `Lead` riêng, cùng SĐT, mỗi lead 1 con (dữ liệu cũ hơn):**

```
Lead { id: "L-B1", parentName: "Lê Văn Hùng", phone: "84906333444",
       childName: "Lê Gia Hân", childAge: 9,  status: "TRIAL_ATTENDED", createdAt: 2026-01-10 }
Lead { id: "L-B2", parentName: "Lê Văn Hùng", phone: "84906333444",
       childName: "Lê Gia Bảo", childAge: 7,  status: "NEW",            createdAt: 2026-05-20 }
(cả hai: 0 dòng LeadChild)
```

**Kết quả mong đợi — nhất quán với luật "không tự động merge" (§2.2):**
- Sinh ra **2 `Lead` + 2 `LeadChild`** — mỗi lead một con. **KHÔNG** gộp thành 1 lead 2 con.
- **CẢ HAI** lead nhận cờ `DUP_SUSPECT` + `DUP_GROUP:906333444`.
- Mỗi lead có **1** dòng `LeadActivity` type `NOTE` nêu đích danh id lead còn lại.
- `Lead.deletedAt`, `status`, `assignedToId` của cả hai **không đổi**.
- Người vận hành gộp tay sau; migration **không** làm hộ.

> Đây chính là điểm khác nhau phải nói rõ: **(i-a) không nhân đôi, (i-b) không tự gộp.** Cùng một hiện tượng nghiệp vụ ("PH hai con"), hai kết quả migration khác nhau, vì hình dạng dữ liệu đầu vào khác nhau.

---

### (ii) Lead trùng SĐT

| | |
|---|---|
| **ID** | `G05-T02` |
| **Tình huống** | Nhiều bản ghi cùng số điện thoại. Kỳ vọng: **KHÔNG merge, chỉ đánh dấu.** |
| **Loại** | edge case |

**Dữ liệu vào:**

```
Lead { id:"D1", parentName:"Phạm Thu Hà",  phone:"84907555666", childName:"Phạm Bảo Long",
       status:"ENROLLED",   assignedToId:U-sale1, centerId:CS1, createdAt:2026-02-01 }
Lead { id:"D2", parentName:"Phạm T. Hà",   phone:"84907555666", childName:"Phạm Bảo Long",
       status:"NEW",        assignedToId:U-sale2, centerId:CS2, createdAt:2026-06-15 }
Lead { id:"D3", parentName:"Bố bé Long",   phone:"84907555666", childName:NULL,
       status:"LOST",       assignedToId:NULL,    centerId:CS1, createdAt:2026-07-02 }
```

**Kết quả mong đợi:**

| Kiểm | Giá trị |
|---|---|
| Số `Lead` sau migration | vẫn **3** |
| `LeadChild` mới | **2** (D1, D2). D3 `childName IS NULL` ⇒ **không** tạo dòng |
| `D3.migrationFlags` | chứa `DUP_SUSPECT`, `MISSING_CHILD_NAME`, `LOST_REASON_UNKNOWN`, `LOST_AT_IS_PROXY` |
| Cả 3 lead | đều có `DUP_SUSPECT` + `DUP_GROUP:907555666` |
| `assignedToId`, `status`, `centerId`, `deletedAt` | **không đổi** ở cả 3 |
| `LeadActivity` | 3 dòng mới (mỗi lead 1), mỗi dòng liệt kê 2 id còn lại |
| Không có | bất kỳ `LeadChild` nào bị chuyển lead, bất kỳ `Order`/`Note` nào bị đụng |

---

### (ii-b) Case biên — SĐT lưu dạng `0…` và `84…` lẫn lộn

| | |
|---|---|
| **ID** | `G05-T03` |
| **Tình huống** | Cùng một số, hai cách lưu. **Lỗ hổng đã biết**: đường admin so khớp **đúng bằng** chuỗi canonical nên bỏ sót bản ghi cũ dạng `0…`. |
| **Loại** | error handling |

**Bằng chứng lỗ hổng trong mã:**

| Nơi | Hành vi |
|---|---|
| `app/(admin)/admin/leads/actions.ts:596` (`createLeadManual`) | `where: { phone: d.phone, deletedAt: null }` — **so bằng**, `d.phone` đã canonical `84…` ⇒ **không thấy** lead cũ `0…` |
| `app/(admin)/admin/leads/actions.ts:731` (`updateLeadFields`) | như trên |
| `app/(admin)/admin/leads/import/page.tsx:56-59` | API trả `phone` **thô từ DB**, client tra bằng `normalizePhone()` (ra `84…`) ⇒ trượt bản ghi `0…`. Phải dùng `phoneKey()` (`lib/phone.ts:128-137`) |
| Ngược lại — **đã đúng** | `lib/lead/dedup.ts:18-24` (`phoneVariants`), `lib/crm/lead-qualify.ts:76-79`, `app/api/admin/import/leads/route.ts:190` (`expandPhoneVariants`), `app/api/admin/import/leads/precheck/route.ts:48` |

**Dữ liệu vào:**

```
Lead { id:"P1", phone:"0905123456",   parentName:"Ngô Thị Lan",  childName:"Ngô Minh Quân", createdAt:2025-11-01 }
Lead { id:"P2", phone:"84905123456",  parentName:"Ngô T. Lan",   childName:"Ngô Minh Quân", createdAt:2026-06-01 }
Lead { id:"P3", phone:"0905 123 456", parentName:"Ngô Văn Bình", childName:NULL,            createdAt:2026-07-01 }
```

**Bước:**
1. Chạy backfill.
2. Mở `/admin/leads`, gõ `0905123456` vào ô tìm.
3. Mở `/admin/leads/new`, nhập SĐT `0905123456` → bấm Lưu.

**Kết quả mong đợi:**

| Kiểm | Giá trị |
|---|---|
| Nhóm trùng | **1 nhóm, 3 lead** — vì khoá gom là `regexp_replace(phone,'^(84\|0)','')` = `905123456` (P3 có khoảng trắng ⇒ script phải `stripFormatting` trước) |
| Cả P1, P2, P3 | có `DUP_SUSPECT` + `DUP_GROUP:905123456` |
| 🔴 Gom theo `phone` thô | **PHẢI FAIL** — nếu test cho ra 3 nhóm 1-lead thì script đang dùng sai khoá |
| Bước 2 (tìm) | ra **cả 3** — `phoneSearchTerm()` (`lib/phone.ts:147-153`) trả `905123456`, khớp `contains` cả hai dạng |
| Bước 3 (tạo mới) | 🔴 **HIỆN TẠI SẼ TẠO ĐƯỢC LEAD THỨ TƯ** (bug có sẵn ở `actions.ts:596`). Test này ghim bug. Kỳ vọng **sau khi vá**: bị chặn với thông báo trùng SĐT. |

---

### (iii) Lead cũ thiếu trường bắt buộc mới

| | |
|---|---|
| **ID** | `G05-T04` |
| **Tình huống** | Bản ghi thiếu gần hết trường mới. **Migration KHÔNG được fail cả lô**; bản ghi vẫn chuyển được và **được đánh dấu thiếu**. |
| **Loại** | error handling |

**Dữ liệu vào (10 000 lead sạch + 5 lead thiếu, trộn lẫn):**

```
Lead { id:"M1", parentName:"Khách lẻ", phone:"84901000001",
       childName:"  ",  childAge:NULL, status:"NEW",  centerId:NULL, orgUnitId:NULL,
       courseId:NULL, source:NULL, note:NULL, createdAt:2024-05-01 }      -- tên con toàn khoảng trắng
Lead { id:"M2", ..., childName:"Đỗ Gia Kiệt", childAge:25 }                -- tuổi ngoài 3..18
Lead { id:"M3", ..., childName:"Vũ Hải Đăng", status:"LOST", updatedAt:2026-04-10 } -- LOST không lý do
Lead { id:"M4", ..., childName:"Bùi An Nhiên", status:"ENROLLED", convertedAt:2026-05-05 } -- chốt, không có giá trị hợp đồng
Lead { id:"M5", ..., childName:"Hồ Bảo Ngọc", source:"tiktok-livestream-t7" } -- nguồn không có trong danh mục
```

**Kết quả mong đợi:**

| Lead | `LeadChild` tạo? | `migrationFlags` |
|---|---|---|
| M1 | **KHÔNG** (tên rỗng sau trim) | `MISSING_CHILD_NAME`, `NO_DOB`, `NO_GENDER`, `NO_CREATOR`, `SOURCE_UNMAPPED` |
| M2 | **CÓ**, `ageYears = NULL` | `AGE_OUT_OF_RANGE`, `NO_DOB`, `NO_GENDER` |
| M3 | **CÓ**, `status = LOST` | `LOST_REASON_UNKNOWN`, `LOST_AT_IS_PROXY` (và `Lead.lostAt = 2026-04-10`, `lostReasonId → KHONG_RO_DU_LIEU_CU`) |
| M4 | **CÓ**, `status = ENROLLED`, `closedAt = 2026-05-05`, `contractValue = NULL` | `NO_CONTRACT_VALUE` |
| M5 | **CÓ** | `SOURCE_UNMAPPED`; `Lead.sourceId = NULL`; `Lead.source` **giữ nguyên** `"tiktok-livestream-t7"`; sinh 1 `LeadSource { code:'TIKTOK_LIVESTREAM_T7', isActive:false }` |

| Kiểm chung | Giá trị |
|---|---|
| Exit code script | **0** |
| 10 000 lead sạch | chuyển **đủ**, không bị 5 lead lỗi kéo theo |
| Log | in ra **từng** lead bị đánh cờ, kèm lý do — không nuốt im lặng |
| Chạy lại `--apply` lần hai | 0 dòng mới, 0 cờ mới (idempotent) |

## 3.2 Kịch bản còn lại

| ID | Tình huống | Dữ liệu đầu vào | Bước thực hiện | Kết quả mong đợi | Loại |
|---|---|---|---|---|---|
| `G05-T05` | Lead **đã convert** thành học viên | `Lead{status:"ENROLLED", childName:"Trịnh Gia Huy", convertedAt:2026-04-02}` + `Student{name:"Trịnh Gia Huy"}` + `Enrollment{leadChildId: NULL}` (convert trước R7-06) | backfill `--apply` | Tạo `LeadChild{fullName:"Trịnh Gia Huy", status:"ENROLLED", closedAt:2026-04-02}`. `Student` **không đụng**. `Enrollment.leadChildId` **vẫn NULL** — migration **không** tự nối ngược (không đủ căn cứ; nối sai là gán doanh thu sai con). Cờ `ENROLLMENT_NOT_LINKED`. | edge case |
| `G05-T06` | Lead đã convert **có** `Enrollment.leadChildId` | `Lead + LeadChild{id:"LC1"} + Enrollment{leadChildId:"LC1"}` | backfill | **0 dòng mới**. `LC1` chỉ được cập nhật cột mới. `Enrollment` không đụng. | happy path |
| `G05-T07` | `childName` **rỗng** | `Lead{childName:""}`, `Lead{childName:"   "}`, `Lead{childName:NULL}` | backfill | **0** `LeadChild` cho cả ba. Không tạo placeholder kiểu `"(chưa rõ)"`. Cờ `MISSING_CHILD_NAME`. | edge case |
| `G05-T08` | `childName` rỗng nhưng **đã có** `LeadChild` | `Lead{childName:NULL}` + 1 `LeadChild{fullName:"Đinh Khánh Vy"}` | backfill | 0 dòng mới; `LeadChild` được cập nhật cột phạm vi/trạng thái. Cờ `MISSING_CHILD_NAME` **KHÔNG** được đặt (lead có con rồi). | edge case |
| `G05-T09` | 🔴 **Chống nhân đôi** — lead có `LeadChild` sẵn **trùng tên** với `childName` | `Lead{childName:"Cao Minh Thư"}` + `LeadChild{fullName:"cao minh thư"}` (khác hoa/thường) và biến thể `"Cao  Minh  Thư"` (2 dấu cách) | backfill | **0 dòng mới** ở cả hai biến thể. Điều kiện `NOT EXISTS (LeadChild WHERE leadId=…)` đã đủ; **không** cần so tên. Nhưng test vẫn phải phủ để chặn hồi quy nếu ai đó đổi điều kiện thành so-tên (khi đó phải dùng `isSameChildName` — `lib/lead/intake/normalize.ts:124-127`). | edge case |
| `G05-T10` | Lead có `LeadChild` nhưng **khác** tên `childName` (PH 2 con, cột phẳng là đứa thứ nhất) | `Lead{childName:"Hà Nhật Minh"}` + `LeadChild{fullName:"Hà Nhật Nam"}` | backfill | **0 dòng mới**. Cờ `FLAT_NAME_NOT_IN_CHILDREN` để người vận hành soi — có thể là con thứ hai chưa nhập. **Không** tự tạo. | edge case |
| `G05-T11` | Lead **đã xoá mềm** | `Lead{deletedAt:"2026-01-15", childName:"Lý Gia Bảo"}` | backfill | **KHÔNG** tạo `LeadChild`. Lý do: `LeadChild` không có `deletedAt`, tạo ra là sinh con "sống" thuộc lead "đã xoá" ⇒ mọi truy vấn `LeadChild` không lọc `lead.deletedAt` sẽ đếm nhầm. Cờ **không** đặt (lead đã xoá, không cần ai xử). | edge case |
| `G05-T12` | Lead xoá mềm **trùng SĐT** với lead sống | `Lead{id:"S1", deletedAt:NULL}` + `Lead{id:"S2", deletedAt:"2026-02-02"}`, cùng SĐT | backfill | Nhóm trùng **chỉ đếm lead sống** ⇒ `n=1` ⇒ **không** cờ `DUP_SUSPECT`. Khớp với `findRecentDuplicate` (`lib/lead/dedup.ts:22` lọc `deletedAt: null`). | edge case |
| `G05-T13` | Bóc `note` — **5 định dạng** | 5 lead, mỗi lead 1 nguồn: (a) sale form `"Tỉnh/TP: Đà Nẵng\nĐịa chỉ: 12 Lê Duẩn\nNhân viên nhập: NV007"`; (b) quatang `"Tỉnh/TP: Quảng Nam\nNV giới thiệu: Trần B\nAff clickId: xyz"`; (c) contact-form `"Cơ sở: CS1 \| Trường: TH Lê Lợi \| Lớp: 3A \| Tỉnh/TP: Đà Nẵng"`; (d) legacy `"Khoá: Sata1 \| Cơ sở: CS2 \| Trường: TH Hoà Khánh \| Lớp: 2B"`; (e) webhook facebook `"Chị muốn hỏi lớp cho bé nhà em ạ"` | chạy bóc note `--dry-run` rồi `--apply` | (a) `addressDetail="12 Lê Duẩn"`, `city="Đà Nẵng"`, `createdByName="NV007"` + join ra `createdById` nếu `Employee.employeeCode='NV007"` tồn tại. (b) chỉ `city="Quảng Nam"`; **KHÔNG** đụng affiliate. (c)(d) `LeadChild.schoolName`/`gradeLevel` + `city`; **KHÔNG** bóc `Cơ sở:`/`Khoá:`. (e) **0 trường** bóc được. 🔴 **`note` gốc của cả 5 giữ NGUYÊN VẸN.** | happy path |
| `G05-T14` | Bóc note khi lead có **>1 con** | Lead 2 `LeadChild`, note chứa `"Trường: TH Nguyễn Du \| Lớp: 4C"` | bóc note | **Bỏ qua** `Trường`/`Lớp` (không biết của con nào). `city` vẫn bóc (thuộc cấp lead). Cờ `SCHOOL_AMBIGUOUS`. | edge case |
| `G05-T15` | Đường **ĐỌC** — 4 khoá tìm kiếm | Lead đã tách con: `childName="Ngô Bảo Châu"`, `LeadChild.fullName="Ngô Bảo Châu"` + con thứ hai `"Ngô Bảo Trâm"` | Gõ `"Bảo Trâm"` vào: `/admin/leads` · `/admin/search` · `/api/admin/leads/export?q=` · ô lọc `/admin/trials` | **Cả 4** trả về lead. 🔴 Trước khi sửa `OR SEARCH`, cả 4 trả **0 kết quả** — test này phải **ĐỎ trước, xanh sau**. | happy path |
| `G05-T16` | Đường **GHI** — 5 lối tạo lead vẫn sinh `LeadChild` | — | Tạo lead qua: (1) `/admin/leads/new`; (2) form `/lien-he`; (3) form Sale `/api/public/lead-intake/sale-form`; (4) import Excel **1 con**; (5) webhook quatang | Cả 5 sinh **≥1 `LeadChild`**. 🔴 Lối (4) **hiện FAIL** — `app/api/admin/import/leads/route.ts:238-241` chỉ tạo `LeadChild` khi `>1 con`. | happy path |
| `G05-T17` | Đường GHI thứ 6 — đổi tên học viên dội ngược | `Student{name:"Cũ"}` + `LeadChild{fullName:"Cũ"}` + `Lead{childName:"Cũ"}` | Đổi tên học viên ở `/admin/students/[id]` → `"Mới"` | `LeadChild.fullName="Mới"` (`sync-name.ts:88-92`) **và** `Lead.childName="Mới"` (`:104-115`). 1 dòng `AuditLog` (**không** `LeadAuditLog`). 🔴 Phase B: khi cột bị drop, đường này **phải đã** bỏ vế `Lead.childName`, nếu không lỗi runtime ở màn Học viên. | happy path |
| `G05-T18` | Cách ly cơ sở của `LeadChild` sau SL-08 | Lead CS1 (2 con) + Lead CS2 (1 con). Actor = QLCS **chỉ** CS1 | `scopedDb(actor).leadChild.findMany({})` | Trả **đúng 2** dòng của CS1. Con của CS2 = 0 dòng. 🔴 Quên khai `SCOPED_MODELS` ⇒ `injectScope` thoát ngay ở `lib/db-scope.ts:269` và trả **cả 3** — rò chéo cơ sở ở đúng bảng doanh thu (SL-08). | error handling |
| `G05-T19` | Mask PII tên con | Lead 2 con. Actor có `leads:view-all` nhưng **không** `leads:view-pii` (vd `MARKETING`) | Mở `/admin/leads`, `/admin/leads/[id]`, gọi `/api/admin/leads/export` | Cả `childName` **và** `children[].fullName` đều bị mask. 🔴 `lib/lead/pii.ts:39-51` hiện **chỉ** mask cột phẳng ⇒ test này ĐỎ cho tới khi sửa. | error handling |
| `G05-T20` | Danh sách PII trong hai file "chuỗi" | — | Sau khi thêm cột, kiểm `instrumentation-client.ts:44` và `lib/permissions/registry/crm.ts:15` | Cả hai đã liệt kê trường tên con mới. 🔴 `pnpm typecheck` **KHÔNG** bắt được — phải có test/lint riêng hoặc soi tay trong checklist review. | error handling |
| `G05-T21` | **Khối lượng lớn** — đo thời gian + trần lô | 200 000 `Lead`, trong đó ~120 000 thoả điều kiện tạo `LeadChild` | Chạy dry-run rồi `--apply` với `BATCH=500` (theo mẫu `scripts/phone-backfill.ts:26`) | Chạy trọn, không timeout. Ghi nhận: thời gian dry-run, thời gian apply, peak RAM. 🔴 **Không** bọc cả 120 000 dòng trong **một** transaction — `import/leads/registered/route.ts:594` đã phải đặt `{ timeout: 180_000 }` cho lô nhỏ hơn nhiều. Chia lô, mỗi lô một transaction, ghi checkpoint để chạy tiếp được sau khi đứt. | edge case |
| `G05-T22` | Đứt giữa chừng | Kill script ở ~50% lô | Chạy lại `--apply` | Không nhân đôi dòng nào (điều kiện `NOT EXISTS` tự bảo vệ). Tổng cuối = tổng của lần chạy liền mạch. | error handling |
| `G05-T23` | Idempotent | — | Chạy `--apply` **ba** lần liên tiếp | Lần 2 và 3: 0 `LeadChild` mới, 0 `LeadActivity` mới, `migrationFlags` không nhân bản phần tử. | happy path |
| `G05-T24` | Fail-safe DB | Trỏ `DATABASE_URL` vào host **không phải** `127.0.0.1`/`localhost` trong bộ test | Chạy `resetDb()` | Ném lỗi và dừng — theo `.claude/rules/prisma-db.md`. | error handling |
| `G05-T25` | Đường convert sau backfill | Lead cũ chỉ có `childName`, sau backfill có 1 `LeadChild` | Mở `/admin/leads/[id]/convert` | `prefillStudents` (`convert/page.tsx:99-113`) lấy từ **nhánh `lead.children`**, không rơi vào fallback `childName`. Tên học viên prefill đúng. | happy path |
| `G05-T26` | Đơn hàng của PH 2 con | Lead 2 con + 1 `Order{leadId, totalAmount: 12_000_000}` | Truy vấn "doanh số theo học sinh" | 🔴 **KHÔNG quy được** — `Order` chỉ có `leadId` (`schema:3687-3688`). Test này ghi nhận **giới hạn đã biết** cho tới khi chốt SL-09b. Kỳ vọng: báo cáo trả `NULL`/`"chưa phân bổ"`, **không** chia đều 6tr/con (chia đều là bịa số). | error handling |

## 3.3 Bảng đối soát TRƯỚC/SAU migration — **bắt buộc chạy**

Chạy **trước** khi apply, **ngay sau** khi apply, và **hằng ngày trong 7 ngày** đầu. Chênh lệch ngoài cột "Kỳ vọng" = **dừng, không đi tiếp**.

### A. Đếm dòng

| # | Chỉ số | SQL | Kỳ vọng SAU |
|---|---|---|---|
| A1 | Tổng `Lead` (mọi trạng thái) | `SELECT count(*) FROM "Lead";` | **= TRƯỚC** (migration không tạo/xoá `Lead` nào) |
| A2 | `Lead` sống | `SELECT count(*) FROM "Lead" WHERE "deletedAt" IS NULL;` | **= TRƯỚC** |
| A3 | `Lead` xoá mềm | `SELECT count(*) FROM "Lead" WHERE "deletedAt" IS NOT NULL;` | **= TRƯỚC** |
| A4 | Tổng `LeadChild` | `SELECT count(*) FROM "LeadChild";` | `= TRƯỚC + N`, với `N` = A5 (dưới) |
| A5 | Lead **đủ điều kiện** tạo con | `SELECT count(*) FROM "Lead" l WHERE l."deletedAt" IS NULL AND btrim(coalesce(l."childName",'')) <> '' AND NOT EXISTS (SELECT 1 FROM "LeadChild" c WHERE c."leadId"=l.id);` | **TRƯỚC = N** · **SAU = 0** 🔴 |
| A6 | `LeadChild` do G-05 tạo | `SELECT count(*) FROM "LeadChild" WHERE note LIKE '[G-05]%';` (hoặc đếm từ file id script xuất ra) | **= N**. Không dấu ⇒ không rollback được (§2.7) |
| A7 | `Lead` có ≥1 con | `SELECT count(DISTINCT "leadId") FROM "LeadChild";` | `≥ TRƯỚC` |
| A8 | Tổng `Order` | `SELECT count(*) FROM "Order";` | **= TRƯỚC** |
| A9 | Tổng `Payment` | `SELECT count(*) FROM "Payment";` | **= TRƯỚC** |
| A10 | Tổng `Enrollment` | `SELECT count(*) FROM "Enrollment";` | **= TRƯỚC** |
| A11 | Tổng `Student` | `SELECT count(*) FROM "Student";` | **= TRƯỚC** |
| A12 | Tổng `LeadActivity` | `SELECT count(*) FROM "LeadActivity";` | `= TRƯỚC + số lead bị đánh cờ` |

### B. Tiền — **không được đổi một đồng nào**

| # | Chỉ số | SQL | Kỳ vọng |
|---|---|---|---|
| B1 | Tổng giá trị đơn | `SELECT coalesce(sum("totalAmount"),0) FROM "Order";` | **= TRƯỚC, chính xác tuyệt đối** |
| B2 | Tổng thực thu | `SELECT coalesce(sum(amount),0) FROM "Payment";` | **= TRƯỚC** |
| B3 | Tổng đơn gắn lead | `SELECT coalesce(sum("totalAmount"),0) FROM "Order" WHERE "leadId" IS NOT NULL;` | **= TRƯỚC** |
| B4 | Số đơn **mồ côi con** | `SELECT count(*) FROM "Order" WHERE "leadId" IS NOT NULL;` | Ghi nhận làm **mốc gốc** cho SL-09b: hôm nay **100%** đơn gắn lead đều chưa quy được về con |

> Migration G-05 **không đụng** `Order`/`Payment`. Ba dòng B1–B3 lệch dù chỉ 1 đồng = có gì đó ngoài kế hoạch đã chạy ⇒ **rollback ngay**.

### C. Lead theo trạng thái — **phân bố không đổi**

| # | Chỉ số | SQL | Kỳ vọng |
|---|---|---|---|
| C1 | `Lead` theo `status` | `SELECT status, count(*) FROM "Lead" WHERE "deletedAt" IS NULL GROUP BY 1 ORDER BY 1;` | **Từng dòng = TRƯỚC.** Migration KHÔNG đổi `LeadStatus` |
| C2 | `Lead` theo `centerId` | `SELECT "centerId", count(*) FROM "Lead" WHERE "deletedAt" IS NULL GROUP BY 1 ORDER BY 1;` | **Từng dòng = TRƯỚC** |
| C3 | `LeadChild` theo `status` mới | `SELECT status, count(*) FROM "LeadChild" GROUP BY 1 ORDER BY 1;` | Khớp Bảng C §2.1 khi cộng dồn từ C1 |
| C4 | Kiểm tổng ánh xạ | `sum(C3) = count(LeadChild)` | Khớp; 0 dòng `status IS NULL` |
| C5 | `LeadChild` chưa có cơ sở | `SELECT count(*) FROM "LeadChild" WHERE "centerId" IS NULL;` | `≤ ` số `Lead` có `centerId IS NULL` (SL-08 copy từ cha) |
| C6 | `LeadChild` chưa có `orgUnitId` | `SELECT count(*) FROM "LeadChild" WHERE "orgUnitId" IS NULL;` | như C5 |

### D. Cờ migration — sổ nợ cho người vận hành

| # | Chỉ số | SQL |
|---|---|---|
| D1 | Đếm theo từng cờ | `SELECT unnest("migrationFlags") AS flag, count(*) FROM "Lead" GROUP BY 1 ORDER BY 2 DESC;` |
| D2 | Số lead nghi trùng SĐT | `SELECT count(*) FROM "Lead" WHERE 'DUP_SUSPECT' = ANY("migrationFlags");` |
| D3 | Số **nhóm** trùng | `SELECT count(*) FROM (SELECT regexp_replace(phone,'^(84\|0)','') FROM "Lead" WHERE "deletedAt" IS NULL GROUP BY 1 HAVING count(*)>1) t;` |
| D4 | Lead chốt nhưng chưa có giá trị hợp đồng | `SELECT count(*) FROM "Lead" WHERE 'NO_CONTRACT_VALUE' = ANY("migrationFlags");` |
| D5 | Lead LOST không rõ lý do | `SELECT count(*) FROM "Lead" WHERE 'LOST_REASON_UNKNOWN' = ANY("migrationFlags");` |
| D6 | Nguồn chưa vào danh mục | `SELECT count(*) FROM "Lead" WHERE 'SOURCE_UNMAPPED' = ANY("migrationFlags");` |
| D7 | Lead có `childName` không nằm trong `children` | `SELECT count(*) FROM "Lead" WHERE 'FLAT_NAME_NOT_IN_CHILDREN' = ANY("migrationFlags");` |

> D1–D7 chạy **hằng tuần** cho tới khi D2/D4/D5/D6 về **0** hoặc BGĐ ký chấp nhận số dư. Đó là điều kiện #6 để mở Phase B (§2.5).

### E. Đối soát dữ liệu — không mất tên con nào

| # | Kiểm | SQL | Kỳ vọng |
|---|---|---|---|
| E1 | Mọi `childName` sống đều tìm thấy ở `LeadChild` **hoặc** có cờ | `SELECT count(*) FROM "Lead" l WHERE l."deletedAt" IS NULL AND btrim(coalesce(l."childName",'')) <> '' AND NOT EXISTS (SELECT 1 FROM "LeadChild" c WHERE c."leadId"=l.id) AND NOT ('FLAT_NAME_NOT_IN_CHILDREN' = ANY(l."migrationFlags"));` | **= 0** 🔴 |
| E2 | Không `LeadChild` nào mồ côi | `SELECT count(*) FROM "LeadChild" c LEFT JOIN "Lead" l ON l.id=c."leadId" WHERE l.id IS NULL;` | **= 0** (FK Cascade đảm bảo, kiểm cho chắc) |
| E3 | Không `LeadChild` nào thuộc lead đã xoá mềm **do G-05 tạo** | `SELECT count(*) FROM "LeadChild" c JOIN "Lead" l ON l.id=c."leadId" WHERE l."deletedAt" IS NOT NULL AND c.note LIKE '[G-05]%';` | **= 0** (khớp `G05-T11`) |
| E4 | `createdAt` của con backfill = `createdAt` của lead | `SELECT count(*) FROM "LeadChild" c JOIN "Lead" l ON l.id=c."leadId" WHERE c.note LIKE '[G-05]%' AND c."createdAt" <> l."createdAt";` | **= 0** — nếu >0 thì báo cáo C-03 sẽ tính sai "thời gian chốt" |
| E5 | `note` không bị cắt xén khi bóc | `SELECT count(*) FROM "Lead" WHERE 'ADDRESS_FROM_NOTE' = ANY("migrationFlags") AND length(note) < <độ dài đã chụp trước>;` | **= 0** (Phase A giữ nguyên `note`) |

---

## 4. Việc còn phải chốt trước dòng code đầu tiên của G-05

| # | Nội dung | Vì sao chặn | Chủ |
|---|---|---|---|
| 1 | **SL-09b** — `Order.leadChildId` hay bảng phân bổ `OrderLeadChildAllocation`, và nguồn số cho "doanh số theo học sinh" là `Order` hay `Payment` | C-03 không chạy được nếu thiếu. Chốt **sau** khi báo cáo đã lên = quy tay lại toàn bộ đơn cũ. `G05-T26` ghim giới hạn này. | Chủ dự án |
| 2 | **SL-00** — bảng mới mang `centerId` **và** `orgUnitId` hay chỉ một | 3 bảng mới của G (`LeadLostReason`, `LeadSource`, `UserTablePreference`) ra đời theo cách hiểu khác nhau = 3 lần đánh cược. `UserTablePreference` đã chốt **không mang cột nào** (SL-13). | Chủ dự án |
| 3 | 3 webhook cũ (facebook/zalo/google-form) có đẻ `LeadChild` không (§1 mục 4) | Chọn "không" ⇒ C-03 đếm theo học sinh **hụt toàn bộ** lead từ 3 nguồn này, vĩnh viễn. | Chủ dự án |
| 4 | Hình dạng file export sau G-05: 1 dòng/lead hay 1 dòng/con | Đổi sau khi Sale đã quen = đào tạo lại; và trần `take: 5000` (`export/route.ts:55`) đang cắt **im lặng**. | Chủ dự án |
| 5 | Danh mục **lý do rớt** (SL-11) và **ngưỡng cảnh báo lead treo** — spec ghi là "còn trống trong Cấu hình vận hành" | Không có danh mục thì cờ `LOST_REASON_UNKNOWN` không có chỗ để trỏ. | Chủ dự án |
| 6 | Bộ trường G-01 **khoá cuối** (SL-12) | G-04 (tuỳ chọn cột theo user) lưu cấu hình **theo tên cột**; đổi danh sách sau khi người dùng đã lưu ⇒ cấu hình mồ côi. | Chủ dự án |
