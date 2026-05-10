const STATS = [
  { value: '1.000+', label: 'Học viên đã học' },
  { value: '100%', label: 'PASS vòng loại' },
  { value: '4', label: 'Cơ sở tại Đà Nẵng' },
  { value: '5+', label: 'Năm kinh nghiệm' },
  { value: '3', label: 'Giải thưởng Quốc tế' },
]

export function Achievements() {
  return (
    <section className="section-padding bg-white" aria-label="Thành tích Sata Robo">
      <div className="container-site">
        <div className="rounded-3xl border border-orange-100 bg-gradient-to-r from-orange-50 via-white to-purple-50 p-8 sm:p-10">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-black text-text-dark">
              Con số nói lên tất cả
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              Sau 5+ năm đồng hành cùng hàng nghìn gia đình tại Đà Nẵng
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-black text-primary-orange">{s.value}</div>
                <div className="mt-1 text-xs sm:text-sm text-text-muted">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
