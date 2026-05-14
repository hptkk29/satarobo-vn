import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Target, Heart, Sparkles as SparkleIcon } from "lucide-react";
import { db } from "@/lib/db";
import { aboutPageJsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { pageImages } from "@/lib/page-images";
import { HeroSplit } from "@/components/design-system/heroes/hero-split";
import { SectionBase } from "@/components/design-system/sections/section-base";
import { SectionStats } from "@/components/design-system/sections/section-stats";
import { EmployeeCard } from "@/components/design-system/cards/employee-card";
import { CTAPrimary } from "@/components/design-system/ctas/cta-primary";
import { CTASecondary } from "@/components/design-system/ctas/cta-secondary";
import { Sparkles } from "@/components/design-system/effects/sparkles";
import { GlowOrb } from "@/components/design-system/effects/glow-orb";
import { HonorTimeline } from "@/components/honors/timeline";
import { tokens } from "@/lib/design-tokens";

const BASE_URL = "https://satarobo.vn";

export const metadata: Metadata = {
  title: "Về chúng tôi — Sata Robo",
  description:
    "Câu chuyện 6 năm xây dựng — 4,000 hành trình học viên. Tầm nhìn, sứ mệnh và đội ngũ Sata Robo.",
  alternates: { canonical: `${BASE_URL}/ve-chung-toi` },
  openGraph: {
    title: "Về chúng tôi — Sata Robo",
    description: "6 năm xây dựng nền tảng giáo dục Robotics & STEM tại Việt Nam.",
    url: `${BASE_URL}/ve-chung-toi`,
    siteName: "Sata Robo",
    images: [{ url: pageImages.aboutHero.src, width: 1600, height: 900 }],
  },
};

export const revalidate = 60;

const aboutJsonLd = aboutPageJsonLd();
const breadcrumb = breadcrumbJsonLd([
  { name: "Trang chủ", url: "/" },
  { name: "Về chúng tôi", url: "/ve-chung-toi" },
]);

export default async function VeChungToiPage() {
  const [employees, timelineItems] = await Promise.all([
    db.employee
      .findMany({
        where: { isPublic: true, isActive: true },
        orderBy: [{ displayOrder: "asc" }, { fullName: "asc" }],
        take: 8,
      })
      .catch(() => []),
    db.timelineItem
      .findMany({
        where: { isPublished: true },
        orderBy: { occurredAt: "asc" },
      })
      .catch(() => []),
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />

      <div className="bg-white border-b border-neutral-200 py-3">
        <div className={tokens.spacing.container}>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-neutral-500">
            <Link href="/" className="hover:text-orange-600 transition-colors">Trang chủ</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-neutral-800 font-medium">Về chúng tôi</span>
          </nav>
        </div>
      </div>

      <HeroSplit
        eyebrow="VỀ CHÚNG TÔI"
        title="6 năm xây dựng — 4,000 hành trình"
        subtitle="Câu chuyện Sata Robo bắt đầu từ ước mơ đem Robotics & STEM đến mọi trẻ em Việt Nam — bất kể địa lý hay điều kiện kinh tế."
        illustration={
          <div className="relative aspect-video rounded-2xl overflow-hidden shadow-xl">
            <Image
              src={pageImages.aboutHero.src}
              alt={pageImages.aboutHero.alt}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
          </div>
        }
      >
        <CTAPrimary href="/lien-he">Liên hệ với chúng tôi</CTAPrimary>
        <CTASecondary href="/khoa-hoc">Xem khoá học</CTASecondary>
      </HeroSplit>

      <SectionBase
        theme="white"
        eyebrow="CÂU CHUYỆN"
        title="Hành trình của Sata Robo"
        variant="narrow"
      >
        <div className="prose prose-lg max-w-none mx-auto text-neutral-800 leading-relaxed">
          <p>
            Năm 2020, khi đại dịch buộc trẻ em Việt Nam phải học online, chúng tôi nhận
            ra một khoảng trống: <strong>Robotics &amp; STEM</strong> — môn học quan
            trọng nhất cho tương lai — lại là môn ít được tiếp cận nhất bên ngoài Hà Nội
            và TP.HCM.
          </p>
          <p>
            Hồ Đắc Phúc cùng 2 đồng sự khởi nghiệp Sata Robo tại Đà Nẵng với 1 cơ sở,
            3 giáo viên, và niềm tin: <em>&ldquo;Mọi trẻ em đều xứng đáng được tiếp cận
            công nghệ giáo dục chất lượng quốc tế.&rdquo;</em>
          </p>
          <p>
            6 năm sau — chúng tôi có 4 cơ sở tại Đà Nẵng, 12 giáo viên chính thức, đào
            tạo hơn <strong>4,000 học viên</strong>, đối tác chiến lược với 8 trường
            K-12, và đã đem về <strong>24 giải thưởng RoboSim 2026</strong> cho học
            viên — bao gồm 5 huy chương vàng.
          </p>
          <p>
            Nhưng quan trọng hơn — chúng tôi đã chứng minh rằng <strong>giáo dục công
            nghệ chất lượng có thể đến với mọi trẻ em Việt Nam</strong>, dù bằng video
            online, lớp offline, lab tại trường, hay tour ngoại khoá.
          </p>
        </div>
      </SectionBase>

      <SectionStats
        eyebrow="CON SỐ"
        title="Sata Robo 2020 - 2026"
        stats={[
          { value: 4000, suffix: "+", label: "Học viên" },
          { value: 4, label: "Cơ sở Đà Nẵng" },
          { value: 8, label: "Trường đối tác" },
          { value: 24, label: "Giải RoboSim 2026" },
        ]}
      />

      {timelineItems.length > 0 && (
        <div className={tokens.vibrantBg.softCool}>
          <HonorTimeline items={timelineItems} />
        </div>
      )}

      {employees.length > 0 && (
        <SectionBase
          theme="soft-cool"
          eyebrow="💜 ĐỘI NGŨ"
          title="Những người đứng sau Sata Robo"
          subtitle="Đội ngũ giáo viên + đội ngũ vận hành cùng kiến tạo trải nghiệm học tập"
          glowOrb={{ color: "purple", position: "top-right" }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {employees.map((emp) => (
              <EmployeeCard
                key={emp.id}
                fullName={emp.fullName}
                jobTitle={emp.jobTitle}
                avatarUrl={emp.avatarUrl}
                bio={emp.bio}
                department={emp.department.replace(/_/g, " ")}
              />
            ))}
          </div>
        </SectionBase>
      )}

      <SectionBase theme="white" eyebrow="GIÁ TRỊ CỐT LÕI" title="Tầm nhìn & Sứ mệnh">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="relative bg-gradient-to-br from-orange-50 to-white border border-orange-200 rounded-2xl p-8 overflow-hidden">
            <GlowOrb color="orange" position="top-right" size="sm" />
            <div className="relative z-10">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-orange-100 text-orange-600 mb-4">
                <Target className="w-6 h-6" />
              </div>
              <h3 className={`${tokens.typography.heading.h4} mb-3`}>Tầm nhìn</h3>
              <p className={`${tokens.typography.body.base} text-neutral-700`}>
                Trở thành nền tảng giáo dục Robotics &amp; STEM hàng đầu Việt Nam vào
                năm 2030 — nơi mọi trẻ em từ lớp 1 đến lớp 12 đều có thể tiếp cận
                chương trình chất lượng quốc tế.
              </p>
            </div>
          </div>

          <div className="relative bg-gradient-to-br from-purple-50 to-white border border-purple-200 rounded-2xl p-8 overflow-hidden">
            <GlowOrb color="purple" position="top-right" size="sm" />
            <div className="relative z-10">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-100 text-purple-700 mb-4">
                <Heart className="w-6 h-6" />
              </div>
              <h3 className={`${tokens.typography.heading.h4} mb-3`}>Sứ mệnh</h3>
              <p className={`${tokens.typography.body.base} text-neutral-700`}>
                Đem Robotics &amp; tư duy lập trình đến mọi trẻ em Việt Nam bằng giáo
                trình chuẩn quốc tế WRO, giáo viên 1:8, và đa hình thức học (online +
                offline + tại trường + tour) — phù hợp mọi hoàn cảnh.
              </p>
            </div>
          </div>
        </div>
      </SectionBase>

      <section className={`relative overflow-hidden ${tokens.vibrantBg.ctaFinal} py-20 md:py-28`}>
        <Sparkles density="medium" colors={["orange", "purple"]} />
        <GlowOrb color="orange" position="bottom-left" size="xl" />
        <GlowOrb color="purple" position="top-right" size="xl" />
        <div className="container max-w-4xl mx-auto px-4 text-center relative z-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white shadow-sm border border-orange-100 mb-6">
            <SparkleIcon className="w-7 h-7 text-orange-500" />
          </div>
          <h2 className={`${tokens.typography.display.h2} mb-4`}>
            Cùng Sata Robo viết tiếp câu chuyện
          </h2>
          <p className={`${tokens.typography.body.lg} text-neutral-600 mb-8 max-w-2xl mx-auto`}>
            Cho con bạn cơ hội học công nghệ chất lượng quốc tế — bắt đầu chỉ với 1 buổi tư vấn miễn phí
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <CTAPrimary href="/lien-he" size="lg" magnetic>
              Đăng ký tư vấn
            </CTAPrimary>
            <CTASecondary href="/tuyen-dung" size="lg">
              Gia nhập đội ngũ
            </CTASecondary>
          </div>
        </div>
      </section>
    </>
  );
}
