"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

type ActionResult = { error?: string };

const sessionSchema = z.object({
  classId: z.string().trim().min(1, "Lớp học không được để trống"),
  date: z.date({ message: "Ngày học không hợp lệ" }),
  topic: z.string().trim().optional(),
  notes: z.string().trim().optional(),
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
  const role = session.user.role;
  if (role !== "SUPER_ADMIN" && role !== "MANAGER" && role !== "TEACHER") {
    redirect("/admin/dashboard?error=unauthorized");
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
  };
}

export async function createSession(formData: FormData): Promise<ActionResult> {
  await requireTeacherOrAdmin();

  const parsed = sessionSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const s = parsed.data;
  const data: Prisma.ClassSessionCreateInput = {
    class: { connect: { id: s.classId } },
    date: s.date,
    topic: emptyToNull(s.topic),
    notes: emptyToNull(s.notes),
  };

  try {
    await db.classSession.create({ data });
  } catch {
    return { error: "Không tạo được buổi học. Lớp có tồn tại không?" };
  }

  revalidatePath("/admin/sessions");
  revalidatePath("/admin/attendance");
  redirect("/admin/sessions");
}

export async function updateSession(id: string, formData: FormData): Promise<ActionResult> {
  await requireTeacherOrAdmin();

  const parsed = sessionSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const s = parsed.data;
  const data: Prisma.ClassSessionUpdateInput = {
    class: { connect: { id: s.classId } },
    date: s.date,
    topic: emptyToNull(s.topic),
    notes: emptyToNull(s.notes),
  };

  try {
    await db.classSession.update({ where: { id }, data });
  } catch {
    return { error: "Không cập nhật được buổi học" };
  }

  revalidatePath("/admin/sessions");
  revalidatePath(`/admin/sessions/${id}/edit`);
  revalidatePath("/admin/attendance");
  redirect("/admin/sessions");
}

export async function deleteSession(id: string): Promise<ActionResult> {
  await requireTeacherOrAdmin();
  try {
    // ClassSession có onDelete: Cascade trên attendances — sẽ tự xoá luôn.
    await db.classSession.delete({ where: { id } });
  } catch {
    return { error: "Không thể xoá buổi học" };
  }
  revalidatePath("/admin/sessions");
  revalidatePath("/admin/attendance");
  return {};
}
