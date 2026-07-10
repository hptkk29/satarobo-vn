// app/(teacher)/teacher/hoc-vien/page.tsx — MÀN 3: "Hồ sơ học viên" site GV.
//
// Visual PORT từ mock satarobo-ui-giaovien (students/[id]/student-profile.tsx) rút về
// tone neutral + shadcn của repo thật; tab của mock → section xếp dọc (server-first,
// không cần client state — màn chỉ ĐỌC, không mutation). 2 mức điều hướng qua
// searchParams (pattern lop/cham-bai — không route động):
//   (a) không tham số → grid học viên các lớp mình (drill-down nhưng vẫn cho list
//       gọn để GV tự tìm — hữu ích hơn redirect về /teacher).
//   (b) ?s=<studentId> → hồ sơ: chuyên cần / năng lực học bạ / bài tập / nhận xét
//       gần đây. (URL teacher/admin CHO PHÉP studentId — chỉ portal cấm.)
//
// Guard chống IDOR: HV phải có ≥1 enrollment (MỌI status, chưa xoá mềm) trong lớp
// ∈ actor.assignedClassIds → không thì NotYours. Mọi query con đều ràng classId ∈
// assignedClassIds: AssignmentSubmission / StudentSessionFeedback ∉ SCOPED_MODELS
// → sdb pass-through SAU guard; Enrollment / ReportCard là SCOPED_MODELS (scopedDb
// tự cách ly cơ sở). Raw db CHỈ qua lib/**: attendanceSummary (lib/attendance/summary
// — ownership do caller gác, pattern lib/students/progress) + getCourseCriteria
// (lib/lms/report-card) — app/(teacher) KHÔNG import @/lib/db trần.
//
// ⚠️ Câu 46: KHÔNG SĐT/email/tên phụ huynh — mock lộ parentName/phone, KHÔNG port.
// Student CHỈ select {id, name, studentCode, avatarUrl, currentGrade, school}.
import Link from "next/link";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { attendanceSummary } from "@/lib/attendance/summary";
import { getCourseCriteria } from "@/lib/lms/report-card";
import { ENROLLMENT_STATUS } from "@/lib/labels/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Hồ sơ học viên | Giáo viên Sata Robo" };

const dayFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

// Điểm TB hiển thị tối đa 1 chữ số lẻ (8 · 8,5) — thang điểm quen của PH/GV.
const scoreFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

// Nhãn mức năng lực 1-4 — đồng bộ LEVEL_LABEL của admin report-card-editor.
const LEVEL_LABEL: Record<number, string> = {
  1: "1 · Cần cố gắng",
  2: "2 · Đạt",
  3: "3 · Khá",
  4: "4 · Tốt",
};

/** Initials avatar (pattern hoc-ba/page.tsx — không thêm dependency). */
const initials = (name: string) =>
  name
    .split(" ")
    .slice(-2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

export default async function TeacherStudentProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate — guard cho type-narrow

  const { s: studentId } = await searchParams;
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const classIds = [...actor.assignedClassIds];

  // ── (b) Hồ sơ 1 học viên ──────────────────────────────────────────────────────
  if (studentId) {
    // Guard đọc TRƯỚC khi render: HV phải có ghi danh (mọi status) trong lớp mình —
    // chống IDOR đổi ?s= trên URL. Enrollment scoped → cách ly cơ sở tự động.
    const enrollments = classIds.length
      ? await sdb.enrollment.findMany({
          where: { studentId, classId: { in: classIds }, deletedAt: null },
          select: {
            id: true,
            classId: true,
            courseId: true,
            status: true,
            // Câu 46: Student CHỈ field định danh học tập — KHÔNG parent*/phone/email.
            student: {
              select: {
                id: true,
                name: true,
                studentCode: true,
                avatarUrl: true,
                currentGrade: true,
                school: true,
              },
            },
            class: { select: { name: true } },
            course: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];
    if (enrollments.length === 0) return <NotYours />;
    const student = enrollments[0].student;
    const enrollmentIds = enrollments.map((e) => e.id);

    const [summaries, criteriaLists, cards, subs, feedbacks] = await Promise.all([
      // Chuyên cần từng ghi danh — raw db qua lib helper, ownership đã gác ở trên.
      Promise.all(enrollments.map((e) => attendanceSummary(e.id))),
      // Tiêu chí năng lực ACTIVE của khoá (tên tiêu chí — ReportCardScore chỉ có ref phẳng).
      Promise.all(enrollments.map((e) => getCourseCriteria(e.courseId))),
      sdb.reportCard.findMany({
        where: { enrollmentId: { in: enrollmentIds } },
        select: {
          enrollmentId: true,
          scores: { select: { criterionId: true, level: true } },
        },
      }),
      // Bài tập của HV trong lớp mình — guard qua assignment.classId (model không scoped).
      sdb.assignmentSubmission.findMany({
        where: { studentId, assignment: { classId: { in: classIds } } },
        select: { status: true, score: true },
      }),
      // Nhận xét buổi học 5 bản mới nhất — guard qua classSession.classId.
      sdb.studentSessionFeedback.findMany({
        where: { studentId, classSession: { classId: { in: classIds } } },
        select: {
          id: true,
          comment: true,
          rating: true,
          classSession: {
            select: { date: true, topic: true, class: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const cardByEnrollment = new Map(cards.map((c) => [c.enrollmentId, c]));

    // Thống kê bài tập: đã nộp (khác NOT_SUBMITTED) / đã chấm / điểm TB (score ≠ null).
    const submitted = subs.filter((x) => x.status !== "NOT_SUBMITTED").length;
    const graded = subs.filter((x) => x.status === "GRADED").length;
    const scored = subs.filter((x) => x.score != null);
    const avgScore = scored.length
      ? scored.reduce((t, x) => t + (x.score ?? 0), 0) / scored.length
      : null;

    return (
      <div className="space-y-5">
        <BackLink href="?" label="← Học viên lớp tôi" />

        {/* Định danh — avatar + tên + mã HV + lớp trường (KHÔNG contact PH, câu 46) */}
        <div className="flex items-center gap-4">
          {student.avatarUrl ? (
            // Thumbnail nội bộ nhỏ — cùng ngoại lệ <img> như bảng /admin/students.
            <img
              src={student.avatarUrl}
              alt={student.name}
              className="h-14 w-14 shrink-0 rounded-full border border-neutral-200 object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-purple-100 text-lg font-semibold text-purple-700">
              {initials(student.name)}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-neutral-900">
              {student.name}
              {student.studentCode ? (
                <span className="text-neutral-400"> ({student.studentCode})</span>
              ) : null}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {[
                student.currentGrade != null ? `Lớp ${student.currentGrade}` : null,
                student.school,
              ]
                .filter(Boolean)
                .join(" · ") || "Chưa có thông tin trường lớp"}
            </p>
          </div>
        </div>

        {/* Theo từng ghi danh lớp mình: chuyên cần + năng lực học bạ */}
        {enrollments.map((e, i) => {
          const sum = summaries[i];
          const criteria = criteriaLists[i];
          const levelByCriterion = new Map(
            (cardByEnrollment.get(e.id)?.scores ?? []).map((sc) => [sc.criterionId, sc.level]),
          );
          const rate = sum.total > 0 ? Math.round((sum.attended / sum.total) * 100) : null;
          return (
            <Card key={e.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {e.class.name} · {e.course.name}
                  </CardTitle>
                  <Badge variant="outline">{ENROLLMENT_STATUS.label(e.status)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Chuyên cần — attendanceSummary: attended đã gồm buổi bù xong */}
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Chuyên cần
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <StatBox
                      value={rate != null ? `${rate}%` : "—"}
                      label="Tỉ lệ chuyên cần"
                      tone="emerald"
                    />
                    <StatBox
                      value={sum.total > 0 ? `${sum.attended}/${sum.total}` : String(sum.attended)}
                      label="Đã học (buổi)"
                      tone="blue"
                    />
                    <StatBox
                      value={String(sum.absent + sum.needMakeup)}
                      label="Vắng (buổi)"
                      tone="rose"
                    />
                  </div>
                  {(sum.madeUp > 0 || sum.needMakeup > 0) && (
                    <p className="mt-2 text-xs text-neutral-500">
                      {sum.madeUp > 0 ? `Đã học bù ${sum.madeUp} buổi (tính vào đã học).` : ""}
                      {sum.madeUp > 0 && sum.needMakeup > 0 ? " " : ""}
                      {sum.needMakeup > 0 ? `Đang chờ bù ${sum.needMakeup} buổi.` : ""}
                    </p>
                  )}
                </section>

                {/* Năng lực học bạ — tiêu chí khoá + level 1-4 đã chấm */}
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Năng lực (học bạ, thang 1-4)
                  </h3>
                  {criteria.length === 0 ? (
                    <p className="text-sm text-neutral-400">
                      Khoá học chưa cấu hình tiêu chí năng lực.
                    </p>
                  ) : levelByCriterion.size === 0 ? (
                    <p className="text-sm text-neutral-400">
                      Học bạ chưa chấm tiêu chí nào — vào mục Học bạ để nhập.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {criteria.map((c) => (
                        <CompetencyBar
                          key={c.id}
                          label={c.name}
                          level={levelByCriterion.get(c.id) ?? null}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </CardContent>
            </Card>
          );
        })}

        {/* Bài tập & kiểm tra — gộp mọi lớp mình phụ trách */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Bài tập &amp; kiểm tra</CardTitle>
          </CardHeader>
          <CardContent>
            {subs.length === 0 ? (
              <p className="text-sm text-neutral-400">
                Chưa có bài tập nào được giao trong lớp bạn phụ trách.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <StatBox value={`${submitted}/${subs.length}`} label="Đã nộp" tone="blue" />
                <StatBox value={String(graded)} label="Đã chấm" tone="emerald" />
                <StatBox
                  value={avgScore != null ? scoreFmt.format(avgScore) : "—"}
                  label="Điểm trung bình"
                  tone="amber"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Nhận xét gần đây — 5 bản mới nhất từ StudentSessionFeedback lớp mình */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Nhận xét gần đây</CardTitle>
          </CardHeader>
          <CardContent>
            {feedbacks.length === 0 ? (
              <p className="text-sm text-neutral-400">Chưa có nhận xét buổi học nào.</p>
            ) : (
              <ul className="space-y-3">
                {feedbacks.map((f) => (
                  <li key={f.id} className="rounded-lg bg-neutral-50 px-3.5 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-neutral-500">
                        {dayFmt.format(f.classSession.date)} · {f.classSession.class.name}
                        {f.classSession.topic ? ` · ${f.classSession.topic}` : ""}
                      </p>
                      {f.rating != null && <RatingStars rating={f.rating} />}
                    </div>
                    <p className="mt-1 text-sm text-neutral-800">{f.comment}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── (a) Grid học viên các lớp mình ────────────────────────────────────────────
  const enrRows = classIds.length
    ? await sdb.enrollment.findMany({
        where: { classId: { in: classIds }, deletedAt: null },
        select: {
          // Câu 46: CHỈ tên + mã HV — KHÔNG contact PH.
          student: { select: { id: true, name: true, studentCode: true } },
          class: { select: { name: true } },
        },
        orderBy: { student: { name: "asc" } },
      })
    : [];

  // HV học 2 lớp mình → gộp 1 card, liệt kê các lớp.
  const byStudent = new Map<
    string,
    { name: string; studentCode: string | null; classes: string[] }
  >();
  for (const r of enrRows) {
    const cur = byStudent.get(r.student.id) ?? {
      name: r.student.name,
      studentCode: r.student.studentCode,
      classes: [],
    };
    if (!cur.classes.includes(r.class.name)) cur.classes.push(r.class.name);
    byStudent.set(r.student.id, cur);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Hồ sơ học viên</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Học viên các lớp bạn phụ trách — chọn học viên để xem chuyên cần, năng lực,
          bài tập và nhận xét.
        </p>
      </div>
      {byStudent.size === 0 ? (
        <EmptyBox text="Bạn chưa được phân công lớp nào hoặc lớp chưa có học viên." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...byStudent.entries()].map(([id, s]) => (
            // href CHỈ-query (giữ path hiện tại): chạy đúng cả trên host giaovien
            // (clean URL /hoc-vien) LẪN localhost/preview (path thật /teacher/hoc-vien).
            <Link key={id} href={`?s=${id}`} className="block">
              <Card className="h-full transition-colors hover:border-neutral-400">
                <CardContent className="flex items-center gap-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-semibold text-purple-700">
                    {initials(s.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {s.name}
                      {s.studentCode ? (
                        <span className="text-neutral-400"> ({s.studentCode})</span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-neutral-500">{s.classes.join(" · ")}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ô chỉ số nhỏ (port StatCard của mock về tile Tailwind thuần). */
const STAT_TONE = {
  emerald: "bg-emerald-50 text-emerald-700",
  blue: "bg-blue-50 text-blue-700",
  rose: "bg-rose-50 text-rose-700",
  amber: "bg-amber-50 text-amber-700",
} as const;

function StatBox({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: keyof typeof STAT_TONE;
}) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${STAT_TONE[tone]}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}

/** Thanh năng lực level 1-4 (port CompetencyBar của mock, đổi thang 10 → 4). */
function CompetencyBar({ label, level }: { label: string; level: number | null }) {
  const pct = level != null ? Math.round((Math.min(4, Math.max(0, level)) / 4) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-medium text-neutral-800">{label}</span>
        <span className="shrink-0 text-xs font-semibold text-neutral-600">
          {level != null ? (LEVEL_LABEL[level] ?? String(level)) : "Chưa chấm"}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full rounded-full bg-purple-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Sao đánh giá 1-5 (đọc-only — khớp rating của StudentSessionFeedback). */
function RatingStars({ rating }: { rating: number }) {
  const filled = Math.max(0, Math.min(5, rating));
  return (
    <span className="text-sm leading-none text-amber-500" aria-label={`${filled}/5 sao`}>
      {"★".repeat(filled)}
      <span className="text-neutral-300">{"★".repeat(5 - filled)}</span>
    </span>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-sm text-neutral-500 hover:text-neutral-800">
      {label}
    </Link>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
      <p className="text-sm text-neutral-500">{text}</p>
    </div>
  );
}

function NotYours() {
  return (
    <div className="space-y-4">
      <BackLink href="?" label="← Hồ sơ học viên" />
      <EmptyBox text="Học viên không thuộc lớp bạn phụ trách." />
    </div>
  );
}
