// @vitest-environment node
/**
 * Mọi route cron phải có mặt trong `vercel.json`, và ngược lại.
 *
 * Cron mồ côi là lỗi IM LẶNG hoàn hảo: route tồn tại, code đúng, test của nó
 * xanh — và nó KHÔNG BAO GIỜ CHẠY. Không có log lỗi nào để tìm, vì không có gì
 * chạy để mà lỗi. Đợt rà soát trước đã tìm thấy đúng hai con như vậy.
 *
 * Chiều ngược lại cũng phải canh: một dòng trong `vercel.json` trỏ tới route đã
 * xoá làm Vercel gọi vào 404 mỗi ngày, lặng lẽ.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const THU_MUC = join(ROOT, "app", "api", "cron");

const dangKy = (
  JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
    crons?: { path: string; schedule: string }[];
  }
).crons ?? [];

const routeCoThat = readdirSync(THU_MUC, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .filter((d) => existsSync(join(THU_MUC, d.name, "route.ts")))
  .map((d) => d.name);

describe("đăng ký cron", () => {
  it("mọi route cron đều có lịch chạy trong vercel.json", () => {
    const daDangKy = new Set(dangKy.map((c) => c.path));
    const moCoi = routeCoThat.filter((n) => !daDangKy.has(`/api/cron/${n}`));
    expect(moCoi, `cron không bao giờ chạy: ${moCoi.join(", ")}`).toEqual([]);
  });

  it("mọi lịch trong vercel.json đều trỏ tới route có thật", () => {
    const co = new Set(routeCoThat.map((n) => `/api/cron/${n}`));
    const treo = dangKy.map((c) => c.path).filter((p) => !co.has(p));
    expect(treo, `lịch trỏ vào hư không: ${treo.join(", ")}`).toEqual([]);
  });

  it("không có hai lịch trùng đường dẫn", () => {
    const dem = new Map<string, number>();
    for (const c of dangKy) dem.set(c.path, (dem.get(c.path) ?? 0) + 1);
    expect([...dem.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });

  it("mọi route cron đều có MỘT cổng xác thực", () => {
    // Thiếu cổng thì bất kỳ ai gọi URL cũng chạy được tác vụ nền — kể cả tác vụ
    // ghi dữ liệu hàng loạt.
    //
    // ⚠️ Kiểm TÍNH CHẤT "có gác", không kiểm một cách viết. Bản đầu bắt đúng chữ
    // `verifyCronAuth` và đỏ ở ba route hoàn toàn hợp lệ: `withCron()` bọc sẵn
    // cổng, còn hai route kia có `authorize()` riêng nhận CRON_SECRET hoặc phiên
    // admin (chúng chạy được cả bằng tay). Một test bắt cách viết sẽ đẩy người
    // sau đi sửa mã đang đúng cho vừa test.
    const CACH_GAC = ["verifyCronAuth", "withCron(", "CRON_SECRET"];
    for (const n of routeCoThat) {
      const src = readFileSync(join(THU_MUC, n, "route.ts"), "utf8");
      expect(CACH_GAC.some((k) => src.includes(k)), `${n} không có cổng xác thực nào`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S-7 (26/08/2026) — cron nào PHẢI được bơm trên môi trường `test`.
//
// Vercel Cron KHÔNG chạy trên custom environment ⇒ `test.satarobo.vn` không có
// một cron nào tự chạy. `cron-pump-test.yml` là thứ duy nhất gọi chúng ở đó.
// Cron có trong `vercel.json` mà không có trong danh sách bơm thì **lần chạy
// thật đầu tiên của nó là trên PROD** — không có lưới nghiệm thu nào.
//
// Test này KHÔNG đòi bơm cả 26 cron (phần lớn là việc đêm, bơm 5 phút/lần là phí
// và làm nhiễu). Nó chốt đúng tập cron mà **ô nghiệm thu của người** phụ thuộc:
//   • sla-check — ô "SLA kêu đúng trên một lead thử". Không bơm thì người nghiệm
//     thu ngồi đợi một tiếng chuông không bao giờ tới, rồi kết luận SLA hỏng.
// ─────────────────────────────────────────────────────────────────────────────
const YML = readFileSync(
  join(ROOT, ".github", "workflows", "cron-pump-test.yml"),
  "utf8",
);

/** Tên cron trong vòng `for p in a b c; do` của workflow bơm. */
const duocBom: string[] = (() => {
  const m = YML.match(/for\s+p\s+in\s+([^;]+);\s*do/);
  return m ? m[1].trim().split(/\s+/) : [];
})();

describe("bơm cron trên môi trường test", () => {
  it("đọc được danh sách bơm (khuôn `for p in …; do` chưa bị đổi)", () => {
    expect(duocBom.length).toBeGreaterThan(0);
  });

  it("mọi tên trong danh sách bơm đều là route CÓ THẬT", () => {
    // Gõ sai tên = curl ăn 404 mỗi 5 phút; workflow báo đỏ nhưng chẳng ai đọc.
    const co = new Set(routeCoThat);
    const sai = duocBom.filter((n) => !co.has(n));
    expect(sai, `bơm vào hư không: ${sai.join(", ")}`).toEqual([]);
  });

  it("sla-check được bơm — nếu không, ô nghiệm thu SLA không có cách tick", () => {
    expect(
      duocBom,
      "thêm sla-check vào vòng `for p in …` của .github/workflows/cron-pump-test.yml",
    ).toContain("sla-check");
  });
});
