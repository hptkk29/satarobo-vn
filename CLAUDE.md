# CLAUDE.md — Project Context cho Claude Code

**Hướng dẫn dùng:** Đặt file này tại root của repository `satarobo-vn/CLAUDE.md`. Claude Code sẽ tự động đọc file này trong mọi conversation, KHÔNG cần paste vào prompt.

---

## 1\. PROJECT OVERVIEW

- **Tên:** satarobo.vn — Website tổng công ty Sata Robo  
- **Chủ đầu tư:** Công ty Cổ phần Công nghệ Giáo dục Sata Robo (Đà Nẵng)  
- **CEO/Product Owner:** Hồ Đắc Phúc  
- **Mục tiêu kinh doanh:**  
  - Brand hub kiêm Marketing site cho 4 dòng sản phẩm: SP1 (RoboSim Online), SP2 (Robotics Offline), SP3 (Sata Inno School B2B), SP4 (SATAGO du lịch giáo dục)  
  - Lead capture từ phụ huynh → CRM nội bộ  
  - Admin panel đa role cho vận hành trung tâm  
  - LMS đơn giản cho quản lý học viên/lớp/giáo viên  
  - Marketing dashboard cho team chạy ads (Pixel/GA tracking server-side)  
- **2 trang cũ sẽ được migrate vào subpath:**  
  - `laptrinhrobot.vn` → `satarobo.vn/khoa-hoc/lap-trinh-robot`  
  - `luyenthirobosim.vn` → `satarobo.vn/khoa-hoc/luyen-thi-robosim`  
  - 2 domain cũ giữ nguyên 12-24 tháng, chỉ trỏ DNS sang Vercel mới với 301 redirect

---

## 2\. TECH STACK (BẮT BUỘC)

| Lớp | Công nghệ | Ghi chú |
| :---- | :---- | :---- |
| Framework | **Next.js 15** App Router | Không dùng Pages Router |
| Language | **TypeScript** (strict mode) | Bắt buộc, không JS thuần |
| UI | **React 19 \+ JSX/TSX** |  |
| Styling | **Tailwind CSS v4** \+ **shadcn/ui** | KHÔNG dùng CSS-in-JS, KHÔNG styled-components |
| Database | **PostgreSQL** (Supabase) | Free tier đủ dùng phase 1 |
| ORM | **Prisma** | Schema-first |
| Auth | **Auth.js v5** (NextAuth) | Email \+ password, đa role |
| Storage | **Cloudflare R2** hoặc **UploadThing** | Cho ảnh, CV, video |
| Email | **Resend** | Transactional email |
| Form | **React Hook Form \+ Zod** | Validation cả client \+ server |
| Tables | **TanStack Table v8** | Cho admin data grid |
| Charts | **Recharts** | Cho dashboard |
| Icons | **lucide-react** | Đã có trong shadcn |
| Date | **date-fns** | KHÔNG dùng moment.js |
| Tracking | **Meta Pixel \+ CAPI**, **GA4 \+ Measurement Protocol** | Cả client \+ server-side |
| Deploy | **Vercel** | Connect GitHub auto-deploy |
| Background jobs | **Vercel Cron** \+ **Upstash QStash** | Khi cần |

**Node.js:** ≥ 20 LTS. **Package manager:** `pnpm` (nhanh hơn npm).

**KHÔNG được dùng:**

- WordPress, Strapi, Sanity (đã quyết định tự build CMS)  
- Material UI, Chakra UI, Ant Design (chỉ shadcn/ui \+ Tailwind)  
- Redux, Zustand (dùng React Server Components \+ URL state là đủ cho phase 1\)  
- Firebase (đã chọn Supabase)  
- moment.js, lodash (dùng date-fns \+ native JS)

---

## 3\. CODING STANDARDS

### File & folder

- Tên file: **kebab-case** (`lead-table.tsx`, `auth-config.ts`)  
- React component: **PascalCase** export (`export function LeadTable()`)  
- Constants: **SCREAMING\_SNAKE\_CASE**  
- Server actions: file `actions.ts`, function `createLead`, `updateLead`...  
- Co-locate: component \+ test \+ types ở cùng folder

### TypeScript

- `strict: true`  
- KHÔNG dùng `any` (nếu bí, dùng `unknown` rồi narrow)  
- Export type bằng `interface` cho object shape, `type` cho union/utility  
- Zod schema là source of truth → suy ra TypeScript type qua `z.infer`

### React/Next.js

- **Mặc định Server Component**. Chỉ thêm `'use client'` khi cần state, effect, event handler  
- Data fetching trong Server Component (async/await trực tiếp)  
- Mutations bằng **Server Actions** (`'use server'`)  
- Form: React Hook Form \+ Zod resolver, KHÔNG submit trực tiếp lên Server Action mà bọc qua client component  
- KHÔNG dùng `useEffect` cho data fetching (dùng RSC \+ Suspense)

### Database

- Mọi query qua Prisma Client  
- KHÔNG raw SQL trừ khi cần performance đặc biệt  
- Mỗi migration phải có tên rõ nghĩa: `npx prisma migrate dev --name add_lead_status_index`  
- Sau mỗi schema change → chạy `npx prisma generate`

### Security (NGHIÊM NGẶT)

- KHÔNG bao giờ commit `.env*` (đã có trong `.gitignore`)  
- Mọi API route \+ Server Action: check session \+ role TRƯỚC khi đụng DB  
- Input validation bằng Zod schema, parse ở cả client \+ server  
- Rate limit cho `/api/leads` (POST từ form public): max 3 req/phút/IP  
- SQL injection: Prisma đã safe, nhưng KHÔNG dùng `$queryRawUnsafe`  
- XSS: không dùng `dangerouslySetInnerHTML` trừ khi sanitize bằng `isomorphic-dompurify`  
- Password: bcrypt với cost 12+  
- Phone/email khi log: mask 50% (`09xxxxxx20`)

### Git workflow

- Branch: `main` (production), `develop` (staging), feature branch `feat/lead-management`, `fix/...`  
- Commit message: **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`)  
- Mỗi PR: chạy `pnpm lint && pnpm typecheck && pnpm build` PASS mới merge  
- Mỗi feature lớn: tạo PR riêng, KHÔNG dồn nhiều feature vào 1 PR

---

## 4\. PROJECT STRUCTURE (FROZEN)

satarobo-vn/

├── app/

│   ├── (public)/                    \# Public site

│   │   ├── layout.tsx               \# Header \+ Footer \+ FloatingCTA

│   │   ├── page.tsx                 \# Trang chủ /

│   │   ├── ve-chung-toi/page.tsx

│   │   ├── khoa-hoc/

│   │   │   ├── page.tsx

│   │   │   ├── lap-trinh-robot/    \# Migrate từ laptrinhrobot.vn

│   │   │   └── luyen-thi-robosim/  \# Migrate từ luyenthirobosim.vn

│   │   ├── hoc-cu/page.tsx

│   │   ├── tuyen-dung/

│   │   ├── blog/

│   │   └── lien-he/page.tsx

│   ├── (admin)/admin/               \# Protected admin

│   │   ├── layout.tsx               \# Sidebar \+ auth gate

│   │   ├── dashboard/page.tsx

│   │   ├── leads/

│   │   ├── students/

│   │   ├── classes/

│   │   ├── teachers/

│   │   ├── content/                 \# CMS

│   │   ├── marketing/               \# Pixel/GA config \+ reports

│   │   └── settings/

│   ├── api/

│   │   ├── leads/route.ts           \# POST từ form public

│   │   ├── auth/\[...nextauth\]/

│   │   └── webhooks/

│   └── layout.tsx                   \# Root layout \+ tracking scripts

├── components/

│   ├── ui/                          \# shadcn/ui

│   ├── public/                      \# Header, Footer, ...

│   └── admin/                       \# Sidebar, DataTable, ...

├── lib/

│   ├── db.ts                        \# Prisma singleton

│   ├── auth.ts                      \# Auth.js config

│   ├── tracking.ts                  \# Pixel \+ GA \+ CAPI

│   ├── permissions.ts               \# Role check helpers

│   ├── validators/                  \# Zod schemas

│   └── utils.ts                     \# cn(), formatVnd(), formatPhone()

├── prisma/

│   ├── schema.prisma

│   ├── migrations/

│   └── seed.ts                      \# Seed data dev

├── public/                          \# Static assets

├── middleware.ts                    \# Auth \+ redirect domain cũ

├── next.config.ts

├── tailwind.config.ts

├── tsconfig.json

├── package.json

├── .env.example

├── .gitignore

└── CLAUDE.md                        \# File này

**Quy tắc:** Không tự ý đổi cấu trúc trên. Nếu cần thêm folder, hỏi trước.

---

## 5\. ENVIRONMENT VARIABLES

File `.env.example` (commit vào git):

\# Database

DATABASE\_URL="postgresql://..."

DIRECT\_URL="postgresql://..."

\# Auth

NEXTAUTH\_URL="http://localhost:3000"

NEXTAUTH\_SECRET="\<openssl rand \-base64 32\>"

\# Tracking

NEXT\_PUBLIC\_META\_PIXEL\_ID="2157352735031955"

META\_CAPI\_TOKEN=""

NEXT\_PUBLIC\_GA4\_ID="G-0K2CW1DQK1"

GA4\_API\_SECRET=""

\# Email

RESEND\_API\_KEY=""

EMAIL\_FROM="Sata Robo \<noreply@satarobo.vn\>"

\# Storage (Cloudflare R2)

R2\_ACCOUNT\_ID=""

R2\_ACCESS\_KEY\_ID=""

R2\_SECRET\_ACCESS\_KEY=""

R2\_BUCKET\_NAME="satarobo-uploads"

R2\_PUBLIC\_URL="https://cdn.satarobo.vn"

\# Zalo OA (optional)

ZALO\_OA\_TOKEN=""

\# App

NEXT\_PUBLIC\_APP\_URL="https://satarobo.vn"

NODE\_ENV="development"

File `.env.local` (KHÔNG commit) chứa giá trị thật.

---

## 6\. ACCEPTANCE CRITERIA TEMPLATE

Mỗi feature khi hoàn thành phải pass:

- [ ] `pnpm typecheck` PASS (0 errors)  
- [ ] `pnpm lint` PASS (0 errors, warnings OK)  
- [ ] `pnpm build` PASS  
- [ ] Test thủ công flow chính trên `localhost:3000`  
- [ ] Mobile responsive (test viewport 375px)  
- [ ] Tiếng Việt hiển thị đúng (không lỗi font, không nhảy chữ)  
- [ ] Không log secret ra console  
- [ ] Có comment cho logic phức tạp (tiếng Việt OK)  
- [ ] Update README/docs nếu thêm env var hoặc command mới

---

## 7\. WORKFLOW VỚI CLAUDE CODE

Khi nhận task:

1. **Hiểu trước, code sau:** Đọc CLAUDE.md \+ file liên quan trước khi viết  
2. **Plan:** List các file sẽ tạo/sửa, hỏi user nếu plan không chắc  
3. **Implement:** Làm từng file một, không "big bang"  
4. **Verify:** Chạy `pnpm typecheck` sau mỗi 3-5 file  
5. **Commit:** Commit message theo Conventional Commits  
6. **Report:** Liệt kê file đã tạo/sửa \+ cách test

**KHÔNG:**

- Tự ý cài thêm package nếu không có trong stack list (hỏi trước)  
- Tạo file ở folder không có trong structure (hỏi trước)  
- Skip TypeScript errors bằng `// @ts-ignore` (fix tử tế)  
- Hardcode credentials, URL production  
- Xóa code cũ mà không backup hoặc giải thích

---

## 8\. THÔNG TIN LIÊN HỆ NGHIỆP VỤ

Khi cần thông tin business để tạo content/seed:

- **Tên công ty:** Công ty Cổ phần Công nghệ Giáo dục Sata Robo  
- **Trụ sở:** 258 Lê Thanh Nghị, Hoà Cường, Đà Nẵng  
- **Hotline:** 0818.823.720  
- **Email:** [satarobo@gmail.com](mailto:satarobo@gmail.com)  
- **HR contact:** Ms. Trang — [mytrangduong1986@gmail.com](mailto:mytrangduong1986@gmail.com) — 0905.250.544  
- **CEO:** Hồ Đắc Phúc  
- **4 dòng sản phẩm:** SP1 RoboSim Master (online video), SP2 Robotics Offline, SP3 Sata Inno School (B2B), SP4 SATAGO (du lịch giáo dục)  
- **Đối tượng:** Phụ huynh có con lớp 1-8 (B2C); hiệu trưởng/phòng giáo dục (B2B)

---

## 9\. ROLES & PERMISSIONS MATRIX

| Role | Lead | Student | Class | Teacher | Content | Marketing | Settings |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| SUPER\_ADMIN | Full | Full | Full | Full | Full | Full | Full |
| MANAGER | Full (cơ sở mình) | Full (cơ sở mình) | Full (cơ sở mình) | Read | Read | Read | \- |
| SALES | Read+Update assigned | Create | Read | \- | \- | \- | \- |
| TEACHER | \- | Read (lớp mình) | Read (lớp mình) | Self only | \- | \- | \- |
| MARKETING | Read all (mask phone) | \- | \- | \- | Full | Full | \- |
| ACCOUNTANT | Read | Read+Update tuition | Read | Read | \- | \- | \- |

Implement bằng helper `hasPermission(user, action, resource)` trong `lib/permissions.ts`.

---

## 10\. SEO & PERFORMANCE BUDGET

- LCP \< 2.5s trên 4G  
- CLS \< 0.1  
- Lighthouse score ≥ 90 (Performance, SEO, Accessibility, Best Practices) cho mọi public page  
- Mọi page public phải có: `<title>`, `<meta description>`, `<meta og:*>`, JSON-LD schema (Organization, Course, BlogPosting, JobPosting tuỳ trang)  
- Sitemap `/sitemap.xml` auto-generate từ DB  
- Robots `/robots.txt` chặn `/admin/*`  
- Ảnh dùng `next/image` 100%, KHÔNG `<img>` thuần  
- Font: chỉ load **Be Vietnam Pro** subset Vietnamese qua `next/font/google`

---

**END OF CLAUDE.md**  
