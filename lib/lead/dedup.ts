import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/service";
import { phoneVariants } from "@/lib/phone";
import { recordLeadActivity } from "@/lib/lead/activity-write";

// =============================================================================
// LEAD DEDUP — chống trùng SĐT trong cửa sổ cấu hình được (Phase T1.3)
// Cửa sổ ngày: SystemSetting "crm.dedupWindowDays" (default 90, dùng chung với lead-qualify).
// =============================================================================

/** Tìm lead gần nhất cùng SĐT trong cửa sổ dedup (chưa xoá). */
export async function findRecentDuplicate(
  phone: string,
): Promise<{ id: string } | null> {
  const windowDays = await getSetting("crm.dedupWindowDays");
  const since = new Date(Date.now() - windowDays * 86400 * 1000);
  // AUTH-SĐT P1 — so khớp cả canonical `84…` (đường ghi mới) lẫn `0…` (dữ liệu
  // cũ chưa backfill). So khớp đúng-bằng ở đây là chỗ dedup gãy âm thầm nhất.
  const variants = phoneVariants(phone);
  if (!variants.length) return null;
  return db.lead.findFirst({
    where: { phone: { in: variants }, deletedAt: null, createdAt: { gte: since } },
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
    // N-4 — khách gửi lại phiếu LÀ một hoạt động trên lead gốc: đồng hồ
    // "chưa tiếp cận lại" phải nhảy, không thì lead vừa có tín hiệu nóng lại
    // nằm im trong danh sách treo.
    await recordLeadActivity({
      tx,
      leadId: primaryLeadId,
      actorName: "Hệ thống (web)",
      type: "NOTE",
      content: `[Trùng SĐT] Có submit mới cùng SĐT ${phone}${
        source ? ` từ nguồn "${source}"` : ""
      } — đã chặn tạo lead trùng.`,
    });
  });
}
