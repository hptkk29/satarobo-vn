// lib/finance/uu-dai-setting.test.ts — LƯỚI: chính sách ưu đãi chỉ đọc ở MỘT chỗ.
//
// Cùng khuôn `[FEAT-03]` của `lib/finance/feature.test.ts`, và cùng lý do: rải
// `getSetting("billing.sibling…")` khắp nơi là mỗi chỗ tự quyết định nghĩa của chính sách,
// và quản lý đổi một mức % sẽ đổi được 9 chỗ trong 10 — không lỗi nào báo.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SETTING_KEYS } from "@/lib/settings/registry";

/** Sáu khoá chính sách ưu đãi — suy từ REGISTRY, không chép tay. */
const KHOA_CHINH_SACH = SETTING_KEYS.filter(
  (k) => k.startsWith("billing.sibling") || k === "billing.lateDiscountAbsorb",
);

/** Nơi DUY NHẤT được đọc chúng, cộng hai tệp KHAI chúng. */
const DUOC_DOC = [
  "lib/finance/uu-dai-setting.ts",
  "lib/settings/registry.ts",
  "lib/settings/nhan-van-hanh.ts",
];

/**
 * Mọi tệp `.ts`/`.tsx` ĐANG ĐƯỢC GIT THEO DÕI trong `lib/` và `app/`, bỏ test.
 *
 * ⚠️ `git ls-files`, KHÔNG `readdirSync` cả cây — bài học đã trả giá ở `[FEAT-03]`: cây tệp
 * SỐNG thay đổi trong lúc các worker vitest khác chạy song song, nên một bản nháp của kịch
 * bản cấy lỗi cũng vào danh sách quét và lưới đỏ theo thứ không nằm trong repo.
 */
function quetMa(): { duong: string; noiDung: string }[] {
  return execFileSync("git", ["ls-files", "--", "lib", "app"], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split(/\r?\n/)
    .filter((d) => /\.tsx?$/.test(d))
    .filter((d) => !/\.(test|spec)\.tsx?$/.test(d))
    .filter((d) => !DUOC_DOC.includes(d))
    .filter((d) => existsSync(resolve(process.cwd(), d)))
    .map((d) => ({ duong: d, noiDung: readFileSync(resolve(process.cwd(), d), "utf8") }));
}

describe("[UDS] chính sách ưu đãi anh em — một nguồn đọc", () => {
  it("[UDS-01] sáu khoá chính sách đều CÓ TRONG registry", () => {
    // Ca chống TAUTOLOGY: `KHOA_CHINH_SACH` suy từ registry, nên đổi tên khoá mà quên sửa
    // tiền tố ở đây sẽ làm danh sách RỖNG và ca [UDS-02] xanh vĩnh viễn mà không quét gì.
    expect(KHOA_CHINH_SACH.sort()).toEqual([
      "billing.lateDiscountAbsorb",
      "billing.siblingAutoEnabled",
      "billing.siblingPercentSecond",
      "billing.siblingPercentThird",
      "billing.siblingStacksFullPay",
      "billing.siblingTarget",
    ]);
  });

  it("[UDS-02] không tệp nào ngoài `uu-dai-setting.ts` đọc sáu khoá đó", () => {
    const pham: string[] = [];
    for (const { duong, noiDung } of quetMa()) {
      for (const khoa of KHOA_CHINH_SACH) {
        if (noiDung.includes(`"${khoa}"`) || noiDung.includes(`'${khoa}'`)) {
          pham.push(`${duong} → ${khoa}`);
        }
      }
    }
    expect(
      pham,
      `Chính sách ưu đãi phải đọc qua \`docChinhSachUuDai\`:\n  - ${pham.join("\n  - ")}`,
    ).toEqual([]);
  });

  it("[UDS-03] `uu-dai-setting.ts` đọc ĐỦ sáu khoá, không thiếu khoá nào", () => {
    // Chiều ngược lại, và nó âm thầm: thêm một khoá chính sách vào registry mà quên đọc nó
    // trong hàm gom thì chính sách ấy KHÔNG BAO GIỜ có tác dụng — quản lý cài xong, không
    // đổi gì, và không lỗi nào báo. Đúng lớp lỗi câm mà cờ `PAYMENT_LEDGER_V2` đã dạy.
    const ma = readFileSync(resolve(process.cwd(), "lib/finance/uu-dai-setting.ts"), "utf8");
    const thieu = KHOA_CHINH_SACH.filter((k) => !ma.includes(`"${k}"`));
    expect(thieu, `Khoá khai trong registry mà không ai đọc:\n  - ${thieu.join("\n  - ")}`).toEqual(
      [],
    );
  });
});
