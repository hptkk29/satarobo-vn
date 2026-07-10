import { describe, it, expect } from "vitest";
import { maskPersonName, maskFreeText, maskLeadPiiFields, MASKED_TEXT } from "./pii";

describe("#11 T2 — mask PII lead", () => {
  it("maskPersonName: giữ họ + viết tắt phần còn lại", () => {
    expect(maskPersonName("Nguyễn Thị Lan")).toBe("Nguyễn T. L.");
    expect(maskPersonName("Lan")).toBe("L•••");
    expect(maskPersonName(null)).toBe("");
  });

  it("maskFreeText: ẩn hẳn nội dung tự do, giữ null/rỗng", () => {
    expect(maskFreeText("PH than phiền học phí")).toBe(MASKED_TEXT);
    expect(maskFreeText(null)).toBeNull();
    expect(maskFreeText("")).toBe("");
  });

  it("maskLeadPiiFields: canViewPii=true → nguyên vẹn; false → mask đủ 5 field", () => {
    const lead = {
      id: "l1",
      parentName: "Nguyễn Thị Lan",
      phone: "0909123456",
      email: "lan.nguyen@gmail.com",
      childName: "Bé Bin",
      note: "Đã tư vấn gói combo",
      status: "NEW",
    };
    expect(maskLeadPiiFields(lead, true)).toEqual(lead);

    const masked = maskLeadPiiFields(lead, false);
    expect(masked.parentName).toBe("Nguyễn T. L.");
    expect(masked.phone).toBe("090xxxx456");
    expect(masked.email).toBe("la********@gmail.com");
    expect(masked.childName).toBe("Bé B.");
    expect(masked.note).toBe(MASKED_TEXT);
    // Field không PII giữ nguyên.
    expect(masked.id).toBe("l1");
    expect(masked.status).toBe("NEW");
  });

  it("field vắng mặt/null không bị chế tác", () => {
    const masked = maskLeadPiiFields({ phone: "0909123456", email: null }, false);
    expect(masked.email).toBeNull();
    expect(masked.phone).toBe("090xxxx456");
  });
});
