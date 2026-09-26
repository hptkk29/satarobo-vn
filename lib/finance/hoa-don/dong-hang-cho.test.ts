// Ca [DHC-*] — dựng DÒNG của màn hoá đơn từ dữ liệu MỘT đơn đã nạp (docs/ke-toan-hoa-don/PLAN.md §4, §10).
//
// Hàm thuần ghép các luật đã có (phanLoaiKhoan · soTienRong · gomLanThu · hanhDongChoDong ·
// nguoiMuaChoDon) thành DTO đưa xuống client. Loader chỉ còn lo truy vấn, nên mọi quyết định "dòng
// này vào ngăn nào, vẽ gì, che gì" kiểm được ở đây không cần DB.
import { describe, it, expect } from "vitest";
import { dungDongHangCho, type DonVaoHangCho } from "./dong-hang-cho";
import { gatewayMarker, installmentMarker } from "@/lib/finance/payment-markers";

const khoan = (o: Partial<DonVaoHangCho["payments"][number]> & { id: string }): DonVaoHangCho["payments"][number] => ({
  amount: 3_000_000,
  method: "BANK_TRANSFER",
  note: gatewayMarker("SEPAY", "FT1"),
  paymentType: "PAYMENT",
  accountantStatus: "PENDING",
  enrollmentId: "enr1",
  recordedById: null,
  adjustmentOfId: null,
  paidDate: new Date("2026-09-10T03:00:00Z"),
  deletedAt: null,
  ...o,
});

const don = (o: Partial<DonVaoHangCho> = {}): DonVaoHangCho => ({
  id: "don1",
  code: "ORD-260910-000001",
  type: "COURSE",
  status: "CONFIRMED",
  centerId: "cs1",
  deletedAt: null,
  center: { code: "CS1", name: "Cơ sở 1" },
  customerName: "Nguyễn Phương Quỳnh Anh",
  customerPhone: "0905123456",
  customerEmail: "phuhuynh@gmail.com",
  customerAddress: "12 Lê Lợi",
  customerWard: null,
  customerCity: "Đà Nẵng",
  customerCccd: null,
  invoiceBuyerName: null,
  invoiceCompanyName: null,
  invoiceTaxCode: null,
  invoiceEmail: null,
  payments: [khoan({ id: "p1" })],
  paymentRequests: [
    {
      id: "dot1",
      orderItemId: null,
      installmentNo: 1,
      amountDue: 3_000_000,
      status: "PAID",
      allocations: [{ bankTransactionId: "bt1", paymentRequestId: "dot1", amount: 3_000_000, roundingWaived: 0 }],
    },
  ],
  hoaDonDienTu: [],
  ...o,
});

// Trạng thái kế toán đã xác nhận — hằng, không gõ literal (lưới `truc-a` [BUOC-6] quét cả tệp test).
const DA_XAC_NHAN = "CONFIRMED";

const GD = [
  { id: "bt1", provider: "SEPAY", providerTxnId: "FT1", transferredAt: new Date("2026-09-10T10:00:00Z"), amount: 3_000_000 },
];

type Vao = Parameters<typeof dungDongHangCho>[0];
const vao = (o: Partial<Vao> = {}): Vao => ({
  don: don(),
  giaoDich: GD,
  giaoDichChuaKhop: [],
  userId: "ke-toan",
  coQuyen: true,
  khoOk: true,
  canViewPii: true,
  ...o,
});

describe("[DHC-01] đường vui — một lần chuyển khoản đủ đợt", () => {
  it("một dòng, ngăn 'cho', nhãn đợt, số tiền, ngày theo lịch VN, nút xác nhận chờ tệp", () => {
    const { dong } = dungDongHangCho(vao());
    expect(dong).toHaveLength(1);
    expect(dong[0]).toMatchObject({
      key: "dot:dot1",
      orderId: "don1",
      maDon: "ORD-260910-000001",
      tenKhach: "Nguyễn Phương Quỳnh Anh",
      ngan: "cho",
      nhanDot: "Đợt 1",
      soTien: 3_000_000,
      ngayThu: "2026-09-10",
      ngayThuLabel: "10/09/2026",
      nguon: "CK",
      khoanIds: ["p1"],
      kyHieuMau: "1C26TSR",
    });
    expect(dong[0]!.hanhDong.xacNhan).toMatchObject({ bat: false, lyDo: expect.stringMatching(/PDF/) });
    expect(dong[0]!.nhan).toBe("Chờ xuất");
    expect(dong[0]!.tone).toBe("warning");
  });

  it("khoan[] mang số RÒNG — khoản gốc đã bị đảo một phần in đúng phần còn lại", () => {
    const d = don({
      payments: [
        khoan({ id: "p1" }),
        khoan({ id: "dao", amount: -1_000_000, paymentType: "ADJUSTMENT", adjustmentOfId: "p1", note: null }),
      ],
    });
    const { dong } = dungDongHangCho(vao({ don: d }));
    const r = dong.find((x) => x.khoanIds.includes("p1"))!;
    expect(r.khoan).toEqual([{ id: "p1", soTien: 2_000_000 }]);
  });
});

describe("[DHC-02] khoản ĐÃ KHOÁ vào hoá đơn không vào hàng chờ — nhưng dòng NHÁP giữ ĐÚNG khoá", () => {
  it("có hoá đơn nháp giữ p1 ⇒ không còn dòng 'cho'; có dòng 'nhap' mang CÙNG khoá dot:dot1", () => {
    const { dong } = dungDongHangCho(
      vao({
        don: don({
          hoaDonDienTu: [
            {
              id: "hd1",
              trangThai: "NHAP",
              kyHieu: "1C26TSR",
              soHoaDon: "127",
              ngayPhatHanh: new Date("2026-09-12T00:00:00Z"),
              tepPdfKey: "hoa-don/CS1/2026/don1/u.pdf",
              tepPdfTen: "hd.pdf",
              tepXmlTen: null,
              emailNhan: "phuhuynh@gmail.com",
              guiEmailKhach: true,
              xuatTheoSoDaThu: false,
              lyDo: null,
              khoan: [{ paymentId: "p1", soTien: 3_000_000 }],
            },
          ],
        }),
      }),
    );
    expect(dong.map((d) => [d.ngan, d.key])).toEqual([["nhap", "dot:dot1"]]);
    expect(dong[0]!.hoaDonNhap).toMatchObject({ id: "hd1", soHoaDon: "127", ngayPhatHanh: "2026-09-12" });
    expect(dong[0]!.hoaDon).toEqual({
      id: "hd1",
      trangThai: "NHAP",
      kyHieu: "1C26TSR",
      soHoaDon: "127",
      ngayPhatHanh: "2026-09-12",
      coPdf: true,
      coXml: false,
    });
    // Đủ tệp + số ⇒ Xác nhận sáng (hành vi GĐ 5 dựa trên chính cờ này).
    expect(dong[0]!.hanhDong.xacNhan.bat).toBe(true);
  });

  it("hoá đơn KHÔNG XUẤT ⇒ ngăn 'khong-xuat', lý do đi kèm", () => {
    const { dong } = dungDongHangCho(
      vao({
        don: don({
          hoaDonDienTu: [
            {
              id: "hd2",
              trangThai: "KHONG_XUAT",
              kyHieu: null,
              soHoaDon: null,
              ngayPhatHanh: null,
              tepPdfKey: null,
              tepPdfTen: null,
              tepXmlTen: null,
              emailNhan: null,
              guiEmailKhach: false,
              xuatTheoSoDaThu: false,
              lyDo: "Đã xuất ngoài hệ thống",
              khoan: [{ paymentId: "p1", soTien: 3_000_000 }],
            },
          ],
        }),
      }),
    );
    expect(dong.map((d) => d.ngan)).toEqual(["khong-xuat"]);
    expect(dong[0]!.lyDoKhongXuat).toBe("Đã xuất ngoài hệ thống");
    expect(dong[0]!.hoaDon).toMatchObject({ id: "hd2", trangThai: "KHONG_XUAT", coPdf: false });
    // Không phải nháp ⇒ `hoaDonNhap` trống (action lưu nháp dựa vào đúng cờ này).
    expect(dong[0]!.hoaDonNhap).toBeNull();
    expect(dong[0]!.tone).toBe("muted");
  });
});

describe("[DHC-03] ngăn theo trạng thái lần thu", () => {
  it("THIẾU ⇒ ngăn 'lech', nhãn nói số thiếu", () => {
    const d = don({
      payments: [khoan({ id: "p1", amount: 2_000_000 })],
      paymentRequests: [
        {
          id: "dot1",
          orderItemId: null,
          installmentNo: 1,
          amountDue: 3_000_000,
          status: "PARTIAL",
          allocations: [{ bankTransactionId: "bt1", paymentRequestId: "dot1", amount: 2_000_000, roundingWaived: 0 }],
        },
      ],
    });
    const { dong } = dungDongHangCho(vao({ don: d }));
    expect(dong[0]).toMatchObject({ ngan: "lech", tone: "danger", nhan: "Thiếu 1.000.000đ" });
  });

  it("đơn đã huỷ ⇒ ngăn 'don-huy'", () => {
    const { dong } = dungDongHangCho(vao({ don: don({ status: "CANCELLED" }) }));
    expect(dong.map((d) => d.ngan)).toEqual(["don-huy"]);
  });

  it("lời khai + chuyển khoản cùng đơn ⇒ dòng lời khai vào 'lech' (nghi trùng)", () => {
    const d = don({
      payments: [khoan({ id: "p1" }), khoan({ id: "khai", note: installmentMarker(1), method: "auto" })],
    });
    const { dong } = dungDongHangCho(vao({ don: d }));
    const khai = dong.find((x) => x.khoanIds.includes("khai"))!;
    expect(khai).toMatchObject({ ngan: "lech", nhan: "Nghi trùng" });
  });

  it("đơn thiếu cơ sở ⇒ KHÔNG ra dòng, đếm riêng", () => {
    const r = dungDongHangCho(vao({ don: don({ centerId: null, center: null }) }));
    expect(r.dong).toEqual([]);
    expect(r.thieuCoSo).toBe(1);
  });
});

describe("[DHC-04] cảnh báo — khoản không xác nhận được không chặn", () => {
  it("khoản CHỜ thiếu ghi danh ⇒ cảnh báo", () => {
    const { dong } = dungDongHangCho(vao({ don: don({ payments: [khoan({ id: "p1", enrollmentId: null })] }) }));
    expect(dong[0]!.hanhDong.canhBao.join(" ")).toMatch(/chưa gắn ghi danh/);
  });

  it("khoản CHỜ do chính kế toán ghi ⇒ cảnh báo AC5", () => {
    const { dong } = dungDongHangCho(vao({ don: don({ payments: [khoan({ id: "p1", recordedById: "ke-toan" })] }) }));
    expect(dong[0]!.hanhDong.canhBao.join(" ")).toMatch(/người khác xác nhận/);
  });

  it("khoản ĐÃ xác nhận thì không nhắc gì", () => {
    const { dong } = dungDongHangCho(
      vao({ don: don({ payments: [khoan({ id: "p1", enrollmentId: null, accountantStatus: DA_XAC_NHAN })] }) }),
    );
    expect(dong[0]!.hanhDong.canhBao.join(" ")).not.toMatch(/ghi danh/);
  });
});

describe("[DHC-05] PII và quyền", () => {
  it("thiếu orders:view-pii ⇒ che SĐT + email; tên không che", () => {
    const { dong } = dungDongHangCho(vao({ canViewPii: false }));
    expect(dong[0]!.tenKhach).toBe("Nguyễn Phương Quỳnh Anh");
    expect(dong[0]!.sdt).not.toBe("0905123456");
    expect(dong[0]!.emailNhan).not.toBe("phuhuynh@gmail.com");
    expect(JSON.stringify(dong[0])).not.toContain("0905123456");
    expect(JSON.stringify(dong[0])).not.toContain("12 Lê Lợi");
  });

  it("không phải kế toán của cơ sở ⇒ mọi nút tắt", () => {
    const { dong } = dungDongHangCho(vao({ coQuyen: false }));
    expect(dong[0]!.hanhDong.taiPhieu).toBe(false);
    expect(dong[0]!.hanhDong.taiLen.bat).toBe(false);
  });

  it("PH có khai thông tin hoá đơn ⇒ cờ coTtHoaDon", () => {
    const { dong } = dungDongHangCho(vao({ don: don({ invoiceCompanyName: "Công ty ABC" }) }));
    expect(dong[0]!.coTtHoaDon).toBe(true);
  });
});
