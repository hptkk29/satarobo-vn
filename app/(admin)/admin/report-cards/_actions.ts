"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { db } from "@/lib/db";
import { resolveActor } from "@/lib/auth/actor";
import { writeAudit } from "@/lib/audit/audit-log";
import { publishEvent } from "@/lib/events/publish";
import {
  actorCapabilities,
  buildPublishedSnapshot,
  canEditReportCardContent,
  checkEnrollmentScope,
  checkManageWriteScope,
  checkTransition,
  computeReportCardMetrics,
  getCourseCriteria,
  getEnrollmentContext,
  isReportCardEditable,
  type ReportCardStatusValue,
} from "@/lib/lms/report-card";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const AUDIT_MODULE = "lms";
const AUDIT_ENTITY = "ReportCard";

// ─── Schemas ──────────────────────────────────────────────────────────────
const periodCommentSchema = z.object({
  period: z.string().trim().max(120),
  comment: z.string().trim().max(4000),
});

const scoreSchema = z.object({
  criterionId: z.string().min(1),
  level: z.number().int().min(1).max(4),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

const saveSchema = z.object({
  enrollmentId: z.string().min(1),
  finalComment: z.string().trim().max(4000).optional().or(z.literal("")),
  completionStatus: z.string().trim().max(120).optional().or(z.literal("")),
  periodComments: z.array(periodCommentSchema).max(20).default([]),
  scores: z.array(scoreSchema).max(50).default([]),
});

const transitionSchema = z.object({
  enrollmentId: z.string().min(1),
  to: z.enum(["DRAFT", "PENDING_REVIEW", "PUBLISHED", "RECALLED"]),
  reason: z.string().trim().max(1000).optional().or(z.literal("")),
});

// ─── Helpers ────────────────────────────────────────────────────────────────
async function authContext() {
  const session = await auth();
  if (!session?.user) return { error: "Chưa đăng nhập" as const };
  // report-cards:* seed v2 scope GLOBAL cố ý (check ở authContext, cách ly do
  // scopedDb — ReportCard ∈ SCOPED_MODELS từ #03 Pha B 86edfbc) — không
  // truyền target (chưa chắc scope, không đoán mò).
  const canManage = await checkPermission("report-cards:manage");
  const canReview = await checkPermission("report-cards:review");
  if (!canManage && !canReview) return { error: "Không có quyền" as const };
  const actor = await resolveActor(session.user.id);
  const capabilities = actorCapabilities({ manage: canManage, review: canReview });
  const auditActor = { id: session.user.id, name: session.user.name ?? session.user.email ?? session.user.id };
  return { session, actor, capabilities, auditActor };
}

// ═══════════════════════════════════════════════════════════════════════════
// SAVE — GV nhập nhận xét + chấm năng lực (chỉ khi DRAFT/RECALLED).
// ═══════════════════════════════════════════════════════════════════════════
export async function saveReportCardAction(input: unknown): Promise<Result> {
  const ctx = await authContext();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "Không có quyền" };
  // Guard capability theo TRẠNG THÁI học bạ (sau khi biết status ở dưới) —
  // #17 Gap3: DRAFT cần 'manage', RECALLED cần 'review'. authContext đã đảm bảo
  // actor có ít nhất manage HOẶC review.

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const d = parsed.data;

  const enr = await getEnrollmentContext(d.enrollmentId);
  if (!enr) return { ok: false, error: "Không tìm thấy đăng ký học" };

  const scope = checkEnrollmentScope({
    actor: ctx.actor,
    centerId: enr.centerId,
    classId: enr.classId,
    capabilities: ctx.capabilities,
  });
  if (!scope.ok) return { ok: false, error: scope.error ?? "Ngoài phạm vi" };

  // Vá 24/07 (Gói E, user chốt câu 55 siết): GHI nội dung phải theo cơ sở của quyền
  // manage — checkEnrollmentScope nuốt HO-level (cần cho đường DUYỆT) nên không đủ.
  // Toại (TRAINING@HO chỉ review + CM/TEACHER@CS1): hết ghi học bạ CS2, vẫn duyệt CS2.
  const writeScope = checkManageWriteScope({ actor: ctx.actor, centerId: enr.centerId });
  if (!writeScope.ok) return { ok: false, error: writeScope.error ?? "Ngoài phạm vi" };

  // Tiêu chí phải đã cấu hình (cảnh báo Đào tạo cấu hình trước).
  const criteria = await getCourseCriteria(enr.courseId);
  if (criteria.length === 0) {
    return { ok: false, error: "Khoá học chưa có tiêu chí năng lực — cần Đào tạo cấu hình trước." };
  }
  const criterionIds = new Set(criteria.map((c) => c.id));
  for (const s of d.scores) {
    if (!criterionIds.has(s.criterionId)) {
      return { ok: false, error: "Tiêu chí chấm không thuộc khoá học này" };
    }
  }

  const existing = await db.reportCard.findUnique({
    where: { enrollmentId: d.enrollmentId },
    select: { id: true, status: true },
  });

  const status = (existing?.status ?? "DRAFT") as ReportCardStatusValue;
  if (existing && !isReportCardEditable(status)) {
    return { ok: false, error: "Học bạ đang chờ duyệt/đã phát hành — không sửa được nội dung" };
  }
  // #17 Gap3 (câu 55): học bạ đã THU HỒI (RECALLED = từng phát hành) → chỉ người có
  // quyền DUYỆT (QL cơ sở / Đào tạo / Admin) mới sửa lại; GV (manage-only) BỊ CHẶN.
  // DRAFT/mới → cần 'manage' (GV nhập). Rule THUẦN, test được: canEditReportCardContent.
  if (!canEditReportCardContent(status, ctx.capabilities)) {
    return {
      ok: false,
      error:
        status === "RECALLED"
          ? "Học bạ đã phát hành & thu hồi — chỉ Quản lý cơ sở hoặc Đào tạo được sửa lại"
          : "Không có quyền nhập học bạ",
    };
  }

  const periodComments = d.periodComments.filter((p) => p.period || p.comment);
  const dataCommon = {
    finalComment: d.finalComment || null,
    completionStatus: d.completionStatus || null,
    periodComments: periodComments as unknown as Prisma.InputJsonValue,
    centerId: enr.centerId,
  };

  await db.$transaction(async (tx) => {
    let reportCardId: string;
    if (existing) {
      // Không REGRESS centerId non-null → null (lớp/enrollment chuyển về HO):
      // ReportCard ∈ SCOPED_MODELS (∉ NULL_IS_GLOBAL) — row null tàng hình với mọi
      // actor cấp cơ sở. undefined = giữ nguyên cột; vẫn heal null→CS khi enr có centerId.
      await tx.reportCard.update({
        where: { id: existing.id },
        data: { ...dataCommon, centerId: enr.centerId ?? undefined },
      });
      reportCardId = existing.id;
    } else {
      const created = await tx.reportCard.create({
        data: { ...dataCommon, enrollmentId: d.enrollmentId, status: "DRAFT", teacherId: ctx.session.user.id },
        select: { id: true },
      });
      reportCardId = created.id;
    }

    // Replace scores: xoá tiêu chí không còn chấm + upsert phần còn lại.
    const keepIds = d.scores.map((s) => s.criterionId);
    await tx.reportCardScore.deleteMany({
      where: { reportCardId, criterionId: keepIds.length ? { notIn: keepIds } : undefined },
    });
    for (const s of d.scores) {
      await tx.reportCardScore.upsert({
        where: { reportCardId_criterionId: { reportCardId, criterionId: s.criterionId } },
        create: { reportCardId, criterionId: s.criterionId, level: s.level, note: s.note || null },
        update: { level: s.level, note: s.note || null },
      });
    }

    await writeAudit({
      actor: ctx.auditActor,
      module: AUDIT_MODULE,
      entityType: AUDIT_ENTITY,
      entityId: reportCardId,
      action: existing ? "UPDATE" : "CREATE",
      newValues: { enrollmentId: d.enrollmentId, scores: d.scores.length },
      tx,
    });
  });

  revalidatePath(`/admin/report-cards/${d.enrollmentId}`);
  revalidatePath("/admin/report-cards");
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSITION — máy trạng thái (nộp / phát hành / trả lại / thu hồi / nộp lại).
// ═══════════════════════════════════════════════════════════════════════════
export async function transitionReportCardAction(input: unknown): Promise<Result> {
  const ctx = await authContext();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "Không có quyền" };

  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const { enrollmentId, to, reason } = parsed.data;

  const enr = await getEnrollmentContext(enrollmentId);
  if (!enr) return { ok: false, error: "Không tìm thấy đăng ký học" };

  const scope = checkEnrollmentScope({
    actor: ctx.actor,
    centerId: enr.centerId,
    classId: enr.classId,
    capabilities: ctx.capabilities,
  });
  if (!scope.ok) return { ok: false, error: scope.error ?? "Ngoài phạm vi" };

  const rc = await db.reportCard.findUnique({
    where: { enrollmentId },
    select: { id: true, status: true, finalComment: true, completionStatus: true, periodComments: true },
  });
  if (!rc) return { ok: false, error: "Chưa có học bạ để chuyển trạng thái — hãy lưu nội dung trước." };

  const from = rc.status as ReportCardStatusValue;
  const guard = checkTransition({ from, to: to as ReportCardStatusValue, capabilities: ctx.capabilities, reason });
  if (!guard.ok) return { ok: false, error: guard.error ?? "Chuyển trạng thái không hợp lệ" };

  // Vá 24/07 (Gói E): transition capability=manage (nộp DRAFT→PENDING_REVIEW, nộp lại
  // RECALLED→PENDING_REVIEW) cũng là đường GHI — theo cơ sở của quyền manage. Các cạnh
  // capability=review (phát hành/trả lại/thu hồi) GIỮ NGUYÊN → Toại (TRAINING@HO) vẫn
  // duyệt học bạ CS2 (câu 55).
  if (guard.rule?.capability === "manage") {
    const writeScope = checkManageWriteScope({ actor: ctx.actor, centerId: enr.centerId });
    if (!writeScope.ok) return { ok: false, error: writeScope.error ?? "Ngoài phạm vi" };
  }

  // NỘP DUYỆT: học bạ phải HOÀN CHỈNH — khoá có tiêu chí + mọi tiêu chí đã chấm (1–4).
  // Trước đây thiếu guard này → nộp được học bạ trống tiêu chí / chưa chấm.
  if (to === "PENDING_REVIEW") {
    const [criteria, scores] = await Promise.all([
      getCourseCriteria(enr.courseId),
      db.reportCardScore.findMany({
        where: { reportCardId: rc.id },
        select: { criterionId: true, level: true },
      }),
    ]);
    if (criteria.length === 0) {
      return {
        ok: false,
        error: "Khoá chưa có tiêu chí năng lực — cần cấu hình tiêu chí trước khi nộp duyệt.",
      };
    }
    const scoredIds = new Set(
      scores.filter((s) => s.level >= 1 && s.level <= 4).map((s) => s.criterionId),
    );
    const missing = criteria.filter((c) => !scoredIds.has(c.id)).length;
    if (missing > 0) {
      return {
        ok: false,
        error: `Còn ${missing} tiêu chí chưa chấm — cần chấm đủ trước khi nộp duyệt.`,
      };
    }
  }

  // ── PHÁT HÀNH: đóng băng snapshot + emit event TRONG transaction ──
  if (to === "PUBLISHED") {
    const [metrics, criteria, scores] = await Promise.all([
      computeReportCardMetrics(enrollmentId),
      getCourseCriteria(enr.courseId),
      db.reportCardScore.findMany({
        where: { reportCardId: rc.id },
        select: { criterionId: true, level: true, note: true },
      }),
    ]);
    const publishedAt = new Date();
    const snapshot = buildPublishedSnapshot({
      metrics,
      reportCard: { finalComment: rc.finalComment, completionStatus: rc.completionStatus, periodComments: rc.periodComments },
      scores,
      criteria,
      student: { name: enr.studentName, studentCode: enr.studentCode },
      course: { name: enr.courseName },
      className: enr.className,
      publishedAt,
    });

    await db.$transaction(async (tx) => {
      await tx.reportCard.update({
        where: { id: rc.id },
        data: {
          status: "PUBLISHED",
          publishedById: ctx.session.user.id,
          publishedAt,
          publishedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          centerId: enr.centerId,
        },
      });
      await writeAudit({
        actor: ctx.auditActor,
        module: AUDIT_MODULE,
        entityType: AUDIT_ENTITY,
        entityId: rc.id,
        action: "STATUS_CHANGE",
        oldValues: { status: from },
        newValues: { status: "PUBLISHED" },
        reason: reason || undefined,
        orgUnitId: enr.centerId,
        tx,
      });
      await publishEvent(
        "reportcard.published",
        { reportCardId: rc.id, enrollmentId, studentId: enr.studentId, centerId: enr.centerId },
        { tx, dedupeKey: `reportcard.published:${rc.id}:${publishedAt.toISOString()}` },
      );
    });

    revalidatePath(`/admin/report-cards/${enrollmentId}`);
    revalidatePath("/admin/report-cards");
    return { ok: true };
  }

  // ── Các chuyển khác (nộp / trả lại / thu hồi / nộp lại) ──
  const reviewedById = to === "DRAFT" || to === "RECALLED" ? ctx.session.user.id : undefined;
  await db.$transaction(async (tx) => {
    await tx.reportCard.update({
      where: { id: rc.id },
      data: { status: to as ReportCardStatusValue, ...(reviewedById ? { reviewedById } : {}) },
    });
    await writeAudit({
      actor: ctx.auditActor,
      module: AUDIT_MODULE,
      entityType: AUDIT_ENTITY,
      entityId: rc.id,
      action: "STATUS_CHANGE",
      oldValues: { status: from },
      newValues: { status: to },
      reason: reason || undefined,
      orgUnitId: enr.centerId,
      tx,
    });
  });

  revalidatePath(`/admin/report-cards/${enrollmentId}`);
  revalidatePath("/admin/report-cards");
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// TIÊU CHÍ NĂNG LỰC (Đào tạo cấu hình per khóa).
// ═══════════════════════════════════════════════════════════════════════════
const criterionSchema = z.object({
  courseId: z.string().min(1),
  name: z.string().trim().min(1, "Tên tiêu chí bắt buộc").max(200),
  order: z.number().int().min(0).max(999).default(0),
});

export async function createCriterionAction(input: unknown): Promise<Result> {
  const ctx = await authContext();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "Không có quyền" };
  // Cấu hình tiêu chí = quyền duyệt (QL/Đào tạo).
  if (!ctx.capabilities.includes("review")) return { ok: false, error: "Chỉ Đào tạo/Quản lý cấu hình tiêu chí" };

  const parsed = criterionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const d = parsed.data;

  const created = await db.reportCardCriterion.create({
    data: { courseId: d.courseId, name: d.name, order: d.order, active: true },
    select: { id: true },
  });
  await writeAudit({
    actor: ctx.auditActor,
    module: AUDIT_MODULE,
    entityType: "ReportCardCriterion",
    entityId: created.id,
    action: "CREATE",
    newValues: { courseId: d.courseId, name: d.name },
  });

  revalidatePath("/admin/report-cards/criteria");
  return { ok: true };
}

export async function toggleCriterionAction(input: unknown): Promise<Result> {
  const ctx = await authContext();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "Không có quyền" };
  if (!ctx.capabilities.includes("review")) return { ok: false, error: "Chỉ Đào tạo/Quản lý cấu hình tiêu chí" };

  const parsed = z.object({ id: z.string().min(1), active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu không hợp lệ" };

  await db.reportCardCriterion.update({ where: { id: parsed.data.id }, data: { active: parsed.data.active } });
  await writeAudit({
    actor: ctx.auditActor,
    module: AUDIT_MODULE,
    entityType: "ReportCardCriterion",
    entityId: parsed.data.id,
    action: "UPDATE",
    newValues: { active: parsed.data.active },
  });

  revalidatePath("/admin/report-cards/criteria");
  return { ok: true };
}
