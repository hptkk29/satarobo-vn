import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { NewsListRow } from "./_components/news-list-row";

export const dynamic = "force-dynamic";

export default async function NewsAdminPage() {
  const news = await db.news.findMany({
    orderBy: [{ displayOrder: "asc" }, { publishedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      category: true,
      isPublished: true,
      isFeatured: true,
      publishedAt: true,
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-neutral-900">Tin Tức</h1>
          <p className="mt-1 text-neutral-600">
            Quản lý bài viết Markdown · {news.length} bài
          </p>
        </div>
        <Link
          href="/news/new"
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 font-bold text-white shadow-md hover:bg-orange-600"
        >
          <Plus className="h-5 w-5" />
          Thêm bài viết
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left">
            <tr>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Tiêu đề</th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Danh mục</th>
              <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-neutral-700">Trạng thái</th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Ngày đăng</th>
              <th className="p-4 text-right text-xs font-bold uppercase tracking-wider text-neutral-700">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {news.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center text-neutral-500">
                  Chưa có bài viết nào.{" "}
                  <Link href="/news/new" className="text-orange-600 hover:underline">
                    Tạo bài đầu tiên →
                  </Link>
                </td>
              </tr>
            ) : (
              news.map((n) => <NewsListRow key={n.id} news={n} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
