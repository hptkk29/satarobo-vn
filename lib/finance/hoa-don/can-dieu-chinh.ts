// lib/finance/hoa-don/can-dieu-chinh.ts — hoá đơn đã xác nhận nào "cần điều chỉnh". THUẦN.
//
// Kế hoạch §2.2 + §5: cờ SUY RA lúc đọc, KHÔNG lưu cột. Lưu cột thì ba đường tiền diện R7
// (`refundPayment`, `adjustPayment`, huỷ đơn) phải thêm một phép ghi — đúng thứ §5 muốn tránh
// ("không chặn, không sửa"). Cờ tự hết khi đã có hoá đơn thay thế trỏ `thayTheChoId` vào bản này.

import { TRANG_THAI_DON_DA_HUY } from "./du-dieu-kien";

export function canDieuChinh(input: {
  hoaDon: {
    trangThai: string;
    xacNhanLuc: Date | null;
    tongTien: number;
    /** Đã có hoá đơn khác trỏ `thayTheChoId` về bản này. */
    coBanThayThe: boolean;
  };
  /** Các dòng nối của hoá đơn (`HoaDonKhoan`) — số ròng đã chụp lúc gắn. */
  khoan: readonly { paymentId: string; soTien: number }[];
  /** Số ròng HIỆN TẠI của từng khoản — `soTienRong` trên mọi dòng của đơn. */
  rongHienTai: ReadonlyMap<string, number>;
  /** Mọi dòng `Payment` có `adjustmentOfId` ∈ khoản của hoá đơn. */
  dongTroVao: readonly { adjustmentOfId: string; createdAt: Date; deletedAt: Date | null }[];
  trangThaiDon: string;
}): { can: boolean; lyDo: string[] } {
  const { hoaDon } = input;
  if (hoaDon.trangThai !== "DA_XAC_NHAN" || hoaDon.coBanThayThe) return { can: false, lyDo: [] };

  const lyDo: string[] = [];
  const cuaHoaDon = new Set(input.khoan.map((k) => k.paymentId));
  const moc = hoaDon.xacNhanLuc?.getTime() ?? Number.NEGATIVE_INFINITY;

  if (
    input.dongTroVao.some(
      (d) => d.deletedAt == null && cuaHoaDon.has(d.adjustmentOfId) && d.createdAt.getTime() > moc,
    )
  ) {
    lyDo.push("Có hoàn tiền / điều chỉnh trên khoản sau khi đã xuất hoá đơn");
  }
  if ((TRANG_THAI_DON_DA_HUY as readonly string[]).includes(input.trangThaiDon)) {
    lyDo.push("Đơn đã bị huỷ / hoàn sau khi xuất hoá đơn");
  }
  const tongHienTai = input.khoan.reduce((s, k) => s + (input.rongHienTai.get(k.paymentId) ?? 0), 0);
  if (tongHienTai !== hoaDon.tongTien) {
    lyDo.push(
      `Số tiền hiện tại (${tongHienTai.toLocaleString("vi-VN")}đ) khác tổng trên hoá đơn ` +
        `(${hoaDon.tongTien.toLocaleString("vi-VN")}đ)`,
    );
  }
  return { can: lyDo.length > 0, lyDo };
}
