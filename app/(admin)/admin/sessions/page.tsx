import Link from "next/link";
import { Plus, CalendarDays } from "lucide-react";
import { db } from "@/lib/db";
import { SessionListRow } from "./_components/session-list-row";
import { SessionFilters } from "./_components/session-filters";

export const dynamic = "force-dynamic";

interface SearchParams {
  searchParams: Promise<{ scope?: string; classId?: string }>;
}

export default async function SessionsAdminPage({ searchParams }: SearchParams) {
  const sp = await searchParams;
  const scope = sp.scope === "past" ? "past" : sp.scope === "all" ? "all" : "upcoming";
  const classFilter = sp.classId?.trim();

  const now = new Date();
  const where = {
    ...(scope === "upcoming" ? { date: { gte: now } } : {}),
    ...(scope === "past" ? { date: { lt: now } } : {}),
    ...(classFilter ? { classId: classFilter } : {}),
  };

  const [sessions, classes] = await Promise.all([
    db.classSession.findMany({
      where,
      orderBy: { date: scope === "past" ? "desc" : "asc" },
      take: 200,
      select: {
        id: true,
        date: true,
        topic: true,
        classId: true,
        class: { select: { name: true } },
        _count: { select: { attendances: true } },
      },
    }),
    db.class.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 200,
    }),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black text-neutral-900">
            <CalendarDays className="h-7 w-7 text-orange-500" />
            Buổi học
          </h1>
          <p className="mt-1 text-neutral-600">
            Đang xem:{" "}
            <span className="font-semibold text-neutral-800">
              {scope === "upcoming" ? "Sắp tới" : scope === "past" ? "Đã diễn ra" : "Tất cả"}
            </span>{" "}
            · {sessions.length} buổi
            {sessions.length >= 200 ? "+ (hiển thị 200 mới nhất)" : ""}
          </p>
        </div>
        <Link
          href="/sessions/new"
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 font-bold text-white shadow-md hover:bg-orange-600"
        >
          <Plus className="h-5 w-5" />
          Thêm buổi học
        </Link>
      </div>

      <SessionFilters scope={scope} classId={classFilter ?? ""} classes={classes} />

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left">
            <tr>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Thời gian</th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">Lớp / Chủ đề</th>
              <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-neutral-700">Điểm danh</th>
              <th className="p-4 text-right text-xs font-bold uppercase tracking-wider text-neutral-700">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-12 text-center text-neutral-500">
                  Chưa có buổi học nào khớp bộ lọc.{" "}
                  <Link href="/sessions/new" className="text-orange-600 hover:underline">
                    Tạo buổi học mới →
                  </Link>
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <SessionListRow
                  key={s.id}
                  session={{
                    id: s.id,
                    date: s.date,
                    topic: s.topic,
                    className: s.class.name,
                    classId: s.classId,
                    attendanceCount: s._count.attendances,
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
