import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Lightbulb, Users, Shield, Target, Compass, Rocket, Sparkles as SparklesIcon } from "lucide-react";
import { aboutPageJsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { HeroParticles } from "@/components/design-system/heroes/hero-particles";
import { SectionBase } from "@/components/design-system/sections/section-base";
import { Sparkles } from "@/components/design-system/effects/sparkles";
import { GlowOrb } from "@/components/design-system/effects/glow-orb";
import { CTAPrimary } from "@/components/design-system/ctas/cta-primary";
import { CTASecondary } from "@/components/design-system/ctas/cta-secondary";
import { tokens } from "@/lib/design-tokens";

const BASE_URL = "https://satarobo.vn";

export const metadata: Metadata = {
  title: "Câu chuyện thương hiệu Sata Robo | Tầm nhìn, Sứ mệnh, Giá trị cốt lõi",
  description:
    "Sata Robo — Khơi nguồn sáng tạo, chắp cánh tương lai. Học viện Robotics & STEM giáo dục hàng đầu Đà Nẵng.",
  alternates: { canonical: `${BASE_URL}/ve-chung-toi` },
  openGraph: {
    title: "Câu chuyện thương hiệu Sata Robo",
    description: "Khơi nguồn sáng tạo – Chắp cánh tương lai",
    url: `${BASE_URL}/ve-chung-toi`,
    siteName: "Sata Robo",
  },
};

const coreValues = [
  {
    icon: Lightbulb,
    title: "Sáng tạo",
    titleEn: "Innovation",
    description: "Không ngừng đổi mới phương pháp giáo dục và công nghệ học tập.",
    gradient: "from-orange-50 to-amber-50",
    borderColor: "border-orange-200",
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
  },
  {
    icon: Users,
    title: "Gắn kết",
    titleEn: "Connection",
    description:
      "Xây dựng mối quan hệ bền chặt giữa học sinh, phụ huynh, giáo viên, đơn vị và đối tác giáo dục.",
    gradient: "from-purple-50 to-violet-50",
    borderColor: "border-purple-200",
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
  },
  {
    icon: Shield,
    title: "Chính trực",
    titleEn: "Integrity",
    description: "Cam kết minh bạch và trung thực trong mọi hoạt động.",
    gradient: "from-green-50 to-emerald-50",
    borderColor: "border-green-200",
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
  },
  {
    icon: Target,
    title: "Kỷ luật",
    titleEn: "Discipline",
    description: "Rèn luyện tính tự giác và kiên trì trong học tập và làm việc.",
    gradient: "from-blue-50 to-sky-50",
    borderColor: "border-blue-200",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
  },
];

export default function VeChungToiPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Trang chủ", url: "/" },
    { name: "Về chúng tôi", url: "/ve-chung-toi" },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutPageJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />

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
            <span className="text-neutral-800 font-medium">Về chúng tôi</span>
          </nav>
        </div>
      </div>

      {/* HERO - TWILIGHT */}
      <HeroParticles
        theme="twilight"
        eyebrow="VỀ CHÚNG TÔI"
        title="Câu chuyện thương hiệu Sata Robo"
        subtitle="Khơi nguồn sáng tạo – Chắp cánh tương lai"
        effects={{ particles: true, sparkles: true, glowOrbs: true, gridLines: false }}
      >
        <CTAPrimary href="/khoa-hoc" size="lg" magnetic>
          Khám phá khoá học
        </CTAPrimary>
        <CTASecondary href="/lien-he" size="lg">
          Liên hệ tư vấn
        </CTASecondary>
      </HeroParticles>

      {/* SECTION 1 - CÂU CHUYỆN */}
      <SectionBase
        theme="white"
        eyebrow="💜 CÂU CHUYỆN CỦA CHÚNG TÔI"
        title="Hành trình khơi mầm sáng tạo cho thế hệ trẻ Việt Nam"
      >
        <div className="max-w-3xl mx-auto space-y-6">
          <p className="text-lg text-neutral-700 leading-relaxed">
            Chúng tôi tin rằng trong mỗi đứa trẻ đều có một{" "}
            <strong className="text-purple-700">tiềm năng vô hạn</strong>, chỉ
            chờ được khơi dậy bằng tri thức và trải nghiệm thực tế. Thực tế hiện
            nay, nhiều em vẫn phải học trong khuôn khổ lý thuyết khô khan, thiếu
            môi trường thực hành, thiếu những sân chơi để tự tin cọ xát cùng bạn
            bè quốc tế. Chính khoảng trống ấy khiến tư duy sáng tạo và niềm đam
            mê công nghệ chưa được nuôi dưỡng trọn vẹn.
          </p>
          <p className="text-lg text-neutral-700 leading-relaxed">
            <strong className="text-orange-600">
              Sata Robo ra đời để lấp đầy khoảng trống đó.
            </strong>{" "}
            Chúng tôi mang đến các chương trình học Robotics và công nghệ sinh
            động, gắn liền với thực tiễn, cùng những cuộc thi từ cấp trường đến
            quốc tế. Đây không chỉ là sân chơi bổ ích mà còn là hành trình để
            học sinh rèn luyện tư duy logic, khả năng sáng tạo, tinh thần hợp
            tác và bản lĩnh hội nhập – phù hợp với định hướng STEM mà Nhà nước
            khuyến khích.
          </p>
          <p className="text-lg text-neutral-700 leading-relaxed">
            Chúng tôi tin rằng khi gieo những hạt mầm trải nghiệm hôm nay, ngày
            mai sẽ{" "}
            <strong className="text-purple-700">
              nảy nở một thế hệ trẻ vững vàng hơn, sáng tạo hơn và nhân văn hơn.
            </strong>
          </p>
          <div className="text-center pt-6">
            <div className="inline-flex items-center gap-3 bg-gradient-to-r from-orange-50 to-purple-50 border border-orange-200 rounded-full px-6 py-3 shadow-sm">
              <span className="text-2xl" aria-hidden="true">
                👉
              </span>
              <p className="text-neutral-800 font-semibold">
                Hãy đồng hành cùng chúng tôi để phát triển tư duy cho thế hệ trẻ
                Việt Nam!
              </p>
            </div>
          </div>
        </div>
      </SectionBase>

      {/* SECTION 2 - TẦM NHÌN */}
      <SectionBase
        theme="soft-cool"
        eyebrow="🎯 TẦM NHÌN"
        title="Tầm nhìn của chúng tôi"
        glowOrb={{ color: "purple", position: "top-right" }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="relative bg-white rounded-3xl border-2 border-purple-200 shadow-xl overflow-hidden">
            <div className="h-2 bg-gradient-to-r from-purple-500 to-violet-500" />
            <div className="p-8 md:p-12">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center">
                  <Compass className="w-7 h-7 text-purple-600" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-purple-600 mb-1">
                    Vision
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-neutral-900">
                    Tầm nhìn
                  </h3>
                </div>
              </div>
              <blockquote className="border-l-4 border-purple-400 pl-6 py-2 mb-6">
                <p className="text-xl md:text-2xl text-neutral-800 italic leading-relaxed font-medium">
                  &ldquo;Trở thành đơn vị tiên phong trong lĩnh vực{" "}
                  <span className="text-purple-700 font-bold">Robotics giáo dục</span>
                  , kiến tạo sân chơi quốc tế và nuôi dưỡng thế hệ trẻ Việt Nam
                  trở thành{" "}
                  <span className="text-purple-700 font-bold">công dân toàn cầu</span>{" "}
                  sáng tạo, nhân văn và tự tin hội nhập.&rdquo;
                </p>
              </blockquote>
              <div className="bg-purple-50 rounded-xl p-5 border border-purple-100">
                <p className="text-sm text-neutral-700 leading-relaxed">
                  <strong className="text-purple-700">Ý nghĩa:</strong> Không
                  chỉ dừng lại ở đào tạo Robotics, mà còn hướng tới xây dựng thế
                  hệ trẻ tự tin, sáng tạo, gắn với sứ mệnh giáo dục quốc gia và
                  tầm nhìn toàn cầu.
                </p>
              </div>
            </div>
          </div>
        </div>
      </SectionBase>

      {/* SECTION 3 - SỨ MỆNH */}
      <SectionBase
        theme="soft-warm"
        eyebrow="🚀 SỨ MỆNH"
        title="Sứ mệnh của Sata Robo"
        glowOrb={{ color: "orange", position: "bottom-left" }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="relative bg-white rounded-3xl border-2 border-orange-200 shadow-xl overflow-hidden">
            <div className="h-2 bg-gradient-to-r from-orange-500 to-amber-400" />
            <div className="p-8 md:p-12">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center">
                  <Rocket className="w-7 h-7 text-orange-600" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-1">
                    Mission
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-neutral-900">
                    Sứ mệnh
                  </h3>
                </div>
              </div>
              <blockquote className="border-l-4 border-orange-400 pl-6 py-2 mb-6">
                <p className="text-xl md:text-2xl text-neutral-800 italic leading-relaxed font-medium">
                  &ldquo;Mang đến các giải pháp{" "}
                  <span className="text-orange-600 font-bold">
                    học tập, trải nghiệm và thi đấu Robotics
                  </span>{" "}
                  hiện đại, gắn liền với thực tiễn, nhằm phát triển tư duy, khơi
                  gợi đam mê sáng tạo, và xây dựng{" "}
                  <span className="text-orange-600 font-bold">
                    thế hệ trẻ có trí tuệ, kỹ năng và bản lĩnh hội nhập quốc tế.
                  </span>
                  &rdquo;
                </p>
              </blockquote>
              <div className="bg-orange-50 rounded-xl p-5 border border-orange-100">
                <p className="text-sm text-neutral-700 leading-relaxed">
                  <strong className="text-orange-600">Ý nghĩa:</strong> Nhấn
                  mạnh giải pháp toàn diện:{" "}
                  <strong>học – trải nghiệm – thi đấu</strong>; đồng thời gắn
                  với giá trị tư duy, sáng tạo và hội nhập.
                </p>
              </div>
            </div>
          </div>
        </div>
      </SectionBase>

      {/* SECTION 4 - 4 GIÁ TRỊ CỐT LÕI */}
      <SectionBase
        theme="white"
        eyebrow="💎 GIÁ TRỊ CỐT LÕI"
        title="4 giá trị định hình Sata Robo"
        subtitle="Mỗi quyết định, mỗi hành động của chúng tôi đều xuất phát từ 4 giá trị cốt lõi này"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {coreValues.map((value, index) => {
            const Icon = value.icon;
            return (
              <div
                key={value.title}
                className={`group relative bg-gradient-to-br ${value.gradient} rounded-2xl border-2 ${value.borderColor} p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300`}
              >
                <div className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full border-2 border-neutral-200 flex items-center justify-center text-xs font-black text-neutral-700 shadow-sm">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className={`w-14 h-14 rounded-2xl ${value.iconBg} flex items-center justify-center mb-4`}>
                  <Icon className={`w-7 h-7 ${value.iconColor}`} />
                </div>
                <h3 className="text-xl font-bold text-neutral-900 mb-1">
                  {value.title}
                </h3>
                <div
                  className={`text-xs uppercase tracking-wider font-semibold ${value.iconColor} mb-3`}
                >
                  {value.titleEn}
                </div>
                <p className="text-sm text-neutral-700 leading-relaxed">
                  {value.description}
                </p>
              </div>
            );
          })}
        </div>
      </SectionBase>

      {/* SECTION 5 - SLOGAN BANNER */}
      <section className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-white to-purple-50 py-20 md:py-28">
        <Sparkles density="high" colors={["orange", "purple"]} />
        <GlowOrb color="orange" position="top-left" size="xl" />
        <GlowOrb color="purple" position="bottom-right" size="xl" />

        <div className="container max-w-5xl mx-auto px-4 text-center relative z-10">
          <div className="inline-flex items-center gap-2 mb-6 bg-white/80 backdrop-blur border border-purple-200 rounded-full px-5 py-2 shadow-sm">
            <SparklesIcon className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700">
              Slogan
            </span>
          </div>
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-black mb-6 leading-tight">
            <span className="bg-gradient-to-r from-orange-500 to-purple-600 bg-clip-text text-transparent">
              &ldquo;Khơi nguồn sáng tạo
            </span>
            <br />
            <span className="bg-gradient-to-r from-purple-600 to-orange-500 bg-clip-text text-transparent">
              – Chắp cánh tương lai&rdquo;
            </span>
          </h2>
          <p className="text-lg md:text-xl text-neutral-600 mb-10 max-w-3xl mx-auto leading-relaxed">
            Đồng hành cùng Sata Robo trên hành trình nuôi dưỡng tư duy sáng tạo
            và đam mê công nghệ cho thế hệ trẻ Việt Nam.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <CTAPrimary href="/khoa-hoc" size="lg" magnetic>
              Khám phá khoá học
            </CTAPrimary>
            <CTASecondary href="/lien-he" size="lg">
              Đặt lịch tư vấn miễn phí
            </CTASecondary>
          </div>
        </div>
      </section>
    </>
  );
}
