import Image from 'next/image'

interface TeamMember {
  name: string
  role: string
  intro: string
  avatar: string | null
  initials: string
  color: string
}

const TEAM_MEMBERS: TeamMember[] = [
  {
    name: 'Hồ Đắc Phúc',
    role: 'CEO & Người sáng lập',
    intro: 'Người sáng lập Sata Robo, đam mê Robotics giáo dục từ 2020.',
    avatar: '/images/about/team/ho-dac-phuc.jpg', // ANH CẦN CUNG CẤP ẢNH THẬT
    initials: 'HP',
    color: '#F97316',
  },
  {
    name: 'Ms. Trang',
    role: 'HR Manager',
    intro: 'Phụ trách tuyển dụng và phát triển nhân sự toàn hệ thống.',
    avatar: '/images/about/team/ms-trang.jpg', // ANH CẦN CUNG CẤP ẢNH THẬT
    initials: 'MT',
    color: '#7C3AED',
  },
  {
    // ANH CẦN CUNG CẤP — tên và giới thiệu trưởng phòng đào tạo
    name: '[Placeholder]',
    role: 'Trưởng phòng Đào tạo',
    intro: '[ANH CẦN CUNG CẤP — Giới thiệu ngắn về trưởng phòng đào tạo]',
    avatar: null,
    initials: 'DT',
    color: '#F97316',
  },
  {
    // ANH CẦN CUNG CẤP — tên và giới thiệu giảng viên
    name: '[Placeholder]',
    role: 'Giảng viên xuất sắc',
    intro: '[ANH CẦN CUNG CẤP — Giới thiệu ngắn về giảng viên xuất sắc]',
    avatar: null,
    initials: 'GV',
    color: '#7C3AED',
  },
  {
    // ANH CẦN CUNG CẤP
    name: '[Placeholder]',
    role: 'Trưởng phòng Marketing',
    intro: '[ANH CẦN CUNG CẤP — Giới thiệu trưởng phòng marketing]',
    avatar: null,
    initials: 'MK',
    color: '#F97316',
  },
  {
    // ANH CẦN CUNG CẤP
    name: '[Placeholder]',
    role: 'Trưởng phòng Kinh doanh',
    intro: '[ANH CẦN CUNG CẤP — Giới thiệu trưởng phòng kinh doanh]',
    avatar: null,
    initials: 'KB',
    color: '#7C3AED',
  },
]

interface MemberCardProps {
  member: TeamMember
}

function MemberCard({ member }: MemberCardProps) {
  return (
    <div className="card-base p-6 flex flex-col items-center text-center gap-3">
      {/* Avatar */}
      {member.avatar ? (
        <div className="w-20 h-20 rounded-full overflow-hidden relative ring-4 ring-offset-2 ring-gray-100 flex-shrink-0">
          <Image
            src={member.avatar}
            alt={`Ảnh ${member.name}`}
            fill
            className="object-cover"
          />
        </div>
      ) : (
        /* Placeholder avatar với initials khi chưa có ảnh */
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-white font-extrabold text-xl ring-4 ring-offset-2 ring-gray-100 flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${member.color}99, ${member.color})` }}
        >
          {member.initials}
        </div>
      )}

      {/* Info */}
      <div>
        <div className="font-extrabold text-text-dark">{member.name}</div>
        <div className="text-xs font-semibold mt-0.5" style={{ color: member.color }}>
          {member.role}
        </div>
      </div>
      <p className="text-sm text-text-muted leading-relaxed">{member.intro}</p>
    </div>
  )
}

export function Team() {
  return (
    <section
      className="section-padding"
      style={{ background: 'linear-gradient(160deg, #fff9f5 0%, #ffffff 100%)' }}
    >
      <div className="container-site">
        <div className="text-center mb-12">
          <span className="badge-orange mb-3 inline-block">Con người</span>
          <h2 className="heading-2 text-text-dark">
            Đội ngũ{' '}
            <span className="text-gradient-orange-purple">chủ chốt</span>
          </h2>
          <p className="text-text-muted mt-3 max-w-xl mx-auto">
            Những con người tâm huyết, dày dặn kinh nghiệm và luôn đặt học viên lên hàng đầu
          </p>
        </div>

        {/*
          ANH CẦN CUNG CẤP:
          - Ảnh thật cho mỗi thành viên tại /public/images/about/team/<slug>.jpg (400×400px, vuông)
          - Tên, chức danh và giới thiệu đầy đủ cho các placeholder
        */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {TEAM_MEMBERS.map((member) => (
            <MemberCard key={`${member.name}-${member.role}`} member={member} />
          ))}
        </div>
      </div>
    </section>
  )
}
