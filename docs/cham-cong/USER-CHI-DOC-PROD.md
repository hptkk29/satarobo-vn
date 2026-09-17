# USER CHỈ-ĐỌC CHO PROD — tạo, lấy chuỗi kết nối, đặt secret

| | |
|---|---|
| **Ngày** | 07/09/2026 |
| **Dùng cho** | Workflow `Chấm công · PROD · ĐO (chỉ đọc — không ghi gì)` — `cham-cong-prod-do-chi-doc.yml` |
| **Secret cần đặt** | `PROD_DATABASE_URL_RO` |
| **Chạy ở đâu** | Supabase Dashboard → **SQL Editor** (kết nối sẵn bằng role `postgres`) |

> Chốt của chủ dự án 07/09: *"Không chấp nhận rủi ro. Từ đây về sau tôi còn phải bấm đo prod nhiều
> lần; một lần cấu hình đổi lấy việc xoá hẳn một loại tai nạn là rẻ."*

---

## Bước 1 — Đặt mật khẩu

**SINH NGẪU NHIÊN.** Đừng nghĩ ra, và tuyệt đối **đừng dùng bất kỳ chuỗi ví dụ nào trong tài liệu
này** — chúng nằm trong repo, ai đọc cũng thấy.

```bash
# một trong hai, đều được
openssl rand -base64 36 | tr -d '/+=' | cut -c1-40
python -c "import secrets,string; print(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(40)))"
```

Chỉ chữ và số, ≥32 ký tự. **Giữ ở nơi an toàn** — sau bước 3 sẽ không đọc lại được.

🔴 **Đừng dán mật khẩu hay chuỗi kết nối vào chat, commit, hay mô tả issue.** Đã xảy ra thật ngày
07/09: chuỗi kết nối đầy đủ bị dán vào chat, và mật khẩu trong đó chính là chuỗi ví dụ chép từ tài
liệu này. Phải xoay lại.

Trong SQL dưới đây, thay `DAT_MAT_KHAU_O_DAY` bằng mật khẩu vừa sinh.

---

## Bước 2 — SQL tạo role chỉ-đọc

Dán **nguyên khối** vào Supabase SQL Editor rồi chạy một lần:

```sql
-- ── USER CHỈ-ĐỌC CHO WORKFLOW ĐO PROD (07/09/2026) ─────────────────────────────────────
-- Role này CHỈ được SELECT. Không INSERT/UPDATE/DELETE, không tạo bảng, không đổi schema.

-- 1. Tạo role đăng nhập được. NOSUPERUSER/NOCREATEDB/NOCREATEROLE là mặc định, ghi ra cho rõ.
CREATE ROLE satarobo_readonly
  WITH LOGIN PASSWORD 'DAT_MAT_KHAU_O_DAY'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

-- 2. Cho phép kết nối vào database.
GRANT CONNECT ON DATABASE postgres TO satarobo_readonly;

-- 3. Cho phép NHÌN THẤY schema public (chưa phải đọc dữ liệu).
GRANT USAGE ON SCHEMA public TO satarobo_readonly;

-- 4. SELECT trên mọi bảng ĐANG CÓ.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO satarobo_readonly;

-- 5. SELECT trên mọi bảng TẠO SAU NÀY.
--    `FOR ROLE postgres` là phần dễ quên nhất: DEFAULT PRIVILEGES chỉ áp cho bảng do ĐÚNG role
--    đó tạo ra. Prisma migrate chạy bằng `postgres`, nên phải ghi rõ role đó — thiếu vế này thì
--    mọi bảng sinh bởi migration sau hôm nay sẽ vô hình với user đo, và số đo lặng lẽ thiếu.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO satarobo_readonly;

-- 6. Chặn tạo đối tượng mới trong schema (thừa với Postgres 15+, vô hại, để cho chắc).
REVOKE CREATE ON SCHEMA public FROM satarobo_readonly;
```

### Kiểm ngay sau khi chạy

```sql
-- Phải ra: có SELECT, KHÔNG có UPDATE/INSERT/DELETE.
SELECT
  has_table_privilege('satarobo_readonly', 'public."ClassSession"', 'SELECT') AS doc_duoc,
  has_table_privilege('satarobo_readonly', 'public."ClassSession"', 'UPDATE') AS ghi_duoc,
  has_table_privilege('satarobo_readonly', 'public."ClassSession"', 'INSERT') AS them_duoc,
  has_table_privilege('satarobo_readonly', 'public."ClassSession"', 'DELETE') AS xoa_duoc;
```

Kỳ vọng: `doc_duoc = true`, ba cột còn lại `false`. Sai bất kỳ cột nào thì **đừng đặt secret**.

---

## Bước 3 — Lấy chuỗi kết nối

**Supabase Dashboard → Project Settings → Database → Connection string → tab `Session pooler`.**

Chuỗi mẫu Supabase đưa ra:

```
postgresql://postgres.abcdefghijklmnop:[YOUR-PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres
```

Sửa **hai chỗ**, giữ nguyên phần còn lại:

| Sửa gì | Từ | Thành |
|---|---|---|
| **CHỈ chữ `postgres`**, giữ nguyên dấu chấm và mã dự án sau nó | `postgres`.abcdefghijklmnop | `satarobo_readonly`.abcdefghijklmnop |
| Mật khẩu | `[YOUR-PASSWORD]` | mật khẩu ở Bước 1 |

🔴 **Lỗi đã xảy ra thật ở lần chạy đầu (07/09):** thay **cả cụm** `postgres.abcdefghijklmnop`
thành `satarobo_readonly` ⇒ mất mã dự án ⇒
`Authentication failed … credentials for 'satarobo_readonly' are not valid`.

Nhìn vào chuỗi đã sửa: **phải còn đúng một dấu chấm giữa tên role và mã dự án.**

```
postgresql://satarobo_readonly.abcdefghijklmnop:<MẬT_KHẨU>@aws-0-….pooler.supabase.com:5432/postgres
                             ↑ dấu chấm này KHÔNG được mất
```

Kết quả:

```
postgresql://satarobo_readonly.abcdefghijklmnop:<mật khẩu>@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres
```

⚠️ **Phải là `Session pooler` (cổng `:5432`), KHÔNG phải `Transaction pooler` (`:6543`).** Transaction
pooler không giữ prepared statement giữa các câu lệnh; script đo chạy hàng trăm truy vấn liên tiếp
nên sẽ chết giữa chừng với `prepared statement "sN" does not exist`. Repo đã ăn lỗi này hai lần —
xem `scripts/_script-db.ts`.

⚠️ **Phần `.abcdefghijklmnop` sau tên user là bắt buộc** — Supavisor định tuyến theo mã dự án nằm
trong username. Bỏ nó đi là không kết nối được.

⚠️ **Mật khẩu không được chứa `@ / : ? # [ ]`** — chúng làm vỡ cú pháp URL. Dùng mật khẩu chỉ gồm
chữ và số. Lỡ đặt rồi thì đổi:
`ALTER ROLE satarobo_readonly WITH PASSWORD '<chuỗi ngẫu nhiên sinh ở Bước 1>';`

✅ Từ 07/09, workflow đo **tự kiểm hình dạng chuỗi trước khi chạm DB** và fail trong ~1 giây với
câu chỉ đúng chỗ sai (thiếu mã dự án · sai cổng · mật khẩu có ký tự lạ), thay vì tốn 40 giây cài
đặt rồi mới chết ở Prisma. Nó **không in giá trị secret** ra log.

---

## Bước 4 — Đặt secret

**GitHub → repo → Settings → Secrets and variables → Actions → New repository secret**

- **Name:** `PROD_DATABASE_URL_RO`
- **Secret:** chuỗi ở Bước 3

Không đụng `PROD_DATABASE_URL` và `PROD_DIRECT_URL` — chúng vẫn để cho workflow ghi
(`cham-cong-prod-seed.yml`) dùng. Workflow đo **cố ý không đọc hai secret đó**.

---

## Bước 5 — Bấm thử

**Actions → `Chấm công · PROD · ĐO (chỉ đọc — không ghi gì)` → Run workflow → `viec = tat-ca`.**

Dòng đầu log phải là:

```
[quyen] user=satarobo_readonly · chỉ đọc
```

Thấy `CÓ QUYỀN GHI` nghĩa là secret đang trỏ nhầm sang chuỗi đầy quyền → **dừng, sửa secret**.

---

## Nếu số đo ra 0

**Con số 0 trên prod gần như chắc chắn KHÔNG phải sự thật.** Cả hai script đã tự phát hiện và in
cảnh báo, nhưng đây là cách chẩn đoán:

### Nguyên nhân số một: Row Level Security

Role `postgres` là **chủ sở hữu bảng** nên **bỏ qua RLS**. `satarobo_readonly` thì **không** — nếu
bảng bật RLS mà không có policy nào cho phép role này, `SELECT` trả về **0 dòng chứ không báo lỗi**.
Đó là kiểu hỏng tệ nhất: một con số trông hoàn toàn hợp lệ.

Repo này **có bật RLS** trên nhiều bảng (migration `20260617…`), nên khả năng gặp là thật.

**Chẩn đoán** — chạy trong SQL Editor (đang là `postgres`):

```sql
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('ClassSession', 'Enrollment', 'Attendance', 'StaffTimeLog');
```

`relrowsecurity = true` ở bảng nào thì bảng đó sẽ lọc `satarobo_readonly`.

**Cách xử, theo thứ tự ưu tiên:**

1. **Cấp `BYPASSRLS`** — gọn nhất, nhưng cần quyền superuser:
   ```sql
   ALTER ROLE satarobo_readonly BYPASSRLS;
   ```
   Trên Supabase, role `postgres` **có thể không đủ quyền** làm việc này. Báo lỗi thì đi cách 2.

2. **Policy SELECT riêng cho role đo** trên từng bảng cần đo:
   ```sql
   CREATE POLICY doc_cho_bao_cao ON public."ClassSession"
     FOR SELECT TO satarobo_readonly USING (true);
   ```
   Lặp cho `Enrollment`, `Attendance`, `Class`. Rõ ràng và không cần superuser, nhưng phải nhớ
   thêm policy khi có bảng mới cần đo.

3. **Không cách nào chạy được** → báo lại, tôi đổi script sang in cảnh báo và dừng hẳn thay vì
   trả một con số nhìn hợp lệ.

### Nguyên nhân số hai: quên `ALTER DEFAULT PRIVILEGES`

Nếu chỉ một số bảng ra 0 (những bảng **mới sinh sau** ngày tạo role), là do thiếu bước 5 hoặc thiếu
vế `FOR ROLE postgres`. Chạy lại bước 4 + 5 của khối SQL — cả hai đều an toàn khi chạy lại.

---

## ⚠️ LUẬT: script đo in MÃ NV, KHÔNG in TÊN

> Chốt của chủ dự án 16/09/2026: *"Thói quen in MÃ NV chứ không in TÊN trong mọi script đo,
> vì log Actions của repo public đọc được. Ghi thành luật, cạnh luật về user chỉ-đọc."*

**Repo này PUBLIC.** Log của GitHub Actions vì thế ai cũng đọc được, không cần đăng nhập,
và **không xoá đi được** một cách đáng tin — log còn nằm trong lịch sử run, trong cache, và
trong bất cứ thứ gì đã kịp lập chỉ mục nó.

Mà đầu ra của một phép đo chấm công thì đúng là hồ sơ nhân sự: ai đi muộn mấy lần, ai nghỉ
mấy ngày, ai không quét thẻ. Đó là thứ **không được rời khỏi hệ thống**.

### Được in

| In | Vì sao |
|---|---|
| `employeeCode` (`SR.NV.007`) | Chuỗi nội bộ, vô nghĩa với người ngoài. Nhân sự tra ra người ngay trên `/admin/nhan-su` |
| `userId` (cuid) | Vô nghĩa với người ngoài; dán thẳng vào ô `user_id` của workflow được |
| Phòng ban · mã ca · cờ · ngày · số đếm | Không chỉ vào cá nhân nào |

### KHÔNG được in

| Cấm | Vì sao |
|---|---|
| `User.name` / `Employee.fullName` | Tên thật. Đây là vế chính của luật |
| `User.email` | **Tệ hơn cả tên** — nó vừa định danh vừa là địa chỉ liên lạc |
| `AuditLog.actorName` | Ảnh chụp tên thật, rất dễ lọt vì nó nằm sẵn trong dòng audit |
| Số điện thoại · địa chỉ · ngày sinh | Khỏi bàn |

### Cách làm cho luật tự giữ mình

Đừng `select` cột tên **ngay từ truy vấn**, đừng lấy về rồi nhớ đừng in. Lấy về là sớm muộn
có người `console.log(row)` cả object:

```ts
const thieu = await db.employee.findMany({
  where: { … },
  // KHÔNG `select` name/email — repo PUBLIC, xem docs/cham-cong/USER-CHI-DOC-PROD.md
  select: { employeeCode: true, department: true },
});
```

### Sổ sự cố

| Ngày | Chuyện gì |
|---|---|
| 15/09/2026 | `tinh-lai-mot-ngay.ts` in `name ?? email ?? id`. Chạy trên prod là **email nhân sự nằm trong một log công khai**. Vá bằng cách bỏ hẳn `name`/`email` khỏi `select`, không phải bằng cách đổi thứ tự — xem `docs/cham-cong/VE-TEN-THAT-TRONG-LOG-ACTIONS.md` |
| 15/09/2026 | `do-noi-chiu-cong-lech.ts` in tên trong bảng "tham số để bấm nút". Vá: chỉ in `userId` |
| 16/09/2026 | `do-cong-ngay-khong-quet.ts` viết mới — in `employeeCode` + phòng ban ngay từ đầu, không phải vá sau |

⚠️ Luật này áp cho **mọi script trong `scripts/`**, không riêng script chấm công, và cho cả
bước `run: echo …` trong workflow. Cổng duy nhất hiện nay là **người viết nhớ** — chưa có
lint hay test nào canh. Nếu thấy một script sắp in tên, sửa ngay tại chỗ.

---

## Thu hồi

Hết dùng, hoặc nghi mật khẩu lộ:

```sql
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM satarobo_readonly;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM satarobo_readonly;
REVOKE ALL PRIVILEGES ON DATABASE postgres FROM satarobo_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT ON TABLES FROM satarobo_readonly;
DROP ROLE satarobo_readonly;
```

Rồi xoá secret `PROD_DATABASE_URL_RO` trên GitHub.

Chỉ đổi mật khẩu (không thu hồi quyền):

```sql
ALTER ROLE satarobo_readonly WITH PASSWORD 'MAT_KHAU_MOI';
```


---

## Ghi chú 17/09/2026 — vai thứ hai, và một việc còn nợ

**Vai đang dùng thật không tên `satarobo_readonly`.** Chủ dự án tạo `doisoat_ro` (SELECT toàn
schema · `BYPASSRLS` · `default_transaction_read_only=on`) và đặt vào cùng secret
`PROD_DATABASE_URL_RO`. Các câu SQL trên vẫn đúng khuôn — chỉ thay tên vai. Hai workflow
chỉ-đọc (chấm công + `doi-soat-tien-prod-chi-doc.yml`) dùng CHUNG một secret này.

> `default_transaction_read_only=on` là một lớp khoá NỮA, nằm ở phía DB. Nó **không thay thế**
> `SET TRANSACTION READ ONLY` trong script: một thuộc tính vai thì ai có quyền đều sửa
> được bằng một câu `ALTER ROLE`, và không có gì trong repo nói cho ta biết điều đó đã
> xảy ra. Hai lớp độc lập mới là hai lớp.

### NỢ: `_kiem-quyen.ts` đang hỏi quyền trên SAI BẢNG

`scripts/_kiem-quyen.ts` hỏi `has_table_privilege(current_user, 'public."ClassSession"', 'UPDATE')`
— tên bảng đó **đóng cứng**, từ đợt chấm công. Chính chú thích của nó nói *"quyền trên chính
bảng mình sắp đọc mới là quyền có ý nghĩa"*, nhưng báo cáo đối soát tiền đọc
`BankTransaction` · `Payment` · `Order` · `PaymentRequest`, không đọc `ClassSession`.

**Chưa vá vì nó vẫn bắt đúng ca cần bắt**: thứ phải phát hiện là *secret bị đặt nhầm sang
chuỗi đầy quyền*, mà vai đầy quyền thì có `UPDATE` trên MỌI bảng — `ClassSession` đủ để lộ
ra. Ngược lại, một vai `doisoat_ro` có `UPDATE` trên `BankTransaction` mà không có trên
`ClassSession` là cấu hình không tồn tại thật.

**Việc phải làm (đợt riêng):** thêm tham số bảng cho `kiemQuyen(db, bang)` — không đặt mặc
định (luật 7: để `tsc` liệt kê cả hai chỗ gọi), rồi workflow tiền truyền `BankTransaction`,
workflow chấm công truyền `ClassSession`. Chạm file dùng chung nên phải chạy lại cả hai
workflow — đó là lý do nó không đi kèm đợt này.
