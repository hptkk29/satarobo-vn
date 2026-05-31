import { requireActiveStudent } from "@/lib/portal/session";
import { db } from "@/lib/db";
import {
  REQUEST_TYPE_LABEL,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_BADGE,
} from "@/lib/portal/request-labels";
import { getStudentSessions } from "@/lib/portal/learning";
import { RequestForm } from "./_components/request-form";
import { CancelButton } from "./_components/cancel-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Yêu cầu | Sata Robo", robots: { index: false } };

export default async function YeuCauPage() {
  const { studentId } = await requireActiveStudent();
  const [requests, sessions, makeups] = await Promise.all([
    db.parentRequest.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    getStudentSessions(studentId),
    // B1 — trạng thái học bù của con.
    db.makeupNeed.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, status: true, class: { select: { name: true } } },
    }),
  ]);

  const MAKEUP_LABEL: Record<string, string> = {
    PENDING: "Chờ xếp buổi bù",
    SCHEDULED: "Đã xếp buổi bù",
    COMPLETED: "Đã học bù xong",
    CANCELLED: "Đã huỷ",
  };

  // Báo vắng: chỉ chọn buổi SẮP TỚI (chưa diễn ra).
  const upcomingSessions = sessions
    .filter((s) => !s.past)
    .map((s) => ({
      id: s.id,
      label: `${new Date(s.date).toLocaleDateString("vi-VN", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      })} · ${s.className}${s.lessonTitle ? ` — ${s.lessonTitle}` : ""}`,
    }));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-neutral-900">Yêu cầu</h1>

      <RequestForm upcomingSessions={upcomingSessions} />

      {makeups.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-neutral-700">
            Trạng thái học bù
          </h2>
          <ul className="space-y-2">
            {makeups.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3 text-sm">
                <span className="text-neutral-700">{m.class.name}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    m.status === "COMPLETED"
                      ? "bg-green-100 text-green-700"
                      : m.status === "SCHEDULED"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {MAKEUP_LABEL[m.status] ?? m.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-neutral-700">
          Yêu cầu đã gửi
        </h2>
        {requests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-400">
            Chưa có yêu cầu nào.
          </p>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-neutral-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-neutral-900">
                    {REQUEST_TYPE_LABEL[r.type]}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${REQUEST_STATUS_BADGE[r.status]}`}
                  >
                    {REQUEST_STATUS_LABEL[r.status]}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">
                  {r.content}
                </p>
                {r.preferredDate && (
                  <p className="mt-1 text-xs text-neutral-400">
                    Ngày: {r.preferredDate.toLocaleDateString("vi-VN")}
                  </p>
                )}
                {r.response && (
                  <p className="mt-2 rounded-lg bg-neutral-50 p-2 text-sm text-neutral-600">
                    Phản hồi: {r.response}
                  </p>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-neutral-400">
                    {r.createdAt.toLocaleDateString("vi-VN")}
                  </span>
                  {r.status === "PENDING" && <CancelButton id={r.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
