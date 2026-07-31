import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { getNearingEndEnrollments } from "@/lib/students/renewal";
import { formatDateVN } from "@/lib/format/date";

export const metadata = { title: "Sắp hết khoá | Admin" };
export const dynamic = "force-dynamic";

export default async function NearingEndPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("enrollments:view-all"))) redirect("/dashboard");

  // CENTER_MANAGER (không kèm SUPER_ADMIN) chỉ thấy cơ sở mình.
  const centerScope =
    hasRole(session.user, "CENTER_MANAGER") && !hasRole(session.user, "SUPER_ADMIN")
      ? session.user.centerId
      : null;

  const items = await getNearingEndEnrollments({ centerId: centerScope });

  return (
    <div className="max-w-5xl p-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <GraduationCap className="h-6 w-6 text-[#7C3AED]" /> Sắp hết khoá
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Học viên còn ≤ 5 buổi — liên hệ phụ huynh tái tục. Sắp xếp theo số buổi còn lại.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          Chưa có học viên nào sắp hết khoá.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-2">Học viên</th>
                <th className="px-4 py-2">Lớp / Khoá</th>
                <th className="px-4 py-2">Cơ sở</th>
                <th className="px-4 py-2 text-center">Còn lại</th>
                <th className="px-4 py-2">Dự kiến kết thúc</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.enrollmentId} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-gray-900">{it.studentName}</td>
                  <td className="px-4 py-2 text-gray-700">
                    {it.className}
                    <span className="block text-xs text-gray-400">{it.courseName}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{it.centerName ?? "—"}</td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        it.remaining <= 2
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {it.remaining}/{it.total} buổi
                    </span>
                  </td>
                  <td className="px-4 py-2 tabular-nums text-gray-700">
                    {it.expectedEndDate
                      ? formatDateVN(it.expectedEndDate)
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-3">
                      {/* BGĐ 31/07 — TÁI TỤC: pre-fill form ghi danh + nối khoá trước. */}
                      <Link
                        href={`/enrollments/new?studentId=${it.studentId}&renewedFrom=${it.enrollmentId}`}
                        className="rounded-lg bg-[#7C3AED] px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
                      >
                        Tái tục
                      </Link>
                      <Link
                        href={`/students/${it.studentId}/edit`}
                        className="text-xs font-semibold text-[#7C3AED] hover:underline"
                      >
                        Hồ sơ →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
