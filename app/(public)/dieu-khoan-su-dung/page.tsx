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
  title: "Điều khoản Sử dụng",
  description:
    "Điều khoản sử dụng website satarobo.vn — quyền và nghĩa vụ của người dùng khi truy cập dịch vụ Sata Robo.",
  alternates: { canonical: "https://satarobo.vn/dieu-khoan-su-dung" },
  openGraph: {
    title: "Điều khoản Sử dụng | Sata Robo",
    description: "Quyền và nghĩa vụ khi sử dụng website và dịch vụ Sata Robo.",
    url: "https://satarobo.vn/dieu-khoan-su-dung",
    siteName: "Sata Robo",
  },
  robots: { index: true, follow: true },
};

const breadcrumb = breadcrumbJsonLd([
  { name: "Trang chủ", url: "/" },
  { name: "Điều khoản Sử dụng", url: "/dieu-khoan-su-dung" },
]);

export default async function DieuKhoanSuDungPage() {
  const filePath = path.join(process.cwd(), "content", "legal", "dieu-khoan-su-dung.md");
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
            <span className="text-neutral-800 font-medium">Điều khoản Sử dụng</span>
          </nav>
        </div>
      </div>

      <HeroMinimal
        eyebrow="PHÁP LÝ"
        title="Điều khoản Sử dụng"
        subtitle="Quyền và nghĩa vụ khi sử dụng dịch vụ Sata Robo"
      />

      <SectionBase theme="white" variant="narrow">
        <article className="prose prose-lg max-w-none">
          <MarkdownRenderer content={content} />
        </article>
      </SectionBase>
    </>
  );
}
