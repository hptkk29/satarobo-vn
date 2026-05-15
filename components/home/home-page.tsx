import Link from "next/link";
import {
  ArrowRight,
  Phone,
  Trophy,
  Sparkles,
  Users,
  Target,
  Award,
  GraduationCap,
} from "lucide-react";
import { SATA_ROBO_CONTACT } from "@/lib/locations";

// ============== Types ==============
export interface FeaturedCourseCard {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  ageGroup: string;
  lessons: number;
  priceList: number;
  priceEarlyBird: number | null;
  badge: string;
  href: string;
  color: "orange" | "purple" | "green" | "amber";
}

// ============== Main composer ==============
export function HomePage({ featuredCourses }: { featuredCourses: FeaturedCourseCard[] }) {
  return (
    <>
      <HeroSection />
      <StatsBar />
      <UuTheSection />
      <SixAdvantagesSection />
      <CatalogSection courses={featuredCourses} />
      <SevenCommitmentsSection />
      <TravelPrizeBanner />
      <CompetitionCountdown />
      <FinalCTA />
    </>
  );
}

// ============== 1. HERO ==============
function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-white to-purple-50 py-16 md:py-24">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur border border-purple-200 rounded-full px-4 py-1.5 mb-6 shadow-sm">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700">
              Học Viện Robotics &amp; AI Đà Nẵng
            </span>
          </div>

          <h1 className="text-4xl md:text-6xl font-black text-neutral-900 mb-4 leading-tight">
            <span className="bg-gradient-to-r from-orange-500 to-purple-600 bg-clip-text text-transparent">
              Khơi Nguồn Sáng Tạo
            </span>
            <br />
            <span>– Chắp Cánh Tương Lai</span>
          </h1>

          <p className="text-xl md:text-2xl text-neutral-700 mb-2 font-medium">
            Trung tâm đào tạo lập trình Robotics &amp; AI
          </p>
          <p className="text-lg text-neutral-600 italic">
            — nơi con học robot, nơi con trưởng thành.
          </p>

          <p className="text-base text-neutral-600 my-8 leading-relaxed max-w-3xl mx-auto">
            Sata Robo mang đến chương trình học Robotics sinh động, gắn liền thực tiễn và các
            cuộc thi từ cấp thành phố đến quốc tế.{" "}
            <strong>Lớp nhỏ ≤12 học viên</strong>, giáo viên tận tâm nhiều kinh nghiệm.{" "}
            <strong>Cam kết hoàn tiền 100% bằng văn bản</strong> nếu thí sinh không qua vòng
            loại và tham gia chung kết khu vực Miền Trung tại Nghệ An tháng 9/2026 — không câu
            hỏi.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Link
              href="/lien-he?free-trial=true"
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-4 rounded-xl shadow-xl hover:shadow-2xl transition-all"
            >
              <span>🎯 Đăng Ký Học MIỄN PHÍ</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/khoa-hoc"
              className="inline-flex items-center justify-center gap-2 bg-white hover:bg-purple-50 text-purple-700 border-2 border-purple-300 font-bold px-6 py-4 rounded-xl"
            >
              Xem Các Khoá Học
            </Link>
          </div>

          <div className="flex flex-wrap gap-2 justify-center text-xs">
            <TrustBadge>✅ Học MIỄN PHÍ 5 buổi luyện thi cơ bản</TrustBadge>
            <TrustBadge>✅ Hoàn tiền 100% có cam kết văn bản</TrustBadge>
            <TrustBadge>✅ Robosim — Phần mềm thi bắt buộc 2026</TrustBadge>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center bg-white border border-green-200 text-green-700 font-semibold px-3 py-1.5 rounded-full shadow-sm">
      {children}
    </span>
  );
}

// ============== 2. STATS BAR ==============
function StatsBar() {
  const stats = [
    { value: "500+", label: "Học Viên đã theo học", Icon: Users },
    { value: "Lớp 1 → 8", label: "Cho các Kỹ Sư Nhí", Icon: GraduationCap },
    { value: "≤12 HV", label: "/lớp - GV tận tâm", Icon: Target },
    { value: "100%", label: "Cam kết hoàn tiền văn bản", Icon: Award },
  ];

  return (
    <section className="bg-gradient-to-r from-purple-600 to-orange-500 py-12">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center text-white">
              <s.Icon className="w-8 h-8 mx-auto mb-2 opacity-90" />
              <div className="text-3xl md:text-4xl font-black mb-1">{s.value}</div>
              <div className="text-xs md:text-sm opacity-90 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============== 3. ƯU THẾ + THÀNH TỰU ==============
function UuTheSection() {
  const achievements = [
    "Phối hợp tổ chức thành công Cuộc thi Sáng tạo Robotics 2026 cùng Thành Đoàn TP Đà Nẵng và TW Đoàn TNCS Hồ Chí Minh",
    "Tiếp tục tham gia BTC và hỗ trợ các đội thi Robotics 2026 tại TP Đà Nẵng",
    "Mở rộng 4 trung tâm bao phủ quanh TP Đà Nẵng",
    "Đã giải xong đề thi 2026 và hoàn thiện tài liệu đào tạo luyện thi chuyên sâu với cam kết đầu ra bằng văn bản",
    "Đang hoàn thiện 2 trung tâm mới, dự kiến khai trương tháng 8/2026",
  ];

  return (
    <section className="bg-white py-16">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-12">
          <div className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
            🏆 ƯU THẾ + THÀNH TỰU
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-neutral-900">
            Sata Robo Đang Là Đơn Vị Tiên Phong
          </h2>
          <p className="text-neutral-600 mt-3">Robotics giáo dục tại Đà Nẵng</p>
        </div>

        <div className="space-y-3">
          {achievements.map((text, i) => (
            <div
              key={i}
              className="flex items-start gap-4 bg-gradient-to-r from-purple-50 to-orange-50 rounded-xl p-5 border border-purple-100"
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 text-white font-black flex items-center justify-center">
                {i + 1}
              </div>
              <p className="text-neutral-800 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============== 4. 6 ƯU ĐIỂM ==============
type AdvColor = "orange" | "purple" | "green" | "blue" | "amber" | "indigo";

interface Advantage {
  number: string;
  icon: string;
  title: string;
  desc: string;
  color: AdvColor;
}

function SixAdvantagesSection() {
  const advantages: Advantage[] = [
    {
      number: "①",
      icon: "🎯",
      title: "Robosim Độc Quyền",
      desc: "Phần mềm bắt buộc trong Cuộc thi Sáng tạo Robotics 2026 của Thành Đoàn Đà Nẵng. Chỉ Sata Robo đào tạo phần mềm này.",
      color: "orange",
    },
    {
      number: "②",
      icon: "👥",
      title: "Lớp Nhỏ ≤12 HV",
      desc: "Giáo viên biết tên và điểm mạnh từng con. Không em nào bị bỏ lại phía sau.",
      color: "purple",
    },
    {
      number: "③",
      icon: "💰",
      title: "Cam Kết Hoàn Tiền 100%",
      desc: "Nếu con học tại trung tâm và không vượt vòng loại để tham gia chung kết khu vực tại Nghệ An vào tháng 9/2026.",
      color: "green",
    },
    {
      number: "④",
      icon: "✈️",
      title: "Giải Thưởng Du Lịch 3-7 Triệu",
      desc: "Học viên đạt giải cuộc thi cấp TP được thưởng chuyến du lịch kết hợp lễ khai trương T8/2026.",
      color: "blue",
    },
    {
      number: "⑤",
      icon: "🎤",
      title: "Thuyết Trình Trước Phụ Huynh",
      desc: "Cuối mỗi 12 buổi học, con thuyết trình dự án, ghi hình kỷ niệm. Phụ huynh thấy kết quả thực tế.",
      color: "amber",
    },
    {
      number: "⑥",
      icon: "🏆",
      title: "Hỗ Trợ 3 Triệu Lệ Phí Thi Quốc Gia",
      desc: "Học viên hoàn thành khoá học và tham dự cuộc thi Quốc gia theo đoàn Sata Robo được hỗ trợ 3.000.000đ/năm.",
      color: "indigo",
    },
  ];

  return (
    <section className="bg-neutral-50 py-16">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="text-center mb-12">
          <div className="text-xs font-bold uppercase tracking-wider text-purple-600 mb-2">
            ⭐ ƯU ĐIỂM
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-neutral-900">
            Tại Sao Phụ Huynh Chọn Sata Robo?
          </h2>
          <p className="text-neutral-600 mt-3">6 điểm khác biệt làm nên uy tín</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {advantages.map((a) => (
            <AdvantageCard key={a.title} adv={a} />
          ))}
        </div>
      </div>
    </section>
  );
}

const ADVANTAGE_COLOR_MAP: Record<AdvColor, string> = {
  orange: "from-orange-50 to-amber-50 border-orange-200",
  purple: "from-purple-50 to-violet-50 border-purple-200",
  green: "from-green-50 to-emerald-50 border-green-200",
  blue: "from-blue-50 to-sky-50 border-blue-200",
  amber: "from-amber-50 to-yellow-50 border-amber-200",
  indigo: "from-indigo-50 to-blue-50 border-indigo-200",
};

function AdvantageCard({ adv }: { adv: Advantage }) {
  return (
    <div
      className={`bg-gradient-to-br ${ADVANTAGE_COLOR_MAP[adv.color]} rounded-2xl border-2 p-6 hover:shadow-lg transition-shadow`}
    >
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">{adv.icon}</span>
        <span className="text-3xl font-black text-purple-600">{adv.number}</span>
      </div>
      <h3 className="text-xl font-bold text-neutral-900 mb-2">{adv.title}</h3>
      <p className="text-sm text-neutral-700 leading-relaxed">{adv.desc}</p>
    </div>
  );
}

// ============== 5. CATALOG (4 FEATURED) ==============
const COURSE_COLOR_MAP: Record<
  FeaturedCourseCard["color"],
  { bg: string; border: string; text: string }
> = {
  orange: { bg: "from-orange-50 to-amber-50", border: "border-orange-200", text: "text-orange-600" },
  purple: { bg: "from-purple-50 to-violet-50", border: "border-purple-200", text: "text-purple-600" },
  green: { bg: "from-green-50 to-emerald-50", border: "border-green-200", text: "text-green-600" },
  amber: { bg: "from-amber-50 to-yellow-50", border: "border-amber-200", text: "text-amber-600" },
};

function CatalogSection({ courses }: { courses: FeaturedCourseCard[] }) {
  return (
    <section className="bg-white py-16">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="text-center mb-12">
          <div className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
            🎓 KHOÁ HỌC
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-neutral-900">
            Lộ Trình Học Robotics Cho Con
          </h2>
          <p className="text-neutral-600 mt-3">
            8 khoá học theo lộ trình từ lớp 1 đến lớp 8 — từ nền tảng đến chuyên sâu thi đấu quốc tế
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {courses.map((course) => (
            <CourseMiniCard key={course.id} course={course} />
          ))}
        </div>

        <div className="text-center">
          <Link
            href="/khoa-hoc/laptrinhrobot"
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold px-8 py-3 rounded-xl shadow-lg"
          >
            Xem Đầy Đủ 8 Khoá Học - Ưu Đãi Đến 30%
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function CourseMiniCard({ course }: { course: FeaturedCourseCard }) {
  const colors = COURSE_COLOR_MAP[course.color];
  const discountPct =
    course.priceEarlyBird && course.priceList
      ? Math.round((1 - course.priceEarlyBird / course.priceList) * 100)
      : null;

  return (
    <Link
      href={course.href}
      className={`group block bg-gradient-to-br ${colors.bg} rounded-2xl border-2 ${colors.border} p-6 hover:shadow-xl hover:-translate-y-1 transition-all`}
    >
      <div className="text-3xl mb-2">{course.badge}</div>
      <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">{course.code}</div>
      <h3 className="text-lg font-bold text-neutral-900 mb-2">{course.title}</h3>
      <p className={`text-xs font-semibold ${colors.text} mb-3 line-clamp-2`}>{course.subtitle}</p>
      <div className="text-xs text-neutral-600 mb-2">
        {course.ageGroup} • {course.lessons} buổi
      </div>
      <div className={`text-xl font-black ${colors.text}`}>
        {(course.priceList / 1_000_000).toFixed(1)}M
      </div>
      {course.priceEarlyBird && (
        <div className="text-xs text-green-600 font-bold mt-1">
          EB: {(course.priceEarlyBird / 1_000_000).toFixed(1)}M
          {discountPct !== null && ` (-${discountPct}%)`}
        </div>
      )}
    </Link>
  );
}

// ============== 6. 7 CAM KẾT ==============
function SevenCommitmentsSection() {
  const commitments = [
    {
      number: "①",
      title: "Hoàn tiền 100% sau 2 buổi đầu",
      desc: "Nếu con không thích, hoàn toàn bộ, không câu hỏi.",
    },
    {
      number: "②",
      title: "Lớp nhỏ ≤12 HV",
      desc: "GV tận tâm, học kèm để các con tiến bộ mỗi ngày.",
    },
    {
      number: "③",
      title: "Robosim độc quyền",
      desc: "Phần mềm bắt buộc Cuộc thi 2026, chỉ Sata Robo đào tạo.",
    },
    {
      number: "④",
      title: "Giải thưởng du lịch 3-7 triệu",
      desc: "Dành cho HV đạt giải cuộc thi cấp TP Đà Nẵng.",
    },
    {
      number: "⑤",
      title: "Thuyết trình cuối mỗi học phần",
      desc: "Phụ huynh được xem kết quả thực tế, ghi hình kỷ niệm.",
    },
    {
      number: "⑥",
      title: "Hỗ trợ 3 triệu lệ phí thi Quốc gia",
      desc: "Cho HV tham dự cuộc thi Quốc gia theo đoàn Sata Robo.",
    },
    {
      number: "⑦",
      title: "Test năng lực & Học thử MIỄN PHÍ",
      desc: "45 phút test + 90 phút học thử, hoàn toàn 0 đồng.",
    },
  ];

  return (
    <section className="bg-gradient-to-br from-purple-50 to-orange-50 py-16">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-12">
          <div className="text-xs font-bold uppercase tracking-wider text-purple-600 mb-2">
            🤝 CAM KẾT
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-neutral-900">
            Sata Robo Cam Kết Với Bạn
          </h2>
          <p className="text-neutral-600 mt-3">7 cam kết bằng văn bản với phụ huynh</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {commitments.map((c) => (
            <div
              key={c.number}
              className="bg-white rounded-xl border-2 border-purple-200 p-5 flex items-start gap-4 hover:shadow-lg transition-shadow"
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-purple-600 text-white font-black text-xl flex items-center justify-center">
                {c.number}
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 mb-1">{c.title}</h3>
                <p className="text-sm text-neutral-600">{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============== 7. TRAVEL PRIZE BANNER ==============
function TravelPrizeBanner() {
  return (
    <section className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 py-16">
      <div className="container mx-auto px-4 max-w-6xl text-center text-white">
        <Trophy className="w-16 h-16 mx-auto mb-4 drop-shadow-lg" />
        <div className="text-xs font-bold uppercase tracking-wider mb-2 opacity-90">
          🏆 GIẢI THƯỞNG ĐẶC BIỆT
        </div>
        <h2 className="text-3xl md:text-4xl font-black mb-3">
          Lễ Khai Trương 2 Chi Nhánh Mới — Tháng 8/2026
        </h2>
        <p className="text-lg mb-8 opacity-90">
          Trao tại lễ khai trương 114 Hoàng Diệu + 211 Nguyễn Hữu Thọ
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-8">
          <PrizeCard
            rank="🥇 Giải Nhất"
            amount="7.000.000đ"
            desc="Chuyến du lịch kỷ niệm (HV + phụ huynh)"
          />
          <PrizeCard rank="🥈 Giải Nhì" amount="5.000.000đ" desc="Chuyến du lịch trị giá" />
          <PrizeCard rank="🥉 Giải Ba" amount="3.000.000đ" desc="Chuyến du lịch trị giá" />
        </div>

        <p className="text-sm opacity-90 max-w-2xl mx-auto bg-black/20 backdrop-blur rounded-xl p-4">
          <strong>Điều kiện:</strong> Đang học tại Sata Robo + Đạt giải ≥ Giải Ba cấp TP Đà Nẵng.
          Căn cứ kết quả vòng loại Robosim kết thúc 26/07/2026.
        </p>
      </div>
    </section>
  );
}

function PrizeCard({ rank, amount, desc }: { rank: string; amount: string; desc: string }) {
  return (
    <div className="bg-white/15 backdrop-blur rounded-2xl border-2 border-white/30 p-6">
      <div className="text-2xl font-bold mb-2">{rank}</div>
      <div className="text-3xl font-black mb-2">{amount}</div>
      <div className="text-sm opacity-90">{desc}</div>
    </div>
  );
}

// ============== 8. COMPETITION COUNTDOWN ==============
function CompetitionCountdown() {
  return (
    <section className="bg-neutral-900 py-16 text-white">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-orange-500/20 backdrop-blur border border-orange-400/50 rounded-full px-4 py-1.5 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-orange-300">
              ⏰ CUỘC THI QUỐC GIA
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-black mb-3">
            Cuộc Thi Sáng Tạo Robotics Toàn Quốc 2026
          </h2>
          <p className="text-neutral-400">
            Robosim là{" "}
            <strong className="text-orange-400">công cụ thi bắt buộc</strong> — chỉ Sata Robo
            đào tạo
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <CompetitionStage
            stage="Vòng Loại"
            location="TP Đà Nẵng"
            date="26/07/2026"
            note="Dự kiến kết thúc"
            color="orange"
          />
          <CompetitionStage
            stage="Chung Kết"
            location="Khu vực Miền Trung"
            date="13/09/2026"
            note="Tại Nghệ An"
            color="red"
          />
        </div>

        <div className="text-center mt-12">
          <Link
            href="/khoa-hoc/laptrinhrobot#sata1"
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-3 rounded-xl shadow-xl"
          >
            👉 Đăng ký Sata1 - Luyện thi Robosim ngay
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

const STAGE_COLOR_MAP: Record<"orange" | "red", string> = {
  orange: "border-orange-400/50 from-orange-500/10 to-amber-500/10",
  red: "border-red-400/50 from-red-500/10 to-orange-500/10",
};

function CompetitionStage({
  stage,
  location,
  date,
  note,
  color,
}: {
  stage: string;
  location: string;
  date: string;
  note: string;
  color: "orange" | "red";
}) {
  return (
    <div
      className={`bg-gradient-to-br ${STAGE_COLOR_MAP[color]} backdrop-blur rounded-2xl border-2 p-6`}
    >
      <div className="text-xs uppercase tracking-wider text-neutral-400 mb-2">{stage}</div>
      <div className="text-2xl font-bold mb-1">{location}</div>
      <div className="text-3xl font-black text-orange-400 mb-2">{date}</div>
      <div className="text-sm text-neutral-300">{note}</div>
    </div>
  );
}

// ============== 9. FINAL CTA ==============
function FinalCTA() {
  return (
    <section className="bg-gradient-to-r from-orange-500 to-purple-600 py-16">
      <div className="container mx-auto px-4 max-w-4xl text-center text-white">
        <h2 className="text-3xl md:text-5xl font-black mb-3">
          Con Bạn Xứng Đáng Được Trải Nghiệm Tốt Nhất
        </h2>
        <p className="text-lg md:text-xl mb-8 opacity-90">
          Học thử <strong>MIỄN PHÍ</strong> — không điều kiện.
          <br />
          Cam kết hoàn tiền 100% nếu không hài lòng.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/lien-he?free-trial=true"
            className="inline-flex items-center justify-center gap-2 bg-white text-orange-600 font-bold px-8 py-4 rounded-xl hover:bg-orange-50 shadow-xl text-lg"
          >
            🎯 Đăng Ký Học Thử Ngay
            <ArrowRight className="w-5 h-5" />
          </Link>
          <a
            href={`tel:${SATA_ROBO_CONTACT.hotlineRaw}`}
            className="inline-flex items-center justify-center gap-2 bg-white/10 backdrop-blur text-white border-2 border-white/50 font-bold px-8 py-4 rounded-xl hover:bg-white/20 text-lg"
          >
            <Phone className="w-6 h-6" />
            {SATA_ROBO_CONTACT.hotline}
          </a>
        </div>
      </div>
    </section>
  );
}
