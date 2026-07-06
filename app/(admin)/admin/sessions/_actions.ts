"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { passesScope } from "@/lib/db-scope";
import { findScheduleConflicts } from "@/lib/classes/generate";
import { sessionEndAt } from "@/lib/lms/scheduling";

type ActionResult = { error?: string };

// Cách ly cơ sở (chống IDOR ghi): buổi học thuộc lớp `classId` — lớp phải nằm trong
// tầm nhìn cơ sở actor (CS1 không tạo/sửa/xoá buổi của lớp CS2). passesScope("Class")
// tự cho SUPER_ADMIN/HO qua. Reconcile: main `sessions:edit` trước CHỈ gate quyền,
// không scope cơ sở → port guard từ FixLMS.
async function classInScope(actor: Actor, classId: string): Promise<boolean> {
  const cls = await db.class.findUnique({ where: { id: classId }, select: { centerId: true } });
  return !!cls && passesScope("Class", { centerId: cls.centerId }, actor);
}

async function sessionClassInScope(actor: Actor, sessionId: string): Promise<boolean> {
  const s = await db.classSession.findUnique({
    where: { id: sessionId },
    select: { class: { select: { centerId: true } } },
  });
  return !!s && passesScope("Class", { centerId: s.class?.centerId ?? null }, actor);
}

/**
 * W2-4 (LMS-6) — soát trùng GV/phòng cho 1 buổi (tạo/sửa). GV/phòng lấy ở cấp lớp
 * chứa buổi. Trả message VI nếu trùng; null nếu không trùng / thiếu dữ liệu
 * (lớp không tồn tại, không GV & không phòng, hoặc lớp chưa có startTime → default
 * an toàn KHÔNG chặn). `excludeSessionId` không cần — query đã loại buổi cùng lớp.
 */
async function checkSessionScheduleConflict(
  classId: string,
  date: Date,
): Promise<string | null> {
  const cls = await db.class.findUnique({
    where: { id: classId },
    select: { teacherId: true, roomId: true, startTime: true, endTime: true },
  });
  if (!cls?.startTime || (!cls.teacherId && !cls.roomId)) return null;
  const conflict = await findScheduleConflicts({
    classId,
    teacherId: cls.teacherId,
    roomId: cls.roomId,
    candidates: [{ startAt: date, endAt: sessionEndAt(date, cls.startTime, cls.endTime) }],
  });
  if (conflict.teacherConflict) {
    return "Trùng lịch giáo viên: GV của lớp này đã có buổi dạy lớp khác vào khung giờ đó.";
  }
  if (conflict.roomConflict) {
    return "Trùng phòng: phòng của lớp này đã được lớp khác sử dụng vào khung giờ đó.";
  }
  return null;
}

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
  if (!(await checkPermission("sessions:edit"))) {
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

  // Cách ly cơ sở: chỉ tạo buổi cho lớp trong tầm nhìn cơ sở actor.
  const actor = await resolveActor(user.id);
  if (!(await classInScope(actor, s.classId))) return { error: "Lớp ngoài phạm vi cơ sở" };

  // W2-4 — chặn tạo buổi gây trùng GV/phòng với lớp khác.
  const conflictMsg = await checkSessionScheduleConflict(s.classId, s.date);
  if (conflictMsg) return { error: conflictMsg };

  // FL3-02 — centerId denormalized từ class cho scopedDb (buổi học cách ly cơ sở).
  const clsCenter = await db.class.findUnique({
    where: { id: s.classId },
    select: { centerId: true },
  });

  const data: Prisma.ClassSessionCreateInput = {
    class: { connect: { id: s.classId } },
    date: s.date,
    centerId: clsCenter?.centerId ?? null,
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

  // Cách ly cơ sở: buổi hiện tại + lớp đích đều phải trong tầm nhìn cơ sở actor.
  const actor = await resolveActor(user.id);
  if (!(await sessionClassInScope(actor, id))) return { error: "Buổi học ngoài phạm vi cơ sở" };
  if (!(await classInScope(actor, s.classId))) return { error: "Lớp đích ngoài phạm vi cơ sở" };

  // W2-4 — chặn cập nhật buổi (đổi ngày/giờ) gây trùng GV/phòng với lớp khác.
  const conflictMsg = await checkSessionScheduleConflict(s.classId, s.date);
  if (conflictMsg) return { error: conflictMsg };

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
  // Cách ly cơ sở: chỉ xoá buổi của lớp trong tầm nhìn cơ sở actor.
  const actor = await resolveActor(user.id);
  if (!(await sessionClassInScope(actor, id))) return { error: "Buổi học ngoài phạm vi cơ sở" };
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
