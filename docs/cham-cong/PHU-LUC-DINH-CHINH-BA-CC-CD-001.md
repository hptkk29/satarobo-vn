# PHỤ LỤC ĐÍNH CHÍNH — BA-CC-CD-001 "Màn Công dạy giáo viên"

| | |
|---|---|
| **Mã tài liệu** | PL-DC-BA-CC-CD-001 |
| **Phiên bản** | 1.0 |
| **Ngày** | 07/09/2026 |
| **Đính chính cho** | BA-CC-CD-001 v1.0 (07/09/2026) — *Màn "Công dạy giáo viên", module Chấm công* |
| **Căn cứ nghiệp vụ của bản gốc** | SR.QD.230 + 09 phụ lục (hiệu lực 17/07/2026) |
| **Quan hệ với bản gốc** | **BỔ SUNG, KHÔNG THAY THẾ.** Bản gốc giữ nguyên trạng, không sửa đè. |

---

## 0. Vì sao có phụ lục này

BA-CC-CD-001 đã lưu hành; có người đang cầm bản cũ. Nên **không sửa đè lên bản gốc** — thay vào đó
liệt kê ở đây những chỗ mô tả **hiện trạng hệ thống** trong bản gốc lệch với mã nguồn đo được ngày
07/09/2026.

**Phạm vi đính chính:** chỉ phần *mô tả hiện trạng kỹ thuật*. Phần **nghiệp vụ** của bản gốc — bảng
Bậc/Mức/Rank, bảng đơn giá, hệ số phân loại buổi, định mức trách nhiệm, các RULE-CD-\* — **vẫn đúng
và vẫn là chuẩn**, vì chúng chép từ SR.QD.230 chứ không phải từ mã nguồn.

**Cách đọc:** bản gốc dùng để biết *phải làm gì*; phụ lục này dùng để biết *đang có sẵn những gì*.
Chỗ nào hai bản mâu thuẫn về hiện trạng → **phụ lục này thắng**, vì nó có số đo.

**Cách đo:** đọc trực tiếp `prisma/schema.prisma`, mã nguồn nhánh `hptkk29/module-cham-cong`, và
chạy thử SQL trên Postgres local `satarobo_test`. Mọi khẳng định dưới đây kèm `file:line`.

---

## 1. Bảng tóm tắt

| # | Bản gốc nói | Thực tế đo được | Mức |
|---|---|---|---|
| **Đ-1** | C1 — "Buổi học không có trường Giáo viên và Vai trò" | **Sai một nửa.** Có 4 đường xác định người dạy, và mã đã suy được vai chính/thay/trợ giảng. Thiếu thật là chuyện khác: không ghi được **nhiều người theo TỪNG buổi** | Trọng yếu |
| **Đ-2** | C3 — "Buổi học không có Giờ dạy thực tế" | **Sai về cột, đúng về dữ liệu.** Cột có sẵn từ trước, chỉ là gần như luôn rỗng | Trọng yếu |
| **Đ-3** | GĐ 1 — "Thêm Bậc/Mức/Rank vào hồ sơ" | **Phần lớn đã có**, kèm cả tầng che trường nhạy cảm | Trọng yếu |
| **Đ-4** | Q14 — "thay trường `SO_BUOI` bên AMIS Tiền lương?" | **Câu hỏi đã lỗi thời** — chốt 05/09/2026 bỏ MISA hẳn, kể cả Tiền lương | Trọng yếu |
| **Đ-5** | §1.3 — ba chặn C1/C2/C3 ngang hàng nhau | **C2 không ngang hàng — nó là chìa khoá.** Bảng 14 dòng ở §6.8 của chính bản gốc *không nhập được* vào hệ thống nếu thiếu C2 | Chặn thiết kế |

---

## Đ-1. C1 — "Buổi học không có trường Giáo viên và Vai trò"

### Bản gốc nói
> **C1** Buổi học không có trường `Giáo viên` và `Vai trò` → Không biết ai dạy buổi nào ở vai trò gì
> → không thể tra đơn giá.

### Đo được

`ClassSession` có sẵn **hai** cột người dạy cấp buổi, cộng **hai** đường cấp lớp:

| Nguồn | Vị trí | Ý nghĩa |
|---|---|---|
| `ClassSession.actualTeacherId` | `prisma/schema.prisma:2121` | Người dạy thực tế, ghi khi hoàn tất buổi |
| `ClassSession.substituteTeacherId` | `prisma/schema.prisma:2124` | Dạy thay, xếp trước buổi |
| `Class.teacherId` | model `Class` | Giáo viên chính của lớp |
| `Class.assistantId` | model `Class` | Trợ giảng của lớp |

Và **vai trò đã được suy ra và đang chạy** — `lib/cham-cong/cong-day-db.ts` chọn người dạy theo thứ
tự ưu tiên `actualTeacherId → substituteTeacherId → class.teacherId`, rồi phân vai `MAIN` /
`SUBSTITUTE` bằng cách so với `class.teacherId`; trợ giảng ra vai `ASSISTANT`. Enum
`TeachingRole { MAIN, SUBSTITUTE, ASSISTANT }` đã tồn tại trong `prisma/schema.prisma`.

### Thiếu thật là gì

Không phải "không biết ai dạy". Là **ba giới hạn hẹp hơn nhưng cụ thể hơn**:

1. **Mỗi buổi chỉ ghi được MỘT người đứng lớp.** Workshop có 3 giáo viên cùng đứng (tình huống biên
   số 9 của bản gốc) không ghi được.
2. **Trợ giảng chỉ có ở cấp LỚP, không có ở cấp BUỔI.** Hệ quả đã ghi rõ trong chú thích
   `lib/cham-cong/cong-day-db.ts`: mọi buổi của lớp đều tính cho người đang là trợ giảng *hiện tại*
   ⇒ **đổi trợ giảng giữa khoá là quy lại cả những buổi cũ**. Đây là lỗi tính tiền, không phải bất tiện.
3. **Không phân biệt được "tập sự".** Enum chỉ có 3 vai; bảng đơn giá PL03 §1 cần 4 vai (GV chính,
   GV tập sự, trợ giảng chính, trợ giảng tập sự).

### Ảnh hưởng tới bản gốc

Bảng `PhanCongDay` ở §7.3 **vẫn cần làm** — nhưng lý do đúng là *nhiều người × vai theo từng buổi*,
không phải *chưa biết ai dạy*. Khối lượng GĐ 0 nhỏ hơn bản gốc ước tính: không phải dựng từ số không
mà là mở rộng cái đang chạy, và phải có đường chuyển tiếp cho dữ liệu cũ.

---

## Đ-2. C3 — "Buổi học không có Giờ dạy thực tế"

### Bản gốc nói
> **C3** Buổi học không có `Giờ dạy thực tế` (bắt đầu/kết thúc) → Không kiểm được chuẩn "buổi tối
> thiểu 90 phút" (Phần II.2), không phát hiện vượt giờ.

### Đo được

Hai cột **đã có sẵn**: `ClassSession.actualStartAt` (`prisma/schema.prisma:2126`) và
`actualEndAt` (`:2127`), cả hai `DateTime? @db.Timestamptz(6)`.

Vấn đề là **dữ liệu, không phải lược đồ**. `lib/cham-cong/cong-day-db.ts` đã ghi thẳng trong chú thích:
hai cột này *"thực tế gần như luôn rỗng (chỉ ghi khi admin gõ tay)"*, nên mã hiện rơi về giờ của lớp
(`class.startTime` / `class.endTime`) cho phần lớn buổi.

### Ảnh hưởng tới bản gốc

Kết luận của bản gốc (**không kiểm được 90 phút, không phát hiện vượt giờ**) **vẫn đúng**. Chỉ khác
cách chữa: không phải *thêm cột* mà là **tạo đường ghi** — luồng "Hoàn tất buổi" phải ghi giờ thực,
và phải quyết xem giờ đó lấy tự động hay người dùng gõ. Rẻ hơn migration, nhưng đụng vào thói quen
vận hành hằng ngày nên khó hơn về mặt triển khai.

---

## Đ-3. GĐ 1 — "Thêm Bậc/Mức/Rank vào hồ sơ"

### Bản gốc nói
> **GĐ 1 — Hồ sơ & bảng giá:** Thêm Bậc/Mức/Rank vào hồ sơ. […] §7.1 đề xuất các cột mới
> `loai_hop_dong_day`, `bac_gv`, `muc_pt`, `rank`.

### Đo được

`Employee` **đã có** cụm trường phân hạng lương:

| Cột | Vị trí | Kiểu |
|---|---|---|
| `contractType` | `prisma/schema.prisma:2613` | `ContractType?` — enum có `FULLTIME`, `PARTTIME`, `INTERN`, `FREELANCE`, `THU_VIEC`, `CHINH_THUC_XAC_DINH`, `CHINH_THUC_KHONG_XAC_DINH` |
| `salaryRank` | `:2614` | `Int?` — validator giới hạn **1–9** (`lib/validators/employee.ts:87`) |
| `salaryLevel` | `:2615` | `Int?` — validator giới hạn **1–5** (`lib/validators/employee.ts:88`) |
| `bhxhBase` | `:2619` | `Int?` — mức lương đóng BHXH |

Và **đã có tầng che trường nhạy cảm**: cả bốn nằm trong nhóm `salary` của cơ chế field-level
visibility (`lib/auth/permissions.ts:927`, `lib/permissions/registry/hr.ts:20`), tức mặc định chỉ
`SUPER_ADMIN` / `HR` / `ACCOUNTANT` nhìn thấy. Đây là phần tốn công nhất của một trường lương, và
nó đã xong.

Chúng cũng **đang được dùng ở nơi khác**: `lib/elearning/assignment-rule.ts:159-160` lọc đối tượng
giao bài theo `salaryRank` / `salaryLevel`.

### Rủi ro nếu làm đúng như bản gốc

Thêm `bac_gv` / `muc_pt` / `rank` là dựng **bộ phân hạng thứ hai song song** với bộ đang có. Repo
này đã trả giá cho đúng kiểu lỗi đó: xem ghi chú về **7 bộ status ghi danh song song** (sự cố
21/08/2026) — chép tay một danh sách trạng thái thứ hai là đẻ bug, vì hai bộ sẽ lệch nhau và không
ai biết bộ nào đúng.

### Nhưng KHÔNG dùng lại được nguyên trạng

Dải giá trị không khớp: `salaryRank` là 1–9 còn Rank của SR.QD.230 là **1–4**; `salaryLevel` là 1–5
còn Mức Parttime là **1–2**; và không có chỗ nào cho **Bậc GV1–GV4**. Ngoài ra `assignment-rule.ts`
đang đọc chúng với một nghĩa khác, nên đổi nghĩa là làm sai luồng giao bài e-learning.

### Việc phải làm trước GĐ 1

**Đo xem `salaryRank` / `salaryLevel` hiện đang mang nghĩa gì trên dữ liệu thật** (bao nhiêu nhân sự
có giá trị, phân bố ra sao, ai đặt), rồi mới quyết một trong ba: dùng lại + nới dải, ánh xạ, hay
thêm cột mới có chủ đích. Đây là **quyết định của Nhân sự**, không phải quyết định kỹ thuật.

---

## Đ-4. Q14 — "thay trường `SO_BUOI` bên AMIS Tiền lương?"

### Bản gốc nói
> **Q14** Số buổi dạy sinh ra ở màn này có thay thế trường `SO_BUOI` đang gõ tay bên AMIS Tiền lương
> không? (Đây là mối nối M8 đã nêu ở BA Chấm công)

### Đo được

Câu hỏi **không còn đối tượng**. Chủ dự án đã chốt ngày **05/09/2026** (khảo sát MISA 04/09, chốt
K-01…K-09):

- **Bỏ MISA hẳn, "thay luôn" cả Tiền lương.** Không còn AMIS Tiền lương để bàn giao số sang.
- **Tháng 8/2026 không tính lương ở đâu cả.**
- Xuất dữ liệu = **bảng công Excel của chính hệ thống**; module Tiền lương là **đợt riêng**.
- Mẫu nhập MISA Tiền lương không cần nữa (K-03); nhật ký MISA bỏ (K-09).

Số đo kèm theo: MISA Chấm công có 900 lượt trong tháng 7 nhưng **0 lượt từ 01/08/2026**; bảng lương
tháng 7 chỉ phủ 6/32 người và không có tháng 8.

### Ảnh hưởng tới bản gốc

Nặng hơn một câu hỏi bị gạch. Bản gốc §2.2 xếp "lương cơ bản", "bảng lương" ra **ngoài phạm vi** với
ngầm định rằng có hệ khác lo. **Không có hệ khác.** Nên phần tiền của §5 không phải "tính rồi đẩy đi
đâu đó" mà là **cấu phần đầu tiên của module Tiền lương chưa tồn tại** — hệ thống hiện có **0 model**
tên chứa `Salary` / `Payroll` / `Wage`.

Kèm theo là một ràng buộc mà bản gốc chưa nêu: chủ dự án đặt luật **"hệ thống phải tự vận hành,
không qua dev chỉnh tay"**, nên mọi tham số (định mức, đơn giá, hệ số) phải nằm trong dữ liệu có màn
sửa, không được là hằng số trong mã.

---

## Đ-5. §1.3 — ba chặn C1/C2/C3 **không** ngang hàng

### Bản gốc nói
Trình bày C1, C2, C3 như ba điều kiện tiên quyết ngang nhau, và ở §1.2 mô tả bảng "HỆ SỐ ĐANG DÙNG"
6 dòng như một danh mục có thể mở rộng; §6.8 đề xuất mở lên **14 dòng**.

### Đo được

**Bảng 14 dòng của §6.8 không nhập được vào hệ thống** — không phải vì thiếu màn, mà vì lược đồ chặn
cứng. Migration `prisma/migrations/20260907020000_teaching_credit_type/migration.sql` (dòng cuối):

```sql
CREATE UNIQUE INDEX "TeachingCreditType_source_role_key"
  ON "TeachingCreditType"("source", "role");
```

`TeachingCreditSource` có **2** giá trị (`CLASS`, `TRIAL`); `TeachingRole` có **3**
(`MAIN`, `SUBSTITUTE`, `ASSISTANT`). Tích Descartes = **trần cứng 6 dòng**.

Hệ quả: yêu cầu của chủ dự án *"tự tạo tự add được qua hệ thống chứ không cần code"* mới chỉ thoả
được **một nửa** — sửa hệ số thì được, **thêm dòng thì không bao giờ**. Đúng những dòng SR.QD.230
PL03 §4 đòi lại là những dòng không có chỗ: `LOP_COACH`, `HOC_BU`, `HOC_VUOT`, `WORKSHOP`, `SU_KIEN`.

### Vì sao C2 là chìa khoá

Phân loại buổi không chỉ là một cột trên `ClassSession`. Nó là **chiều thứ ba của khoá danh mục**.
Thiếu nó thì không có gì để phân biệt hai dòng cùng `(nguồn, vai)`, nên trần 6 dòng là hệ quả toán
học chứ không phải lựa chọn thiết kế gỡ được bằng UI.

### Đã xử lý

Commit `0a67b8d7` (07/09/2026), migration `20260907040000_phan_loai_buoi`:

- `SessionCategory` — **bảng**, không phải enum, để BLĐ thêm phân loại mới không cần deploy. Seed 7
  dòng theo PL03 §4.
- `ClassSession.sessionCategoryId` **nullable** — buổi cũ không ai gán lại được, và ép `NOT NULL` là
  chặn mọi đường tạo buổi đang chạy.
- `TeachingCreditType.categoryId`; khoá đổi thành `(source, role, categoryId)`.
- Khớp **hai tầng** (`loaiCua` trong `lib/cham-cong/cong-day.ts`): đúng phân loại trước, rơi về dòng
  **bao sân** (`categoryId = null`) sau. Sáu dòng seed cũ đều là bao sân ⇒ **số công dạy hôm nay
  không đổi một con số nào**, và thêm dòng riêng cho Workshop chỉ đụng đúng buổi Workshop.
- Màn `/cham-cong/phan-loai-buoi` + ô chọn phân loại trên form sửa/tạo buổi.

Ba cổng chặn **ép ở tầng DB**, đã thử thật trên Postgres local (6/6 ca đúng):

| Index / ràng buộc | Chặn điều gì |
|---|---|
| `SessionCategory_one_default` | Hai dòng mặc định cùng lúc ⇒ buổi chưa phân loại đổi hệ số theo thứ tự đọc của Postgres |
| `TeachingCreditType_bao_san_key` | Hai dòng bao sân cùng `(nguồn, vai)`. **Bắt buộc là partial index** — `UNIQUE` ba cột KHÔNG chặn được, vì Postgres coi hai `NULL` là khác nhau |
| FK `Restrict` trên `categoryId` | Xoá phân loại đang có dòng công dạy trỏ tới |

### Còn lại của C1/C3

**C2 đã gỡ. C1 và C3 vẫn còn**, với nội dung đã đính chính ở Đ-1 và Đ-2 — tức nhỏ hơn và cụ thể hơn
bản gốc mô tả.

---

## 2. Ba điểm bản gốc hỏi mà mã nguồn trả lời được

Ghi lại để khỏi mất công đưa lên BLĐ.

### Q13 — hai con số buổi dạy lệch nhau

**Cả hai đều đúng, và lệch là đúng.** Kỳ công đếm buổi theo **cơ sở CỦA LỚP**
(`buildPeriodSummary` trong `lib/cham-cong/period.ts` lọc theo `class.centerId`); màn Công dạy đếm
theo **NGƯỜI** (`loadBuoiDay` hỏi theo `userId`). Ở ca giáo viên cơ sở A đi dạy lớp cơ sở B, hai số
khác nhau.

**Giữ cả hai.** Đổi cột bên Kỳ công là đổi số của những kỳ **đã chốt** — `summaryJson` được đọc lại
theo đúng hình cũ. Việc phải làm là **đặt tên khác nhau rõ ràng trên giao diện** kèm một dòng giải
thích tại chỗ, kẻo có người sửa cho khớp và sửa nhầm cái đang đúng.

### Q15 — lương dạy có bị nhân hệ số công không?

**Không.** Khảo sát MISA 04/09 đo được công thức đang dùng: *hệ số công = công đi làm thực tế ÷ công
chuẩn*, và hệ số đó **chỉ nhân vào lương cơ bản + KPI**. Lương giảng dạy tính độc lập theo
*số buổi × đơn giá*. Đúng như bản gốc phỏng đoán.

### Q12 — mức thù lao "Sự kiện" theo phê duyệt riêng

**Đã khai được từ 07/09.** Mỗi mức phê duyệt là một dòng `SessionCategory` + một dòng
`TeachingCreditType` gắn với nó. Không cần ô nhập tay đè lên hệ số.

---

## 3. Quyết định của chủ dự án ngày 07/09/2026

Ghi lại để bản gốc §13 không bị đọc như còn treo.

| Câu | Quyết định |
|---|---|
| **Q1** — "sĩ số thực tế" ở PL04 | **BIÊN CHẾ**, không phải điểm danh. Và phải là **SNAPSHOT ghi cứng vào bản ghi buổi tại thời điểm buổi diễn ra** — không join động, không tính lại từ danh sách lớp hiện tại. Lý do: học viên vào lớp tháng 10 mà làm đổi số buổi tháng 8 là đổi cả kỳ lương đã chốt. Điểm danh giữ nguyên vai trò dữ liệu vận hành, **không dính vào tính tiền** |
| **Q2 / Q3** — một hay hai mô hình | **Giữ mỗi người MỘT mô hình. Không sửa văn bản.** Không chuyển sang tính theo buổi cho tất cả: SR.QD.230 mới hiệu lực 17/07, điều chỉnh chính sách phải thông báo trước tối thiểu 15 ngày làm việc, và đổi cơ sở tính của GV Fulltime là đổi thu nhập thực nhận của nhóm đang có hợp đồng — việc của Nhân sự, không phải việc dọn lược đồ |

**Nhưng tách làm hai tầng, và hết mâu thuẫn:**

- **TẦNG GHI NHẬN — theo buổi cho TẤT CẢ.** Mọi giáo viên, mọi `contractType`, đều sinh bản ghi công
  dạy cho từng buổi. Một luồng dữ liệu duy nhất, **không rẽ nhánh** ở tầng này.
- **TẦNG QUY ĐỔI RA TIỀN — rẽ theo `contractType`:**
  - Fulltime (GV1–GV4) / Parttime (Mức 1, Mức 2): buổi dùng để **đối chiếu định mức và kiểm soát**;
    **tiền vẫn theo lớp/tháng**.
  - Thời vụ & trợ giảng (Rank 1–4): tiền = *buổi × hệ số phân loại × đơn giá theo Rank*.

> **Ràng buộc kiến trúc:** không được rẽ nhánh `contractType` ở tầng ghi nhận. Thấy mình đang viết
> `if (contractType…)` trong mã sinh bản ghi buổi thì **dừng lại — thiết kế sai**.

---

## 4. Điều phụ lục này KHÔNG đụng tới

- Toàn bộ bảng nghiệp vụ của bản gốc (§3 Bậc/Mức/Rank, đơn giá, hệ số, định mức) — chép từ
  SR.QD.230, **vẫn là chuẩn**.
- Các RULE-CD-01 … RULE-CD-28 — **vẫn là chuẩn**, trừ chỗ nào phụ thuộc vào 5 điểm đính chính trên.
- Đề xuất trạng thái buổi `DA_DAY` (§4.3) và tab **Cần xử lý** (§6.6) — **giữ nguyên**, và là phần
  giá trị nhất của bản gốc: chúng chặn đúng lỗi "62% ngày công bị suy diễn" của MISA.
- Phụ lục đối chiếu SR.QD.230 → hệ thống ở cuối bản gốc — **vẫn dùng được**.
