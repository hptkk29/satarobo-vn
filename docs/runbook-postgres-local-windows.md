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

> **Lần thứ CHÍN — 18/09/2026, giữa lượt hợp nhất `main` → `test`.** Đáng ghi vì nó cho
> thấy cái giá thật của lớp lỗi này: `pnpm build` đỏ ở trang `/vinh-danh/tat-ca` với
> `PrismaClientInitializationError`, và **một cổng đỏ giữa lượt gộp trông y hệt một lượt
> gộp làm hỏng mã**. Tôi đã sắp đi tìm nguyên nhân trong chính bản gộp.
>
> Thứ cắt ngắn chuyện đó là **hỏi đúng câu**: `pg_isready` trả `no response` trong khi
> `pg_ctl status` vẫn khẳng định *"server is running (PID 19040)"* — đúng **bẫy thứ ba**
> ở mục 1. Mất 30 giây thay vì nửa tiếng.
>
> ⇒ **Cổng đỏ mà lỗi nhắc tới `127.0.0.1:5432`: chạy `pg_isready` TRƯỚC khi đọc diff.**
> Và đừng tin `pg_ctl status` — nó đọc `postmaster.pid`, không hỏi máy chủ.
>
> **BẪY THỨ TƯ, phát hiện cùng lần này: hồi phục sau chết bẩn MẤT NHIỀU PHÚT và trông y
> hệt treo.** `pg_isready` trả `rejecting connections` (KHÁC `no response` — nghĩa là máy
> chủ đã sống, đang chạy crash recovery), còn nhật ký đổ liên tục
> `FATAL: the database system is starting up` cho mọi lượt kết nối. Cảnh đó dễ bị đọc
> thành "hỏng tiếp, giết đi khởi động lại" — và giết giữa chừng là quay lại vạch xuất
> phát, lần sau còn lâu hơn.
>
> **Cách phân biệt TIẾN với TREO — đọc dòng `syncing data directory (fsync)`:**
> ```
> LOG:  syncing data directory (fsync), elapsed time: 170.00 s, current path: ./base/16384/12991747
> LOG:  syncing data directory (fsync), elapsed time: 180.01 s, current path: ./base/16384/13000971
> ```
> Nó in mỗi 10 giây. **`current path` đổi ⇒ đang TIẾN, cứ chờ.** Đứng yên nhiều lượt mới
> là treo thật. Đo 18/09: qua mốc 200s vẫn đang fsync — DB này có vài trăm nghìn tệp nhánh.
> ⇒ Đặt đồng hồ chờ theo PHÚT, đừng theo giây, và **đừng `pg_ctl restart` khi path còn đổi**.
>
> **Hồi phục có HAI PHA, mỗi pha một dòng tiến độ RIÊNG** — hết pha một mà vẫn
> `rejecting connections` KHÔNG phải là treo:
> ```
> LOG:  syncing data directory (fsync), elapsed time: … , current path: ./base/…   ← pha 1
> LOG:  redo in progress,               elapsed time: … , current LSN:  2/9540D500 ← pha 2
> ```
> Pha 1 nhìn `current path`, pha 2 nhìn `current LSN`. Đo 18/09: pha 1 mất **~12 phút**,
> pha 2 thêm vài phút nữa.
>
> ### ⚠️ MỘT CON SỐ TÔI ĐÃ GHI SAI VÀO CHÍNH MỤC NÀY — và cách nó suýt thành "nguyên nhân gốc"
>
> Trong lúc chờ hồi phục 18/09, tôi đếm tệp rồi ghi vào đây: *"`base/` có 642.475 tệp,
> một database giữ 626.626 — 97,5%"*, kèm kết luận **nguyên nhân gốc là tệp quan hệ mồ
> côi tích lại**. Nghe rất khớp: nó giải thích cả fsync 12 phút lẫn chuỗi chết bẩn.
>
> **Cả hai con số đều SAI.** Đếm lại sau khi máy chủ lên hẳn:
>
> | đo | số THẬT |
> |---|---|
> | tổng tệp trong `data/base` | **20.018** |
> | `satarobo_test` (OID 16384, DB lớn nhất) | **4.177** |
> | `pg_class` của DB đó | 2.558 quan hệ (1710 index · 366 bảng · 337 toast · 145 view) |
>
> 4.177 tệp cho 2.558 quan hệ là **hoàn toàn bình thường** (mỗi quan hệ thêm `_fsm`/`_vm`).
> **Không có tệp mồ côi nào.** Giả thuyết "nguyên nhân gốc" ⇒ **RÚT LẠI**.
>
> **Vì sao phép đo sai:** tôi chạy `find` **trong lúc máy chủ đang fsync/redo**, tức đang
> quét chính thư mục đó. Cùng một lệnh, chạy lại sau khi DB lên, trả `4177` thay vì
> `626626`. Tôi không dựng lại được cơ chế chính xác — và **không bịa một cơ chế nghe
> hợp lý** để lấp chỗ đó.
>
> **BA BÀI HỌC, và cái thứ ba là cái đắt nhất:**
> 1. **Đừng đo một hệ thống đang ở giữa chừng.** Số đọc trong lúc hồi phục không phải số
>    của hệ thống ở trạng thái nghỉ. Chờ `database system is ready` rồi hãy đếm.
> 2. **Một con số vừa lạ vừa khớp quá đẹp với giả thuyết là lúc phải nghi NÓ, không phải
>    lúc mừng.** 626k tệp cho một DB 79 MB là ~130 byte/tệp — vô lý ngay từ đầu, và tôi
>    đã đi tiếp thay vì dừng lại ở chỗ vô lý ấy.
> 3. **Tôi đã kịp GHI nó vào runbook trước khi kiểm.** Đó đúng là lớp lỗi mà luật 12
>    (`CLAUDE.md`) mô tả: một câu sai trong tài liệu hạ tầng không chỉ vô ích — nó lái
>    người đọc sau sang hướng sai và giữ ở đó. Suýt nữa người kế tiếp đi xoá database test
>    để "dọn tệp mồ côi" không hề tồn tại.
>
> ⇒ **Vì sao pha 1 lâu: CHƯA BIẾT.** 20.018 tệp không giải thích được 12 phút; nghi hướng
> fsync từng tệp trên NTFS + phần mềm bảo vệ quét theo tệp, nhưng **chưa đo**. Để mở, và
> để ngỏ đúng như nó đang là — mục 3 (hết hạn mức commit) vẫn là phần đã có bằng chứng.

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

## 5. Phòng ngừa — ✅ CHỦ MÁY ĐÃ CHỐT 20/09/2026

> **Chốt:** làm **5.1** (pagefile cố định) — phần cần quyền admin do chủ máy tự làm.
> **5.5** (tắt tử tế) làm ngay, không cần admin, đã có script trong repo.
> **Dự phòng:** nếu sau **hai tuần** vẫn còn chết bẩn thì chuyển sang **Docker Desktop**
> (Postgres Linux trong container không dính lớp lỗi commit-limit của Windows) — đổi lại
> cần quyền admin cho WSL2/Hyper-V và ~2 GB RAM thường trực.
> ⛔ **KHÔNG** chuyển bộ test sang Postgres từ xa: `resetDb()` TRUNCATE mọi bảng, và luật
> cứng của repo là test không bao giờ trỏ Supabase — đổi là gỡ đúng cái chốt dựng ra sau
> lần mất DB 04/09.

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

### 5.5 Tắt TỬ TẾ trước khi tắt máy ✅ *(đã làm 20/09 — không cần admin)*

**Con số biện hộ cho việc này:** 25/08 → 18/09 có **9 lần khởi động, 8 lần chết bẩn**.
Tức chưa lần nào máy chủ được tắt đúng cách. Và cái đắt **không phải** lần chết — mà là
**hồi phục**: đo 18/09, pha `syncing data directory` ~12 phút + pha `redo` vài phút nữa.
Trong quãng đó `pnpm build` và mọi bộ chạm DB đều đỏ, **trông y hệt mã hỏng**.

⚠️ Việc này **không chữa nguyên nhân gốc** (xem mục 3) — nó cắt phần lớn CHI PHÍ. Chết
bẩn do crash thì script không tránh được; chết bẩn do *"tắt máy lúc Postgres đang chạy"*
thì tránh được hoàn toàn, và đó là phần lớn của 8 lần.

| tệp | dùng khi |
|---|---|
| `scripts/pg-local-tat-tu-te.ps1` | từ terminal — hoặc `pnpm pg:stop` |
| `scripts/Tat-Postgres-Truoc-Khi-Tat-May.cmd` | **bấm đúp** — dành cho lúc sắp tắt máy |

**Script làm đúng ba việc, và mỗi việc có lý do:**

1. Hỏi `pg_isready` chứ không `pg_ctl status` — bẫy thứ ba ở mục 1.
2. Phân biệt **"đã tắt rồi"** với **"đang hồi phục"**. Mã thoát `3` = ĐANG HỒI PHỤC,
   kèm câu *"ĐỪNG tắt máy lúc này"*. Tắt máy giữa lúc crash recovery là quay lại vạch
   xuất phát và lần sau còn lâu hơn — đây là cái bẫy dễ mắc nhất khi đang vội.
3. Dùng `-m fast`. **Đừng đổi sang `immediate`** dù nó nhanh hơn: `immediate` bỏ
   checkpoint ⇒ lần khởi động sau CHẾT BẨN ⇒ tự tay tạo ra đúng thứ đang tránh.
   `smart` cũng sai: nó chờ mọi phiên tự đóng, một tab `psql` quên đóng là treo mãi,
   rồi người ta sốt ruột tắt máy.

Và nó **kiểm lại bằng cổng**, không tin mã thoát của `pg_ctl` — cùng lý do với bước 1.

#### Gắn vào đâu — ba mức, chọn theo mức anh chịu được

| mức | cách | thật sự đáng tin tới đâu |
|---|---|---|
| **A. Bấm đúp** *(khuyến nghị)* | Chuột phải `Tat-Postgres-Truoc-Khi-Tat-May.cmd` → *Send to → Desktop*, rồi kéo lối tắt vào **taskbar** hoặc **Start**. Bấm nó trước khi tắt máy. | **Chắc chắn chạy xong** — cửa sổ tự báo "tắt máy được rồi". Nhược: phải nhớ. |
| **B. Gõ lệnh** | `pnpm pg:stop` | Cùng độ tin cậy với A; hợp nếu anh vốn ở trong terminal. |
| **C. Tự động lúc shutdown** | Task Scheduler → *Create Task* → Trigger **On an event**: log `System`, nguồn `User32`, **Event ID 1074** → Action chạy tệp `.cmd`. | ⚠️ **Tôi không khuyến nghị làm cái này là chỗ dựa duy nhất.** Windows chỉ cho tác vụ shutdown một khoảng rất ngắn rồi giết; nếu Postgres đang bận, checkpoint chưa xong là **vẫn chết bẩn** — mà lần đó anh lại tưởng đã tắt tử tế. Muốn dùng thì dùng KÈM A, đừng thay A. |

> Cách duy nhất khiến A không bị quên: để lối tắt **ngay cạnh chỗ anh bấm Shut down**.
> Đây là vấn đề thói quen, không phải vấn đề kỹ thuật — và tôi không giả vờ script giải
> quyết được nó.

#### Đối chứng: làm sao biết nó có tác dụng

Lần khởi động **kế tiếp** sau khi tắt bằng script, nhật ký **KHÔNG** được có dòng:

```
LOG:  database system was not properly shut down; automatic recovery in progress
```

```powershell
Select-String -Path "$env:USERPROFILE\scooppps\postgresql\current\pg.log" `
  -Pattern "was not properly shut down" | Select-Object -Last 3
```

Còn dòng đó sau một lượt tắt bằng script ⇒ script **không** được chạy, hoặc chạy mà
chưa xong. Đừng ghi nhận là "đã khắc phục" khi chưa thấy đối chứng này.

## 6. Liên quan

- `.claude/rules/prisma-db.md` — dựng Postgres local, hai bẫy `pg_ctl start` tiền cảnh và `error code 487`.
- `scripts/pg-local-hoi-phuc.ps1` — script ở mục 4.
