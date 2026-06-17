import { describe, it, expect } from "vitest";
import {
  computeAttendanceSummary,
  type AttendanceSummaryItem,
} from "./summary";

// R7-08 — bảng biên 5 chỉ số (US-MKP-2 / test case C5: 48/22/3/1/2).
describe("computeAttendanceSummary", () => {
  it("[C5] bảng biên kỳ vọng total=48, attended=22, absent=3, needMakeup=1, madeUp=2", () => {
    const items: AttendanceSummaryItem[] = [
      // 20 buổi có mặt (PRESENT/LATE).
      ...Array.from({ length: 18 }, () => ({ status: "PRESENT" as const })),
      { status: "LATE" },
      { status: "LATE" },
      // 2 buổi vắng đã học bù xong → tính attended + madeUp.
      { status: "ABSENT", makeupStatus: "MADE_UP" },
      { status: "EXCUSED", makeupStatus: "MADE_UP" },
      // 1 buổi đang chờ bù.
      { status: "ABSENT", makeupStatus: "NEEDS_MAKEUP" },
      // 3 buổi vắng không bù.
      { status: "ABSENT", makeupStatus: "NONE" },
      { status: "EXCUSED", makeupStatus: "NONE" },
      { status: "ABSENT_UNEXCUSED", makeupStatus: "NONE" },
      // 1 buổi bị hủy → KHÔNG tính vắng/học.
      { status: "ABSENT", makeupStatus: "NONE", sessionStatus: "CANCELLED" },
    ];
    const r = computeAttendanceSummary({ totalLessons: 48, attendances: items });
    expect(r).toEqual({ total: 48, attended: 22, absent: 3, needMakeup: 1, madeUp: 2 });
  });

  it("madeUp là tập con của attended (không double-count)", () => {
    const r = computeAttendanceSummary({
      totalLessons: 10,
      attendances: [
        { status: "PRESENT" },
        { status: "ABSENT", makeupStatus: "MADE_UP" },
      ],
    });
    expect(r.attended).toBe(2);
    expect(r.madeUp).toBe(1);
  });

  it("buổi CANCELLED không tính vắng (C7)", () => {
    const r = computeAttendanceSummary({
      totalLessons: 5,
      attendances: [{ status: "ABSENT", sessionStatus: "CANCELLED" }],
    });
    expect(r.absent).toBe(0);
    expect(r.attended).toBe(0);
  });

  it("buổi bù KHÔNG tăng total (total = số buổi chuẩn của khoá)", () => {
    const r = computeAttendanceSummary({
      totalLessons: 8,
      attendances: [{ status: "ABSENT", makeupStatus: "MADE_UP" }],
    });
    expect(r.total).toBe(8);
  });
});
