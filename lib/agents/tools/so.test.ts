// @vitest-environment node
// Sổ công cụ — khuôn đầu ra của từng công cụ PHẢI khớp hợp đồng của xưởng skill.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { dinhNghiaCongCu } from "./kieu";
import { kiemSo, tatCaCongCu, timCongCu } from "./so";

const THU_MUC_KHUON = resolve(process.cwd(), "tests/agents/khuon-xuong");

function mauCua(ten: string): { du_lieu: unknown } {
  return JSON.parse(readFileSync(resolve(THU_MUC_KHUON, "mau", `${ten}.json`), "utf8"));
}

describe("[AG-SO-01] khuôn đầu ra khớp bản mẫu của xưởng", () => {
  for (const c of tatCaCongCu()) {
    it(`${c.ten}: zod đầu ra nhận du_lieu của mau/${c.ten}.json`, () => {
      expect(c.dungKhuon(mauCua(c.ten).du_lieu)).toBe(true);
    });
    it(`${c.ten}: zod đầu ra TỪ CHỐI bản thiếu một trường bắt buộc (đối chứng — lưới không nhận bừa)`, () => {
      const mau = mauCua(c.ten).du_lieu;
      const hong = Array.isArray(mau)
        ? mau.map((x) => {
            const { [Object.keys(x as object)[0]!]: _bo, ...conLai } = x as Record<string, unknown>;
            return conLai;
          })
        : {};
      expect(c.dungKhuon(hong)).toBe(false);
    });
  }

  it("máy kiểm của xưởng tự kiểm bộ mẫu ĐẠT (bộ khuôn chép vào repo không hỏng)", () => {
    const out = execFileSync(process.execPath, [resolve(THU_MUC_KHUON, "cong-cu/kiem-khuon.mjs"), "--mau"], {
      encoding: "utf8",
    });
    expect(out).toContain("ĐẠT: 14/14");
  });
});

describe("[AG-SO-02] luật của sổ", () => {
  it("tên MCP của mọi công cụ hợp lệ với Claude API", () => {
    for (const c of tatCaCongCu()) expect(c.tenMcp).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
  });
  it("công cụ có trong sổ tìm được theo tên; tên lạ → null", () => {
    expect(timCongCu("danh_muc.lay_co_so")?.ten).toBe("danh_muc.lay_co_so");
    expect(timCongCu("khong.ton_tai")).toBeNull();
  });
  it("công cụ nhạy cảm CAO thiếu hàm che dữ liệu → KHÔNG đăng ký được (bước 11)", () => {
    expect(() =>
      dinhNghiaCongCu({
        ten: "thu.cao_khong_che",
        moTa: "x",
        cheDo: "doc",
        nhayCam: "cao",
        quyenCan: ["leads:view-all"],
        thamSo: z.object({}).strict(),
        ketQua: z.array(z.object({})),
        dangDuLieu: "array",
        phienBanKhuon: "1.0",
        thucThi: async () => ({ duLieu: [], tiepTheo: null }),
      }),
    ).toThrow(/thiếu hàm che/);
  });
  it("sổ từ chối công cụ GHI ở Đợt 0, công cụ không khai quyền, và tên trùng", () => {
    const tao = (p: { ten?: string; cheDo?: "doc" | "ghi_nhap"; quyenCan?: string[] }) =>
      dinhNghiaCongCu({
        ten: p.ten ?? "thu.mot",
        moTa: "x",
        cheDo: p.cheDo ?? "doc",
        nhayCam: "thap",
        quyenCan: p.quyenCan ?? ["centers:view"],
        thamSo: z.object({}).strict(),
        ketQua: z.array(z.object({})),
        dangDuLieu: "array",
        phienBanKhuon: "1.0",
        thucThi: async () => ({ duLieu: [], tiepTheo: null }),
      });
    expect(() => kiemSo([tao({ cheDo: "ghi_nhap" })])).toThrow(/ghi/);
    expect(() => kiemSo([tao({ quyenCan: [] })])).toThrow(/quyền/);
    expect(() => kiemSo([tao({}), tao({})])).toThrow(/Trùng/);
  });
  it("tham số lạ bị từ chối với TÊN trường, không kèm giá trị (ca B7)", () => {
    const c = timCongCu("danh_muc.lay_co_so")!;
    try {
      c.chuanBi({ xoa: "bi-mat-khong-duoc-lap-lai" }, { maxRowsPerCall: 500, maxRangeDays: 93 });
      expect.unreachable("phải ném");
    } catch (e) {
      const loi = e as { ma?: string; truongSai?: string[]; message: string };
      expect(loi.ma).toBe("THAM_SO_SAI");
      expect(JSON.stringify(loi)).not.toContain("bi-mat-khong-duoc-lap-lai");
      expect(loi.message).not.toContain("bi-mat-khong-duoc-lap-lai");
    }
  });
});
