import Link from "next/link";
import { LineChart } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can, hasRole } from "@/lib/auth/permissions";
import { getStudentProgress } from "@/lib/progress";
import { getStudentClassProgress, getStudentAbsences } from "@/lib/students/progress";
import { StudentForm, type StudentFormValue } from "../../_components/student-form";
import { GeneratePdfButton } from "./_pdf-button";
import { LifecycleActions } from "../../_components/lifecycle-actions";
import { ReserveHistorySection } from "../../_components/reserve-history-section";
import { ParentAccountSection } from "../../_components/parent-account-section";
import { ParentChildrenManager } from "../../_components/parent-children-manager";
import { SkillEditor } from "../_components/skill-editor";
import type { RoboticsSkill, SkillLevel } from "@prisma/client";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditStudentPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "students:edit")) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;

  const [student, centers] = await Promise.all([
    db.student.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        studentCode: true,
        dateOfBirth: true,
        gender: true,
        phone: true,
        email: true,
        avatarUrl: true,
        currentGrade: true,
        school: true,
        parentName: true,
        parentPhone: true,
        parentEmail: true,
        parentRelation: true,
        parent2Name: true,
        parent2Phone: true,
        parent2Relation: true,
        address: true,
        ward: true,
        district: true,
        city: true,
        bloodType: true,
        allergies: true,
        healthNotes: true,
        enrollmentDate: true,
        preferredCenterId: true,
        notes: true,
        status: true,
        centerId: true,
        parentUserId: true,
        parentUser: { select: { email: true, name: true, accountStatus: true } },
      },
    }),
    db.center.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!student) notFound();

  // Commit 3 — đa con: các con đang gắn cùng phụ huynh này.
  const parentChildren = student.parentUserId
    ? await db.student.findMany({
        where: { parentUserId: student.parentUserId, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true, studentCode: true },
      })
    : [];

  // LMS-5 — năng lực: lấy bản đánh giá mới nhất mỗi kỹ năng.
  const skillRows = await db.studentSkillAssessment.findMany({
    where: { studentId: id },
    orderBy: { assessedAt: "desc" },
    select: { skill: true, level: true, note: true, assessedAt: true },
  });
  const latestSkills: Partial<Record<RoboticsSkill, { level: SkillLevel; note: string }>> = {};
  for (const r of skillRows) {
    if (!latestSkills[r.skill]) latestSkills[r.skill] = { level: r.level, note: r.note ?? "" };
  }
  const canAssessSkills =
    hasRole(session.user, "SUPER_ADMIN") ||
    (hasRole(session.user, "CENTER_MANAGER") && student.centerId === session.user.centerId);

  const formValue: StudentFormValue = {
    id: student.id,
    name: student.name,
    studentCode: student.studentCode,
    dateOfBirth: student.dateOfBirth,
    gender: student.gender,
    phone: student.phone,
    email: student.email,
    avatarUrl: student.avatarUrl,
    currentGrade: student.currentGrade,
    school: student.school,
    parentName: student.parentName,
    parentPhone: student.parentPhone,
    parentEmail: student.parentEmail,
    parentRelation: student.parentRelation,
    parent2Name: student.parent2Name,
    parent2Phone: student.parent2Phone,
    parent2Relation: student.parent2Relation,
    address: student.address,
    ward: student.ward,
    district: student.district,
    city: student.city,
    bloodType: student.bloodType,
    allergies: student.allergies ?? [],
    healthNotes: student.healthNotes,
    enrollmentDate: student.enrollmentDate,
    preferredCenterId: student.preferredCenterId,
    notes: student.notes,
    status: student.status,
    centerId: student.centerId,
  };

  const activeEnrollments = await db.enrollment.findMany({
    where: {
      studentId: id,
      status: { in: ["CONFIRMED", "STUDYING", "ACTIVE"] },
    },
    select: {
      id: true,
      class: {
        select: {
          id: true,
          name: true,
          classCode: true,
          course: { select: { name: true } },
          center: { select: { name: true } },
        },
      },
    },
  });

  const [activeReserve, lifecycleEnrollments] = await Promise.all([
    db.studentReserve.findFirst({
      where: { studentId: id, isActive: true },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        startedAt: true,
        expectedEndAt: true,
        reason: true,
      },
    }),
    db.enrollment.findMany({
      where: { studentId: id },
      select: {
        id: true,
        status: true,
        class: { select: { name: true } },
      },
      orderBy: { enrolledAt: "desc" },
    }),
  ]);

  const progressByClass = await Promise.all(
    activeEnrollments.map(async (e) => ({
      enrollment: e,
      progress: await getStudentProgress(id, e.class.id),
      sessions: await getStudentClassProgress(id, e.class.id),
    })),
  );

  const absences = await getStudentAbsences(id);

  // #14 — Lịch sử học tập: TẤT CẢ lớp/khoá đã & đang học + tiến độ buổi.
  const historyRaw = await db.enrollment.findMany({
    where: { studentId: id },
    select: {
      id: true,
      status: true,
      classId: true,
      enrolledAt: true,
      endedAt: true,
      class: { select: { name: true, classCode: true, course: { select: { name: true } } } },
    },
    orderBy: { enrolledAt: "desc" },
  });
  const learningHistory = await Promise.all(
    historyRaw.map(async (e) => ({
      ...e,
      sessions: await getStudentClassProgress(id, e.classId),
    })),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-6 text-3xl font-black text-neutral-900">
          Sửa học viên:{" "}
          <span className="font-bold text-orange-600">{student.name}</span>
        </h1>
        <StudentForm student={formValue} centers={centers} />
      </div>

      <LifecycleActions
        studentId={student.id}
        studentName={student.name}
        studentStatus={student.status}
        activeReserve={activeReserve}
        enrollments={lifecycleEnrollments}
      />

      <ParentAccountSection
        studentId={student.id}
        linked={!!student.parentUserId}
        parentEmail={student.parentUser?.email ?? null}
        parentName={student.parentUser?.name ?? student.parentName}
        defaultEmail={student.parentEmail}
        pendingActivation={student.parentUser?.accountStatus === "PENDING_ACTIVATION"}
      />

      {student.parentUserId && (
        <ParentChildrenManager
          parentUserId={student.parentUserId}
          currentStudentId={student.id}
          children={parentChildren}
        />
      )}

      <ReserveHistorySection studentId={student.id} />

      {progressByClass.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-neutral-900">
            <LineChart className="h-5 w-5 text-[#7C3AED]" />
            Tiến độ học tập
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {progressByClass.map(({ enrollment, progress, sessions }) => (
              <div
                key={enrollment.id}
                className="rounded-xl border border-neutral-200 bg-white p-4"
              >
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-purple-50 px-3 py-2 text-sm">
                  <span className="font-bold text-[#7C3AED]">
                    Buổi {sessions.currentSession}/{sessions.total || "—"}
                  </span>
                  <span className="text-neutral-600">
                    Đã học <b className="text-neutral-900">{sessions.attended}</b>
                  </span>
                  <span className="text-neutral-600">
                    Còn lại <b className="text-neutral-900">{sessions.remaining}</b>
                  </span>
                </div>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-neutral-900">
                      {enrollment.class.name}
                    </h3>
                    <p className="text-xs text-neutral-500">
                      {enrollment.class.classCode &&
                        `${enrollment.class.classCode} · `}
                      {enrollment.class.course.name}
                      {enrollment.class.center?.name &&
                        ` · ${enrollment.class.center.name}`}
                    </p>
                    <Link
                      href={`/classes/${enrollment.class.id}/progress`}
                      className="mt-0.5 inline-block text-xs font-semibold text-[#7C3AED] hover:underline"
                    >
                      Xem lớp →
                    </Link>
                  </div>
                  <GeneratePdfButton
                    studentId={id}
                    classId={enrollment.class.id}
                    studentName={student.name}
                    className={enrollment.class.name}
                  />
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-sm">
                  <MiniStat
                    label="Điểm danh"
                    value={`${progress.attendedSessions}/${progress.totalSessions}`}
                    sub={`${progress.attendanceRate}%`}
                  />
                  <MiniStat
                    label="Bài học"
                    value={`${progress.coveredLessons}/${progress.totalLessons}`}
                  />
                  <MiniStat
                    label="Bài tập"
                    value={`${progress.submittedAssignments}/${progress.totalAssignments}`}
                  />
                  <MiniStat
                    label="Điểm TB"
                    value={
                      progress.averageScore !== null
                        ? `${progress.averageScore}/10`
                        : "—"
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {absences.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-neutral-900">
            Chi tiết buổi vắng ({absences.length})
          </h2>
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Ngày</th>
                  <th className="px-4 py-2">Lớp</th>
                  <th className="px-4 py-2">Lý do</th>
                  <th className="px-4 py-2">Học bù</th>
                </tr>
              </thead>
              <tbody>
                {absences.map((a, i) => (
                  <tr key={i} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2 tabular-nums text-neutral-700">
                      {new Date(a.date).toLocaleDateString("vi-VN")}
                    </td>
                    <td className="px-4 py-2 text-neutral-700">{a.className}</td>
                    <td className="px-4 py-2 text-neutral-600">{a.absenceReason ?? "—"}</td>
                    <td className="px-4 py-2">
                      {a.makeupStatus === "MADE_UP" ? (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                          Đã bù
                        </span>
                      ) : a.makeupStatus === "NEEDS_MAKEUP" ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          Cần bù
                        </span>
                      ) : (
                        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-500">
                          Không bù
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* #14 — Lịch sử học tập */}
      {learningHistory.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-neutral-900">
            <LineChart className="h-5 w-5 text-[#7C3AED]" /> Lịch sử học tập
          </h2>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Lớp / Khoá</th>
                  <th className="px-4 py-2 text-center">Buổi (đã học/tổng)</th>
                  <th className="px-4 py-2 text-center">Trạng thái</th>
                  <th className="px-4 py-2">Bắt đầu</th>
                  <th className="px-4 py-2">Kết thúc</th>
                </tr>
              </thead>
              <tbody>
                {learningHistory.map((h) => (
                  <tr key={h.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2">
                      <Link href={`/classes/${h.classId}/progress`} className="font-medium text-[#7C3AED] hover:underline">
                        {h.class.classCode ? `${h.class.classCode} · ` : ""}{h.class.name}
                      </Link>
                      <span className="block text-xs text-neutral-400">{h.class.course.name}</span>
                    </td>
                    <td className="px-4 py-2 text-center tabular-nums text-neutral-700">
                      {h.sessions.attended}/{h.sessions.total || "—"}
                      {h.sessions.absentNoMakeup > 0 && (
                        <span className="ml-1 text-xs text-rose-500">(vắng {h.sessions.absentNoMakeup})</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
                        {h.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 tabular-nums text-neutral-600">
                      {h.enrolledAt ? new Date(h.enrolledAt).toLocaleDateString("vi-VN") : "—"}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-neutral-600">
                      {h.endedAt ? new Date(h.endedAt).toLocaleDateString("vi-VN") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* LMS-5 — hồ sơ năng lực robotics */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-neutral-900">
          Hồ sơ năng lực robotics
        </h2>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <SkillEditor
            studentId={student.id}
            canEdit={canAssessSkills}
            initial={latestSkills}
          />
        </div>
      </section>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p className="text-sm font-bold text-neutral-900 tabular-nums">{value}</p>
      {sub && (
        <p className="text-[10px] text-neutral-500 tabular-nums">{sub}</p>
      )}
    </div>
  );
}
