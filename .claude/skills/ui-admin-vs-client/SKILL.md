---
name: ui-admin-vs-client
description: Choose correct UI library based on which site (admin vs public client). Don't mix Magic UI/Framer Motion in admin; don't use Recharts in client public pages. Trigger when working with components, charts, animations.
---

# UI library selection

## Decision tree

```
Working in app/(admin)/admin/* or components/admin/*?
  → shadcn/ui only
  → Charts: @/components/charts/* (LineChart, BarChart, FunnelChart)
  → Animation: Tailwind CSS transitions only (transition-colors, transition-transform)
  → ❌ NO Magic UI, NO Framer Motion (ESLint blocks)

Working in app/(public)/* or components/{public,honors,blog,jobs}/*?
  → shadcn/ui base
  → Wow effects: @/components/magic/* (Particles, NumberTicker, etc.)
  → Animation: @/components/motion/* (FadeIn, RevealOnScroll, StaggerChildren)
  → ❌ NO Recharts (ESLint blocks)
  → ⚠️ Honor budget: legal/contact pages = ZERO animation
```

## Common confusion

| Tình huống | Đúng |
|---|---|
| Admin dashboard cần biểu đồ leads/day | `<LineChart>` từ `@/components/charts/line-chart` |
| Hero `/vinh-danh` cần particles | `<Particles>` từ `@/components/magic/particles` |
| Stats counter trang vinh danh | `<NumberTicker>` từ `@/components/magic/number-ticker` (KHÔNG implement tay) |
| Section reveal scroll trang `/khoa-hoc` | `<RevealOnScroll>` từ `@/components/motion/reveal-on-scroll` |
| Loading state ở admin table | `<Skeleton>` shadcn hoặc Tailwind `animate-pulse` |
| Toast notification | `toast.success/error` từ `sonner` (cả 2 site) |

## ESLint will catch mistakes

Nếu import sai → ESLint báo lỗi với message rõ ràng:
- `❌ Magic UI chỉ dùng cho CLIENT site. Admin dùng shadcn/ui + Recharts.`
- `❌ Recharts wrappers chỉ cho ADMIN site. Client cần visualization → dùng SVG đơn giản hoặc Magic UI.`

→ Đừng disable ESLint rule — fix import path.

## When user asks "add cool effect to admin dashboard"

Counter-offer: "Admin design language là utility-first, không cần animation. Em thêm `<Skeleton>` loading state và colored badges thay vì animation. Nếu thực sự cần particles cho 1 trang admin cụ thể (vd: marketing campaign analytics), em sẽ ask anh authorize riêng."

→ Default = không break design language. Exceptions cần authorize.
