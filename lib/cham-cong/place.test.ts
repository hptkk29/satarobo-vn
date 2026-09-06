import { describe, expect, it } from "vitest";
import { catalogByCode } from "./catalog";
import { mergePointerCells, resolvePlace, type CenterMap } from "./place";

const map: CenterMap = {
  byCode: {
    CS1: { centerId: "c-cs1", orgUnitId: "ou-cs1" },
    CS2: { centerId: "c-cs2", orgUnitId: "ou-cs2" },
  },
  hoCenterId: "hoi-so",
};
const of = (code: string, homeUnit: string) => {
  const e = catalogByCode(code)!;
  return resolvePlace({ segments: e.segments, defaultPlace: e.defaultPlace, homeUnit, map });
};

describe("resolvePlace — nơi làm theo mã + khối", () => {
  it("S của người CS1 → AT_UNITS [ou-cs1], chịu công c-cs1", () => {
    const r = of("S", "CS1");
    expect(r).toMatchObject({ placeMode: "AT_UNITS", allowedOrgUnitIds: ["ou-cs1"], centerId: "c-cs1", warnings: [] });
    expect(r.segments[0].orgUnitIds).toEqual(["ou-cs1"]);
  });
  it("12: sáng CS1 chiều CS2 → cả hai đơn vị, chịu công cơ sở đầu tiên (CS1)", () => {
    const r = of("12", "CS2");
    expect(r.allowedOrgUnitIds).toEqual(["ou-cs1", "ou-cs2"]);
    expect(r.centerId).toBe("c-cs1");
    expect(r.segments.map((s) => s.orgUnitIds)).toEqual([["ou-cs1"], ["ou-cs2"]]);
  });
  it("2C → ANY_CENTER, không cờ nơi làm; chịu công = cơ sở nhà", () => {
    expect(of("2C", "CS2")).toMatchObject({ placeMode: "ANY_CENTER", allowedOrgUnitIds: [], centerId: "c-cs2" });
  });
  it("HC của người HO → ANY_CENTER (Q-04), chịu công 'hoi-so'", () => {
    expect(of("HC", "HO")).toMatchObject({ placeMode: "ANY_CENTER", centerId: "hoi-so" });
  });
  it("NG → OFFSITE; LD → ANYWHERE; D2 → AT_UNITS CS2 dù người CS1", () => {
    expect(of("NG", "CS1").placeMode).toBe("OFFSITE");
    expect(of("LD", "HO")).toMatchObject({ placeMode: "ANYWHERE", centerId: "hoi-so" });
    expect(of("D2", "CS1")).toMatchObject({ placeMode: "AT_UNITS", allowedOrgUnitIds: ["ou-cs2"], centerId: "c-cs2" });
  });
  it("mã cơ sở lạ → cảnh báo, không ném", () => {
    const r = resolvePlace({ segments: [{ start: "08:00", end: "11:00", kind: "WORK", place: "CENTER:CS9" }], defaultPlace: "HOME", homeUnit: "CS1", map });
    expect(r.warnings[0]).toMatch(/CS9/);
  });
});

describe("mergePointerCells — gộp D1/D2 của người có 2 dòng", () => {
  it("CS1 = D2, CS2 = CG → mã CG, chịu công CS2, sourceCells giữ cả hai ô", () => {
    expect(mergePointerCells({ CS1: "D2", CS2: "CG" })).toEqual({ code: "CG", unit: "CS2", sourceCells: { CS1: "D2", CS2: "CG" } });
  });
  it("CS1 = CCT, CS2 = CCT (cả hai khối cùng mã thật) → lấy CS1", () => {
    expect(mergePointerCells({ CS1: "CCT", CS2: "CCT" }).unit).toBe("CS1");
  });
  it("chỉ con trỏ D1 mà khối kia trống → giữ D1 ở CS1", () => {
    expect(mergePointerCells({ CS2: "D1", CS1: null })).toMatchObject({ code: "D1", unit: "CS1" });
  });
  it("X ở cả hai → X, khối CS1", () => {
    expect(mergePointerCells({ CS1: "X", CS2: "X" })).toMatchObject({ code: "X", unit: "CS1" });
  });
  it("trống hết → null", () => {
    expect(mergePointerCells({ CS1: null, CS2: null }).code).toBeNull();
  });
});
