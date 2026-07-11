// app/(teacher)/teacher/cham-bai/_actions.ts — Site GV (L6): "Giao bài".
//
// GV giao 1 template (thư viện admin) cho LỚP MÌNH phụ trách → sinh Assignment
// PUBLISHED + clone câu hỏi (nếu có) + tạo bản nộp NOT_SUBMITTED cho HV active.
//
// BẢO MẬT — khoá 2 lớp:
//   (1) checkPermission("assignments:assign-own") — capability RIÊNG của GV (không
//       phải assignments:create của TRAINING). Xem lib/auth/permissions.ts.
//   (2) classId ∈ actor.assignedClassIds — cấp LỚP (không phải cấp cơ sở): GV chỉ
//       giao vào lớp mình phụ trách, không giao lung tung trong cơ sở.
// KHÔNG import @/lib/db trần (ESLint chặn app/(teacher)/**) — đi qua scopedDb.
// Roster/enrollment đọc QUA quan hệ class (đã guard) — enrollment dev có centerId=null
// bị scopedDb lọc mất khi query trực tiếp (xem ghi chú page.tsx).
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { templateToAssignmentData } from "@/lib/assignments/template";
import { getAuditActor } from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/audit-log";

const schema = z.object({
  templateId: z.string().min(1, "Hãy chọn một đầu bài"),
  classId: z.string().min(1, "Hãy chọn lớp"),
  // "YYYY-MM-DD" từ input date, hoặc rỗng = không hạn.
  due: z.string().trim().optional().nullable(),
});

type AssignResult = { ok: true; assignmentId: string } | { ok: false; error: string };

/** "YYYY-MM-DD" → cuối ngày đó theo giờ VN; rỗng/không hợp lệ → null. */
function parseDue(due?: string | null): Date | null {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  const d = new Date(`${due}T23:59:59+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function assignTemplateAction(input: {
  templateId: string;
  classId: string;
  due?: string | null;
}): Promise<AssignResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { templateId, classId } = parsed.data;
  const dueAt = parseDue(parsed.data.due);

  const actor = await resolveActor(session.user.id);

  // (2) Cấp LỚP: chỉ giao vào lớp mình phụ trách (chống IDOR đổi classId trên client).
  if (!actor.assignedClassIds.has(classId)) {
    return { ok: false, error: "Lớp không thuộc bạn phụ trách" };
  }
  // (1) Role có capability giao bài không.
  const allowed = await checkPermission("assignments:assign-own", { classId });
  if (!allowed) return { ok: false, error: "Không có quyền giao bài" };

  const sdb = scopedDb(actor);

  // Template thư viện (không có classId — không cần scope cơ sở).
  const template = await sdb.assignmentTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      title: true,
      description: true,
      instructions: true,
      kind: true,
      lessonId: true,
      totalPoints: true,
      allowText: true,
      allowFile: true,
    },
  });
  if (!template) return { ok: false, error: "Không tìm thấy đầu bài" };

  // Roster active + câu hỏi template — đọc QUA quan hệ class (guard) để né null-centerId.
  const cls = await sdb.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      name: true,
      enrollments: {
        where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
        select: { studentId: true },
      },
    },
  });
  if (!cls) return { ok: false, error: "Không tìm thấy lớp" };

  // 1 template → tối đa 1 bài/lớp (unique [classId, templateId]) — báo thân thiện.
  const dup = await sdb.assignment.findFirst({
    where: { classId, templateId },
    select: { id: true },
  });
  if (dup) return { ok: false, error: "Đầu bài này đã được giao cho lớp rồi" };

  const links = await sdb.assignmentTemplateQuestion.findMany({
    where: { templateId },
    orderBy: { order: "asc" },
    select: {
      question: {
        select: {
          type: true,
          text: true,
          explanation: true,
          imageUrl: true,
          difficulty: true,
          points: true,
          timeLimitSec: true,
          correctAnswer: true,
          tags: true,
          curriculumId: true,
          courseId: true,
          lessonId: true,
          choices: {
            orderBy: { order: "asc" },
            select: { order: true, text: true, isCorrect: true, imageUrl: true },
          },
        },
      },
    },
  });

  const me = await sdb.user.findUnique({
    where: { id: session.user.id },
    select: { employeeId: true },
  });
  // GV giao bài = bài PUBLISHED ngay (khác admin sinh DRAFT rồi publish riêng).
  const data = {
    ...templateToAssignmentData(template, {
      classId,
      createdById: me?.employeeId ?? null,
      dueAt,
    }),
    status: "PUBLISHED" as const,
  };

  let assignmentId: string;
  try {
    assignmentId = await sdb.$transaction(async (tx) => {
      const created = await tx.assignment.create({ data, select: { id: true } });

      // Clone câu hỏi template → Question sở hữu của bài giao (isPublic=false).
      for (const { question: q } of links) {
        await tx.question.create({
          data: {
            type: q.type,
            text: q.text,
            explanation: q.explanation,
            imageUrl: q.imageUrl,
            difficulty: q.difficulty,
            points: q.points,
            timeLimitSec: q.timeLimitSec,
            correctAnswer: q.correctAnswer,
            tags: q.tags,
            curriculumId: q.curriculumId,
            courseId: q.courseId,
            lessonId: q.lessonId,
            isPublic: false,
            assignmentId: created.id,
            choices: {
              create: q.choices.map((c) => ({
                order: c.order,
                text: c.text,
                isCorrect: c.isCorrect,
                imageUrl: c.imageUrl,
              })),
            },
          },
        });
      }

      // Bản nộp NOT_SUBMITTED cho HV active (để portal HV nộp + hiện "Đã nộp x/y").
      if (cls.enrollments.length > 0) {
        await tx.assignmentSubmission.createMany({
          data: cls.enrollments.map((e) => ({
            assignmentId: created.id,
            studentId: e.studentId,
            status: "NOT_SUBMITTED" as const,
          })),
          skipDuplicates: true,
        });
      }

      return created.id;
    });
  } catch (err) {
    console.error("[assignTemplateAction]", err);
    return { ok: false, error: "Lỗi cơ sở dữ liệu — không giao được bài" };
  }

  // Audit best-effort (không chặn).
  try {
    const { actorId, actorName } = getAuditActor(session);
    await writeAudit({
      actor: { id: actorId, name: actorName },
      module: "assignments",
      entityType: "Assignment",
      entityId: assignmentId,
      action: "assignment.assigned-by-teacher",
      newValues: { classId, templateId, students: cls.enrollments.length },
    });
  } catch (err) {
    console.error("[assignTemplateAction] audit:", err);
  }

  revalidatePath("/cham-bai");
  revalidatePath("/teacher/cham-bai");
  return { ok: true, assignmentId };
}
