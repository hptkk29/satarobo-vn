"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";
import { teacherCenterAssignmentError } from "@/lib/teachers/center-filter";
import { leadStatusLabel } from "@/lib/leads/status";
import { phoneSearchTerm } from "@/lib/phone";
// CONTRACT (R7-02) — lib/trial/service.ts do agent song song tạo; import theo tên.
// Typecheck gộp cuối sẽ resolve. Mỗi action chỉ "inspect {ok}" + revalidate.
import {
  setTrialProgramConfig,
  createTrialClass,
  addTrialSession,
  enrollLeadChild,
  unenrollLeadChild,
  markAttendance,
  completeTrialSession,
  cancelTrialClass,
  notifyTrialTeacherAssigned,
  rescheduleTrialEnrollment,
} from "@/lib/trial/service";

// ───────────────────────────── helpers ─────────────────────────────

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string; overCapacity?: boolean };

async function requireSession() {
  const session = await auth();
  if (!session?.user) return null;
  return session;
}

/** Actor có được phép thao tác trên cơ sở `centerId` không (cách ly cơ sở).
 * GHI đối xứng với ĐỌC (vá 24/07): scope per-model qua passesScope — role HO không
 * có quyền trials:/classes: không được tạo lớp trải nghiệm cơ sở khác. */
function actorCanUseCenter(actor: Actor, centerId: string): boolean {
  return passesScope("TrialClassV2", { centerId }, actor);
}

/** Lấy class V2 trong tầm scope của actor (chống IDOR). Trả null nếu out-of-scope. */
async function loadScopedTrialClass(
  actor: Actor,
  trialClassId: string,
): Promise<{ id: string; centerId: string; teacherId: string | null; status: string } | null> {
  const sdb = scopedDb(actor);
  // findUnique đã tự lọc IDOR (null nếu ngoài scope), kèm passesScope cho chắc.
  const row = await sdb.trialClassV2.findUnique({
    where: { id: trialClassId },
    select: { id: true, centerId: true, teacherId: true, status: true },
  });
  if (!row || !passesScope("TrialClassV2", row, actor)) return null;
  return row;
}

// ───────────────────────── 1) cấu hình số buổi ─────────────────────

const trialConfigSchema = z.object({
  name: z.string().trim().min(1, "Tên cấu hình bắt buộc").max(120),
  sessionCount: z.coerce
    .number()
    .int("Số buổi phải là số nguyên")
    .min(1, "Số buổi phải ≥ 1")
    .max(60, "Số buổi quá lớn"),
});

/** Cấu hình số buổi lớp trải nghiệm — gate `trials:config` (QĐ-T3b: CM giữ qua action riêng, KHÔNG training:manage). */
export async function saveTrialConfigAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("trials:config"))) {
    return { ok: false, error: "Không có quyền cấu hình số buổi" };
  }

  const parsed = trialConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const res = await setTrialProgramConfig({
    name: parsed.data.name,
    sessionCount: parsed.data.sessionCount,
    actorId: session.user.id,
  });
  if (!res?.ok) {
    return { ok: false, error: res?.error ?? "Lưu cấu hình thất bại" };
  }

  revalidatePath("/trial-classes");
  return { ok: true };
}

// ───────────────────────── 2) tạo lớp trải nghiệm ──────────────────

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const createTrialClassSchema = z
  .object({
    name: z.string().trim().min(1, "Tên lớp bắt buộc").max(160),
    centerId: z.string().trim().min(1, "Chọn cơ sở"),
    configId: z.string().trim().min(1).nullable().optional(),
    roomId: z.string().trim().min(1).nullable().optional(),
    teacherId: z.string().trim().min(1).nullable().optional(),
    // FL-R2 (QĐ-R2-1): slot tái sử dụng — số buổi nhập trực tiếp, KHÔNG còn ngày bắt đầu.
    sessionCount: z.coerce
      .number()
      .int("Số buổi phải là số nguyên")
      .min(1, "Số buổi phải ≥ 1")
      .max(20, "Số buổi quá lớn"),
    startTime: z.string().regex(HHMM, "Giờ bắt đầu không hợp lệ"),
    endTime: z.string().regex(HHMM, "Giờ kết thúc không hợp lệ"),
    capacity: z.coerce
      .number()
      .int("Sĩ số phải là số nguyên")
      .min(1, "Sĩ số phải ≥ 1") // AC9 — chặn capacity 0
      .max(100, "Sĩ số quá lớn"),
  })
  .refine((d) => d.endTime > d.startTime, {
    message: "Giờ kết thúc phải sau giờ bắt đầu",
    path: ["endTime"],
  });

/** Tạo lớp trải nghiệm — gate `trials:manage` + cách ly cơ sở. */
export async function createTrialClassAction(input: unknown): Promise<ActionResult<{ id?: string }>> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền tạo lớp trải nghiệm" };
  }

  const parsed = createTrialClassSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const actor = await resolveActor(session.user.id);
  if (!actorCanUseCenter(actor, data.centerId)) {
    return { ok: false, error: "Bạn không có quyền tạo lớp tại cơ sở này" };
  }

  const res = await createTrialClass({
    centerId: data.centerId,
    name: data.name,
    configId: data.configId ?? null,
    roomId: data.roomId ?? null,
    teacherId: data.teacherId ?? null,
    // slot tái sử dụng: không gắn ngày bắt đầu; số buổi nhập trực tiếp.
    startDate: null,
    sessionCount: data.sessionCount,
    startTime: data.startTime,
    endTime: data.endTime,
    capacity: data.capacity,
    actorId: session.user.id,
  });
  if (!res?.ok) {
    return { ok: false, error: res?.error ?? "Tạo lớp thất bại" };
  }

  revalidatePath("/trial-classes");
  return { ok: true, id: res.trialClassId };
}

// ───────────────────────── 2b) thêm buổi cho lớp ───────────────────

const addSessionSchema = z
  .object({
    trialClassId: z.string().trim().min(1, "Thiếu lớp trải nghiệm"),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày buổi học không hợp lệ"),
    startTime: z.string().regex(HHMM, "Giờ bắt đầu không hợp lệ"),
    endTime: z.string().regex(HHMM, "Giờ kết thúc không hợp lệ"),
    // Bỏ trống → mặc định GV phụ trách lớp (service tự fallback).
    teacherId: z.string().trim().min(1).nullable().optional(),
    roomId: z.string().trim().min(1).nullable().optional(),
  })
  .refine((d) => d.endTime > d.startTime, {
    message: "Giờ kết thúc phải sau giờ bắt đầu",
    path: ["endTime"],
  });

/**
 * #1 (BLOCKER) — thêm 1 buổi ad-hoc cho lớp trải nghiệm (QĐ-R2-1 slot tái sử dụng:
 * lớp tạo KHÔNG có ngày → không có buổi → GV không có gì để nhận/điểm danh/đánh giá).
 * Gate `trials:manage` + cách ly cơ sở cho LỚP. GV thì KHÔNG ràng buộc cơ sở nữa
 * (chốt 07/08 — GV là nguồn lực chung); chỉ còn chặn teacherId không tồn tại.
 */
export async function addTrialSessionAction(input: unknown): Promise<ActionResult<{ sessionId?: string }>> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền thêm buổi trải nghiệm" };
  }

  const parsed = addSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const actor = await resolveActor(session.user.id);
  const cls = await loadScopedTrialClass(actor, data.trialClassId);
  if (!cls) return { ok: false, error: "Không tìm thấy lớp trải nghiệm" };

  // @db.Date lưu UTC 00:00 của ngày VN → parse "YYYY-MM-DD" thành mốc UTC midnight.
  const [y, m, d] = data.date.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));

  const res = await addTrialSession({
    trialClassId: data.trialClassId,
    date,
    startTime: data.startTime,
    endTime: data.endTime,
    // undefined = kế thừa GV/phòng của lớp (mặc định theo yêu cầu).
    teacherId: data.teacherId === undefined ? undefined : data.teacherId,
    roomId: data.roomId === undefined ? undefined : data.roomId,
    actorId: session.user.id,
  });
  if (!res?.ok) {
    return { ok: false, error: res?.error ?? "Thêm buổi thất bại" };
  }

  revalidatePath(`/trial-classes/${data.trialClassId}`);
  revalidatePath("/trial-classes");
  return { ok: true, sessionId: res.sessionId };
}

// ───────────────────────── 3) xếp con vào lớp ──────────────────────

/**
 * Ghi danh 1 LeadChild vào lớp — gate `trials:manage`.
 * `allowOverride` (vượt sĩ số) yêu cầu thêm `trials:override-capacity`.
 * Surface `overCapacity` để UI hỏi xác nhận override.
 */
export async function enrollLeadChildAction(input: {
  trialClassId: string;
  leadChildId: string;
  allowOverride?: boolean;
  // FL-R2 (QĐ-R2-W3): số buổi học thử cấu hình RIÊNG cho lead này (bỏ trống → mặc định lớp).
  totalSessions?: number;
  // LD3(b): buổi (ngày/giờ) cụ thể được chọn khi xếp (tuỳ chọn). Validate thuộc lớp.
  sessionId?: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền xếp chỗ học trải nghiệm" };
  }

  const allowOverride = input.allowOverride === true;
  if (allowOverride && !(await checkPermission("trials:override-capacity"))) {
    return { ok: false, error: "Không có quyền vượt sĩ số" };
  }
  if (!input.trialClassId || !input.leadChildId) {
    return { ok: false, error: "Thiếu lớp hoặc học viên" };
  }
  // số buổi per-lead (nếu nhập): nguyên 1..60.
  let totalSessions: number | undefined;
  if (input.totalSessions != null) {
    const n = Number(input.totalSessions);
    if (!Number.isInteger(n) || n < 1 || n > 60) {
      return { ok: false, error: "Số buổi học thử phải là số nguyên từ 1 đến 60" };
    }
    totalSessions = n;
  }

  const actor = await resolveActor(session.user.id);
  const cls = await loadScopedTrialClass(actor, input.trialClassId);
  if (!cls) return { ok: false, error: "Không tìm thấy lớp trải nghiệm" };

  // LD3(b) — nếu chọn buổi cụ thể: phải thuộc đúng lớp đang xếp (chống chọn buổi lớp khác).
  if (input.sessionId) {
    const ses = await scopedDb(actor).trialClassSession.findUnique({
      where: { id: input.sessionId },
      select: { trialClassId: true },
    });
    if (!ses || ses.trialClassId !== input.trialClassId) {
      return { ok: false, error: "Buổi học không thuộc lớp đã chọn" };
    }
  }

  // #2 — sessionId truyền thẳng vào service: set scheduledSessionId NGAY khi tạo;
  // bỏ trống → service auto-gán buổi SCHEDULED gần nhất (lớp chưa có buổi → lỗi rõ).
  const res = await enrollLeadChild({
    trialClassId: input.trialClassId,
    leadChildId: input.leadChildId,
    allowOverride,
    addedById: session.user.id,
    totalSessions,
    sessionId: input.sessionId ?? null,
  });
  if (!res?.ok) {
    // Surface cờ overCapacity để UI mời QL bấm override.
    return {
      ok: false,
      error: res?.error ?? "Xếp chỗ thất bại",
      overCapacity: res?.overCapacity === true,
    };
  }

  revalidatePath(`/trial-classes/${input.trialClassId}`);
  revalidatePath("/trial-classes");
  return { ok: true };
}

/**
 * FL-R2 (item 4/8) — tìm học viên (LeadChild) để gán vào lớp trải nghiệm.
 * Cùng cơ sở lớp; loại lead đã rời pipeline (ENROLLED/LOST/DUPLICATE/REGISTERED) + con đang
 * ở 1 lớp ACTIVE khác. Gate `trials:manage` + cách ly cơ sở (scopedDb).
 */
export async function searchTrialCandidatesAction(input: {
  trialClassId: string;
  query: string;
}): Promise<
  ActionResult<{
    candidates: {
      leadChildId: string;
      childName: string;
      parentName: string | null;
      phone: string | null;
      leadStatus: string;
    }[];
  }>
> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền tìm học viên" };
  }

  const actor = await resolveActor(session.user.id);
  const cls = await loadScopedTrialClass(actor, input.trialClassId);
  if (!cls) return { ok: false, error: "Không tìm thấy lớp trải nghiệm" };

  const q = (input.query ?? "").trim();
  // SĐT lưu 2 dạng (0… cũ / 84… mới) — tìm theo phần lõi để không sót.
  const qPhone = phoneSearchTerm(q) ?? q;
  const sdb = scopedDb(actor);
  // con CHƯA ở lớp ACTIVE nào (giải phóng partial-unique 1 lớp ACTIVE/con).
  const childFree = { trialEnrollments: { none: { status: "ACTIVE" as const } } };
  const leads = await sdb.lead.findMany({
    where: {
      centerId: cls.centerId,
      status: { notIn: ["ENROLLED", "LOST", "DUPLICATE", "REGISTERED"] },
      children: { some: childFree },
      ...(q
        ? {
            OR: [
              { parentName: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: qPhone } },
              { children: { some: { fullName: { contains: q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      parentName: true,
      phone: true,
      status: true,
      children: { where: childFree, select: { id: true, fullName: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  const candidates = leads.flatMap((l) =>
    l.children.map((c) => ({
      leadChildId: c.id,
      childName: c.fullName,
      parentName: l.parentName,
      phone: l.phone,
      leadStatus: leadStatusLabel(l.status),
    })),
  );
  return { ok: true, candidates };
}

/**
 * FL-R2 (item 4) — gỡ học viên khỏi lớp trải nghiệm (soft-withdraw, giữ lịch sử).
 * Gate `trials:manage` + cách ly cơ sở.
 */
export async function unenrollLeadChildAction(input: {
  trialClassId: string;
  leadChildId: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền gỡ học viên" };
  }
  if (!input.trialClassId || !input.leadChildId) {
    return { ok: false, error: "Thiếu lớp hoặc học viên" };
  }

  const actor = await resolveActor(session.user.id);
  const cls = await loadScopedTrialClass(actor, input.trialClassId);
  if (!cls) return { ok: false, error: "Không tìm thấy lớp trải nghiệm" };

  const res = await unenrollLeadChild({
    trialClassId: input.trialClassId,
    leadChildId: input.leadChildId,
    actorId: session.user.id,
  });
  if (!res.ok) return { ok: false, error: res.error ?? "Gỡ học viên thất bại" };

  revalidatePath(`/trial-classes/${input.trialClassId}`);
  revalidatePath("/trial-classes");
  return { ok: true };
}

// ─────────────────── 3b) dời lịch học viên trải nghiệm ──────────────────

const rescheduleSchema = z.object({
  enrollmentId: z.string().min(1, "Thiếu ghi danh"),
  toSessionId: z.string().min(1, "Chưa chọn buổi mới"),
  // Bắt buộc nêu lý do: dời lịch là ngoại lệ vận hành, Sale phụ trách và QLCS phải đọc
  // được vì sao ở AuditLog. Cùng luật với "gia hạn nộp bài" bên e-learning.
  reason: z.string().trim().min(3, "Nhập lý do dời lịch (tối thiểu 3 ký tự)").max(500),
});

/** Dời 1 học viên trải nghiệm sang buổi khác CÙNG LỚP — gate `trials:manage` + cách ly cơ sở. */
export async function rescheduleTrialEnrollmentAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền dời lịch học thử" };
  }

  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  // Cách ly cơ sở: đi qua LỚP của ghi danh, không tin enrollmentId từ client (chống IDOR
  // — cùng cách các action khác trong file này dùng loadScopedTrialClass).
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const enr = await sdb.trialEnrollment.findUnique({
    where: { id: parsed.data.enrollmentId },
    select: { trialClassId: true },
  });
  if (!enr) return { ok: false, error: "Không tìm thấy ghi danh trải nghiệm" };
  const cls = await loadScopedTrialClass(actor, enr.trialClassId);
  if (!cls) return { ok: false, error: "Không tìm thấy lớp trải nghiệm" };

  const res = await rescheduleTrialEnrollment({
    enrollmentId: parsed.data.enrollmentId,
    toSessionId: parsed.data.toSessionId,
    reason: parsed.data.reason,
    actorId: session.user.id,
  });
  if (!res.ok) return { ok: false, error: res.error ?? "Dời lịch thất bại" };

  revalidatePath(`/trial-classes/${enr.trialClassId}`);
  revalidatePath("/trial-classes");
  // Bảng Trial của site GV đọc cùng dữ liệu này.
  revalidatePath("/teacher/trial");
  return { ok: true };
}

// ───────────────────────── 4) gán giáo viên ────────────────────────

/** Gán GV cho lớp — gate `trials:assign-teacher` + cách ly cơ sở. */
export async function assignTrialTeacherAction(
  trialClassId: string,
  teacherId: string | null,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("trials:assign-teacher"))) {
    return { ok: false, error: "Không có quyền gán giáo viên" };
  }

  const actor = await resolveActor(session.user.id);
  const cls = await loadScopedTrialClass(actor, trialClassId);
  if (!cls) return { ok: false, error: "Không tìm thấy lớp trải nghiệm" };

  // Không có service fn riêng cho gán GV → cập nhật trực tiếp qua scopedDb.
  const sdb = scopedDb(actor);

  // R2-RBAC-3 — GV gán phải CÙNG cơ sở lớp trải nghiệm (cách ly CS; chống gán chéo
  // qua POST thẳng). User pass-through scopedDb (không center-scoped).
  if (teacherId) {
    const t = await sdb.user.findUnique({ where: { id: teacherId }, select: { centerId: true } });
    const err = teacherCenterAssignmentError(cls.centerId, [{ id: teacherId, centerId: t?.centerId }]);
    if (err) return { ok: false, error: err };
  }

  await sdb.trialClassV2.update({
    where: { id: trialClassId },
    data: { teacherId: teacherId || null },
  });
  // GAP-1: propagate GV xuống các buổi CHƯA diễn ra (SCHEDULED) — buổi xong giữ nguyên.
  await sdb.trialClassSession.updateMany({
    where: { trialClassId, status: "SCHEDULED" },
    data: { teacherId: teacherId || null },
  });

  // #6 — báo GV mới được gán lớp (trước đây gán xong GV không hề hay biết).
  // Không báo khi: bỏ gán, gán lại chính GV cũ, hoặc tự gán mình.
  if (teacherId && teacherId !== cls.teacherId && teacherId !== session.user.id) {
    const clsName = await sdb.trialClassV2.findUnique({
      where: { id: trialClassId },
      select: { name: true },
    });
    await notifyTrialTeacherAssigned({
      teacherId,
      title: "Bạn được phân công lớp trải nghiệm",
      body: `Bạn vừa được gán phụ trách lớp trải nghiệm ${clsName?.name ?? ""}. Xem lịch & học viên ở mục Trial.`,
      dedupeKey: `trial-class.assigned:${trialClassId}`,
      entityId: trialClassId,
    });
  }

  revalidatePath(`/trial-classes/${trialClassId}`);
  revalidatePath("/trial-classes");
  return { ok: true };
}

// ───────────────────────── 4b) huỷ lớp ─────────────────────────────

/** Huỷ lớp trải nghiệm — gate `trials:manage` + scope. Giải phóng ghi danh ACTIVE. */
export async function cancelTrialClassAction(trialClassId: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền huỷ lớp" };
  }
  const actor = await resolveActor(session.user.id);
  const cls = await loadScopedTrialClass(actor, trialClassId);
  if (!cls) return { ok: false, error: "Không tìm thấy lớp trải nghiệm" };

  const res = await cancelTrialClass({ trialClassId, actorId: session.user.id });
  if (!res.ok) return { ok: false, error: res.error ?? "Huỷ lớp thất bại" };

  revalidatePath(`/trial-classes/${trialClassId}`);
  revalidatePath("/trial-classes");
  return { ok: true };
}

// ───────────────────────── 5) điểm danh buổi ───────────────────────

const attendanceSchema = z.object({
  trialSessionId: z.string().trim().min(1, "Thiếu buổi học"),
  records: z
    .array(
      z.object({
        trialEnrollmentId: z.string().trim().min(1),
        status: z.enum(["PRESENT", "ABSENT"]),
        note: z.string().trim().max(2000).nullable().optional(),
      }),
    )
    .min(1, "Chưa có học viên để điểm danh"),
});

/**
 * Điểm danh buổi trải nghiệm — gate `trials:feedback`.
 * GV (không có `trials:manage`) CHỈ điểm danh lớp được phân công cho mình.
 */
export async function markTrialAttendanceAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("trials:feedback"))) {
    return { ok: false, error: "Không có quyền điểm danh" };
  }

  const parsed = attendanceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const actor = await resolveActor(session.user.id);
  // Buổi học không phải model scoped → load kèm class để check scope + GV.
  const sdb = scopedDb(actor);
  const ses = await sdb.trialClassSession.findUnique({
    where: { id: parsed.data.trialSessionId },
    select: {
      id: true,
      trialClassId: true,
      trialClass: { select: { centerId: true, teacherId: true } },
    },
  });
  if (!ses || !passesScope("TrialClassV2", ses.trialClass, actor)) {
    return { ok: false, error: "Không tìm thấy buổi học" };
  }
  // GV thuần (không quyền quản lý) chỉ điểm danh lớp của mình.
  const isManager = (await checkPermission("trials:manage", { centerId: ses.trialClass.centerId }));
  if (!isManager && hasRole(session.user, "TEACHER") && ses.trialClass.teacherId !== session.user.id) {
    return { ok: false, error: "Bạn chỉ được điểm danh lớp được phân công" };
  }

  // service.markAttendance ghi 1 bản ghi / lần → lặp theo từng học viên.
  for (const r of parsed.data.records) {
    const res = await markAttendance({
      trialSessionId: parsed.data.trialSessionId,
      trialEnrollmentId: r.trialEnrollmentId,
      status: r.status,
      note: r.note ?? null,
      actorId: session.user.id,
    });
    if (!res?.ok) {
      return { ok: false, error: res?.error ?? "Điểm danh thất bại" };
    }
  }

  revalidatePath(`/trial-classes/${ses.trialClassId}`);
  return { ok: true };
}

// ───────────────────────── 6) hoàn tất buổi ────────────────────────

/**
 * Hoàn tất 1 buổi trải nghiệm — gate `trials:feedback`.
 * GV thuần chỉ hoàn tất lớp của mình.
 */
export async function completeTrialSessionAction(
  trialSessionId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("trials:feedback"))) {
    return { ok: false, error: "Không có quyền hoàn tất buổi" };
  }
  if (!trialSessionId) return { ok: false, error: "Thiếu buổi học" };

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const ses = await sdb.trialClassSession.findUnique({
    where: { id: trialSessionId },
    select: {
      id: true,
      trialClassId: true,
      trialClass: { select: { centerId: true, teacherId: true } },
    },
  });
  if (!ses || !passesScope("TrialClassV2", ses.trialClass, actor)) {
    return { ok: false, error: "Không tìm thấy buổi học" };
  }
  const isManager = (await checkPermission("trials:manage", { centerId: ses.trialClass.centerId }));
  if (!isManager && hasRole(session.user, "TEACHER") && ses.trialClass.teacherId !== session.user.id) {
    return { ok: false, error: "Bạn chỉ được thao tác lớp được phân công" };
  }

  const res = await completeTrialSession({
    trialSessionId,
    actorId: session.user.id,
  });
  if (!res?.ok) {
    return { ok: false, error: res?.error ?? "Hoàn tất buổi thất bại" };
  }

  revalidatePath(`/trial-classes/${ses.trialClassId}`);
  return { ok: true };
}
