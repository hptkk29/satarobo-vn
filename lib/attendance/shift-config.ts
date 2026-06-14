// lib/attendance/shift-config.ts — R6-B2: ca làm việc cấu hình DB (per-center giờ/tolerance).
// 2-phase: enum WorkShift giữ; check-in đọc giờ/dung sai từ đây (fallback default trong code).
import { db } from "@/lib/db";

export type ShiftCode = "CA_SANG" | "CA_CHIEU" | "CA_TOI";
export type ShiftSetting = { code: ShiftCode; name: string; startTime: string; endTime: string; toleranceMinutes: number };

/** 3 ca mặc định (khớp enum cũ) — dùng khi DB chưa cấu hình (T12 seed các giá trị này). */
export const DEFAULT_SHIFTS: Record<ShiftCode, ShiftSetting> = {
  CA_SANG: { code: "CA_SANG", name: "Ca sáng", startTime: "08:00", endTime: "11:30", toleranceMinutes: 15 },
  CA_CHIEU: { code: "CA_CHIEU", name: "Ca chiều", startTime: "13:30", endTime: "17:00", toleranceMinutes: 15 },
  CA_TOI: { code: "CA_TOI", name: "Ca tối", startTime: "18:00", endTime: "21:00", toleranceMinutes: 15 },
};

export class ShiftConfigError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ShiftConfigError";
  }
}

/** Cấu hình ca: center override → global (centerId null) → default trong code. */
export async function getShiftConfig(
  code: ShiftCode,
  opts?: { centerId?: string | null },
): Promise<ShiftSetting> {
  const centerId = opts?.centerId ?? null;
  const rows = await db.workShiftConfig.findMany({
    where: { code, isActive: true, OR: [{ centerId }, { centerId: null }] },
  });
  const pick = rows.find((r) => r.centerId === centerId) ?? rows.find((r) => r.centerId === null);
  if (!pick) return DEFAULT_SHIFTS[code];
  return {
    code,
    name: pick.name,
    startTime: pick.startTime,
    endTime: pick.endTime,
    toleranceMinutes: pick.toleranceMinutes,
  };
}

/** CRUD upsert 1 ca (per-center hoặc global khi centerId null). (T1) */
export async function upsertShiftConfig(params: {
  centerId?: string | null;
  code: ShiftCode;
  name: string;
  startTime: string;
  endTime: string;
  toleranceMinutes: number;
}): Promise<{ id: string }> {
  const centerId = params.centerId ?? null;
  // Prisma KHÔNG dùng được null trong compound-unique where (NULL≠NULL) → findFirst rồi
  // create/update thủ công (giống pattern TimelineItem).
  const existing = await db.workShiftConfig.findFirst({
    where: { centerId, code: params.code },
    select: { id: true },
  });
  if (existing) {
    await db.workShiftConfig.update({
      where: { id: existing.id },
      data: {
        name: params.name,
        startTime: params.startTime,
        endTime: params.endTime,
        toleranceMinutes: params.toleranceMinutes,
        isActive: true,
      },
    });
    return existing;
  }
  return db.workShiftConfig.create({ data: { ...params, centerId }, select: { id: true } });
}

/** Xoá ca — T7: ca ĐANG được dùng (có ShiftRegistration chứa code) → chặn. */
export async function deleteShiftConfig(id: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = await db.workShiftConfig.findUnique({ where: { id }, select: { code: true } });
  if (!cfg) return { ok: false, error: "Không tìm thấy ca" };
  const inUse = await db.shiftRegistration.count({
    where: { shifts: { has: cfg.code as "CA_SANG" } },
  });
  if (inUse > 0) return { ok: false, error: "Ca đang được dùng (có đăng ký) — không thể xoá" };
  await db.workShiftConfig.delete({ where: { id } });
  return { ok: true };
}

/** T12 — seed 3 ca mặc định cho 1 cơ sở (hoặc global khi centerId null). Idempotent. */
export async function seedDefaultShifts(centerId: string | null = null): Promise<number> {
  let n = 0;
  for (const s of Object.values(DEFAULT_SHIFTS)) {
    await upsertShiftConfig({ centerId, ...s });
    n += 1;
  }
  return n;
}
