// lib/lms/scheduling.ts — R3-03: phát hiện trùng lịch phòng/GV + sức chứa (THUẦN, M1).
export type Slot = {
  id?: string;
  roomId?: string | null;
  teacherId?: string | null;
  startAt: Date;
  endAt: Date;
};

/** 2 khoảng thời gian có giao nhau không (THUẦN). */
export function overlaps(a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

/** Phát hiện trùng phòng (C3.1) / trùng GV (C3.2) với các slot hiện có. THUẦN. */
export function detectScheduleConflict(
  existing: Slot[],
  candidate: Slot,
): { roomConflict: boolean; teacherConflict: boolean; conflictIds: string[] } {
  const conflictIds: string[] = [];
  let roomConflict = false;
  let teacherConflict = false;
  for (const s of existing) {
    if (s.id && candidate.id && s.id === candidate.id) continue; // bỏ qua chính nó
    if (!overlaps(s, candidate)) continue;
    if (candidate.roomId && s.roomId === candidate.roomId) {
      roomConflict = true;
      if (s.id) conflictIds.push(s.id);
    }
    if (candidate.teacherId && s.teacherId === candidate.teacherId) {
      teacherConflict = true;
      if (s.id) conflictIds.push(s.id);
    }
  }
  return { roomConflict, teacherConflict, conflictIds: [...new Set(conflictIds)] };
}

/** C3.4 — còn chỗ ghi danh không (chặn cứng khi vượt maxStudents). THUẦN. */
export function hasCapacity(currentCount: number, maxStudents: number | null | undefined): boolean {
  if (maxStudents == null) return true; // không giới hạn
  return currentCount < maxStudents;
}
