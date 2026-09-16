// Ca [FEAT-*] — công tắc thu học phí linh hoạt. Phủ TS-07 (US-05/AC3) và pre-mortem T8.
//
// T8 xếp "cờ bật tính năng là cờ chết" vào nhóm CHẶN GO-LIVE, với bằng chứng: `PAYMENT_LEDGER_V2`
// có trong mã, 0 đường gọi thật, không có trong 40 biến env prod. Nên bộ này canh HAI thứ khác
// nhau: phép giải cờ đúng, VÀ không ai đọc cờ ngoài một chỗ.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { giaiCongTac, KHOA_CONG_TAC } from "./feature";

describe("[FEAT-01] mặc định TẮT — prod không đổi hành vi khi merge", () => {
  it("toàn hệ tắt, cơ sở không khai gì ⇒ TẮT", () => {
    expect(giaiCongTac({ toanHe: false })).toBe(false);
  });

  it("khoá trong registry mặc định `false`", () => {
    // Đọc thẳng registry: một mặc định `true` lọt vào đây là bật tính năng cho toàn prod ngay
    // lần deploy kế tiếp, và không có màn nào báo.
    const src = readFileSync(resolve(process.cwd(), "lib/settings/registry.ts"), "utf8");
    const khoi = new RegExp(`"${KHOA_CONG_TAC}": def\\(\\{[^}]*?\\}\\)`, "s").exec(src)?.[0] ?? "";
    expect(khoi).toContain("default: false");
    expect(khoi).toContain("centerOverridable: true");
  });
});

describe("[FEAT-02] override của cơ sở chạy CẢ HAI chiều", () => {
  it("toàn hệ TẮT + cơ sở BẬT ⇒ bật (pilot một cơ sở)", () => {
    expect(giaiCongTac({ toanHe: false, coSo: true })).toBe(true);
  });

  it("toàn hệ BẬT + cơ sở TẮT ⇒ tắt (gỡ một cơ sở khi nó gặp sự cố)", () => {
    // Chiều này dễ bị bỏ vì "ai lại tắt một cơ sở". Nhưng đó đúng là việc cần làm khi một cơ sở
    // gặp sự cố: gỡ nó ra, không phải tắt cả nhà.
    expect(giaiCongTac({ toanHe: true, coSo: false })).toBe(false);
  });

  it("toàn hệ BẬT + cơ sở KHÔNG khai gì ⇒ bật", () => {
    expect(giaiCongTac({ toanHe: true })).toBe(true);
  });

  it("`undefined` (không khai) KHÁC `false` (khai tắt)", () => {
    // Gộp hai thứ này là làm mất khả năng gỡ một cơ sở — đúng ca vận hành mà công tắc riêng
    // sinh ra để phục vụ.
    expect(giaiCongTac({ toanHe: true, coSo: undefined })).toBe(true);
    expect(giaiCongTac({ toanHe: true, coSo: false })).toBe(false);
  });
});

/**
 * Bóc chú thích trước khi soi — lưới phải soi MÃ, không soi lời kể về mã.
 *
 * ⚠️ Ba chi tiết, cả ba đã trả giá trong đúng một ngày:
 *  · tách dòng bằng `/\r?\n/`, KHÔNG phải `"\n"` — nhiều tệp của repo là CRLF;
 *  · dùng `[^\n]*`, KHÔNG phải `.*` — trong JavaScript `.` KHÔNG khớp `\r`, nên regex gặp dòng
 *    còn `\r` là không khớp gì và hàm trả về NGUYÊN VĂN (sáng 16/09: một phép bóc y hệt bóc
 *    được 0 dòng và trông hệt như đang làm việc);
 *  · và chính chú thích "cờ không ở đây" trong `lib/flags.ts` CHỨA chuỗi khoá đang bị cấm —
 *    lưới đỏ vì một câu văn, không vì một đường gọi (chiều 16/09).
 */
function bocChuThich(v: string): string {
  return v
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((d) => d.replace(/\/\/[^\n]*$/, ""))
    .join("\n");
}

describe("[FEAT-03] LƯỚI: không ai đọc cờ ngoài `lib/finance/feature.ts`", () => {
  /** Mọi tệp `.ts`/`.tsx` trong `lib/` và `app/`, bỏ test và bỏ chính file công tắc. */
  function quetMa(): { duong: string; noiDung: string }[] {
    const ra: { duong: string; noiDung: string }[] = [];
    const diQua = (d: string) => {
      for (const t of readdirSync(d)) {
        const p = join(d, t);
        if (statSync(p).isDirectory()) {
          if (t === "node_modules" || t === ".next") continue;
          diQua(p);
          continue;
        }
        if (!/\.tsx?$/.test(t)) continue;
        if (/\.(test|spec)\.tsx?$/.test(t)) continue;
        const chuan = p.replace(/\\/g, "/");
        if (chuan.endsWith("lib/finance/feature.ts")) continue;
        if (chuan.endsWith("lib/settings/registry.ts")) continue; // nơi KHAI khoá
        if (chuan.endsWith("lib/settings/nhan-van-hanh.ts")) continue; // nhãn cho người vận hành
        ra.push({ duong: chuan, noiDung: bocChuThich(readFileSync(p, "utf8")) });
      }
    };
    diQua(resolve(process.cwd(), "lib"));
    diQua(resolve(process.cwd(), "app"));
    return ra;
  }

  it("0 tệp nào khác nhắc chuỗi khoá cài đặt", () => {
    // Rải `getSetting("billing.flexV1Enabled")` khắp nơi là mỗi chỗ tự quyết định nghĩa của
    // "bật", và tắt cờ sẽ tắt được 9 chỗ trong 10 — đúng hình dạng sự cố mà T8 mô tả.
    //
    // ⚠️ Lưới này soi VĂN BẢN nên nó mong manh (luật 11). Hai thứ giữ nó khỏi vô dụng: neo vào
    // chuỗi khoá HẸP (`billing.flexV1Enabled`, không phải `flexV1`), và ca `[FEAT-04]` chứng
    // minh phép quét thật sự đọc được tệp.
    const viPham = quetMa()
      .filter((f) => f.noiDung.includes(KHOA_CONG_TAC))
      .map((f) => f.duong);
    expect(viPham).toEqual([]);
  });

  it("và chỉ `laThuTienLinhHoatBat` được gọi từ ngoài — không ai gọi `giaiCongTac` trực tiếp", () => {
    // `giaiCongTac` là hàm thuần để TEST phép giải; gọi nó ở đường chạy thật nghĩa là ai đó đã
    // tự đi tra DB rồi tự giải — tức lại có hai nơi quyết định nghĩa của "bật".
    const viPham = quetMa()
      .filter((f) => /\bgiaiCongTac\s*\(/.test(f.noiDung))
      .map((f) => f.duong);
    expect(viPham).toEqual([]);
  });
});

describe("[FEAT-04] LƯỚI CANH LƯỚI — phép quét mã phải thật sự đọc được tệp", () => {
  it("phép bóc chú thích THẬT SỰ bóc — kể cả dòng CRLF", () => {
    // Bóc chú thích là bản vá cho lần lưới đỏ vì một câu văn. Ca này canh bản vá: một phép bóc
    // hỏng bóc được 0 dòng và trông y hệt một phép bóc đang làm việc.
    const vao = `  // ${KHOA_CONG_TAC} chỉ là chú thích\r\nconst x = 1;\r\n`;
    const ra = bocChuThich(vao);
    expect(ra).not.toContain(KHOA_CONG_TAC);
    expect(ra).toContain("const x = 1;");
    expect(bocChuThich(`/* ${KHOA_CONG_TAC} */\r\nok`)).not.toContain(KHOA_CONG_TAC);
    // Còn ĐƯỜNG GỌI THẬT thì KHÔNG được bóc — kẻo lưới hoá vô dụng.
    expect(bocChuThich(`getSetting("${KHOA_CONG_TAC}")`)).toContain(KHOA_CONG_TAC);
  });

  it("`lib/flags.ts` vẫn nhắc tên khoá trong CHÚ THÍCH — và đó là chủ ý", () => {
    // Chú thích ở đó dẫn người đọc từ nơi họ tưởng có cờ tới nơi cờ thật sự nằm. Ca này ghim
    // rằng lưới KHÔNG buộc phải xoá lời giải thích để được xanh: ai "sửa" bằng cách gỡ chú
    // thích thì ca này đỏ.
    const flags = readFileSync(resolve(process.cwd(), "lib/flags.ts"), "utf8");
    expect(flags).toContain(KHOA_CONG_TAC);
    expect(bocChuThich(flags)).not.toContain(KHOA_CONG_TAC);
  });

  it("`laThuTienLinhHoatBat` PHẢI truyền `orgUnitId` xuống `getSetting`", () => {
    // LƯỚI GHIM MÃ NGUỒN (CLAUDE.md): luật ở đây có dạng "lời gọi này phải truyền tham số kia",
    // và test hành vi KHÔNG chứng minh được — `getSetting` chạm DB, nên mọi ca kiểm sẽ là test
    // tích hợp, và test tích hợp thì không ai viết đủ ca.
    //
    // Bỏ tham số đó đi thì hàm vẫn chạy, vẫn trả boolean, vẫn xanh mọi test — chỉ có **công tắc
    // riêng từng cơ sở tàng hình**: `CenterSetting` không bao giờ được tra, và người vận hành
    // bật/tắt cho một cơ sở mà không có tác dụng gì, không lỗi nào báo. Đo được: cấy đúng lỗi
    // này ở lượt đầu và KHÔNG ca nào đỏ.
    const src = bocChuThich(readFileSync(resolve(process.cwd(), "lib/finance/feature.ts"), "utf8"));
    const than = /export async function laThuTienLinhHoatBat[\s\S]*?\n\}/.exec(src)?.[0] ?? "";
    expect(than).not.toBe("");
    const goi = than.match(/getSetting\(\s*KHOA_CONG_TAC\s*,\s*\{\s*orgUnitId:/g) ?? [];
    expect(goi).toHaveLength(1);
  });

  it("quét ra > 200 tệp, và có tệp mà ta biết chắc tồn tại", () => {
    // Nếu `quetMa` trả mảng rỗng (sai đường dẫn, lỗi quyền, đổi cấu trúc thư mục) thì hai ca
    // trên XANH VĨNH VIỄN và trông y hệt một lưới đang làm việc. Đây là bài học đã trả giá ở
    // `docSchema()` sáng nay: một phép bóc chú thích hỏng bóc được 0 dòng và không ai biết.
    const files: string[] = [];
    const diQua = (d: string) => {
      for (const t of readdirSync(d)) {
        const p = join(d, t);
        if (statSync(p).isDirectory()) {
          if (t === "node_modules" || t === ".next") continue;
          diQua(p);
          continue;
        }
        if (/\.tsx?$/.test(t)) files.push(p.replace(/\\/g, "/"));
      }
    };
    diQua(resolve(process.cwd(), "lib"));
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.endsWith("lib/finance/feature.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("lib/settings/registry.ts"))).toBe(true);
  });
});
