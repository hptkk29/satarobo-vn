# Đề xuất mapping Role v1 → RoleDef v2 — ĐÃ DUYỆT (Kiệt, 06/07/2026)

> **Trạng thái: Kiệt đã ký duyệt** `phieu-kiet-duyet-rbac-mapping (1).docx` ngày 06/07/2026 — tick "Đồng ý" cho cả 5 mục (ACCOUNTANT, TRAINING, SALES_CSM, MARKETING, HR).
>
> **Đã seed vào `prisma/seed-roles.ts` + chạy trên DB test local** (4/5 role): ACCOUNTANT (23 action → HO_ACCOUNTANT GLOBAL toàn bộ + subset 7 action → CENTER_ACCOUNTANT theo nghiệp vụ "thu tiền/hóa đơn/công nợ"), TRAINING (33 action → role mới `HO_TRAINING` GLOBAL), SALES_CSM (25 action → CENTER_SALES_CSM, OWN cho phần lead cá nhân/CENTER cho phần vận hành), MARKETING (35 action → HO_MARKETING GLOBAL). Verify: `pnpm typecheck && lint` PASS, 90 action tham chiếu đối chiếu registry khớp 100%, `vitest run lib/auth` 115/115 PASS, seed chạy thật trên Postgres test local ra đúng số lượng permission mong đợi (23/33/25/35).
>
> ⚠️ **HR CHƯA SEED** — dù Kiệt tick "Đồng ý", mục này chỉ có phân tích "chưa đủ dữ liệu" (không phải khuyến nghị cụ thể) và câu hỏi mở (có nhân sự HR làm tại CS1/CS2 không?) **chưa được trả lời** trong file trả về. Để tránh suy đoán trên câu hỏi thật sự chưa có câu trả lời, HR bị loại khỏi đợt seed này — cần hỏi lại Kiệt/BGĐ câu hỏi cụ thể đó trước khi seed.
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
| `TRAINING` | Tạo role mới **`HO_TRAINING`** | GLOBAL | **Cao** (2 nguồn độc lập xác nhận) | ☐ Đồng ý &nbsp;☐ Cần sửa: __________ |
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

## 2. `TRAINING` → tạo mới `HO_TRAINING` (GLOBAL) — độ tin cậy CAO

**2 nguồn độc lập:**

- **BGĐ (câu 3):** *"Mức chặt: Phan Thành Toại (Lead Đào tạo) được tải lên + kiểm tra từng file"* — xác nhận có **người thật** giữ vai trò Lead Đào tạo.
- **BGĐ (câu 10):** dòng "Đào tạo" — XEM/SỬA = *"các phần liên quan đến học liệu hệ thống LMS"*.
- **Phòng Đào tạo, phiếu riêng (câu 74a):** *"Quản lý cơ sở quản lý lớp học, quản lý đào tạo chỉ quản lý nội dung đào tạo"* → xác nhận rõ ràng: phạm vi KHÔNG theo cơ sở (nội dung/giáo trình dùng chung Sata 1-8 + Combo, không tách riêng CS1/CS2) → đúng scope **GLOBAL**.
- **Phòng Đào tạo (câu 77 — bảng nhân sự):** *"Chỉ có Phan Thành Toại full quyền... sau đó có thể cấp thêm user có quyền"* → hiện tại **đúng 1 người** giữ role, có kế hoạch mở rộng sau.

→ Không có `RoleDef` v2 nào hiện tại đủ khớp nghĩa "quản lý học liệu LMS toàn hệ thống, không dạy lớp" (`TEACHER`/`ASSISTANT_TEACHER` chỉ có quyền CLASS/ASSIGNED; ép vào `SUPER_ADMIN` là cấp thừa quyền, vi phạm least-privilege).

**Khuyến nghị:** Tạo `RoleDef` mới, code **`HO_TRAINING`** (đúng convention `HO_*` đã dùng cho role cross-center-theo-chức-năng), scope **GLOBAL**, gán cho 33 action LMS (`curriculum:*`, `questions:*`, `exams:*`, `assignments:*`, `documents:*`, `training:manage`, `teaching-materials:*` — danh sách đầy đủ trong `rolepermission-seed-gap.md`). Gán role này cho Phan Thành Toại trước tiên.

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

Câu trả lời này gợi ý cấu trúc **2 tầng giống ACCOUNTANT** (HO tự động hoá chấm công/lương toàn hệ thống + mỗi cơ sở tự quản hồ sơ nhân viên của mình) — nhưng:
1. Không rõ hiện có nhân sự HR làm việc *tại* CS1/CS2 hay toàn bộ HR đều ở hội sở (câu 9 chỉ nói "không ai làm việc 2 cơ sở cùng lúc", không xác nhận có HR ở từng cơ sở).
2. Cụm *"có chức năng phân quyền cho mục này"* không rõ nghĩa — không chắc TGĐ đang mô tả tính năng đã có hay đang đề xuất tính năng mới.

**Đề xuất tạm** (chỉ để tham khảo, KHÔNG phải khuyến nghị chính thức do thiếu dữ liệu): nếu xác nhận có HR tại cơ sở → tạo `CENTER_HR` (CENTER) bổ sung bên cạnh `HO_HR` (đã có, GLOBAL) — cùng pattern với ACCOUNTANT. Nếu xác nhận toàn bộ HR chỉ ở hội sở → map thẳng 23 action vào `HO_HR` sẵn có, không cần role mới.

**Câu hỏi cần Kiệt/BGĐ trả lời trước khi seed role này:** Hiện có nhân sự nào giữ vai trò HR làm việc tại CS1 hoặc CS2 (không phải hội sở) không?

---

## 5. `MARKETING` → `HO_MARKETING` (GLOBAL) — độ tin cậy trung bình

BGĐ (câu 10) chỉ ghi *"Ok"*, không có phiếu riêng bộ phận Marketing để đối chiếu chéo (khác Accounting/Sale/Training đều có phiếu riêng). Khớp hợp lý với mô tả blueprint (`HO_MARKETING` — cross-center theo chức năng, 1 kênh Fanpage HO theo CLAUDE.md).

**Khuyến nghị:** map 35 action còn thiếu vào `HO_MARKETING` (đã có sẵn) — không tạo role mới.

**Escalate riêng:** OI-4 (blueprint) — `HO_MARKETING` xem `leads:*` bao gồm PII (SĐT, tên phụ huynh/học sinh) chưa có cơ chế field-level tách riêng (khác `employees:view-salary/view-personal` đã tách). Cần quyết định: thêm action con `leads:view-all-pii` riêng, hay dùng `UserPermissionGrant` per-user để cấp PII có chọn lọc.

---

## Danh sách role mới cần tạo (nếu Kiệt duyệt các khuyến nghị trên)

| RoleDef code mới | scopeType | Lý do | Trạng thái |
|---|---|---|---|
| `HO_TRAINING` | GLOBAL | Không có role v2 nào khớp nghĩa "quản lý học liệu LMS toàn hệ thống" | Khuyến nghị tạo — độ tin cậy cao |
| `CENTER_HR` | CENTER | Chỉ tạo NẾU xác nhận có HR làm việc tại cơ sở (chưa chắc) | Tạm hoãn — chờ trả lời câu hỏi mục 4 |

## Việc cần làm SAU KHI Kiệt duyệt (không nằm trong phạm vi tài liệu này)

1. Seed action-grant chi tiết cho từng role theo bảng đã duyệt (dùng `rolepermission-seed-gap.md` làm checklist 283 dòng) — **KHÔNG để agent tự suy luận scopeType**, seed theo đúng mapping đã duyệt ở đây.
2. Nếu tạo `HO_TRAINING`: gán `UserOrgRole` cho Phan Thành Toại tại OrgUnit ROOT/HO.
3. Thiết kế riêng: cờ chia sẻ lead theo team (mục 3) + field-level PII cho `leads:*` (mục 5) — 2 việc này KHÔNG phải seed RolePermission đơn thuần, cần ticket riêng.
4. Sửa comment lỗi thời "ALL 8 ROLES" → "9 ROLES" trong `lib/auth/permissions.ts` (việc dọn nhỏ, làm cùng lúc).
