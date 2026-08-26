// lib/reports/lead.ts — R7-17: Báo cáo Lead (phễu SR.QD.217 mở rộng).
// HÀM THUẦN: nhận MẢNG record phẳng (đã query sẵn) → trả object số liệu.
// KHÔNG gọi DB ở đây (Vitest test không cần Postgres). Mirror style lib/crm/marketing-report.ts.
//
// GĐ0 — import chỉ chạm @/lib/leads/status (thuần hằng số + type-only prisma), nên
// file này vẫn test được không cần Postgres.
import type { LeadStatus } from "@prisma/client";
import { CONVERTED_STATUSES, LEAD_STATUS_LABEL_SHORT } from "@/lib/leads/status";

/** Record Lead phẳng cần cho báo cáo (đã select sẵn ở tầng page). */
export type LeadReportRecord = {
  status: string; // LeadStatus
  source: string | null;
  centerId: string | null;
  commissionSource: string | null; // CommissionSource | null
  createdAt: Date;
  convertedAt?: Date | null;
  /** Bậc lead ĐANG Ở NGAY TRƯỚC khi rụng (`Lead.droppedAtStage`). */
  droppedAtStage?: string | null;
  /** Lý do rụng do người bấm ghi (`Lead.dropReason`). */
  dropReason?: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const ratio = (num: number, denom: number): number => (denom > 0 ? num / denom : 0);

/** Nhãn nguồn hoa hồng. */
export const COMMISSION_SOURCE_LABEL: Record<string, string> = {
  MARKETING_ADMIN: "Marketing/Admin",
  SALE_SELF: "Sale tự khai thác",
  REFERRAL: "Giới thiệu",
};

/**
 * GĐ0 — nhãn và tập "đã chốt" nay lấy từ nguồn duy nhất @/lib/leads/status.
 * Re-export CONVERTED_STATUSES để call-site cũ (màn marketing) không phải đổi đường
 * import; định nghĩa chỉ còn MỘT chỗ.
 */
export { CONVERTED_STATUSES };

/** Nhãn rút gọn dùng cho trục biểu đồ và phễu. */
const statusLabel = (status: string): string =>
  LEAD_STATUS_LABEL_SHORT[status as LeadStatus] ?? status;

/**
 * Thứ tự các bước phễu chuẩn SR.QD.217 (cho FunnelChart).
 *
 * GĐ5 — còn 7 bậc (trước 8). Bậc "đã phân công" biến mất vì ASSIGNED gộp vào MOI:
 * phân công nay là `Lead.assignedToId`, không phải một nấc chuyển đổi. Các bậc còn lại
 * giữ nguyên ý nghĩa, chỉ đổi tên.
 *
 * `satisfies` để một giá trị viết sai chính tả bị TypeScript bắt — danh sách này CỐ Ý
 * là tập con của enum (DANG_HOC_THU / DANG_NUOI_DUONG / DA_MAT không phải bậc phễu)
 * nên không dùng được ràng buộc đủ-mọi-giá-trị.
 */
const FUNNEL_ORDER_STRICT = [
  "MOI",
  "DA_LIEN_HE",
  "DANG_TU_VAN",
  "DA_HEN_HOC_THU",
  "DA_HOC_THU",
  "CHO_QUYET_DINH",
  "DA_DANG_KY",
] as const satisfies readonly LeadStatus[];

export const FUNNEL_ORDER: string[] = [...FUNNEL_ORDER_STRICT];

/**
 * Rank stage phễu mà một status "đã chạm tới" (cumulative funnel).
 * Status ngoài phễu (DA_MAT) = -1 → không tính vào phễu nhưng vẫn đếm theo status.
 *
 * ⚠️ Khai bằng `Record<LeadStatus, number>` rồi mới nới ra `Record<string, number>` khi
 * export: bảng này index bằng `string` (record phẳng từ page không narrow), nên nếu khai
 * thẳng kiểu nới thì THIẾU một giá trị enum sẽ không ai báo — lead rơi vào `?? -1`, biến
 * mất khỏi phễu, và biểu đồ vẫn vẽ ra số 0 trông rất bình thường. Đây đúng là cách bảng
 * cũ chết câm khi enum đổi tên ở GĐ5.
 */
const STATUS_RANK_STRICT: Record<LeadStatus, number> = {
  MOI: 0,
  DA_LIEN_HE: 1,
  DANG_TU_VAN: 2,
  DANG_NUOI_DUONG: 2, // đang nuôi dưỡng = đã tư vấn (giữ nguyên quy ước cũ của NURTURING)
  DA_HEN_HOC_THU: 3,
  DANG_HOC_THU: 3, // đang học thử chưa qua bậc "đã hẹn" (quy ước cũ của TRIAL_IN_PROGRESS)
  DA_HOC_THU: 4,
  CHO_QUYET_DINH: 5,
  DA_DANG_KY: 6,
  DA_MAT: -1,
};

export const STATUS_RANK: Record<string, number> = STATUS_RANK_STRICT;

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

/** "YYYY-MM-DD" theo giờ Việt Nam (UTC+7, không DST). THUẦN. */
export function dateKeyVN(date: Date): string {
  const vn = new Date(date.getTime() + 7 * 3_600_000);
  return `${vn.getUTCFullYear()}-${pad(vn.getUTCMonth() + 1)}-${pad(vn.getUTCDate())}`;
}

/** Nhãn ngắn "dd/MM" theo giờ Việt Nam. THUẦN. */
function dayLabelVN(date: Date): string {
  const vn = new Date(date.getTime() + 7 * 3_600_000);
  return `${pad(vn.getUTCDate())}/${pad(vn.getUTCMonth() + 1)}`;
}

export type StatusCount = { status: string; label: string; count: number };

/** Đếm lead theo từng status hiện tại (mọi enum, kể cả off-pipeline). */
export function countByStatus(records: LeadReportRecord[]): StatusCount[] {
  const m = new Map<string, number>();
  for (const r of records) m.set(r.status, (m.get(r.status) ?? 0) + 1);
  return [...m.entries()]
    .map(([status, count]) => ({ status, label: statusLabel(status), count }))
    .sort((a, b) => b.count - a.count);
}

export type FunnelStep = { status: string; label: string; count: number };

/**
 * Phễu cumulative: số lead ĐÃ CHẠM tới ÍT NHẤT mỗi bước (rank >= bước). THUẦN.
 * Lead DA_DANG_KY tính ở mọi bước; lead DA_MAT không tính (rank -1).
 */
export function buildFunnel(records: LeadReportRecord[]): FunnelStep[] {
  return FUNNEL_ORDER.map((status, i) => ({
    status,
    label: statusLabel(status),
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

const WEEK_MS = 7 * 86_400_000;

export type WeekStat = { weekStart: string; label: string; total: number; converted: number };

/**
 * Phễu lead theo TUẦN (câu 16): `weeks` tuần gần nhất (mỗi tuần = bucket 7 ngày) tính
 * đến `now`. Mỗi bucket: tổng lead tạo trong tuần + số đã chuyển đổi (DA_DANG_KY
 * ∈ CONVERTED_STATUSES). Sắp cũ→mới. THUẦN — nhận `now` để test tất định. Đầu vào rỗng →
 * vẫn trả đủ `weeks` bucket số 0.
 */
export function groupByWeek(
  records: LeadReportRecord[],
  weeks = 8,
  now: Date = new Date(),
): WeekStat[] {
  const end = now.getTime();
  const startAll = end - weeks * WEEK_MS;
  const counts = Array.from({ length: weeks }, () => ({ total: 0, converted: 0 }));
  for (const r of records) {
    const t = r.createdAt.getTime();
    // Bao gồm record tạo ĐÚNG thời điểm `now` (t === end) vào tuần hiện tại; chỉ loại
    // record ngoài cửa sổ (cũ hơn startAll) hoặc ở TƯƠNG LAI (t > end). idx clamp weeks-1.
    if (t < startAll || t > end) continue;
    const idx = Math.min(weeks - 1, Math.floor((t - startAll) / WEEK_MS));
    counts[idx].total += 1;
    if (isConverted(r)) counts[idx].converted += 1;
  }
  return counts.map((c, i) => {
    const winStart = new Date(startAll + i * WEEK_MS);
    return { weekStart: dateKeyVN(winStart), label: dayLabelVN(winStart), total: c.total, converted: c.converted };
  });
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
  /** Lead đang ở pipeline hoạt động (rank >= 0, chưa chốt và chưa DA_MAT). */
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

/** Một bậc rụng: bao nhiêu lead rời phễu ở đó và vì sao. */
export type DropStageStat = {
  stage: string;
  label: string;
  count: number;
  /** Lý do hay gặp nhất ở bậc này (đã gộp trùng, tối đa 5). */
  topReasons: { reason: string; count: number }[];
  /** Số lead rụng ở bậc này mà KHÔNG có lý do — toàn bộ đều là lead rụng TRƯỚC
   * ngày bật ép nhập lý do. Hiện riêng để không ai đọc nhầm là "không có lý do". */
  missingReason: number;
};

/**
 * "Lead rụng ở BẬC NÀO, và vì sao" — người đọc duy nhất của `Lead.droppedAtStage`
 * và `Lead.dropReason`.
 *
 * ⚠️ Hai cột đó ra đời ở GĐ1 (migration 20260825120000) và tới 26/08 KHÔNG màn nào,
 * báo cáo nào đọc — ghi vào rồi bỏ đó. Hàm này là chỗ dùng chúng.
 *
 * Chỉ đếm lead THẬT SỰ có bậc rụng: `droppedAtStage` chỉ được ghi khi lead vào
 * `LEAD_DROP_STATUSES`, nên lead còn trong phễu không lọt vào đây.
 */
export function groupByDropStage(records: LeadReportRecord[]): DropStageStat[] {
  const theoBac = new Map<string, { count: number; lyDo: Map<string, number>; thieu: number }>();
  for (const r of records) {
    const bac = r.droppedAtStage;
    if (!bac) continue;
    const o =
      theoBac.get(bac) ?? { count: 0, lyDo: new Map<string, number>(), thieu: 0 };
    o.count++;
    const ly = r.dropReason?.trim();
    if (ly) o.lyDo.set(ly, (o.lyDo.get(ly) ?? 0) + 1);
    else o.thieu++;
    theoBac.set(bac, o);
  }
  return [...theoBac.entries()]
    .map(([stage, o]) => ({
      stage,
      label: LEAD_STATUS_LABEL_SHORT[stage as LeadStatus] ?? stage,
      count: o.count,
      topReasons: [...o.lyDo.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
        .slice(0, 5),
      missingReason: o.thieu,
    }))
    // Bậc rụng nhiều nhất lên đầu — đó là chỗ đáng sửa quy trình trước.
    .sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage));
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
  byDropStage: DropStageStat[];
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
    byDropStage: groupByDropStage(records),
  };
}
