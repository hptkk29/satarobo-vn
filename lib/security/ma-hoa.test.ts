// @vitest-environment node
import { describe, it, expect } from "vitest";
import { docKhoaMaHoa, giaiMa, maHoa } from "./ma-hoa";

const KHOA = Buffer.alloc(32, 7);

describe("[MH-01] AES-256-GCM", () => {
  it("mã hoá rồi giải mã ra đúng bản rõ", () => {
    const ban = maHoa("GEZDGNBVGY3TQOJQ", KHOA);
    expect(ban.startsWith("v1.")).toBe(true);
    expect(ban).not.toContain("GEZDGNBVGY3TQOJQ");
    expect(giaiMa(ban, KHOA)).toBe("GEZDGNBVGY3TQOJQ");
  });
  it("cùng bản rõ, hai lần mã hoá ra hai bản mã khác nhau (IV ngẫu nhiên)", () => {
    expect(maHoa("x", KHOA)).not.toBe(maHoa("x", KHOA));
  });
  it("[MH-01b] sửa một ký tự bản mã thì giải mã NÉM (GCM kiểm toàn vẹn)", () => {
    const ban = maHoa("bi-mat", KHOA);
    const phan = ban.split(".");
    const ct = phan[3];
    phan[3] = (ct[0] === "A" ? "B" : "A") + ct.slice(1);
    expect(() => giaiMa(phan.join("."), KHOA)).toThrow();
  });
  it("sai khoá thì giải mã NÉM", () => {
    const ban = maHoa("bi-mat", KHOA);
    expect(() => giaiMa(ban, Buffer.alloc(32, 8))).toThrow();
  });
  it("khoá không đúng 32 byte thì từ chối cả hai chiều", () => {
    expect(() => maHoa("x", Buffer.alloc(16))).toThrow();
    expect(() => giaiMa("v1.a.b.c", Buffer.alloc(16))).toThrow();
  });
  it("bản mã sai khuôn / sai phiên bản thì ném", () => {
    expect(() => giaiMa("v2.a.b.c", KHOA)).toThrow();
    expect(() => giaiMa("khong-phai-ban-ma", KHOA)).toThrow();
  });
});

describe("[MH-02] docKhoaMaHoa", () => {
  it("nhận base64 và hex của 32 byte", () => {
    expect(docKhoaMaHoa("K", { K: KHOA.toString("base64") })?.equals(KHOA)).toBe(true);
    expect(docKhoaMaHoa("K", { K: KHOA.toString("hex") })?.equals(KHOA)).toBe(true);
  });
  it("thiếu, rỗng hoặc sai độ dài → null (không có khoá tạm)", () => {
    expect(docKhoaMaHoa("K", {})).toBeNull();
    expect(docKhoaMaHoa("K", { K: "   " })).toBeNull();
    expect(docKhoaMaHoa("K", { K: Buffer.alloc(16).toString("base64") })).toBeNull();
  });
});
