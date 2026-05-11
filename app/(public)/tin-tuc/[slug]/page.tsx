import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Calendar, Clock, User, Tag, ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { db } from '@/lib/db'
import { blogPostingJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { formatDate, CATEGORY_DISPLAY } from '@/lib/blog-utils'
import { MarkdownRenderer } from '@/components/blog/markdown-renderer'
import { RelatedPosts } from '@/components/blog/related-posts'
import { ShareButtons } from '@/components/blog/share-buttons'

const BASE_URL = 'https://satarobo.vn'

export const revalidate = 60

interface Params {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const posts = await db.blogPost
    .findMany({ where: { isPublished: true }, select: { slug: true } })
    .catch(() => [])
  return posts.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const post = await db.blogPost
    .findUnique({ where: { slug }, select: { title: true, seoTitle: true, excerpt: true, seoDesc: true, coverImage: true, ogImage: true, publishedAt: true } })
    .catch(() => null)

  if (!post) return {}

  const title = post.seoTitle ?? post.title
  const description = post.seoDesc ?? post.excerpt ?? ''
  const image = post.ogImage ?? post.coverImage

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/tin-tuc/${slug}`,
      siteName: 'Sata Robo',
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: title }] } : {}),
      locale: 'vi_VN',
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title, description, ...(image ? { images: [image] } : {}) },
    alternates: { canonical: `${BASE_URL}/tin-tuc/${slug}` },
  }
}

export default async function BlogDetailPage({ params }: Params) {
  const { slug } = await params

  const post = await db.blogPost
    .findUnique({
      where: { slug, isPublished: true },
      include: { author: { select: { name: true, image: true } } },
    })
    .catch(() => null)

  if (!post) notFound()

  // Related posts — cùng category, trừ bài hiện tại
  const related = await db.blogPost
    .findMany({
      where: {
        isPublished: true,
        category: post.category ?? undefined,
        slug: { not: slug },
      },
      orderBy: { publishedAt: 'desc' },
      take: 3,
      select: { slug: true, title: true, coverImage: true, publishedAt: true, readingTime: true },
    })
    .catch(() => [])

  const catLabel = post.category ? CATEGORY_DISPLAY[post.category] : null
  const postUrl = `${BASE_URL}/tin-tuc/${slug}`

  // Fire-and-forget view count increment (không block page render)
  db.blogPost
    .update({ where: { slug }, data: { viewCount: { increment: 1 } } })
    .catch(() => {})

  return (
    <>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(blogPostingJsonLd({ ...post, author: post.author ?? { name: 'Sata Robo' } })),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: 'Trang chủ', url: '/' },
              { name: 'Tin tức', url: '/tin-tuc' },
              ...(post.category && catLabel
                ? [{ name: catLabel, url: `/tin-tuc?category=${post.category}` }]
                : []),
              { name: post.title, url: `/tin-tuc/${slug}` },
            ])
          ),
        }}
      />

      <div className="container-site py-10 max-w-3xl mx-auto">
        {/* Back */}
        <Link
          href="/tin-tuc"
          className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-primary-orange transition mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại tin tức
        </Link>

        {/* Category */}
        {catLabel && (
          <Link href={`/tin-tuc?category=${post.category}`}>
            <Badge className="bg-soft-cream text-primary-orange border border-primary-orange/30 font-semibold mb-4 inline-block">
              {catLabel}
            </Badge>
          </Link>
        )}

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-text-dark leading-tight mb-6">
          {post.title}
        </h1>

        {/* Meta */}
        <div className="flex items-center gap-4 text-sm text-text-muted flex-wrap mb-8 pb-6 border-b border-border">
          {post.author?.name && (
            <span className="flex items-center gap-1.5 font-semibold">
              {post.author.image ? (
                <Image
                  src={post.author.image}
                  alt={post.author.name}
                  width={24}
                  height={24}
                  className="rounded-full"
                />
              ) : (
                <User className="w-4 h-4" />
              )}
              {post.author.name}
            </span>
          )}
          {post.publishedAt && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {formatDate(post.publishedAt)}
            </span>
          )}
          {post.readingTime && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {post.readingTime} phút đọc
            </span>
          )}
        </div>

        {/* Cover image — LCP */}
        {post.coverImage && (
          <div className="relative h-[280px] sm:h-[400px] rounded-3xl overflow-hidden mb-10">
            <Image
              src={post.coverImage}
              alt={post.title}
              fill
              className="object-cover"
              priority
            />
          </div>
        )}

        {/* Markdown content */}
        <MarkdownRenderer content={post.content} />

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mt-10 pt-6 border-t border-border">
            <Tag className="w-4 h-4 text-text-muted flex-shrink-0" />
            {post.tags.map((tag) => (
              <Link
                key={tag}
                href={`/tin-tuc/tag/${encodeURIComponent(tag)}`}
                className="text-xs px-3 py-1 rounded-full border border-border text-text-muted hover:border-primary-orange hover:text-primary-orange transition font-semibold"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}

        {/* Share */}
        <div className="mt-8 pt-6 border-t border-border">
          <ShareButtons url={postUrl} title={post.title} />
        </div>

        {/* Author bio */}
        {post.author?.name && (
          <div className="mt-10 p-6 rounded-2xl bg-gradient-to-br from-orange-50 to-purple-50 flex gap-4 items-start">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary-orange to-primary-purple flex items-center justify-center text-white font-extrabold text-xl flex-shrink-0">
              {post.author.name[0]}
            </div>
            <div>
              <div className="font-extrabold text-text-dark">{post.author.name}</div>
              <div className="text-sm text-text-muted mt-1">Biên soạn bởi đội ngũ Sata Robo</div>
            </div>
          </div>
        )}

        {/* Related posts */}
        <RelatedPosts posts={related} />
      </div>
    </>
  )
}
