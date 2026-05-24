import Link from "next/link";
import { Plus, DoorOpen, FileSpreadsheet, Pencil } from "lucide-react";
import { db } from "@/lib/db";
import type { Prisma, RoomStatus } from "@prisma/client";
import { StatusBadge } from "./_components/status-badge";

export const dynamic = "force-dynamic";

interface SearchParams {
  searchParams: Promise<{ q?: string; centerId?: string; status?: string }>;
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "ACTIVE", label: "Hoạt động" },
  { value: "MAINTENANCE", label: "Bảo trì" },
  { value: "INACTIVE", label: "Tạm ngừng" },
];

const VALID_STATUSES = new Set<RoomStatus>(["ACTIVE", "MAINTENANCE", "INACTIVE"]);

export default async function RoomsAdminPage({ searchParams }: SearchParams) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const centerFilter = sp.centerId?.trim() ?? "";
  const statusFilter = sp.status?.trim() ?? "";

  const where: Prisma.RoomWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
    ];
  }
  if (centerFilter) where.centerId = centerFilter;
  if (statusFilter && VALID_STATUSES.has(statusFilter as RoomStatus)) {
    where.status = statusFilter as RoomStatus;
  }

  const [rooms, centers] = await Promise.all([
    db.room.findMany({
      where,
      orderBy: [
        { status: "asc" },
        { centerId: "asc" },
        { displayOrder: "asc" },
        { code: "asc" },
      ],
      take: 200,
      select: {
        id: true,
        name: true,
        code: true,
        capacity: true,
        equipment: true,
        status: true,
        displayOrder: true,
        center: { select: { id: true, name: true } },
      },
    }),
    db.center.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black text-neutral-900">
            <DoorOpen className="h-7 w-7 text-orange-500" />
            Phòng học
          </h1>
          <p className="mt-1 text-neutral-600">
            {rooms.length} phòng{rooms.length >= 200 && " (giới hạn 200, dùng filter để thu hẹp)"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/rooms/import"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-neutral-200 bg-white px-4 py-2 text-sm font-bold text-neutral-700 hover:bg-neutral-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Import Excel
          </Link>
          <Link
            href="/rooms/new"
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 font-bold text-white shadow-md hover:bg-orange-600"
          >
            <Plus className="h-5 w-5" />
            Thêm phòng
          </Link>
        </div>
      </div>

      <form
        method="GET"
        className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto]"
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Tìm theo tên hoặc mã phòng..."
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500"
        />
        <select
          name="centerId"
          defaultValue={centerFilter}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500"
        >
          <option value="">Tất cả cơ sở</option>
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={statusFilter}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600"
        >
          Lọc
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left">
            <tr>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">
                Mã / Tên
              </th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">
                Cơ sở
              </th>
              <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-neutral-700">
                Sức chứa
              </th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">
                Thiết bị
              </th>
              <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-neutral-700">
                Trạng thái
              </th>
              <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-neutral-700">
                Order
              </th>
              <th className="p-4 text-right text-xs font-bold uppercase tracking-wider text-neutral-700">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody>
            {rooms.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-neutral-500">
                  {q || centerFilter || statusFilter ? (
                    <>Không có phòng nào khớp bộ lọc.</>
                  ) : (
                    <>
                      Chưa có phòng nào.{" "}
                      <Link href="/rooms/new" className="text-orange-600 hover:underline">
                        Thêm phòng đầu tiên →
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              rooms.map((r) => (
                <tr key={r.id} className="border-b border-neutral-200 hover:bg-neutral-50">
                  <td className="p-4">
                    <div className="font-mono text-sm font-bold text-neutral-900">{r.code}</div>
                    <div className="mt-0.5 text-sm text-neutral-600">{r.name}</div>
                  </td>
                  <td className="p-4 text-sm text-neutral-700">{r.center.name}</td>
                  <td className="p-4 text-center text-sm">{r.capacity}</td>
                  <td className="p-4 text-xs text-neutral-600">
                    {r.equipment.length === 0 ? (
                      <span className="text-neutral-400">—</span>
                    ) : r.equipment.length <= 3 ? (
                      r.equipment.join(", ")
                    ) : (
                      `${r.equipment.slice(0, 3).join(", ")} +${r.equipment.length - 3}`
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="p-4 text-center text-sm">{r.displayOrder}</td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/rooms/${r.id}/edit`}
                      className="inline-flex items-center gap-1 rounded p-1.5 text-purple-600 hover:bg-purple-50"
                      title="Sửa"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
