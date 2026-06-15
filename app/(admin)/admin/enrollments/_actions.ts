"use server";

import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

type ActionResult = { error?: string };
type WorkflowResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// Statuses that count toward a class's capacity.
const CAPACITY_COUNT_STATUSES = ["PENDING", "CONFIRMED", "STUDYING", "ACTIVE"] as const;
const TERMINAL_STATUSES = ["COMPLETED", "WITHDREW", "TRANSFERRED", "CANCELLED"] as const;
const ALL_NEW_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "STUDYING",
  "PAUSED",
  "COMPLETED",
  "WITHDREW",
] as const;

// Legacy CRUD schema kept for back-compat with existing tuition/paidAt rows.
const LEGACY_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "STUDYING",
  "PAUSED",
  "COMPLETED",
  "WITHDREW",
  "TRANSFERRED",
  "ACTIVE",
  "CANCELLED",
] as const;

const enrollmentSchema = z.object({
  studentId: z.string().trim().min(1, "Học viên không được để trống"),
  classId: z.string().trim().min(1, "Lớp học không được để trống"),
  status: z.enum(LEGACY_STATUSES),
  tuition: z.number().int().nonnegative().nullable(),
  paidAt: z.date().nullable(),
  startDate: z.date().nullable(),
  endDate: z.date().nullable(),
});

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseInteger(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseDate(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * FIX 7 — Kiểm tra khoá tiên quyết. Trả lỗi nghiệp vụ thân thiện nếu học viên
 * chưa hoàn thành (Enrollment status COMPLETED) các khoá yêu cầu trước.
 * Khoá không có tiên quyết → luôn ok.
 */
export async function checkPrerequisites(
  studentId: string,
  courseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const prereqs = await db.coursePrerequisite.findMany({
      where: { courseId },
      select: { requiredCourse: { select: { id: true, name: true } } },
    });
    if (prereqs.length === 0) return { ok: true };

    const requiredIds = prereqs.map((p) => p.requiredCourse.id);
    const completed = await db.enrollment.findMany({
      where: { studentId, courseId: { in: requiredIds }, status: "COMPLETED" },
      select: { courseId: true },
    });
    const done = new Set(completed.map((c) => c.courseId));
    const missing = prereqs
      .filter((p) => !done.has(p.requiredCourse.id))
      .map((p) => p.requiredCourse.name);

    if (missing.length > 0) {
      return {
        ok: false,
        error: `Học viên cần hoàn thành ${missing.join(", ")} trước khi đăng ký khoá này.`,
      };
    }
    return { ok: true };
  } catch {
    // Lỗi tra cứu tiên quyết → không chặn cứng (fail-open) nhưng log.
    console.error("[checkPrerequisites] lookup error for course", courseId);
    return { ok: true };
  }
}

async function requireSalesOrAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "enrollments:edit")) {
    redirect("/dashboard?error=unauthorized");
  }
  return session;
}

function readForm(formData: FormData) {
  const statusRaw =
    emptyToUndefined(formData.get("status")) ?? "PENDING";
  return {
    studentId: emptyToUndefined(formData.get("studentId")) ?? "",
    classId: emptyToUndefined(formData.get("classId")) ?? "",
    status: statusRaw as (typeof LEGACY_STATUSES)[number],
    tuition: parseInteger(formData.get("tuition")),
    paidAt: parseDate(formData.get("paidAt")),
    startDate: parseDate(formData.get("startDate")),
    endDate: parseDate(formData.get("endDate")),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Legacy CRUD actions (kept for back-compat with older form flows).
// ────────────────────────────────────────────────────────────────────────────

export async function createEnrollment(formData: FormData): Promise<ActionResult> {
  await requireSalesOrAdmin();

  const parsed = enrollmentSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const e = parsed.data;

  let classRow: { courseId: string } | null;
  let existing: { id: string } | null;
  try {
    [classRow, existing] = await Promise.all([
      db.class.findUnique({ where: { id: e.classId }, select: { courseId: true } }),
      db.enrollment.findFirst({
        where: { studentId: e.studentId, classId: e.classId },
        select: { id: true },
      }),
    ]);
  } catch {
    return { error: "Lỗi cơ sở dữ liệu khi kiểm tra lớp/đăng ký" };
  }
  if (!classRow) return { error: "Lớp học không tồn tại" };
  if (existing) return { error: "Học viên này đã đăng ký lớp này rồi" };

  const data: Prisma.EnrollmentCreateInput = {
    student: { connect: { id: e.studentId } },
    class: { connect: { id: e.classId } },
    course: { connect: { id: classRow.courseId } },
    status: e.status,
    tuition: e.tuition,
    paidAt: e.paidAt,
    startDate: e.startDate,
    endDate: e.endDate,
  };

  try {
    await db.enrollment.create({ data });
  } catch {
    return { error: "Lỗi cơ sở dữ liệu — không tạo được đăng ký" };
  }

  revalidatePath("/enrollments");
  redirect("/enrollments");
}

export async function updateEnrollment(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireSalesOrAdmin();

  const parsed = enrollmentSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const e = parsed.data;
  const existing = await db.enrollment.findUnique({
    where: { id },
    select: { studentId: true, classId: true },
  });
  if (!existing) return { error: "Đăng ký không tồn tại" };

  if (existing.studentId !== e.studentId || existing.classId !== e.classId) {
    const dup = await db.enrollment.findFirst({
      where: {
        studentId: e.studentId,
        classId: e.classId,
        id: { not: id },
      },
      select: { id: true },
    });
    if (dup) return { error: "Học viên này đã đăng ký lớp này rồi" };
  }

  const classRow = await db.class
    .findUnique({ where: { id: e.classId }, select: { courseId: true } })
    .catch(() => null);
  if (!classRow) return { error: "Lớp học không tồn tại" };

  const data: Prisma.EnrollmentUpdateInput = {
    student: { connect: { id: e.studentId } },
    class: { connect: { id: e.classId } },
    course: { connect: { id: classRow.courseId } },
    status: e.status,
    tuition: e.tuition,
    paidAt: e.paidAt,
    startDate: e.startDate,
    endDate: e.endDate,
  };

  try {
    await db.enrollment.update({ where: { id }, data });
  } catch {
    return { error: "Lỗi cơ sở dữ liệu — không cập nhật được" };
  }

  revalidatePath("/enrollments");
  revalidatePath(`/enrollments/${id}/edit`);
  redirect("/enrollments");
}

export async function deleteEnrollment(id: string): Promise<ActionResult> {
  await requireSalesOrAdmin();
  try {
    await db.enrollment.delete({ where: { id } });
  } catch {
    return { error: "Không thể xoá đăng ký này" };
  }
  revalidatePath("/enrollments");
  return {};
}

// ────────────────────────────────────────────────────────────────────────────
// D5 workflow: enrollStudent / changeEnrollmentStatus / transferEnrollment
// ────────────────────────────────────────────────────────────────────────────

const EnrollStudentSchema = z.object({
  studentId: z.string().trim().min(1, "Chọn học viên"),
  classId: z.string().trim().min(1, "Chọn lớp"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function enrollStudent(
  input: z.infer<typeof EnrollStudentSchema>,
): Promise<WorkflowResult<{ enrollmentId: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "enrollments:create")) {
    return { ok: false, error: "Không có quyền đăng ký HS" };
  }

  const parsed = EnrollStudentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const { studentId, classId } = parsed.data;
  const notes = parsed.data.notes && parsed.data.notes !== "" ? parsed.data.notes : null;

  // Pre-create validation queries — bọc try/catch để lỗi DB (vd Prisma Client
  // stale sau migration, mất kết nối) trả về thông báo thân thiện thay vì văng
  // 500 không bắt được.
  let cls: {
    id: string;
    courseId: string;
    maxStudents: number;
    status: string;
    _count: { enrollments: number };
  } | null;
  let existing: { status: string } | null;
  let student: { id: string } | null;
  try {
    [cls, existing, student] = await Promise.all([
      db.class.findFirst({
        where: { id: classId, deletedAt: null },
        select: {
          id: true,
          courseId: true,
          maxStudents: true,
          status: true,
          _count: {
            select: {
              enrollments: {
                where: { status: { in: [...CAPACITY_COUNT_STATUSES] } },
              },
            },
          },
        },
      }),
      db.enrollment.findUnique({
        where: { studentId_classId: { studentId, classId } },
        select: { status: true },
      }),
      db.student.findFirst({
        where: { id: studentId, deletedAt: null },
        select: { id: true },
      }),
    ]);
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu khi kiểm tra dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  if (!cls) return { ok: false, error: "Không tìm thấy lớp" };
  if (cls.status === "CANCELLED" || cls.status === "COMPLETED") {
    return {
      ok: false,
      error: `Lớp đang ở trạng thái ${cls.status}, không thể đăng ký mới`,
    };
  }
  if (cls._count.enrollments >= cls.maxStudents) {
    return {
      ok: false,
      error: `Lớp đã đủ HS (${cls.maxStudents} chỗ). Hãy chọn lớp khác.`,
    };
  }
  if (existing) {
    return {
      ok: false,
      error: `Học viên đã có trong lớp này (trạng thái: ${existing.status})`,
    };
  }
  if (!student) return { ok: false, error: "Không tìm thấy học viên" };

  // FIX 7 — kiểm tra khoá tiên quyết: khoá của lớp có yêu cầu khoá trước không,
  // và học viên đã hoàn thành (Enrollment COMPLETED) chưa.
  const prereq = await checkPrerequisites(studentId, cls.courseId);
  if (!prereq.ok) return prereq;

  try {
    const enrollment = await db.enrollment.create({
      data: {
        student: { connect: { id: studentId } },
        class: { connect: { id: classId } },
        course: { connect: { id: cls.courseId } },
        status: "PENDING",
        notes,
      },
      select: { id: true },
    });
    revalidatePath("/enrollments");
    revalidatePath(`/classes/${classId}/edit`);
    return { ok: true, data: { enrollmentId: enrollment.id } };
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
}

const ChangeStatusSchema = z.object({
  enrollmentId: z.string(),
  newStatus: z.enum(ALL_NEW_STATUSES),
  reason: z.string().min(5, "Lý do phải có ít nhất 5 ký tự"),
});

export async function changeEnrollmentStatus(
  input: z.infer<typeof ChangeStatusSchema>,
): Promise<WorkflowResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "enrollments:edit")) {
    return { ok: false, error: "Không có quyền đổi trạng thái" };
  }

  const parsed = ChangeStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const enrollment = await db.enrollment.findUnique({
    where: { id: data.enrollmentId },
    select: { id: true, status: true, classId: true },
  });
  if (!enrollment) return { ok: false, error: "Không tìm thấy enrollment" };
  if (enrollment.status === data.newStatus) {
    return { ok: false, error: "Trạng thái không thay đổi" };
  }
  if (enrollment.status === "TRANSFERRED") {
    return {
      ok: false,
      error: "Không thể đổi trạng thái cho enrollment đã chuyển lớp",
    };
  }

  // Capacity check when moving INTO an active state (PENDING→CONFIRMED, etc.)
  if (
    CAPACITY_COUNT_STATUSES.includes(
      data.newStatus as (typeof CAPACITY_COUNT_STATUSES)[number],
    ) &&
    !CAPACITY_COUNT_STATUSES.includes(
      enrollment.status as (typeof CAPACITY_COUNT_STATUSES)[number],
    )
  ) {
    const cls = await db.class.findUnique({
      where: { id: enrollment.classId },
      select: {
        maxStudents: true,
        _count: {
          select: {
            enrollments: {
              where: { status: { in: [...CAPACITY_COUNT_STATUSES] } },
            },
          },
        },
      },
    });
    if (cls && cls._count.enrollments >= cls.maxStudents) {
      return {
        ok: false,
        error: `Lớp đã đủ HS (${cls.maxStudents} chỗ). Không thể chuyển HS thành ${data.newStatus}.`,
      };
    }
  }

  const timestamps: Prisma.EnrollmentUpdateInput = {};
  if (data.newStatus === "CONFIRMED") timestamps.confirmedAt = new Date();
  if (data.newStatus === "STUDYING") timestamps.startedAt = new Date();
  if (data.newStatus === "COMPLETED" || data.newStatus === "WITHDREW") {
    timestamps.endedAt = new Date();
  }

  try {
    await db.$transaction([
      db.enrollment.update({
        where: { id: data.enrollmentId },
        data: { status: data.newStatus, ...timestamps },
      }),
      db.enrollmentAuditLog.create({
        data: {
          enrollmentId: data.enrollmentId,
          fromStatus: enrollment.status,
          toStatus: data.newStatus,
          changedByUserId: session.user.id ?? null,
          changedByName:
            session.user.name ?? session.user.email ?? "Unknown",
          reason: data.reason,
        },
      }),
    ]);
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidatePath("/enrollments");
  revalidatePath(`/enrollments/${data.enrollmentId}/edit`);
  revalidatePath(`/classes/${enrollment.classId}/edit`);
  return { ok: true };
}

const TransferSchema = z.object({
  enrollmentId: z.string(),
  targetClassId: z.string().min(1, "Chọn lớp đích"),
  reason: z.string().min(5, "Lý do phải có ít nhất 5 ký tự"),
});

export async function transferEnrollment(
  input: z.infer<typeof TransferSchema>,
): Promise<WorkflowResult<{ newEnrollmentId: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "enrollments:transfer")) {
    return { ok: false, error: "Không có quyền chuyển lớp" };
  }

  const parsed = TransferSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const oldEnrollment = await db.enrollment.findUnique({
    where: { id: data.enrollmentId },
    select: { id: true, status: true, studentId: true, classId: true },
  });
  if (!oldEnrollment) return { ok: false, error: "Không tìm thấy enrollment cũ" };
  if (oldEnrollment.classId === data.targetClassId) {
    return { ok: false, error: "Lớp đích trùng lớp hiện tại" };
  }
  if (
    TERMINAL_STATUSES.includes(
      oldEnrollment.status as (typeof TERMINAL_STATUSES)[number],
    )
  ) {
    return {
      ok: false,
      error: `Không thể chuyển enrollment đang ${oldEnrollment.status}`,
    };
  }

  const targetClass = await db.class.findFirst({
    where: { id: data.targetClassId, deletedAt: null },
    select: {
      id: true,
      courseId: true,
      maxStudents: true,
      status: true,
      _count: {
        select: {
          enrollments: {
            where: { status: { in: [...CAPACITY_COUNT_STATUSES] } },
          },
        },
      },
    },
  });
  if (!targetClass) return { ok: false, error: "Không tìm thấy lớp đích" };
  if (targetClass.status === "CANCELLED" || targetClass.status === "COMPLETED") {
    return { ok: false, error: `Lớp đích đang ${targetClass.status}` };
  }
  if (targetClass._count.enrollments >= targetClass.maxStudents) {
    return {
      ok: false,
      error: `Lớp đích đã đủ HS (${targetClass.maxStudents} chỗ)`,
    };
  }

  const existing = await db.enrollment.findUnique({
    where: {
      studentId_classId: {
        studentId: oldEnrollment.studentId,
        classId: data.targetClassId,
      },
    },
    select: { status: true },
  });
  if (existing) {
    return {
      ok: false,
      error: `HS đã có enrollment ở lớp đích (status: ${existing.status})`,
    };
  }

  const auditor = {
    userId: session.user.id ?? null,
    name: session.user.name ?? session.user.email ?? "Unknown",
  };

  try {
    const newId = await db.$transaction(async (tx) => {
      const newEnrollment = await tx.enrollment.create({
        data: {
          student: { connect: { id: oldEnrollment.studentId } },
          class: { connect: { id: data.targetClassId } },
          course: { connect: { id: targetClass.courseId } },
          status: "CONFIRMED",
          confirmedAt: new Date(),
          notes: `Chuyển từ enrollment ${oldEnrollment.id}`,
        },
        select: { id: true },
      });

      await tx.enrollment.update({
        where: { id: oldEnrollment.id },
        data: {
          status: "TRANSFERRED",
          transferredToId: newEnrollment.id,
          transferReason: data.reason,
          endedAt: new Date(),
        },
      });

      await tx.enrollmentAuditLog.create({
        data: {
          enrollmentId: oldEnrollment.id,
          fromStatus: oldEnrollment.status,
          toStatus: "TRANSFERRED",
          changedByUserId: auditor.userId,
          changedByName: auditor.name,
          reason: data.reason,
          extraData: {
            transferredToId: newEnrollment.id,
            targetClassId: data.targetClassId,
          },
        },
      });
      await tx.enrollmentAuditLog.create({
        data: {
          enrollmentId: newEnrollment.id,
          fromStatus: "—",
          toStatus: "CONFIRMED",
          changedByUserId: auditor.userId,
          changedByName: auditor.name,
          reason: `Chuyển từ lớp cũ: ${data.reason}`,
          extraData: {
            transferredFromId: oldEnrollment.id,
            sourceClassId: oldEnrollment.classId,
          },
        },
      });

      return newEnrollment.id;
    });

    revalidatePath("/enrollments");
    revalidatePath(`/classes/${oldEnrollment.classId}/edit`);
    revalidatePath(`/classes/${data.targetClassId}/edit`);
    revalidatePath(`/enrollments/${oldEnrollment.id}/edit`);
    return { ok: true, data: { newEnrollmentId: newId } };
  } catch (err) {
    return {
      ok: false,
      error: `Transfer thất bại: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
}
