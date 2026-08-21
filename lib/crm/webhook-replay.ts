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

/** Payload đã lưu là JSON tự do — về lại `Record<string,string>` để map lại. */
function asFormPayload(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
  }
  return out;
}

/**
 * Replay phiếu form Sale bị chặn (honeypot dính hoặc map hỏng).
 *
 * Ca thật cần đến: ô bẫy bot bị trình quản lý mật khẩu tự điền ⇒ lead THẬT bị
 * vứt. Payload đã lưu nguyên nên dựng lại được — nhưng phải BỎ ô bẫy đi, không
 * thì replay lại rơi vào đúng cái bẫy cũ.
 */
async function replaySaleForm(payload: unknown): Promise<number> {
  const { mapSaleForm, SALE_FORM_HONEYPOT } = await import("@/lib/lead/intake/map-sale-form");
  const { ingestIntakeLead } = await import("@/lib/lead/intake/ingest");

  const fields = asFormPayload(payload);
  delete fields[SALE_FORM_HONEYPOT];

  const mapped = mapSaleForm(fields);
  if (!mapped.ok) throw new ReplayError("PAYLOAD_INVALID", mapped.error);

  const result = await ingestIntakeLead(mapped.lead, {
    source: "sale-form",
    actorName: "Hệ thống (gửi lại phiếu Sale)",
  });
  if (!result.ok) {
    throw new ReplayError("INGEST_FAILED", result.error ?? "Không tạo được lead.");
  }
  // Trùng SĐT thì không đẻ lead mới — vẫn coi là xử lý xong, không phải lỗi.
  return result.duplicate ? 0 : 1;
}

/** Gửi lại bản sao sang MISA cho phiếu mirror đã hỏng. */
async function replayMisaMirror(payload: unknown): Promise<number> {
  const { mirrorSaleFormToMisa } = await import("@/lib/lead/intake/misa-mirror");
  const outcome = await mirrorSaleFormToMisa(asFormPayload(payload));
  if (outcome.status === "sent") return 1;
  if (outcome.status === "off") {
    throw new ReplayError("MIRROR_OFF", "Cờ intake.mirrorMisa đang TẮT — bật lại rồi thử.");
  }
  if (outcome.status === "misconfigured") {
    throw new ReplayError(
      "MIRROR_MISCONFIGURED",
      `Không dựng được tham số form MISA (thiếu ${outcome.missing.join(", ")}).`,
    );
  }
  throw new ReplayError("MIRROR_FAILED", `MISA vẫn từ chối (${outcome.reason}).`);
}

/**
 * Gửi lại bản sao MISA cho phiếu từ biểu mẫu `/nhap-khach-hang`.
 *
 * Payload ở đây là dữ liệu NGHIỆP VỤ (parentName/phone/childName/…), không phải
 * bộ trường MISA thô như `misa-mirror` của biểu mẫu tĩnh cũ — nên phải có nhánh
 * riêng, không dùng lại `mirrorSaleFormToMisa` (nó lọc theo tên trường MISA và
 * sẽ để lại payload rỗng).
 */
async function replayMisaInternal(payload: unknown): Promise<number> {
  const { mirrorInternalFormToMisa } = await import("@/lib/lead/intake/misa-mirror");

  const p = (payload ?? {}) as Record<string, unknown>;
  const text = (k: string): string | null => {
    const v = p[k];
    return typeof v === "string" && v.trim() ? v : null;
  };
  const parentName = text("parentName");
  if (!parentName) {
    throw new ReplayError("PAYLOAD_INVALID", "Phiếu không có tên phụ huynh — không dựng lại được.");
  }

  const outcome = await mirrorInternalFormToMisa({
    parentName,
    phone: text("phone") ?? "",
    childName: text("childName"),
    source: text("source"),
    facebookUrl: text("facebookUrl"),
    centerCode: text("centerCode"),
    note: text("note"),
    employeeCode: text("employeeCode"),
  });

  if (outcome.status === "sent") return 1;
  if (outcome.status === "off") {
    throw new ReplayError("MIRROR_OFF", "Cờ intake.mirrorMisa đang TẮT — bật lại rồi thử.");
  }
  if (outcome.status === "misconfigured") {
    throw new ReplayError(
      "MIRROR_MISCONFIGURED",
      `Thiếu env tham số webform MISA (${outcome.missing.join(", ")}).`,
    );
  }
  throw new ReplayError("MIRROR_FAILED", `MISA vẫn từ chối (${outcome.reason}).`);
}

/** Replay 1 delivery: re-xử lý theo source. Idempotent (C11.2/C11.3). */
export async function replayDelivery(deliveryId: string): Promise<{ created: number }> {
  const d = await db.webhookDelivery.findUnique({ where: { id: deliveryId } });
  if (!d) throw new ReplayError("DELIVERY_NOT_FOUND", "Không tìm thấy bản ghi webhook.");

  let created: number;
  switch (d.source) {
    case "facebook-messenger":
      created = await ingestMessengerEvents(d.payload);
      break;
    case "sale-form":
      created = await replaySaleForm(d.payload);
      break;
    case "misa-mirror":
      created = await replayMisaMirror(d.payload);
      break;
    case "misa-mirror-app":
      created = await replayMisaInternal(d.payload);
      break;
    default:
      throw new ReplayError("SOURCE_UNSUPPORTED", `Chưa hỗ trợ replay source "${d.source}".`);
  }

  await db.webhookDelivery.update({
    where: { id: d.id },
    data: { status: "PROCESSED", processedAt: new Date(), retryCount: { increment: 1 }, errorMessage: null },
  });
  return { created };
}
