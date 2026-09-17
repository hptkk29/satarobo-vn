# Nghiệm thu VAI · QUYỀN · CÁCH LY trên `test.satarobo.vn` (17/09/2026)

> Bản này **khác** [`04-danh-sach-cho-nick-zalo.md`](04-danh-sach-cho-nick-zalo.md): bản 04
> cần một **nick Zalo thật** và đo luồng tin. Bản này đo **ai vào được, thấy gì, bị chặn ở
> đâu** — chạy được ngay, không cần nick.
>
> **Môi trường:** `test.satarobo.vn`, commit `9b78397d` (deploy Vercel môi trường `test`
> báo `success` lúc 2026-09-17T03:38Z). Fork ZaloCRM: `https://echo-hong-except-quest.trycloudflare.com`.

## Trước khi bắt đầu

| Cần gì | Ghi chú |
|---|---|
| 2 tài khoản vai **Tư vấn & CSKH cơ sở** (`CENTER_SALES_CSM`) cùng neo tại **CS1** | mục ①② |
| 1 tài khoản **Quản lý cơ sở** (`CENTER_MANAGER`) tại CS1 | mục ③ |
| 1 tài khoản **Quản lý lớp học / Giáo vụ** (`CENTER_CLASS_MANAGER`) | mục ④ |
| ~~1 tài khoản neo cả CS1 và CS2~~ | ~~mục ⑤~~ — **chưa kiểm được**, xem mục ⑤⑥ |
| ~~1 tài khoản neo chỉ CS1~~ | ~~mục ⑥~~ — **chưa kiểm được** |
| 1 phiếu lead **có SĐT di động VN hợp lệ**, thuộc **CS2** | mục ⑦ |

⚠️ **Không cần dựng dữ liệu mới.** Toàn bộ checklist dùng tài khoản và phiếu đã có trên
test. Nếu anh phải tạo tài khoản mới thì ghi lại để xoá sau — DB test dùng chung với máy dev.

---

## ① Vai SALE (CS1) — vào thẳng, không đăng nhập lần hai

1. Đăng nhập `test.satarobo.vn` bằng tài khoản **SALE #1 (CS1)**.
2. Mở `https://test.satarobo.vn/zalo-crm`.

| | Thấy gì |
|---|---|
| **ĐẠT** | Khung ZaloCRM hiện **nội dung đã đăng nhập sẵn** (danh sách hội thoại / màn chat). **Không** có ô đăng nhập thứ hai, **không** trang 403, **không** "Bạn chưa được gán cơ sở nào có Zalo CRM". |
| **KHÔNG ĐẠT** | Bất kỳ cái nào: màn đăng nhập của ZaloCRM · khung trắng · chữ *"Vai của bạn chưa được ánh xạ sang vai trong Zalo CRM…"* · *"Chưa khai địa chỉ giao diện Zalo CRM (ZALOCRM_APP_URL)"* · bị đá về `/dashboard?error=unauthorized`. |

**Ghi lại:** tên nick Zalo đang hiện (để so ở mục ②).

## ② Vai SALE thứ hai cùng CS1 — CÙNG nick, không phải nick riêng

1. Đăng xuất, đăng nhập bằng **SALE #2 (CS1)**. Mở `/zalo-crm`.

| | Thấy gì |
|---|---|
| **ĐẠT** | **Cùng nick** và **cùng danh sách hội thoại** như mục ①. |
| **KHÔNG ĐẠT** | Thấy nick khác, danh sách rỗng, hoặc *"Bạn chưa được gán cơ sở nào"*. |

> Quyền đọc nick đến từ bảng `ZaloAccountAccess`, do cron 5 phút
> (`/api/cron/zalocrm-doi-soat` → `capQuyenNickZalocrm`) cấp. Tài khoản **vừa tạo** có thể
> phải đợi tới 5 phút. Nếu quá 5 phút vẫn rỗng → ghi KHÔNG ĐẠT.

## ③ Vai QLCS — vào được, nhưng KHÔNG chạm được phần quản trị

Đăng nhập **CENTER_MANAGER (CS1)** → `/zalo-crm`.

**Phần phải ĐẠT:** thấy hội thoại y như mục ①.

**Phần phải BỊ CHẶN** — bấm lần lượt **bên trong khung ZaloCRM**:

| Bấm đâu | ĐẠT (bị chặn) | KHÔNG ĐẠT |
|---|---|---|
| Menu/avatar góc phải → **Cài đặt (Settings)** | không có mục, hoặc bấm vào báo không đủ quyền | mở được trang cài đặt |
| **Nhóm quyền (Permission groups)** | không có mục | mở được |
| **Quản lý nick Zalo / Tài khoản Zalo** (gỡ nick, thêm nick) | không có mục, hoặc nút gỡ mờ/không bấm được | gỡ được nick |
| **Nhật ký (Audit log)** | không có mục | đọc được nhật ký |
| **Người dùng (Users)** | không có mục | mở được |

> Lý do: `VAI_ZALOCRM` ánh xạ `CENTER_MANAGER → member`. Chỉ `SUPER_ADMIN → admin`, vì
> `admin` bên fork **bỏ qua toàn bộ ma trận quyền**. Nếu QLCS mở được bất kỳ mục nào ở
> trên ⇒ ánh xạ vai đã sai, **dừng nghiệm thu và báo ngay**.

## ④ Vai GIÁO VỤ — không thấy mục Zalo CRM

Đăng nhập **CENTER_CLASS_MANAGER**.

| | Thấy gì |
|---|---|
| **ĐẠT** | Sidebar **không có** mục "Zalo CRM". Gõ thẳng `/zalo-crm` → bị đá về `/dashboard?error=unauthorized`. |
| **KHÔNG ĐẠT** | Thấy mục trong menu, hoặc vào được `/zalo-crm`. |

## ⑤ Đổi cơ sở · ⑥ Cách ly `?org=` — **CHƯA KIỂM ĐƯỢC — thiếu org thứ hai bên fork**

> 🔴 **Đánh dấu "CHƯA KIỂM ĐƯỢC — thiếu org thứ hai bên fork". KHÔNG phải ĐẠT.**
> Đừng tick xanh hai mục này, và cũng đừng ghi KHÔNG ĐẠT — chúng chưa chạy được.

Đo trên fork ngày 17/09/2026:

```
organizations:        1 dòng — e4b4b2ff "Sata Robo"
khoá public_api_key:  1 (chỉ org đó addressable)
cả 2 nick + 5 user:   đều thuộc org này
```

Thiết kế giả định **ba org (CS1, CS2, TEST)** trên một máy chủ; thực tế đang có **một**.
Hệ quả: CS1 và CS2 ánh xạ về **cùng một** `orgCode`, mà `chonCoSoZaloCrm` khử trùng theo
`orgCode` (*"Hai cơ sở khai trùng orgCode… Giữ cơ sở đầu"*), và thanh chọn chỉ hiện khi
`danhSach.length > 1` ⇒ **hộp chọn cơ sở không xuất hiện**, và không có cơ sở thứ hai để
`?org=cs2` rơi về.

Mở lại được hai mục này khi nào dựng xong org thứ hai — các bước nằm ở `NỢ-6` trong
[`../hop-nhat-main-test-1609.md`](../hop-nhat-main-test-1609.md).

## ⑦ Cổng A — nút "Nhắn Zalo" trên phiếu lead

Đăng nhập **SALE (CS1)** hoặc vai có `leads:view-pii` + `zalocrm:use`.

1. Mở một phiếu lead **thuộc CS2**, có SĐT hợp lệ: `/leads/<id>`.

| | Thấy gì |
|---|---|
| **ĐẠT** | Cạnh SĐT có nút **"Nhắn Zalo"**. Bấm → sang `/zalo-crm?compose=84…&lead=…&org=cs2` và khung mở **đúng CS2** (không phải cơ sở đầu bảng chữ cái). |
| **KHÔNG ĐẠT** | Không có nút (dù SĐT hợp lệ và có quyền) · bấm ra hộp soạn tin **trống** · mở nhầm CS1 · URL thiếu `&org=`. |

2. Mở một phiếu **không có SĐT** (lead Facebook): **ĐẠT** = không có nút.

3. **Dòng Consent** trên cùng trang chi tiết phiếu: phải hiển thị bình thường.
   **KHÔNG ĐẠT** = ô trống, xoay mãi, hoặc lỗi tải. *(Trên máy dev từng 404 — nếu trên test
   cũng lỗi, chụp màn hình + mở DevTools tab Network, ghi đường dẫn nào trả 404.)*

## ⑧ B7 — đường lùi: tắt cờ thì hệ thống về như trước

> ⚠️ Việc này **anh làm trên Vercel**, tôi không có quyền. Môi trường `test` → biến
> `ZALOCRM_ENABLED` → đặt `false` → **Redeploy**.

Sau khi deploy xong:

| Kiểm | ĐẠT | KHÔNG ĐẠT |
|---|---|---|
| Sidebar | **không còn** mục "Zalo CRM" với mọi vai | vẫn còn |
| `/zalo-crm` gõ thẳng | trang 404 | 500 hoặc khung trắng |
| Nút "Nhắn Zalo" trên phiếu lead | **biến mất** | vẫn hiện (bấm vào là vào 404) |
| Chi tiết phiếu · danh sách lead · hộp thư · dashboard | **mở bình thường, không vỡ** | bất kỳ màn nào lỗi |

Xong thì **đặt lại `ZALOCRM_ENABLED=true` + Redeploy** trước khi chạy tiếp.

---

## Cách báo kết quả

Mỗi mục một dòng: `① ĐẠT` · `① KHÔNG ĐẠT — <thấy gì>` · hoặc `⑤ CHƯA KIỂM ĐƯỢC — thiếu org thứ hai bên fork` (chỉ dùng cho ⑤⑥). Với mục không đạt, thêm nếu có:
ảnh chụp màn, đường dẫn đầy đủ trên thanh địa chỉ, và lỗi trong DevTools → Console/Network.
Tôi sẽ truy nguyên nhân bằng log + mã, không đoán.
