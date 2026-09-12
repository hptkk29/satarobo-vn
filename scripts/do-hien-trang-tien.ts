/**
 * ĐO HIỆN TRẠNG MODULE TIỀN — CHỈ ĐỌC, không ghi một dòng nào.
 *
 *   pnpm exec tsx scripts/do-hien-trang-tien.ts
 *
 * VÌ SAO CÓ FILE NÀY (13/09/2026): `shadow-compare-debt.ts` trả lời "công nợ hai sổ
 * lệch bao nhiêu", nhưng KHÔNG trả lời mấy câu quyết định lộ trình:
 *   • Sổ mới trên prod có dữ liệu chưa? (0 `BankTransaction` thì "lệch 100%" là tầm
 *     thường, không phải bệnh — và thứ tự vá PHA 1 phải đổi.)
 *   • PHA 2 bỏ duyệt đơn sẽ phải migrate BAO NHIÊU đơn đang treo `PENDING_APPROVAL`?
 *   • PHA 3 bỏ trần 2 đợt: prod có đơn nào đã >2 đợt chưa?
 *   • R-01 (khoản backfill vô hình với cơ chế chống trùng): prod có bao nhiêu khoản
 *     mang dấu `[backfill-import]`?
 *   • R-02 (huỷ phiếu đã có tiền rót vào): bao nhiêu đơn đang ở đúng thế nguy hiểm?
 *
 * Không dùng `scopedDb` — đây là script vận hành đếm toàn hệ thống, không có actor.
 *
 * ⚠️ TRÊN PROD: chạy qua GitHub workflow `shadow-compare-cong-no.yml`, KHÔNG chạy từ
 * máy dev (`.env` ở máy trỏ DB DEV — xem memory "Chạy script trên PROD").
 */
// PHẢI đứng TRƯỚC import lib/db.
import { currentDbHost } from "./_load-env";
import { db } from "../lib/db";

function bang(tieuDe: string, dong: [string, number | string][]): void {
  console.log(`\n── ${tieuDe} ──`);
  const rong = Math.max(...dong.map(([k]) => k.length));
  for (const [k, v] of dong) {
    console.log(`  ${k.padEnd(rong)}  ${String(v).padStart(9)}`);
  }
}

async function main(): Promise<void> {
  console.log(`\n═══ HIỆN TRẠNG MODULE TIỀN (chỉ đọc) ═══`);
  console.log(`DB host: ${currentDbHost()}`);

  // ── 1. Sổ mới có dữ liệu chưa ──────────────────────────────────────────────
  // Nếu mấy số này bằng 0 thì mọi đơn đều "lệch" vì sổ mới TRỐNG, không phải vì
  // tính toán sai — và việc cần làm là backfill, không phải vá công thức.
  const [soDon, soPhieu, soPhanBo, soGiaoDich, soQr, soCredit, soDot] = await Promise.all([
    db.order.count({ where: { deletedAt: null } }),
    db.paymentRequest.count(),
    db.paymentAllocation.count(),
    db.bankTransaction.count(),
    db.qrSession.count(),
    db.creditBalance.count(),
    db.orderInstallment.count(),
  ]);
  bang("Quy mô 7 sổ tiền", [
    ["Order (chưa xoá mềm)", soDon],
    ["OrderInstallment  (sổ CŨ, Ledger-B)", soDot],
    ["PaymentRequest    (sổ MỚI)", soPhieu],
    ["PaymentAllocation (sổ MỚI)", soPhanBo],
    ["BankTransaction", soGiaoDich],
    ["QrSession", soQr],
    ["CreditBalance", soCredit],
  ]);

  // ── 2. Cờ duyệt — lượng dữ liệu PHA 2 phải migrate ─────────────────────────
  const [ktgTreo, ktgDuyet, ktgBac, ktgNull, ggTreo, ggDuyet, ggBac, ggNull] =
    await Promise.all([
      db.order.count({ where: { deletedAt: null, installmentApprovalStatus: "PENDING_APPROVAL" } }),
      db.order.count({ where: { deletedAt: null, installmentApprovalStatus: "APPROVED" } }),
      db.order.count({ where: { deletedAt: null, installmentApprovalStatus: "REJECTED" } }),
      db.order.count({ where: { deletedAt: null, installmentApprovalStatus: null } }),
      db.order.count({ where: { deletedAt: null, discountApprovalStatus: "PENDING_APPROVAL" } }),
      db.order.count({ where: { deletedAt: null, discountApprovalStatus: "APPROVED" } }),
      db.order.count({ where: { deletedAt: null, discountApprovalStatus: "REJECTED" } }),
      db.order.count({ where: { deletedAt: null, discountApprovalStatus: null } }),
    ]);
  bang("Cờ duyệt KẾ HOẠCH TRẢ GÓP (PHA 2 phải migrate)", [
    ["PENDING_APPROVAL  ← treo, cần quyết", ktgTreo],
    ["APPROVED", ktgDuyet],
    ["REJECTED", ktgBac],
    ["null (không cần duyệt)", ktgNull],
  ]);
  bang("Cờ duyệt GIẢM GIÁ (PHA 2 phải migrate)", [
    ["PENDING_APPROVAL  ← treo, cần quyết", ggTreo],
    ["APPROVED", ggDuyet],
    ["REJECTED", ggBac],
    ["null (không giảm giá tay)", ggNull],
  ]);

  // ── 3. Trần 2 đợt — prod đã vượt chưa (PHA 3) ──────────────────────────────
  const theoSoDot = await db.orderInstallment.groupBy({
    by: ["soDot"],
    _count: { _all: true },
    orderBy: { soDot: "asc" },
  });
  bang(
    "OrderInstallment theo soDot (PHA 3 — trần 2 đợt)",
    theoSoDot.length > 0
      ? theoSoDot.map((r) => [`soDot = ${r.soDot}`, r._count._all] as [string, number])
      : [["(không có dòng nào)", 0]],
  );

  // ── 4. R-01 — khoản backfill vô hình với cơ chế chống trùng ────────────────
  // `ensureOrderPaymentRecorded` chỉ tra marker `[auto:`; `recordInstallmentPlan` chỉ
  // xoá mềm khoản chứa `[auto:`. Khoản `[backfill-import]` nằm ngoài CẢ HAI ⇒ lưu kế
  // hoạch trên đơn backfill sinh thêm một khoản bằng đúng số khách đã đóng.
  const [khoanBackfill, khoanAuto, donCoCaHai] = await Promise.all([
    db.payment.count({ where: { deletedAt: null, note: { contains: "[backfill-import]" } } }),
    db.payment.count({ where: { deletedAt: null, note: { contains: "[auto:" } } }),
    // Đơn có ĐỒNG THỜI khoản backfill và khoản auto = đã cộng đôi, hoặc sắp cộng đôi.
    db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM (
        SELECT "orderId"
        FROM "Payment"
        WHERE "deletedAt" IS NULL AND "orderId" IS NOT NULL
        GROUP BY "orderId"
        HAVING BOOL_OR("note" LIKE '%[backfill-import]%')
           AND BOOL_OR("note" LIKE '%[auto:%')
      ) t`,
  ]);
  bang("R-01 — dấu chống trùng của khoản thu", [
    ["Payment có [backfill-import]", khoanBackfill],
    ["Payment có [auto:…]", khoanAuto],
    ["Đơn có CẢ HAI dấu ← nghi cộng đôi", Number(donCoCaHai[0]?.n ?? 0)],
  ]);

  // ── 5. R-02 — đơn ở thế "huỷ phiếu đã có tiền" ─────────────────────────────
  // Thế nguy hiểm: phiếu "thu toàn đơn" (installmentNo = 0) ĐÃ có allocation, mà đơn
  // đó cũng đã có kế hoạch trả góp ⇒ lần lưu/duyệt kế hoạch tới sẽ VOID phiếu đang
  // giữ tiền. Đây đúng là đường đi của nghiệp vụ CỌC.
  const nguyHiemR02 = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT pr."orderId")::bigint AS n
    FROM "PaymentRequest" pr
    JOIN "PaymentAllocation" pa ON pa."paymentRequestId" = pr."id"
    WHERE pr."installmentNo" = 0
      AND EXISTS (SELECT 1 FROM "OrderInstallment" oi WHERE oi."orderId" = pr."orderId")`;
  const phieuToanDonCoTien = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT pr."id")::bigint AS n
    FROM "PaymentRequest" pr
    JOIN "PaymentAllocation" pa ON pa."paymentRequestId" = pr."id"
    WHERE pr."installmentNo" = 0`;
  bang("R-02 — phiếu đã có tiền rót vào", [
    ["Phiếu 'thu toàn đơn' có allocation", Number(phieuToanDonCoTien[0]?.n ?? 0)],
    ["… trong đó đơn ĐÃ có kế hoạch đợt ← nguy", Number(nguyHiemR02[0]?.n ?? 0)],
  ]);

  // ── 6. R-04 — tiền về mà đợt vẫn PENDING ───────────────────────────────────
  // Đợt còn PENDING trên đơn mà sổ mới đã nhận tiền = cron đòi nợ người đã trả.
  const r04 = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT oi."orderId")::bigint AS n
    FROM "OrderInstallment" oi
    WHERE oi."status" = 'PENDING'
      AND EXISTS (
        SELECT 1 FROM "PaymentRequest" pr
        JOIN "PaymentAllocation" pa ON pa."paymentRequestId" = pr."id"
        WHERE pr."orderId" = oi."orderId"
      )`;
  const dotQuaHan = await db.orderInstallment.count({
    where: { status: "PENDING", dueDate: { not: null, lt: new Date() } },
  });
  bang("R-04 — đợt PENDING trong khi tiền đã về", [
    ["Đơn có đợt PENDING + đã có allocation", Number(r04[0]?.n ?? 0)],
    ["Đợt PENDING đã quá hạn (cron đang đòi)", dotQuaHan],
  ]);

  // ── 7. R-13 — dashboard kế toán cộng theo trạng thái đơn ───────────────────
  // Ô "Đã thu" của Dashboard Kế toán cộng nguyên `Order.totalAmount` của đơn
  // CONFIRMED. So với tiền THẬT đã ghi nhận (Payment RECORDED) để ra mức sai.
  const donChot = await db.order.aggregate({
    where: { deletedAt: null, status: { in: ["CONFIRMED", "COMPLETED"] } },
    _sum: { totalAmount: true },
    _count: { _all: true },
  });
  const daGhiNhan = await db.payment.aggregate({
    where: { deletedAt: null, saleStatus: "RECORDED" },
    _sum: { amount: true },
  });
  const tongDon = donChot._sum.totalAmount ?? 0;
  const tongThu = daGhiNhan._sum.amount ?? 0;
  const fmt = (n: number) => n.toLocaleString("vi-VN");
  bang("R-13 — ô 'Đã thu' của Dashboard Kế toán", [
    ["Số đơn CONFIRMED/COMPLETED", donChot._count._all],
    ["Dashboard ĐANG cộng (Σ totalAmount)", `${fmt(tongDon)}đ`],
    ["Tiền THẬT đã ghi nhận (Σ Payment)", `${fmt(tongThu)}đ`],
    ["Mức khai KHỐNG", `${fmt(tongDon - tongThu)}đ`],
  ]);

  // ── Kết luận: shadow-compare có đáng đọc theo cột lý do, hay chỉ đang báo "sổ trống"?
  //
  // "Nợ sổ mới" = Σ outstanding của `PaymentRequest`. Không có phiếu thì nợ sổ mới = 0
  // và MỌI đơn hiện ra là lệch — vì chưa backfill, không vì công thức sai. `BankTransaction`
  // KHÔNG đủ để kết luận sổ mới có dữ liệu: giao dịch ngân hàng nằm đó mà chưa rót vào
  // phiếu nào (`PaymentAllocation` = 0) thì sổ mới vẫn chưa biết gì về công nợ.
  const tyLePhieu = soDon > 0 ? soPhieu / soDon : 0;
  console.log();
  if (soPhieu === 0 || tyLePhieu < 0.5) {
    console.log(
      `⚠ SỔ MỚI CHƯA PHỦ: ${soPhieu} phiếu / ${soDon} đơn (${(tyLePhieu * 100).toFixed(1)}%), ` +
        `${soPhanBo} phân bổ.`,
    );
    console.log(
      `  ⇒ Con số "lệch" của shadow-compare phần lớn là "chưa backfill", KHÔNG phải lỗi tính.`,
    );
    console.log(`  ⇒ Việc cần làm trước là \`pnpm payments:backfill\`, không phải vá công thức.`);
  } else {
    console.log(
      `Sổ mới đã phủ ${(tyLePhieu * 100).toFixed(1)}% số đơn (${soPhanBo} phân bổ) ` +
        `⇒ lệch của shadow-compare là lệch THẬT, đọc theo cột lý do.`,
    );
  }
  console.log();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
