// @vitest-environment node
/**
 * `lib/lead/assignment-core.ts` — MỘT chỗ dùng chung cho việc "đổi chủ một lead".
 * Bộ test VIẾT TRƯỚC phần hiện thực (luật cứng Nền Hệ thống #5).
 *
 * Vì sao tách helper: repo có **7 đường** đổi chủ lead (bulkReassignLeads ·
 * manualAssignLead · autoAssignLead · autoAssignNewLead · transferLead ·
 * reassignOpenLeads · assignSale-đã-chết). Đúng MỘT đường trong số đó kéo theo
 * `Enrollment.saleId` — cột quyết định kênh riêng Sale↔PH (`findSaleAssignedEnrollmentIds`,
 * lib/chat/dm.ts) — và cũng đúng một luật `assignedAt` bị bỏ quên ở cả 7. Mỗi đường một
 * kiểu là cách chắc chắn để bản vá của đường này không tới được đường kia.
 *
 * BỐN BẤT BIẾN ĐƯỢC GIM Ở ĐÂY (mỗi cái đều kiểm ngược được bằng đột biến — gỡ điều
 * kiện tương ứng trong helper thì có test ĐỎ):
 *
 *  L1. BỘ LỌC CHỌN GHI DANH CHỈ MANG NGỮ NGHĨA SỞ HỮU (`saleId` = sale cũ, chưa xoá mềm,
 *      truy vết về đúng lead vừa đổi chủ). KHÔNG `status`, KHÔNG `parentUserId ≠ null`,
 *      KHÔNG cách ly cơ sở của NGƯỜI BẤM. Ghi danh rơi ra ngoài sẽ GIỮ `saleId` của sale
 *      cũ, mà quan hệ Sale↔PH được đánh giá TẠI THỜI ĐIỂM HỎI ⇒ nó sống lại về sau.
 *
 *  L2. SALE NHẬN PHẢI CÙNG CƠ SỞ VỚI GHI DANH — so với cơ sở của SALE NHẬN, không phải
 *      cơ sở của lead. Ghi danh khác cơ sở thì KHÔNG giao cho người nhận; số phận của nó
 *      do `strandedPolicy` quyết định: mặc định GIỮ NGUYÊN sale cũ, và CHỈ đường bàn giao
 *      khi sale NGHỈ VIỆC mới GỠ phân công (`saleId = null`).
 *
 *  L3. `assignedAt` là mốc bắt đồng hồ SLA (lib/crm/sla.ts:78 — "chưa liên hệ khách > 3h"
 *      tính TỪ `assignedAt`). Không đặt lại thì đồng hồ của sale MỚI không bao giờ chạy,
 *      hoặc chạy từ mốc của sale CŨ.
 *
 *  L4. Không có sale cũ (`fromUserId = null`) ⇒ TUYỆT ĐỐI không chạm ghi danh. Đây là
 *      nhánh của `autoAssignNewLead` (lead chưa ai phụ trách): "kéo cho đều" ở đây thành
 *      NHẬN VƠ ghi danh mà ai đó vừa cố ý gỡ sale ở màn học viên của lớp.
 *
 * Mock Prisma ở đây LỌC THẬT theo `where` (không chỉ soi lại đối số truyền vào) — đó là
 * thứ làm bộ test có răng: gỡ một điều kiện trong helper là dòng không đáng đụng lọt vào
 * kết quả ngay. Và mỗi thao tác ghi lại mình được gọi qua `tx` hay qua `db` TRẦN, để một
 * lượt ghi lọt ra ngoài transaction của caller là lộ ngay.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

const h = vi.hoisted(() => {
  type LeadRow = {
    id: string;
    assignedToId: string | null;
    assignedAt: Date | null;
    handoverNote: string | null;
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
  type Row = Record<string, unknown>;

  const state = {
    leads: [] as LeadRow[],
    enrollments: [] as EnrollmentRow[],
    conversations: [] as { id: string; dmKey: string; type: string; status: string }[],

    /** Đối số của mọi lời gọi — để soi "đường ghi có tự bảo vệ không". */
    leadUpdateArgs: [] as Row[],
    /** Lời gọi ghi kép `centerId` → `orgUnitId` (cơ chế thật ở lib/org/dual-write.ts). */
    fillArgs: [] as Row[],
    enrollmentFindArgs: [] as Row[],
    enrollmentUpdateArgs: [] as Row[],
    activityArgs: [] as Row[],
    /** Thao tác nào chạy qua `tx`, thao tác nào lọt ra `db` trần. */
    trace: [] as string[],
    reconcileArgs: [] as Row[],
    reconcileThrows: false,
    /**
     * Chen ngang GIỮA lúc đọc ghi danh và lúc ghi (khe TOCTOU thật: scopedDb không che
     * write). Dùng để chứng minh số liệu trả về lấy từ `.count` của updateMany chứ không
     * phải `takeable.length`.
     */
    afterEnrollmentRead: null as null | (() => void),
  };

  const asIn = (v: unknown): string[] | null => {
    if (typeof v !== "object" || v === null) return null;
    const arr = (v as { in?: unknown }).in;
    return Array.isArray(arr) ? (arr as string[]) : null;
  };

  /** Lọc THẬT một dòng Lead theo `where` (kể cả nhánh AND mà caller dựng). */
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
        if (key === "centerId") {
          const ids = asIn(value);
          if (ids && (row.centerId === null || !ids.includes(row.centerId))) return false;
          continue;
        }
      }
    }
    return true;
  }

  /** Lọc THẬT một dòng Enrollment (gồm cả điều kiện lồng leadChild). */
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
        const pu = st.parentUserId as { not?: unknown } | undefined;
        if (pu && "not" in pu && pu.not === null && row.parentUserId === null) return false;
        continue;
      }
    }
    return true;
  }

  /**
   * HAI THỰC THỂ CLIENT RIÊNG BIỆT, có chủ đích: `tx` (client của transaction caller) và
   * `db` (client trần). Mỗi thao tác ghi lại mình đi qua đường nào, nên đổi `tx.` thành
   * `db.` trong helper là trace lộ ngay — với cờ "thời điểm" thì đột biến đó vẫn xanh.
   */
  function buildClient(viaTx: boolean): Record<string, unknown> {
    const label = viaTx ? "tx" : "db";
    const trace = (op: string) => state.trace.push(`${op}(${label})`);
    return {
      lead: {
        updateMany: vi.fn(async (args: Row) => {
          state.leadUpdateArgs.push(args);
          trace("lead.updateMany");
          const hit = state.leads.filter((l) => matchLead(l, (args.where ?? {}) as Row));
          const data = (args.data ?? {}) as Row;
          for (const l of hit) {
            if ("assignedToId" in data) l.assignedToId = data.assignedToId as string | null;
            if ("assignedAt" in data) l.assignedAt = data.assignedAt as Date | null;
            if ("handoverNote" in data && typeof data.handoverNote === "string") {
              l.handoverNote = data.handoverNote;
            }
            if ("status" in data && typeof data.status === "string") l.status = data.status;
          }
          return { count: hit.length };
        }),
      },
      enrollment: {
        findMany: vi.fn(async (args: Row) => {
          state.enrollmentFindArgs.push(args);
          trace("enrollment.findMany");
          const rows = state.enrollments
            .filter((e) => matchEnrollment(e, (args.where ?? {}) as Row))
            .map((e) => ({
              id: e.id,
              // `centerId` phải có trong select: helper chia nhóm theo cơ sở của ghi danh
              // vs cơ sở của sale nhận. Thiếu nó thì mọi ghi danh rơi vào nhánh "khác cơ sở".
              centerId: e.centerId,
              leadChild: { leadId: e.leadId },
              student: { parentUserId: e.parentUserId },
            }));
          state.afterEnrollmentRead?.();
          return rows;
        }),
        updateMany: vi.fn(async (args: Row) => {
          state.enrollmentUpdateArgs.push(args);
          trace("enrollment.updateMany");
          const hit = state.enrollments.filter((e) =>
            matchEnrollment(e, (args.where ?? {}) as Row),
          );
          const data = (args.data ?? {}) as Row;
          // "in" chứ không `?? e.saleId`: phân biệt "không đặt" với "đặt bằng null" (gỡ).
          for (const e of hit) {
            if ("saleId" in data) e.saleId = data.saleId as string | null;
          }
          return { count: hit.length };
        }),
      },
      leadActivity: {
        createMany: vi.fn(async (args: Row) => {
          const rows = (args.data ?? []) as Row[];
          state.activityArgs.push(...rows);
          trace("activity.createMany");
          return { count: rows.length };
        }),
      },
      conversation: {
        findMany: vi.fn(async (args: Row) => {
          trace("conversation.findMany");
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
  };

  return {
    state,
    mockDb,
    txClient,
    /**
     * Bản mô phỏng của `fillOrgUnitOnUpdateMany` (lib/org/dual-write.ts): giữ ĐÚNG bốn
     * luật của cơ chế thật — chỉ điền khi `centerId` là chuỗi, không đè giá trị người gọi
     * đã tự đặt, không suy từ `null`, không ném lỗi khi tra hụt.
     */
    fillOrgUnit: vi.fn(async (model: string, data: Record<string, unknown>) => {
      state.fillArgs.push({ model, centerId: data.centerId ?? null });
      if (data.orgUnitId !== undefined) return false;
      if (typeof data.centerId !== "string" || data.centerId.length === 0) return false;
      data.orgUnitId = `ou-${data.centerId}`;
      return true;
    }),
    reconcileDm: vi.fn(async (opts?: Row) => {
      state.reconcileArgs.push({ ...(opts ?? {}) });
      if (state.reconcileThrows) throw new Error("reconcile hỏng (mô phỏng)");
      const ids = Array.isArray(opts?.onlyConversationIds)
        ? (opts.onlyConversationIds as string[])
        : [];
      return { dmChecked: ids.length, dmArchived: ids.length, dmSkipped: 0 };
    }),
  };
});

vi.mock("@/lib/db", () => ({ db: h.mockDb }));
// Ghi kép `centerId` → `orgUnitId`: cơ chế thật cần client Prisma TRẦN (lib/db.ts gọi
// `setDualWriteClient`), mà file này thay `@/lib/db` bằng mock ⇒ thay luôn cửa vào.
vi.mock("@/lib/org/dual-write", () => ({ fillOrgUnitOnUpdateMany: h.fillOrgUnit }));
// Giữ `dmKeyOf` THẬT (công thức khoá 1-1 chỉ được định nghĩa một chỗ — dm.ts:97);
// chỉ thay đường có hiệu ứng phụ.
vi.mock("@/lib/chat/dm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat/dm")>();
  return { ...actual, reconcileDmConversations: h.reconcileDm };
});

import { dmKeyOf } from "@/lib/chat/dm";
import {
  applyLeadReassignment,
  archiveDmOfPreviousSale,
  canTakeOverEnrollment,
} from "@/lib/lead/assignment-core";

const OLD_SALE = "sale-my";
const NEW_SALE = "sale-lien";
const CS1 = "center-cs1";
const CS2 = "center-cs2";

/** `tx` giả — helper nhận `Prisma.TransactionClient`, mock chỉ hiện thực phần dùng tới. */
const tx = h.txClient as unknown as Prisma.TransactionClient;

function lead(id: string, over: Partial<(typeof h.state.leads)[number]> = {}) {
  return {
    id,
    assignedToId: OLD_SALE,
    assignedAt: null,
    handoverNote: null,
    status: "CONTACTED",
    deletedAt: null,
    centerId: CS2,
    ...over,
  };
}

function enrollment(
  id: string,
  over: Partial<(typeof h.state.enrollments)[number]> = {},
) {
  return {
    id,
    leadId: "l1",
    saleId: OLD_SALE,
    status: "STUDYING",
    deletedAt: null,
    centerId: CS2,
    parentUserId: "parent-1",
    ...over,
  };
}

/** Lượt đổi chủ mặc định: sale cũ → sale mới, cả hai ở CS2. */
function apply(over: Record<string, unknown> = {}) {
  return applyLeadReassignment({
    tx,
    leadIds: ["l1"],
    leadWhere: { assignedToId: OLD_SALE, deletedAt: null },
    fromUserId: OLD_SALE,
    toUserId: NEW_SALE,
    toSaleCenterId: CS2,
    ...over,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  const s = h.state;
  s.leads = [lead("l1")];
  s.enrollments = [];
  s.conversations = [];
  s.leadUpdateArgs = [];
  s.fillArgs = [];
  s.enrollmentFindArgs = [];
  s.enrollmentUpdateArgs = [];
  s.activityArgs = [];
  s.trace = [];
  s.reconcileArgs = [];
  s.reconcileThrows = false;
  s.afterEnrollmentRead = null;
});

// ─── A. Cột chủ sở hữu + mốc SLA (luật L3) ──────────────────────────────────

describe("A — assignedToId + assignedAt", () => {
  it("đổi chủ lead và ĐẶT assignedAt: đồng hồ SLA-3 của sale MỚI bắt đầu từ đây", async () => {
    const before = Date.now();
    const res = await apply();
    expect(res.leadsMoved).toBe(1);
    const row = h.state.leads[0];
    expect(row?.assignedToId).toBe(NEW_SALE);
    // Không có dòng này thì `over(assignedAt, now, 3h)` (lib/crm/sla.ts:78) đo từ mốc
    // của sale CŨ — hoặc không bao giờ chạy vì cột vẫn null.
    expect(row?.assignedAt).toBeInstanceOf(Date);
    expect(row?.assignedAt?.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("gỡ chủ (toUserId = null) ⇒ assignedAt = null, không để lại mốc của người cũ", async () => {
    // Nhánh `transferLead` chuyển cơ sở mà cơ sở đích ở chế độ MANUAL: lead không còn ai
    // phụ trách. Giữ `assignedAt` cũ là để SLA-3 tính cho một người không còn phụ trách.
    h.state.leads = [lead("l1", { assignedAt: new Date("2026-01-01") })];
    const res = await apply({ toUserId: null });
    expect(res.leadsMoved).toBe(1);
    expect(h.state.leads[0]?.assignedToId).toBeNull();
    expect(h.state.leads[0]?.assignedAt).toBeNull();
  });

  it("đường GHI tự bảo vệ: where của updateMany mang ĐỦ leadWhere, không chỉ danh sách id", async () => {
    await apply();
    const where = (h.state.leadUpdateArgs[0]?.where ?? {}) as Record<string, unknown>;
    // Chỉ `{ id: { in: [...] } }` là để hở khe TOCTOU giữa lúc caller đọc và lúc ghi.
    expect(where.assignedToId).toBe(OLD_SALE);
    expect(where.deletedAt).toBeNull();
    expect((where.id as { in?: string[] }).in).toEqual(["l1"]);
  });

  it("leadData của caller đi kèm, nhưng KHÔNG đè được assignedToId/assignedAt", async () => {
    // Mỗi đường có phần riêng: handoverNote (bàn giao), NEW→ASSIGNED (gán tay), centerId
    // (chuyển cơ sở). Hai cột chủ sở hữu thì helper giữ độc quyền.
    const res = await apply({
      leadData: { handoverNote: "Đinh Thảo My nghỉ việc", status: "ASSIGNED", assignedToId: "ke-gian" },
    });
    expect(res.leadsMoved).toBe(1);
    expect(h.state.leads[0]?.handoverNote).toBe("Đinh Thảo My nghỉ việc");
    expect(h.state.leads[0]?.status).toBe("ASSIGNED");
    expect(h.state.leads[0]?.assignedToId).toBe(NEW_SALE);
  });

  it("danh sách lead rỗng ⇒ no-op tuyệt đối, không một lượt ghi nào", async () => {
    const res = await apply({ leadIds: [] });
    expect(res.leadsMoved).toBe(0);
    expect(h.state.trace).toEqual([]);
  });

  it("mọi lượt ghi đi qua `tx` của caller, KHÔNG qua `db` trần", async () => {
    h.state.enrollments = [enrollment("e1")];
    await apply({ activity: { actorId: "qlcs-1", actorName: "QLCS CS2", content: "x" } });
    // Một lượt ghi lọt ra ngoài transaction là mất tính nguyên tử: lô hỏng ⇒
    // `Lead.assignedToId` quay về sale cũ trong khi `Enrollment.saleId` đã đổi.
    expect(h.state.trace.filter((t) => t.endsWith("(db)"))).toEqual([]);
  });
});

// ─── B. Luật L1 — bộ lọc chỉ mang ngữ nghĩa SỞ HỮU ──────────────────────────

describe("B — L1: bộ lọc chọn ghi danh", () => {
  it("where của enrollment.findMany CHỈ có sở hữu + xoá mềm + truy vết lead", async () => {
    h.state.enrollments = [enrollment("e1")];
    await apply();
    const where = (h.state.enrollmentFindArgs[0]?.where ?? {}) as Record<string, unknown>;
    // Thêm `status`, `student.parentUserId`, hay cách ly cơ sở của NGƯỜI BẤM vào đây là
    // để lại ghi danh mang `saleId` của người đã nghỉ — quan hệ Sale↔PH được đánh giá
    // TẠI THỜI ĐIỂM HỎI nên nó sống lại khi dữ liệu đổi trạng thái về sau.
    expect(Object.keys(where).sort()).toEqual(["deletedAt", "leadChild", "saleId"]);
    expect(where.saleId).toBe(OLD_SALE);
    expect(where.deletedAt).toBeNull();
  });

  it("ghi danh PENDING (chờ xếp lớp) VẪN đổi chủ", async () => {
    // `ENROLLMENT_ACTIVE_STATUS_LIST` KHÔNG có PENDING. Lọc theo bộ đó thì PENDING giữ
    // `saleId` sale cũ, rồi giáo vụ xếp lớp là quan hệ SỐNG LẠI cho người đã nghỉ.
    h.state.enrollments = [enrollment("e-pending", { status: "PENDING" })];
    const res = await apply();
    expect(res.enrollmentsMoved).toBe(1);
    expect(h.state.enrollments[0]?.saleId).toBe(NEW_SALE);
  });

  it("học viên CHƯA có tài khoản PH VẪN đổi chủ", async () => {
    h.state.enrollments = [enrollment("e-noparent", { parentUserId: null })];
    const res = await apply();
    expect(res.enrollmentsMoved).toBe(1);
    expect(h.state.enrollments[0]?.saleId).toBe(NEW_SALE);
    expect(res.affectedParentIds).toEqual([]);
  });

  it("KHÔNG cướp ghi danh đang do sale KHÁC phụ trách", async () => {
    h.state.enrollments = [enrollment("e1"), enrollment("e2", { saleId: "sale-khac" })];
    const res = await apply();
    expect(res.enrollmentsMoved).toBe(1);
    expect(h.state.enrollments.find((e) => e.id === "e2")?.saleId).toBe("sale-khac");
  });

  it("bỏ qua ghi danh đã XOÁ MỀM (điều kiện duy nhất được phép thêm — nó là sở hữu)", async () => {
    h.state.enrollments = [enrollment("e-deleted", { deletedAt: new Date() })];
    const res = await apply();
    expect(res.enrollmentsMoved).toBe(0);
    expect(h.state.enrollments[0]?.saleId).toBe(OLD_SALE);
  });

  it("chỉ đụng ghi danh truy vết về ĐÚNG những lead trong lượt này", async () => {
    h.state.leads = [lead("l1"), lead("l2")];
    h.state.enrollments = [enrollment("e1", { leadId: "l1" }), enrollment("e2", { leadId: "l2" })];
    const res = await apply({ leadIds: ["l1"] });
    expect(res.enrollmentsMoved).toBe(1);
    expect(h.state.enrollments.find((e) => e.id === "e2")?.saleId).toBe(OLD_SALE);
  });
});

// ─── C. Luật L2 — cơ sở của SALE NHẬN ───────────────────────────────────────

describe("C — L2: ghi danh khác cơ sở với sale nhận", () => {
  it("khác cơ sở ⇒ KHÔNG giao cho sale nhận (mặc định GIỮ NGUYÊN sale cũ)", async () => {
    // Mặc định `strandedPolicy = "KEEP"`. Sale cũ ở đây là người CÒN LÀM VIỆC (gán tay /
    // round-robin / chuyển lead), và `findSaleAssignedEnrollmentIds` (lib/chat/dm.ts:232)
    // nói rõ "sale phụ trách học viên đã chuyển cơ sở vẫn phải giữ được kênh" ⇒ gỡ phân
    // công ở đây là XOÁ một phân công đang chạy tốt, PH mất luôn kênh riêng.
    h.state.enrollments = [enrollment("e-cs1", { centerId: CS1 })];
    const res = await apply();
    expect(res.enrollmentsMoved).toBe(0);
    expect(res.enrollmentsUnassigned).toBe(0);
    expect(res.enrollmentsKept).toBe(1);
    expect(h.state.enrollments[0]?.saleId).toBe(OLD_SALE);
    // KHÔNG một lệnh ghi nào chạm ghi danh đó.
    expect(h.state.enrollmentUpdateArgs).toEqual([]);
  });

  it("UNASSIGN (sale cũ NGHỈ VIỆC) ⇒ GỠ phân công, KHÔNG để lại sale đã nghỉ", async () => {
    // Đường bàn giao khi nghỉ việc: để nguyên mới là bug — kênh riêng của người đã nghỉ
    // còn ACTIVE, và job đối soát đêm không dọn vì `saleId` vẫn khớp một quan hệ THẬT.
    h.state.enrollments = [enrollment("e-cs1", { centerId: CS1 })];
    const res = await apply({ strandedPolicy: "UNASSIGN" });
    expect(res.enrollmentsMoved).toBe(0);
    expect(res.enrollmentsUnassigned).toBe(1);
    expect(res.enrollmentsKept).toBe(0);
    expect(h.state.enrollments[0]?.saleId).toBeNull();
  });

  it("UNASSIGN: lệnh GỠ vẫn tự bảo vệ bằng điều kiện sở hữu (khe TOCTOU)", async () => {
    h.state.enrollments = [enrollment("e-cs1", { centerId: CS1 })];
    await apply({ strandedPolicy: "UNASSIGN" });
    const where = (h.state.enrollmentUpdateArgs[0]?.where ?? {}) as Record<string, unknown>;
    expect(where.saleId).toBe(OLD_SALE);
    expect(where.deletedAt).toBeNull();
  });

  it("ghi danh không có cơ sở (lớp Hội sở) vẫn giao được — y như màn học viên của lớp", async () => {
    h.state.enrollments = [enrollment("e-ho", { centerId: null })];
    const res = await apply();
    expect(res.enrollmentsMoved).toBe(1);
    expect(res.enrollmentsUnassigned).toBe(0);
    expect(h.state.enrollments[0]?.saleId).toBe(NEW_SALE);
  });

  it("sale nhận KHÔNG có cơ sở ⇒ chỉ nhận được ghi danh không cơ sở", async () => {
    // Nhánh dễ trúng nhất: `getSaleStats(null)`/`getSalesLoad(null)` fallback toàn hệ
    // thống chọn được sale Hội sở (`User.centerId = null` — 15 dòng, center-bridge.ts:288).
    // Với `UNASSIGN` thì MỌI ghi danh có cơ sở bị gỡ sạch trong một lượt bấm; mặc định
    // `KEEP` giữ nguyên chúng cho sale cũ.
    h.state.enrollments = [enrollment("e-ho", { centerId: null }), enrollment("e-cs2")];
    const res = await apply({ toSaleCenterId: null });
    expect(res.enrollmentsMoved).toBe(1);
    expect(res.enrollmentsUnassigned).toBe(0);
    expect(res.enrollmentsKept).toBe(1);
    expect(h.state.enrollments.find((e) => e.id === "e-ho")?.saleId).toBe(NEW_SALE);
    expect(h.state.enrollments.find((e) => e.id === "e-cs2")?.saleId).toBe(OLD_SALE);
  });

  it("so với cơ sở của SALE NHẬN, không phải cơ sở của LEAD", async () => {
    // `Enrollment.centerId` là bản sao cơ sở của LỚP, độc lập với `Lead.centerId`.
    // Lead ở CS1, sale nhận ở CS2, ghi danh ở CS2 ⇒ nhận được.
    h.state.leads = [lead("l1", { centerId: CS1 })];
    h.state.enrollments = [enrollment("e1", { centerId: CS2 })];
    const res = await apply({ leadWhere: { assignedToId: OLD_SALE, deletedAt: null } });
    expect(res.enrollmentsMoved).toBe(1);
  });

  it("đường GHI tự bảo vệ: updateMany mang điều kiện SỞ HỮU + CƠ SỞ của sale nhận", async () => {
    h.state.enrollments = [enrollment("e1")];
    await apply();
    const where = (h.state.enrollmentUpdateArgs[0]?.where ?? {}) as Record<string, unknown>;
    expect(where.saleId).toBe(OLD_SALE);
    expect(where.deletedAt).toBeNull();
    const or = (where.OR ?? []) as Record<string, unknown>[];
    expect(or).toEqual(expect.arrayContaining([{ centerId: CS2 }, { centerId: null }]));
  });

  it("số liệu lấy từ .count của updateMany, KHÔNG từ độ dài danh sách đã đọc", async () => {
    // Một lượt ghi chen ngang giữa lúc đọc và lúc ghi (scopedDb không che write). Nếu
    // helper báo `takeable.length` thì con số trả cho người vận hành là con số bịa.
    h.state.enrollments = [enrollment("e1")];
    h.state.afterEnrollmentRead = () => {
      const row = h.state.enrollments[0];
      if (row) row.saleId = "sale-khac";
    };
    const res = await apply();
    expect(res.enrollmentsMoved).toBe(0);
    expect(h.state.enrollments[0]?.saleId).toBe("sale-khac");
  });

  it("canTakeOverEnrollment: bất biến 'cùng cơ sở, hoặc ghi danh không cơ sở'", () => {
    expect(canTakeOverEnrollment(CS2, CS2)).toBe(true);
    expect(canTakeOverEnrollment(null, CS2)).toBe(true);
    expect(canTakeOverEnrollment(CS1, CS2)).toBe(false);
    expect(canTakeOverEnrollment(CS1, null)).toBe(false);
  });
});

// ─── D. Tắt phần kéo saleId — phải là quyết định CÓ CHỦ Ý ───────────────────

describe("D — tắt phần kéo Enrollment.saleId", () => {
  it("skipEnrollmentPull ⇒ KHÔNG đọc, KHÔNG ghi ghi danh; lead vẫn đổi chủ", async () => {
    h.state.enrollments = [enrollment("e1")];
    const res = await apply({
      skipEnrollmentPull: { reason: "lead mới, chưa từng có ghi danh nào" },
    });
    expect(res.leadsMoved).toBe(1);
    expect(res.enrollmentsMoved).toBe(0);
    expect(res.enrollmentsUnassigned).toBe(0);
    expect(h.state.trace.filter((t) => t.startsWith("enrollment."))).toEqual([]);
    expect(h.state.enrollments[0]?.saleId).toBe(OLD_SALE);
  });

  it("MẶC ĐỊNH là BẬT: không truyền gì thì vẫn kéo", async () => {
    h.state.enrollments = [enrollment("e1")];
    const res = await apply();
    expect(res.enrollmentsMoved).toBe(1);
  });

  it("L4 — fromUserId = null ⇒ KHÔNG chạm ghi danh (không nhận vơ ghi danh mồ côi)", async () => {
    // `autoAssignNewLead` chỉ chạy khi lead CHƯA có người phụ trách ⇒ không tồn tại
    // "sale cũ" để kéo. Nếu helper suy diễn thành `where: { saleId: null }` thì lượt chia
    // lead mới VƠ hết ghi danh mà ai đó vừa cố ý gỡ sale ở màn học viên của lớp.
    h.state.leads = [lead("l1", { assignedToId: null })];
    h.state.enrollments = [enrollment("e-mo-coi", { saleId: null })];
    const res = await apply({
      fromUserId: null,
      leadWhere: { assignedToId: null, deletedAt: null },
    });
    expect(res.leadsMoved).toBe(1);
    expect(h.state.trace.filter((t) => t.startsWith("enrollment."))).toEqual([]);
    expect(h.state.enrollments[0]?.saleId).toBeNull();
  });
});

// ─── E. Dòng thời gian của lead ─────────────────────────────────────────────

describe("E — LeadActivity", () => {
  it("tạo activity với metadata.system = true (nếu không, auto-chia bị khoá vĩnh viễn)", async () => {
    // `hasSaleInteraction` (lib/lead/auto-assign.ts:25-36) coi NOTE KHÔNG mang
    // `metadata.system = true` là "sale đã tương tác" ⇒ lead đó không auto-chia được nữa.
    const res = await apply({
      activity: { actorId: "qlcs-1", actorName: "QLCS CS2", content: "Bàn giao cho Liên" },
    });
    expect(res.activitiesCreated).toBe(1);
    const row = h.state.activityArgs[0] ?? {};
    expect(row.leadId).toBe("l1");
    expect(row.type).toBe("NOTE");
    expect(row.content).toBe("Bàn giao cho Liên");
    expect(row.metadata).toMatchObject({ system: true });
  });

  it("metadata thêm của caller được giữ, nhưng cờ system KHÔNG bị đè", async () => {
    await apply({
      activity: {
        actorId: null,
        actorName: "Hệ thống",
        content: "x",
        metadata: { assignedToId: NEW_SALE, system: false },
      },
    });
    expect(h.state.activityArgs[0]?.metadata).toEqual({
      assignedToId: NEW_SALE,
      system: true,
    });
  });

  it("nội dung theo TỪNG lead khi caller truyền hàm (mỗi lead một người nhận)", async () => {
    h.state.leads = [lead("l1"), lead("l2")];
    const res = await apply({
      leadIds: ["l1", "l2"],
      activity: {
        actorId: null,
        actorName: "Hệ thống",
        content: (leadId: string) => `Chia lại ${leadId}`,
      },
    });
    expect(res.activitiesCreated).toBe(2);
    expect(h.state.activityArgs.map((r) => r.content)).toEqual([
      "Chia lại l1",
      "Chia lại l2",
    ]);
  });

  it("vắng activity ⇒ KHÔNG tạo dòng nào (caller giữ nguyên hành vi cũ)", async () => {
    const res = await apply();
    expect(res.activitiesCreated).toBe(0);
    expect(h.state.trace.filter((t) => t.startsWith("activity."))).toEqual([]);
  });

  it("loại activity theo caller (HANDOVER cho đường chuyển lead)", async () => {
    await apply({
      activity: {
        actorId: null,
        actorName: "Hệ thống",
        type: "HANDOVER",
        content: "Chuyển cơ sở",
      },
    });
    expect(h.state.activityArgs[0]?.type).toBe("HANDOVER");
  });
});

// ─── F. Số liệu trả về cho caller ───────────────────────────────────────────

describe("F — số liệu trả về", () => {
  it("tách ghi danh theo từng lead để caller ghi audit theo cách của mình", async () => {
    h.state.leads = [lead("l1"), lead("l2")];
    h.state.enrollments = [
      enrollment("e1", { leadId: "l1" }),
      enrollment("e2", { leadId: "l2", centerId: CS1 }),
    ];
    const res = await apply({ leadIds: ["l1", "l2"] });
    expect(res.enrollmentsByLead.get("l1")).toEqual({
      moved: ["e1"],
      unassigned: [],
      kept: [],
    });
    // Mặc định KEEP ⇒ e2 (khác cơ sở) nằm ở rổ `kept`, KHÔNG phải `unassigned`.
    expect(res.enrollmentsByLead.get("l2")).toEqual({
      moved: [],
      unassigned: [],
      kept: ["e2"],
    });
  });

  it("UNASSIGN: ghi danh khác cơ sở vào rổ `unassigned` để caller ghi audit", async () => {
    h.state.enrollments = [enrollment("e2", { centerId: CS1 })];
    const res = await apply({ strandedPolicy: "UNASSIGN" });
    expect(res.enrollmentsByLead.get("l1")).toEqual({
      moved: [],
      unassigned: ["e2"],
      kept: [],
    });
  });

  it("affectedParentIds gồm PH của CẢ HAI rổ (thừa vô hại, thiếu mới là lỗ)", async () => {
    h.state.enrollments = [
      enrollment("e1", { parentUserId: "parent-1" }),
      enrollment("e2", { parentUserId: "parent-2", centerId: CS1 }),
    ];
    const res = await apply();
    // `reconcileDmConversations` tự kiểm lại quan hệ nên thừa thì vô hại; thiếu thì sale
    // đã nghỉ giữ kênh và job đêm không dọn.
    expect(res.affectedParentIds.sort()).toEqual(["parent-1", "parent-2"]);
  });
});

// ─── G. Đóng kênh riêng của sale cũ (chuyển nguyên từ lead-handover) ────────

describe("G — archiveDmOfPreviousSale", () => {
  it("tìm đúng kênh 1-1 của sale cũ rồi giao cho đường sẵn có đóng", async () => {
    h.state.conversations = [
      {
        id: "conv-1",
        dmKey: dmKeyOf(OLD_SALE, "parent-1", "SALE_PARENT"),
        type: "DM_SALE_PARENT",
        status: "ACTIVE",
      },
    ];
    const n = await archiveDmOfPreviousSale(OLD_SALE, ["parent-1"]);
    expect(n).toBe(1);
    expect(h.state.reconcileArgs[0]?.onlyConversationIds).toEqual(["conv-1"]);
  });

  it("danh sách PH rỗng / trùng chính sale cũ ⇒ không gọi gì", async () => {
    expect(await archiveDmOfPreviousSale(OLD_SALE, [])).toBe(0);
    expect(await archiveDmOfPreviousSale(OLD_SALE, [OLD_SALE, ""])).toBe(0);
    expect(h.reconcileDm).not.toHaveBeenCalled();
  });

  it("hỏng thì LOG và trả 0 — KHÔNG ném ngược làm hỏng việc đã commit", async () => {
    // Luật cứng module chat #2: Postgres là nguồn sự thật; hiệu ứng phụ hỏng thì ghi log,
    // không rollback. Lưới cuối vẫn còn: job đối soát đêm.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.state.conversations = [
      {
        id: "conv-1",
        dmKey: dmKeyOf(OLD_SALE, "parent-1", "SALE_PARENT"),
        type: "DM_SALE_PARENT",
        status: "ACTIVE",
      },
    ];
    h.state.reconcileThrows = true;
    await expect(archiveDmOfPreviousSale(OLD_SALE, ["parent-1"])).resolves.toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ─── H. Ghi kép `centerId` → `orgUnitId` (luật cứng Nền Hệ thống #3) ────────
//
// Helper ghi Lead bằng `updateMany`, mà extension ghi kép (lib/org/dual-write.ts:121-123)
// CỐ Ý không hook `updateMany` — nên đường này phải tự điền. Bỏ qua là `Lead.orgUnitId`
// nằm lại ở cơ sở CŨ sau mỗi lượt chuyển cơ sở: `logLeadAudit` đóng dấu dòng nhật ký theo
// `Lead.orgUnitId` (lib/audit/log.ts:35) ⇒ QL cơ sở vừa NHẬN lead không thấy nhật ký
// chuyển, còn cron đối soát đêm chỉ BÁO chứ không sửa.
describe("H — ghi kép centerId → orgUnitId", () => {
  it("leadData đổi cơ sở ⇒ orgUnitId đi kèm trong CÙNG lệnh ghi", async () => {
    const res = await apply({ leadData: { centerId: CS1, handoverNote: "chuyển CS1" } });
    expect(res.leadsMoved).toBe(1);
    const data = (h.state.leadUpdateArgs[0]?.data ?? {}) as Record<string, unknown>;
    expect(data.centerId).toBe(CS1);
    expect(data.orgUnitId).toBe(`ou-${CS1}`);
    expect(h.state.fillArgs[0]).toEqual({ model: "Lead", centerId: CS1 });
  });

  it("caller đã tự đặt orgUnitId ⇒ tôn trọng nguyên vẹn, không có nguồn ghi thứ hai", async () => {
    await apply({ leadData: { centerId: CS1, orgUnitId: "ou-caller-chon" } });
    const data = (h.state.leadUpdateArgs[0]?.data ?? {}) as Record<string, unknown>;
    expect(data.orgUnitId).toBe("ou-caller-chon");
  });

  it("không đổi cơ sở ⇒ KHÔNG đụng orgUnitId (không đoán thay người viết)", async () => {
    await apply({ leadData: { handoverNote: "chỉ đổi người phụ trách" } });
    const data = (h.state.leadUpdateArgs[0]?.data ?? {}) as Record<string, unknown>;
    expect("orgUnitId" in data).toBe(false);
  });

  it("centerId = null tường minh ⇒ KHÔNG suy orgUnitId (null mang nghĩa riêng)", async () => {
    await apply({ leadData: { centerId: null } });
    const data = (h.state.leadUpdateArgs[0]?.data ?? {}) as Record<string, unknown>;
    expect("orgUnitId" in data).toBe(false);
  });

  it("KHÔNG mutate leadData của caller (đối tượng gọi lại được ở lô sau)", async () => {
    const leadData = { centerId: CS1 };
    await apply({ leadData });
    expect(leadData).toEqual({ centerId: CS1 });
  });
});
