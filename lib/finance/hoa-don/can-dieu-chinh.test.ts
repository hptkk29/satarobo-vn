// Ca [CDC-*] — hoá đơn ĐÃ XÁC NHẬN nào "cần điều chỉnh".
//
// Kế hoạch §2.2: cờ này SUY RA lúc đọc, KHÔNG lưu cột — nếu lưu thì `refundPayment`,
// `adjustPayment` và huỷ đơn (ba đường tiền, diện R7) phải thêm một phép ghi mới. Suy ra thì không
// chạm đường tiền nào, và cờ tự hết khi có hoá đơn thay thế.
import { describe, it, expect } from "vitest";
import { canDieuChinh } from "./can-dieu-chinh";

const XN = new Date("2026-09-20T03:00:00Z");
const TRUOC = new Date("2026-09-19T03:00:00Z");
const SAU = new Date("2026-09-21T03:00:00Z");

type Vao = Parameters<typeof canDieuChinh>[0];
const vao = (o: Partial<Vao> = {}): Vao => ({
  hoaDon: { trangThai: "DA_XAC_NHAN", xacNhanLuc: XN, tongTien: 3_000_000, coBanThayThe: false },
  khoan: [{ paymentId: "p1", soTien: 3_000_000 }],
  rongHienTai: new Map([["p1", 3_000_000]]),
  dongTroVao: [],
  trangThaiDon: "CONFIRMED",
  ...o,
});

describe("[CDC-01] hoá đơn sạch ⇒ không cần điều chỉnh", () => {
  it("không có gì đổi sau khi xác nhận", () => {
    expect(canDieuChinh(vao())).toEqual({ can: false, lyDo: [] });
  });

  it("bút toán tạo ĐÚNG lúc xác nhận không tính là 'sau khi xuất' (biên — chốt 26/09)", () => {
    // Phép cấy 26/09 (`>` → `>=`) để mọi ca XANH: không ca nào đặt đúng biên. Chốt: hoá đơn phản
    // ánh trạng thái TẠI `xacNhanLuc`, nên bút toán cùng mốc không kích lý do "sau khi xuất". Đây
    // không phải lỗ tiền: nếu bút toán ấy làm lệch số thì vế "số tiền hiện tại khác tổng" vẫn bắt.
    expect(
      canDieuChinh(vao({ dongTroVao: [{ adjustmentOfId: "p1", createdAt: new Date(XN), deletedAt: null }] })),
    ).toEqual({ can: false, lyDo: [] });
    const lech = canDieuChinh(
      vao({
        dongTroVao: [{ adjustmentOfId: "p1", createdAt: new Date(XN), deletedAt: null }],
        rongHienTai: new Map([["p1", 2_000_000]]),
      }),
    );
    expect(lech.can, "cùng mốc nhưng làm lệch số ⇒ vế so tổng vẫn bắt").toBe(true);
    expect(lech.lyDo).toHaveLength(1);
  });

  it("bút toán trỏ vào khoản TRƯỚC lúc xác nhận không tính (hoá đơn đã phản ánh nó)", () => {
    expect(
      canDieuChinh(vao({ dongTroVao: [{ adjustmentOfId: "p1", createdAt: TRUOC, deletedAt: null }] })).can,
    ).toBe(false);
  });
});

describe("[CDC-02] ba lý do cần điều chỉnh", () => {
  it("hoàn / điều chỉnh SAU khi xác nhận", () => {
    const r = canDieuChinh(
      vao({
        dongTroVao: [{ adjustmentOfId: "p1", createdAt: SAU, deletedAt: null }],
        rongHienTai: new Map([["p1", 1_000_000]]),
      }),
    );
    expect(r.can).toBe(true);
    expect(r.lyDo).toHaveLength(2); // có bút toán mới VÀ tổng đã lệch
  });

  it("đơn bị huỷ / hoàn sau khi xuất", () => {
    for (const st of ["CANCELLED", "REFUNDED"]) {
      expect(canDieuChinh(vao({ trangThaiDon: st })).can, st).toBe(true);
    }
  });

  it("số ròng hiện tại khác tổng trên hoá đơn (vd điều chỉnh không mang dấu thời gian đáng tin)", () => {
    expect(canDieuChinh(vao({ rongHienTai: new Map([["p1", 2_500_000]]) })).can).toBe(true);
  });

  it("bút toán đã XOÁ MỀM không tính", () => {
    expect(
      canDieuChinh(vao({ dongTroVao: [{ adjustmentOfId: "p1", createdAt: SAU, deletedAt: SAU }] })).can,
    ).toBe(false);
  });
});

describe("[CDC-03] khi nào KHÔNG hỏi", () => {
  it("hoá đơn chưa xác nhận / không xuất / đã bị thay ⇒ không bao giờ 'cần điều chỉnh'", () => {
    for (const trangThai of ["NHAP", "KHONG_XUAT", "THAY_THE"]) {
      expect(
        canDieuChinh(vao({ hoaDon: { trangThai, xacNhanLuc: null, tongTien: 3_000_000, coBanThayThe: false }, trangThaiDon: "CANCELLED" })).can,
        trangThai,
      ).toBe(false);
    }
  });

  it("đã có bản thay thế ⇒ cờ tự hết", () => {
    expect(
      canDieuChinh(
        vao({
          hoaDon: { trangThai: "DA_XAC_NHAN", xacNhanLuc: XN, tongTien: 3_000_000, coBanThayThe: true },
          trangThaiDon: "CANCELLED",
        }),
      ).can,
    ).toBe(false);
  });
});
