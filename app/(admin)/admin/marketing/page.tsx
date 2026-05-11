import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Lead mới',
  CONTACTED: 'Đã liên hệ',
  DEMO_SCHEDULED: 'Đã hẹn demo',
  ENROLLED: 'Đã đăng ký',
  NURTURING: 'Đang nuôi',
  LOST: 'Đã mất',
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-500',
  CONTACTED: 'bg-yellow-500',
  DEMO_SCHEDULED: 'bg-purple-500',
  ENROLLED: 'bg-green-500',
  NURTURING: 'bg-orange-500',
  LOST: 'bg-gray-400',
}

function pct(part: number, total: number) {
  if (total === 0) return '0%'
  return `${Math.round((part / total) * 100)}%`
}

export default async function MarketingPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!hasPermission(session.user, 'read', 'marketing')) redirect('/admin/dashboard')

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const [
    totalLeads,
    leadsByStatus,
    recentTrend,
  ] = await Promise.all([
    db.lead.count({ where: { deletedAt: null } }).catch(() => 0),
    db.lead.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    }).catch(() => []),
    db.lead.count({ where: { deletedAt: null, createdAt: { gte: thirtyDaysAgo } } }).catch(() => 0),
  ])

  // groupBy source — order client-side to avoid Prisma typing issue
  const [rawSource, rawUtmSource, rawUtmCampaign] = await Promise.all([
    db.lead.groupBy({
      by: ['source'],
      where: { deletedAt: null, source: { not: null } },
      _count: { _all: true },
    }).catch(() => []),
    db.lead.groupBy({
      by: ['utmSource'],
      where: { deletedAt: null, utmSource: { not: null } },
      _count: { _all: true },
    }).catch(() => []),
    db.lead.groupBy({
      by: ['utmCampaign'],
      where: { deletedAt: null, utmCampaign: { not: null } },
      _count: { _all: true },
    }).catch(() => []),
  ])

  const leadsBySource = [...rawSource].sort((a, b) => b._count._all - a._count._all).slice(0, 8)
  const leadsByUtmSource = [...rawUtmSource].sort((a, b) => b._count._all - a._count._all).slice(0, 8)
  const leadsByUtmCampaign = [...rawUtmCampaign].sort((a, b) => b._count._all - a._count._all).slice(0, 8)

  const enrolledCount = leadsByStatus.find(s => s.status === 'ENROLLED')?._count._all ?? 0
  const conversionRate = pct(enrolledCount, totalLeads)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Marketing Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Phân tích hiệu quả chiến dịch và tracking</p>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Tổng lead', value: totalLeads.toLocaleString('vi-VN'), sub: 'Tất cả thời gian' },
          { label: 'Lead 30 ngày qua', value: recentTrend.toLocaleString('vi-VN'), sub: 'Tháng gần nhất' },
          { label: 'Đã đăng ký', value: enrolledCount.toLocaleString('vi-VN'), sub: 'Converted' },
          { label: 'Tỉ lệ chuyển đổi', value: conversionRate, sub: 'Enrolled / Total' },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">{card.label}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{card.value}</p>
            <p className="mt-1 text-xs text-gray-400">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Lead funnel */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-gray-900">Phễu chuyển đổi Lead</h2>
        <div className="space-y-3">
          {leadsByStatus.map((row) => (
            <div key={row.status}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">{STATUS_LABELS[row.status] ?? row.status}</span>
                <span className="tabular-nums text-gray-500">
                  {row._count._all} ({pct(row._count._all, totalLeads)})
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-gray-100">
                <div
                  className={`h-2.5 rounded-full ${STATUS_COLORS[row.status] ?? 'bg-gray-400'}`}
                  style={{ width: pct(row._count._all, totalLeads) }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* By source */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-gray-900">Theo nguồn khóa học</h2>
          {leadsBySource.length === 0 ? (
            <p className="text-sm text-gray-400">Chưa có dữ liệu</p>
          ) : (
            <ul className="space-y-2.5">
              {leadsBySource.map((row) => (
                <li key={row.source} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-gray-600">{row.source ?? '(trực tiếp)'}</span>
                  <span className="shrink-0 text-sm font-bold text-gray-800">{row._count._all}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* By UTM source */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-gray-900">Theo UTM Source</h2>
          {leadsByUtmSource.length === 0 ? (
            <p className="text-sm text-gray-400">Chưa có dữ liệu UTM</p>
          ) : (
            <ul className="space-y-2.5">
              {leadsByUtmSource.map((row) => (
                <li key={row.utmSource} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-gray-600">{row.utmSource ?? '(none)'}</span>
                  <span className="shrink-0 text-sm font-bold text-gray-800">{row._count._all}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* By UTM campaign */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-gray-900">Theo UTM Campaign</h2>
          {leadsByUtmCampaign.length === 0 ? (
            <p className="text-sm text-gray-400">Chưa có dữ liệu UTM</p>
          ) : (
            <ul className="space-y-2.5">
              {leadsByUtmCampaign.map((row) => (
                <li key={row.utmCampaign} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-gray-600">{row.utmCampaign ?? '(none)'}</span>
                  <span className="shrink-0 text-sm font-bold text-gray-800">{row._count._all}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Tracking config status */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-gray-900">Trạng thái Tracking</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Meta Pixel (client)', envKey: 'NEXT_PUBLIC_META_PIXEL_ID' },
            { label: 'Meta CAPI (server)', envKey: 'META_CAPI_TOKEN' },
            { label: 'GA4 (client)', envKey: 'NEXT_PUBLIC_GA4_ID' },
            { label: 'GA4 MP (server)', envKey: 'GA4_API_SECRET' },
          ].map((item) => {
            const configured = !!(process.env[item.envKey])
            return (
              <div key={item.label} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${configured ? 'bg-green-500' : 'bg-red-400'}`} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">{item.label}</p>
                  <p className="text-xs text-gray-400">{configured ? 'Đã cấu hình' : 'Chưa cấu hình'}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
