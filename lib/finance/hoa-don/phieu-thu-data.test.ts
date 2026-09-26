// Ca [PTD-*] — MỘT công thức dữ liệu cho cả phiếu thu chính thức lẫn bản CHỜ XÁC NHẬN.
//
// Kế toán làm hoá đơn MISA theo bản chờ; tờ chính thức in sau (có số RCP) phải ra đúng dòng thu /
// thuế / người mua mà kế toán đã dựa vào. Hai công thức là đúng lớp lỗi sự cố nội dung CK 24/09.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dungPhieuThuData, tenHocVienChoKhoan } from "./phieu-thu-data";
import { CAU_HINH_HOA_DON_MAC_DINH, phapNhanChoDon } from "./phap-nhan";

const PN = phapNhanChoDon("CS1", CAU_HINH_HOA_DON_MAC_DINH)!;
const DON = {
  code: "ORD-1",
  type: "COURSE",
  customerName: "Nguyễn Văn A",
  customerPhone: "0905123456",
  customerEmail: null,
  customerAddress: "12 Lê Lợi",
  customerWard: null,
  customerCity: "Đà Nẵng",
  customerCccd: null,
  invoiceBuyerName: null,
  invoiceCompanyName: null,
  invoiceTaxCode: null,
  invoiceEmail: null,
};
const vao = (maPhieu: string | null) =>
  dungPhieuThuData({
    maPhieu,
    ngayLap: "10/09/2026",
    phapNhan: PN,
    cauHinh: CAU_HINH_HOA_DON_MAC_DINH,
    don: DON,
    soTien: 3_000_000,
    hinhThucThanhToan: "Chuyển khoản",
    tenKhoa: "Sata 4",
    tenHocVien: "Bé Một",
    tenLop: "S4-A",
    nguoiThu: "Sale",
  });

describe("[PTD-01] bản chờ và bản chính thức chỉ khác ô số phiếu", () => {
  it("cùng đầu vào ⇒ cùng dòng, cùng tổng, cùng người mua", () => {
    const cho = vao(null);
    const that = vao("RCP-260910-0001");
    expect(cho.maPhieu).toBeNull();
    expect({ ...cho, maPhieu: "X" }).toEqual({ ...that, maPhieu: "X" });
    expect(cho.dong[0]!.ten).toBe("Khoá học Sata 4 — HV Bé Một (lớp S4-A)");
    expect(cho.tong.congTienThanhToan).toBe(3_000_000);
  });
});

describe("[PTD-02] tên học viên theo KHOẢN, không theo đơn", () => {
  it("ghi danh → con trên đơn → học viên của đơn", () => {
    const don = { name: "Bé Của Đơn" };
    expect(tenHocVienChoKhoan({ enrollment: { student: { name: "Bé GD" } }, orderItem: { student: { name: "Bé Con" } } }, don)).toBe("Bé GD");
    expect(tenHocVienChoKhoan({ enrollment: null, orderItem: { student: { name: "Bé Con" } } }, don)).toBe("Bé Con");
    expect(tenHocVienChoKhoan({ enrollment: null, orderItem: null }, don)).toBe("Bé Của Đơn");
    expect(tenHocVienChoKhoan({ enrollment: null, orderItem: null }, null)).toBeNull();
  });
});

describe("[PTD-03] LƯỚI GHIM: hai route cùng đi qua dungPhieuThuData, không route nào tự dựng dòng", () => {
  const ROUTE = ["app/(admin)/admin/payments/[id]/phieu-thu/route.ts", "app/(admin)/admin/payments/hoa-don/phieu-cho/route.ts"];
  const boChuThich = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const f of ROUTE) {
    it(f, () => {
      const src = boChuThich(readFileSync(resolve(process.cwd(), f), "utf8"));
      expect(src.match(/\bdungPhieuThuData\(/g)?.length ?? 0).toBe(1);
      expect(src.match(/\btenHocVienChoKhoan\(/g)?.length ?? 0).toBe(1);
      // Trước bản vá: route chính thức tự gọi tinhDongHoaDon + tongHoaDon + soTienBangChu.
      expect(src).not.toMatch(/\btinhDongHoaDon\(|\btongHoaDon\(|\bsoTienBangChu\(/);
    });
  }
});
