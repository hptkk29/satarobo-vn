// Ca [HDF-*] — CÔNG TẮC MÀN HOÁ ĐƠN ĐIỆN TỬ: nằm trong DB, mặc định TẮT, đọc ở đúng MỘT hàm.
//
// Chép khuôn `[FEAT-*]` (`lib/finance/feature.test.ts`) của công tắc thu học phí linh hoạt, vì
// cùng một bài học: cờ env `PAYMENT_LEDGER_V2` có trong mã, không có trên prod, 0 đường gọi —
// một cờ chết trông y như cờ sống. Kế hoạch: docs/ke-toan-hoa-don/PLAN.md §11 ("Cờ").
//
// Khác `billing.flexV1Enabled` ở một chỗ, có chủ đích: `centerOverridable: false`. Đo prod
// 25/09: chỉ MỘT người giữ quyền xác nhận (Kế toán Hội sở), không có kế toán cơ sở nào — không có
// ca "pilot một cơ sở" để phục vụ, còn công tắc theo cơ sở thì kéo theo việc mục sidebar phải biết
// cơ sở nào bật (một lời hứa suông nữa để canh). Cần thì mở sau.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { KHOA_HOA_DON } from "./feature";
import { SETTINGS } from "@/lib/settings/registry";
import { NHAN_VAN_HANH } from "@/lib/settings/nhan-van-hanh";

const TRAN_QUET_MS = 30_000;

describe("[HDF-01] khai báo công tắc", () => {
  it("khoá là `billing.hoaDonEnabled`", () => {
    expect(KHOA_HOA_DON).toBe("billing.hoaDonEnabled");
  });

  it("mặc định TẮT, KHÔNG cho cơ sở lệch, nhóm tài chính", () => {
    // Một mặc định `true` lọt vào đây là bật màn cho toàn prod ngay lần deploy kế tiếp.
    const d = SETTINGS[KHOA_HOA_DON];
    expect(d.default).toBe(false);
    expect(d.centerOverridable).toBe(false);
    expect(d.group).toBe("finance");
    expect(d.schema.safeParse(true).success).toBe(true);
    expect(d.schema.safeParse("true").success, "phải là boolean thật, không phải chuỗi").toBe(false);
  });

  it("có nhãn cho người vận hành ở tab Tiền, đánh dấu CẨN THẬN", () => {
    const n = NHAN_VAN_HANH[KHOA_HOA_DON];
    expect(n.tab).toBe("tien");
    expect(n.canThan).toBe(true);
    expect(n.ten.length).toBeGreaterThan(0);
  });
});

function bocChuThich(v: string): string {
  return v
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((d) => d.replace(/\/\/[^\n]*$/, ""))
    .join("\n");
}

describe("[HDF-02] LƯỚI: không ai đọc cờ ngoài `lib/finance/hoa-don/feature.ts`", () => {
  // `git ls-files` chứ không `readdirSync` — lý do đầy đủ ở `[FEAT-03]`: cây tệp sống có tệp tạm
  // thoáng qua trong lúc các worker khác chạy, lưới đỏ theo thứ không nằm trong repo.
  function quetMa(): { duong: string; noiDung: string }[] {
    const ra = execFileSync("git", ["ls-files", "--", "lib", "app", "components"], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split(/\r?\n/)
      .filter((d) => /\.tsx?$/.test(d))
      .filter((d) => !/\.(test|spec)\.tsx?$/.test(d))
      .filter((d) => d !== "lib/finance/hoa-don/feature.ts")
      .filter((d) => d !== "lib/settings/registry.ts") // nơi KHAI khoá
      .filter((d) => d !== "lib/settings/nhan-van-hanh.ts") // nhãn cho người vận hành
      .filter((d) => existsSync(resolve(process.cwd(), d)))
      .map((d) => ({ duong: d, noiDung: bocChuThich(readFileSync(resolve(process.cwd(), d), "utf8")) }));
    expect(ra.length, "phép quét không đọc được tệp nào — `git ls-files` hỏng?").toBeGreaterThan(200);
    return ra;
  }

  it("0 tệp nào khác nhắc chuỗi khoá", { timeout: TRAN_QUET_MS }, () => {
    const viPham = quetMa()
      .filter((f) => f.noiDung.includes(KHOA_HOA_DON))
      .map((f) => f.duong);
    expect(viPham, `Đọc cờ ngoài lib/finance/hoa-don/feature.ts: ${viPham.join(", ")}`).toEqual([]);
  });
});
