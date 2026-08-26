// @vitest-environment node
/**
 * Bàn giao lead hàng loạt (`bulkReassignLeads`) — bộ test VIẾT TRƯỚC phần hiện thực
 * (luật cứng Nền Hệ thống #5). Trước file này module có **0 test**: mọi thay đổi ở
 * `lib/lead-handover/service.ts` đều không có lưới nào đỡ.
 *
 * Ba nhóm bất biến được gim ở đây — và mỗi nhóm đều đã kiểm ngược bằng đột biến
 * (gỡ điều kiện tương ứng trong service ⇒ test ĐỎ):
 *
 *  A. NGƯỜI NHẬN phải là sale còn hoạt động, thuộc tầm nhìn cơ sở của người bấm.
 *     Sale CŨ thì KHÔNG kiểm — người ta bàn giao đúng lúc họ vừa nghỉ việc.
 *  B. TƯ CÁCH HỘI THOẠI đi theo phân công: kênh riêng Sale↔PH sống trên
 *     `Enrollment.saleId` (lib/chat/dm.ts:226-247), nên bàn giao lead phải kéo cột đó
 *     theo TRONG CÙNG transaction, rồi đóng kênh của sale cũ bằng đúng đường sẵn có.
 *  C. NHÓM LỚP (CLASS_GROUP) KHÔNG bị đụng — xem khối "QUYẾT ĐỊNH THIẾT KẾ" trong
 *     service. Test "không gọi syncConversationMembership" là chốt chống hồi quy cho
 *     quyết định đó, không phải chỗ trống quên viết.
 *
 * Mock Prisma ở đây LỌC THẬT theo `where` (không chỉ soi lại đối số truyền vào) —
 * đó là thứ làm bộ test có răng: gỡ một điều kiện trong service là dòng không đáng
 * đụng lọt vào kết quả ngay.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  type LeadRow = {
    id: string;
    assignedToId: string | null;
    deletedAt: Date | null;
    status: string;
    utmCampaign: string | null;
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
    studentDeleted: boolean;
  };
  type TaskRow = { id: string; leadId: string; assignedToId: string | null; status: string };
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
    tasks: [] as TaskRow[],
    users: [] as UserRow[],
    conversations: [] as { id: string; dmKey: string; type: string; status: string }[],

    /** Đối số của mọi lời gọi ghi — để soi "đường ghi có tự bảo vệ không". */
    leadUpdateArgs: [] as Row[],
    enrollmentUpdateArgs: [] as Row[],
    taskUpdateCalls: 0,
    historyRows: [] as Row[],
    auditCalls: [] as Row[],
    /** Option của từng `$transaction` — pin `{timeout:30_000, maxWait:10_000}`. */
    txOptions: [] as (Row | null)[],
    /** Thao tác nào chạy TRONG tx (bắt lỗi ghi ngoài transaction). */
    trace: [] as string[],
    /**
     * Cờ THỜI ĐIỂM — chỉ dùng cho `reconcileDmConversations` (hàm thật chạm `db` trần,
     * không nhận `tx`, nên điều đáng gim là LÚC NÀO nó được gọi).
     * Với các thao tác Prisma thì cờ thời điểm là VÔ DỤNG — xem {@link buildClient}.
     */
    inTx: false,
    /** Client mà `$transaction` đang truyền cho callback — để soi `tx` theo DANH TÍNH. */
    currentTx: null as unknown,
    /** Chỉ số lô cho `$transaction` ném lỗi (mô phỏng đứt giữa chừng). -1 = không. */
    failTxIndex: -1,
    /** Đối số truyền cho `reconcileDmConversations`. */
    reconcileArgs: [] as Row[],
    reconcileThrows: false,
  };

  const asIn = (v: unknown): string[] | null => {
    if (typeof v !== "object" || v === null) return null;
    const arr = (v as { in?: unknown }).in;
    return Array.isArray(arr) ? (arr as string[]) : null;
  };
  const asNotIn = (v: unknown): string[] | null => {
    if (typeof v !== "object" || v === null) return null;
    const arr = (v as { notIn?: unknown }).notIn;
    return Array.isArray(arr) ? (arr as string[]) : null;
  };

  /** Lọc THẬT một dòng Lead theo `where` (kể cả nhánh AND mà resolveWhere dựng). */
  function matchLead(row: LeadRow, where: Row): boolean {
    const andRaw = where.AND;
    const blocks: Row[] = [where, ...(Array.isArray(andRaw) ? (andRaw as Row[]) : [])];
    for (const block of blocks) {
      for (const [key, value] of Object.entries(block)) {
        if (key === "AND") continue;
        if (key === "id") {
          const ids = asIn(value);
          if (ids && !ids.includes(row.id)) return false;
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
        if (key === "utmCampaign") {
          if (row.utmCampaign !== (value as string | null)) return false;
          continue;
        }
        if (key === "status") {
          const inList = asIn(value);
          if (inList && !inList.includes(row.status)) return false;
          const notInList = asNotIn(value);
          if (notInList && notInList.includes(row.status)) return false;
          continue;
        }
        if (key === "centerId") {
          const ids = asIn(value);
          if (ids && (row.centerId === null || !ids.includes(row.centerId))) return false;
          continue;
        }
      }
    }
    return true;
  }

  /** Lọc THẬT một dòng Enrollment (gồm cả điều kiện lồng leadChild/student). */
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
      if (key === "student") {
        const st = value as Row;
        if (st.deletedAt === null && row.studentDeleted) return false;
        const pu = st.parentUserId as { not?: unknown } | undefined;
        if (pu && "not" in pu && pu.not === null && row.parentUserId === null) return false;
        continue;
      }
    }
    return true;
  }

  /**
   * ⭐ HAI THỰC THỂ CLIENT RIÊNG BIỆT, CÓ CHỦ ĐÍCH.
   *
   * Bản đầu cho `$transaction` gọi `fn(mockDb)` — truyền lại CHÍNH đối tượng `db` làm
   * `tx`. Hệ quả: `tx.enrollment.updateMany` và `db.enrollment.updateMany` là MỘT hàm,
   * còn cờ `inTx` chỉ là THỜI ĐIỂM chứ không phải danh tính ⇒ đổi `tx.` thành `db.` trong
   * service (ghi ra ngoài transaction, lô sau hỏng là `Lead.assignedToId` rollback nhưng
   * `saleId` đã đổi) vẫn để cả bộ test XANH.
   *
   * Nay `inTx` gắn vào DANH TÍNH client: mỗi thao tác biết mình được gọi qua `db` hay qua
   * `tx`, nên `db.enrollment.updateMany` bên trong callback ghi ra `inTx=false` ⇒ ĐỎ.
   */
  function buildClient(viaTx: boolean): Record<string, unknown> {
    const trace = (op: string) => state.trace.push(`${op}(inTx=${viaTx})`);
    return {
    user: {
      findFirst: vi.fn(async (args: Row) => {
        const where = (args.where ?? {}) as Row;
        const hasRole = (where.roles as { has?: string } | undefined)?.has;
        const found = state.users.find(
          (u) =>
            u.id === where.id &&
            (where.isActive === undefined || u.isActive === where.isActive) &&
            (where.deletedAt !== null || u.deletedAt === null) &&
            (!hasRole || u.roles.includes(hasRole)),
        );
        return found ? { id: found.id, name: found.name, centerId: found.centerId } : null;
      }),
    },
    lead: {
      count: vi.fn(async (args: Row) =>
        state.leads.filter((l) => matchLead(l, (args.where ?? {}) as Row)).length,
      ),
      findMany: vi.fn(async (args: Row) =>
        state.leads
          .filter((l) => matchLead(l, (args.where ?? {}) as Row))
          .slice(0, typeof args.take === "number" ? args.take : undefined)
          .map((l) => ({ id: l.id })),
      ),
      updateMany: vi.fn(async (args: Row) => {
        state.leadUpdateArgs.push(args);
        trace("lead.updateMany");
        const hit = state.leads.filter((l) => matchLead(l, (args.where ?? {}) as Row));
        const data = (args.data ?? {}) as Row;
        for (const l of hit) {
          if (typeof data.assignedToId === "string") l.assignedToId = data.assignedToId;
        }
        return { count: hit.length };
      }),
    },
    leadAssignmentHistory: {
      createMany: vi.fn(async (args: Row) => {
        const rows = (args.data ?? []) as Row[];
        state.historyRows.push(...rows);
        trace("history.createMany");
        return { count: rows.length };
      }),
    },
    leadTask: {
      updateMany: vi.fn(async (args: Row) => {
        state.taskUpdateCalls += 1;
        trace("task.updateMany");
        const where = (args.where ?? {}) as Row;
        const leadIds = asIn(where.leadId) ?? [];
        const hit = state.tasks.filter(
          (t) =>
            leadIds.includes(t.leadId) &&
            t.assignedToId === (where.assignedToId as string | null) &&
            t.status === where.status,
        );
        const data = (args.data ?? {}) as Row;
        for (const t of hit) t.assignedToId = (data.assignedToId as string) ?? t.assignedToId;
        return { count: hit.length };
      }),
    },
    enrollment: {
      findMany: vi.fn(async (args: Row) => {
        trace("enrollment.findMany");
        return state.enrollments
          .filter((e) => matchEnrollment(e, (args.where ?? {}) as Row))
          .map((e) => ({
            id: e.id,
            // `centerId` phải có trong select: service chia nhóm theo cơ sở của ghi danh
            // vs cơ sở của sale nhận. Thiếu nó thì mọi ghi danh rơi vào nhánh "khác cơ sở".
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
        // `?? e.saleId` cũ NUỐT mất `saleId: null` (gỡ phân công) — dùng "in" để phân
        // biệt "không đặt" với "đặt bằng null".
        for (const e of hit) {
          if ("saleId" in data) e.saleId = data.saleId as string | null;
        }
        return { count: hit.length };
      }),
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

  /** Client của `$transaction`. Tạo MỘT LẦN để `params.tx === txClient` so được. */
  const txClient = buildClient(true);

  const mockDb: Record<string, unknown> = {
    ...buildClient(false),
    $extends: () => mockDb,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>, opts?: Row) => {
      const index = state.txOptions.length;
      state.txOptions.push(opts ?? null);
      if (index === state.failTxIndex) {
        // Đứt TRƯỚC khi chạy body ⇒ mock giữ đúng ngữ nghĩa "lô này không ghi gì".
        throw new Error("tx hỏng (mô phỏng)");
      }
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
      // Soi `tx` theo DANH TÍNH, không theo thời điểm: bỏ `tx` khỏi lời gọi trong service
      // ⇒ AuditLog ghi ngoài transaction ⇒ nhật ký "ASSIGN" cho lượt đã rollback. Với cờ
      // thời điểm cũ, đột biến đó vẫn XANH.
      const viaTx = params.tx !== undefined && params.tx === state.currentTx;
      state.trace.push(`audit(inTx=${viaTx})`);
    }),
    reconcileDm: vi.fn(async (opts?: Row) => {
      // `inTx` ghi lại TẠI THỜI ĐIỂM GỌI — chuyển lời gọi này vào trong `$transaction`
      // là test nhóm D đỏ ngay (hàm thật chạm `db` trần, không tx-aware).
      state.reconcileArgs.push({ ...(opts ?? {}), inTx: state.inTx });
      if (state.reconcileThrows) throw new Error("reconcile hỏng (mô phỏng)");
      const ids = Array.isArray(opts?.onlyConversationIds)
        ? (opts.onlyConversationIds as string[])
        : [];
      return { dmChecked: ids.length, dmArchived: ids.length, dmSkipped: 0 };
    }),
    syncMembership: vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/db", () => ({ db: h.mockDb }));
vi.mock("@/lib/audit/log", () => ({ logLeadAudit: h.logLeadAudit }));
// Giữ `dmKeyOf` THẬT (công thức khoá 1-1 chỉ được định nghĩa một chỗ — dm.ts:97);
// chỉ thay đường có hiệu ứng phụ.
vi.mock("@/lib/chat/dm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat/dm")>();
  return { ...actual, reconcileDmConversations: h.reconcileDm };
});
// Module này KHÔNG được import bởi service (xem nhóm C). Mock để lời gọi lén lút
// nào cũng lộ ra.
vi.mock("@/lib/chat/sync-membership", () => ({
  syncConversationMembership: h.syncMembership,
  syncCenterClassConversations: h.syncMembership,
}));

import { dmKeyOf } from "@/lib/chat/dm";
import {
  bulkReassignLeads,
  previewHandover,
  HANDOVER_BATCH_SIZE,
} from "@/lib/lead-handover/service";

const OLD_SALE = "sale-my"; // Đinh Thảo My — nghỉ việc
const NEW_SALE = "sale-lien"; // Lê Thị Phương Liên
const CS2 = "center-cs2";
const CS1 = "center-cs1";

function seedUsers(): void {
  h.state.users = [
    {
      id: OLD_SALE,
      name: "Đinh Thảo My",
      roles: ["SALES_CSM"],
      // Đã bị vô hiệu hoá vì nghỉ việc — bàn giao vẫn phải chạy được.
      isActive: false,
      deletedAt: null,
      centerId: CS2,
    },
    {
      id: NEW_SALE,
      name: "Lê Thị Phương Liên",
      roles: ["SALES_CSM"],
      isActive: true,
      deletedAt: null,
      centerId: CS2,
    },
    {
      id: "teacher-1",
      name: "GV Không phải sale",
      roles: ["TEACHER"],
      isActive: true,
      deletedAt: null,
      centerId: CS2,
    },
    {
      id: "sale-cs1",
      name: "Sale cơ sở khác",
      roles: ["SALES_CSM"],
      isActive: true,
      deletedAt: null,
      centerId: CS1,
    },
  ];
}

function lead(id: string, over: Partial<(typeof h.state.leads)[number]> = {}) {
  return {
    id,
    assignedToId: OLD_SALE,
    deletedAt: null,
    status: "CONTACTED",
    utmCampaign: null,
    centerId: CS2,
    ...over,
  };
}

function run(over: Record<string, unknown> = {}) {
  return bulkReassignLeads({
    fromUserId: OLD_SALE,
    toUserId: NEW_SALE,
    filters: {},
    actorId: "qlcs-1",
    actorName: "QLCS CS2",
    reason: "Đinh Thảo My nghỉ việc 08/2026",
    visibleCenterIds: [CS2],
    ...over,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  const s = h.state;
  s.leads = [];
  s.enrollments = [];
  s.tasks = [];
  s.conversations = [];
  s.leadUpdateArgs = [];
  s.enrollmentUpdateArgs = [];
  s.taskUpdateCalls = 0;
  s.historyRows = [];
  s.auditCalls = [];
  s.txOptions = [];
  s.trace = [];
  s.inTx = false;
  s.currentTx = null;
  s.failTxIndex = -1;
  s.reconcileArgs = [];
  s.reconcileThrows = false;
  seedUsers();
});

// ─── A. Người nhận bàn giao ─────────────────────────────────────────────────

describe("A — người nhận bàn giao", () => {
  it("từ chối khi người nhận KHÔNG có vai SALES_CSM (POST tay gán cả sổ cho một GV)", async () => {
    h.state.leads = [lead("l1")];
    const res = await run({ toUserId: "teacher-1" });
    expect(res.ok).toBe(false);
    expect(res.moved).toBe(0);
    // Chưa mở transaction nào ⇒ không có gì bị ghi.
    expect(h.state.txOptions).toHaveLength(0);
  });

  it("từ chối khi người nhận đã bị vô hiệu hoá", async () => {
    h.state.leads = [lead("l1")];
    h.state.users = h.state.users.map((u) =>
      u.id === NEW_SALE ? { ...u, isActive: false } : u,
    );
    const res = await run();
    expect(res.ok).toBe(false);
    expect(h.state.txOptions).toHaveLength(0);
  });

  it("từ chối khi người nhận ở cơ sở NGOÀI tầm nhìn của người bấm", async () => {
    h.state.leads = [lead("l1")];
    const res = await run({ toUserId: "sale-cs1" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/cơ sở/i);
    expect(h.state.txOptions).toHaveLength(0);
  });

  it("SUPER_ADMIN (visibleCenterIds = ALL) bàn giao được sang sale cơ sở khác", async () => {
    h.state.leads = [lead("l1", { centerId: CS1 })];
    const res = await run({ toUserId: "sale-cs1", visibleCenterIds: "ALL" });
    expect(res.ok).toBe(true);
    expect(res.moved).toBe(1);
  });

  it("từ chối khi sale nhận trùng sale bàn giao", async () => {
    const res = await run({ toUserId: OLD_SALE });
    expect(res.ok).toBe(false);
    expect(h.state.txOptions).toHaveLength(0);
  });

  it("KHÔNG đòi sale CŨ còn hoạt động — bàn giao xảy ra đúng lúc họ vừa nghỉ việc", async () => {
    h.state.leads = [lead("l1"), lead("l2")];
    const res = await run();
    expect(res.ok).toBe(true);
    expect(res.moved).toBe(2);
  });
});

// ─── B. Cách ly cơ sở + đường ghi tự bảo vệ ─────────────────────────────────

describe("B — cách ly cơ sở", () => {
  it("lead ngoài tầm nhìn cơ sở KHÔNG lọt vào tập chuyển", async () => {
    h.state.leads = [lead("l-cs2"), lead("l-cs1", { centerId: CS1 })];
    const res = await run();
    expect(res.moved).toBe(1);
    expect(h.state.leads.find((l) => l.id === "l-cs1")?.assignedToId).toBe(OLD_SALE);
  });

  it("lead centerId = null KHÔNG lọt với actor cấp cơ sở (fail-safe)", async () => {
    h.state.leads = [lead("l-null", { centerId: null })];
    const res = await run();
    expect(res.moved).toBe(0);
  });

  it("đường GHI tự bảo vệ: updateMany mang ĐỦ điều kiện lọc, không chỉ danh sách id", async () => {
    h.state.leads = [lead("l1")];
    await run();
    const where = (h.state.leadUpdateArgs[0]?.where ?? {}) as Record<string, unknown>;
    // Nếu chỉ `{ id: { in: [...] } }` thì có khe TOCTOU giữa lúc đọc và lúc ghi.
    expect(where.assignedToId).toBe(OLD_SALE);
    const and = (where.AND ?? []) as Record<string, unknown>[];
    const hasCenterGuard = and.some(
      (b) => (b.centerId as { in?: string[] } | undefined)?.in?.includes(CS2),
    );
    expect(hasCenterGuard).toBe(true);
  });

  it("previewHandover đếm đúng tập mà lượt chạy thật sẽ đụng", async () => {
    h.state.leads = [lead("l1"), lead("l2", { centerId: CS1 })];
    const count = await previewHandover(OLD_SALE, {}, [CS2]);
    expect(count).toBe(1);
  });
});

// ─── C. Trạng thái lọc lạ (thay cho `as never` cũ) ──────────────────────────

describe("C — bộ lọc trạng thái", () => {
  it("trạng thái không có trong LeadStatus bị loại, KHÔNG ném và KHÔNG khớp tất cả", async () => {
    h.state.leads = [lead("l1", { status: "CONTACTED" }), lead("l2", { status: "NEW" })];
    const res = await run({ filters: { statuses: ["KHONG_TON_TAI"] } });
    expect(res.ok).toBe(true);
    expect(res.moved).toBe(0);
  });

  it("giữ đúng những trạng thái hợp lệ trong danh sách hỗn hợp", async () => {
    h.state.leads = [lead("l1", { status: "CONTACTED" }), lead("l2", { status: "NEW" })];
    const res = await run({ filters: { statuses: ["NEW", "KHONG_TON_TAI"] } });
    expect(res.moved).toBe(1);
    expect(h.state.leads.find((l) => l.id === "l2")?.assignedToId).toBe(NEW_SALE);
  });
});

// ─── D. Tư cách hội thoại đi theo phân công (BUG CHÍNH) ─────────────────────

describe("D — kênh riêng Sale↔PH đi theo bàn giao", () => {
  function seedEnrolled(): void {
    h.state.leads = [lead("l-enrolled", { status: "ENROLLED" })];
    h.state.enrollments = [
      {
        id: "e1",
        leadId: "l-enrolled",
        saleId: OLD_SALE,
        status: "STUDYING",
        deletedAt: null,
        centerId: CS2,
        parentUserId: "parent-1",
        studentDeleted: false,
      },
    ];
    h.state.conversations = [
      {
        id: "conv-1",
        dmKey: dmKeyOf(OLD_SALE, "parent-1", "SALE_PARENT"),
        type: "DM_SALE_PARENT",
        status: "ACTIVE",
      },
    ];
  }

  it("Enrollment.saleId của lead vừa bàn giao chuyển sang sale mới, TRONG CÙNG transaction", async () => {
    seedEnrolled();
    const res = await run();
    expect(res.ok).toBe(true);
    expect(res.enrollmentsMoved).toBe(1);
    expect(h.state.enrollments[0]?.saleId).toBe(NEW_SALE);
    expect(h.state.trace).toContain("enrollment.updateMany(inTx=true)");
  });

  it("KHÔNG cướp ghi danh đang do sale KHÁC phụ trách", async () => {
    seedEnrolled();
    h.state.enrollments.push({
      id: "e2",
      leadId: "l-enrolled",
      saleId: "sale-cs1",
      status: "STUDYING",
      deletedAt: null,
      centerId: CS2,
      parentUserId: "parent-2",
      studentDeleted: false,
    });
    const res = await run();
    expect(res.enrollmentsMoved).toBe(1);
    expect(h.state.enrollments.find((e) => e.id === "e2")?.saleId).toBe("sale-cs1");
  });

  it("bỏ qua ghi danh đã XOÁ MỀM (chỉ điều kiện này, vì nó là ngữ nghĩa sở hữu)", async () => {
    seedEnrolled();
    h.state.enrollments.push({
      id: "e-deleted",
      leadId: "l-enrolled",
      saleId: OLD_SALE,
      status: "STUDYING",
      deletedAt: new Date(),
      centerId: CS2,
      parentUserId: "parent-3",
      studentDeleted: false,
    });
    const res = await run();
    expect(res.enrollmentsMoved).toBe(1);
    expect(h.state.enrollments.find((e) => e.id === "e-deleted")?.saleId).toBe(OLD_SALE);
  });

  it("ghi danh PENDING (chờ xếp lớp) VẪN đổi chủ — nếu không, quan hệ SỐNG LẠI khi giáo vụ xếp lớp", async () => {
    // `ENROLLMENT_ACTIVE_STATUS_LIST` KHÔNG có PENDING. Lọc theo bộ đó ở đây thì
    // `saleId` giữ nguyên sale cũ, rồi PENDING → CONFIRMED là `resolveSaleParentRelation`
    // lại trả non-null cho người ĐÃ NGHỈ — job đêm không dọn vì quan hệ lúc đó là THẬT.
    h.state.leads = [lead("l-pending", { status: "ENROLLED" })];
    h.state.enrollments = [
      {
        id: "e-pending",
        leadId: "l-pending",
        saleId: OLD_SALE,
        status: "PENDING",
        deletedAt: null,
        centerId: CS2,
        parentUserId: "parent-9",
        studentDeleted: false,
      },
    ];
    const res = await run();
    expect(res.enrollmentsMoved).toBe(1);
    expect(h.state.enrollments[0]?.saleId).toBe(NEW_SALE);
  });

  it("học viên CHƯA có tài khoản PH VẪN đổi chủ — PH kích hoạt sau phải thấy sale MỚI", async () => {
    h.state.leads = [lead("l-noparent", { status: "ENROLLED" })];
    h.state.enrollments = [
      {
        id: "e-noparent",
        leadId: "l-noparent",
        saleId: OLD_SALE,
        status: "CONFIRMED",
        deletedAt: null,
        centerId: CS2,
        parentUserId: null,
        studentDeleted: false,
      },
    ];
    const res = await run();
    expect(res.enrollmentsMoved).toBe(1);
    expect(h.state.enrollments[0]?.saleId).toBe(NEW_SALE);
    // Không có PH ⇒ không có kênh nào để đóng.
    expect(h.reconcileDm).not.toHaveBeenCalled();
  });

  it("ghi danh KHÁC CƠ SỞ với sale nhận: KHÔNG gán cho sale nhận, và KHÔNG để lại sale cũ", async () => {
    // Bất biến của chính cột này ở đường ghi tay (classes/[id]/students/_actions.ts:
    // "Sale phụ trách phải thuộc cùng cơ sở với lớp"). SUPER_ADMIN (ALL) bỏ qua mọi
    // kiểm theo tầm nhìn ⇒ nếu chỉ dựa vào `visibleCenterIds` thì nhánh kiểm biến mất.
    seedEnrolled();
    h.state.enrollments[0] = { ...h.state.enrollments[0]!, centerId: CS1 }; // sale nhận ở CS2
    const res = await run({ visibleCenterIds: "ALL" });
    expect(res.enrollmentsMoved).toBe(0);
    expect(res.enrollmentsUnassigned).toBe(1);
    expect(h.state.enrollments[0]?.saleId).toBeNull();
    // Và kênh của sale cũ vẫn phải đóng — đây đúng là ca mà bản cũ bỏ sót cả hai.
    expect(h.state.reconcileArgs[0]?.onlyConversationIds).toEqual(["conv-1"]);
  });

  it("ghi danh của HV đã chuyển sang lớp cơ sở khác KHÔNG bị bỏ sót (không lọc theo tầm nhìn actor)", async () => {
    // QLCS CS2 bàn giao; lead ở CS2 nhưng con đã chuyển sang lớp CS1 ⇒ `Enrollment.centerId`
    // = CS1, ngoài tầm nhìn. Bản cũ loại nó khỏi cả tập đổi chủ LẪN `affectedParentIds`
    // ⇒ sale đã nghỉ giữ kênh, job đêm không dọn vì `saleId` vẫn khớp.
    seedEnrolled();
    h.state.enrollments[0] = { ...h.state.enrollments[0]!, centerId: CS1 };
    const res = await run(); // visibleCenterIds = [CS2]
    expect(h.state.enrollments[0]?.saleId).not.toBe(OLD_SALE);
    expect(res.dmArchived).toBe(1);
  });

  it("ghi danh không có cơ sở (lớp HO) vẫn giao được — y như màn học viên của lớp", async () => {
    seedEnrolled();
    h.state.enrollments[0] = { ...h.state.enrollments[0]!, centerId: null };
    const res = await run();
    expect(res.enrollmentsMoved).toBe(1);
    expect(res.enrollmentsUnassigned).toBe(0);
    expect(h.state.enrollments[0]?.saleId).toBe(NEW_SALE);
  });

  it("đường GHI ghi danh tự bảo vệ: updateMany mang điều kiện cơ sở của SALE NHẬN", async () => {
    seedEnrolled();
    await run();
    const where = (h.state.enrollmentUpdateArgs[0]?.where ?? {}) as Record<string, unknown>;
    expect(where.saleId).toBe(OLD_SALE);
    const or = (where.OR ?? []) as Record<string, unknown>[];
    expect(or).toEqual(expect.arrayContaining([{ centerId: CS2 }]));
  });

  it("kênh 1-1 của sale CŨ được đóng qua đúng đường sẵn có, SAU khi tx commit", async () => {
    seedEnrolled();
    const res = await run();
    expect(res.dmArchived).toBe(1);
    expect(h.reconcileDm).toHaveBeenCalledTimes(1);
    expect(h.state.reconcileArgs[0]?.onlyConversationIds).toEqual(["conv-1"]);
    // Đóng kênh chạm `db` trần (không tx-aware) ⇒ bắt buộc nằm NGOÀI transaction.
    expect(h.state.reconcileArgs[0]?.inTx).toBe(false);
  });

  it("không có ghi danh nào đổi chủ ⇒ KHÔNG gọi đường đóng kênh", async () => {
    h.state.leads = [lead("l1")];
    const res = await run();
    expect(res.ok).toBe(true);
    expect(h.reconcileDm).not.toHaveBeenCalled();
  });

  it("đóng kênh hỏng KHÔNG làm hỏng việc bàn giao đã commit (log, không rollback)", async () => {
    seedEnrolled();
    h.state.reconcileThrows = true;
    const res = await run();
    expect(res.ok).toBe(true);
    expect(res.moved).toBe(1);
    expect(res.enrollmentsMoved).toBe(1);
    expect(res.dmArchived).toBe(0);
  });
});

// ─── E. Nhóm lớp KHÔNG bị đụng (quyết định thiết kế) ────────────────────────

describe("E — nhóm lớp (CLASS_GROUP) nằm ngoài phạm vi bàn giao lead", () => {
  it("KHÔNG gọi syncConversationMembership — thành viên nhóm lớp không dẫn xuất từ lead", async () => {
    h.state.leads = [lead("l1", { status: "ENROLLED" })];
    h.state.enrollments = [
      {
        id: "e1",
        leadId: "l1",
        saleId: OLD_SALE,
        status: "STUDYING",
        deletedAt: null,
        centerId: CS2,
        parentUserId: "parent-1",
        studentDeleted: false,
      },
    ];
    const res = await run();
    expect(res.ok).toBe(true);
    // Gọi sync ở đây là no-op tốn kém: `loadDerivedMembership` chỉ đọc
    // Class.teacherId/assistantId, Student.parentUserId + Enrollment.status, và
    // UserOrgRole của cơ sở — không nguồn nào đọc saleId/assignedToId.
    expect(h.syncMembership).not.toHaveBeenCalled();
  });
});

// ─── F. Hiệu năng & an toàn transaction ─────────────────────────────────────

describe("F — chia lô, trần transaction, chạy lại được", () => {
  it("gom theo LÔ: 120 lead ⇒ 3 transaction chứ không phải 120", async () => {
    h.state.leads = Array.from({ length: 120 }, (_, i) => lead(`l${i}`));
    const res = await run();
    expect(res.moved).toBe(120);
    expect(h.state.txOptions).toHaveLength(Math.ceil(120 / HANDOVER_BATCH_SIZE));
  });

  it("mỗi transaction đặt { timeout: 30_000, maxWait: 10_000 } (luật E-bis #2)", async () => {
    h.state.leads = [lead("l1")];
    await run();
    expect(h.state.txOptions[0]).toMatchObject({ timeout: 30_000, maxWait: 10_000 });
  });

  it("chuyển task đang mở: MỘT lời gọi cho cả lô, không phải một lời gọi mỗi lead", async () => {
    h.state.leads = [lead("l1"), lead("l2"), lead("l3")];
    h.state.tasks = [
      { id: "t1", leadId: "l1", assignedToId: OLD_SALE, status: "OPEN" },
      { id: "t2", leadId: "l2", assignedToId: OLD_SALE, status: "OPEN" },
      { id: "t3", leadId: "l3", assignedToId: OLD_SALE, status: "DONE" },
    ];
    const res = await run();
    expect(res.tasksMoved).toBe(2);
    expect(h.state.taskUpdateCalls).toBe(1);
  });

  it("ghi đủ LeadAssignmentHistory + audit cho từng lead (một dòng mỗi lead)", async () => {
    h.state.leads = [lead("l1"), lead("l2")];
    await run();
    expect(h.state.historyRows).toHaveLength(2);
    expect(h.state.auditCalls).toHaveLength(2);
    expect(h.state.trace.filter((t) => t.startsWith("audit"))).toEqual([
      "audit(inTx=true)",
      "audit(inTx=true)",
    ]);
  });

  it("audit mang ĐÚNG client của transaction (không phải `db` trần)", async () => {
    // Soi DANH TÍNH chứ không chỉ "có gọi": bỏ `tx` khỏi `logLeadAudit` thì AuditLog ghi
    // trên kết nối khác ⇒ lô bị rollback vẫn để lại dòng "ASSIGN" — nhật ký nói dối.
    h.state.leads = [lead("l1"), lead("l2")];
    await run();
    expect(h.state.auditCalls).toHaveLength(2);
    for (const call of h.state.auditCalls) {
      expect(call.tx).toBe(h.txClient);
    }
  });

  it("mọi lượt GHI đều đi qua client của transaction, không phải `db` trần", async () => {
    h.state.leads = [lead("l-enrolled", { status: "ENROLLED" })];
    h.state.enrollments = [
      {
        id: "e1",
        leadId: "l-enrolled",
        saleId: OLD_SALE,
        status: "STUDYING",
        deletedAt: null,
        centerId: CS2,
        parentUserId: "parent-1",
        studentDeleted: false,
      },
    ];
    await run();
    // Một lượt ghi lọt ra ngoài transaction là mất tính nguyên tử: lô hỏng ⇒
    // `Lead.assignedToId` quay về sale cũ trong khi `Enrollment.saleId` đã đổi, rồi
    // `archiveDmOfPreviousSale` vẫn đóng kênh của sale cũ ⇒ PH mất kênh với đúng người
    // đang phụ trách mình.
    expect(h.state.trace.filter((t) => t.includes("inTx=false"))).toEqual([]);
  });

  it("đứt giữa chừng: trả về tiến độ đã commit để chạy lại tiếp tục được", async () => {
    h.state.leads = Array.from({ length: 120 }, (_, i) => lead(`l${i}`));
    h.state.failTxIndex = 1; // lô thứ 2 hỏng
    const res = await run();
    expect(res.ok).toBe(false);
    expect(res.moved).toBe(HANDOVER_BATCH_SIZE);
    expect(res.error).toMatch(/chạy lại/i);
  });
});
