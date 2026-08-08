// lib/chat/sync-membership.ts — US-03: thành viên nhóm lớp DẪN XUẤT (BR-10→BR-15).
//
// Service DUY NHẤT đồng bộ ConversationParticipant của nhóm lớp (CLASS_GROUP) từ
// dữ liệu lớp thật: GV phân công (Class.teacherId/assistantId), PH của học viên
// đang thuộc lớp, QLCS của cơ sở. Gọi từ MỌI điểm thay đổi nghiệp vụ, TRONG CÙNG
// transaction của thao tác gốc (BR-12, F-SYNC) — danh sách điểm gọi:
// docs/chat-realtime/03-sync-callsites.md.
//
// Các quyết định đã chốt (chi tiết + lý do trong 03-sync-callsites.md):
//  • "Học viên đang thuộc lớp" = ENROLLMENT_ACTIVE_STATUSES (lib/enrollment-status.ts
//    — nguồn chân lý sẵn có của roster/điểm danh): ACTIVE/CONFIRMED/STUDYING/PAUSED,
//    kèm deletedAt: null. PAUSED (bảo lưu) vẫn thuộc lớp ⇒ PH KHÔNG rời nhóm.
//  • GV = teacherId VÀ assistantId (trợ giảng cũng đứng lớp) → MODERATOR/CLASS_TEACHER.
//  • QLCS = MEMBER/CENTER_MANAGER (chốt 07/08) — hợp NHẤT 2 nguồn như tiền lệ
//    payment-reconcile: v2 UserOrgRole(role.code=CENTER_MANAGER @ OrgUnit của cơ sở)
//    ∪ v1 User.roles[] chứa CENTER_MANAGER + User.centerId = cơ sở lớp.
//  • BẪY BA (mục 5): PH nhiều con cùng lớp → MỘT bản ghi participant; leftAt CHỈ set
//    khi TẬP con đang thuộc lớp của PH đó rỗng. Học viên có 2 PH → 2 participant.
//  • Idempotent tuyệt đối (AC6): chạy lại không tạo trùng, không đổi joinedAt cũ,
//    không sinh thêm SYSTEM message. RE-JOIN = leftAt về null trên bản ghi CŨ.
//  • Chỉ đụng participant source=DERIVED. Bản ghi MANUAL (ngoại lệ Admin, BR-15)
//    không bị gỡ/ghi đè.
//  • SYSTEM message (kind=SYSTEM, senderId=null) khi GV/PH vào-rời nhóm SAU khi nhóm
//    đã tồn tại; lần sync ĐẦU (vừa tạo nhóm) không rải "đã tham gia" hàng loạt.
//    QLCS vào/rời không sinh message (không phải sự kiện lớp học). KHÔNG broadcast
//    realtime ở đây (US-06/07) — chỉ ghi DB.
//  • Ghi kép centerId + orgUnitId trên Conversation (luật Nền Hệ thống #3).
import type { Prisma } from "@prisma/client";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";

// ─── PHẦN THUẦN (không DB — unit test được) ─────────────────────────────────

export type ClassMembershipSnapshot = {
  /** User.id của GV chính + trợ giảng (null/undefined tự bỏ). */
  teacherIds: readonly (string | null | undefined)[];
  /** Học viên đang thuộc lớp + danh sách PH (User.id) của từng em. */
  students: readonly { id: string; parentIds: readonly string[] }[];
  /** User.id các QLCS của cơ sở chứa lớp. */
  centerManagerIds: readonly string[];
};

export type DesiredRole = "MODERATOR" | "MEMBER";
export type DesiredDerivedFrom =
  | "CLASS_TEACHER"
  | "CLASS_STUDENT_PARENT"
  | "CENTER_MANAGER";

export type DesiredParticipant = {
  userId: string;
  role: DesiredRole;
  derivedFrom: DesiredDerivedFrom;
};

/**
 * Tính danh sách thành viên MONG MUỐN của nhóm lớp từ snapshot lớp. Hàm THUẦN.
 *
 * Luật:
 *  • Mỗi userId đúng 1 entry — ưu tiên khi 1 người mang nhiều tư cách:
 *    CLASS_TEACHER > CLASS_STUDENT_PARENT > CENTER_MANAGER (GV kiêm PH vẫn là
 *    MODERATOR; PH kiêm QLCS giữ tư cách PH — sát quan hệ lớp học nhất).
 *  • PH có ≥2 con cùng lớp → 1 entry (bẫy BA mục 5).
 *  • Học viên có 2 PH → 2 entry riêng biệt (BR-14).
 *  • Lớp không học viên → chỉ GV + QLCS.
 */
export function computeDerivedMembership(
  snap: ClassMembershipSnapshot,
): DesiredParticipant[] {
  const out = new Map<string, DesiredParticipant>();

  // Thứ tự ghi: QLCS trước, PH đè, GV đè cuối — Map giữ entry ưu tiên cao nhất.
  for (const userId of snap.centerManagerIds) {
    if (!userId) continue;
    out.set(userId, { userId, role: "MEMBER", derivedFrom: "CENTER_MANAGER" });
  }
  for (const student of snap.students) {
    for (const parentId of student.parentIds) {
      if (!parentId) continue;
      out.set(parentId, {
        userId: parentId,
        role: "MEMBER",
        derivedFrom: "CLASS_STUDENT_PARENT",
      });
    }
  }
  for (const teacherId of snap.teacherIds) {
    if (!teacherId) continue;
    out.set(teacherId, {
      userId: teacherId,
      role: "MODERATOR",
      derivedFrom: "CLASS_TEACHER",
    });
  }
  return [...out.values()];
}

// ─── PHẦN DB (chạy TRONG transaction của caller) ────────────────────────────

type Tx = Prisma.TransactionClient;

/** Trạng thái enrollment "đang thuộc lớp" cho membership chat (alias có tên riêng). */
export const CHAT_MEMBER_ENROLLMENT_STATUSES = ENROLLMENT_ACTIVE_STATUS_LIST;

/**
 * QLCS của một cơ sở — hợp nhất v2 (UserOrgRole, prod đang enforce) ∪ v1
 * (User.roles[], local/dev/CI) theo tiền lệ getReconcileRecipients
 * (app/api/cron/payment-reconcile/route.ts). Chỉ trả tài khoản còn sống.
 */
async function resolveCenterManagerUserIds(
  tx: Tx,
  centerId: string | null,
  now = new Date(),
): Promise<string[]> {
  if (!centerId) return [];
  const ids = new Set<string>();

  // v2 — UserOrgRole @ OrgUnit (type CENTER) trỏ Center này.
  const orgUnit = await tx.orgUnit.findFirst({
    where: { centerId, deletedAt: null },
    select: { id: true },
  });
  if (orgUnit) {
    const rows = await tx.userOrgRole.findMany({
      where: {
        orgUnitId: orgUnit.id,
        status: "ACTIVE",
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        role: { code: "CENTER_MANAGER", isActive: true },
      },
      select: { userId: true },
    });
    for (const r of rows) ids.add(r.userId);
  }

  // v1 — User.roles[] chứa CENTER_MANAGER (fallback: cột role chính) + đúng cơ sở.
  const v1 = await tx.user.findMany({
    where: {
      centerId,
      deletedAt: null,
      isActive: true,
      OR: [{ roles: { has: "CENTER_MANAGER" } }, { role: "CENTER_MANAGER" }],
    },
    select: { id: true },
  });
  for (const u of v1) ids.add(u.id);

  if (ids.size === 0) return [];
  // Lọc tài khoản còn sống (người ở v2 có thể đã bị khoá/xoá).
  const alive = await tx.user.findMany({
    where: { id: { in: [...ids] }, deletedAt: null, isActive: true },
    select: { id: true },
  });
  return alive.map((u) => u.id);
}

/** Nhãn tiếng Việt cho SYSTEM message theo tư cách dẫn xuất. */
function systemLabel(derivedFrom: DesiredDerivedFrom | null): string | null {
  if (derivedFrom === "CLASS_TEACHER") return "Giáo viên";
  if (derivedFrom === "CLASS_STUDENT_PARENT") return "Phụ huynh";
  return null; // QLCS vào/rời không sinh SYSTEM message (quyết định US-03)
}

/**
 * Đồng bộ nhóm lớp cho `classId` — gọi TRONG transaction của thao tác nghiệp vụ.
 *
 * Hành vi theo trạng thái lớp:
 *  • ACTIVE          → tạo Conversation nếu chưa có (BR-01/BR-02, upsert theo unique
 *                      (type,subjectType,subjectId)); nhóm đang ARCHIVED (lớp mở lại)
 *                      → mở lại; LOCKED giữ nguyên (khoá của Admin thắng). Diff members.
 *  • COMPLETED/CANCELLED hoặc lớp xoá mềm → archive nhóm (BR-03), GIỮ NGUYÊN
 *                      participant (đọc lịch sử theo BR-04); không diff.
 *  • PLANNED/RECRUITING/PENDING_APPROVAL → chưa có nhóm thì KHÔNG tạo (BR-01);
 *                      nhóm đã tồn tại (lớp từng ACTIVE) thì vẫn diff members.
 *
 * Idempotent: chạy 2 lần liên tiếp không đổi gì (AC6).
 */
export async function syncConversationMembership(
  tx: Tx,
  classId: string,
): Promise<void> {
  const cls = await tx.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      name: true,
      status: true,
      deletedAt: true,
      centerId: true,
      orgUnitId: true,
      teacherId: true,
      assistantId: true,
    },
  });
  if (!cls) return; // lớp không tồn tại → không có gì để sync

  const convKey = {
    type: "CLASS_GROUP" as const,
    subjectType: "CLASS" as const,
    subjectId: classId,
  };
  let conv = await tx.conversation.findUnique({
    where: { type_subjectType_subjectId: convKey },
    select: { id: true, status: true },
  });

  const classEnded =
    cls.deletedAt !== null ||
    cls.status === "COMPLETED" ||
    cls.status === "CANCELLED";
  if (classEnded) {
    await archiveClassConversation(tx, classId);
    return;
  }

  let isNewConversation = false;
  if (!conv) {
    if (cls.status !== "ACTIVE") return; // BR-01: nhóm chỉ sinh khi lớp hoạt động
    // Ghi kép centerId + orgUnitId (luật Nền Hệ thống #3). Lớp cũ chưa backfill
    // orgUnitId → suy từ OrgUnit(type CENTER) trỏ centerId.
    const orgUnitId =
      cls.orgUnitId ??
      (cls.centerId
        ? (
            await tx.orgUnit.findFirst({
              where: { centerId: cls.centerId, deletedAt: null },
              select: { id: true },
            })
          )?.id ?? null
        : null);
    conv = await tx.conversation.upsert({
      where: { type_subjectType_subjectId: convKey },
      update: {}, // đã tồn tại (đua trong 2 tx) → giữ nguyên
      create: {
        ...convKey,
        status: "ACTIVE",
        centerId: cls.centerId,
        orgUnitId,
        title: cls.name,
      },
      select: { id: true, status: true },
    });
    isNewConversation = true;
  } else if (conv.status === "ARCHIVED" && cls.status === "ACTIVE") {
    // Lớp quay lại hoạt động (vd sửa nhầm trạng thái) → mở lại nhóm. LOCKED không đụng.
    await tx.conversation.update({
      where: { id: conv.id },
      data: { status: "ACTIVE", archivedAt: null },
    });
  }

  // ── Snapshot dẫn xuất từ dữ liệu lớp ──
  const students = await tx.student.findMany({
    where: {
      deletedAt: null,
      parentUserId: { not: null },
      enrollments: {
        some: {
          classId,
          deletedAt: null,
          status: { in: CHAT_MEMBER_ENROLLMENT_STATUSES },
        },
      },
    },
    select: { id: true, parentUserId: true },
  });
  const centerManagerIds = await resolveCenterManagerUserIds(tx, cls.centerId);

  const desiredRaw = computeDerivedMembership({
    teacherIds: [cls.teacherId, cls.assistantId],
    students: students.map((s) => ({
      id: s.id,
      parentIds: s.parentUserId ? [s.parentUserId] : [],
    })),
    centerManagerIds,
  });

  // Chỉ nhận user còn sống trong DB (userId trên participant không có FK — BA cố ý).
  const users = await tx.user.findMany({
    where: { id: { in: desiredRaw.map((d) => d.userId) }, deletedAt: null },
    select: { id: true, name: true, email: true, phone: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));
  const desired = desiredRaw.filter((d) => userById.has(d.userId));
  const desiredById = new Map(desired.map((d) => [d.userId, d]));

  const existing = await tx.conversationParticipant.findMany({
    where: { conversationId: conv.id },
    select: {
      id: true,
      userId: true,
      role: true,
      source: true,
      derivedFrom: true,
      leftAt: true,
    },
  });
  const existingByUserId = new Map(existing.map((p) => [p.userId, p]));

  const systemMessages: string[] = [];
  const displayName = (userId: string): string => {
    const u = userById.get(userId);
    return u?.name ?? u?.email ?? u?.phone ?? "thành viên";
  };

  // 1) Thêm mới + RE-JOIN + chỉnh role/derivedFrom lệch.
  for (const d of desired) {
    const cur = existingByUserId.get(d.userId);
    if (!cur) {
      await tx.conversationParticipant.create({
        data: {
          conversationId: conv.id,
          userId: d.userId,
          role: d.role,
          source: "DERIVED",
          derivedFrom: d.derivedFrom,
        },
      });
      if (!isNewConversation) {
        const label = systemLabel(d.derivedFrom);
        if (label) systemMessages.push(`${label} ${displayName(d.userId)} đã tham gia nhóm.`);
      }
      continue;
    }
    // BR-15: bản ghi MANUAL (Admin thêm tay) không bị service ghi đè.
    if (cur.source === "MANUAL") continue;
    if (cur.leftAt !== null) {
      // AC6/RE-JOIN: mở lại bản ghi CŨ — leftAt=null, KHÔNG đổi joinedAt, không tạo trùng.
      await tx.conversationParticipant.update({
        where: { id: cur.id },
        data: { leftAt: null, role: d.role, derivedFrom: d.derivedFrom },
      });
      const label = systemLabel(d.derivedFrom);
      if (label) systemMessages.push(`${label} ${displayName(d.userId)} đã tham gia nhóm.`);
    } else if (cur.role !== d.role || cur.derivedFrom !== d.derivedFrom) {
      // Đổi tư cách (vd PH được phân công làm GV) — chỉnh im lặng, không SYSTEM message.
      await tx.conversationParticipant.update({
        where: { id: cur.id },
        data: { role: d.role, derivedFrom: d.derivedFrom },
      });
    }
  }

  // 2) Set leftAt cho người phải rời (chỉ đụng DERIVED — BR-13: không xoá bản ghi).
  const now = new Date();
  const leavers = existing.filter(
    (p) => p.source === "DERIVED" && p.leftAt === null && !desiredById.has(p.userId),
  );
  if (leavers.length > 0) {
    const leaverUsers = await tx.user.findMany({
      where: { id: { in: leavers.map((p) => p.userId) } },
      select: { id: true, name: true, email: true, phone: true },
    });
    for (const u of leaverUsers) userById.set(u.id, u);
    for (const p of leavers) {
      await tx.conversationParticipant.update({
        where: { id: p.id },
        data: { leftAt: now },
      });
      const label = systemLabel(p.derivedFrom as DesiredDerivedFrom | null);
      if (label === "Giáo viên") {
        systemMessages.push(`Giáo viên ${displayName(p.userId)} đã được gỡ khỏi nhóm.`);
      } else if (label) {
        systemMessages.push(`${label} ${displayName(p.userId)} đã rời nhóm.`);
      }
    }
  }

  // 3) SYSTEM message (BR-22) — chỉ ghi DB, không broadcast (US-06/07 lo).
  if (systemMessages.length > 0) {
    await tx.message.createMany({
      data: systemMessages.map((body) => ({
        conversationId: conv.id,
        kind: "SYSTEM" as const,
        senderId: null,
        body,
      })),
    });
    await tx.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: now },
    });
  }
}

/**
 * Lớp kết thúc/hủy/xoá mềm → nhóm lớp chuyển ARCHIVED (BR-03: đọc được, không gửi
 * được, KHÔNG xoá; participant giữ nguyên để đọc lịch sử theo BR-04). Idempotent.
 * Nhóm đang LOCKED cũng archive — vòng đời lớp đã đóng thì trạng thái cuối là ARCHIVED.
 */
export async function archiveClassConversation(
  tx: Tx,
  classId: string,
): Promise<void> {
  const conv = await tx.conversation.findUnique({
    where: {
      type_subjectType_subjectId: {
        type: "CLASS_GROUP",
        subjectType: "CLASS",
        subjectId: classId,
      },
    },
    select: { id: true, status: true },
  });
  if (!conv || conv.status === "ARCHIVED") return;
  await tx.conversation.update({
    where: { id: conv.id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
}

/**
 * Đổi QLCS của cơ sở → đồng bộ MỌI nhóm lớp đang hoạt động của cơ sở đó, trong cùng
 * transaction với thao tác đổi vai (F-SYNC "đổi QLCS"). Số lớp ACTIVE/cơ sở nhỏ
 * (hàng chục) nên chạy tuần tự trong tx an toàn.
 */
export async function syncCenterClassConversations(
  tx: Tx,
  centerId: string | null | undefined,
): Promise<void> {
  if (!centerId) return;
  const classes = await tx.class.findMany({
    where: { centerId, deletedAt: null, status: "ACTIVE" },
    select: { id: true },
  });
  for (const c of classes) {
    await syncConversationMembership(tx, c.id);
  }
}
