import { describe, it, expect } from "vitest";
import { sessionWindow, rowsToSlots } from "@/lib/lms/schedule-conflict";
import { detectScheduleConflict } from "@/lib/lms/scheduling";

describe("sessionWindow", () => {
  it("tính cuối buổi từ startTime/endTime của lớp", () => {
    const start = new Date(2026, 5, 1, 17, 30);
    const w = sessionWindow(start, "17:30", "19:00");
    expect(w.startAt).toEqual(start);
    expect((w.endAt.getTime() - w.startAt.getTime()) / 60000).toBe(90);
  });

  it("fallback 90' khi thiếu/đảo giờ", () => {
    const start = new Date(2026, 5, 1, 17, 30);
    expect((sessionWindow(start, null, null).endAt.getTime() - start.getTime()) / 60000).toBe(90);
    expect((sessionWindow(start, "19:00", "17:30").endAt.getTime() - start.getTime()) / 60000).toBe(90);
  });
});

describe("rowsToSlots", () => {
  it("phòng/GV hiệu lực = actual ?? class", () => {
    const date = new Date(2026, 5, 1, 17, 30);
    const slots = rowsToSlots([
      {
        id: "s1",
        date,
        actualRoomId: "R9",
        actualTeacherId: null,
        class: { roomId: "R1", teacherId: "T1", startTime: "17:30", endTime: "19:00" },
      },
    ]);
    expect(slots[0]).toMatchObject({ id: "s1", roomId: "R9", teacherId: "T1" });
  });
});

describe("rowsToSlots + detectScheduleConflict", () => {
  const date = new Date(2026, 5, 1, 17, 30);
  const existing = rowsToSlots([
    {
      id: "s1",
      date,
      actualRoomId: null,
      actualTeacherId: null,
      class: { roomId: "R1", teacherId: "T1", startTime: "17:30", endTime: "19:00" },
    },
  ]);

  it("bắt trùng phòng cùng giờ", () => {
    const r = detectScheduleConflict(existing, {
      roomId: "R1",
      teacherId: "T2",
      startAt: new Date(2026, 5, 1, 18, 0),
      endAt: new Date(2026, 5, 1, 19, 30),
    });
    expect(r.roomConflict).toBe(true);
    expect(r.teacherConflict).toBe(false);
    expect(r.conflictIds).toContain("s1");
  });

  it("bắt trùng GV cùng giờ", () => {
    const r = detectScheduleConflict(existing, {
      roomId: "R2",
      teacherId: "T1",
      startAt: new Date(2026, 5, 1, 18, 0),
      endAt: new Date(2026, 5, 1, 19, 30),
    });
    expect(r.teacherConflict).toBe(true);
    expect(r.roomConflict).toBe(false);
  });

  it("không trùng khi lệch giờ", () => {
    const r = detectScheduleConflict(existing, {
      roomId: "R1",
      teacherId: "T1",
      startAt: new Date(2026, 5, 1, 19, 30),
      endAt: new Date(2026, 5, 1, 21, 0),
    });
    expect(r.roomConflict).toBe(false);
    expect(r.teacherConflict).toBe(false);
  });
});
