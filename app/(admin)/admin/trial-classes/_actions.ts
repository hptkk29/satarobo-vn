"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";
// CONTRACT (R7-02) — lib/trial/service.ts do agent song song tạo; import theo tên.
// Typecheck gộp cuối sẽ resolve. Mỗi action chỉ "inspect {ok}" + revalidate.
import {
  getActiveTrialConfig,
  setTrialProgramConfig,
  createTrialClass,
  enrollLeadChild,
  markAttendance,
  completeTrialSession,
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

/** Actor có được phép thao tác trên cơ sở `centerId` không (cách ly cơ sở). */
function actorCanUseCenter(actor: Actor, centerId: string): boolean {
  return actor.isSuperAdmin || actor.isHoLevel || actor.visibleCenterIds.includes(centerId);
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

/** Cấu hình số buổi lớp trải nghiệm — gate `training:manage`. */
export async function saveTrialConfigAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "training:manage")) {
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
    startDate: z.string().trim().min(1, "Chọn ngày bắt đầu"),
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
  })
  .refine(
    (d) => {
      // AC9 — chặn ngày quá khứ (so theo ngày, bỏ qua giờ).
      const start = new Date(`${d.startDate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return !Number.isNaN(start.getTime()) && start >= today;
    },
    { message: "Ngày bắt đầu không được ở quá khứ", path: ["startDate"] },
  );

/** Tạo lớp trải nghiệm — gate `trials:manage` + cách ly cơ sở. */
export async function createTrialClassAction(input: unknown): Promise<ActionResult<{ id?: string }>> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "trials:manage")) {
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

  // configId bắt buộc cho service — fallback cấu hình active nếu UI để trống.
  let configId = data.configId ?? null;
  if (!configId) {
    const active = await getActiveTrialConfig();
    if (!active) {
      return {
        ok: false,
        error: "Chưa có cấu hình số buổi. Vào mục Cấu hình số buổi trước khi tạo lớp.",
      };
    }
    configId = active.id;
  }

  const res = await createTrialClass({
    centerId: data.centerId,
    name: data.name,
    configId,
    roomId: data.roomId ?? null,
    teacherId: data.teacherId ?? null,
    startDate: new Date(`${data.startDate}T00:00:00`),
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
}): Promise<ActionResult> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "trials:manage")) {
    return { ok: false, error: "Không có quyền xếp chỗ học trải nghiệm" };
  }

  const allowOverride = input.allowOverride === true;
  if (allowOverride && !can(session.user, "trials:override-capacity")) {
    return { ok: false, error: "Không có quyền vượt sĩ số" };
  }
  if (!input.trialClassId || !input.leadChildId) {
    return { ok: false, error: "Thiếu lớp hoặc học viên" };
  }

  const actor = await resolveActor(session.user.id);
  const cls = await loadScopedTrialClass(actor, input.trialClassId);
  if (!cls) return { ok: false, error: "Không tìm thấy lớp trải nghiệm" };

  const res = await enrollLeadChild({
    trialClassId: input.trialClassId,
    leadChildId: input.leadChildId,
    allowOverride,
    addedById: session.user.id,
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

// ───────────────────────── 4) gán giáo viên ────────────────────────

/** Gán GV cho lớp — gate `trials:assign-teacher` + cách ly cơ sở. */
export async function assignTrialTeacherAction(
  trialClassId: string,
  teacherId: string | null,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "trials:assign-teacher")) {
    return { ok: false, error: "Không có quyền gán giáo viên" };
  }

  const actor = await resolveActor(session.user.id);
  const cls = await loadScopedTrialClass(actor, trialClassId);
  if (!cls) return { ok: false, error: "Không tìm thấy lớp trải nghiệm" };

  // Không có service fn riêng cho gán GV → cập nhật trực tiếp qua scopedDb.
  const sdb = scopedDb(actor);
  await sdb.trialClassV2.update({
    where: { id: trialClassId },
    data: { teacherId: teacherId || null },
  });

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
  if (!can(session.user, "trials:feedback")) {
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
  const isManager = can(session.user, "trials:manage");
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
  if (!can(session.user, "trials:feedback")) {
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
  const isManager = can(session.user, "trials:manage");
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
