# Runbook — dựng bucket R2 riêng cho media lớp (từ đầu)

**Áp dụng cho:** quyết định **B8** (24/08/2026) — tách media lớp khỏi bucket công khai, làm **ngay
trong đợt F**, khoá **trước SL-02** vì nó quyết định object key.

**Người làm:** người có quyền Cloudflare của Sata Robo + quyền sửa env trên Vercel.
**Thời gian:** ~20 phút. **Không cần dev viết code** cho các bước 1→6.

> ⚠️ **Bước dễ quên nhất là bước 5 (CORS).** Thiếu nó thì server vẫn trả 200 kèm link ký sẵn,
> nhưng trình duyệt bị chặn ở lúc tải file lên — **tính năng chết câm, người dùng chỉ thấy chữ
> "Lỗi"**, và **không cổng test nào bắt được**. Đây là sự cố có thật ngày 10/08/2026 với bucket ảnh
> chat (`docs/chat-realtime/nghiem-thu-tay-2026-08-10.md` §3). Đừng lặp lại.

---

## 0. Vì sao phải có bucket riêng, không dùng bucket đang có

Bucket hiện tại `satarobo-uploads` **gắn custom domain** `cdn.satarobo.vn` (`R2_PUBLIC_URL`). Nghĩa là
mọi file trong đó **tải được vô danh** chỉ bằng cách ghép `https://cdn.satarobo.vn/<key>` — không cần
đăng nhập, không cần link ký.

Với ảnh/video lớp học — ảnh trẻ em — điều đó làm **mọi biện pháp khác thành hình thức**: link ký sẵn
có hạn 5 phút là vô nghĩa nếu người nhận chỉ cần cắt lấy phần key rồi ghép vào tên miền công khai.

Vì vậy: **cùng tài khoản R2, cùng khoá truy cập, khác bucket.** Đúng khuôn đã làm cho ảnh chat
(`lib/storage/chat-storage.ts:20-28`).

---

## 1. Tạo bucket trên Cloudflare R2

1. Đăng nhập [dash.cloudflare.com](https://dash.cloudflare.com) bằng tài khoản Cloudflare của Sata Robo.
2. Cột trái → **R2 Object Storage** → **Overview**.
3. Bấm **Create bucket**.
4. **Bucket name:** `satarobo-class-media`
5. **Location:** để **Automatic** (hoặc chọn **Asia-Pacific** nếu có tuỳ chọn).
6. **Default storage class:** **Standard**.
7. Bấm **Create bucket**.

🔴 **Ba điều TUYỆT ĐỐI KHÔNG làm với bucket này:**

| Không làm | Vì sao |
|---|---|
| Không bật **Public Access** (Settings → Public access → r2.dev) | Bật là ai cũng tải được, đúng thứ đang tránh |
| Không gắn **Custom Domain** | Gắn domain là link ký sẵn thành vô nghĩa |
| Không đặt tên trùng `satarobo-uploads` | Code **từ chối** và trả 503 nếu trùng — cố ý chặn tại cấu hình |

Sau khi tạo, vào **Settings** của bucket kiểm lại: mục **Public access** phải ghi **Not allowed** /
không có domain nào.

---

## 2. 🔴 Khoá truy cập — ĐO TRƯỚC, đừng giả định

> ⚠️ **Bản đầu của runbook này viết SAI ở đúng chỗ đây.** Nó nói "token R2 dạng account-level mặc
> định áp cho mọi bucket, nên thường không cần làm gì". **Đo thật ngày 26/08/2026 cho thấy ngược
> lại:** token trong `.env.local` là token **giới hạn theo bucket** — đọc/ghi được `satarobo-test`
> và `satarobo-chat`, nhưng **`AccessDenied`** với `satarobo-uploads` lẫn `satarobo-class-media`,
> và `ListBuckets` cũng bị từ chối.

**Đo bằng một lệnh:**

```bash
pnpm exec tsx scripts/probe-r2-access.ts satarobo-class-media
```

Lệnh này **chỉ đọc** (ListObjects + ListBuckets), không ghi gì. Nó đọc `.env.local`.

**Đọc kết quả:**

| Kết quả | Nghĩa | Làm gì |
|---|---|---|
| ✅ mọi bucket chạm được | Token đủ | Đi tiếp bước 3 |
| ❌ bucket mới `AccessDenied`, bucket cũ ✅ | Token **không gồm** bucket mới, **hoặc** bucket chưa tồn tại | Xem hai bước dưới |
| `ListBuckets bị từ chối` | Token **giới hạn theo bucket** | **Mọi bucket mới đều phải thêm vào token** |

⚠️ **R2 trả `AccessDenied` cho CẢ HAI ca** — "bucket chưa tồn tại" và "token không có bucket này" —
nên không phân biệt được bằng thông báo lỗi. Mở Cloudflare → R2 → nhìn danh sách bucket để biết.

### 2a. Nếu bucket chưa tồn tại → quay lại bước 1.

### 2b. Nếu bucket đã có nhưng token không chạm được → cấp lại token

Cloudflare → **R2** → **Manage R2 API Tokens** → **Create API token**:

1. **Token name:** ví dụ `satarobo-app-rw-2026`
2. **Permissions:** **Object Read & Write** *(đủ cho ứng dụng)*
3. **Specify bucket(s):** chọn **tất cả** bucket ứng dụng dùng — `satarobo-uploads`,
   `satarobo-chat`, **`satarobo-class-media`** (và `satarobo-test` cho môi trường test).
   Hoặc chọn **Apply to all buckets** để lần sau khỏi phải sửa token.
4. **Create** → copy **Access Key ID** + **Secret Access Key** (Cloudflare **không cho xem lại**).
5. Cập nhật `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` ở **Vercel** (cả 3 môi trường) và
   `.env.local` của máy dev.
6. Chạy lại lệnh đo ở trên — phải ✅ hết mới đi tiếp.

> 💡 Token dùng cho **ứng dụng** chỉ cần *Object Read & Write*. Riêng việc **đặt CORS** (bước 5)
> đòi *Admin Read & Write* — nếu không muốn giữ một token mạnh như vậy trong env thì cứ dán CORS
> bằng tay theo cách B, an toàn hơn.

⚠️ **Đây là lý do phải đo trước khi làm gì khác:** nếu bỏ qua và chỉ đi dán CORS bằng tay, CORS sẽ
đúng nhưng **ứng dụng vẫn không ghi nổi file** — cùng một token bị chặn ở bước PUT. Hỏng ở tầng
khác, triệu chứng lại giống hệt, và mất thêm một vòng chẩn đoán.

---

## 3. Điền biến môi trường trên Vercel

Chỉ **một** biến mới:

```
R2_CLASS_MEDIA_BUCKET_NAME=satarobo-class-media
```

Điền cho **cả ba** môi trường: **Production**, **test**, **Development**.
(Vercel → Project → Settings → Environment Variables → Add New)

**Không** có biến public URL đi kèm — đó chính là điểm: bucket này không phát công khai.

> Nếu muốn tách hẳn dữ liệu giữa môi trường, tạo thêm bucket `satarobo-class-media-test` và điền giá
> trị khác cho môi trường `test`. Không bắt buộc, nhưng nên — để nghịch trên test không đụng ảnh thật.

---

## 4. Điền biến ở máy local (cho người dev và cho bước 5)

Thêm vào `.env.local` (**không** phải `.env`, và **không** commit):

```
R2_CLASS_MEDIA_BUCKET_NAME=satarobo-class-media
```

Script CORS ở bước 5 đọc đúng file `.env.local` (`scripts/apply-r2-cors.ts:26`).

---

## 5. 🔴 Đặt luật CORS cho bucket — BƯỚC KHÔNG ĐƯỢC BỎ

Trình duyệt tải file **thẳng lên R2**, không đi qua server. Không có luật CORS thì trình duyệt chặn,
và server **không hề biết** vì phần việc của nó (cấp link ký) đã xong và trả 200.

### Cách A — chạy script (nhanh, ưu tiên)

```bash
pnpm exec tsx scripts/apply-r2-cors.ts --bucket=satarobo-class-media
```

⚠️ **Cần token R2 quyền *Admin Read & Write*.** Token chỉ có *Object Read & Write* sẽ trả
`Access Denied` — đúng cái đã vấp ngày 10/08. Nếu gặp lỗi đó thì dùng cách B.

### Cách B — dán tay trong dashboard (không cần token mạnh)

R2 → bucket `satarobo-class-media` → **Settings** → **CORS Policy** → **Edit** → dán:

```json
[
  {
    "AllowedOrigins": [
      "https://admin.satarobo.vn",
      "https://hocvien.satarobo.vn",
      "https://giaovien.satarobo.vn",
      "https://satarobo.vn",
      "https://www.satarobo.vn",
      "https://test.satarobo.vn",
      "https://satarobo-vn.vercel.app",
      "https://*.vercel.app",
      "http://localhost:3000",
      "http://localhost:3001"
    ],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Đây là **bản sao nguyên văn** của `scripts/r2-cors.json` đang dùng cho các bucket khác. Danh sách
origin đã phủ đủ: giáo viên up ảnh ở `giaovien.satarobo.vn`, QLCS duyệt ở `admin.satarobo.vn`, phụ
huynh xem ở `hocvien.satarobo.vn`.

### Kiểm CORS mà KHÔNG cần token — dùng được cả khi script bị `Access Denied`

`PutBucketCors` đòi *Admin Read & Write*, nhưng **kiểm** thì không cần quyền gì cả: chỉ là một
request preflight như trình duyệt vẫn làm.

```bash
ACC=$(grep -oE '^R2_ACCOUNT_ID=.*' .env.local | sed 's/^R2_ACCOUNT_ID=//; s/"//g')
for o in "https://admin.satarobo.vn" "https://giaovien.satarobo.vn" "https://hocvien.satarobo.vn"          "https://test.satarobo.vn" "http://localhost:3000" "https://ke-gian-bat-ky.example"; do
  R=$(curl -s -I -X OPTIONS "https://satarobo-class-media.${ACC}.r2.cloudflarestorage.com/p"         -H "Origin: $o" -H "Access-Control-Request-Method: PUT" | grep -ci "access-control-allow-origin")
  [ "$R" = "1" ] && echo "CHO   $o" || echo "CHAN  $o"
done
```

Origin bịa ở dòng cuối **phải ra `CHAN`** — ra `CHO` nghĩa là luật đang mở toang cho mọi tên miền.

### ✅ Kết quả đo thật ngày 26/08/2026 — bucket đã sẵn sàng

| Origin | Kết quả | Nhận xét |
|---|---|---|
| `https://admin.satarobo.vn` | ✅ CHO | QLCS duyệt media |
| `https://giaovien.satarobo.vn` | ✅ CHO | GV upload |
| `https://hocvien.satarobo.vn` | ✅ CHO | PH xem |
| `https://test.satarobo.vn` | ✅ CHO | môi trường test |
| `http://localhost:3000` | ✅ CHO | máy dev |
| `https://satarobo.vn` | ⚪ CHẶN | **Không sao** — site công khai không hiển thị media lớp. Chặn ở đây là **ít quyền hơn**, đúng hướng |
| `https://ke-gian-bat-ky.example` | ✅ CHẶN | Xác nhận **không** phải luật `*` mở toang |

Preflight trả `204` kèm `Access-Control-Allow-Methods: GET, PUT, POST, DELETE, HEAD` và
`Access-Control-Max-Age: 3600`.

⚠️ **Một khác biệt đã biết, ghi lại để sau này không ngạc nhiên:** luật đang chạy trên bucket **khác**
`scripts/r2-cors.json` (file repo còn có `satarobo.vn`, `www.satarobo.vn`, `*.vercel.app`). Nghĩa là
nếu sau này ai đó chạy `apply-r2-cors.ts` bằng token *Admin R/W*, nó sẽ **ghi đè** luật hiện tại bằng
danh sách của repo — rộng hơn một chút. Không gây hỏng, nhưng biết trước thì khỏi hoảng.

---

## 6. Kiểm lại — 4 điều, làm hết đừng bỏ giữa chừng

| # | Kiểm gì | Đạt là thế nào |
|---|---|---|
| 1 | R2 → bucket → Settings → **Public access** | **Not allowed**, không custom domain nào |
| 2 | R2 → bucket → Settings → **CORS Policy** | Hiện đúng khối JSON ở bước 5 |
| 3 | Vercel → Environment Variables | `R2_CLASS_MEDIA_BUCKET_NAME` có ở **cả 3** môi trường |
| 4 | Giá trị biến | **KHÁC** `R2_BUCKET_NAME` (nếu trùng, code trả 503, cố ý) |
| 5 | `pnpm exec tsx scripts/probe-r2-access.ts` | ✅ **mọi** bucket — đây là thứ chứng minh ứng dụng ghi được, CORS không thay được nó |

Kiểm nhanh CORS bằng lệnh (thay `<account-id>`):

```bash
curl -i -X OPTIONS "https://satarobo-class-media.<account-id>.r2.cloudflarestorage.com/probe" \
  -H "Origin: https://admin.satarobo.vn" \
  -H "Access-Control-Request-Method: PUT"
```

Đạt: có header `access-control-allow-origin`. Không có header đó ⇒ CORS **chưa** ăn, quay lại bước 5.

---

## 7. Việc của dev (sau khi 6 bước trên xong)

Không thuộc phần vận hành, ghi ở đây để bàn giao gọn:

1. Thêm `R2_CLASS_MEDIA_BUCKET_NAME` vào `.env.example` kèm chú thích cảnh báo, theo đúng khuôn khối
   `R2_CHAT_BUCKET_NAME` (`.env.example:100-111`).
2. Viết `getClassMediaBucket()` theo khuôn `getChatBucket()` (`lib/storage/chat-storage.ts:48-56`):
   đọc thẳng `process.env`, **fail closed** khi trống, **từ chối** nếu trùng `R2_BUCKET_NAME`.
   Tuyệt đối **không** fallback về `getR2Bucket()` — im lặng rơi về bucket công khai chính là lỗ hổng
   đang vá.
3. Nới `isOwnStorageUrl` (`actions.ts:150-156`) để nhận **hai** bucket — hôm nay nó so với **một**
   `getR2PublicUrl()`.
4. Thêm chế độ `media` vào `scripts/apply-r2-cors.ts` (hiện chỉ có `chat`, còn lại phải dùng
   `--bucket=`), để bucket mới nào cũng có lệnh gọn nhớ được.
5. **Media cũ ở lại bucket công khai** — đó là di sản, dọn theo `OQ-F6` (đã chốt: story riêng, dry-run,
   người vận hành chạy tay).

⚠️ Chỉ sau khi mục 2 và 3 xong mới được đổi `buildMediaObjectKey` — object key là thứ **không sửa rẻ**
sau khi đã có dữ liệu.

---

## 8. Nếu gặp lỗi

| Triệu chứng | Nguyên nhân gần như chắc chắn |
|---|---|
| Chọn ảnh xong, dải xem trước báo "Lỗi", nút Gửi không bật | **Thiếu CORS** (bước 5). Mở DevTools → Console sẽ thấy `blocked by CORS policy` |
| API trả 503 `STORAGE_NOT_CONFIGURED` | Chưa điền `R2_CLASS_MEDIA_BUCKET_NAME`, hoặc điền trùng `R2_BUCKET_NAME` |
| Script CORS trả `Access Denied` | Token R2 chỉ có *Object R/W*. Dùng cách B (dán tay) |
| Trình duyệt báo lỗi CORS **dù đã đặt CORS** | Có thể là lỗi khác bị **báo nhầm thành CORS**: response lỗi của R2 không kèm header CORS nên trình duyệt hiển thị sai nguyên nhân (`lib/storage/r2-client.ts:70-72`). Đọc kỹ status code thật trong tab Network |
