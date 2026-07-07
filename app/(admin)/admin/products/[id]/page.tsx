import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { Button } from "@/components/ui/button";
import {
  PRODUCT_CATEGORY_LABEL,
  PRODUCT_STATUS_LABEL,
  PRODUCT_STATUS_COLOR,
  PRODUCT_MOVEMENT_TYPE_LABEL,
} from "@/lib/validators/product";
import { AdjustStockButton } from "../_components/adjust-stock-button";

export const metadata = { title: "Chi tiết sản phẩm | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function ProductDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Gate trước khi fetch — products:view/manage không có centerId để scope theo (GLOBAL).
  if (!(await checkPermission("products:view"))) {
    redirect("/dashboard?error=unauthorized");
  }

  // products:manage chỉ HO_ACCOUNTANT (GLOBAL) — không cần target.
  const canManage = await checkPermission("products:manage");
  const { id } = await params;

  // Product/ProductMovement là catalog + sổ kho SP toàn cục (không scoped) — pass-through.
  const sdb = scopedDb(await resolveActor(session.user.id));
  const product = await sdb.product.findUnique({
    where: { id },
    include: {
      movements: { orderBy: { createdAt: "desc" }, take: 50 },
      zmroboKit: { select: { id: true, title: true, slug: true } },
    },
  });
  if (!product) notFound();

  const isLowStock = product.stockOnHand <= product.minThreshold;

  return (
    <div className="max-w-5xl space-y-6">
      <Link
        href="/products"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Quay lại danh sách
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${PRODUCT_STATUS_COLOR[product.status]}`}
            >
              {PRODUCT_STATUS_LABEL[product.status]}
            </span>
          </div>
          <div className="mt-1 text-sm text-gray-600">
            SKU: <span className="font-mono">{product.sku}</span> ·{" "}
            {PRODUCT_CATEGORY_LABEL[product.category]}
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <AdjustStockButton
              productId={product.id}
              currentStock={product.stockOnHand}
            />
            <Link href={`/products/${product.id}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4" />
                Sửa
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div
          className={
            "rounded-xl border p-4 " +
            (isLowStock
              ? "border-orange-200 bg-orange-50"
              : "border-gray-200 bg-gray-50")
          }
        >
          <div className="text-xs uppercase tracking-wider text-gray-600">
            Tồn kho
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {product.stockOnHand}
            {isLowStock && " ⚠️"}
          </div>
          <div className="text-xs text-gray-500">
            Ngưỡng cảnh báo: {product.minThreshold}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-blue-50 p-4">
          <div className="text-xs uppercase tracking-wider text-gray-600">
            Giá bán
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {product.salePrice.toLocaleString("vi-VN")}
          </div>
          <div className="text-xs text-gray-500">VND</div>
        </div>
        {product.rentalPricePerMonth != null && (
          <div className="rounded-xl border border-gray-200 bg-purple-50 p-4">
            <div className="text-xs uppercase tracking-wider text-gray-600">
              Giá thuê/tháng
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {product.rentalPricePerMonth.toLocaleString("vi-VN")}
            </div>
            <div className="text-xs text-gray-500">VND</div>
          </div>
        )}
        {product.costPrice != null && canManage && (
          <div className="rounded-xl border border-gray-200 bg-gray-100 p-4">
            <div className="text-xs uppercase tracking-wider text-gray-600">
              Giá vốn (nội bộ)
            </div>
            <div className="mt-1 text-lg font-bold tabular-nums">
              {product.costPrice.toLocaleString("vi-VN")}
            </div>
          </div>
        )}
      </div>

      {product.description && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500">
            Mô tả
          </h2>
          <p className="whitespace-pre-wrap text-sm text-gray-800">
            {product.description}
          </p>
        </section>
      )}

      {product.zmroboKit && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 text-sm">
          🔗 Liên kết catalog kit:{" "}
          <Link
            href={`/kits/${product.zmroboKit.id}/edit`}
            className="text-blue-600 hover:underline"
          >
            {product.zmroboKit.title}
          </Link>
        </section>
      )}

      {product.notes && (
        <section className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
          <strong>Ghi chú:</strong> {product.notes}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
          Lịch sử nhập / xuất ({product.movements.length})
        </h2>
        {product.movements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
            <p className="text-sm text-gray-500">Chưa có biến động kho</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Thời gian
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Loại
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Số lượng
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Trước → Sau
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Lý do
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Người
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {product.movements.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2 text-xs tabular-nums text-gray-600">
                        {formatDateTime(m.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {PRODUCT_MOVEMENT_TYPE_LABEL[m.type]}
                      </td>
                      <td
                        className={
                          "px-3 py-2 text-right font-mono " +
                          (m.quantity > 0 ? "text-green-600" : "text-red-600")
                        }
                      >
                        {m.quantity > 0 ? "+" : ""}
                        {m.quantity}
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-gray-600">
                        {m.stockBeforeMovement} → {m.stockAfterMovement}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">
                        {m.reason ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">
                        {m.createdByName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
