# Máy dev làm MÁY CHỦ cho fork ZaloCRM — giai đoạn thí điểm một cơ sở

> Chốt 21/09/2026: **không mua VPS**. Máy dev Windows đảm nhiệm vai trò máy chủ cho fork
> trong giai đoạn thí điểm. Tài liệu này là hiện trạng ĐO ĐƯỢC + việc còn phải làm.
>
> 🔴 Tên miền chốt: **`zalocrm.satarobo.vn`** — trùng khít với mọi định danh đã có trong mã
> (`ZALOCRM_ENABLED`, `ZALOCRM_APP_URL`, `/api/webhooks/zalocrm/`, `docs/tich-hop-zalocrm/`).

## 0. Hiện trạng — ĐO 21/09/2026, không chép từ trí nhớ

| Hạng mục | Đo được | Kết luận |
|---|---|---|
| DNS `satarobo.vn` | NS = `owen.ns.cloudflare.com`, `khloe.ns.cloudflare.com` | ✅ **đang trên Cloudflare** |
| `zalocrm.satarobo.vn` | NXDOMAIN | ✅ trống, dùng được |
| `cloudflared` | 2026.9.1 (scoop, user-scope) | ✅ đã cài |
| `~/.cloudflared/cert.pem` | **đã có** (21/09 12:28Z) | ✅ đã đăng nhập Cloudflare |
| Tunnel | **`zalocrm` → `zalocrm.satarobo.vn`** (id `c6098078…`) | ✅ có tên, cố định |
| Tiến trình `cloudflared.exe` | 4 cũ (**HAI** tunnel tạm, từ 16/09) + 2 mới | ⚠️ cửa cũ **vẫn mở**, xem 2.6 |
| Stack fork | 6 container, `Up 5 days` | ✅ |
| `restart` policy | **cả 6 = `unless-stopped`** | ✅ không phải làm gì |
| Docker Desktop | nằm trong `HKCU\...\Run` | ⚠️ **chỉ chạy khi có người đăng nhập** |
| `AutoAdminLogon` | chưa đặt | ⛔ khởi động lại ⇒ dừng ở màn khoá ⇒ fork CHẾT |
| Sao lưu DB | `prodrigestivill/postgres-backup-local`, `SCHEDULE=@daily` | ✅ đã chạy sẵn |
| Máy có pin | **không** (máy bàn) | ⇒ mọi mức `DC` không bao giờ áp dụng |
| `sleep` / `hibernate` trên AC | **0 / 0** = không bao giờ | ✅ **đã tắt sẵn** |

### Đĩa vật lý — backup đã nằm đúng chỗ

| Đĩa | Loại | Ổ | Dùng cho |
|---|---|---|---|
| Disk 1 | SSD 238G (Kingmax) | **C:** (87% đầy, còn 28G), D: | Docker (WSL2 vhdx) |
| Disk 0 | HDD 932G (WDC) | **E:** (còn 764G), F: | `E:\zalocrm\app\backups` |

⇒ Yêu cầu *"ghi ra ổ khác ổ chứa Docker"* **đã đạt sẵn, và mạnh hơn** — khác **đĩa vật lý**,
không chỉ khác ký tự ổ. (Đo bằng `Get-Partition` + `Get-PhysicalDisk`, đừng suy từ ký tự ổ:
hai ký tự ổ khác nhau vẫn có thể nằm chung một đĩa, và khi đó đĩa chết là mất cả hai.)

⚠️ **C: còn 28G/208G.** Không chặn việc gì hôm nay, nhưng Docker ăn chỗ ở đó — theo dõi.

## 1. DNS — ✅ cổng đã qua

Không phải làm gì. `satarobo.vn` do Cloudflare quản lý, nên tạo được bản ghi cho tunnel.

## 2. Tunnel CÓ TÊN thay cho `trycloudflare`

### Vì sao bắt buộc đổi

`trycloudflare` cấp **tên ngẫu nhiên mới mỗi lần chạy**. Mà `APP_URL` của fork và
`ZALOCRM_APP_URL`/`ZALOCRM_BASE_URL` bên Sata đều ghim địa chỉ đó. Nên mỗi lần máy khởi
động lại là **ba nơi phải sửa tay**, và trong lúc chưa sửa thì khung nhúng `/zalo-crm` trỏ
vào hư không — không có lỗi nào báo, chỉ là màn trắng.

Đó cũng là lý do **NỢ-6 + NỢ-8 phải chờ việc này**: không thể khai org theo môi trường khi
địa chỉ còn đổi mỗi ngày.

### Bước 2.1 — ĐĂNG NHẬP CLOUDFLARE 🔴 *việc của chủ dự án, mở trình duyệt*

```
! cloudflared tunnel login
```

Trình duyệt mở → chọn zone **`satarobo.vn`** → Authorize. Xong thì có `~/.cloudflared/cert.pem`.

> Chỉ cần làm **một lần**. Đây là uỷ quyền tài khoản Cloudflare nên không ai làm hộ được.

### Bước 2.2 — tạo tunnel + bản ghi DNS

```bash
cloudflared tunnel create zalocrm
cloudflared tunnel route dns zalocrm zalocrm.satarobo.vn
cloudflared tunnel list          # ghi lại UUID
```

`create` sinh tệp `~/.cloudflared/<UUID>.json` — **đây là bí mật**, không commit, không dán
vào chat.

### Bước 2.3 — cấu hình `~/.cloudflared/config.yml`

```yaml
tunnel: <UUID>
credentials-file: C:\Users\ADMIN\.cloudflared\<UUID>.json

ingress:
  # Fork ZaloCRM — container zalo-crm-app publish 0.0.0.0:3080 -> 3000
  - hostname: zalocrm.satarobo.vn
    service: http://localhost:3080
  # Bắt buộc phải có, và phải đứng CUỐI: mọi thứ không khớp ở trên trả 404.
  # Thiếu dòng này cloudflared từ chối khởi động.
  - service: http_status:404
```

### Bước 2.4 — thử trước khi cài dịch vụ

```bash
cloudflared tunnel run zalocrm          # chạy tiền cảnh, Ctrl+C để dừng
# cửa sổ khác:
curl -sS -o /dev/null -w "%{http_code}\n" https://zalocrm.satarobo.vn
```

### Bước 2.5 — cập nhật địa chỉ, **TEST TRƯỚC, PROD SAU**

1. Fork — `E:\zalocrm\app\.env`:
   `APP_URL=https://zalocrm.satarobo.vn` *(đang là `…trycloudflare.com`)*, rồi
   `docker compose up -d app`.
2. Sata env **`test`** — `ZALOCRM_APP_URL` + `ZALOCRM_BASE_URL` → `https://zalocrm.satarobo.vn`,
   rồi deploy lại nhánh `test`.
3. Nghiệm thu trên `test.satarobo.vn/zalo-crm`: khung nhúng lên, nick còn `connected`.
4. **PROD: CHƯA LÀM.** Chủ dự án chốt chưa khai env production, chưa bật cờ.

### Bước 2.6 — dọn 4 tiến trình `cloudflared.exe` cũ

Chỉ làm **sau khi** tunnel tên đã chạy và bước 2.5 nghiệm thu xong — chúng đang giữ tunnel
tạm mà `APP_URL` hiện tại còn trỏ vào.

## 3. Tự khởi động

### 3.1 Container — ✅ đã xong

Cả 6 container đã `restart: unless-stopped`. **Không phải làm gì.**

### 3.2 🔴 Docker Desktop chỉ chạy KHI CÓ NGƯỜI ĐĂNG NHẬP

`restart: unless-stopped` chỉ có tác dụng **khi engine đã chạy**. Trên Windows, engine đi
kèm Docker Desktop, mà Docker Desktop nằm trong `Run` của user ⇒ **không đăng nhập thì
không có engine, và không container nào lên**.

`AutoAdminLogon` hiện **chưa đặt** ⇒ phép thử "khởi động lại thật" ở mục 3.4 **chắc chắn
trượt** nếu không xử lý trước.

**Chủ dự án chốt: bật tự đăng nhập Windows.** Việc này chạm mật khẩu tài khoản nên
**chủ dự án tự làm**:

- `netplwiz` → bỏ chọn *"Users must enter a user name and password…"* → Apply → nhập mật
  khẩu tài khoản 2 lần.
- Nếu không thấy ô đó: đặt khoá `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\PasswordLess\Device\DevicePasswordLessBuildVersion = 0` rồi mở lại `netplwiz`.

⚠️ **Đánh đổi, nói rõ:** Windows phải giữ mật khẩu để tự vào phiên. Máy đặt ở nơi người lạ
chạm được thì **không nên** bật. Đây là đánh đổi đã được chấp nhận có ý thức cho giai đoạn
thí điểm, không phải sơ suất.

### 3.3 cloudflared chạy như dịch vụ Windows

```
# PowerShell QUYỀN ADMIN
cloudflared service install
Start-Service cloudflared
Get-Service cloudflared | Format-List Name,Status,StartType
```

`StartType` phải là **`Automatic`**. Dịch vụ đọc `config.yml` ở
`C:\Windows\System32\config\systemprofile\.cloudflared\` — nếu nó không tìm thấy, chép
`config.yml` + `<UUID>.json` sang đó.

### 3.4 🔴 PHÉP THỬ BẮT BUỘC — khởi động lại máy THẬT

Không có phép thử này thì mọi mục trên chỉ là dự định. **Khởi động lại thật**, rồi **không
chạm gì cả**, đợi ~3 phút và đo:

```bash
docker ps --filter "name=zalo-crm" --format "{{.Names}}\t{{.Status}}"   # phải đủ 6, Up
curl -sS -o /dev/null -w "%{http_code}\n" https://zalocrm.satarobo.vn   # phải 200/302
```

Rồi mở `test.satarobo.vn/zalo-crm` và xác nhận **nick vẫn `connected`**.

⚠️ **Đo bằng ba dấu hiệu riêng, đừng dừng ở dấu hiệu đầu:** container `Up` chỉ nói engine
chạy; `curl` ra mã trạng thái mới nói tunnel nối; và chỉ màn hình nick mới nói phiên Zalo
còn sống. Ba thứ hỏng độc lập với nhau.

## 4. Sao lưu — ✅ đã làm, đã thử khôi phục

### Đang chạy

| Thông số | Giá trị |
|---|---|
| Ảnh | `prodrigestivill/postgres-backup-local` |
| Lịch | `@daily` — 00:00 **giờ VN** (`TZ=Asia/Ho_Chi_Minh`) |
| Nơi ghi | `E:\zalocrm\app\backups` → **đĩa vật lý khác** đĩa chứa Docker |
| Giữ lại | **14 ngày** (đổi từ 7 — 21/09/2026) · 4 tuần · 3 tháng |
| Cỡ | ~1,7 MB nén / bản ⇒ 14 bản ≈ 24 MB |

Vì sao 14: máy dev nay là **máy chủ**, mất dữ liệu ở đây là mất hội thoại Zalo thật. 14 ngày
để sự cố xảy ra thứ Sáu vẫn còn bản sạch sau hai tuần nghỉ.

### Lệnh khôi phục — ĐÃ CHẠY THỬ THẬT 21/09/2026

Kịch bản nạp vào **database TẠM** rồi đối chiếu, **không đụng DB sống**, và dọn sạch sau khi
xong. Kết quả lượt chạy thử:

```
      chỉ tiêu                    SỐNG  KHÔI PHỤC
      số bảng                       110        110
      số dòng users                   8          8
      số dòng organizations           1          1
      số dòng conversations         150        148
      số dòng messages             3408       3279
```

Bảng/`users`/`organizations` **khớp tuyệt đối**; `conversations`/`messages` chênh đúng phần
phát sinh sau 00:00 — tức bản sao lưu là **ảnh chụp nửa đêm thật**, không phải tệp rỗng.
Đó là điều cần chứng minh: một tệp `.sql.gz` tồn tại **không** chứng minh nó khôi phục được.

Khôi phục **thật** (khi DB hỏng) thì nạp vào chính DB sống thay vì DB tạm — dừng `app`
trước, nạp, rồi bật lại:

```bash
docker compose stop app
gunzip -c /e/zalocrm/app/backups/daily/zalocrm-latest.sql.gz \
  | docker exec -i zalo-crm-db sh -c 'PGPASSWORD=$POSTGRES_PASSWORD psql -U $POSTGRES_USER -d $POSTGRES_DB'
docker compose start app
```

> Một dòng lỗi vô hại khi nạp: `unrecognized configuration parameter "transaction_timeout"`
> — chỉ thị đầu tệp của `pg_dump` bản mới hơn máy chủ. Số liệu khớp đã chứng minh nó không
> ảnh hưởng dữ liệu.

## 5. Ngủ / ngủ đông — ✅ đã tắt sẵn, còn hai thứ KHÁC mới là rủi ro thật

Đo `powercfg`: trên nguồn AC **`sleep = 0`** và **`hibernate = 0`** (= không bao giờ). Máy
**không có pin** nên mọi mức `DC` không bao giờ áp dụng. **Không phải làm gì.**

Nếu muốn kiểm lại bất cứ lúc nào:

```powershell
powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE | Select-String "AC Power Setting"
powercfg /query SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE | Select-String "AC Power Setting"
```

`0x00000000` = không bao giờ.

### 🔴 Hai thứ CHƯA xử, và chúng mới là thứ làm fork chết lúc nửa đêm

1. **Windows Update tự khởi động lại.** Đây là lý do phổ biến nhất khiến một máy Windows
   đóng vai máy chủ biến mất lúc 3h sáng. Đặt *Active hours* rộng, hoặc hoãn khởi động lại
   — nhưng **đừng tắt hẳn cập nhật**: máy này nay mở ra Internet.
   Sau khi bật tự đăng nhập (mục 3.2) thì một lần khởi động lại chỉ còn là vài phút gián
   đoạn thay vì chết hẳn — nhưng vẫn là gián đoạn.
2. **Card mạng tự tắt để tiết kiệm điện.** Device Manager → card mạng → Power Management →
   bỏ chọn *"Allow the computer to turn off this device to save power"*. Nếu không, tunnel
   rớt và tự nối lại — triệu chứng là "thỉnh thoảng nick mất kết nối", rất khó lần ra.

## 6. Sau đó mới tới NỢ-6 + NỢ-8

Mỗi môi trường một org trong fork. **Phải có địa chỉ cố định trước** — khai org và khoá theo
môi trường trên một địa chỉ còn đổi mỗi ngày là làm lại lần nữa.

Đây cũng là **điều kiện chặn** của ngày bật `ZALOCRM_ENABLED` trên prod
(`07-runbook-bat-co-tren-prod.md`).

## 7. Việc còn lại, theo thứ tự

| # | Việc | Ai |
|---|---|---|
| 1 | `cloudflared tunnel login` | **chủ dự án** (mở trình duyệt) |
| 2 | tạo tunnel + DNS + `config.yml` + thử | tôi |
| 3 | bật tự đăng nhập Windows (`netplwiz`) | **chủ dự án** (chạm mật khẩu) |
| 4 | `cloudflared service install` | **chủ dự án** (cần quyền admin) |
| 5 | đổi `APP_URL` + env `test`, nghiệm thu | tôi |
| 6 | **khởi động lại máy thật** + đo 3 dấu hiệu | cùng làm |
| 7 | dọn 4 tiến trình `cloudflared` cũ | tôi |
| 8 | Windows Update + card mạng | **chủ dự án** |
| 9 | NỢ-6 + NỢ-8 | tôi |

**Chưa khai env production. Chưa bật cờ.**

---

## 🔴 TIẾN ĐỘ THỰC — cập nhật 21/09/2026 19:45

### ✅ Đã xong

| # | Việc | Bằng chứng |
|---|---|---|
| 1 | DNS trên Cloudflare | `owen`/`khloe.ns.cloudflare.com` |
| 2.1 | `cloudflared tunnel login` | `cert.pem` ghi lúc 12:28Z |
| 2.2 | tunnel `zalocrm` + CNAME | `Added CNAME zalocrm.satarobo.vn` → `c6098078-03e3-450d-b6f5-59d6115821ca` |
| 2.3 | `config.yml` | `cloudflared tunnel ingress validate` → **OK**; rule #0 → `http://localhost:3080` |
| 2.4 | tunnel chạy + gọi được | **HTTP 200**, 4 kết nối (hkg01/09/10/13). Thân trang **giống hệt từng byte** `localhost:3080`, `<title>Sata CRM` ⇒ đúng container fork |
| 2.5a | `APP_URL` của fork | `…trycloudflare.com` → `https://zalocrm.satarobo.vn`; xác nhận trong container đang chạy |
| 2.5b | env `test` | `ZALOCRM_APP_URL` + `ZALOCRM_BASE_URL` → địa chỉ mới; vẫn đủ 6 biến trên `test`, **0 trên production** |
| 2.5c | deploy lại `test` | `dpl_CYMZrQRH1SKcJkkhDtrV44nFn1Vy`, target `test`, alias `test.satarobo.vn` — **đúng bản mà `test.satarobo.vn` đang phục vụ** |
| 4 | sao lưu 14 bản + thử khôi phục | bảng đối chiếu ở mục 4 |
| 5 | sleep/hibernate | đã tắt sẵn (`0`/`0`, máy không pin) |

### ⛔ CÒN LẠI — và trạng thái hiện tại là TẠM

1. 🔴 **Tunnel đang do MỘT TIẾN TRÌNH NỀN giữ**, không phải dịch vụ. Phiên làm việc kết
   thúc hoặc máy khởi động lại là **`zalocrm.satarobo.vn` chết**. Cần:
   ```
   # PowerShell QUYỀN ADMIN
   cloudflared service install
   Start-Service cloudflared
   ```
2. 🔴 **Bật tự đăng nhập Windows** (`netplwiz`) — nếu không, mục 3.4 chắc chắn trượt.
3. **Nghiệm thu đầu-cuối**: đăng nhập `test.satarobo.vn` → mở `/zalo-crm` → khung nhúng
   phải trỏ `zalocrm.satarobo.vn` và nick còn `connected`. Chỉ người có phiên đăng nhập
   mới đo được.
4. **Khởi động lại máy thật** rồi đo ba dấu hiệu (mục 3.4).

### ⚠️ HAI CỬA CÔNG KHAI — chưa đóng, CÓ CHỦ ĐÍCH

Đo 21/09: **hai** tunnel tạm chạy từ 16/09 (4 tiến trình, `tunnel --url …:3080`), và
`echo-hong-except-quest.trycloudflare.com` **vẫn trả HTTP 200** — tức fork đang có một cửa
công khai thứ hai mà không ai quản.

**Chưa đóng vì nó đang là ĐƯỜNG LÙI**: nếu bước nghiệm thu (3) cho thấy tunnel mới hỏng,
cửa cũ là thứ đưa fork về trạng thái chạy được. Đóng trước khi nghiệm thu là bỏ đường lùi
đúng lúc cần nó nhất.

⇒ **Đóng NGAY SAU khi nghiệm thu đạt**, bằng cách kết thúc 4 tiến trình cũ (PID đo lại lúc
làm — **đừng** giết 2 tiến trình `tunnel run zalocrm`).

---

## 🔴 KẾT QUẢ PHÉP THỬ KHỞI ĐỘNG LẠI — 21/09/2026, và ba thứ nó bắt được

Khởi động lại **hai lần**. Không lần nào suy luận đoán trước được kết quả.

### Lần 1 (21:07) — TRƯỢT ở Docker

| dấu hiệu | kết quả |
|---|---|
| tự đăng nhập | ✅ phiên `admin` Active lúc 21:07 |
| dịch vụ `cloudflared` | ✅ `Running` · `Automatic` |
| **Docker Desktop** | 🔴 **không chạy** — 0/6 container |
| hai tunnel tạm cũ | ✅ chết hẳn (`530`), không tự quay lại |

**Nguyên nhân:** mục `Run` của Docker Desktop **có tồn tại nhưng bị vô hiệu hoá**
(`StartupApproved\Run` byte0 = 3) **và** `settings-store.json` có `AutoStart: false`.

⚠️ **Bài học 1 — tồn tại ≠ có hiệu lực.** Tôi đọc thấy khoá `Run` rồi kết luận "sẽ chạy khi
đăng nhập". Sai. Cùng họ với `Status: Running` của dịch vụ (ảnh chụp giữa hai lần chết) và
với "4 job CI cancelled" sáng cùng ngày. Ba lần một ngày, cùng một hình dạng.

**Bảng mã byte đầu của `StartupApproved\Run` — đo từ chính máy này:**

| byte0 | nghĩa | chứng cứ trên máy |
|---|---|---|
| **chẵn** (0, 2) | BẬT | `Zalo` byte0=2, đã tự chạy sau khi khởi động |
| **lẻ** (1, 3) | TẮT | `OneDrive`/`Teams` byte0=3, không chạy |

⚠️ **Bật ở Windows Settings là CHƯA ĐỦ cho Docker.** Thao tác đó đổi byte `3` thành `1` —
vẫn lẻ, vẫn tắt. Chỉ khi bật trong **chính Docker Desktop** (Settings → General → *Start
Docker Desktop when you sign in*) nó mới ghi đồng thời `AutoStart: true` **và** byte `00`.
Sửa một trong hai chỗ thì registry trông như đã đổi mà thực tế vẫn tắt.

### Lần 2 (21:19) — hai dấu hiệu đầu ĐẠT

```
zalo-crm-{app,backup,minio,redis,db,clamav}   6/6  Up 27-28 giây
zalocrm.satarobo.vn                           HTTP 200, <title>Sata CRM
trycloudflare cũ                              530 (đã chết)
tiến trình cloudflared                        ĐÚNG MỘT, của SYSTEM
```

Toàn chuỗi tự dựng lại trong **~30 giây**, không thao tác nào của người.

### 🔴 Nhưng dấu hiệu 3 TRƯỢT — và đây là phát hiện đắt nhất

Khung `/zalo-crm` lên bình thường, 100 hội thoại còn nguyên, nhưng
**`ALL — Toàn bộ · 0 online · 2 offline`** — hai nick Zalo mất kết nối.

Log app:

```
[21:20:29.031] [ERROR] Failed to load accounts for reconnect:
               the database system is not yet accepting connections
```

**Giờ khởi động thật của bốn container trong lượt đó:**

```
zalo-crm-minio  14:20:21.485
zalo-crm-db     14:20:21.566
zalo-crm-redis  14:20:21.732
zalo-crm-app    14:20:21.798   <- sau db ĐÚNG 0,23 giây
```

Trong khi `zalo-crm-db` mãi **14:29:55** mới báo `healthy` — **9,5 phút sau**.

#### ⛔ `depends_on: condition: service_healthy` BỊ BỎ QUA khi máy khởi động lại

`docker-compose.yml` khai đầy đủ: app `depends_on` db/redis/minio với
`condition: service_healthy`, và db có healthcheck `pg_isready`. Vậy mà bốn container khởi
động **cách nhau 0,3 giây**.

Lý do: **`depends_on` là khái niệm của `docker compose up`, KHÔNG phải của Docker engine.**
Khi máy khởi động lại, engine dựng lại mọi container mang `restart: unless-stopped` và dựng
**song song** — nó không đọc `depends_on`.

⚠️ **Bài học 2:** bảo đảm thứ tự mà ai cũng tưởng mình có **không tồn tại ở đúng kịch bản
cần nó nhất**. Và nó chỉ lộ ra khi khởi động lại máy THẬT — `docker compose up` không bao
giờ tái hiện được.

⚠️ **Bài học 3:** đếm container KHÔNG phát hiện được. `6/6 Up` vẫn đúng — chúng lên đủ, chỉ
**lên sai thứ tự, im lặng**. Suýt nữa đã kết luận "mục 3 đạt" chỉ dựa vào con số đó.

Nối tiếp: fork **chỉ thử reconnect MỘT LẦN, không thử lại** ⇒ nick nằm offline vĩnh viễn cho
tới khi có người quét QR. Với vai trò máy chủ, đây là kiểu hỏng tệ nhất: Windows Update khởi
động lại lúc 3h sáng thì CRM mất kết nối Zalo tới khi có người phát hiện.

#### Phiên Zalo VẪN CÒN DÙNG ĐƯỢC — không phải hết hạn

`docker restart zalo-crm-app` khi DB đã sẵn sàng:

```
21:32:30.702  Attempting reconnect for 2 Zalo account(s)
21:32:31.518  [zalo:686ea147...] Listener connected
21:32:31.560  [zalo:5505371a...] Listener connected
21:32:36.844  friend-sync trigger=connect  live=222  upserted=222  errors=0
21:32:37.032  friend-sync trigger=connect  live=234  upserted=234  errors=0
```

Cả hai nick nối lại trong ~1 giây, **không cần quét QR**. Tức vấn đề thuần tuý là **thứ tự
khởi động**, không phải phiên hỏng.

## 3.5 Bọc ngoài đang chạy — tác vụ nối lại nick lúc đăng nhập

`E:\zalocrm\ops\noi-lai-nick-sau-khoi-dong.ps1`, đăng ký thành tác vụ
**"ZaloCRM - noi lai nick sau khi khoi dong"** (`State: Ready`, kích hoạt lúc đăng nhập,
trễ 1 phút, chạy dưới `DESKTOP-2R840DI\ADMIN`).

Bốn việc nó làm: đợi Docker engine → đợi `zalo-crm-db` báo `healthy` (trần 20 phút, vì đã đo
được 9,5 phút thật) → **chỉ restart khi CÓ bằng chứng** chuỗi `Failed to load accounts for
reconnect` xuất hiện → sau restart **kiểm lại bằng hành vi** (đếm `Attempting reconnect` và
`Listener connected`), ghi log ra `E:\zalocrm\ops\logs\khoi-dong.log`.

Chạy thử thật:

```
DB healthy sau 10 giay.
PHAT HIEN duong reconnect da that bai luc khoi dong -> restart zalo-crm-app.
Sau restart: 'Attempting reconnect'=1  'Listener connected'=2
=== KET THUC: nick da noi lai ===   (ma thoat 0)
```

⚠️ **Cố ý KHÔNG restart mù quáng mỗi lần khởi động.** Restart vô điều kiện không sai, nhưng
nó **giấu mất** thông tin "lần này có hỏng không" — mà đó đúng là thứ cần biết để một ngày
nào đó bỏ được cái bọc ngoài này đi.

⚠️ **Hai bẫy khi sửa kịch bản:**
· Đừng viết `2>&1` trực tiếp trên lệnh native trong PowerShell 5.1 — nó bọc stderr thành
  `NativeCommandError`, gặp `$ErrorActionPreference = "Stop"` là dừng kịch bản giữa chừng
  (đã dính ngay lần chạy thử đầu). Đẩy phép chuyển hướng ra `cmd /c "... 2>&1"`.
· Giữ kịch bản **không dấu** — PowerShell 5.1 đọc `.ps1` thiếu BOM theo ANSI, chữ có dấu
  làm vỡ tệp.

## 🔴 NỢ-17 — vá GỐC: fork phải THỬ LẠI khi nối nick

Tác vụ ở 3.5 là **bọc ngoài**, không phải bản vá.

Chỗ hỏng thật nằm ở fork: `loadAccountsForReconnect` chạy **một lần duy nhất** lúc khởi
động, thất bại là thôi. Kể cả khi thứ tự khởi động đúng, một cú nghẽn DB thoáng qua cũng đủ
làm mất cả hai nick mà không có cảnh báo nào.

**Cần làm:** thêm vòng thử lại có lùi dần (vài lần, giãn dần tới khoảng 2 phút) quanh đường
nạp tài khoản, ghi log rõ từng lần thử. Vá xong thì **gỡ tác vụ 3.5** — và cách biết đã gỡ
được là log `khoi-dong.log` liên tục báo *"KHONG can restart"*.

## ⚠️ Việc cần đo riêng — DB mất 9,5 phút mới `healthy`

Đo được ở lần khởi động 21:19. Chưa rõ là phục hồi sau lần tắt máy đột ngột, hay healthcheck
đang đo sai. Nếu **mỗi** lần khởi động đều mất 9 phút thì đó là vấn đề độc lập, cần xử riêng
— và nó cũng là lý do trần chờ trong kịch bản 3.5 đặt tới 20 phút.
