// @vitest-environment node
/**
 * `transferLead` — đường "chuyển lead" (đổi sale và/hoặc đổi cơ sở, bắt buộc note ≥5 ký tự).
 *
 * VÌ SAO FILE NÀY TỒN TẠI RIÊNG: `transferLead` là 1 trong **7 đường** đổi
 * `Lead.assignedToId` của repo, và trước bản vá này nó tự viết lại phần "đổi chủ" bằng tay
 * (`tx.lead.update` + `tx.leadActivity.create`). Hệ quả đo được:
 *
 *   1. KHÔNG kéo `Enrollment.saleId`. Kênh riêng Sale ↔ Phụ huynh (`DM_SALE_PARENT`) sống
 *      trên đúng cột đó (`findSaleAssignedEnrollmentIds`, lib/chat/dm.ts) ⇒ chuyển lead
 *      xong, sale CŨ vẫn nhắn riêng được phụ huynh, sale MỚI không có kênh, và job đối
 *      soát đêm cũng không dọn vì `saleId` vẫn khớp sale cũ.
 *   2. KHÔNG đặt `assignedAt`. SLA-3 ("chưa liên hệ khách > 3 giờ", lib/crm/sla.ts:78)
 *      tính TỪ cột đó ⇒ đồng hồ của sale MỚI không bao giờ bắt đầu.
 *
 * ⚠️ CÁI BẪY LỚN NHẤT CỦA ĐƯỜNG NÀY — và là lý do file test tách riêng:
 * `transferLead` đổi CẢ `Lead.centerId` lẫn `Lead.assignedToId`, nên có ĐÚNG HAI "cơ sở
 * đích" trong cùng một hàm. Luật L2 nói ghi danh chỉ được giao cho sale CÙNG CƠ SỞ, và
 * cơ sở phải so là **cơ sở của SALE NHẬN**, KHÔNG phải `toCenterId` của lead:
 * `Enrollment.centerId` là bản sao cơ sở của LỚP, độc lập hoàn toàn với cơ sở của lead
 * (lý lẽ đầy đủ: lib/lead-handover/service.ts, khối đầu file). Lấy nhầm `toCenterId` thì
 * mã vẫn chạy, vẫn "xanh" ở mọi ca mà hai cơ sở tình cờ trùng nhau — nên ca [T-3] dưới
 * đây cố ý cho hai cơ sở KHÁC nhau để bẫy đó không thể tự xanh.
 *
 * CÁCH ĐO: giữ `applyLeadReassignment` **THẬT** (không mock), chỉ thay client transaction
 * bằng mock ghi lại đối số. Nhờ vậy test đọc được chính `where`/`data` mà Prisma sẽ nhận —
 * mock kiểu "chỉ kiểm helper đã được gọi" sẽ KHÔNG bắt được ca [T-3] lẫn [T-2].
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type EnrollmentRow = {
  id: string;
  centerId: string | null;
  leadChild: { leadId: string } | null;
  student: { parentUserId: string | null };
};

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  checkPermission: vi.fn(),
  passesScope: vi.fn(),
  rejectHeadOffice: vi.fn(),
  reassignForCenter: vi.fn(),
  logLeadAudit: vi.fn(),
  archiveDm: vi.fn(),
  // ─ đọc ngoài transaction
  leadFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  centerFindUnique: vi.fn(),
  // ─ chỉ tồn tại BÊN TRONG transaction
  txLeadUpdateMany: vi.fn(),
  txEnrollmentFindMany: vi.fn(),
  txEnrollmentUpdateMany: vi.fn(),
  txLeadActivityCreateMany: vi.fn(),
  txLeadTransferCreate: vi.fn(),
  txRan: vi.fn(),
  /** Đối số thứ 2 của `$transaction` — trần thời gian (luật E-bis #2 module chat). */
  txOptions: vi.fn(),
  /** Bản mô phỏng `fillOrgUnitOnUpdateMany` — giữ đúng 4 luật của cơ chế thật. */
  fillOrgUnit: vi.fn(async (_model: string, data: Record<string, unknown>) => {
    if (data.orgUnitId !== undefined) return false;
    if (typeof data.centerId !== "string" || data.centerId.length === 0) return false;
    data.orgUnitId = `ou-${data.centerId}`;
    return true;
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/auth/check-permission", () => ({
  checkPermission: h.checkPermission,
  canViewLeadPii: async () => true,
}));
vi.mock("@/lib/auth/actor", () => ({
  resolveActor: async (userId: string) => ({ userId }),
}));
vi.mock("@/lib/auth/permissions", () => ({ hasRole: () => false }));
vi.mock("@/lib/auth/managed-centers", () => ({ roleManagesCenter: () => false }));
vi.mock("@/lib/db-scope", () => ({
  passesScope: h.passesScope,
  scopedDb: () => ({}),
}));
vi.mock("@/lib/audit/log", () => ({
  logLeadAudit: h.logLeadAudit,
  getAuditActor: () => ({ actorId: "admin-1", actorName: "Quản trị" }),
}));
vi.mock("@/lib/enrollment-flow", () => ({ rejectHeadOffice: h.rejectHeadOffice }));
vi.mock("@/lib/lead/auto-assign", () => ({
  reassignForCenter: h.reassignForCenter,
  autoAssignNewLead: vi.fn(),
  manualAssignLead: vi.fn(),
}));
vi.mock("@/lib/lead/assign", () => ({
  autoAssignLead: vi.fn(),
  reassignOpenLeads: vi.fn(),
}));
vi.mock("@/lib/payments/summary", () => ({ getLeadPaymentSummary: vi.fn() }));
vi.mock("@/lib/students/sync-name", () => ({ syncLeadChildNameToStudents: vi.fn() }));
vi.mock("@/lib/org/org-service", () => ({ centerIdForOrgUnit: async () => null }));
// Ghi kép `centerId` → `orgUnitId`: cơ chế thật cần client Prisma TRẦN (`setDualWriteClient`
// trong lib/db.ts), mà file này thay `@/lib/db` bằng mock ⇒ thay luôn cửa vào.
vi.mock("@/lib/org/dual-write", () => ({
  fillOrgUnitOnUpdateMany: h.fillOrgUnit,
}));
// `assignment-core` giữ THẬT — chỉ thay hiệu ứng phụ ngoài transaction để đo được thứ tự.
vi.mock("@/lib/chat/dm", () => ({
  dmKeyOf: (a: string, b: string) => `${a}|${b}`,
  reconcileDmConversations: vi.fn(),
}));
vi.mock("@/lib/lead/assignment-core", async (orig) => {
  const actual = await orig<typeof import("@/lib/lead/assignment-core")>();
  return { ...actual, archiveDmOfPreviousSale: h.archiveDm };
});

vi.mock("@/lib/db", () => ({
  db: {
    lead: { findFirst: h.leadFindFirst },
    user: { findFirst: h.userFindFirst, findUnique: h.userFindUnique },
    center: { findUnique: h.centerFindUnique },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, opts?: unknown) => {
      h.txRan();
      h.txOptions(opts);
      return fn({
        lead: { updateMany: h.txLeadUpdateMany },
        enrollment: {
          findMany: h.txEnrollmentFindMany,
          updateMany: h.txEnrollmentUpdateMany,
        },
        leadActivity: { createMany: h.txLeadActivityCreateMany },
        leadTransfer: { create: h.txLeadTransferCreate },
      });
    },
  },
}));

import { transferLead } from "./actions";

const SALE_CU = "sale-cu";
const SALE_MOI = "sale-moi";

/** Lead nguồn: đang do SALE_CU phụ trách, ở cơ sở c1. */
function lead(over: Partial<{ assignedToId: string | null; centerId: string | null; status: string }> = {}) {
  h.leadFindFirst.mockResolvedValue({
    id: "lead-1",
    assignedToId: SALE_CU,
    centerId: "c1",
    status: "CONSULTING",
    ...over,
  });
}

/** Sale nhận hợp lệ, neo ở `centerId`. */
function saleNhan(centerId: string | null) {
  h.userFindFirst.mockResolvedValue({ id: SALE_MOI });
  h.userFindUnique.mockResolvedValue({ name: "Sale Mới", centerId });
}

/** Ghi danh truy vết về lead này, hiện `saleId = SALE_CU`. */
function ghiDanh(rows: EnrollmentRow[]) {
  h.txEnrollmentFindMany.mockResolvedValue(rows);
}

const E_C2: EnrollmentRow = {
  id: "e-c2",
  centerId: "c2",
  leadChild: { leadId: "lead-1" },
  student: { parentUserId: "ph-1" },
};
const E_C9: EnrollmentRow = {
  id: "e-c9",
  centerId: "c9",
  leadChild: { leadId: "lead-1" },
  student: { parentUserId: "ph-2" },
};

const INPUT = {
  leadId: "lead-1",
  toSaleId: SALE_MOI,
  handoverNote: "Đã tư vấn gói Sata 3, khách hẹn gọi lại tuần sau",
};

/** Đối số của lệnh ghi `Enrollment` theo giá trị `saleId` được đặt. */
function updateEnrollmentCall(saleId: string | null) {
  const call = h.txEnrollmentUpdateMany.mock.calls.find(
    (c) => (c[0] as { data: { saleId: string | null } }).data.saleId === saleId,
  );
  return call?.[0] as
    | { where: { id: { in: string[] }; saleId: string | null }; data: { saleId: string | null } }
    | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "admin-1", role: "SUPER_ADMIN", centerId: null } });
  h.checkPermission.mockResolvedValue(true);
  h.passesScope.mockReturnValue(true);
  h.rejectHeadOffice.mockResolvedValue(null);
  h.reassignForCenter.mockResolvedValue(null);
  h.logLeadAudit.mockResolvedValue(undefined);
  h.archiveDm.mockResolvedValue(0);
  h.txLeadUpdateMany.mockResolvedValue({ count: 1 });
  h.txEnrollmentUpdateMany.mockImplementation(
    async (args: { where: { id: { in: string[] } } }) => ({ count: args.where.id.in.length }),
  );
  h.txLeadActivityCreateMany.mockResolvedValue({ count: 1 });
  h.txLeadTransferCreate.mockResolvedValue({});
  h.centerFindUnique.mockResolvedValue({ name: "Cơ sở" });
  lead();
  saleNhan("c2");
  ghiDanh([]);
});

// ─── (A) `Enrollment.saleId` đi theo lead ────────────────────────────────────

describe("(A) transferLead kéo theo Enrollment.saleId", () => {
  it("[T-1] ghi danh cùng cơ sở với sale nhận → đổi sang sale mới", async () => {
    ghiDanh([E_C2]);

    await expect(transferLead(INPUT)).resolves.toMatchObject({ ok: true });

    // Bộ lọc CHỌN ghi danh — luật L1: chỉ ngữ nghĩa sở hữu, không kèm status/cơ sở người bấm.
    const [pick] = h.txEnrollmentFindMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(Object.keys(pick.where).sort()).toEqual(["deletedAt", "leadChild", "saleId"]);
    expect(pick.where.saleId).toBe(SALE_CU);

    const moved = updateEnrollmentCall(SALE_MOI);
    expect(moved?.where.id.in).toEqual(["e-c2"]);
    // Đường GHI tự bảo vệ: lặp lại `saleId = sale cũ` (scopedDb KHÔNG che write).
    expect(moved?.where.saleId).toBe(SALE_CU);
  });

  it("[T-2] ghi danh KHÁC cơ sở → KHÔNG giao cho sale nhận, GIỮ NGUYÊN sale cũ", async () => {
    // Sale cũ ở đường này là người CÒN LÀM VIỆC (quản lý bấm "Chuyển lead", không phải
    // bàn giao khi nghỉ). Gỡ phân công ở đây là xoá một phân công đang chạy tốt: ghi danh
    // mất người phụ trách và phụ huynh mất luôn kênh riêng — trong khi dm.ts:232 nói rõ
    // "sale phụ trách học viên đã chuyển cơ sở vẫn phải giữ được kênh".
    ghiDanh([E_C2, E_C9]);

    const res = await transferLead(INPUT);
    expect(res.ok).toBe(true);

    expect(updateEnrollmentCall(SALE_MOI)?.where.id.in).toEqual(["e-c2"]);
    expect(updateEnrollmentCall(null)).toBeUndefined();
    // Con số phải ra tới người bấm, không được im lặng.
    expect(res.enrollmentsMoved).toBe(1);
    expect(res.enrollmentsUnassigned).toBe(0);
    expect(res.enrollmentsKept).toBe(1);
  });

  it("[T-2b] nhật ký ghi rõ ghi danh nào Ở LẠI với sale cũ", async () => {
    ghiDanh([E_C2, E_C9]);

    await transferLead(INPUT);

    const [args] = h.logLeadAudit.mock.calls[0] as [
      { newValues: Record<string, unknown>; changedFields: string[] },
    ];
    expect(args.newValues.enrollmentSaleKept).toEqual(["e-c9"]);
    expect(args.changedFields).toContain("enrollmentSaleKept");
  });

  it("[T-3] cơ sở đem so là của SALE NHẬN, KHÔNG phải toCenterId của lead", async () => {
    // Bẫy: lead chuyển SANG cơ sở c3, nhưng sale nhận neo ở c2 và ghi danh cũng ở c2.
    // Lấy nhầm `toCenterId` (c3) ⇒ e-c2 bị coi là khác cơ sở và bị GỠ oan.
    saleNhan("c2");
    ghiDanh([E_C2]);

    await expect(
      transferLead({ ...INPUT, toCenterId: "c3" }),
    ).resolves.toMatchObject({ ok: true });

    expect(updateEnrollmentCall(SALE_MOI)?.where.id.in).toEqual(["e-c2"]);
    expect(updateEnrollmentCall(null)).toBeUndefined();
  });

  it("[T-4] lead CHƯA có chủ → không đọc ghi danh nào (không nhận vơ ghi danh mồ côi)", async () => {
    lead({ assignedToId: null, status: "NEW" });

    await expect(transferLead(INPUT)).resolves.toMatchObject({ ok: true });

    expect(h.txEnrollmentFindMany).not.toHaveBeenCalled();
    expect(h.txEnrollmentUpdateMany).not.toHaveBeenCalled();
    expect(h.archiveDm).not.toHaveBeenCalled();
  });
});

// ─── (B) `assignedAt` — mốc bắt đồng hồ SLA ──────────────────────────────────

describe("(B) transferLead đặt assignedAt", () => {
  it("[T-5] có sale nhận → assignedAt = bây giờ (SLA-3 của sale MỚI bắt đầu chạy)", async () => {
    await transferLead(INPUT);

    const [args] = h.txLeadUpdateMany.mock.calls[0] as [
      { where: Record<string, unknown>; data: { assignedToId: string | null; assignedAt: Date | null; handoverNote: string; centerId: string | null } },
    ];
    expect(args.data.assignedToId).toBe(SALE_MOI);
    expect(args.data.assignedAt).toBeInstanceOf(Date);
    // Field riêng của đường này không bị helper nuốt mất.
    expect(args.data.handoverNote).toBe(INPUT.handoverNote);
    expect(args.data.centerId).toBe("c1");
    // Đường GHI lặp lại bộ lọc đã dùng lúc CHỌN, không chỉ `id`.
    expect(args.where.deletedAt).toBeNull();
  });

  it("[T-6] không có sale nhận (cơ sở đích MANUAL) → assignedAt = null, KHÔNG gỡ ghi danh", async () => {
    h.userFindFirst.mockResolvedValue(null);
    h.reassignForCenter.mockResolvedValue(null);
    ghiDanh([E_C2, E_C9]);

    const res = await transferLead({ ...INPUT, toSaleId: "", toCenterId: "c3" });
    expect(res.ok).toBe(true);

    const [args] = h.txLeadUpdateMany.mock.calls[0] as [
      { data: { assignedToId: string | null; assignedAt: Date | null } },
    ];
    expect(args.data.assignedToId).toBeNull();
    // Không còn ai phụ trách ⇒ xoá mốc, không để đồng hồ chạy từ mốc của sale cũ.
    expect(args.data.assignedAt).toBeNull();
    // Lead chưa có người nhận KHÔNG phải lý do gỡ phân công của ghi danh đang học: sale
    // cũ vẫn là người đang chăm, và quản lý gỡ tay được ở màn học viên của lớp.
    expect(h.txEnrollmentUpdateMany).not.toHaveBeenCalled();
    expect(res.enrollmentsKept).toBe(2);
  });

  it("[T-7] status NEW + có sale nhận → vẫn nâng lên ASSIGNED (hành vi cũ không rơi rụng)", async () => {
    lead({ status: "NEW" });

    await transferLead(INPUT);

    const [args] = h.txLeadUpdateMany.mock.calls[0] as [{ data: { status?: string } }];
    expect(args.data.status).toBe("ASSIGNED");
  });
});

// ─── (C) Kênh riêng của sale cũ ──────────────────────────────────────────────

describe("(C) đóng kênh riêng Sale↔PH của sale cũ", () => {
  it("[T-8] gọi SAU khi transaction đóng, với PH của CẢ hai rổ", async () => {
    ghiDanh([E_C2, E_C9]);

    await transferLead(INPUT);

    expect(h.archiveDm).toHaveBeenCalledTimes(1);
    const [fromUserId, parentIds] = h.archiveDm.mock.calls[0] as [string, string[]];
    expect(fromUserId).toBe(SALE_CU);
    // Cả ghi danh bị GỠ cũng phải nằm trong tập: sale cũ không còn phụ trách nó nữa.
    expect([...parentIds].sort()).toEqual(["ph-1", "ph-2"]);
    // Ngoài transaction: `reconcileDmConversations` chạm `db` trần, gọi trong tx sẽ đọc
    // trạng thái chưa commit từ một kết nối khác.
    expect(h.archiveDm.mock.invocationCallOrder[0]).toBeGreaterThan(
      h.txLeadTransferCreate.mock.invocationCallOrder[0],
    );
  });

  it("[T-9] transaction được nới trần (lượt ghi nay gánh thêm ghi danh + audit)", async () => {
    // Luật E-bis #2 của module chat. Mặc định Prisma là 5s/2s — lượt này nay ~9 lượt
    // đi-về DB, trong đó 3 lượt là của `logLeadAudit`. Bỏ option = đứt giữa chừng trên
    // đường Vercel → Supabase pooler mà không test nào đỏ.
    await transferLead(INPUT);

    const opts = h.txOptions.mock.calls[0]?.[0] as
      | { timeout?: number; maxWait?: number }
      | undefined;
    expect(opts?.timeout).toBeGreaterThanOrEqual(30_000);
    expect(opts?.maxWait).toBeGreaterThanOrEqual(10_000);
  });
});

// ─── (D) Rào cũ không rơi rụng + khe TOCTOU mới ──────────────────────────────

describe("(D) rào cũ vẫn đứng", () => {
  it("[T-10] lead ngoài tầm nhìn cơ sở → từ chối, không một lệnh ghi nào", async () => {
    h.passesScope.mockReturnValue(false);

    await expect(transferLead(INPUT)).resolves.toEqual({
      ok: false,
      error: "Lead không tồn tại",
    });
    expect(h.txRan).not.toHaveBeenCalled();
  });

  it("[T-11] vẫn ghi LeadTransfer + LeadActivity HANDOVER + audit", async () => {
    await transferLead(INPUT);

    expect(h.txLeadTransferCreate).toHaveBeenCalledTimes(1);
    const [tr] = h.txLeadTransferCreate.mock.calls[0] as [
      { data: { fromSaleId: string | null; toSaleId: string | null; note: string } },
    ];
    expect(tr.data.fromSaleId).toBe(SALE_CU);
    expect(tr.data.toSaleId).toBe(SALE_MOI);

    const [act] = h.txLeadActivityCreateMany.mock.calls[0] as [
      { data: { type: string; content: string; metadata: Record<string, unknown> }[] },
    ];
    expect(act.data[0]?.type).toBe("HANDOVER");
    expect(act.data[0]?.content).toBe(INPUT.handoverNote);
    expect(act.data[0]?.metadata).toMatchObject({ fromSaleId: SALE_CU, toSaleId: SALE_MOI });

    expect(h.logLeadAudit).toHaveBeenCalledTimes(1);
  });

  it("[T-13] where của lệnh ghi PHẢI gim `assignedToId` đã đọc — không thì `LeadRacedError` không bao giờ nổ", async () => {
    // `{ deletedAt: null }` một mình chỉ bắt được ca lead bị XOÁ MỀM: mọi lead còn sống
    // đều khớp ⇒ `leadsMoved = 1` kể cả khi một QLCS khác vừa chuyển lead cho người khác
    // xong. Khi đó `fromUserId` (đọc ngoài transaction) đã cũ ⇒ lượt kéo `Enrollment.saleId`
    // tìm theo sale cũ không thấy gì, và kết cục là `Lead.assignedToId = Y` trong khi
    // `Enrollment.saleId = X` — đúng loại phân kỳ mà cả module này sinh ra để vá.
    await transferLead(INPUT);

    const [args] = h.txLeadUpdateMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(args.where.assignedToId).toBe(SALE_CU);
    expect(args.where.deletedAt).toBeNull();
  });

  it("[T-13b] lead chưa có chủ → vẫn gim `assignedToId = null` (compare-and-swap, không bỏ trống)", async () => {
    lead({ assignedToId: null, status: "NEW" });

    await transferLead(INPUT);

    const [args] = h.txLeadUpdateMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(args.where.assignedToId).toBeNull();
  });

  it("[T-12] lead vừa bị đường khác đổi chủ → KHÔNG ghi LeadTransfer, báo lỗi", async () => {
    // 7 đường đổi chủ cùng tồn tại: giữa lúc đọc và lúc ghi, lead có thể đã đi nơi khác
    // (hoặc bị xoá mềm). `updateMany` đếm 0 ⇒ không được để lại phiếu chuyển ma.
    h.txLeadUpdateMany.mockResolvedValue({ count: 0 });

    const res = await transferLead(INPUT);

    expect(res.ok).toBe(false);
    expect(h.txLeadTransferCreate).not.toHaveBeenCalled();
    expect(h.logLeadAudit).not.toHaveBeenCalled();
    expect(h.archiveDm).not.toHaveBeenCalled();
  });
});

// ─── (E) Ghi kép `centerId` → `orgUnitId` (luật cứng Nền Hệ thống #3) ────────

describe("(E) chuyển cơ sở ghi kép orgUnitId", () => {
  it("[T-14] đổi cơ sở → orgUnitId đi cùng lệnh ghi (updateMany KHÔNG có hook ghi kép)", async () => {
    // Extension ghi kép (lib/org/dual-write.ts:121-123) cố ý không hook `updateMany`.
    // Thiếu dòng này thì `Lead.orgUnitId` nằm lại ở cơ sở CŨ: `logLeadAudit` đóng dấu
    // `AuditLog.orgUnitId` theo `Lead.orgUnitId` (lib/audit/log.ts:35) ⇒ QLCS vừa NHẬN
    // lead không thấy nhật ký chuyển, còn QLCS cơ sở cũ thì vẫn thấy.
    await transferLead({ ...INPUT, toCenterId: "c3" });

    const [args] = h.txLeadUpdateMany.mock.calls[0] as [
      { data: { centerId: string | null; orgUnitId?: string | null } },
    ];
    expect(args.data.centerId).toBe("c3");
    expect(args.data.orgUnitId).toBe("ou-c3");
  });

  it("[T-15] không đổi cơ sở → vẫn ghi kép theo cơ sở hiện tại (không để lệch nằm lại)", async () => {
    await transferLead(INPUT);

    const [args] = h.txLeadUpdateMany.mock.calls[0] as [
      { data: { centerId: string | null; orgUnitId?: string | null } },
    ];
    expect(args.data.centerId).toBe("c1");
    expect(args.data.orgUnitId).toBe("ou-c1");
  });

  it("[T-16] lead chưa có cơ sở và không chọn cơ sở đích → KHÔNG suy orgUnitId", async () => {
    lead({ centerId: null });

    await transferLead(INPUT);

    const [args] = h.txLeadUpdateMany.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(args.data.centerId).toBeNull();
    expect("orgUnitId" in args.data).toBe(false);
  });
});
