import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { TransferForm } from "./_components/transfer-form";
import { RequestActions } from "./_components/request-actions";

export const metadata = { title: "Chuyển lớp / cơ sở | Admin" };
export const dynamic = "force-dynamic";

const ACTIVE_ENROLLMENT_STATUSES = ["CONFIRMED", "STUDYING", "ACTIVE"] as const;

export default async function TransferPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // P1-c: sale/quản lý TẠO yêu cầu (enrollments:create); chỉ quản lý (transfer) DUYỆT.
  if (!can(session.user, "enrollments:create")) redirect("/dashboard");
  const canApprove = can(session.user, "enrollments:transfer");

  const centerScope =
    hasRole(session.user, "CENTER_MANAGER") && !hasRole(session.user, "SUPER_ADMIN")
      ? session.user.centerId
      : null;

  const [students, centers, requests] = await Promise.all([
    db.student.findMany({
      where: {
        deletedAt: null,
        ...(centerScope ? { centerId: centerScope } : {}),
        enrollments: { some: { status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } } },
      },
      orderBy: { name: "asc" },
      take: 500,
      select: {
        id: true,
        name: true,
        studentCode: true,
        enrollments: {
          where: { status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } },
          select: { classId: true, class: { select: { name: true, classCode: true } } },
        },
      },
    }),
    db.center.findMany({ where: { isActive: true }, orderBy: { displayOrder: "asc" }, select: { id: true, name: true } }),
    db.studentTransferRequest.findMany({
      where: {
        status: { in: ["PENDING", "WAITLISTED"] },
        ...(centerScope ? { OR: [{ fromCenterId: centerScope }, { toCenterId: centerScope }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        reason: true,
        createdAt: true,
        toClassId: true,
        student: { select: { name: true, studentCode: true } },
      },
    }),
  ]);

  const studentOptions = students.map((s) => ({
    id: s.id,
    name: s.name,
    studentCode: s.studentCode,
    classes: s.enrollments.map((e) => ({
      classId: e.classId,
      label: e.class.name + (e.class.classCode ? ` (${e.class.classCode})` : ""),
    })),
  }));

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Chuyển lớp / chuyển cơ sở</h1>
        <p className="text-sm text-neutral-500">
          Lớp đích cùng khoá, không vượt tiến độ học viên. Hết chỗ → tự đưa vào danh sách chờ (waitlist).
          Giữ lịch sử cơ sở cũ.
        </p>
      </div>

      <TransferForm students={studentOptions} centers={centers} />

      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b px-4 py-2 text-sm font-semibold text-neutral-700">Yêu cầu đang chờ</div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-400">
            <tr>
              <th className="px-4 py-2">Học viên</th>
              <th className="px-4 py-2">Trạng thái</th>
              <th className="px-4 py-2">Lý do</th>
              <th className="px-4 py-2">Ngày</th>
              <th className="px-4 py-2">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  Không có yêu cầu.
                </td>
              </tr>
            ) : (
              requests.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-4 py-2 font-medium">
                    {r.student.name}
                    {r.student.studentCode ? ` (${r.student.studentCode})` : ""}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        r.status === "WAITLISTED"
                          ? "rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700"
                          : "rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700"
                      }
                    >
                      {r.status === "WAITLISTED" ? "Chờ chỗ" : "Chờ duyệt"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{r.reason ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-500">{r.createdAt.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2">
                    <RequestActions id={r.id} hasTarget={!!r.toClassId} canManage={canApprove} />
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
