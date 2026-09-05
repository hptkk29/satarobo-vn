// lib/cham-cong/catalog.ts — Danh mục 21 mã ca theo tab DANH MỤC CA của Sheet lịch phân ca
// (29/08/2026). THUẦN — không DB. Đây là dữ liệu SEED NỀN chạy 1 lần (prisma/seed-cham-cong.ts);
// sau đó nguồn sự thật là bảng `ShiftTemplate` và người vận hành sửa trên màn danh mục
// (PHẦN 6b). Engine tính công đọc `segments`, không đọc file này.
//
// Giờ kế hoạch theo Sheet (K-01 "theo Sheet", chốt 05/09): S 07:45–11:30 · C 13:45–17:30 ·
// T 17:15–21:00 (C/T chồng 15′ — ghép cặp theo thứ tự lượt, không theo "gần mốc nhất").
// CS nghỉ giữa giờ 16:30–17:00 TÍNH công (PAID_BREAK). Mọi mã làm việc = 1 công; X/P = 0.

export type SegmentKind = "WORK" | "PAID_BREAK";

/** Nơi làm của một đoạn ca. `HOME` = cơ sở của đơn vị người đó trên Sheet. */
export type PlaceToken =
  | "HOME"
  | `CENTER:${string}`
  | "ANY_CENTER"
  | "ASSIGNED"
  | "OFFSITE"
  | "ANYWHERE";

export type ShiftSegment = {
  /** "HH:mm" giờ VN. */
  start: string;
  end: string;
  kind: SegmentKind;
  /** Bỏ trống = theo `defaultPlace` của mã. */
  place?: PlaceToken;
};

export type ShiftTemplateKindT = "TIMED" | "LOCATION_ONLY" | "FLEXIBLE" | "OFF" | "LEAVE";
export type AttendanceModeT = "REQUIRED" | "OPTIONAL" | "NONE";
export type PayModeT = "SHIFT" | "ADMIN_HOURS" | "NONE";

export type CatalogEntry = {
  code: string;
  name: string;
  kind: ShiftTemplateKindT;
  segments: ShiftSegment[];
  defaultPlace: PlaceToken;
  attendanceMode: AttendanceModeT;
  dayCredit: number;
  isLeave: boolean;
  nominalMinutes: number | null;
  payMode: PayModeT;
  /** Cột hiển thị cho màn danh mục — chép nguyên chữ Sheet. */
  amStart?: string;
  amEnd?: string;
  pmStart?: string;
  pmEnd?: string;
  pmBreakStart?: string;
  pmBreakEnd?: string;
  note?: string;
  displayOrder: number;
};

const W = (start: string, end: string, place?: PlaceToken): ShiftSegment =>
  place ? { start, end, kind: "WORK", place } : { start, end, kind: "WORK" };
const BREAK = (start: string, end: string): ShiftSegment => ({ start, end, kind: "PAID_BREAK" });

function timed(
  code: string,
  name: string,
  segments: ShiftSegment[],
  extra: Partial<CatalogEntry> = {},
): CatalogEntry {
  const am = segments.filter((s) => toMinutes(s.start) < 12 * 60);
  const pm = segments.filter((s) => toMinutes(s.start) >= 12 * 60);
  return {
    code,
    name,
    kind: "TIMED",
    segments,
    defaultPlace: "HOME",
    attendanceMode: "REQUIRED",
    dayCredit: 1,
    isLeave: false,
    nominalMinutes: null,
    payMode: "SHIFT",
    amStart: am[0]?.start,
    amEnd: am.length ? am[am.length - 1].end : undefined,
    pmStart: pm[0]?.start,
    pmEnd: pm.length ? pm[pm.length - 1].end : undefined,
    displayOrder: 0,
    ...extra,
  };
}

/** Thứ tự = thứ tự dòng trên tab DANH MỤC CA (thêm mã mới thì thêm cuối, không chèn giữa). */
const RAW_CATALOG: CatalogEntry[] = [
  timed("CG", "Ca gãy", [W("09:00", "11:30"), W("14:00", "17:45")]),
  timed(
    "CS",
    "Ca suốt",
    [W("14:00", "16:30"), BREAK("16:30", "17:00"), W("17:00", "21:00")],
    {
      pmStart: "14:00",
      pmEnd: "21:00",
      pmBreakStart: "16:30",
      pmBreakEnd: "17:00",
      note: "Nghỉ giữa giờ 16:30–17:00, tính vào giờ làm",
    },
  ),
  timed("CCT", "Ca cuối tuần", [W("07:45", "11:30"), W("13:45", "17:45")]),
  timed("CGD", "Ca gãy dài", [W("09:00", "11:30"), W("13:30", "19:15")]),
  {
    code: "D1",
    name: "Làm tại Cơ sở 1",
    kind: "LOCATION_ONLY",
    segments: [],
    defaultPlace: "CENTER:CS1",
    attendanceMode: "OPTIONAL",
    dayCredit: 1,
    isLeave: false,
    nominalMinutes: null,
    payMode: "SHIFT",
    note: "Ô con trỏ — lưới tháng gộp vào ô cùng ngày ở khối Cơ sở 1",
    displayOrder: 0,
  },
  {
    code: "D2",
    name: "Làm tại Cơ sở 2",
    kind: "LOCATION_ONLY",
    segments: [],
    defaultPlace: "CENTER:CS2",
    attendanceMode: "OPTIONAL",
    dayCredit: 1,
    isLeave: false,
    nominalMinutes: null,
    payMode: "SHIFT",
    note: "Ô con trỏ — lưới tháng gộp vào ô cùng ngày ở khối Cơ sở 2",
    displayOrder: 0,
  },
  timed("HC", "Giờ hành chính", [W("08:00", "11:30", "ASSIGNED"), W("13:30", "17:30", "ASSIGNED")], {
    defaultPlace: "ASSIGNED",
    payMode: "ADMIN_HOURS",
    note: "Nơi làm theo phân công (HO)",
  }),
  timed("12", "Sáng CS1 · Chiều CS2", [W("08:00", "11:30", "CENTER:CS1"), W("13:30", "17:30", "CENTER:CS2")]),
  timed("21", "Sáng CS2 · Chiều CS1", [W("08:00", "11:30", "CENTER:CS2"), W("13:30", "17:30", "CENTER:CS1")]),
  timed("2C", "Cả 2 cơ sở", [W("08:00", "11:30", "ANY_CENTER"), W("13:30", "17:30", "ANY_CENTER")], {
    defaultPlace: "ANY_CENTER",
  }),
  timed("S", "Ca sáng", [W("07:45", "11:30")]),
  timed("C", "Ca chiều", [W("13:45", "17:30")]),
  timed("T", "Ca tối", [W("17:15", "21:00")]),
  timed("SC", "Ca sáng + chiều", [W("07:45", "11:30"), W("13:45", "17:30")]),
  timed("ST", "Ca sáng + tối", [W("07:45", "11:30"), W("17:15", "21:00")]),
  timed("CT", "Ca chiều + tối", [W("13:45", "21:00")], { note: "Liền 13:45–21:00 = 7h15" }),
  timed("SCT", "Ca sáng + chiều + tối", [W("07:45", "11:30"), W("13:45", "21:00")]),
  {
    code: "LD",
    name: "Linh động",
    kind: "FLEXIBLE",
    segments: [],
    defaultPlace: "ANYWHERE",
    attendanceMode: "OPTIONAL",
    dayCredit: 1,
    isLeave: false,
    nominalMinutes: null, // T-03: 1 công, 0 giờ
    payMode: "SHIFT",
    note: "Không nhất thiết đến Trung tâm",
    displayOrder: 0,
  },
  timed("NG", "Công tác ngoài", [W("08:00", "11:30", "OFFSITE"), W("13:30", "17:30", "OFFSITE")], {
    defaultPlace: "OFFSITE",
    attendanceMode: "OPTIONAL",
    nominalMinutes: 450,
  }),
  {
    code: "X",
    name: "Nghỉ",
    kind: "OFF",
    segments: [],
    defaultPlace: "HOME",
    attendanceMode: "NONE",
    dayCredit: 0,
    isLeave: false,
    nominalMinutes: null,
    payMode: "NONE",
    displayOrder: 0,
  },
  {
    code: "P",
    name: "Nghỉ phép",
    kind: "LEAVE",
    segments: [],
    defaultPlace: "HOME",
    attendanceMode: "NONE",
    dayCredit: 0,
    isLeave: true,
    nominalMinutes: null,
    payMode: "NONE",
    displayOrder: 0,
  },
];

export const SHIFT_CATALOG: readonly CatalogEntry[] = RAW_CATALOG.map((e, i) => ({ ...e, displayOrder: i + 1 }));

export const SHIFT_CODES: readonly string[] = SHIFT_CATALOG.map((e) => e.code);

export function catalogByCode(code: string): CatalogEntry | undefined {
  return SHIFT_CATALOG.find((e) => e.code === code);
}

/** "HH:mm" → phút từ 00:00. Ném lỗi nếu sai định dạng (dữ liệu danh mục là do người nhập). */
export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Giờ không hợp lệ: "${hhmm}" (cần HH:mm)`);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) throw new Error(`Giờ không hợp lệ: "${hhmm}"`);
  return h * 60 + mi;
}

/** Giờ kế hoạch của một mã = tổng WORK + PAID_BREAK (phút). Mã không giờ → nominalMinutes ?? 0. */
export function plannedMinutes(entry: Pick<CatalogEntry, "segments" | "nominalMinutes">): number {
  if (entry.segments.length === 0) return entry.nominalMinutes ?? 0;
  return entry.segments.reduce((sum, s) => sum + (toMinutes(s.end) - toMinutes(s.start)), 0);
}

export type SegmentIssue = { index: number; message: string };

/**
 * Luật cấu trúc segments (Zod của màn danh mục gọi hàm này): tăng dần, không qua đêm,
 * PAID_BREAK phải kẹp giữa hai WORK, không chồng nhau trong cùng mã.
 */
export function validateSegments(segments: ShiftSegment[]): SegmentIssue[] {
  const issues: SegmentIssue[] = [];
  let prevEnd = -1;
  segments.forEach((s, i) => {
    let start: number;
    let end: number;
    try {
      start = toMinutes(s.start);
      end = toMinutes(s.end);
    } catch (e) {
      issues.push({ index: i, message: (e as Error).message });
      return;
    }
    if (end <= start) issues.push({ index: i, message: "Giờ kết thúc phải sau giờ bắt đầu (không qua đêm)" });
    if (start < prevEnd) issues.push({ index: i, message: "Đoạn ca chồng lên đoạn trước" });
    if (s.kind === "PAID_BREAK") {
      const before = segments[i - 1];
      const after = segments[i + 1];
      if (!before || before.kind !== "WORK" || !after || after.kind !== "WORK") {
        issues.push({ index: i, message: "Nghỉ giữa giờ tính công phải nằm giữa hai đoạn làm việc" });
      } else if (before.end !== s.start || after.start !== s.end) {
        issues.push({ index: i, message: "Nghỉ giữa giờ phải nối liền với hai đoạn làm việc" });
      }
    }
    prevEnd = Math.max(prevEnd, end);
  });
  return issues;
}

/** Mã đơn ⊂ mã ghép theo Sheet (SC = S; C …) — dùng cho gợi ý và cho export ngược. */
export const COMPOSITE_CODES: Readonly<Record<string, readonly string[]>> = {
  SC: ["S", "C"],
  ST: ["S", "T"],
  CT: ["C", "T"],
  SCT: ["S", "C", "T"],
};

/** Danh mục loại nghỉ (K-06 theo MISA) — seed nền 1 lần, sửa trên màn CRUD. */
export const LEAVE_TYPE_CATALOG: readonly {
  code: string;
  name: string;
  paidRatio: number;
  maxDaysPerYear: number | null;
  countsAsWorked: boolean;
}[] = [
  { code: "NGHI_PHEP", name: "Nghỉ phép năm", paidRatio: 1, maxDaysPerYear: null, countsAsWorked: false },
  { code: "KHONG_LUONG", name: "Nghỉ không lương", paidRatio: 0, maxDaysPerYear: 10, countsAsWorked: false },
  { code: "KET_HON", name: "Nghỉ kết hôn", paidRatio: 1, maxDaysPerYear: 7, countsAsWorked: false },
  { code: "CON_KET_HON", name: "Nghỉ con kết hôn", paidRatio: 1, maxDaysPerYear: 3, countsAsWorked: false },
  { code: "MA_CHAY", name: "Nghỉ ma chay", paidRatio: 1, maxDaysPerYear: 3, countsAsWorked: false },
  { code: "BHXH", name: "Nghỉ hưởng BHXH (ốm)", paidRatio: 0, maxDaysPerYear: null, countsAsWorked: false },
  { code: "THAI_SAN", name: "Nghỉ thai sản", paidRatio: 0, maxDaysPerYear: 180, countsAsWorked: false },
  { code: "NGHI_BU", name: "Nghỉ bù", paidRatio: 1, maxDaysPerYear: null, countsAsWorked: true },
];
