import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { formatDate } from '@/lib/blog-utils'

interface RelatedPost {
  slug: string
  title: string
  coverImage: string | null
  publishedAt: Date | null
  readingTime: number | null
}

interface RelatedPostsProps {
  posts: RelatedPost[]
}

export function RelatedPosts({ posts }: RelatedPostsProps) {
  if (posts.length === 0) return null

  return (
    <section className="mt-12 pt-10 border-t border-border">
      <h2 className="text-xl font-extrabold text-text-dark mb-6">Bài viết liên quan</h2>
      <div className="grid sm:grid-cols-3 gap-5">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/tin-tuc/${post.slug}`}
            className="group flex gap-4 items-start card-base p-4 hover:-translate-y-0.5 transition-all"
          >
            <div className="relative w-20 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-orange-50 to-purple-50">
              {post.coverImage && (
                <Image
                  src={post.coverImage}
                  alt={post.title}
                  fill
                  className="object-cover"
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-text-dark leading-snug line-clamp-2 group-hover:text-primary-orange transition-colors">
                {post.title}
              </h3>
              {post.publishedAt && (
                <p className="text-xs text-text-muted mt-1">{formatDate(post.publishedAt)}</p>
              )}
            </div>
          </Link>
        ))}
      </div>

      <Link
        href="/tin-tuc"
        className="inline-flex items-center gap-2 mt-6 text-sm font-bold text-primary-orange hover:underline"
      >
        Xem tất cả bài viết
        <ArrowRight className="w-4 h-4" />
      </Link>
    </section>
  )
}
