# Hoán mã org về CS2 · và ĐÍNH CHÍNH: cờ prod đã BẬT từ 7 ngày trước (23/09/2026)

Hai việc trong một ngày, và việc thứ hai là một **đính chính** — câu tôi báo nhiều lần
là sai.

---

## 1. 🔴 ĐÍNH CHÍNH — `ZALOCRM_ENABLED` CHƯA BAO GIỜ TẮT TRÊN PRODUCTION

### Câu sai đã lan đi những đâu

Câu *"production: 0 biến zalocrm"* đã được tôi báo trong chat, ghi vào commit, ghi vào
mô tả PR #321, và chép vào tài liệu. **Nó sai.**

### Số đo thật (23/09/2026)

```
$ vercel env ls | grep -i zalocrm
ZALOCRM_ENABLED   Encrypted   Production, Preview, Development, test   7d ago
ZALOCRM_SSO_SECRET        Encrypted   test    7d ago
ZALOCRM_APP_URL           Encrypted   test    2d ago
ZALOCRM_BASE_URL          Encrypted   test    2d ago
ZALOCRM_API_KEYS          Encrypted   test    17m ago
ZALOCRM_WEBHOOK_SECRETS   Encrypted   test    17m ago
```

`ZALOCRM_ENABLED` là **MỘT dòng mang BỐN phạm vi**. Một dòng ⇒ **một giá trị** cho cả
bốn môi trường. `test` đang chạy được ⇒ giá trị là `"true"` ⇒ **production cũng `"true"`,
và đã như thế từ lúc biến được tạo, 7 ngày trước.**

### Đo bằng HÀNH VI, kèm đối chứng — đây mới là bằng chứng

Danh sách biến là thứ tôi đã đọc sai. Đường chạy thật thì không nói dối:

```bash
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' https://admin.satarobo.vn/zalo-crm
#  307 -> https://admin.satarobo.vn/login?callbackUrl=%2Fzalo-crm

curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' https://admin.satarobo.vn/leads
#  307 -> https://admin.satarobo.vn/login?callbackUrl=%2Fleads          ← đối chứng DƯƠNG

curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' https://admin.satarobo.vn/khong-he-co-trang-nay
#  308 -> https://satarobo.vn/khong-he-co-trang-nay                      ← đối chứng ÂM
```

`/zalo-crm` mang **đúng hình dạng của một trang CÓ THẬT** (307 về login, giống `/leads`),
không phải hình dạng của đường không tồn tại (308 canonical về `satarobo.vn`).
`app/(admin)/admin/zalo-crm/page.tsx:66` — `if (!isZalocrmEnabled()) notFound()` — nên
307 chỉ xảy ra khi cờ BẬT.

Webhook nói cùng một chuyện:

```bash
for O in prod-cs1 prod-cs2 test-cs1 khong-ton-tai; do
  curl -s -X POST -H 'Content-Type: application/json' -d '{}' \
    https://admin.satarobo.vn/api/webhooks/zalocrm/$O
done
#  cả BỐN:  503  {"ok":false,"error":"Webhook chưa cấu hình secret"}
```

`app/api/webhooks/zalocrm/[org]/route.ts:23` kiểm cờ **trước tiên** và trả `404` khi tắt.
Ra `503` ⇒ **đã qua cổng cờ**. Và một org **không tồn tại** cũng ra `503` ⇒ cổng
`ZALOCRM_WEBHOOK_SECRETS` đứng **trước** bước tra org.

### Hiện trạng production, nói thẳng

> ✅ **ĐÃ XỬ LÝ cùng ngày 23/09** — chủ dự án chốt *"khai đi"*. Bảng ngay dưới là hiện
> trạng **lúc phát hiện**, giữ lại làm bệnh án. Trạng thái CUỐI ở **mục 5** cuối tệp:
> 6/6 biến đã khai, redeploy xong, webhook thật đang chảy vào.

| | |
|---|---|
| cờ `ZALOCRM_ENABLED` | ✅ **BẬT** (7 ngày) |
| 5 biến còn lại | ❌ **KHÔNG CÓ** trên production |
| quyền `zalocrm:use` | ✅ đã seed sáng 23/09 |
| ⇒ mục sidebar "Zalo CRM" | **HIỆN** với ai có quyền |
| ⇒ bấm vào | **"Chưa khai địa chỉ giao diện Zalo CRM"** (`page.tsx:149`) |
| ⇒ webhook | `503`, **fail-closed** — không có đường rò dữ liệu |

Không có nguy cơ mất/lộ dữ liệu. Nguy cơ là **uy tín**: nhân viên thấy một mục menu dẫn
tới màn hỏng.

### ⚠️ Cái bẫy phải biết trước khi định "tắt cho xong"

Vì `ZALOCRM_ENABLED` là **một dòng bốn phạm vi**, **tắt nó là tắt luôn `test`.** Muốn
điều khiển hai môi trường độc lập thì phải **tách biến ra trước**: xoá dòng bốn phạm vi,
tạo lại thành từng dòng riêng cho từng môi trường.

> Thay đổi biến môi trường trên Vercel **không tác động tới bản đang chạy** — chỉ bản
> deploy KẾ TIẾP mới đọc giá trị mới. Nên vừa không có rủi ro tức thì, vừa **không tự
> khỏi** nếu không redeploy.

### Bài học — đúng luật 12, và lần này tôi vi phạm chính nó

**Danh sách cấu hình là TÀI LIỆU, không phải HÀNH VI.** Tôi kết luận "production không có
biến" từ một lệnh liệt kê, rồi lặp lại kết luận đó nhiều ngày qua nhiều kênh mà không một
lần gọi thử đường thật. Phép đo phủ định nó tốn **15 giây** và nằm sẵn trong bảng mã
trạng thái mà chính tôi đã viết ở `04-danh-sach-cho-nick-zalo.md`.

⇒ Câu hỏi *"cờ có bật trên môi trường X không"* trả lời bằng **`curl` + đối chứng**, không
bằng `vercel env ls`.

---

## 2. Hoán mã org — dữ liệu thật thuộc về CS2, không phải CS1

### Chỗ sai

Ba nick trong org `prod-cs1` là nick **THẬT của Cơ sở 2** (chủ dự án xác nhận 23/09):

| nick | SĐT | trạng thái | hội thoại |
|---|---|---|---|
| Satarobo - Cô Liên | 0702324055 | connected | 92 |
| Satarobo - Cô Vân | 0702193933 | connected | 108 |
| Hoàng Kiệt | 0328545229 | disconnected, **đã lưu kho từ 16/09** | 1 |

Toàn bộ **201 hội thoại · 629 contact · 8 người dùng** đang được xếp dưới tên CS1.

### Cách vá — ĐỔI MÃ, KHÔNG DI TRÚ

88 bảng mang `org_id`. Đổi `org_id` của chúng là một đợt di trú trên dữ liệu khách hàng
thật. Đổi `organizations.code` là đổi **đúng hai dòng** — và nó đủ, vì mã org chỉ được
dùng ở **một chỗ**:

```
backend/src/modules/auth/sata-sso-service.ts:183
  prisma.organization.findUnique({ where: { code: claims.orgCode } })
```

Đường API/webhook đi bằng `x-api-key` → `app_settings.public_api_key` → `org_id`, **không
qua mã**. Nên khoá **ở lại với dữ liệu** — đúng điều mong muốn.

```
org GIỮ DỮ LIỆU  (e4b4b2ff…)   prod-cs1  →  prod-cs2   + đổi tên hiển thị
org RỖNG vừa tạo (832e5fd8…)   prod-cs2  →  prod-cs1   + đổi tên hiển thị
webhook_url của cả hai: sửa theo mã mới (chuỗi có mang mã)
```

Kịch bản: `E:\zalocrm\ops\hoan-ma-org-prod.sql`. `organizations_code_key` là UNIQUE INDEX
không deferrable ⇒ phải đi qua một mã tạm, không đổi thẳng được.

### 🔴 `REPEATABLE READ` — không phải cho đẹp

Cổng chốt bản đầu đếm **số tuyệt đối** (`tổng hội thoại phải = 200`). Lượt dry-run đầu tiên
nó **báo động giả**:

```
ERROR:  Tong hoi thoai phai 200, dang 201
```

Fork **đang nhận tin thật ngay lúc chạy** — số hội thoại nhảy 200 → 201 **giữa hai phép
đếm**. Cổng đúng phải là: chụp ảnh số dòng theo từng org **đầu** giao dịch, chụp lại
**cuối**, và đòi hai ảnh **trùng khít**; chạy dưới `BEGIN ISOLATION LEVEL REPEATABLE READ`
để hai ảnh nhìn cùng một snapshot, nên mọi khác biệt **chỉ có thể do lệnh của chính mình**.

⇒ **Luật rút ra: trên bảng ĐANG SỐNG, cổng chốt theo số tuyệt đối là cổng nói dối.** Nó
đỏ khi mọi thứ đúng, và người ta sẽ học cách nới con số cho nó xanh — lúc đó cổng chết.

So sánh **hai chiều** (`EXCEPT ALL` cả hai lượt), vì một chiều bỏ lọt ca "thêm dòng mới".

### Đã cấy lỗi — hai phép, cả hai cắn ĐÚNG CHỖ

| phép cấy | cổng nổ | thông báo thật |
|---|---|---|
| gỡ hẳn bước sửa `webhook_url` | 4.5 | `webhook_url cua org prod-cs1 khong tro ve chinh no: …/prod-cs2` |
| `UPDATE conversations SET org_id = <org kia>` 1 dòng | **4.3 (vạch đỏ)** | `Co dong doi org: conversations/e4b4b2ff…: 201 \| conversations/e4b4b2ff…: 200 \| conversations/832e5fd8…: 1` |

Phép thứ hai còn chứng minh `REPEATABLE READ` làm việc: hai ảnh chụp cùng snapshot nên
lệch duy nhất là do lệnh cấy.

### Đã xác minh bằng HÀNH VI sau khi commit

Gọi API công khai của fork bằng khoá của **từng** org:

| khoá org | HTTP | nick trả về | SĐT thấy được |
|---|---|---|---|
| **`prod-cs2`** | 200 | **3** | **0702193933 · 0702324055** ← đối chứng **dương** |
| `prod-cs1` | 200 | 0 | — |
| `test-cs1` | 200 | 0 | — |
| `local-cs1` | 200 | 0 | — |

Cả bốn `200` (khoá đều hợp lệ), **khác nhau ở NỘI DUNG**. Đó mới là hình dạng đúng của
cách ly theo dữ liệu — nếu cách ly thể hiện bằng lỗi xác thực thì ta đang đo nhầm thứ.

### Hệ quả phụ đã biết, không vá

Nhật ký kiểm toán cũ (nếu có) gắn `provider = providerLogKey("prod-cs1")`
(`lib/integrations/zalocrm/nick-admin.ts:140`) nay sẽ được quy về CS1 dù là việc của CS2.
Trên production đường sinh ra chúng **chưa từng chạy được** (thiếu `ZALOCRM_API_KEYS`) nên
nhiều khả năng là 0 dòng. Không vá — chi phí lớn hơn giá trị.

### Sao lưu

`E:\zalocrm\app\backups\truoc-hoan-ma-org-20260923-152851.sql.gz` (1,8 MB, `gzip -t` đạt,
có khối `COPY public.organizations`). Lùi = khôi phục tệp này, hoặc chạy lại kịch bản với
hai mã đảo ngược.

---

## 2b. 🔴 7 tài khoản UAT/test nằm trong org giữ dữ liệu khách thật — ĐÃ TẮT

Lộ ra khi chụp ảnh "trước" cho mục 5b, không phải thứ đi tìm.

Org `prod-cs2` giữ **201 hội thoại · 629 contact** thật, và chứa 8 tài khoản. Bảy trong
số đó là tàn dư từ **trước lúc tách org**, khi mọi môi trường đổ chung một org:

| tài khoản | vai | nguồn (đọc từ `external_id`) | từng đăng nhập |
|---|---|---|---|
| `hoangphantuankiet.sr@satarobo.vn` | **owner** | tạo tay ở fork | ✅ 17/09 — **GIỮ** |
| `uat.admin@satarobo.vn` | **admin** | vé **máy dev** | ❌ |
| *(email rỗng)* UAT — Quản trị hệ thống | **admin** | vé **test** | ❌ |
| `uat.sale1@satarobo.vn` | member | vé **máy dev** | ❌ |
| `uat.giamdoc@satarobo.vn` | member | vé **test** | ❌ |
| *(email rỗng)* UAT — Tư vấn viên CS1 | member | vé **test** | ❌ |
| `sale1@chat-us05.test.local` | member | vé test | ❌ |
| `ql1@chat-us05.test.local` | member | vé test | ❌ |

Cả 7 đều **có mật khẩu** và **`is_active = true`**, hai mang vai `admin`.

**`external_id` là thứ nói ra môi trường đã ký vé** — mỗi database một thế hệ `User.id`
(luật 12): `cmtcd2…` = test · `cmtorab…` = máy dev. Đây là cách rẻ nhất để đọc lịch sử
một tài khoản fork mà không cần log.

**Đã làm (chủ dự án chốt "tất cả 7"):** hạ `is_active`, **không xoá** — xoá là mất dấu vết
ai từng được tạo ở đây. Kịch bản `ops/tat-tai-khoan-uat-prod-cs2.sql`, lùi bằng
`ops/lui-tat-tai-khoan-uat-20260923.sql` (7 dòng `UPDATE` ghim theo `id`).

· **Mốc chọn là `last_login_at IS NULL`, không phải danh sách email.** Liệt kê tay thì gõ
  nhầm một chuỗi là tắt nhầm người; mốc này tự mô tả và tự đúng.
· **Cấy lỗi:** bỏ điều kiện đó khỏi mệnh đề `UPDATE` (quét cả 8) ⇒ cổng 2.1 nổ —
  `Phai con DUNG 1 tai khoan bat, dang con 0`.
· **Cổng đóng chặt hơn tưởng:** `isActive` được kiểm trong `buildAccessPayload`
  (`backend/src/modules/auth/auth-service.ts:39`) — hàm cấp **mọi** access token, cả lúc
  đăng nhập lẫn lúc **xoay refresh token**. Nên phiên đang sống cũng chết ở lượt xoay kế
  tiếp, không chỉ chặn đăng nhập mới.

## 3. Năm org hiện có

| org | dùng cho | nick | dữ liệu |
|---|---|---|---|
| `prod-cs2` | **CS2 trên prod** | 3 (2 sống + 1 lưu kho) | 201 hội thoại · 629 contact |
| `prod-cs1` | CS1 trên prod | 0 | rỗng, chờ nick của CS1 |
| `test-cs1` · `test-cs2` | nghiệm thu trên `test` | 0 | rỗng |
| `local-cs1` | máy dev | 0 | rỗng |

Mỗi org một `public_api_key` + `webhook_secret` riêng (cổng 4.4: 5 khoá **khác nhau**).

---

## 4. Việc CÒN LẠI — cần người làm

### 4.1 Ô "Cấu hình vận hành" — ánh xạ cơ sở → org

Khoá = `Center.code` (đã đo: `CS1`, `CS2`). Đặt `zalocrm.orgCodes`:

| môi trường | giá trị |
|---|---|
| `test.satarobo.vn` | `{"CS1": "test-cs1", "CS2": "test-cs2"}` |
| `admin.satarobo.vn` (prod) | `{"CS1": "prod-cs1", "CS2": "prod-cs2"}` |
| máy dev | `{"CS1": "local-cs1"}` ← đã đúng, không đụng |

Khai qua **màn Cấu hình vận hành**, không sửa thẳng DB: đường đó ghi `updatedById` /
`updatedByName`.

### 4.2 Production — MỘT quyết định, chưa làm

Hiện trạng *hiện-nhưng-hỏng* không tự khỏi. Hai trạng thái mạch lạc:

**(A) Khai nốt 5 biến ⇒ chạy thật.** Đây là go-live: webhook bắt đầu vào, cron
`capQuyenNickZalocrm` bắt đầu ghi quyền lên fork. Phải theo đủ runbook
`07-runbook-bat-co-tren-prod.md`, **kể cả mục 5b** — phép kiểm SSO chỉ làm được đúng ngày bật.

**(B) Tắt cờ ⇒ ẩn lại.** Phải **tách biến trước** (xem bẫy ở mục 1), không thì `test` tắt theo.

Cả hai đường đều cần **redeploy** mới ăn.

### 4.3 Nick của CS1

`prod-cs1` đang rỗng. CS1 có nick riêng thì quét QR vào org đó (việc của người). Không có
thì để rỗng — không ảnh hưởng gì tới CS2.

---

## Liên quan

- `09-tach-org-theo-moi-truong.md` — NỢ-6 + NỢ-8, ba org ban đầu
- `10-no17-healthcheck-va-phep-kiem-hai-moi-truong.md` — cách ly đo bằng hành vi
- `07-runbook-bat-co-tren-prod.md` — ngày bật cờ (mục 5b)
- `04-danh-sach-cho-nick-zalo.md` — bảng mã trạng thái `401`/`404`/`200`/`503`

---

## 5. Trạng thái CUỐI ngày 23/09 — đã go-live

| | |
|---|---|
| biến env trên production | **6/6** |
| deploy | `709abbd4` → `satarobo-pitubcgfr`, aliased |
| `zalocrm.orgCodes` trên prod | `{"CS1":"prod-cs1","CS2":"prod-cs2"}` ✅ |
| webhook fork → prod | ✅ `POST /api/webhooks/zalocrm/prod-cs2` → **200** |
| cron prod → fork | ✅ `zalocrm-doi-soat` nạp được tin |
| 7 tài khoản UAT trong org dữ liệu thật | ✅ đã tắt (mục 2b) |
| mục 5b — phép kiểm SSO | ⏳ chờ người đăng nhập |

**Cách khai (dùng lại được):** giá trị đi **thẳng từ DB fork qua ống** vào `vercel env add`
— `json_object_agg` dựng JSON ngay trong Postgres — nên không giá trị nào qua màn hình hay
lịch sử shell. `ZALOCRM_SSO_SECRET` xác minh bằng `cmp` **byte-exact** với biến container
fork đang chạy, không so bằng mắt.

**Kiểm bằng hành vi, CẢ HAI chiều, mỗi chiều có đối chứng âm:**

```
trên prod :  prod-cs1 401 · prod-cs2 401 · test-cs1 404 · local-cs1 404 · org bịa 404
trên test :  test-cs1 401 · test-cs2 401 · prod-cs1 404 · prod-cs2 404 · org bịa 404
```

### ⚠️ `prisma:error` trong log KHÔNG phải lỗi

`Unique constraint failed on (channel, channelMessageId)` xuất hiện đều đặn ở cả webhook
lẫn cron. Đó là **idempotency đúng thiết kế**: `taoTinNeuChuaCo`
(`lib/inbox/ingest.ts:189`) cố ý dựa vào UNIQUE ở tầng DB thay vì "tra trước rồi ghi" —
hai lượt webhook song song đều tra thấy chưa có rồi cùng ghi, đúng cái đua mà UNIQUE sinh
ra để chặn. Hàm bắt `P2002` trả `duplicate: true`; logger của Prisma in **trước** khối
`catch`. Cả hai đường đều trả `200`, không mất tin nào.

### 🔴 Một phép đo của tôi đã SAI — ghi lại để không ai lặp

Tôi rình log fork 13 phút rồi kết luận *"cron chưa chạm tới fork"*. **Sai.** Đối chứng
dương lật nó: tôi gọi fork, nhận `HTTP 200`, mà log fork ghi **0 dòng** ⇒ **fork không ghi
log lượt gọi public API thành công**. Tôi rình một thứ chưa bao giờ được ghi.

Và mã thoát của kịch bản rình là `0` ở **cả hai** nhánh (thấy và không thấy), nên nó cũng
không phân biệt được — đúng cảnh báo *"đừng tin mã thoát, đòi dòng THẬT"*.

⇒ **Muốn biết prod có gọi fork không thì đọc `vercel logs`, đừng đọc log fork.**

