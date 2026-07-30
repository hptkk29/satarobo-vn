# BƯỚC 4 — Giả định rủi ro của nền tảng tổ chức + phân quyền + nhượng quyền

> Ngày 28/07/2026 · phạm vi **BƯỚC 4a + 4b** · nguồn: `02-prd-franchise-platform.md` (112 yêu cầu), `QUYET-DINH.md`, `00-*.md`, `01-intended-vs-implemented.md`, `03-job-stories.md` · phương pháp: **3 góc nhìn (PM / Thiết kế / Kỹ sư) × 4 nhóm rủi ro**, chấm **Impact × Risk** với **Risk = (1 − Confidence/10) × Effort** (Confidence 1–10, Effort 1–10 → Risk ∈ [0; 9]); **hai người chấm độc lập rồi chốt**.
>
> **Kết quả vòng này: 84 giả định** — 11 phát biểu đã bị bác ở vòng phản biện (giữ ở **§8** để không ai nêu lại; §9 là danh sách **câu hỏi mới**), **17 mã vào ô THÍ_NGHIỆM**, 60 mã LÀM_LUÔN, 0 mã CẮT, 7 mã HOÃN.

---

## 0. ⚠️ ĐÍNH CHÍNH 29/07/2026 — đọc TRƯỚC khi dùng bất cứ mục nào bên dưới

Tài liệu này viết ngày 28/07 trên **hai tiền đề nay đã sai**. Đo thật trên prod ngày 29/07:

| Tiền đề cũ (sai) | Sự thật đo được 29/07 | Nguồn |
|---|---|---|
| `RBAC_V2_ENABLED` **OFF**, prod enforce v1 | **Cờ ĐÃ BẬT** — `RBAC_V2_ENABLED="true"` trên Vercel **Production**. Prod enforce **v2**. Mặc định trong code vẫn OFF (`lib/flags.ts:8`) nên **local/dev/CI chạy v1** — đây là chỗ sinh ra hiểu nhầm | `vercel env pull --environment=production` (29/07); `lib/auth/shadow-compare.ts:27` |
| Đồng hồ shadow **có thể đã đứng** (18 ngày không có dòng lệch) | **Đồng hồ đang chạy.** `RbacShadowDiff` có dòng liên tục **24/07 → 28/07**. Câu "18 ngày" trong `00-baseline.md:109` nói về **file `shadow-log.md` không được cập nhật**, KHÔNG phải bảng diff rỗng | truy vấn `min/max("createdAt")` trên prod 29/07 |

**Toàn cảnh lệch v1↔v2 trên prod (29/07):** đúng **2 nhóm**, cả hai chiều `v1=true → v2=false` (**siết**, không nới):
`leads:delete` 63 dòng (25→28/07) · `students:delete` 2 dòng (24→25/07) — **cả hai đã ký siết** ở `lib/auth/rbac-intentional.ts:53-55`. **0 dòng nới quyền.**
⚠️ Đừng đọc "63" thành "63 lần thao tác bị chặn": `app/(admin)/admin/leads/page.tsx:257` gọi `checkPermission('leads:delete')` để ẩn/hiện nút ⇒ **mỗi lượt mở trang là một dòng**.

**Cái gì trong tài liệu này phải đọc lại:**

| Mục | Vì sao hỏng | Hướng đọc lại |
|---|---|---|
| §2 mục 2 · **GD-43** · **GD-72** | Dựng trên "prod trả v1 nên cắt `UserOrgRole` không cắt quyền hành động". v2 **đọc** `UserOrgRole` ⇒ kết luận **đảo chiều** | Cắt nguồn vai trò **CÓ** tác động quyền hành động trên prod. Vẫn còn khoảng hở phiên đang mở (`tokenVersion` không nằm trên đường GHI) — phần đó giữ nguyên |
| §2 mục 3 · **GD-62** · **GD-76** | Dựng trên "0 lệch, đồng hồ có thể hỏng" | Đồng hồ **có** ghi. Câu hỏi còn lại đổi thành: *tại sao chỉ 2 nhóm trên tập traffic nhỏ (prod chỉ 41 lead / 2 học viên / 1 nhân viên)* |
| §2 mục 4 · **GD-44** | "Đèn xanh không phải cổng mở cờ" — vẫn đúng, **nhưng cờ đã bật rồi** | 3 việc chặn cứng của QĐ-B (`QUYET-DINH.md:52-58`) **chưa việc nào xong**: `grantsDeny` không tồn tại; `lib/auth/can.ts:36-44` là ALLOW-wins thuần, không nhánh DENY; không có test ma trận `DENY × scopeType`. ⇒ **Mọi `UserPermissionGrant` DENY đang bị bỏ qua trên prod.** Đ7 (§10) đổi từ *"báo rằng QĐ-B chặn lịch flip"* sang *"báo rằng flip đã xảy ra trước khi làm xong 3 việc"* |
| §10 **Đ1** (9 thí nghiệm) | Thí nghiệm #1 (GD-44) và #2 (GD-62) thiết kế cho trạng thái "cờ OFF" | Hai thí nghiệm này phải **soạn lại ngưỡng** trước khi giao — đo trên hệ đã flip khác đo trên hệ đang shadow |

**Đã đo nốt 29/07:** `UserPermissionGrant` trên prod **rỗng hoàn toàn** — **0 ALLOW, 0 DENY**. ⇒ Lỗ hổng DENY là **hố chờ sập, chưa gây thiệt hại**: không lệnh cấm nào đang bị vô hiệu vì chưa ai từng tạo grant. Nó là **nợ kỹ thuật có lịch được**, không phải sự cố phải xử ngay. Luật tạm: không tạo grant `DENY` cho tới khi `can()` v2 có nhánh DENY.
Kèm theo, hai con số đóng khung phạm vi: `UserOrgRole` = **25 dòng**; `RbacShadowDiff` = **65 dòng, toàn bộ trong 7 ngày** (63 `leads:delete` + 2 `students:delete`) ⇒ **không còn nhóm lệch nào khác ngoài hai nhóm đã ký siết**.
⚠️ Hệ quả cho **GD-04** (§2 mục 5, *"grant ALLOW hiện mở toàn cục, không xét mục tiêu"* — `lib/auth/can.ts:41`): cơ chế vẫn đúng nguyên văn, **nhưng số bản ghi thực tế = 0**, nên Impact thực tế hiện thời **bằng 0**. Vẫn phải vá trước khi ai đó dùng grant lần đầu.

Các mục §1–§11 **giữ nguyên văn bản gốc ngày 28/07**, không sửa tại chỗ, để còn truy được vòng lập luận cũ.

---

## 1. Cách đọc

**Ký hiệu**

| Ký hiệu | Nghĩa |
|---|---|
| `[QS]` | **Quan sát** — đọc được từ mã nguồn hoặc tài liệu, **kèm `đường-dẫn:số-dòng`**. Mọi trích dẫn trong file này đã được mở lại và kiểm từng dòng trước khi viết. |
| `[SĐ]` | **Suy đoán** — không có dòng mã nào chứng minh; là phán đoán, **phải kiểm mới dùng được**. |
| `GD-NN` | Mã giả định, đánh số phẳng `GD-01` → `GD-84`. Mã **ổn định**: vòng sau không đánh số lại, chỉ thêm mã mới ở cuối. Nhóm rủi ro và góc nhìn là **thuộc tính** của mã, không nằm trong mã. |

**Bốn ô ma trận Impact × Risk**

| Ô | Điều kiện | Nghĩa |
|---|---|---|
| **THÍ_NGHIỆM** | Impact ≥ 6 **và** Risk ≥ 5 | Sai là hỏng nhiều, mà chưa ai biết đúng hay sai → **phải kiểm trước khi cam kết thẻ thi công**. |
| **LÀM_LUÔN** | Impact ≥ 6 **và** Risk < 5 | Quan trọng nhưng đã đủ chắc → gắn vào tiêu chí nghiệm thu của mã `R-*` liên quan, **không tốn thí nghiệm riêng**. |
| **CẮT** | Impact < 6 **và** Risk ≥ 5 | Không chắc mà hậu quả nhỏ → cắt khỏi phạm vi, không tiêu công suất. **Vòng này 0 mã.** |
| **HOÃN** | Impact < 6 **và** Risk < 5 | Ghi lại để vòng sau không nêu lại; làm kèm việc khác khi tiện. |

Bốn điều kiện trên **phủ kín** mặt phẳng Impact × Risk và **không chồng nhau** — ngưỡng Impact là **6 cho cả bốn ô** (vòng trước để THÍ_NGHIỆM ở ngưỡng 7 nên vùng `Impact = 6 ∧ Risk ≥ 5` không thuộc ô nào, phải cứu `GD-50` bằng ghi chú ngoại lệ; nay `GD-50` vào THÍ_NGHIỆM **bằng luật**).

Risk = (1 − Confidence/10) × Effort. Confidence và Effort đều thang 1–10.

**Hai cờ lịch — chuẩn lấy nguyên từ `02-prd-franchise-platform.md:360-364`** `[QS]`

- **Cờ 1 — đụng cửa sổ shadow-compare:** thay đổi có làm **đổi giá trị trả về của hàm quyền động trên dữ liệu đang có** không? Thêm hàm mới mà **chưa có nơi gọi** → **KHÔNG** đụng (`02-prd:362-363`).
- **Cờ 2 — đụng phạm vi dữ liệu:** thay đổi có làm đổi **tập bản ghi** mà một tài khoản đọc được không? Đây mới là cờ **nói chuyện với đợt security hardening** đang chạy song song (`02-prd:364`).

⚠️ **Luật chấm cờ đã thống nhất:** một **truy vấn chỉ-đọc để đo** thì **Cờ 1 = KHÔNG, Cờ 2 = KHÔNG** — đọc không đổi giá trị hàm quyền, cũng không đổi tập bản ghi của ai. Cờ chỉ thuộc về **hành động vá**, và thuộc về mã `R-*` của việc vá.

**Phạm vi tài liệu này**

- Các quyết định **D1–D12** và **QĐ-A / QĐ-A.1 / QĐ-B / QĐ-C / QĐ-D** đã chốt — tài liệu này **không mở lại** chúng. Được phép nêu **điều kiện để chúng đứng vững**; không được đề xuất huỷ.
- Thuật ngữ (`QUYET-DINH.md:6`): **FRANCHISOR** = bên **nhượng** quyền = khối HO · **FRANCHISEE** = bên **nhận** nhượng quyền. Không dùng chữ "nhượng quyền" trần cho cơ sở của bên nhận.

---

## 2. Mười dòng cho người không đọc hết

1. `[SĐ]` **Hai giả định Impact 10 đều không kiểm được bằng mã nguồn** — `GD-06` (bên NHẬN nhượng quyền ghi đủ doanh thu vào hệ thống HO) và `GD-32` (bên NHẬN chấp nhận HO xem chi tiết từng dòng). Cả hai là điều khoản thương lượng, không phải cấu hình. Sai một trong hai → `R-D10-04` (màn hình chi tiết tài chính, cỡ L) xây xong để không ai dùng, và `R-D9-09` mất nguồn số để tính phí.
2. `[QS]` **Cắt vai trò hôm nay KHÔNG cắt quyền hành động** (`GD-43`, `GD-72`): cờ v2 đang OFF (`lib/flags.ts:7-9`), câu lệnh trả về chốt ở `lib/auth/shadow-compare.ts:20` và `:27` (`return flagOn ? params.v2 : params.v1`) nên prod trả v1 — v1 đọc phiên, không chạm `UserOrgRole`. `tokenVersion` chỉ đối chiếu ở 2 layout (`app/(admin)/admin/layout.tsx:49-62`, `app/(teacher)/teacher/layout.tsx:57-65`) và `requireLiveSession` (`lib/auth/live-session.ts:24`) cho 3 route xuất dữ liệu — **không điểm nào nằm trên đường GHI**.
3. `[QS]` **Đồng hồ shadow có thể đã đứng** (`GD-62`, `GD-76`, Impact 9): `00-baseline.md:109` ghi **18 ngày không có dòng lệch mới**, kèm workflow TRUNCATE và cơ chế ghi diff fire-and-forget. Cả 7 nhánh B1–B7 (`02-prd:429-437`) dựng trên con số 0 đó. Nếu số 0 là "đồng hồ hỏng" chứ không phải "hệ thống sạch", **cả làn B khởi động trên bằng chứng giả**.
4. `[QS]` **Đèn shadow xanh KHÔNG phải cổng mở cờ v2** (`GD-44`): QĐ-B (`QUYET-DINH.md:46-61`) đã chốt v2 **phải** tôn trọng DENY và đặt **chặn cứng 3 việc** trước khi bật (`QUYET-DINH.md:52-58`) — thêm `grantsDeny` vào `Actor`, ngoại lệ tường minh cho `SUPER_ADMIN`, bộ test ma trận DENY × scopeType. `QUYET-DINH.md:59` còn đòi **BÁO LẠI** chủ đợt go-live RBAC rằng lịch flip đang bị chặn — đó là nghĩa vụ, không phải câu hỏi.
5. `[QS]` **Grant ALLOW hiện mở toàn cục, không xét mục tiêu** (`GD-04`, đã chứng minh — không còn gì để thí nghiệm): `lib/auth/can.ts:41` là `if (actor.grantsAllow.has(action)) return true;`, đứng **trước** vòng lặp xét scope. Vá tầng cách ly không bịt được lối này.
6. `[QS]` **Hai trục `centerId` và `orgUnitId` đang chạy song song** (`GD-46`, Impact 9) và **chưa ai đo tỉ lệ bản ghi tiền gán SAI cơ sở** (`GD-28`, Impact 9). Backfill suy diễn trên dữ liệu sai sẽ **củng cố cái sai** rồi kế toán ký lên nó — sau đó không quay lui được.
7. `[QS]` **Chưa có điểm gắn che trường vừa biết actor vừa phủ hết đường đọc** (`GD-54`, Impact 8): hook `result:` gắn vào `scopedDb` không với tới truy vấn `db` trần dưới `lib/`, và `R-D4-10` (`02-prd:237`) — mã mở rộng cổng ESLint sang `lib/` — **không nằm trong bất kỳ pha nào** của §8 (`02-prd:413-437`), tức khoảng hở này **không có ngày kết thúc**.
8. `[QS]` **Thu hẹp `isHoLevel` chạm rộng hơn dự tính** (`GD-61`, Impact 8): tự đếm được **41 tệp** dưới `app/` + `lib/` tham chiếu `isHoLevel`, trong đó có đường duyệt học bạ, báo cáo doanh thu và sửa chương trình. `R-D4-09` nằm giữa chuỗi B5 (`02-prd:434`) nên trượt là kéo cả nhánh D10.
9. `[QS]` **Ô chọn đơn vị vẫn là bẫy sinh bản ghi vô hình** (`GD-59`, `GD-47`): `DEFAULT_SELECTABLE_TYPES` gồm HO · CENTER · CAMPUS · PARTNER · FRANCHISE (`lib/org/org-tree.ts:128-134`) trong khi `centerId` **chỉ** được set cho type `CENTER` (`lib/org/orgunit-rules.ts:59-62`) → **4/5 type chọn được cho ra `centerId = null`**, mà bản ghi `centerId` null bị `passesScope` chặn (`lib/db-scope.ts:254`, trừ `NULL_IS_GLOBAL_MODELS` `:49-53`). Enum đã có sẵn `FRANCHISE` và `PARTNER` (`prisma/schema.prisma:286-293`, `lib/org/types.ts:4-11`) — **chưa ai hỏi node của bên NHẬN nhượng quyền là loại gì**, câu này chặn A6 và chặn gói cổng tạo cơ sở (`02-prd:399-401`).
10. `[SĐ]` **Nếu 17 mã ô THÍ_NGHIỆM không có thí nghiệm chạy xong trước khi mở thẻ**, BƯỚC 5 (pre-mortem) sẽ mổ một kế hoạch mà 17 điểm gãy nặng nhất vẫn là phỏng đoán — và bốn trong số đó (`GD-06`, `GD-32`, `GD-26`, `GD-44`) **không một dòng mã nào trả lời hộ được**.

---

## 3. Bảng tổng hợp toàn bộ 84 giả định

Sắp theo ô (THÍ_NGHIỆM → LÀM_LUÔN → CẮT → HOÃN), trong mỗi ô sắp **Impact giảm dần**.

| Mã | Tiêu đề | Nhóm rủi ro | Góc nhìn | Impact | Risk | Ô | Làn | Cờ 1 | Cờ 2 |
|---|---|---|---|---|---|---|---|---|---|
| **GD-06** | Bên nhận ghi đủ doanh thu vào hệ thống HO | GIÁ_TRỊ | PM | 10 | 5.6 | THÍ_NGHIỆM | B | KHÔNG | KHÔNG |
| **GD-32** | Bên nhận chấp nhận HO xem chi tiết từng dòng | KHẢ_THI_KINH_DOANH | PM | 10 | 5.6 | THÍ_NGHIỆM | B | KHÔNG | CÓ |
| **GD-26** | Đội 4–5 dev còn công suất cho 112 yêu cầu | KHẢ_THI_KINH_DOANH | PM | 9 | 6.4 | THÍ_NGHIỆM | A+B | KHÔNG | KHÔNG |
| **GD-43** | Cắt nguồn vai trò (biên chế / kiêm nhiệm / hợp đồng nhượng quyền) là cắt được quyền GHI ở mọi đường | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 9 | 6.4 | THÍ_NGHIỆM | B | CÓ | CÓ |
| **GD-44** | Cửa sổ shadow đóng được trước khi làn B khởi động | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 9 | 6.4 | THÍ_NGHIỆM | B | KHÔNG | KHÔNG |
| **GD-76** | Đồng hồ shadow xanh nghĩa là bật cờ v2 an toàn | KHẢ_THI_KỸ_THUẬT | PM | 9 | 6.4 | THÍ_NGHIỆM | B | CÓ | KHÔNG |
| **GD-28** | Dữ liệu tiền cũ nạp được đơn vị đủ chuẩn để kế toán ký bản đối soát | KHẢ_THI_KINH_DOANH | Kỹ sư | 9 | 5.6 | THÍ_NGHIỆM | B | KHÔNG | CÓ |
| **GD-46** | Hai trục `centerId` và `orgUnitId` song song là trạng thái ổn định | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 9 | 5.6 | THÍ_NGHIỆM | A+B | KHÔNG | CÓ |
| **GD-62** | Đồng hồ shadow đang chạy và số 0 của nó là số thật | KHẢ_THI_KỸ_THUẬT | PM | 9 | 5.6 | THÍ_NGHIỆM | B | KHÔNG | KHÔNG |
| **GD-09** | Cửa sổ, dấu chìm và nhật ký đủ để chống rò rỉ | GIÁ_TRỊ | PM | 8 | 6.4 | THÍ_NGHIỆM | A | KHÔNG | KHÔNG |
| **GD-45** | Bộ bằng chứng nghiệm thu cách ly hiện có chứng minh được ranh giới dữ liệu giữa hai pháp nhân | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 8 | 6.4 | THÍ_NGHIỆM | A+B | KHÔNG | CÓ |
| **GD-54** | Có điểm gắn che trường vừa biết actor vừa phủ hết đường đọc (kể cả truy vấn trong `lib/`) | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 8 | 6.4 | THÍ_NGHIỆM | B | KHÔNG | KHÔNG |
| **GD-59** | Chỉ có ba trục, không có trục thứ tư | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 8 | 5.6 | THÍ_NGHIỆM | A+B | KHÔNG | CÓ |
| **GD-61** | Thu hẹp `isHoLevel` chỉ đụng `actor.ts` và `db-scope.ts` | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 8 | 5.6 | THÍ_NGHIỆM | B | CÓ | CÓ |
| **GD-02** | Không thao tác tay, không sửa file nghĩa là mở được cơ sở | GIÁ_TRỊ | PM | 7 | 5.6 | THÍ_NGHIỆM | A | KHÔNG | KHÔNG |
| **GD-24** | Giáo viên chỉ cần nội dung quanh ngày buổi dạy | KHẢ_DỤNG | Thiết kế | 7 | 5.6 | THÍ_NGHIỆM | A | KHÔNG | CÓ |
| **GD-50** | Ba mức danh mục áp được chỉ bằng cách thêm cột chủ sở hữu | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 6 | 5.6 | THÍ_NGHIỆM | A | KHÔNG | CÓ |
| **GD-01** | Việc cấp vai trò Đào tạo cho bên nhận là quyết định có kiểm soát | GIÁ_TRỊ | PM | 9 | 3.6 | LÀM_LUÔN | A | KHÔNG | KHÔNG |
| **GD-27** | Nhóm dữ liệu cá nhân sẽ có người nhận dù không nằm làn nào | KHẢ_THI_KINH_DOANH | PM | 9 | 4.8 | LÀM_LUÔN | chưa rõ | KHÔNG | chưa rõ |
| **GD-30** | Một dải số phiếu thu theo mã cơ sở là đủ cho pháp nhân riêng | KHẢ_THI_KINH_DOANH | PM | 9 | 4.2 | LÀM_LUÔN | A+B | KHÔNG | KHÔNG |
| **GD-31** | Chuyển lớp / chuyển cơ sở qua ranh giới pháp nhân hoãn được, để chạy nguyên trạng vẫn an toàn | KHẢ_THI_KINH_DOANH | PM | 9 | 4.2 | LÀM_LUÔN | B | KHÔNG | CÓ |
| **GD-36** | Bên nhận chịu dùng nguyên chương trình HO, không tự soạn | KHẢ_THI_KINH_DOANH | PM | 9 | 4.2 | LÀM_LUÔN | A | KHÔNG | CÓ |
| **GD-04** | Vá tầng cách ly là đủ để grant ALLOW hết mở toàn cục | GIÁ_TRỊ | Kỹ sư | 8 | 4.8 | LÀM_LUÔN | B | CÓ | CÓ |
| **GD-05** | Danh mục học liệu toàn mạng lưới không phải thứ cần che | GIÁ_TRỊ | PM | 8 | 3.5 | LÀM_LUÔN | A | CÓ | CÓ |
| **GD-18** | Có kỳ đóng băng để kế toán ký xác nhận | KHẢ_DỤNG | Thiết kế | 8 | 4.2 | LÀM_LUÔN | B | KHÔNG | KHÔNG |
| **GD-21** | Nghỉ việc có một tín hiệu duy nhất máy đọc được | KHẢ_DỤNG | Thiết kế | 8 | 4.2 | LÀM_LUÔN | B | CÓ | CÓ |
| **GD-35** | Toàn bộ chương trình hiện có đều thuộc HO | KHẢ_THI_KINH_DOANH | PM | 8 | 1.5 | LÀM_LUÔN | A | KHÔNG | KHÔNG |
| **GD-37** | Điều động qua ranh giới pháp nhân là hợp lệ | KHẢ_THI_KINH_DOANH | PM | 8 | 3.5 | LÀM_LUÔN | A+B | KHÔNG | CÓ |
| **GD-38** | Một tỉ lệ phí là đủ mô tả nghĩa vụ tài chính hợp đồng | KHẢ_THI_KINH_DOANH | PM | 8 | 3.5 | LÀM_LUÔN | A+B | KHÔNG | KHÔNG |
| **GD-39** | Vai trò phụ trách dữ liệu theo đơn vị lắp được lên module hiện có | KHẢ_THI_KINH_DOANH | Thiết kế | 8 | 3.6 | LÀM_LUÔN | B | KHÔNG | CÓ |
| **GD-40** | Bốn bảng không có trường cơ sở sẽ có nơi khác nhận | KHẢ_THI_KINH_DOANH | PM | 8 | 4.0 | LÀM_LUÔN | A+B | KHÔNG | CÓ |
| **GD-41** | Rò rỉ tài liệu chỉ nằm ở khu admin và khu giáo viên | KHẢ_THI_KINH_DOANH | PM | 8 | 4.2 | LÀM_LUÔN | A | KHÔNG | CÓ |
| **GD-47** | Mở đường tạo cây trước, siết `isHoLevel` sau là an toàn | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 8 | 4.2 | LÀM_LUÔN | A+B | KHÔNG | CÓ |
| **GD-48** | Không ai chạy lại script tổ chức sau khi chuyển cây | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 8 | 2.1 | LÀM_LUÔN | A | KHÔNG | CÓ |
| **GD-51** | Xoá mềm đơn vị chỉ ảnh hưởng cây, không ảnh hưởng dữ liệu | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 8 | 3.2 | LÀM_LUÔN | A+B | KHÔNG | CÓ |
| **GD-56** | Quay lui được đợt chuyển đổi cây bằng backup hiện có | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 8 | 3.5 | LÀM_LUÔN | A+B | KHÔNG | chưa rõ |
| **GD-63** | `Class.curriculumId` là con trỏ đáng tin để giải chương trình | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 8 | 3.0 | LÀM_LUÔN | A | KHÔNG | CÓ |
| **GD-65** | Mọi khoản thu đều đi được tới sổ doanh thu | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 8 | 3.5 | LÀM_LUÔN | A+B | KHÔNG | KHÔNG |
| **GD-72** | Cắt nguồn là đuổi được phiên đang mở | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 8 | 3.2 | LÀM_LUÔN | B | KHÔNG | CÓ |
| **GD-07** | Trả null ở kết quả là đã che được trường nhạy cảm | GIÁ_TRỊ | Kỹ sư | 7 | 4.8 | LÀM_LUÔN | B | KHÔNG | KHÔNG |
| **GD-08** | Che tầng đọc thay được che tầng ghi nên xoá 9 chỗ che tay là an toàn | GIÁ_TRỊ | Kỹ sư | 7 | 2.4 | LÀM_LUÔN | B | KHÔNG | KHÔNG |
| **GD-11** | Giáo viên dạy thay mở được nội dung buổi mình dạy | KHẢ_DỤNG | Kỹ sư | 7 | 3.5 | LÀM_LUÔN | A+B | KHÔNG | CÓ |
| **GD-15** | Người cấp quyền sẽ nhập hạn khớp với đợt điều động | KHẢ_DỤNG | Thiết kế | 7 | 2.8 | LÀM_LUÔN | A+B | CÓ | CÓ |
| **GD-19** | Mở phạm vi xem chi tiết cho HO là THÊM quyền | KHẢ_DỤNG | Thiết kế | 7 | 4.2 | LÀM_LUÔN | B | CÓ | CÓ |
| **GD-20** | Người xếp lớp sẽ không sửa cơ sở của giáo viên | KHẢ_DỤNG | Thiết kế | 7 | 3.0 | LÀM_LUÔN | A+B | KHÔNG | CÓ |
| **GD-33** | Thời gian chuyển tiếp chỉ-đọc là phương án hai bên chấp nhận | KHẢ_THI_KINH_DOANH | PM | 7 | 3.0 | LÀM_LUÔN | B | chưa rõ | CÓ |
| **GD-52** | Khoá `parentId` trong seed là đủ để bảo vệ cây do vận hành sửa | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 7 | 2.4 | LÀM_LUÔN | A | KHÔNG | CÓ |
| **GD-53** | Gán giáo viên vào lớp là cửa cấp phạm vi thứ hai | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 7 | 4.0 | LÀM_LUÔN | A+B | CÓ | CÓ |
| **GD-55** | Mỗi cơ sở có đúng một hợp đồng hiệu lực tại một thời điểm | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 7 | 3.5 | LÀM_LUÔN | A+B | chưa rõ | KHÔNG |
| **GD-57** | Mỗi dòng quyền chỉ mang được đúng một nguồn | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 7 | 2.8 | LÀM_LUÔN | A+B | CÓ | CÓ |
| **GD-58** | Đủ dữ liệu để dựng trục biên chế | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 7 | 4.2 | LÀM_LUÔN | A+B | KHÔNG | CÓ |
| **GD-64** | Mọi giáo viên thật đều đã có vai trò giảng dạy trong sổ phân quyền | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 7 | 2.4 | LÀM_LUÔN | A+B | KHÔNG | CÓ |
| **GD-66** | Dữ liệu của bên nhận tách được ra để bàn giao | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 7 | 3.6 | LÀM_LUÔN | B | KHÔNG | KHÔNG |
| **GD-67** | Một hợp đồng phủ đúng một cơ sở nên tiền cộng phẳng được | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 7 | 2.8 | LÀM_LUÔN | B | KHÔNG | KHÔNG |
| **GD-68** | Tác vụ nền chạy một danh tính toàn cục vẫn chấp nhận được | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 7 | 2.4 | LÀM_LUÔN | B | KHÔNG | CÓ |
| **GD-71** | Phân loại được nguồn cho các dòng quyền đang có | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 7 | 3.2 | LÀM_LUÔN | A+B | KHÔNG | KHÔNG |
| **GD-73** | Hồ sơ nhân sự luôn nối được tới tài khoản | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 7 | 2.1 | LÀM_LUÔN | A+B | CÓ | CÓ |
| **GD-75** | Đổi che trường từ role sang actor chỉ siết, không nới | KHẢ_THI_KỸ_THUẬT | Thiết kế | 7 | 2.4 | LÀM_LUÔN | B | KHÔNG | KHÔNG |
| **GD-77** | Mọi buổi học đều nối được tới một bài trong chương trình | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 7 | 1.8 | LÀM_LUÔN | A | KHÔNG | CÓ |
| **GD-82** | Đổi tiền tố tệp R2 theo đơn vị là việc cỡ L khép kín | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 7 | 4.9 | LÀM_LUÔN | A+B | KHÔNG | KHÔNG |
| **GD-83** | Prisma `result:` đè được trường vô hướng có sẵn (A8) | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 7 | 4.2 | LÀM_LUÔN | B | KHÔNG | KHÔNG |
| **GD-12** | Con số 23 tài khoản thật là con số đúng để lập bảng ánh xạ | KHẢ_DỤNG | Thiết kế | 6 | 2.8 | LÀM_LUÔN | A | KHÔNG | KHÔNG |
| **GD-13** | Người phụ trách nhân sự sẽ nhập kiêm nhiệm vào hệ thống | KHẢ_DỤNG | Thiết kế | 6 | 3.6 | LÀM_LUÔN | A | KHÔNG | KHÔNG |
| **GD-14** | Vai trò giảng dạy là một tập mã đóng | KHẢ_DỤNG | Thiết kế | 6 | 2.4 | LÀM_LUÔN | A | KHÔNG | CÓ |
| **GD-17** | Buổi mà giao diện gắn vào liên kết đúng buổi đang chuẩn bị | KHẢ_DỤNG | Thiết kế | 6 | 4.2 | LÀM_LUÔN | A | KHÔNG | CÓ |
| **GD-22** | Có danh sách action miễn nhiễm DENY đủ để `SUPER_ADMIN` không tự khoá | KHẢ_DỤNG | Thiết kế | 6 | 2.8 | LÀM_LUÔN | B | CÓ | KHÔNG |
| **GD-29** | Cơ sở bên nhận hiện trên site thương hiệu như cơ sở nội bộ | KHẢ_THI_KINH_DOANH | PM | 6 | 3.5 | LÀM_LUÔN | chưa rõ | KHÔNG | KHÔNG |
| **GD-34** | Mã không nằm trong pha nào vẫn làm được song song | KHẢ_THI_KINH_DOANH | PM | 6 | 3.5 | LÀM_LUÔN | chưa rõ | CÓ | KHÔNG |
| **GD-42** | Tỉ lệ phân bổ chỉ là số tham khảo nội bộ | KHẢ_THI_KINH_DOANH | PM | 6 | 1.8 | LÀM_LUÔN | A | KHÔNG | KHÔNG |
| **GD-49** | Kế thừa cấu hình N tầng là sửa nhỏ trên hàm resolve | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 6 | 3.5 | LÀM_LUÔN | A | KHÔNG | KHÔNG |
| **GD-60** | Sửa ba bề mặt là đủ để đổi luật gán giáo viên | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 6 | 2.8 | LÀM_LUÔN | A+B | KHÔNG | CÓ |
| **GD-69** | Đợt security hardening có phạm vi biết trước và không giẫm chân làn A | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 6 | 3.5 | LÀM_LUÔN | A+B | KHÔNG | chưa rõ |
| **GD-70** | Mã đơn vị duy nhất kéo theo tiền tố chứng từ phân biệt được cơ sở | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 6 | 2.1 | LÀM_LUÔN | A | KHÔNG | KHÔNG |
| **GD-74** | Mỗi action chỉ thuộc đúng một họ mô hình quyền | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 6 | 3.5 | LÀM_LUÔN | chưa rõ | CÓ | KHÔNG |
| **GD-78** | Vé mười phút đủ cho một buổi dạy chín mươi phút | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 6 | 2.1 | LÀM_LUÔN | A | KHÔNG | KHÔNG |
| **GD-79** | Gỡ nhánh nới quyền ở một file là gỡ hết | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 6 | 1.6 | LÀM_LUÔN | A | KHÔNG | CÓ |
| **GD-80** | Quyền mới khai một nơi là có hiệu lực | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 6 | 2.4 | LÀM_LUÔN | B | CÓ | CÓ |
| **GD-03** | Đường dẫn cây materialized path là thứ đang thiếu thật | GIÁ_TRỊ | PM | 5 | 4.2 | HOÃN | A+B | CÓ | KHÔNG |
| **GD-10** | Một biểu mẫu duy nhất kèm hồ sơ pháp nhân là dùng được | KHẢ_DỤNG | Thiết kế | 5 | 2.5 | HOÃN | A | KHÔNG | KHÔNG |
| **GD-23** | Không ai đang sống nhờ việc grant ALLOW mở tầm nhìn toàn hệ thống | KHẢ_DỤNG | Thiết kế | 5 | 1.5 | HOÃN | B | KHÔNG | CÓ |
| **GD-25** | Quản lý cơ sở làm việc được chỉ với siêu dữ liệu | KHẢ_DỤNG | Thiết kế | 5 | 2.8 | HOÃN | A | CÓ | CÓ |
| **GD-81** | Nhật ký lượt xem tra cứu được theo cơ sở | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 5 | 2.1 | HOÃN | A | KHÔNG | CÓ |
| **GD-84** | Ghi nhật ký từng tài nguyên con chịu được tải và có ích | KHẢ_THI_KỸ_THUẬT | Kỹ sư | 5 | 2.1 | HOÃN | A | KHÔNG | KHÔNG |
| **GD-16** | `CLASS` và `ASSIGNED` trùng nghĩa nên gộp hoặc bỏ một được | KHẢ_DỤNG | Thiết kế | 4 | 0.8 | HOÃN | A | CÓ | KHÔNG |

**Tổng: 84 giả định** — 17 THÍ_NGHIỆM · 60 LÀM_LUÔN · 0 CẮT · 7 HOÃN. Theo nhóm rủi ro: 9 GIÁ_TRỊ · 16 KHẢ_DỤNG · 17 KHẢ_THI_KINH_DOANH · 42 KHẢ_THI_KỸ_THUẬT. Theo góc nhìn: **23 PM · 17 Thiết kế · 44 Kỹ sư**. Cờ 2: **44 CÓ · 37 KHÔNG · 3 chưa rõ**; Cờ 1: **18 CÓ · 64 KHÔNG · 2 chưa rõ**. Không dòng nào bị lược bớt. *(Bốn phép đếm trên đã chạy lại trên chính bảng này ở vòng 28/07 — vòng trước ghi 22 PM / 45 Kỹ sư là sai.)*

⚠️ **Đọc cột "Cờ 2" cho đúng.** `CÓ` ở đây nghĩa là **hành động vá** của giả định đó làm đổi tập bản ghi một tài khoản đọc được → **phải điều phối với đợt security hardening**. Việc **đo** giả định (truy vấn chỉ-đọc) thì luôn `KHÔNG / KHÔNG`.

---

## 4. Ma trận Impact × Risk

|  | **Risk ≥ 5** | **Risk < 5** |
|---|---|---|
| **Impact ≥ 6** | **THÍ_NGHIỆM — 17 mã**<br>`GD-06` `GD-32` `GD-26` `GD-43` `GD-44` `GD-76` `GD-28` `GD-46` `GD-62` `GD-09` `GD-45` `GD-54` `GD-59` `GD-61` `GD-02` `GD-24` `GD-50` | **LÀM_LUÔN — 60 mã**<br>*Impact ≥ 7 (44):* `GD-01` `GD-27` `GD-30` `GD-31` `GD-36` `GD-04` `GD-05` `GD-18` `GD-21` `GD-35` `GD-37` `GD-38` `GD-39` `GD-40` `GD-41` `GD-47` `GD-48` `GD-51` `GD-56` `GD-63` `GD-65` `GD-72` `GD-07` `GD-08` `GD-11` `GD-15` `GD-19` `GD-20` `GD-33` `GD-52` `GD-53` `GD-55` `GD-57` `GD-58` `GD-64` `GD-66` `GD-67` `GD-68` `GD-71` `GD-73` `GD-75` `GD-77` `GD-82` `GD-83`<br>*Impact 6 (16):* `GD-12` `GD-13` `GD-14` `GD-17` `GD-22` `GD-29` `GD-34` `GD-42` `GD-49` `GD-60` `GD-69` `GD-70` `GD-74` `GD-78` `GD-79` `GD-80` |
| **Impact < 6** | **CẮT — 0 mã** | **HOÃN — 7 mã**<br>`GD-03` `GD-10` `GD-23` `GD-25` `GD-81` `GD-84` `GD-16` |

📌 **Ghi chú về `GD-50`** (ba mức danh mục áp được chỉ bằng thêm cột chủ sở hữu — Impact 6, Risk 5.6): với ngưỡng Impact ≥ 6 của §1, mã này vào THÍ_NGHIỆM **bằng luật**, không còn là ngoại lệ ghi tay như vòng trước. Lý do ưu tiên vẫn giữ: nó là mã duy nhất chống đỡ cả cụm `R-D6-01..04`, mà cụm đó là điều kiện ra của pha A8 (`02-prd:420`). Chạy thí nghiệm rẻ nhất (một thử nghiệm kỹ thuật trên nhánh nháp), không mở thẻ trước.

### Ô này phải làm gì

| Ô | Việc bắt buộc |
|---|---|
| **THÍ_NGHIỆM (17)** | Mỗi mã phải có **một khối 9 trường** (tên thí nghiệm · loại · việc cụ thể · **tên người** · thời lượng · chỉ số · ngưỡng viết trước · nếu trượt thì hoãn gì · hai cờ). **Không mã nào được mở thẻ thi công trước khi thí nghiệm của nó chạy xong.** Bốn mã `GD-06` `GD-32` `GD-26` `GD-44` **không kiểm được bằng mã nguồn** — thí nghiệm của chúng là hỏi người (Ban / bên NHẬN nhượng quyền / chủ đợt go-live RBAC), và **"đã hỏi" KHÔNG phải là đạt**, phải có văn bản trả lời ghi tên + ngày. |
| **LÀM_LUÔN (60)** | Gắn thẳng thành **tiêu chí nghiệm thu** của mã `R-*` liên quan; không lập thí nghiệm riêng, nhưng **mỗi mã phải có một người nhận theo dõi**. Riêng **32 mã** mang **Cờ 2 = CÓ** trong ô LÀM_LUÔN phải nằm trong lịch điều phối chung với đợt security hardening trước khi nối vào đường chạy; thêm **3 mã còn ghi "chưa rõ"** (`GD-27`, `GD-56`, `GD-69`) **phải chốt Cờ 2 trước khi xếp lịch**. *(Đếm máy trên bảng §3: toàn tài liệu **44 mã Cờ 2 = CÓ**, 3 mã chưa rõ, 37 mã KHÔNG; Cờ 1: 18 CÓ · 64 KHÔNG · 2 chưa rõ.)* |
| **CẮT (0)** | Vòng này không cắt mã nào. Điều đó **không** có nghĩa là phạm vi đã tối ưu — nghĩa là chưa mã nào rơi vào vùng "hậu quả nhỏ mà không chắc". Vòng sau phải chủ động tìm mã cắt được, vì `GD-26` (công suất đội) đang ở ô THÍ_NGHIỆM với Impact 9. |
| **HOÃN (7)** | Ghi lại để vòng sau không nêu lại. Làm kèm việc khác khi tiện: `GD-23` làm kèm việc kiểm kê DENY của QĐ-B; `GD-16` chờ câu 11 của Ban (`02-prd:464`); `GD-03` chờ pha B4 (`02-prd:433`). |

### Chỗ hai người chấm lệch — và cách chốt

**Sáu mã lệch ≥ 3 điểm trên một trục chấm** (Impact, Confidence hoặc Effort). Theo quy tắc đã duyệt, lệch > 2 điểm thì **không lấy trung bình** — hai người phải nêu bằng chứng `file:dòng`, ai không có bằng chứng thì bỏ điểm của mình.

⚠️ **Hạn chế đã biết của bảng này — đọc trước khi dùng số:** ở **4/6 hàng** (`GD-04`, `GD-69`, `GD-21`, `GD-58`) con số Risk chốt **không phải** điểm gốc của người được tuyên là thắng, cũng **không phải** trung bình — đó là điểm **hai người chấm lại cùng nhau sau khi xem bằng chứng** (GD-04: 6.3 ‖ 4.0 → chốt 4.8; GD-69: 5.6 ‖ 2.8 → 3.5; GD-21: 5.6 ‖ 3.5 → 4.2; GD-58: 5.6 ‖ 3.5 → 4.2). Bốn ca này **không đổi ô** (đều < 5) nên kết luận không bị ảnh hưởng. **Nhưng** tài liệu **không ghi lại cặp `Confidence` / `Effort` chốt** cho bất kỳ mã nào trong 84 mã — khối §5 chỉ có dòng `Impact | Risk | Ô | Cờ` cộng mục "Độ tin" định tính — nên công thức `Risk = (1 − C/10) × E` (§1) **hiện không tái lập được từ tài liệu**. **Việc tồn phải làm ở vòng sau:** bổ sung hai cột `Confidence` và `Effort` (điểm CHỐT) vào bảng §3 hoặc vào dòng meta của từng khối §5, rồi kiểm lại toàn bộ 84 dòng Risk bằng công thức. Cho tới lúc đó, mọi con số Risk trong tài liệu này phải đọc là **điểm đã chốt**, không phải **điểm suy ra được**.

| Mã | Lệch ở đâu (độ lệch lớn nhất) | Chốt theo ai | Vì sao — bằng chứng |
|---|---|---|---|
| **GD-04** | Effort 9 vs 5 → **lệch 4**; Risk 6.3 vs 4.0 | **Người 2** — chốt Impact 8 / Risk 4.8 → **LÀM_LUÔN** | `[QS]` `lib/auth/can.ts:41` là `if (actor.grantsAllow.has(action)) return true;` — trả về **trước** vòng lặp xét scope, không xét target. Giả định đã **chứng minh sai**, không còn ẩn số để thí nghiệm; việc còn lại là vá. |
| **GD-62** | Effort 8 vs 4 → **lệch 4**; Risk 5.6 vs 2.8 | **Người 1** — chốt Impact 9 / Risk 5.6 → **THÍ_NGHIỆM** | `[QS]` `00-baseline.md:109`: 18 ngày không dòng lệch mới, kèm workflow TRUNCATE và ghi diff fire-and-forget. Cả **7 nhánh B1–B7** (`02-prd:429-437`) dựng trên con số 0 này ⇒ Effort 8 đúng. Thí nghiệm rẻ: bơm một diff giả xem đồng hồ còn chạy. |
| **GD-69** | Effort 8 vs 4 → **lệch 4**; Risk 5.6 vs 2.8 | **Người 2** — chốt Impact 6 / Risk 3.5 → **LÀM_LUÔN** | `[QS]` `02-prd:423` đã **tự khai chỗ chồng lấn**: *"Đụng đợt security hardening: A9, và một phần A1 (mã chứng từ)."* Phạm vi đã biết trước ⇒ xử lý là điều phối người, không phải ẩn số kỹ thuật. |
| **GD-21** | Effort 8 vs 5 → **lệch 3**; Risk 5.6 vs 3.5 | **Người 2** — chốt Impact 8 / Risk 4.2 → **LÀM_LUÔN** | `[SĐ]` Đây là việc **chốt định nghĩa "nghỉ việc"** rồi hợp nhất cờ — không có ẩn số cần đo, chỉ cần một quyết định và một đợt sửa cỡ trung bình. |
| **GD-29** | Effort 8 vs 5 → **lệch 3**; Risk 5.6 vs 3.5 | **Người 2** — chốt Impact 6 / Risk 3.5 → **LÀM_LUÔN** | `[SĐ]` Hằng số mã số thuế, JSON-LD "Đà Nẵng" và địa chỉ tin tuyển dụng đều là sự thật đọc được, không có ẩn số; công sửa cỡ M. |
| **GD-58** | Effort 8 vs 5 → **lệch 3**; Risk 5.6 vs 3.5 | **Người 2** — chốt Impact 7 / Risk 4.2 → **LÀM_LUÔN** | `[QS]` `lib/db-scope.ts:49-53` xác nhận `Employee` **ngoài** `NULL_IS_GLOBAL_MODELS`. Đếm nhân viên thiếu bản ghi biên chế chính là **một truy vấn chỉ-đọc** rồi backfill — không có ẩn số. |

**Mười hai mã còn lại lệch < 3 điểm** — chốt bằng bằng chứng, không trung bình mù:

| Mã | Lệch | Chốt | Lý do rút gọn |
|---|---|---|---|
| **GD-02** | Impact 6 vs 8 | Người 2 — 7 / 5.6 → **THÍ_NGHIỆM** | `[QS]` `02-prd:413-421` là **9 pha làn A** (A1–A9); nghiệm thu tổng `R-D2-24` khai ở `:187` và **KR1/KR2 đo bằng diff repo** ở `:77-78` — chỉ số của làn A đo repo, **không đo được cơ sở kinh doanh**. *(Đã grep: chuỗi `R-D2-24` KHÔNG xuất hiện trong `02-prd:409-423`; nó chỉ có ở `:77`, `:78`, `:187`, `:400`.)* |
| **GD-10** | Impact 6 vs 5 | Người 2 — 5 / 2.5 → **HOÃN** | `[SĐ]` Sai thì hỏng ở khả dụng biểu mẫu, sửa cục bộ bằng tách 2 bước (tạo node → bổ sung hồ sơ pháp nhân). Không đổ ra mã `R-*` khác. |
| **GD-19** | Effort 8 vs 6 | Người 2 — 7 / 4.2 → **LÀM_LUÔN** | `[QS]` `02-prd:444` đã có `R-OPS-02` (*chụp trước/sau "ai mất quyền"*) chạy trước + sau **mỗi** thay đổi cấu trúc — công cụ đo sẵn có. |
| **GD-23** | Impact 5 vs 6 | Người 1 — 5 / 1.5 → **HOÃN** | `[QS]` Hậu quả nếu sai chỉ chạm vài tài khoản và 3 mã `R-*`. Làm kèm việc kiểm kê DENY của QĐ-B. |
| **GD-27** | Impact 10 vs 8 | Người 2 — 9 / 4.8 → **LÀM_LUÔN** | `[QS]` Đã đối chiếu `02-prd:409-437`: `R-DP-01..07` **không nằm trong pha nào**. Sự thật đã xác lập → việc còn lại là gán chủ sở hữu, không phải thí nghiệm. |
| **GD-28** | Risk 6.3 vs 4.9 | Người 1 — 9 / 5.6 → **THÍ_NGHIỆM** | `[SĐ]` Chưa ai đo tỉ lệ bản ghi tiền gán **SAI** cơ sở (khác "thiếu"); backfill suy diễn củng cố cái sai rồi kế toán ký lên. Thí nghiệm rẻ: mẫu 100 bản ghi thu tiền. |
| **GD-31** | Risk 5.6 vs 3.6 | Người 2 — 9 / 4.2 → **LÀM_LUÔN** | `[QS]` `02-prd:333` ghi rõ đường chuyển lớp **đã** nhận tham số cơ sở đích — chức năng đang chạy và đã biết hỏng. Cần **quyết định** (cấm / kèm điều kiện), không cần thí nghiệm. |
| **GD-32** | Impact 10 vs 9; Confidence 3 vs 4 | Người 1 — 10 / 5.6 → **THÍ_NGHIỆM** | `[QS]` `R-D10-04` cỡ **L** (`02-prd:294`), nằm **áp chót** chuỗi B5 và bị `R-D10-10` — **chốt chặn** của B5 (`:434`, `:441`) — khoá sau lưng; treo theo `R-DP-01` chưa ai trả lời. Hỏi luật sư + một bên NHẬN nhượng quyền **chính là** thí nghiệm rẻ trước khi xây. |
| **GD-41** | Effort 8 vs 7 | Người 2 — 8 / 4.2 → **LÀM_LUÔN** | `[QS]` Điều kiện ra của pha A9 (`02-prd:421`) đã là *"Dán URL R2 vào trình duyệt ẩn danh → 403"* — kiểm cổng phụ huynh bằng đúng thao tác đó, 5 phút. |
| **GD-61** | Risk 5.6 vs 4.8 | Người 1 — 8 / 5.6 → **THÍ_NGHIỆM** | `[QS]` Tự đếm: **41 tệp** dưới `app/` + `lib/` tham chiếu `isHoLevel`, gồm duyệt học bạ, báo cáo doanh thu, sửa chương trình. Người 2 đo đúng số nhưng hạ ô sai — phải thử trên một nhóm màn hình trước. |
| **GD-78** | Impact 5 vs 6; Risk 4.2 vs 2.1 | Người 2 — 6 / 2.1 → **LÀM_LUÔN** | `[SĐ]` Vé hết hạn giữa buổi chạm **mọi buổi dạy toàn mạng lưới**, không riêng một vai trò ⇒ Impact 6; gia hạn vé là sửa nhỏ. |
| **GD-82** | Impact 7 vs 6; Risk 5.6 vs 4.9 | Người 2 — 7 / 4.9 → **LÀM_LUÔN** (sát ngưỡng) | `[QS]` `02-prd:346` ghi rõ hiện trạng khoá R2 chia theo loại tệp và tiêu chí *"liệt kê bằng một lệnh"* — không có ẩn số, chỉ là công cỡ L. |

⚠️ **Ba điều KHÔNG được đọc lệch từ bảng trên:**
- `[QS]` Việc **đếm bản ghi DENY** chỉ để **ước lượng độ lớn** rủi ro flip. **Cổng mở làn B là 3 việc của QĐ-B** (`QUYET-DINH.md:52-58`), không phải con số đếm được.
- `[QS]` `QUYET-DINH.md:59` yêu cầu **BÁO LẠI** cho chủ đợt go-live RBAC rằng QĐ-B đang chặn lịch flip — **nghĩa vụ thông báo**, không phải câu hỏi. Riêng **tiêu chí đóng cửa sổ shadow** mới là câu hỏi (câu 12, `02-prd:465`).
- `[QS]` QĐ-C (`QUYET-DINH.md:65-79`) **đã chốt gỡ** `MAKEUP_EXCEPTION_MODELS` (`:73`). Việc đếm ca học bù chéo là **dọn dữ liệu tồn trước khi thi hành** (`QUYET-DINH.md:79`), **không** phải điều kiện để quyết có gỡ hay không.

---

## 5. Chi tiết từng giả định

### 5.1 Nhóm GIÁ_TRỊ (9 giả định)

> Sắp theo ô (THÍ_NGHIỆM → LÀM_LUÔN → HOÃN), trong mỗi ô Impact giảm dần. Mọi `đường-dẫn:số-dòng` dưới đây **đã được mở lại và kiểm từng dòng** trước khi viết; chỗ nào lệch với vòng trước đã ghi rõ **đính chính**.

#### GD-06 — Bên nhận ghi đủ doanh thu vào hệ thống HO

Nhóm rủi ro GIÁ_TRỊ | Góc nhìn PM | Làn B | Impact 10 | Risk 5.6 | Ô THÍ_NGHIỆM | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** FRANCHISEE sẽ nhập **toàn bộ** khoản thu học phí vào hệ thống của HO, nên tổng khoản thu trong hệ là **căn cứ tính phí tin được** — chứ không phải một con số do chính bên phải trả phí tự quyết bằng cách nhập hay không nhập.
- **Nếu SAI thì sao:** `R-D9-09` (`feeRate` là *căn cứ tính phí*), `R-D10-12` (tổng căn cứ theo hợp đồng) và `R-OPS-03` (đối soát + chữ ký kế toán) đều tính trên **số bên nhận tự khai**, trá hình dạng dữ liệu hệ thống. Thiếu bao nhiêu **không ai đo được**. Người chịu: kế toán tổng hợp HO ký một con số không bảo vệ được khi tranh chấp.
- **Độ tin:** THẤP — hành vi khai báo của một pháp nhân khác **không có dòng mã nào chứng minh được**; đây là điều khoản thương lượng, không phải cấu hình.
- **Bằng chứng:**
  - `[QS]` `02-prd:287` — R-D9-09 ghi `feeRate` **chỉ là căn cứ tính phí, không sinh chứng từ**.
  - `[QS]` `02-prd:302` — R-D10-12 định nghĩa **phạm vi tính phí = mọi lớp chạy trong đơn vị của bên NHẬN**.
  - `[QS]` `02-prd:113` — HO được *"căn cứ tính phí dựa trên số liệu vận hành trong phạm vi, **không phải số tự khai**"*. Chính câu này là giả định đang xét.
  - `[QS]` `lib/reports/trung-tam.ts:113-138` — doanh thu theo cơ sở = Σ `Payment` do người dùng nhập (`:128-132`), **không nguồn đối chứng ngoài hệ**; cùng hàm đã cộng sẵn `receivable` từ `Enrollment` (`:133-135`) → **hai con số đối chứng đã nằm cạnh nhau, chỉ chưa ai so**.
  - `[QS]` `lib/finance/payment.ts:359-361` — chặn xác nhận khi khoản **chưa gắn ghi danh**; `:371` là **đường duy nhất** đặt `CONFIRMED` (đã grep toàn repo: các chỗ còn lại — `lib/portal/billing.ts:118`, `app/(admin)/admin/bao-cao/doanh-thu/page.tsx:66` — là **điều kiện lọc khi ĐỌC**, không phải ghi) ⇒ sổ `CONFIRMED` **luôn neo vào `Enrollment`**.
  - `[QS]` `prisma/schema.prisma:1360,1363` — `Enrollment.listPrice`/`finalPrice`: **đơn giá đã chốt có sẵn để đối chứng**.
  - `[SĐ]` Bên nhận **có động cơ** giấu doanh thu khi phí tính theo doanh thu — chưa có văn bản nào của Ban xác nhận hay bác.
- **Mã `R-*` bị chặn:** `R-D9-09` · `R-D10-12` · `R-D10-04` · `R-OPS-03`.
- **Cách kiểm rẻ nhất:** Đo trên **CS1/CS2** (nơi **không** có động cơ giấu → đây là **sàn nhiễu**), 3 tháng gần nhất: so `Σ Payment CONFIRMED` theo cơ sở với `Σ finalPrice` của `Enrollment` đang học cùng kỳ — **cả hai đọc được ngay, không dựng gì**. **Ngưỡng: lệch > 10% ngay ở cơ sở nội bộ ⇒ tổng khoản thu KHÔNG dùng làm căn cứ tính phí được**, phải chuyển căn cứ sang *"số học viên đang học × đơn giá hợp đồng"*.
- **Câu hỏi cho Ban:** Phí thương hiệu tính trên doanh thu **ĐÃ THU** (`Payment` xác nhận) hay doanh thu **GHI NHẬN** (`finalPrice` của học viên đang học)? Hai số chênh nhau **đúng bằng công nợ**, và chỉ số thứ hai là bên nhận khó giấu.

#### GD-09 — Cửa sổ, dấu chìm và nhật ký đủ để chống rò rỉ

Nhóm rủi ro GIÁ_TRỊ | Góc nhìn PM | Làn A | Impact 8 | Risk 6.4 | Ô THÍ_NGHIỆM | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Bộ ba **cửa sổ mở khoá + dấu chìm động + ghi nhật ký** đủ răn đe để người **trong** mạng lưới không sao chép được bộ chương trình ra ngoài.
- **Nếu SAI thì sao:** Toàn bộ nhóm D8 đạt nghiệm thu (KR3 4/4) **nhưng tài sản trí tuệ vẫn ra ngoài qua điện thoại chụp màn hình** — công ty trả chi phí kỹ thuật cỡ **L** (`R-D8-07`) + **L** (`R-D8-08`) + **M** (`R-D8-11`) để mua một cảm giác an toàn. Người chịu: BGĐ, khi bên NHẬN nhượng quyền tách ra dùng chính bộ chương trình đó.
- **Độ tin:** THẤP — "đủ răn đe" là **giả thiết về hành vi người**, chưa ai đo; chính mã nguồn đã tự khai giới hạn của biện pháp.
- **Bằng chứng:**
  - `[QS]` `components/admin/slide-stage.tsx:11-12` — chú thích **trong mã**: *"KHÔNG thể chặn chụp màn hình OS (PrintScreen / Win+Shift+S) từ web — watermark là biện pháp răn đe chính."*
  - `[QS]` `components/admin/slide-stage.tsx:47` (cờ blur) · `:52` (dấu chìm động = mã NV + tên + đồng hồ) · `:71-72` (bắt `visibilitychange`/`blur` khi rời cửa sổ) · `:115` (chặn chuột phải) — **các biện pháp đã có thật, không phải kế hoạch**.
  - `[QS]` `components/admin/slide-stage.tsx:111-112` — đã chặn `Ctrl/Cmd+P` và `Ctrl/Cmd+S`: **đường dễ đã bịt**, phần còn lại thuần **răn đe**.
  - `[QS]` `02-prd:373` — *"Không làm trong PRD này: … DRM/chặn tải (**D8**)"* ⇒ phương án mạnh **đã bị loại khỏi phạm vi** ngay từ đầu.
- **Mã `R-*` bị chặn:** `R-D8-07` · `R-D8-11` · `R-D8-12`.
- **Cách kiểm rẻ nhất:** Thử nghiệm hành vi **có kiểm soát, 30 phút**: nhờ **1 giáo viên** (báo trước, có văn bản đồng ý) dùng điện thoại tái tạo bộ slide của **một** buổi trong **10 phút**. Đo 2 chỉ số: **(a)** số slide lấy được / tổng số slide; **(b)** dấu chìm trên ảnh chụp **có đọc rõ mã nhân viên không**. **Ngưỡng: lấy được > 80% slide VÀ mã NV không đọc rõ ⇒ răn đe không thành** → đưa DRM/chặn tải trở lại bàn (`02-prd:373`) **thay vì** làm cửa sổ mở khoá trước.
- **Câu hỏi cho Ban:** Rủi ro D8 đang chống là **"người ngoài lấy được"** hay **"người trong mạng lưới sao chép"**? Hai loại cần hai biện pháp khác nhau và PRD hiện chỉ giải loại thứ nhất.

#### GD-02 — Không thao tác tay, không sửa file nghĩa là mở được cơ sở

Nhóm rủi ro GIÁ_TRỊ | Góc nhìn PM | Làn A | Impact 7 | Risk 5.6 | Ô THÍ_NGHIỆM | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Đạt **KR1/KR2** và nghiệm thu `R-D2-24` (`git diff` rỗng) **đồng nghĩa** việc mở cơ sở đã chuyển từ **việc của lập trình viên** thành **việc của vận hành**.
- **Nếu SAI thì sao:** Hai chỉ số này **đo repo, không đo cơ sở có kinh doanh được không**. Học phí hiện **toàn cục** nên cơ sở mới **chắc chắn còn phải chờ HO**. Nếu cơ sở mới vẫn phải chờ HO tạo khoá học, gói khoá học, mức học phí, phân công giáo viên thì **thời gian mở thực tế không giảm, chỉ đổi người phải chờ**. Chương trình có thể **tuyên bố thành công trong khi mục tiêu ở mục 4 không đạt** — và không ai phát hiện cho tới cơ sở của bên NHẬN nhượng quyền đầu tiên. Kịch bản `R-D2-24` lại **dừng trước bước thu tiền**, đúng chỗ `R-OPS-12` nói là rủi ro pháp lý.
- **Độ tin:** THẤP — bản đo hiện trạng **tự ghi** rằng "hoạt động được" là khái niệm nghiệp vụ, **không đọc được từ code**.
- **Bằng chứng:**
  - `[QS]` `02-prd:77-78` — KR1 = *thao tác tay ≥ 4 → **0***; KR2 = *file mã nguồn phải sửa ≥ 17 → **0***; cả hai **nghiệm thu bằng kịch bản `R-D2-24` / diff repo**.
  - `[QS]` `02-prd:187` — chuỗi nghiệm thu `R-D2-24` kết thúc ở *"tạo được lớp/học viên với mã đúng tiền tố → và không thấy dữ liệu cơ sở khác. `git diff` = rỗng"* ⇒ **dừng trước khi thu một đồng nào**.
  - `[QS]` `02-prd:208` + `:210` — R-D6-14 mở nhóm khoá giá/thuế **hiện 0/45 khoá**; và **đã tự xác minh**: `Course.price`, `Course.priceDisplay`, `CoursePackage.priceOriginal/priceEarlyBird/priceMember` **không trường nào** có `centerId`/`orgUnitId` → cơ sở mới **không thể** tự đặt học phí.
  - `[QS]` `00-dryrun.md:63` — *"'Hoạt động được' là khái niệm nghiệp vụ, không phải khái niệm schema — không đọc được từ code… **Cần người vận hành xác nhận**."*
  - `[QS]` `02-prd:332` — `R-OPS-12`: chứng từ thu tiền phải mang **pháp nhân bên phát hành**, mẫu hiện chỉ nhận `centerName`/`centerAddress` ⇒ bước thu tiền **chưa nằm trong kịch bản nghiệm thu nào**.
- **Mã `R-*` bị chặn:** `R-D2-24` · `R-D6-13` · `R-D6-14` · `R-OPS-05` · `R-OPS-12`.
- **Cách kiểm rẻ nhất:** **Bấm giờ một lần chạy thật** trên môi trường test: **một người vận hành (không phải lập trình viên)** mở vùng + cơ sở, tới khi **ghi nhận được học viên đầu tiên VÀ thu được một khoản tiền có phiếu in ra**. Đếm 3 con số: **tổng thời gian · số lần phải nhờ HO/kỹ thuật · số bước không có trên giao diện**. **Ngưỡng đạt: 0 lần phải nhờ kỹ thuật và < 1 ngày làm việc.** Ba con số này thay cho `git diff` rỗng trong tiêu chí nghiệm thu `R-D2-24`.
- **Câu hỏi cho Ban:** Ngoài mã, phòng ban, danh mục — cơ sở mới **còn PHẢI có sẵn gì** trước ngày khai giảng (khoá học, gói học phí, kho vật tư, mục tiêu doanh thu)? Danh sách này quyết định **khuôn mẫu đơn vị sinh cái gì** và `R-D2-24` nghiệm thu tới đâu.

#### GD-01 — Việc cấp vai trò Đào tạo cho bên nhận là quyết định có kiểm soát

Nhóm rủi ro GIÁ_TRỊ | Góc nhìn PM | Làn A | Impact 9 | Risk 3.6 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** HO **kiểm soát được** việc bên nhận có soạn chương trình riêng hay không, vì đó là **quyết định cấp vai trò** của HO — nên lỗ hổng `A2` / §9 câu 2 là **rủi ro quản trị được bằng quy trình**.
- **Nếu SAI thì sao:** Quyền soạn chương trình gắn theo **VAI TRÒ, không theo đơn vị**: bất kỳ ai mang vai trò Đào tạo ở **bất kỳ node nào** cũng tạo/sửa được chương trình. Cùng vai trò đó lại là **vai trò duy nhất** soạn được kho câu hỏi / đề / bài tập — thứ bên nhận cần để **vận hành hằng ngày**. **Cấp** thì HO tự mở đường cho lỗ hổng thương mại; **không cấp** thì bên nhận không dạy được. Người chịu: HO **mất phí** — phí về gần 0 sau **đúng một thao tác nhập liệu hợp lệ**.
- **Độ tin:** TRUNG BÌNH — phần "quyền không kèm phạm vi" **đọc thẳng ra từ mã**; phần "quy trình cấp vai trò bù được" mới là chỗ chưa chắc.
- **Bằng chứng:**
  - `[QS]` `lib/auth/permissions.ts:466-468` — `curriculum:create/edit/delete` = `["SUPER_ADMIN", "TRAINING"]`, **không ràng buộc đơn vị**.
  - `[QS]` `lib/auth/permissions.ts:473-475` — `questions:author/edit/delete` cùng nhóm `TRAINING`.
  - `[QS]` `prisma/seed-roles.ts:225-227` và `:229-231` — RoleDef `TRAINING` khai `curriculum:create/edit/delete` và `questions:author/edit/delete` đều `scopeType: "GLOBAL"`. **Đính chính vòng trước:** đếm lại chính xác là **280** dòng `scopeType: "GLOBAL"` trên **301** dòng quyền có giá trị `scopeType` literal (280 GLOBAL + 18 CENTER + 1 CLASS + 1 ASSIGNED + 1 CHILDREN) — khớp `00-baseline.md:106` (*"280/301"*). *(Chuỗi `scopeType:` xuất hiện 303 lần trong tệp; 2 lần dư là khai báo type ở `seed-roles.ts:6` và map ở `:557`, không phải dòng quyền. Vòng trước ghi 281, vòng liền trước ghi mẫu số 307 — cả hai đều sai.)* Kết luận **không đổi**: vai trò Đào tạo **không kèm phạm vi đơn vị**, nên **quy trình cấp vai trò không bù được**.
  - `[QS]` `prisma/schema.prisma:2082-2105` — model `Curriculum` **không có trường chủ sở hữu lẫn trường nguồn gốc**.
  - `[QS]` `02-prd:382` — `A2`: *"D10 sụp đổ — bên nhận tự soạn chương trình riêng là mọi lớp rơi ra ngoài phạm vi, phí về gần 0"*.
  - `[QS]` `02-prd:455` — §9 câu 2, đánh dấu **chỗ mất tiền**; `02-prd:302` — `R-D10-12` là mã chống.
  - `[QS]` `02-prd:260` — `R-D8-03` **diễn đạt bằng `ownerOrgUnitId`**, trường này **chưa tồn tại** trong schema (xem gạch đầu dòng `Curriculum` ở trên).
- **Mã `R-*` bị chặn:** `R-D10-12` · `R-D10-11` · `R-D8-01` · `R-D8-02` · `R-D8-03` · `R-D9-09`.
- **Cách kiểm rẻ nhất:** Đọc ma trận quyền hiện tại và **liệt kê các hành động NGHIỆP VỤ HẰNG NGÀY** mà bên nhận **bắt buộc** phải làm nhưng **chỉ vai trò Đào tạo mới có** (soạn bài tập, kho câu hỏi, đề thi). **Ngưỡng: > 0 hành động ⇒ không quản trị được bằng quy trình cấp vai trò** → phải **tách vai trò "vận hành lớp" khỏi "sở hữu chương trình" TRƯỚC khi ký hợp đồng đầu tiên**, và chốt `R-D10-12` theo hướng **phạm vi tính phí đi theo hợp đồng**.

#### GD-04 — Vá tầng cách ly là đủ để grant ALLOW hết mở toàn cục

Nhóm rủi ro GIÁ_TRỊ | Góc nhìn Kỹ sư | Làn B | Impact 8 | Risk 4.8 | Ô LÀM_LUÔN | Cờ 1 CÓ | Cờ 2 CÓ

- **Phát biểu:** `R-QDB-07` vá ở **tầng cách ly dữ liệu** là đủ để grant `ALLOW` không còn là ngoại lệ toàn cục — sau khi vá, người có `ALLOW` **chỉ còn quyền trong phạm vi đơn vị của họ**.
- **Nếu SAI thì sao:** Vá **chỉ chạm đường ĐỌC**. Ở **tầng hành động**, `can()` v2 trả `true` ngay khi `grantsAllow` chứa action, **không xét `target`, không xét scope** — nên grant `ALLOW` vẫn là **quyền GLOBAL trên mọi cơ sở**. Sau khi vá, người đó **không LIST được** bản ghi cơ sở khác **nhưng vẫn qua cửa quyền khi thao tác GHI theo id đã biết**, ở mọi call-site chỉ dùng `can()`/`assertCan` mà không tự gọi `passesScope` (đường GHI **không** được `scopedDb` che). Nghiệm thu `R-QDB-07` **chỉ có ca đọc** nên **xanh trong khi lỗ ghi vẫn mở**, còn `R-D4-11` — mã duy nhất phủ đường ghi — **nằm mãi ở B6**.
- **Độ tin:** TRUNG BÌNH — **giả định đã chứng minh sai bằng mã**; phần còn chưa chắc chỉ là **có bao nhiêu call-site ghi** thực sự khai thác được.
- **Bằng chứng:**
  - `[QS]` `lib/auth/can.ts:39-45` — `can()` mở đầu bằng `if (actor.isSuperAdmin) return true;` rồi **`:41` `if (actor.grantsAllow.has(action)) return true;`**, **trả về TRƯỚC** vòng lặp xét scope `:42-44`. **Không xét `target`.**
  - `[QS]` `lib/db-scope.ts:203-210` — vòng duyệt `grantsAllow` đặt `hasAll = true` kèm chú thích **`"per-user grants are global exceptions"`** ⇒ đúng điểm `R-QDB-07` định vá, và **chỉ ở đường đọc**.
  - `[QS]` `lib/db-scope.ts:225` — `injectScope` **chỉ chạy cho `SCOPED_MODELS`**; và `scopedDb` (`:303-331`) **chỉ bọc 7 method ĐỌC** ⇒ `update`/`delete`/`create` **không đi qua** cổng này.
  - `[QS]` `02-prd:247` — nghiệm thu `R-QDB-07` viết nguyên văn *"Actor CS1 có grant ALLOW `students:view` → **đọc** `Student` vẫn chỉ thấy CS1"* ⇒ **chỉ ca ĐỌC**.
  - `[QS]` `02-prd:238` — `R-D4-11` (ép cách ly trên **đường GHI**) là mã duy nhất phủ lỗ này.
- **Mã `R-*` bị chặn:** `R-QDB-07` · `R-QDB-01` · `R-D4-11` · `R-D4-12`.
- **Cách kiểm rẻ nhất:** **Một test tích hợp rẻ, chạy ngay trong làn A** (không đụng prod): actor cấp cơ sở **CS1** có grant `ALLOW students:edit`, gọi **thẳng action sửa một học viên CS2 theo id**. **Ngưỡng: phải bị từ chối.** Nếu **ghi được ⇒ `R-QDB-07` phải mở rộng phạm vi sang tầng hành động** (grant `ALLOW` mang scope, **hoặc** bắt buộc `passesScope` ở call-site ghi), **không chỉ** sửa `getModelVisibleCenterIds`.

#### GD-05 — Danh mục học liệu toàn mạng lưới không phải thứ cần che

Nhóm rủi ro GIÁ_TRỊ | Góc nhìn PM | Làn A | Impact 8 | Risk 3.5 | Ô LÀM_LUÔN | Cờ 1 CÓ | Cờ 2 CÓ

- **Phát biểu:** Siêu dữ liệu kho học liệu (tên tài liệu, tên bài, tên khung chương trình của **TOÀN** hệ thống) **không phải tài sản cần bảo vệ**, nên `R-D8-09` chỉ cần **cắt quyền MỞ** mà **giữ nguyên quyền XEM DANH SÁCH** là đủ.
- **Nếu SAI thì sao:** Quản lý cơ sở của bên NHẬN nhượng quyền **hợp pháp tải về cấu trúc đầy đủ** của bộ chương trình HO — cây khung, tên từng buổi, tên và loại từng học liệu. Với một công ty nhượng quyền giáo dục, **chính cấu trúc đó là phần bán được**; nội dung chi tiết chỉ là phần còn lại. `R-D8-09` khi đó **hợp thức hoá một đường rò thay vì bịt nó**. Người chịu: HO, khi bên nhận tách ra tự dựng chương trình tương đương.
- **Độ tin:** THẤP — "cấu trúc có phải tài sản không" là **phán đoán thương mại chưa ai chốt**; phần "hiện đang thấy hết" thì đọc được từ mã.
- **Bằng chứng:**
  - `[QS]` `app/(admin)/admin/documents/page.tsx:84-97` — điều kiện lọc **chỉ** gồm `type` / `lessonId` / `isPublic` / chuỗi tìm kiếm: **không có đơn vị / cơ sở / chủ sở hữu**.
  - `[QS]` `app/(admin)/admin/documents/page.tsx:99-101` — chú thích ngay trong mã: *"Document/Lesson = **học liệu toàn cục, scopedDb pass-through**"*.
  - `[QS]` `app/(admin)/admin/documents/page.tsx:113` — `take: 100` ⇒ **phải đo ở tầng DB, không đếm trên màn hình**.
  - `[QS]` `lib/db-scope.ts:11-37` — `SCOPED_MODELS` **không chứa `Document`** ⇒ `scopedDb` **không che** đường này.
  - `[QS]` `prisma/schema.prisma:2415-2448` — `Document` **không có** `centerId`/`orgUnitId`/`ownerOrgUnitId`.
  - `[QS]` `02-prd:266` — nghiệm thu `R-D8-09`: *"`CENTER_MANAGER` mở `/admin/documents` → **thấy đủ dòng + metadata**, không có nút mở"*.
- **Mã `R-*` bị chặn:** `R-D8-09` · `R-D8-01` · `R-D8-03` · `R-D4-01`.
- **Cách kiểm rẻ nhất:** **Đo bằng con số, không bằng ý kiến**: chạy **đúng** điều kiện lọc ở `page.tsx:84-97` **bỏ `take:100`**, đếm số dòng `Document` một tài khoản `CENTER_MANAGER` nhìn thấy, so với **tổng số `Document` toàn hệ thống**. **Ngưỡng: tỉ lệ = 100% ⇒ "danh sách" không phải danh sách của cơ sở mình mà là toàn bộ kho** → đưa con số cho Ban quyết **có lọc theo chủ sở hữu không, TRƯỚC khi viết tiêu chí nghiệm thu `R-D8-09`** (viết sau là phải viết lại).
- **Câu hỏi cho Ban:** Quản lý cơ sở của bên NHẬN nhượng quyền được thấy siêu dữ liệu học liệu của **toàn mạng lưới**, hay **chỉ của các khung chương trình mà cơ sở họ đang chạy**?

#### GD-07 — Trả null ở kết quả là đã che được trường nhạy cảm

Nhóm rủi ro GIÁ_TRỊ | Góc nhìn Kỹ sư | Làn B | Impact 7 | Risk 4.8 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Che trường bằng Prisma `result:` extension (**giá trị trả về = null**) đủ để coi lương/PII là **"đã che"** đối với actor không có quyền.
- **Nếu SAI thì sao:** `result:` **chỉ đổi GIÁ TRỊ TRẢ VỀ**; nó **không chặn `where`/`orderBy`** trên chính trường đó, và **không áp cho `aggregate`/`groupBy`/`$queryRaw`**. Người bị che vẫn **dò ngược lương từng người** bằng nhị phân `where: { bhxhBase: { gt: X } }`, hoặc đọc `_avg` trên **nhóm 1 người** — **trong phạm vi cơ sở mình**, tức **đúng nhóm** mà `getEmployeeFieldVisibility` đang cấm (Quản lý cơ sở; HR không đủ quyền lương). Nghiệm thu `R-D4-06` **chỉ đòi "trả null"** nên sẽ **xanh trong khi lỗ vẫn mở**.
- **Độ tin:** THẤP — chưa ai chạy thử đường dò; nhưng **hình dạng cơ chế thì đã đọc được** và nó không có chỗ nào chặn `where`.
- **Bằng chứng:**
  - `[QS]` `lib/db-scope.ts:303-331` — `scopedDb` hiện **chỉ có nhánh `query:`** bọc 7 method đọc; **không có nhánh `result:`** nào. Grep toàn repo: **0 hook `result:`** — khớp `02-prd:233` (*"Số hook `result:` ≥ 1 (**hiện 0**)"*).
  - `[QS]` `lib/db-scope.ts:315-320` — `aggregate` và `groupBy` **chỉ** được chèn **lọc cơ sở** (`injectScope`), **không** có bất kỳ xử lý trường nhạy cảm nào.
  - `[QS]` `lib/db.ts:66-85` — extension **tầng base** cũng chỉ là `query:` (soft-delete) cho `findMany`…`groupBy` ⇒ **không tầng nào đang lọc `where`/`orderBy` theo quyền trường**.
  - `[QS]` `lib/auth/permissions.ts:701-706` — `getEmployeeFieldVisibility` trả `salary: any(["SUPER_ADMIN","HR","ACCOUNTANT"])` ⇒ **`CENTER_MANAGER` là nhóm bị cấm lương** nhưng vẫn đọc `Employee` trong cơ sở mình.
  - `[QS]` `02-prd:233` — `R-D4-06` nghiệm thu **chỉ** đòi *"…trả **null**, kể cả khi truy vấn nằm ở `lib/`"* — **không có ca `where`/`aggregate`**.
- **Mã `R-*` bị chặn:** `R-D4-06` · `R-D4-08` · `R-TECH-01`.
- **Cách kiểm rẻ nhất:** Thêm **3 ca** vào chính test `R-TECH-01`: actor **không có quyền lương** chạy **(a)** `employee.findMany({ where: { bhxhBase: { gt: 0 } }, select: { id: true } })` · **(b)** `employee.aggregate({ _avg: { bhxhBase: true } })` · **(c)** `orderBy: { bhxhBase: 'desc' }` rồi đọc thứ tự id. **Ngưỡng: cả ba phải bị từ chối hoặc trả rỗng/không suy được thứ tự.** Nếu **ra số hoặc ra thứ tự ⇒ `R-D4-06` CHƯA xong** — phải **chặn trường nhạy cảm trong `where`/`orderBy`** và **cấm `aggregate` trên nhóm trường đó**.

#### GD-08 — Che tầng đọc thay được che tầng ghi nên xoá 9 chỗ che tay là an toàn

Nhóm rủi ro GIÁ_TRỊ | Góc nhìn Kỹ sư | Làn B | Impact 7 | Risk 2.4 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Sau khi có `result:` extension, các chỗ che trường **gọi tay** ở tầng giao diện là **dư thừa và xoá được** (`R-D4-08`: **9 → 0**).
- **Nếu SAI thì sao:** `getEmployeeFieldVisibility` **không chỉ** dùng để ẩn khi ĐỌC — nó còn **lọc PAYLOAD GHI** qua `stripHiddenEmployeeFields` ở **cả đường tạo lẫn đường sửa** nhân sự. `result:` extension **chỉ áp cho kết quả ĐỌC**. **Xoá theo đúng chữ nghiệm thu sẽ gỡ luôn 2 chốt ghi** → người **không có quyền lương gửi thẳng payload là ghi được** `salaryRank`/`bhxhBase`. Thêm nữa: con số **"9" không truy được**.
- **Độ tin:** THẤP về con số "9" (đã **bác được bằng đếm**), CAO về việc **2 chốt ghi tồn tại thật**.
- **Bằng chứng:**
  - `[QS]` `app/(admin)/admin/nhan-su/actions.ts:224` — **đường TẠO**: `stripHiddenEmployeeFields(createData, getEmployeeFieldVisibility(session.user.role));`
  - `[QS]` `app/(admin)/admin/nhan-su/actions.ts:328` — **đường SỬA**: cùng lời gọi trên `data` đã parse.
  - `[QS]` `lib/auth/permissions.ts:755` — `stripHiddenEmployeeFields` tự khai mục đích: *"**Strip-khi-ghi**: XOÁ key thuộc nhóm bị ẩn khỏi payload create/update"* (`:751-753`: *"chặn client set field ngoài quyền (**write-side hardening**)"*).
  - `[QS]` `app/(admin)/admin/nhan-su/page.tsx:151` và `app/(admin)/admin/nhan-su/[id]/edit/page.tsx:145` — **2 chỗ ĐỌC** (redact khi hiển thị).
  - `[QS]` **Đếm lại toàn repo**: `getEmployeeFieldVisibility` có **đúng 4 call-site production** (2 đọc + 2 ghi ở trên); các hit còn lại nằm trong `lib/auth/employee-visibility.test.ts` và chính `lib/auth/permissions.ts`. Khớp `00-baseline.md:103` (*"`getEmployeeFieldVisibility` **4**"*) ⇒ **`02-prd:235` ghi "9 → 0" là đếm một tập không ai định nghĩa**.
- **Mã `R-*` bị chặn:** `R-D4-06` · `R-D4-08` · `R-D4-11`.
- **Cách kiểm rẻ nhất:** Hai việc, đều rẻ. **(a)** **Liệt kê đích danh tập "9 file" trước khi xoá dòng nào** — không liệt kê được thì **sửa con số trong `R-D4-08` thành 4** và **tách rõ 2 chỗ ĐỌC (xoá được) với 2 chỗ GHI (KHÔNG xoá)**. **(b)** Một test tích hợp chạy **TRƯỚC** khi xoá: actor không có quyền lương gọi thẳng action sửa nhân sự với `salaryRank` trong payload → **ngưỡng: `salaryRank` giữ nguyên**. Test này **phải nằm trong bộ nghiệm thu của `R-D4-08`** — hiện **không có ca ghi nào**.

#### GD-03 — Đường dẫn cây materialized path là thứ đang thiếu thật

Nhóm rủi ro GIÁ_TRỊ | Góc nhìn PM | Làn A+B | Impact 5 | Risk 4.2 | Ô HOÃN | Cờ 1 CÓ | Cờ 2 KHÔNG

- **Phát biểu:** Cần lưu **đường dẫn cây + độ sâu** và chuyển sang **truy vấn theo tiền tố** (`R-D2-09/10/11`), và **kế thừa N tầng** (`R-D6-05`) **phải chờ** hạng mục này.
- **Nếu SAI thì sao:** Ba yêu cầu này mua **một bất biến phải nuôi mãi** (mọi lần tạo/đổi cha cập nhật **trong cùng giao dịch** + **test đối soát trong CI**) cho một cây **cỡ 4–6 node**. Việc **leo lên tổ tiên** mà `R-D6-05` cần **đã có sẵn hàm thuần chạy trong bộ nhớ**. Điểm nóng thật là **cây OrgUnit bị đọc trần MỖI request** trong `resolveActor` — thứ `R-D2-11` **không chạm tới**. Nếu sai: một hạng mục **có đụng shadow** bị kéo vào làn B, kéo theo `R-D6-05` (làn A) **phải chờ cửa sổ shadow đóng** — **trả giá lịch để mua thứ không ai đọc**. Tiêu chí nghiệm thu `R-D2-11` lại **đo cách làm chứ không đo kết quả**, nên **không ai phát hiện được là mua hờ**.
- **Độ tin:** THẤP — chưa ai **đo** chi phí quét cây hiện tại; kết luận "chưa cần" đang dựa vào **kích thước cây**, mà kích thước đó **sẽ đổi** khi mở nhiều cơ sở của bên NHẬN nhượng quyền.
- **Bằng chứng:**
  - `[QS]` `lib/org/org-tree.ts:84-97` — `getAncestors` là **hàm thuần**, leo `parentId` **trong bộ nhớ**, có chống chu trình (`seen`) ⇒ **cái `R-D6-05` cần đã có**.
  - `[QS]` `lib/org/org-service.ts:50-55` — `loadNodes` nạp **toàn bảng** `OrgUnit` (`findMany`), và `:194-197` — `getAncestors` bản async **gọi lại `loadNodes(true)` mỗi lần** ⇒ chi phí nằm ở **số lần nạp**, không ở thuật toán.
  - `[QS]` `lib/auth/actor.ts:10-16` — chú thích **REQ-02 (REVERTED)**: cây OrgUnit **đọc TRẦN mỗi request**, cache đã bị **gỡ có chủ ý** vì *"bảng OrgUnit RẤT NHỎ (HO+CS1+CS2…) → full-scan không đáng kể"* và vì **mutation ngoài app không invalidate được** ⇒ **đây mới là điểm nóng, và nó đã được cân nhắc rồi**.
  - `[QS]` `02-prd:172-174` — `R-D2-09` (path + depth, cập nhật **trong cùng transaction**) · `R-D2-10` (nạp path cũ + **test bất biến trong CI**) · `R-D2-11` (truy vấn tiền tố).
  - `[QS]` `02-prd:174` — nghiệm thu `R-D2-11`: *"**SQL sinh ra chứa điều kiện tiền tố**; `visibleCenterIds` của mọi actor mẫu **giữ nguyên**"* ⇒ **đo cách làm**, không đo thời gian; và vế `visibleCenterIds` chính là **Cờ 1 = CÓ**.
  - `[QS]` `02-prd:199` — `R-D6-05` khai **phụ thuộc `R-D2-09`**; `02-prd:420` — cả hai nằm trong pha **A8**; `02-prd:433` — chuỗi **B4** `R-D2-09 → R-D2-10 → R-D2-11` ⇒ **một hạng mục bị chẻ đôi hai làn**.
- **Mã `R-*` bị chặn:** `R-D2-09` · `R-D2-10` · `R-D2-11` · `R-D6-05`.
- **Cách kiểm rẻ nhất:** **Đo trước khi xây**: bật **đếm truy vấn** trên **5 màn hình nặng nhất** của admin, ghi **số lần nạp bảng `OrgUnit`** và **tổng thời gian phần cây** trên mỗi request, ở **cây mô phỏng 3 vùng × 5 cơ sở**. **Ngưỡng: phần cây < 30ms và < 2 truy vấn/request ⇒ hoãn `R-D2-09/10/11`**, **gỡ phụ thuộc `R-D6-05` → `R-D2-09`** để trả `R-D6-05` về làn A, và chuyển ngân sách sang **nhớ đệm cây trong `resolveActor`** (kèm **đường vô hiệu hoá khi đổi cây** — đúng lý do đã khiến cache bị gỡ ở `lib/auth/actor.ts:10-16`).

---

**Ghi chú biên tập của mục 5.1 (không phải câu hỏi nghiệp vụ):** vòng trước bảng §3 xếp `GD-06` vào **KHẢ_THI_KINH_DOANH** trong khi khối chi tiết ở mục này giao `GD-06` cho nhóm **GIÁ_TRỊ** — chênh **đúng một mã**, làm đếm máy ra 8/18 còn dòng tổng (`§3`) ghi 9/17. **Đã chốt và đã sửa ở vòng này: `GD-06` = nhóm GIÁ_TRỊ**, hàng `GD-06` của bảng §3 đã đổi theo. Sau khi sửa, đếm máy bảng §3 cho **9 GIÁ_TRỊ · 16 KHẢ_DỤNG · 17 KHẢ_THI_KINH_DOANH · 42 KHẢ_THI_KỸ_THUẬT**, khớp bốn tiêu đề §5.1–§5.4 và dòng tổng của §3. Việc chốt nhãn **không đổi nội dung giả định**, không đổi Impact/Risk/ô/cờ.


### 5.2 Nhóm KHẢ_DỤNG (16 giả định)

> Nhóm này hỏi hai câu: **người thật có dùng được thứ ta sắp xây không**, và **người đang dùng có bị cắt mất thứ họ đang dùng không**. Hỏng ở đây không làm sập hệ thống — nó đẩy đội vận hành **đi đường vòng**, và đường vòng đó vô hiệu hoá đúng cơ chế vừa xây. **Mười** giả định trong nhóm mang cờ 2 (đụng phạm vi dữ liệu) — `GD-11`, `GD-14`, `GD-15`, `GD-17`, `GD-19`, `GD-20`, `GD-21`, `GD-23`, `GD-24`, `GD-25` — nên phải nói chuyện với đợt security hardening đang chạy song song.

#### GD-10 — Một biểu mẫu duy nhất kèm hồ sơ pháp nhân là dùng được

Nhóm rủi ro KHẢ_DỤNG | Góc nhìn Thiết kế | Làn A | Impact 5 | Risk 2.5 | Ô HOÃN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Người vận hành HO điền được **trong một lượt**: tên/slug/địa chỉ + mã cơ sở (bất biến sau bản ghi đầu) + đơn vị cha + loại quan hệ sở hữu + hồ sơ pháp nhân (tên pháp nhân, MST, số tài khoản, ngân hàng, tiền tệ, múi giờ).
- **Nếu SAI thì sao:** Biểu mẫu hiện **đúng 19 trường**; gói yêu cầu này nâng lên **khoảng 28** `[SD]`, trong đó có **hai loại trường mà người điền KHÔNG SỞ HỮU THÔNG TIN**: mã cơ sở (bất biến — sai là phải xoá dữ liệu mới sửa được, mà hôm nay biểu mẫu **chưa hề có** trường này) và hồ sơ pháp nhân của **bên NHẬN nhượng quyền (FRANCHISEE)** (admin HO thường chưa cầm MST/số tài khoản lúc lập). Hành vi dự đoán được: **điền tạm rồi quên sửa**. Hậu quả rơi đúng vào `R-OPS-12` (phiếu thu mang MST sai) và `R-D2-15` — hỏng âm thầm, chỉ lộ khi cơ quan thuế hoặc phụ huynh hỏi.
- **Độ tin:** TRUNG BÌNH — con số trường và việc thiếu trường mã/pháp nhân **đã kiểm chứng bằng mã**; phần "người sẽ điền tạm" vẫn là suy đoán hành vi, chưa ai thử với người dùng thật.
- **Bằng chứng:**
  - `[QS]` `app/(admin)/admin/centers/_actions.ts:14-41` — `centerSchema` có **đúng 19 trường**; **không có** `code` (mã cơ sở), **không có** đơn vị cha, **không có** loại quan hệ sở hữu, **không có** bất kỳ trường hồ sơ pháp nhân nào.
  - `[QS]` `app/(admin)/admin/centers/_actions.ts:136-157` — `createCenter` chỉ gọi `sdb.center.create(...)`, **không** tạo `OrgUnit` kèm ⇒ đúng nền mà `R-D2-16` phải vá.
  - `[QS]` `02-prd:176-180` — `R-D2-13`…`R-D2-17`. **Đính chính bản trước:** dải này là **176-180**, không phải 177-181; `02-prd:181` là `R-D2-18`.
  - `[QS]` `02-prd:177` (`R-D2-14`) — hồ sơ pháp nhân **6 trường** + che MST/số TK ở tầng truy vấn. `02-prd:180` (`R-D2-17`) — mã cơ sở **bất biến sau khi đã sinh bản ghi**.
  - `[QS]` `02-prd:332` (`R-OPS-12`) — phiếu thu phải mang MST **bên phát hành**; mẫu hiện chỉ nhận `centerName`/`centerAddress`.
  - `[QS]` `03-job-stories.md:279-284` — job story đòi "một biểu mẫu duy nhất"; `:282` nêu MST đang là **hằng số** `lib/locations.ts:63`; `:284` chốt cổng chặn ở **cờ hạch toán**, **không** chặn ở thu tiền.
- **Mã `R-*` bị chặn:** `R-D2-13` · `R-D2-14` · `R-D2-15` · `R-D2-16` · `R-D2-17` · `R-OPS-12`.
- **Cách kiểm rẻ nhất:** Thử trên **bản vẽ giấy** với 2 người thật sẽ dùng (admin HO + kế toán tổng hợp): đưa hồ sơ một cơ sở của bên NHẬN nhượng quyền (FRANCHISEE) giả định, yêu cầu điền. Đo **số ô để trống**, **số ô điền sai loại dữ liệu**, **thời gian**. **Ngưỡng: quá 2 ô bị bỏ trống hoặc điền tạm ⇒ tách làm hai bước** (lập cơ sở → bổ sung hồ sơ pháp nhân) và đặt cổng chặn ở bước thứ hai.
- **Câu hỏi cho Ban:** Cơ sở chưa đủ hồ sơ pháp nhân thì được nhận học viên nhưng **CHẶN thu tiền**, hay chặn cả hai? (`03-job-stories.md:284` mới chỉ chốt chặn ở cờ hạch toán — mà **thu tiền** mới là chỗ sinh chứng từ sai pháp nhân.)

#### GD-11 — Giáo viên dạy thay mở được nội dung buổi mình dạy

Nhóm rủi ro KHẢ_DỤNG | Góc nhìn Kỹ sư | Làn A+B | Impact 7 | Risk 3.5 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Người dạy thay một buổi **luôn nằm sẵn** trong bộ ba (`Class.teacherId`, `Class.assistantId`, `ClassSession.actualTeacherId`) mà cổng SCORM đang kiểm, nên siết ĐK(1)+(2) không cắt mất ai đang dạy thật.
- **Nếu SAI thì sao:** Giáo viên được xếp dạy thay (`substituteTeacherId` — ghi **TRƯỚC** buổi, đúng theo chú thích schema) không mở được slide vào giờ lên lớp: `assignedClassIds` không chứa lớp đó, còn `actualTeacherId` chỉ được ghi khi "Hoàn tất buổi" (**SAU** khi dạy xong). `R-D8-05` lại đòi **GỠ** nhánh dự phòng ở trang play ⇒ sau khi làm xong D8, mọi buổi dạy thay đều **dạy chay**. Người chịu: giáo viên dạy thay + học viên buổi đó.
- **Độ tin:** THẤP rằng giả định đúng — **mã đã bác trực tiếp cả hai vế** (hàm gác không đọc `substituteTeacherId`; tồn tại hàm thứ hai có đọc). Phần còn suy đoán chỉ là **số lượng** buổi dạy thay thực tế.
- **Bằng chứng:**
  - `[QS]` `prisma/schema.prisma:1475` `actualTeacherId` · `:1478` `substituteTeacherId`; chú thích `:1477` ghi rõ *"dạy thay/đổi phòng cấp buổi (kế hoạch trước buổi; persist thay vì chỉ audit)"* ⇒ dạy thay là **kế hoạch trước buổi**, `actualTeacherId` là **ghi sau**.
  - `[QS]` `lib/scorm/access.ts:30-42` — `isAssignedTeacher` chỉ so `userId` với `actualTeacherId` (`:38`) · `class.teacherId` (`:39`) · `class.assistantId` (`:40`). **Không có** `substituteTeacherId`.
  - `[QS]` `lib/lms/session-ownership.ts:10-23` — **hàm KHÁC CÓ** `substituteTeacherId` (`:20`) ⇒ trong repo đang có **hai định nghĩa "GV của buổi" lệch nhau**.
  - `[QS]` `lib/auth/actor.ts:204-207` — `assignedClassIds` = `Class` chưa xoá mềm có `teacherId` **hoặc** `assistantId` = `userId`; **không đọc buổi**.
  - `[QS]` `01-intended-vs-implemented.md:82` — hai định nghĩa lệch này **đã được ghi nhận ở BƯỚC 1**, không phải phát hiện mới.
  - `[QS]` `app/(admin)/admin/scorm/play/[id]/page.tsx:89-113` **và** `app/(teacher)/teacher/scorm/play/[id]/page.tsx:101-125` — **hai bản sao** của cùng nhánh dự phòng; `02-prd:262` (`R-D8-05`) chỉ nêu **một** đường dẫn ⇒ gỡ theo đúng chữ nghiệm thu sẽ **bỏ sót site giáo viên**.
  - `[QS]` **Đính chính bản trước:** nhánh dự phòng **KHÔNG** cứu người dạy thay nói chung. Nó chỉ khớp khi người đó **đồng thời là `teacherId`/`assistantId` của một lớp khác cùng `curriculumId`/`courseId`** (`:100`, `:112`). GV dạy thay **thuần** → **đã 403 ngay hôm nay**, không cần chờ `R-D8-05`.
  - `[QS]` `lib/auth/check-permission.ts:33` và `:70` — shadow-diff **chỉ** ghi từ `checkPermission`; `lib/scorm/access.ts:47` gọi thẳng `getEffectivePermissions` (`lib/auth/can.ts:58-62`) ⇒ SCORM nằm **NGOÀI** cửa sổ shadow (trùng `QUYET-DINH.md:56`) — đây là lý do Cờ 1 = KHÔNG dù việc này chạm quyền.
- **Mã `R-*` bị chặn:** `R-D8-04` · `R-D8-05` · `R-D8-14` · `R-CONST-01` · `R-QDB-06`.
- **Cách kiểm rẻ nhất:** Một câu SQL chỉ-đọc trên 90 ngày gần nhất: đếm `ClassSession` có `substituteTeacherId IS NOT NULL` **và** khác cả `class.teacherId` lẫn `class.assistantId`. **Ngưỡng: > 0 buổi ⇒ phải đưa `substituteTeacherId` vào hàm gác hợp nhất của `R-D8-05` + hằng số `R-CONST-01` TRƯỚC khi gỡ nhánh dự phòng** — con số đó chính là số buổi sẽ vỡ nếu làm ngược thứ tự. Kiểm kèm **miễn phí bằng grep**: `R-D8-05` phải gỡ nhánh ở **CẢ HAI** file play (admin + teacher).
- **Câu hỏi cho Ban:** Hợp nhất về hàm nào — bản **CÓ** `substituteTeacherId` (`lib/lms/session-ownership.ts`) hay bản **KHÔNG** (`lib/scorm/access.ts`)? Đây là quyết định nghiệp vụ *"người dạy thay có được xem giáo án trước buổi không"*, không phải việc dọn mã.

#### GD-12 — Con số 23 tài khoản thật là con số đúng để lập bảng ánh xạ

Nhóm rủi ro KHẢ_DỤNG | Góc nhìn Thiết kế | Làn A | Impact 6 | Risk 2.8 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Số tài khoản thật phải chuyển sang mô hình mới là **23**, nên bảng ánh xạ `R-OPS-09` lập theo con số đó là đủ.
- **Nếu SAI thì sao:** Ai không có tên trong bảng ánh xạ thì sáng hôm sau **không có vai trò còn hiệu lực** và không vào được hệ thống — trong khi tiêu chí nghiệm thu *"23/23 tài khoản đăng nhập được"* vẫn **xanh**. Loại hỏng này **đã xảy ra một lần**: đợt apply 17 dòng ngày 09/07 được ghi là đã duyệt nhưng thực tế **chưa từng chạy**, phát hiện muộn một ngày bằng preflight.
- **Độ tin:** THẤP rằng con số 23 đúng — **ba nguồn cho ba con số khác nhau** (3 · 19–20 · 23) và **không nguồn nào đếm được từ mã nguồn**.
- **Bằng chứng:**
  - `[QS]` `00-baseline.md:164` — *"nhật ký `shadow-log.md` ghi 3 UserOrgRole (09/07) + 17 dòng (10/07) ≈ **19–20**; ghi nhớ phiên trước nói **23**. Hai con số không khớp — cần đếm lại từ DB, không đếm được từ code."*
  - `[QS]` `ke-hoach-go-live-2607/shadow-log.md:74-79` — đo 09/07: `Employee` active = **1**, tài khoản nhân viên = **3**, `UserOrgRole` trước hôm đó = **0**, không học viên, không traffic.
  - `[QS]` `ke-hoach-go-live-2607/shadow-log.md:126-138` — 10/07 preflight **đỏ 14 người**; giả thuyết mạnh nhất: **batch 17 dòng chưa bao giờ chạy thành công**.
  - `[QS]` `03-job-stories.md:695` — tiêu chí nghiệm thu **viết cứng** con số: *"Bảng ánh xạ 23 tài khoản thật… 23/23 tài khoản có ít nhất một vai trò còn hiệu lực"*.
  - `[QS]` `03-job-stories.md:921` — việc phải làm: *"Đếm lại số tài khoản thật từ cơ sở dữ liệu"*.
  - `[QS]` `02-prd:329` (`R-OPS-09`) — *"Bảng ánh xạ 23 tài khoản thật… có người ký duyệt"*.
  - `[QS]` `00-baseline.md:162` — cảnh báo sẵn: mọi con số RBAC hiện có là đếm **từ code seed**, có thể khác prod vì role sửa được qua UI `/admin/users/[id]/org-roles`.
- **Mã `R-*` bị chặn:** `R-OPS-09` · `R-OPS-02` · `R-OPS-05` · `R-D3-01` · `R-D3-04`.
- **Cách kiểm rẻ nhất:** Một truy vấn **chỉ-đọc**, chạy trong một phút: đếm `User` đang hoạt động có tài khoản đăng nhập, và đếm `UserOrgRole` trạng thái còn hiệu lực, **nhóm theo đơn vị và theo vai trò**. **Ngưỡng: lệch khác 0 so với 23 ⇒ bảng ánh xạ phải lập lại TỪ CSDL** (không từ tài liệu), con số đó phải được **ký lại** trước khi chạy đợt chuyển đổi, và sửa `03-job-stories.md:695` để **không viết cứng con số**. Truy vấn này chỉ đếm, không đổi dữ liệu ⇒ **Cờ 1 KHÔNG, Cờ 2 KHÔNG**.

#### GD-13 — Người phụ trách nhân sự sẽ nhập kiêm nhiệm vào hệ thống

Nhóm rủi ro KHẢ_DỤNG | Góc nhìn Thiết kế | Làn A | Impact 6 | Risk 3.6 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Có màn hình `R-D3-05` thì mỗi ca mượn người sẽ được lập thành **đợt điều động trong hệ thống** trước khi cơ sở xếp lớp.
- **Nếu SAI thì sao:** `R-D3-10` siết điều kiện gán GV theo phân công ⇒ GV mượn **không hiện trong ô chọn** ⇒ người xếp lớp bị chặn ngay tuần đầu, sẽ đòi nới điều kiện hoặc nhờ kỹ thuật sửa dữ liệu. Kết quả: cơ chế vừa xây **bị gỡ ra**, hoặc bị vô hiệu bằng đường tắt (xem GD-20). Người chịu: người xếp lớp CS1 và lịch khai giảng.
- **Độ tin:** TRUNG BÌNH — hiện trạng "0 call-site sản phẩm" **đã kiểm chứng bằng grep**; phần "HR có chịu nhập không" vẫn là suy đoán hành vi.
- **Bằng chứng:**
  - `[QS]` `lib/org/assignment-service.ts:49-101` — `createAssignment` có **đủ luật** (chặn 2 PRIMARY `:64-72`, audit `:87-91`, cảnh báo tổng allocation > 100 `:93-98`).
  - `[QS]` Grep toàn repo: `lib/org/assignment-service` **chỉ** được import bởi `lib/org/assignment-service.test.ts` và `tests/e2e/a0/employee-assignment.spec.ts` ⇒ **0 call-site sản phẩm**, khớp `01-intended-vs-implemented.md:119`.
  - `[QS]` **Bẫy nghiệm thu (mới, chưa nêu ở bước nào):** trong `app/` **đã tồn tại một hàm TRÙNG TÊN** `createAssignment` — `app/(admin)/admin/assignments/_actions.ts:118` — nhưng đó là **bài tập về nhà** (`sdb.assignment.create` `:143`), không liên quan nhân sự. Tiêu chí nghiệm thu `R-D3-05` (`02-prd:220`: *"Call-site `createAssignment` trong `app/` ≥ 1 (hiện 0)"*) và **điều kiện ra pha A5** (`02-prd:417`) đều viết dạng **đếm theo tên hàm** ⇒ **đã "xanh" sẵn bằng nhầm lẫn**. Phải đổi tiêu chí thành *"đếm import từ `lib/org/assignment-service`"*.
  - `[QS]` `app/(admin)/admin/nhan-su/actions.ts:59-113` (`syncHoAssignment`) — đường ghi `EmployeeOrgAssignment` **DUY NHẤT** trong sản phẩm, chỉ tạo/huỷ **PRIMARY tại HO** (`:74-81`, `:98-101`), ghi thẳng không qua service ⇒ đúng cái `R-D3-06` phải sửa.
  - `[QS]` `03-job-stories.md:175` — **hạ ước lượng công**: đã có **13 lời gọi trong bộ kiểm thử** ⇒ luật nghiệp vụ **đã viết và đã kiểm xong**, phần thiếu chỉ là **màn hình gọi vào**.
  - `[QS]` `03-job-stories.md:238` — khuyến nghị đã ghi: làm **JS-02A (đường tạo phân công thật) TRƯỚC JS-02B (nới điều kiện gán GV)**; đảo thứ tự mở lỗ hổng cách ly cơ sở.
- **Mã `R-*` bị chặn:** `R-D3-05` · `R-D3-06` · `R-D3-09` · `R-D3-10`.
- **Cách kiểm rẻ nhất:** Mở màn hình điều động **TRƯỚC**, siết `R-D3-10` **SAU**; trong 2–4 tuần đo tỉ lệ **số đợt điều động lập trong hệ thống / số ca mượn người thực tế** (đối chiếu công văn HR). **Ngưỡng bật siết: ≥ 90% và không ca nào lập sau ngày lớp khai giảng.** Cả hai bước đều **không** đổi giá trị hàm quyền và **không** đổi tập bản ghi ai đọc được ⇒ Cờ 1 KHÔNG, Cờ 2 KHÔNG.
- **Câu hỏi cho Ban:** Ai **bắt buộc** lập đợt điều động — HR Hội sở hay quản lý cơ sở đi mượn — và **chậm nhất bao lâu** trước ngày khai giảng?

#### GD-14 — Vai trò giảng dạy là một tập mã đóng

Nhóm rủi ro KHẢ_DỤNG | Góc nhìn Thiết kế | Làn A | Impact 6 | Risk 2.4 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Ai được đứng lớp **khai được bằng một hằng số danh sách mã vai trò** (`R-CONST-01`), và `R-D3-09` chỉ cần đọc hằng số đó.
- **Nếu SAI thì sao:** Siết theo hằng số ⇒ nhóm GV **chỉ có hồ sơ giáo viên** rơi khỏi **cả ô chọn lẫn guard** ⇒ lớp đang chạy mất GV hợp lệ. Cách chữa nhanh là **cấp thêm vai trò** cho họ — tức nới quyền rộng hơn nhu cầu, và làm hỏng chính vế *"đang giữ vai trò giảng dạy"* mà `R-D3-09`/`R-D8-04` dựa vào.
- **Độ tin:** TRUNG BÌNH — **ba nhánh nguồn GV đã kiểm chứng bằng mã**; chưa đếm được **bao nhiêu người** chỉ thuộc nhánh hồ sơ.
- **Bằng chứng:**
  - `[QS]` `lib/teachers/assignable.ts:43-47` — nguồn GV có **BA** nhánh `OR`: (a) `roles has "TEACHER"` (`:44`), (b) `teacherProfile status = ACTIVE` (`:45`), (c) `includeIds` (`:46`). Chỉ nhánh (a) là **mã vai trò**.
  - `[QS]` `lib/teachers/assignable.ts:38` — `centerWhere` chỉ áp cho (a) và (b); **nhánh (c) `includeIds` bỏ qua hoàn toàn bộ lọc cơ sở** (chú thích `:30` tự nhận). Đây là **đường thoát thứ ba** chưa mã `R-*` nào phủ.
  - `[QS]` `lib/teachers/assignable.ts:27-30` — chú thích còn ghi *"TBD-1: không kiêm nhiệm → lọc thuần theo `User.centerId`"* ⇒ hiện trạng đúng là **so cơ sở**, không phải so vai trò.
  - `[QS]` `02-prd:224` (`R-D3-09`) — điều kiện *"đang giữ vai trò giảng dạy VÀ có phân công còn hiệu lực"*; `02-prd:272` (`R-CONST-01`) — hằng số dùng chung khai danh sách **mã vai trò giảng dạy**, và `R-D8-04`/`R-D3-09`/`R-D3-10` đều đọc từ đây.
  - `[QS]` `03-job-stories.md:238` (ghi chú kiểm chứng vòng trước) — `lib/teachers/center-filter.ts:32-43` cũng quyết định bằng **phép so `centerId`**.
- **Mã `R-*` bị chặn:** `R-CONST-01` · `R-D3-09` · `R-D3-10` · `R-D8-04`.
- **Cách kiểm rẻ nhất:** Chỉ-đọc, **ba phép đếm** trên dữ liệu thật: (a) user có mã vai trò giảng dạy; (b) user **chỉ** có hồ sơ giáo viên `ACTIVE`; (c) user đang là `teacherId`/`assistantId`/`actualTeacherId` của lớp-buổi đang chạy **nhưng không thuộc (a)∪(b)**. **Ngưỡng: (c) = 0 mới được siết; (c) > 0 ⇒ hằng số PHẢI kèm nhánh hồ sơ giáo viên.** Cờ 2 = CÓ vì thay hàm lọc GV đổi **tập bản ghi GV** mà mỗi tài khoản xếp lớp nhìn thấy.
- **Câu hỏi cho Ban:** **Trợ giảng**, **giáo viên thỉnh giảng** và **người Đào tạo dạy thay** có được tính là *"đang giữ vai trò giảng dạy"* theo `R-D3-09` không?

#### GD-15 — Người cấp quyền sẽ nhập hạn khớp với đợt điều động

Nhóm rủi ro KHẢ_DỤNG | Góc nhìn Thiết kế | Làn A+B | Impact 7 | Risk 2.8 | Ô LÀM_LUÔN | Cờ 1 CÓ | Cờ 2 CÓ

- **Phát biểu:** Quyền cấp **kèm một đợt điều động** sẽ mang **đúng khoảng hiệu lực của đợt** (tiêu chí JS-02A), nên **hết đợt là hết quyền**.
- **Nếu SAI thì sao:** Người cấp bỏ trống ô ngày kết thúc — **thao tác nhanh nhất, không bị cảnh báo** ⇒ **quyền vĩnh viễn** tại cơ sở mượn. Bộ lọc theo thời gian trong `buildActor` **không cứu được** vì `null` nghĩa là vô thời hạn, nên toàn bộ trách nhiệm dồn lên tác vụ nền `R-D3-08` — mà tác vụ đó lại quét theo `derivedFrom`, thứ **chưa tồn tại trong repo**.
- **Độ tin:** THẤP rằng giả định đúng — **không có bất kỳ ràng buộc nào** chép hạn từ nguồn sang, cũng **không có** phép kiểm *"hạn quyền không dài hơn hạn nguồn"*.
- **Bằng chứng:**
  - `[QS]` `lib/auth/rbac-service.ts:206-221` — `upsert` `UserOrgRole` với `effectiveTo: parsed.effectiveTo ?? null` ở **cả `update` (`:210`) lẫn `create` (`:219`)**; hàm **không nhận** tham số nguồn, **không** so hạn với nguồn nào.
  - `[QS]` `prisma/schema.prisma:360` — `effectiveTo DateTime?` kèm chú thích *"null = vô thời hạn"*.
  - `[QS]` `lib/auth/actor.ts:121-127` — lọc vai trò còn hiệu lực: `r.effectiveTo == null || r.effectiveTo >= now` ⇒ dòng `null` **không bao giờ** rơi khỏi bộ lọc. **Đính chính bản trước:** dải đúng là `:121-127`, không phải `:115-121`.
  - `[QS]` `03-job-stories.md:182` — tiêu chí JS-02A: bản ghi quyền *"mang `derivedFrom` = mã đợt điều động và có **cùng khoảng hiệu lực với đợt**"*.
  - `[QS]` `02-prd:216` (`R-D3-01` — `derivedFromType`/`derivedFromId` *"không cho trống"*) · `02-prd:220` (`R-D3-05`) · `02-prd:223` (`R-D3-08` — tác vụ nền quét **theo `derivedFrom`**).
  - `[QS]` `01-intended-vs-implemented.md:119` — *"`derivedFrom` = **0 hit toàn repo**"* ⇒ móc nối mà `R-D3-08` cần **chưa tồn tại**.
- **Mã `R-*` bị chặn:** `R-D3-05` · `R-D3-01` · `R-D3-07` · `R-D3-08`.
- **Cách kiểm rẻ nhất:** Chỉ-đọc trên prod: đếm `UserOrgRole` `ACTIVE` có `effectiveTo = null`, **tách theo vai trò cơ sở và vai trò Hội sở**. Kèm yêu cầu thiết kế: màn `R-D3-05` **điền sẵn** `effectiveTo` = ngày kết thúc đợt và **từ chối hạn dài hơn nguồn**, thay vì để trống.
  **Điều kiện của hai cờ (quan trọng cho lịch):** nếu bản vá **chỉ chặn ở đường cấp MỚI** thì **Cờ 1 KHÔNG, Cờ 2 KHÔNG** → làm được trong lúc cửa sổ shadow còn mở. Nếu bản vá **backfill hạn cho các dòng `null` đang có** thì **cả hai cờ = CÓ** → phải chờ cửa sổ đóng. Meta ở trên ghi CÓ/CÓ vì đang giả định làm trọn gói.
- **Câu hỏi cho Ban:** Quyền cấp kèm đợt điều động **có được phép để trống ngày hết hạn** không, hay hệ thống **phải chép cứng** hạn của đợt và **từ chối** hạn dài hơn?

#### GD-16 — `CLASS` và `ASSIGNED` trùng nghĩa nên gộp hoặc bỏ một được

Nhóm rủi ro KHẢ_DỤNG | Góc nhìn Thiết kế | Làn A | Impact 4 | Risk 0.8 | Ô HOÃN | Cờ 1 CÓ | Cờ 2 KHÔNG

- **Phát biểu:** `CLASS` và `ASSIGNED` là **hai tên cho một logic**, nên gộp hoặc bỏ một trong hai **không mất nghĩa nghiệp vụ nào** (`R-D4-05`, §9 câu 11).
- **Nếu SAI thì sao:** Chúng trùng logic vì **cùng tra `actor.assignedClassIds`** — mà tập này **chỉ** nạp lớp có `teacherId`/`assistantId` = mình. **GV dạy thay** (`ClassSession.actualTeacherId`) **không** nằm trong tập đó, trong khi SCORM lại coi `actualTeacherId` là căn cứ mở nội dung và chính `R-D8-05` bắt hàm chuẩn phải *"gồm `actualTeacherId`"*. Hệ đang có **ba** khái niệm (GV chính · trợ giảng · GV dạy thay buổi) và **không tên scope nào diễn tả cái thứ ba**. Gộp/bỏ trước khi định nghĩa *"GV của buổi này"* làm **điều kiện (2) của D8 mất chỗ bám**, và `R-CONST-01` không biết có phải liệt kê người dạy thay không.
- **Độ tin:** THẤP rằng "gộp/bỏ là vô hại" — **phần "hai tên một logic" đã kiểm chứng và ĐÚNG**; cái sai nằm ở chỗ khác: **nội dung** của `assignedClassIds` thiếu người dạy thay (lỗ này thuộc GD-11).
- **Bằng chứng:**
  - `[QS]` `lib/auth/can.ts:27-29` — `case "CLASS":` và `case "ASSIGNED":` **rơi vào cùng một nhánh**, cùng trả `actor.assignedClassIds.has(target.classId)` ⇒ giả định "trùng logic" **ĐÚNG**.
  - `[QS]` `lib/auth/actor.ts:204-207` — `assignedClassIds` chỉ nạp `teacherId`/`assistantId`.
  - `[QS]` `lib/scorm/access.ts:36-41` — SCORM lại **có** `actualTeacherId` ⇒ hai tầng dùng hai định nghĩa.
  - `[QS]` `prisma/seed-roles.ts:466` (`attendance:mark` scope `CLASS`) và `:519` (`attendance:view` scope `ASSIGNED`) — **đúng 2 dòng seed** dùng hai tên này ⇒ **chi phí đổi dữ liệu rất thấp**.
  - `[QS]` `02-prd:232` (`R-D4-05`) · `02-prd:262` (`R-D8-05` — hàm chuẩn phải gồm `actualTeacherId`) · `02-prd:464` (§9 câu 11: *"Hai tên, một logic (`can.ts:27-29`)"*).
- **Mã `R-*` bị chặn:** `R-D4-05` · `R-D8-05` · `R-D8-04` · `R-CONST-01`.
- **Cách kiểm rẻ nhất:** Truy vấn chỉ-đọc trên bản sao prod: đếm `ClassSession` có `actualTeacherId IS NOT NULL` **và khác cả** `class.teacherId` lẫn `class.assistantId`, trong 90 ngày gần nhất. **Ngưỡng: > 0 buổi ⇒ dạy thay là hiện tượng THẬT, phải đặt tên scope cho nó (hoặc mở rộng `assignedClassIds`) TRƯỚC khi gộp/bỏ `CLASS`/`ASSIGNED`.** Cờ 1 = CÓ vì đổi giá trị `scopeType` trong seed **đổi kết quả `can()` trên 2 action đang chạy**; Cờ 2 = KHÔNG vì `scopedDb` không đọc hai tên này.
- **Câu hỏi cho Ban:** *"Lớp được gán"* có bao gồm **GV dạy thay một buổi** không — và nếu có thì quyền của họ **hết theo buổi hay theo lớp**? (ứng §9 câu 11, `02-prd:464`.)

#### GD-17 — Buổi mà giao diện gắn vào liên kết đúng buổi đang chuẩn bị

Nhóm rủi ro KHẢ_DỤNG | Góc nhìn Thiết kế | Làn A | Impact 6 | Risk 4.2 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** `sessionId` mà màn hình tài liệu **tự gắn** vào liên kết mở slide **chính là buổi giáo viên đang chuẩn bị**, nên cửa sổ mở khoá tính theo buổi đó là tính đúng.
- **Nếu SAI thì sao:** Cửa sổ mở khoá (`R-D8-07`) tính trên **một buổi ngẫu nhiên**: màn thư viện chọn buổi **MỚI NHẤT theo ngày trong TẤT CẢ lớp cùng khoá** của giáo viên, **không hỏi người dùng, không lọc theo ngày**. Giáo viên chuẩn bị buổi ngày mai của lớp B nhưng hệ tính cửa sổ theo buổi tuần trước của lớp A → **403 kèm thông báo "ngoài cửa sổ" vô nghĩa** với người dùng. Hôm nay hậu quả **bị che** bởi nhánh dự phòng ở trang play; `R-D8-05` gỡ nhánh đó là hậu quả **lộ ra ngay**. Người chịu: giáo viên dạy nhiều lớp cùng khoá (đa số).
- **Độ tin:** THẤP rằng giả định đúng — **cơ chế chọn buổi đã kiểm chứng bằng mã và nó không hỏi người dùng**; chưa đo được **tần suất** gắn nhầm.
- **Bằng chứng:**
  - `[QS]` `app/(teacher)/teacher/tai-lieu/page.tsx:110` — `myCourseClassIds` gom **MỌI lớp** giáo viên dạy khoá đó.
  - `[QS]` `app/(teacher)/teacher/tai-lieu/page.tsx:127-133` — truy vấn buổi `orderBy: { date: "desc" }`, **không** lọc theo ngày hiện tại.
  - `[QS]` `app/(teacher)/teacher/tai-lieu/page.tsx:149-154` — `sessionByLesson` lấy **buổi ĐẦU TIÊN gặp** (tức mới nhất), **không hỏi người dùng**.
  - `[QS]` `app/(teacher)/teacher/tai-lieu/_components/lesson-filter-list.tsx:126-131` — `sessionId` đó đi **thẳng vào URL** mở slide.
  - `[QS]` `app/(admin)/admin/teaching-materials/page.tsx:329-334` — cùng kiểu ghép URL ở khu admin. **Đính chính bản trước:** dải đúng là `:329-334` (bản trước ghi 329-332/332-333).
  - `[QS]` `app/(admin)/admin/scorm/play/[id]/page.tsx:89-113` — nhánh dự phòng đang **che** hậu quả gắn nhầm buổi; `02-prd:262` (`R-D8-05`) đòi gỡ nó.
- **Mã `R-*` bị chặn:** `R-D8-07` · `R-D8-06` · `R-D8-14` · `R-D8-05`.
- **Cách kiểm rẻ nhất:** Truy vấn chỉ-đọc trên `ScormAccessLog`: với mỗi lượt mở có `classSessionId`, kiểm **có tồn tại buổi KHÁC cùng `lessonId`, cùng giáo viên, gần `openedAt` hơn** buổi đã ghi không. **Ngưỡng: > 15% lượt "gắn nhầm buổi" ⇒ phải cho giáo viên CHỌN buổi trên giao diện TRƯỚC khi bật cửa sổ mở khoá.** Kiểm miễn phí kèm theo: `R-D8-05` (gỡ nhánh dự phòng) và việc sửa chỗ chọn buổi **phải nằm CÙNG một lần phát hành** — tách ra là vỡ.

#### GD-18 — Có kỳ đóng băng để kế toán ký xác nhận

Nhóm rủi ro KHẢ_DỤNG | Góc nhìn Thiết kế | Làn B | Impact 8 | Risk 4.2 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Tồn tại (hoặc dựng được rẻ) một **"kỳ đóng băng"** mà báo cáo xuất lại sau nhiều ngày **vẫn ra đúng con số cũ** — nên `R-OPS-03` (xuất trước/sau, liệt kê từng dòng chênh, kế toán ký) là việc làm được.
- **Nếu SAI thì sao:** `R-OPS-03` là **ĐIỀU KIỆN BẬT** của cả làn **B5** (toàn bộ nhánh tiền của D10). Không có kỳ đóng băng thì *"chênh trước/sau"* **lẫn với chênh do dữ liệu tự đổi** → kế toán **không dám ký** → B5 không khởi động dù kỹ thuật đã xong. Người chịu: **cả chương trình đứng ở cửa cuối**.
- **Độ tin:** TRUNG BÌNH — **đã kiểm chứng rằng không có mô hình khoá sổ cho học phí** và **đã kiểm chứng đường mã làm tiền nhảy kỳ**; chưa đo mức chênh thực tế.
- **Bằng chứng:**
  - `[QS]` `02-prd:323` (`R-OPS-03`: *"Chọn 1 kỳ đóng băng… Không có chữ ký → không bật"*) · `02-prd:444` (*"`R-OPS-03`… là **điều kiện bật** cho B5"*) · `02-prd:434` (chuỗi B5).
  - `[QS]` Grep toàn `prisma/schema.prisma`: **không có** model kỳ kế toán/khoá sổ cho học phí; `Payment` **không có** trường khoá kỳ, chỉ có `deletedAt` (`prisma/schema.prisma:4945` — xoá mềm, biến mất khỏi báo cáo).
  - `[QS]` `prisma/schema.prisma:603-612` (`MarketingCostPeriod`: `period` unique, `status DRAFT/CONFIRMED/REOPENED`, `confirmedAt`) + `lib/crm/cost-allocation.ts:62-73` (`confirmCostPeriod`) — **tiền lệ "chốt kỳ" ĐÃ CÓ trong repo**, dựng tương tự cho doanh thu **không phải từ số 0**.
  - `[QS]` `lib/orders/installments.ts:70-82` — sửa kế hoạch trả góp **xoá mềm MỌI `Payment` tự động cũ** (`note contains "[auto:"`) trong cùng transaction; `:99-108` dựng lại qua `ensureOrderPaymentRecorded`.
  - `[QS]` `lib/finance/payment.ts:100-106` — khoản dựng lại mang `paidDate: now` ⇒ **tiền NHẢY sang kỳ hiện tại**. Đây là cơ chế làm báo cáo tháng cũ **đổi số** mà không ai chạm vào tháng cũ.
  - `[QS]` `lib/finance/payment.ts:98` — `if (!centerId) centerId = params.actor.centerId` — **đúng cách suy đơn vị mà `R-D10-07` (`02-prd:297`) cấm**; cùng một đường mã, nên việc dựng kỳ đóng băng và `R-D10-07` nên đi **cùng một lần phát hành**.
- **Mã `R-*` bị chặn:** `R-OPS-03` · `R-D10-04` · `R-D10-12` · `R-D9-09`.
- **Cách kiểm rẻ nhất:** **Rẻ hơn cách chờ 7 ngày:** trên môi trường thử có dữ liệu giống prod, xuất báo cáo doanh thu **1 tháng ĐÃ QUA** của 1 cơ sở → **sửa kế hoạch trả góp của đúng 1 đơn thuộc tháng đó** → xuất lại. **Ngưỡng: lệch phải = 0đ.** Lệch ≠ 0 ⇒ *"kỳ đóng băng"* **chưa tồn tại** → `R-OPS-03` phải đổi thành *"chụp và lưu bản báo cáo bất biến"* (việc mới, theo mẫu `MarketingCostPeriod`), nếu không **B5 vĩnh viễn bị chặn**.
- **Câu hỏi cho Ban:** Ngoài kế toán tổng hợp HO, **ai ký** con số căn cứ tính phí **về phía bên NHẬN nhượng quyền (FRANCHISEE)**? Không có chữ ký hai phía thì bản đối soát chỉ là **báo cáo nội bộ của bên NHƯỢNG quyền (FRANCHISOR)**.

#### GD-19 — Mở phạm vi xem chi tiết cho HO là THÊM quyền

Nhóm rủi ro KHẢ_DỤNG | Góc nhìn Thiết kế | Làn B | Impact 7 | Risk 4.2 | Ô LÀM_LUÔN | Cờ 1 CÓ | Cờ 2 CÓ

- **Phát biểu:** D10 là việc **CẤP** cho HO một quyền xem mới trong phạm vi, nên triển khai chỉ là **thêm màn hình** — không ai đang dùng bị mất gì.
- **Nếu SAI thì sao:** Thực tế **ngược lại**: tài khoản cấp HO hiện đọc được **TOÀN BỘ** cơ sở, nên `R-D4-09` + `R-D10-10` là **LẤY ĐI** quyền người ta đang dùng hằng ngày. Kế hoạch **không có bước "ai mất gì"** cho nhóm HO → đến ngày bật, kế toán/marketing/nhân sự HO **mất màn hình quen thuộc** và việc bị đẩy lùi; hoặc tệ hơn, **bị lùi cờ** và D10 không bao giờ bật. Người chịu: người dùng HO (mất quyền không báo trước) và cả chương trình (lùi cờ = B5 đứng).
- **Độ tin:** THẤP rằng giả định đúng — **hai đường thoát `isHoLevel ? "ALL"` đã kiểm chứng bằng mã**; chưa ai đếm **bao nhiêu người** đang sống nhờ chúng.
- **Bằng chứng:**
  - `[QS]` `lib/db-scope.ts:184` và `:218` — **hai lần** `return actor.isHoLevel ? "ALL" : actor.visibleCenterIds` ⇒ HO thấy **mọi cơ sở** ở tầng truy vấn.
  - `[QS]` `app/(admin)/admin/bao-cao/trung-tam/page.tsx:258` — `const bypass = actor.isSuperAdmin || actor.isHoLevel;`.
  - `[QS]` `02-prd:83` (**KR7**) — *"Đường thoát scope 'thấy toàn bộ cơ sở': hiện **4** → đích **2**"*. **Đính chính bản trước:** KR7 ở dòng **83**, không phải 84 (dòng 84 là KR8).
  - `[QS]` `02-prd:236` (`R-D4-09` — thu hẹp `isHoLevel`, QĐ-A.1) · `02-prd:294` (`R-D10-04` phụ thuộc `R-D4-09`) · `02-prd:300` (`R-D10-10` là **chốt chặn**) · `02-prd:442` (`R-D4-09` **chỉ** phụ thuộc `R-D10-03`).
  - `[QS]` `QUYET-DINH.md:100` — bảng tra: **QĐ-A.1 (thu hẹp `isHoLevel`) = CÓ đụng shadow, chờ cửa sổ đóng**. **Đính chính bản trước:** dòng **100**, không phải 99 (dòng 99 là QĐ-A).
  - `[QS]` `02-prd:322` (`R-OPS-02`) — công cụ chụp *"ai mất quyền vì lần đổi này"* **đã được đặc tả sẵn**, không phải dựng mới.
- **Mã `R-*` bị chặn:** `R-D4-09` · `R-D10-04` · `R-D10-10` · `R-OPS-02`.
- **Cách kiểm rẻ nhất:** Chạy **đúng phép chụp của `R-OPS-02`** nhưng **chỉ cho nhóm tài khoản có vai trò tại HO**: liệt kê *tài khoản × tập cơ sở nhìn thấy × màn hình đã mở trong 30 ngày* (nhật ký), rồi **mô phỏng sau khi thu hẹp `isHoLevel`**. **Ngưỡng: > 0 tài khoản HO mất một màn hình họ đã mở trong 30 ngày ⇒ phải có danh sách đổi có chủ đích được ký trước**, và `R-D10-04`/`R-D10-10` phải nêu rõ đây là **THU HẸP**, không phải mở rộng.
- **Câu hỏi cho Ban:** Sau khi thu hẹp `isHoLevel`, **vai trò HO nào vẫn được xem dữ liệu toàn hệ thống theo chức năng** (kế toán tổng hợp? marketing?) — và xem tới **mức chi tiết nào**?

#### GD-20 — Người xếp lớp sẽ không sửa cơ sở của giáo viên

Nhóm rủi ro KHẢ_DỤNG | Góc nhìn Thiết kế | Làn A+B | Impact 7 | Risk 3.0 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Khi GV không xuất hiện trong ô chọn, người xếp lớp sẽ **đi lập hoặc kiểm đợt điều động**.
- **Nếu SAI thì sao:** Đường tắt hiển nhiên hơn là **nhờ người có quyền Hội sở đổi cơ sở/đơn vị của GV cho khớp lớp**. Nơi trực thuộc HO bị ghi đè thành CS1 ⇒ **hỏng phân bổ lương/chi phí**, **hỏng báo cáo nhân sự theo đơn vị**; với cơ sở của **bên NHẬN nhượng quyền (FRANCHISEE)** là **ghi sai pháp nhân sử dụng lao động**. Không có cảnh báo nào phát ra và không ai đối chiếu — đúng kịch bản `03-job-stories.md:167` gọi là *"mượn người bị làm tắt thành đổi nơi trực thuộc"*.
- **Độ tin:** TRUNG BÌNH — **đường ghi và mức guard đã kiểm chứng bằng mã**; phần "người ta sẽ dùng đường tắt" là suy đoán hành vi, nhưng phạm vi hẹp hơn lo ngại ban đầu (**chỉ actor cấp HO/SUPER_ADMIN** làm được) — mà đó đúng là nhóm hay được nhờ *"xử lý nhanh"*.
- **Bằng chứng:**
  - `[QS]` `lib/validators/employee.ts:90-91` — schema nhận **CẢ `centerId` LẪN `orgUnitId`** từ payload.
  - `[QS]` `app/(admin)/admin/nhan-su/actions.ts:333-337` — guard duy nhất là `actorCanUseCenter(actor, data.centerId ?? null)`: **chỉ so tầm nhìn của actor**, **không** nối với phân công `PRIMARY` ⇒ actor cấp HO (tầm nhìn toàn hệ thống) **qua được mọi cơ sở**.
  - `[QS]` **Lỗ rộng hơn bản trước nêu:** **không có guard tương ứng cho `data.orgUnitId`**; `sdb.employee.update({ where: { id }, data })` (`app/(admin)/admin/nhan-su/actions.ts:351`) ghi thẳng **cả hai** trường. Ô *"Đơn vị làm việc"* trên biểu mẫu ghi **đúng `orgUnitId`** (`components/admin/nhan-su/employee-form.tsx:139`, `:357-362`) ⇒ đường tắt **có sẵn ngay trên giao diện**, không cần dựng payload tay.
  - `[QS]` `lib/db-scope.ts:254` — `Employee` thuộc `SCOPED_MODELS`, cách ly theo `centerId` ⇒ đổi `centerId` = **đổi tập tài khoản đọc được hồ sơ đó** (⇒ **Cờ 2 = CÓ**). Ngược lại, đổi **`orgUnitId`** *không* đổi tập đọc — nó chỉ hỏng phân bổ lương/chi phí và pháp nhân; đây chính là trường **đang không có guard**.
  - `[QS]` `03-job-stories.md:167` · `02-prd:218` (`R-D3-03` — `PRIMARY` là **nguồn sự thật duy nhất**, `Employee.centerId`/`orgUnitId` chỉ ghi lại tự động; *"gửi thẳng payload `centerId` khác → bị bỏ qua"*).
- **Mã `R-*` bị chặn:** `R-D3-03` · `R-D3-05` · `R-D3-09`.
- **Cách kiểm rẻ nhất:** Đo hành vi thật trên **nhật ký kiểm toán** sau khi mở màn hình điều động: đếm số lần `Employee.centerId` **và `orgUnitId`** bị đổi mỗi tháng bởi actor cấp HO/SUPER_ADMIN, kèm **khoảng cách thời gian tới thao tác tạo/sửa lớp gần nhất** của cùng người. **Ngưỡng cảnh báo: > 2 lần/tháng xảy ra trong cùng phiên với tạo lớp ⇒ đường tắt đang được dùng, phải khoá `centerId` theo `R-D3-03` ngay** — và bổ sung guard cho `orgUnitId`, thứ `R-D3-03` hiện **chỉ nhắc `centerId`**.

#### GD-21 — Nghỉ việc có một tín hiệu duy nhất máy đọc được

Nhóm rủi ro KHẢ_DỤNG | Góc nhìn Thiết kế | Làn B | Impact 8 | Risk 4.2 | Ô LÀM_LUÔN | Cờ 1 CÓ | Cờ 2 CÓ

- **Phát biểu:** `R-D3-12` kích hoạt được vì *"nhân viên nghỉ việc"* là **một trạng thái xác định** trên hồ sơ.
- **Nếu SAI thì sao:** Hồ sơ có **ba cờ độc lập** (trạng thái lao động, cờ `isActive` legacy, ngày kết thúc hợp đồng) **cộng ba cờ nữa bên tài khoản** (`isActive`, `deletedAt`, `accountStatus`); **không cờ nào bắt buộc đi cùng nhau** và biểu mẫu cho **nhập riêng lẻ**. HR chỉ tắt một cờ ⇒ điều kiện `R-D3-12` không khớp ⇒ **quyền không bị thu hồi**, và **không ai thấy sai** vì màn hình vẫn hiện *"đã nghỉ"*. Đây đúng lỗ *"rộng hơn kiêm nhiệm quá hạn"* mà §9 câu 4 nêu; khi cơ sở là **pháp nhân khác** thì thành: **người đã rời tổ chức vẫn đọc dữ liệu học viên của bên NHẬN nhượng quyền (FRANCHISEE)**.
- **Độ tin:** THẤP rằng giả định đúng — **sáu cờ đã kiểm chứng bằng schema**, và **chính tiêu chí nghiệm thu của `R-D3-12` đang trỏ vào một trạng thái không tồn tại** (xem bằng chứng cuối).
- **Bằng chứng:**
  - `[QS]` `prisma/schema.prisma:1926-1931` — `enum EmploymentStatus` có **đúng 4** giá trị: `ACTIVE` · `ON_LEAVE` · `RESIGNED` · `TERMINATED`.
  - `[QS]` `prisma/schema.prisma:1947` (`Employee.isActive`) · `:1960` (`endDate`) · `:1968` (`status`).
  - `[QS]` `prisma/schema.prisma:719-720` (`User.isActive`, `User.deletedAt`) · `:729` (`User.accountStatus`). **Đính chính bản trước:** dải đúng là `:719-720` (dòng 717 là `centerId`).
  - `[QS]` `components/admin/nhan-su/employee-form.tsx:273-291` (select *"Trạng thái công việc"*) và `:293-300` (Switch *"Đang làm việc (legacy)"*) — **hai ô nhập độc lập**; chú thích `:288-290` **tự nhận** `isActive` chỉ là *"legacy flag"*.
  - `[QS]` **Mâu thuẫn trong chính tiêu chí:** `02-prd:227` (`R-D3-12`) viết *"Đặt nhân viên **`INACTIVE`**/kết thúc `PRIMARY`"* — **`INACTIVE` KHÔNG phải giá trị của `EmploymentStatus`**. Tiêu chí nghiệm thu đang trỏ vào một trạng thái không tồn tại, hoặc lẫn `Employee.status` với `User.isActive`.
  - `[QS]` `02-prd:457` (§9 câu 4 — *"nguồn **biên chế** chưa được phủ — lỗ này rộng hơn kiêm nhiệm quá hạn vì chạm **mọi** vai trò"*).
- **Mã `R-*` bị chặn:** `R-D3-12` · `R-D3-03` · `R-D3-08`.
- **Cách kiểm rẻ nhất:** Chỉ-đọc trên prod, **bốn phép đếm lệch cờ**: (1) `status ∈ {RESIGNED, TERMINATED}` mà `isActive = true`; (2) `endDate < hôm nay` mà `status = ACTIVE`; (3) `Employee` đã nghỉ mà tài khoản gắn kèm vẫn `isActive = true`; (4) `Employee` đã nghỉ mà `accountStatus` vẫn `ACTIVE`. **Ngưỡng: cả bốn nhóm = 0 thì `R-D3-12` mới có nghĩa; khác 0 ⇒ phải chốt MỘT cờ chính thức và ép các cờ còn lại đi theo** — và sửa lại chữ `INACTIVE` trong `02-prd:227` cho khớp enum thật.
- **Câu hỏi cho Ban:** **Cờ nào là tín hiệu chính thức của "nghỉ việc"** để hệ thống cắt quyền, và các cờ còn lại (`isActive` legacy, `endDate`, `accountStatus`) **có được phép nhập độc lập** không? (nối §9 câu 4.)

#### GD-22 — Có danh sách action miễn nhiễm DENY đủ để SUPER_ADMIN không tự khoá

Nhóm rủi ro KHẢ_DỤNG | Góc nhìn Thiết kế | Làn B | Impact 6 | Risk 2.8 | Ô LÀM_LUÔN | Cờ 1 CÓ | Cờ 2 KHÔNG

- **Phát biểu:** Tồn tại một danh sách action **HẸP**, khai được và thống nhất được, mà `SUPER_ADMIN` **miễn nhiễm với DENY** — đủ chống tự khoá mà vẫn để DENY có nghĩa.
- **Nếu SAI thì sao:** Ngoại lệ ở v1 là **TOÀN PHẦN theo chiều DENY**: nhánh `SUPER_ADMIN` đặt **TRƯỚC** nhánh grant, nên DENY **không bao giờ** áp cho `SUPER_ADMIN`, ở **MỌI** action (nó vẫn tra ma trận, chỉ bỏ qua DENY). QĐ-B mục 2 viện dẫn *"v1 đã có"* **như thể đó là ngoại lệ hẹp**. Hệ quả: **hai mã yêu cầu đòi hai kết quả ngược nhau trên cùng một ca** (`R-QDB-02`: SUPER_ADMIN bị DENY → **false**; `R-QDB-03`: → **vẫn true**), mà `02-prd:440` (a) lại bắt hai mã phải **CÙNG một lần phát hành**. Chọn hẹp ⇒ lệch với v1 ở **mọi** action bị DENY (đẻ lệch shadow ngay khi vừa bật); chọn rộng bằng v1 ⇒ `R-QDB-02` **không thể xanh**.
- **Độ tin:** THẤP rằng "danh sách hẹp đang tồn tại" — **mã đã bác trực tiếp**: v1 miễn nhiễm toàn phần, không có danh sách nào.
- **Bằng chứng:**
  - `[QS]` `lib/auth/permissions.ts:653-656` — *"2a. SUPER_ADMIN bypass — không thể bị DENY override (chống tự khoá)"*: `if (effective.includes("SUPER_ADMIN")) return PERMISSIONS[action]?.includes("SUPER_ADMIN") ?? false;` ⇒ **vẫn tra ma trận (`:655`), chỉ bỏ qua DENY**.
  - `[QS]` `lib/auth/permissions.ts:658-661` — nhánh grant `DENY`/`ALLOW` nằm **SAU** ⇒ với `SUPER_ADMIN` nó **không bao giờ chạy**.
  - `[QS]` `QUYET-DINH.md:53` — QĐ-B mục 2 viện dẫn *"v1 đã có: `permissions.ts:653-656`"* như một **ngoại lệ tường minh**; thực tế nó **toàn phần theo chiều DENY**.
  - `[QS]` `02-prd:242` (`R-QDB-02`) vs `02-prd:243` (`R-QDB-03`) — hai kết quả ngược nhau trên cùng ca; `02-prd:440` (a) bắt hai mã **cùng một lần phát hành**.
  - `[QS]` `QUYET-DINH.md:61` — QĐ-B **đã đặt sẵn** việc kiểm kê chỉ-đọc `UserPermissionGrant WHERE grant='DENY'` ⇒ phép đếm dưới đây **không phải việc mới**.
- **Mã `R-*` bị chặn:** `R-QDB-02` · `R-QDB-03` · `R-QDB-04`.
- **Cách kiểm rẻ nhất:** Đây là **CÂU HỎI QUYẾT ĐỊNH**, không phải thí nghiệm — nhưng có số đo rẻ để đóng khung: truy vấn chỉ-đọc đếm `UserPermissionGrant grant='DENY'` **giao với** người đang mang vai trò `SUPER_ADMIN` tại HO/ROOT (kèm `userId` + `action` + `reason`). **Ngưỡng: = 0 ⇒ tranh cãi đang là lý thuyết, chốt hẹp được; > 0 ⇒ phải liệt kê từng dòng và có người ký trước khi phát hành.** Kèm điều kiện văn bản: `R-QDB-03` phải ghi rõ danh sách miễn nhiễm là **DANH SÁCH TÊN ACTION**, không phải *"như v1"*.
  ⚠️ **Phép đếm này chỉ để ƯỚC LƯỢNG ĐỘ LỚN rủi ro — KHÔNG phải cổng mở làn B.** Cổng mở làn B là **3 việc của QĐ-B** (`QUYET-DINH.md:52-58`).
  📣 **Nhắc lịch (không phải câu hỏi):** `QUYET-DINH.md:58-59` — QĐ-B **chặn lịch flip** của đợt go-live RBAC đang chạy; dòng `:59` yêu cầu **BÁO LẠI** chủ đợt đó. Riêng *"cửa sổ shadow đóng theo tiêu chí nào"* mới là câu **HỎI** (§9 câu 12, `02-prd:465`).
- **Câu hỏi cho Ban:** `R-QDB-02` và `R-QDB-03` **mâu thuẫn trên cùng một ca**. Danh sách action mà `SUPER_ADMIN` miễn nhiễm DENY gồm **chính xác** những gì — hay **giữ miễn nhiễm toàn phần như v1** và sửa lại nghiệm thu `R-QDB-02`?

#### GD-23 — Không ai đang sống nhờ việc grant ALLOW mở tầm nhìn toàn hệ thống

Nhóm rủi ro KHẢ_DỤNG | Góc nhìn Thiết kế | Làn B | Impact 5 | Risk 1.5 | Ô HOÃN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Vá `R-QDB-07` (grant `ALLOW` **không còn** tự động mở tầm nhìn ra mọi cơ sở) **chỉ đóng một lỗ**, không cắt việc của ai đang làm.
- **Nếu SAI thì sao:** Tầng cách ly hiện coi **mọi** grant `ALLOW` khớp tiền tố model là *"ngoại lệ toàn cục"* → trả `ALL`. Nếu vận hành **đã dùng grant ALLOW như cách vá nhanh** để một người làm hộ cơ sở khác (rất dễ xảy ra vì đó là công cụ duy nhất cấp quyền **theo NGƯỜI**), thì bản vá cắt tầm nhìn của họ **NGAY và IM LẶNG** — họ chỉ thấy **danh sách rỗng**, không thấy thông báo từ chối. Người dùng sẽ báo lên dưới dạng *"mất dữ liệu"*, không phải *"mất quyền"*.
- **Độ tin:** TRUNG BÌNH — **cơ chế đã kiểm chứng bằng mã**; **số người đang sống nhờ nó** thì chưa ai đếm.
- **Bằng chứng:**
  - `[QS]` `lib/db-scope.ts:203-210` — vòng lặp trên `actor.grantsAllow`: khớp tiền tố model là `hasAll = true`, kèm chú thích *"per-user grants are global exceptions"*; `:212` `if (hasAll) return "ALL"`.
  - `[QS]` `lib/db-scope.ts:218` — nhánh *"không có quyền model-specific"* vẫn trả `visibleCenterIds` ⇒ sau khi vá, người mất grant **rơi về tầm nhìn cơ sở của họ**: danh sách rỗng, **không** lỗi 403, **không** thông báo.
  - `[QS]` `02-prd:247` (`R-QDB-07` — *"Actor CS1 có grant ALLOW `students:view` → đọc `Student` **vẫn chỉ thấy CS1** (hiện thấy tất cả)"*).
  - `[QS]` `02-prd:322` (`R-OPS-02`) — dùng lại **đúng** công cụ chụp trước/sau, không dựng phép đo riêng.
- **Mã `R-*` bị chặn:** `R-QDB-07` · `R-QDB-01` · `R-OPS-02`.
- **Cách kiểm rẻ nhất:** Truy vấn chỉ-đọc: liệt kê `UserPermissionGrant grant='ALLOW'` có `action` khớp tiền tố model (`leads:`, `students:`, `classes:`, `orders:`, `payments:`, `employees:`…), kèm **tập cơ sở nhìn thấy** của từng người suy từ `UserOrgRole`. **Ngưỡng: mỗi dòng mà tập cơ sở KHÔNG phủ hết cơ sở người đó đang thao tác = một người sẽ mất dữ liệu sau khi vá ⇒ phải có `UserOrgRole` thay thế TRƯỚC.** Chạy **kèm** phép kiểm kê DENY của QĐ-B (`QUYET-DINH.md:61`) — cùng một bảng, một lần chạy.

#### GD-24 — Giáo viên chỉ cần nội dung quanh ngày buổi dạy

Nhóm rủi ro KHẢ_DỤNG | Góc nhìn Thiết kế | Làn A | Impact 7 | Risk 5.6 | Ô THÍ_NGHIỆM | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Nhu cầu xem nội dung của giáo viên **nằm gọn trong một cửa sổ vài ngày quanh ngày buổi** (`unlockDaysBefore`/`unlockDaysAfter`), **VÀ** mọi lượt mở đều có **một buổi để làm mốc** — nên khoá ngoài cửa sổ không chặn công việc thật.
- **Nếu SAI thì sao:** `R-D8-07` (cỡ **L**, đắt nhất nhóm D8) biến thành **máy sinh 403** cho giáo viên hợp lệ theo **hai đường**: (a) soạn bài trước cả khoá / dạy dồn / ôn lại buổi cũ → **ngoài cửa sổ**; (b) lượt mở **KHÔNG kèm buổi** (xem thử, chưa xếp lịch, tài liệu chung) → **không có mốc, fail-closed khoá luôn**. Người chịu: giáo viên đứng lớp và Đào tạo HO (nhận khiếu nại). `R-D8-14` sẽ nghiệm thu **xanh** trên ca giả lập có buổi, trong khi **đường thật đỏ**.
- **Độ tin:** THẤP rằng giả định đúng — vế (b) **đã kiểm chứng bằng mã** (nhánh URL không có `sessionId` là **nhánh mặc định trên đường chính**, không phải ca hiếm); vế (a) chưa có số đo.
- **Bằng chứng:**
  - `[QS]` `prisma/schema.prisma:1440-1502` — **toàn bộ** model `ClassSession` **không có** trường thời gian mở nội dung.
  - `[QS]` Grep `openAt` toàn `schema.prisma` = **1 hit**, `:2318`, nằm trong `model Exam` (`:2294`).
  - `[QS]` `prisma/schema.prisma:4686-4698` (`ScormAccessLog`), `:4689` — `classSessionId String?` **nullable** ⇒ **có lượt mở không gắn buổi**, và mô hình đã ghi nhận điều đó.
  - `[QS]` `app/(teacher)/teacher/tai-lieu/_components/lesson-filter-list.tsx:126-131` — **đường chính đã có nhánh KHÔNG kèm `sessionId`** (`/teacher/scorm/play/{id}` trần) khi bài chưa có buổi; bản admin y hệt (`app/(admin)/admin/teaching-materials/page.tsx:329-334`).
  - `[QS]` `01-intended-vs-implemented.md:84` — ĐK(4) *"**Khái niệm không tồn tại**"*; *"GV mở giáo án buổi cuối khoá ngay ngày đầu"*.
  - `[QS]` `03-job-stories.md:159` — *"BGĐ **chưa chốt GIÁ TRỊ MẶC ĐỊNH** của cửa sổ mở khoá"*.
  - `[QS]` `02-prd:264` (`R-D8-07`, cỡ **L**) · `02-prd:271` (`R-D8-14` — ma trận "khi và chỉ khi" 4 điều kiện).
- **Mã `R-*` bị chặn:** `R-D8-07` · `R-D8-14` · `R-D6-05`.
- **Cách kiểm rẻ nhất:** **Một câu SQL chỉ-đọc** trên `ScormAccessLog` (`prisma/schema.prisma:4686-4698`), hai chỉ số **theo thứ tự**: (a) tỉ lệ dòng `classSessionId IS NULL` — **ngưỡng > 10% ⇒ `R-D8-07` phải định nghĩa hành vi cho lượt mở không có buổi TRƯỚC khi viết cửa sổ**, nếu không fail-closed khoá cả nhóm này; (b) trên phần còn lại, phân bố `(openedAt − session.date)` theo ngày — **ngưỡng > 20% lượt có |lệch| > 7 ngày ⇒ cửa sổ ±3 ngày chặn 1/5 lượt dạy thật ⇒ phải cấu hình theo khoá, không đặt hằng**. Chi phí: 1 câu SQL. Đây là ô **THÍ NGHIỆM** vì cỡ L: đo trước khi xây, không xây rồi mới đo.
- **Câu hỏi cho Ban:** Giá trị **mặc định** của cửa sổ mở khoá là **bao nhiêu ngày trước/sau**, **ai được ghi đè** (Đào tạo HO hay quản lý cơ sở), và **lượt mở KHÔNG gắn buổi** (xem thử / tài liệu chung) xử lý ra sao?

#### GD-25 — Quản lý cơ sở làm việc được chỉ với siêu dữ liệu

Nhóm rủi ro KHẢ_DỤNG | Góc nhìn Thiết kế | Làn A | Impact 5 | Risk 2.8 | Ô HOÃN | Cờ 1 CÓ | Cờ 2 CÓ

- **Phát biểu:** Quản lý cơ sở **chỉ cần danh mục** (tên tài liệu, loại, dung lượng, ngày cập nhật) là đủ để kết luận một buổi *"đủ hay thiếu tài liệu"* và trả lời phụ huynh, **không cần mở tệp**.
- **Nếu SAI thì sao:** `R-D8-09` **lấy đi** thứ quản lý cơ sở **đang dùng hằng ngày** (nút *"Mở"* ở `/admin/documents`) mà **không trả lại đường thay thế** → mọi ca kiểm tra trước giờ dạy phải **nhắn hỏi Đào tạo HO**. Nặng hơn: cờ *"THIẾU"* mà job story hứa **chưa có dữ liệu nền để tính** (`Document` không có khái niệm *"bắt buộc"*), nên cắt trước thì **cái thay thế không kịp ra**. Người chịu: quản lý cơ sở CS1/CS2 và quản lý cơ sở của **bên NHẬN nhượng quyền (FRANCHISEE)** ở tỉnh xa múi giờ HO. Kết quả thường thấy: **họ mượn tài khoản giáo viên** — vô hiệu hoá **cả** `R-D8-04` **lẫn** `R-D8-09`.
- **Độ tin:** THẤP rằng giả định đúng — **thiếu dữ liệu nền đã kiểm chứng bằng schema**; **mức phụ thuộc thực tế** vào nút "Mở" thì chưa ai đo.
- **Bằng chứng:**
  - `[QS]` `app/(admin)/admin/documents/page.tsx:325-332` — render thẳng `<a href={d.fileUrl}>` nhãn *"Mở"* (**URL R2 trần**), **không** có điều kiện theo vai trò trong ô hành động.
  - `[QS]` `app/(admin)/admin/documents/page.tsx:70` — cổng trang là `checkPermission("documents:view")` ⇒ **đi qua lõi shadow-compare** (⇒ **Cờ 1 = CÓ**); `:113` — `take: 100` (danh sách bị cắt, nên phải đo ở tầng CSDL, không đếm trên màn hình).
  - `[QS]` `lib/auth/permissions.ts:499` — `"documents:view": ["SUPER_ADMIN", "TRAINING", "CENTER_MANAGER", "TEACHER"]`.
  - `[QS]` `prisma/schema.prisma:2415-2448` — model `Document` **không có** trường *"bắt buộc"*/*"khuôn mẫu"* nào để tính *"đủ hay thiếu"*, và cũng **không có `centerId`**.
  - `[QS]` `03-job-stories.md:383` — JS-04-02 đòi cờ *"THIẾU"* **theo khuôn mẫu chương trình**, hiện **không có dữ liệu nền**.
  - `[QS]` `02-prd:266` (`R-D8-09` — tách quyền **xem danh sách** khỏi quyền **mở nội dung**) · `02-prd:265` (`R-D8-08` — bỏ URL R2 trần, đi qua proxy có vé có hạn).
- **Mã `R-*` bị chặn:** `R-D8-09` · `R-D8-08` · `R-D4-01`.
- **Cách kiểm rẻ nhất:** **Đo hành vi trước khi cắt**: bật ghi nhật ký lượt bấm *"Mở"* ở `/admin/documents` trong **2 tuần** (`R-D8-11` dù sao cũng phải làm), đếm lượt của tài khoản `CENTER_MANAGER`, mỗi lượt hỏi lại **một câu**: *"anh/chị mở để làm gì"*. **Ngưỡng: > 5 lượt/tuần/người ⇒ `R-D8-09` phải kèm màn "danh mục đủ/thiếu" TRƯỚC khi cắt.** Song song: kiểm xem `Document` có nguồn dữ liệu nào suy ra *"bắt buộc"* không — **nếu không, cờ THIẾU là việc MỚI, phải tách khỏi `R-D8-09`**, không nhét vào tiêu chí nghiệm thu của nó.
- **Câu hỏi cho Ban:** **Ai chịu trách nhiệm trả lời** quản lý cơ sở khi buổi thiếu tài liệu — Đào tạo HO có **cam kết thời gian đáp ứng** không? Và *"học liệu **bắt buộc** của một buổi"* **khai ở đâu** (hiện **không có chỗ khai**)?

---

**Ghi chú biên tập của mục 5.2 (không phải câu hỏi nghiệp vụ):** năm trích dẫn của vòng trước đã được **sửa tại chỗ** sau khi mở lại file: `02-prd:177-181 → :176-180` (GD-10) · `02-prd:84 → :83` (KR7, GD-19) · `QUYET-DINH.md:99 → :100` (QĐ-A.1, GD-19) · `lib/auth/actor.ts:115-121 → :121-127` (GD-15) · `prisma/schema.prisma:717-720 → :719-720` (GD-21) · `teaching-materials/page.tsx:329-332 → :329-334` (GD-17). Ngoài ra **một khẳng định bị hạ**: nhánh dự phòng ở trang play **không** cứu người dạy thay nói chung (GD-11) — nó chỉ khớp khi người đó đồng thời là GV/trợ giảng của lớp khác cùng chương trình. Và **hai phát hiện mới** không có trong bản giả định gốc: (1) tiêu chí `R-D3-05`/pha A5 đếm call-site **theo tên hàm** nên **đã xanh giả** vì trùng tên với `createAssignment` của bài tập về nhà (GD-13); (2) đường ghi `Employee.orgUnitId` **không có guard phạm vi nào** trong khi `centerId` thì có (GD-20).

### 5.3 Nhóm KHẢ_THI_KINH_DOANH (17 giả định)

> Sắp theo ô (THÍ_NGHIỆM → LÀM_LUÔN → HOÃN), trong mỗi ô **Impact giảm dần**, cùng Impact thì **Risk giảm dần**. Mọi `đường-dẫn:số-dòng` dưới đây **đã được mở lại và kiểm từng dòng trước khi viết**; chỗ lệch với bản giả định gốc đã ghi `[đính chính]` ngay tại dòng bằng chứng.
> **Toàn bộ mã `R-*` được nhắc trong mục này đều tồn tại thật** trong `02-prd-franchise-platform.md` (đã đối chiếu danh sách mã đầy đủ) — không mã nào phải ghi *"KHÔNG THẤY TRONG 02-prd"*.
> Quy ước hai cờ (`02-prd:364`): **Cờ 1** = đổi **giá trị trả về** của hàm quyền động trên dữ liệu đang có · **Cờ 2** = đổi **tập bản ghi** một tài khoản đọc được. Cờ chấm cho **thay đổi được đề xuất**, không chấm cho phép đo — mọi truy vấn chỉ-đọc trong mục này đều là **Cờ 1 KHÔNG · Cờ 2 KHÔNG**.
> Thuật ngữ: **FRANCHISOR = bên NHƯỢNG quyền = khối HO** · **FRANCHISEE = bên NHẬN nhượng quyền**. Không dùng cụm *"cơ sở nhượng quyền"* trần.

#### GD-32 — Bên NHẬN chấp nhận HO xem chi tiết từng dòng

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn PM | Làn B | Impact 10 | Risk 5.6 | Ô THÍ_NGHIỆM | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Bên NHẬN nhượng quyền (FRANCHISEE) — một **pháp nhân riêng** — chấp nhận, **và luật cho phép**, bên NHƯỢNG quyền (FRANCHISOR, khối HO) xem **chi tiết từng dòng** khoản thu · giảm giá · hoàn tiền · công nợ và **điểm danh từng buổi của từng học viên** của họ, chỉ vì lớp dùng chương trình của HO.
- **Nếu SAI thì sao:** `R-D10-04` (cỡ **L** — nặng nhất nhánh D10, phụ thuộc `R-D4-09`) bị bỏ **sau khi đã xây**, chỉ `R-D10-05` (chỉ số tổng hợp) sống sót. Chiều ngược lại nặng hơn: xây xong rồi mới biết là vi phạm ⇒ HO **đã hút** dữ liệu cá nhân trẻ em của một pháp nhân khác. Người chịu: HO (rủi ro pháp lý + công đã bỏ) và bên NHẬN (mất quyền riêng tư dữ liệu khách hàng của chính họ).
- **Độ tin:** TRUNG BÌNH — tài liệu chứng minh được **phạm vi dữ liệu sẽ chảy**, nhưng **thái độ của bên NHẬN** và **ranh giới pháp lý** thì không dòng mã nào trả lời được.
- **Bằng chứng:**
  - `[QS]` `02-prd:294` — `R-D10-04` liệt kê **đúng 5 nhóm** chi tiết, gồm *"điểm danh từng buổi từng học viên"*; cột cỡ = **L**; phụ thuộc ghi rõ **`R-D4-09`**.
  - `[QS]` `02-prd:115` — §6 hứa với bên NHẬN *"ranh giới dữ liệu rõ ràng"*. Chính câu hứa này là thứ `R-D10-04` đang thử.
  - `[QS]` `02-prd:461` — §9 câu 8 (*bên kiểm soát / bên xử lý thay*) là **câu gốc**, *"F2 đến F7 treo theo"*, **chưa trả lời**.
  - `[QS]` `02-prd:341` — `R-DP-01` treo theo **đúng câu đó**.
  - `[QS]` `QUYET-DINH.md:109-114` — danh sách **6 câu treo** chuyển cho BƯỚC 2 **không có** câu này ⇒ chưa ai nhận. `[đính chính: bản trước ghi :107-113 — đó là dòng tiêu đề mục, danh sách thật là :109-114]`
- **Mã `R-*` bị chặn:** `R-D10-04` · `R-D10-05` · `R-D10-10` · `R-DP-01` · `R-DP-07`.
- **Cách kiểm rẻ nhất:** Đây là **CÂU HỎI QUYẾT ĐỊNH** (pháp lý + hợp đồng), không phải thí nghiệm kỹ thuật. Phần **đo được** để đưa vào cuộc quyết: từ schema liệt kê **đúng danh sách trường dữ liệu cá nhân** sẽ chảy sang HO khi mở đủ 5 nhóm (tên học viên · tên + SĐT phụ huynh · mã đơn · mã phiếu thu · số tiền từng giao dịch · trạng thái từng buổi), đếm số trường, đưa con số cho pháp chế **và cho bên NHẬN đầu tiên** xem **trước khi ký**. **Ngưỡng: bên NHẬN đầu tiên gạch bất kỳ nhóm nào trong 5 nhóm khi đàm phán ⇒ mức chi tiết phải cấu hình theo hợp đồng, không đóng cứng 5 nhóm vào mã.**
- **Câu hỏi cho Ban:** Mức chi tiết HO được xem là **điều khoản thương lượng từng hợp đồng** hay **điều kiện cứng của mọi hợp đồng**? Nếu thương lượng được thì `R-D10-04` phải viết theo cấu hình hợp đồng, không viết cứng 5 nhóm.

#### GD-26 — Đội 4–5 dev còn công suất cho 112 yêu cầu

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn PM | Làn A+B | Impact 9 | Risk 6.4 | Ô THÍ_NGHIỆM | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Đội kỹ thuật **4–5 dev** dành được một phần công suất cho chương trình này **trong khi vẫn** chạy đợt go-live RBAC và đợt security hardening.
- **Nếu SAI thì sao:** Lộ trình không chỉ **giãn ra** mà **ĐỔI HÌNH**: các mã bắt buộc đi **cùng một lần phát hành** sẽ bị tách để chia việc — gói cổng tạo cơ sở `R-D2-16`+`R-D2-17`+`R-D2-18`, chu trình đã phải gộp `R-D3-10`, cặp `R-QDB-02`+`R-QDB-03`. Chính PRD mô tả loại hỏng đó: *người sau làm đỏ test của người trước rồi gỡ điều kiện của người kia cho xanh* — **không ai phát hiện qua đọc diff riêng lẻ**. Với đội 3 người đang quá tải ~2×, cơ chế bảo vệ còn lại (review chéo Kiệt↔Luân) cũng là **hai trong ba người đó**.
- **Độ tin:** THẤP — con số *"4–5 dev"* trong PRD **mâu thuẫn thẳng** với kế hoạch go-live đang chạy; không có văn bản nào hoà giải hai con số.
- **Bằng chứng:**
  - `[QS]` `02-prd:31` — bảng liên hệ: *"**Đội kỹ thuật (4–5 dev)** | Thực thi; đang chạy song song 3 chương trình khác + cửa sổ shadow + đợt security hardening"*.
  - `[QS]` `02-prd:387` — giả định **A7** của chính PRD: *"Đội 4–5 dev dành được một phần công suất…"*, hệ quả nếu sai chỉ ghi *"Lộ trình §8 giãn ra; **thứ tự** vẫn đúng"* — **nhẹ hơn thực tế** (xem mục "Nếu SAI").
  - `[QS]` `docs/ke-hoach-go-live-2607/README.md:12-16` — đội còn **3 người** (Kiệt · Luân · Vy); Huy và Trí **rời team 03/07**, bàn giao lại toàn bộ module.
  - `[QS]` `docs/ke-hoach-go-live-2607/README.md:62` — *"Kiệt ~39 ngày-công, Luân ~46 ngày-công / ~20 ngày còn lại → PM phải **cắt scope hoặc dời deadline**"*.
  - `[QS]` `docs/ke-hoach-go-live-2607/README.md:66` — *"🚨 tổng **~103 ngày-công cho 3 người / ~20 ngày làm việc** → quá tải ~2×… Cần TGĐ chốt"*.
  - `[QS]` `docs/ke-hoach-go-live-2607/README.md:69` — *"Không còn mentor/junior → review chéo Kiệt↔Luân cho mọi PR đụng tiền/quyền/enrollment"*.
  - `[QS]` `02-prd:399-401` — gói cổng tạo cơ sở: *"**Ba mã phải đi cùng một lần phát hành** — tách ra sẽ giao một trạng thái nửa vời"*.
  - `[QS]` `02-prd:366-367` — chu trình `R-D3-10`/`R-D8-10` **đã phải gộp** đúng vì lý do chia việc cho hai người.
- **Mã `R-*` bị chặn:** `R-D2-16` · `R-D2-17` · `R-D2-18` · `R-D3-10` · `R-QDB-02` · `R-QDB-03` · `R-D2-24`.
- **Cách kiểm rẻ nhất:** **Đo hành vi, không hỏi ý kiến.** Hai số, lấy trong 15 phút: (a) đếm PR merge vào `main` **4 tuần gần nhất tách theo tác giả**; (b) đếm **ngày-công còn nợ** của đợt go-live 26/07 chưa đóng (mục 4 của `README.md`). **Ngưỡng: công suất giao được cho chương trình này < 1 người toàn thời gian/tháng ⇒ con số "4–5 dev" ở `02-prd:31` là sai, mọi ước lượng làn A phải lập lại theo đội 3 người** — và gói ba mã ở `02-prd:399-401` phải có **một** người đứng tên, không chia.
- **Câu hỏi cho Ban:** Đội thi hành PRD này là **4–5 dev**, hay chính là **2 mid dev + 1 FE** của đợt go-live 26/07? Nếu là **cùng một đội** thì việc nào của go-live được cắt để lấy chỗ?

#### GD-28 — Dữ liệu tiền cũ nạp được đơn vị đủ chuẩn để kế toán ký bản đối soát

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn Kỹ sư | Làn B | Impact 9 | Risk 5.6 | Ô THÍ_NGHIỆM | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Gộp từ:** `d9d10-04` · `ops-10` — cùng một giả định chịu lực (chất lượng dữ liệu sau khi nạp `orgUnitId` đủ để `R-OPS-03` ký được), một bên nói dữ liệu cũ **SAI** chứ không chỉ thiếu, một bên nói phần không suy được là **nhỏ**; cùng một phép kiểm rẻ.
- **Phát biểu:** `R-D10-08` nạp được `orgUnitId` cho `Payment`/`Receipt` cũ và phần tồn đọng là **nhỏ** — tức dữ liệu cũ chỉ **THIẾU** đơn vị, **không SAI** đơn vị.
- **Nếu SAI thì sao:** Công thức gán đơn vị hiện **rơi về đơn vị của NGƯỜI THAO TÁC**, nên **đã tồn tại** bản ghi gán sai cơ sở — nạp lại bằng suy diễn **không sửa được cái đã sai, chỉ củng cố nó**. KR10 và `R-D10-08` báo *"xong"* trong khi số kỳ quá khứ vẫn lệch: kế toán tổng hợp HO ký đối soát trên nền dữ liệu sai, bên NHẬN bị tính phí trên khoản thu của cơ sở khác. Nặng hơn: `R-OPS-03` là **điều kiện BẬT** của nhánh **B5** và có luật cứng *"không có chữ ký thì không bật"* — kế toán nhìn bản đối soát đầy dòng chênh không giải thích được sẽ **không ký**, B5 đứng im vô thời hạn, kéo theo `R-D4-09` · `R-D10-04` · `R-D10-10`. **Toàn bộ căn cứ tính phí thương hiệu — lý do kinh doanh của chương trình — không bật được.**
- **Độ tin:** THẤP — cơ chế sinh ra dữ liệu sai **đã kiểm chứng bằng mã**; **độ lớn** phần sai/thiếu thì chưa ai đo (`02-prd:86` tự ghi *"chưa đo được"*).
- **Bằng chứng:**
  - `[QS]` `lib/finance/payment.ts:92-98` — suy `centerId` theo chuỗi **order → lead → ACTOR** (`:98` `centerId = params.actor.centerId`); `:62` chú thích **tự khai đúng chuỗi 3 tầng này**.
  - `[QS]` `02-prd:297` — `R-D10-07` cấm **"KHÔNG BAO GIỜ"** suy theo đơn vị của actor; cả ba nguồn thiếu → **từ chối** kèm `CENTER_UNRESOLVED`.
  - `[QS]` `prisma/schema.prisma:4941` — `Payment.centerId String?` (nullable), **không có `orgUnitId`**.
  - `[QS]` `prisma/schema.prisma:4954-4970` — `Receipt` **không có `centerId` lẫn `orgUnitId`**.
  - `[QS]` `app/(admin)/admin/orders/_actions.ts:155-156` — guard `passesScope("Order", …)` **chỉ chạy khi form CÓ `centerId`**; `:322` `centerId: data.centerId || null` ⇒ **bỏ trống là hợp lệ**. `[đính chính: bản trước ghi :154-156, dòng :154 là comment]`
  - `[QS]` `lib/reports/trung-tam.ts:113` + `:120` — `centerId` null **gom vào ô `"—"`**, không báo lỗi. `[đính chính: bản trước ghi :119]`
  - `[QS]` `lib/db-scope.ts:18` — `"Payment"` ∈ `SCOPED_MODELS` ⇒ **đổi `centerId` là đổi tập bản ghi đọc được** (Cờ 2).
  - `[QS]` `02-prd:296` (`R-D10-06`) · `:297` (`R-D10-07`) · `:298` (`R-D10-08` — nạp cho bản ghi cũ **+ xuất danh sách tồn đọng**, chạy lần hai phải idempotent).
  - `[QS]` `02-prd:323` — `R-OPS-03`: *"kế toán tổng hợp **ký xác nhận trước khi bật**. Không có chữ ký → không bật"*.
  - `[QS]` `02-prd:434` — chuỗi **B5** = `R-D10-06 → 07 → 08 → R-D4-09 → R-D10-04 → R-D10-10 (chốt chặn)`; `:444` — `R-OPS-03` là **điều kiện bật** cho B5.
  - `[QS]` `02-prd:86` — KR10: *"`Payment`/`Receipt` không suy được đơn vị | **chưa đo được**"*.
- **Mã `R-*` bị chặn:** `R-D10-06` · `R-D10-07` · `R-D10-08` · `R-OPS-03` · `R-D4-09` · `R-D10-04` · `R-D10-10`.
- **Cách kiểm rẻ nhất:** **Hai truy vấn chỉ-đọc** trên prod (bản thân phép đo là Cờ 1 KHÔNG · Cờ 2 KHÔNG): (1) `count(Payment WHERE centerId IS NULL)`; (2) `count(Payment p JOIN "Order" o ON p.orderId=o.id WHERE o.centerId IS NOT NULL AND p.centerId <> o.centerId)`. **Ngưỡng: (2) > 0 ⇒ dữ liệu SAI chứ không chỉ thiếu ⇒ `R-D10-08` đổi từ "nạp bằng suy diễn" sang "xuất danh sách cho người xác nhận từng dòng".** Kế đó chạy **công thức của `R-D10-07` ở chế độ chỉ-đọc** trên toàn bộ `Payment`/`Receipt`, đếm tỉ lệ không suy được **tách theo năm**: **> 2% tổng bản ghi, hoặc bất kỳ dòng nào thuộc kỳ kế toán đã đóng ⇒ phải có bước xử lý tồn đọng thủ công CÓ CHỦ và CÓ LỊCH trước khi hẹn ngày ký.**
  ⚠️ **Bản thân việc nạp lại `centerId`/`orgUnitId` ĐỔI tập bản ghi actor cấp cơ sở đọc được (Cờ 2 = CÓ) → phải đi chung lịch với đợt security hardening**, không chạy lén trong một PR dữ liệu.
- **Câu hỏi cho Ban:** Kế toán tổng hợp chấp nhận ký ở **mức chênh bao nhiêu phần trăm**, và **ai** xử lý danh sách tồn đọng không suy được đơn vị?

#### GD-27 — Nhóm dữ liệu cá nhân sẽ có người nhận dù không nằm làn nào

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn PM | Làn chưa rõ | Impact 9 | Risk 4.8 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 chưa rõ

- **Phát biểu:** Bảy yêu cầu về dữ liệu cá nhân khi **hai pháp nhân dùng chung một CSDL** (`R-DP-01..07`) sẽ được thi hành, **dù §8 không xếp chúng vào làn A lẫn làn B**.
- **Nếu SAI thì sao:** Lặp lại **đúng** lỗi PRD vừa phát hiện với QĐ-C — *"không có yêu cầu nào trong 4 nhóm tính năng ban đầu, tức **không ai nhận việc**"*. Khác biệt: lần này thứ không ai nhận là **nghĩa vụ pháp lý về dữ liệu trẻ em xuyên pháp nhân**. Cơ sở của bên NHẬN mở ra và chạy trọn vẹn mà **chưa có**: người phụ trách dữ liệu theo đơn vị · thời hạn lưu trữ theo đơn vị · phạm vi đồng ý hình ảnh · tiền tố tệp theo đơn vị. Bảng độ phủ **vẫn xanh** vì 7 mã đó **CÓ tồn tại** trong §7.2.
- **Độ tin:** THẤP rằng giả định đúng — khoảng trống **đã đo được trên chính văn bản**, không phải suy đoán.
- **Bằng chứng:**
  - `[QS]` `02-prd:341-347` — nhóm 8 có đủ **7 mã** `R-DP-01..07` (kèm cỡ: DP-01 S · DP-02 M · DP-03 M · DP-04 M · DP-05 M · DP-06 **L** · DP-07 M).
  - `[QS]` **ĐO LẠI trên §8** (`02-prd:409-444`): chuỗi `R-DP` xuất hiện **0 lần**; `R-OPS` chỉ xuất hiện `{01, 02, 03, 07, 08}` (`:413`, `:416`, `:444`) ⇒ **8 mã `R-OPS` {04,05,06,09,10,11,12,13} + 7 mã `R-DP` = 15 mã KHÔNG có làn, không có chủ**.
  - `[QS]` `02-prd:307` — tiền lệ: *"QĐ-C **không có một yêu cầu nào**… tức **không ai nhận việc**"*.
  - `[QS]` `02-prd:32` — vai trò *"Người phụ trách dữ liệu theo đơn vị"* là *"vai trò **mới** do PRD này đề xuất (`R-DP-02`) — **hiện chưa tồn tại**"*.
  - `[QS]` `02-prd:337` — *"**Câu F1 phải trả lời trước, mọi thứ dưới treo theo**"*; `:461` — §9 câu 8 là câu gốc, **chặn toàn bộ nhóm 8**.
- **Mã `R-*` bị chặn:** `R-DP-01` · `R-DP-02` · `R-DP-03` · `R-DP-04` · `R-DP-05` · `R-DP-06` · `R-DP-07`.
- **Cách kiểm rẻ nhất:** **Đo trên chính tài liệu, tái lập trong 1 phút:** liệt kê mọi mã `R-*` ở §7.2, trừ đi tập mã xuất hiện trong §8 (`:409-444`); phần còn lại = **mã không có làn, không có chủ**. Kết quả đo hôm nay: **15 mã** (7 `R-DP` + 8 `R-OPS`). **Ngưỡng: bất kỳ mã nào còn lại sau phép trừ mà chưa có tên chủ ⇒ không được tính vào bảng độ phủ.** Việc **gán chủ + xếp làn** là quyết định của Ban, không phải thí nghiệm.
- **Câu hỏi cho Ban:** Ứng **§9 câu 8**: **trước** khi trả lời câu *bên kiểm soát / bên xử lý thay*, Ban có chấp nhận mở cơ sở của bên NHẬN nhượng quyền không? Nếu **không**, thì `R-DP-01` phải là **chốt chặn của làn A**, không phải mã treo.

#### GD-30 — Một dải số phiếu thu theo mã cơ sở là đủ cho pháp nhân riêng

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn PM | Làn A+B | Impact 9 | Risk 4.2 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Đánh số phiếu thu **theo mã cơ sở** là đủ để chứng từ của một pháp nhân bên NHẬN đứng vững khi bị kiểm tra thuế; việc thiếu **tên pháp nhân / MST / người ký** trên bản in chỉ là **việc hiển thị** (`R-OPS-12`), không đụng bản chất chứng từ.
- **Nếu SAI thì sao:** Phiếu thu do bên NHẬN phát hành mang **pháp nhân sai** và có thể rơi vào **dải số dùng chung**; **sửa sau KHÔNG được** vì bản ghi `Receipt` **không có trường đơn vị nào để đính chính**. Người chịu: bên NHẬN (chứng từ vô hiệu, truy thu/phạt) và HO (chứng từ mang tên HO cho giao dịch không phải của HO).
- **Độ tin:** THẤP rằng giả định đúng — cả **cơ chế rơi về dải chung** lẫn **chỗ trống để đính chính** đều đã kiểm chứng bằng mã và schema.
- **Bằng chứng:**
  - `[QS]` `lib/finance/receipt.ts:26-30` — mã phiếu `RCP-{mã cơ sở}-{YY}-{SEQ}`; `:27` `const cc = sanitize(params.centerCode) || "SR"` ⇒ **mã rỗng rơi về `"SR"`**; `:29` khoá bộ đếm `receipt:${cc}:${y}` ⇒ **mọi phiếu `"SR"` DÙNG CHUNG một dải**.
  - `[QS]` `lib/finance/payment.ts:40-43` — `centerCodeOf()` trả `"SR"` khi **thiếu `centerId`** hoặc **không tra được `OrgUnit`** tương ứng.
  - `[QS]` `lib/finance/payment.ts:364` + `:384-390` — dải số **chốt theo `Payment.centerId` tại thời điểm phát hành** (`centerCode` truyền vào `issueReceipt`).
  - `[QS]` `prisma/schema.prisma:4954-4970` — `Receipt` chỉ có `code` · `enrollmentId` · `paymentId` · `issuedById` · `issuedAt` · `status` ⇒ **không có chỗ đính chính đơn vị**.
  - `[QS]` `lib/pdf/receipt.tsx:29-43` — `ReceiptPdfData` chỉ nhận `centerName`/`centerAddress`: **không MST, không tên pháp nhân, không người ký**.
  - `[QS]` `app/(admin)/admin/payments/[id]/phieu-thu/route.ts:102` — `centerName: center?.name ?? "Sata Robo"` ⇒ tra không ra cơ sở thì **in tên thương hiệu HO**.
  - `[QS]` `lib/locations.ts:60-63` — `taxCode: "0402301783"` là **hằng số trong mã nguồn**.
- **Mã `R-*` bị chặn:** `R-OPS-12` · `R-OPS-11` · `R-D2-14` · `R-D2-17` · `R-D2-18` · `R-D10-06`.
- **Cách kiểm rẻ nhất:** **Hai truy vấn chỉ-đọc:** (1) đếm `Receipt` có `code LIKE 'RCP-SR-%'`; (2) đếm **số dải số riêng biệt** đang chạy (distinct đoạn mã cơ sở trong `Receipt.code`) so với số cơ sở thật. **Ngưỡng: (1) > 0 hoặc (2) < số cơ sở ⇒ dải số ĐÃ trộn ngay khi mới có 2 cơ sở CÙNG pháp nhân** — mở cơ sở khác pháp nhân là biến lỗi hiển thị thành **lỗi thuế**.
  ⚠️ Lưu ý đọc `R-D2-18` (`02-prd:181`): tiêu chí của nó viết *"Hai cơ sở **không bao giờ sinh cùng một mã**"* — **mô tả sai kiểu hỏng**. `lib/codegen.ts:26-34` (`nextSeq` upsert `Counter`, atomic) và `:96-101` dùng **chung một cơ chế bộ đếm**, khoá bộ đếm **có kèm mã cơ sở** (`HV:${cc}:${y}`, `LOP:${cc}:${y}`, `${prefix}:${cc}:${y}` ở `:118-127`) và mọi mã đều mang **tiền tố `${cc}.`** ⇒ ở đường chạy bình thường mã **không trùng**, dãy **tách theo cơ sở**, và mã **truy nguyên được** qua tiền tố. Hỏng thật là **rủi ro có điều kiện**: hai cơ sở bị **trộn chung một dãy và mất truy nguyên** **CHỈ KHI** hai mã cơ sở khác nhau bị `sanitize()` ép về cùng một chuỗi (`lib/codegen.ts:17-19` bỏ mọi ký tự ngoài `[A-Z0-9]`, trong khi `ORG_CODE_RE` cho phép gạch dưới — `lib/org/orgunit-rules.ts:7` ⇒ `CS_1` ↔ `CS1`), **hoặc** khi mã cơ sở rỗng/không tra được và rơi về hằng `"SR"` (`lib/finance/receipt.ts:27`, `lib/finance/payment.ts:40-43`). Tiêu chí `R-D2-18` phải nói về **hai nhánh đó**, không nói về "trùng mã".
- **Câu hỏi cho Ban:** Phiếu thu **đã phát hành** vào dải số sai (`RCP-SR-…`) xử lý thế nào — **huỷ và phát hành lại**, hay **chấp nhận và chỉ sửa từ ngày triển khai**? Câu này quyết định `R-D10-08` là **việc kế toán**, không chỉ việc kỹ thuật.

#### GD-31 — Chuyển lớp/chuyển cơ sở qua ranh giới pháp nhân hoãn được

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn PM | Làn B | Impact 9 | Risk 4.2 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Gộp từ:** `d9d10-11` · `ops-09` — cùng giả định *"`R-OPS-13` chốt sau được vì ca hiếm và chức năng hiện hành vô hại"*; một bên soi **đường tiền**, một bên soi **đường đọc/duyệt**.
- **Phát biểu:** Chuyển lớp/chuyển cơ sở **vượt ranh giới pháp nhân** là ca hiếm nên chốt sau được (`R-OPS-13` để *"hoặc cấm, hoặc cho phép kèm điều kiện"*, §9 câu 7).
- **Nếu SAI thì sao:** Chức năng **ĐANG CHẠY** và **đang xử lý sai về tiền**: duyệt chuyển tạo một **ghi danh MỚI ở cơ sở đích không mang giá** và **không có bút toán chuyển tiền**; khoản đã thu **ở lại cơ sở nguồn**. Doanh thu nằm ở pháp nhân A, dịch vụ cung cấp ở pháp nhân B, cơ sở đích hiện lên như **đang có công nợ**. Mỗi ca là một dòng lệch trong **căn cứ tính phí của CẢ HAI bên**, và làm **số kỳ đã chốt đổi hồi tố** (`Student.centerId` bị ghi đè). **Ba lỗ, mới bịt một:** (1) **ĐÃ BỊT** — duyệt chuyển chéo cơ sở bị chặn ở cả bước tạo lẫn bước duyệt; (2) **CHƯA BỊT, đường ĐỌC** — `findEligibleTargetClasses` dùng `db` **trần**, cơ sở đích do **người gọi truyền**, `null` = **mọi cơ sở**, cổng chỉ là `enrollments:create` (gồm `SALES_CSM`) ⇒ nhân sự CS1 **liệt kê được lớp/mã lớp/tên cơ sở** của pháp nhân khác; (3) **CHƯA BỊT, nghiệp vụ** — mỗi lần chuyển là một lần **chuyển dữ liệu cá nhân trẻ em + công nợ giữa hai pháp nhân**, không có đồng ý của phụ huynh, không bút toán, dòng nhật ký chỉ ghi `toClassId`/`toCenterId` chứ **không nêu tên hai pháp nhân**.
- **Độ tin:** TRUNG BÌNH — cả ba lỗ **đã kiểm chứng bằng mã**; chỉ **tần suất ca chuyển chéo** là chưa đo.
- **Bằng chứng:**
  - `[QS]` `lib/transfer/service.ts:193-203` — tạo `Enrollment` mới ở lớp đích, **không** `listPrice`/`finalPrice`/`discountAmount`.
  - `[QS]` `lib/transfer/service.ts:206-215` — ghi đè `Student.centerId` (`:214`) + đóng/mở `StudentCenterHistory`; **không bút toán nào**.
  - `[QS]` `lib/transfer/service.ts:1` — `import { db } from "@/lib/db"` (**db TRẦN**); `:60-66` — `db.class.findMany` lọc `...(toCenterId ? { centerId: toCenterId } : {})` ⇒ **`null` = MỌI cơ sở, không cách ly**.
  - `[QS]` `lib/transfer/service.ts:162` — `approveTransfer` từ chối khi chưa có lớp đích (*"đang waitlist"*) ⇒ đường waitlist **không tự hoàn tất được**.
  - `[QS]` `app/(admin)/admin/chuyen-lop/_actions.ts:43-44` — cổng là `checkPermission("enrollments:create")`, comment **tự ghi** *"gồm SALES_CSM"*; `:45` gọi `findEligibleTargetClasses(..., input.toCenterId || null)`.
  - `[QS]` `app/(admin)/admin/chuyen-lop/_actions.ts:32` (`toCenterId` trong schema) · `:67` (lưu `toCenterId`) · `:101`, `:111` (audit ghi `toCenterId`) — **đường nhận `toCenterId` đã chạy**.
  - `[QS]` `app/(admin)/admin/chuyen-lop/_actions.ts:59-61` (chặn lớp nguồn + lớp đích qua `classInScope`) · `:89-90` (chặn lại ở bước duyệt) — **hàng rào ĐÃ CÓ cho đường ghi**.
  - `[QS]` `prisma/schema.prisma:4439`, `:4441` — `StudentTransferRequest.fromCenterId`/`toCenterId` ⇒ **đếm được trực tiếp, không cần JOIN lớp**.
  - `[QS]` `prisma/schema.prisma:1360`, `:1363` — `Enrollment.listPrice`/`finalPrice` là nguồn *"phải thu"* của báo cáo.
  - `[QS]` `lib/reports/trung-tam.ts:133-136` — công nợ = phải thu theo ghi danh − đã thu theo cơ sở. `[đính chính: bản trước ghi :132-135]`
  - `[QS]` `02-prd:333` — `R-OPS-13`: *"`chuyen-lop/_actions.ts:32,45,67` đã nhận `toCenterId` — tức **đã chạy được**"*; `:460` — §9 câu 7 **chưa trả lời**.
  - `[QS]` `00-baseline.md:77` — `chuyen-lop/_actions.ts` là **1 trong 4 file `(admin)`** còn vi phạm rule `app-no-direct-prisma` (severity `warn`).
  - `[QS]` Grep `relationshipType` trong `prisma/schema.prisma` = **0 hit** ⇒ **hôm nay chưa có cờ nào để chặn tạm theo `FRANCHISEE`** (`R-D2-12` chưa thi hành).
- **Mã `R-*` bị chặn:** `R-OPS-13` · `R-D10-04` · `R-D10-12` · `R-D10-07` · `R-D10-06` · `R-DP-01`.
- **Cách kiểm rẻ nhất:** **Hai phép đo.** (1) Truy vấn chỉ-đọc: đếm `StudentTransferRequest` `status='APPROVED'` trong 12 tháng có `toCenterId <> fromCenterId`, **tách theo cặp cơ sở** — **ngưỡng > 12 ca/năm khi mới có 2 cơ sở CÙNG pháp nhân ⇒ với pháp nhân khác đây là ca thường xuyên, phải chốt `R-OPS-13` TRƯỚC ngày node bên NHẬN đầu tiên chuyển sang hoạt động**. (2) Gọi `listEligibleClassesAction` bằng tài khoản `SALES_CSM@CS1` với `toCenterId = CS2` **và** với `toCenterId` rỗng, đếm số lớp CS2 trả về — **> 0 xác nhận rò đường ĐỌC ⇒ vá ngay trong làn A, không chờ câu 7** (đây là thay đổi **Cờ 2 = CÓ**, đi chung lịch hardening).
- **Câu hỏi cho Ban:** (a) Khi học viên chuyển giữa cơ sở của bên NHẬN và cơ sở nội bộ, **học phí còn dư thuộc pháp nhân nào** — hoàn ở nơi thu rồi thu lại ở nơi nhận, hay chuyển nội bộ? Không chốt thì mỗi ca là một khoản treo giữa hai sổ. (b) Ứng §9 câu 7: trong lúc chờ chốt, **có chặn tạm** chuyển lớp qua node của bên NHẬN không (hiện **chưa có trường `relationshipType` để chặn**), và **ai vá lỗ đọc** của `findEligibleTargetClasses` — làn A hay đợt hardening?

#### GD-36 — Bên NHẬN chịu dùng nguyên chương trình HO, không tự soạn

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn PM | Làn A | Impact 9 | Risk 4.2 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Kênh *"đề xuất chỉnh bài"* hiện có **đủ nhanh** để bên NHẬN nhượng quyền **không cần tự soạn chương trình riêng**, nên khoá cứng quyền sửa (`R-D8-03`) không đẩy họ ra ngoài phạm vi.
- **Nếu SAI thì sao:** Bên NHẬN bị chặn sửa mà nhu cầu bản địa hoá là thật (thiết bị khác, học sinh khác) → họ **tạo một khung chương trình mang tên mình** rồi gắn lớp vào, **hoàn toàn hợp lệ về thao tác** vì quyền soạn khung là **ma trận toàn cục, không kèm phạm vi đơn vị**. Mọi lớp rơi **ngoài phạm vi** của `R-D10-03` ⇒ **phí thương hiệu về gần 0**. Đây là **chỗ mất tiền**, và `R-D8-03` chính là thứ **tạo ra động cơ**. Người chịu: HO (doanh thu nhượng quyền).
- **Độ tin:** THẤP rằng giả định đúng — **lỗ thao tác đã kiểm chứng bằng mã**; *"kênh đề xuất đủ nhanh"* thì **chưa ai đo**, và số đo hiện có chỉ phản ánh nhu cầu **nội bộ**.
- **Bằng chứng:**
  - `[QS]` `prisma/schema.prisma:2178-2184` — model `LessonChangeRequest` **đã có** (`lessonId`, `requestedById`, `content`, `status`), enum `LessonChangeStatus` `OPEN`/`ACCEPTED`/`REJECTED` (`:2172-2176`).
  - `[QS]` `lib/auth/permissions.ts:466-467` — `"curriculum:create"` và `"curriculum:edit"` = `["SUPER_ADMIN", "TRAINING"]`, **KHÔNG kèm phạm vi đơn vị** ⇒ tài khoản Đào tạo ở node bên NHẬN **vẫn tạo được khung mới**. `[đính chính: bản trước ghi :466-468; :468 là `curriculum:delete`]`
  - `[QS]` `prisma/seed-orgunit.ts:23-27` — cây chỉ có `HO` · `CS1` · `CS2`, **chưa có node bên NHẬN nào** ⇒ số liệu đề xuất chỉnh bài **chỉ đo nhu cầu nội bộ**.
  - `[QS]` `02-prd:455` — §9 câu 2, PRD tự gọi đây là *"lỗ hổng thương mại mở bằng **đúng một thao tác nhập liệu hợp lệ**"*, đánh dấu **chỗ mất tiền**.
  - `[QS]` `02-prd:382` — giả định **A2** của PRD (*"FRANCHISEE dùng chung bộ chương trình của HO"*), hệ quả nếu sai: *"**D10 sụp đổ** — phí về gần 0"*, **chưa được trả lời**.
- **Mã `R-*` bị chặn:** `R-D8-03` · `R-D10-12` · `R-D10-03` · `R-D10-11`.
- **Cách kiểm rẻ nhất:** Đo bằng **dữ liệu đã có**: trên `LessonChangeRequest` 6 tháng gần nhất, đếm theo trạng thái và tính **trung vị thời gian** từ tạo tới `ACCEPTED`/`REJECTED`. **Ngưỡng: 0 dòng (kênh chết) HOẶC trung vị > 14 ngày ⇒ kênh đề xuất không thay thế được nhu cầu sửa ⇒ `R-D10-12` (tách phạm vi TÍNH PHÍ khỏi phạm vi XEM) thành BẮT BUỘC, không phải tuỳ chọn.** **Lưu ý khi đọc số:** đây là nhu cầu **nội bộ**; bên NHẬN ở tỉnh khác sẽ cao hơn — kênh nhanh với nội bộ **không có nghĩa là** đủ với bên NHẬN.
- **Câu hỏi cho Ban:** §9 câu 2 — **chặn ở tầng dữ liệu** (đơn vị của bên NHẬN không tạo được chương trình) **hay tách phạm vi tính phí**? Chưa chốt thì `R-D8-03` **đang tạo động cơ mà chưa có rào**.

#### GD-41 — Rò rỉ tài liệu chỉ nằm ở khu admin và khu giáo viên

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn PM | Làn A | Impact 8 | Risk 4.2 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Hai bề mặt phát tài liệu giảng dạy cần siết là **khu quản trị** và **site giáo viên**; cổng phụ huynh cho xem tài liệu buổi đã dạy là **đúng ý định** nên không tính là rò rỉ.
- **Nếu SAI thì sao:** Làm xong `R-D8-08` (cỡ **L**) và **nghiệm thu XANH**, mà tài liệu giảng dạy **vẫn phát ra ngoài công ty** qua cổng phụ huynh bằng **URL kho trần**: không vé, không hết hạn, không dấu chìm, không nhật ký — người nhận là **khách hàng**, đối tượng ngoài mạng lưới nhất. Tiêu chí nghiệm thu của `R-D8-08` **chỉ soát `app/(admin)` và `app/(teacher)`** nên **không bắt được**. Người chịu: chủ D8 (Đào tạo HO) và cả lập luận pháp lý bảo vệ bí mật kinh doanh.
- **Độ tin:** THẤP rằng giả định đúng — đường phát URL trần ở cổng phụ huynh **đã kiểm chứng từng dòng**.
- **Bằng chứng:**
  - `[QS]` `lib/portal/learning.ts:229` (`getStudentLessons`) · `:233-237` — lấy buổi có `date: { lte: new Date() }`. `[đính chính: bản trước ghi :232-236]`
  - `[QS]` `lib/portal/learning.ts:255-257` — `documents: { select: { id, title, type, fileUrl } }`, **KHÔNG lọc `isPublic`**. `[đính chính: bản trước ghi :245-256]`
  - `[QS]` `app/(portal)/portal/bai-giang/page.tsx:86` — `href={d.fileUrl}` phát **thẳng** cho phụ huynh (`target="_blank"`, `:87`). `[đính chính: bản trước ghi "kèm icon tải về" — icon là `FileText`, `:91`, mở tab mới]`
  - `[QS]` `lib/flags.ts:56-57` — `MEDIA_SIGNED_URL` **mặc định OFF** ⇒ vẫn là URL kho trần.
  - `[QS]` `prisma/schema.prisma:2431` — `Document.isPublic Boolean @default(false)` **có tồn tại** nhưng đường portal **không đọc**.
  - `[QS]` `02-prd:265` — tiêu chí `R-D8-08` chỉ grep `app/(admin)` và `app/(teacher)`; `02-prd:421` — pha **A9** nghiệm thu bằng *"dán URL R2 vào trình duyệt ẩn danh → 403"*.
  - `[QS]` `QUYET-DINH.md:113` — câu treo số 5: *"`Document.isPublic` nghĩa là ai được xem? Truy vấn portal đang bỏ qua cờ này"*.
- **Mã `R-*` bị chặn:** `R-D8-08` · `R-D8-11` · `R-D8-09`.
- **Cách kiểm rẻ nhất:** **Một câu SQL chỉ-đọc** chạy đúng điều kiện của `getStudentLessons`: đếm `Document` có `isPublic=false` đang lộ cho **ít nhất một phụ huynh** (đính vào `Lesson` của buổi có `date ≤ hôm nay` trong lớp có học viên). **Ngưỡng: > 0 ⇒ mở rộng phạm vi nghiệm thu `R-D8-08` sang `app/(portal)` NGAY trong cùng đợt**, đừng để rơi sang *"đợt hardening"*. **Chi phí thêm: 0** — cùng một lần sửa route proxy. (Việc siết này **đổi tập bản ghi phụ huynh đọc được** ⇒ Cờ 2 = CÓ.)
- **Câu hỏi cho Ban:** Tài liệu buổi học **có được phép cho phụ huynh tải về không**? Nếu có thì **đó là tập nào** — hiện `isPublic` không được đường portal đọc, nên *"nội bộ HO"* và *"công khai cho phụ huynh"* **đang đi chung một đường**.

#### GD-40 — Bốn bảng không có trường cơ sở sẽ có nơi khác nhận

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn PM | Làn A+B | Impact 8 | Risk 4.0 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Bốn bảng đang rò **số điện thoại/email phụ huynh** giữa hai cơ sở (nhật ký Zalo · xung đột chuyển đổi · yêu cầu phụ huynh · nhật ký email) sẽ được **đợt security hardening hoặc một nhóm khác** xử lý, nên nhóm 8 (`R-DP-01..07`) **không cần phủ chúng**.
- **Nếu SAI thì sao:** Ngày node của bên NHẬN chuyển sang hoạt động, bốn đường rò này thành **rò dữ liệu cá nhân XUYÊN PHÁP NHÂN** — **đúng** rủi ro pháp lý mà cả chương trình sinh ra để chặn. Bảng độ phủ **vẫn xanh** vì nhóm 8 có đủ 7 mã, còn bốn bảng này **không có mã nào** nên không xuất hiện trong bảng. Nặng nhất là **L3 (`ParentRequest`)**: hiển thị **vô điều kiện** cho mọi tài khoản admin qua bảng việc chờ + chuông thông báo, và `SALES_CSM` rơi vào phạm vi *"mọi cơ sở"*.
- **Độ tin:** THẤP rằng giả định đúng — BƯỚC 0 đã xác nhận bốn ca rò **kèm file:dòng**, còn *"ai nhận việc"* thì **không văn bản nào ghi**.
- **Bằng chứng:**
  - `[QS]` `00-scope-gap.md:77-80` — **L1 `ZaloMessageLog`** (`schema:4715-4728`, truy vấn `tich-hop/page.tsx:35` **không có `where`**, render `toPhone` thô `:100`) · **L2 `ConvertConflict`** (`convert-conflicts/page.tsx:21` `where` chỉ `{status:'OPEN'}`) · **L3 `ParentRequest`** (`lib/pending-tasks.ts:171-176` **db TRẦN**, `centerScope` `:105` chỉ đặt cho `CENTER_MANAGER`) · **L4 `EmailLog`** (`email-logs/page.tsx:63`).
  - `[QS]` `00-scope-gap.md:129` — *"mọi role cấp cơ sở **không phải** `CENTER_MANAGER` (SALES_CSM, ACCOUNTANT, HR, MARKETING, TRAINING) đều rơi về `null = mọi cơ sở`"*.
  - `[QS]` `03-job-stories.md:914` — câu **b10**: *"**Không mã `R-*` nào trong PRD nhắc tên bốn bảng này**… tiêu chí không có mã yêu cầu thì không vào được bảng độ phủ"* — **đã hỏi, chưa có trả lời**.
  - `[QS]` `02-prd:373` — PRD chỉ chuyển cho đợt hardening **2 việc**: bug reaper `DomainEvent` + vá R2 public URL/`upload-delete` — **KHÔNG gồm bốn bảng này**.
  - `[QS]` `02-prd:341-347` — nhóm 8 chỉ phủ học viên/tệp/kết xuất, **không nhắc bốn bảng**.
- **Mã `R-*` bị chặn:** `R-DP-01` · `R-DP-07` · `R-D4-11` · `R-QDC-03`.
- **Cách kiểm rẻ nhất:** **Rẻ nhất, không cần prod:** đăng nhập bằng `CENTER_MANAGER@CS1` trên môi trường test có dữ liệu hai cơ sở, mở `/admin/tich-hop` · `/admin/convert-conflicts` · `/admin/email-logs` · `/admin/dashboard` (bảng việc chờ), **đếm số bản ghi thuộc CS2 hiện ra**. **Ngưỡng: > 0 ở bất kỳ trang nào ⇒ phải mở mã `R-*` cho bốn bảng và xếp vào làn A**, không để trôi sang *"đợt hardening"* mà **chưa ai xác nhận nhận việc**. (Bản vá là thay đổi **Cờ 2 = CÓ**.)
- **Câu hỏi cho Ban:** Ban **có mở mã yêu cầu** cho bốn bảng không có trường cơ sở không, và giao cho **làn A của PRD này** hay cho **đợt security hardening**? (b10 của BƯỚC 3 đã hỏi, chưa có câu trả lời.)

#### GD-39 — Vai trò phụ trách dữ liệu theo đơn vị lắp được lên module hiện có

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn Thiết kế | Làn B | Impact 8 | Risk 3.6 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Việc phân quyền **xoá/ẩn danh/kết xuất** và **danh sách rà soát lưu trữ theo từng đơn vị** lắp được lên module tuân thủ hiện có, **và** sẽ có **người thật** vận hành vai trò mới này ở phía bên NHẬN nhượng quyền.
- **Nếu SAI thì sao:** Yêu cầu của phụ huynh (xoá dữ liệu, xin bản sao) ở cơ sở của bên NHẬN **không ai xử lý được trong hạn luật**: đường duy nhất hiện nay **khoá cứng ở `SUPER_ADMIN`** ⇒ **bên NHƯỢNG quyền phải tự tay đụng dữ liệu của pháp nhân khác** — đúng thứ mà ranh giới đang cố dựng. Đồng thời trang rà soát lưu trữ **trộn học viên hai pháp nhân trong cùng một danh sách** và dùng **MỘT thời hạn duy nhất** khai bằng biến môi trường.
- **Độ tin:** TRUNG BÌNH — **giới hạn kỹ thuật đã kiểm chứng từng dòng**; phần *"sẽ có người thật vận hành"* thì chưa có tiền lệ nào để đo.
- **Bằng chứng:**
  - `[QS]` `lib/compliance/retention.ts:11` — `RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? 365*5)`: **một biến env duy nhất, toàn hệ thống**.
  - `[QS]` `lib/compliance/retention.ts:2` — `import { db }` (**db trần, không qua `scopedDb`**); `:25-34` — `findStudentsDueForRetention` `findMany` **không có điều kiện cơ sở/đơn vị**, `take: 500`. `[đính chính: bản trước ghi :24-34]`
  - `[QS]` `app/(admin)/admin/compliance/page.tsx:14` — `if (!isSuperAdmin(...)) redirect(...)`; `:16` — gọi `findStudentsDueForRetention()` **không truyền phạm vi**.
  - `[QS]` `app/(admin)/admin/compliance/actions.ts:17-18` — *"Chỉ SUPER_ADMIN được xoá dữ liệu cá nhân"*; `:24` `applyStudentErasure` · `:37` `exportStudentData`.
  - `[QS]` `app/api/cron/retention-scan/route.ts:9-13` — cron **hàng tuần** chạy `runRetentionScan()` **toàn hệ thống**, chỉ kiểm bí mật cron (`verifyCronAuth`), **không có actor**.
  - `[QS]` `lib/compliance/erasure.ts:45` — *"SUPER_ADMIN gọi (gate ở action)"*; `lib/compliance/portability.ts:7` — *"Gate quyền ở action (SUPER_ADMIN, hoặc PH của chính HV)"*.
  - `[QS]` `02-prd:342` — `R-DP-02` (cỡ **M**): *"Hiện: **chỉ `SUPER_ADMIN` của HO làm được**"*; `:343` — `R-DP-03` (cỡ **M**): *"Hiện là **một biến môi trường duy nhất** toàn hệ thống"*.
- **Mã `R-*` bị chặn:** `R-DP-02` · `R-DP-03` · `R-DP-07` · `R-D4-11`.
- **Cách kiểm rẻ nhất:** **Hai phép đo hành vi.** (1) Gọi `findStudentsDueForRetention()` hôm nay, đếm **tỉ lệ dòng thuộc cơ sở khác** cơ sở của người sẽ rà — thiết kế mới đòi **0%**, đo được ngay và tái lập được. (2) Đếm **số yêu cầu xoá/kết xuất của phụ huynh đã xử lý qua hệ thống trong 12 tháng** (`AuditLog` action ERASURE/EXPORT). **Ngưỡng: (2) = 0 ⇒ vai trò mới KHÔNG có tiền lệ vận hành nào ⇒ `R-DP-02` là xây QUY TRÌNH chứ không phải xây màn hình**, và ước lượng cỡ **M** đang thiếu phần đào tạo + nghiệm thu với người thật.
- **Câu hỏi cho Ban:** **Ai** là người phụ trách dữ liệu ở phía bên NHẬN, **do bên nào bổ nhiệm**, và HO **có quyền phủ quyết** một lệnh xoá của họ không?

#### GD-37 — Điều động qua ranh giới pháp nhân là hợp lệ

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn PM | Làn A+B | Impact 8 | Risk 3.5 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** **Cùng một cơ chế điều động** dùng được cho cả nội bộ (HO sang CS1) **lẫn** sang cơ sở của bên NHẬN nhượng quyền.
- **Nếu SAI thì sao:** Cử người của pháp nhân A sang làm việc cho pháp nhân B là **quan hệ lao động/thuế/BHXH khác hẳn**, trong khi service **chỉ kiểm đơn vị còn hoạt động** và điều kiện của `R-D3-09` (*"đơn vị của lớp hoặc tổ tiên của nó"*) **hoàn toàn không có khái niệm pháp nhân**. Màn hình sẽ cho lập điều động **thẳng** sang cơ sở của bên NHẬN: nhân sự Hội sở thành người dạy tại pháp nhân khác **mà không chứng từ lao động nào ghi nhận**, đồng thời **mang theo tầm nhìn dữ liệu** vào cơ sở đó — phá đúng ranh giới D9/D10 đang dựng. Job story **tự khai chưa phủ ca này** nên **không ai chặn ở khâu nghiệm thu**.
- **Độ tin:** THẤP rằng giả định đúng — chỗ hở trong luật gác **đã kiểm chứng bằng mã**; phần *"có được phép hay không"* là câu hỏi pháp lý **chưa ai trả lời**.
- **Bằng chứng:**
  - `[QS]` `lib/org/assignment-service.ts:59-62` — `createAssignment` chỉ kiểm `org` tồn tại + `!deletedAt` + `isActive` (`ORG_INVALID`); **không kiểm pháp nhân, không kiểm quan hệ với đơn vị nguồn**.
  - `[QS]` `lib/org/assignment-service.ts:64-72` — ràng buộc duy nhất còn lại là *"mỗi nhân viên chỉ có 1 phân công `PRIMARY` đang hiệu lực"*.
  - `[QS]` `02-prd:224` — `R-D3-09` phát biểu điều kiện đúng bằng cụm *"có phân công còn hiệu lực tới **U hoặc tổ tiên của U**"* — **không có khái niệm pháp nhân**.
  - `[QS]` `02-prd:220` — `R-D3-05`: *"Call-site `createAssignment` trong `app/` ≥ 1 (**hiện 0**)"* ⇒ màn hình **chưa có**, tức **còn kịp đặt điều kiện trước khi mở**.
  - `[QS]` `03-job-stories.md:238` — *"cả ba story chỉ phủ điều động **nội bộ HO → CS1 cùng pháp nhân**, chưa chạm việc cử người sang cơ sở nhượng quyền (phụ thuộc Câu 3 và Câu 7, cần story riêng)"* — *[nguyên văn nguồn; đọc là **cơ sở của bên NHẬN nhượng quyền (FRANCHISEE)**. Đừng sao chép cụm trần này ra khỏi ngoặc kép.]*
  - `[QS]` `QUYET-DINH.md:112` — câu treo số 4 (*thời gian chuyển tiếp / "dữ liệu của chính mình"*) — một trong hai câu mà `03-job-stories.md:238` treo theo.
- **Mã `R-*` bị chặn:** `R-D3-05` · `R-D3-09` · `R-D3-10` · `R-D9-04`.
- **Cách kiểm rẻ nhất:** Trước hết là **câu hỏi quyết định**, không phải thí nghiệm. Phần **đo được**: trên staging, dựng node của bên NHẬN rồi lập một đợt điều động **từ HO sang node đó**. **Ngưỡng mong muốn: bị từ chối kèm mã lỗi. Dự đoán hiện tại: lưu thành công** (vì `assignment-service.ts:59-62` chỉ kiểm đơn vị còn hoạt động) ⇒ `R-D3-05` phải thêm điều kiện pháp nhân **vào cùng lần phát hành với màn hình**, không vá sau.
- **Câu hỏi cho Ban:** Nhân sự biên chế Hội sở **có được điều động sang cơ sở của bên NHẬN nhượng quyền (pháp nhân khác) không**? Nếu có, **căn cứ** là hợp đồng nhượng quyền hay một **phụ lục lao động riêng**, và **ai ký**?

#### GD-38 — Một tỉ lệ phí là đủ mô tả nghĩa vụ tài chính hợp đồng

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn PM | Làn A+B | Impact 8 | Risk 3.5 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Nghĩa vụ tài chính của hợp đồng nhượng quyền biểu diễn được bằng **một trường `feeRate` duy nhất** trên hợp đồng.
- **Nếu SAI thì sao:** Bảng căn cứ tính phí ra **một con số không ai lập hoá đơn được**. `R-D9-01` phải **sửa mô hình dữ liệu SAU khi đã có dữ liệu thật**; `R-D9-09` và `R-D10-12` viết lại. Người chịu: đội kỹ thuật (làm lại) + kế toán tổng hợp HO (**vẫn phải tính tay ngoài hệ**).
- **Độ tin:** THẤP rằng giả định đúng — chính §9 câu 13 **đã liệt kê** các điều khoản mà một trường vô hướng không chứa nổi; và **bảng hợp đồng chưa tồn tại** nên sửa hình dạng bây giờ **còn rẻ**.
- **Bằng chứng:**
  - `[QS]` `02-prd:278` — `R-D9-01` liệt kê trường: `franchisorOrgId`, `franchiseeOrgId`, `signedAt`, `expiresAt`, **`feeRate`**, `status`, `terminatedAt`, `terminatedReason` — **đúng một trường tiền**.
  - `[QS]` `02-prd:466` — §9 câu 13 **tự liệt kê**: *"Hợp đồng thật luôn có: **lãnh thổ, số cơ sở tối đa, thời hạn báo trước, nghĩa vụ báo cáo, doanh thu tối thiểu**"*.
  - `[QS]` `02-prd:287` — `R-D9-09`: `feeRate` *"**chỉ là căn cứ tính phí, không sinh chứng từ**"*; nghiệm thu = đếm `Order`/`Payment`/`Receipt` trước và sau khi mở + xuất → **không đổi** ⇒ mô hình mặc định phí là **hàm một biến**. `[đính chính: bản trước diễn giải nghiệm thu thành "sửa tỉ lệ phí chỉ đổi con số phí" — câu chữ thật là "không sinh chứng từ"]`
  - `[QS]` Grep `FranchiseContract` trong `prisma/schema.prisma` = **0 hit** ⇒ **bảng chưa tồn tại**, đổi hình dạng bây giờ **không tốn migration dữ liệu**.
  - `[QS]` `02-prd:418` — `R-D9-01` nằm ở pha **A6** (làn A) ⇒ **làm sớm**, nên phải chốt hình dạng **trước** pha đó.
- **Mã `R-*` bị chặn:** `R-D9-01` · `R-D9-09` · `R-D9-12` · `R-D10-12`.
- **Cách kiểm rẻ nhất:** Đọc **1 bản hợp đồng nhượng quyền dự thảo / term sheet** Ban đang dùng, **đếm số điều khoản TIỀN riêng biệt** (phí ban đầu · % doanh thu · quỹ marketing · mức sàn tháng · bậc thang · phí đào tạo lại · phạt chậm). **Ngưỡng: > 1 khoản ⇒ `feeRate` vô hướng SAI mô hình, phải chốt hình dạng TRƯỚC khi tạo bảng hợp đồng ở pha A6.**
- **Câu hỏi cho Ban:** Hợp đồng có **mức phí SÀN theo tháng** hoặc **bậc thang theo doanh thu** không? Nếu có, khi doanh thu thực **dưới sàn** thì hệ thống hiển thị con số nào là *"phí phải trả"*?

#### GD-35 — Toàn bộ chương trình hiện có đều thuộc HO

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn PM | Làn A | Impact 8 | Risk 1.5 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** **100%** bản ghi `Curriculum` đang có là do Đào tạo HO soạn, **VÀ** điều đó **còn đúng vào lúc pha B đặt `ownerOrgUnitId NOT NULL`** — nên nạp về OrgUnit `HO` là **ghi lại sự thật**, không phải một phép gán cho tiện.
- **Nếu SAI thì sao:** Vế *"hôm nay"* hỏng thì ít; vế *"lúc pha B"* hỏng thì nặng: khung do **một cơ sở / bên NHẬN tự soạn** bị **đóng dấu HO vĩnh viễn** ⇒ (1) chính chủ **mất quyền sửa** sau `R-D8-03`, phải xin HO; (2) `R-D10-03` kết luận lớp đó *"trong phạm vi"* ⇒ HO **tính phí thương hiệu trên lớp không dùng chương trình của mình** ⇒ tranh chấp hợp đồng. Vì `Curriculum` **không có trường tác giả**, sau khi đóng dấu thì **không có cách nào tra ngược ai là chủ thật**. Người chịu: Đào tạo cơ sở và kế toán HO.
- **Độ tin:** CAO cho vế *"hôm nay"* (ma trận quyền chặn mọi vai trò cấp cơ sở soạn khung), THẤP cho vế *"còn đúng lúc pha B"* — không có cơ chế nào giữ cho nó đúng.
- **Bằng chứng:**
  - `[QS]` `prisma/schema.prisma:2082-2105` — `Curriculum` **không có** trường tác giả/nguồn gốc/đơn vị ⇒ không dữ liệu nội bộ nào xác nhận hay bác bỏ phép gán, **cũng không tra ngược được sau khi gán**.
  - `[QS]` `lib/auth/permissions.ts:466-467` — `curriculum:create`/`curriculum:edit` = `["SUPER_ADMIN","TRAINING"]` ⇒ **hiện không vai trò cấp cơ sở nào soạn được khung** → nạp về HO **hôm nay** nhiều khả năng đúng.
  - `[QS]` `prisma/seed-orgunit.ts:23-27` — cây chỉ có `HO`/`CS1`/`CS2`, **chưa có node của bên NHẬN nào**.
  - `[QS]` `02-prd:258` — `R-D8-01` nghiệm thu *"`count(ownerOrgUnitId IS NULL)` = **0**, mọi bản ghi trỏ OrgUnit `code='HO'`"*; **pha B đặt `NOT NULL`**.
  - `[QS]` `01-intended-vs-implemented.md:124` — *"**THUỘC HO không diễn đạt được** — `Curriculum`/`Course` **0 trường sở hữu**"*.
- **Mã `R-*` bị chặn:** `R-D8-01` · `R-D8-03` · `R-D10-03` · `R-D10-11`.
- **Cách kiểm rẻ nhất:** Rẻ và đủ: **(a)** chạy chính truy vấn nghiệm thu của `R-D8-01` trên bản sao dữ liệu thật (`count(ownerOrgUnitId IS NULL) = 0`); **(b)** thay cho trường tác giả đã mất, liệt kê mỗi `Curriculum` kèm **tập `centerId` của các lớp đang dùng** — khung nào chỉ có lớp của **đúng một** cơ sở thì đưa danh sách (dự kiến vài dòng) cho Đào tạo xác nhận. **Ngưỡng: ≥ 1 khung bị Đào tạo phủ nhận ⇒ nạp dữ liệu phải kèm bảng ngoại lệ.** **Chốt chặn cho pha B: KHÔNG đặt `NOT NULL` trước khi có đường nhập `ownerOrgUnitId` cho khung MỚI** — nếu không, mọi khung sinh sau **đều mặc định mang tên HO**.
- **Câu hỏi cho Ban:** Có khung chương trình nào **hiện do cơ sở tự soạn** không? Và khi bên NHẬN nhượng quyền đầu tiên soạn khung riêng thì **ai đặt `ownerOrgUnitId`** — người tạo tự chọn, hay suy từ đơn vị của họ?

#### GD-33 — Thời gian chuyển tiếp chỉ-đọc là phương án hai bên chấp nhận

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn PM | Làn B | Impact 7 | Risk 3.0 | Ô LÀM_LUÔN | Cờ 1 chưa rõ | Cờ 2 CÓ

- **Phát biểu:** Sau khi cắt hợp đồng, để bên NHẬN **tiếp tục ĐỌC** dữ liệu trên hệ thống của HO trong một thời gian chuyển tiếp là **hợp pháp và hai bên chấp nhận** — nên `R-D9-06` (vai trò chỉ-đọc có hạn) là thiết kế đúng.
- **Nếu SAI thì sao:** Nếu cắt **vì vi phạm** thì HO cần **chặn NGAY**; nếu pháp lý coi hai bên là **hai bên kiểm soát dữ liệu riêng** thì bên đã chấm dứt còn truy cập dữ liệu cá nhân trẻ em trên hệ thống HO là **sai** — phương án đúng là *"cắt sạch + giao gói bàn giao"* (`R-D9-11`) chứ không phải *"chỉ đọc có hạn"*. `R-D9-06`, `R-D9-10` và nhánh nghiệm thu **JS-06-03** phải **viết lại**. Người chịu: HO (rủi ro pháp lý) và đội kỹ thuật (đã xây `FRANCHISEE_READONLY` + tác vụ hạ quyền theo hạn).
- **Độ tin:** TRUNG BÌNH — **hai câu chặn đều đang treo có văn bản**; phần *"hợp pháp hay không"* thuộc pháp chế, không đo được trong repo.
- **Bằng chứng:**
  - `[QS]` `02-prd:284` — `R-D9-06`: `RoleDef` mã `FRANCHISEE_READONLY` (chỉ action `*:view`, scope `CENTER`), `revokeByContract` cấp kèm `effectiveTo` = ngày cắt + thời gian chuyển tiếp **cấu hình được**; chính dòng này gắn cảnh báo *"xem §9 câu 3"*.
  - `[QS]` `02-prd:456` — §9 câu 3: **độ dài** và **phạm vi "dữ liệu học viên của chính mình"** **chưa chốt**.
  - `[QS]` `02-prd:461` — §9 câu 8 (vai trò theo pháp luật bảo vệ dữ liệu) là **câu gốc**, chưa trả lời.
  - `[QS]` `QUYET-DINH.md:112` — câu treo số 4, **cùng nội dung, vẫn treo**.
  - `[QS]` `03-job-stories.md:562` — JS-06-03 tiêu chí 2 **vừa phải sửa** vì viết nhầm chiều nhượng quyền ở **đúng tiêu chí này** (`[đã sửa 28/07]`) ⇒ vùng này **dễ đảo chiều**, cần câu chữ khoá cứng.
- **Mã `R-*` bị chặn:** `R-D9-06` · `R-D9-10` · `R-D9-11` · `R-DP-01` · `R-DP-03`.
- **Cách kiểm rẻ nhất:** Đây là **CÂU HỎI QUYẾT ĐỊNH** (pháp lý + hợp đồng). Phần **đo được** đưa vào cuộc quyết: trên dữ liệu thật **một** cơ sở, đếm bản ghi **"còn dang dở"** tại thời điểm cắt — học viên đang học · `Payment` `PENDING` chờ xác nhận · `OrderInstallment` chưa đến hạn · `RefundRequest` chưa duyệt. Con số đó cho biết **thời gian chuyển tiếp bằng 0 có khả thi không**. **Ngưỡng: còn > 0 khoản thu chờ xác nhận ⇒ phải chốt cách xử lý TRƯỚC**, vì `R-D9-06` **không nói bản ghi chờ duyệt đi về đâu**.
- **Câu hỏi cho Ban:** Có **phân biệt cắt vì HẾT HẠN** (cho chuyển tiếp) với **cắt vì VI PHẠM** (chặn ngay) không? `R-D9-01` chỉ có **một trạng thái `TERMINATED`** cho cả hai (`02-prd:278`), nên hiện **không có chỗ nào ghi được sự khác nhau này**.

#### GD-34 — Mã không nằm trong pha nào vẫn làm được song song

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn PM | Làn chưa rõ | Impact 6 | Risk 3.5 | Ô LÀM_LUÔN | Cờ 1 CÓ | Cờ 2 KHÔNG

- **Phát biểu:** Sáu mã nền của D4 (`R-D4-01, 02, 03, 04, 05, 10`) — và nói chung **mọi mã không xuất hiện trong §8** — làm được **song song** mà không cần chỗ trong lịch làn A/làn B, và **không ảnh hưởng mốc mở làn B**.
- **Nếu SAI thì sao:** Sáu mã này **không có trong pha nào**, trong khi `R-D4-03` và `R-D4-05` **đều đánh dấu ĐỤNG SHADOW** và **cả hai phải sửa dữ liệu `RolePermission`**. Kịch bản seed vai trò **XOÁ SẠCH rồi tạo lại** `RolePermission` cho từng vai trò — mỗi lần chạm là **một lần đổi mapping quyền**, và theo quy tắc đã ghi thì **phải TRUNCATE lại đồng hồ shadow**. Đội *"tranh thủ làm trong lúc chờ"* = **reset đồng hồ** = **đẩy lùi mốc mở làn B**, mà **B1** (QĐ-B), **B5** (D10 + `R-D4-09`) và **B6** (che trường) đều treo sau mốc đó. Lỗ này **không riêng D4**: hơn 20 mã khác cũng không nằm trong pha nào ⇒ vá lẻ 6 mã sẽ **tái diễn ở nhóm khác**.
- **Độ tin:** THẤP rằng giả định đúng — cả **khoảng trống lịch** lẫn **cơ chế reset đồng hồ** đều đã kiểm chứng bằng văn bản và mã.
- **Bằng chứng:**
  - `[QS]` `02-prd:413-421` (làn A, pha A1–A9) và `:430-436` (làn B, B1–B7) — **không pha nào** nhắc `R-D4-01/02/03/04/05/10`; §8 chỉ có `R-D4-09` (B5), `R-D4-06/07/08/11/13` (B6), `R-D4-12` (B7).
  - `[QS]` `02-prd:230` — `R-D4-03` (seed `OWN` cho action `RECORD_OWNER`), cột cờ shadow = **✓**; `:232` — `R-D4-05` (tách/bỏ `CLASS` vs `ASSIGNED`, *"migration đổi dữ liệu"*), cờ shadow = **✓**.
  - `[QS]` `prisma/seed-roles.ts:554-559` — `db.rolePermission.deleteMany({ where: { roleId } })` rồi `createMany` lại toàn bộ ⇒ **mỗi lần chạy là một lần đổi mapping**.
  - `[QS]` `00-baseline.md:111` — *"chạy lại `prisma/seed-roles.ts` = xoá sạch + tạo lại `RolePermission` = **đổi mapping** = **phải TRUNCATE lại đồng hồ shadow**"*.
  - `[QS]` `02-prd:465` — §9 câu 12 (*cửa sổ shadow đóng theo tiêu chí nào*) chặn **toàn bộ làn B** — nên mọi lần reset đồng hồ đều đẩy lùi B1/B5/B6.
- **Mã `R-*` bị chặn:** `R-D4-01` · `R-D4-03` · `R-D4-05` · `R-D4-10` · `R-QDB-05`.
- **Cách kiểm rẻ nhất:** **Hai phép đếm trên văn bản.** (1) Đối chiếu **112 mã** ở §7.2 với tập mã xuất hiện trong §8 → danh sách **mã KHÔNG có pha** (hiện **> 20 mã**, gồm cả 6 mã D4 này). (2) Đọc bảng đồng hồ: **thời điểm dòng lệch shadow sớm nhất còn lại** so với **lần chạy `seed-roles` gần nhất** theo log triển khai. **Ngưỡng: mọi mã có cờ shadow ✓ mà chưa có pha thì KHÔNG được khởi công; mã chạm `prisma/seed-roles.ts` phải ghi rõ "không chạm trong cửa sổ đo" trong điều kiện ra của pha.**
  📣 **Nhắc lịch (không phải câu hỏi):** `R-D4-10` (`02-prd:237`) **không nằm trong bất kỳ pha nào** của §8 — khoảng hở này **không có ngày kết thúc**, phải gán chủ cùng lúc với 5 mã còn lại.
- **Câu hỏi cho Ban:** Sáu mã `R-D4-01/02/03/04/05/10` (và **> 20 mã khác chưa có pha**) nằm ở **pha nào**, và **có được phép chạm `seed-roles.ts` trong lúc cửa sổ shadow còn mở** không?

#### GD-29 — Cơ sở bên NHẬN hiện trên site thương hiệu như cơ sở nội bộ

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn PM | Làn chưa rõ | Impact 6 | Risk 3.5 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Đưa danh sách cơ sở của trang công khai **về cơ sở dữ liệu** (`R-D2-22`/`R-D2-23`) là **đủ** để cơ sở của bên NHẬN nhượng quyền ở tỉnh khác **xuất hiện đúng** trên `satarobo.vn`.
- **Nếu SAI thì sao:** Dữ liệu công khai đang phát ra **MỘT pháp nhân và MỘT địa phương** cho mọi cơ sở: schema `Organization` lấy **tên công ty + MST từ một hằng số duy nhất**; dữ liệu có cấu trúc **gắn cứng "Đà Nẵng"** kể cả ở chỗ **đã nhận center động từ DB**; tin tuyển dụng **ghi cứng** tên pháp nhân HO và địa chỉ 211 Nguyễn Hữu Thọ. Một cơ sở Hà Nội **của pháp nhân khác** sẽ được công bố ra công cụ tìm kiếm là **thuộc Đà Nẵng và thuộc công ty HO** — **sai chủ thể pháp lý**, sai dữ liệu quảng cáo, và đặt HO vào thế **chịu trách nhiệm cho hoạt động của bên NHẬN**. Bảng `Center` cũng **chưa có** các trường trang công khai đang dùng ⇒ *"đọc từ DB"* **chưa đủ dữ liệu**.
- **Độ tin:** THẤP rằng giả định đúng — cả ba chỗ ghi cứng **đã kiểm chứng từng dòng**.
- **Bằng chứng:**
  - `[QS]` `lib/locations.ts:6` — `code: "CS1" | "CS2"` là **union type đóng** ⇒ cơ sở thứ 3 **không biểu diễn được** nếu không sửa mã.
  - `[QS]` `lib/locations.ts:60-63` — `SATA_ROBO_CONTACT.companyName` + `taxCode: "0402301783"`: **một pháp nhân duy nhất, hằng số trong mã**.
  - `[QS]` `lib/seo/jsonld.ts:27-28` — schema `Organization` lấy `name`/`alternateName` từ hằng số đó; `:32` — `taxID: SATA_ROBO_CONTACT.taxCode`.
  - `[QS]` `lib/seo/jsonld.ts:53-57` — mảng `address` sinh từ `SATA_ROBO_LOCATIONS` nhưng `:57` **`addressRegion: 'Đà Nẵng'` ghi cứng cho MỌI cơ sở**.
  - `[QS]` `lib/seo/jsonld.ts:104` (`localBusinessJsonLd(center)` — **đã nhận center động**) nhưng `:113` **`addressLocality: 'Đà Nẵng'` vẫn ghi cứng**.
  - `[QS]` `lib/seo/jsonld.ts:255` — `hiringOrganization.name` ghi cứng *"Công ty Cổ phần Công nghệ Giáo dục Sata Robo"*; `:263` — `jobLocation.streetAddress: '211 Nguyễn Hữu Thọ'`, `:264-265` Hải Châu / Đà Nẵng. `[đính chính: bản trước ghi :256 — đó là dòng `sameAs`]`
  - `[QS]` `prisma/schema.prisma:235-260` — `Center` có `address`/`district`/`city`/`phone`/`email`/`googleMapUrl`/`workingHours` nhưng **KHÔNG có** Zalo riêng, SĐT dạng thuần số, cờ **trụ sở chính** (`isHQ`) — ba trường trang công khai đang dùng.
  - `[QS]` `02-prd:185` — `R-D2-22` (cỡ **L**): *"Thêm cơ sở thứ 3 qua quản trị → trang liên hệ hiện đủ 3, **không sửa dòng code nào**"*; `:186` — `R-D2-23` (không hồi quy SEO).
  - `[QS]` `03-job-stories.md:284` — tiêu chí âm tính: *"Bật cờ hạch toán cho cơ sở mà **chưa nhập đủ mã số thuế và tài khoản ngân hàng** thì bị từ chối lưu"* (`R-D2-13`, `R-D2-14`) ⇒ hồ sơ pháp nhân theo đơn vị **là tiền đề** của việc bỏ hằng số.
- **Mã `R-*` bị chặn:** `R-D2-14` · `R-D2-15` · `R-D2-22` · `R-D2-23` · `R-OPS-11` · `R-OPS-12`.
- **Cách kiểm rẻ nhất:** Trên môi trường test: **thêm một cơ sở giả định ở Hà Nội thuộc pháp nhân khác**, mở trang liên hệ và **trích toàn bộ dữ liệu có cấu trúc** của trang. Đếm **số chỗ ghi sai địa phương** và **số chỗ ghi tên pháp nhân của HO** cho cơ sở đó — **kỳ vọng 0**. Song song: đối chiếu danh sách trường mà trang công khai đang dùng với cột hiện có của bảng `Center`, **liệt kê phần thiếu** (Zalo riêng · SĐT thuần số · cờ trụ sở chính) và **cộng vào ước lượng `R-D2-22`**.
- **Câu hỏi cho Ban:** Cơ sở của bên NHẬN nhượng quyền **có được liệt kê trên `satarobo.vn` không**, và nếu có thì **hiện tên pháp nhân nào** — của HO hay của họ? **Ai chịu trách nhiệm nội dung quảng cáo** cho cơ sở đó?

#### GD-42 — Tỉ lệ phân bổ chỉ là số tham khảo nội bộ

Nhóm rủi ro KHẢ_THI_KINH_DOANH | Góc nhìn PM | Làn A | Impact 6 | Risk 1.8 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** `allocationPercent` **chỉ để tham khảo** nên cho phép **tổng vượt 100%** với một **cảnh báo mềm** là chấp nhận được.
- **Nếu SAI thì sao:** Khi cơ sở là **pháp nhân khác**, con số này chính là **căn cứ chia chi phí lương giữa bên NHƯỢNG và bên NHẬN**, và một cảnh báo không chặn là **mời sai số vào sổ**: tổng phân bổ 130% **lưu bình thường** ⇒ chi phí lương chia sai giữa hai pháp nhân, phát hiện ở **kỳ quyết toán** và phải **truy hồi nhiều tháng**; đồng thời con số dùng đối chiếu phí thương hiệu (`R-D9-09`) **mất độ tin**. Người chịu: kế toán tổng hợp và bên NHẬN.
- **Độ tin:** TRUNG BÌNH — **hành vi "cảnh báo, không chặn" đã kiểm chứng bằng mã**; phần *"có dùng để chia tiền không"* là câu Ban phải trả lời.
- **Bằng chứng:**
  - `[QS]` `prisma/schema.prisma:455` — `allocationPercent Int?` kèm chú thích **`// 0..100 — phân bổ chi phí/lương`** ⇒ **schema tự khai là con số tiền**, không phải số tham khảo.
  - `[QS]` `lib/org/assignment-service.ts:30-36` — `validateAllocation` chỉ kiểm **từng bản ghi** ∈ `[0,100]`; **không kiểm tổng**.
  - `[QS]` `lib/org/assignment-service.ts:93-98` — sau khi **ĐÃ tạo** bản ghi (`:74-85`) mới cộng tổng và **chỉ trả `warning`** khi `> 100`, kèm chú thích *"(không chặn — OI-10)"*.
  - `[QS]` `03-job-stories.md:186` — tiêu chí biên: điều động chồng lấn *"**vẫn lưu được** nhưng hiện cảnh báo tổng phân bổ vượt 100%… để người phụ trách **tự quyết**"* (`R-D3-05`).
  - `[QS]` `03-job-stories.md:238` — ghi chú kiểm chứng: JS-02A tiêu chí 8 **đã nhầm** `allocationPercent` (*"số phân bổ chi phí/lương theo chú thích schema"*) thành thước đo trùng lịch dạy ⇒ **ngay trong đội cũng đang hiểu hai nghĩa**.
- **Mã `R-*` bị chặn:** `R-D3-05` · `R-D3-01` · `R-D9-09`.
- **Cách kiểm rẻ nhất:** **Truy vấn chỉ-đọc:** đếm nhân viên có **tổng `allocationPercent` của các phân công còn hiệu lực khác 100**, tách **ba nhóm**: `> 100` · `< 100` · **để trống**. **Ngưỡng: nếu Ban trả lời "dùng để chia tiền" thì cả ba nhóm phải = 0 trước khi mở cơ sở của bên NHẬN đầu tiên, và cảnh báo mềm ở `assignment-service.ts:98` phải đổi thành CHẶN CỨNG** (sửa 1 validator — rẻ nhất nhóm này).
- **Câu hỏi cho Ban:** Tỉ lệ phân bổ **có dùng để chia chi phí lương** giữa bên NHƯỢNG và bên NHẬN không? Nếu có, **tổng khác 100% phải bị từ chối** thay vì chỉ cảnh báo.

---

**Ghi chú biên tập của mục 5.3 (không phải câu hỏi nghiệp vụ):** toàn bộ mã `R-*` trong mục này **đã grep lại** trong `02-prd-franchise-platform.md` và **đều tồn tại** — không mã nào phải ghi *"KHÔNG THẤY TRONG 02-prd"*. **Bảy trích dẫn của vòng trước đã được sửa tại chỗ** sau khi mở lại file: `trung-tam.ts:119 → :113 + :120` (GD-28) · `orders/_actions.ts:154-156 → :155-156` (GD-28) · `trung-tam.ts:132-135 → :133-136` (GD-31) · `jsonld.ts:256 → :255 + :263` (GD-29) · `permissions.ts:466-468 → :466-467` (GD-36) · `learning.ts:232-236 → :233-237` và `:245-256 → :255-257` (GD-41) · `QUYET-DINH.md:107-113 → :109-114` (GD-32). **Hai khẳng định bị sửa nội dung:** (1) nghiệm thu `R-D9-09` (`02-prd:287`) **không** nói *"sửa tỉ lệ phí chỉ đổi con số phí"* mà nói *"`feeRate` không sinh chứng từ"* (GD-38); (2) nút tài liệu ở cổng phụ huynh **không có icon tải về** — là `FileText` + `target="_blank"` (GD-41). **Ba phát hiện thêm trong lúc kiểm:** (a) grep `relationshipType` trong `schema.prisma` = **0 hit** ⇒ hôm nay **chưa có cờ nào** để chặn tạm chuyển lớp theo `FRANCHISEE` (GD-31); (b) grep `FranchiseContract` = **0 hit** ⇒ đổi hình dạng bảng hợp đồng bây giờ **không tốn migration dữ liệu** (GD-38); (c) `Center` (`schema.prisma:235-260`) **thiếu 3 trường** mà trang công khai đang dùng (Zalo riêng · SĐT thuần số · cờ trụ sở chính) ⇒ khối lượng này **chưa nằm trong ước lượng `R-D2-22`** (GD-29).
**Về `R-D2-18` (`02-prd:181`):** tiêu chí nghiệm thu đang **mô tả sai kiểu hỏng** — `lib/codegen.ts:26-34` (`nextSeq` upsert `Counter`, atomic) và `:96-101` dùng **chung một cơ chế bộ đếm** nhưng khoá bộ đếm **kèm mã cơ sở** và mã mang **tiền tố `${cc}.`**, nên ở đường chạy bình thường mã **không trùng**, dãy **tách theo cơ sở** và mã **truy nguyên được**. Hỏng thật là **có điều kiện**: trộn chung dãy + mất truy nguyên **chỉ xảy ra khi** `sanitize()` ép hai mã cơ sở khác nhau về cùng một chuỗi (`CS_1` ↔ `CS1` — `lib/codegen.ts:17-19` vs `lib/org/orgunit-rules.ts:7`) hoặc khi mã rơi về hằng `"SR"` (`lib/finance/receipt.ts:27`, `lib/finance/payment.ts:40-43`). Xem chi tiết ở GD-30 và GD-70 (`§5.4`) — đây là phát biểu về **rủi ro có điều kiện**, không phải mô tả hiện trạng mặc định.

### 5.4 Nhóm KHẢ_THI_KỸ_THUẬT (42 giả định)

> Sắp theo ô (THÍ_NGHIỆM → LÀM_LUÔN → HOÃN), trong mỗi ô **Impact giảm dần**, cùng Impact thì **Risk giảm dần**. Công thức: `Risk = (1 − Confidence/10) × Effort`, miền [0; 9].
> Mọi `đường-dẫn:số-dòng` dưới đây **đã được mở lại và đọc từng dòng trước khi viết**; chỗ lệch với bản giả định gốc ghi `[đính chính]` ngay tại dòng bằng chứng. **Toàn bộ mã `R-*` trong mục này đã grep lại trong `02-prd-franchise-platform.md` và đều tồn tại** — không mã nào phải ghi *"KHÔNG THẤY TRONG 02-prd"*.
> Hai cờ (`02-prd:364`): **Cờ 1** = đổi **giá trị trả về** của hàm quyền động trên dữ liệu đang có · **Cờ 2** = đổi **tập bản ghi** một tài khoản đọc được. Cờ chấm cho **thay đổi được đề xuất**; truy vấn chỉ-đọc luôn là **Cờ 1 KHÔNG · Cờ 2 KHÔNG**.
> Thuật ngữ: **FRANCHISOR = bên NHƯỢNG quyền = khối HO** · **FRANCHISEE = bên NHẬN nhượng quyền** (`QUYET-DINH.md:6`). Không dùng cụm *"cơ sở nhượng quyền"* trần.

#### GD-43 — Cắt nguồn vai trò là cắt được quyền GHI ở mọi đường

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn B | Impact 9 | Risk 6.4 | Ô THÍ_NGHIỆM | Cờ 1 CÓ | Cờ 2 CÓ

- **Phát biểu:** Thu hồi `UserOrgRole` theo nguồn (`R-D3-02`/`07`/`08`/`12`) làm mất quyền **THỰC HIỆN** ở **mọi** đường ghi, nên nhánh biên chế/kiêm nhiệm **không cần** điều khoản như `R-D9-05b` (gỡ vai trò v1 + tăng `tokenVersion`).
- **Nếu SAI thì sao:** Nghiệm thu *"nguồn mất thì quyền mất"* xanh ở nhóm hành động **có kiểm phạm vi** (hoàn tất buổi, điểm danh) nhưng đỏ ở nhóm **không kiểm**: 125 điểm gác bằng vai trò thô + cổng SCORM. Người chịu: HR và quản lý cơ sở **tưởng đã cắt xong**. Trạng thái nửa vời khó phát hiện nhất: **tầm nhìn dữ liệu mất, một phần quyền ghi vẫn còn**. Với FRANCHISEE đã bị cắt hợp đồng: vẫn ghi được điểm danh, thu tiền, phát hành phiếu thu mang mã cơ sở đó **cho tới khi phiên tự hết** ⇒ chứng từ phát sinh sau ngày chấm dứt nằm trong sổ của ai là **tranh chấp pháp lý**.
- **Độ tin:** THẤP rằng giả định đúng — **phản chứng đã kiểm chứng bằng mã**: cờ v2 OFF nên quyết định trả về **v1**, mà v1 đọc `role/roles` trên phiên, **không đọc `UserOrgRole`**.
- **Bằng chứng:**
  - `[QS]` `lib/auth/permission-eval.ts:23-27` — v1 = `canMatrix(sessionUser, action)`; v2 = `canV2(actor, …)`; **cả hai đều được tính**, chọn ở nơi khác.
  - `[QS]` `lib/auth/shadow-compare.ts:20` + `:27` — `flagOn ?? isRbacV2Enabled()`; `return flagOn ? params.v2 : params.v1` ⇒ **cờ OFF → trả v1**. `[đính chính: nhánh chọn v1 nằm ở shadow-compare, KHÔNG ở permission-eval]`
  - `[QS]` `lib/flags.ts:8` — `RBAC_V2_ENABLED === "true"`, mặc định **OFF**.
  - `[QS]` `lib/auth/permissions.ts:629-664` — `can()` v1 đọc `role`/`roles[]`/`grants` trên đối tượng phiên; **không có tham chiếu `UserOrgRole`**.
  - `[QS]` `app/(admin)/admin/classes/[id]/session/_actions.ts:21-27` — mẫu đường ghi **CÓ** kiểm phạm vi (`scopedDb` + `passesScope("Class", …)`).
  - `[QS]` `lib/scorm/access.ts:30-41` — `isAssignedTeacher` chỉ so `userId` với `actualTeacherId`/`teacherId`/`assistantId`; **không kiểm cơ sở, không kiểm vai trò**.
  - `[QS]` `docs/taicautruc/00-baseline.md:103` — *"125 call-site gác bằng vai trò thô… không qua bất kỳ hệ `can()` nào"*.
  - `[QS]` `lib/db-scope.ts:246-256` — `passesScope` là **hàm gọi tay**, không phải hàng rào tự động cho đường ghi.
  - `[QS]` `lib/auth/live-session.ts:16-25` — cổng kiểm phiên sống (`isActive`/`tokenVersion`); grep toàn repo: **đúng 3 nơi gọi**, đều là route **ĐỌC/xuất**: `app/api/admin/leads/export/route.ts` · `app/api/admin/crm/commission-export/route.ts` · `app/api/admin/cham-cong/shift-export/route.ts`.
  - `[QS]` `app/(admin)/admin/layout.tsx:49-62` — đối chiếu `tokenVersion` ở tầng layout (chạy khi render RSC, **không chặn Server Action**).
  - `[QS]` `prisma/schema.prisma:355-370` — `UserOrgRole` **không có trường nối tới nguồn phát sinh** (`derivedFrom*` chưa tồn tại).
  - `[QS]` `02-prd:283` (`R-D9-05b`) · `02-prd:431` (chuỗi B2: bật nơi gọi `R-D3-02` → `07` → `08` → `12` → `03`).
- **Mã `R-*` bị chặn:** `R-D3-02` · `R-D3-07` · `R-D3-08` · `R-D3-12` · `R-D9-05` · `R-D9-05b` · `R-D9-06` · `R-D4-12` · `R-D3-01`.
- **Cách kiểm rẻ nhất:** Trên bản sao dữ liệu thật: 1 tài khoản cấp cơ sở **đăng nhập sẵn, giữ nguyên phiên** → chạy thao tác cắt (hạ `UserOrgRole` + gỡ vai trò v1 + tăng `tokenVersion` trong **1 giao dịch**) → gọi **10 lệnh GHI** tiêu biểu (điểm danh, ghi nhận khoản thu, xác nhận thanh toán, tạo học viên, sửa lớp, hoàn tất buổi, mở gói SCORM lớp cũ, 1 action gác vai trò thô nhóm tiền…). **Ngưỡng: số lệnh ghi thành công phải = 0.** Dự đoán hiện tại: các đường có `passesScope` từ chối, đường SCORM + vai trò thô **vẫn qua** ⇒ phải thêm **cổng chặn ghi cấp đơn vị**, không dựa vào hạ vai trò.
- **Gộp từ:** `d3-01` · `d9d10-05` (cùng một giả định chịu lực, chỉ khác cớ cắt: nghỉ việc/hết đợt vs. chấm dứt hợp đồng; cùng phản chứng, cùng phép kiểm).
- **Câu hỏi cho Ban:** Nhánh biên chế/kiêm nhiệm có áp **cùng cơ chế** của `R-D9-05b` (gỡ vai trò v1 + tăng `tokenVersion` trong cùng transaction) không, hay làn B2 **chấp nhận** khoảng *"cắt được tầm nhìn, chưa cắt hết quyền ghi"*? (nối §9 câu 12)

#### GD-44 — Cửa sổ shadow đóng được trước khi làn B khởi động

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn B | Impact 9 | Risk 6.4 | Ô THÍ_NGHIỆM | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Cửa sổ shadow-compare RBAC **sẽ đóng trong khoảng lập kế hoạch được**, nên xếp toàn bộ `R-QDB-01..05` vào làn B (chờ shadow đóng) là thứ tự **thi hành được**.
- **Nếu SAI thì sao:** Làn B (7 nhánh B1–B7) **không có ngày khởi động**. Nặng hơn: thứ tự thành **vòng tròn** — §8 xếp `R-QDB-*` vào làn B (chỉ chạy **sau** khi cửa sổ đóng), QĐ-B cấm bật `RBAC_V2_ENABLED` cho tới khi `R-QDB-01/02/03` **xong**. Làm đúng cả hai là **bất khả**. Thêm một tầng: đồng hồ đo trên prod **gần như không có lưu lượng** (3 tài khoản nhân viên, 0 học viên) nên kể cả *"đủ ngày sạch"* cũng không chứng minh được gì về 8 vai trò sẽ bị flip.
- **Độ tin:** THẤP rằng giả định đúng — **vòng khoá đã kiểm chứng bằng hai văn bản đối nghịch**; phần *"bao giờ đóng"* thì không văn bản nào trả lời.
- **Bằng chứng:**
  - `[QS]` `02-prd:389` — A9: *"Cửa sổ shadow-compare sẽ đóng trong khoảng lập kế hoạch được"*, cột chặn ghi **"Toàn bộ làn B"**.
  - `[QS]` `02-prd:425` — tiêu đề *"Làn B — chỉ khởi động **sau khi** cửa sổ shadow-compare đóng"* · `:430` — B1 = `R-QDB-01 → 02 (+03 +10 CÙNG lần phát hành) → 04 → 06 → 05 (chặn cứng)`.
  - `[QS]` `QUYET-DINH.md:58` — ⛔ **CHẶN CỨNG: KHÔNG được bật `RBAC_V2_ENABLED`** cho tới khi (1)+(2)+(3) xong · `:59` — *"chặn lịch flip của đợt go-live RBAC đang chạy. Cần báo lại chủ đợt đó."*
  - `[QS]` `02-prd:465` — §9 câu 12 (*"Cửa sổ shadow-compare đóng theo tiêu chí nào"*), chặn **toàn bộ làn B**.
  - `[QS]` `docs/ke-hoach-go-live-2607/shadow-log.md:22-23` — Trạng thái **🔴 CHƯA CHẠY**; **Ngày sạch liên tiếp = 0** · `:16` — *"Bảng trống vì không ai dùng prod ≠ đã kiểm chứng"* · `:74-76` — *"prod chưa có bất kỳ `UserOrgRole` nào, chỉ 3 tài khoản nhân viên active… đồng hồ sẽ **xanh giả**: 5 ngày sạch chỉ chứng minh được 3 role, trong khi flip #09 tác động **8 role**"* · `:171` — kế hoạch cũ: flip trước UAT 20/07.
  - `[QS]` `00-baseline.md:99` — cờ mặc định OFF, prod enforce v1 · `:109` — nhật ký xanh 10/07 rồi **18 ngày không dòng mới**, *"file tự mâu thuẫn… đừng dựa vào header"*.
- **Mã `R-*` bị chặn:** `R-QDB-01` · `R-QDB-02` · `R-QDB-03` · `R-QDB-04` · `R-QDB-05` · `R-D4-09` · `R-D10-04` · `R-D10-10`.
- **Cách kiểm rẻ nhất:** Truy vấn **chỉ-đọc** trên `RbacShadowDiff`: đếm dòng CẦN XỬ LÝ theo từng ngày trong 14 ngày gần nhất; đọc giá trị env `RBAC_V2_ENABLED` thật trên Vercel; đếm số phiên đăng nhập/ngày trên prod cùng kỳ. **Ngưỡng: (a) không có chuỗi ≥5 ngày liên tiếp CẦN XỬ LÝ = 0, HOẶC (b) số tài khoản thật có thao tác trong kỳ đo < 8 (= số vai trò bị flip) ⇒ giả định SAI**, làn B chưa có mốc và *"ngày sạch"* không phải bằng chứng.
- **Câu hỏi cho Ban:** Ứng §9 câu 12: cửa sổ đóng theo **tiêu chí nào** (đủ số ngày hay số lệch dưới ngưỡng), và **đo trên lưu lượng nào** khi prod gần như không có người dùng? Ai **gỡ vòng khoá** giữa §8 (`R-QDB-*` thuộc làn B) và QĐ-B (`R-QDB-*` phải xong TRƯỚC khi bật cờ)? — theo `QUYET-DINH.md:59` đây là việc **BÁO LẠI** chủ đợt go-live RBAC, không phải xin ý kiến.

#### GD-76 — Đồng hồ shadow xanh nghĩa là bật cờ v2 an toàn

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn PM | Làn B | Impact 9 | Risk 6.4 | Ô THÍ_NGHIỆM | Cờ 1 CÓ | Cờ 2 KHÔNG

- **Phát biểu:** Khi bảng chênh lệch shadow = 0 trong N ngày thì bật `RBAC_V2_ENABLED` **không đổi hành vi của ai** — tiền đề để toàn bộ làn B khởi động.
- **Nếu SAI thì sao:** Đồng hồ chỉ chứng minh cho **bề mặt đi qua `checkPermission`**. Ba vùng **không bao giờ sinh dòng**: 125 điểm gác vai trò thô, SCORM (enforce v2 thẳng kể cả cờ OFF), lớp MENU (cố ý tắt ghi diff). Mà `R-D4-12` (chuyển 115–125 điểm vai trò thô) xếp **SAU CÙNG ở B7** — tức bề mặt lớn nhất mới là chỗ đổi hành vi thật, và lúc đó **cờ đã ON nên không còn lưới so sánh nào**.
- **Độ tin:** THẤP rằng giả định đúng — **ba vùng mù đã kiểm chứng bằng mã và bằng `00-baseline`**.
- **Bằng chứng:**
  - `[QS]` `00-baseline.md:103` — 125 call-site vai trò thô, *"vô hình với shadow **và** không đổi gì khi flip"* · `:104` — *"**SCORM** enforce v2 **thẳng** ngay cả khi cờ OFF… Chưa từng đi qua cửa sổ shadow"*.
  - `[QS]` `lib/scorm/access.ts:45-47` — `canManageTraining` gọi `getEffectivePermissions(actor)` = **v2 thuần**, không qua `evaluatePermission`, không đọc cờ.
  - `[QS]` `lib/auth/menu-permissions.ts:14-16` — *"Menu KHÔNG ghi shadow-diff… ghi shadow ở đây sẽ bơm ~120 dòng mỗi lần mở trang, dìm chết tín hiệu thật"*.
  - `[QS]` `lib/auth/check-permission.ts:31-35` — chỉ ghi diff khi đi qua chính hàm này (và là `void` fire-and-forget).
  - `[QS]` `02-prd:436` — B7 = `R-D4-12` *"SAU CÙNG, vì chạm nhiều nhất"* · `:83` — KR7 (đường thoát scope 4 → 2).
- **Mã `R-*` bị chặn:** `R-QDB-05` · `R-D4-12` · `R-QDB-06`.
- **Cách kiểm rẻ nhất:** Trước **mỗi** đợt `R-D4-12`: bọc điểm vai trò thô bằng `checkPermission` ở chế độ **CHỈ GHI LỆCH, không đổi kết quả trả về** (khuôn `evaluatePermission` + `onEvaluated` đã có sẵn ở `lib/auth/check-permission.ts:31-35`), chạy **3–5 ngày** trên prod. **Ngưỡng: 0 dòng lệch mới được chuyển thật**; có lệch thì đã có **danh sách đích danh người sẽ mất quyền TRƯỚC khi họ mất**. Làm tương tự cho SCORM trước `R-QDB-06`.
- **Câu hỏi cho Ban:** Ứng §9 câu 12: tiêu chí đóng cửa sổ **có tính đến** việc 125 điểm vai trò thô + SCORM + lớp menu **không sinh dữ liệu** cho đồng hồ không?

#### GD-62 — Đồng hồ shadow đang chạy và số 0 của nó là số thật

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn PM | Làn B | Impact 9 | Risk 5.6 | Ô THÍ_NGHIỆM | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Bảng chênh lệch shadow **đang được cập nhật liên tục từ lưu lượng thật**, nên *"0 dòng lệch trong N ngày"* là **bằng chứng dương** về sự an toàn, không phải bằng chứng vắng mặt.
- **Nếu SAI thì sao:** *"0 lệch"* và *"không có ai/không có gì ghi vào bảng"* cho ra **CÙNG một con số**. Nếu đồng hồ thực ra đang **đứng**, toàn bộ điều kiện mở làn B (B1→B7, trong đó có QĐ-B và chặn cứng `R-QDB-05`) được mở bằng một chỉ số **không ai xác nhận đang cập nhật** — cái giá không phải sai lịch mà là **bật cờ trên một hệ chưa từng được so**.
- **Độ tin:** TRUNG BÌNH — cơ chế ghi *fire-and-forget* và workflow TRUNCATE đã kiểm chứng bằng mã; phần *"hiện đồng hồ có chạy không"* phải đo trên prod mới biết.
- **Bằng chứng:**
  - `[QS]` `00-baseline.md:109` — nhật ký xanh 10/07, **18 ngày không dòng mới**, dù cron chạy hằng ngày (`.github/workflows/shadow-report.yml:31-32` — `cron: "0 1 * * *"`); *"File tự mâu thuẫn… **Đừng dựa vào header**"* · `:150` — bảng đối chiếu ghi đúng mâu thuẫn đó.
  - `[QS]` `lib/auth/check-permission.ts:33` và `:70` — `void recordPermissionShadow({…})` ⇒ **fire-and-forget**, lỗi ghi **im lặng**.
  - `[QS]` `.github/workflows/truncate-shadow-diff.yml:1-6` — workflow *"bấm đồng hồ"* TRUNCATE `RbacShadowDiff` trên prod.
  - `[QS]` `02-prd:465` — §9 câu 12 chưa trả lời.
- **Mã `R-*` bị chặn:** `R-QDB-05` · `R-QDB-04` · `R-D4-12` · `R-OPS-02`.
- **Cách kiểm rẻ nhất:** Một truy vấn read-only + một mốc log: `SELECT max("createdAt"), count(*) FROM "RbacShadowDiff"` so với thời điểm chạy workflow TRUNCATE gần nhất. **Ngưỡng: bảng rỗng VÀ không có dòng nào kể từ lần truncate ⇒ đây là "KHÔNG ĐO", không phải "SẠCH"** → phải cấy một **dòng lệch cố ý (canary: 1 action test có v1≠v2)** và xác nhận nó xuất hiện, **TRƯỚC** khi lấy đồng hồ làm điều kiện mở làn B.
- **Câu hỏi cho Ban:** Ai **xác nhận đồng hồ đang thực sự ghi** (có canary không), và **lần TRUNCATE gần nhất** là khi nào?

#### GD-46 — Hai trục `centerId` và `orgUnitId` song song là trạng thái ổn định

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 9 | Risk 5.6 | Ô THÍ_NGHIỆM | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Giữ song song `centerId` và `orgUnitId` trên **26 model** — chỉ yêu cầu bản ghi **MỚI** nhất quán ở cả hai trục, không hợp nhất — là trạng thái **ổn định đủ lâu** để chương trình chạy xong mà **không cần định nghĩa PR-D**.
- **Nếu SAI thì sao:** Hai nguồn sự thật **phân kỳ âm thầm**: `scopedDb` lọc theo trục `centerId`, còn phạm vi nhượng quyền/phí/nội dung suy theo trục `orgUnitId`. Một bản ghi hợp lệ trên trục này lại **vô hình trên trục kia** — loại lỗi **không màn hình nào báo**, chỉ lộ khi kế toán FRANCHISOR đối soát **thiếu tiền**. Toàn bộ chiến lược 2 pha (`02-prd:352-353`) đứng trên câu *"trục nào là bảng chủ"*, mà câu đó **chưa ai trả lời**.
- **Độ tin:** TRUNG BÌNH — số model và khoảng trống PR-D đã kiểm chứng; **mức phân kỳ thực tế** trên dữ liệu prod thì chưa ai đo.
- **Bằng chứng:**
  - `[QS]` đếm lại độc lập trên `prisma/schema.prisma`: **173 model · 44 có `centerId` · 30 có `orgUnitId` · 26 có CẢ HAI** — khớp `02-prd:354`.
  - `[QS]` comment *"PR-A: OrgUnit.id (song song centerId, scopedDb flip ở PR-D)"* lặp **26 lần**, ví dụ `schema.prisma:485` · `:664` (`Room`) · `:696` (`Holiday`) · `:718` (`User`) · `:965`. `[đính chính: bản trước ghi "27 lần" — grep trả đúng 26]`
  - `[QS]` `02-prd:354` — *"comment 'flip ở PR-D' nhưng **không tài liệu nào định nghĩa PR-D**. PRD này **không** giải quyết việc hợp nhất"* · `:468` — §9 câu 15 chặn `R-D4-13` **và toàn bộ chiến lược migration** · `:352-353` — mẫu 2 pha.
  - `[QS]` `QUYET-DINH.md:111` — câu treo số 3, cùng nội dung, **chưa trả lời** · `03-job-stories.md:874` (a4) — *"BƯỚC 4 sẽ không xác định được bảng nào là bảng chủ khi hai bên lệch nhau"*.
  - `[QS]` `lib/db-scope.ts:246-256` — `passesScope` so **`record.centerId`**, không đọc `orgUnitId` ⇒ hai trục **không** có ràng buộc chéo nào ở tầng mã.
- **Mã `R-*` bị chặn:** `R-D10-06` · `R-D10-07` · `R-D10-08` · `R-D2-16` · `R-D2-19` · `R-D2-20` · `R-D4-13`.
- **Cách kiểm rẻ nhất:** Script **chỉ-đọc** trên 26 model mang cả hai trục: đếm bản ghi có `orgUnitId` trỏ tới `OrgUnit` mà `OrgUnit.centerId` ≠ `centerId` của chính bản ghi; cộng đếm bản ghi NULL một bên. **Ngưỡng: > 0 dòng lệch = hai trục ĐÃ phân kỳ ⇒ phải chốt bảng chủ (§9 câu 15) TRƯỚC khi mở cơ sở của bên NHẬN đầu tiên.**
- **Câu hỏi cho Ban:** Ứng §9 câu 15: **trục nào là bảng chủ** khi hai trục lệch nhau, và **PR-D gồm những gì**?

#### GD-45 — Bộ bằng chứng nghiệm thu cách ly hiện có chứng minh được ranh giới giữa hai pháp nhân

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 8 | Risk 6.4 | Ô THÍ_NGHIỆM | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Kịch bản đầu-cuối `R-D2-24` (tạo vùng → tạo cơ sở của bên NHẬN → gán quản lý → người đó tạo được lớp/học viên **và không thấy dữ liệu cơ sở khác**) **đủ** để tuyên bố ranh giới dữ liệu giữa hai pháp nhân **đã dựng xong**.
- **Nếu SAI thì sao:** Tiêu chí chỉ đo **đường ĐỌC**, mà tầng cách ly **chỉ tự động lọc 7 method đọc** — mọi `update/delete` phải tự kiểm phạm vi bằng tay, mọi `create` phải tự đặt `centerId`. Yêu cầu ép cách ly **đường GHI** (`R-D4-11`) lại nằm ở **chuỗi B6, sau cửa sổ shadow**. Nên `R-D2-24` có thể được nghiệm thu **XANH** trong khi tài khoản của bên NHẬN vẫn **sửa/xoá được** bản ghi cơ sở khác nếu biết id, và vẫn **tạo được** bản ghi thiếu `centerId`. Điều kiện ra của làn A3 (*"test cách ly vẫn xanh"*) chỉ chứng minh phần đã phủ.
- **Độ tin:** THẤP rằng giả định đúng — **giới hạn "chỉ scope READ" do chính mã tự khai**, và độ phủ vai trò/đường ghi của bộ test đã đếm được.
- **Bằng chứng:**
  - `[QS]` `lib/db-scope.ts:1-5` — *"CỔNG AN TOÀN DỮ LIỆU… ⚠️ GIỚI HẠN: Prisma client extension chỉ chạy cho query TOP-LEVEL"*.
  - `[QS]` `lib/db-scope.ts:303-331` — `$extends` chỉ bọc **7 method ĐỌC**: `findMany`(:306) `findFirst`(:309) `count`(:312) `aggregate`(:315) `groupBy`(:318) `findUnique`(:321) `findFirstOrThrow`(:326). **Không có** `create/update/delete`.
  - `[QS]` `02-prd:187` (`R-D2-24`, tiêu chí đầu-cuối) · `:238` (`R-D4-11` — ép cách ly **đường GHI**, cỡ **L**) · `:435` (B6 = `R-D4-06 → 07 → 08 → **11** → 13`, **sau** cửa sổ shadow) · `:415` (A3 điều kiện ra: *"test cách ly vẫn xanh"*).
  - `[QS]` `02-prd:371` — PRD **tự khai**: *"Test cách ly CI hiện chỉ dựng **4/9 mã vai trò**; spec cách ly **đường GHI** (235 dòng, đã viết xong) **không có job CI nào chạy**; spec qua trình duyệt thật **không có `expect()` nào**"* · `:84` (KR8: 4/9 → đích 9/9).
  - `[QS]` `.github/workflows/ci.yml` — **đúng 5 job e2e**: `e2e`(:110) `e2e-a0`(:191) `e2e-r7`(:262) `e2e-fl`(:328) `e2e-teacher`(:392).
  - `[QS]` `playwright.config.ts:20` — `testIgnore` chứa `**/crm/**` ⇒ job `e2e` **không** thu spec CRM · `package.json:38` có `test:e2e:crm` nhưng grep `test:e2e:crm` trong `.github/workflows/` = **0** · `playwright.crm.config.ts:14` `testDir: "./tests/e2e/crm"` · `tests/e2e/crm/import-registered-isolation.spec.ts` = **235 dòng**, không job nào chạy.
  - `[QS]` `tests/manual/i3-isolation.spec.ts` và `tests/manual/i3-admin-isolation.spec.ts` — **đúng 1 `expect()` mỗi file**, và nó nằm trong hàm `login` (`i3-isolation:24`, `i3-admin-isolation:20`); phần dò rò rỉ chỉ `console.log` (`i3-admin-isolation:51-53`). `[đính chính: bản trước dẫn i3-isolation:39-49 theo 01-intended; số expect thật là 1/file, ở hàm login]`
  - `[QS]` `tests/e2e/a0/scoped-db.spec.ts:50-90` — call-site `makeUser` dựng **3 mã vai trò**: `CENTER_MANAGER`(:50,56,62,67,72) `HO_ACCOUNTANT`(:78) `SUPER_ADMIN`(:84).
  - `[SD → đính chính]` con số **"4/9"** của `01-intended:204` đúng cho **spec CÁCH LY**, nhưng **không** đúng nếu đọc là *"CI chưa từng dựng vai trò nào khác"*: spec **quyền** trong CI có dựng thêm `CENTER_ACCOUNTANT` (`tests/e2e/a0/can-integration.spec.ts:71`), `HO_MARKETING` + `CENTER_SALES_CSM` (`tests/e2e/a0/rbac.spec.ts:110-111`). Độ phủ **cách ly** vẫn là chỗ hở, nhưng phải phát biểu đúng phạm vi.
- **Mã `R-*` bị chặn:** `R-D2-24` · `R-D4-11` · `R-D4-13` · `R-D6-13` · `R-OPS-02` · `R-QDC-03` · `R-D9-03`.
- **Cách kiểm rẻ nhất:** Thêm **hai ca ÂM TÍNH** vào chính kịch bản `R-D2-24`, **không cần chờ `R-D4-11`**: đăng nhập bằng quản lý cơ sở mới rồi (1) gọi thẳng Server Action **sửa một lớp của cơ sở khác** bằng id lấy từ DB, (2) **tạo** một bản ghi thuộc `SCOPED_MODELS` **không truyền `centerId`**. **Ngưỡng: cả hai phải bị từ chối.** Ca nào đi lọt ⇒ `R-D2-24` chưa được ký, hoặc biên bản phải ghi rõ *"ranh giới mới chỉ phủ đường đọc"* + ngày `R-D4-11` đóng nốt. Phép đo rẻ thứ hai: gieo bản ghi CS2 mang marker `__TEST__` vào DB test rồi chạy **nguyên bộ CI không sửa gì** — **5/5 job vẫn xanh ⇒ đường GHI không có hàng rào**; đồng thời **bật job CRM + thêm assertion** phải thành **ĐIỀU KIỆN VÀO** của làn A, không phải việc làm sau.
- **Gộp từ:** `d2d6-them-3` · `ops-03` (cùng một giả định: bằng chứng dùng làm điều kiện ra đủ để tuyên bố cách ly; cùng lỗ chịu lực — chỉ đo đường ĐỌC; `ops-03` thêm vế độ phủ vai trò).

#### GD-54 — Có điểm gắn che trường vừa biết actor vừa phủ hết đường đọc

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn B | Impact 8 | Risk 6.4 | Ô THÍ_NGHIỆM | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Nghiệm thu `R-D4-06` (*"che kể cả khi truy vấn nằm ở `lib/` và không qua giao diện"*) **đứng được**, vì `lib/` đọc dữ liệu nhạy cảm **qua `scopedDb(actor)`**.
- **Nếu SAI thì sao:** Hai nhánh, **cả hai đều hỏng một vế**. (a) Gắn vào `scopedDb(actor)` — **biết actor nhưng KHÔNG phủ** 159 file `lib/` dùng `db` trần ⇒ vế *"kể cả khi truy vấn nằm ở `lib/`"* **không đạt được**; `R-D4-06` nghiệm thu xanh trên giao diện mà lương/PII vẫn chảy qua `lib/` (kết xuất, chuyển đổi lead, cổng phụ huynh). (b) Gắn vào base `db` — **phủ hết nhưng không có actor**: `db` là singleton mức module và repo **không có** cơ chế ngữ cảnh theo request. Nhánh (b) còn đẻ một câu **chưa ai hỏi**: khi **KHÔNG có actor** (cron, seed, trang công khai) thì che hay không? Che ⇒ trang khoá học công khai **mất giá**; không che ⇒ mọi đường `db` trần thành lỗ. Đây là **quyết định kiến trúc**, chặn cả `R-TECH-01` lẫn `R-D4-06`.
- **Độ tin:** THẤP rằng giả định đúng — **cả hai vế đã đếm được bằng grep**; chỉ còn câu "chọn nhánh nào" là quyết định.
- **Bằng chứng:**
  - `[QS]` đếm lại: **159 file** dưới `lib/` import `@/lib/db` trần; trong đó **9 file** vừa `db` trần vừa chạm `salaryRank|bhxhBase|salaryLevel|parentPhone`: `lib/compliance/erasure.ts` · `lib/compliance/portability.ts` · `lib/crm/convert-lead-v2.ts` · `lib/crm/convert-lead.ts` · `lib/crm/dedupe.ts` · `lib/notify/attendance.ts` · `lib/payments/vietqr.ts` · `lib/portal/parent-profile.ts` · `lib/progress.ts`. `[đính chính: bản trước ghi 157; 01-intended:21 ghi 156 — grep hiện tại trả 159]`
  - `[QS]` `01-intended-vs-implemented.md:21` — cổng ESLint *"chỉ áp cho `app/(admin)/**`, `app/(portal)/**`, `app/(teacher)/**`… **`lib/**` nằm ngoài cổng**"*; xác nhận tại `eslint.config.mjs:100-108` (khối `files: ['app/(admin)/**/*.{ts,tsx}']`).
  - `[QS]` `lib/db-scope.ts:299-303` — `scopedDb(actor)` trả `db.$extends({ query: {…} })`; `lib/db.ts:66` — base `db` cũng `$extends` nhưng **không có actor**.
  - `[QS]` grep `AsyncLocalStorage` trong `app/` + `lib/` = **0 hit** ⇒ không có ngữ cảnh theo request.
  - `[QS]` `app/(public)/khoa-hoc/page.tsx:91` — `db.course.findMany` **không actor**, `:102` trả `priceDisplay` (đường công khai sẽ vỡ nếu che mù quáng).
  - `[QS]` `02-prd:233` (`R-D4-06`, cỡ **L**, *"Số hook `result:` ≥ 1 (**hiện 0**)"*) · `:357-358` (`R-TECH-01` là **điều kiện mở thẻ**) · `:435` (B6 mở đầu bằng `R-D4-06`).
  - `[QS] [đính chính]` **`R-D4-10` KHÔNG nằm trong bất kỳ pha nào của §8** (`02-prd:409-444`; B6 = `06 → 07 → 08 → 11 → 13`). Vậy phát biểu *"B6 xếp `R-D4-06` trước `R-D4-10`"* là **sai**: `R-D4-10` (`02-prd:237`, cỡ **L**) hiện **không có ngày kết thúc**, đó mới là khoảng hở.
- **Mã `R-*` bị chặn:** `R-D4-06` · `R-D4-10` · `R-D4-11` · `R-TECH-01` · `R-D2-14`.
- **Cách kiểm rẻ nhất:** Đã chạy, miễn phí: **9 file** nêu trên phải chuyển sang đường **có actor** (hoặc được liệt kê thành **miễn trừ có tên, có hạn**) **TRƯỚC** khi mở thẻ `R-D4-06`. Kèm **1 trang chọn nhánh (a) hay (b)** + hành vi khi **không có actor**, đo bằng 2 lệnh: grep `AsyncLocalStorage` (hiện 0) và đếm đường đọc trường nhạy cảm **không** qua `scopedDb`/`portalDb` (hiện 9 file `lib/` + trang giá công khai). **Ngưỡng mở thẻ: nhánh đã chọn có văn bản, và số đường đọc không phủ được = 0 hoặc nằm trong danh sách miễn trừ có tên + có hạn.** Nếu không làm được: **đưa `R-D4-10` vào lịch trước**, và **bỏ vế *"kể cả khi truy vấn nằm ở `lib/`"*** khỏi nghiệm thu `R-D4-06` cho tới khi cổng đóng. Lưu ý `R-D2-14` (che MST/số TK) phụ thuộc **chính** quyết định này.
- **Gộp từ:** `d4qdb-05` · `d4qdb-them-1` (`d4qdb-05` chính là **nhánh (a)** của `them-1`; cùng một phép kiểm: đếm đường đọc trường nhạy cảm không qua `scopedDb`).

#### GD-61 — Thu hẹp `isHoLevel` chỉ đụng `actor.ts` và `db-scope.ts`

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn B | Impact 8 | Risk 5.6 | Ô THÍ_NGHIỆM | Cờ 1 CÓ | Cờ 2 CÓ

- **Phát biểu:** Công việc thu hẹp `isHoLevel` (QĐ-A.1 / `R-D4-09`) **gói gọn** trong `actor.ts` (5 điểm) + `db-scope.ts`, nên nghiệm thu *"grep `isHoLevel ? ALL` = 0"* là **đủ** để coi là xong.
- **Nếu SAI thì sao:** `actor.isHoLevel` **không chỉ** là cờ phạm vi dữ liệu — nó là **cờ CẤP QUYỀN** được đọc ở nhiều file production: quản lý lớp LMS, **duyệt học bạ**, điều động/chuyển lớp, lọc **báo cáo doanh thu**, **sửa chương trình**, hoàn tất buổi. Nếu bản vá đổi **NGHĨA** của cờ trong `actor.ts` (đúng chữ QĐ-A.1 *"5 điểm"*), nhân sự HO **mất quyền THAO TÁC** chứ không chỉ mất tầm nhìn — mà nghiệm thu grep một chuỗi trong `db-scope.ts` **không bắt được dòng nào**. `R-D4-09` là chốt chặn của `R-D10-04` và `R-D10-10` ⇒ hỏng ở đây **kéo đứng cả nhánh D10**.
- **Độ tin:** THẤP rằng giả định đúng — **số điểm đọc cờ đã đếm được và lớn hơn nhiều so với "5 điểm"**.
- **Bằng chứng:**
  - `[QS]` đếm lại: **33 file** trong `app/` + `lib/` (bỏ test) tham chiếu `isHoLevel`. `[đính chính: bản trước ghi 14 file; con số 41 ở ghi chú chọn ô là đếm cả test]`
  - `[QS]` `lib/auth/actor.ts:133` — `isHoLevel = liveRows.some(r => isHoRoot(...))`, **không lọc `roleCode`**; `:145-146` `rowCenters = hoRoot ? everyCenter : getSubtreeCenterIds(...)`; `:161` `centerScope: hoRoot ? "ALL" : rowCenters`.
  - `[QS]` `lib/db-scope.ts:184` và `:218` — `return actor.isHoLevel ? "ALL" : actor.visibleCenterIds` (hai nhánh fallback).
  - `[QS]` các điểm đọc là **quyền thao tác**, không phải tầm nhìn: `lib/auth/lms-scope.ts:17` (`isManagerActor`) và `:44` · `lib/transfer/transfer-policy.ts:12` (`canApproveTransfer`) · `lib/lms/report-card-core.ts:232` (duyệt/xem học bạ) · `lib/reports/filters.ts:54` (`isGlobalAllowed`) · `lib/org/org-tree.ts:150` (`seeAll` của picker đơn vị) · `app/(admin)/admin/classes/[id]/session/_actions.ts:68` (hoàn tất buổi) · `app/(admin)/admin/curriculums/_actions.ts:649` (sửa/gắn bài tập chương trình).
  - `[QS]` `QUYET-DINH.md:42` — *"đụng `actor.ts` (5 điểm) + `db-scope.ts:218` + vùng shadow-compare"* · `:100` — QĐ-A.1 **CÓ** đụng cửa sổ shadow, **chờ shadow đóng**.
  - `[QS]` `01-intended-vs-implemented.md:70` — *"`unitType` là ràng buộc cứng ở **13 điểm**"* (đếm theo tiêu chí khác, không mâu thuẫn).
- **Mã `R-*` bị chặn:** `R-D4-09` · `R-D10-04` · `R-D10-10` · `R-OPS-02`.
- **Cách kiểm rẻ nhất:** Hai bước, bước đầu **miễn phí**: (1) grep đếm file production đọc `actor.isHoLevel` (**đã đếm: 33**) và **tuyên bố rõ bản vá thuộc loại nào** — đổi **NGHĨA** cờ ở `actor.ts` (ảnh hưởng 33 file) hay chỉ **bỏ fallback** ở `db-scope.ts:184,218` (ảnh hưởng 1 file). (2) Chạy `R-OPS-02`: chụp bảng *tài khoản × tập hành động × tập cơ sở* **trước/sau** cho toàn bộ tài khoản mang vai trò tại HO. **Ngưỡng: 0 dòng đổi ngoài danh sách đổi có chủ đích đã ký.** Nghiệm thu `R-D4-09` phải bổ sung ít nhất **3 ca thao tác** (duyệt học bạ · chuyển lớp · sửa chương trình), không chỉ ca đọc.

#### GD-59 — Chỉ có ba trục, không có trục thứ tư

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 8 | Risk 5.6 | Ô THÍ_NGHIỆM | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Nơi trực thuộc của một người nằm trên **hồ sơ nhân sự**, nên `R-D3-03` quy **ba** nguồn về một là **đủ**.
- **Nếu SAI thì sao:** `User.centerId` là **trục thứ tư**, nhập ở màn tài khoản (suy từ `orgUnitId` chọn trong biểu mẫu), và **nó — không phải `Employee` —** đang quyết định ai vào được ô chọn giáo viên và guard gán GV. Làm xong `R-D3-03` mà các trang đọc `session.user.centerId` vẫn theo giá trị cũ ⇒ điều động đúng quy trình nhưng dữ liệu **vẫn hiện theo cơ sở cũ** (người dùng kết luận *"tính năng không chạy"*); chiều ngược lại: đã cắt biên chế mà tài khoản còn mang cơ sở cũ ⇒ **vẫn đọc được dữ liệu cơ sở cũ** ở những nơi chưa chuyển sang actor.
- **Độ tin:** THẤP rằng giả định đúng — **trục thứ tư đã kiểm chứng bằng mã**, và `R-D3-10` chỉ phủ **3 bề mặt**.
- **Bằng chứng:**
  - `[QS]` `lib/teachers/assignable.ts:28` (comment *"lọc thuần theo `User.centerId`"*), `:38` (`centerWhere`), `:44-45` (điều kiện `OR` đều kèm `centerWhere`) — ô chọn GV chạy trên `User.centerId`.
  - `[QS]` `app/(admin)/admin/classes/_actions.ts:54-74` — `assertTeachersInCenter` đọc `user.centerId` rồi so với `centerId` của lớp.
  - `[QS]` `app/(admin)/admin/users/_actions.ts:236-238` — `centerId` **suy từ `orgUnitId`** qua `centerIdForOrgUnit`, ghi ở `:250-251`; `lib/org/org-service.ts:264-273` — HO/ROOT → `null`.
  - `[QS]` đếm lại: **74** nơi đọc `user.centerId` / `session.user.centerId` trong `app/` + `lib/` (bỏ test) — `R-D3-10` chỉ đóng **3** trong số đó.
  - `[QS]` `02-prd:225` (`R-D3-10` — *"cả ba chỗ trong cùng một lần phát hành"*) · `:218` (`R-D3-03` — *"`Employee.centerId`/`orgUnitId` chỉ ghi lại tự động"*) · `01-intended:119` (*"Employment ❌ **ba** nguồn sự thật"* — **không** kể `User.centerId`).
- **Mã `R-*` bị chặn:** `R-D3-03` · `R-D3-09` · `R-D3-10` · `R-D4-07`.
- **Cách kiểm rẻ nhất:** (a) **chỉ-đọc**: đếm tài khoản có `User.centerId` **khác** cơ sở suy từ hồ sơ nhân sự (`Employee.centerId` hoặc PRIMARY assignment) — **ngưỡng > 0 ⇒ PRD thiếu yêu cầu đồng bộ**; (b) khai **danh sách 74 điểm** phải chuyển, đánh dấu 3 điểm `R-D3-10` phủ và 71 điểm còn lại, rồi **thử chuyển 1 bề mặt** (ô chọn GV) sang đọc actor và đo lệch trước/sau bằng `R-OPS-02` trước khi cam kết *"quy ba nguồn về một"*.

#### GD-50 — Ba mức danh mục áp được chỉ bằng cách thêm cột chủ sở hữu

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A | Impact 6 | Risk 5.6 | Ô THÍ_NGHIỆM | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** `R-D6-02/03` áp được phân loại ba mức bằng cách **bổ sung `ownerOrgUnitId`** cho các bảng mức 2 và mức 3, **giữ nguyên cấu trúc bảng hiện có**.
- **Nếu SAI thì sao:** 6 trong 8 bảng được `R-D6-02` nêu đích danh đang có **KHOÁ DUY NHẤT TOÀN CỤC** trên khoá nghiệp vụ. Muốn hai cơ sở có bản riêng **cùng mã** thì phải **hạ khoá duy nhất xuống dạng ghép với đơn vị** — kéo theo **mọi lời gọi tra cứu theo khoá đó**, trong đó có **đường TIỀN** (phương thức thanh toán). Nghiệm thu *"hai cơ sở không đọc thấy bản ghi của nhau"* **không đạt được** nếu không đụng khoá duy nhất, mà việc đó **không mã yêu cầu nào phủ**.
- **Độ tin:** THẤP rằng giả định đúng — **6 khoá duy nhất toàn cục đã đọc trực tiếp trên schema**.
- **Bằng chứng:**
  - `[QS]` `prisma/schema.prisma:2647` `InventoryItem.itemCode @unique` · `:3048` `PaymentMethod.code @unique` · `:3301` `Voucher.code @unique` · `:3423` `Product.sku @unique` · `:3535` `EmailTemplate.code @unique` · `:1703` `CoursePackage.slug @unique`. `[đính chính: bản trước dẫn CoursePackage tại :4811 — dòng đó là `Promotion.slug`; `CoursePackage.slug` nằm ở :1703]`
  - `[QS]` hai bảng còn lại **đi ngược**: `Room` **đã đúng mức độc lập sẵn** nhờ khoá ghép `@@unique([centerId, code])` (`:678`); `Holiday` (`:690-706`) **không có khoá duy nhất nào**.
  - `[QS]` `02-prd:196` (`R-D6-02` — liệt kê đúng 8 bảng, nghiệm thu *"hai cơ sở không đọc thấy bản ghi của nhau"*) · `:197` (`R-D6-03` — cỡ **L**) · `:198` (`R-D6-04` — đọc **bắt buộc qua hàm theo mức**).
- **Mã `R-*` bị chặn:** `R-D6-01` · `R-D6-02` · `R-D6-03` · `R-D6-04` · `R-D6-11`.
- **Cách kiểm rẻ nhất:** Script **chỉ-đọc**: với mỗi bảng trong danh sách phân loại, in ra khoá duy nhất hiện có + **đếm số lời gọi tra cứu theo khoá đó** trong `lib/` + `app/`. **Ngưỡng giữ ước lượng `R-D6-03`: nếu tổng lời gọi phải sửa vượt 30 ⇒ tách `R-D6-03` theo từng bảng và xếp lại cỡ**; nếu nhóm **phương thức thanh toán** chiếm phần lớn thì **tách riêng** thành một thẻ có **đối soát tiền** đi kèm. Thử **một bảng trước** (đề xuất `EmailTemplate` — không đụng tiền) rồi mới cam kết cả nhóm.

#### GD-47 — Mở đường tạo cây trước, siết `isHoLevel` sau là an toàn

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 8 | Risk 4.2 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Có thể dựng màn quản trị `OrgUnit` + thêm tầng REGION + di chuyển CS1/CS2 xuống vùng (**làn A, pha A4**) **TRƯỚC** khi thu hẹp `isHoLevel` (**làn B**, sau cửa sổ shadow) mà **không nhân thêm** rủi ro rò phạm vi.
- **Nếu SAI thì sao:** Mỗi node mới là **một chỗ gắn được vai trò**; node mang type `HO`/`ROOT` thì **MỌI** permission của vai trò đó nhận `centerScope = "ALL"`. Giao xong `R-D2-01..08` + `R-D2-24` là giao một **giao diện nhân bản đường thoát phạm vi** nhanh hơn tốc độ vá. `R-OPS-02` chỉ bắt được thay đổi **có chủ đích**, không bắt được quyền **THỪA** sinh ra **sau** khi giao màn hình. Và `01-intended:72` **đã ghi thứ tự ngược lại** — làm theo §8 là **cố ý đi ngược một khuyến nghị đã viết ra**.
- **Độ tin:** THẤP rằng giả định đúng — **cơ chế nhân rủi ro đã kiểm chứng bằng mã**, và hai tài liệu đang mâu thuẫn về thứ tự.
- **Bằng chứng:**
  - `[QS]` `lib/auth/actor.ts:92-93` — `isHoRoot(n) = n.type === "HO" || n.type === "ROOT"` · `:133` `isHoLevel` **không lọc `roleCode`** · `:145-146` `rowCenters = everyCenter` · `:161` `centerScope: hoRoot ? "ALL"`.
  - `[QS]` `lib/db-scope.ts:218` — fallback `"ALL"` khi model thiếu map prefix.
  - `[QS]` `lib/org/org-tree.ts:26-42` (`getDescendants`) — mỗi node thêm vào cây là một điểm gắn vai trò mới.
  - `[QS]` `01-intended-vs-implemented.md:70-72` — *"**Vá — THỨ TỰ KHÔNG ĐẢO ĐƯỢC**: (1) Sửa `isHoLevel` **trước** … (2) **Rồi mới** dựng đường tạo `OrgUnit`"*; `:71` — *"Khi thêm nhãn trung gian (`REGION`/`DEPARTMENT`) mà chưa sửa `isHoRoot`, **rủi ro nhân lên theo số node**"* · `:146` — chuỗi phụ thuộc D2 → D3 → D6 → D9.
  - `[QS]` `02-prd:416` (A4 = `R-D2-01..08` · `R-OPS-01` · `R-OPS-08`, **làn A**) · `:434` (`R-D4-09` nằm ở **B5**, sau shadow) · `QUYET-DINH.md:30` (*"Không sửa `isHoLevel` vì lý do hình dạng cây. ⚠️ Nhưng vẫn phải sửa vì lý do khác — xem QĐ-A.1"*) · `:100` (QĐ-A.1 **chờ cửa sổ shadow đóng**).
- **Mã `R-*` bị chặn:** `R-D2-01` · `R-D2-02` · `R-D2-06` · `R-D2-24` · `R-D4-09` · `R-OPS-02`.
- **Cách kiểm rẻ nhất — đồng thời là ĐIỀU KIỆN VÀO của pha A4, không phải phép đo tuỳ nghi:** Trên bản sao dữ liệu thật: chạy `R-OPS-02` (bảng *tài khoản × tập `centerId` nhìn thấy × tập action*) **trước/sau** khi chèn node REGION và chuyển CS1/CS2 xuống. **Ngưỡng: 0 dòng thay đổi.** Rồi chạy lần hai với **1 vai trò HẸP gắn tại node vùng** và **1 vai trò HẸP gắn tại HO** — đếm số `centerId` mỗi tài khoản nhìn thấy; **nếu tài khoản gắn tại HO trả về TOÀN BỘ `centerId` ⇒ giả định sai, làn A đang nhân rủi ro** ⇒ phải đảo thứ tự: `R-D4-09` (hoặc ít nhất phần lọc `roleCode` trong `isHoRoot`) đi **trước** A4.
- ⚠️ **Nhánh trượt này đâm vào một quyết định đã chốt — phải có người cắt, tài liệu KHÔNG tự quyết:** `QUYET-DINH.md:42` + bảng tra `:100` đã chốt QĐ-A.1 (thu hẹp `isHoLevel`) là **CÓ đụng shadow ⇒ chờ cửa sổ shadow đóng**, và §8 xếp `R-D4-09` ở **B5** (`02-prd:434`); trong khi `01-intended-vs-implemented.md:70-72` ghi **thứ tự ngược lại và tuyên bố không đảo được**. Ba nguồn khoá nhau ⇒ **đây là vòng khoá thứ hai**, khác vòng khoá QĐ-B mà `c30` đang hỏi. **Đã mở thành câu hỏi `c43` ở §9** (Ban giám đốc + chủ đợt go-live RBAC + Luân). Trong lúc chờ trả lời: **không mở thẻ A4** dựa trên giả định này, dù mã đang nằm ô LÀM_LUÔN — ô LÀM_LUÔN chỉ nói "không cần thí nghiệm riêng", **không** nói "được đi trước khi vòng khoá được cắt".

#### GD-65 — Mọi khoản thu đều đi được tới sổ doanh thu

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 8 | Risk 3.5 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Mọi khoản tiền thu tại cơ sở **đều đi tới sổ doanh thu đã xác nhận**, nên phạm vi tính phí suy từ **lớp** (`R-D10-03/04`) **phủ hết tiền** — không có dòng tiền nào nằm ngoài với tư cách *"không gắn được lớp"*.
- **Nếu SAI thì sao:** Doanh thu **ngoài học phí** (kit/thiết bị/lệ phí thi) bị **kẹt vĩnh viễn ở PENDING**: không xác nhận được, không sinh phiếu thu, không vào doanh thu thực ⇒ **nằm ngoài mọi căn cứ tính phí**. Người chịu: HO mất phần phí của nhóm này; bên NHẬN có **một kênh thu hợp lệ mà HO không nhìn thấy**.
- **Độ tin:** THẤP rằng giả định đúng — **chặn cứng ở đường xác nhận đã đọc trực tiếp trong mã**.
- **Bằng chứng:**
  - `[QS]` `lib/finance/payment.ts:359-361` — *"Khoản chưa gắn ghi danh, không thể sinh phiếu thu"* (chặn `!existing.enrollmentId`); `:369-371` là **đường DUY NHẤT** đặt `accountantStatus: "CONFIRMED"`.
  - `[QS]` `lib/finance/payment.ts:101-116` — khoản thu tự động lúc xác nhận đơn **KHÔNG** đặt `enrollmentId`; `:200-206` — `enrollmentId` chỉ được gắn **về sau** (đường liên kết ghi danh).
  - `[QS]` `prisma/schema.prisma:3206-3224` — `OrderItem` **đa hình**: `enrollmentId` / `packageId` / `examAttemptId` / `productId` ⇒ tồn tại đơn **không có** dòng ghi danh.
  - `[QS]` `prisma/schema.prisma:4922` — `Payment.enrollmentId` **NULLABLE**.
  - `[QS]` `02-prd:293` (`R-D10-03` lấy `classId` làm trục) · `:294` (`R-D10-04`) · `:302` (`R-D10-12` — *"Phạm vi tính phí = theo hợp đồng (mọi lớp chạy trong đơn vị nhượng quyền)"*).
- **Mã `R-*` bị chặn:** `R-D10-03` · `R-D10-04` · `R-D10-12` · `R-D10-13`.
- **Cách kiểm rẻ nhất:** **1 truy vấn read-only** trên prod, 12 tháng gần nhất: tổng số tiền `Payment` (`deletedAt` null) đang **PENDING** mà đơn **không có** `OrderItem` loại gắn ghi danh — tức **tiền cấu trúc không thể xác nhận**. **Ngưỡng: > 0đ ⇒ trục "phạm vi theo lớp" không phủ hết tiền** → `R-D10-12` phải chốt phạm vi tính phí theo **ĐƠN VỊ/HỢP ĐỒNG**, không theo lớp; và phải mở đường xác nhận khoản thu **không gắn ghi danh**.
- **Câu hỏi cho Ban:** Doanh thu **kit/thiết bị/lệ phí thi** của cơ sở bên NHẬN **có** nằm trong căn cứ tính phí thương hiệu không? Nếu có thì hệ thống hiện **chưa ghi nhận được** nhóm này.

#### GD-56 — Quay lui được đợt chuyển đổi cây bằng backup hiện có

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 8 | Risk 3.5 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 chưa rõ

- **Phát biểu:** Nếu đợt chuyển đổi cây tổ chức hoặc đợt nạp đơn vị cho tiền **hỏng giữa chừng**, khôi phục bằng **backup Supabase hiện có** là **đủ** để quay lui **mà không mất giao dịch trong ngày**.
- **Nếu SAI thì sao:** Đợt chuyển đổi thành **thao tác một chiều trên dữ liệu thật**: mốc khôi phục duy nhất được ghi là **RPO 24h** — chấp nhận mất tới **một ngày** điểm danh, thu tiền, ghi danh; **RTO 4–8h** là hệ thống đứng gần một buổi học. Điều kiện dừng của `R-OPS-05` (*"gặp lệch → dừng, không đi tiếp"*) vì thế **không có đường thoát**: dừng giữa chừng để lại cây **nửa cũ nửa mới**, mà quay lui thì **mất dữ liệu ngày hôm đó**.
- **Độ tin:** THẤP rằng giả định đúng — **chưa có diễn tập khôi phục nào được ghi lại**, và ba mã `R-OPS-04/05/06` **không có làn, không có chủ**.
- **Bằng chứng:**
  - `[QS]` `02-prd:324` (`R-OPS-04` — kế hoạch quay lui; nhóm không quay lui được **bắt buộc** mẫu 2 pha) · `:325` (`R-OPS-05` — điều kiện dừng) · `:326` (`R-OPS-06` — *"Không có backup xác nhận được → **không chạy**"*).
  - `[QS]` ĐO trên §8 (`02-prd:409-444`): **`R-OPS-04`, `R-OPS-05`, `R-OPS-06` KHÔNG xuất hiện** ở làn A lẫn làn B (§8 chỉ có `R-OPS-01,02,03,07,08`).
  - `[QS]` `CLAUDE.md:144` — mốc **duy nhất** trong repo: *"Backup Supabase (RPO 24h/RTO 4–8h)"*.
  - `[QS]` `02-prd:352-353` — mẫu 2 pha: điều kiện sang pha B là **0 dòng NULL trên dữ liệu thật** + ổn định **≥2–3 ngày** production.
- **Mã `R-*` bị chặn:** `R-OPS-04` · `R-OPS-05` · `R-OPS-06` · `R-OPS-02` · `R-D10-08`.
- **Cách kiểm rẻ nhất:** **Một diễn tập, đo bằng đồng hồ**: khôi phục backup Supabase gần nhất sang **một dự án tạm**, đo (a) thời gian tới khi truy vấn được, (b) khoảng dữ liệu bị mất so với hiện tại. **Ngưỡng: (a) > 4h hoặc (b) > 1h ⇒ "quay lui bằng backup" KHÔNG phải kế hoạch quay lui của một đợt chạy ban đêm** → `R-OPS-04` chuyển thành **điều kiện VÀO** của mọi bước chạm dữ liệu thật, và mọi bước một chiều chuyển sang **mẫu 2 pha**.
- **Câu hỏi cho Ban:** Đã có lần **khôi phục backup nào được diễn tập và ghi lại** chưa? Nếu chưa, Ban **chấp nhận** chạy đợt chuyển đổi cây với mốc RPO 24h, hay **đòi một diễn tập khôi phục trước**?

#### GD-51 — Xoá mềm đơn vị chỉ ảnh hưởng cây, không ảnh hưởng dữ liệu

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 8 | Risk 3.2 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** `R-D2-04` (xoá mềm đơn vị, bắt buộc lý do, chặn khi còn con sống) **đủ an toàn để giao**, vì xoá mềm một node **chỉ gỡ nó khỏi cây** chứ không đụng tới dữ liệu nghiệp vụ của cơ sở đó.
- **Nếu SAI thì sao:** Xoá mềm — **hoặc chỉ đặt `isActive = false`** — một node `CENTER` làm `centerId` của nó **rơi khỏi `allCenterIds` và khỏi mọi subtree**, nên tập bản ghi đọc được của **MỌI tài khoản trừ `SUPER_ADMIN`** mất **trọn cơ sở đó ngay lập tức**: học viên, lớp, học bạ, phiếu thu, công nợ. **Không lỗi, không cảnh báo**, và không đường quay lui trên giao diện vì **mã đơn vị duy nhất toàn cục** nên không tạo lại được node cùng mã. Đây chính là màn **ĐÓNG CƠ SỞ / CẮT HỢP ĐỒNG** sẽ dùng ⇒ `R-D9-06` (bên NHẬN vẫn đọc được dữ liệu của mình trong thời gian chuyển tiếp) và `R-D9-11` (gói bàn giao) **không thực hiện được** nếu quy trình cắt chạm vào node.
- **Độ tin:** THẤP rằng giả định đúng — **đường nhân quả đọc thẳng được trong `actor.ts` + `org-tree.ts`**.
- **Bằng chứng:**
  - `[QS]` `lib/org/org-tree.ts:8` — `isLive(n) = n.deletedAt == null && n.isActive !== false` · `:48-61` — `getSubtreeCenterIds` **bỏ qua node không live** (`:57`) và chỉ gom `type === "CENTER"` (`:58`).
  - `[QS]` `lib/auth/actor.ts:95-99` — `allCenterIds` lọc `isLiveNode` · `:117` — `everyOrgUnit` cũng lọc `isLiveNode`.
  - `[QS]` `lib/org/org-service.ts:163-183` — `softDeleteOrgUnit` đặt **cả `deletedAt` VÀ `isActive: false`** (`:180`), chỉ chặn khi **còn con sống** (`:168-177`) — **không** chặn khi còn **dữ liệu nghiệp vụ**.
  - `[QS]` `lib/org/org-service.ts:76` — *"`code`/`centerId` reuse của bản đã soft-delete: **KHÔNG** (code unique toàn cục)"*.
  - `[QS]` `02-prd:167` (`R-D2-04`) · `:284` (`R-D9-06` — sau khi cắt vẫn *"đọc được danh sách học viên cơ sở mình"*) · `:289` (`R-D9-11`).
- **Mã `R-*` bị chặn:** `R-D2-04` · `R-D2-05` · `R-D9-06` · `R-D9-11` · `R-OPS-02`.
- **Cách kiểm rẻ nhất:** Trên DB test, kịch bản **15 phút**: gán 1 vai trò quản lý tại `CS-TEST`, tạo 3 học viên + 1 phiếu thu, đếm số bản ghi tài khoản đó đọc được (kỳ vọng > 0). Gọi `softDeleteOrgUnit` trên node `CS-TEST` rồi **đếm LẠI** bằng chính tài khoản đó **và** bằng một tài khoản kế toán HO. **Ngưỡng: nếu con số về 0 ⇒ `R-D2-04` phải nhận thêm tiêu chí âm tính** (chặn xoá node còn dữ liệu nghiệp vụ, **hoặc tách hẳn khái niệm NGỪNG HOẠT ĐỘNG khỏi XOÁ MỀM**), và quy trình cắt hợp đồng `R-D9-05/06` phải ghi rõ là **KHÔNG chạm node**.
- **Câu hỏi cho Ban:** Đóng một cơ sở (hoặc cắt hợp đồng với bên NHẬN) thì node đơn vị bị **xoá mềm**, chỉ **tắt hoạt động**, hay **giữ nguyên**? Trong thời gian chuyển tiếp, bên NHẬN và kế toán HO còn phải **đọc được gì**?

#### GD-72 — Cắt nguồn là đuổi được phiên đang mở

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn B | Impact 8 | Risk 3.2 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Thu hồi `UserOrgRole` theo nguồn **có hiệu lực ngay** với người **đang đăng nhập sẵn**, nên các mã D3 **không cần** điều khoản về phiên.
- **Nếu SAI thì sao:** Cắt nguồn xong, người đang mở máy **vẫn giữ nguyên phiên với đủ vai trò cũ** cho tới khi tự đăng xuất — **đúng cửa sổ nguy hiểm nhất** (ngày cuối trước khi nghỉ việc, ngày hết đợt điều động). `R-D9-05b` đặt tiêu chí *"không cần đăng xuất"* cho **nhánh hợp đồng**, nhưng nhánh **biên chế/kiêm nhiệm không có tiêu chí tương đương** nên **sẽ không ai kiểm**.
- **Độ tin:** THẤP rằng giả định đúng — **điều kiện tăng `tokenVersion` đọc thẳng được trong mã**.
- **Bằng chứng:**
  - `[QS]` `prisma/schema.prisma:725` — `tokenVersion Int @default(0)`.
  - `[QS]` `app/(admin)/admin/users/_actions.ts:253` — `...(rolesChanged && { tokenVersion: { increment: 1 } })` ⇒ **chỉ tăng khi vai trò v1 trên tài khoản đổi**, **không** tăng khi `UserOrgRole` `EXPIRED`.
  - `[QS]` `lib/flags.ts:8` + `lib/auth/permissions.ts:629-664` — cờ v2 OFF ⇒ quyền hành động đọc `role/roles` **từ phiên (JWT)**.
  - `[QS]` `app/(admin)/admin/layout.tsx:60-62` và `app/(teacher)/teacher/layout.tsx:63-65` — phiên chỉ bị làm mới khi `dbUser.tokenVersion !== session.user.tokenVersion`.
  - `[QS]` `02-prd:283` (`R-D9-05b` — *"tăng `tokenVersion`… thao tác ghi kế tiếp bị từ chối — **không cần đăng xuất**"*) · `:227` (`R-D3-12`) · `03-job-stories.md:238` — *"JS-02C tiêu chí 3 **mượn mã `R-D9-05b`** của nhóm nhượng quyền nên PRD cần khẳng định cơ chế tăng `tokenVersion` **dùng chung cho mọi lần thu hồi quyền**"*.
- **Mã `R-*` bị chặn:** `R-D3-02` · `R-D3-12` · `R-D9-05b`.
- **Cách kiểm rẻ nhất:** Staging: một tài khoản GV đăng nhập sẵn ở trình duyệt **A**. Ở trình duyệt **B**, `EXPIRE` toàn bộ `UserOrgRole` của người đó theo nguồn. **KHÔNG tải lại trang ở A**, thực hiện tiếp một thao tác **GHI**. **Ngưỡng: bị từ chối ngay, không cần đăng nhập lại.** Nếu qua ⇒ mở một mã `R-*` buộc **mọi** đường thu hồi theo nguồn đều **tăng `tokenVersion` trong cùng transaction**.
- **Câu hỏi cho Ban:** Cơ chế tăng `tokenVersion` của `R-D9-05b` có áp dụng chung cho **MỌI** lần thu hồi quyền theo nguồn (biên chế, kiêm nhiệm, hợp đồng) không?

#### GD-63 — `Class.curriculumId` là con trỏ đáng tin để giải chương trình

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A | Impact 8 | Risk 3.0 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** `Class.curriculumId` khi khác `null` **luôn** trỏ tới một `Curriculum` **có thật** và **khớp** `Class.curriculumVersion`, nên `resolveClassCurriculum` chỉ cần đọc trường này là ra **đúng chủ sở hữu**.
- **Nếu SAI thì sao:** `R-D10-02` trả về **sai chương trình** (hoặc `null` vì mồ côi) → `R-D10-03` kết luận **sai trong/ngoài phạm vi** → sai cả quyền xem chi tiết (`R-D10-04`) lẫn **căn cứ tính phí thương hiệu**. Sai **ÂM THẦM**: không ngoại lệ, không dòng lỗi, chỉ có **con số phí lệch**. Người chịu: kế toán HO khi đối chiếu với bên NHẬN.
- **Độ tin:** TRUNG BÌNH — **thiếu khoá ngoại đã kiểm chứng bằng schema**; nhưng `curriculumId` được **ghim lúc tạo lớp** nên tỉ lệ hỏng thực tế có thể nhỏ, phải đếm mới biết.
- **Bằng chứng:**
  - `[QS]` `prisma/schema.prisma:1309-1310` — `curriculumId String?` + `curriculumVersion Int?`; khối relation `:1312-1330` **KHÔNG có quan hệ nào tới `Curriculum`** ⇒ **không khoá ngoại**.
  - `[QS]` `prisma/schema.prisma:2103` — `Curriculum @@unique([courseId, version])` ⇒ `(id)` và `(courseId, version)` là **hai khoá độc lập**, không ràng buộc chéo.
  - `[QS]` `lib/classes/snapshot.ts:16-22` — `resolveEffectiveCurriculumVersion` **đã tồn tại** nhưng giải theo **VERSION**, ngữ nghĩa **khác** `R-D10-02` (giải theo **ID**).
  - `[QS]` `02-prd:292` (`R-D10-02` — đã có đường lùi cho `null`) · `:293` (`R-D10-03` — *"Không giải được → **false** (fail-closed)"*).
  - `[QS]` `03-job-stories.md:159` — bối cảnh: tiêu chí nhóm này đang chờ Ban chốt, không được đóng cứng con số.
- **Mã `R-*` bị chặn:** `R-D10-02` · `R-D10-03` · `R-D8-01` · `R-D10-13`.
- **Cách kiểm rẻ nhất:** **Hai câu SQL read-only**: (a) đếm `Class` có `curriculumId NOT NULL` mà **không tồn tại** trong bảng `Curriculum` (**mồ côi**); (b) đếm `Class` mà `Curriculum[curriculumId].version <> Class.curriculumVersion` (**lệch ghim**). **Ngưỡng: cả hai phải = 0** trước khi `R-D10-02` được coi là hàm đáng tin; **> 0 ⇒ thêm khoá ngoại + dọn dữ liệu**, và cộng số lớp đó vào **báo cáo tồn đọng `R-D10-13`**.

#### GD-48 — Không ai chạy lại kịch bản seed tổ chức sau khi chuyển cây

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A | Impact 8 | Risk 2.1 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Sau khi chuyển CS1/CS2 xuống dưới node **VÙNG Đà Nẵng** theo QĐ-A, các kịch bản seed/patch tổ chức đang có **sẽ không bị chạy lại** trước khi `R-OPS-01` kịp sửa chúng.
- **Nếu SAI thì sao:** **Một lần bấm nút kéo ngược hình dạng cây về trạng thái cũ.** Hậu quả: `getSubtreeCenterIds(VÙNG Đà Nẵng)` trả **rỗng**; **mọi tài khoản mang vai trò tại node vùng mất sạch phạm vi cơ sở**; **không có cảnh báo nào**. `R-OPS-02` sinh ra để bắt tình huống này nhưng **chỉ bắt được nếu có người chủ động chụp trước/sau**.
- **Độ tin:** THẤP rằng giả định đúng — **đường ghi đè và nút bấm prod đã đọc trực tiếp trong mã + workflow**.
- **Bằng chứng:**
  - `[QS]` `prisma/seed-orgunit.ts:50-54` — nhánh **`update`** ghi `parentId: root.id` (`:52`) kèm `centerId, isActive: true, deletedAt: null` ⇒ **ghi đè cha mỗi lần chạy lại**; `:23-27` UNITS gắn cứng HO/CS1/CS2.
  - `[QS]` `prisma/patch-rbac-staff.ts:26` (`import { seedOrgUnits }`) · `:49` (`APPLY = argv.includes("--apply")`) · `:54-55` (`if (APPLY) { await seedOrgUnits(db); … }`).
  - `[QS]` `.github/workflows/patch-rbac-staff.yml:19-27` — `workflow_dispatch` **bấm tay**, `mode: apply` · `:28-31` — đòi gõ đúng chuỗi xác nhận (rào duy nhất).
  - `[QS]` `prisma/patch-rbac-admins.ts:13` — comment **SAI**: *"`seedOrgUnits` là upsert thuần (không xoá) → an toàn"* (upsert **vẫn ghi đè `parentId`**).
  - `[QS]` `docs/ke-hoach-go-live-2607/shadow-log.md:96-97` — vẫn đang hướng dẫn đội *"hoặc **chạy lại patch** (idempotent, suy cơ sở qua `centerId`)"*.
  - `[QS]` `lib/org/org-tree.ts:48-60` — `getSubtreeCenterIds` chỉ gom node `CENTER` **trong subtree** ⇒ cha sai là subtree rỗng · `QUYET-DINH.md:31` — *"`getSubtreeCenterIds` của VÙNG Đà Nẵng giờ phải trả `[CS1, CS2]`"*.
  - `[QS]` `02-prd:416` (A4, điều kiện ra: chạy `seedOrgUnits` **2 lần** → `parentId` không đổi) · `:321` (`R-OPS-01`, kèm yêu cầu *"Sửa comment sai ở `patch-rbac-admins.ts:13`"*).
- **Mã `R-*` bị chặn:** `R-OPS-01` · `R-OPS-02` · `R-OPS-05` · `R-OPS-08` · `R-D2-10` · `R-D2-19`.
- **Cách kiểm rẻ nhất:** Trên bản sao dữ liệu thật: chuyển CS1/CS2 xuống VÙNG → chạy `patch-rbac-staff` `mode=apply` → đọc lại `parentId` của CS1/CS2 và chạy `getSubtreeCenterIds(VÙNG)` trên tập node vừa đọc. **Ngưỡng: `parentId` quay về ROOT hoặc subtree trả rỗng ⇒ giả định SAI**, và `R-OPS-01` phải chuyển thành **việc CHẶN (làm TRƯỚC mọi thao tác cây)**, không phải một dòng trong pha A4.

#### GD-82 — Đổi tiền tố tệp R2 theo đơn vị là việc cỡ L khép kín

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 7 | Risk 4.9 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Đưa tệp trên R2 về **tiền tố theo đơn vị** là một việc **cỡ L khép kín trong tầng lưu trữ**, **không** kéo theo việc viết lại URL đã lưu trong CSDL và **không** phải di chuyển tệp cũ.
- **Nếu SAI thì sao:** Nghĩa vụ hợp đồng khi cắt hợp đồng **không thực hiện được**: **không xoá được và cũng không bàn giao được** tệp của bên NHẬN, vì không có cách liệt kê tệp thuộc một đơn vị. Gói bàn giao `R-D9-11` khi đó **chỉ chứa dữ liệu bảng**, thiếu toàn bộ ảnh/tài liệu — bên NHẬN nhận một gói **không đủ để lưu chứng từ**, còn **dữ liệu hình ảnh trẻ em của họ vẫn nằm lại trong kho của HO**.
- **Độ tin:** THẤP rằng giả định đúng — **cách chia khoá theo LOẠI tệp đã đọc trực tiếp trong mã**, và chính PRD tự khai hệ quả.
- **Bằng chứng:**
  - `[QS]` `lib/storage/upload-config.ts:13` (`uploads/images`) · `:27` (`uploads/documents`) · `:54` (`uploads/videos`) · `:66` (`uploads/audio`) — folder chia theo **LOẠI tệp**, **không có trục đơn vị**.
  - `[QS]` `lib/storage/signed-url.ts:14-15` — `keyFromPublicUrl` tách object key **TỪ public URL đã lưu** ⇒ key nằm trong URL lưu ở DB, nên **đổi tiền tố là đổi DỮ LIỆU**, không chỉ đổi tầng lưu trữ.
  - `[QS]` `lib/storage/r2-client.ts:86-93` — `deleteR2Prefix` chỉ xoá theo **MỘT tiền tố**; cơ chế hiện có **giả định tệp cùng chủ nằm chung tiền tố** — hiện **không đúng** với tệp upload.
  - `[QS]` đếm lại trên `prisma/schema.prisma`: **18 cột** kiểu `*Url`/`r2Key` đang lưu đường dẫn (> 5).
  - `[QS]` `02-prd:346` — `R-DP-06`, cỡ **L**: *"Liệt kê được toàn bộ tệp thuộc một đơn vị bằng **một lệnh**… Hiện khoá chia theo **loại file** → cắt hợp đồng **không xoá cũng không bàn giao được**"* · `:289` (`R-D9-11`).
- **Mã `R-*` bị chặn:** `R-DP-06` · `R-D9-11` · `R-D8-08`.
- **Cách kiểm rẻ nhất:** **Thử thật, một lệnh:** `ListObjectsV2` với tiền tố tương ứng **một cơ sở**, đếm object trả về; song song đếm số cột schema đang lưu URL/khoá R2 (**đã đếm: 18**). **Ngưỡng: lệnh trả 0 object (vì không tồn tại tiền tố theo đơn vị) VÀ số cột lưu URL > 5 ⇒ chi phí thật gồm cả di trú tệp + viết lại URL trong DB ⇒ vượt xa cỡ L đang ghi ở `02-prd:346`** → phải tách `R-DP-06` thành *(đổi tiền tố cho tệp MỚI)* + *(di trú tệp cũ)* và nêu **phụ thuộc cứng** `R-D9-11 → R-DP-06` (hiện bảng chưa có).

#### GD-58 — Đủ dữ liệu để dựng trục biên chế

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 7 | Risk 4.2 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Có thể backfill cho **mỗi** nhân viên **đúng một** `EmployeeOrgAssignment` `PRIMARY` để `R-D3-03` lấy nó làm **nguồn sự thật duy nhất** về nơi trực thuộc.
- **Nếu SAI thì sao:** Đường ghi phân công **duy nhất đang chạy** là công tắc *"Nhân viên HO"* — chỉ tạo `PRIMARY` trỏ node **HO**, lại **ghi thẳng không qua service** nên **bỏ qua kiểm 1-PRIMARY**. Nhân sự cơ sở nhiều khả năng **chưa có dòng phân công nào**. Sau khi flip nguồn sự thật, họ **mất nơi trực thuộc**: rơi khỏi danh sách theo cơ sở, khỏi bảng lương/phân bổ; nếu quy trình ghi `Employee.centerId = null` theo nguồn mới thì họ **vô hình với mọi actor cấp cơ sở** (`Employee` ∈ `SCOPED_MODELS`, `centerId` null **KHÔNG** thuộc `NULL_IS_GLOBAL_MODELS` nên **bị CHẶN**, chứ không phải *"ai cũng thấy"*). Phát hiện **muộn nhất ở kỳ lương kế tiếp**.
- **Độ tin:** THẤP rằng giả định đúng — **đường ghi duy nhất và ngữ nghĩa `centerId` null đã kiểm chứng bằng mã**; số lượng thiếu thì phải đếm.
- **Bằng chứng:**
  - `[QS]` `app/(admin)/admin/nhan-su/actions.ts:59-113` — `syncHoAssignment`: chỉ tạo `PRIMARY` **trỏ node HO** (`:74-81`), **ghi thẳng `sdb.employeeOrgAssignment.create`**, không đi qua `createAssignment`.
  - `[QS]` `lib/org/assignment-service.ts:64-72` — luật **1 PRIMARY còn hiệu lực** nằm ở service ⇒ đường ghi trên **không chạm luật này**.
  - `[QS]` `prisma/schema.prisma:446-461` — `EmployeeOrgAssignment` **không có unique** chống 2 `PRIMARY` (chỉ 2 index `:459-460`).
  - `[QS]` `app/(admin)/admin/nhan-su/actions.ts:233-238` — `employee.create` dùng `createData` **nguyên trạng**; grep `centerIdForOrgUnit` trong file = **0** ⇒ `Employee.centerId` **không** được suy từ đơn vị chọn ở biểu mẫu, dù `components/admin/nhan-su/employee-form.tsx:26` ghi *"centerId suy ra ở server"* và `lib/validators/employee.ts:90-91` có cả hai trường.
  - `[QS]` `lib/db-scope.ts:11-37` — `Employee` ∈ `SCOPED_MODELS` (`:13`) · `:49-53` — `NULL_IS_GLOBAL_MODELS` chỉ có `Survey`/`SurveyResponse`/`EvaluationRound` · `:252-254` — *"với model thường, `centerId` null = dữ liệu hỏng/chưa backfill → **CHẶN**"*.
  - `[QS]` `01-intended:119` — *"Employment ❌ **ba** nguồn sự thật… **không unique chống 2 PRIMARY**"*.
- **Mã `R-*` bị chặn:** `R-D3-03` · `R-D3-04` · `R-D3-05` · `R-D3-06`.
- **Cách kiểm rẻ nhất:** **Bốn phép đếm chỉ-đọc**: (a) `Employee` đang làm; (b) có ≥1 `PRIMARY` còn hiệu lực; (c) `employeeId` có **>1** `PRIMARY` còn hiệu lực; (d) `Employee` có `centerId = null` mà **không** phải nhân sự HO. **Ngưỡng vào việc: (b)/(a) = 100%, (c) = 0, (d) = 0** trước khi bật `R-D3-03` và tạo index `R-D3-04`.

#### GD-83 — Prisma `result:` đè được trường vô hướng có sẵn (A8)

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn B | Impact 7 | Risk 4.2 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Prisma 5.22 cho phép `result:` extension khai một computed field **TRÙNG TÊN** cột vô hướng có sẵn, và giá trị computed **thắng** giá trị thật ở **mọi** đường đọc — kể cả khi chồng lên lớp `$extends` `query:` đang có.
- **Nếu SAI thì sao:** `R-D4-06` — **lõi của cả D4** — **không làm được như thiết kế**; chuỗi B6 (`06→07→08→11→13`) **mất điều kiện mở thẻ** và phải quay về **che tay ở từng call-site**, đúng thứ `R-D4-08` định xoá. Nhánh D4 mất lý do tồn tại ở tầng truy vấn.
- **Độ tin:** TRUNG BÌNH — **kiểu `DynamicResultExtensionArgs` có thật trong runtime đã cài**, nhưng *"đè được trường vô hướng có sẵn"* và *"thắng ở mọi đường đọc"* thì **chưa ai chạy thử**.
- **Bằng chứng:**
  - `[QS]` `package.json:53` (`"@prisma/client": "^5.22.0"`) · `:129` (`"prisma": "^5.22.0"`).
  - `[QS]` `node_modules/@prisma/client/runtime/library.d.ts:1006-1014` — `/** Result */ export declare type DynamicResultExtensionArgs<…> = { [K]: { [P]?: { needs?…; compute(data): any } } }` ⇒ API **tồn tại**; **không** có ràng buộc kiểu nào nói cấm trùng tên cột.
  - `[QS]` 4 chỗ `$extends` thật trong repo **đều là `query:`**: `lib/db.ts:66` · `lib/db-scope.ts:303` · `lib/db-scope.ts:365` · `lib/portal/db.ts:146` (khớp `01-intended:120` — *"4/4 `$extends` đều hook `query:`, **0 hook `result:`**"*).
  - `[QS]` `lib/db-scope.ts:275-293` — `findUniqueScoped` **chèn `centerId` rồi strip** ⇒ có một đường đọc **đã biến đổi shape**, phải nằm trong bộ ca thử.
  - `[QS]` `02-prd:357-358` — *"chưa có bằng chứng `result:` đè được trường vô hướng có sẵn"* → `R-TECH-01` là **điều kiện mở thẻ** cho `R-D4-06` (1 test).
- **Mã `R-*` bị chặn:** `R-TECH-01` · `R-D4-06`.
- **Cách kiểm rẻ nhất:** Đúng `R-TECH-01` nhưng **7 ca**, chạy trên **`scopedDb(actor)`** (KHÔNG chạy trên client trần): khai `result.employee.salaryRank.compute = () => null`, rồi đọc bằng (1) `findMany`, (2) `findUnique` + `select` hẹp **có** `salaryRank`, (3) `findUnique` + `select` **KHÔNG có** `centerId` (đường chèn-rồi-strip), (4) spread `{...record}`, (5) `JSON.stringify`, (6) đọc **lồng** `include: { employee: true }` từ model khác, (7) `$queryRaw`. **Ngưỡng mở thẻ `R-D4-06`: ca 1–6 phải trả `null`**; ca 7 **chắc chắn KHÔNG che được** ⇒ phải kèm **luật cấm `$queryRaw` chạm trường nhạy cảm**.

#### GD-53 — Gán giáo viên vào lớp là cửa cấp phạm vi thứ hai

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 7 | Risk 4.0 | Ô LÀM_LUÔN | Cờ 1 CÓ | Cờ 2 CÓ

- **Phát biểu:** Phạm vi dữ liệu **chỉ đến từ `UserOrgRole`**, nên nguyên tắc `R-D3-11` (*"phân công KHÔNG tự sinh quyền"*) **khoá được mọi đường**.
- **Nếu SAI thì sao:** Đặt `Class.teacherId`/`assistantId` **tự nạp `assignedClassIds` vào Actor**, và với scope `CLASS`/`ASSIGNED` thì đó là **điều kiện DUY NHẤT** — người có `UserOrgRole` ở cơ sở A **vẫn thoả điều kiện** cho lớp ở cơ sở B. `R-D3-11` nghiệm thu **xanh** (test của nó chỉ đo `visibleCenterIds`) trong khi đường ownership **vẫn mở qua ô chọn GV**. Hệ quả cụ thể nhất ở **học liệu**: GV hết đợt **vẫn mở được gói SCORM của lớp cũ**.
- **Độ tin:** THẤP rằng giả định đúng — **cả hai cửa (Actor và cổng SCORM) đã đọc trực tiếp trong mã**.
- **Bằng chứng:**
  - `[QS]` `lib/auth/actor.ts:204-205` — `assignedClassIds` nạp từ `db.class.findMany({ where: { deletedAt: null, OR: [{teacherId}, {assistantId}] } })`; `:181` gói vào Actor.
  - `[QS]` `lib/auth/can.ts:27-29` — `case "CLASS": case "ASSIGNED": return !!target?.classId && actor.assignedClassIds.has(target.classId)` ⇒ **không kiểm cơ sở**.
  - `[QS]` `lib/auth/lms-scope.ts:33` — `canManageClass` **có** `passesScope("Class", …)` (`:32`) ⇒ đường này **chặn được** — chính chỗ khác biệt.
  - `[QS]` `lib/scorm/access.ts:30-41` — `isAssignedTeacher` **không** kiểm cơ sở lẫn vai trò.
  - `[QS]` `prisma/seed-roles.ts:466` (`attendance:mark` scope `CLASS`, vai trò `TEACHER`) · `:519` (`attendance:view` scope `ASSIGNED`, vai trò `ASSISTANT_TEACHER`).
  - `[QS]` `01-intended:217` — *"nguồn ở đây là **trường `teacherId` trên `Class`**, không phải `UserOrgRole` — **không văn bản nào nối hai thứ**"* (lỗ hổng **không mã `R-*` nào nhận**).
  - `[QS]` `02-prd:226` (`R-D3-11`, nghiệm thu chỉ đo `visibleCenterIds`) · `:261` (`R-D8-04`).
- **Mã `R-*` bị chặn:** `R-D3-11` · `R-D3-10` · `R-D3-07` · `R-D8-04` · `R-D4-05`.
- **Cách kiểm rẻ nhất:** Staging: lấy 1 user **CÓ** `UserOrgRole` tại CS2 nhưng **KHÔNG** có dòng nào tại CS1, gán làm `teacherId` một lớp CS1, rồi thử **3 đường**: (a) action scope `CLASS`/`ASSIGNED` (`attendance:mark`, `attendance:view`), (b) `canManageClass`, (c) mở gói SCORM của buổi lớp đó. **Ngưỡng: 3/3 từ chối.** Dự đoán: (b) từ chối do `passesScope`; (a) và (c) **qua** ⇒ bổ sung yêu cầu **gỡ `teacherId`/`assistantId` khi thu hồi nguồn**, và siết `isAssignedTeacher` theo `R-D8-04`.

#### GD-66 — Dữ liệu của bên NHẬN tách được ra để bàn giao

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn B | Impact 7 | Risk 3.6 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Dữ liệu *"của chính bên NHẬN"* **tách được** khỏi CSDL chung để dựng gói bàn giao (`R-D9-11`) — **kể cả tệp đính kèm**, không chỉ bản ghi trong DB.
- **Nếu SAI thì sao:** Gói bàn giao thiếu đúng phần **khó thay thế nhất** — **tệp** (ảnh, minh chứng thanh toán, học liệu đã nộp). Bản ghi DB tách được bằng JOIN nhưng **tệp thì không**, nên nghĩa vụ *"trả dữ liệu khi chấm dứt"* thực hiện được **một nửa**. Người chịu: bên NHẬN (không có minh chứng khi bị kiểm tra), HO (vi phạm nghĩa vụ hợp đồng).
- **Độ tin:** TRUNG BÌNH — **phần DB đã kiểm chứng là tách được** (qua quan hệ), phần **tệp** là chỗ hỏng thật và đã được PRD tự khai.
- **Bằng chứng:**
  - `[QS]` `prisma/schema.prisma:4954-4970` — `Receipt` **KHÔNG có** `centerId`/`orgUnitId`, **NHƯNG** `enrollmentId` (`:4957`) là **BẮT BUỘC** ⇒ lọc được qua `enrollment → class`.
  - `[QS]` `prisma/schema.prisma:3184-3200` — `OrderInstallment` không có trường đơn vị, nhưng có `orderId` (`:3186`) ⇒ đi qua `Order.centerId`.
  - `[QS]` `lib/db-scope.ts:72-74` — chú thích: `RefundRequest` scope **QUA QUAN HỆ** `enrollment → class`; `centerId` chỉ là **ảnh chụp nullable** ⇒ **tách được**, không phải *"ngoài vùng cách ly"*.
  - `[QS]` `lib/db-scope.ts:11-37` — `SCOPED_MODELS` **không có** `Receipt` ⇒ tách được nhưng **phải viết tay**, không tự động.
  - `[QS]` `02-prd:346` (`R-DP-06` — khoá tệp R2 chia theo **LOẠI file**, **không** theo đơn vị: **đây mới là chỗ KHÔNG tách được**) · `:80` (KR4) · `:289` (`R-D9-11`).
- **Mã `R-*` bị chặn:** `R-D9-11` · `R-DP-06` · `R-DP-07` · `R-D10-06`.
- **Cách kiểm rẻ nhất:** Chọn CS2, dựng **bản kê gói bàn giao** bằng truy vấn read-only cho **8 nhóm**: học viên · ghi danh · điểm danh · đơn hàng · khoản thu · phiếu thu · hoàn tiền · **tệp R2**. Ghi rõ nhóm nào phải đi qua JOIN và nhóm nào **KHÔNG lọc được**. **Ngưỡng: nhóm tệp R2 không ra được danh sách bằng một lệnh ⇒ `R-D9-11` phụ thuộc CỨNG vào `R-DP-06` (cỡ L)** — phải nêu phụ thuộc này trong bảng, **hiện chưa có**.

#### GD-55 — Mỗi cơ sở có đúng một hợp đồng hiệu lực tại một thời điểm

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 7 | Risk 3.5 | Ô LÀM_LUÔN | Cờ 1 chưa rõ | Cờ 2 KHÔNG

- **Phát biểu:** Một đơn vị của bên NHẬN chỉ có **đúng MỘT** hợp đồng `ACTIVE` tại một thời điểm, nên *"hợp đồng phủ node"* và *"cắt theo `contractId`"* là phép toán **không nhập nhằng**.
- **Nếu SAI thì sao:** Gia hạn **ký trước ngày hết hạn** là chuyện bình thường → **hai hợp đồng `ACTIVE` chồng kỳ**. Khi đó: (a) tính phí lấy `feeRate` nào cho kỳ chồng lấn — **không có quy tắc**; (b) `R-D9-05` `revokeByContract(contractId)` cắt theo **một** hợp đồng sẽ **ĐỂ LỌT** các `UserOrgRole` do hợp đồng kia sinh, mà nghiệm thu *"cả 20 dòng EXPIRED"* **vẫn xanh** vì chỉ đếm trong phạm vi hợp đồng đó. Người chịu: HO — **tưởng đã cắt sạch quyền nhưng còn đường ghi**; và tranh chấp số phí kỳ chồng lấn.
- **Độ tin:** THẤP rằng giả định đúng — nhưng đây là **[SD]** về hành vi ký kết, không phải quan sát mã: `FranchiseContract` **chưa tồn tại**, nên chỉ suy được từ chỗ thiếu ràng buộc trong đặc tả.
- **Bằng chứng:**
  - `[QS]` `02-prd:278` — `R-D9-01` liệt kê trường của `FranchiseContract`, **không có ràng buộc duy nhất** theo `(franchiseeOrgId, khoảng hiệu lực)`.
  - `[QS]` `02-prd:281` — `R-D9-04`: *"từ chối cấp vai trò khi không có hợp đồng `ACTIVE` **phủ node**"* — **số ít**, không nói xử lý khi có nhiều.
  - `[QS]` `02-prd:282` — `R-D9-05`: `revokeByContract(contractId, reason)`, nghiệm thu đếm **20 dòng** trong phạm vi **một** hợp đồng.
  - `[QS]` `prisma/schema.prisma:355-370` — `UserOrgRole` **chưa có trường nối tới hợp đồng nào sinh ra nó** ⇒ có 2 hợp đồng thì **không truy ngược được**.
  - `[QS]` grep `FranchiseContract` trong `prisma/schema.prisma` = **0 hit** ⇒ chưa xây, **sửa bây giờ miễn phí**.
- **Mã `R-*` bị chặn:** `R-D9-01` · `R-D9-04` · `R-D9-05` · `R-D9-09` · `R-D3-01`.
- **Cách kiểm rẻ nhất:** Không cần dữ liệu: **1 câu hỏi nghiệp vụ + 1 ca kiểm** thêm vào bộ `R-D9-05` — tạo **2 hợp đồng `ACTIVE` chồng kỳ** trên cùng một node, cấp quyền từ **cả hai**, rồi gọi `revokeByContract` cho hợp đồng thứ nhất. **Ngưỡng: còn > 0 `UserOrgRole` `ACTIVE` ⇒ `R-D9-01` phải thêm ràng buộc loại trừ chồng kỳ (hoặc `R-D9-05` phải cắt theo NODE chứ không theo hợp đồng).**
- **Câu hỏi cho Ban:** Khi gia hạn, hợp đồng mới ký **trước** ngày hợp đồng cũ hết hạn có được **cùng `ACTIVE`** không? Nếu có, **kỳ chồng lấn tính phí theo tỉ lệ nào**?

#### GD-71 — Phân loại được nguồn cho các dòng quyền đang có

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 7 | Risk 3.2 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Backfill `derivedFromType` NOT NULL **suy được nguồn thật** cho các dòng `UserOrgRole` hiện hữu.
- **Nếu SAI thì sao:** Các dòng đó do **kịch bản go-live** sinh ra từ `User.role`/`roles[]` + `User.centerId` (fallback **đuôi email** `.cs1@`/`.cs2@`), **không gắn** với hợp đồng, đợt điều động hay quyết định biên chế nào — và kịch bản còn **cố ý KHÔNG sửa `User.centerId`** nên cũng không để lại dấu vết truy ngược. Toàn bộ dòng cũ rơi vào **`MANUAL`** ⇒ tác vụ nền `R-D3-08` quét theo `derivedFrom` **không chạm dòng nào** ⇒ *"nguồn mất thì quyền mất"* **chỉ đúng với nhân sự tuyển sau ngày triển khai**, vô hiệu với **toàn bộ nhân sự hiện hữu**. Nghiệm thu `R-D3-01` (*"0 dòng NULL"*) **vẫn xanh** nên không ai phát hiện.
- **Độ tin:** THẤP rằng giả định đúng — **nguồn gốc các dòng hiện có đã đọc trực tiếp trong kịch bản patch**.
- **Bằng chứng:**
  - `[QS]` `prisma/patch-rbac-staff.ts:14-15` — *"Cơ sở suy từ `User.centerId`; **fallback đuôi email `.cs1@`/`.cs2@`**"* · `:17-18` — *"**KHÔNG sửa `User.centerId`**"*.
  - `[QS]` `prisma/patch-rbac-staff.ts:97-103` — `const emailCenter = /\.cs([12])@/.exec(u.email)?.[1]` rồi suy `orgByCode.get("CS"+emailCenter)`.
  - `[QS]` `prisma/schema.prisma:355-370` — `UserOrgRole` **không có** `derivedFromType`/`derivedFromId`; `01-intended:119` — *"**`derivedFrom` = 0 hit toàn repo**"*.
  - `[QS]` `02-prd:216` (`R-D3-01` — nghiệm thu *"Sau backfill: 0 dòng NULL"*) · `:223` (`R-D3-08` quét **theo `derivedFrom`**).
- **Mã `R-*` bị chặn:** `R-D3-01` · `R-D3-08` · `R-D3-12`.
- **Cách kiểm rẻ nhất:** **Chỉ-đọc trên prod:** phân loại từng dòng `UserOrgRole` theo khả năng suy nguồn — có `PRIMARY` assignment tới đúng `orgUnitId` (**EMPLOYMENT**) / có phân công khác tới node đó (**ASSIGNMENT**) / **không suy được**. **Ngưỡng: nhóm "không suy được" > 30% ⇒ `R-D3-08`/`R-D3-12` không có tác dụng thực tế** → chèn bước **gán nguồn thủ công có người ký** trước khi mở làn B2.

#### GD-57 — Mỗi dòng quyền chỉ mang được đúng một nguồn

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 7 | Risk 2.8 | Ô LÀM_LUÔN | Cờ 1 CÓ | Cờ 2 CÓ

- **Phát biểu:** Một bản ghi `UserOrgRole` chỉ có **một** nguồn phái sinh nên `derivedFromType`/`Id` là **cặp trường đơn**.
- **Nếu SAI thì sao:** Khoá chính là `(userId, orgUnitId, roleId)` — **cùng vai trò tại cùng đơn vị đến từ hai nguồn** (biên chế + đợt điều động, hoặc kiêm nhiệm + hợp đồng nhượng quyền) **không lưu được thành hai dòng**, và đường cấp là **upsert** nên **nguồn sau ghi đè nguồn trước**. `revokeUserOrgRolesBySource` khi đó cắt **sai tập**: hết đợt điều động **cắt luôn quyền biên chế** (mất quyền oan, người đang làm bị khoá giữa ngày), hoặc cắt hợp đồng nhưng dòng đã bị ghi đè nguồn nên **sót** (`R-D9-05` báo `revokedCount` thiếu). Tiêu chí *"đúng 1 `updateMany`, đúng 1 dòng audit"* **vẫn xanh** vì nó đếm **câu truy vấn**, không đếm **đúng-sai tập**.
- **Độ tin:** THẤP rằng giả định đúng — **khoá 3 trường đã đọc trực tiếp trên schema**.
- **Bằng chứng:**
  - `[QS]` `prisma/schema.prisma:355-370` — `UserOrgRole`; `:366` — `@@id([userId, orgUnitId, roleId])` ⇒ **không có `id` riêng**, không lưu được 2 dòng cùng bộ ba.
  - `[QS]` `lib/auth/actor.ts:188-196` — `resolveActorUncached` đọc theo `status: "ACTIVE"` + khoảng hiệu lực; không có khái niệm "nguồn".
  - `[QS]` `02-prd:216` (`R-D3-01`) · `:217` (`R-D3-02` — nghiệm thu đếm **1 `updateMany`**, **1 dòng audit**) · `:282` (`R-D9-05` — `revokedCount=20`).
  - `[QS]` `01-intended:119` — `UserOrgRole` *"✅ đúng hình (**khoá 3 trường**…)"* — chính chỗ "đúng hình" này là ràng buộc chặn.
- **Mã `R-*` bị chặn:** `R-D3-01` · `R-D3-02` · `R-D9-04` · `R-D9-05`.
- **Cách kiểm rẻ nhất:** Truy vấn **chỉ-đọc** đếm số bộ ba `(userId, orgUnitId, roleId)` thoả **đồng thời > 1 nguồn hợp lệ** (có `PRIMARY` assignment tới node đó **VÀ** có phân công khác còn hiệu lực tới node đó). **Ngưỡng: > 0 nhóm ⇒ phải đổi khoá (thêm `id` + unique có điều kiện) TRƯỚC khi làm `R-D3-01`**, không vá sau.

#### GD-67 — Một hợp đồng phủ đúng một cơ sở nên tiền cộng phẳng được

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn B | Impact 7 | Risk 2.8 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Một hợp đồng nhượng quyền phủ **đúng một** cơ sở, nên tổng căn cứ tính phí **cộng phẳng theo `Payment.centerId`** là đủ — **không cần gộp theo nhánh cây**.
- **Nếu SAI thì sao:** Bên NHẬN mở **cơ sở thứ hai dưới cùng hợp đồng** (chính `R-D9-12` đã dự liệu) → doanh thu nằm ở **nhiều `centerId`**, mà `OrgUnit` **không có cột đường dẫn** nên **không cộng theo nhánh bằng một truy vấn**. `R-D10-12` hoặc phải viết lại theo **danh sách cơ sở của hợp đồng**, hoặc phải **thêm cột đường dẫn** — cả hai đều là việc **chưa ai nhận**. Người chịu: kế toán tổng hợp HO **cộng tay** nhiều cơ sở cho một hoá đơn phí.
- **Độ tin:** THẤP rằng giả định đúng — **thiếu cột đường dẫn đã kiểm chứng trên schema**; phần *"một hợp đồng có phủ nhiều cơ sở không"* là **[SD]** chờ Ban.
- **Bằng chứng:**
  - `[QS]` `02-prd:290` — `R-D9-12`, ví dụ điều khoản kiểm được: *"**chặn tạo cơ sở thứ N+1 dưới cùng hợp đồng**"* ⇒ 1 hợp đồng **có thể** phủ nhiều cơ sở.
  - `[QS]` `02-prd:302` — `R-D10-12`: *"Phạm vi tính phí = theo hợp đồng (mọi lớp chạy trong đơn vị nhượng quyền)"* — **không nói gộp nhánh thế nào**.
  - `[QS]` `prisma/schema.prisma:4941` — `Payment.centerId` (khoá **phẳng** theo `Center`, không theo `OrgUnit`).
  - `[QS]` `prisma/schema.prisma:295-313` — `OrgUnit` chỉ có `parentId` (`:301`), **KHÔNG có cột đường dẫn/path** ⇒ cộng theo nhánh phải **duyệt đệ quy**; `:304` — `centerId @unique`, chỉ node `type=CENTER` mới có.
  - `[QS]` `02-prd:433` — B4 = `R-D2-09 → R-D2-10 → R-D2-11` *(materialized path)* — tức cột đường dẫn **nằm ở làn B**, sau cửa sổ shadow.
- **Mã `R-*` bị chặn:** `R-D9-12` · `R-D10-12` · `R-D10-06` · `R-D9-09`.
- **Cách kiểm rẻ nhất:** **Câu hỏi thiết kế, kiểm bằng giấy**: viết ra công thức tổng căn cứ tính phí cho **một hợp đồng phủ 2 cơ sở**, chỉ dùng các cột **đang có**. **Ngưỡng: nếu công thức cần duyệt cây đệ quy hoặc cần một cột chưa tồn tại ⇒ bổ sung vào `R-D10-06` (hiện chỉ phủ `Payment`/`Receipt`) hoặc chốt `R-D10-12` theo "danh sách cơ sở khai trong hợp đồng"** trước khi làm pha A6.
- **Câu hỏi cho Ban:** Một hợp đồng nhượng quyền có được **phủ nhiều cơ sở** không? Nếu có, phí tính **gộp cả hợp đồng** hay **riêng từng cơ sở**?

#### GD-75 — Đổi che trường từ vai trò sang actor chỉ siết, không nới

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Thiết kế | Làn B | Impact 7 | Risk 2.4 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** `R-D4-07` (`getEmployeeFieldVisibility` nhận `Actor` thay vì vai trò) là một bước **SIẾT** — **không ai đang bị che sẽ được mở thêm**.
- **Nếu SAI thì sao:** Các call-site hiện truyền `session.user.role` — **vai trò CHÍNH, số ít**. Bản thân hàm **ĐÃ hợp khi nhận mảng** (`roles.some`), và quy ước hệ thống là quyền = **HỢP** của `roles[]`. Người có `roles = [TEACHER, HR]` với vai trò chính `TEACHER` hiện **KHÔNG** thấy lương; chuyển sang `Actor`/`roles[]` họ **SẼ thấy**. Đây là **nới quyền xem lương phát sinh im lặng** trong một thay đổi gắn nhãn *"siết"*. Nghiệm thu `R-D4-07` chỉ có 2 ca `HR@CS1` nên **không bắt được**. Nặng thêm: `R-D4-07` **gộp hai chiều ngược nhau vào một mã** — đúng loại chu trình mà `02-prd:366` đã phải cắt một lần cho `R-D3-10`.
- **Độ tin:** THẤP rằng giả định đúng — **cả hai vế (call-site truyền số ít, hàm đã hợp mảng) đã đọc trực tiếp trong mã**.
- **Bằng chứng:**
  - `[QS]` `lib/auth/permissions.ts:686-700` — `getEmployeeFieldVisibility(roleOrRoles)` chuẩn hoá về **mảng** rồi `any(allowed) = roles.some(...)` (`:700`); `:703-705` — `contact`/`salary`/`personal` theo tập vai trò.
  - `[QS]` call-site truyền **số ít**: `app/(admin)/admin/nhan-su/page.tsx:151` · `app/(admin)/admin/nhan-su/[id]/edit/page.tsx:145` · `app/(admin)/admin/nhan-su/actions.ts:224` (`getEmployeeFieldVisibility(session.user.role)`).
  - `[QS]` `lib/auth/permissions.ts:625` — *"Đa vai trò: quyền = **HỢP (union)** — true nếu BẤT KỲ vai trò nào được phép"* ⇒ quy ước hệ thống **ngược** với cách call-site đang gọi.
  - `[QS]` `02-prd:366` — chu trình `R-D3-10`/`R-D8-10` đã bị cắt vì đúng kiểu "hai hướng ngược nhau trong một hàm gác".
- **Mã `R-*` bị chặn:** `R-D4-07` · `R-D4-08` · `R-OPS-02`.
- **Cách kiểm rẻ nhất:** Truy vấn **read-only**: đếm `User` có **≥2** phần tử trong `roles` mà tập `roles` **chứa** `HR`/`ACCOUNTANT`/`SUPER_ADMIN` trong khi `role` (chính) **thì không**. **Ngưỡng: > 0 người ⇒ `R-D4-07` phải tách làm hai mã** (siết-theo-cơ-sở và đổi-nguồn-vai-trò), kèm **bảng trước–sau *"ai được mở thêm quyền xem lương"* có chữ ký HR** — đúng khuôn `R-OPS-02`.
- **Câu hỏi cho Ban:** Khi một người **kiêm nhiều vai trò**, quyền **xem lương** lấy theo **vai trò chính** hay theo **hợp các vai trò**?

#### GD-64 — Mọi giáo viên thật đều đã có vai trò giảng dạy trong sổ phân quyền

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 7 | Risk 2.4 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** **100%** người đang đứng tên giáo viên/trợ giảng của lớp **đều đã có** bản ghi `UserOrgRole` vai trò giảng dạy còn hiệu lực, nên siết ĐK(1) (*"phải còn giữ vai trò giảng dạy"*) **không cắt nhầm ai**.
- **Nếu SAI thì sao:** Ngày bật `R-D8-04`, mọi giáo viên chưa được gán `UserOrgRole` **mất quyền mở slide đồng loạt** — không phải một người mà **cả nhóm**, phát hiện **vào đúng giờ lên lớp**. Nguy hiểm gấp đôi vì cổng vào site giáo viên đọc vai trò **từ phiếu đăng nhập**, không đọc sổ phân quyền, nên họ **VẪN vào được site**, chỉ nội dung là 403 → **triệu chứng khó chẩn**. Người chịu: giáo viên + Công nghệ (xử lý sự cố nóng).
- **Độ tin:** TRUNG BÌNH — **khoảng lệch JWT ↔ `UserOrgRole` đã kiểm chứng**; số người thiếu thì chưa đếm, và **chưa chốt được danh sách mã vai trò giảng dạy** nên chưa đếm được.
- **Bằng chứng:**
  - `[QS]` `lib/scorm/access.ts:30-41` — `isAssignedTeacher` **hiện KHÔNG đọc `orgRoles`**, chỉ so `userId`.
  - `[QS]` `app/(teacher)/teacher/layout.tsx:47` — `hasRole(session.user, "TEACHER")` = **đọc phiếu đăng nhập**, không đọc `UserOrgRole`.
  - `[QS]` `lib/auth/check-permission.ts:31-35` + `lib/auth/can.ts:58-62` — cổng SCORM (`getEffectivePermissions`) **không đi qua lõi ghi shadow-diff**.
  - `[QS]` `01-intended:98` — ghi nhận đúng khoảng lệch: *"GV đã hết hiệu lực `UserOrgRole` mà tài khoản còn `isActive` + `roles` chứa `TEACHER` (cổng vào site GV gác bằng `hasRole(session.user, "TEACHER")` — đọc **JWT**)"*.
  - `[QS]` `02-prd:261` — `R-D8-04` nghiệm thu *"`orgRoles` rỗng → **false**"* · `:272` — `R-CONST-01` **yêu cầu** hằng số danh sách mã vai trò giảng dạy nhưng **CHƯA liệt kê mã nào**.
- **Mã `R-*` bị chặn:** `R-D8-04` · `R-CONST-01` · `R-D8-14` · `R-QDB-06`.
- **Cách kiểm rẻ nhất:** **Một câu SQL read-only** chạy được hôm nay — nhưng **chỉ chạy được SAU khi Ban chốt danh sách mã vai trò giảng dạy (`R-CONST-01`)**, nên chốt danh sách là **việc số 0**: đếm `User` đang là `teacherId` **hoặc** `assistantId` của ≥1 `Class` chưa xoá mềm mà **KHÔNG** có `UserOrgRole` `ACTIVE`, còn trong hạn, mã vai trò thuộc danh sách đó. **Ngưỡng: phải = 0 trước ngày bật `R-D8-04`; > 0 thì con số đó chính là số giáo viên sẽ mất quyền** — **vá sổ phân quyền trước**, không bật trước rồi vá sau.
- **Câu hỏi cho Ban:** Danh sách mã vai trò được coi là *"vai trò giảng dạy"* (`R-CONST-01`) gồm những mã nào — **`TRAINING` có nằm trong đó không**? Không có danh sách thì **cả phép đếm lẫn tiêu chí nghiệm thu đều không chạy được**.

#### GD-68 — Tác vụ nền chạy một danh tính toàn cục vẫn chấp nhận được

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn B | Impact 7 | Risk 2.4 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Các tác vụ nền tiếp tục chạy bằng **một danh tính hệ thống có phạm vi toàn cục** là **chấp nhận được** sau khi trong cùng CSDL có **pháp nhân thứ hai**.
- **Nếu SAI thì sao:** Đúng những mã **cắt quyền và thu hồi hợp đồng** — `R-D3-08` (một tác vụ nền duy nhất quét quá hạn; `R-D9-07` đã gộp vào đây) — sẽ được thi hành bằng **một tiến trình có toàn quyền trên cả hai pháp nhân**: không actor, không audit theo người, không phạm vi. Đó chính là **đường thoát phạm vi mà D10 và cách ly cơ sở đang cố đóng**. Thêm nữa, **xử lý theo lô tuần tự** nghĩa là một lỗi phát sinh ở dữ liệu pháp nhân này **chặn luôn việc của pháp nhân kia** trong cùng lô.
- **Độ tin:** TRUNG BÌNH — **cơ chế cron không actor đã kiểm chứng bằng mã**; phần *"Ban muốn tách theo pháp nhân hay không"* là câu chưa trả lời.
- **Bằng chứng:**
  - `[QS]` `app/api/cron/dispatch-events/route.ts:9-12` — `verifyCronAuth(req)` (`:10`) chỉ kiểm **bí mật dùng chung**, **không actor, không phạm vi**; `:14-15` reap + dispatch trong **cùng một request**.
  - `[QS]` `app/api/cron/retention-scan/route.ts:8-13` — quét lưu trữ **toàn hệ thống**, không phạm vi đơn vị.
  - `[QS]` `vercel.json:3-64` — **15 cron**, mỗi cái chạy **MỘT lần cho toàn hệ thống**: `dispatch-events` (`:20-23`), `order-debt-reminder` (`:36-39`), `retention-scan` (`:48-51`), `parent-request-reminder` (`:52-55`)…
  - `[QS]` `00-baseline.md:123` — batch **50**, xử lý **tuần tự**; reap và dispatch trong cùng một request.
  - `[QS]` `QUYET-DINH.md:114` — câu treo số 6: *"**Job nền chạy với danh tính gì, phạm vi gì** — cron chạy một lần cho cả tập đoàn hay một lần cho mỗi pháp nhân?"* — **chưa trả lời** · `03-job-stories.md:881` (a6 — *"**bốn story dựa hoàn toàn vào tác vụ nền**"*, **không có trong 15 câu của `02-prd`**).
  - `[QS]` `02-prd:223` (`R-D3-08`) · `:285` (`R-D9-07` — **đã GỘP** vào `R-D3-08`, xem `:475`).
- **Mã `R-*` bị chặn:** `R-D3-08` · `R-D9-05` · `R-DP-03` · `R-D4-11`.
- **Cách kiểm rẻ nhất:** Hai phép đo trên mã và hành vi: (1) liệt kê handler/cron có lệnh **GHI** vào model mang `centerId` mà **không kèm điều kiện đơn vị** — đếm số điểm (bắt đầu từ 15 route ở `vercel.json:4-63`); (2) gieo **một sự kiện lỗi thuộc cơ sở B** rồi chạy một nhịp cron, xem các sự kiện thuộc **cơ sở A** trong cùng lô 50 có được xử lý không. **Ngưỡng: ≥1 điểm ghi xuyên pháp nhân, hoặc lô dừng vì một pháp nhân ⇒ phải chốt kiến trúc tác vụ nền TRƯỚC khi viết `R-D3-08`.**
- **Câu hỏi cho Ban:** Ứng câu treo số 6 (`QUYET-DINH.md:114`) và **a6** của BƯỚC 3 (`03-job-stories.md:881`): tác vụ nền chạy **một lần cho cả tập đoàn** hay **một lần cho mỗi pháp nhân**, và nó **ghi vào dữ liệu bên NHẬN dựa trên căn cứ uỷ quyền nào**?

#### GD-52 — Khoá `parentId` trong seed là đủ để bảo vệ cây do vận hành sửa

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A | Impact 7 | Risk 2.4 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** `R-OPS-01` (*"kịch bản seed không được ghi `parentId` cho node đã tồn tại"*) là **đủ** để cây tổ chức do người vận hành chỉnh qua màn hình mới **không bị kịch bản seed ghi đè**.
- **Nếu SAI thì sao:** Khối `update` của `seedOrgUnits` **ghi đè tất cả**: `type`, `name`, `address`, `parentId`, `centerId`, và đặt `isActive: true`, `deletedAt: null`. Chỉ khoá `parentId` thì node đã **xoá mềm** theo `R-D2-04` **vẫn bị HỒI SINH**, tên/địa chỉ vận hành vừa sửa **vẫn bị trả về hằng số trong mã**, và **không có dòng audit nào** vì seed **không đi qua service**. Vì đây là **đường ghi `OrgUnit` duy nhất đang chạy** và được kịch bản vá RBAC gọi lại, hỏng sẽ **tái diễn mỗi lần vận hành hệ thống**, không phải một lần.
- **Độ tin:** THẤP rằng giả định đúng — **khối `update` ghi đè 6 trường đã đọc trực tiếp**.
- **Bằng chứng:**
  - `[QS]` `prisma/seed-orgunit.ts:50-54` — `update: { type, name, address, parentId: root.id, centerId, isActive: true, deletedAt: null }` (`:52`) ⇒ **hồi sinh node đã xoá mềm**; `:33-38` — khối `update` của ROOT cũng vậy; `:23-27` — giá trị `name`/`address` là **hằng số trong mã**.
  - `[QS]` `lib/org/org-service.ts:163-183` — `softDeleteOrgUnit` đặt `deletedAt` + `isActive: false` (`:180`) ⇒ **đúng hai trường bị seed đặt lại**.
  - `[QS]` `prisma/patch-rbac-staff.ts:54-55` — `seedOrgUnits(db)` được gọi ở nhánh `APPLY`; `.github/workflows/patch-rbac-staff.yml:19-27` — bấm tay lên prod.
  - `[QS]` `02-prd:321` (`R-OPS-01` — nghiệm thu **chỉ** kiểm `parentId` không đổi) · `:167` (`R-D2-04` — xoá mềm bắt buộc lý do + audit; seed **không có cả hai**).
- **Mã `R-*` bị chặn:** `R-OPS-01` · `R-D2-03` · `R-D2-04` · `R-D2-05` · `R-D2-19`.
- **Cách kiểm rẻ nhất:** Một test tích hợp rẻ, thêm vào **đúng thẻ `R-OPS-01`**: sửa tên + địa chỉ CS2 qua service, chuyển CS2 xuống một node vùng, xoá mềm một node lá, rồi chạy `seedOrgUnits` **HAI lần** và so **5 trường** (`parentId`, `name`, `address`, `isActive`, `deletedAt`) trước/sau. **Ngưỡng: 0 trường thay đổi.** Có trường đổi ⇒ `R-OPS-01` phải đổi cách phát biểu thành *"seed chỉ được **tạo node còn thiếu**, tuyệt đối **không update** node đã tồn tại"*.

#### GD-73 — Hồ sơ nhân sự luôn nối được tới tài khoản

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 7 | Risk 2.1 | Ô LÀM_LUÔN | Cờ 1 CÓ | Cờ 2 CÓ

- **Phát biểu:** Cho một nhân viên nghỉ việc, hệ thống **tìm được tài khoản** của họ để cắt quyền (điều kiện để `R-D3-12` chạy).
- **Nếu SAI thì sao:** Liên kết `Employee ↔ User` là **trường tuỳ chọn**, **xoá hồ sơ thì tự đặt null**, người tạo tài khoản **có thể bỏ trống**, và nhiều tài khoản thật được lập **trước khi** có hồ sơ nhân sự. Tác vụ `R-D3-12` chạy **xanh**, báo *"đã xử lý N nhân viên nghỉ việc"*, nhưng những người **không có liên kết** thì **không có `UserOrgRole` nào bị cắt** — **im lặng, không lỗi, không dòng audit nào cho thấy đã bỏ sót**. Đúng nhóm rủi ro cao nhất: **người đã rời tổ chức mà tài khoản còn sống**.
- **Độ tin:** THẤP rằng giả định đúng — **tính tuỳ chọn của liên kết đã đọc trực tiếp trên schema**; tỉ lệ thiếu thì phải đếm.
- **Bằng chứng:**
  - `[QS]` `prisma/schema.prisma:738-739` — `employeeId String? @unique` + `employee Employee? @relation(..., onDelete: SetNull)` ⇒ **nullable** và **tự null khi xoá hồ sơ**.
  - `[QS]` `app/(admin)/admin/users/_actions.ts:252` — `employeeId: parsed.data.employeeId ?? null` ⇒ **cho phép bỏ trống** khi tạo/sửa tài khoản.
  - `[QS]` `02-prd:227` — `R-D3-12`: *"Đặt nhân viên `INACTIVE`/kết thúc `PRIMARY` → mọi `UserOrgRole` `derivedFromType=EMPLOYMENT` **của người đó** `EXPIRED`"* — giả định ngầm là **tìm được người đó**.
  - `[QS]` `02-prd:216` (`R-D3-01`) · `:223` (`R-D3-08`).
- **Mã `R-*` bị chặn:** `R-D3-12` · `R-D3-01` · `R-D3-08`.
- **Cách kiểm rẻ nhất:** **Chỉ-đọc trên prod, hai phép đếm**: (a) số `User` có ≥1 `UserOrgRole` `ACTIVE` mà `employeeId = null`; (b) số `Employee` `ACTIVE` **không có** `User` nào trỏ tới. **Ngưỡng: (a) = 0 thì `R-D3-12` mới phủ hết; (a) > 0 ⇒ tác vụ nền phải báo cáo danh sách "không nối được" như một ĐẦU RA BẮT BUỘC**, và phải chốt quy tắc bổ sung liên kết trước khi mở làn B2.
- **Câu hỏi cho Ban:** Mỗi tài khoản nhân sự có **bắt buộc** phải nối tới một hồ sơ nhân viên không? Nếu không, **cắt quyền theo nguồn biên chế dựa vào đâu**?

#### GD-77 — Mọi buổi học đều nối được tới một bài trong chương trình

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A | Impact 7 | Risk 1.8 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Mọi `ClassSession` đang chạy **đều nối được tới đúng một `Lesson`**, VÀ gói học liệu giáo viên đang mở **luôn thuộc đúng bài đó** — nên điều kiện (3) có thể **fail-closed** mà không chặn buổi hợp lệ nào.
- **Nếu SAI thì sao:** `R-D8-06` (PRD xếp **ưu tiên số 3**, *"bịt một lỗ đang mở"*, cỡ **S**) biến thành **403 hàng loạt GIỮA GIỜ DẠY** theo hai đường: buổi có `lessonId` null **và** `planId` cũng null → **không giải được bài**; hoặc buổi giải ra bài A nhưng gói đang chiếu gắn bài B (khung đổi phiên bản, gói dùng chung) → **lệch**. Người chịu: giáo viên + lớp đang học.
- **Độ tin:** TRUNG BÌNH — **hai đường nối song song và thiếu mệnh đề nối gói↔bài đã kiểm chứng bằng mã**; tỉ lệ buổi hỏng thì phải đếm.
- **Bằng chứng:**
  - `[QS]` `prisma/schema.prisma:1448` — `ClassSession.lessonId String?` (**nullable**); `:1450-1451` — `planId String?` kèm chú thích *"`lessonId` cũ giữ 2-phase"* ⇒ **HAI đường nối song song**.
  - `[QS]` `prisma/schema.prisma:4886` — `ClassSessionPlan.lessonId String?` *"tham chiếu Lesson nguồn (snapshot; **không ràng FK cứng**)"*.
  - `[QS]` `app/api/scorm/runtime/route.ts:107-129` — chỉ kiểm **gói tồn tại** (`:107-113`) + **GV của buổi** (`:127`), **không có mệnh đề nào nối `pkg.lessonId` với buổi**.
  - `[QS]` `01-intended:83` — *"**(3) lớp đó DÙNG chương trình này** — ❌ **Không kiểm trên đường chính**… `packageId` và `sessionId` là **2 tham số độc lập do client cung cấp**"*; cùng lỗ này có ở **trang play**, không chỉ ở route runtime.
- **Mã `R-*` bị chặn:** `R-D8-06` · `R-D8-14` · `R-D10-02`.
- **Cách kiểm rẻ nhất:** **Hai câu SQL read-only**, 90 ngày trước + 90 ngày tới, **tách theo cơ sở**: (a) đếm `ClassSession` có `COALESCE(lessonId, plan.lessonId) IS NULL`; (b) trên `ScormAccessLog` nối buổi, đếm lượt mở mà `ScormPackage.lessonId <> ` bài giải được của buổi — **đây mới là tập `R-D8-06` sẽ chặn thêm**. **Ngưỡng: (a)+(b) > 2% tổng số buổi ⇒ `R-D8-06` phải đi kèm màn dọn dữ liệu + báo cáo tồn đọng (như `R-D10-13`) TRƯỚC khi bật fail-closed.**
- **Câu hỏi cho Ban:** Chốt **một đường nối duy nhất** buổi↔bài là `lessonId` hay `planId` — hiện **hai đường cùng sống**, `R-D8-06` phải bám vào đường nào? Và gói gắn bài **KHÁC** bài của buổi thì **chặn** hay **cho qua có cảnh báo**?

#### GD-49 — Kế thừa cấu hình N tầng là sửa nhỏ trên hàm resolve

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A | Impact 6 | Risk 3.5 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** `R-D6-05` được xếp **cỡ S** (*"sửa cái đã có"*) vì chỉ cần đổi hàm resolve **2 tầng** thành **đi lên theo đường tổ tiên**.
- **Nếu SAI thì sao:** **Ba thứ đi kèm không nằm trong hàm resolve**: (a) giá trị đã resolve được **nhớ đệm theo cặp (khoá, đơn vị) tới 300 giây** và chỉ bị xoá khi **CẤU HÌNH** đổi — đổi **CÂY** (chuyển cơ sở sang vùng khác) **không xoá đệm**, người dùng đọc **giá trị thừa kế cũ mà không ai biết**; (b) đường ghi **chỉ cho người mang vai trò quản lý ĐÚNG tại đơn vị đó**, nên **chưa ai đặt được giá trị ở cấp vùng** ngoài quản trị viên cao nhất; (c) `R-D6-06` thay một **cờ đúng/sai** đang gắn cứng vào **18/45 khoá**. Vẫn ước lượng S ⇒ **pha A8 trượt**, kéo theo `R-D8-07` (cửa sổ mở khoá) vì `R-D8-07` phụ thuộc `R-D6-05`.
- **Độ tin:** THẤP rằng giả định đúng — **cả ba thứ đi kèm đã đọc trực tiếp trong mã**.
- **Bằng chứng:**
  - `[QS]` `lib/settings/resolve.ts:13-28` — resolve **2 tầng phẳng**: `centerRow` (nếu `centerOverridable`) → `globalRow` → `def.default`; **không leo lên cha**.
  - `[QS]` `lib/settings/service.ts:32-46` — `safeCache(..., { tags: [CACHE_TAGS.settings], revalidate: 300 })` ⇒ **đệm 300s**, khoá theo `(key, orgUnitId)` (`:33`); `:49-51` — `clearSettingsCache` chỉ invalidate **tag settings** ⇒ **đổi CÂY không xoá đệm**.
  - `[QS]` `lib/settings/service.ts:138-150` — `setCenterSetting` chỉ cho `isSuperAdmin` **hoặc** người có vai trò quản lý **đúng tại `params.orgUnitId`** (`:140-142`).
  - `[QS]` `lib/settings/registry.ts:44-45` — `centerOverridable: boolean` (**cờ đúng/sai**); đếm lại: **18 `true` / 27 `false` = 45 khoá** (khớp `01-intended:122`).
  - `[QS]` `02-prd:199-201` (`R-D6-05` cỡ **S**, `R-D6-06`, `R-D6-07`) · `:264` (`R-D8-07`, cỡ **L**, phụ thuộc `R-D6-05`) · `:420` (pha A8).
- **Mã `R-*` bị chặn:** `R-D6-05` · `R-D6-06` · `R-D6-07` · `R-D6-14` · `R-D8-07`.
- **Cách kiểm rẻ nhất:** **Nguyên mẫu 1 khoá trên môi trường test, nửa ngày**: đặt giá trị ở node vùng, đọc tại 2 cơ sở con, rồi **CHUYỂN một cơ sở sang vùng khác** và **đọc lại NGAY**. **Nếu giá trị đọc ra vẫn là của vùng cũ ⇒ bài toán là ĐỆM và VÔ HIỆU HOÁ, không phải hàm resolve, và ước lượng S sai.** Ca thứ hai: đăng nhập bằng **quản lý VÙNG** (không phải `SUPER_ADMIN`) và thử đặt một khoá ở cấp vùng — **bị từ chối ⇒ đường ghi cũng phải sửa**, cộng vào ước lượng.

#### GD-74 — Mỗi action chỉ thuộc đúng một họ mô hình quyền

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn chưa rõ | Impact 6 | Risk 3.5 | Ô LÀM_LUÔN | Cờ 1 CÓ | Cờ 2 KHÔNG

- **Phát biểu:** Gán được cho **MỖI** action **đúng một** mô hình (`ORG_TREE`/`RECORD_OWNER`/`CONTENT_TREE`) và bắt CI đỏ khi thiếu — tức **mô hình là thuộc tính của action**, và **ba tên đó phủ hết** cách phân quyền đang dùng.
- **Nếu SAI thì sao:** Dữ liệu đang chạy có `attendance:view` **vừa** ở họ **cây đơn vị** (`GLOBAL` cho Đào tạo, `CENTER` cho Quản lý lớp học) **vừa** ở họ **theo lớp** (`ASSIGNED` cho Trợ giảng) — **một action, hai họ**. Ép một họ: chọn **theo-lớp** thì Quản lý cơ sở **mất báo cáo điểm danh cơ sở mình**; chọn **cây-đơn-vị** thì Trợ giảng **nhìn điểm danh ngoài lớp được gán**. Thêm nữa: `CLASS`/`ASSIGNED` **không ứng với tên nào trong ba tên**, nên `attendance:mark` (scope `CLASS`) **không có ô hợp lệ để khai** ⇒ CI của `R-D4-01` sẽ **đỏ vì thiếu ô**, không phải vì đội quên khai.
- **Độ tin:** THẤP rằng giả định đúng — **bảng scope thật đã đếm trực tiếp trong seed**.
- **Bằng chứng:**
  - `[QS]` `prisma/seed-roles.ts:302` (`attendance:view` scope **GLOBAL**) · `:400` (`attendance:view` scope **CENTER**) · `:473` (`attendance:view` scope **GLOBAL**, vai trò `TEACHER`) · `:519` (`attendance:view` scope **ASSIGNED**, vai trò `ASSISTANT_TEACHER`) · `:466` (`attendance:mark` scope **CLASS**).
  - `[QS]` đếm lại toàn bộ `prisma/seed-roles.ts`: **280 GLOBAL · 18 CENTER · 1 CLASS · 1 ASSIGNED · 1 CHILDREN · 0 OWN** = **301** (khớp bản giả định gốc).
  - `[QS]` `prisma/schema.prisma:345-353` — `RolePermission` khoá `@@id([roleId, action])` (`:351`) ⇒ `scopeType` là thuộc tính của **cặp vai-trò × action**, **không** của action.
  - `[QS]` `lib/auth/actor.ts:28-34` — enum `ScopeType` có **6** giá trị, ba tên mô hình chỉ phủ được một phần.
  - `[QS]` `02-prd:464` — §9 câu 11: *"**`CLASS` và `ASSIGNED`** — gộp làm một hay tách nghĩa thật? Hai tên, một logic (`can.ts:27-29`)"*, chặn `R-D4-05` và điều kiện (2) của D8.
- **Mã `R-*` bị chặn:** `R-D4-01` · `R-D4-05` · `R-D8-09`.
- **Cách kiểm rẻ nhất:** **Miễn phí, không cần DB**: lập bảng *action × tập `scopeType`* từ chính `prisma/seed-roles.ts` (đã đếm ở trên). **Ngưỡng: > 0 action có `scopeType` thuộc HAI họ khác nhau (cây đơn vị vs theo lớp) ⇒ `R-D4-01` phải viết lại thành "mỗi cặp vai-trò × action" HOẶC bổ sung họ thứ tư cho `CLASS`/`ASSIGNED` TRƯỚC khi bật CI.** (Đã có ít nhất 1 ca: `attendance:view`.)

#### GD-69 — Đợt security hardening có phạm vi biết trước và không giẫm chân làn A

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 6 | Risk 3.5 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 chưa rõ

- **Phát biểu:** Đợt security hardening đang chạy **có phạm vi và chủ sở hữu đã biết**, **nhận đúng** các việc PRD chuyển sang, và **không sửa cùng lúc** những file mà làn A sẽ sửa.
- **Nếu SAI thì sao:** Hai đợt sửa **cùng vùng mã không có người điều phối**: làn A **tự khai** đụng đợt hardening ở **A9** (tài liệu giảng dạy/R2) và **một phần A1** (mã chứng từ) — đúng hai chỗ PRD vừa **chuyển việc sang đợt kia**. Hệ quả cụ thể: người này vá `upload-delete`/URL R2 trong khi người kia **đổi tiền tố R2 theo đơn vị** (`R-DP-06`) trên **cùng những cột lưu URL**; hoặc **cả hai cùng tưởng bên kia nhận** *"include lồng không lọc"* + *"soft-delete"* ⇒ **không ai nhận**. Cờ 2 của PRD trở thành **cờ báo cho một đối tượng không có địa chỉ**.
- **Độ tin:** THẤP rằng giả định đúng — **grep toàn repo không tìm thấy tài liệu phạm vi/chủ sở hữu/lịch của đợt đang chạy**.
- **Bằng chứng:**
  - `[QS]` `02-prd:373` — *"**Không làm trong PRD này:** … sửa bug reaper `DomainEvent` (**thuộc đợt hardening**) · vá R2 public URL + `upload-delete` (**thuộc đợt hardening** — xem `01-intended-vs-implemented.md` S1–S4)"*.
  - `[QS]` `02-prd:423` — làn A **tự khai**: *"Đụng đợt security hardening: **A9**, và **một phần A1** (mã chứng từ)"*.
  - `[QS]` `02-prd:366` — *"cờ này mới là cờ nói chuyện với đợt security hardening"* (bối cảnh chu trình phụ thuộc).
  - `[QS]` `02-prd:468` — §9 câu 15: *"**đợt security hardening CÓ NHẬN** hai việc 'include lồng không được lọc' + 'soft-delete 4/10 model' không?"* — **chưa trả lời**.
  - `[QS]` `01-intended-vs-implemented.md:52` — S-item: `DELETE /api/admin/upload-delete` *"**không kiểm cơ sở, không kiểm chủ sở hữu**… `CENTER_MANAGER` của CS1 xoá vĩnh viễn file R2 của CS2 hoặc của HO"*.
  - `[QS]` grep `hardening` toàn repo: chỉ khớp tài liệu **R6 flexibility hardening cũ** và chính bộ `taicautruc` — **KHÔNG có** tài liệu phạm vi/chủ sở hữu/lịch của đợt đang chạy.
- **Mã `R-*` bị chặn:** `R-DP-06` · `R-D8-08` · `R-D4-13` · `R-OPS-07`.
- **Cách kiểm rẻ nhất:** **Một câu hỏi + một phép đếm, không cần môi trường**: (1) yêu cầu chủ đợt hardening đưa **danh sách file/route trong phạm vi** của họ; (2) **giao nhau** với danh sách file làn A sẽ sửa (`lib/storage/*`, `app/api/admin/upload-delete`, `lib/pdf/receipt.tsx`, **18 cột** lưu URL R2). **Ngưỡng: giao khác rỗng mà không có người điều phối chung ⇒ phải hợp nhất lịch hai đợt cho các file đó TRƯỚC khi khởi động A1/A9**; nếu (1) **không có tài liệu nào** thì giả định **SAI ngay từ vế "phạm vi đã biết"**.
- **Câu hỏi cho Ban:** Đợt security hardening đang chạy **do ai chủ trì**, **phạm vi gồm những file/route nào**, và **có nhận hai việc ở §9 câu 15** không? Nếu không có tài liệu phạm vi thì **ai điều phối** khi hai đợt sửa cùng file?

#### GD-60 — Sửa ba bề mặt là đủ để đổi luật gán giáo viên

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A+B | Impact 6 | Risk 2.8 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** `R-D3-10` nêu *"cả ba chỗ"* (danh sách GV chọn được, dropdown, guard máy chủ) là **đủ** để **một luật duy nhất** quyết ai dạy.
- **Nếu SAI thì sao:** Hàm gác cơ sở hiện được gọi ở **4 nơi**, còn đường ghi *"giáo viên thực dạy"* khi **hoàn tất buổi** **không kiểm cơ sở lẫn vai trò**. Phát hành xong **vẫn còn đường ghi người ngoài cơ sở làm người dạy buổi** ⇒ bảng kiểm 6 ca của `R-D3-09` **xanh nhưng lỗ vẫn mở**. Hậu quả lan sang chỗ khác vì cổng học liệu và báo cáo hiệu suất GV **đều lấy "GV của buổi" từ chính `actualTeacherId` này** — đúng điều kiện (2) của D8.
- **Độ tin:** THẤP rằng giả định đúng — **cả 4 call-site và đường ghi không kiểm đã grep + đọc trực tiếp**.
- **Bằng chứng:**
  - `[QS]` `app/(admin)/admin/classes/_actions.ts:54-74` — `assertTeachersInCenter`; call-site: `:263` và `:434` (**2 nơi**).
  - `[QS]` `app/(admin)/admin/trial-classes/_actions.ts:383` (**nơi 3**) · `lib/trial/service.ts:172` (**nơi 4**) — cùng gọi `teacherCenterAssignmentError`. `[đính chính: bản trước dẫn :381-383 và :165-176; dòng gọi thật là :383 và :172]`
  - `[QS]` `app/(admin)/admin/classes/[id]/session/_actions.ts:85` → `lib/lms/session-lifecycle.ts:115` — `actualTeacherId: opts.actualTeacherId ?? session.class?.teacherId ?? null` ⇒ **ghi thẳng, không kiểm cơ sở, không kiểm vai trò**.
  - `[QS]` `lib/scorm/access.ts:38` — cổng học liệu đọc `classSession.actualTeacherId === uid`.
  - `[QS]` `app/(admin)/admin/bao-cao/hieu-suat-gv/page.tsx:240` và `:256` — báo cáo hiệu suất lấy `s.actualTeacherId ?? classToTeacher.get(s.classId)`.
  - `[QS]` `02-prd:225` (`R-D3-10` — *"cả ba chỗ trong cùng một lần phát hành"*) · `:262` (`R-D8-05` — điều kiện (2)).
- **Mã `R-*` bị chặn:** `R-D3-10` · `R-D3-09` · `R-D8-05` · `R-D4-11`.
- **Cách kiểm rẻ nhất:** Liệt kê **mọi** đường ghi `teacherId`/`assistantId`/`actualTeacherId` (**đếm được 5**: 2 ở lớp, 1 ở lớp trải nghiệm, 1 ở service học thử, 1 ở hoàn tất buổi qua `session-lifecycle.ts:115`; **cộng thêm** `app/(teacher)/teacher/lich/_actions.ts:118` — GV tự nhận buổi), rồi **POST thẳng id của người thuộc cơ sở khác** vào từng đường. **Ngưỡng: tất cả bị từ chối**; dự đoán hiện tại 4/5 từ chối và **đường hoàn tất buổi lưu thành công ⇒ chưa được đóng thẻ `R-D3-10`.**

#### GD-80 — Quyền mới khai một nơi là có hiệu lực

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn B | Impact 6 | Risk 2.4 | Ô LÀM_LUÔN | Cờ 1 CÓ | Cờ 2 CÓ

- **Phát biểu:** Tách *"xem danh sách"* khỏi *"mở nội dung"* **chỉ cần khai quyền mới ở sổ phân quyền động (DB)**, hệ thống sẽ thi hành ngay.
- **Nếu SAI thì sao:** Hai kiểu hỏng **đối lập, cả hai đều im lặng**: (a) khai ở DB mà **quên đăng ký + ma trận tĩnh** → v1 trả **false** cho **MỌI** người kể cả Đào tạo HO, `/admin/documents` **trắng**, phát hiện lúc vận hành; (b) mỗi lượt đánh giá action đó **đẻ một dòng lệch v1≠v2** vào **đúng bảng đang dùng để quyết định có bật cờ RBAC hay không** ⇒ **làm nhiễu số liệu của đợt go-live khác**. Người chịu: Đào tạo HO (mất màn tài liệu) và chủ đợt shadow (số liệu bẩn, không biết vì sao lệch).
- **Độ tin:** THẤP rằng giả định đúng — **cả ba nơi phải khai đã đọc trực tiếp trong mã**.
- **Bằng chứng:**
  - `[QS]` `lib/auth/permission-eval.ts:23-26` — `const v1 = params.sessionUser && isValidAction(params.action) ? canMatrix(...) : false` ⇒ **ngoài đăng ký → v1 = false**.
  - `[QS]` `lib/auth/action-registry.ts:8` — `export const ACTION_REGISTRY: readonly string[] = ALL_ACTIONS` (nơi khai đăng ký); `lib/auth/actor.ts:118` — `const validActions = input.validActions ?? new Set(ACTION_REGISTRY)` (nơi **đọc**). `[đính chính: bản trước dẫn actor.ts:113 là nơi khai — thật ra khai ở `action-registry.ts:8`, actor.ts chỉ đọc ở :118]`
  - `[QS]` `lib/flags.ts:7-8` — cờ OFF ⇒ **prod thi hành v1**.
  - `[QS]` `lib/auth/check-permission.ts:31-35` — `v1 !== v2` ⇒ ghi **một dòng shadow-diff**.
  - `[QS]` `app/(admin)/admin/documents/page.tsx:70` — cổng trang đi **đúng qua `checkPermission("documents:view")`**.
  - `[QS]` `02-prd:266` — `R-D8-09` đánh **✓ đụng shadow** nhưng **không nêu nơi khai action mới**.
- **Mã `R-*` bị chặn:** `R-D8-09` · `R-D4-01` · `R-QDB-06`.
- **Cách kiểm rẻ nhất:** Không cần dữ liệu thật, **15 phút**: viết tiêu chí nghiệm thu `R-D8-09` thành **ba gạch đầu dòng bắt buộc** — action mới phải có mặt ở (1) **đăng ký action** (`lib/auth/action-registry.ts`), (2) **ma trận tĩnh v1** (`lib/auth/permissions.ts`), (3) **sổ vai trò động v2** (`RolePermission` qua `prisma/seed-roles.ts`) — kèm **một test khẳng định `v1(action) = v2(action)` cho từng vai trò cấp cao nhất**. **Ngưỡng: test này đỏ = chưa được ghép.** Chi phí gần bằng 0, và nó **khoá luôn kiểu hỏng (b)**.
- **Câu hỏi cho Ban:** Action mới của `R-D8-09` **tên là gì**, và **ai chịu trách nhiệm khai nó ở cả ba nơi** — hiện ba nơi này do **ba đường sửa khác nhau**?

#### GD-70 — Mã đơn vị duy nhất kéo theo tiền tố chứng từ phân biệt được cơ sở

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A | Impact 6 | Risk 2.1 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Vì mã đơn vị **đã duy nhất và chuẩn hoá chữ hoa** (`R-D2-17`), tiền tố sinh ra trên mã học viên/lớp/phiếu thu **tự khắc phân biệt được từng cơ sở**.
- **Nếu SAI thì sao:** Hàm sinh mã **xoá mọi ký tự không phải chữ-số và in hoa** trước khi dựng khoá bộ đếm, nên `CS_1` / `cs1` / `CS.1` / `CS1` **đều rơi về cùng khoá `HV:CS1:26`** và **cùng tiền tố hiển thị**. Hai cơ sở **dùng chung một dãy số**: mã **không trùng nhau** (nên test của `R-D2-18` vẫn xanh) nhưng **KHÔNG truy nguyên được về cơ sở nào** — hỏng đúng chỗ nhượng quyền cần nhất là **chứng từ**. Nặng hơn: `Center.code` hôm nay **không đi qua validation nào** (biểu mẫu cơ sở **không có trường `code`**), nên `R-D2-17` phải áp luật mã cho **`Center.code`**, không chỉ cho `OrgUnit.code`.
- **Độ tin:** THẤP rằng giả định đúng — **cơ chế sanitize + khoá bộ đếm dùng chung đã đọc trực tiếp**.
- **Bằng chứng:**
  - `[QS]` `lib/codegen.ts:17-19` — `sanitize(code) = code.toUpperCase().replace(/[^A-Z0-9]/g, "")` (chú thích tự khai: *"`SATA_3` → `SATA3`"*).
  - `[QS]` `lib/codegen.ts:43-47` — `genStudentCode` dựng khoá `HV:${cc}:${y}` từ **mã đã sanitize**; `:118-127` — `gen4` cùng khuôn cho lead/phiếu.
  - `[QS]` `lib/codegen.ts:26-33` — `nextSeq` upsert `Counter` **atomic** ⇒ mã **không trùng**; hỏng thật là **trộn chung một dãy + mất truy vết**. (Xem thêm ghi chú `R-D2-18` cuối mục 5.3.)
  - `[QS]` `lib/org/orgunit-rules.ts:7` — `ORG_CODE_RE = /^[A-Z0-9_]{2,20}$/` ⇒ **cho phép gạch dưới**, tức `CS_1` là mã **hợp lệ**; `:59-62` — `validateCenterId` chỉ ràng `centerId` theo type. `[đính chính: bản trước dẫn V7 tại :58-59; khối thật là :59-62]`
  - `[QS]` `app/(admin)/admin/centers/_actions.ts:14-41` — `centerSchema` **KHÔNG có trường `code`** ⇒ `Center.code` **không đi qua validation nào**.
  - `[QS]` `prisma/schema.prisma:237` — `Center.code String? @unique` (**nullable**).
  - `[QS]` `02-prd:180` (`R-D2-17`) · `:181` (`R-D2-18`).
- **Mã `R-*` bị chặn:** `R-D2-17` · `R-D2-18` · `R-OPS-07`.
- **Cách kiểm rẻ nhất:** Trên **DB test**: tạo hai cơ sở mã `CS3` và `CS_3` (thêm ca `cs3` chữ thường), sinh mỗi bên 2 học viên + 2 phiếu thu, rồi **đếm số mã có cùng tiền tố nhưng khác cơ sở**. **Ngưỡng: kỳ vọng 0; > 0 ⇒ chọn một trong hai** — siết luật mã (**cấm gạch dưới, ép chữ hoa ngay tại `Center.code`**) **hoặc** đổi khoá bộ đếm sang **id đơn vị** — và **ghi lựa chọn đó vào `R-D2-18`** trước khi mở đường tạo cơ sở.

#### GD-78 — Vé mười phút đủ cho một buổi dạy chín mươi phút

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A | Impact 6 | Risk 2.1 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Vé mở nội dung **có hạn 10 phút là đủ** cho một buổi trình chiếu, vì gói học liệu **nạp hết tài nguyên ngay lúc mở**.
- **Nếu SAI thì sao:** Gói SCORM nhiều phần **nạp tài nguyên theo bước**; sang **phút thứ 11** vé và cookie **cùng hết hạn, không có đường làm mới**, tài nguyên tiếp theo trả **403** → **slide chết giữa buổi**, giáo viên phải tải lại trang **trước mặt học viên**. Vì đường ghi kết quả giảng dùng **phiên đăng nhập** (không dùng vé), nhật ký **vẫn báo "đang dạy bình thường"** ⇒ sự cố bị **đổ cho mạng**, không ai lần ra. `R-D8-08` **nhân đúng mô hình vé này sang tài liệu** ⇒ lỗi lan sang cả tài liệu.
- **Độ tin:** THẤP rằng giả định đúng — **TTL, cookie chỉ đặt ở hop đầu, và việc không có đường làm mới đều đã đọc trực tiếp**.
- **Bằng chứng:**
  - `[QS]` `lib/scorm/ticket.ts:29-33` — `signScormTicket(..., ttlSeconds = 600)`; `:66` — `if (payload.exp < now) return { ok: false }` ⇒ **từ chối cứng, không ân hạn**.
  - `[QS]` `app/api/scorm/asset/[...path]/route.ts:91-98` — cookie vé `maxAge: 600`, **chỉ đặt ở hop đầu** (`if (queryToken)`).
  - `[QS]` `components/admin/scorm-player.tsx:30-48` — vé nhận **một lần** từ máy chủ (`buildAssetSrc(launchUrl, launchTicket)`), **không có đường làm mới**.
  - `[QS]` `app/api/scorm/runtime/route.ts:103-104` — đường ghi kết quả gác bằng **phiên đăng nhập** (`session.user.id` + `resolveActor`), **không dùng vé** ⇒ **sống lâu hơn vé**.
  - `[QS]` `prisma/schema.prisma:2134` — `Lesson.duration Int @default(90)`.
  - `[QS]` `02-prd:265` (`R-D8-08` — *"proxy có vé có hạn"*, cỡ **L**).
- **Mã `R-*` bị chặn:** `R-D8-08` · `R-D8-06` · `R-D8-12`.
- **Cách kiểm rẻ nhất:** **Đo trực tiếp, 20 phút**: mở một gói SCORM **nhiều phần** trên môi trường thật, **để yên 12 phút** rồi bấm sang **phần chưa nạp** — xem có **403** không. Song song đếm số phản hồi 403 của `/api/scorm/asset` trong nhật ký hạ tầng 30 ngày qua, **tách theo mốc phút thứ 10** kể từ lượt mở. **Ngưỡng: có 403 sau mốc 10 phút ⇒ phải thêm đường làm mới vé TRƯỚC khi `R-D8-08` áp mô hình vé cho tài liệu.**

#### GD-79 — Gỡ nhánh nới quyền ở một file là gỡ hết

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A | Impact 6 | Risk 1.6 | Ô LÀM_LUÔN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** Sửa cổng mở nội dung **ở khu quản trị là đủ**, vì mỗi màn hình **chỉ có một bản mã**.
- **Nếu SAI thì sao:** `R-D8-05` nghiệm thu **XANH** (grep một đường dẫn thấy sạch) trong khi **bản site giáo viên** — bề mặt giáo viên **thật sự dùng hằng ngày** — **vẫn giữ nguyên** nhánh nới *"bất kỳ lớp nào cùng `curriculumId`/`courseId`"*. Toàn bộ chi phí siết ĐK(2) đổ vào **khu ít dùng hơn**; ma trận `R-D8-14` nếu chạy trên đường admin **cũng xanh**. Người chịu: chủ D8 (**tưởng đã đóng**) và bảo mật (**lỗ vẫn mở, nay không ai soát lại vì đã "xong"**).
- **Độ tin:** THẤP rằng giả định đúng — **hai bản mã đã mở cả hai và đối chiếu từng dòng**.
- **Bằng chứng:**
  - `[QS]` `app/(admin)/admin/scorm/play/[id]/page.tsx:89-113` — nhánh dự phòng bản admin (`sdb.class.findFirst` với `OR: [{ curriculumId: lessonInfo.curriculumId }, { curriculumId: null, courseId: … }]`), fail-gate `notFound()` (`:114`).
  - `[QS]` `app/(teacher)/teacher/scorm/play/[id]/page.tsx:101-125` — **BẢN SAO** cùng nhánh, cùng truy vấn, fail-gate `redirect("/teacher")` (`:126`).
  - `[QS]` `02-prd:262` — tiêu chí `R-D8-05` **chỉ nêu một đường dẫn**: *"Khối `scorm/play/[id]/page.tsx:89-113` không còn tồn tại"*.
  - `[QS]` `01-intended:82` — đã ghi *"(**cả admin lẫn teacher**)"* nhưng **PRD không chép sang**.
- **Mã `R-*` bị chặn:** `R-D8-05` · `R-D8-04` · `R-D8-14`.
- **Cách kiểm rẻ nhất:** **Miễn phí, làm ngay**: sửa tiêu chí nghiệm thu `R-D8-05` thành **một lệnh grep toàn repo** — số lần xuất hiện của mẫu `curriculumId: lessonInfo.curriculumId` (hoặc tên hàm gác hợp nhất) phải **= 0 ngoài `lib/`**, và ma trận `R-D8-14` phải chạy trên **CẢ HAI host** (admin + giáo viên). **Ngưỡng: > 0 kết quả grep ngoài `lib/` ⇒ chưa đóng.** Chi phí: **1 dòng trong tiêu chí, 0 công phát triển thêm**.
- **Câu hỏi cho Ban:** Ma trận `R-D8-14` chạy trên **host nào** — chỉ admin, chỉ giáo viên, hay **cả hai**? Hiện tiêu chí không nói, mà **hai host có hai bản mã**.

#### GD-81 — Nhật ký lượt xem tra cứu được theo cơ sở

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A | Impact 5 | Risk 2.1 | Ô HOÃN | Cờ 1 KHÔNG | Cờ 2 CÓ

- **Phát biểu:** **Chỉ cần ghi thêm dòng nhật ký** là quản lý cơ sở **tra được lượt xem của cơ sở mình**, vì tầng cách ly cơ sở **tự lo phần lọc**.
- **Nếu SAI thì sao:** `R-D8-11` làm xong, dòng nhật ký có đủ, nhưng **màn tra cứu của `R-D8-09` không viết được**: **không có trục cơ sở** nên **hoặc** quản lý cơ sở A đọc luôn lượt xem của cơ sở B và của bên NHẬN (**rò chéo mới**, đúng loại D10 đang chống), **hoặc** phải chặn hết chỉ để HO xem (**mất đúng công dụng vận hành** mà `R-D8-09` hứa). Phát hiện **muộn** vì lỗi chỉ lộ khi **ghép hai yêu cầu**. Người chịu: đợt security hardening (nhận thêm một bảng không cách ly) và quản lý cơ sở (mất màn tra cứu).
- **Độ tin:** THẤP rằng giả định đúng — **thiếu trục cơ sở đã đọc trực tiếp trên schema và trong `SCOPED_MODELS`**.
- **Bằng chứng:**
  - `[QS]` `prisma/schema.prisma:4686-4698` — `ScormAccessLog` **không có** `centerId`/`orgUnitId`, cũng **không có quan hệ tới `User`**; `classSessionId` **nullable** (`:4689`).
  - `[QS]` `lib/db-scope.ts:11-37` — `SCOPED_MODELS` **không chứa** `ScormAccessLog` lẫn `Document` ⇒ **không có cách ly cơ sở tự động**.
  - `[QS]` `02-prd:268` — `R-D8-11` chỉ đòi ghi *"ai · gì · buổi/lớp nào · khi nào · IP"*, **không đòi trục cơ sở**.
  - `[QS]` `03-job-stories.md:387` — *"**Quản lý cơ sở xem được nhật ký lượt xem của cơ sở mình**"* (tiêu chí dương tính · `R-D8-11`).
- **Mã `R-*` bị chặn:** `R-D8-11` · `R-D8-09` · `R-D4-01`.
- **Cách kiểm rẻ nhất:** **Kiểm bằng suy luận trên schema, 10 phút, không cần chạy gì**: thử viết câu truy vấn *"lượt xem của cơ sở tôi"* **chỉ bằng các cột đang có**. Đường duy nhất là nối `ScormAccessLog → ClassSession → centerId`, nên nó **CHỈ chạy cho dòng có `classSessionId`**; lượt xem **không gắn buổi rơi ra ngoài mọi cơ sở**. **Ngưỡng: tỉ lệ dòng `classSessionId` NULL > 10% ⇒ `R-D8-11` phải thêm cột `centerId` (denormalize, đặt lúc ghi) CÙNG lần phát hành**, không để lại sau.
- **Câu hỏi cho Ban:** Nhật ký lượt xem nội dung **có phải dữ liệu cách ly theo cơ sở** không? Nếu có thì phải thêm trục cơ sở **ngay ở `R-D8-11`**, vì thêm sau là phải **backfill lại toàn bảng**.

#### GD-84 — Ghi nhật ký từng tài nguyên con chịu được tải và có ích

Nhóm rủi ro KHẢ_THI_KỸ_THUẬT | Góc nhìn Kỹ sư | Làn A | Impact 5 | Risk 2.1 | Ô HOÃN | Cờ 1 KHÔNG | Cờ 2 KHÔNG

- **Phát biểu:** Ghi **một dòng nhật ký cho mỗi tài nguyên con** của gói SCORM **vừa chịu được về hiệu năng, vừa cho ra thông tin dùng được** — chứ không phải một bảng **phình mà không ai đọc**.
- **Nếu SAI thì sao:** Mỗi lượt mở gói sinh **hàng trăm dòng**; đường phát tài nguyên hiện **đọc TOÀN BỘ tệp vào bộ nhớ** rồi mới trả, cộng thêm **một lệnh ghi DB mỗi yêu cầu** → **chậm ngay giữa giờ trình chiếu**. Đổi lại, bảng nhật ký **lớn tới mức không truy vấn nổi** để trả lời câu hỏi thật (*"ai xem gì"*), lại **đúng ở chiều không có index**. Người chịu: giáo viên đang chiếu slide và người vận hành hạ tầng. Mất: **chính mục tiêu truy vết** mà `R-D8-11` đặt ra.
- **Độ tin:** THẤP rằng giả định đúng — **cách phát tài nguyên và bộ index đã đọc trực tiếp**; con số dòng/ngày thì phải đếm.
- **Bằng chứng:**
  - `[QS]` `app/api/scorm/asset/[...path]/route.ts:74-88` — `GetObjectCommand` rồi `transformToByteArray()` **toàn tệp vào RAM** (`:80`); grep `AccessLog` trong file = **0** ⇒ hiện **không ghi dòng nào** trên đường này.
  - `[QS]` `prisma/schema.prisma:4633` — `ScormPackage.fileCount Int?` = *"số entry đã giải nén"* ⇒ **đo được ngay** số tài nguyên/gói.
  - `[QS]` `prisma/schema.prisma:4686-4698` — `ScormAccessLog` có **6 cột**, **KHÔNG có trường tài nguyên**. `[đính chính: bản trước ghi "5 trường"]`
  - `[QS]` `prisma/schema.prisma:4696-4697` — chỉ có index `[packageId, openedAt]` và `[userId]`: chiều *"ai xem gì / buổi nào"* **không có index**.
  - `[QS]` `02-prd:463` — §9 câu 10 đang treo **đúng câu hỏi độ hạt này** · `:268` (`R-D8-11` — *"số dòng nhật ký **> 1** (hiện luôn đúng 1)"*).
- **Mã `R-*` bị chặn:** `R-D8-11` · `R-D8-08`.
- **Cách kiểm rẻ nhất:** **Đo bằng dữ liệu đang có, không cần code**: (a) `SELECT avg("fileCount"), max("fileCount") FROM "ScormPackage"` → số dòng/lượt mở; (b) đếm dòng `ScormAccessLog`/ngày → nhân ra số dòng/ngày ở mức tài nguyên con; (c) đo p95 thời gian phản hồi hiện tại của `/api/scorm/asset` trên bản ghi hạ tầng. **Ngưỡng: > 50.000 dòng/ngày hoặc p95 đã > 800ms ⇒ chốt độ hạt ở mức GÓI + đếm tài nguyên gộp** (một dòng/lượt mở, kèm số tài nguyên), **đừng ghi từng dòng**. Nếu vẫn chọn mức tài nguyên: **phải thêm index `(userId, openedAt)` và `(classSessionId)` cùng lần phát hành**.
- **Câu hỏi cho Ban:** §9 câu 10 — *"mọi lượt xem"* là **mỗi lượt mở gói** hay **mỗi tài nguyên con**? Chưa trả lời thì `R-D8-11` **không ước lượng được**.

---

**Ghi chú biên tập của mục 5.4 (không phải câu hỏi nghiệp vụ).** Toàn bộ mã `R-*` trong mục này **đã grep lại** trong `02-prd-franchise-platform.md` và **đều tồn tại** — không mã nào phải ghi *"KHÔNG THẤY TRONG 02-prd"*. **Mười trích dẫn/khẳng định đã được sửa tại chỗ sau khi mở lại file:**
1. `prisma/schema.prisma:4811` **không phải** `CoursePackage.slug` mà là `Promotion.slug`; khoá duy nhất toàn cục của `CoursePackage` nằm ở **`:1703`** (GD-50).
2. Comment *"PR-A … flip ở PR-D"* lặp **26 lần**, không phải 27 (GD-46).
3. `isHoLevel` được đọc ở **33 file** production trong `app/` + `lib/` — không phải 14 (bản giả định) cũng không phải 41 (đếm cả test) (GD-61).
4. Số file `lib/` import `@/lib/db` trần hiện là **159** (bản giả định ghi 157; `01-intended:21` ghi 156) (GD-54).
5. `ACTION_REGISTRY` khai ở **`lib/auth/action-registry.ts:8`**; `actor.ts:118` chỉ **đọc** nó (GD-80).
6. Nhánh chọn v1 khi cờ OFF nằm ở **`lib/auth/shadow-compare.ts:20` + `:27`**; `permission-eval.ts:23-27` chỉ **tính** v1 và v2 (GD-43).
7. `NULL_IS_GLOBAL_MODELS` ở **`lib/db-scope.ts:49-53`**; luật V7 của `orgunit-rules.ts` ở **`:59-62`** (GD-58, GD-70).
8. Call-site hàm gác cơ sở của GV là **`classes/_actions.ts:263`, `:434`, `trial-classes/_actions.ts:383`, `lib/trial/service.ts:172`** (GD-60).
9. `ScormAccessLog` có **6 cột**, không phải 5 (GD-84).
10. `tests/manual/i3-isolation.spec.ts` và `i3-admin-isolation.spec.ts` có **đúng 1 `expect()` mỗi file**, và nó nằm trong hàm `login` — tức phần dò rò rỉ **hoàn toàn không có assertion** (GD-45).

**Ba khẳng định bị sửa nội dung:**
(a) **`R-D4-10` KHÔNG nằm trong bất kỳ pha nào của §8** (`02-prd:409-444`; B6 = `06 → 07 → 08 → 11 → 13`). Vậy *"B6 xếp `R-D4-06` trước `R-D4-10`"* là **sai** — vấn đề thật là `R-D4-10` (cỡ **L**, `02-prd:237`) **không có ngày kết thúc** (GD-54).
(b) Con số **"4/9 mã vai trò"** (`02-prd:84` · `01-intended:204`) đúng cho **spec CÁCH LY**, nhưng **không** được đọc là *"CI chưa từng dựng vai trò nào khác"*: spec **quyền** trong CI có dựng thêm `CENTER_ACCOUNTANT` (`tests/e2e/a0/can-integration.spec.ts:71`), `HO_MARKETING` và `CENTER_SALES_CSM` (`tests/e2e/a0/rbac.spec.ts:110-111`) (GD-45).
(c) `Employee.centerId` **không** được suy từ đơn vị chọn ở biểu mẫu nhân sự: grep `centerIdForOrgUnit` trong `app/(admin)/admin/nhan-su/actions.ts` = **0**, dù `employee-form.tsx:26` ghi *"centerId suy ra ở server"* — đường `users/_actions.ts:236-238` mới có (GD-58, GD-59).

**Bốn phát hiện thêm trong lúc kiểm:**
(i) `prisma/seed-orgunit.ts:50-54` ghi đè **6 trường** ở nhánh `update` (kể cả `isActive: true`, `deletedAt: null`) ⇒ `R-OPS-01` khoá mỗi `parentId` là **chưa đủ**, seed vẫn **hồi sinh node đã xoá mềm** (GD-52).
(ii) `lib/settings/registry.ts` đếm được **18 `centerOverridable: true` / 27 `false` = 45 khoá** — khớp `01-intended:122`, và `clearSettingsCache` (`service.ts:49-51`) **chỉ** invalidate tag `settings`, **không** invalidate khi cây đổi (GD-49).
(iii) Bảng `scopeType` trong `prisma/seed-roles.ts`: **280 GLOBAL · 18 CENTER · 1 CLASS · 1 ASSIGNED · 1 CHILDREN · 0 OWN** (tổng 301), và `attendance:view` xuất hiện ở **cả ba** họ (`:302` GLOBAL, `:400` CENTER, `:519` ASSIGNED) ⇒ mô hình quyền là thuộc tính của **cặp vai-trò × action**, không của action (GD-74).
(iv) Schema có **18 cột** lưu URL/khoá R2 ⇒ đổi tiền tố R2 theo đơn vị **là đổi dữ liệu**, không khép kín trong tầng lưu trữ (GD-82).

**Việc phải BÁO LẠI, không phải hỏi:** `QUYET-DINH.md:59` yêu cầu **báo cho chủ đợt go-live RBAC** rằng QĐ-B **chặn lịch flip** (`:58` — không được bật `RBAC_V2_ENABLED` cho tới khi 3 việc của `:52-54` xong). Riêng **tiêu chí đóng cửa sổ shadow** mới là **câu hỏi** (§9 câu 12, `02-prd:465`).

**Một câu hỏi MỚI cho Ban, chưa có trong 15 câu của `02-prd` và cũng chưa có trong `QUYET-DINH.md`:** node của **bên NHẬN nhượng quyền (FRANCHISEE)** là `type = CENTER` (**có `centerId`**, chạy được `scopedDb`) hay `type = FRANCHISE` (**`centerId` null** → bị `passesScope` chặn tại `lib/db-scope.ts:254`, trừ các model trong `NULL_IS_GLOBAL_MODELS` `:49-53`)? Enum đã có **sẵn cả hai giá trị** `FRANCHISE` và `PARTNER` (`prisma/schema.prisma:286-293`), và `lib/org/orgunit-rules.ts:59-62` quy định **chỉ `type = CENTER` mới mang `centerId`` — nên chọn `FRANCHISE` là **tự động vô hiệu hoá cách ly cơ sở** cho pháp nhân đó. Câu này **chặn A6** (`02-prd:386` — *"Một pháp nhân FRANCHISEE = một node trong cùng một CSDL"*) và **chặn gói cổng tạo cơ sở** (`02-prd:399-401`). Ghi chú kèm: `lib/org/org-tree.ts:128-134` — `DEFAULT_SELECTABLE_TYPES` gồm **HO, CENTER, CAMPUS, PARTNER, FRANCHISE**, tức **4/5 type chọn được đều cho `centerId = null`**, không riêng HO.

## 6. Đối chiếu với 9 giả định A1–A9 của PRD (§7.4)

> Nguồn: `02-prd-franchise-platform.md:378-390` (bảng A1–A9). Cột cuối là **PRD tin nhầm gì** — không phải "PRD sai", mà là chỗ **phép kiểm rẻ nhất mà PRD đề ra không bắt được điều nó tưởng bắt được**.

| Mã A | Phát biểu gốc (rút gọn) | Trạng thái | Mã GD phủ nó | PRD đang tin nhầm gì |
|---|---|---|---|---|
| **A1** | Chỉ có **một** khối HO cho cả tập đoàn (`02-prd:380`) | **GIỮ NGUYÊN** | `[QS]` Không gia đình nào trong 89 bản phản biện tấn công vế *"chỉ một khối HO"*. Gần nhất là **GD-58** (đường ghi phân công duy nhất đang chạy là công tắc "Nhân viên HO" trỏ một node HO) — **chạm dữ liệu HO nhưng không phải cùng một khẳng định** | `[SĐ]` Phép kiểm *"đọc 3 file + hỏi Ban"* chỉ bắt rủi ro **chọn tuỳ ý** (`findFirst` không `orderBy`), **không** bắt hệ quả phân quyền: `isHoRoot` xét **TYPE** (`lib/auth/actor.ts:92-93`) nên **bất kỳ** node `type=HO` nào cũng cấp `isHoLevel` (`:133`) → phạm vi `ALL` ở `lib/db-scope.ts:184` và `:218`. A1 sai **không phải "sai âm thầm"** mà là **mở một đường thoát phạm vi** |
| **A2** | FRANCHISEE **dùng chung** bộ chương trình của HO (`02-prd:381`) | **MỞ RỘNG** | **GD-01** (cấp vai trò Đào tạo cho bên nhận là quyết định có kiểm soát) · **GD-35** (toàn bộ `Curriculum` hiện có đều thuộc HO) · **GD-36** (bên nhận chịu dùng nguyên chương trình HO) | Hai chỗ. **(1)** `[QS]` PRD coi A2 là **câu HỎI BAN** (§9 câu 2, `02-prd:455`) trong khi lỗ mở bằng **một thao tác nhập liệu hợp lệ** — quyền soạn chương trình gắn theo **vai trò**, không theo **đơn vị** (`lib/auth/permissions.ts:466-468`, `prisma/seed-roles.ts:225-227` đều `GLOBAL`), nên "Ban chốt" không chặn được gì nếu tầng dữ liệu không siết (GD-01). **(2)** `[SĐ]` A2 chỉ nói về **HÔM NAY**; GD-35 tách thêm vế *"còn đúng vào lúc pha B đặt `ownerOrgUnitId` NOT NULL"* — **đánh giá của bước này** là vế thứ hai mới là vế đóng dấu vĩnh viễn |
| **A3** | `centerId` đã backfill 100% trên 6 model mới flip vào `SCOPED_MODELS` (`02-prd:382`) | **MỞ RỘNG** | Không mã nào lặp lại đúng A3, nhưng **cùng chế độ hỏng** *"bản ghi vô hình với actor cấp cơ sở"* mở rộng ở **GD-51** (xoá mềm/tắt một node CENTER làm mất trọn cơ sở khỏi tầm nhìn) · **GD-46** (hai trục `centerId` ‖ `orgUnitId` phân kỳ âm thầm) · **GD-58** (nhân sự không có `PRIMARY` sau khi flip nguồn sự thật) | `[SĐ]` *"1 truy vấn read-only"* đếm NULL **tại một thời điểm**; nó **không** phát hiện bản ghi rơi khỏi phạm vi do **THAY ĐỔI CÂY** (GD-51) hoặc do **lệch trục** (GD-46). A3 xanh hôm nay **không bảo đảm gì** sau đợt chuyển đổi |
| **A4** | Số bản ghi `UserPermissionGrant` **DENY** đang tồn tại là **nhỏ** (`02-prd:383`) | **MỞ RỘNG** | **GD-22** (danh sách action miễn nhiễm DENY cho `SUPER_ADMIN`) · **GD-23** + **GD-04** (grant **ALLOW** mới là đường mở tầm nhìn/quyền toàn cục) | `[QS]` PRD đóng khung A4 quanh **SỐ LƯỢNG dòng DENY**. GD-22: ngoại lệ DENY ở v1 là **TOÀN PHẦN** cho `SUPER_ADMIN` (`QUYET-DINH.md:53`) — đếm bao nhiêu dòng cũng **không đổi kết luận**. GD-04: rủi ro thật ở **nhánh ALLOW** — `lib/auth/can.ts:41` `if (actor.grantsAllow.has(action)) return true;` (đã mở kiểm, đúng nguyên văn) đứng **TRƯỚC** vòng xét scope (`:42-43`), mà A4 **không đếm chiều đó**. `[SĐ]` Phép kiểm rẻ phải đếm **CẢ HAI** chiều grant |
| **A5** | Số ca **học bù liên cơ sở đang mở** là nhỏ (`02-prd:384`) | **GIỮ NGUYÊN** | `[QS]` **Không mã nào phủ.** `R-QDC-03` chỉ xuất hiện gián tiếp ở **GD-45** (độ phủ test cách ly) và **GD-40** (bốn bảng rò dữ liệu cá nhân); `R-QDC-05` **không xuất hiện trong bất kỳ bản phản biện nào** | `[SĐ]` Đây là **điểm mù thật** của đợt phản biện: nhánh QĐ-C (làn A3, `02-prd:415`) gần như **không bị soi**, dù §8 xếp A3 là **một pha có điều kiện ra riêng**. Không có bằng chứng bổ sung → giữ nguyên phép kiểm PRD đã nêu (1 truy vấn chỉ-đọc, `QUYET-DINH.md:79`) |
| **A6** | Một pháp nhân FRANCHISEE = **một node trong cùng một CSDL** (`02-prd:386`) | **MỞ RỘNG** | **GD-32** (HO xem chi tiết từng dòng của pháp nhân khác) · **GD-33** (chuyển tiếp chỉ-đọc sau khi cắt hợp đồng) · **GD-27** (nhóm `R-DP-01..07` không nằm làn nào) · **GD-39** (vai trò phụ trách dữ liệu theo đơn vị) · **GD-66** (gói bàn giao thiếu tệp) · **GD-68** (tác vụ nền chạy danh tính toàn cục trên cả hai pháp nhân) | `[SĐ]` Phép kiểm *"Hỏi Ban"*: **đánh giá của bước này** là một xác nhận "một-CSDL-chung" **KHÔNG** giải quyết được hệ quả pháp lý kèm theo (chưa có ý kiến pháp chế nào chứng minh chiều nào). `[QS]` Chính §9 câu 8 (`02-prd:461` — bên **kiểm soát** hay bên **xử lý**) là **câu gốc** và đang treo **toàn bộ nhóm 8**. `[QS]` Thêm một vế A6 **chưa hề chạm**: node đó mang `type` gì (xem **c1** ở §9) |
| **A7** | Đội **4–5 dev** dành được một phần công suất (`02-prd:31`, `:387`) | **GỘP VÀO** | Gộp trọn vào **GD-26** (đội 4–5 dev còn công suất cho 112 yêu cầu) | `[QS]` Cột *"nếu SAI thì sao"* của PRD viết **"lộ trình §8 giãn ra; THỨ TỰ vẫn đúng"**, trong khi PRD **tự khai** ba gói phải đi **CÙNG một lần phát hành**: `R-D2-16+17+18` (`02-prd:399-401`), `R-QDB-02+03` (`:440`), `R-D3-10` vốn **đã gộp từ `R-D8-10`** đúng vì lý do này (`:366-367`). `[SĐ]` **Dự báo hành vi tổ chức** của bước này: thiếu công suất thì đúng ba gói đó bị **tách ra để chia việc** ⇒ A7 sai làm **ĐỔI HÌNH** lộ trình, không chỉ giãn. Chưa có dữ liệu lịch sử nào của đội chứng minh chiều này |
| **A8** | Prisma **`result:` extension** đè được trường vô hướng có sẵn (`02-prd:388`, `:357`) | **GỘP VÀO** | Gộp trọn vào **GD-83** (`R-TECH-01` / `R-D4-06`) | `[QS]` PRD coi `R-TECH-01` là **ĐIỀU KIỆN MỞ THẺ DUY NHẤT**. Ba mã khác cho thấy A8 đúng **vẫn chưa đủ**: **GD-54** (không có điểm gắn nào vừa biết actor vừa phủ hết đường đọc), **GD-07** (trả `null` không chặn `where`/`orderBy`/`aggregate`), **GD-08** (che tầng đọc không thay được che tầng **GHI**, nên xoá 9 chỗ che tay là **gỡ chốt**). `[SĐ]` **Suy luận** của bước này: một test xanh của `R-TECH-01` chỉ bác **nhánh hỏng thứ nhất trong bốn** — và vì `result:` extension **chưa từng chạy trong repo** (xem §11 mục "còn gì chưa kiểm được"), mọi phát biểu về hành vi của nó vẫn là `[SĐ]` |
| **A9** | Cửa sổ shadow-compare **đóng trong khoảng lập kế hoạch được** (`02-prd:389`) | **MỞ RỘNG** | **GD-44** (cửa sổ đóng được trước khi làn B khởi động) · **GD-62** (đồng hồ shadow có đang chạy không) · **GD-76** (shadow xanh chỉ chứng minh cho bề mặt đi qua `checkPermission`) | Hai chỗ. **(1)** `[SĐ]` Phép kiểm *"hỏi chủ đợt go-live RBAC"* giả định **đồng hồ là thiết bị đo tin được** — GD-62 tấn công **chính tiền đề đó** ("0 lệch" và "không ai ghi" cho **cùng một con số**); chưa ai chạy canary nên đây vẫn là suy đoán. **(2)** `[QS]` §8 xếp `R-QDB-01..05` vào **làn B** (chờ cửa sổ đóng, `02-prd:425` · `:430`) trong khi **QĐ-B đòi `R-QDB-01/02/03` xong TRƯỚC khi bật `RBAC_V2_ENABLED`** (`QUYET-DINH.md:52-54` · `:58`) — **vòng tròn thứ tự**, thứ mà §9 câu 12 (`02-prd:465`) **không hỏi tới** |

---

## 7. Thí nghiệm cho ô Impact cao × Risk cao

> **17 khối** — mỗi khối là một thí nghiệm **đã thiết kế đủ để giao việc**. Luật chấm cờ giữ nguyên §1: **một truy vấn chỉ-đọc để đo thì Cờ 1 = KHÔNG, Cờ 2 = KHÔNG** (`02-prd:364`); cờ thuộc về **hành động vá**, không thuộc về phép đo.
> ⚠️ Mọi thí nghiệm chạm DB test đều theo `.claude/rules/prisma-db.md` — **Postgres LOCAL**, không bao giờ trỏ Supabase.

### GD-44 — Đọc đồng hồ shadow + đo traffic thật của prod trong kỳ đo

- **Loại:** TRUY_VẤN_CHỈ_ĐỌC
- **Việc cụ thể:** Chạy `scripts/shadow-report.ts` trên prod bằng `DIRECT_URL` — script **tự khai không ghi gì vào DB** (`scripts/shadow-report.ts:12`), truy vấn theo ngày ở `:86-90`, phân loại **CÓ CHỦ ĐÍCH vs CẦN XỬ LÝ** ở `:139-153`. **TUYỆT ĐỐI KHÔNG** chạy `scripts/truncate-shadow-diff.ts` (`:13` có `TRUNCATE "RbacShadowDiff"`) và **không** kích workflow `.github/workflows/truncate-shadow-diff.yml`. Lấy chuỗi ngày liên tiếp có **CẦN XỬ LÝ = 0** trong 14 ngày. Thêm 3 SELECT chỉ-đọc: (1) `COUNT(DISTINCT "actorId") FROM "AuditLog" WHERE "createdAt" >= now() - interval '14 days' AND "actorId" IS NOT NULL` (cột đã kiểm: `prisma/schema.prisma:396`, `:409`); (2) `COUNT(*) FROM "User" WHERE "lastLoginAt" >= now() - interval '14 days'` (`:726`); (3) `COUNT(*) FROM "UserOrgRole"` (`:355`). Đọc giá trị env `RBAC_V2_ENABLED` **thật** trên bảng điều khiển Vercel — **KHÔNG đọc file `.env`**.
- **Ai chạy:** Luân (chủ LOGIN/RBAC, người giữ đồng hồ shadow — `docs/ke-hoach-go-live-2607/README.md:13`)
- **Thời lượng:** ≤ 3 giờ
- **Chỉ số:** (a) số **NGÀY liên tiếp** có CẦN XỬ LÝ = 0 trong 14 ngày; (b) số **TÀI KHOẢN thật** có thao tác trong 14 ngày; (c) số **DÒNG `UserOrgRole`** trên prod
- **Ngưỡng đạt:** ĐẠT khi (a) ≥ 5 **VÀ** (b) ≥ 8 (bằng số vai trò bị flip tác động) **VÀ** (c) > 0. TRƯỢT khi (a) < 5, HOẶC (b) < 8, HOẶC (c) = 0 — trường hợp (c) = 0 thì "đồng hồ xanh" là **xanh giả** (`docs/ke-hoach-go-live-2607/shadow-log.md:74-76`: prod chưa có `UserOrgRole` nào, `Employee` active = 1, tài khoản nhân viên = 3, không học viên).
- **Nếu trượt:** **A9 SAI** ⇒ làn B (`02-prd:425-437`) **không có mốc khởi động** và **KHÔNG** được xếp lịch theo "số ngày sạch". Vòng tròn thứ tự phải được Ban cắt tường minh: **hoặc** cho phép `R-QDB-01/02/03` làm **NGAY TRONG** cửa sổ shadow (chúng đổi hành vi v2 → chấp nhận TRUNCATE + đếm lại đồng hồ), **hoặc** đổi tiêu chí đóng cửa sổ từ *"đủ ngày"* sang *"đủ traffic tối thiểu theo vai trò"*. Chưa trả lời thì `R-QDB-05` (`02-prd:245`, chặn cứng CI) **không có nghĩa** và `R-D4-12` treo theo. Đây đúng là §9 câu 12 (`:465`) — đưa vào phiên quyết **cùng kết quả đo**. **Ai phải biết:** Ban giám đốc · chủ đợt go-live RBAC · Luân · Kiệt.
- **Cờ 1:** KHÔNG — **Cờ 2:** KHÔNG

### GD-62 — Phân biệt "đồng hồ shadow báo 0 vì sạch" với "báo 0 vì không ai ghi"

- **Loại:** TRUY_VẤN_CHỈ_ĐỌC
- **Việc cụ thể:** Ba phần, đều chỉ đọc, **cùng một buổi**. **(A)** Trạng thái bảng — `RbacShadowDiff` có đúng **6 cột** (`id, action, userId, v1, v2, targetKey, createdAt`, `prisma/schema.prisma:548-559`): `SELECT count(*), min("createdAt"), max("createdAt") FROM "RbacShadowDiff"` và `SELECT date_trunc('day',"createdAt"), count(*) … GROUP BY 1 ORDER BY 1 DESC LIMIT 30`. **(B)** Mốc đối chiếu: thời điểm chạy gần nhất của workflow *"Reset đồng hồ shadow"* (`.github/workflows/truncate-shadow-diff.yml`, chỉ chạy tay) và của cron `.github/workflows/shadow-report.yml`, lấy từ tab Actions. **(C)** Tính **SỐ LỆCH KỲ VỌNG** offline trên bản sao chỉ-đọc: mỗi tài khoản đang hoạt động × mọi action khai trong `lib/auth/permissions.ts`, gọi `evaluatePermission` (`lib/auth/permission-eval.ts:23-27`, xuất lại ở `lib/auth/check-permission.ts:12`), đếm cặp `(user, action)` có `v1 ≠ v2`. `docs/taicautruc/00-baseline.md:108` ghi **42 action mất khi flip** (`CENTER_MANAGER` −29, `CENTER_HR` −10, `TEACHER` −3) → nếu có tài khoản `CENTER_MANAGER` hoạt động thì số lệch kỳ vọng **phải > 0**. So (C) với (A).
- **Ai chạy:** Kiệt
- **Thời lượng:** nửa ngày
- **Chỉ số:** số dòng `RbacShadowDiff` kể từ lần TRUNCATE gần nhất · ngày có dòng mới gần nhất · số cặp (tài khoản × action) **LỆCH KỲ VỌNG** tính offline
- **Ngưỡng đạt:** ĐẠT ("0 lệch" là số thật) khi (C) > 0 **VÀ** bảng có dòng phát sinh trong **7 ngày** gần nhất. TRƯỢT — ghi **"KHÔNG ĐO"**, không phải "SẠCH" — khi (C) > 0 nhưng bảng = 0 dòng kể từ lần TRUNCATE, hoặc không có dòng nào trong 7 ngày dù có tài khoản `CENTER_MANAGER` hoạt động.
- **Nếu trượt:** Không được dùng *"N ngày sạch"* làm điều kiện mở làn B. Trước khi lấy lại đồng hồ làm tiêu chí phải: **(1)** cấy **1 dòng lệch cố ý** (một action thử nghiệm có v1≠v2, chạy 1 lần trên prod) và xác nhận nó xuất hiện — nếu không, đường ghi **fire-and-forget đang nuốt lỗi** (`lib/auth/shadow-report.ts:36-38` — `catch { return false }`); **(2)** sửa `docs/ke-hoach-go-live-2607/shadow-log.md` (file tự mâu thuẫn: header ghi CHƯA CHẠY, mục 10/07 ghi đã đo 3 vòng). Chặn theo: `R-QDB-05` · `R-QDB-04` · `R-D4-12` và **toàn bộ B1→B7**. **Ai phải biết:** Luân · Kiệt · Ban giám đốc.
- **Cờ 1:** KHÔNG — **Cờ 2:** KHÔNG

### GD-26 — Đếm công suất thật: PR merge 4 tuần + ngày-công còn nợ của đợt go-live 26/07

- **Loại:** ĐỐI_SOÁT_TÀI_LIỆU
- **Việc cụ thể:** Đo **hành vi**, không hỏi ý kiến. **(a)** Trên branch `main` (branch chuẩn): `git log --since="4 weeks ago" --merges --first-parent main --format="%an"` đếm theo tác giả; `git log --since="4 weeks ago" --no-merges --format="%an"` đếm commit theo tác giả. **(b)** Đối soát `docs/ke-hoach-go-live-2607/README.md` mục 4: đếm ngày-công của mọi dòng còn ⬜/🟡, đối chiếu con số tự khai ở `:62` (Kiệt ~39, Luân ~46 ngày-công / ~20 ngày còn lại) và `:66` (tổng ~103 ngày-công cho 3 người / ~20 ngày làm việc → **quá tải ~2×**). **(c)** Công suất giao được cho chương trình 112 yêu cầu = (3 người × 20 ngày) − (b). Chỉ đọc git + đọc file kế hoạch; **KHÔNG** đọc `.env`, **KHÔNG** chạy lệnh DB.
- **Ai chạy:** Vy (đếm git + đối soát README — **không phải người đang bị đo công suất backend**)
- **Thời lượng:** ≤ 2 giờ
- **Chỉ số:** (a) số commit/PR merge vào `main` trong 28 ngày, tách theo tác giả; (c) số **NGÀY-CÔNG/tháng** còn giao được cho chương trình nhượng quyền
- **Ngưỡng đạt:** ĐẠT khi (c) ≥ 20 ngày-công/tháng (≈ 1 người toàn thời gian). TRƯỢT khi (c) < 20, HOẶC (a) cho thấy ≤ 2 người có commit vào `main` trong 28 ngày.
- **Nếu trượt:** Con số *"Đội kỹ thuật (4–5 dev)"* (`02-prd:31`) phải sửa thành **đội thật (3 người** — `README.md:12-16`, Huy & Trí rời 03/07**)**, và **A7** (`02-prd:387`) đổi từ *"lộ trình giãn ra, thứ tự vẫn đúng"* sang **"phải cắt phạm vi"**. Quan trọng hơn lịch: các gói **BẮT BUỘC đi cùng MỘT lần phát hành** phải được bảo vệ bằng **quy tắc phát hành**, không bằng lịch — `R-D2-16+17+18` (`:399-401`), `R-QDB-02+03` (`:440`), `R-D3-10` đã gộp từ `R-D8-10` (`:366-367`). **Thiếu người ⇒ HOÃN cả gói, KHÔNG tách để chia việc.** Cơ chế bảo vệ còn lại là review chéo Kiệt↔Luân (`README.md:69`) — **hai người trong số ba**, phải khai là rủi ro tồn dư. **Ai phải biết:** Ban giám đốc (quyết cắt phạm vi hay dời mốc) · Kiệt · Luân.
- **Cờ 1:** KHÔNG — **Cờ 2:** KHÔNG

### GD-28 — Đếm bản ghi tiền THIẾU đơn vị và bản ghi tiền SAI đơn vị

- **Loại:** TRUY_VẤN_CHỈ_ĐỌC
- **Việc cụ thể:** 4 câu SELECT trên prod, **KHÔNG UPDATE**. **(1)** `COUNT(*) FROM "Payment" WHERE "centerId" IS NULL AND "deletedAt" IS NULL`, tách theo `EXTRACT(year FROM "paidDate")`. **(2)** `COUNT(*) FROM "Payment" p JOIN "Order" o ON o.id=p."orderId" WHERE p."centerId" IS NOT NULL AND o."centerId" IS NOT NULL AND p."centerId" <> o."centerId" AND p."deletedAt" IS NULL`. **(3)** như (2) nhưng JOIN `"Enrollment" e ON e.id=p."enrollmentId"`, so `p."centerId" <> e."centerId"`. **(4)** `COUNT(*) FROM "Receipt" r JOIN "Payment" p ON p.id=r."paymentId" WHERE p."centerId" IS NULL` — phiếu thu **không suy được đơn vị** (Receipt **không có** `centerId` lẫn `orgUnitId`, `prisma/schema.prisma:4954-4970`). Cột đã mở kiểm: `Payment.orderId/enrollmentId/paidDate/centerId/deletedAt` = `:4920`, `:4922`, `:4926`, `:4941`, `:4945`; `Order.centerId/orgUnitId` = `:3107-3108`; `Enrollment.centerId` = `:1349`. Công thức gán hiện tại **rơi về đơn vị của NGƯỜI THAO TÁC**: `lib/finance/payment.ts:92-98` (order → lead → actor), tự khai ở chú thích `:62` — **đúng cái `R-D10-07` cấm** (`02-prd:297`).
- **Ai chạy:** Kiệt (chủ FIN); kết quả bàn giao Kế toán tổng hợp HO
- **Thời lượng:** ≤ 3 giờ
- **Chỉ số:** (1) % `Payment` không suy được đơn vị, tách theo năm; (2)+(3) **SỐ** bản ghi `Payment` gán **SAI** cơ sở so với đơn hàng / ghi danh; (4) số `Receipt` không suy được đơn vị
- **Ngưỡng đạt:** ĐẠT khi (2)+(3) = **0** VÀ (1) ≤ **2%** VÀ **không dòng nào** của (1) rơi vào **kỳ kế toán đã đóng**. TRƯỢT khi (2)+(3) > 0, HOẶC (1) > 2%, HOẶC có dòng thuộc kỳ đã đóng.
- **Nếu trượt:** (2)+(3) > 0 ⇒ dữ liệu **SAI** chứ không chỉ **THIẾU**: `R-D10-08` (`:298`) phải đổi từ *"nạp bằng suy diễn"* sang **"xuất danh sách cho người xác nhận TỪNG DÒNG"**, và `R-OPS-05` (`:325`) lấy đúng con số này làm **điều kiện dừng**. (1) > 2% hoặc chạm kỳ đã đóng ⇒ `R-OPS-03` (`:323`) **KHÔNG** được hẹn ngày ký cho tới khi có bước xử lý tồn đọng **có chủ + có lịch**; **B5 đứng im** (`:434`), kéo theo `R-D4-09`, `R-D10-04`, `R-D10-10` — tức **toàn bộ căn cứ tính phí thương hiệu**. ⚠️ **Lưu ý lịch:** thí nghiệm này chỉ đọc, nhưng **bước NẠP LẠI `centerId`** sau đó mới là việc chạm **Cờ 2** (`Payment` ∈ `SCOPED_MODELS`, `lib/db-scope.ts:18` → đổi tập bản ghi actor cấp cơ sở đọc được) → **phải đi chung lịch với đợt security hardening**. **Ai phải biết:** Kế toán tổng hợp HO · Ban giám đốc · Kiệt.
- **Cờ 1:** KHÔNG — **Cờ 2:** KHÔNG *(phép đo. Việc VÁ đi kèm thì Cờ 2 = CÓ — ghi ở `R-D10-08`)*

### GD-46 — Đếm độ phân kỳ thật giữa hai trục `centerId` và `orgUnitId`

- **Loại:** TRUY_VẤN_CHỈ_ĐỌC
- **Việc cụ thể:** `[QS]` **26 model** mang **cả hai** cột (khớp `02-prd:354`): `MessengerConversation, Room, Holiday, User, Lead, Student, ClassGroup, Class, Employee, StockBalance, StockMovement, InventoryAudit, Order, TrialClass, Notification, ShiftRegistration, TimesheetAdjustmentRequest, CenterDayChecklist, EmployeeCheckin, MakeupNeed, StudentRiskAlert, StudentCareTask, Survey, SurveyResponse, StudentCenterHistory, SataCoinTransaction`. `OrgUnit.centerId` là `@unique`, chỉ cho `type=CENTER` (`prisma/schema.prisma:304`). Chạy trên prod bằng `DIRECT_URL`, **CHỈ SELECT**, mỗi model 1 dòng:
  ```sql
  SELECT 'Class' AS model,
    count(*) FILTER (WHERE t."orgUnitId" IS NOT NULL AND t."centerId" IS NOT NULL
                     AND o."centerId" IS DISTINCT FROM t."centerId") AS lech_hai_truc,
    count(*) FILTER (WHERE t."centerId" IS NOT NULL AND t."orgUnitId" IS NULL) AS thieu_org,
    count(*) FILTER (WHERE t."orgUnitId" IS NOT NULL AND t."centerId" IS NULL) AS thieu_center,
    count(*) AS tong
  FROM "Class" t LEFT JOIN "OrgUnit" o ON o.id = t."orgUnitId";
  ```
  `UNION ALL` cho đủ 26 bảng. Thêm 1 truy vấn **tách theo mốc thời gian** (`createdAt >=` ngày triển khai PR-A) để biết bản ghi **MỚI** có nhất quán không — đúng điều PRD tự nhận là **ràng buộc duy nhất còn hiệu lực** (`02-prd:354`). Kèm 2 truy vấn phụ: `SELECT count(*) FROM "Center" c LEFT JOIN "OrgUnit" o ON o."centerId"=c.id WHERE o.id IS NULL` (Center mồ côi) và `SELECT count(*) FROM "Payment" WHERE "centerId" IS NULL` — `[QS]` `Payment` hiện **chưa có** `orgUnitId` (`prisma/schema.prisma:4941` chỉ có `centerId`); `Receipt` (`:4954-4970`) **không có cả hai**.
- **Ai chạy:** Kiệt
- **Thời lượng:** 2 giờ
- **Chỉ số:** 3 con số/model (hai trục **chỏi nhau** · NULL một bên · tổng), **tách riêng** bản ghi cũ và bản ghi tạo sau ngày triển khai PR-A. Cộng: số `Center` mồ côi, số `Payment` thiếu `centerId`.
- **Ngưỡng đạt:** ĐẠT khi `lech_hai_truc` = **0** trên cả 26 model **VÀ** với bản ghi tạo sau PR-A thì `thieu_org` = **0** **VÀ** `Center` mồ côi = **0**. TRƯỢT khi bất kỳ ô nào > 0.
- **Nếu trượt:** **Không mở cơ sở của bên NHẬN nhượng quyền** trước khi trả lời §9 câu 15 (`02-prd:468` — bảng chủ là `Center` hay `OrgUnit`). Phải hoãn/đổi: `R-D4-13` (lọc include lồng — không biết lọc theo trục nào) · `R-D10-06/07/08` (nếu `Payment.centerId` đã lệch thì backfill `orgUnitId` **nhân đôi sai số vào SỔ TIỀN**) · `R-D2-16/19/20` (có `Center` mồ côi thì `R-D2-19` chưa xong, `R-D2-20` chưa đặt ràng buộc được). **Ai phải biết:** Ban giám đốc (chủ câu 15) · Kiệt (migration prod) · Luân (`scopedDb` lọc theo trục `centerId`).
- **Cờ 1:** KHÔNG — **Cờ 2:** KHÔNG

### GD-59 — Đếm số tài khoản mà trục `User.centerId` đã lệch khỏi trục hồ sơ nhân sự

- **Loại:** TRUY_VẤN_CHỈ_ĐỌC
- **Việc cụ thể:** Chạy trên prod bằng `DIRECT_URL`, **CHỈ SELECT**. `[QS]` Cột có thật: `User.centerId` (`prisma/schema.prisma:717`) · `User.employeeId → Employee` (`:739`, quan hệ `"UserEmployee"`) · `Employee.centerId` (`:1973`) · `EmployeeOrgAssignment(employeeId, orgUnitId, assignmentType, effectiveFrom/To, status)` (`:446-461`) · `OrgUnit.centerId` (`:304`).
  **(A)** Lệch tài khoản ↔ biên chế: `SELECT u.id, u.email, u."centerId", e."centerId" FROM "User" u JOIN "Employee" e ON e.id=u."employeeId" WHERE u."deletedAt" IS NULL AND u."isActive" AND u."centerId" IS DISTINCT FROM e."centerId"`.
  **(B)** Lệch tài khoản ↔ phân công `PRIMARY` còn hiệu lực: JOIN thêm `"EmployeeOrgAssignment" a ON a."employeeId"=e.id AND a."assignmentType"='PRIMARY' AND a.status='ACTIVE' AND a."effectiveFrom" <= now() AND (a."effectiveTo" IS NULL OR a."effectiveTo" >= now())` rồi `JOIN "OrgUnit" o ON o.id=a."orgUnitId"`, so `u."centerId" IS DISTINCT FROM o."centerId"`.
  **(C)** Tài khoản hoạt động **không gắn** `Employee` nào (loại `PARENT`).
  **(D)** Kiểm kê bề mặt: `grep -rn 'user\.centerId' app lib --include=*.ts --include=*.tsx | grep -v test`, phân loại 3 nhóm — nhóm **đã được `R-D3-10` phủ** (danh sách GV chọn được: `lib/teachers/assignable.ts:38` lọc thuần theo `centerId`; guard máy chủ: `app/(admin)/admin/classes/_actions.ts:54-73`), nhóm **chỉ hiển thị**, nhóm **quyết định phạm vi dữ liệu**.
- **Ai chạy:** Kiệt
- **Thời lượng:** 2 giờ
- **Chỉ số:** số tài khoản lệch ở (A), ở (B), số tài khoản **mồ côi hồ sơ** ở (C); bảng phân loại các nơi đọc `user.centerId` theo 3 nhóm, kèm **số nơi `R-D3-10` KHÔNG phủ**
- **Ngưỡng đạt:** ĐẠT khi (A) = 0 **VÀ** (B) = 0 **VÀ** số nơi **quyết định phạm vi dữ liệu** nằm ngoài 3 bề mặt của `R-D3-10` = **0**. TRƯỢT khi bất kỳ số nào > 0.
- **Nếu trượt:** `R-D3-03` (`02-prd:218`) phải bổ sung **một yêu cầu con**: đồng bộ `User.centerId` **trong cùng transaction** với `Employee`/phân công `PRIMARY`, kèm **truy vấn đối soát = 0 dòng** làm tiêu chí nghiệm thu (tiêu chí hiện tại chỉ nói tới `Employee.centerId/orgUnitId`). `R-D3-10` phải kèm **danh sách đích danh** các nơi còn lại phải chuyển sang hàm của `R-D3-09` (`:224`), không dừng ở 3 chỗ. Nếu (C) > 0 thì `R-D3-03` **chưa có nguồn sự thật** cho lớp tài khoản đó — hỏi Ban (**c22**). **Ai phải biết:** Luân · Vy (UI phân quyền hiển thị cơ sở của tài khoản) · Kiệt.
- **Cờ 1:** KHÔNG — **Cờ 2:** KHÔNG

### GD-06 — Đối chiếu Σ khoản thu đã xác nhận với Σ giá phải thu trên CS1/CS2

- **Loại:** TRUY_VẤN_CHỈ_ĐỌC
- **Việc cụ thể:** 1 bộ SELECT chỉ-đọc trên prod, **3 tháng gần nhất**, nhóm theo cơ sở. **A** = `SUM("Payment"."amount") WHERE "accountantStatus"='CONFIRMED' AND "deletedAt" IS NULL AND "paidDate"` trong kỳ, `GROUP BY "Payment"."centerId"`. **B** = `SUM(COALESCE("Enrollment"."finalPrice","Enrollment"."tuition")) WHERE "deletedAt" IS NULL AND "status" IN ('ACTIVE','CONFIRMED','STUDYING') AND "enrolledAt"` trong kỳ, `GROUP BY "Enrollment"."centerId"`. Xuất bảng `(centerId, A, B, (A−B)/B, số Enrollment trong kỳ)`. Cột đã mở kiểm: `Payment.amount/accountantStatus/centerId/deletedAt/paidDate` = `prisma/schema.prisma:4924`, `:4931`, `:4941`, `:4945`, `:4926`; `Enrollment.status/centerId/tuition/finalPrice/deletedAt` = `:1346`, `:1349`, `:1355`, `:1363`, `:1386`; enum `EnrollmentStatus` `:71-83`. **KHÔNG** dùng `Receipt` vì `Receipt` không có `centerId` lẫn `orgUnitId` (`:4954-4970`). Đo trên **CS1/CS2** vì đây là nơi **không có động cơ giấu** → chính là **sàn nhiễu**.
- **Ai chạy:** Kiệt (chủ FIN, có `DIRECT_URL` prod); kết quả bàn giao Kế toán tổng hợp HO
- **Thời lượng:** ≤ 2 giờ
- **Chỉ số:** `|A − B| / B` theo **TỪNG** cơ sở nội bộ (CS1, CS2), 3 tháng gần nhất
- **Ngưỡng đạt:** Chỉ kết luận khi **số Enrollment trong kỳ ≥ 30/cơ sở**. ĐẠT khi lệch ≤ **10%** ở **CẢ** CS1 và CS2. TRƯỢT khi bất kỳ cơ sở nào lệch > 10%.
- **Nếu trượt:** `R-D9-09` (`02-prd:287`) và `R-D10-12` (`:302`) phải đổi **căn cứ tính phí** từ *"tổng khoản thu trong hệ"* sang **"số học viên đang học × đơn giá hợp đồng"** (dữ liệu đã có: `Enrollment.listPrice/finalPrice`, `prisma/schema.prisma:1360`, `:1363`) — vì ngay ở cơ sở **không có động cơ giấu** mà sổ đã lệch, thì ở FRANCHISEE con số đó **không bảo vệ được**. Kéo theo `R-D10-04` và `R-OPS-03` (`:323`) **không được hẹn ngày ký**. **Ai phải biết:** Ban giám đốc · Kế toán tổng hợp HO · Kiệt.
- **Cờ 1:** KHÔNG — **Cờ 2:** KHÔNG

### GD-24 — Đo phân bố lượt mở SCORM quanh ngày buổi + tỉ lệ lượt mở KHÔNG gắn buổi

- **Loại:** TRUY_VẤN_CHỈ_ĐỌC
- **Việc cụ thể:** 3 câu SELECT trên prod, **đúng thứ tự**. **(0)** `SELECT COUNT(*) FROM "ScormAccessLog"` — kiểm **mẫu tối thiểu trước**. **(1)** `COUNT(*) FILTER (WHERE "classSessionId" IS NULL)::float / COUNT(*)`. **(2)** Trên phần còn lại: `JOIN "ClassSession" cs ON cs.id = l."classSessionId"`, `d = EXTRACT(day FROM l."openedAt" - cs."date")`, lập histogram theo `d` và tính tỉ lệ `|d| > 7`. Cột đã mở kiểm: `ScormAccessLog(packageId, classSessionId String? nullable, userId, openedAt, ip)` = `prisma/schema.prisma:4686-4698`; `ClassSession.date` = `:1443`. Đã đọc trọn `ClassSession` `:1440-1502` (dòng mở `model` ở `:1440`, dòng đóng `}` ở `:1502`) — **không có** trường "thời gian mở nội dung"; `openAt` chỉ tồn tại trên `Exam` (`:2318`) ⇒ **mốc duy nhất khả dụng là `ClassSession.date`**, đúng như `R-D8-07` định nghĩa.
- **Ai chạy:** Kiệt (chủ SCORM/LMS)
- **Thời lượng:** ≤ 2 giờ
- **Chỉ số:** (0) tổng số dòng nhật ký; (1) % lượt mở có `classSessionId IS NULL`; (2) % lượt có `|openedAt − ClassSession.date| > 7 ngày`
- **Ngưỡng đạt:** **CHỈ** kết luận khi (0) ≥ **200 dòng** — dưới ngưỡng đó prod chưa đủ traffic (`shadow-log.md:74-76`: 3 tài khoản nhân viên, không học viên) và kết quả **KHÔNG dùng được**. ĐẠT khi (1) ≤ 10% **VÀ** (2) ≤ 20%. TRƯỢT khi (1) > 10% HOẶC (2) > 20%.
- **Nếu trượt:** (1) trượt ⇒ `R-D8-07` phải định nghĩa **TƯỜNG MINH** hành vi cho lượt mở **không có buổi** TRƯỚC khi viết cửa sổ (nếu không, fail-closed sẽ khoá luôn nhóm này), và `R-D8-14` (`02-prd:271`) phải thêm ca *"không có buổi"* vào ma trận 4 điều kiện. (2) trượt ⇒ `unlockDaysBefore/After` **không được đặt hằng**, phải cấu hình theo khoá qua `R-D6-05` (`:199`) và `R-D8-14` thêm ca *"ngoài cửa sổ nhưng hợp lệ"*. Nếu (0) < 200 ⇒ giả định **không kiểm được bằng dữ liệu**, chuyển thành **câu hỏi** cho Đội Đào tạo HO về giá trị mặc định cửa sổ (`03-job-stories.md:159` ghi BGĐ chưa chốt; = **b1**). **Ai phải biết:** Đội Đào tạo HO · Kiệt · Ban giám đốc.
- **Cờ 1:** KHÔNG — **Cờ 2:** KHÔNG

### GD-50 — Kiểm kê khoá duy nhất toàn cục và số nơi tra cứu theo khoá đó (8 bảng danh mục `R-D6-02` gọi tên)

- **Loại:** TRUY_VẤN_CHỈ_ĐỌC
- **Việc cụ thể:** Hai phần, đều chỉ đọc. **(A)** Ràng buộc thật trên prod:
  ```sql
  SELECT t.relname AS bang, i.relname AS chi_muc, pg_get_constraintdef(c.oid) AS dinh_nghia
  FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_class i ON i.oid=c.conindid
  WHERE c.contype='u' AND t.relname IN
    ('PaymentMethod','Voucher','EmailTemplate','Product','InventoryItem','CoursePackage','Room','Holiday');
  ```
  `[QS]` Đối chiếu schema: `PaymentMethod.code @unique` (`prisma/schema.prisma:3048`) · `Voucher.code` (`:3301`) · `EmailTemplate.code` (`:3535`) · `Product.sku` (`:3423`) · `InventoryItem.itemCode` (`:2647`) · `CoursePackage.slug` (`:1703`; cột `code` ở `:1704` **KHÔNG** unique) → **6 bảng khoá duy nhất TOÀN CỤC**. `Room` đã ghép `@@unique([centerId, code])` (`:678`) — **đã đúng mức độc lập**. `Holiday` **không có** ràng buộc duy nhất nào (`:695-705`). **(B)** Đếm nơi phải sửa nếu hạ khoá xuống dạng ghép với đơn vị: grep các call-site `findUnique/findFirst/upsert` theo `code`/`sku`/`slug`/`itemCode` trong `lib` + `app` (bỏ test), **tách riêng** nhóm `PaymentMethod` (đường **TIỀN**). Kèm `SELECT count(*)` mỗi bảng để biết **cỡ backfill**.
- **Ai chạy:** Kiệt
- **Thời lượng:** 3 giờ
- **Chỉ số:** số bảng còn khoá duy nhất **TOÀN CỤC** trên khoá nghiệp vụ (kỳ vọng **6**) · tổng số nơi tra cứu phải sửa · trong đó bao nhiêu thuộc nhóm `PaymentMethod`
- **Ngưỡng đạt:** **GIỮ** ước lượng cỡ **L** của `R-D6-03` khi: số bảng phải hạ khoá ≤ 6 **VÀ** tổng nơi tra cứu ≤ **30** **VÀ** nhóm `PaymentMethod` ≤ **5** nơi. TRƯỢT khi tổng > 30, hoặc nhóm `PaymentMethod` > 5.
- **Nếu trượt:** `R-D6-03` phải **TÁCH theo từng bảng** và xếp lại cỡ; nhóm `PaymentMethod` tách thành **một thẻ riêng có đối soát tiền đi kèm** (không gộp chung danh mục thường). `R-D6-02` phải ghi bổ sung: *"hai cơ sở không đọc thấy bản ghi của nhau"* **KHÔNG đạt được nếu chưa hạ khoá duy nhất** — hiện **không mã nào phủ việc hạ khoá**, phải mở mã mới hoặc mở rộng `R-D6-03`. Ghi rõ trong PRD: `Room` **đã đạt sẵn** (khỏi làm); `Holiday` **không có khoá duy nhất** nên là **ca khác hẳn** (rủi ro trùng lặp, không phải rủi ro chặn). **Ai phải biết:** Kiệt (đường tiền) · Luân (`R-D6-04` chặn truy vấn thẳng ở tầng ứng dụng).
- **Cờ 1:** KHÔNG — **Cờ 2:** KHÔNG

### GD-32 — Chốt vai trò pháp lý về dữ liệu + trình bảng trường PII sẽ chảy sang HO

- **Loại:** CÂU_HỎI_QUYẾT_ĐỊNH *(ứng §9 câu 8, `02-prd:461` — câu GỐC, F2–F7 treo theo; chạm thêm câu 13, `:466`)*
- **Việc cụ thể:** **Không phải thí nghiệm đo lường** — chỉ Ban trả lời được. Phần chuẩn bị **đo được**: Kiệt lập bảng **ĐỌC TỪ SCHEMA** (không suy đoán) liệt kê **từng trường dữ liệu cá nhân** sẽ chảy sang HO khi mở đủ **5 nhóm chi tiết** của `R-D10-04` (`02-prd:294` — học phí từng khoản thu · giảm giá từng đơn · hoàn tiền từng yêu cầu · công nợ từng đơn · điểm danh từng buổi từng học viên): từ `Order` (`customerName/customerPhone/customerEmail/customerCccd` — `prisma/schema.prisma:3092-3098`), `Payment` (`amount/method/paidDate` — `:4924-4926`), `Receipt` (`code/issuedAt` — `:4956`, `:4962`), `Enrollment` (`finalPrice/discountAmount` — `:1362-1363`), `Student` + `Attendance` từng buổi; **kèm TỔNG SỐ TRƯỜNG**. Đưa bảng cho **pháp chế** VÀ cho **bên NHẬN nhượng quyền đầu tiên** xem **TRƯỚC khi ký**, rồi mới mở phiên quyết.
- **Ai chạy:** Ban giám đốc (quyết, cùng pháp chế); Kiệt chuẩn bị bảng trường từ schema
- **Thời lượng:** chuẩn bị 4 giờ (Kiệt) + 1 phiên quyết 60 phút (BGĐ + pháp chế)
- **Chỉ số:** **có văn bản trả lời của Ban giám đốc + pháp chế cho §9 câu 8, ghi ngày** · số **TRƯỜNG** dữ liệu cá nhân chảy sang HO khi mở đủ 5 nhóm · số nhóm trong 5 nhóm **bị bên nhận đầu tiên gạch** khi đàm phán
- **Ngưỡng đạt:** ĐẠT khi có **văn bản ghi ngày** trả lời §9 câu 8 **VÀ** bên nhận đầu tiên gạch **0/5** nhóm. TRƯỢT khi bất kỳ nhóm nào bị gạch, HOẶC phiên kết thúc **không có văn bản**. *(“Đã hỏi” **không** tính là đạt.)*
- **Nếu trượt:** Mức chi tiết của `R-D10-04` phải **CẤU HÌNH THEO HỢP ĐỒNG**, không đóng cứng vào code — viết lại tiêu chí nghiệm thu `R-D10-04` theo **tham số hợp đồng**, và `R-D10-05` (5 chỉ số tổng hợp) trở thành **mặc định**. `R-DP-01` (`:341`) và **toàn bộ nhóm 8** mở khoá theo câu trả lời; `R-DP-07` (`:347`) thêm ràng buộc theo vai trò pháp lý. Nếu **KHÔNG có văn bản**: **cấm khởi công `R-D10-04`** (cỡ L) — xây rồi bỏ, hoặc tệ hơn là HO **đã hút dữ liệu cá nhân trẻ em của pháp nhân khác**. Giữ nguyên cách cắt phụ thuộc: `R-D4-09` chỉ phụ thuộc `R-D10-03`, **TUYỆT ĐỐI không** phụ thuộc `R-D10-04` (`:369`, `:443`). **Ai phải biết:** Ban giám đốc · pháp chế · Kiệt · Kế toán tổng hợp HO.
- **Cờ 1:** KHÔNG — **Cờ 2:** KHÔNG

### GD-09 — Thử tái tạo bộ slide bằng điện thoại trong 10 phút (có văn bản đồng ý)

- **Loại:** QUAN_SÁT_NGƯỜI_DÙNG
- **Việc cụ thể:** 1 giáo viên (**báo trước, có văn bản đồng ý**) mở 1 gói SCORM hoặc giáo án PDF của **MỘT** buổi qua khung `SlideStage` (`components/admin/slide-stage.tsx`) và dùng điện thoại chụp lại trong **đúng 10 phút**. Người quan sát đếm: số slide chụp được **ĐỌC RÕ nội dung** / tổng số slide của buổi; và trên mỗi ảnh, **dấu chìm** có đọc rõ mã nhân viên + đồng hồ không (watermark dựng ở `:51-52`, cập nhật mỗi giây `:88-93`). Ghi thêm: blur khi rời tab (`:57-65`) và chặn chuột phải + Ctrl/Cmd+P/S (`:98`, `:110-113`) có cản trở gì **đường điện thoại** không. Chú thích trong chính mã nguồn đã tự nhận: *"KHÔNG thể chặn chụp màn hình OS (PrintScreen / Win+Shift+S) từ web — watermark là biện pháp răn đe chính"* (`:11-12`).
- **Ai chạy:** Kiệt (dựng phiên + chấm ảnh); người thao tác = 1 GV CS1 **có văn bản đồng ý**; Đội Đào tạo HO chứng kiến
- **Thời lượng:** 30 phút (chưa kể 1 giờ xin văn bản đồng ý)
- **Chỉ số:** (a) % slide lấy được **đọc rõ** / tổng slide của buổi; (b) % ảnh chụp **đọc rõ mã nhân viên** trong dấu chìm
- **Ngưỡng đạt:** TRƯỢT khi (a) > **80%** **VÀ** (b) < **50%** (lấy được gần hết mà **không truy vết được ai**). ĐẠT khi (a) ≤ 80% **HOẶC** (b) ≥ 90%.
- **Nếu trượt:** `R-D8-07` (cỡ L, đắt nhất nhóm D8) **mất lý do ưu tiên**: cửa sổ mở khoá **không chạm được đường điện thoại**. Phải đưa **"DRM/chặn tải"** trở lại bàn quyết — hiện nằm ở danh sách **KHÔNG LÀM** (`02-prd:373`, `:119`) — **TRƯỚC** khi xếp lịch `R-D8-07`; **hoặc** chuyển trọng tâm D8 sang `R-D8-11` (nhật ký để truy vết sau, `:268`) cộng **điều khoản hợp đồng**, và hạ `R-D8-07` xuống sau. `R-D8-12` giữ nguyên vì *"ĐÃ CÓ, không làm lại"* (`:269`). **Ai phải biết:** Ban giám đốc · Đội Đào tạo HO (chủ nghiệp vụ D8) · Kiệt.
- **Cờ 1:** KHÔNG — **Cờ 2:** KHÔNG

### GD-45 — Đo lưới an toàn: cố tình đục hàng rào cách ly rồi xem bộ test có bắt được không

- **Loại:** TEST_KỸ_THUẬT
- **Việc cụ thể:** Trên **một nhánh vứt** (KHÔNG merge, KHÔNG đụng prod), 3 phép đục **độc lập**, chạy lại toàn bộ test trên **Postgres LOCAL**:
  **(Đ1)** `lib/db-scope.ts:222` — sửa `injectScope()` thành `return args` (bỏ toàn bộ lọc đọc) → chạy **5 job CI hiện có** (`.github/workflows/ci.yml:110` e2e, `:191` e2e-a0, `:262` e2e-r7, `:328` e2e-fl, `:392` e2e-teacher).
  **(Đ2)** Trong 1 Server Action ghi bất kỳ có `passesScope()` (vd `app/(admin)/admin/classes/[id]/session/_actions.ts:27`) — **gỡ** lời gọi `passesScope` → chạy lại 5 job, **RỒI** chạy thêm `pnpm test:e2e:crm` (`package.json:38` → `playwright.crm.config.ts:14` `testDir: "./tests/e2e/crm"`, spec `import-registered-isolation.spec.ts` dài **235 dòng**).
  **(Đ3)** `lib/db-scope.ts:184` và `:218` — đổi `actor.isHoLevel ? "ALL"` thành `"ALL"` **vô điều kiện** → chạy lại 5 job.
  Ngoài ra đếm **mã vai trò thật sự được dựng** trong spec CI (`grep -ohE 'CENTER_[A-Z_]+|HO_[A-Z_]+|TEACHER|TRAINING|SALES_CSM|ACCOUNTANT|MARKETING|HR' tests/e2e/{a0,r7,fl,teacher} -r | sort -u | wc -l`). Ghi lại: mỗi phép đục làm **ĐỎ** job nào, spec nào, dòng nào.
- **Ai chạy:** Luân
- **Thời lượng:** nửa ngày (3 lượt chạy 5 job, phần lớn là thời gian máy)
- **Chỉ số:** số phép đục (trên 3) bị **ÍT NHẤT một job CI mặc định** bắt được; số mã vai trò phân biệt được dựng trong spec CI (đích **9**)
- **Ngưỡng đạt:** ĐẠT khi Đ1 làm đỏ ≥1 job trong **5 job CI mặc định**, **VÀ** Đ2 làm đỏ ≥1 job trong 5 job đó (**không tính** `e2e:crm` — `[QS]` grep `crm` trong `.github/workflows/ci.yml` = **0 dòng**, job này **không có trong CI**), **VÀ** Đ3 làm đỏ ≥1 job. TRƯỢT khi bất kỳ phép đục nào giữ **5/5 job xanh**, hoặc số mã vai trò phân biệt < 9.
- **Nếu trượt:** Câu *"test cách ly vẫn xanh"* **KHÔNG** còn dùng được làm tiêu chí nghiệm thu cho `R-D2-24` (`02-prd:187`) và `R-QDC-03`, cũng **không** dùng làm **điều kiện ra của làn A** (`:415`). Phải: **(1)** đưa `pnpm test:e2e:crm` thành **job trong `ci.yml`** — chuyển thành **ĐIỀU KIỆN VÀO** của làn A, đứng **trước** `R-D2-24`; **(2)** bổ sung **2 ca âm tính** vào chính kịch bản `R-D2-24` (gọi thẳng Server Action sửa lớp cơ sở khác bằng id; tạo bản ghi thuộc `SCOPED_MODELS` **thiếu `centerId`** — cả hai phải bị từ chối); **(3)** nếu Đ3 xanh thì tiêu chí **grep** của `R-D4-09` cũng vô hiệu → báo lại người làm `R-D4-09`/`R-D10-10`; **(4)** sửa dòng nghiệm thu `R-D2-24` ghi rõ **ranh giới mới chỉ phủ đường ĐỌC** + nêu ngày `R-D4-11` (`:238`) đóng nốt. **Ai phải biết:** Luân (chủ `R-D4-11`) · Kiệt (ký nghiệm thu A3/QĐ-C) · Ban giám đốc (đây là điều kiện đưa **dữ liệu pháp nhân thứ hai** vào cùng CSDL).
- **Cờ 1:** KHÔNG — **Cờ 2:** KHÔNG *(nhánh vứt, không merge)*

### GD-43 — Cắt `UserOrgRole` rồi gọi 4 đường khác cơ chế gác — đếm đường nào vẫn qua

- **Loại:** DÙNG_THỬ_TRÊN_DB_TEST
- **Việc cụ thể:** Trên **Postgres LOCAL** (`.env.test` — **tuyệt đối không** prod, **không** staging dùng chung DB prod): seed 1 tài khoản GV có `UserOrgRole` tại CS1 và `User.roles` chứa `TEACHER`; đăng nhập, **GIỮ NGUYÊN phiên**; đặt toàn bộ `UserOrgRole` của người đó về **hết hiệu lực** (bảng khoá theo `(userId, orgUnitId, roleId)`, **không có** `derivedFromType/derivedFromId` — `prisma/schema.prisma:355-370`, nên phải cắt thủ công theo khoá); **KHÔNG** đụng `User.roles`, **KHÔNG** tăng `tokenVersion`. Rồi gọi 4 đường và ghi **TỪ CHỐI / VẪN QUA**:
  **(a)** `completeSessionAction` — `app/(admin)/admin/classes/[id]/session/_actions.ts:33`, có `scopedDb` + `passesScope` ở `:21-29`;
  **(b)** lưu điểm danh của lớp đó;
  **(c)** `canOpenScorm` — `lib/scorm/access.ts:54-58`, chỉ so `userId` với `actualTeacherId/teacherId/assistantId` (`:37-41`), **không** kiểm cơ sở lẫn `UserOrgRole`;
  **(d)** `approveInstallmentPlan` — `lib/orders/installments.ts:204-213`, gọi `assertCan` **v1 trần** trên `actor.role/roles` (`:210`), không qua `checkPermission` nên **không sinh dòng shadow** (`00-baseline.md:105`).
- **Ai chạy:** Luân (chủ FOUND/RBAC)
- **Thời lượng:** 1 ngày (0,5 dựng seed + 0,5 viết 4 ca + chạy)
- **Chỉ số:** số đường **trên 4** VẪN thực hiện được sau khi `UserOrgRole` hết hiệu lực
- **Ngưỡng đạt:** ĐẠT khi **4/4 bị từ chối**. TRƯỢT khi ≥ 1 đường vẫn qua. **Dự đoán ghi TRƯỚC khi chạy** (để không sửa kỳ vọng sau): (a),(b) **từ chối**; (c),(d) **vẫn qua** — vì `RBAC_V2_ENABLED` mặc định OFF (`lib/flags.ts:7-9`) nên quyết định trả về **v1** (`lib/auth/shadow-compare.ts:20` · `:27`), mà v1 đọc `role/roles` trên **phiên**, không đọc `UserOrgRole`.
- **Nếu trượt:** Nhánh D3 **không** được nghiệm thu bằng câu *"nguồn mất thì quyền mất"* đo trên `UserOrgRole`: `R-D3-02/07/08/12` phải thêm tiêu chí nêu rõ **ĐƯỜNG GHI NÀO được phủ, đường nào KHÔNG**; và điều khoản của `R-D9-05b` (hạ `UserOrgRole` **+** gỡ vai trò v1 khỏi `User.roles` **+** tăng `tokenVersion` **trong CÙNG transaction** — `02-prd:283`) phải áp cho **CẢ nhánh biên chế/kiêm nhiệm**, không chỉ nhánh hợp đồng. Kéo theo: `R-D4-12` (`:239`, chuyển **125 điểm gác role thô** — `00-baseline.md:103`) trở thành **điều kiện** của `R-D3-12`, và `R-QDB-06` (`:246`, vá cổng SCORM) phải **lên trước** `R-D9-06`. **Ai phải biết:** Luân · Kiệt · HR HO · Quản lý cơ sở (**hai vai sau đang tưởng cắt là xong**).
- **Cờ 1:** KHÔNG — **Cờ 2:** KHÔNG

### GD-54 — Thử nghiệm điểm gắn che trường: `result:` extension có đè được trường vô hướng, và có nhìn thấy actor không

- **Loại:** TEST_KỸ_THUẬT
- **Việc cụ thể:** Viết **ĐÚNG MỘT** file test chạy trên **Postgres LOCAL** (`.env.test`), đặt tại `tests/e2e/a0/mask-field-extension.spec.ts`, chạy bằng `pnpm test:e2e:a0`. 4 ca, mỗi ca đọc `Employee.salaryRank` / `salaryLevel` / `bhxhBase` (cột có thật: `prisma/schema.prisma:1956`, `:1957`, `:1961`):
  **Ca 1** — dựng prototype `db.$extends({ result: { employee: { salaryRank: { needs: {salaryRank:true}, compute: () => null } } } })` và khẳng định trường trả `null`. Đây là **`R-TECH-01`** (`02-prd:357` — cả 4 chỗ `$extends` hiện có **đều là `query:`**).
  **Ca 2** — gắn extension đó **VÀO `scopedDb(actor)`** (`lib/db-scope.ts:299-331` hiện chỉ có khối `query:`), đọc bằng actor **không** có quyền lương → phải `null`; actor **có** quyền → phải ra giá trị.
  **Ca 3** — gọi 1 trong 9 hàm `lib/` đọc thẳng `db` trần và chạm trường nhạy cảm (`lib/compliance/erasure.ts`, `lib/compliance/portability.ts`, `lib/crm/convert-lead.ts`, `lib/crm/convert-lead-v2.ts`, `lib/crm/dedupe.ts`, `lib/notify/attendance.ts`, `lib/payments/vietqr.ts`, `lib/portal/parent-profile.ts`, `lib/progress.ts`) → khẳng định giá trị **KHÔNG** bị che (chứng minh vế *"kể cả khi truy vấn nằm ở `lib/`"* của `R-D4-06` **chưa đạt** với nhánh (a)).
  **Ca 4** — gắn extension vào **base `db`** (`lib/db.ts:66`) rồi đọc từ một đường **KHÔNG có actor** (mô phỏng cron/seed/trang công khai `app/(public)/khoa-hoc/page.tsx:91`, `:102`) → ghi hành vi thực tế: che hay không, và **trang giá công khai có mất dữ liệu không**. Kèm 1 lệnh đếm bối cảnh: `grep -rn AsyncLocalStorage app lib --include=*.ts | wc -l` (`[QS]` hiện = **0** → không có cơ chế ngữ cảnh theo request).
- **Ai chạy:** Luân
- **Thời lượng:** 1 ngày
- **Chỉ số:** 4 kết quả nhị phân — (1) `result:` đè được trường vô hướng? (2) gắn ở `scopedDb` thì che đúng theo actor? (3) đường `lib/` `db` trần có bị che không? (4) khi **không có actor** thì hành vi là gì (che / không che / lỗi) và trang giá công khai còn ra giá không
- **Ngưỡng đạt:** ĐẠT để **mở thẻ `R-D4-06`** khi: ca 1 **xanh** **VÀ** ca 2 **xanh** **VÀ** số đường đọc trường nhạy cảm **không được phủ = 0** (hoặc nằm trong **danh sách miễn trừ có tên + có hạn đã ký**). TRƯỢT khi ca 1 đỏ, hoặc ca 3 cho thấy ≥1 trong 9 file `lib/` vẫn đọc được giá trị thật, hoặc ca 4 làm **trang giá công khai mất dữ liệu**.
- **Nếu trượt:** Ca 1 đỏ ⇒ `R-D4-06` **không làm được như thiết kế** → đổi cách (che ở **tầng service**, không ở tầng truy vấn) và xếp lại cỡ; `R-D2-14` (che MST + số tài khoản) **treo theo** vì cùng cơ chế. Ca 3/ca 4 trượt ⇒ phải **ĐẢO thứ tự làn B6**: `R-D4-10` (mở cổng ESLint sang `lib/`, `:237`) lên **TRƯỚC** `R-D4-06`, và **bỏ vế** *"kể cả khi truy vấn nằm ở `lib/`"* khỏi nghiệm thu `R-D4-06` cho tới khi cổng đóng. ⚠️ `R-D4-10` hiện **không nằm trong bất kỳ pha nào** của §8 (`02-prd:409-444`; B6 = `06 → 07 → 08 → 11 → 13`, `:435`) — **khoảng hở không có ngày kết thúc**. Việc chọn nhánh (a) gắn ở `scopedDb` hay (b) gắn ở base `db`, cùng hành vi khi **không có actor**, là **quyết định kiến trúc phải viết thành văn bản 1 trang** trước khi mở thẻ. **Ai phải biết:** Luân (chủ B6) · Kiệt (trang giá công khai + đường tiền) · Ban giám đốc nếu chọn nhánh (b) vì nó chạm **trang công khai**.
- **Cờ 1:** KHÔNG — **Cờ 2:** KHÔNG *(test trên DB local)*

### GD-61 — Chụp ảnh nền: `isHoLevel` hiện đang cấp những QUYỀN THAO TÁC nào, cho ai

- **Loại:** TEST_KỸ_THUẬT
- **Việc cụ thể:** Viết **1 script chỉ-đọc** (`scripts/snapshot-holevel.ts`, chạy `tsx` với `DIRECT_URL`, **KHÔNG ghi gì**) dựng bảng: mỗi tài khoản đang giữ `UserOrgRole` tại HO/ROOT (`lib/auth/actor.ts:133` định nghĩa `isHoLevel` = có bất kỳ vai trò nào tại HO/ROOT; `isHoRoot` xét TYPE ở `:92-93`) × **8 quyết định**, gọi **trực tiếp** các hàm hiện có, không qua giao diện:
  1. `getModelVisibleCenterIds('Student', actor)` và `('Class', actor)` — `lib/db-scope.ts:178-220` (hai nhánh fallback ở `:184` và `:218`);
  2. `lib/auth/lms-scope.ts:17` và `:44` — quyền quản lý lớp LMS;
  3. `lib/lms/report-card-core.ts:232` — duyệt học bạ;
  4. `lib/transfer/transfer-policy.ts:12` — điều động / chuyển lớp;
  5. `lib/reports/filters.ts:54` — lọc báo cáo doanh thu;
  6. `lib/org/org-tree.ts:150` — picker đơn vị;
  7. `app/(admin)/admin/curriculums/_actions.ts:649` — sửa chương trình;
  8. `app/(admin)/admin/classes/[id]/session/_actions.ts:68` — thao tác buổi học.
  Xuất CSV `tai_khoan, quyet_dinh, ket_qua`. Chạy **TRƯỚC** bản vá `R-D4-09` (đây là bản chụp *"trước"* của `R-OPS-02`, `02-prd:444`), rồi chạy **lại nguyên xi SAU** bản vá và **diff hai CSV**.
- **Ai chạy:** Luân
- **Thời lượng:** 1 ngày (0,5 viết script + 0,5 chạy & đối chiếu sau vá)
- **Chỉ số:** số ô (tài khoản × quyết định) **đổi giá trị** giữa hai bản chụp; **tách riêng** ô thuộc **PHẠM VI DỮ LIỆU** và ô thuộc **QUYỀN THAO TÁC**
- **Ngưỡng đạt:** ĐẠT khi sau bản vá: **0 ô đổi ngoài danh sách đổi có chủ đích đã ký** **VÀ** số ô **QUYỀN THAO TÁC** bị đổi = **0** (bản vá chỉ được **thu hẹp phạm vi dữ liệu**, không được **cắt quyền thao tác**). TRƯỢT khi có ≥1 ô đổi ngoài danh sách đã ký, hoặc ≥1 ô quyền thao tác đổi.
- **Nếu trượt:** Bản vá `R-D4-09` phải **rút lại và làm hẹp hơn**: chỉ sửa **hai nhánh fallback** `lib/db-scope.ts:184` và `:218`, **KHÔNG** đổi nghĩa cờ ở `lib/auth/actor.ts:133`. Tiêu chí nghiệm thu `R-D4-09` phải bổ sung ít nhất **3 ca THAO TÁC** (duyệt học bạ · chuyển lớp · sửa chương trình) — grep `isHoLevel ? "ALL"` = 0 là **chưa đủ**. Nhánh D10 đứng theo: `R-D10-04` (`:294`) và `R-D10-10` (`:300`) đều chờ `R-D4-09` trong B5 (`:434`) → **phải báo lại lịch**. **Ai phải biết:** Luân · Kiệt (báo cáo doanh thu + học bạ) · Ban giám đốc (nhân sự HO **có thể mất quyền thao tác thật**).
- **Cờ 1:** KHÔNG *(script chỉ đọc; bản VÁ `R-D4-09` mới đụng Cờ 1 + Cờ 2)* — **Cờ 2:** KHÔNG

### GD-76 — Dựng bảng lệch cho ba vùng mù của đồng hồ shadow, trước khi bật cờ

- **Loại:** TEST_KỸ_THUẬT
- **Việc cụ thể:** Viết 1 file test chạy trên **Postgres LOCAL** (`.env.test`), đặt tại `tests/e2e/a0/shadow-blindspot.spec.ts`, chạy bằng `pnpm test:e2e:a0`. **Không sửa code production**, chỉ ĐỌC và SO.
  **Vùng 1 — điểm gác role thô:** liệt kê call-site (`grep -rn 'hasRole(\|hasStaffRole(\|hasAnyRole(\|isSuperAdmin(\|getEmployeeFieldVisibility(' app lib --include=*.ts --include=*.tsx | grep -v test`; `00-baseline.md:103` đếm **125 call-site** (`hasRole` 96, `hasStaffRole` 7, `hasAnyRole` 6, `isSuperAdmin` 6, `getEmployeeFieldVisibility` 4). Với mỗi call-site, gán tay **action tương ứng** (chính là bảng ánh xạ `R-D4-12` sẽ cần), rồi so `hasRole(...)` với `evaluatePermission(action, flagOn:true)` (`lib/auth/permission-eval.ts:23-27`) cho đủ **9 mã vai trò** × các cơ sở seed → in mọi ô lệch kèm vai trò + action.
  **Vùng 2 — SCORM:** gọi `canOpenScorm` / `canManageTraining` (`lib/scorm/access.ts:44-47`) ở **CẢ HAI** trạng thái cờ, cho actor có `training:manage` nhưng bị **DENY** qua `UserPermissionGrant` → khẳng định kết quả ở hai trạng thái cờ (`[QS]` hàm hiện gọi `getEffectivePermissions` ở `:47`, tức **enforce v2 thẳng kể cả cờ OFF** — đúng điều `QUYET-DINH.md:56` gọi là vi phạm tường minh).
  **Vùng 3 — MENU:** so tập action lọc menu (`lib/auth/menu-permissions.ts`, **cố ý KHÔNG ghi shadow-diff** — chú thích `:14-16`) với tập action **cổng trang** cho từng vai trò → đếm số mục menu sẽ thành **liên kết chết** hoặc **trang không lối vào** khi cờ bật.
  Xuất 1 CSV: `vung, vai_tro, action, ket_qua_hien_tai, ket_qua_khi_bat_co`.
- **Ai chạy:** Luân
- **Thời lượng:** 1,5 ngày
- **Chỉ số:** số ô lệch ở **mỗi vùng** (role thô / SCORM / MENU) và **danh sách ĐÍCH DANH** vai trò + action sẽ đổi kết quả khi bật cờ
- **Ngưỡng đạt:** ĐẠT để **chuyển thật một đợt `R-D4-12`** khi: mọi ô lệch trong đợt đó **đã có danh sách đích danh người bị ảnh hưởng, đã được ký**, và số ô lệch **NGOÀI danh sách đã ký = 0**. TRƯỢT khi xuất hiện ô lệch **không giải thích được**, hoặc vùng SCORM cho kết quả **khác nhau** giữa hai trạng thái cờ mà **chưa có người ký nhận**.
- **Nếu trượt:** **Không chuyển đợt đó của `R-D4-12`**; phải sửa `R-QDB-05` (`02-prd:245`) để chặn cứng thêm điều kiện: cờ `RBAC_V2_ENABLED` **chỉ được bật khi bảng lệch của cả 3 vùng mù = 0 hoặc đã ký**, không chỉ dựa vào `RbacShadowDiff`. `R-QDB-06` (vá SCORM, `:246`) phải chạy **TRƯỚC** khi bật cờ, không sau. **Thứ tự làn B phải sửa:** hiện `R-D4-12` xếp **SAU CÙNG** ở B7 (`:436`) — tức **bề mặt lớn nhất mới là chỗ đổi hành vi thật**, và lúc đó **không còn lưới so sánh** → phải kéo **phần đo** (bảng lệch này) lên **trước B1**. **Ai phải biết:** Luân · Kiệt (SCORM đang LIVE trên prod) · Vy (UI phân quyền + menu — **vùng 3 chạm trực tiếp màn hình của Vy**) · Ban giám đốc.
- **Cờ 1:** KHÔNG — **Cờ 2:** KHÔNG

### GD-02 — Chạy thử mở cơ sở đầu-cuối tới phiếu thu đầu tiên (bấm giờ)

- **Loại:** QUAN_SÁT_NGƯỜI_DÙNG
- **Việc cụ thể:** Trên môi trường **TEST** (Postgres local theo `.claude/rules/prisma-db.md` — **tuyệt đối không prod**): một **người vận hành KHÔNG phải lập trình viên** tự làm trọn chuỗi **chỉ qua giao diện**: tạo OrgUnit vùng → tạo `Center` + OrgUnit(`CENTER`) → gán quản lý cơ sở → tạo lớp → tạo học viên → ghi nhận 1 khoản thu (`Payment`) → kế toán xác nhận (`accountantStatus='CONFIRMED'`, `prisma/schema.prisma:4931`) → in 1 phiếu thu (`Receipt`, `:4954-4970`). Đây là kịch bản `R-D2-24` (`02-prd:187`) nhưng **KÉO DÀI qua bước thu tiền** — `R-D2-24` hiện **dừng trước**, đúng chỗ `R-OPS-12` (`:332`) nói là **rủi ro pháp lý**. Người quan sát ghi biên bản 3 cột: **mốc phút từng bước** · **mỗi lần phải nhờ HO/kỹ thuật** (ghi lý do, vd *"phải chờ HO đặt học phí"* vì `Course.price` toàn cục — `:210`) · **mỗi bước phải làm ngoài giao diện** (SQL/sửa file/đổi env).
- **Ai chạy:** Vy (dẫn phiên, bấm giờ, ghi biên bản); người thao tác = **1 quản lý cơ sở CS2, không phải lập trình viên**
- **Thời lượng:** 1 buổi (≤ 4 giờ) + 1 giờ dựng môi trường test
- **Chỉ số:** (a) tổng số **PHÚT** tới khi in được phiếu thu đầu tiên; (b) **SỐ LẦN** phải nhờ HO/kỹ thuật; (c) **SỐ BƯỚC** phải làm ngoài giao diện
- **Ngưỡng đạt:** ĐẠT khi (b) = **0** **VÀ** (c) = **0** **VÀ** (a) ≤ **480 phút**. TRƯỢT khi (b) ≥ 1 HOẶC (c) ≥ 1 HOẶC (a) > 480 phút.
- **Nếu trượt:** `R-D2-24` phải **đổi tiêu chí nghiệm thu**: bỏ *"git diff rỗng"* làm chỉ số duy nhất, thay bằng **3 con số (a)(b)(c)**, và **mở rộng kịch bản qua bước thu tiền** (`R-OPS-12`). Nếu (b) phát sinh từ **học phí** ⇒ `R-D6-14` thành **chặn cứng đứng TRƯỚC** `R-D2-24`, và §9 câu 9 (`02-prd:462`) phải có câu trả lời trước. **KR1/KR2** (`:77-78`) **mất tư cách** là thước đo mục tiêu §4. **Ai phải biết:** Ban giám đốc · Kiệt (chủ kịch bản nghiệm thu) · Kế toán tổng hợp HO (bước phiếu thu).
- **Cờ 1:** KHÔNG — **Cờ 2:** KHÔNG

### Gói chạy được trong tuần này

> Xếp theo **chặn-nhiều-và-rẻ-trước**. Với việc **đang hỏi người**, chỉ số là **"có văn bản trả lời của <ai>, ghi ngày"** — *"đã hỏi"* **không** tính là đạt.
>
> ⚠️ **Cộng thời lượng tự khai của chính bảng này, theo người:** **Luân ≈ 5,4 ngày-công** (#1 ≤3h · #12 ½ ngày · #13 1 ngày · #14 1 ngày · #15 1 ngày · #16 1,5 ngày) — **kín ~100% một tuần làm việc, không dư một buổi**; **Kiệt ≈ 3,0 ngày-công** trên 9 hạng mục (#2, #4–#9, phần chuẩn bị #10, #11); **Vy ≈ 0,75 ngày-công** (#3, #17).
>
> ⚠️ **Bảng này đang giả định trước kết quả của chính hạng mục #3.** `GD-26` (Impact 9, ô THÍ_NGHIỆM) hỏi *"đội còn công suất không"* và trích `docs/ke-hoach-go-live-2607/README.md:66` — *"~103 ngày-công cho 3 người / ~20 ngày làm việc → quá tải ~2×"*. Nếu **#3 TRƯỢT** thì **16 hạng mục còn lại không có chỗ chạy**. Vì vậy: **chạy #3 TRƯỚC TIÊN** — nó rẻ nhất bảng (≤2h, chỉ đọc git + README), không đụng DB, và **quyết định được số phận 16 hạng mục kia**. **Thứ tự cắt/giãn nếu #3 trượt** (giữ nguyên nguyên tắc chặn-nhiều-trước): giữ **#1, #2, #4** (mốc khởi động làn B + độ tin của đồng hồ + điều kiện bật B5) và **#10** (không tốn công kỹ thuật, chỉ tốn phiên quyết của BGĐ); giãn **#14, #15, #16** sang tuần sau (đều 1–1,5 ngày của **một người duy nhất là Luân**); cắt tạm **#8, #9, #11, #17** (không chặn mốc khởi động làn nào). Quyết định cắt/giãn thuộc **Ban giám đốc**, không thuộc tài liệu này.

| Thứ tự | Việc | Ai chạy | Chỉ số | Ngưỡng đạt | Cờ 1 | Cờ 2 | Chặn cái gì |
|---|---|---|---|---|---|---|---|
| **1** | **GD-44** — đọc đồng hồ shadow + đo traffic thật (≤3h, chỉ đọc) | Luân | (a) ngày liên tiếp CẦN XỬ LÝ = 0 · (b) tài khoản thật thao tác/14 ngày · (c) dòng `UserOrgRole` | (a) ≥ 5 **và** (b) ≥ 8 **và** (c) > 0 | KHÔNG | KHÔNG | Mốc khởi động **toàn bộ làn B**; `R-QDB-01..05`; §9 câu 12 |
| **2** | **GD-62** — đồng hồ báo 0 vì sạch hay vì không ai ghi (½ ngày, chỉ đọc) | Kiệt | dòng từ lần TRUNCATE · ngày có dòng mới · **số lệch kỳ vọng** tính offline | lệch kỳ vọng > 0 **và** có dòng trong 7 ngày | KHÔNG | KHÔNG | Độ tin của chỉ số nền cho GD-44; `R-QDB-04/05`, `R-D4-12` |
| **3** | **GD-26** — đếm công suất thật (≤2h, git + README) | **Vy** | commit/PR merge `main`/28 ngày theo tác giả · ngày-công còn giao được | ≥ 20 ngày-công/tháng **và** ≥ 3 người có commit | KHÔNG | KHÔNG | **Hình dạng cả lộ trình §8**; các gói phải-đi-cùng-một-lần-phát-hành |
| **4** | **GD-28** — đếm bản ghi tiền thiếu/sai đơn vị (≤3h, chỉ đọc) | Kiệt | % `Payment` không suy được đơn vị · **số** bản ghi gán SAI · `Receipt` không suy được | SAI = 0 **và** thiếu ≤ 2% **và** không chạm kỳ đã đóng | KHÔNG | KHÔNG | `R-D10-07/08`, `R-OPS-03/05`, **cả B5** |
| **5** | **GD-46** — độ phân kỳ hai trục `centerId` ‖ `orgUnitId` (2h, chỉ đọc) | Kiệt | lệch hai trục / thiếu một bên / tổng, theo 26 model + `Center` mồ côi | 0 lệch **và** bản ghi sau PR-A không thiếu **và** 0 mồ côi | KHÔNG | KHÔNG | §9 câu 15; `R-D4-13`, `R-D10-06/07/08`, `R-D2-16/19/20` |
| **6** | **GD-59** — trục `User.centerId` lệch khỏi trục nhân sự (2h, chỉ đọc) | Kiệt | (A) lệch biên chế · (B) lệch `PRIMARY` · (C) tài khoản mồ côi hồ sơ | A = 0 **và** B = 0 **và** 0 nơi ngoài 3 bề mặt `R-D3-10` | KHÔNG | KHÔNG | `R-D3-03/09/10`, làn A5 |
| **7** | **GD-06** — đối chiếu Σ thu ↔ Σ phải thu trên CS1/CS2 (≤2h, chỉ đọc) | Kiệt | `|A−B|/B` từng cơ sở, 3 tháng (chỉ kết luận khi ≥ 30 Enrollment/cơ sở) | ≤ 10% ở **cả** CS1 và CS2 | KHÔNG | KHÔNG | `R-D9-09`, `R-D10-12`, `R-OPS-03` — **căn cứ tính phí** |
| **8** | **GD-24** — phân bố lượt mở SCORM quanh ngày buổi (≤2h, chỉ đọc) | Kiệt | tổng dòng nhật ký · % không gắn buổi · % lệch > 7 ngày | ≥ 200 dòng **và** ≤ 10% **và** ≤ 20% | KHÔNG | KHÔNG | `R-D8-07`, `R-D8-14`, `R-D6-05` |
| **9** | **GD-50** — khoá duy nhất toàn cục + số nơi tra cứu (3h, chỉ đọc) | Kiệt | số bảng còn khoá toàn cục · tổng nơi phải sửa · nhóm `PaymentMethod` | ≤ 6 bảng **và** ≤ 30 nơi **và** ≤ 5 nơi nhóm tiền | KHÔNG | KHÔNG | Cỡ của `R-D6-03`; nghiệm thu `R-D6-02` |
| **10** | **GD-32** — chốt vai trò pháp lý dữ liệu + bảng trường PII (4h chuẩn bị + phiên 60′) | BGĐ + pháp chế (Kiệt chuẩn bị) | **có văn bản trả lời của Ban giám đốc + pháp chế cho §9 câu 8, ghi ngày** · số nhóm/5 bị bên nhận gạch | có văn bản ghi ngày **và** gạch 0/5 | KHÔNG | KHÔNG | `R-D10-04/05`, `R-DP-01`, **toàn bộ nhóm 8** |
| **11** | **GD-09** — thử tái tạo slide bằng điện thoại (30′ + 1h xin đồng ý) | Kiệt (GV có văn bản đồng ý) | % slide lấy được đọc rõ · % ảnh đọc rõ mã nhân viên | không rơi vào (a) > 80% **và** (b) < 50% | KHÔNG | KHÔNG | Lý do ưu tiên của `R-D8-07` (cỡ L); vị trí `R-D8-11` |
| **12** | **GD-45** — đục hàng rào cách ly, xem CI có bắt (½ ngày, nhánh vứt) | Luân | số phép đục/3 bị ≥1 job CI mặc định bắt · số mã vai trò dựng trong spec | 3/3 bị bắt **và** ≥ 9 mã vai trò | KHÔNG | KHÔNG | Tiêu chí ra làn A; nghiệm thu `R-D2-24`, `R-QDC-03`, `R-D4-11` |
| **13** | **GD-43** — cắt `UserOrgRole` rồi gọi 4 đường (1 ngày, DB local) | Luân | số đường/4 vẫn qua sau khi cắt nguồn | 4/4 bị từ chối | KHÔNG | KHÔNG | `R-D3-02/07/08/12`, `R-D9-05b`, `R-QDB-06` |
| **14** | **GD-54** — `result:` extension có đè trường + có thấy actor (1 ngày) | Luân | 4 kết quả nhị phân (ca 1–4) | ca 1 & 2 xanh **và** 0 đường không phủ | KHÔNG | KHÔNG | `R-TECH-01` → `R-D4-06`; `R-D2-14`; phơi bày `R-D4-10` không có pha |
| **15** | **GD-61** — bản chụp "trước" của `isHoLevel` × 8 quyết định (1 ngày) | Luân | số ô đổi giữa hai bản chụp, tách **phạm vi** vs **thao tác** | 0 ô ngoài danh sách ký **và** 0 ô quyền thao tác đổi | KHÔNG | KHÔNG | `R-D4-09` → `R-D10-04/10`, `R-OPS-02`, cả B5 |
| **16** | **GD-76** — bảng lệch 3 vùng mù trước khi bật cờ (1,5 ngày) | Luân | ô lệch mỗi vùng + danh sách đích danh vai trò × action | 0 ô lệch ngoài danh sách đã ký | KHÔNG | KHÔNG | Từng đợt `R-D4-12`; điều kiện bổ sung cho `R-QDB-05`; `R-QDB-06` |
| **17** | **GD-02** — chạy thử mở cơ sở tới phiếu thu đầu tiên (1 buổi + 1h dựng) | Vy (thao tác: QL cơ sở CS2) | (a) phút tới phiếu thu · (b) lần nhờ HO/kỹ thuật · (c) bước ngoài giao diện | (b)=0 **và** (c)=0 **và** (a) ≤ 480′ | KHÔNG | KHÔNG | `R-D2-24`, `R-OPS-12`, `R-D6-14`; **KR1/KR2** của §4 |

---

## 8. Giả định đã bị bác ở vòng phản biện

> **Mục đích: người sau không nêu lại.** 11 phát biểu dưới đây **không còn là giả định** — mã nguồn (hoặc `QUYET-DINH.md`) đã trả lời dứt điểm. Đừng mở lại; nếu cần, đọc mã ở cột phải.

| Phát biểu (đã bác) | Vì sao bác — sự thật đã chứng minh |
|---|---|
| **`d2d6-02`** Chặn tạo node HO thứ hai ở `createOrgUnit` là đủ để mở màn hình quản trị cây an toàn; `updateOrgUnit` và đường seed không cần thêm luật | `[QS]` `createOrgUnit` chỉ gọi `validateCode` + `validateCenterId` + `validateRootRule` + `assertParentUsable` + kiểm trùng `code` — `validateRootRule` **chỉ ép ROOT duy nhất**, **không luật nào** chặn node thứ hai `type=HO`. Và `isHoRoot` xét **TYPE** (`lib/auth/actor.ts:92-93`) nên vai trò tại node HO thứ hai lập tức nhận `isHoLevel` (`:133`) → phạm vi `ALL` (`lib/db-scope.ts:184`, `:218`). `updateOrgUnit` **không gọi lại** `validateRootRule` |
| **`d2d6-03`** Bẫy `centerId` rỗng chưa từng bật; `R-D2-07` chỉ cần chặn trước cho `REGION`, không phải dọn dữ liệu cũ | `[QS]` `DEFAULT_SELECTABLE_TYPES` vẫn gồm **HO · CENTER · CAMPUS · PARTNER · FRANCHISE** (`lib/org/org-tree.ts:128-134`) và chỉ áp khi `opts.types` trống (`:147`); **13 trang admin** gọi `getSelectableOrgUnits(actor)` **không truyền `types`**. `Holiday/Lead/Class/Student` ∈ `SCOPED_MODELS` (`lib/db-scope.ts:11-13`), **∉** `NULL_IS_GLOBAL_MODELS` (`:49-53`) → `passesScope` chặn ở `:254`. Bẫy **đang mở**, không phải rủi ro tương lai |
| **`d2d6-04`** `Center.code` và `OrgUnit.code` của cùng một cơ sở đang bằng nhau; `R-D2-16/17/18` chỉ cần khoá một cột | `[QS]` **Hai nguồn mã song song là sự thật**: `lib/finance/payment.ts:40-43` tra `OrgUnit.code` theo `where { centerId }` và **rơi về chuỗi `"SR"`** khi thiếu (`:41`, `:43`); các đường khác lấy `Center.code`. Schema: `Center.code String? @unique` **CHO PHÉP NULL** (`prisma/schema.prisma:237`) vs `OrgUnit.code String @unique` (`:298`) — **không ràng buộc nào** bắt hai cột bằng nhau. `prisma/seed-orgunit.ts` nối hai bảng **bằng chính `Center.code`** |
| **`d2d6-06`** Đã có "phòng ban chuẩn" để khuôn mẫu đơn vị (`R-D6-09`) sinh ra; `R-D2-21` chỉ là gom về một hàm đọc | `[QS]` `DepartmentDef` là **danh mục TOÀN CỤC** (`code String @unique`, **không** có trường center/orgUnit). `Employee` vẫn giữ **enum `Department` BẮT BUỘC** ghi song song với khoá ngoại: `prisma/schema.prisma:1940` (`department Department`, không nullable) + `:1941` (`departmentId String?`) — chú thích ngay tại đó ghi **2-phase, drop enum ở PR-E**. Vậy "sinh phòng ban cho cơ sở mới" **hoặc tạo 0 bản ghi** (dùng chung) **hoặc vi phạm `@unique`**; thêm phòng ban mới cho một cơ sở = **một migration enum**, không phải nhập liệu |
| **`d2d6-09`** Đưa `Holiday` vào `NULL_IS_GLOBAL_MODELS` là đủ, và không mở thêm bản ghi nào ra ngoài phạm vi | `[QS]` **Đúng phần cơ chế, sai phần hậu quả** — và phần sai mới quan trọng. `Holiday` ∈ `SCOPED_MODELS` (`lib/db-scope.ts:13`), ∉ `NULL_IS_GLOBAL_MODELS` (`:49-53`) → `passesScope` chặn bản ghi `centerId` null (`:254`). **Nhưng** bộ **sinh lịch** đọc bằng `db` **trần** và **đã** hiểu `centerId` rỗng là toàn hệ thống → thêm `Holiday` vào nhóm rỗng-là-toàn-cục **đổi tập bản ghi ở nhiều màn hơn** người soạn tính (Cờ 2 = CÓ, không phải KHÔNG) |
| **`d3-07`** Nhân sự gắn node không mang cơ sở là trạng thái chấp nhận được; `R-D3-05` chỉ cần cảnh báo mềm | `[QS]` Vế kỹ thuật **không còn là giả định**: `centerIdForOrgUnit` trả `null` cho mọi node không mang `centerId` (`lib/org/org-service.ts:263-273`, chú thích `:263` ghi rõ *"HO/ROOT (centerId=null) → null"*), và `passesScope` **chặn cứng** `record.centerId == null` với model ∉ `NULL_IS_GLOBAL_MODELS` (`lib/db-scope.ts:254`; `Employee` **không** thuộc nhóm đó, `:49-53`) ⇒ hồ sơ `centerId` null **LÀ** vô hình với actor cấp cơ sở, và **đang xảy ra hôm nay**. Vế hình dạng cây đã có **QĐ-A** (`QUYET-DINH.md:32`) |
| **`d4qdb-01`** Mô hình `RECORD_OWNER` cài sẵn (`OWN` so `target.createdById` với `actor.userId`) diễn tả đúng nghĩa *"lead của mình"* mà `R-D4-03` muốn seed | `[QS]` **Bất khả thi kỹ thuật + trái quyết định đã ký.** Model `Lead` **không có cột `createdById`** → nhánh `OWN` của `scopeMatches` (`lib/auth/can.ts:23-24`) **luôn trả `false`** cho mọi lead. Và sản xuất đã định nghĩa *"của mình"* **theo cách khác**: lọc `assignedToId = tôi HOẶC isSharedWithTeam = true` (quyết định BGĐ câu 10, Kiệt ký 10/07, ghi thẳng trong comment schema) |
| **`d4qdb-10`** v1 và v2 đọc `UserPermissionGrant` như nhau nên mọi chênh lệch đồng hồ shadow là chênh lệch **LUẬT** | `[QS]` **Hai nguồn khác nhau, độ tươi khác nhau.** v1 chấm trên `sessionUser` (`lib/auth/check-permission.ts:12` → `lib/auth/permission-eval.ts:23-26`), mà grant của phiên được nạp **một lần lúc đăng nhập** rồi **đóng băng trong JWT**. v2 chấm trên `actor` do `resolveActor` truy vấn `userPermissionGrant` **MỖI request** (`lib/auth/actor.ts:198-201`). Bù trừ duy nhất là `tokenVersion` — mà `tokenVersion` **không nằm trên đường GHI** (chỉ ở 2 layout + `requireLiveSession`) |
| **`d9d10-02`** Hai bên chấp nhận **doanh thu GỘP** làm căn cứ tính phí vì đó là con số duy nhất hệ thống xuất được | `[QS]` **Code đã chứng minh SAI, không cần truy vấn prod.** Có **HAI** màn báo cáo với **HAI** định nghĩa doanh thu khác nhau (một màn gom `CONFIRMED`+`PENDING`, màn kia chỉ `CONFIRMED`; `take` khác nhau), và **CẢ HAI** đều **bỏ** `REFUNDED` (bút toán âm) và `ADJUSTED` (bản gốc **KHÔNG** bị sửa — chú thích trong `lib/finance/payment.ts` nói rõ) ⇒ doanh thu báo cáo là **số GỘP**, HO thu phí **trên tiền đã hoàn cho phụ huynh** |
| **`d9d10-06`** Sau khi liệt kê ~300 hành động máy chủ, phụ lục đó vẫn giữ được **đồng bộ** với code, nên *"chạy đủ danh sách trong phụ lục"* là bằng chứng chế độ chỉ-đọc kín | `[QS]` **Phép đếm đã chạy và ngưỡng đã bị phá**, đồng thời **số liệu gốc sai**: đếm lại hôm nay = **105** tệp có `'use server'` trong `app/`, **369** `export async function` trong `app/(admin)`, **479** trên toàn `app/`, **289** hàm mang tên ghi, **29** route handler `POST/PUT/DELETE/PATCH` (bản cũ ghi 84 tệp / 358 hàm). Cách *"liệt kê từng hàm"* **không giữ đồng bộ được** |
| **`ops-13`** Gỡ `MAKEUP_EXCEPTION_MODELS` theo QĐ-C là việc cỡ nhỏ, và *"test cách ly hiện có vẫn xanh"* là tiêu chí nghiệm thu đủ | `[QS]` `tests/e2e/r7/makeup-cross-center.spec.ts` (chạy trong job CI `e2e-r7`, `.github/workflows/ci.yml:262` · `:318`; `testDir` `./tests/e2e/r7` theo `playwright.r7.config.ts:13`) có **3 ca KHẲNG ĐỊNH hành vi chéo cơ sở**: `:171` và `:186` `expect(out).toHaveLength(2)`; `:194` xếp bù CS1→CS2 thành công + audit `MAKEUP_CROSS_CENTER` (`:214`); `:238` staff CS2 đọc được roster CS1 qua `withMakeupException`. File **import trực tiếp** `withMakeupException` (`:18`). Gỡ `MAKEUP_EXCEPTION_MODELS` (`lib/db-scope.ts:343-348`) **làm ĐỎ những test này theo thiết kế** ⇒ "test vẫn xanh" **không thể** là tiêu chí |

---

## 9. Câu hỏi mới sinh ra từ bước này

> **Đã mở lại và đối chiếu trước khi đánh số:** 15 câu §9 của PRD (`02-prd-franchise-platform.md:452-468`), `a1–a7` / `b1–b11` của BƯỚC 3 (`03-job-stories.md:865-883` và `:901-916`), **và 6 câu treo của `QUYET-DINH.md:109-114`**. Không câu nào dưới đây trùng ý với ba danh sách đó; chỗ nào **nối tiếp** một câu cũ thì ghi rõ mã câu cũ ở cột "Chặn cái gì" thay vì trình bày như câu mới. Câu **trùng ý** đã bị loại khỏi danh sách này (vd *"log lượt xem là gói hay tài nguyên con"* = câu 10; *"bốn bảng không có trường cơ sở"* = `b10`; *"tác vụ nền chạy danh tính gì"* = `a6`; *"`Document.isPublic` cho ai xem"* = `a5`; *"giá trị mặc định cửa sổ mở khoá"* = `b1`).

### Nhóm A — hình dạng dữ liệu của pháp nhân thứ hai

| # | Câu hỏi | Chặn cái gì | Ai trả lời |
|---|---|---|---|
| **c1** 🔴 | **Node của bên NHẬN nhượng quyền (FRANCHISEE) là `type = CENTER` hay `type = FRANCHISE`?** `type = CENTER` thì node **mang `centerId`** và `scopedDb` chạy được; `type = FRANCHISE` thì `centerId` **buộc phải null** (`lib/org/orgunit-rules.ts:59-62` — V7: `centerId` chỉ set cho `type CENTER`) → mọi bản ghi thuộc `SCOPED_MODELS` của họ bị `passesScope` chặn (`lib/db-scope.ts:254`), trừ `NULL_IS_GLOBAL_MODELS` (`:49-53`). Enum **đã có sẵn cả hai giá trị** (`prisma/schema.prisma:286-293`; `lib/org/types.ts`). Chọn `FRANCHISE` = **tự động vô hiệu hoá cách ly cơ sở** cho pháp nhân đó | **A6** (`02-prd:386`) · gói cổng tạo cơ sở `R-D2-16/17/18` (`:399-401`) · `R-D2-19/20` · toàn bộ nhánh D10 | Ban giám đốc (quyết) + Luân (xác nhận hệ quả `scopedDb`) |
| **c2** | Nếu chọn `type = FRANCHISE` ở **c1**: **`DEFAULT_SELECTABLE_TYPES` xử lý ra sao?** Hiện gồm **HO · CENTER · CAMPUS · PARTNER · FRANCHISE** (`lib/org/org-tree.ts:128-134`) ⇒ **4/5 type chọn được đều cho `centerId = null`**, không riêng HO — người dùng chọn nhầm là **sinh bản ghi vô hình** | `R-D2-07` · GD-47 · GD-59 · 13 trang admin gọi `getSelectableOrgUnits` không truyền `types` | Luân + Vy (UI picker đơn vị) |
| **c3** | **Đóng một cơ sở** (hoặc cắt hợp đồng): node `OrgUnit` của đơn vị đó **bị xoá mềm, chỉ tắt hoạt động, hay giữ nguyên**? *(Chỉ hỏi phần **hình dạng node** — vế "trong thời gian chuyển tiếp còn đọc được gì" **đã có người hỏi rồi**, đừng hỏi lại.)* | GD-51 · `R-OPS-01` — và **nối vào** §9 câu 3 (`02-prd:456`) + **câu treo 4** (`QUYET-DINH.md:112`), cả hai đang chặn `R-D9-06` | Ban giám đốc + Kế toán tổng hợp HO |
| **c4** | **Cơ sở của bên NHẬN có được liệt kê trên `satarobo.vn` không**, và nếu có thì hiện **tên pháp nhân nào** — của HO hay của họ? **Ai chịu trách nhiệm nội dung quảng cáo** cho cơ sở đó? | GD-29 · `R-OPS-12` (chứng từ mang pháp nhân bên phát hành) | Ban giám đốc + Marketing HO |
| **c5** | Cơ sở **chưa đủ hồ sơ pháp nhân**: được phép **nhận học viên nhưng CHẶN thu tiền**, hay **chặn cả hai**? *(tiêu chí nghiệm thu `03-job-stories.md:284` đã chặn ở **cờ hạch toán**; **hệ quả nghiệp vụ của cờ này vẫn treo** ở §9 câu 6, `02-prd:459`; và **chưa ai chặn ở bước thu tiền** — mà thu tiền mới là chỗ sinh **chứng từ sai pháp nhân**. Không có câu nào trong `b1–b11` nói về cờ hạch toán.)* | GD-10 · `R-OPS-12` · `R-D2-13` · nối vào §9 câu 6 (`02-prd:459`) | Ban giám đốc + pháp chế |

### Nhóm B — tiền và hợp đồng

| # | Câu hỏi | Chặn cái gì | Ai trả lời |
|---|---|---|---|
| **c6** 🔴 | **Phí thương hiệu tính trên doanh thu ĐÃ THU** (`Payment` xác nhận) **hay doanh thu GHI NHẬN** (`finalPrice` của học viên đang học)? Hai số chênh nhau **đúng bằng công nợ**, và chỉ số thứ hai là **bên nhận khó giấu** | GD-06 · `R-D9-09` · `R-D10-12` · ngưỡng đạt của thí nghiệm #7 | Ban giám đốc + Kế toán tổng hợp HO |
| **c7** | **Doanh thu kit/thiết bị/lệ phí thi** của cơ sở bên NHẬN **CÓ nằm trong căn cứ tính phí** không? Nếu có thì hệ thống **hiện chưa ghi nhận được nhóm này** | GD-65 · `R-D9-09` · `R-D10-04` | Ban giám đốc |
| **c8** | Hợp đồng có **mức phí SÀN theo tháng** hoặc **bậc thang theo doanh thu** không? Nếu có, khi doanh thu thực **dưới sàn** thì hệ thống hiển thị con số nào là *"phí phải trả"*? | GD-38 · `R-D9-09` · `R-D9-12` | Ban giám đốc + pháp chế |
| **c9** | **Một hợp đồng nhượng quyền có được phủ NHIỀU cơ sở không?** Nếu có, phí tính **gộp cả hợp đồng** hay **riêng từng cơ sở**? | GD-67 · `R-D9-01` · `R-D9-09` · `R-D2-12` | Ban giám đốc |
| **c10** | Khi **gia hạn**, hợp đồng mới ký **trước** ngày hợp đồng cũ hết hạn có được **cùng `ACTIVE`** không? Nếu có, **kỳ chồng lấn** tính phí theo tỉ lệ nào? | GD-55 · `R-D9-01` · `R-D9-02` (ràng buộc CHECK) | Ban giám đốc + pháp chế |
| **c11** | Có **phân biệt cắt vì HẾT HẠN** (cho chuyển tiếp) **với cắt vì VI PHẠM** (chặn ngay) không? `R-D9-01` hiện chỉ có **một trạng thái `TERMINATED`** cho cả hai — **không chỗ nào ghi được sự khác nhau này** | GD-33 · `R-D9-01` · `R-D9-06` · `R-D9-10` | Ban giám đốc + pháp chế |
| **c12** | **Ngoài kế toán tổng hợp HO, ai KÝ con số căn cứ tính phí về phía BÊN NHẬN?** Không có chữ ký hai phía thì bản đối soát chỉ là **báo cáo nội bộ của HO** | GD-18 · `R-OPS-03` · `R-D10-04` | Ban giám đốc + Kế toán tổng hợp HO |
| **c13** | Kế toán chấp nhận **ký ở mức chênh bao nhiêu phần trăm**, và **ai xử lý danh sách tồn đọng** không suy được đơn vị? | GD-28 · `R-OPS-03` · `R-OPS-05` · `R-D10-08` | Kế toán tổng hợp HO |
| **c14** | **Phiếu thu đã phát hành vào dải số SAI** (`RCP-SR-…`, do `centerCodeOf` rơi về `"SR"` — `lib/finance/payment.ts:41`, `:43`) xử lý thế nào: **huỷ và phát hành lại**, hay **chấp nhận và chỉ sửa từ ngày triển khai**? Câu này biến `R-D10-08` thành **việc kế toán**, không chỉ việc kỹ thuật | GD-30 · GD-70 · `R-D10-08` · `R-D2-18` | Kế toán tổng hợp HO + Ban giám đốc |
| **c15** | Khi học viên **chuyển giữa cơ sở bên NHẬN và cơ sở nội bộ**, **phần học phí còn dư thuộc pháp nhân nào** — hoàn ở nơi thu rồi thu lại ở nơi nhận, hay chuyển nội bộ? *(§9 câu 7 hỏi **cấm hay cho phép**; câu này hỏi **số dư đi đâu** — chưa ai hỏi)* | GD-31 · `R-OPS-13` · `R-D10-06/07` | Ban giám đốc + Kế toán tổng hợp HO |
| **c16** | **Tỉ lệ phân bổ** (`EmployeeOrgAssignment.allocationPercent`, `prisma/schema.prisma:455`) có dùng để **chia chi phí lương giữa bên nhượng và bên nhận** không? Nếu có, **tổng khác 100% phải bị TỪ CHỐI** thay vì chỉ cảnh báo | GD-42 · `R-D3-06` · `R-D9-09` | Ban giám đốc + Kế toán tổng hợp HO |

### Nhóm C — nhân sự, quyền và cắt quyền

| # | Câu hỏi | Chặn cái gì | Ai trả lời |
|---|---|---|---|
| **c17** | **Danh sách mã vai trò được coi là "vai trò giảng dạy"** (`R-CONST-01`) gồm chính xác những mã nào — **`TRAINING` có nằm trong đó không**? Không có danh sách thì **cả phép đếm lẫn tiêu chí nghiệm thu `R-D3-09` đều không chạy được**. Kèm: **trợ giảng · giáo viên thỉnh giảng · người Đào tạo dạy thay** có tính là *"đang giữ vai trò giảng dạy"* không? | GD-64 · GD-14 · `R-CONST-01` · `R-D3-09` · `R-D3-10` · `R-D8-10` (đã gộp) | Đội Đào tạo HO + HR HO |
| **c18** | **Hợp nhất về hàm nào** — bản **CÓ** `substituteTeacherId` (`lib/lms/session-ownership.ts`) hay bản **KHÔNG** (`lib/scorm/access.ts:37-41`)? Đây là **quyết định nghiệp vụ** *"người dạy thay có được xem giáo án trước buổi không"*, **không phải việc dọn mã** | GD-11 · `R-QDB-06` · `R-D8-07` · `R-D8-14` | Đội Đào tạo HO |
| **c19** | **Ai bắt buộc lập đợt điều động** — HR Hội sở hay quản lý cơ sở đi mượn — và **chậm nhất bao lâu trước ngày khai giảng**? | GD-13 · `R-D3-05` · `R-D3-06` | HR HO + Ban giám đốc |
| **c20** | **Quyền cấp kèm đợt điều động có được để trống ngày hết hạn không**, hay hệ thống phải **chép cứng hạn của đợt** và **từ chối hạn dài hơn**? (`UserOrgRole.effectiveTo` cho phép `null` = vô thời hạn — `prisma/schema.prisma:360`) | GD-15 · `R-D3-07` · `R-D3-08` · `R-D3-12` | HR HO + Luân |
| **c21** | **Nhân sự biên chế Hội sở có được điều động sang cơ sở bên NHẬN (pháp nhân khác) không?** Nếu có, căn cứ là **hợp đồng nhượng quyền** hay **một phụ lục lao động riêng**, và **ai ký**? | GD-37 · `R-D3-05` · `R-D9-01` · nhóm 8 (dữ liệu cá nhân qua pháp nhân) | Ban giám đốc + HR HO + pháp chế |
| **c22** | **Mỗi tài khoản nhân sự có BẮT BUỘC nối tới một hồ sơ nhân viên không?** (`User.employeeId` hiện **nullable** — `prisma/schema.prisma:739`). Nếu **không**, thì cắt quyền theo **nguồn biên chế** dựa vào đâu? | GD-73 · `R-D3-03` · `R-D3-12` · ngưỡng (C) của thí nghiệm #6 | HR HO + Luân |
| **c23** | **Cờ nào là tín hiệu chính thức của "nghỉ việc"** để hệ thống cắt quyền, và các cờ còn lại (`isActive` legacy, `endDate`, `accountStatus`) **có được phép nhập độc lập không**? *(§9 câu 4 hỏi **quyền có mất không**; câu này hỏi **đọc cờ nào**)* | GD-21 · `R-D3-12` · `R-D9-05b` | HR HO + Luân |
| **c24** | **Cơ chế tăng `tokenVersion` của `R-D9-05b`** (`02-prd:283`) có áp dụng chung cho **MỌI** lần thu hồi quyền theo nguồn (**biên chế · kiêm nhiệm · hợp đồng**) không, hay làn B2 chấp nhận khoảng *"cắt được tầm nhìn, chưa cắt hết quyền ghi"*? | GD-72 · GD-43 · `R-D3-02/07/08/12` · `R-D9-05b` | Ban giám đốc + Luân |
| **c25** | Khi một người **kiêm nhiều vai trò**, **quyền xem lương** lấy theo **vai trò chính** hay theo **hợp các vai trò**? | GD-75 · `R-D4-06` · `R-D2-14` | HR HO + Ban giám đốc |
| **c26** | Sau khi **thu hẹp `isHoLevel`**, **vai trò HO nào vẫn được xem dữ liệu toàn hệ thống theo chức năng** (kế toán tổng hợp? marketing?) — và **xem tới mức chi tiết nào**? | GD-19 · `R-D4-09` · `R-D10-04` · `R-D10-10` · ngưỡng của thí nghiệm #15 | Ban giám đốc |
| **c27** | **Danh sách action mà `SUPER_ADMIN` miễn nhiễm DENY gồm chính xác những gì** — hay **giữ miễn nhiễm toàn phần như v1** (`QUYET-DINH.md:53`) và **sửa lại nghiệm thu `R-QDB-02`**? Hai mã `R-QDB-02` và `R-QDB-03` **mâu thuẫn trên cùng một ca** | GD-22 · `R-QDB-02` · `R-QDB-03` (phải cùng lần phát hành, `02-prd:440`) | Ban giám đốc + Luân |
| **c28** | **Ai là người phụ trách dữ liệu ở phía FRANCHISEE**, do **bên nào bổ nhiệm**, và **HO có được quyền phủ quyết một lệnh xoá của họ không**? | GD-39 · `R-DP-01..07` · `R-D9-06` | Ban giám đốc + pháp chế |

### Nhóm D — vận hành, lịch và học liệu

| # | Câu hỏi | Chặn cái gì | Ai trả lời |
|---|---|---|---|
| **c29** | **Ai xác nhận đồng hồ shadow đang thực sự GHI** (có canary không), và **lần TRUNCATE gần nhất là khi nào**? Không có câu này thì "N ngày sạch" là **số không diễn giải được** | GD-62 · GD-44 · `R-QDB-04/05` · điều kiện khởi động làn B | Luân (chủ đồng hồ) + chủ đợt go-live RBAC |
| **c30** | **Ai gỡ vòng khoá thứ tự**: §8 xếp `R-QDB-01..05` **vào làn B** (chờ cửa sổ đóng) trong khi **QĐ-B đòi `R-QDB-01/02/03` xong TRƯỚC khi bật cờ** (`QUYET-DINH.md:52-54` · `:58`)? *(§9 câu 12 hỏi **tiêu chí đóng cửa sổ**; câu này hỏi **ai cắt vòng tròn**)* | GD-44 · `R-QDB-01..05` · **toàn bộ làn B** | Ban giám đốc + chủ đợt go-live RBAC |
| **c31** | **Đợt security hardening đang chạy do AI CHỦ TRÌ, phạm vi gồm những file/route nào**, và **ai điều phối** khi hai đợt sửa cùng file? *(§9 câu 15 chỉ hỏi đợt đó **có nhận 2 việc** không; câu này hỏi **có tài liệu phạm vi + người chủ trì** không)* | GD-69 · mọi mã mang **Cờ 2** (`R-D10-06/07/08`, `R-D4-11`, `R-D8-08`) | Ban giám đốc |
| **c32** | **Đã có lần khôi phục backup nào được DIỄN TẬP và ghi lại chưa?** Nếu chưa, Ban chấp nhận chạy đợt chuyển đổi cây với mốc **RPO 24h**, hay **đòi một diễn tập khôi phục trước**? | GD-56 · `R-OPS-10` · `R-OPS-05` · pha B4 | Ban giám đốc + Kiệt |
| **c33** | **Sáu mã `R-D4-01/02/03/04/05/10` (và >20 mã khác) nằm ở PHA NÀO**, và **có được phép chạm `prisma/seed-roles.ts` trong lúc cửa sổ shadow còn mở không**? (`R-D4-10` cỡ **L** hiện **không nằm trong bất kỳ pha nào** của §8 — `02-prd:409-444`) | GD-34 · GD-54 · `R-D4-10` · `R-D4-06` | Ban giám đốc + Luân |
| **c34** | **Có khung chương trình nào hiện do CƠ SỞ tự soạn không?** Và khi bên NHẬN đầu tiên soạn khung riêng thì **ai đặt `ownerOrgUnitId`** — người tạo tự chọn hay suy từ đơn vị của họ? | GD-35 · GD-01 · `R-D8-01` (cột **duy nhất** mở khoá đồng thời D8 và D10, `02-prd:404`) · `R-D10-02/03` | Đội Đào tạo HO + Ban giám đốc |
| **c35** | **Quản lý cơ sở bên NHẬN được thấy siêu dữ liệu học liệu của TOÀN MẠNG LƯỚI, hay chỉ của các khung chương trình cơ sở họ đang chạy?** | GD-05 · `R-D8-03` · `R-D8-08` · `R-D10-02` | Đội Đào tạo HO + Ban giám đốc |
| **c36** | **Ai chịu trách nhiệm trả lời quản lý cơ sở khi buổi thiếu tài liệu** — Đội Đào tạo HO có **cam kết thời gian đáp ứng** không? Và **"học liệu bắt buộc của một buổi" khai ở đâu** (hiện **không có chỗ khai**)? | GD-25 · `R-D8-06` · `R-D6-07` | Đội Đào tạo HO |
| **c37** | **Chốt MỘT đường nối duy nhất buổi↔bài: `lessonId` hay `planId`?** Hiện **hai đường cùng sống**, `R-D8-06` phải bám vào đường nào? Và **gói gắn bài KHÁC bài của buổi** thì **chặn hay cho qua có cảnh báo**? | GD-77 · GD-17 · `R-D8-06` · `R-D8-07` | Đội Đào tạo HO + Kiệt |
| **c38** | **Ma trận `R-D8-14` chạy trên host nào** — chỉ admin, chỉ giáo viên, hay **cả hai**? Tiêu chí hiện **không nói**, mà **hai host có hai bản mã** | GD-79 · `R-D8-14` · `R-D8-07` | Kiệt + Luân |
| **c39** | **Action mới của `R-D8-09` tên là gì**, và **ai chịu trách nhiệm khai nó ở CẢ ma trận tĩnh lẫn sổ vai trò động** (`ACTION_REGISTRY` khai ở `lib/auth/action-registry.ts:8`; `actor.ts:118` chỉ **đọc** nó) — hiện hai nơi này do **hai đường sửa khác nhau** | GD-80 · `R-D8-09` · `R-D4-12` | Luân + Đội Đào tạo HO |
| **c40** | **Nhật ký lượt xem nội dung có phải dữ liệu cách ly theo cơ sở không?** Nếu có thì phải **thêm trục cơ sở NGAY ở `R-D8-11`**, vì thêm sau là **backfill lại toàn bảng** (`ScormAccessLog` hiện **6 cột**, không có trục cơ sở — `prisma/schema.prisma:4686-4698`). *(§9 câu 10 hỏi **độ hạt**; câu này hỏi **trục cơ sở**)* | GD-81 · `R-D8-11` · `R-D4-01` | Ban giám đốc + Kiệt |
| **c41** | **Trước khi trả lời §9 câu 8 (vai trò pháp lý dữ liệu), Ban có chấp nhận MỞ cơ sở của bên NHẬN không?** Nếu **không**, thì `R-DP-01` phải là **chốt chặn của làn A**, không phải mã treo không pha | GD-27 · `R-DP-01..07` · thứ tự làn A | Ban giám đốc |
| **c42** | **Ban xác nhận: đội thi hành PRD này là 4–5 dev, hay chính là 2 mid dev + 1 FE của đợt go-live 26/07** (`README.md:12-16`)? Nếu là **cùng một đội** thì **việc nào của go-live được cắt** để lấy chỗ? | GD-26 · **A7** (`02-prd:387`) · toàn bộ lộ trình §8 | Ban giám đốc |
| **c43** 🔴 | **Ai được phép cho `R-D4-09` — hoặc ít nhất riêng phần lọc `roleCode` trong `isHoRoot` (`lib/auth/actor.ts:92-93`) — chạy TRƯỚC pha A4**, khi QĐ-A.1 **đã chốt** việc thu hẹp `isHoLevel` là **có đụng shadow** nên **chờ cửa sổ shadow đóng** (`QUYET-DINH.md:42`, bảng tra `:100`) và §8 xếp `R-D4-09` ở **B5** (`02-prd:434`), trong khi `01-intended-vs-implemented.md:70-72` ghi **"THỨ TỰ KHÔNG ĐẢO ĐƯỢC: sửa `isHoLevel` TRƯỚC, rồi mới dựng đường tạo `OrgUnit`"**? **Ba nguồn đang khoá nhau** — đây là **vòng khoá thứ hai**, khác vòng khoá QĐ-B mà **c30** đang hỏi, và **chưa câu nào phủ nó**. *(Không mở lại QĐ-A/QĐ-A.1 — chỉ hỏi **điều kiện thi hành**: hoặc cấp ngoại lệ cho phần lọc `roleCode`, hoặc hoãn A4 tới sau cửa sổ, hoặc chấp nhận rủi ro có đo.)* | GD-47 (Impact 8, độ tin **THẤP**) · `R-D2-01..08` · `R-D2-24` · `R-D4-09` · **điều kiện vào pha A4** | Ban giám đốc + chủ đợt go-live RBAC + Luân |

---

## 10. Điều kiện mở BƯỚC 5 (pre-mortem)

> BƯỚC 5 mổ **một kế hoạch**. Nếu 17 điểm gãy nặng nhất vẫn là phỏng đoán, pre-mortem sẽ **mổ phỏng đoán**, không mổ kế hoạch. Dưới đây là **điều kiện vào**, mỗi điều kiện có **người chịu trách nhiệm** và **chỉ số đạt**.

| # | Điều kiện phải có trước BƯỚC 5 | Người chịu trách nhiệm | Chỉ số đạt |
|---|---|---|---|
| **Đ1** | **9 thí nghiệm chỉ-đọc / đối soát tài liệu** (thứ tự 1–9 ở §7) đã chạy xong | Luân (#1) · Kiệt (#2, #4–#9) · **Vy (#3)** | Mỗi thí nghiệm có **bảng số + kết luận ĐẠT/TRƯỢT ghi ngày**, dán vào file này. Thiếu 1 bảng = chưa đủ |
| **Đ2** | **Văn bản trả lời §9 câu 8** (vai trò pháp lý về dữ liệu) | Ban giám đốc + pháp chế | **Có văn bản, ghi ngày.** *"Đã hỏi"* / *"đang chờ"* = **không đạt** |
| **Đ3** | **Văn bản trả lời c1** (node FRANCHISEE là `CENTER` hay `FRANCHISE`) | Ban giám đốc (quyết) + Luân (hệ quả kỹ thuật) | **Có văn bản, ghi ngày** + 1 đoạn ghi hệ quả `scopedDb` đã được Luân xác nhận |
| **Đ4** | **`R-TECH-01` có kết quả** (ca 1 của GD-54) | Luân | 1 test **xanh hoặc đỏ**, kết quả ghi lại. **Đỏ cũng là đạt** — cái không đạt là *"chưa chạy"* |
| **Đ5** | **Bản chụp "trước" của `R-OPS-02`** (GD-61) tồn tại | Luân | File CSV `tai_khoan × 8 quyết định` đã sinh, **trước** mọi bản vá `R-D4-09` |
| **Đ6** | **Lưới an toàn đã được đo** (GD-45) | Luân | 3 phép đục đã chạy, ghi rõ **job nào đỏ / job nào vẫn xanh** |
| **Đ7** | **Đã BÁO LẠI chủ đợt go-live RBAC** rằng QĐ-B **chặn lịch flip** (`QUYET-DINH.md:59` · `:58`) | Luân (soạn) + Ban giám đốc (gửi) | **Có email/biên bản ghi ngày.** Đây là **nghĩa vụ báo cáo, KHÔNG phải câu hỏi** — không chờ ai trả lời |
| **Đ8** | **Bảng lệch 3 vùng mù** (GD-76) đã có ít nhất **vùng 1** (125 điểm gác role thô) | Luân | CSV `vung, vai_tro, action, ket_qua_hien_tai, ket_qua_khi_bat_co` cho vùng 1 |

### Cái gì KHÔNG mở được làn B

> ⚠️ Đọc kỹ — đây là chỗ dễ nhầm nhất của cả tài liệu.

1. **Đèn shadow xanh KHÔNG mở làn B.** Dù **Đ1** cho ra GD-44 **ĐẠT** và GD-62 **ĐẠT**, hai kết quả đó chỉ chứng minh **đồng hồ đo được**. **Cổng mở làn B là 3 việc của QĐ-B** (`QUYET-DINH.md:52-54`: thêm `grantsDeny` vào `Actor` · chặn DENY ở **đầu** `can()` v2 trước cả nhánh `SUPER_ADMIN` · bộ test ma trận `DENY × scopeType`) cộng **chặn cứng** `:58`. Không có 3 việc đó thì **không** được bật `RBAC_V2_ENABLED`, bất kể đồng hồ xanh bao lâu.
2. **Đếm bản ghi DENY (A4) KHÔNG phải cổng mở.** QĐ-B **đã chốt** v2 phải tôn trọng DENY (`QUYET-DINH.md:46-48`). Vì vậy con số DENY chỉ để **ƯỚC LƯỢNG ĐỘ LỚN rủi ro** (`:61`), **không** phải điều kiện quyết định. Ai dùng con số này làm cổng là **hiểu ngược QĐ-B**.
3. **GD-76 không phải cổng chung của làn B** — nó là **điều kiện chuyển từng đợt `R-D4-12`** (B7). Nhưng **phần ĐO** của nó phải kéo lên **trước B1**, vì `R-D4-12` xếp sau cùng (`02-prd:436`) thì lúc chạm bề mặt lớn nhất sẽ **không còn lưới so sánh**.
4. **QĐ-C không chờ số liệu.** Việc đếm ca học bù chéo (**A5** / `R-QDC-05`) là **DỌN DỮ LIỆU TỒN trước khi thi hành** (`QUYET-DINH.md:79`), **KHÔNG** phải điều kiện để quyết định có gỡ `MAKEUP_EXCEPTION_MODELS` hay không — QĐ-C **đã chốt gỡ** (`:73`).
5. **B5 không mở nếu GD-28 trượt.** `R-OPS-03` là **điều kiện bật** cho B5 (`02-prd:444`); nếu dữ liệu tiền có bản ghi **gán SAI** cơ sở thì backfill sẽ **củng cố cái sai** rồi kế toán ký lên nó — **không quay lui được**.

---

## 11. Truy vết

| Giả định | Mã `R-*` bị chặn | Làn |
|---|---|---|
| **GD-02** | `R-D2-24` · `R-OPS-12` · `R-D6-14` · (KR1/KR2 §4) | **A** (A1) |
| **GD-06** | `R-D9-09` · `R-D10-12` · `R-OPS-03` · `R-D10-04` | **A** (A6, hợp đồng) + **B5** |
| **GD-09** | `R-D8-07` · `R-D8-11` · `R-D8-12` | **A** (A2, A9) |
| **GD-24** | `R-D8-07` · `R-D8-14` · `R-D6-05` | **A** (A2) |
| **GD-26** | **toàn bộ §8** (`R-D2-16/17/18` · `R-QDB-02/03` · `R-D3-10`) | **A + B** |
| **GD-28** | `R-D10-07` · `R-D10-08` · `R-OPS-05` · `R-OPS-03` | **B5** *(bước vá mang **Cờ 2**)* |
| **GD-32** | `R-D10-04` · `R-D10-05` · `R-DP-01` · `R-DP-07` | **B5** + nhóm 8 **chưa có làn** |
| **GD-43** | `R-D3-02/07/08/12` · `R-D9-05b` · `R-QDB-06` · `R-D4-12` | **B2 / B3** |
| **GD-44** | `R-QDB-01/02/03/04/05` | **B1** + **điều kiện khởi động cả làn B** |
| **GD-45** | `R-D2-24` · `R-QDC-03` · `R-D4-11` · `R-D4-09` | **A1 / A3** + **B6** |
| **GD-46** | `R-D4-13` · `R-D10-06/07/08` · `R-D2-16/19/20` | **A1** + **B4 / B5** |
| **GD-50** | `R-D6-02` · `R-D6-03` · `R-D6-04` | **A** (A8) |
| **GD-54** | `R-TECH-01` · `R-D4-06` · `R-D4-10` · `R-D2-14` | **B6** *(`R-D4-10` **không có pha**)* |
| **GD-59** | `R-D3-03` · `R-D3-09` · `R-D3-10` | **A** (A5) + **B2** |
| **GD-61** | `R-D4-09` · `R-D10-04` · `R-D10-10` · `R-OPS-02` | **B5** |
| **GD-62** | `R-QDB-04` · `R-QDB-05` · `R-D4-12` | **B1 / B7** |
| **GD-76** | `R-D4-12` · `R-QDB-05` · `R-QDB-06` | **B7 / B1** *(phần ĐO phải kéo lên trước B1)* |

### Bước này dùng nguồn nào, kiểm chứng thế nào, còn gì chưa kiểm được

**Nguồn.** `02-prd-franchise-platform.md` (112 yêu cầu, §7.3 chuẩn hai cờ, §7.4 A1–A9, §8 hai làn, §9 15 câu) · `QUYET-DINH.md` (QĐ-A/A.1/B/C/D + 6 câu treo) · `03-job-stories.md` (26 job story, `a1–a7` / `b1–b11`) · `00-baseline.md`, `00-dryrun.md`, `00-scope-gap.md`, `01-intended-vs-implemented.md` · **mã nguồn repo** (`prisma/schema.prisma`, `lib/auth/*`, `lib/db-scope.ts`, `lib/org/*`, `lib/finance/payment.ts`, `lib/scorm/access.ts`, `components/admin/slide-stage.tsx`, `scripts/shadow-report.ts`, `.github/workflows/ci.yml`, `playwright.*.config.ts`, `package.json`) · `docs/ke-hoach-go-live-2607/README.md` và `shadow-log.md`.

**Kiểm chứng.** Mọi `đường-dẫn:số-dòng` trong mục 6–11 **đã được mở lại bằng Read/Grep trước khi viết**. Mọi mã `R-*` đã được **grep trong `02-prd-franchise-platform.md`** — **không mã nào phải ghi *"KHÔNG THẤY TRONG 02-prd"***. **Ba đính chính so với bản nháp đưa vào:** (a) *"42 action mất khi flip"* nằm ở **`00-baseline.md:108`**, không phải `:106` (`:106` là "280/301 dòng seed GLOBAL"); (b) luật V7 *"`centerId` chỉ set cho type CENTER"* nằm ở **`lib/org/orgunit-rules.ts:59-62`**, không phải `:58-59`; (c) trong `tests/e2e/r7/makeup-cross-center.spec.ts`, `withMakeupException` được import ở **`:18`**, hai `expect(out).toHaveLength(2)` ở **`:171`** và **`:186`**, ca C3 ở **`:194`** với audit `MAKEUP_CROSS_CENTER` ở **`:214`**, roster chéo ở **`:238`**. Ngoài ra **không khẳng định con số action của `lib/auth/permissions.ts`** — phép đếm cho ra con số khác bản nháp, nên câu chữ đã đổi thành *"mọi action khai trong `lib/auth/permissions.ts`"*.

**Còn gì chưa kiểm được.** (1) **Mọi con số trên dữ liệu prod** — 7/17 thí nghiệm là truy vấn chỉ-đọc **chưa chạy**; bước này chỉ **thiết kế** truy vấn và **ngưỡng**, không có quyền chạy. (2) **Hai giả định Impact 10** (`GD-06`, `GD-32`) là **điều khoản thương lượng**, **không dòng mã nào trả lời hộ** — chỉ có văn bản của Ban. (3) **Công suất đội** (`GD-26`) đo bằng git + file kế hoạch, **không** đo được cam kết tương lai. (4) **Hành vi `result:` extension** (`R-TECH-01`) chưa từng chạy trong repo — mọi phát biểu về nó vẫn là `[SĐ]` cho tới khi ca 1 của GD-54 chạy. (5) **Giá trị `RBAC_V2_ENABLED` thật trên prod** phải đọc ở bảng điều khiển Vercel — **không đọc `.env`**, nên bước này chỉ khẳng định **mặc định trong mã** là OFF (`lib/flags.ts:7-9`). (6) **Con số 13 trang admin** gọi `getSelectableOrgUnits` không truyền `types` lấy từ vòng phản biện trước; bước này **không đếm lại**. (7) **Cặp `Confidence` / `Effort` chốt của 84 mã chưa được ghi lại** — chỉ có `Impact` và `Risk`, nên công thức `Risk = (1 − C/10) × E` **không tái lập được từ tài liệu**; việc bổ sung hai cột đó là việc tồn của vòng sau (xem cảnh báo ở §4).

**Đính chính của vòng 29/07 (đã mở lại từng chỗ bằng Read/Grep trước khi sửa).** (1) `GD-06` chốt nhóm **GIÁ_TRỊ**, hàng `GD-06` của bảng §3 đã sửa theo — sau khi sửa, đếm máy bảng §3 khớp cả 4 tiêu đề §5.1–§5.4. (2) Ngưỡng ô THÍ_NGHIỆM hạ từ `Impact ≥ 7` xuống **`Impact ≥ 6`** ở cả §1 lẫn ma trận §4 — vùng `Impact = 6 ∧ Risk ≥ 5` trước đây **không thuộc ô nào**; `GD-50` nay vào THÍ_NGHIỆM bằng luật, số mã mỗi ô **không đổi** (17/60/0/7). (3) Đếm lại theo góc nhìn: **23 PM · 17 Thiết kế · 44 Kỹ sư** (vòng trước ghi 22/17/45). (4) Số mã LÀM_LUÔN mang Cờ 2 = CÓ: **32**, không phải 22; toàn tài liệu **44**. (5) Nhóm KHẢ_DỤNG có **10** mã Cờ 2 = CÓ, không phải 7. (6) Mẫu số `scopeType` của `prisma/seed-roles.ts` là **301** dòng quyền (280 GLOBAL), khớp `00-baseline.md:106` — con số 307 là số **dòng chứa chuỗi** `scopeType`, gồm cả chú thích. (7) §9 câu 2 ở `02-prd:455`, **không phải** `:454` (`:454` là câu 1). (8) `lib/org/orgunit-rules.ts:59-62` (V7) — đã sửa nốt chỗ dẫn `:58-59` còn sót ở §2. (9) **Chốt chặn của B5 là `R-D10-10`** (`02-prd:434`, `:441`), không phải `R-D10-04` (`R-D10-04` cỡ L ở `:294`, nằm áp chót). (10) `R-D2-24` **không** xuất hiện trong `02-prd:409-423`; 9 pha làn A ở `:413-421`, nghiệm thu tổng ở `:187`, KR1/KR2 ở `:77-78`. (11) `playwright.crm.config.ts:14` là `testDir` (`:15` là `tsconfig`). (12) `model ClassSession` = `prisma/schema.prisma:1440-1502` (dùng cùng một dải ở mọi chỗ dẫn). (13) Cơ chế sinh mã: khoá bộ đếm **có kèm mã cơ sở** và mã mang tiền tố `${cc}.` ⇒ *"trộn chung một dãy"* là **rủi ro có điều kiện** (`sanitize()` ép `CS_1` → `CS1`, hoặc rơi về hằng `"SR"`), **không phải** hiện trạng mặc định — câu chữ ở §5.3 đã sửa cho khớp bằng chứng ở GD-70. (14) Ba mốc chèn biên tập dạng chú thích HTML còn sót ở đầu §5.3, §5.4 và §6 đã xoá hết. (15) Từ vựng dòng meta của 84 khối §5 đã chuẩn hoá về đúng từ vựng bảng §3 (`LÀM_LUÔN` · `THÍ_NGHIỆM` · làn `A`/`B`/`A+B`/`chưa rõ` · cờ `CÓ`/`KHÔNG`/`chưa rõ`). (16) Mở thêm **`c43`** — vòng khoá thứ tự giữa QĐ-A.1, §8 và `01-intended:70-72` quanh `R-D4-09` vs pha A4 (chặn GD-47).

---

Bước này không sửa bất kỳ file nào khác ngoài E:/satarobo-vn/docs/taicautruc/04-assumptions.md.
