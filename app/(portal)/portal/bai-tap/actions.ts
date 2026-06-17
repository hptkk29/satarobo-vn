"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireActiveStudent } from "@/lib/portal/session";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";

// =============================================================================
// PORTAL ASSIGNMENT SUBMIT — Phase T2.4
// Học sinh (qua tài khoản phụ huynh) nộp bài tập. Verify activeSite.studentId.
// =============================================================================

export async function submitAssignment(input: {
  assignmentId: string;
  textAnswer?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
}): Promise<{ ok: boolean; status?: string; error?: string }> {
  const { studentId } = await requireActiveStudent();

  const assignment = await db.assignment.findUnique({
    where: { id: input.assignmentId },
    select: {
      id: true,
      classId: true,
      status: true,
      dueAt: true,
      allowText: true,
      allowFile: true,
    },
  });
  if (!assignment) return { ok: false, error: "Không tìm thấy bài tập" };
  if (assignment.status !== "PUBLISHED") {
    return { ok: false, error: "Bài tập chưa mở hoặc đã đóng" };
  }

  const enrolled = await db.enrollment.findFirst({
    where: {
      studentId,
      classId: assignment.classId,
      status: { in: ENROLLMENT_ACTIVE_STATUS_LIST },
      deletedAt: null, // FIX-C3
    },
    select: { id: true },
  });
  if (!enrolled) return { ok: false, error: "Bài tập không thuộc lớp của con" };

  const textAnswer = assignment.allowText ? input.textAnswer?.trim() || null : null;
  const fileUrl = assignment.allowFile ? input.fileUrl || null : null;
  if (!textAnswer && !fileUrl) {
    return { ok: false, error: "Vui lòng nhập nội dung hoặc đính kèm file" };
  }

  const existing = await db.assignmentSubmission.findUnique({
    where: {
      assignmentId_studentId: {
        assignmentId: input.assignmentId,
        studentId,
      },
    },
    select: { id: true, status: true },
  });
  if (existing?.status === "GRADED") {
    return { ok: false, error: "Bài đã được chấm — không thể nộp lại" };
  }

  // Sau hạn vẫn cho nộp nhưng đánh dấu trễ.
  const late = !!assignment.dueAt && Date.now() > assignment.dueAt.getTime();
  const status = late ? ("LATE" as const) : ("SUBMITTED" as const);

  const data = {
    textAnswer,
    fileUrl,
    fileName: fileUrl ? input.fileName || null : null,
    fileSize: fileUrl ? input.fileSize ?? null : null,
    mimeType: fileUrl ? input.mimeType || null : null,
    submittedAt: new Date(),
    status,
  };

  await db.assignmentSubmission.upsert({
    where: {
      assignmentId_studentId: {
        assignmentId: input.assignmentId,
        studentId,
      },
    },
    create: { assignmentId: input.assignmentId, studentId, ...data },
    update: data,
  });

  revalidatePath("/portal/bai-tap");
  revalidatePath(`/portal/bai-tap/${input.assignmentId}`);
  revalidatePath("/portal/ket-qua");
  revalidatePath(`/assignments/${input.assignmentId}/edit`);
  return { ok: true, status };
}
