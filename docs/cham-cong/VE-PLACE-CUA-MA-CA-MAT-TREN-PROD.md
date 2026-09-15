# VÉ — `place` trong `segments` của 5 mã ca MẤT TRÊN PROD

> **Trạng thái:** MỞ, chưa sửa. Tách ra theo chốt của chủ dự án 15/09/2026 (câu A3):
> *"Lệch `place` của `NG` trên prod — **tách vé**"*, vì đó là **dữ liệu đã ghi sai**, không
> phải đường ghi. Gộp vào phần A là lẫn "sửa mã" với "sửa dòng".

---

## Sự việc — đo 09/09/2026 bằng `scripts/do-khung-ca-diem-cham.ts` (mục V10)

| Mã | Cột | seed | prod |
|---|---|---|---|
| `HC` `12` `21` `2C` `NG` | `place` trong `segments` | **có** (`ASSIGNED` · `CENTER:CS1` · `CENTER:CS2` · `ANY_CENTER` · `OFFSITE`) | **MẤT HẾT** |
| `2C` | `defaultPlace` | `ANY_CENTER` | **`HOME`** |

Năm mã cùng mất `place` một lúc ⇒ gợi ý **màn Danh mục mã ca làm rụng trường đó khi lưu**.
**Chưa xác minh.** Ghi lại mà cửa vẫn hở là mất lần nữa.

---

## Hệ quả — suy từ `lib/cham-cong/place.ts:74`, không phải đoán

Dòng quyết định mọi thứ:

```ts
const r = unitsOf(s.place ?? input.defaultPlace, input.homeUnit, input.map, warnings);
```

`place` rỗng thì **rơi về `defaultPlace`**. Nên hậu quả KHÔNG đồng đều giữa năm mã:

| Mã | `defaultPlace` trên prod | `placeMode` suy ra | Hỏng gì |
|---|---|---|---|
| `NG` | `OFFSITE` (**không lệch**) | `OFFSITE` ✔ | **không hỏng** — xem mục dưới |
| `HC` | `ASSIGNED` (không lệch) | `AT_UNITS` ✔ | mất phân biệt đoạn sáng/chiều, nhưng cả hai đoạn vốn cùng `ASSIGNED` ⇒ kết quả như nhau |
| `12` `21` | `HOME` | **`AT_UNITS` theo MỘT cơ sở** | 🔴 **hỏng thật.** Mã sinh ra để nói "sáng CS1, chiều CS2" nay coi cả ngày ở một nơi ⇒ cờ `SAI_NOI_LAM` bắn oan cho đúng người làm đúng |
| `2C` | **`HOME`** (lệch) | **`AT_UNITS`** thay vì `ANY_CENTER` | 🔴 **hỏng thật.** `2C` = "cả 2 cơ sở, chấm đâu cũng được" nay bị ràng về một cơ sở ⇒ `SAI_NOI_LAM` oan |

⇒ **Thiệt hại thật nằm ở `12` · `21` · `2C`**, không phải `NG`. Đó là ba mã duy nhất mà
`place` mang thông tin mà `defaultPlace` không thay được.

### `NG` không hỏng — và đây là lý do phần A đi tiếp được

Phần A hiện hai nút Check in / Check out khi `assignment.placeMode === "OFFSITE"`. Trên prod
`NG` vẫn có `defaultPlace: OFFSITE`, nên `s.place ?? defaultPlace` vẫn ra `OFFSITE` và
`place.ts:89` vẫn suy `placeMode = "OFFSITE"`. **Điều kiện hiện nút sống được trên prod dù
`place` đã rụng.**

⚠️ Nhưng nó sống **nhờ một đường dự phòng**, không nhờ dữ liệu đúng. Ngày nào ai đó sửa
`defaultPlace` của `NG` trên màn Danh mục thì hai nút biến mất và **không gì báo**. Đó là lý
do vé này không được để mãi.

---

## Trước khi sửa — hai việc, theo thứ tự

**1. Xác minh màn Danh mục có phải thủ phạm không.** Ghi lại mà cửa vẫn hở là mất lần nữa.
Cách rẻ: mở màn Danh mục mã ca trên **test**, sửa một trường bất kỳ của một mã CÓ `place`,
lưu, rồi đọc lại `segments` từ DB. `place` rụng ⇒ tìm được thủ phạm trong một lượt.

**2. Rồi mới ghi lại chiều seed → prod**, và chỉ cho 5 mã trong bảng — không chạy
`seed-cham-cong.ts --force`, vì `force` đè TOÀN BỘ mọi trường của mọi dòng, kể cả
`displayOrder` người vận hành đã sắp và `name` Đào tạo đã sửa.

---

## Đo lại trước khi làm

Số ở vé này đo ngày **09/09/2026**. Bấm lại `viec = khung-ca-diem-cham` (chỉ đọc) trước khi
sửa — giữa hai mốc có thể đã có người sửa tay trên màn Danh mục, và ghi đè lên chỉnh tay của
họ là đúng thứ vé này đang phàn nàn.

## Liên quan

- `docs/cham-cong/BANG-MA-CA-CHOT.md` — bảng lệch seed ↔ prod đầy đủ (9 dòng, hai chiều).
- `lib/cham-cong/place.ts` — `unitsOf` + thứ tự ưu tiên `placeMode`.
- `docs/cham-cong/VE-DOI-TEN-CO-VA-TRUONG.md` — cùng họ: cờ `SAI_NOI_LAM` mất nghĩa.
