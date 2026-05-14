import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { POSTS_PER_PAGE } from "@/lib/blog-utils";
import { BlogCard } from "@/components/blog/blog-card";
import { HeroMinimal } from "@/components/design-system/heroes/hero-minimal";
import { SectionBase } from "@/components/design-system/sections/section-base";
import { Pagination } from "./_components/pagination";
import { tokens } from "@/lib/design-tokens";

const BASE_URL = "https://satarobo.vn";

export const metadata: Metadata = {
  title: "Tin tức & Kiến thức Robotics — Sata Robo",
  description:
    "Cập nhật tin tức mới nhất, bài viết kiến thức Robotics & STEM từ Sata Robo — hữu ích cho phụ huynh, giáo viên, nhà trường.",
  alternates: { canonical: `${BASE_URL}/tin-tuc` },
  openGraph: {
    title: "Tin tức & Kiến thức Robotics — Sata Robo",
    description: "Cập nhật tin tức và bài viết kiến thức Robotics & STEM.",
    url: `${BASE_URL}/tin-tuc`,
    siteName: "Sata Robo",
  },
};

interface BlogListPageProps {
  searchParams: Promise<{ category?: string; q?: string; page?: string }>;
}

export default async function BlogListPage({ searchParams }: BlogListPageProps) {
  const { category, q, page: pageStr } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageStr ?? "1", 10));
  const skip = (currentPage - 1) * POSTS_PER_PAGE;

  const where = {
    isPublished: true,
    ...(category ? { category } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { excerpt: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [posts, total] = await Promise.all([
    db.blogPost
      .findMany({
        where,
        orderBy: { publishedAt: "desc" },
        take: POSTS_PER_PAGE,
        skip,
        select: {
          slug: true,
          title: true,
          excerpt: true,
          coverImage: true,
          publishedAt: true,
          category: true,
          readingTime: true,
          author: { select: { name: true } },
        },
      })
      .catch(() => []),
    db.blogPost.count({ where }).catch(() => 0),
  ]);

  const totalPages = Math.ceil(total / POSTS_PER_PAGE);
  const featuredPost = currentPage === 1 && !q ? posts[0] : null;
  const gridPosts = featuredPost ? posts.slice(1) : posts;
  const baseHref = `/tin-tuc${category ? `?category=${category}` : ""}${q ? `${category ? "&" : "?"}q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Trang chủ", url: "/" },
              { name: "Tin tức", url: "/tin-tuc" },
            ]),
          ),
        }}
      />

      <div className="bg-white border-b border-neutral-200 py-3">
        <div className={tokens.spacing.container}>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-neutral-500">
            <Link href="/" className="hover:text-orange-600 transition-colors">Trang chủ</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-neutral-800 font-medium">Tin tức</span>
          </nav>
        </div>
      </div>

      <HeroMinimal
        eyebrow="TIN TỨC"
        title={q ? `Kết quả tìm: "${q}"` : "Cập nhật từ Sata Robo"}
        subtitle="Sự kiện, hoạt động, kiến thức Robotics & STEM cho phụ huynh và nhà trường"
      />

      <SectionBase theme="white">
        {posts.length === 0 ? (
          <div className="text-center py-20 text-neutral-500">
            <p className="text-lg font-semibold">Chưa có bài viết nào</p>
            <p className="text-sm mt-2">
              {q ? `Không tìm thấy kết quả cho "${q}"` : "Hãy quay lại sau!"}
            </p>
          </div>
        ) : (
          <>
            {featuredPost && (
              <div className="mb-10">
                <BlogCard post={featuredPost} featured />
              </div>
            )}

            {gridPosts.length > 0 && (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {gridPosts.map((post) => (
                  <BlogCard key={post.slug} post={post} />
                ))}
              </div>
            )}

            <div className="mt-10">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                baseHref={baseHref}
              />
            </div>
          </>
        )}
      </SectionBase>
    </>
  );
}
