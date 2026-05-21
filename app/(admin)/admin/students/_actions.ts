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
import {
  logStudentAudit,
  detectChangedFields,
  getAuditActor,
} from "@/lib/audit/log";

type ActionResult = { error?: string };

async function requireStudentWrite(action: "create" | "update" | "delete") {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const actionMap: Record<typeof action, Action> = {
    create: "students:create",
    update: "students:edit",
    delete: "students:delete",
  };

  if (!can(session.user, actionMap[action])) {
    redirect("/admin/dashboard?error=unauthorized");
  }
  return session;
}

const STUDENT_SNAPSHOT_SELECT = {
  name: true,
  studentCode: true,
  dateOfBirth: true,
  gender: true,
  parentName: true,
  parentPhone: true,
  centerId: true,
  status: true,
} as const;

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
  const session = await requireStudentWrite("create");

  const raw = readForm(formData);
  const parsed = studentCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const { actorId, actorName } = getAuditActor(session);

  try {
    await db.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: toData(parsed.data),
        select: { id: true, ...STUDENT_SNAPSHOT_SELECT },
      });

      const { id: _id, ...newValues } = created;
      void _id;

      await logStudentAudit({
        studentId: created.id,
        action: "CREATE",
        actorId,
        actorName,
        newValues,
        tx,
      });
    });
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
  const session = await requireStudentWrite("update");

  const raw = readForm(formData);
  const parsed = studentUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const before = await db.student.findUnique({
    where: { id },
    select: STUDENT_SNAPSHOT_SELECT,
  });
  if (!before) return { error: "Không tìm thấy học viên" };

  const { actorId, actorName } = getAuditActor(session);

  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.student.update({
        where: { id },
        data: toUpdateData(parsed.data),
        select: STUDENT_SNAPSHOT_SELECT,
      });

      await logStudentAudit({
        studentId: id,
        action: "UPDATE",
        actorId,
        actorName,
        oldValues: before,
        newValues: updated,
        changedFields: detectChangedFields(before, updated),
        tx,
      });
    });
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
  const session = await requireStudentWrite("delete");

  const before = await db.student.findUnique({
    where: { id },
    select: STUDENT_SNAPSHOT_SELECT,
  });
  if (!before) return { error: "Không thể xoá học viên này" };

  const { actorId, actorName } = getAuditActor(session);

  try {
    await db.$transaction(async (tx) => {
      // Soft delete — Student has deletedAt
      await tx.student.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await logStudentAudit({
        studentId: id,
        action: "DELETE",
        actorId,
        actorName,
        oldValues: before,
        tx,
      });
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
