# NỢ-17 · healthcheck DB · và PHÉP KIỂM HAI MÔI TRƯỜNG của NỢ-8 (22/09/2026)

> Ba việc làm trong một lượt, vì cả ba đều chạm cùng một hệ thống và cùng cần một lần
> khởi động lại fork.

## 1. ✅ NỢ-17 — fork phải THỬ LẠI khi nối nick

### Chỗ hỏng

`backend/src/app.ts` — đoạn reconnect lúc khởi động là **một lần ăn ngay**: thất bại là
thôi, và nick nằm offline **vĩnh viễn** cho tới khi có người quét QR.

Đo 21/09 trên máy chủ thật:

```
[21:20:29] Failed to load accounts for reconnect:
           the database system is not yet accepting connections
```

Giờ khởi động thật của bốn container trong lần đó:

```
minio .485 · db .566 · redis .732 · app .798     ← cách nhau 0,3 GIÂY
```

trong khi `db` phải **9,5 phút** sau mới báo `healthy`.

⚠️ `depends_on: condition: service_healthy` **không cứu được** — nó là khái niệm của
`docker compose up`, **không phải** của Docker engine. Khi máy khởi động lại, engine dựng
lại mọi container `restart: unless-stopped` **song song** và bỏ qua `depends_on`.

> 🔬 **Chính điều đó tự chứng minh trong lúc thử nghiệm:** phép cấy lỗi đầu tiên của tôi
> **hỏng** vì `docker compose up -d app` đã **bật lại `db` giúp** (compose tôn trọng
> `depends_on`). Phải dùng `docker restart zalo-crm-app` — tầng engine — mới tái hiện được
> đúng cuộc đua. Nếu không kiểm trạng thái `db` mà tin ngay dòng log "Listener connected"
> thì đã kết luận sai.

### Bản vá

Lịch thử lại `[0, 5s, 15s, 30s, 60s, 120s]` — tổng ~3,8 phút. Rộng hơn mọi lần khởi động
đã đo, nhưng đủ hẹp để không giấu một sự cố DB thật sau hàng giờ thử lại.

Mỗi lần trượt ghi **`WARN`**, không phải `ERROR`: một lần trượt lúc khởi động là **bình
thường** và đã có đường xử lý; để `ERROR` ở đó là dạy người đọc log bỏ qua `ERROR`. Hết
lịch mà vẫn không được thì mới `ERROR`, nói rõ nick sẽ nằm offline.

### Đã cấy lỗi thật, hai chiều, trên hệ thống thật

```
02:10:29  WARN  [nối lại nick] lần 1/6 chưa được
02:10:38  WARN  [nối lại nick] lần 2/6 chưa được
02:10:47        ← bật DB lên
02:10:53  INFO  Attempting reconnect for 2 Zalo account(s) — thành công ở lần thử 3/6
02:10:54  INFO  [zalo:686ea147…] Listener connected
02:10:54  INFO  [zalo:5505371a…] Listener connected
```

Bản cũ bỏ cuộc ngay ở lần 1. Giờ cả hai nick tự về, **không một thao tác người nào**.

⇒ **Tác vụ bọc ngoài `noi-lai-nick-sau-khoi-dong.ps1` (mục 3.5 của `08`) nay là lớp
dự phòng, không còn là đường chính.** Cách biết đã bỏ được nó: log `khoi-dong.log` liên
tục báo *"KHONG can restart"*.

**Commit trong fork:** `44ff7a2c` — **chưa push**. Fork là repo khác
(`sataroboit-coder/sata-crm`), đẩy lên là quyết định của chủ dự án.

🔴 **Rủi ro nếu không push:** bản vá đang chỉ nằm trong cây làm việc trên máy này. Ai
`git pull` fork là mất, và container build lại từ mã cũ.

## 2. ✅ Healthcheck DB thiếu `-d` — mỗi 10 giây một FATAL

```yaml
test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-crmuser}"]
```

Không có `-d` ⇒ `pg_isready` nối vào database **mặc định trùng tên người dùng** = `crmuser`.
Database đó **không tồn tại** (đo: chỉ có `postgres`, `template0`, `template1`, `zalocrm`).

Cổng canh vẫn "đạt" vì `pg_isready` trả `0` khi **máy chủ có trả lời** — nó không quan tâm
database có tồn tại không. Chỉ có điều mỗi 10 giây nó để lại:

```
FATAL:  database "crmuser" does not exist
```

**Đo được: ~8.580 dòng/ngày**, đều đặn từ 06/09. Một `FATAL` **thật** sẽ chìm nghỉm giữa
đám đó — tức cổng canh đang làm hỏng chính thứ để chẩn đoán.

**Vá:** thêm `-d ${DB_NAME:-zalocrm}`. Nó còn làm phép kiểm **chặt hơn**: xác nhận đúng
database mà ứng dụng dùng, chứ không chỉ *"có tiến trình nào đó đang nghe ở cổng 5432"*.

**Đo trước/sau:**

| | trước | sau |
|---|---|---|
| dòng `FATAL crmuser` | một dòng mỗi 10 giây | **0** |
| log còn lại | lẫn trong rác | chỉ thông báo khởi động thật |

**Commit trong fork:** `e715b496` — cũng chưa push.

## 3. ❌ DB mất 9,5 phút mới `healthy` — KHÔNG xác định được nguyên nhân

**Đã loại được Postgres.** Đo lần khởi động lại có kiểm soát:

```
02:15:12.710  listening on IPv4 address "0.0.0.0", port 5432
02:15:12.863  database system is ready to accept connections
```

**Dưới một giây.** Nên 9,5 phút hôm 21/09 không phải do Postgres khởi động chậm, cũng không
phải phục hồi sau sự cố (không có dòng `redo starts at` nào).

**Nhưng tôi không kết luận nguyên nhân**, vì công cụ đo đang **mâu thuẫn với chính nó**:

- `docker logs --tail 6` cho thấy các dòng mang dấu thời gian **21/09 19:11Z**
- `docker logs --since 2026-09-21T00:00:00` cùng container trả **0 dòng**
- đếm theo ngày: dòng log dừng hẳn ở **15/09**, không có ngày nào sau đó

Ba phép đọc trên cùng một nguồn cho ba câu trả lời khác nhau. Với một nguồn như thế thì mọi
kết luận rút ra đều vô giá trị — kể cả kết luận nghe hợp lý.

⚠️ Cũng trong lượt này vấp lại bẫy **"`head`/`tail` trên luồng trộn không theo thứ tự thời
gian"**: `docker logs` gộp stdout và stderr, nên `| grep | tail -1` cho "dòng cuối" là
15/09 trong khi `--tail` cho 21/09. Đúng lớp lỗi đã gài ở bảng check GitHub hôm trước.
**Đếm và sắp theo dấu thời gian, đừng tin `head`/`tail`.**

**Còn treo.** Cần một lần khởi động lại máy nữa, quan sát trực tiếp `docker inspect` theo
từng giây thay vì đọc log sau đó.

## 4. ✅ PHÉP KIỂM HAI MÔI TRƯỜNG của NỢ-8 — ĐẠT, không cần đụng prod

NỢ-8 bước 7 đòi hai điều. Cả hai nay đã đo được.

### Cách đo: dùng cặp `test` ↔ `local` thay cho `test` ↔ `prod`

Prod chưa khai env, chưa bật cờ — nhưng **cơ chế thì giống hệt**: fork tra org từ
`claims.orgCode`, và khoá API tra ra `orgId` rồi **mọi truy vấn lọc theo `orgId`đó**
(`public-api-routes.ts` — `apiKeyAuth` gán `request.orgId`).

### ① Mỗi môi trường chỉ thấy phần của mình

Gọi cùng một đường bằng ba khoá khác nhau, **chỉ đọc**:

| org | nick | contact | hội thoại |
|---|---|---|---|
| `prod-cs1` | **2** | **100** | **100** |
| `test-cs1` | 0 | 0 | 0 |
| `local-cs1` | 0 | 0 | 0 |

*(100 là trần `limit` của truy vấn, không phải tổng.)*

### ② Cố ý với tay sang — KHÔNG được

Mạnh hơn "mỗi bên thấy phần mình": thử **đúng cái không được phép**.

| phép thử | `prod-cs1` | `test-cs1` | `local-cs1` |
|---|---|---|---|
| **ĐỌC** một hội thoại của prod theo id | **200** | **404** | **404** |
| **GHI quyền** lên nick của prod — `PUT /api/public/zalo-accounts/:id/access` | — | **404** | **404** |

Dòng `prod-cs1 → 200` là **đối chứng dương** (luật 11): thiếu nó thì hai cột 404 vẫn "đạt"
kể cả khi API hỏng hoàn toàn.

Mục thứ hai chính là lời gọi mà NỢ-8 cảnh báo:

> *"`capQuyenNickZalocrm` đẩy quyền theo `externalIds` của MỘT môi trường ⇒ mỗi lượt cron
> từ môi trường này sẽ GỠ quyền mà môi trường kia vừa cấp (`PUT …/access` thay cả tập).
> Hai môi trường cùng chạy cron = quyền lật qua lật lại, Sale mất quyền đọc nick giữa ca."*

Nay **không thể xảy ra**: cron của `test` hay `local` chạm vào nick của prod là `404`.

### ③ Một người → hai tài khoản ở hai org

Đo ngay sau khi tách:

```
test-cs1 | (RỖNG) | cmtcd2f6f0003d | tạo 21/09 18:32 UTC   ← đăng nhập từ test
prod-cs1 | (RỖNG) | cmtcd2f6f0003d | tạo 16/09 09:21 UTC
```

Cùng `externalId`, **hai tài khoản ở hai org khác nhau** — đúng hành vi NỢ-8 muốn.

### Còn đúng một mảnh chưa đo được

Đăng nhập SSO **từ chính prod**. Nó cần prod khai env + bật cờ, nên **dời sang ngày bật
cờ** và vẫn là một mục của runbook `07`. Mức tin cậy hiện tại: đường mã là **một**
(`claims.orgCode` → org), và nó đã chạy đúng với `test`; nhưng *đã chạy đúng với một môi
trường* không phải *đã chạy đúng với môi trường kia*. Đừng lẫn hai điều đó.

## Việc còn lại

| # | việc | ai |
|---|---|---|
| 1 | 🔴 push hai commit của fork (`44ff7a2c`, `e715b496`) lên `sataroboit-coder/sata-crm` | **chủ dự án** |
| 2 | khởi động lại máy, quan sát `docker inspect` từng giây để truy 9,5 phút | cùng làm |
| 3 | SSO từ prod — ngày bật cờ | ngày go-live |
