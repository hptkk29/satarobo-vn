/**
 * TS-11 — Kick giữa phiên đang mở (US-07 AC3).
 *
 * Gỡ học viên khỏi lớp đi bằng ĐƯỜNG NGHIỆP VỤ THẬT: `/admin/enrollments/:id/edit`
 * → "Đổi trạng thái" → Rút lớp. Đó chính là đường gọi `changeEnrollmentStatus`, hàm
 * gọi `syncConversationMembership` TRONG CÙNG transaction (03-sync-callsites.md).
 *
 * ĐO HAI CON SỐ KHÁC NHAU — đừng gộp (bài học lần chạy đầu, 10/08):
 *   • CẬN TRÊN BẢO MẬT = lúc server thôi trả nội dung. Tức thì, vì `leftAt` được set
 *     trong chính transaction đó và mọi đường đọc đều kiểm tư cách thành viên.
 *   • CẬN TRÊN TRẢI NGHIỆM = lúc client ĐANG MỞ tự thoát ra. Tín hiệu này đi
 *     DomainEvent → outbox → cron `dispatch-events` → broadcast, nên nó bị chặn trên
 *     bởi NHỊP CRON chứ không phải bởi realtime:
 *       – PROD: `* * * * *` (mỗi phút, vercel.json)
 *       – TEST: GitHub Actions bơm 5 phút/lần (`cron-pump-test.yml`) vì Vercel Cron
 *         không chạy cho custom environment.
 *     Con số đo được ở đây là con số của TEST; trên prod phải nhanh hơn ~5 lần.
 */
import { expect, test } from "@playwright/test";
import { paths, readSeed } from "./_fixtures";
import { contextFor, openPortalThread } from "./_helpers";

const seed = readSeed();

test("TS-11 · PH bị gỡ khỏi lớp: server chặn ngay, client đang mở tự thoát", async ({
  browser,
}) => {
  test.setTimeout(15 * 60_000);

  const adminCtx = await contextFor(browser, "admin");
  const phCtx = await contextFor(browser, "ph3");
  const admin = await adminCtx.newPage();
  const ph = await phCtx.newPage();

  // PH3 đang mở nhóm LopB, có ô nhập ⇒ đang là thành viên hợp lệ (đối chứng dương).
  await openPortalThread(ph, seed.conversations.lopB);
  await expect(ph.getByLabel("Nội dung tin nhắn")).toBeVisible({ timeout: 30_000 });

  // ── Admin gỡ con của PH3 khỏi lớp ─────────────────────────────────────────
  await admin.goto(paths.enrollmentEdit(seed.enrollmentHv3));
  await admin.getByRole("button", { name: "Đổi trạng thái" }).click();
  const dialog = admin.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("select").selectOption("WITHDREW");
  await dialog
    .locator("textarea")
    .fill("ZZTEST nghiệm thu TS-11 — gỡ khỏi lớp để đo cửa sổ rò rỉ");

  const t0 = Date.now();
  await dialog.getByRole("button", { name: "Xác nhận" }).click();
  // Hộp thoại đóng = Server Action đã trả OK. KHÔNG dò chữ "Rút lớp" trên trang: chuỗi
  // đó còn nằm trong <option> của chính select (ẩn) ⇒ locator khớp phần tử hidden và
  // treo 60s — đúng cái bẫy đã dính lần chạy 10/08 09:35.
  await expect(dialog).toBeHidden({ timeout: 60_000 });

  // ── (1) CẬN TRÊN BẢO MẬT: mở lại bằng phiên KHÁC của chính PH3 ────────────
  const probe = await phCtx.newPage();
  await probe.goto(paths.portalThread(seed.conversations.lopB));
  const probeBody = (await probe.locator("body").innerText()).trim();
  const securityMs = Date.now() - t0;
  await expect(probe.getByLabel("Nội dung tin nhắn")).toBeHidden();
  expect(probeBody.length, "màn hình trắng là FAIL").toBeGreaterThan(20);
  console.log(`[TS-11 · bảo mật] Server thôi trả nội dung sau ${securityMs}ms`);
  console.log(`[TS-11 · bảo mật] Màn hình: ${probeBody.slice(0, 140).replace(/\s+/g, " ")}`);

  // ── (2) CẬN TRÊN TRẢI NGHIỆM: client đang mở tự thoát ─────────────────────
  let exitMs: number | null = null;
  try {
    await expect(ph).toHaveURL(/\/portal\/tin-nhan\/?$/, { timeout: 11 * 60_000 });
    exitMs = Date.now() - t0;
    console.log(`[TS-11 · trải nghiệm] Client tự thoát sau ${Math.round(exitMs / 1000)}s`);
  } catch {
    console.log(
      "[TS-11 · trải nghiệm] KHÔNG tự thoát trong 11 phút — ghi nhận là phát hiện, xem mục chẩn đoán dưới",
    );
  }
  console.log(
    `[TS-11 · kết luận] bảo mật=${securityMs}ms · trải nghiệm=${exitMs === null ? ">11 phút" : Math.round(exitMs / 1000) + "s"}`,
  );

  // Bất kể client có tự thoát hay không, đây là điều KHÔNG được phép xảy ra:
  // người đã bị gỡ vẫn gửi được tin.
  if (await ph.getByLabel("Nội dung tin nhắn").isVisible().catch(() => false)) {
    await ph.getByLabel("Nội dung tin nhắn").fill("ZZTEST TS-11 — người bị gỡ KHÔNG được gửi");
    const btn = ph
      .getByRole("button", { name: "Gửi tin nhắn" })
      .or(ph.getByRole("button", { name: "Gửi", exact: true }))
      .first();
    await btn.click();
    await ph.waitForTimeout(5_000);
    const stillThere = await ph.getByText("ZZTEST TS-11 — người bị gỡ KHÔNG được gửi").count();
    console.log(`[TS-11 · chốt chặn] tin của người bị gỡ hiện trên màn: ${stillThere} (bong bóng lạc quan)`);
  }
  // Chốt chặn thật nằm ở DB: tin của người bị gỡ KHÔNG được vào hội thoại.
  // (Kiểm bằng script _zztmp sau khi chạy — xem báo cáo.)

  expect(exitMs, "client đang mở phải tự thoát trong 11 phút").not.toBeNull();

  await adminCtx.close();
  await phCtx.close();
});
