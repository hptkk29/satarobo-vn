---
name: goal-verification
description: Before reporting a task PASS, verify by running typecheck, lint, build, and smoke-testing the actual feature. Don't claim success based only on "code compiles". Trigger at end of every multi-file task.
---

# Goal verification

## Required checks before reporting PASS

```bash
pnpm typecheck   # 0 errors
pnpm lint        # 0 errors (warnings OK)
pnpm build       # success (skips if dev server holds Prisma DLL — note in report)
```

## For UI changes

Cannot verify UI just by build success. **Must** state explicitly:

> "Code compile pass. UI smoke test cần anh kiểm: vào `/<path>` → expect (a) X visible, (b) Y clickable, (c) mobile 375px ok."

Don't claim "✅ everything works" if you haven't actually run dev server và check browser.

## For DB schema changes

After migration:
1. Verify schema migration applied: `npx prisma migrate status` or check `_prisma_migrations` table.
2. Restart dev server (Prisma Client cache).
3. Smoke test that new model/field actually queryable.

## For Server Action changes

- Verify return shape (`{ ok: boolean, error?, data? }`).
- Test happy path + 1 error path (validation fail).
- Confirm `revalidatePath()` called for relevant routes.

## Reporting format

✅ Good report:
```
Verified:
- typecheck: 0 errors
- lint: 0 errors
- build: PASS — 59 routes (added 3: /admin/honors, /admin/honors/new, /admin/honors/[id]/edit)
- Migration applied: 20260514092456_add_hall_of_fame
- Seed re-runs idempotent

Smoke test for user:
1. Restart dev server (Prisma Client cache).
2. Login admin → /admin/honors → expect 5 records.
3. Open /vinh-danh → expect spotlight + 4 category cards.
```

❌ Bad report:
```
✅ Everything works! Phase 4.4.1 DONE.
```
(Không có evidence — anh không biết cụ thể đã verify gì.)

## Honest failures

Nếu typecheck/lint/build fail nhưng partial work valuable:
- Report rõ chỗ fail + traceback.
- Mark todo `in_progress` chứ không `completed`.
- Ask user về approach (rollback, fix-forward, skip).

→ KHÔNG bao giờ mark `completed` với code không pass.
