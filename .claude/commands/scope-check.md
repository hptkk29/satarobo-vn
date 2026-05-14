---
description: Trước khi implement, list các files sẽ touch và confirm với user nếu scope vượt request
---

# /scope-check

Trigger trước khi bắt đầu task ≥ 3 files.

## Output format

```
📋 Scope plan cho task: "<user's request>"

Files sẽ CHẠM:
  CREATE:
    - path/to/new-file.tsx
  MODIFY:
    - path/to/existing-file.tsx (reason: ...)

Files KHÔNG đụng (mặc dù related):
  - path/to/related.tsx — vì user không yêu cầu

Dependencies new (nếu có):
  - <package> — reason: ...

Risk:
  - Migration DB (nếu có)
  - Force destructive (nếu có)
  - Cross-cutting (vd đổi auth flow)

→ Confirm proceed?
```

## Khi nào KHÔNG cần `/scope-check`

- Task 1-2 files (trivial).
- User explicitly cho phép aggressive scope.

## Khi nào BẮT BUỘC

- Phase mới (≥10 files).
- Schema migration.
- Add new dependency (pnpm add).
- Force destructive (git reset, prisma migrate reset, rm -rf).
- Refactor cross-cutting (auth, validators, ESLint config).

Sau khi user confirm, gọi skill `scope-discipline` để tuân thủ kế hoạch — không đi lệch.
