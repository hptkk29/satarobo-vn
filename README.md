# Sata Robo — Website tổng công ty

Website chính thức của **Công ty Cổ phần Công nghệ Giáo dục Sata Robo** (Đà Nẵng).

## Tech Stack

| Lớp | Công nghệ |
|-----|-----------|
| Framework | Next.js 16 App Router |
| Language | TypeScript (strict) |
| UI | shadcn/ui + Tailwind CSS v4 |
| Database | PostgreSQL (Supabase) |
| ORM | Prisma v5 |
| Auth | Auth.js v5 (NextAuth) |
| Email | Resend |
| Tracking | Meta Pixel + CAPI, GA4 + Measurement Protocol |
| Deploy | Vercel |

> Xem chi tiết: [CLAUDE.md](./CLAUDE.md)

---

## Chạy local

### 1. Clone & install

```bash
git clone https://github.com/hptkk29/satarobo-vn.git
cd satarobo-vn
pnpm install
```

### 2. Cấu hình môi trường

```bash
cp .env.example .env.local
```

Điền vào `.env.local`:

```env
DATABASE_URL="postgresql://postgres.xxx:PASSWORD@pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"base64\"))'>"
```

> Prisma CLI cũng cần DATABASE_URL trong `.env` (copy từ `.env.local`)

### 3. Database

```bash
# Tạo schema trên Supabase
pnpm db:migrate

# Seed data (admin + 4 trung tâm + 2 khoá học)
pnpm db:seed
```

### 4. Chạy

```bash
pnpm dev
# → http://localhost:3000
```

---

## Đăng nhập Admin (demo)

| | |
|---|---|
| URL | http://localhost:3000/login |
| Email | phuc@satarobo.vn |
| Password | [Đã đổi sau khi setup] |

> ⚠️ **Đổi mật khẩu ngay sau khi đăng nhập lần đầu!**

---

## Commands

```bash
pnpm dev          # Dev server
pnpm build        # Production build
pnpm typecheck    # TypeScript check
pnpm lint         # ESLint
pnpm db:migrate   # Chạy migration mới
pnpm db:studio    # Prisma Studio (xem DB)
pnpm db:seed      # Seed data
pnpm db:reset     # Reset toàn bộ DB (cẩn thận!)
```

---

## Cấu trúc folder

```
app/
├── (public)/          # Trang công khai
├── (auth)/login/      # Đăng nhập
├── (admin)/admin/     # Khu vực quản trị (protected)
└── api/               # API routes

components/
├── ui/                # shadcn/ui components
├── public/            # Header, Footer, FloatingCTA
└── admin/             # Sidebar, Topbar

lib/
├── auth.ts            # Auth.js config
├── db.ts              # Prisma singleton
├── permissions.ts     # Role-based access
├── utils.ts           # Helpers
└── validators/        # Zod schemas

prisma/
├── schema.prisma      # Database schema
├── migrations/        # Migration history
└── seed.ts            # Seed data
```

---

## Troubleshooting

**Lỗi Prisma client không tìm thấy:**
```bash
pnpm prisma generate
```

**Lỗi connection Supabase:**
- Kiểm tra `DATABASE_URL` trong `.env` và `.env.local`
- Đảm bảo IP không bị block (Supabase Network Restrictions)
- Dùng `DIRECT_URL` (port 5432) cho migration, `DATABASE_URL` (port 6543) cho app

**Lỗi `next-auth` session:**
- Kiểm tra `NEXTAUTH_SECRET` đã được set
- Kiểm tra `NEXTAUTH_URL` đúng với local URL

**pnpm không nhận package scripts (Windows):**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
