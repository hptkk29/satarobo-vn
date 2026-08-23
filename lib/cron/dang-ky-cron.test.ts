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
