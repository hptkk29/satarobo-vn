# Ranh giới `assignmentType` — `EmployeeOrgAssignment`

| | |
|---|---|
| **Chốt** | 08/09/2026, chủ dự án duyệt |
| **Áp cho** | mọi dòng `EmployeeOrgAssignment` từ nay |
| **Vì sao có file này** | Năm giá trị enum không tự giải thích. Người gán tiếp theo phải đọc **cùng một định nghĩa**, không đoán lại — hai người đoán khác nhau là hai nửa bảng dữ liệu nói hai chuyện khác nhau, và không ai phát hiện được vì không có gì báo lỗi. |

---

## 0. Trước hết: bảng này KHÔNG sinh quyền

`EmployeeOrgAssignment` là **dữ liệu nhân sự** — ai làm ở đâu, để chia chi phí và để trả
lời "cơ sở này có những ai". Quyền **chỉ** đến từ `UserOrgRole` (Doc 15 §2, luật cứng).

Gán thêm một dòng ở đây **không** cho ai thêm quyền xem gì. Ngược lại, gỡ một dòng ở đây
**không** thu hồi quyền của ai. Hai bảng, hai việc — đừng dùng cái này để vá cái kia.

⚠️ Hệ quả thực dụng: khi ai đó báo *"tôi không xem được cơ sở X"*, kiểm `UserOrgRole`,
**không** kiểm bảng này.

---

## 1. Bốn ranh giới

`PRIMARY` là chỗ đứng thứ năm và không nằm trong bốn ranh giới dưới đây, vì nó không cần
phân biệt với gì cả: **nơi biên chế chính**, và `assignment-service.ts:66-71` đã chặn cứng
*mỗi nhân viên tối đa MỘT `PRIMARY` đang hiệu lực*.

Bốn giá trị còn lại đều có nghĩa "người này còn làm ở một nơi thứ hai", và khác nhau ở
**hai câu hỏi**: *nơi thứ hai đó có lịch cố định không* và *nó ngang hay dưới nơi chính*.

| Giá trị | Định nghĩa | Câu hỏi phân biệt |
|---|---|---|
| **`SECONDARY`** | Nơi làm việc thứ hai **thường xuyên** — có lịch cố định, dù chỉ một buổi mỗi tuần. | Có lịch cố định? → **có** · Ngang nơi chính? → **không** |
| **`SUPPORT`** | Biên chế ở nơi khác, **sang giúp việc chuyên môn**. Người của Hội sở xuống dạy vài lớp ở cơ sở là ca điển hình. | Người này *thuộc về* nơi đó? → **không**, họ sang giúp |
| **`SUBSTITUTE`** | **Thay lẻ có phát sinh.** Chỉ dùng cho việc thay đột xuất, **không** dùng cho lịch cố định dù ít buổi. | Có lịch cố định? → **không**, phát sinh mới có |
| **`SHARED`** | Hai (hoặc nhiều) nơi **ngang nhau**, không nơi nào là chính. Dùng khi `PRIMARY` + `SECONDARY` sẽ nói SAI rằng có một nơi chính. | Ngang nơi kia? → **có** |

### Ranh giới dễ nhầm nhất: `SECONDARY` vs `SUBSTITUTE`

Phân biệt bằng **tính cố định của lịch, KHÔNG bằng số buổi**.

Một buổi cố định mỗi tuần là `SECONDARY`, không phải `SUBSTITUTE`. Lý do không phải thẩm
mỹ: trong hệ này `SUBSTITUTE` gắn với **dạy thay** (`substituteTeacherId`), nên dùng nó
cho một phân công thường xuyên sẽ khiến buổi đó **bị đọc là bất thường**, và nhiều khả
năng **bị lọc khỏi báo cáo "ai làm ở cơ sở này"** — người ấy biến mất khỏi chính cơ sở họ
đến hằng tuần.

> **Câu hỏi để tự kiểm:** *"Nếu tuần sau không ai nhờ, người này có đến đó không?"*
> Có → `SECONDARY`. Không → `SUBSTITUTE`.

### `SHARED` không phải "lười chọn"

`SHARED` nói một điều mạnh: **không có nơi chính**. Nó cũng có nghĩa hồ sơ ấy **không có
dòng `PRIMARY` nào** — nên đừng dùng `SHARED` khi thật ra có nơi chính mà chỉ vì ngại
quyết. Chọn sai chiều này thì báo cáo chi phí theo cơ sở không quy được về đâu.

---

## 2. `allocationPercent` — bỏ trống là hợp lệ

`Int?`, **không bắt buộc**. Chỉ khai khi thật sự muốn chia chi phí/lương theo tỉ lệ.

Chốt 08/09/2026: **bỏ trống toàn bộ** cho lượt gán đầu tiên — chưa chia chi phí theo tỉ lệ,
và điền một con số mình không có căn cứ là bịa độ chính xác.

⚠️ `createAssignment` **cảnh báo** khi tổng `allocationPercent` đang hiệu lực vượt 100
nhưng **không chặn** (Doc 15 OI-10). Cảnh báo trả về ở `warning`, không ném — người gọi
phải tự hiện nó, nếu không thì nó rơi vào hư không.

---

## 3. Bản đồ đã duyệt — lượt gán đầu tiên (08/09/2026)

| Mã NV | Phân công | Vì sao |
|---|---|---|
| **SR.NV.003** | `SHARED` CS1 + `SHARED` CS2 | Phụ trách hai cơ sở **ngang nhau**. `PRIMARY`+`SECONDARY` sẽ nói sai rằng có một nơi chính |
| **SR.NV.004** | `PRIMARY` HO + `SUPPORT` CS1 | Biên chế Hội sở, sang CS1 làm việc chuyên môn |
| **SR.NV.005** | `PRIMARY` HO + `SUPPORT` CS2 | như trên |
| **SR.NV.007** | `PRIMARY` CS1 + `SECONDARY` CS2 | Một buổi **cố định** mỗi tuần ở CS2 ⇒ `SECONDARY`. **Không phải `SUBSTITUTE`** — xem ranh giới ở §1 |
| **SR.NV.009** | `PRIMARY` CS2 + `SECONDARY` CS1 | Có lớp đều đặn ở CS1 |
| **SR.NV.010** | `PRIMARY` CS2 + `SECONDARY` CS1 | như trên |

`allocationPercent`: **bỏ trống hết**.

Sáu người, mười hai dòng. Những người còn lại chưa có dòng nào — đó là trạng thái đúng,
không phải thiếu sót: chỉ gán khi thực sự làm ở hơn một nơi, hoặc khi là người Hội sở
(xem §4).

---

## 4. Vì sao người Hội sở BẮT BUỘC phải có dòng ở bảng này

Đây không phải tuỳ chọn, mà là hệ quả của một lỗ rò quyền đã phải gỡ ở US-05.

`Employee.centerId` của người Hội sở **cố ý để NULL** — họ không thuộc cơ sở nào. Cách
nghe-thì-hợp-lý là gán `Employee.orgUnitId` = node HO; **không được làm thế**:
`keoTaiKhoanTheoHoSo` kéo `User.orgUnitId` theo hồ sơ, rồi `reconcileUserOrgRoles` neo vai
tại đúng đơn vị đó. Neo vai tại HO ⇒ `isHoLevel` ⇒ **thấy mọi cơ sở**.

Nên "người này là người Hội sở" phải suy từ **`EmployeeOrgAssignment` @ HO**, không từ cột
trên `Employee`. Chi tiết ở `lib/hr/employee-unit.ts`.

---

## 5. Hạn chế đã biết: `Employee.centerId` chỉ chứa MỘT cơ sở

`Employee.centerId` là `String?` — một giá trị. Người làm ở hai cơ sở chỉ điền được một.

Đó là lý do bảng này tồn tại, và cũng là **cái bẫy khi đọc số**: câu hỏi *"cơ sở này có
bao nhiêu nhân sự"* trả lời khác nhau tuỳ nguồn.

| Nguồn | Trả lời | Đúng cho câu hỏi nào |
|---|---|---|
| `Employee.centerId` | **một** cơ sở mỗi người | "người này thuộc biên chế đâu" · cách ly `scopedDb` |
| `EmployeeOrgAssignment` | **nhiều** nơi mỗi người | "cơ sở này có những ai làm việc" |

⚠️ `Employee` ∈ `SCOPED_MODELS` và **không** ∈ `NULL_IS_GLOBAL_MODELS`, nên `centerId =
NULL` khiến người đó **vô hình với mọi actor cấp cơ sở**. Với người Hội sở đó là hành vi
đúng (họ không thuộc cơ sở nào); với người khác thì đó là hồ sơ chưa gán, và quản lý cơ sở
sẽ **không thấy chính nhân sự của mình**.

Đừng "sửa" bằng cách nới `centerId` thành mảng hay bỏ nó khỏi `SCOPED_MODELS` — cách ly cơ
sở dựa vào chính cột đó.

---

## 6. Khi cần gán thêm ai

1. Đọc §1, chọn ranh giới. Không chắc thì dùng **câu hỏi tự kiểm** ở phần
   `SECONDARY` vs `SUBSTITUTE`.
2. Đi qua `createAssignment` (`lib/org/assignment-service.ts`) — nó ghi `AuditLog`, chặn
   `PRIMARY` thứ hai, và kiểm `allocationPercent ∈ [0,100]`.
3. **Đừng** `db.employeeOrgAssignment.create` trần: mất audit và mất cả hai cổng trên.
4. Bổ sung người đó vào bảng §3 nếu là lượt gán có chủ đích, để lần đọc sau biết vì sao.
