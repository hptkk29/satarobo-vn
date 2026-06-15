import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, hasRole } from "@/lib/auth/permissions";
import type { Prisma } from "@prisma/client";
import {
  RANK_LABEL,
  RANK_COLOR,
  EMPLOYMENT_LABEL,
  TEACHER_STATUS_LABEL,
  TEACHER_STATUS_COLOR,
} from "@/lib/teachers/labels";
import { computeTeachingLoad } from "@/lib/teachers/load";
import { getSetting } from "@/lib/settings/service";

export const metadata = { title: "Giáo viên | Admin" };

interface SearchParams {
  searchParams: Promise<{ q?: string }>;
}

export default async function TeachersPage({ searchParams }: SearchParams) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "employees:view-all")) redirect("/dashboard");

  const params = await searchParams;
  const q = params.q?.trim();
  // CENTER_MANAGER chỉ xem GV trong cơ sở mình.
  const centerScope =
    hasRole(session.user, "CENTER_MANAGER") ? session.user.centerId : null;

  const where: Prisma.UserWhereInput = {
    isActive: true,
    deletedAt: null,
    ...(centerScope ? { centerId: centerScope } : {}),
    // P1-b: là GV nếu CÓ TEACHER ở roles[] HOẶC role chính = TEACHER (user cũ chưa
    // sync roles[]) HOẶC đã có hồ sơ giáo viên → không sót GV nào.
    AND: [
      {
        OR: [
          { roles: { has: "TEACHER" } },
          { role: "TEACHER" },
          { teacherProfile: { isNot: null } },
        ],
      },
      ...(q
        ? [
            {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
  };

  let staff: Array<{
    id: string;
    name: string | null;
    email: string;
    center: { name: string } | null;
    teacherProfile: {
      rank: keyof typeof RANK_LABEL;
      employmentType: keyof typeof EMPLOYMENT_LABEL;
      status: keyof typeof TEACHER_STATUS_LABEL;
    } | null;
    teacherClass: { scheduleDays: number[]; startTime: string | null; endTime: string | null }[];
  }> = [];

  try {
    staff = await db.user.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        center: { select: { name: true } },
        teacherProfile: {
          select: { rank: true, employmentType: true, status: true },
        },
        teacherClass: {
          where: { isActive: true, deletedAt: null },
          select: { scheduleDays: true, startTime: true, endTime: true },
        },
      },
    });
  } catch {
    /* empty DB returns [] */
  }

  const overloadHours = await getSetting("teacher.overloadHoursPerWeek");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Giáo viên</h1>
        <p className="mt-1 text-sm text-gray-500">
          {staff.length} giáo viên · Quản lý toàn bộ nhân sự ở mục{" "}
          <Link href="/nhan-su" className="font-medium text-[#7C3AED] hover:underline">
            Nhân sự
          </Link>
        </p>
      </div>

      <form method="GET" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          name="q"
          defaultValue={q}
          placeholder="Tìm theo tên, email..."
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm sm:max-w-xs focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
        />
        <button
          type="submit"
          className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Tìm
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Tên</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Cơ sở</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Ngạch</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Loại HĐ</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Trạng thái</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Lớp</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Tải / tuần</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    Chưa có giáo viên nào
                  </td>
                </tr>
              ) : (
                staff.map((u) => {
                  const load = computeTeachingLoad(u.teacherClass, overloadHours);
                  return (
                  <tr key={u.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <Link href={`/teachers/${u.id}`} className="flex items-center gap-3 group">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F97316] to-[#7C3AED] text-xs font-bold text-white">
                          {(u.name ?? u.email)[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 group-hover:text-[#7C3AED]">
                            {u.name ?? "—"}
                          </div>
                          <div className="text-xs text-gray-400">{u.email}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{u.center?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.teacherProfile ? RANK_COLOR[u.teacherProfile.rank] : "bg-gray-100 text-gray-400"}`}>
                        {u.teacherProfile ? RANK_LABEL[u.teacherProfile.rank] : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {u.teacherProfile ? EMPLOYMENT_LABEL[u.teacherProfile.employmentType] : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {u.teacherProfile ? (
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TEACHER_STATUS_COLOR[u.teacherProfile.status]}`}>
                          {TEACHER_STATUS_LABEL[u.teacherProfile.status]}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Chưa có hồ sơ</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-medium tabular-nums text-gray-700">
                      {load.classCount}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="text-sm tabular-nums text-gray-700">
                        {load.sessionsPerWeek} buổi · {load.hoursPerWeek}h
                      </div>
                      {load.overloaded && (
                        <span className="mt-0.5 inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                          Quá tải
                        </span>
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
    </div>
  );
}
