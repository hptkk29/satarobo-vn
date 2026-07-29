# CLAUDE.md — Sata Robo VN

Brand hub + admin CMS + portal phụ huynh + site giáo viên cho Sata Robo (Đà Nẵng). 4 site / 4 domain (public `satarobo.vn`, admin `admin.satarobo.vn`, portal `hocvien.satarobo.vn`, teacher `giaovien.satarobo.vn` — BGĐ duyệt 04/07/2026, 2-phase flag `TEACHER_SITE_ENABLED`) chạy chung 1 app Next.js, chia route group `app/(public)/`, `app/(legacy)/`, `app/(admin)/admin/`, `app/(portal)/portal/`, `app/(teacher)/teacher/`, `app/(auth)/`.

> ⭐ **BLUEPRINT CHỐT:** [`Document/2-architecture-design/15-final-architecture-blueprint.md`](Document/2-architecture-design/15-final-architecture-blueprint.md) là nguồn kiến trúc đúng nhất. Khi xung đột giữa "hiện trạng" trong file này và Doc 15 → **Doc 15 thắng cho việc xây MỚI**. File CLAUDE.md mô tả hiện trạng repo + hướng chuyển dịch (mục "Kiến trúc đích" cuối file). Kế hoạch thực thi theo phase: [`Document/0-yeucau/3-ke-hoach-trien-khai/phases/`](Document/0-yeucau/3-ke-hoach-trien-khai/phases/README.md) (A0 → R5).

## Tech stack (FROZEN — đừng đổi nếu không hỏi)

- Next.js 16 App Router · React 19 · TypeScript strict
- Tailwind v4 · shadcn/ui · Magic UI (client only) · Framer Motion / Motion (client only) · Recharts (admin only)
- PostgreSQL (Supabase) · Prisma 5 · Auth.js v5 · Cloudflare R2 storage
- Resend (email) · Upstash Redis (rate limit) · Sentry (server+edge) · pnpm 11 · Vercel (region hnd1) + Cron
- **KHÔNG microservice** — modular monolith (Doc 15 Q1). KHÔNG message broker — dùng DB-backed queue + Vercel Cron.

## Critical conventions

1. **Server-first** — default Server Component. `'use client'` chỉ khi cần state/effect/handler. Data fetch trong RSC (`async`), mutations qua Server Actions (`'use server'`).
2. **Strict TS** — không `any` (dùng `unknown` + narrow). Zod schema là source of truth → suy ra type qua `z.infer`.
3. **Route groups** — public: `app/(public)/...`, legacy: `app/(legacy)/...`, admin: `app/(admin)/admin/...`, portal: `app/(portal)/portal/...`, teacher: `app/(teacher)/teacher/...` (L5 — site GV **ĐÃ LIVE**: flag `TEACHER_SITE_ENABLED` mặc định **ON** từ 10/07/2026 (`lib/flags.ts:86`), host `giaovien.satarobo.vn` **đã wire** trong `proxy.ts:18`; rollback = set env `TEACHER_SITE_ENABLED="false"`), auth: `app/(auth)/login/...`. Không tạo `/admin/*` ngoài route group. Host-based routing qua `proxy.ts` + `lib/auth/route-policy.ts` (sửa rule host×role CHỈ ở `decideRoute()` + test, không sửa proxy.ts).
4. **Imports** — `@/lib/auth` (Auth.js), `@/lib/utils` (cn helper), `@/components/blog/markdown-renderer` (NOT `<Markdown>`). ⚠️ **Cổng DB ĐÃ ĐÓNG** (không còn là "target"): import `@/lib/db` trần trong `app/(admin|portal|teacher)/**` = ESLint **error**. Đi qua `scopedDb(actor)` (admin/teacher) hoặc `portalDb` (portal). Allowlist còn đúng 3 file exception (`lib/eslint/db-import-allowlist.mjs`) — code mới KHÔNG xin thêm vào.
5. **Auth gate** — admin/portal layout đã redirect `/login`. Server Actions/API route VẪN phải `auth()` + `assertCan(...)` ngay đầu function (layout gate là chưa đủ). Portal actions thêm ownership check `assertOwnsStudent`. **RBAC 2 tầng:** quyền action = `can()` v2 động từ DB (`@/lib/auth/can`) — **đang enforce trên prod** vì `RBAC_V2_ENABLED="true"` trên Vercel Production (xác minh 29/07/2026); v1 matrix tĩnh (`@/lib/auth/permissions`) chỉ còn chạy song song để so lệch, và là thứ chạy ở local/dev (mặc định trong code vẫn OFF — `lib/flags.ts:8`).
   ⚠️ **`scopedDb` KHÔNG che write** — chỉ auto-scope 7 method đọc. Mọi `update/delete` phải tự `passesScope()`; mọi `create` trên model thuộc `SCOPED_MODELS` phải set `centerId` (quên = record vô hình với actor cấp cơ sở).
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
├── (legacy)/          # landing khóa học cũ
├── (admin)/admin/     # /admin/dashboard, /admin/leads, /admin/honors, /admin/nhan-su, ...
├── (portal)/portal/   # cổng phụ huynh: /portal/ho-so, /portal/bai-thi, /portal/yeu-cau, ...
├── (teacher)/teacher/ # site giáo viên (L5): /teacher (việc chưa xong), /teacher/lich, /teacher/lop — flag TEACHER_SITE_ENABLED
├── (auth)/login/      # cổng login (target: chung satarobo.vn/login → redirect theo role)
└── api/               # /api/leads, /api/admin/upload-url, /api/cron/*, /api/public/webhook/*, /api/auth/...

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
├── db.ts              # Prisma singleton — KHÔNG import trần trong app/(admin|portal|teacher) (ESLint error)
├── db-scope.ts        # scopedDb(actor) + passesScope() — ⚠️ chỉ auto-scope READ, write phải tự guard
├── org/               # OrgUnit tree
├── auth.ts            # Auth.js config
├── auth/permissions.ts # can() v1 matrix TĨNH — đang enforce trên prod
├── auth/actor.ts · can.ts # can() v2 động (DB) — cờ RBAC_V2_ENABLED: code mặc định OFF, PROD đang ON
├── auth/route-policy.ts # decideRoute() host×role (unit-tested)
├── events/            # DomainEvent outbox + dispatcher — publishEvent(type, payload, {tx, dedupeKey})
├── actions/factory.ts # ActionResult + ActionError + pipeline auth→actor→zod→can→scopedDb→audit
├── audit/             # log helpers (target: AuditLog hợp nhất 1 bảng)
├── email/             # Resend client, queue, triggers
├── storage/           # R2 client + upload-config
├── pdf/               # certificate / transcript / progress-report (@react-pdf)
├── honors/ · validators/ · seo/ · utils.ts
# ❌ `modules/*` (modular monolith boundary) CHƯA TỒN TẠI — đừng import `modules/integration`.

prisma/
├── schema.prisma      # (target: tách multi-file prisma/schema/*.prisma — Doc 15 Q5)
├── migrations/        # NEVER edit applied migrations
└── seed*.ts
```

## Permission & tổ chức

**Hiện trạng (`lib/auth/permissions.ts`):**
- **9 roles** (enum `Role`): `SUPER_ADMIN`, `CENTER_MANAGER`, `HR`, `SALES_CSM`, `TEACHER`, `TRAINING`, `MARKETING`, `ACCOUNTANT`, `PARENT`. (Đã rename `MANAGER→CENTER_MANAGER`, `SALES→SALES_CSM` — legacy shim trong JWT callback. `TRAINING` thêm ở FL W0 (QĐ-T1) — Đào tạo: quản lý TOÀN BỘ LMS, KHÁC `TEACHER` chỉ lớp được giao.)
- ⚠️ **RBAC v2 ĐÃ BẬT TRÊN PROD** — `RBAC_V2_ENABLED="true"` trên Vercel Production (xác minh 29/07/2026 bằng `vercel env pull --environment=production`). Prod enforce **v2 động** (`lib/auth/can.ts`); `lib/auth/shadow-compare.ts:27` trả `flagOn ? v2 : v1`. **Mặc định trong code vẫn OFF** (`lib/flags.ts:8`) ⇒ local/dev/CI chạy **v1**, khác prod — đừng kết luận hành vi quyền từ máy local. Rollback: set env `false` + redeploy.
- ⚠️ **Nợ đi kèm việc flip: `can()` v2 KHÔNG có nhánh DENY.** `lib/auth/can.ts:36-44` là ALLOW-wins thuần, `grantsDeny` không tồn tại ⇒ `UserPermissionGrant` có `grant=DENY` sẽ **bị bỏ qua im lặng**. Đây là 1 trong 3 việc chặn cứng của QĐ-B (`docs/taicautruc/QUYET-DINH.md:52-58`) mà cờ đã bật trước khi làm xong. **Chưa gây thiệt hại:** đo prod 29/07/2026 → bảng `UserPermissionGrant` **rỗng** (0 ALLOW, 0 DENY). **Luật tạm cho tới khi vá:** KHÔNG tạo grant `DENY` — nó không có tác dụng và không báo lỗi. Cần chặn quyền thì gỡ `UserOrgRole` tương ứng.
- Multi-role: `User.roles[]` (quyền = union). Per-user grant ALLOW/DENY: `UserPermissionGrant` (Sprint 5.3). `User.centerId` scope theo cơ sở.
- Field-level visibility (Employee): `basic` (all), `contact` (SUPER_ADMIN/CENTER_MANAGER/HR), `salary` (SUPER_ADMIN/HR/ACCOUNTANT), `personal` (SUPER_ADMIN/HR). `canViewParentContact` chặn TEACHER.
- Pattern: `can(session.user, 'employees:edit')` → boolean; `assertCan(...)` throw trong Server Actions/API.

**Target (Doc 15 §2 — A0, đã chốt §11 Open Items) — dùng cho việc xây MỚI:**
- **Tổ chức = OrgUnit tree:** ROOT(SataRobo) → **HO, CS1, CS2 độc lập ngang hàng**. HO (Hội sở) KHÔNG thuộc CS2 dù trùng địa chỉ. Mở CS mới = thêm data, không sửa code. KHÔNG dùng `address` để suy quan hệ quản lý.
- **RBAC động trong DB:** `RoleDef` + `RolePermission(action, scopeType GLOBAL/CENTER/CLASS/OWN/CHILDREN/ASSIGNED)` + `UserOrgRole(user × orgUnit × role, có effectiveFrom/To/status)`. Chỉ SUPER_ADMIN tạo/sửa role + **audit + reason bắt buộc**. **KHÔNG có role `HO_MANAGER`.** Role HO = cross-center theo chức năng (HO_ACCOUNTANT/HO_HR/HO_MARKETING xem+sửa toàn hệ thống theo module; HO_SALE xem lead scope A&B, **không sửa**).
- **Conflict: ALLOW thắng nếu ≥1 role cho phép — KHÔNG dùng DENY override** ở giai đoạn này.
- **`EmployeeOrgAssignment`** (nhân sự/kiêm nhiệm/lương — 5 assignmentType + allocationPercent) **KHÔNG tự sinh quyền**; quyền chỉ từ `UserOrgRole`.
- **scopedDb(actor)** ép cách ly cơ sở: CS1 không xem CS2 (test CI bắt buộc).

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
- ❌ KHÔNG thiết kế `HO = CS2` / HO nằm dưới CS2 (Doc 15 OI-1) — HO là OrgUnit độc lập dưới ROOT.
- ❌ KHÔNG hardcode danh sách center / "HO + CS2" — đi qua OrgUnit tree (CS3/CS4... thêm không sửa code).
- ❌ KHÔNG để side-effect "dính chùm" inline trong action (target: side-effect không-atomic đi qua DomainEvent; tiền/enrollment đi transaction).
- ❌ KHÔNG đưa lại scope đã LOẠI (Doc 15 §0): AI camera/sinh trắc/định vị học sinh · Web3/NFT/blockchain · marketplace · student login riêng · online video LMS · AI learning path/prediction. Nhu cầu "dự báo/khuyến nghị" làm **rule-based**. (Riêng "teacher domain riêng": **ĐÃ ĐẢO 04/07/2026** — phiếu BGĐ câu 7 duyệt site GV riêng `giaovien.satarobo.vn` → route group `app/(teacher)/teacher/`, 2-phase flag `TEACHER_SITE_ENABLED`.)
- ❌ KHÔNG lưu giấy tờ tùy thân học viên; media phải tag + tôn trọng `StudentConsent`; KHÔNG lộ `studentId` trên URL portal.

## Workflow

1. **Hiểu trước, code sau** — đọc CLAUDE.md + file liên quan; nếu unclear, ASK trước khi code.
2. **Plan** — TodoWrite cho task ≥ 3 steps.
3. **Chunk** — commit từng feature rời, không big-bang.
4. **Verify mỗi 3-5 files** — `pnpm typecheck` để bắt lỗi sớm.
5. **Report** — liệt kê file thay đổi + cách test.

## Business context

- Công ty Cổ phần Công nghệ Giáo dục Sata Robo (Đà Nẵng), CEO Hồ Đắc Phúc.
- 2 khoá học chủ lực: **Lập trình Robot** (offline K-9, slug `laptrinhrobot`) và **Luyện thi RoboSim** (slug `luyenthirobosim`).
- **Scope core (Doc 15):** vận hành đào tạo **offline Sata 1–8 + Combo 1&2**; online course trỏ Sataworld (không build video LMS cho HV tự học). Lead **Messenger-first** (Page HO) theo phễu SR.QD.217 L1→L2→L3.
- **SCORM ≠ "video LMS"** — SCORM là courseware giảng dạy, **TRONG core** (SRS LMS v3.1, TGĐ chốt 12/06/2026) và **đã live prod từ 03/07**. Ràng buộc: học viên **KHÔNG** xem SCORM; GV không tải được file nguồn; blur khi quay/chụp màn hình + watermark động.
- Tổ chức thật: HO (Hội sở) + CS1 (211 Nguyễn Hữu Thọ) + CS2 (114 Hoàng Diệu).
- B2C: phụ huynh con lớp 1-8.
- 2 domain cũ redirect qua middleware (`proxy.ts`): `laptrinhrobot.vn` → `/khoa-hoc/laptrinhrobot`; `luyenthirobosim.vn` → `/khoa-hoc/luyenthirobosim`.

## Kiến trúc đích (Doc 15) — A0→R5 đã đóng (10/06/2026), nay là R6/R7/FL + sprint go-live 26/07

> Khi xây tính năng MỚI, theo blueprint Doc 15 — **nhưng đọc kèm phần ~~gạch ngang~~ + `[ĐẢO ...]`** (Doc 15 đã bị sửa tại chỗ; vd site giáo viên từ "đã loại" → **in-scope** 04/07/2026). Quyết định ký SAU (phiếu BGĐ · biên bản chốt · SRS bản mới) **thắng** Doc 15.
> Hệ thống nâng cấp **dần, additive trước — drop sau khi ổn định** (2-phase); hệ thống không dừng.
> ⚠️ **Đã tồn tại** (đừng coi là "sắp có"): `scopedDb` · `can()` v2 · OrgUnit · `lib/events`. **Chưa tồn tại:** `modules/*`.
> ⚠️ **Yêu cầu MỚI không gán vào "Phase A0–R5"** — khung đang lập lịch là GĐ0→GĐ4 (deadline **26/07/2026**) + ticket K\*/L\*/V\* + lane #NN. Chi tiết: `docs/ke-hoach-go-live-2607/`.

- **6 trụ kiến trúc:** OrgUnit tree · RBAC động (DB) · scopedDb (cách ly cơ sở) · DomainEvent outbox (tách side-effect) · modular monolith (`modules/*` + ESLint boundary) · login chung + portal.
- **Quy tắc atomic vs event:** tiền/invoice/enrollment/kho → trong **transaction**; thông báo/stats/đồng bộ ngoài → **DomainEvent** (handler idempotent). External call (Resend/Zalo/MISA/Meta/CAPI/GA4) CHỈ qua `modules/integration`.
- **API contract (target):** success `{ ok, data, meta }` · error `{ ok:false, error:{ code(EN), message(VI), field?, requestId } }`. Idempotency bắt buộc cho webhook + confirm payment.
- **AuditLog hợp nhất** + mask PII theo quyền; export nhạy cảm có watermark + audit lại. Backup Supabase (RPO 24h/RTO 4–8h).
- **Lộ trình & test:** mỗi phase có ticket + test (Playwright + Vitest) phủ **12 nhóm** (T1–T12), quy trình Task→Test→Check. Xem `Document/0-yeucau/3-ke-hoach-trien-khai/phases/`.

## Tài liệu kiến trúc (đọc khi cần)

- ⭐ [Document/2-architecture-design/15-final-architecture-blueprint.md](Document/2-architecture-design/15-final-architecture-blueprint.md) — BLUEPRINT CHỐT (nguồn đúng nhất).
- [Document/0-yeucau/3-ke-hoach-trien-khai/phases/](Document/0-yeucau/3-ke-hoach-trien-khai/phases/README.md) — kế hoạch + test theo phase A0→R5 (A0 có ticket chi tiết).
- [Document/README.md](Document/README.md) — bộ tài liệu PRD→DB→API→Flow→Security→Test (mô tả hiện trạng).

## Detailed rules (load on-demand)

- [.claude/rules/client-site.md](.claude/rules/client-site.md) — animations, SEO, performance
- [.claude/rules/admin-site.md](.claude/rules/admin-site.md) — server actions, RBAC patterns
- [.claude/rules/ui-libraries.md](.claude/rules/ui-libraries.md) — Magic UI / Motion / Recharts allowed scope
- [.claude/rules/prisma-db.md](.claude/rules/prisma-db.md) — migrations, seed, Supabase IPv6 quirk
