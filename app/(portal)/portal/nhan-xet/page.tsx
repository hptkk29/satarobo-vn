import { requireActiveStudent } from "@/lib/portal/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhận xét | Sata Robo" };

// LMS-2 — phụ huynh xem nhận xét theo buổi của ĐÚNG con đang chọn (active site).
export default async function NhanXetPage() {
  const { studentId } = await requireActiveStudent();

  const feedbacks = await db.studentSessionFeedback.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      comment: true,
      rating: true,
      createdAt: true,
      classSession: {
        select: {
          date: true,
          class: {
            select: { name: true, classCode: true, teacher: { select: { name: true } } },
          },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-neutral-900">Nhận xét của giáo viên</h1>

      {feedbacks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          Chưa có nhận xét nào cho con.
        </p>
      ) : (
        <ul className="space-y-3">
          {feedbacks.map((f) => (
            <li key={f.id} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-neutral-900">
                  {f.classSession.class.classCode ? `${f.classSession.class.classCode} · ` : ""}
                  {f.classSession.class.name}
                </span>
                <span className="text-xs tabular-nums text-neutral-400">
                  {new Date(f.classSession.date).toLocaleDateString("vi-VN", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="mb-1.5 flex items-center gap-2 text-xs text-neutral-500">
                <span>GV: {f.classSession.class.teacher?.name ?? "—"}</span>
                {f.rating != null && (
                  <span className="text-amber-500">{"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}</span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm text-neutral-700">{f.comment}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
