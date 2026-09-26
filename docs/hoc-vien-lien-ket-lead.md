# Học viên ↔ Lead nguồn + hồ sơ học viên mới (25/09/2026)

> Phạm vi tài liệu này: **đường GHI + nối HV cũ** (schema, chốt lead, form hồ sơ, NĐ13,
> script backfill). Màn hình hồ sơ mới và khối "Lead nguồn" (đọc qua cách ly cơ sở + che
> PII) là phần khác của cùng đợt — xem `lib/students/lead-nguon.ts` và
> `app/(admin)/admin/students/[id]/edit/`.

## 1. Quyết định chủ dự án đã ký (không mở lại)

| Mã | Nội dung | Nơi thi công |
|---|---|---|
| **D1** | Liên kết là **cột mới** `Student.leadId` + `Student.leadChildId`. Chốt lead tự nối; script dry-run nối HV cũ; nút "Gắn lead" nối phần còn lại. `Student.leadId` = lead **GỐC** — lượt chốt sau dùng lại HV thì **không đè**. ⛔ Không bao giờ ghi/backfill `Enrollment.leadChildId` (tín hiệu "đã chốt" của báo cáo chuyển đổi — `lib/lead/tuong-tac/ghi.ts:130-134`). | migration, `lib/crm/convert-lead-v2.ts`, `scripts/noi-hoc-vien-voi-lead.ts` |
| **D2** | ⚠️ **[ĐẢO một phần 26/09 — xem §8.1]** các ô chung HV ↔ lead nay ĐỒNG BỘ HAI CHIỀU. Bản gốc: "Tách theo chủ dữ liệu": thuộc tính **con + phụ huynh** sửa trên hồ sơ HV; thuộc tính **phễu** (nguồn, người nhập, khoá quan tâm, ngày nhận lead, tương tác gần nhất, sale, AFF, cơ sở của lead, lớp tại trung tâm của LeadChild) **chỉ đọc** từ lead + link mở lead. Khi HV được nối, ô **TRỐNG** của hồ sơ được điền từ lead bằng **một** hàm dùng chung `dienTuLead` (chỉ điền ô null, không bao giờ ghi đè). | `lib/students/dien-tu-lead.ts` |
| **D3** | Gỡ khỏi form (DỮ LIỆU + CỘT GIỮ NGUYÊN): nhóm máu, Quận/Huyện (địa chỉ còn 2 cấp Tỉnh → Phường/Xã, lưu TÊN), "Đơn vị mong muốn", "Ngày đăng ký lần đầu" (thay bằng "ngày nhập học" suy từ ghi danh sớm nhất), SĐT/Email riêng của HV; gộp "Lịch sử học tập" vào "Lớp & tiến độ". | form (phần giao diện) — đường ghi chỉ cần "khoá vắng ⇒ không đụng" (§3) |
| **D4** | "Ngày tương tác mới nhất" = lần chạm khách do **NGƯỜI** làm: `lastLeadOutreachAt(activities, LEAD_OUTREACH_TYPES)` (`lib/lead/activity-clock.ts`). "Người nhập lead" in `nhanNguoiNhapLead(mã, tên)` = `MÃ_Tên`, **chỉ** cho người có `leads:view-all`. | phần đọc |

## 2. Schema — migration `20260925120000_student_lead_nguon_va_thong_tin_ph`

ADD-ONLY, 5 cột nullable + 2 index + 2 khoá ngoại `ON DELETE SET NULL`, không DEFAULT, không backfill:

- `Student.parentGender Gender?` · `Student.parentDob DATE` · `Student.parentFacebookUrl TEXT`
- `Student.leadId → Lead` · `Student.leadChildId → LeadChild`

`NULL` ở `leadId` nghĩa là **chưa nối**, KHÔNG phải "học viên không đến từ lead".

## 3. Đường ghi đã đổi

### 3.1 Form hồ sơ (`createStudent` / `updateStudent`)

Đọc form tách ra `app/(admin)/admin/students/_lib/doc-form.ts` (file `_actions.ts` là
`'use server'` — không test thuần được). Sửa **hai lỗi đo được**:

1. **Không xoá được ô** — bản cũ biến ô có mặt-nhưng-rỗng thành `undefined` ⇒ Prisma bỏ qua ⇒
   xoá trắng email/trường/ghi chú/giới tính/ảnh rồi Lưu, form báo thành công, DB giữ giá trị cũ.
   Luật mới: **khoá VẮNG ⇒ không đụng · khoá CÓ MẶT với "" ⇒ xoá về null · có chữ ⇒ trim**.
   Ngoại lệ: `studentCode` rỗng ⇒ không đụng (form không xoá mã); `name`/`parentName`/`parentPhone`
   vắng ⇒ `""` (bắt buộc ⇒ lỗi validate như cũ); `status` vắng/rỗng ⇒ không đụng; `allergies`
   có mặt ⇒ mảng (kể cả `[]`), vắng ⇒ không đụng.
2. **`.partial()` vẫn áp `.default()`** (zod 4.4.3) ⇒ lượt sửa không gửi `status`/`allergies` lặng
   lẽ ghi `ACTIVE` + `[]` (mở lại HV bảo lưu/tốt nghiệp, xoá sạch dị ứng). `chiGiuKhoaCoMat` lọc
   kết quả parse về đúng các khoá form gửi.

Nhờ luật (1), form mới **không gửi** khoá cũ (nhóm máu, quận/huyện, đơn vị mong muốn, ngày đăng
ký, SĐT/email HV) là đủ để dữ liệu cũ nằm yên — không cần cờ nào.

Validator (`lib/validators/student.ts`) thêm `parentGender` (enum, rỗng ⇒ null), `parentDob`
(chặn tương lai — cùng luật `Lead.parentDob`), `parentFacebookUrl` (chuẩn hoá bằng
`normalizeFacebookUrl` của lead; chuỗi không thành URL http(s) ⇒ lỗi **"Link Facebook không hợp
lệ"**, không nuốt im). Nhật ký `student.update` nay ghi thêm 3 ô này + `leadId`/`leadChildId`.

### 3.2 Chốt lead (`convertLeadV2`) — đường nối TỰ ĐỘNG

- **HV mới**: `leadId = lead.id`, `leadChildId = con` (chỉ khi con **thuộc chính phiếu này** —
  bulk-convert nhận `leadChildId` từ file), cộng `dienTuLead(hồ sơ trắng, lead, con)`.
- **HV dùng lại (dedupe)**: chỉ nối khi HV **chưa có** `leadId` (`updateMany … where leadId: null`,
  hai lượt đua không đè nhau) và điền ô trống **cùng lượt nối**. HV đã có lead gốc ⇒ không đụng.
- Địa chỉ: cụm Sale gõ ở form chốt (C5) **thắng** cụm trên lead, và vẫn **cả cụm hoặc không**.
- Mọi thứ khác (tiền, ghi danh, `Enrollment.leadChildId`, hoa hồng, consent, audit) giữ nguyên.
- `convert-lead.ts` (v1) **không đổi**: không đường app nào gọi nó (chỉ còn test r2/r6).

### 3.3 NĐ13 (`lib/compliance`)

`buildErasureData` ghi null cho `parentGender`, `parentDob`, `parentFacebookUrl` **và cắt liên kết
lead** (`leadId`, `leadChildId` = null — lead còn giữ tên + SĐT gia đình); bản xuất
`exportStudentData` chọn thêm 3 ô người lớn.

**Chiều ngược — hồ sơ đã ẩn danh KHÔNG bao giờ được nối lại** (`lib/students/da-an-danh.ts`): ẩn danh
giữ bản ghi + ghi danh + đơn + nhật ký chốt lead và đặt NULL các ô PII, mà luật "điền ô trống từ
lead" coi ô NULL là ô chưa điền ⇒ nối lại là GHI LẠI PII vừa xoá. Mọi đường nối hỏi hai dấu (tên
`[Đã xoá …]` + nhật ký `ERASE_PII`): script nối (loại lúc lập kế hoạch và kiểm lại trong transaction
ghi), nút "Gắn lead" (từ chối trước transaction), convert dùng lại HV.

## 4. Runbook nối học viên CŨ — `scripts/noi-hoc-vien-voi-lead.ts`

### Luật quyết định (`lib/students/noi-lead-cu.ts`, thuần, có test `[NLC-*]`)

| Chuỗi | Bằng chứng | Ghi chú |
|---|---|---|
| ① `GHI_DANH` | ghi danh của HV mang `leadChildId` → `LeadChild.leadId` | **Kể cả ghi danh đã xoá mềm.** Sớm nhất thắng; duy nhất chuỗi cho `leadChildId` |
| ② `THANH_TOAN` | khoản thu gắn ghi danh của HV, đơn có `leadId` | chỉ khoản + đơn **chưa xoá** (khoản/đơn xoá thường vì ghi nhầm nhà) |
| ③ `DON_HANG` | `Order.studentId` / `OrderItem.studentId` = HV, đơn có `leadId` | chỉ đơn chưa xoá |
| ④ `NHAT_KY` | AuditLog `entityType "Lead"`, `STATUS_CHANGE`, `newValues.studentIds[]` (v2) hoặc `newValues.studentId` (v1) | |

Có ① ⇒ nối theo ①. Không có ① ⇒ hợp ②③④: đúng **một** lead ⇒ nối (`leadChildId` null); **≥2** ⇒
**MẬP MỜ** — chỉ báo cáo, không bao giờ tự ghi (người rà dùng nút "Gắn lead"). Lead đã xoá mềm bị
loại khỏi mọi chuỗi. Không bằng chứng ⇒ để trống (HV nhập tay/Excel).

Script dùng `scriptDb()` (client trần, **không** có extension xoá mềm) nên mọi lọc `deletedAt`
viết tường minh. Bằng chứng gom theo lô 500 HV/câu (không N+1); ghi theo lô 50 HV/transaction,
đọc lại HV trong transaction trước khi điền; mỗi HV một dòng AuditLog
`students / student.link-lead` (chỉ **tên** ô đã điền, không giá trị — `parentDob`/link FB là PII).

### Các bước (người vận hành chạy — luật cứng #4)

1. **Migrate.** Merge lên `test` ⇒ `migrate-test.yml`; `test → main` ⇒ `deploy.yml` chạy
   `prisma migrate deploy` lên prod.
2. **Dry-run trên prod bằng user CHỈ-ĐỌC** (`satarobo_readonly`, secret `PROD_DATABASE_URL_RO` —
   `docs/cham-cong/USER-CHI-DOC-PROD.md`):
   `pnpm exec tsx scripts/noi-hoc-vien-voi-lead.ts`
   Dòng đầu log tự khai `user=… · chỉ đọc`. Bản in: số SẼ NỐI theo từng chuỗi, danh sách MẬP MỜ
   (id HV + mã HV + các leadId), số ô sẽ điền theo cột, cảnh báo con nối tới >1 HV. Không in tên/SĐT.
3. **Chủ dự án duyệt** bảng, ghi lại con số **SẼ NỐI** = N.
4. **Ghi** bằng chuỗi đầy quyền (`PROD_DIRECT_URL`):
   `pnpm exec tsx scripts/noi-hoc-vien-voi-lead.ts --ghi --expect=N`
   Thiếu `--expect`, hoặc kế hoạch lúc chạy ≠ N ⇒ **không ghi gì**. Kết nối chỉ-đọc mà có `--ghi` ⇒ dừng.
5. **Nghiệm thu**: chạy lại dry-run — "SẼ NỐI" phải về **0** (còn MẬP MỜ + không bằng chứng).
   Chạy lại `--ghi` bao nhiêu lần cũng an toàn (`where leadId: null`).
6. Rà danh sách MẬP MỜ bằng nút "Gắn lead" trên từng hồ sơ.

⚠️ **Chưa có workflow GitHub cho script này.** Các backfill prod trước (`backfill-orderitem-*`)
dùng CẶP workflow + HAI tệp (bản xem trước không có đường ghi, lưới `lib/finance/backfill-chi-doc.test.ts`).
Script này là MỘT tệp có cờ `--ghi` (theo yêu cầu đợt này) — an toàn ở bước 2 nhờ user chỉ-đọc
+ cổng `--expect`, nhưng thiếu lớp khoá "tệp xem trước không chứa lệnh ghi". Dựng cặp workflow là
việc riêng.

## 5. Đã kiểm (25/09/2026)

- Unit (không cần DB, chạy cả với `DATABASE_URL` trỏ cổng chết): `[DFH-01..20]` form × validator,
  `[DTL-01..11]` luật điền, `[GT-01..04]` giới tính, `[NLC-01..06]` quyết định nối,
  `[ND13-HV-01..02]` NĐ13.
- R7 `tests/e2e/r7/convert-v2.spec.ts` (Postgres local): `[CV2-LK-01]` HV mới nối + điền,
  `[CV2-LK-01b]` địa chỉ gõ lúc chốt thắng cả cụm, `[CV2-LK-02]` không đè lead gốc,
  `[CV2-LK-03]` dùng lại HV chưa nối ⇒ nối + chỉ điền ô trống, `[CV2-LK-04]` con của phiếu khác
  không được dùng. Bộ `bulk-convert`, `lead-child`, `payment-backfill`, `assignment-fixes`,
  `fl/convert-installment` vẫn xanh.
- Cấy lại 12 lỗi (khôi phục byte-exact, so đúng tập mã ca đỏ) — mỗi lưới trên đỏ đúng ca của nó.
- Script chạy thật trên DB nháp có fixture 7 HV phủ đủ 4 chuỗi + mập mờ + lead đã xoá + ghi danh
  đã xoá + khoản đã xoá: kế hoạch đúng, cổng `--expect` chặn đúng, ghi xong chạy lại về 0,
  `Enrollment.leadChildId` không đổi.

## 6. Giới hạn đã biết

- Ẩn danh NĐ13 nay cắt `Student.leadId`/`leadChildId`, nhưng `Enrollment.leadChildId` (giữ theo
  nghĩa vụ lưu sổ) vẫn nối HV về `LeadChild`, và bản thân phiếu lead KHÔNG bị ẩn danh. Ẩn danh luôn
  cả lead là quyết định nghiệp vụ, chưa làm.
- Danh sách xoá NĐ13 vốn **thiếu** `ward`/`city`/`district`/`school`/`parentNationalId`/
  `parent2*` từ trước đợt này — đợt này chỉ thêm 3 ô mới.
- Nhật ký `student.update` ghi **giá trị thô** của `parentDob` (giống đường SỬA của trang lead;
  đường TẠO lead thì không ghi). Trang nhật ký tổng chỉ Quản trị tối cao mở được trên prod.
- `Student.leadChildId` không unique: hồ sơ HV trùng có thể cùng trỏ một con — dry-run in cảnh báo.
- Chuỗi ②③ chỉ cho `leadId`, không suy `leadChildId` (kể cả khi đơn có `Order.leadChildId`).
- `.env.test` không có trong worktree này: lượt R7 ở trên truyền `NEXTAUTH_SECRET`/`AUTH_SECRET`
  (giá trị test của CI) qua biến môi trường.

## 7. Rà đối kháng 25/09/2026 — các bản vá (mỗi bản một lưới, đã cấy lại 24/24)

Lượt rà 4 hướng (PII/phạm vi · toàn vẹn ghi · giao diện · hồi quy), mỗi phát hiện 2 người hoài
nghi độc lập tìm cách bác bỏ; 12 phát hiện được cả hai xác nhận + 3 lỗi thấy khi smoke.

| # | Lỗi | Bản vá | Lưới |
|---|---|---|---|
| 1 | Hồ sơ đã ẩn danh NĐ13 bị script/nút "Gắn lead" điền LẠI PII; ẩn danh không cắt liên kết lead | `da-an-danh.ts` + 3 đường nối hỏi dấu; erasure null `leadId`/`leadChildId` | `[ND13-HV-03/04]` `[DAD-01..06]` `[LNS-05]` |
| 2 | SĐT PH bị che (US-03) lộ qua khối Lead nguồn / gợi ý "Cùng SĐT" | `docLeadNguon({ parentPhoneMasked })` BẮT BUỘC; không so SĐT, che SĐT lead; ô tìm cũng vậy | `[LNV-08]` `[LNS-05]` |
| 3 | Hai người cùng bấm Gắn ⇒ lượt sau đè liên kết + đè ô vừa điền | `updateMany` có điều kiện đúng giá trị vừa đọc, 0 dòng ⇒ ném ⇒ rollback | `[LNS-05]` |
| 4 | "Cập nhật" trong hộp Đổi lead xoá đứa trẻ đang nối | ô chọn con bắt đầu ở đứa đang nối | `[RSX-06]` |
| 5 | "Mầm non 5 tuổi" / "10 tuổi" thành Lớp 5 / Lớp 10 | `lopTuChuoi` chỉ nhận khuôn lớp đứng đầu; tuổi / mầm non / khoảng lớp ⇒ null | `[DTL-12]` |
| 6 | URL ảnh tuỳ ý đi vòng qua form tạo/sửa | luật URL dùng chung (`anh-dai-dien-url.ts`) ở `createStudent`; `updateStudent` bỏ khoá `avatarUrl` | `[CGH-05..07]` |
| 7 | Nút Gắn trong hộp thoại màu cam, mất chữ khi rê chuột (portal ngoài `.admin-scope`) | gắn `admin-scope` lên hộp thoại | `[RSX-06]` |
| 8 | Đang gõ dở mà Gắn lead / Bảo lưu ⇒ form dựng lại, mất chữ | `GiuFormKhiDangSua` giữ form + dải báo; form SỬA chỉ gửi ô đã đổi (`gui-o-da-doi.ts`) | `[RSX-01..03]` `[HSK-01]` |
| 9 | Bấm Tạo khi ảnh đang tải ⇒ HV không ảnh, ảnh rơi mất | khoá nút + chặn Enter khi đang tải | `[RSX-04]` |
| 10 | Lỗi mạng khi lưu ảnh ⇒ cả trang rơi vào màn lỗi | bắt tại chỗ, báo trong khung ảnh | `[RSX-05]` |
| 11 | Nút "Ghi danh vào lớp" cho hồ sơ không Đang học ⇒ form ghi danh không chọn được em | chỉ hiện khi `ACTIVE`, còn lại nói rõ phải làm gì | `[RSX-08]` |
| 12 | Lead ở cơ sở khác: bảo đi hỏi người cũng không mở được | câu hướng dẫn tách theo lý do | `[RSX-07]` |
| 13 | Mọi ô chọn nền xám như bị khoá (`<select>` luôn khớp `:read-only`) | nền "chỉ đọc" gắn `data-chi-doc` | `[RSX-09]` |
| 14 | "Buổi 10/12" cạnh thanh rỗng "đã học 0" | tiêu đề + thanh + aria cùng nói buổi EM đã học; vị trí lớp ở dòng phụ | `[RSX-08]` |
| 15 | Khối "Đã thành học viên" trên trang lead phải cuộn mới thấy | lên đầu cột trái | — |
| + | Đổi cơ sở mà "cơ sở ưu tiên" là bản sao ⇒ danh sách/cổng PH hiện cơ sở cũ, không còn ô sửa (D3) | `uuTienTheoCoSoMoi`: chỉ dời khi ưu tiên TRÙNG cơ sở cũ | `[CGH-01..04]` |

Không sửa (ngoài phạm vi, báo lại): `<Toaster>` gắn HAI lần (`app/layout.tsx:58` +
`app/(admin)/admin/layout.tsx:157`) ⇒ mọi toast admin hiện đôi — lỗi có sẵn; trang lead in người
nhập dạng "Tên · MÃ" còn hồ sơ HV in "MÃ_Tên" theo yêu cầu đợt này.

(Ghi chú 26/09: `<Toaster>` hiện đôi đã vá ở PR #397.)

## 8. Đợt 2 — 26/09/2026 (chủ dự án nghiệm thu trên test.satarobo.vn)

Năm yêu cầu: (1) mọi học viên phải thấy lead nguồn; (2) mã học viên chỉ admin sửa; (3) ô quan hệ
là ô chọn + thông tin lead ↔ học viên "đổi 1 nơi thì các nơi khác phải đổi hết"; (4) địa chỉ chỉ
dùng danh mục tỉnh/phường MỚI; (5) thay khối năng lực robotics bằng nhận xét buổi + học bạ.

### 8.1 Đồng bộ hai chiều HV ↔ lead (đảo một phần D2)

Bảng ô chung + luật: `lib/students/dong-bo-lead.ts` (thuần, `[DBL-*]`). Phần ghi:
`lib/students/dong-bo-lead-db.ts` (`[DBD-*]`, tx giả trong bộ nhớ).

| Học viên (`Student`) | Lead / LeadChild | Ghi chú |
|---|---|---|
| parentName · parentPhone · parentEmail · parentFacebookUrl · parentGender · parentDob · city · ward · address | Lead.parentName · phone · email · facebookUrl · parentGender · parentDob · city · ward · addressLine | SĐT: lead lưu `84…`, HV lưu `0…`, so theo dạng chuẩn |
| dateOfBirth · gender · school · currentGrade | LeadChild.dob · gender ("Nam/Nữ/Khác") · schoolName · gradeLevel ("Lớp N") | "Mầm non" không dịch ra số lớp ⇒ không ghi ô đó |
| name | LeadChild.fullName (+ Lead.childName, ParentFeedback) | đường riêng từ 08/08: `sync-name.ts`, nay biết cả `Student.leadChildId` |

Luật: chỉ dội ô ĐÃ ĐỔI trong lượt ghi gốc; chỉ ghi ô bên đích đang KHÁC (không đẻ nhật ký rỗng);
xoá trắng cũng dội (trừ tên + SĐT của Lead — NOT NULL); cùng transaction với lượt ghi gốc; mỗi bản
ghi kéo theo có một dòng AuditLog nêu lý do. Phụ huynh đổi ở một em ⇒ phiếu lead + **anh/chị/em
cùng phiếu** đổi theo. `User.phone` (đăng nhập cổng PH) **không** nằm trong bảng — đổi số đăng
nhập phải qua OTP. `parentRelation` không đồng bộ (lead không có ô này; quan hệ là của từng em).

Đường ghi đã nối (lưới ghim `[DBL-W1..W6]`, `lib/students/dong-bo-lead-wiring.test.ts`):
`updateStudent` (qua `lib/students/ghi-ho-so.ts` — `db.$transaction` KHÔNG scope, để thấy phiếu
và anh chị em ở cơ sở khác) · `updateLeadFields` · `updateLeadChild` · nhập Excel học viên ·
nhập Excel lead · phiếu nhập trùng điền link Facebook (`lib/lead/intake/ingest.ts`). Nhập Excel
"đã đăng ký" có đồng bộ HV riêng từ trước (`planStudentSync`).

⚠️ Giới hạn đã biết: hai đường nhập Excel chạy trong `scopedDb` ⇒ học viên/phiếu ở cơ sở NGOÀI
tầm nhìn người nhập không đổi theo. Màn sửa học viên và màn sửa lead không có giới hạn này.

### 8.2 Mã học viên — chỉ Quản trị tối cao

Quyền `students:change-code` có từ R7-05 C10 nhưng chưa từng được nối. Nay: form chỉ đọc + không
gửi khoá `studentCode` khi thiếu quyền (`coTheDoiMa`, bắt buộc truyền); `createStudent` bỏ mã gửi
lên (tự sinh), `updateStudent` TỪ CHỐI mã khác mã đang lưu — `_lib/ma-hoc-vien.ts` (`[MHV-*]`,
`[HSF-07*]`, `[MHV-W*]`). Không có quyền mới ⇒ **không** cần seed-prod-roles.

### 8.3 Ô "Quan hệ" là ô chọn

`lib/students/quan-he.ts` (`[QH-*]`, `[HSF-08]`): Mẹ · Bố · Ông · Bà · Anh · Chị · Cô · Dì · Chú ·
Bác · Người giám hộ · Khác. Giá trị cũ nhận ra được thì chọn đúng mục; không nhận ra (vd "Ba" —
bố tiếng miền Nam, KHÔNG đoán thành "Bà") thì giữ thành một mục riêng "(đang lưu — chọn lại)".

### 8.4 Địa chỉ — chỉ danh mục MỚI (đảo bản 25/09)

Bỏ option tạm "(dữ liệu cũ)" và dòng "Quận/Huyện (dữ liệu cũ)". Tên cũ dịch tất định sang danh mục
34 tỉnh (`maTinhMoi`: bỏ tiền tố "TP/Thành phố/Tỉnh" + bảng 63 tỉnh cũ → tỉnh nhận sáp nhập) và
phường/xã (`tenPhuongMoi`: bỏ tiền tố "P./Phường/Xã", chỉ khi khớp DUY NHẤT). Không dịch được ⇒ ô
trống + dòng nhắc chọn lại. Form so địa chỉ với giá trị ĐANG LƯU nên lượt lưu kế tiếp ghi đúng thứ
màn hình cho thấy (`[RSX-10]`). Lưới trên dữ liệu thật của gói: `[VNA-TM]` (đủ 63 tỉnh cũ).
Cột `district` giữ nguyên trong DB, không hiện, không ghi.

### 8.5 Nhận xét buổi + học bạ thay "Hồ sơ năng lực robotics"

`_components/ho-so/nhan-xet-va-hoc-ba.tsx`. Đọc bằng đúng hàm của màn gốc (luật 12b):
`getStudentFeedback` (cổng PH dùng) · `ReportCard` theo ghi danh · link `/hoc-ba?studentId=`.
Gác quyền theo màn gốc: nhận xét = `sessions:edit | session-feedback:view-all`; học bạ năng lực =
`report-cards:manage | review`; học bạ tổng hợp = `PAGE_GATES["/hoc-ba"]`. Dữ liệu năng lực cũ
(`StudentSkillAssessment`) giữ nguyên trong DB.

### 8.6 "Chưa nối lead" trên test — dữ liệu seed, không phải lỗi

Đo 26/09 bằng script nối (dry-run trên DB test): **250/250** học viên UAT không có bằng chứng nào —
bộ seed dựng lead và học viên rời nhau. Vá dữ liệu: `prisma/seed-uat/08-noi-lead.ts` dựng phiếu
lead ĐÃ CHỐT cho từng gia đình (anh chị em chung phiếu), mỗi em một `LeadChild`, nối
`Student.leadId/leadChildId`, ghi vết chốt ghi danh, đổi địa chỉ seed cũ sang danh mục mới. Đo
local: 220 phiếu · 250 bé · 247 HV nối · 202 vết chốt; chạy lại ra 0 (idempotent).

Chạy trên test (không đụng bước seed nào khác — `index.ts` luôn đặt lại mật khẩu `uat.*` và giá
khoá học): nút **"Seed dữ liệu TEST"**, ô xác nhận `SEED-TEST`, `noi_hoc_vien_lead = seed-uat`.
Hai lựa chọn còn lại của cùng ô (`chay-thu` / `ghi`) chạy script nối HV cũ trên DB test.

### 8.7 Lên prod có phải gắn tay từng học viên không? — ĐO trước khi trả lời

Nút **"Ngưỡng thanh toán · PROD · ĐỌC"** (chỉ-đọc, chạy từ `test`) lựa chọn
`noi-hoc-vien-lead` chạy script ở chế độ `--truoc-migration`: không đọc cột mới, coi mọi HV là
chưa nối, in số SẼ NỐI theo 4 chuỗi đã chốt + phép đo THÊM chuỗi ⑤ "cùng SĐT phụ huynh + đúng tên
con" (chưa áp dụng — nới luật là quyết định của chủ dự án). Đi với `--ghi` là tự dừng.

## 9. Nhận xét buổi + học bạ "lấy từ giáo viên nhập" (26/09/2026)

Chủ dự án 26/09: "seed thử nhận xét buổi, học bạ … nhận xét phải lấy từ giáo viên nhập, học bạ
cũng tương tự". Đo trước: bộ seed UAT (`03-hoc-vu.ts`, `05-lms.ts`) **chèn thẳng bảng** — 2.129
phiếu chỉ một câu + số sao (hub giáo viên coi là CHƯA nhận xét), người tạo cố định; 224 học bạ
không đi máy trạng thái, 78 bản "đã phát hành" **không có snapshot** nên phụ huynh không thấy.

| Việc | Đường đi | Tệp |
|---|---|---|
| Nhận xét buổi | `saveSessionEvalCore` — đúng hàm hộp thoại "Nhận xét buổi học" gọi; người thao tác = GV đứng lớp (`giaoVienDuocQuyCong`); lọc như màn GV (buổi không huỷ, đã diễn ra, đã điểm danh, em có mặt/đi muộn) | `scripts/seed-thu-nhan-xet-giao-vien.ts` |
| Học bạ | luật tách từ server action sang `lib/lms/report-card-ghi.ts` (`luuHocBaCore` · `chuyenTrangThaiHocBaCore`, giữ nguyên hành vi); GV lưu + nộp, QL cơ sở phát hành; quyền hỏi bằng `decidePermissionWithGrant` như `checkPermission` | `scripts/seed-thu-hoc-ba-giao-vien.ts` |

- `saveSessionEvalCore` có tham số **bắt buộc** `{ guiEmailPhuHuynh }` (luật 7): màn GV `true`, seed
  `false` — hàng đợi email không có trạng thái huỷ, còn env `test` có cron gửi thật mỗi 5 phút.
  Thông báo trong cổng phụ huynh vẫn phát như GV nhập thật.
- Chạy: local thì gọi thẳng (dry-run mặc định, `--ghi` để ghi); test thì nút "Seed dữ liệu TEST"
  ô `nhan_xet_hoc_ba` (chay-thu/ghi). Lượt seed đầy đủ cũng tự chạy hai script sau bộ UAT.
- Giới hạn đúng luật, không phải lỗi: lớp đã hoàn thành (ghi danh COMPLETED ra khỏi danh sách buổi)
  và lớp không có giáo viên (CS2 trong seed) KHÔNG có nhận xét — đường giáo viên không ghi được.
- Lưới: `[RC-CORE-01..03]` + `[SFB-07]` (R7, Postgres thật) · `[RCG-W1..W3]` (dây nối) ·
  `[NLW-03]` (workflow). Cấy lại 6 phép, cả 6 đỏ đúng ca.
- **Tốc độ + chạy lại (đo 26/09):** lượt ghi đầu tiên trên DB test bị cắt ở trần 30 phút. Runner
  GitHub ở Mỹ, DB ở Tokyo ⇒ ~0,8 giây mỗi lượt đi–về; một phiếu qua hàm lõi là ~10 lượt nối đuôi.
  Vá: các em CÙNG một buổi ghi song song (`--song-song=N`, mặc định 5 — buổi vẫn tuần tự theo
  ngày), 4 em một lớp của học bạ song song, in tiến độ theo lớp, trần job 90 phút (job seed đầy đủ
  110). Cả hai script **chạy lại được**: nhận xét bỏ qua phiếu đã ghi qua đường GV; học bạ do chính
  script lập mà bị cắt giữa "lưu" và "nộp/phát hành" thì lượt sau đi tiếp bước còn thiếu (nhận ra
  theo câu tổng kết — học bạ GV thật nhập không bị đụng). Bị cắt thì bấm lại ô `ghi`.
