// @vitest-environment node
/**
 * Cổng dữ liệu agent — ĐỢT 1 (26/09/2026) — 7 công cụ đọc mới + nghiệp vụ Chính sách khuyến mãi,
 * trên Postgres THẬT.
 *
 * Mỗi công cụ đi TRỌN 13 bước của cổng (`xuLyGoiCongCu` với `Request` thật): token, grant, phạm vi
 * cơ sở, `can()` của user dịch vụ, khuôn đầu ra — rồi đầu ra được đưa qua MÁY KIỂM CỦA XƯỞNG
 * (`kiem-khuon.mjs`). Không mock tầng quyền, không mock DB.
 *
 * Dữ liệu đặt ở năm 2098–2099 (ngày TUYỆT ĐỐI truyền qua tham số — luật 19: không đọc đồng hồ
 * thật cho logic ngày) và mang tiền tố `CI_D1_` / `CI.D1.` / `CID1` để dọn đúng phần của mình.
 *
 * ⚠️ AN TOÀN DB: không `resetDb()`, không TRUNCATE.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ success: true, remaining: 999, resetAt: Date.now() + 60_000 }),
}));

import { db } from "../../lib/db";
import { assertTestDb, disconnectDb, seedOrg, seedRoles, seedUser } from "../e2e/_helpers/seed";
import { RUN_DB_TESTS } from "../_helpers/db-gate";
import { xuLyCapToken } from "../../lib/agents/gateway/cap-token";
import { xuLyGoiCongCu } from "../../lib/agents/gateway/pipeline";
import { taoClient, quyetDinhClient, sinhMatKhau } from "../../lib/agents/quan-tri/client";
import { taoGrant, quyetDinhGrant } from "../../lib/agents/quan-tri/grant";
import type { NguoiThaoTac } from "../../lib/agents/quan-tri/chung";
import {
  LoiKhuyenMai,
  banHanhChinhSach,
  batTatVoucher,
  suaChinhSach,
  themVoucher,
  thuHoiChinhSach,
} from "../../lib/khuyen-mai/chinh-sach";

const RUN = RUN_DB_TESTS;
if (!RUN) console.warn("[cong-cu-dot1] SKIP: DATABASE_URL không trỏ Postgres local (hoặc thiếu ALLOW_DB_RESET).");

const P = "CI_D1_";
const PEPPER = "pepper-ci-cong-agent-dot1-0123456789-abcdef";
const ENV = { AGENT_GATEWAY_PEPPER: PEPPER };
const IP = "203.0.113.21";
const HOOK = 240_000;
const CA = 60_000;
const NGAY = 24 * 60 * 60 * 1000;
const sau = (n: number) => new Date(Date.now() + n * NGAY);

let KT: NguoiThaoTac;
let GD: NguoiThaoTac;
const ID: Record<string, string> = {};

// ─── Gọi cổng ──────────────────────────────────────────────────────────────────────
async function dungClient(ten: string, congCu: string[], coSo: string[]) {
  const now = new Date();
  const { id } = await taoClient(
    KT,
    { ten: `${P}${ten}`, ipDuocPhep: [IP], vaiDichVu: "AGENT_CHI_DOC", hetHan: sau(60), lyDo: "Ca kiểm thử Đợt 1" },
    now,
  );
  await quyetDinhClient(GD, { id, dongY: true }, now);
  const { matKhau } = await sinhMatKhau(KT, { id }, now);
  for (const cc of congCu) {
    const g = await taoGrant(
      KT,
      { clientId: id, congCu: cc, coSo, xemDuLieuGoc: false, hetHan: sau(30), lyDo: "Ca kiểm thử Đợt 1" },
      now,
    );
    await quyetDinhGrant(GD, { id: g.id, dongY: true }, now);
  }
  const res = await xuLyCapToken(
    new Request("http://localhost/api/agent/v1/oauth/token", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${id}:${matKhau}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        "x-e2e-client-ip": IP,
      },
      body: "grant_type=client_credentials",
    }),
    ENV,
  );
  const b = (await res.json()) as { access_token?: string };
  expect(res.status, JSON.stringify(b)).toBe(200);
  return b.access_token!;
}

type PhanHoi = { status: number; body: { du_lieu?: unknown; meta?: Record<string, unknown>; loi?: { ma: string } } };

async function goi(token: string, ten: string, thamSo: unknown = {}): Promise<PhanHoi> {
  const res = await xuLyGoiCongCu(
    new Request(`http://localhost/api/agent/v1/tools/${ten}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-e2e-client-ip": IP },
      body: JSON.stringify({ tham_so: thamSo }),
    }),
    ten,
    ENV,
  );
  return { status: res.status, body: (await res.json()) as PhanHoi["body"] };
}

/** Máy kiểm của xưởng — đầu ra THẬT phải ĐẠT, không chỉ zod của mình. */
function kiemKhuonXuong(ten: string, body: unknown) {
  const tep = join(mkdtempSync(join(tmpdir(), "d1-")), "phan-hoi.json");
  writeFileSync(tep, JSON.stringify(body));
  const r = spawnSync(process.execPath, [resolve(process.cwd(), "tests/agents/khuon-xuong/cong-cu/kiem-khuon.mjs"), ten, tep], {
    encoding: "utf8",
  });
  expect(r.status, r.stdout + r.stderr).toBe(0);
}

// ─── Dọn ───────────────────────────────────────────────────────────────────────────
async function cleanup() {
  const clients = await db.agentClient.findMany({ where: { name: { startsWith: P } }, select: { id: true, serviceUserId: true } });
  const cids = clients.map((c) => c.id);
  if (cids.length) {
    await db.agentAccessToken.deleteMany({ where: { clientId: { in: cids } } });
    await db.agentClientSecret.deleteMany({ where: { clientId: { in: cids } } });
    await db.agentGrant.deleteMany({ where: { clientId: { in: cids } } });
    await db.agentToolCall.deleteMany({ where: { clientId: { in: cids } } });
    await db.agentClient.deleteMany({ where: { id: { in: cids } } });
  }
  // Khuyến mãi
  const cs = await db.promotionPolicy.findMany({ where: { documentCode: { startsWith: "CI.D1." } }, select: { id: true } });
  const csIds = cs.map((c) => c.id);
  const vch = await db.voucher.findMany({ where: { OR: [{ code: { startsWith: "CID1" } }, { policyId: { in: csIds } }] }, select: { id: true } });
  const vIds = vch.map((v) => v.id);
  await db.voucherRedemption.deleteMany({ where: { voucherId: { in: vIds } } });
  await db.voucher.deleteMany({ where: { id: { in: vIds } } });
  await db.promotionPolicy.deleteMany({ where: { id: { in: csIds } } });
  // Nghiệp vụ
  const orders = await db.order.findMany({ where: { code: { startsWith: P } }, select: { id: true } });
  const oIds = orders.map((o) => o.id);
  await db.voucherRedemption.deleteMany({ where: { orderId: { in: oIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: oIds } } });
  await db.order.deleteMany({ where: { id: { in: oIds } } });
  const students = await db.student.findMany({ where: { name: { startsWith: P } }, select: { id: true } });
  const sIds = students.map((s) => s.id);
  const enr = await db.enrollment.findMany({ where: { studentId: { in: sIds } }, select: { id: true } });
  await db.refundRequest.deleteMany({ where: { enrollmentId: { in: enr.map((e) => e.id) } } });
  await db.enrollment.deleteMany({ where: { studentId: { in: sIds } } });
  await db.student.deleteMany({ where: { id: { in: sIds } } });
  await db.class.deleteMany({ where: { name: { startsWith: P } } });
  await db.trialClassV2.deleteMany({ where: { code: { startsWith: P } } });
  await db.lead.deleteMany({ where: { parentName: { startsWith: P } } });
  await db.course.deleteMany({ where: { slug: { startsWith: "ci-d1-" } } });
  await db.leadTarget.deleteMany({ where: { period: { in: ["2099-02"] } } });
  const nv = await db.employee.findMany({ where: { employeeCode: { startsWith: P } }, select: { id: true } });
  // Người
  const nguoi = await db.user.findMany({
    where: { OR: [{ email: { startsWith: P.toLowerCase() } }, { id: { in: clients.map((c) => c.serviceUserId) } }] },
    select: { id: true },
  });
  const uIds = nguoi.map((u) => u.id);
  if (uIds.length) {
    await db.staffNotification.deleteMany({ where: { userId: { in: uIds } } });
    await db.userOrgRole.deleteMany({ where: { userId: { in: uIds } } });
    await db.user.deleteMany({ where: { id: { in: uIds } } });
  }
  await db.employee.deleteMany({ where: { id: { in: nv.map((n) => n.id) } } });
  await db.systemSetting.deleteMany({
    where: { key: { in: ["crm.targetLeadToTrialRate", "crm.targetTrialToEnrollRate"] } },
  });
}

async function vai(code: string) {
  return (await db.roleDef.findUniqueOrThrow({ where: { code }, select: { id: true } })).id;
}

async function nguoiCoVai(ten: string, code: string, orgUnit: string, employeeId?: string) {
  const u = await seedUser({ email: `${P.toLowerCase()}${ten}@ci.test`, name: `${P}${ten}`, role: "SALES_CSM" });
  if (employeeId) await db.user.update({ where: { id: u.id }, data: { employeeId } });
  await db.userOrgRole.create({ data: { userId: u.id, orgUnitId: ID[orgUnit]!, roleId: await vai(code), grantedById: KT.userId } });
  return u.id;
}

describe.skipIf(!RUN)("Cổng dữ liệu agent · Đợt 1 — 7 công cụ + chính sách khuyến mãi (Postgres thật)", () => {
  beforeAll(async () => {
    assertTestDb();
    process.env.AGENT_GATEWAY_PEPPER = PEPPER;
    await cleanup();
    await seedOrg(["HO", "CS1", "CS2"]);
    await seedRoles();
    const kt = await seedUser({ email: `${P.toLowerCase()}kt@ci.test`, name: `${P}Kỹ thuật`, role: "SUPER_ADMIN" });
    const gd = await seedUser({ email: `${P.toLowerCase()}gd@ci.test`, name: `${P}Giám đốc`, role: "SUPER_ADMIN" });
    KT = { userId: kt.id, ten: `${P}Kỹ thuật` };
    GD = { userId: gd.id, ten: `${P}Giám đốc` };

    for (const code of ["HO", "CS1", "CS2"]) {
      const u = await db.orgUnit.findUniqueOrThrow({ where: { code }, select: { id: true, centerId: true } });
      ID[code] = u.id;
      if (u.centerId) ID[`c_${code}`] = u.centerId;
    }
    const c1 = ID.c_CS1!;
    const c2 = ID.c_CS2!;

    // ── Khoá học
    const sata4 = await db.course.create({
      data: { slug: "ci-d1-sata4", code: "CID1SATA4", name: "CI D1 Sata 4", price: 11_520_000, totalSessions: 48, ageRange: "Lớp 3 – 4", isTeachable: true, isActive: true },
    });
    await db.course.create({
      data: { slug: "ci-d1-sata8", code: "CID1SATA8", name: "CI D1 Sata 8", price: 13_000_000, totalSessions: 48, ageRange: null, isTeachable: true, isActive: false },
    });
    await db.course.create({
      data: { slug: "ci-d1-landing", code: "CID1LANDING", name: "CI D1 Landing", price: 1, isTeachable: false, isActive: true },
    });
    ID.sata4 = sata4.id;
    const rbs = await db.course.create({
      data: { slug: "ci-d1-rbs", code: "CID1RBS", name: "CI D1 RoboSim", price: 3_600_000, totalSessions: 9, isTeachable: true, isActive: true },
    });

    // ── Nhân sự: CS1 (GV + vai marketing HO chồng thêm), CS2, Hội sở, người đã nghỉ, người không tài khoản
    const nv = async (code: string, centerId: string | null, status: "ACTIVE" | "RESIGNED" = "ACTIVE") =>
      (
        await db.employee.create({
          data: { employeeCode: `${P}${code}`, fullName: `${P}Tên ${code}`, jobTitle: "x", department: "DAO_TAO", centerId, status },
        })
      ).id;
    const gv1 = await nv("GV1", c1);
    const nv2 = await nv("NV2", c2);
    const nvHo = await nv("HO1", null);
    await nv("NGHI", c1, "RESIGNED");
    await nv("KHONGTK", c1);
    // Nhân sự CS1 mà vai DUY NHẤT neo ở CS2 (kiêm nhiệm/điều chuyển) — rà 26/09, AGT-D1-01.
    const nvLech = await nv("LECH", c1);
    const uGv1 = await nguoiCoVai("gv1", "TEACHER", "CS1", gv1);
    await db.userOrgRole.create({ data: { userId: uGv1, orgUnitId: ID.HO!, roleId: await vai("HO_MARKETING"), grantedById: KT.userId } });
    await nguoiCoVai("nv2", "CENTER_SALES_CSM", "CS2", nv2);
    await nguoiCoVai("nvho", "GIAM_DOC", "HO", nvHo);
    await nguoiCoVai("lech", "CENTER_MANAGER", "CS2", nvLech);

    // ── Người tra cứu khuyến mãi (nhận thông báo)
    ID.saleCs1 = await nguoiCoVai("sale-cs1", "CENTER_SALES_CSM", "CS1");
    ID.saleCs2 = await nguoiCoVai("sale-cs2", "CENTER_SALES_CSM", "CS2");
    ID.mktHo = await nguoiCoVai("mkt-ho", "HO_MARKETING", "HO");

    // ── Chỉ tiêu tháng 2099-02
    await db.leadTarget.createMany({
      data: [
        { centerId: c1, period: "2099-02", targetCount: 18 },
        { centerId: c2, period: "2099-02", targetCount: 14 },
        { centerId: null, period: "2099-02", targetCount: 40 },
      ],
    });

    // ── Tuyển sinh CS1 (khoảng 2099-01-01 → 2099-01-31)
    const lead = async (ten: string, centerId: string) => {
      const l = await db.lead.create({ data: { parentName: `${P}${ten}`, phone: `0999${String(Object.keys(ID).length).padStart(6, "0")}`, centerId } });
      const ch = await db.leadChild.create({ data: { leadId: l.id, fullName: `${P}Bé ${ten}` } });
      ID[`lead_${ten}`] = l.id;
      return ch.id;
    };
    const beA = await lead("A", c1);
    const beB = await lead("B", c1);
    const beC = await lead("C", c1);
    const beD = await lead("D", c2);
    const beF = await lead("F", c1);
    const lopTrial = async (code: string, centerId: string, ngay: string, courseId: string | null = null) => {
      const t = await db.trialClassV2.create({ data: { code: `${P}${code}`, name: `${P}${code}`, centerId, sessionCount: 1, courseId } });
      await db.trialClassSession.create({
        data: { trialClassId: t.id, seq: 1, date: new Date(`${ngay}T00:00:00Z`), startTime: "18:00", endTime: "19:30" },
      });
      return t.id;
    };
    const t1 = await lopTrial("T1", c1, "2099-01-10");
    const t0 = await lopTrial("T0", c1, "2098-12-20");
    await db.trialEnrollment.create({ data: { trialClassId: t1, leadChildId: beA } });
    // Lượt học thử ĐÃ XONG ⇒ COMPLETED (DB chỉ cho MỘT lượt ACTIVE mỗi bé — `TrialEnrollment_leadChildId_active_key`).
    await db.trialEnrollment.create({ data: { trialClassId: t0, leadChildId: beB, status: "COMPLETED" } });
    await db.leadTrialHistory.create({
      data: { leadChildId: beB, trialClassId: t0, centerId: c1, totalSessions: 1, attendedCount: 1, firstAttendedAt: new Date("2098-12-20T11:00:00Z") },
    });
    // Bé B còn học thử một KHOÁ KHÁC (RoboSim) sớm hơn — không được gán sang dòng ghi danh Sata 4 (AGT-01).
    await db.trialEnrollment.create({ data: { trialClassId: await lopTrial("TR", c1, "2098-12-01", rbs.id), leadChildId: beB, status: "COMPLETED" } });
    // Bé F: ghi danh Sata 4 TRONG khoảng + hẹn học thử RoboSim trong khoảng ⇒ HAI dòng (AGT-02).
    await db.trialEnrollment.create({ data: { trialClassId: await lopTrial("TF", c1, "2099-01-12", rbs.id), leadChildId: beF } });

    const lop = async (ten: string, centerId: string) =>
      (await db.class.create({ data: { name: `${P}${ten}`, courseId: sata4.id, centerId } })).id;
    const lop1 = await lop("L1", c1);
    const lop2 = await lop("L2", c2);
    const hv = async (ten: string) => (await db.student.create({ data: { name: `${P}${ten}` } })).id;
    const eB = await db.enrollment.create({
      data: { studentId: await hv("B"), classId: lop1, courseId: sata4.id, centerId: c1, leadChildId: beB, listPrice: 11_520_000, enrolledAt: new Date("2099-01-15T02:00:00Z") },
    });
    const eC = await db.enrollment.create({
      data: {
        studentId: await hv("C"), classId: lop1, courseId: sata4.id, centerId: c1, leadChildId: beC, status: "STUDYING",
        listPrice: 11_520_000, enrolledAt: new Date("2098-11-01T02:00:00Z"), confirmedAt: new Date("2098-11-01T02:00:00Z"),
      },
    });
    await db.refundRequest.create({
      data: {
        enrollmentId: eC.id, centerId: c1, trigger: "WITHDRAW", reason: "CI", paidConfirmed: 1, sessionsTotal: 48,
        sessionsLearned: 2, unitPrice: 1, proposedAmount: 1, approvedAmount: 1, status: "APPROVED", approvedAt: new Date("2099-01-20T02:00:00Z"),
      },
    });
    await db.enrollment.create({
      data: { studentId: await hv("D"), classId: lop2, courseId: sata4.id, centerId: c2, leadChildId: beD, enrolledAt: new Date("2099-01-16T02:00:00Z") },
    });
    await db.enrollment.create({
      data: { studentId: await hv("F"), classId: lop1, courseId: sata4.id, centerId: c1, leadChildId: beF, listPrice: 11_520_000, enrolledAt: new Date("2099-01-18T02:00:00Z") },
    });
    // Ghi danh tạo tay KHÔNG đi từ lead — phải bị bỏ.
    await db.enrollment.create({
      data: { studentId: await hv("E"), classId: lop1, courseId: sata4.id, centerId: c1, enrolledAt: new Date("2099-01-17T02:00:00Z") },
    });
    ID.eB = eB.id;

    // Voucher đã dùng trên đơn của bé B ⇒ `van_ban_khuyen_mai` = mã văn bản.
    const csDon = await banHanhChinhSach(
      GD,
      {
        maVanBan: "CI.D1.QD.DON", ten: "CI chính sách của đơn", noiDungUuDai: "Giảm 10% cho khách CI.", dieuKien: null,
        tuNgay: "2099-01-01", denNgay: "2099-01-31", coSo: [], khoaHoc: [], tep: null,
      },
      new Date("2099-01-01T01:00:00Z"),
    );
    const v = await themVoucher(
      GD,
      { chinhSachId: csDon.id, ma: "CID1DON", kieu: "PERCENT", phanTram: 10, soTien: null, giamToiDa: null, donToiThieu: 0, soLuong: null, ghiChu: null },
      new Date("2099-01-02T01:00:00Z"),
    );
    const don = await db.order.create({ data: { code: `${P}DON1`, type: "COURSE", customerName: "CI", customerPhone: "0999000001", centerId: c1 } });
    await db.orderItem.create({
      data: { orderId: don.id, type: "COURSE_ENROLLMENT", itemName: "Sata 4", unitPrice: 1, totalPrice: 1, enrollmentId: eB.id },
    });
    await db.voucherRedemption.create({ data: { voucherId: v.id, orderId: don.id, customerPhone: "0999000001", discountApplied: 1 } });
  }, HOOK);

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await disconnectDb();
    }
  }, HOOK);

  // ─── Danh mục ─────────────────────────────────────────────────────────────────────
  it("[D1-KH] lay_khoa_hoc: chỉ khoá dạy thật, giá niêm yết = Course.price, lớp parse từ ageRange, lọc trạng thái", { timeout: CA }, async () => {
    const tk = await dungClient("kh", ["danh_muc.lay_khoa_hoc"], ["CS1"]);
    const r = await goi(tk, "danh_muc.lay_khoa_hoc");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    kiemKhuonXuong("danh_muc.lay_khoa_hoc", r.body);
    const ds = (r.body.du_lieu as { ma: string }[]).filter((k) => k.ma.startsWith("CID1"));
    expect(ds).toEqual(
      expect.arrayContaining([
        { ma: "CID1SATA4", ten: "CI D1 Sata 4", lop: [3, 4], so_buoi: 48, hoc_phi_niem_yet: 11_520_000, trang_thai: "dang_ban" },
        { ma: "CID1SATA8", ten: "CI D1 Sata 8", lop: [], so_buoi: 48, hoc_phi_niem_yet: 13_000_000, trang_thai: "tam_dung" },
      ]),
    );
    expect(ds.map((k) => k.ma)).not.toContain("CID1LANDING"); // isTeachable = false
    const ban = await goi(tk, "danh_muc.lay_khoa_hoc", { trang_thai: "dang_ban" });
    expect((ban.body.du_lieu as { ma: string }[]).map((k) => k.ma)).not.toContain("CID1SATA8");
  });

  it("[D1-NS] lay_nhan_su: chỉ 4 trường, lọc theo phạm vi grant, bỏ người đã nghỉ, chức danh = vai neo đúng chỗ", { timeout: CA }, async () => {
    const tk = await dungClient("ns", ["danh_muc.lay_nhan_su"], ["CS1"]);
    const r = await goi(tk, "danh_muc.lay_nhan_su");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    kiemKhuonXuong("danh_muc.lay_nhan_su", r.body);
    const ds = (r.body.du_lieu as Record<string, unknown>[]).filter((x) => String(x.id).startsWith(P));
    // Chỉ CS1; không CS2, không Hội sở; không người đã nghỉ.
    expect(ds.map((x) => x.id).sort()).toEqual([`${P}GV1`, `${P}KHONGTK`, `${P}LECH`]);
    // CHỈ bốn trường, với MỌI dòng (kể cả nhân sự của bộ test khác) — không SĐT/email/lương.
    for (const x of r.body.du_lieu as Record<string, unknown>[]) expect(Object.keys(x).sort()).toEqual(["chuc_danh", "co_so", "id", "ten"]);
    expect(ds.find((x) => x.id === `${P}GV1`)).toMatchObject({ chuc_danh: "TEACHER", co_so: "CS1" }); // TEACHER@CS1 thắng HO_MARKETING@HO
    expect(ds.find((x) => x.id === `${P}KHONGTK`)).toMatchObject({ chuc_danh: "" });
    // [AGT-D1-01] vai duy nhất neo ở CS2 ⇒ grant CS1 không được biết vai đó.
    expect(ds.find((x) => x.id === `${P}LECH`)).toMatchObject({ chuc_danh: "", co_so: "CS1" });
    const coNghi = await goi(tk, "danh_muc.lay_nhan_su", { bao_gom_da_nghi: true });
    expect((coNghi.body.du_lieu as { id: string }[]).map((x) => x.id)).toContain(`${P}NGHI`);
  });

  it("[D1-NS-B5] lay_nhan_su: xin co_so NGOÀI phạm vi grant ⇒ 403 NGOAI_PHAM_VI_CO_SO (không trả rỗng)", { timeout: CA }, async () => {
    const tk = await dungClient("ns-b5", ["danh_muc.lay_nhan_su"], ["CS1"]);
    const r = await goi(tk, "danh_muc.lay_nhan_su", { co_so: "CS2" });
    expect(r.status).toBe(403);
    expect(r.body.loi?.ma).toBe("NGOAI_PHAM_VI_CO_SO");
  });

  it("[D1-KN-CD] lay_kenh đủ 5 kênh liên lạc; lay_chuc_danh có vai người, KHÔNG có Phụ huynh / vai dịch vụ", { timeout: CA }, async () => {
    const tk = await dungClient("kn", ["danh_muc.lay_kenh", "danh_muc.lay_chuc_danh"], ["HO"]);
    const k = await goi(tk, "danh_muc.lay_kenh");
    expect(k.status).toBe(200);
    kiemKhuonXuong("danh_muc.lay_kenh", k.body);
    expect((k.body.du_lieu as { ma: string }[]).map((x) => x.ma).sort()).toEqual(["livechat", "manual", "messenger", "zalo_ca_nhan", "zalo_oa"]);
    const c = await goi(tk, "danh_muc.lay_chuc_danh");
    expect(c.status).toBe(200);
    kiemKhuonXuong("danh_muc.lay_chuc_danh", c.body);
    const ma = (c.body.du_lieu as { ma: string }[]).map((x) => x.ma);
    expect(ma).toEqual(expect.arrayContaining(["GIAM_DOC", "CENTER_SALES_CSM", "TEACHER"]));
    expect(ma).not.toContain("PARENT");
    expect(ma.some((m) => m.startsWith("AGENT_"))).toBe(false);
  });

  // ─── Kinh doanh ───────────────────────────────────────────────────────────────────
  it("[D1-CT] lay_chi_tieu: số học sinh theo cơ sở, NULL = Hội sở, cặp tỷ lệ chung; grant CS1 chỉ thấy CS1", { timeout: CA }, async () => {
    const tkHo = await dungClient("ct-ho", ["kinh_doanh.lay_chi_tieu"], ["HO"]);
    const r = await goi(tkHo, "kinh_doanh.lay_chi_tieu", { thang: "2099-02" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    kiemKhuonXuong("kinh_doanh.lay_chi_tieu", r.body);
    expect(r.body.du_lieu).toEqual([
      { co_so: "CS1", thang: "2099-02", hoc_vien_muc_tieu: 18, ty_le_lead_len_hoc_thu: 0.35, ty_le_hoc_thu_len_dang_ky: 0.45 },
      { co_so: "CS2", thang: "2099-02", hoc_vien_muc_tieu: 14, ty_le_lead_len_hoc_thu: 0.35, ty_le_hoc_thu_len_dang_ky: 0.45 },
      { co_so: "HO", thang: "2099-02", hoc_vien_muc_tieu: 40, ty_le_lead_len_hoc_thu: 0.35, ty_le_hoc_thu_len_dang_ky: 0.45 },
    ]);
    const tk1 = await dungClient("ct-cs1", ["kinh_doanh.lay_chi_tieu"], ["CS1"]);
    const r1 = await goi(tk1, "kinh_doanh.lay_chi_tieu", { thang: "2099-02" });
    expect((r1.body.du_lieu as { co_so: string }[]).map((x) => x.co_so)).toEqual(["CS1"]);
    expect((await goi(tk1, "kinh_doanh.lay_chi_tieu", { thang: "2099-13" })).body.loi?.ma).toBe("THAM_SO_SAI");
  });

  it("[D1-DK] lay_dang_ky: hẹn học thử / đăng ký (kể cả ACTIVE mặc định) / hoàn tiền; bỏ ghi danh không lead + cơ sở khác", { timeout: CA }, async () => {
    const tk = await dungClient("dk", ["kinh_doanh.lay_dang_ky"], ["CS1"]);
    const r = await goi(tk, "kinh_doanh.lay_dang_ky", { tu_ngay: "2099-01-01", den_ngay: "2099-01-31" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    kiemKhuonXuong("kinh_doanh.lay_dang_ky", r.body);
    const cua = new Set([ID.lead_A, ID.lead_B, ID.lead_C, ID.lead_D]);
    const ds = (r.body.du_lieu as Record<string, unknown>[]).filter((x) => cua.has(String(x.lead_id)));
    expect(ds).toHaveLength(3);
    expect(ds.find((x) => x.lead_id === ID.lead_A)).toMatchObject({
      khoa: "TRIAL_1_1", trang_thai: "da_hen_hoc_thu", ngay_hoc_thu: "2099-01-10", ngay_dang_ky: null, hoc_phi_niem_yet: 0, co_so: "CS1",
    });
    expect(ds.find((x) => x.lead_id === ID.lead_B)).toMatchObject({
      khoa: "CID1SATA4", trang_thai: "da_dang_ky", ngay_hoc_thu: "2098-12-20", ngay_dang_ky: "2099-01-15",
      hoc_phi_niem_yet: 11_520_000, van_ban_khuyen_mai: "CI.D1.QD.DON", co_so: "CS1",
    });
    expect(ds.find((x) => x.lead_id === ID.lead_C)).toMatchObject({ trang_thai: "hoan_tien", ngay_dang_ky: "2098-11-01" });
    // Không có thông tin cá nhân nào: mọi dòng chỉ mang trường của khuôn (+ khoa_quan_tam).
    const DUOC = new Set(["lead_id", "khoa", "trang_thai", "ngay_hoc_thu", "ngay_dang_ky", "hoc_phi_niem_yet", "van_ban_khuyen_mai", "co_so", "khoa_quan_tam"]);
    for (const x of r.body.du_lieu as Record<string, unknown>[]) for (const k of Object.keys(x)) expect(DUOC.has(k), k).toBe(true);
  });

  it("[D1-DK-B5] lay_dang_ky: co_so ngoài grant ⇒ 403; khoảng ngày ngược/quá trần ⇒ THAM_SO_SAI", { timeout: CA }, async () => {
    const tk = await dungClient("dk-b5", ["kinh_doanh.lay_dang_ky"], ["CS1"]);
    const b5 = await goi(tk, "kinh_doanh.lay_dang_ky", { tu_ngay: "2099-01-01", den_ngay: "2099-01-31", co_so: "CS2" });
    expect(b5.status).toBe(403);
    expect(b5.body.loi?.ma).toBe("NGOAI_PHAM_VI_CO_SO");
    expect((await goi(tk, "kinh_doanh.lay_dang_ky", { tu_ngay: "2099-02-01", den_ngay: "2099-01-01" })).body.loi?.ma).toBe("THAM_SO_SAI");
    expect((await goi(tk, "kinh_doanh.lay_dang_ky", { tu_ngay: "2099-01-01", den_ngay: "2099-12-31" })).body.loi?.ma).toBe("THAM_SO_SAI");
  });

  it("[D1-DK-HO] lay_dang_ky grant Hội sở (= toàn hệ thống) thấy cả ghi danh CS2", { timeout: CA }, async () => {
    const tk = await dungClient("dk-ho", ["kinh_doanh.lay_dang_ky"], ["HO"]);
    const r = await goi(tk, "kinh_doanh.lay_dang_ky", { tu_ngay: "2099-01-01", den_ngay: "2099-01-31" });
    expect((r.body.du_lieu as { lead_id: string; co_so: string }[]).find((x) => x.lead_id === ID.lead_D)).toMatchObject({ co_so: "CS2" });
    // [AGT-04] xin `co_so: "HO"` = toàn hệ thống (Hội sở không có ghi danh riêng) — bản đầu trả RỖNG.
    const ho = await goi(tk, "kinh_doanh.lay_dang_ky", { tu_ngay: "2099-01-01", den_ngay: "2099-01-31", co_so: "HO" });
    const coSo = new Set((ho.body.du_lieu as { lead_id: string; co_so: string }[]).filter((x) => x.lead_id === ID.lead_D || x.lead_id === ID.lead_B).map((x) => x.co_so));
    expect([...coSo].sort()).toEqual(["CS1", "CS2"]);
  });

  it("[D1-DK-KHOA] học thử theo ĐÚNG khoá: không gán ngày học thử khoá khác; ghi danh khoá này không xoá hẹn học thử khoá kia", { timeout: CA }, async () => {
    const tk = await dungClient("dk-khoa", ["kinh_doanh.lay_dang_ky"], ["CS1"]);
    const r = await goi(tk, "kinh_doanh.lay_dang_ky", { tu_ngay: "2099-01-01", den_ngay: "2099-01-31" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const ds = r.body.du_lieu as Record<string, unknown>[];
    // [AGT-01] Bé B: học thử RoboSim 01/12 sớm hơn, nhưng dòng Sata 4 chỉ mang học thử lớp CHUNG 20/12.
    expect(ds.find((x) => x.lead_id === ID.lead_B && x.khoa === "CID1SATA4")).toMatchObject({ ngay_hoc_thu: "2098-12-20" });
    // [AGT-02] Bé F: ghi danh Sata 4 + hẹn học thử RoboSim trong cùng khoảng ⇒ HAI dòng.
    const cuaF = ds.filter((x) => x.lead_id === ID.lead_F);
    expect(cuaF.map((x) => x.trang_thai).sort()).toEqual(["da_dang_ky", "da_hen_hoc_thu"]);
    expect(cuaF.find((x) => x.trang_thai === "da_hen_hoc_thu")).toMatchObject({ khoa: "TRIAL_1_1", khoa_quan_tam: "CID1RBS", ngay_hoc_thu: "2099-01-12" });
    expect(cuaF.find((x) => x.trang_thai === "da_dang_ky")).toMatchObject({ khoa: "CID1SATA4", ngay_hoc_thu: null });
  });

  it("[D1-QUYEN] gỡ `refunds:view` khỏi vai dịch vụ ⇒ lay_dang_ky 403 NGAY, dù grant còn (bước 10)", { timeout: CA }, async () => {
    const tk = await dungClient("quyen", ["kinh_doanh.lay_dang_ky"], ["CS1"]);
    const roleId = await vai("AGENT_CHI_DOC");
    await db.rolePermission.deleteMany({ where: { roleId, action: "refunds:view" } });
    try {
      const r = await goi(tk, "kinh_doanh.lay_dang_ky", { tu_ngay: "2099-01-01", den_ngay: "2099-01-31" });
      expect(r.status).toBe(403);
      expect(r.body.loi?.ma).toBe("KHONG_DU_QUYEN");
    } finally {
      await seedRoles();
    }
  });

  it("[D1-TRANG] phân trang: gioi_han=1 ⇒ tiep_theo; đi theo con trỏ ra dòng kế; con trỏ hỏng ⇒ THAM_SO_SAI", { timeout: CA }, async () => {
    const tk = await dungClient("trang", ["danh_muc.lay_kenh"], ["HO"]);
    const t1 = await goi(tk, "danh_muc.lay_kenh", { gioi_han: 2 });
    expect((t1.body.du_lieu as unknown[]).length).toBe(2);
    const conTro = t1.body.meta?.tiep_theo as string;
    expect(conTro).toBeTruthy();
    const t2 = await goi(tk, "danh_muc.lay_kenh", { gioi_han: 2, con_tro: conTro });
    expect((t2.body.du_lieu as { ma: string }[])[0]!.ma).not.toBe((t1.body.du_lieu as { ma: string }[])[0]!.ma);
    expect((await goi(tk, "danh_muc.lay_kenh", { con_tro: "rac!!" })).body.loi?.ma).toBe("THAM_SO_SAI");
  });

  // ─── Chính sách khuyến mãi — nghiệp vụ + công cụ 14 ───────────────────────────────
  describe("khuyến mãi", () => {
    const tao = (ma: string, tu: string, den: string, coSo: string[] = [], lanTao = "2098-01-01T01:00:00Z") =>
      banHanhChinhSach(
        GD,
        { maVanBan: ma, ten: `CI ${ma}`, noiDungUuDai: `Ưu đãi của ${ma}.`, dieuKien: null, tuNgay: tu, denNgay: den, coSo, khoaHoc: [], tep: null },
        new Date(lanTao),
      );

    it("[D1-SV-01] ban hành phạm vi CS1 ⇒ báo Sale CS1 + người neo Hội sở; KHÔNG báo Sale CS2, không báo người ban hành", { timeout: CA }, async () => {
      const r = await tao("CI.D1.QD.1", "2099-01-01", "2099-12-31", [ID.CS1!]);
      const nhan = await db.staffNotification.findMany({ where: { dedupeKey: `khuyen-mai.ban-hanh:${r.id}` }, select: { userId: true, href: true } });
      const ai = new Set(nhan.map((n) => n.userId));
      expect(ai.has(ID.saleCs1!)).toBe(true);
      expect(ai.has(ID.mktHo!)).toBe(true);
      expect(ai.has(ID.saleCs2!)).toBe(false);
      expect(ai.has(GD.userId)).toBe(false);
      expect(nhan[0]!.href).toBe(`/khuyen-mai/${r.id}`);
      expect(r.soNguoiDuocBao).toBe(nhan.length);
    });

    it("[D1-SV-02] trùng mã văn bản ⇒ TRUNG_MA, không tạo dòng thứ hai", { timeout: CA }, async () => {
      await tao("CI.D1.QD.TRUNG", "2099-01-01", "2099-12-31");
      await expect(tao("CI.D1.QD.TRUNG", "2099-01-01", "2099-12-31")).rejects.toMatchObject({ ma: "TRUNG_MA" });
      expect(await db.promotionPolicy.count({ where: { documentCode: "CI.D1.QD.TRUNG" } })).toBe(1);
    });

    it("[D1-SV-03] thu hồi ⇒ mọi mã bị tắt, báo Sale, không thu hồi lần hai; mã không bật lại/không thêm được", { timeout: CA }, async () => {
      const r = await tao("CI.D1.QD.6", "2099-01-01", "2099-12-31", [ID.CS1!]);
      const v = await themVoucher(
        GD,
        { chinhSachId: r.id, ma: "CID1THUHOI", kieu: "FIXED", phanTram: null, soTien: 300_000, giamToiDa: null, donToiThieu: 0, soLuong: 10, ghiChu: null },
        new Date("2099-01-05T01:00:00Z"),
      );
      await thuHoiChinhSach(GD, { id: r.id, lyDo: "Hết ngân sách chương trình CI" }, new Date("2099-02-10T08:00:00Z"));
      expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).isActive).toBe(false);
      const bao = await db.staffNotification.findFirst({ where: { dedupeKey: `khuyen-mai.thu-hoi:${r.id}`, userId: ID.saleCs1 } });
      expect(bao?.body).toContain("Hết ngân sách chương trình CI");
      await expect(thuHoiChinhSach(GD, { id: r.id, lyDo: "lần hai lần hai" }, new Date("2099-02-11T00:00:00Z"))).rejects.toMatchObject({ ma: "SAI_TRANG_THAI" });
      await expect(batTatVoucher(GD, { id: v.id, bat: true }, new Date("2099-02-11T00:00:00Z"))).rejects.toBeInstanceOf(LoiKhuyenMai);
      await expect(
        themVoucher(
          GD,
          { chinhSachId: r.id, ma: "CID1SAU", kieu: "PERCENT", phanTram: 5, soTien: null, giamToiDa: null, donToiThieu: 0, soLuong: null, ghiChu: null },
          new Date("2099-02-11T00:00:00Z"),
        ),
      ).rejects.toMatchObject({ ma: "SAI_TRANG_THAI" });
      await expect(suaChinhSach(GD, {
        id: r.id, maVanBan: "CI.D1.QD.6", ten: "x x x", noiDungUuDai: "Ưu đãi đã sửa lại.", dieuKien: null,
        tuNgay: "2099-01-01", denNgay: "2099-12-31", coSo: [], khoaHoc: [], tep: null,
      }, new Date("2099-02-11T00:00:00Z"))).rejects.toMatchObject({ ma: "SAI_TRANG_THAI" });
    });

    it("[D1-SV-04] sửa ngày hiệu lực ⇒ hiệu lực của MÃ đi theo (cùng transaction)", { timeout: CA }, async () => {
      const r = await tao("CI.D1.QD.SUA", "2099-01-01", "2099-06-30");
      const v = await themVoucher(
        GD,
        { chinhSachId: r.id, ma: "CID1SUA", kieu: "PERCENT", phanTram: 5, soTien: null, giamToiDa: 200_000, donToiThieu: 0, soLuong: null, ghiChu: null },
        new Date("2099-01-05T01:00:00Z"),
      );
      await suaChinhSach(GD, {
        id: r.id, maVanBan: "CI.D1.QD.SUA", ten: "CI sửa", noiDungUuDai: "Ưu đãi đã sửa lại.", dieuKien: null,
        tuNgay: "2099-02-01", denNgay: "2099-09-30", coSo: [], khoaHoc: [], tep: null,
      }, new Date("2099-01-10T00:00:00Z"));
      const sau = await db.voucher.findUniqueOrThrow({ where: { id: v.id } });
      expect(sau.validFrom.toISOString()).toBe("2099-01-31T17:00:00.000Z");
      expect(sau.validUntil.toISOString()).toBe("2099-09-30T16:59:59.999Z");
      await expect(
        themVoucher(
          GD,
          { chinhSachId: r.id, ma: "CID1SUA", kieu: "PERCENT", phanTram: 5, soTien: null, giamToiDa: null, donToiThieu: 0, soLuong: null, ghiChu: null },
          new Date("2099-02-05T01:00:00Z"),
        ),
      ).rejects.toMatchObject({ ma: "TRUNG_MA" });
    });

    it("[D1-SV-05] sửa LÙI ngày kết thúc về trước hôm nay ⇒ từ chối (phải dùng Thu hồi); giữ nguyên ngày cũ thì được", { timeout: CA }, async () => {
      const r = await tao("CI.D1.QD.LUI", "2099-01-01", "2099-06-30");
      const sua = (denNgay: string, now: string) =>
        suaChinhSach(GD, {
          id: r.id, maVanBan: "CI.D1.QD.LUI", ten: "CI lùi ngày", noiDungUuDai: "Ưu đãi của văn bản lùi ngày.", dieuKien: null,
          tuNgay: "2099-01-01", denNgay, coSo: [], khoaHoc: [], tep: null,
        }, new Date(now));
      // Hôm nay 10/03: đặt kết thúc 01/03 = dừng giữa chừng không lý do, không báo Sale.
      await expect(sua("2099-03-01", "2099-03-10T03:00:00Z")).rejects.toMatchObject({ ma: "DU_LIEU_SAI" });
      // Sửa chính tả sau khi văn bản đã hết hạn (ngày cũ giữ nguyên, đã qua) vẫn phải được.
      await expect(sua("2099-06-30", "2099-08-01T03:00:00Z")).resolves.toBeUndefined();
    });

    it("[D1-SV-07] tệp văn bản: URL do SERVER dựng từ khoá — URL client gửi (javascript:) bị bỏ", { timeout: CA }, async () => {
      const cu = { a: process.env.R2_ACCOUNT_ID, k: process.env.R2_ACCESS_KEY_ID, s: process.env.R2_SECRET_ACCESS_KEY, b: process.env.R2_BUCKET_NAME, u: process.env.R2_PUBLIC_URL };
      Object.assign(process.env, { R2_ACCOUNT_ID: "ci", R2_ACCESS_KEY_ID: "ci", R2_SECRET_ACCESS_KEY: "ci", R2_BUCKET_NAME: "ci", R2_PUBLIC_URL: "https://cdn.ci.test" });
      try {
        const { chinhSachSchema } = await import("../../lib/validators/khuyen-mai");
        // Đầu vào THÔ như form gửi lên (không phải bản đã parse — bản đã parse mang `dieuKien: null`
        // và parse lại sẽ hỏng vì lý do KHÁC, làm ca phủ định bên dưới xanh sai; lượt cấy lại 26/09 bắt được).
        const tho = {
          maVanBan: "CI.D1.QD.TEP", ten: "CI có tệp", noiDungUuDai: "Ưu đãi của văn bản có tệp.",
          tuNgay: "2099-01-01", denNgay: "2099-12-31",
          tep: { key: "uploads/documents/2099-01/sr-qd-tep-abc12345.pdf", ten: "SR.QD.TEP.pdf", url: "javascript:alert(1)" },
        };
        const r = await banHanhChinhSach(GD, chinhSachSchema.parse(tho), new Date("2099-01-01T01:00:00Z"));
        const dong = await db.promotionPolicy.findUniqueOrThrow({ where: { id: r.id } });
        expect(dong.fileUrl).toBe("https://cdn.ci.test/uploads/documents/2099-01/sr-qd-tep-abc12345.pdf");
        // Đối chứng dương: cùng đầu vào thô, chỉ đổi mã văn bản ⇒ HỢP LỆ (ca phủ định dưới không đỏ vì lý do khác).
        expect(chinhSachSchema.safeParse({ ...tho, maVanBan: "CI.D1.QD.TEP3" }).success).toBe(true);
        // Khoá ngoài thư mục tải lên ⇒ từ chối ngay ở khuôn.
        for (const key of ["javascript:alert(1)", "https://ke-xau.example/x.pdf", "uploads/videos/x.mp4", "../uploads/documents/x.pdf", "uploads/documents/../../x.pdf"]) {
          expect(chinhSachSchema.safeParse({ ...tho, maVanBan: "CI.D1.QD.TEP2", tep: { key, ten: "x" } }).success, key).toBe(false);
        }
      } finally {
        for (const [k, v] of Object.entries({ R2_ACCOUNT_ID: cu.a, R2_ACCESS_KEY_ID: cu.k, R2_SECRET_ACCESS_KEY: cu.s, R2_BUCKET_NAME: cu.b, R2_PUBLIC_URL: cu.u })) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }
    });

    it("[D1-KM] lay_khuyen_mai_hieu_luc: đang hiệu lực + hết trong 180 ngày; bỏ tương lai, hết lâu, chưa từng hiệu lực, cơ sở ngoài phạm vi", { timeout: CA }, async () => {
      // Bộ riêng của ca này (tiền tố CI.D1.KM.) — chạy MỘT MÌNH vẫn đủ dữ liệu (luật 18).
      await tao("CI.D1.KM.1", "2099-01-01", "2099-12-31", [ID.CS1!]); // đang hiệu lực, CS1
      await tao("CI.D1.KM.2", "2099-01-01", "2099-12-31", [ID.CS2!]); // chỉ CS2
      await tao("CI.D1.KM.3", "2098-06-01", "2098-12-31", [ID.CS1!]); // hết trong 180 ngày
      await tao("CI.D1.KM.4", "2098-01-01", "2098-02-01"); // hết quá 180 ngày
      await tao("CI.D1.KM.5", "2099-06-01", "2099-12-31"); // tương lai
      const r6 = await tao("CI.D1.KM.6", "2099-01-01", "2099-12-31"); // thu hồi giữa chừng
      await thuHoiChinhSach(GD, { id: r6.id, lyDo: "Dừng sớm theo chỉ đạo CI" }, new Date("2099-02-10T08:00:00Z"));
      const r7 = await tao("CI.D1.KM.7", "2099-04-01", "2099-12-31"); // thu hồi trước khi bắt đầu
      await thuHoiChinhSach(GD, { id: r7.id, lyDo: "Đổi kế hoạch trước khi chạy" }, new Date("2099-02-01T02:00:00Z"));

      const tk = await dungClient("km", ["van_ban.lay_khuyen_mai_hieu_luc"], ["CS1"]);
      const r = await goi(tk, "van_ban.lay_khuyen_mai_hieu_luc", { ngay: "2099-03-01" });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      kiemKhuonXuong("van_ban.lay_khuyen_mai_hieu_luc", r.body);
      const ds = (r.body.du_lieu as Record<string, unknown>[]).filter((x) => String(x.ma_van_ban).startsWith("CI.D1.KM."));
      const theoMa = new Map(ds.map((x) => [x.ma_van_ban, x]));
      expect([...theoMa.keys()].sort()).toEqual(["CI.D1.KM.1", "CI.D1.KM.3", "CI.D1.KM.6"]);
      expect(theoMa.get("CI.D1.KM.1")).toMatchObject({ trang_thai: "dang_hieu_luc", hieu_luc_tu: "2099-01-01", hieu_luc_den: "2099-12-31", ap_dung_co_so: ["CS1"] });
      expect(theoMa.get("CI.D1.KM.3")).toMatchObject({ trang_thai: "het_hieu_luc", hieu_luc_den: "2098-12-31" });
      // Thu hồi 15:00 ngày 10/02 (giờ VN) ⇒ ngày hiệu lực cuối là 09/02.
      expect(theoMa.get("CI.D1.KM.6")).toMatchObject({ trang_thai: "het_hieu_luc", hieu_luc_den: "2099-02-09", ap_dung_co_so: [] });

      const tkHo = await dungClient("km-ho", ["van_ban.lay_khuyen_mai_hieu_luc"], ["HO"]);
      const rHo = await goi(tkHo, "van_ban.lay_khuyen_mai_hieu_luc", { ngay: "2099-03-01" });
      const maHo = (rHo.body.du_lieu as { ma_van_ban: string }[]).map((x) => x.ma_van_ban).filter((m) => m.startsWith("CI.D1.KM."));
      expect(maHo.sort()).toEqual(["CI.D1.KM.1", "CI.D1.KM.2", "CI.D1.KM.3", "CI.D1.KM.6"]);

      // KM.7 thu hồi TRƯỚC ngày bắt đầu: hỏi ở một ngày SAU ngày bắt đầu (lọc thô theo validFrom
      // không còn loại nó) vẫn KHÔNG được hiện — nó chưa từng có hiệu lực ngày nào.
      const muon = await goi(tk, "van_ban.lay_khuyen_mai_hieu_luc", { ngay: "2099-05-01" });
      expect((muon.body.du_lieu as { ma_van_ban: string }[]).map((x) => x.ma_van_ban)).not.toContain("CI.D1.KM.7");
    });

    it("[D1-KM-FC] chính sách khai cơ sở mà cơ sở KHÔNG còn trên cây ⇒ không hiện ở phạm vi nào (không hoá 'toàn hệ thống')", { timeout: CA }, async () => {
      // Ghi thẳng DB: đường ban hành chặn id lạ (`kiemPhamVi`), nhưng cơ sở có thể bị gỡ khỏi cây SAU
      // khi văn bản đã ban hành — đó là ca này.
      await db.promotionPolicy.create({
        data: {
          documentCode: "CI.D1.FC.1",
          name: "CI cơ sở đã gỡ",
          benefitText: "Ưu đãi của cơ sở đã gỡ.",
          validFrom: new Date("2099-01-01T00:00:00Z"),
          validUntil: new Date("2099-12-31T00:00:00Z"),
          orgUnitIds: ["ou-khong-ton-tai"],
        },
      });
      const tkHo = await dungClient("km-fc", ["van_ban.lay_khuyen_mai_hieu_luc"], ["HO"]);
      const r = await goi(tkHo, "van_ban.lay_khuyen_mai_hieu_luc", { ngay: "2099-03-01" });
      expect(r.status).toBe(200);
      expect((r.body.du_lieu as { ma_van_ban: string }[]).map((x) => x.ma_van_ban)).not.toContain("CI.D1.FC.1");
    });

    it("[D1-KM-MA] mã voucher trả ra: chỉ mã ĐANG BẬT, kèm câu ưu đãi", { timeout: CA }, async () => {
      const r = await tao("CI.D1.QD.MA", "2099-01-01", "2099-12-31");
      await themVoucher(
        GD,
        { chinhSachId: r.id, ma: "CID1BAT", kieu: "PERCENT", phanTram: 10, soTien: null, giamToiDa: 500_000, donToiThieu: 0, soLuong: null, ghiChu: null },
        new Date("2099-01-05T01:00:00Z"),
      );
      const tat = await themVoucher(
        GD,
        { chinhSachId: r.id, ma: "CID1TAT", kieu: "FIXED", phanTram: null, soTien: 300_000, giamToiDa: null, donToiThieu: 0, soLuong: null, ghiChu: null },
        new Date("2099-01-05T01:00:00Z"),
      );
      await batTatVoucher(GD, { id: tat.id, bat: false }, new Date("2099-01-06T01:00:00Z"));
      const tk = await dungClient("km-ma", ["van_ban.lay_khuyen_mai_hieu_luc"], ["CS1"]);
      const out = await goi(tk, "van_ban.lay_khuyen_mai_hieu_luc", { ngay: "2099-03-01" });
      const dong = (out.body.du_lieu as { ma_van_ban: string; ma_voucher: unknown }[]).find((x) => x.ma_van_ban === "CI.D1.QD.MA");
      expect(dong?.ma_voucher).toEqual([{ ma: "CID1BAT", uu_dai: "Giảm 10% (tối đa 500.000 đ)" }]);
    });
  });
});
