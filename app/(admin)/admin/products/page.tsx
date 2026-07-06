import Link from "next/link";
import { Plus, Package2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { checkPermission } from "@/lib/auth/check-permission";
import {
  ProductCategory,
  ProductStatus,
  type Prisma,
  type Product,
} from "@prisma/client";
import {
  PRODUCT_CATEGORY_LABEL,
  PRODUCT_STATUS_LABEL,
  PRODUCT_STATUS_COLOR,
} from "@/lib/validators/product";

export const metadata = { title: "Sản phẩm | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    q?: string;
    category?: string;
    status?: string;
    lowStock?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 20;
const CATEGORIES = Object.values(ProductCategory) as ProductCategory[];
const STATUSES = Object.values(ProductStatus) as ProductStatus[];

export default async function ProductsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Gate list-level (nhiều sản phẩm) — không có 1 centerId cụ thể, không truyền target.
  if (!(await checkPermission("products:view"))) {
    redirect("/dashboard?error=unauthorized");
  }

  // products:manage chỉ HO_ACCOUNTANT (GLOBAL) — không cần target.
  const canManage = await checkPermission("products:manage");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const categoryParam = CATEGORIES.includes(sp.category as ProductCategory)
    ? (sp.category as ProductCategory)
    : undefined;
  const statusParam = STATUSES.includes(sp.status as ProductStatus)
    ? (sp.status as ProductStatus)
    : undefined;
  const lowStock = sp.lowStock === "1";
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.ProductWhereInput = {};
  if (q) {
    where.OR = [
      { sku: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
    ];
  }
  if (categoryParam) where.category = categoryParam;
  if (statusParam) where.status = statusParam;

  // lowStock filter: stockOnHand <= minThreshold. Prisma doesn't support
  // field-to-field comparison in WHERE — workaround: fetch then JS-filter.
  // Acceptable for catalog sizes under a few hundred items.
  let products: Product[];
  let totalCount: number;

  if (lowStock) {
    const all = await db.product.findMany({
      where: { ...where, status: { in: ["ACTIVE", "PAUSED"] } },
      orderBy: { name: "asc" },
    });
    const filtered = all.filter((p) => p.stockOnHand <= p.minThreshold);
    totalCount = filtered.length;
    products = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  } else {
    const [count, rows] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);
    totalCount = count;
    products = rows;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function urlFor(
    p: Partial<{
      q: string;
      category: string;
      status: string;
      lowStock: string;
      page: number;
    }>,
  ): string {
    const u = new URLSearchParams();
    if (p.q) u.set("q", p.q);
    if (p.category) u.set("category", p.category);
    if (p.status) u.set("status", p.status);
    if (p.lowStock) u.set("lowStock", p.lowStock);
    if (p.page && p.page > 1) u.set("page", String(p.page));
    return `/products${u.toString() ? "?" + u.toString() : ""}`;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50">
            <Package2 className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sản phẩm</h1>
            <p className="mt-1 text-sm text-gray-500">
              Catalog sản phẩm bán/cho thuê (kits, sensors, mission blocks,
              accessories)
            </p>
          </div>
        </div>
        {canManage && (
          <Link
            href="/products/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            Thêm sản phẩm
          </Link>
        )}
      </div>

      {/* Quick filter chips */}
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link
          href={urlFor({
            q,
            category: categoryParam,
            status: statusParam,
          })}
          className={
            "rounded-full px-3 py-1 " +
            (!lowStock
              ? "bg-blue-100 text-blue-700"
              : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50")
          }
        >
          Tất cả
        </Link>
        <Link
          href={urlFor({
            q,
            category: categoryParam,
            status: statusParam,
            lowStock: "1",
          })}
          className={
            "rounded-full px-3 py-1 " +
            (lowStock
              ? "bg-orange-100 text-orange-700"
              : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50")
          }
        >
          ⚠️ Sắp hết hàng
        </Link>
      </div>

      <form
        method="GET"
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        {lowStock && <input type="hidden" name="lowStock" value="1" />}
        <input
          name="q"
          defaultValue={q}
          placeholder="SKU hoặc tên..."
          className="lg:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
        />
        <select
          name="category"
          defaultValue={categoryParam ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
        >
          <option value="">Tất cả loại</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {PRODUCT_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={statusParam ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
        >
          <option value="">Tất cả trạng thái</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {PRODUCT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Áp dụng
        </button>
      </form>

      <div className="mb-2 text-sm text-gray-600">
        {totalCount.toLocaleString("vi-VN")} sản phẩm
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  SKU
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Tên
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Loại
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Giá bán
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Thuê/tháng
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Tồn kho
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Trạng thái
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {products.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    Không có sản phẩm nào
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const isLow = p.stockOnHand <= p.minThreshold;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {p.sku}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <Link
                          href={`/products/${p.id}`}
                          className="hover:underline"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {PRODUCT_CATEGORY_LABEL[p.category]}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums">
                        {p.salePrice.toLocaleString("vi-VN")}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-600">
                        {p.rentalPricePerMonth != null
                          ? p.rentalPricePerMonth.toLocaleString("vi-VN")
                          : "—"}
                      </td>
                      <td
                        className={
                          "px-4 py-3 text-right text-sm tabular-nums " +
                          (isLow ? "font-bold text-orange-600" : "")
                        }
                      >
                        {p.stockOnHand}
                        {isLow && " ⚠️"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${PRODUCT_STATUS_COLOR[p.status]}`}
                        >
                          {PRODUCT_STATUS_LABEL[p.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManage && (
                          <Link
                            href={`/products/${p.id}/edit`}
                            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Sửa
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Trang {page}/{totalPages} ·{" "}
            {totalCount.toLocaleString("vi-VN")} sản phẩm
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={urlFor({
                  q,
                  category: categoryParam,
                  status: statusParam,
                  lowStock: lowStock ? "1" : undefined,
                  page: page - 1,
                })}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                ← Trước
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={urlFor({
                  q,
                  category: categoryParam,
                  status: statusParam,
                  lowStock: lowStock ? "1" : undefined,
                  page: page + 1,
                })}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Sau →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
