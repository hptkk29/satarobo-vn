// lib/finance/gan-ghi-danh-khoan.ts — chọn GHI DANH cho một khoản thu chưa gắn.
//
// ─────────────────────────────────────────────────────────────────────────────
// VÌ SAO TỒN TẠI
//
// Chủ dự án 14/09/2026, chỉ vào màn Thanh toán: "bấm xem thử xong chỉ xem và không có
// thao tác gì nữa à?"
//
// Khối "Học phí nhập từ file Excel" đếm được số khoản bị bỏ và nêu lý do, nhưng không cho
// làm gì với chúng. Mà lý do phổ biến nhất — `LY_DO_BO.CHUA_GAN_GHI_DANH` ("không sinh
// được phiếu thu") — là thứ SỬA ĐƯỢC: chỉ cần trỏ khoản vào đúng ghi danh của em. Không
// có đường sửa thì tiền nằm mãi ở trạng thái chờ, và cổng phụ huynh vẫn hiện nợ dù nhà đã
// đóng — đúng cái bệnh mà cả đợt này đi chữa.
//
// ─────────────────────────────────────────────────────────────────────────────
// GIỮ NGUYÊN LUẬT CỦA ĐƯỜNG NHẬP: gợi ý khi chắc, bắt chọn khi mơ hồ
//
// `ghi-giao-dich-cu.ts` cũng tự gắn, nhưng CHỈ khi không mơ hồ — đúng một ghi danh còn
// sống. Em học hai lớp thì phải chia tiền theo `finalPrice`, và đoán hộ ở đó là ghi tiền
// vào lớp sai: khoản đã gắn rồi thì công nợ của lớp kia vẫn nguyên, và không ai biết.
// Hàm này giữ đúng luật đó ở tầng sửa tay.
//
// THUẦN — không Prisma, không DB. Người gọi tra ghi danh rồi truyền vào.
// ─────────────────────────────────────────────────────────────────────────────

export const MUC_GAN = {
  /** Đúng một ghi danh còn sống ⇒ gợi ý sẵn, người dùng chỉ việc xác nhận. */
  CHAC_CHAN: "CHAC_CHAN",
  /** Nhiều ghi danh ⇒ PHẢI có người chọn. Không bao giờ tự lấy một cái. */
  PHAI_CHON: "PHAI_CHON",
  /** Em chưa có ghi danh nào ⇒ việc phải làm nằm ở màn khác, không phải ở đây. */
  KHONG_CO: "KHONG_CO",
} as const;
export type MucGan = (typeof MUC_GAN)[keyof typeof MUC_GAN];

export const NHAN_MUC_GAN: Record<MucGan, string> = {
  CHAC_CHAN: "Chỉ có một lớp — gắn được ngay",
  PHAI_CHON: "Em học nhiều lớp — chọn đúng lớp đã đóng tiền",
  KHONG_CO: "Em chưa có ghi danh nào",
};

export type GhiDanhUngVien = {
  id: string;
  tenLop: string | null;
  tenKhoa: string | null;
  /** `null` = chưa chốt giá. VẪN là ứng viên hợp lệ — xem `[GGK-04]`. */
  finalPrice: number | null;
};

export type KetQuaChonGhiDanh = {
  muc: MucGan;
  /** Chỉ có giá trị ở mức `CHAC_CHAN`. Mơ hồ thì `null` — người chọn, không phải máy. */
  ghiDanhId: string | null;
  ungVien: GhiDanhUngVien[];
};

export function chonGhiDanhChoKhoan(ghiDanh: GhiDanhUngVien[]): KetQuaChonGhiDanh {
  if (ghiDanh.length === 0) {
    return { muc: MUC_GAN.KHONG_CO, ghiDanhId: null, ungVien: [] };
  }
  if (ghiDanh.length === 1) {
    return { muc: MUC_GAN.CHAC_CHAN, ghiDanhId: ghiDanh[0]!.id, ungVien: ghiDanh };
  }
  return { muc: MUC_GAN.PHAI_CHON, ghiDanhId: null, ungVien: ghiDanh };
}
