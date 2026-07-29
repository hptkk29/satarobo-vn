# BƯỚC 5 — Pre-mortem: chương trình này có thể chết như thế nào

> Ngày 29/07/2026 · phạm vi **BƯỚC 5** · nguồn: `02-prd-franchise-platform.md` (112 yêu cầu, §7.3 hai cờ, §7.4 A1–A9, §8 hai làn, §9 15 câu) · `QUYET-DINH.md` (QĐ-A/A.1/B/C/D) · `04-assumptions.md` (84 giả định + **§0 đính chính 29/07**) · `00-*.md` · `01-intended-vs-implemented.md` · **mã nguồn repo** · **số đo thật trên PROD ngày 29/07/2026**.
>
> **Phương pháp:** pre-mortem cổ điển (Gary Klein) — *giả định chương trình ĐÃ thất bại rồi mới đi ngược tìm nguyên nhân*, thay vì hỏi "có rủi ro gì". Cách hỏi này lấy ra được những nguyên nhân mà câu hỏi thuận không moi ra.
> ⚠️ Skill `pm-execution:pre-mortem` **không có trong máy này** (`.claude/skills/` chỉ có 6 skill nội bộ) — tài liệu áp phương pháp chuẩn, không theo khuôn skill.
>
> **Mốc giả định:** §8 của PRD chốt *"không dùng ngày tuyệt đối"*, nên pre-mortem này cũng không đặt ngày. Mốc là: **làn A đã đóng, làn B đi được khoảng một nửa, cơ sở FRANCHISEE đầu tiên đã mở và đã phát sinh doanh thu.** Đứng từ đó nhìn lại.

---

## 1. Cách đọc

| Ký hiệu | Nghĩa |
|---|---|
| `[QS]` | **Quan sát** — đọc được từ mã nguồn / tài liệu / số đo prod, kèm `đường-dẫn:số-dòng`. Mọi trích dẫn trong file này **đã mở lại bằng Read/Grep trước khi viết**. |
| `[SĐ]` | **Suy đoán** — không dòng mã nào chứng minh. Là phán đoán, phải kiểm mới dùng được. |
| `KB-NN` | Mã kịch bản hỏng. Số phẳng, **ổn định** — vòng sau chỉ thêm mã mới ở cuối, không đánh số lại. |

**Chấm mức.** Dùng nhãn thứ tự **CAO / VỪA / THẤP** và **NẶNG / VỪA / NHẸ**, **không dùng điểm số**. Lý do: BƯỚC 4 đã publish `Impact`/`Risk` dạng số mà không publish `Confidence`/`Effort`, nên công thức không tái lập được từ tài liệu (`04-assumptions.md` §11 mục 7). Không lặp lại lỗi đó — nhãn thứ tự nói đúng độ chắc mà ta thật sự có.

- **Xác suất** = khả năng kịch bản xảy ra **nếu không ai làm gì thêm**.
- **Thiệt hại** = hậu quả ở thời điểm phát hiện, không phải lúc mới gieo mầm.
- **Bắt được sớm?** = có **một phép đo cụ thể** phát hiện được **trước** khi hỏng lan không.

**Hai cờ lịch** — lấy nguyên chuẩn `02-prd-franchise-platform.md:360-364`:

- **Cờ 1 — đụng shadow-compare:** đổi **giá trị trả về của hàm quyền động trên dữ liệu đang có**. Thêm hàm mới chưa có nơi gọi → **KHÔNG** đụng.
- **Cờ 2 — đụng phạm vi dữ liệu:** đổi **tập bản ghi** một tài khoản đọc được. Đây là cờ nói chuyện với **đợt security hardening**.
- Luật giữ nguyên từ BƯỚC 4: **một phép đo chỉ-đọc thì cả hai cờ = KHÔNG**; cờ thuộc về **hành động vá**.

**Phạm vi.** Tài liệu này **không mở lại** D1–D12 và QĐ-A / QĐ-A.1 / QĐ-B / QĐ-C / QĐ-D. Chỗ nào quyết định đã ký **mâu thuẫn với hiện trạng mã nguồn**, tài liệu **dừng và báo lên §10**, không tự hoà giải.

**Thuật ngữ** (`QUYET-DINH.md:6`): **FRANCHISOR** = bên nhượng quyền = khối HO · **FRANCHISEE** = bên nhận nhượng quyền.

---

## 2. Tiền đề đã đổi — đọc trước khi dùng bất cứ kịch bản nào

BƯỚC 4 viết ngày 28/07 trên tiền đề *"`RBAC_V2_ENABLED` OFF, prod enforce v1, cửa sổ shadow còn mở"*. Đo thật ngày 29/07 cho thấy tiền đề đó **sai**. Chi tiết ở `04-assumptions.md` §0. Bốn số cần nhớ khi đọc file này:

| | Số đo PROD 29/07/2026 | Nguồn |
|---|---|---|
| `RBAC_V2_ENABLED` | **`"true"`** trên Vercel **Production** — prod enforce **v2** | `vercel env pull --environment=production`; `lib/auth/shadow-compare.ts:27` |
| `UserPermissionGrant` | **0 dòng** (0 ALLOW, 0 DENY) | `scripts/sql/phone-audit.sql` câu C |
| `RbacShadowDiff` | **65 dòng, toàn bộ trong 7 ngày** — 63 `leads:delete` + 2 `students:delete`, **cả hai đã ký siết**, **0 dòng nới quyền** | `scripts/sql/phone-audit.sql` câu D; `lib/auth/rbac-intentional.ts:53-55` |
| Khối lượng dữ liệu prod | **41 Lead · 2 Student · 1 Employee · 25 `UserOrgRole`** | `scripts/sql/phone-audit.sql` câu A + C |

Dòng cuối cùng là dòng **nguy hiểm nhất của cả tài liệu** — xem **KB-18**.

---

## 3. Mười hai dòng cho người không đọc hết

1. `[QS]` **Có một quả mìn đã cài sẵn, nổ được ngay hôm nay, không cần chương trình này bắt đầu:** chạy workflow `seed-prod-roles.yml` bây giờ = **toàn hệ thống mất quyền trong lúc seed**. `prisma/seed-roles.ts:554` `deleteMany` rồi `:556` `createMany`, **không `$transaction`** (grep toàn file: 0 kết quả). Khi cờ còn OFF thì vô hại — nay cờ ON. **KB-06.**
2. `[QS]` **Chính runbook của workflow đó vẫn khẳng định là an toàn:** `.github/workflows/seed-prod-roles.yml:10-11` ghi *"Runtime hiện chạy v1 matrix (RBAC_V2 OFF) nên seed này KHÔNG đổi hành vi cho tới khi flip"*. Câu đó **hết hạn lúc cờ được bật** mà không ai sửa. Người đọc runbook hôm nay sẽ tin nhầm.
3. `[QS]` **Gần như mọi điều kiện ra của làn A là `count(...) = 0`** (`02-prd:413-421`), mà prod có **41 lead / 2 học viên / 1 nhân viên**. Đèn sẽ xanh vì **không có dữ liệu**, không phải vì đúng. **KB-18** — kịch bản "thành công giả" nguy hiểm hơn mọi kịch bản hỏng.
4. `[QS]` **Làn B đang chờ một sự kiện đã xảy ra rồi.** §8 (`02-prd:425`) mở làn B *"sau khi cửa sổ shadow-compare đóng"*; cờ đã bật. Ai lập lịch theo nguyên văn §8 sẽ chờ mãi; ai bỏ qua thì khởi động làn B **không có ai ký**. **KB-05.**
5. `[QS]` **QĐ-B đã bị vi phạm, và điều này chưa ai ghi nhận.** `QUYET-DINH.md:58` là **⛔ CHẶN CỨNG**: không bật cờ cho tới khi có (1) `grantsDeny` trong `Actor`, (2) ngoại lệ `SUPER_ADMIN`, (3) test ma trận `DENY × scopeType`. Grep `grantsDeny` trong `lib/auth/` → **0 kết quả**. Cờ đã bật. **Đây là mâu thuẫn quyết-định-vs-hiện-trạng → §10, không tự hoà giải.**
6. `[QS]` **Lỗ DENY chưa nổ chỉ vì chưa ai dùng.** `UserPermissionGrant` rỗng. Nhưng `R-DP-02` (người phụ trách dữ liệu theo đơn vị) và D9 (cắt hợp đồng) **chính là hai việc sinh ra nhu cầu "cấm" đầu tiên**. Chương trình này tự đi tới chỗ kích nổ. **KB-07.**
7. `[QS]` **Backfill trục `orgUnitId` có thể đóng dấu vĩnh viễn một sai số tiền.** Công thức gán cơ sở cho khoản thu hiện **rơi về đơn vị của NGƯỜI THAO TÁC** (`lib/finance/payment.ts:92-98`) — đúng cái `R-D10-07` cấm. Chưa ai đo tỉ lệ sai (GD-28). Backfill trước khi đo = **suy diễn trên dữ liệu sai**, rồi kế toán ký lên. **KB-01.**
8. `[QS]` **Một lựa chọn nhập liệu hợp lệ tự tắt cách ly cơ sở.** `centerId` chỉ set được cho `type = CENTER` (`lib/org/orgunit-rules.ts:59-62`), mà `passesScope` **chặn** bản ghi `centerId` null (`lib/db-scope.ts:254`) trừ `NULL_IS_GLOBAL_MODELS`. Chọn node FRANCHISEE là `type = FRANCHISE` ⇒ mọi bản ghi của họ vô hình với chính họ. **KB-14** — và đây là **c1**, chưa ai trả lời.
9. `[QS]` **Ô chọn đơn vị vẫn là bẫy:** `DEFAULT_SELECTABLE_TYPES` gồm HO · CENTER · CAMPUS · PARTNER · FRANCHISE (`lib/org/org-tree.ts:128-134`) ⇒ **4/5 lựa chọn cho ra `centerId` null**. QĐ-A còn thêm `REGION` và **cấm** nó lọt vào danh sách này (`QUYET-DINH.md:32`) — một dòng quên là một lớp bản ghi ma. **KB-15.**
10. `[QS]` **Hai trục `centerId`/`orgUnitId` không có cơ chế cưỡng chế nhất quán.** PRD chỉ *yêu cầu* bản ghi mới nhất quán cả hai trục (`02-prd:354`) — không constraint, không test, không CI. Phụ thuộc kỷ luật người viết code trong nhiều tháng. **KB-04.**
11. `[QS]` **Đội thật là 3 người và đã tự khai quá tải ~2×** (`docs/ke-hoach-go-live-2607/README.md:62`, `:66`), trong khi PRD ghi *"4–5 dev"* (`02-prd:31`) và **A7** giả định *"lộ trình giãn ra, thứ tự vẫn đúng"* (`:387`). Thiếu người **không** làm lộ trình giãn đều — nó làm **vỡ các gói bắt buộc đi cùng một lần phát hành**. **KB-11.**
12. `[SĐ]` **Cách chương trình này chết nhiều khả năng nhất không phải là "làm sai", mà là "làm đúng trên một hệ thống rỗng rồi tưởng đã xong"** — rồi vỡ ở cơ sở FRANCHISEE thật, nơi có dữ liệu thật và có bên thứ hai đọc cùng một màn hình.

---

## 4. Bảng tổng hợp kịch bản hỏng

Sắp theo **cần xử trước** (xác suất × thiệt hại × việc rẻ hay đắt để chặn).

| Mã | Kịch bản | Nhóm | Xác suất | Thiệt hại | Bắt sớm? | Cờ 1 | Cờ 2 |
|---|---|---|---|---|---|---|---|
| **KB-06** | Chạy seed vai trò trên prod sau flip → mất quyền toàn hệ thống trong lúc seed | Quyền | **CAO** | **NẶNG** | ✅ | CÓ | KHÔNG |
| **KB-18** | Nghiệm thu xanh vì prod rỗng, không phải vì đúng | Nghiệm thu | **CAO** | **NẶNG** | ✅ | KHÔNG | KHÔNG |
| **KB-05** | Làn B chờ một sự kiện đã xảy ra → treo, hoặc khởi động không ai ký | Lịch | **CAO** | VỪA | ✅ | KHÔNG | KHÔNG |
| **KB-01** | Backfill `orgUnitId` đóng dấu sai số cơ sở vào sổ tiền | Trục dữ liệu | VỪA | **NẶNG** | ✅ | KHÔNG | **CÓ** |
| **KB-14** | Node FRANCHISEE chọn `type=FRANCHISE` → tự tắt cách ly | Trục dữ liệu | VỪA | **NẶNG** | ✅ | KHÔNG | **CÓ** |
| **KB-07** | Grant DENY đầu tiên bị vô hiệu im lặng | Quyền | VỪA | **NẶNG** | ⚠️ khó | CÓ | **CÓ** |
| **KB-11** | Thiếu người → tách gói "phải đi cùng một lần phát hành" | Công suất | **CAO** | **NẶNG** | ✅ | — | — |
| **KB-16** | FRANCHISEE tự soạn chương trình → phí về gần 0 | Thương mại | VỪA | **NẶNG** | ⚠️ chậm | KHÔNG | KHÔNG |
| **KB-15** | Picker đơn vị sinh bản ghi `centerId` null | Vận hành | VỪA | VỪA | ✅ | KHÔNG | **CÓ** |
| **KB-04** | Hai trục phân kỳ dần vì không có cưỡng chế | Trục dữ liệu | **CAO** | VỪA | ✅ | KHÔNG | KHÔNG |
| **KB-17** | Mở cơ sở trước khi có câu trả lời pháp lý dữ liệu | Pháp lý | VỪA | **NẶNG** | ✅ | KHÔNG | KHÔNG |
| **KB-08** | `R-QDB-05` (chặn cứng CI theo số lệch) mất nghĩa sau flip | Quyền | **CAO** | NHẸ | ✅ | KHÔNG | KHÔNG |
| **KB-02** | `Center` mồ côi → truy vấn theo trục org trả rỗng, không báo lỗi | Trục dữ liệu | VỪA | VỪA | ✅ | KHÔNG | **CÓ** |
| **KB-12** | Review chéo chỉ 2/3 người → lỗi hiểu-sai-giống-nhau không ai bắt | Công suất | VỪA | VỪA | ⚠️ khó | — | — |
| **KB-13** | Bus factor: một người giữ trọn một nhánh | Công suất | VỪA | **NẶNG** | ⚠️ khó | — | — |
| **KB-03** | PR-D không tồn tại → hai trục sống vĩnh viễn | Trục dữ liệu | **CAO** | VỪA | ✅ | KHÔNG | KHÔNG |
| **KB-09** | Gỡ `MAKEUP_EXCEPTION_MODELS` làm đỏ test → người sau "sửa cho xanh" bằng cách khôi phục lỗ | Vận hành | VỪA | VỪA | ✅ | KHÔNG | **CÓ** |
| **KB-10** | Phiếu thu phát hành vào dải số `SR` cho pháp nhân mới | Vận hành | VỪA | VỪA | ✅ | KHÔNG | KHÔNG |

**Tổng: 18 kịch bản** — **7** xác suất CAO · **9** thiệt hại NẶNG · **14** bắt được sớm bằng một phép đo cụ thể (4 mã còn lại chỉ phát hiện được khi đã muộn: KB-07, KB-12, KB-13, KB-16). Việc phòng ngừa mang **Cờ 2 = CÓ**: **6** mã — KB-01, KB-02, KB-07, KB-09, KB-14, KB-15 — phải điều phối với đợt security hardening.
*(Bốn phép đếm trên đã chạy lại trên chính bảng này.)*

---

## 5. Ba vùng bắt buộc

Ba vùng dưới đây là yêu cầu riêng của BƯỚC 5, xét sâu hơn phần còn lại.

### 5.1 Migration trục `centerId` → `orgUnitId` trên ~173 model

**Điều nguy hiểm nhất ở vùng này không phải độ lớn — mà là việc nó KHÔNG có ai sở hữu.**

`[QS]` PRD tự khai: 26 model mang **cả hai** trục, comment trong schema ghi *"flip ở PR-D"*, nhưng **không tài liệu nào định nghĩa PR-D gồm gì** (`02-prd:354`). Cùng câu đó nói PRD này **không** giải quyết việc hợp nhất — nó chỉ *yêu cầu* bản ghi **mới** nhất quán cả hai trục. `[QS]` §9 câu 15 (`02-prd:468`) hỏi thẳng *"trạng thái cuối của `Center` vs `OrgUnit`"* và **chưa có câu trả lời**.

Nghĩa là chương trình này **thêm** người dùng vào một trục chưa hợp nhất, mà không nhận trách nhiệm hợp nhất. Ba đường chết:

- **KB-01 — đóng dấu sai số vào tiền.** `[QS]` Công thức gán cơ sở cho khoản thu rơi về **đơn vị của người thao tác** (`lib/finance/payment.ts:92-98`, tự khai ở chú thích `:62`) — đúng thứ `R-D10-07` cấm (`02-prd:297`). GD-28 (`04-assumptions.md`) thiết kế sẵn 4 truy vấn đếm bản ghi tiền **gán SAI** cơ sở, **chưa chạy**. Backfill `orgUnitId` suy từ `centerId` sai = nhân sai số sang trục thứ hai, rồi `R-OPS-03` cho kế toán **ký** lên nó. Sau chữ ký thì không quay lui được.
- **KB-02 — `Center` mồ côi.** `[QS]` `OrgUnit.centerId` là `String? @unique` (`prisma/schema.prisma:304`) và luật V7 chỉ cho set khi `type = CENTER` (`lib/org/orgunit-rules.ts:59-62`). Không có ràng buộc ngược: một `Center` **không** có `OrgUnit` nào trỏ tới là hợp lệ về schema. Truy vấn đi theo trục org sẽ trả **rỗng**, không ném lỗi ⇒ hỏng câm.
- **KB-04 — phân kỳ dần.** `[QS]` Yêu cầu *"bản ghi mới nhất quán ở cả hai trục"* (`02-prd:354`) **không có cơ chế cưỡng chế**: không CHECK constraint, không test CI, không lint. Mỗi tính năng mới phải tự chọn trục; chọn khác nhau là bình thường. `[SĐ]` Sau vài tháng, độ lệch lớn tới mức việc hợp nhất đắt hơn lúc bắt đầu — tức PR-D càng hoãn càng đắt, đúng dạng nợ tăng lãi.

**Phòng ngừa, xếp theo tỉ lệ lợi/chi phí:**

| Việc | Cỡ | Cờ 1 | Cờ 2 | Ghi chú |
|---|---|---|---|---|
| Chạy GD-28 (4 truy vấn đếm bản ghi tiền sai cơ sở) **trước** mọi backfill | S | KHÔNG | KHÔNG | Phép đo. Kết quả quyết định `R-D10-08` là *"nạp bằng suy diễn"* hay *"xuất danh sách xác nhận từng dòng"* |
| Chạy GD-46 (đếm lệch hai trục trên 26 model, tách bản ghi cũ / bản ghi tạo sau PR-A) | S | KHÔNG | KHÔNG | Phép đo |
| Thêm **một truy vấn đối soát vào CI** (`Center` không có `OrgUnit` = 0 dòng; bản ghi mới lệch hai trục = 0 dòng) | S | KHÔNG | KHÔNG | Đây là thứ biến "yêu cầu" thành "cưỡng chế". **Rẻ nhất trong bảng, chặn được KB-04 lẫn KB-02** |
| Bước **NẠP LẠI** `centerId`/`orgUnitId` sau khi đo | M | KHÔNG | **CÓ** | `Payment` ∈ `SCOPED_MODELS` ⇒ đổi tập bản ghi actor cấp cơ sở đọc được → **đi chung lịch với đợt security hardening** |

### 5.2 Cửa sổ shadow-compare — vùng này đã đổi bản chất, không chỉ đổi số

BƯỚC 4 hỏi *"đồng hồ có chạy không"*. Câu đó **đã trả lời xong**: có, `RbacShadowDiff` liên tục 24/07 → 28/07. Câu hỏi mới khó hơn.

- **KB-05 — làn B chờ một sự kiện đã xảy ra.** `[QS]` §8 (`02-prd:425`) mở làn B *"chỉ khởi động sau khi cửa sổ shadow-compare đóng"*, `[QS]` **A9** (`:389`) đặt *"cửa sổ sẽ đóng trong khoảng lập kế hoạch được"* làm giả định nền, `[QS]` §9 câu 12 (`:465`) còn đang hỏi *"đóng theo tiêu chí nào"*. Cờ đã bật ⇒ **cửa sổ theo nghĩa "prod còn chạy v1" đã đóng từ trước khi có câu trả lời**. Hai đường chết: đọc nguyên văn §8 thì chờ mãi; bỏ qua §8 thì làn B khởi động **không có quyết định ký nào**. `[SĐ]` Đường thứ hai khả năng cao hơn, vì áp lực tiến độ luôn thắng câu chữ.
- **KB-06 — quả mìn đã cài.** `[QS]` `prisma/seed-roles.ts:554` `deleteMany({ where: { roleId } })` rồi `:556` `createMany(...)`, **không `$transaction`** (grep `\$transaction` toàn file → **0 kết quả**), chạy trong vòng lặp **từng role**. `[QS]` Có đường chạy thật: `.github/workflows/seed-prod-roles.yml:59` `pnpm exec tsx prisma/seed-roles.ts` với `PROD_DIRECT_URL`. Khi cờ OFF, khoảng trống giữa hai lệnh **vô hại** vì runtime đọc ma trận tĩnh. Khi cờ ON, trong khoảng đó `RolePermission` của role đang seed là **rỗng** ⇒ `can()` v2 trả `false` cho mọi action của mọi người giữ role đó (trừ `SUPER_ADMIN`, thoát ở `lib/auth/can.ts:39`). `[QS]` Nguy hiểm gấp đôi vì **runbook vẫn ghi là an toàn**: `.github/workflows/seed-prod-roles.yml:10-11` — *"Runtime hiện chạy v1 matrix (RBAC_V2 OFF) nên seed này KHÔNG đổi hành vi cho tới khi flip"*. `[QS]` Và `00-baseline.md` đã ghi quy tắc *"chạy lại `seed-roles.ts` = xoá sạch + tạo lại = đổi mapping = phải TRUNCATE lại đồng hồ shadow"* — tức **chương trình này chắc chắn sẽ chạm vào nó** (mọi thay đổi `RoleDef`/`RolePermission` của D4/QĐ-B đều đi qua đây).
- **KB-07 — grant DENY đầu tiên.** `[QS]` `lib/auth/can.ts:36-44` khai thẳng *"ALLOW-wins, KHÔNG có DENY override"*; `grantsDeny` không tồn tại trong `lib/auth/`. `[QS]` Prod hiện **0 grant** nên chưa ai bị ảnh hưởng. `[QS]` Nhưng `R-DP-02` (`02-prd:342`) và nhánh D9 (cắt hợp đồng, thu hồi quyền) chính là hai chỗ **sinh nhu cầu cấm**. `[SĐ]` Người thi hành sẽ với tay tới `UserPermissionGrant` DENY vì nó **có sẵn trong schema và trong UI** — rồi tưởng đã cấm.
- **KB-08 — `R-QDB-05` mất nghĩa.** `[QS]` `R-QDB-05` (`02-prd:245`) là chặn cứng CI dựa trên số lệch shadow. Sau flip, 65 dòng lệch đều **có chủ đích** (`lib/auth/rbac-intentional.ts:53-55`) và **vẫn sinh thêm mỗi lượt mở trang** (`app/(admin)/admin/leads/page.tsx:257` gọi `checkPermission` để ẩn/hiện nút). Ngưỡng ">0 là đỏ" ⇒ CI đỏ vĩnh viễn; ngưỡng "bỏ qua nhóm có chủ đích" ⇒ phải giữ `rbac-intentional.ts` đồng bộ tay. Thiệt hại nhẹ nhưng xác suất cao, và nó **làm mòn niềm tin vào đèn CI** — thứ mọi kịch bản khác đang dựa vào.

**Phòng ngừa:**

| Việc | Cỡ | Cờ 1 | Cờ 2 | Ghi chú |
|---|---|---|---|---|
| Bọc `seed-roles.ts` trong `$transaction` (hoặc `upsert` thay cho `deleteMany`+`createMany`) | **S** | KHÔNG¹ | KHÔNG | ¹Không đổi giá trị hàm quyền ở trạng thái ổn định, chỉ xoá khoảng trống lúc chạy. **Việc rẻ nhất, chặn kịch bản NẶNG nhất — nên làm trước mọi thứ khác trong chương trình** |
| Sửa header `.github/workflows/seed-prod-roles.yml:10-13` cho khớp hiện trạng | **S** | KHÔNG | KHÔNG | Runbook nói sai còn nguy hơn không có runbook |
| Vá `can()` v2 nhận DENY (3 việc của QĐ-B) | M | **CÓ** | **CÓ** | Giờ **rẻ** vì bảng `UserPermissionGrant` rỗng — không có dữ liệu phải tương thích ngược. Càng để lâu càng đắt |
| Viết lại tiêu chí đóng cửa sổ / điều kiện khởi động làn B | S | KHÔNG | KHÔNG | Không phải việc kỹ thuật — cần người ký. §10 |

### 5.3 Công suất đội — 3 người, 3 chương trình khác, 112 yêu cầu

`[QS]` PRD ghi *"Đội kỹ thuật (4–5 dev)"* (`02-prd:31`) và **A7** (`:387`) giả định *"lộ trình §8 giãn ra; **thứ tự** vẫn đúng"*. `[QS]` `docs/ke-hoach-go-live-2607/README.md:12-16` cho thấy đội thật còn **3 người** (Huy & Trí rời 03/07); `:62` tự khai Kiệt ~39 và Luân ~46 ngày-công còn nợ trên ~20 ngày làm việc; `:66` kết luận **quá tải ~2×** cho riêng đợt go-live.

**Chỗ A7 sai không phải ở con số mà ở kết luận.** Thiếu người **không** làm lộ trình giãn đều:

- **KB-11 — vỡ gói.** `[QS]` PRD có ít nhất ba gói **bắt buộc đi cùng một lần phát hành**: `R-D2-16+17+18` (`02-prd:399-401` — *"tách ra sẽ giao một trạng thái nửa vời"*), `R-QDB-02+03` (`:440` — *"nếu không sẽ có khoảng thời gian tài khoản quản trị cao nhất tự khoá mình"*), và `R-D3-10` (`:366-367` — đã gộp từ `R-D8-10` vì hai mã sửa **cùng một hàm gác theo hai hướng ngược nhau**). `[SĐ]` Khi thiếu người, phản xạ tự nhiên là **chia nhỏ để chạy song song** — đúng thao tác phá vỡ ba gói này. PRD đã lường trước cho `R-D3-10` (*"loại hỏng không ai phát hiện qua đọc diff riêng lẻ"*) nhưng **cơ chế bảo vệ vẫn là câu chữ trong tài liệu**, không phải quy tắc phát hành.
- **KB-12 — review chéo 2/3.** `[QS]` `README.md:69` ghi cơ chế review chéo Kiệt↔Luân. `[SĐ]` Hai người trên tổng số ba: lỗi dạng *"cả hai cùng hiểu sai một quyết định"* không có người thứ ba chặn. Chương trình này có **nhiều quyết định dễ hiểu ngược** — QĐ-B (DENY), QĐ-A.1 (`isHoLevel`), hai cờ lịch — nên xác suất không nhỏ.
- **KB-13 — bus factor.** `[QS]` Phân công theo mảng: Luân giữ LOGIN/RBAC (`README.md:13`), Kiệt giữ FIN/LMS/SCORM. `[SĐ]` Làn B **B1, B2, B5, B6, B7** hầu như nằm trọn trong mảng của Luân; **B3, B5** phần tiền nằm trong mảng của Kiệt. Mất một trong hai người là **mất một nửa làn B**, không phải chậm một nửa.

**Phòng ngừa:**

| Việc | Cỡ | Ghi chú |
|---|---|---|
| Chạy GD-26 (đếm PR merge 4 tuần + ngày-công còn nợ) — **do Vy đếm, không phải người đang bị đo** | S | Đổi A7 từ giả định thành số |
| Biến *"phải cùng một lần phát hành"* thành **quy tắc phát hành có kiểm tra**, không phải câu trong PRD | S | Vd: một mã trong gói mà thiếu mã kia thì CI chặn merge. Đây là chỗ **rẻ mà chặn được KB-11** |
| Ban cắt phạm vi tường minh nếu GD-26 trượt | — | §10 — không phải việc kỹ thuật |

---

## 6. Chi tiết các kịch bản còn lại

### KB-14 — Node FRANCHISEE chọn sai loại, tự tắt cách ly cơ sở

**Kịch bản.** Cơ sở nhượng quyền đầu tiên được mở. Người tạo chọn `type = FRANCHISE` — hợp lý về mặt tên gọi, enum có sẵn giá trị đó. Vài tuần sau, quản lý cơ sở đó báo *"không thấy học viên của mình"*. Không ai tìm ra vì không có lỗi nào được ném.

**Chuỗi nhân quả.** `[QS]` `lib/org/orgunit-rules.ts:59-62` (V7) — `centerId` chỉ set được cho `type = CENTER`, ném `ORG_CENTERID_NOT_CENTER` nếu khác → node `FRANCHISE` **buộc** `centerId = null`. `[QS]` `lib/db-scope.ts:254` — `if (record.centerId == null) return NULL_IS_GLOBAL_MODELS.has(model)` ⇒ với model thuộc `SCOPED_MODELS` mà không thuộc `NULL_IS_GLOBAL_MODELS`, bản ghi `centerId` null bị **chặn**. `[QS]` Enum đã có sẵn cả `FRANCHISE` lẫn `PARTNER` (`prisma/schema.prisma:286-293`).

**Dấu hiệu sớm.** Một truy vấn: đếm bản ghi `SCOPED_MODELS` có `centerId IS NULL` được tạo sau ngày mở cơ sở, tách theo `orgUnitId`.
**Phòng ngừa.** Trả lời **c1** trước khi mở cơ sở đầu tiên (Ban quyết + Luân xác nhận hệ quả `scopedDb`). **Cờ 1 KHÔNG · Cờ 2 CÓ** cho việc vá.
**Ai sở hữu.** Ban giám đốc (quyết) · Luân (hệ quả kỹ thuật).

### KB-15 — Picker đơn vị sinh bản ghi vô hình

**Kịch bản.** Nhân viên tạo một `Holiday`/`Class`/`Lead` và chọn đơn vị là node vùng hoặc HO trong ô chọn. Bản ghi lưu thành công, hiện trên màn hình người tạo, rồi **biến mất** với mọi tài khoản cấp cơ sở.

**Chuỗi nhân quả.** `[QS]` `DEFAULT_SELECTABLE_TYPES = ["HO","CENTER","CAMPUS","PARTNER","FRANCHISE"]` (`lib/org/org-tree.ts:128-134`) ⇒ **4/5 lựa chọn** cho ra `centerId = null` theo V7. `[QS]` QĐ-A thêm `REGION` vào enum và **cấm tường minh** không cho nó vào `DEFAULT_SELECTABLE_TYPES` (`QUYET-DINH.md:32`) — nghĩa là danh sách này sẽ bị **sửa trong chương trình**, và một dòng quên là một lớp bản ghi ma mới.

**Dấu hiệu sớm.** Đếm bản ghi `SCOPED_MODELS` có `centerId IS NULL` **tạo sau ngày triển khai A4**, theo tuần.
**Phòng ngừa.** Truyền `types` tường minh ở 13 trang admin đang gọi `getSelectableOrgUnits(actor)` không truyền tham số (`R-D2-07`). **Cờ 1 KHÔNG · Cờ 2 CÓ**.
**Ai sở hữu.** Luân · Vy (UI picker).

### KB-16 — FRANCHISEE tự soạn chương trình, phí về gần 0

**Kịch bản.** Bên nhận tạo một `Curriculum` mang tên mình, gắn các lớp vào đó. Mọi lớp rơi ra ngoài "phạm vi nhượng quyền". Báo cáo phí hiển thị con số nhỏ dần mà không có cảnh báo nào — vì mọi thao tác đều **hợp lệ**.

**Chuỗi nhân quả.** `[QS]` §9 câu 2 (`02-prd:455`) mô tả đúng lỗ này và gọi tên *"lỗ hổng thương mại mở bằng đúng một thao tác nhập liệu hợp lệ"*; `[QS]` **A2** (`:382`) giả định *"FRANCHISEE dùng chung bộ chương trình của HO"* và ghi rõ nếu sai thì **D10 sụp đổ**. `[QS]` Câu này **chưa được trả lời**.

**Dấu hiệu sớm.** Đếm `Curriculum` có `ownerOrgUnitId` **không thuộc HO**, theo tháng. Ngưỡng: > 0 là phải xem ngay.
**Phòng ngừa.** Ban chốt §9 câu 2: tách phạm vi tính phí khỏi phạm vi xem chi tiết (`R-D10-12`), **hay** chặn ở tầng dữ liệu. **Cờ 1 KHÔNG · Cờ 2 KHÔNG** (bản thân quyết định); việc chặn tầng dữ liệu thì **Cờ 2 CÓ**.
**Ai sở hữu.** Ban giám đốc · Đội Đào tạo HO.

### KB-17 — Mở cơ sở trước khi có câu trả lời pháp lý về dữ liệu

**Kịch bản.** Cơ sở FRANCHISEE mở, dữ liệu học viên bắt đầu chảy qua pháp nhân thứ hai. Ba tháng sau pháp chế trả lời rằng mỗi bên là một bên kiểm soát riêng — và toàn bộ luồng đã chạy theo giả định ngược lại.

**Chuỗi nhân quả.** `[QS]` §9 câu 8 (`02-prd:461`) đánh dấu 🔴 và ghi *"Câu gốc — F2 đến F7 treo theo"*; `[QS]` `R-DP-01` (`:341`) trỏ ngược về đúng câu đó. `[QS]` Nhóm `R-DP-01..07` **không nằm trong pha nào** của §8 (`:413-437`) — tức không có ngày bắt đầu lẫn ngày kết thúc.

**Dấu hiệu sớm.** Không có dấu hiệu kỹ thuật. Dấu hiệu duy nhất là **ngày mở cơ sở đến trước ngày có văn bản**.
**Phòng ngừa.** Biến `R-DP-01` thành **chốt chặn của làn A** (đúng đề xuất ở **c41**), thay vì mã treo không pha. **Cờ 1 KHÔNG · Cờ 2 KHÔNG**.
**Ai sở hữu.** Ban giám đốc + pháp chế.

### KB-18 — Nghiệm thu xanh vì rỗng, không phải vì đúng ⚠️

**Đây là kịch bản tôi cho là nguy hiểm nhất, vì nó không giống thất bại — nó giống thành công.**

**Kịch bản.** Làn A chạy hết 9 pha. Mọi điều kiện ra đều xanh. Chương trình báo cáo hoàn thành. Cơ sở FRANCHISEE đầu tiên mở, dữ liệu thật đổ vào — và một loạt vấn đề mà "đèn xanh" lẽ ra phải bắt được nay xuất hiện cùng lúc, trước mặt bên thứ hai.

**Chuỗi nhân quả.** `[QS]` Điều kiện ra của làn A (`02-prd:413-421`) hầu hết có dạng **đếm về 0**: A1 *"3 truy vấn đối soát = 0 dòng"*, A2 *"`count(ownerOrgUnitId IS NULL)` = 0"*, A3 *"grep `MAKEUP_EXCEPTION` = 0"*, A5 *"call-site `createAssignment` ≥ 1"*. `[QS]` Prod hiện có **41 Lead · 2 Student · 1 Employee · 25 `UserOrgRole`** (đo 29/07). `[SĐ]` Trên tập đó, "0 dòng lệch" gần như là **hệ quả của việc không có dữ liệu**, không phải bằng chứng logic đúng. `[QS]` Điều tương tự đã được ghi nhận ở vùng khác: `00-baseline.md` chỉ ra **280/301 dòng seed là `scopeType = GLOBAL`**, nên *"0 lệch KHÔNG chứng minh gì cho logic scope"* — các nhánh `CENTER/CLASS/OWN/CHILDREN` của `lib/auth/can.ts` **hầu như không chạy trên prod**.

**Dấu hiệu sớm.** Chính là dấu hiệu bị bỏ qua: **mọi tiêu chí "đếm = 0" phải kèm mẫu số**. Một tiêu chí đọc *"0/0"* thì không phải tiêu chí.
**Phòng ngừa.**

1. Mỗi điều kiện ra dạng `count = 0` **phải ghi kèm tổng số bản ghi được xét**. Đèn chỉ tính là xanh khi mẫu số **vượt ngưỡng tối thiểu** (như GD-24 đã làm đúng: *"chỉ kết luận khi ≥ 200 dòng nhật ký"*, GD-06: *"≥ 30 enrollment/cơ sở"*).
2. Với vùng chưa đủ dữ liệu thật: nghiệm thu trên **DB test có seed diện rộng** thay vì prod. Repo đã có sẵn bộ seed lớn cho việc này.
3. Ghi thẳng vào tiêu chí: *"đèn xanh trên tập nhỏ = CHƯA NGHIỆM THU, chỉ là chưa thấy hỏng"*.

**Cờ 1 KHÔNG · Cờ 2 KHÔNG** (thuần tiêu chí nghiệm thu).
**Ai sở hữu.** Kiệt (chủ test) · Luân · người duyệt điều kiện ra của từng pha.

### KB-09 — Gỡ ngoại lệ học bù làm đỏ test, người sau khôi phục lỗ

**Kịch bản.** `R-QDC-03` gỡ `MAKEUP_EXCEPTION_MODELS`. Job CI `e2e-r7` đỏ. Người trực CI — không phải người viết QĐ-C — "sửa cho xanh" bằng cách khôi phục ngoại lệ. Lỗ đọc chéo cơ sở mở lại, lần này **có test bảo vệ**.

**Chuỗi nhân quả.** `[QS]` `lib/db-scope.ts:343-348` khoét ngoại lệ cho 4 model (`Class`, `ClassSession`, `Lesson`, `MakeupNeed`). `[QS]` `04-assumptions.md` §8 đã ghi: `tests/e2e/r7/makeup-cross-center.spec.ts` có **3 ca KHẲNG ĐỊNH hành vi chéo cơ sở** và **import trực tiếp** `withMakeupException` ⇒ gỡ là **làm đỏ những test này theo thiết kế**, nên *"test cách ly vẫn xanh"* **không thể** là tiêu chí nghiệm thu. `[QS]` Nhưng §8 của PRD vẫn ghi điều kiện ra của pha A3 là *"Grep `MAKEUP_EXCEPTION` = 0; **test cách ly vẫn xanh**"* (`02-prd:415`).

**Đây là mâu thuẫn nội bộ giữa PRD và bằng chứng mã — ghi ở §10.**

**Dấu hiệu sớm.** Commit nào thêm lại chuỗi `MAKEUP_EXCEPTION` sau ngày A3 đóng.
**Phòng ngừa.** Xoá/viết lại `makeup-cross-center.spec.ts` **trong cùng lần phát hành** với `R-QDC-03`, và đổi điều kiện ra của A3 thành *"3 ca chéo cơ sở đã bị xoá khỏi bộ test + bộ test mới khẳng định chéo cơ sở bị CHẶN"*. **Cờ 1 KHÔNG · Cờ 2 CÓ**.
**Ai sở hữu.** Kiệt · Luân.

### KB-10 — Phiếu thu vào dải số `SR` cho pháp nhân mới

**Kịch bản.** Cơ sở FRANCHISEE thu tiền. Phiếu thu phát hành mang tiền tố `SR` thay vì mã cơ sở của họ — chứng từ mang **sai pháp nhân**. Kế toán phát hiện khi đối soát, sau khi đã phát hành hàng loạt.

**Chuỗi nhân quả.** `[QS]` `lib/finance/payment.ts:40-43` — `centerCodeOf` trả `"SR"` khi `centerId` rỗng (`:41`) **và** khi không tìm thấy `OrgUnit` theo `centerId` (`:43` — `return ou?.code ?? "SR"`). Node không mang `centerId` (xem KB-14) rơi vào đúng nhánh này.

**Dấu hiệu sớm.** Đếm `Receipt` có mã bắt đầu bằng tiền tố `SR` phát sinh **sau** ngày mở cơ sở mới.
**Phòng ngừa.** `R-D2-18` phải chặn **tại chỗ phát hành**, không chỉ tại chỗ tạo cơ sở; và trả lời **c14** (*phiếu đã phát hành sai dải số thì huỷ-phát-lại hay chấp nhận*). **Cờ 1 KHÔNG · Cờ 2 KHÔNG**.
**Ai sở hữu.** Kiệt · Kế toán tổng hợp HO.

### KB-03 — PR-D không tồn tại, hai trục sống vĩnh viễn

`[QS]` Schema ghi *"flip ở PR-D"*, `[QS]` §9 câu 15 (`02-prd:468`) hỏi trạng thái cuối và chưa ai trả lời, `[QS]` PRD tự loại việc hợp nhất khỏi phạm vi (`:354`). `[SĐ]` Không ai sở hữu ⇒ mặc định là **giữ song song vĩnh viễn**, và mỗi tính năng mới trả thêm một khoản thuế nhỏ (phải biết chọn trục nào). Thiệt hại từng lần nhỏ nên **không bao giờ đủ đau để ai đó dừng lại xử lý** — đây là dạng nợ chết người nhất.

**Phòng ngừa.** Ép §9 câu 15 vào danh sách phải trả lời **trước khi làn A đóng**, vì sau đó khối lượng dữ liệu hai trục chỉ tăng. **Cờ 1 KHÔNG · Cờ 2 KHÔNG**.

---

## 7. Dấu hiệu sớm — bảng đo, mỗi dòng là một lệnh cụ thể

Bảng này để dán vào lịch trực, không phải để đọc một lần.

| Đo cái gì | Bắt kịch bản | Tần suất | Ngưỡng báo động | Ai |
|---|---|---|---|---|
| Commit/PR chạm `prisma/seed-roles.ts` **chưa bọc `$transaction`** | KB-06 | mỗi PR | > 0 | Luân |
| Lần chạy gần nhất của workflow `seed-prod-roles.yml` | KB-06 | mỗi tuần | có lần chạy sau ngày flip mà không có thông báo trước | Luân |
| Bản ghi `SCOPED_MODELS` có `centerId IS NULL`, tách theo tuần tạo | KB-14 · KB-15 | mỗi tuần | tăng so với tuần trước | Kiệt |
| `Center` không có `OrgUnit` trỏ tới | KB-02 | mỗi tuần | > 0 | Kiệt |
| Bản ghi **mới** lệch hai trục `centerId`/`orgUnitId` trên 26 model | KB-04 | CI mỗi lần merge | > 0 | Kiệt |
| `Payment` gán cơ sở khác `Order`/`Enrollment` | KB-01 | trước mỗi bước backfill | > 0 | Kiệt |
| `Curriculum.ownerOrgUnitId` không thuộc HO | KB-16 | mỗi tháng | > 0 | Đội Đào tạo HO |
| `Receipt` mang tiền tố `SR` phát sinh sau ngày mở cơ sở mới | KB-10 | mỗi tháng | > 0 | Kế toán tổng hợp HO |
| Số dòng `UserPermissionGrant` (cả ALLOW lẫn DENY) | KB-07 | mỗi tuần | > 0 khi `can()` v2 chưa có nhánh DENY | Luân |
| Chuỗi `MAKEUP_EXCEPTION` xuất hiện lại sau khi A3 đóng | KB-09 | mỗi PR | > 0 | Kiệt |
| **Mẫu số** của mọi tiêu chí "đếm = 0" trong điều kiện ra | KB-18 | mỗi lần duyệt pha | mẫu số dưới ngưỡng tối thiểu | người duyệt pha |
| Số mã trong một "gói phải đi cùng lần phát hành" bị tách ra các PR khác nhau | KB-11 | mỗi PR | > 0 | Kiệt ↔ Luân |

---

## 8. Việc phòng ngừa xếp theo tỉ lệ lợi/chi phí

Xếp **rẻ nhất, chặn nặng nhất** lên đầu. Bốn việc đầu **không thuộc 112 yêu cầu của PRD** — chúng là việc phải làm *trước khi* chương trình bắt đầu.

| # | Việc | Cỡ | Chặn | Cờ 1 | Cờ 2 |
|---|---|---|---|---|---|
| 1 | **Bọc `seed-roles.ts` trong `$transaction`** (hoặc đổi `deleteMany`+`createMany` → `upsert` theo action) | **S** | KB-06 (CAO × NẶNG) | KHÔNG | KHÔNG |
| 2 | **Sửa header runbook `seed-prod-roles.yml:10-13`** cho khớp hiện trạng cờ | **S** | KB-06 | KHÔNG | KHÔNG |
| 3 | **Thêm mẫu số vào mọi tiêu chí "đếm = 0"** của §8 + ghi luật *"xanh trên tập nhỏ ≠ nghiệm thu"* | **S** | KB-18 (CAO × NẶNG) | KHÔNG | KHÔNG |
| 4 | **Truy vấn đối soát hai trục vào CI** (`Center` mồ côi = 0; bản ghi mới lệch trục = 0) | **S** | KB-02 · KB-04 | KHÔNG | KHÔNG |
| 5 | Quy tắc phát hành có kiểm tra cho 3 gói "phải đi cùng" | S | KB-11 | KHÔNG | KHÔNG |
| 6 | Chạy GD-28 + GD-46 **trước** mọi backfill trục | S | KB-01 | KHÔNG | KHÔNG |
| 7 | Vá `can()` v2 nhận DENY (3 việc QĐ-B) | M | KB-07 | **CÓ** | **CÓ** |
| 8 | Trả lời **c1** trước khi mở cơ sở FRANCHISEE đầu tiên | — | KB-14 | KHÔNG | KHÔNG |
| 9 | Đưa `R-DP-01` thành chốt chặn làn A | — | KB-17 | KHÔNG | KHÔNG |
| 10 | Viết lại điều kiện ra pha A3 (không dùng *"test cách ly vẫn xanh"*) | S | KB-09 | KHÔNG | **CÓ** |
| 11 | Định nghĩa lại tiêu chí khởi động làn B (cửa sổ đã đóng theo nghĩa cũ) | — | KB-05 · KB-08 | KHÔNG | KHÔNG |

`[SĐ]` **Bốn việc đầu cộng lại nhỏ hơn một yêu cầu cỡ M**, và chặn được hai kịch bản CAO × NẶNG cùng hai kịch bản ăn mòn dài hạn. Nếu chỉ làm được một việc trong cả tài liệu này thì làm **việc số 1**.

---

## 9. Cái pre-mortem này KHÔNG kết luận được

1. **Xác suất thật.** Mọi nhãn CAO/VỪA/THẤP là **phán đoán có căn cứ**, không phải thống kê. Không có dữ liệu lịch sử sự cố của đội để hiệu chỉnh.
2. **Bảy phép đo prod của BƯỚC 4 vẫn chưa chạy** (GD-28, GD-46, GD-59, GD-06, GD-24, GD-50, GD-61). Nhiều kịch bản ở đây đang **giả định hướng** của kết quả, không biết **độ lớn**.
3. **Không đánh giá được năng lực thi hành thật.** GD-26 đo được PR/commit đã qua, không đo được cam kết tương lai.
4. **Không biết cờ `RBAC_V2_ENABLED` được bật lúc nào và ai bật.** Suy ra được là **có chủ đích** (`docs/ke-hoach-go-live-2607/de-xuat-doi-cong-c.md:42` đề nghị flip 15–17/07; `lib/auth/rbac-intentional.ts` ký 09/07) nhưng **không có biên bản**. Ngày flip quyết định cách đọc mốc `24/07` của `RbacShadowDiff`.
5. **Không biết đợt security hardening đang chạy đụng file nào** — 6 kịch bản ở đây mang **Cờ 2 = CÓ** nhưng không có tài liệu phạm vi để đối chiếu (**c31** vẫn treo).
6. **Không kiểm được hành vi `result:` extension** (`R-TECH-01` / **A8**) — chưa từng chạy trong repo.
7. **Chưa xét D11, D12, `modules/*`** — PRD tự loại (`02-prd:373`), nên pre-mortem cũng không xét.

---

## 10. Mâu thuẫn phải báo lên — KHÔNG tự hoà giải

Bốn mục dưới đây là **quyết định đã ký mâu thuẫn với hiện trạng mã nguồn**, hoặc tài liệu mâu thuẫn nội bộ. Theo luật của chương trình, BƯỚC 5 **dừng và báo**, không tự chọn bên.

**M1 — QĐ-B đã bị vi phạm.** `[QS]` `QUYET-DINH.md:58` ⛔ **CHẶN CỨNG**: *"KHÔNG được bật `RBAC_V2_ENABLED` cho tới khi (1)+(2)+(3) xong"*. Đo 29/07: cờ **đã bật**; grep `grantsDeny` trong `lib/auth/` → **0 kết quả**; `lib/auth/can.ts:36-44` không có nhánh DENY; không có bộ test ma trận `DENY × scopeType`. `[QS]` `QUYET-DINH.md:59` còn ghi *"Điều này chặn lịch flip của đợt go-live RBAC đang chạy. Cần báo lại chủ đợt đó."* — **việc báo lại nay đổi nội dung**: không còn là *"QĐ-B chặn lịch flip"* mà là *"flip đã xảy ra trước khi làm xong 3 việc"*.
**Cần ai:** Ban giám đốc + chủ đợt go-live RBAC + Luân. **Chặn:** toàn bộ nhánh QĐ-B, và điều kiện Đ7 của `04-assumptions.md` §10.
**Giảm nhẹ đã đo được:** `UserPermissionGrant` rỗng ⇒ chưa thiệt hại. Đây là thông tin để **xếp lịch**, không phải để đóng mâu thuẫn.

**M2 — QĐ-A.1 treo vào một điều kiện đã hết hiệu lực.** `[QS]` `QUYET-DINH.md:42` chốt việc thu hẹp `isHoLevel` *"phải xếp lịch sau khi cửa sổ shadow đóng"*, bảng tra `:100` đánh QĐ-A.1 là **✅ CÓ đụng shadow**. `[QS]` §8 xếp `R-D4-09` ở **B5** (`02-prd:434`). `[QS]` `01-intended-vs-implemented.md:70-72` ghi ngược lại: *"THỨ TỰ KHÔNG ĐẢO ĐƯỢC: sửa `isHoLevel` TRƯỚC, rồi mới dựng đường tạo `OrgUnit`"*. Cờ đã bật ⇒ **điều kiện "chờ cửa sổ đóng" không còn định nghĩa được**, và vòng khoá ba nguồn (**c43**) vẫn nguyên.
**Cần ai:** Ban giám đốc + chủ đợt go-live RBAC + Luân.

**M3 — điều kiện ra của pha A3 tự mâu thuẫn với bằng chứng mã.** `[QS]` `02-prd:415` đặt điều kiện ra *"Grep `MAKEUP_EXCEPTION` = 0; **test cách ly vẫn xanh**"*. `[QS]` `tests/e2e/r7/makeup-cross-center.spec.ts` có 3 ca **khẳng định** hành vi chéo cơ sở và import trực tiếp `withMakeupException` ⇒ thi hành QĐ-C **bắt buộc** làm đỏ chúng. Hai vế không cùng đúng được.
**Cần ai:** Kiệt + Luân (kỹ thuật), không cần Ban. Nhưng phải sửa **điều kiện ra**, không phải sửa test cho xanh.

**M4 — con số đội trong PRD không khớp thực tế.** `[QS]` `02-prd:31` ghi *"Đội kỹ thuật (4–5 dev)"*; `docs/ke-hoach-go-live-2607/README.md:12-16` cho thấy **3 người**. **A7** (`:387`) suy ra *"lộ trình giãn ra, thứ tự vẫn đúng"* — kết luận này chỉ đúng nếu thiếu người làm chậm đều, mà §8 lại có ba gói **không được tách**.
**Cần ai:** Ban giám đốc (**c42**).

---

## 11. Truy vết

**Kịch bản → mã `R-*` bị ảnh hưởng → làn**

| Kịch bản | Mã `R-*` | Làn |
|---|---|---|
| KB-01 | `R-D10-06/07/08` · `R-OPS-03` · `R-OPS-05` | B5 |
| KB-02 · KB-04 | `R-D2-19/20` · `R-D4-13` · `R-D2-16` | A1 + B4/B6 |
| KB-03 | toàn bộ chiến lược migration (§9 câu 15) | **không có làn** |
| KB-05 · KB-08 | `R-QDB-01..05` · `R-D4-12` | B1 + **điều kiện khởi động làn B** |
| KB-06 | `R-D4-01..05` · `R-D4-10` · mọi mã chạm `seed-roles.ts` | **trước cả làn A** |
| KB-07 | `R-QDB-01/02/03` · `R-DP-02` · `R-D9-05b` | B1 + B3 |
| KB-09 | `R-QDC-01..05` | A3 |
| KB-10 | `R-D2-16/17/18` · `R-D10-08` | A1 + B5 |
| KB-11 · KB-12 · KB-13 | `R-D2-16+17+18` · `R-QDB-02+03` · `R-D3-10` | A + B |
| KB-14 · KB-15 | `R-D2-07` · `R-D2-16/17/18` · `R-D2-19/20` | A1 + A4 |
| KB-16 | `R-D8-01` · `R-D10-02/03/12` · `R-D9-09` | A2 + B5 |
| KB-17 | `R-DP-01..07` | **không có làn** |
| KB-18 | điều kiện ra của **cả 9 pha làn A** | A |

**Kiểm chứng.** Mọi `đường-dẫn:số-dòng` trong file này đã được mở lại bằng Read/Grep **trước khi viết**. Bốn trích dẫn mới của vòng này, tự kiểm hôm nay: (a) `prisma/seed-roles.ts:554` `deleteMany` · `:556` `createMany`, grep `\$transaction` toàn file = **0 kết quả**; (b) `.github/workflows/seed-prod-roles.yml:10-11` (câu "RBAC_V2 OFF") và `:59` (lệnh chạy); (c) `lib/db-scope.ts:254` — `if (record.centerId == null) return NULL_IS_GLOBAL_MODELS.has(model)`; (d) `lib/finance/payment.ts:41` (`if (!centerId) return "SR"`) và `:43` (`return ou?.code ?? "SR"`). Bốn số đo prod ở §2 lấy từ `scripts/sql/phone-audit.sql` chạy trong Supabase SQL Editor ngày 29/07/2026.

**Quan hệ với các bước khác.** BƯỚC 5 **không** đánh giá lại 84 giả định của BƯỚC 4 — nó dùng chúng làm đầu vào. Chỗ nào BƯỚC 4 đã sai tiền đề thì `04-assumptions.md` **§0** đã đính chính; file này xây trên bản đã đính chính. Các thí nghiệm Đ1–Đ8 (`04-assumptions.md` §10) **vẫn là điều kiện chưa đạt** — riêng thí nghiệm #1 (GD-44) và #2 (GD-62) phải **soạn lại ngưỡng** vì thiết kế cho trạng thái "cờ OFF".

---

Bước này không sửa bất kỳ file nào khác ngoài E:/satarobo-vn/docs/taicautruc/05-premortem.md.
