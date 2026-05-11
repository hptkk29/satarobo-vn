export function CoursesHero() {
  return (
    <section
      className="overflow-hidden w-full"
      style={{ background: 'linear-gradient(160deg, #fff9f5 0%, #ffffff 50%, #f5f3ff 100%)' }}
    >
      <div className="container-site py-14 md:py-18 text-center max-w-3xl mx-auto">
        <span className="badge-orange mb-4 inline-block">Khoá học &amp; Chương trình</span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight text-text-dark mb-4">
          Khoá học Robotics &amp; STEM{' '}
          <span className="text-gradient-orange-purple">tại Sata Robo</span>
        </h1>
        <p className="text-lg sm:text-xl text-text-muted leading-relaxed">
          4 hình thức học phù hợp mọi nhu cầu phụ huynh và nhà trường — từ online linh hoạt đến
          offline chuyên sâu, từ B2B trường học đến trải nghiệm thực địa.
        </p>
      </div>
    </section>
  )
}
