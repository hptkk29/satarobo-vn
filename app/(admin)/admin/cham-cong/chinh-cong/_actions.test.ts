// @vitest-environment node
/**
 * A-01-6b · bất biến **L-A6** — hai cổng GHI của module Chỉnh công phải chấp nhận MỌI cơ
 * sở mà người này ĐANG GIỮ VAI QLCS, không so với MỘT cơ sở neo (`session.user.centerId`):
 *
 *   · `reviewAdjustmentRequest` — duyệt/từ chối yêu cầu chỉnh công (áp giờ + đổi trạng thái)
 *   · `adjustTimesheetDirect`   — quản lý chỉnh thẳng bản ghi công
 *
 * Vai được nới ở CẢ HAI cổng: **CENTER_MANAGER** — đúng vai mà `hasRole(...)` đang lọc
 * (`isCM`), và cũng là vai duy nhất `canAdjustTimesheet` cho phép ngoài SUPER_ADMIN.
 *
 * Ba ca bắt buộc cho MỖI cổng:
 *   1. cơ sở thứ HAI của chính QLCS đó  → CHO
 *   2. cơ sở NGOÀI phạm vi (thứ ba)     → TỪ CHỐI
 *   3. vai khác (CENTER_HR)             → KHÔNG rộng thêm một ly nào
 *
 * ⚠️ `scopedDb` bị thay bằng client giả **không lọc gì** (luật cứng #3: cổng GHI phải tự
 * kiểm — `sdb.timesheetAdjustmentRequest.findUnique` chỉ là lớp ĐỌC, và `sdb.user` thì
 * pass-through hoàn toàn vì `User` ∉ SCOPED_MODELS), và `checkPermission` mặc định TRẢ
 * TRUE — đúng như prod: `hr_attendance:adjust` seed **GLOBAL** cho QLCS
 * (`prisma/seed-roles.ts`), nên quyền action KHÔNG cắt theo cơ sở. Cách ly cơ sở của hai
 * cổng này đứng một mình.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgUnitNode } from "@/lib/org/types";
import type { Actor, UserOrgRoleRow } from "@/lib/auth/actor";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  checkPermission: vi.fn(),
  resolveActor: vi.fn(),
  getSetting: vi.fn(),
  reqFindUnique: vi.fn(),
  reqUpdate: vi.fn(),
  userFindUnique: vi.fn(),
  checkinFindMany: vi.fn(),
  checkinCreate: vi.fn(),
  checkinUpdate: vi.fn(),
  editLogCreate: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth/check-permission", () => ({ checkPermission: h.checkPermission }));
vi.mock("@/lib/audit/log", () => ({
  getAuditActor: () => ({ actorId: "u-cm", actorName: "Quản lý" }),
}));
vi.mock("@/lib/settings/service", () => ({ getSetting: h.getSetting }));
vi.mock("@/lib/auth/actor", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/actor")>();
  return { ...actual, resolveActor: h.resolveActor };
});
vi.mock("@/lib/db-scope", async (orig) => {
  const actual = await orig<typeof import("@/lib/db-scope")>();
  return {
    ...actual,
    scopedDb: () => ({
      timesheetAdjustmentRequest: { findUnique: h.reqFindUnique, update: h.reqUpdate },
      user: { findUnique: h.userFindUnique },
      employeeCheckin: {
        findMany: h.checkinFindMany,
        create: h.checkinCreate,
        update: h.checkinUpdate,
      },
      timesheetEditLog: { create: h.editLogCreate },
    }),
  };
});

import { buildActor } from "@/lib/auth/actor";
import { adjustTimesheetDirect, reviewAdjustmentRequest } from "./_actions";

// Cây theo hình CHỐT 11/08/2026: HO → REGION → CENTER (lib/org/org-tree.ts).
const ORG: OrgUnitNode[] = [
  { id: "ho", code: "HO", type: "HO", parentId: null, centerId: null },
  { id: "rg-bac", code: "RG-BAC", type: "REGION", parentId: "ho", centerId: null },
  { id: "rg-nam", code: "RG-NAM", type: "REGION", parentId: "ho", centerId: null },
  { id: "rg-trung", code: "RG-TRUNG", type: "REGION", parentId: "ho", centerId: null },
  { id: "cs1", code: "CS1", type: "CENTER", parentId: "rg-bac", centerId: "c1" },
  { id: "cs2", code: "CS2", type: "CENTER", parentId: "rg-nam", centerId: "c2" },
  { id: "cs3", code: "CS3", type: "CENTER", parentId: "rg-trung", centerId: "c3" },
];

type Perms = UserOrgRoleRow["role"]["permissions"];
/** QLCS: `adjust` GLOBAL, `view` CENTER — đúng seed (prisma/seed-roles.ts). */
const CM_PERMS: Perms = [
  { action: "hr_attendance:adjust", scopeType: "GLOBAL" },
  { action: "hr_attendance:view", scopeType: "CENTER" },
];
/** Kế toán cơ sở: KHÔNG có hr_attendance:*, nhưng vẫn kéo cơ sở vào visibleCenterIds. */
const KE_TOAN_PERMS: Perms = [
  { action: "payments:manage", scopeType: "GLOBAL" },
  { action: "students:view-all", scopeType: "GLOBAL" },
];
/** Nhân sự Hội sở: neo tại HO ⇒ centerScope "ALL" cho MỌI permission của hàng này. */
const HO_HR_PERMS: Perms = [
  { action: "hr_attendance:view", scopeType: "GLOBAL" },
  { action: "employees:view-all", scopeType: "GLOBAL" },
];

function row(orgUnitId: string, code: string, perms: Perms = CM_PERMS): UserOrgRoleRow {
  return {
    orgUnitId,
    status: "ACTIVE",
    effectiveFrom: new Date("2000-01-01"),
    effectiveTo: null,
    role: { code, isActive: true, permissions: perms },
  };
}

const actorOf = (userId: string, rows: UserOrgRoleRow[]): Actor =>
  buildActor({ userId, rows, orgNodes: ORG, now: new Date("2026-08-26") });

/** QLCS **thuần** (không SUPER_ADMIN) giữ CS1 + CS2 — hai vùng khác nhau. */
const QLCS_HAI_CO_SO = () =>
  actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_MANAGER")]);

function login(id: string, role: string, centerId: string | null) {
  h.auth.mockResolvedValue({ user: { id, role, centerId } });
}

/** Yêu cầu chỉnh công PENDING của nhân viên thuộc `centerId`. */
function pendingReq(centerId: string | null) {
  return {
    id: "req-1",
    userId: "u-nv",
    centerId,
    date: new Date("2026-08-25T00:00:00Z"),
    reason: "Quên chấm ra",
    requested: null,
    status: "PENDING",
  };
}

const APPROVE = { id: "req-1", decision: "APPROVED", reviewNote: "OK", checkIn: "08:00" };
const DIRECT = (userId: string) => ({
  userId,
  date: "2026-08-25",
  reason: "Máy chấm công lỗi",
  checkIn: "08:00",
});

/** Không cổng GHI nào của module được chạm tới bản ghi công. */
function expectNoWrite() {
  expect(h.reqUpdate).not.toHaveBeenCalled();
  expect(h.checkinCreate).not.toHaveBeenCalled();
  expect(h.checkinUpdate).not.toHaveBeenCalled();
  expect(h.editLogCreate).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.checkPermission.mockResolvedValue(true);
  // Cửa sổ thời gian mở rộng: bài test này đo CỔNG CƠ SỞ, không đo quy tắc 2 ngày.
  h.getSetting.mockResolvedValue(100000);
  h.reqFindUnique.mockResolvedValue(pendingReq("c1"));
  h.reqUpdate.mockResolvedValue({ id: "req-1" });
  h.userFindUnique.mockResolvedValue({ centerId: "c1" });
  h.checkinFindMany.mockResolvedValue([]);
  h.checkinCreate.mockResolvedValue({ id: "ck-1" });
  h.checkinUpdate.mockResolvedValue({ id: "ck-1" });
  h.editLogCreate.mockResolvedValue({ id: "log-1" });
  login("u-cm", "CENTER_MANAGER", "c1");
  h.resolveActor.mockResolvedValue(QLCS_HAI_CO_SO());
});

// ── Cổng 1: duyệt yêu cầu chỉnh công ────────────────────────────────────────────────

const DENIED_REVIEW = { ok: false, error: "Yêu cầu thuộc cơ sở khác" };

describe("[L-A6] reviewAdjustmentRequest — QLCS đa cơ sở", () => {
  it("yêu cầu ở cơ sở NEO (c1) → duyệt được (không làm hỏng ca đang chạy)", async () => {
    await expect(reviewAdjustmentRequest(APPROVE)).resolves.toEqual({ ok: true });
    expect(h.reqUpdate).toHaveBeenCalledTimes(1);
    expect(h.checkinCreate).toHaveBeenCalledTimes(1);
  });

  it("yêu cầu ở cơ sở THỨ HAI (c2) → duyệt được — ca hôm nay TỪ CHỐI oan", async () => {
    h.reqFindUnique.mockResolvedValue(pendingReq("c2"));
    await expect(reviewAdjustmentRequest(APPROVE)).resolves.toEqual({ ok: true });
    expect(h.reqUpdate).toHaveBeenCalledTimes(1);
  });

  it("yêu cầu ở cơ sở NGOÀI phạm vi (c3) → từ chối, KHÔNG ghi gì", async () => {
    h.reqFindUnique.mockResolvedValue(pendingReq("c3"));
    await expect(reviewAdjustmentRequest(APPROVE)).resolves.toEqual(DENIED_REVIEW);
    expectNoWrite();
  });

  it("QLCS chỉ MỘT cơ sở → yêu cầu cơ sở khác vẫn từ chối (cách ly giữ nguyên)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs1", "CENTER_MANAGER")]));
    h.reqFindUnique.mockResolvedValue(pendingReq("c2"));
    await expect(reviewAdjustmentRequest(APPROVE)).resolves.toEqual(DENIED_REVIEW);
    expectNoWrite();
  });

  it("cơ sở neo LỆCH (JWT c1, vai neo ở c2) → duyệt được ở c2: nguồn sự thật là vai", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs2", "CENTER_MANAGER")]));
    h.reqFindUnique.mockResolvedValue(pendingReq("c2"));
    await expect(reviewAdjustmentRequest(APPROVE)).resolves.toEqual({ ok: true });
  });

  it("KIÊM NHIỆM CA1: QLCS@CS1 kiêm KẾ TOÁN@CS2 → yêu cầu CS2 bị từ chối", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    // Ghim rằng ca này không tự xanh: vế đã bị loại (đọc được CS2) VẪN cho qua.
    expect(actor.visibleCenterIds).toContain("c2");

    h.resolveActor.mockResolvedValue(actor);
    h.reqFindUnique.mockResolvedValue(pendingReq("c2"));
    await expect(reviewAdjustmentRequest(APPROVE)).resolves.toEqual(DENIED_REVIEW);
    expectNoWrite();
  });

  it("KIÊM NHIỆM CA2: QLCS@CS1 kiêm NHÂN SỰ HỘI SỞ (neo HO) → yêu cầu CS3 bị từ chối", async () => {
    const actor = actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("ho", "HO_HR", HO_HR_PERMS)]);
    expect(actor.isHoLevel).toBe(true);
    expect(actor.visibleCenterIds).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));

    h.resolveActor.mockResolvedValue(actor);
    h.reqFindUnique.mockResolvedValue(pendingReq("c3"));
    await expect(reviewAdjustmentRequest(APPROVE)).resolves.toEqual(DENIED_REVIEW);
    expectNoWrite();
  });

  it("yêu cầu CHƯA gắn cơ sở (centerId null) → vẫn duyệt được (hành vi cũ, cố ý giữ)", async () => {
    h.reqFindUnique.mockResolvedValue(pendingReq(null));
    await expect(reviewAdjustmentRequest(APPROVE)).resolves.toEqual({ ok: true });
  });

  it("SUPER_ADMIN → duyệt được ở mọi cơ sở (hành vi KHÔNG đổi)", async () => {
    login("u-sa", "SUPER_ADMIN", null);
    h.resolveActor.mockResolvedValue(actorOf("u-sa", [row("ho", "SUPER_ADMIN")]));
    h.reqFindUnique.mockResolvedValue(pendingReq("c3"));
    await expect(reviewAdjustmentRequest(APPROVE)).resolves.toEqual({ ok: true });
  });

  it("CENTER_HR (vai khác) → KHÔNG rộng thêm: chặn ở quy tắc chỉnh công như cũ", async () => {
    login("u-hr", "CENTER_HR", "c1");
    h.resolveActor.mockResolvedValue(
      actorOf("u-hr", [row("cs1", "CENTER_HR", [{ action: "hr_attendance:view", scopeType: "CENTER" }])]),
    );
    await expect(reviewAdjustmentRequest(APPROVE)).resolves.toEqual({
      ok: false,
      error: "Không có quyền chỉnh công",
    });
    expectNoWrite();
  });

  it("thiếu quyền action → 'Không có quyền' (thứ tự cổng giữ nguyên)", async () => {
    h.checkPermission.mockResolvedValue(false);
    await expect(reviewAdjustmentRequest(APPROVE)).resolves.toEqual({
      ok: false,
      error: "Không có quyền",
    });
    expectNoWrite();
  });

  it("yêu cầu ngoài tầm nhìn (sdb trả null) → 'Không tìm thấy yêu cầu'", async () => {
    h.reqFindUnique.mockResolvedValue(null);
    await expect(reviewAdjustmentRequest(APPROVE)).resolves.toEqual({
      ok: false,
      error: "Không tìm thấy yêu cầu",
    });
    expectNoWrite();
  });
});

// ── Cổng 2: quản lý chỉnh thẳng bản ghi công ─────────────────────────────────────────

const DENIED_DIRECT = { ok: false, error: "Nhân viên thuộc cơ sở khác" };

describe("[L-A6] adjustTimesheetDirect — QLCS đa cơ sở", () => {
  it("nhân viên ở cơ sở NEO (c1) → chỉnh được (không làm hỏng ca đang chạy)", async () => {
    await expect(adjustTimesheetDirect(DIRECT("u-nv"))).resolves.toEqual({ ok: true });
    expect(h.checkinCreate).toHaveBeenCalledTimes(1);
    expect(h.editLogCreate).toHaveBeenCalledTimes(1);
  });

  it("nhân viên ở cơ sở THỨ HAI (c2) → chỉnh được — ca hôm nay TỪ CHỐI oan", async () => {
    h.userFindUnique.mockResolvedValue({ centerId: "c2" });
    await expect(adjustTimesheetDirect(DIRECT("u-nv"))).resolves.toEqual({ ok: true });
    expect(h.checkinCreate).toHaveBeenCalledTimes(1);
  });

  it("nhân viên ở cơ sở NGOÀI phạm vi (c3) → từ chối, KHÔNG ghi gì", async () => {
    h.userFindUnique.mockResolvedValue({ centerId: "c3" });
    await expect(adjustTimesheetDirect(DIRECT("u-nv"))).resolves.toEqual(DENIED_DIRECT);
    expectNoWrite();
  });

  it("QLCS chỉ MỘT cơ sở → nhân viên cơ sở khác vẫn từ chối (cách ly giữ nguyên)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs1", "CENTER_MANAGER")]));
    h.userFindUnique.mockResolvedValue({ centerId: "c2" });
    await expect(adjustTimesheetDirect(DIRECT("u-nv"))).resolves.toEqual(DENIED_DIRECT);
    expectNoWrite();
  });

  it("cơ sở neo LỆCH (JWT c1, vai neo ở c2) → chỉnh được ở c2: nguồn sự thật là vai", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs2", "CENTER_MANAGER")]));
    h.userFindUnique.mockResolvedValue({ centerId: "c2" });
    await expect(adjustTimesheetDirect(DIRECT("u-nv"))).resolves.toEqual({ ok: true });
  });

  it("KIÊM NHIỆM CA1: QLCS@CS1 kiêm KẾ TOÁN@CS2 → nhân viên CS2 bị từ chối", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    expect(actor.visibleCenterIds).toContain("c2");

    h.resolveActor.mockResolvedValue(actor);
    h.userFindUnique.mockResolvedValue({ centerId: "c2" });
    await expect(adjustTimesheetDirect(DIRECT("u-nv"))).resolves.toEqual(DENIED_DIRECT);
    expectNoWrite();
  });

  it("KIÊM NHIỆM CA2: QLCS@CS1 kiêm NHÂN SỰ HỘI SỞ (neo HO) → nhân viên CS3 bị từ chối", async () => {
    const actor = actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("ho", "HO_HR", HO_HR_PERMS)]);
    expect(actor.isHoLevel).toBe(true);

    h.resolveActor.mockResolvedValue(actor);
    h.userFindUnique.mockResolvedValue({ centerId: "c3" });
    await expect(adjustTimesheetDirect(DIRECT("u-nv"))).resolves.toEqual(DENIED_DIRECT);
    expectNoWrite();
  });

  // Hôm nay cũng đã từ chối (`null !== "c1"`); chỉ khác đúng ca hiếm "QLCS không có cơ sở
  // neo" — nay fail-closed theo hợp đồng của `roleManagesCenter`.
  it("nhân viên CHƯA gắn cơ sở (null) → từ chối, kể cả khi QLCS cũng không có cơ sở neo", async () => {
    h.userFindUnique.mockResolvedValue({ centerId: null });
    await expect(adjustTimesheetDirect(DIRECT("u-nv"))).resolves.toEqual(DENIED_DIRECT);

    login("u-cm", "CENTER_MANAGER", null);
    await expect(adjustTimesheetDirect(DIRECT("u-nv"))).resolves.toEqual(DENIED_DIRECT);
    expectNoWrite();
  });

  it("SUPER_ADMIN → chỉnh được ở mọi cơ sở (hành vi KHÔNG đổi)", async () => {
    login("u-sa", "SUPER_ADMIN", null);
    h.resolveActor.mockResolvedValue(actorOf("u-sa", [row("ho", "SUPER_ADMIN")]));
    h.userFindUnique.mockResolvedValue({ centerId: "c3" });
    await expect(adjustTimesheetDirect(DIRECT("u-nv"))).resolves.toEqual({ ok: true });
  });

  it("CENTER_HR (vai khác) → KHÔNG rộng thêm: chặn ở quy tắc chỉnh công như cũ", async () => {
    login("u-hr", "CENTER_HR", "c1");
    h.resolveActor.mockResolvedValue(
      actorOf("u-hr", [row("cs1", "CENTER_HR", [{ action: "hr_attendance:view", scopeType: "CENTER" }])]),
    );
    await expect(adjustTimesheetDirect(DIRECT("u-nv"))).resolves.toEqual({
      ok: false,
      error: "Không có quyền chỉnh công",
    });
    expectNoWrite();
  });

  it("TEACHER kiêm tầm nhìn rộng (neo HO) → cổng cơ sở mới KHÔNG cấp gì thêm", async () => {
    login("u-gv", "TEACHER", "c1");
    const actor = actorOf("u-gv", [
      row("cs1", "TEACHER", [{ action: "hr_attendance:checkin", scopeType: "GLOBAL" }]),
      row("ho", "HO_HR", HO_HR_PERMS),
    ]);
    expect(actor.visibleCenterIds).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));
    h.resolveActor.mockResolvedValue(actor);
    h.userFindUnique.mockResolvedValue({ centerId: "c3" });
    await expect(adjustTimesheetDirect(DIRECT("u-nv"))).resolves.toEqual({
      ok: false,
      error: "Không có quyền chỉnh công",
    });
    expectNoWrite();
  });

  it("thiếu quyền action → 'Không có quyền' (thứ tự cổng giữ nguyên)", async () => {
    h.checkPermission.mockResolvedValue(false);
    await expect(adjustTimesheetDirect(DIRECT("u-nv"))).resolves.toEqual({
      ok: false,
      error: "Không có quyền",
    });
    expectNoWrite();
  });

  it("chưa đăng nhập → từ chối trước mọi thứ", async () => {
    h.auth.mockResolvedValue(null);
    await expect(adjustTimesheetDirect(DIRECT("u-nv"))).resolves.toEqual({
      ok: false,
      error: "Chưa đăng nhập",
    });
    expectNoWrite();
  });
});
