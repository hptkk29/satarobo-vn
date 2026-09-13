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
