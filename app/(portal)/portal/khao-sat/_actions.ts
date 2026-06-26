"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireActiveStudent } from "@/lib/portal/session";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// B3 — phụ huynh trả lời khảo sát/NPS cho con đang chọn.
//
// @deprecated FL4-03 — luồng khảo sát trung tâm mới đi qua CENTER_SURVEY (EvalForm)
// ở _eval-actions.ts (submitCenterSurvey). Giữ action này song song (2-phase) để PH
// trả nốt các khảo sát NPS đang chạy; KHÔNG xoá Survey model/route.

const schema = z.object({
  surveyId: z.string().min(1),
  npsScore: z.number().int().min(0).max(10),
  comment: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function submitSurveyResponse(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  const { studentId } = await requireActiveStudent();

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const d = parsed.data;

  // Chống trả lời trùng cùng survey cho 1 con.
  const dup = await db.surveyResponse.findFirst({
    where: { surveyId: d.surveyId, studentId },
    select: { id: true },
  });
  if (dup) return { ok: false, error: "Bạn đã trả lời khảo sát này rồi." };

  // Gắn center/class/teacher/csm để làm cơ sở KPI.
  const enr = await db.enrollment.findFirst({
    where: { studentId, status: { in: ["CONFIRMED", "STUDYING", "ACTIVE"] }, deletedAt: null }, // FIX-C3
    orderBy: { createdAt: "desc" },
    select: { class: { select: { id: true, centerId: true, teacherId: true } } },
  });
  // CSM phụ trách: lấy từ care task gần nhất (nếu có).
  const care = await db.studentCareTask.findFirst({
    where: { studentId, assignedToId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { assignedToId: true },
  });

  await db.surveyResponse.create({
    data: {
      surveyId: d.surveyId,
      studentId,
      parentUserId: session.user.id,
      centerId: enr?.class.centerId ?? null,
      classId: enr?.class.id ?? null,
      teacherId: enr?.class.teacherId ?? null,
      csmId: care?.assignedToId ?? null,
      npsScore: d.npsScore,
      comment: d.comment || null,
    },
  });

  revalidatePath("/portal/khao-sat");
  return { ok: true };
}
