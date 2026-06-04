"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

// B3 — quản lý khảo sát. Gate parent-feedback:view (CSKH/quản lý).

const MILESTONES = ["AFTER_TRIAL", "AFTER_3_SESSIONS", "MID_COURSE", "END_COURSE", "AFTER_COMPLAINT", "GENERAL"] as const;

const DEFAULT_NPS_QUESTION = "Anh/chị có sẵn sàng giới thiệu Sata Robo cho phụ huynh khác?";

const createSchema = z.object({
  title: z.string().trim().min(3, "Tiêu đề quá ngắn").max(200),
  milestone: z.enum(MILESTONES),
  centerId: z.string().trim().optional().or(z.literal("")),
  // P1-h — câu hỏi NPS (0-10) có thể tuỳ biến.
  questionText: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function createSurvey(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "parent-feedback:view")) return { ok: false, error: "Không có quyền" };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const d = parsed.data;

  await db.survey.create({
    data: {
      title: d.title,
      milestone: d.milestone,
      centerId: d.centerId || null,
      createdById: session.user.id,
      questions: {
        create: {
          text: d.questionText?.trim() || DEFAULT_NPS_QUESTION,
          type: "NPS",
          order: 0,
        },
      },
    },
  });
  revalidatePath("/khao-sat");
  return { ok: true };
}

export async function toggleSurvey(id: string): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user || !can(session.user, "parent-feedback:view")) return { ok: false };
  const s = await db.survey.findUnique({ where: { id }, select: { isActive: true } });
  if (s) await db.survey.update({ where: { id }, data: { isActive: !s.isActive } });
  revalidatePath("/khao-sat");
  return { ok: true };
}
