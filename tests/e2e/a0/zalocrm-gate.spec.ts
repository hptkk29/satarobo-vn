/**
 * S1 (tích hợp ZaloCRM) — cổng vào màn `/zalo-crm`: cờ 2 pha + quyền + mục sidebar.
 *
 * Đi ké job CI `e2e-a0` (`.github/workflows/ci.yml`), Postgres LOCAL. KHÔNG chạy trên
 * Supabase — `resetDb()` chỉ chấp nhận `satarobo_test`/`ci_test`.
 *
 * ⚠️ HAI CHẾ ĐỘ, KHÔNG PHẢI "TEST BỊ TẮT":
 * Cờ `ZALOCRM_ENABLED` mặc định TẮT, và CI hiện chạy đúng như vậy. Bộ này vì thế kiểm
 * chế độ ĐANG CHẠY THẬT ([ZC-E2E-00]: cờ tắt ⇒ màn không tồn tại với cả SUPER_ADMIN) và
 * giữ sẵn ba ca của chế độ BẬT. Bật lên mà chạy:
 *
 *     ZALOCRM_ENABLED=true pnpm test:e2e:a0 -- zalocrm-gate
 *
 * (cả tiến trình test lẫn `webServer` của `playwright.a0.config.ts` cùng đọc process.env,
 *  nên một biến là đủ cho cả hai).
 *
 * ⚠️ ĐIỀU BỘ NÀY CỐ Ý KHÔNG KIỂM: nội dung bên trong khung nhúng. Fork ZaloCRM là repo
 * khác và ở GĐ0 chưa tồn tại — khung TRẮNG là kết quả ĐÚNG. Ca [ZC-E2E-03] chỉ soi có
 * đúng một thẻ `<iframe>` trỏ đúng origin, không hơn.
 *
 * ⚠️ CHƯA CHẠY ĐƯỢC LẦN NÀO ở lô này: bật cờ đòi dựng Next trên cổng 3100 + `resetDb()`
 * trên DB dùng chung với hai lô đang chạy song song. Ba ca chế độ BẬT sẽ chạy lần đầu ở
 * CI hoặc ở GĐ1 — chuẩn bị tinh thần sửa vặt (nhãn nút, thời gian chờ).
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb, seedOrg, seedRoles, seedUser } from "../_helpers/seed";
import { loginAs } from "../_helpers/auth";
import { testEmail } from "../_helpers/fixtures";

const CO_BAT = process.env.ZALOCRM_ENABLED === "true";
const APP_URL = process.env.ZALOCRM_APP_URL ?? "";
const CO_CAU_HINH_DAY_DU = CO_BAT && Boolean(APP_URL) && Boolean(process.env.ZALOCRM_SSO_SECRET);

/** Mục sidebar — dùng nhãn chính xác như khai trong `components/admin/sidebar.tsx`. */
const MUC_SIDEBAR = "Zalo CRM";

test.describe("[S1] Cổng vào màn Zalo CRM", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("[ZC-E2E-00] cờ TẮT ⇒ màn không tồn tại (404) và mục sidebar ẩn — kể cả SUPER_ADMIN", async ({
    page,
  }) => {
    test.skip(CO_BAT, "Chế độ này chỉ đúng khi ZALOCRM_ENABLED chưa bật");

    await loginAs(page, {
      email: testEmail("zc-super-admin"),
      role: "SUPER_ADMIN",
      callbackUrl: "/admin/dashboard",
    });

    // "Tắt" nghĩa là KHÔNG TỒN TẠI, không phải "vào được rồi báo chưa bật".
    const res = await page.goto("/admin/zalo-crm");
    expect(res?.status(), "cờ tắt phải trả 404, không phải 200 kèm lời nhắn").toBe(404);

    await page.goto("/admin/dashboard");
    await expect(page.getByRole("link", { name: MUC_SIDEBAR })).toHaveCount(0);
  });

  test("[ZC-E2E-01] SALES_CSM thấy mục \"Zalo CRM\" và mở được màn", async ({ page }) => {
    test.skip(!CO_BAT, "Cần ZALOCRM_ENABLED=true (xem chú thích đầu file)");

    await loginAs(page, {
      email: testEmail("zc-sale"),
      role: "SALES_CSM",
      callbackUrl: "/admin/dashboard",
    });
    await page.goto("/admin/dashboard");

    // Menu và cổng trang đọc CÙNG một bảng `PAGE_GATES["/zalo-crm"]`, nên hai assert
    // dưới đây phải cùng đúng — lệch một chiều là dead-link, lệch chiều kia là hở quyền.
    const muc = page.getByRole("link", { name: MUC_SIDEBAR });
    await expect(muc).toBeVisible();

    await page.goto("/admin/zalo-crm");
    await expect(page).not.toHaveURL(/error=unauthorized/);
    await expect(page.getByRole("heading", { name: MUC_SIDEBAR })).toBeVisible();
  });

  test("[ZC-E2E-02] Kế toán KHÔNG thấy mục và gõ thẳng URL thì bị đá về /dashboard", async ({
    page,
  }) => {
    test.skip(!CO_BAT, "Cần ZALOCRM_ENABLED=true (xem chú thích đầu file)");

    // `ACCOUNTANT` là mã vai v1 (enum `Role`) — local/CI chạy RBAC v1. Vai tương ứng ở
    // v2 là `CENTER_ACCOUNTANT`, cũng KHÔNG được cấp `zalocrm:use` (ca [ZC-Q-04] của L2
    // canh phía seed). Ở đây kiểm tầng chạy thật của môi trường này.
    await loginAs(page, {
      email: testEmail("zc-ke-toan"),
      role: "ACCOUNTANT",
      callbackUrl: "/admin/dashboard",
    });
    await page.goto("/admin/dashboard");
    await expect(page.getByRole("link", { name: MUC_SIDEBAR })).toHaveCount(0);

    // Giấu menu là chưa đủ — cổng phải đứng ở chính trang.
    await page.goto("/admin/zalo-crm");
    await expect(page).toHaveURL(/\/dashboard(\?|$)/);
    await expect(page).toHaveURL(/error=unauthorized/);
  });

  test("[ZC-E2E-03] có ĐÚNG MỘT iframe, trỏ đúng origin ZaloCRM, vé nằm trong #fragment", async ({
    page,
  }) => {
    test.skip(
      !CO_CAU_HINH_DAY_DU,
      "Cần ZALOCRM_ENABLED=true + ZALOCRM_APP_URL + ZALOCRM_SSO_SECRET",
    );

    // Màn chỉ dựng khung khi cơ sở đã ánh xạ orgCode VÀ người dùng nhìn thấy cơ sở đó.
    await seedOrg(["HO", "CS1"]);
    await seedRoles();
    const center = await db.center.create({
      data: {
        code: "CS1",
        name: "CS1 — Nguyễn Hữu Thọ",
        slug: "zc-cs1",
        address: "211 Nguyễn Hữu Thọ",
      },
      select: { id: true },
    });
    // OrgUnit CS1 đã có sau seedOrg nhưng chưa trỏ Center (Center tạo sau) — nối lại.
    const orgUnit = await db.orgUnit.update({
      where: { code: "CS1" },
      data: { centerId: center.id },
      select: { id: true },
    });
    await db.systemSetting.upsert({
      where: { key: "zalocrm.orgCodes" },
      update: { valueJson: { CS1: "cs1" } },
      create: { key: "zalocrm.orgCodes", valueJson: { CS1: "cs1" } },
    });

    const user = await seedUser({
      email: testEmail("zc-qlcs"),
      role: "CENTER_MANAGER",
      centerId: center.id,
    });
    const role = await db.roleDef.findUniqueOrThrow({
      where: { code: "CENTER_MANAGER" },
      select: { id: true },
    });
    // Tầm nhìn cơ sở đến từ `UserOrgRole` (`actor.visibleCenterIds`) — không có dòng này
    // thì danh sách tab rỗng và trang hiện hướng dẫn thay vì khung nhúng.
    await db.userOrgRole.create({
      data: {
        userId: user.id,
        orgUnitId: orgUnit.id,
        roleId: role.id,
        grantedById: user.id, // cột bắt buộc (audit ai cấp) — trong test tự cấp cho mình
      },
    });

    await loginAs(page, {
      email: testEmail("zc-qlcs"),
      role: "CENTER_MANAGER",
      centerId: center.id,
      callbackUrl: "/admin/dashboard",
    });
    await page.goto("/admin/zalo-crm");

    const khung = page.locator("iframe");
    await expect(khung).toHaveCount(1);
    const src = await khung.getAttribute("src");
    expect(src, "iframe phải có src").toBeTruthy();
    expect(src!.startsWith(new URL(APP_URL).origin), `src sai origin: ${src}`).toBe(true);
    // Vé SSO nằm trong FRAGMENT — phần trước dấu `#` không được mang token, nếu không
    // nó rơi vào access log của mọi proxy trên đường đi.
    const [truocHash, sauHash] = src!.split("#");
    expect(truocHash).not.toContain("token");
    expect(sauHash ?? "").toContain("token=");
  });
});
