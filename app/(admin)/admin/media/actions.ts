"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb, passesScope } from "@/lib/db-scope";
import { getAuditActor } from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/audit-log";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { getNonConsentStudents } from "@/lib/lms/media-consent";
import { resolveActor } from "@/lib/auth/actor";
import { canManageClass } from "@/lib/auth/lms-scope";
import { formatDateDMY } from "@/lib/format/date";
import { getR2PublicUrl } from "@/lib/storage/r2-client";
import {
  createDraftMediaBatch,
  publishClassMedia,
  deleteDraftMedia,
  DRAFT_BATCH_MAX,
  PUBLISH_BATCH_MAX,
} from "@/lib/lms/media-publish";

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
//
// 11/08 — HAI cổng quyền tách nhau (chủ dự án chốt):
//   canStageToClass   → đưa ảnh vào KHO (DRAFT, PH không thấy). Rộng: GV/Sale/QL +
//                       vai chỉ-góp-ảnh giữ `media:upload-draft` (Marketing, Giáo vụ).
//   canPublishToClass → đăng thẳng 1 ảnh HOẶC gửi ảnh trong kho tới PH. Hẹp: GV lớp,
//                       Sale phụ trách lớp, người có `media:approve`.
// Ai chỉ qua được cổng đầu thì ảnh nằm trong kho tới khi GIÁO VIÊN chọn gửi.
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
 * Quyền ĐĂNG ẢNH TỚI PHỤ HUYNH cho 1 LỚP (đăng thẳng 1 ảnh, hoặc gửi ảnh từ kho):
 * GV lớp (teacherId/assistantId) ∪ Sale phụ trách lớp (derive) ∪ người có quyền
 * duyệt/quản lý media (media:approve). Sale KHÔNG phụ trách lớp → false (AC4).
 *
 * ⚠️ 11/08 — TÁCH khỏi quyền đưa ảnh vào kho (canStageToClass). Vai chỉ-góp-ảnh
 * (Marketing, Giáo vụ) KHÔNG qua được hàm này: ảnh của họ nằm trong kho cho tới
 * khi giáo viên chọn gửi.
 */
async function canPublishToClass(
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

/**
 * Quyền ĐƯA ẢNH VÀO KHO (DRAFT) của 1 lớp — rộng hơn canPublishToClass:
 * ai gửi PH được thì đương nhiên đưa vào kho được, CỘNG các vai chỉ-góp-ảnh giữ
 * `media:upload-draft` (Marketing Hội sở, Giáo vụ — chủ dự án chốt 11/08).
 *
 * Cách ly cơ sở: lớp phải nằm trong tầm nhìn actor. KHÔNG dùng canManageClass ở
 * đây — hàm đó đòi actor là quản lý (SUPER_ADMIN/HO/CENTER_MANAGER) hoặc GV phụ
 * trách lớp, nên Giáo vụ (CENTER_CLASS_MANAGER) sẽ bị chặn oan; ranh giới đúng cho
 * vai góp ảnh là passesScope theo cơ sở của lớp.
 */
async function canStageOnlyToClass(
  user: SessionUser,
  classId: string,
): Promise<boolean> {
  if (!(await checkPermission("media:upload-draft"))) return false;

  const actor = await resolveActor(user.id);
  // Class ∈ SCOPED_MODELS → sdb trả null nếu lớp ngoài tầm nhìn (cách ly cơ sở);
  // passesScope lặp lại là chốt thứ hai, cùng mẫu mediaClassInScope ở trên.
  const cls = await scopedDb(actor).class.findUnique({
    where: { id: classId },
    select: { centerId: true },
  });
  if (!cls) return false;
  return passesScope("Class", { centerId: cls.centerId }, actor);
}

/** Đưa được ảnh vào kho = gửi PH được HOẶC là vai chỉ-góp-ảnh của lớp đó. */
async function canStageToClass(user: SessionUser, classId: string): Promise<boolean> {
  if (await canPublishToClass(user, classId)) return true;
  return canStageOnlyToClass(user, classId);
}

/**
 * Ảnh phải là object trên R2 CỦA HỆ THỐNG. Không có chốt này, ai qua được cổng
 * upload đều nhét được URL ngoài vào album lớp: nội dung đổi được SAU khi quản lý
 * duyệt, và mỗi lần phụ huynh mở album là một request lộ IP/Referer ra server lạ.
 * Thiếu env R2 → không chặn (lúc đó chính luồng upload cũng không chạy được).
 */
function isOwnStorageUrl(fileUrl: string): boolean {
  try {
    return fileUrl.startsWith(getR2PublicUrl() + "/");
  } catch {
    return true;
  }
}

export type ClassUploadContext = {
  /** Được đưa ảnh vào KHO của lớp này (GV/Sale/QL + vai góp ảnh). */
  canUpload: boolean;
  /** Được ĐĂNG/GỬI ảnh tới phụ huynh. false = chỉ góp ảnh vào kho. */
  canPublish: boolean;
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
    canPublish: false,
    students: [],
    nonConsent: [],
    sessions: [],
  };
  const session = await auth();
  if (!session?.user) return empty;
  // Đánh giá canPublish TRƯỚC rồi mới hỏi nhánh chỉ-góp-ảnh: canStageToClass gọi lại
  // canPublishToClass (kèm join Order→OrderItem→Enrollment) nên hỏi 2 lần là phí.
  const canPublish = await canPublishToClass(session.user, classId);
  if (!canPublish && !(await canStageOnlyToClass(session.user, classId))) return empty;

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
    canPublish,
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

  // Quyền ĐĂNG THẲNG TỚI PH theo LỚP (GV / Sale phụ trách / QL) — không chỉ role
  // tĩnh (AC4). Vai chỉ-góp-ảnh (Marketing/Giáo vụ) KHÔNG đi đường này: ảnh của họ
  // phải nằm trong kho chờ GV chọn (uploadClassMediaBatch).
  if (!(await canPublishToClass(session.user, d.classId))) {
    return {
      ok: false,
      error: (await canStageOnlyToClass(session.user, d.classId))
        ? 'Bạn chỉ được đưa ảnh vào kho — dùng "Đưa vào kho", giáo viên sẽ chọn ảnh gửi phụ huynh'
        : "Bạn không phụ trách lớp này — không thể đăng ảnh",
    };
  }
  if (!isOwnStorageUrl(d.fileUrl)) {
    return { ok: false, error: "Ảnh không hợp lệ — hãy chọn ảnh qua nút tải ảnh" };
  }

  const sdb = scopedDb(await resolveActor(session.user.id));

  // Class-wide & tag theo HS là loại trừ nhau: class-wide thì bỏ qua studentIds.
  const isClassWide = !!d.isClassWide;
  const tagIds = isClassWide ? [] : (d.studentIds ?? []);

  // C6.3 / AC4 — KHÔNG cho tag HS chưa có consent CLASS_MEDIA (reject server-side).
  // Kiểm tra TRỰC TIẾP theo tagId (không chỉ dựa danh sách lớp) → chống payload tuỳ ý.
  if (tagIds.length > 0) {
    const [granted, enrolled] = await Promise.all([
      sdb.studentConsent.findMany({
        where: { studentId: { in: tagIds }, type: "CLASS_MEDIA", status: "GRANTED" },
        select: { studentId: true },
      }),
      // Phải ĐANG HỌC LỚP NÀY — nếu không, payload tuỳ ý gắn được HS lớp khác (miễn
      // em đó đã GRANTED consent) vào ảnh lớp này ⇒ phụ huynh lớp khác xem được ảnh
      // của lớp không liên quan. Đường kho đã kiểm (lib/lms/media-publish.ts:177-205),
      // đường "đăng ngay 1 ảnh" thì sót — vá cho hai đường cùng bất biến.
      sdb.enrollment.findMany({
        where: {
          studentId: { in: tagIds },
          classId: d.classId,
          status: { in: ENROLLMENT_ACTIVE_STATUS_LIST },
          deletedAt: null,
        },
        select: { studentId: true },
      }),
    ]);
    const enrolledSet = new Set(enrolled.map((e) => e.studentId));
    if (tagIds.some((id) => !enrolledSet.has(id))) {
      return { ok: false, error: "Có học viên không thuộc lớp này — tải lại trang" };
    }
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
  // DRAFT là ảnh trong KHO (GV chưa gửi) — không thuộc hàng duyệt: chặn duyệt/từ chối.
  // Đường duy nhất rời kho là publishClassMediaAction (giữ bất biến C6.2/C6.3).
  const current = await sdb.classSessionMedia.findUnique({
    where: { id: input.id },
    select: { status: true },
  });
  if (current?.status === "DRAFT") {
    return { ok: false, error: "Ảnh đang trong kho — giáo viên chưa gửi duyệt" };
  }
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

// =============================================================================
// KHO ẢNH (DRAFT) — GV upload cả loạt vào kho, chọn ảnh gửi PH sau.
// Action = wrapper auth/quyền/scope; logic thuần ở lib/lms/media-publish.ts.
// =============================================================================

const uploadBatchSchema = z.object({
  classId: z.string().min(1, "Chọn lớp"),
  files: z
    .array(
      z.object({
        fileUrl: z.string().url("File không hợp lệ"),
        fileName: z.string().optional().nullable(),
      }),
    )
    .min(1, "Chưa có ảnh nào")
    .max(DRAFT_BATCH_MAX, `Tối đa ${DRAFT_BATCH_MAX} ảnh mỗi lô`),
  classSessionId: z.string().optional().nullable(),
  takenAt: z.string().optional().nullable(),
});

/** Upload N ảnh vào KHO (DRAFT): không tag, không class-wide, không hiện portal. */
export async function uploadClassMediaBatch(input: {
  classId: string;
  files: { fileUrl: string; fileName?: string | null }[];
  classSessionId?: string | null;
  takenAt?: string | null;
}): Promise<{ ok: boolean; error?: string; count?: number }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };

  const parsed = uploadBatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const d = parsed.data;

  // Quyền ĐƯA VÀO KHO theo LỚP (GV / Sale phụ trách / QL / Marketing / Giáo vụ) +
  // cách ly cơ sở. Rộng hơn uploadClassMedia có chủ đích — ảnh vào kho chưa tới PH.
  if (!(await canStageToClass(session.user, d.classId))) {
    return { ok: false, error: "Bạn không được đưa ảnh vào kho của lớp này" };
  }
  if (d.files.some((f) => !isOwnStorageUrl(f.fileUrl))) {
    return { ok: false, error: "Có ảnh không hợp lệ — hãy chọn ảnh qua nút tải ảnh" };
  }

  let takenAt: Date | null = null;
  if (d.takenAt) {
    const t = new Date(d.takenAt);
    if (Number.isNaN(t.getTime())) return { ok: false, error: "Ngày chụp không hợp lệ" };
    takenAt = t;
  }

  const { actorId, actorName } = getAuditActor(session);
  const res = await createDraftMediaBatch(
    { id: actorId, name: actorName },
    {
      classId: d.classId,
      classSessionId: d.classSessionId ?? null,
      takenAt,
      files: d.files,
      uploadedById: actorId,
      uploadedByName: actorName,
    },
  );
  if (!res.ok) return { ok: false, error: res.message };

  revalidatePath("/media");
  return { ok: true, count: res.ids.length };
}

const publishBatchSchema = z.object({
  mediaIds: z
    .array(z.string().min(1))
    .min(1, "Chưa chọn ảnh nào")
    .max(PUBLISH_BATCH_MAX, `Tối đa ${PUBLISH_BATCH_MAX} ảnh mỗi lượt gửi`),
  studentIds: z.array(z.string()).optional(),
  isClassWide: z.boolean().optional(),
  classSessionId: z.string().optional().nullable(),
});

/**
 * Gửi ảnh kho cho PH. GV (không media:approve) → PENDING chờ duyệt như luồng
 * hiện tại; QL (media:approve) → APPROVED luôn (nhất quán autoApprove upload).
 */
export async function publishClassMediaAction(input: {
  mediaIds: string[];
  studentIds?: string[];
  isClassWide?: boolean;
  classSessionId?: string | null;
}): Promise<{ ok: boolean; error?: string; status?: "PENDING" | "APPROVED"; count?: number }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };

  const parsed = publishBatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const d = parsed.data;
  const mediaIds = [...new Set(d.mediaIds)];

  // Cách ly cơ sở (chống IDOR theo mediaId): mọi ảnh phải cùng 1 lớp, và lớp đó
  // trong tầm nhìn + quyền gửi PH của actor (mẫu mediaClassInScope + canPublishToClass).
  const sdb = scopedDb(await resolveActor(session.user.id));
  const rows = await sdb.classSessionMedia.findMany({
    where: { id: { in: mediaIds } },
    select: { classId: true },
  });
  if (rows.length !== mediaIds.length) return { ok: false, error: "Không tìm thấy ảnh" };
  const classIds = [...new Set(rows.map((r) => r.classId))];
  if (classIds.length !== 1) return { ok: false, error: "Các ảnh phải thuộc cùng một lớp" };
  // GỬI PH = quyền hẹp (canPublishToClass). Vai chỉ-góp-ảnh đưa được ảnh vào kho
  // nhưng KHÔNG tự gửi — giáo viên là người chọn (chốt 11/08).
  if (!(await canPublishToClass(session.user, classIds[0]!))) {
    return {
      ok: false,
      error: (await canStageOnlyToClass(session.user, classIds[0]!))
        ? "Bạn chỉ được đưa ảnh vào kho — giáo viên là người chọn ảnh gửi phụ huynh"
        : "Bạn không phụ trách lớp này",
    };
  }

  const autoApprove = await checkPermission("media:approve");
  const { actorId, actorName } = getAuditActor(session);
  const res = await publishClassMedia(
    { id: actorId, name: actorName },
    {
      mediaIds,
      studentIds: d.studentIds,
      isClassWide: d.isClassWide,
      classSessionId: d.classSessionId ?? null,
      autoApprove,
    },
  );
  if (!res.ok) return { ok: false, error: res.message };

  revalidatePath("/media");
  revalidatePath("/portal/hinh-anh");
  return { ok: true, status: res.status, count: res.count };
}

const deleteDraftSchema = z.object({
  mediaIds: z
    .array(z.string().min(1))
    .min(1, "Chưa chọn ảnh nào")
    .max(PUBLISH_BATCH_MAX, `Tối đa ${PUBLISH_BATCH_MAX} ảnh mỗi lượt xoá`),
});

/**
 * Xoá ảnh khỏi kho (chỉ row DRAFT). Người được GỬI ảnh của lớp (GV/trợ giảng, Sale
 * phụ trách, QL có media:approve) xoá được mọi DRAFT của lớp đó; vai chỉ-góp-ảnh
 * (Marketing/Giáo vụ) chỉ xoá được ảnh do CHÍNH MÌNH đưa vào kho.
 */
export async function deleteDraftMediaAction(input: {
  mediaIds: string[];
}): Promise<{ ok: boolean; error?: string; deleted?: number }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };

  const parsed = deleteDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const mediaIds = [...new Set(parsed.data.mediaIds)];

  const sdb = scopedDb(await resolveActor(session.user.id));
  const rows = await sdb.classSessionMedia.findMany({
    where: { id: { in: mediaIds } },
    select: { classId: true, uploadedById: true },
  });
  if (rows.length !== mediaIds.length) return { ok: false, error: "Không tìm thấy ảnh" };
  const classIds = [...new Set(rows.map((r) => r.classId))];
  if (classIds.length !== 1) return { ok: false, error: "Các ảnh phải thuộc cùng một lớp" };
  // Kho là của LỚP, không phải của người tải: ai được GỬI ảnh lớp đó (GV/trợ giảng,
  // Sale phụ trách, QL) dọn được MỌI ảnh trong kho lớp đó — kể cả ảnh Marketing/Giáo
  // vụ góp vào. Trước 11/08 luật là "không có media:approve thì chỉ xoá ảnh của
  // mình", nghĩa là GV không dọn nổi ảnh rác người khác nhét vào kho lớp mình (và
  // lô trộn thì fail cả lượt). Vai chỉ-góp-ảnh vẫn chỉ xoá được ảnh của CHÍNH MÌNH.
  const classId = classIds[0]!;
  if (!(await canPublishToClass(session.user, classId))) {
    if (!(await canStageOnlyToClass(session.user, classId))) {
      return { ok: false, error: "Không tìm thấy ảnh" };
    }
    if (rows.some((r) => r.uploadedById !== session.user.id)) {
      return { ok: false, error: "Chỉ xoá được ảnh do chính bạn đưa vào kho" };
    }
  }

  const { actorId, actorName } = getAuditActor(session);
  const res = await deleteDraftMedia({ id: actorId, name: actorName }, { mediaIds });
  if (!res.ok) return { ok: false, error: res.message };

  revalidatePath("/media");
  return { ok: true, deleted: res.deleted };
}
