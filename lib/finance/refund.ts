import "server-only";
import { db } from "@/lib/db";

// =============================================================================
// LMS-9 — Hoàn tiền theo vòng đời (rút / chuyển / hủy lớp).
// computeRefund THUẦN: prorate theo buổi đã học (mặc định). Tiền VND số nguyên.
//   earned     = finalPrice * (buổi đã học / tổng buổi)   (làm tròn)
//   refundable = max(0, đã đóng (net) − earned)
// Chính sách khác: FULL (hoàn hết đã đóng), NONE (không hoàn).
// Ghi sổ thực tế vẫn qua refundPayment (kế toán) — đây là lớp TÍNH + ĐỀ XUẤT.
// =============================================================================

export type RefundPolicy = "PRORATE_SESSION" | "FULL" | "NONE";

export type RefundInput = {
  finalPrice: number;
  confirmedPaid: number;
  sessionsTotal: number;
  sessionsUsed: number;
  policy?: RefundPolicy;
};

export type RefundResult = {
  policy: RefundPolicy;
  earned: number;
  refundable: number;
};

/** PURE — số tiền nên hoàn theo chính sách. */
export function computeRefund(input: RefundInput): RefundResult {
  const policy = input.policy ?? "PRORATE_SESSION";
  const paid = Math.max(0, Math.round(input.confirmedPaid));

  if (policy === "NONE") return { policy, earned: paid, refundable: 0 };
  if (policy === "FULL") return { policy, earned: 0, refundable: paid };

  const total = input.sessionsTotal > 0 ? input.sessionsTotal : 0;
  const used = Math.max(0, Math.min(input.sessionsUsed, total || input.sessionsUsed));
  const earned =
    total > 0 ? Math.round(input.finalPrice * (used / total)) : input.finalPrice;
  const refundable = Math.max(0, paid - earned);
  return { policy, earned, refundable };
}

export type RefundSuggestion = RefundResult & {
  enrollmentId: string;
  finalPrice: number;
  confirmedPaid: number;
  sessionsTotal: number;
  sessionsUsed: number;
};

/**
 * Gom dữ liệu 1 enrollment + tính đề xuất hoàn tiền (read-only).
 * buổi đã học = ClassSession COMPLETED của lớp; tổng buổi = ClassSession chưa hủy.
 */
export async function suggestEnrollmentRefund(
  enrollmentId: string,
  policy?: RefundPolicy,
): Promise<RefundSuggestion | null> {
  const enr = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { id: true, finalPrice: true, classId: true },
  });
  if (!enr) return null;

  const [paidAgg, sessionsTotal, sessionsUsed] = await Promise.all([
    db.payment.aggregate({
      where: {
        enrollmentId,
        accountantStatus: { in: ["CONFIRMED", "REFUNDED"] },
        deletedAt: null,
      },
      _sum: { amount: true },
    }),
    db.classSession.count({ where: { classId: enr.classId, status: { not: "CANCELLED" } } }),
    db.classSession.count({ where: { classId: enr.classId, status: "COMPLETED" } }),
  ]);

  const confirmedPaid = paidAgg._sum.amount ?? 0;
  const result = computeRefund({
    finalPrice: enr.finalPrice ?? 0,
    confirmedPaid,
    sessionsTotal,
    sessionsUsed,
    policy,
  });
  return {
    ...result,
    enrollmentId,
    finalPrice: enr.finalPrice ?? 0,
    confirmedPaid,
    sessionsTotal,
    sessionsUsed,
  };
}
