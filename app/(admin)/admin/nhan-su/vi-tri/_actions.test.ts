// @vitest-environment node
/**
 * A-01-3 · bất biến **L-A5** — ĐƯỜNG GHI THỨ BA: VỊ TRÍ CÔNG VIỆC.
 *
 * `roleBlockedAtHoRoot` (lib/auth/org-anchor-rules.ts) rào hai đường đã biết —
 * `assignUserOrgRole` (lib/auth/rbac-service.ts) và `reconcileUserOrgRoles`
 * (lib/auth/org-role-sync.ts). `luuViTri` là đường THỨ BA và trước 26/08/2026 không có
 * rào nào: nó nhận `orgUnitId` + `roleIds` tuỳ ý, còn màn hình (`./page.tsx`) liệt kê MỌI
 * OrgUnit còn sống (gồm Hội sở) × MỌI RoleDef còn sống (gồm CENTER_MANAGER).
 *
 * Vì sao nó tương đương hai đường kia: `loadPositionRoleRows` (lib/org/positions.ts) đổ
 * PositionRole vào `buildActor` ĐÚNG khuôn `UserOrgRoleRow`, nên vị trí neo tại HO mà tích
 * `CENTER_MANAGER` cho ra `PermEntry.centerScope = "ALL"` ⇒ `roleManagesCenter` true ở MỌI
 * cơ sở ⇒ người giữ vị trí đó duyệt lớp / chỉnh công / duyệt đơn / cấp chứng chỉ / chia
 * lead của cơ sở họ không quản lý dòng nào.
 *
 * Ba ca bắt buộc: (1) HO + CENTER_MANAGER → TỪ CHỐI, KHÔNG ghi; (2) CENTER +
 * CENTER_MANAGER → CHO; (3) HO + vai khác (HO_HR…) → CHO — L-A5 CỐ Ý chỉ cấm
 * CENTER_MANAGER, nhân sự Hội sở là việc thường ngày.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  assertCan: vi.fn(),
  resolveActor: vi.fn(),
  orgUnitFindUnique: vi.fn(),
  roleDefFindMany: vi.fn(),
  positionCreate: vi.fn(),
  positionUpdate: vi.fn(),
  positionRoleDeleteMany: vi.fn(),
  positionRoleCreateMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/auth/permissions", () => ({ assertCan: h.assertCan }));
vi.mock("@/lib/auth/actor", () => ({ resolveActor: h.resolveActor }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/audit/audit-log", () => ({ writeAudit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/org/positions", () => ({
  PrimaryAssignmentConflictError: class extends Error {},
  ReportingCycleError: class extends Error {},
  assertNoReportingCycle: vi.fn().mockResolvedValue(undefined),
  assertSinglePrimary: vi.fn().mockResolvedValue(undefined),
}));
// ⚠️ Client giả KHÔNG lọc gì: nếu cổng chỉ "đúng" nhờ scopedDb chặn hộ thì test này đỏ
// (luật cứng #3 — scopedDb chỉ che đường ĐỌC, đây là đường GHI).
vi.mock("@/lib/db-scope", () => ({
  scopedDb: () => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        orgUnit: { findUnique: h.orgUnitFindUnique },
        roleDef: { findMany: h.roleDefFindMany },
        position: { create: h.positionCreate, update: h.positionUpdate },
        positionRole: {
          deleteMany: h.positionRoleDeleteMany,
          createMany: h.positionRoleCreateMany,
        },
      }),
  }),
}));

import { luuViTri } from "./_actions";

const CENTER_MANAGER = { id: "r-cm", code: "CENTER_MANAGER" };
const HO_HR = { id: "r-hr", code: "HO_HR" };

/** Đơn vị + bộ RoleDef mà transaction sẽ đọc được. */
function arm(orgType: string, roles: { id: string; code: string }[]) {
  h.orgUnitFindUnique.mockResolvedValue({ type: orgType });
  h.roleDefFindMany.mockResolvedValue(roles);
}

const input = (over: Record<string, unknown> = {}) => ({
  title: "Quản lý vận hành",
  orgUnitId: "ho",
  isManagerial: true,
  roleIds: ["r-cm"],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "u-sa", name: "Super", role: "SUPER_ADMIN" } });
  h.assertCan.mockReturnValue(undefined);
  h.resolveActor.mockResolvedValue({ userId: "u-sa" });
  h.positionCreate.mockResolvedValue({ id: "pos-1" });
  h.positionUpdate.mockResolvedValue({});
  h.positionRoleDeleteMany.mockResolvedValue({});
  h.positionRoleCreateMany.mockResolvedValue({});
});

describe("[L-A5] luuViTri — vị trí là đường ghi thứ ba của luật neo HO/ROOT", () => {
  it("TẠO vị trí tại Hội sở + RoleDef CENTER_MANAGER → TỪ CHỐI, KHÔNG ghi gì", async () => {
    arm("HO", [CENTER_MANAGER]);
    const res = await luuViTri(input());
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("CENTER_MANAGER");
    expect(h.positionCreate).not.toHaveBeenCalled();
    expect(h.positionRoleCreateMany).not.toHaveBeenCalled();
  });

  it("SỬA vị trí sang Hội sở + CENTER_MANAGER → TỪ CHỐI, KHÔNG đụng bộ vai cũ", async () => {
    arm("HO", [CENTER_MANAGER]);
    const res = await luuViTri(input({ id: "pos-9" }));
    expect(res.ok).toBe(false);
    expect(h.positionUpdate).not.toHaveBeenCalled();
    expect(h.positionRoleDeleteMany).not.toHaveBeenCalled();
  });

  it("đơn vị gốc ROOT cũng bị cấm (cùng luật `isHoRootOrgType`)", async () => {
    arm("ROOT", [CENTER_MANAGER]);
    await expect(luuViTri(input({ orgUnitId: "root" }))).resolves.toMatchObject({ ok: false });
    expect(h.positionCreate).not.toHaveBeenCalled();
  });

  it("CENTER_MANAGER lẫn trong danh sách nhiều vai vẫn bị bắt", async () => {
    arm("HO", [HO_HR, CENTER_MANAGER]);
    await expect(luuViTri(input({ roleIds: ["r-hr", "r-cm"] }))).resolves.toMatchObject({
      ok: false,
    });
    expect(h.positionCreate).not.toHaveBeenCalled();
  });

  it("vị trí tại CƠ SỞ + CENTER_MANAGER → CHO (đường dùng bình thường)", async () => {
    arm("CENTER", [CENTER_MANAGER]);
    await expect(luuViTri(input({ orgUnitId: "cs1" }))).resolves.toEqual({ ok: true, id: "pos-1" });
    expect(h.positionCreate).toHaveBeenCalledTimes(1);
  });

  it("vị trí tại Hội sở + vai KHÁC (HO_HR) → CHO: L-A5 cố ý chỉ cấm CENTER_MANAGER", async () => {
    arm("HO", [HO_HR]);
    await expect(luuViTri(input({ roleIds: ["r-hr"] }))).resolves.toEqual({ ok: true, id: "pos-1" });
    expect(h.positionCreate).toHaveBeenCalledTimes(1);
  });

  it("vị trí KHÔNG gắn vai nào → không cần đọc RoleDef, vẫn lưu được", async () => {
    arm("HO", []);
    await expect(luuViTri(input({ roleIds: [] }))).resolves.toEqual({ ok: true, id: "pos-1" });
    expect(h.roleDefFindMany).not.toHaveBeenCalled();
  });

  it("đơn vị không tồn tại → TỪ CHỐI (fail-closed, không đoán type)", async () => {
    h.orgUnitFindUnique.mockResolvedValue(null);
    h.roleDefFindMany.mockResolvedValue([CENTER_MANAGER]);
    await expect(luuViTri(input())).resolves.toMatchObject({ ok: false });
    expect(h.positionCreate).not.toHaveBeenCalled();
  });
});
