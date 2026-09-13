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
// Dùng lại hàm tách mã đơn của chính đường webhook — không chép lại regex.
import { extractOrderCode } from "../lib/payments/sepay";

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
  // Ô "Đã thu (tổng)" của Dashboard Kế toán cộng nguyên `Order.totalAmount` của đơn
  // CONFIRMED/COMPLETED và KHÔNG chạm bảng `Payment` lần nào.
  //
  // ⚠️ HAI SỐ DƯỚI ĐÂY ĐẾM HAI TẬP KHÁC NHAU — đừng đọc hiệu của chúng là "mức sai".
  // Dashboard cộng trên 19 đơn đã chốt; `Σ Payment` gồm cả khoản trên đơn CHƯA chốt.
  // Nhãn cũ ở đây là "mức khai KHỐNG", và nó SAI: đo prod 13/09/2026 ra hiệu ÂM
  // (dashboard 157.900.400đ < Payment 168.733.000đ), tức dashboard đang khai THIẾU,
  // ngược chiều với giả thuyết ban đầu. Điều số này chứng minh được chỉ là: hai con
  // số KHÔNG đối chiếu được với nhau, vì dashboard không đọc sổ tiền. Muốn biết mức
  // sai thật thì phải so THEO TỪNG ĐƠN — đó là việc của `shadow-compare-debt.ts`.
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
    ["Dashboard ĐANG cộng (Σ totalAmount đơn đã chốt)", `${fmt(tongDon)}đ`],
    ["Σ Payment RECORDED (MỌI đơn)", `${fmt(tongThu)}đ`],
    ["Hiệu — KHÔNG phải mức sai, xem chú thích", `${fmt(tongDon - tongThu)}đ`],
  ]);
  console.log(
    "  ⚠ Hai dòng trên đếm HAI TẬP khác nhau ⇒ hiệu của chúng không phải mức sai.\n" +
      "    Điều chắc chắn: dashboard không đọc bảng Payment, nên không con số nào của nó\n" +
      "    đối chiếu được với tiền. Mức sai theo TỪNG ĐƠN xem bảng shadow-compare bên dưới.",
  );

  // ── 8. TIỀN THẬT ĐANG NẰM IM vì cổng duyệt giảm giá ────────────────────────
  //
  // Câu hỏi của chủ dự án 13/09: trong các đơn treo `discountApprovalStatus =
  // PENDING_APPROVAL`, bao nhiêu đơn ĐÃ CÓ TIỀN VỀ mà `lib/payments/sepay.ts:109-113`
  // trả `MANUAL` nên chưa rót vào phiếu nào?
  //
  // Ba đường đo, vì mỗi đường bắt một hình dạng khác nhau của "tiền nằm im":
  //  (a) Đơn treo duyệt mà Ledger-A đã có tiền NHIỀU HƠN số đã rót vào phiếu
  //      (`recordedPaid > allocated`) — đúng phép đo của `shadow-compare-debt.ts`.
  //  (b) `BankTransaction` còn UNMATCHED — tiền đã vào tài khoản ngân hàng mà hệ
  //      thống chưa gắn được vào đơn nào. Đây là hàng chờ đối soát tay.
  //  (c) `IntegrationLog` `MANUAL_REVIEW`/FAILED — dấu vết webhook TỪ CHỐI tự rót.
  //      Lọc thêm câu "Giảm giá chưa được duyệt" (chuỗi ở sepay.ts:112) để tách đúng
  //      ca do cổng duyệt gây ra, khác với ca không khớp mã đơn.
  const donTreoDuyet = await db.order.findMany({
    where: { deletedAt: null, discountApprovalStatus: "PENDING_APPROVAL" },
    select: { id: true, code: true, status: true, totalAmount: true },
    orderBy: { code: "asc" },
  });
  const dongTreo: [string, number | string][] = [];
  let soDonCoTienNamIm = 0;
  let tienNamIm = 0;
  for (const o of donTreoDuyet) {
    const [tra, rot] = await Promise.all([
      db.payment.aggregate({
        where: { orderId: o.id, deletedAt: null, saleStatus: "RECORDED" },
        _sum: { amount: true },
      }),
      db.paymentAllocation.aggregate({
        where: { paymentRequest: { orderId: o.id } },
        _sum: { amount: true },
      }),
    ]);
    const daTra = tra._sum.amount ?? 0;
    const daRot = rot._sum.amount ?? 0;
    const namIm = Math.max(0, daTra - daRot);
    if (namIm > 0) {
      soDonCoTienNamIm += 1;
      tienNamIm += namIm;
    }
    dongTreo.push([
      `${o.code} (${o.status})`,
      `${fmt(o.totalAmount)} · đã trả ${fmt(daTra)} · đã rót ${fmt(daRot)}${namIm > 0 ? ` · NẰM IM ${fmt(namIm)}` : ""}`,
    ]);
  }
  bang("(a) Đơn treo duyệt GIẢM GIÁ — tiền đã trả so với đã rót", dongTreo.length > 0 ? dongTreo : [["(không có đơn nào)", 0]]);

  const txChuaKhop = await db.bankTransaction.aggregate({
    where: { status: "UNMATCHED" },
    _count: { _all: true },
    _sum: { amount: true },
  });
  const tuChoiTuRot = await db.integrationLog.count({
    where: { action: "MANUAL_REVIEW", status: "FAILED" },
  });
  const tuChoiDoDuyetGia = await db.integrationLog.count({
    where: {
      action: "MANUAL_REVIEW",
      status: "FAILED",
      errorMessage: { contains: "Giảm giá chưa được duyệt" },
    },
  });
  bang("(b)(c) Hàng chờ đối soát tay", [
    ["BankTransaction UNMATCHED — số giao dịch", txChuaKhop._count._all],
    ["BankTransaction UNMATCHED — tổng tiền", `${fmt(txChuaKhop._sum.amount ?? 0)}đ`],
    ["IntegrationLog MANUAL_REVIEW (mọi lý do)", tuChoiTuRot],
    ["… trong đó do CỔNG DUYỆT GIẢM GIÁ chặn", tuChoiDoDuyetGia],
  ]);
  console.log(
    soDonCoTienNamIm > 0
      ? `  ⚠ ${soDonCoTienNamIm} đơn treo duyệt đang giữ ${fmt(tienNamIm)}đ CHƯA RÓT vào phiếu nào.`
      : `  ✓ Không đơn treo duyệt nào đang giữ tiền chưa rót.`,
  );

  // ── 9. PHÂN LOẠI GIAO DỊCH NGÂN HÀNG CHƯA KHỚP ĐƠN NÀO ─────────────────────
  //
  // Đo 13/09 ra 21 giao dịch UNMATCHED / 102.433.000đ trên prod — 46% tiền về ngân
  // hàng chưa gắn được vào đơn nào. Nếu trong đó có học phí THẬT thì có phụ huynh đã
  // chuyển tiền mà hệ thống vẫn ghi nợ họ.
  //
  // BA RỔ, và rổ 3 CỐ Ý không đoán:
  //  1. RẤT CÓ THỂ LÀ HỌC PHÍ THẬT — tiền VÀO, và có ít nhất một dấu buộc được vào đơn:
  //     mã đơn trong nội dung tra ra đơn có thật, HOẶC số tiền khớp ĐÚNG MỘT đơn đang nợ.
  //  2. KHÔNG PHẢI HỌC PHÍ — tiền RA (rút/chuyển đi), hoặc không mang dấu nào của
  //     định dạng nội dung CK hệ thống phát ra và cũng không khớp số tiền đơn nào.
  //  3. KHÔNG KẾT LUẬN ĐƯỢC — để nguyên, không suy diễn.
  //
  // ⚠️ PII: `content` chứa TÊN CON + SĐT PHỤ HUYNH. Output này đi vào log GitHub
  // Actions nên KHÔNG in nội dung thô. Chỉ in thứ suy ra được: mã đơn (không phải PII),
  // cờ "có chuỗi giống SĐT", và `unmatchedNote` đã che mọi dãy ≥4 chữ số.
  const che = (s: string | null | undefined): string =>
    (s ?? "").replace(/\d{4,}/g, "****").slice(0, 60);
  /**
   * Tiền VÀO hay RA. SePay để ở `rawPayload.transferType` ("in" | "out"); các cổng khác
   * dùng tên khác. Trả "?" khi KHÔNG biết — và "?" đẩy giao dịch xuống rổ 3, không đoán.
   */
  const chieuTien = (raw: unknown): "in" | "out" | "?" => {
    const p = (raw ?? {}) as Record<string, unknown>;
    for (const k of ["transferType", "transfer_type", "type", "direction"]) {
      const v = p[k];
      if (typeof v !== "string") continue;
      const lo = v.toLowerCase();
      if (lo === "in" || lo === "credit" || lo === "receive") return "in";
      if (lo === "out" || lo === "debit" || lo === "send") return "out";
    }
    return "?";
  };

  const chuaKhop = await db.bankTransaction.findMany({
    where: { status: "UNMATCHED" },
    select: {
      provider: true,
      providerTxnId: true,
      amount: true,
      transferredAt: true,
      content: true,
      unmatchedNote: true,
      rawPayload: true,
    },
    orderBy: { transferredAt: "asc" },
  });

  // Đơn CÒN NỢ theo sổ cũ (công thức đang hiển thị) — để so số tiền.
  const donConNo = await db.order.findMany({
    where: { deletedAt: null, status: { notIn: ["CANCELLED", "REFUNDED"] } },
    select: { id: true, code: true, totalAmount: true },
  });
  const daTraTheoDon = new Map<string, number>();
  for (const o of donConNo) {
    const t = await db.payment.aggregate({
      where: { orderId: o.id, deletedAt: null, saleStatus: "RECORDED" },
      _sum: { amount: true },
    });
    daTraTheoDon.set(o.id, t._sum.amount ?? 0);
  }
  const conNo = donConNo
    .map((o) => ({ code: o.code, thieu: o.totalAmount - (daTraTheoDon.get(o.id) ?? 0) }))
    .filter((x) => x.thieu > 0);
  const maDonCoThat = new Set(donConNo.map((o) => o.code));

  const ro: Record<1 | 2 | 3, string[]> = { 1: [], 2: [], 3: [] };
  for (const t of chuaKhop) {
    const chieu = chieuTien(t.rawPayload);
    const maDon = extractOrderCode(t.content);
    const maTraDuoc = maDon != null && maDonCoThat.has(maDon);
    // "Giống SĐT" = có dãy 9–11 chữ số liền — dấu của định dạng TenCon_SdtPH_MaKhoa.
    const coSdt = /\d{9,11}/.test(t.content ?? "");
    const khopTien = conNo.filter((x) => x.thieu === t.amount);
    const dong =
      `${t.provider}/${t.providerTxnId.slice(-8)} ${t.transferredAt.toISOString().slice(0, 10)} ` +
      `${fmt(t.amount)}đ chiều=${chieu}` +
      `${maDon ? ` mã=${maDon}${maTraDuoc ? "(CÓ THẬT)" : "(không tra ra)"}` : ""}` +
      `${coSdt ? " có-sđt" : ""}` +
      `${khopTien.length === 1 ? ` KHỚP-NỢ=${khopTien[0]!.code}` : khopTien.length > 1 ? ` khớp-nợ×${khopTien.length}` : ""}` +
      `${t.unmatchedNote ? ` · ${che(t.unmatchedNote)}` : ""}`;

    if (chieu === "out") ro[2].push(dong);
    else if (maTraDuoc || khopTien.length === 1) ro[1].push(dong);
    else if (chieu === "in" && !coSdt && maDon == null && khopTien.length === 0) ro[2].push(dong);
    else ro[3].push(dong);
  }

  const tongRo = (ds: string[]) => ds.length;
  const soKhongRoChieu = chuaKhop.filter((t) => chieuTien(t.rawPayload) === "?").length;
  console.log(`\n── ${chuaKhop.length} giao dịch chưa khớp — PHÂN LOẠI ──`);
  if (soKhongRoChieu > 0) {
    // Nói ra thay vì im lặng: rổ 3 phình lên vì THIẾU DỮ KIỆN, không phải vì dữ liệu
    // mơ hồ. Hai thứ đó đòi hành động khác nhau.
    console.log(
      `  ⚠ ${soKhongRoChieu}/${chuaKhop.length} giao dịch KHÔNG đọc được chiều tiền từ rawPayload ⇒ tự động về rổ 3.`,
    );
  }
  console.log(`  Rổ 1 · RẤT CÓ THỂ LÀ HỌC PHÍ THẬT chưa rót : ${tongRo(ro[1])}`);
  for (const d of ro[1]) console.log(`      ${d}`);
  console.log(`  Rổ 2 · KHÔNG phải học phí                  : ${tongRo(ro[2])}`);
  for (const d of ro[2]) console.log(`      ${d}`);
  console.log(`  Rổ 3 · KHÔNG kết luận được (để nguyên)     : ${tongRo(ro[3])}`);
  for (const d of ro[3]) console.log(`      ${d}`);
  if (ro[1].length > 0) {
    console.log(`\n  ⚠️⚠️ RỔ 1 KHÁC 0 — có tiền rất có thể là học phí thật chưa vào sổ.`);
  }

  // ── 10. `centerOverridable` của dung sai làm tròn đã bị DÙNG chưa ──────────
  // Đơn ORD-260910-000008 trả thiếu 9.000đ (> mặc định 5.000đ) mà vẫn COMPLETED ⇒ nghi
  // cơ sở đó đã tự đặt ngưỡng cao hơn. Đây là câu tra để biết chắc, trước khi chốt bỏ
  // `centerOverridable`.
  const KEY_DUNG_SAI = "payment.roundingToleranceVnd";
  const [toanCuc, theoCoSo] = await Promise.all([
    db.systemSetting.findUnique({ where: { key: KEY_DUNG_SAI }, select: { valueJson: true } }),
    db.centerSetting.findMany({
      where: { key: KEY_DUNG_SAI },
      select: { orgUnitId: true, valueJson: true },
    }),
  ]);
  bang("Dung sai làm tròn — giá trị THẬT đang chạy", [
    ["Mặc định trong registry", "5.000đ"],
    ["SystemSetting (toàn cục)", toanCuc ? JSON.stringify(toanCuc.valueJson) : "(chưa đặt → dùng mặc định)"],
    ["Số cơ sở ĐÃ tự đặt riêng", theoCoSo.length],
  ]);
  for (const c of theoCoSo) {
    const ou = await db.orgUnit.findUnique({
      where: { id: c.orgUnitId },
      select: { code: true, name: true },
    });
    console.log(`      ${ou?.code ?? c.orgUnitId} (${ou?.name ?? "?"}) → ${JSON.stringify(c.valueJson)}`);
  }
  console.log(
    theoCoSo.length === 0
      ? `  ✓ centerOverridable CHƯA từng được dùng ⇒ bỏ nó không ảnh hưởng dữ liệu đang chạy.`
      : `  ⚠ centerOverridable ĐÃ được dùng ⇒ bỏ nó sẽ đổi hành vi của ${theoCoSo.length} cơ sở.`,
  );

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
