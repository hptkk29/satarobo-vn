"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { RoboticsSkill, SkillLevel } from "@prisma/client";

type Result = { ok: true } | { ok: false; error: string };

// Quyền chấm năng lực: SUPER_ADMIN, CM cùng cơ sở, hoặc GV dạy lớp HS đang học.
async function canAssessStudent(
  user: { id: string; role: string; centerId: string | null },
  studentId: string,
): Promise<boolean> {
  if (user.role === "SUPER_ADMIN") return true;
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { centerId: true },
  });
  if (!student) return false;
  if (user.role === "CENTER_MANAGER") {
    return !!student.centerId && student.centerId === user.centerId;
  }
  if (user.role === "TEACHER") {
    const teaches = await db.enrollment.findFirst({
      where: {
        studentId,
        class: { OR: [{ teacherId: user.id }, { assistantId: user.id }] },
      },
      select: { id: true },
    });
    return !!teaches;
  }
  return false;
}

const skillsSchema = z.object({
  studentId: z.string().min(1),
  items: z
    .array(
      z.object({
        skill: z.nativeEnum(RoboticsSkill),
        level: z.nativeEnum(SkillLevel),
        note: z.string().trim().max(1000).optional().or(z.literal("")),
      }),
    )
    .max(10),
});

/** LMS-5 — lưu đánh giá năng lực (mỗi lần lưu = bản ghi lịch sử mới). */
export async function saveStudentSkills(input: unknown): Promise<Result> {
  const parsed = skillsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { studentId, items } = parsed.data;
  if (items.length === 0) return { ok: true };

  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  const allowed = await canAssessStudent(
    { id: session.user.id, role: session.user.role, centerId: session.user.centerId },
    studentId,
  );
  if (!allowed) return { ok: false, error: "Không có quyền chấm năng lực học sinh này" };

  try {
    await db.studentSkillAssessment.createMany({
      data: items.map((it) => ({
        studentId,
        skill: it.skill,
        level: it.level,
        note: it.note || null,
        assessedById: session.user.id,
      })),
    });
  } catch (err) {
    return { ok: false, error: `Lỗi lưu năng lực: ${err instanceof Error ? err.message : "Unknown"}` };
  }

  revalidatePath(`/students/${studentId}/edit`);
  return { ok: true };
}
