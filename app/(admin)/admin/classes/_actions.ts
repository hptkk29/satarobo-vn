"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { can, hasAnyRole, type Action } from "@/lib/auth/permissions";
import { centerIdForOrgUnit, orgUnitIdForCenter } from "@/lib/org/org-service";
import { classCreateSchema } from "@/lib/validators/class";
import {
  logClassAudit,
  detectChangedFields,
  getAuditActor,
} from "@/lib/audit/log";
import { genClassCode } from "@/lib/codegen";
import { computeSessionDates, expandHolidaySet } from "@/lib/classes/schedule";
import { generateClassSessions } from "@/lib/classes/generate";
import { courseHasActiveCurriculum } from "@/lib/courses/activation-guard";
import { createSessionPlansForClass } from "@/lib/classes/snapshot";
import { publishEvent } from "@/lib/events/publish";

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
  centerId: string | null,
  orgUnitId: string | null,
): Prisma.ClassCreateInput {
  const {
    courseId,
    centerId: _ignoredCenter,
    orgUnitId: _ignoredOrg,
    classGroupId,
    roomId,
    teacherId,
    assistantId,
    classCode: _ignoredCode,
    ...rest
  } = parsed;
  void _ignoredCode;
  void _ignoredCenter;
  void _ignoredOrg;

  return {
    ...rest,
    classCode,
    // PR-C dual-write: orgUnitId nguồn chính, centerId suy ra (HO→null).
    orgUnitId,
    course: { connect: { id: courseId } },
    ...(centerId ? { center: { connect: { id: centerId } } } : {}),
    ...(classGroupId ? { classGroup: { connect: { id: classGroupId } } } : {}),
    ...(roomId ? { room: { connect: { id: roomId } } } : {}),
    ...(teacherId ? { teacher: { connect: { id: teacherId } } } : {}),
    ...(assistantId ? { assistant: { connect: { id: assistantId } } } : {}),
  };
}

function toUpdateData(
  parsed: ReturnType<typeof classCreateSchema.parse>,
  centerId: string | null,
  orgUnitId: string | null,
): Prisma.ClassUpdateInput {
  const {
    courseId,
    centerId: _ignoredCenter,
    orgUnitId: _ignoredOrg,
    classGroupId,
    roomId,
    teacherId,
    assistantId,
    ...rest
  } = parsed;
  void _ignoredCenter;
  void _ignoredOrg;

  return {
    ...rest,
    // PR-C dual-write: orgUnitId nguồn chính, centerId suy ra (HO→null).
    orgUnitId,
    course: { connect: { id: courseId } },
    center: centerId ? { connect: { id: centerId } } : { disconnect: true },
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

/**
 * PR-C: từ input form (orgUnitId là picker) suy ra { centerId, orgUnitId } để dual-write.
 * Nếu gán nhóm lớp → kế thừa đơn vị (center + org) của nhóm (Phase T0.2).
 */
async function resolveClassOrg(
  data: ReturnType<typeof classCreateSchema.parse>,
): Promise<{ centerId: string | null; orgUnitId: string | null }> {
  let orgUnitId = data.orgUnitId ?? null;
  let centerId = await centerIdForOrgUnit(orgUnitId);

  if (data.classGroupId) {
    const group = await db.classGroup.findUnique({
      where: { id: data.classGroupId },
      select: { centerId: true, orgUnitId: true },
    });
    if (group) {
      centerId = group.centerId;
      orgUnitId = group.orgUnitId ?? (await orgUnitIdForCenter(group.centerId));
    }
  }
  return { centerId, orgUnitId };
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
    orgUnitId: s("orgUnitId"),
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

  // PR-C: suy ra centerId/orgUnitId (kế thừa nhóm lớp nếu có) để dual-write.
  const { centerId, orgUnitId } = await resolveClassOrg(data);

  // R7-06 — CHẶN tạo/kích hoạt lớp khi khoá chưa có giáo trình ACTIVE.
  if (!(await courseHasActiveCurriculum(data.courseId))) {
    return {
      error:
        "Khoá học chưa có giáo trình đang áp dụng (ACTIVE) — không thể tạo lớp. Hãy kích hoạt giáo trình trước.",
    };
  }

  // R7-06 — chốt (pin) curriculum version lúc tạo. Lấy version người dùng chọn
  // nếu hợp lệ, mặc định = version ACTIVE mới nhất của khoá.
  const pickedCurriculumIdRaw = formData.get("curriculumId");
  const pickedCurriculumId =
    typeof pickedCurriculumIdRaw === "string" && pickedCurriculumIdRaw.trim()
      ? pickedCurriculumIdRaw.trim()
      : null;

  let curriculum =
    pickedCurriculumId &&
    (await db.curriculum.findFirst({
      where: {
        id: pickedCurriculumId,
        courseId: data.courseId,
        isActive: true,
        status: "ACTIVE",
      },
      select: { id: true, version: true },
    }));
  if (!curriculum) {
    curriculum = await db.curriculum.findFirst({
      where: { courseId: data.courseId, isActive: true, status: "ACTIVE" },
      orderBy: { version: "desc" },
      select: { id: true, version: true },
    });
  }
  if (!curriculum) {
    return { error: "Khoá học chưa có giáo trình ACTIVE — không thể tạo lớp." };
  }

  let createdId = "";
  try {
    await db.$transaction(async (tx) => {
      // Phase T0.2 — tự sinh classCode nếu admin để trống (giữ mã cũ nếu có).
      // HO (centerId=null) không tự sinh mã — admin nhập tay nếu cần.
      let classCode = data.classCode;
      if (!classCode && centerId) {
        const [center, course] = await Promise.all([
          tx.center.findUnique({
            where: { id: centerId },
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
        data: {
          ...toCreateData(data, classCode),
          curriculumId: curriculum.id,
          curriculumVersion: curriculum.version,
        },
        select: { id: true, ...CLASS_SNAPSHOT_SELECT },
      });
      createdId = created.id;

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

  // R7-06 — sinh kế hoạch buổi (ClassSessionPlan) từ giáo trình đã chốt.
  // Best-effort: lỗi không chặn happy path (lớp đã tạo).
  try {
    await createSessionPlansForClass({
      classId: createdId,
      curriculumId: curriculum.id,
      version: curriculum.version,
    });
  } catch (err) {
    console.error("[createClass] createSessionPlansForClass error:", err);
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

  // PR-C: suy ra centerId/orgUnitId (kế thừa nhóm lớp nếu có) để dual-write.
  const { centerId, orgUnitId } = await resolveClassOrg(parsed.data);

  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.class.update({
        where: { id },
        data: toUpdateData(parsed.data, centerId, orgUnitId),
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

  // P2 — duyệt lớp ACTIVE → TỰ SINH buổi học (nếu chưa có). Best-effort.
  try {
    await generateClassSessions(classId, { onlyIfEmpty: true });
  } catch (err) {
    console.error("[approveClass] generate sessions error:", err);
  }

  revalidatePath("/classes");
  revalidatePath(`/classes/${classId}/edit`);
  revalidatePath("/sessions");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** P2 — nút sinh buổi học thủ công cho 1 lớp (khi cần sinh lại / lớp cũ chưa có buổi). */
export async function generateSessionsAction(classId: string): Promise<WfResult & { generated?: number }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "classes:edit")) return { ok: false, error: "Không có quyền" };
  const res = await generateClassSessions(classId, { onlyIfEmpty: true });
  if (!res.ok) return { ok: false, error: res.error ?? "Không sinh được buổi học" };
  revalidatePath(`/classes/${classId}/edit`);
  revalidatePath("/sessions");
  return { ok: true, generated: res.generated };
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

// ─── Module Quản lý lớp PHẦN 2 — dời buổi tương lai theo lịch mới ────────────

async function computeFutureReschedule(classId: string) {
  const cls = await db.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: { id: true, centerId: true, scheduleDays: true, startTime: true },
  });
  if (!cls) return { ok: false as const, error: "Lớp không tồn tại" };
  if (cls.scheduleDays.length === 0) {
    return { ok: false as const, error: "Lớp chưa có lịch (scheduleDays) để dời buổi" };
  }

  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const future = await db.classSession.findMany({
    // R7-06 AC6: chỉ dời buổi SCHEDULED tương lai — KHÔNG đụng buổi đã COMPLETED/
    // đang IN_PROGRESS hay đã CANCELLED (giữ tổng buổi + không hồi sinh buổi huỷ).
    where: { classId, date: { gt: todayEnd }, status: { notIn: ["COMPLETED", "CANCELLED", "IN_PROGRESS"] } },
    orderBy: { date: "asc" },
    select: { id: true, date: true, topic: true },
  });
  if (future.length === 0) return { ok: false as const, error: "Không có buổi tương lai để dời" };

  const holidayRows = await db.holiday.findMany({
    where: { OR: [{ centerId: cls.centerId }, { centerId: null }] },
    select: { date: true, endDate: true },
  });
  const holidays = expandHolidaySet(holidayRows);

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const newDates = computeSessionDates({
    from: tomorrow,
    scheduleDays: cls.scheduleDays,
    count: future.length,
    holidays,
  });

  // Giờ buổi = startTime của lớp (nếu có), giữ ngày mới.
  const [hh, mm] = (cls.startTime ?? "00:00").split(":").map((x) => parseInt(x, 10));
  const items = future.map((s, i) => {
    const d = newDates[i] ?? new Date(s.date);
    const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh || 0, mm || 0);
    return { id: s.id, topic: s.topic, oldDate: s.date, newDate: nd };
  });
  return { ok: true as const, items };
}

/** Xem trước dời buổi tương lai (không lưu). */
export async function previewClassReschedule(classId: string): Promise<
  | { ok: true; items: { id: string; topic: string | null; oldDate: string; newDate: string }[] }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "classes:edit")) return { ok: false, error: "Không có quyền" };
  const res = await computeFutureReschedule(classId);
  if (!res.ok) return res;
  return {
    ok: true,
    items: res.items.map((it) => ({
      id: it.id,
      topic: it.topic,
      oldDate: it.oldDate.toISOString(),
      newDate: it.newDate.toISOString(),
    })),
  };
}

/** Áp dụng dời buổi tương lai theo lịch lớp + lịch nghỉ cơ sở. */
export async function applyClassReschedule(classId: string): Promise<WfResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "classes:edit")) return { ok: false, error: "Không có quyền" };
  const res = await computeFutureReschedule(classId);
  if (!res.ok) return res;

  try {
    await db.$transaction(async (tx) => {
      for (const it of res.items) {
        await tx.classSession.update({ where: { id: it.id }, data: { date: it.newDate } });
      }
      // R7-06 AC6 — phát event để PH/GV được thông báo (handler ở R7-17).
      await publishEvent(
        "class.session_changed",
        { classId, change: "RESCHEDULED", count: res.items.length },
        { tx },
      );
    });
  } catch (err) {
    return { ok: false, error: `Lỗi dời buổi: ${err instanceof Error ? err.message : "Unknown"}` };
  }
  revalidatePath(`/classes/${classId}/edit`);
  revalidatePath("/sessions");
  return { ok: true };
}
