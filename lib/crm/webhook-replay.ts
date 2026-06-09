// lib/crm/webhook-replay.ts — R1-11: replay WebhookDelivery FAILED (OI-20).
// Re-xử lý payload đã lưu; idempotent (recordIncomingMessage dedupe theo mid) → không tạo trùng.
import type { WebhookDelivery } from "@prisma/client";
import { db } from "@/lib/db";
import { ingestMessengerEvents } from "@/lib/crm/meta-webhook";

export class ReplayError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ReplayError";
    this.code = code;
  }
}

export async function getFailedDeliveries(take = 100): Promise<WebhookDelivery[]> {
  return db.webhookDelivery.findMany({
    where: { status: "FAILED" },
    orderBy: { receivedAt: "desc" },
    take,
  });
}

/** Replay 1 delivery: re-xử lý theo source. Idempotent (C11.2/C11.3). */
export async function replayDelivery(deliveryId: string): Promise<{ created: number }> {
  const d = await db.webhookDelivery.findUnique({ where: { id: deliveryId } });
  if (!d) throw new ReplayError("DELIVERY_NOT_FOUND", "Không tìm thấy bản ghi webhook.");

  if (d.source !== "facebook-messenger") {
    throw new ReplayError("SOURCE_UNSUPPORTED", `Chưa hỗ trợ replay source "${d.source}".`);
  }
  const created = await ingestMessengerEvents(d.payload);

  await db.webhookDelivery.update({
    where: { id: d.id },
    data: { status: "PROCESSED", processedAt: new Date(), retryCount: { increment: 1 }, errorMessage: null },
  });
  return { created };
}
