// Payload MISA của biểu mẫu `/nhap-khach-hang` (22/08/2026).
//
// Khoá 2 thứ dễ hỏng âm thầm:
//   1. Ánh xạ tên trường của MISA (`LastName` là TÊN CON, không phải họ PH).
//   2. Không mất dữ liệu khi MISA chưa có ô cho "Nguồn" / "Link Facebook" —
//      hai giá trị đó phải rơi xuống `Description`, không được bốc hơi.
import { describe, it, expect } from "vitest";
import { buildMisaInternalFields, misaCenterIndex, misaPhone } from "./misa-internal";

const BASE = {
  parentName: "Chị Hương",
  phone: "84905123456",
  childName: "Bé Minh",
  source: null,
  facebookUrl: null,
  centerCode: "CS1",
  note: null,
  employeeCode: "CS1.TVV.007",
};

describe("misaCenterIndex — Center.code của ta → số thứ tự của MISA", () => {
  it("CS1/CS2 → 1/2, không phân biệt hoa thường", () => {
    expect(misaCenterIndex("CS1")).toBe("1");
    expect(misaCenterIndex("cs2")).toBe("2");
  });

  it("mã lạ / rỗng → null (bỏ ô, KHÔNG đoán bừa)", () => {
    for (const v of ["HO", "hoi-so", "", null, undefined]) {
      expect(misaCenterIndex(v)).toBeNull();
    }
  });
});

describe("misaPhone — canonical nội bộ → dạng MISA đang có", () => {
  it("84XXXXXXXXX → 0XXXXXXXXX", () => {
    expect(misaPhone("84905123456")).toBe("0905123456");
  });

  it("chuỗi không phải canonical → giữ nguyên, không bịa", () => {
    for (const v of ["", "0905123456", "84123"]) expect(misaPhone(v)).toBe(v);
  });
});

describe("buildMisaInternalFields — ánh xạ trường", () => {
  it("map đúng bộ trường MISA (LastName = TÊN CON, CustomField25 = tên PH)", () => {
    expect(buildMisaInternalFields(BASE)).toMatchObject({
      LastName: "Bé Minh",
      CustomField25: "Chị Hương",
      // MISA nhận dạng "0…" như mọi bản ghi cũ của chính nó, KHÔNG phải "84…".
      CustomField15: "0905123456",
      CustomField17: "1",
      CustomField26: "CS1.TVV.007",
    });
  });

  it("🔴 LastName là ô MISA BẮT BUỘC → thiếu tên con thì lấy tên PH", () => {
    expect(buildMisaInternalFields({ ...BASE, childName: null }).LastName).toBe(
      "Chị Hương",
    );
  });

  it("không có tên nào → vẫn phải có LastName, không để MISA từ chối cả phiếu", () => {
    const f = buildMisaInternalFields({
      ...BASE,
      childName: null,
      parentName: "",
    });
    expect(f.LastName).toBe("Khách chưa rõ tên");
  });

  it("cơ sở không nhận ra → bỏ hẳn ô, không gửi giá trị rác", () => {
    expect(
      buildMisaInternalFields({ ...BASE, centerCode: "hoi-so" }),
    ).not.toHaveProperty("CustomField17");
  });
});

describe("buildMisaInternalFields — 2 ô MISA chưa có", () => {
  it("chưa khai mã trường → nguồn + link FB ghép vào Description, KHÔNG mất", () => {
    const f = buildMisaInternalFields({
      ...BASE,
      note: "Khách hỏi lớp thứ Bảy",
      source: "Facebook Ads",
      facebookUrl: "https://facebook.com/chi.huong",
    });
    expect(f.Description).toContain("Khách hỏi lớp thứ Bảy");
    expect(f.Description).toContain("Nguồn: Facebook Ads");
    expect(f.Description).toContain("Link Facebook: https://facebook.com/chi.huong");
  });

  it("đã khai mã trường → vào ô riêng, KHÔNG lặp lại trong Description", () => {
    const f = buildMisaInternalFields(
      {
        ...BASE,
        source: "Facebook Ads",
        facebookUrl: "https://facebook.com/chi.huong",
      },
      { leadSource: "LeadSourceID", facebookUrl: "CustomField27" },
    );
    expect(f.LeadSourceID).toBe("Facebook Ads");
    expect(f.CustomField27).toBe("https://facebook.com/chi.huong");
    expect(f.Description ?? "").not.toContain("Nguồn:");
    expect(f.Description ?? "").not.toContain("Link Facebook:");
  });

  it("phiếu chưa có SĐT → nói rõ trong Description (bên MISA không có ô trống)", () => {
    const f = buildMisaInternalFields({ ...BASE, phone: "" });
    expect(f).not.toHaveProperty("CustomField15");
    expect(f.Description).toContain("chưa có số điện thoại");
  });

  it("phiếu không có gì để mô tả → bỏ hẳn ô Description", () => {
    expect(buildMisaInternalFields(BASE)).not.toHaveProperty("Description");
  });
});
