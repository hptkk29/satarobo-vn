# BA — Module Hệ thống (System Kernel), nền tái cấu trúc satarobo

> Ngày lập: 08/08/2026 · Giai đoạn: Solution space · Trạng thái: DRAFT v0.1 chờ Dev duyệt
> Input: khảo sát AMIS chỉ-đọc 27/07 · 5 đề xuất kiến trúc 27/07 (chốt 1 + 2 + 4) · quyết định cắt MISA 05/08 · BA chat realtime 07/08
> Phạm vi: LÕI hệ thống. Không phải BA cho từng nghiệp vụ giáo dục.

---

## 0. Khung tài liệu

### 0.1 Tài liệu này trả lời cái gì

Không bàn "có nên tái cấu trúc không" — đã chốt ở phiên 27/07 với đề xuất 1 + 2 + 4. Tài liệu này trả lời: **lõi Hệ thống gồm những thực thể nào, luật nghiệp vụ nào chi phối chúng, và bảy nghiệp vụ giáo dục cắm vào đó bằng cách nào.**

Đầu ra dùng trực tiếp cho: schema Prisma, PRD, backlog, và bộ test ma trận quyền.

### 0.2 Bốn thứ copy từ MISA, ba thứ MISA không có

**Copy (đã xác nhận qua khảo sát):**

1. Cây cơ cấu tổ chức là **gốc của mọi phân quyền**, không phải một danh sách đơn vị phẳng.
2. Vai trò gắn vào **vị trí trong cây**, người được gán vào vị trí. Nhân sự đổi chỗ → quyền tự đổi.
3. **Phạm vi dữ liệu là trục riêng**, độc lập với quyền chức năng. Đây là điểm giá trị nhất của AMIS.
4. **Registry quyền tập trung** — mỗi module khai báo quyền của nó vào một nơi.

**Tự thiết kế (khảo sát chứng minh AMIS không có):**

5. Trục `relationshipType` — nhượng quyền là đơn vị **không thuộc sở hữu** nhưng **trong cây vận hành**. AMIS chỉ mô hình hoá được "chi nhánh trong một pháp nhân".
6. **Kế thừa + ghi đè có kiểm soát** cho danh mục. AMIS chỉ có nhị phân dùng-chung / tách-hoàn-toàn.
7. **FranchiseContract là thực thể có vòng đời**, mọi quyền của bên nhận `derivedFrom` nó.

### 0.3 Xử lý mâu thuẫn với BA chat 07/08

BA chat chốt: *lớp phân quyền mỏng nhúng trong module chat, không dựng nền 4 mức trước.* Lý do vẫn đúng — nền là hạng mục 4–6 tuần chạm 14 module PROD, không được phép chặn một module 3 tuần.

Bản BA này **không đảo quyết định đó**. Nó ràng buộc bằng một điều khoản:

> **Điều khoản tương thích.** Module chat không được tự viết câu lệnh kiểm tra quyền rải rác trong Server Action. Mọi kiểm tra đi qua đúng một hàm `can(actor, permission, target)`. Ở đợt chat, thân hàm là logic mỏng (tra `Participant`, so `centerId`). Khi nền Hệ thống lên, thay thân hàm — **không sửa một dòng nào ở tầng UI hay Server Action.**

Nếu điều khoản này không được ghi vào CLAUDE.md của đợt chat ngay hôm nay, chi phí hoà nhập sau sẽ đắt gấp nhiều lần. Đây là hành động cần làm **trước** mọi thứ trong tài liệu này.

### 0.4 Cảnh báo năng lực — đọc trước khi lên lịch

Đội dev hiện chỉ còn **một người (Kiệt)**, và đang có kế hoạch code chat theo 4 đợt. Nền Hệ thống là hạng mục 4–6 tuần chạm toàn bộ hệ đang chạy PROD.

**Hai việc này không chạy song song được.** Tài liệu này là bản thiết kế để sẵn sàng, không phải lệnh khởi công. Đề nghị: hoàn tất chat trước, khởi công nền Hệ thống sau — trừ khi có thêm người.

---

## 1. Bối cảnh nghiệp vụ

### 1.1 Cơ cấu thực tế (cập nhật 27/07)

Ba tầng:

```
HO (hội sở, cơ quan đầu não)
 ├── Khối quản lý tỉnh/TP  ──┬── Cơ sở
 │                           └── Cơ sở
 └── Đà Nẵng ────────────────┬── CS1 (211 Nguyễn Hữu Thọ)
     (HO gốc trực tiếp giữ)  └── CS2 (114 Hoàng Diệu)
```

**HO** gồm: Ban giám đốc · Đào tạo (sản xuất chương trình + đội ngũ giáo viên) · Công nghệ · Marketing & truyền thông · Kế toán tổng hợp.

**Cơ sở** chỉ có 3 bộ phận: Đào tạo (chỉ giáo viên) · Kinh doanh (sale) · Kế toán tổng hợp.

### 1.2 Ba bài toán mà hệ hiện tại không giải được

| # | Bài toán | Vì sao hệ hiện tại chịu |
|---|---|---|
| B1 | Khối vùng (tỉnh/TP) | `centerId` phẳng, không có chỗ chứa khái niệm tầng trung gian |
| B2 | Giáo viên biên chế HO, tác nghiệp ở cơ sở | Một người một `centerId` → hoặc mất quyền HO, hoặc không vào được dữ liệu cơ sở |
| B3 | Đơn vị không thuộc sở hữu nhưng trong cây vận hành | Không có khái niệm pháp nhân tách khỏi đơn vị vận hành |

Ba bài toán này chia sẻ **cùng một migration**. Đó là lý do đề xuất 1 và 2 được ghép làm một đợt — tách ra là trả giá migration hai lần trên 173 model.

---

## 2. Mô hình dữ liệu lõi

### 2.1 Ba trục độc lập — đừng nhét vào một cột

Sai lầm dễ nhất là dùng một cột `orgId` cho cả ba thứ dưới đây. Chúng khác nhau về bản chất:

| Trục | Trả lời câu hỏi | Thực thể |
|---|---|---|
| **Sở hữu** | Doanh thu này thuộc pháp nhân nào? | `LegalEntity` + `OrgUnit.relationshipType` |
| **Vận hành** | Việc này diễn ra ở đâu trong cây? | `OrgUnit` (cây) |
| **Con người** | Người này thuộc đâu, tác nghiệp ở đâu? | `Position` + `Assignment` |

### 2.2 OrgUnit — cây vận hành

```
OrgUnit
  id
  parentId          → tự tham chiếu
  path              materialized path, ví dụ "/ho/danang/cs1"   ← bắt buộc, để query UNIT_AND_BELOW O(1)
  depth
  unitType          HO | REGION | CENTER | DEPARTMENT
  relationshipType  OWNED | FRANCHISEE | AFFILIATE            ← trục AMIS không có
  legalEntityId     → LegalEntity
  code, name
  status            ACTIVE | SUSPENDED | CLOSED
  templateId        → UnitTemplate (khuôn mẫu sinh ra nó)
  effectiveFrom, effectiveTo
```

`relationshipType` quyết định bộ quyền mặc định sinh ra:

| relationshipType | Sở hữu | Trong cây vận hành | Dùng chương trình | HO thấy tài chính |
|---|---|---|---|---|
| `OWNED` | > 50% | Có | Có | Đầy đủ chi tiết |
| `FRANCHISEE` | 0% | Có | Theo hợp đồng | **Chỉ tổng hợp** + chi tiết các khoản căn cứ tính phí thương hiệu |
| `AFFILIATE` | < 50% | Tuỳ thoả thuận | Tuỳ thoả thuận | Rất hạn chế |

> **Ghi chú thuật ngữ (đã chốt 27/07).** Trong code phải viết tường minh `franchisorOrgId` / `franchiseeOrgId`. Không dùng chữ `franchise` trần — khi Dev nói "franchise" là đang chỉ HO (bên **nhượng**), dễ hiểu ngược.

### 2.3 LegalEntity — pháp nhân, tách khỏi đơn vị vận hành

```
LegalEntity
  id, taxCode, legalName, address
  isPrimary         → pháp nhân gốc SataRobo
```

Vì sao tách: **học phí thu ở cơ sở nhượng quyền thuộc pháp nhân của họ, không phải doanh thu của bạn.** Nếu doanh thu chỉ gắn `orgId`, ngày ký hợp đồng franchise đầu tiên sẽ phải sửa bảng. Đây là ranh giới pháp lý, không phải tuỳ chọn hiển thị.

### 2.4 Position + Assignment — lời giải cho B2

Đây là chỗ tách khỏi mô hình "user có một centerId".

```
Position                          Assignment
  id                                id
  orgUnitId    → đơn vị TRỰC THUỘC  positionId
  title                             userId
  isManagerial                      kind        PRIMARY | CONCURRENT | DELEGATED
  reportsToPositionId  (xem §10)    effectiveFrom, effectiveTo

WorkScope                         ← nơi TÁC NGHIỆP, tách khỏi nơi trực thuộc
  assignmentId
  orgUnitId
  reason       TEACHING | MAKEUP | TRIAL | SUPPORT
  effectiveFrom, effectiveTo
```

**Giáo viên Đà Nẵng:** `Position.orgUnitId = HO/Đào tạo` (biên chế), `WorkScope = [CS1, CS2]` (tác nghiệp). Đổi cơ sở dạy → sửa `WorkScope`, không đụng đến vai trò hay quyền.

**Vai trò gắn vào Position, không gắn vào User.** Người nghỉ việc → gỡ `Assignment`, vị trí giữ nguyên bộ quyền cho người kế nhiệm. Đây là điểm số 2 copy từ MISA.

### 2.5 Registry quyền + PermissionGrant

```
PermissionDescriptor              ← mỗi module tự đăng ký, tập trung một nơi
  key            "class.session.update"
  module         "CLASS"
  action         VIEW | CREATE | UPDATE | DELETE | APPROVE | EXPORT
  scopable       boolean          ← có phải mọi quyền đều cần data scope
  sensitiveFields string[]        ← phục vụ DENY cấp trường

Role
  id, code, name
  orgUnitId      null = vai trò chuẩn toàn hệ thống
  isSystemRole   true = khoá cứng, không sửa được
  templateLevel  HO | REGION | CENTER

PermissionGrant
  roleId
  permissionKey
  effect         ALLOW | DENY                    ← giữ DENY
  dataScope      ALL | UNIT_AND_BELOW | UNIT_ONLY | OWN
  fieldMask      string[]                        ← che trường nhạy cảm
  derivedFrom    null | franchiseContractId      ← hết hạn thì quyền tự tắt
```

**Công thức quyền:**

```
Được phép ⟺ ∃ grant(ALLOW) khớp permissionKey
            ∧ target nằm trong dataScope của actor
            ∧ ¬∃ grant(DENY) khớp
```

**Thứ tự giải quyết:** `DENY` > `ALLOW` tường minh > kế thừa từ vai trò cha. DENY luôn thắng — đây là cơ chế cho phép HO cấp quyền rộng rồi trừ đi các trường nhạy cảm, và là chỗ khảo sát AMIS cho thấy họ làm hẳn một màn riêng.

**Bốn mức dataScope, resolve bằng `path`:**

| Mức | Điều kiện | Chi phí query |
|---|---|---|
| `ALL` | không lọc | — |
| `UNIT_AND_BELOW` | `target.path LIKE actor.path \|\| '%'` | index prefix, O(1) |
| `UNIT_ONLY` | `target.orgUnitId = actor.orgUnitId` | index bằng |
| `OWN` | `target.ownerId = actor.userId` | index bằng |

`OWN` là lý do phải quyết **trước khi viết schema**: có `ownerId` hay không quyết định hình dạng bảng. Bổ sung sau = migrate lại.

### 2.6 FranchiseContract

```
FranchiseContract
  id
  franchisorOrgId   → luôn là HO
  franchiseeOrgId   → cơ sở/công ty nhận
  legalEntityId     → pháp nhân bên nhận
  signedAt, effectiveFrom, expiresAt
  licensedCatalogIds  string[]      ← chương trình được cấp phép
  royaltyRate
  status            DRAFT | ACTIVE | SUSPENDED | TERMINATED | GRACE | CLOSED
```

**Vòng đời và hệ quả quyền:**

| Trạng thái | Quyền của bên nhận |
|---|---|
| `DRAFT` | Không có gì |
| `ACTIVE` | Toàn bộ grant `derivedFrom = contractId` có hiệu lực |
| `SUSPENDED` | Tắt quyền ghi, giữ quyền đọc |
| `TERMINATED` → `GRACE` | **Cắt truy cập chương trình dạy ngay**, giữ quyền đọc dữ liệu học viên của chính họ trong thời gian chuyển tiếp |
| `CLOSED` | Chỉ còn dữ liệu tổng hợp phục vụ đối soát |

**Yêu cầu bắt buộc:** chuyển `ACTIVE → TERMINATED` phải cắt toàn bộ quyền dẫn xuất **trong một thao tác**. Kỹ thuật: không copy quyền xuống bên nhận — mọi grant của họ đều mang `derivedFrom = contractId`, và bộ resolver kiểm tra trạng thái hợp đồng ở thời điểm chạy. Đổi một dòng trạng thái = cắt sạch.

---

## 3. Kế thừa danh mục (Đề xuất 4) — khác biệt cạnh tranh

Đây là thứ MISA không có và bạn bắt buộc phải có. Không có nó, mở một franchise = dựng tay cả tuần, và chương trình bị sửa lung tung.

### 3.1 Ba mức, mỗi mục có chính sách ghi đè riêng

```
CatalogItem
  id
  type            CURRICULUM | PRICE_LIST | ROLE_SET | WORKFLOW | DOC_TEMPLATE
  ownerOrgUnitId  đơn vị xuất bản
  level           GLOBAL | REGION | LOCAL
  parentItemId    null nếu là bản gốc HO
  overridePolicy  LOCKED | OVERRIDABLE | BOUNDED | LOCAL_ONLY
  overrideBounds  json    ví dụ { "priceDelta": ["-10%", "+15%"] }
  version, publishedAt
```

| overridePolicy | Nghĩa | Áp cho |
|---|---|---|
| `LOCKED` | Bên dưới chỉ được dùng, không sửa | **Nội dung chương trình dạy** |
| `BOUNDED` | Sửa được trong biên độ HO đặt | Bảng giá học phí |
| `OVERRIDABLE` | Sửa tự do, vẫn theo dõi được nguồn gốc | Lịch dạy, template thông báo |
| `LOCAL_ONLY` | Đơn vị tự tạo, không kế thừa | Vai trò tuỳ biến trong phạm vi đơn vị |

### 3.2 Quy tắc riêng cho chương trình dạy (đã chốt 27/07)

Đây là chỗ đề xuất 4 gặp trục `relationshipType`, và là tài sản thương hiệu — nên luật chặt nhất:

- **Chỉ đội Đào tạo HO + admin HO** được sửa. Bên nhận nhượng quyền **không có quyền sửa gì**.
- Giáo viên: **chỉ view**, và chỉ view chương trình của lớp mình được add vào. Giáo viên ở cơ sở nhượng quyền tỉnh khác **vẫn được view nội dung**.
- **Khoá mở theo từng buổi** để chống tuồn tài liệu ra ngoài.
- **Quản lý chỉ thấy DANH SÁCH** có chương trình nào, không xem được nội dung bên trong.

Chuỗi bốn điều kiện để một giáo viên đọc được nội dung một buổi:

```
role cho phép  ∧  được phân công vào lớp  ∧  lớp liên kết chương trình đó  ∧  buổi đang trong cửa sổ mở
```

Cả bốn điều kiện phải kiểm ở tầng server. Đây là hạng mục IDOR/BOLA rủi ro cao nhất trong toàn hệ.

### 3.3 UnitTemplate — sinh đơn vị mới

```
UnitTemplate
  id, name
  targetUnitType       CENTER | REGION
  targetRelationship   OWNED | FRANCHISEE
  seedDepartments      json
  seedPositions        json
  seedRoleGrants       json
  seedCatalogRefs      string[]
```

Mục tiêu đo được: **mở một cơ sở nhượng quyền mới = một wizard, không phải một tuần dựng tay.**

---

## 4. Bảy nghiệp vụ giáo dục cắm vào lõi thế nào

Đây là phần AMIS hoàn toàn không dạy được — phải tự BA.

| Nghiệp vụ | Đơn vị sở hữu | dataScope mặc định của cơ sở | Mức danh mục | Ghi chú |
|---|---|---|---|---|
| **Học viên** | Cơ sở ghi danh | `UNIT_ONLY` | — | Franchise: HO chỉ thấy số đếm tổng hợp |
| **Lớp học** | Cơ sở | `UNIT_ONLY` | — | Liên kết 1 `CatalogItem` loại CURRICULUM |
| **Lịch dạy** | Cơ sở | `UNIT_ONLY` | `OVERRIDABLE` | Giáo viên HO vào được qua `WorkScope` |
| **Buổi học bù** | Cơ sở | `UNIT_ONLY` | — | **Đã chốt bỏ cơ chế liên cơ sở** — ngoại lệ xử lý tay |
| **Học phí theo khoá** | Cơ sở vận hành + **LegalEntity ghi nhận** | `UNIT_ONLY` | `BOUNDED` | Hai trường tách biệt, xem §2.3 |
| **Tiến độ học tập** | Cơ sở | `UNIT_ONLY`, phụ huynh `OWN` | — | |
| **Chương trình dạy** | **HO** | `ALL` (view), sửa chỉ HO | `LOCKED` | Chuỗi 4 điều kiện, §3.2 |

**Quyết định đã chốt về tài chính franchise (27/07):** HO thấy **số tổng hợp** tài chính chung của bên nhận, nhưng thấy **chi tiết** các khoản liên quan trực tiếp đến nhượng quyền (căn cứ tính phí thương hiệu, dữ liệu kiểm soát chất lượng). Phạm vi này **dẫn xuất tự động từ quyền sở hữu chương trình**, không cấu hình riêng — bản ghi nào gắn `CatalogItem` do HO sở hữu thì HO thấy chi tiết.

---

## 5. Ranh giới phạm vi — cái KHÔNG làm

Vẽ ranh giới ngay ở BA, nếu không nó nuốt cả một quý.

| Không làm | Lý do | Ở đâu |
|---|---|---|
| Hợp nhất báo cáo tài chính theo chuẩn kế toán | Wizard 4 bước + ~9 bước con, MISA làm 2 phiên bản vẫn phần lớn thủ công. Không phải bài toán của bạn | MISA Kế toán |
| Tiền lương, BHXH, Thuế TNCN | Bám luật, luật đổi là phải sửa trong vài tuần, sai thì bị phạt. Tự xây = mua nghĩa vụ bảo trì vĩnh viễn | MISA |
| Engine hoá quy trình duyệt (Đề xuất 5) | Hiện chỉ có **một** quy trình thật cần engine. Viết tay rẻ hơn. Engine đáng khi có 5–6 quy trình và mỗi vùng có ngưỡng riêng | Hoãn |
| Học bù liên cơ sở | Đã chốt bỏ — tránh 3 đơn vị trên 1 bản ghi | Xử lý tay |

**Cái phải làm dù tiền lương ở lại MISA: chấm công.** Công của giáo viên sinh ra từ lịch dạy, buổi bù, buổi trải nghiệm — tất cả đã nằm trong hệ. Seam sạch nhất: satarobo chốt bảng công + doanh thu hàng tháng → đẩy sang MISA tính lương.

Cái **cần** làm thay cho hợp nhất báo cáo tài chính: **báo cáo vận hành hợp nhất** — số học viên, doanh thu ghi nhận, tỉ lệ chuyển đổi theo vùng. Khác hoàn toàn và đơn giản hơn nhiều.

---

## 6. Chiến lược migration

173 model, hệ đang chạy PROD. Không big-bang. Dùng lại đúng pattern shadow-compare đã chạy cho RBAC v2.

| Pha | Nội dung | Rủi ro PROD | Chặn bởi |
|---|---|---|---|
| **P0** | `PermissionDescriptor` registry + hàm `can()` + khung test ma trận quyền | Không — chỉ thêm | — |
| **P1** | `OrgUnit` + `path` + `LegalEntity`; backfill `centerId → orgUnitId`, giữ cả hai cột chạy song song | Trung bình | P0 |
| **P2** | `Position` + `Assignment` + `WorkScope`; backfill từ bảng nhân sự hiện tại | Trung bình | P1 |
| **P3** | `dataScope` resolver bật ở chế độ **shadow** — ghi log khác biệt, chưa chặn | Thấp khi shadow | P2 |
| **P4** | Cutover: resolver chặn thật, gỡ `centerId` | **Cao** | P3 sạch log ≥ 1 tuần |
| **P5** | `FranchiseContract` + `CatalogItem` + `UnitTemplate` | Thấp — tính năng mới | P4 |

**Quy tắc bất di bất dịch:** không chuyển pha khi pha trước còn khác biệt chưa giải thích được trong log shadow-compare. Đây là bài học đã trả giá ở RBAC v2.

**Chừa cột trước, engine sau.** `CatalogItem.overridePolicy` và `PermissionGrant.derivedFrom` nên có mặt trong schema từ P1 dù chưa dùng — chi phí gần bằng 0 lúc này, đắt sau khi có dữ liệu thật.

---

## 7. Rủi ro chính

| # | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| R1 | Một dev, hai chương trình lớn song song | **Cao** | Không khởi công trước khi chat xong (§0.4) |
| R2 | Chat viết quyền rải rác → không hoà nhập được | **Cao** | Điều khoản adapter `can()` ghi vào CLAUDE.md **hôm nay** |
| R3 | Nội dung chương trình rò qua IDOR | **Cao** | Chuỗi 4 điều kiện kiểm ở server; test ma trận quyền viết trước Server Action đầu tiên |
| R4 | Migration `centerId → orgUnitId` sai âm thầm | Trung bình | Shadow-compare ≥ 1 tuần, P4 không được rút ngắn |
| R5 | HO nhìn thấy tài chính franchise vượt phạm vi pháp lý | Trung bình | Mặc định `DENY` chi tiết; chỉ mở qua liên kết `CatalogItem` do HO sở hữu |
| R6 | Phạm vi phình sang Nhân sự / hợp nhất báo cáo | Trung bình | §5 là ranh giới cứng, mọi bổ sung phải qua duyệt phạm vi |

---

## 8. Định nghĩa hoàn thành cho lõi Hệ thống

Lõi coi như xong khi cả 5 mệnh đề sau đều đúng:

1. Mở một cơ sở nhượng quyền mới bằng **một wizard** từ `UnitTemplate`, không dựng tay.
2. Chấm dứt một hợp đồng nhượng quyền bằng **một thao tác**, quyền chương trình cắt ngay, dữ liệu học viên của họ vẫn đọc được trong `GRACE`.
3. Điều một giáo viên HO sang cơ sở khác chỉ cần sửa `WorkScope` — không đụng vai trò, không đụng quyền.
4. Không module nào tự viết logic kiểm tra quyền ngoài `can()`.
5. Ma trận quyền có bộ test tự động phủ đủ 4 mức `dataScope` × 3 `relationshipType`.

---

## 9. Hai câu hỏi treo — ĐÃ CHỐT 08/08

### Q1. Nhóm người dùng — **LÀM NGAY** (Dev chốt 08/08)

Bối cảnh Dev đưa: quy mô hiện chưa tới 20 người. Hệ quả schema: `UserGroup` + `UserGroupMember` vào từ P0, `PermissionGrant.subjectType = ROLE | GROUP` là cột thật ngay từ đầu, resolver `can()` hợp nhất grant từ cả vai trò lẫn nhóm với cùng thứ tự DENY > ALLOW.

### Q2. Cây báo cáo theo quản lý trực tiếp — **CẦN** (Dev chốt 08/08)

Hệ quả: `Position.reportsToPositionId` là cột bắt buộc từ P2, kèm ràng buộc chống vòng lặp (một Position không được báo cáo về chính chuỗi cấp dưới của nó). Cây báo cáo là cây THỨ HAI, độc lập với cây tổ chức — dùng cho luồng duyệt (dạy bù hiện tại, module Quy trình sau này), không dùng để resolve dataScope.

---

## 10. Bước tiếp theo

| Thứ tự | Việc | Ai | Khi nào |
|---|---|---|---|
| 1 | Ghi điều khoản adapter `can()` vào CLAUDE.md của đợt chat | Dev | **Hôm nay** |
| 2 | Trả lời Q1 và Q2 | Dev | Trước khi viết schema |
| 3 | Chốt bản BA này | Dev | |
| 4 | PRD cho P0–P2 (pm-execution:create-prd) | | Sau khi chốt |
| 5 | Pre-mortem cho migration P4 (pm-execution:pre-mortem) | | Trước khi code P1 |
| 6 | Test scenarios ma trận quyền (pm-execution:test-scenarios) | | Trước Server Action đầu tiên của P0 |

---

*Tài liệu này chưa được duyệt. Mọi con số ở §6 là ước lượng pha, không phải cam kết lịch.*
