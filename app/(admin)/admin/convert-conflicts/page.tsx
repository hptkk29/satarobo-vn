import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { hasRole } from '@/lib/auth/permissions'
import { scopedDb } from '@/lib/db-scope'
import { resolveActor } from '@/lib/auth/actor'
import { roleLabel } from '@/lib/labels'
import { ConflictResolver } from './conflict-resolver'

export const metadata = { title: 'Xung đột chuyển đổi | Admin' }
export const dynamic = 'force-dynamic'

export default async function ConvertConflictsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  // AC3 — chỉ SUPER_ADMIN / CENTER_MANAGER được xử lý.
  if (!hasRole(session.user, 'SUPER_ADMIN') && !hasRole(session.user, 'CENTER_MANAGER')) {
    redirect('/dashboard')
  }

  const sdb = scopedDb(await resolveActor(session.user.id))
  const conflicts = await sdb.convertConflict.findMany({
    where: { status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      leadId: true,
      parentAId: true,
      parentBId: true,
      createdAt: true,
    },
  })

  const userIds = [...new Set(conflicts.flatMap((c) => [c.parentAId, c.parentBId]))]
  const users = userIds.length
    ? await sdb.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          name: true,
          email: true,
          accountStatus: true,
          role: true,
          _count: { select: { children: true } },
        },
      })
    : []
  const userMap = new Map(users.map((u) => [u.id, u]))

  return (
    <div className="max-w-5xl p-6">
      <div className="mb-6 border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Xung đột chuyển đổi (dedupe phụ huynh)</h1>
        <p className="mt-1 text-sm text-gray-600">
          Email khớp một hồ sơ, SĐT khớp hồ sơ khác → convert bị khoá. Gộp hoặc đánh dấu đã xử lý để
          mở khoá.
        </p>
      </div>

      {conflicts.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Không có xung đột nào đang mở.
        </p>
      ) : (
        <ul className="space-y-4">
          {conflicts.map((c) => {
            const a = userMap.get(c.parentAId)
            const b = userMap.get(c.parentBId)
            return (
              <li key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                    OPEN
                  </span>
                  <Link
                    href={`/leads/${c.leadId}`}
                    className="text-xs font-medium text-orange-600 hover:underline"
                  >
                    Mở lead →
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ParentCard title="Hồ sơ A (khớp Email)" user={a} id={c.parentAId} />
                  <ParentCard title="Hồ sơ B (khớp SĐT)" user={b} id={c.parentBId} />
                </div>
                <ConflictResolver
                  conflictId={c.id}
                  parentAName={a?.name ?? a?.email ?? c.parentAId}
                />
                <p className="mt-2 text-xs text-gray-400">
                  Tạo lúc {c.createdAt.toLocaleString('vi-VN')}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ParentCard({
  title,
  user,
  id,
}: {
  title: string
  user:
    | {
        name: string | null
        email: string
        accountStatus: string
        role: string
        _count: { children: number }
      }
    | undefined
  id: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      {user ? (
        <div className="mt-1 text-sm text-gray-800">
          <p className="font-medium">{user.name || '(chưa có tên)'}</p>
          <p className="text-gray-600">{user.email}</p>
          <p className="mt-1 text-xs text-gray-500">
            Vai trò: {roleLabel(user.role)} · Trạng thái: {user.accountStatus} ·{' '}
            {user._count.children} học viên
          </p>
        </div>
      ) : (
        <p className="mt-1 text-sm text-gray-400">Không tìm thấy ({id})</p>
      )}
    </div>
  )
}
