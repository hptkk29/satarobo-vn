# BƯỚC 8 — Kịch bản kiểm thử cho 12 kết quả lập lịch được

> Ngày 29/07/2026 · phạm vi **BƯỚC 8** · **chỉ viết cho 12 kết quả của `07-roadmap.md`** (chặng 0: KQ-0.1→KQ-0.5 · chặng 1: KQ-1→KQ-7). **Không** viết cho phần sau ranh giới — theo chỉ đạo, và vì viết test cho thứ chưa biết bao giờ làm là đúng loại công sức nằm không mà KQ-6 đã cảnh báo.
> Nguồn: `07-roadmap.md` · `05-premortem.md` · `06-redteam.md` · `02-prd-franchise-platform.md` · `QUYET-DINH.md` · **mã nguồn + hạ tầng test thật của repo**.
> ⚠️ Skill `pm-execution:test-scenarios` **không có trong máy này** — áp phương pháp chuẩn, không theo khuôn skill.
>
> **Yêu cầu bắt buộc của chương trình:** mỗi kết quả phải có **kịch bản phủ định**, không chỉ kịch bản thuận. Tài liệu này đặt phủ định làm **mặc định**: mỗi khối bắt đầu bằng ca THUẬN tối thiểu rồi dành phần lớn cho PHỦ ĐỊNH và BIÊN.

---

## 1. Cách đọc

| Ký hiệu | Nghĩa |
|---|---|
| `TS-<KQ>-<n>` | Mã kịch bản. Ổn định — vòng sau chỉ thêm, không đánh số lại |
| **THUẬN** | Đường đi đúng. Ít nhất 1 ca mỗi kết quả, không nhiều hơn mức cần |
| **PHỦ ĐỊNH** | Hệ **phải từ chối**. Đây là phần chính của tài liệu |
| **BIÊN** | Dữ liệu thiếu / rỗng / chạy lại / đua nhau |
| `[QS]` / `[SĐ]` | Quan sát có `file:dòng` / suy đoán |

**Ba luật áp cho mọi kịch bản trong file này** — cả ba đều là hệ quả trực tiếp của BƯỚC 5 và 6:

1. **Phải ghi mẫu số.** Tiêu chí `count = 0` trên prod hiện tại (**41 Lead · 2 Student · 1 Employee**) xanh vì rỗng, không phải vì đúng (`KB-18`). Kịch bản nào không ghi được mẫu số thì phải ghi thẳng *"chưa nghiệm thu được"*.
2. **Phủ định phải phân biệt "từ chối" với "trả rỗng".** `[QS]` `R-D10-04` (`02-prd:294`) đã đòi đúng điều này: *"gọi thẳng API bằng `classId` đó → **từ chối, không trả dữ liệu rỗng**"*. Trả rỗng làm hỏng chính phép đo — không phân biệt được "bị chặn" với "không có gì".
3. **Phải nói rõ chạy ở đâu và CI có chạy không.** Xem §2 — đây không phải câu hỏi thủ tục.

---

## 2. ⚠️ Chặn hạ tầng: một phần ba bộ e2e hiện KHÔNG có job CI nào chạy

Phải xử lý trước, nếu không mọi kịch bản dưới đây có nguy cơ được viết vào chỗ không ai chạy.

`[QS]` **Cấu hình mặc định loại trừ 5 nhóm thư mục:**
```
playwright.config.ts:8   testDir: "./tests/e2e"
playwright.config.ts:20  testIgnore: ["**/a0/**", "**/r[0-9]*/**", "**/fl/**", "**/crm/**", "**/teacher/**"]
```

`[QS]` **CI chỉ có 4 job e2e chuyên biệt** — `e2e-a0`, `e2e-r7`, `e2e-fl`, `e2e-teacher` (`.github/workflows/ci.yml:191`, `:262`, `:328`, `:392`); job `e2e` chung chạy `pnpm test:e2e` = cấu hình mặc định (`:110` trở đi).

⇒ Bảy thư mục vừa **bị `testIgnore` loại khỏi job chung**, vừa **không có job riêng**:

| Thư mục | Số spec | Job CI |
|---|---|---|
| `tests/e2e/r1` | 12 | ❌ |
| `tests/e2e/r6` | 10 | ❌ |
| `tests/e2e/r3` | 3 | ❌ |
| `tests/e2e/crm` | 2 | ❌ |
| `tests/e2e/r2` | 2 | ❌ |
| `tests/e2e/r4` | 2 | ❌ |
| `tests/e2e/r5` | 1 | ❌ |
| **Tổng** | **32** | — |

`[QS]` Tổng bộ e2e là **98 spec** ⇒ **32/98 ≈ một phần ba không được CI chạy**. Chúng vẫn chạy tay được (`pnpm test:e2e:r1`…, `package.json:32-40`) — nên phát biểu đúng là *"không job CI nào chạy"*, **không phải** *"không chạy được"*.

`[SĐ]` Đây đúng loại khuyết mà PRD đã gọi tên ở chỗ khác: *"spec cách ly **đường GHI** (235 dòng, đã viết xong) **không có job CI nào chạy**"* (`02-prd:371`). Cùng một hình dạng, ở quy mô lớn hơn.

### TS-HT — kịch bản cho chính hạ tầng test

| Mã | Loại | Kịch bản | Kỳ vọng |
|---|---|---|---|
| **TS-HT-1** | PHỦ ĐỊNH | Cố tình làm đỏ **một** spec trong mỗi thư mục `a0, crm, fl, r1..r7, teacher, smoke-lms, tc` rồi đẩy lên nhánh thử | **Mọi** thư mục phải làm **ít nhất một job CI đỏ**. Thư mục nào CI vẫn xanh = thư mục đó không được ai chạy |
| **TS-HT-2** | BIÊN | Thêm một thư mục spec **mới** không khai vào config nào | CI phải **đỏ** với thông báo *"suite chưa được gán job"* — chứ không im lặng bỏ qua |

**Việc phải làm trước khi viết kịch bản mới:** tạo `tests/e2e/tc/` + `playwright.tc.config.ts` + job CI `e2e-tc`, **và** thêm `**/tc/**` vào `testIgnore` của cấu hình mặc định để không chạy hai lần. Mọi kịch bản dưới đây mặc định đặt ở `tc/` trừ khi ghi khác.

⚠️ **Không đề xuất gộp 32 spec mồ côi vào job chung ngay** — chúng có thể đỏ hàng loạt vì đã lâu không chạy, và việc đó sẽ chôn tín hiệu của chương trình này. Đề xuất: bật từng thư mục một, mỗi lần một PR, ghi lại số spec đỏ. Đó là **dữ liệu**, không phải thất bại.

---

## 3. Chặng 0

### KQ-0.1 — Không còn cách làm sập quyền toàn hệ thống bằng một lệnh seed

| Mã | Loại | Kịch bản | Kỳ vọng | Mẫu số / tiền đề | Chạy ở |
|---|---|---|---|---|---|
| **TS-01-1** | **PHỦ ĐỊNH** ⭐ | Chạy `prisma/seed-roles.ts` **song song** với một luồng gọi `can(actor, action)` liên tục cho một user giữ role đang bị seed | **0 lần** luồng đọc nhận `false` do tập quyền rỗng | ≥ 200 lượt đọc trong khoảng seed; ≥ 2 role có ≥ 5 `RolePermission` | Vitest + DB test local |
| **TS-01-2** | THUẬN | Chạy seed 2 lần liên tiếp | Số `RolePermission` sau lần 1 = sau lần 2 (idempotent) | 14 `RoleDef` | Vitest |
| **TS-01-3** | **PHỦ ĐỊNH** | Ngắt tiến trình seed **giữa chừng** (kill sau khi xoá, trước khi tạo) | Sau khi ngắt, `RolePermission` của mọi role **vẫn nguyên vẹn** — không role nào còn 0 dòng | 14 role | Vitest |
| **TS-01-4** | BIÊN | Seed khi `RolePermission` đang rỗng hoàn toàn | Chạy xong đủ số dòng; không ném lỗi | — | Vitest |

> `[QS]` Vì sao TS-01-1 là ca quan trọng nhất: `prisma/seed-roles.ts:554` `deleteMany` → `:556` `createMany`, grep `$transaction` toàn file = **0 kết quả**; và prod đang enforce v2 (`lib/auth/shadow-compare.ts:27` + cờ ON).
> ⚠️ **Test này phải ĐỎ trước khi vá** — nếu viết xong mà nó xanh ngay, nghĩa là kịch bản chưa tái hiện được khoảng trống, phải sửa kịch bản chứ không phải mừng.

### KQ-0.2 — Đèn nghiệm thu nói được sự thật

| Mã | Loại | Kịch bản | Kỳ vọng | Chạy ở |
|---|---|---|---|---|
| **TS-02-1** | **PHỦ ĐỊNH** ⭐ | Chạy toàn bộ tiêu chí ra của 9 pha làn A trên một DB **rỗng hoàn toàn** | **Mọi** tiêu chí dạng `count = 0` phải trả **"KHÔNG ĐỦ MẪU"**, không được trả "ĐẠT" | Vitest (hàm chấm tiêu chí) |
| **TS-02-2** | THUẬN | Chạy cùng bộ tiêu chí trên DB seed diện rộng | Trả ĐẠT/TRƯỢT có nghĩa, kèm mẫu số ≥ ngưỡng | Vitest |
| **TS-02-3** | BIÊN | Mẫu số **đúng bằng** ngưỡng tối thiểu | Kết luận được, và ghi rõ *"vừa đủ mẫu"* | Vitest |

> Đây là kiểm thử **của tiêu chí**, không phải của tính năng — loại test hiếm nhưng đúng thứ `KB-18` đòi.

### KQ-0.3 — Hai trục dữ liệu ngừng phân kỳ thêm

| Mã | Loại | Kịch bản | Kỳ vọng | Mẫu số | Chạy ở |
|---|---|---|---|---|---|
| **TS-03-1** | **PHỦ ĐỊNH** | Tạo một `Center` **không** có `OrgUnit` trỏ tới | Job CI đối soát **ĐỎ** | ≥ 3 `Center` hợp lệ làm nền | CI job mới |
| **TS-03-2** | **PHỦ ĐỊNH** | Tạo một bản ghi mới có `centerId` và `orgUnitId` **trỏ hai cơ sở khác nhau** | Job đối soát **ĐỎ**, chỉ đích danh model + id | ≥ 5 bản ghi đúng trên cùng model | CI job mới |
| **TS-03-3** | THUẬN | Tạo bản ghi nhất quán cả hai trục | Job **XANH** | 26 model có cả hai trục | CI job mới |
| **TS-03-4** | BIÊN | Bản ghi **cũ** (tạo trước mốc) đang lệch | Job **KHÔNG** đỏ vì bản ghi cũ — chỉ soi bản ghi tạo sau mốc | ≥ 1 bản ghi cũ lệch | CI job mới |

> `[QS]` TS-03-4 tồn tại vì `02-prd:354` chỉ yêu cầu **bản ghi mới** nhất quán; nếu job đỏ vì dữ liệu cũ thì nó sẽ bị tắt trong tuần đầu.

### KQ-0.4 — Bảy ẩn số nền đã thành số

Không phải test phần mềm mà là **kiểm tra quy trình đo**. Vẫn cần kịch bản phủ định vì đo sai còn tệ hơn không đo.

| Mã | Loại | Kịch bản | Kỳ vọng |
|---|---|---|---|
| **TS-04-1** | **PHỦ ĐỊNH** ⭐ | Chạy một trong 7 truy vấn trên **DB dev** thay vì prod | Kết quả phải bị **từ chối ghi nhận** — bảng số bắt buộc có dòng `DB host` và người duyệt đối chiếu. `[QS]` Đây đúng lỗi đã xảy ra thật ngày 29/07 (audit chạy nhầm dev `mqvo…` rồi suýt kết luận) |
| **TS-04-2** | **PHỦ ĐỊNH** | Một truy vấn trả **"không đủ mẫu"** | Ghi vào `04-assumptions.md` là **"CHƯA ĐO ĐƯỢC"**, tuyệt đối không ghi "ĐẠT" |
| **TS-04-3** | THUẬN | 7/7 có bảng số + ĐẠT/TRƯỢT ghi ngày | Đủ điều kiện Đ1 của `04-assumptions.md` §10 |

### KQ-0.5 — Bảy phòng thủ cỡ S đã vào đặc tả

| Mã | Loại | Kịch bản | Kỳ vọng |
|---|---|---|---|
| **TS-05-1** | THUẬN | Đọc lại 7 mã `R-*` liên quan | 7/7 có câu mới, ghi ngày sửa |
| **TS-05-2** | **PHỦ ĐỊNH** | Grep đặc tả tìm câu cũ đã bị thay | **0 kết quả** — không còn bản cũ nằm song song gây hiểu nhầm |

---

## 4. Chặng 1

### KQ-1 — Mỗi chương trình dạy có một chủ sở hữu xác định được

| Mã | Loại | Kịch bản | Kỳ vọng | Mẫu số / tiền đề | Chạy ở |
|---|---|---|---|---|---|
| **TS-11-1** | THUẬN | `resolveClassCurriculum` với lớp có `curriculumId = X` (khoá đã có bản mới hơn) | Trả **X** | — | Vitest |
| **TS-11-2** | THUẬN | Lớp `curriculumId = null`, khoá có v1 ARCHIVED / v2 ACTIVE / v3 DRAFT | Trả **v2** | 3 version | Vitest |
| **TS-11-3** | **PHỦ ĐỊNH** ⭐ | Lớp `curriculumId = null`, khoá **không có** bản ACTIVE | Trả **null**, và `isInFranchiseScope` trả **false** | — | Vitest |
| **TS-11-4** | **PHỦ ĐỊNH** ⭐⭐ | Lớp không giải được chương trình → **kiểm phần TÍNH PHÍ** | Lớp đó **vẫn nằm trong căn cứ tính phí**, chỉ **không** mở màn hình chi tiết. *(Đây là phòng thủ TC-02 — nếu ca này chưa quyết được thì đánh dấu **CHỜ M5**, không viết bừa)* | ≥ 2 lớp không giải được, ≥ 1 đơn vị FRANCHISEE | Vitest + `tc/` |
| **TS-11-5** | **PHỦ ĐỊNH** | Ghép `classId` của lớp thuộc cơ sở khác vào URL chi tiết | **403**, **không** trả JSON rỗng | ≥ 3 lớp thuộc ≥ 2 cơ sở | `tc/` (Playwright) |
| **TS-11-6** | **PHỦ ĐỊNH** | Gọi thẳng API chi tiết bằng `classId` **ngoài phạm vi nhượng quyền** | **Từ chối**, không trả mảng rỗng | ≥ 1 lớp trong phạm vi + ≥ 1 ngoài | `tc/` |
| **TS-11-7** | BIÊN | `count(Curriculum WHERE ownerOrgUnitId IS NULL)` sau backfill | **0** — **kèm tổng số `Curriculum`**; nếu tổng = 0 thì ghi *"chưa nghiệm thu được"* | tổng `Curriculum` ≥ 5 | Vitest |
| **TS-11-8** | **PHỦ ĐỊNH** | Tạo `Curriculum` mới **không** đặt `ownerOrgUnitId` | Bị **từ chối** ở tầng ghi (không phải chỉ cảnh báo) | — | Vitest |

### KQ-2 — Tài liệu giảng dạy không còn phát tán bằng đường link trần

| Mã | Loại | Kịch bản | Kỳ vọng | Mẫu số | Chạy ở |
|---|---|---|---|---|---|
| **TS-12-1** | THUẬN | Giáo viên mở tài liệu của buổi mình dạy | Mở được, `ScormAccessLog` sinh **1** dòng | — | `tc/` |
| **TS-12-2** | **PHỦ ĐỊNH** ⭐ | Dán URL R2 vào trình duyệt **ẩn danh** | **403** | ≥ 5 tài nguyên, ≥ 2 loại | `tc/` |
| **TS-12-3** | **PHỦ ĐỊNH** | Dán URL R2 **đã hết hạn** khi còn đăng nhập | **403**, thông báo phân biệt được *hết hạn* với *không có quyền* | ≥ 2 URL hết hạn | `tc/` |
| **TS-12-4** | **PHỦ ĐỊNH** | Nhân sự cơ sở A mở tài liệu gắn buổi của cơ sở B | **Từ chối** | ≥ 2 cơ sở | `tc/` |
| **TS-12-5** | BIÊN | Mở 100 lượt trong một buổi kiểm thử | `ScormAccessLog` sinh **đúng 100** dòng (không nuốt, không nhân đôi) | 100 lượt | `tc/` |
| **TS-12-6** | BIÊN | Ghi log **lỗi** (DB bận) | Lượt mở **vẫn thành công** hay **bị chặn**? ⚠️ **CHỜ chốt** — fail-open hay fail-closed cho nhật ký chưa ai quyết | — | — |

> ⚠️ TS-12-6 cố ý để trống kỳ vọng. `[SĐ]` Đây là biến thể của đúng lỗi `lib/auth/shadow-report.ts` fire-and-forget nuốt lỗi. Không tự chọn — cần Đội Đào tạo HO + Kiệt.

### KQ-3 — Học bù chỉ còn trong nội bộ một cơ sở

| Mã | Loại | Kịch bản | Kỳ vọng | Mẫu số | Chạy ở |
|---|---|---|---|---|---|
| **TS-13-1** | THUẬN | Xếp bù trong **cùng** cơ sở | Thành công | ≥ 2 buổi ứng viên | `tc/` |
| **TS-13-2** | **PHỦ ĐỊNH** ⭐ | Gọi gợi ý bù cho học viên CS1 | Danh sách **không chứa buổi nào của CS2** | ≥ 3 buổi hợp lệ ở CS2 *(nếu CS2 không có buổi nào thì ca này **vô nghĩa** — phải seed)* | `tc/` |
| **TS-13-3** | **PHỦ ĐỊNH** ⭐ | Nhân sự CS1 gọi thẳng API đọc `Class`/`ClassSession`/`Lesson`/`MakeupNeed` của CS2 | **Từ chối** cả 4 model | 4 model × ≥ 1 bản ghi CS2 | `tc/` |
| **TS-13-4** | **PHỦ ĐỊNH** ⭐ | Giả lập **lỗi đọc** cấu hình `makeup.crossCenterEnabled` | Cross-center **TẮT** (fail-closed) **và** UI hiện cảnh báo *"lỗi cấu hình"* — phân biệt với *"chưa cấu hình"* | — | Vitest |
| **TS-13-5** | **PHỦ ĐỊNH** ⭐⭐ | Cơ sở **đã từng bật** override `makeup.crossCenterEnabled = true` từ trước, rồi chạy bản vá đổi `default` | Sau vá, cơ sở đó **vẫn tắt** cross-center. *(Phòng thủ TC-09 — `[QS]` `centerOverridable: true` ở `lib/settings/registry.ts:490` cho override sống độc lập với `default`)* | ≥ 1 override tồn tại trước khi vá | Vitest + `tc/` |
| **TS-13-6** | **PHỦ ĐỊNH** | Grep `MAKEUP_EXCEPTION` sau khi gỡ | **0 kết quả** trong `lib/` và `app/` | — | CI |
| **TS-13-7** | **PHỦ ĐỊNH** (hồi quy) ⭐ | Chạy lại `tests/e2e/r7/makeup-cross-center.spec.ts` | **3 ca khẳng định chéo cơ sở phải ĐỎ hoặc đã bị xoá.** Nếu chúng **xanh** = ngoại lệ đã quay lại (KB-09 / TC-13) | 3 ca | `e2e-r7` |
| **TS-13-8** | BIÊN | Đếm học viên có buổi vắng **không được bù** trong N ngày, theo cơ sở | So với mốc nền đo ở `R-QDC-05`; tăng đột biến = nhu cầu chảy ra ngoài | mốc nền phải đo **trước** khi gỡ | truy vấn định kỳ |

> ⚠️ **TS-13-7 là ca ngược đời có chủ đích:** nó **mong test cũ ĐỎ**. Ghi rõ trong mô tả spec, nếu không người trực CI sẽ "sửa cho xanh" — đúng kịch bản `KB-09`.

### KQ-4 — Cấu hình khai được ở nhiều mức, kế thừa lên cha

| Mã | Loại | Kịch bản | Kỳ vọng | Mẫu số | Chạy ở |
|---|---|---|---|---|---|
| **TS-14-1** | THUẬN | Đặt khoá ở đơn vị **cha**, đọc từ 2 cơ sở con | Cả 2 đọc ra giá trị của cha | ≥ 2 khoá, ≥ 2 nhóm cấu hình | Vitest |
| **TS-14-2** | THUẬN | Cơ sở con đặt giá trị riêng | Con **thắng** cha | — | Vitest |
| **TS-14-3** | **PHỦ ĐỊNH** | Đọc khoá **không** `centerOverridable` từ cơ sở con | Luôn trả giá trị toàn cục, **không** cho override — kể cả khi DB có dòng override | ≥ 1 khoá không overridable + 1 dòng override cố tình | Vitest |
| **TS-14-4** | BIÊN | Cây sâu **3 tầng** (ROOT → vùng → cơ sở), chỉ ROOT có giá trị | Cơ sở đọc được giá trị của ROOT (leo **quá 2 tầng**) | 3 tầng | Vitest |
| **TS-14-5** | **PHỦ ĐỊNH** | Node cha bị xoá mềm giữa chừng | Con đọc ra giá trị nào? ⚠️ **CHỜ** — `c3` (đóng cơ sở thì node xử lý ra sao) chưa trả lời | — | — |

> `[QS]` TS-14-4 tồn tại vì hiện kế thừa là **2 tầng phẳng, không leo lên cha** (`01-intended:122`) ⇒ có tầng vùng thì mức "vùng" **không tồn tại**.

### KQ-5 — Nhân sự một nguồn sự thật, người dạy được gán đúng luật

| Mã | Loại | Kịch bản | Kỳ vọng | Mẫu số | Chạy ở |
|---|---|---|---|---|---|
| **TS-15-1** | THUẬN | Gán GV **biên chế cùng cơ sở** vào lớp | Thành công | — | Vitest + `tc/` |
| **TS-15-2** | THUẬN | Gán GV **kiêm nhiệm còn hạn** trỏ tới cơ sở của lớp | Thành công | ≥ 1 kiêm nhiệm còn hạn | Vitest |
| **TS-15-3** | **PHỦ ĐỊNH** ⭐ | Gán GV kiêm nhiệm **đã hết hạn** | **Từ chối** | ≥ 1 kiêm nhiệm hết hạn | Vitest |
| **TS-15-4** | **PHỦ ĐỊNH** ⭐ | Gán người **không giữ vai trò giảng dạy** | **Từ chối**. ⚠️ Danh sách mã vai trò giảng dạy phải chốt trước (**c17** — `TRAINING` có tính không?) | danh sách mã đóng | Vitest |
| **TS-15-5** | **PHỦ ĐỊNH** ⭐ | Gán GV **cơ sở khác**, không có nguồn phái sinh nào trỏ tới cơ sở của lớp | **Từ chối** | ≥ 2 cơ sở | Vitest + `tc/` |
| **TS-15-6** | THUẬN | GV biên chế **HO** gán vào lớp cơ sở (HO là tổ tiên) | **Thành công** — đây là vế "nới" của `R-D3-10` | cây ≥ 2 tầng | Vitest |
| **TS-15-7** | **PHỦ ĐỊNH** (chống tách) ⭐⭐ | Chạy **cả 6 ca trên trong MỘT bộ test duy nhất** | Bộ test phải nằm **một file**. Nếu có PR tách thành hai file/hai mã → CI cảnh báo | 6 ca | Vitest |
| **TS-15-8** | BIÊN | Nhân viên có **2 bản ghi PRIMARY** cùng lúc | **Từ chối** ở tầng ghi. `[QS]` Hiện **không có unique chống 2 PRIMARY** (`01-intended:119`) | — | Vitest |
| **TS-15-9** | BIÊN | Gọi API gán qua giao diện **và** qua đường server action | Cả hai đường **cùng luật**. `[QS]` Có ≥ 3 bề mặt (`R-D3-10`) | 3 bề mặt | `tc/` |

> ⚠️ **TS-15-7 là kịch bản bảo vệ quy trình, không phải bảo vệ chức năng.** `[QS]` `R-D3-10` được gộp từ `R-D8-10` vì hai mã sửa **cùng một hàm gác theo hai hướng ngược nhau** (`02-prd:366-367`); tách lại là đúng kịch bản `KB-11`.

### KQ-6 — Hàm cắt quyền theo nguồn: có, đã kiểm, chưa nối

| Mã | Loại | Kịch bản | Kỳ vọng | Chạy ở |
|---|---|---|---|---|
| **TS-16-1** | THUẬN | Gọi hàm với nguồn **biên chế** đã kết thúc | Trả danh sách quyền phải thu hồi, đúng và đủ | Vitest |
| **TS-16-2** | THUẬN | Nguồn **kiêm nhiệm** hết hạn | Như trên, chỉ thu hồi phần phái sinh từ nguồn đó | Vitest |
| **TS-16-3** | **PHỦ ĐỊNH** ⭐⭐ | Grep call-site production của hàm | **0 kết quả.** Đây là ca phủ định **quan trọng nhất** của KQ-6: nối sớm = đổi hành vi quyền trên prod, tức **Cờ 1 = CÓ** mà chưa ai duyệt | CI |
| **TS-16-4** | **PHỦ ĐỊNH** | Người có **2 nguồn**, cắt **1** nguồn | Chỉ mất quyền của nguồn bị cắt, **giữ** quyền của nguồn còn lại | Vitest |
| **TS-16-5** | BIÊN | Cắt nguồn cho người **không có quyền nào** | Trả rỗng, **không** ném lỗi | Vitest |

### KQ-7 — Hợp đồng nhượng quyền có chỗ lưu, không nhầm chiều

| Mã | Loại | Kịch bản | Kỳ vọng | Mẫu số | Chạy ở |
|---|---|---|---|---|---|
| **TS-17-1** | THUẬN | Tạo hợp đồng đúng chiều (`franchisorOrgId` = HO, `franchiseeOrgId` = cơ sở) | Thành công | — | Vitest |
| **TS-17-2** | **PHỦ ĐỊNH** ⭐ | Nhập **đảo chiều** | **CHECK constraint chặn** ở tầng DB, không chỉ validate ở form | — | Vitest |
| **TS-17-3** | **PHỦ ĐỊNH** ⭐ | `franchisorOrgId` = `franchiseeOrgId` (tự trỏ chính mình) | **Chặn** | — | Vitest |
| **TS-17-4** | **PHỦ ĐỊNH** | Thiếu một vế | **Chặn** | — | Vitest |
| **TS-17-5** | **PHỦ ĐỊNH** | Đổi trạng thái hợp đồng **không nhập lý do** | **Không gửi được** (`R-D9-08`) | ≥ 3 trạng thái | `tc/` |
| **TS-17-6** | BIÊN | Ô chọn "bên nhận" liệt kê đơn vị nào | ⚠️ **CHỜ c1** — chưa chốt node bên nhận là `type=CENTER` hay `FRANCHISE` thì không viết được kỳ vọng | — | — |

> TS-17-6 cố ý bỏ trống. Viết kỳ vọng bây giờ = đoán, và đoán sai thì test sẽ **khoá cứng lựa chọn sai** vào CI.

---

## 5. Kịch bản phủ định dùng chung — áp cho MỌI kết quả

Bảy ca dưới đây không thuộc riêng kết quả nào; chúng là **bộ khuôn** phải áp mỗi khi thêm một màn hình hay một API trong chương trình này.

| Mã | Kịch bản | Kỳ vọng | Vì sao có |
|---|---|---|---|
| **TS-X-1** | Actor cơ sở A **ĐỌC** bản ghi cơ sở B | Không thấy | Cách ly cơ bản |
| **TS-X-2** | Actor cơ sở A **GHI/SỬA/XOÁ** bản ghi cơ sở B qua API trực tiếp | **Từ chối** | `[QS]` `scopedDb` **chỉ auto-scope READ**; mọi `update/delete` phải tự `passesScope` (`CLAUDE.md`). Đây là lớp thường bị bỏ sót |
| **TS-X-3** | Gọi API bằng `id` ngoài phạm vi | **403**, **không** trả rỗng | `R-D10-04` đòi tường minh (`02-prd:294`) |
| **TS-X-4** | Tạo bản ghi trên model thuộc `SCOPED_MODELS` mà **không** đặt `centerId` | **Từ chối** ở tầng ghi | `[QS]` `lib/db-scope.ts:254` chặn `centerId` null ⇒ quên đặt = **bản ghi vô hình với chính người tạo** |
| **TS-X-5** | Chọn đơn vị là node **không mang `centerId`** (HO/CAMPUS/PARTNER/FRANCHISE/REGION) rồi tạo bản ghi | Ô chọn **không được liệt kê** các loại đó, hoặc tầng ghi **từ chối** | `[QS]` `DEFAULT_SELECTABLE_TYPES` gồm 5 loại, **4/5 cho `centerId` null** (`lib/org/org-tree.ts:128-134` + `orgunit-rules.ts:59-62`). QĐ-A còn cấm `REGION` lọt vào (`QUYET-DINH.md:32`) |
| **TS-X-6** | Chạy lại **hai lần** mọi lệnh backfill/seed của chương trình | Kết quả lần 2 = lần 1 | Idempotent |
| **TS-X-7** | Tạo `UserPermissionGrant` với `grant = DENY` | ⚠️ Phải **chặn ở UI/tầng ghi** cho tới khi `can()` v2 có nhánh DENY | `[QS]` `lib/auth/can.ts:36-44` ALLOW-wins thuần, `grantsDeny` không tồn tại ⇒ DENY hiện **vô hiệu im lặng**. Prod đang **0 grant**, nên chặn bây giờ là **rẻ nhất** |

---

## 6. Cái không kiểm được hôm nay

1. **Phần lớn kịch bản không chạy được trên prod** — 41 Lead / 2 Student / 1 Employee không đủ mẫu cho gần như mọi ca. `[QS]` Repo đã có bộ seed diện rộng cho DB test; **mọi kịch bản trong file này mặc định chạy trên DB test local**, đúng `.claude/rules/prisma-db.md`.
2. **TS-11-4** (lớp không giải được chương trình thì tính phí thế nào) **chờ M5**.
3. **TS-12-6** (nhật ký lỗi thì chặn hay cho qua) **chờ Đội Đào tạo HO + Kiệt**.
4. **TS-14-5** (node cha bị xoá mềm) **chờ c3**.
5. **TS-17-6** (ô chọn bên nhận) **chờ c1**.
6. **TS-15-4** cần **c17** (danh sách mã vai trò giảng dạy) mới viết được kỳ vọng chính xác.
7. **Không có kịch bản nào cho làn B** — theo chỉ đạo, và vì điều kiện khởi động của làn B hiện không định nghĩa được (M2).

---

## 7. Truy vết

| Kết quả | Số kịch bản | Trong đó PHỦ ĐỊNH | Ca ⭐ (không được bỏ) |
|---|---|---|---|
| Hạ tầng test | 2 | 1 | TS-HT-1 |
| KQ-0.1 | 4 | 2 | **TS-01-1** |
| KQ-0.2 | 3 | 1 | TS-02-1 |
| KQ-0.3 | 4 | 2 | — |
| KQ-0.4 | 3 | 2 | TS-04-1 |
| KQ-0.5 | 2 | 1 | — |
| KQ-1 | 8 | 5 | TS-11-3, **TS-11-4** |
| KQ-2 | 6 | 3 | TS-12-2 |
| KQ-3 | 8 | 6 | TS-13-2, TS-13-3, TS-13-4, **TS-13-5**, **TS-13-7** |
| KQ-4 | 5 | 2 | — |
| KQ-5 | 9 | 4 | TS-15-3, TS-15-4, TS-15-5, **TS-15-7** |
| KQ-6 | 5 | 2 | **TS-16-3** |
| KQ-7 | 6 | 4 | TS-17-2, TS-17-3 |
| Dùng chung | 7 | 7 | TS-X-2, TS-X-4, TS-X-7 |
| **Tổng** | **72** | **42** | **22** |

**42/72 là kịch bản phủ định** (18 THUẬN · 12 BIÊN) — đúng yêu cầu của chương trình, và tỉ lệ đó phản ánh đúng bản chất: chương trình này chủ yếu đang **đóng lỗ**, không phải mở tính năng. **22 ca ⭐ là tập tối thiểu không được bỏ** — nếu công suất chỉ đủ cho một phần, làm 22 ca này trước.

*(Bốn phép đếm trên đã chạy lại trên chính các bảng §3–§5.)*

**Kiểm chứng.** Mọi `đường-dẫn:số-dòng` đã mở lại bằng Read/Grep trước khi viết. Số liệu hạ tầng test của vòng này, tự đếm hôm nay: `playwright.config.ts:8` `testDir` · `:20` `testIgnore` 5 nhóm · **14** file `playwright.*.config.ts` · **98** spec e2e · **121** file `*.test.ts` · **4** job e2e chuyên biệt trong `.github/workflows/ci.yml` (`:191`, `:262`, `:328`, `:392`) · **32** spec thuộc 7 thư mục vừa bị `testIgnore` loại vừa không có job riêng (`r1` 12 · `r6` 10 · `r3` 3 · `crm` 2 · `r2` 2 · `r4` 2 · `r5` 1).

---

Bước này không sửa bất kỳ file nào khác ngoài E:/satarobo-vn/docs/taicautruc/08-test-scenarios.md.
