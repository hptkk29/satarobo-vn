/**
 * Track 2 — Test sâu A/B/D/H/J qua UI (login test-admin). Render-deep TRƯỚC (chắc
 * có kết quả), create best-effort SAU. Mọi action cap 30s (tránh treo). Log + screenshot.
 *   ADMIN_EMAIL=test-admin@example.com ADMIN_PW='Test@1234!' \
 *   corepack pnpm@11 exec playwright test -c playwright.manual.config.ts lms-r7-deep
 */
import { test, expect, type Page, type TestInfo } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "test-admin@example.com";
const ADMIN_PW = process.env.ADMIN_PW ?? "Test@1234!";
const TEST_CLASS = "cmqkkdp5a00fzr3o71w460hob";
const STAMP = "T2";
const log = (s: string) => console.log(s); // eslint-disable-line no-console

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Mật khẩu").fill(ADMIN_PW);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 120_000 });
}

async function visit(page: Page, route: string, ti: TestInfo) {
  let http = 0, onLogin = false, err = false, body = "";
  try {
    const resp = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 150_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    http = resp?.status() ?? 0;
    onLogin = /\/login(\?|$)/.test(page.url());
    body = (await page.locator("body").innerText().catch(() => "")) || "";
    err = /Application error|Unhandled Runtime Error|something went wrong/i.test(body);
    await page.screenshot({ path: ti.outputPath(`deep${route.replace(/\//g, "_")}.png`), fullPage: true }).catch(() => {});
  } catch (e) {
    body = "EXC:" + String(e).slice(0, 100);
  }
  return { http, onLogin, err, body };
}

test("deep A/B/D/H/J", async ({ page }, ti) => {
  test.setTimeout(28 * 60_000);
  page.setDefaultTimeout(30_000); // mọi action cap 30s — không treo cả test
  await login(page);

  // ── H — báo cáo (đếm chart) + cảnh báo ── (warm, làm trước)
  for (const r of ["lms", "lead", "trial", "dao-tao", "trung-tam"]) {
    const res = await visit(page, `/admin/bao-cao/${r}`, ti);
    const charts = await page.locator(".recharts-surface, .recharts-responsive-container").count().catch(() => 0);
    log(`[H.${r}] http=${res.http} err=${res.err} charts=${charts} bodyLen=${res.body.length}`);
  }
  const hRisk = await visit(page, "/admin/canh-bao-rui-ro", ti);
  log(`[H.canh-bao] http=${hRisk.http} err=${hRisk.err}`);

  // ── J — compliance / consent ──
  const j = await visit(page, "/admin/compliance", ti);
  log(`[J.compliance] http=${j.http} err=${j.err} hasConsent=${/consent|đồng ý|NĐ13|Nghị định|tuân thủ|đồng thuận/i.test(j.body)}`);

  // ── B — classes students/progress (render) ──
  const bStud = await visit(page, `/admin/classes/${TEST_CLASS}/students`, ti);
  log(`[B.students] http=${bStud.http} err=${bStud.err} hasBeA=${/Bé A|K9J7X8/.test(bStud.body)} hasBeB=${/Bé B|2F55FQ/.test(bStud.body)}`);
  const bProg = await visit(page, `/admin/classes/${TEST_CLASS}/progress`, ti);
  log(`[B.progress] http=${bProg.http} err=${bProg.err}`);

  // ── D — questions/new render, exams/new builder, assignments ──
  const dq = await visit(page, "/admin/questions/new", ti);
  log(`[D.questions/new] http=${dq.http} err=${dq.err} formRendered=${/Loại|Nội dung|đáp án|lựa chọn|câu hỏi/i.test(dq.body)}`);
  const dexam = await visit(page, "/admin/exams/new", ti);
  log(`[D.exams/new] http=${dexam.http} err=${dexam.err}`);
  const dass = await visit(page, "/admin/assignments", ti);
  log(`[D.assignments] http=${dass.http} err=${dass.err}`);

  // ── A — list/trial (render) ──
  const aList = await visit(page, "/admin/leads", ti);
  log(`[A.list] http=${aList.http} err=${aList.err}`);
  const aTrial = await visit(page, "/admin/trial-classes", ti);
  log(`[A.trial] http=${aTrial.http} err=${aTrial.err}`);

  // ══ CREATES (best-effort, cap 30s/action, try/catch) ══
  // B — tạo phòng __TEST__ (name attrs reliable)
  try {
    await page.goto("/admin/rooms/new", { waitUntil: "domcontentloaded", timeout: 150_000 });
    await page.locator("input[name='name']").fill(`__TEST__ ${STAMP} Phòng`);
    await page.locator("input[name='code']").fill(`TST${STAMP}1`);
    const org = page.locator("select[name='orgUnitId']");
    await org.selectOption({ index: 1 }).catch(async () => org.selectOption({ index: 0 }));
    await page.locator("input[name='capacity']").fill("12");
    await page.getByRole("button", { name: /Lưu|Tạo|Thêm|Cập nhật/ }).first().click();
    await page.waitForTimeout(2500);
    log(`[B.room.create] url=${page.url()} rời/new=${!/rooms\/new/.test(page.url())}`);
  } catch (e) { log(`[B.room.create] FLAG: ${String(e).slice(0, 100)}`); }
  const bRooms = await visit(page, "/admin/rooms", ti);
  log(`[B.rooms.list] http=${bRooms.http} hasTestRoom=${/__TEST__/.test(bRooms.body)}`);

  // A — tạo lead __TEST__
  try {
    await page.goto("/admin/leads/new", { waitUntil: "domcontentloaded", timeout: 150_000 });
    await page.locator("form input:not([type='hidden'])").first().fill(`__TEST__ ${STAMP} Lead`, { timeout: 25_000 });
    await page.getByPlaceholder("09xxxxxxxx").fill("0900000777");
    await page.getByRole("button", { name: /Lưu|Tạo|Thêm/ }).first().click();
    await page.waitForTimeout(2500);
    log(`[A.lead.create] url=${page.url()} rời/new=${!/leads\/new/.test(page.url())}`);
  } catch (e) { log(`[A.lead.create] FLAG: ${String(e).slice(0, 100)}`); }

  log("[DEEP] done");
});
