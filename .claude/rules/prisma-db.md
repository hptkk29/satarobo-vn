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
- ❌ Reset prod DB (`prisma migrate reset` — hook block).
