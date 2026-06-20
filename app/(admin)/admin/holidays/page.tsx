import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, CalendarOff, FileSpreadsheet, Pencil } from "lucide-react";
import { auth } from "@/lib/auth";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import type { Prisma, HolidayType } from "@prisma/client";
import { TypeBadge, ScopeBadge, DateRange, TYPE_LABELS } from "./_components/helpers";

export const dynamic = "force-dynamic";

interface SearchParams {
  searchParams: Promise<{ year?: string; centerId?: string; type?: string }>;
}

const VALID_TYPES = new Set<HolidayType>(["HOLIDAY", "MAINTENANCE", "EVENT", "OTHER"]);

export default async function HolidaysAdminPage({ searchParams }: SearchParams) {
  // Cách ly cơ sở: Holiday ∈ SCOPED_MODELS → scopedDb auto-inject centerId IN <tầm
  // nhìn>. CENTER_MANAGER@CS1 không thấy ngày nghỉ riêng của CS2 (ngày nghỉ toàn hệ
  // thống centerId=null bị scope theo cùng cơ chế như trang /admin/sessions).
  const session = await auth();
  if (!session?.user) redirect("/login");
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const sp = await searchParams;
  const currentYear = new Date().getUTCFullYear();
  const year = (() => {
    const parsed = parseInt(sp.year ?? String(currentYear), 10);
    return Number.isFinite(parsed) ? parsed : currentYear;
  })();
  const centerFilter = sp.centerId?.trim() ?? "";
  const typeFilter = sp.type?.trim() ?? "";

  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const endOfYear = new Date(Date.UTC(year + 1, 0, 1));

  const where: Prisma.HolidayWhereInput = {
    date: { gte: startOfYear, lt: endOfYear },
  };
  if (centerFilter === "ALL") where.centerId = null;
  else if (centerFilter) where.centerId = centerFilter;
  if (typeFilter && VALID_TYPES.has(typeFilter as HolidayType)) {
    where.type = typeFilter as HolidayType;
  }

  const [holidays, centers] = await Promise.all([
    sdb.holiday.findMany({
      where,
      orderBy: { date: "asc" },
      include: { center: { select: { id: true, name: true } } },
    }),
    sdb.center.findMany({
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black text-neutral-900">
            <CalendarOff className="h-7 w-7 text-orange-500" />
            Lịch nghỉ
          </h1>
          <p className="mt-1 text-neutral-600">
            Năm {year} — {holidays.length} ngày nghỉ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/holidays/import"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-neutral-200 bg-white px-4 py-2 text-sm font-bold text-neutral-700 hover:bg-neutral-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Import Excel
          </Link>
          <Link
            href="/holidays/new"
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 font-bold text-white shadow-md hover:bg-orange-600"
          >
            <Plus className="h-5 w-5" />
            Thêm ngày nghỉ
          </Link>
        </div>
      </div>

      <form
        method="GET"
        className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_1fr_auto]"
      >
        <select
          name="year"
          defaultValue={String(year)}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              Năm {y}
            </option>
          ))}
        </select>
        <select
          name="centerId"
          defaultValue={centerFilter}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500"
        >
          <option value="">Tất cả phạm vi</option>
          <option value="ALL">Chỉ toàn hệ thống</option>
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="type"
          defaultValue={typeFilter}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500"
        >
          <option value="">Tất cả loại</option>
          {(Object.keys(TYPE_LABELS) as HolidayType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
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
                Ngày
              </th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">
                Tên
              </th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">
                Phạm vi
              </th>
              <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-neutral-700">
                Loại
              </th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">
                Ghi chú
              </th>
              <th className="p-4 text-right text-xs font-bold uppercase tracking-wider text-neutral-700">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody>
            {holidays.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-12 text-center text-neutral-500">
                  {centerFilter || typeFilter ? (
                    <>Không có ngày nghỉ nào khớp bộ lọc cho năm {year}.</>
                  ) : (
                    <>
                      Chưa có ngày nghỉ nào trong năm {year}.{" "}
                      <Link href="/holidays/new" className="text-orange-600 hover:underline">
                        Thêm ngày nghỉ đầu tiên →
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              holidays.map((h) => (
                <tr key={h.id} className="border-b border-neutral-200 hover:bg-neutral-50">
                  <td className="p-4 text-sm">
                    <DateRange date={h.date} endDate={h.endDate} />
                  </td>
                  <td className="p-4 text-sm font-semibold text-neutral-900">{h.name}</td>
                  <td className="p-4">
                    <ScopeBadge center={h.center} />
                  </td>
                  <td className="p-4 text-center">
                    <TypeBadge type={h.type} />
                  </td>
                  <td className="p-4 text-xs text-neutral-600">
                    {h.note ? (
                      <span className="line-clamp-2">{h.note}</span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/holidays/${h.id}/edit`}
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
