// lib/crm/lead-qualify.ts — R1-04: chuyển hội thoại L1 → Lead L2 (SR.QD.217).
// Có SĐT + note → tạo Lead (qualifiedAt), dedup phone 90 ngày, set commissionSource.
import type { CommissionSource, Lead } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export class LeadQualifyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LeadQualifyError";
    this.code = code;
  }
}

/** Chuẩn hóa SĐT VN: giữ chữ số. THUẦN. */
export function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** C4.2 — đạt L2 cần SĐT hợp lệ (≥8 chữ số). THUẦN. */
export function canQualify(phone: string | null | undefined): boolean {
  return normalizePhone(phone).length >= 8;
}

/** C4.4 — suy commissionSource (THUẦN). */
export function determineCommissionSource(input: {
  isReferral?: boolean;
  isSaleSelf?: boolean;
}): CommissionSource {
  if (input.isReferral) return "REFERRAL";
  if (input.isSaleSelf) return "SALE_SELF";
  return "MARKETING_ADMIN"; // mặc định: lead từ ads/Page → Sale Admin xử lý
}

/**
 * Tạo Lead L2 từ hội thoại. Dedup theo phone trong 90 ngày (C4.3) → nối hội thoại
 * vào lead cũ thay vì tạo trùng. Trả {lead, deduped}.
 */
export async function qualifyConversationToLead(input: {
  conversationId: string;
  phone: string;
  parentName?: string | null;
  note?: string | null;
  commissionSource: CommissionSource;
  adminId?: string | null;
  now?: Date;
}): Promise<{ lead: Lead; deduped: boolean }> {
  if (!canQualify(input.phone)) {
    throw new LeadQualifyError("NO_PHONE", "Thiếu SĐT hợp lệ — chưa đạt L2.");
  }
  const now = input.now ?? new Date();
  const phone = normalizePhone(input.phone);

  const conv = await db.messengerConversation.findUnique({ where: { id: input.conversationId } });
  if (!conv) throw new LeadQualifyError("CONVERSATION_NOT_FOUND", "Không tìm thấy hội thoại.");

  // Dedup phone trong cửa sổ cấu hình (C4.3) — SystemSetting "crm.dedupWindowDays" (default 90).
  const dedupWindowDays = await getSetting("crm.dedupWindowDays");
  const cutoff = new Date(now.getTime() - dedupWindowDays * 86_400_000);
  const existing = await db.lead.findFirst({
    where: { phone, deletedAt: null, createdAt: { gte: cutoff } },
    orderBy: { createdAt: "desc" },
  });

  let lead: Lead;
  let deduped = false;
  if (existing) {
    lead = existing;
    deduped = true;
  } else {
    lead = await db.lead.create({
      data: {
        parentName: input.parentName ?? conv.parentName ?? "Khách Messenger",
        phone,
        note: input.note ?? null,
        centerId: conv.centerId,
        qualifiedAt: now,
        commissionSource: input.commissionSource,
        adminId: input.adminId ?? null,
      },
    });
  }

  await db.messengerConversation.update({
    where: { id: conv.id },
    data: { leadId: lead.id, phone, status: "QUALIFIED" },
  });

  return { lead, deduped };
}
