# KẾ HOẠCH BACKFILL SĨ SỐ BIÊN CHẾ CHO BUỔI CŨ

| | |
|---|---|
| **Ngày** | 07/09/2026 |
| **Cột đích** | `ClassSession.rosterSize` · `rosterSource` · `rosterAt` (migration `20260907050000`) |
| **Script** | `scripts/backfill-si-so-buoi.ts` — **mặc định chỉ ĐO, không ghi** |
| **Trạng thái** | ⏸ **CHỜ DUYỆT.** Chưa chạy chế độ ghi ở bất kỳ đâu |

> Chủ dự án yêu cầu: *"Báo cáo cho tôi cách bạn định suy giá trị backfill TRƯỚC khi chạy."*
> Đây là bản báo cáo đó.

---

## 1. Kết luận trước, lý lẽ sau

**Không có một công thức nào đúng cho mọi dòng.** Cả ba cách suy nghĩ được đều sai **một chiều** —
tức sai có hệ thống, không phải nhiễu ngẫu nhiên quanh giá trị đúng. Sai một chiều nguy hiểm hơn
nhiễu: nó không tự triệt tiêu khi cộng lại, nên tổng của cả kỳ lệch đúng bằng tổng sai số.

Nên kế hoạch là **chia tầng theo mức tin cậy và ghi rõ tầng nào vào cột `rosterSource`**, chứ không
phải chọn một công thức rồi áp cho tất cả.

**Trước khi ghi bất cứ dòng nào, chạy chế độ ĐO** để biết mỗi tầng phủ bao nhiêu phần trăm và hai
tầng lệch nhau bao nhiêu. Nếu tầng suy đoán phủ quá lớn, câu trả lời đúng có thể là *không backfill*
và để lương chỉ tính từ buổi có `SNAPSHOT` thật trở đi.

---

## 2. Ba cách suy và sai số đo được của từng cách

### (a) Đếm ghi danh theo cửa sổ thời gian — **LUÔN THỪA NGƯỜI**, càng cũ càng thừa

> `COUNT(Enrollment WHERE classId = ? AND createdAt <= ngày buổi AND (deletedAt IS NULL OR deletedAt > ngày buổi))`

Nghe hợp lý, nhưng **`Enrollment.deletedAt` gần như không bao giờ được set khi học viên rời lớp**.
Repo có luật cứng cấm dùng nó cho việc đó (`lib/students/remove-from-classes.ts:8` và migration
`20260807140000:12`) — vì `deletedAt` là **sổ sách**, xoá mềm một ghi danh là tụt công nợ. Chỉ hai
nút "xoá đăng ký" ở `/admin/enrollments` dùng nó, và chúng còn bị chặn khi đã có thanh toán.

Hệ quả: vế `deletedAt > ngày buổi` gần như **luôn đúng** cho mọi ghi danh. Công thức này thực chất
đếm *"tất cả những ai TỪNG được ghi danh vào lớp tính đến ngày đó"* — một dãy đơn điệu không giảm.
Mọi em nghỉ giữa chừng, chuyển lớp, bị gỡ khỏi lớp **vẫn được đếm ở mọi buổi sau đó**.

Thêm một lớp thừa nữa: `PENDING` và `CONFIRMED` đã trỏ sẵn `classId` từ lúc tạo, nhưng roster thật
loại `PENDING` (`lib/enrollment-status.ts`). Đếm theo `createdAt` không phân biệt được ⇒ cộng thêm
những em **chưa từng bước vào lớp**. Hai lỗi **cùng chiều**, cộng dồn chứ không triệt tiêu.

### (b) Đếm dòng điểm danh của buổi — **THIẾU NGƯỜI với buổi trước 07/08/2026**

Từ **07/08/2026**, cả hai màn điểm danh đều CHẶN lưu khi chưa đánh dấu đủ cả lớp
(`attendance-grid.tsx:195-201`, `attendance-panel.tsx:191-200`) ⇒ mỗi buổi điểm danh sau mốc đó có
đúng một dòng cho mỗi học viên đang thuộc lớp lúc ấy. **Đây là nguồn sát nhất.**

Trước mốc đó, lưới cũ chỉ gửi những em **đã sửa**
(`records = dirty.length > 0 ? dirty : Object.entries(state)`, commit `563bb1f0`): giáo viên chỉ
đánh vài em vắng rồi Lưu ⇒ buổi chỉ có vài dòng. Số ra nhỏ hơn sĩ số thật một cách hệ thống, và
**nhỏ nhất đúng ở những buổi ĐÔNG người vắng** — tức sai số tương quan với chính đại lượng đang đo.

Hai nhiễu nữa, cả hai đều xử lý được:
- **Khách học bù** nằm trong roster của buổi nên có dòng điểm danh riêng, dù không thuộc biên chế
  lớp ⇒ phải loại bằng cách chỉ đếm em **có ghi danh trong chính lớp này**.
- **Buổi chưa điểm danh** vẫn có thể có đúng 1 dòng lẻ do duyệt đơn báo vắng của phụ huynh
  (`parent-requests/actions.ts:129`) ⇒ ra "sĩ số = 1". Đây là dòng sai **nguy hiểm nhất** vì nhìn
  vẫn hợp lệ. Không loại được bằng "≥2 dòng" — lớp Coach 1-1 có sĩ số thật là 1.

### (c) Ảnh chụp hôm nay — **SAI CẢ HAI CHIỀU, và sai đều mọi buổi của cùng một lớp**

Lớp đã kết thúc, học viên đã `WITHDREW`/`COMPLETED` ⇒ mọi buổi quá khứ ra 0. Lớp mới tuyển thêm ⇒
mọi buổi cũ nhận sĩ số hôm nay. Sai số bằng đúng toàn bộ biến động của lớp.

**Đây là cách nguy hiểm nhất** — không phải vì sai nhiều nhất, mà vì mọi buổi trong một lớp nhận
**cùng một con số**, nên bảng nhìn rất "sạch" và dễ được nghiệm thu nhầm là đúng. **Loại.**

### Nhiễu chung cả (a) và (b): `classId` sửa được tại chỗ

`lib/lms/assign.ts:147` và `enrollments/_actions.ts:372` đều `update` thẳng `classId` trên dòng cũ.
Lớp A **mất** những em sau này bị chuyển sang lớp B; lớp B **được cộng ngược** những em thực tế
chưa từng ngồi ở đó. Đường `assign` còn để lại `extraData.sourceClassId` để lần ra, nhưng **đường
form sửa đăng ký không ghi audit nào** ⇒ có một phần dữ liệu **không thể phục dựng bằng bất kỳ
truy vấn nào**. `EnrollmentAuditLog` chỉ ghi from/to **STATUS**, không có `classId`.

---

## 3. Cách suy đề xuất — chia ba tầng

Xét từng buổi đã `COMPLETED` mà `rosterSize IS NULL`, theo thứ tự:

### Tầng 1 → `FROM_ATTENDANCE`
**Điều kiện:** `date >= 2026-08-07` **và** buổi có ≥1 dòng `Attendance`.
**Giá trị:** số học viên có dòng điểm danh ở buổi **và** có ghi danh trong **chính lớp này**
(loại khách học bù).
**Loại trừ:** nếu buổi có **đúng 1** dòng điểm danh trong khi lớp có **nhiều hơn 1** ghi danh
⇒ đây là ca "dòng lẻ do đơn báo vắng", **rơi xuống tầng 3** thay vì lấy số 1.

### Tầng 2 → `FROM_ENROLLMENT`
**Điều kiện:** không đủ điều kiện tầng 1.
**Giá trị:** `COUNT(Enrollment)` của lớp có `createdAt <= ngày buổi`, `deletedAt IS NULL`, và
`status` **thuộc** bộ biên chế (`ACTIVE`, `CONFIRMED`, `STUDYING`, `PAUSED` — loại `PENDING`).
**Đã biết:** lệch **thừa**. Chấp nhận có ý thức và ghi rõ nguồn.

### Tầng 3 → `UNKNOWN`
Mọi trường hợp còn lại: lớp không có ghi danh nào tính đến ngày buổi, hoặc rơi vào bẫy dòng lẻ.
**Cố ý ghi ra `UNKNOWN`** thay vì để `NULL` — `NULL` lẫn với "chưa chạy backfill", còn `UNKNOWN`
nghĩa là "đã xét và chịu".

### Ba điều script **không** làm
1. **Không đụng buổi đã có `rosterSize`.** Số `SNAPSHOT` đo lúc dạy không bao giờ bị suy đoán đè.
2. **Không đụng buổi chưa `COMPLETED`.** Buổi chưa dạy chưa có gì để chốt.
3. **Không backfill `rosterAt` bằng ngày buổi.** `rosterAt` là *thời điểm chốt số*, và với backfill
   nó chính là lúc chạy script — đó là thông tin cần giữ, không phải chi tiết cần giấu.

---

## 4. Chạy ĐO trước — và đây là số cần xem

```bash
pnpm tsx scripts/backfill-si-so-buoi.ts          # ĐO, không ghi (mặc định)
pnpm tsx scripts/backfill-si-so-buoi.ts --ghi    # ghi thật (chỉ sau khi duyệt)
```

Bản đo in ra:

| Số | Ý nghĩa · ngưỡng đáng lo |
|---|---|
| Tổng buổi `COMPLETED` chưa có sĩ số | mẫu số |
| Phủ theo tầng (1/2/3), số dòng + % | **tầng 2 > 40%** ⇒ nên cân nhắc không backfill |
| Buổi trước / sau 07/08/2026 | phần trước mốc là phần không cứu được |
| **Chênh lệch giữa tầng 1 và tầng 2** ở những buổi tính được **cả hai** | đây là số quan trọng nhất — nó **đo trực tiếp** độ thừa của tầng 2 trên dữ liệu thật, thay vì để ta suy luận |
| Buổi 0 ghi danh / bẫy dòng lẻ | phần rơi xuống `UNKNOWN` |
| Phân bố sĩ số ra được theo bậc 1-4 / 5-8 / 9-12 / ≥13 | vì đây là bậc quyết định đơn giá PL04 — lệch một bậc là lệch tiền |

**Trên PROD:** bấm tay workflow **`Chấm công — ĐO trên prod (chỉ đọc)`** (`cham-cong-do-prod.yml`),
chọn `viec = si-so`. Workflow đó **không có chế độ ghi** — không input `--ghi`, không chuỗi xác
nhận, vì nó không ghi gì cả. Chạy backfill thật sẽ là một workflow RIÊNG, có chuỗi xác nhận, và
chỉ dựng sau khi §5 dưới đây có trả lời.

---

## 5. Bốn câu cần chủ dự án trả lời trước khi chạy `--ghi`

| # | Câu hỏi | Đề xuất của tôi |
|---|---|---|
| **B1** | Học viên **BẢO LƯU (`PAUSED`)** có tính vào sĩ số biên chế không? Mã đang mâu thuẫn: roster/điểm danh coi PAUSED là **vẫn thuộc lớp**, còn kiểm sức chứa thì **loại** PAUSED. | **CÓ tính.** "Biên chế" là danh sách lớp, và `lib/enrollment-status.ts` tự khai là nguồn chân lý duy nhất cho việc này. Đã dùng định nghĩa đó cho snapshot mới. |
| **B2** | Buổi **trước 07/08/2026**: ghi số suy đoán (thừa người), hay để `UNKNOWN`? | **Ghi, kèm nguồn `FROM_ENROLLMENT`** — nhưng chỉ sau khi xem số ở §4. Nếu chênh lệch tầng 1 ↔ tầng 2 lớn thì để `UNKNOWN` trung thực hơn. |
| **B3** | Nhóm ghi danh **đã bị đổi `classId`** không có đường phục dựng. Chấp nhận sai ở nhóm này, hay đo trước xem có bao nhiêu dòng khả nghi? | **Đo trước.** Đếm được bằng: ghi danh có `extraData.sourceClassId`, và ghi danh có dòng `Attendance` ở buổi của lớp KHÁC `classId` hiện tại. |
| **B4** | ~~Khi lương tính về sau gặp dòng không phải `SNAPSHOT` thì làm gì?~~ | ✅ **ĐÃ CHỐT 07/09.** Tầng tiền **TỪ CHỐI**, không phải "bỏ qua": chỉ dòng `rosterSource = SNAPSHOT` mới vào được công thức lương, dòng khác **ném lỗi** nêu rõ buổi nào. Ép bằng mã, không bằng quy ước — `lib/payroll/roster-guard.ts` (14 test). Buổi cũ đã trả lương xong rồi, không ai tính lại; backfill chỉ phục vụ **báo cáo và đối chiếu**. |

---

## 6. Vì sao đáng làm cẩn thận thế

Cột này về sau **ra tiền**: SR.QD.230 PL04 §A.1 phân bậc đơn giá lớp/tháng theo sĩ số
**1-4 / 5-8 / 9-12 / ≥13**. Lệch một người ở ranh giới bậc (4→5, 8→9, 12→13) là **lệch một bậc
đơn giá**, tức lệch 100.000–200.000đ/lớp/tháng — và lệch theo hướng **thừa người** thì lệch về phía
trả nhiều hơn, đều đặn, cho tới khi có người đối chiếu tay.

Đây đúng loại lỗi mà khảo sát MISA đã đo được ở hệ cũ: 27,2% dữ liệu công tháng 7 là sửa tay, 62%
ngày công không có bằng chứng. Một nguồn dữ liệu đơn lẻ, không ghi nguồn gốc, luôn bị bào mòn.
Cột `rosterSource` tồn tại để lần này không lặp lại.
