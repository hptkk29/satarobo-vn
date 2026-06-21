"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { can } from "@/lib/auth/permissions";
import { resolveActor } from "@/lib/auth/actor";
import { canManageClass } from "@/lib/auth/lms-scope";

type ActionResult = { error?: string };

// Cách ly cơ sở (chống IDOR ghi): ClassSession relation-scoped qua class.centerId.
// Mutation theo sessionId/classId từ client phải qua canManageClass (passesScope
// "Class" + ownership GV/quản lý) trước khi ghi.

const sessionSchema = z.object({
  classId: z.string().trim().min(1, "Lớp học không được để trống"),
  date: z.date({ message: "Ngày học không hợp lệ" }),
  topic: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  lessonId: z.string().trim().optional(),
  lessonNotes: z.string().trim().optional(),
});

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function emptyToNull(value: string | undefined): string | null {
  return value ?? null;
}

function parseDateTimeLocal(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  // datetime-local returns "YYYY-MM-DDTHH:mm" in local time
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function requireTeacherOrAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "sessions:edit")) {
    redirect("/dashboard?error=unauthorized");
  }
  return session.user;
}

function readForm(formData: FormData) {
  const dateValue = parseDateTimeLocal(formData.get("date"));
  return {
    classId: emptyToUndefined(formData.get("classId")) ?? "",
    date: dateValue ?? new Date(NaN), // forces zod fail if missing
    topic: emptyToUndefined(formData.get("topic")),
    notes: emptyToUndefined(formData.get("notes")),
    lessonId: emptyToUndefined(formData.get("lessonId")),
    lessonNotes: emptyToUndefined(formData.get("lessonNotes")),
  };
}

export async function createSession(formData: FormData): Promise<ActionResult> {
  const user = await requireTeacherOrAdmin();

  const parsed = sessionSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const s = parsed.data;

  // Cách ly cơ sở: chỉ tạo buổi cho lớp actor được quản lý (cùng cơ sở / phụ trách).
  if (user.id) {
    const actor = await resolveActor(user.id);
    const cls = await db.class.findUnique({ where: { id: s.classId }, select: { centerId: true } });
    if (!cls || !canManageClass(actor, s.classId, cls.centerId)) {
      return { error: "Lớp không tồn tại" };
    }
  }

  const data: Prisma.ClassSessionCreateInput = {
    class: { connect: { id: s.classId } },
    date: s.date,
    topic: emptyToNull(s.topic),
    notes: emptyToNull(s.notes),
    lessonNotes: emptyToNull(s.lessonNotes),
    ...(s.lessonId ? { lesson: { connect: { id: s.lessonId } } } : {}),
  };

  try {
    await db.classSession.create({ data });
  } catch {
    return { error: "Không tạo được buổi học. Lớp có tồn tại không?" };
  }

  revalidatePath("/sessions");
  revalidatePath("/attendance");
  redirect("/sessions");
}

export async function updateSession(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireTeacherOrAdmin();

  const parsed = sessionSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const s = parsed.data;

  // Cách ly cơ sở: buổi HIỆN TẠI + lớp ĐÍCH (nếu đổi) đều phải actor được quản lý.
  if (user.id) {
    const actor = await resolveActor(user.id);
    const existing = await db.classSession.findUnique({
      where: { id },
      select: { classId: true, class: { select: { centerId: true } } },
    });
    if (!existing || !canManageClass(actor, existing.classId, existing.class?.centerId ?? null)) {
      return { error: "Không cập nhật được buổi học" };
    }
    if (s.classId !== existing.classId) {
      const target = await db.class.findUnique({ where: { id: s.classId }, select: { centerId: true } });
      if (!target || !canManageClass(actor, s.classId, target.centerId)) {
        return { error: "Lớp không tồn tại" };
      }
    }
  }

  const data: Prisma.ClassSessionUpdateInput = {
    class: { connect: { id: s.classId } },
    date: s.date,
    topic: emptyToNull(s.topic),
    notes: emptyToNull(s.notes),
    lessonNotes: emptyToNull(s.lessonNotes),
    lesson: s.lessonId
      ? { connect: { id: s.lessonId } }
      : { disconnect: true },
  };

  try {
    await db.classSession.update({ where: { id }, data });
  } catch {
    return { error: "Không cập nhật được buổi học" };
  }

  revalidatePath("/sessions");
  revalidatePath(`/sessions/${id}/edit`);
  revalidatePath("/attendance");
  redirect("/sessions");
}

export async function deleteSession(id: string): Promise<ActionResult> {
  const user = await requireTeacherOrAdmin();
  // Cách ly cơ sở: chỉ xoá buổi của lớp actor được quản lý (chống IDOR cascade).
  if (user.id) {
    const actor = await resolveActor(user.id);
    const existing = await db.classSession.findUnique({
      where: { id },
      select: { classId: true, class: { select: { centerId: true } } },
    });
    if (!existing || !canManageClass(actor, existing.classId, existing.class?.centerId ?? null)) {
      return { error: "Không thể xoá buổi học" };
    }
  }
  try {
    // ClassSession có onDelete: Cascade trên attendances — sẽ tự xoá luôn.
    await db.classSession.delete({ where: { id } });
  } catch {
    return { error: "Không thể xoá buổi học" };
  }
  revalidatePath("/sessions");
  revalidatePath("/attendance");
  return {};
}
