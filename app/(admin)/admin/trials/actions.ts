"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { publishEvent } from "@/lib/events/publish";
import { getAuditActor } from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/audit-log";
import { recordLeadStatusChange } from "@/lib/lead/status-trail-write";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";
import {
  trialUpdateSchema,
  trialFeedbackSchema,
} from "@/lib/validators/trial";
import { teacherCenterAssignmentError } from "@/lib/teachers/center-filter";
import { notifyTrialTeacherAssigned } from "@/lib/trial/service";
import type { LeadStatus, Prisma, TrialClassStatus } from "@prisma/client";

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
  if (!(await checkPermission("trials:manage"))) {
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
    select: {
      id: true,
      leadId: true,
      status: true,
      scheduledAt: true,
      centerId: true,
      teacherId: true,
    },
  });
  if (!trial || !passesScope("TrialClass", trial, actor)) {
    return { ok: false, error: "Buổi học thử không tồn tại" };
  }

  // #4 — GV gán phải CÙNG cơ sở buổi học thử (backstop server cho lọc dropdown;
  // chặn gán chéo CS1↔CS2 qua POST thẳng). Buổi không có cơ sở → không ràng buộc.
  if (parsed.data.teacherId && parsed.data.teacherId !== trial.teacherId) {
    const t = await sdb.user.findUnique({
      where: { id: parsed.data.teacherId },
      select: { centerId: true },
    });
    const err = teacherCenterAssignmentError(trial.centerId, [
      { id: parsed.data.teacherId, centerId: t?.centerId },
    ]);
    if (err) return { ok: false, error: err };
  }

  const { actorId, actorName } = getAuditActor(session);
  const becameAttended =
    parsed.data.status === "ATTENDED" && trial.status !== "ATTENDED";
  const leadNextStatus = TRIAL_TO_LEAD[parsed.data.status];

  const newAt = new Date(parsed.data.scheduledAt);
  const scheduleChanged = trial.scheduledAt?.getTime() !== newAt.getTime();

  await sdb.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient;
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
        // C-07 — trước đây chỗ này chỉ tạo `LeadActivity`, không có dòng
        // `AuditLog` ⇒ mốc "kết quả buổi học thử đẩy lead sang bước mới" mất khỏi
        // mục "Lịch sử thay đổi" mà QLCS xem. Nay đi chung một đường ghi vết.
        await recordLeadStatusChange({
          tx,
          leadId: trial.leadId,
          actorId,
          actorName,
          from: lead.status,
          to: leadNextStatus,
          source: "TRIAL",
        });

        // 25/08 — lead MẤT ⇒ đóng sổ học thử V2: `LeadTrialHistory.outcome = "LOST"`.
        //
        // Đường này KHÔNG đi qua `updateLeadStatus` (nó ghi thẳng `tx.lead.update` ở
        // trên), mà `updateLeadStatus` là nơi DUY NHẤT còn lại ghi cột này — nên bỏ qua
        // là màn Trial V1 giết lead xong mà sổ V2 vẫn "PENDING": bảng Trial của site GV
        // để suất đó ở "Chờ đánh giá" vĩnh viễn, giáo viên thấy một việc không bao giờ
        // làm xong được. Giữ nguyên chữ ký where của bản gốc để hai đường không lệch.
        //
        // Chỉ đụng dòng đang PENDING: con đã nhập học khoá khác rồi thì lead mất không
        // xoá được thành tích đó.
        if (leadNextStatus === "LOST") {
          await tx.leadTrialHistory.updateMany({
            where: { leadChild: { leadId: trial.leadId }, outcome: "PENDING" },
            data: { outcome: "LOST" },
          });
        }
      }
    }
  });

  // #6 — báo GV khi được gán/đổi vào buổi học thử (trước đây chỉ báo Sale).
  // Không báo khi gỡ gán, giữ nguyên GV cũ, hoặc tự gán mình.
  if (
    parsed.data.teacherId &&
    parsed.data.teacherId !== trial.teacherId &&
    parsed.data.teacherId !== session.user.id
  ) {
    await notifyTrialTeacherAssigned({
      teacherId: parsed.data.teacherId,
      title: "Bạn được phân công buổi học thử",
      body: `Bạn phụ trách buổi học thử lúc ${newAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.`,
      dedupeKey: `trial-v1.assigned:${trialId}`,
      href: "/trials",
      entityId: trialId,
    });
  }

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
  if (!(await checkPermission("trials:manage"))) {
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
  await sdb.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient;
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
  if (!(await checkPermission("trials:feedback"))) {
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

  // TrialFeedback không scoped → sdb pass-through (trial đã qua passesScope ở trên).
  await sdb.trialFeedback.upsert({
    where: { trialClassId: trialId },
    create: { trialClassId: trialId, ...data },
    update: data,
  });

  revalidatePath("/trials");
  revalidatePath(`/leads/${trial.leadId}`);
  return { ok: true };
}
