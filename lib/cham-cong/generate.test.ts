import { describe, expect, it } from "vitest";
import { daysOfMonth, planMonthFromPatterns, warnNoWeeklyRest, type ExistingCell, type PatternRow } from "./generate";

const FROM = new Date(Date.UTC(2000, 0, 1));
const pat = (userId: string, unit: string, codes: Record<number, string>): PatternRow[] =>
  Object.entries(codes).map(([wd, templateCode]) => ({ userId, unit, weekday: Number(wd), templateCode, effectiveFrom: FROM, effectiveTo: null }));

// Mr Phúc theo Sheet: CS1 = X D2 CG D2 CG D2 CCT (T2..CN) · CS2 = X CG D1 CG D1 CCT D1
const phucCs1 = pat("phuc", "CS1", { 1: "X", 2: "D2", 3: "CG", 4: "D2", 5: "CG", 6: "D2", 0: "CCT" });
const phucCs2 = pat("phuc", "CS2", { 1: "X", 2: "CG", 3: "D1", 4: "CG", 5: "D1", 6: "CCT", 0: "D1" });

describe("planMonthFromPatterns — T09/2026", () => {
  it("30 ngày, Mr Phúc: Thứ Ba (1/9) = CG tại CS2, Thứ Tư (2/9) = CG tại CS1, CN (6/9) = CCT tại CS1", () => {
    expect(daysOfMonth(2026, 9)).toHaveLength(30);
    const cells = planMonthFromPatterns({ year: 2026, month1: 9, patterns: [...phucCs1, ...phucCs2], existing: [] });
    expect(cells).toHaveLength(30);
    const by = (d: number) => cells.find((c) => c.workDate.getUTCDate() === d)!;
    expect(by(1)).toMatchObject({ code: "CG", unit: "CS2", action: "CREATE", sourceCells: { CS1: "D2", CS2: "CG" } });
    expect(by(2)).toMatchObject({ code: "CG", unit: "CS1", sourceCells: { CS1: "CG", CS2: "D1" } });
    expect(by(6)).toMatchObject({ code: "CCT", unit: "CS1" });
    expect(by(7)).toMatchObject({ code: "X", unit: "CS1" }); // Thứ Hai nghỉ
  });

  it("ô đã có nguồn MANUAL/SWAP/LEAVE/IMPORT không bị đè; PATTERN cũ khác mã thì REPLACE; giống thì KEEP", () => {
    const existing: ExistingCell[] = [
      { userId: "phuc", workDate: new Date(Date.UTC(2026, 8, 1)), templateCode: "X", centerUnit: "CS1", source: "MANUAL" },
      { userId: "phuc", workDate: new Date(Date.UTC(2026, 8, 2)), templateCode: "S", centerUnit: "CS1", source: "PATTERN" },
      { userId: "phuc", workDate: new Date(Date.UTC(2026, 8, 3)), templateCode: "CG", centerUnit: "CS2", source: "PATTERN" },
    ];
    const cells = planMonthFromPatterns({ year: 2026, month1: 9, patterns: [...phucCs1, ...phucCs2], existing });
    const by = (d: number) => cells.find((c) => c.workDate.getUTCDate() === d)!;
    expect(by(1).action).toBe("SKIP_PROTECTED");
    expect(by(2)).toMatchObject({ action: "REPLACE", code: "CG" });
    expect(by(3)).toMatchObject({ action: "KEEP", code: "CG" });
  });

  it("pattern có effectiveTo trước ngày → bỏ; ô cũ PATTERN mà pattern mới trống → CLEAR", () => {
    const p = pat("a", "CS1", { 2: "S" }).map((x) => ({ ...x, effectiveTo: new Date(Date.UTC(2026, 8, 10)) }));
    const existing: ExistingCell[] = [{ userId: "a", workDate: new Date(Date.UTC(2026, 8, 15)), templateCode: "S", centerUnit: "CS1", source: "PATTERN" }];
    const cells = planMonthFromPatterns({ year: 2026, month1: 9, patterns: p, existing });
    expect(cells.find((c) => c.workDate.getUTCDate() === 8)?.action).toBe("CREATE"); // Thứ Ba 8/9 ≤ 10/9
    expect(cells.find((c) => c.workDate.getUTCDate() === 15)?.action).toBe("CLEAR"); // 15/9 > effectiveTo
    expect(cells.find((c) => c.workDate.getUTCDate() === 22)).toBeUndefined();
  });

  it("onlyUserIds lọc người", () => {
    const cells = planMonthFromPatterns({ year: 2026, month1: 9, patterns: [...phucCs1, ...pat("b", "CS1", { 2: "S" })], existing: [], onlyUserIds: ["b"] });
    expect(new Set(cells.map((c) => c.userId))).toEqual(new Set(["b"]));
  });
});

describe("warnNoWeeklyRest — Điều 111", () => {
  it("Ms Huệ LD cả T2 lẫn CN → 7 ngày liên tiếp không X/P → cảnh báo; Mr Phúc có X Thứ Hai → không", () => {
    const hue = pat("hue", "HO", { 1: "LD", 2: "HC", 3: "HC", 4: "HC", 5: "HC", 6: "HC", 0: "LD" });
    const cells = planMonthFromPatterns({ year: 2026, month1: 9, patterns: [...hue, ...phucCs1, ...phucCs2], existing: [] });
    const w = warnNoWeeklyRest(cells);
    expect(w.some((x) => x.userId === "hue")).toBe(true);
    expect(w.some((x) => x.userId === "phuc")).toBe(false);
  });
});
