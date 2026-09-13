// tests/cham-cong/sua-gio-quet-tay.spec.ts — BỐN CỔNG của `suaGioQuetTayAction`, trên Postgres THẬT.
//
// ─────────────────────────────────────────────────────────────────────────────
// VÌ SAO PHẢI LÀ CSDL THẬT, KHÔNG PHẢI HÀM THUẦN
//
// Điều đáng vỡ nhất ở đây là lời hứa **"dòng quét gốc BẤT BIẾN"**. Một hàm thuần không
// nhìn thấy điều đó — nó chỉ trả về danh sách dòng SẼ ghi. Chỉ CSDL thật mới trả lời được
// "sau lượt sửa, dòng cũ có còn nguyên từng cột không" (luật 9).
//
// Phần dựng dòng (thuần) đã có 25 ca ở `lib/cham-cong/sua-gio-quet.test.ts`. Bộ này kiểm
// bốn CỔNG và hệ quả trên DB, không lặp lại phần kia.
//
// ─────────────────────────────────────────────────────────────────────────────
// VÌ SAO MOCK `auth` / `checkPermission` / `resolveActor`
//
// Ba thứ đó là hạ tầng của Next + RBAC, không phải thứ bộ này canh. Mock chúng để ĐIỀU
// KHIỂN chính xác từng cổng — muốn kiểm "vai không có adjust bị từ chối" thì phải bật/tắt
// được đúng một quyền. Mọi thứ còn lại (`scopedDb`, `writeAudit`, engine, Prisma) đều THẬT.
//
// ⚠️ `resolveActor` mock trả actor SUPER_ADMIN để `scopedDb` không lọc — nếu không, mỗi ca
// test phải seed đủ cây OrgUnit + RoleDef + UserOrgRole, và khi đó bộ này lại đang kiểm
// RBAC chứ không kiểm bốn cổng.
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const isLocal =
  /(@|\/\/)(localhost|127\.0\.0\.1)[:/]/.test(DB_URL) &&
  /satarobo_test|ci_test/.test(DB_URL);
const d = isLocal ? describe : describe.skip;
if (!isLocal) {
  console.warn("[cham-cong/sua-gio-quet-tay] SKIP: DATABASE_URL không trỏ Postgres local");
}

const TAG = "cc-suagio";
const QL_ID = "cc-suagio-quanly";
const utc = (y: number, m: number, dd: number) => new Date(Date.UTC(y, m - 1, dd));
const NGAY = utc(2026, 9, 9);

/** Bảng quyền bật/tắt được cho từng ca test. */
const quyen = { adjust: true, closePeriod: false };

vi.mock("@/lib/auth", () => ({
  auth: async () => ({ user: { id: QL_ID, name: "Quản lý test" } }),
}));
vi.mock("@/lib/auth/check-permission", () => ({
  checkPermission: async (action: string) =>
    action === "hr_attendance:adjust"
      ? quyen.adjust
      : action === "hr_attendance:close-period"
        ? quyen.closePeriod
        : false,
}));
vi.mock("@/lib/auth/actor", () => ({
  resolveActor: async () => ({
    userId: QL_ID,
    isSuperAdmin: true,
    isHoLevel: true,
    orgRoles: [],
    permissions: [],
    visibleCenterIds: [],
    visibleOrgUnitIds: [],
    grantsAllow: new Set<string>(),
    assignedClassIds: new Set<string>(),
    guardianStudentIds: new Set<string>(),
    centerScope: "ALL",
  }),
}));
// ⚠️ Mock TỪNG PHẦN: `next/cache` còn được `lib/cache/safe-cache.ts` dùng cho
// `unstable_cache`. Thay cả module là chuỗi nhập chết ở một chỗ chẳng liên quan gì
// tới bộ này, và thông báo lỗi không chỉ về đây.
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: () => undefined,
}));

d("suaGioQuetTayAction — bốn cổng + lời hứa bất biến", () => {
  const db = new PrismaClient({ datasourceUrl: DB_URL });
  let cs1 = "";
  let nv = "";
  let tpl = "";
  let goc = ""; // id dòng quét GỐC
  let action: typeof import("../../app/(admin)/admin/cham-cong/_actions");

  async function donDep() {
    const us = await db.user.findMany({
      where: { email: { endsWith: `@${TAG}.test` } },
      select: { id: true },
    });
    const ids = [...us.map((u) => u.id), QL_ID];
    await db.auditLog.deleteMany({ where: { entityId: { startsWith: `${ids[0] ?? "x"}:` } } });
    await db.staffTimeLog.deleteMany({ where: { userId: { in: ids } } });
    await db.staffAttendanceDay.deleteMany({ where: { userId: { in: ids } } });
    await db.shiftAssignment.deleteMany({ where: { userId: { in: ids } } });
    await db.attendancePeriod.deleteMany({ where: { centerId: { in: [cs1].filter(Boolean) } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.center.deleteMany({ where: { code: `${TAG}-CS1` } });
    await db.shiftTemplate.deleteMany({ where: { code: `${TAG}-HC` } });
  }

  beforeAll(async () => {
    await donDep();
    const c = await db.center.create({
      data: { code: `${TAG}-CS1`, name: "CS1 sửa giờ", slug: `${TAG}-cs1`, address: "x" },
    });
    cs1 = c.id;
    const u = await db.user.create({
      data: { email: `nv@${TAG}.test`, name: "Nhân viên", role: "TEACHER" },
    });
    nv = u.id;
    await db.user.create({
      data: { id: QL_ID, email: `ql@${TAG}.test`, name: "Quản lý test", role: "CENTER_MANAGER" },
    });
    const t = await db.shiftTemplate.create({
      data: {
        code: `${TAG}-HC`,
        name: "Hành chính",
        // `ShiftTemplateKind`, KHÔNG phải `kind` của một đoạn trong `segments` — hai enum khác
        // nhau cùng tên trường, và Prisma chỉ báo "Invalid invocation" chứ không nói trúng chỗ.
        kind: "TIMED",
        segments: [{ start: "08:00", end: "17:30", kind: "WORK" }],
        defaultPlace: "ASSIGNED",
        attendanceMode: "REQUIRED",
        dayCredit: 1,
        isLeave: false,
        payMode: "SHIFT",
      },
    });
    tpl = t.id;
    action = await import("../../app/(admin)/admin/cham-cong/_actions");
  });

  afterAll(async () => {
    await donDep();
    await db.$disconnect();
  });

  beforeEach(async () => {
    quyen.adjust = true;
    quyen.closePeriod = false;
    await db.auditLog.deleteMany({ where: { entityId: `${nv}:2026-09-09` } });
    await db.staffTimeLog.deleteMany({ where: { userId: nv } });
    await db.attendancePeriod.deleteMany({ where: { centerId: cs1 } });
    await db.shiftAssignment.deleteMany({ where: { userId: nv } });
    await db.shiftAssignment.create({
      data: {
        userId: nv,
        centerId: cs1,
        workDate: NGAY,
        templateId: tpl,
        templateCode: `${TAG}-HC`,
        status: "ACTIVE",
        source: "PATTERN",
        // `ShiftAssignment.segments` là ẢNH CHỤP giờ của ca lúc xếp, không suy từ
        // `templateId` — bắt buộc, và fixture thiếu nó thì mọi ca đỏ ở `beforeEach`.
        segments: [{ start: "08:00", end: "17:30", kind: "WORK" }],
      },
    });
    // Dòng quét GỐC — thứ phải còn nguyên sau mọi lượt sửa.
    const g = await db.staffTimeLog.create({
      data: {
        userId: nv,
        centerId: cs1,
        direction: "CHECK_IN",
        loggedAt: new Date(Date.UTC(2026, 8, 9, 1, 32)), // 08:32 VN
        workDate: NGAY,
        source: "TICKET",
        result: "ACCEPTED",
        flags: ["TRUNG_2_PHUT"],
      },
    });
    goc = g.id;
  });

  const goiSua = (over: Record<string, unknown> = {}) =>
    action.suaGioQuetTayAction({
      userId: nv,
      workDate: "2026-09-09",
      gioVao: "08:00",
      gioRa: null,
      lyDo: "Quầy hỏng sáng 09/09, có mặt đúng giờ",
      ...over,
    });

  // ── LỜI HỨA TRUNG TÂM ───────────────────────────────────────────────────────
  it("dòng quét GỐC không đổi MỘT FIELD NÀO — so sánh toàn bộ bản ghi", async () => {
    const truoc = await db.staffTimeLog.findUniqueOrThrow({ where: { id: goc } });
    const r = await goiSua();
    expect(r.ok, `ok=${JSON.stringify(r)}`).toBe(true);

    const sau = await db.staffTimeLog.findUniqueOrThrow({ where: { id: goc } });
    // So TOÀN BỘ bản ghi, không chọn vài cột — chọn cột là chừa chỗ cho cột bị đổi lọt qua.
    expect(sau).toEqual(truoc);
  });

  it("lượt sửa GHI THÊM một dòng mới, đúng hình dạng MANUAL_ADJUST / không đơn", async () => {
    await goiSua();
    const ds = await db.staffTimeLog.findMany({
      where: { userId: nv, workDate: NGAY },
      orderBy: { loggedAt: "asc" },
    });
    expect(ds).toHaveLength(2);
    const moi = ds.find((x) => x.id !== goc)!;
    expect(moi.source).toBe("MANUAL_ADJUST");
    expect(moi.adjustRequestId).toBeNull(); // ← khác đường qua đơn
    expect(moi.flags).toContain("CHINH_TAY");
    expect(moi.reviewStatus).toBe("CONFIRMED");
    expect(moi.reviewedById).toBe(QL_ID);
    expect(moi.reviewNote).toBe("Quầy hỏng sáng 09/09, có mặt đúng giờ");
    expect(moi.loggedAt.toISOString()).toBe("2026-09-09T01:00:00.000Z");
  });

  it("ngày được xếp hàng TÍNH LẠI sau khi sửa", async () => {
    await goiSua();
    const ev = await db.domainEvent.findMany({
      where: { dedupeKey: { startsWith: "attday:" } },
      select: { dedupeKey: true },
    });
    expect(ev.some((e) => e.dedupeKey?.includes(nv))).toBe(true);
  });

  // ── CỔNG 2: lý do bắt buộc ──────────────────────────────────────────────────
  it.each([
    ["rỗng", ""],
    ["khoảng trắng", "     "],
    ["quá ngắn", "vì"],
  ])("CỔNG lý do — %s ⇒ từ chối, KHÔNG ghi dòng nào", async (_ten, lyDo) => {
    const r = await goiSua({ lyDo });
    expect(r.ok).toBe(false);
    expect(await db.staffTimeLog.count({ where: { userId: nv, workDate: NGAY } })).toBe(1);
  });

  it("không mốc giờ nào ⇒ từ chối", async () => {
    const r = await goiSua({ gioVao: null, gioRa: null });
    expect(r.ok).toBe(false);
    expect(await db.staffTimeLog.count({ where: { userId: nv, workDate: NGAY } })).toBe(1);
  });

  // ── CỔNG 1: quyền ───────────────────────────────────────────────────────────
  it("CỔNG quyền — vai KHÔNG có hr_attendance:adjust ⇒ từ chối, không ghi gì", async () => {
    quyen.adjust = false;
    const r = await goiSua();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("Không có quyền");
    expect(await db.staffTimeLog.count({ where: { userId: nv, workDate: NGAY } })).toBe(1);
  });

  // ── CỔNG 3: kỳ đã chốt ──────────────────────────────────────────────────────
  async function chotKy() {
    await db.attendancePeriod.create({
      data: { centerId: cs1, periodKey: "2026-09", status: "LOCKED" },
    });
  }

  it("CỔNG kỳ đã chốt — từ chối khi không xin vượt", async () => {
    await chotKy();
    const r = await goiSua();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("CHỐT SỔ");
    expect(await db.staffTimeLog.count({ where: { userId: nv, workDate: NGAY } })).toBe(1);
  });

  it("xin vượt mà KHÔNG phải cấp Hội sở ⇒ vẫn từ chối", async () => {
    await chotKy();
    quyen.closePeriod = false;
    const r = await goiSua({ boQuaKyDaChot: true });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("Hội sở");
    expect(await db.staffTimeLog.count({ where: { userId: nv, workDate: NGAY } })).toBe(1);
  });

  it("đường vượt HỘI SỞ ⇒ cho qua, và AUDIT ghi rõ cờ vượt", async () => {
    await chotKy();
    quyen.closePeriod = true;
    const r = await goiSua({ boQuaKyDaChot: true });
    expect(r.ok, `ok=${JSON.stringify(r)}`).toBe(true);
    expect(await db.staffTimeLog.count({ where: { userId: nv, workDate: NGAY } })).toBe(2);

    const a = await db.auditLog.findFirstOrThrow({
      where: { entityId: `${nv}:2026-09-09`, action: "MANUAL_TIME_ADJUST" },
      orderBy: { createdAt: "desc" },
    });
    expect((a.newValues as Record<string, unknown>).boQuaKyDaChot).toBe(true);
  });

  // ── CỔNG 4: audit before/after ──────────────────────────────────────────────
  it("CỔNG audit — ghi BỨC TRANH trước và dòng thêm mới, kèm lý do", async () => {
    await goiSua();
    const a = await db.auditLog.findFirstOrThrow({
      where: { entityId: `${nv}:2026-09-09`, action: "MANUAL_TIME_ADJUST" },
    });
    expect(a.module).toBe("hr_attendance");
    expect(a.entityType).toBe("StaffTimeLog");
    expect(a.actorId).toBe(QL_ID);
    expect(a.reason).toBe("Quầy hỏng sáng 09/09, có mặt đúng giờ");

    const cu = (a.oldValues as { luotQuetDangCo: { luc: string; nguon: string }[] }).luotQuetDangCo;
    // "Before" của một sổ GHI THÊM là bức tranh ĐANG CÓ — phải chụp TRƯỚC khi ghi, nếu không
    // nó chụp luôn dòng mình vừa tạo và audit nói dối.
    expect(cu).toHaveLength(1);
    expect(cu[0]?.nguon).toBe("TICKET");
    expect(cu[0]?.luc).toBe("2026-09-09T01:32:00.000Z");

    const them = (a.newValues as { themMoi: unknown[]; canCu: string }).themMoi;
    expect(them).toHaveLength(1);
    expect((a.newValues as { canCu: string }).canCu).toBe("SUA_TAY_KHONG_DON");
  });

  // ── biên ────────────────────────────────────────────────────────────────────
  it("ngày KHÔNG có ca xếp và chưa tính ⇒ từ chối, không đoán bừa cơ sở", async () => {
    await db.shiftAssignment.deleteMany({ where: { userId: nv } });
    const r = await goiSua({ workDate: "2026-09-10" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("cơ sở chịu công");
  });

  it("sửa HAI LẦN ⇒ hai lượt đều được giữ, không lượt nào đè lượt nào", async () => {
    // Sổ ghi thêm: lượt sửa sau KHÔNG xoá lượt sửa trước. Đó là cách "giờ quét thật là gì"
    // còn trả lời được sau này.
    await goiSua({ gioVao: "08:00" });
    await goiSua({ gioVao: "08:05", lyDo: "Sửa lại lần hai, gõ nhầm phút" });
    const ds = await db.staffTimeLog.findMany({
      where: { userId: nv, workDate: NGAY },
      orderBy: { loggedAt: "asc" },
    });
    expect(ds).toHaveLength(3);
    expect(ds.filter((x) => x.source === "MANUAL_ADJUST")).toHaveLength(2);
  });
});
