// @vitest-environment node
/**
 * A-01-6 · bất biến **L-A6** — cổng GHI "đặt chế độ chia lead cho MỘT cơ sở"
 * (`setCenterAssignModeAction`, `app/(admin)/admin/leads/actions.ts`).
 *
 * VÌ SAO ĐÂY LÀ CỔNG GHI, KHÔNG PHẢI LỌC HIỂN THỊ:
 *   · Action ghi thẳng `db.leadAssignmentConfig.upsert({ where: { centerId } })` — `db`
 *     TRẦN (file này nằm trong `lib/eslint/db-import-allowlist.mjs`, loại B), nên KHÔNG
 *     có tầng nào lọc hộ. Thêm nữa `LeadAssignmentConfig` là `SCOPE_EXEMPT`
 *     (`lib/db-scope.ts:80`) ⇒ kể cả đi qua `scopedDb` thì cũng pass-through.
 *   · Quyền cổng ngoài là `leads:assign`, mà `CENTER_MANAGER` giữ nó ở scope **GLOBAL**
 *     (`prisma/seed-roles.ts:419`) ⇒ `can()` v2 `scopeMatches` trả `true` cho MỌI
 *     `target.centerId` (`lib/auth/can.ts:15-16`). Nói cách khác: dòng so cơ sở trong
 *     action là **thứ duy nhất** giữ cách ly cơ sở cho đường ghi này.
 *
 * BỆNH ĐANG CÓ: dòng đó so với `session.user.centerId` — MỘT cơ sở neo, ảnh chụp lúc
 * đăng nhập (`lib/auth.ts`). Quản lý giữ 2 cơ sở đổi được chế độ chia của cơ sở neo
 * nhưng KHÔNG đổi được của cơ sở thứ hai họ cũng đang quản lý.
 *
 * PHÉP ĐO ĐÚNG: `roleManagesCenter(actor, "CENTER_MANAGER", centerId)` — tập cơ sở
 * người này đang giữ CHÍNH vai QLCS, suy từ `PermEntry.roleCode` + `centerScope`, tức
 * từ đúng dòng `UserOrgRole` đẻ ra quyền (`lib/auth/managed-centers.ts`).
 *
 * ⚠️ HAI CÁCH ĐO SAI đã bị loại ở đợt 26/08 và test dưới ghim lại từng cái:
 *   · `actor.visibleCenterIds.includes(centerId)` — nở theo vai KIÊM NHIỆM.
 *   · `passesScope("Lead", …)` — nở theo quyền `leads:*` của vai khác, và một dòng
 *     `UserPermissionGrant` ALLOW khớp tiền tố bật `hasAll` ⇒ "ALL" cho mọi cơ sở.
 * Mỗi ca kiêm nhiệm dưới đây KHẲNG ĐỊNH TRƯỚC rằng hai vế cũ đều CHO QUA, rồi mới đòi
 * cổng TỪ CHỐI — để ca không thể tự xanh.
 *
 * Ba ca bắt buộc: cơ sở thứ hai CHO · cơ sở ngoài phạm vi TỪ CHỐI · vai khác KHÔNG
 * rộng thêm một ly nào.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgUnitNode } from "@/lib/org/types";
import type { Actor, UserOrgRoleRow } from "@/lib/auth/actor";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveActor: vi.fn(),
  upsert: vi.fn(),
  // Ba đường GHI phân công lead. Mock ở BIÊN lib để test soi được ĐÚNG tập cơ sở mà
  // action tính ra và truyền xuống — thứ mà 32 test tầng lib không thể thấy (chúng nhận
  // literal "ALL"/[CS1] từ ngoài vào, không dựng `Actor` thật bao giờ).
  manualAssign: vi.fn(),
  autoAssignNew: vi.fn(),
  autoAssign: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  // `lib/settings/read-global` (nạp gián tiếp qua actor.ts) bọc unstable_cache lúc import.
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
// Client GHI giả — KHÔNG lọc gì. Nếu cổng chỉ đúng nhờ tầng dưới chặn hộ thì test đỏ.
vi.mock("@/lib/db", () => ({ db: { leadAssignmentConfig: { upsert: h.upsert } } }));
// Giữ `buildActor` THẬT, chỉ thay đường nạp actor từ DB.
vi.mock("@/lib/auth/actor", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/actor")>();
  return { ...actual, resolveActor: h.resolveActor };
});
// ⚠️ `checkPermission` để NGUYÊN (không mock): cổng ngoài phải được chạy thật, nếu không
// ca "vai khác không rộng thêm" chỉ đo cái mock của chính mình.
vi.mock("@/lib/lead/auto-assign", () => ({
  manualAssignLead: h.manualAssign,
  autoAssignNewLead: h.autoAssignNew,
  reassignForCenter: vi.fn(),
}));
vi.mock("@/lib/lead/assign", () => ({ autoAssignLead: h.autoAssign }));

import { buildActor } from "@/lib/auth/actor";
import { getModelVisibleCenterIds, passesScope } from "@/lib/db-scope";
import * as leadActions from "./actions";
import {
  assignLeadToSaleAction,
  autoAssignLeadAction,
  autoAssignNewLeadAction,
  setCenterAssignModeAction,
} from "./actions";

// Cây theo hình CHỐT 11/08/2026: HO → REGION → CENTER (lib/org/org-tree.ts).
// Hai cơ sở của QLCS ở HAI VÙNG khác nhau — fixture mà L-A13 đòi.
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

/** QLCS — bám đúng bộ `leads:*` của `prisma/seed-roles.ts:411-420`. */
const CM_PERMS: Perms = [
  { action: "leads:view-all", scopeType: "GLOBAL" },
  { action: "leads:assign", scopeType: "GLOBAL" },
  { action: "leads:edit", scopeType: "GLOBAL" },
];
/** Kế toán cơ sở — KHÔNG có `leads:*`, nhưng vẫn nở `visibleCenterIds` (seed-roles.ts:775). */
const KE_TOAN_PERMS: Perms = [
  { action: "payments:manage", scopeType: "GLOBAL" },
  { action: "students:view-all", scopeType: "GLOBAL" },
  { action: "classes:view-all", scopeType: "GLOBAL" },
];
/** HO_SALE — `leads:view-all` GLOBAL tại HO (seed-roles.ts:384-386): nở CẢ HAI vế cũ. */
const HO_SALE_PERMS: Perms = [{ action: "leads:view-all", scopeType: "GLOBAL" }];
/** Tư vấn & CSKH cơ sở — có `leads:edit` nhưng KHÔNG có `leads:assign` (seed-roles.ts:621). */
const CSM_PERMS: Perms = [
  { action: "leads:view-own", scopeType: "GLOBAL" },
  { action: "leads:edit", scopeType: "GLOBAL" },
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

const actorOf = (userId: string, rows: UserOrgRoleRow[], grants?: { action: string; grant: "ALLOW" | "DENY" }[]): Actor =>
  buildActor({ userId, rows, orgNodes: ORG, now: new Date("2026-08-26"), grants });

/** QLCS **thuần** (không SUPER_ADMIN) giữ CS1 + CS2 — hai vùng khác nhau. */
const QLCS_HAI_CO_SO = () =>
  actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_MANAGER")]);

/** Người dùng như JWT trao cho action: `centerId` = cơ sở NEO lúc đăng nhập. */
const cmUser = { id: "u-cm", role: "CENTER_MANAGER", roles: ["CENTER_MANAGER"], centerId: "c1" };

function armUser(
  user: { id: string; role: string; roles?: string[]; centerId: string | null },
  actor: Actor,
) {
  h.auth.mockResolvedValue({ user });
  h.resolveActor.mockResolvedValue(actor);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.upsert.mockResolvedValue({});
  h.manualAssign.mockResolvedValue({ ok: true });
  h.autoAssignNew.mockResolvedValue({ ok: true });
  h.autoAssign.mockResolvedValue({ ok: true });
  armUser(cmUser, QLCS_HAI_CO_SO());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("[L-A6] setCenterAssignModeAction — QLCS đa cơ sở", () => {
  it("cơ sở NEO (c1) → CHO + ghi đúng cơ sở (không làm hỏng ca đang chạy)", async () => {
    await expect(setCenterAssignModeAction("c1", "CLOSE_RATE")).resolves.toEqual({ ok: true });
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.upsert.mock.calls[0][0].where).toEqual({ centerId: "c1" });
    expect(h.upsert.mock.calls[0][0].update).toEqual({ mode: "CLOSE_RATE" });
  });

  it("cơ sở THỨ HAI (c2) → CHO — đây là ca hôm nay TỪ CHỐI oan", async () => {
    await expect(setCenterAssignModeAction("c2", "MANUAL")).resolves.toEqual({ ok: true });
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.upsert.mock.calls[0][0].where).toEqual({ centerId: "c2" });
  });

  it("cơ sở NGOÀI phạm vi (c3) → TỪ CHỐI, KHÔNG ghi gì", async () => {
    const res = await setCenterAssignModeAction("c3", "MANUAL");
    expect(res.ok).toBe(false);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("cơ sở rỗng ('') → TỪ CHỐI (fail-closed, như hôm nay)", async () => {
    const res = await setCenterAssignModeAction("", "MANUAL");
    expect(res.ok).toBe(false);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("QLCS chỉ MỘT cơ sở → cơ sở khác vẫn TỪ CHỐI (cách ly giữ nguyên)", async () => {
    armUser(cmUser, actorOf("u-cm", [row("cs1", "CENTER_MANAGER")]));
    expect((await setCenterAssignModeAction("c2", "MANUAL")).ok).toBe(false);
    expect(h.upsert).not.toHaveBeenCalled();
    expect((await setCenterAssignModeAction("c1", "MANUAL")).ok).toBe(true);
  });

  it("cơ sở neo LỆCH (JWT c1, vai neo ở cs2) → CHO ở c2, TỪ CHỐI ở c1: nguồn sự thật là vai", async () => {
    armUser(cmUser, actorOf("u-cm", [row("cs2", "CENTER_MANAGER")]));
    expect((await setCenterAssignModeAction("c2", "MANUAL")).ok).toBe(true);
    expect((await setCenterAssignModeAction("c1", "MANUAL")).ok).toBe(false);
    expect(h.upsert).toHaveBeenCalledTimes(1);
  });

  it("QLCS neo tại VÙNG (REGION) → mọi cơ sở trong vùng, không hơn", async () => {
    armUser(cmUser, actorOf("u-cm", [row("rg-bac", "CENTER_MANAGER")]));
    expect((await setCenterAssignModeAction("c1", "MANUAL")).ok).toBe(true);
    expect((await setCenterAssignModeAction("c2", "MANUAL")).ok).toBe(false);
  });

  it("chế độ sai → chặn TRƯỚC khi ghi, kể cả ở cơ sở mình quản lý", async () => {
    await expect(setCenterAssignModeAction("c2", "TU_CHE")).resolves.toEqual({
      ok: false,
      error: "Chế độ không hợp lệ",
    });
    expect(h.upsert).not.toHaveBeenCalled();
  });
});

describe("[L-A6] kiêm nhiệm — vai KHÁC không nới cổng GHI cấu hình chia lead", () => {
  it("CA1: QLCS@CS1 kiêm KẾ TOÁN@CS2 → TỪ CHỐI c2 (ở đó chỉ là kế toán)", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    // Ghim: cách đo `visibleCenterIds` CHO QUA c2 → ca này không thể tự xanh.
    expect(actor.visibleCenterIds).toContain("c2");

    armUser(cmUser, actor);
    expect((await setCenterAssignModeAction("c2", "MANUAL")).ok).toBe(false);
    expect(h.upsert).not.toHaveBeenCalled();
    expect((await setCenterAssignModeAction("c1", "MANUAL")).ok).toBe(true);
  });

  it("CA2: QLCS@CS1 kiêm HO_SALE@HO → TỪ CHỐI mọi cơ sở ngoài CS1", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("ho", "HO_SALE", HO_SALE_PERMS),
    ]);
    // Ghim: vai neo ở HO ⇒ `isHoLevel` ⇒ vế `visibleCenterIds` = MỌI cơ sở, và
    // `leads:view-all` tại HO cho `centerScope: "ALL"` ⇒ vế `passesScope("Lead", …)`
    // cũng CHO QUA c3. Hai vế cũ AND lại vẫn không cắt gì.
    expect(actor.isHoLevel).toBe(true);
    expect(actor.visibleCenterIds).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));
    expect(passesScope("Lead", { centerId: "c3" }, actor)).toBe(true);

    armUser({ ...cmUser, roles: ["CENTER_MANAGER", "SALES_CSM"] }, actor);
    expect((await setCenterAssignModeAction("c2", "MANUAL")).ok).toBe(false);
    expect((await setCenterAssignModeAction("c3", "MANUAL")).ok).toBe(false);
    expect(h.upsert).not.toHaveBeenCalled();
    expect((await setCenterAssignModeAction("c1", "MANUAL")).ok).toBe(true);
  });

  it("QLCS 2 cơ sở + grant per-user `leads:assign` ALLOW → vẫn TỪ CHỐI cơ sở thứ ba", async () => {
    const actor = actorOf(
      "u-cm",
      [row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_MANAGER")],
      [{ action: "leads:assign", grant: "ALLOW" }],
    );
    // Ghim: grant khớp tiền tố `leads:` bật `hasAll` (lib/db-scope.ts:248-253) ⇒ một mình
    // `passesScope` CHO QUA c3. Grant per-user KHÔNG phải "được giao quản lý cơ sở".
    expect(passesScope("Lead", { centerId: "c3" }, actor)).toBe(true);

    armUser(cmUser, actor);
    expect((await setCenterAssignModeAction("c3", "MANUAL")).ok).toBe(false);
    expect(h.upsert).not.toHaveBeenCalled();
    expect((await setCenterAssignModeAction("c2", "MANUAL")).ok).toBe(true);
  });
});

describe("[L-A6] các vai KHÁC không rộng thêm một ly nào", () => {
  it("Tư vấn & CSKH cơ sở (không có leads:assign) → TỪ CHỐI cả cơ sở mình", async () => {
    const sale = { id: "u-sale", role: "SALES_CSM", roles: ["SALES_CSM"], centerId: "c1" };
    armUser(sale, actorOf("u-sale", [row("cs1", "CENTER_SALES_CSM", CSM_PERMS)]));
    await expect(setCenterAssignModeAction("c1", "MANUAL")).resolves.toEqual({
      ok: false,
      error: "Không có quyền",
    });
    expect((await setCenterAssignModeAction("c2", "MANUAL")).ok).toBe(false);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("GV → TỪ CHỐI (vai ngoài cổng, hành vi không đổi)", async () => {
    const gv = { id: "u-gv", role: "TEACHER", roles: ["TEACHER"], centerId: "c1" };
    armUser(gv, actorOf("u-gv", [row("cs1", "TEACHER", [])]));
    expect((await setCenterAssignModeAction("c1", "MANUAL")).ok).toBe(false);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("Kế toán cơ sở THUẦN (kiêm nhiệm không còn) → TỪ CHỐI", async () => {
    const kt = { id: "u-kt", role: "ACCOUNTANT", roles: ["ACCOUNTANT"], centerId: "c1" };
    armUser(kt, actorOf("u-kt", [row("cs1", "CENTER_ACCOUNTANT", KE_TOAN_PERMS)]));
    expect((await setCenterAssignModeAction("c1", "MANUAL")).ok).toBe(false);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("SUPER_ADMIN → CHO ở mọi cơ sở (hành vi không đổi)", async () => {
    const sa = { id: "u-sa", role: "SUPER_ADMIN", roles: ["SUPER_ADMIN"], centerId: null };
    armUser(sa, actorOf("u-sa", [row("ho", "SUPER_ADMIN", CM_PERMS)]));
    expect((await setCenterAssignModeAction("c3", "MANUAL")).ok).toBe(true);
    expect(h.upsert.mock.calls[0][0].where).toEqual({ centerId: "c3" });
  });

  it("chưa đăng nhập → TỪ CHỐI trước mọi thứ", async () => {
    h.auth.mockResolvedValue(null);
    await expect(setCenterAssignModeAction("c1", "MANUAL")).resolves.toEqual({
      ok: false,
      error: "Chưa đăng nhập",
    });
    expect(h.upsert).not.toHaveBeenCalled();
  });
});

// ── Parity với PROD: `RBAC_V2_ENABLED="true"` trên Vercel Production (CLAUDE.md) ──
// Local/CI mặc định chạy v1 (matrix tĩnh theo `session.user.roles`); bật cờ để cổng
// ngoài `checkPermission('leads:assign')` đi đường v2 động (actor) đúng như prod.
describe("[L-A6] parity prod — RBAC_V2_ENABLED=true", () => {
  beforeEach(() => {
    vi.stubEnv("RBAC_V2_ENABLED", "true");
  });

  it("QLCS 2 cơ sở: c2 CHO, c3 TỪ CHỐI (kết quả không đổi theo cờ)", async () => {
    expect((await setCenterAssignModeAction("c2", "MANUAL")).ok).toBe(true);
    expect((await setCenterAssignModeAction("c3", "MANUAL")).ok).toBe(false);
    expect(h.upsert).toHaveBeenCalledTimes(1);
  });

  it("vai không có `leads:assign` trong DB → TỪ CHỐI dù JWT ghi vai gì", async () => {
    armUser(
      { id: "u-sale", role: "CENTER_MANAGER", roles: ["CENTER_MANAGER"], centerId: "c1" },
      actorOf("u-sale", [row("cs1", "CENTER_SALES_CSM", CSM_PERMS)]),
    );
    await expect(setCenterAssignModeAction("c1", "MANUAL")).resolves.toEqual({
      ok: false,
      error: "Không có quyền",
    });
    expect(h.upsert).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [L-A6b] Cổng GHI "phân công lead" — TẬP CƠ SỞ mà action tính ra
//
// Ba action (`assignLeadToSaleAction` · `autoAssignLeadAction` ·
// `autoAssignNewLeadAction`) đều dựa vào một tập cơ sở truyền xuống lib để cắt IDOR ghi.
// Bản trước đo tập đó bằng `getModelVisibleCenterIds("Lead", actor)` — ĐÚNG dụng cụ mà
// `lib/auth/managed-centers.ts` gọi tên là "lỗ ngược chiều đang vá" cho cổng GHI:
//   · gom quyền theo TIỀN TỐ model (`leads:`) ⇒ một quyền CHỈ-ĐỌC của VAI KHÁC cũng làm
//     nó nở ra "ALL" (lib/db-scope.ts:236-241);
//   · một dòng `UserPermissionGrant` ALLOW khớp tiền tố bật thẳng `hasAll`
//     (lib/db-scope.ts:248-253).
// Trục đúng là `centerIdsGrantedByAction(actor, "leads:assign")`: khớp ĐÚNG chuỗi action,
// suy từ chính dòng `UserOrgRole` đẻ ra quyền.
//
// MỖI CA KHẲNG ĐỊNH TRƯỚC rằng phép đo CŨ cho "ALL" — để ca không thể tự xanh.
// ═══════════════════════════════════════════════════════════════════════════

/** Tập cơ sở mà action vừa truyền xuống `manualAssignLead` (tham số thứ 4). */
const scopeGivenToManual = () => h.manualAssign.mock.calls[0]?.[3];

describe("[L-A6b] assignLeadToSaleAction — tập cơ sở truyền xuống lib", () => {
  it("QLCS 2 cơ sở → đúng 2 cơ sở đó", async () => {
    await expect(assignLeadToSaleAction("l1", "sale-1")).resolves.toMatchObject({ ok: true });
    expect(h.manualAssign).toHaveBeenCalledTimes(1);
    expect(scopeGivenToManual()).toEqual(["c1", "c2"]);
  });

  it("CA THẬT: QLCS@CS1 kiêm HO_MARKETING@HO → CHỈ c1 (không phải mọi cơ sở)", async () => {
    // `lib/auth/legacy-role-map.ts` LUÔN neo MARKETING → `HO_MARKETING @ HO`, và L-A5 chỉ
    // cấm CENTER_MANAGER ở HO ⇒ cấu hình này HỢP LỆ. HO_MARKETING mang `leads:view-all`
    // GLOBAL tại HO ⇒ `PermEntry.centerScope = "ALL"`.
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("ho", "HO_MARKETING", HO_SALE_PERMS),
    ]);
    // Ghim: phép đo CŨ cho "ALL" ⇒ cả ba rào trong `manualAssignLead` tắt sạch.
    expect(getModelVisibleCenterIds("Lead", actor)).toBe("ALL");

    armUser({ ...cmUser, roles: ["CENTER_MANAGER", "MARKETING"] }, actor);
    await assignLeadToSaleAction("l1", "sale-cs2");
    expect(scopeGivenToManual()).toEqual(["c1"]);
  });

  it("CA THẬT: grant per-user ALLOW một quyền `leads:*` chỉ-đọc → KHÔNG nở ra ALL", async () => {
    const actor = actorOf(
      "u-cm",
      [row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_MANAGER")],
      [{ action: "leads:view-all", grant: "ALLOW" }],
    );
    // Ghim: grant khớp TIỀN TỐ `leads:` bật `hasAll` ⇒ phép đo cũ = "ALL".
    expect(getModelVisibleCenterIds("Lead", actor)).toBe("ALL");

    armUser(cmUser, actor);
    await assignLeadToSaleAction("l1", "sale-cs3");
    expect(scopeGivenToManual()).toEqual(["c1", "c2"]);
  });

  it("grant per-user ALLOW ĐÚNG `leads:assign` → hiệu lực trong tầm nhìn sẵn có, KHÔNG thành ALL", async () => {
    // Ranh giới của A-01-6d: grant không phải "được giao quản lý cơ sở".
    const actor = actorOf(
      "u-cm",
      [row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_MANAGER")],
      [{ action: "leads:assign", grant: "ALLOW" }],
    );
    armUser(cmUser, actor);
    await assignLeadToSaleAction("l1", "sale-cs3");
    const scope = scopeGivenToManual();
    expect(scope).not.toBe("ALL");
    expect(scope).toEqual(expect.arrayContaining(["c1", "c2"]));
    expect(scope).not.toContain("c3");
  });

  it("SUPER_ADMIN → 'ALL' (hành vi không đổi)", async () => {
    const sa = { id: "u-sa", role: "SUPER_ADMIN", roles: ["SUPER_ADMIN"], centerId: null };
    armUser(sa, actorOf("u-sa", [row("ho", "SUPER_ADMIN", CM_PERMS)]));
    await assignLeadToSaleAction("l1", "sale-1");
    expect(scopeGivenToManual()).toBe("ALL");
  });

  it("QLCS neo tại VÙNG (REGION) → mọi cơ sở trong vùng, không hơn", async () => {
    armUser(cmUser, actorOf("u-cm", [row("rg-bac", "CENTER_MANAGER")]));
    await assignLeadToSaleAction("l1", "sale-1");
    expect(scopeGivenToManual()).toEqual(["c1"]);
  });

  it("chưa đăng nhập → TỪ CHỐI trước khi chạm lib", async () => {
    h.auth.mockResolvedValue(null);
    await expect(assignLeadToSaleAction("l1", "sale-1")).resolves.toMatchObject({ ok: false });
    expect(h.manualAssign).not.toHaveBeenCalled();
  });
});

describe("[L-A6b] hai đường auto-chia đi CÙNG một tập cơ sở", () => {
  it("[F1] autoAssignLeadAction truyền tập cơ sở xuống `autoAssignLead`", async () => {
    // Cùng cổng quyền `leads:assign` không target với `assignLeadToSaleAction`, cùng sức
    // phá (kéo `Enrollment.saleId` + đóng kênh riêng DM_SALE_PARENT của sale cũ). Rào chỉ
    // bọc một trong hai thì kẻ bị chặn ở cửa trước đi cửa bên cạnh.
    await autoAssignLeadAction("l1");
    expect(h.autoAssign).toHaveBeenCalledTimes(1);
    expect(h.autoAssign.mock.calls[0]?.[2]).toEqual(["c1", "c2"]);
  });

  it("[F3] autoAssignNewLeadAction truyền tập cơ sở xuống `autoAssignNewLead`", async () => {
    await autoAssignNewLeadAction("l1");
    expect(h.autoAssignNew).toHaveBeenCalledTimes(1);
    expect(h.autoAssignNew.mock.calls[0]?.[2]).toEqual(["c1", "c2"]);
  });

  it("kiêm nhiệm HO không nới hai đường này (cùng phép đo với gán tay)", async () => {
    armUser(
      { ...cmUser, roles: ["CENTER_MANAGER", "MARKETING"] },
      actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("ho", "HO_MARKETING", HO_SALE_PERMS)]),
    );
    await autoAssignLeadAction("l1");
    await autoAssignNewLeadAction("l1");
    expect(h.autoAssign.mock.calls[0]?.[2]).toEqual(["c1"]);
    expect(h.autoAssignNew.mock.calls[0]?.[2]).toEqual(["c1"]);
  });
});

describe("[F2] `reassignLeadsFromAction` — endpoint đã GỠ", () => {
  it("không còn là Server Action nào cả", async () => {
    // Nó KHÔNG có call-site nào trong repo, nhưng `'use server'` vẫn phát hành nó thành
    // endpoint công khai: cổng duy nhất là `leads:assign` không target (GLOBAL với
    // CENTER_MANAGER), rồi gọi thẳng `reassignOpenLeads(userId)` — hàm không kiểm tầm nhìn
    // cơ sở của người bấm ở bất cứ đâu và chia lại TOÀN BỘ sổ lead đang mở của người bị
    // chỉ định, kèm `strandedPolicy: "UNASSIGN"`.
    expect(leadActions).not.toHaveProperty("reassignLeadsFromAction");
  });
});
