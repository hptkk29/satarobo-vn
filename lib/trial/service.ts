// lib/trial/service.ts — R7-02: service layer cho LỚP TRẢI NGHIỆM V2 (N buổi).
//
// Sinh buổi theo lịch TUẦN (mỗi 7 ngày) từ startDate, né Holiday (dời buổi +7).
// Ghi danh 1 con / 1 lớp ACTIVE (partial-unique ở DB) — bắt P2002 thành lỗi VI.
// Khi buổi CUỐI hoàn tất → con có điểm danh = ATTENDED; lead đủ con xong = TRIAL_ATTENDED
// (qua publishEvent idempotent + cập nhật trực tiếp). KHÔNG tự nhảy AWAITING_DECISION (AC6).
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { nextSeq, yy } from "@/lib/codegen";
import { publishEvent } from "@/lib/events/publish";
import { writeAudit } from "@/lib/audit/audit-log";

// ─── PURE helpers (deterministic — KHÔNG new Date() ở top) ─────────────────────

/** "YYYY-MM-DD" theo local (so khớp Holiday). */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Ngày của N buổi trải nghiệm: TUẦN (mỗi 7 ngày) kể từ `startDate`, BỎ QUA ngày
 * rơi vào Holiday — buổi đó DỜI tới tuần kế (+7). Deterministic.
 */
export function buildTrialSessionDates(startDate: Date, count: number, holidays: Date[]): Date[] {
  const out: Date[] = [];
  if (count <= 0) return out;
  const holiSet = new Set(holidays.map(ymd));
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const maxIter = count + holidays.length + 400; // chặn vòng lặp vô hạn
  let i = 0;
  while (out.length < count && i < maxIter) {
    i++;
    if (!holiSet.has(ymd(cur))) {
      out.push(new Date(cur));
    }
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

/** Quyết định vượt sĩ số (PURE): tại/quá sức chứa + KHÔNG override. */
export function isOverCapacity(activeCount: number, capacity: number, allowOverride: boolean): boolean {
  return !allowOverride && activeCount >= capacity;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

type DbClient = Prisma.TransactionClient | typeof db;

/** Mã cơ sở cho code lớp: Center.code (vd "CS1") → fallback sanitize id. */
function sanitizeCenter(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "CS";
}

/** Mở rộng các khoảng Holiday (date..endDate) thành Date[] (1 phần tử / ngày). */
function expandHolidayDates(rows: { date: Date; endDate: Date | null }[]): Date[] {
  const out: Date[] = [];
  for (const h of rows) {
    const start = new Date(h.date.getFullYear(), h.date.getMonth(), h.date.getDate());
    const end = h.endDate
      ? new Date(h.endDate.getFullYear(), h.endDate.getMonth(), h.endDate.getDate())
      : start;
    const cur = new Date(start);
    let guard = 0;
    while (cur <= end && guard < 400) {
      guard++;
      out.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }
  return out;
}

async function actorName(actorId: string | null | undefined, client: DbClient = db): Promise<string> {
  if (!actorId) return "system";
  const u = await client.user.findUnique({ where: { id: actorId }, select: { name: true } });
  return u?.name ?? actorId;
}

// ─── Config ────────────────────────────────────────────────────────────────────

/** Cấu hình lớp trải nghiệm đang ÁP DỤNG (active). */
export async function getActiveTrialConfig(): Promise<{ id: string; sessionCount: number } | null> {
  const cfg = await db.trialProgramConfig.findFirst({
    where: { active: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true, sessionCount: true },
  });
  return cfg;
}

/** Tạo/cập nhật + kích hoạt cấu hình (deactivate các config khác) + audit. */
export async function setTrialProgramConfig(params: {
  name: string;
  sessionCount: number;
  actorId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const name = params.name?.trim();
  if (!name) return { ok: false, error: "Tên cấu hình là bắt buộc" };
  if (!Number.isInteger(params.sessionCount) || params.sessionCount < 1) {
    return { ok: false, error: "Số buổi phải là số nguyên ≥ 1" };
  }

  try {
    const aName = await actorName(params.actorId);
    await db.$transaction(async (tx) => {
      const existing = await tx.trialProgramConfig.findFirst({ where: { name } });
      // tắt mọi config khác (chỉ 1 active tại 1 thời điểm)
      await tx.trialProgramConfig.updateMany({
        where: existing ? { id: { not: existing.id } } : {},
        data: { active: false },
      });
      const saved = existing
        ? await tx.trialProgramConfig.update({
            where: { id: existing.id },
            data: { sessionCount: params.sessionCount, active: true, updatedById: params.actorId },
          })
        : await tx.trialProgramConfig.create({
            data: { name, sessionCount: params.sessionCount, active: true, updatedById: params.actorId },
          });
      await writeAudit({
        actor: { id: params.actorId, name: aName },
        module: "trial",
        entityType: "TrialProgramConfig",
        entityId: saved.id,
        action: existing ? "UPDATE" : "CREATE",
        oldValues: existing ? { sessionCount: existing.sessionCount, active: existing.active } : null,
        newValues: { name, sessionCount: params.sessionCount, active: true },
        tx,
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi lưu cấu hình" };
  }
}

// ─── Lớp ─────────────────────────────────────────────────────────────────────

export async function createTrialClass(params: {
  name: string;
  centerId: string;
  roomId?: string | null;
  // FL-R2 (QĐ-R2-1): slot tái sử dụng — startDate tuỳ chọn (null = không gắn ngày cố định).
  startDate?: Date | null;
  startTime: string;
  endTime: string;
  capacity: number;
  teacherId?: string | null;
  // Số buổi nhập trực tiếp khi tạo (không phụ thuộc TrialProgramConfig ngoài).
  sessionCount: number;
  configId?: string | null;
  actorId: string;
}): Promise<{ ok: boolean; error?: string; trialClassId?: string }> {
  if (!params.name?.trim()) return { ok: false, error: "Tên lớp là bắt buộc" };
  if (!Number.isInteger(params.capacity) || params.capacity < 1) {
    return { ok: false, error: "Sĩ số phải là số nguyên ≥ 1" };
  }
  if (!Number.isInteger(params.sessionCount) || params.sessionCount < 1) {
    return { ok: false, error: "Số buổi phải là số nguyên ≥ 1" };
  }

  try {
    const sessionCount = params.sessionCount;
    const trialClassId = await db.$transaction(async (tx) => {
      // mã cơ sở cho code.
      const center = await tx.center.findUnique({
        where: { id: params.centerId },
        select: { code: true },
      });
      const cc = sanitizeCenter(center?.code ?? params.centerId);
      const y = yy();
      const seq = await nextSeq(`TRIAL:${cc}:${y}`, tx);
      const code = `TRIAL-${cc}-${y}-${String(seq).padStart(3, "0")}`;

      const trialClass = await tx.trialClassV2.create({
        data: {
          code,
          name: params.name.trim(),
          centerId: params.centerId,
          roomId: params.roomId ?? null,
          startDate: params.startDate ?? null,
          startTime: params.startTime,
          endTime: params.endTime,
          capacity: params.capacity,
          teacherId: params.teacherId ?? null,
          configId: params.configId ?? null,
          sessionCount,
        },
        select: { id: true },
      });

      // FL-R2 (QĐ-R2-1): slot tái sử dụng — KHÔNG auto-gen buổi cohort. Chỉ sinh buổi theo
      // lịch khi CÓ ngày bắt đầu cố định (giữ tương thích đường gọi cũ/lớp có lịch).
      if (params.startDate) {
        const holidayRows = await tx.holiday.findMany({
          where: { OR: [{ centerId: params.centerId }, { centerId: null }] },
          select: { date: true, endDate: true },
        });
        const holidays = expandHolidayDates(holidayRows);
        const dates = buildTrialSessionDates(params.startDate, sessionCount, holidays);
        if (dates.length > 0) {
          await tx.trialClassSession.createMany({
            data: dates.map((d, idx) => ({
              trialClassId: trialClass.id,
              seq: idx + 1,
              date: d,
              startTime: params.startTime,
              endTime: params.endTime,
              roomId: params.roomId ?? null,
              teacherId: params.teacherId ?? null,
            })),
          });
        }
      }
      return trialClass.id;
    });
    return { ok: true, trialClassId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi tạo lớp trải nghiệm" };
  }
}

// ─── Ghi danh ─────────────────────────────────────────────────────────────────

export async function enrollLeadChild(params: {
  trialClassId: string;
  leadChildId: string;
  addedById: string;
  allowOverride?: boolean;
}): Promise<{ ok: boolean; error?: string; overCapacity?: boolean }> {
  const allowOverride = params.allowOverride ?? false;
  try {
    return await db.$transaction(async (tx) => {
      const cls = await tx.trialClassV2.findUnique({
        where: { id: params.trialClassId },
        select: { id: true, capacity: true },
      });
      if (!cls) return { ok: false, error: "Lớp trải nghiệm không tồn tại" };

      const activeCount = await tx.trialEnrollment.count({
        where: { trialClassId: params.trialClassId, status: "ACTIVE" },
      });
      if (isOverCapacity(activeCount, cls.capacity, allowOverride)) {
        return { ok: false, overCapacity: true, error: "Vượt sĩ số" };
      }

      const enrollment = await tx.trialEnrollment.create({
        data: {
          trialClassId: params.trialClassId,
          leadChildId: params.leadChildId,
          addedById: params.addedById,
        },
      });
      await tx.leadChild.update({
        where: { id: params.leadChildId },
        data: { trialStatus: "SCHEDULED" },
      });
      // R7-17 — báo Sale phụ trách lead đã xếp lớp trải nghiệm (atomic cùng tx).
      await publishEvent(
        "trial.assigned",
        {
          trialEnrollmentId: enrollment.id,
          leadChildId: params.leadChildId,
          trialClassId: params.trialClassId,
        },
        { tx, dedupeKey: `trial.assigned:${enrollment.id}` },
      );
      // AC4 — ghi audit khi override sĩ số (xếp vượt capacity bằng quyền override).
      if (allowOverride && activeCount >= cls.capacity) {
        await writeAudit({
          actor: { id: params.addedById, name: await actorName(params.addedById, tx) },
          module: "trial",
          entityType: "TrialEnrollment",
          entityId: enrollment.id,
          action: "CREATE",
          newValues: { override: true, capacity: cls.capacity, activeCount, trialClassId: params.trialClassId, leadChildId: params.leadChildId },
          tx,
        });
      }
      return { ok: true };
    });
  } catch (e) {
    // Partial-unique: con đang ACTIVE ở lớp khác (AC3).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Học viên đang ở lớp trải nghiệm khác" };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi ghi danh" };
  }
}

/**
 * Huỷ lớp trải nghiệm: status=CANCELLED + mọi TrialEnrollment ACTIVE → WITHDRAWN
 * (giải phóng partial-unique 1 lớp ACTIVE/con). Audit. (§6 edge case.)
 */
export async function cancelTrialClass(params: {
  trialClassId: string;
  actorId: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    return await db.$transaction(async (tx) => {
      const cls = await tx.trialClassV2.findUnique({
        where: { id: params.trialClassId },
        select: { id: true, status: true },
      });
      if (!cls) return { ok: false, error: "Lớp trải nghiệm không tồn tại" };
      if (cls.status === "CANCELLED") return { ok: true };
      await tx.trialClassV2.update({
        where: { id: params.trialClassId },
        data: { status: "CANCELLED" },
      });
      const freed = await tx.trialEnrollment.updateMany({
        where: { trialClassId: params.trialClassId, status: "ACTIVE" },
        data: { status: "WITHDRAWN" },
      });
      await writeAudit({
        actor: { id: params.actorId, name: await actorName(params.actorId, tx) },
        module: "trial",
        entityType: "TrialClassV2",
        entityId: params.trialClassId,
        action: "STATUS_CHANGE",
        oldValues: { status: cls.status },
        newValues: { status: "CANCELLED", withdrawnEnrollments: freed.count },
        tx,
      });
      return { ok: true };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi huỷ lớp" };
  }
}

// ─── Điểm danh ──────────────────────────────────────────────────────────────────

export async function markAttendance(params: {
  trialSessionId: string;
  trialEnrollmentId: string;
  status: "PRESENT" | "ABSENT";
  note?: string | null;
  actorId: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await db.trialAttendance.upsert({
      where: {
        trialSessionId_trialEnrollmentId: {
          trialSessionId: params.trialSessionId,
          trialEnrollmentId: params.trialEnrollmentId,
        },
      },
      create: {
        trialSessionId: params.trialSessionId,
        trialEnrollmentId: params.trialEnrollmentId,
        status: params.status,
        note: params.note ?? null,
      },
      update: {
        status: params.status,
        note: params.note ?? null,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi điểm danh" };
  }
}

// ─── Hoàn tất buổi ────────────────────────────────────────────────────────────

export async function completeTrialSession(params: {
  trialSessionId: string;
  actorId: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    return await db.$transaction(async (tx) => {
      const session = await tx.trialClassSession.findUnique({
        where: { id: params.trialSessionId },
        select: { id: true, seq: true, trialClassId: true },
      });
      if (!session) return { ok: false, error: "Buổi học không tồn tại" };

      await tx.trialClassSession.update({
        where: { id: session.id },
        data: { status: "COMPLETED" },
      });

      // có phải buổi CUỐI (max seq) không?
      const agg = await tx.trialClassSession.aggregate({
        where: { trialClassId: session.trialClassId },
        _max: { seq: true },
      });
      const isLast = session.seq === agg._max.seq;
      if (!isLast) return { ok: true };

      // con có điểm danh → ATTENDED + enrollment COMPLETED.
      const enrollments = await tx.trialEnrollment.findMany({
        where: { trialClassId: session.trialClassId, status: "ACTIVE" },
        select: {
          id: true,
          leadChildId: true,
          leadChild: { select: { leadId: true } },
          _count: { select: { attendances: true } },
        },
      });
      const affectedLeadIds = new Set<string>();
      for (const e of enrollments) {
        if (e._count.attendances > 0) {
          await tx.trialEnrollment.update({ where: { id: e.id }, data: { status: "COMPLETED" } });
          await tx.leadChild.update({ where: { id: e.leadChildId }, data: { trialStatus: "ATTENDED" } });
          affectedLeadIds.add(e.leadChild.leadId);
        }
      }

      // lead có TẤT CẢ con ATTENDED → TRIAL_ATTENDED (KHÔNG AWAITING_DECISION — AC6).
      for (const leadId of affectedLeadIds) {
        const remaining = await tx.leadChild.count({
          where: { leadId, trialStatus: { not: "ATTENDED" } },
        });
        if (remaining > 0) continue;
        const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { status: true } });
        if (lead && lead.status !== "TRIAL_ATTENDED") {
          await tx.lead.update({ where: { id: leadId }, data: { status: "TRIAL_ATTENDED" } });
        }
        await publishEvent(
          "lead.trialAttended",
          { leadId },
          { tx, dedupeKey: `lead.trialAttended:${leadId}` },
        );
      }
      return { ok: true };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi hoàn tất buổi học" };
  }
}
