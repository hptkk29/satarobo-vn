import "server-only";
import type { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { canonicalPhone } from "@/lib/phone";
import { extractVnPhoneCandidates } from "@/lib/payments/sdt-trong-memo";
import { nguonGiaoDich } from "./nguon-khoan";
import { coQuyenKeToanTaiCoSo } from "./quyen";
import { khoHoaDonDaCauHinh } from "./kho-tep";
import { dungDongHangCho, type DongHangCho } from "./dong-hang-cho";

// lib/finance/hoa-don/hang-cho.ts — nạp dữ liệu cho màn Hoá đơn điện tử (PLAN §4, §10). CHỈ ĐỌC.
//
// Hai nhịp, ba câu top-level, KHÔNG N+1 (luật độ sâu tuần tự — `[DST-01]`):
//   nhịp 1 (song song): đơn ứng viên + con lồng · giao dịch CHƯA KHỚP
//   nhịp 2: giao dịch mà khoản + phân bổ của các đơn trỏ tới
// Mọi quyết định dòng/ngăn/nút nằm ở `dong-hang-cho.ts` (thuần, có test).
//
// ⚠️ Khoản đọc LỒNG dưới Order, KHÔNG tra top-level `sdb.payment`: câu top-level lọc từng dòng theo
// `Payment.centerId`, dòng đảo lệch/NULL bị ẩn với kế toán cơ sở ⇒ `soTienRong` thiếu phần trừ ⇒
// xuất hoá đơn cho tiền đã hoàn. Quan hệ lồng KHÔNG được hook xoá mềm ⇒ tự `deletedAt: null`.
// ⚠️ `content` của giao dịch chưa khớp chứa SĐT — chỉ dùng để bóc SĐT ở đây, KHÔNG đưa xuống client.

/** Khoản có thể còn chưa có hoá đơn — sàng thô ở SQL; luật đầy đủ là `phanLoaiKhoan`. */
const KHOAN_UNG_VIEN = {
  deletedAt: null,
  paymentType: "PAYMENT",
  amount: { gt: 0 },
  accountantStatus: { not: "REJECTED" },
  hoaDonKhoan: { none: { hieuLuc: true } },
} satisfies Prisma.PaymentWhereInput;

const TRANG_THAI_CON_HIEU_LUC = ["NHAP", "DA_XAC_NHAN", "KHONG_XUAT"] as const;

export type KetQuaHangCho = {
  dong: DongHangCho[];
  /** Số KHOẢN tiền thật trên đơn chưa có cơ sở — không tạo hoá đơn được, màn phải nói ra. */
  thieuCoSo: number;
  khoOk: boolean;
};

export async function napHangChoHoaDon(
  actor: Actor,
  /**
   * `orderId` chỉ THU HẸP (route phiếu chờ, action lưu nháp): dòng được dựng bằng CHÍNH hàm màn
   * dùng, nên khoá `?chon=` và tập khoản khớp đúng thứ kế toán đang nhìn — server không nhận
   * danh sách khoản từ client.
   */
  opts: { canViewPii: boolean; orderId?: string },
): Promise<KetQuaHangCho> {
  const sdb = scopedDb(actor);
  const [don, chuaKhop] = await Promise.all([
    sdb.order.findMany({
      where: {
        ...(opts.orderId ? { id: opts.orderId } : {}),
        OR: [
          { payments: { some: KHOAN_UNG_VIEN } },
          { hoaDonDienTu: { some: { trangThai: { in: [...TRANG_THAI_CON_HIEU_LUC] } } } },
        ],
      },
      orderBy: { createdAt: "asc" },
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
        hoaDonDienTu: {
          where: { trangThai: { in: [...TRANG_THAI_CON_HIEU_LUC] } },
          select: {
            id: true,
            trangThai: true,
            kyHieu: true,
            soHoaDon: true,
            ngayPhatHanh: true,
            tepPdfKey: true,
            tepPdfTen: true,
            tepXmlTen: true,
            emailNhan: true,
            guiEmailKhach: true,
            xuatTheoSoDaThu: true,
            lyDo: true,
            khoan: { where: { hieuLuc: true }, select: { paymentId: true, soTien: true } },
          },
        },
      },
    }),
    sdb.bankTransaction.findMany({
      where: { status: "UNMATCHED" },
      select: { provider: true, amount: true, content: true },
    }),
  ]);

  // Nhịp 2 — giao dịch mà khoản (marker) + phân bổ trỏ tới, một câu.
  const btIds = new Set<string>();
  const txnIds = new Set<string>();
  for (const d of don) {
    for (const r of d.paymentRequests) for (const a of r.allocations) btIds.add(a.bankTransactionId);
    for (const p of d.payments) {
      const n = nguonGiaoDich(p.note);
      if (n.loai === "GAN_TAY") btIds.add(n.bankTransactionId);
      else if (n.loai === "WEBHOOK") txnIds.add(n.providerTxnId);
    }
  }
  const giaoDich =
    btIds.size + txnIds.size === 0
      ? []
      : await sdb.bankTransaction.findMany({
          where: { OR: [{ id: { in: [...btIds] } }, { providerTxnId: { in: [...txnIds] } }] },
          select: { id: true, provider: true, providerTxnId: true, transferredAt: true, amount: true },
        });

  // SĐT → số tiền của giao dịch chưa khớp (loại giao dịch giả BACKFILL — PLAN §3.4).
  const chuaKhopTheoSdt = new Map<string, { amount: number }[]>();
  for (const g of chuaKhop) {
    if (g.provider.toUpperCase() === "BACKFILL") continue;
    for (const sdt of extractVnPhoneCandidates(g.content)) {
      const ds = chuaKhopTheoSdt.get(sdt) ?? [];
      ds.push({ amount: g.amount });
      chuaKhopTheoSdt.set(sdt, ds);
    }
  }

  const khoOk = khoHoaDonDaCauHinh();
  const dong: DongHangCho[] = [];
  let thieuCoSo = 0;
  for (const d of don) {
    const sdt = canonicalPhone(d.customerPhone);
    const r = dungDongHangCho({
      don: d,
      giaoDich,
      giaoDichChuaKhop: sdt ? (chuaKhopTheoSdt.get(sdt) ?? []) : [],
      userId: actor.userId,
      coQuyen: coQuyenKeToanTaiCoSo(actor, d.centerId),
      khoOk,
      canViewPii: opts.canViewPii,
    });
    dong.push(...r.dong);
    thieuCoSo += r.thieuCoSo;
  }
  // Cũ nhất lên trước — lần thu chờ lâu nhất là việc kế toán nên làm trước (khuôn /orders/duyet).
  dong.sort((a, b) => (a.ngayThu === b.ngayThu ? a.key.localeCompare(b.key) : a.ngayThu.localeCompare(b.ngayThu)));
  return { dong, thieuCoSo, khoOk };
}
