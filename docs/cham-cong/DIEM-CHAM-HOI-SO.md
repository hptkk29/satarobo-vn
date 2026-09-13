# Điểm chấm công: vì sao Hội sở KHÔNG có, và khi nào thì thêm

| | |
|---|---|
| **Chốt** | 08/09/2026 · quyết định Q-04 |
| **Trạng thái** | Hội sở **cố ý không có** `WorkLocation` |
| **Số đo prod 08/09/2026** | 2 điểm chấm (CS1, CS2 — đều bật, đều có geofence) · **6 nhân sự trực thuộc HO** · 0 lượt quét |

---

## 1. Quyết định

**Không tạo `WorkLocation` cho Hội sở.** Người Hội sở quét **mã QR của cơ sở họ đang có
mặt** — CS1 hay CS2, cái nào cũng được, và lượt quét đó hợp lệ.

Đây không phải thiếu sót đang chờ làm nốt. Nó được cắm ở hai chỗ trong mã:

| Chỗ | Làm gì |
|---|---|
| `app/(admin)/admin/cham-cong/diem-cham/page.tsx:41` | `.filter((b) => b.id !== HO_CENTER_ID)` — khối Hội sở **không hiện** trên màn cấu hình điểm chấm, nên không ai tạo nhầm |
| `lib/cham-cong/place.ts` | Người HO với ca `HOME` → `placeMode = ANY_CENTER`. Hệ quả: **không bao giờ sinh cờ `SAI_NOI_LAM`** dù quét ở đâu |

Hai chỗ này phải đi cùng nhau. Gỡ cái thứ hai mà giữ cái thứ nhất là mọi lượt quét của
người Hội sở bị gắn cờ sai chỗ; gỡ cái thứ nhất mà giữ cái thứ hai là tạo được một điểm
chấm HO mà không ai bị buộc phải dùng nó.

---

## 2. Vì sao

**Hội sở không có địa điểm riêng.** Người Hội sở ngồi tại CS1 hoặc CS2. Một điểm chấm là
*một cái quầy có tờ QR dán ở đó* — không có quầy thì điểm chấm là một bản ghi trỏ vào hư
không.

Ba hệ quả nếu cứ tạo:

1. **Tờ QR không biết dán ở đâu.** Dán tại CS1 thì nó là điểm chấm của CS1 mang tên HO —
   hai tờ cạnh nhau, người quét chọn bừa, và số liệu "ai làm ở cơ sở nào" hỏng.
2. **`Center("hoi-so")` là bản ghi MỒ CÔI.** Không `OrgUnit` nào trỏ tới nó (V7 cấm đơn vị
   HO mang `centerId` — xem CLAUDE.md). `WorkLocation.centerId` là FK bắt buộc tới
   `Center`, nên dòng ấy tạo được về mặt kỹ thuật, nhưng nó neo vào một bản ghi không
   thuộc cây tổ chức.
3. **Geofence vô nghĩa.** `latitude`/`longitude` của HO sẽ phải là toạ độ của… CS1 hoặc
   CS2. Một hàng rào ảo trùng khít hàng rào đã có.

---

## 3. Điều kiện để thêm — và phải làm gì kèm theo

> **Thêm điểm chấm cho Hội sở khi và chỉ khi Hội sở dời ra một địa điểm riêng** — một địa
> chỉ vật lý không phải CS1 và không phải CS2, có chỗ dán tờ QR.

Đó là điều kiện **duy nhất**. Không thêm vì "cho đủ bộ", không thêm vì màn hình trông
thiếu một dòng.

Khi điều kiện đó tới, bốn việc phải làm **cùng lúc** — làm lẻ từng việc là để hệ thống ở
trạng thái nửa vời:

1. **Gỡ bộ lọc** ở `diem-cham/page.tsx:41` để khối Hội sở hiện trên màn cấu hình.
2. **Xem lại `place.ts`**: người HO có ca `HOME` còn nên là `ANY_CENTER` nữa không, hay
   phải neo về điểm chấm HO. Nếu neo lại thì cờ `SAI_NOI_LAM` bắt đầu có nghĩa với họ —
   và người đang ngồi ở CS1 sẽ bị gắn cờ. Quyết định này là **nghiệp vụ**, không phải kỹ
   thuật.
3. **Quyết `Center("hoi-so")` mồ côi** đi đâu. ⚠️ **ĐỪNG nới V7 để cho đơn vị HO mang
   `centerId`** — đã thử ở US-05 và phải gỡ: màn nhân sự suy đơn vị neo RBAC v2 từ Center
   của nhân sự, nên nới ra là người Hội sở được neo vai **tại HO** ⇒ `isHoLevel` ⇒ **thấy
   mọi cơ sở**.
4. **Đo lại `StaffTimeLog.centerId`**: cột đó là **NƠI QUÉT**, không phải nơi trực thuộc.
   Thêm một điểm chấm là thêm một giá trị mới vào cột đó, và mọi báo cáo nhóm theo nó sẽ
   mọc thêm một hàng.

---

## 4. Hạn chế đi kèm: `Employee.centerId` chỉ chứa MỘT cơ sở

Đây là lý do câu hỏi *"cơ sở này có bao nhiêu người"* trả lời khác nhau tuỳ nguồn — và
nó là chỗ đọc sai số thường xuyên nhất quanh module này.

| Nguồn | Trả lời | Đúng cho câu hỏi nào |
|---|---|---|
| `Employee.centerId` | **một** cơ sở mỗi người | "người này thuộc biên chế đâu" · cách ly `scopedDb` |
| `EmployeeOrgAssignment` | **nhiều** nơi mỗi người | "cơ sở này có những ai làm việc" |
| `StaffTimeLog.centerId` | nơi **quét**, theo từng lượt | "hôm đó người này có mặt ở đâu" |
| `ShiftAssignment.centerId` | cơ sở **chịu công** của ngày | "ngày đó công tính cho cơ sở nào" |

Bốn cột, bốn câu hỏi khác nhau. Cộng nhầm hai cột là ra một con số không trả lời câu nào.

⚠️ `Employee` ∈ `SCOPED_MODELS` và **không** ∈ `NULL_IS_GLOBAL_MODELS`, nên `centerId =
NULL` khiến người đó **vô hình với mọi actor cấp cơ sở**. Với 6 người Hội sở đó là hành vi
ĐÚNG — họ không thuộc cơ sở nào; với người khác thì đó là hồ sơ chưa gán, và quản lý cơ sở
sẽ không thấy chính nhân sự của mình.

**Đừng "sửa" bằng cách nới `centerId` thành mảng** hay bỏ nó khỏi `SCOPED_MODELS` — cách
ly cơ sở dựa vào chính cột đó. Người làm ở hai nơi thì khai ở `EmployeeOrgAssignment`;
ranh giới các loại phân công ở
[`docs/nen-he-thong/RANH-GIOI-PHAN-CONG-NHAN-SU.md`](../nen-he-thong/RANH-GIOI-PHAN-CONG-NHAN-SU.md).

---

## 5. Câu trả lời nhanh cho ba câu hay bị hỏi

**"Người Hội sở chấm công kiểu gì?"** — Quét tờ QR ở quầy của cơ sở họ đang ngồi. Lượt
quét hợp lệ, không bị gắn cờ sai chỗ.

**"Sao màn Điểm chấm không có khối Hội sở?"** — Cố ý, `diem-cham/page.tsx:41`. Xem §1.

**"Cơ sở nào chịu công của người Hội sở?"** — `hoi-so`. `place.ts` đặt `centerId` của ngày
là cơ sở đầu tiên có mặt trong ca, không có thì cơ sở nhà, HO thì `"hoi-so"`. Nơi **quét**
(`StaffTimeLog.centerId`) vẫn là CS1/CS2 — hai cột khác nhau, xem §4.
