"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import { getAuditActor } from "@/lib/audit/log";
import { db } from "@/lib/db";
import { canAdjustTimesheet, combineVNDateTime } from "@/lib/attendance/adjust";
import { getSetting } from "@/lib/settings/service";

// Module Chấm công PHẦN 4 — yêu cầu chỉnh công (NV gửi) + duyệt/áp chỉnh (quản lý).

type Result = { ok: boolean; error?: string };

// ── NV gửi yêu cầu chỉnh công (không tự sửa) ────────────────────────────────

const requestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ"),
  reason: z.string().trim().min(5, "Nêu lý do chi tiết hơn").max(2000),
  requested: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function createAdjustmentRequest(input: unknown): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "hr_attendance:checkin")) return { ok: false, error: "Không có quyền" };

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const d = parsed.data;

  await db.timesheetAdjustmentRequest.create({
    data: {
      userId: session.user.id,
      centerId: session.user.centerId,
      date: new Date(`${d.date}T00:00:00`),
      reason: d.reason,
      requested: d.requested || null,
      status: "PENDING",
    },
  });

  revalidatePath("/cham-cong/yeu-cau-cong");
  revalidatePath("/cham-cong/chinh-cong");
  return { ok: true };
}

// ── Áp chỉnh sửa bản ghi công (dùng chung) + ghi log ────────────────────────

async function applyCorrection(params: {
  userId: string;
  centerId: string | null;
  dateStr: string;
  checkIn?: string | null;
  checkOut?: string | null;
  reason: string;
  editorId: string | null;
  editorName: string;
  requestId?: string | null;
}): Promise<void> {
  const dayStart = combineVNDateTime(params.dateStr, "00:00")!;
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const dateOnly = new Date(`${params.dateStr}T00:00:00`);

  const existing = await db.employeeCheckin.findMany({
    where: { userId: params.userId, checkedAt: { gte: dayStart, lt: dayEnd } },
    select: { id: true, type: true, checkedAt: true },
  });

  const fields: { type: "CHECK_IN" | "CHECK_OUT"; raw: string | null | undefined }[] = [
    { type: "CHECK_IN", raw: params.checkIn },
    { type: "CHECK_OUT", raw: params.checkOut },
  ];

  for (const f of fields) {
    if (f.raw === undefined) continue; // không đụng tới field này
    const newAt = combineVNDateTime(params.dateStr, f.raw);
    if (!newAt) continue;
    const cur = existing.find((e) => e.type === f.type);
    const fromValue = cur?.checkedAt.toISOString() ?? null;

    if (cur) {
      await db.employeeCheckin.update({ where: { id: cur.id }, data: { checkedAt: newAt } });
    } else {
      await db.employeeCheckin.create({
        data: {
          userId: params.userId,
          centerId: params.centerId,
          type: f.type,
          checkedAt: newAt,
          withinGeofence: true,
          qrToken: `adjust:${params.centerId ?? "x"}:${params.dateStr}:${f.type}`,
        },
      });
    }

    await db.timesheetEditLog.create({
      data: {
        userId: params.userId,
        date: dateOnly,
        field: f.type,
        fromValue,
        toValue: newAt.toISOString(),
        reason: params.reason,
        editedById: params.editorId,
        editedByName: params.editorName,
        requestId: params.requestId ?? null,
      },
    });
  }
}

// ── Quản lý duyệt yêu cầu (áp giờ đúng) hoặc từ chối ─────────────────────────

const reviewSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().trim().max(2000).optional().or(z.literal("")),
  checkIn: z.string().regex(/^\d{1,2}:\d{2}$/).optional().or(z.literal("")),
  checkOut: z.string().regex(/^\d{1,2}:\d{2}$/).optional().or(z.literal("")),
});

export async function reviewAdjustmentRequest(input: unknown): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "hr_attendance:adjust")) return { ok: false, error: "Không có quyền" };

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const p = parsed.data;

  const req = await db.timesheetAdjustmentRequest.findUnique({ where: { id: p.id } });
  if (!req) return { ok: false, error: "Không tìm thấy yêu cầu" };
  if (req.status !== "PENDING") return { ok: false, error: "Yêu cầu đã xử lý" };

  const isSuper = hasRole(session.user, "SUPER_ADMIN");
  const isCM = hasRole(session.user, "CENTER_MANAGER");
  // CM chỉ duyệt yêu cầu thuộc cơ sở mình.
  if (isCM && !isSuper && req.centerId && req.centerId !== session.user.centerId) {
    return { ok: false, error: "Yêu cầu thuộc cơ sở khác" };
  }

  const { actorId, actorName } = getAuditActor(session);
  const dateStr = req.date.toISOString().slice(0, 10);

  if (p.decision === "APPROVED" && (p.checkIn || p.checkOut)) {
    // Áp chỉnh sửa theo quy tắc thời gian.
    const gate = canAdjustTimesheet(
      {
        isSuperAdmin: isSuper,
        isCenterManager: isCM,
        workDate: req.date,
        now: new Date(),
      },
      await getSetting("shift.managerEditWindowDays"),
    );
    if (!gate.ok) return { ok: false, error: gate.reason };

    await applyCorrection({
      userId: req.userId,
      centerId: req.centerId,
      dateStr,
      checkIn: p.checkIn || undefined,
      checkOut: p.checkOut || undefined,
      reason: p.reviewNote || req.reason,
      editorId: actorId,
      editorName: actorName,
      requestId: req.id,
    });
  }

  await db.timesheetAdjustmentRequest.update({
    where: { id: req.id },
    data: {
      status: p.decision,
      reviewNote: p.reviewNote || null,
      reviewedById: actorId,
      reviewedByName: actorName,
      reviewedAt: new Date(),
    },
  });

  revalidatePath("/cham-cong/chinh-cong");
  revalidatePath("/cham-cong/yeu-cau-cong");
  revalidatePath("/cham-cong");
  return { ok: true };
}

// ── Quản lý chỉnh trực tiếp bản ghi công (từ bảng tổng hợp — PHẦN 5) ─────────

const directSchema = z.object({
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(3, "Nêu lý do").max(2000),
  checkIn: z.string().regex(/^\d{1,2}:\d{2}$/).optional().or(z.literal("")),
  checkOut: z.string().regex(/^\d{1,2}:\d{2}$/).optional().or(z.literal("")),
});

export async function adjustTimesheetDirect(input: unknown): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "hr_attendance:adjust")) return { ok: false, error: "Không có quyền" };

  const parsed = directSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const p = parsed.data;
  if (!p.checkIn && !p.checkOut) return { ok: false, error: "Nhập ít nhất 1 giờ vào/ra" };

  const target = await db.user.findUnique({ where: { id: p.userId }, select: { centerId: true } });
  if (!target) return { ok: false, error: "Nhân viên không tồn tại" };

  const isSuper = hasRole(session.user, "SUPER_ADMIN");
  const isCM = hasRole(session.user, "CENTER_MANAGER");
  if (isCM && !isSuper && target.centerId !== session.user.centerId) {
    return { ok: false, error: "Nhân viên thuộc cơ sở khác" };
  }

  const gate = canAdjustTimesheet(
    {
      isSuperAdmin: isSuper,
      isCenterManager: isCM,
      workDate: new Date(`${p.date}T00:00:00`),
      now: new Date(),
    },
    await getSetting("shift.managerEditWindowDays"),
  );
  if (!gate.ok) return { ok: false, error: gate.reason };

  const { actorId, actorName } = getAuditActor(session);
  await applyCorrection({
    userId: p.userId,
    centerId: target.centerId,
    dateStr: p.date,
    checkIn: p.checkIn || undefined,
    checkOut: p.checkOut || undefined,
    reason: p.reason,
    editorId: actorId,
    editorName: actorName,
  });

  revalidatePath("/cham-cong");
  revalidatePath("/cham-cong/lich-ca-nhan-vien");
  return { ok: true };
}
