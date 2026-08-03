"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { portalDb, portalTx } from "@/lib/portal/db";
import { requireActiveStudent } from "@/lib/portal/session";
import { PORTAL_VIEW_COOKIE, type PortalView } from "@/lib/portal/learning";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import {
  buildPortalSubmissionSchema,
  PORTAL_SUBMISSION_MAX_FILES,
} from "@/lib/validators/portal-submission";

/**
 * R7-14 — chuyển profile hiển thị bài tập: "parent" (tổng quan) ↔ "student" (làm bài).
 * Chỉ là cờ hiển thị trên cùng tài khoản PH (KHÔNG phải login HV riêng). Quyền riêng tư
 * thực thi ở tầng query (lib/portal/learning.ts) bất kể giá trị cookie.
 */
export async function setPortalViewAction(view: PortalView): Promise<void> {
  await requireActiveStudent();
  (await cookies()).set(PORTAL_VIEW_COOKIE, view === "student" ? "student" : "parent", {
    httpOnly: true,
    sameSite: "lax",
    path: "/portal",
  });
  revalidatePath("/portal/bai-tap");
}

// =============================================================================
// PORTAL ASSIGNMENT SUBMIT — Phase T2.4
// Học sinh (qua tài khoản phụ huynh) nộp bài tập. Verify activeSite.studentId.
// =============================================================================

export async function submitAssignment(
  // BGĐ 31/07 — nộp NHIỀU file+ảnh. (2-phase: cột đơn fileUrl/fileName/... trên
  // AssignmentSubmission vẫn được ghi = file ĐẦU TIÊN để màn cũ không vỡ.)
  // SEC — input coi là THÔ (PH gọi thẳng action được): zod validate như đường GV
  // + fileUrl phải thuộc R2 của app (chống stored XSS/phishing nhắm người chấm).
  input: unknown,
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const { ctx, studentId } = await requireActiveStudent();
  const pdb = portalDb({
    parentUserId: ctx.parentUserId,
    childIds: ctx.children.map((c) => c.id),
  });

  const parsed = buildPortalSubmissionSchema(process.env.R2_PUBLIC_URL).safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu nộp bài không hợp lệ",
    };
  }
  const { assignmentId } = parsed.data;

  const assignment = await pdb.assignment.findUnique({
    where: { id: assignmentId },
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

  const enrolled = await pdb.enrollment.findFirst({
    where: {
      studentId,
      classId: assignment.classId,
      status: { in: ENROLLMENT_ACTIVE_STATUS_LIST },
      deletedAt: null, // FIX-C3
    },
    select: { id: true },
  });
  if (!enrolled) return { ok: false, error: "Bài tập không thuộc lớp của con" };

  const textAnswer = assignment.allowText ? parsed.data.textAnswer?.trim() || null : null;
  const files = assignment.allowFile
    ? (parsed.data.files ?? []).slice(0, PORTAL_SUBMISSION_MAX_FILES)
    : [];
  const first = files[0] ?? null;
  if (!textAnswer && !first) {
    return { ok: false, error: "Vui lòng nhập nội dung hoặc đính kèm file" };
  }

  const existing = await pdb.assignmentSubmission.findUnique({
    where: {
      assignmentId_studentId: {
        assignmentId,
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

  // 2-phase: cột đơn = file đầu tiên (màn admin/GV cũ vẫn hiện được 1 file).
  const data = {
    textAnswer,
    fileUrl: first?.fileUrl ?? null,
    fileName: first?.fileName ?? null,
    fileSize: first?.fileSize ?? null,
    mimeType: first?.mimeType ?? null,
    submittedAt: new Date(),
    status,
  };

  // Upsert bản nộp + THAY TOÀN BỘ danh sách file (nộp lại = danh sách mới).
  // portalTx: tx là TransactionClient chuẩn; ownership đã hậu kiểm ở trên.
  await portalTx(async (tx) => {
    const sub = await tx.assignmentSubmission.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId,
          studentId,
        },
      },
      create: { assignmentId, studentId, ...data },
      update: data,
      select: { id: true },
    });
    await tx.assignmentSubmissionFile.deleteMany({ where: { submissionId: sub.id } });
    if (files.length > 0) {
      await tx.assignmentSubmissionFile.createMany({
        data: files.map((f) => ({
          submissionId: sub.id,
          fileUrl: f.fileUrl,
          fileName: f.fileName,
          fileSize: f.fileSize ?? null,
          mimeType: f.mimeType ?? null,
        })),
      });
    }
  });

  revalidatePath("/portal/bai-tap");
  revalidatePath(`/portal/bai-tap/${assignmentId}`);
  revalidatePath("/portal/ket-qua");
  revalidatePath(`/assignments/${assignmentId}/edit`);
  return { ok: true, status };
}
