// Kanban lead — số thẻ mỗi cột (28/08/2026, chủ dự án chốt).
//
// Vì sao có test cho một con số: `docSoTheMoiCot` dùng CHUNG tham số `?size=` với bảng
// nhưng MẶC ĐỊNH khác (10 vs 20). Ai đó "dọn trùng lặp" bằng cách gọi thẳng `docSoDong`
// sẽ làm Kanban lặng lẽ nhảy lên 20 thẻ/cột — không đỏ ở đâu cả, chỉ là trang dài gấp đôi.
import { describe, it, expect } from "vitest";
import {
  docSoDong,
  docSoTheMoiCot,
  MUC_SO_DONG,
  SO_DONG_MAC_DINH,
  SO_THE_MOI_COT_MAC_DINH,
} from "./phan-trang";

describe("số thẻ mỗi cột Kanban", () => {
  it("mặc định 10 — KHÁC mặc định 20 của bảng", () => {
    expect(SO_THE_MOI_COT_MAC_DINH).toBe(10);
    expect(docSoTheMoiCot(undefined)).toBe(10);
    expect(docSoDong(undefined)).toBe(SO_DONG_MAC_DINH);
    expect(SO_THE_MOI_COT_MAC_DINH).not.toBe(SO_DONG_MAC_DINH);
  });

  it("nhận đúng 4 mức dùng chung với bảng", () => {
    for (const n of MUC_SO_DONG) expect(docSoTheMoiCot(String(n))).toBe(n);
  });

  it("giá trị lạ / gõ tay trên URL → về mặc định, không thành take khổng lồ", () => {
    for (const xau of ["99999", "0", "-5", "abc", "", undefined]) {
      expect(docSoTheMoiCot(xau)).toBe(SO_THE_MOI_COT_MAC_DINH);
    }
  });

  it("mảng (?size=10&size=50) lấy phần tử đầu — khớp hành vi của bảng", () => {
    expect(docSoTheMoiCot(["50", "10"])).toBe(50);
  });
});
