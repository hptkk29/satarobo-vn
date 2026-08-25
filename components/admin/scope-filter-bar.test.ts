import { describe, it, expect } from "vitest";
import { ALL_CENTERS, serializeCenterParam, toggleCenter } from "./scope-filter-bar";

// A-02 tầng UI — phần logic THUẦN của bar (không DB, không render).
//
// Phân vai: việc GIẢI bộ lọc từ URL là của `resolveScopeFilters()` và đã có
// `lib/reports/filters.test.ts` phủ. Ở đây chỉ kiểm chiều NGƯỢC LẠI — cái mà bar ghi
// ra URL và cách checkbox đổi trạng thái — vì đó là thứ quyết định URL nào được sinh.
//
// Bất biến bám theo: L-A10 (cùng TẬP phải cho cùng URL ⇒ cùng khoá cache, khác thứ tự
// không được nhân đôi entry) và L-A12 (một cơ sở thì không có gì để tách).

const CS = ["cs1", "cs2", "cs3"] as const;

describe("serializeCenterParam — giá trị ghi vào ?center=", () => {
  it("null ⇒ ALL (toàn bộ phạm vi cho phép của actor)", () => {
    expect(serializeCenterParam(null, CS)).toBe(ALL_CENTERS);
  });

  it("rỗng ⇒ ALL, KHÔNG phải chuỗi rỗng (chuỗi rỗng = màn hình trắng)", () => {
    expect(serializeCenterParam([], CS)).toBe(ALL_CENTERS);
  });

  it("ghép bằng dấu phẩy đúng quy ước A-02-5", () => {
    expect(serializeCenterParam(["cs1", "cs2"], CS)).toBe("cs1,cs2");
  });

  it("L-A10: cùng TẬP khác THỨ TỰ ⇒ cùng một URL (chống nhân đôi entry cache)", () => {
    expect(serializeCenterParam(["cs2", "cs1"], CS)).toBe(serializeCenterParam(["cs1", "cs2"], CS));
    expect(serializeCenterParam(["cs2", "cs1"], CS)).toBe("cs1,cs2");
  });

  it("tick đủ mọi cơ sở ⇒ ALL (cùng nghĩa thì cùng một khoá cache)", () => {
    expect(serializeCenterParam(["cs1", "cs2", "cs3"], CS)).toBe(ALL_CENTERS);
  });

  it("khử trùng lặp", () => {
    expect(serializeCenterParam(["cs1", "cs1", "cs2"], CS)).toBe("cs1,cs2");
  });

  it("id ngoài phạm vi KHÔNG bao giờ được ghi ra URL", () => {
    expect(serializeCenterParam(["cs1", "cs-cua-nguoi-khac"], CS)).toBe("cs1");
  });

  it("toàn id ngoài phạm vi ⇒ ALL, không sinh ?center= rác", () => {
    expect(serializeCenterParam(["cs-la-1", "cs-la-2"], CS)).toBe(ALL_CENTERS);
  });

  it("phạm vi 1 cơ sở: tick chính nó ⇒ ALL (đủ tập = tất cả)", () => {
    expect(serializeCenterParam(["cs1"], ["cs1"])).toBe(ALL_CENTERS);
  });
});

describe("toggleCenter — hành vi checkbox trong dropdown", () => {
  it("đang 'tất cả', bỏ tick một cơ sở ⇒ tất cả TRỪ cơ sở đó", () => {
    // KHÔNG được nhảy về "chỉ cơ sở vừa bấm" — trái cảm giác checkbox.
    expect(toggleCenter(null, "cs2", CS)).toEqual(["cs1", "cs3"]);
  });

  it("tick thêm cho đủ mọi cơ sở ⇒ null (= tất cả)", () => {
    expect(toggleCenter(["cs1", "cs2"], "cs3", CS)).toBeNull();
  });

  it("bỏ tick cơ sở CUỐI CÙNG ⇒ null, không rơi vào trạng thái chết 'không cơ sở nào'", () => {
    expect(toggleCenter(["cs2"], "cs2", CS)).toBeNull();
  });

  it("tick thêm một cơ sở vào lựa chọn đang có", () => {
    expect(toggleCenter(["cs1"], "cs3", CS)).toEqual(["cs1", "cs3"]);
  });

  it("kết quả luôn đã sắp xếp — ổn định cho URL và khoá cache (L-A10)", () => {
    expect(toggleCenter(["cs3"], "cs1", CS)).toEqual(["cs1", "cs3"]);
  });

  it("L-A12: phạm vi 1 cơ sở thì luôn là 'tất cả' ⇒ không bao giờ có ≥2 để tách", () => {
    expect(toggleCenter(null, "cs1", ["cs1"])).toBeNull();
  });

  it("khứ hồi toggle → serialize → nghĩa không đổi", () => {
    const afterToggle = toggleCenter(null, "cs2", CS); // bỏ cs2
    expect(serializeCenterParam(afterToggle, CS)).toBe("cs1,cs3");
  });
});
