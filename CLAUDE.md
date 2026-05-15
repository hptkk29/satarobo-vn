# CLAUDE.md — Sata Robo VN

Brand hub + admin CMS cho Sata Robo (Đà Nẵng). Public marketing site (`/`, `/khoa-hoc`, `/vinh-danh`, `/tin-tuc`, `/tuyen-dung`) + internal admin (`/admin/*`) chia route group `app/(public)/`, `app/(admin)/admin/`, `app/(auth)/`.

## Tech stack (FROZEN — đừng đổi nếu không hỏi)

- Next.js 16 App Router · React 19 · TypeScript strict
- Tailwind v4 · shadcn/ui · Magic UI (client only) · Framer Motion / Motion (client only) · Recharts (admin only)
- PostgreSQL (Supabase) · Prisma 5 · Auth.js v5 · Cloudflare R2 storage
- Resend (email) · pnpm 11

## Critical conventions

1. **Server-first** — default Server Component. `'use client'` chỉ khi cần state/effect/handler. Data fetch trong RSC (`async`), mutations qua Server Actions (`'use server'`).
2. **Strict TS** — không `any` (dùng `unknown` + narrow). Zod schema là source of truth → suy ra type qua `z.infer`.
3. **Route groups** — public: `app/(public)/...`, admin: `app/(admin)/admin/...`, auth: `app/(auth)/login/...`. Không tạo `/admin/*` ngoài route group.
4. **Imports** — `@/lib/db` (Prisma), `@/lib/auth` (Auth.js), `@/lib/utils` (cn helper), `@/components/blog/markdown-renderer` (NOT `<Markdown>`).
5. **Auth gate** — admin layout đã redirect `/login`. Server Actions vẫn phải `auth()` + `can(role, action)` từ `@/lib/auth/permissions` (Phase 4.7+).
6. **Prisma migrations** — KHÔNG raw SQL trừ khi cần. Mỗi schema change: `pnpm db:migrate` + tên rõ nghĩa. Sau migration: restart dev server (Prisma Client cache stale trong memory).
7. **UI library split** (Phase 4.X.1): admin = shadcn/ui + Recharts; client = shadcn/ui + Magic UI + Framer Motion. ESLint chặn cross-import — đừng workaround.
8. **Security (ENFORCED by hooks):**
   - NEVER `git add .env*` files (only `.env.example` allowed) — hook block.
   - NEVER commit `*.bak`, `*.backup`, `*.key`, `*.pem` — `.gitignore` block.
   - NEVER hardcode credentials — luôn `process.env.X`.
   - NEVER paste real secrets vào chat — mask `abc1...xyz9`.
   - File nghi ngờ nhạy cảm → ASK user, don't commit.
9. **Verify trước khi báo PASS** — `pnpm typecheck && pnpm lint && pnpm build` PASS. UI changes: smoke test localhost + mobile viewport 375px.

## Project structure (FROZEN)

```
app/
├── (public)/          # /, /khoa-hoc, /vinh-danh, /tin-tuc, /tuyen-dung, /lien-he, ...
├── (admin)/admin/     # /admin/dashboard, /admin/leads, /admin/honors, /admin/nhan-su, ...
├── (auth)/login/
└── api/               # /api/leads, /api/admin/upload-url, /api/admin/upload-delete, /api/auth/...

components/
├── ui/                # shadcn base (shared)
├── magic/             # Magic UI — CLIENT only (ESLint enforced)
├── motion/            # Framer Motion wrappers — CLIENT only
├── charts/            # Recharts wrappers — ADMIN only
├── admin/             # admin-specific
├── public/            # header, footer, ga4, meta-pixel
├── honors/            # vinh-danh page sections
├── blog/              # blog cards, markdown renderer, share
├── jobs/              # tuyển dụng cards
└── seo/               # JSON-LD schemas

lib/
├── db.ts              # Prisma singleton
├── auth.ts            # Auth.js config
├── auth/permissions.ts # can(), assertCan(), getEmployeeFieldVisibility()
├── storage/           # R2 client + upload-config
├── honors/            # category-meta, honor-view helper
├── validators/        # Zod schemas per resource
├── seo/               # jsonld helpers
└── utils.ts

prisma/
├── schema.prisma
├── migrations/        # NEVER edit applied migrations
├── seed.ts
└── seed-honors.ts
```

## Permission matrix (`lib/auth/permissions.ts`)

- 7 roles: `SUPER_ADMIN`, `MANAGER`, `HR`, `SALES`, `TEACHER`, `MARKETING`, `ACCOUNTANT`.
- Field-level visibility (Employee): `basic` (all), `contact` (SUPER_ADMIN/MANAGER/HR), `salary` (SUPER_ADMIN/HR/ACCOUNTANT), `personal` (SUPER_ADMIN/HR).
- Pattern: `can(session.user.role, 'employees:edit')` returns boolean. `assertCan(...)` throws inside Server Actions/API routes.

## Performance budget

- Client public pages: Lighthouse ≥ 85 mobile · LCP < 2.5s · CLS < 0.1.
- Admin pages: ≥ 90 mobile (admin tối giản animation).
- Animation: client = strategic (Hero, key CTAs) max 600ms; admin = CSS transition only.

## Don'ts (lý do đã từng burn)

- ❌ KHÔNG add UI library mới mà không hỏi (đã chọn shadcn + Magic UI + Recharts).
- ❌ KHÔNG dùng `useEffect` cho data fetching (dùng RSC + Suspense).
- ❌ KHÔNG dùng `dangerouslySetInnerHTML` ngoài JSON-LD scripts.
- ❌ KHÔNG drop Honor old columns (`fullName`, `jobTitle`, `avatarUrl`, `yearsAtCompany`) — 2-phase migration, sẽ làm ở 4.7.1.
- ❌ KHÔNG `gc --prune=now` ngay sau filter-branch khi có stash (mất WIP).
- ❌ KHÔNG comment `// eslint-disable-next-line @next/next/no-img-element` — project không có plugin Next ESLint.

## Workflow

1. **Hiểu trước, code sau** — đọc CLAUDE.md + file liên quan; nếu unclear, ASK trước khi code.
2. **Plan** — TodoWrite cho task ≥ 3 steps.
3. **Chunk** — commit từng feature rời, không big-bang.
4. **Verify mỗi 3-5 files** — `pnpm typecheck` để bắt lỗi sớm.
5. **Report** — liệt kê file thay đổi + cách test.

## Business context

- Công ty Cổ phần Công nghệ Giáo dục Sata Robo (Đà Nẵng), CEO Hồ Đắc Phúc.
- 2 khoá học chủ lực: **Lập trình Robot** (offline K-9, slug `laptrinhrobot`) và **Luyện thi RoboSim** (online + coaching, slug `luyenthirobosim`).
- B2C: phụ huynh con lớp 1-8.
- 2 domain cũ redirect qua middleware (`proxy.ts`): `laptrinhrobot.vn` → `/khoa-hoc/laptrinhrobot`; `luyenthirobosim.vn` → `/khoa-hoc/luyenthirobosim`.

## Detailed rules (load on-demand)

- [.claude/rules/client-site.md](.claude/rules/client-site.md) — animations, SEO, performance
- [.claude/rules/admin-site.md](.claude/rules/admin-site.md) — server actions, RBAC patterns
- [.claude/rules/ui-libraries.md](.claude/rules/ui-libraries.md) — Magic UI / Motion / Recharts allowed scope
- [.claude/rules/prisma-db.md](.claude/rules/prisma-db.md) — migrations, seed, Supabase IPv6 quirk
