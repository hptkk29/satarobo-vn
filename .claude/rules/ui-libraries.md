---
description: UI library split — Magic UI / Motion (client) vs Recharts (admin)
globs: ["components/magic/**/*", "components/motion/**/*", "components/charts/**/*", "**/*.tsx"]
---

# UI library split (Phase 4.X.1)

## Available libraries

| Library | Where | Why |
|---|---|---|
| **shadcn/ui** (`components/ui/`) | Cả 2 site | Radix UI primitives — accessible, không animation nặng |
| **Magic UI** (`components/magic/`) | CLIENT only | Wow effects cho marketing — particles, gradient text, ticker |
| **Motion wrappers** (`components/motion/`) | CLIENT only | Framer Motion wrap (FadeIn / RevealOnScroll / StaggerChildren) |
| **Recharts** (`components/charts/`) | ADMIN only | Data viz cho dashboard — line, bar, funnel |
| **lucide-react** | Cả 2 | Icons (lightweight) |

## ESLint enforcement (đừng workaround)

- Admin files → block import `@/components/magic/*`, `@/components/motion/*`, `framer-motion`, `motion`.
- Client files (`app/(public)`, `app/(auth)`, `components/{public,honors,blog,jobs,magic,motion,seo}`) → block import `@/components/charts/*`, `recharts`.

## Magic UI components đã cài (8)

`animated-gradient-text`, `number-ticker`, `shimmer-button`, `border-beam`, `animated-beam`, `particles`, `marquee`, `orbiting-circles`.

Files ở `components/magic/`. Import: `import { Particles } from "@/components/magic/particles"`.

## Motion wrappers (3)

- `<FadeIn delay duration>` — mount fade-in (Hero text).
- `<RevealOnScroll delay direction distance>` — scroll into view, chạy 1 lần.
- `<StaggerChildren staggerDelay>` + `staggerItem` — list animation tuần tự.

## Recharts wrappers (3)

- `<LineChart data xKey lines>` — trends theo thời gian.
- `<BarChart data xKey bars layout>` — categorical comparison.
- `<FunnelChart data>` — conversion funnel.
- Animation duration **luôn 300ms** — đừng tăng.

## When to add new UI library

- **NEVER auto-add.** Ask user first với lý do cụ thể (use case shadcn/Magic UI/Recharts không đáp ứng được).
- Sau khi user OK: cài, document trong file này, update ESLint rules nếu cần scope.

## When NOT to animate

- Mobile slow connection — animation block UX.
- Form / data table — user cần info, không cần wow.
- Pages SEO-critical với LCP < 2.5s budget.

→ Khi nghi ngờ, default = không animation, dùng CSS transition Tailwind là đủ.
