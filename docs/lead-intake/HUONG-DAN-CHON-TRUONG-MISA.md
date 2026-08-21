# Hướng dẫn: chọn trường trên webform MISA cho biểu mẫu `/nhap-khach-hang`

> Người làm: chủ dự án / người có quyền quản trị AMIS CRM.
> Người nhận kết quả: dev (dán 3–5 giá trị vào env Vercel, không phải sửa code).
> Ngày: 22/08/2026.

---

## 1. Vì sao cần bước này

Biểu mẫu nhập khách hàng đã dời về `satarobo.vn/nhap-khach-hang` và **bộ ô đã đổi**
(7 ô, không ô nào bắt buộc):

| # | Ô trên trang mới | Trường MISA tương ứng | Tình trạng |
|---|---|---|---|
| 1 | Tên phụ huynh | `CustomField25` | ✅ đã có |
| 2 | SĐT phụ huynh | `CustomField15` | ✅ đã có |
| 3 | Tên con | `LastName` | ✅ đã có (MISA **bắt buộc** ô này) |
| 4 | **Nguồn** | `LeadSourceID` | ⚠️ có, nhưng là **danh sách chọn** — xem §3 |
| 5 | **Link Facebook** | *(chưa có)* | ❌ **cần tạo mới** — xem §4 |
| 6 | Cơ sở PH chọn | `CustomField17` (`1`=CS1, `2`=CS2) | ✅ đã có |
| 7 | Ghi chú | `Description` | ✅ đã có |
| — | Mã số NV nhập liệu | `CustomField26` | ✅ đã có — **hệ thống tự điền** theo tài khoản đăng nhập, không còn ô để gõ |

Ba ô cũ **đã bỏ khỏi trang mới**: Email PH, Trường bé, Lớp bé. Trên MISA cứ để
nguyên các trường đó — ta chỉ ngừng gửi giá trị, không xoá gì bên MISA.

**Chưa làm gì thì hệ thống vẫn chạy đúng:** "Nguồn" và "Link Facebook" được ghép
vào ô **Ghi chú/`Description`** của MISA (không mất dữ liệu, chỉ là chưa lọc được
bên đó). Làm xong §3–§4 thì hai giá trị này nhảy vào ô riêng — **không phải sửa
code, chỉ đặt env**.

---

## 2. Lấy 3 tham số định danh form (BẮT BUỘC, làm trước)

Biểu mẫu mới gửi phiếu sang MISA từ **máy chủ**, chứ không phải từ trình duyệt như
bản HTML cũ, nên nó không tự mang theo 3 tham số ẩn của form nữa. Phải khai vào env.

**Cách lấy:**

1. Vào **AMIS CRM → Thiết lập → Web Form** → mở form **"Form nhập liên hệ từ Sale"**.
2. Bấm **Lấy mã nhúng / Xuất mã HTML**.
3. Trong đoạn mã, tìm 3 dòng `<input type="hidden" …>` sau và **chép nguyên giá trị**:

   ```html
   <input ... name="ID"          value="c53af301-…">
   <input ... name="Companycode" value="uys4eef4">
   <input ... name="FormKey"     value="oCCXw…=">
   ```

4. Gửi 3 giá trị đó cho dev → dev đặt vào env Vercel (cả `Production` và `test`):

   | Biến env | Lấy từ |
   |---|---|
   | `MISA_WEBFORM_ID` | `name="ID"` |
   | `MISA_WEBFORM_COMPANYCODE` | `name="Companycode"` |
   | `MISA_WEBFORM_KEY` | `name="FormKey"` |

> ⚠️ **Thiếu 3 biến này = MISA không nhận được phiếu nào.** Không im lặng: mỗi
> phiếu hỏng sẽ đẻ một dòng `WebhookDelivery` trạng thái `FAILED` xem được ở màn
> tích hợp, nhưng vẫn nên đặt env ngay hôm đi vào chạy thật.
>
> Nếu **không muốn gửi MISA nữa** thì tắt hẳn bằng `SystemSetting` → `intake.mirrorMisa`
> = tắt, sẽ không có cảnh báo giả nào.

---

## 3. Ô "Nguồn" — `LeadSourceID`

Trên trang mới, **Nguồn là ô gõ tự do** (chủ dự án chốt 22/08). Trên MISA nó là
**danh sách chọn 12 giá trị số** (value 1–13, không có 5). Hai kiểu này không tự
khớp nhau được, nên chọn **một** trong hai đường:

**Đường A — giữ ô gõ tự do (mặc định, không cần làm gì).**
Nguồn người nhập gõ đi vào `Lead.source` của hệ thống ta (lọc được ở màn Leads), và
xuống ô Ghi chú của MISA. Không cần cấu hình gì thêm.

**Đường B — muốn nguồn vào đúng ô `LeadSourceID` của MISA.**
Gửi cho dev **danh sách 12 nguồn kèm số**, đúng như MISA đang khai. Lấy bằng cách:
mở lại đoạn mã nhúng ở §2, tìm khối `<select name="LeadSourceID">` rồi chép cả khối:

```html
<select name="LeadSourceID">
  <option value="1">Quảng cáo Facebook</option>
  <option value="2">…</option>
  ...
</select>
```

Dev sẽ đổi ô "Nguồn" trên trang thành dropdown đúng 12 giá trị đó (một từ điển
nguồn duy nhất cho cả hai hệ thống) và khai `MISA_FIELD_LEAD_SOURCE="LeadSourceID"`.

---

## 4. Ô "Link Facebook" — cần tạo mới trên MISA

MISA **chưa có** trường nào cho link Facebook. Nếu muốn bên MISA cũng thấy link:

1. **AMIS CRM → Thiết lập → Tuỳ chỉnh dữ liệu / Trường mở rộng** của đối tượng
   **Tiềm năng (Lead)** → **Thêm trường**.
2. Khai:
   - Tên hiển thị: **Link Facebook**
   - Kiểu dữ liệu: **Văn bản** (một dòng), độ dài tối đa **300**
   - Không bắt buộc.
3. Quay lại **Web Form** → kéo trường vừa tạo vào form → **Lưu** → **Xuất lại mã nhúng**.
4. Trong mã nhúng mới, tìm trường vừa thêm để lấy **tên kỹ thuật** của nó — dạng
   `name="CustomField27"` (số cụ thể do MISA cấp, không đoán trước được).
5. Gửi tên đó cho dev → dev đặt `MISA_FIELD_FACEBOOK="CustomField27"`.

---

## 5. Tóm tắt: anh gửi cho dev đúng những thứ này

- [ ] **Bắt buộc:** 3 giá trị `ID` / `Companycode` / `FormKey` (§2).
- [ ] *Tuỳ chọn:* cả khối `<select name="LeadSourceID">` với 12 dòng `<option>` (§3, đường B).
- [ ] *Tuỳ chọn:* tên kỹ thuật của trường "Link Facebook" vừa tạo (§4).

Cách gửi gọn nhất: **xuất lại mã nhúng của form và gửi nguyên file/đoạn mã** — trong
đó đã có đủ cả ba thứ trên. Đoạn mã này không phải mật khẩu (trước đây nó nằm công
khai trong `sale.satarobo.vn/nhap-lieu.html`), nhưng vẫn nên gửi qua kênh nội bộ.

---

## 6. Chỗ code liên quan (cho dev)

| Việc | File |
|---|---|
| Ánh xạ ô của ta → tên trường MISA | `lib/lead/intake/misa-internal.ts` |
| Gửi + xử lý hỏng (không bao giờ rollback lead) | `lib/lead/intake/misa-mirror.ts` |
| Gọi mirror sau khi đã ghi Lead | `app/(intake)/nhap-khach-hang/actions.ts` |
| Cờ tắt/bật mirror | `SystemSetting` → `intake.mirrorMisa` |
| Đối chiếu bộ trường (bản verify 16/07/2026) | `Document/0-yeucau/2-ba-phan-tich/09-ui-ux-site-sale-tuyensinh.md` §7 tab 6 |
