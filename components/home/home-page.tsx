"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Phone,
  Trophy,
  Award,
  Medal,
  Users,
  Target,
  GraduationCap,
  CheckCircle2,
  Wallet,
  Plane,
  Mic,
  ShieldCheck,
  MapPin,
  Flag,
  Sparkles as SparklesIcon,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { SATA_ROBO_CONTACT } from "@/lib/locations";
import { AnimatedGradientText } from "@/components/magic/animated-gradient-text";
import { NumberTicker } from "@/components/magic/number-ticker";
import { BorderBeam } from "@/components/magic/border-beam";
import { ShimmerButton } from "@/components/magic/shimmer-button";
import { Particles } from "@/components/magic/particles";
import { FadeIn } from "@/components/motion/fade-in";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { AutoCarousel } from "@/components/public/auto-carousel";
import { Sparkles } from "@/components/design-system/effects/sparkles";
import { EarlyBirdCountdown } from "@/components/home/early-bird-countdown";
import { FAQSection } from "@/components/home/faq-section";
import { HeroMain } from "@/components/sections/hero-main";
import { TrustBadges } from "@/components/sections/trust-badges";
import { UspGrid } from "@/components/sections/usp-grid";
import { CourseTeaser } from "@/components/sections/course-teaser";

// ============== Types ==============
export interface MainCourseCard {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  thumbnail: string | null;
}

// ============== Main composer ==============
export function HomePage({ courses }: { courses: MainCourseCard[] }) {
  return (
    <>
      {/* F-UI-2: new dark Aceternity-style hero. Old <HeroSection />
         (light blobs + AnimatedGradientText) is kept defined below for
         one-click rollback while F-UI-2.5/3/4 ship; remove once the new
         hero is validated in production. */}
      <HeroMain />
      {/* F-UI-2.5: social proof + USP + course teaser ngay sau Hero để
         build credibility sớm. Legacy sections (StatsBar, UuTheSection, …)
         vẫn giữ — sẽ refactor / dedupe ở F-UI-3/4. */}
      <TrustBadges />
      <UspGrid />
      <CourseTeaser />
      <StatsBar />
      <UuTheSection />
      <SixAdvantagesSection />
      <EarlyBirdCountdown />
      <CatalogSection courses={courses} />
      <SixCommitmentsSection />
      <TravelPrizeBanner />
      <CompetitionCountdown />
      <FAQSection />
      <FinalCTA />
    </>
  );
}

// ============== 1. HERO (LEGACY — replaced by <HeroMain /> in F-UI-2)
// Prefixed with `_` so ESLint allows the function to stay defined for one-
// click rollback. Delete once the new hero is validated.
// ====================================
function _HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-orange-100 via-amber-50/40 to-purple-100 py-24 md:py-32 lg:py-36">
      {/* Mesh gradient base — 4 large saturated blobs for depth */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 h-[750px] w-[750px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-orange-400/60 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 h-[750px] w-[750px] translate-x-1/3 translate-y-1/3 rounded-full bg-purple-500/50 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/4 right-0 h-[400px] w-[400px] translate-x-1/4 rounded-full bg-rose-400/35 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1/4 left-0 h-[400px] w-[400px] -translate-x-1/4 rounded-full bg-amber-400/40 blur-3xl"
      />
      {/* Conic accent — adds spectrum colorfulness */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background:conic-gradient(from_180deg_at_50%_50%,rgba(249,115,22,0.10)_0deg,rgba(124,58,237,0.10)_120deg,rgba(244,114,182,0.08)_240deg,rgba(249,115,22,0.10)_360deg)] opacity-70"
      />
      {/* Dot grid with center mask */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgba(124,58,237,0.15)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]"
      />
      {/* Particles + sparkles for dynamic motion */}
      <Particles
        className="absolute inset-0"
        quantity={90}
        ease={70}
        color="#7C3AED"
        refresh={false}
      />
      <Sparkles density="high" colors={["orange", "purple"]} />

      <div className="container mx-auto px-4 max-w-6xl relative z-10">
        <FadeIn>
          <div className="text-center max-w-4xl mx-auto">
            {/* Live status pill — gradient bg, larger pulse dot */}
            <div className="inline-flex items-center gap-2.5 bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-2xl shadow-orange-500/40 rounded-full px-5 py-2.5 mb-6 ring-1 ring-white/30">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-90" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
              </span>
              <span className="text-xs sm:text-sm font-bold tracking-wide">
                Đang tuyển sinh — Cuộc thi Robotics 2026 · Vòng loại 26/07
              </span>
            </div>

            <div className="inline-flex items-center gap-2 bg-white/90 backdrop-blur border border-purple-300 rounded-full px-4 py-1.5 mb-6 shadow-md shadow-purple-500/10">
              <SparklesIcon className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-purple-700">
                Học Viện Robotics &amp; AI Đà Nẵng
              </span>
            </div>

            {/* H1 with glowing accent behind gradient line */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-neutral-900 mb-6 leading-[1.05] tracking-tight drop-shadow-sm">
              <span className="relative inline-block">
                {/* Soft glow behind gradient text */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-1 h-1/2 bg-gradient-to-r from-orange-400/30 via-pink-400/30 to-purple-500/30 blur-2xl"
                />
                <AnimatedGradientText
                  colorFrom="#F97316"
                  colorTo="#7C3AED"
                  className="relative font-black"
                >
                  Khơi Nguồn Sáng Tạo
                </AnimatedGradientText>
              </span>
              <br />
              <span className="text-neutral-900">– Chắp Cánh Tương Lai</span>
            </h1>

            <p className="text-xl md:text-2xl text-neutral-700 mb-2 font-medium">
              Trung tâm đào tạo lập trình Robotics &amp; AI
            </p>
            <p className="text-lg md:text-xl text-neutral-600 italic">
              — nơi con học robot, nơi con trưởng thành.
            </p>

            <p className="text-base md:text-lg text-neutral-600 my-8 leading-relaxed max-w-3xl mx-auto">
              Sata Robo mang đến chương trình học Robotics sinh động, gắn liền thực tiễn và các
              cuộc thi từ cấp thành phố đến quốc tế.{" "}
              <strong>Lớp nhỏ ≤12 học viên</strong>, giáo viên tận tâm nhiều kinh nghiệm.{" "}
              <strong>Cam kết hoàn tiền 100% bằng văn bản</strong> nếu thí sinh không qua vòng
              loại và tham gia chung kết khu vực Miền Trung tại Nghệ An tháng 9/2026 — không câu
              hỏi.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
              <Link href="/lien-he?free-trial=true">
                <ShimmerButton
                  background="linear-gradient(110deg, #F97316 0%, #FB923C 50%, #F97316 100%)"
                  borderRadius="14px"
                  className="px-8 py-5 font-bold text-white shadow-2xl shadow-orange-500/40 text-base"
                >
                  <Target className="w-5 h-5 mr-2" />
                  <span>Đăng Ký Học MIỄN PHÍ</span>
                  <ArrowRight className="w-5 h-5 ml-2" />
                </ShimmerButton>
              </Link>
              <Link
                href="/khoa-hoc"
                className="inline-flex items-center justify-center gap-2 bg-white hover:bg-purple-50 text-purple-700 border-2 border-purple-300 font-bold px-8 py-5 rounded-2xl text-base transition-all duration-200 hover:-translate-y-0.5 shadow-md hover:shadow-lg focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none"
              >
                Xem Các Khoá Học
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>

            {/* Upgraded trust strip — icon cards instead of chips */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
              <TrustItem
                Icon={CheckCircle2}
                title="Học MIỄN PHÍ"
                subtitle="5 buổi luyện thi cơ bản"
              />
              <TrustItem
                Icon={ShieldCheck}
                title="Hoàn tiền 100%"
                subtitle="Cam kết bằng văn bản"
              />
              <TrustItem
                Icon={Target}
                title="Robosim độc quyền"
                subtitle="Phần mềm thi bắt buộc 2026"
              />
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function TrustItem({
  Icon,
  title,
  subtitle,
}: {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-white/80 backdrop-blur border border-green-200 rounded-xl px-4 py-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-100 text-green-600 flex items-center justify-center shadow-sm">
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-left min-w-0">
        <div className="text-sm font-bold text-neutral-900 truncate">{title}</div>
        <div className="text-xs text-neutral-500 truncate">{subtitle}</div>
      </div>
    </div>
  );
}

// ============== 2. STATS BAR ==============
function StatsBar() {
  return (
    <section className="bg-gradient-to-r from-purple-600 to-orange-500 py-12">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-white">
          <StatBlock Icon={Users}>
            <span className="text-2xl sm:text-3xl md:text-4xl font-black">
              <NumberTicker value={500} className="text-white" />
              <span>+</span>
            </span>
            <span className="text-xs md:text-sm opacity-90 font-medium">Học Viên đã theo học</span>
          </StatBlock>
          <StatBlock Icon={GraduationCap}>
            <span className="text-xl sm:text-3xl md:text-4xl font-black">Lớp 1 → 8</span>
            <span className="text-xs md:text-sm opacity-90 font-medium">
              Cho các Kỹ Sư Nhí
            </span>
          </StatBlock>
          <StatBlock Icon={Target}>
            <span className="text-2xl sm:text-3xl md:text-4xl font-black">
              ≤
              <NumberTicker value={12} className="text-white" />
              <span> HV</span>
            </span>
            <span className="text-xs md:text-sm opacity-90 font-medium">/lớp - GV tận tâm</span>
          </StatBlock>
          <StatBlock Icon={Award}>
            <span className="text-2xl sm:text-3xl md:text-4xl font-black">
              <NumberTicker value={100} className="text-white" />
              <span>%</span>
            </span>
            <span className="text-xs md:text-sm opacity-90 font-medium">
              Cam kết hoàn tiền văn bản
            </span>
          </StatBlock>
        </div>
      </div>
    </section>
  );
}

function StatBlock({ Icon, children }: { Icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="text-center text-white">
      <Icon className="w-8 h-8 mx-auto mb-2 opacity-90" />
      <div className="flex flex-col items-center">{children}</div>
    </div>
  );
}

// ============== 3. ƯU THẾ + THÀNH TỰU (Bento 5) ==============
function UuTheSection() {
  const achievements = [
    "Phối hợp tổ chức thành công Cuộc thi Sáng tạo Robotics 2026 cùng Thành Đoàn TP Đà Nẵng và TW Đoàn TNCS Hồ Chí Minh",
    "Tiếp tục tham gia BTC và hỗ trợ các đội thi Robotics 2026 tại TP Đà Nẵng",
    "Mở rộng 4 trung tâm bao phủ quanh TP Đà Nẵng",
    "Đã giải xong đề thi 2026 và hoàn thiện tài liệu đào tạo luyện thi chuyên sâu với cam kết đầu ra bằng văn bản",
    "Đang hoàn thiện 2 trung tâm mới, dự kiến khai trương tháng 8/2026",
  ];

  return (
    <section className="bg-white py-16 md:py-24">
      <div className="container mx-auto px-4 max-w-6xl">
        <SectionEyebrow icon={Trophy} label="ƯU THẾ + THÀNH TỰU" tone="orange" />
        <SectionHeading>Sata Robo đang là đơn vị tiên phong</SectionHeading>
        <SectionLead>Robotics giáo dục tại Đà Nẵng</SectionLead>

        {/* Mobile + tablet: auto-rotating carousel */}
        <div className="mt-10 md:hidden">
          <AutoCarousel slideClassName="flex-[0_0_92%] sm:flex-[0_0_60%]">
            {achievements.map((text, i) => (
              <article
                key={i}
                className="h-full bg-white rounded-2xl border border-neutral-200 p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
              >
                <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-purple-600 text-white text-sm font-black mb-3">
                  {i + 1}
                </div>
                <p className="text-neutral-700 leading-relaxed text-sm">{text}</p>
              </article>
            ))}
          </AutoCarousel>
        </div>

        {/* Desktop: original grid with row-span featured card preserved */}
        <div className="mt-10 hidden md:grid md:grid-cols-3 gap-4 md:auto-rows-fr">
          {/* Card 1 — featured, spans 2 rows on desktop */}
          <RevealOnScroll direction="up" distance={20}>
            <article className="relative h-full bg-gradient-to-br from-orange-50 via-white to-purple-50 rounded-2xl border-2 border-orange-200 p-6 md:p-8 md:row-span-2 shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-shadow overflow-hidden">
              <BorderBeam size={70} duration={9} colorFrom="#F97316" colorTo="#7C3AED" />
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-orange-500 text-white font-black mb-4 shadow-md shadow-orange-500/30">
                1
              </div>
              <p className="text-neutral-800 text-base md:text-lg leading-relaxed font-medium">
                {achievements[0]}
              </p>
            </article>
          </RevealOnScroll>

          {/* Cards 2-5 */}
          {achievements.slice(1).map((text, i) => (
            <RevealOnScroll key={i} direction="up" distance={20} delay={(i + 1) * 0.05}>
              <article className="h-full bg-white rounded-2xl border border-neutral-200 p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-purple-600 text-white text-sm font-black mb-3">
                  {i + 2}
                </div>
                <p className="text-neutral-700 leading-relaxed text-sm">{text}</p>
              </article>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============== 4. 6 ƯU ĐIỂM ==============
interface Advantage {
  Icon: LucideIcon;
  title: string;
  desc: string;
  tone: "orange" | "purple" | "green" | "blue" | "amber" | "indigo";
}

const ADVANTAGE_TONE: Record<Advantage["tone"], { bg: string; border: string; icon: string }> = {
  orange: { bg: "from-orange-50 to-amber-50", border: "border-orange-200", icon: "bg-orange-500" },
  purple: { bg: "from-purple-50 to-violet-50", border: "border-purple-200", icon: "bg-purple-600" },
  green: { bg: "from-green-50 to-emerald-50", border: "border-green-200", icon: "bg-green-500" },
  blue: { bg: "from-blue-50 to-sky-50", border: "border-blue-200", icon: "bg-blue-500" },
  amber: { bg: "from-amber-50 to-yellow-50", border: "border-amber-200", icon: "bg-amber-500" },
  indigo: { bg: "from-indigo-50 to-blue-50", border: "border-indigo-200", icon: "bg-indigo-500" },
};

function SixAdvantagesSection() {
  const advantages: Advantage[] = [
    {
      Icon: Target,
      title: "Robosim Độc Quyền",
      desc: "Phần mềm bắt buộc trong Cuộc thi Sáng tạo Robotics 2026 của Thành Đoàn Đà Nẵng. Chỉ Sata Robo đào tạo phần mềm này.",
      tone: "orange",
    },
    {
      Icon: Users,
      title: "Lớp Nhỏ ≤12 HV",
      desc: "Giáo viên biết tên và điểm mạnh từng con. Không em nào bị bỏ lại phía sau.",
      tone: "purple",
    },
    {
      Icon: Wallet,
      title: "Cam Kết Hoàn Tiền 100%",
      desc: "Nếu con học tại trung tâm và không vượt vòng loại để tham gia chung kết khu vực tại Nghệ An vào tháng 9/2026.",
      tone: "green",
    },
    {
      Icon: Plane,
      title: "Giải Thưởng Du Lịch 3-7 Triệu",
      desc: "Học viên đạt giải cuộc thi cấp TP được thưởng chuyến du lịch kết hợp lễ khai trương T8/2026.",
      tone: "blue",
    },
    {
      Icon: Mic,
      title: "Thuyết Trình Trước Phụ Huynh",
      desc: "Cuối mỗi 12 buổi học, con thuyết trình dự án, ghi hình kỷ niệm. Phụ huynh thấy kết quả thực tế.",
      tone: "amber",
    },
    {
      Icon: Trophy,
      title: "Hỗ Trợ 3 Triệu Lệ Phí Thi Quốc Gia",
      desc: "Học viên hoàn thành khoá học và tham dự cuộc thi Quốc gia theo đoàn Sata Robo được hỗ trợ 3.000.000đ/năm.",
      tone: "indigo",
    },
  ];

  return (
    <section className="bg-neutral-50 py-16 md:py-24">
      <div className="container mx-auto px-4 max-w-7xl">
        <SectionEyebrow icon={SparklesIcon} label="ƯU ĐIỂM" tone="purple" />
        <SectionHeading>Tại sao phụ huynh chọn Sata Robo?</SectionHeading>
        <SectionLead>6 điểm khác biệt làm nên uy tín</SectionLead>

        {/* Mobile + tablet: auto-rotating carousel */}
        <div className="mt-10 lg:hidden">
          <AutoCarousel slideClassName="flex-[0_0_88%] sm:flex-[0_0_45%]" dotActiveClassName="bg-purple-600">
            {advantages.map((adv, i) => {
              const tone = ADVANTAGE_TONE[adv.tone];
              const { Icon } = adv;
              return (
                <article
                  key={adv.title}
                  className={`h-full bg-gradient-to-br ${tone.bg} rounded-2xl border-2 ${tone.border} p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-xl ${tone.icon} text-white flex items-center justify-center shadow-md`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-3xl font-black text-neutral-300">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-neutral-900 mb-2">{adv.title}</h3>
                  <p className="text-sm text-neutral-700 leading-relaxed">{adv.desc}</p>
                </article>
              );
            })}
          </AutoCarousel>
        </div>

        {/* Desktop: 3-col grid */}
        <div className="mt-10 hidden lg:grid lg:grid-cols-3 gap-6">
          {advantages.map((adv, i) => {
            const tone = ADVANTAGE_TONE[adv.tone];
            const { Icon } = adv;
            return (
              <RevealOnScroll key={adv.title} direction="up" distance={20} delay={i * 0.05}>
                <article
                  className={`group h-full bg-gradient-to-br ${tone.bg} rounded-2xl border-2 ${tone.border} p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className={`w-12 h-12 rounded-xl ${tone.icon} text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform`}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-3xl font-black text-neutral-300">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-neutral-900 mb-2">{adv.title}</h3>
                  <p className="text-sm text-neutral-700 leading-relaxed">{adv.desc}</p>
                </article>
              </RevealOnScroll>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ============== 5. CATALOG (2 main courses) ==============
function CatalogSection({ courses }: { courses: MainCourseCard[] }) {
  return (
    <section className="bg-white py-16 md:py-24">
      <div className="container mx-auto px-4 max-w-7xl">
        <SectionEyebrow icon={GraduationCap} label="KHOÁ HỌC" tone="orange" />
        <SectionHeading>Chương trình học Robotics</SectionHeading>
        <SectionLead>
          Từ luyện thi chuyên sâu đến lộ trình Robotics dài hạn cho lớp 1-8
        </SectionLead>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {courses.map((course, i) => (
            <RevealOnScroll key={course.id} direction="up" distance={24} delay={i * 0.08}>
              <Link
                href={`/khoa-hoc/${course.slug}`}
                className="group relative block bg-white rounded-2xl border border-neutral-200 overflow-hidden hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)] hover:-translate-y-1 transition-all duration-300 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none"
              >
                {/* Hover border beam */}
                <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl overflow-hidden">
                  <BorderBeam size={90} duration={8} colorFrom="#F97316" colorTo="#7C3AED" />
                </span>

                {course.thumbnail && (
                  <div className="aspect-video relative overflow-hidden bg-gradient-to-br from-orange-50 to-purple-50">
                    <Image
                      src={course.thumbnail}
                      alt={course.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      sizes="(max-width: 768px) 100vw, 50vw"
                    />
                  </div>
                )}
                <div className="p-6">
                  <h3 className="text-2xl font-bold text-neutral-900 mb-2 group-hover:text-orange-600 transition-colors">
                    {course.name}
                  </h3>
                  <p className="text-neutral-700 mb-4 line-clamp-3">{course.shortDescription}</p>
                  <span className="inline-flex items-center gap-2 text-orange-600 font-bold group-hover:gap-3 transition-all">
                    Xem chi tiết
                    <ArrowRight className="w-5 h-5" />
                  </span>
                </div>
              </Link>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============== 6. CAM KẾT (6 items) ==============
function SixCommitmentsSection() {
  const commitments = [
    {
      title: "Hoàn tiền 100% nếu không hài lòng",
      desc: "Buổi học đầu tiên 90 phút, nếu con không thích sẽ hoàn tiền 100% học phí đã đóng, không câu hỏi. Hoàn lại sau 3 ngày làm việc.",
    },
    {
      title: "Lớp nhỏ ≤12 Học viên",
      desc: "GV tận tâm, học kèm để các con tiến bộ mỗi ngày.",
    },
    {
      title: "Giải thưởng du lịch 3-7 triệu",
      desc: "Dành cho HV đạt giải cuộc thi cấp TP Đà Nẵng.",
    },
    {
      title: "Thuyết trình cuối mỗi học phần",
      desc: "Phụ huynh được xem kết quả thực tế, ghi hình kỷ niệm.",
    },
    {
      title: "Hỗ trợ 3 triệu lệ phí thi Quốc gia",
      desc: "Cho HV tham dự cuộc thi Quốc gia theo đoàn Sata Robo.",
    },
    {
      title: "Cam kết văn bản cho gói Sata8",
      desc: "Quyền lợi hoàn tiền của phụ huynh được ghi rõ bằng văn bản trước khi đăng ký gói Sata8.",
    },
  ];

  return (
    <section className="bg-gradient-to-br from-purple-50 to-orange-50 py-16 md:py-24">
      <div className="container mx-auto px-4 max-w-6xl">
        <SectionEyebrow icon={ShieldCheck} label="CAM KẾT" tone="purple" />
        <SectionHeading>Sata Robo cam kết với bạn</SectionHeading>
        <SectionLead>6 cam kết bằng văn bản với phụ huynh</SectionLead>

        {/* Mobile + tablet: auto-rotating carousel */}
        <div className="mt-10 md:hidden">
          <AutoCarousel slideClassName="flex-[0_0_88%]" dotActiveClassName="bg-purple-600">
            {commitments.map((c, i) => (
              <article
                key={c.title}
                className="flex items-start gap-4 bg-white rounded-xl border-2 border-purple-100 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] h-full"
              >
                <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-600/20">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-bold text-purple-500">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-bold text-neutral-900">{c.title}</h3>
                  </div>
                  <p className="text-sm text-neutral-600">{c.desc}</p>
                </div>
              </article>
            ))}
          </AutoCarousel>
        </div>

        {/* Desktop: 2-col grid */}
        <div className="mt-10 hidden md:grid md:grid-cols-2 gap-4">
          {commitments.map((c, i) => (
            <RevealOnScroll key={c.title} direction="up" distance={16} delay={i * 0.04}>
              <article className="flex items-start gap-4 bg-white rounded-xl border-2 border-purple-100 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300">
                <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-600/20">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-bold text-purple-500">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-bold text-neutral-900">{c.title}</h3>
                  </div>
                  <p className="text-sm text-neutral-600">{c.desc}</p>
                </div>
              </article>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============== 7. TRAVEL PRIZE BANNER ==============
function TravelPrizeBanner() {
  const prizes = [
    {
      Icon: Trophy,
      rank: "Giải Nhất",
      amount: 7,
      desc: "Chuyến du lịch kỷ niệm (HV + phụ huynh)",
      ring: "ring-yellow-300/60",
      iconBg: "bg-yellow-400 text-yellow-900",
    },
    {
      Icon: Medal,
      rank: "Giải Nhì",
      amount: 5,
      desc: "Chuyến du lịch trị giá",
      ring: "ring-slate-200/60",
      iconBg: "bg-slate-200 text-slate-700",
    },
    {
      Icon: Award,
      rank: "Giải Ba",
      amount: 3,
      desc: "Chuyến du lịch trị giá",
      ring: "ring-orange-300/60",
      iconBg: "bg-amber-700 text-amber-100",
    },
  ];

  return (
    <section className="relative overflow-hidden bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 py-16 md:py-24">
      <Particles
        className="absolute inset-0"
        quantity={30}
        ease={60}
        color="#FEF3C7"
        refresh={false}
      />
      <div className="container mx-auto px-4 max-w-6xl text-center text-white relative z-10">
        <FadeIn>
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/15 backdrop-blur ring-2 ring-white/30 mb-4 mx-auto">
            <Trophy className="w-10 h-10 drop-shadow-lg" />
          </div>
          <div className="text-xs font-bold uppercase tracking-wider mb-2 opacity-90">
            Giải Thưởng Đặc Biệt
          </div>
          <h2 className="text-3xl md:text-4xl font-black mb-3">
            Lễ Khai Trương 2 Chi Nhánh Mới — Tháng 8/2026
          </h2>
          <p className="text-lg mb-10 opacity-90">
            Trao tại lễ khai trương 114 Hoàng Diệu + 211 Nguyễn Hữu Thọ
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-8">
          {prizes.map((p, i) => (
            <RevealOnScroll key={p.rank} direction="up" distance={20} delay={i * 0.08}>
              <article
                className={`relative bg-white/15 backdrop-blur rounded-2xl ring-2 ${p.ring} p-6 hover:bg-white/20 transition-colors`}
              >
                <div
                  className={`w-12 h-12 rounded-xl ${p.iconBg} mx-auto mb-3 flex items-center justify-center shadow-md`}
                >
                  <p.Icon className="w-7 h-7" />
                </div>
                <div className="text-sm font-semibold mb-2 opacity-90">{p.rank}</div>
                <div className="text-3xl md:text-4xl font-black mb-2">
                  <NumberTicker value={p.amount} className="text-white" />
                  <span>.000.000đ</span>
                </div>
                <div className="text-sm opacity-90">{p.desc}</div>
              </article>
            </RevealOnScroll>
          ))}
        </div>

        <p className="text-sm opacity-90 max-w-2xl mx-auto bg-black/20 backdrop-blur rounded-xl p-4">
          <strong>Điều kiện:</strong> Đang học tại Sata Robo + Đạt giải ≥ Giải Ba cấp TP Đà
          Nẵng. Căn cứ kết quả vòng loại Robosim kết thúc 26/07/2026.
        </p>
      </div>
    </section>
  );
}

// ============== 8. COMPETITION COUNTDOWN ==============
function CompetitionCountdown() {
  return (
    <section className="bg-neutral-900 py-16 md:py-24 text-white">
      <div className="container mx-auto px-4 max-w-6xl">
        <FadeIn>
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-orange-500/20 backdrop-blur border border-orange-400/50 rounded-full px-4 py-1.5 mb-4">
              <CalendarClock className="w-3.5 h-3.5 text-orange-300" />
              <span className="text-xs font-bold uppercase tracking-wider text-orange-300">
                Cuộc thi quốc gia
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
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <RevealOnScroll direction="up" distance={20}>
            <CompetitionStage
              Icon={Flag}
              stage="Vòng Loại"
              location="TP Đà Nẵng"
              date="26/07/2026"
              note="Dự kiến kết thúc"
              tone="orange"
            />
          </RevealOnScroll>
          <RevealOnScroll direction="up" distance={20} delay={0.1}>
            <CompetitionStage
              Icon={Trophy}
              stage="Chung Kết"
              location="Khu vực Miền Trung"
              date="13/09/2026"
              note="Tại Nghệ An"
              tone="red"
            />
          </RevealOnScroll>
        </div>

        <div className="text-center mt-12">
          <Link
            href="/khoa-hoc/laptrinhrobot#sata1"
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-3 rounded-xl shadow-xl shadow-orange-500/40 hover:-translate-y-0.5 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:outline-none"
          >
            Đăng ký Sata1 - Luyện thi Robosim ngay
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

const STAGE_TONE: Record<"orange" | "red", { ring: string; bg: string; icon: string }> = {
  orange: {
    ring: "ring-orange-400/40",
    bg: "from-orange-500/10 to-amber-500/10",
    icon: "bg-orange-500/20 text-orange-300",
  },
  red: {
    ring: "ring-red-400/40",
    bg: "from-red-500/10 to-orange-500/10",
    icon: "bg-red-500/20 text-red-300",
  },
};

function CompetitionStage({
  Icon,
  stage,
  location,
  date,
  note,
  tone,
}: {
  Icon: LucideIcon;
  stage: string;
  location: string;
  date: string;
  note: string;
  tone: "orange" | "red";
}) {
  const t = STAGE_TONE[tone];
  return (
    <article
      className={`bg-gradient-to-br ${t.bg} backdrop-blur rounded-2xl ring-2 ${t.ring} p-6`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl ${t.icon} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="text-xs uppercase tracking-wider text-neutral-400">{stage}</div>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <MapPin className="w-4 h-4 text-neutral-400" />
        <span className="text-xl md:text-2xl font-bold">{location}</span>
      </div>
      <div className="text-3xl md:text-4xl font-black text-orange-400 mb-2">{date}</div>
      <div className="text-sm text-neutral-300">{note}</div>
    </article>
  );
}

// ============== 9. FINAL CTA ==============
function FinalCTA() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-r from-orange-500 to-purple-600 py-16 md:py-24">
      <Particles
        className="absolute inset-0"
        quantity={35}
        ease={70}
        color="#ffffff"
        refresh={false}
      />
      <div className="container mx-auto px-4 max-w-4xl text-center text-white relative z-10">
        <FadeIn>
          <h2 className="text-3xl md:text-5xl font-black mb-3">
            Con bạn xứng đáng được trải nghiệm tốt nhất
          </h2>
          <p className="text-lg md:text-xl mb-10 opacity-90">
            Học thử <strong>MIỄN PHÍ</strong> — không điều kiện.
            <br />
            Cam kết hoàn tiền 100% nếu không hài lòng.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/lien-he?free-trial=true">
              <ShimmerButton
                background="rgba(255,255,255,1)"
                borderRadius="14px"
                className="px-8 py-4 font-bold text-orange-600 text-lg shadow-2xl"
              >
                <Target className="w-5 h-5 mr-2" />
                <span>Đăng ký học thử ngay</span>
                <ArrowRight className="w-5 h-5 ml-2" />
              </ShimmerButton>
            </Link>
            <a
              href={`tel:${SATA_ROBO_CONTACT.hotlineRaw}`}
              className="inline-flex items-center justify-center gap-2 bg-white/10 backdrop-blur text-white border-2 border-white/50 font-bold px-8 py-4 rounded-xl hover:bg-white/20 text-lg transition-all duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              <Phone className="w-6 h-6" />
              {SATA_ROBO_CONTACT.hotline}
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

// ============== Section primitives ==============
const EYEBROW_TONE: Record<"orange" | "purple", string> = {
  orange: "text-orange-600",
  purple: "text-purple-600",
};

function SectionEyebrow({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: "orange" | "purple";
}) {
  return (
    <div className={`flex items-center justify-center gap-2 mb-3 ${EYEBROW_TONE[tone]}`}>
      <Icon className="w-4 h-4" />
      <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-center text-3xl md:text-4xl font-black text-neutral-900 leading-tight">
      {children}
    </h2>
  );
}

function SectionLead({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-center text-neutral-600 mt-3 max-w-2xl mx-auto leading-relaxed">
      {children}
    </p>
  );
}
