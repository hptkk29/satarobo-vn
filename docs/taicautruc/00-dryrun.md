# 00 — Dry-run trên giấy: mở một cơ sở mới ở Hà Nội dưới một khối vùng mới

**Ngày đo:** 28/07/2026 · **Phạm vi:** BƯỚC 0c · **Nguồn:** [`00-baseline.md`](00-baseline.md), [`00-scope-gap.md`](00-scope-gap.md)
Ký hiệu `[QS]` / `[SĐ]` xem quy ước ở `00-baseline.md`. **Không thực thi gì** — chỉ truy vết code.

**Kịch bản:** tạo `Vùng Hà Nội` (khối quản lý theo tỉnh/tp) → dưới đó tạo `CS-HN1`, đưa vào vận hành (nhận học viên, xếp lớp, thu học phí, phân quyền nhân sự).

---

## 0. Kết luận trước, chi tiết sau

> `[SĐ]` **Mở cơ sở mới hôm nay = SỬA CODE + CHẠY SCRIPT TAY, không phải "thêm data".**
> Nghịch lý: **phần khó nhất lại không gãy** (cây đa tầng chạy tốt), **phần gãy lại tầm thường** (không có nút bấm nào tạo được node tổ chức).

| Câu hỏi đề bài | Trả lời |
|---|---|
| Bao nhiêu bản ghi phải chèn **tay**? | **1 migration + 2 INSERT `OrgUnit` + 1 UPDATE `Center.code`** (không có UI cho cả 3) |
| Tổng bản ghi để cơ sở "chạy được"? | **≈ 4 + N + M** (N = số nhân sự, M = số dòng `user × role`, M ≥ N) — ví dụ 7 nhân sự → ~18–20 bản ghi |
| Bao nhiêu chỗ code phải sửa? | **≥ 17 file bắt buộc** + 2 file test + **1 màn hình mới** |
| Chỗ nào gãy hoàn toàn? | **4 chỗ** (§4) |
| Có mô hình nhượng quyền không? | **KHÔNG TỒN TẠI** — 0 model, 4 dòng enum vỏ rỗng (§5) |

---

## 1. Phần KHÔNG gãy (ghi trước để không lập kế hoạch thừa)

`[QS]` Tôi vào với giả thiết "cây 4 tầng sẽ vỡ vì code chỉ duyệt 1 tầng". **Sai.**

| Thứ | Bằng chứng | Kết luận |
|---|---|---|
| Cây đi xuống **đa tầng** | `lib/org/org-tree.ts:26-42` — `getDescendants` là **BFS đệ quy** thật, có `Set seen` chống vòng; `:48-61` `getSubtreeCenterIds` gom mọi node `type=CENTER` trong subtree. Test đã phủ node đa cấp (`org-tree.test.ts:123-129`) | **Không giới hạn độ sâu**. Gán `CENTER_MANAGER` tại node vùng → tự thấy cả 5 CS con |
| `visibleCenterIds` đi xuyên nhiều tầng | `lib/auth/actor.ts:146-147` gọi `getSubtreeCenterIds(orgNodes, r.orgUnitId)` | Đây là chỗ **hiếm hoi "thêm data không sửa code" đúng nghĩa** |
| Không cần `RoleDef` mới cho cấp vùng | `ScopeType` không có `REGION` (`schema:318-325`) nhưng scope suy từ **vị trí gán trong cây**, không từ tên role (`actor.ts:141-163`) | 0 role mới |
| Cấu hình vận hành có **fallback** đầy đủ | `lib/attendance/shift-config.ts:27-32` (`DEFAULT_SHIFTS`) · `lib/lead/auto-assign.ts:38-43` (`?? "ROUND_ROBIN"`) · `lib/settings/resolve.ts:13-28` (CenterSetting → SystemSetting → default) · `WorkShiftConfig.centerId` null = mặc định toàn hệ thống (`schema:3899`) | **0 bản ghi cấu hình bắt buộc** |
| Danh mục toàn cục | `RoleDef` (14) / `RolePermission` (301) / `DepartmentDef` (10) / `PaymentMethod` — **không model nào có `centerId`** | **0 dòng seed thêm** |
| Sinh mã nghiệp vụ | `lib/codegen.ts:17-20,43-48` nhận `centerCode` làm tham số rồi sanitize; `lib/finance/payment.ts:40-42` tra `OrgUnit.code` | **Không hardcode mã cơ sở** |
| Định tuyến | `proxy.ts:16-30` theo **site** (5 host), không theo cơ sở; `lib/auth/route-policy.ts` chỉ có chuỗi `"centers"` ở `:98` là tên route | **0 điểm sửa** — đề bài yêu cầu soi 2 file này, kết luận là sạch |

---

## 2. Bản ghi phải chèn TAY (không có UI)

| # | Thao tác | Vì sao phải tay | Bằng chứng |
|---|---|---|---|
| T1 | **1 migration** `ALTER TYPE "OrgUnitType" ADD VALUE 'REGION'` | Enum chỉ có 6 giá trị `ROOT/HO/CENTER/CAMPUS/PARTNER/FRANCHISE` — **không có `REGION`** | `prisma/schema.prisma:286-293` |
| T2 | **INSERT `OrgUnit`** node vùng (`REGION`, parent = ROOT hoặc HO) | **Không có màn hình nào tạo được `OrgUnit`.** `createOrgUnit()` tồn tại, được test kỹ, và **chưa từng được gọi từ sản phẩm** | `lib/org/org-service.ts:77`; call-site duy nhất `tests/e2e/a0/orgunit.spec.ts:99-125`. `find app -ipath "*org*" -name page.tsx` → chỉ `users/[id]/org-roles/page.tsx` |
| T3 | **INSERT `OrgUnit`** node cơ sở (`CENTER`, parent = vùng, `centerId` = Center vừa tạo) | như trên; `OrgUnit.centerId` là `@unique` ánh xạ 1-1 | `schema:304` |
| T4 | **UPDATE `Center.code`** | Form tạo Center **không có trường `code`**: `centerSchema` không khai (`:14-41`), `readForm` không đọc (`:88-110`), `toData` không map (`:112-134`), `center-form.tsx` grep `"code"` = **0 kết quả** | `app/(admin)/admin/centers/_actions.ts` |

> ⚠️ Phản biện đã sửa con số ban đầu: **không phải "3 thao tác"** — phải có migration T1 trước, nếu không thì không có giá trị enum để INSERT. Nếu **mượn** `CAMPUS/PARTNER/FRANCHISE` thay vì thêm `REGION` thì `lib/org/orgunit-rules.ts:60-68` (V7) cấm gắn `centerId` cho type ≠ `CENTER` — node vùng vẫn tạo được nhưng không mang center (và sinh ra rủi ro §4.4).

### Bản ghi tạo được qua UI

| Bản ghi | Số lượng | UI |
|---|---|---|
| `Center` | 1 | `/admin/centers/new` |
| `Room` | ≥1 (`Room.centerId` **bắt buộc**, `schema:663`) | `/admin/rooms/new` (`page.tsx:17` gọi `getSelectableOrgUnits(actor, {types:["CENTER"]})`) |
| `User` | N (số nhân sự) | `/admin/users/new` |
| `UserOrgRole` | M ≥ N (**1 dòng / user × role**) | `/admin/users/[id]/org-roles` (`actions.ts:35-45`) |

**Tổng ≈ 4 + N + M.** ⚠️ Phản biện đã sửa: công thức "5 + 2N" trong bản nháp **sai** — cộng đúng là `1 Center + 1 OrgUnit(CENTER) + 1 OrgUnit(REGION) + 1 Room = 4`, và `UserOrgRole` là **≥N** chứ không cố định N.

`[SĐ]` **Đừng dùng con số này làm cam kết.** "Hoạt động được" là khái niệm nghiệp vụ, không phải khái niệm schema — không đọc được từ code xem một cơ sở có cần sẵn `ClassGroup`/`Course`/kho vật tư/mục tiêu doanh thu trước ngày khai trương hay không. **Cần người vận hành xác nhận.**

---

## 3. Chỗ code phải sửa

### 3.1 Bắt buộc (≥17 file)

| Nhóm | File | Việc |
|---|---|---|
| **Enum, 2 nguồn song song** | `prisma/schema.prisma:286-293` · `lib/org/types.ts:4-11` | Thêm `REGION`. ⚠️ `lib/org/types.ts:13` **tự suy type từ hằng TS**, **không** import từ `@prisma/client` → sửa 1 nơi quên nơi kia = lệch âm thầm |
| | migration mới | `ALTER TYPE` (tiền lệ: `prisma/migrations/20260608010000_add_orgunit/`) |
| **Picker đơn vị** | `lib/org/org-tree.ts:128-134` | `DEFAULT_SELECTABLE_TYPES` — quyết định node vùng có lọt picker cơ sở hay không (xem §4.4). **Sửa ít dòng nhất nhưng chịu tải nghiệp vụ nặng nhất** |
| **Tạo cơ sở** | `app/(admin)/admin/centers/_actions.ts:14-41, 112-134, 136-157` + `_components/center-form.tsx` | Thêm trường `code`; bọc transaction tạo `Center` **+** `OrgUnit` đồng thời |
| **Dữ liệu cơ sở site public** | `lib/locations.ts:6, 26-56` · `components/legacy-laptrinhrobot/_data/locations.ts:5, 19+` | Gỡ union type `"CS1" \| "CS2"` |
| **SEO / JSON-LD** | `lib/seo/jsonld.ts:55, 57, 113, 263-265` | Gỡ `addressRegion: 'Đà Nẵng'`, `addressLocality`, địa chỉ `211 Nguyễn Hữu Thọ` hardcode. ⚠️ Đáng chú ý: `:113` nhận `center` **động từ DB** nhưng vẫn ghi cứng địa phương |
| **Registry cấu hình** | `lib/settings/registry.ts:176-179` | Default `contact.hotlines` liệt kê cứng CS1/CS2 |
| **Seed tổ chức** | `prisma/seed-orgunit.ts:23-27` | `const UNITS` đóng cứng HO/CS1/CS2. **Đây là đường tạo `OrgUnit` duy nhất đang hoạt động** — `patch-rbac-staff.ts:55` gọi `seedOrgUnits` |
| **Script vá RBAC** | `prisma/patch-rbac-staff.ts:97` | Regex `/\.cs([12])@/` suy cơ sở từ đuôi email — `[12]` **không khớp** `cs3+`; nhân sự `.cs3@` rơi vào nhánh skip (`:112`), có log, không crash |
| **Ngữ nghĩa HO** | `lib/auth/actor.ts:92-93` | `isHoRoot` — **không phải sửa 1 dòng**: hệ quả lan tới `:133, :145-146, :150-151, :161` và `lib/db-scope.ts:218` |
| **Messenger** | `lib/crm/messenger-service.ts:27-29` | Chỉ chấp nhận scope `HO`/`CENTER`, ném lỗi với type khác. Chỉ cần sửa nếu muốn **1 Page Facebook cho cả vùng**; mỗi CS 1 Page thì chỉ là data |
| **Giả định 1 khối HO** | `nhan-su/actions.ts:53` · `nhan-su/page.tsx:112` · `nhan-su/[id]/edit/page.tsx:82` | `findFirst({ type: "HO" })`, **không `orderBy`** → có 2 HO thì lấy tuỳ ý. Không gãy khi thêm vùng; chỉ gãy nếu sau này có HO theo miền |

### 3.2 Test phải sửa

`lib/org/org-tree.test.ts:92, 135` (`getSubtreeCenterIds(HO) = []`) · `tests/e2e/a0/orgunit.spec.ts:94-125`.

### 3.3 Màn hình mới

**Quản trị `OrgUnit` CRUD.** `[QS]` Service **đã có đủ** (`lib/org/org-service.ts:77-183` create/update/softDelete + `orgunit-rules.ts` V2/V3/V5/V6/V7), thiếu page + form + actions + gate + audit. Tiền lệ độ phức tạp: `app/(admin)/admin/roles/actions.ts:36-70` (có `reason` bắt buộc khi xoá).

`[QS]` **Bất đối xứng CRUD đáng chú ý:** RBAC role **có** màn quản trị `/admin/roles`, `Center` **có** `/admin/centers`, nhưng `OrgUnit` — thứ quyết định toàn bộ tầm nhìn dữ liệu — **không có**.

### 3.4 Chuỗi copy (không chặn, nhưng phải rà)

`[QS]` Đếm lại, **phản biện đã sửa một con số**:

- `"2 cơ sở"` → **39 dòng** trong `app/`+`components/`+`lib/` ✅ (khớp bản nháp)
- `"Đà Nẵng"` → **~96–100 dòng trên 40 file** (app 34, components 52, lib 14) — ❌ bản nháp ghi 76, **sai**
- `"CS1"`/`"CS2"` trong mã sản phẩm → **13 dòng**, trong đó **5 chỉ là comment** → **hardcode thật chỉ 8 dòng** (`lib/locations.ts:6,29,44` · `components/legacy-laptrinhrobot/_data/locations.ts:5,23,39` · `lib/settings/registry.ts:177,178`). `proxy.ts` đóng góp **0**.
- `prisma/seed*` → 10 dòng · test/tests → **484 dòng**

`[SĐ]` Con số nhỏ ở runtime là **tin tốt**: phần lớn hệ đã data-driven. Nợ nằm ở **test** (484 dòng) và ở **rìa hiển thị**, không ở lõi.

---

## 4. Bốn chỗ GÃY HOÀN TOÀN

### 4.1 Không có nút bấm nào tạo được node tổ chức

`[QS]` `createOrgUnit` (`lib/org/org-service.ts:77`) có **0 call-site trong `app/`**. Mọi đường ghi khác cũng chỉ nằm trong service (`:99, :158, :178`) và seed (`prisma/seed-orgunit.ts:34, 50`). **Mở cơ sở mới bắt buộc chạy SQL/script tay.** Đây là điểm gãy số 1.

### 4.2 BẪY IM LẶNG — tạo Center qua UI đẻ ra "cơ sở ma"

`[QS]` `createCenter` chỉ `sdb.center.create(...)`, **không đụng `orgUnit`**, không `publishEvent` (`centers/_actions.ts:136-157`). Thao tác **chạy thành công, hiện toast xanh**, nhưng:

- Không xuất hiện trong **mọi picker đơn vị** (`getSelectableOrgUnits` đọc bảng `OrgUnit`, `org-service.ts:209-245`)
- **Không actor nào thấy** (`allCenterIds` suy từ node `OrgUnit`, `actor.ts:95-99`)
- Không có phòng/lịch nghỉ (`getTeachingCenterIds`, `org-service.ts:281-287`)
- Bị `lib/enrollment-flow.ts:31-36` xếp vào nhóm **"không nhận học viên"**

Cộng thêm `Center.code = null` (§2 T4) làm **chết âm thầm** việc sinh mã:

- `students/_actions.ts:157-164` — `if (center?.code)` mới gọi `genStudentCode`, **không else, không throw**
- `classes/_actions.ts:316-331` — tương tự, `classCode` giữ nguyên `undefined`
- Cả `studentCode` và `classCode` đều **nullable** (`schema:1123`, `:1267`) → bản ghi **tạo thành công**, không lỗi
- **Tệ hơn:** `class-groups/_actions.ts:89` fallback `center.code ?? "CS"` → **hai cơ sở thiếu code sẽ đâm mã nhau**

`[SĐ]` Người vận hành sẽ **nghĩ mình đã mở xong cơ sở**.

### 4.3 `Center` và `OrgUnit` song song — không bảng nào một mình đủ

`[QS]` Cách ly query đi theo `centerId` = `Center.id` (`db-scope.ts:236, 258`); tầm nhìn actor đi theo cây `OrgUnit` (`actor.ts:141-153`). Ánh xạ 1-1 qua `OrgUnit.centerId @unique` (`schema:304`), có cặp hàm dual-write `orgUnitIdForCenter`/`centerIdForOrgUnit` (`org-service.ts:247-273`).

Số liệu chênh lệch: **77 call-site** đọc/ghi `Center` vs **39** `OrgUnit`; trong code ứng dụng `centerId` áp đảo `orgUnitId` **~4,8 lần** (1.951 vs 410 dòng). **26 model** mang song song cả hai, kèm comment lặp *"PR-A: OrgUnit.id (song song centerId, scopedDb flip ở PR-D)"*.

→ `[SĐ]` Giai đoạn 2-phase **chưa đóng**. Mọi cơ sở mới phải nhất quán ở **CẢ HAI** trục, thủ công.

### 4.4 Nếu làm tắt: mượn `CAMPUS/PARTNER/FRANCHISE` làm "vùng" → HỐ ĐEN DỮ LIỆU

`[QS]` Chuỗi nhân quả đầy đủ:

1. `DEFAULT_SELECTABLE_TYPES` gồm `HO/CENTER/CAMPUS/PARTNER/FRANCHISE` (`org-tree.ts:128-134`), dùng khi `opts.types` trống (`:147`)
2. ≥8 trang tạo dữ liệu gọi `getSelectableOrgUnits(actor)` **không truyền `types`**: `leads/new:23` · `classes/new:30` · `nhan-su/new:39` · `holidays/new:17` · `classes/[id]/edit:73` · `leads/[id]/edit:66` · `students/new:22` · `users/new:69`
3. Người dùng chọn "Vùng Hà Nội" → `centerIdForOrgUnit` trả **null** (node non-CENTER, `org-tree.ts:166`)
4. `Lead`/`Class` tạo với `centerId = null`
5. `Lead` ∈ `SCOPED_MODELS` và **∉** `NULL_IS_GLOBAL_MODELS` → `injectScope` thêm `centerId IN (...)` (`db-scope.ts:236`) và `passesScope` chặn record `centerId` null (`:254-256`)
6. → Bản ghi **biến mất** với mọi actor cấp cơ sở. **Không lỗi, không log.**

`[QS]` ⚠️ Phản biện lưu ý: rủi ro này **đã tồn tại sẵn với `HO`** (cũng nằm trong `DEFAULT_SELECTABLE_TYPES`), không phải mới sinh ra do `REGION`.

`[SĐ]` **Tốn 1 dòng enum để tránh.**

---

## 5. Cơ sở NHƯỢNG QUYỀN — trả lời dứt khoát

`[QS]` **KHÔNG TỒN TẠI.**

- `grep '^model .*(Contract|Franchise|Partner|Company|LegalEntity|Tenant)' prisma/schema.prisma` → **0 kết quả**
- `PARTNER` và `FRANCHISE` là **vỏ rỗng**: tổng cộng **4 dòng khai báo** (`lib/org/types.ts:9-10` + `lib/org/org-tree.ts:132-133`) + 2 dòng enum, và **0 dòng logic nghiệp vụ**. Không nhánh `if`/`switch` nào theo 2 giá trị này
- `grep 'royalty|franchiseFee|revenueShare'` trên `prisma lib app` → **0**
- ⚠️ **Đừng nhầm:** `ContractType` trong schema là **hợp đồng lao động** (`FULLTIME/PARTTIME/INTERN/FREELANCE/THU_VIEC/CHINH_THUC_*`, `schema:1915-1924`), dùng ở `Employee.contractType` (`:1955`)
- `Center` **không có** MST / tài khoản ngân hàng / tiền tệ / múi giờ (`schema:235-280`). MST duy nhất là hằng số code (`lib/locations.ts:63`)

`[SĐ]` **Đây không phải bài toán "thiếu cấu hình" mà là bài toán THIẾU MÔ HÌNH.** Nếu một công ty tỉnh khác nhận nhượng quyền hôm nay, hệ thống chỉ có thể đối xử với họ **y hệt một cơ sở nội bộ** — dữ liệu tài chính và nhân sự của họ nằm **chung một không gian** với Sata Robo, cách nhau bằng đúng một bộ lọc `centerId`. Cộng với §10 của `00-scope-gap.md` (nội dung + tiền **không hề** có khái niệm cơ sở), đây là **ranh giới pháp nhân chưa tồn tại**.

---

## 6. Ước lượng công sức

⚠️ `[SĐ]` **Toàn bộ mục này là phán đoán.** Agent phản biện đã phán `KHÔNG_KIỂM_CHỨNG_ĐƯỢC` cho mọi định mức giờ công — dữ kiện `file:dòng` đúng, nhưng quy đổi ra thời gian không có bằng chứng trong repo. Dùng để xếp thứ tự, **không** dùng để cam kết.

| Mức | Hạng mục | Vì sao |
|---|---|---|
| **L** | Dựng màn quản trị `OrgUnit` CRUD | Service có sẵn nhưng thiếu page/form/actions/gate/audit |
| **L** | Đưa dữ liệu cơ sở của site public từ hằng số về DB | Union type + **34 file** import `@/lib/locations` + `lib/seo/jsonld.ts` → phải regression cả Lighthouse lẫn schema.org trên trang **đang chạy tiền quảng cáo** |
| **M** | Thêm enum `REGION` + migration + hằng TS | 2 nguồn khai báo song song |
| **M** | Vá `createCenter` tạo `OrgUnit` đồng thời + thêm trường `code` | Phải bọc transaction + xử lý rollback khi trùng code |
| **M** | Sửa/thêm test cây khi đổi hình dạng tổ chức | + rà `orgunit-rules.ts:60-68` (V7) nếu định nghĩa lại vai trò node vùng |
| **S** | `DEFAULT_SELECTABLE_TYPES` · `seed-orgunit UNITS` · regex email `patch-rbac-staff` · default `contact.hotlines` · `scopeType` messenger · 3 chỗ `findFirst type=HO` | Sửa 1–5 dòng mỗi chỗ |
| **⚠️ không phải S** | "Rà `isHoRoot`" | Hệ quả lan ra `actor.ts:133, 145-146, 150-151, 161` + `db-scope.ts:218`. **Điểm rủi ro lớn nhất của cả nhóm** |

---

## 7. MÂU THUẪN cần bạn quyết trước khi sang BƯỚC 1

`[QS]` Cơ cấu tổ chức đích trong đề bài — **Tập đoàn → Khối HO → Khối vùng → cơ sở** — đặt HO làm **CHA** của vùng. Nhưng repo có một bất biến ngược lại (Doc 15 OI-1): **HO là node độc lập, ngang hàng CS1/CS2 dưới ROOT, không có con** (`lib/org/org-tree.ts:2-4`, `prisma/seed-orgunit.ts:23-27, 52-54`).

⚠️ **Phản biện đã sửa mức độ nghiêm trọng của mâu thuẫn này:**

- ❌ Nói "test khoá bất biến" là **nói quá**. `lib/org/org-tree.test.ts:92-94, 135-137` chạy trên fixture `baseTree()` **hardcode trong chính file test** — chúng khẳng định hành vi hàm thuần trên fixture đó, **không chặn dữ liệu prod** tạo node con dưới HO.
- ❌ Không rule nào cấm: `lib/org/orgunit-rules.ts` (V2/V3/V5/V6/V7) chỉ kiểm code, ROOT duy nhất, cycle, `centerId`-chỉ-`CENTER`. `createOrgUnit` (`org-service.ts:77-110`) **chấp nhận `parentId = HO`**.
- ✅ **Mâu thuẫn THẬT nằm ở tầng ngữ nghĩa quyền, không ở cấu trúc:** mọi role gắn tại `HO`/`ROOT` được `isHoLevel` → **thấy TOÀN BỘ center** (`actor.ts:92-93, 133, 145-146`), bỏ qua cây hoàn toàn. **Đặt khối vùng dưới HO KHÔNG tự giới hạn phạm vi** — nó không làm gì cả, vì HO vốn đã thấy tất cả.

**Ba lựa chọn, cần bạn chốt:**

| Phương án | Chi phí | Hệ quả |
|---|---|---|
| **A.** Vùng **ngang hàng** HO (cùng dưới ROOT) | Chạy được ngay, không đụng test, không đụng `isHoLevel` | Khác sơ đồ đề bài đưa ra. HO quản vùng **bằng phân quyền**, đúng tinh thần *"HO giữ quyền quản lý thông qua phân quyền"* của đề bài |
| **B.** Vùng **dưới** HO, giữ nguyên `isHoLevel` | Sửa 2 test fixture | Sơ đồ đúng đề bài **nhưng vô nghĩa về quyền** — HO vẫn thấy tất cả bất kể cây |
| **C.** Vùng dưới HO + **định nghĩa lại `isHoLevel`** | Đụng `actor.ts` (5 điểm) + `db-scope.ts:218` + **toàn bộ vùng shadow-compare** | Đúng nhất về mô hình, **rủi ro cao nhất**, phải chờ cửa sổ shadow đóng |

`[SĐ]` Đề bài viết *"HO giữ quyền quản lý nó **thông qua phân quyền**, KHÔNG bằng cách cho CS1/CS2 treo thẳng dưới HO"* và *"cây phải đồng dạng ở mọi nhánh"* — hai câu này **nghiêng về phương án A**. Nhưng sơ đồ vẽ HO là cha của vùng. **Tôi không tự hoà giải; cần bạn xác nhận.**
