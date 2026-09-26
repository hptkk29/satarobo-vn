// @vitest-environment node
/**
 * Cổng dữ liệu agent — Đợt 0 — bộ kiểm thử bảo mật trên Postgres THẬT (spec CEO §14.2).
 *
 * Gọi thẳng các hàm xử lý của route (`xuLyCapToken`, `xuLyGoiCongCu`…) bằng `Request` thật:
 * đi qua đủ 13 bước, đọc/ghi DB thật, không mock tầng quyền. Mã ca `[B<n>]` bám bảng 14.2.
 *
 * Ca KHÔNG có ở đây và vì sao:
 *   · B5 (xin co_so ngoài phạm vi): công cụ Đợt 0 (`lay_co_so`) không nhận tham số co_so.
 *     Luật nằm ở MỘT hàm thuần — phủ ở `lib/agents/gateway/kiem-grant.test.ts` [AG-GR-01].
 *     Công cụ Đợt 1 có co_so phải thêm ca B5 ở đây.
 *   · B14/B15 (ký yêu cầu, Idempotency-Key): thuộc Đợt 6 — chưa có công cụ ghi.
 *   · B16 (grep log/Sentry): phần "phản hồi lỗi không lặp giá trị đã gửi" có ở [B7]; phần
 *     Sentry cần hàm lọc — việc của đợt vận hành (E10).
 *   · B18 (ghi âm chưa báo khách): Đợt 5.
 *
 * ⚠️ AN TOÀN DB: không `resetDb()`, không TRUNCATE. Dọn theo tiền tố `CI_AG_`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

// Bộ này gọi endpoint token rất nhiều lần từ CÙNG một IP giả lập — trần lũ theo IP (30/phút)
// sẽ làm đỏ giả. Mặc định cho qua; ca nào cần kiểm lũ thì thêm tiền tố khoá vào `RL.chan`.
// Logic đếm thật của trần được kiểm riêng ở `lib/agents/gateway/ho-tro.test.ts` [AG-LU-01].
const RL = vi.hoisted(() => ({ chan: new Set<string>() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async ({ key }: { key: string }) =>
    [...RL.chan].some((p) => key.startsWith(p))
      ? { success: false, remaining: 0, resetAt: Date.now() + 30_000 }
      : { success: true, remaining: 999, resetAt: Date.now() + 60_000 },
}));

import { db } from "../../lib/db";
import { assertTestDb, disconnectDb, seedOrg, seedRoles, seedUser } from "../e2e/_helpers/seed";
import { RUN_DB_TESTS } from "../_helpers/db-gate";
import { xuLyCapToken, xuLyThuHoiToken } from "../../lib/agents/gateway/cap-token";
import { xuLyDanhSachCongCu, xuLyGoiCongCu } from "../../lib/agents/gateway/pipeline";
import { taoClient, quyetDinhClient, sinhMatKhau, thuHoiClient } from "../../lib/agents/quan-tri/client";
import { taoGrant, quyetDinhGrant, thuHoiGrant } from "../../lib/agents/quan-tri/grant";
import { datCongTac } from "../../lib/agents/quan-tri/cong-tac";
import { LoiQuanTri, type NguoiThaoTac } from "../../lib/agents/quan-tri/chung";
import { batDauCaiHaiLop, kiemMaHaiLop } from "../../lib/auth/hai-lop";
import { maTotp } from "../../lib/auth/totp";
import { layCoSo } from "../../lib/agents/tools/danh-muc/lay-co-so";
import { bamBiMat } from "../../lib/agents/khoa";

const RUN = RUN_DB_TESTS;
if (!RUN) console.warn("[cong-du-lieu] SKIP: DATABASE_URL không trỏ Postgres local (hoặc thiếu ALLOW_DB_RESET).");

const P = "CI_AG_";
const PEPPER = "pepper-ci-cong-agent-0123456789-abcdef";
const ENV = { AGENT_GATEWAY_PEPPER: PEPPER };
const IP_DUNG = "203.0.113.7";
const IP_LA = "198.51.100.9";
const HOOK = 180_000;
const CA = 60_000;

let KT: NguoiThaoTac; // Kỹ thuật — người tạo
let GD: NguoiThaoTac; // Giám đốc — người duyệt

// ─── Tiện ích gọi cổng ───────────────────────────────────────────────────────────────
function basic(id: string, mk: string): string {
  return `Basic ${Buffer.from(`${id}:${mk}`).toString("base64")}`;
}

async function xinToken(id: string, mk: string, opts: { scope?: string; ip?: string } = {}) {
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  if (opts.scope !== undefined) body.set("scope", opts.scope);
  const res = await xuLyCapToken(
    new Request("http://localhost/api/agent/v1/oauth/token", {
      method: "POST",
      headers: {
        authorization: basic(id, mk),
        "content-type": "application/x-www-form-urlencoded",
        "x-e2e-client-ip": opts.ip ?? IP_DUNG,
      },
      body: body.toString(),
    }),
    ENV,
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function goi(token: string | null, ten: string, than: unknown = { tham_so: {} }, ip = IP_DUNG) {
  const res = await xuLyGoiCongCu(
    new Request(`http://localhost/api/agent/v1/tools/${ten}`, {
      method: "POST",
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
        "x-e2e-client-ip": ip,
      },
      body: JSON.stringify(than),
    }),
    ten,
    ENV,
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, headers: res.headers };
}

function maLoi(body: Record<string, unknown>): string | undefined {
  return (body.loi as { ma?: string } | undefined)?.ma;
}

const NGAY = 24 * 60 * 60 * 1000;
const sau = (ngay: number) => new Date(Date.now() + ngay * NGAY);

/** Dựng trọn một client đã duyệt + có mật khẩu + có grant đã duyệt. */
async function dungClient(ten: string, coSo: string[] = ["CS1"]) {
  const now = new Date();
  const { id } = await taoClient(
    KT,
    { ten: `${P}${ten}`, ipDuocPhep: [IP_DUNG], vaiDichVu: "AGENT_CHI_DOC", hetHan: sau(60), lyDo: "Ca kiểm thử tự động" },
    now,
  );
  await quyetDinhClient(GD, { id, dongY: true }, now);
  const { matKhau } = await sinhMatKhau(KT, { id }, now);
  const g = await taoGrant(
    KT,
    { clientId: id, congCu: "danh_muc.lay_co_so", coSo, xemDuLieuGoc: false, hetHan: sau(30), lyDo: "Ca kiểm thử tự động" },
    now,
  );
  await quyetDinhGrant(GD, { id: g.id, dongY: true }, now);
  return { id, matKhau, grantId: g.id };
}

async function tokenCua(c: { id: string; matKhau: string }): Promise<string> {
  const r = await xinToken(c.id, c.matKhau);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.access_token as string;
}

async function datSetting(key: string, value: unknown) {
  await db.systemSetting.upsert({
    where: { key },
    create: { key, valueJson: value as never },
    update: { valueJson: value as never },
  });
}

// ─── Dọn ───────────────────────────────────────────────────────────────────────────
async function cleanup() {
  const clients = await db.agentClient.findMany({ where: { name: { startsWith: P } }, select: { id: true, serviceUserId: true } });
  const ids = clients.map((c) => c.id);
  const svc = clients.map((c) => c.serviceUserId);
  if (ids.length) {
    await db.agentAccessToken.deleteMany({ where: { clientId: { in: ids } } });
    await db.agentClientSecret.deleteMany({ where: { clientId: { in: ids } } });
    await db.agentGrant.deleteMany({ where: { clientId: { in: ids } } });
    await db.agentToolCall.deleteMany({ where: { clientId: { in: ids } } });
    await db.agentClient.deleteMany({ where: { id: { in: ids } } });
  }
  const nguoi = await db.user.findMany({ where: { email: { startsWith: P.toLowerCase() } }, select: { id: true } });
  const tatCa = [...svc, ...nguoi.map((u) => u.id)];
  if (tatCa.length) {
    await db.staffNotification.deleteMany({ where: { userId: { in: tatCa } } });
    await db.userOrgRole.deleteMany({ where: { userId: { in: tatCa } } });
    await db.user.deleteMany({ where: { id: { in: tatCa } } });
  }
  await db.systemSetting.deleteMany({ where: { key: { startsWith: "agentGateway." } } });
}

describe.skipIf(!RUN)("Cổng dữ liệu agent · Đợt 0 (Postgres thật)", () => {
  beforeAll(async () => {
    assertTestDb();
    process.env.AGENT_GATEWAY_PEPPER = PEPPER;
    process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    await cleanup();
    await seedOrg(["HO", "CS1", "CS2"]);
    await seedRoles();
    const kt = await seedUser({ email: `${P.toLowerCase()}kt@ci.test`, name: `${P}Kỹ thuật`, role: "SUPER_ADMIN" });
    const gd = await seedUser({ email: `${P.toLowerCase()}gd@ci.test`, name: `${P}Giám đốc`, role: "SUPER_ADMIN" });
    KT = { userId: kt.id, ten: `${P}Kỹ thuật` };
    GD = { userId: gd.id, ten: `${P}Giám đốc` };
    // Người duyệt giữ vai GIAM_DOC tại HO — để nhận báo khi agent bị tự khoá (B12).
    const [ho, vaiGd] = await Promise.all([
      db.orgUnit.findUniqueOrThrow({ where: { code: "HO" }, select: { id: true } }),
      db.roleDef.findUniqueOrThrow({ where: { code: "GIAM_DOC" }, select: { id: true } }),
    ]);
    await db.userOrgRole.create({ data: { userId: gd.id, orgUnitId: ho.id, roleId: vaiGd.id, grantedById: kt.id } });
  }, HOOK);

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await disconnectDb();
    }
  }, HOOK);

  beforeEach(async () => {
    await db.systemSetting.deleteMany({ where: { key: { startsWith: "agentGateway." } } });
  });

  // ─── Luồng thành công + khớp khuôn ──────────────────────────────────────────────
  it("[AG-OK-01] trọn luồng: token → lay_co_so → đúng vỏ, đúng khuôn, máy kiểm của xưởng ĐẠT", { timeout: CA }, async () => {
    const c = await dungClient("ok", ["HO"]);
    const token = await tokenCua(c);
    const r = await goi(token, "danh_muc.lay_co_so");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const meta = r.body.meta as Record<string, unknown>;
    expect(meta.cong_cu).toBe("danh_muc.lay_co_so");
    expect(meta.phien_ban_khuon).toBe("1.0");
    expect(String(meta.sinh_luc)).toMatch(/\+07:00$/);
    expect(meta.da_che_du_lieu).toBe(false);
    const ma = (r.body.du_lieu as { id: string }[]).map((x) => x.id);
    // "HO" trong grant = toàn hệ thống: Hội sở + mọi trung tâm.
    expect(ma).toEqual(expect.arrayContaining(["HO", "CS1", "CS2"]));
    expect(meta.so_ban_ghi).toBe(ma.length);

    const thuMuc = mkdtempSync(join(tmpdir(), "ag-"));
    const tep = join(thuMuc, "phan-hoi.json");
    writeFileSync(tep, JSON.stringify(r.body));
    const kiem = spawnSync(
      process.execPath,
      [resolve(process.cwd(), "tests/agents/khuon-xuong/cong-cu/kiem-khuon.mjs"), "danh_muc.lay_co_so", tep],
      { encoding: "utf8" },
    );
    expect(kiem.status, kiem.stdout + kiem.stderr).toBe(0);

    const nk = await db.agentToolCall.findUniqueOrThrow({ where: { id: meta.ma_yeu_cau as string } });
    expect(nk).toMatchObject({ clientId: c.id, tool: "danh_muc.lay_co_so", resultCode: "OK", httpStatus: 200, rowCount: ma.length });
    // Nhật ký KHÔNG giữ dữ liệu trả về: bảng không có cột nào như thế, và tham số chỉ là bản băm.
    expect(nk.paramsHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("[B6] grant chỉ CS1, không truyền co_so → chỉ trả CS1 (không Hội sở, không CS2)", { timeout: CA }, async () => {
    const c = await dungClient("b6", ["CS1"]);
    const r = await goi(await tokenCua(c), "danh_muc.lay_co_so");
    expect(r.status).toBe(200);
    expect((r.body.du_lieu as { id: string }[]).map((x) => x.id)).toEqual(["CS1"]);
    expect((r.body.meta as { pham_vi_co_so: string[] }).pham_vi_co_so).toEqual(["CS1"]);
  });

  it("[AG-LIST-01] danh sách công cụ chỉ gồm công cụ ĐƯỢC CẤP, kèm JSON Schema tham số", { timeout: CA }, async () => {
    const c = await dungClient("list");
    const res = await xuLyDanhSachCongCu(
      new Request("http://localhost/api/agent/v1/tools", {
        method: "POST",
        headers: { authorization: `Bearer ${await tokenCua(c)}`, "content-type": "application/json", "x-e2e-client-ip": IP_DUNG },
        body: "{}",
      }),
      ENV,
    );
    expect(res.status).toBe(200);
    const b = (await res.json()) as { du_lieu: { ten: string; ten_mcp: string; tham_so: unknown }[] };
    expect(b.du_lieu.map((x) => x.ten)).toEqual(["danh_muc.lay_co_so"]);
    expect(b.du_lieu[0]!.ten_mcp).toBe("danh_muc__lay_co_so");
    expect(b.du_lieu[0]!.tham_so).toMatchObject({ type: "object" });
  });

  // ─── Xác thực ───────────────────────────────────────────────────────────────────
  it("[B1] không token / token sai / token hết hạn → 401", { timeout: CA }, async () => {
    expect((await goi(null, "danh_muc.lay_co_so")).status).toBe(401);
    expect((await goi("sra_khong-ton-tai-khong-ton-tai-khong-ton-tai", "danh_muc.lay_co_so")).status).toBe(401);
    const c = await dungClient("b1");
    const token = await tokenCua(c);
    await db.agentAccessToken.updateMany({ where: { clientId: c.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await goi(token, "danh_muc.lay_co_so");
    expect(r.status).toBe(401);
    expect(maLoi(r.body)).toBe("TOKEN_KHONG_HOP_LE");
  });

  it("[B2] token thu hồi 1 giây trước → 401 ngay", { timeout: CA }, async () => {
    const c = await dungClient("b2");
    const token = await tokenCua(c);
    expect((await goi(token, "danh_muc.lay_co_so")).status).toBe(200);
    await xuLyThuHoiToken(
      new Request("http://localhost/api/agent/v1/oauth/revoke", { method: "POST", headers: { authorization: `Bearer ${token}` } }),
      ENV,
    );
    expect((await goi(token, "danh_muc.lay_co_so")).status).toBe(401);
  });

  it("[B3] khoá srk_live_ dùng ngoài production → 401 (kể cả khi bản băm CÓ trong DB)", { timeout: CA }, async () => {
    // Khoá live giả mà KHÔNG có trong DB thì đằng nào cũng 401 — ca đó xanh cả khi phép kiểm
    // môi trường bị gỡ (xanh vì lý do sai). Nên cấy một mật khẩu `srk_live_` CÓ THẬT, hợp lệ
    // mọi mặt khác, gắn vào client đang hoạt động: chỉ còn tiền tố môi trường chặn được nó.
    const c = await dungClient("b3");
    const live = "srk_live_" + "L".repeat(43);
    await db.agentClientSecret.create({
      data: { clientId: c.id, secretHash: bamBiMat(live, PEPPER), expiresAt: sau(10), createdById: KT.userId },
    });
    const r = await xinToken(c.id, live);
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("invalid_client");
    // Chiều ngược: client khai môi trường LIVE mà mật khẩu test vẫn đúng ⇒ cũng 401.
    await db.agentClient.update({ where: { id: c.id }, data: { environment: "LIVE" } });
    expect((await xinToken(c.id, c.matKhau)).status).toBe(401);
  });

  it("[AG-TK-01] sai mật khẩu → 401 chung chung, không nói sai phần nào", { timeout: CA }, async () => {
    const c = await dungClient("tk1");
    const r = await xinToken(c.id, "srk_test_" + "y".repeat(43));
    expect(r.status).toBe(401);
    expect(JSON.stringify(r.body)).not.toMatch(/mật khẩu sai|không tồn tại/i);
  });

  it("[AG-TK-03] mật khẩu ĐÚNG của client A đi kèm mã client B → 401 (không mượn khoá chéo)", { timeout: CA }, async () => {
    const a = await dungClient("tk3a");
    const b = await dungClient("tk3b");
    const r = await xinToken(b.id, a.matKhau);
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("invalid_client");
    // Đối chứng dương: đúng cặp thì qua.
    expect((await xinToken(a.id, a.matKhau)).status).toBe(200);
  });

  it("[AG-TK-02] xin scope vượt grant → 400 invalid_scope, không âm thầm cắt bớt", { timeout: CA }, async () => {
    const c = await dungClient("tk2");
    const r = await xinToken(c.id, c.matKhau, { scope: "danh_muc.lay_co_so:doc kinh_doanh.lay_leads:doc" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("invalid_scope");
    const ok = await xinToken(c.id, c.matKhau, { scope: "danh_muc.lay_co_so:doc" });
    expect(ok.status).toBe(200);
    expect(ok.body.scope).toBe("danh_muc.lay_co_so:doc");
  });

  // ─── Quyền ──────────────────────────────────────────────────────────────────────
  it("[B4] công cụ không tồn tại HOẶC có nhưng không (còn) được cấp → cùng 404", { timeout: CA }, async () => {
    const c = await dungClient("b4");
    const token = await tokenCua(c);
    expect(maLoi((await goi(token, "kinh_doanh.lay_leads")).body)).toBe("CONG_CU_KHONG_TON_TAI");
    // Thu hồi grant SAU khi token đã cấp — token vẫn sống, nhưng công cụ biến mất (X4).
    await thuHoiGrant(KT, { id: c.grantId, lyDo: "Ca kiểm thử B4 thu hồi" }, new Date());
    const r = await goi(token, "danh_muc.lay_co_so");
    expect(r.status).toBe(404);
    expect(maLoi(r.body)).toBe("CONG_CU_KHONG_TON_TAI");
  });

  it("[AG-HAN-01] grant ACTIVE nhưng quá hạn 1 giây → từ chối, không cần cron (luật cứng #8)", { timeout: CA }, async () => {
    const c = await dungClient("han");
    const token = await tokenCua(c);
    await db.agentGrant.update({ where: { id: c.grantId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await db.agentGrant.findUniqueOrThrow({ where: { id: c.grantId } })).status).toBe("ACTIVE");
    expect((await goi(token, "danh_muc.lay_co_so")).status).toBe(404);
    expect((await xinToken(c.id, c.matKhau)).body.error).toBe("invalid_scope");
  });

  it("[B7] tham số lạ → 422 với TÊN trường, không lặp giá trị; khoá lạ ở vỏ → 400", { timeout: CA }, async () => {
    const c = await dungClient("b7");
    const token = await tokenCua(c);
    const r = await goi(token, "danh_muc.lay_co_so", { tham_so: { xoa: "gia-tri-bi-mat-7" } });
    expect(r.status).toBe(422);
    expect(maLoi(r.body)).toBe("THAM_SO_SAI");
    expect(JSON.stringify(r.body)).not.toContain("gia-tri-bi-mat-7");
    const v = await goi(token, "danh_muc.lay_co_so", { tham_so: {}, xoa: true });
    expect(v.status).toBe(400);
  });

  it("[B9] gỡ vai của user dịch vụ (KHÔNG tạo DENY) → 403 ở lượt kế tiếp", { timeout: CA }, async () => {
    const c = await dungClient("b9");
    const token = await tokenCua(c);
    expect((await goi(token, "danh_muc.lay_co_so")).status).toBe(200);
    const cl = await db.agentClient.findUniqueOrThrow({ where: { id: c.id } });
    await db.userOrgRole.updateMany({ where: { userId: cl.serviceUserId }, data: { status: "SUSPENDED" } });
    const r = await goi(token, "danh_muc.lay_co_so");
    expect(r.status).toBe(403);
    expect(maLoi(r.body)).toBe("KHONG_DU_QUYEN");
  });

  it("[B9b] bước 10 TỰ ĐỨNG: công cụ không tự kiểm quyền thì cổng vẫn chặn khi user dịch vụ mất vai", { timeout: CA }, async () => {
    // Vì sao có ca này (cấy lỗi 25/09, phép M7): gỡ hẳn vòng `can()` ở bước 10 mà [B9] vẫn
    // xanh — `lay_co_so` tự gọi `can()` bên trong nên 403 đến từ CÔNG CỤ, không từ CỔNG. Công
    // cụ Đợt 1 không tự kiểm thì bước 10 không có ai canh. Ở đây thay phần chạy của công cụ
    // bằng một bản KHÔNG kiểm quyền gì: chỉ còn bước 10 đứng chắn.
    const c = await dungClient("b9b");
    const token = await tokenCua(c);
    const goc = layCoSo.chuanBi.bind(layCoSo);
    const spy = vi.spyOn(layCoSo, "chuanBi").mockImplementation((tho, hanMuc) => ({
      ...goc(tho, hanMuc),
      chay: async () => ({ duLieu: [], tiepTheo: null }),
    }));
    try {
      expect((await goi(token, "danh_muc.lay_co_so")).status, "đối chứng: còn vai thì qua").toBe(200);
      const cl = await db.agentClient.findUniqueOrThrow({ where: { id: c.id } });
      await db.userOrgRole.updateMany({ where: { userId: cl.serviceUserId }, data: { status: "SUSPENDED" } });
      const r = await goi(token, "danh_muc.lay_co_so");
      expect(r.status).toBe(403);
      expect(maLoi(r.body)).toBe("KHONG_DU_QUYEN");
    } finally {
      spy.mockRestore();
    }
  });

  it("[B10] người tạo tự duyệt client/grant → hệ thống từ chối", { timeout: CA }, async () => {
    const now = new Date();
    const { id } = await taoClient(
      KT,
      { ten: `${P}b10`, ipDuocPhep: [IP_DUNG], vaiDichVu: "AGENT_CHI_DOC", hetHan: sau(30), lyDo: "Ca kiểm thử B10 tự duyệt" },
      now,
    );
    await expect(quyetDinhClient(KT, { id, dongY: true }, now)).rejects.toMatchObject({ ma: "TU_DUYET" });
    expect((await db.agentClient.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
    // Đối chứng dương: người KHÁC duyệt được.
    await quyetDinhClient(GD, { id, dongY: true }, now);
    const g = await taoGrant(
      KT,
      { clientId: id, congCu: "danh_muc.lay_co_so", coSo: ["CS1"], xemDuLieuGoc: false, hetHan: sau(10), lyDo: "Ca kiểm thử B10 grant" },
      now,
    );
    await expect(quyetDinhGrant(KT, { id: g.id, dongY: true }, now)).rejects.toBeInstanceOf(LoiQuanTri);
    await quyetDinhGrant(GD, { id: g.id, dongY: true }, now);
  });

  it("[AG-CL-01] client CHỜ DUYỆT không sinh được mật khẩu; bản rõ chỉ trả một lần, DB chỉ giữ băm", { timeout: CA }, async () => {
    const now = new Date();
    const { id } = await taoClient(
      KT,
      { ten: `${P}cl1`, ipDuocPhep: [IP_DUNG], vaiDichVu: "AGENT_CHI_DOC", hetHan: sau(30), lyDo: "Ca kiểm thử client chờ duyệt" },
      now,
    );
    await expect(sinhMatKhau(KT, { id }, now)).rejects.toMatchObject({ ma: "SAI_TRANG_THAI" });
    await quyetDinhClient(GD, { id, dongY: true }, now);
    const { matKhau } = await sinhMatKhau(KT, { id }, now);
    expect(matKhau.startsWith("srk_test_")).toBe(true);
    const rows = await db.agentClientSecret.findMany({ where: { clientId: id } });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(matKhau.slice(9));
  });

  it("[AG-CL-02] xoay mật khẩu: cũ còn chạy trong chồng lấn ≤ 24 giờ, mới chạy ngay", { timeout: CA }, async () => {
    const c = await dungClient("cl2");
    const { matKhau: moi } = await sinhMatKhau(KT, { id: c.id }, new Date());
    expect((await xinToken(c.id, moi)).status).toBe(200);
    expect((await xinToken(c.id, c.matKhau)).status).toBe(200);
    const cu = await db.agentClientSecret.findMany({ where: { clientId: c.id }, orderBy: { createdAt: "asc" } });
    expect(cu[0]!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000 + 5000);
  });

  // ─── Phát hiện bất thường ───────────────────────────────────────────────────────
  it("[B11] token đúng gọi từ IP lạ → 403, đánh dấu nhật ký, client TỰ KHOÁ, token bị thu hồi", { timeout: CA }, async () => {
    const c = await dungClient("b11");
    const token = await tokenCua(c);
    const r = await goi(token, "danh_muc.lay_co_so", { tham_so: {} }, IP_LA);
    expect(r.status).toBe(403);
    expect(maLoi(r.body)).toBe("IP_KHONG_DUOC_PHEP");
    const nk = await db.agentToolCall.findFirstOrThrow({ where: { clientId: c.id, resultCode: "IP_KHONG_DUOC_PHEP" } });
    expect(nk.flagged).toBe(true);
    expect(nk.ip).toBe(IP_LA);
    expect((await db.agentClient.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("SUSPENDED");
    // Kể cả từ IP đúng, token cũ đã chết.
    expect((await goi(token, "danh_muc.lay_co_so")).status).toBe(401);
  });

  it("[B12] sai mật khẩu chạm ngưỡng trong 5 phút → TỰ KHOÁ + người duyệt nhận báo; mật khẩu đúng cũng bị chặn", { timeout: CA }, async () => {
    await datSetting("agentGateway.lockAfterAuthFailures", 3);
    const c = await dungClient("b12");
    for (let i = 0; i < 3; i++) {
      expect((await xinToken(c.id, "srk_test_" + String(i).repeat(43))).status).toBe(401);
    }
    expect((await db.agentClient.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("SUSPENDED");
    const r = await xinToken(c.id, c.matKhau);
    expect(r.status).toBe(401);
    expect(maLoi(r.body)).toBe("CLIENT_BI_KHOA");
    const bao = await db.staffNotification.findFirst({
      where: { userId: GD.userId, dedupeKey: { startsWith: `agent-gateway.tu-khoa:${c.id}:` } },
    });
    expect(bao, "người giữ GIAM_DOC phải nhận báo tự khoá").not.toBeNull();
  });

  it("[B13] tắt công tắc toàn cổng → 503 ngay ở cả token lẫn công cụ, không deploy; bật lại chạy tiếp", { timeout: CA }, async () => {
    const c = await dungClient("b13");
    const token = await tokenCua(c);
    await datCongTac(GD, { bat: false, lyDo: "Ca kiểm thử B13 tắt cổng" });
    const r = await goi(token, "danh_muc.lay_co_so");
    expect(r.status).toBe(503);
    expect(maLoi(r.body)).toBe("CONG_DANG_TAT");
    expect((await xinToken(c.id, c.matKhau)).status).toBe(503);
    await datCongTac(GD, { bat: true, lyDo: "Ca kiểm thử B13 bật lại" });
    expect((await goi(token, "danh_muc.lay_co_so")).status).toBe(200);
  });

  it("[B17] hàm nghiệp vụ trả lệch khuôn → 500 LECH_KHUON, KHÔNG có du_lieu", { timeout: CA }, async () => {
    const c = await dungClient("b17");
    const token = await tokenCua(c);
    const spy = vi.spyOn(layCoSo, "dungKhuon").mockReturnValue(false);
    try {
      const r = await goi(token, "danh_muc.lay_co_so");
      expect(r.status).toBe(500);
      expect(maLoi(r.body)).toBe("LECH_KHUON");
      expect(r.body).not.toHaveProperty("du_lieu");
    } finally {
      spy.mockRestore();
    }
  });

  it("[AG-TH-01] thu hồi client → mọi token/mật khẩu/grant chết, vai dịch vụ tạm dừng", { timeout: CA }, async () => {
    const c = await dungClient("th1");
    const token = await tokenCua(c);
    await thuHoiClient(GD, { id: c.id, lyDo: "Ca kiểm thử thu hồi client" }, new Date());
    expect((await goi(token, "danh_muc.lay_co_so")).status).toBe(401);
    expect((await xinToken(c.id, c.matKhau)).status).toBe(401);
    expect(await db.agentGrant.count({ where: { clientId: c.id, status: "ACTIVE" } })).toBe(0);
    const cl = await db.agentClient.findUniqueOrThrow({ where: { id: c.id } });
    expect(await db.userOrgRole.count({ where: { userId: cl.serviceUserId, status: "ACTIVE" } })).toBe(0);
  });

  it("[AG-SU-01] user dịch vụ không hiện như nhân sự đang làm việc, không có thông tin đăng nhập", { timeout: CA }, async () => {
    const c = await dungClient("su1");
    const cl = await db.agentClient.findUniqueOrThrow({ where: { id: c.id }, include: { serviceUser: true } });
    expect(cl.serviceUser).toMatchObject({
      isServiceAccount: true,
      isActive: false,
      accountStatus: "DISABLED",
      email: null,
      phone: null,
      password: null,
    });
  });

  // ─── Vá sau lượt rà bảo mật 25/09 ───────────────────────────────────────────────
  it("[AG-XT-01] thu hồi token khi THIẾU pepper → 500, KHÔNG trả 'ok' giả; token vẫn sống", { timeout: CA }, async () => {
    const c = await dungClient("xt01");
    const token = await tokenCua(c);
    const res = await xuLyThuHoiToken(
      new Request("http://localhost/api/agent/v1/oauth/revoke", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "x-e2e-client-ip": IP_DUNG },
      }),
      {}, // không có AGENT_GATEWAY_PEPPER
    );
    expect(res.status).toBe(500);
    expect(((await res.json()) as Record<string, unknown>).ok).toBeUndefined();
    // Không nói dối: token chưa bị thu hồi thì vẫn dùng được (khi pepper có lại).
    expect((await goi(token, "danh_muc.lay_co_so")).status).toBe(200);
  });

  it("[AG-XT-02] sai mật khẩu từ IP LẠ không đếm vào ngưỡng khoá — biết client_id không đủ để khoá agent thật", { timeout: CA }, async () => {
    await datSetting("agentGateway.lockAfterAuthFailures", 3);
    const c = await dungClient("xt02");
    for (let i = 0; i < 5; i++) {
      expect((await xinToken(c.id, "srk_test_" + String(i).repeat(43), { ip: IP_LA })).status).toBe(401);
    }
    expect((await db.agentClient.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("ACTIVE");
    // Vẫn để lại dấu vết bất thường trong nhật ký.
    expect(await db.agentToolCall.count({ where: { clientId: c.id, ip: IP_LA, flagged: true } })).toBe(5);
    // Đối chứng dương: agent thật vẫn lấy được token.
    expect((await xinToken(c.id, c.matKhau)).status).toBe(200);
  });

  it("[AG-LU-02] lũ theo IP bị chặn TRƯỚC mọi thứ: 429, không chạm DB, không ghi nhật ký", { timeout: CA }, async () => {
    const c = await dungClient("lu2");
    const truoc = await db.agentToolCall.count();
    RL.chan.add("agent-gw-token-ip:");
    try {
      const r = await xinToken(c.id, c.matKhau);
      expect(r.status).toBe(429);
      expect(r.body.error).toBe("temporarily_unavailable");
    } finally {
      RL.chan.delete("agent-gw-token-ip:");
    }
    RL.chan.add("agent-gw-ip:");
    try {
      const r = await goi("sra_bat-ky", "danh_muc.lay_co_so");
      expect(r.status).toBe(429);
      expect(r.headers.get("retry-after")).not.toBeNull();
    } finally {
      RL.chan.delete("agent-gw-ip:");
    }
    expect(await db.agentToolCall.count()).toBe(truoc);
  });

  it("[AG-2FA-02] hai lượt song song CÙNG một mã đúng → đúng một OK; lượt thua không bị tính là sai", { timeout: CA }, async () => {
    const u = await seedUser({ email: `${P.toLowerCase()}2fa-dua@ci.test`, name: `${P}2FA đua`, role: "SUPER_ADMIN" });
    const T0 = Date.now();
    const { biMat } = await batDauCaiHaiLop(u.id, "ci");
    expect(await kiemMaHaiLop(u.id, maTotp(biMat, T0), new Date(T0), "xac-nhan-cai")).toBe("OK");
    const T1 = T0 + 30_000;
    const ma = maTotp(biMat, T1);
    const kq = await Promise.all([kiemMaHaiLop(u.id, ma, new Date(T1)), kiemMaHaiLop(u.id, ma, new Date(T1))]);
    expect(kq.sort()).toEqual(["OK", "SAI"]);
    const row = await db.userTotp.findUniqueOrThrow({ where: { userId: u.id } });
    expect(row.failedCount).toBe(0);
    expect(row.lockedUntil).toBeNull();
  });

  // ─── Xác thực 2 lớp ─────────────────────────────────────────────────────────────
  it("[AG-2FA-01] cài → xác nhận → dùng; mã đã dùng không dùng lại; sai 5 lần thì tạm khoá", { timeout: CA }, async () => {
    const u = await seedUser({ email: `${P.toLowerCase()}2fa@ci.test`, name: `${P}2FA`, role: "SUPER_ADMIN" });
    const T0 = Date.now();
    const { biMat } = await batDauCaiHaiLop(u.id, "ci");
    expect(await kiemMaHaiLop(u.id, maTotp(biMat, T0), new Date(T0), "thao-tac")).toBe("CHUA_BAT");
    expect(await kiemMaHaiLop(u.id, maTotp(biMat, T0), new Date(T0), "xac-nhan-cai")).toBe("OK");
    const T1 = T0 + 30_000;
    const ma1 = maTotp(biMat, T1);
    expect(await kiemMaHaiLop(u.id, ma1, new Date(T1))).toBe("OK");
    expect(await kiemMaHaiLop(u.id, ma1, new Date(T1)), "phát lại cùng mã phải bị từ chối").toBe("SAI");
    const row = await db.userTotp.findUniqueOrThrow({ where: { userId: u.id } });
    expect(row.secretEnc).not.toContain(biMat);
    const T2 = T1 + 120_000;
    const saiMa = maTotp(biMat, T2) === "000000" ? "111111" : "000000";
    let kq = "";
    for (let i = 0; i < 5; i++) kq = await kiemMaHaiLop(u.id, saiMa, new Date(T2));
    expect(kq).toBe("TAM_KHOA");
    expect(await kiemMaHaiLop(u.id, maTotp(biMat, T2), new Date(T2)), "đang khoá thì mã đúng cũng không qua").toBe("TAM_KHOA");
  });
});
