---
description: Rules cho client public pages (app/(public)/...)
globs: ["app/(public)/**/*.tsx", "components/honors/**/*.tsx", "components/public/**/*.tsx", "components/blog/**/*.tsx", "components/jobs/**/*.tsx"]
---

# Client site rules

## Animation budget

| Page type | Allowed |
|---|---|
| Trang chủ Hero | ✅ Magic UI Particles, AnimatedGradientText |
| Course landing | ⚠️ Scroll reveal + counter only |
| Blog list/detail | ⚠️ Subtle CSS fade only |
| Tuyển dụng / Liên hệ | ❌ NO animation (user query info nhanh) |
| Legal pages | ❌ NO animation |

## Required pattern

- Wrap animations với `<FadeIn>` / `<RevealOnScroll>` từ `@/components/motion/*` — không import `framer-motion` trực tiếp ở component khác.
- `<RevealOnScroll>` default `viewport={{ once: true }}` — không animate lặp.
- Max animation duration: 600ms.

## SEO requirements

- Mỗi page: `metadata` export với `title`, `description`, `alternates.canonical`, `openGraph.{title,description,url,siteName,images?}`.
- BreadcrumbList JSON-LD inline với `breadcrumbJsonLd()` từ `@/lib/seo/jsonld` + visible `<nav>` breadcrumb.
- Dynamic pages (`[slug]`): `generateMetadata`, `generateStaticParams`, `revalidate`.
- Ảnh: `next/image` luôn luôn, KHÔNG `<img>` thuần (trừ admin preview thumbnails).

## Data fetching

- Server Component async/await direct → `db.thing.findMany()` từ `@/lib/db`.
- ISR via `export const revalidate = 60` (list) hoặc `300` (detail).
- Honor records: dùng `<HonorWithEmployee>` type, đọc qua `getHonorView()` helper (phase 4.7+).

## CSS / responsive

- Mobile-first: viewport 375px must work.
- Tailwind utilities ưu tiên; CSS modules chỉ khi animation phức tạp.
- Sata Robo brand: cam `#F97316`, tím `#7C3AED`.

## Banned

- ❌ `useEffect` cho data fetching.
- ❌ Recharts (admin only — ESLint blocks).
- ❌ Heavy state libraries (Redux, Zustand).
