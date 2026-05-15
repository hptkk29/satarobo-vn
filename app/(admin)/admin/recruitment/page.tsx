import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { RecruitmentListRow } from "./_components/recruitment-list-row";

export const dynamic = "force-dynamic";

export default async function RecruitmentAdminPage() {
  const positions = await db.recruitment.findMany({
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      department: true,
      jobType: true,
      location: true,
      isPublished: true,
      isFeatured: true,
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-neutral-900">Tuyển dụng</h1>
          <p className="mt-1 text-neutral-600">
            Quản lý vị trí tuyển dụng · {positions.length} vị trí
          </p>
        </div>
        <Link
          href="/admin/recruitment/new"
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 font-bold text-white shadow-md hover:bg-orange-600"
        >
          <Plus className="h-5 w-5" />
          Thêm vị trí
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left">
            <tr>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Chức danh</th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Phòng ban</th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Hình thức</th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Địa điểm</th>
              <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-neutral-700">Trạng thái</th>
              <th className="p-4 text-right text-xs font-bold uppercase tracking-wider text-neutral-700">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-12 text-center text-neutral-500">
                  Chưa có vị trí nào.{" "}
                  <Link href="/admin/recruitment/new" className="text-orange-600 hover:underline">
                    Tạo vị trí đầu tiên →
                  </Link>
                </td>
              </tr>
            ) : (
              positions.map((p) => <RecruitmentListRow key={p.id} position={p} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
