// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  bamBiMat,
  docPepperCong,
  moiTruongCuaMatKhau,
  moiTruongHienTai,
  sinhMaClient,
  sinhMatKhauClient,
  sinhToken,
  tachBasicAuth,
  tachBearer,
} from "./khoa";
import { tenMcp, tuTenMcp, laTenSoHopLe } from "./ten-cong-cu";

const PEPPER = "p".repeat(32);

describe("[AG-KH-01] sinh khoá", () => {
  it("tiền tố cố định + đủ 256 bit ngẫu nhiên cho mật khẩu và token", () => {
    const mk = sinhMatKhauClient("test");
    expect(mk.startsWith("srk_test_")).toBe(true);
    expect(Buffer.from(mk.slice("srk_test_".length), "base64url").length).toBe(32);
    expect(sinhMatKhauClient("live").startsWith("srk_live_")).toBe(true);
    expect(sinhToken().startsWith("sra_")).toBe(true);
    expect(sinhMaClient().startsWith("agc_")).toBe(true);
  });
  it("khớp mẫu gitleaks mà spec đề nghị (`sr[kasm]_(test_|live_)?[A-Za-z0-9_-]{32,}`)", () => {
    const mau = /sr[kasm]_(test_|live_)?[A-Za-z0-9_-]{32,}/;
    expect(mau.test(sinhMatKhauClient("live"))).toBe(true);
    expect(mau.test(sinhToken())).toBe(true);
  });
  it("hai lần sinh không trùng", () => {
    expect(sinhToken()).not.toBe(sinhToken());
  });
});

describe("[AG-KH-02] bamBiMat", () => {
  it("cùng đầu vào + cùng pepper → cùng bản băm; khác pepper → khác", () => {
    expect(bamBiMat("srk_test_x", PEPPER)).toBe(bamBiMat("srk_test_x", PEPPER));
    expect(bamBiMat("srk_test_x", PEPPER)).not.toBe(bamBiMat("srk_test_x", "q".repeat(32)));
  });
  it("bản băm không chứa bản rõ", () => {
    expect(bamBiMat("srk_test_bimat", PEPPER)).not.toContain("bimat");
  });
  it("[AG-KH-02b] pepper thiếu/ngắn thì NÉM — không băm tạm bằng pepper yếu", () => {
    expect(() => bamBiMat("x", "")).toThrow();
    expect(() => bamBiMat("x", "p".repeat(31))).toThrow();
  });
});

describe("[AG-KH-03] môi trường (spec §4.6, ca B3)", () => {
  it("chỉ đúng 'production' mới là live", () => {
    expect(moiTruongHienTai({ VERCEL_TARGET_ENV: "production" })).toBe("live");
    expect(moiTruongHienTai({ VERCEL_ENV: "production" })).toBe("live");
    expect(moiTruongHienTai({ VERCEL_TARGET_ENV: "test", VERCEL_ENV: "preview" })).toBe("test");
    expect(moiTruongHienTai({ VERCEL_ENV: "preview" })).toBe("test");
    expect(moiTruongHienTai({})).toBe("test");
  });
  it("VERCEL_TARGET_ENV thắng VERCEL_ENV (môi trường tuỳ biến 'test' chạy với VERCEL_ENV=preview)", () => {
    expect(moiTruongHienTai({ VERCEL_TARGET_ENV: "test", VERCEL_ENV: "production" })).toBe("test");
  });
  it("đọc môi trường của mật khẩu theo tiền tố", () => {
    expect(moiTruongCuaMatKhau("srk_live_abc")).toBe("live");
    expect(moiTruongCuaMatKhau("srk_test_abc")).toBe("test");
    expect(moiTruongCuaMatKhau("sra_abc")).toBeNull();
  });
  it("pepper: thiếu hoặc < 32 ký tự → null", () => {
    expect(docPepperCong({ AGENT_GATEWAY_PEPPER: PEPPER })).toBe(PEPPER);
    expect(docPepperCong({ AGENT_GATEWAY_PEPPER: "ngan" })).toBeNull();
    expect(docPepperCong({})).toBeNull();
  });
});

describe("[AG-KH-04] tách header", () => {
  const basic = (s: string) => `Basic ${Buffer.from(s).toString("base64")}`;
  it("Basic hợp lệ", () => {
    expect(tachBasicAuth(basic("agc_1:srk_test_2"))).toEqual({ clientId: "agc_1", matKhau: "srk_test_2" });
  });
  it("mật khẩu chứa dấu ':' vẫn tách đúng ở dấu ':' ĐẦU TIÊN", () => {
    expect(tachBasicAuth(basic("agc_1:a:b"))).toEqual({ clientId: "agc_1", matKhau: "a:b" });
  });
  it("thiếu phần nào hoặc sai khuôn → null", () => {
    expect(tachBasicAuth(null)).toBeNull();
    expect(tachBasicAuth(basic("agc_1"))).toBeNull();
    expect(tachBasicAuth(basic(":x"))).toBeNull();
    expect(tachBasicAuth(basic("agc_1:"))).toBeNull();
    expect(tachBasicAuth("Bearer abc")).toBeNull();
  });
  it("Bearer chỉ nhận token có tiền tố sra_", () => {
    expect(tachBearer("Bearer sra_abc")).toBe("sra_abc");
    expect(tachBearer("bearer sra_abc")).toBe("sra_abc");
    expect(tachBearer("Bearer srk_test_abc")).toBeNull();
    expect(tachBearer("Bearer")).toBeNull();
    expect(tachBearer(undefined)).toBeNull();
  });
});

describe("[AG-TEN-01] tên công cụ ↔ tên MCP (spec §3)", () => {
  it("đổi '.' thành '__' và ngược lại", () => {
    expect(tenMcp("kinh_doanh.lay_leads")).toBe("kinh_doanh__lay_leads");
    expect(tuTenMcp("kinh_doanh__lay_leads")).toBe("kinh_doanh.lay_leads");
  });
  it("mọi tên MCP nằm trong [a-zA-Z0-9_-]{1,64} — dấu chấm làm Claude API từ chối", () => {
    const t = tenMcp("van_ban.lay_khuyen_mai_hieu_luc");
    expect(/^[a-zA-Z0-9_-]{1,64}$/.test(t)).toBe(true);
  });
  it("tên sai khuôn bị từ chối", () => {
    expect(laTenSoHopLe("a.b.c")).toBe(false);
    expect(laTenSoHopLe("Kinh.lay")).toBe(false);
    expect(laTenSoHopLe("khongcocham")).toBe(false);
    expect(() => tenMcp("a.b.c")).toThrow();
    expect(tuTenMcp("khong_co_gach_doi")).toBeNull();
    expect(tuTenMcp("__lay")).toBeNull();
  });
  it("tên quá 64 ký tự khi đổi sang MCP thì không hợp lệ", () => {
    expect(laTenSoHopLe(`a.${"b".repeat(62)}`)).toBe(false);
  });
});
