// lib/lead/assignment-notice.ts — câu chữ báo cho NGƯỜI BẤM sau một lượt đổi chủ lead.
//
// THUẦN, KHÔNG IMPORT GÌ: ba component client dùng chung (chuyển lead · gán tay ·
// auto-chia trên bảng kanban). Đặt trong `assignment-core.ts` thì không xài được — file đó
// kéo theo `@/lib/db`, tức kéo Prisma vào bundle client.
//
// VÌ SAO PHẢI NÓI RA: `applyLeadReassignment` kéo theo `Enrollment.saleId` — cột quyết
// định ai còn nhắn riêng được với phụ huynh (`findSaleAssignedEnrollmentIds`,
// lib/chat/dm.ts). Ba đường bấm-tay trước đây trả `{ ok: true }` trần nên một lượt bấm có
// thể vừa đổi người phụ trách của cả sổ ghi danh mà màn hình chỉ hiện toast xanh.

export type EnrollmentCounts = {
  /** Số ghi danh đổi sang sale nhận. */
  enrollmentsMoved?: number;
  /** Số ghi danh bị GỠ phân công vì khác cơ sở (luật L2) — phải gán tay lại. */
  enrollmentsUnassigned?: number;
  /** Số ghi danh khác cơ sở GIỮ NGUYÊN sale cũ (luật L2). */
  enrollmentsKept?: number;
};

/** Chỉ nhận số nguyên dương — `undefined`/0/số âm đều coi như "không có gì để nói". */
function positive(n: number | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Một câu (hoặc nhiều câu nối lại) mô tả ghi danh vừa bị lượt đổi chủ đụng tới.
 * `null` = lượt đó không đụng ghi danh nào ⇒ toast giữ nguyên câu cũ, không thêm chữ.
 */
export function enrollmentNotice(counts: EnrollmentCounts): string | null {
  const parts: string[] = [];
  const moved = positive(counts.enrollmentsMoved);
  const unassigned = positive(counts.enrollmentsUnassigned);
  const kept = positive(counts.enrollmentsKept);

  if (moved > 0) parts.push(`${moved} ghi danh đã đổi sang sale mới.`);
  if (unassigned > 0) {
    parts.push(
      `${unassigned} ghi danh khác cơ sở đã bị gỡ sale phụ trách — cần gán lại ở màn học viên của lớp.`,
    );
  }
  if (kept > 0) parts.push(`${kept} ghi danh khác cơ sở vẫn do sale cũ phụ trách.`);

  return parts.length > 0 ? parts.join(" ") : null;
}
