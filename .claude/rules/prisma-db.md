---
description: Prisma + Supabase patterns, migrations, seed
globs: ["prisma/**/*", "lib/db.ts", "lib/validators/**/*"]
---

# Prisma + Database

## Supabase IPv6 quirk (CRITICAL)

Direct connection `db.<ref>.supabase.co:5432` chỉ có **IPv6 AAAA record** — mạng IPv4 không tới được.

→ **Luôn dùng pooler:**
- Runtime (`DATABASE_URL`): transaction pooler `aws-X-region.pooler.supabase.com:6543`
- Migrations (`DIRECT_URL`): session pooler `aws-X-region.pooler.supabase.com:5432`
- Username dạng `postgres.<project-ref>` (KHÔNG phải `postgres`)

## Test database = Postgres LOCAL (Docker) — KHÔNG dùng Supabase

> ⚠️ **Test (Vitest/Playwright, từ A0-00 trở đi) chạy trên Postgres local, KHÔNG bao giờ trỏ vào Supabase prod/dev.** `resetDb()` xóa sạch DB — trỏ nhầm vào Supabase = mất dữ liệu thật.

- **Dựng DB test (Docker):**
  ```bash
  docker run -d --name satarobo-test-db -p 5432:5432 \
    -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=satarobo_test postgres:16
  ```
  (Trùng cấu hình Postgres service của CI job `e2e-a0` trong A0-00.)
- **Không có Docker / không có quyền admin (Windows):** Docker Desktop CẦN admin (WSL2/Hyper-V) → dùng **Postgres portable qua scoop** (không cần admin), đã verify chạy được:
  ```powershell
  irm get.scoop.sh | iex                 # cài scoop (user-scope)
  scoop install postgresql               # portable, superuser=postgres, trust auth local
  $bin="$env:USERPROFILE\scoop\apps\postgresql\current"
  & "$bin\bin\pg_ctl" -D "$bin\data" -l "$bin\pg.log" -o "-p 5432" start
  & "$bin\bin\createdb" -U postgres -h 127.0.0.1 -p 5432 satarobo_test
  # dừng: & "$bin\bin\pg_ctl" -D "$bin\data" stop
  ```
  `trust` auth → password trong URL bị bỏ qua nhưng vẫn kết nối OK. Cùng port/DB nên `.env.test` không đổi.
- **Env riêng cho test:** `.env.test` (đã `.gitignore`, KHÔNG commit).
  ⚠️ **KHÔNG PHẢI chỉ hai dòng DB.** Chính câu đó ở đây đã làm bộ R7 đầy đủ đỏ giả 9 ca
  suốt một thời gian — xem bảng đầy đủ ngay dưới, mục "Biến môi trường cho test ở local".

### Biến môi trường cho test ở local — ĐỐI CHIẾU VỚI `ci.yml`, không chỉ hai dòng DB

> 🔴 **Sự cố 09/09/2026.** `.env.test` chỉ có `DATABASE_URL` + `DIRECT_URL`. Chạy bộ R7
> ĐẦY ĐỦ ở local ra **364 xanh / 9 đỏ**; đặt thêm `NEXTAUTH_SECRET` ⇒ **373 xanh / 0 đỏ**.
> 364 + 9 = 373, khớp chính xác — cả 9 ca đỏ là do THIẾU BIẾN, không phải mã hỏng.
>
> Vì sao nguy hiểm hơn vẻ ngoài: **một bộ test đỏ vì môi trường thì người ta học cách bỏ
> qua nó** — rồi bỏ qua luôn lần nó đỏ THẬT. Đó chính là đường dẫn tới commit trên lượt đỏ
> hôm 09/09 (luật 6). Bộ test đỏ giả ăn mòn cổng nhanh hơn bộ test không có.

`.env.test` nằm trong `.gitignore` nên máy mới **luôn bắt đầu từ số không**. Bảng dưới là
thứ chép sang, đối chiếu từ `.github/workflows/ci.yml`:

| Biến | Đặt trong `.env.test`? | Vì sao |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | **CÓ** | Postgres local |
| `NEXTAUTH_SECRET` | **CÓ** | `lib/security/signing-key.ts` **NÉM LỖI** nếu thiếu hoặc <32 ký tự. Đây là biến đã gây 9 ca đỏ |
| `AUTH_SECRET` | **CÓ** | `signing-key.ts` đọc `NEXTAUTH_SECRET ?? AUTH_SECRET`; đặt cả hai cho khớp mọi đường |
| `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL` | **CÓ** (cổng 3100) | cần cho bộ CÓ dựng Next: a0 · smoke · site GV · e-learning |
| `BASE_URL` | **KHÔNG** | mỗi bộ một cổng (smoke 3000, a0/r7 3100) và mọi config đã có mặc định. Đặt chung là bẻ bộ còn lại |
| `*_SKIP_WEBSERVER` (A0/R1–R7/CRM/FL/ELEARNING/TEACHER) | **KHÔNG** | cờ TĂNG TỐC bật theo từng lượt. Đặt cứng ⇒ bộ cần trình duyệt mất webserver và đỏ vì lý do chẳng liên quan |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | **KHÔNG** | cấu hình container của CI, không phải biến ứng dụng |
| `CI_DATABASE_URL` | **KHÔNG** | bí danh chỉ dùng trong `ci.yml` |

Giá trị mẫu cho hai khoá ký — **chuỗi TEST, vô hại**, cố ý trùng giá trị CI dùng để hành vi
ở hai nơi giống nhau:

```
NEXTAUTH_SECRET="ci-build-only-secret-do-not-use-in-prod-32chars"
AUTH_SECRET="ci-build-only-secret-do-not-use-in-prod-32chars"
NEXTAUTH_URL="http://localhost:3100"
NEXT_PUBLIC_APP_URL="http://localhost:3100"
```

⚠️ **Một khác biệt của CI mà `.env.test` KHÔNG chép được:** CI chia bộ R7 làm **hai shard,
mỗi shard một container Postgres RIÊNG** (`ci.yml:438-441`). Chạy cả bộ R7 trên MỘT DB ở
local là cấu hình CI không dùng — `resetDb()` của spec này xoá dữ liệu spec kia. Gặp đỏ lạ
khi chạy cả bộ thì chạy `--shard=1/2` và `--shard=2/2` trên HAI database khác nhau trước
khi kết luận có hồi quy.

- **Trước khi test:** apply schema lên DB test: `prisma migrate deploy` (hoặc `db push`) với env test, rồi seed helper.
- **`resetDb()`** trong `tests/e2e/_helpers/seed.ts` reset/truncate **programmatic qua Prisma client** (đọc `TEST_DATABASE_URL`/`.env.test`) — không gọi shell, nên hook destructive không chặn. Helper PHẢI assert URL là `127.0.0.1`/`localhost` trước khi reset (fail-safe chống trỏ nhầm prod).

## BA database trên máy — đừng trộn (30/08/2026)

| DB | Ai dùng | Có được TRUNCATE không |
|---|---|---|
| `satarobo_test` | bộ test (`resetDb()`) | **CÓ** — đó là việc của nó |
| `satarobo_local` | **dev server localhost** | **KHÔNG BAO GIỜ** |
| `satarobo_dev` | tra cứu tay | KHÔNG |

Vì sao tách: trước 30/08 dev server và bộ test **dùng chung** `satarobo_test`. Chạy
test trong lúc chủ dự án đang xem localhost là `TRUNCATE` sạch mọi bảng ngay dưới chân
họ — 16 tài khoản UAT biến mất, và triệu chứng ném ra là **"sai mật khẩu"** chứ không
phải "mất dữ liệu", nên mất công dò mới ra.

`assertTestDb()` nay chặn **theo TÊN database**, không chỉ theo host: vế "là localhost"
cho qua mọi DB trên máy, kể cả DB đang phục vụ dev server. Chỉ `satarobo_test` /
`ci_test` mới reset được.

**Chạy dev server:**

```bash
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/satarobo_local' DIRECT_URL="$DATABASE_URL" pnpm dev -p 3000
```

Dựng lại `satarobo_local` từ đầu (createdb → migrate → seed nền → org → vai → UAT):

```bash
createdb -U postgres -h 127.0.0.1 satarobo_local
# rồi với DATABASE_URL/DIRECT_URL trỏ satarobo_local:
pnpm exec prisma migrate deploy && pnpm db:seed && pnpm db:seed:orgunit   && pnpm db:seed:roles && UAT_SEED=1 pnpm db:seed:uat
```

## Reset DB — chỉ cho phép trên DB test (local)

- `pnpm db:reset` / `prisma migrate reset` trần → **hook `block-destructive.sh` CHẶN** (bảo vệ prod).
  ⚠️ Câu trên **SAI suốt nhiều tháng**: hook đọc lệnh từ một biến môi trường không
  tồn tại, và chặn bằng mã thoát mà Claude Code không coi là chặn ⇒ nó chưa từng
  chặn được gì. **Vá 09/09/2026**, nay có `.claude/hooks/hooks.test.ts` cấy thử.
  Xem luật 14 — `docs/luat-doc-so-va-ket-luan.md`.
- Chỉ được reset khi command thể hiện rõ target local/test (chứa `localhost` / `127.0.0.1` / `.env.test` / `satarobo_test`). Ví dụ PowerShell:
  ```powershell
  $env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/satarobo_test'; pnpm prisma migrate reset --force --skip-seed
  ```
  Hook thấy `127.0.0.1` → cho qua. Không có marker local → vẫn chặn.

## Sandbox & quyền (Claude Code) cho test/db

- Lệnh **dev** đụng Supabase (`db:migrate`, `db:seed`, `db:studio`) cần **mạng ra ngoài** → đã thêm vào allow-list `.claude/settings.local.json` (chạy ngoài sandbox). Lỗi *network blocked / can't reach database* khi chạy các lệnh này = bị sandbox chặn, approve permission là xong.
- Lệnh **test** (`test:unit`, `test:e2e`) chỉ cần Postgres local → không cần mạng Supabase; đã thêm allow-list.

## Migrations

> ⛔ **CẤM `prisma migrate dev` (= `pnpm db:migrate`) cho tới khi drift 14 bảng được đóng
> [chốt 08/09/2026].** Xem CLAUDE.md mục "Prisma migrations" — repo đang lệch sẵn giữa
> `prisma/migrations` và `schema.prisma`, nên `migrate dev` sẽ tự sinh một migration "sửa kiểu
> cột" cho 14 bảng, trông vô hại trong diff, và merge vào là ALTER hàng loạt trên bảng có dữ
> liệu PROD. Không cổng CI nào canh việc này.

- **Đường DUY NHẤT hiện nay**: viết SQL tay + `prisma migrate deploy` (non-interactive).
  186/242 migration của repo vốn đã là SQL gõ tay (timestamp kết thúc `0000`) — đây là nếp thật,
  không phải đường vòng.
- **Tên thư mục**: `yyyyMMddHHmmss_ten_snake_case`, dấu thời gian phải LỚN HƠN migration cuối cùng
  đang có, kẻo `prisma migrate deploy` ở bước CI sập. Kiểm cả `origin/main` và `origin/test` trước
  khi chốt tên — 8 worktree song song đã từng đẻ migration trùng ngày ở nhánh khác.
- **Bảng MỚI phải tự bật RLS**: `ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;` ở cuối file. Chỉ
  ENABLE, không FORCE, không policy. Khuôn đúng: `20260825120000_lead_status_history`.
  Đừng chép `20260826180000_media_review` — mẫu đó **quên** RLS.
- **Tên index/constraint phải khớp quy ước Prisma** (`Bang_pkey`, `Bang_cot_key`, `Bang_cot_idx`).
  CI **không** bắt sai; lệch chỉ lộ ra ở lần ai đó chạy `migrate dev` sau này.
- **Migration đã apply → NEVER edit**. Tạo migration mới để sửa.
- **EPERM trên Windows DLL** sau migrate generate: dev server đang lock file. Tắt dev → retry hoặc dùng `pnpm build` đè.

## After schema change

1. Viết `prisma/migrations/<ten>/migration.sql` + sửa `schema.prisma` cho khớp.
2. **Kiểm SQL có khớp schema không** — bắt buộc, vì không CI nào canh (công thức DB nháp ở
   CLAUDE.md mục "Prisma migrations"; chỉ `--from-url`, KHÔNG BAO GIỜ `--from-migrations
   --shadow-database-url`, lệnh đó RESET DB đích).
3. `prisma migrate deploy` lên môi trường đích, rồi `prisma generate`.
4. Dev server **PHẢI RESTART** — Prisma Client trong memory cache cũ, không có model mới (`db.newModel` → undefined error).
3. Update `prisma/seed*.ts` nếu cần seed data mới.

## 2-phase migration pattern (giảm risk drop column)

Khi đổi schema dạng "thay đổi nguồn data":
- **Phase A**: Add new column/relation, populate, code đọc qua helper (`getHonorView`). KEEP old column nullable.
- **Phase B** (after stable in prod 2-3 ngày): DROP old column.

→ Cho phép rollback Phase A code mà data intact.

## Seed

- `pnpm db:seed` chạy `prisma/seed.ts` (idempotent với `upsert`).
- TimelineItem không có unique field → seed phải `findFirst` + create-or-update thay vì upsert.
- Seed CEO record với `isCEO: true` và clear cờ ở các record khác trước.

## Validators

- Mỗi resource có `lib/validators/<resource>.ts` với Zod schema.
- Optional + nullable fields: dùng pattern `nullableStr`, `nullableDate`, `nullableInt(min,max)` (xem `lib/validators/employee.ts`).
- Empty string `""` → convert thành `null` qua `.transform()` trước khi DB write.

## Query patterns

- Public reads: include relations cần hiển thị (`include: { employee: { select: {...} } }`).
- Admin reads: include `_count` để hiển thị badge số honors/leads.
- Soft delete: filter `WHERE deletedAt IS NULL` luôn, không hard delete trừ khi SUPER_ADMIN.

## Banned

- ❌ `$queryRawUnsafe` (SQL injection risk).
- ❌ Edit migration đã apply.
- ❌ Reset prod DB (`prisma migrate reset` không có marker local → hook block). Reset chỉ được phép trên DB test local (xem mục "Reset DB").
- ❌ Trỏ test (`resetDb`/seed test) vào Supabase — test luôn dùng Postgres local Docker.

## `pnpm test:unit` KHÔNG được đụng DB (chốt 04/09/2026)

`resetDb()` **TRUNCATE mọi bảng** trong `public` với CASCADE. Cổng cũ chỉ hỏi "URL có
trỏ localhost / có tên `satarobo_test` không" — mà DB làm việc hằng ngày ở máy dev
ĐÚNG LÀ `127.0.0.1/satarobo_test`. Hệ quả: mỗi lần `pnpm test:unit` là xoá sạch dữ
liệu đang xem. Đã xảy ra thật: 250 học viên · 100 lớp · 609 buổi · 12 tài khoản
`uat.*` bay hết, đăng nhập báo "sai tài khoản mật khẩu".

**Nay xoá DB phải có chủ đích — hai cổng, bỏ cái nào cũng mở lại một đường mất dữ liệu:**

| Cổng | Chặn gì |
|---|---|
| `assertTestDb()` (địa chỉ) | trỏ nhầm Supabase prod/dev |
| `ALLOW_DB_RESET=1` (chủ đích) | đúng địa chỉ nhưng SAI LÚC |

- `pnpm test:unit` → không có cờ → bộ chạm DB **SKIP**, `resetDb()` **ném lỗi**.
- Chạy thật: `pnpm test:chat-db` · `test:nen-db` · `test:lead-intake` ·
  `test:elearning-db` · `test:inbox-db` — chúng dùng `vitest.db.config.ts`, nơi DUY
  NHẤT bật cờ. CI gọi đúng các script này nên không đổi gì.
- Cổng chạy dùng chung ở `tests/_helpers/db-gate.ts` (trước đó chép tay ở 8 file).
- Cờ đặt trong file cấu hình chứ không phải `VAR=1 lệnh` trong `package.json`: repo
  không có `cross-env`, cú pháp đó không chạy trên cmd.exe của Windows.

**DB nháp cho test:** `satarobo_vitest` (đã tạo + `prisma migrate deploy`). Muốn chạy
bộ DB mà không đụng dữ liệu đang xem:

```bash
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/satarobo_vitest' \
DIRECT_URL="$DATABASE_URL" pnpm test:chat-db
```
