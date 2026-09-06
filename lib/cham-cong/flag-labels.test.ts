import { describe, it, expect } from "vitest";
import { FLAG_LABEL, countsAsIssue, flagInfo } from "./flag-labels";

/** Đủ bộ mã mà `lib/cham-cong/engine.ts` + `timelog.ts` sinh ra (đo 06/09/2026). */
const ENGINE_FLAGS = [
  "KHONG_CO_LUOT",
  "THIEU_LUOT_RA",
  "RA_KHONG_CO_VAO",
  "THIEU_BUOI_SANG",
  "THIEU_BUOI_CHIEU",
  "DI_MUON",
  "VE_SOM",
  "THIEU_GIO",
  "DEN_SAT_GIO",
  "NGOAI_VUNG",
  "THIEU_GPS",
  "CHUA_TOA_DO",
  "SAI_NOI_LAM",
  "CHAM_NGOAI_LICH",
  "TRUNG_2_PHUT",
  "VUOT_TRAN",
  "LAM_NGAY_LE",
  "GPS_KEM_CHINH_XAC",
  "CHINH_TAY",
];

describe("FLAG_LABEL", () => {
  it("phủ đúng bộ mã engine sinh ra, không thừa không thiếu", () => {
    expect(Object.keys(FLAG_LABEL).sort()).toEqual([...ENGINE_FLAGS].sort());
  });

  it("mã nào cũng có nhãn tiếng Việt + tông hợp lệ", () => {
    for (const code of ENGINE_FLAGS) {
      const info = flagInfo(code);
      expect(info.text.length, code).toBeGreaterThan(0);
      expect(info.text, code).not.toBe(code);
      expect(["warn", "danger", "info"], code).toContain(info.tone);
    }
  });

  it("giữ nguyên phân loại nặng/nhẹ của bảng cũ", () => {
    expect(flagInfo("KHONG_CO_LUOT")).toEqual({ text: "Không có lượt", tone: "danger" });
    expect(flagInfo("NGOAI_VUNG").tone).toBe("danger");
    expect(flagInfo("SAI_NOI_LAM").tone).toBe("danger");
    expect(flagInfo("DI_MUON").tone).toBe("warn");
    expect(flagInfo("CHINH_TAY")).toEqual({ text: "Chỉnh tay (đơn duyệt)", tone: "info" });
  });
});

describe("flagInfo — mã lạ", () => {
  it("in nguyên mã với tông info", () => {
    expect(flagInfo("CO_MOI_TINH")).toEqual({ text: "CO_MOI_TINH", tone: "info" });
    expect(flagInfo("")).toEqual({ text: "", tone: "info" });
  });
});

describe("countsAsIssue", () => {
  it("chỉ warn/danger mới là việc cần rà", () => {
    expect(countsAsIssue("KHONG_CO_LUOT")).toBe(true);
    expect(countsAsIssue("THIEU_GIO")).toBe(true);
    expect(countsAsIssue("DEN_SAT_GIO")).toBe(false);
    expect(countsAsIssue("LAM_NGAY_LE")).toBe(false);
  });

  it("mã lạ VẪN tính là cần rà — cờ engine mới quên khai nhãn phải lộ ra, không im lặng", () => {
    expect(countsAsIssue("MA_MOI_CHUA_KHAI")).toBe(true);
    // nhưng nhãn vẫn là tông info để không nhuộm đỏ cả bảng
    expect(flagInfo("MA_MOI_CHUA_KHAI")).toEqual({ text: "MA_MOI_CHUA_KHAI", tone: "info" });
  });

  it("đếm được số dòng cần rà của một ngày", () => {
    const rows = [["DI_MUON", "THIEU_GPS"], ["DEN_SAT_GIO"], [], ["KHONG_CO_LUOT"]];
    expect(rows.filter((f) => f.some(countsAsIssue)).length).toBe(2);
  });
});
