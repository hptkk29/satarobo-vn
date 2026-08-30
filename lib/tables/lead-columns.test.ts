/**
 * DANH MỤC CỘT bảng Lead — mỗi khoá phải có một `case` trong `LeadCell`.
 *
 * Vì sao khoá bằng test: thêm cột vào danh mục mà quên `case` thì cột hiện trong hộp
 * chọn, người dùng bật lên, và ô luôn trống — trông y hệt "dữ liệu bị mất". Không lỗi
 * nào nổ, không ai biết cho tới khi có người hỏi vì sao khách nào cũng không có email.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { LEAD_COLUMNS, cotMacDinh, chuanHoaCot } from "./lead-columns";

const NGUON = path.join(
  process.cwd(),
  "app",
  "(admin)",
  "admin",
  "leads",
  "_components",
  "leads-table.tsx",
);

describe("danh mục cột bảng Lead", () => {
  it("mỗi khoá cột có một `case` trong LeadCell", () => {
    const src = fs.readFileSync(NGUON, "utf8");
    const thieu = LEAD_COLUMNS.filter((c) => !src.includes(`case '${c.key}':`)).map((c) => c.key);
    expect(thieu, `thiếu case trong LeadCell cho: ${thieu.join(", ")}`).toEqual([]);
  });

  it("khoá không trùng nhau", () => {
    expect(new Set(LEAD_COLUMNS.map((c) => c.key)).size).toBe(LEAD_COLUMNS.length);
  });

  it("bộ mặc định KHÔNG chứa 'Lần nhập gần nhất' (chốt 30/08)", () => {
    // Cột này chỉ có nghĩa với phiếu khách quay lại; bật mặc định thì đa số dòng in ra
    // đúng bằng "Ngày nhận lead" — tốn một cột ngang mà không nói thêm gì.
    expect(cotMacDinh()).not.toContain("lastInboundAt");
    expect(LEAD_COLUMNS.some((c) => c.key === "lastInboundAt")).toBe(true);
  });

  it("cột bắt buộc luôn được kèm, kể cả khi người dùng bỏ nó đi", () => {
    const batBuoc = LEAD_COLUMNS.filter((c) => c.batBuoc).map((c) => c.key);
    expect(batBuoc.length).toBeGreaterThan(0);
    for (const k of batBuoc) expect(chuanHoaCot(["phone"])).toContain(k);
  });

  it("giá trị hỏng / khoá lạ → rơi về bộ mặc định, KHÔNG ra bảng trắng", () => {
    expect(chuanHoaCot(null)).toEqual(cotMacDinh());
    expect(chuanHoaCot("linh tinh")).toEqual(cotMacDinh());
    expect(chuanHoaCot(["cot_khong_ton_tai"])).toEqual(cotMacDinh());
  });

  it("giữ ĐÚNG thứ tự của danh mục, không phải thứ tự người dùng bấm", () => {
    // Người dùng bấm ngược thứ tự thì bảng vẫn phải xếp cột như danh mục — nếu không,
    // hai người mô tả "cột thứ ba" cho nhau sẽ nói về hai cột khác nhau.
    const nguoc = [...LEAD_COLUMNS].map((c) => c.key).reverse();
    expect(chuanHoaCot(nguoc)).toEqual(LEAD_COLUMNS.map((c) => c.key));
  });
});
