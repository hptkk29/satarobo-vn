---
name: scope-discipline
description: Stay within the user's request. Don't refactor unrelated code, don't add features they didn't ask for, don't reorganize folders proactively. Use when user gives a focused task — keep the diff minimal.
---

# Scope discipline

## Triggers

- User asks "thêm field X vào form Y", "fix bug Z", "đổi color của button A".
- User asks specific bug fix → fix only that bug, not surrounding code.

## Do

- Make the smallest change that achieves the request.
- If you spot something else that needs fixing, FLAG it in summary — don't auto-fix.
- Preserve existing patterns even if you think they're suboptimal.

## Don't

- ❌ Refactor adjacent functions while fixing a bug.
- ❌ Reorganize imports/files "while you're at it".
- ❌ Update unrelated deps.
- ❌ Add tests/comments/documentation user didn't ask for.

## Reporting

End-of-turn summary: liệt kê chính xác files đã đổi + 1 line tóm tắt thay đổi. KHÔNG embellish.

## Example

> "Thêm field `phone` vào form Employee"

✅ Đúng: Edit `employee-form.tsx` thêm input `phone`; edit `validators/employee.ts` thêm vào Zod schema (nếu chưa có); maybe edit `actions.ts` (nếu form gọi action). DONE.

❌ Sai: Sửa luôn date picker style, rename biến, add `phone` formatting helper, refactor select component...
