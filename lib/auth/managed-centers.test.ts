// @vitest-environment node
/**
 * A-01-6b · bất biến **L-A6** — "cơ sở người này đang QUẢN LÝ" phải suy từ CHÍNH vai đang
 * xét, không từ tầm nhìn ĐỌC gộp của mọi vai.
 *
 * Actor dựng bằng `buildActor` THẬT (không bịa literal) để test đo đúng thứ production đo:
 * `PermEntry.roleCode` + `PermEntry.centerScope` sinh từ cây OrgUnit + `UserOrgRole`.
 */
import { describe, expect, it } from "vitest";
import { buildActor } from "@/lib/auth/actor";
import { centerIdsManagedByRole, roleManagesCenter } from "@/lib/auth/managed-centers";
import type { UserOrgRoleRow } from "@/lib/auth/actor";
import type { OrgUnitNode } from "@/lib/org/types";

// Cây theo hình CHỐT 11/08/2026: HO → REGION → CENTER (lib/org/org-tree.ts).
const ORG: OrgUnitNode[] = [
  { id: "ho", code: "HO", type: "HO", parentId: null, centerId: null },
  { id: "rg-bac", code: "RG-BAC", type: "REGION", parentId: "ho", centerId: null },
  { id: "rg-nam", code: "RG-NAM", type: "REGION", parentId: "ho", centerId: null },
  { id: "cs1", code: "CS1", type: "CENTER", parentId: "rg-bac", centerId: "c1" },
  { id: "cs1b", code: "CS1B", type: "CENTER", parentId: "rg-bac", centerId: "c1b" },
  { id: "cs2", code: "CS2", type: "CENTER", parentId: "rg-nam", centerId: "c2" },
];

type Perms = UserOrgRoleRow["role"]["permissions"];
const CM_PERMS: Perms = [
  { action: "classes:view-all", scopeType: "GLOBAL" },
  { action: "students:view-all", scopeType: "GLOBAL" },
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

const actorOf = (rows: UserOrgRoleRow[]) =>
  buildActor({ userId: "u-1", rows, orgNodes: ORG, now: new Date("2026-08-26") });

describe("[L-A6] centerIdsManagedByRole", () => {
  it("vai neo tại CƠ SỞ → đúng cơ sở đó", () => {
    expect(centerIdsManagedByRole(actorOf([row("cs1", "CENTER_MANAGER")]), "CENTER_MANAGER")).toEqual(
      ["c1"],
    );
  });

  it("vai neo tại VÙNG → mọi cơ sở trong vùng (subtree), không hơn", () => {
    const scope = centerIdsManagedByRole(actorOf([row("rg-bac", "CENTER_MANAGER")]), "CENTER_MANAGER");
    expect(scope).toEqual(expect.arrayContaining(["c1", "c1b"]));
    expect(scope).not.toContain("c2");
  });

  it("KIÊM NHIỆM: cơ sở của vai KHÁC không lọt vào tập quản lý", () => {
    const actor = actorOf([row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_ACCOUNTANT")]);
    // Vế cũ (`visibleCenterIds`) gộp cả hai vai — đây chính là chỗ bản 25/08 rò.
    expect(actor.visibleCenterIds).toEqual(expect.arrayContaining(["c1", "c2"]));
    expect(centerIdsManagedByRole(actor, "CENTER_MANAGER")).toEqual(["c1"]);
    expect(centerIdsManagedByRole(actor, "CENTER_ACCOUNTANT")).toEqual(["c2"]);
  });

  it("vai kiêm nhiệm neo tại HO không kéo vai đang xét thành 'ALL'", () => {
    const actor = actorOf([row("cs1", "CENTER_MANAGER"), row("ho", "HO_MARKETING")]);
    expect(actor.isHoLevel).toBe(true);
    expect(centerIdsManagedByRole(actor, "CENTER_MANAGER")).toEqual(["c1"]);
    expect(centerIdsManagedByRole(actor, "HO_MARKETING")).toBe("ALL");
  });

  it("không giữ vai đó → tập rỗng (fail-closed)", () => {
    expect(centerIdsManagedByRole(actorOf([row("cs1", "TEACHER")]), "CENTER_MANAGER")).toEqual([]);
  });

  it("grant per-user KHÔNG cộng vào tập quản lý", () => {
    const actor = buildActor({
      userId: "u-1",
      rows: [row("cs1", "CENTER_MANAGER")],
      orgNodes: ORG,
      now: new Date("2026-08-26"),
      grants: [{ action: "classes:edit", grant: "ALLOW" }],
    });
    expect(centerIdsManagedByRole(actor, "CENTER_MANAGER")).toEqual(["c1"]);
  });
});

describe("[L-A6] roleManagesCenter", () => {
  const actor = actorOf([row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_ACCOUNTANT")]);

  it("cơ sở đang giữ vai → true", () => {
    expect(roleManagesCenter(actor, "CENTER_MANAGER", "c1")).toBe(true);
  });

  it("cơ sở chỉ ĐỌC được nhờ vai khác → false", () => {
    expect(roleManagesCenter(actor, "CENTER_MANAGER", "c2")).toBe(false);
  });

  it("centerId null/rỗng → false (fail-closed)", () => {
    expect(roleManagesCenter(actor, "CENTER_MANAGER", null)).toBe(false);
    expect(roleManagesCenter(actor, "CENTER_MANAGER", "")).toBe(false);
  });

  it("vai neo tại HO → 'ALL' ⇒ mọi cơ sở", () => {
    const ho = actorOf([row("ho", "HO_MARKETING")]);
    expect(roleManagesCenter(ho, "HO_MARKETING", "c2")).toBe(true);
  });
});
