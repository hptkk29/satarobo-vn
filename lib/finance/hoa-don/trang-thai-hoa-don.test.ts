// Ca [TTH-*] — MỘT DÒNG trên màn hoá đơn vẽ nút gì, nút nào tắt, và TẮT VÌ SAO.
//
// Khuôn `lib/payments/qr-theo-dot.ts`: quyết định "dòng này vẽ gì" ở MỘT chỗ thuần, không viết lại
// điều kiện trong component. Luật 12: nút chắc chắn bị từ chối là lời hứa suông — nên mọi nút TẮT
// phải kèm câu lý do, và câu đó phải nói bằng ngôn ngữ của nguyên nhân.
//
// Luật "Điều chỉnh sau GĐ 0" (PLAN §12): đo prod 25/09 có 22/31 khoản chờ THIẾU ghi danh. Nên chốt
// hoá đơn KHÔNG được phụ thuộc vào việc xác nhận được khoản — khoản chưa xác nhận được chỉ là
// CẢNH BÁO, không chặn trả hoá đơn cho khách. Thiếu thông tin người mua trên hệ thống cũng chỉ là
// cảnh báo: tờ hoá đơn đã được xuất ở MISA rồi (chủ dự án 26/09).
import { describe, it, expect } from "vitest";
import { hanhDongChoDong, nhanNutXacNhan } from "./trang-thai-hoa-don";

type Vao = Parameters<typeof hanhDongChoDong>[0];
const NHAP_DU = { coTepPdf: true, kyHieu: "1C26TSR", soHoaDon: "127", ngayPhatHanh: new Date("2026-09-04T00:00:00Z") };
const vao = (o: Partial<Vao> = {}): Vao => ({
  lanThu: { trangThai: "DU", thieu: 0, nhanDot: "Đợt 1", canhBao: [] },
  hoaDonNhap: NHAP_DU,
  coQuyen: true,
  khoOk: true,
  emailNhan: "phuhuynh@gmail.com",
  guiEmailKhach: true,
  thieuNguoiMua: [],
  khoanChuaXacNhanDuoc: [],
  boQuaNghiTrung: false,
  xuatTheoSoDaThu: false,
  ...o,
});

describe("[TTH-01] đường vui: đủ tệp + đủ số ⇒ Xác nhận sáng", () => {
  it("mọi nút bật, không lý do", () => {
    const r = hanhDongChoDong(vao());
    expect(r.xacNhan).toEqual({ bat: true, nhan: "Xác nhận & gửi tới ph******@gmail.com" });
    expect(r.taiPhieu).toBe(true);
    expect(r.taiLen.bat).toBe(true);
    expect(r.khongXuat).toBe(true);
  });
});

describe("[TTH-02] thứ tự lý do tắt nút — nguyên nhân GỐC nói trước", () => {
  it("không có quyền ⇒ mọi thứ tắt, nói thiếu quyền gì", () => {
    const r = hanhDongChoDong(vao({ coQuyen: false }));
    expect(r.taiPhieu).toBe(false);
    expect(r.taiLen).toEqual({ bat: false, lyDo: expect.stringContaining("payments:confirm") });
    expect(r.xacNhan.bat).toBe(false);
    expect(r.khongXuat).toBe(false);
  });

  it("đợt bị huỷ ⇒ không tải lên, không xác nhận; vẫn cho 'không xuất'", () => {
    const r = hanhDongChoDong(vao({ lanThu: { trangThai: "DOT_HUY", thieu: 0, nhanDot: "Đợt 1", canhBao: [] } }));
    expect(r.taiLen.bat).toBe(false);
    expect(r.xacNhan).toMatchObject({ bat: false, lyDo: expect.stringMatching(/huỷ/) });
    expect(r.khongXuat).toBe(true);
  });

  it("kho tệp chưa cấu hình ⇒ không tải lên được — nói ra, không để PUT chết câm", () => {
    const r = hanhDongChoDong(vao({ khoOk: false, hoaDonNhap: null }));
    expect(r.taiLen).toEqual({ bat: false, lyDo: expect.stringMatching(/chưa cấu hình/) });
    expect(r.xacNhan.bat).toBe(false);
  });

  it("chưa tải tệp ⇒ Xác nhận tắt, lý do 'chưa tải tệp PDF'", () => {
    const r = hanhDongChoDong(vao({ hoaDonNhap: null }));
    expect(r.xacNhan).toMatchObject({ bat: false, lyDo: expect.stringMatching(/PDF/) });
  });

  it("có tệp mà thiếu số / ký hiệu / ngày ⇒ tắt, nói thiếu ô nào", () => {
    const r = hanhDongChoDong(vao({ hoaDonNhap: { ...NHAP_DU, soHoaDon: null, ngayPhatHanh: null } }));
    expect(r.xacNhan.bat).toBe(false);
    expect(r.xacNhan.lyDo).toMatch(/số hoá đơn/);
    expect(r.xacNhan.lyDo).toMatch(/ngày phát hành/);
  });
});

describe("[TTH-03] LỆCH SỐ và NGHI TRÙNG", () => {
  it("THIẾU ⇒ Xác nhận tắt kèm số tiền + tên đợt, và mở nút 'Gắn thêm cho đủ'", () => {
    const r = hanhDongChoDong(vao({ lanThu: { trangThai: "THIEU", thieu: 1_000_000, nhanDot: "Đợt 2", canhBao: [] } }));
    expect(r.xacNhan.bat).toBe(false);
    expect(r.xacNhan.lyDo).toMatch(/1\.000\.000đ/);
    expect(r.xacNhan.lyDo).toMatch(/Đợt 2/);
    expect(r.ganThem).toBe(true);
  });

  it("THIẾU nhưng kế toán đã chọn 'xuất theo số đã thu' ⇒ Xác nhận sáng", () => {
    const r = hanhDongChoDong(
      vao({ lanThu: { trangThai: "THIEU", thieu: 1_000_000, nhanDot: "Đợt 2", canhBao: [] }, xuatTheoSoDaThu: true }),
    );
    expect(r.xacNhan.bat).toBe(true);
  });

  it("dòng ĐỦ thì KHÔNG vẽ nút 'Gắn thêm' (lời hứa suông)", () => {
    expect(hanhDongChoDong(vao()).ganThem).toBe(false);
  });

  it("NGHI TRÙNG ⇒ tắt cho tới khi kế toán xác nhận 'không trùng'", () => {
    const nghi = { trangThai: "NGHI_TRUNG" as const, thieu: 0, nhanDot: null, canhBao: [] };
    expect(hanhDongChoDong(vao({ lanThu: nghi })).xacNhan).toMatchObject({
      bat: false,
      lyDo: expect.stringMatching(/trùng/),
    });
    expect(hanhDongChoDong(vao({ lanThu: nghi, boQuaNghiTrung: true })).xacNhan.bat).toBe(true);
  });
});

describe("[TTH-04] CẢNH BÁO — hiện ra nhưng KHÔNG chặn trả hoá đơn cho khách", () => {
  it("khoản chưa xác nhận được (thiếu ghi danh / tự ghi) ⇒ cảnh báo, Xác nhận VẪN sáng", () => {
    const r = hanhDongChoDong(
      vao({ khoanChuaXacNhanDuoc: ["Khoản 3.000.000đ chưa gắn ghi danh — vẫn chờ kế toán xác nhận"] }),
    );
    expect(r.xacNhan.bat).toBe(true);
    expect(r.canhBao).toContain("Khoản 3.000.000đ chưa gắn ghi danh — vẫn chờ kế toán xác nhận");
  });

  it("thiếu thông tin người mua trên hệ thống ⇒ cảnh báo, không chặn (hoá đơn đã xuất ở MISA)", () => {
    const r = hanhDongChoDong(vao({ thieuNguoiMua: ["Địa chỉ người mua"] }));
    expect(r.xacNhan.bat).toBe(true);
    expect(r.canhBao.join(" ")).toMatch(/Địa chỉ người mua/);
  });

  it("cảnh báo của lần thu (vd mất giao dịch) được chuyển lên dòng", () => {
    const r = hanhDongChoDong(
      vao({ lanThu: { trangThai: "KHONG_DOI_CHIEU", thieu: 0, nhanDot: null, canhBao: ["Không tìm thấy giao dịch"] } }),
    );
    expect(r.canhBao).toContain("Không tìm thấy giao dịch");
  });
});

describe("[TTH-05] nhãn nút nói ĐÚNG việc nút sẽ làm", () => {
  it("có email + bật gửi ⇒ nói gửi tới đâu (che bớt email)", () => {
    expect(nhanNutXacNhan({ emailNhan: "ab@x.vn", guiEmailKhach: true })).toBe("Xác nhận & gửi tới ab@x.vn");
  });

  it("không có email ⇒ nói rõ sẽ báo sale", () => {
    expect(nhanNutXacNhan({ emailNhan: null, guiEmailKhach: true })).toBe(
      "Xác nhận (khách không có email — báo sale gửi Zalo)",
    );
  });

  it("vừa bỏ tick gửi VỪA không có email ⇒ vẫn nói KHÔNG gửi (lựa chọn của kế toán thắng)", () => {
    // Phép cấy 26/09 (đảo hai `if` đầu của `nhanNutXacNhan`) để 176/176 XANH: không ca nào thử
    // tổ hợp này. Đảo thứ tự thì nút nói "báo sale gửi Zalo" trong khi kế toán đã chọn KHÔNG gửi
    // — và `guiEmailKhach = false` cũng tắt luôn thông báo cho sale ở tầng gửi.
    expect(nhanNutXacNhan({ emailNhan: null, guiEmailKhach: false })).toBe("Xác nhận (không gửi email)");
  });

  it("kế toán bỏ tick gửi (MISA đã gửi rồi) ⇒ nói KHÔNG gửi", () => {
    expect(nhanNutXacNhan({ emailNhan: "phuhuynh@gmail.com", guiEmailKhach: false })).toBe(
      "Xác nhận (không gửi email)",
    );
  });
});
