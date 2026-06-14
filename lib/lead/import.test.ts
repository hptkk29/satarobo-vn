import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  isValidPhone,
  parseChildAge,
  normalizeCenterCode,
  parseLeadImportRow,
  LEAD_IMPORT_COLUMNS,
  LEAD_IMPORT_CENTER_HEADER,
} from "./import";

describe("lead import helpers", () => {
  it("normalizePhone chuẩn hoá +84/khoảng trắng", () => {
    expect(normalizePhone("+84 901 234 567")).toBe("0901234567");
    expect(normalizePhone("0901.234.567")).toBe("0901234567");
    expect(normalizePhone("84901234567")).toBe("0901234567");
  });

  it("isValidPhone", () => {
    expect(isValidPhone("0901234567")).toBe(true);
    expect(isValidPhone("0123456789")).toBe(false); // đầu số 1 không hợp lệ
    expect(isValidPhone("12345")).toBe(false);
  });

  it("parseChildAge", () => {
    expect(parseChildAge("")).toEqual({ age: null });
    expect(parseChildAge("8")).toEqual({ age: 8 });
    expect("error" in parseChildAge("2")).toBe(true);
    expect("error" in parseChildAge("25")).toBe(true);
  });

  it("normalizeCenterCode — chỉ chuẩn hoá format, KHÔNG hardcode CS hợp lệ", () => {
    expect(normalizeCenterCode("")).toEqual({ code: null });
    expect(normalizeCenterCode("cs1")).toEqual({ code: "CS1" });
    expect(normalizeCenterCode(" CS2 ")).toEqual({ code: "CS2" });
    // CS3/CS4… mở thêm = data, helper phải chấp nhận (validity do DB resolve).
    expect(normalizeCenterCode("CS3")).toEqual({ code: "CS3" });
    // Format rõ ràng sai → lỗi sớm.
    expect("error" in normalizeCenterCode("@@")).toBe(true);
  });

  it("parseLeadImportRow hợp lệ", () => {
    const r = parseLeadImportRow({
      "Tên phụ huynh": "Nguyễn Văn A",
      "SĐT": "+84901234567",
      Email: "a@example.com",
      "Tên con": "Bé Bo",
      "Tuổi con": "8",
      [LEAD_IMPORT_CENTER_HEADER]: "CS1",
      "Khoá quan tâm": "Lập trình Robot",
      "Nguồn": "Sự kiện",
      "Ghi chú": "Quan tâm khoá hè",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.phone).toBe("0901234567");
      expect(r.data.centerCode).toBe("CS1");
      expect(r.data.childAge).toBe(8);
      expect(r.data.source).toBe("Sự kiện");
    }
  });

  it("parseLeadImportRow thiếu SĐT / sai SĐT", () => {
    expect(parseLeadImportRow({ "Tên phụ huynh": "A", "SĐT": "" }).ok).toBe(false);
    expect(parseLeadImportRow({ "Tên phụ huynh": "A", "SĐT": "abc" }).ok).toBe(false);
  });

  it("cột chuẩn đúng thứ tự", () => {
    expect(LEAD_IMPORT_COLUMNS[0]).toBe("Tên phụ huynh");
    expect(LEAD_IMPORT_COLUMNS[1]).toBe("SĐT");
    expect(LEAD_IMPORT_COLUMNS.length).toBe(9);
  });
});
