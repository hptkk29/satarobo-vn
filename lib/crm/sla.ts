// lib/crm/sla.ts — R1-06: SLA engine phễu SR.QD.217 (Doc 15 §5.4).
// evaluateSla THUẦN (C6.1–C6.5) + runSlaCheck (cron → StaffNotification dedupeKey, C6.6).
import type { LeadStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/service";

export type SlaRule = "SLA-0" | "SLA-1" | "SLA-2" | "SLA-3" | "SLA-4";

export type SlaThresholds = Record<SlaRule, number>;

/** Ngưỡng vi phạm (ms) — default = hằng số gốc (fallback khi chưa cấu hình). */
export const SLA_THRESHOLDS: SlaThresholds = {
  "SLA-0": 5 * 60_000, // chưa respond > 5'
  "SLA-1": 4 * 3_600_000, // chưa bàn giao > 4h
  "SLA-2": 30 * 60_000, // chưa phân công > 30'
  "SLA-3": 3 * 3_600_000, // chưa liên hệ > 3h
  "SLA-4": 2 * 86_400_000, // lead im > 2 ngày
};

/** Đọc ngưỡng SLA động từ SystemSetting "crm.sla.*" (phút → ms). */
export async function loadSlaThresholds(): Promise<SlaThresholds> {
  const [respond, handover, assign, contact, silent] = await Promise.all([
    getSetting("crm.sla.respondMinutes"),
    getSetting("crm.sla.handoverMinutes"),
    getSetting("crm.sla.assignMinutes"),
    getSetting("crm.sla.contactMinutes"),
    getSetting("crm.sla.silentMinutes"),
  ]);
  return {
    "SLA-0": respond * 60_000,
    "SLA-1": handover * 60_000,
    "SLA-2": assign * 60_000,
    "SLA-3": contact * 60_000,
    "SLA-4": silent * 60_000,
  };
}

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

/** Trả danh sách rule bị vi phạm tại thời điểm `now`. THUẦN.
 * `thresholds` cho phép truyền ngưỡng động (SystemSetting); mặc định hằng số gốc. */
export function evaluateSla(
  input: SlaInput,
  now: Date,
  thresholds: SlaThresholds = SLA_THRESHOLDS,
): SlaRule[] {
  const v: SlaRule[] = [];
  // SLA-0 — đã có tin đến nhưng chưa phản hồi.
  if (!input.respondedAt && over(input.firstMessageAt, now, thresholds["SLA-0"])) v.push("SLA-0");
  // SLA-1 — đã L2 nhưng chưa bàn giao.
  if (!input.handedAt && over(input.qualifiedAt, now, thresholds["SLA-1"])) v.push("SLA-1");
  // SLA-2 — đã tiếp nhận/bàn giao nhưng chưa phân công.
  const handoverBase = input.receivedConfirmedAt ?? input.handedAt;
  if (!input.assignedAt && over(handoverBase, now, thresholds["SLA-2"])) v.push("SLA-2");
  // SLA-3 — đã phân công nhưng chưa liên hệ.
  if (!input.firstContactAt && over(input.assignedAt, now, thresholds["SLA-3"])) v.push("SLA-3");
  // SLA-4 — lead im lặng quá lâu (chưa xử lý xong).
  if (!input.resolved && over(input.lastActivityAt, now, thresholds["SLA-4"])) v.push("SLA-4");
  return v;
}

// =============================================================================
// R7-01 — Lead idle rule (lead chưa xử lý im lặng quá lâu).
// =============================================================================

/**
 * Lead "idle" khi đang ở NEW/ASSIGNED và `lastActivityAt` cách `now` quá `idleHours` giờ.
 * THUẦN. lastActivityAt = null → NOT idle (UI/cron sẽ set lastActivityAt).
 */
export function isLeadIdle(
  input: { status: LeadStatus; lastActivityAt: Date | null; createdAt?: Date | null },
  now: Date,
  idleHours: number,
): boolean {
  if (input.status !== "NEW" && input.status !== "ASSIGNED") return false;
  // R7-01 fix (G3): lead mới chưa có hoạt động → mốc tham chiếu = createdAt, để rule
  // idle vẫn bắt được lead NEW bị bỏ quên (lastActivityAt chỉ set khi có LeadActivity).
  const ref = input.lastActivityAt ?? input.createdAt ?? null;
  if (ref == null) return false;
  return now.getTime() - ref.getTime() > idleHours * 3_600_000;
}

/**
 * Quét lead → sinh StaffNotification cho mỗi vi phạm (idempotent qua dedupeKey, C6.6).
 * Người nhận: assignedToId (ưu tiên) → adminId. Không có người nhận → bỏ qua.
 */
export async function runSlaCheck(now = new Date()): Promise<{ violations: number; notified: number }> {
  const thresholds = await loadSlaThresholds();
  const idleHours = await getSetting("sla.leadIdleHours");
  const leads = await db.lead.findMany({
    where: { deletedAt: null, convertedAt: null },
    select: {
      id: true, assignedToId: true, adminId: true, status: true,
      qualifiedAt: true, handedAt: true, receivedConfirmedAt: true,
      assignedAt: true, firstContactAt: true, updatedAt: true, lastActivityAt: true,
      createdAt: true,
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
      thresholds,
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

    // R7-01 — lead im lặng (NEW/ASSIGNED quá idleHours giờ) → 1 cảnh báo idempotent.
    if (isLeadIdle({ status: lead.status, lastActivityAt: lead.lastActivityAt, createdAt: lead.createdAt }, now, idleHours)) {
      const idleBody = `Lead chưa được xử lý quá ${idleHours} giờ`;
      const idleKey = `sla:idle24:${lead.id}`;
      await db.staffNotification.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey: idleKey } },
        update: { body: idleBody },
        create: {
          userId,
          category: "SLA",
          title: "Cảnh báo lead im lặng",
          body: idleBody,
          href: `/leads/${lead.id}`,
          dedupeKey: idleKey,
        },
      });
      notified++;
    }
  }
  return { violations, notified };
}
