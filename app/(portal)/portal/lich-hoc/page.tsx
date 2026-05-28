import { requireActiveStudent } from "@/lib/portal/session";
import { getStudentSessions } from "@/lib/portal/learning";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lịch học | Sata Robo" };

export default async function LichHocPage() {
  const { studentId } = await requireActiveStudent();
  const sessions = await getStudentSessions(studentId);

  const upcoming = sessions.filter((s) => !s.past);
  const past = sessions.filter((s) => s.past).reverse();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-neutral-900">Lịch học</h1>

      <Section title="Sắp tới">
        {upcoming.length === 0 ? (
          <Empty>Chưa có buổi học nào được lên lịch.</Empty>
        ) : (
          upcoming.map((s) => <Row key={s.id} s={s} />)
        )}
      </Section>

      {past.length > 0 && (
        <Section title="Đã diễn ra">
          {past.map((s) => (
            <Row key={s.id} s={s} dim />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-neutral-700">
        {title}
      </h2>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

function Row({
  s,
  dim,
}: {
  s: {
    id: string;
    date: string;
    topic: string | null;
    className: string;
    lessonTitle: string | null;
  };
  dim?: boolean;
}) {
  const d = new Date(s.date);
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 ${
        dim ? "opacity-70" : ""
      }`}
    >
      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-orange-50 text-orange-700">
        <span className="text-base font-bold leading-none">{d.getDate()}</span>
        <span className="text-[10px]">Th{d.getMonth() + 1}</span>
      </div>
      <div className="min-w-0">
        <p className="font-medium text-neutral-900">
          {s.lessonTitle ?? s.topic ?? "Buổi học"}
        </p>
        <p className="text-xs text-neutral-500">
          {s.className} ·{" "}
          {d.toLocaleString("vi-VN", {
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <li className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-400">
      {children}
    </li>
  );
}
