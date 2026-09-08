import { describe, expect, it } from "vitest";
import {
  SHIFT_CATALOG,
  SHIFT_CODES,
  catalogByCode,
  plannedMinutes,
  validateSegments,
  toMinutes,
  LEAVE_TYPE_CATALOG,
} from "./catalog";

// Kế hoạch v3.3 §1.2 — giờ kế hoạch tính từ Sheet (CS tính cả nghỉ giữa giờ; CT = 7h15,
// KHÔNG phải 7h30 như lib/work-schedule.test.ts cũ khoá).
const PLANNED_MIN: Record<string, number> = {
  S: 225, C: 225, T: 225, SC: 450, ST: 450, CT: 435, SCT: 660,
  CG: 375, CS: 420, CCT: 465, CGD: 495, HC: 450, "12": 450, "21": 450, "2C": 450,
  NG: 450, D1: 0, D2: 0, LD: 0, X: 0, P: 0,
};

describe("SHIFT_CATALOG — 21 mã theo tab DANH MỤC CA", () => {
  it("đúng 21 mã, đúng thứ tự dòng trên Sheet, không trùng", () => {
    expect(SHIFT_CODES).toEqual([
      "CG", "CS", "CCT", "CGD", "D1", "D2", "HC", "12", "21", "2C",
      "S", "C", "T", "SC", "ST", "CT", "SCT", "LD", "NG", "X", "P",
    ]);
    expect(new Set(SHIFT_CODES).size).toBe(21);
  });

  it.each(Object.entries(PLANNED_MIN))("giờ kế hoạch %s = %i phút", (code, minutes) => {
    expect(plannedMinutes(catalogByCode(code)!)).toBe(minutes);
  });

  it("K-01 theo Sheet: mọi mã làm việc = 1 công, X/P = 0", () => {
    for (const e of SHIFT_CATALOG) {
      expect(e.dayCredit, e.code).toBe(e.code === "X" || e.code === "P" ? 0 : 1);
    }
  });

  it("segments của 21 mã đều hợp lệ (tăng dần, không qua đêm, PAID_BREAK kẹp giữa 2 WORK)", () => {
    for (const e of SHIFT_CATALOG) expect(validateSegments(e.segments), e.code).toEqual([]);
  });

  it("CS: nghỉ giữa giờ 16:30–17:00 là PAID_BREAK và TÍNH vào giờ kế hoạch", () => {
    const cs = catalogByCode("CS")!;
    expect(cs.segments.map((s) => s.kind)).toEqual(["WORK", "PAID_BREAK", "WORK"]);
    expect(plannedMinutes(cs)).toBe(420);
  });

  it("nơi làm: HC theo phân công, 12/21 đổi cơ sở giữa ngày, 2C mọi cơ sở, NG ngoài, LD bất kỳ, D1/D2 cố định", () => {
    expect(catalogByCode("HC")!.defaultPlace).toBe("ASSIGNED");
    expect(catalogByCode("12")!.segments.map((s) => s.place)).toEqual(["CENTER:CS1", "CENTER:CS2"]);
    expect(catalogByCode("21")!.segments.map((s) => s.place)).toEqual(["CENTER:CS2", "CENTER:CS1"]);
    expect(catalogByCode("2C")!.defaultPlace).toBe("ANY_CENTER");
    expect(catalogByCode("NG")!.defaultPlace).toBe("OFFSITE");
    expect(catalogByCode("LD")!.defaultPlace).toBe("ANYWHERE");
    expect(catalogByCode("D1")!.defaultPlace).toBe("CENTER:CS1");
    expect(catalogByCode("D2")!.defaultPlace).toBe("CENTER:CS2");
  });

  it("chế độ chấm: LD/NG/D1/D2 OPTIONAL (1 công không cần lượt), X/P NONE, còn lại REQUIRED", () => {
    for (const e of SHIFT_CATALOG) {
      const expected = ["LD", "NG", "D1", "D2"].includes(e.code)
        ? "OPTIONAL"
        : ["X", "P"].includes(e.code)
          ? "NONE"
          : "REQUIRED";
      expect(e.attendanceMode, e.code).toBe(expected);
    }
    expect(catalogByCode("P")!.isLeave).toBe(true);
    expect(catalogByCode("LD")!.nominalMinutes).toBeNull(); // T-03: 1 công, 0 giờ
    expect(catalogByCode("NG")!.nominalMinutes).toBe(450);
  });

  it("cột hiển thị chép đúng chữ Sheet cho vài mã tiêu biểu", () => {
    const cg = catalogByCode("CG")!;
    expect([cg.amStart, cg.amEnd, cg.pmStart, cg.pmEnd]).toEqual(["09:00", "11:30", "14:00", "17:45"]);
    const t = catalogByCode("T")!;
    expect([t.amStart, t.pmStart, t.pmEnd]).toEqual([undefined, "17:15", "21:00"]);
  });
});

describe("validateSegments / toMinutes", () => {
  it("bắt qua đêm, chồng nhau, PAID_BREAK lạc chỗ", () => {
    expect(validateSegments([{ start: "21:00", end: "01:00", kind: "WORK" }])[0]?.message).toMatch(/qua đêm/);
    expect(
      validateSegments([
        { start: "08:00", end: "12:00", kind: "WORK" },
        { start: "11:00", end: "13:00", kind: "WORK" },
      ])[0]?.message,
    ).toMatch(/chồng/);
    expect(validateSegments([{ start: "16:30", end: "17:00", kind: "PAID_BREAK" }])[0]?.message).toMatch(
      /giữa hai đoạn/,
    );
    expect(validateSegments([{ start: "8h", end: "12:00", kind: "WORK" }])[0]?.message).toMatch(/không hợp lệ/);
  });
  it("toMinutes", () => {
    expect(toMinutes("07:45")).toBe(465);
    expect(() => toMinutes("25:00")).toThrow();
  });
});

describe("LEAVE_TYPE_CATALOG — K-06 theo MISA", () => {
  it("8 loại, tỷ lệ lương và trần ngày/năm như MISA", () => {
    expect(LEAVE_TYPE_CATALOG).toHaveLength(8);
    const by = Object.fromEntries(LEAVE_TYPE_CATALOG.map((l) => [l.code, l]));
    expect(by.KHONG_LUONG).toMatchObject({ paidRatio: 0, maxDaysPerYear: 10 });
    expect(by.KET_HON).toMatchObject({ paidRatio: 1, maxDaysPerYear: 7 });
    expect(by.THAI_SAN).toMatchObject({ paidRatio: 0, maxDaysPerYear: 180 });
    expect(by.NGHI_BU.countsAsWorked).toBe(true);
    expect(LEAVE_TYPE_CATALOG.some((l) => /thứ 2/i.test(l.name))).toBe(false); // loại giả "Thứ 2" của MISA không mang sang
  });
});
