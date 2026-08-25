/**
 * scripts/b02-do-thuc-thu.ts — B-02 · quyết định B3 (24/08/2026), §B.6.8 "đo trước".
 *
 * CHỈ ĐỌC. Không ghi một dòng nào. Việc duy nhất của nó: nói ra con số kế toán và
 * marketing sẽ TỤT bao nhiêu khi bản sửa "thực thu" lên prod, để báo trước cho người
 * dùng thay vì để họ tự phát hiện bằng cách hoảng.
 *
 *   pnpm tsx scripts/b02-do-thuc-thu.ts
 *
 * In ra, cho toàn hệ thống và cho từng cơ sở:
 *   · CŨ-A  = Σ Order.totalAmount (đơn CONFIRMED/COMPLETED)  ← màn kế toán + ROAS cũ
 *   · CŨ-B  = Σ Payment.amount (accountantStatus = CONFIRMED) ← báo cáo doanh thu cũ
 *   · MỚI   = thực thu (WHERE_THUC_THU): CONFIRMED + hoàn (âm) + bản điều chỉnh,
 *             đã loại bản gốc bị thay thế
 * Kèm phần bóc tách để biết mức tụt đến từ đâu (hoàn bao nhiêu, điều chỉnh bao nhiêu).
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { WHERE_THUC_THU } from "../lib/finance/thuc-thu";

const db = scriptDb();

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
const pct = (cu: number, moi: number) => (cu === 0 ? "—" : `${(((moi - cu) / cu) * 100).toFixed(1)}%`);

async function main() {
  console.log(`DB đang trỏ tới: ${currentDbHost()}`);
  console.log("CHỈ ĐỌC — script này không ghi gì.\n");

  const [cuA, cuB, moi, sumConfirmed, sumRefunded, sumAdjusted, soBanGocBiThayThe] = await Promise.all([
    db.order.aggregate({ where: { status: { in: ["CONFIRMED", "COMPLETED"] } }, _sum: { totalAmount: true } }),
    db.payment.aggregate({ where: { accountantStatus: "CONFIRMED", deletedAt: null }, _sum: { amount: true } }),
    db.payment.aggregate({ where: WHERE_THUC_THU, _sum: { amount: true } }),
    db.payment.aggregate({ where: { accountantStatus: "CONFIRMED", deletedAt: null }, _sum: { amount: true }, _count: true }),
    db.payment.aggregate({ where: { accountantStatus: "REFUNDED", deletedAt: null }, _sum: { amount: true }, _count: true }),
    db.payment.aggregate({ where: { accountantStatus: "ADJUSTED", deletedAt: null }, _sum: { amount: true }, _count: true }),
    db.payment.count({
      where: { deletedAt: null, adjustments: { some: { accountantStatus: "ADJUSTED", deletedAt: null } } },
    }),
  ]);

  const a = cuA._sum.totalAmount ?? 0;
  const b = cuB._sum.amount ?? 0;
  const m = moi._sum.amount ?? 0;

  console.log("=== TOÀN HỆ THỐNG ===");
  console.log(`CŨ-A  màn kế toán + ROAS (Σ Order.totalAmount) : ${vnd(a)}`);
  console.log(`CŨ-B  báo cáo doanh thu (Σ Payment CONFIRMED)  : ${vnd(b)}`);
  console.log(`MỚI   thực thu (B3)                            : ${vnd(m)}`);
  console.log(`  → màn kế toán/ROAS đổi ${vnd(m - a)} (${pct(a, m)})`);
  console.log(`  → báo cáo doanh thu đổi ${vnd(m - b)} (${pct(b, m)})\n`);

  console.log("=== MỨC TỤT ĐẾN TỪ ĐÂU ===");
  console.log(`Σ CONFIRMED               : ${vnd(sumConfirmed._sum.amount ?? 0)} (${sumConfirmed._count} bút toán)`);
  console.log(`Σ REFUNDED (đã mang dấu âm): ${vnd(sumRefunded._sum.amount ?? 0)} (${sumRefunded._count} bút toán)`);
  console.log(`Σ ADJUSTED (bản thay thế)  : ${vnd(sumAdjusted._sum.amount ?? 0)} (${sumAdjusted._count} bút toán)`);
  console.log(`Bản gốc bị điều chỉnh thay thế (bị loại khỏi phép cộng): ${soBanGocBiThayThe}\n`);

  console.log("=== THEO CƠ SỞ ===");
  const [centers, donTheoCoSo, thucThuTheoCoSo] = await Promise.all([
    db.center.findMany({ select: { id: true, name: true } }),
    db.order.groupBy({
      by: ["centerId"],
      where: { status: { in: ["CONFIRMED", "COMPLETED"] } },
      _sum: { totalAmount: true },
    }),
    db.payment.groupBy({ by: ["centerId"], where: WHERE_THUC_THU, _sum: { amount: true } }),
  ]);
  const ten = new Map(centers.map((c) => [c.id, c.name]));
  const moiTheoCoSo = new Map(thucThuTheoCoSo.map((r) => [r.centerId ?? "", r._sum.amount ?? 0]));
  const khoa = new Set<string>([
    ...donTheoCoSo.map((r) => r.centerId ?? ""),
    ...moiTheoCoSo.keys(),
  ]);
  for (const k of khoa) {
    const cu = donTheoCoSo.find((r) => (r.centerId ?? "") === k)?._sum.totalAmount ?? 0;
    const mo = moiTheoCoSo.get(k) ?? 0;
    const nhan = k === "" ? "(chưa gán cơ sở)" : (ten.get(k) ?? k);
    console.log(`${nhan.padEnd(24)} CŨ-A ${vnd(cu).padStart(18)} → MỚI ${vnd(mo).padStart(18)}  (${pct(cu, mo)})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
