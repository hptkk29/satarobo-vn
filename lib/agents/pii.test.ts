// @vitest-environment node
import { describe, it, expect } from "vitest";
import { cheVanBan, conLotLienHe, docPepperSdt, maHoaSdt, NHAN, nhanTepDinhKem } from "./pii";

const PEPPER = "x".repeat(32);

describe("[AG-PII-01] maHoaSdt — phát hiện lead trùng mà không thấy số (spec §6)", () => {
  it("cùng một số ở mọi cách viết → cùng mã; 16 ký tự hex", () => {
    const a = maHoaSdt("0905123456", PEPPER);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(maHoaSdt("84905123456", PEPPER)).toBe(a);
    expect(maHoaSdt("+84 905 123 456", PEPPER)).toBe(a);
    expect(maHoaSdt("0905.123.456", PEPPER)).toBe(a);
  });
  it("khác số → khác mã; khác pepper → khác mã", () => {
    expect(maHoaSdt("0905123457", PEPPER)).not.toBe(maHoaSdt("0905123456", PEPPER));
    expect(maHoaSdt("0905123456", "y".repeat(32))).not.toBe(maHoaSdt("0905123456", PEPPER));
  });
  it("số rỗng / không hợp lệ → null (khuôn lead cho phép null)", () => {
    expect(maHoaSdt(null, PEPPER)).toBeNull();
    expect(maHoaSdt("", PEPPER)).toBeNull();
    expect(maHoaSdt("12345", PEPPER)).toBeNull();
  });
  it("[AG-PII-01b] pepper thiếu/ngắn → NÉM (băm pepper yếu = dò ngược được từ danh bạ)", () => {
    expect(() => maHoaSdt("0905123456", "")).toThrow();
    expect(docPepperSdt({ AGENT_PII_PEPPER: "ngan" })).toBeNull();
    expect(docPepperSdt({ AGENT_PII_PEPPER: PEPPER })).toBe(PEPPER);
  });
});

describe("[AG-PII-02] cheVanBan — liên hệ trong văn bản tự do", () => {
  it("SĐT liền mạch, có dấu cách, có chấm, dạng +84", () => {
    expect(cheVanBan("số chị 0905123456 nha")).toBe(`số chị ${NHAN.SDT} nha`);
    expect(cheVanBan("gọi 0905 123 456")).toBe(`gọi ${NHAN.SDT}`);
    expect(cheVanBan("gọi 0905.123.456")).toBe(`gọi ${NHAN.SDT}`);
    expect(cheVanBan("gọi +84 905 123 456")).toBe(`gọi ${NHAN.SDT}`);
    expect(cheVanBan("gọi 84905123456")).toBe(`gọi ${NHAN.SDT}`);
  });
  it("email và CCCD 12 số", () => {
    expect(cheVanBan("mail me a.b+c@gmail.com")).toBe(`mail me ${NHAN.EMAIL}`);
    expect(cheVanBan("CCCD 048090001234 ạ")).toBe(`CCCD ${NHAN.CCCD} ạ`);
  });
  it("[AG-PII-02c] số trong ngoặc và CMND 9 số có từ khoá (rà bảo mật 25/09)", () => {
    expect(cheVanBan("gọi (0905) 123 456 nhé")).toBe(`gọi ${NHAN.SDT} nhé`);
    expect(cheVanBan("CMND số 048090001 ạ")).toBe(`CMND số ${NHAN.CCCD} ạ`);
    expect(cheVanBan("chứng minh nhân dân: 048090001")).toBe(`chứng minh nhân dân: ${NHAN.CCCD}`);
  });
  it("dãy 9 số KHÔNG có từ khoá (vd số tiền) thì không bị che thành CMND", () => {
    expect(cheVanBan("tổng 115200000 đồng")).toBe("tổng 115200000 đồng");
  });
  it("KHÔNG đục số tiền và ngày giờ thường gặp", () => {
    expect(cheVanBan("học phí 11520000 đồng")).toBe("học phí 11520000 đồng");
    expect(cheVanBan("ngày 11/09/2026 lúc 9h")).toBe("ngày 11/09/2026 lúc 9h");
  });
  it("[AG-PII-02b] kết quả che qua được đúng phép dò của máy kiểm kiem-khuon.mjs", () => {
    // Có cả dạng liền mạch LẪN dạng tách cụm — ca này phải tự đứng, không dựa ca bên trên
    // (cấy lỗi 25/09, phép M17: siết regex bỏ dạng tách cụm mà ca này vẫn xanh).
    // Máy kiểm của xưởng không bắt dạng tách cụm, nên ngoài `conLotLienHe` còn khẳng định
    // trực tiếp là không còn chữ số nào của các số đó.
    const tho = "Chị Lan 0905123456, mail lan@x.vn, CCCD 048090001234, số khác +84905123457, zalo 0905 777 888";
    expect(cheVanBan(tho)).not.toMatch(/0905 777 888|777/);
    expect(conLotLienHe(tho)).toBe(true);
    expect(conLotLienHe(cheVanBan(tho))).toBe(false);
  });
});

describe("[AG-PII-03] cheVanBan — tên ĐÃ BIẾT của đúng lead (spec §6 dòng 321)", () => {
  const ten = { phuHuynh: ["Trần Thị Lan"], con: ["Nguyễn Phương Quỳnh Anh"] };
  it("tên đầy đủ, hai chữ cuối, chữ cuối viết hoa", () => {
    expect(cheVanBan("Em chào chị Trần Thị Lan", ten)).toBe(`Em chào chị ${NHAN.TEN_PH}`);
    expect(cheVanBan("bé Quỳnh Anh lớp 3", ten)).toBe(`bé ${NHAN.TEN_CON} lớp 3`);
    expect(cheVanBan("bé Anh thích robot", ten)).toBe(`bé ${NHAN.TEN_CON} thích robot`);
    expect(cheVanBan("chị Lan ơi", ten)).toBe(`chị ${NHAN.TEN_PH} ơi`);
  });
  it("tên đầy đủ viết thường vẫn bị che", () => {
    expect(cheVanBan("con tên nguyễn phương quỳnh anh", ten)).toBe(`con tên ${NHAN.TEN_CON}`);
  });
  it("chữ cuối viết THƯỜNG giữa câu là đại từ — không che ('anh' ≠ bé Anh)", () => {
    expect(cheVanBan("dạ anh ơi em gọi lại", ten)).toBe("dạ anh ơi em gọi lại");
  });
  it("không che nhầm từ chứa tên bên trong ('Lang' không phải 'Lan')", () => {
    expect(cheVanBan("Lang Biang đẹp", ten)).toBe("Lang Biang đẹp");
  });
  it("tên có chữ cuối một ký tự không làm đục mọi chữ 'A' viết hoa", () => {
    expect(cheVanBan("A lô, Nguyễn Văn A đây", { phuHuynh: ["Nguyễn Văn A"] })).toBe(`A lô, ${NHAN.TEN_PH} đây`);
  });
  it("tên chứa ký tự đặc biệt của regex không làm vỡ hàm", () => {
    expect(() => cheVanBan("xin chào", { con: ["A+B (C)"] })).not.toThrow();
  });
  it("tên rỗng/null bị bỏ qua", () => {
    expect(cheVanBan("xin chào", { phuHuynh: [null, "", "  "] })).toBe("xin chào");
  });
});

describe("[AG-PII-04] tệp đính kèm chỉ còn nhãn", () => {
  it("ảnh → [ẢNH], còn lại → [TỆP]", () => {
    expect(nhanTepDinhKem("image/jpeg")).toBe(NHAN.ANH);
    expect(nhanTepDinhKem("application/pdf")).toBe(NHAN.TEP);
    expect(nhanTepDinhKem(null)).toBe(NHAN.TEP);
  });
});
