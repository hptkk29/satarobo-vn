import "server-only";
import type { Actor } from "@/lib/auth/actor";
import { passesScope, scopedDb } from "@/lib/db-scope";
import { nguonGiaoDich } from "./nguon-khoan";
import { coQuyenKeToanTaiCoSo, duocTaiBanHoaDon } from "./quyen";
import { khoHoaDonDaCauHinh } from "./kho-tep";
import { dungKhoiHoaDonDon, type KhoiHoaDonDon } from "./khoi-hoa-don-don";

// lib/finance/hoa-don/nap-khoi-hoa-don-don.ts — nạp dữ liệu khối "Hoá đơn" trên trang chi tiết đơn
// (GĐ 7, PLAN §8). CHỈ ĐỌC. Mọi quyết định dòng / nhãn / nút nằm ở `khoi-hoa-don-don.ts` (thuần).
//
// Hai nhịp, KHÔNG N+1:
//   nhịp 1 (song song): đơn + khoản + đợt/phân bổ · đơn + hoá đơn còn hiệu lực + lượt gửi mới nhất
//   nhịp 2 (song song): giao dịch mà khoản + phân bổ trỏ tới · dòng hàng đợi email của lượt gửi
// Trang đơn gọi hàm này TRONG một lô `Promise.all` có sẵn (`[DST-01]` — không thêm `await` nối đuôi).
//
// ⚠️ Khoản + hoá đơn đọc LỒNG dưới Order — cùng khuôn `hang-cho.ts`: câu top-level `sdb.payment`
// lọc từng dòng theo `Payment.centerId` ⇒ dòng đảo lệch/NULL bị ẩn ⇒ `soTienRong` thiếu phần trừ.
// Quan hệ lồng KHÔNG qua hook xoá mềm ⇒ tự `deletedAt: null`. Người xem ĐÃ qua cổng `orders:view`
// + phạm vi `Order` của trang; trạng thái hoá đơn của đơn là một phần trạng thái tiền của đơn.
// ⚠️ NÚT TẢI thì khác: route tải đọc `HoaDonDienTu` qua `scopedDb` (tiền tố `payments:`) ⇒ ở đây
// hỏi lại ĐÚNG cổng đó (`passesScope`) cho từng bản, kẻo nút hiện mà route trả 404.

const TRANG_THAI_CON_HIEU_LUC = ["NHAP", "DA_XAC_NHAN", "KHONG_XUAT"] as const;

export async function napKhoiHoaDonDon(
  actor: Actor,
  opts: {
    orderId: string;
    /** `orders:view-pii` — che email trên dòng + nhánh tải bản ĐÃ XÁC NHẬN của route. */
    xemPii: boolean;
    /** `payments:confirm` (trần) — nhánh "kế toán cơ sở" của route. */
    keToan: boolean;
  },
): Promise<KhoiHoaDonDon | null> {
  const sdb = scopedDb(actor);
  // Nhịp 1 chia HAI câu chạy song song (review GĐ 7): một câu lồng ba tầng là ~9 lượt đi-về NỐI ĐUÔI
  // (Prisma chạy từng tầng quan hệ lần lượt) và thành nhánh dài nhất của lô 2 trên trang đơn.
  const donTienP = sdb.order.findUnique({
    where: { id: opts.orderId },
    select: {
      id: true,
      code: true,
      type: true,
      status: true,
      centerId: true,
      deletedAt: true,
      center: { select: { code: true, name: true } },
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      customerAddress: true,
      customerWard: true,
      customerCity: true,
      customerCccd: true,
      invoiceBuyerName: true,
      invoiceCompanyName: true,
      invoiceTaxCode: true,
      invoiceEmail: true,
      payments: {
        where: { deletedAt: null },
        select: {
          id: true,
          amount: true,
          method: true,
          note: true,
          paymentType: true,
          accountantStatus: true,
          enrollmentId: true,
          recordedById: true,
          adjustmentOfId: true,
          paidDate: true,
          deletedAt: true,
        },
      },
      paymentRequests: {
        select: {
          id: true,
          orderItemId: true,
          installmentNo: true,
          amountDue: true,
          status: true,
          allocations: {
            select: { bankTransactionId: true, paymentRequestId: true, amount: true, roundingWaived: true },
          },
        },
      },
    },
  });
  // Nửa sau của nhịp 1 — hoá đơn còn hiệu lực + dòng nối + lượt gửi, CÙNG cổng phạm vi `Order`.
  const donHoaDon = sdb.order.findUnique({
    where: { id: opts.orderId },
    select: {
      id: true,
      hoaDonDienTu: {
        where: { trangThai: { in: [...TRANG_THAI_CON_HIEU_LUC] } },
        select: {
          id: true,
          centerId: true,
          trangThai: true,
          kyHieu: true,
          soHoaDon: true,
          ngayPhatHanh: true,
          tongTien: true,
          tepPdfKey: true,
          tepPdfTen: true,
          tepXmlKey: true,
          tepXmlTen: true,
          emailNhan: true,
          guiEmailKhach: true,
          xuatTheoSoDaThu: true,
          lyDo: true,
          khoan: { where: { hieuLuc: true }, select: { paymentId: true, soTien: true } },
          guiEmail: {
            orderBy: { lanGui: "desc" },
            take: 1,
            select: { lanGui: true, toi: true, trangThai: true, loi: true, emailQueueId: true, updatedAt: true },
          },
        },
      },
    },
  });
  const [donTien, hd] = await Promise.all([donTienP, donHoaDon]);
  if (!donTien || !hd) return null;
  const don = { ...donTien, hoaDonDienTu: hd.hoaDonDienTu };

  // Nhịp 2 — giao dịch (marker + phân bổ) và dòng hàng đợi của lượt gửi, cùng một lượt.
  const btIds = new Set<string>();
  const txnIds = new Set<string>();
  for (const r of don.paymentRequests) for (const a of r.allocations) btIds.add(a.bankTransactionId);
  for (const p of don.payments) {
    const n = nguonGiaoDich(p.note);
    if (n.loai === "GAN_TAY") btIds.add(n.bankTransactionId);
    else if (n.loai === "WEBHOOK") txnIds.add(n.providerTxnId);
  }
  const queueIds = don.hoaDonDienTu.flatMap((h) => h.guiEmail.map((g) => g.emailQueueId)).filter((id): id is string => id != null);
  const [giaoDich, hangDoi] = await Promise.all([
    btIds.size + txnIds.size === 0
      ? []
      : sdb.bankTransaction.findMany({
          where: { OR: [{ id: { in: [...btIds] } }, { providerTxnId: { in: [...txnIds] } }] },
          select: { id: true, provider: true, providerTxnId: true, transferredAt: true, amount: true },
        }),
    queueIds.length === 0
      ? []
      : // CHỈ cột trạng thái — dòng hàng đợi mang địa chỉ + thân email + văn bản lỗi.
        sdb.emailQueue.findMany({
          where: { id: { in: queueIds } },
          select: { id: true, status: true, sentAt: true, attempts: true, maxAttempts: true },
        }),
  ]);

  return dungKhoiHoaDonDon({
    don: {
      ...don,
      hoaDonDienTu: don.hoaDonDienTu.map((h) => ({
        ...h,
        taiDuoc:
          passesScope("HoaDonDienTu", { centerId: h.centerId }, actor) &&
          duocTaiBanHoaDon({
            keToanCoSo: opts.keToan && coQuyenKeToanTaiCoSo(actor, h.centerId),
            xemPii: opts.xemPii,
            trangThai: h.trangThai,
          }),
      })),
    },
    giaoDich,
    hangDoi,
    xemPii: opts.xemPii,
    khoOk: khoHoaDonDaCauHinh(),
    userId: actor.userId,
  });
}
