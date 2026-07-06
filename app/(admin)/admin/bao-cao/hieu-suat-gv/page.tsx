import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { BarChart } from "@/components/charts/bar-chart";
import {
  buildTeacherPerformanceReport,
  type EnrollmentStatusValue,
  type TeacherAttendanceRecord,
  type TeacherEnrollmentRecord,
  type TeacherInfo,
  type TeacherScoreRecord,
  type TeacherSessionRecord,
} from "@/lib/reports/teacher-performance";
import type {
  AttendanceStatusValue,
  MakeupStatusValue,
  SessionStatusValue,
} from "@/lib/labels";

export const metadata = { title: "Báo cáo hiệu suất GV | Admin" };
export const dynamic = "force-dynamic";

const num = (n: number) => n.toLocaleString("vi-VN");

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-neutral-800">{title}</h2>
      {children}
    </section>
  );
}

export default async function TeacherPerformanceReportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Gate: quản lý đào tạo / xem lớp (Đào tạo + quản lý cơ sở + Admin).
  if (
    !(await checkPermission("classes:view-all")) &&
    !(await checkPermission("training:manage"))
  ) {
    redirect("/dashboard");
  }

  const actor = await resolveActor(session.user.id);
  // Class auto-scoped theo cơ sở (HO/SUPER_ADMIN bypass). Các model KHÔNG scoped
  // (ClassSession/Attendance/ReportCard*) đi qua sdb pass-through nhưng LỌC THỦ CÔNG
  // theo classIds/enrollmentIds đã scope → giữ cách ly cơ sở (AC5).
  const sdb = scopedDb(actor);

  // 1. Lớp trong phạm vi cơ sở + GV phụ trách.
  const classRows = await sdb.class.findMany({
    where: { deletedAt: null },
    take: 500,
    select: { id: true, teacherId: true },
  });
  const classIds = classRows.map((c) => c.id);
  const classToTeacher = new Map<string, string>();
  for (const c of classRows) if (c.teacherId) classToTeacher.set(c.id, c.teacherId);

  // 2. Buổi học của các lớp này (ClassSession không scoped → lọc theo classIds).
  const sessionRows = classIds.length
    ? await sdb.classSession.findMany({
        where: { classId: { in: classIds } },
        select: { classId: true, status: true, actualTeacherId: true },
      })
    : [];

  // 3. Điểm danh các buổi của những lớp này.
  const attendanceRows = classIds.length
    ? await sdb.attendance.findMany({
        where: { session: { classId: { in: classIds } } },
        select: {
          status: true,
          makeupStatus: true,
          session: { select: { classId: true, status: true } },
        },
      })
    : [];

  // 4. Ghi danh thuộc các lớp này (đếm HV + bắc cầu tới học bạ).
  const enrollmentRows = classIds.length
    ? await sdb.enrollment.findMany({
        where: { classId: { in: classIds }, deletedAt: null },
        select: { id: true, studentId: true, classId: true, status: true },
      })
    : [];
  const enrollmentToClass = new Map(enrollmentRows.map((e) => [e.id, e.classId]));
  const enrollmentIds = enrollmentRows.map((e) => e.id);

  // 5. Học bạ + điểm tiêu chí (ReportCard không scoped → lọc theo enrollmentIds đã scope).
  const reportCardRows = enrollmentIds.length
    ? await sdb.reportCard.findMany({
        where: { enrollmentId: { in: enrollmentIds } },
        select: { id: true, enrollmentId: true, teacherId: true },
      })
    : [];
  const reportCardToTeacher = new Map<string, string>();
  for (const rc of reportCardRows) {
    const teacherId =
      rc.teacherId ?? classToTeacher.get(enrollmentToClass.get(rc.enrollmentId) ?? "");
    if (teacherId) reportCardToTeacher.set(rc.id, teacherId);
  }
  const reportCardIds = reportCardRows.map((rc) => rc.id);
  const scoreRows = reportCardIds.length
    ? await sdb.reportCardScore.findMany({
        where: { reportCardId: { in: reportCardIds } },
        select: { reportCardId: true, level: true },
      })
    : [];

  // 6. GV cần đưa vào báo cáo = GV phụ trách lớp ∪ GV dạy thực tế buổi.
  const teacherIdSet = new Set<string>(classToTeacher.values());
  for (const s of sessionRows) {
    const tId = s.actualTeacherId ?? classToTeacher.get(s.classId);
    if (tId) teacherIdSet.add(tId);
  }
  const teacherIds = [...teacherIdSet];
  // User KHÔNG thuộc SCOPED_MODELS → sdb pass-through (chỉ lấy id→tên gắn nhãn).
  const userRows = teacherIds.length
    ? await sdb.user.findMany({
        where: { id: { in: teacherIds } },
        select: { id: true, name: true },
      })
    : [];
  const teachers: TeacherInfo[] = userRows.map((u) => ({ id: u.id, name: u.name }));

  // ── Gắn teacherId vào từng record cho hàm THUẦN ────────────────────────────
  const sessions: TeacherSessionRecord[] = [];
  for (const s of sessionRows) {
    const teacherId = s.actualTeacherId ?? classToTeacher.get(s.classId);
    if (teacherId) sessions.push({ teacherId, status: s.status as SessionStatusValue });
  }

  const attendances: TeacherAttendanceRecord[] = [];
  for (const a of attendanceRows) {
    const teacherId = classToTeacher.get(a.session.classId);
    if (teacherId) {
      attendances.push({
        teacherId,
        status: a.status as AttendanceStatusValue,
        makeupStatus: a.makeupStatus as MakeupStatusValue,
        sessionStatus: a.session.status as SessionStatusValue,
      });
    }
  }

  const enrollments: TeacherEnrollmentRecord[] = [];
  for (const e of enrollmentRows) {
    const teacherId = classToTeacher.get(e.classId);
    if (teacherId) {
      enrollments.push({
        teacherId,
        studentId: e.studentId,
        status: e.status as EnrollmentStatusValue,
      });
    }
  }

  const scores: TeacherScoreRecord[] = [];
  for (const sc of scoreRows) {
    const teacherId = reportCardToTeacher.get(sc.reportCardId);
    if (teacherId) scores.push({ teacherId, level: sc.level });
  }

  const report = buildTeacherPerformanceReport({
    teachers,
    sessions,
    attendances,
    enrollments,
    scores,
  });

  const chartData = report.rows
    .filter((r) => r.sessionsTaught > 0)
    .slice(0, 12)
    .map((r) => ({ name: r.teacherName, "Buổi đã dạy": r.sessionsTaught }));

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Báo cáo hiệu suất giáo viên</h1>
        <p className="text-sm text-neutral-500">
          Số buổi đã dạy, chuyên cần lớp phụ trách, số học viên và điểm học bạ trung bình — theo phạm vi cơ sở của bạn.
        </p>
      </div>

      <Card title="Số buổi đã dạy theo giáo viên">
        {chartData.length > 0 ? (
          <BarChart
            data={chartData}
            xKey="name"
            bars={[{ key: "Buổi đã dạy", name: "Buổi đã dạy", color: "#F97316" }]}
            height={300}
          />
        ) : (
          <p className="py-8 text-center text-sm text-neutral-400">
            Chưa có buổi học hoàn tất trong phạm vi.
          </p>
        )}
      </Card>

      <section className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-700">Chi tiết theo giáo viên</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Giáo viên</th>
                <th className="px-4 py-2 text-right">Buổi đã dạy</th>
                <th className="px-4 py-2 text-right">Chuyên cần</th>
                <th className="px-4 py-2 text-right">Học viên</th>
                <th className="px-4 py-2 text-right">Điểm học bạ TB</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    Không có giáo viên phụ trách lớp trong phạm vi cơ sở.
                  </td>
                </tr>
              ) : (
                report.rows.map((r) => (
                  <tr key={r.teacherId} className="border-t">
                    <td className="px-4 py-2 font-medium">{r.teacherName}</td>
                    <td className="px-4 py-2 text-right">{num(r.sessionsTaught)}</td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {r.attendanceCounted > 0 ? `${r.attendanceRate}%` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">{num(r.studentCount)}</td>
                    <td className="px-4 py-2 text-right">
                      {r.avgReportScore != null ? `${r.avgReportScore}/4` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
