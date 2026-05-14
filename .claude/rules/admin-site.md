---
description: Rules cho admin CMS/CRM (app/(admin)/admin/...)
globs: ["app/(admin)/**/*.tsx", "app/(admin)/**/*.ts", "components/admin/**/*.tsx"]
---

# Admin site rules

## Auth & RBAC

- Layout `app/(admin)/admin/layout.tsx` đã `auth() + redirect /login` — không lặp lại check ở mọi page.
- Mỗi page CHO check role gate: `if (!can(session.user.role, 'leads:view-all')) redirect('/admin/dashboard')`.
- Server Actions BẮT BUỘC: `const session = await auth()` + `assertCan(session.user.role, 'resource:action')` ngay đầu function.
- Field-level visibility (lương, dateOfBirth, etc): `getEmployeeFieldVisibility(role)` trong UI form/table.

## Server Actions pattern

```typescript
'use server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { assertCan } from '@/lib/auth/permissions'
import { thingSchema } from '@/lib/validators/thing'

export async function createThingAction(input: unknown) {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  try { assertCan(session.user.role, 'thing:create') }
  catch { return { ok: false, error: 'Không có quyền' } }

  const parsed = thingSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message }

  await db.thing.create({ data: { ...parsed.data, createdById: session.user.id } })
  revalidatePath('/admin/things')
  return { ok: true }
}
```

## UI

- shadcn/ui primitives only — NO Magic UI, NO Framer Motion (ESLint blocks).
- Charts: dùng `@/components/charts/{line,bar,funnel}-chart` wrappers; animation 300ms — đừng tăng.
- Forms: `<Switch>`, `<Select>`, `<Input>`, `<Textarea>` shadcn; React Hook Form khi form lớn.
- Toast: `toast.success/error` từ `sonner` (đã có trong layout).

## Data table pattern

- Server Component fetch → pass plain data → Client table with row actions calling server actions inside `useTransition`.
- Confirm-delete pattern: 2-click (đặt `deleteId` state, click 2 lần để confirm).

## Banned in admin

- ❌ Magic UI / Motion (ESLint blocks at `@/components/magic/*`, `framer-motion`, `motion`).
- ❌ Recharts wrapper duration > 300ms.
- ❌ `useEffect` cho fetch — dùng RSC.

## Revalidation conventions

- Sau Server Action mutation:
  - `revalidatePath('/admin/<resource>')` để list cập nhật
  - `revalidatePath('/<public-path>/<slug>')` nếu có public mirror (vd `/vinh-danh/<slug>`)
