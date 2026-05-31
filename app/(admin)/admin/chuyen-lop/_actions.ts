"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { logStudentAudit, getAuditActor } from "@/lib/audit/log";
import {
  findEligibleTargetClasses,
  createTransferRequest,
  approveTransfer,
  rejectTransfer,
} from "@/lib/transfer/service";

// C1 — chuyển lớp/cơ sở. Gate enrollments:transfer (SUPER_ADMIN/CENTER_MANAGER).

const createSchema = z.object({
  studentId: z.string().min(1),
  fromClassId: z.string().min(1),
  toClassId: z.string().optional().or(z.literal("")),
  toCenterId: z.string().optional().or(z.literal("")),
  reason: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function listEligibleClassesAction(input: {
  studentId: string;
  fromClassId: string;
  toCenterId?: string;
}): Promise<{ ok: boolean; error?: string; studentCovered?: number; classes?: unknown[] }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "enrollments:transfer")) return { ok: false, error: "Không có quyền" };
  return findEligibleTargetClasses(input.studentId, input.fromClassId, input.toCenterId || null);
}

export async function createTransferRequestAction(input: unknown): Promise<{ ok: boolean; error?: string; waitlisted?: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "enrollments:transfer")) return { ok: false, error: "Không có quyền" };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const d = parsed.data;

  const res = await createTransferRequest({
    studentId: d.studentId,
    fromClassId: d.fromClassId,
    toClassId: d.toClassId || null,
    toCenterId: d.toCenterId || null,
    reason: d.reason || null,
    requestedById: session.user.id,
  });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/chuyen-lop");
  return { ok: true, waitlisted: res.waitlisted };
}

export async function approveTransferAction(requestId: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "enrollments:transfer")) return { ok: false, error: "Không có quyền" };

  const res = await approveTransfer(requestId, session.user.id, note ?? null);
  if (!res.ok) return res;

  const req = await (await import("@/lib/db")).db.studentTransferRequest.findUnique({
    where: { id: requestId },
    select: { studentId: true, toClassId: true, toCenterId: true },
  });
  if (req) {
    const actor = getAuditActor(session);
    await logStudentAudit({
      studentId: req.studentId,
      action: "UPDATE",
      actorId: actor.actorId,
      actorName: actor.actorName,
      changedFields: ["transfer"],
      newValues: { toClassId: req.toClassId, toCenterId: req.toCenterId },
      reason: "Duyệt chuyển lớp/cơ sở",
    });
  }
  revalidatePath("/admin/chuyen-lop");
  return { ok: true };
}

export async function rejectTransferAction(requestId: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "enrollments:transfer")) return { ok: false, error: "Không có quyền" };
  const res = await rejectTransfer(requestId, session.user.id, note ?? null);
  if (res.ok) revalidatePath("/admin/chuyen-lop");
  return res;
}
