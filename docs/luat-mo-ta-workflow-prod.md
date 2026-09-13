# LUẬT — sửa script mà workflow PROD đang chạy thì phải cập nhật mô tả workflow TRONG CÙNG COMMIT

| | |
|---|---|
| **Ngày ban hành** | 07/09/2026 |
| **Do** | Chủ dự án, sau sự cố `cham-cong-prod-seed.yml` |
| **Phạm vi** | Mọi workflow trong `.github/workflows/` có `workflow_dispatch` và ghi vào PROD |

---

## Luật

> **Hễ sửa một script mà workflow PROD đang chạy, phải cập nhật mô tả workflow đó trong CÙNG commit.**

"Mô tả" gồm ba thứ, phải khớp nhau và khớp với script:

1. Khối chú thích đầu file `.yml` — liệt kê **đủ** những gì sẽ ghi.
2. `name:` của workflow — thứ hiện trên GitHub Actions, thứ người ta đọc trước khi bấm.
3. `name:` của từng `step` — thứ hiện trong log.

---

## Chuyện đã xảy ra

`cham-cong-prod-seed.yml` (06/09/2026) có header ghi rõ:

> *"Ghi **3 thứ**, đều idempotent: 21 mã ca `ShiftTemplate` · 8 loại nghỉ `LeaveType` ·
> `WorkLocation` cho từng cơ sở vận hành."*

Sau đó **hai commit khác nhau** thêm việc ghi vào chính script mà nút đó chạy
(`prisma/seed-cham-cong.ts`), mà **không đụng tới file workflow**:

| Commit | Thêm gì | Header có đổi? |
|---|---|---|
| `2b9ade32` | `TeachingCreditType` — 6 dòng | ❌ |
| `0a67b8d7` | `SessionCategory` — 7 dòng, kèm `updateMany` nhả cờ mặc định | ❌ |

⇒ Đến 07/09, **nút bấm ghi 5 nhóm trong khi mô tả của nó vẫn nói 3.**

Cả hai commit đều đúng về mặt tính năng, và người viết chúng (tôi) không cố tình giấu gì. Vấn đề là
**mô tả và hành vi ở hai file khác nhau, nên chúng trôi ra xa nhau mà không ai thấy.**

### Vì sao đây là lỗi nặng chứ không phải chuyện tài liệu

Người bấm nút prod **đọc mô tả để quyết định có bấm hay không**. Mô tả sai nghĩa là quyết định đó
dựa trên thông tin sai — và với một nút ghi vào prod thì đó là toàn bộ lớp phòng vệ.

Đây **cùng một họ với ba lỗi module này đang dọn cả tuần**, chỉ khác là lần này nằm ở CI:

| Lỗi | Hình dạng chung |
|---|---|
| Bút toán `ADJUSTED` bên thanh toán | Dữ liệu có thật, **không ai đọc** ⇒ nút "điều chỉnh" không đổi một đồng |
| Ngày lễ toàn hệ thống | Dòng có thật, **tàng hình** với người cấp cơ sở |
| `tests/cham-cong` ngoài cổng merge | Test có thật, **không ai chạy** ⇒ đỏ im lặng 1 ngày |
| **Header workflow prod** | Mô tả có thật, **không khớp hành vi** ⇒ người bấm tin nhầm |

---

## Cách chấp hành

### Bắt buộc

- Sửa script trong `prisma/seed*.ts`, `scripts/*.ts` mà có workflow prod gọi ⇒ **mở file `.yml`
  đó ra trong cùng commit** và sửa cả ba mục ở trên.
- Tìm workflow nào gọi script mình vừa sửa:
  ```bash
  grep -rn "<tên-file-script>" .github/workflows/
  ```
- Thông điệp commit **nói ra** phạm vi ghi đã đổi, đừng chỉ nói tính năng mới.

### Mạnh hơn mô tả: bắt script TỰ KHAI

Mô tả là thứ do con người giữ đồng bộ, nên nó sẽ lại lệch. Cách chắc hơn là **script tự in phạm vi
thật ngay trước khi ghi dòng đầu tiên**.

`prisma/seed-cham-cong.ts` đã làm (`khaoSatPhamVi` trong `lib/cham-cong/seed-core.ts` — thuần đếm,
không ghi gì):

```
[seed-cham-cong] PHẠM VI SẼ GHI · chế độ: thường (chỉ tạo dòng còn thiếu)
  NHÓM                                  ĐANG CÓ   SẼ TẠO    SẼ ĐÈ
  ShiftTemplate (mã ca)                       0       21        0
  LeaveType (loại nghỉ)                       0        8        0
  WorkLocation (điểm chấm công)               0        2        0
  SessionCategory (phân loại buổi)            0        7        0
  TeachingCreditType (loại công dạy)          0        6        0
  TỔNG                                                44        0
```

**Script prod ghi vào nhiều nhóm thì nên có bảng này.** Nó không thể trôi khỏi sự thật, vì nó
đếm chính DB sắp bị ghi.

### Ghi có điều kiện lên dòng người khác đã sửa: chỉ sau `--force`

Cũng ra đời từ sự cố này. `seedSessionCategories` có một `updateMany` nhả cờ "mặc định" của dòng
khác — cần thiết vì partial unique index chỉ cho một dòng mặc định. Nhưng bản đầu chạy nó **vô điều
kiện**, và nó **lọt được vào lần bấm thường**: khi dòng `CHINH_THUC` chưa tồn tại mà DB đã có phân
loại khác đang giữ cờ.

Luật: **mọi thao tác ghi lên dòng NGƯỜI VẬN HÀNH đã sửa đều phải nằm sau `--force`.** Lần bấm
thường thì **nhường**, và **nói ra là đã nhường**:

```
[seed-cham-cong] ⚠️ 1 phân loại buổi KHÔNG được đặt làm mặc định vì người vận
        hành đã chọn dòng mặc định khác. Không đè lựa chọn của họ ở lần bấm thường —
        muốn ép về bản trong mã nguồn thì chạy lại với --force.
```

### Đặt tên hai nút cạnh nhau, khác nhau ở đầu câu

GitHub Actions xếp workflow theo `name:`. Nút ĐO và nút GHI của cùng một module nên dùng **chung
tiền tố** và khác nhau **một từ viết hoa nằm ở đầu**, để chúng nằm cạnh nhau mà không lẫn được:

```
Chấm công · PROD · ĐO  (chỉ đọc — không ghi gì)
Chấm công · PROD · GHI (seed danh mục nền)
```

Đừng để từ phân biệt nằm ở cuối câu — người ta đọc mấy chữ đầu rồi bấm.

---

## Kiểm cú pháp trước khi giao

`pyyaml` **lỏng hơn** bộ phân tích của GitHub, nên nó xanh không có nghĩa là GitHub nhận. Dùng
`actionlint` — đúng bộ luật GitHub:

```bash
actionlint
```

Đã thử: bản `cham-cong-prod-seed.yml` trước khi vá (commit `a435434b`) bị actionlint bắt đúng dòng
GitHub báo:

```
cham-cong-prod-seed.yml:53:0: could not parse as YAML: yaml: line 53:
  mapping values are not allowed in this context [syntax-check]
```

Nguyên nhân: `name:` của step chứa `: ` mà không bọc ngoặc ⇒ YAML đọc thành ánh xạ lồng.
**Tên bước tiếng Việt hay có dấu hai chấm — luôn bọc ngoặc kép.**
