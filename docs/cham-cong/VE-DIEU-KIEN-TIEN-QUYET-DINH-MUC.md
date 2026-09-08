# VÉ — ĐIỀU KIỆN TIÊN QUYẾT CỦA BỘ ĐẾM ĐỊNH MỨC BUỔI TRÁCH NHIỆM

| | |
|---|---|
| **Ngày** | 07/09/2026 |
| **Trạng thái** | 📋 **CHỈ LIỆT KÊ + ƯỚC LƯỢNG. KHÔNG CODE.** |
| **Chặn** | Bộ đếm định mức 50/30/20 (SR.QD.230 PL01 §2.c · PL02 §2.a · PL04 §A.1.b) |
| **Quyết định đã có** | 07/09 — chọn phương án **(b)**: tạm ẩn ô nhập `countsTowardQuota`, giữ cột, giữ dữ liệu |

> Bộ đếm **chỉ khởi động sau khi cả 4 mục dưới đây xong**.

---

## 0. Vì sao (a) bị hoãn

Hai lý do, và lý do thứ hai mới là lý do chặn thật:

1. Dựng xong bộ đếm thì nó **ra 0 cho tất cả mọi người** — `sessionCategoryId` chỉ có một đường ghi
   (form sửa buổi) và không bắt buộc, nên gần như mọi buổi rơi về `CHINH_THUC` vốn
   `countsTowardQuota = false`. 2 ngày công để có một cột toàn số 0.
2. 🔴 **Lỗ quyền.** Bộ đếm phải đọc `Employee.contractType` để biết định mức là 50, 30 hay 20.
   Trường đó thuộc nhóm `personal`, **chỉ `SUPER_ADMIN` và `HR`** được xem
   (`lib/auth/permissions.ts:931`). Màn Công dạy thì mở cho mọi người có `hr_attendance:view`.
   ⇒ Bày cột "38/50" cho Quản lý cơ sở là **kênh suy ngược ra loại hợp đồng của đồng nghiệp**.
   Một mình lý do này đã đủ để không làm (a) theo thiết kế hiện tại.

---

## 1. `sessionCategoryId` phải có đường ghi ở MỌI luồng tạo buổi, và phải bắt buộc

### Hiện trạng đo được — có **ba** đường tạo `ClassSession` trong mã sản xuất

| # | Vị trí | Sinh buổi gì | Có gán phân loại không |
|---|---|---|---|
| 1 | `app/(admin)/admin/sessions/_actions.ts:166` | Form thêm/sửa buổi thủ công | ✅ **có** (07/09) — nhưng **tuỳ chọn** |
| 2 | `lib/classes/generate.ts:158` và `:205` | `createMany` — sinh cả dãy buổi khi duyệt lớp / xếp lại lịch | ❌ không |
| 3 | `lib/classes/adjust.ts:102` | **Buổi BÙ** — huỷ một buổi thì tự tạo buổi bù | ❌ không |

### 🎯 Phát hiện đáng giá nhất của vé này

Đường **#3 tạo đúng buổi bù** — nó huỷ buổi gốc rồi `create` một buổi mới với ngày bù. Nghĩa là
**"dạy bù" gán được TỰ ĐỘNG, không cần ai bấm gì**, chỉ cần một dòng
`sessionCategoryId: <BU>` tại chỗ đó.

Đây là câu trả lời cho việc "dạy bù chưa làm được" đã treo từ 06/09: nó **không** cần người vận
hành gán tay từng buổi như tôi tưởng.

Đường **#2** thì ngược lại — nó sinh dãy buổi học chính thức, nên mặc định `CHINH_THUC` là đúng;
chỉ cần gán tường minh thay vì để `null`.

### Công việc

| Mục | Nội dung | Ước lượng |
|---|---|---|
| 1.1 | `adjust.ts` gán `BU` cho buổi bù (trong transaction đang có) | **1,5h** + 2 test |
| 1.2 | `generate.ts` gán phân loại mặc định cho `createMany` (2 chỗ) | **1,5h** + 2 test |
| 1.3 | Bắt buộc trường ở form thủ công (`sessionSchema` bỏ `.optional()`) + xử lý form cũ đang mở | **2h** + 2 test |
| 1.4 | Backfill buổi cũ: buổi có `status = CANCELLED` kèm buổi bù tương ứng thì gán `BU`; còn lại `CHINH_THUC`. Script dry-run, chạy tay | **3h** + doc |
| 1.5 | Test tĩnh: mọi `classSession.create`/`createMany` mới **phải** truyền `sessionCategoryId` — theo khuôn `nav-coverage` | **2h** |
| | **Cộng** | **~10h · 6 test** |

> ⚠️ 1.3 là chỗ **đụng thói quen vận hành hằng ngày**: giáo vụ đang tạo buổi mà bị thêm một
> trường bắt buộc. Cần báo trước, không đẩy thẳng lên prod giữa tuần.

---

## 2. `TrialClassSession` cần cột phân loại

### Vấn đề

Chính sách (PL04 §A.1.b) liệt **Trial** là buổi trách nhiệm của giáo viên cơ hữu. Nhưng
`TrialClassSession` (`prisma/schema.prisma`) **không có cột phân loại nào**, và
`lib/cham-cong/cong-day-db.ts:135` đẩy mọi buổi trải nghiệm xuống với `categoryCode: null` **cứng**.

⇒ **Buổi trải nghiệm không bao giờ vào được định mức.** Nối bộ đếm theo `countsTowardQuota` mà
không xử riêng nguồn `TRIAL` là ra số **thiếu, và thiếu im lặng**.

### Hai cách, tôi nghiêng cách B

| | Cách | Đánh đổi |
|---|---|---|
| **A** | Thêm `sessionCategoryId` vào `TrialClassSession` | Đối xứng với `ClassSession`, nhưng mở đường cho người gán buổi trải nghiệm thành "Workshop" — vô nghĩa, và đẻ tổ hợp cần chặn |
| **B** | Coi **nguồn `TRIAL` = một phân loại cố định**, ánh xạ ở tầng đọc (`cong-day-db.ts`) sang một `SessionCategory` mã `TRIAL` | Không đụng schema, không đụng đường ghi trial. Nhược: `SessionCategory` có một dòng "ảo" không buổi `ClassSession` nào trỏ tới — phải ghi rõ trong mã, kẻo người sau tưởng là dòng chết |

**Ước lượng cách B:** **3h** + 3 test (gồm 1 test khoá "buổi trial luôn ra đúng phân loại TRIAL").
**Cách A:** 5h + migration + 3 test.

---

## 3. Mười ba câu nghiệp vụ — trả một lượt

> Chủ dự án yêu cầu gom thành một danh sách. Đây là danh sách đó. Mọi câu đều **không suy được từ
> mã nguồn**.

### Nhóm A — định mức đếm cái gì

| # | Câu hỏi | Vì sao chặn |
|---|---|---|
| **A1** | Định mức 50/30/20 đếm **mọi buổi đã dạy** trong tháng, hay **chỉ buổi trách nhiệm** (Bù/Vượt/Hỗ trợ ĐT&VH/Trial)? | Đọc PL04 §A.1.b hiểu được **cả hai cách**, và hai cách ra hai con số khác hẳn nhau |
| **A2** | Đếm bằng **số buổi** hay bằng **công đã nhân hệ số**? Một buổi Workshop hệ số 120% tính là 1 buổi hay 1,2 buổi khi so với 50? | |
| **A3** | Buổi **trải nghiệm** có tính vào định mức không? | Nếu có thì mục 2 của vé này là bắt buộc, không phải tuỳ chọn |
| **A4** | Định mức tính theo **NGƯỜI toàn hệ thống** hay theo **từng cơ sở**? | Giáo viên neo CS1 đi dạy lớp CS2 hiện xuất hiện ở **cả hai** màn với buổi riêng ⇒ không chốt thì một người "vượt định mức" **hai lần** |
| **A5** | Có **prorate** định mức cho người vào/nghỉ giữa tháng, nghỉ thai sản, nghỉ dài không? | Kỳ công là tháng dương lịch trọn vẹn; SR.QD.230 cũng không nói rõ |

### Nhóm B — ai có định mức bao nhiêu

| # | Câu hỏi | Vì sao chặn |
|---|---|---|
| **B1** | Parttime **"Mức 1 / Mức 2"** đọc từ cột nào? Không cột nào mang đúng nghĩa: `salaryLevel` là **1–5** và đang được luồng giao bài e-learning đọc với **nghĩa khác** (`lib/elearning/assignment-rule.ts:159-160`) | Ba lựa chọn (dùng lại + nới dải / ánh xạ / thêm cột) đều cần Nhân sự, và cần **ĐO** phân bố thật trước |
| **B2** | 5 giá trị `ContractType` còn lại (`INTERN`, `FREELANCE`, `THU_VIEC`, `CHINH_THUC_XAC_DINH`, `CHINH_THUC_KHONG_XAC_DINH`) xếp vào định mức nào? Hai loại `CHINH_THUC_*` **nghe như** Fulltime nhưng không phải giá trị `FULLTIME` | |
| **B3** | Người **chưa khai `contractType`** (3/15 trên prod) và người dạy **không có hồ sơ Employee** (`User.employeeId` nullable): không áp định mức, áp mặc định Fulltime, hay hiện cờ "chưa đủ dữ liệu"? | Mặc định im lặng là gán định mức sai cho người thật |
| **B4** | Định mức có **đè theo cơ sở** không? | Nếu CÓ thì phải làm thêm giao diện đặt CenterSetting — hiện **`saveCenterSettingAction` không có người gọi nào**, nên "đè theo cơ sở" đang là lời hứa suông. Nếu KHÔNG thì khai `centerOverridable: false` cho thẳng thắn |

### Nhóm C — tiền và sổ

| # | Câu hỏi | Vì sao chặn |
|---|---|---|
| **C1** | Đơn giá vượt định mức **80.000đ/buổi** là **một số duy nhất** hay theo **Rank 1–4** như PL03 §1? | Nếu theo Rank thì phải có cột Rank thật trước, và bài toán quay lại B1 |
| **C2** | Số vượt định mức có **đóng băng vào `summaryJson`** lúc chốt kỳ không? | Nếu sinh tiền thì **phải** đóng băng. Chọn "đóng băng" làm phình việc thêm **4–6h** |

### Nhóm D — hiển thị và vận hành

| # | Câu hỏi | Vì sao chặn |
|---|---|---|
| **D1** | **Ai được nhìn cột định mức?** → xem mục 4 | Đây là lý do (a) bị hoãn |
| **D2** | Ai đi gán phân loại cho **buổi sinh tự động** và **buổi đã có**? | → mục 1 của vé này trả lời phần lớn: #3 tự gán được `BU`, #2 tự gán `CHINH_THUC`. Còn lại là backfill 1.4 |

---

## 4. Cách bày định mức mà không lộ `contractType`

### Vấn đề chính xác
`contractType` ∈ nhóm `personal` ⇒ chỉ `SUPER_ADMIN`/`HR`. Định mức là **hàm một-một** của
`contractType` (FT→50, PT Mức 1→30, PT Mức 2→20). Nên **in con số định mức ra là in ra loại hợp
đồng**, dù không in chữ "Fulltime" ở đâu cả.

### Bốn phương án

| | Cách | Đánh đổi | Ước lượng |
|---|---|---|---|
| **P1** | **Chỉ hiện phần VƯỢT**, giấu mẫu số: `Vượt: 3 buổi` thay vì `53/50` | Không lộ định mức ⇒ không lộ hợp đồng. Nhưng Quản lý cơ sở mất khả năng **thấy trước** ai sắp chạm trần — mà PL01 §2.c nói đúng việc đó là của họ ("đề xuất bổ sung nhân sự") | **2h** |
| **P2** | Hiện `n/Q` nhưng **chỉ với người có `employees:view-salary`** (hoặc quyền mới `payroll:view`); người khác thấy cột trống | Đúng nguyên tắc, nhưng bảng có cột rỗng cho phần lớn người xem — và họ vẫn suy được từ chỗ ai có/không có số | **4h** + test ma trận quyền |
| **P3** | Hiện **mức độ** thay vì con số: `Còn nhiều` / `Sắp chạm` / `Đã vượt` | Giữ được công dụng cảnh báo của PL01 §2.c mà không lộ mẫu số. Ba mức suy từ tỷ lệ %, không in cả tử lẫn mẫu | **3h** |
| **P4** | **Tách màn riêng** `/cham-cong/dinh-muc`, gác bằng quyền lương, chỉ HR + Kế toán vào | Sạch nhất về quyền, nhưng thêm một màn nữa vào module vốn vừa rút sidebar từ 15 xuống 5 mục | **6h** + nav + test |

**Tôi nghiêng P3 + P4:** thanh mức độ trên màn Công dạy cho Quản lý cơ sở (đủ để họ bố trí nhân sự
theo PL01 §2.c), và con số thật ở màn riêng cho HR/Kế toán. Nhưng đây là **quyết định của chủ dự
án**, vì nó đánh đổi giữa quyền riêng tư của nhân sự và khả năng vận hành của Quản lý cơ sở.

---

## 5. Tổng ước lượng

| Mục | Giờ | Test |
|---|---|---|
| 1 — đường ghi phân loại ở mọi luồng | ~10h | 6 |
| 2 — phân loại cho buổi trải nghiệm (cách B) | ~3h | 3 |
| 3 — 13 câu nghiệp vụ | **0h code** — chờ người trả lời | — |
| 4 — cách bày định mức (P3 + P4) | ~9h | 4 |
| **Bộ đếm định mức** (phần (a) gốc) | ~13h | 18 |
| | **~35h** | **31 test** |

**Đường tới hạn không phải giờ công, mà là mục 3.** Không có 13 câu trả lời thì 35h kia sinh ra một
con số không ai bảo vệ được khi Kế toán hỏi.

---

## 6. Ghi chú kỹ thuật cho người làm sau

- Hai bộ test chấm công (`lib/cham-cong/*.test.ts` và `tests/cham-cong/*.spec.ts`) **chưa nằm trong
  cổng merge**. Viết test xong vẫn phải tự chạy
  `pnpm vitest run lib/cham-cong tests/cham-cong` — đừng tin CI xanh là đã chạy.
- Trợ giảng đang bị **quy hồi tố**: `class.assistantId` là cấp LỚP nên đổi trợ giảng giữa khoá quy
  lại cả buổi cũ (`cong-day-db.ts:113-115`). Hôm nay vô hại vì dòng `TRO_GIANG` để
  `countsInPeriod: false`; nối vào định mức sinh tiền là **biến nó thành lỗi tính tiền**. Cần
  `SessionTeachingAssignment` (xem `THIET-KE-LUONG-GIANG-DAY.md` §1.1) trước.
- Thêm trường mới vào `PeriodPersonRow` thì **phải có `?? mặc định`** ở cả 3 nơi đọc `summaryJson`,
  kẻo kỳ đã chốt trước đó ném `TypeError` và cả màn rơi vào error boundary — đúng sự cố đã xảy ra
  với `noiQuy`, vá ở `app/(admin)/admin/cham-cong/thong-ke/page.tsx:108-114`.
