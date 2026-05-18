"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { can, type Action } from "@/lib/auth/permissions";
import {
  studentCreateSchema,
  studentUpdateSchema,
} from "@/lib/validators/student";

type ActionResult = { error?: string };

async function requireStudentWrite(action: "create" | "update" | "delete") {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const actionMap: Record<typeof action, Action> = {
    create: "students:create",
    update: "students:edit",
    delete: "students:delete",
  };

  if (!can(session.user.role, actionMap[action])) {
    redirect("/admin/dashboard?error=unauthorized");
  }
  return session.user;
}

function toData(parsed: ReturnType<typeof studentCreateSchema.parse>): Prisma.StudentCreateInput {
  const {
    preferredCenterId,
    centerId,
    ...rest
  } = parsed;

  return {
    ...rest,
    preferredCenter: preferredCenterId
      ? { connect: { id: preferredCenterId } }
      : undefined,
    center: centerId ? { connect: { id: centerId } } : undefined,
  };
}

function toUpdateData(
  parsed: Partial<ReturnType<typeof studentCreateSchema.parse>>,
): Prisma.StudentUpdateInput {
  const {
    preferredCenterId,
    centerId,
    ...rest
  } = parsed;

  const data: Prisma.StudentUpdateInput = { ...rest };

  if (preferredCenterId !== undefined) {
    data.preferredCenter = preferredCenterId
      ? { connect: { id: preferredCenterId } }
      : { disconnect: true };
  }
  if (centerId !== undefined) {
    data.center = centerId ? { connect: { id: centerId } } : { disconnect: true };
  }

  return data;
}

export async function createStudent(formData: FormData): Promise<ActionResult> {
  await requireStudentWrite("create");

  const raw = readForm(formData);
  const parsed = studentCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  try {
    await db.student.create({ data: toData(parsed.data) });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: "Mã học viên đã tồn tại" };
    }
    return { error: "Lỗi cơ sở dữ liệu — không tạo được học viên" };
  }

  revalidatePath("/admin/students");
  redirect("/admin/students");
}

export async function updateStudent(id: string, formData: FormData): Promise<ActionResult> {
  await requireStudentWrite("update");

  const raw = readForm(formData);
  const parsed = studentUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  try {
    await db.student.update({ where: { id }, data: toUpdateData(parsed.data) });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: "Mã học viên đã tồn tại" };
    }
    return { error: "Học viên không tồn tại hoặc lỗi cơ sở dữ liệu" };
  }

  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${id}/edit`);
  redirect("/admin/students");
}

export async function deleteStudent(id: string): Promise<ActionResult> {
  await requireStudentWrite("delete");
  try {
    // Soft delete — Student has deletedAt
    await db.student.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  } catch {
    return { error: "Không thể xoá học viên này" };
  }
  revalidatePath("/admin/students");
  return {};
}

// ─── helpers ────────────────────────────────────────────────────────────

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseAllergies(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map((s) => (typeof s === "string" ? s.trim() : String(s).trim()))
        .filter((s) => s.length > 0);
    }
  } catch {
    // fall through
  }
  return [];
}

function readForm(formData: FormData) {
  return {
    name: emptyToUndefined(formData.get("name")) ?? "",
    studentCode: emptyToUndefined(formData.get("studentCode")),
    dateOfBirth: emptyToUndefined(formData.get("dateOfBirth")),
    gender: emptyToUndefined(formData.get("gender")),
    phone: emptyToUndefined(formData.get("phone")),
    email: emptyToUndefined(formData.get("email")),
    avatarUrl: emptyToUndefined(formData.get("avatarUrl")),

    currentGrade: emptyToUndefined(formData.get("currentGrade")),
    school: emptyToUndefined(formData.get("school")),

    parentName: emptyToUndefined(formData.get("parentName")) ?? "",
    parentPhone: emptyToUndefined(formData.get("parentPhone")) ?? "",
    parentEmail: emptyToUndefined(formData.get("parentEmail")),
    parentRelation: emptyToUndefined(formData.get("parentRelation")),
    parent2Name: emptyToUndefined(formData.get("parent2Name")),
    parent2Phone: emptyToUndefined(formData.get("parent2Phone")),
    parent2Relation: emptyToUndefined(formData.get("parent2Relation")),

    address: emptyToUndefined(formData.get("address")),
    ward: emptyToUndefined(formData.get("ward")),
    district: emptyToUndefined(formData.get("district")),
    city: emptyToUndefined(formData.get("city")),

    bloodType: emptyToUndefined(formData.get("bloodType")),
    allergies: parseAllergies(formData.get("allergies")),
    healthNotes: emptyToUndefined(formData.get("healthNotes")),

    enrollmentDate: emptyToUndefined(formData.get("enrollmentDate")),
    preferredCenterId: emptyToUndefined(formData.get("preferredCenterId")),
    notes: emptyToUndefined(formData.get("notes")),
    status: emptyToUndefined(formData.get("status")) ?? "ACTIVE",

    centerId: emptyToUndefined(formData.get("centerId")),
  };
}
