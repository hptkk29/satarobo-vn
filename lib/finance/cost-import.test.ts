import { describe, expect, it } from "vitest";
import {
  buildCostDedupeKey,
  parseVndAmount,
  validateCostImport,
  type CostImportContext,
  type CostImportRow,
} from "./cost-import";

const ctx: CostImportContext = {
  categories: new Map([
    ["RENT", { id: "cat-rent", isSystemFed: false }],
    ["ADS", { id: "cat-ads", isSystemFed: true }],
  ]),
  centers: new Map([["CS1", "center-1"]]),
  allowCompanyLevel: true,
};

const row = (over: Partial<CostImportRow> & { rowNumber: number }): CostImportRow => ({
  spentDate: "2026-08-10",
  categoryCode: "RENT",
  centerCode: "CS1",
  amount: "1.200.000",
  vendor: "Chủ nhà A",
  note: "",
  ...over,
});

describe("B-05 — validate import chi phí", () => {
  it("[B5-01] BÁO ĐỦ dòng lỗi, không dừng ở dòng đầu", () => {
    // Kế toán import 200 dòng mà mỗi lượt chỉ biết một lỗi thì phải chạy 200 lượt — và
    // sẽ bỏ cuộc, quay về nhập tay. Đây là yêu cầu vận hành, không phải chi tiết đẹp.
    const res = validateCostImport(
      [
        row({ rowNumber: 2, spentDate: "10/08/2026" }),
        row({ rowNumber: 3, categoryCode: "KHONG_CO" }),
        row({ rowNumber: 4, amount: "abc" }),
      ],
      ctx,
    );
    expect(res.errors.map((e) => e.rowNumber)).toEqual([2, 3, 4]);
    expect(res.parsed).toHaveLength(0);
  });

  it("[B5-02] TỪ CHỐI đầu phí do hệ thống nạp (ADS) — chốt chặn chống trừ hai lần", () => {
    const res = validateCostImport([row({ rowNumber: 2, categoryCode: "ADS" })], ctx);
    expect(res.parsed).toHaveLength(0);
    expect(res.errors[0]?.message).toContain("trừ hai lần");
  });

  it("[B5-03] bỏ trống cơ sở = chi phí cấp công ty, và cần quyền", () => {
    const ok = validateCostImport([row({ rowNumber: 2, centerCode: "" })], ctx);
    expect(ok.parsed[0]?.centerId).toBeNull();

    const denied = validateCostImport([row({ rowNumber: 2, centerCode: "" })], {
      ...ctx,
      allowCompanyLevel: false,
    });
    expect(denied.parsed).toHaveLength(0);
    expect(denied.errors).toHaveLength(1);
  });

  it("[B5-04] cơ sở ngoài phạm vi bị từ chối, không im lặng bỏ qua", () => {
    const res = validateCostImport([row({ rowNumber: 2, centerCode: "CS9" })], ctx);
    expect(res.errors[0]?.message).toContain("ngoài phạm vi");
  });

  it("[B5-05] trùng NGAY TRONG FILE đếm riêng, không tính là lỗi", () => {
    // Người dùng cần phân biệt "file của tôi lặp dòng" với "hệ thống từ chối dữ liệu".
    const res = validateCostImport([row({ rowNumber: 2 }), row({ rowNumber: 3 })], ctx);
    expect(res.parsed).toHaveLength(1);
    expect(res.duplicatesInFile).toBe(1);
    expect(res.errors).toHaveLength(0);
  });

  it("[B5-06] số tiền đọc được kiểu người Việt gõ", () => {
    expect(parseVndAmount("1.200.000")).toBe(1_200_000);
    expect(parseVndAmount("1 200 000")).toBe(1_200_000);
    expect(parseVndAmount("1200000₫")).toBe(1_200_000);
    expect(parseVndAmount("-5000")).toBeNull();
    expect(parseVndAmount("0")).toBeNull();
  });

  it("[B5-06b] TỪ CHỐI dấu phẩy — ở VN đó là dấu thập phân, không phải phân cách nghìn", () => {
    // Nếu coi dấu phẩy như dấu chấm thì "1,5" thành 15: một con số SAI, im lặng, và
    // trông hợp lệ hoàn toàn. Người gõ "1,5" đang nghĩ "1,5 triệu" — bắt họ ghi rõ.
    expect(parseVndAmount("1,5")).toBeNull();
    expect(parseVndAmount("1,200,000")).toBeNull();
  });

  it("[B5-07] khoá chống trùng BỎ QUA ghi chú, GIỮ nhà cung cấp", () => {
    const base = {
      spentDate: "2026-08-10",
      categoryId: "cat-rent",
      centerId: "center-1",
      amount: 1_000_000,
    };
    // Sửa ghi chú rồi import lại vẫn là CÙNG một khoản chi.
    expect(buildCostDedupeKey({ ...base, vendor: "A" })).toBe(
      buildCostDedupeKey({ ...base, vendor: "a" }),
    );
    // Khác nhà cung cấp là hai khoản thật, dù cùng ngày cùng số tiền.
    expect(buildCostDedupeKey({ ...base, vendor: "A" })).not.toBe(
      buildCostDedupeKey({ ...base, vendor: "B" }),
    );
    // Cấp công ty khác cấp cơ sở.
    expect(buildCostDedupeKey({ ...base, vendor: null })).not.toBe(
      buildCostDedupeKey({ ...base, centerId: null, vendor: null }),
    );
  });
});
