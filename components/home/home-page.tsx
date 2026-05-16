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
  MapPin,
  Flag,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { SATA_ROBO_CONTACT } from "@/lib/locations";
import { NumberTicker } from "@/components/magic/number-ticker";
import { BorderBeam } from "@/components/magic/border-beam";
import { ShimmerButton } from "@/components/magic/shimmer-button";
import { Particles } from "@/components/magic/particles";
import { FadeIn } from "@/components/motion/fade-in";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { AutoCarousel } from "@/components/public/auto-carousel";
import { EarlyBirdCountdown } from "@/components/home/early-bird-countdown";
import { FAQSection } from "@/components/home/faq-section";
import { HeroMain } from "@/components/sections/hero-main";
import { TrustBadges } from "@/components/sections/trust-badges";
import { UspGrid } from "@/components/sections/usp-grid";
import { Testimonials } from "@/components/sections/testimonials";
import { SecondaryCta } from "@/components/sections/secondary-cta";

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
      <HeroMain />
      <UspGrid />
      <CatalogSection courses={courses} />
      <Testimonials />
      <SecondaryCta />
      <StatsBar />
      <UuTheSection />
      <EarlyBirdCountdown />
      <TrustBadges />
      <TravelPrizeBanner />
      <CompetitionCountdown />
      <FAQSection />
      <FinalCTA />
    </>
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

// ============== 3. ƯU THẾ + THÀNH TỰU (Bento 3) ==============
function UuTheSection() {
  const achievements = [
    "Phối hợp tổ chức thành công Cuộc thi Sáng tạo Robotics 2025 cùng Thành Đoàn TP Đà Nẵng và TW Đoàn TNCS Hồ Chí Minh",
    "Tiếp tục tham gia BTC và hỗ trợ các đội thi Robotics 2026 tại TP Đà Nẵng",
    "Đã giải xong đề thi 2026 và hoàn thiện tài liệu đào tạo luyện thi chuyên sâu với cam kết đầu ra bằng văn bản",
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
          {/* Card 2 */}
          <RevealOnScroll direction="up" distance={20} delay={0.1}>
            <article className="h-full bg-white rounded-2xl border border-neutral-200 p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-shadow">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-orange-500 text-white font-black mb-4 shadow-md shadow-orange-500/30">
                2
              </div>
              <p className="text-neutral-800 text-base md:text-lg leading-relaxed font-medium">
                {achievements[1]}
              </p>
            </article>
          </RevealOnScroll>
          {/* Card 3 */}
          <RevealOnScroll direction="up" distance={20} delay={0.2}>
            <article className="h-full bg-white rounded-2xl border border-neutral-200 p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-shadow">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-orange-500 text-white font-black mb-4 shadow-md shadow-orange-5<PASSWORD>">
                3
              </div>
              <p className="text-neutral-8<PASSWORD> text-base md:text-lg leading-relaxed font-medium">
                {achievements[2]}
              </p>
            </article>
          </RevealOnScroll>
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
            href="https://drive.google.com/file/d/1fE3ALCboUanJlLxFb6Uq7iiJqYu7y4mC/view"
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-3 rounded-xl shadow-xl shadow-orange-500/40 hover:-translate-y-0.5 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:outline-none"
          >
            Xem ngay thể lệ cuộc thi
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
