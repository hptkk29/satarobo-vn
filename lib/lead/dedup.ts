import { db } from "@/lib/db";

// =============================================================================
// LEAD DEDUP — chống trùng SĐT trong 90 ngày (Phase T1.3)
// =============================================================================

const DEDUP_WINDOW_DAYS = 90;

/** Tìm lead gần nhất cùng SĐT trong cửa sổ 90 ngày (chưa xoá). */
export async function findRecentDuplicate(
  phone: string,
): Promise<{ id: string } | null> {
  const since = new Date(Date.now() - DEDUP_WINDOW_DAYS * 86400 * 1000);
  return db.lead.findFirst({
    where: { phone, deletedAt: null, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}

/**
 * Ghi log submit trùng vào LeadDuplicate + 1 LeadActivity NOTE trên lead gốc.
 * Không tạo lead mới.
 */
export async function logDuplicateAttempt(
  primaryLeadId: string,
  phone: string,
  source: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.leadDuplicate.create({
      data: { primaryLeadId, duplicatePhone: phone, source },
    });
    await tx.leadActivity.create({
      data: {
        leadId: primaryLeadId,
        actorName: "Hệ thống (web)",
        type: "NOTE",
        content: `[Trùng SĐT] Có submit mới cùng SĐT ${phone}${
          source ? ` từ nguồn "${source}"` : ""
        } — đã chặn tạo lead trùng.`,
      },
    });
  });
}
