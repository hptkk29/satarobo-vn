"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStudentProgress } from "@/lib/progress";
import { sendProgressReportEmail } from "@/lib/email/progress-report";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";

// =============================================================================
// CLASS LMS ACTIONS — Phase T2.1
// Tạo báo cáo tiến độ hàng loạt cho cả lớp + gửi email phụ huynh.
// =============================================================================

const ALLOWED_ROLES = ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"] as const;

export async function generateClassProgressReports(
  classId: string,
): Promise<{ ok: boolean; created?: number; emailed?: number; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  const role = session.user.role;
  if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    return { ok: false, error: "Không có quyền tạo báo cáo" };
  }

  const cls = await db.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: { id: true, name: true, teacherId: true },
  });
  if (!cls) return { ok: false, error: "Không tìm thấy lớp" };

  // TEACHER chỉ tạo báo cáo cho lớp mình phụ trách.
  if (role === "TEACHER" && cls.teacherId !== session.user.id) {
    return { ok: false, error: "Chỉ giáo viên phụ trách lớp mới tạo được báo cáo" };
  }

  const enrollments = await db.enrollment.findMany({
    where: { classId, status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
    select: {
      student: {
        select: {
          id: true,
          name: true,
          parentName: true,
          parentEmail: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  if (enrollments.length === 0) {
    return { ok: false, error: "Lớp chưa có học viên đang học" };
  }

  const actorName = session.user.name ?? session.user.email ?? "Hệ thống";
  const actorId = session.user.id ?? null;
  let created = 0;
  let emailed = 0;

  for (const e of enrollments) {
    const st = e.student;
    const p = await getStudentProgress(st.id, classId);

    let sent = false;
    if (st.parentEmail) {
      sent = await sendProgressReportEmail({
        studentId: st.id,
        parentEmail: st.parentEmail,
        parentName: st.parentName ?? "Quý phụ huynh",
        studentName: st.name,
        className: cls.name,
        attendanceRate: p.attendanceRate,
        attendedSessions: p.attendedSessions,
        totalSessions: p.totalSessions,
        coveredLessons: p.coveredLessons,
        totalLessons: p.totalLessons,
        submittedAssignments: p.submittedAssignments,
        totalAssignments: p.totalAssignments,
        averageScore: p.averageScore,
        passedExams: p.passedExams,
        examAttempts: p.examAttempts,
        actor: { userId: actorId, name: actorName },
      });
      if (sent) emailed++;
    }

    await db.progressReportLog.create({
      data: {
        studentId: st.id,
        classId,
        reportTitle: `Báo cáo tiến độ — ${cls.name}`,
        sentToEmail: sent ? st.parentEmail : null,
        sentAt: sent ? new Date() : null,
        metadata: {
          generatedByName: actorName,
          attendanceRate: p.attendanceRate,
          attendedSessions: p.attendedSessions,
          totalSessions: p.totalSessions,
          coveredLessons: p.coveredLessons,
          totalLessons: p.totalLessons,
          submittedAssignments: p.submittedAssignments,
          totalAssignments: p.totalAssignments,
          gradedAssignments: p.gradedAssignments,
          averageScore: p.averageScore,
          passedExams: p.passedExams,
          examAttempts: p.examAttempts,
        },
      },
    });
    created++;
  }

  revalidatePath(`/classes/${classId}/progress`);
  return { ok: true, created, emailed };
}
