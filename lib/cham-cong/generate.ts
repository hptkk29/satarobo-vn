// lib/cham-cong/generate.ts — Sinh lưới tháng từ KHUNG CA TUẦN (kế hoạch §4.1). Phần THUẦN:
// quyết định từng ô (mã nào, có đè không) không chạm DB; phần DB ở generate-db.ts.
//
// Luật:
//  - Mỗi (người, ngày): lấy pattern của thứ đó ở TỪNG khối (Mr Phúc có 2 khối) → gộp con trỏ
//    D1/D2 như import (mergePointerCells) → mã + khối chịu công.
//  - KHÔNG đè ô có nguồn SWAP / LEAVE / MANUAL / IMPORT (đơn đã duyệt, sửa tay, file) — chỉ
//    ô trống hoặc ô PATTERN cũ. Lễ không đổi ô: engine xử lý (dayType HOLIDAY, hệ số).
//  - Pattern hết hiệu lực (effectiveTo < ngày) hoặc chưa hiệu lực thì bỏ qua.
import { mergePointerCells } from "./place";

export type PatternRow = {
  userId: string;
  unit: string; // "CS1" | "CS2" | "HO" (khối)
  weekday: number; // 0..6
  templateCode: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type ExistingCell = {
  userId: string;
  workDate: Date; // UTC date-only
  templateCode: string;
  centerUnit: string | null;
  source: "PATTERN" | "IMPORT" | "MANUAL" | "SWAP" | "LEAVE" | "HOLIDAY";
};

export type PlannedCell = {
  userId: string;
  workDate: Date;
  code: string;
  unit: string;
  sourceCells: Record<string, string>;
  action: "CREATE" | "REPLACE" | "KEEP" | "SKIP_PROTECTED" | "CLEAR";
  existingSource?: ExistingCell["source"];
};

const PROTECTED: ReadonlySet<ExistingCell["source"]> = new Set(["SWAP", "LEAVE", "MANUAL", "IMPORT"]);

export function daysOfMonth(year: number, month1: number): Date[] {
  const n = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(year, month1 - 1, i + 1)));
}

/** Thứ (0=CN…6=T7) của một ngày UTC date-only — ngày công theo lịch VN có cùng thứ với ngày UTC-midnight này. */
export function weekdayOf(dateOnly: Date): number {
  return dateOnly.getUTCDay();
}

export function planMonthFromPatterns(input: {
  year: number;
  month1: number;
  patterns: PatternRow[];
  existing: ExistingCell[];
  /** Chỉ sinh cho những người này (rỗng = mọi người có pattern). */
  onlyUserIds?: string[];
}): PlannedCell[] {
  const days = daysOfMonth(input.year, input.month1);
  const byUser = new Map<string, PatternRow[]>();
  for (const p of input.patterns) {
    if (input.onlyUserIds && input.onlyUserIds.length && !input.onlyUserIds.includes(p.userId)) continue;
    const list = byUser.get(p.userId) ?? [];
    list.push(p);
    byUser.set(p.userId, list);
  }
  const existingBy = new Map<string, ExistingCell>();
  for (const e of input.existing) existingBy.set(`${e.userId}|${e.workDate.toISOString().slice(0, 10)}`, e);

  const out: PlannedCell[] = [];
  for (const [userId, rows] of byUser) {
    for (const day of days) {
      const wd = weekdayOf(day);
      const cellsByUnit: Record<string, string | null> = {};
      for (const p of rows) {
        if (p.weekday !== wd) continue;
        if (p.effectiveFrom.getTime() > day.getTime()) continue;
        if (p.effectiveTo && p.effectiveTo.getTime() < day.getTime()) continue;
        cellsByUnit[p.unit] = p.templateCode;
      }
      const merged = mergePointerCells(cellsByUnit);
      const key = `${userId}|${day.toISOString().slice(0, 10)}`;
      const ex = existingBy.get(key);
      if (ex && PROTECTED.has(ex.source)) {
        out.push({ userId, workDate: day, code: ex.templateCode, unit: ex.centerUnit ?? merged.unit ?? "", sourceCells: merged.sourceCells, action: "SKIP_PROTECTED", existingSource: ex.source });
        continue;
      }
      if (!merged.code) {
        if (ex) out.push({ userId, workDate: day, code: ex.templateCode, unit: ex.centerUnit ?? "", sourceCells: {}, action: "CLEAR", existingSource: ex.source });
        continue;
      }
      if (ex && ex.templateCode === merged.code && (ex.centerUnit ?? merged.unit) === merged.unit) {
        out.push({ userId, workDate: day, code: merged.code, unit: merged.unit ?? "", sourceCells: merged.sourceCells, action: "KEEP", existingSource: ex.source });
        continue;
      }
      out.push({ userId, workDate: day, code: merged.code, unit: merged.unit ?? "", sourceCells: merged.sourceCells, action: ex ? "REPLACE" : "CREATE", existingSource: ex?.source });
    }
  }
  return out;
}

/** Cảnh báo Điều 111 BLLĐ: 7 ngày liên tiếp không có ngày X/P nào — chỉ cảnh báo, không tự sửa (§1.2). */
export function warnNoWeeklyRest(cells: PlannedCell[]): { userId: string; from: string; to: string }[] {
  const byUser = new Map<string, PlannedCell[]>();
  for (const c of cells) {
    if (c.action === "CLEAR" || c.action === "SKIP_PROTECTED") continue;
    const l = byUser.get(c.userId) ?? [];
    l.push(c);
    byUser.set(c.userId, l);
  }
  const out: { userId: string; from: string; to: string }[] = [];
  for (const [userId, list] of byUser) {
    list.sort((a, b) => a.workDate.getTime() - b.workDate.getTime());
    let run = 0;
    let start: Date | null = null;
    for (const c of list) {
      const rest = c.code === "X" || c.code === "P";
      if (rest) {
        run = 0;
        start = null;
        continue;
      }
      run += 1;
      start ??= c.workDate;
      if (run === 7 && start) {
        out.push({ userId, from: start.toISOString().slice(0, 10), to: c.workDate.toISOString().slice(0, 10) });
        run = 0;
        start = null;
      }
    }
  }
  return out;
}
