import { requireActiveStudent } from "@/lib/portal/session";
import { db } from "@/lib/db";
import {
  getStudentSessionEvals,
  getSessionMediaForStudent,
  type RenderedAnswer,
} from "@/lib/eval/session-eval-portal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhận xét | Sata Robo", robots: { index: false } };

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// LMS-2 / FL4-02 — phụ huynh xem nhận xét theo buổi của ĐÚNG con đang chọn (active site).
// Hiển thị song song: (1) nhận xét cũ StudentSessionFeedback (comment+rating) và
// (2) phiếu đánh giá buổi học mới (SESSION_EVAL) kèm ảnh buổi (gate theo consent).
export default async function NhanXetPage() {
  const { studentId } = await requireActiveStudent();

  const [feedbacks, evals] = await Promise.all([
    db.studentSessionFeedback.findMany({
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
    }),
    getStudentSessionEvals(studentId),
  ]);

  // Ảnh buổi gắn các buổi có phiếu đánh giá — gate theo StudentConsent CLASS_MEDIA.
  const mediaBySession = await getSessionMediaForStudent(
    studentId,
    evals.map((e) => e.classSessionId),
  );

  const hasAny = feedbacks.length > 0 || evals.length > 0;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold text-neutral-900">Nhận xét của giáo viên</h1>

      {!hasAny && (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          Chưa có nhận xét nào cho con.
        </p>
      )}

      {/* (2) Phiếu đánh giá buổi học (SESSION_EVAL) */}
      {evals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Phiếu đánh giá buổi học
          </h2>
          <ul className="space-y-3">
            {evals.map((ev) => {
              const media = mediaBySession.get(ev.classSessionId) ?? [];
              return (
                <li key={ev.responseId} className="rounded-xl border border-neutral-200 bg-white p-4">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-neutral-900">
                      {ev.classCode ? `${ev.classCode} · ` : ""}
                      {ev.className ?? ev.roundName}
                    </span>
                    {ev.sessionDate && (
                      <span className="text-xs tabular-nums text-neutral-400">{fmtDate(ev.sessionDate)}</span>
                    )}
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                    <span>GV: {ev.teacherName ?? "—"}</span>
                    {ev.sessionTopic && <span>· {ev.sessionTopic}</span>}
                  </div>

                  {ev.answers.length === 0 ? (
                    <p className="text-sm text-neutral-400">Phiếu chưa có nội dung.</p>
                  ) : (
                    <dl className="space-y-2">
                      {ev.answers.map((a) => (
                        <AnswerRow key={a.questionId} answer={a} />
                      ))}
                    </dl>
                  )}

                  {media.length > 0 && (
                    <div className="mt-3 border-t border-neutral-100 pt-3">
                      <p className="mb-1.5 text-xs font-medium text-neutral-500">Hình ảnh buổi học</p>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {media.map((m) => (
                          <a
                            key={m.id}
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="overflow-hidden rounded-lg border border-neutral-200"
                          >
                            <img
                              src={m.url}
                              alt={m.caption ?? "Ảnh buổi học"}
                              className="h-20 w-full object-cover sm:h-24"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* (1) Nhận xét cũ (StudentSessionFeedback) — giữ song song */}
      {feedbacks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Nhận xét theo buổi
          </h2>
          <ul className="space-y-3">
            {feedbacks.map((f) => (
              <li key={f.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-neutral-900">
                    {f.classSession.class.classCode ? `${f.classSession.class.classCode} · ` : ""}
                    {f.classSession.class.name}
                  </span>
                  <span className="text-xs tabular-nums text-neutral-400">
                    {fmtDate(f.classSession.date)}
                  </span>
                </div>
                <div className="mb-1.5 flex items-center gap-2 text-xs text-neutral-500">
                  <span>GV: {f.classSession.class.teacher?.name ?? "—"}</span>
                  {f.rating != null && (
                    <span className="text-amber-500">
                      {"★".repeat(f.rating)}
                      {"☆".repeat(5 - f.rating)}
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm text-neutral-700">{f.comment}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AnswerRow({ answer }: { answer: RenderedAnswer }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500">{answer.label}</dt>
      <dd className="text-sm text-neutral-800">
        {answer.type === "STAR_RATING" && answer.stars != null && (
          <span className="text-amber-500">
            {"★".repeat(answer.stars)}
            {"☆".repeat(5 - answer.stars)}
          </span>
        )}
        {(answer.type === "RADIO" || answer.type === "CHECKBOX") && answer.options && (
          <span>{answer.options.join(", ")}</span>
        )}
        {answer.type === "PHOTO" && answer.photos && answer.photos.length > 0 && (
          <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {answer.photos.map((u) => (
              <a
                key={u}
                href={u}
                target="_blank"
                rel="noopener noreferrer"
                className="overflow-hidden rounded-lg border border-neutral-200"
              >
                <img src={u} alt="Ảnh dự án" className="h-20 w-full object-cover sm:h-24" />
              </a>
            ))}
          </div>
        )}
        {answer.type !== "PHOTO" && answer.text && (
          <span className="whitespace-pre-wrap">{answer.text}</span>
        )}
      </dd>
    </div>
  );
}
