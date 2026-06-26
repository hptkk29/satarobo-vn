// lib/trials/assign.ts — FL2-04 / US-LEAD-4.
// Pure helper cho việc xếp con vào lớp TRẢI NGHIỆM (TrialClassV2) tại tab Học thử.

/** Lớp trải nghiệm OPEN tối thiểu để lọc theo cơ sở. */
export type OpenTrialClassLike = { centerId: string };

/**
 * AC3 — chỉ giữ lớp trải nghiệm CÙNG cơ sở của buổi học thử/lead.
 * `effectiveCenterId` null (cơ sở không xác định) → KHÔNG gợi ý lớp nào
 * (tránh xếp nhầm sang cơ sở khác).
 */
export function filterOpenTrialClasses<T extends OpenTrialClassLike>(
  classes: T[],
  effectiveCenterId: string | null,
): T[] {
  if (!effectiveCenterId) return [];
  return classes.filter((c) => c.centerId === effectiveCenterId);
}
