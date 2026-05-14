import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, MessageCircle } from "lucide-react";
import { itemListJsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { PRODUCTS } from "@/lib/data/products";
import { ProductsSection } from "./_components/products-section";
import { SectionBase } from "@/components/design-system/sections/section-base";
import { CTAPrimary } from "@/components/design-system/ctas/cta-primary";
import { CTASecondary } from "@/components/design-system/ctas/cta-secondary";
import { GlowOrb } from "@/components/design-system/effects/glow-orb";
import { Sparkles } from "@/components/design-system/effects/sparkles";
import { pageImages } from "@/lib/page-images";
import { tokens } from "@/lib/design-tokens";

const BASE_URL = "https://satarobo.vn";

export const metadata: Metadata = {
  title: "Học cụ Robotics chính hãng — Sata Robo",
  description:
    "Bộ học cụ Robotics chính hãng Sata Robo — thiết kế riêng cho từng độ tuổi, đồng bộ với chương trình giảng dạy.",
  alternates: { canonical: `${BASE_URL}/hoc-cu` },
  openGraph: {
    title: "Học cụ Robotics chính hãng — Sata Robo",
    description: "8 bộ học cụ Robotics thiết kế riêng cho từng độ tuổi.",
    url: `${BASE_URL}/hoc-cu`,
    siteName: "Sata Robo",
    images: [{ url: pageImages.hocCu.src, width: 1600, height: 900 }],
  },
};

export default function HocCuPage() {
  const productListItems = PRODUCTS.map((p, i) => ({
    position: i + 1,
    name: p.name,
    url: `${BASE_URL}/hoc-cu#${p.slug}`,
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd(productListItems)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Trang chủ", url: "/" },
              { name: "Học cụ", url: "/hoc-cu" },
            ]),
          ),
        }}
      />

      <div className="bg-white border-b border-neutral-200 py-3">
        <div className={tokens.spacing.container}>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-neutral-500">
            <Link href="/" className="hover:text-orange-600 transition-colors">Trang chủ</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-neutral-800 font-medium">Học cụ</span>
          </nav>
        </div>
      </div>

      {/* ─── Hero ─── */}
      <section className={`relative overflow-hidden ${tokens.vibrantBg.softWarm} py-16 md:py-20`}>
        <GlowOrb color="orange" position="top-right" size="lg" />
        <div className="container max-w-6xl mx-auto px-4 grid md:grid-cols-2 gap-12 items-center relative z-10">
          <div>
            <p className={`${tokens.typography.eyebrow} mb-3`}>HỌC CỤ</p>
            <h1 className={`${tokens.typography.display.h2} mb-4`}>
              Robotics Kit chính hãng
            </h1>
            <p className={`${tokens.typography.body.lg} text-neutral-600 mb-6`}>
              8 bộ học cụ thiết kế riêng cho từng độ tuổi — đồng bộ với chương trình Sata Robo. Hỗ trợ phụ huynh trang bị cho con học tại nhà.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <CTAPrimary href="https://zalo.me/0818823720" target="_blank">
                <MessageCircle className="w-4 h-4" />
                <span>Tư vấn qua Zalo</span>
              </CTAPrimary>
              <CTASecondary href="/lien-he">Liên hệ Sata Robo</CTASecondary>
            </div>
          </div>
          <div className="relative aspect-video rounded-2xl overflow-hidden shadow-xl">
            <Image
              src={pageImages.hocCu.src}
              alt={pageImages.hocCu.alt}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
          </div>
        </div>
      </section>

      {/* ─── Products grid (giữ existing _components/products-section) ─── */}
      <SectionBase theme="white" eyebrow="DANH MỤC" title="8 sản phẩm chủ lực">
        <ProductsSection />
      </SectionBase>

      {/* ─── Zalo CTA TWILIGHT ─── */}
      <section
        className={`relative overflow-hidden ${tokens.vibrantBg.ctaFinal} py-16`}
      >
        <Sparkles density="medium" colors={["orange", "purple"]} />
        <GlowOrb color="orange" position="bottom-left" size="xl" />
        <GlowOrb color="purple" position="top-right" size="xl" />
        <div className="container max-w-3xl mx-auto px-4 text-center relative z-10">
          <h2 className={`${tokens.typography.display.h2} mb-4`}>
            Cần tư vấn chọn kit phù hợp?
          </h2>
          <p className={`${tokens.typography.body.lg} text-neutral-600 mb-8`}>
            Chat Zalo trực tiếp với chuyên gia — tư vấn 1-1 miễn phí về sản phẩm phù hợp lứa tuổi của con
          </p>
          <CTAPrimary
            href="https://zalo.me/0818823720"
            target="_blank"
            size="lg"
            magnetic
          >
            <MessageCircle className="w-5 h-5" />
            <span>Chat Zalo ngay</span>
          </CTAPrimary>
        </div>
      </section>
    </>
  );
}
