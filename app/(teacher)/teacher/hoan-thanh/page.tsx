// app/(teacher)/teacher/hoan-thanh/page.tsx — MÀN 2: "Hoàn thành khoá" site GV (READ-ONLY).
//
// Port VISUAL từ mock satarobo-ui-giaovien/(admin)/hoan-thanh-khoa — data layer viết lại.
// QUYỀN: RBAC v2 đã SIẾT `completions:manage` khỏi TEACHER có chủ đích (seed-roles.ts —
// "QL xác nhận hoàn thành khoá") dù matrix v1 còn cho → màn GV CHỈ XEM TIẾN ĐỘ, KHÔNG có
// action ghi. Nút "Đề xuất hoàn thành" của mock = backlog (cần Kiệt chốt model/quyền).
//
// 2 mức điều hướng qua searchParams (không route động — giống /teacher/lop):
//   (a) không tham số → danh sách lớp được phân + tiến độ buổi COMPLETED/tổng (loại
//                       CANCELLED) + thanh % (div width — không Recharts).
//   (b) ?classId=…    → bảng học viên (enrollment active): chuyên cần + trạng thái
//                       CourseCompletion (badge "Đã hoàn thành + mã chứng chỉ" / "Chưa").
//
// Chuyên cần: KHÔNG dùng wrapper attendanceSummary(enrollmentId) — 2+ query/enrollment
// thành N+1 cho cả roster. Thay bằng 1 query attendance.findMany batch cho cả lớp rồi
// gom theo studentId qua hàm thuần computeAttendanceSummary (cùng ngữ nghĩa 5 chỉ số).
//
// Cách ly cơ sở + chống IDOR đọc: scopedDb(actor) + guard classId ∈ actor.assignedClassIds
// TRƯỚC mọi query chi tiết. CourseCompletion KHÔNG có centerId / KHÔNG ∈ SCOPED_MODELS →
// đọc qua sdb pass-through; own-class đã gác bằng assignedClassIds + courseId suy từ lớp
// (không tin client) — giống admin hoan-thanh-khoa/_actions.ts.
// ⚠️ Câu 46: payload chỉ TÊN học viên — KHÔNG SĐT/email/tên phụ huynh.
import Link from "next/link";
import { ArrowLeft, GraduationCap, Lock, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import {
  computeAttendanceSummary,
  type AttendanceSummaryItem,
} from "@/lib/attendance/summary";
import type {
  AttendanceStatusValue,
  MakeupStatusValue,
  SessionStatusValue,
} from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "../_components/ui/empty-state";
import { PageHeader } from "../_components/ui/page-header";

export const metadata = { title: "Hoàn thành khoá | Giáo viên Sata Robo" };

const dayFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

/** Initials avatar (đồng bộ hoc-ba — không thêm dependency). */
const initials = (name: string) =>
  name
    .split(" ")
    .slice(-2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

/** Gom kết quả groupBy buổi học → { tổng (loại CANCELLED), đã dạy, % }. */
function tallySessions(rows: { status: string; _count: { _all: number } }[]) {
  let total = 0;
  let completed = 0;
  for (const r of rows) {
    if (r.status === "CANCELLED") continue; // buổi hủy không tính tiến độ
    total += r._count._all;
    if (r.status === "COMPLETED") completed += r._count._all;
  }
  return { total, completed, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

export default async function TeacherCompletionsPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate — guard cho type-narrow

  const { classId } = await searchParams;
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const classIds = [...actor.assignedClassIds];

  // ── (b) Chi tiết 1 lớp — bảng học viên ───────────────────────────────────────
  if (classId) {
    // Gác ĐỌC chống IDOR TRƯỚC khi query: GV chỉ xem lớp mình phụ trách.
    if (!actor.assignedClassIds.has(classId)) return <NotYours />;

    const cls = await sdb.class.findUnique({
      where: { id: classId },
      select: { id: true, name: true, courseId: true, course: { select: { name: true } } },
    });
    if (!cls) return <NotYours />; // ngoài scope cơ sở / đã xoá

    const [sessionRows, enrollments] = await Promise.all([
      sdb.classSession.groupBy({
        by: ["status"],
        where: { classId },
        _count: { _all: true },
      }),
      sdb.enrollment.findMany({
        where: { classId, deletedAt: null, status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
        select: {
          id: true,
          studentId: true,
          student: { select: { name: true } }, // câu 46: CHỈ tên HV, KHÔNG contact PH
        },
        orderBy: { student: { name: "asc" } },
      }),
    ]);
    const progress = tallySessions(sessionRows);
    const studentIds = enrollments.map((e) => e.studentId);

    // Chuyên cần batch: 1 query cho cả lớp (thay vì attendanceSummary/enrollment = N+1).
    const attRows = studentIds.length
      ? await sdb.attendance.findMany({
          where: { studentId: { in: studentIds }, session: { classId } },
          select: {
            studentId: true,
            status: true,
            makeupStatus: true,
            session: { select: { status: true } },
          },
        })
      : [];
    // CourseCompletion theo unique (studentId, courseId) — courseId suy từ lớp.
    const completions = studentIds.length
      ? await sdb.courseCompletion.findMany({
          where: { courseId: cls.courseId, studentId: { in: studentIds } },
          select: { studentId: true, certificateCode: true, completedAt: true },
        })
      : [];

    const attByStudent = new Map<string, AttendanceSummaryItem[]>();
    for (const a of attRows) {
      const list = attByStudent.get(a.studentId) ?? [];
      list.push({
        status: a.status as AttendanceStatusValue,
        makeupStatus: a.makeupStatus as MakeupStatusValue | null,
        sessionStatus: a.session.status as SessionStatusValue,
      });
      attByStudent.set(a.studentId, list);
    }
    const completionByStudent = new Map(completions.map((c) => [c.studentId, c]));

    return (
      <div className="space-y-4">
        <BackLink href="?" label="Hoàn thành khoá" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{cls.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cls.course.name} · tiến độ và trạng thái hoàn thành khoá — chỉ xem.
          </p>
        </div>

        {/* Tiến độ lớp: buổi đã dạy / tổng buổi (loại buổi hủy) */}
        <Card>
          <CardContent className="space-y-2 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">Tiến độ lớp</span>
              <span className="text-muted-foreground">
                {progress.completed}/{progress.total} buổi · {progress.pct}%
              </span>
            </div>
            <ProgressBar pct={progress.pct} />
          </CardContent>
        </Card>

        {enrollments.length === 0 ? (
          <EmptyState icon={Users} title="Lớp chưa có học viên đang học." />
        ) : (
          <section className="t-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-4 py-3">Học viên</th>
                    <th scope="col" className="px-4 py-3">Chuyên cần</th>
                    <th scope="col" className="px-4 py-3">Hoàn thành khoá</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((e) => {
                    const s = computeAttendanceSummary({
                      totalLessons: progress.total,
                      attendances: attByStudent.get(e.studentId) ?? [],
                    });
                    const done = completionByStudent.get(e.studentId);
                    return (
                      <tr
                        key={e.id}
                        className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                              {initials(e.student.name)}
                            </span>
                            <span className="font-medium text-foreground">
                              {e.student.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {progress.completed === 0 ? (
                            <span className="text-xs text-muted-foreground">Chưa có buổi nào</span>
                          ) : (
                            <div>
                              <p className="font-medium text-foreground">
                                {s.attended}/{progress.completed} buổi
                              </p>
                              {s.absent > 0 || s.needMakeup > 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  Vắng {s.absent}
                                  {s.needMakeup > 0 ? ` · chờ bù ${s.needMakeup}` : ""}
                                </p>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {done ? (
                            <div className="flex flex-col gap-0.5">
                              <Badge
                                variant="outline"
                                className="w-fit border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
                              >
                                Đã hoàn thành · {done.certificateCode}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {dayFmt.format(done.completedAt)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Chưa hoàn thành</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    );
  }

  // ── (a) Danh sách lớp được phân + tiến độ ────────────────────────────────────
  const classes = classIds.length
    ? await sdb.class.findMany({
        where: { id: { in: classIds } },
        select: { id: true, name: true, course: { select: { name: true } } },
        orderBy: { name: "asc" },
      })
    : [];
  const sessionRows = classIds.length
    ? await sdb.classSession.groupBy({
        by: ["classId", "status"],
        where: { classId: { in: classIds } },
        _count: { _all: true },
      })
    : [];
  // Sĩ số đang học (groupBy 1 query — _count lồng where không dùng để khỏi lệch active).
  const enrollRows = classIds.length
    ? await sdb.enrollment.groupBy({
        by: ["classId"],
        where: {
          classId: { in: classIds },
          deletedAt: null,
          status: { in: ENROLLMENT_ACTIVE_STATUS_LIST },
        },
        _count: { _all: true },
      })
    : [];

  const sessionsByClass = new Map<string, { status: string; _count: { _all: number } }[]>();
  for (const r of sessionRows) {
    const list = sessionsByClass.get(r.classId) ?? [];
    list.push(r);
    sessionsByClass.set(r.classId, list);
  }
  const studentCountByClass = new Map(enrollRows.map((r) => [r.classId, r._count._all]));

  return (
    <div>
      <PageHeader
        title="Hoàn thành khoá"
        subtitle="Tiến độ khoá học và trạng thái hoàn thành của học viên các lớp bạn phụ trách — chỉ xem; xác nhận hoàn thành do trung tâm thao tác trên trang quản trị."
      />

      {classes.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Bạn chưa được phân công lớp nào." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {classes.map((c) => {
            const p = tallySessions(sessionsByClass.get(c.id) ?? []);
            return (
              // href CHỈ-query (giữ path hiện tại): chạy đúng cả trên host giaovien
              // (clean URL /hoan-thanh) LẪN localhost/preview (path /teacher/hoan-thanh).
              <Link key={c.id} href={`?classId=${c.id}`} className="block">
                <Card className="t-card-hover h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{c.course.name}</p>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {p.completed}/{p.total} buổi · {studentCountByClass.get(c.id) ?? 0} học viên
                      </span>
                      <span className="font-medium text-foreground">{p.pct}%</span>
                    </div>
                    <ProgressBar pct={p.pct} />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Thanh tiến độ thuần div (không Recharts — site GV cấm chart lib admin). */
function ProgressBar({ pct }: { pct: number }) {
  const width = Math.min(100, Math.max(0, pct));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-orange-500"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  );
}

function NotYours() {
  return (
    <div className="space-y-4">
      <BackLink href="?" label="Hoàn thành khoá" />
      <EmptyState icon={Lock} title="Lớp không thuộc danh sách bạn phụ trách." />
    </div>
  );
}
