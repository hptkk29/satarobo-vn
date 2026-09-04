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
- **Env riêng cho test:** `.env.test` (đã `.gitignore`, KHÔNG commit):
  ```
  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/satarobo_test"
  DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:5432/satarobo_test"
  ```
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
- Chỉ được reset khi command thể hiện rõ target local/test (chứa `localhost` / `127.0.0.1` / `.env.test` / `satarobo_test`). Ví dụ PowerShell:
  ```powershell
  $env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/satarobo_test'; pnpm prisma migrate reset --force --skip-seed
  ```
  Hook thấy `127.0.0.1` → cho qua. Không có marker local → vẫn chặn.

## Sandbox & quyền (Claude Code) cho test/db

- Lệnh **dev** đụng Supabase (`db:migrate`, `db:seed`, `db:studio`) cần **mạng ra ngoài** → đã thêm vào allow-list `.claude/settings.local.json` (chạy ngoài sandbox). Lỗi *network blocked / can't reach database* khi chạy các lệnh này = bị sandbox chặn, approve permission là xong.
- Lệnh **test** (`test:unit`, `test:e2e`) chỉ cần Postgres local → không cần mạng Supabase; đã thêm allow-list.

## Migrations

- **Tên rõ nghĩa**: `pnpm db:migrate` (Prisma sẽ prompt name).
- **Migration đã apply → NEVER edit**. Tạo migration mới để sửa.
- **Tool**: `prisma migrate dev` (interactive) hoặc viết SQL tay + `prisma migrate deploy` (non-interactive).
- **EPERM trên Windows DLL** sau migrate generate: dev server đang lock file. Tắt dev → retry hoặc dùng `pnpm build` đè.

## After schema change

1. `pnpm db:migrate --name <descriptive_name>` apply.
2. Dev server **PHẢI RESTART** — Prisma Client trong memory cache cũ, không có model mới (`db.newModel` → undefined error).
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
