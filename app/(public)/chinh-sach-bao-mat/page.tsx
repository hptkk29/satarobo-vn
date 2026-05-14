import type { Metadata } from "next";
import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { HeroMinimal } from "@/components/design-system/heroes/hero-minimal";
import { SectionBase } from "@/components/design-system/sections/section-base";
import { tokens } from "@/lib/design-tokens";

export const metadata: Metadata = {
  title: "Chính sách Bảo mật",
  description:
    "Chính sách bảo mật thông tin của Sata Robo — cách chúng tôi thu thập, sử dụng và bảo vệ dữ liệu cá nhân theo NĐ 13/2023/NĐ-CP.",
  alternates: { canonical: "https://satarobo.vn/chinh-sach-bao-mat" },
  openGraph: {
    title: "Chính sách Bảo mật | Sata Robo",
    description: "Cách Sata Robo thu thập, sử dụng và bảo vệ dữ liệu cá nhân của bạn.",
    url: "https://satarobo.vn/chinh-sach-bao-mat",
    siteName: "Sata Robo",
  },
  robots: { index: true, follow: true },
};

const breadcrumb = breadcrumbJsonLd([
  { name: "Trang chủ", url: "/" },
  { name: "Chính sách Bảo mật", url: "/chinh-sach-bao-mat" },
]);

export default async function ChinhSachBaoMatPage() {
  const filePath = path.join(process.cwd(), "content", "legal", "chinh-sach-bao-mat.md");
  const content = await fs.readFile(filePath, "utf-8");

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
            <span className="text-neutral-800 font-medium">Chính sách Bảo mật</span>
          </nav>
        </div>
      </div>

      <HeroMinimal
        eyebrow="PHÁP LÝ"
        title="Chính sách Bảo mật"
        subtitle="Theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân"
      />

      <SectionBase theme="white" variant="narrow">
        <article className="prose prose-lg max-w-none">
          <MarkdownRenderer content={content} />
        </article>
      </SectionBase>
    </>
  );
}
