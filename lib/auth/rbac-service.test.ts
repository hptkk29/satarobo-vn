// lib/auth/rbac-service.test.ts
// Bất biến L-A5 (A-01-3) + L-A11 (§6.10 — R1/R2/R3) + SEC-M13 (rào cũ, phải VẪN xanh),
// cho CẢ đường GÁN lẫn đường THU HỒI.
//
// Vì sao mock `@/lib/db`: các rào ở đây là thứ tự + điều kiện thuần trong service; chạy
// thuần cho phép khẳng định "KHÔNG có dòng nào được ghi khi bị từ chối" (assert upsert /
// update chưa hề được gọi) — điều mà test chạm DB thật rất dễ bỏ lọt.
//
// ⚠️ ACTOR Ở ĐÂY LÀ HÌNH DẠNG THẬT, KHÔNG PHẢI HÌNH DẠNG TIỆN TAY (vá 25/08/2026).
// Bản trước mô phỏng "HR Hội sở sau OQ-7" bằng `grants: [{action:"roles:assign",
// grant:"ALLOW"}]` — override PER-USER mà chính đợt này đã CẤM tạo
// (`app/(admin)/admin/users/[id]/permissions/_actions.ts`, tiền tố `roles:`). Tức cấu hình
// dùng để chứng minh 3 rào an toàn là cấu hình hệ thống thật KHÔNG tạo ra được, và bất biến
// L-A11 ("roles:assign mở cho HO_HR") không có test nào khẳng định trên đường thật.
// Nay: HR mang ĐÚNG thứ seed cấp — một `RolePermission(roles:assign, GLOBAL)` trên Actor v2
// (`prisma/seed-roles.ts` · HO_HR), không grant per-user nào; và cổng đi qua CHÍNH lõi
// `decidePermissionWithGrant` mà trang `/admin/users/[id]/org-roles` dùng.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

type FakeRow = {
  userId: string;
  orgUnitId: string;
  roleId: string;
  status: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

const H = vi.hoisted(() => {
  /** Actor v2 tối thiểu — đủ field cho `resolveGrant` + `can()` v2. */
  const actorRong = (userId: string) => ({
    userId,
    isSuperAdmin: false,
    isHoLevel: false,
    orgRoles: [] as { orgUnitId: string; roleCode: string }[],
    permissions: [] as {
      action: string;
      scopeType: string;
      orgUnitId: string;
      roleCode: string;
      centerScope: "ALL" | string[] | null;
    }[],
    visibleCenterIds: [] as string[],
    visibleOrgUnitIds: [] as string[],
    grantsAllow: new Set<string>(),
    assignedClassIds: new Set<string>(),
    permissionGrants: [] as unknown[],
    roleIds: [] as string[],
    groupIds: [] as string[],
  });

  const state: {
    org: { id: string; type: string; centerId: string | null; deletedAt: Date | null } | null;
    role: { id: string; code: string; permissions: { action: string }[] } | null;
    user: { id: string } | null;
    existing: FakeRow | null;
    /** Actor v2 theo userId — thứ `resolveActor` trả về (mock cùng khuôn DB thật). */
    actors: Map<string, ReturnType<typeof actorRong>>;
  } = { org: null, role: null, user: null, existing: null, actors: new Map() };

  const resolveActor = vi.fn(async (userId: string) => state.actors.get(userId) ?? actorRong(userId));

  const upsert = vi.fn(
    async (args: { create: Record<string, unknown> }): Promise<FakeRow> => ({
      userId: String(args.create.userId),
      orgUnitId: String(args.create.orgUnitId),
      roleId: String(args.create.roleId),
      status: "ACTIVE",
      effectiveFrom: new Date("2026-08-25T00:00:00Z"),
      effectiveTo: null,
    }),
  );
  const update = vi.fn(
    async (): Promise<FakeRow> => ({
      userId: state.existing?.userId ?? "u-target",
      orgUnitId: state.existing?.orgUnitId ?? "org-1",
      roleId: state.existing?.roleId ?? "role-1",
      status: "EXPIRED",
      effectiveFrom: new Date("2026-08-25T00:00:00Z"),
      effectiveTo: new Date("2026-08-25T00:00:00Z"),
    }),
  );
  const audit = vi.fn(async (_params: { reason: string; action: string }) => {});
  const sync = vi.fn(async () => {});

  const db = {
    orgUnit: { findUnique: vi.fn(async () => state.org) },
    roleDef: { findUnique: vi.fn(async () => state.role) },
    user: { findUnique: vi.fn(async () => state.user) },
    userOrgRole: { findUnique: vi.fn(async () => state.existing) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ userOrgRole: { upsert, update } }),
    ),
  };

  return { state, db, upsert, update, audit, sync, resolveActor, actorRong };
});

vi.mock("@/lib/db", () => ({ db: H.db }));
vi.mock("@/lib/audit/log", () => ({ logRbacAudit: H.audit }));
// `resolveActor` là DB-backed (6 truy vấn) — mock để test giữ được tính THUẦN, nhưng lõi
// quyết định quyền (`decidePermissionWithGrant` → grant → v1/v2 theo cờ) chạy THẬT.
vi.mock("@/lib/auth/actor", () => ({ resolveActor: H.resolveActor }));
vi.mock("@/lib/chat/sync-membership", () => ({
  syncCenterClassConversations: H.sync,
  CHAT_CENTER_MANAGER_ROLE_CODES: ["CENTER_MANAGER", "CENTER_CLASS_MANAGER"] as const,
}));

const { RbacError, assignUserOrgRole, revokeUserOrgRole } = await import(
  "@/lib/auth/rbac-service"
);
type Actor = Parameters<typeof assignUserOrgRole>[0];

/** SUPER_ADMIN — vượt mọi rào TRỪ A-01-3 (rào đó chặn cứng, kể cả SUPER_ADMIN). */
const SUPER: Actor = { id: "u-super", name: "Super", role: "SUPER_ADMIN", roles: ["SUPER_ADMIN"] };
/**
 * HR Hội sở sau OQ-7 — hình dạng THẬT: `User.role` vẫn là enum v1 `HR` (ma trận tĩnh KHÔNG
 * biết mã RoleDef `HO_HR`), quyền `roles:assign` đến từ RoleDef qua `UserOrgRole`, KHÔNG có
 * override per-user nào. Đây là actor mà tính năng thật tạo ra.
 */
const HR: Actor = { id: "u-hr", name: "HR Hội sở", role: "HR", roles: ["HR"] };

/** Đăng ký actor v2 (thứ `resolveActor` trả) cho một userId. */
function datActorV2(
  userId: string,
  over: Partial<ReturnType<typeof H.actorRong>> = {},
): void {
  H.state.actors.set(userId, { ...H.actorRong(userId), ...over });
}

/** Quyền GLOBAL đúng khuôn seed (`prisma/seed-roles.ts` — HO_HR · roles:assign GLOBAL). */
const permGlobal = (action: string, roleCode: string) => ({
  action,
  scopeType: "GLOBAL",
  orgUnitId: "ou-ho",
  roleCode,
  centerScope: "ALL" as const,
});

function setup(opts?: {
  orgType?: string;
  roleCode?: string;
  rolePerms?: string[];
  centerId?: string | null;
}) {
  H.state.org = {
    id: "org-1",
    type: opts?.orgType ?? "CENTER",
    centerId: opts?.centerId === undefined ? "c1" : opts.centerId,
    deletedAt: null,
  };
  H.state.role = {
    id: "role-1",
    code: opts?.roleCode ?? "TEACHER",
    permissions: (opts?.rolePerms ?? ["attendance:mark"]).map((action) => ({ action })),
  };
  H.state.user = { id: "u-target" };
  H.state.existing = {
    userId: "u-target",
    orgUnitId: "org-1",
    roleId: "role-1",
    status: "ACTIVE",
    effectiveFrom: new Date("2026-08-01T00:00:00Z"),
    effectiveTo: null,
  };
}

const INPUT = {
  userId: "u-target",
  orgUnitId: "org-1",
  roleId: "role-1",
  reason: "Bổ nhiệm theo QĐ 12",
};

/** Bắt lỗi và trả về nó — thay `rejects.toThrow` (không đọc được `.code`). */
async function bat(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  throw new Error("Lẽ ra phải bị từ chối, nhưng đã chạy lọt.");
}

function laRbac(e: unknown, code: string): InstanceType<typeof RbacError> {
  expect(e).toBeInstanceOf(RbacError);
  if (!(e instanceof RbacError)) throw new Error("không phải RbacError");
  expect(e.code).toBe(code);
  return e;
}

/** Không rào nào được để lọt một dòng ghi hay một dòng audit. */
function khongGhiGi() {
  expect(H.upsert).not.toHaveBeenCalled();
  expect(H.update).not.toHaveBeenCalled();
  expect(H.audit).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  // Cờ BẬT = hình dạng PROD (`RBAC_V2_ENABLED="true"` trên Vercel Production). Đây là môi
  // trường mà OQ-7 phải chạy được; nhóm "cổng hành động" bên dưới tự tắt cờ để đo nửa còn lại.
  vi.stubEnv("RBAC_V2_ENABLED", "true");
  // `decidePermission` warn ra console mỗi lần v1≠v2 (HR: v1 false / v2 true) — tiếng ồn
  // của shadow, không phải lỗi.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  H.state.actors = new Map();
  datActorV2(SUPER.id, { isSuperAdmin: true });
  datActorV2(HR.id, {
    orgRoles: [{ orgUnitId: "ou-ho", roleCode: "HO_HR" }],
    permissions: [permGlobal("roles:assign", "HO_HR"), permGlobal("employees:view-all", "HO_HR")],
    roleIds: ["role-ho-hr"],
  });
  setup();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── L-A11 / OQ-7 — CỔNG HÀNH ĐỘNG khớp CỔNG TRANG ──────────────────
//
// Bất biến: `assignUserOrgRole`/`revokeUserOrgRole` và trang `/admin/users/[id]/org-roles`
// phải trả lời GIỐNG NHAU về `roles:assign`. Trước bản vá, trang đi
// `checkPermission` (grant → v1/v2 theo cờ) còn service đi `can()` v1 ma trận TĨNH ⇒ HO_HR
// vào được trang nhưng mọi thao tác đều bị từ chối, và cả 3 rào dưới đây là mã CHẾT với
// mọi actor không phải SUPER_ADMIN.
describe("[L-A11 · OQ-7] cổng hành động dùng đúng hệ quyền của cổng trang", () => {
  it("HO_HR THẬT (quyền từ RoleDef, không grant per-user) gán được vai thường khi cờ v2 BẬT", async () => {
    await assignUserOrgRole(HR, INPUT);
    expect(H.upsert).toHaveBeenCalledTimes(1);
  });

  it("HO_HR thu hồi được vai thường (đường thu hồi cùng cổng)", async () => {
    await revokeUserOrgRole(HR, INPUT);
    expect(H.update).toHaveBeenCalledTimes(1);
  });

  it("actor KHÔNG có roles:assign ⇒ FORBIDDEN, không ghi dòng nào", async () => {
    const gv: Actor = { id: "u-gv", name: "Giáo viên", role: "TEACHER", roles: ["TEACHER"] };
    datActorV2(gv.id, { permissions: [permGlobal("attendance:mark", "CENTER_TEACHER")] });

    const e = laRbac(await bat(() => assignUserOrgRole(gv, INPUT)), "FORBIDDEN");
    expect(e.message).toMatch(/không có quyền/i);
    khongGhiGi();
  });

  it("cờ v2 TẮT (local/dev/CI) ⇒ HO_HR bị từ chối — ĐÚNG BẰNG câu trả lời của cổng trang", async () => {
    // Không phải "rào chặn HR": v1 là ma trận theo enum `Role`, mà `User.role` của HR Hội
    // sở là `HR`, không phải `HO_HR`. Cờ TẮT thì TRANG cũng đóng — hai cổng vẫn khớp nhau,
    // đó mới là bất biến cần giữ.
    vi.stubEnv("RBAC_V2_ENABLED", "false");

    laRbac(await bat(() => assignUserOrgRole(HR, INPUT)), "FORBIDDEN");
    khongGhiGi();
  });

  it("SUPER_ADMIN chỉ có ở tư cách v2 (UserOrgRole) vẫn gán được — không cần User.role legacy", async () => {
    const saV2: Actor = { id: "u-sa-v2", name: "SA v2", role: "HR", roles: ["HR"] };
    datActorV2(saV2.id, { isSuperAdmin: true });
    setup({ roleCode: "HO_HR", rolePerms: ["roles:assign"] });

    // Qua được cả cổng quyền LẪN R1 (R1 miễn cho SUPER_ADMIN) ⇒ chứng minh `isSuperActor`
    // đọc chung một nguồn với UI (`laSuperAdminActor`).
    await assignUserOrgRole(saV2, INPUT);
    expect(H.upsert).toHaveBeenCalledTimes(1);
  });
});

// ─── R1 — chống nhân bản quyền cấp quyền ────────────────────────────
describe("R1 (§6.10) — không nhân bản quyền cấp quyền", () => {
  it("HR không gán được vai mang `roles:assign`", async () => {
    setup({ roleCode: "HO_HR", rolePerms: ["employees:view", "roles:assign"] });
    laRbac(await bat(() => assignUserOrgRole(HR, INPUT)), "FORBIDDEN_PRIVILEGED_ROLE");
    khongGhiGi();
  });

  it("HR không gán được vai mang `users:manage`", async () => {
    setup({ roleCode: "VAI_BAT_KY", rolePerms: ["users:manage"] });
    laRbac(await bat(() => assignUserOrgRole(HR, INPUT)), "FORBIDDEN_PRIVILEGED_ROLE");
    khongGhiGi();
  });

  it("HR không gán được vai mang `roles:manage` (khớp theo tiền tố `roles:`)", async () => {
    setup({ roleCode: "VAI_BAT_KY", rolePerms: ["roles:manage"] });
    laRbac(await bat(() => assignUserOrgRole(HR, INPUT)), "FORBIDDEN_PRIVILEGED_ROLE");
    khongGhiGi();
  });

  it("R1 kiểm theo QUYỀN chứ không theo TÊN vai: vai tên `ROLES_XYZ` mà quyền vô hại thì gán được", async () => {
    setup({ roleCode: "ROLES_XYZ", rolePerms: ["leads:view-all"] });
    await assignUserOrgRole(HR, INPUT);
    expect(H.upsert).toHaveBeenCalledTimes(1);
  });

  it("SUPER_ADMIN VẪN gán được vai mang `roles:assign` (rào chỉ áp cho actor không phải SUPER_ADMIN)", async () => {
    setup({ roleCode: "HO_HR", rolePerms: ["roles:assign"] });
    await assignUserOrgRole(SUPER, INPUT);
    expect(H.upsert).toHaveBeenCalledTimes(1);
  });

  it("vai thường không bị R1 chặn", async () => {
    await assignUserOrgRole(HR, INPUT);
    expect(H.upsert).toHaveBeenCalledTimes(1);
  });
});

// ─── R2 — không tự gán cho chính mình ───────────────────────────────
describe("R2 (§6.10) — không tự gán cho chính mình", () => {
  it("HR tự gán cho chính mình bị từ chối, kèm thông điệp tiếng Việt", async () => {
    const e = laRbac(
      await bat(() => assignUserOrgRole(HR, { ...INPUT, userId: HR.id })),
      "SELF_ASSIGN_FORBIDDEN",
    );
    expect(e.message).toMatch(/chính mình/i);
    expect(e.field).toBe("userId");
    khongGhiGi();
  });

  it("R2 chặn kể cả khi vai được gán hoàn toàn vô hại", async () => {
    setup({ roleCode: "TEACHER", rolePerms: ["attendance:mark"] });
    laRbac(
      await bat(() => assignUserOrgRole(HR, { ...INPUT, userId: HR.id })),
      "SELF_ASSIGN_FORBIDDEN",
    );
    khongGhiGi();
  });

  it("SUPER_ADMIN tự gán được (ngoại lệ có chủ đích — OQ-5: người vừa là QLCS vừa SUPER_ADMIN)", async () => {
    await assignUserOrgRole(SUPER, { ...INPUT, userId: SUPER.id });
    expect(H.upsert).toHaveBeenCalledTimes(1);
  });
});

// ─── R3 — reason bắt buộc + ghi audit ───────────────────────────────
describe("R3 (§6.10) — `reason` bắt buộc cho cả gán lẫn thu hồi", () => {
  it("gán thiếu `reason` ⇒ từ chối, không ghi dòng nào", async () => {
    const e = await bat(() => assignUserOrgRole(SUPER, { ...INPUT, reason: undefined }));
    expect(e).toBeInstanceOf(Error);
    khongGhiGi();
  });

  it("gán với `reason` toàn khoảng trắng ⇒ từ chối", async () => {
    await bat(() => assignUserOrgRole(SUPER, { ...INPUT, reason: "   " }));
    khongGhiGi();
  });

  it("thu hồi thiếu `reason` ⇒ từ chối, không đụng dòng nào", async () => {
    await bat(() => revokeUserOrgRole(SUPER, { ...INPUT, reason: "" }));
    khongGhiGi();
  });

  it("gán thành công ⇒ `logRbacAudit` nhận đúng lý do người dùng nhập", async () => {
    await assignUserOrgRole(SUPER, INPUT);
    expect(H.audit).toHaveBeenCalledTimes(1);
    const arg = H.audit.mock.calls[0]?.[0] as { reason: string; action: string } | undefined;
    expect(arg?.reason).toBe("Bổ nhiệm theo QĐ 12");
    expect(arg?.action).toBe("ASSIGN");
  });

  it("thu hồi thành công ⇒ `logRbacAudit` ghi REVOKE kèm lý do", async () => {
    await revokeUserOrgRole(SUPER, { ...INPUT, reason: "Nghỉ việc từ 01/09" });
    expect(H.audit).toHaveBeenCalledTimes(1);
    const arg = H.audit.mock.calls[0]?.[0] as { reason: string; action: string } | undefined;
    expect(arg?.reason).toBe("Nghỉ việc từ 01/09");
    expect(arg?.action).toBe("REVOKE");
  });
});

// ─── SEC-M13 — rào cũ phải VẪN xanh (cả 2 chiều) ────────────────────
describe("SEC-M13 — chỉ SUPER_ADMIN đụng được vai `SUPER_ADMIN`", () => {
  it("HR gán vai SUPER_ADMIN ⇒ giữ nguyên mã lỗi cũ FORBIDDEN_ROLE (thứ tự rào không nuốt thông điệp cũ)", async () => {
    setup({ roleCode: "SUPER_ADMIN", rolePerms: ["roles:assign", "roles:manage", "users:manage"] });
    laRbac(await bat(() => assignUserOrgRole(HR, INPUT)), "FORBIDDEN_ROLE");
    khongGhiGi();
  });

  it("SUPER_ADMIN gán vai SUPER_ADMIN tại cơ sở ⇒ được", async () => {
    setup({ roleCode: "SUPER_ADMIN", rolePerms: ["roles:assign"] });
    await assignUserOrgRole(SUPER, INPUT);
    expect(H.upsert).toHaveBeenCalledTimes(1);
  });

  it("ĐỐI NGẪU: HR KHÔNG thu hồi được dòng vai SUPER_ADMIN của người khác", async () => {
    setup({ roleCode: "SUPER_ADMIN", rolePerms: ["roles:assign"] });
    laRbac(await bat(() => revokeUserOrgRole(HR, INPUT)), "FORBIDDEN_ROLE");
    khongGhiGi();
  });

  it("ĐỐI NGẪU R1: HR KHÔNG thu hồi được vai mang `roles:*`", async () => {
    setup({ roleCode: "HO_HR", rolePerms: ["roles:assign"] });
    laRbac(await bat(() => revokeUserOrgRole(HR, INPUT)), "FORBIDDEN_PRIVILEGED_ROLE");
    khongGhiGi();
  });

  it("SUPER_ADMIN thu hồi được vai SUPER_ADMIN", async () => {
    setup({ roleCode: "SUPER_ADMIN", rolePerms: ["roles:assign"] });
    await revokeUserOrgRole(SUPER, INPUT);
    expect(H.update).toHaveBeenCalledTimes(1);
  });

  it("HR vẫn thu hồi được vai thường", async () => {
    await revokeUserOrgRole(HR, INPUT);
    expect(H.update).toHaveBeenCalledTimes(1);
  });
});

// ─── A-01-3 / L-A5 — chặn cứng CENTER_MANAGER tại HO/ROOT ───────────
describe("A-01-3 (L-A5) — không neo được vai CENTER_MANAGER tại HO/ROOT", () => {
  it("SUPER_ADMIN cũng bị chặn khi neo CENTER_MANAGER tại HO — kèm giải thích", async () => {
    setup({
      orgType: "HO",
      roleCode: "CENTER_MANAGER",
      rolePerms: ["leads:view-all"],
      centerId: null,
    });
    const e = laRbac(await bat(() => assignUserOrgRole(SUPER, INPUT)), "ORG_TYPE_FORBIDDEN");
    expect(e.field).toBe("orgUnitId");
    expect(e.message).toMatch(/mọi cơ sở/i);
    khongGhiGi();
  });

  it("chặn tương tự tại ROOT", async () => {
    setup({
      orgType: "ROOT",
      roleCode: "CENTER_MANAGER",
      rolePerms: ["leads:view-all"],
      centerId: null,
    });
    laRbac(await bat(() => assignUserOrgRole(SUPER, INPUT)), "ORG_TYPE_FORBIDDEN");
    khongGhiGi();
  });

  it("HR cũng bị chặn (rào không phụ thuộc actor)", async () => {
    setup({
      orgType: "HO",
      roleCode: "CENTER_MANAGER",
      rolePerms: ["leads:view-all"],
      centerId: null,
    });
    laRbac(await bat(() => assignUserOrgRole(HR, INPUT)), "ORG_TYPE_FORBIDDEN");
    khongGhiGi();
  });

  it("CENTER_MANAGER tại OrgUnit type CENTER ⇒ được (đường đúng của A-01-1)", async () => {
    setup({ orgType: "CENTER", roleCode: "CENTER_MANAGER", rolePerms: ["leads:view-all"] });
    await assignUserOrgRole(SUPER, INPUT);
    expect(H.upsert).toHaveBeenCalledTimes(1);
  });

  it("CENTER_MANAGER tại REGION ⇒ được (§6.1: cùng vùng có thể neo một dòng ở REGION)", async () => {
    setup({
      orgType: "REGION",
      roleCode: "CENTER_MANAGER",
      rolePerms: ["leads:view-all"],
      centerId: null,
    });
    await assignUserOrgRole(SUPER, INPUT);
    expect(H.upsert).toHaveBeenCalledTimes(1);
  });

  it("vai KHÁC tại HO ⇒ vẫn được (§6.10 cố ý KHÔNG cấm neo tại HO nói chung)", async () => {
    setup({
      orgType: "HO",
      roleCode: "HO_ACCOUNTANT",
      rolePerms: ["payments:view"],
      centerId: null,
    });
    await assignUserOrgRole(SUPER, INPUT);
    expect(H.upsert).toHaveBeenCalledTimes(1);
  });
});

// ─── SL-01 — đường gán TAY ghi source = MANUAL ──────────────────────
//
// ⚠️ Nửa sau của bộ này là bản vá 25/08/2026. `upsert` chạy nhánh `update` cho MỌI dòng đã
// tồn tại ở khoá — KHÔNG chỉ dòng đã EXPIRED như chú thích cũ khẳng định. Ghi MANUAL vô
// điều kiện ở đó nghĩa là một cú bấm "Gán" trùng cặp đang sống lật AUTO → MANUAL vĩnh viễn,
// và `reconcileUserOrgRoles` MẤT QUYỀN thu hồi dòng đó: hạ vai QLCS ở /admin/nhan-su báo
// "thành công", không có audit REVOKE, mà người đó vẫn là QLCS ở lần đăng nhập sau.
describe("SL-01 — đường gán tay đánh dấu `source = MANUAL`", () => {
  const argsUpsert = () =>
    H.upsert.mock.calls[0]?.[0] as
      | { create: Record<string, unknown>; update: Record<string, unknown> }
      | undefined;

  it("cột `source` phải còn trong Prisma Client — mất cột là mất luôn rào SL-01", () => {
    const field = Prisma.dmmf.datamodel.models
      .find((m) => m.name === "UserOrgRole")
      ?.fields.find((f) => f.name === "source");
    expect(field).toBeDefined();
  });

  it("chưa có dòng nào ⇒ nhánh `create` ghi MANUAL (DEFAULT của cột là AUTO — im lặng nếu quên)", async () => {
    H.state.existing = null;

    await assignUserOrgRole(SUPER, INPUT);

    expect(argsUpsert()?.create.source).toBe("MANUAL");
  });

  it("dòng cũ đã HẾT hiệu lực ⇒ hồi sinh: nhánh `update` ghi MANUAL", async () => {
    H.state.existing = {
      userId: "u-target",
      orgUnitId: "org-1",
      roleId: "role-1",
      status: "EXPIRED",
      effectiveFrom: new Date("2026-08-01T00:00:00Z"),
      effectiveTo: new Date("2026-08-10T00:00:00Z"),
    };

    await assignUserOrgRole(SUPER, INPUT);

    expect(argsUpsert()?.update.source).toBe("MANUAL");
  });

  it("🔴 dòng AUTO đang CÒN hiệu lực ⇒ `update` KHÔNG đụng `source` (không cướp quyền thu hồi của reconcile)", async () => {
    // `setup()` để `existing` ở trạng thái ACTIVE, effectiveTo = null → còn hiệu lực.
    await assignUserOrgRole(SUPER, INPUT);

    // `undefined` là hợp đồng của Prisma cho "đừng cập nhật cột này" — khác hẳn `null`.
    expect(argsUpsert()?.update).not.toHaveProperty("source", "MANUAL");
    expect(argsUpsert()?.update.source).toBeUndefined();
  });

  it("gia hạn dòng đang sống vẫn cập nhật hiệu lực + trạng thái (không phải no-op)", async () => {
    await assignUserOrgRole(SUPER, { ...INPUT, effectiveTo: "2026-12-31" });

    const u = argsUpsert()?.update;
    expect(u?.status).toBe("ACTIVE");
    expect(u?.effectiveTo).toBeInstanceOf(Date);
  });
});
