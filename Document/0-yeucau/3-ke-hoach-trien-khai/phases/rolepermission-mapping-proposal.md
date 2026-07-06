# Đề xuất mapping Role v1 → RoleDef v2 — ĐÃ DUYỆT (Kiệt, 06/07/2026)

> **Trạng thái: Kiệt đã ký duyệt** `phieu-kiet-duyet-rbac-mapping (1).docx` ngày 06/07/2026 — tick "Đồng ý" cho cả 5 mục (ACCOUNTANT, TRAINING, SALES_CSM, MARKETING, HR).
>
> **Đã seed vào `prisma/seed-roles.ts` + ÁP DỤNG THẬT lên DEV Supabase** (4/5 role): ACCOUNTANT (23 action → HO_ACCOUNTANT GLOBAL toàn bộ + subset 7 action → CENTER_ACCOUNTANT theo nghiệp vụ "thu tiền/hóa đơn/công nợ"), TRAINING (33 action → role `TRAINING` GLOBAL), SALES_CSM (25 action → CENTER_SALES_CSM, OWN cho phần lead cá nhân/CENTER cho phần vận hành), MARKETING (35 action → HO_MARKETING GLOBAL). Verify: `pnpm typecheck && lint` PASS, 90 action tham chiếu đối chiếu registry khớp 100%, `vitest run lib/auth` 115/115 PASS, seed chạy trên Postgres test local + DEV Supabase thật ra đúng số lượng permission mong đợi (23/33/25/35).
>
> ⚠️ **Sửa quan trọng (06/07/2026, sau khi seed lần đầu):** ban đầu định tạo role mới `HO_TRAINING` — phát hiện `prisma/patch-rbac-staff.ts` (K1, đã chạy PROD 02/07 + DEV trước đó) **đã tạo sẵn RoleDef code `TRAINING`** (không có tiền tố `HO_`) và **Phan Thành Toại đã có `UserOrgRole(TRAINING@HO)` từ trước** — chỉ role đó chưa có permission nào (0). Đã sửa seed dùng đúng code `TRAINING` hiện có thay vì tạo role trùng lặp `HO_TRAINING`. Không cần gán UserOrgRole mới cho Phan Thành Toại — anh ấy tự động có quyền ngay khi seed permission chạy.
>
> ✅ **HR ĐÃ SEED (07/07/2026)** — sau addendum điều tra (§4), Kiệt chọn **Phương án A**: tạo `CENTER_HR` (CENTER) bên cạnh `HO_HR` (GLOBAL, giờ đủ 23 action), sửa `prisma/patch-rbac-staff.ts` thêm nhánh routing theo `centerId` (giống ACCOUNTANT). `CENTER_HR` nhận 9 action vận hành hằng ngày tại cơ sở (`employees:view-all/view-public/edit`, `hr_attendance:checkin/view`, `students/classes/centers/holidays:view`) — loại trừ action nhạy cảm (`employees:create/view-salary/view-personal`, `honors:*`, `jobs:*`, `payroll:view`) giữ riêng ở `HO_HR`. Verify local test DB: `HO_HR` 23 perms, `CENTER_HR` 9 perms — đúng dự kiến. **Chưa gán UserOrgRole cho 2 thực tập sinh** (Lê Thị Tuyết Mai @ CS1, Trần Thị Thúy Liên @ CS2) vì cả 2 **chưa có tài khoản User** trong hệ thống — patch-rbac-staff.ts đã sửa sẽ tự route đúng `CENTER_HR` theo `centerId` ngay khi tài khoản được tạo.
>
> **Lưu ý về phần ACCOUNTANT/SALES_CSM:** Kiệt duyệt ở mức NGUYÊN TẮC (VD "toàn hệ thống→GLOBAL, theo cơ sở→CENTER"), không duyệt từng dòng trong số 23+25=48 action. Việc gán scopeType cụ thể cho từng action là suy luận có tài liệu hoá rõ ràng (xem comment trong `prisma/seed-roles.ts`) theo đúng nguyên tắc đã duyệt — nên spot-check lại nếu có action nào cảm thấy sai.

## Nguồn dữ liệu (9 phiếu, tất cả đã ký)

| Phiếu | Người ký | Chức vụ | Ngày ký |
|---|---|---|---|
| Ban Giám Đốc | Hồ Đắc Phúc | TGĐ | 04/07/2026 |
| Kế toán | Nguyễn Thị Bích Huệ | Kế toán tổng hợp | 05/07/2026 |
| Tư vấn/Sale/CSKH | Lê Thị Phương Liên | (Hoàng Diệu) | 06/07/2026 |
| Quản lý cơ sở 1 | Phan Thành Toại | (CS1) | 05/07/2026 |
| Quản lý cơ sở 2 | Lê Thị Phương Liên | (Hoàng Diệu) | 06/07/2026 |
| Đào tạo & Giáo viên | Phan Thành Toại | — | 05/07/2026 |
| Phòng Đào tạo (nội dung/LMS) | Phan Thành Toại | P. Đào Tạo | 06/07/2026 |
| Hành chính / đầu mối | Hồ Đắc Phúc | TGĐ | 04/07/2026 |
| Phụ huynh (tổng hợp CSKH) | — | CSKH | — |

Tất cả đóng dấu: *"Chúng tôi xác nhận các trả lời trên là quyết định chính thức. Thay đổi sau ngày ký sẽ ghi nhận thành yêu cầu bổ sung."*

**Ai được duyệt thay đổi phân quyền** — Câu 12 phiếu BGĐ: *"Chỉ TGĐ và Kiệt (Admin hệ thống) được quyền [cấp/thu quyền tài khoản]"* → tài liệu này đúng quy trình khi trình Kiệt duyệt.

---

## Bảng mapping — khuyến nghị theo từng role

| Role v1 | Khuyến nghị mapping v2 | scopeType | Độ tin cậy | Kiệt duyệt |
|---|---|---|---|---|
| `ACCOUNTANT` | Tách 2 role **đã có sẵn**: `HO_ACCOUNTANT` + `CENTER_ACCOUNTANT` | HO_ACCOUNTANT=GLOBAL, CENTER_ACCOUNTANT=CENTER | **Cao** (2 nguồn độc lập xác nhận) | ☐ Đồng ý &nbsp;☐ Cần sửa: __________ |
| `TRAINING` | Role **`TRAINING`** đã có sẵn (chỉ thêm permission) | GLOBAL | **Cao** (2 nguồn độc lập xác nhận) | ☐ Đồng ý &nbsp;☐ Cần sửa: __________ |
| `SALES_CSM` | Map vào role **đã có sẵn**: `CENTER_SALES_CSM` | OWN (phần cá nhân) / CENTER (phần QL xem chung) | **Cao** | ☐ Đồng ý &nbsp;☐ Cần sửa: __________ |
| `MARKETING` | Map vào role **đã có sẵn**: `HO_MARKETING` | GLOBAL | Trung bình (chỉ có "Ok", không phiếu riêng) | ☐ Đồng ý &nbsp;☐ Cần sửa: __________ |
| `HR` | **Chưa đủ dữ liệu** — xem mục 4 | Chưa xác định | Thấp — cần hỏi lại | ☐ Đồng ý &nbsp;☐ Cần sửa: __________ |

---

## 1. `ACCOUNTANT` → `HO_ACCOUNTANT` (GLOBAL) + `CENTER_ACCOUNTANT` (CENTER) — độ tin cậy CAO

**2 nguồn độc lập khớp nhau gần như y nguyên:**

- **BGĐ (câu 10):** *"Tuỳ theo cấp độ kế toán thuộc TT nào thì chỉ thấy ở TT đó. Riêng KT hội sở thì thấy hết."*
- **Kế toán tổng hợp Nguyễn Thị Bích Huệ, phiếu Kế toán câu 30:** *"Kế toán HO làm cho cả 2 cơ sở. Kế toán HO thì được xem tất cả các cơ sở, còn kế toán từng cơ sở thì chỉ được xem cơ sở đó."*

→ Cả người ra quyết định (TGĐ) và người trực tiếp làm nghiệp vụ (Kế toán tổng hợp) đều mô tả đúng 1 cấu trúc: **2 tầng** — hội sở (toàn hệ thống) và cơ sở (riêng từng nơi). Đây chính xác là 2 `RoleDef` **đã tồn tại sẵn** trong `prisma/seed-roles.ts` (`HO_ACCOUNTANT`, `CENTER_ACCOUNTANT`) — không cần tạo role mới.

**Khuyến nghị:** 23 action của `ACCOUNTANT` (v1) chia theo tính chất:
- Action gắn với 1 cơ sở cụ thể (thu tiền, hóa đơn, công nợ, xem học viên/lớp để đối chiếu) → `CENTER_ACCOUNTANT`, scope **CENTER**.
- Action toàn hệ thống (payroll, đơn hàng/voucher/sản phẩm — theo câu 32 phiếu Kế toán, KT hội sở cần xem đủ cột "nguồn học viên, tên PH, CCCD, địa chỉ" để xác nhận khoản chờ) → `HO_ACCOUNTANT`, scope **GLOBAL**.

Danh sách 23 action cụ thể → xem [`rolepermission-seed-gap.md`](./rolepermission-seed-gap.md), dùng làm checklist khi seed (bước sau, sau khi Kiệt duyệt mapping này).

**Lưu ý nghiệp vụ mới phát sinh (không phải RBAC, ghi lại để không quên):** câu 25 — đánh số phiếu thu **riêng theo từng cơ sở** (không đánh số chung); câu 32 — màn hình chờ xác nhận cần đủ cột `tên bé, lớp, số tiền, người thu, hình thức, ngày, nguồn học viên, tên PH, CCCD PH/bé, địa chỉ` (nhiều hơn field hiện có — cần rà lại UI khoản chờ xác nhận).

---

## 2. `TRAINING` → role `TRAINING` đã có sẵn (GLOBAL) — độ tin cậy CAO

**2 nguồn độc lập:**

- **BGĐ (câu 3):** *"Mức chặt: Phan Thành Toại (Lead Đào tạo) được tải lên + kiểm tra từng file"* — xác nhận có **người thật** giữ vai trò Lead Đào tạo.
- **BGĐ (câu 10):** dòng "Đào tạo" — XEM/SỬA = *"các phần liên quan đến học liệu hệ thống LMS"*.
- **Phòng Đào tạo, phiếu riêng (câu 74a):** *"Quản lý cơ sở quản lý lớp học, quản lý đào tạo chỉ quản lý nội dung đào tạo"* → xác nhận rõ ràng: phạm vi KHÔNG theo cơ sở (nội dung/giáo trình dùng chung Sata 1-8 + Combo, không tách riêng CS1/CS2) → đúng scope **GLOBAL**.
- **Phòng Đào tạo (câu 77 — bảng nhân sự):** *"Chỉ có Phan Thành Toại full quyền... sau đó có thể cấp thêm user có quyền"* → hiện tại **đúng 1 người** giữ role, có kế hoạch mở rộng sau.

→ Không có `RoleDef` v2 nào hiện tại đủ khớp nghĩa "quản lý học liệu LMS toàn hệ thống, không dạy lớp" (`TEACHER`/`ASSISTANT_TEACHER` chỉ có quyền CLASS/ASSIGNED; ép vào `SUPER_ADMIN` là cấp thừa quyền, vi phạm least-privilege).

**Khuyến nghị:** Ban đầu định tạo `RoleDef` mới — sau đó phát hiện `prisma/patch-rbac-staff.ts` đã tạo sẵn RoleDef code **`TRAINING`** (0 permission) và đã gán `UserOrgRole(TRAINING@HO)` cho Phan Thành Toại từ trước. Chỉ cần seed permission (33 action LMS: `curriculum:*`, `questions:*`, `exams:*`, `assignments:*`, `documents:*`, `training:manage`, `teaching-materials:*`) vào role `TRAINING` đã có — KHÔNG tạo role mới, KHÔNG cần gán UserOrgRole (đã có sẵn).

**Còn hở (comment code lỗi thời):** `lib/auth/permissions.ts` dòng 19-21 ghi "ALL 8 ROLES" nhưng thực tế enum có 9 role (thiếu `TRAINING` trong comment, role được thêm ở migration `20260624000000_fl_foundation`). Đề xuất Kiệt xác nhận: chỉ cần sửa comment cho đúng, hay có lý do lịch sử khác cần biết trước.

---

## 3. `SALES_CSM` → `CENTER_SALES_CSM` (OWN/CENTER) — độ tin cậy CAO

**BGĐ (câu 10):** *"Tách riêng cho mỗi sale chỉ thấy riêng data của mình, QL thì thấy chung."* — khớp đúng scope `OWN` đã seed cho `CENTER_SALES_CSM` (`leads:view-own`); phần "QL thấy chung" đã có sẵn qua `CENTER_MANAGER` (CENTER), không cần thêm gì.

**Khuyến nghị:** map toàn bộ 25 action còn thiếu của `SALES_CSM` (v1) vào `CENTER_SALES_CSM` (đã có sẵn) — không tạo role mới.

**Escalate riêng (KHÔNG phải RBAC mapping — tính năng sản phẩm mới):** BGĐ đề xuất thêm *"1 nút chọn dùng chung cho các data khách hàng muốn chia sẻ thì các thành viên CSKH khác trong trung tâm có thể nhìn thấy chung để cùng hỗ trợ."* Đây là 1 cờ chia sẻ theo từng bản ghi (per-record opt-in), không khớp với 6 giá trị `ScopeType` hiện có (GLOBAL/CENTER/CLASS/OWN/CHILDREN/ASSIGNED) — cần thiết kế riêng (có thể thêm field `Lead.isSharedWithTeam` + logic ở tầng `can()`/`scopedDb`, không phải seed RolePermission đơn thuần). Đề xuất tách thành ticket riêng sau khi mapping role này được duyệt.

---

## 4. `HR` — CHƯA ĐỦ DỮ LIỆU, cần hỏi lại trực tiếp

Khác 3 role trên, **không có phiếu riêng cho bộ phận Nhân sự** trong 9 phiếu đã thu — chỉ có 1 dòng ngắn trong phiếu BGĐ (câu 10):

> *"Tuỳ theo cấp độ mỗi TT nào thì làm cho TT đó. Tuy nhiên, có chức năng phân quyền cho mục này. Vì đôi khi việc chấm công tính lương trên hội sở làm tự động."*

Câu trả lời này gợi ý cấu trúc **2 tầng giống ACCOUNTANT** (HO tự động hoá chấm công/lương toàn hệ thống + mỗi cơ sở tự quản hồ sơ nhân viên của mình).

### Cập nhật 06/07/2026 — điều tra thêm (workflow đa hướng: DB thật + rà lại 9 phiếu + phân tích code)

**1. Rà lại 9 phiếu (lần 2) tìm thấy bằng chứng bị bỏ sót ở lần đọc đầu:** phiếu Hành chính (`phieu-hanh-chinh`, câu 62 — bảng nhân sự toàn trung tâm) liệt kê rõ **2 người chức danh "Thực Tập Sinh Nhân sự"**, mỗi cơ sở 1 người:
- Lê Thị Tuyết Mai (`lethituyetmai.tts@satarobo.vn`) — **CS1**
- Trần Thị Thúy Liên (`tranthithuylien.tts@satarobo.vn`) — **CS2**

→ Đây là bằng chứng trực tiếp: **có tồn tại vai trò Nhân sự cấp cơ sở** (dù chỉ cấp thực tập sinh), không phải chỉ ở hội sở như câu 10 phiếu BGĐ có thể gợi ý.

**2. Kiểm tra DB thật (DEV Supabase, read-only):** cả 2 người trên **CHƯA có tài khoản User/Employee** nào trong hệ thống. Toàn DB hiện có **0 user** mang role legacy `HR`, **0 bản ghi** `UserOrgRole(HO_HR)` — rủi ro dưới đây **chưa xảy ra trên dữ liệu thật**, nhưng sẽ xảy ra ngay khi 2 người này được tạo tài khoản theo logic hiện tại.

**3. Phân tích `prisma/patch-rbac-staff.ts` (đã chạy PROD 02/07):** phát hiện bất đối xứng thật trong code — `HR: { roleCode: "HO_HR", org: "HO" }` **hard-code mọi user có legacy role HR → `HO_HR @ HO` (GLOBAL), không đọc `centerId`**. Khác với `ACCOUNTANT` đã có nhánh riêng (`legacy === "ACCOUNTANT" && centerOrg ? "CENTER_ACCOUNTANT" : ...`) để tách theo cơ sở. Nếu seed tài khoản cho 2 thực tập sinh trên theo logic hiện tại, **cả hai sẽ nghiễm nhiên có toàn bộ 23 quyền HR** — bao gồm cả quyền nhạy cảm toàn hệ thống (`payroll:view`, `employees:view-salary`, `employees:view-personal`, `jobs:create/edit/delete`) — dù chỉ là thực tập sinh tại 1 cơ sở.

**Trạng thái: đã gửi addendum riêng cho Kiệt xác nhận** (`phieu-kiet-hr-addendum.docx`) — 3 lựa chọn:
- (A) Tạo `CENTER_HR` (CENTER) + sửa `patch-rbac-staff.ts` thêm nhánh theo `centerId` (giống ACCOUNTANT); gán 2 TTS vào `CENTER_HR` tại đúng cơ sở.
- (B) Giữ nguyên mọi HR = `HO_HR` (GLOBAL) — kể cả TTS tại cơ sở — vì HR là chức năng cross-center theo chủ đích.
- (C) Tách theo độ nhạy cảm: TTS tại cơ sở chỉ xem/chấm công trong phạm vi cơ sở mình (không xem lương/hồ sơ cá nhân toàn hệ thống); quyền nhạy cảm (`payroll:*`, `employees:view-salary/personal`, `jobs:*`) giữ riêng ở `HO_HR`.

**Chưa seed HR** — chờ Kiệt chọn 1 trong 3 phương án trên.

---

## 5. `MARKETING` → `HO_MARKETING` (GLOBAL) — độ tin cậy trung bình

BGĐ (câu 10) chỉ ghi *"Ok"*, không có phiếu riêng bộ phận Marketing để đối chiếu chéo (khác Accounting/Sale/Training đều có phiếu riêng). Khớp hợp lý với mô tả blueprint (`HO_MARKETING` — cross-center theo chức năng, 1 kênh Fanpage HO theo CLAUDE.md).

**Khuyến nghị:** map 35 action còn thiếu vào `HO_MARKETING` (đã có sẵn) — không tạo role mới.

**Escalate riêng:** OI-4 (blueprint) — `HO_MARKETING` xem `leads:*` bao gồm PII (SĐT, tên phụ huynh/học sinh) chưa có cơ chế field-level tách riêng (khác `employees:view-salary/view-personal` đã tách). Cần quyết định: thêm action con `leads:view-all-pii` riêng, hay dùng `UserPermissionGrant` per-user để cấp PII có chọn lọc.

---

## Danh sách role mới cần tạo (nếu Kiệt duyệt các khuyến nghị trên)

| RoleDef code mới | scopeType | Lý do | Trạng thái |
|---|---|---|---|
| ~~`HO_TRAINING`~~ | — | KHÔNG tạo — role `TRAINING` đã có sẵn từ patch-rbac-staff.ts, chỉ cần seed permission | Đã sửa, đã seed permission vào `TRAINING` |
| `CENTER_HR` | CENTER | Chỉ tạo NẾU xác nhận có HR làm việc tại cơ sở (chưa chắc) | Tạm hoãn — chờ trả lời câu hỏi mục 4 |

## Việc cần làm SAU KHI Kiệt duyệt (không nằm trong phạm vi tài liệu này)

1. Seed action-grant chi tiết cho từng role theo bảng đã duyệt (dùng `rolepermission-seed-gap.md` làm checklist 283 dòng) — **KHÔNG để agent tự suy luận scopeType**, seed theo đúng mapping đã duyệt ở đây.
2. ~~Nếu tạo HO_TRAINING: gán UserOrgRole cho Phan Thành Toại~~ — KHÔNG cần, Phan Thành Toại đã có `UserOrgRole(TRAINING@HO)` từ trước (patch-rbac-staff.ts), đã tự động có quyền khi seed permission chạy.
3. Thiết kế riêng: cờ chia sẻ lead theo team (mục 3) + field-level PII cho `leads:*` (mục 5) — 2 việc này KHÔNG phải seed RolePermission đơn thuần, cần ticket riêng.
4. Sửa comment lỗi thời "ALL 8 ROLES" → "9 ROLES" trong `lib/auth/permissions.ts` (việc dọn nhỏ, làm cùng lúc).
