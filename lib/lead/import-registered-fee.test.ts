// Luật chủ dự án chốt 04/08 cho file "Danh sách đăng ký" của Sale:
//  · tuổi = lớp + 5 (lớp 1 = 6 tuổi)
//  · cột Học phí là SỐ ĐÃ ĐÓNG; không có ghi chú 50% ⇒ đã đóng đủ, công nợ 0
// Đây là chỗ đụng tiền của 102 hồ sơ thật nên khoá bằng test, không tin mắt.
import { describe, it, expect } from "vitest";
import {
  ageFromGrade,
  parseTuitionAmount,
  feeModeFromNote,
  paidAmountFromNote,
  PAID_NOTE_TAG,
} from "./import-registered";

describe("ageFromGrade — lớp văn hoá → tuổi", () => {
  it("lớp 1 = 6 tuổi, lớp 9 = 14 tuổi", () => {
    expect(ageFromGrade("Lớp 1")).toBe(6);
    expect(ageFromGrade("Lớp 4")).toBe(9);
    expect(ageFromGrade("Lớp 9")).toBe(14);
  });

  it("chịu được cách ghi khác nhau", () => {
    expect(ageFromGrade("lop 3")).toBe(8);
    expect(ageFromGrade("3")).toBe(8);
  });

  it("KHÔNG đoán bừa khi trống hoặc vô lý", () => {
    expect(ageFromGrade(null)).toBeNull();
    expect(ageFromGrade("")).toBeNull();
    expect(ageFromGrade("mẫu giáo")).toBeNull();
    expect(ageFromGrade("Lớp 13")).toBeNull();
  });
});

describe("parseTuitionAmount — đọc số tiền từ chuỗi Sale gõ tay", () => {
  it("đúng các dạng có thật trong file", () => {
    expect(parseTuitionAmount("4,640,000vnd")).toBe(4_640_000);
    expect(parseTuitionAmount("1,000,000 vnd")).toBe(1_000_000);
    expect(parseTuitionAmount("3.986.000")).toBe(3_986_000);
    expect(parseTuitionAmount("8640000")).toBe(8_640_000);
    expect(parseTuitionAmount("4.640.000đ")).toBe(4_640_000);
  });

  it("thà TRỐNG còn hơn ghi sai số tiền", () => {
    expect(parseTuitionAmount(null)).toBeNull();
    expect(parseTuitionAmount("")).toBeNull();
    expect(parseTuitionAmount("chưa đóng")).toBeNull();
    expect(parseTuitionAmount("4tr + 2tr")).toBeNull();
    expect(parseTuitionAmount("0")).toBeNull();
  });
});

describe("feeModeFromNote — 50% hay đóng đủ", () => {
  it("ghi chú nhắc 50% → HALF (còn nợ)", () => {
    expect(feeModeFromNote("Đóng 50% ngày 15/6")).toBe("HALF");
    expect(feeModeFromNote("Đợt 1 50% ngày 8/6")).toBe("HALF");
    expect(feeModeFromNote("50% Hphi, -300 phí giới thiệu")).toBe("HALF");
  });

  it("không nhắc 50% → FULL, KỂ CẢ khi có giảm giá % khác", () => {
    // Luật: giảm theo % vẫn tính là đã đóng đủ — số trong cột đã là số sau giảm.
    expect(feeModeFromNote("-40% học phí con quý đối tác")).toBe("FULL");
    expect(feeModeFromNote("đã trừ 10% theo chương trình anh em")).toBe("FULL");
    expect(feeModeFromNote(null)).toBe("FULL");
    expect(feeModeFromNote("cuối tháng full phí")).toBe("FULL");
  });
});

describe("paidAmountFromNote — đọc ngược để điền sẵn ô 'đã đóng'", () => {
  it("đọc đúng số đã ghi", () => {
    expect(paidAmountFromNote(`[Import ĐK Excel] Khoá ĐK: Sata 4 · ${PAID_NOTE_TAG}8640000`)).toBe(
      8_640_000,
    );
  });

  it("note không có nhãn → null (không điền bừa)", () => {
    expect(paidAmountFromNote("[Import ĐK Excel] Khoá ĐK: Sata 4")).toBeNull();
    expect(paidAmountFromNote(null)).toBeNull();
  });
});
