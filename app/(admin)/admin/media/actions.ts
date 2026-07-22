"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
import { getAuditActor } from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/audit-log";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { getNonConsentStudents } from "@/lib/lms/media-consent";
import { resolveActor } from "@/lib/auth/actor";
import { canManageClass } from "@/lib/auth/lms-scope";
import { formatDateDMY } from "@/lib/format/date";

// Cách ly cơ sở (chống IDOR ghi): ClassSessionMedia relation-scoped qua class.centerId.
// Duyệt/xoá theo mediaId từ client phải xác minh lớp thuộc tầm nhìn actor.
async function mediaClassInScope(userId: string | undefined, mediaId: string): Promise<boolean> {
  if (!userId) return false;
  const actor = await resolveActor(userId);
  const sdb = scopedDb(actor);
  const m = await sdb.classSessionMedia.findUnique({
    where: { id: mediaId },
    select: { classId: true },
  });
  if (!m) return false;
  // Class ∈ SCOPED_MODELS: sdb.findUnique trả null nếu lớp ngoài tầm nhìn → centerId
  // null → canManageClass deny (tương đương passesScope thủ công trước đây).
  const cls = await sdb.class.findUnique({ where: { id: m.classId }, select: { centerId: true } });
  return canManageClass(actor, m.classId, cls?.centerId ?? null);
}

// =============================================================================
// ADMIN MEDIA — Phase NHÓM 3 + R7-09
// GV/Sale-phụ-trách/QL upload ảnh lớp (PENDING) + gắn BUỔI + tag học sinh →
// CENTER_MANAGER duyệt. Quyền upload theo LỚP (không chỉ theo role tĩnh).
// =============================================================================

type SessionUser = NonNullable<Session["user"]>;

/**
 * R7-09 — "Sale phụ trách lớp" = Sale (Lead.assignedToId) của các đơn có ghi danh
 * thuộc lớp. DERIVE từ enrollment → orderItem → order → lead (KHÔNG thêm cột).
 */
async function deriveClassSaleIds(
  sdb: ReturnType<typeof scopedDb>,
  classId: string,
): Promise<Set<string>> {
  const orders = await sdb.order.findMany({
    where: { items: { some: { enrollment: { classId } } } },
    select: { lead: { select: { assignedToId: true } } },
  });
  const ids = new Set<string>();
  for (const o of orders) {
    if (o.lead?.assignedToId) ids.add(o.lead.assignedToId);
  }
  return ids;
}

/**
 * Quyền upload ảnh vào 1 LỚP: GV lớp (teacherId/assistantId) ∪ Sale phụ trách lớp
 * (derive) ∪ người có quyền duyệt/quản lý media (media:approve). Sale KHÔNG phụ
 * trách lớp → false (AC4).
 */
async function canUploadToClass(
  user: SessionUser,
  classId: string,
): Promise<boolean> {
  const actor = await resolveActor(user.id);
  const sdb = scopedDb(actor);
  // Class ∈ SCOPED_MODELS → sdb trả null nếu lớp ngoài tầm nhìn actor (cách ly cơ sở).
  const cls = await sdb.class.findUnique({
    where: { id: classId },
    select: { teacherId: true, assistantId: true, centerId: true },
  });
  if (!cls) return false;

  // QL/Admin có quyền duyệt media → upload, NHƯNG vẫn phải TRONG cơ sở mình (chống
  // IDOR chéo cơ sở: CS1 manager không upload/đọc context lớp CS2). canManageClass
  // đã enforce passesScope + SUPER_ADMIN/HO bypass. Trùng pattern mediaClassInScope.
  if (await checkPermission("media:approve")) {
    return canManageClass(actor, classId, cls.centerId);
  }

  if (cls.teacherId === user.id || cls.assistantId === user.id) return true;

  const saleIds = await deriveClassSaleIds(sdb, classId);
  return saleIds.has(user.id);
}

export type ClassUploadContext = {
  canUpload: boolean;
  students: { id: string; name: string }[];
  nonConsent: { id: string; name: string }[];
  sessions: { id: string; label: string; date: string }[];
};

/** Bối cảnh upload 1 lớp: HS để tag + HS chưa consent (banner) + danh sách buổi. */
export async function getClassUploadContext(
  classId: string,
): Promise<ClassUploadContext> {
  const empty: ClassUploadContext = {
    canUpload: false,
    students: [],
    nonConsent: [],
    sessions: [],
  };
  const session = await auth();
  if (!session?.user) return empty;
  if (!(await canUploadToClass(session.user, classId))) return empty;

  const sdb = scopedDb(await resolveActor(session.user.id));
  const [enr, nonConsent, sessions] = await Promise.all([
    sdb.enrollment.findMany({
      where: { classId, status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
      select: { student: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    getNonConsentStudents(classId),
    sdb.classSession.findMany({
      where: { classId },
      select: { id: true, date: true, topic: true },
      orderBy: { date: "desc" },
      take: 100,
    }),
  ]);

  return {
    canUpload: true,
    students: enr.map((e) => e.student),
    nonConsent,
    sessions: sessions.map((s) => ({
      id: s.id,
      date: s.date.toISOString(),
      label: `${formatDateDMY(s.date)}${s.topic ? ` · ${s.topic}` : ""}`,
    })),
  };
}

const uploadSchema = z
  .object({
    classId: z.string().min(1, "Chọn lớp"),
    fileUrl: z.string().url("File không hợp lệ"),
    fileName: z.string().optional().nullable(),
    caption: z.string().trim().max(1000).optional().nullable(),
    studentIds: z.array(z.string()).optional(),
    // Đánh dấu rõ "ảnh chung cả lớp" (#8). Khi true → không gắn thẻ HS cụ thể.
    isClassWide: z.boolean().optional(),
    // R7-09 — gắn buổi + ngày chụp (tùy chọn; fallback mức lớp nếu null).
    classSessionId: z.string().optional().nullable(),
    takenAt: z.string().optional().nullable(),
  })
  .refine((v) => v.isClassWide || (v.studentIds?.length ?? 0) > 0, {
    message: "Chọn học viên trong ảnh hoặc đánh dấu 'Ảnh chung cả lớp'",
    path: ["studentIds"],
  });

export async function uploadClassMedia(input: {
  classId: string;
  fileUrl: string;
  fileName?: string | null;
  caption?: string | null;
  studentIds?: string[];
  isClassWide?: boolean;
  classSessionId?: string | null;
  takenAt?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };

  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const d = parsed.data;

  // Quyền upload THEO LỚP (GV / Sale phụ trách / QL) — không chỉ role tĩnh (AC4).
  if (!(await canUploadToClass(session.user, d.classId))) {
    return { ok: false, error: "Bạn không phụ trách lớp này — không thể đăng ảnh" };
  }

  const sdb = scopedDb(await resolveActor(session.user.id));

  // Class-wide & tag theo HS là loại trừ nhau: class-wide thì bỏ qua studentIds.
  const isClassWide = !!d.isClassWide;
  const tagIds = isClassWide ? [] : (d.studentIds ?? []);

  // C6.3 / AC4 — KHÔNG cho tag HS chưa có consent CLASS_MEDIA (reject server-side).
  // Kiểm tra TRỰC TIẾP theo tagId (không chỉ dựa danh sách lớp) → chống payload tuỳ ý.
  if (tagIds.length > 0) {
    const granted = await sdb.studentConsent.findMany({
      where: { studentId: { in: tagIds }, type: "CLASS_MEDIA", status: "GRANTED" },
      select: { studentId: true },
    });
    const grantedSet = new Set(granted.map((g) => g.studentId));
    const blockedIds = tagIds.filter((id) => !grantedSet.has(id));
    if (blockedIds.length > 0) {
      const names = await sdb.student.findMany({
        where: { id: { in: blockedIds } },
        select: { name: true },
      });
      return {
        ok: false,
        error: `Học viên chưa đồng ý dùng hình ảnh — không thể gắn thẻ: ${names
          .map((n) => n.name)
          .join(", ")}`,
      };
    }
  }

  // Buổi (nếu chọn) phải thuộc đúng lớp; takenAt fallback theo ngày buổi.
  let takenAt: Date | null = null;
  if (d.takenAt) {
    const parsed2 = new Date(d.takenAt);
    if (Number.isNaN(parsed2.getTime())) {
      return { ok: false, error: "Ngày chụp không hợp lệ" };
    }
    takenAt = parsed2;
  }
  let classSessionId: string | null = null;
  if (d.classSessionId) {
    const ses = await sdb.classSession.findFirst({
      where: { id: d.classSessionId, classId: d.classId },
      select: { id: true, date: true },
    });
    if (!ses) return { ok: false, error: "Buổi học không thuộc lớp này" };
    classSessionId = ses.id;
    if (!takenAt) takenAt = ses.date;
  }

  const { actorId, actorName } = getAuditActor(session);
  // GV/Sale upload → PENDING; người có quyền duyệt upload → APPROVED luôn.
  const autoApprove = await checkPermission("media:approve");

  const created = await sdb.classSessionMedia.create({
    data: {
      classId: d.classId,
      fileUrl: d.fileUrl,
      fileName: d.fileName || null,
      caption: d.caption || null,
      status: autoApprove ? "APPROVED" : "PENDING",
      isClassWide,
      classSessionId,
      takenAt,
      uploadedById: actorId,
      uploadedByName: actorName,
      ...(autoApprove
        ? { approvedById: actorId, approvedByName: actorName, approvedAt: new Date() }
        : {}),
      tags: tagIds.length
        ? { create: tagIds.map((studentId) => ({ studentId })) }
        : undefined,
    },
    select: { id: true },
  });

  const cls = await sdb.class.findUnique({
    where: { id: d.classId },
    select: { centerId: true },
  });
  await writeAudit({
    actor: { id: actorId, name: actorName },
    module: "media",
    entityType: "ClassSessionMedia",
    entityId: created.id,
    action: "CREATE",
    newValues: {
      classId: d.classId,
      classSessionId,
      isClassWide,
      status: autoApprove ? "APPROVED" : "PENDING",
      tagCount: tagIds.length,
    },
    orgUnitId: cls?.centerId ?? null,
  });

  revalidatePath("/media");
  return { ok: true };
}

export async function reviewMedia(input: {
  id: string;
  decision: "APPROVED" | "REJECTED";
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("media:approve"))) return { ok: false, error: "Không có quyền duyệt" };
  // Cách ly cơ sở: chỉ duyệt ảnh của lớp trong tầm nhìn actor (chống IDOR).
  if (!(await mediaClassInScope(session.user.id, input.id))) {
    return { ok: false, error: "Không tìm thấy ảnh" };
  }

  const { actorId, actorName } = getAuditActor(session);
  const sdb = scopedDb(await resolveActor(session.user.id));
  await sdb.classSessionMedia.update({
    where: { id: input.id },
    data: {
      status: input.decision,
      approvedById: actorId,
      approvedByName: actorName,
      approvedAt: new Date(),
    },
  });
  await writeAudit({
    actor: { id: actorId, name: actorName },
    module: "media",
    entityType: "ClassSessionMedia",
    entityId: input.id,
    action: "STATUS_CHANGE",
    newValues: { status: input.decision },
  });
  revalidatePath("/media");
  revalidatePath("/portal/hinh-anh");
  return { ok: true };
}

export async function deleteMedia(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("media:approve"))) return { ok: false, error: "Không có quyền" };
  // Cách ly cơ sở: chỉ xoá ảnh của lớp trong tầm nhìn actor (chống IDOR).
  if (!(await mediaClassInScope(session.user.id, id))) {
    return { ok: false, error: "Không tìm thấy ảnh" };
  }
  const { actorId, actorName } = getAuditActor(session);
  const sdb = scopedDb(await resolveActor(session.user.id));
  await sdb.classSessionMedia.delete({ where: { id } }).catch(() => null);
  await writeAudit({
    actor: { id: actorId, name: actorName },
    module: "media",
    entityType: "ClassSessionMedia",
    entityId: id,
    action: "DELETE",
  });
  revalidatePath("/media");
  return { ok: true };
}
