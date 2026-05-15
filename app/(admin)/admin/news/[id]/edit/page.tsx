import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { NewsForm } from "../../_components/news-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditNewsPage({ params }: Props) {
  const { id } = await params;
  const news = await db.news.findUnique({ where: { id } });
  if (!news) notFound();

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-neutral-900">
        Sửa bài viết:{" "}
        <span className="font-bold text-orange-600">{news.title}</span>
      </h1>
      <NewsForm
        news={{
          id: news.id,
          slug: news.slug,
          title: news.title,
          excerpt: news.excerpt,
          content: news.content,
          coverImage: news.coverImage,
          category: news.category,
          tags: news.tags,
          isPublished: news.isPublished,
          isFeatured: news.isFeatured,
          displayOrder: news.displayOrder,
          seoTitle: news.seoTitle,
          seoDescription: news.seoDescription,
        }}
      />
    </div>
  );
}
