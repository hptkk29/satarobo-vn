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
    "4 hình thức học Robotics & STEM tại Sata Robo — từ video online đến lab tại trường, từ B2B đến tour ngoại khoá.",
  openGraph: {
    title: "Khoá học Robotics & STEM — Sata Robo",
    description: "4 hình thức học phù hợp mọi nhu cầu — học sinh K-12 + B2B.",
    url: `${BASE_URL}/khoa-hoc`,
    siteName: "Sata Robo",
  },
  alternates: { canonical: `${BASE_URL}/khoa-hoc` },
};

export const revalidate = 60;

const COMPARISON = [
  { label: "Hình thức", sp1: "Online video", sp2: "Offline lớp", sp3: "B2B trường học", sp4: "Tour 1-3 ngày" },
  { label: "Đối tượng", sp1: "Lớp 3-8", sp2: "Lớp 1-8", sp3: "Trường K-12", sp4: "Lớp 4-12" },
  { label: "Thời lượng", sp1: "6 tháng", sp2: "3 tháng", sp3: "Tuỳ chỉnh", sp4: "1-3 ngày" },
  { label: "Sĩ số", sp1: "Không giới hạn", sp2: "≤ 8 / lớp", sp3: "Theo trường", sp4: "20-40 / tour" },
  { label: "Giá", sp1: "2,400,000đ", sp2: "6,500,000đ", sp3: "Liên hệ", sp4: "Liên hệ" },
  { label: "Phù hợp với", sp1: "Học tự lập, tiết kiệm", sp2: "Học bài bản 1:1", sp3: "Hiệu trưởng/Ban GD", sp4: "Hoạt động ngoại khoá" },
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
        title="4 con đường Robotics phù hợp mọi nhu cầu"
        subtitle="Từ học online đến tour trải nghiệm — Sata Robo có giải pháp cho mọi gia đình"
        trustIndicators={[
          { text: "Lộ trình rõ ràng" },
          { text: "Hoàn 100% nếu không hài lòng" },
          { text: "4 cơ sở Đà Nẵng" },
        ]}
        effects={{ particles: true, sparkles: true, glowOrbs: true, gridLines: false }}
      >
        <CTAPrimary href="/lien-he" magnetic>Đăng ký tư vấn miễn phí</CTAPrimary>
      </HeroParticles>

      {/* ─── Products grid SOFT-WARM ─── */}
      <SectionBase
        theme="soft-warm"
        eyebrow="🧡 4 SẢN PHẨM CHỦ LỰC"
        title="Chọn sản phẩm phù hợp với con bạn"
        subtitle="Mỗi sản phẩm thiết kế cho nhu cầu cụ thể — bấm vào card để xem chi tiết"
        glowOrb={{ color: "orange", position: "bottom-right" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {courses.map((c) => (
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

      {/* ─── Comparison table WHITE ─── */}
      <SectionBase
        theme="white"
        eyebrow="SO SÁNH"
        title="So sánh 4 sản phẩm"
        subtitle="Bảng tổng hợp để chọn nhanh"
      >
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-neutral-700">Tiêu chí</th>
                <th className="px-4 py-3 font-semibold text-orange-600">SP1 RoboSim</th>
                <th className="px-4 py-3 font-semibold text-orange-600">SP2 Offline</th>
                <th className="px-4 py-3 font-semibold text-orange-600">SP3 Inno School</th>
                <th className="px-4 py-3 font-semibold text-orange-600">SP4 SATAGO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {COMPARISON.map((row) => (
                <tr key={row.label} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium text-neutral-700">{row.label}</td>
                  <td className="px-4 py-3 text-neutral-600">{row.sp1}</td>
                  <td className="px-4 py-3 text-neutral-600">{row.sp2}</td>
                  <td className="px-4 py-3 text-neutral-600">{row.sp3}</td>
                  <td className="px-4 py-3 text-neutral-600">{row.sp4}</td>
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
          { value: 4000, suffix: "+", label: "Học viên" },
          { value: 4, label: "Cơ sở Đà Nẵng" },
          { value: 8, label: "Trường K-12 đối tác" },
          { value: 24, label: "Giải RoboSim 2026" },
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
            "Cộng đồng phụ huynh 4,000+ chia sẻ kinh nghiệm",
            "Đối tác 8 trường K-12 — giáo trình đã kiểm chứng",
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
            Chưa biết chọn sản phẩm nào?
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
