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
| `~/.cloudflared/cert.pem` | **không có** | ⛔ **chưa đăng nhập Cloudflare** |
| Tunnel hiện tại | `echo-hong-except-quest.trycloudflare.com` | ⛔ tạm, đổi tên mỗi lần chạy lại |
| Tiến trình `cloudflared.exe` | **4 tiến trình** | ⚠️ tunnel tạm chồng nhau, dọn sau khi có tunnel tên |
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
