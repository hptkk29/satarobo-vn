# Doc 1 — PRD / Project Overview

> **Ai đọc:** Tất cả thành viên (người mới đọc đầu tiên).
> 🔄 **ĐỒNG BỘ DOC 15 (2026-06-06):** danh sách role trong doc này là **HIỆN TRẠNG** (enum 8 role). Từ A0: role động theo Doc 15 §2.3 (HO_ACCOUNTANT/HO_HR/HO_MARKETING/HO_SALE — **không có HO_MANAGER**; tổ chức ROOT→HO/CS1/CS2 độc lập). Khi xung đột, Doc 15 thắng.
> **Cập nhật:** 2026-06-06 · Sinh tự động từ quét codebase.

---

## 1. Tổng quan dự án

**Sata Robo VN** (`satarobo.vn`) là hệ thống web hợp nhất của **Công ty Cổ phần Công nghệ Giáo dục Sata Robo** (Đà Nẵng, CEO Hồ Đắc Phúc) — trung tâm đào tạo STEM / Lập trình Robotics & AI cho học sinh lớp 1–8.

Hệ thống gồm **3 site trên 3 subdomain**, chạy chung 1 codebase Next.js:

| Site | Host | Đối tượng | Mục đích |
|---|---|---|---|
| **Public (Brand hub)** | `satarobo.vn` | Phụ huynh, công chúng | Marketing, khóa học, tin tức, tuyển dụng, vinh danh, thu lead |
| **Admin CMS/ERP** | `admin.satarobo.vn` | Nhân viên (7 staff role) | CRM lead, LMS, học viên, lớp, đơn hàng, kho, HR, email |
| **Portal học viên** | `hocvien.satarobo.vn` | Phụ huynh (role PARENT) | Theo dõi con: điểm danh, bài tập, bài thi, yêu cầu, đánh giá |

## 2. Vấn đề cần giải quyết

1. **Trước đây:** 2 site marketing rời (`laptrinhrobot.vn`, `luyenthirobosim.vn`) + vận hành thủ công (Excel/Zalo) → dữ liệu phân tán, không truy vết được.
2. **Mục tiêu:** Hợp nhất brand + vận hành toàn bộ vòng đời khách hàng **Lead → Học thử → Ghi danh → Học → Gia hạn/Hoàn thành** trên một hệ thống duy nhất, đạt parity với hệ thống tham chiếu SataWorld (xem `docs/sataworld-feature-parity-analysis.md`).

## 3. Đối tượng người dùng

| Nhóm | Role | Nhu cầu chính |
|---|---|---|
| Phụ huynh (khách) | anonymous | Tìm hiểu khóa học, để lại thông tin tư vấn |
| Phụ huynh (đã ghi danh) | `PARENT` | Xem tiến độ con, gửi yêu cầu nghỉ/bù/chuyển, nộp bài hộ con |
| Sales/CSKH | `SALES_CSM` | Nhận lead, gọi tư vấn, xếp học thử, chăm sóc học viên rủi ro |
| Giáo viên | `TEACHER` | Điểm danh, nhận xét buổi học, giao bài tập, chấm bài, ngân hàng câu hỏi |
| Quản lý cơ sở | `CENTER_MANAGER` | Vận hành cơ sở: lớp, phòng, duyệt ảnh, duyệt ca, checklist mở/đóng |
| Nhân sự | `HR` | Hồ sơ nhân viên, chấm công, tuyển dụng |
| Marketing | `MARKETING` | Tin tức, nội dung trang, theo dõi nguồn lead/UTM |
| Kế toán | `ACCOUNTANT` | Đơn hàng, thanh toán, công nợ, lương (field-level) |
| Quản trị | `SUPER_ADMIN` | Toàn quyền, quản lý user/quyền, audit log |

## 4. Phạm vi tính năng

### In scope (đã triển khai)

**Public site:**
- Trang chủ, `/khoa-hoc` (+ gói Sata1–8, combo), `/tin-tuc` (blog + category/tag), `/tuyen-dung` (+ apply), `/vinh-danh` (Hall of Fame — hiện tắt layout), `/lien-he`, trang pháp lý.
- Form lead (rate-limit, honeypot, chống trùng), tracking GA4 + Meta Pixel/CAPI, SEO đầy đủ (JSON-LD, sitemap, ISR).
- Redirect 2 domain cũ về trang khóa học tương ứng.

**Admin (CRM + LMS + ERP):**
- **CRM:** Lead pipeline 13 trạng thái, auto-assign (round-robin/close-rate), học thử + feedback, bàn giao lead, webhook lead (Facebook/Zalo/Google Form), import Excel.
- **Đào tạo (LMS):** Khóa học → Giáo trình → Bài học; Lớp/Nhóm lớp (cohort); Buổi học tự sinh theo lịch (né ngày nghỉ); Điểm danh + học bù; Ngân hàng câu hỏi → Đề thi → Chấm; Bài tập (trên lớp/về nhà) + rubric; Tài liệu; Học bạ/chứng chỉ PDF.
- **Học viên:** Hồ sơ, ghi danh (9 trạng thái), bảo lưu, chuyển lớp/cơ sở, cảnh báo rủi ro + task chăm sóc, hoàn thành khóa, SataCoin.
- **Bán hàng:** Đơn hàng (khóa/gói/thi/sản phẩm), trả góp 2 đợt, voucher, phương thức thanh toán (VietQR/Tingee), sản phẩm + tồn kho.
- **Vận hành:** Cơ sở/phòng/ngày nghỉ, kho linh kiện (nhập/xuất/kiểm kê), chấm công QR + geofence, đăng ký ca, checklist mở/đóng cơ sở.
- **Giao tiếp:** Email template + queue + 4 cron (Resend), thông báo phụ huynh, chuông thông báo nhân viên, Zalo OA/ZNS (skeleton), khảo sát NPS.
- **Quản trị:** User đa vai trò, per-user permission grant (ALLOW/DENY), audit log 8 domain, nội dung trang (site-content).

**Portal:**
- Hồ sơ, chọn con (multi-child), làm bài thi, nộp bài tập, gửi yêu cầu (vắng/bù/chuyển/bảo lưu), đánh giá, tải bảng điểm PDF.

### Out of scope (chưa làm / có chủ đích)

- Thanh toán cổng online tự động (VNPay live) — hiện ghi nhận chuyển khoản/VietQR thủ công.
- App mobile native.
- Zalo ZNS live (đang stub, `ZALO_LIVE=false`), MISA AMIS sync (skeleton `IntegrationLog`).
- 2FA, SSO.
- Chi tiết khác: xem "out-of-scope log" trong `docs/sataworld-feature-parity-analysis.md`.

## 5. Tech stack đã chọn & lý do (FROZEN — xem CLAUDE.md)

| Layer | Công nghệ | Lý do |
|---|---|---|
| Framework | **Next.js 16 App Router + React 19 + TypeScript strict** | RSC server-first, 1 codebase 3 site, Vercel-native |
| UI | **Tailwind v4 + shadcn/ui**; Magic UI + Framer Motion (client only); Recharts (admin only) | Tách bundle theo site, ESLint enforce |
| DB | **PostgreSQL (Supabase) + Prisma 5** | Type-safe ORM, migration có kiểm soát |
| Auth | **Auth.js v5 (NextAuth)** — credentials + JWT | RBAC 8 role + grant per-user, host-based routing |
| Storage | **Cloudflare R2** (S3-compatible, presigned URL) | CDN `cdn.satarobo.vn`, rẻ, không egress fee |
| Email | **Resend** + queue + cron | Template DB-driven, log đầy đủ |
| Rate limit | **Upstash Redis** (fallback in-memory) | Serverless-safe |
| Monitoring | **Sentry** (server + edge, no PII) | Error tracking |
| Hosting | **Vercel** (region `hnd1`) + GitHub Actions CI | Cron jobs, preview deploys |
| Package manager | **pnpm 11** | |

## 6. Timeline / Lịch sử phase (từ git + memory)

| Giai đoạn | Nội dung |
|---|---|
| Phase 1–3 | Public site, blog, tuyển dụng, vinh danh, legacy redirect |
| Phase 4.x | Admin CMS, RBAC `can()`, UI library split, design system |
| Phase 5.0–5.5 | LMS (curriculum/exam/assignment), inventory, orders/vouchers/products, per-user permissions (5.3), audit log (5.4), email system (5.13) |
| NHÓM 0–4 (Roadmap v2) | Rename roles + PARENT, host-based access (T0.x), CRM module (T1.x), Portal (T2.x), checklist/buổi học/nhóm lớp (P2) |
| Hiện tại (2026-06) | Tiếp tục roadmap v2 — xem `.claude` memory `project_roadmap_v2` |

## 7. Stakeholder map

| Vai trò | Ai | Trách nhiệm |
|---|---|---|
| Product Owner / CEO | Hồ Đắc Phúc | Quyết định scope, nghiệp vụ |
| Dev | Team + Claude Code | Toàn bộ FE/BE/DB/infra |
| Vận hành nội dung | MARKETING | Tin tức, site-content |
| Vận hành đào tạo | CENTER_MANAGER + TEACHER | Lớp, điểm danh, LMS |
| Vận hành sales | SALES_CSM | Lead, chăm sóc |

## 8. Tài liệu liên quan

- Bộ doc này: `Document/01..12-*.md` (đọc theo thứ tự PRD → API → Architecture → DB → Tech Spec → Flow → Security → Test).
- Quy ước code: `CLAUDE.md` + `.claude/rules/*.md`.
- Doc nghiệp vụ chi tiết từng feature: folder `docs/` (16 file: lead-handover, makeup-flow, payment-qr-installments, satacoin, ...).
