// lib/cham-cong/engine.ts — ENGINE BẢNG CÔNG NGÀY (L2). THUẦN: không DB, không giờ máy.
//
// Đầu vào là ca đã xếp của ngày (segments đã resolve), các lượt quét ĐÃ CHẤP NHẬN (phút VN
// trong ngày), tham số `shift.*` và ngữ cảnh (lễ, miễn công). Đầu ra là mọi cột của
// StaffAttendanceDay + `ruleSnapshot`. Luật theo kế hoạch v3.3 §4 và BA §6.3-bis GC-01..08:
//
//  1. Chống trùng 2′ (GC-08) chạy TRƯỚC ghép cặp.
//  2. Ghép cặp tuần tự theo thời gian, không xét ca (GC-01..05): VÀO mở cặp; RA đóng cặp
//     gần nhất; VÀO khi đang có cặp mở ⇒ cặp cũ THIEU_LUOT_RA; RA lẻ ⇒ RA_KHONG_CO_VAO.
//  3. Giờ công = GIAO(cặp, hợp các đoạn WORK ∪ PAID_BREAK đã gộp), khử trùng lặp (GC-06).
//     CG lỗ trưa KHÔNG tính; CS 16:30–17:00 TÍNH; CT liền 13:45–21:00 = 7h15.
//  4. Muộn/sớm theo đoạn: DI_MUON khi VÀO đầu tiên của đoạn > start + lateGrace (T-12: 30′);
//     DEN_SAT_GIO (chỉ nhắc) khi VÀO > start − earlyArrival; VE_SOM khi RA cuối < end − grace.
//  5. CÔNG ĐẾM THEO KẾ HOẠCH (T-01): dayCreditEarned = dayCreditExpected. Engine KHÔNG tự
//     trừ — thiếu lượt / thiếu buổi / muộn chỉ sinh cờ cho hộp cờ QLCS.
//  6. Lễ (T-04): holidayPaidUnits = dayCreditExpected × coefficient, cột riêng, không cờ thiếu.
//  7. Không sinh SAI_NOI_LAM cho ANY_CENTER / OFFSITE / ANYWHERE (§4.10) — cờ đó đặt ở lượt.
//  8. Miễn công (T-02): trả `exempt: true`, không sinh dòng.
import type { ShiftSegment } from "./catalog";
import { toMinutes } from "./catalog";

export type EngineLog = {
  id: string;
  /** Phút kể từ 00:00 giờ VN của ngày công. */
  minute: number;
  direction: "CHECK_IN" | "CHECK_OUT";
  /** Cờ đã gắn lúc ghi lượt (NGOAI_VUNG, THIEU_GPS, SAI_NOI_LAM…) — chỉ chuyển tiếp. */
  flags?: string[];
};

export type EngineAssignment = {
  templateCode: string;
  segments: ShiftSegment[];
  attendanceMode: "REQUIRED" | "OPTIONAL" | "NONE";
  dayCredit: number;
  isLeave: boolean;
  nominalMinutes: number | null;
  placeMode: "AT_UNITS" | "ANY_CENTER" | "OFFSITE" | "ANYWHERE";
  /** Mã nghỉ tuần (X) — không có giờ, không phải nghỉ phép. */
  isOff?: boolean;
};

export type EngineRules = {
  lateGraceMinutes: number;
  earlyArrivalMinutes: number;
  duplicateTapMinutes: number;
  maxLogsPerDay: number;
  pairingMaxGapMinutes: number;
};

export const DEFAULT_RULES: EngineRules = {
  lateGraceMinutes: 30,
  earlyArrivalMinutes: 10,
  duplicateTapMinutes: 2,
  maxLogsPerDay: 10,
  pairingMaxGapMinutes: 60,
};

export type EngineInput = {
  assignment: EngineAssignment | null;
  logs: EngineLog[];
  rules: EngineRules;
  holiday?: { coefficient: number; effect: "PAID_LEAVE" | "UNPAID_OFF" | "INFO_ONLY" | null } | null;
  exempt?: boolean;
  /** Ngày nghỉ tuần theo setting (không có ca) — chỉ để gắn dayType khi không có assignment. */
  isWeeklyOff?: boolean;
};

export type Pair = { inId: string | null; outId: string | null; start: number; end: number; open: boolean };

export type DayResult = {
  exempt: boolean;
  dayType: "WORK" | "WEEKLY_OFF" | "LEAVE" | "HOLIDAY" | "UNSCHEDULED";
  expectedMinutes: number;
  workedMinutes: number;
  paidBreakMinutes: number;
  rawPairedMinutes: number;
  amExpected: number;
  amWorked: number;
  pmExpected: number;
  pmWorked: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  missedEarlyArrival: boolean;
  dayCreditExpected: number;
  dayCreditEarned: number;
  hourCredit: number;
  leaveUnits: number;
  holidayPaidUnits: number;
  pairs: Pair[];
  flags: string[];
  ruleSnapshot: Record<string, unknown>;
};

type Interval = { start: number; end: number };

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].filter((x) => x.end > x.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const x of sorted) {
    const last = out[out.length - 1];
    if (last && x.start <= last.end) last.end = Math.max(last.end, x.end);
    else out.push({ ...x });
  }
  return out;
}

function overlap(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/** GC-08: hai lượt cùng chiều cách nhau < N phút ⇒ lượt sau là bấm trùng (bỏ khỏi ghép, gắn cờ). */
export function dedupeTaps(logs: EngineLog[], minutes: number): { kept: EngineLog[]; dupIds: string[] } {
  const sorted = [...logs].sort((a, b) => a.minute - b.minute);
  const kept: EngineLog[] = [];
  const dupIds: string[] = [];
  for (const l of sorted) {
    const prev = kept[kept.length - 1];
    if (prev && prev.direction === l.direction && l.minute - prev.minute < minutes) {
      dupIds.push(l.id);
      continue;
    }
    kept.push(l);
  }
  return { kept, dupIds };
}

/** GC-01..05: ghép cặp tuần tự theo thời gian, không xét ca. */
export function pairLogs(logs: EngineLog[]): { pairs: Pair[]; flags: string[] } {
  const sorted = [...logs].sort((a, b) => a.minute - b.minute);
  const pairs: Pair[] = [];
  const flags = new Set<string>();
  let open: Pair | null = null;
  for (const l of sorted) {
    if (l.direction === "CHECK_IN") {
      if (open) {
        flags.add("THIEU_LUOT_RA");
        pairs.push(open); // vào không có ra — giữ, open=true
      }
      open = { inId: l.id, outId: null, start: l.minute, end: l.minute, open: true };
    } else {
      if (!open) {
        flags.add("RA_KHONG_CO_VAO");
        continue;
      }
      open.outId = l.id;
      open.end = l.minute;
      open.open = false;
      pairs.push(open);
      open = null;
    }
  }
  if (open) {
    flags.add("THIEU_LUOT_RA");
    pairs.push(open);
  }
  return { pairs, flags: [...flags] };
}

function isAm(seg: ShiftSegment): boolean {
  return toMinutes(seg.start) < 12 * 60;
}

export function computeDay(input: EngineInput): DayResult {
  const { assignment: a, rules } = input;
  const flags = new Set<string>();
  const snapshot: Record<string, unknown> = { rules, templateCode: a?.templateCode ?? null, placeMode: a?.placeMode ?? null };

  const base: DayResult = {
    exempt: false,
    dayType: "UNSCHEDULED",
    expectedMinutes: 0,
    workedMinutes: 0,
    paidBreakMinutes: 0,
    rawPairedMinutes: 0,
    amExpected: 0,
    amWorked: 0,
    pmExpected: 0,
    pmWorked: 0,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    missedEarlyArrival: false,
    dayCreditExpected: 0,
    dayCreditEarned: 0,
    hourCredit: 0,
    leaveUnits: 0,
    holidayPaidUnits: 0,
    pairs: [],
    flags: [],
    ruleSnapshot: snapshot,
  };

  if (input.exempt) return { ...base, exempt: true, dayType: a ? "WORK" : "UNSCHEDULED", ruleSnapshot: { ...snapshot, exempt: true } };

  // ── Lượt: chống trùng + trần + ghép cặp (không phụ thuộc ca) ─────────────
  const { kept, dupIds } = dedupeTaps(input.logs, rules.duplicateTapMinutes);
  if (dupIds.length) flags.add("TRUNG_2_PHUT");
  if (input.logs.length > rules.maxLogsPerDay) flags.add("VUOT_TRAN");
  for (const l of input.logs) for (const f of l.flags ?? []) flags.add(f);
  const paired = pairLogs(kept);
  paired.flags.forEach((f) => flags.add(f));
  const closed = paired.pairs.filter((p) => !p.open);
  const pairedIntervals = mergeIntervals(closed.map((p) => ({ start: p.start, end: p.end })));
  const rawPairedMinutes = pairedIntervals.reduce((s, x) => s + (x.end - x.start), 0);
  snapshot.dupIds = dupIds;

  // ── Ngày không có ca ──────────────────────────────────────────────────────
  if (!a) {
    if (input.logs.length > 0) flags.add("CHAM_NGOAI_LICH");
    return {
      ...base,
      dayType: input.isWeeklyOff ? "WEEKLY_OFF" : "UNSCHEDULED",
      rawPairedMinutes,
      pairs: paired.pairs,
      flags: [...flags].sort(),
    };
  }

  const dayCreditExpected = a.dayCredit;
  const leaveUnits = a.isLeave ? 1 : 0;

  // ── Lễ (T-04): cột riêng, không cờ thiếu ─────────────────────────────────
  if (input.holiday && input.holiday.effect !== "INFO_ONLY") {
    const coef = input.holiday.effect === "UNPAID_OFF" ? 0 : input.holiday.coefficient;
    if (input.logs.length > 0) flags.add("LAM_NGAY_LE");
    return {
      ...base,
      dayType: "HOLIDAY",
      rawPairedMinutes,
      dayCreditExpected,
      dayCreditEarned: 0,
      holidayPaidUnits: Math.round(dayCreditExpected * coef * 100) / 100,
      pairs: paired.pairs,
      flags: [...flags].sort(),
      ruleSnapshot: { ...snapshot, holiday: input.holiday },
    };
  }

  // ── Nghỉ / nghỉ phép ──────────────────────────────────────────────────────
  if (a.isLeave || a.isOff || a.attendanceMode === "NONE") {
    if (input.logs.length > 0) flags.add("CHAM_NGOAI_LICH");
    return {
      ...base,
      dayType: a.isLeave ? "LEAVE" : "WEEKLY_OFF",
      rawPairedMinutes,
      dayCreditExpected,
      dayCreditEarned: dayCreditExpected,
      leaveUnits,
      pairs: paired.pairs,
      flags: [...flags].sort(),
    };
  }

  // ── Ca làm việc ───────────────────────────────────────────────────────────
  const segs = a.segments.map((s) => ({ ...s, s: toMinutes(s.start), e: toMinutes(s.end) }));
  const work = segs.filter((s) => s.kind === "WORK");
  const paidBreak = segs.filter((s) => s.kind === "PAID_BREAK");
  const planned = mergeIntervals(segs.map((s) => ({ start: s.s, end: s.e })));
  const expectedMinutes = segs.length ? segs.reduce((s, x) => s + (x.e - x.s), 0) : (a.nominalMinutes ?? 0);
  const amExpected = segs.filter((s) => isAm(s)).reduce((s, x) => s + (x.e - x.s), 0);
  const pmExpected = expectedMinutes - amExpected;

  // GC-06: giao(cặp, ca đã gộp), khử trùng lặp
  let workedMinutes = 0;
  let paidBreakMinutes = 0;
  let amWorked = 0;
  let pmWorked = 0;
  for (const p of pairedIntervals) {
    for (const pl of planned) workedMinutes += overlap(p, pl);
    for (const b of paidBreak) paidBreakMinutes += overlap(p, { start: b.s, end: b.e });
    for (const s of segs) {
      const o = overlap(p, { start: s.s, end: s.e });
      if (isAm(s)) amWorked += o;
      else pmWorked += o;
    }
  }

  // Muộn / sớm / thiếu buổi theo từng đoạn WORK (cửa sổ ± pairingMaxGap)
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let missedEarlyArrival = false;
  const ins = kept.filter((l) => l.direction === "CHECK_IN").map((l) => l.minute);
  const outs = kept.filter((l) => l.direction === "CHECK_OUT").map((l) => l.minute);
  const hasAnyLog = kept.length > 0;
  if (a.attendanceMode === "REQUIRED") {
    if (!hasAnyLog) flags.add("KHONG_CO_LUOT");
    // Nhóm đoạn WORK thành các cụm liền nhau (CT 13:45–21:00 là 1; CS = 2 WORK + break = 1 cụm)
    for (const blk of planned) {
      const gap = rules.pairingMaxGapMinutes;
      const firstIn = ins.filter((m) => m >= blk.start - gap && m <= blk.end).sort((x, y) => x - y)[0];
      const covered = pairedIntervals.some((p) => overlap(p, blk) > 0);
      if (firstIn === undefined && !covered) {
        if (hasAnyLog) flags.add(blk.start < 12 * 60 ? "THIEU_BUOI_SANG" : "THIEU_BUOI_CHIEU");
        continue;
      }
      if (firstIn !== undefined) {
        if (firstIn > blk.start + rules.lateGraceMinutes) {
          flags.add("DI_MUON");
          lateMinutes += firstIn - blk.start;
        } else if (firstIn > blk.start) {
          // Đến SAU giờ bắt đầu nhưng trong dung sai: chỉ nhắc, không tính muộn. Đến trước
          // giờ (kể cả sát 1–2′) không gắn cờ — "có mặt trước ca 10′" là lời nhắc trong tin
          // 19:00 (`shift.earlyArrivalMinutes`), không phải tiêu chí phạt.
          flags.add("DEN_SAT_GIO");
          missedEarlyArrival = true;
        }
      }
      const lastOut = outs.filter((m) => m >= blk.start && m <= blk.end + gap).sort((x, y) => y - x)[0];
      if (lastOut !== undefined && lastOut < blk.end - rules.lateGraceMinutes) {
        flags.add("VE_SOM");
        earlyLeaveMinutes += blk.end - lastOut;
      }
    }
    // Thiếu quá 60′ so với kế hoạch (có lượt mà giờ thật hụt hẳn) — chỉ cờ, không trừ công.
    if (hasAnyLog && expectedMinutes > 0 && workedMinutes < expectedMinutes - 60) flags.add("THIEU_GIO");
  }

  // Công theo ca — đếm theo kế hoạch (T-01); giờ chỉ để đối chiếu
  const dayCreditEarned = dayCreditExpected;
  const hourCredit = Math.round((workedMinutes / 60) * 100) / 100;
  void work;

  return {
    exempt: false,
    dayType: "WORK",
    expectedMinutes,
    workedMinutes,
    paidBreakMinutes,
    rawPairedMinutes,
    amExpected,
    amWorked,
    pmExpected,
    pmWorked,
    lateMinutes,
    earlyLeaveMinutes,
    missedEarlyArrival,
    dayCreditExpected,
    dayCreditEarned,
    hourCredit,
    leaveUnits,
    holidayPaidUnits: 0,
    pairs: paired.pairs,
    flags: [...flags].sort(),
    ruleSnapshot: { ...snapshot, planned, expectedMinutes },
  };
}

/** Tiện ích: "HH:mm" → phút (để test viết cho dễ đọc). */
export const m = toMinutes;
