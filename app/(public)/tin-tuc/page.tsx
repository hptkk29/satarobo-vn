import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { POSTS_PER_PAGE } from '@/lib/blog-utils'
import { BlogCard } from '@/components/blog/blog-card'
import { BlogListHero } from './_components/blog-list-hero'
import { Pagination } from './_components/pagination'

const BASE_URL = 'https://satarobo.vn'

export const metadata: Metadata = {
  title: 'Tin tức & Kiến thức Robotics — Sata Robo',
  description:
    'Cập nhật tin tức mới nhất, bài viết kiến thức Robotics & STEM từ Sata Robo — Hữu ích cho phụ huynh, giáo viên và nhà trường tại Đà Nẵng.',
  alternates: { canonical: `${BASE_URL}/tin-tuc` },
  openGraph: {
    title: 'Tin tức & Kiến thức Robotics — Sata Robo',
    description: 'Cập nhật tin tức mới nhất và bài viết kiến thức Robotics & STEM từ Sata Robo.',
    url: `${BASE_URL}/tin-tuc`,
    siteName: 'Sata Robo',
    locale: 'vi_VN',
    type: 'website',
  },
}

interface BlogListPageProps {
  searchParams: Promise<{ category?: string; q?: string; page?: string }>
}

export default async function BlogListPage({ searchParams }: BlogListPageProps) {
  const { category, q, page: pageStr } = await searchParams
  const currentPage = Math.max(1, parseInt(pageStr ?? '1', 10))
  const skip = (currentPage - 1) * POSTS_PER_PAGE

  const where = {
    isPublished: true,
    ...(category ? { category } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' as const } },
            { excerpt: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [posts, total] = await Promise.all([
    db.blogPost
      .findMany({
        where,
        orderBy: { publishedAt: 'desc' },
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
  ])

  const totalPages = Math.ceil(total / POSTS_PER_PAGE)
  const featuredPost = currentPage === 1 && !q ? posts[0] : null
  const gridPosts = featuredPost ? posts.slice(1) : posts

  const baseHref = `/tin-tuc${category ? `?category=${category}` : ''}${q ? `${category ? '&' : '?'}q=${encodeURIComponent(q)}` : ''}`

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: 'Trang chủ', url: '/' },
              { name: 'Tin tức', url: '/tin-tuc' },
            ])
          ),
        }}
      />

      <BlogListHero activeCategory={category} searchQuery={q} />

      <section className="section-padding bg-white">
        <div className="container-site">
          {posts.length === 0 ? (
            <div className="text-center py-20 text-text-muted">
              <p className="text-lg font-semibold">Chưa có bài viết nào</p>
              <p className="text-sm mt-2">
                {q ? `Không tìm thấy kết quả cho "${q}"` : 'Hãy quay lại sau!'}
              </p>
            </div>
          ) : (
            <>
              {/* Featured post — bài đầu tiên nếu không filter/search */}
              {featuredPost && (
                <div className="mb-10">
                  <BlogCard post={featuredPost} featured />
                </div>
              )}

              {/* Grid */}
              {gridPosts.length > 0 && (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {gridPosts.map((post) => (
                    <BlogCard key={post.slug} post={post} />
                  ))}
                </div>
              )}

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                baseHref={baseHref}
              />
            </>
          )}
        </div>
      </section>
    </>
  )
}
