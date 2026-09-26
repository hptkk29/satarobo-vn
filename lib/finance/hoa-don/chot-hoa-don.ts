import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";
import { khoaDonTrongTx } from "@/lib/finance/ghi-tien-don";
import { LoiXacNhanKhoan, xacNhanKhoanTrongTx } from "@/lib/finance/payment";
import { soTienRong } from "./nguon-khoan";
import { TRANG_THAI_DON_DA_HUY } from "./du-dieu-kien";

// lib/finance/hoa-don/chot-hoa-don.ts — bước ⑤ "Xác nhận" của màn Hoá đơn điện tử
// (docs/ke-toan-hoa-don/PLAN.md §4 ⑤ + §0.1 phương án (b) + "Điều chỉnh sau GĐ 0" mục 1).
//
// Nút = CHỐT HOÁ ĐƠN. Xác nhận KHOẢN THU chỉ là phần đi kèm: khoản nào còn CHỜ và ĐỦ điều kiện (có
// ghi danh, không phải chính người bấm ghi nhận — AC5, tiền ròng > 0) thì xác nhận + cấp RCP trong
// CÙNG transaction; khoản nào không thì GIỮ CHỜ và trả về lý do. Không khoản nào chặn việc chốt
// hoá đơn — hoá đơn đã xuất ở MISA rồi (chủ dự án 26/09), đo prod 22/31 khoản chờ thiếu ghi danh.
//
// Thứ tự trong transaction — MỌI cổng đứng TRƯỚC phép ghi đầu tiên, từ chối = NÉM:
//   khoá đơn (advisory) → đọc hoá đơn NHÁP → đơn còn sống → khoá HÀNG các khoản (FOR UPDATE) →
//   tiền ròng từng khoản == số đã chụp lúc lưu nháp → [ghi #1] NHAP→DA_XAC_NHAN có điều kiện →
//   xác nhận từng khoản còn chờ → nhật ký.
// ⚠️ Người gọi (action) đã: kiểm quyền kế toán ĐÚNG cơ sở, dựng lại dòng bằng loader của màn và thấy
// nút Xác nhận SÁNG (lần thu đủ / đã chọn xuất theo số đã thu, có PDF + ký hiệu + số + ngày), và
// HEAD kho tệp thấy PDF còn đó. Ở đây chỉ còn phần phải NGUYÊN TỬ.

export type MaLoiChot = "DA_DOI" | "THIEU_THONG_TIN" | "DON_DA_HUY" | "TIEN_DA_DOI";

const CAU_LOI: Record<MaLoiChot, string> = {
  DA_DOI: "Hoá đơn vừa được người khác xác nhận, sửa hoặc gỡ — tải lại màn",
  THIEU_THONG_TIN: "Hoá đơn chưa đủ tệp PDF, ký hiệu, số và ngày phát hành",
  DON_DA_HUY: "Đơn đã huỷ / hoàn — không chốt hoá đơn cho đơn này",
  TIEN_DA_DOI: "Số tiền của lần thu đã đổi sau khi lưu nháp (hoàn / điều chỉnh / gỡ) — kiểm lại rồi lưu lại hoá đơn",
};

export class LoiChotHoaDon extends Error {
  constructor(readonly ma: MaLoiChot) {
    super(CAU_LOI[ma]);
    this.name = "LoiChotHoaDon";
  }
}

/** Câu cho người dùng nếu `e` là lỗi nghiệp vụ đã biết; `null` ⇒ lỗi lạ, người gọi ném tiếp. */
export function thongDiepLoiChot(e: unknown): string | null {
  return e instanceof LoiChotHoaDon || e instanceof LoiXacNhanKhoan ? e.message : null;
}

export type KetQuaChot = {
  /** Đã giành lượt gửi email hoá đơn cho khách (tầng email gửi sau commit). */
  coGuiEmail: boolean;
  /** Khoản vừa được xác nhận trong lượt này (có phiếu RCP). */
  daXacNhan: { paymentId: string; receiptCode: string | null }[];
  /** Khoản vẫn CHỜ kế toán — kèm lý do để màn nói ra. */
  conCho: { paymentId: string; lyDo: string }[];
};

export async function chotHoaDon(input: {
  nguoiChot: AuditActor & { id: string };
  orderId: string;
  hoaDonId: string;
  now: Date;
}): Promise<KetQuaChot> {
  const { nguoiChot, orderId, hoaDonId, now } = input;
  return db.$transaction(async (tx) => {
    // Cùng khoá với mọi đường ghi tiền của đơn (gắn / gỡ / tách / webhook) ⇒ không ai đổi tiền của
    // đơn này giữa lúc kiểm và lúc chốt.
    await khoaDonTrongTx(tx, orderId);

    const hd = await tx.hoaDonDienTu.findFirst({
      where: { id: hoaDonId, orderId, trangThai: "NHAP" },
      select: {
        updatedAt: true,
        centerId: true,
        tepPdfKey: true,
        kyHieu: true,
        soHoaDon: true,
        ngayPhatHanh: true,
        tongTien: true,
        emailNhan: true,
        guiEmailKhach: true,
        khoan: { where: { hieuLuc: true }, select: { paymentId: true, soTien: true } },
      },
    });
    if (!hd || hd.khoan.length === 0) throw new LoiChotHoaDon("DA_DOI");
    if (!hd.tepPdfKey || !hd.kyHieu || !hd.soHoaDon || !hd.ngayPhatHanh) throw new LoiChotHoaDon("THIEU_THONG_TIN");

    const don = await tx.order.findUnique({ where: { id: orderId }, select: { status: true, deletedAt: true } });
    if (!don || don.deletedAt || (TRANG_THAI_DON_DA_HUY as readonly string[]).includes(don.status)) {
      throw new LoiChotHoaDon("DON_DA_HUY");
    }

    const ids = hd.khoan.map((k) => k.paymentId);
    // Khoá HÀNG các khoản của hoá đơn — không đổi cột nào, chỉ chặn người khác sửa song song.
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
    // Tiền RÒNG cần MỌI dòng của đơn (bút toán đảo trỏ `adjustmentOfId` về khoản gốc).
    const cacDong = await tx.payment.findMany({
      where: { orderId, deletedAt: null },
      select: {
        id: true,
        amount: true,
        adjustmentOfId: true,
        deletedAt: true,
        accountantStatus: true,
        enrollmentId: true,
        recordedById: true,
      },
    });
    const rong = soTienRong(cacDong);
    for (const k of hd.khoan) {
      if ((rong.get(k.paymentId) ?? 0) !== k.soTien) throw new LoiChotHoaDon("TIEN_DA_DOI");
    }

    // ── Ghi #1 — có điều kiện (chống bấm đôi / hai kế toán cùng chốt): 0 dòng ⇒ ném.
    const upd = await tx.hoaDonDienTu.updateMany({
      where: { id: hoaDonId, trangThai: "NHAP", updatedAt: hd.updatedAt },
      data: { trangThai: "DA_XAC_NHAN", xacNhanBoiId: nguoiChot.id, xacNhanLuc: now },
    });
    if (upd.count !== 1) throw new LoiChotHoaDon("DA_DOI");

    // Lượt gửi email ĐẦU TIÊN — giành chỗ trong CÙNG transaction (PLAN §7): chốt mà quên ghi là
    // khách không bao giờ nhận; ghi ngoài transaction là chốt hỏng vẫn có lượt gửi. Việc GỬI do
    // tầng email làm sau commit; `@@unique([hoaDonId, lanGui])` chặn giành chỗ hai lần.
    // Không email / kế toán bỏ tick (MISA đã gửi rồi) ⇒ không có lượt nào — sale gửi Zalo.
    const toi = hd.guiEmailKhach ? hd.emailNhan : null;
    const coGuiEmail = Boolean(toi);
    if (toi) {
      await tx.hoaDonGuiEmail.create({
        data: { hoaDonId, lanGui: 1, toi, trangThai: "CHO", guiBoiId: nguoiChot.id },
      });
    }

    const theoId = new Map(cacDong.map((p) => [p.id, p]));
    const kq: KetQuaChot = { coGuiEmail, daXacNhan: [], conCho: [] };
    for (const id of ids) {
      const p = theoId.get(id);
      if (!p || p.accountantStatus !== "PENDING") continue;
      // Hai lý do giữ CHỜ nói trước bằng câu của nghiệp vụ; lý do khác do lõi quyết (và NÉM nếu
      // trạng thái đổi giữa chừng — không nuốt).
      if (!p.enrollmentId) {
        kq.conCho.push({ paymentId: id, lyDo: "Khoản chưa gắn ghi danh — gắn ghi danh rồi xác nhận ở màn Thanh toán" });
        continue;
      }
      if (p.recordedById && p.recordedById === nguoiChot.id) {
        kq.conCho.push({ paymentId: id, lyDo: "Khoản do chính bạn ghi nhận — cần một kế toán khác xác nhận" });
        continue;
      }
      const r = await xacNhanKhoanTrongTx(tx, { paymentId: id, confirmedById: nguoiChot.id, actor: nguoiChot, now });
      kq.daXacNhan.push({ paymentId: id, receiptCode: r.receiptCode ?? null });
    }

    await writeAudit({
      tx,
      actor: nguoiChot,
      module: "finance",
      entityType: "HoaDonDienTu",
      entityId: hoaDonId,
      action: "XAC_NHAN_HOA_DON",
      oldValues: { trangThai: "NHAP" },
      newValues: {
        trangThai: "DA_XAC_NHAN",
        orderId,
        kyHieu: hd.kyHieu,
        soHoaDon: hd.soHoaDon,
        tongTien: hd.tongTien,
        khoanDaXacNhan: kq.daXacNhan.map((x) => x.paymentId),
        khoanConCho: kq.conCho.map((x) => x.paymentId),
        coGuiEmail,
      },
      orgUnitId: hd.centerId,
    });
    return kq;
  });
}
