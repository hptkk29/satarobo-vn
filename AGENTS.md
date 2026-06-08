# AGENTS.md — Sata Robo VN

> **Nguồn hướng dẫn agent của dự án này là [`CLAUDE.md`](CLAUDE.md)** — giữ 1 nguồn duy nhất để không trôi lệch. File này chỉ là điểm vào cho công cụ đọc `AGENTS.md`; **đọc `CLAUDE.md` để có toàn bộ quy ước.**

## Tóm tắt tối thiểu (chi tiết: CLAUDE.md)

- **Stack (FROZEN):** Next.js 16 App Router · React 19 · TS strict · Tailwind v4 + shadcn/ui · Prisma 5 + PostgreSQL(Supabase) · Auth.js v5 · R2 · Resend · pnpm 11 · Vercel. KHÔNG microservice, KHÔNG message broker.
- **Blueprint chốt:** [`Document/2-architecture-design/15-final-architecture-blueprint.md`](Document/2-architecture-design/15-final-architecture-blueprint.md) — khi xây MỚI theo Doc 15; khi xung đột với mô tả hiện trạng, Doc 15 thắng.
- **Server-first** (RSC), mutations qua Server Actions; `auth()` + `assertCan(...)` đầu mọi action/API; Zod là source of truth type.
- **Tổ chức đích:** OrgUnit tree ROOT → **HO/CS1/CS2 độc lập** (HO ≠ CS2); RBAC động trong DB; **không có HO_MANAGER**; **ALLOW-wins, không DENY override**; `scopedDb` cách ly cơ sở (CS1 ⛔ CS2); `EmployeeOrgAssignment` không sinh quyền.
- **Atomic vs event:** tiền/enrollment → transaction; side-effect → DomainEvent (idempotent); external call chỉ qua `modules/integration`.
- **Scope đã LOẠI:** AI (camera/chatbot/learning-path/prediction) · Web3/NFT/blockchain · marketplace · student login riêng · online video LMS. Dự báo = rule-based.
- **Verify trước khi báo PASS:** `pnpm typecheck && pnpm lint && pnpm build`; UI: smoke 375px.
- **Bảo mật:** không commit `.env*`/secret; không hardcode credentials; không lộ `studentId`; media tôn trọng consent.

## Kế hoạch thực thi theo phase (kèm test Playwright + Vitest)

[`Document/0-yeucau/3-ke-hoach-trien-khai/phases/`](Document/0-yeucau/3-ke-hoach-trien-khai/phases/README.md) — quy trình Task → Test → Check; A0 có task-ticket chi tiết (test phủ 12 nhóm). Bắt đầu: **A0-00 → A0-01**.

## Detailed rules

`.claude/rules/{client-site,admin-site,ui-libraries,prisma-db}.md`
