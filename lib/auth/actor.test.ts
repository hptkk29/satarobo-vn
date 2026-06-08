// A0-03 — buildActor: visibleCenterIds (AC8) + lọc hiệu lực role (T7). Pure.
import { describe, it, expect } from "vitest";
import { buildActor, type UserOrgRoleRow } from "@/lib/auth/actor";
import type { OrgUnitNode } from "@/lib/org/types";

const ORG: OrgUnitNode[] = [
  { id: "root", code: "SATAROBO", type: "ROOT", parentId: null, centerId: null },
  { id: "ho", code: "HO", type: "HO", parentId: "root", centerId: null },
  { id: "cs1", code: "CS1", type: "CENTER", parentId: "root", centerId: "c1" },
  { id: "cs2", code: "CS2", type: "CENTER", parentId: "root", centerId: "c2" },
];
const NOW = new Date("2026-06-08");

function row(
  orgUnitId: string,
  code: string,
  opts: Partial<Pick<UserOrgRoleRow, "status" | "effectiveFrom" | "effectiveTo">> & {
    roleActive?: boolean;
  } = {},
): UserOrgRoleRow {
  return {
    orgUnitId,
    status: opts.status ?? "ACTIVE",
    effectiveFrom: opts.effectiveFrom ?? new Date("2000-01-01"),
    effectiveTo: opts.effectiveTo ?? null,
    role: { code, isActive: opts.roleActive ?? true, permissions: [] },
  };
}

const build = (rows: UserOrgRoleRow[]) =>
  buildActor({ userId: "u1", rows, orgNodes: ORG, now: NOW });

describe("[A0-03] buildActor.visibleCenterIds (AC8)", () => {
  it("[A0-03-T5-01] CENTER_MANAGER@CS1 → [c1]", () => {
    expect(build([row("cs1", "CENTER_MANAGER")]).visibleCenterIds).toEqual(["c1"]);
  });

  it("[A0-03-T5-02] HO_ACCOUNTANT@HO → tất cả center [c1,c2]", () => {
    expect(build([row("ho", "HO_ACCOUNTANT")]).visibleCenterIds.sort()).toEqual(["c1", "c2"]);
  });

  it("[A0-03-T5-03] multi-role HO+CS1 → tất cả center (HO trùm)", () => {
    const a = build([row("ho", "HO_HR"), row("cs1", "CENTER_MANAGER")]);
    expect(a.visibleCenterIds.sort()).toEqual(["c1", "c2"]);
  });
});

describe("[A0-03] buildActor — lọc hiệu lực (T7)", () => {
  it("[A0-03-T7-01] effectiveTo < now → không tính", () => {
    const a = build([row("cs1", "CENTER_MANAGER", { effectiveTo: new Date("2020-01-01") })]);
    expect(a.orgRoles).toHaveLength(0);
    expect(a.visibleCenterIds).toEqual([]);
  });

  it("[A0-03-T7-02] effectiveFrom > now (chưa tới) → không tính", () => {
    const a = build([row("cs1", "CENTER_MANAGER", { effectiveFrom: new Date("2099-01-01") })]);
    expect(a.orgRoles).toHaveLength(0);
  });

  it("[A0-03-T7-03] effectiveTo == now (biên) → còn tính", () => {
    const a = build([row("cs1", "CENTER_MANAGER", { effectiveTo: NOW })]);
    expect(a.orgRoles).toHaveLength(1);
  });

  it("[A0-03-T7-04] status SUSPENDED → không tính", () => {
    expect(build([row("cs1", "CENTER_MANAGER", { status: "SUSPENDED" })]).orgRoles).toHaveLength(0);
  });

  it("[A0-03-T7-05] RoleDef.isActive=false → không tính", () => {
    expect(build([row("cs1", "CENTER_MANAGER", { roleActive: false })]).orgRoles).toHaveLength(0);
  });

  it("isSuperAdmin chỉ khi SUPER_ADMIN tại HO/ROOT", () => {
    expect(build([row("ho", "SUPER_ADMIN")]).isSuperAdmin).toBe(true);
    expect(build([row("cs1", "SUPER_ADMIN")]).isSuperAdmin).toBe(false);
  });

  it("[A0-03-T8-03] grant ALLOW action ngoài registry → bỏ qua", () => {
    const a = buildActor({
      userId: "u1", rows: [], orgNodes: ORG, now: NOW,
      grants: [{ action: "evil:hack", grant: "ALLOW" }],
      validActions: new Set(["leads:view-all"]),
    });
    expect(a.grantsAllow.has("evil:hack")).toBe(false);
  });
});
