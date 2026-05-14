import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Briefcase, Heart, TrendingUp, Users } from "lucide-react";
import { db } from "@/lib/db";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { JobCard as DSJobCard } from "@/components/design-system/cards/job-card";
import { SectionBase } from "@/components/design-system/sections/section-base";
import { CTAPrimary } from "@/components/design-system/ctas/cta-primary";
import { GlowOrb } from "@/components/design-system/effects/glow-orb";
import { pageImages } from "@/lib/page-images";
import { tokens } from "@/lib/design-tokens";
import { HR_CONTACT } from "@/lib/data/job-options";

export const revalidate = 60;

const BASE_URL = "https://satarobo.vn";

export const metadata: Metadata = {
  title: "Tuyển dụng — Cơ hội nghề nghiệp tại Sata Robo",
  description:
    "Sata Robo tuyển dụng giáo viên Robotics, Sales, Marketing tại Đà Nẵng. Môi trường năng động, đam mê giáo dục công nghệ.",
  alternates: { canonical: `${BASE_URL}/tuyen-dung` },
  openGraph: {
    title: "Tuyển dụng — Sata Robo",
    description: "Gia nhập đội ngũ Sata Robo — nơi đam mê giáo dục và công nghệ gặp nhau.",
    url: `${BASE_URL}/tuyen-dung`,
    siteName: "Sata Robo",
    images: [{ url: pageImages.careers.src, width: 1600, height: 900 }],
  },
};

interface SearchParams {
  searchParams: Promise<{ department?: string; location?: string; type?: string }>;
}

const PERKS = [
  { icon: Heart, title: "Văn hoá tích cực", desc: "Team trẻ, năng động, học hỏi liên tục" },
  { icon: TrendingUp, title: "Lương cạnh tranh", desc: "Lương + thưởng KPI + cổ phần ESOP" },
  { icon: Users, title: "Đào tạo bài bản", desc: "Mentor 1-1 + budget học liệu" },
  { icon: Briefcase, title: "Lộ trình thăng tiến", desc: "Performance review hàng quý, rõ ràng" },
];

export default async function TuyenDungPage({ searchParams }: SearchParams) {
  const sp = await searchParams;

  const jobs = await db.jobPosting
    .findMany({
      where: {
        status: "OPEN",
        ...(sp.department ? { department: sp.department } : {}),
        ...(sp.location ? { location: sp.location } : {}),
        ...(sp.type ? { type: sp.type } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        department: true,
        location: true,
        type: true,
        salaryMin: true,
        salaryMax: true,
        salaryNote: true,
        openings: true,
      },
    })
    .catch(() => []);

  const breadcrumb = breadcrumbJsonLd([
    { name: "Trang chủ", url: "/" },
    { name: "Tuyển dụng", url: "/tuyen-dung" },
  ]);

  function formatSalary(j: (typeof jobs)[number]): string | undefined {
    if (j.salaryNote) return j.salaryNote;
    if (j.salaryMin && j.salaryMax) {
      const min = (j.salaryMin / 1_000_000).toFixed(0);
      const max = (j.salaryMax / 1_000_000).toFixed(0);
      return `${min}-${max} triệu`;
    }
    return undefined;
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />

      <div className="bg-white border-b border-neutral-200 py-3">
        <div className={tokens.spacing.container}>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-neutral-500">
            <Link href="/" className="hover:text-orange-600 transition-colors">Trang chủ</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-neutral-800 font-medium">Tuyển dụng</span>
          </nav>
        </div>
      </div>

      {/* ─── Hero SOFT-WARM (careers = action = cam) ─── */}
      <section className={`relative overflow-hidden ${tokens.vibrantBg.softWarm} py-16 md:py-24`}>
        <GlowOrb color="orange" position="top-right" size="lg" />
        <div className="container max-w-6xl mx-auto px-4 grid md:grid-cols-2 gap-12 items-center relative z-10">
          <div>
            <p className={`${tokens.typography.eyebrow} mb-3`}>TUYỂN DỤNG</p>
            <h1 className={`${tokens.typography.display.h2} mb-4`}>
              Gia nhập Sata Robo
            </h1>
            <p className={`${tokens.typography.body.lg} text-neutral-600 mb-6`}>
              Cùng xây dựng tương lai giáo dục Robotics tại Việt Nam — nơi đam mê công nghệ và giáo dục gặp nhau
            </p>
            <CTAPrimary href={`mailto:${HR_CONTACT.email}`} magnetic>
              Liên hệ tuyển dụng
            </CTAPrimary>
          </div>
          <div className="relative aspect-video rounded-2xl overflow-hidden shadow-xl">
            <Image
              src={pageImages.careers.src}
              alt={pageImages.careers.alt}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
          </div>
        </div>
      </section>

      {/* ─── Jobs grid WHITE ─── */}
      <SectionBase
        theme="white"
        eyebrow={`VỊ TRÍ MỞ (${jobs.length})`}
        title="Cơ hội nghề nghiệp"
      >
        {jobs.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-neutral-500 mb-4">
              Hiện không có vị trí phù hợp. Gửi CV để được lưu hồ sơ cho cơ hội tương lai.
            </p>
            <CTAPrimary href={`mailto:${HR_CONTACT.email}`}>Gửi CV chủ động</CTAPrimary>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.map((j) => (
              <DSJobCard
                key={j.id}
                title={j.title}
                department={j.department || ""}
                location={j.location || ""}
                type={j.type || ""}
                salaryRange={formatSalary(j)}
                openings={j.openings}
                href={`/tuyen-dung/${j.slug}`}
              />
            ))}
          </div>
        )}
      </SectionBase>

      {/* ─── Why Sata Robo SOFT-COOL ─── */}
      <SectionBase
        theme="soft-cool"
        eyebrow="💜 LÝ DO CHỌN SATA ROBO"
        title="Vì sao gia nhập đội ngũ?"
        glowOrb={{ color: "purple", position: "bottom-left" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PERKS.map((p) => (
            <div key={p.title} className="bg-white p-6 rounded-2xl border border-neutral-200">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-100 text-purple-700 mb-4">
                <p.icon className="w-6 h-6" />
              </div>
              <h3 className={`${tokens.typography.heading.h5} mb-2`}>{p.title}</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </SectionBase>

      {/* ─── HR contact WHITE ─── */}
      <SectionBase theme="white" eyebrow="LIÊN HỆ" title="HR Sata Robo" variant="narrow">
        <div className="text-center max-w-xl mx-auto">
          <p className="text-neutral-700 mb-2">
            <strong>{HR_CONTACT.name}</strong> — HR Manager
          </p>
          <p className="text-neutral-600 mb-1">
            📧{" "}
            <a
              href={`mailto:${HR_CONTACT.email}`}
              className="text-orange-600 hover:underline"
            >
              {HR_CONTACT.email}
            </a>
          </p>
          <p className="text-neutral-600">
            📞{" "}
            <a href={`tel:${HR_CONTACT.phone}`} className="text-orange-600 hover:underline">
              {HR_CONTACT.phone}
            </a>
          </p>
        </div>
      </SectionBase>
    </>
  );
}
