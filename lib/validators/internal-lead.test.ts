// Schema biểu mẫu `/nhap-khach-hang` — chốt 22/08/2026: KHÔNG ô nào bắt buộc.
//
// Test này là chỗ khoá điều khoản đó. Ai đó thêm `.min(1)` vào một ô nào đây thì
// phải làm đỏ ở đây trước, không được lặng lẽ dựng lại rào cũ.
import { describe, it, expect } from "vitest";
import { hasAnyContent, internalLeadSchema } from "./internal-lead";

function parse(input: unknown) {
  const r = internalLeadSchema.safeParse(input);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? "parse fail");
  return r.data;
}

describe("internalLeadSchema — không ô nào bắt buộc", () => {
  it("phiếu rỗng hoàn toàn vẫn PARSE ĐƯỢC (mọi ô → null)", () => {
    const d = parse({});
    expect(d).toEqual({
      parentName: null,
      phone: null,
      childName: null,
      source: null,
      facebookUrl: null,
      centerCode: null,
      note: null,
    });
  });

  it("chuỗi rỗng / khoảng trắng → null, không ghi chuỗi rỗng xuống DB", () => {
    const d = parse({ parentName: "   ", note: "" });
    expect(d.parentName).toBeNull();
    expect(d.note).toBeNull();
  });

  it("SĐT bỏ trống là hợp lệ; có gõ thì phải đúng và được chuẩn hoá 84…", () => {
    expect(parse({ phone: "" }).phone).toBeNull();
    expect(parse({ phone: "0905 123 456" }).phone).toBe("84905123456");
  });

  it("SĐT gõ sai vẫn bị bắt (không bắt buộc ≠ nhận bừa)", () => {
    expect(internalLeadSchema.safeParse({ phone: "123" }).success).toBe(false);
  });

  it("trần độ dài vẫn còn — endpoint nào cũng phải có trần", () => {
    expect(
      internalLeadSchema.safeParse({ parentName: "a".repeat(121) }).success,
    ).toBe(false);
    expect(internalLeadSchema.safeParse({ note: "a".repeat(2001) }).success).toBe(
      false,
    );
  });
});

describe("hasAnyContent — chặn đúng phiếu TRẮNG, không hơn", () => {
  it("phiếu trắng → false", () => {
    expect(hasAnyContent(parse({}))).toBe(false);
  });

  it("chỉ có ghi chú → true (không ô nào riêng lẻ bị đòi hỏi)", () => {
    expect(hasAnyContent(parse({ note: "khách gọi lại chiều mai" }))).toBe(true);
  });

  it("chỉ có link Facebook → true (ca lead quảng cáo FB chưa xin được số)", () => {
    expect(hasAnyContent(parse({ facebookUrl: "facebook.com/abc" }))).toBe(true);
  });

  it("chỉ có SĐT → true", () => {
    expect(hasAnyContent(parse({ phone: "0905123456" }))).toBe(true);
  });
});
