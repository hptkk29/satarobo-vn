const TESTIMONIALS = [
  {
    parent: 'Phụ huynh Nguyễn Lan Anh',
    childGrade: 'Con học lớp 5',
    quote:
      'Con tôi từ không biết gì về lập trình, sau 4 tháng học Sata1 đã đạt giải nhì vòng loại khu vực. Giáo viên ở đây tận tâm và phương pháp dạy rất thực tế.',
    stars: 5,
  },
  {
    parent: 'Phụ huynh Trần Minh Quân',
    childGrade: 'Con học lớp 8',
    quote:
      'Ban đầu tôi lo con không theo kịp vì bắt đầu muộn. Nhưng Sata Robo có lộ trình rõ ràng, giáo viên kèm sát, con đã pass vòng loại và đang luyện thi cấp quốc gia.',
    stars: 5,
  },
  {
    parent: 'Phụ huynh Lê Thị Hồng',
    childGrade: 'Con học lớp 3',
    quote:
      'Khoá luyện thi RoboSim Online rất tiện lợi, con học ở nhà theo lịch của mình. Chỉ sau 3 tuần là con tự tin làm bài thi thử, điểm cao hơn 40% so với trước.',
    stars: 5,
  },
]

export function Testimonials() {
  return (
    <section
      className="section-padding bg-soft-cream"
      aria-labelledby="testimonials-heading"
    >
      <div className="container-site">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 mb-4">
            <span className="text-primary-orange text-xs font-black uppercase tracking-wider">
              Phụ huynh nói gì?
            </span>
          </div>
          <h2
            id="testimonials-heading"
            className="text-2xl sm:text-3xl lg:text-4xl font-black text-text-dark"
          >
            Kết quả thực từ học viên Sata Robo
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <blockquote
              key={t.parent}
              className="flex flex-col rounded-3xl border border-gray-100 bg-white p-6 shadow-sm"
            >
              <div className="flex gap-0.5 mb-4" aria-label={`${t.stars} sao`}>
                {Array.from({ length: t.stars }).map((_, i) => (
                  <span key={i} className="text-yellow-400 text-lg" aria-hidden="true">★</span>
                ))}
              </div>
              <p className="text-sm text-text-dark leading-relaxed flex-1">
                &ldquo;{t.quote}&rdquo;
              </p>
              <footer className="mt-4 pt-4 border-t border-gray-100">
                <div className="font-bold text-sm text-text-dark">{t.parent}</div>
                <div className="text-xs text-text-muted">{t.childGrade}</div>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  )
}
