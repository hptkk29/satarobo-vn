// lib/crm/commission.ts — R1-10: engine hoa hồng 4 tầng (SR.QD.217, tiền — THUẦN).
// QC 1% · Sale Admin 1% · Sale 4% · QL TT 2% (Σ 8%). Tách tính toán khỏi DB/UI để
// test phủ cao (C10.1–C10.5). Persistence (DRAFT→APPROVED) + "của tôi" = phần DB sau.

export type CommissionTier = "QC" | "SALE_ADMIN" | "SALE" | "QL_TT";

export const COMMISSION_TIERS: CommissionTier[] = ["QC", "SALE_ADMIN", "SALE", "QL_TT"];

/** % mặc định mỗi tầng (Σ = 8%). */
export const DEFAULT_RATES: Record<CommissionTier, number> = {
  QC: 0.01,
  SALE_ADMIN: 0.01,
  SALE: 0.04,
  QL_TT: 0.02,
};

export const MAX_TOTAL_RATE = 0.08;

export class CommissionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CommissionError";
    this.code = code;
  }
}

export type CommissionLine = {
  tier: CommissionTier;
  recipientId: string;
  amount: number; // VND (làm tròn); âm = clawback
  isClawback?: boolean;
};

function mergedRates(rates?: Partial<Record<CommissionTier, number>>): Record<CommissionTier, number> {
  return { ...DEFAULT_RATES, ...(rates ?? {}) };
}

/** C10.2 — Σ rate > 8% → từ chối lưu config. */
export function validateRates(rates?: Partial<Record<CommissionTier, number>>): Record<CommissionTier, number> {
  const merged = mergedRates(rates);
  const total = COMMISSION_TIERS.reduce((s, t) => s + (merged[t] ?? 0), 0);
  if (total > MAX_TOTAL_RATE + 1e-9) {
    throw new CommissionError("RATE_EXCEEDS_CAP", `Tổng tỉ lệ ${(total * 100).toFixed(2)}% vượt trần 8%.`);
  }
  return merged;
}

/**
 * Tính hoa hồng cho 1 đơn chốt.
 * - isRenewal=true → KHÔNG có hoa hồng 4 tầng (C10.3, OI-26/B2).
 * - recipients.SALE = người CHỐT CUỐI (đổi sale giữa chừng → truyền người cuối — C10.5).
 * - Chỉ sinh dòng cho tầng có recipient.
 */
export function computeCommission(input: {
  revenue: number;
  isRenewal: boolean;
  recipients: Partial<Record<CommissionTier, string>>;
  rates?: Partial<Record<CommissionTier, number>>;
}): CommissionLine[] {
  const rates = validateRates(input.rates);
  if (input.isRenewal) return [];
  if (input.revenue <= 0) return [];
  const lines: CommissionLine[] = [];
  for (const tier of COMMISSION_TIERS) {
    const recipientId = input.recipients[tier];
    if (!recipientId) continue;
    lines.push({ tier, recipientId, amount: Math.round(input.revenue * rates[tier]) });
  }
  return lines;
}

/**
 * C10.4 — Refund → clawback dòng ÂM kỳ sau theo tỉ lệ hoàn (ratio 0..1).
 * Dựa trên các dòng hoa hồng gốc đã chi.
 */
export function computeClawback(originalLines: CommissionLine[], refundRatio: number): CommissionLine[] {
  if (refundRatio <= 0) return [];
  const ratio = Math.min(1, refundRatio);
  return originalLines
    .filter((l) => l.amount > 0)
    .map((l) => ({
      tier: l.tier,
      recipientId: l.recipientId,
      amount: -Math.round(l.amount * ratio),
      isClawback: true,
    }));
}
