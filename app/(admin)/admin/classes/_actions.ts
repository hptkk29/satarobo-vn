"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { can, hasAnyRole, type Action } from "@/lib/auth/permissions";
import { classCreateSchema } from "@/lib/validators/class";
import {
  logClassAudit,
  detectChangedFields,
  getAuditActor,
} from "@/lib/audit/log";
import { genClassCode } from "@/lib/codegen";

type ActionResult = { error?: string };

async function requireClassWrite(action: "create" | "update" | "delete") {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const actionMap: Record<typeof action, Action> = {
    create: "classes:create",
    update: "classes:edit",
    delete: "classes:delete",
  };

  if (!can(session.user, actionMap[action])) {
    redirect("/dashboard?error=unauthorized");
  }
  return session;
}

function toCreateData(
  parsed: ReturnType<typeof classCreateSchema.parse>,
  classCode: string | null,
): Prisma.ClassCreateInput {
  const {
    courseId,
    centerId,
    classGroupId,
    roomId,
    teacherId,
    assistantId,
    classCode: _ignoredCode,
    ...rest
  } = parsed;
  void _ignoredCode;

  return {
    ...rest,
    classCode,
    course: { connect: { id: courseId } },
    center: { connect: { id: centerId } },
    ...(classGroupId ? { classGroup: { connect: { id: classGroupId } } } : {}),
    ...(roomId ? { room: { connect: { id: roomId } } } : {}),
    ...(teacherId ? { teacher: { connect: { id: teacherId } } } : {}),
    ...(assistantId ? { assistant: { connect: { id: assistantId } } } : {}),
  };
}

function toUpdateData(
  parsed: ReturnType<typeof classCreateSchema.parse>,
): Prisma.ClassUpdateInput {
  const {
    courseId,
    centerId,
    classGroupId,
    roomId,
    teacherId,
    assistantId,
    ...rest
  } = parsed;

  return {
    ...rest,
    course: { connect: { id: courseId } },
    center: { connect: { id: centerId } },
    classGroup: classGroupId
      ? { connect: { id: classGroupId } }
      : { disconnect: true },
    room: roomId ? { connect: { id: roomId } } : { disconnect: true },
    teacher: teacherId ? { connect: { id: teacherId } } : { disconnect: true },
    assistant: assistantId
      ? { connect: { id: assistantId } }
      : { disconnect: true },
  };
}

function readForm(formData: FormData) {
  const scheduleDaysRaw = formData.getAll("scheduleDays");
  const scheduleDays = scheduleDaysRaw
    .map((v) => (typeof v === "string" ? parseInt(v, 10) : NaN))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);

  function s(name: string): string | undefined {
    const v = formData.get(name);
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  }

  return {
    name: s("name") ?? "",
    classCode: s("classCode"),
    description: s("description"),

    courseId: s("courseId") ?? "",
    centerId: s("centerId") ?? "",
    classGroupId: s("classGroupId"),
    roomId: s("roomId"),
    teacherId: s("teacherId"),
    assistantId: s("assistantId"),

    startDate: s("startDate"),
    endDate: s("endDate"),
    scheduleDays,
    startTime: s("startTime"),
    endTime: s("endTime"),

    maxStudents: s("maxStudents") ?? 20,
    minStudents: s("minStudents") ?? 5,

    status: s("status") ?? "PLANNED",
    notes: s("notes"),
    schedule: s("schedule"),
  };
}

const CLASS_SNAPSHOT_SELECT = {
  name: true,
  classCode: true,
  courseId: true,
  centerId: true,
  roomId: true,
  teacherId: true,
  assistantId: true,
  status: true,
  startDate: true,
  endDate: true,
  maxStudents: true,
} as const;

export async function createClass(formData: FormData): Promise<ActionResult> {
  const session = await requireClassWrite("create");

  const raw = readForm(formData);
  const parsed = classCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const { actorId, actorName } = getAuditActor(session);
  const data = parsed.data;

  // Phase T0.2 — nếu gán nhóm lớp, kế thừa centerId của nhóm.
  if (data.classGroupId) {
    const group = await db.classGroup.findUnique({
      where: { id: data.classGroupId },
      select: { centerId: true },
    });
    if (group) data.centerId = group.centerId;
  }

  try {
    await db.$transaction(async (tx) => {
      // Phase T0.2 — tự sinh classCode nếu admin để trống (giữ mã cũ nếu có).
      let classCode = data.classCode;
      if (!classCode) {
        const [center, course] = await Promise.all([
          tx.center.findUnique({
            where: { id: data.centerId },
            select: { code: true },
          }),
          tx.course.findUnique({
            where: { id: data.courseId },
            select: { code: true, slug: true },
          }),
        ]);
        if (center?.code) {
          const courseCode = course?.code || course?.slug || "KH";
          classCode = await genClassCode(center.code, courseCode, tx);
        }
      }

      const created = await tx.class.create({
        data: toCreateData(data, classCode),
        select: { id: true, ...CLASS_SNAPSHOT_SELECT },
      });

      const { id: _id, ...newValues } = created;
      void _id;

      await logClassAudit({
        classId: created.id,
        action: "CREATE",
        actorId,
        actorName,
        newValues,
        tx,
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: "Mã lớp đã tồn tại" };
    }
    return { error: "Lỗi cơ sở dữ liệu — không tạo được lớp" };
  }

  revalidatePath("/classes");
  redirect("/classes");
}

export async function updateClass(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireClassWrite("update");

  const raw = readForm(formData);
  const parsed = classCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const before = await db.class.findUnique({
    where: { id },
    select: CLASS_SNAPSHOT_SELECT,
  });
  if (!before) return { error: "Không tìm thấy lớp" };

  const { actorId, actorName } = getAuditActor(session);

  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.class.update({
        where: { id },
        data: toUpdateData(parsed.data),
        select: CLASS_SNAPSHOT_SELECT,
      });

      await logClassAudit({
        classId: id,
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
      return { error: "Mã lớp đã tồn tại" };
    }
    return { error: "Lớp không tồn tại hoặc lỗi cơ sở dữ liệu" };
  }

  revalidatePath("/classes");
  revalidatePath(`/classes/${id}/edit`);
  redirect("/classes");
}

export async function deleteClass(id: string): Promise<ActionResult> {
  const session = await requireClassWrite("delete");

  const before = await db.class.findUnique({
    where: { id },
    select: CLASS_SNAPSHOT_SELECT,
  });
  if (!before) return { error: "Không thể xoá lớp này" };

  const { actorId, actorName } = getAuditActor(session);

  try {
    await db.$transaction(async (tx) => {
      await tx.class.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await logClassAudit({
        classId: id,
        action: "DELETE",
        actorId,
        actorName,
        oldValues: before,
        tx,
      });
    });
  } catch {
    return { error: "Không thể xoá lớp này" };
  }
  revalidatePath("/classes");
  return {};
}

// ─── Module Quản lý lớp PHẦN 1 — workflow phê duyệt ─────────────────────────

type WfResult = { ok: true } | { ok: false; error: string };

const SUBMIT_ROLES = ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"] as const;
const APPROVE_ROLES = ["SUPER_ADMIN", "CENTER_MANAGER"] as const;

/** Sale/quản lý gửi lớp đi duyệt (PLANNED/RECRUITING → PENDING_APPROVAL). */
export async function submitClassForApproval(classId: string): Promise<WfResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!hasAnyRole(session.user, [...SUBMIT_ROLES])) {
    return { ok: false, error: "Không có quyền gửi duyệt lớp" };
  }
  const cls = await db.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: { status: true, centerId: true, _count: { select: { enrollments: true } } },
  });
  if (!cls) return { ok: false, error: "Lớp không tồn tại" };
  if (cls.status !== "PLANNED" && cls.status !== "RECRUITING") {
    return { ok: false, error: `Lớp đang ${cls.status}, không thể gửi duyệt` };
  }
  if (cls._count.enrollments === 0) {
    return { ok: false, error: "Lớp chưa có học sinh nào — gán HS trước khi gửi duyệt" };
  }
  await db.class.update({
    where: { id: classId },
    data: { status: "PENDING_APPROVAL", submittedForApprovalAt: new Date() },
  });
  revalidatePath("/classes");
  revalidatePath(`/classes/${classId}/edit`);
  revalidatePath("/dashboard");
  return { ok: true };
}

async function requireApprover(classId: string) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "Chưa đăng nhập" };
  if (!hasAnyRole(session.user, [...APPROVE_ROLES])) {
    return { ok: false as const, error: "Chỉ quản lý cơ sở / SUPER_ADMIN được duyệt" };
  }
  const cls = await db.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: { status: true, centerId: true },
  });
  if (!cls) return { ok: false as const, error: "Lớp không tồn tại" };
  // CENTER_MANAGER (không kèm SUPER_ADMIN) chỉ duyệt cơ sở mình.
  const isSuper = hasAnyRole(session.user, ["SUPER_ADMIN"]);
  if (!isSuper && cls.centerId !== session.user.centerId) {
    return { ok: false as const, error: "Lớp không thuộc cơ sở của bạn" };
  }
  return { ok: true as const, session, cls };
}

/** Quản lý duyệt lớp (PENDING_APPROVAL → ACTIVE). */
export async function approveClass(classId: string): Promise<WfResult> {
  const gate = await requireApprover(classId);
  if (!gate.ok) return gate;
  if (gate.cls.status !== "PENDING_APPROVAL") {
    return { ok: false, error: "Lớp không ở trạng thái chờ duyệt" };
  }
  await db.class.update({
    where: { id: classId },
    data: {
      status: "ACTIVE",
      approvedAt: new Date(),
      approvedById: gate.session.user.id,
      approvedByName: gate.session.user.name ?? gate.session.user.email ?? "Quản lý",
    },
  });
  revalidatePath("/classes");
  revalidatePath(`/classes/${classId}/edit`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Quản lý trả lại lớp (PENDING_APPROVAL → RECRUITING) kèm lý do. */
export async function rejectClass(classId: string, reason: string): Promise<WfResult> {
  const gate = await requireApprover(classId);
  if (!gate.ok) return gate;
  if (gate.cls.status !== "PENDING_APPROVAL") {
    return { ok: false, error: "Lớp không ở trạng thái chờ duyệt" };
  }
  const trimmed = reason.trim();
  if (trimmed.length < 5) return { ok: false, error: "Nhập lý do trả lại (≥5 ký tự)" };
  const stamp = new Date().toLocaleDateString("vi-VN");
  await db.class.update({
    where: { id: classId },
    data: {
      status: "RECRUITING",
      submittedForApprovalAt: null,
      notes: `[Trả lại ${stamp}] ${trimmed}`,
    },
  });
  revalidatePath("/classes");
  revalidatePath(`/classes/${classId}/edit`);
  revalidatePath("/dashboard");
  return { ok: true };
}
