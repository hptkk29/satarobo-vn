"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

type ActionResult = { error?: string };

const ENROLLMENT_STATUSES = ["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const;

const enrollmentSchema = z.object({
  studentId: z.string().trim().min(1, "Học viên không được để trống"),
  classId: z.string().trim().min(1, "Lớp học không được để trống"),
  status: z.enum(ENROLLMENT_STATUSES),
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

async function requireSalesOrAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role;
  if (role !== "SUPER_ADMIN" && role !== "MANAGER" && role !== "SALES") {
    redirect("/admin/dashboard?error=unauthorized");
  }
  return session.user;
}

function readForm(formData: FormData) {
  const statusRaw = emptyToUndefined(formData.get("status")) ?? "ACTIVE";
  return {
    studentId: emptyToUndefined(formData.get("studentId")) ?? "",
    classId: emptyToUndefined(formData.get("classId")) ?? "",
    status: statusRaw as (typeof ENROLLMENT_STATUSES)[number],
    tuition: parseInteger(formData.get("tuition")),
    paidAt: parseDate(formData.get("paidAt")),
    startDate: parseDate(formData.get("startDate")),
    endDate: parseDate(formData.get("endDate")),
  };
}

export async function createEnrollment(formData: FormData): Promise<ActionResult> {
  await requireSalesOrAdmin();

  const parsed = enrollmentSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const e = parsed.data;

  // Resolve courseId from class
  const classRow = await db.class
    .findUnique({ where: { id: e.classId }, select: { courseId: true } })
    .catch(() => null);
  if (!classRow) return { error: "Lớp học không tồn tại" };

  // Check duplicate (@@unique([studentId, classId]))
  const existing = await db.enrollment.findFirst({
    where: { studentId: e.studentId, classId: e.classId },
    select: { id: true },
  });
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

  revalidatePath("/admin/enrollments");
  redirect("/admin/enrollments");
}

export async function updateEnrollment(id: string, formData: FormData): Promise<ActionResult> {
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

  // If student/class changed, check duplicate against new combination
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

  // Resolve courseId from class
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

  revalidatePath("/admin/enrollments");
  revalidatePath(`/admin/enrollments/${id}/edit`);
  redirect("/admin/enrollments");
}

export async function deleteEnrollment(id: string): Promise<ActionResult> {
  await requireSalesOrAdmin();
  try {
    await db.enrollment.delete({ where: { id } });
  } catch {
    return { error: "Không thể xoá đăng ký này" };
  }
  revalidatePath("/admin/enrollments");
  return {};
}

export async function setEnrollmentStatus(
  id: string,
  status: (typeof ENROLLMENT_STATUSES)[number],
): Promise<ActionResult> {
  await requireSalesOrAdmin();
  try {
    await db.enrollment.update({ where: { id }, data: { status } });
  } catch {
    return { error: "Không thể cập nhật trạng thái" };
  }
  revalidatePath("/admin/enrollments");
  return {};
}
