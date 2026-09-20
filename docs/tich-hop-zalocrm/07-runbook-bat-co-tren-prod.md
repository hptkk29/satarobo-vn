# Runbook — ngày BẬT `ZALOCRM_ENABLED` trên PROD

> Viết 20/09/2026, **trước** khi đưa lên prod, cho cái ngày mà người bật sẽ không còn nhớ
> hết bối cảnh. Đọc từ trên xuống, đừng nhảy cóc.

---

## 🔴 ĐIỀU KIỆN CHẶN — đọc trước, bật sau

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

**Kiểm điều kiện chặn bằng lệnh, không bằng trí nhớ:**

```bash
# Trên Vercel: env Production và env test PHẢI trỏ hai org KHÁC NHAU.
vercel env pull .env.prod-check --environment=production
vercel env pull .env.test-check --environment=test
# So TÊN ORG (khoá của JSON), KHÔNG in giá trị khoá API ra:
node -e "const j=s=>Object.keys(JSON.parse(require('fs').readFileSync(s,'utf8').match(/ZALOCRM_API_KEYS=\"?(.*?)\"?\n/s)[1]));console.log('prod:',j('.env.prod-check'),'test:',j('.env.test-check'))"
rm .env.prod-check .env.test-check
```

Hai danh sách **giao nhau ở bất kỳ org nào ⇒ DỪNG**, chưa bật.

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
