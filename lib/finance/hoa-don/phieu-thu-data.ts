// lib/finance/hoa-don/phieu-thu-data.ts — dựng DỮ LIỆU một tờ phiếu thu. THUẦN.
//
// MỘT công thức cho CẢ HAI bản: bản chính thức (`payments/[id]/phieu-thu`, có số RCP) và bản CHỜ XÁC
// NHẬN (`payments/hoa-don/phieu-cho`, `maPhieu = null`). Kế toán làm hoá đơn ở MISA theo bản chờ;
// hai công thức thì tờ chính thức in ra sau có thể lệch tờ kế toán đã dựa vào — đúng lớp lỗi của
// sự cố nội dung CK trên QR (24/09: hai công thức cho cùng một chuỗi).

import type { PhieuThuPdfData } from "@/lib/pdf/phieu-thu";
import { thueChoLoaiDon, type CauHinhHoaDon, type PhapNhan } from "./phap-nhan";
import { nguoiMuaChoDon, type DonChoHoaDon } from "./nguoi-mua";
import { soTienBangChu } from "./so-tien-bang-chu";
import { tinhDongHoaDon, tongHoaDon } from "./tinh-hoa-don";

export function dungPhieuThuData(input: {
  /** `null` ⇒ bản CHỜ XÁC NHẬN (dấu nền, ô số trống). */
  maPhieu: string | null;
  /** dd/mm/yyyy. */
  ngayLap: string;
  phapNhan: PhapNhan;
  cauHinh: CauHinhHoaDon;
  don: DonChoHoaDon & { code: string | null; type: string | null };
  /** Số tiền của khoản — bản chờ truyền số RÒNG (`soTienRong`). */
  soTien: number;
  /** Nhãn hình thức đã tra từ danh mục; rỗng thì PDF tự rơi về bảng nhãn dự phòng. */
  hinhThucThanhToan: string;
  tenKhoa: string | null;
  tenHocVien: string | null;
  tenLop: string | null;
  nguoiThu: string | null;
}): PhieuThuPdfData {
  const { thueSuat, kieuGia } = thueChoLoaiDon(input.don.type ?? "TAT_CA", input.cauHinh);
  const dong = [
    tinhDongHoaDon({
      // Nội dung thu viết như mẫu VIN: "Khoá học <khoá> — HV <tên bé>".
      ten:
        [input.tenKhoa ? `Khoá học ${input.tenKhoa}` : "Học phí", input.tenHocVien ? `HV ${input.tenHocVien}` : null]
          .filter(Boolean)
          .join(" — ") + (input.tenLop ? ` (lớp ${input.tenLop})` : ""),
      donViTinh: input.tenKhoa ? "Khoá" : "Lần",
      soLuong: 1,
      soTien: input.soTien,
      thueSuat,
      kieuGia,
    }),
  ];
  const tong = tongHoaDon(dong);
  return {
    maPhieu: input.maPhieu,
    ngayLap: input.ngayLap,
    phapNhan: input.phapNhan,
    nguoiMua: nguoiMuaChoDon(input.don),
    hinhThucThanhToan: input.hinhThucThanhToan,
    dong,
    tong,
    soTienBangChu: soTienBangChu(tong.congTienThanhToan),
    maDon: input.don.code,
    nguoiThu: input.nguoiThu,
  };
}

/**
 * Tên học viên in trên tờ của MỘT khoản — ghi danh → con trên đơn → học viên của đơn.
 *
 * Đơn hai con: `Order.student` chỉ là MỘT bé, nên in theo nó là tờ của bé thứ hai mang tên bé thứ
 * nhất. Bản chính thức và bản chờ cùng gọi hàm này — một chuỗi ưu tiên, không phải hai.
 */
export function tenHocVienChoKhoan(
  khoan: {
    enrollment: { student: { name: string } | null } | null;
    orderItem: { student: { name: string } | null } | null;
  },
  hocVienCuaDon: { name: string } | null | undefined,
): string | null {
  return khoan.enrollment?.student?.name ?? khoan.orderItem?.student?.name ?? hocVienCuaDon?.name ?? null;
}
