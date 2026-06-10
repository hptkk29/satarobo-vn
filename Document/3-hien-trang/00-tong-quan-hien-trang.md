# 00 — Tổng quan hiện trạng

## Tech stack (đang chạy)
- **Next.js 16.2** App Router · **React 19.2** · **TypeScript strict**.
- **Tailwind v4** · shadcn/ui (Radix) · Magic UI + Framer Motion (client) · Recharts (admin).
- **Prisma 5.22** · **PostgreSQL (Supabase)** — pooler IPv4 (`aws-1-ap-northeast-1.pooler.supabase.com`).
- **Auth.js v5** (next-auth 5.0 beta) — JWT strategy, Credentials provider.
- **Cloudflare R2** (storage, `@aws-sdk/client-s3` + presigned) · **Resend** (email) · **Upstash Redis** (rate limit) · **Sentry**.
- **Zalo OA** (ZNS + token refresh) · **Meta** (Lead Ads + Messenger webhook + Ad Insights).
- **@react-pdf/renderer** (chứng chỉ/học bạ) · **xlsx** (import/export) · **bcryptjs** · **qrcode** (chấm công).
- **pnpm 11** · **Vercel** (region hnd1) + Cron · **Vitest** + **Playwright**.

## Kiến trúc: 1 app, 3 domain (host-based routing)
| Host | Route group | Ai vào | Cơ chế |
|---|---|---|---|
| `satarobo.vn` | `app/(public)/` + `app/(legacy)/` | Ai cũng vào | Trang brand + form lead |
| `admin.satarobo.vn` | `app/(admin)/admin/` | 7 role staff (TRỪ PARENT) | CMS quản trị |
| `hocvien.satarobo.vn` | `app/(portal)/portal/` | PARENT (phụ huynh) | Cổng xem dữ liệu con |
| (chung) | `app/(auth)/` | — | `/login`, `/kich-hoat` |

Định tuyến host×role ở `lib/auth/route-policy.ts` → `decideRoute()` (unit-tested). PARENT lọt admin → 307 sang portal; staff lọt portal → 307 sang admin. Sửa rule CHỈ ở `decideRoute()` + test, không sửa `proxy.ts`.

## Quy mô codebase
- **119 Prisma model · 54 enum** (`prisma/schema.prisma`).
- **~158 route admin** (59 thư mục chính) · **~20 route public** · **~19 route portal** · **2 route auth**.
- **~63 file server actions** admin · **9 cron** · **~5 webhook** ingress.
- **Logic nghiệp vụ mới** gom trong `lib/{crm,finance,lms,portal,attendance,events,org,auth,audit}/*`.

## Trạng thái lộ trình A0→R5 (đã đóng 2026-06-10)
| Phase | Nội dung | Trạng thái |
|---|---|---|
| **A0** | OrgUnit tree · RBAC động (DB) · scopedDb · DomainEvent outbox · login chung · AuditLog hợp nhất | ✅ code + test |
| **R1** | CRM Messenger (SR.QD.217) · marketing dashboard · commission 4 tầng | ✅ |
| **R2** | SIS + Finance: convert lead = 1 transaction · invoice code · activation · công nợ | ✅ |
| **R3** | LMS offline: curriculum · điểm danh→học bù · media+consent · assignment · checklist | ✅ |
| **R4** | Portal phụ huynh: không lộ studentId · chỉ xem con mình · consent gate ảnh | ✅ |
| **R5** | HR: chấm công QR + geofence (CHỈ nhân viên) | ✅ |

**Test:** 308 Vitest + 126 e2e = **434 PASS** · `pnpm build` PASS · typecheck/lint sạch.
**Deploy:** schema prod Supabase đã `migrate deploy` đồng bộ; cron prod bảo vệ bằng `CRON_SECRET`.

## Cờ tính năng (`lib/flags.ts`)
| Flag | Env | Mặc định | Ý nghĩa |
|---|---|---|---|
| `RBAC_V2_ENABLED` | `RBAC_V2_ENABLED` | **false** ⚠️ | Bật RBAC động (DB role + scope). OFF = gate chạy matrix tĩnh v1 |
| `COMMON_LOGIN_ENABLED` | `COMMON_LOGIN_ENABLED` | true | Login chung + redirect theo role |
| `DISPATCHER_ENABLED` | `DISPATCHER_ENABLED` | true | Bật DomainEvent dispatcher (cron) |

> ⚠️ `RBAC_V2_ENABLED=false` nghĩa là toàn bộ phân quyền hiện chạy **matrix tĩnh 8 role** (`lib/auth/permissions.ts`); role HO động + scope CENTER/CHILDREN/ASSIGNED trong DB **chưa có hiệu lực runtime**. Xem [06-audit](06-audit-lo-hong.md) C2.

## Nghiệp vụ thật
- Công ty CP Công nghệ Giáo dục Sata Robo (Đà Nẵng), CEO Hồ Đắc Phúc.
- Tổ chức: **HO (Hội sở)** + **CS1 (211 Nguyễn Hữu Thọ)** + **CS2 (114 Hoàng Diệu)** — OrgUnit ngang hàng dưới ROOT.
- 2 khoá chủ lực: **Lập trình Robot** (offline K-9, `laptrinhrobot`) + **Luyện thi RoboSim** (`luyenthirobosim`).
- B2C: phụ huynh con lớp 1–8. Lead **Messenger-first** (Page HO) theo phễu SR.QD.217 (L1→L2→L3).
- 2 domain cũ redirect: `laptrinhrobot.vn`, `luyenthirobosim.vn`.

## Môi trường test (local, không cần Docker/admin)
- **scoop PostgreSQL 18.4** portable: `~/scoop/apps/postgresql/current`, db `satarobo_test`, port 5432.
- Mỗi phase: `playwright.<phase>.config.ts` + `pnpm test:e2e:<phase>` (port 3100; `<PHASE>_SKIP_WEBSERVER=1` cho spec DB-only).
- Vitest = unit/pure (không DB); Playwright = e2e DB-backed.
