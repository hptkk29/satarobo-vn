import { db } from "@/lib/db";
import { findRecentDuplicate, logDuplicateAttempt } from "./dedup";
import { autoAssignLead } from "./assign";

// =============================================================================
// LEAD INGEST — pipeline chung cho nguồn tự động (webhook). Phase T1.4
// Chống trùng (T1.3) -> tạo Lead -> auto-assign round-robin.
// =============================================================================

export type IngestLeadInput = {
  parentName: string;
  phone: string;
  email?: string | null;
  childName?: string | null;
  source: string; // "facebook" | "zalo" | "google-form" | ...
  note?: string | null;
  eventId?: string | null; // idempotency (unique trên Lead.eventId)
  centerId?: string | null;
  utmSource?: string | null;
  utmCampaign?: string | null;
  landingPage?: string | null;
};

export type IngestResult = {
  ok: boolean;
  leadId?: string;
  duplicate?: boolean;
  error?: string;
};

const ACTOR = { actorId: null, actorName: "Hệ thống (webhook)" };

export async function ingestLead(input: IngestLeadInput): Promise<IngestResult> {
  const phone = input.phone?.trim();
  const parentName = input.parentName?.trim();
  if (!phone || !parentName) {
    return { ok: false, error: "Thiếu parentName hoặc phone" };
  }

  // Idempotency: nếu eventId đã tồn tại -> đã xử lý.
  if (input.eventId) {
    const existing = await db.lead.findUnique({
      where: { eventId: input.eventId },
      select: { id: true },
    });
    if (existing) return { ok: true, leadId: existing.id, duplicate: true };
  }

  // Chống trùng SĐT 90 ngày (T1.3).
  const dup = await findRecentDuplicate(phone);
  if (dup) {
    await logDuplicateAttempt(dup.id, phone, input.source);
    return { ok: true, leadId: dup.id, duplicate: true };
  }

  try {
    const lead = await db.lead.create({
      data: {
        parentName,
        phone,
        email: input.email?.trim() || undefined,
        childName: input.childName?.trim() || undefined,
        centerId: input.centerId ?? undefined,
        source: input.source,
        status: "NEW",
        utmSource: input.utmSource ?? undefined,
        utmCampaign: input.utmCampaign ?? undefined,
        landingPage: input.landingPage ?? undefined,
        eventId: input.eventId ?? undefined,
        consentMarketing: true,
        note: input.note ?? undefined,
      },
      select: { id: true },
    });

    await autoAssignLead(lead.id, ACTOR).catch((err) =>
      console.error("[ingestLead] auto-assign error:", err),
    );

    return { ok: true, leadId: lead.id, duplicate: false };
  } catch (err) {
    // eventId unique conflict (race) -> coi như đã xử lý.
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { ok: true, duplicate: true };
    }
    console.error("[ingestLead] create error:", err);
    return { ok: false, error: "Lỗi tạo lead" };
  }
}
