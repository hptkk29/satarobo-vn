# Danh sách nghiệm thu chờ nick Zalo (việc 9.16) — chạy trong 30 phút

> Viết 16/09/2026. **Không có mã mới ở đây.** Mọi thứ dưới đây đã code xong và đã xanh ở
> CI; cái duy nhất còn thiếu là một nick Zalo thật, nên không thể bấm.
>
> Mỗi mục ghi đúng ba thứ: **bấm ở đâu · nhìn cái gì · thế nào là đạt**. Mục nào hỏng thì
> đọc dòng "hỏng thì xem đâu" ngay dưới — đó là chỗ đã biết trước là sẽ hỏng, không phải
> đoán.

---

## 0. Chuẩn bị — làm TRƯỚC khi bấm đồng hồ (~10 phút, không tính vào 30)

| # | Việc | Đạt khi |
|---|---|---|
| 0.1 | SIM công ty đã lắp, đã đăng ký được tài khoản Zalo, đăng nhập được trên điện thoại | Mở app Zalo bằng SIM đó, vào được |
| 0.2 | Máy chủ fork đang chạy và ra được Internet | Mở `<APP_URL>/health` thấy `ok` |
| 0.3 | `webhook_secret` của org `cs1` bên ZaloCRM đã đặt, `webhook_url` trỏ về `https://test.satarobo.vn/api/webhooks/zalocrm/cs1` (**có mã org ở cuối**) | Xem ở màn cấu hình org của fork |
| 0.4 | `ZALOCRM_ENABLED=true` trên Vercel environment `test` và đã deploy lại | Mở `test.satarobo.vn/admin/tich-hop`, mục **ZaloCRM (nick Zalo cá nhân)** hiện nhãn **"Đang bật"**, không phải "Đang tắt (ZALOCRM_ENABLED)" |

**Dò cờ trong 5 giây, không cần đăng nhập** (đo thật 16/09/2026 — `test` đã trả 401):

```bash
curl -s -i -X POST https://test.satarobo.vn/api/webhooks/zalocrm/cs1 \
  -H "Content-Type: application/json" -d '{"probe":true}'
```

| Mã trả về | Nghĩa |
|---|---|
| **401** + `{"ok":false,"error":"Chữ ký không hợp lệ"}` | ✅ đường đúng, **cờ đã BẬT**. Đây là kết quả mong muốn |
| **404** + `{"ok":false,"error":"Not found"}` | đường đúng nhưng **cờ đang TẮT** (hoặc chưa deploy lại sau khi thêm biến) |
| **200** + HTML | **sai đường** — route không tồn tại, Next trả trang không-tìm-thấy với mã 200. Kiểm lại `/api/webhooks/zalocrm/<orgCode>` |

> ⚠️ **200 không phải là đạt.** Đường sai trả 200 chứ không trả 404 — đo được trên prod
> (`X-Matched-Path: /_not-found`). Ai quen coi 2xx là tốt sẽ đọc nhầm đúng chỗ này.

> ⚠️ **Đường hầm Cloudflare đổi địa chỉ mỗi lần khởi động lại.** Nếu fork đang chạy sau
> `cloudflared tunnel --url` thì mỗi lần dựng lại máy chủ là phải sửa lại `APP_URL` bên
> fork **và** `ZALOCRM_BASE_URL` trên Vercel. Triệu chứng khi quên: webhook 404 hoặc khung
> nhúng trắng, không có lỗi nào đọc được. Đây là lý do §7.1 đòi máy chủ cố định (việc 9.17).

---

## 1. Danh sách 30 phút

### ① Nối nick bằng SIM công ty — 3 phút
- **Bấm ở đâu:** giao diện fork → **Kết nối nick** → hiện mã QR.
- **Làm gì:** mở Zalo trên điện thoại lắp SIM công ty → quét mã.
- **Đạt khi:** danh sách nick bên fork hiện nick mới, trạng thái `connected`.
- *Hỏng thì xem đâu:* mã QR hết hạn rất nhanh — bấm tạo lại, đừng quét mã cũ.

### ② Sata kéo được nick về — 2 phút
- **Bấm ở đâu:** `test.satarobo.vn/admin/tich-hop` → mục **ZaloCRM (nick Zalo cá nhân)** → nút **"Đồng bộ nick"**.
- **Nhìn cái gì:** bảng nick ngay dưới nút.
- **Đạt khi:** đúng một dòng · cột trạng thái ghi **"Đang nối"** · **cột người sở hữu CÓ TÊN, không được rỗng**.
- *Hỏng thì xem đâu:* **cột người sở hữu rỗng là lỗi đã biết và đã vá hai đầu** (fork trả
  thêm `owner.externalId`, Sata cố ý bỏ `ownerUserId`). Rỗng lại ⇒ máy chủ fork đang chạy
  bản CŨ, chưa có F4. Trạng thái ra **"Chưa rõ"** nghĩa là nick mới tạo chưa quét mã xong —
  khác hẳn "Mất kết nối".

### ③ Chuông "báo nối mà im lặng" phải KÊU — 1 phút
> Mục này kiểm cái chuông, không kiểm cái nick. Phải làm **ngay sau ②**, trước khi có tin nào.

- **Nhìn cái gì:** ngay trên bảng nick, khối cảnh báo nền đỏ.
- **Đạt khi:** khối đỏ **hiện lên**, ghi tên nick kèm **"CHƯA TỪNG nhận được sự kiện nào"**.
- **Vì sao đây là ĐẠT chứ không phải lỗi:** nick vừa nối nên đúng là chưa có sự kiện nào.
  Chuông này sinh ra để bắt ca nguy hiểm nhất của cả trục — nick báo xanh mà webhook chưa
  cắm, khách vẫn nhắn, không ai nhận, Sale kết luận "dạo này vắng khách".
- *Không thấy khối đỏ:* chuông hỏng. Đây là lỗi nặng hơn cả nick không nối được, vì nó
  làm mọi mục sau đó mất lưới an toàn.

### ④ Tin VÀO — 3 phút
- **Làm gì:** lấy **điện thoại cá nhân** (số chưa từng có trong hệ thống) nhắn vào nick công ty: `Test 1`.
- **Bấm ở đâu:** `test.satarobo.vn/admin/zalo-crm`.
- **Đạt khi:** hội thoại hiện trong danh sách bên trái, thấy đúng chữ `Test 1`.
- **Rồi quay lại `/admin/tich-hop`, bấm Đồng bộ nick:** khối đỏ ở mục ③ **phải biến mất**.
- *Hỏng thì xem đâu:* mở **Nhật ký** ngay trong mục ZaloCRM đó.
  - `401` = lệch `ZALOCRM_WEBHOOK_SECRETS` với secret bên fork.
  - `404` = **cờ `ZALOCRM_ENABLED` đang tắt**, không phải sai đường.
  - **Nhật ký trống trơn** = webhook chưa gọi tới Sata lần nào. Chạy phép dò ở mục 0.4:
    ra **200 + HTML** là `webhook_url` bên fork ghi sai đường; ra 401 mà nhật ký vẫn trống
    thì fork chưa gửi — xem lại đường hầm.

### ⑤ Tin RA — 2 phút
- **Bấm ở đâu:** trong khung chat ở `/admin/zalo-crm`, gõ `Chào anh/chị` → Gửi.
- **Đạt khi:** điện thoại cá nhân **nhận được tin thật**.
- *Hỏng thì xem đâu:* fork trả `400 chưa kết nối` nghĩa là nick rớt giữa chừng — quét lại QR.

### ⑥ B1 — gửi lại cùng một câu — 1 phút
- **Làm gì:** trong chính hội thoại đó, gõ `Dạ vâng ạ` → Gửi. Rồi gõ **y hệt** `Dạ vâng ạ` → Gửi lần nữa.
- **Đạt khi:** **cả hai tin đều tới điện thoại**, không có tin nào bị nuốt, không báo trùng.
- **Vì sao phải kiểm:** đây là lỗi B1 có sẵn trên `test` — bản cũ băm nội dung tin làm khoá
  chống trùng, nên câu xã giao lặp lại (mà Sale nói suốt ngày) bị coi là gửi trùng và mất
  câu thứ hai.

### ⑦ Nút "Nhắn Zalo" trên phiếu — 4 phút
- **Bấm ở đâu:** `/admin/leads` → mở một phiếu **thuộc CS1** → cạnh số điện thoại có nút **"Nhắn Zalo"**.
- **Nhìn cái gì:** thanh địa chỉ sau khi bấm.
- **Đạt khi:** URL có **`?org=cs1`** (đúng cơ sở của phiếu, không phải cơ sở đầu bảng chữ cái) và có `&lead=<id>`.
- **Rồi:** sửa số điện thoại của phiếu đó thành **số điện thoại cá nhân vừa nhắn ở ④**, nhắn
  thêm một tin `Test 2` từ điện thoại.
- **Đạt khi:** hội thoại **tự nối vào phiếu** — mở lại phiếu thấy lịch sử tin.
- *Hỏng thì xem đâu:* thiếu `?org=` ⇒ `zalocrm.orgCodes` chưa khai `CS1`. Có `?org=` mà
  không nối ⇒ xem bảng `ZaloCrmThread`; hiện **không có màn nào xem bảng này** (nợ #5), phải tra DB.

### ⑧ B3 — trùng số nhưng khác cơ sở thì KHÔNG nối — 3 phút
- **Làm gì:** tạo một phiếu ở **CS2** mang **đúng số điện thoại cá nhân đó**. Nhắn thêm `Test 3`.
- **Đạt khi:** tin mới vẫn nối vào **phiếu CS1**, phiếu CS2 **không** có tin nào.
- **Vì sao phải kiểm:** trước vá B3, trùng số là kéo hội thoại sang cơ sở khác — rò dữ liệu
  khách giữa hai cơ sở.

### ⑨ B2 — nhận việc rồi cơ sở khác mất thấy — 3 phút
- **Làm gì:** đăng nhập một Sale **CS1**, mở `/admin/zalo-crm`, bấm **nhận việc** hội thoại đó.
- **Rồi:** đăng nhập một Sale **CS2**, mở `/admin/zalo-crm`.
- **Đạt khi:** hội thoại đó **không còn** trong danh sách của Sale CS2.
- **Báo trước cho người nghiệm thu:** đây là **thay đổi hành vi có chủ đích** (vá B2 bịt rò
  chéo cơ sở), không phải lỗi mới.

### ⑩ Cron tự cấp quyền nick — 5 phút chờ

> ⚠️ **Trên `test`, Vercel Cron KHÔNG chạy** (custom environment). Cron của ZaloCRM được
> bơm bằng `.github/workflows/cron-pump-test.yml`, nhịp ~5 phút. **Không muốn chờ thì kích tay:**
>
> ```bash
> gh workflow run cron-pump-test.yml
> ```
>
> Lệnh này cũng chạy kèm job đối soát OrgUnit ban đêm — vô hại, nó idempotent.
> (Nhắc để khỏi tưởng cron hỏng: trước 16/09/2026 `zalocrm-doi-soat` **không** nằm trong
> danh sách bơm, nên mục ⑩ và ⑪ sẽ không bao giờ đạt trên `test`. Đã vá.)

- **Làm gì:** lấy một Sale CS1 **chưa từng mở ZaloCRM**. Cho đăng nhập `test.satarobo.vn`, mở `/admin/zalo-crm`.
- **Lần đầu có thể TRỐNG** — đúng như thiết kế, cron chưa chạy.
- **Chờ tối đa 5 phút**, tải lại trang.
- **Đạt khi:** Sale đó thấy **đúng nick CS1** và **gửi được tin** trên nick đó.
- *Hỏng thì xem đâu:* quá 5 phút vẫn trống ⇒ xem nhật ký cron `zalocrm-doi-soat`. Người đó
  **chưa từng đăng nhập ZaloCRM** thì bên kia chưa có tài khoản — đếm vào `chuaCoTaiKhoan`,
  **không phải lỗi**, bảo họ mở `/admin/zalo-crm` một lần rồi chờ lượt cron sau.

### ⑪ Vế GỠ quyền — 5 phút chờ *(mục dễ quên nhất, và hỏng câm)*
- **Làm gì:** vào `/admin/nhan-su` gỡ Sale vừa thử ở ⑩ khỏi CS1 (đổi cơ sở, hoặc đặt ngày
  hết hiệu lực, hoặc khoá tài khoản).
- **Chờ tối đa 5 phút.**
- **Đạt khi:** Sale đó mở `/admin/zalo-crm` **không còn thấy nick CS1** và **gửi không được**.
- **Vì sao phải bấm tay dù đã có test khoá hành vi:** cấp thì ai cũng nhớ, gỡ thì không —
  vì gỡ hỏng **không có triệu chứng**: mọi thứ vẫn chạy, chỉ là một người không còn phận sự
  vẫn đọc được chat của khách.

---

## 2. Làm nốt nếu còn thời gian (không nằm trong 30 phút)

| # | Việc | Đạt khi |
|---|---|---|
| ⑫ | **F5 — nút "Tạo lead" trong chat.** Trong khung thông tin liên hệ bên phải của chat. | Sata nhảy sang trang nhập khách, **đã điền sẵn** số điện thoại + tên lấy từ hội thoại |
| ⑬ | **Lưới bù tin.** Tắt đường hầm 2 phút, nhắn 1 tin, bật lại, chờ ≤5 phút (hoặc `gh workflow run cron-pump-test.yml`). | Tin tự về, không phải bấm gì |
| ⑭ | **Báo cáo phản hồi.** `/admin/bao-cao/phan-hoi-hop-thu`. | Có số liệu, không trống |

---

## 3. Những thứ KHÔNG kiểm được dù đã có nick — nói trước để khỏi ghi là "sót"

1. **CS2 chạy song song.** Việc 9.16 chỉ cấp **một** SIM cho org TEST. Mục ⑧ và ⑨ dùng
   phiếu/tài khoản CS2 nhưng **vẫn trên nick CS1** — đủ để kiểm luật cách ly, **không** đủ
   để kiểm hai nick hai cơ sở chạy cùng lúc. Cần SIM thứ hai.
2. **`sata:open-lead`** (mở phiếu đã có từ trong chat) — chỗ dựa đã có (`Contact.externalRef`
   của F4) nhưng **chưa nối dây**. Không có gì để bấm.
3. **Gửi ảnh / tin thoại.** `Permissions-Policy` của Sata đang tắt camera+mic cho cả iframe
   con; mở ra là **sửa header trong `next.config.ts`**, tức là code mới — ngoài phạm vi.
4. **ZNS thật.** Vẫn `SIMULATED` trên `test` như mọi khi, không liên quan nick cá nhân.
5. **Khoá nick do Zalo.** Rủi ro đã ghi ở §8 và đã ký nhận ở việc 9.15. Không có cách kiểm chủ động.
6. **`tests/e2e/a0/zalocrm-gate.spec.ts` ba ca "cờ BẬT"** (nợ #1) — chạy lần đầu ở đây,
   không phải ở CI. Đỏ ở lượt này là bình thường-có-thể-xảy-ra, không phải hồi quy.

---

## 4. Sau khi cả 11 mục xanh

1. Ghi kết quả vào biên bản nghiệm thu (`nghiem-thu-zalocrm.html`) — cổng B chuyển sang Đạt.
2. PR `test` → `main`.
3. 🔴 **Chạy tay `.github/workflows/seed-prod-roles.yml`.** `zalocrm:use` là key MỚI; quên
   seed thì trên prod người mở `/zalo-crm` bị đá về dashboard **không kèm lỗi**, và **không
   tái hiện được ở local** (local chạy RBAC v1 tĩnh, prod chạy v2 động). Đây là lỗi đã dính
   nhiều lần.
4. Lặp lại thứ tự bật §4.3 cho môi trường prod — **không đảo được**: secret bên ZaloCRM →
   `ZALOCRM_WEBHOOK_SECRETS` → `zalocrm.orgCodes` → **sau cùng** mới `ZALOCRM_ENABLED`.
   Bật cờ muộn **không mất tin** — ZaloCRM giữ outbox và thử lại khi thấy mã không phải 2xx.
