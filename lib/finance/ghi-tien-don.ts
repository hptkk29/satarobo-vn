import "server-only";
// lib/finance/ghi-tien-don.ts — ĐƯỜNG GHI DUY NHẤT cho mọi phép làm đổi tiền của MỘT ĐƠN.
//
// ─────────────────────────────────────────────────────────────────────────────
// PHIÊN B · Chủ dự án chốt 16/09/2026
//
//   *"Một hàm ghi tiền trong lib/finance, transaction + pg_advisory_xact_lock theo orderId.
//   Đọc còn nợ và ghi trong CÙNG transaction sau khi lấy khoá."*
//
// ⚠️ VÌ SAO ĐỌC PHẢI NẰM TRONG KHOÁ — lỗi PHIÊN A đã mắc
//
// `taoDotChoConAction` của PHIÊN A gọi `noTheoCon(orderId)` NGOÀI transaction rồi mới `create`.
// Hai sale bấm "Tạo đợt" cùng lúc cho cùng một bé: cả hai đọc `conNo = 8.000.000`, cả hai thấy
// "đợt đang mở = 0", cả hai tạo đợt 8.000.000 ⇒ hệ thống phát HAI mã QR mỗi mã đòi đủ tiền.
// Cổng `kiemTaoDot` không sai một dòng nào — nó chỉ được cho ăn một con số đã cũ.
//
// Khoá advisory (không phải `SELECT … FOR UPDATE`) vì thứ cần khoá là *cả cụm tiền của đơn*,
// mà cụm đó trải trên bốn bảng (`PaymentRequest`, `PaymentAllocation`, `Payment`,
// `BankTransaction`); không có một hàng nào để khoá cho ra nghĩa đó.
//
// ⚠️ KHOÁ PHẢI CÙNG MỘT KHOÁ với `allocateToOrder` (`lib/payments/payos-ingest.ts`), nếu không
// thì webhook và màn gắn tay chạy song song vẫn giẫm lên nhau trong khi cả hai đều "có khoá".
// Đó là lý do `khoaDonTrongTx` tồn tại và là NƠI DUY NHẤT trong repo đánh vần chuỗi khoá ấy
// cho đơn hàng.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";
import { docSoTheoCon } from "@/lib/finance/debt";
import { kiemTaoDot, kiemHuyDot, type NoTheoConKetQua } from "@/lib/finance/no-theo-con";
import { kiemChiaTheoCon, dungDotDeChia, type DongChia } from "@/lib/finance/chia-tien-theo-con";
import { locDonNhanTien } from "@/lib/payments/don-nhan-tien";
import { recomputeRequestStatuses } from "@/lib/payments/payment-request";
import { thuTuRot } from "@/lib/payments/thu-tu-rot";

type Tx = Prisma.TransactionClient;

export type KetQuaGhi<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * Khoá advisory theo ĐƠN — nơi DUY NHẤT trong repo đánh vần chuỗi khoá này cho đơn hàng.
 *
 * ⚠️ PHẢI `$executeRaw`, KHÔNG `$queryRaw`: `pg_advisory_xact_lock()` trả kiểu `void` và Prisma
 * sẽ ném *"Failed to deserialize column of type 'void'"* — đúng con bug PR #76.
 *
 * ⚠️ Công thức khoá (`hashtext(orderId)::bigint`, KHÔNG tiền tố) phải trùng KHÍT với chỗ cũ ở
 * `allocateToOrder`. Thêm một tiền tố cho "sạch" là hai đường ghi khoá hai chỗ khác nhau, ai
 * đọc mã cũng thấy "có khoá", và không có gì báo động.
 */
export async function khoaDonTrongTx(tx: Tx, orderId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderId})::bigint)`;
}

/**
 * Mở một transaction, lấy khoá của đơn, đọc LẠI công nợ theo con trong khoá, rồi chạy `viec`.
 *
 * `viec` nhận `so` đã đọc dưới khoá — đừng đọc lại bằng `noTheoCon` ở trong đó, bản kia dùng
 * `db` trần và nằm ngoài transaction này.
 */
export async function ghiTienChoDon<T>(
  orderId: string,
  viec: (tx: Tx, so: NoTheoConKetQua) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await khoaDonTrongTx(tx, orderId);
    const so = await docSoTheoCon(tx, orderId);
    return viec(tx, so);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · TẠO ĐỢT CHO MỘT CON
// ─────────────────────────────────────────────────────────────────────────────

export async function taoDotChoCon(input: {
  orderId: string;
  orderItemId: string;
  soTien: number;
  dueDate: Date | null;
  centerId: string | null;
  actor: AuditActor;
}): Promise<KetQuaGhi<{ paymentRequestId: string; installmentNo: number }>> {
  return ghiTienChoDon(input.orderId, async (tx, so) => {
    const con = so.con.find((c) => c.orderItemId === input.orderItemId);
    if (!con) return { ok: false as const, error: "Dòng hàng không thuộc đơn này" };

    const kiem = kiemTaoDot({
      soTien: input.soTien,
      conNo: con.conNo,
      tongDotDangMo: con.tongDotDangMo,
      tenCon: con.ten,
      // Hai vế ĐƠN lấy thẳng từ `docSoTheoCon` — đọc TRONG transaction sau khi đã khoá đơn
      // (`ghiTienChoDon`), nên hai lượt tạo đợt song song không cùng thấy một số cũ.
      conNoDon: so.conNoDon,
      tongDotDangMoDon: so.tongDotDangMoDon,
    });
    if (!kiem.ok) return { ok: false as const, error: kiem.loi };

    // Số đợt kế tiếp CỦA RIÊNG CON NÀY — khoá duy nhất từng phần là
    // `[orderItemId, installmentNo] WHERE orderItemId IS NOT NULL`, nên hai con đếm độc lập.
    const maxDot = await tx.paymentRequest.aggregate({
      where: { orderItemId: input.orderItemId },
      _max: { installmentNo: true },
    });
    const soDot = (maxDot._max.installmentNo ?? 0) + 1;

    const phieu = await tx.paymentRequest.create({
      data: {
        orderId: input.orderId,
        orderItemId: input.orderItemId,
        centerId: input.centerId,
        installmentNo: soDot,
        amountDue: kiem.soTien,
        dueDate: input.dueDate,
        status: "PENDING",
        // Thứ tự rót: DÒNG trước, ĐỢT sau (`lib/payments/thu-tu-rot.ts`). Không đặt thì hai
        // con cùng "đợt 1" có cùng `sortOrder` và thứ tự rót rơi về so sánh cuid.
        sortOrder: thuTuRot({
          thuTuDong: so.con.findIndex((c) => c.orderItemId === input.orderItemId),
          installmentNo: soDot,
        }),
      },
      select: { id: true },
    });

    await writeAudit({
      tx,
      actor: input.actor,
      module: "finance",
      entityType: "Order",
      entityId: input.orderId,
      action: "DOT_THEO_CON_CREATED",
      newValues: { orderItemId: input.orderItemId, ten: con.ten, soTien: kiem.soTien, soDot },
      orgUnitId: input.centerId,
    });

    return { ok: true as const, paymentRequestId: phieu.id, installmentNo: soDot };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · HUỶ MỘT ĐỢT CHƯA CÓ TIỀN
// ─────────────────────────────────────────────────────────────────────────────

export async function huyDotChoCon(input: {
  orderId: string;
  paymentRequestId: string;
  centerId: string | null;
  actor: AuditActor;
}): Promise<KetQuaGhi> {
  return ghiTienChoDon(input.orderId, async (tx) => {
    const phieu = await tx.paymentRequest.findUnique({
      where: { id: input.paymentRequestId },
      select: { id: true, orderId: true, status: true, allocations: { select: { amount: true } } },
    });
    // So `orderId` chứ không tin tham số: người gọi có thể gửi id phiếu của đơn khác.
    if (!phieu || phieu.orderId !== input.orderId) {
      return { ok: false as const, error: "Không tìm thấy đợt thu" };
    }

    const kiem = kiemHuyDot({
      trangThai: phieu.status,
      daRot: phieu.allocations.reduce((s, a) => s + a.amount, 0),
    });
    if (!kiem.ok) return { ok: false as const, error: kiem.loi };

    await tx.paymentRequest.update({ where: { id: phieu.id }, data: { status: "VOID" } });
    // Mã QR của đợt vừa huỷ phải chết theo — affordance phải nói thật.
    await tx.qrSession.updateMany({
      where: { paymentRequestId: phieu.id, status: "ACTIVE" },
      data: { status: "EXPIRED" },
    });

    await writeAudit({
      tx,
      actor: input.actor,
      module: "finance",
      entityType: "Order",
      entityId: input.orderId,
      action: "DOT_THEO_CON_VOIDED",
      newValues: { paymentRequestId: phieu.id },
      orgUnitId: input.centerId,
    });

    return { ok: true as const };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · GẮN MỘT GIAO DỊCH NGÂN HÀNG, CHIA ĐÍCH DANH THEO ĐỢT
// ─────────────────────────────────────────────────────────────────────────────

/** Marker trong `Payment.note` để tìm lại đúng các dòng do một lần GẮN TAY sinh ra. */
export const markerGanTay = (bankTransactionId: string) => `[gan-tay:${bankTransactionId}]`;

/**
 * Marker của đường WEBHOOK (`allocateToOrder`) — họ marker ĐỜI CŨ.
 *
 * ⚠️ Phải khớp TỪNG KÝ TỰ với chuỗi mà `payos-ingest.ts` ghi ra:
 * `` `[auto:${provider.toLowerCase()}:${providerTxnId}]` ``. Lệch một ký tự là `goGanTheoCon`
 * không tìm thấy dòng gốc nào — và hậu quả KHÔNG phải một lỗi, mà là một lượt gỡ NỬA VỜI:
 * `PaymentAllocation` bị xoá (Ledger-B mất dấu) trong khi `Payment` còn nguyên (Ledger-A vẫn
 * tính là đã thu). Giao dịch quay về hàng chờ, công nợ vẫn báo đã đóng, và không lỗi nào báo.
 */
export const markerWebhook = (provider: string, providerTxnId: string) =>
  `[auto:${provider.toLowerCase()}:${providerTxnId}]`;

export async function ganTienTheoCon(input: {
  bankTransactionId: string;
  orderId: string;
  dong: readonly DongChia[];
  actor: AuditActor;
}): Promise<KetQuaGhi<{ daChia: number; soDong: number; daDuTien: boolean }>> {
  return ghiTienChoDon(input.orderId, async (tx, so) => {
    // Đọc LẠI trong khoá: hai người cùng gắn một giao dịch thì người vào sau thấy MATCHED.
    const txn = await tx.bankTransaction.findUnique({
      where: { id: input.bankTransactionId },
      select: {
        id: true,
        amount: true,
        status: true,
        centerId: true,
        provider: true,
        providerTxnId: true,
      },
    });
    if (!txn) return { ok: false as const, error: "Không tìm thấy giao dịch" };
    if (txn.status === "MATCHED") {
      return { ok: false as const, error: "Giao dịch này đã được gắn rồi" };
    }
    if (txn.status === "IGNORED") {
      return {
        ok: false as const,
        error: "Giao dịch đang ở trạng thái Bỏ qua — kế toán phải mở lại trước",
      };
    }

    // Cùng một luật với tầng đối khớp tự động: đơn DRAFT/CANCELLED/REFUNDED/xoá mềm không
    // nhận tiền. Gắn tay KHÔNG phải cửa sau của luật đó.
    const don = await tx.order.findFirst({
      where: { id: input.orderId, ...locDonNhanTien() },
      select: { id: true, code: true, centerId: true },
    });
    if (!don) {
      return {
        ok: false as const,
        error: "Đơn này không nhận tiền được (nháp / đã huỷ / đã hoàn / đã xoá)",
      };
    }

    const dotDeChia = dungDotDeChia(so);
    const kiem = kiemChiaTheoCon({
      soTienGiaoDich: txn.amount,
      dong: input.dong,
      dot: dotDeChia,
      tranCon: so.con.map((c) => ({ orderItemId: c.orderItemId, ten: c.ten, conNo: c.conNo })),
    });
    if (!kiem.ok) return { ok: false as const, error: kiem.loi };

    // Đợt nào của con nào — cần cho `Payment.orderItemId`, tức cho công nợ theo con.
    const dotTheoId = new Map(dotDeChia.map((d) => [d.id, d]));

    // ─────────────────────────────────────────────────────────────────────────
    // ĐƠN CŨ · ĐƠN MỘT CON — nâng đợt `orderItemId = NULL` lên đúng bé đó.
    //
    // Đơn trước 16/09 có đợt không thuộc bé nào. Đơn ấy mà chỉ có MỘT dòng hàng thì tiền
    // không thể của ai khác, nên không có gì để đoán: lúc gắn tiền là lúc thích hợp nhất để
    // đóng luôn khoảng trống dữ liệu.
    //
    // ⚠️ Nâng cả `PaymentRequest` chứ không chỉ `Payment`: để đợt ở NULL trong khi tiền của
    // nó đã ghi tên bé là hai màn nói hai chuyện — `con[].dotDangMo` không nhận đợt đó, nên
    // nó ở lại khối "Đợt chung (chưa chia con)" mãi, dù chẳng còn gì chưa chia.
    //
    // ⚠️ VÀ CÓ MỘT CA KHÔNG NÂNG ĐƯỢC: khoá duy nhất từng phần
    // `(orderItemId, installmentNo) WHERE NOT NULL` sẽ đụng nếu bé đó ĐÃ có đợt cùng số.
    // Ca đó thì chỉ ghi `Payment.orderItemId` (tiền vẫn về đúng bé) và để đợt nguyên NULL —
    // thà một màn hiện thừa một dòng còn hơn transaction ném và cả lượt gắn rollback.
    const dongCuaDon = await tx.orderItem.findMany({
      where: { orderId: input.orderId },
      select: { id: true },
      take: 2,
    });
    const conDuyNhat = dongCuaDon.length === 1 ? (dongCuaDon[0]?.id ?? null) : null;
    /** Đợt NULL → bé nào, sau khi đã nâng (hoặc chỉ suy ra được cho phần tiền). */
    const conSuyRa = new Map<string, string>();
    if (conDuyNhat) {
      for (const d of kiem.dong) {
        const dot = dotTheoId.get(d.paymentRequestId);
        if (!dot || dot.orderItemId != null) continue;
        conSuyRa.set(d.paymentRequestId, conDuyNhat);
        const dungSo = await tx.paymentRequest.count({
          where: { orderItemId: conDuyNhat, installmentNo: dot.installmentNo },
        });
        if (dungSo === 0) {
          await tx.paymentRequest.update({
            where: { id: d.paymentRequestId },
            data: { orderItemId: conDuyNhat },
          });
        }
      }
    }

    for (const d of kiem.dong) {
      await tx.paymentAllocation.create({
        data: {
          bankTransactionId: txn.id,
          paymentRequestId: d.paymentRequestId,
          amount: d.soTien,
          centerId: don.centerId,
        },
      });
    }

    // Trạng thái đợt (PENDING → PARTIAL → PAID) và "đơn đã đủ tiền chưa" tính LẠI từ phân bổ,
    // không set tay — dùng chung đúng hàm mà webhook dùng.
    const { settled } = await recomputeRequestStatuses(tx, input.orderId);

    // Ledger-A: một dòng `Payment` cho MỖI CON, không phải mỗi đợt — công nợ đọc theo con,
    // và gộp đợt của cùng một bé lại thì sổ vẫn đúng mà ít dòng hơn để đối chiếu.
    const congTheoCon = new Map<string, number>();
    for (const d of kiem.dong) {
      const dot = dotTheoId.get(d.paymentRequestId);
      // Đợt NULL của đơn MỘT con ⇒ tiền vẫn ghi tên bé đó (xem khối "ĐƠN CŨ" ở trên).
      const khoa = dot?.orderItemId ?? conSuyRa.get(d.paymentRequestId) ?? "";
      congTheoCon.set(khoa, (congTheoCon.get(khoa) ?? 0) + d.soTien);
    }

    // `enrollmentId` lấy THẲNG từ dòng hàng: khi đã biết đợt của con nào thì không còn phải
    // đoán như đường webhook (xem `chonGhiDanhChoKhoan`) — dòng hàng trỏ đúng một ghi danh.
    const dongHang = await tx.orderItem.findMany({
      where: { id: { in: [...congTheoCon.keys()].filter((k) => k !== "") } },
      select: { id: true, enrollmentId: true },
    });
    const ghiDanhTheoDong = new Map(dongHang.map((d) => [d.id, d.enrollmentId]));

    const marker = markerGanTay(txn.id);
    for (const [orderItemId, soTien] of congTheoCon) {
      await tx.payment.create({
        data: {
          orderId: input.orderId,
          orderItemId: orderItemId === "" ? null : orderItemId,
          enrollmentId: orderItemId === "" ? null : (ghiDanhTheoDong.get(orderItemId) ?? null),
          amount: soTien,
          method: txn.provider.toLowerCase(),
          paidDate: new Date(),
          note: `Gắn tay giao dịch ${txn.provider} ${txn.providerTxnId} ${marker}`,
          saleStatus: "RECORDED",
          // PENDING: người gắn là sale, và sale ghi nhận ≠ kế toán xác nhận. Đặt CONFIRMED ở
          // đây là cho sale tự đóng công nợ, tức bỏ hẳn trục kế toán.
          accountantStatus: "PENDING",
          centerId: don.centerId,
        },
      });
    }

    await tx.bankTransaction.update({
      where: { id: txn.id },
      data: { status: "MATCHED", unmatchedNote: null, centerId: txn.centerId ?? don.centerId },
    });

    await writeAudit({
      tx,
      actor: input.actor,
      module: "finance",
      entityType: "BankTransaction",
      entityId: txn.id,
      action: "TXN_CHIA_THEO_CON",
      newValues: {
        orderId: don.id,
        orderCode: don.code,
        tong: kiem.tong,
        dong: kiem.dong.map((d) => ({
          paymentRequestId: d.paymentRequestId,
          orderItemId:
            dotTheoId.get(d.paymentRequestId)?.orderItemId ??
            conSuyRa.get(d.paymentRequestId) ??
            null,
          soTien: d.soTien,
        })),
      },
      orgUnitId: don.centerId,
    });

    return { ok: true as const, daChia: kiem.tong, soDong: kiem.dong.length, daDuTien: settled };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · GỠ GẮN — BÚT TOÁN ĐẢO, KHÔNG XOÁ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gỡ một giao dịch đã gắn: giao dịch về UNMATCHED, nợ con quay lại.
 *
 * ⚠️ HAI BẢNG, HAI CÁCH XỬ LÝ KHÁC NHAU, và đó không phải sự thiếu nhất quán:
 *
 *  · `PaymentAllocation` bị **XOÁ**. Nó là DÂY NỐI "giao dịch này rót vào đợt kia", không phải
 *    bút toán. Gắn nhầm thì dây nối ấy là một câu sai, và giữ lại một câu sai kèm một câu đính
 *    chính là bắt mọi đường đọc sau này phải biết luật cộng-trừ. Hơn nữa nó KHÔNG BIỂU DIỄN
 *    ĐƯỢC: `@@unique([bankTransactionId, paymentRequestId])` chặn dòng thứ hai cho cùng cặp,
 *    nên "phân bổ âm" là thứ lược đồ không cho phép.
 *
 *  · `Payment` thì **GIỮ NGUYÊN + thêm bút toán đảo** (`paymentType: ADJUSTMENT`,
 *    `adjustmentOfId` trỏ dòng gốc, `amount` âm). Đây là sổ tiền, và repo đã chốt luật *"lưu
 *    DELTA, dòng gốc bất biến"* cho mọi phép sửa. Bút toán đảo mang ĐÚNG `accountantStatus`
 *    của dòng gốc — trái dấu mà khác trục thì tổng của trục kia không về 0, tức công nợ hiển
 *    thị vẫn tụt dù tiền đã gỡ.
 */
export async function goGanTheoCon(input: {
  bankTransactionId: string;
  orderId: string;
  lyDo: string;
  actor: AuditActor;
}): Promise<KetQuaGhi<{ soDongDao: number; tienDao: number }>> {
  return ghiTienChoDon(input.orderId, async (tx) => {
    const txn = await tx.bankTransaction.findUnique({
      where: { id: input.bankTransactionId },
      select: {
        id: true,
        status: true,
        amount: true,
        centerId: true,
        // Cần cho marker ĐỜI CŨ `[auto:<provider>:<txnId>]` — xem `markerWebhook`.
        provider: true,
        providerTxnId: true,
      },
    });
    if (!txn) return { ok: false as const, error: "Không tìm thấy giao dịch" };
    if (txn.status !== "MATCHED") {
      return {
        ok: false as const,
        error: `Giao dịch đang ở trạng thái ${txn.status} — không có gì để gỡ`,
      };
    }

    // ẢNH CHỤP ĐỦ trước khi xoá — chủ dự án chốt 17/09.
    //
    // ⚠️ `PaymentAllocation` bị XOÁ thật, nên sau lượt gỡ thì DB không còn bằng chứng nào về
    // việc "tiền này từng rót vào đợt kia". Thiếu một cột trong ảnh chụp là cột đó mất VĨNH
    // VIỄN — không có đường dựng lại. Vì thế chụp cả `createdAt` (rót lúc nào) và
    // `orderItemId` của phiếu (rót cho bé nào): hai thứ không suy ra được từ phần còn lại.
    const phanBo = await tx.paymentAllocation.findMany({
      where: { bankTransactionId: txn.id },
      select: {
        id: true,
        bankTransactionId: true,
        paymentRequestId: true,
        amount: true,
        roundingWaived: true,
        centerId: true,
        createdAt: true,
        paymentRequest: {
          select: {
            orderId: true,
            orderItemId: true,
            installmentNo: true,
            amountDue: true,
            status: true,
          },
        },
      },
    });
    if (phanBo.length === 0) {
      return { ok: false as const, error: "Giao dịch này không có phân bổ nào" };
    }
    // Không cho gỡ chéo đơn: khoá đang giữ là khoá của MỘT đơn, nên đụng vào đơn khác là
    // đụng ngoài phạm vi khoá.
    if (phanBo.some((p) => p.paymentRequest.orderId !== input.orderId)) {
      return { ok: false as const, error: "Giao dịch này rót vào đơn khác — mở đúng đơn đó để gỡ" };
    }

    // NGƯỜI GẮN: `PaymentAllocation` không có cột actor, nên dấu vết ấy chỉ còn trong nhật ký
    // của lượt GẮN. Tra ngược ngay đây để ảnh chụp tự đủ — người đọc nhật ký gỡ không phải đi
    // tìm tiếp một bản ghi khác mới biết ai đã gắn.
    const vetGan = await tx.auditLog.findFirst({
      where: { entityType: "BankTransaction", entityId: txn.id, action: "TXN_CHIA_THEO_CON" },
      orderBy: { createdAt: "desc" },
      select: { actorId: true, actorName: true, createdAt: true },
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TÌM DÒNG GỐC — HAI HỌ MARKER, và bỏ sót họ thứ hai là một lỗ TIỀN
    //
    // ⚠️ Bản đầu chỉ tìm `[gan-tay:…]`. Nhưng gỡ gắn KHÔNG nằm sau công tắc, nên ngay khi merge
    // nó chạy được trên MỌI phân bổ đang có trên prod — mà phân bổ trên prod hôm nay đều do
    // WEBHOOK sinh, và chúng mang marker `[auto:<provider>:<txnId>]`.
    //
    // Hậu quả của bản đầu, nếu để nguyên: kế toán bấm "Gỡ gắn" một giao dịch đời cũ ⇒
    // `PaymentAllocation` bị xoá, `Payment` KHÔNG có bút toán đảo nào (vì không tìm thấy dòng
    // gốc) ⇒ giao dịch về hàng chờ trong khi công nợ vẫn báo ĐÃ ĐÓNG. Hai sổ nói hai chuyện,
    // và không lỗi nào báo.
    const markerTay = markerGanTay(txn.id);
    const markerCu = markerWebhook(txn.provider, txn.providerTxnId);
    const goc = await tx.payment.findMany({
      where: {
        orderId: input.orderId,
        deletedAt: null,
        paymentType: "PAYMENT",
        OR: [{ note: { contains: markerTay } }, { note: { contains: markerCu } }],
      },
      select: {
        id: true,
        amount: true,
        orderItemId: true,
        enrollmentId: true,
        method: true,
        centerId: true,
        accountantStatus: true,
        saleStatus: true,
        note: true,
        receipts: {
          where: { status: "ACTIVE", deletedAt: null },
          select: { id: true, code: true },
        },
      },
    });

    // ⚠️ CHẶN khi khoản đã XUẤT PHIẾU THU — không gỡ nửa vời.
    //
    // `Receipt` là chứng từ ĐÃ GIAO cho phụ huynh, và `Receipt.paymentId` mang `onDelete:
    // Restrict`. Đảo tiền trong khi tờ phiếu vẫn đứng là để lại một chứng từ nói rằng khoản
    // này đã thu, cho một khoản vừa bị gỡ. Bút toán đảo chữa được SỔ, nó không chữa được tờ
    // giấy đang nằm trong tay khách.
    //
    // KHÔNG chặn chỉ vì khoản có `enrollmentId`: bút toán đảo mang đúng `enrollmentId` đó và
    // trái dấu, nên tổng theo ghi danh về 0 — học bạ và công nợ ghi danh không lệch. Thứ lệch
    // được là tờ phiếu thu, và đó là thứ ca này canh.
    const daXuatPhieu = goc.filter((g) => g.receipts.length > 0);
    if (daXuatPhieu.length > 0) {
      const ma = daXuatPhieu.flatMap((g) => g.receipts.map((r) => r.code)).join(", ");
      return {
        ok: false as const,
        error:
          `Khoản thu của giao dịch này đã xuất phiếu thu (${ma}) — không gỡ được. ` +
          `Kế toán phải huỷ hoặc hoàn phiếu thu đó trước, rồi mới gỡ.`,
      };
    }

    // ⚠️⚠️ MỌI CỔNG TỪ CHỐI PHẢI NẰM TRÊN DÒNG NÀY.
    //
    // Trong Prisma, `return` từ callback của `$transaction` **KHÔNG rollback** — chỉ `throw`
    // mới rollback. Một cổng `return { ok: false }` đặt SAU một phép ghi là: phép ghi ấy
    // ĐƯỢC COMMIT, còn người dùng nhận thông báo từ chối.
    //
    // Đã đo, không phải phòng xa: bản đầu đặt cổng "đã xuất phiếu thu" sau `deleteMany`.
    // Ca `[GDC-c2]` bắt được — giao dịch báo "không gỡ được" trong khi phân bổ đã xoá sạch.
    // Tức chính cái cổng sinh ra để chặn gỡ nửa vời lại TẠO RA một lượt gỡ nửa vời.
    await tx.paymentAllocation.deleteMany({ where: { bankTransactionId: txn.id } });
    await recomputeRequestStatuses(tx, input.orderId);

    // Trạng thái đợt SAU khi gỡ — ghi vào nhật ký làm bằng chứng "nợ con đã quay lại".
    // KHÔNG tự suy ra PENDING: `deriveStatus` mới là nơi quyết, và một đợt còn tiền của giao
    // dịch KHÁC thì phải là PARTIAL.
    const dotSau = await tx.paymentRequest.findMany({
      where: { id: { in: phanBo.map((x) => x.paymentRequestId) } },
      select: { id: true, installmentNo: true, status: true, orderItemId: true },
    });

    let tienDao = 0;
    let soDongDao = 0;
    const idButToanDao: string[] = [];
    for (const g of goc) {
      // Đã có bút toán đảo cho dòng này rồi thì thôi — gỡ hai lần không được trừ hai lần.
      const daDao = await tx.payment.count({
        where: { adjustmentOfId: g.id, paymentType: "ADJUSTMENT", deletedAt: null },
      });
      if (daDao > 0) continue;
      const dao = await tx.payment.create({
        select: { id: true },
        data: {
          orderId: input.orderId,
          orderItemId: g.orderItemId,
          enrollmentId: g.enrollmentId,
          amount: -g.amount,
          method: g.method,
          paidDate: new Date(),
          note: `Đảo bút toán ${markerTay} — ${input.lyDo}`,
          paymentType: "ADJUSTMENT",
          adjustmentOfId: g.id,
          saleStatus: g.saleStatus,
          accountantStatus: g.accountantStatus,
          centerId: g.centerId,
        },
      });
      idButToanDao.push(dao.id);
      tienDao += g.amount;
      soDongDao += 1;
    }

    await tx.bankTransaction.update({
      where: { id: txn.id },
      data: { status: "UNMATCHED", unmatchedNote: `Đã gỡ gắn: ${input.lyDo}` },
    });

    await writeAudit({
      tx,
      actor: input.actor,
      module: "finance",
      entityType: "BankTransaction",
      entityId: txn.id,
      action: "TXN_GO_GAN",
      oldValues: {
        orderId: input.orderId,
        // Ảnh chụp ĐỦ — xem khối chú thích ở chỗ tra `phanBo`.
        phanBo: phanBo.map((p) => ({
          id: p.id,
          bankTransactionId: p.bankTransactionId,
          paymentRequestId: p.paymentRequestId,
          orderItemId: p.paymentRequest.orderItemId,
          installmentNo: p.paymentRequest.installmentNo,
          amount: p.amount,
          roundingWaived: p.roundingWaived,
          centerId: p.centerId,
          createdAt: p.createdAt.toISOString(),
        })),
        nguoiGan: vetGan
          ? {
              actorId: vetGan.actorId,
              actorName: vetGan.actorName,
              luc: vetGan.createdAt.toISOString(),
            }
          : null,
      },
      newValues: {
        status: "UNMATCHED",
        soDongDao,
        tienDao,
        idButToanDao,
        trangThaiDotSauGo: dotSau.map((d) => ({
          paymentRequestId: d.id,
          installmentNo: d.installmentNo,
          orderItemId: d.orderItemId,
          status: d.status,
        })),
      },
      reason: input.lyDo,
      orgUnitId: txn.centerId,
    });

    return { ok: true as const, soDongDao, tienDao };
  });
}
