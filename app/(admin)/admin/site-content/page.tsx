import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { SiteContentClient } from "./client";

export const metadata = { title: "Hình ảnh & nội dung trang | Admin" };

// 10 page slugs hỗ trợ override hero image + title + subtitle.
// Dùng existing SitePageContent key-value pattern (pageKey, contentKey, contentValue).
const PAGES = [
  { pageKey: "home", label: "Trang chủ" },
  { pageKey: "khoa-hoc", label: "Khoá học (overview)" },
  { pageKey: "khoa-hoc/sp1", label: "SP1 — Robosim Master" },
  { pageKey: "khoa-hoc/sp2", label: "SP2 — Offline Class" },
  { pageKey: "khoa-hoc/sp3", label: "SP3 — Sata Inno School" },
  { pageKey: "khoa-hoc/sp4", label: "SP4 — SATAGO" },
  { pageKey: "ve-chung-toi", label: "Về chúng tôi" },
  { pageKey: "tuyen-dung", label: "Tuyển dụng" },
  { pageKey: "lien-he", label: "Liên hệ" },
  { pageKey: "hoc-cu", label: "Học cụ" },
];

const FIELDS = [
  { key: "hero-image-url", label: "URL ảnh hero", type: "avatar" as const },
  { key: "hero-title", label: "Tiêu đề hero", type: "text" as const },
  { key: "hero-subtitle", label: "Phụ đề hero", type: "textarea" as const },
];

export default async function SiteContentPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "honors:settings")) {
    redirect("/admin/dashboard");
  }

  // Load tất cả site content cho 10 pages
  const allContent = await db.sitePageContent.findMany({
    where: { pageKey: { in: PAGES.map((p) => p.pageKey) } },
  });

  // Build map: pageKey → { contentKey: contentValue }
  const contentMap: Record<string, Record<string, string>> = {};
  for (const page of PAGES) {
    contentMap[page.pageKey] = {};
  }
  for (const row of allContent) {
    if (contentMap[row.pageKey]) {
      contentMap[row.pageKey][row.contentKey] = row.contentValue;
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Hình ảnh & nội dung trang</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Override hero image + title + subtitle cho từng public page. Để trống ô = fallback về Unsplash mặc định (
          <code className="text-xs">lib/page-images.ts</code>).
        </p>
      </div>

      <SiteContentClient pages={PAGES} fields={FIELDS} initialContent={contentMap} />
    </div>
  );
}
