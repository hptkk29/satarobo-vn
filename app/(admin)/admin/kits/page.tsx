import Link from "next/link";
import { Plus, Package } from "lucide-react";
import { db } from "@/lib/db";
import { KitListRow } from "./_components/kit-list-row";

export const dynamic = "force-dynamic";

export default async function KitsAdminPage() {
  const kits = await db.zMRoboKit.findMany({
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      brand: true,
      series: true,
      code: true,
      priceDisplay: true,
      mainImage: true,
      galleryImages: true,
      isAvailable: true,
      isPublished: true,
    },
  });

  const publishedCount = kits.filter((k) => k.isPublished).length;
  const unavailableCount = kits.filter((k) => !k.isAvailable).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black text-neutral-900">
            <Package className="h-7 w-7 text-orange-500" />
            Học Cụ (ZMRobo Kits)
          </h1>
          <p className="mt-1 text-neutral-600">
            Quản lý catalog kit · {publishedCount}/{kits.length} published
            {unavailableCount > 0 && (
              <span className="ml-2 text-red-600">· {unavailableCount} hết hàng</span>
            )}
          </p>
        </div>
        <Link
          href="/kits/new"
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 font-bold text-white shadow-md hover:bg-orange-600"
        >
          <Plus className="h-5 w-5" />
          Thêm Kit
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left">
            <tr>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Sản phẩm</th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Brand / Series</th>
              <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-neutral-700">Thư viện ảnh</th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Giá</th>
              <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-neutral-700">Trạng thái</th>
              <th className="p-4 text-right text-xs font-bold uppercase tracking-wider text-neutral-700">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {kits.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-12 text-center text-neutral-500">
                  Chưa có kit nào.{" "}
                  <Link href="/kits/new" className="text-orange-600 hover:underline">
                    Thêm kit đầu tiên →
                  </Link>
                </td>
              </tr>
            ) : (
              kits.map((k) => <KitListRow key={k.id} kit={k} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
