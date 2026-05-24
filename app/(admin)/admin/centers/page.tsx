import Link from "next/link";
import { Plus, MapPin, FileSpreadsheet } from "lucide-react";
import { db } from "@/lib/db";
import { CenterListRow } from "./_components/center-list-row";

export const dynamic = "force-dynamic";

export default async function CentersAdminPage() {
  const centers = await db.center.findMany({
    orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      address: true,
      city: true,
      phone: true,
      email: true,
      isActive: true,
      displayOrder: true,
      _count: {
        select: {
          classes: true,
          students: true,
          employees: true,
        },
      },
    },
  });

  const activeCount = centers.filter((c) => c.isActive).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black text-neutral-900">
            <MapPin className="h-7 w-7 text-orange-500" />
            Cơ sở
          </h1>
          <p className="mt-1 text-neutral-600">
            Quản lý cơ sở Sata Robo · {activeCount}/{centers.length} đang hoạt động
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/centers/import"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-neutral-200 bg-white px-4 py-2 text-sm font-bold text-neutral-700 hover:bg-neutral-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Import Excel
          </Link>
          <Link
            href="/centers/new"
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 font-bold text-white shadow-md hover:bg-orange-600"
          >
            <Plus className="h-5 w-5" />
            Thêm cơ sở
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left">
            <tr>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Cơ sở</th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Liên hệ</th>
              <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-neutral-700">Liên kết</th>
              <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-neutral-700">Trạng thái</th>
              <th className="p-4 text-right text-xs font-bold uppercase tracking-wider text-neutral-700">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {centers.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center text-neutral-500">
                  Chưa có cơ sở nào.{" "}
                  <Link href="/centers/new" className="text-orange-600 hover:underline">
                    Thêm cơ sở đầu tiên →
                  </Link>
                </td>
              </tr>
            ) : (
              centers.map((c) => (
                <CenterListRow
                  key={c.id}
                  center={{
                    id: c.id,
                    name: c.name,
                    address: c.address,
                    phone: c.phone,
                    email: c.email,
                    isActive: c.isActive,
                    counts: c._count,
                  }}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
