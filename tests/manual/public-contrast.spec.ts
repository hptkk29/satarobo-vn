/**
 * Rà site CÔNG KHAI: tương phản chữ (WCAG AA) + tràn ngang ở 375px.
 *   corepack pnpm@11 exec playwright test -c playwright.manual.config.ts public-contrast
 *   VIEWPORT=mobile ... (đo ở 375px thay vì 1280px)
 *
 * Không cần đăng nhập. Đo cả hai bề rộng vì trang marketing nhiều hero/gradient —
 * chỗ chữ đè lên nền màu là nơi hay trượt nhất, và nó đổi theo bề rộng.
 *
 * ⚠️ Máy đo BỎ QUA phần tử có nền ảnh/gradient (không đọc được bằng
 * backgroundColor). Trang công khai dùng nhiều hero ảnh, nên KHÔNG kết luận
 * "sạch" từ con số này — nó chỉ phủ phần nền màu đặc.
 */
import { test } from "@playwright/test";
import { AUDIT, type ChoTruot } from "./_contrast";

const MOBILE = process.env.VIEWPORT === "mobile";

test.use(
  MOBILE
    ? { viewport: { width: 375, height: 812 } }
    : { viewport: { width: 1280, height: 900 } },
);

const ROUTES = [
  "/",
  "/khoa-hoc",
  "/khoa-hoc/laptrinhrobot",
  "/khoa-hoc/luyenthirobosim",
  "/hoc-cu",
  "/tin-tuc",
  "/vinh-danh",
  "/vinh-danh/tat-ca",
  "/tuyen-dung",
  "/lien-he",
  "/ve-chung-toi",
  "/chinh-sach-bao-mat",
  "/dieu-khoan-su-dung",
  "/quyen-rieng-tu",
  "/chinh-sach-hoan-tra",
];

test(`site cong khai — ${MOBILE ? "375px" : "1280px"}`, async ({ page }) => {
  test.setTimeout(25 * 60_000);
  let truot = 0;
  let tran = 0;
  for (const r of ROUTES) {
    await page.goto(r, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);

    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    if (MOBILE && w > 376) {
      tran++;
      console.log("TRAN NGANG", r, w + "px");
    }

    const bad = (await page.evaluate(`(${AUDIT})()`)) as ChoTruot[];
    if (bad.length) {
      console.log("== " + r);
      for (const b of bad)
        console.log(
          `   ${b.ty}:1 (can ${b.can}) ${b.co}px  "${b.chu}"  ${b.mau} tren ${b.nen}  [${b.cls}]`,
        );
      truot += bad.length;
    }
  }
  console.log(
    `KET LUAN: truot AA ${truot} | tran ngang ${tran}/${ROUTES.length}`,
  );
});
