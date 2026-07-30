# BƯỚC 7 — Lộ trình theo kết quả, dừng ở ranh giới đang bị chặn

> Ngày 29/07/2026 · phạm vi **BƯỚC 7** · nguồn: `02-prd-franchise-platform.md` (112 yêu cầu, §8 hai làn) · `QUYET-DINH.md` · `04-assumptions.md` (§0 + §9 + §10) · `05-premortem.md` (§8, §10) · `06-redteam.md` (§6, §8) · **mã nguồn repo** · số đo PROD 29/07/2026.
>
> **Phương pháp.** Lộ trình theo **kết quả** (outcome), không theo tính năng: mỗi chặng phát biểu *"ai được gì"* và *"biết là xong bằng cách nào"*, rồi mới liệt kê mã `R-*` phục vụ nó. Mã `R-*` là **phương tiện**, có thể đổi; kết quả là **cam kết**, không đổi.
> ⚠️ Skill `pm-execution:outcome-roadmap` **không có trong máy này** — áp phương pháp chuẩn, không theo khuôn skill.
>
> **Luật riêng của vòng này (theo chỉ đạo):** lộ trình **chỉ lập tới ranh giới đang bị chặn rồi DỪNG**. Không lập lịch cho phần nằm sau các chốt chưa gỡ, **không** giả định chúng sẽ được gỡ, **không** đề xuất cách gỡ thay người có thẩm quyền. §6 ghi ranh giới đó ở đâu và ai mở được.
>
> **Không dùng ngày tuyệt đối** — giữ nguyên nguyên tắc của `02-prd:395`. Chặng nối nhau bằng **điều kiện vào/ra**, không bằng lịch.

---

## 1. Cách đọc

| Ký hiệu | Nghĩa |
|---|---|
| `KQ-N` | Mã kết quả. Phát biểu theo **thay đổi quan sát được**, không theo việc đã làm |
| `[QS]` / `[SĐ]` | Quan sát có `file:dòng` / suy đoán |
| **Cờ 1** | Đụng shadow-compare (đổi giá trị hàm quyền động trên dữ liệu đang có) — `02-prd:362` |
| **Cờ 2** | Đụng phạm vi dữ liệu (đổi tập bản ghi một tài khoản đọc được) — `02-prd:364`; đây là cờ **nói chuyện với đợt security hardening** |

**Mọi chỉ số trong file này phải có mẫu số.** Đây là hệ quả trực tiếp của `KB-18` (`05-premortem.md`): prod hiện có **41 Lead · 2 Student · 1 Employee · 25 `UserOrgRole`**, nên tiêu chí dạng `count = 0` **xanh vì rỗng**, không phải vì đúng. Chỉ số nào không ghi được mẫu số thì ghi thẳng *"chưa nghiệm thu được, chỉ là chưa thấy hỏng"*.

**Và mọi chỉ số phải có nguồn mà bên bị đo không kiểm soát** — luật đề xuất ở `06-redteam.md` §5. Chỉ số vi phạm luật này được đánh dấu ⚠️ ngay tại chỗ.

---

## 2. Ranh giới — cái gì lập lịch được hôm nay

| | Lập lịch được? | Vì sao |
|---|---|---|
| **Chặng 0** — 11 việc từ BƯỚC 5 §8 và BƯỚC 6 §6 | ✅ **Được, và phải làm trước** | Không việc nào nằm trong 112 yêu cầu; tất cả **Cờ 1 = KHÔNG**, chỉ 2 việc **Cờ 2 = CÓ** |
| **KQ-1 → KQ-6** (tương ứng làn A pha A2, A9, A3, A8, A5, A7) | ✅ Được | Không chạm đường tạo `OrgUnit`, không chạm `isHoLevel` |
| **KQ-7** (làn A pha A6 — hợp đồng nhượng quyền) | 🟡 **Một phần** | Bảng + ràng buộc làm được; ô chọn "bên nhận" **chờ c1** |
| **Làn A pha A1** (gói cổng tạo cơ sở) và **pha A4** (cây tổ chức) | 🔴 **KHÔNG** | Vướng **c43** — xem §6.1 |
| **Toàn bộ làn B** (B1→B7) | 🔴 **KHÔNG** | Điều kiện khởi động *"sau khi cửa sổ shadow đóng"* **không còn định nghĩa được** (M2) |

> ⚠️ **Điều cần nói thẳng ngay đầu:** §8 của PRD gọi gói cổng tạo cơ sở (`R-D2-16+17+18`) là **"chặn cứng số một của toàn chương trình"** (`02-prd:399-401`) và là việc phải làm *nếu chỉ làm được một việc*. **Chính việc đó đang nằm sau ranh giới.** Lộ trình dưới đây vì thế **không** dẫn tới đích của chương trình — nó dẫn tới **ranh giới**, và mọi thứ sau ranh giới phụ thuộc một chữ ký, không phụ thuộc công sức kỹ thuật.

---

## 3. Chặng 0 — làm trước khi chương trình bắt đầu

**Kết quả chặng:** *hệ thống không còn cách tự làm hỏng mình trong lúc chương trình chạy, và đèn nghiệm thu nói được sự thật.*

Không việc nào ở đây thuộc 112 yêu cầu của PRD. Cả 11 việc đều **Cờ 1 = KHÔNG**; hai việc **Cờ 2 = CÓ**.

### KQ-0.1 — Không còn cách làm sập quyền toàn hệ thống bằng một lệnh seed

- **Ai được gì:** người trực vận hành chạy được `seed-prod-roles.yml` mà không phải chọn giờ thấp điểm.
- **Việc:** bọc `prisma/seed-roles.ts` trong `$transaction` (hoặc đổi `deleteMany`+`createMany` → `upsert` theo action) · sửa header `.github/workflows/seed-prod-roles.yml:10-13` cho khớp hiện trạng cờ.
- **Biết là xong bằng:** một test chạy seed **song song** với một luồng đọc quyền liên tục → **0 lần** luồng đọc thấy tập quyền rỗng. Mẫu số: ≥ 200 lượt đọc trong lúc seed.
- **Bằng chứng vì sao cần:** `[QS]` `prisma/seed-roles.ts:554` `deleteMany` → `:556` `createMany`, grep `$transaction` toàn file = **0 kết quả**; `[QS]` runbook `:10-11` vẫn ghi *"RBAC_V2 OFF nên seed này KHÔNG đổi hành vi"* — câu đó hết hạn lúc flip.
- **Cỡ:** S · **Cờ 1:** KHÔNG · **Cờ 2:** KHÔNG · **Chủ:** Luân · **Chặn:** KB-06.

### KQ-0.2 — Đèn nghiệm thu nói được sự thật

- **Ai được gì:** người duyệt pha đọc đèn xanh mà biết nó nghĩa là gì.
- **Việc:** mỗi tiêu chí dạng `count(...) = 0` trong §8 phải **ghi kèm mẫu số** và **ngưỡng tối thiểu**; thêm câu luật *"xanh trên tập nhỏ = CHƯA nghiệm thu, chỉ là chưa thấy hỏng"*.
- **Biết là xong bằng:** duyệt lại **9/9 pha làn A**, mỗi pha có ít nhất một tiêu chí ghi rõ mẫu số. Đếm được, không cần diễn giải.
- **Cỡ:** S · **Cờ 1/2:** KHÔNG · **Chủ:** Kiệt + người duyệt pha · **Chặn:** KB-18.

### KQ-0.3 — Hai trục dữ liệu ngừng phân kỳ thêm

- **Ai được gì:** người viết tính năng mới không phải đoán trục nào đúng.
- **Việc:** thêm **truy vấn đối soát vào CI** — (a) `Center` không có `OrgUnit` trỏ tới = 0; (b) bản ghi **tạo mới** lệch hai trục trên 26 model = 0.
- **Biết là xong bằng:** CI có job chạy 2 truy vấn này; cố tình tạo 1 bản ghi lệch → job **đỏ**.
- **Bằng chứng:** `[QS]` `02-prd:354` chỉ *yêu cầu* bản ghi mới nhất quán — không constraint, không test, không lint.
- **Cỡ:** S · **Cờ 1/2:** KHÔNG · **Chủ:** Kiệt · **Chặn:** KB-02, KB-04.

### KQ-0.4 — Bảy ẩn số nền đã thành số

- **Ai được gì:** BƯỚC 5, 6 và mọi bước sau ngừng phải viết `[SĐ]` ở chỗ lẽ ra phải là `[QS]`.
- **Việc:** chạy 7 truy vấn chỉ-đọc đã thiết kế sẵn ở `04-assumptions.md` §7 — `GD-28` (bản ghi tiền sai cơ sở) · `GD-46` (lệch hai trục 26 model) · `GD-59` (lệch `User.centerId` ↔ hồ sơ) · `GD-06` (sàn nhiễu doanh thu CS1/CS2) · `GD-24` (phân bố lượt mở SCORM) · `GD-50` (khoá duy nhất toàn cục) · `GD-61` (bề mặt `isHoLevel`).
- **Biết là xong bằng:** **7/7** có bảng số + kết luận ĐẠT/TRƯỢT ghi ngày, dán vào `04-assumptions.md`.
- ⚠️ **Cảnh báo mẫu số:** `GD-06` tự đặt điều kiện *"chỉ kết luận khi ≥ 30 enrollment/cơ sở"* và `GD-24` *"≥ 200 dòng nhật ký"*. Prod hiện **2 học viên** ⇒ `[SĐ]` phần lớn 7 thí nghiệm sẽ trả về **"không đủ mẫu"**, không phải "đạt". **Đó vẫn là kết quả hợp lệ và cần ghi lại** — nó chuyển câu hỏi từ *"số bao nhiêu"* sang *"chưa đo được, phải chờ dữ liệu thật"*, và đó là thông tin quyết định lịch.
- **Cỡ:** S mỗi cái · **Cờ 1/2:** KHÔNG (phép đo) · **Chủ:** Kiệt (5) · Luân (1) · Vy (`GD-26`).

### KQ-0.5 — Bảy phòng thủ cỡ S của red-team đã vào yêu cầu

- **Ai được gì:** các tuyến tấn công rẻ nhất bị bịt trước khi ai đi qua.
- **Việc (7):** lớp không giải được chương trình **vẫn tính phí** (TC-02) · `R-QDC-01` **xoá override cấp cơ sở** (TC-09) · ngưỡng ẩn danh áp ở **mức đơn vị/kỳ** + thêm chỉ số "số lớp dưới ngưỡng" (TC-04) · canary `R-D10-09` có **tên người** + thông báo tự giải thích (TC-06) · cờ tắt `R-D10-10` **chỉ người ký `R-D4-09`** được mở (TC-07) · tách *"thiếu cấu hình"* khỏi *"lỗi đọc"* trong `R-QDC-02` (TC-12) · sửa số dòng đã trôi trong QĐ-C (TC-11 — **cần người giữ sổ quyết định**, xem M7).
- **Biết là xong bằng:** 7/7 đã sửa vào **văn bản yêu cầu** (chưa cần code). Đây là chặng sửa **đặc tả**, không phải chặng thi công.
- **Cỡ:** S · **Cờ 1:** KHÔNG · **Cờ 2:** CÓ ở 2 việc (xoá override cấp cơ sở; ngưỡng ẩn danh mức đơn vị) · **Chủ:** Kiệt + Luân, riêng M7 cần người giữ sổ.

---

## 4. Chặng 1 — sáu kết quả lập lịch được ngay

Thứ tự dưới đây theo **đòn bẩy giảm dần**, không theo thứ tự bắt buộc, trừ chỗ ghi rõ.

### KQ-1 — Mỗi chương trình dạy có một chủ sở hữu xác định được

> `[QS]` `01-intended-vs-implemented.md:141` gọi đây là *"chi phí nhỏ nhất, đòn bẩy lớn nhất trong 12 quyết định"* — một trường mở khoá đồng thời **D8** và **toàn bộ chuỗi suy diễn của D10**.

- **Ai được gì:** Đội Đào tạo HO trả lời được câu *"chương trình này của ai"* mà không phải hỏi người khác; nhánh D10 có mắt xích cuối.
- **Yêu cầu phục vụ:** `R-D8-01` (`Curriculum.ownerOrgUnitId` + backfill về HO) · `R-D10-02` (`resolveClassCurriculum`) · `R-D10-03` (`isInFranchiseScope`) · `R-D8-04` · `R-D8-05` · `R-D8-06` · `R-CONST-01`.
- **Biết là xong bằng:**
  - `count(Curriculum WHERE ownerOrgUnitId IS NULL) = 0` — **mẫu số: tổng số `Curriculum`**, phải ghi kèm.
  - Ghép `classId` của lớp khác vào URL → **403**, không phải trả rỗng. Mẫu số: ≥ 3 lớp thuộc ≥ 2 cơ sở khác nhau.
  - `resolveClassCurriculum` qua đủ 3 ca của `02-prd:292` (có `curriculumId`; null + có bản ACTIVE; null + không có ACTIVE).
- **Điều kiện vào:** không có. **Điều kiện ra:** ba tiêu chí trên.
- **Cờ 1:** KHÔNG · **Cờ 2:** KHÔNG *(thêm cột + hàm thuần; chưa đổi tập bản ghi ai đọc được)*
- **Chủ:** Kiệt (LMS) + Đội Đào tạo HO (nội dung backfill).
- ⚠️ **Kèm theo, từ red-team:** `R-D10-03` fail-closed **đi ngược mục tiêu giám sát** (M5, TC-02). KQ-1 vẫn làm được, nhưng **phần "lớp không giải được thì tính phí thế nào" phải chờ M5** — xem §6.1.

### KQ-2 — Tài liệu giảng dạy không còn phát tán bằng đường link trần

- **Ai được gì:** HO giữ được quyền kiểm soát học liệu khi có pháp nhân thứ hai; giáo viên không đổi thao tác.
- **Yêu cầu phục vụ:** `R-D8-08` · `R-D8-11`.
- **Biết là xong bằng:** dán URL R2 vào trình duyệt ẩn danh → **403**. Mẫu số: ≥ 5 tài nguyên thuộc ≥ 2 loại (SCORM, tài liệu). Cộng: `ScormAccessLog` sinh dòng cho **100%** lượt mở trong một buổi kiểm thử có chủ đích.
- **Cờ 1:** KHÔNG · **Cờ 2:** **CÓ** — `[QS]` §8 tự ghi *"Đụng đợt security hardening: A9"* (`02-prd:423`) ⇒ **phải điều phối lịch**, và hiện **chưa có tài liệu phạm vi của đợt hardening** (**c31** treo).
- **Chủ:** Kiệt.
- ⚠️ `R-D8-11` chưa chốt độ hạt (§9 câu 10: mỗi lượt mở gói hay mỗi tài nguyên con) và chưa chốt **trục cơ sở** (**c40**) — thêm trục sau là **backfill lại toàn bảng**. Nên chốt **trước khi viết**, không phải sau.

### KQ-3 — Học bù chỉ còn trong nội bộ một cơ sở, và ta vẫn biết nhu cầu chảy đi đâu

- **Ai được gì:** ranh giới dữ liệu giữa hai cơ sở không còn lỗ khoét sẵn; quản lý vẫn nhìn thấy nhu cầu bù chưa được đáp ứng.
- **Yêu cầu phục vụ:** `R-QDC-05` → `R-QDC-01` → `R-QDC-02` → `R-QDC-03` → `R-QDC-04` *(thứ tự này bắt buộc — QĐ-C `:69` đòi 3 điểm làm **cùng lúc**, và `R-QDC-05` là bước rà dữ liệu tồn phải đi trước)*.
- **Biết là xong bằng:**
  - `grep MAKEUP_EXCEPTION` = 0 **và** bộ test mới **khẳng định chéo cơ sở bị CHẶN** *(không phải "test cũ vẫn xanh" — xem M3)*.
  - Số bản ghi override `makeup.crossCenterEnabled` cấp cơ sở còn lại = 0. **Mẫu số: số override tồn tại trước khi sửa** *(nếu mẫu số = 0 thì tiêu chí này vô nghĩa, phải ghi rõ)*.
  - ⚠️ **Chỉ số thay thế cho `R-QDC-04`:** đếm **học viên có buổi vắng không được bù trong N ngày**, tách theo cơ sở, so với mốc nền đo ở `R-QDC-05`. Đây là nguồn **bên bị đo không kiểm soát** — thay cho việc đếm ca tự khai, vốn sẽ đọc 0 (TC-10).
- **Cờ 1:** KHÔNG · **Cờ 2:** **CÓ** *(gỡ ngoại lệ = đổi tập bản ghi nhân sự cơ sở đọc được)*
- **Chủ:** Kiệt + Luân.
- **Chặn một phần:** **M6** — tiêu chí nghiệm thu `R-QDC-01` hiện chỉ phủ *"cơ sở chưa cấu hình gì"*; phải sửa tiêu chí **trước** khi bắt đầu. M6 do Kiệt + Luân quyết, **không cần Ban** ⇒ không phải ranh giới cứng.

### KQ-4 — Cấu hình và danh mục khai được ở nhiều mức, kế thừa lên cha

- **Ai được gì:** mở cơ sở mới không phải nhập lại toàn bộ danh mục; đặt một khoá ở cấp vùng thì các cơ sở con đọc được.
- **Yêu cầu phục vụ:** `R-D6-01..13`.
- **Biết là xong bằng:** đặt một khoá ở đơn vị cha → **2 cơ sở con** đọc ra giá trị của cha. Mẫu số: ≥ 2 khoá thuộc ≥ 2 nhóm cấu hình khác nhau. Cộng: `[QS]` hiện **18/45 khoá** là `centerOverridable` (`01-intended:122`) — ghi lại con số sau khi sửa để thấy độ phủ đổi bao nhiêu.
- **Cờ 1:** KHÔNG · **Cờ 2:** KHÔNG.
- **Chủ:** Kiệt.
- 🔴 **Vướng ranh giới một phần:** `[QS]` §8 xếp `R-D2-09` và `R-D2-10` vào **pha A8** (`02-prd:420`) **và đồng thời** vào **B4** (`:433`). **Cùng hai mã ở cả hai làn** — mâu thuẫn nội bộ, ghi ở §6.1 (M8). Phần `R-D6-*` thuần cấu hình **không** vướng và làm được ngay; phần `R-D2-09/10` **dừng lại chờ**.

### KQ-5 — Nhân sự có một nguồn sự thật, và người dạy được gán đúng luật

- **Ai được gì:** HR nhập một chỗ; người xếp lớp không gán nhầm giáo viên ngoài cơ sở; điều động có đường tạo chính thức.
- **Yêu cầu phục vụ:** `R-D3-04` · `R-D3-05` · `R-D3-06` · `R-D3-01` · `R-D3-09` · **`R-D3-10`**.
- **Biết là xong bằng:** bộ test bảng **6 ca** xanh; `createAssignment` có **≥ 1 call-site production** *(hiện `[QS]` **0 call-site** — `01-intended:119`)*. Mẫu số cho ca gán giáo viên: ≥ 2 cơ sở, ≥ 1 ca kiêm nhiệm còn hạn, ≥ 1 ca hết hạn.
- **Cờ 1:** KHÔNG *(§7.3 chốt: phần lớn D3 viết + test xong được trong lúc cửa sổ còn mở, chỉ hoãn bước nối vào đường chạy thật)* · **Cờ 2:** **CÓ** ở `R-D3-10` *(đổi tập giáo viên chọn được)*.
- **Chủ:** Luân + Vy (UI).
- ⚠️ `R-D3-10` là mã **đã gộp từ `R-D8-10`** vì hai mã sửa **cùng một hàm gác theo hai hướng ngược nhau** (`02-prd:366-367`). **Không được tách lại khi chia việc** — đây đúng là kịch bản `KB-11`.
- ⚠️ Cần trả lời **c17** (*danh sách mã vai trò nào được coi là "vai trò giảng dạy"; `TRAINING` có nằm trong đó không*) trước khi viết tiêu chí nghiệm thu — không có danh sách thì cả phép đếm lẫn tiêu chí đều không chạy được.

### KQ-6 — Có hàm cắt quyền theo nguồn, đã kiểm chứng, chưa nối vào đường chạy

- **Ai được gì:** khi ranh giới được gỡ, việc bật lên là một thao tác nối dây, không phải một đợt viết mới.
- **Yêu cầu phục vụ:** `R-D3-02`, ở dạng *"có hàm, chưa có nơi gọi"*.
- **Biết là xong bằng:** test đơn vị xanh **và** grep: **0 call-site production**. Đây là tiêu chí hiếm hoi **không cần mẫu số** vì nó đo mã nguồn, không đo dữ liệu.
- **Cờ 1:** KHÔNG — `[QS]` đúng định nghĩa `02-prd:362`: *"thêm hàm mới mà chưa có nơi gọi → KHÔNG đụng"*. · **Cờ 2:** KHÔNG.
- **Chủ:** Luân.
- **Ghi chú:** đây là kết quả **cố ý dừng nửa chừng**. Giá trị của nó là **rút ngắn thời gian sau khi ranh giới được gỡ**, không phải giá trị dùng ngay.

### KQ-7 *(một phần)* — Hợp đồng nhượng quyền có chỗ lưu và không nhầm chiều

- **Ai được gì:** Ban và kế toán có một chỗ tra hợp đồng; hệ chặn được lỗi nhập ngược bên nhượng/bên nhận.
- **Yêu cầu phục vụ:** `R-D9-01` · `R-D9-02` · `R-D2-12` **cùng lần phát hành với** `R-D9-03`.
- **Biết là xong bằng:** nhập đảo chiều → **CHECK constraint chặn**. Mẫu số: 4 ca (đúng chiều, đảo chiều, tự trỏ chính mình, thiếu một vế).
- **Cờ 1:** KHÔNG · **Cờ 2:** KHÔNG.
- **Chủ:** Kiệt.
- 🔴 **Phần bị chặn:** `[QS]` `R-D9-08` (`02-prd:286`) đòi ô *"Bên nhận nhượng quyền"* **chỉ liệt kê node `relationshipType=FRANCHISEE`** — mà **c1** (*node bên nhận là `type=CENTER` hay `type=FRANCHISE`*) **chưa ai trả lời**. Bảng + ràng buộc làm được; **màn hình chọn đơn vị dừng lại chờ c1**.
- ⚠️ Ba câu hợp đồng khác đang treo và sẽ đổi hình bảng nếu trả lời muộn: **c8** (phí sàn / bậc thang), **c9** (một hợp đồng phủ mấy cơ sở), **c10** (kỳ chồng lấn khi gia hạn), **c11** (cắt vì hết hạn ≠ cắt vì vi phạm). `[SĐ]` Trả lời sau khi đã dựng bảng = **một migration nữa**.

---

## 5. Thứ tự và phụ thuộc

```
Chặng 0  KQ-0.1 ─┐
         KQ-0.2 ─┤
         KQ-0.3 ─┼─→  (mở khoá mọi thứ sau; KQ-0.1 nên đi TRƯỚC mọi việc chạm seed-roles)
         KQ-0.4 ─┤
         KQ-0.5 ─┘

Chặng 1  KQ-1 ──→ (mở khoá D8 + mắt cuối của D10)
         KQ-2      độc lập — nhưng Cờ 2, phải điều phối hardening
         KQ-3      độc lập — cần sửa M6 trước
         KQ-4      phần R-D6-* độc lập · phần R-D2-09/10 DỪNG (M8)
         KQ-5      độc lập — cần c17 trước khi viết tiêu chí
         KQ-6      độc lập — cố ý dừng nửa chừng
         KQ-7      phần bảng + ràng buộc làm được · phần UI chọn đơn vị DỪNG (c1)

═══════════════ RANH GIỚI ═══════════════   ← §6
         A1 (cổng tạo cơ sở)   ✋ c43
         A4 (cây tổ chức)      ✋ c43
         B1 → B7               ✋ M2 (điều kiện khởi động không định nghĩa được)
```

**Ba ràng buộc thứ tự không được vi phạm** (đều từ PRD, không phải phát minh của bước này):

1. `R-D2-16 + R-D2-17 + R-D2-18` — **một lần phát hành** (`02-prd:401`). *(Nằm sau ranh giới, ghi ở đây để không ai tách khi tới lượt.)*
2. `R-QDC-01 + 02 + 03` — **cùng lúc** (`QUYET-DINH.md:69`). Làm 1+2 mà không làm 3 = *"trả giá kiến trúc mà không còn thu lợi nghiệp vụ"* (`:75`).
3. `R-D3-10` — **không tách lại** thành hai mã (`02-prd:366-367`).

---

## 6. RANH GIỚI — dừng ở đây

### 6.1 Cái gì đang chặn

Tám chốt. **Không chốt nào gỡ được bằng công sức kỹ thuật** — tất cả cần một chữ ký hoặc một câu trả lời.

| Chốt | Nội dung | Chặn cái gì | Ai mở được |
|---|---|---|---|
| **M1** | QĐ-B chặn cứng *"không bật cờ cho tới khi 3 việc xong"* (`QUYET-DINH.md:58`) — cờ **đã bật**, cả 3 việc chưa có | toàn nhánh QĐ-B · **B1** | Ban + chủ đợt go-live RBAC + Luân |
| **M2** | QĐ-A.1 treo `isHoLevel` vào *"chờ cửa sổ shadow đóng"* — điều kiện nay **không định nghĩa được** | **điều kiện khởi động cả làn B** | Ban + chủ đợt go-live RBAC |
| **M3** | Điều kiện ra pha A3 ghi *"test cách ly hiện có vẫn xanh"*, mâu thuẫn bằng chứng mã | KQ-3 *(nhưng Kiệt+Luân tự gỡ được)* | Kiệt + Luân |
| **M4** | PRD ghi *"4–5 dev"* vs thực tế 3 người; **A7** suy ra *"thứ tự vẫn đúng"* | quy mô toàn lộ trình | Ban (**c42**) |
| **M5** | `R-D10-13` fail-closed **đi ngược mục tiêu giám sát** của chính D10 | phần tính phí của **KQ-1** · `R-D10-03/12/13` | Ban + Đội Đào tạo HO |
| **M6** | `R-QDC-01` nghiệm thu không phủ cơ sở đã cấu hình | KQ-3 *(Kiệt+Luân tự gỡ được)* | Kiệt + Luân |
| **M7** | Số dòng trong QĐ-C đã trôi khỏi mã | KQ-0.5 việc thứ 7 | người giữ sổ quyết định |
| **M8** 🆕 | `[QS]` `R-D2-09` và `R-D2-10` **nằm ở CẢ pha A8** (`02-prd:420`) **lẫn B4** (`:433`) — cùng hai mã, hai làn, hai điều kiện khởi động khác nhau | phần `R-D2-09/10` của **KQ-4** | người giữ PRD |

**Hai câu hỏi nghiệp vụ chặn cứng, ngoài 8 chốt trên:**

- **c43** — *ai được phép cho `R-D4-09` (hoặc riêng phần lọc `roleCode` trong `isHoRoot`) chạy TRƯỚC pha A4*. Ba nguồn khoá nhau: QĐ-A.1 (`QUYET-DINH.md:42`, bảng tra `:100`) · §8 xếp `R-D4-09` ở B5 (`02-prd:434`) · `01-intended-vs-implemented.md:70-72` ghi **"THỨ TỰ KHÔNG ĐẢO ĐƯỢC: sửa `isHoLevel` TRƯỚC, rồi mới dựng đường tạo `OrgUnit`"**.
  → **Chặn pha A1 và pha A4.** ⚠️ Và **phạm vi của c43 chưa rõ**: câu hỏi liệt kê `R-D2-01..08` (pha A4), nhưng pha A1 (`R-D2-16..20`) **cũng là đường tạo `OrgUnit``. Người cắt c43 phải nói rõ nó phủ A1, A4, hay cả hai.** Bước này **không tự quyết** điều đó.
- **c1** — *node FRANCHISEE là `type = CENTER` hay `type = FRANCHISE`*. → Chặn phần UI của **KQ-7**, chặn A6 trọn vẹn, chặn toàn nhánh D10.

### 6.2 Mỗi chốt gỡ ra thì mở được cái gì

Bảng này để người có thẩm quyền thấy **giá của việc chậm trả lời**. Không phải kế hoạch — là **ánh xạ điều kiện → phạm vi lập lịch được**.

| Gỡ chốt | Lập lịch được thêm |
|---|---|
| **c43** | Pha **A1** (gói cổng tạo cơ sở — *"chặn cứng số một của toàn chương trình"*) và pha **A4** (cây tổ chức có tầng vùng). Đây là chốt **đắt nhất** đang treo: nó chặn đúng việc mà §8 nói *"nếu chỉ làm được một việc thì làm việc này"* |
| **c1** | Phần UI của KQ-7; và `R-D2-19/20` trong A1 có định nghĩa rõ ràng để nghiệm thu |
| **M1 + M2** | Điều kiện khởi động **làn B** trở lại tồn tại ⇒ B1→B7 mới lập lịch được. Trước đó, mọi mốc của làn B là **hư cấu** |
| **M5** | Phần "lớp không giải được chương trình thì tính phí thế nào" của KQ-1; và `R-D10-12` phát biểu được dứt điểm |
| **M4 / c42** | Biết được lộ trình này chạy bằng bao nhiêu người ⇒ mới nói được **chặng 1 dài bao lâu**. Hiện **không nói được** |
| **M8** | Phần `R-D2-09/10` của KQ-4 |
| **§9 câu 8** | Nhóm `R-DP-01..07` (**9 yêu cầu**) có làn — hiện **không nằm trong pha nào** |

### 6.3 Bước này KHÔNG làm gì sau ranh giới

Theo chỉ đạo: **dừng ở ranh giới**. Cụ thể, tài liệu này **không**:

- không xếp lịch B1→B7, kể cả dạng "dự kiến";
- không đề xuất cách gỡ c43, M1, M2 — đó là quyết định của người có thẩm quyền, không phải khuyến nghị kỹ thuật;
- không giả định chốt nào sẽ được gỡ trong khoảng thời gian nào;
- không ước lượng thời lượng cho chặng 1 — vì **M4/c42** chưa trả lời, mọi con số ngày-công sẽ là số bịa.

---

## 7. Chỉ số dẫn dắt — đo hàng tuần trong lúc chặng 0 và 1 chạy

Khác `05-premortem.md` §7 (đo để **phát hiện hỏng**), bảng này đo để **biết có đang tiến không**.

| Chỉ số | Nói lên điều gì | Nguồn có bị bên bị đo kiểm soát không |
|---|---|---|
| Số chốt trong §6.1 đã đóng (0/8) | Tốc độ **thật** của chương trình — chương trình đang bị chặn bởi chữ ký, không bởi code | Không |
| Số thí nghiệm `KQ-0.4` đã có bảng số (0/7) | Tỉ lệ `[SĐ]` chuyển thành `[QS]` | Không |
| `count(Curriculum WHERE ownerOrgUnitId IS NULL)` **kèm mẫu số** | Tiến độ KQ-1 | Không |
| Số override `makeup.crossCenterEnabled` cấp cơ sở còn lại **kèm mẫu số ban đầu** | Tiến độ KQ-3 | Không |
| Học viên có buổi vắng **không được bù** trong N ngày, theo cơ sở | Nhu cầu bù có chảy ra ngoài hệ không (TC-10) | **Không** — đây là lý do chọn chỉ số này |
| Số PR tách một "gói phải đi cùng lần phát hành" | Cảnh báo sớm KB-11 | Không |
| Số bản ghi `SCOPED_MODELS` có `centerId IS NULL` tạo mới theo tuần | Bẫy picker đơn vị (KB-14, KB-15) | Không |

⚠️ **Không có chỉ số nào đo "phần trăm hoàn thành".** Với 8 chốt đang treo, một con số phần trăm sẽ nói dối theo hướng lạc quan.

---

## 8. Cái lộ trình này KHÔNG kết luận được

1. **Thời lượng.** Không có con số ngày-công nào, vì **M4/c42** chưa trả lời (3 người hay 4–5 người?) và `GD-26` chưa chạy.
2. **Thứ tự tối ưu trong chặng 1.** Sáu kết quả gần như độc lập; thứ tự thật sẽ do **ai rảnh** quyết, không do phụ thuộc kỹ thuật quyết.
3. **Chặng 1 có đủ để mở cơ sở FRANCHISEE đầu tiên không** — **không**, và đây là điều quan trọng phải nói rõ: mở cơ sở cần **A1**, mà A1 nằm sau ranh giới.
4. **Giá trị thật của KQ-6** (hàm cắt quyền chưa nối) — phụ thuộc ranh giới được gỡ **sớm hay muộn**. Gỡ muộn thì công sức đó nằm không, và có nguy cơ lệch khỏi mã nguồn đã đổi.
5. **Nhóm `R-DP-01..07`** (dữ liệu cá nhân, 9 yêu cầu) **vẫn không có làn** — không phải bước này quên, mà vì `R-DP-01` chờ §9 câu 8.

---

## 9. Truy vết

| Kết quả | Yêu cầu `R-*` phục vụ | Pha §8 tương ứng | Trạng thái |
|---|---|---|---|
| KQ-0.1 … KQ-0.5 | *(không thuộc 112 yêu cầu)* | — | ✅ lập lịch được |
| **KQ-1** | `R-D8-01` · `R-D8-04/05/06` · `R-D10-02/03` · `R-CONST-01` | A2 | ✅ *(phần tính phí chờ M5)* |
| **KQ-2** | `R-D8-08` · `R-D8-11` | A9 | ✅ *(Cờ 2 — điều phối hardening; chốt c40 trước)* |
| **KQ-3** | `R-QDC-01..05` | A3 | ✅ *(sửa M6 + M3 trước)* |
| **KQ-4** | `R-D6-01..13` · ~~`R-D2-09/10`~~ | A8 | 🟡 *(phần `R-D2-09/10` chờ M8)* |
| **KQ-5** | `R-D3-01/04/05/06/09/10` | A5 | ✅ *(cần c17)* |
| **KQ-6** | `R-D3-02` | A7 | ✅ |
| **KQ-7** | `R-D9-01/02/03` · `R-D2-12` | A6 | 🟡 *(UI chọn đơn vị chờ c1)* |
| — | `R-D2-16..20` · `R-OPS-07` | **A1** | 🔴 chờ **c43** |
| — | `R-D2-01..08` · `R-OPS-01/08` | **A4** | 🔴 chờ **c43** |
| — | `R-QDB-*` · `R-D3-02/03/07/08/12` · `R-D9-04..12` · `R-D2-09/10/11` · `R-D10-04..10` · `R-D4-06..13` | **B1–B7** | 🔴 chờ **M1 + M2** |
| — | `R-DP-01..07` | *(không pha)* | 🔴 chờ §9 câu 8 |

**Độ phủ.** 7 kết quả của chặng 1 phủ **7/9 pha làn A** — A2, A3, A5, A7, A9 phủ **trọn**; A6 và A8 phủ **một phần** (chờ c1 và M8). **2/9 pha — A1 và A4 — nằm sau ranh giới**, và đó là hai pha **nặng ký nhất**: A1 là *"chặn cứng số một của toàn chương trình"* (`02-prd:400`), A4 là cây tổ chức mà mọi thứ khác treo lên. Toàn bộ **7 nhánh làn B** nằm sau ranh giới.

**Kiểm chứng.** Mọi `đường-dẫn:số-dòng` đã mở lại bằng Read/Grep trước khi viết. Phát hiện mới của vòng này: **M8** — `R-D2-09` và `R-D2-10` xuất hiện ở **cả `02-prd:420` (pha A8) lẫn `02-prd:433` (nhánh B4)**; đây là mâu thuẫn nội bộ của PRD, chưa bước nào ghi nhận, và bước này **không tự chọn bên**.

---

Bước này không sửa bất kỳ file nào khác ngoài E:/satarobo-vn/docs/taicautruc/07-roadmap.md.
