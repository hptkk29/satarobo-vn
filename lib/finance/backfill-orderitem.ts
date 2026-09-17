// lib/finance/backfill-orderitem.ts — GẮN `Payment.orderItemId` cho khoản cũ của đơn MỘT CON.
//
// ─────────────────────────────────────────────────────────────────────────────
// VIỆC NÀY LÀ GÌ, VÀ VÌ SAO NÓ AN TOÀN
//
// Cột `Payment.orderItemId` ra đời 16/09/2026 (migration `20260916180000_payment_order_item`),
// nên **mọi khoản cũ hơn nó đều NULL theo định nghĩa** — đo prod 17/09: 150 khoản / 120 đơn /
// 892.149.000đ. Trong đó 146 khoản thuộc đơn có ĐÚNG MỘT dòng hàng, tức chỉ có duy nhất một
// chỗ để gắn: không có lựa chọn nào phải đoán.
//
// 4 khoản còn lại thuộc đơn ≥2 con — **KHÔNG backfill**, sale phải tự chia (đó chính là việc
// mà công tắc `billing.flexV1Enabled` sinh ra để làm).
//
// ─────────────────────────────────────────────────────────────────────────────
// ĐIỀU KIỆN CỨNG (chủ dự án chốt 17/09/2026) — không nới thêm một điều kiện nào
//
//   · đơn có ĐÚNG 1 `OrderItem`        → không có gì phải đoán
//   · `Payment.orderItemId IS NULL`    → chỉ điền chỗ trống
//   · đơn KHÔNG xoá mềm
//   · **CHỈ** cập nhật cột `orderItemId`. Không đụng `amount`, `accountantStatus`,
//     `saleStatus`, `enrollmentId`, `paidDate`, `deletedAt`.
//
// ─────────────────────────────────────────────────────────────────────────────
// BỘ LỌC PHẢI GIỐNG HỆT BÁO CÁO — và một cái bẫy tôi đã bước vào
//
// Số 146 mà chủ dự án duyệt đến từ `scripts/bao-cao-doi-soat-tien.ts`, phần B, với đúng bốn
// điều kiện: `orderItemId: null` · `deletedAt: null` · `paymentType: "PAYMENT"` ·
// `order: locDonNhanTien()`. Lệnh backfill phải dùng **cùng** bộ lọc, kẻo hai con số không so
// được với nhau — và một lệnh ghi mà số liệu không đối chiếu được là một lệnh không ai kiểm.
//
// ⚠️ Bản đầu của tệp này lọc thêm `KHOAN_DA_XAC_NHAN` (trục A: `accountantStatus = CONFIRMED`).
// SAI, và sai theo một lối dễ lặp lại: đó là bộ lọc của câu *"đã thu bao nhiêu tiền"*, không
// phải câu *"khoản này của bé nào"*. `orderItemId` chỉ nói **bé nào**, hoàn toàn độc lập với
// việc kế toán đã xác nhận hay chưa; lọc trục A là để lại đúng những khoản đang chờ xác nhận
// ở trạng thái vô hình với công nợ từng con. Đúng luật đã ghi trong `docs/luat-doc-so-va-ket-luan.md`:
// *tập dựng cho mục đích A không dùng cho mục đích B khi chưa kiểm lại định nghĩa.*
//
// Hai điều kiện KHÔNG phải của chủ dự án mà đi theo báo cáo, nói ra để không ai tưởng là gốc:
//   · `paymentType: "PAYMENT"` — bỏ bút toán ĐIỀU CHỈNH/HOÀN. Chúng cũng có thể cần gắn con,
//     nhưng chúng KHÔNG nằm trong số 146 đã duyệt ⇒ để lượt sau, và hàm quét **đếm riêng**
//     chúng (`butToanKhac`) để không ai tưởng chúng không tồn tại.
//   · `Payment.deletedAt IS NULL` — gắn dòng hàng cho khoản đã xoá mềm không sửa được số nào
//     (mọi đường đọc đã lọc `deletedAt`), nên nó chỉ là một lượt ghi vô ích.
//
// ─────────────────────────────────────────────────────────────────────────────
// VÌ SAO KHÔNG `server-only`
//
// Nó phải import được từ `scripts/**` chạy bằng `tsx` ngoài Next. `lib/finance/ghi-tien-don.ts`
// có `import "server-only"` nên module này **không được** import nó — đã đo: script chết ngay
// với `Cannot find module 'server-only'`.
import type { Prisma, PrismaClient } from "@prisma/client";
// Một chỗ DUY NHẤT định nghĩa "đơn nào không nhận tiền" — đừng chép lại danh sách trạng thái.
import { TRANG_THAI_DON_KHONG_NHAN_TIEN } from "@/lib/payments/don-nhan-tien";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";

type Doc = Pick<PrismaClient, "payment" | "order">;
type Tx = Prisma.TransactionClient;

/** Một khoản sẽ được gắn. Không mang dữ liệu cá nhân — cố ý, vì nó đi vào log workflow. */
export type KhoanCanGan = {
  paymentId: string;
  orderId: string;
  orderCode: string;
  /** Dòng hàng DUY NHẤT của đơn. */
  orderItemId: string;
  amount: number;
  centerId: string | null;
};

export type KetQuaQuet = {
  khoan: KhoanCanGan[];
  /** Σ `amount` của `khoan`. */
  tongTien: number;
  /** Số ĐƠN riêng biệt trong `khoan`. */
  soDon: number;
  /** Khoản NULL thuộc đơn ≥2 con — KHÔNG backfill, sale tự chia. */
  donNhieuCon: { soKhoan: number; tongTien: number; soDon: number };
  /** Khoản NULL thuộc đơn KHÔNG có dòng hàng nào — không có gì để gắn. */
  donKhongCoDong: { soKhoan: number; tongTien: number };
  /** Khoản NULL bị `locDonNhanTien()` loại (DRAFT/CANCELLED/REFUNDED/xoá mềm). */
  ngoaiLocDonNhanTien: { soKhoan: number; tongTien: number };
  /** Bút toán ĐIỀU CHỈNH/HOÀN (`paymentType !== "PAYMENT"`) — ngoài số 146 đã duyệt. */
  butToanKhac: { soKhoan: number; tongTien: number };
};

/**
 * QUÉT — chỉ đọc. Không ghi một dòng nào.
 *
 * Trả về ĐẦY ĐỦ bốn nhóm, kể cả ba nhóm bị loại. "Không có cap im lặng": một bản kê chỉ in
 * nhóm sẽ-gắn đọc như thể phần còn lại không tồn tại.
 */
export async function quetKhoanCanGan(doc: Doc): Promise<KetQuaQuet> {
  // Một câu tra cho TOÀN BỘ khoản NULL, rồi phân nhóm trong bộ nhớ. Tra nhiều câu với điều
  // kiện khác nhau là mở đường cho hai nhóm lệch định nghĩa nhau — đúng lỗi mà `docSoTheoCon`
  // đã ghi chú và tránh bằng cùng cách này.
  const khoanNull = await doc.payment.findMany({
    where: { orderItemId: null, deletedAt: null },
    select: {
      id: true,
      orderId: true,
      amount: true,
      centerId: true,
      paymentType: true,
      order: {
        select: {
          code: true,
          status: true,
          deletedAt: true,
          items: { select: { id: true } },
        },
      },
    },
    orderBy: { paidDate: "asc" },
  });

  const cam = new Set<string>(TRANG_THAI_DON_KHONG_NHAN_TIEN);
  const khoan: KhoanCanGan[] = [];
  const nhieuCon = { soKhoan: 0, tongTien: 0, don: new Set<string>() };
  const khongDong = { soKhoan: 0, tongTien: 0 };
  const ngoai = { soKhoan: 0, tongTien: 0 };
  const khac = { soKhoan: 0, tongTien: 0 };

  for (const k of khoanNull) {
    const d = k.order;
    if (k.paymentType !== "PAYMENT") {
      khac.soKhoan += 1;
      khac.tongTien += k.amount;
      continue;
    }
    if (d.deletedAt !== null || cam.has(d.status)) {
      ngoai.soKhoan += 1;
      ngoai.tongTien += k.amount;
      continue;
    }
    if (d.items.length === 0) {
      khongDong.soKhoan += 1;
      khongDong.tongTien += k.amount;
      continue;
    }
    if (d.items.length > 1) {
      nhieuCon.soKhoan += 1;
      nhieuCon.tongTien += k.amount;
      nhieuCon.don.add(k.orderId);
      continue;
    }
    khoan.push({
      paymentId: k.id,
      orderId: k.orderId,
      orderCode: d.code,
      orderItemId: d.items[0]!.id,
      amount: k.amount,
      centerId: k.centerId,
    });
  }

  return {
    khoan,
    tongTien: khoan.reduce((s, x) => s + x.amount, 0),
    soDon: new Set(khoan.map((x) => x.orderId)).size,
    donNhieuCon: { soKhoan: nhieuCon.soKhoan, tongTien: nhieuCon.tongTien, soDon: nhieuCon.don.size },
    donKhongCoDong: khongDong,
    ngoaiLocDonNhanTien: ngoai,
    butToanKhac: khac,
  };
}

/**
 * GHI — gắn `orderItemId` cho các khoản của MỘT đơn, trong MỘT transaction.
 *
 * ⚠️ MỘT TRANSACTION MỖI ĐƠN, cố ý không phải một transaction cho cả 120 đơn:
 *   · một transaction dài trên prod giữ khoá lâu và chặn đường ghi thật của sale;
 *   · lệnh này **idempotent** nên cắt giữa đường không để lại trạng thái nửa vời — chạy lại
 *     chỉ thấy phần còn lại. Đổi lấy tính nguyên tử toàn cục không mang thêm an toàn nào.
 *
 * ⚠️ `updateMany` có `orderItemId: null` TRONG `where` — không phải `update` theo id. Nếu
 * trong lúc này sale vừa gắn tay khoản ấy thì phép ghi đổi **0 dòng** và ta bỏ qua, thay vì
 * đè lên lựa chọn của con người. Đây đúng là mẫu chống-đua được nêu là ngoại lệ hợp lệ của
 * luật rollback (CLAUDE.md mục 7): ghi có điều kiện, đổi 0 dòng, commit vô hại.
 */
export async function ganOrderItemChoDon(
  tx: Tx,
  input: { orderId: string; orderCode: string; khoan: readonly KhoanCanGan[]; actor: AuditActor },
): Promise<{ daGan: number; boQua: number }> {
  let daGan = 0;
  let boQua = 0;
  const xong: { paymentId: string; orderItemId: string; amount: number }[] = [];

  for (const k of input.khoan) {
    const r = await tx.payment.updateMany({
      where: { id: k.paymentId, orderItemId: null, deletedAt: null },
      data: { orderItemId: k.orderItemId },
    });
    if (r.count === 0) {
      boQua += 1;
      continue;
    }
    daGan += r.count;
    xong.push({ paymentId: k.paymentId, orderItemId: k.orderItemId, amount: k.amount });
  }

  // MỘT dòng AuditLog cho MỘT đơn (chủ dự án chốt), không phải một dòng mỗi khoản: người đọc
  // log sau này muốn biết "đơn này bị backfill lúc nào", còn chi tiết từng khoản nằm trong
  // `newValues`. Không ghi dòng nào khi không gắn được gì — một dòng audit không có thay đổi
  // nào đi kèm là rác làm loãng chính cái log.
  if (daGan > 0) {
    await writeAudit({
      tx,
      actor: input.actor,
      module: "finance",
      entityType: "Order",
      entityId: input.orderId,
      action: "PAYMENT_ORDER_ITEM_BACKFILLED",
      changedFields: ["orderItemId"],
      newValues: { orderCode: input.orderCode, soKhoan: daGan, khoan: xong },
      reason:
        "Backfill orderItemId cho khoản cũ của đơn MỘT con — cột ra đời 16/09/2026 nên mọi " +
        "khoản cũ hơn đều NULL. Chỉ ghi cột orderItemId.",
    });
  }

  return { daGan, boQua };
}
