# Webform MISA cho biểu mẫu `/nhap-khach-hang` — "Form Nhập KH v2"

> ✅ **23/08/2026 — CHẠY THÔNG ĐẦU–CUỐI trên `test`.** Nhập phiếu qua biểu mẫu
> thật → Lead vào hệ thống ta → bản sao xuất hiện trong MISA (xác nhận bằng mắt
> trên CRM, `x-request-id=1641223676`). Env đã đặt đủ cho `Production`/`Preview`/`test`.
>
> Bộ trường khớp đúng 7 ô của trang nhập khách; mã nguồn map theo webform
> **"Form Nhập KH v2"**.

---

## 1. Đối chiếu trường — đã khớp đủ

| # | Ô trên `/nhap-khach-hang` | Trường MISA | Ghi chú |
|---|---|---|---|
| 1 | Tên phụ huynh | `CustomField25` | |
| 2 | SĐT phụ huynh | **`Mobile`** | ⚠️ form v2 dùng trường CHUẨN, **khác** form cũ (`CustomField15`) |
| 3 | Tên con | `LastName` | ô **duy nhất** MISA bắt buộc |
| 4 | Nguồn | `LeadSourceID` | 12 giá trị (1–13, không có 5) — xem §3 |
| 5 | Link Facebook | `CustomField22` | |
| 6 | Cơ sở PH chọn | `CustomField17` | `1` = CS1 · `2` = CS2 |
| 7 | Ghi chú | `Description` | |
| — | *(tự động)* Mã số NV | `CustomField26` | lấy từ tài khoản đăng nhập, không có ô để gõ |

Form v2 **không còn** Email / trường / lớp / tỉnh / địa chỉ — đúng bằng bộ 7 ô. Không
còn trường nào bị bỏ trống vô nghĩa như hồi dùng chung form cũ.

**Định dạng gửi đi:** SĐT gửi dạng `0905123456` (không phải canonical nội bộ
`84905123456`) để đối khớp với bản ghi MISA cũ không bị trượt.

---

## 2. Ba biến env — việc DUY NHẤT còn lại

Lấy từ chính mã nhúng của **"Form Nhập KH v2"** (AMIS CRM → Thiết lập → Web Form →
*Lấy mã nhúng*), 3 dòng `<input type='text' style='display: none;'>` đầu tiên:

| Biến env | Lấy từ | Giá trị |
|---|---|---|
| `MISA_WEBFORM_ID` | `name='ID'` | `998e71a2-2c0e-8b52-acc1-fee33ce4c7a3` |
| `MISA_WEBFORM_COMPANYCODE` | `name='Companycode'` | `uys4eef4` |
| `MISA_WEBFORM_KEY` | `name='FormKey'` | chuỗi 44 ký tự — **không chép vào repo**, chỉ đặt ở env |

Đặt cho **cả `Production` lẫn `test`**.

> ⚠️ **Đây là form MỚI, ID khác form cũ** `c53af301-…` của biểu mẫu tĩnh
> `sale.satarobo.vn` đã nghỉ. Đừng chép lại giá trị cũ — sẽ đổ vào nhầm collection.
>
> Thiếu env ⇒ lead **vẫn vào hệ thống Sata Robo bình thường**, chỉ bản sao sang MISA
> không đi; lỗi ghi thành `WebhookDelivery` nguồn `misa-mirror-app` trạng thái
> `FAILED` (xem **CRM → Webhook lỗi — Replay**), gửi lại được sau khi đặt env. Ghi 1
> lần cho mỗi tiến trình chứ không mỗi phiếu, để không đẩy các dòng lỗi khác ra khỏi
> danh sách.
>
> Chưa muốn đụng MISA? Tắt hẳn bằng `SystemSetting` → `intake.mirrorMisa`.

`MISA_WEBFORM_REDIRECT` để trống (mặc định trong mã đã đúng).
`MISA_WEBFORM_ALLOWURL` **đã đặt = `*`** trên cả 3 môi trường — xem §4 để hiểu
vì sao nó nằm ở env chứ không chỉ là hằng số trong mã.

> ⚠️ **Vercel giấu VĨNH VIỄN giá trị đã đánh dấu Sensitive** — `vercel env pull`
> lẫn dashboard đều trả `[SENSITIVE]`. Không có cách nào ĐỌC LẠI để đối chiếu.
> Nghi env sai thì đường duy nhất là **xoá và ghi đè** bằng giá trị lấy lại từ
> mã nhúng. Đã mất một buổi 23/08 vì tưởng đọc được.

---

## 3. Ô "Nguồn" — gõ tự do nhưng vẫn khớp MISA

Chủ dự án chốt ô này **gõ tự do**, còn MISA thì là danh sách chọn 12 giá trị. Cách
xử lý: ô trên trang có **gợi ý = đúng 12 nhãn của MISA**.

- Chọn một gợi ý (hoặc gõ trùng nhãn, không phân biệt dấu/hoa-thường) → gửi đúng
  `LeadSourceID` tương ứng.
- Gõ chữ tự do ("chị Hoa lớp 3 giới thiệu") → `LeadSourceID` để trống, **nguyên văn
  chuỗi rơi xuống ô Ghi chú** của MISA. Không mất chữ nào.

Danh sách nằm ở `MISA_LEAD_SOURCE` (`lib/lead/intake/misa-internal.ts`) — **một chỗ
duy nhất**, dùng chung cho cả gợi ý trên trang lẫn ánh xạ khi gửi. MISA đổi danh
sách thì sửa đúng mảng đó.

| id | nhãn | | id | nhãn |
|---|---|---|---|---|
| 1 | Marketing Hội Sở từ Quảng Cáo | | 8 | Ban lãnh đạo công ty |
| 2 | Review, chia sẻ, seeding từ Trung tâm | | 9 | Nguồn khác |
| 3 | KH tự đến Trung Tâm | | 10 | Marketing Hội Sở từ Tool quét KH |
| 4 | Phụ huynh giới thiệu | | 11 | Marketing Hội Sở từ Organic |
| 6 | Sự kiện | | 12 | Marketing Hội Sở từ Seeding |
| 7 | Nhân viên giới thiệu | | 13 | Cộng tác viên giới thiệu |

---

## 4. 🔴 `AllowURL` — cái bẫy đã mất nửa buổi (22/08/2026)

**MISA đối chiếu `AllowURL` ta gửi với giá trị lưu trong cấu hình form. Không khớp thì
nó VỨT phiếu — nhưng vẫn trả `302 + Location` y hệt lúc thành công.** Không mã lỗi,
không thông báo, `WebhookDelivery` sạch bong, còn bên MISA thì rỗng không.

Lần đầu dựng form v2, `AllowURL` được khai là `https://satarobo.vn/nhap-khach-hang`.
Mọi phiếu đều "gửi thành công" mà không bản ghi nào xuất hiện. Đổi cấu hình form về
`*` (giống form cũ) là chạy ngay.

⇒ **Luật:** giá trị `AllowURL` trong mã nhúng và hằng số `MISA_ALLOW_URL`
(`lib/lead/intake/misa-internal.ts`) **phải trùng nhau**. Đổi một bên thì đổi cả hai,
hoặc đặt env `MISA_WEBFORM_ALLOWURL`. Có test khoá lại giá trị này.

### Cách chẩn đoán nếu tái diễn

| Gửi gì | MISA trả | Nghĩa là |
|---|---|---|
| `ID` hoặc `FormKey` sai/thiếu | **500**, không redirect | Khoá hỏng — `WebhookDelivery` bắt được |
| Định danh đúng, `AllowURL` khớp | **302** + Location | Đã lưu |
| Định danh đúng, `AllowURL` **lệch** | **302** + Location | ⚠️ **Vứt phiếu** — không phân biệt được từ HTTP |

Tức **302 chỉ chứng minh khoá đúng, KHÔNG chứng minh đã lưu**. Muốn chắc thì mở MISA
ra nhìn — ta không có API để hỏi.

### Cách xem app THẬT SỰ gửi gì (đừng suy đoán như 22–23/08)

Mỗi lượt gửi nay ghi một dòng log, **kể cả khi thành công** — đọc bằng:

```bash
vercel logs https://test.satarobo.vn | grep misa-mirror
```

```
[misa-mirror] MISA 302 · x-request-id=1641223676 · AllowURL="*" · form=…e4c7a3
              · truong=[LastName,CustomField25,Mobile,CustomField26,CustomField22,LeadSourceID,Description]
```

Dòng này trả lời đúng 3 câu hỏi từng phải đoán: `AllowURL` app gửi là gì (ngoặc
kép hai đầu ⇒ thấy được khoảng trắng thừa), đang bắn vào form nào (6 ký tự cuối
của `ID`), và bộ trường ra sao. `x-request-id` đưa cho MISA hỗ trợ là họ tra được
log hai đầu.

⚠️ **Bài học quy trình:** `vercel logs` đọc được từ đầu. Chuỗi 22–23/08 mất nhiều
lượt redeploy chỉ vì suy luận từ mã nguồn thay vì đọc log của bản đang chạy.

---

## 5. Chỗ code liên quan

| Việc | File |
|---|---|
| Ánh xạ ô của ta → tên trường MISA + 12 nguồn | `lib/lead/intake/misa-internal.ts` |
| Gửi + xử lý hỏng (không bao giờ rollback lead) | `lib/lead/intake/misa-mirror.ts` |
| Gọi mirror sau khi đã ghi Lead | `app/(intake)/nhap-khach-hang/actions.ts` |
| Phát lại phiếu hỏng | `lib/crm/webhook-replay.ts` (`case "misa-mirror-app"`) |
| Cờ tắt/bật mirror | `SystemSetting` → `intake.mirrorMisa` |
