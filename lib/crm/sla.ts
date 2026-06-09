// lib/crm/sla.ts — R1-06: SLA engine phễu SR.QD.217 (Doc 15 §5.4).
// evaluateSla THUẦN (C6.1–C6.5) + runSlaCheck (cron → StaffNotification dedupeKey, C6.6).
import { db } from "@/lib/db";

export type SlaRule = "SLA-0" | "SLA-1" | "SLA-2" | "SLA-3" | "SLA-4";

/** Ngưỡng vi phạm (ms). */
export const SLA_THRESHOLDS: Record<SlaRule, number> = {
  "SLA-0": 5 * 60_000, // chưa respond > 5'
  "SLA-1": 4 * 3_600_000, // chưa bàn giao > 4h
  "SLA-2": 30 * 60_000, // chưa phân công > 30'
  "SLA-3": 3 * 3_600_000, // chưa liên hệ > 3h
  "SLA-4": 2 * 86_400_000, // lead im > 2 ngày
};

export const SLA_LABEL: Record<SlaRule, string> = {
  "SLA-0": "Chưa phản hồi tin nhắn > 5 phút",
  "SLA-1": "Chưa bàn giao lead > 4 giờ",
  "SLA-2": "Chưa phân công Sale > 30 phút",
  "SLA-3": "Chưa liên hệ khách > 3 giờ",
  "SLA-4": "Lead im lặng > 2 ngày",
};

export type SlaInput = {
  firstMessageAt?: Date | null;
  respondedAt?: Date | null;
  qualifiedAt?: Date | null;
  handedAt?: Date | null;
  receivedConfirmedAt?: Date | null;
  assignedAt?: Date | null;
  firstContactAt?: Date | null;
  lastActivityAt?: Date | null;
  resolved?: boolean;
};

const over = (start: Date | null | undefined, now: Date, ms: number): boolean =>
  start != null && now.getTime() - start.getTime() > ms;

/** Trả danh sách rule bị vi phạm tại thời điểm `now`. THUẦN. */
export function evaluateSla(input: SlaInput, now: Date): SlaRule[] {
  const v: SlaRule[] = [];
  // SLA-0 — đã có tin đến nhưng chưa phản hồi.
  if (!input.respondedAt && over(input.firstMessageAt, now, SLA_THRESHOLDS["SLA-0"])) v.push("SLA-0");
  // SLA-1 — đã L2 nhưng chưa bàn giao.
  if (!input.handedAt && over(input.qualifiedAt, now, SLA_THRESHOLDS["SLA-1"])) v.push("SLA-1");
  // SLA-2 — đã tiếp nhận/bàn giao nhưng chưa phân công.
  const handoverBase = input.receivedConfirmedAt ?? input.handedAt;
  if (!input.assignedAt && over(handoverBase, now, SLA_THRESHOLDS["SLA-2"])) v.push("SLA-2");
  // SLA-3 — đã phân công nhưng chưa liên hệ.
  if (!input.firstContactAt && over(input.assignedAt, now, SLA_THRESHOLDS["SLA-3"])) v.push("SLA-3");
  // SLA-4 — lead im lặng quá lâu (chưa xử lý xong).
  if (!input.resolved && over(input.lastActivityAt, now, SLA_THRESHOLDS["SLA-4"])) v.push("SLA-4");
  return v;
}

/**
 * Quét lead → sinh StaffNotification cho mỗi vi phạm (idempotent qua dedupeKey, C6.6).
 * Người nhận: assignedToId (ưu tiên) → adminId. Không có người nhận → bỏ qua.
 */
export async function runSlaCheck(now = new Date()): Promise<{ violations: number; notified: number }> {
  const leads = await db.lead.findMany({
    where: { deletedAt: null, convertedAt: null },
    select: {
      id: true, assignedToId: true, adminId: true,
      qualifiedAt: true, handedAt: true, receivedConfirmedAt: true,
      assignedAt: true, firstContactAt: true, updatedAt: true,
    },
  });

  let violations = 0;
  let notified = 0;
  for (const lead of leads) {
    const rules = evaluateSla(
      {
        qualifiedAt: lead.qualifiedAt,
        handedAt: lead.handedAt,
        receivedConfirmedAt: lead.receivedConfirmedAt,
        assignedAt: lead.assignedAt,
        firstContactAt: lead.firstContactAt,
        lastActivityAt: lead.updatedAt,
      },
      now,
    );
    violations += rules.length;
    const userId = lead.assignedToId ?? lead.adminId;
    if (!userId) continue;
    for (const rule of rules) {
      await db.staffNotification.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey: `sla:${rule}:${lead.id}` } },
        update: { body: SLA_LABEL[rule] },
        create: {
          userId,
          category: "SLA",
          title: `Cảnh báo SLA (${rule})`,
          body: SLA_LABEL[rule],
          href: `/leads/${lead.id}`,
          dedupeKey: `sla:${rule}:${lead.id}`,
        },
      });
      notified++;
    }
  }
  return { violations, notified };
}
