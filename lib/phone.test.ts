import { describe, expect, it } from "vitest";
import { canonicalPhone, formatPhoneVN, isValidPhoneVN, phoneVariants, PHONE_VN_RE } from "./phone";

describe("[AUTH-SDT-P1-C1] canonicalPhone — gom 3 định dạng mâu thuẫn về 84XXXXXXXXX", () => {
  it.each([
    ["0905123456", "84905123456"],
    ["+84905123456", "84905123456"],
    ["0084905123456", "84905123456"],
    ["84905123456", "84905123456"],
    ["905123456", "84905123456"], // Excel lưu number → mất số 0 đầu
  ])("%s → %s", (input, expected) => {
    expect(canonicalPhone(input)).toBe(expected);
  });

  it.each([
    ["0905.123.456", "84905123456"],
    ["0905 123 456", "84905123456"],
    ["090-512-3456", "84905123456"],
    ["(090) 512 3456", "84905123456"],
  ])("bỏ ký tự trình bày: %s → %s", (input, expected) => {
    expect(canonicalPhone(input)).toBe(expected);
  });

  it('HỒI QUY: "+84 0905 123 456" — bản cũ cho ra "00905123456" SAI', () => {
    expect(canonicalPhone("+84 0905 123 456")).toBe("84905123456");
  });

  it.each([
    { v: "02363123456" as unknown, why: "số cố định Đà Nẵng — không phải di động" },
    { v: "0123456789" as unknown, why: "đầu số 1 không còn tồn tại" },
    { v: "0405123456" as unknown, why: "đầu số 4 không hợp lệ" },
    { v: "090512345" as unknown, why: "thiếu 1 chữ số" },
    { v: "09051234567" as unknown, why: "thừa 1 chữ số" },
    { v: "abc" as unknown, why: "không phải số" },
    { v: "" as unknown, why: "rỗng" },
    { v: null as unknown, why: "null" },
    { v: undefined as unknown, why: "undefined" },
  ])("từ chối $why", ({ v }) => {
    expect(canonicalPhone(v)).toBeNull();
  });

  it("mọi output hợp lệ đều khớp PHONE_VN_RE", () => {
    for (const raw of ["0905123456", "+84332221111", "0788889999", "0522223333", "0712345678"]) {
      const c = canonicalPhone(raw)!;
      expect(c).not.toBeNull();
      expect(PHONE_VN_RE.test(c)).toBe(true);
    }
  });

  it("idempotent — chuẩn hoá lần 2 không đổi", () => {
    const once = canonicalPhone("0905 123 456")!;
    expect(canonicalPhone(once)).toBe(once);
  });
});

describe("[AUTH-SDT-P1-C2] formatPhoneVN — hiển thị nội địa", () => {
  it("canonical → 0XXXXXXXXX", () => {
    expect(formatPhoneVN("84905123456")).toBe("0905123456");
    expect(formatPhoneVN("+84 905 123 456")).toBe("0905123456");
  });

  it("không chuẩn hoá được → giữ nguyên chuỗi gốc (không nuốt dữ liệu)", () => {
    expect(formatPhoneVN("02363123456")).toBe("02363123456");
  });
});

describe("[AUTH-SDT-P1-C3] phoneVariants — đọc chịu được giai đoạn chuyển tiếp", () => {
  it("trả cả dạng mới lẫn dạng cũ đang nằm trong DB", () => {
    expect(phoneVariants("0905123456")).toEqual(["84905123456", "0905123456"]);
    expect(phoneVariants("84905123456")).toEqual(["84905123456", "0905123456"]);
  });

  it("hai cách gõ khác nhau của CÙNG một số cho CÙNG tập tra cứu", () => {
    expect(phoneVariants("+84 905 123 456")).toEqual(phoneVariants("0905.123.456"));
  });

  it("số rác không chuẩn hoá được → vẫn tra đúng chuỗi gốc, không trả rỗng", () => {
    expect(phoneVariants("02363123456")).toEqual(["02363123456"]);
  });

  it("rỗng → mảng rỗng (caller phải tự bỏ qua, không tra `in: []`)", () => {
    expect(phoneVariants("")).toEqual([]);
    expect(phoneVariants(null)).toEqual([]);
  });
});

describe("[AUTH-SDT-P1-C4] isValidPhoneVN", () => {
  it("nhận mọi dạng đầu vào hợp lệ", () => {
    expect(isValidPhoneVN("0905123456")).toBe(true);
    expect(isValidPhoneVN("+84 905 123 456")).toBe(true);
    expect(isValidPhoneVN("02363123456")).toBe(false);
  });
});
