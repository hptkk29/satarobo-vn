import { Megaphone, TrendingUp, GraduationCap, Settings, Crown } from 'lucide-react'

const DEPARTMENTS = [
  {
    icon: Megaphone,
    role: 'Trưởng phòng Marketing',
    name: '[Placeholder — ANH CẦN CẬP NHẬT]',
    color: 'orange' as const,
  },
  {
    icon: TrendingUp,
    role: 'Trưởng phòng Kinh doanh',
    name: '[Placeholder — ANH CẦN CẬP NHẬT]',
    color: 'orange' as const,
  },
  {
    icon: GraduationCap,
    role: 'Trưởng phòng Đào tạo',
    name: '[Placeholder — ANH CẦN CẬP NHẬT]',
    color: 'purple' as const,
  },
  {
    icon: Settings,
    role: 'Trưởng phòng Vận hành',
    name: '[Placeholder — ANH CẦN CẬP NHẬT]',
    color: 'purple' as const,
  },
]

function CeoCard() {
  return (
    <div
      className="rounded-2xl px-8 py-5 text-white text-center shadow-lg min-w-[220px]"
      style={{ background: 'linear-gradient(135deg, #F97316, #7C3AED)' }}
    >
      <div className="flex justify-center mb-2">
        <Crown className="w-5 h-5 text-white/80" />
      </div>
      <div className="font-extrabold text-base">CEO &amp; Người sáng lập</div>
      <div className="text-white/90 font-semibold text-sm mt-1">Hồ Đắc Phúc</div>
    </div>
  )
}

interface DeptCardProps {
  icon: React.ElementType
  role: string
  name: string
  color: 'orange' | 'purple'
}

function DeptCard({ icon: Icon, role, name, color }: DeptCardProps) {
  const isOrange = color === 'orange'
  return (
    <div
      className={`card-base p-4 text-center border ${
        isOrange ? 'border-orange-100' : 'border-purple-100'
      } w-full`}
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3 ${
          isOrange ? 'bg-soft-cream' : 'bg-soft-purple'
        }`}
      >
        <Icon
          className={`w-5 h-5 ${isOrange ? 'text-primary-orange' : 'text-primary-purple'}`}
        />
      </div>
      <div className="text-xs font-extrabold text-text-dark leading-snug">{role}</div>
      <div className="text-xs text-text-muted mt-1 truncate">{name}</div>
    </div>
  )
}

export function OrgChart() {
  return (
    <section className="section-padding bg-white">
      <div className="container-site">
        <div className="text-center mb-12">
          <span className="badge-orange mb-3 inline-block">Tổ chức</span>
          <h2 className="heading-2 text-text-dark">
            Sơ đồ{' '}
            <span className="text-gradient-orange-purple">tổ chức</span>
          </h2>
          <p className="text-text-muted mt-3">
            Đội ngũ chuyên nghiệp, vận hành tinh gọn và hiệu quả
          </p>
        </div>

        {/* Desktop: horizontal tree */}
        <div className="hidden md:flex flex-col items-center">
          {/* CEO */}
          <CeoCard />

          {/* Vertical connector */}
          <div className="w-px h-8 bg-border" />

          {/* Horizontal bar + 4 departments */}
          <div className="relative w-full max-w-3xl">
            {/* Horizontal line from center of col-1 to center of col-4 (12.5% → 87.5%) */}
            <div className="absolute top-0 left-[12.5%] w-[75%] h-px bg-border" />

            <div className="grid grid-cols-4 gap-3">
              {DEPARTMENTS.map((dept) => (
                <div key={dept.role} className="flex flex-col items-center">
                  {/* Vertical connector from horizontal bar */}
                  <div className="w-px h-8 bg-border" />
                  <DeptCard {...dept} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile: vertical list */}
        <div className="md:hidden space-y-4">
          {/* CEO */}
          <div className="flex justify-center">
            <CeoCard />
          </div>
          <div className="flex items-center gap-2 px-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-muted">Các phòng ban</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {DEPARTMENTS.map((dept) => (
              <DeptCard key={dept.role} {...dept} />
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-text-muted mt-8 opacity-60">
          {/* ANH CẦN CẬP NHẬT tên và vị trí đầy đủ trong sơ đồ tổ chức */}
          Sơ đồ tổ chức sẽ được cập nhật đầy đủ — ANH CẦN CUNG CẤP tên trưởng phòng
        </p>
      </div>
    </section>
  )
}
