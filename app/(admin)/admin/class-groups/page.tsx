import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { DeleteGroupButton } from "./_components/delete-group-button";

export const metadata = { title: "Nhóm lớp | Admin" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  GRADUATED: "Đã tốt nghiệp",
  DISBANDED: "Đã giải thể",
};

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  GRADUATED: "bg-blue-100 text-blue-700",
  DISBANDED: "bg-gray-200 text-gray-600",
};

export default async function ClassGroupsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "class_group:view-all")) {
    redirect("/dashboard?error=unauthorized");
  }
  const canManage = can(session.user, "class_group:create");
  const canDelete = can(session.user, "class_group:delete");

  const groups = await db.classGroup.findMany({
    where: { deletedAt: null },
    include: {
      center: { select: { name: true, code: true } },
      _count: { select: { classes: true } },
    },
    orderBy: [{ status: "asc" }, { displayCode: "asc" }],
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nhóm lớp (lớp cố định)</h1>
          <p className="mt-1 text-sm text-gray-600">
            Nhóm học sinh đi cùng nhau qua nhiều khoá/năm (tăng khoá Sata3 → 4 → 5…).
          </p>
        </div>
        {canManage && (
          <Link
            href="/class-groups/new"
            className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
          >
            <Plus size={16} /> Thêm nhóm lớp
          </Link>
        )}
      </div>

      <div className="text-sm text-gray-600">{groups.length} nhóm lớp</div>

      <div className="overflow-hidden rounded border">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Mã hiển thị</th>
              <th className="px-3 py-2 text-left">Tên nhóm</th>
              <th className="px-3 py-2 text-left">Cơ sở</th>
              <th className="px-3 py-2 text-right">Số lớp/khoá</th>
              <th className="px-3 py-2 text-left">Mã định danh</th>
              <th className="px-3 py-2 text-left">Trạng thái</th>
              {canDelete && <th className="px-3 py-2 text-right">Hành động</th>}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={canDelete ? 7 : 6} className="py-8 text-center text-gray-500">
                  Chưa có nhóm lớp nào.
                </td>
              </tr>
            )}
            {groups.map((g) => (
              <tr key={g.id} className="border-b hover:bg-gray-50">
                <td className="px-3 py-2 font-bold">
                  <Link
                    href={`/class-groups/${g.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {g.displayCode}
                  </Link>
                </td>
                <td className="px-3 py-2">{g.name ?? "—"}</td>
                <td className="px-3 py-2">{g.center.name}</td>
                <td className="px-3 py-2 text-right">{g._count.classes}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-500">
                  {g.code}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[g.status]}`}
                  >
                    {STATUS_LABEL[g.status]}
                  </span>
                </td>
                {canDelete && (
                  <td className="px-3 py-2 text-right">
                    <DeleteGroupButton id={g.id} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
