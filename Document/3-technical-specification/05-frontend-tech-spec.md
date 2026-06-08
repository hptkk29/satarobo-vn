# Doc 5 — Frontend Tech Spec

> **Ai đọc:** Frontend Dev.
> 🔄 **ĐỒNG BỘ DOC 15 (2026-06-06):** phần auth/role gate là **HIỆN TRẠNG**. Từ A0: UI nhận `Actor` (multi-UserOrgRole) thay `role/roles/grants`; login chung `satarobo.vn/login`; sidebar/permission gate đọc từ can() v2. Khi xung đột, Doc 15 thắng.
> **Cập nhật:** 2026-06-06 · Sinh tự động từ quét codebase (538 file TS/TSX, ~52% có `'use client'`).

---

## 1. Nguyên tắc nền tảng

1. **Server-first:** mặc định Server Component (RSC). `'use client'` chỉ khi cần state/effect/handler.
2. **Data fetching trong RSC** (`async` + Prisma trực tiếp). ❌ Cấm `useEffect` fetch.
3. **Mutations qua Server Actions** (`'use server'`) — file `'use server'` chỉ export async function.
4. **UI library split theo site** (ESLint enforce — đừng workaround):
   - Admin = shadcn/ui + Recharts wrappers. ❌ Magic UI / framer-motion.
   - Client = shadcn/ui + Magic UI + Motion wrappers. ❌ Recharts.

## 2. Cây component (`components/`, ~182 component)

```
components/
├── ui/                  # shadcn base — 20 (Button, Dialog, Form, Table, Select, Sheet, Switch...)
├── design-system/       # 39 building blocks (Phase 4.UI.1 — single source of truth)
│   ├── cards/           # blog/course/employee/job/stat/testimonial-card
│   ├── ctas/            # cta-primary/secondary/ghost/gradient/floating
│   ├── decorations/     # circuit-pattern, dot-grid, sparkles, beam-connector, orbit-icons
│   ├── effects/         # hover-lift-card, glow-orb, animated-grid-lines, magnetic-cta
│   ├── heroes/          # hero-minimal / hero-split / hero-particles
│   ├── illustrations/   # SVG: kid-robot, classroom, stem-tools, team-work, empty-state
│   ├── sections/        # section-base/alternate/circuit/marquee/stats + primitives
│   └── admin/           # stat-card-admin, status-badge, data-table-shell
├── magic/               # 8 — CLIENT only (particles, marquee, number-ticker, shimmer-button,
│                        #     border-beam, animated-beam, orbiting-circles, animated-gradient-text)
├── motion/              # 3 — CLIENT only (FadeIn, RevealOnScroll, StaggerChildren)
├── charts/              # 3 — ADMIN only (LineChart, BarChart, FunnelChart — animation 300ms cố định)
├── admin/               # 17 (Sidebar, Topbar, ImageUploader, ExcelImporter, DocumentUploader,
│                        #     WeekCalendar, EmployeeForm, HonorForm, JobForm...)
├── public/              # 9 (Header, SiteFooter, GA4, MetaPixel, CookieConsent, FloatingCta,
│                        #     StickyMobileCta, CampaignPopup, BfcacheReloadFix)
├── blog/  jobs/  honors/  home/  khoa-hoc/  sections/  transcript/  seo/
└── legacy-laptrinhrobot/  legacy-luyenthirobosim/   # 13 — giữ để rollback
```

## 3. Routing structure (App Router, 6 route group)

| Group | Host (prod) | Nội dung |
|---|---|---|
| `app/(public)/` | satarobo.vn | 17 trang marketing + pháp lý |
| `app/(legacy)/` | satarobo.vn | 2 landing khóa học cũ (tự quản UI) |
| `app/(auth)/login/` | mọi host | Login (RSC + LoginForm client) |
| `app/(admin)/admin/` | admin.satarobo.vn | 80+ trang quản trị |
| `app/(portal)/portal/` | hocvien.satarobo.vn | 6 trang phụ huynh |
| `app/api/` | — | ~30 route handlers |

Clean URL: middleware rewrite `admin.satarobo.vn/leads` → `/admin/leads` nội bộ — **không tạo link cứng `/admin/...` trong UI admin**, dùng path tương đối theo host.

## 4. Auth handling phía FE

- Session = JWT cookie (Auth.js v5) — **không lưu token vào localStorage**.
- Layout gate: `app/(admin)/admin/layout.tsx` check `session` + `hasStaffRole` + liveness (tokenVersion/isActive/deletedAt → force logout); `app/(portal)/portal/layout.tsx` check PARENT-only + load context con.
- Redirect logic tập trung ở middleware (`decideRoute`) — FE không tự xử lý redirect role.
- UI ẩn/hiện theo quyền: sidebar nhận `role`, `roles`, `grants`; form Employee dùng `getEmployeeFieldVisibility(role)`.

## 5. State management

**Không dùng Redux/Zustand (banned).** Thứ tự ưu tiên:

1. **Server state = RSC props** — fetch ở page, pass plain data xuống.
2. **Mutation state = `useTransition`** + server action + `revalidatePath` (sonner toast kết quả).
3. **Form state = react-hook-form + zodResolver** (form lớn) hoặc uncontrolled + FormData (form nhỏ).
4. **URL state = searchParams** cho filter/pagination bảng admin.
5. **Cross-page nhẹ:** cookie (vd `ACTIVE_SITE_COOKIE` chọn con ở portal — set qua server action).

### Data table pattern (admin)
RSC fetch → pass data → client table → row action gọi server action trong `useTransition` → confirm-delete 2-click (`deleteId` state).

## 6. Animation budget (client site)

| Trang | Cho phép |
|---|---|
| Hero trang chủ | ✅ Particles, AnimatedGradientText |
| Course landing | ⚠️ Scroll reveal + counter |
| Blog | ⚠️ CSS fade nhẹ |
| Tuyển dụng / Liên hệ / Pháp lý | ❌ Không animation |

- Bọc qua `<FadeIn>` / `<RevealOnScroll>` (`viewport={{ once: true }}`) — không import framer-motion trực tiếp.
- Max duration **600ms** (client), admin chỉ CSS transition, Recharts **300ms**.

## 7. Theme & design tokens

- **Nguồn:** `lib/design-tokens.ts` + `app/globals.css` (`@import "tailwindcss"` + tw-animate-css + typography plugin).
- **Brand:** Cam `#F97316` (primary), Tím `#7C3AED` (secondary), neutral chiếm ~85%. Semantic: success `#10B981`, warning `#F59E0B`, error `#EF4444`, info `#3B82F6`.
- **Font:** Be Vietnam Pro (subset vietnamese, `display: swap`); NotoSans cho PDF.
- **Mobile-first:** viewport 375px phải hoạt động; breakpoints Tailwind mặc định.

## 8. SEO requirements (client pages)

- Mỗi page: `metadata` export (`title`, `description`, `alternates.canonical`, `openGraph`). Dynamic: `generateMetadata` + `generateStaticParams` + `revalidate`.
- JSON-LD qua `lib/seo/jsonld.ts` (9 helper: organization, blogPosting, jobPosting, product, localBusiness, breadcrumb, website, itemList, about/contact) — inline `<script>` là chỗ duy nhất được `dangerouslySetInnerHTML`.
- `app/sitemap.ts` (static + News published + Jobs OPEN + course slugs), `app/robots.ts` (disallow `/admin`, `/api`, `/login`; non-prod disallow all).
- Ảnh: luôn `next/image` (trừ admin preview thumbnail).

## 9. Performance targets

| Chỉ tiêu | Mức |
|---|---|
| Lighthouse mobile (public) | ≥ 85 |
| Lighthouse mobile (admin) | ≥ 90 |
| LCP | < 2.5s |
| CLS | < 0.1 |

Chiến lược: RSC + ISR (list 60s, detail 300s), `next/image` + `sizes`, font swap, Sentry tree-shake logger, bundle split theo route group (ESLint chặn kéo Recharts vào public / framer-motion vào admin).

## 10. Error & loading

- `error.tsx` / `not-found.tsx` per route group; Suspense boundaries dùng tiết chế (ưu tiên ISR).
- Server action trả `{ ok, error }` — toast `sonner` (đã có trong layouts), không throw ra UI.
- `BfcacheReloadFix` xử lý back-forward cache.
- Tracking lazy: GA4 + MetaPixel là client components ở root layout, sau hydration.

## 11. Checklist khi thêm trang/component mới

1. Đúng route group + đúng host? (sata-robo-structure)
2. RSC được không? — chỉ thêm `'use client'` khi bắt buộc.
3. Đúng UI library theo site? (chạy `pnpm lint` sẽ bắt).
4. Dùng design-system component có sẵn trước khi viết mới.
5. Public page: metadata + breadcrumb JSON-LD + test 375px.
6. `pnpm typecheck && pnpm lint && pnpm build` PASS trước khi báo xong.
