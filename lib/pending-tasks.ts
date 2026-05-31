import { db } from "@/lib/db";
import { can, hasRole, type CanUser } from "@/lib/auth/permissions";
import { isChecklistComplete } from "@/lib/center-checklist";
import { getNearingEndEnrollments } from "@/lib/students/renewal";

// =============================================================================
// MODULE TRUNG TÂM PHÊ DUYỆT & NHẮC VIỆC — PHẦN 1
// getPendingTasks(user) gom MỌI loại "việc cần xử lý" từ các module khác, lọc
// theo QUYỀN + CƠ SỞ của user. Mỗi loại: { type, label, count, overdueCount,
// href, items[] }. Chỉ trả về loại việc thuộc quyền user.
// =============================================================================

export type PendingTaskType =
  | "class_approval"
  | "timesheet_adjust"
  | "parent_request"
  | "media_approval"
  | "session_incomplete"
  | "center_checklist"
  | "lead_followup"
  | "renewal"
  | "student_risk"
  | "student_care";

export interface PendingTaskItem {
  id: string;
  label: string;
  href: string;
  overdue?: boolean;
}

export interface PendingTaskGroup {
  type: PendingTaskType;
  label: string;
  count: number;
  overdueCount: number;
  href: string;
  items: PendingTaskItem[];
}

export type TaskUser = CanUser & {
  id: string;
  centerId?: string | null;
};

const ITEM_LIMIT = 6;
const TWO_DAYS_MS = 2 * 86400000;

function scope(user: TaskUser) {
  const isSuper = hasRole(user, "SUPER_ADMIN");
  const isCM = hasRole(user, "CENTER_MANAGER");
  const isManager = isSuper || isCM;
  // CM (không kèm SUPER_ADMIN) → giới hạn cơ sở mình; còn lại null = mọi cơ sở.
  const centerScope = isCM && !isSuper ? (user.centerId ?? null) : null;
  return { isSuper, isCM, isManager, centerScope };
}

// ─── Từng nguồn việc ─────────────────────────────────────────────────────────

async function classApproval(user: TaskUser, now: Date): Promise<PendingTaskGroup | null> {
  const { isManager, centerScope } = scope(user);
  if (!isManager) return null;
  const twoDaysAgo = new Date(now.getTime() - TWO_DAYS_MS);

  const rows = await db.class.findMany({
    where: { status: "PENDING_APPROVAL", deletedAt: null, ...(centerScope ? { centerId: centerScope } : {}) },
    select: { id: true, name: true, classCode: true, submittedForApprovalAt: true },
    orderBy: { submittedForApprovalAt: "asc" },
    take: 50,
  });
  const overdueCount = rows.filter((r) => r.submittedForApprovalAt && r.submittedForApprovalAt < twoDaysAgo).length;
  return {
    type: "class_approval",
    label: "Lớp chờ duyệt",
    count: rows.length,
    overdueCount,
    href: "/classes?status=PENDING_APPROVAL",
    items: rows.slice(0, ITEM_LIMIT).map((r) => ({
      id: r.id,
      label: r.classCode ? `${r.classCode} · ${r.name}` : r.name,
      href: `/classes/${r.id}/edit`,
      overdue: !!r.submittedForApprovalAt && r.submittedForApprovalAt < twoDaysAgo,
    })),
  };
}

async function timesheetAdjust(user: TaskUser, now: Date): Promise<PendingTaskGroup | null> {
  if (!can(user, "hr_attendance:adjust")) return null;
  const { centerScope } = scope(user);
  const twoDaysAgo = new Date(now.getTime() - TWO_DAYS_MS);

  const rows = await db.timesheetAdjustmentRequest.findMany({
    where: { status: "PENDING", ...(centerScope ? { centerId: centerScope } : {}) },
    select: { id: true, date: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const overdueCount = rows.filter((r) => r.createdAt < twoDaysAgo).length;
  return {
    type: "timesheet_adjust",
    label: "Yêu cầu chỉnh công",
    count: rows.length,
    overdueCount,
    href: "/cham-cong/chinh-cong",
    items: rows.slice(0, ITEM_LIMIT).map((r) => ({
      id: r.id,
      label: `Chỉnh công ${new Date(r.date).toLocaleDateString("vi-VN")}`,
      href: "/cham-cong/chinh-cong",
      overdue: r.createdAt < twoDaysAgo,
    })),
  };
}

async function parentRequest(user: TaskUser, now: Date): Promise<PendingTaskGroup | null> {
  if (!can(user, "parent-requests:manage")) return null;
  const { centerScope } = scope(user);
  const twoDaysAgo = new Date(now.getTime() - TWO_DAYS_MS);

  const rows = await db.parentRequest.findMany({
    where: { status: "PENDING", ...(centerScope ? { student: { centerId: centerScope } } : {}) },
    select: { id: true, type: true, createdAt: true, student: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const overdueCount = rows.filter((r) => r.createdAt < twoDaysAgo).length;
  return {
    type: "parent_request",
    label: "Yêu cầu phụ huynh",
    count: rows.length,
    overdueCount,
    href: "/parent-requests",
    items: rows.slice(0, ITEM_LIMIT).map((r) => ({
      id: r.id,
      label: `${r.student.name} — ${r.type}`,
      href: r.type === "ABSENCE" ? "/parent-requests/bao-vang" : "/parent-requests",
      overdue: r.createdAt < twoDaysAgo,
    })),
  };
}

async function mediaApproval(user: TaskUser, now: Date): Promise<PendingTaskGroup | null> {
  if (!can(user, "media:approve")) return null;
  const { centerScope } = scope(user);
  const twoDaysAgo = new Date(now.getTime() - TWO_DAYS_MS);

  // ClassSessionMedia.classId là cột phẳng → lọc cơ sở qua tập classId trong cơ sở.
  let classFilter: { classId: { in: string[] } } | undefined;
  if (centerScope) {
    const classes = await db.class.findMany({ where: { centerId: centerScope, deletedAt: null }, select: { id: true } });
    classFilter = { classId: { in: classes.map((c) => c.id) } };
  }
  const rows = await db.classSessionMedia.findMany({
    where: { status: "PENDING", ...(classFilter ?? {}) },
    select: { id: true, fileName: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const overdueCount = rows.filter((r) => r.createdAt < twoDaysAgo).length;
  return {
    type: "media_approval",
    label: "Ảnh chờ duyệt",
    count: rows.length,
    overdueCount,
    href: "/media",
    items: rows.slice(0, ITEM_LIMIT).map((r) => ({
      id: r.id,
      label: r.fileName ?? "Ảnh lớp học",
      href: "/media",
      overdue: r.createdAt < twoDaysAgo,
    })),
  };
}

async function sessionIncomplete(user: TaskUser, now: Date): Promise<PendingTaskGroup | null> {
  const { isManager, centerScope } = scope(user);
  if (!isManager) return null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const rows = await db.classSession.findMany({
    where: {
      date: { lt: startOfToday },
      status: { not: "COMPLETED" },
      ...(centerScope ? { class: { centerId: centerScope } } : {}),
    },
    select: { id: true, date: true, class: { select: { name: true, classCode: true } } },
    orderBy: { date: "desc" },
    take: 50,
  });
  return {
    type: "session_incomplete",
    label: "Buổi học chưa hoàn tất",
    count: rows.length,
    overdueCount: rows.length, // quá ngày mà chưa xong → đều quá hạn
    href: "/sessions",
    items: rows.slice(0, ITEM_LIMIT).map((r) => ({
      id: r.id,
      label: `${r.class.classCode ? `${r.class.classCode} · ` : ""}${r.class.name} (${new Date(r.date).toLocaleDateString("vi-VN")})`,
      href: `/sessions/${r.id}`,
      overdue: true,
    })),
  };
}

async function centerChecklist(user: TaskUser, now: Date): Promise<PendingTaskGroup | null> {
  const { isManager, centerScope } = scope(user);
  if (!isManager) return null;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

  const centers = centerScope
    ? await db.center.findMany({ where: { id: centerScope }, select: { id: true, name: true } })
    : await db.center.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  if (centers.length === 0) return { type: "center_checklist", label: "Checklist cơ sở hôm qua", count: 0, overdueCount: 0, href: "/cham-cong/checklist-co-so", items: [] };

  const checklists = await db.centerDayChecklist.findMany({
    where: { date: yesterday, centerId: { in: centers.map((c) => c.id) } },
  });
  const complete = new Set(checklists.filter((c) => isChecklistComplete(c)).map((c) => c.centerId));
  const missing = centers.filter((c) => !complete.has(c.id));
  return {
    type: "center_checklist",
    label: "Checklist cơ sở hôm qua",
    count: missing.length,
    overdueCount: missing.length,
    href: "/cham-cong/checklist-co-so",
    items: missing.slice(0, ITEM_LIMIT).map((c) => ({
      id: c.id,
      label: `${c.name} — chưa hoàn tất`,
      href: "/cham-cong/checklist-co-so",
      overdue: true,
    })),
  };
}

async function leadFollowup(user: TaskUser, now: Date): Promise<PendingTaskGroup | null> {
  const canAll = can(user, "leads:view-all");
  const canOwn = can(user, "leads:view-own");
  if (!canAll && !canOwn) return null;
  const { isSuper, isCM } = scope(user);
  const centerScope = isCM && !isSuper ? (user.centerId ?? null) : null;
  // SALES_CSM (chỉ view-own) → lead của mình.
  const selfOnly = !canAll && canOwn;

  const baseWhere = {
    deletedAt: null,
    ...(selfOnly ? { assignedToId: user.id } : centerScope ? { centerId: centerScope } : {}),
  };

  const [newLeads, overdueLeads, items] = await Promise.all([
    db.lead.count({ where: { ...baseWhere, status: "NEW" } }),
    db.lead.count({ where: { ...baseWhere, tasks: { some: { status: "OPEN", dueAt: { lt: now } } } } }),
    db.lead.findMany({
      where: {
        ...baseWhere,
        OR: [{ status: "NEW" }, { tasks: { some: { status: "OPEN", dueAt: { lt: now } } } }],
      },
      select: { id: true, parentName: true, status: true },
      orderBy: { createdAt: "asc" },
      take: ITEM_LIMIT,
    }),
  ]);
  const count = newLeads + overdueLeads;
  if (count === 0 && items.length === 0) {
    return { type: "lead_followup", label: "Lead cần xử lý", count: 0, overdueCount: 0, href: "/leads", items: [] };
  }
  return {
    type: "lead_followup",
    label: "Lead cần xử lý",
    count,
    overdueCount: overdueLeads,
    href: "/leads",
    items: items.map((l) => ({
      id: l.id,
      label: `${l.parentName}${l.status === "NEW" ? " (mới)" : ""}`,
      href: `/leads/${l.id}`,
    })),
  };
}

async function renewal(user: TaskUser): Promise<PendingTaskGroup | null> {
  const canAll = can(user, "enrollments:view-all");
  if (!canAll && !can(user, "enrollments:view-own")) return null;
  const { isSuper, isCM } = scope(user);
  const centerScope = isCM && !isSuper ? (user.centerId ?? null) : null;

  const list = await getNearingEndEnrollments({ centerId: centerScope });
  const overdueCount = list.filter((i) => i.remaining <= 2).length;
  return {
    type: "renewal",
    label: "Học viên sắp hết khoá",
    count: list.length,
    overdueCount,
    href: "/students/sap-het-khoa",
    items: list.slice(0, ITEM_LIMIT).map((i) => ({
      id: i.enrollmentId,
      label: `${i.studentName} — còn ${i.remaining} buổi`,
      href: `/students/${i.studentId}/edit`,
      overdue: i.remaining <= 2,
    })),
  };
}

async function studentRisk(user: TaskUser, now: Date): Promise<PendingTaskGroup | null> {
  const { isManager, centerScope } = scope(user);
  if (!isManager) return null;
  const twoDaysAgo = new Date(now.getTime() - TWO_DAYS_MS);
  const rows = await db.studentRiskAlert.findMany({
    where: { status: "OPEN", ...(centerScope ? { centerId: centerScope } : {}) },
    select: { id: true, type: true, severity: true, createdAt: true, student: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const overdueCount = rows.filter((r) => r.severity === "HIGH" || r.createdAt < twoDaysAgo).length;
  return {
    type: "student_risk",
    label: "Cảnh báo rủi ro HV",
    count: rows.length,
    overdueCount,
    href: "/canh-bao-rui-ro",
    items: rows.slice(0, ITEM_LIMIT).map((r) => ({
      id: r.id,
      label: `${r.student.name} — ${r.type}`,
      href: `/students/${r.student.id}/edit`,
      overdue: r.severity === "HIGH",
    })),
  };
}

async function studentCare(user: TaskUser, now: Date): Promise<PendingTaskGroup | null> {
  const { isSuper, isCM } = scope(user);
  const isSales = hasRole(user, "SALES_CSM");
  if (!isSuper && !isCM && !isSales) return null;
  const centerScope = isCM && !isSuper ? (user.centerId ?? null) : null;
  // SALES (không quản lý) → task của mình; CM → cơ sở; super → tất cả.
  const where = isSales && !isSuper && !isCM
    ? { status: "OPEN" as const, assignedToId: user.id }
    : { status: "OPEN" as const, ...(centerScope ? { centerId: centerScope } : {}) };

  const rows = await db.studentCareTask.findMany({
    where,
    select: { id: true, title: true, dueAt: true, student: { select: { id: true } } },
    orderBy: { dueAt: "asc" },
    take: 50,
  });
  const overdueCount = rows.filter((r) => r.dueAt < now).length;
  return {
    type: "student_care",
    label: "Việc chăm sóc HV",
    count: rows.length,
    overdueCount,
    href: "/cham-soc-hv",
    items: rows.slice(0, ITEM_LIMIT).map((r) => ({
      id: r.id,
      label: r.title,
      href: `/students/${r.student.id}/edit`,
      overdue: r.dueAt < now,
    })),
  };
}

/**
 * Gom mọi loại việc cần xử lý theo quyền + cơ sở của user. Trả về các nhóm
 * (chỉ nhóm user có quyền), sắp xếp nhóm có việc QUÁ HẠN lên đầu.
 */
export async function getPendingTasks(user: TaskUser): Promise<PendingTaskGroup[]> {
  const now = new Date();
  const groups = await Promise.all([
    classApproval(user, now),
    timesheetAdjust(user, now),
    parentRequest(user, now),
    mediaApproval(user, now),
    sessionIncomplete(user, now),
    centerChecklist(user, now),
    leadFollowup(user, now),
    renewal(user),
    studentRisk(user, now),
    studentCare(user, now),
  ]);
  return groups
    .filter((g): g is PendingTaskGroup => g !== null)
    .sort((a, b) => b.overdueCount - a.overdueCount || b.count - a.count);
}

/** Tổng số việc + tổng quá hạn (cho badge). */
export function summarizePendingTasks(groups: PendingTaskGroup[]): { total: number; overdue: number } {
  return groups.reduce(
    (acc, g) => ({ total: acc.total + g.count, overdue: acc.overdue + g.overdueCount }),
    { total: 0, overdue: 0 },
  );
}
