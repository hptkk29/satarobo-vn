# Sata Robo — Design System MASTER

> **Phase 4.UI.REDESIGN — Client Site Visual Overhaul**
> Source of truth for client-side (public) page redesign. Light theme only. Content text preserved verbatim across all redesigns.

---

## 1. Foundations

### 1.1 Theme
- **Light theme ONLY.** Dark mode is disabled across the project.
- Sections alternate between three light backgrounds for visual rhythm:
  - `bg-white`
  - `bg-gradient-to-br from-orange-50 via-white to-purple-50` (soft warm)
  - `bg-neutral-50` (neutral break)
- Exception: section 8 (Competition Countdown) on Homepage uses `bg-neutral-900` as a dramatic break — explicitly allowed.

### 1.2 Brand Colors (LOCKED)
| Token | Hex | Usage |
|---|---|---|
| Brand Orange | `#F97316` (Tailwind `orange-500`) | Primary CTA, accents, links, HQ marker |
| Brand Purple | `#7C3AED` (Tailwind `violet-600` / `purple-600`) | Secondary, headings highlight, location marker |
| Brand Navy | `#1F2937` (`neutral-800`) | Heading text |
| Brand Amber | `#F59E0B` (`amber-500`) | Highlights, awards, upcoming locations |

Brand pairing in code:
```ts
<span className="text-[#F97316]">Sata</span><span className="text-[#7C3AED]">Robo</span>
```

### 1.3 Typography

**Font stack:** `Be_Vietnam_Pro` (already loaded in `app/layout.tsx`).
- Rationale: Plus Jakarta Sans + Inter (mentioned in the redesign prompt) have weak Vietnamese diacritic rendering. Be_Vietnam_Pro is optimized for Vietnamese and is already in the project. If a display-only font swap is desired later, only swap for `font-display` on H1/H2 after visual QA of all VN diacritics.

**Scale (Tailwind utility):**
| Level | Class | When |
|---|---|---|
| Display | `text-4xl md:text-6xl font-black` | Homepage H1 |
| H1 | `text-3xl md:text-5xl font-black` | Page hero titles |
| H2 | `text-2xl md:text-4xl font-bold` | Section titles |
| H3 | `text-xl md:text-2xl font-bold` | Card titles |
| Body | `text-base` | Default copy |
| Small | `text-sm` | Meta, captions |
| Eyebrow | `text-xs font-bold uppercase tracking-wider` | Section labels |

### 1.4 Spacing
Use the Tailwind scale: `4, 6, 8, 12, 16, 24`. Section vertical padding `py-16 md:py-24`. Container `container mx-auto px-4 max-w-7xl` (or `max-w-5xl` for centered content).

---

## 2. Components

### 2.1 Cards (Soft UI Evolution)
```tsx
className="bg-white rounded-2xl border border-neutral-200 p-6
           shadow-[0_4px_20px_rgba(0,0,0,0.04)]
           hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)]
           hover:-translate-y-1
           transition-all duration-300"
```

### 2.2 Buttons

**Primary CTA** (Lucide icon + label):
```tsx
className="inline-flex items-center gap-2
           bg-orange-500 hover:bg-orange-600
           text-white font-bold
           px-6 py-3 rounded-xl
           shadow-lg shadow-orange-500/30
           hover:shadow-xl hover:shadow-orange-500/40
           hover:-translate-y-0.5
           transition-all duration-200"
```

**Secondary CTA:**
```tsx
className="inline-flex items-center gap-2
           bg-white hover:bg-purple-50
           text-purple-700 border-2 border-purple-300
           font-bold px-6 py-3 rounded-xl
           transition-all"
```

**Special moment (Hero, Final CTA):** Use `<ShimmerButton>` from `@/components/magic/shimmer-button`.

### 2.3 Section primitives
Reuse existing `@/components/design-system/sections/section-base` or compose inline with the alternating backgrounds.

---

## 3. Magic UI components (installed)

| Component | Path | Use case |
|---|---|---|
| `AnimatedGradientText` | `@/components/magic/animated-gradient-text` | Hero H1 highlight word |
| `NumberTicker` | `@/components/magic/number-ticker` | Stats count-up (numeric only) |
| `BorderBeam` | `@/components/magic/border-beam` | Featured cards (catalog, prize) |
| `ShimmerButton` | `@/components/magic/shimmer-button` | Hero CTA + Final CTA |
| `Particles` | `@/components/magic/particles` | Hero background |
| `Marquee` | `@/components/magic/marquee` | Testimonials carousel |
| `AnimatedBeam` | `@/components/magic/animated-beam` | Diagram connections (rare) |
| `OrbitingCircles` | `@/components/magic/orbiting-circles` | Decorative diagram |

### 3.1 Motion wrappers (existing, client-only)
| Wrapper | Path | Use |
|---|---|---|
| `FadeIn` | `@/components/motion/fade-in` | Mount fade-in |
| `RevealOnScroll` | `@/components/motion/reveal-on-scroll` | Scroll-triggered reveal (once: true) |
| `StaggerChildren` | `@/components/motion/stagger-children` | Sequential list animation |

### 3.2 ESLint enforcement (CLAUDE.md)
- Admin files → cannot import Magic UI or Motion.
- Public/client files → cannot import Recharts/charts.
- Do NOT workaround these — they enforce the UI library split.

---

## 4. Icons (NO emoji-as-icon)

**Rule:** All clickable, decorative, or semantic icons must be Lucide (`lucide-react`). Emoji is allowed only when it is part of a content sentence the user wrote (e.g., body copy), never as a card icon, button prefix, or rank symbol.

**Replacement map** (Homepage):
| Emoji used as icon | Lucide replacement | Context |
|---|---|---|
| ✅ checkmark | `<CheckCircle2 />` | Trust badges, commitment list |
| 🎯 Robosim independent | `<Target />` | Advantage card 1 |
| 👥 small class | `<Users />` | Advantage card 2 |
| 💰 100% refund | `<Wallet />` or `<HandCoins />` | Advantage card 3 |
| ✈️ travel prize | `<Plane />` | Advantage card 4 |
| 🎤 presentation | `<Mic />` | Advantage card 5 |
| 🏆 trophy support | `<Trophy />` | Advantage card 6 |
| 🥇/🥈/🥉 medal | `<Trophy />`, `<Medal />`, `<Award />` + tier color | Travel Prize ranks |
| 📞 phone | `<Phone />` | Hotline CTA |
| ⏰ countdown | `<Clock />` or `<Timer />` | Competition section |

Eyebrow labels (`🏆 ƯU THẾ + THÀNH TỰU`) are decorative text — they can stay or be replaced with an inline Lucide + label. Both are acceptable; current code keeps them as Unicode decorative.

---

## 5. Animation rules

| Rule | Yes / No |
|---|---|
| Page entrance | `FadeIn`/`RevealOnScroll` with 50–100ms stagger |
| Hover transitions | 200–300ms ease-out |
| Number stats | `NumberTicker` count-up |
| Cards on scroll | `BlurFade` / `RevealOnScroll` |
| Hero CTA | `ShimmerButton` or subtle pulse |
| Background | `Particles` low density (`quantity ≤ 50`), brand colors only |
| Jarring animations / infinite loops / excessive parallax | ⛔ |
| `prefers-reduced-motion` respect | ✅ Required |

---

## 6. Responsive breakpoints

| Breakpoint | Width | Target |
|---|---|---|
| Mobile | 375 – 767 px | 1 column, stacked, touch ≥ 44 px |
| Tablet | 768 – 1023 px | 2 columns |
| Desktop | 1024 – 1439 px | 3–4 columns |
| Wide | 1440 px+ | `max-w-7xl` (1280 px) centered |

---

## 7. Accessibility (WCAG AA)

- All images: `alt` attribute (preserve existing alt text on redesign).
- Color contrast ≥ 4.5:1 (verify via Stark / Lighthouse).
- Keyboard focus rings visible (use Tailwind `focus-visible:ring-2 focus-visible:ring-orange-500`).
- Icon-only buttons: `aria-label`.
- Semantic HTML (`<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`).
- `prefers-reduced-motion`: motion wrappers must respect (already do via Framer Motion defaults).

---

## 8. What the redesign MUST NOT change

- Page text / copy (verbatim preservation)
- URLs / routes
- Form submission logic (Google Sheet + Lead API)
- Prisma schema / DB
- API routes / Server Actions
- Admin pages (`/admin/*`)
- Data fetching shape from DB

The redesign is a visual-layer rewrite only.

---

## 9. Page redesign status

| Page | Status | Notes |
|---|---|---|
| `/` (Homepage) | ✅ Done | Anchor — locks design language for other pages |
| Header / Footer | ⏳ Deferred | Global — touch in next session |
| `/khoa-hoc/laptrinhrobot` | ⏸️ Deferred | Legacy port — visual refresh + preserve form |
| `/khoa-hoc/luyenthirobosim` | ⏸️ Deferred | Legacy port — visual refresh |
| `/khoa-hoc` (overview) | ⏸️ Deferred | Already uses design-system primitives |
| `/tin-tuc` + `[slug]` | ⏸️ Deferred | Recently rebuilt with News model (RESET.2 v2) |
| `/tuyen-dung` + `[slug]` | ⏸️ Deferred | Recently rebuilt with Recruitment model |
| `/ve-chung-toi` | ⏸️ Deferred | |
| `/lien-he` | ⏸️ Deferred | |
| `/vinh-danh` | ⏸️ Deferred | |
| `/hoc-cu` | ⏸️ Deferred | |

Each subsequent page redesign session will consume this MASTER.md as the spec.
