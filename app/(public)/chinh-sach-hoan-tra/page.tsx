import type { Metadata } from "next";
import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";
import { breadcrumbJsonLd, jsonLdScript } from '@/lib/seo/jsonld';
import { HeroMinimal } from "@/components/design-system/heroes/hero-minimal";
import { SectionBase } from "@/components/design-system/sections/section-base";
import { tokens } from "@/lib/design-tokens";

export const metadata: Metadata = {
  title: "Chính sách Hoàn trả Học phí",
  description:
    "Chính sách hoàn trả học phí và học cụ của Sata Robo — điều kiện, mức hoàn trả và quy trình yêu cầu.",
  alternates: { canonical: "https://satarobo.vn/chinh-sach-hoan-tra" },
  openGraph: {
    title: "Chính sách Hoàn trả Học phí | Sata Robo",
    description: "Điều kiện, mức hoàn trả và quy trình yêu cầu hoàn học phí.",
    url: "https://satarobo.vn/chinh-sach-hoan-tra",
    siteName: "Sata Robo",
  },
  robots: { index: true, follow: true },
};

const breadcrumb = breadcrumbJsonLd([
  { name: "Trang chủ", url: "/" },
  { name: "Chính sách Hoàn trả", url: "/chinh-sach-hoan-tra" },
]);

export default async function ChinhSachHoanTraPage() {
  const filePath = path.join(process.cwd(), "content", "legal", "chinh-sach-hoan-tra.md");
  const content = await fs.readFile(filePath, "utf-8");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }}
      />

      <div className="bg-white border-b border-neutral-200 py-3">
        <div className={tokens.spacing.container}>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-neutral-500">
            <Link href="/" className="hover:text-orange-600 transition-colors">Trang chủ</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-neutral-800 font-medium">Chính sách Hoàn trả</span>
          </nav>
        </div>
      </div>

      <HeroMinimal
        eyebrow="PHÁP LÝ"
        title="Chính sách Hoàn trả Học phí"
        subtitle="Điều kiện và quy trình hoàn trả tại Sata Robo"
      />

      <SectionBase theme="white" variant="narrow">
        <article className="prose prose-lg max-w-none">
          <MarkdownRenderer content={content} />
        </article>
      </SectionBase>
    </>
  );
}
