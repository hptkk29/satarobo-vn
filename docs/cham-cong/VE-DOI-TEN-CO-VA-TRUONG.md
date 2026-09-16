# VÉ — đổi tên hai thứ đang NÓI SAI: `ShiftTemplate.isLeave` và cờ `SAI_NOI_LAM`

> **Trạng thái:** MỞ, chưa làm. Ghi 10/09/2026 sau khi vá hai bug prod (PR #242).
> **Gộp hai việc đổi tên vào một vé** theo chốt của chủ dự án — cùng một họ lỗi: *cái tên
> hứa một nghĩa, mã mang nghĩa khác, và người đọc mã tin cái tên.*
> **Không phải việc gấp.** Cả hai đều KHÔNG đang gây sai số trên prod hôm nay (xem phần đo).

---

## Việc 1 — `ShiftTemplate.isLeave` / `ShiftAssignment.isLeave`

### Cái bẫy

| mã | tên | `kind` | `isLeave` |
|---|---|---|---|
| `X` | Nghỉ | `OFF` | **false** |
| `P` | Nghỉ phép | `LEAVE` | true |

Tên trường đọc như **"ngày nghỉ"**; nghĩa thật là **"nghỉ phép có đơn"**. Ai lọc theo
`isLeave` để tìm ngày nghỉ sẽ **sót `X`** — và đó chính là điều đã xảy ra ở bug prod
10/09: `if (r.isLeave) continue` để `X` lọt qua thành "Ca làm · theo nơi làm", đồng thời
làm ngày `P` **biến mất hẳn** khỏi bảng công site GV.

### Tên đề xuất

| Ứng viên | Ưu | Nhược |
|---|---|---|
| `isPaidLeave` | khớp quy ước bool tiếng Anh sẵn có trong schema (`isActive`, `isClassWide`) | "paid" thêm một khẳng định về LƯƠNG mà trường này không nói (`payMode` mới nói) |
| **`coDonNghi`** | nói đúng cái phân biệt `P` với `X`: **có đơn** hay không. Tiếng Việt khớp `dayCredit`/`nominalMinutes`? không, nhưng repo đã có `lib/cham-cong/nhan-ca.ts`, `noi-quet.ts`… | trộn hai ngôn ngữ trong cùng một model |
| `isLeaveRequest` | rõ "đây là loại nghỉ phải nộp đơn" | dài, dễ nhầm với model `WorkRequest` |
| ~~`isOff`~~ | — | **ĐỪNG** — `isOff` đã được dùng ở tầng engine với nghĩa `kind === "OFF"`, đổi sang nghĩa này là hoán vị hai khái niệm |

**Nghiêng về `isPaidLeave`** cho model Prisma (giữ quy ước `is*` của schema), và giữ
nguyên `laNgayNghi(kind)` ở `lib/cham-cong/nhan-ca.ts` làm **hàm duy nhất** trả lời câu
"ngày này có nghỉ không". Chủ dự án chốt tên cuối.

### Đo — còn chỗ nào đọc `isLeave` với nghĩa "ngày nghỉ"?

Rà `grep isLeave` toàn repo `.ts/.tsx`, phân loại **từng** chỗ đọc (không tính chỗ chỉ
`select`/gán/copy cột):

**✅ ĐÚNG — đã xét CẢ HAI (`isLeave` + `kind === "OFF"`)**

| Nơi | Cách viết |
|---|---|
| `lib/cham-cong/engine.ts:243` | `if (a.isLeave \|\| a.isOff \|\| attendanceMode === "NONE")` |
| `lib/cham-cong/brief.ts:43-46` | `if (!a \|\| a.isOff) … else if (a.isLeave)` — `isOff` vào từ `brief-db.ts:75` = `template.kind === "OFF"` |
| `lib/cham-cong/recompute.ts:128` | `isOff: assignment.template.kind === "OFF"` truyền kèm `isLeave` |
| `lib/cham-cong/reconcile-db.ts:25` | `where: { OR: [{ isLeave: true }, { kind: "OFF" }] }` |
| `lib/cham-cong/request-form-data.ts:35` | `where: { isLeave: false, kind: { not: "OFF" } }` |

> 📌 **Đáng ghi:** tầng ENGINE đã biết `kind` mới là thứ phân biệt, từ đầu. Chỉ tầng
> HIỂN THỊ là không biết — vì `MyShiftRow` không mang `kind` sang. Đổi tên trường sẽ làm
> cái biết ấy hiện ra ở mọi call site thay vì nằm trong đầu người viết engine.

**⚠️ MONG MANH — đúng hôm nay nhờ hardcode `"X"`/`"P"`**

| Nơi | Cách viết | Vỡ khi nào |
|---|---|---|
| `app/(admin)/admin/cham-cong/phan-ca/page.tsx:187` | `new Set([...templates.filter(t => t.isLeave).map(code), "X", "P"])` | thêm một mã `kind: OFF` mới (vd `NB` — nghỉ bù không đơn) |
| `components/admin/cham-cong/shift-cell-picker.tsx:53` | `c.isLeave ?? (code === "X" \|\| code === "P")` | **đã vỡ**, xem dưới |

**🔴 LỖI THẬT (nhẹ, giao diện) — `components/admin/cham-cong/shift-cell-picker.tsx:52-53`**

```ts
function isOff(c: ShiftCellCode): boolean {
  return c.isLeave ?? (c.code === "X" || c.code === "P");
}
```

Hàm tên `isOff` nhưng đọc `isLeave`. Vế dự phòng `??` **chỉ chạy khi `isLeave` là
`undefined`** — mà cả hai nơi gọi đều truyền nó thật (`khung-ca/page.tsx:235`,
`phan-ca/page.tsx:184`). Với `X`, `isLeave = false` ⇒ `isOff(X) = false`.

**Hệ quả đo được:** ở dropdown chọn mã ca (`:100-101` chia `work` / `off`), mã **`X` nằm
trong nhóm "làm việc"** thay vì nhóm "Nghỉ". Chỉ sai NHÓM hiển thị — không sai công,
không sai dữ liệu ghi xuống. Vá bằng `laNgayNghi(kind)` khi làm vé này.

**✅ ĐÚNG NHƯNG TÊN GÂY HIỂU NHẦM — `app/(admin)/admin/dashboard/_components/nghi-sap-toi.tsx:50`**

`where: { isLeave: true }` cho khối "Nghỉ sắp tới". Nó **cố ý** chỉ lấy nghỉ PHÉP (khối
này đi kèm số đơn `WorkRequest kind: "LEAVE"` đang chờ duyệt — mục đích là bố trí người
thay). Ngày nghỉ tuần `X` của cả cơ sở lọt vào đây là nhiễu. **Đúng, giữ nguyên** — nhưng
đây chính là ca cho thấy vì sao cái tên phải đổi: đọc dòng đó không thể biết ngay là cố ý
hay sót.

### Phạm vi khi làm

1. Migration `RENAME COLUMN` trên `ShiftTemplate` **và** `ShiftAssignment` (hai bảng).
   ⚠️ Luật cứng #4 — bảng có dữ liệu prod, phải có dry-run và người vận hành chạy tay.
2. `tsc` sẽ liệt kê hết call site (luật 7 — chính là điểm cộng của việc đổi tên).
3. Vá `shift-cell-picker.tsx` sang `laNgayNghi(kind)`.
4. Bỏ hardcode `"X"`/`"P"` ở `phan-ca/page.tsx:187`.
5. Ca test: thêm một mã `kind: OFF` giả trong fixture và khẳng định nó rơi đúng nhóm nghỉ
   ở CẢ hai chỗ trên — không có ca đó thì bản vá chỉ đúng cho đúng hai mã đang tồn tại.

---

## Việc 2 — cờ `SAI_NOI_LAM` (D1b)

Đã chốt hướng ở lượt trước: **giữ tín hiệu, đổi cách nó ĐỌC lên**. Cờ mô tả SỰ VIỆC
("quét ở nơi khác nơi được xếp"), không phán xét ("sai"). Người Hội sở (`placeMode:
ANY_CENTER`) và nhân viên sang cơ sở khác học nội bộ đều là chuyện thường ngày.

Nhãn hiện tại: `SAI_NOI_LAM: { text: "Sai nơi làm", tone: "danger" }`
(`lib/cham-cong/flag-labels.ts:24`).

Việc phải làm khi mở vé:
- chọn mã mới (vd `QUET_KHAC_NOI_XEP`) + nhãn (vd "Quét khác nơi xếp");
- ⚠️ **mã cờ nằm trong dữ liệu prod** (`StaffAttendanceDay.flags[]`) ⇒ phải backfill hoặc
  giữ bảng ánh xạ mã cũ, không được chỉ đổi hằng số rồi coi như xong;
- cân lại `tone`: `danger` có còn đúng khi tên không còn là "sai" nữa không;
- `countsAsIssue` — cờ này còn đếm vào hàng chờ rà không?

Cùng họ với `lib/cham-cong/noi-quet.ts` (D1, đã lên prod PR #241): ở đó nhãn
`"quét nơi khác"` đã được thay bằng **tên cơ sở thật**, và chú thích trong file ghi rõ
`place.ts` cố ý KHÔNG gắn `SAI_NOI_LAM` cho người HO.

---

## Vì sao hai việc này ở CÙNG một vé

Cả hai là **luật 12 áp cho TÊN TRONG MÃ**, không phải cho giao diện:

> Một cái tên gợi ý điều gì thì phải mang đúng điều đó. `isLeave` hứa "ngày nghỉ",
> `SAI_NOI_LAM` hứa "có gì đó sai". Cả hai lời hứa đều **không ném lỗi, không làm test
> đỏ** — chúng chỉ khiến người viết mã tiếp theo suy luận sai. Bug prod 10/09 là một
> người viết mã tiếp theo đó.
