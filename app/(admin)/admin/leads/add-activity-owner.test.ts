// @vitest-environment node
/**
 * S-6 (b) — ghi nhật ký khách phải đòi CHỦ SỞ HỮU, đúng như việc follow-up.
 *
 * `addLeadActivity` và `addLeadTask` là một cặp anh em: cùng màn hình, cùng cổng
 * quyền `leads:edit`, cùng `passesScope('Lead')`. Nhưng chỉ `addLeadTask` gọi
 * `actorMayMutateLead(...)`. Lỗ hổng KHÔNG dừng ở "ghi bừa một dòng ghi chú":
 *
 *   · `recordLeadActivity` (đường ghi DUY NHẤT) bump `Lead.lastActivityAt`
 *     ⇒ cột "số ngày chưa tiếp cận lại" của QLCS bị đồng nghiệp reset hộ;
 *   · và đóng luôn mốc `Lead.firstContactAt` khi loại là CALL/MESSAGE/EMAIL
 *     ⇒ **chuông SLA-3 ("Chưa liên hệ khách > 3 giờ") tắt vĩnh viễn** trên khách
 *     của người khác — điều kiện tắt là `firstContactAt != null` và mốc này chỉ
 *     ghi được MỘT lần (`updateMany where firstContactAt: null`).
 *
 * Tức là một người có thể tắt đồng hồ SLA trên khách của đồng nghiệp, im lặng,
 * không ai thấy — đúng loại hỏng mà chỉ test mới bắt được.
 *
 * Không mock `recordLeadActivity`: cho nó chạy thật trên tx giả, để test khẳng
 * định được cả HAI cú ghi phụ (lastActivityAt + firstContactAt) không xảy ra.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  checkPermission: vi.fn(),
  leadFindUnique: vi.fn(),
  leadUpdate: vi.fn(),
  leadUpdateMany: vi.fn(),
  activityCreate: vi.fn(),
  taskCreate: vi.fn(),
  transaction: vi.fn(),
  resolveActor: vi.fn(),
  passesScope: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/auth/check-permission", () => ({
  checkPermission: h.checkPermission,
  canViewLeadPii: vi.fn(async () => true),
}));
vi.mock("@/lib/auth/permissions", () => ({ hasRole: vi.fn(() => false) }));
vi.mock("@/lib/db", () => ({
  db: {
    lead: {
      create: vi.fn(),
      update: h.leadUpdate,
      updateMany: h.leadUpdateMany,
      findFirst: vi.fn(),
      findUnique: h.leadFindUnique,
    },
    leadChild: { findUnique: vi.fn(), count: vi.fn() },
    trialEnrollment: { count: vi.fn(async () => 0) },
    $transaction: h.transaction,
  },
}));
vi.mock("@/lib/db-scope", () => ({
  passesScope: h.passesScope,
  scopedDb: vi.fn(() => ({})),
}));
vi.mock("@/lib/audit/log", () => ({
  logLeadAudit: vi.fn(),
  getAuditActor: vi.fn(() => ({ actorId: "u-sale-a", actorName: "Sale A" })),
}));
vi.mock("@/lib/auth/actor", () => ({ resolveActor: h.resolveActor }));
vi.mock("@/lib/org/org-service", () => ({ centerIdForOrgUnit: vi.fn() }));
vi.mock("@/lib/enrollment-flow", () => ({ rejectHeadOffice: vi.fn() }));
vi.mock("@/lib/lead/auto-assign", () => ({
  autoAssignNewLead: vi.fn(),
  manualAssignLead: vi.fn(),
  reassignForCenter: vi.fn(),
}));
vi.mock("@/lib/lead/assign", () => ({ autoAssignLead: vi.fn(), reassignOpenLeads: vi.fn() }));
vi.mock("@/lib/lead/assignment", () => ({ assignmentWrite: vi.fn() }));
vi.mock("@/lib/lead/sharing", () => ({ leadSharingEnabled: vi.fn(() => false) }));
vi.mock("@/lib/crm/transfer-validate", () => ({ validateTransferTarget: vi.fn() }));
vi.mock("@/lib/payments/summary", () => ({ getLeadPaymentSummary: vi.fn() }));
vi.mock("@/lib/students/sync-name", () => ({ syncLeadChildNameToStudents: vi.fn() }));
vi.mock("@/lib/students/prior-history", () => ({
  getPriorHistoryByPhone: vi.fn(async () => []),
  summarizePriorHistory: vi.fn(() => ""),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addLeadActivity, addLeadTask } from "./actions";

/** Khách của Sale B, cùng cơ sở CS1 với người đang đăng nhập (Sale A). */
const KHACH_CUA_NGUOI_KHAC = { id: "lead-1", centerId: "cs1", assignedToId: "u-sale-b" };
const MOC_TX = new Date("2026-08-27T03:00:00.000Z");

/** Quyền của một Sale thường: sửa được lead, nhưng KHÔNG nhìn toàn cơ sở. */
function quyenSaleThuong() {
  h.checkPermission.mockImplementation(async (action: string) => action === "leads:edit");
}
/** Quyền của quản lý cơ sở: có cả `leads:view-all`. */
function quyenQuanLy() {
  h.checkPermission.mockResolvedValue(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "u-sale-a", name: "Sale A", centerId: "cs1" } });
  quyenSaleThuong();
  h.leadFindUnique.mockResolvedValue({ ...KHACH_CUA_NGUOI_KHAC });
  h.activityCreate.mockResolvedValue({ id: "act-1", createdAt: MOC_TX });
  h.leadUpdate.mockResolvedValue({ id: "lead-1" });
  h.leadUpdateMany.mockResolvedValue({ count: 1 });
  h.taskCreate.mockResolvedValue({ id: "task-1" });
  h.resolveActor.mockResolvedValue({ userId: "u-sale-a" });
  h.passesScope.mockReturnValue(true);
  h.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      lead: { update: h.leadUpdate, updateMany: h.leadUpdateMany },
      leadActivity: { create: h.activityCreate },
      leadTask: { create: h.taskCreate },
    }),
  );
});

describe("[S-6b] addLeadActivity — chốt chủ sở hữu", () => {
  it("đồng nghiệp cùng cơ sở (không phụ trách, không leads:view-all) → TỪ CHỐI", async () => {
    const res = await addLeadActivity({ leadId: "lead-1", type: "CALL", content: "Gọi thử" });

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/người phụ trách/i);
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it("bị từ chối thì KHÔNG dòng nhật ký nào, KHÔNG bump lastActivityAt", async () => {
    await addLeadActivity({ leadId: "lead-1", type: "CALL", content: "Gọi thử" });

    expect(h.activityCreate).not.toHaveBeenCalled();
    expect(h.leadUpdate).not.toHaveBeenCalled();
  });

  it("bị từ chối thì KHÔNG đóng mốc firstContactAt (chuông SLA-3 vẫn kêu)", async () => {
    await addLeadActivity({ leadId: "lead-1", type: "MESSAGE", content: "Nhắn thử" });

    // `updateMany where { firstContactAt: null }` là cú đóng mốc duy nhất.
    expect(h.leadUpdateMany).not.toHaveBeenCalled();
  });

  it("chính người phụ trách ghi → CHO, và mốc liên hệ đầu được đóng", async () => {
    h.leadFindUnique.mockResolvedValue({ ...KHACH_CUA_NGUOI_KHAC, assignedToId: "u-sale-a" });

    const res = await addLeadActivity({ leadId: "lead-1", type: "CALL", content: "Đã gọi" });

    expect(res.ok).toBe(true);
    expect(h.activityCreate).toHaveBeenCalledTimes(1);
    expect(h.leadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastActivityAt: MOC_TX } }),
    );
    expect(h.leadUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "lead-1", firstContactAt: null } }),
    );
  });

  it("quản lý có leads:view-all ghi hộ → CHO (điều phối vẫn chạy)", async () => {
    quyenQuanLy();

    const res = await addLeadActivity({ leadId: "lead-1", type: "NOTE", content: "QL ghi chú" });

    expect(res.ok).toBe(true);
    expect(h.activityCreate).toHaveBeenCalledTimes(1);
  });

  it("thiếu leads:edit → vẫn chặn ở cổng quyền trước (không đổi hành vi cũ)", async () => {
    h.checkPermission.mockResolvedValue(false);

    const res = await addLeadActivity({ leadId: "lead-1", type: "CALL", content: "x" });

    expect(res.ok).toBe(false);
    expect(res.error).toBe("Không có quyền");
  });
});

describe("[S-6b] cặp anh em phải trả lời GIỐNG NHAU trên cùng một khách", () => {
  it("addLeadTask từ chối thì addLeadActivity cũng phải từ chối, cùng câu chữ", async () => {
    const task = await addLeadTask({
      leadId: "lead-1",
      title: "Gọi lại",
      dueAt: "2026-09-01T02:00:00.000Z",
    });
    const act = await addLeadActivity({ leadId: "lead-1", type: "CALL", content: "Gọi thử" });

    expect(task.ok).toBe(false);
    expect(act.ok).toBe(false);
    expect(act.error).toBe(task.error);
  });
});
