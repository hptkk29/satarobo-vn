---
description: Run pnpm typecheck + lint + build và report status
---

# /verify

Chạy 3 checks và report:

1. `pnpm typecheck` (TypeScript strict — 0 errors expected)
2. `pnpm lint` (ESLint with cross-import rules)
3. `pnpm build` (Prisma generate + Next.js build)

Sau khi xong, in:

- Số errors mỗi check.
- Tổng số routes nếu build pass.
- Nếu fail: paste error message + chỉ ra file gây lỗi.

Nếu dev server đang chạy và build báo EPERM trên Prisma DLL: state rõ "Dev server lock — cần restart hoặc dùng `npx next build` skip prisma generate. Migration đã apply, types đã generate."

Sau verify, gọi skill `goal-verification` nếu user vừa hoàn thành multi-file task.
