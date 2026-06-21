"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { publishEvent } from "@/lib/events/publish";
import { getAuditActor } from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/audit-log";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";
import {
  trialUpdateSchema,
  trialFeedbackSchema,
} from "@/lib/validators/trial";
import type { LeadStatus, TrialClassStatus } from "@prisma/client";

// Cách ly cơ sở (chống IDOR ghi): TrialClass (V1) ∈ SCOPED_MODELS → đọc qua scopedDb
// (auto null-filter) + passesScope trước khi update/delete/upsert.

// =============================================================================
// TRIAL CLASS ACTIONS — Phase T1.4
// Xếp lịch / cập nhật buổi học thử + nhập nhận xét sau buổi.
// =============================================================================

// Status học thử → đồng bộ status Lead (chỉ "tiến" chứ không "lùi").
const TRIAL_TO_LEAD: Partial<Record<TrialClassStatus, LeadStatus>> = {
  ATTENDED: "TRIAL_ATTENDED",
  REJECTED: "LOST",
};

export async function updateTrialAction(
  trialId: string,
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "trials:manage")) {
    return { ok: false, error: "Không có quyền xếp lịch học thử" };
  }

  const parsed = trialUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const trial = await sdb.trialClass.findUnique({
    where: { id: trialId },
    select: { id: true, leadId: true, status: true, scheduledAt: true, centerId: true },
  });
  if (!trial || !passesScope("TrialClass", trial, actor)) {
    return { ok: false, error: "Buổi học thử không tồn tại" };
  }

  const { actorId, actorName } = getAuditActor(session);
  const becameAttended =
    parsed.data.status === "ATTENDED" && trial.status !== "ATTENDED";
  const leadNextStatus = TRIAL_TO_LEAD[parsed.data.status];

  const newAt = new Date(parsed.data.scheduledAt);
  const scheduleChanged = trial.scheduledAt?.getTime() !== newAt.getTime();

  await db.$transaction(async (tx) => {
    await tx.trialClass.update({
      where: { id: trialId },
      data: {
        scheduledAt: newAt,
        status: parsed.data.status,
        teacherId: parsed.data.teacherId,
        roomId: parsed.data.roomId,
        classId: parsed.data.classId,
        notes: parsed.data.notes,
        ...(becameAttended && { attendedAt: new Date() }),
      },
    });

    // Đổi giờ học thử → báo Sale phụ trách (R7-17). dedupeKey kèm giờ mới:
    // reschedule thật re-fires, retry cùng thay đổi thì không.
    if (scheduleChanged) {
      await publishEvent(
        "trial.schedule_changed",
        {
          trialId,
          leadId: trial.leadId,
          fromAt: trial.scheduledAt?.toISOString() ?? null,
          toAt: newAt.toISOString(),
        },
        { tx, dedupeKey: `trial.schedule_changed:${trialId}:${newAt.getTime()}` },
      );
    }

    // Đồng bộ lead status nếu chuyển ATTENDED/REJECTED (không ghi đè nếu đã ENROLLED/xa hơn).
    if (leadNextStatus && parsed.data.status !== trial.status) {
      const lead = await tx.lead.findUnique({
        where: { id: trial.leadId },
        select: { status: true },
      });
      const guarded =
        lead &&
        lead.status !== "ENROLLED" &&
        lead.status !== leadNextStatus;
      if (guarded) {
        await tx.lead.update({
          where: { id: trial.leadId },
          data: { status: leadNextStatus },
        });
        await tx.leadActivity.create({
          data: {
            leadId: trial.leadId,
            actorId,
            actorName,
            type: "STATUS_CHANGE",
            content: `Chuyển trạng thái: ${lead.status} → ${leadNextStatus} (từ buổi học thử)`,
            metadata: { from: lead.status, to: leadNextStatus, via: "trial" },
          },
        });
      }
    }
  });

  revalidatePath("/trials");
  revalidatePath(`/leads/${trial.leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Xoá cứng 1 buổi học thử (TrialFeedback cascade theo).
 * Dùng để dọn dữ liệu test / buổi tạo nhầm. Chỉ user có quyền `trials:manage`.
 * Guard: KHÔNG hard-delete buổi đã phát sinh nghiệp vụ (ATTENDED/ENROLLED hoặc đã có
 * nhận xét) — chỉ cho xoá khi còn ở giai đoạn chưa học. Audit lại thao tác xoá.
 */
export async function deleteTrialAction(
  trialId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "trials:manage")) {
    return { ok: false, error: "Không có quyền xoá buổi học thử" };
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const trial = await sdb.trialClass.findUnique({
    where: { id: trialId },
    select: {
      id: true,
      leadId: true,
      status: true,
      scheduledAt: true,
      centerId: true,
      feedback: { select: { id: true } },
    },
  });
  if (!trial || !passesScope("TrialClass", trial, actor)) {
    return { ok: false, error: "Buổi học thử không tồn tại" };
  }

  // Guard nghiệp vụ: buổi đã có kết quả thật → không cho xoá cứng (giữ vết).
  if (trial.status === "ATTENDED" || trial.status === "ENROLLED" || trial.feedback) {
    return {
      ok: false,
      error:
        "Buổi học thử đã phát sinh kết quả (đã học/đã chốt/có nhận xét) — không thể xoá. Hãy đổi trạng thái thay vì xoá.",
    };
  }

  const { actorId, actorName } = getAuditActor(session);

  // TrialFeedback có onDelete: Cascade theo trialClassId → xoá kèm.
  await db.$transaction(async (tx) => {
    await tx.trialClass.delete({ where: { id: trialId } });
    await writeAudit({
      actor: { id: actorId, name: actorName },
      module: "trials",
      entityType: "TrialClass",
      entityId: trialId,
      action: "DELETE",
      oldValues: {
        leadId: trial.leadId,
        status: trial.status,
        scheduledAt: trial.scheduledAt?.toISOString() ?? null,
      },
      orgUnitId: trial.centerId,
      tx,
    });
  });

  revalidatePath("/trials");
  revalidatePath(`/leads/${trial.leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function saveTrialFeedbackAction(
  trialId: string,
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "trials:feedback")) {
    return { ok: false, error: "Không có quyền nhập nhận xét" };
  }

  const parsed = trialFeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const trial = await sdb.trialClass.findUnique({
    where: { id: trialId },
    select: { id: true, leadId: true, centerId: true },
  });
  if (!trial || !passesScope("TrialClass", trial, actor)) {
    return { ok: false, error: "Buổi học thử không tồn tại" };
  }

  const data = {
    childEnjoyed: parsed.data.childEnjoyed ?? null,
    childGrasp: parsed.data.childGrasp ?? null,
    teacherSuggestion: parsed.data.teacherSuggestion,
    parentFeedback: parsed.data.parentFeedback,
    recommendedCourseId: parsed.data.recommendedCourseId,
  };

  await db.trialFeedback.upsert({
    where: { trialClassId: trialId },
    create: { trialClassId: trialId, ...data },
    update: data,
  });

  revalidatePath("/trials");
  revalidatePath(`/leads/${trial.leadId}`);
  return { ok: true };
}
