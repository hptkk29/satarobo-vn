import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Phone, Mail, MapPin, Clock } from "lucide-react";
import { db } from "@/lib/db";
import {
  contactPageJsonLd,
  localBusinessJsonLd,
  breadcrumbJsonLd,
} from "@/lib/seo/jsonld";
import { ContactForm } from "./_components/contact-form";
import { CentersGrid } from "./_components/centers-grid";
import { SocialLinks } from "./_components/social-links";
import { SectionBase } from "@/components/design-system/sections/section-base";
import { CTAPrimary } from "@/components/design-system/ctas/cta-primary";
import { GlowOrb } from "@/components/design-system/effects/glow-orb";
import { pageImages } from "@/lib/page-images";
import { tokens } from "@/lib/design-tokens";

const BASE_URL = "https://satarobo.vn";

export const metadata: Metadata = {
  title: "Liên hệ — Sata Robo Đà Nẵng",
  description:
    "Liên hệ Sata Robo — Hotline 0818.823.720, email satarobo@gmail.com. 4 cơ sở tại Đà Nẵng.",
  alternates: { canonical: `${BASE_URL}/lien-he` },
  openGraph: {
    title: "Liên hệ — Sata Robo",
    description: "Hotline 0818.823.720 — phản hồi 30 phút giờ hành chính.",
    url: `${BASE_URL}/lien-he`,
    siteName: "Sata Robo",
    images: [{ url: pageImages.contact.src, width: 1600, height: 900 }],
  },
};

const QUICK_INFO = [
  { icon: Phone, label: "Hotline", value: "0818 823 720", href: "tel:0818823720" },
  { icon: Mail, label: "Email", value: "satarobo@gmail.com", href: "mailto:satarobo@gmail.com" },
  {
    icon: MapPin,
    label: "Trụ sở",
    value: "258 Lê Thanh Nghị, Hòa Cường, Đà Nẵng",
    href: "https://maps.google.com/?q=258+Le+Thanh+Nghi+Da+Nang",
  },
  { icon: Clock, label: "Giờ làm việc", value: "T2-T7: 8:00-17:30" },
];

export default async function ContactPage() {
  const centers = await db.center
    .findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, address: true, phone: true, email: true },
    })
    .catch(() => []);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactPageJsonLd()) }}
      />
      {centers.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(centers.map((c) => localBusinessJsonLd(c))),
          }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Trang chủ", url: "/" },
              { name: "Liên hệ", url: "/lien-he" },
            ]),
          ),
        }}
      />

      <div className="bg-white border-b border-neutral-200 py-3">
        <div className={tokens.spacing.container}>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-neutral-500">
            <Link href="/" className="hover:text-orange-600 transition-colors">Trang chủ</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-neutral-800 font-medium">Liên hệ</span>
          </nav>
        </div>
      </div>

      {/* ─── Hero SOFT-WARM ─── */}
      <section className={`relative overflow-hidden ${tokens.vibrantBg.softWarm} py-16 md:py-20`}>
        <GlowOrb color="orange" position="bottom-right" size="lg" />
        <div className="container max-w-6xl mx-auto px-4 grid md:grid-cols-2 gap-12 items-center relative z-10">
          <div>
            <p className={`${tokens.typography.eyebrow} mb-3`}>LIÊN HỆ</p>
            <h1 className={`${tokens.typography.display.h2} mb-4`}>
              Liên hệ Sata Robo
            </h1>
            <p className={`${tokens.typography.body.lg} text-neutral-600 mb-6`}>
              Chúng tôi sẵn sàng tư vấn 1-1 miễn phí về lộ trình học Robotics phù hợp với con bạn — phản hồi trong 30 phút giờ hành chính
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <CTAPrimary href="tel:0818823720" magnetic>
                <Phone className="w-4 h-4" />
                <span>Gọi ngay 0818 823 720</span>
              </CTAPrimary>
            </div>
          </div>
          <div className="relative aspect-video rounded-2xl overflow-hidden shadow-xl">
            <Image
              src={pageImages.contact.src}
              alt={pageImages.contact.alt}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
          </div>
        </div>
      </section>

      {/* ─── Quick info WHITE ─── */}
      <SectionBase theme="white" eyebrow="THÔNG TIN NHANH" title="Cách liên hệ Sata Robo">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {QUICK_INFO.map((info) => {
            const content = (
              <div className="bg-white p-6 rounded-2xl border border-neutral-200 hover:border-orange-300 hover:shadow-md transition-all h-full">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-orange-50 text-orange-500 mb-4">
                  <info.icon className="w-6 h-6" />
                </div>
                <p className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-1">
                  {info.label}
                </p>
                <p className="font-semibold text-neutral-900">{info.value}</p>
              </div>
            );
            return info.href ? (
              <a key={info.label} href={info.href} target={info.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
                {content}
              </a>
            ) : (
              <div key={info.label}>{content}</div>
            );
          })}
        </div>
      </SectionBase>

      {/* ─── Form section SOFT-WARM ─── */}
      <SectionBase
        theme="soft-warm"
        eyebrow="🧡 ĐĂNG KÝ TƯ VẤN"
        title="Gửi thông tin — chúng tôi liên hệ ngay"
        subtitle="Phản hồi trong 30 phút giờ hành chính · 24h ngoài giờ"
        variant="narrow"
        glowOrb={{ color: "orange", position: "top-left" }}
      >
        <ContactForm />
      </SectionBase>

      {/* ─── Centers grid SOFT-COOL ─── */}
      {centers.length > 0 && (
        <SectionBase
          theme="soft-cool"
          eyebrow="💜 4 CƠ SỞ"
          title="Tìm cơ sở gần nhà"
          glowOrb={{ color: "purple", position: "bottom-right" }}
        >
          <CentersGrid centers={centers} />
        </SectionBase>
      )}

      {/* ─── Social WHITE ─── */}
      <SectionBase theme="white" eyebrow="KẾT NỐI" title="Theo dõi Sata Robo" variant="narrow">
        <SocialLinks />
      </SectionBase>
    </>
  );
}
