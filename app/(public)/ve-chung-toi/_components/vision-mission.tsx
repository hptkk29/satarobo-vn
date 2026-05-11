import { Eye, Target, Heart, Lightbulb, Users, Award } from 'lucide-react'

const CORE_VALUES = [
  { icon: Heart, label: 'Tận tâm', desc: 'Luôn đặt lợi ích học viên lên hàng đầu' },
  { icon: Lightbulb, label: 'Sáng tạo', desc: 'Không ngừng cải tiến phương pháp dạy học' },
  { icon: Users, label: 'Hợp tác', desc: 'Xây dựng cộng đồng học tập gắn kết' },
  { icon: Award, label: 'Chất lượng', desc: 'Cam kết kết quả đầu ra đo lường được' },
]

export function VisionMission() {
  return (
    <section
      className="section-padding"
      style={{ background: 'linear-gradient(160deg, #f5f3ff 0%, #ffffff 60%, #fff9f5 100%)' }}
    >
      <div className="container-site">
        <div className="text-center mb-12">
          <span className="badge-orange mb-3 inline-block">Định hướng phát triển</span>
          <h2 className="heading-2 text-text-dark">
            Tầm nhìn, Sứ mệnh &amp;{' '}
            <span className="text-gradient-orange-purple">Giá trị cốt lõi</span>
          </h2>
        </div>

        {/* 3 cards top */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {/* Tầm nhìn */}
          <div className="card-base p-8 flex flex-col gap-4 border border-orange-100">
            <div className="w-12 h-12 rounded-2xl bg-soft-cream flex items-center justify-center">
              <Eye className="w-6 h-6 text-primary-orange" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-text-dark mb-2">Tầm nhìn</h3>
              <p className="text-text-muted leading-relaxed">
                Trở thành hệ sinh thái Robotics-STEM hàng đầu Việt Nam vào 2030, nơi mỗi học sinh
                đều có cơ hội tiếp cận công nghệ tương lai.
              </p>
            </div>
          </div>

          {/* Sứ mệnh */}
          <div
            className="p-8 flex flex-col gap-4 rounded-2xl text-white"
            style={{ background: 'linear-gradient(135deg, #F97316, #7C3AED)' }}
          >
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold mb-2">Sứ mệnh</h3>
              <p className="text-white/90 leading-relaxed">
                Đào tạo thế hệ kỹ sư robot tương lai cho Việt Nam, bắt đầu từ Đà Nẵng — trang bị
                tư duy lập trình và kỹ năng STEM từ bậc tiểu học.
              </p>
            </div>
          </div>

          {/* Giá trị cốt lõi — card tổng */}
          <div className="card-base p-8 flex flex-col gap-4 border border-purple-100">
            <div className="w-12 h-12 rounded-2xl bg-soft-purple flex items-center justify-center">
              <Heart className="w-6 h-6 text-primary-purple" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-text-dark mb-3">Giá trị cốt lõi</h3>
              <div className="space-y-2">
                {CORE_VALUES.map((v) => (
                  <div key={v.label} className="flex items-center gap-2">
                    <v.icon className="w-4 h-4 text-primary-purple flex-shrink-0" />
                    <span className="text-sm font-semibold text-text-dark">{v.label}</span>
                    <span className="text-sm text-text-muted">— {v.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
