# BẢN NHÁP — nội dung PR `test` → `main`

> ⚠️ **Đây là bản nháp để chủ dự án đọc trước. PR CHƯA MỞ.**
> Soạn 20/09/2026. Số liệu đo trên `origin/test` = `abba6bb2`.

---

## 🔴 VIỆC PHẢI LÀM TRƯỚC KHI MỞ PR NÀY

`main` **lại đi trước `test` 3 commit** — ba PR vào thẳng `main` sau lượt gộp:

| commit | việc |
|---|---|
| `bdaf2d60` (#301) | Lớp trial: sửa tên + cột Sale/Học viên · Lead: lịch sử tương tác đầy đủ |
| `aa8b6510` (#312) | Vá cổng tạo đợt + gắn khoản đã thu cho từng con |
| `8d31e865` (#313) | Tách một khoản đã thu cho nhiều con |

Đây là lần thứ **ba** trong bốn ngày (16/09: 463 commit · 17/09: 94 · nay: 3) — đúng thứ
`NỢ-10` mô tả và `luật 13` cấm. Ghi lại để bảng giá của `NỢ-10` không bị quên.

**Tin tốt:** đo bằng `git merge-tree --write-tree origin/test origin/main` ⇒ **0 xung đột**,
dù 9 tệp cả hai bên cùng sửa (trong đó có `lib/finance/debt.ts` và `prisma/schema.prisma`).

**⚠️ Gộp sạch về VĂN BẢN không có nghĩa là đúng về NGHĨA.** `debt.ts` vừa được tái cấu trúc
thành ba trục trong lượt gộp trước; ba commit kia lại đụng "khoản đã thu cho từng con".
⇒ **Trình tự đúng:** merge `main` → `test` trước · chạy đủ bốn cổng + r7 · **rà lại
`[HT-*]`, `[OLC-*]`, `truc-a`** · rồi mới mở PR này.

---

## Tóm tắt — HAI KHỐI, hiệu lực khác nhau

| | ZaloCRM | Phần còn lại (tài chính · CRM · Lớp trial) |
|---|---|---|
| **Hiệu lực khi deploy** | **KHÔNG** — `ZALOCRM_ENABLED` mặc định TẮT | **CÓ NGAY** |
| Người dùng thấy gì | **không gì cả** | thấy ngay sau deploy |
| Bật thế nào | runbook `docs/tich-hop-zalocrm/07-runbook-bat-co-tren-prod.md` | — |

**Quy mô:** 220 commit · 616 tệp · 19 migration.

### Khối A — ZaloCRM: lên prod nhưng TẮT

Cờ tắt thì **bốn đường đều câm**, đã xác minh bằng mã (không suy từ thiết kế):

| đường | mã |
|---|---|
| Trang `/zalo-crm` | `if (!isZalocrmEnabled()) notFound();` |
| Mục sidebar | `it.flag === "zalocrm" && zalocrmEnabled` — prop mặc định `false` |
| Nút "Nhắn Zalo" | `isZalocrmEnabled() && (await checkPermission("zalocrm:use"))` |
| Webhook | cờ tắt → **404** |
| **Cron 5 phút** | `if (!isZalocrmEnabled()) return { ok: true, data: { boQua: … } }` |

🔴 **Cổng cron là thứ vừa phải VÁ trong đợt này** (`6c447230`). Trước đó route gọi thẳng hai
hàm việc và chỉ "im lặng" nhờ **vắng cấu hình** — mà `zalocrm.orgCodes` khai được từ màn
Cấu hình vận hành **không cần deploy**, nên một người khai nhầm là cron **gọi sang fork dù
cờ tắt**. Nay khoá bằng `[ZC-CRON-01/02]` (lưới hành vi, gọi thật handler).

⇒ **Rủi ro của khối A với người dùng prod: bằng không**, miễn không ai bật cờ.

### Khối B — tài chính · CRM · Lớp trial: CÓ HIỆU LỰC NGAY

Đây là phần cần đọc kỹ. Dồn nhiều nhất ở `lib/finance` (56 tệp) · `lib/payments` (35) ·
Lớp trial (23) · đơn hàng (28).

---

## Thay đổi ảnh hưởng NGƯỜI DÙNG THẬT — ai bị ảnh hưởng

| # | đổi gì | ai thấy | cần làm gì |
|---|---|---|---|
| 1 | 🔴 **Công nợ nay là số RÒNG** — trừ bút toán hoàn (`NỢ-4`) | **Kế toán**, Quản lý cơ sở | **BÁO TRƯỚC**: con số "Thực thu"/"còn nợ" sẽ đổi ở ghi danh từng có hoàn tiền |
| 2 | Màn `/cong-no` thêm **bảng đối soát hai trục** ("đã ghi nhận" ↔ "đã xác nhận") | Kế toán, QLCS | đọc thêm một bảng; ô *"chưa quy được về con"* là **bình thường**, không phải lỗi |
| 3 | **Giảm giá khai theo TỪNG DÒNG** đơn hàng, không còn ở cấp đơn | Sale, Kế toán | khuôn cũ bị **từ chối có tiếng** — cố ý, để không mất tiền im lặng |
| 4 | **Một đơn gắn NHIỀU con** (mỗi dòng một con) | Sale | bỏ nếp "hai anh em thì hai đơn" |
| 5 | Hoàn tiền: **cầu dao đã gỡ**, thay bằng lưới hẹp `canhBaoSoBuoi` | Kế toán, QLCS | lớp còn buổi **chưa chốt** ⇒ hệ thống **từ chối** đề xuất hoàn; phải đi chốt sổ buổi trước |
| 6 | Lớp trial: sửa được tên, thêm cột Sale/Học viên | Giáo vụ, Sale | — |
| 7 | Lead: lịch sử tương tác đầy đủ | Sale, QLCS | — |
| 8 | Site GV · e-learning · chấm công | GV, HR | không đổi hành vi, chỉ vá |

**Cần nói trước với người dùng:** mục **1**, **3**, **5**.
Mục 1 là quan trọng nhất — **số kế toán đối chiếu hằng tháng sẽ đổi**.

---

## 19 migration — THUẦN THÊM

Quét toàn bộ 19 tệp tìm `DROP TABLE|COLUMN` · `ALTER … DROP/RENAME/ALTER COLUMN … TYPE` ·
`TRUNCATE` · `DELETE FROM` · `UPDATE` ⇒ **0 dòng**.

Không bảng nào bị viết lại, không cột nào đổi kiểu, không dữ liệu nào bị đụng. `deploy.yml`
chạy `prisma migrate deploy` bằng `PROD_DIRECT_URL` khi push `main`.

⚠️ **Hai điều KHÔNG đảo ngược được, nói rõ trước:**

1. **`ALTER TYPE … ADD VALUE` không lăn ngược được.** Postgres **không có `DROP VALUE`**.
   Hai giá trị enum `ZALO_CA_NHAN` và `EXTERNAL_TAG` (migration
   `20260906090000_zalocrm_enum_kenh_ca_nhan`) **ở lại vĩnh viễn**, kể cả khi gỡ hẳn
   ZaloCRM. Vô hại — chỉ là giá trị không ai dùng — nhưng đừng bất ngờ.
   Lăn ngược phần còn lại thì được: `DROP` 2 bảng + 1 enum mới (thứ tự ngược).
2. Hai migration **trùng dấu thời gian** `20260826140000` (`el15c_add_sla_grace`,
   `g01_lead_customer_fields`). Prisma sắp theo **tên thư mục** nên thứ tự vẫn xác định —
   không hỏng, nhưng đừng lặp lại nếp này.

---

## ✅ SAU KHI MERGE — việc phải làm TAY

### 1. 🔴 Chạy `seed-prod-roles.yml`

**Bắt buộc, và không có gì tự làm hộ.** RBAC v2 trên prod đọc quyền từ **DỮ LIỆU**, không
từ tệp seed — merge tệp seed vào `main` **không đổi gì trên prod**.

> GitHub → Actions → **seed-prod-roles** → *Run workflow* → nhánh `main`

Quên bước này thì: người mở `/zalo-crm` (sau khi bật cờ) **bị đá ra không kèm lỗi**, và
**không tái hiện được ở local** — local chạy RBAC v1 tĩnh, prod chạy v2 động. Đây là cái
bẫy đã dính nhiều lần, ghi trong `prisma/migrations/…_zalocrm_bang_nick_thread/migration.sql`.

### 2. Báo kế toán con số đổi (mục 1 bảng trên)

Chưa có bảng CŨ/MỚI trên số thật — đó là việc còn treo, **nên làm trước khi báo**, không
phải sau.

### 3. Kiểm deploy prod bằng bản ghi gắn với SHA

```bash
gh api repos/hptkk29/satarobo-vn/commits/<sha-merge>/status --jq '.state'
```

**Đừng** đọc API `deployments` — nó đã từng trả số cũ trong khi site đã đổi (luật 12).

### 4. KHÔNG bật `ZALOCRM_ENABLED`

Runbook riêng: `docs/tich-hop-zalocrm/07-runbook-bat-co-tren-prod.md`.
Điều kiện chặn ở đầu runbook: **`NỢ-6` + `NỢ-8` phải xong trước** — nếu không, prod thành
môi trường **thứ tư** bắn vé SSO vào cùng một org fork, lần này với tài khoản nhân viên thật.

---

## Cổng đã qua (đo trên `abba6bb2`)

| | |
|---|---|
| typecheck · lint · build | ✅ 0 lỗi · 0 error · ✅ |
| `test:unit` | ✅ 10.440 xanh / 17 expected-fail |
| CI đầy đủ | ✅ **12/12 job**, gồm **R7 shard 1/2 + 2/2** trên Postgres riêng từng shard |
| bộ DB (inbox · finance · chat · nen · lead-intake · elearning) | ✅ |

⚠️ **Đính chính một câu tôi từng báo sai:** tôi nói hai shard r7 chạy ở local "trên hai
database riêng". **Sai** — `playwright.r7.config.ts` gọi
`dotenv.config({ path: ".env.test", override: true })`, tức **đè** biến truyền vào, nên cả
hai shard đều chạy trên `satarobo_test`. Chỗ thật sự tách hai database là **CI** (mỗi shard
một container Postgres). Verification đáng tin của lượt này là **CI**, không phải lượt chạy
ở máy tôi.
