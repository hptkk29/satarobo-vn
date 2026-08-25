// lib/reports/trial.ts — R7-17 Báo cáo lớp trải nghiệm (THUẦN — không chạm DB).
// Nhận MẢNG record phẳng đã query sẵn → trả object số liệu. Mirror style
// lib/crm/marketing-report.ts (helper THUẦN, test Vitest không cần Postgres).

// lib/leads/status.ts chỉ import `type LeadStatus` nên vẫn THUẦN — import được ở đây
// mà không kéo theo Prisma runtime/DB.
import type { LeadStatus } from "@prisma/client";
import { CONVERTED_STATUSES } from "@/lib/leads/status";

/** TrialClassV2 (đã select). status: OPEN/RUNNING/COMPLETED/CANCELLED. */
export type TrialClassRec = {
  id: string;
  centerId: string;
  capacity: number;
  status: string;
  sessionCount: number;
};

/** TrialEnrollment đã làm phẳng (join LeadChild.trialStatus + Lead.status). */
export type TrialEnrollmentRec = {
  id: string;
  trialClassId: string;
  leadChildId: string;
  /** TrialEnrollmentStatus: ACTIVE/COMPLETED/WITHDRAWN. */
  status: string;
  /** LeadChildTrialStatus: NONE/SCHEDULED/IN_PROGRESS/ATTENDED. */
  leadChildTrialStatus: string;
  /**
   * Lead.status (DA_DANG_KY = đã đăng ký — xem CONVERTED_STATUSES).
   *
   * ⚠️ Khai `LeadStatus | null` chứ KHÔNG phải `string | null`: call-site đưa vào đúng
   * giá trị enum, còn kiểu string khiến fixture test viết giá trị enum đã chết mà tsc
   * vẫn xanh — đó chính là cách bug 0% ở đây sống sót qua GĐ5.
   */
  leadStatus: LeadStatus | null;
};

/** TrialAttendance đã select. status: PRESENT/ABSENT. */
export type TrialAttendanceRec = {
  trialEnrollmentId: string;
  status: string;
};

export type TrialReportInput = {
  classes: TrialClassRec[];
  enrollments: TrialEnrollmentRec[];
  attendances: TrialAttendanceRec[];
};

export type CenterTrialStats = {
  centerId: string;
  classes: number;
  capacity: number;
  filled: number;
  fillRate: number;
  attended: number;
  registered: number;
  conversionRate: number;
  fullAttendance: number;
  fullAttendanceRate: number;
};

export type TrialReport = {
  totals: {
    classes: number;
    enrollments: number;
    capacity: number;
    filled: number;
    fillRate: number;
  };
  /** Dự đủ N buổi (số PRESENT >= sessionCount của lớp). */
  attendance: { total: number; full: number; fullRate: number };
  /** ATTENDED → DA_DANG_KY (theo LeadChild duy nhất). */
  conversion: { attended: number; registered: number; rate: number };
  enrollmentStatus: { active: number; completed: number; withdrawn: number };
  /** Phễu trạng thái học thử (theo LeadChild duy nhất). */
  funnel: { scheduled: number; inProgress: number; attended: number };
  byCenter: CenterTrialStats[];
};

/**
 * Lead đã đăng ký (đếm là "chuyển đổi" từ trial).
 *
 * ⚠️ Lấy thẳng từ `CONVERTED_STATUSES` — nguồn sự thật DUY NHẤT ở lib/leads/status.ts.
 * Trước GĐ5 đây là `new Set(["REGISTERED", "ENROLLED"])` chép tay; vì `leadStatus` của
 * record phẳng khai `string | null` nên TypeScript KHÔNG hề đỏ khi enum đổi tên, và cả
 * báo cáo học thử lặng lẽ vẽ chuyển đổi 0% (tổng lẫn từng cơ sở). Đừng chép lại danh
 * sách vào đây lần nữa — mọi lần đổi enum phải chỉ sửa đúng một chỗ.
 */
const REGISTERED_LEAD_STATUSES = CONVERTED_STATUSES;
/** Enrollment chiếm chỗ (lấp đầy) — không tính WITHDRAWN. */
const FILLED_STATUSES = new Set(["ACTIVE", "COMPLETED"]);

/** Tỷ lệ % làm tròn 1 chữ số (THUẦN). d=0 → 0. */
export function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** Map enrollmentId → số buổi PRESENT (THUẦN). */
export function presentCountByEnrollment(
  attendances: TrialAttendanceRec[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of attendances) {
    if (a.status === "PRESENT") {
      m.set(a.trialEnrollmentId, (m.get(a.trialEnrollmentId) ?? 0) + 1);
    }
  }
  return m;
}

/** Build toàn bộ báo cáo trial (THUẦN — fixture test được, không cần DB). */
export function buildTrialReport(input: TrialReportInput): TrialReport {
  const { classes, enrollments, attendances } = input;
  const classById = new Map(classes.map((c) => [c.id, c]));
  const presentMap = presentCountByEnrollment(attendances);

  // ── totals ───────────────────────────────────────────────────────────────
  const totalCapacity = classes.reduce((s, c) => s + (c.capacity ?? 0), 0);
  const filled = enrollments.filter((e) => FILLED_STATUSES.has(e.status)).length;

  // ── enrollment status ─────────────────────────────────────────────────────
  const enrollmentStatus = { active: 0, completed: 0, withdrawn: 0 };
  for (const e of enrollments) {
    if (e.status === "ACTIVE") enrollmentStatus.active += 1;
    else if (e.status === "COMPLETED") enrollmentStatus.completed += 1;
    else if (e.status === "WITHDRAWN") enrollmentStatus.withdrawn += 1;
  }

  // ── dự đủ N buổi ───────────────────────────────────────────────────────────
  let fullAttendance = 0;
  for (const e of enrollments) {
    const cls = classById.get(e.trialClassId);
    const required = cls?.sessionCount ?? 0;
    if (required > 0 && (presentMap.get(e.id) ?? 0) >= required) fullAttendance += 1;
  }

  // ── phễu + chuyển đổi (theo LeadChild duy nhất) ────────────────────────────
  const childTrialStatus = new Map<string, string>();
  const childLeadStatus = new Map<string, string | null>();
  const childCenter = new Map<string, string>();
  for (const e of enrollments) {
    // giữ trạng thái "tiến xa nhất" không cần — mỗi child ~1 trial enrollment.
    childTrialStatus.set(e.leadChildId, e.leadChildTrialStatus);
    childLeadStatus.set(e.leadChildId, e.leadStatus);
    const cls = classById.get(e.trialClassId);
    if (cls) childCenter.set(e.leadChildId, cls.centerId);
  }

  const funnel = { scheduled: 0, inProgress: 0, attended: 0 };
  let attended = 0;
  let registered = 0;
  for (const [childId, st] of childTrialStatus) {
    if (st === "SCHEDULED") funnel.scheduled += 1;
    else if (st === "IN_PROGRESS") funnel.inProgress += 1;
    else if (st === "ATTENDED") {
      funnel.attended += 1;
      attended += 1;
      const ls = childLeadStatus.get(childId);
      if (ls && REGISTERED_LEAD_STATUSES.has(ls)) registered += 1;
    }
  }

  // ── theo cơ sở ─────────────────────────────────────────────────────────────
  const centers = new Map<string, CenterTrialStats>();
  const ensure = (centerId: string): CenterTrialStats => {
    let c = centers.get(centerId);
    if (!c) {
      c = {
        centerId,
        classes: 0,
        capacity: 0,
        filled: 0,
        fillRate: 0,
        attended: 0,
        registered: 0,
        conversionRate: 0,
        fullAttendance: 0,
        fullAttendanceRate: 0,
      };
      centers.set(centerId, c);
    }
    return c;
  };
  // số liệu lớp
  for (const cls of classes) {
    const c = ensure(cls.centerId);
    c.classes += 1;
    c.capacity += cls.capacity ?? 0;
  }
  // số liệu enrollment
  const centerEnrollTotal = new Map<string, number>();
  for (const e of enrollments) {
    const cls = classById.get(e.trialClassId);
    if (!cls) continue;
    const c = ensure(cls.centerId);
    if (FILLED_STATUSES.has(e.status)) c.filled += 1;
    centerEnrollTotal.set(cls.centerId, (centerEnrollTotal.get(cls.centerId) ?? 0) + 1);
    const required = cls.sessionCount ?? 0;
    if (required > 0 && (presentMap.get(e.id) ?? 0) >= required) c.fullAttendance += 1;
  }
  // chuyển đổi theo cơ sở (theo child)
  for (const [childId, st] of childTrialStatus) {
    if (st !== "ATTENDED") continue;
    const centerId = childCenter.get(childId);
    if (!centerId) continue;
    const c = ensure(centerId);
    c.attended += 1;
    const ls = childLeadStatus.get(childId);
    if (ls && REGISTERED_LEAD_STATUSES.has(ls)) c.registered += 1;
  }
  for (const c of centers.values()) {
    c.fillRate = pct(c.filled, c.capacity);
    c.conversionRate = pct(c.registered, c.attended);
    c.fullAttendanceRate = pct(
      c.fullAttendance,
      centerEnrollTotal.get(c.centerId) ?? 0,
    );
  }

  return {
    totals: {
      classes: classes.length,
      enrollments: enrollments.length,
      capacity: totalCapacity,
      filled,
      fillRate: pct(filled, totalCapacity),
    },
    attendance: {
      total: enrollments.length,
      full: fullAttendance,
      fullRate: pct(fullAttendance, enrollments.length),
    },
    conversion: { attended, registered, rate: pct(registered, attended) },
    enrollmentStatus,
    funnel,
    byCenter: [...centers.values()].sort((a, b) =>
      a.centerId.localeCompare(b.centerId),
    ),
  };
}
