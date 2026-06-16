// lib/eval/rounds.ts — R7-16: EvaluationRound CRUD + đóng/mở (AC3/AC5).
import { z } from "zod";
import type { EvaluationRoundStatus } from "@prisma/client";
import { db } from "@/lib/db";

export const roundInputSchema = z
  .object({
    formId: z.string().min(1, "Chọn form"),
    name: z.string().trim().min(1, "Tên đợt không được trống").max(200),
    scope: z.enum(["TEACHER_EVAL", "CENTER_SURVEY"]),
    centerId: z.string().trim().optional().nullable(),
    courseId: z.string().trim().optional().nullable(),
    opensAt: z.string().trim().optional().nullable(),
    closesAt: z.string().trim().optional().nullable(),
  })
  .superRefine((r, ctx) => {
    // CENTER_SURVEY cần centerId để xác định PH đủ điều kiện (AC5).
    if (r.scope === "CENTER_SURVEY" && !r.centerId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Khảo sát cơ sở cần chọn cơ sở", path: ["centerId"] });
    }
  });

export type RoundInput = z.infer<typeof roundInputSchema>;

/** Đợt đang MỞ thực sự: status OPEN và (nếu có) trong khoảng opens/closes. */
export function isRoundOpen(
  round: { status: EvaluationRoundStatus; opensAt: Date | null; closesAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (round.status !== "OPEN") return false;
  if (round.opensAt && now < round.opensAt) return false;
  if (round.closesAt && now > round.closesAt) return false;
  return true;
}

export async function createRound(input: RoundInput) {
  return db.evaluationRound.create({
    data: {
      formId: input.formId,
      name: input.name,
      scope: input.scope,
      centerId: input.centerId?.trim() || null,
      courseId: input.courseId?.trim() || null,
      opensAt: input.opensAt ? new Date(input.opensAt) : null,
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
      status: "DRAFT",
    },
  });
}

export async function setRoundStatus(roundId: string, status: EvaluationRoundStatus) {
  return db.evaluationRound.update({ where: { id: roundId }, data: { status } });
}

export async function listRounds(opts?: { centerIds?: string[] | null }) {
  const where =
    opts?.centerIds && opts.centerIds.length > 0
      ? { OR: [{ centerId: null }, { centerId: { in: opts.centerIds } }] }
      : {};
  return db.evaluationRound.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      form: { select: { title: true, scope: true } },
      _count: { select: { responses: true } },
    },
  });
}

export async function getRound(roundId: string) {
  return db.evaluationRound.findUnique({
    where: { id: roundId },
    include: { form: { select: { title: true, scope: true } } },
  });
}
