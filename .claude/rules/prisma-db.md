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
- **Env riêng cho test:** `.env.test` (đã `.gitignore`, KHÔNG commit):
  ```
  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/satarobo_test"
  DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:5432/satarobo_test"
  ```
- **Trước khi test:** apply schema lên DB test: `prisma migrate deploy` (hoặc `db push`) với env test, rồi seed helper.
- **`resetDb()`** trong `tests/e2e/_helpers/seed.ts` reset/truncate **programmatic qua Prisma client** (đọc `TEST_DATABASE_URL`/`.env.test`) — không gọi shell, nên hook destructive không chặn. Helper PHẢI assert URL là `127.0.0.1`/`localhost` trước khi reset (fail-safe chống trỏ nhầm prod).

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
