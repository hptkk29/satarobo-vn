// Payload MISA của biểu mẫu `/nhap-khach-hang` — webform "Form Nhập KH v2"
// (22/08/2026).
//
// Khoá 3 thứ dễ hỏng âm thầm:
//   1. Ánh xạ tên trường (`LastName` là TÊN CON; SĐT là `Mobile` chứ KHÔNG phải
//      `CustomField15` như form cũ — gửi nhầm thì MISA nhận phiếu không có số và
//      không báo lỗi gì).
//   2. Ô "Nguồn" gõ tự do ↔ danh sách 12 giá trị `LeadSourceID`: khớp thì vào ô
//      nguồn, không khớp thì xuống `Description` — KHÔNG được mất chữ.
//   3. Phiếu thiếu tên vẫn phải có `LastName` (ô duy nhất MISA bắt buộc).
import { describe, it, expect } from "vitest";
import {
  buildMisaInternalFields,
  misaCenterIndex,
  misaLeadSourceId,
  misaPhone,
  MISA_LEAD_SOURCE,
} from "./misa-internal";

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

describe("misaLeadSourceId — ô Nguồn gõ tự do ↔ 12 giá trị của MISA", () => {
  it("danh sách khớp đúng mã nhúng: 12 giá trị, KHÔNG có số 5", () => {
    expect(MISA_LEAD_SOURCE).toHaveLength(12);
    const ids = MISA_LEAD_SOURCE.map((s) => s.id);
    expect(ids).not.toContain("5");
    expect(new Set(ids).size).toBe(12);
  });

  it("mọi nhãn trong danh sách đều tự khớp về đúng id của nó", () => {
    for (const s of MISA_LEAD_SOURCE) expect(misaLeadSourceId(s.label)).toBe(s.id);
  });

  it("bỏ dấu / khác hoa-thường / thừa khoảng trắng vẫn khớp", () => {
    expect(misaLeadSourceId("  nguon tu su kien ")).toBe("6");
    expect(misaLeadSourceId("NGUỒN TỪ PHỤ HUYNH GIỚI THIỆU")).toBe("4");
  });

  it("chữ tự do → null (không đoán bừa sang 'Nguồn khác')", () => {
    expect(misaLeadSourceId("chị Hoa lớp 3 giới thiệu")).toBeNull();
    expect(misaLeadSourceId("")).toBeNull();
    expect(misaLeadSourceId(null)).toBeNull();
  });
});

describe("buildMisaInternalFields — ánh xạ trường", () => {
  it("map đúng bộ trường form v2 (LastName = TÊN CON, Mobile = SĐT)", () => {
    expect(buildMisaInternalFields(BASE)).toMatchObject({
      LastName: "Bé Minh",
      CustomField25: "Chị Hương",
      // 🔴 form v2 dùng trường chuẩn `Mobile`, KHÔNG phải `CustomField15`.
      Mobile: "0905123456",
      CustomField17: "1",
      CustomField26: "CS1.TVV.007",
    });
  });

  it("🔴 KHÔNG còn gửi tên trường SĐT của form cũ", () => {
    expect(buildMisaInternalFields(BASE)).not.toHaveProperty("CustomField15");
  });

  it("🔴 LastName là ô MISA BẮT BUỘC → thiếu tên con thì lấy tên PH", () => {
    expect(buildMisaInternalFields({ ...BASE, childName: null }).LastName).toBe(
      "Chị Hương",
    );
  });

  it("không có tên nào → vẫn phải có LastName, không để MISA từ chối cả phiếu", () => {
    const f = buildMisaInternalFields({ ...BASE, childName: null, parentName: "" });
    expect(f.LastName).toBe("Khách chưa rõ tên");
  });

  it("cơ sở không nhận ra → bỏ hẳn ô, không gửi giá trị rác", () => {
    expect(
      buildMisaInternalFields({ ...BASE, centerCode: "hoi-so" }),
    ).not.toHaveProperty("CustomField17");
  });
});

describe("buildMisaInternalFields — nguồn & link Facebook", () => {
  it("link Facebook vào ô riêng CustomField22", () => {
    const f = buildMisaInternalFields({
      ...BASE,
      facebookUrl: "https://facebook.com/chi.huong",
    });
    expect(f.CustomField22).toBe("https://facebook.com/chi.huong");
  });

  it("nguồn khớp nhãn MISA → vào ô LeadSourceID, KHÔNG lặp trong Description", () => {
    const f = buildMisaInternalFields({
      ...BASE,
      source: "Nguồn từ phụ huynh giới thiệu",
      note: "Khách hỏi lớp thứ Bảy",
    });
    expect(f.LeadSourceID).toBe("4");
    expect(f.Description).toBe("Khách hỏi lớp thứ Bảy");
  });

  it("nguồn gõ tự do → Description giữ nguyên văn, LeadSourceID để trống", () => {
    const f = buildMisaInternalFields({ ...BASE, source: "chị Hoa giới thiệu" });
    expect(f).not.toHaveProperty("LeadSourceID");
    expect(f.Description).toContain("Nguồn: chị Hoa giới thiệu");
  });

  it("env ghi đè được tên trường khi MISA đổi cấu hình form", () => {
    const f = buildMisaInternalFields(
      { ...BASE, source: "Nguồn khác", facebookUrl: "https://fb.com/x" },
      { leadSource: "CustomField99", facebookUrl: "CustomField98" },
    );
    expect(f.CustomField99).toBe("9");
    expect(f.CustomField98).toBe("https://fb.com/x");
    expect(f).not.toHaveProperty("LeadSourceID");
    expect(f).not.toHaveProperty("CustomField22");
  });

  it("phiếu chưa có SĐT → nói rõ trong Description (bên MISA không có ô trống)", () => {
    const f = buildMisaInternalFields({ ...BASE, phone: "" });
    expect(f).not.toHaveProperty("Mobile");
    expect(f.Description).toContain("chưa có số điện thoại");
  });

  it("phiếu không có gì để mô tả → bỏ hẳn ô Description", () => {
    expect(buildMisaInternalFields(BASE)).not.toHaveProperty("Description");
  });
});
