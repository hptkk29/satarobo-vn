import { db } from "@/lib/db";
import { hasRole, type Action, type CanUser } from "@/lib/auth/permissions";
import type { Actor } from "@/lib/auth/actor";
import { evaluatePermission } from "@/lib/auth/permission-eval";
import { recordPermissionShadow } from "@/lib/auth/shadow-report";
import { isRbacV2Enabled } from "@/lib/flags";
import { isChecklistComplete } from "@/lib/center-checklist";
import { getNearingEndEnrollments } from "@/lib/students/renewal";
import { getSetting } from "@/lib/settings/service";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { normalizePeriodComments } from "@/lib/lms/report-card-core";
import {
  REPORT_CARD_MILESTONES,
  milestoneLabel,
  missingMilestoneComments,
} from "@/lib/lms/report-card-milestone";
import { formatDateVN } from "@/lib/format/date";

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
  | "student_care"
  | "class_no_teacher"
  | "registered_stale"
  | "report_card_milestone";

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

/** Tham số hiển thị/ngưỡng quá hạn, resolve từ SystemSetting (dashboard.*). */
interface PendingCfg {
  itemLimit: number;
  staleMs: number;
  /**
   * Kiểm quyền THEO CỜ `RBAC_V2_ENABLED` + sinh shadow-diff.
   *
   * Trước đây file này gọi thẳng `can()` matrix v1 ⇒ (a) không sinh dòng shadow nào nên
   * lệch v1↔v2 ở đây chưa từng được kiểm, (b) sau flip #09 vẫn lọc nhóm việc theo v1.
   * Không dùng `checkPermission()` vì nó tự gọi `auth()`+`resolveActor()` — 9 lần/request
   * và làm hàm mất tính thuần. Thay vào đó caller resolve `Actor` MỘT lần rồi truyền vào.
   */
  can: (action: Action) => boolean;
}

/** Đóng gói `evaluatePermission` + ghi shadow (fire-and-forget) cho 1 request. */
function makePermChecker(user: TaskUser, actor: Actor): (action: Action) => boolean {
  const flagOn = isRbacV2Enabled();
  return (action) =>
    evaluatePermission({
      sessionUser: user,
      actor,
      action,
      flagOn,
      onEvaluated: ({ v1, v2 }) => {
        if (v1 !== v2) {
          void recordPermissionShadow({ action, userId: actor.userId, v1, v2, targetKey: null });
        }
      },
    });
}

/** Câu 08 — SLA xử lý yêu cầu phụ huynh: 12 giờ. */
const PARENT_REQUEST_SLA_MS = 12 * 60 * 60 * 1000;
/** Câu 38 — khách đã đăng ký (REGISTERED) chưa convert quá lâu → nhắc chốt ghi danh. */
const REGISTERED_STALE_DAYS = 3;
const REGISTERED_STALE_MS = REGISTERED_STALE_DAYS * 86_400_000;

function scope(user: TaskUser) {
  const isSuper = hasRole(user, "SUPER_ADMIN");
  const isCM = hasRole(user, "CENTER_MANAGER");
  const isManager = isSuper || isCM;
  // CM (không kèm SUPER_ADMIN) → giới hạn cơ sở mình; còn lại null = mọi cơ sở.
  const centerScope = isCM && !isSuper ? (user.centerId ?? null) : null;
  return { isSuper, isCM, isManager, centerScope };
}

// ─── Từng nguồn việc ─────────────────────────────────────────────────────────

async function classApproval(user: TaskUser, now: Date, cfg: PendingCfg): Promise<PendingTaskGroup | null> {
  const { isManager, centerScope } = scope(user);
  if (!isManager) return null;
  const twoDaysAgo = new Date(now.getTime() - cfg.staleMs);

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
    items: rows.slice(0, cfg.itemLimit).map((r) => ({
      id: r.id,
      label: r.classCode ? `${r.classCode} · ${r.name}` : r.name,
      href: `/classes/${r.id}/edit`,
      overdue: !!r.submittedForApprovalAt && r.submittedForApprovalAt < twoDaysAgo,
    })),
  };
}

async function timesheetAdjust(user: TaskUser, now: Date, cfg: PendingCfg): Promise<PendingTaskGroup | null> {
  if (!cfg.can("hr_attendance:adjust")) return null;
  const { centerScope } = scope(user);
  const twoDaysAgo = new Date(now.getTime() - cfg.staleMs);

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
    items: rows.slice(0, cfg.itemLimit).map((r) => ({
      id: r.id,
      label: `Chỉnh công ${formatDateVN(r.date)}`,
      href: "/cham-cong/chinh-cong",
      overdue: r.createdAt < twoDaysAgo,
    })),
  };
}

async function parentRequest(user: TaskUser, now: Date, cfg: PendingCfg): Promise<PendingTaskGroup | null> {
  if (!cfg.can("parent-requests:manage")) return null;
  const { centerScope } = scope(user);
  // Câu 08 — SLA yêu cầu phụ huynh là 12h (KHÔNG dùng staleDays chung của dashboard).
  const staleBefore = new Date(now.getTime() - PARENT_REQUEST_SLA_MS);

  const rows = await db.parentRequest.findMany({
    where: { status: "PENDING", ...(centerScope ? { student: { centerId: centerScope } } : {}) },
    select: { id: true, type: true, createdAt: true, student: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const overdueCount = rows.filter((r) => r.createdAt < staleBefore).length;
  return {
    type: "parent_request",
    label: "Yêu cầu phụ huynh",
    count: rows.length,
    overdueCount,
    href: "/parent-requests",
    items: rows.slice(0, cfg.itemLimit).map((r) => ({
      id: r.id,
      label: `${r.student.name} — ${r.type}`,
      href: r.type === "ABSENCE" ? "/parent-requests/bao-vang" : "/parent-requests",
      overdue: r.createdAt < staleBefore,
    })),
  };
}

async function mediaApproval(user: TaskUser, now: Date, cfg: PendingCfg): Promise<PendingTaskGroup | null> {
  if (!cfg.can("media:approve")) return null;
  const { centerScope } = scope(user);
  const twoDaysAgo = new Date(now.getTime() - cfg.staleMs);

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
    items: rows.slice(0, cfg.itemLimit).map((r) => ({
      id: r.id,
      label: r.fileName ?? "Ảnh lớp học",
      href: "/media",
      overdue: r.createdAt < twoDaysAgo,
    })),
  };
}

async function sessionIncomplete(user: TaskUser, now: Date, cfg: PendingCfg): Promise<PendingTaskGroup | null> {
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
    items: rows.slice(0, cfg.itemLimit).map((r) => ({
      id: r.id,
      label: `${r.class.classCode ? `${r.class.classCode} · ` : ""}${r.class.name} (${formatDateVN(r.date)})`,
      href: `/sessions/${r.id}`,
      overdue: true,
    })),
  };
}

/**
 * #17 Gap 1 (câu 55) — GV viết đánh giá kỳ ở BUỔI 5 và BUỔI 12.
 *
 * "Đạt buổi N" = lớp đã có N buổi COMPLETED (ClassSession không có số thứ tự buổi;
 * buổi CANCELLED không tính vì buổi bù là ClassSession riêng). Việc chưa xong = mốc đã
 * đạt nhưng `ReportCard.periodComments` chưa có nhận xét cho kỳ đó.
 *
 * Phạm vi: GV thấy lớp MÌNH dạy (teacher/assistant); quản lý thấy lớp trong cơ sở mình.
 * Không gate theo action — đây là "việc của tôi", lọc bằng quyền sở hữu lớp.
 */
async function reportCardMilestone(user: TaskUser, cfg: PendingCfg): Promise<PendingTaskGroup | null> {
  const { isManager, centerScope } = scope(user);
  const isTeacher = hasRole(user, "TEACHER");
  if (!isManager && !isTeacher) return null;

  const classWhere = isManager
    ? { deletedAt: null, ...(centerScope ? { centerId: centerScope } : {}) }
    : { deletedAt: null, OR: [{ teacherId: user.id }, { assistantId: user.id }] };

  const classes = await db.class.findMany({
    where: classWhere,
    select: {
      id: true,
      name: true,
      classCode: true,
      _count: { select: { sessions: { where: { status: "COMPLETED" } } } },
    },
    take: 100,
  });

  const minMilestone = REPORT_CARD_MILESTONES[0];
  const reached = classes.filter((c) => c._count.sessions >= minMilestone);
  if (reached.length === 0) return null;

  const enrollments = await db.enrollment.findMany({
    // `ACTIVE` là status LEGACY; workflow D5 dùng CONFIRMED/STUDYING/PAUSED. Lọc "ACTIVE"
    // trần sẽ bỏ sót gần hết ghi danh thật → dùng đúng hằng số chung.
    where: { classId: { in: reached.map((c) => c.id) }, status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
    select: { id: true, classId: true, student: { select: { name: true } } },
  });
  if (enrollments.length === 0) return null;

  // ReportCard là ref phẳng (enrollmentId @unique, không có relation) → query riêng.
  const cards = await db.reportCard.findMany({
    where: { enrollmentId: { in: enrollments.map((e) => e.id) } },
    select: { enrollmentId: true, periodComments: true },
  });
  const commentsByEnrollment = new Map(
    cards.map((c) => [c.enrollmentId, normalizePeriodComments(c.periodComments)]),
  );
  const completedByClass = new Map(reached.map((c) => [c.id, c._count.sessions]));
  const classById = new Map(reached.map((c) => [c.id, c]));

  const items: PendingTaskItem[] = [];
  for (const e of enrollments) {
    const completed = completedByClass.get(e.classId) ?? 0;
    const missing = missingMilestoneComments(completed, commentsByEnrollment.get(e.id) ?? []);
    for (const m of missing) {
      const cls = classById.get(e.classId)!;
      items.push({
        id: `${e.id}:${m}`,
        label: `${cls.classCode ? `${cls.classCode} · ` : ""}${e.student.name} — ${milestoneLabel(m)}`,
        href: `/report-cards/${e.id}`,
        // Buổi 12 mà chưa viết kỳ buổi 5 → trễ hẳn một kỳ.
        overdue: completed >= REPORT_CARD_MILESTONES[REPORT_CARD_MILESTONES.length - 1],
      });
    }
  }
  if (items.length === 0) return null;

  return {
    type: "report_card_milestone",
    label: "Học bạ kỳ chưa viết (buổi 5 / buổi 12)",
    count: items.length,
    overdueCount: items.filter((i) => i.overdue).length,
    href: "/report-cards",
    items: items.slice(0, cfg.itemLimit),
  };
}

async function centerChecklist(user: TaskUser, now: Date, cfg: PendingCfg): Promise<PendingTaskGroup | null> {
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
    items: missing.slice(0, cfg.itemLimit).map((c) => ({
      id: c.id,
      label: `${c.name} — chưa hoàn tất`,
      href: "/cham-cong/checklist-co-so",
      overdue: true,
    })),
  };
}

async function leadFollowup(user: TaskUser, now: Date, cfg: PendingCfg): Promise<PendingTaskGroup | null> {
  const canAll = cfg.can("leads:view-all");
  const canOwn = cfg.can("leads:view-own");
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
      take: cfg.itemLimit,
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

async function renewal(user: TaskUser, cfg: PendingCfg): Promise<PendingTaskGroup | null> {
  const canAll = cfg.can("enrollments:view-all");
  if (!canAll && !cfg.can("enrollments:view-own")) return null;
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
    items: list.slice(0, cfg.itemLimit).map((i) => ({
      id: i.enrollmentId,
      label: `${i.studentName} — còn ${i.remaining} buổi`,
      href: `/students/${i.studentId}/edit`,
      overdue: i.remaining <= 2,
    })),
  };
}

async function studentRisk(user: TaskUser, now: Date, cfg: PendingCfg): Promise<PendingTaskGroup | null> {
  const { isManager, centerScope } = scope(user);
  if (!isManager) return null;
  const twoDaysAgo = new Date(now.getTime() - cfg.staleMs);
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
    items: rows.slice(0, cfg.itemLimit).map((r) => ({
      id: r.id,
      label: `${r.student.name} — ${r.type}`,
      href: `/students/${r.student.id}/edit`,
      overdue: r.severity === "HIGH",
    })),
  };
}

async function studentCare(user: TaskUser, now: Date, cfg: PendingCfg): Promise<PendingTaskGroup | null> {
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
    items: rows.slice(0, cfg.itemLimit).map((r) => ({
      id: r.id,
      label: r.title,
      href: `/students/${r.student.id}/edit`,
      overdue: r.dueAt < now,
    })),
  };
}

async function classNoTeacher(user: TaskUser, now: Date, cfg: PendingCfg): Promise<PendingTaskGroup | null> {
  const { isManager, centerScope } = scope(user);
  if (!isManager) return null;
  // Buổi NGÀY MAI chưa có GV (class.teacherId null) và không có GV thực/dạy-thay.
  const startTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const endTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);

  const rows = await db.classSession.findMany({
    where: {
      date: { gte: startTomorrow, lt: endTomorrow },
      status: { not: "CANCELLED" },
      actualTeacherId: null,
      substituteTeacherId: null,
      // Lọc lớp chưa gán GV + cách ly cơ sở qua class.centerId (ClassSession gắn lớp).
      class: { teacherId: null, deletedAt: null, ...(centerScope ? { centerId: centerScope } : {}) },
    },
    select: { id: true, date: true, class: { select: { name: true, classCode: true } } },
    orderBy: { date: "asc" },
    take: 50,
  });
  return {
    type: "class_no_teacher",
    label: "Lớp thiếu GV ngày mai",
    count: rows.length,
    overdueCount: rows.length, // ngày mai đã thiếu GV → cần xử lý gấp
    href: "/sessions",
    items: rows.slice(0, cfg.itemLimit).map((r) => ({
      id: r.id,
      label: `${r.class.classCode ? `${r.class.classCode} · ` : ""}${r.class.name} (${formatDateVN(r.date)})`,
      href: `/sessions/${r.id}`,
      overdue: true,
    })),
  };
}

async function registeredStale(user: TaskUser, now: Date, cfg: PendingCfg): Promise<PendingTaskGroup | null> {
  // Câu 38 — khách đã "Đã đăng ký" (REGISTERED) nhưng chưa chốt ghi danh quá lâu.
  const canAll = cfg.can("leads:view-all");
  const canOwn = cfg.can("leads:view-own");
  if (!canAll && !canOwn) return null;
  const { isSuper, isCM } = scope(user);
  const centerScope = isCM && !isSuper ? (user.centerId ?? null) : null;
  const selfOnly = !canAll && canOwn; // SALES_CSM (chỉ view-own) → khách của mình.
  const staleBefore = new Date(now.getTime() - REGISTERED_STALE_MS);

  const rows = await db.lead.findMany({
    where: {
      deletedAt: null,
      status: "REGISTERED",
      // updatedAt = mốc gần nhất chạm lead (proxy thời gian nằm ở REGISTERED — schema không
      // có status-history riêng). Quá REGISTERED_STALE_DAYS → nhắc chốt.
      updatedAt: { lt: staleBefore },
      ...(selfOnly ? { assignedToId: user.id } : centerScope ? { centerId: centerScope } : {}),
    },
    select: { id: true, parentName: true, childName: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  return {
    type: "registered_stale",
    label: "Khách đã đăng ký quá lâu",
    count: rows.length,
    overdueCount: rows.length,
    href: "/leads?status=REGISTERED",
    items: rows.slice(0, cfg.itemLimit).map((r) => ({
      id: r.id,
      label: `${r.childName ?? r.parentName} — chưa chốt ghi danh`,
      href: `/leads/${r.id}`,
      overdue: true,
    })),
  };
}

/**
 * Gom mọi loại việc cần xử lý theo quyền + cơ sở của user. Trả về các nhóm
 * (chỉ nhóm user có quyền), sắp xếp nhóm có việc QUÁ HẠN lên đầu.
 */
export async function getPendingTasks(user: TaskUser, actor: Actor): Promise<PendingTaskGroup[]> {
  const now = new Date();
  const [itemLimit, staleDays] = await Promise.all([
    getSetting("dashboard.pendingItemLimit"),
    getSetting("dashboard.pendingStaleDays"),
  ]);
  const cfg: PendingCfg = {
    itemLimit,
    staleMs: staleDays * 86400000,
    can: makePermChecker(user, actor),
  };
  const groups = await Promise.all([
    classApproval(user, now, cfg),
    timesheetAdjust(user, now, cfg),
    parentRequest(user, now, cfg),
    mediaApproval(user, now, cfg),
    sessionIncomplete(user, now, cfg),
    centerChecklist(user, now, cfg),
    leadFollowup(user, now, cfg),
    renewal(user, cfg),
    studentRisk(user, now, cfg),
    studentCare(user, now, cfg),
    classNoTeacher(user, now, cfg),
    reportCardMilestone(user, cfg),
    registeredStale(user, now, cfg),
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
