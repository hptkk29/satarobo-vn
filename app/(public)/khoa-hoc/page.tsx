import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Check } from "lucide-react";
import { db } from "@/lib/db";
import { itemListJsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { HeroParticles } from "@/components/design-system/heroes/hero-particles";
import { SectionBase } from "@/components/design-system/sections/section-base";
import { SectionStats } from "@/components/design-system/sections/section-stats";
import { CourseCard } from "@/components/design-system/cards/course-card";
import { CTAPrimary } from "@/components/design-system/ctas/cta-primary";
import { CTASecondary } from "@/components/design-system/ctas/cta-secondary";
import { Sparkles } from "@/components/design-system/effects/sparkles";
import { GlowOrb } from "@/components/design-system/effects/glow-orb";
import { tokens } from "@/lib/design-tokens";

const BASE_URL = "https://satarobo.vn";

export const metadata: Metadata = {
  title: "Khoá học Robotics & STEM — Sata Robo Đà Nẵng",
  description:
    "2 khoá học chủ lực tại Sata Robo: Lập trình Robot (K-9) và Luyện thi RoboSim — robot vật lý, giáo viên 1:8, 4 cơ sở Đà Nẵng.",
  openGraph: {
    title: "Khoá học Robotics & STEM — Sata Robo",
    description: "2 khoá học chủ lực: Lập trình Robot (K-9) và Luyện thi RoboSim.",
    url: `${BASE_URL}/khoa-hoc`,
    siteName: "Sata Robo",
  },
  alternates: { canonical: `${BASE_URL}/khoa-hoc` },
};

export const revalidate = 60;

const COMPARISON = [
  {
    label: "Hình thức",
    laptrinhrobot: "Offline tại lớp",
    luyenthirobosim: "Online + coaching 1-1",
  },
  {
    label: "Đối tượng",
    laptrinhrobot: "Học sinh lớp 1-8 (mới bắt đầu)",
    luyenthirobosim: "Học sinh đã biết cơ bản, muốn thi đấu",
  },
  {
    label: "Thời lượng",
    laptrinhrobot: "6 tháng (12 module)",
    luyenthirobosim: "3-6 tháng (18 buổi video + coaching)",
  },
  {
    label: "Sĩ số",
    laptrinhrobot: "≤ 8 học viên / lớp",
    luyenthirobosim: "Không giới hạn (online)",
  },
  {
    label: "Thiết bị",
    laptrinhrobot: "Robot LEGO Education vật lý",
    luyenthirobosim: "Platform RoboSim trên trình duyệt",
  },
  {
    label: "Mục tiêu",
    laptrinhrobot: "Nền tảng Robotics + tư duy lập trình",
    luyenthirobosim: "Pass vòng loại Sáng tạo Robotics (RoboSim)",
  },
  {
    label: "Giá",
    laptrinhrobot: "Liên hệ tư vấn",
    luyenthirobosim: "Liên hệ tư vấn",
  },
];

export default async function CoursesPage() {
  const courses = await db.course
    .findMany({
      where: { isPublished: true },
      orderBy: { displayOrder: "asc" },
    })
    .catch(() => []);

  const itemListData = courses.map((c, i) => ({
    position: i + 1,
    name: `${c.code ?? ""} — ${c.name}`.trim().replace(/^—\s*/, ""),
    url: `${BASE_URL}/khoa-hoc/${c.slug}`,
  }));

  const breadcrumb = breadcrumbJsonLd([
    { name: "Trang chủ", url: "/" },
    { name: "Khoá học", url: "/khoa-hoc" },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd(itemListData)) }}
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
            <span className="text-neutral-800 font-medium">Khoá học</span>
          </nav>
        </div>
      </div>

      {/* ─── Hero SUNRISE ─── */}
      <HeroParticles
        theme="sunrise"
        eyebrow="KHOÁ HỌC"
        title="2 con đường Robotics phù hợp với con bạn"
        subtitle="Bắt đầu nền tảng với Lập trình Robot — nâng cao luyện thi đấu với RoboSim"
        trustIndicators={[
          { text: "Lộ trình rõ ràng" },
          { text: "Hoàn 100% nếu không hài lòng" },
          { text: "4 cơ sở Đà Nẵng" },
        ]}
        effects={{ particles: true, sparkles: true, glowOrbs: true, gridLines: false }}
      >
        <CTAPrimary href="/lien-he" magnetic>Đăng ký tư vấn miễn phí</CTAPrimary>
      </HeroParticles>

      {/* ─── Products grid SOFT-WARM (2 large cards) ─── */}
      <SectionBase
        theme="soft-warm"
        eyebrow="🧡 2 KHOÁ HỌC CHỦ LỰC"
        title="Chọn khoá phù hợp với con bạn"
        subtitle="Bấm vào card để xem chi tiết lộ trình, học phí và cách đăng ký"
        glowOrb={{ color: "orange", position: "bottom-right" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {courses.map((c) => (
            <CourseCard
              key={c.id}
              size="large"
              badge={c.code ?? undefined}
              title={c.name}
              description={c.shortDescription ?? c.description?.slice(0, 200) ?? ""}
              href={`/khoa-hoc/${c.slug}`}
              imageUrl={c.thumbnail ?? undefined}
              price={c.priceDisplay ?? undefined}
              duration={c.durationDisplay ?? undefined}
              studentCount={c.studentCount > 0 ? c.studentCount : undefined}
            />
          ))}
        </div>
      </SectionBase>

      {/* ─── Comparison table WHITE ─── */}
      <SectionBase
        theme="white"
        eyebrow="SO SÁNH"
        title="Lập trình Robot vs Luyện thi RoboSim"
        subtitle="Bảng tổng hợp để chọn nhanh khoá phù hợp"
      >
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white max-w-4xl mx-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left">
              <tr>
                <th className="px-4 py-4 font-semibold text-neutral-700">Tiêu chí</th>
                <th className="px-4 py-4 font-semibold text-orange-600">Lập trình Robot</th>
                <th className="px-4 py-4 font-semibold text-purple-700">Luyện thi RoboSim</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {COMPARISON.map((row) => (
                <tr key={row.label} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium text-neutral-700">{row.label}</td>
                  <td className="px-4 py-3 text-neutral-600">{row.laptrinhrobot}</td>
                  <td className="px-4 py-3 text-neutral-600">{row.luyenthirobosim}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionBase>

      {/* ─── Stats NEUTRAL ─── */}
      <SectionStats
        eyebrow="CON SỐ"
        title="Sata Robo qua 6 năm"
        stats={[
          { value: 2000, suffix: "+", label: "Học viên" },
          { value: 4, label: "Cơ sở Đà Nẵng" },
          { value: 24, label: "Giải RoboSim 2026" },
          { value: 4.9, label: "Đánh giá phụ huynh" },
        ]}
      />

      {/* ─── Why choose WHITE ─── */}
      <SectionBase
        theme="white"
        eyebrow="CAM KẾT"
        title="Tại sao chọn Sata Robo"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            "Giáo trình WRO chuẩn quốc tế — 6 năm tinh chỉnh",
            "Hoàn 100% học phí buổi 1-2 nếu con không phù hợp",
            "Giáo viên 1:8 — đảm bảo từng học viên được chú ý",
            "Lab Robotics đầy đủ — robot LEGO, sensor, controller",
            "Cộng đồng phụ huynh 2,000+ chia sẻ kinh nghiệm",
            "4 cơ sở Đà Nẵng — thuận tiện đưa đón con đi học",
          ].map((point) => (
            <div key={point} className="flex items-start gap-3 p-4 rounded-xl border border-neutral-200">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
                <Check className="w-3.5 h-3.5" />
              </div>
              <p className="text-sm text-neutral-700">{point}</p>
            </div>
          ))}
        </div>
      </SectionBase>

      {/* ─── Final CTA TWILIGHT ─── */}
      <section className={`relative overflow-hidden ${tokens.vibrantBg.ctaFinal} py-20 md:py-28`}>
        <Sparkles density="high" colors={["orange", "purple"]} />
        <GlowOrb color="orange" position="bottom-left" size="xl" />
        <GlowOrb color="purple" position="top-right" size="xl" />
        <div className="container max-w-4xl mx-auto px-4 text-center relative z-10">
          <h2 className={`${tokens.typography.display.h2} mb-4`}>
            Chưa biết chọn khoá nào?
          </h2>
          <p className={`${tokens.typography.body.lg} text-neutral-600 mb-8 max-w-2xl mx-auto`}>
            Đăng ký tư vấn 1-1 miễn phí — chuyên gia Sata Robo sẽ giúp anh chị tìm lộ trình phù hợp nhất cho con
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <CTAPrimary href="/lien-he" size="lg" magnetic>
              Đăng ký tư vấn miễn phí
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
