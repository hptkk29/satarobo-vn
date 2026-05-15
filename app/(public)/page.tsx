import type { Metadata } from "next";
import { Award, Users, Code, Heart } from "lucide-react";
import { db } from "@/lib/db";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/jsonld";
import { HeroParticles } from "@/components/design-system/heroes/hero-particles";
import { SectionBase } from "@/components/design-system/sections/section-base";
import { SectionStats } from "@/components/design-system/sections/section-stats";
import { CourseCard } from "@/components/design-system/cards/course-card";
import { BlogCard } from "@/components/design-system/cards/blog-card";
import { TestimonialCard } from "@/components/design-system/cards/testimonial-card";
import { CTAPrimary } from "@/components/design-system/ctas/cta-primary";
import { CTASecondary } from "@/components/design-system/ctas/cta-secondary";
import { Sparkles } from "@/components/design-system/effects/sparkles";
import { GlowOrb } from "@/components/design-system/effects/glow-orb";
import { Marquee } from "@/components/magic/marquee";
import { tokens } from "@/lib/design-tokens";

const BASE_URL = "https://satarobo.vn";

export const metadata: Metadata = {
  title: "Sata Robo — Trung tâm Robotics & STEM hàng đầu Đà Nẵng",
  description:
    "Sata Robo — Trung tâm Robotics & STEM hàng đầu Đà Nẵng. Khoá Lập trình Robot K-9 và Luyện thi RoboSim cho học sinh lớp 1-8. 2,000+ học viên, 4 cơ sở.",
  openGraph: {
    title: "Sata Robo — Trung tâm Robotics & STEM hàng đầu Đà Nẵng",
    description:
      "Trung tâm Robotics & STEM hàng đầu Đà Nẵng cho học sinh lớp 1-8. 4 cơ sở, 2,000+ học viên, cam kết kết quả.",
    url: BASE_URL,
    siteName: "Sata Robo",
    images: [
      {
        url: `${BASE_URL}/images/og/homepage.jpg`,
        width: 1200,
        height: 630,
        alt: "Sata Robo — Hệ sinh thái Robotics & STEM giáo dục hàng đầu Đà Nẵng",
      },
    ],
    locale: "vi_VN",
    type: "website",
  },
  alternates: { canonical: BASE_URL },
};

export const revalidate = 60;

const FEATURES = [
  {
    icon: Award,
    title: "Chương trình bài bản",
    desc: "Lộ trình rõ ràng — 6 năm xây dựng giáo trình chuẩn quốc tế WRO",
  },
  {
    icon: Users,
    title: "Đội ngũ chuyên gia",
    desc: "Giảng viên Robotics + STEM được đào tạo bài bản",
  },
  {
    icon: Code,
    title: "Học qua thực hành",
    desc: "Lập trình robot thật — không chỉ lý thuyết",
  },
  {
    icon: Heart,
    title: "Cộng đồng cha mẹ",
    desc: "2,000+ gia đình tin tưởng đồng hành cùng con",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "Con tôi học được 3 tháng đã có thể tự lập trình robot đơn giản. Tư duy logic cải thiện rõ rệt.",
    authorName: "Chị Thanh Hà",
    authorRole: "Phụ huynh lớp 5",
    rating: 5,
  },
  {
    quote:
      "Giáo viên tận tâm, lớp ít học sinh nên con được chú ý cá nhân. Sata Robo thực sự hơn kỳ vọng.",
    authorName: "Anh Minh Đức",
    authorRole: "Phụ huynh lớp 7",
    rating: 5,
  },
  {
    quote:
      "Con tham gia thi RoboSim và đạt giải khu vực. Hành trình của con cùng Sata Robo là trải nghiệm tuyệt vời.",
    authorName: "Chị Mai Lan",
    authorRole: "Phụ huynh lớp 6",
    rating: 5,
  },
  {
    quote:
      "Lớp offline rất chất lượng. Con từ ngại tiếp xúc giờ chủ động giao tiếp với bạn bè.",
    authorName: "Chị Phương Anh",
    authorRole: "Phụ huynh lớp 4",
    rating: 5,
  },
  {
    quote:
      "Con luyện thi RoboSim với mentor 1-1 — pass vòng loại ngay năm đầu tiên. Mentor Sata Robo rất tận tâm.",
    authorName: "Anh Hoàng Long",
    authorRole: "Phụ huynh lớp 8",
    rating: 5,
  },
  {
    quote:
      "Đầu tư cho con học Sata Robo là quyết định đúng đắn nhất 2024 của gia đình tôi.",
    authorName: "Chị Bích Ngọc",
    authorRole: "Phụ huynh lớp 6",
    rating: 5,
  },
];

const orgJsonLd = organizationJsonLd();
const siteJsonLd = websiteJsonLd();

export default async function HomePage() {
  const [courses, posts] = await Promise.all([
    db.course
      .findMany({
        where: { isPublished: true },
        orderBy: { displayOrder: "asc" },
        take: 2,
      })
      .catch(() => []),
    db.blogPost
      .findMany({
        where: { isPublished: true },
        orderBy: { publishedAt: "desc" },
        take: 3,
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          coverImage: true,
          publishedAt: true,
          readingTime: true,
          category: true,
          author: { select: { name: true } },
        },
      })
      .catch(() => []),
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
      />

      {/* ─── Section 1: Hero SUNRISE ──────────────────────────────────── */}
      <HeroParticles
        theme="sunrise"
        eyebrow="ROBOTICS & STEM K-12"
        title="Nuôi dưỡng thế hệ kỹ sư tương lai"
        subtitle="Hơn 2,000 học viên tin tưởng Sata Robo qua 6 năm xây dựng nền tảng giáo dục công nghệ tại Đà Nẵng"
        trustIndicators={[
          { text: "4 cơ sở Đà Nẵng" },
          { text: "24 giải RoboSim 2026" },
          { text: "2,000+ học viên" },
        ]}
        effects={{ particles: true, sparkles: true, glowOrbs: true, gridLines: true }}
      >
        <CTAPrimary href="/lien-he" size="lg" magnetic>
          Đăng ký tư vấn
        </CTAPrimary>
        <CTASecondary href="/khoa-hoc" size="lg">
          Xem khoá học
        </CTASecondary>
      </HeroParticles>

      {/* ─── Section 2: Products SOFT-WARM (2 large cards) ───────────── */}
      <SectionBase
        theme="soft-warm"
        eyebrow="🧡 KHOÁ HỌC"
        title="2 khoá học chủ lực Sata Robo"
        subtitle="Lập trình Robot offline cho mọi học sinh K-9 — Luyện thi RoboSim online cho học sinh muốn thi đấu"
        glowOrb={{ color: "orange", position: "bottom-right" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {courses.length > 0 ? (
            courses.map((c) => (
              <CourseCard
                key={c.id}
                size="large"
                badge={c.code ?? undefined}
                title={c.name}
                description={c.shortDescription ?? c.description?.slice(0, 200) ?? ""}
                href={`/khoa-hoc/${c.slug}`}
                price={c.priceDisplay ?? undefined}
                duration={c.durationDisplay ?? undefined}
                studentCount={c.studentCount > 0 ? c.studentCount : undefined}
              />
            ))
          ) : (
            <p className="col-span-full text-center text-neutral-500">
              Đang tải khoá học...
            </p>
          )}
        </div>
      </SectionBase>

      {/* ─── Section 3: Why Sata Robo WHITE ──────────────────────────── */}
      <SectionBase theme="white" eyebrow="ƯU THẾ" title="Tại sao chọn Sata Robo">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {FEATURES.map((f) => (
            <div key={f.title} className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-50 text-orange-500 mb-4">
                <f.icon className="w-7 h-7" />
              </div>
              <h3 className={`${tokens.typography.heading.h5} mb-2`}>{f.title}</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </SectionBase>

      {/* ─── Section 4: Stats NEUTRAL ────────────────────────────────── */}
      <SectionStats
        eyebrow="THÀNH TỰU"
        title="Sata Robo qua 6 năm"
        stats={[
          { value: 2000, suffix: "+", label: "Học viên" },
          { value: 4, label: "Cơ sở Đà Nẵng" },
          { value: 24, label: "Giải RoboSim 2026" },
          { value: 6, suffix: "+", label: "Năm xây dựng" },
        ]}
      />

      {/* ─── Section 5: Testimonials SOFT-COOL marquee ──────────────── */}
      <SectionBase
        theme="soft-cool"
        eyebrow="💜 PHỤ HUYNH NÓI GÌ"
        title="Tin cậy từ 2,000+ gia đình"
        glowOrb={{ color: "purple", position: "top-left" }}
      >
        <Marquee pauseOnHover style={{ ["--duration" as string]: "40s" }}>
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="mx-3 w-[340px] shrink-0">
              <TestimonialCard {...t} />
            </div>
          ))}
        </Marquee>
      </SectionBase>

      {/* ─── Section 6: Latest news WHITE ────────────────────────────── */}
      {posts.length > 0 && (
        <SectionBase theme="white" eyebrow="TIN TỨC" title="Cập nhật mới nhất">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {posts.map((post) => (
              <BlogCard
                key={post.id}
                title={post.title}
                excerpt={post.excerpt ?? ""}
                coverImageUrl={post.coverImage ?? undefined}
                href={`/tin-tuc/${post.slug}`}
                publishedAt={post.publishedAt ?? undefined}
                readingTimeMin={post.readingTime ?? undefined}
                authorName={post.author?.name ?? undefined}
                category={post.category ?? undefined}
              />
            ))}
          </div>
        </SectionBase>
      )}

      {/* ─── Section 7: Final CTA TWILIGHT ───────────────────────────── */}
      <section
        className={`relative overflow-hidden ${tokens.vibrantBg.ctaFinal} py-20 md:py-28`}
      >
        <Sparkles density="high" colors={["orange", "purple"]} />
        <GlowOrb color="orange" position="bottom-left" size="xl" />
        <GlowOrb color="purple" position="top-right" size="xl" />

        <div className="container max-w-4xl mx-auto px-4 text-center relative z-10">
          <h2 className={`${tokens.typography.display.h2} mb-4`}>
            Sẵn sàng bắt đầu hành trình?
          </h2>
          <p className={`${tokens.typography.body.lg} text-neutral-600 mb-8 max-w-2xl mx-auto`}>
            Đăng ký tư vấn miễn phí 1-1 với chuyên gia Sata Robo về lộ trình phù hợp với con bạn
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <CTAPrimary href="/lien-he" size="lg" magnetic>
              Đăng ký tư vấn miễn phí
            </CTAPrimary>
            <CTASecondary href="tel:0818823720" size="lg">
              Gọi điện ngay
            </CTASecondary>
          </div>
          <p className="text-sm text-neutral-500 mt-6">
            ✓ Không cam kết · ✓ 1-1 với chuyên gia · ✓ Phản hồi trong 24h
          </p>
        </div>
      </section>
    </>
  );
}
