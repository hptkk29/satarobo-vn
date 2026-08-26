// @vitest-environment node
/**
 * `lib/lead/auto-assign.ts` — hai đường đổi chủ lead: `manualAssignLead` (quản lý gán tay,
 * ô chọn ở trang chi tiết lead) và `autoAssignNewLead` (chia lead MỚI theo cơ sở → chế độ).
 * Trước file này module có **0 test**.
 *
 * Bộ test VIẾT TRƯỚC phần hiện thực (luật cứng Nền Hệ thống #5).
 *
 * ⭐ HAI ĐƯỜNG NÀY CỐ Ý KHÔNG GIỐNG NHAU — đó là điều chính được gim ở đây:
 *
 *  • `manualAssignLead` KHÔNG lọc status ⇒ gọi được trên lead đang `ENROLLED`, tức đúng
 *    nhóm lead đã sinh `Enrollment` mang `saleId` của sale cũ. Nó PHẢI kéo
 *    `Enrollment.saleId` theo (cột quyết định kênh riêng Sale↔PH — `DM_SALE_PARENT`).
 *
 *  • `autoAssignNewLead` thoát sớm khi `lead.assignedToId` khác null (auto-assign.ts:127)
 *    ⇒ nó CHỈ chạy trên lead chưa ai phụ trách ⇒ mọi ghi danh truy vết về lead đó có
 *    `saleId = null` (convert đặt `saleId = lead.assignedToId ?? null`). KHÔNG tồn tại
 *    "sale cũ" để kéo. Kéo ở đây không phải là "làm cho đều" mà là NHẬN VƠ: một lượt chia
 *    lead mới sẽ vơ hết ghi danh mà ai đó vừa cố ý GỠ sale ở màn học viên của lớp
 *    (`app/(admin)/admin/classes/[id]/students/_actions.ts` — đường duy nhất gỡ được
 *    `Enrollment.saleId` bằng giao diện). Vì vậy đường này tắt tường minh phần kéo.
 *
 * Cả hai đều PHẢI đặt `assignedAt` — mốc bắt đồng hồ SLA-3 (`lib/crm/sla.ts:78`).
 *
 * Mock Prisma LỌC THẬT theo `where`, và `tx` là thực thể riêng với `db` trần nên một lượt
 * ghi lọt ra ngoài transaction của caller là lộ ngay.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  type LeadRow = {
    id: string;
    assignedToId: string | null;
    assignedAt: Date | null;
    status: string;
    deletedAt: Date | null;
    centerId: string | null;
  };
  type EnrollmentRow = {
    id: string;
    leadId: string; // qua LeadChild — mock rút gọn một bậc
    saleId: string | null;
    status: string;
    deletedAt: Date | null;
    centerId: string | null;
    parentUserId: string | null;
  };
  type UserRow = {
    id: string;
    name: string | null;
    roles: string[];
    isActive: boolean;
    deletedAt: Date | null;
    centerId: string | null;
  };
  type Row = Record<string, unknown>;

  const state = {
    leads: [] as LeadRow[],
    enrollments: [] as EnrollmentRow[],
    users: [] as UserRow[],
    conversations: [] as { id: string; dmKey: string; type: string; status: string }[],
    /** Số activity "của sale" — cửa khoá auto-chia (`hasSaleInteraction`). */
    saleInteractionCount: 0,
    /** Chế độ chia của cơ sở; null ⇒ mặc định ROUND_ROBIN. */
    centerMode: null as string | null,

    leadUpdateArgs: [] as Row[],
    enrollmentUpdateArgs: [] as Row[],
    activityRows: [] as Row[],
    auditCalls: [] as Row[],
    txOptions: [] as (Row | null)[],
    trace: [] as string[],
    currentTx: null as unknown,
    inTx: false,
    reconcileArgs: [] as Row[],
  };

  const asIn = (v: unknown): string[] | null => {
    if (typeof v !== "object" || v === null) return null;
    const arr = (v as { in?: unknown }).in;
    return Array.isArray(arr) ? (arr as string[]) : null;
  };

  function matchLead(row: LeadRow, where: Row): boolean {
    for (const [key, value] of Object.entries(where)) {
      if (key === "id") {
        const ids = asIn(value);
        if (ids && !ids.includes(row.id)) return false;
        if (typeof value === "string" && row.id !== value) return false;
        continue;
      }
      if (key === "assignedToId") {
        if (row.assignedToId !== (value as string | null)) return false;
        continue;
      }
      if (key === "deletedAt") {
        if (value === null && row.deletedAt !== null) return false;
        continue;
      }
    }
    return true;
  }

  function matchEnrollment(row: EnrollmentRow, where: Row): boolean {
    for (const [key, value] of Object.entries(where)) {
      if (key === "id") {
        const ids = asIn(value);
        if (ids && !ids.includes(row.id)) return false;
        continue;
      }
      if (key === "saleId") {
        if (row.saleId !== (value as string | null)) return false;
        continue;
      }
      if (key === "deletedAt") {
        if (value === null && row.deletedAt !== null) return false;
        continue;
      }
      if (key === "status") {
        const inList = asIn(value);
        if (inList && !inList.includes(row.status)) return false;
        continue;
      }
      if (key === "OR") {
        const branches = Array.isArray(value) ? (value as Row[]) : [];
        if (branches.length > 0 && !branches.some((b) => matchEnrollment(row, b))) return false;
        continue;
      }
      if (key === "centerId") {
        if (value === null) {
          if (row.centerId !== null) return false;
          continue;
        }
        if (typeof value === "string") {
          if (row.centerId !== value) return false;
          continue;
        }
        const ids = asIn(value);
        if (ids && (row.centerId === null || !ids.includes(row.centerId))) return false;
        continue;
      }
      if (key === "leadChild") {
        const leadIds = asIn((value as Row).leadId);
        if (leadIds && !leadIds.includes(row.leadId)) return false;
        continue;
      }
    }
    return true;
  }

  /** `tx` và `db` là HAI thực thể riêng — xem chú thích cùng tên ở `assign.test.ts`. */
  function buildClient(viaTx: boolean): Record<string, unknown> {
    const label = viaTx ? "tx" : "db";
    const trace = (op: string) => state.trace.push(`${op}(${label})`);
    return {
      user: {
        findMany: vi.fn(async (args: Row) => {
          const where = (args.where ?? {}) as Row;
          const hasRole = (where.roles as { has?: string } | undefined)?.has;
          return state.users
            .filter(
              (u) =>
                (!hasRole || u.roles.includes(hasRole)) &&
                (where.isActive === undefined || u.isActive === where.isActive) &&
                (where.deletedAt !== null || u.deletedAt === null) &&
                (where.centerId === undefined || u.centerId === where.centerId),
            )
            .map((u) => ({ id: u.id, name: u.name, centerId: u.centerId }));
        }),
        findUnique: vi.fn(async (args: Row) => {
          const where = (args.where ?? {}) as Row;
          const found = state.users.find((u) => u.id === where.id);
          return found ? { id: found.id, name: found.name, centerId: found.centerId } : null;
        }),
        findFirst: vi.fn(async (args: Row) => {
          const where = (args.where ?? {}) as Row;
          const hasRole = (where.roles as { has?: string } | undefined)?.has;
          const found = state.users.find(
            (u) =>
              u.id === where.id &&
              (!hasRole || u.roles.includes(hasRole)) &&
              (where.deletedAt !== null || u.deletedAt === null) &&
              (where.isActive === undefined || u.isActive === where.isActive),
          );
          return found ? { id: found.id, name: found.name, centerId: found.centerId } : null;
        }),
      },
      lead: {
        findUnique: vi.fn(async (args: Row) => {
          const where = (args.where ?? {}) as Row;
          const found = state.leads.find((l) => l.id === where.id);
          return found
            ? {
                id: found.id,
                centerId: found.centerId,
                status: found.status,
                assignedToId: found.assignedToId,
              }
            : null;
        }),
        groupBy: vi.fn(async () => [] as Row[]),
        update: vi.fn(async (args: Row) => {
          trace("lead.update");
          const where = (args.where ?? {}) as Row;
          const found = state.leads.find((l) => l.id === where.id);
          if (!found) throw new Error("P2025 (mô phỏng)");
          return { id: found.id };
        }),
        updateMany: vi.fn(async (args: Row) => {
          state.leadUpdateArgs.push(args);
          trace("lead.updateMany");
          const hit = state.leads.filter((l) => matchLead(l, (args.where ?? {}) as Row));
          const data = (args.data ?? {}) as Row;
          for (const l of hit) {
            if ("assignedToId" in data) l.assignedToId = data.assignedToId as string | null;
            if ("assignedAt" in data) l.assignedAt = data.assignedAt as Date | null;
            if ("status" in data && typeof data.status === "string") l.status = data.status;
          }
          return { count: hit.length };
        }),
      },
      leadActivity: {
        count: vi.fn(async () => state.saleInteractionCount),
        createMany: vi.fn(async (args: Row) => {
          const rows = (args.data ?? []) as Row[];
          state.activityRows.push(...rows);
          trace("activity.createMany");
          return { count: rows.length };
        }),
      },
      leadAssignmentConfig: {
        findUnique: vi.fn(async () =>
          state.centerMode === null ? null : { mode: state.centerMode },
        ),
      },
      enrollment: {
        findMany: vi.fn(async (args: Row) => {
          trace("enrollment.findMany");
          return state.enrollments
            .filter((e) => matchEnrollment(e, (args.where ?? {}) as Row))
            .map((e) => ({
              id: e.id,
              centerId: e.centerId,
              leadChild: { leadId: e.leadId },
              student: { parentUserId: e.parentUserId },
            }));
        }),
        updateMany: vi.fn(async (args: Row) => {
          state.enrollmentUpdateArgs.push(args);
          trace("enrollment.updateMany");
          const hit = state.enrollments.filter((e) =>
            matchEnrollment(e, (args.where ?? {}) as Row),
          );
          const data = (args.data ?? {}) as Row;
          for (const e of hit) {
            if ("saleId" in data) e.saleId = data.saleId as string | null;
          }
          return { count: hit.length };
        }),
      },
      center: {
        findMany: vi.fn(async () => [] as Row[]),
      },
      conversation: {
        findMany: vi.fn(async (args: Row) => {
          const where = (args.where ?? {}) as Row;
          const keys = asIn(where.dmKey) ?? [];
          return state.conversations
            .filter(
              (c) =>
                keys.includes(c.dmKey) &&
                (where.type === undefined || c.type === where.type) &&
                (where.status === undefined || c.status === where.status),
            )
            .map((c) => ({ id: c.id }));
        }),
      },
    };
  }

  const txClient = buildClient(true);
  const mockDb: Record<string, unknown> = {
    ...buildClient(false),
    $extends: () => mockDb,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>, opts?: Row) => {
      state.txOptions.push(opts ?? null);
      state.inTx = true;
      state.currentTx = txClient;
      try {
        return await fn(txClient);
      } finally {
        state.inTx = false;
        state.currentTx = null;
      }
    }),
  };

  return {
    state,
    mockDb,
    txClient,
    logLeadAudit: vi.fn(async (params: Row) => {
      state.auditCalls.push(params);
      const viaTx = params.tx !== undefined && params.tx === state.currentTx;
      state.trace.push(`audit(${viaTx ? "tx" : "db"})`);
    }),
    reconcileDm: vi.fn(async (opts?: Row) => {
      state.reconcileArgs.push({ ...(opts ?? {}), inTx: state.inTx });
      const ids = Array.isArray(opts?.onlyConversationIds)
        ? (opts.onlyConversationIds as string[])
        : [];
      return { dmChecked: ids.length, dmArchived: ids.length, dmSkipped: 0 };
    }),
  };
});

vi.mock("@/lib/db", () => ({ db: h.mockDb }));
vi.mock("@/lib/audit/log", () => ({ logLeadAudit: h.logLeadAudit }));
vi.mock("@/lib/chat/dm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat/dm")>();
  return { ...actual, reconcileDmConversations: h.reconcileDm };
});

import { dmKeyOf } from "@/lib/chat/dm";
import { autoAssignNewLead, manualAssignLead } from "@/lib/lead/auto-assign";

const OLD_SALE = "sale-my";
const NEW_SALE = "sale-lien";
const CS1 = "center-cs1";
const CS2 = "center-cs2";
const ACTOR = { actorId: "qlcs-1", actorName: "QLCS CS2" };

function lead(id: string, over: Partial<(typeof h.state.leads)[number]> = {}) {
  return {
    id,
    assignedToId: null as string | null,
    assignedAt: null as Date | null,
    status: "NEW",
    deletedAt: null as Date | null,
    centerId: CS2,
    ...over,
  };
}

function enrollment(id: string, over: Partial<(typeof h.state.enrollments)[number]> = {}) {
  return {
    id,
    leadId: "l1",
    saleId: OLD_SALE,
    status: "STUDYING",
    deletedAt: null as Date | null,
    centerId: CS2,
    parentUserId: "parent-1",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const s = h.state;
  s.users = [
    { id: OLD_SALE, name: "Đinh Thảo My", roles: ["SALES_CSM"], isActive: false, deletedAt: null, centerId: CS2 },
    { id: NEW_SALE, name: "Lê Phương Liên", roles: ["SALES_CSM"], isActive: true, deletedAt: null, centerId: CS2 },
    { id: "teacher-1", name: "GV", roles: ["TEACHER"], isActive: true, deletedAt: null, centerId: CS2 },
  ];
  s.leads = [lead("l1")];
  s.enrollments = [];
  s.conversations = [];
  s.saleInteractionCount = 0;
  s.centerMode = null;
  s.leadUpdateArgs = [];
  s.enrollmentUpdateArgs = [];
  s.activityRows = [];
  s.auditCalls = [];
  s.txOptions = [];
  s.trace = [];
  s.currentTx = null;
  s.inTx = false;
  s.reconcileArgs = [];
});

// ═══════════════════════════════════════════════════════════════════════════
// manualAssignLead — quản lý gán tay
// ═══════════════════════════════════════════════════════════════════════════

describe("manualAssignLead", () => {
  it("đặt assignedAt: đồng hồ SLA-3 của sale nhận bắt đầu từ đây", async () => {
    const before = Date.now();
    const res = await manualAssignLead("l1", NEW_SALE, ACTOR);
    expect(res.ok).toBe(true);
    expect(h.state.leads[0]?.assignedToId).toBe(NEW_SALE);
    expect(h.state.leads[0]?.assignedAt).toBeInstanceOf(Date);
    expect(h.state.leads[0]?.assignedAt?.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("giữ nguyên NEW→ASSIGNED; status khác thì không đụng", async () => {
    await manualAssignLead("l1", NEW_SALE, ACTOR);
    expect(h.state.leads[0]?.status).toBe("ASSIGNED");

    h.state.leads = [lead("l2", { status: "CONTACTED" })];
    await manualAssignLead("l2", NEW_SALE, ACTOR);
    expect(h.state.leads[0]?.status).toBe("CONTACTED");
  });

  it("lead ĐÃ CONVERT (ENROLLED) ⇒ kéo Enrollment.saleId sang sale nhận", async () => {
    // Hàm không có một điều kiện status nào, nên nó gọi được trên lead `ENROLLED` — đúng
    // nhóm mang `Enrollment.saleId` + kênh riêng Sale↔PH.
    h.state.leads = [lead("l1", { assignedToId: OLD_SALE, status: "ENROLLED" })];
    h.state.enrollments = [enrollment("e1", { centerId: CS2 })];
    const res = await manualAssignLead("l1", NEW_SALE, ACTOR);
    expect(res.ok).toBe(true);
    expect(res.enrollmentsMoved).toBe(1);
    expect(h.state.enrollments[0]?.saleId).toBe(NEW_SALE);
  });

  it("luật L2 — ghi danh khác cơ sở với SALE NHẬN thì KHÔNG giao, GIỮ NGUYÊN sale cũ", async () => {
    h.state.leads = [lead("l1", { assignedToId: OLD_SALE, status: "ENROLLED" })];
    h.state.enrollments = [
      enrollment("e-cs2", { centerId: CS2 }),
      enrollment("e-cs1", { centerId: CS1 }),
      enrollment("e-ho", { centerId: null }), // lớp Hội sở — không ràng buộc cơ sở
    ];
    const res = await manualAssignLead("l1", NEW_SALE, ACTOR);
    expect(res.enrollmentsMoved).toBe(2);
    // Quản lý gán tay giữa vận hành: sale cũ CÒN LÀM VIỆC ⇒ ghi danh khác cơ sở ở lại với
    // người đang chăm, không bị gỡ trắng trong một thao tác báo "thành công".
    expect(res.enrollmentsUnassigned).toBe(0);
    expect(res.enrollmentsKept).toBe(1);
    expect(h.state.enrollments.find((e) => e.id === "e-cs1")?.saleId).toBe(OLD_SALE);
    expect(h.state.enrollments.find((e) => e.id === "e-ho")?.saleId).toBe(NEW_SALE);
  });

  it("đường ĐỌC ghi danh chỉ mang ngữ nghĩa SỞ HỮU (luật L1) — PENDING vẫn đổi chủ", async () => {
    h.state.leads = [lead("l1", { assignedToId: OLD_SALE, status: "ENROLLED" })];
    h.state.enrollments = [enrollment("e-pending", { status: "PENDING", parentUserId: null })];
    const res = await manualAssignLead("l1", NEW_SALE, ACTOR);
    expect(res.enrollmentsMoved).toBe(1);
  });

  it("đóng kênh riêng của sale CŨ, SAU khi transaction commit", async () => {
    h.state.leads = [lead("l1", { assignedToId: OLD_SALE, status: "ENROLLED" })];
    h.state.enrollments = [enrollment("e1", { parentUserId: "parent-1" })];
    h.state.conversations = [
      {
        id: "conv-1",
        dmKey: dmKeyOf(OLD_SALE, "parent-1", "SALE_PARENT"),
        type: "DM_SALE_PARENT",
        status: "ACTIVE",
      },
    ];
    const res = await manualAssignLead("l1", NEW_SALE, ACTOR);
    expect(res.dmArchived).toBe(1);
    expect(h.state.reconcileArgs[0]?.inTx).toBe(false);
  });

  it("lead CHƯA có chủ ⇒ KHÔNG chạm ghi danh (không nhận vơ ghi danh mồ côi)", async () => {
    h.state.leads = [lead("l1", { assignedToId: null })];
    h.state.enrollments = [enrollment("e-mo-coi", { saleId: null })];
    await manualAssignLead("l1", NEW_SALE, ACTOR);
    expect(h.state.trace.filter((t) => t.startsWith("enrollment."))).toEqual([]);
    expect(h.state.enrollments[0]?.saleId).toBeNull();
  });

  it("gán lại cho CHÍNH người đang phụ trách ⇒ KHÔNG đụng ghi danh", async () => {
    // Kéo X→X vô nghĩa, nhưng luật L2 vẫn chạy: ghi danh khác cơ sở với X bị GỠ sạch
    // trong một thao tác mà người dùng tưởng là no-op.
    h.state.leads = [lead("l1", { assignedToId: NEW_SALE, status: "ENROLLED" })];
    h.state.enrollments = [enrollment("e-cs1", { saleId: NEW_SALE, centerId: CS1 })];
    const res = await manualAssignLead("l1", NEW_SALE, ACTOR);
    expect(res.ok).toBe(true);
    expect(h.state.trace.filter((t) => t.startsWith("enrollment."))).toEqual([]);
    expect(h.state.enrollments[0]?.saleId).toBe(NEW_SALE);
  });

  it("activity 'Gán tay cho X' giữ nguyên câu chữ + cờ system", async () => {
    await manualAssignLead("l1", NEW_SALE, ACTOR);
    expect(h.state.activityRows).toHaveLength(1);
    expect(h.state.activityRows[0]).toMatchObject({
      leadId: "l1",
      type: "NOTE",
      content: "Gán tay cho Lê Phương Liên",
    });
    expect(h.state.activityRows[0]?.metadata).toMatchObject({ system: true });
  });

  it("audit ASSIGN ghi TRONG transaction, không lượt ghi nào lọt ra `db` trần", async () => {
    h.state.leads = [lead("l1", { assignedToId: OLD_SALE })];
    h.state.enrollments = [enrollment("e1")];
    await manualAssignLead("l1", NEW_SALE, ACTOR);
    expect(h.state.auditCalls[0]).toMatchObject({
      action: "ASSIGN",
      oldValues: { assignedToId: OLD_SALE },
      newValues: { assignedToId: NEW_SALE },
    });
    expect(h.state.trace).toContain("audit(tx)");
    expect(h.state.trace.filter((t) => t.endsWith("(db)"))).toEqual([]);
  });

  it("transaction gánh thêm việc ⇒ nới trần 30s", async () => {
    await manualAssignLead("l1", NEW_SALE, ACTOR);
    expect(h.state.txOptions[0]).toMatchObject({ timeout: 30_000, maxWait: 10_000 });
  });

  it("giữ nguyên: sale không hợp lệ (không phải SALES_CSM) ⇒ ok:false, không ghi gì", async () => {
    const res = await manualAssignLead("l1", "teacher-1", ACTOR);
    expect(res).toMatchObject({ ok: false, error: "Sale không hợp lệ" });
    expect(h.state.txOptions).toEqual([]);
  });

  it("giữ nguyên: lead không tồn tại ⇒ ok:false, không mở transaction", async () => {
    const res = await manualAssignLead("khong-co", NEW_SALE, ACTOR);
    expect(res).toMatchObject({ ok: false, error: "Lead không tồn tại" });
    expect(h.state.txOptions).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// autoAssignNewLead — chia lead MỚI
// ═══════════════════════════════════════════════════════════════════════════

describe("autoAssignNewLead", () => {
  it("TẮT TƯỜNG MINH phần kéo saleId: không đọc, không ghi ghi danh nào", async () => {
    // Bất biến quan trọng nhất của đường này. Hàm chỉ chạy trên lead CHƯA có chủ ⇒ không
    // tồn tại "sale cũ"; suy diễn thành `where: { saleId: null }` sẽ VƠ hết ghi danh mà
    // ai đó vừa cố ý gỡ sale ở màn học viên của lớp.
    h.state.enrollments = [
      enrollment("e-mo-coi", { saleId: null }),
      enrollment("e-cua-nguoi-khac", { saleId: "sale-khac" }),
    ];
    const res = await autoAssignNewLead("l1", ACTOR);
    expect(res.ok).toBe(true);
    expect(res.assignedToId).toBe(NEW_SALE);
    expect(h.state.trace.filter((t) => t.startsWith("enrollment."))).toEqual([]);
    expect(h.state.enrollments.map((e) => e.saleId)).toEqual([null, "sale-khac"]);
  });

  it("đặt assignedAt (mục B) — đường này cũng bỏ quên y như 5 đường kia", async () => {
    const before = Date.now();
    await autoAssignNewLead("l1", ACTOR);
    expect(h.state.leads[0]?.assignedAt).toBeInstanceOf(Date);
    expect(h.state.leads[0]?.assignedAt?.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("giữ nguyên NEW→ASSIGNED + câu chữ activity + cờ system", async () => {
    await autoAssignNewLead("l1", ACTOR);
    expect(h.state.leads[0]?.assignedToId).toBe(NEW_SALE);
    expect(h.state.leads[0]?.status).toBe("ASSIGNED");
    expect(h.state.activityRows[0]).toMatchObject({
      type: "NOTE",
      content: "Tự động chia cho Lê Phương Liên (luân phiên)",
    });
    // Thiếu cờ này thì `hasSaleInteraction` coi lead "đã có tương tác của sale" và khoá
    // auto-chia vĩnh viễn.
    expect(h.state.activityRows[0]?.metadata).toMatchObject({ system: true });
  });

  it("giữ nguyên: chế độ CLOSE_RATE đổi câu chữ activity", async () => {
    h.state.centerMode = "CLOSE_RATE";
    await autoAssignNewLead("l1", ACTOR);
    expect(h.state.activityRows[0]?.content).toBe("Tự động chia cho Lê Phương Liên (tỷ lệ chốt)");
  });

  it("giữ nguyên: lead đã có người phụ trách ⇒ skipped, không ghi gì", async () => {
    h.state.leads = [lead("l1", { assignedToId: OLD_SALE })];
    const res = await autoAssignNewLead("l1", ACTOR);
    expect(res).toMatchObject({ ok: true, skipped: true, assignedToId: OLD_SALE });
    expect(h.state.txOptions).toEqual([]);
    expect(h.state.trace).toEqual([]);
  });

  it("giữ nguyên: lead đã có tương tác của sale ⇒ skipped (khoá auto-chia)", async () => {
    h.state.saleInteractionCount = 1;
    const res = await autoAssignNewLead("l1", ACTOR);
    expect(res).toMatchObject({ ok: true, skipped: true });
    expect(h.state.txOptions).toEqual([]);
  });

  it("giữ nguyên: chế độ MANUAL ⇒ để trống chờ quản lý gán tay", async () => {
    h.state.centerMode = "MANUAL";
    const res = await autoAssignNewLead("l1", ACTOR);
    expect(res).toMatchObject({ ok: true, assignedToId: null, mode: "MANUAL" });
    expect(h.state.txOptions).toEqual([]);
  });

  it("audit giữ nguyên oldValues { assignedToId: null } và ghi TRONG transaction", async () => {
    await autoAssignNewLead("l1", ACTOR);
    expect(h.state.auditCalls[0]).toMatchObject({
      action: "ASSIGN",
      oldValues: { assignedToId: null },
      newValues: { assignedToId: NEW_SALE },
    });
    expect(h.state.trace).toContain("audit(tx)");
    expect(h.state.trace.filter((t) => t.endsWith("(db)"))).toEqual([]);
  });

  it("KHÔNG đóng kênh DM nào — không có sale cũ thì không có kênh cũ để đóng", async () => {
    await autoAssignNewLead("l1", ACTOR);
    expect(h.reconcileDm).not.toHaveBeenCalled();
  });
});
