// lib/observability/slo.ts — R6-G3: 4 metric SLO + alert (event pending, webhook fail,
// email queue, cron lag). evaluateSlo() THUẦN (ngưỡng→alert, T1); dedupe để không spam (T6).
import { db } from "@/lib/db";

export type SloMetricKey = "eventPending" | "webhookFail" | "emailQueueBacklog" | "cronLagMinutes";

export type SloThreshold = { key: SloMetricKey; label: string; max: number };

/** Ngưỡng cảnh báo mỗi metric (vượt → alert). */
export const SLO_THRESHOLDS: SloThreshold[] = [
  { key: "eventPending", label: "DomainEvent PENDING tồn", max: 50 },
  { key: "webhookFail", label: "Event FAILED (webhook/handler)", max: 10 },
  { key: "emailQueueBacklog", label: "Email queue chờ gửi", max: 100 },
  { key: "cronLagMinutes", label: "Cron trễ (phút)", max: 30 },
];

export type SloAlert = { key: SloMetricKey; label: string; value: number; threshold: number };

/** THUẦN — metric nào vượt ngưỡng → alert (T1). */
export function evaluateSlo(
  metrics: Partial<Record<SloMetricKey, number>>,
  thresholds: SloThreshold[] = SLO_THRESHOLDS,
): SloAlert[] {
  const out: SloAlert[] = [];
  for (const t of thresholds) {
    const value = metrics[t.key] ?? 0;
    if (value > t.max) out.push({ key: t.key, label: t.label, value, threshold: t.max });
  }
  return out;
}

/**
 * THUẦN — bỏ alert đã bắn gần đây (dedupe, T6). `firedKeys` = key đã alert trong cửa sổ.
 * Trả về alert MỚI cần gửi.
 */
export function dedupeAlerts(alerts: SloAlert[], firedKeys: Iterable<string>): SloAlert[] {
  const fired = new Set(firedKeys);
  return alerts.filter((a) => !fired.has(a.key));
}

/** Thu thập 4 metric từ DB (now để tính cron lag). */
export async function collectSloMetrics(now: Date = new Date()): Promise<Record<SloMetricKey, number>> {
  const [eventPending, webhookFail, emailQueueBacklog, lastDone] = await Promise.all([
    db.domainEvent.count({ where: { status: "PENDING" } }),
    db.domainEvent.count({ where: { status: "FAILED" } }),
    db.emailQueue.count({ where: { status: "PENDING" } }),
    db.domainEvent.findFirst({ where: { status: "DONE" }, orderBy: { processedAt: "desc" }, select: { processedAt: true } }),
  ]);
  // Cron lag = phút kể từ event DONE gần nhất (proxy "dispatcher còn chạy"). Không có → 0.
  const lastProcessed = lastDone?.processedAt ?? null;
  const cronLagMinutes = lastProcessed ? Math.floor((now.getTime() - lastProcessed.getTime()) / 60000) : 0;
  return { eventPending, webhookFail, emailQueueBacklog, cronLagMinutes };
}

/** Tiện ích: thu thập + đánh giá (chưa dedupe — caller lo persistence dedupe). */
export async function checkSlo(now?: Date): Promise<SloAlert[]> {
  return evaluateSlo(await collectSloMetrics(now));
}
