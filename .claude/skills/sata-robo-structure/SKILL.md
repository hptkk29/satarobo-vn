---
name: sata-robo-structure
description: Sata Robo project layout knowledge — route groups, folder conventions, naming patterns. Use when creating new files/folders to make sure they land in the right place.
---

# Sata Robo project structure

## Route groups

```
app/(public)/...      → public marketing site, anyone can access
app/(admin)/admin/... → admin CMS/CRM, gated by admin layout
app/(auth)/login/...  → auth pages, no header/footer
app/api/...           → REST routes (lead form POST, R2 upload-url, NextAuth)
```

Public URL preview:
- `app/(public)/page.tsx` → `/`
- `app/(public)/vinh-danh/page.tsx` → `/vinh-danh`
- `app/(admin)/admin/honors/page.tsx` → `/admin/honors`

→ Route group `(public)`/`(admin)` KHÔNG appear trong URL. Đừng tạo `/admin/foo` ngoài `app/(admin)/admin/`.

## Component folders by responsibility

| Folder | Contains | Used by |
|---|---|---|
| `components/ui/` | shadcn primitives (Button, Input, Switch...) | Both sites |
| `components/public/` | Marketing Header, Footer, FloatingCTA, GA4 | Public layout |
| `components/admin/` | Sidebar, Topbar, DataTable patterns | Admin layout |
| `components/admin/<resource>/` | Resource-specific (honors, nhan-su, jobs) | Specific admin pages |
| `components/honors/` | Vinh-danh page sections (Hero, Spotlight, CategoryGrid) | `/vinh-danh` |
| `components/blog/` | Blog cards, markdown renderer, share buttons | `/tin-tuc` |
| `components/jobs/` | Job cards | `/tuyen-dung` |
| `components/seo/` | JSON-LD schema components | Public pages |
| `components/magic/` | Magic UI — client only | Public pages |
| `components/motion/` | Framer Motion wrappers — client only | Public pages |
| `components/charts/` | Recharts wrappers — admin only | Admin pages |

## Lib organization

```
lib/
├── db.ts                       # Prisma singleton
├── auth.ts                     # Auth.js config
├── auth/permissions.ts         # can(), assertCan() RBAC helpers
├── utils.ts                    # cn() helper + small utilities
├── storage/r2-client.ts        # Cloudflare R2 S3-compat client
├── storage/upload-config.ts    # File category whitelist (image/doc/video/archive)
├── honors/category-meta.ts     # Honor category enum metadata (icon/color)
├── honors/honor-view.ts        # getHonorView() helper for fallback chain
├── validators/<resource>.ts    # Zod schemas per resource
└── seo/jsonld.ts              # JSON-LD schema generators
```

## Naming conventions

- File: kebab-case (`employee-form.tsx`, `seed-honors.ts`).
- Component export: PascalCase (`export function EmployeeForm()`).
- Constants: SCREAMING_SNAKE_CASE (`CATEGORY_META`, `DEPARTMENT_LABELS`).
- Server action files: `actions.ts`, functions `createXAction`, `updateXAction`, `deleteXAction`.
- Page files: always `page.tsx`, route handlers `route.ts`.

## Adding new admin resource

Template (resource = `tasks`):
1. `app/(admin)/admin/tasks/page.tsx` — list (Server Component, fetch + render `<TasksTable>`).
2. `app/(admin)/admin/tasks/actions.ts` — Server Actions (create/update/delete).
3. `app/(admin)/admin/tasks/new/page.tsx` — new form page.
4. `app/(admin)/admin/tasks/[id]/edit/page.tsx` — edit form page.
5. `components/admin/tasks/tasks-admin-table.tsx` — client table.
6. `components/admin/tasks/task-form.tsx` — shared form for new + edit.
7. `lib/validators/task.ts` — Zod schemas.
8. Update `components/admin/sidebar.tsx` — thêm nav link.
9. Add permissions trong `lib/auth/permissions.ts`.

## Adding new public page

1. `app/(public)/<slug>/page.tsx` — Server Component với `metadata` + `breadcrumbJsonLd`.
2. Update `app/sitemap.ts` thêm URL.
3. Update `components/public/header.tsx` nav nếu cần.
4. Sections lớn → `components/<topic>/<section>.tsx`.

## Things to NOT create

- ❌ `app/admin/...` (sai route group).
- ❌ `components/dashboard/`, `components/forms/` (generic — tổ chức theo resource).
- ❌ `lib/types.ts` global (types co-locate với module).
- ❌ `pages/api/...` (Pages Router không dùng).
