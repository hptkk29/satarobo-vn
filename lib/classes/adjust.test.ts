import { describe, it, expect } from "vitest";
import { buildMakeupDate } from "./adjust";

const d = (s: string) => new Date(`${s}T00:00:00`);

describe("buildMakeupDate (PURE)", () => {
  it("buổi bù = +7 ngày SAU buổi muộn nhất hiện có", () => {
    const existing = [d("2026-06-01"), d("2026-06-08"), d("2026-06-15")];
    const out = buildMakeupDate(existing, d("2026-06-08"));
    // max = 2026-06-15 → +7 = 2026-06-22
    expect(out).toEqual(d("2026-06-22"));
  });

  it("dùng max(existing, afterDate) khi afterDate muộn hơn mọi buổi", () => {
    const existing = [d("2026-06-01"), d("2026-06-03")];
    const out = buildMakeupDate(existing, d("2026-06-30"));
    expect(out).toEqual(d("2026-07-07"));
  });

  it("existingDates rỗng → +7 ngày so với afterDate", () => {
    const out = buildMakeupDate([], d("2026-06-10"));
    expect(out).toEqual(d("2026-06-17"));
  });

  it("luôn nối ở CUỐI: kết quả > mọi ngày hiện có (giữ append-at-end)", () => {
    const existing = [d("2026-06-01"), d("2026-06-20"), d("2026-06-10")];
    const out = buildMakeupDate(existing, d("2026-06-05"));
    for (const e of existing) {
      expect(out.getTime()).toBeGreaterThan(e.getTime());
    }
  });

  it("không đột biến input (không mutate Date trong mảng)", () => {
    const max = d("2026-06-15");
    const existing = [d("2026-06-01"), max];
    buildMakeupDate(existing, d("2026-06-01"));
    expect(max).toEqual(d("2026-06-15"));
  });
});
