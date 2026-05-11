import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { Users, UserPlus, BookOpen, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  MANAGER: 'Quản lý',
  SALES: 'Sales',
  TEACHER: 'Giáo viên',
  MARKETING: 'Marketing',
  ACCOUNTANT: 'Kế toán',
}

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Lead mới',
  CONTACTED: 'Đã liên hệ',
  DEMO_SCHEDULED: 'Đã hẹn demo',
  ENROLLED: 'Đã đăng ký',
  NURTURING: 'Đang nuôi',
  LOST: 'Đã mất',
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700',
  CONTACTED: 'bg-yellow-100 text-yellow-700',
  DEMO_SCHEDULED: 'bg-purple-100 text-purple-700',
  ENROLLED: 'bg-green-100 text-green-700',
  NURTURING: 'bg-orange-100 text-orange-700',
  LOST: 'bg-gray-100 text-gray-500',
}


export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const roleLabel = ROLE_LABELS[session.user.role] ?? session.user.role

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [totalLeads, todayLeads, leadsByStatus, totalPosts, recentLeads] = await Promise.all([
    db.lead.count({ where: { deletedAt: null } }).catch(() => 0),
    db.lead.count({ where: { deletedAt: null, createdAt: { gte: todayStart } } }).catch(() => 0),
    db.lead.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }).catch(() => []),
    db.blogPost.count({ where: { isPublished: true } }).catch(() => 0),
    db.lead.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, parentName: true, phone: true, status: true, createdAt: true, center: { select: { name: true } } },
    }).catch(() => []),
  ])

  const stats = [
    { title: 'Tổng lead', value: totalLeads.toLocaleString('vi-VN'), icon: Users, color: 'text-blue-600 bg-blue-50' },
    { title: 'Lead mới hôm nay', value: `+${todayLeads}`, icon: UserPlus, color: 'text-orange-600 bg-orange-50' },
    { title: 'Bài viết đã đăng', value: totalPosts.toLocaleString('vi-VN'), icon: FileText, color: 'text-purple-600 bg-purple-50' },
    { title: 'Lead đã đăng ký', value: (leadsByStatus.find(s => s.status === 'ENROLLED')?._count._all ?? 0).toLocaleString('vi-VN'), icon: BookOpen, color: 'text-green-600 bg-green-50' },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Chào {session.user.name ?? 'Admin'} 👋
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Vai trò: <span className="font-medium text-[#7C3AED]">{roleLabel}</span>
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title} className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">{stat.title}</CardTitle>
                <div className={`rounded-lg p-2 ${stat.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Lead by status */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-bold">Lead theo trạng thái</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {leadsByStatus.length === 0 ? (
              <p className="text-sm text-gray-400">Chưa có dữ liệu</p>
            ) : (
              leadsByStatus.map((row) => (
                <div key={row.status} className="flex items-center justify-between">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[row.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABELS[row.status] ?? row.status}
                  </span>
                  <span className="text-sm font-bold text-gray-700">{row._count._all}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent leads */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-bold">Lead mới nhất</CardTitle>
          </CardHeader>
          <CardContent>
            {recentLeads.length === 0 ? (
              <p className="text-sm text-gray-400">Chưa có lead nào</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {recentLeads.map((lead) => (
                  <li key={lead.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{lead.parentName}</p>
                      <p className="text-xs text-gray-400">{lead.center?.name ?? '—'}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[lead.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABELS[lead.status] ?? lead.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
