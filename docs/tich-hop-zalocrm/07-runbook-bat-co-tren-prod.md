# Runbook — ngày BẬT `ZALOCRM_ENABLED` trên PROD

> Viết 20/09/2026, **trước** khi đưa lên prod, cho cái ngày mà người bật sẽ không còn nhớ
> hết bối cảnh. Đọc từ trên xuống, đừng nhảy cóc.

---

## 🔴 ĐIỀU KIỆN CHẶN — đọc trước, bật sau

> ## 🔴 ĐÍNH CHÍNH 23/09/2026 — CỜ NÀY **ĐÃ BẬT** TRÊN PRODUCTION, VÀ ĐÃ BẬT 7 NGÀY
>
> Cả mục dưới đây được viết với giả định *"cờ đang tắt, ta chọn ngày bật"*. Giả định đó
> **sai**. `ZALOCRM_ENABLED` là **MỘT dòng env mang BỐN phạm vi** (Production, Preview,
> Development, test) ⇒ **một giá trị** cho cả bốn. Đo bằng hành vi:
> `admin.satarobo.vn/zalo-crm` → `307` về login (trang CÓ THẬT), webhook → `503` chứ không
> `404`. Đầy đủ ở **`11-hoan-ma-org-cs2-va-dinh-chinh-co-prod.md` mục 1**.
>
> ⚠️ Kéo theo: **tắt cờ là tắt luôn `test`** (chung một dòng). Muốn tắt riêng prod thì phải
> **tách biến ra trước**.
>
> Phần còn thiếu trên production là **5 biến kia**, không phải cái cờ.
>
> ## ✅ CẬP NHẬT 22/09 · SỬA 23/09 — ĐIỀU KIỆN CHẶN ĐÃ XONG
>
> `NỢ-6` + `NỢ-8` **đã thi công** (`09-tach-org-theo-moi-truong.md`). Nay **NĂM** org tách
> hoàn toàn, mỗi org một khoá riêng:
>
> | org | nick | dữ liệu thật |
> |---|---|---|
> | **`prod-cs2`** | **3** | **toàn bộ** (201 hội thoại · 629 contact) ← dữ liệu là của **CS2** |
> | `prod-cs1` | 0 | rỗng, chờ nick của CS1 |
> | `test-cs1` · `test-cs2` | 0 | rỗng |
> | `local-cs1` | 0 | rỗng |
>
> 🔴 Mã org **đã hoán 23/09**: org giữ dữ liệu thật nay mang mã `prod-cs2`. Lý do + bằng
> chứng ở `11-…md` mục 2. Mọi chỗ trong tệp này viết `prod-cs1` như "org của prod" đều
> phải đọc là `prod-cs2`.
>
> Đã đo **cách ly bằng hành vi** (`10-no17-…md` mục 4): `test` và `local` **không đọc được**
> hội thoại của prod (`404`), và **không ghi được** quyền lên nick của prod (`PUT …/access`
> → `404`), trong khi chính `prod-cs1` đọc được (`200` — đối chứng dương).
>
> 🔴 **CÒN ĐÚNG MỘT MẢNH, và nó chính là phép thử của ngày hôm nay:** đăng nhập SSO **từ
> prod**. Nó không làm trước được — xem **mục 5b** ở dưới.

**KHÔNG bật cờ này cho tới khi `NỢ-6` + `NỢ-8` xong.**
(`docs/hop-nhat-main-test-1609.md`, cả hai đã chốt **phương án A′: mỗi môi trường một org
riêng bên fork, không đụng lõi SSO**.)

**Vì sao đây là chặn cứng, không phải khuyến nghị:**

Fork ghép người theo `externalId = claims.sub = User.id` **bên Sata**
(`backend/src/modules/auth/sata-sso-service.ts:191`), mà `User.id` chỉ duy nhất **trong
phạm vi MỘT database**. Một org fork nhận vé từ nhiều môi trường ⇒ **cùng một người thành
nhiều tài khoản**. Đo được 17/09: **ba thế hệ id** cho cùng hai tài khoản
(`satarobo_local` · DB env `test` · Supabase DEV), bộ đếm giữa giống hệt nhau, chỉ khác vân
máy — tức ba lượt seed trên ba database.

Bật cờ trên prod khi chưa tách org là biến prod thành **môi trường thứ tư** bắn vé vào cùng
một org. Khác biệt duy nhất so với lần trước: lần này là **tài khoản nhân viên thật**, và
hậu quả không phải một buổi đi truy — mà là nhân viên mở hộp thư ra thấy tài khoản lạ,
hoặc thấy đúng tài khoản nhưng **không có nick nào**, trong khi mọi thứ "trông vẫn chạy".

**Kiểm điều kiện chặn — bằng HÀNH VI, không chạm bí mật:**

⚠️ Bản cũ ở đây bảo chạy `vercel env pull`. **Đừng.** Lệnh đó ghi **toàn bộ** biến môi
trường — gồm mọi khoá và bí mật — ra một tệp trên đĩa, chỉ để so hai cái tên org. Cái giá
lớn hơn hẳn thứ thu được, và tệp ấy rất dễ bị quên xoá.

Đo bằng chính đường thật, sau khi đã bật cờ và deploy lại:

```bash
# org CỦA PROD phải được prod biết  ->  401 (tới được bước kiểm chữ ký)
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d '{}' \
  https://admin.satarobo.vn/api/webhooks/zalocrm/prod-cs1

# org CỦA TEST phải là NGƯỜI LẠ với prod  ->  404
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d '{}' \
  https://admin.satarobo.vn/api/webhooks/zalocrm/test-cs1
```

| kết quả | nghĩa |
|---|---|
| `prod-cs1` → **401**, `test-cs1` → **404** | ✅ hai môi trường tách đúng |
| `test-cs1` → **401** | 🔴 **DỪNG** — prod đang nhận khoá của test, đúng thứ `NỢ-8` cấm |
| `prod-cs1` → **404** | cờ chưa bật, hoặc `ZALOCRM_WEBHOOK_SECRETS` chưa khai org `prod-cs1` |
| `200` + HTML | sai đường dẫn, không phải chuyện cờ |

Khuôn mã trạng thái này là khuôn đã dùng suốt: `401`+JSON = route có + org đã khai ·
`404`+JSON = org lạ hoặc cờ tắt · `200`+HTML = sai đường (`04-danh-sach-cho-nick-zalo.md`).

Phép đo tương đương đã **chạy thật trên `test` ngày 22/09** và cho đúng cặp `401` / `404`.

---

## 1. Bật ở đâu

`ZALOCRM_ENABLED` là **biến môi trường Vercel**, không phải tham số vận hành trong DB.

- Vercel → project `satarobo-vn` → **Settings → Environment Variables**
- Thêm/sửa `ZALOCRM_ENABLED` = `true`, **scope: Production**

⚠️ Phải **đúng chuỗi `true`** viết thường. Mã là `process.env.ZALOCRM_ENABLED === "true"`
(`lib/flags.ts:361`) nên `"True"` · `"TRUE"` · `"1"` · `"yes"` · `" true "` đều là **TẮT** —
cố ý, và có lưới khoá trong `lib/flags.test.ts`. Gõ gần đúng rồi tưởng đã bật là ca đã lường.

## 2. Có phải Redeploy không — **CÓ, BẮT BUỘC**

Biến môi trường chỉ được đọc lúc **khởi động tiến trình**. Đổi biến mà không deploy lại thì
bản đang chạy vẫn mang giá trị cũ.

> Vercel → Deployments → bản Production mới nhất → **⋯ → Redeploy**
> (không cần commit mới; **bỏ tick** *Use existing Build Cache* cho chắc)

**Tắt khẩn** = đặt lại `false` (hoặc xoá biến) + **Redeploy**. Không revert code, không lăn
ngược migration: chữ đã nhận nằm ở bảng `Inbox*` nên tắt trục ZaloCRM **không mất lịch sử
hội thoại**.

## 3. Cron bắt đầu chạy lúc nào

Khe `/api/cron/zalocrm-doi-soat` khai trong `vercel.json`, chạy **5 phút một lượt** và
**đã chạy sẵn từ lúc code lên `main`** — nhưng trước khi bật cờ nó **no-op**:

```ts
// app/api/cron/zalocrm-doi-soat/route.ts
if (!isZalocrmEnabled()) {
  return { ok: true, data: { boQua: "ZALOCRM_ENABLED tắt — không gọi mạng, không đọc DB" } };
}
```

Khoá bằng `[ZC-CRON-01/02]` (lưới HÀNH VI, gọi thật handler). Nên:

> **Lượt cron đầu tiên có tác dụng = lượt 5-phút đầu tiên SAU khi Redeploy xong.**
> Tức chậm nhất ~5 phút kể từ lúc bản mới nhận traffic. Không cần bấm gì thêm.

## 4. 🔴 Lượt đối soát ĐẦU TIÊN sẽ THAY CẢ TẬP QUYỀN

Đây là phần dễ gây hoảng nhất, nên đọc kỹ trước khi bật.

`capQuyenNickZalocrm` gọi `PUT /api/public/zalo-accounts/:id/access` — endpoint này **thay
cả tập**, không phải "thêm một người":

```ts
// lib/integrations/zalocrm/client.ts
// 🔴 THAY CẢ TẬP, không phải "thêm một người": ai không có trong `externalIds` sẽ BỊ GỠ
```

**Hệ quả cụ thể:** nếu trước đó có ai **gán tay** quyền dùng nick trong giao diện fork
("Đội ngũ chia sẻ"), thì **lượt cron đầu tiên sẽ GỠ họ ra**, trừ khi họ cũng nằm trong tập
mà Sata tính ra.

Tập Sata tính ra = `nguoiDuocDungNick(centerCode)`:
· vai `CENTER_MANAGER` · `CENTER_SALES_CSM` · `SALES_CSM`
· neo tại **đúng cơ sở** của org (`UserOrgRole`, `status = ACTIVE`, còn hiệu lực theo ngày)
· tài khoản còn sống (`isActive`, chưa xoá mềm)

⚠️ Đây **là chủ đích**, không phải bug: vế GỠ (nghỉ việc, chuyển cơ sở, đổi vai) là vế không
ai nhớ làm tay, và hỏng thì **không có triệu chứng** — người không còn phận sự vẫn đọc được
chat của khách.

**Việc phải làm TRƯỚC khi bật:** hỏi người vận hành fork *"đã gán tay quyền nick cho ai
chưa?"*. Có thì đối chiếu danh sách đó với ba vai trên. Ai không thuộc ba vai ⇒ **sẽ mất
quyền**, và cách đúng là **gắn `UserOrgRole` bên Sata**, không phải gán tay lại bên fork
(gán tay sẽ bị gỡ lại sau 5 phút).

## 5. Kiểm nhanh "nó đã ăn chưa" — ba phép, 2 phút

| # | làm gì | ĐẠT khi |
|---|---|---|
| 1 | Đăng nhập admin bằng vai **SALE** hoặc **QLCS** → nhìn sidebar | **CÓ** mục "Zalo CRM" |
| 2 | Mở `/zalo-crm` | Khung nhúng lên; khối **PHẠM VI XEM** hiện **≥ 1 nick** |
| 3 | Gọi thử đường webhook | `curl -s -o /dev/null -w "%{http_code}" -X POST https://admin.satarobo.vn/api/webhooks/zalocrm/<org>` → **401** |

Bảng đọc mã trạng thái (`04-danh-sach-cho-nick-zalo.md`):

| mã | nghĩa |
|---|---|
| **401** + JSON | route CÓ + cờ **BẬT** ✅ *(401 vì thiếu chữ ký — đúng)* |
| **404** + JSON | cờ vẫn **TẮT** ⇒ chưa Redeploy, hoặc gõ sai giá trị |
| **200** + HTML | sai đường dẫn, không phải chuyện cờ |

⚠️ **Đừng lấy 401 làm bằng chứng bản MỚI đã lên** — 401 cũng đúng với bản cũ nếu cờ từng
bật. Muốn chắc bản nào đang chạy thì đọc **bản ghi gắn với SHA**:
`gh api repos/hptkk29/satarobo-vn/commits/<sha>/status` (luật 12). API `deployments` **đã
từng trả số cũ** — không dùng nó.

Phép 2 không thấy nick nào mà **phép 1 và 3 đều đạt** ⇒ chưa tới lượt cron 5 phút, hoặc
org của môi trường đó **chưa có nick nào** (`CHUA_CO_NICK` — vô hại, không phải lỗi).

## 5b. 🔴 PHÉP KIỂM CUỐI CỦA `NỢ-8` — chỉ làm được HÔM NAY

Đây là mảnh duy nhất của `NỢ-8` không đo trước được. Mọi phần khác đã đo xong ngày 22/09
(`10-no17-…md` mục 4). **Làm ngay trong ngày bật**, đừng để sang hôm sau.

**Tiền đề:** một người đã từng đăng nhập `/zalo-crm` **từ `test`** — nên bên fork họ đã có
một tài khoản trong org `test-cs1`.

**Các bước:**

1. **Cùng người đó** đăng nhập `admin.satarobo.vn` → mở `/zalo-crm`.
2. Đọc tiêu đề khung nhúng: phải là **`Sata Robo - PROD (CS1)`**.
3. Đếm tài khoản bên fork:

```sql
-- chạy trong container DB của fork
select o.code, coalesce(u.email,'(rỗng)') as email, left(u.external_id,14) as ext
  from users u join organizations o on o.id = u.org_id
 order by u.created_at desc limit 5;
```

**ĐẠT khi:** cùng một `external_id` xuất hiện ở **hai dòng, hai org khác nhau**
(`test-cs1` và `prod-cs1`).

🔴 **TRƯỢT — DỪNG VÀ TẮT CỜ NGAY khi:** chỉ có **một** dòng và org của nó là `test-cs1`.
Nghĩa là vé của prod đang rơi vào org của test — đúng thứ `NỢ-8` cấm, và hậu quả là cron
hai môi trường **gỡ quyền của nhau**, Sale mất quyền đọc nick giữa ca làm việc.

**Phép kiểm thứ hai, chạy sau lượt cron đầu (≤ 5 phút):** mở lại `/zalo-crm` **từ `test`**
và xác nhận nó **không mất** nick nào. Cron của prod vừa chạy `PUT …/access` — nếu nó với
được sang org của test thì đây là chỗ lộ ra.

⚠️ Khung nhúng có thể giữ **tiêu đề cũ trong bộ nhớ đệm trình duyệt** (đã gặp 22/09: tiêu
đề hiện `PROD` trong khi phiên thật nằm ở `test-cs1`). Thân trang mới nói thật — và câu
trả lời chắc chắn nhất là truy vấn SQL ở trên, không phải tiêu đề.

## 6. Sau khi bật — hai việc trong ngày đầu

1. **Đọc nhật ký tích hợp**: `/admin/tich-hop` lọc `ZALOCRM:*`. Bộ đối soát **chỉ ghi khi
   có thay đổi hoặc có lỗi** — lượt sạch thì im lặng, nên **bảng trống là tin tốt**.
2. **Hỏi lại người trực sau vài giờ**: hộp thư có tin không, gửi được không. Điểm mù đã
   biết: nick bị Zalo khoá thì fork báo `DISCONNECTED` nhưng Sata không tự kêu — cảnh báo
   "báo connected nhưng im lâu" dựa trên `zalocrm.idleAlertHours`.

---

## Liên quan

- `docs/hop-nhat-main-test-1609.md` — `NỢ-5` (cron trên `test`) · `NỢ-6` · `NỢ-7` · `NỢ-8` · `NỢ-9`
- `docs/tich-hop-zalocrm/04-danh-sach-cho-nick-zalo.md` — bảng đọc mã trạng thái
- `docs/tich-hop-zalocrm/05-nghiem-thu-vai-tren-test.md` — nghiệm thu 8 ca trên `test`
- `docs/tich-hop-zalocrm/06-nghiem-thu-ngan-sau-gop-109.md` — bản rút gọn sau lượt gộp
