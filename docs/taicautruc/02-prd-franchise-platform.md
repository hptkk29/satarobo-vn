# 02 — PRD: Nền tảng tổ chức · phân quyền · nhượng quyền

**Ngày:** 28/07/2026 · **Phạm vi:** D2 · D3 · D4 · D6 · D8 · D9 · D10 (theo **QĐ-D**)
**Nền:** [`00-baseline.md`](00-baseline.md) · [`00-scope-gap.md`](00-scope-gap.md) · [`00-dryrun.md`](00-dryrun.md) · [`01-intended-vs-implemented.md`](01-intended-vs-implemented.md) · [`QUYET-DINH.md`](QUYET-DINH.md)
**Ngoài phạm vi:** D12 (hoãn engine hoá) · Q1 (nhóm người dùng) · Q2 (cây báo cáo theo quản lý trực tiếp) · D11 (không hợp nhất kế toán)

> **Thuật ngữ khoá — dùng thống nhất toàn tài liệu.**
> **FRANCHISOR** = bên nhượng quyền = khối HO. **FRANCHISEE** = bên nhận nhượng quyền = cơ sở/công ty ở tỉnh khác.
> Trường tham chiếu: `franchisorOrgId` / `franchiseeOrgId`. **Tuyệt đối không** dùng `franchise` trần hay `franchiseId`.
> Nhầm chiều là loại lỗi **không test nào bắt được** — vì vậy có một yêu cầu riêng (R-D9-02) chặn nhầm chiều ở tầng dữ liệu.

---

## 1. Tóm tắt

Tài liệu này đặc tả việc đưa hệ thống Sata Robo về trạng thái **mở được cơ sở mới — kể cả cơ sở nhượng quyền ở tỉnh khác — mà không phải sửa code**. Hôm nay mở một cơ sở là việc của lập trình viên, không phải việc của vận hành: không có màn hình nào tạo được đơn vị tổ chức, màn tạo cơ sở đẻ ra "cơ sở ma", và danh sách cơ sở bị đóng cứng ở tầng kiểu dữ liệu nên thêm cơ sở thứ ba là **lỗi biên dịch**.

PRD gồm **112 yêu cầu**, mỗi yêu cầu có một câu "xong nghĩa là gì" biến được thành test. Chia hai làn: **làn A chạy được ngay**, **làn B chờ cửa sổ shadow-compare RBAC đóng.**

---

## 2. Liên hệ

| Vai trò | Trách nhiệm trong PRD này |
|---|---|
| **Hồ Đắc Phúc** — CEO | Duyệt cuối; quyết 15 câu ở §9 |
| **Ban giám đốc** | Đã chốt QĐ-A/A.1/B/C/D ngày 28/07/2026 — không mở lại |
| **Đội Đào tạo HO** | Chủ sở hữu nghiệp vụ D8; định nghĩa "cửa sổ mở khoá" và danh sách vai trò giảng dạy |
| **Kế toán tổng hợp HO** | Chủ sở hữu nghiệp vụ D10; **ký xác nhận đối soát** trước khi bật mô hình mới (R-OPS-03) |
| **Quản lý cơ sở** | Bị siết quyền nhiều nhất (D8: chỉ thấy danh sách chương trình) |
| **Đội kỹ thuật (4–5 dev)** | Thực thi; đang chạy song song 3 chương trình khác + cửa sổ shadow + đợt security hardening |
| **Người phụ trách dữ liệu theo đơn vị** | Vai trò **mới** do PRD này đề xuất (R-DP-02) — hiện chưa tồn tại |

*Không ghi tên cá nhân ngoài CEO. Người cụ thể do Ban giám đốc chỉ định khi phê duyệt.*

---

## 3. Bối cảnh

### 3.1 Ba điều vừa đổi

**(a) Mục tiêu kinh doanh đổi.** Từ trước tới nay hệ thống phục vụ **một pháp nhân, ba đơn vị trong cùng thành phố**. Nhượng quyền đưa vào ba thứ hệ thống **chưa từng có khái niệm**: cơ sở thuộc **pháp nhân khác** (MST, tài khoản ngân hàng, sổ sách riêng); một **hợp đồng có ngày hết hạn** làm nguồn phát sinh quyền; và ranh giới **"HO được nhìn tới đâu"** trong sổ sách của bên nhận.

**(b) Đợt đo hiện trạng cho thấy hệ thống KHÔNG mở được cơ sở mà không sửa code.** Đây là kết luận đo được, đã qua phản biện. Ba chặn cứng:

1. `createOrgUnit` tồn tại (`lib/org/org-service.ts:77`) nhưng **0 call-site trong `app/`**.
2. `createCenter` (`app/(admin)/admin/centers/_actions.ts:136-157`) chỉ chạy `sdb.center.create(...)`, **không tạo OrgUnit kèm** → cơ sở mới không hiện trong picker, không actor nào thấy, bị `enrollment-flow.ts:31-36` xếp là "không nhận học viên". Form không có trường `code` → `Center.code = null` → sinh mã học viên/lớp **chết âm thầm**; `class-groups/_actions.ts:89` rơi về `"CS"` → **hai cơ sở đâm mã nhau**.
3. `lib/locations.ts:6` khai `code: "CS1" | "CS2"` — **union type**, 32 file import. Thêm CS3 **không phải thêm dữ liệu, là lỗi biên dịch**.

Bốn điểm nền cùng hướng: `OrgUnitType` không có `REGION`; `PARTNER`/`FRANCHISE` là **vỏ rỗng** (4 dòng khai báo, 0 dòng logic); không có `relationshipType`, không có cờ hạch toán, `Center` không có MST/ngân hàng/tiền tệ/múi giờ — **MST duy nhất là hằng số trong code**; `derivedFrom` **0 hit toàn repo**; **không tồn tại** model `Franchise*`/`Contract*`(nhượng quyền)/`Partner*`/`LegalEntity*`/`Tenant*` nào.

**(c) Hai cửa sổ đang chạy song song ràng buộc thứ tự làm việc.** Cửa sổ **shadow-compare RBAC** đang so v1 (có DENY) với v2 (vứt DENY) trong bóng tối; mọi thay đổi ma trận quyền lúc này làm nhiễu dữ liệu. Đợt **security hardening** đang sờ đúng vùng file của công việc cách ly dữ liệu.

### 3.2 Vì sao là LÚC NÀY — đây không phải xây từ đầu

Bốn trụ nền **đã chạy trên production**:

- **`UserOrgRole` đúng hình dạng rồi** — khoá `@@id([userId, orgUnitId, roleId])`, UI cho chọn đơn vị tự do, `buildActor` **không** đọc `User.centerId`. Trục "vai trò × tập đơn vị tự chọn" của D3 **đã đúng nguyên tắc**, chỉ thiếu đường ghi và thiếu `derivedFrom`.
- **Duyệt cây đúng thuật toán** — `getDescendants` là BFS đệ quy thật → cây nhiều tầng **không gãy**.
- **`org-service.ts` đã export sẵn** `createOrgUnit`/`updateOrgUnit`/`softDeleteOrgUnit`/`getAncestors`/`getSubtreeCenterIds` + bộ rule V2/V3/V5/V6/V7 → màn quản trị OrgUnit là **lớp mỏng trên service có sẵn**.
- **Mắt `Class → Curriculum` đã có** — `Class.courseId` bắt buộc, `Class.curriculumId` pin lúc tạo lớp, `Curriculum.courseId`. Chuỗi suy diễn của D10 chỉ đứt ở **đúng một trường**.

---

## 4. Mục tiêu

**Mục tiêu:** biến việc mở một đơn vị mới — nội bộ hay nhượng quyền — từ **việc của lập trình viên** thành **việc của vận hành**, đồng thời dựng được ranh giới dữ liệu giữa hai pháp nhân dùng chung một cơ sở dữ liệu.

**Vì sao quan trọng:** mỗi cơ sở mở ra hiện tốn một đợt sửa code + chạy script tay, và mỗi lần như vậy là một lần có thể sinh cơ sở ma hoặc đâm mã chứng từ. Với nhượng quyền, rủi ro nâng lên mức pháp lý: dữ liệu tài chính và dữ liệu cá nhân trẻ em của hai pháp nhân đang nằm chung một không gian, **cách nhau đúng một bộ lọc `centerId`**.

### Key Results

Mỗi KR đo được bằng một phép đếm trên repo hoặc một truy vấn read-only. Không đặt KR không đo được.

| # | Chỉ số | Hiện tại | Đích | Cách đo |
|---|---|---|---|---|
| KR1 | Thao tác **tay** (SQL/script) để mở 1 cơ sở | **≥ 4** (1 migration + 2 INSERT OrgUnit + 1 UPDATE code) | **0** | Chạy kịch bản R-D2-24 trên môi trường test |
| KR2 | File mã nguồn **phải sửa** để mở 1 cơ sở | **≥ 17** | **0** | Diff repo trước/sau kịch bản R-D2-24 |
| KR3 | Điều kiện của D8 được kiểm **trên đường chính** | **1/4** | **4/4** | Bộ test ma trận R-D8-14 (1 ca đủ → 200; 4 ca thiếu 1 → 403) |
| KR4 | Model nghiệp vụ nằm **ngoài** vùng cách ly | 34/173 được phủ; **15 model nội dung + tiền** không có trường phạm vi nào | Nội dung có `ownerOrgUnitId`; `Payment`/`Receipt` có `orgUnitId` | Parse `schema.prisma` |
| KR5 | File `lib/` dùng `db` trần **đọc** `SCOPED_MODELS` | **94** | Giảm đơn điệu qua từng đợt, **không được tăng** | Script đếm (đã có, `00-scope-gap.md` §5.1) |
| KR6 | Điểm gác quyền bằng **role thô** | **115–125** | Giảm đơn điệu; nhóm **tiền + dữ liệu học viên** về **0** | `grep hasRole\|allowedRoles` |
| KR7 | Đường thoát scope "thấy toàn bộ cơ sở" | **4** | **2** (chỉ `isSuperAdmin` + `scopeType=GLOBAL` khai báo tường minh) | `grep isHoLevel ? "ALL"` = 0 |
| KR8 | Vai trò cấp cơ sở được **test cách ly** trong CI | **4/9** | **9/9** | Đếm `roleCode` trong spec cách ly |
| KR9 | `Curriculum` không có chủ sở hữu | **100%** | **0%** | `SELECT count(*) WHERE ownerOrgUnitId IS NULL` |
| KR10 | `Payment`/`Receipt` không suy được đơn vị | chưa đo được | **0** bản ghi tạo mới sau triển khai | Truy vấn đối soát R-D10-08 |

---

## 5. Phân khúc

Phân khúc định nghĩa bằng **công việc/vấn đề**, không phải nhân khẩu học.

| Nhóm | Việc họ cần làm xong | Ràng buộc đang chặn họ |
|---|---|---|
| **Ban giám đốc tập đoàn** | Quyết mở cơ sở/vùng mới và thấy hệ thống chạy theo trong ngày | Mỗi lần mở là một đợt phát hành code |
| **Đội Đào tạo HO** | Xuất bản chương trình xuống toàn mạng lưới, giữ chương trình là tài sản của HO | Không có khái niệm **sở hữu nội dung**; ai được cấp `TRAINING` ở **bất kỳ** node nào cũng sửa được chương trình của HO (`permissions.ts:466-468`) |
| **Kế toán tổng hợp HO** | Đối chiếu căn cứ tính phí thương hiệu | Không có ranh giới "trong/ngoài phạm vi"; `isHoLevel` cho **thấy tất cả** hoặc không gì cả |
| **Marketing HO** | Dùng ảnh/nội dung toàn mạng lưới | `StudentConsent` **không ghi đồng ý cho ai** (`schema:640-651`) — rủi ro pháp lý trực tiếp với dữ liệu trẻ em |
| **Quản lý khối vùng** | Quản nhiều cơ sở trong tỉnh bằng một vai trò | **Chưa có tầng vùng** — `OrgUnitType` không có `REGION` |
| **Quản lý cơ sở** | Vận hành lớp/học viên/thu chi cơ sở mình | Thấy được thứ không nên thấy: nội dung giáo án qua `/admin/documents`, và tự gán mình làm GV để mở SCORM |
| **Sale cơ sở** | Chăm lead của mình | Mô hình "theo chủ sở hữu bản ghi" **0 dòng seed dùng `OWN`**; lọc chủ sở hữu viết tay từng trang |
| **Kế toán cơ sở** | Thu tiền, in phiếu | Phiếu thu **không có MST, không có tên pháp nhân, không có người ký** (`lib/pdf/receipt.tsx:31-32`) |
| **Giáo viên** (biên chế HO, tác nghiệp tại cơ sở) | Được điều tới cơ sở dạy lớp | **BỊ CHẶN CỨNG**: `lib/teachers/center-filter.ts:32-43` bắt buộc `User.centerId === class.centerId`; comment tự khai giả định *"TBD-1: không kiêm nhiệm"* |
| **Chủ FRANCHISEE** | Vận hành cơ sở như doanh nghiệp riêng | Hệ thống **không có cách nào** đối xử với họ khác một cơ sở nội bộ. Dữ liệu tài chính + nhân sự nằm chung không gian với Sata Robo |
| **Nhân sự của FRANCHISEE** | Làm việc trong phạm vi cơ sở mình | Nhãn `FRANCHISE` trong cây **không sinh phạm vi** — chỉ node `type=CENTER` mới có `centerId` |
| **Phụ huynh** | Theo dõi con, gửi yêu cầu tới đúng bên | Trang chính sách chỉ nêu **một pháp nhân**; quyền chủ thể dữ liệu khoá ở đúng `SUPER_ADMIN` của HO |

---

## 6. Giá trị mang lại

**FRANCHISOR (HO) được gì:** mở cơ sở/vùng bằng thao tác vận hành, không chờ phát hành code · giữ chương trình dạy là **tài sản có chủ**, bên nhận không sửa được · có **căn cứ tính phí** dựa trên số liệu vận hành trong phạm vi, không phải số tự khai · cắt hợp đồng là **một thao tác**, không phải đi gỡ từng dòng quyền.

**FRANCHISEE được gì:** ranh giới dữ liệu rõ ràng — HO **không** xem được lương nhân sự, chi phí mặt bằng, lợi nhuận ròng · chứng từ thu tiền mang **pháp nhân của chính họ** · khi kết thúc hợp đồng vẫn **đọc được dữ liệu học viên của mình** trong thời gian chuyển tiếp và nhận **gói bàn giao**.

**Cơ sở nội bộ và giáo viên được gì:** GV biên chế HO **được điều tới cơ sở dạy** — nơi trực thuộc tách khỏi nơi tác nghiệp · cấu hình **kế thừa theo cây** nên đặt một lần ở vùng, cả tỉnh dùng chung · cơ sở mới có sẵn phòng ban, bộ vai trò, danh mục.

**Điều KHÔNG hứa** (ghi rõ để không ai kỳ vọng nhầm): không hợp nhất báo cáo tài chính chuẩn kế toán (**D11**) · không engine hoá quy trình duyệt (**D12**) · không DRM/chặn tải (**D8**) · **không** học bù liên cơ sở (**QĐ-C**) · không nhóm người dùng (**Q1**) · không cây báo cáo theo quản lý trực tiếp (**Q2**).

---

## 7. Giải pháp

### 7.1 Luồng người dùng

Ký hiệu: **[có]** = màn hình đã tồn tại · **[MỚI]** = phải xây.

**(a) Mở khối vùng mới + cơ sở nội bộ**
`/admin/orgunits` **[MỚI]** → tạo node `REGION` dưới ROOT → `/admin/centers/new` **[có, sửa]** nhập tên + **mã bắt buộc** + hồ sơ pháp nhân → hệ thống tạo `Center` **và** `OrgUnit(CENTER)` trong **cùng transaction**, gắn dưới vùng → **khuôn mẫu chạy tự động**: sinh phòng ban chuẩn + danh sách vị trí bắt buộc (chưa gán người) + danh mục theo mức → `/admin/users/[id]/org-roles` **[có]** gán quản lý cơ sở → cơ sở nhận học viên được.

**(b) Mở cơ sở NHƯỢNG QUYỀN**
Như (a), thêm: đặt `relationshipType = FRANCHISEE` trên node → `/admin/franchise-contracts` **[MỚI]** tạo hợp đồng (`franchisorOrgId` = HO, `franchiseeOrgId` = node vừa tạo, ngày ký, ngày hết hạn, tỉ lệ phí) → chuyển `ACTIVE` → gán vai trò cho nhân sự bên nhận; mỗi `UserOrgRole` mang `derivedFromType=CONTRACT` + `derivedFromId`.
⚠️ Gán vai trò tại node `FRANCHISEE` **khi chưa có hợp đồng `ACTIVE`** → từ chối (`NO_ACTIVE_CONTRACT`).

**(c) Đào tạo HO xuất bản chương trình**
`/admin/curriculums` **[có]** soạn → chương trình mang `ownerOrgUnitId = HO` → lớp ở **mọi** cơ sở dùng được → **không** đơn vị nào ngoài phạm vi HO sửa được. Bên nhận **sao chép** chương trình → bản sao **giữ nguồn gốc**, lớp dùng bản sao **vẫn nằm trong phạm vi của chủ gốc** (R-D10-11).

**(d) Điều GV biên chế HO tới CS1 dạy**
`/admin/nhan-su/[id]/dieu-dong` **[MỚI]** tạo phân công `CONCURRENT` tới OrgUnit CS1, có từ–đến ngày → GV xuất hiện trong dropdown chọn GV của lớp CS1 → gán lớp thành công. **Nơi trực thuộc (`PRIMARY` @ HO) không đổi.**
Hết hạn phân công → quyền phái sinh **mất trong cùng transaction**.

**(e) GV mở nội dung một buổi — 4 cổng kiểm**
```
mở /scorm/play/{packageId}?sessionId={S}
 ├─ cổng 1: còn giữ vai trò giảng dạy?        không → 403
 ├─ cổng 2: là GV của buổi S?                  không → 403   (gồm cả actualTeacherId)
 ├─ cổng 3: gói thuộc đúng buổi/chương trình?  không → 403   ← chặn ghép URL
 ├─ cổng 4: buổi đã tới cửa sổ mở khoá?        không → 403 kèm ngày sẽ mở
 └─ qua cả 4 → phát nội dung + watermark động + ghi nhật ký
```

**(f) Hợp đồng hết hạn**
Tác vụ nền phát hiện `expiresAt` đã qua → `revokeByContract` chạy **một transaction**: hạ toàn bộ `UserOrgRole` phái sinh → `EXPIRED`, hạ vai trò v1, **tăng `tokenVersion`** (người đang mở phiên mất quyền ghi ngay), cấp `FRANCHISEE_READONLY` với `effectiveTo` = ngày cắt + thời gian chuyển tiếp, sinh **gói bàn giao** + **1 dòng audit gộp**.

### 7.2 Yêu cầu

**Cách đọc:** `TT` = trạng thái (**M** = xây mới · **S** = sửa cái đã có · **Đ** = đã có, chỉ khoá hồi quy). `Cỡ` = S/M/L. `Sh` = đụng cửa sổ shadow-compare. Cột "Xong nghĩa là gì" đã rút gọn — bản đầy đủ nằm trong nhật ký workflow.

#### Nhóm 1 — Nền tảng cây tổ chức (D2)

| Mã | Hệ thống PHẢI… | Xong nghĩa là gì | TT | Cỡ | Phụ thuộc | Sh |
|---|---|---|---|---|---|---|
| R-D2-01 | Có màn hình quản trị hiển thị toàn bộ cây OrgUnit | SUPER_ADMIN thấy đủ ROOT/HO/vùng/cơ sở đúng quan hệ cha-con; vai trò khác bị chặn | M | M | — | ✗ |
| R-D2-02 | Cho tạo đơn vị qua giao diện, **gọi lại** `createOrgUnit`, không viết lại luật | Mã trùng → lỗi tiếng Việt, 0 bản ghi. ROOT thứ hai → từ chối | M | M | 01 | ? |
| R-D2-03 | Cho sửa/di chuyển node, **bắt buộc lý do ≥3 ký tự** khi đổi cha | Bỏ trống lý do → `REASON_REQUIRED`. Đổi cha thành hậu duệ → `ORG_CYCLE`. Audit ghi cha cũ/mới/người/lý do | M | M | 02 | ? |
| R-D2-04 | Cho xoá mềm, bắt buộc lý do, từ chối nếu còn con sống | Node còn con → `ORG_HAS_CHILDREN`. Xoá lá → `deletedAt` khác null + audit có lý do | S | S | 02 | ✗ |
| R-D2-05 | Ghi và **hiển thị** nhật ký mọi thao tác cây | Làm 4 thao tác → nhật ký đúng 4 dòng, có giá trị cũ/mới | M | S | 03,04 | ✗ |
| R-D2-06 | Thêm loại `REGION` vào enum DB **và** hằng TS | Tạo được `REGION` dưới ROOT và `CENTER` dưới `REGION`. Test đối chiếu enum Prisma ↔ hằng TS **khớp tuyệt đối** | M | M | 02 | ✗¹ |
| R-D2-07 | **Loại `REGION` khỏi `DEFAULT_SELECTABLE_TYPES`** | Form tạo lead/lớp/học viên/nhân sự **không** liệt kê node vùng | S | S | 06 | ✗ |
| R-D2-08 | Từ chối gắn `centerId` cho node `REGION`/`GROUP`/`DEPARTMENT` | `ORG_CENTERID_NOT_CENTER`; truy vấn: 0 dòng `type ≠ CENTER` có `centerId` | S | S | 06 | ✗ |
| R-D2-09 | Lưu **materialized path + depth**, cập nhật trong cùng transaction với mọi thao tác tạo/đổi cha | Đổi cha node có 3 hậu duệ → cả 4 node path mới đúng. Lỗi giữa chừng → 0 node đổi | M | M | 06 | ✓ |
| R-D2-10 | Nạp path cho dữ liệu cũ + **test bất biến trong CI** | Đối soát path lưu sẵn ↔ path tính lại từ `parentId` = 0 dòng lệch | M | S | 09 | ✗ |
| R-D2-11 | Đọc nhánh con bằng **truy vấn tiền tố**, bỏ quét toàn bảng mỗi request | SQL sinh ra chứa điều kiện tiền tố; `visibleCenterIds` của mọi actor mẫu **giữ nguyên** trước/sau | S | M | 10 | ✓ |
| R-D2-12 | Lưu `relationshipType` (`OWNED_SUBSIDIARY`/`FRANCHISEE`/`AFFILIATE`), mặc định `OWNED_SUBSIDIARY` | Đặt `FRANCHISEE` cho một node **không** đổi bất kỳ kết quả phân quyền nào (hồi quy xanh) | M | S | 02 | ✗ |
| R-D2-13 | Lưu cờ hạch toán `INDEPENDENT`/`DEPENDENT`, mặc định `DEPENDENT` | Đọc/ghi thành công; audit ghi giá trị cũ/mới ⚠️ **xem §9 câu 6** | M | S | 12 | ✗ |
| R-D2-14 | Lưu **hồ sơ pháp nhân** trên OrgUnit (tên pháp nhân, MST, số TK, ngân hàng, tiền tệ, múi giờ) và **che MST + số TK ở tầng truy vấn** | Vai trò không có quyền tài chính gọi **thẳng API** → hai trường trả rỗng/đã che | M | M | 12, R-D4-06 | ✗ |
| R-D2-15 | Lấy MST hiển thị từ hồ sơ pháp nhân, **bỏ hằng số trong code** | Grep MST hardcode = 0 (ngoài seed/test). Đổi MST trong quản trị → trang public đổi theo, **không deploy** | S | S | 14 | ✗ |
| **R-D2-16** | **Tạo `Center` và `OrgUnit(CENTER)` trong CÙNG transaction** | Tạo cơ sở → đúng 1 `Center` + 1 `OrgUnit` trỏ nhau. Lỗi ở bước 2 → **0 `Center` mới**. Đối soát dữ liệu cũ: 0 `Center` mồ côi | S | M | — | ✗ |
| **R-D2-17** | **Bắt buộc mã cơ sở**, chuẩn hoá chữ hoa, duy nhất, **bất biến sau khi đã sinh bản ghi** | Bỏ trống → từ chối. Trùng → từ chối. Đã có học viên/lớp mà sửa mã → từ chối. Truy vấn: 0 `Center` có `code = null` | S | S | 16 | ✗ |
| **R-D2-18** | **Dừng và báo lỗi** khi sinh mã mà cơ sở không có mã — thay vì thay bằng giá trị mặc định | Grep chuỗi thay thế `"CS"`/`"SR"` trong đường sinh mã = 0. Hai cơ sở **không bao giờ** sinh cùng một mã học viên | S | S | 17 | ✗ |
| R-D2-19 | Nạp mã + tạo OrgUnit cho mọi `Center` đang tồn tại, kèm báo cáo đối soát | 3 truy vấn đối soát đều trả 0 dòng | M | S | 16,17 | ✗ |
| R-D2-20 | Ràng buộc DB: mỗi `Center` ≤ 1 `OrgUnit(CENTER)`; test CI đối soát "Center mồ côi" | Chèn tay OrgUnit thứ hai cùng `centerId` → DB từ chối | M | S | 19 | ✗ |
| R-D2-21 | Xác định phòng ban của nhân viên từ **đúng một** nguồn | Hồ sơ, báo cáo, bộ lọc đều đọc cùng một trường/bảng qua **một hàm chung** ⚠️ **xem §9 câu 1** | S | M | — | ? |
| R-D2-22 | Đọc danh sách cơ sở trang public **từ DB**, bỏ mảng cứng + union type | Thêm cơ sở thứ 3 qua quản trị → trang liên hệ hiện đủ 3, **không sửa dòng code nào**. Grep union = 0 kể cả bản legacy | S | L | 17 | ✗ |
| R-D2-23 | **Không hồi quy SEO** sau khi gỡ dữ liệu cơ sở khỏi code | Diff JSON-LD trước/sau: khác biệt duy nhất được phép là phần tử cơ sở mới. Lighthouse mobile không giảm | M | M | 22 | ✗ |
| **R-D2-24** | **Nghiệm thu tổng: mở vùng mới + cơ sở nhượng quyền hoàn toàn bằng giao diện** | Kịch bản đầu-cuối: tạo vùng → tạo cơ sở nhượng quyền (mã + hồ sơ pháp nhân) → khuôn mẫu tự chạy → gán quản lý → người đó tạo được lớp/học viên với mã đúng tiền tố → **và không thấy dữ liệu cơ sở khác**. `git diff` = rỗng | M | M | 06,16,17,R-D6-13 | ✓ |

¹ ⚠️ **Chuẩn cờ shadow đã được sửa** (xem §7.3): thêm một giá trị enum **không** đổi kết quả hàm quyền trên dữ liệu đang có → **không** đụng shadow. Cờ này trước đó bị dùng sai chuẩn ở 5 yêu cầu.

#### Nhóm 2 — Danh mục ba mức + khuôn mẫu đơn vị (D6)

| Mã | Hệ thống PHẢI… | Xong nghĩa là gì | TT | Cỡ | Phụ thuộc | Sh |
|---|---|---|---|---|---|---|
| R-D6-01 | Có **bảng khai báo mức** cho mọi bảng danh mục; bảng chưa khai → CI đỏ | Thêm bảng danh mục mới không khai mức → CI fail nêu tên bảng | M | M | — | ✗ |
| R-D6-02 | Áp phân loại đã duyệt: **dùng chung** = Course/Curriculum/Lesson/ScormPackage · **kế thừa+ghi đè** = CoursePackage/Voucher/Product/InventoryItem/EmailTemplate/Holiday · **độc lập** = PaymentMethod/Room | Bảng mức độc lập: hai cơ sở không đọc thấy bản ghi của nhau. Bảng dùng chung: mọi cơ sở đọc cùng một tập | M | S | 01 | ✗ |
| R-D6-03 | Bổ sung `ownerOrgUnitId` cho mọi bảng mức 2 và mức 3 | Tạo mới bỏ trống → từ chối. Đối soát dữ liệu cũ = 0 dòng thiếu | M | L | 02 | ? |
| R-D6-04 | Đọc danh mục **bắt buộc qua hàm theo mức**; chặn truy vấn thẳng ở tầng ứng dụng | Lint đỏ khi `app/` truy vấn thẳng. Cơ sở con không có bản riêng → trả bản của cha; có bản riêng → **không** trả bản cha | M | L | 03 | ✗ |
| **R-D6-05** | **Kế thừa cấu hình N tầng theo đường lên gốc** (thay 2 tầng phẳng) | Đặt khoá ở vùng → 2 cơ sở con đọc ra giá trị vùng. Đặt riêng ở 1 cơ sở → cơ sở đó đọc riêng, cơ sở kia vẫn đọc vùng. Xoá riêng → quay về vùng | S | M | R-D2-09 | ✗ |
| R-D6-06 | Khai báo **cấp nào được ghi đè** cho từng khoá (thay cờ đúng/sai) | Ghi đè ở cấp không cho phép → từ chối kèm thông báo nêu cấp hợp lệ | S | S | 05 | ✗ |
| R-D6-07 | Màn hình cấu hình hiển thị **nguồn kế thừa** của giá trị | Xem tại cơ sở kế thừa → ghi rõ tên đơn vị nguồn + nhãn "đang kế thừa"; sau khi ghi đè → nhãn đổi + có nút gỡ ghi đè | M | M | 05 | ✗ |
| R-D6-08 | Khuôn mẫu đơn vị **viết tay tuần tự**, một transaction, **chạy lại được** | Chạy lần 2 → số bản ghi không tăng. Lỗi ở bước cuối → 0 bản ghi còn lại. Audit ghi người/đơn vị/thời điểm | M | M | R-D2-16 | ✗ |
| R-D6-09 | Khuôn mẫu sinh **phòng ban chuẩn** | Cơ sở mới có đủ bộ phòng ban theo danh mục đã duyệt, không thiếu không trùng | M | S | 08, R-D2-21 | ✗ |
| R-D6-10 | Khuôn mẫu sinh **danh sách vị trí bắt buộc ở trạng thái chưa gán người** — TUYỆT ĐỐI không tự tạo bản ghi trao quyền | Sau khuôn mẫu: bảng gán vai trò cho đơn vị mới = **0 dòng**; màn quản trị cảnh báo còn vị trí chưa bổ nhiệm | M | M | 08 | ✓ |
| R-D6-11 | Khuôn mẫu khởi tạo danh mục **theo đúng mức** | Mức độc lập → có bản ghi khởi tạo; mức kế thừa → **0** bản ghi riêng nhưng hàm đọc vẫn trả dữ liệu cha; mức dùng chung → không tăng | M | M | 04,08 | ✗ |
| R-D6-12 | Khuôn mẫu bằng **mã TypeScript tuần tự** — không đọc bước từ bảng/tệp mô tả (**D12**) | Rà mã: không tồn tại bảng/tệp mô tả bước; sửa khuôn mẫu = sửa mã + phát hành | M | S | 08 | ✗ |
| R-D6-13 | Khuôn mẫu **chạy tự động** khi tạo cơ sở + có nút chạy lại cho SUPER_ADMIN | Tạo cơ sở → dữ liệu chuẩn có ngay. Chạy lại trên cơ sở cũ → bổ sung, **không ghi đè, không sinh trùng**, có audit | M | S | 09,10,11 | ✗ |
| **R-D6-14** | **Mở nhóm khoá cấu hình về giá/thuế/tiền tệ** — hiện **0/45 khoá** | FRANCHISEE đặt được học phí riêng cho cùng một khoá mà không sửa code ⚠️ **xem §9 câu 9** | M | M | 05,06 | ✗ |

> ⚠️ **Ràng buộc chưa ai nêu, đã tự xác minh:** học phí hiện **toàn cục** — `Course.price`, `Course.priceDisplay`, `CoursePackage.priceOriginal/priceEarlyBird/priceMember` **không trường nào** có `centerId`/`orgUnitId`. FRANCHISEE ở tỉnh khác **không thể** có mức học phí khác. Với nhượng quyền, giá khác nhau gần như chắc chắn → **R-D6-14 là bắt buộc, không phải tuỳ chọn**.

#### Nhóm 3 — Ba trục nhân sự + ba mô hình quyền (D3, D4, QĐ-B)

| Mã | Hệ thống PHẢI… | Xong nghĩa là gì | TT | Cỡ | Phụ thuộc | Sh |
|---|---|---|---|---|---|---|
| R-D3-01 | Lưu `derivedFromType` (`EMPLOYMENT`/`ASSIGNMENT`/`CONTRACT`/`MANUAL`) + `derivedFromId` trên `UserOrgRole`, **không cho trống** | Dòng thiếu `derivedFromType` → DB từ chối. Sau backfill: 0 dòng NULL | M | S | R-D9-01 | ✗ |
| R-D3-02 | Có `revokeUserOrgRolesBySource(type, id, actor, reason)` — **một transaction, một `updateMany`, một dòng audit gộp** | 5 dòng cùng nguồn → cả 5 `EXPIRED` sau **đúng 1** câu `updateMany` (đếm query trong test); `resolveActor` trả rỗng ngay lần gọi kế tiếp; lỗi giữa chừng → 0/5 đổi | M | M | 01 | ✓² |
| R-D3-03 | Coi `EmployeeOrgAssignment` `PRIMARY` còn hiệu lực là **nguồn sự thật duy nhất** về nơi trực thuộc; `Employee.centerId`/`orgUnitId` chỉ ghi lại tự động | Đổi PRIMARY CS1→CS2 → hai trường tự đổi trong cùng transaction. Gửi thẳng payload `centerId` khác → **bị bỏ qua** | S | L | 04,06 | ✗ |
| R-D3-04 | **Partial unique index** chống 2 `PRIMARY` + `ACTIVE` cùng `employeeId` | Hai INSERT song song → câu thứ hai bị DB từ chối. Trước khi tạo index: đối soát 0 nhóm có >1 dòng | M | S | — | ✗ |
| R-D3-05 | Có **màn hình điều động/kiêm nhiệm** gọi thẳng `createAssignment`/`updateAssignment` (đơn vị, loại, từ–đến ngày, tỉ lệ phân bổ, lý do) | Call-site `createAssignment` trong `app/` ≥ 1 (**hiện 0**). Tạo PRIMARY thứ hai → lỗi tiếng Việt | M | M | 04 | ✗ |
| R-D3-06 | Công tắc "Nhân viên HO" **đi qua service**, không ghi thẳng | Grep `employeeOrgAssignment.create\|updateMany` trong `nhan-su/` = 0 | S | M | 05 | ✗ |
| R-D3-07 | Phân công `EXPIRED`/`SUSPENDED` → thu hồi `UserOrgRole` phái sinh **trong cùng transaction** | Kết thúc phân công A → 2 `UserOrgRole` của A thành `EXPIRED` ngay. Lỗi ở bước thu hồi → phân công A **cũng không** đổi (rollback trọn gói) | S | M | 02,06 | ✓ |
| **R-D3-08** | **Một** tác vụ nền duy nhất quét quá hạn **theo `derivedFrom`** — ba loại nguồn là ba bộ lọc (gộp T3) | Phân công/hợp đồng quá hạn → `EXPIRED` + quyền thu hồi. Chạy lần hai → 0 dòng đổi thêm, không audit trùng | M | M | 02 | ✓ |
| R-D3-09 | Có **hàm thuần** quyết định "X có được gán làm GV của lớp thuộc đơn vị U": true ⟺ **đang giữ vai trò giảng dạy** VÀ **có phân công còn hiệu lực tới U hoặc tổ tiên của U** | Bộ test bảng 6 ca — gồm ca (3) GV biên chế HO có kiêm nhiệm tới CS1 → **true**, ca (4) không có kiêm nhiệm → **false**, ca (5) có phân công nhưng không giữ vai trò GV → **false** | M | M | 05 | ✗ |
| **R-D3-10** | **[GỘP với R-D8-10]** Thay `User.centerId === class.centerId` bằng hàm R-D3-09 tại **cả ba chỗ trong cùng một lần phát hành**: danh sách GV chọn được · dropdown · guard máy chủ | GV biên chế HO có kiêm nhiệm tới CS1 → xuất hiện trong dropdown **và** lưu lớp thành công. POST thẳng `teacherId` của người không có phân công → từ chối. Quản lý cơ sở tự gán mình → từ chối (không giữ vai trò GV) | S | M | 09 | ✗ |
| R-D3-11 | Giữ nguyên tắc **phân công KHÔNG tự sinh quyền** — khoá bằng test | Tạo phân công tới CS2 mà không cấp `UserOrgRole` → `resolveActor` trả rỗng, `visibleCenterIds` **không** chứa CS2 | Đ | S | R-D6-10 | ✗ |
| **R-D3-12** | **[MỚI]** Nhân viên **nghỉ việc** thì quyền mất — phủ nguồn `EMPLOYMENT` | Đặt nhân viên `INACTIVE`/kết thúc `PRIMARY` → mọi `UserOrgRole` `derivedFromType=EMPLOYMENT` của người đó `EXPIRED` trong cùng transaction ⚠️ **xem §9 câu 4** | M | M | 02,03 | ✓ |
| R-D4-01 | Gắn cho **mỗi action** đúng một mô hình: `ORG_TREE` / `RECORD_OWNER` / `CONTENT_TREE` | Test CI: 0 action thiếu khai báo; thêm action mới quên khai → CI đỏ | M | M | — | ✗ |
| R-D4-02 | **Bước 1 của `OWN`:** mọi call-site của action `RECORD_OWNER` truyền `target` **TRƯỚC** khi có bất kỳ dòng seed `OWN` nào | Mỗi action `RECORD_OWNER` có ≥1 lời gọi `checkPermission` có `target`. `RolePermission WHERE scopeType='OWN'` = **0 dòng** cho tới khi bước này xong | S | M | 01 | ✗ |
| R-D4-03 | **Bước 2:** seed `OWN` cho các action `RECORD_OWNER` | Sale chỉ có scope `OWN` mở được lead của mình, bị từ chối lead của đồng nghiệp cùng cơ sở | M | S | 02 | ✓ |
| R-D4-04 | **Bước 3:** test CI chống khoá trắng | Thêm dòng seed `OWN` cho action chưa có call-site truyền target → **CI đỏ** kèm tên action | M | S | 03 | ✗ |
| R-D4-05 | Tách nghĩa `CLASS` và `ASSIGNED`, **hoặc** bỏ hẳn một trong hai khỏi enum | Nếu tách: test bảng chứng minh hai scope khác nhau. Nếu bỏ: enum còn một tên, migration đổi dữ liệu, CI không còn tham chiếu tên đã bỏ ⚠️ **xem §9 câu 11** | S | M | 01 | ✓ |
| **R-D4-06** | **Che trường nhạy cảm ở TẦNG TRUY VẤN** bằng Prisma `result:` extension theo actor (lương · liên hệ phụ huynh · học phí) | Actor không có quyền xem lương đọc `Employee` qua `scopedDb` → `salaryRank`/`salaryLevel`/`bhxhBase` trả **null**, **kể cả khi truy vấn nằm ở `lib/` và không qua giao diện**. Số hook `result:` ≥ 1 (**hiện 0**) | M | L | 07, R-TECH-01 | ✗ |
| R-D4-07 | `getEmployeeFieldVisibility` **nhận actor**, không chỉ role | HR@CS1 + nhân viên CS1 → `salary=true`; cùng actor + nhân viên CS2 → `salary=false`. Grep: không còn lời gọi chỉ truyền role | S | M | — | ✗ |
| R-D4-08 | Xoá che trường gọi tay ở tầng giao diện | Số file gọi tay giảm **9 → 0**; kịch bản đầu-cuối về ẩn lương/PII vẫn xanh | S | M | 06 | ✗ |
| **R-D4-09** | **Thu hẹp `isHoLevel` (QĐ-A.1)** — bỏ hai đường thoát "thấy toàn bộ cơ sở" trong tầng cách ly | Actor có vai trò bất kỳ tại HO nhưng **không** có quyền tiền tố `students:` → đọc `Student` trả **0 dòng** của cơ sở khác. Actor có `TRAINING`@HO với quyền `classes:` **vẫn** đọc được lớp mọi cơ sở. Grep `isHoLevel ? "ALL"` = 0 | S | M | **R-D10-03 (và TUYỆT ĐỐI KHÔNG phụ thuộc R-D10-04)** | ✓ |
| R-D4-10 | Mở rộng cổng ESLint chặn `@/lib/db` trần sang `lib/`, **theo từng thư mục con một đợt** | Có bảng lộ trình; sau mỗi đợt thêm file mới import `db` trần trong thư mục đã đóng → `pnpm lint` đỏ. Danh sách miễn trừ **giảm đơn điệu, không được tăng** | S | L | — | ✗ |
| R-D4-11 | Ép cách ly cơ sở trên **đường GHI** bằng cơ chế máy kiểm được (không để là quy ước văn bản) | Viết file mới gọi `sdb.class.update` trên lớp cơ sở khác không kiểm phạm vi → **lint đỏ hoặc ném lỗi lúc chạy**. Tạo bản ghi `SCOPED_MODELS` thiếu `centerId` → bị chặn | M | L | 10 | ✗ |
| R-D4-12 | Chuyển điểm gác **role thô** sang `checkPermission`, **bắt đầu từ nhóm tiền + dữ liệu học viên** | Mỗi đợt: người bị DENY action tương ứng không vào được (trước khi chuyển thì vào được). Có con số trước–sau | S | L | R-QDB-02 | ✓ |
| **R-D4-13** | **[MỚI]** Lọc `include` lồng — quan hệ lồng hiện **không** được cách ly | Truy vấn top-level model đã scope + include model scoped khác → nested cũng bị lọc; hoặc lint chặn `include` model scoped mà không kèm `where` ⚠️ **xem §9 câu 15** | M | L | 11 | ✗ |
| R-QDB-01 | `Actor` mang tập `grantsDeny`; `buildActor` nạp grant `DENY` | Grant DENY `leads:edit` → `actor.grantsDeny` chứa đúng chuỗi đó. Action ngoài sổ đăng ký → bỏ qua | M | S | — | ✓ |
| **R-QDB-02** | **DENY chặn ở DÒNG ĐẦU `can()` v2, TRƯỚC cả nhánh `isSuperAdmin`** | Actor `isSuperAdmin=true` + `grantsDeny` chứa `leads:edit` → `can()` trả **false**. Có cả ALLOW lẫn DENY → **false** | S | S | 01 | ✓ |
| **R-QDB-03** | **Ngoại lệ tường minh cho SUPER_ADMIN** — chống tự khoá | SUPER_ADMIN bị DENY action quản trị vai trò → `can()` **vẫn true** cho action trong danh sách miễn nhiễm. Tạo DENY dẫn tới 0 người còn quyền quản trị phân quyền → **từ chối** | M | M | 02 | ✗ |
| R-QDB-04 | Bộ test ma trận **DENY × 6 scopeType** | Đủ 6 ca, ≥12 khẳng định (có DENY → false, bỏ DENY → true), chạy lane CI mặc định, không cần DB | M | M | 02 | ✗ |
| **R-QDB-05** | **Chặn cứng: CI đỏ nếu bật `RBAC_V2_ENABLED` khi v2 chưa đọc DENY** | Cờ bật mà `grantsDeny` không tồn tại hoặc `can()` không chặn DENY → CI đỏ kèm thông báo rõ | M | S | 04 | ✗ |
| **R-QDB-06** | **[GỘP R-D8-13]** Vá SCORM: đi qua `checkPermission`, **và** `canManageTraining` nhận đối tượng chương trình, chỉ true khi `ownerOrgUnitId` trong phạm vi actor | Người có `training:manage` nhưng bị DENY → `canOpenScorm` **false** (hiện true), **ở cả hai trạng thái cờ**. `TRAINING` tại node FRANCHISEE trên chương trình HO → false. Grep `getEffectivePermissions` trong `lib/scorm/` = 0 | S | M | 02, R-D8-01 | ✓ |
| R-QDB-07 | Grant `ALLOW` **không** mở rộng tầm nhìn ra toàn bộ cơ sở; tầng cách ly **trừ** action bị DENY | Actor CS1 có grant ALLOW `students:view` → đọc `Student` **vẫn chỉ thấy CS1** (hiện thấy tất cả) | S | M | 01 | ✗ |
| R-QDB-08 | **Lý do bắt buộc + audit** khi cấp/gỡ DENY | Tạo DENY không kèm lý do → từ chối (cả Zod lẫn ràng buộc DB). Audit đủ 4 thông tin | S | S | — | ✗ |
| R-QDB-09 | Màn phân quyền hiển thị rõ **DENY đang thắng**, kèm lý do và người cấm | Người có vai trò cho phép X nhưng bị DENY X → giao diện hiển thị trạng thái bị chặn + lý do + tên người cấm | M | M | 08 | ✗ |
| **R-QDB-10** | **[MỚI]** Đảo các test hiện **đang khẳng định ngược** (DENY không có hiệu lực ở v2) | Test cũ được viết lại/đảo trong **cùng lần phát hành** với R-QDB-02, để đội không tưởng mình gây hồi quy | S | S | 02 | ✗ |

² **Chuẩn cờ shadow (xem §7.3):** R-D3-02 **không** đụng shadow khi mới thêm hàm; **có** đụng khi bật nơi gọi. Viết + test được trong làn A.

#### Nhóm 4 — Nội dung chương trình dạy (D8)

| Mã | Hệ thống PHẢI… | Xong nghĩa là gì | TT | Cỡ | Phụ thuộc | Sh |
|---|---|---|---|---|---|---|
| **R-D8-01** | **[GỘP R-D10-01 + phần Curriculum của R-D6-03]** `Curriculum.ownerOrgUnitId` — thêm **additive 2 pha** (pha A: cột nullable + backfill = OrgUnit HO + đọc qua helper; pha B sau khi ổn định: `NOT NULL`) | Sau pha A trên bản sao dữ liệu thật: `count(ownerOrgUnitId IS NULL)` = **0**, mọi bản ghi trỏ OrgUnit `code='HO'`. Có **đúng một** helper `getCurriculumOwner()` trong `lib/` | M | M | — | ✗ |
| R-D8-02 | Quyền sửa chương trình **kèm phạm vi đơn vị** | `TRAINING`@CS-HN1 gọi sửa chương trình `ownerOrgUnitId=HO` → **từ chối**, `updatedAt` không đổi. `TRAINING`@HO → thành công. Guard đặt ở **Server Action**, không chỉ ở giao diện | S | M | 01 | ✗ |
| R-D8-03 | FRANCHISEE **không sửa được** `Curriculum`/`Lesson`/`ScormPackage`/`Document`/`Question`/`Exam` của chủ khác — diễn đạt bằng `ownerOrgUnitId` + `relationshipType`, **KHÔNG dùng DENY** | Dựng node FRANCHISEE với người mang **mọi** vai trò cấp cao nhất kể cả `TRAINING` → **cả 6** hành động ghi trên chương trình HO đều từ chối | M | M | 01, R-D2-12 | ✗ |
| R-D8-04 | **ĐK(1)** `isAssignedTeacher` nhận `Actor`, true chỉ khi **còn giữ** vai trò giảng dạy | Actor có `userId` khớp `Class.teacherId` nhưng `orgRoles` rỗng → **false**. Gỡ `UserOrgRole` GV → trang play trả 403 | S | M | R-CONST-01 | ✗ |
| R-D8-05 | **ĐK(2)** **Đúng MỘT** hàm trong `lib/` trả lời "người này có phải GV của buổi này" (gồm `actualTeacherId`); **gỡ nhánh dự phòng** nới sang "bất kỳ lớp nào cùng `curriculumId`/`courseId`" | `actualTeacherId` chỉ xuất hiện ở **một** file dưới `lib/` với vai trò gác quyền. Khối `scorm/play/[id]/page.tsx:89-113` **không còn tồn tại** | S | M | R-CONST-01 | ✗ |
| **R-D8-06** | **ĐK(3)** Buộc **nối gói học liệu với buổi** trên đường chính; lệch → 403 | Ghép URL: gói của chương trình KHÁC + `sessionId` hợp lệ → **403**. `POST /api/scorm/runtime` cùng cặp lệch → 403 và **0 dòng `ScormAttempt`** được tạo | S | **S** | — | ✗ |
| R-D8-07 | **ĐK(4)** **Cửa sổ mở khoá**: `unlockDaysBefore`/`unlockDaysAfter` trên `Curriculum`, ghi đè được ở `Lesson`; mốc tính theo `ClassSession.date` | Buổi cách 30 ngày + `unlockDaysBefore=3` → 403 kèm **ngày sẽ mở**. Đặt lại cách 2 ngày → mở được. `unlockDaysAfter=7`, buổi cách 10 ngày về trước → 403 | M | L | 01,02, R-D6-05 | ✗ |
| R-D8-08 | Tài liệu giảng dạy đi qua **proxy có vé có hạn**, bỏ URL R2 trần | Grep: không còn `href`/`src` nhận trực tiếp `Document.fileUrl` trong `app/(admin)` và `app/(teacher)`. Dán URL R2 vào trình duyệt ẩn danh → **403/404** | S | L | — | ✗ |
| R-D8-09 | **Tách quyền** xem danh sách tài liệu khỏi quyền **mở nội dung**; quản lý cơ sở chỉ có quyền thứ nhất | `CENTER_MANAGER` mở `/admin/documents` → thấy đủ dòng + metadata, **không** có nút mở; gọi thẳng route proxy → **403**. `TRAINING`@HO → mở được | S | M | 08, R-D4-01 | ✓ |
| ~~R-D8-10~~ | **Đã gộp vào R-D3-10** (cùng sửa một hàm gác theo hai hướng ngược nhau — xem §7.3 "chu trình") | — | — | — | — | — |
| R-D8-11 | Ghi nhật ký **MỌI lượt xem nội dung** — gồm từng tài nguyên qua proxy SCORM và mỗi lượt mở `Document` (ai · gì · buổi/lớp nào · khi nào · IP) | Mở gói + lật 5 tài nguyên con → số dòng nhật ký **> 1** (hiện luôn đúng 1). Mở `Document` → ≥1 dòng (hiện 0) ⚠️ **xem §9 câu 10** | S | M | 08 | ✗ |
| R-D8-12 | Giữ dấu chìm động + làm mờ khi rời màn hình — **ĐÃ CÓ, không làm lại** | Playwright: dấu chìm chứa mã NV + tên người đang đăng nhập, đồng hồ đổi sau 2 giây; đổi tab → lớp phủ mờ; chuột phải → menu không mở | Đ | S | — | ✗ |
| ~~R-D8-13~~ | **Đã gộp vào R-QDB-06** | — | — | — | — | — |
| **R-D8-14** | Bộ kiểm thử ma trận **"khi và chỉ khi"** cho 4 điều kiện | ≥5 ca: 1 ca đủ 4 điều kiện → **200**; 4 ca mỗi ca phá đúng một điều kiện → **403**. Chạy trong luồng tích hợp bắt buộc | M | M | 04,05,06,07 | ✗ |
| **R-CONST-01** | **[MỚI, gộp T6]** Một **hằng số dùng chung** khai danh sách mã vai trò giảng dạy | Hằng số khai một chỗ, có test liệt kê nội dung; R-D8-04, R-D3-09, R-D3-10 đều đọc từ đây | M | S | — | ✗ |

#### Nhóm 5 — Nhượng quyền và phạm vi tài chính (D9, D10)

| Mã | Hệ thống PHẢI… | Xong nghĩa là gì | TT | Cỡ | Phụ thuộc | Sh |
|---|---|---|---|---|---|---|
| R-D9-01 | Model `FranchiseContract`: `franchisorOrgId`, `franchiseeOrgId`, `signedAt`, `expiresAt`, `feeRate`, `status` (`DRAFT`/`ACTIVE`/`SUSPENDED`/`TERMINATED`/`EXPIRED`), `terminatedAt`, `terminatedReason` | Tạo với `franchisorOrgId`=HO, `franchiseeOrgId`=cơ sở → lưu và đọc lại đúng. `franchiseeOrgId` không tồn tại → vi phạm khoá ngoại | M | M | — | ✗ |
| **R-D9-02** | **Chặn NHẦM CHIỀU bằng ràng buộc dữ liệu** — từ chối nếu `franchisorOrgId` không phải node HO/GROUP, hoặc `franchiseeOrgId` không có `relationshipType=FRANCHISEE`, hoặc hai id bằng nhau | Đảo hai giá trị → `FRANCHISE_PARTY_INVALID`, 0 bản ghi. Ghi thẳng SQL chiều ngược → **CHECK constraint chặn** | M | M | R-D2-12, 01 | ✗ |
| R-D9-03 | **[Cùng lần phát hành với R-D2-12 — gộp T7]** Node `relationshipType=FRANCHISEE` **thực sự sinh phạm vi** | Gán vai trò cấp cơ sở tại node đó → `visibleCenterIds` chứa `centerId` của node; node hiện trong picker; danh sách lớp/học viên hiển thị đúng | S | M | R-D2-12, R-D2-16, R-D2-17, R-D2-11 | ✓ |
| R-D9-04 | `UserOrgRole` của tài khoản FRANCHISEE mang `derivedFromType=CONTRACT` + `derivedFromId`; **từ chối cấp vai trò khi không có hợp đồng `ACTIVE` phủ node** | Gán khi hợp đồng `DRAFT`/`TERMINATED` → `NO_ACTIVE_CONTRACT` | M | M | R-D3-01, 01, 03 | ✓ |
| **R-D9-05** | **Cắt hợp đồng là MỘT thao tác:** `revokeByContract(contractId, reason)` — **phải GỌI `revokeUserOrgRolesBySource` của R-D3-02, không tự viết truy vấn** (T4) | 20 `UserOrgRole` dẫn xuất → cả 20 `EXPIRED` cùng một `effectiveTo`, hợp đồng `TERMINATED`, audit tăng **đúng 1 dòng** có `revokedCount=20` + `reason`. Thiếu `reason` → từ chối | M | M | 04, R-D3-02 | ✓ |
| **R-D9-05b** | **[MỚI]** Cắt hợp đồng phải cắt **quyền GHI thật**, không chỉ `UserOrgRole` | Trong **cùng transaction**: hạ `UserOrgRole` phái sinh **+** gỡ vai trò v1 khỏi `User.roles` (hoặc `isActive=false`) **+ tăng `tokenVersion`**. Nghiệm thu: người **đang đăng nhập sẵn**, sau khi cắt, thao tác ghi kế tiếp **bị từ chối — không cần đăng xuất** | M | M | 05 | ✓ |
| R-D9-06 | `RoleDef` mã `FRANCHISEE_READONLY` (chỉ action `*:view`, scope `CENTER`); `revokeByContract` cấp kèm `effectiveTo` = ngày cắt + thời gian chuyển tiếp **cấu hình được** | Sau khi cắt: mỗi tài khoản có đúng một `UserOrgRole` `FRANCHISEE_READONLY`; đọc được danh sách học viên cơ sở mình; mọi action `create/edit/delete` → từ chối ⚠️ **xem §9 câu 3** | M | M | 05 | ✓ |
| R-D9-07 | **[Gộp vào R-D3-08]** Hợp đồng hết hạn tự chuyển `EXPIRED` và chạy đúng luồng `revokeByContract` | Hợp đồng `expiresAt` = hôm qua → sau tác vụ: `EXPIRED`, quyền thu hồi, cấp `FRANCHISEE_READONLY`, **đúng 1** dòng audit. Chạy lần hai → không audit trùng | M | M | 05,06, R-D3-08 | ✓ |
| R-D9-08 | Màn hình quản lý hợp đồng, nhãn tiếng Việt rõ **bên nhượng/bên nhận**, mọi đổi trạng thái **bắt buộc lý do** | Ô "Bên nhượng quyền (HO)" chỉ liệt kê node HO/GROUP; ô "Bên nhận nhượng quyền (cơ sở)" chỉ liệt kê node `relationshipType=FRANCHISEE`. Bỏ trống lý do → không gửi được | M | L | 01,02,05, R-D2-02 | ✓ |
| R-D9-09 | `feeRate` **chỉ là căn cứ tính phí, không sinh chứng từ** (D11) | Bảng có nhãn "Số tham khảo — không phải chứng từ". Đếm `Order`/`Payment`/`Receipt` trước và sau khi mở + xuất → **không đổi**. Test khẳng định không đường mã nào tạo chứng từ từ `feeRate` | M | M | 01, R-D10-04 | ✗ |
| **R-D9-10** | **[MỚI]** Bảng ba trạng thái × ba nhóm quyền, **điền đủ 9 ô**: (đang hiệu lực / tạm ngưng / đã cắt) × (ghi vận hành / đọc dữ liệu của mình / xem nội dung chương trình HO) | Có bảng trong đặc tả + test cho **cả 9 ô**. Ai được tạm ngưng, có cần hai người duyệt không ⚠️ **xem §9 câu 12** | M | M | 01,06 | ✓ |
| **R-D9-11** | **[MỚI]** **Gói bàn giao khi cắt hợp đồng** — nghĩa vụ lưu chứng từ kế toán của bên nhận | Cắt hợp đồng → tồn tại **đúng 1** bản ghi bàn giao + gói kết xuất mở được (danh mục nội dung, định dạng, cách kiểm toàn vẹn), có người ký nhận | M | M | 05 | ✗ |
| **R-D9-12** | **[MỚI]** Điều khoản hợp đồng hệ thống **PHẢI kiểm được** vs chỉ lưu để tra cứu | Liệt kê tường minh trong đặc tả. Ví dụ kiểm được: **chặn tạo cơ sở thứ N+1 dưới cùng hợp đồng** ⚠️ **xem §9 câu 13** | M | M | 01 | ✗ |
| R-D10-01 | **[Đã gộp vào R-D8-01]** | — | — | — | — | — |
| R-D10-02 | **Một hàm duy nhất** `resolveClassCurriculum(classId)`: dùng `Class.curriculumId` nếu có, ngược lại bản `ACTIVE` version cao nhất của `Class.courseId` | Lớp có `curriculumId=X` → trả X kể cả khi khoá có bản mới hơn. Lớp `null` + khoá có v1 ARCHIVED/v2 ACTIVE/v3 DRAFT → trả **v2**. Không có bản ACTIVE → trả **null** | M | M | R-D8-01 | ✗ |
| **R-D10-03** | **Hàm quyết định phạm vi** `isInFranchiseScope(classId)`: true ⟺ giải được chương trình **VÀ** `ownerOrgUnitId` = OrgUnit HO. **KHÔNG** có bảng/màn hình nào cấu hình phạm vi bằng tay | Lớp dùng chương trình HO → true. Lớp dùng chương trình FRANCHISEE tự soạn → **false**. Không giải được → **false** (fail-closed). Grep: không model/route nào cho ghi tay giá trị phạm vi | M | S | 02 | ✗ |
| R-D10-04 | Trong phạm vi: FRANCHISOR xem **chi tiết từng dòng** — đúng **5 nhóm**: học phí từng khoản thu · giảm giá từng đơn · hoàn tiền từng yêu cầu · công nợ từng đơn · **điểm danh từng buổi từng học viên** | Lớp ngoài phạm vi cùng cơ sở → phần chi tiết **không xuất hiện**, kể cả gọi thẳng API bằng `classId` đó → **từ chối, không trả dữ liệu rỗng** | M | L | 03, 06, **R-D4-09** | ✓ |
| R-D10-05 | Ngoài phạm vi: **đúng 5 chỉ số tổng hợp** theo kỳ tháng theo đơn vị (số lớp · số học viên · tổng doanh thu · tổng buổi đã dạy · tỉ lệ điểm danh TB), **trả null kèm nhãn "không đủ dữ liệu" cho ô < 5 học viên** | Phản hồi chứa **đúng 5 khoá**; test duyệt **đệ quy toàn bộ khoá** theo danh sách cấm: không tên/mã học viên, không SĐT, không tên lớp, không tên GV, không mã đơn, không mã phiếu thu, không số tiền từng giao dịch | M | M | 03 | ✗ |
| R-D10-06 | Thêm `orgUnitId` cho `Payment`; thêm **cả `centerId` lẫn `orgUnitId`** cho `Receipt`; mọi lệnh tạo phải đặt | Đếm bản ghi tạo sau ngày triển khai có `orgUnitId = null` = **0** | M | M | — | ✗ |
| **R-D10-07** | **Sửa công thức gán đơn vị cho khoản thu** — thứ tự đơn hàng → lớp của ghi danh → lead; **KHÔNG BAO GIỜ** suy theo đơn vị của actor | Tài khoản HO ghi nhận hộ khoản thu của cơ sở Hà Nội → `Payment.orgUnitId` = **Hà Nội**, không phải HO. Cả ba nguồn đều thiếu → **từ chối** kèm `CENTER_UNRESOLVED` | S | M | 06 | ✗ |
| R-D10-08 | Nạp `orgUnitId` cho `Payment`/`Receipt` cũ + **xuất danh sách tồn đọng** không suy được | Đếm `orgUnitId=null` = đúng số bản ghi trong danh sách tồn đọng. Chạy lần hai → **idempotent** | M | M | 06,07 | ✗ |
| R-D10-09 | Ghi rõ **vế cấm của D10 hiện vô hiệu lực** + **test canary** fail khi schema xuất hiện model chi phí/lương/sổ cái | Test đọc `schema.prisma`, fail nếu xuất hiện model khớp `Payroll\|Expense\|Ledger\|Budget\|Invoice\|CostCenter` mà chưa cập nhật D10 ⚠️ **cần chốt: ai xử lý khi canary kêu** | M | S | — | ✗ |
| **R-D10-10** | **Chặn cứng: không mở màn hình chi tiết D10 khi `isHoLevel` còn cấp phạm vi toàn hệ thống** | Có test: tài khoản mang vai trò bất kỳ tại HO nhưng không có `franchise-finance:view-detail` → API chi tiết lớp **ngoài phạm vi** bị từ chối. Test fail → màn hình phải ở sau cờ tắt | S | M | **R-D4-09** | ✓ |
| **R-D10-11** | **[MỚI]** **Bản sao chương trình phải giữ nguồn gốc** | Sao chương trình HO sang đơn vị nhượng quyền → bản sao có trường trỏ về chương trình gốc; lớp dùng bản sao **vẫn hiện trong màn hình chi tiết của HO** | M | M | R-D8-01, R-D10-03 | ✗ |
| **R-D10-12** | **[MỚI, LỖ HỔNG THƯƠNG MẠI]** **Tách phạm vi TÍNH PHÍ khỏi phạm vi XEM CHI TIẾT** | **Phạm vi tính phí** = theo hợp đồng (mọi lớp chạy trong đơn vị nhượng quyền). **Phạm vi xem chi tiết** = theo quyền sở hữu chương trình (đúng D10). Nghiệm thu: FRANCHISEE tự soạn chương trình riêng → phí **không** đổi, quyền xem chi tiết **có** đổi ⚠️ **xem §9 câu 2 — đây là chỗ mất tiền** | M | M | 03, R-D9-09 | ✗ |
| **R-D10-13** | **[MỚI]** Lớp **không giải được chương trình** → fail-closed + báo cáo đếm | Mặc định **ngoài phạm vi**. Có báo cáo đếm số lớp không giải được; con số phải giảm về 0 trong khoảng đã ấn định | M | S | 02,03 | ✗ |

#### Nhóm 6 — QĐ-C: bỏ hẳn học bù liên cơ sở

> ⚠️ Phân tích phụ thuộc phát hiện **QĐ-C không có một yêu cầu nào** trong 4 nhóm tính năng ban đầu — tức **không ai nhận việc**. Mở nhóm mã mới. Cả 4 **không đụng shadow, cỡ nhỏ, làm được ngay**.

| Mã | Hệ thống PHẢI… | Xong nghĩa là gì | TT | Cỡ |
|---|---|---|---|---|
| **R-QDC-01** | Đổi mặc định `makeup.crossCenterEnabled` → **`false`** **VÀ xoá mọi bản ghi override cấp cơ sở của khoá này** | **[Sửa 29/07/2026 — đóng M6]** Hai vế, phải đủ cả hai: (a) cơ sở **chưa cấu hình gì** → gợi ý bù **không** liệt kê buổi của cơ sở khác; (b) số override cấp cơ sở còn lại = **0**, **kèm mẫu số** = số override tồn tại **trước** khi sửa (mẫu số = 0 thì tiêu chí (b) vô nghĩa, phải ghi rõ). ⚠️ Vế (a) một mình **không đủ**: `centerOverridable: true` (`lib/settings/registry.ts:490`) cho override sống **độc lập** với hằng `default`, nên cơ sở đã từng bật tường minh sẽ **giữ nguyên bật** mà đèn vẫn xanh | S | S |
| **R-QDC-02** | Đổi **fail-OPEN → fail-CLOSED** khi đọc cấu hình lỗi | Giả lập lỗi đọc setting → cross-center **TẮT** (hiện: BẬT) | S | S |
| **R-QDC-03** | **GỠ `MAKEUP_EXCEPTION_MODELS` + `withMakeupException`** — đóng lại lỗ đọc chéo cơ sở. **Cùng lần phát hành: xoá/viết lại `tests/e2e/r7/makeup-cross-center.spec.ts`** | **[Sửa 29/07/2026 — đóng M3]** Grep `MAKEUP_EXCEPTION` = 0. Nhân sự CS1 gọi gợi ý bù → **không** đọc được lớp/buổi/bài giảng của CS2 (mẫu số: ≥ 3 buổi hợp lệ ở CS2). **Bộ test MỚI khẳng định chéo cơ sở bị CHẶN.** ⚠️ ~~"Test cách ly hiện có vẫn xanh"~~ — **tiêu chí cũ SAI và đã bị bỏ**: `makeup-cross-center.spec.ts` có **3 ca KHẲNG ĐỊNH** hành vi chéo cơ sở và **import trực tiếp** `withMakeupException`, nên thi hành QĐ-C **bắt buộc làm chúng ĐỎ**. Giữ tiêu chí cũ = mời người trực CI "sửa cho xanh" bằng cách khôi phục lỗ (KB-09 / TC-13) | S | M |
| **R-QDC-04** | Có chỗ **ghi nhận ca xử lý tay** để còn đếm được | Ghi nhận một ca → đếm được theo kỳ và theo cặp cơ sở ⚠️ **xem §9 câu 5 — đếm để báo cáo hay để đối trừ tiền?** | M | S |
| **R-QDC-05** | **[MỚI]** Rà **dữ liệu bù chéo đang mở** trước khi gỡ | Truy vấn read-only đếm `MakeupNeed` có `makeupSessionId` trỏ buổi thuộc `centerId` khác; xử lý hết trước khi chạy R-QDC-03 | M | S |

#### Nhóm 7 — Vận hành chuyển đổi (từ vòng phê bình tính đầy đủ)

| Mã | Hệ thống PHẢI… | Xong nghĩa là gì | TT | Cỡ |
|---|---|---|---|---|
| **R-OPS-01** | **Kịch bản seed KHÔNG được ghi `parentId` cho node đã tồn tại** | Đặt CS2 dưới vùng → chạy `seedOrgUnits` **hai lần** → `parentId` của CS2 **không đổi**. Sửa comment sai ở `patch-rbac-admins.ts:13` | S | S |
| **R-OPS-02** | Chụp **"ai mất quyền vì lần đổi này"** trước/sau mỗi thay đổi cấu trúc | Kịch bản chụp bảng *tài khoản × tập cơ sở nhìn thấy × tập hành động* cho **toàn bộ** tài khoản đang hoạt động. Ngưỡng: **0 dòng thay đổi** ngoài danh sách đổi có chủ đích đã ký | M | M |
| **R-OPS-03** | **Đối soát báo cáo đổi số + chữ ký kế toán** | Chọn 1 kỳ đóng băng, xuất báo cáo trước và sau, liệt kê **từng dòng chênh + nguyên nhân**; kế toán tổng hợp **ký xác nhận trước khi bật**. Không có chữ ký → không bật | M | M |
| **R-OPS-04** | Kế hoạch **quay lui** cho mỗi nhóm thay đổi một chiều | Với mỗi nhóm ghi rõ: quay lui bằng cách nào, mất bao lâu, mất dữ liệu gì; nhóm không quay lui được **bắt buộc** theo mẫu 2 pha | M | S |
| **R-OPS-05** | **Trình tự chuyển đổi đánh số** kèm truy vấn đối soát từng bước và **điều kiện dừng** | Nạp mã cơ sở → tạo OrgUnit thiếu → tạo node vùng → chuyển cha → nạp path → nạp đơn vị cho tiền. Gặp lệch → **dừng, không đi tiếp** | M | M |
| **R-OPS-06** | Nhắc lại ràng buộc đã chốt: **chuyển dữ liệu chỉ một người, ngoài giờ, backup giữ ≥7 ngày** | Không có backup xác nhận được → **không chạy** | M | S |
| **R-OPS-07** | Rà **đâm mã chứng từ** trước khi mở cơ sở thứ ba | Truy vấn đếm phiếu thu/mã học viên/mã lớp trùng do rơi về chuỗi mặc định = **0** trước khi bật đường tạo cơ sở mới | M | S |
| **R-OPS-08** | **Bất biến: node HO luôn treo thẳng dưới ROOT**, không bao giờ dưới vùng | Test khoá. Lý do: HO và CS2 **cùng địa chỉ "114 Hoàng Diệu"** → bẫy xếp nhầm cho "gọn"; xếp nhầm là mọi tài khoản HO **mất phạm vi toàn hệ thống** | M | S |
| **R-OPS-09** | **Bảng ánh xạ 23 tài khoản thật** (hiện tại → sau khi đổi), có người ký duyệt + bước xác nhận sau đổi | Mỗi người đăng nhập kiểm 1 màn hình quen thuộc và xác nhận | M | M |
| **R-OPS-10** | Chốt **có khoá ghi trong lúc đổi cây hay không** | Nếu đổi nóng: liệt kê thao tác bị cấm trong lúc đó ⚠️ **xem §9 câu 14** | M | S |
| **R-OPS-11** | Mọi **thư/tin tự động và bản in gửi phụ huynh** lấy tên pháp nhân/địa chỉ/đầu mối từ **đơn vị chủ quản của học viên** | Bản in tiến độ hiện đóng cứng *"Sata Robo — Công ty CP Công nghệ Giáo dục"* (`lib/pdf/progress-report.tsx:335`) → phải lấy động | S | M |
| **R-OPS-12** | **Chứng từ thu tiền mang pháp nhân bên phát hành** | Thu tiền tại cơ sở nhượng quyền → phiếu in ra mang **MST của họ**, không phải của HO. Mẫu hiện chỉ nhận `centerName`/`centerAddress` (`lib/pdf/receipt.tsx:31-32`) | S | M |
| **R-OPS-13** | Chốt **chuyển lớp qua ranh giới pháp nhân** | Hoặc **cấm**, hoặc cho phép kèm: ghi nhận đồng ý của phụ huynh + bút toán chuyển công nợ + dòng nhật ký nêu **hai pháp nhân**. `chuyen-lop/_actions.ts:32,45,67` đã nhận `toCenterId` — tức đã chạy được ⚠️ **xem §9 câu 7** | M | M |

#### Nhóm 8 — Dữ liệu cá nhân khi hai pháp nhân dùng chung một CSDL

> `[SĐ]` Nhóm này phát sinh từ vòng phê bình. **Câu F1 phải trả lời trước, mọi thứ dưới treo theo.**

| Mã | Hệ thống PHẢI… | Xong nghĩa là gì | TT | Cỡ |
|---|---|---|---|---|
| **R-DP-01** | Chốt **vai trò theo pháp luật bảo vệ dữ liệu**: HO là bên kiểm soát và bên nhận là bên xử lý thay, **hay** mỗi bên là một bên kiểm soát riêng | Có mục riêng trong đặc tả + câu suy ra được cho từng chức năng bên dưới ⚠️ **xem §9 câu 8 — đây là câu gốc** | M | S |
| **R-DP-02** | Có vai trò **"người phụ trách dữ liệu" gắn theo đơn vị**, thực hiện được xoá/ẩn danh + kết xuất **trong phạm vi đơn vị mình** | Người phụ trách của cơ sở nhượng quyền xử lý được yêu cầu của phụ huynh cơ sở mình, **bị từ chối** với học viên cơ sở khác. Hiện: chỉ `SUPER_ADMIN` của HO làm được | M | M |
| **R-DP-03** | **Thời hạn lưu trữ khai theo đơn vị** (kế thừa từ cấp trên nếu không đặt riêng) | Đặt hai thời hạn khác nhau cho hai đơn vị → danh sách rà soát ra **hai tập khác nhau**. Hiện là một biến môi trường duy nhất toàn hệ thống | S | M |
| **R-DP-04** | **Thông báo quyền riêng tư nêu đúng pháp nhân** của cơ sở học viên đang theo học | Phụ huynh gửi yêu cầu tới đúng bên | S | M |
| **R-DP-05** | **`StudentConsent` ghi phạm vi bên được dùng** (chỉ cơ sở / cả hệ thống thương hiệu) | Học viên chỉ đồng ý phạm vi cơ sở → ảnh của em đó **không xuất hiện** trong kho dùng cho truyền thông cấp hệ thống | S | M |
| **R-DP-06** | **Tệp trên R2 nằm dưới tiền tố theo đơn vị** | Liệt kê được toàn bộ tệp thuộc một đơn vị bằng **một lệnh**, số lượng khớp số bản ghi trong DB. Hiện khoá chia theo **loại file** → cắt hợp đồng **không xoá cũng không bàn giao được** | S | L |
| **R-DP-07** | Mọi **kết xuất** chứa dữ liệu cá nhân: giới hạn theo phạm vi người kết xuất + 1 dòng nhật ký (ai/khi nào/bao nhiêu dòng/đơn vị nào) + dấu nhận diện người tải | Người của cơ sở A bấm kết xuất → tệp ra **0 dòng của cơ sở B** | S | M |

### 7.3 Công nghệ

**Chiến lược migration 2 pha (additive trước, drop sau khi ổn định).** Áp cho: `Curriculum.ownerOrgUnitId` · `UserOrgRole.derivedFrom*` · enum `REGION` · `relationshipType` · `orgUnitId` trên `Payment`/`Receipt` · `path`/`depth` trên `OrgUnit`.
**Pha A:** thêm cột **nullable** + backfill + code đọc qua helper. **Điều kiện sang pha B:** truy vấn đối soát trả 0 dòng NULL trên **dữ liệu thật** và ổn định ≥2–3 ngày trên production.

**`centerId` → `orgUnitId` trên 173 model.** 26 model đang mang **cả hai**, comment *"flip ở PR-D"* nhưng **không tài liệu nào định nghĩa PR-D**. PRD này **không** giải quyết việc hợp nhất — nó chỉ yêu cầu mọi bản ghi **mới** nhất quán ở cả hai trục. ⚠️ **§9 câu 15.**

**Kỹ thuật chưa từng chạy trong repo — cần thử nghiệm trước khi cam kết mốc.**
`R-D4-06` (che trường ở tầng truy vấn) cần Prisma **`result:` extension**. Cả 4 chỗ `$extends` hiện có **đều là `query:`**; chưa có bằng chứng `result:` đè được trường vô hướng có sẵn.
→ **R-TECH-01:** một thử nghiệm nhỏ (1 test xanh) là **điều kiện mở thẻ** cho R-D4-06.

**Chuẩn cờ "đụng shadow" — đã sửa.** Chuẩn cũ bị dùng lệch nhau giữa các nhóm (thêm một giá trị enum bị đánh CÓ, trong khi đổi luật mở rộng tầm nhìn bị đánh KHÔNG). Chốt **hai cờ riêng**:

- **Cờ 1 — đụng shadow-compare:** thay đổi làm **đổi giá trị trả về của hàm quyền động trên dữ liệu đang có**. Thêm hàm mới mà **chưa có nơi gọi** → **không** đụng.
  → Hệ quả lịch quan trọng: **phần lớn việc của D3 và D9 viết + test xong được trong lúc cửa sổ còn mở**, chỉ hoãn bước **nối vào đường chạy thật**.
- **Cờ 2 — đụng phạm vi dữ liệu:** thay đổi làm đổi **tập bản ghi** một tài khoản đọc được. Cờ này mới là cờ nói chuyện với **đợt security hardening**.

**Một chu trình phụ thuộc thật đã được cắt.** `R-D3-10` (**nới** để GV biên chế HO gán được vào lớp) và `R-D8-10` (**siết** để người được gán phải giữ vai trò GV) sửa **cùng một hàm gác** theo **hai hướng ngược nhau**. Giao cho hai người, ghép hai lần phát hành → người sau làm đỏ test của người trước rồi "sửa cho xanh" bằng cách gỡ điều kiện của người kia. **Loại hỏng không ai phát hiện qua đọc diff riêng lẻ.**
→ **Đã gộp làm một** (R-D3-10), một lần phát hành, một bảng kiểm thử chung, điều kiện viết thành **một câu**: *người được gán phải đang giữ vai trò giảng dạy còn hiệu lực, VÀ có ít nhất một nguồn phái sinh (biên chế hoặc kiêm nhiệm còn hạn) trỏ tới cơ sở của lớp — hoặc tới một đơn vị là tổ tiên của cơ sở đó.*

**Một chu trình tiềm ẩn phải giữ nguyên cách cắt.** `R-D4-09` (thu hẹp `isHoLevel`) **chỉ được** phụ thuộc `R-D10-03` (hàm thuần), **TUYỆT ĐỐI KHÔNG** phụ thuộc `R-D10-04` (màn hình chi tiết). Viết lại tiêu chí nghiệm thu của R-D4-09 theo màn hình → chu trình đóng lại và **cả nhánh D10 đứng im**.

**Kiểm thử.** Test cách ly CI hiện chỉ dựng **4/9 mã vai trò**; spec cách ly **đường GHI** (235 dòng, đã viết xong) **không có job CI nào chạy**; spec qua trình duyệt thật **không có `expect()` nào** — luôn xanh dù dữ liệu CS2 hiện đầy màn hình. PRD đòi: phủ **đủ 9 vai trò cấp cơ sở** + phủ **đường GHI** + thêm assertion cho spec chẩn đoán.

**Không làm trong PRD này:** `modules/*` (ranh giới module) · engine hoá (**D12**) · hợp nhất kế toán (**D11**) · DRM/chặn tải (**D8**) · sửa bug reaper `DomainEvent` (thuộc đợt hardening) · vá R2 public URL + `upload-delete` (thuộc đợt hardening — xem `01-intended-vs-implemented.md` S1–S4).

### 7.4 Giả định

Mỗi giả định: phát biểu · hậu quả nếu SAI · cách kiểm rẻ nhất.

| # | Giả định | Nếu SAI thì sao | Kiểm rẻ nhất |
|---|---|---|---|
| **A1** | Chỉ có **một** khối HO cho cả tập đoàn | 3 màn nhân sự dùng `findFirst({type:"HO"})` **không `orderBy`** → lấy tuỳ ý, sai âm thầm | Đọc 3 file; hỏi Ban có kế hoạch HO theo miền không |
| **A2** | **FRANCHISEE dùng chung bộ chương trình của HO** | **D10 sụp đổ** — bên nhận tự soạn chương trình riêng là mọi lớp rơi ra ngoài phạm vi, phí về gần 0. Đã có R-D10-12 để chống, nhưng cần Ban chốt | Hỏi Ban trực tiếp (**§9 câu 2**) |
| **A3** | `centerId` đã backfill 100% trên 6 model mới flip vào `SCOPED_MODELS` | Bản ghi `centerId` NULL **vô hình** với actor cấp cơ sở | 1 truy vấn read-only |
| **A4** | Số bản ghi `UserPermissionGrant` DENY đang tồn tại là **nhỏ** | QĐ-B đang được thi hành trong bóng tối; không ai biết đang bảo vệ bao nhiêu | 1 truy vấn read-only |
| **A5** | Số ca học bù liên cơ sở **đang mở** là nhỏ | R-QDC-03 gỡ ngoại lệ sẽ làm các ca đang mở không tra cứu được | 1 truy vấn read-only (R-QDC-05) |
| **A6** | Một pháp nhân FRANCHISEE = **một node trong cùng một CSDL** (không tách DB riêng) | Toàn bộ mô hình PRD phải viết lại theo hướng multi-tenant tách DB | Hỏi Ban |
| **A7** | Đội 4–5 dev dành được một phần công suất trong khi chạy 3 chương trình khác | Lộ trình §8 giãn ra; **thứ tự** vẫn đúng | Xác nhận với đội kỹ thuật |
| **A8** | Prisma `result:` extension đè được trường vô hướng có sẵn | R-D4-06 (che trường ở tầng truy vấn, cốt lõi của D4) không làm được như thiết kế | **R-TECH-01** — 1 test |
| **A9** | Cửa sổ shadow-compare sẽ đóng trong khoảng lập kế hoạch được | **Toàn bộ làn B** phụ thuộc mốc này | Hỏi chủ đợt go-live RBAC (**§9 câu 12**) |

---

## 8. Phát hành

Không dùng ngày tuyệt đối. **Hai làn.** Làn A chạy được **ngay hôm nay**.

### Nếu chỉ làm được MỘT việc

> **Gói "cổng tạo cơ sở": R-D2-16 + R-D2-17 + R-D2-18.**
> Đây là chặn cứng số một của toàn chương trình. Không có nó thì D9, D10, khuôn mẫu đơn vị và cả nghiệm thu tổng R-D2-24 đều **không trình diễn được** — chỉ chứng minh được bằng lệnh tay trên DB, tức là **không nghiệm thu được**.
> **Ba mã phải đi cùng một lần phát hành** — tách ra sẽ giao một trạng thái nửa vời (cơ sở có node nhưng không mã, hoặc có mã nhưng vẫn hai bản ghi rời).

### Nếu làm được BA việc

1. Gói "cổng tạo cơ sở" (như trên).
2. **`R-D8-01` — `Curriculum.ownerOrgUnitId` + backfill về HO.** Cột **duy nhất mở khoá đồng thời D8 và D10**.
3. **`R-D8-06` — nối gói học liệu với buổi** trên cả 3 bề mặt. Việc **duy nhất** vừa bịt một lỗ **đang mở**, vừa cỡ **S**, vừa không phụ thuộc gì.

### Làn A — chạy trong lúc cửa sổ shadow còn mở

| Pha | Kết quả đạt được | Yêu cầu | Điều kiện ra |
|---|---|---|---|
| **A1** | Mở được cơ sở qua giao diện, không sinh cơ sở ma, không đâm mã | R-D2-16,17,18,19,20 · R-OPS-07 | 3 truy vấn đối soát = 0 dòng |
| **A2** | Chương trình dạy **có chủ**; ghép URL không mở được nội dung lớp khác | **R-D8-01** · R-D8-06 · R-D8-05 · R-D8-04 · R-CONST-01 · R-D10-02 · R-D10-03 | `count(ownerOrgUnitId IS NULL)` = 0; test ghép URL → 403 |
| **A3** | **QĐ-C thi hành trọn vẹn** | R-QDC-05 → 01,02,03,04 | **[Sửa 29/07/2026 — đóng M3]** Grep `MAKEUP_EXCEPTION` = 0 · **bộ test mới khẳng định chéo cơ sở bị CHẶN** · số override cấp cơ sở còn lại = 0 kèm mẫu số. ~~"test cách ly vẫn xanh"~~ đã bỏ — xem `R-QDC-03` |
| **A4** | Cây tổ chức quản trị được, có tầng vùng | R-D2-01..08 · R-OPS-01 · R-OPS-08 | Chạy `seedOrgUnits` 2 lần → `parentId` không đổi |
| **A5** | Nền nhân sự: một nguồn sự thật, có đường tạo kiêm nhiệm | R-D3-04 · R-D3-05 · R-D3-06 · R-D3-01 · R-D3-09 · **R-D3-10** | Bộ test bảng 6 ca xanh; call-site `createAssignment` ≥ 1 |
| **A6** | Bảng hợp đồng nhượng quyền + chống nhầm chiều | R-D9-01 · R-D9-02 · R-D2-12 **cùng lần phát hành với** R-D9-03 | Đảo chiều → CHECK constraint chặn |
| **A7** | Hàm cắt quyền theo nguồn — **viết + test, CHƯA nối vào đường chạy** | R-D3-02 (dạng "có hàm, chưa có nơi gọi") | Test đơn vị xanh; grep: 0 call-site production |
| **A8** | Danh mục có mức, kế thừa N tầng, khuôn mẫu đơn vị | R-D6-01..13 · R-D2-09,10 | Đặt khoá ở vùng → 2 cơ sở con đọc ra giá trị vùng |
| **A9** | Tài liệu giảng dạy không còn URL R2 trần; ghi log lượt xem | R-D8-08 · R-D8-11 | Dán URL R2 vào trình duyệt ẩn danh → 403 |

*Làn A **không đụng** cửa sổ shadow-compare. Đụng đợt security hardening: A9, và một phần A1 (mã chứng từ).*

### Làn B — chỉ khởi động **sau khi cửa sổ shadow-compare đóng**

Thứ tự **bắt buộc, không đảo được**:

```
B1  R-QDB-01 → R-QDB-02 (+R-QDB-03 +R-QDB-10 CÙNG lần phát hành) → R-QDB-04 → R-QDB-06 → R-QDB-05 (chặn cứng)
B2  bật nơi gọi R-D3-02 → R-D3-07 → R-D3-08 → R-D3-12 → R-D3-03
B3  R-D9-04 → R-D9-05 → R-D9-05b → R-D9-06 → R-D9-07 → R-D9-08 → R-D9-10/11/12
B4  R-D2-09 → R-D2-10 → R-D2-11                        (materialized path)
B5  R-D10-06 → R-D10-07 → R-D10-08 → R-D4-09 → R-D10-04 → R-D10-10 (chốt chặn)
B6  R-D4-06 (sau R-TECH-01) → R-D4-07 → R-D4-08 → R-D4-11 → R-D4-13
B7  R-D4-12  (bỏ gác quyền bằng role thô — SAU CÙNG, vì chạm nhiều nhất)
```

**Ba điểm phải nhắc trong làn B:**
(a) `R-QDB-02` và `R-QDB-03` **phải cùng một lần phát hành** — nếu không sẽ có khoảng thời gian tài khoản quản trị cao nhất **tự khoá mình**.
(b) `R-D10-10` là **chốt chặn** — màn hình chi tiết tài chính **mặc định TẮT** cho tới khi test của nó xanh.
(c) `R-D4-09` **chỉ** phụ thuộc `R-D10-03`, **tuyệt đối không** phụ thuộc `R-D10-04`.

**Xuyên suốt cả hai làn:** R-OPS-02 (chụp trước/sau "ai mất quyền") chạy **trước và sau mỗi** thay đổi cấu trúc. R-OPS-03 (đối soát báo cáo + chữ ký kế toán) là **điều kiện bật** cho B5.

---

## 9. Cần Ban dự án quyết — 15 câu

Không tự quyết những câu này. Mỗi câu ghi rõ **cái gì bị chặn** nếu chưa trả lời.

| # | Câu hỏi | Chặn cái gì |
|---|---|---|
| **1** | **"Phòng ban" là node trong cây (`OrgUnit type=DEPARTMENT`) hay bảng phẳng `DepartmentDef`?** | R-D6-09 không có "phòng ban chuẩn" nào để sinh; R-D2-21 không chọn được nguồn |
| **2** | 🔴 **Nếu FRANCHISEE tự soạn chương trình riêng thì tính phí thế nào?** Họ chỉ cần soạn một chương trình mang tên mình rồi gắn lớp vào là mọi lớp rơi ra ngoài phạm vi → **phí về gần 0**. Đây là lỗ hổng thương mại mở bằng **đúng một thao tác nhập liệu hợp lệ**. Tách phạm vi tính phí khỏi phạm vi xem chi tiết (R-D10-12), **hay** chặn ở tầng dữ liệu (đơn vị nhượng quyền không tạo được chương trình)? | R-D10-12, R-D9-09 — **chỗ mất tiền** |
| **3** | **Thời gian chuyển tiếp sau khi cắt hợp đồng dài bao lâu**, và *"dữ liệu học viên của chính mình"* gồm những gì? | R-D9-06 |
| **4** | **Nhân viên nghỉ việc thì quyền có mất không?** D3 chốt *"nguồn mất thì quyền mất"* nhưng nguồn **biên chế** chưa được phủ — lỗ này rộng hơn kiêm nhiệm quá hạn vì chạm **mọi** vai trò | R-D3-12 |
| **5** | **Đếm ca học bù thủ công để BÁO CÁO hay để ĐỐI TRỪ TIỀN** giữa hai cơ sở? Hai câu trả lời cho hai thiết kế dữ liệu khác nhau | R-QDC-04 |
| **6** | **Cờ hạch toán độc lập/phụ thuộc** hiện **không yêu cầu nào đọc** — Ban nêu ít nhất một hệ quả nghiệp vụ (số chạy riêng? phiếu thu riêng? báo cáo riêng?) hay **bỏ khỏi phạm vi**? | R-D2-13 |
| **7** | **Chuyển lớp qua ranh giới pháp nhân**: cấm, hay cho phép kèm đồng ý của phụ huynh + bút toán chuyển công nợ? Chức năng **đã chạy được** | R-OPS-13 |
| **8** | 🔴 **Vai trò theo pháp luật bảo vệ dữ liệu:** HO là bên kiểm soát và bên nhận là bên xử lý thay, **hay** mỗi bên là một bên kiểm soát riêng? **Câu gốc — F2 đến F7 treo theo** | Toàn bộ nhóm 8 |
| **9** | **FRANCHISEE có được đặt học phí riêng không?** Hiện **0/45 khoá cấu hình** về giá/thuế/tiền tệ; `Course.price` và `CoursePackage.price*` **toàn cục** | R-D6-14 |
| **10** | **Ghi log "mọi lượt xem"** nghĩa là mỗi lượt mở gói, hay mỗi tài nguyên con? (một gói SCORM có thể sinh hàng trăm dòng) | R-D8-11 |
| **11** | **`CLASS` và `ASSIGNED`** — gộp làm một hay tách nghĩa thật? Hai tên, một logic (`can.ts:27-29`) | R-D4-05, và điều kiện (2) của D8 |
| **12** | **Cửa sổ shadow-compare đóng theo tiêu chí nào** (đủ số ngày, hay số lệch dưới ngưỡng)? Và **ai được tạm ngưng hợp đồng**, có cần hai người duyệt? | **Toàn bộ làn B**; R-D9-10 |
| **13** | **Điều khoản hợp đồng nào hệ thống PHẢI kiểm được** (vd chặn tạo cơ sở thứ N+1), điều khoản nào chỉ lưu tra cứu? Hợp đồng thật luôn có: lãnh thổ, số cơ sở tối đa, thời hạn báo trước, nghĩa vụ báo cáo, doanh thu tối thiểu | R-D9-12 |
| **14** | **Đổi cây trong cửa sổ khoá ghi hay đổi nóng?** Lúc chuyển sẽ có lớp đang diễn ra, điểm danh đang mở, đơn hàng thanh toán dở | R-OPS-10 |
| **15** | **Trạng thái cuối của `Center` vs `OrgUnit`** — hợp nhất về `OrgUnit` hay giữ song song vĩnh viễn? Schema ghi *"flip ở PR-D"* nhưng **không ai định nghĩa PR-D**. Và **đợt security hardening có nhận** hai việc "include lồng không được lọc" + "soft-delete 4/10 model" không? | R-D4-13; toàn bộ chiến lược migration |

---

## 10. Truy vết

- **112 yêu cầu** = 102 do 4 nhóm tính năng sinh ra + 10 bổ sung sau khi kiểm phụ thuộc và phê bình đầy đủ (`R-QDC-01..05`, `R-OPS-01..13`, `R-DP-01..07`, `R-D3-12`, `R-D6-14`, `R-D10-11/12/13`, `R-CONST-01`, `R-QDB-10`, `R-TECH-01` — trừ đi 2 mã đã gộp).
- **Đã gộp:** `R-D10-01` → `R-D8-01` · `R-D8-13` → `R-QDB-06` · `R-D8-10` → `R-D3-10` · `R-D9-07` → `R-D3-08` · `R-D6-03`(phần Curriculum) → `R-D8-01`.
- **Đã bỏ:** hai không gian mã `KR-*` và `N*` do hai phần khung sinh ra — trùng lộ liễu với `R-*` ở ≥6 cặp. Giữ **duy nhất `R-*`**.
- Mọi con số hiện trạng trong tài liệu này truy được về `00-*.md` và `01-intended-vs-implemented.md`, đều đã qua ít nhất một vòng phản biện độc lập.
