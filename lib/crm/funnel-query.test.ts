// @vitest-environment node
/**
 * V-02 — `getFunnelCounts`: CÁCH LY CƠ SỞ của bảng số Funnel Marketing.
 *
 * Lỗ đang MỞ trên prod mà file này khoá lại: 4/5 truy vấn nhận mệnh đề lọc cơ sở, riêng
 * `adsInsightDaily.aggregate` chạy TRẦN ⇒ quản lý cơ sở (có `leads:view-all`, vào được
 * trang) đọc được CHI PHÍ QUẢNG CÁO TOÀN CÔNG TY. Nặng hơn: CPL/CPA/ROAS lấy tử số là
 * chi phí toàn hệ thống chia cho mẫu số L2/L3 của RIÊNG cơ sở ⇒ ba con số đó SAI, không
 * chỉ là lộ tiền.
 *
 * Vì sao Prisma giả ở đây **tôn trọng `where`** (mẫu đã dùng ở `lib/chat/pilot-stats-scope.test.ts`):
 * bản giả trả sẵn một con số cố định sẽ XANH y hệt khi code quên lọc — tức không chứng
 * minh gì. Ở đây số của CS1 và CS2 cố tình khác nhau để "lẫn cơ sở" lộ ra ở CON SỐ.
 *
 * Bất biến sắc nhất trong bộ này: khi actor bị giới hạn cơ sở thì truy vấn chi phí QC
 * **KHÔNG được chạy** — `AdsInsightDaily` không có cột `centerId` (prisma/schema.prisma:948-961)
 * nên không có mệnh đề `where` nào cứu được nó; cách duy nhất đúng là đừng hỏi.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type LeadRow = {
  centerId: string | null;
  qualifiedAt: Date | null;
  convertedAt: Date | null;
  deletedAt: Date | null;
};
type ConvRow = { centerId: string | null };
type OrderRow = { centerId: string | null; status: string; totalAmount: number };
type AdRow = { spend: number };

const h = vi.hoisted(() => {
  const state = {
    conversations: [] as ConvRow[],
    leads: [] as LeadRow[],
    orders: [] as OrderRow[],
    ads: [] as AdRow[],
    /** Ghi lại mọi `where` đã gửi xuống Prisma — để pin CHÍNH mệnh đề lọc cơ sở. */
    calls: [] as { model: string; where: unknown }[],
  };

  const inList = (clause: unknown): string[] | null => {
    if (clause && typeof clause === "object" && "in" in (clause as Record<string, unknown>)) {
      return (clause as { in: string[] }).in;
    }
    return null;
  };

  /** Không có mệnh đề `centerId` ⇒ Prisma trả MỌI dòng (kể cả centerId NULL). */
  const matchCenter = (centerId: string | null, clause: unknown): boolean => {
    const ids = inList(clause);
    if (ids === null) return true;
    // `in` của Prisma KHÔNG khớp NULL — mô phỏng đúng, vì đó chính là cơ chế khiến bản
    // ghi chưa gán cơ sở bị bỏ với actor cấp cơ sở (fail-closed).
    return centerId !== null && ids.includes(centerId);
  };

  const isNotNull = (clause: unknown): boolean =>
    !!clause &&
    typeof clause === "object" &&
    "not" in (clause as Record<string, unknown>) &&
    (clause as { not: unknown }).not === null;

  const db = {
    messengerConversation: {
      count: vi.fn(async (args: { where?: Record<string, unknown> }) => {
        const where = args?.where ?? {};
        state.calls.push({ model: "messengerConversation", where });
        return state.conversations.filter((c) => matchCenter(c.centerId, where.centerId)).length;
      }),
    },
    lead: {
      count: vi.fn(async (args: { where?: Record<string, unknown> }) => {
        const where = args?.where ?? {};
        state.calls.push({ model: "lead", where });
        return state.leads.filter(
          (l) =>
            (where.deletedAt === null ? l.deletedAt === null : true) &&
            (isNotNull(where.qualifiedAt) ? l.qualifiedAt !== null : true) &&
            (isNotNull(where.convertedAt) ? l.convertedAt !== null : true) &&
            matchCenter(l.centerId, where.centerId),
        ).length;
      }),
    },
    adsInsightDaily: {
      aggregate: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
        state.calls.push({ model: "adsInsightDaily", where: args?.where });
        const total = state.ads.reduce((s, a) => s + a.spend, 0);
        // Prisma trả `null` khi không có dòng nào — không phải 0.
        return { _sum: { spend: state.ads.length > 0 ? total : null } };
      }),
    },
    order: {
      aggregate: vi.fn(async (args: { where?: Record<string, unknown> }) => {
        const where = args?.where ?? {};
        state.calls.push({ model: "order", where });
        const statuses = inList(where.status);
        const rows = state.orders.filter(
          (o) =>
            (statuses === null || statuses.includes(o.status)) &&
            matchCenter(o.centerId, where.centerId),
        );
        const total = rows.reduce((s, o) => s + o.totalAmount, 0);
        return { _sum: { totalAmount: rows.length > 0 ? total : null } };
      }),
    },
  };

  return { state, db };
});

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));

import { getFunnelCounts } from "./funnel-query";
import { computeFunnelMetrics } from "./marketing-metrics";
import type { Actor, PermEntry } from "@/lib/auth/actor";

const SPEND_TOAN_HE = 9_000_000;

const perm = (action: string, centerScope: PermEntry["centerScope"], orgUnitId: string): PermEntry => ({
  action,
  // GLOBAL đúng như prisma/seed-roles.ts (leads:view-all GLOBAL cho CENTER_MANAGER dòng
  // 403) — cách ly cơ sở KHÔNG đến từ scopeType mà từ `centerScope` của neo tổ chức.
  scopeType: "GLOBAL",
  orgUnitId,
  roleCode: "R",
  centerScope,
});

const baseActor = (over: Partial<Actor>): Actor =>
  ({
    userId: "u",
    isSuperAdmin: false,
    isHoLevel: false,
    orgRoles: [],
    permissions: [],
    visibleCenterIds: [],
    visibleOrgUnitIds: [],
    grantsAllow: new Set<string>(),
    assignedClassIds: new Set<string>(),
    ...over,
  }) satisfies Actor;

/** QLCS thuần, neo tại MỘT cơ sở (không neo ở HO/REGION ⇒ isHoLevel = false). */
const qlcs = (centerId: string): Actor =>
  baseActor({
    userId: `u-qlcs-${centerId}`,
    orgRoles: [{ orgUnitId: `ou-${centerId}`, roleCode: "CENTER_MANAGER" }],
    permissions: [perm("leads:view-all", [centerId], `ou-${centerId}`)],
    visibleCenterIds: [centerId],
    visibleOrgUnitIds: [`ou-${centerId}`],
  });

/** Marketing Hội sở: role neo tại HO ⇒ centerScope "ALL" (cross-center theo chức năng). */
const hoMarketing = (): Actor =>
  baseActor({
    userId: "u-ho-mkt",
    isHoLevel: true,
    orgRoles: [{ orgUnitId: "ou-ho", roleCode: "HO_MARKETING" }],
    permissions: [perm("leads:view-all", "ALL", "ou-ho")],
    visibleCenterIds: ["cs1", "cs2"],
    visibleOrgUnitIds: ["ou-ho", "ou-cs1", "ou-cs2"],
  });

const superAdmin = (): Actor => baseActor({ userId: "u-super", isSuperAdmin: true });

/** Giáo viên: vào được site nhưng KHÔNG có `leads:view-all`. */
const giaoVien = (): Actor =>
  baseActor({
    userId: "u-gv",
    orgRoles: [{ orgUnitId: "ou-cs1", roleCode: "TEACHER" }],
    permissions: [perm("classes:view-own", ["cs1"], "ou-cs1")],
    visibleCenterIds: ["cs1"],
    visibleOrgUnitIds: ["ou-cs1"],
  });

/**
 * Bối cảnh: CS1 và CS2 cố tình LỆCH nhau ở mọi con số.
 * CS1: 2 hội thoại · 2 L2 (1 L3) · 1tr doanh thu. CS2: 5 hội thoại · 3 L2 (2 L3) · 7tr.
 */
function seedTwoCenters() {
  const s = h.state;
  s.conversations = [
    { centerId: "cs1" },
    { centerId: "cs1" },
    { centerId: "cs2" },
    { centerId: "cs2" },
    { centerId: "cs2" },
    { centerId: "cs2" },
    { centerId: "cs2" },
    // Hội thoại chưa gán cơ sở — chỉ cấp Hội sở nhìn thấy (hành vi cũ, pin lại).
    { centerId: null },
  ];
  s.leads = [
    { centerId: "cs1", qualifiedAt: new Date(), convertedAt: new Date(), deletedAt: null },
    { centerId: "cs1", qualifiedAt: new Date(), convertedAt: null, deletedAt: null },
    { centerId: "cs1", qualifiedAt: null, convertedAt: null, deletedAt: null }, // chưa L2
    { centerId: "cs1", qualifiedAt: new Date(), convertedAt: new Date(), deletedAt: new Date() }, // đã xoá mềm
    { centerId: "cs2", qualifiedAt: new Date(), convertedAt: new Date(), deletedAt: null },
    { centerId: "cs2", qualifiedAt: new Date(), convertedAt: new Date(), deletedAt: null },
    { centerId: "cs2", qualifiedAt: new Date(), convertedAt: null, deletedAt: null },
  ];
  s.orders = [
    { centerId: "cs1", status: "CONFIRMED", totalAmount: 1_000_000 },
    { centerId: "cs2", status: "COMPLETED", totalAmount: 7_000_000 },
    { centerId: "cs2", status: "DRAFT", totalAmount: 9_999_999 }, // chưa chốt → không tính
  ];
  s.ads = [
    { spend: 4_000_000 },
    { spend: 5_000_000 },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.calls = [];
  seedTwoCenters();
});

// ─── Cách ly cơ sở ──────────────────────────────────────────────────────────

describe("cách ly cơ sở", () => {
  it("QLCS CS1 không thấy MỘT con số nào của CS2", async () => {
    const c = await getFunnelCounts(qlcs("cs1"));

    expect(c.l1).toBe(2);
    expect(c.l2).toBe(2);
    expect(c.l3).toBe(1);
    expect(c.revenue).toBe(1_000_000);
    // Không dòng nào của CS2 lọt vào: nếu lẫn thì các số trên đã là 7/5/3/8tr.
    expect(c.revenue).not.toBe(8_000_000);
  });

  it("QLCS CS2 chỉ thấy CS2 (đối xứng — không phải 'CS1 là mặc định')", async () => {
    const c = await getFunnelCounts(qlcs("cs2"));

    expect(c.l1).toBe(5);
    expect(c.l2).toBe(3);
    expect(c.l3).toBe(2);
    expect(c.revenue).toBe(7_000_000);
  });

  it("mệnh đề lọc cơ sở ĐI XUỐNG DB (không lọc sau khi đã kéo cả nước về)", async () => {
    await getFunnelCounts(qlcs("cs1"));

    for (const model of ["messengerConversation", "lead", "order"]) {
      const calls = h.state.calls.filter((x) => x.model === model);
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.where).toMatchObject({ centerId: { in: ["cs1"] } });
      }
    }
  });

  it("Hội sở thấy CẢ HAI cơ sở — ý nghĩa con số KHÔNG đổi", async () => {
    const c = await getFunnelCounts(hoMarketing());

    // 2 (CS1) + 5 (CS2) + 1 hội thoại chưa gán cơ sở = 8.
    expect(c.l1).toBe(8);
    expect(c.l2).toBe(5);
    expect(c.l3).toBe(3);
    expect(c.revenue).toBe(8_000_000);
  });

  it("SUPER_ADMIN bỏ qua scope (bằng đúng Hội sở)", async () => {
    const c = await getFunnelCounts(superAdmin());

    expect(c.l2).toBe(5);
    expect(c.revenue).toBe(8_000_000);
  });
});

// ─── Chi phí QC: lỗ V-02 ────────────────────────────────────────────────────

describe("chi phí quảng cáo", () => {
  it("[V-02] QLCS KHÔNG đọc được chi phí QC toàn công ty", async () => {
    const c = await getFunnelCounts(qlcs("cs1"));

    expect(c.spend).not.toBe(SPEND_TOAN_HE);
    expect(c.spend).toBe(0);
    // Số 0 kia KHÔNG có nghĩa "0 đồng" — nó có nghĩa "không đo được ở phạm vi này".
    expect(c.spendAvailable).toBe(false);
  });

  it("[V-02] truy vấn chi phí QC KHÔNG CHẠY khi actor bị giới hạn cơ sở", async () => {
    // `AdsInsightDaily` không có cột centerId (schema.prisma:948-961) ⇒ không mệnh đề
    // `where` nào cứu được. Cách duy nhất đúng: đừng hỏi.
    await getFunnelCounts(qlcs("cs1"));

    expect(h.db.adsInsightDaily.aggregate).not.toHaveBeenCalled();
  });

  it("[V-02] CPL/CPA/ROAS của QLCS không còn lấy tử số là chi phí toàn hệ thống", async () => {
    const c = await getFunnelCounts(qlcs("cs1"));
    const m = computeFunnelMetrics(c);

    // Trước khi vá: 9tr/2 = 4.5tr (CPL) và 9tr/1 = 9tr (CPA) — thổi phồng bằng tiền của
    // cả công ty trên mẫu số của riêng CS1.
    expect(m.cpl).not.toBe(4_500_000);
    expect(m.cpa).not.toBe(SPEND_TOAN_HE);
    // ⚠️ Hai assert PHỦ ĐỊNH ở trên một mình là XANH GIẢ: chúng xanh với 0, NaN, Infinity và
    // với mọi con số sai khác hai hằng đó. Ghim GIÁ TRỊ ĐÚNG phải là gì — `computeFunnelMetrics`
    // chia-0 an toàn nên cả ba ra 0 — VÀ ghim cờ nói cho chỗ hiển thị biết 0 này nghĩa
    // "không đo được" (vế trình bày ở `lib/crm/funnel-cards.test.ts`).
    expect(m.cpl).toBe(0);
    expect(m.cpa).toBe(0);
    expect(m.roas).toBe(0);
    expect(c.spendAvailable).toBe(false);
    // Mốc đối chứng: mẫu số KHÔNG phải 0 (2 L2 · 1 L3) — nghĩa là ba số trên bằng 0 vì TỬ
    // số vắng mặt, không phải vì trang rỗng dữ liệu.
    expect(c.l2).toBe(2);
    expect(c.l3).toBe(1);
  });

  it("Hội sở / SUPER_ADMIN vẫn thấy chi phí QC toàn hệ thống (không đổi ý nghĩa)", async () => {
    const ho = await getFunnelCounts(hoMarketing());
    const sa = await getFunnelCounts(superAdmin());

    expect(ho.spend).toBe(SPEND_TOAN_HE);
    expect(ho.spendAvailable).toBe(true);
    expect(sa.spend).toBe(SPEND_TOAN_HE);
    expect(sa.spendAvailable).toBe(true);
  });
});

// ─── Fail-closed ────────────────────────────────────────────────────────────

describe("fail-closed", () => {
  it("actor KHÔNG có leads:view-all → rỗng, KHÔNG throw, KHÔNG chạm DB", async () => {
    const c = await getFunnelCounts(giaoVien());

    expect(c).toMatchObject({ l1: 0, l2: 0, l3: 0, spend: 0, revenue: 0, spendAvailable: false });
    expect(h.db.lead.count).not.toHaveBeenCalled();
    expect(h.db.order.aggregate).not.toHaveBeenCalled();
    expect(h.db.adsInsightDaily.aggregate).not.toHaveBeenCalled();
  });

  it("actor có quyền nhưng KHÔNG cơ sở nào trong tầm nhìn → rỗng, KHÔNG chạm DB", async () => {
    const treo = baseActor({
      userId: "u-treo",
      permissions: [perm("leads:view-all", [], "ou-x")],
    });

    const c = await getFunnelCounts(treo);

    expect(c.l2).toBe(0);
    expect(c.revenue).toBe(0);
    expect(h.db.lead.count).not.toHaveBeenCalled();
  });
});

// ─── Không đổi công thức doanh thu (V-02 chỉ vá PHẠM VI) ────────────────────

describe("doanh thu — chỉ vá phạm vi, không đổi công thức", () => {
  it("vẫn chỉ cộng đơn CONFIRMED/COMPLETED", async () => {
    await getFunnelCounts(hoMarketing());

    const call = h.state.calls.find((x) => x.model === "order");
    expect(call?.where).toMatchObject({ status: { in: ["CONFIRMED", "COMPLETED"] } });
  });

  it("không có đơn nào trong phạm vi → 0 (Prisma trả null, không được thành NaN)", async () => {
    h.state.orders = [];

    const c = await getFunnelCounts(qlcs("cs1"));

    expect(c.revenue).toBe(0);
  });
});

// ─── Đường gọi cũ (chưa migrate sang actor) vẫn phải fail-closed ────────────

describe("chữ ký cũ { centerIds } — quá độ", () => {
  it("truyền centerIds ⇒ chi phí QC KHÔNG rò (cùng luật với đường actor)", async () => {
    const c = await getFunnelCounts({ centerIds: ["cs1"] });

    expect(c.l2).toBe(2);
    expect(c.spend).toBe(0);
    expect(c.spendAvailable).toBe(false);
    expect(h.db.adsInsightDaily.aggregate).not.toHaveBeenCalled();
  });

  it("gọi trần (không tham số) = toàn hệ thống — giữ nguyên hành vi cho e2e R1-08", async () => {
    const c = await getFunnelCounts();

    expect(c.l2).toBe(5);
    expect(c.spend).toBe(SPEND_TOAN_HE);
    expect(c.spendAvailable).toBe(true);
  });
});
