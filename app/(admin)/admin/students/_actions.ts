"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { requestOtp } from "@/lib/otp/service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { hasRole, type Action } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { centerIdForOrgUnit } from "@/lib/org/org-service";
import {
  studentCreateSchema,
  studentUpdateSchema,
} from "@/lib/validators/student";
import {
  logStudentAudit,
  detectChangedFields,
  getAuditActor,
} from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/audit-log";
import { sendEmailForTrigger } from "@/lib/email/trigger";
import { genStudentCode } from "@/lib/codegen";
import { canTransition } from "@/lib/enrollments/status";
import { createRefundRequest } from "@/lib/finance/refund";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";

type ActionResult = { error?: string };

/** Sentinel để huỷ $transaction phục học khi transition enrollment phi lý. */
const INVALID_RESUME_TRANSITION = "__INVALID_RESUME_TRANSITION__";

// Cách ly cơ sở (chống IDOR ghi): Student ∈ SCOPED_MODELS. Mọi mutation theo
// studentId từ client phải xác minh HV thuộc tầm nhìn cơ sở của actor.
function actorCanUseCenter(actor: Actor, centerId: string | null): boolean {
  if (actor.isSuperAdmin || actor.isHoLevel) return true;
  return centerId != null && actor.visibleCenterIds.includes(centerId);
}

/** Trả về true nếu HV `studentId` nằm trong tầm nhìn cơ sở của user. */
async function studentInScope(
  userId: string | undefined,
  studentId: string,
): Promise<boolean> {
  if (!userId) return false;
  const actor = await resolveActor(userId);
  if (actor.isSuperAdmin || actor.isHoLevel) return true;
  const sdb = scopedDb(actor);
  const s = await sdb.student.findUnique({ where: { id: studentId }, select: { centerId: true } });
  return !!s && passesScope("Student", s, actor);
}

async function requireStudentWrite(action: "create" | "update" | "delete") {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const actionMap: Record<typeof action, Action> = {
    create: "students:create",
    update: "students:edit",
    delete: "students:delete",
  };

  if (!(await checkPermission(actionMap[action]))) {
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
  const data = parsed.data;
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  // PR-C dual-write: OrgUnit là nguồn chính; suy centerId/preferredCenterId (HO→null).
  data.centerId = await centerIdForOrgUnit(data.orgUnitId ?? null);
  data.preferredCenterId = await centerIdForOrgUnit(data.preferredOrgUnitId ?? null);

  // Cách ly cơ sở: center-level chỉ tạo HV cho cơ sở trong tầm nhìn.
  if (!actorCanUseCenter(actor, data.centerId ?? null)) {
    return { error: "Không có quyền tạo học viên cho cơ sở này" };
  }

  try {
    await sdb.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Prisma.TransactionClient;
      // Phase T0.2 — tự sinh studentCode nếu admin để trống (giữ mã cũ nếu có).
      if (!data.studentCode && data.centerId) {
        const center = await tx.center.findUnique({
          where: { id: data.centerId },
          select: { code: true },
        });
        if (center?.code) {
          data.studentCode = await genStudentCode(center.code, tx);
        }
      }

      const created = await tx.student.create({
        data: toData(data),
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

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const before = await sdb.student.findUnique({
    where: { id },
    select: STUDENT_SNAPSHOT_SELECT,
  });
  if (!before) return { error: "Không tìm thấy học viên" };

  // Cách ly cơ sở: HV hiện tại phải thuộc tầm nhìn actor (chống sửa HV cơ sở khác).
  if (!actorCanUseCenter(actor, before.centerId)) {
    return { error: "Không tìm thấy học viên" };
  }

  const { actorId, actorName } = getAuditActor(session);
  const data = parsed.data;

  // PR-C dual-write: nếu đổi đơn vị → suy centerId/preferredCenterId (HO→null).
  if (data.orgUnitId !== undefined) {
    data.centerId = await centerIdForOrgUnit(data.orgUnitId ?? null);
  }
  if (data.preferredOrgUnitId !== undefined) {
    data.preferredCenterId = await centerIdForOrgUnit(data.preferredOrgUnitId ?? null);
  }
  // Đổi cơ sở → cơ sở đích cũng phải trong tầm nhìn actor.
  if (data.centerId !== undefined) {
    if (!actorCanUseCenter(actor, data.centerId ?? null)) {
      return { error: "Không có quyền chuyển học viên sang cơ sở này" };
    }
  }

  try {
    await sdb.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Prisma.TransactionClient;
      const updated = await tx.student.update({
        where: { id },
        data: toUpdateData(data),
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

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const before = await sdb.student.findUnique({
    where: { id },
    select: STUDENT_SNAPSHOT_SELECT,
  });
  if (!before) return { error: "Không thể xoá học viên này" };
  // Cách ly cơ sở: chỉ xoá HV trong tầm nhìn actor (chống IDOR xoá liên cơ sở).
  if (!actorCanUseCenter(actor, before.centerId)) {
    return { error: "Không thể xoá học viên này" };
  }
  if (before.status !== "INACTIVE") {
    return { error: "Chỉ xóa được học viên đã nghỉ học" };
  }

  const { actorId, actorName } = getAuditActor(session);

  try {
    await sdb.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Prisma.TransactionClient;
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

      // P3 (additive): also write to unified AuditLog.
      await writeAudit({
        actor: { id: actorId, name: actorName },
        module: "students",
        entityType: "Student",
        entityId: id,
        action: "DELETE",
        oldValues: before,
        orgUnitId: before.centerId,
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
    // PR-C: picker gửi OrgUnit.id; centerId/preferredCenterId suy ra trong action (dual-write).
    preferredOrgUnitId: emptyToUndefined(formData.get("preferredOrgUnitId")),
    notes: emptyToUndefined(formData.get("notes")),
    status: emptyToUndefined(formData.get("status")) ?? "ACTIVE",

    orgUnitId: emptyToUndefined(formData.get("orgUnitId")),
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
  if (!(await checkPermission("students:edit"))) {
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

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const student = await sdb.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: { id: true, status: true, name: true, centerId: true },
  });
  if (!student) {
    return { ok: false as const, error: "Không tìm thấy học viên" };
  }
  // Cách ly cơ sở: HV phải thuộc tầm nhìn actor.
  if (!(await studentInScope(session.user.id, input.studentId))) {
    return { ok: false as const, error: "Không tìm thấy học viên" };
  }

  const existing = await sdb.studentReserve.findFirst({
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
    const enr = await sdb.enrollment.findFirst({
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

  await sdb.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient;
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

      // P3 (additive): also write to unified AuditLog.
      await writeAudit({
        actor: { id: actorId, name: actorName },
        module: "students",
        entityType: "Student",
        entityId: input.studentId,
        action: "STATUS_CHANGE",
        oldValues: { status: student.status },
        newValues: { status: "PAUSED" },
        changedFields: ["status"],
        reason: `Bảo lưu: ${input.reason.trim()}`,
        orgUnitId: student.centerId,
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

      // P3 (additive): also write to unified AuditLog.
      await writeAudit({
        actor: { id: actorId, name: actorName },
        module: "students",
        entityType: "Enrollment",
        entityId: enr.id,
        action: "STATUS_CHANGE",
        oldValues: { status: enr.status },
        newValues: { status: "PAUSED" },
        changedFields: ["status"],
        reason: input.reason.trim(),
        orgUnitId: student.centerId,
        tx,
      });
    }
  });

  revalidatePath("/students");
  revalidatePath(`/students/${input.studentId}/edit`);

  const studentForEmail = await sdb.student.findUnique({
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
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const reserve = await sdb.studentReserve.findUnique({
    where: { id: input.reserveId },
    select: {
      id: true,
      studentId: true,
      enrollmentId: true,
      isActive: true,
      student: { select: { status: true, centerId: true } },
    },
  });
  if (!reserve) {
    return { ok: false as const, error: "Không tìm thấy đợt bảo lưu" };
  }
  // Cách ly cơ sở: HV của đợt bảo lưu phải thuộc tầm nhìn actor.
  if (!(await studentInScope(session.user.id, reserve.studentId))) {
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

  try {
    await sdb.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Prisma.TransactionClient;
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

      // P3 (additive): also write to unified AuditLog.
      await writeAudit({
        actor: { id: actorId, name: actorName },
        module: "students",
        entityType: "Student",
        entityId: reserve.studentId,
        action: "STATUS_CHANGE",
        oldValues: { status: "PAUSED" },
        newValues: { status: "ACTIVE" },
        changedFields: ["status"],
        reason: `Kết thúc bảo lưu${input.endReason ? `: ${input.endReason.trim()}` : ""}`,
        orgUnitId: reserve.student.centerId,
        tx,
      });
    }

    const enrollmentsToResume = reserve.enrollmentId
      ? await tx.enrollment.findMany({
          where: { id: reserve.enrollmentId },
          select: { id: true, status: true },
        })
      : await tx.enrollment.findMany({
          where: { studentId: reserve.studentId, status: "PAUSED" },
          select: { id: true, status: true },
        });

    for (const enr of enrollmentsToResume) {
      // Guard state machine chuẩn: chỉ phục học khi enrollment được phép →STUDYING
      // (PAUSED hợp lệ). Không hợp lệ → huỷ tx, trả lỗi VI.
      if (!canTransition(enr.status, "STUDYING")) {
        throw new Error(INVALID_RESUME_TRANSITION);
      }

      await tx.enrollment.update({
        where: { id: enr.id },
        data: { status: "STUDYING" },
      });

      await tx.enrollmentAuditLog.create({
        data: {
          enrollmentId: enr.id,
          fromStatus: enr.status,
          toStatus: "STUDYING",
          changedByUserId: actorId,
          changedByName: actorName,
          reason: `Kết thúc bảo lưu${input.endReason ? `: ${input.endReason.trim()}` : ""}`,
        },
      });

      // P3 (additive): also write to unified AuditLog.
      await writeAudit({
        actor: { id: actorId, name: actorName },
        module: "students",
        entityType: "Enrollment",
        entityId: enr.id,
        action: "STATUS_CHANGE",
        oldValues: { status: "PAUSED" },
        newValues: { status: "STUDYING" },
        changedFields: ["status"],
        reason: `Kết thúc bảo lưu${input.endReason ? `: ${input.endReason.trim()}` : ""}`,
        orgUnitId: reserve.student.centerId,
        tx,
      });
    }
    });
  } catch (err) {
    if (err instanceof Error && err.message === INVALID_RESUME_TRANSITION) {
      return { ok: false as const, error: "Không thể chuyển trạng thái này" };
    }
    throw err;
  }

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

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const student = await sdb.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: { id: true, status: true, centerId: true },
  });
  if (!student) {
    return { ok: false as const, error: "Không tìm thấy học viên" };
  }
  // Cách ly cơ sở: HV phải thuộc tầm nhìn actor.
  if (!(await studentInScope(session.user.id, input.studentId))) {
    return { ok: false as const, error: "Không tìm thấy học viên" };
  }
  if (student.status === "INACTIVE") {
    return { ok: false as const, error: "Học viên đã nghỉ học rồi" };
  }

  const { actorId, actorName } = getAuditActor(session);

  await sdb.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient;
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

    // P3 (additive): also write to unified AuditLog.
    await writeAudit({
      actor: { id: actorId, name: actorName },
      module: "students",
      entityType: "Student",
      entityId: input.studentId,
      action: "STATUS_CHANGE",
      oldValues: { status: student.status },
      newValues: { status: "INACTIVE" },
      changedFields: ["status"],
      reason: `Nghỉ học: ${input.reason.trim()}`,
      orgUnitId: student.centerId,
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

      // P3 (additive): also write to unified AuditLog.
      await writeAudit({
        actor: { id: actorId, name: actorName },
        module: "students",
        entityType: "Enrollment",
        entityId: enr.id,
        action: "STATUS_CHANGE",
        oldValues: { status: enr.status },
        newValues: { status: "WITHDREW" },
        changedFields: ["status"],
        reason: `Học viên nghỉ học: ${input.reason.trim()}`,
        orgUnitId: student.centerId,
        tx,
      });

      // W3-1 / LMS-9 — HS nghỉ học → tạo yêu cầu hoàn tiền (PENDING) cho ghi danh
      // còn sống, trong cùng transaction. Idempotent + chỉ tạo khi có khoản đã thu.
      await createRefundRequest({
        enrollmentId: enr.id,
        trigger: "WITHDRAW",
        reason: `Học viên nghỉ học: ${input.reason.trim()}`,
        requestedById: actorId,
        actorName,
        tx,
      });
    }
  });

  revalidatePath("/students");
  revalidatePath(`/students/${input.studentId}/edit`);

  const studentForEmail = await sdb.student.findUnique({
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

// ═══════════════════════════════════════════════════════════════════
// Phase T2.2 — Cấp tài khoản phụ huynh (PARENT) cho học viên (portal site con).
// Tạo/dùng lại User role PARENT + link student.parentUserId. Tự link các anh
// chị em cùng parentPhone (chưa có parent) để 1 phụ huynh quản nhiều con.
// ═══════════════════════════════════════════════════════════════════

const parentAccountSchema = z.object({
  studentId: z.string().min(1),
  email: z.string().email("Email không hợp lệ"),
  name: z.string().trim().max(120).optional(),
});

// P0-2: cấp tài khoản phụ huynh = PENDING_ACTIVATION + gửi OTP kích hoạt (KHÔNG
// đặt mật khẩu tạm). Phụ huynh tự đặt mật khẩu khi kích hoạt (flow A1).
export async function createParentAccount(input: {
  studentId: string;
  email: string;
  name?: string;
}): Promise<{ ok: boolean; linkedCount?: number; pendingActivation?: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("students:edit"))) {
    return { ok: false, error: "Không có quyền cấp tài khoản phụ huynh" };
  }

  const parsed = parentAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { studentId } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const student = await sdb.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: { id: true, parentUserId: true, parentName: true, parentPhone: true },
  });
  if (!student) return { ok: false, error: "Không tìm thấy học viên" };
  // Cách ly cơ sở: chỉ cấp tài khoản PH cho HV trong tầm nhìn actor.
  if (!(await studentInScope(session.user.id, studentId))) {
    return { ok: false, error: "Không tìm thấy học viên" };
  }
  if (student.parentUserId) {
    return { ok: false, error: "Học viên đã có tài khoản phụ huynh" };
  }

  // Email đã dùng?
  const existingUser = await sdb.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (existingUser && existingUser.role !== "PARENT") {
    return { ok: false, error: "Email đã dùng cho tài khoản nhân viên khác" };
  }

  const parentName = parsed.data.name?.trim() || student.parentName || "Phụ huynh";

  try {
    const result = await sdb.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Prisma.TransactionClient;
      let parentUserId = existingUser?.id;
      let isNewPending = false;
      if (!parentUserId) {
        // Tài khoản mới: PENDING_ACTIVATION, KHÔNG mật khẩu — kích hoạt qua OTP.
        const created = await tx.user.create({
          data: {
            name: parentName,
            email,
            role: "PARENT",
            isActive: true,
            accountStatus: "PENDING_ACTIVATION",
            tokenVersion: 0,
          },
          select: { id: true },
        });
        parentUserId = created.id;
        isNewPending = true;
      }

      // Link student hiện tại + anh chị em cùng SĐT phụ huynh (chưa có parent).
      const siblingFilter: Prisma.StudentWhereInput = student.parentPhone
        ? {
            deletedAt: null,
            parentUserId: null,
            OR: [{ id: studentId }, { parentPhone: student.parentPhone }],
          }
        : { id: studentId };

      const res = await tx.student.updateMany({
        where: siblingFilter,
        data: { parentUserId },
      });
      return { linkedCount: res.count, isNewPending };
    });

    // Tài khoản mới PENDING_ACTIVATION → gửi OTP kích hoạt (ngoài transaction).
    if (result.isNewPending) {
      await requestOtp({ target: email, purpose: "ACTIVATION" }).catch(() => {});
    }

    revalidatePath(`/students/${studentId}/edit`);
    return { ok: true, linkedCount: result.linkedCount, pendingActivation: result.isNewPending };
  } catch {
    return { ok: false, error: "Lỗi tạo tài khoản phụ huynh" };
  }
}

// P0-2: gửi LẠI mã kích hoạt cho phụ huynh đang chờ kích hoạt.
export async function resendParentActivationOtp(
  studentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("students:edit"))) return { ok: false, error: "Không có quyền" };

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const student = await sdb.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: { parentUser: { select: { email: true, accountStatus: true } } },
  });
  const parent = student?.parentUser;
  if (!parent?.email) return { ok: false, error: "Học viên chưa có tài khoản phụ huynh" };
  if (parent.accountStatus !== "PENDING_ACTIVATION") {
    return { ok: false, error: "Tài khoản đã kích hoạt — không cần gửi lại mã" };
  }

  const res = await requestOtp({ target: parent.email, purpose: "ACTIVATION" });
  if (!res.ok) {
    return { ok: false, error: res.error ?? "Không gửi được mã (thử lại sau ít phút)" };
  }
  return { ok: true };
}

// ─── ĐA CON: thêm/bỏ liên kết con cho 1 phụ huynh (commit 3) ─────────
// 1 phụ huynh (User PARENT) quản lý nhiều con qua Student.parentUserId.

/** Tìm học viên CHƯA gắn phụ huynh để liên kết thêm vào 1 phụ huynh. */
export async function searchLinkableStudents(
  query: string,
): Promise<{ ok: boolean; items?: { id: string; name: string; studentCode: string | null }[]; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("students:edit"))) return { ok: false, error: "Không có quyền" };

  const q = query.trim();
  if (q.length < 1) return { ok: true, items: [] };

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  // CENTER_MANAGER (không super) chỉ thấy HV cơ sở mình.
  const centerScope =
    hasRole(session.user, "CENTER_MANAGER") && !hasRole(session.user, "SUPER_ADMIN")
      ? session.user.centerId
      : null;

  const items = await sdb.student.findMany({
    where: {
      deletedAt: null,
      parentUserId: null,
      ...(centerScope ? { centerId: centerScope } : {}),
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { studentCode: { contains: q, mode: "insensitive" } },
        { parentPhone: { contains: q } },
      ],
    },
    orderBy: { name: "asc" },
    take: 10,
    select: { id: true, name: true, studentCode: true },
  });
  return { ok: true, items };
}

/** Gắn 1 học viên (đang chưa có phụ huynh) vào phụ huynh của studentId hiện tại. */
export async function addChildToParent(input: {
  parentUserId: string;
  childStudentId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("students:edit"))) return { ok: false, error: "Không có quyền" };

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const [parent, child] = await Promise.all([
    sdb.user.findFirst({ where: { id: input.parentUserId, role: "PARENT", deletedAt: null }, select: { id: true } }),
    sdb.student.findFirst({
      where: { id: input.childStudentId, deletedAt: null },
      select: { id: true, parentUserId: true },
    }),
  ]);
  if (!parent) return { ok: false, error: "Không tìm thấy tài khoản phụ huynh" };
  if (!child) return { ok: false, error: "Không tìm thấy học viên" };
  // Cách ly cơ sở: chỉ gắn con là HV trong tầm nhìn actor.
  if (!(await studentInScope(session.user.id, child.id))) {
    return { ok: false, error: "Không tìm thấy học viên" };
  }
  if (child.parentUserId && child.parentUserId !== input.parentUserId) {
    return { ok: false, error: "Học viên đã thuộc phụ huynh khác — gỡ liên kết cũ trước" };
  }

  await sdb.student.update({ where: { id: child.id }, data: { parentUserId: input.parentUserId } });
  revalidatePath(`/students/${child.id}/edit`);
  return { ok: true };
}

/** Gỡ liên kết 1 con khỏi phụ huynh (không xoá học viên). */
export async function unlinkChildFromParent(
  childStudentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("students:edit"))) return { ok: false, error: "Không có quyền" };

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  // Cách ly cơ sở: chỉ gỡ liên kết HV trong tầm nhìn actor (chống IDOR ghi).
  if (!(await studentInScope(session.user.id, childStudentId))) {
    return { ok: false, error: "Không tìm thấy học viên" };
  }

  await sdb.student.update({ where: { id: childStudentId }, data: { parentUserId: null } });
  revalidatePath(`/students/${childStudentId}/edit`);
  return { ok: true };
}

// ─── REACTIVATE STUDENT (INACTIVE/PAUSED → ACTIVE) ───────────────────
// Note: KHÔNG auto-create enrollment. Admin phải tạo Enrollment mới
// qua flow Enrollment riêng.
export async function reactivateStudentAction(input: {
  studentId: string;
  note?: string | null;
}) {
  const session = await requireStudentLifecycle();
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const student = await sdb.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: { id: true, status: true, centerId: true },
  });
  if (!student) {
    return { ok: false as const, error: "Không tìm thấy học viên" };
  }
  // Cách ly cơ sở: HV phải thuộc tầm nhìn actor.
  if (!(await studentInScope(session.user.id, input.studentId))) {
    return { ok: false as const, error: "Không tìm thấy học viên" };
  }
  if (student.status === "ACTIVE") {
    return { ok: false as const, error: "Học viên đã đang ACTIVE" };
  }

  const { actorId, actorName } = getAuditActor(session);

  await sdb.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient;
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

    // P3 (additive): also write to unified AuditLog.
    await writeAudit({
      actor: { id: actorId, name: actorName },
      module: "students",
      entityType: "Student",
      entityId: input.studentId,
      action: "STATUS_CHANGE",
      oldValues: { status: student.status },
      newValues: { status: "ACTIVE" },
      changedFields: ["status"],
      reason: `Kích hoạt lại${input.note ? `: ${input.note.trim()}` : ""}`,
      orgUnitId: student.centerId,
      tx,
    });
  });

  revalidatePath("/students");
  revalidatePath(`/students/${input.studentId}/edit`);
  return { ok: true as const };
}
