import Link from 'next/link'
import Image from 'next/image'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'

type Post = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  coverImage: string | null
  publishedAt: Date | null
}

export function LatestPosts({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return (
      <section className="section-padding bg-white" aria-labelledby="blog-heading">
        <div className="container-site text-center">
          <h2 id="blog-heading" className="text-2xl font-black text-text-dark mb-4">
            Tin tức & Góc học thuật
          </h2>
          <p className="text-text-muted">
            Bài viết đang được chuẩn bị — quay lại sớm nhé!
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="section-padding bg-white" aria-labelledby="blog-heading">
      <div className="container-site">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 mb-3">
              <span className="text-primary-orange text-xs font-black uppercase tracking-wider">
                Tin tức mới nhất
              </span>
            </div>
            <h2 id="blog-heading" className="text-2xl sm:text-3xl font-black text-text-dark">
              Góc học thuật & Cập nhật
            </h2>
          </div>
          <Link
            href="/tin-tuc"
            className="hidden sm:inline-flex text-sm font-bold text-primary-orange hover:underline"
          >
            Xem tất cả →
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/tin-tuc/${post.slug}`}
              className="group flex flex-col rounded-3xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition"
            >
              {post.coverImage ? (
                <div className="relative h-48 overflow-hidden bg-gray-100">
                  <Image
                    src={post.coverImage}
                    alt={post.title}
                    fill
                    className="object-cover transition group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
              ) : (
                <div className="h-48 bg-gradient-to-br from-orange-100 to-purple-100 flex items-center justify-center">
                  <span className="text-4xl" aria-hidden="true">📰</span>
                </div>
              )}
              <div className="p-5 flex flex-col flex-1">
                <h3 className="font-bold text-text-dark group-hover:text-primary-orange transition line-clamp-2 mb-2">
                  {post.title}
                </h3>
                {post.excerpt && (
                  <p className="text-sm text-text-muted line-clamp-2 flex-1">{post.excerpt}</p>
                )}
                {post.publishedAt && (
                  <p className="mt-3 text-xs text-text-muted">
                    {formatDistanceToNow(new Date(post.publishedAt), {
                      addSuffix: true,
                      locale: vi,
                    })}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 text-center sm:hidden">
          <Link href="/tin-tuc" className="text-sm font-bold text-primary-orange hover:underline">
            Xem tất cả bài viết →
          </Link>
        </div>
      </div>
    </section>
  )
}
