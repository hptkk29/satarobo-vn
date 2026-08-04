import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import {
  REPORT_CARD_STATUS_LABEL,
  type ReportCardStatusValue,
} from "@/lib/lms/report-card";

export const metadata = { title: "Học bạ năng lực | Admin" };
export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<ReportCardStatusValue, string> = {
  DRAFT: "bg-neutral-100 text-neutral-600",
  PENDING_REVIEW: "bg-amber-100 text-amber-700",
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  RECALLED: "bg-rose-100 text-rose-700",
};

function StatusBadge({ status }: { status: ReportCardStatusValue }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {REPORT_CARD_STATUS_LABEL[status]}
    </span>
  );
}

export default async function ReportCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // report-cards:* seed v2 scope GLOBAL cố ý (check ở authContext, cách ly do
  // scopedDb — ReportCard ∈ SCOPED_MODELS từ #03 Pha B 86edfbc) — không
  // truyền target (chưa chắc scope, không đoán mò).
  const canManageReportCards = await checkPermission("report-cards:manage");
  const canReviewReportCards = await checkPermission("report-cards:review");
  if (!canManageReportCards && !canReviewReportCards) {
    redirect("/dashboard");
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor); // Class auto-scoped theo cơ sở (T5)
  const { classId } = await searchParams;

  const classes = await sdb.class.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, name: true, classCode: true, course: { select: { name: true } } },
  });

  // Enrollment của lớp đang chọn (verify lớp trong scope qua sdb.findUnique).
  let rows: {
    enrollmentId: string;
    studentName: string;
    studentCode: string | null;
    status: ReportCardStatusValue | null;
  }[] = [];
  if (classId) {
    const inScope = await sdb.class.findUnique({ where: { id: classId }, select: { id: true } });
    if (inScope) {
      // Lớp đã qua sdb.class.findUnique ở trên ⇒ cùng cơ sở; ghi danh + học bạ cũng scoped.
      // FIX A2: scopedDb KHÔNG tự lọc deletedAt — thiếu filter là ghi danh XOÁ MỀM vẫn
      // hiện trong list và đi trọn luồng nhập/duyệt/phát hành học bạ.
      const enrollments = await sdb.enrollment.findMany({
        where: { classId, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, student: { select: { name: true, studentCode: true } } },
      });
      const cards = await sdb.reportCard.findMany({
        where: { enrollmentId: { in: enrollments.map((e) => e.id) } },
        select: { enrollmentId: true, status: true },
      });
      const statusMap = new Map(cards.map((c) => [c.enrollmentId, c.status as ReportCardStatusValue]));
      rows = enrollments.map((e) => ({
        enrollmentId: e.id,
        studentName: e.student.name,
        studentCode: e.student.studentCode,
        status: statusMap.get(e.id) ?? null,
      }));
    }
  }

  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Học bạ năng lực</h1>
          <p className="text-sm text-neutral-500">
            Chọn lớp → nhập học bạ từng học viên → nộp duyệt → phát hành.
          </p>
        </div>
        {canReviewReportCards ? (
          <Link
            href="/report-cards/criteria"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Cấu hình tiêu chí
          </Link>
        ) : null}
      </div>

      <form className="flex gap-2" method="get">
        <select
          name="classId"
          defaultValue={classId ?? ""}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">— Chọn lớp —</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.classCode ? `${c.classCode} · ` : ""}
              {c.name} ({c.course.name})
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white">
          Xem học viên
        </button>
      </form>

      {classId && rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Lớp không có học viên hoặc ngoài phạm vi cơ sở.</p>
      ) : null}

      {rows.length > 0 ? (
        <section className="rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Học viên</th>
                <th className="px-4 py-2">Trạng thái học bạ</th>
                <th className="px-4 py-2 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.enrollmentId} className="border-t">
                  <td className="px-4 py-2 font-medium">
                    {r.studentName}
                    {r.studentCode ? <span className="text-neutral-400"> ({r.studentCode})</span> : null}
                  </td>
                  <td className="px-4 py-2">
                    {r.status ? <StatusBadge status={r.status} /> : (
                      <span className="text-xs text-neutral-400">Chưa có</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/report-cards/${r.enrollmentId}`}
                      className="rounded-md bg-purple-700 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      {r.status ? "Mở học bạ" : "Nhập học bạ"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
