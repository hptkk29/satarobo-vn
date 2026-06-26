import { describe, it, expect } from "vitest";
import { filterOpenTrialClasses } from "./assign";

const CLASSES = [
  { id: "a", centerId: "cs1" },
  { id: "b", centerId: "cs1" },
  { id: "c", centerId: "cs2" },
];

describe("filterOpenTrialClasses (FL2-04 / US-LEAD-4 AC3)", () => {
  it("giữ đúng lớp cùng cơ sở", () => {
    expect(filterOpenTrialClasses(CLASSES, "cs1").map((c) => c.id)).toEqual([
      "a",
      "b",
    ]);
    expect(filterOpenTrialClasses(CLASSES, "cs2").map((c) => c.id)).toEqual([
      "c",
    ]);
  });

  it("cơ sở không xác định (null) → không gợi ý lớp nào", () => {
    expect(filterOpenTrialClasses(CLASSES, null)).toEqual([]);
  });

  it("không khớp cơ sở nào → rỗng", () => {
    expect(filterOpenTrialClasses(CLASSES, "cs9")).toEqual([]);
  });
});
