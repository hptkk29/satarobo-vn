// @vitest-environment node
/**
 * `lib/lead/assign.ts` — hai đường đổi chủ lead: `autoAssignLead` (round-robin bản cũ)
 * và `reassignOpenLeads` (sale nghỉ việc). Trước file này module có **0 test** (thư mục
 * chỉ có `assign-strategy.test.ts` phủ mấy hàm thuần `pick*`).
 *
 * Bộ test VIẾT TRƯỚC phần hiện thực (luật cứng Nền Hệ thống #5). Ba nhóm bất biến:
 *
 *  A. `assignedAt` — mốc bắt đồng hồ SLA-3 ("đã phân công nhưng chưa liên hệ",
 *     `lib/crm/sla.ts:78` đo TỪ cột này). Cả hai đường trước đây bỏ quên ⇒ đồng hồ của
 *     sale MỚI không bao giờ chạy.
 *
 *  B. `Enrollment.saleId` — cột quyết định kênh riêng Sale↔PH (`DM_SALE_PARENT`, xem
 *     `findSaleAssignedEnrollmentIds` trong lib/chat/dm.ts). Đổi chủ lead mà không kéo
 *     cột này ⇒ sale CŨ vẫn nhắn riêng được phụ huynh, sale MỚI không có kênh, và job
 *     đối soát đêm cũng không dọn vì `saleId` vẫn khớp sale cũ.
 *     ⚠️ Trên hai đường này việc kéo là PHÒNG THỦ (đường thường trả 0 dòng — xem chú
 *     thích tại chỗ trong `assign.ts`), nên test phải dựng đúng ca hiếm để nó có răng.
 *
 *  C. `reassignOpenLeads` chạy trên toàn bộ sổ lead của một người: phải CHIA LÔ, mỗi lô
 *     một transaction có trần 30s, và hỏng giữa chừng thì trả tiến độ THẬT chứ không
 *     nuốt (bản cũ nhét mọi lead vào MỘT `$transaction` không truyền option ⇒ trần mặc
 *     định 5000ms của Prisma, đứt là mất trắng và chỉ còn một dòng log).
 *
 * Mock Prisma ở đây LỌC THẬT theo `where` (không chỉ soi lại đối số truyền vào) — đó là
 * thứ làm bộ test có răng: gỡ một điều kiện trong nguồn là dòng không đáng đụng lọt vào
 * kết quả ngay. Và `tx` là một THỰC THỂ RIÊNG với `db` trần, nên một lượt ghi lọt ra
 * ngoài transaction của caller là lộ ngay.
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

    leadUpdateArgs: [] as Row[],
    enrollmentFindArgs: [] as Row[],
    enrollmentUpdateArgs: [] as Row[],
    activityRows: [] as Row[],
    auditCalls: [] as Row[],
    /** Option của TỪNG `$transaction` — gim `{timeout:30_000, maxWait:10_000}`. */
    txOptions: [] as (Row | null)[],
    /** Thao tác nào chạy qua `tx`, thao tác nào lọt ra `db` trần. */
    trace: [] as string[],
    /** Client mà `$transaction` đang truyền cho callback — soi `tx` theo DANH TÍNH. */
    currentTx: null as unknown,
    inTx: false,
    /** Chỉ số lô cho `$transaction` ném lỗi (mô phỏng đứt giữa chừng). -1 = không. */
    failTxIndex: -1,
    reconcileArgs: [] as Row[],
    /** Số lượt `lead.findMany` đã chạy — để chen ngang đúng lượt đọc cần thiết. */
    leadReadCount: 0,
    /**
     * Chen ngang GIỮA lúc đọc lead và lúc ghi (khe TOCTOU thật: scopedDb không che write).
     * Nhận số thứ tự lượt đọc, để test chọn chen sau lượt đọc lại TRONG tx — chen sớm hơn
     * thì lượt đọc lại đã tự loại dòng bị cướp và test mất khả năng phân biệt
     * `.count` với `ids.length`.
     */
    afterLeadRead: null as null | ((call: number) => void),
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

  function matchLead(row: LeadRow, where: Row): boolean {
    const andRaw = where.AND;
    const blocks: Row[] = [where, ...(Array.isArray(andRaw) ? (andRaw as Row[]) : [])];
    for (const block of blocks) {
      for (const [key, value] of Object.entries(block)) {
        if (key === "AND") continue;
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
        if (key === "status") {
          const notIn = asNotIn(value);
          if (notIn && notIn.includes(row.status)) return false;
          const inList = asIn(value);
          if (inList && !inList.includes(row.status)) return false;
          if (typeof value === "string" && row.status !== value) return false;
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

  /**
   * HAI THỰC THỂ CLIENT RIÊNG BIỆT, có chủ đích: `tx` (client của transaction) và `db`
   * (client trần). Mỗi thao tác ghi lại mình đi qua đường nào, nên đổi `tx.` thành `db.`
   * trong nguồn là trace lộ ngay — với cờ "thời điểm" thì đột biến đó vẫn xanh.
   */
  function buildClient(viaTx: boolean): Record<string, unknown> {
    const label = viaTx ? "tx" : "db";
    const trace = (op: string) => state.trace.push(`${op}(${label})`);
    return {
      user: {
        findMany: vi.fn(async (args: Row) => {
          const where = (args.where ?? {}) as Row;
          const hasRole = (where.roles as { has?: string } | undefined)?.has;
          const ids = asIn(where.id);
          return state.users
            .filter(
              (u) =>
                (!hasRole || u.roles.includes(hasRole)) &&
                (where.isActive === undefined || u.isActive === where.isActive) &&
                (where.deletedAt !== null || u.deletedAt === null) &&
                (where.centerId === undefined || u.centerId === where.centerId) &&
                (!ids || ids.includes(u.id)),
            )
            .map((u) => ({ id: u.id, name: u.name, centerId: u.centerId }));
        }),
        findUnique: vi.fn(async (args: Row) => {
          const where = (args.where ?? {}) as Row;
          const found = state.users.find((u) => u.id === where.id);
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
        // `autoAssignLead` đọc bằng `findFirst` (kèm `deletedAt: null`): `Lead` KHÔNG nằm
        // trong SOFT_DELETE_MODELS (lib/soft-delete.ts) nên base `db` không tự lọc. Mock
        // lọc THẬT theo `where` để một lượt bỏ quên `deletedAt` là lộ ngay.
        findFirst: vi.fn(async (args: Row) => {
          const found = state.leads.find((l) => matchLead(l, (args.where ?? {}) as Row));
          return found
            ? {
                id: found.id,
                centerId: found.centerId,
                status: found.status,
                assignedToId: found.assignedToId,
              }
            : null;
        }),
        // KHÔNG trace: `trace` chỉ ghi các lượt GHI, để `trace` còn dùng được làm lưới
        // "không lượt ghi nào lọt ra ngoài transaction". Đọc ngoài tx là bình thường.
        findMany: vi.fn(async (args: Row) => {
          const rows = state.leads
            .filter((l) => matchLead(l, (args.where ?? {}) as Row))
            .map((l) => ({ id: l.id }));
          state.leadReadCount += 1;
          state.afterLeadRead?.(state.leadReadCount);
          return rows;
        }),
        groupBy: vi.fn(async () => [] as Row[]),
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
        createMany: vi.fn(async (args: Row) => {
          const rows = (args.data ?? []) as Row[];
          state.activityRows.push(...rows);
          trace("activity.createMany");
          return { count: rows.length };
        }),
      },
      enrollment: {
        findMany: vi.fn(async (args: Row) => {
          state.enrollmentFindArgs.push(args);
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

  /** Client của `$transaction`. Tạo MỘT LẦN để so `params.tx === txClient`. */
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
      // Soi `tx` theo DANH TÍNH, không theo thời điểm: bỏ `tx` khỏi lời gọi ⇒ AuditLog ghi
      // ngoài transaction ⇒ nhật ký "ASSIGN" cho lượt đã rollback.
      const viaTx = params.tx !== undefined && params.tx === state.currentTx;
      state.trace.push(`audit(${viaTx ? "tx" : "db"})`);
    }),
    reconcileDm: vi.fn(async (opts?: Row) => {
      // Ghi lại THỜI ĐIỂM gọi: hàm thật chạm `db` trần, gọi trong transaction là đọc
      // trạng thái chưa commit từ kết nối khác.
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
// Giữ `dmKeyOf` THẬT (công thức khoá 1-1 chỉ được định nghĩa một chỗ); chỉ thay đường có
// hiệu ứng phụ.
vi.mock("@/lib/chat/dm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat/dm")>();
  return { ...actual, reconcileDmConversations: h.reconcileDm };
});

import { dmKeyOf } from "@/lib/chat/dm";
import {
  autoAssignLead,
  reassignOpenLeads,
  REASSIGN_BATCH_SIZE,
  REASSIGN_TX_OPTIONS,
} from "@/lib/lead/assign";

const LEAVING = "sale-my"; // Đinh Thảo My — nghỉ việc
const SALE_A = "sale-a-lien"; // cùng CS2
const SALE_B = "sale-b-tuan"; // CS1
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
    saleId: LEAVING,
    status: "STUDYING",
    deletedAt: null as Date | null,
    centerId: CS2,
    parentUserId: "parent-1",
    ...over,
  };
}

function seedUsers(): void {
  h.state.users = [
    {
      id: LEAVING,
      name: "Đinh Thảo My",
      roles: ["SALES_CSM"],
      isActive: false, // đã bị vô hiệu hoá vì nghỉ việc
      deletedAt: null,
      centerId: CS2,
    },
    { id: SALE_A, name: "Lê Phương Liên", roles: ["SALES_CSM"], isActive: true, deletedAt: null, centerId: CS2 },
    { id: SALE_B, name: "Trần Anh Tuấn", roles: ["SALES_CSM"], isActive: true, deletedAt: null, centerId: CS1 },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  const s = h.state;
  seedUsers();
  s.leads = [];
  s.enrollments = [];
  s.conversations = [];
  s.leadUpdateArgs = [];
  s.enrollmentFindArgs = [];
  s.enrollmentUpdateArgs = [];
  s.activityRows = [];
  s.auditCalls = [];
  s.txOptions = [];
  s.trace = [];
  s.currentTx = null;
  s.inTx = false;
  s.failTxIndex = -1;
  s.reconcileArgs = [];
  s.leadReadCount = 0;
  s.afterLeadRead = null;
});

// ═══════════════════════════════════════════════════════════════════════════
// autoAssignLead — round-robin bản cũ
// ═══════════════════════════════════════════════════════════════════════════

describe("autoAssignLead", () => {
  it("đặt assignedAt: đồng hồ SLA-3 của sale được phân công bắt đầu từ đây", async () => {
    // Không có dòng này thì `!firstContactAt && over(assignedAt, now, 3h)`
    // (lib/crm/sla.ts:78) không bao giờ chạy — cột vẫn null.
    h.state.leads = [lead("l1")];
    const before = Date.now();
    const res = await autoAssignLead("l1", ACTOR);
    expect(res.ok).toBe(true);
    const row = h.state.leads[0];
    expect(row?.assignedToId).toBe(SALE_A);
    expect(row?.assignedAt).toBeInstanceOf(Date);
    expect(row?.assignedAt?.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("giữ nguyên NEW→ASSIGNED", async () => {
    h.state.leads = [lead("l1", { status: "NEW" })];
    await autoAssignLead("l1", ACTOR);
    expect(h.state.leads[0]?.status).toBe("ASSIGNED");
  });

  it("ĐƯỜNG THƯỜNG (lead chưa có chủ) ⇒ KHÔNG đụng ghi danh nào", async () => {
    // Nút trên kanban chỉ hiện khi `!lead.assignedToName`, và đường webhook chạy trên lead
    // vừa tạo ⇒ không tồn tại "sale cũ". Suy diễn thành `where: { saleId: null }` ở đây là
    // VƠ hết ghi danh mà ai đó vừa cố ý gỡ sale ở màn học viên của lớp.
    h.state.leads = [lead("l1", { assignedToId: null })];
    h.state.enrollments = [enrollment("e-mo-coi", { saleId: null })];
    const res = await autoAssignLead("l1", ACTOR);
    expect(res.ok).toBe(true);
    expect(h.state.trace.filter((t) => t.startsWith("enrollment."))).toEqual([]);
    expect(h.state.enrollments[0]?.saleId).toBeNull();
  });

  it("CA HIẾM (gọi trên lead ĐÃ có chủ) ⇒ kéo Enrollment.saleId sang người mới", async () => {
    // Server action không lọc status nên một POST tay gọi được trên lead ENROLLED — đúng
    // nhóm lead mang `Enrollment.saleId` + kênh riêng Sale↔PH.
    h.state.leads = [lead("l1", { assignedToId: LEAVING, status: "ENROLLED" })];
    h.state.enrollments = [enrollment("e1", { centerId: CS2 })];
    const res = await autoAssignLead("l1", ACTOR);
    expect(res.ok).toBe(true);
    expect(res.assignedToId).toBe(SALE_A);
    expect(res.enrollmentsMoved).toBe(1);
    expect(h.state.enrollments[0]?.saleId).toBe(SALE_A);
  });

  it("ghi danh khác cơ sở với người nhận ⇒ GIỮ NGUYÊN sale cũ, KHÔNG gỡ phân công", async () => {
    h.state.leads = [lead("l1", { assignedToId: LEAVING, status: "ENROLLED" })];
    h.state.enrollments = [enrollment("e-cs1", { centerId: CS1 })];
    const res = await autoAssignLead("l1", ACTOR);
    // Đây là lượt round-robin giữa vận hành bình thường: sale cũ CÒN LÀM VIỆC. Gỡ phân
    // công ở đây là xoá việc của một người đang chăm khách — ghi danh mất người phụ trách
    // và phụ huynh mất luôn kênh riêng. `UNASSIGN` chỉ dành cho đường sale nghỉ việc
    // (`reassignOpenLeads` / `bulkReassignLeads`), nơi để nguyên mới là bug.
    expect(res.enrollmentsUnassigned).toBe(0);
    expect(res.enrollmentsKept).toBe(1);
    expect(h.state.enrollments[0]?.saleId).toBe(LEAVING);
  });

  it("đóng kênh riêng của sale CŨ, và gọi SAU khi transaction commit", async () => {
    h.state.leads = [lead("l1", { assignedToId: LEAVING, status: "ENROLLED" })];
    h.state.enrollments = [enrollment("e1", { parentUserId: "parent-1" })];
    h.state.conversations = [
      {
        id: "conv-1",
        dmKey: dmKeyOf(LEAVING, "parent-1", "SALE_PARENT"),
        type: "DM_SALE_PARENT",
        status: "ACTIVE",
      },
    ];
    const res = await autoAssignLead("l1", ACTOR);
    expect(res.dmArchived).toBe(1);
    // Trong tx thì `reconcileDmConversations` (chạm `db` trần) đọc trạng thái CHƯA commit
    // từ một kết nối khác ⇒ kết luận sai.
    expect(h.state.reconcileArgs[0]?.inTx).toBe(false);
  });

  it("round-robin chọn TRÚNG chính người đang phụ trách ⇒ KHÔNG đụng ghi danh", async () => {
    // Kéo X→X là vô nghĩa, nhưng luật L2 vẫn chạy: ghi danh khác cơ sở với X sẽ bị GỠ
    // sạch trong một thao tác mà người dùng tưởng là no-op.
    h.state.users = [
      { id: SALE_A, name: "Lê Phương Liên", roles: ["SALES_CSM"], isActive: true, deletedAt: null, centerId: CS2 },
    ];
    h.state.leads = [lead("l1", { assignedToId: SALE_A, status: "ENROLLED" })];
    h.state.enrollments = [enrollment("e-cs1", { saleId: SALE_A, centerId: CS1 })];
    const res = await autoAssignLead("l1", ACTOR);
    expect(res.assignedToId).toBe(SALE_A);
    expect(h.state.trace.filter((t) => t.startsWith("enrollment."))).toEqual([]);
    expect(h.state.enrollments[0]?.saleId).toBe(SALE_A);
  });

  it("activity giữ metadata cũ VÀ mang cờ system (nếu thiếu, auto-chia bị khoá)", async () => {
    // `hasSaleInteraction` (lib/lead/auto-assign.ts:25-36) coi NOTE KHÔNG mang
    // `metadata.system = true` là "sale đã tương tác".
    h.state.leads = [lead("l1")];
    await autoAssignLead("l1", ACTOR);
    expect(h.state.activityRows).toHaveLength(1);
    const row = h.state.activityRows[0] ?? {};
    expect(row.type).toBe("NOTE");
    expect(row.content).toBe("Phân công cho Lê Phương Liên (round-robin)");
    expect(row.metadata).toEqual({ assignedToId: SALE_A, system: true });
  });

  it("audit ASSIGN vẫn ghi TRONG transaction", async () => {
    h.state.leads = [lead("l1", { assignedToId: LEAVING })];
    await autoAssignLead("l1", ACTOR);
    expect(h.state.auditCalls[0]).toMatchObject({
      action: "ASSIGN",
      oldValues: { assignedToId: LEAVING },
      newValues: { assignedToId: SALE_A },
    });
    expect(h.state.trace).toContain("audit(tx)");
    expect(h.state.trace.filter((t) => t.endsWith("(db)"))).toEqual([]);
  });

  it("transaction gánh thêm việc ⇒ phải nới trần 30s (mặc định Prisma là 5s)", async () => {
    h.state.leads = [lead("l1", { assignedToId: LEAVING, status: "ENROLLED" })];
    h.state.enrollments = [enrollment("e1")];
    await autoAssignLead("l1", ACTOR);
    expect(h.state.txOptions[0]).toEqual(REASSIGN_TX_OPTIONS);
  });

  it("không có sale nào ⇒ trả lỗi, không ghi gì", async () => {
    h.state.users = [];
    h.state.leads = [lead("l1")];
    const res = await autoAssignLead("l1", ACTOR);
    expect(res).toEqual({ ok: false, error: "Không có SALES_CSM active để gán" });
    expect(h.state.trace).toEqual([]);
  });

  it("lead không tồn tại ⇒ trả lỗi, không mở transaction", async () => {
    const res = await autoAssignLead("khong-co", ACTOR);
    expect(res.ok).toBe(false);
    expect(h.state.txOptions).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // [F1] CÁCH LY CƠ SỞ (chống IDOR ghi) — cùng khuôn `manualAssignLead`
  // (lib/lead/auto-assign.ts). Cổng `leads:assign` ở tầng action KHÔNG cắt được: quyền
  // đó seed `scopeType: "GLOBAL"` cho CENTER_MANAGER (prisma/seed-roles.ts) ⇒ nhánh
  // GLOBAL của `can()` v2 khớp MỌI `target.centerId`. Nút trên kanban có lọc, nhưng đó
  // là UI — Server Action là endpoint công khai.
  //
  // `visibleCenterIds` MẶC ĐỊNH "ALL" (khác `manualAssignLead`, nơi nó bắt buộc): hàm này
  // còn có call-site HỆ THỐNG không có người bấm (`lib/lead/intake/ingest.ts` — webhook),
  // và ở đó không tồn tại "tầm nhìn cơ sở" nào để đo.
  // ─────────────────────────────────────────────────────────────────────────

  it("[F1] lead NGOÀI tầm nhìn cơ sở ⇒ từ chối, KHÔNG mở transaction, KHÔNG chạm ghi danh", async () => {
    h.state.leads = [lead("l1", { assignedToId: LEAVING, status: "ENROLLED", centerId: CS2 })];
    h.state.enrollments = [enrollment("e1", { centerId: CS2 })];
    const res = await autoAssignLead("l1", ACTOR, [CS1]);
    expect(res).toMatchObject({ ok: false, error: "Lead không tồn tại" });
    expect(h.state.txOptions).toEqual([]);
    expect(h.state.trace).toEqual([]);
    expect(h.state.leads[0]?.assignedToId).toBe(LEAVING);
    expect(h.state.enrollments[0]?.saleId).toBe(LEAVING);
  });

  it("[F1] thông điệp TRÙNG nhánh không-tồn-tại (không lộ lead cơ sở khác)", async () => {
    h.state.leads = [lead("l1", { centerId: CS2 })];
    const ngoai = await autoAssignLead("l1", ACTOR, [CS1]);
    const khongCo = await autoAssignLead("khong-co", ACTOR, [CS1]);
    expect(ngoai.error).toBe(khongCo.error);
  });

  it("[F1] lead ĐÃ XOÁ MỀM ⇒ từ chối (bản cũ dùng findUnique trần nên gán được)", async () => {
    h.state.leads = [lead("l1", { deletedAt: new Date() })];
    const res = await autoAssignLead("l1", ACTOR);
    expect(res).toMatchObject({ ok: false, error: "Lead không tồn tại" });
    expect(h.state.txOptions).toEqual([]);
  });

  it("[F1] lead centerId null + người bấm cấp cơ sở ⇒ từ chối (Lead ∉ NULL_IS_GLOBAL_MODELS)", async () => {
    h.state.leads = [lead("l1", { centerId: null })];
    const res = await autoAssignLead("l1", ACTOR, [CS2]);
    expect(res).toMatchObject({ ok: false, error: "Lead không tồn tại" });
    expect(h.state.txOptions).toEqual([]);
  });

  it("[F1] fallback toàn hệ thống chọn trúng sale cơ sở khác ⇒ từ chối, không ghi gì", async () => {
    // Cơ sở của lead không còn sale nào active ⇒ `getSalesLoad(null)`. Không có rào này
    // thì QLCS đẩy được lead của mình sang sale cơ sở khác — và kéo luôn `Enrollment.saleId`.
    h.state.users = [
      { id: SALE_A, name: "Lê Phương Liên", roles: ["SALES_CSM"], isActive: true, deletedAt: null, centerId: CS2 },
    ];
    h.state.leads = [lead("l1", { centerId: CS1 })];
    const res = await autoAssignLead("l1", ACTOR, [CS1]);
    expect(res).toMatchObject({ ok: false, error: "Sale nhận không thuộc cơ sở bạn quản lý" });
    expect(h.state.txOptions).toEqual([]);
    expect(h.state.trace).toEqual([]);
  });

  it("[F1] lead TRONG tầm nhìn + sale cùng cơ sở ⇒ chạy như thường", async () => {
    h.state.leads = [lead("l1", { centerId: CS2 })];
    const res = await autoAssignLead("l1", ACTOR, [CS2]);
    expect(res).toMatchObject({ ok: true, assignedToId: SALE_A });
  });

  it("[F1] cổng GHI tự mang điều kiện: deletedAt + cách ly cơ sở", async () => {
    // Bản cũ để `leadWhere` TRỐNG ⇒ lệnh ghi đi theo id trần, toàn bộ cách ly nằm ở lượt
    // đọc ngoài transaction (khe TOCTOU).
    h.state.leads = [lead("l1", { centerId: CS2 })];
    await autoAssignLead("l1", ACTOR, [CS2]);
    expect(h.state.leadUpdateArgs[0]?.where).toMatchObject({
      deletedAt: null,
      centerId: { in: [CS2] },
    });
  });

  it("[F1] người bấm thấy MỌI cơ sở ⇒ where chỉ có deletedAt, không thêm điều kiện cơ sở", async () => {
    h.state.leads = [lead("l1", { centerId: null })];
    await autoAssignLead("l1", ACTOR);
    expect(h.state.leadUpdateArgs[0]?.where).toMatchObject({ deletedAt: null });
    expect(h.state.leadUpdateArgs[0]?.where).not.toHaveProperty("centerId");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// reassignOpenLeads — sale nghỉ việc
// ═══════════════════════════════════════════════════════════════════════════

/** N lead "đang mở" của người sắp nghỉ. */
function seedOpenLeads(n: number): string[] {
  const ids = Array.from({ length: n }, (_, i) => `l${String(i).padStart(3, "0")}`);
  h.state.leads = ids.map((id) => lead(id, { assignedToId: LEAVING, status: "CONTACTED" }));
  return ids;
}

describe("reassignOpenLeads — chia lô + trần transaction (mục C)", () => {
  it("CHIA LÔ: nhiều lead hơn một lô ⇒ nhiều transaction, mỗi cái có trần 30s", async () => {
    // Bản cũ nhét TẤT CẢ lead vào MỘT `$transaction` không truyền option ⇒ trần mặc định
    // 5000ms của Prisma; sổ lead của một sale nghỉ việc thừa sức vượt.
    const n = REASSIGN_BATCH_SIZE + 3;
    seedOpenLeads(n);
    h.state.users = [
      { id: LEAVING, name: "My", roles: ["SALES_CSM"], isActive: false, deletedAt: null, centerId: CS2 },
      { id: SALE_A, name: "Liên", roles: ["SALES_CSM"], isActive: true, deletedAt: null, centerId: CS2 },
    ];
    const res = await reassignOpenLeads(LEAVING, ACTOR);
    expect(res.ok).toBe(true);
    expect(res.reassigned).toBe(n);
    expect(res.total).toBe(n);
    expect(h.state.txOptions).toHaveLength(2);
    expect(h.state.txOptions.every((o) => o?.timeout === 30_000 && o?.maxWait === 10_000)).toBe(true);
  });

  it("đặt assignedAt cho MỌI lead được chia lại", async () => {
    seedOpenLeads(2);
    const before = Date.now();
    await reassignOpenLeads(LEAVING, ACTOR);
    for (const l of h.state.leads) {
      expect(l.assignedAt).toBeInstanceOf(Date);
      expect(l.assignedAt?.getTime()).toBeGreaterThanOrEqual(before);
    }
  });

  it("chia cho NHIỀU người nhận theo round-robin, mỗi lead một chủ mới", async () => {
    // Hai sale còn lại CÙNG cơ sở với người nghỉ — `getSalesLoad` lọc theo `centerId` của
    // người nghỉ trước, nên sale khác cơ sở không vào lượt chia này.
    h.state.users = [
      { id: LEAVING, name: "My", roles: ["SALES_CSM"], isActive: false, deletedAt: null, centerId: CS2 },
      { id: SALE_A, name: "Liên", roles: ["SALES_CSM"], isActive: true, deletedAt: null, centerId: CS2 },
      { id: "sale-c-hoa", name: "Hoà", roles: ["SALES_CSM"], isActive: true, deletedAt: null, centerId: CS2 },
    ];
    seedOpenLeads(4);
    const res = await reassignOpenLeads(LEAVING, ACTOR);
    expect(res.ok).toBe(true);
    expect(res.reassigned).toBe(4);
    const owners = h.state.leads.map((l) => l.assignedToId);
    expect(owners.filter((o) => o === LEAVING)).toHaveLength(0);
    // Round-robin cân trên tải hiện có ⇒ 4 lead chia cho đúng 2 người.
    expect(new Set(owners).size).toBe(2);
  });

  it("số liệu trả về đếm bằng .count THẬT: lead bị đường khác lấy mất không được tính", async () => {
    // 7 đường đổi chủ lead cùng tồn tại; bản cũ trả `openLeads.length` — con số DỰ KIẾN,
    // không phải con số đã ghi.
    //
    // Chen ngang ở lượt đọc THỨ HAI (lượt đọc lại bên TRONG transaction) chứ không phải
    // lượt đầu: chen ở lượt đầu thì chính lượt đọc lại đã tự loại dòng bị cướp, và test
    // không còn phân biệt được `.count` của `updateMany` với độ dài danh sách đã đọc.
    seedOpenLeads(3);
    h.state.users = [
      { id: LEAVING, name: "My", roles: ["SALES_CSM"], isActive: false, deletedAt: null, centerId: CS2 },
      { id: SALE_A, name: "Liên", roles: ["SALES_CSM"], isActive: true, deletedAt: null, centerId: CS2 },
    ];
    h.state.afterLeadRead = (call) => {
      if (call !== 2) return;
      const row = h.state.leads[0];
      if (row) row.assignedToId = "sale-khac";
    };
    const res = await reassignOpenLeads(LEAVING, ACTOR);
    expect(res.total).toBe(3);
    // Lệnh ghi mang đủ `leadWhere` (`assignedToId = người nghỉ`) nên nó KHÔNG cướp lại
    // dòng đã đổi chủ, và con số báo về phải phản ánh đúng điều đó.
    expect(res.reassigned).toBe(2);
    expect(h.state.leads[0]?.assignedToId).toBe("sale-khac");
  });

  it("lô hỏng ⇒ DỪNG và trả tiến độ thật + error nêu rõ đã lưu bao nhiêu", async () => {
    const n = REASSIGN_BATCH_SIZE + 5;
    seedOpenLeads(n);
    h.state.users = [
      { id: LEAVING, name: "My", roles: ["SALES_CSM"], isActive: false, deletedAt: null, centerId: CS2 },
      { id: SALE_A, name: "Liên", roles: ["SALES_CSM"], isActive: true, deletedAt: null, centerId: CS2 },
    ];
    h.state.failTxIndex = 1; // lô thứ hai đứt
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await reassignOpenLeads(LEAVING, ACTOR);
    expect(res.ok).toBe(false);
    // Lô 1 ĐÃ commit — không rollback ngược được, nên phải báo đúng phần đã lưu.
    expect(res.reassigned).toBe(REASSIGN_BATCH_SIZE);
    expect(res.total).toBe(n);
    expect(res.batchesDone).toBe(1);
    expect(res.batchesTotal).toBe(2);
    expect(res.error).toContain(String(REASSIGN_BATCH_SIZE));
    expect(res.error).toContain("chạy lại");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("KHÔNG ném ra ngoài khi lô hỏng — lỗi đi bằng giá trị trả về", async () => {
    // Call-site thật (`toggleUserActive`) bọc `.catch(console.error)` và BỎ giá trị trả về;
    // ném ra ngoài thì thông tin mất sạch, còn trả về thì ít nhất có đường để đọc.
    seedOpenLeads(2);
    h.state.failTxIndex = 0;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(reassignOpenLeads(LEAVING, ACTOR)).resolves.toMatchObject({ ok: false });
    spy.mockRestore();
  });

  it("kéo Enrollment.saleId theo cơ sở của NGƯỜI NHẬN (luật L2)", async () => {
    seedOpenLeads(2);
    h.state.users = [
      { id: LEAVING, name: "My", roles: ["SALES_CSM"], isActive: false, deletedAt: null, centerId: CS2 },
      { id: SALE_A, name: "Liên", roles: ["SALES_CSM"], isActive: true, deletedAt: null, centerId: CS2 },
    ];
    h.state.enrollments = [
      enrollment("e-cs2", { leadId: "l000", centerId: CS2 }),
      enrollment("e-cs1", { leadId: "l001", centerId: CS1 }),
    ];
    const res = await reassignOpenLeads(LEAVING, ACTOR);
    expect(res.enrollmentsMoved).toBe(1);
    expect(res.enrollmentsUnassigned).toBe(1);
    expect(h.state.enrollments.find((e) => e.id === "e-cs2")?.saleId).toBe(SALE_A);
    expect(h.state.enrollments.find((e) => e.id === "e-cs1")?.saleId).toBeNull();
  });

  it("đóng kênh riêng của sale nghỉ, SAU khi mọi lô đã commit", async () => {
    seedOpenLeads(1);
    h.state.users = [
      { id: LEAVING, name: "My", roles: ["SALES_CSM"], isActive: false, deletedAt: null, centerId: CS2 },
      { id: SALE_A, name: "Liên", roles: ["SALES_CSM"], isActive: true, deletedAt: null, centerId: CS2 },
    ];
    h.state.enrollments = [enrollment("e1", { leadId: "l000", parentUserId: "parent-9" })];
    h.state.conversations = [
      {
        id: "conv-9",
        dmKey: dmKeyOf(LEAVING, "parent-9", "SALE_PARENT"),
        type: "DM_SALE_PARENT",
        status: "ACTIVE",
      },
    ];
    const res = await reassignOpenLeads(LEAVING, ACTOR);
    expect(res.dmArchived).toBe(1);
    expect(h.state.reconcileArgs[0]?.inTx).toBe(false);
  });

  it("activity + audit vẫn ghi cho từng lead, TRONG transaction", async () => {
    seedOpenLeads(2);
    h.state.users = [
      { id: LEAVING, name: "My", roles: ["SALES_CSM"], isActive: false, deletedAt: null, centerId: CS2 },
      { id: SALE_A, name: "Liên", roles: ["SALES_CSM"], isActive: true, deletedAt: null, centerId: CS2 },
    ];
    await reassignOpenLeads(LEAVING, ACTOR);
    expect(h.state.activityRows).toHaveLength(2);
    expect(h.state.activityRows[0]?.content).toBe("Chia lại lead → Liên (sale cũ nghỉ)");
    expect(h.state.activityRows[0]?.metadata).toMatchObject({ system: true });
    expect(h.state.auditCalls).toHaveLength(2);
    expect(h.state.trace.filter((t) => t.endsWith("(db)"))).toEqual([]);
  });

  it("giữ nguyên: không còn SALES_CSM nào ⇒ ok:false với đúng câu cũ", async () => {
    seedOpenLeads(2);
    h.state.users = [
      { id: LEAVING, name: "My", roles: ["SALES_CSM"], isActive: false, deletedAt: null, centerId: CS2 },
    ];
    const res = await reassignOpenLeads(LEAVING, ACTOR);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Không còn SALES_CSM để chia");
    expect(res.reassigned).toBe(0);
    expect(h.state.txOptions).toEqual([]);
  });

  it("giữ nguyên: không có lead mở nào ⇒ ok:true, reassigned 0, không mở transaction", async () => {
    h.state.leads = [lead("l1", { assignedToId: LEAVING, status: "ENROLLED" })];
    const res = await reassignOpenLeads(LEAVING, ACTOR);
    expect(res).toMatchObject({ ok: true, reassigned: 0 });
    expect(h.state.txOptions).toEqual([]);
  });

  it("giữ nguyên: lead ĐÃ ĐÓNG (ENROLLED/LOST/DUPLICATE) không nằm trong lượt chia", async () => {
    h.state.leads = [
      lead("l-open", { assignedToId: LEAVING, status: "CONTACTED" }),
      lead("l-enrolled", { assignedToId: LEAVING, status: "ENROLLED" }),
      lead("l-lost", { assignedToId: LEAVING, status: "LOST" }),
    ];
    const res = await reassignOpenLeads(LEAVING, ACTOR);
    expect(res.reassigned).toBe(1);
    expect(h.state.leads.find((l) => l.id === "l-enrolled")?.assignedToId).toBe(LEAVING);
  });
});
