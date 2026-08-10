/**
 * Chẩn đoán TS-14: đi ĐÚNG đường của trình duyệt (xin ticket → PUT thẳng lên R2) và
 * ghi lại mọi response + log console, để phân biệt 3 khả năng:
 *   (a) thiếu `R2_CHAT_BUCKET_NAME` → /api/chat/upload-url trả 503;
 *   (b) bucket chat thiếu luật CORS cho PUT từ domain site → trình duyệt CHẶN,
 *       XHR báo lỗi mạng, ảnh không bao giờ "ready" (không có lỗi phía server);
 *   (c) lỗi khác của client.
 */
import { expect, test } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readSeed } from "./_fixtures";
import { contextFor, openPortalThread } from "./_helpers";

const seed = readSeed();
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("chẩn đoán · đường upload ảnh của trình duyệt", async ({ browser }) => {
  test.setTimeout(4 * 60_000);
  const dir = mkdtempSync(path.join(tmpdir(), "zztest-chat-"));
  const file = path.join(dir, "chan-doan.png");
  writeFileSync(file, PNG_1PX);

  const ctx = await contextFor(browser, "ph1");
  const page = await ctx.newPage();

  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      console.log(`[console:${m.type()}] ${m.text().slice(0, 300)}`);
    }
  });
  page.on("requestfailed", (r) => {
    console.log(`[requestfailed] ${r.method()} ${r.url().slice(0, 120)} — ${r.failure()?.errorText}`);
  });
  page.on("response", async (r) => {
    const u = r.url();
    if (u.includes("/api/chat/") || u.includes("r2.cloudflarestorage.com")) {
      console.log(`[response] ${r.status()} ${r.request().method()} ${u.slice(0, 120)}`);
    }
  });

  await openPortalThread(page, seed.conversations.lopA);
  await page.locator('input[type="file"]').first().setInputFiles(file);

  // Chờ tối đa 60s rồi chụp trạng thái dải xem trước, dù thành công hay thất bại.
  await page.waitForTimeout(60_000);
  const strip = await page
    .locator("body")
    .innerText()
    .then((t) => t.split("\n").filter((l) => /ảnh|Ảnh|tải|lỗi|Lỗi/.test(l)).slice(0, 10));
  console.log(`[trạng thái] ${JSON.stringify(strip)}`);

  const sendEnabled = await page
    .getByRole("button", { name: "Gửi", exact: true })
    .first()
    .isEnabled();
  console.log(`[trạng thái] nút Gửi enabled = ${sendEnabled}`);
  expect(true).toBe(true);
  await ctx.close();
});
