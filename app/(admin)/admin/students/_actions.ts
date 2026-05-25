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
import { sendEmailForTrigger } from "@/lib/email/trigger";

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
    redirect("/dashboard?error=unauthorized");
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

  revalidatePath("/students");
  redirect("/students");
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

  revalidatePath("/students");
  revalidatePath(`/students/${id}/edit`);
  redirect("/students");
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
  revalidatePath("/students");
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

// ═══════════════════════════════════════════════════════════════════
// Phase 5.9 — Lifecycle actions: reserve / resume / withdraw / reactivate
// All actions are atomic via db.$transaction. Student status changes go
// through logStudentAudit (Sprint 5.4); enrollment status changes go
// through the existing EnrollmentAuditLog table.
// Permission gate: students:edit (state mutations are an edit operation).
// ═══════════════════════════════════════════════════════════════════

async function requireStudentLifecycle() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "students:edit")) {
    redirect("/dashboard?error=unauthorized");
  }
  return session;
}

// ─── RESERVE STUDENT ────────────────────────────────────────────────
export async function reserveStudentAction(input: {
  studentId: string;
  enrollmentId?: string | null;
  reason: string;
  expectedEndAt?: string | null;
}) {
  const session = await requireStudentLifecycle();

  if (!input.reason?.trim()) {
    return { ok: false as const, error: "Vui lòng nhập lý do bảo lưu" };
  }
  if (input.reason.length > 1000) {
    return { ok: false as const, error: "Lý do quá dài (max 1000 ký tự)" };
  }

  const student = await db.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: { id: true, status: true, name: true },
  });
  if (!student) {
    return { ok: false as const, error: "Không tìm thấy học viên" };
  }

  const existing = await db.studentReserve.findFirst({
    where: { studentId: input.studentId, isActive: true },
    select: { id: true, startedAt: true },
  });
  if (existing) {
    return {
      ok: false as const,
      error: `Học viên đã đang bảo lưu (từ ${existing.startedAt.toLocaleDateString("vi-VN")})`,
    };
  }

  if (input.enrollmentId) {
    const enr = await db.enrollment.findFirst({
      where: { id: input.enrollmentId, studentId: input.studentId },
      select: { id: true, status: true },
    });
    if (!enr) {
      return {
        ok: false as const,
        error: "Đăng ký không tồn tại hoặc không thuộc học viên này",
      };
    }
    if (enr.status !== "STUDYING") {
      return {
        ok: false as const,
        error: "Chỉ có thể bảo lưu lớp đang STUDYING",
      };
    }
  }

  const { actorId, actorName } = getAuditActor(session);

  await db.$transaction(async (tx) => {
    await tx.studentReserve.create({
      data: {
        studentId: input.studentId,
        enrollmentId: input.enrollmentId ?? null,
        reason: input.reason.trim(),
        expectedEndAt: input.expectedEndAt
          ? new Date(input.expectedEndAt)
          : null,
        createdByUserId: actorId,
        createdByName: actorName,
        isActive: true,
      },
    });

    if (student.status === "ACTIVE") {
      await tx.student.update({
        where: { id: input.studentId },
        data: { status: "PAUSED" },
      });

      await logStudentAudit({
        studentId: input.studentId,
        action: "UPDATE",
        actorId,
        actorName,
        oldValues: { status: student.status },
        newValues: { status: "PAUSED" },
        changedFields: ["status"],
        reason: `Bảo lưu: ${input.reason.trim()}`,
        tx,
      });
    }

    const enrollmentsToPause = input.enrollmentId
      ? [{ id: input.enrollmentId, status: "STUDYING" as const }]
      : await tx.enrollment.findMany({
          where: { studentId: input.studentId, status: "STUDYING" },
          select: { id: true, status: true },
        });

    for (const enr of enrollmentsToPause) {
      await tx.enrollment.update({
        where: { id: enr.id },
        data: { status: "PAUSED" },
      });

      await tx.enrollmentAuditLog.create({
        data: {
          enrollmentId: enr.id,
          fromStatus: enr.status,
          toStatus: "PAUSED",
          changedByUserId: actorId,
          changedByName: actorName,
          reason: input.reason.trim(),
        },
      });
    }
  });

  revalidatePath("/students");
  revalidatePath(`/students/${input.studentId}/edit`);

  const studentForEmail = await db.student.findUnique({
    where: { id: input.studentId },
    select: { name: true, parentName: true, parentEmail: true },
  });
  if (studentForEmail) {
    sendEmailForTrigger({
      trigger: "RESERVATION_NOTICE",
      recipient: {
        email: studentForEmail.parentEmail,
        name: studentForEmail.parentName,
      },
      vars: {
        student_name: studentForEmail.name,
        parent_name: studentForEmail.parentName ?? "Quý phụ huynh",
        started_at: new Date(),
        expected_end_at: input.expectedEndAt
          ? new Date(input.expectedEndAt)
          : null,
        reason: input.reason.trim(),
      },
      context: { type: "Student", id: input.studentId },
      triggerType: "SYSTEM",
      actor: { userId: actorId, name: actorName },
    }).catch((err) => {
      console.error("[email] RESERVATION_NOTICE trigger error:", err);
    });
  }

  return { ok: true as const };
}

// ─── RESUME RESERVE ─────────────────────────────────────────────────
export async function resumeStudentReserveAction(input: {
  reserveId: string;
  endReason?: string | null;
}) {
  const session = await requireStudentLifecycle();

  const reserve = await db.studentReserve.findUnique({
    where: { id: input.reserveId },
    select: {
      id: true,
      studentId: true,
      enrollmentId: true,
      isActive: true,
      student: { select: { status: true } },
    },
  });
  if (!reserve) {
    return { ok: false as const, error: "Không tìm thấy đợt bảo lưu" };
  }
  if (!reserve.isActive) {
    return { ok: false as const, error: "Đợt bảo lưu đã kết thúc" };
  }

  if (input.endReason && input.endReason.length > 1000) {
    return { ok: false as const, error: "Ghi chú quá dài" };
  }

  const { actorId, actorName } = getAuditActor(session);
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.studentReserve.update({
      where: { id: input.reserveId },
      data: {
        isActive: false,
        endedAt: now,
        endReason: input.endReason?.trim() || null,
        endedByUserId: actorId,
        endedByName: actorName,
      },
    });

    const otherActive = await tx.studentReserve.findFirst({
      where: {
        studentId: reserve.studentId,
        isActive: true,
        NOT: { id: input.reserveId },
      },
      select: { id: true },
    });

    if (!otherActive && reserve.student.status === "PAUSED") {
      await tx.student.update({
        where: { id: reserve.studentId },
        data: { status: "ACTIVE" },
      });

      await logStudentAudit({
        studentId: reserve.studentId,
        action: "UPDATE",
        actorId,
        actorName,
        oldValues: { status: "PAUSED" },
        newValues: { status: "ACTIVE" },
        changedFields: ["status"],
        reason: `Kết thúc bảo lưu${input.endReason ? `: ${input.endReason.trim()}` : ""}`,
        tx,
      });
    }

    const enrollmentsToResume = reserve.enrollmentId
      ? [{ id: reserve.enrollmentId }]
      : await tx.enrollment.findMany({
          where: { studentId: reserve.studentId, status: "PAUSED" },
          select: { id: true },
        });

    for (const enr of enrollmentsToResume) {
      await tx.enrollment.update({
        where: { id: enr.id },
        data: { status: "STUDYING" },
      });

      await tx.enrollmentAuditLog.create({
        data: {
          enrollmentId: enr.id,
          fromStatus: "PAUSED",
          toStatus: "STUDYING",
          changedByUserId: actorId,
          changedByName: actorName,
          reason: `Kết thúc bảo lưu${input.endReason ? `: ${input.endReason.trim()}` : ""}`,
        },
      });
    }
  });

  revalidatePath("/students");
  revalidatePath(`/students/${reserve.studentId}/edit`);
  return { ok: true as const };
}

// ─── WITHDRAW STUDENT (nghỉ học hẳn) ─────────────────────────────────
export async function withdrawStudentAction(input: {
  studentId: string;
  reason: string;
}) {
  const session = await requireStudentLifecycle();

  if (!input.reason?.trim()) {
    return { ok: false as const, error: "Vui lòng nhập lý do nghỉ học" };
  }
  if (input.reason.length > 1000) {
    return { ok: false as const, error: "Lý do quá dài" };
  }

  const student = await db.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!student) {
    return { ok: false as const, error: "Không tìm thấy học viên" };
  }
  if (student.status === "INACTIVE") {
    return { ok: false as const, error: "Học viên đã nghỉ học rồi" };
  }

  const { actorId, actorName } = getAuditActor(session);

  await db.$transaction(async (tx) => {
    await tx.studentReserve.updateMany({
      where: { studentId: input.studentId, isActive: true },
      data: {
        isActive: false,
        endedAt: new Date(),
        endReason: "Học viên nghỉ học",
        endedByUserId: actorId,
        endedByName: actorName,
      },
    });

    await tx.student.update({
      where: { id: input.studentId },
      data: { status: "INACTIVE" },
    });

    await logStudentAudit({
      studentId: input.studentId,
      action: "UPDATE",
      actorId,
      actorName,
      oldValues: { status: student.status },
      newValues: { status: "INACTIVE" },
      changedFields: ["status"],
      reason: `Nghỉ học: ${input.reason.trim()}`,
      tx,
    });

    const activeEnrollments = await tx.enrollment.findMany({
      where: {
        studentId: input.studentId,
        status: { in: ["PENDING", "CONFIRMED", "STUDYING", "PAUSED"] },
      },
      select: { id: true, status: true },
    });

    for (const enr of activeEnrollments) {
      await tx.enrollment.update({
        where: { id: enr.id },
        data: { status: "WITHDREW" },
      });

      await tx.enrollmentAuditLog.create({
        data: {
          enrollmentId: enr.id,
          fromStatus: enr.status,
          toStatus: "WITHDREW",
          changedByUserId: actorId,
          changedByName: actorName,
          reason: `Học viên nghỉ học: ${input.reason.trim()}`,
        },
      });
    }
  });

  revalidatePath("/students");
  revalidatePath(`/students/${input.studentId}/edit`);

  const studentForEmail = await db.student.findUnique({
    where: { id: input.studentId },
    select: { name: true, parentName: true, parentEmail: true },
  });
  if (studentForEmail) {
    sendEmailForTrigger({
      trigger: "WITHDRAWAL_NOTICE",
      recipient: {
        email: studentForEmail.parentEmail,
        name: studentForEmail.parentName,
      },
      vars: {
        student_name: studentForEmail.name,
        parent_name: studentForEmail.parentName ?? "Quý phụ huynh",
        withdrawn_at: new Date(),
        reason: input.reason.trim(),
      },
      context: { type: "Student", id: input.studentId },
      triggerType: "SYSTEM",
      actor: { userId: actorId, name: actorName },
    }).catch((err) => {
      console.error("[email] WITHDRAWAL_NOTICE trigger error:", err);
    });
  }

  return { ok: true as const };
}

// ─── REACTIVATE STUDENT (INACTIVE/PAUSED → ACTIVE) ───────────────────
// Note: KHÔNG auto-create enrollment. Admin phải tạo Enrollment mới
// qua flow Enrollment riêng.
export async function reactivateStudentAction(input: {
  studentId: string;
  note?: string | null;
}) {
  const session = await requireStudentLifecycle();

  const student = await db.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!student) {
    return { ok: false as const, error: "Không tìm thấy học viên" };
  }
  if (student.status === "ACTIVE") {
    return { ok: false as const, error: "Học viên đã đang ACTIVE" };
  }

  const { actorId, actorName } = getAuditActor(session);

  await db.$transaction(async (tx) => {
    await tx.student.update({
      where: { id: input.studentId },
      data: { status: "ACTIVE" },
    });

    await logStudentAudit({
      studentId: input.studentId,
      action: "UPDATE",
      actorId,
      actorName,
      oldValues: { status: student.status },
      newValues: { status: "ACTIVE" },
      changedFields: ["status"],
      reason: `Kích hoạt lại${input.note ? `: ${input.note.trim()}` : ""}`,
      tx,
    });
  });

  revalidatePath("/students");
  revalidatePath(`/students/${input.studentId}/edit`);
  return { ok: true as const };
}
