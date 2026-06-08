// A0-06 — mask PII + scope viewer (THUẦN). Pure, không DB.
import { describe, it, expect } from "vitest";
import { maskAuditValues, visibleOrgUnitIds } from "@/lib/audit/audit-log";
import { buildActor } from "@/lib/auth/actor";
import type { OrgUnitNode } from "@/lib/org/types";

const ORG: OrgUnitNode[] = [
  { id: "root", code: "SATAROBO", type: "ROOT", parentId: null, centerId: null },
  { id: "ho", code: "HO", type: "HO", parentId: "root", centerId: null },
  { id: "cs1", code: "CS1", type: "CENTER", parentId: "root", centerId: "c1" },
];
const row = (orgUnitId: string, code: string) => ({
  orgUnitId, status: "ACTIVE", effectiveFrom: new Date("2000-01-01"), effectiveTo: null,
  role: { code, isActive: true, permissions: [] },
});

describe("[A0-06] maskAuditValues (AC6)", () => {
  const data = { parentName: "Nguyen Van A", phone: "0901234567", email: "a@x.com", note: "ok" };

  it("không có pii:view → mask SĐT/email, giữ field khác", () => {
    const m = maskAuditValues(data, false)!;
    expect(m.parentName).toBe("Nguyen Van A");
    expect(m.note).toBe("ok");
    expect(m.phone).toBe("09***67");
    expect(m.email).toBe("a***@x.com");
  });

  it("có pii:view → giữ nguyên", () => {
    expect(maskAuditValues(data, true)).toEqual(data);
  });

  it("null → null", () => {
    expect(maskAuditValues(null, false)).toBeNull();
  });
});

describe("[A0-06] visibleOrgUnitIds (scope viewer)", () => {
  it("SUPER_ADMIN/HO → ALL", () => {
    expect(visibleOrgUnitIds(buildActor({ userId: "u", rows: [row("ho", "SUPER_ADMIN")], orgNodes: ORG }))).toBe("ALL");
    expect(visibleOrgUnitIds(buildActor({ userId: "u", rows: [row("ho", "HO_HR")], orgNodes: ORG }))).toBe("ALL");
  });
  it("CENTER role → chỉ org của mình", () => {
    expect(visibleOrgUnitIds(buildActor({ userId: "u", rows: [row("cs1", "CENTER_MANAGER")], orgNodes: ORG }))).toEqual(["cs1"]);
  });
});
