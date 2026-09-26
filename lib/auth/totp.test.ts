// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  base32Decode,
  base32Encode,
  kiemMaTotp,
  maHotp,
  maTotp,
  sinhBiMatTotp,
  uriOtpAuth,
} from "./totp";

// Khoá mẫu của cả RFC 4226 Phụ lục D lẫn RFC 6238 Phụ lục B (bản SHA-1).
const KHOA_RFC = Buffer.from("12345678901234567890", "ascii");
const KHOA_RFC_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("[TOTP-01] base32", () => {
  it("mã hoá đúng khoá mẫu của RFC và giải ngược lại", () => {
    expect(base32Encode(KHOA_RFC)).toBe(KHOA_RFC_B32);
    expect(base32Decode(KHOA_RFC_B32).equals(KHOA_RFC)).toBe(true);
  });
  it("nhận chữ thường, dấu cách, dấu = đệm", () => {
    expect(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq==").equals(KHOA_RFC)).toBe(true);
  });
  it("ký tự ngoài bảng base32 thì ném", () => {
    expect(() => base32Decode("GEZD1")).toThrow();
  });
  it("bí mật sinh ra đủ 160 bit và mỗi lần một khác", () => {
    const a = sinhBiMatTotp();
    expect(base32Decode(a).length).toBe(20);
    expect(sinhBiMatTotp()).not.toBe(a);
  });
});

describe("[TOTP-02] HOTP khớp bộ số mẫu RFC 4226 Phụ lục D", () => {
  const mong = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  mong.forEach((ma, dem) => {
    it(`bộ đếm ${dem} → ${ma}`, () => expect(maHotp(KHOA_RFC, dem)).toBe(ma));
  });
});

describe("[TOTP-03] TOTP khớp bộ số mẫu RFC 6238 Phụ lục B (SHA-1, 8 chữ số)", () => {
  const mau: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  for (const [giay, ma] of mau) {
    it(`T=${giay} → ${ma}`, () => expect(maTotp(KHOA_RFC_B32, giay * 1000, 8)).toBe(ma));
  }
});

describe("[TOTP-04] kiemMaTotp", () => {
  const T = 1_790_316_000_000; // mốc cố định — test không đọc đồng hồ thật (luật 19)
  const ma = maTotp(KHOA_RFC_B32, T);

  it("mã đúng của bước hiện tại → trả số bước", () => {
    expect(kiemMaTotp(KHOA_RFC_B32, ma, T)).toBe(Math.floor(T / 30_000));
  });
  it("mã của bước trước (lệch 30 giây) vẫn nhận trong cửa sổ ±1", () => {
    expect(kiemMaTotp(KHOA_RFC_B32, ma, T + 30_000)).not.toBeNull();
  });
  it("lệch 2 bước (60 giây) thì từ chối", () => {
    expect(kiemMaTotp(KHOA_RFC_B32, ma, T + 60_000)).toBeNull();
  });
  it("mã sai → null", () => {
    const sai = ma === "000000" ? "111111" : "000000";
    expect(kiemMaTotp(KHOA_RFC_B32, sai, T)).toBeNull();
  });
  it("[TOTP-04b] chống phát lại: bước đã dùng thì không nhận lại mã đó", () => {
    const buoc = kiemMaTotp(KHOA_RFC_B32, ma, T);
    expect(buoc).not.toBeNull();
    expect(kiemMaTotp(KHOA_RFC_B32, ma, T, { buocDaDungCuoi: buoc })).toBeNull();
  });
  it("mã không đủ 6 chữ số hoặc có chữ → null, không ném", () => {
    expect(kiemMaTotp(KHOA_RFC_B32, "12345", T)).toBeNull();
    expect(kiemMaTotp(KHOA_RFC_B32, "12a456", T)).toBeNull();
  });
  it("[TOTP-04c] bí mật rỗng/cụt thì từ chối mọi mã (không để HMAC khoá rỗng sinh mã đoán được)", () => {
    const maKhoaRong = maHotp(Buffer.alloc(0), Math.floor(T / 30_000));
    expect(kiemMaTotp("", maKhoaRong, T)).toBeNull();
    expect(kiemMaTotp("AAAA", "000000", T)).toBeNull();
  });
  it("bí mật sai khuôn base32 → null, không ném", () => {
    expect(kiemMaTotp("!!!", ma, T)).toBeNull();
  });
});

describe("[TOTP-05] uriOtpAuth", () => {
  it("mang đủ tham số chuẩn để ứng dụng xác thực hiểu", () => {
    const uri = uriOtpAuth({ biMat: KHOA_RFC_B32, taiKhoan: "ceo@satarobo.vn", nhaPhatHanh: "Sata Robo" });
    expect(uri.startsWith("otpauth://totp/Sata%20Robo%3Aceo%40satarobo.vn?")).toBe(true);
    const q = new URL(uri).searchParams;
    expect(q.get("secret")).toBe(KHOA_RFC_B32);
    expect(q.get("algorithm")).toBe("SHA1");
    expect(q.get("digits")).toBe("6");
    expect(q.get("period")).toBe("30");
  });
});
