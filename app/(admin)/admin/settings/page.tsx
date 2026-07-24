import Link from 'next/link'
import { ArrowRight, BookOpenText } from 'lucide-react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { resolveActor } from '@/lib/auth/actor'
import { scopedDb } from '@/lib/db-scope'
import { isSuperAdmin } from '@/lib/auth/permissions'
import { roleLabel } from '@/lib/labels'
import { ChangePasswordForm } from './_components/change-password-form'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  // Center ∈ SCOPE_EXEMPT → scopedDb pass-through; superAdmin vẫn thấy mọi cơ sở (#03).
  const sdb = scopedDb(await resolveActor(session.user.id))

  const superAdmin = isSuperAdmin(session.user.role)

  const centers = superAdmin
    ? await sdb.center.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, address: true, phone: true, email: true, isActive: true } }).catch(() => [])
    : []

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cài đặt</h1>
        <p className="mt-1 text-sm text-gray-500">Quản lý tài khoản và cấu hình hệ thống</p>
      </div>

      {/* Profile */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-gray-900">Thông tin tài khoản</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tên</dt>
            <dd className="mt-1 text-sm font-medium text-gray-800">{session.user.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Email</dt>
            <dd className="mt-1 text-sm font-medium text-gray-800">{session.user.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Vai trò</dt>
            <dd className="mt-1 text-sm font-medium text-gray-800">{roleLabel(session.user.role)}</dd>
          </div>
        </dl>
      </section>

      {/* Change password */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-base font-bold text-gray-900">Đổi mật khẩu</h2>
        <p className="mb-5 text-sm text-gray-500">Mật khẩu tối thiểu 8 ký tự, bao gồm chữ hoa và số</p>
        <ChangePasswordForm />
      </section>

      {/* Hướng dẫn sử dụng — lối vào bộ tài liệu hướng dẫn theo khối chức năng */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-gray-900">
          <BookOpenText className="h-4 w-4 text-orange-500" aria-hidden /> Hướng dẫn sử dụng
        </h2>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            Tài liệu hướng dẫn trang quản trị theo từng khối chức năng — kèm các bước
            thao tác và đường dẫn mở thẳng trang.
          </p>
          <Link
            href="/huong-dan"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Mở hướng dẫn <ArrowRight className="h-4 w-4 text-gray-400" aria-hidden />
          </Link>
        </div>
      </section>

      {/* Centers — super admin only */}
      {superAdmin && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-gray-900">Danh sách cơ sở</h2>
          <div className="space-y-3">
            {centers.map((c) => (
              <div key={c.id} className="flex items-start justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{c.address}</p>
                  {c.phone && <p className="mt-0.5 text-xs text-gray-400">{c.phone}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {c.isActive ? 'Hoạt động' : 'Tắt'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Env info — super admin */}
      {superAdmin && (
        <section className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6">
          <h2 className="mb-3 text-base font-bold text-gray-700">Thông tin môi trường</h2>
          <ul className="space-y-1.5 font-mono text-xs text-gray-500">
            <li>NODE_ENV: {process.env.NODE_ENV}</li>
            <li>NEXT_PUBLIC_APP_URL: {process.env.NEXT_PUBLIC_APP_URL}</li>
            <li>Meta Pixel ID: {process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '(chưa set)'}</li>
            <li>GA4 ID: {process.env.NEXT_PUBLIC_GA4_ID ?? '(chưa set)'}</li>
          </ul>
        </section>
      )}
    </div>
  )
}
