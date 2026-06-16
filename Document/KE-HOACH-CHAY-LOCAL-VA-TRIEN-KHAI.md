# Kế hoạch chạy LOCAL & triển khai — Sata Robo VN

> Mục tiêu: dựng môi trường chạy **hoàn toàn local** (DB Postgres local riêng), test sạch A0→R5, rồi mới build & deploy lên Vercel. **Không đụng vào Supabase prod khi test.**
> Môi trường tham chiếu: Windows 11 + PowerShell + Node tại `D:\APP\Node`. Cập nhật: 2026-06-13.

---

## 0. Trạng thái hiện tại (đã kiểm tra)

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Schema DB | ✅ Đầy đủ | 129 model, 111 migration (mới nhất `20260610_add_student_consent`) |
| DB đang cấu hình | ⚠️ Supabase thật | `.env` + `.env.local` trỏ `aws-1-ap-northeast-1.pooler.supabase.com` — **coi là PROD, KHÔNG test trên đó** |
| DB local dev/test | ❌ Chưa có | Cần dựng Postgres local |
| `node_modules` | ❌ Chưa cài | Phải `pnpm install` |
| `pnpm` trên PATH | ❌ Chưa có | Dùng `corepack enable` (kèm sẵn trong Node) |
| `.env.test` | ❌ Chưa có | Cần tạo cho test (Postgres local) |

> ⚠️ **Quy tắc vàng:** `pnpm db:reset` / `resetDb()` **XOÁ SẠCH** DB nó trỏ tới. Chỉ chạy reset khi URL chứa `localhost`/`127.0.0.1`. Hook `block-destructive` đã chặn lệnh reset không có marker local, nhưng vẫn phải tự cẩn thận với `.env.local`.

---

## 1. Yêu cầu tiên quyết

### 1.1. Node + pnpm
Node đã có (`D:\APP\Node`). Bật `pnpm` qua corepack (không cần cài thêm):

```powershell
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v        # xác nhận ra số phiên bản (project dùng pnpm 11)
```

Nếu PowerShell chặn script:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 1.2. Postgres local — chọn 1 trong 2

**Phương án A — Docker Desktop** (cần quyền admin WSL2/Hyper-V). Project đã có `docker-compose.test.yml`:
```powershell
docker compose -f docker-compose.test.yml up -d --wait
# Postgres 16 tại localhost:5432, db=satarobo_test, user/pass=postgres/postgres
```

**Phương án B — Postgres portable qua scoop** (KHÔNG cần admin — đã verify chạy được trên máy này):
```powershell
irm get.scoop.sh | iex
scoop install postgresql
$bin = "$env:USERPROFILE\scoop\apps\postgresql\current"
& "$bin\bin\pg_ctl" -D "$bin\data" -l "$bin\pg.log" -o "-p 5432" start
& "$bin\bin\createdb" -U postgres -h 127.0.0.1 -p 5432 satarobo_dev
# dừng khi xong: & "$bin\bin\pg_ctl" -D "$bin\data" stop
```

> Khuyến nghị tạo **2 DB tách biệt**: `satarobo_dev` (chạy app local) và `satarobo_test` (chạy test, bị truncate liên tục).

---

## 2. Cài đặt & cấu hình môi trường

### 2.1. Cài dependencies
```powershell
pnpm install
```

### 2.2. Tạo `.env.local` cho DEV LOCAL (trỏ Postgres local, KHÔNG trỏ Supabase)

> ⚠️ `.env`/`.env.local` hiện đang trỏ Supabase prod. **Backup rồi sửa** để chạy local an toàn. (Tất cả `.env*` đã trong `.gitignore` — không commit.)

```powershell
Copy-Item .env.local .env.local.supabase.bak   # backup cấu hình prod
```

Sửa `.env.local` — phần DB trỏ local + secret tối thiểu để app chạy:
```env
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/satarobo_dev"
DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:5432/satarobo_dev"

NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<sinh bằng lệnh dưới>"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
RBAC_V2_ENABLED="false"
```

Sinh `NEXTAUTH_SECRET`:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> Các integration (Resend/R2/Zalo/Meta/Upstash/Sentry) **để trống vẫn chạy được** — code tự fallback (email no-op, rate-limit in-memory, Sentry no-op). Webhook secret trống = chế độ stub dev (chỉ dùng local).

> Prisma CLI đọc `.env` (không phải `.env.local`). Đồng bộ 2 dòng `DATABASE_URL`/`DIRECT_URL` local sang `.env` nữa (cũng nhớ backup `.env` trước).

### 2.3. (Tuỳ chọn) `.env.test` cho test suite
```env
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/satarobo_test"
DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:5432/satarobo_test"
```

---

## 3. Khởi tạo database local

```powershell
# Apply toàn bộ 111 migration lên DB local
pnpm prisma migrate deploy

# Sinh Prisma Client
pnpm prisma generate

# Seed dữ liệu nền (CEO + OrgUnit + khoá học + role…)
pnpm db:seed
pnpm db:seed:orgunit        # cây tổ chức ROOT→HO/CS1/CS2
pnpm db:seed:roles          # RoleDef + RolePermission (RBAC động)
pnpm db:seed:courses        # 2 khoá chủ lực
```

> Sau bất kỳ thay đổi schema nào: **restart dev server** (Prisma Client cache trong memory).
> Tài khoản admin seed: `phuc@satarobo.vn` (mật khẩu xem trong `prisma/seed.ts`, **đổi ngay sau lần đăng nhập đầu**).

---

## 4. Chạy & smoke test local

```powershell
pnpm dev      # → http://localhost:3000
```

Smoke test thủ công:
- [ ] `http://localhost:3000` — trang public load OK
- [ ] `http://localhost:3000/login` — đăng nhập `phuc@satarobo.vn`
- [ ] `http://localhost:3000/admin/dashboard` — vào được khu admin
- [ ] `http://localhost:3000/portal` — portal phụ huynh
- [ ] Kiểm tra responsive mobile viewport **375px**

Xem DB trực quan:
```powershell
pnpm db:studio      # Prisma Studio
```

---

## 5. Chạy bộ test (xác nhận A0→R5 còn xanh)

> Test luôn dùng Postgres **local**, không bao giờ Supabase.

```powershell
# Dựng + apply schema cho DB test (nếu dùng Docker)
pnpm db:test:up

# Unit test (Vitest) — 42 file
pnpm test:unit -- --run

# E2E theo từng phase (Playwright)
pnpm test:e2e:a0     # foundation: orgunit, rbac, scoped-db, audit, outbox…
pnpm test:e2e:r1     # CRM messenger + commission
pnpm test:e2e:r2     # SIS + finance
pnpm test:e2e:r3     # LMS offline
pnpm test:e2e:r4     # portal ownership
pnpm test:e2e:r5     # HR checkin

pnpm db:test:down    # dọn DB test
```

**Cổng PASS tối thiểu trước deploy:**
```powershell
pnpm typecheck   # 0 lỗi TS
pnpm lint        # 0 lỗi ESLint
pnpm build       # build production thành công
```

---

## 6. Build production thử (local)

```powershell
pnpm build       # = prisma generate && next build
pnpm start       # chạy bản production tại http://localhost:3000
```
> Lỗi `EPERM` DLL trên Windows sau `prisma generate`: tắt dev server đang lock file rồi build lại.

---

## 7. Checklist TRƯỚC khi deploy (quan trọng)

### 7.1. Bảo mật — vá lỗ hổng đang mở (audit `3-hien-trang/06`)
- [ ] **C3 — Webhook fail-OPEN:** đặt secret thật cho `WEBHOOK_*_SECRET` + `META_APP_SECRET` trên prod (để trống = nhận webhook giả). Cân nhắc đổi sang **fail-CLOSED** trước go-live.
- [ ] **C1 — IDOR scopedDb:** xác nhận các Server Action nhạy cảm (leads/orders/students) đã lọc `centerId` của actor (việc của phase R6).
- [ ] **C2 — RBAC v2:** giữ `RBAC_V2_ENABLED="false"` cho lần deploy đầu; chỉ bật sau khi shadow-compare ở staging 1 tuần.

### 7.2. Biến môi trường trên Vercel (Production)
Khôi phục cấu hình Supabase prod cho `.env`/Vercel (KHÔNG dùng DB local khi deploy):
- [ ] `DATABASE_URL` = transaction pooler Supabase `:6543` (runtime)
- [ ] `DIRECT_URL` = session pooler Supabase `:5432` (migration) — username dạng `postgres.<project-ref>`
- [ ] `NEXTAUTH_URL` = domain thật (vd `https://admin.satarobo.vn`), `NEXTAUTH_SECRET` (secret riêng cho prod)
- [ ] `NEXT_PUBLIC_APP_URL`, tracking (Meta Pixel/GA4), Resend, R2, Zalo, Upstash, Sentry theo `.env.example`
- [ ] `NODE_ENV="production"`

### 7.3. Migrate DB prod
```powershell
# Trỏ DIRECT_URL = Supabase session pooler rồi:
pnpm prisma migrate deploy
```
> Backup Supabase trước migrate (RPO 24h). KHÔNG `migrate reset` trên prod.

---

## 8. Deploy lên Vercel

1. Push branch → mở PR → merge `main` (Vercel auto-deploy, region `hnd1`).
2. Set đầy đủ env vars ở **Vercel → Project → Settings → Environment Variables** (mục 7.2).
3. **Cron** đã khai trong `vercel.json` (9 job: class-reminder, renewal, email-queue 5', dispatch-events 1', sla-check 15', marketing-alerts, debt-reminder, zalo-token-refresh, order-debt-reminder) — set `CRON_SECRET` để bảo vệ endpoint cron.
4. Smoke test 3 domain: `satarobo.vn` (public) · `admin.satarobo.vn` · `hocvien.satarobo.vn` (portal) — host-based routing qua `proxy.ts`.

---

## 9. Troubleshooting

| Lỗi | Cách xử lý |
|---|---|
| `pnpm` không nhận | `corepack enable` + `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| `db.newModel` undefined | Restart dev server (Prisma Client cache cũ) |
| `EPERM` DLL khi build (Windows) | Tắt dev server đang lock → build lại |
| Không kết nối Supabase | Dùng **pooler** (IPv4), không dùng `db.<ref>.supabase.co:5432` (chỉ IPv6) |
| `can't reach database` khi chạy lệnh db | Lệnh chạm Supabase cần mạng ra ngoài — approve permission (sandbox) |
| Test xoá nhầm data | `resetDb()` chỉ chạy khi URL `127.0.0.1`/`localhost` — đừng trỏ test vào Supabase |

---

## 10. Lệnh nhanh (cheat sheet)

```powershell
# Setup 1 lần
corepack enable; pnpm install
# (dựng Postgres local — Docker hoặc scoop, xem mục 1.2)
pnpm prisma migrate deploy; pnpm prisma generate
pnpm db:seed; pnpm db:seed:orgunit; pnpm db:seed:roles; pnpm db:seed:courses

# Chạy hằng ngày
pnpm dev

# Trước khi deploy
pnpm typecheck; pnpm lint; pnpm build
pnpm test:unit -- --run
pnpm test:e2e:a0   # …r1 r2 r3 r4 r5
```

---

### Tóm tắt luồng
**cài pnpm → dựng Postgres local → đổi `.env.local` sang local → migrate + seed → `pnpm dev` smoke test → chạy test A0→R5 → `pnpm build` → khôi phục env Supabase → migrate prod → deploy Vercel + set env + cron.**
