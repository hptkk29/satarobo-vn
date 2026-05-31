import { redirect } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { MakeupRow, type MakeupItem } from "./_components/makeup-row";

export const metadata = { title: "Học bù | Admin" };
export const dynamic = "force-dynamic";

export default async function MakeupPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "parent-requests:manage")) redirect("/dashboard");

  const centerScope =
    hasRole(session.user, "CENTER_MANAGER") && !hasRole(session.user, "SUPER_ADMIN")
      ? session.user.centerId
      : null;

  const needs = await db.makeupNeed.findMany({
    where: {
      status: { in: ["PENDING", "SCHEDULED"] },
      ...(centerScope ? { centerId: centerScope } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 200,
    select: {
      id: true,
      status: true,
      missedSessionId: true,
      makeupSessionId: true,
      student: { select: { name: true } },
      class: { select: { name: true } },
      missedLessonId: true,
    },
  });

  // Lấy ngày buổi lỡ + bù + tên lesson (batch).
  const sessionIds = [
    ...new Set(needs.flatMap((n) => [n.missedSessionId, n.makeupSessionId].filter((x): x is string => !!x))),
  ];
  const lessonIds = [...new Set(needs.map((n) => n.missedLessonId).filter((x): x is string => !!x))];
  const [sessions, lessons] = await Promise.all([
    sessionIds.length ? db.classSession.findMany({ where: { id: { in: sessionIds } }, select: { id: true, date: true } }) : Promise.resolve([]),
    lessonIds.length ? db.lesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, order: true, title: true } }) : Promise.resolve([]),
  ]);
  const sessDate = new Map(sessions.map((s) => [s.id, s.date]));
  const lessonMap = new Map(lessons.map((l) => [l.id, l]));

  const items: MakeupItem[] = needs.map((n) => {
    const l = n.missedLessonId ? lessonMap.get(n.missedLessonId) : null;
    return {
      id: n.id,
      studentName: n.student.name,
      className: n.class.name,
      missedDate: sessDate.get(n.missedSessionId)?.toISOString() ?? null,
      missedLesson: l ? `Bài ${l.order}: ${l.title}` : null,
      status: n.status,
      makeupDate: n.makeupSessionId ? sessDate.get(n.makeupSessionId)?.toISOString() ?? null : null,
    };
  });

  return (
    <div className="max-w-4xl p-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <RefreshCw className="h-6 w-6 text-[#7C3AED]" /> Học bù
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Buổi vắng cần bù → gợi ý buổi bù cùng khoá/bài (không vượt tiến độ) → xếp → đánh dấu đã bù.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          Không có nhu cầu học bù nào đang chờ.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <MakeupRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
