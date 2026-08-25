// lib/crm/commission.ts — R1-10: engine hoa hồng 4 tầng (SR.QD.217, tiền — THUẦN).
// QC 1% · Sale Admin 1% · Sale 4% · QL TT 2% (Σ 8%). Tách tính toán khỏi DB/UI để
// test phủ cao (C10.1–C10.5). Persistence (DRAFT→APPROVED) + "của tôi" = phần DB sau.

export type CommissionTier = "QC" | "SALE_ADMIN" | "SALE" | "QL_TT" | "GIAO_VIEN";

export const COMMISSION_TIERS: CommissionTier[] = [
  "QC",
  "SALE_ADMIN",
  "SALE",
  "QL_TT",
  // GĐ6 (chủ dự án chốt câu 7, 25/08/2026) — thêm tầng GIÁO VIÊN 1% theo SR.QD.210.
  // Cột `CommissionLine.tier` trong DB là String chứ không phải enum, nên thêm tầng
  // KHÔNG cần migration đổi kiểu.
  "GIAO_VIEN",
];

/** % mặc định mỗi tầng (Σ = 9% sau khi thêm tầng giáo viên). */
export const DEFAULT_RATES: Record<CommissionTier, number> = {
  QC: 0.01,
  SALE_ADMIN: 0.01,
  SALE: 0.04,
  QL_TT: 0.02,
  GIAO_VIEN: 0.01,
};

/**
 * Trần tổng tỉ lệ.
 *
 * GĐ6 — NỚI TỪ 8% LÊN 9% theo chốt câu 7 (phương án A: nới trần, không chia lại).
 * Phương án B là giữ 8% và hạ một tầng đang có xuống, tức có người bị giảm thu nhập;
 * chủ dự án chọn A.
 */
export const MAX_TOTAL_RATE = 0.09;

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

/**
 * C10.2 — Σ rate vượt trần → từ chối lưu config.
 * Thông điệp đọc thẳng từ `MAX_TOTAL_RATE`: trước GĐ6 con số 8% được viết cứng trong
 * chuỗi, nên nới trần mà quên sửa chuỗi là báo lỗi sai cho người dùng.
 */
export function validateRates(rates?: Partial<Record<CommissionTier, number>>): Record<CommissionTier, number> {
  const merged = mergedRates(rates);
  const total = COMMISSION_TIERS.reduce((s, t) => s + (merged[t] ?? 0), 0);
  if (total > MAX_TOTAL_RATE + 1e-9) {
    throw new CommissionError(
      "RATE_EXCEEDS_CAP",
      `Tổng tỉ lệ ${(total * 100).toFixed(2)}% vượt trần ${(MAX_TOTAL_RATE * 100).toFixed(0)}%.`,
    );
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
  /**
   * GĐ6 — ĐỢT THU thứ mấy của cùng một hợp đồng (1 = đợt đầu). Bỏ trống = đợt 1.
   *
   * ⚠️ Tham số này tồn tại để MỤC 9.2 đổi được bằng cấu hình chứ không phải sửa code.
   * Câu chưa chốt: chính sách ghi "kỳ 1 mức học viên mới, các kỳ sau mức tái tục",
   * nhưng không nói "kỳ" là ĐỢT THANH TOÁN hay CHU KỲ HỢP ĐỒNG. Khoá 48 buổi chia 2
   * đợt thì hai cách hiểu chênh 3% trên nửa học phí.
   */
  soDot?: number;
  /**
   * Đợt thứ 2 trở đi có bị tính như tái tục không.
   *
   * `false` (MẶC ĐỊNH, và là phương án đang đề xuất): một hợp đồng = một kỳ, chia mấy
   * đợt thu cũng vẫn là khách mới. Lý do: nếu đợt 2 xuống mức tái tục thì Sale có động
   * cơ ép phụ huynh đóng full, mất đúng nhóm khách khó khăn tài chính.
   *
   * `true`: đợt 2 trở đi coi như tái tục (không hoa hồng 4 tầng).
   *
   * ĐỪNG hardcode cách hiểu nào vào chỗ khác — truyền cờ này từ cấu hình.
   */
  dotSauTinhTaiTuc?: boolean;
}): CommissionLine[] {
  const rates = validateRates(input.rates);
  if (input.isRenewal) return [];
  // Mục 9.2 — chỉ có tác dụng khi cờ được BẬT tường minh.
  if (input.dotSauTinhTaiTuc === true && (input.soDot ?? 1) > 1) return [];
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
