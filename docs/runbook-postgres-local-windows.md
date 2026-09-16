# Runbook — Postgres local trên Windows chết giữa chừng

> Chẩn đoán 16/09/2026 trên máy dev, đọc từ `~/scoop/apps/postgresql/current/pg.log`
> (6.853 dòng, 22/08 → 16/09). **Đây là bản chẩn đoán + đề xuất. Chưa đổi gì trên máy.**
> Mục 5 liệt kê những thứ cần chủ máy quyết mới làm được.

---

## 1. Triệu chứng

Postgres đang chạy thì im, và **`pg_ctl status` vẫn báo "server is running"**.
Hệ quả nguy hiểm hơn cả việc mất DB: bộ test chạm DB dùng `describe.skipIf(!RUN)` nên
**SKIP sạch, không đỏ** — người chạy thấy xanh và báo PASS, CI có Postgres nên đỏ.

**Cách hỏi đúng, mất 2 giây:**

```powershell
& "$env:USERPROFILE\scoop\apps\postgresql\current\bin\pg_isready" -h 127.0.0.1 -p 5432
```

`pg_ctl status` chỉ đọc `postmaster.pid` rồi hỏi Windows "PID này còn sống không". Máy chủ
chết bẩn thì file pid **nằm lại**, và Windows cấp phát PID vòng lại rất nhanh — một tiến
trình khác trùng số là nó báo "đang chạy". `pg_isready` bắt tay thật ở cổng, không đoán.

---

## 2. Chuyện đã thật sự xảy ra — đếm từ nhật ký

| Đo | Số |
|---|---|
| Số lần khởi động trong 25 ngày | **8** |
| Trong đó **tắt sạch** (`shutting down`) | **1** (24/08) |
| **Chết bẩn** (`database system was not properly shut down`) | **7** |

Tức là từ 25/08 tới nay **chưa lần nào máy chủ được tắt tử tế**.

**Chữ ký lỗi, đếm trên toàn nhật ký:**

| Dấu vết | Số lần | Nghĩa thật |
|---|---|---|
| `error code 1455` | 3 | `ERROR_COMMITMENT_LIMIT` — Windows từ chối cấp bộ nhớ vì **hết hạn mức commit** |
| `exception 0xC000012D` | 1 | `STATUS_COMMITMENT_LIMIT` — y như trên, ở tầng tiến trình con |
| `exception 0xC0000142` | 2 | `STATUS_DLL_INIT_FAILED` — tiến trình con không nạp nổi DLL, triệu chứng kinh điển của cùng một sức ép |
| `could not fork` | 2 | không đẻ nổi tiến trình con |
| `error code 487` | 6 | không đặt được vùng nhớ chung ĐÚNG địa chỉ cha đang dùng (va chạm ASLR) |
| `exception 0x40010004` | 1 | `DBG_CONTROL_BREAK` — **Ctrl+Break dội vào cả nhóm tiến trình** |

**Dòng quyết định, lần chết gần nhất (15/09 22:22):**

```
autovacuum launcher process (PID 24128) was terminated by exception 0x40010004
terminating any other active server processes
all server processes terminated; reinitializing
```

và lần 13/09 02:00 — cùng kịch bản, nhưng lượt dựng lại **thất bại luôn**:

```
all server processes terminated; reinitializing
FATAL:  could not create shared memory segment: error code 1455
DETAIL: Failed system call was CreateFileMapping(size=43048960, ...)
LOG:  database system is shut down
```

---

## 3. Nguyên nhân gốc — và nó KHÔNG phải cái ta tưởng

Giả thuyết ban đầu là "Windows giết tiến trình nền vì thiếu RAM". Số liệu nói khác:

| Đo | Giá trị |
|---|---|
| RAM vật lý | **32.536 MB** |
| Hạn mức commit (RAM + pagefile) | **46.872 MB** |
| Pagefile | Windows **tự quản**, đang cấp 14.336 MB |
| **Đỉnh sử dụng pagefile từ trước tới nay** | **59 MB** |

Ba điều rút ra:

1. **Không hề thiếu RAM.** Đỉnh dùng pagefile 59 MB nghĩa là máy gần như chưa bao giờ
   phải đẩy trang ra đĩa. Cái chết không do hết RAM vật lý.
2. **Thiếu HẠN MỨC COMMIT, và thiếu theo từng cơn.** `CreateFileMapping(size=43048960)`
   — xin có **41 MB** — mà trượt. Một máy 32 GB trượt ở 41 MB chỉ có một cách: ngay
   khoảnh khắc đó hạn mức commit đã cạn. Pagefile tự quản **bắt đầu nhỏ rồi mới nở ra
   khi cần**, mà nở là thao tác ghi đĩa mất vài giây; mọi yêu cầu cấp phát rơi vào đúng
   cửa sổ đó đều trượt. Cơn này sinh ra khi Docker Desktop + `next dev` + đám worker
   Vitest + Chrome cùng đòi commit một lúc.
3. **Postgres là nạn nhân, không phải thủ phạm.** Cấu hình đã ở mức tối thiểu từ trước:
   `shared_buffers = 32MB`, `max_connections = 30`, `huge_pages = off`. **Siết thêm
   không cứu được gì** — đừng đi đường đó nữa.

**Còn `0x40010004` là một cái chết KHÁC hẳn, phải vá riêng.** `DBG_CONTROL_BREAK` nghĩa là
có người gửi Ctrl+Break tới **nhóm tiến trình**. Postgres khởi động bằng `pg_ctl start` gõ
trong terminal thì nó nằm cùng nhóm với cái terminal ấy; cửa sổ đó đóng, hoặc phiên
agent bị giết, hoặc cây tiến trình bị dọn — Windows dội CTRL_BREAK cho cả nhóm, và máy
chủ chết theo. Đây chính là phần "Windows giết tiến trình nền" của giả thuyết ban đầu:
**đúng, nhưng chỉ 1 trong 9 sự cố.**

### Chuỗi đầy đủ

```
cửa sổ khởi động Postgres bị đóng/giết
        ↓  CTRL_BREAK dội vào nhóm tiến trình   (0x40010004)
một tiến trình con chết
        ↓  postmaster: "terminating any other active server processes; reinitializing"
tự dựng lại — bình thường thì sống sót ở đây
        ↓  NHƯNG nếu đúng lúc hạn mức commit đang cạn
CreateFileMapping trượt  (1455 / 0xC000012D)
        ↓
"database system is shut down"  →  postmaster.pid NẰM LẠI
        ↓
pg_ctl status nói dối "server is running"  →  test SKIP sạch, không ai thấy đỏ
```

Một cú sốc sống sót được biến thành một lần chết hẳn, chỉ vì mắt xích thứ hai.

---

## 4. Xử lý khi nó đang chết (làm ngay, không cần quyết định gì)

```powershell
# Chỉ xem, không sửa:
pwsh -File scripts\pg-local-hoi-phuc.ps1 -ChiKiemTra

# Chẩn đoán rồi dựng lại:
pwsh -File scripts\pg-local-hoi-phuc.ps1
```

Script `scripts/pg-local-hoi-phuc.ps1` làm đúng thứ tự đã bàn:

1. hỏi `pg_isready` (không tin `pg_ctl status`);
2. đọc đuôi `pg.log`, **nói rõ chết kiểu gì** — commit hay Ctrl+Break — vì hai ca này
   dựng lại giống nhau nhưng cách phòng khác hẳn;
3. `pg_ctl stop -m immediate` (không dùng `fast`: máy chủ đã câm, `fast` sẽ ngồi chờ
   những tiến trình con vốn đã chết);
4. dọn `postgres.exe` mồ côi;
5. **chỉ xoá `postmaster.pid` sau khi chắc chắn không còn tiến trình nào** — xoá lúc máy
   chủ còn sống là mở đường cho một instance thứ hai ghi đè lên cùng thư mục `data`;
6. khởi động bằng `Start-Process -WindowStyle Hidden`, **tách khỏi cửa sổ đang gọi**;
7. chờ tới khi `pg_isready` thật sự xanh, **mặc định 360 giây** — phục hồi sau chết bẩn
   phải đọc lại WAL, lần lâu nhất đo được trong nhật ký là ~5 phút (06/09 20:55 → 21:11),
   nên đừng chờ 30 giây rồi kết luận "khởi động thất bại".

---

## 5. Đề xuất phòng ngừa — **cần chủ máy quyết, tôi chưa làm**

### 5.1 Đặt pagefile cố định ≥ 32 GB *(khuyến nghị mạnh nhất — bịt 8/9 sự cố)*

Đây là chỗ chữa đúng bệnh: bỏ hẳn bước "nở pagefile" mà mọi lần trượt đều rơi vào.

- Ở đâu: `sysdm.cpl` → Advanced → Performance **Settings** → Advanced → Virtual memory
  **Change** → bỏ tick *Automatically manage* → chọn ổ C: → **Custom size**:
  Initial `32768` MB, Maximum `32768` MB → **Set** → OK → **khởi động lại máy**.
- Giá phải trả: 32 GB đĩa. Đảo ngược được bất cứ lúc nào bằng cách tick lại ô tự quản.
- Vì sao đặt Initial = Maximum: để Windows cấp trọn ngay từ lúc khởi động. Đặt Initial
  nhỏ là giữ nguyên đúng cái bước nở đang gây trượt.
- Không sửa gì của Postgres, không đụng repo.

### 5.2 Chạy Postgres tách hẳn khỏi mọi console *(bịt ca `0x40010004`)*

Hôm nay Postgres sống hay chết phụ thuộc vào việc cửa sổ nào đó có bị đóng không — kể cả
cửa sổ của một phiên agent. Hai đường, đều không cần quyền admin:

| Cách | Ưu | Nhược |
|---|---|---|
| **Task Scheduler**, trigger *At log on*, action `pg_ctl.exe … start`, tick *Run whether user is logged on or not* | không cần admin; tự lên sau mỗi lần đăng nhập | vẫn chạy dưới phiên người dùng |
| `pg_ctl register` → dịch vụ Windows | lên cùng máy, độc lập hoàn toàn với đăng nhập | **cần quyền admin** — mà scoop-Postgres được chọn chính vì không cần admin |

Nếu vẫn khởi động tay thì tối thiểu đừng gõ `pg_ctl start` trần trong terminal —
dùng script ở mục 4, nó đã `Start-Process -WindowStyle Hidden`.

### 5.3 Giảm sức ép commit lúc chạy test *(rẻ, làm được ngay)*

Đỉnh commit đến từ việc chạy chồng. Trước khi chạy bộ test chạm DB, tắt Docker Desktop
nếu không cần (WSL2 `vmmem` giữ commit rất lớn), và cân nhắc hạ số worker Vitest.

### 5.4 Những thứ **ĐỪNG** làm

- ❌ **Đừng hạ tiếp `shared_buffers`.** Đang là 32MB rồi; Postgres không phải chỗ ngốn bộ nhớ ở máy này.
- ❌ **Đừng đổi `dynamic_shared_memory_type`.** Đang là `windows`, đúng; nó không liên quan tới 1455.
- ❌ **Đừng xoá `postmaster.pid` khi chưa kiểm `Get-Process postgres`.** Còn tiến trình mà
  xoá pid là mời một instance thứ hai ghi đè lên cùng thư mục `data` — hỏng DB thật, không phải hỏng dịch vụ.
- ❌ **Đừng tin `pg_ctl status`.** Xem mục 1.

---

## 6. Liên quan

- `.claude/rules/prisma-db.md` — dựng Postgres local, hai bẫy `pg_ctl start` tiền cảnh và `error code 487`.
- `scripts/pg-local-hoi-phuc.ps1` — script ở mục 4.
