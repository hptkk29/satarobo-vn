// lib/reports/lead.ts — R7-17: Báo cáo Lead (phễu SR.QD.217 mở rộng).
// HÀM THUẦN: nhận MẢNG record phẳng (đã query sẵn) → trả object số liệu.
// KHÔNG gọi DB ở đây (Vitest test không cần Postgres). Mirror style lib/crm/marketing-report.ts.

/** Record Lead phẳng cần cho báo cáo (đã select sẵn ở tầng page). */
export type LeadReportRecord = {
  status: string; // LeadStatus
  source: string | null;
  centerId: string | null;
  commissionSource: string | null; // CommissionSource | null
  createdAt: Date;
  convertedAt?: Date | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const ratio = (num: number, denom: number): number => (denom > 0 ? num / denom : 0);

/** Nhãn tiếng Việt cho từng LeadStatus (đủ mọi giá trị enum). */
export const LEAD_STATUS_LABEL: Record<string, string> = {
  NEW: "Mới",
  ASSIGNED: "Đã phân",
  CONTACTED: "Đã liên hệ",
  NO_ANSWER: "Không nghe máy",
  CONSULTING: "Đang tư vấn",
  TRIAL_SCHEDULED: "Hẹn học thử",
  TRIAL_IN_PROGRESS: "Đang học thử",
  TRIAL_ATTENDED: "Đã học thử",
  AWAITING_DECISION: "Chờ quyết định",
  ENROLLED: "Đã ghi danh",
  REGISTERED: "Đã đăng ký",
  NURTURING: "Đang nuôi dưỡng",
  LOST: "Thất bại",
  DUPLICATE: "Trùng",
  DEMO_SCHEDULED: "Hẹn demo (cũ)",
};

/** Nhãn nguồn hoa hồng. */
export const COMMISSION_SOURCE_LABEL: Record<string, string> = {
  MARKETING_ADMIN: "Marketing/Admin",
  SALE_SELF: "Sale tự khai thác",
  REFERRAL: "Giới thiệu",
};

/** Các status được coi là ĐÃ CHỐT (chuyển đổi thành công). */
export const CONVERTED_STATUSES = new Set(["ENROLLED", "REGISTERED"]);

/** Thứ tự các bước phễu chuẩn SR.QD.217 (cho FunnelChart). */
export const FUNNEL_ORDER: string[] = [
  "NEW",
  "ASSIGNED",
  "CONTACTED",
  "CONSULTING",
  "TRIAL_SCHEDULED",
  "TRIAL_ATTENDED",
  "AWAITING_DECISION",
  "ENROLLED",
];

/**
 * Rank stage phễu mà một status "đã chạm tới" (cumulative funnel).
 * Status ngoài phễu (LOST/DUPLICATE) = -1 → không tính vào phễu nhưng vẫn đếm theo status.
 */
export const STATUS_RANK: Record<string, number> = {
  NEW: 0,
  ASSIGNED: 1,
  CONTACTED: 2,
  NO_ANSWER: 2, // đã thử liên hệ
  CONSULTING: 3,
  NURTURING: 3, // đang nuôi dưỡng (đã tư vấn)
  TRIAL_SCHEDULED: 4,
  DEMO_SCHEDULED: 4, // deprecated, map vào hẹn học thử
  TRIAL_IN_PROGRESS: 4,
  TRIAL_ATTENDED: 5,
  AWAITING_DECISION: 6,
  ENROLLED: 7,
  REGISTERED: 7,
  LOST: -1,
  DUPLICATE: -1,
};

function rankOf(status: string): number {
  return STATUS_RANK[status] ?? -1;
}

function isConverted(r: LeadReportRecord): boolean {
  return CONVERTED_STATUSES.has(r.status);
}

/** "YYYY-MM" theo giờ Việt Nam (UTC+7, không DST). THUẦN. */
export function monthKeyVN(date: Date): string {
  const vn = new Date(date.getTime() + 7 * 3_600_000);
  return `${vn.getUTCFullYear()}-${pad(vn.getUTCMonth() + 1)}`;
}

export type StatusCount = { status: string; label: string; count: number };

/** Đếm lead theo từng status hiện tại (mọi enum, kể cả off-pipeline). */
export function countByStatus(records: LeadReportRecord[]): StatusCount[] {
  const m = new Map<string, number>();
  for (const r of records) m.set(r.status, (m.get(r.status) ?? 0) + 1);
  return [...m.entries()]
    .map(([status, count]) => ({ status, label: LEAD_STATUS_LABEL[status] ?? status, count }))
    .sort((a, b) => b.count - a.count);
}

export type FunnelStep = { status: string; label: string; count: number };

/**
 * Phễu cumulative: số lead ĐÃ CHẠM tới ÍT NHẤT mỗi bước (rank >= bước). THUẦN.
 * Lead ENROLLED tính ở mọi bước; lead LOST không tính (rank -1).
 */
export function buildFunnel(records: LeadReportRecord[]): FunnelStep[] {
  return FUNNEL_ORDER.map((status, i) => ({
    status,
    label: LEAD_STATUS_LABEL[status] ?? status,
    count: records.filter((r) => rankOf(r.status) >= i).length,
  }));
}

export type FunnelConversion = { fromLabel: string; toLabel: string; rate: number };

/** Tỷ lệ chuyển giữa các bước phễu liền kề (count[i+1]/count[i]). THUẦN, chia-0 an toàn. */
export function funnelConversionRates(funnel: FunnelStep[]): FunnelConversion[] {
  const out: FunnelConversion[] = [];
  for (let i = 0; i < funnel.length - 1; i++) {
    out.push({
      fromLabel: funnel[i].label,
      toLabel: funnel[i + 1].label,
      rate: ratio(funnel[i + 1].count, funnel[i].count),
    });
  }
  return out;
}

export type GroupStat = {
  key: string;
  label: string;
  total: number;
  converted: number;
  conversionRate: number;
};

const UNKNOWN_LABEL = "Không rõ";

/** Nhóm theo nguồn (source). null → "Không rõ". Kèm số chốt + tỷ lệ. THUẦN. */
export function groupBySource(records: LeadReportRecord[]): GroupStat[] {
  return groupBy(records, (r) => r.source ?? UNKNOWN_LABEL, (k) => k);
}

/** Nhóm theo nguồn hoa hồng (commissionSource). THUẦN. */
export function groupByCommissionSource(records: LeadReportRecord[]): GroupStat[] {
  return groupBy(
    records,
    (r) => r.commissionSource ?? UNKNOWN_LABEL,
    (k) => COMMISSION_SOURCE_LABEL[k] ?? k,
  );
}

/** Nhóm theo cơ sở (centerId). null → "Không rõ". `centerNames` map id→tên (optional). THUẦN. */
export function groupByCenter(
  records: LeadReportRecord[],
  centerNames?: Record<string, string>,
): GroupStat[] {
  return groupBy(
    records,
    (r) => r.centerId ?? UNKNOWN_LABEL,
    (k) => (centerNames?.[k] ?? (k === UNKNOWN_LABEL ? UNKNOWN_LABEL : k)),
  );
}

export type MonthStat = { month: string; total: number; converted: number };

/** Nhóm theo tháng tạo lead (giờ VN), sắp xếp tăng dần. THUẦN. */
export function groupByMonth(records: LeadReportRecord[]): MonthStat[] {
  const m = new Map<string, { total: number; converted: number }>();
  for (const r of records) {
    const key = monthKeyVN(r.createdAt);
    const cur = m.get(key) ?? { total: 0, converted: 0 };
    cur.total += 1;
    if (isConverted(r)) cur.converted += 1;
    m.set(key, cur);
  }
  return [...m.entries()]
    .map(([month, v]) => ({ month, total: v.total, converted: v.converted }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Helper nhóm generic (THUẦN). */
function groupBy(
  records: LeadReportRecord[],
  keyOf: (r: LeadReportRecord) => string,
  labelOf: (k: string) => string,
): GroupStat[] {
  const m = new Map<string, { total: number; converted: number }>();
  for (const r of records) {
    const key = keyOf(r);
    const cur = m.get(key) ?? { total: 0, converted: 0 };
    cur.total += 1;
    if (isConverted(r)) cur.converted += 1;
    m.set(key, cur);
  }
  return [...m.entries()]
    .map(([key, v]) => ({
      key,
      label: labelOf(key),
      total: v.total,
      converted: v.converted,
      conversionRate: ratio(v.converted, v.total),
    }))
    .sort((a, b) => b.total - a.total);
}

export type LeadReportSummary = {
  total: number;
  converted: number;
  conversionRate: number;
  /** Lead đang ở pipeline hoạt động (rank >= 0, chưa chốt và chưa LOST/DUPLICATE). */
  active: number;
  lost: number;
};

/** Tổng quan: tổng lead, số chốt, tỷ lệ chốt, đang hoạt động, thất bại. THUẦN. */
export function leadSummary(records: LeadReportRecord[]): LeadReportSummary {
  const total = records.length;
  const converted = records.filter(isConverted).length;
  const lost = records.filter((r) => rankOf(r.status) < 0).length;
  const active = total - converted - lost;
  return { total, converted, conversionRate: ratio(converted, total), active, lost };
}

export type LeadReport = {
  summary: LeadReportSummary;
  statusCounts: StatusCount[];
  funnel: FunnelStep[];
  funnelConversion: FunnelConversion[];
  bySource: GroupStat[];
  byCommissionSource: GroupStat[];
  byCenter: GroupStat[];
  byMonth: MonthStat[];
};

/** Tổng hợp toàn bộ báo cáo Lead từ mảng record phẳng. THUẦN — đầu vào rỗng → số 0. */
export function buildLeadReport(
  records: LeadReportRecord[],
  centerNames?: Record<string, string>,
): LeadReport {
  const funnel = buildFunnel(records);
  return {
    summary: leadSummary(records),
    statusCounts: countByStatus(records),
    funnel,
    funnelConversion: funnelConversionRates(funnel),
    bySource: groupBySource(records),
    byCommissionSource: groupByCommissionSource(records),
    byCenter: groupByCenter(records, centerNames),
    byMonth: groupByMonth(records),
  };
}
