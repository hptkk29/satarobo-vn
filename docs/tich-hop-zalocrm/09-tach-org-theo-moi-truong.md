# Tách org fork theo MÔI TRƯỜNG — thi công NỢ-6 + NỢ-8 (21/09/2026)

> Điều kiện **CHẶN** của ngày bật `ZALOCRM_ENABLED` trên prod
> (`07-runbook-bat-co-tren-prod.md`). Tài liệu này ghi việc đã làm, bằng chứng đo được, và
> phần còn lại.

## Hai quyết định đã chốt trước khi tạo

NỢ-8 dặn *"quyết định trước khi tạo, đổi sau là nhân bản thêm một lượt nữa"*. Chủ dự án chốt:

| câu hỏi | chốt |
|---|---|
| Môi trường nào **sở hữu** dữ liệu thật đang có? | **PROD** |
| Đặt tên org theo kiểu nào? | **môi trường + cơ sở** (`prod-cs1`, `test-cs1`) |

**Vì sao PROD sở hữu:** một nick Zalo chỉ có **một phiên sống** — không thể vừa phục vụ test
vừa phục vụ prod. Khi Sale dùng thật thì chính hai nick này phải nằm ở prod, nên đặt chúng
đúng chỗ **ngay bây giờ** là không phải di trú vào đúng ngày go-live.

**Vì sao tên có hậu tố cơ sở:** thêm CS2 sau này chỉ là **tạo thêm** (`prod-cs2`, `test-cs2`),
không phải đổi tên cái đang có. Và nó giữ nguyên hợp đồng của `zalocrm.orgCodes` (khoá =
`Center.code`).

## Vì sao KHÔNG di trú dữ liệu — đo được

```
88 bảng có cột org_id
org cs1 đang giữ: 3 nick · 150 hội thoại · 3.567 tin nhắn · 572 contact · 8 người dùng
```

Chuyển dữ liệu giữa hai org = cập nhật `org_id` trên **88 bảng** — một cuộc di trú, không
phải thao tác đổi chỗ. Nên cách làm là **đổi TÊN** org đang có (một trường), giữ nguyên `id`.

✅ Kiểm sau khi làm: `prod-cs1` vẫn mang **đúng id cũ** `e4b4b2ff-…` ⇒ tham chiếu khoá ngoại
của cả 88 bảng còn nguyên, không một dòng nào phải sửa.

## Thiệt hại của NỢ-8 — nhìn thấy tận mắt trước khi tách

```
org | email                        | external_id     | ngày
cs1 | uat.admin@satarobo.vn        | cmtorabag00031… | 07/09   <- từ satarobo_local
cs1 | uat.sale1@satarobo.vn        | cmtorabb5000b1… | 08/09   <- từ satarobo_local
cs1 | (RỖNG)                       | cmtcd2f6f0003d… | 16/09   <- từ DB của test
cs1 | (RỖNG)                       | cmtcd2idk000bd… | 17/09   <- từ DB của test
```

Hai dòng **email rỗng** chính là `uat.admin` và `uat.sale1` đến **lần thứ hai** từ môi trường
khác. Fork ghép người theo `externalId = User.id` bên Sata, mà `User.id` chỉ duy nhất trong
phạm vi **một database** — nên cùng một người thành hai tài khoản, và tài khoản thứ hai trùng
email nên bị tạo **không có email**.

Đúng kịch bản NỢ-8 mô tả, giờ có số liệu.

## Đã làm

### 1. Fork — ba org, khoá riêng từng org

| org | tên hiển thị | nick | người dùng | `app_settings` |
|---|---|---|---|---|
| `prod-cs1` | Sata Robo - PROD (CS1) | **3** | 8 | 3 |
| `test-cs1` | Sata Robo - TEST (CS1) | 0 | 0 | 3 |
| `local-cs1` | Sata Robo - LOCAL (CS1) | 0 | 0 | 3 |

**3 `public_api_key`, cả 3 khác nhau** (kiểm bằng `count(distinct value_plain) = 3`).

Bí mật sinh **ngay trong DB** bằng `gen_random_uuid()` × 2 (64 ký tự hex) nên không bao giờ
đi qua dòng lệnh, chat hay log.

`webhook_url` theo đúng môi trường:

```
prod-cs1   https://admin.satarobo.vn/api/webhooks/zalocrm/prod-cs1
test-cs1   https://test.satarobo.vn/api/webhooks/zalocrm/test-cs1
local-cs1  http://localhost:3000/api/webhooks/zalocrm/local-cs1
```

⚠️ Từ giờ tới ngày bật cờ, webhook của `prod-cs1` trả **404 + JSON** — đúng khuôn fail-closed
đã ghi trong bảng đo ở `04`. **Không mất tin:** cron `doi-soat` nạp bù sau khi bật cờ.

Kịch bản: `E:\zalocrm\ops\tach-org-theo-moi-truong.sql` và `tao-org-local.sql`. Cả hai chạy
trong **một giao dịch có cổng tự kiểm bên trong** — sai bất kỳ điều nào thì `ROLLBACK` cả
lượt, không để lại trạng thái nửa vời. Cổng kiểm: đúng số org · khoá phải khác nhau · nick
phải **ở lại** `prod-cs1` · org mới phải **rỗng**.

### 2. Máy dev — org RIÊNG, không dùng chung với test

🔴 **Đo được trước khi sửa: `.env` của máy dev trỏ thẳng vào org `cs1`** — tức org giữ dữ
liệu thật — và `ZALOCRM_ENABLED="true"`. Chạy dev server lúc đó là bắn vé SSO vào org prod,
đẻ thêm tài khoản mồ côi vào đúng chỗ không được phép.

⚠️ **Và KHÔNG trỏ local sang `test-cs1`:** `satarobo_local` và DB của env `test` là **hai
database khác nhau**, nên cùng một email có hai `User.id` khác nhau. Cho chúng dùng chung một
org là **tái tạo y nguyên NỢ-8**, chỉ đổi cặp môi trường từ (test, prod) thành (local, test).
Đó là lý do có org thứ ba.

- `.env` → `{"local-cs1": …}` cho cả `ZALOCRM_API_KEYS` và `ZALOCRM_WEBHOOK_SECRETS`
  *(bản cũ sao lưu tại `.env.truoc-tach-org-*`; `.env*` nằm trong `.gitignore` dòng 39)*
- `SystemSetting.zalocrm.orgCodes` trên `satarobo_local` → `{"CS1": "local-cs1"}`

Giá trị cũ ở local là `{"CS1":"cs1","CS2":"cs2"}` — tức nó trỏ `CS2` vào một org **chưa từng
tồn tại**. Đúng triệu chứng NỢ-6.

### 3. Vercel env `test`

`ZALOCRM_API_KEYS` và `ZALOCRM_WEBHOOK_SECRETS` → `{"test-cs1": …}`, khoá mới hoàn toàn.
Giá trị đi **thẳng từ DB vào Vercel** trong một lệnh, không qua màn hình.

Kiểm sau khi đổi: `test` vẫn đủ **6** biến `ZALOCRM_*`, **production vẫn 0**.

Đã deploy lại môi trường `test` để env mới có hiệu lực.

## 🔴 CÒN LẠI — việc của chủ dự án

### Một ô cấu hình trên `test` (30 giây)

`test.satarobo.vn/admin/cau-hinh-van-hanh` → tab **Nâng cao** → ô
**"Ánh xạ cơ sở sang mã tổ chức ZaloCRM"** → đặt:

```json
{"CS1": "test-cs1"}
```

Ô này nằm **trong DB của từng môi trường**, không phải biến env, nên tôi không đổi hộ được.
Chưa đổi thì `test` gọi vào org `cs1` — cái tên đã không còn tồn tại — và **fail-closed**
(webhook 404, client `CHUA_CAU_HINH`). Vô hại vì `test-cs1` vốn rỗng, nhưng phải đóng lại.

### Ngày bật cờ trên prod — soạn sẵn, CHƯA khai

Khi tới ngày go-live, khai trên **Vercel env Production**:

```
ZALOCRM_API_KEYS         {"prod-cs1": "<public_api_key của prod-cs1 trong fork>"}
ZALOCRM_WEBHOOK_SECRETS  {"prod-cs1": "<webhook_secret của prod-cs1 trong fork>"}
```

và `zalocrm.orgCodes` trên DB prod → `{"CS1": "prod-cs1"}`.

Lấy hai giá trị đó từ fork, **không chép từ test**:

```sql
select s.setting_key, s.value_plain
  from app_settings s join organizations o on o.id = s.org_id
 where o.code = 'prod-cs1' and s.setting_key in ('public_api_key','webhook_secret');
```

## Phép kiểm cuối — CHƯA CHẠY ĐƯỢC

NỢ-8 bước 7 đòi: *đăng nhập cùng một người từ `test` và từ prod, xác nhận fork sinh **hai
tài khoản ở HAI org khác nhau**, và cron của môi trường này **không gỡ** quyền của môi trường
kia.*

**Chưa chạy được** vì prod chưa khai env và chưa bật cờ — đúng như chủ dự án chốt. Phép thử
này **dời sang ngày bật cờ**, và nó là một mục bắt buộc của runbook `07`.

Thứ **đã** chứng minh được hôm nay: ba org tồn tại, ba khoá khác nhau, dữ liệu thật nằm đúng
`prod-cs1`, hai org kia rỗng. Thứ **chưa** chứng minh được: hành vi khi hai môi trường cùng
bắn vé. Đừng lẫn hai điều đó.

## Ghi chú kỹ thuật đáng nhớ

⚠️ **`organizations.code` KHÔNG có ràng buộc duy nhất** và cho phép `NULL`. Hai org trùng mã
thì DB không chặn, và `zalocrm.orgCodes` sẽ trỏ vào một trong hai một cách không xác định.
Thêm org mới thì phải tự kiểm trùng — cổng tự kiểm trong hai kịch bản ở trên có làm việc đó.

⚠️ **`psql -A` vẫn in dòng `(N rows)` ở cuối.** Lấy giá trị vào biến shell bằng `tail -1` là
lấy phải dòng đó — dùng `-tA`. Đã vấp một lượt khi đọc org id.
