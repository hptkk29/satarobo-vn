import { db } from "@/lib/db";

/**
 * Generate next order code: ORD-YYMMDD-NNNNNN (sequential per day).
 * Example: ORD-260521-000001
 *
 * Suitable for moderate concurrency (< 100 orders/sec per day). For higher
 * volume, switch to advisory locks or DB sequence.
 */
export async function generateOrderCode(): Promise<string> {
  const now = new Date();
  const yymmdd =
    String(now.getFullYear()).slice(2) +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const prefix = `ORD-${yymmdd}-`;

  const lastOrder = await db.order.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });

  let nextSeq = 1;
  if (lastOrder) {
    const lastSeq = parseInt(lastOrder.code.slice(prefix.length), 10);
    if (!Number.isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  return `${prefix}${String(nextSeq).padStart(6, "0")}`;
}
