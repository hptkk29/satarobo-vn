"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma, EnrollmentStatus } from "@prisma/client";
import { hasAnyRole, type Action } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { centerIdForOrgUnit, orgUnitIdForCenter } from "@/lib/org/org-service";
import { rejectHeadOffice } from "@/lib/enrollment-flow";
import { classCreateSchema } from "@/lib/validators/class";
import { teacherCenterAssignmentError } from "@/lib/teachers/center-filter";
import {
  logClassAudit,
  detectChangedFields,
  getAuditActor,
} from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/audit-log";
import { canTransition } from "@/lib/enrollments/status";
import { genClassCode } from "@/lib/codegen";
import { computeSessionDates, expandHolidaySet } from "@/lib/classes/schedule";
import { resolveClassSlots, applySlotTimeToDate } from "@/lib/classes/slots";
import { suggestClassEndDate } from "@/lib/classes/end-date";
import { generateClassSessions } from "@/lib/classes/generate";
import { detectBatchConflicts } from "@/lib/lms/schedule-conflict";
import { courseHasActiveCurriculum } from "@/lib/courses/activation-guard";
import { createSessionPlansForClass } from "@/lib/classes/snapshot";
import { generateAssignmentsFromTemplates } from "@/lib/lms/assignment";
import { publishEvent } from "@/lib/events/publish";
import { createRefundRequest } from "@/lib/finance/refund";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { passesScope, scopedDb } from "@/lib/db-scope";
import { formatDateVN } from "@/lib/format/date";

type ActionResult = { error?: string };

// Cách ly cơ sở (chống IDOR ghi): Class ∈ SCOPED_MODELS. Mutation theo classId từ
// client phải xác minh lớp thuộc tầm nhìn cơ sở của actor trước khi ghi.
// GHI đối xứng với ĐỌC (vá 24/07): scope per-model qua passesScope — role HO chỉ
// cross-center khi CÓ quyền classes:* (Toại TRAINING@HO không còn → hết tạo/chuyển
// lớp CS2). Lớp HO (centerId null) đòi scope ALL. KHÔNG dùng cờ isHoLevel trần.
function actorCanUseCenter(actor: Actor, centerId: string | null): boolean {
  return passesScope("Class", { centerId }, actor);
}
/** Lớp `classId` có thuộc tầm nhìn cơ sở actor không (đọc centerId rồi passesScope). */
async function classInScope(actor: Actor, classId: string): Promise<boolean> {
  const sdb = scopedDb(actor);
  const cls = await sdb.class.findUnique({ where: { id: classId }, select: { centerId: true } });
  return !!cls && passesScope("Class", cls, actor);
}
/**
 * R2-RBAC-3 — GV chính/trợ giảng phải thuộc CÙNG cơ sở với lớp (cách ly CS1↔CS2).
 * Guard server-side (defense-in-depth) chống IDOR: lọc client ở form là chưa đủ vì
 * client có thể POST thẳng teacherId của cơ sở khác. Lớp HO/không cơ sở (centerId
 * null) → không ràng buộc. Backfill User.centerId GV = 100% (R2-RBAC-1) nên GV null
 * center = không hợp lệ cho lớp có cơ sở. Trả message lỗi hoặc null nếu OK.
 */
async function assertTeachersInCenter(
  sdb: ReturnType<typeof scopedDb>,
  centerId: string | null,
  teacherId?: string | null,
  assistantId?: string | null,
): Promise<string | null> {
  if (!centerId) return null;
  const ids = [teacherId, assistantId].filter(Boolean) as string[];
  if (!ids.length) return null;
  const users = await sdb.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, centerId: true },
  });
  const byId = new Map(users.map((u) => [u.id, u.centerId]));
  // teacherCenterAssignmentError so từng id với centerId lớp (undefined nếu GV không
  // tồn tại → cũng bị chặn). Logic thuần, test ở lib/teachers/center-filter.test.ts.
  return teacherCenterAssignmentError(
    centerId,
    ids.map((id) => ({ id, centerId: byId.get(id) })),
  );
}

async function requireClassWrite(action: "create" | "update" | "delete") {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const actionMap: Record<typeof action, Action> = {
    create: "classes:create",
    update: "classes:edit",
    delete: "classes:delete",
  };

  if (!(await checkPermission(actionMap[action]))) {
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
  sdb: ReturnType<typeof scopedDb>,
): Promise<{ centerId: string | null; orgUnitId: string | null }> {
  let orgUnitId = data.orgUnitId ?? null;
  let centerId = await centerIdForOrgUnit(orgUnitId);

  if (data.classGroupId) {
    const group = await sdb.classGroup.findUnique({
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

/**
 * BGĐ 31/07 — đọc giờ riêng theo thứ từ form (JSON ở field `scheduleSlots`).
 * Dữ liệu hỏng → [] (lớp dùng giờ chung như trước, không chặn lưu).
 */
function readScheduleSlots(
  formData: FormData,
  scheduleDays: number[],
): { weekday: number; startTime: string; endTime: string | null }[] {
  const raw = formData.get("scheduleSlots");
  if (typeof raw !== "string" || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const allowed = new Set(scheduleDays);
  const seen = new Set<number>();
  const out: { weekday: number; startTime: string; endTime: string | null }[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as { weekday?: unknown; startTime?: unknown; endTime?: unknown };
    const weekday = typeof o.weekday === "number" ? o.weekday : NaN;
    const startTime = typeof o.startTime === "string" ? o.startTime.trim() : "";
    // Chỉ nhận thứ ĐANG học + giờ hợp lệ + không trùng thứ (unique classId+weekday).
    if (!Number.isInteger(weekday) || !allowed.has(weekday) || seen.has(weekday)) continue;
    if (!/^\d{2}:\d{2}$/.test(startTime)) continue;
    const endRaw = typeof o.endTime === "string" ? o.endTime.trim() : "";
    seen.add(weekday);
    out.push({
      weekday,
      startTime,
      endTime: /^\d{2}:\d{2}$/.test(endRaw) ? endRaw : null,
    });
  }
  return out;
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

/**
 * Chủ dự án chốt 04/08: KHÔNG CÓ LỚP HỌC TẠI HỘI SỞ. HO là cơ quan đầu não, không
 * phải địa điểm dạy học — lớp chỉ mở ở CS1/CS2 (và cơ sở mở sau).
 *
 * Chặn ở SERVER chứ không chỉ giấu khỏi dropdown: form có thể bị POST thẳng, và
 * lớp lỡ nằm ở HO thì kéo theo học viên + điểm danh + học phí sai cơ sở.
 * Nhận diện qua cây OrgUnit (type=CENTER), KHÔNG hardcode mã "HO".
 */
async function rejectHeadOfficeCenter(centerId: string | null): Promise<string | null> {
  return rejectHeadOffice("lớp học", { centerId });
}

export async function createClass(formData: FormData): Promise<ActionResult> {
  const session = await requireClassWrite("create");

  const raw = readForm(formData);
  const parsed = classCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const { actorId, actorName } = getAuditActor(session);
  const data = parsed.data;
  // BGĐ 31/07 — giờ riêng theo thứ (chỉ nhận thứ đang học).
  const scheduleSlots = readScheduleSlots(formData, data.scheduleDays);
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  // PR-C: suy ra centerId/orgUnitId (kế thừa nhóm lớp nếu có) để dual-write.
  const { centerId, orgUnitId } = await resolveClassOrg(data, sdb);

  // Cách ly cơ sở: chỉ tạo lớp cho cơ sở trong tầm nhìn actor.
  if (!actorCanUseCenter(actor, centerId)) {
    return { error: "Không có quyền tạo lớp cho cơ sở này" };
  }
  const hoErr = await rejectHeadOfficeCenter(centerId);
  if (hoErr) return { error: hoErr };

  // R2-RBAC-3 — GV/TA phải cùng cơ sở lớp (chống gán chéo CS).
  const teacherCenterErr = await assertTeachersInCenter(
    sdb,
    centerId,
    data.teacherId,
    data.assistantId,
  );
  if (teacherCenterErr) return { error: teacherCenterErr };

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
    (await sdb.curriculum.findFirst({
      where: {
        id: pickedCurriculumId,
        courseId: data.courseId,
        isActive: true,
        status: "ACTIVE",
      },
      select: { id: true, version: true },
    }));
  if (!curriculum) {
    curriculum = await sdb.curriculum.findFirst({
      where: { courseId: data.courseId, isActive: true, status: "ACTIVE" },
      orderBy: { version: "desc" },
      select: { id: true, version: true },
    });
  }
  if (!curriculum) {
    return { error: "Khoá học chưa có giáo trình ACTIVE — không thể tạo lớp." };
  }

  // T3.3 — bỏ trống "Ngày bế giảng" → gợi ý = ngày buổi cuối theo lịch (trừ ngày
  // nghỉ). Nhập tay luôn thắng. Lỗi tính toán KHÔNG chặn tạo lớp.
  const dataWithEndDate = {
    ...data,
    endDate:
      data.endDate ??
      (await suggestClassEndDate({
        centerId,
        startDate: data.startDate,
        scheduleDays: data.scheduleDays,
        courseId: data.courseId,
        curriculumId: curriculum.id,
      }).catch(() => null)),
  };

  let createdId = "";
  try {
    await sdb.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Prisma.TransactionClient;
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
          ...toCreateData(dataWithEndDate, classCode, centerId, orgUnitId),
          curriculumId: curriculum.id,
          curriculumVersion: curriculum.version,
          // BGĐ 31/07 — giờ riêng theo thứ (rỗng → lớp dùng giờ chung như trước).
          ...(scheduleSlots.length > 0
            ? { scheduleSlots: { create: scheduleSlots } }
            : {}),
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

  // R2-LMS-4 — sau khi có ClassSessionPlan (khung CT đã pin) → tự sinh bài tập DRAFT
  // từ AssignmentTemplate gắn các buổi (clone câu hỏi). Best-effort + idempotent;
  // lỗi KHÔNG chặn happy path tạo lớp (lớp đã tạo ở transaction trên).
  try {
    await generateAssignmentsFromTemplates({ classId: createdId });
  } catch (err) {
    console.error("[createClass] generateAssignmentsFromTemplates error:", err);
  }

  revalidatePath("/classes");
  // Thành công → trả {} để client toast + điều hướng (QA 20/07 Vấn đề 4 — không
  // redirect server-side âm thầm nữa).
  return {};
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

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const before = await sdb.class.findUnique({
    where: { id },
    select: CLASS_SNAPSHOT_SELECT,
  });
  if (!before) return { error: "Không tìm thấy lớp" };

  // QA 21/07 (B4) — KHÔNG cho đổi cờ sang CANCELLED qua update trần: hủy lớp phải
  // đi qua cancelClassAction (rút ghi danh + hủy buổi tương lai + hoàn tiền).
  // Đổi cờ trần để lại HS "Đang học" + buổi "Sắp tới" trong lớp đã Huỷ.
  if (parsed.data.status === "CANCELLED" && before.status !== "CANCELLED") {
    return {
      error:
        'Không đổi trạng thái "Huỷ" trực tiếp — dùng nút "Hủy lớp" (có rút ghi danh, hủy buổi và hoàn tiền).',
    };
  }

  const { actorId, actorName } = getAuditActor(session);

  // PR-C: suy ra centerId/orgUnitId (kế thừa nhóm lớp nếu có) để dual-write.
  const { centerId, orgUnitId } = await resolveClassOrg(parsed.data, sdb);

  // Cách ly cơ sở: lớp HIỆN TẠI + cơ sở ĐÍCH (nếu đổi) đều phải trong tầm nhìn actor.
  if (!passesScope("Class", { centerId: before.centerId }, actor)) {
    return { error: "Không tìm thấy lớp" };
  }
  if (!actorCanUseCenter(actor, centerId)) {
    return { error: "Không có quyền chuyển lớp sang cơ sở này" };
  }
  // Không chuyển lớp về Hội sở (cùng luật với lúc tạo — xem rejectHeadOfficeCenter).
  const hoErrUpd = await rejectHeadOfficeCenter(centerId);
  if (hoErrUpd) return { error: hoErrUpd };

  // R2-RBAC-3 — GV/TA phải cùng cơ sở lớp (chống gán chéo CS).
  const teacherCenterErr = await assertTeachersInCenter(
    sdb,
    centerId,
    parsed.data.teacherId,
    parsed.data.assistantId,
  );
  if (teacherCenterErr) return { error: teacherCenterErr };

  // T3.3 — như createClass: bỏ trống bế giảng thì tự tính lại từ lịch hiện tại.
  // ⚠️ Class ∈ SCOPED_MODELS: findUnique lọc hậu kỳ theo record.centerId → select
  // PHẢI kèm centerId (thiếu → trả null cho lớp actor VẪN xem được).
  const current = await sdb.class.findUnique({
    where: { id },
    select: { centerId: true, curriculumId: true },
  });
  const dataWithEndDate = {
    ...parsed.data,
    endDate:
      parsed.data.endDate ??
      (await suggestClassEndDate({
        centerId,
        startDate: parsed.data.startDate,
        scheduleDays: parsed.data.scheduleDays,
        courseId: parsed.data.courseId,
        curriculumId: current?.curriculumId ?? null,
      }).catch(() => null)),
  };

  // BGĐ 31/07 — giờ riêng theo thứ (chỉ nhận thứ đang học sau khi sửa lịch).
  const scheduleSlots = readScheduleSlots(formData, parsed.data.scheduleDays);

  try {
    await sdb.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Prisma.TransactionClient;
      const updated = await tx.class.update({
        where: { id },
        data: toUpdateData(dataWithEndDate, centerId, orgUnitId),
        select: CLASS_SNAPSHOT_SELECT,
      });

      // Thay TOÀN BỘ slot theo form: bỏ hết rồi ghi lại (rỗng = quay về giờ chung).
      await tx.classScheduleSlot.deleteMany({ where: { classId: id } });
      if (scheduleSlots.length > 0) {
        await tx.classScheduleSlot.createMany({
          data: scheduleSlots.map((s) => ({ classId: id, ...s })),
        });
      }

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
  return {};
}

export async function deleteClass(id: string): Promise<ActionResult> {
  const session = await requireClassWrite("delete");
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const before = await sdb.class.findUnique({
    where: { id },
    select: CLASS_SNAPSHOT_SELECT,
  });
  if (!before) return { error: "Không thể xoá lớp này" };

  // Cách ly cơ sở: chỉ xoá lớp trong tầm nhìn actor (chống IDOR).
  if (!passesScope("Class", { centerId: before.centerId }, actor)) {
    return { error: "Không thể xoá lớp này" };
  }

  const { actorId, actorName } = getAuditActor(session);

  try {
    await sdb.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Prisma.TransactionClient;
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
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const cls = await sdb.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: { status: true, centerId: true, _count: { select: { enrollments: true } } },
  });
  if (!cls) return { ok: false, error: "Lớp không tồn tại" };

  // Cách ly cơ sở: chỉ gửi duyệt lớp trong tầm nhìn actor (chống IDOR).
  if (!passesScope("Class", { centerId: cls.centerId }, actor)) {
    return { ok: false, error: "Lớp không tồn tại" };
  }

  if (cls.status !== "PLANNED" && cls.status !== "RECRUITING") {
    return { ok: false, error: `Lớp đang ${cls.status}, không thể gửi duyệt` };
  }
  if (cls._count.enrollments === 0) {
    return { ok: false, error: "Lớp chưa có học sinh nào — gán HS trước khi gửi duyệt" };
  }
  await sdb.class.update({
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
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const cls = await sdb.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: { status: true, centerId: true },
  });
  if (!cls) return { ok: false as const, error: "Lớp không tồn tại" };
  // CENTER_MANAGER (không kèm SUPER_ADMIN) chỉ duyệt cơ sở mình.
  const isSuper = hasAnyRole(session.user, ["SUPER_ADMIN"]);
  if (!isSuper && cls.centerId !== session.user.centerId) {
    return { ok: false as const, error: "Lớp không thuộc cơ sở của bạn" };
  }
  return { ok: true as const, session, cls, sdb };
}

/** Quản lý duyệt lớp (PENDING_APPROVAL → ACTIVE). */
export async function approveClass(classId: string): Promise<WfResult> {
  const gate = await requireApprover(classId);
  if (!gate.ok) return gate;
  if (gate.cls.status !== "PENDING_APPROVAL") {
    return { ok: false, error: "Lớp không ở trạng thái chờ duyệt" };
  }
  await gate.sdb.class.update({
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
export async function generateSessionsAction(
  classId: string,
): Promise<WfResult & { generated?: number; warning?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("classes:edit"))) return { ok: false, error: "Không có quyền" };
  // Cách ly cơ sở: chỉ sinh buổi cho lớp trong tầm nhìn actor (chống IDOR).
  const actor = await resolveActor(session.user.id);
  if (!(await classInScope(actor, classId))) return { ok: false, error: "Lớp không tồn tại" };
  const res = await generateClassSessions(classId, { onlyIfEmpty: true });
  if (!res.ok) return { ok: false, error: res.error ?? "Không sinh được buổi học" };
  revalidatePath(`/classes/${classId}/edit`);
  revalidatePath("/sessions");
  // T4.1/T4.2 — báo cáo trùng lô: generateClassSessions CHỈ cảnh báo (không chặn),
  // trước đây warning bị nuốt ở action nên người dùng không hề biết.
  return { ok: true, generated: res.generated, ...(res.warning ? { warning: res.warning } : {}) };
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
  const stamp = formatDateVN(new Date());
  await gate.sdb.class.update({
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

async function computeFutureReschedule(classId: string, actor: Actor) {
  const sdb = scopedDb(actor);
  const cls = await sdb.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: {
      id: true,
      centerId: true,
      scheduleDays: true,
      startTime: true,
      startDate: true,
      // T4.1 — cần GV/phòng/giờ kết thúc để soát trùng cho lô ngày mới.
      endTime: true,
      teacherId: true,
      roomId: true,
      // BGĐ 31/07 — giờ riêng theo thứ (lớp 2 ca khác giờ).
      scheduleSlots: { select: { weekday: true, startTime: true, endTime: true } },
    },
  });
  if (!cls) return { ok: false as const, error: "Lớp không tồn tại" };

  // Lịch hiệu lực: slot riêng theo thứ (nếu có), lùi về scheduleDays + giờ chung.
  const slots = resolveClassSlots({
    scheduleDays: cls.scheduleDays,
    startTime: cls.startTime,
    endTime: cls.endTime,
    slots: cls.scheduleSlots,
  });
  const scheduleDays = slots.map((s) => s.weekday);
  if (scheduleDays.length === 0) {
    return { ok: false as const, error: "Lớp chưa có lịch (scheduleDays) để dời buổi" };
  }

  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const future = await sdb.classSession.findMany({
    // R7-06 AC6: chỉ dời buổi SCHEDULED tương lai — KHÔNG đụng buổi đã COMPLETED/
    // đang IN_PROGRESS hay đã CANCELLED (giữ tổng buổi + không hồi sinh buổi huỷ).
    where: { classId, date: { gt: todayEnd }, status: { notIn: ["COMPLETED", "CANCELLED", "IN_PROGRESS"] } },
    orderBy: { date: "asc" },
    select: { id: true, date: true, topic: true },
  });
  if (future.length === 0) return { ok: false as const, error: "Không có buổi tương lai để dời" };

  const holidayRows = await sdb.holiday.findMany({
    where: { OR: [{ centerId: cls.centerId }, { centerId: null }] },
    select: { date: true, endDate: true },
  });
  const holidays = expandHolidaySet(holidayRows);

  // QA 21/07 — không dời buổi về TRƯỚC ngày khai giảng: mốc quét = max(ngày mai,
  // startDate của lớp). Trước đây lớp khai giảng 28/07 đổi lịch là buổi đầu bị
  // kéo về ngay ngày mai (22/07).
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const startDay = cls.startDate
    ? new Date(cls.startDate.getFullYear(), cls.startDate.getMonth(), cls.startDate.getDate())
    : tomorrow;
  const from = startDay > tomorrow ? startDay : tomorrow;
  const newDates = computeSessionDates({
    from,
    scheduleDays,
    count: future.length,
    holidays,
  });

  // BGĐ 31/07 — giờ buổi lấy theo ĐÚNG THỨ của ngày mới (lớp 2 ca khác giờ).
  const items = future.map((s, i) => {
    const d = newDates[i] ?? new Date(s.date);
    const nd = applySlotTimeToDate(d, slots);
    return { id: s.id, topic: s.topic, oldDate: s.date, newDate: nd };
  });

  // T4.1 — soát trùng PHÒNG/GV cho lô ngày MỚI trước khi dời cả lớp (trước đây
  // applyClassReschedule update date thẳng → double-book âm thầm). Loại chính các
  // buổi đang được dời khỏi phép so (chúng đang nhận ngày mới).
  // BGĐ 31/07 — soát theo TỪNG NHÓM THỨ với giờ của chính thứ đó (lớp 2 ca khác giờ).
  const conflicts: { date: Date; messages: string[] }[] = [];
  for (const slot of slots) {
    if (!slot.startTime) continue;
    const dates = items
      .map((it) => it.newDate)
      .filter((d) => d.getDay() === slot.weekday);
    if (dates.length === 0) continue;
    const found = await detectBatchConflicts({
      centerId: null, // toàn hệ thống: GV có thể dạy 2 cơ sở
      excludeClassId: classId,
      excludeSessionIds: items.map((it) => it.id),
      classStartTime: slot.startTime,
      classEndTime: slot.endTime,
      teacherId: cls.teacherId,
      roomId: cls.roomId,
      dates,
    }).catch(() => []);
    conflicts.push(...found);
  }
  conflicts.sort((a, b) => a.date.getTime() - b.date.getTime());

  return { ok: true as const, items, conflicts };
}

/** Xem trước dời buổi tương lai (không lưu) — kèm cảnh báo trùng phòng/GV (T4.1). */
export async function previewClassReschedule(classId: string): Promise<
  | {
      ok: true;
      items: { id: string; topic: string | null; oldDate: string; newDate: string }[];
      conflicts: { date: string; messages: string[] }[];
    }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("classes:edit"))) return { ok: false, error: "Không có quyền" };
  const actor = await resolveActor(session.user.id);
  const res = await computeFutureReschedule(classId, actor);
  if (!res.ok) return res;
  return {
    ok: true,
    items: res.items.map((it) => ({
      id: it.id,
      topic: it.topic,
      oldDate: it.oldDate.toISOString(),
      newDate: it.newDate.toISOString(),
    })),
    conflicts: res.conflicts.map((c) => ({
      date: c.date.toISOString(),
      messages: c.messages,
    })),
  };
}

/** Áp dụng dời buổi tương lai theo lịch lớp + lịch nghỉ cơ sở. */
export async function applyClassReschedule(classId: string): Promise<WfResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("classes:edit"))) return { ok: false, error: "Không có quyền" };
  // Cách ly cơ sở: chỉ dời buổi cho lớp trong tầm nhìn actor (chống IDOR).
  const actor = await resolveActor(session.user.id);
  if (!(await classInScope(actor, classId))) return { ok: false, error: "Lớp không tồn tại" };
  const sdb = scopedDb(actor);
  const res = await computeFutureReschedule(classId, actor);
  if (!res.ok) return res;

  // T4.1 — CHẶN khi lịch mới đụng phòng/GV của lớp khác (trùng cứng). Cùng chuẩn với
  // adjustSession (đổi 1 buổi cũng chặn) — đừng để dời cả lớp lách qua.
  if (res.conflicts.length > 0) {
    const days = res.conflicts.slice(0, 3).map((c) => formatDateVN(c.date));
    const more =
      res.conflicts.length > days.length ? ` (+${res.conflicts.length - days.length} buổi nữa)` : "";
    return {
      ok: false,
      error: `Không dời được: lịch mới trùng phòng/giáo viên với lớp khác vào ${days.join(", ")}${more}. Đổi phòng/GV hoặc chọn lịch khác rồi thử lại.`,
    };
  }

  // T3.3 — buổi cuối dời thì NGÀY BẾ GIẢNG phải đi theo (items đã sort theo ngày).
  const lastNewDate = res.items[res.items.length - 1]?.newDate ?? null;

  try {
    await sdb.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Prisma.TransactionClient;
      for (const it of res.items) {
        await tx.classSession.update({ where: { id: it.id }, data: { date: it.newDate } });
      }
      if (lastNewDate) {
        await tx.class.update({
          where: { id: classId },
          data: {
            endDate: new Date(
              lastNewDate.getFullYear(),
              lastNewDate.getMonth(),
              lastNewDate.getDate(),
            ),
          },
        });
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

// ─── Module Quản lý lớp PHẦN 3 — HỦY LỚP đúng nghĩa (LMS-10 / W3-2) ───────────

/** Trạng thái enrollment "còn sống" trong 1 lớp — sẽ bị rút về WITHDREW khi hủy lớp. */
const LIVE_ENROLLMENT_STATUSES = [
  "CONFIRMED",
  "STUDYING",
  "ACTIVE",
  "PAUSED",
] as const;

/**
 * LMS-10 / W3-2 — HỦY LỚP đúng nghĩa (khác `deleteClass` chỉ soft-delete và để lại
 * enrollment/buổi học mồ côi). Trong 1 transaction:
 *   a) Class.status = CANCELLED.
 *   b) Mọi enrollment còn sống (CONFIRMED/STUDYING/ACTIVE/PAUSED) → WITHDREW
 *      (transition HỢP LỆ theo state machine `lib/enrollments/status.ts`; guard
 *      `canTransition` để chắc). Ghi `enrollmentAuditLog` + `writeAudit` hợp nhất
 *      cho từng cái. KHÔNG hard-delete (FK RESTRICT).
 *   c) Buổi học tương lai (date >= hôm nay, SCHEDULED/IN_PROGRESS) → CANCELLED.
 *   d) Phát DomainEvent `class.cancelled` → handler thông báo PH/GV (idempotent,
 *      không external call trực tiếp).
 * `reason` BẮT BUỘC (≥5 ký tự).
 */
export async function cancelClassAction(
  classId: string,
  reason: string,
): Promise<WfResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  // Tái dùng quyền `classes:edit` (giống reschedule / generate sessions).
  if (!(await checkPermission("classes:edit"))) {
    return { ok: false, error: "Không có quyền hủy lớp" };
  }

  const trimmedReason = reason.trim();
  if (trimmedReason.length < 5) {
    return { ok: false, error: "Nhập lý do hủy lớp (≥5 ký tự)" };
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const cls = await sdb.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: { id: true, name: true, status: true, centerId: true },
  });
  if (!cls) return { ok: false, error: "Lớp không tồn tại" };

  // Cách ly cơ sở: chỉ hủy lớp trong tầm nhìn actor (chống IDOR cascade liên cơ sở).
  if (!passesScope("Class", { centerId: cls.centerId }, actor)) {
    return { ok: false, error: "Lớp không tồn tại" };
  }

  if (cls.status === "CANCELLED") {
    return { ok: false, error: "Lớp đã ở trạng thái đã hủy" };
  }
  if (cls.status === "COMPLETED") {
    return { ok: false, error: "Lớp đã hoàn thành — không thể hủy" };
  }

  const liveEnrollments = await sdb.enrollment.findMany({
    where: {
      classId,
      deletedAt: null,
      status: { in: [...LIVE_ENROLLMENT_STATUSES] },
    },
    select: { id: true, status: true },
  });

  const { actorId, actorName } = getAuditActor(session);
  const changedByUserId = session.user.id ?? null;
  const changedByName = session.user.name ?? session.user.email ?? session.user.id;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const withdrawReason = `[Hủy lớp] ${trimmedReason}`;

  try {
    await sdb.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Prisma.TransactionClient;
      // a) Lớp → CANCELLED.
      await tx.class.update({
        where: { id: classId },
        data: { status: "CANCELLED" },
      });

      // b) Rút mọi enrollment còn sống về WITHDREW (guard state machine).
      for (const enr of liveEnrollments) {
        // canTransition luôn true với 4 trạng thái LIVE ở trên → WITHDREW; giữ guard
        // cho chắc nếu danh sách LIVE đổi về sau.
        if (!canTransition(enr.status as EnrollmentStatus, "WITHDREW")) continue;

        await tx.enrollment.update({
          where: { id: enr.id },
          data: { status: "WITHDREW", endedAt: now },
        });

        // W3-1 / LMS-9 — hủy lớp → tạo yêu cầu hoàn tiền (PENDING) cho mỗi HS bị rút,
        // TRONG cùng transaction. Idempotent + chỉ tạo khi có khoản đã thu (service lo).
        await createRefundRequest({
          enrollmentId: enr.id,
          trigger: "CLASS_CANCELLED",
          reason: withdrawReason,
          requestedById: actorId,
          actorName,
          tx,
        });

        await tx.enrollmentAuditLog.create({
          data: {
            enrollmentId: enr.id,
            fromStatus: enr.status,
            toStatus: "WITHDREW",
            changedByUserId,
            changedByName,
            reason: withdrawReason,
          },
        });
        // AuditLog hợp nhất cho viewer chung (atomic).
        await writeAudit({
          actor: { id: actorId, name: actorName },
          module: "enrollment",
          entityType: "Enrollment",
          entityId: enr.id,
          action: "STATUS_CHANGE",
          oldValues: { status: enr.status },
          newValues: { status: "WITHDREW" },
          reason: withdrawReason,
          orgUnitId: cls.centerId,
          tx,
        });
      }

      // c) Buổi học tương lai (chưa diễn ra) → CANCELLED. Giữ nguyên buổi đã
      //    COMPLETED/CANCELLED và buổi quá khứ.
      await tx.classSession.updateMany({
        where: {
          classId,
          date: { gte: todayStart },
          status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        },
        data: { status: "CANCELLED" },
      });

      // c2) QA 21/07 (B12) — nhu cầu học bù đang mở của lớp cũng huỷ theo
      //     (không để yêu cầu treo ở /hoc-bu sau khi lớp đã hủy).
      await tx.makeupNeed.updateMany({
        where: { classId, status: { in: ["PENDING", "SCHEDULED"] } },
        data: { status: "CANCELLED" },
      });

      // Audit cho chính lớp (logClassAudit chỉ có CREATE/UPDATE/DELETE → UPDATE).
      await logClassAudit({
        classId,
        action: "UPDATE",
        actorId,
        actorName,
        oldValues: { status: cls.status },
        newValues: { status: "CANCELLED" },
        changedFields: ["status"],
        reason: trimmedReason,
        tx,
      });

      // d) Thông báo PH/GV qua DomainEvent (handler idempotent ở r7-notifications).
      await publishEvent(
        "class.cancelled",
        {
          classId,
          reason: trimmedReason,
          withdrawnCount: liveEnrollments.length,
        },
        { tx },
      );
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi hủy lớp: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidatePath("/classes");
  revalidatePath(`/classes/${classId}/edit`);
  revalidatePath("/enrollments");
  revalidatePath("/sessions");
  revalidatePath("/dashboard");
  return { ok: true };
}
