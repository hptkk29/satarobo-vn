import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarX } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { classifyAbsenceUrgency } from "@/lib/students/absence";
import { getSetting } from "@/lib/settings/service";
import { AbsenceRow, type AbsenceItem } from "./_components/absence-row";

export const metadata = { title: "Báo vắng cần xử lý | Admin" };
export const dynamic = "force-dynamic";

export default async function AbsenceQueuePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "parent-requests:manage")) redirect("/dashboard");

  const now = new Date();
  const urgentThresholdDays = await getSetting("student.absenceUrgentThresholdDays");
  const rows = await db.parentRequest.findMany({
    where: { type: "ABSENCE", status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      content: true,
      preferredDate: true,
      sessionId: true,
      createdAt: true,
      student: {
        select: {
          name: true,
          studentCode: true,
          enrollments: {
            where: { status: { in: ["CONFIRMED", "STUDYING", "ACTIVE"] } },
            select: { class: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
  });

  // Lấy ngày buổi của các sessionId để phân loại gấp/đúng hạn.
  const sessionIds = rows.map((r) => r.sessionId).filter((x): x is string => !!x);
  const sessions = sessionIds.length
    ? await db.classSession.findMany({
        where: { id: { in: sessionIds } },
        select: { id: true, date: true, class: { select: { name: true } } },
      })
    : [];
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));

  const items: AbsenceItem[] = rows.map((r) => {
    const sess = r.sessionId ? sessionMap.get(r.sessionId) : null;
    const sessionDate = sess?.date ?? r.preferredDate ?? null;
    return {
      id: r.id,
      studentName: r.student.name,
      studentCode: r.student.studentCode,
      className: sess?.class.name ?? r.student.enrollments[0]?.class.name ?? null,
      sessionDate: sessionDate?.toISOString() ?? null,
      reason: r.content,
      urgency: sessionDate ? classifyAbsenceUrgency(sessionDate, now, urgentThresholdDays) : "URGENT",
      createdAt: r.createdAt.toISOString(),
      hasSession: !!r.sessionId,
    };
  });

  // Gấp lên đầu.
  items.sort((a, b) => (a.urgency === b.urgency ? 0 : a.urgency === "URGENT" ? -1 : 1));
  const urgentCount = items.filter((i) => i.urgency === "URGENT").length;

  return (
    <div className="max-w-4xl p-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <CalendarX className="h-6 w-6 text-[#7C3AED]" /> Báo vắng cần xử lý
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Tư vấn viên xử lý báo vắng của phụ huynh: xếp học bù hoặc đánh vắng.
          {urgentCount > 0 && (
            <span className="ml-1 font-semibold text-red-600">{urgentCount} gấp.</span>
          )}{" "}
          <Link href="/parent-requests" className="text-[#7C3AED] hover:underline">
            Tất cả yêu cầu →
          </Link>
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          Không có báo vắng nào chờ xử lý.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <AbsenceRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
