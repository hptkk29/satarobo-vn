import Image from "next/image";
import Link from "next/link";
import type { ComponentType } from "react";
import { ChevronRight } from "lucide-react";
import type { Course } from "@prisma/client";
import { HeroSplit } from "@/components/design-system/heroes/hero-split";
import { SectionBase } from "@/components/design-system/sections/section-base";
import { SectionStats } from "@/components/design-system/sections/section-stats";
import { CourseCard } from "@/components/design-system/cards/course-card";
import { CTAPrimary } from "@/components/design-system/ctas/cta-primary";
import { CTASecondary } from "@/components/design-system/ctas/cta-secondary";
import { Sparkles } from "@/components/design-system/effects/sparkles";
import { GlowOrb } from "@/components/design-system/effects/glow-orb";
import { tokens } from "@/lib/design-tokens";

interface IconProp {
  className?: string;
}

interface Feature {
  icon: ComponentType<IconProp>;
  title: string;
  desc: string;
}

interface CurriculumStep {
  step: number;
  title: string;
  desc: string;
}

interface Stat {
  value: number;
  suffix?: string;
  label: string;
}

interface FAQ {
  q: string;
  a: string;
}

interface ProductPageTemplateProps {
  slug: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  heroImage: { src: string; alt: string };
  features: Feature[];
  curriculum: CurriculumStep[];
  stats: Stat[];
  faqs: FAQ[];
  relatedCourses: Course[];
  ctaTitle?: string;
  ctaSubtitle?: string;
  ctaPrimaryLabel?: string;
}

// Shared template cho 4 product pages SP1-SP4.
// 7 sections theo strategic color pattern.
export function ProductPageTemplate({
  slug,
  eyebrow,
  title,
  subtitle,
  heroImage,
  features,
  curriculum,
  stats,
  faqs,
  relatedCourses,
  ctaTitle = "Sẵn sàng bắt đầu?",
  ctaSubtitle = "Đăng ký tư vấn miễn phí 1-1 với chuyên gia Sata Robo",
  ctaPrimaryLabel = "Đăng ký ngay",
}: ProductPageTemplateProps) {
  return (
    <>
      <div className="bg-white border-b border-neutral-200 py-3">
        <div className={tokens.spacing.container}>
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-sm text-neutral-500"
          >
            <Link href="/" className="hover:text-orange-600 transition-colors">
              Trang chủ
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href="/khoa-hoc" className="hover:text-orange-600 transition-colors">
              Khoá học
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-neutral-800 font-medium truncate max-w-[200px]">
              {eyebrow}
            </span>
          </nav>
        </div>
      </div>

      {/* ─── Hero Split — soft warm cho product ─── */}
      <HeroSplit
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        illustration={
          <div className="relative aspect-video rounded-2xl overflow-hidden shadow-xl">
            <Image
              src={heroImage.src}
              alt={heroImage.alt}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
          </div>
        }
      >
        <CTAPrimary href={`/lien-he?subject=${slug}`} magnetic>
          {ctaPrimaryLabel}
        </CTAPrimary>
        <CTASecondary href="/khoa-hoc">Xem sản phẩm khác</CTASecondary>
      </HeroSplit>

      {/* ─── Features WHITE ─── */}
      <SectionBase
        theme="white"
        eyebrow="TÍNH NĂNG NỔI BẬT"
        title={`Tại sao chọn ${title}?`}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => (
            <div
              key={i}
              className="relative bg-white p-6 rounded-2xl border border-neutral-200 hover:border-orange-300 hover:shadow-md transition-all"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-orange-50 text-orange-500 mb-4">
                <f.icon className="w-6 h-6" />
              </div>
              <h3 className={`${tokens.typography.heading.h5} mb-2`}>{f.title}</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </SectionBase>

      {/* ─── Curriculum SOFT-WARM ─── */}
      <SectionBase
        theme="soft-warm"
        eyebrow="🧡 LỘ TRÌNH"
        title="Học gì? Học thế nào?"
        glowOrb={{ color: "orange", position: "top-right" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {curriculum.map((step) => (
            <div
              key={step.step}
              className="relative bg-white p-6 rounded-2xl border border-neutral-200 flex gap-4"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-purple-700 text-white flex items-center justify-center font-bold">
                {step.step}
              </div>
              <div>
                <h3 className={`${tokens.typography.heading.h5} mb-2`}>{step.title}</h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionBase>

      {/* ─── Stats NEUTRAL ─── */}
      {stats.length > 0 && (
        <SectionStats eyebrow="KẾT QUẢ" title={`${eyebrow} qua các con số`} stats={stats} />
      )}

      {/* ─── FAQ WHITE ─── */}
      {faqs.length > 0 && (
        <SectionBase
          theme="white"
          eyebrow="CÂU HỎI THƯỜNG GẶP"
          title="FAQ"
          variant="narrow"
        >
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <details
                key={i}
                className="group bg-white rounded-xl border border-neutral-200 overflow-hidden hover:border-orange-300 transition-colors"
              >
                <summary className="cursor-pointer list-none p-5 flex items-center justify-between gap-4">
                  <span className="font-semibold text-neutral-900">{faq.q}</span>
                  <ChevronRight className="w-5 h-5 text-neutral-400 group-open:rotate-90 transition-transform" />
                </summary>
                <div className="px-5 pb-5 text-sm text-neutral-700 leading-relaxed">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </SectionBase>
      )}

      {/* ─── Related products SOFT-COOL ─── */}
      {relatedCourses.length > 0 && (
        <SectionBase
          theme="soft-cool"
          eyebrow="💜 SẢN PHẨM KHÁC"
          title="Có thể bạn quan tâm"
          glowOrb={{ color: "purple", position: "bottom-left" }}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {relatedCourses.map((c) => (
              <CourseCard
                key={c.id}
                badge={c.code ?? undefined}
                title={c.name}
                description={c.shortDescription ?? c.description?.slice(0, 100) ?? ""}
                href={`/khoa-hoc/${c.slug}`}
                price={c.priceDisplay ?? undefined}
                duration={c.durationDisplay ?? undefined}
                studentCount={c.studentCount > 0 ? c.studentCount : undefined}
              />
            ))}
          </div>
        </SectionBase>
      )}

      {/* ─── Final CTA TWILIGHT ─── */}
      <section
        className={`relative overflow-hidden ${tokens.vibrantBg.ctaFinal} py-16`}
      >
        <Sparkles density="high" colors={["orange", "purple"]} />
        <GlowOrb color="orange" position="bottom-left" size="xl" />
        <GlowOrb color="purple" position="top-right" size="xl" />
        <div className="container max-w-4xl mx-auto px-4 text-center relative z-10">
          <h2 className={`${tokens.typography.display.h2} mb-4`}>{ctaTitle}</h2>
          <p
            className={`${tokens.typography.body.lg} text-neutral-600 mb-8 max-w-2xl mx-auto`}
          >
            {ctaSubtitle}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <CTAPrimary href={`/lien-he?subject=${slug}`} size="lg" magnetic>
              {ctaPrimaryLabel}
            </CTAPrimary>
            <CTASecondary href="tel:0818823720" size="lg">
              Gọi 0818 823 720
            </CTASecondary>
          </div>
        </div>
      </section>
    </>
  );
}
