// A0-06 — mask PII + scope viewer (THUẦN). Pure, không DB.
import { describe, it, expect } from "vitest";
import { maskAuditValues, visibleOrgUnitIds } from "@/lib/audit/audit-log";
import { canReadLegacyAudit, canViewLegacyPii } from "@/lib/audit/legacy-log";
import { buildActor } from "@/lib/auth/actor";
import type { OrgUnitNode } from "@/lib/org/types";

const ORG: OrgUnitNode[] = [
  { id: "root", code: "SATAROBO", type: "ROOT", parentId: null, centerId: null },
  { id: "ho", code: "HO", type: "HO", parentId: "root", centerId: null },
  { id: "cs1", code: "CS1", type: "CENTER", parentId: "root", centerId: "c1" },
  { id: "cs2", code: "CS2", type: "CENTER", parentId: "root", centerId: "c2" },
];
// Vá 24/07: row nhận thêm list action để test scope theo QUYỀN audit (không theo isHoLevel).
const row = (orgUnitId: string, code: string, perms: string[] = []) => ({
  orgUnitId, status: "ACTIVE", effectiveFrom: new Date("2000-01-01"), effectiveTo: null,
  role: {
    code, isActive: true,
    permissions: perms.map((action) => ({ action, scopeType: "GLOBAL" as const })),
  },
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

describe("[A0-06 + vá 24/07] visibleOrgUnitIds (scope viewer theo QUYỀN audit)", () => {
  it("SUPER_ADMIN → ALL", () => {
    expect(visibleOrgUnitIds(buildActor({ userId: "u", rows: [row("ho", "SUPER_ADMIN")], orgNodes: ORG }))).toBe("ALL");
  });
  it("role HO CÓ quyền audit (centerScope ALL) → ALL", () => {
    expect(visibleOrgUnitIds(buildActor({ userId: "u", rows: [row("ho", "HO_AUDIT", ["audit-logs:view"])], orgNodes: ORG }))).toBe("ALL");
  });
  it("vá 24/07 — role HO KHÔNG có quyền audit (ca Toại: TRAINING@HO + CM@CS1) → chỉ org gắn quyền audit", () => {
    const toai = buildActor({
      userId: "u",
      rows: [
        row("ho", "TRAINING"),
        row("cs1", "CENTER_MANAGER", ["audit-logs:view", "audit-logs:view-pii"]),
      ],
      orgNodes: ORG,
    });
    expect(toai.isHoLevel).toBe(true); // vẫn HO-level nhưng hết được ALL audit
    expect(visibleOrgUnitIds(toai)).toEqual(["cs1"]); // hết thấy log CS2
  });
  it("CENTER role có quyền audit → chỉ org của mình (CM thuần không đổi)", () => {
    expect(visibleOrgUnitIds(buildActor({ userId: "u", rows: [row("cs1", "CENTER_MANAGER", ["audit-logs:view"])], orgNodes: ORG }))).toEqual(["cs1"]);
  });
  it("không có entry audit-logs: nào (vd vào viewer qua grant) → fallback org của role mình", () => {
    expect(visibleOrgUnitIds(buildActor({ userId: "u", rows: [row("cs1", "CENTER_MANAGER")], orgNodes: ORG }))).toEqual(["cs1"]);
  });
});

describe("[vá 24/07] legacy audit gate (all-or-nothing, bảng cũ không có orgUnitId)", () => {
  const sa = () => buildActor({ userId: "u", rows: [row("ho", "SUPER_ADMIN")], orgNodes: ORG });
  const hoAudit = () =>
    buildActor({ userId: "u", rows: [row("ho", "HO_AUDIT", ["audit-logs:view", "audit-logs:view-pii"])], orgNodes: ORG });
  const toai = () =>
    buildActor({
      userId: "u",
      rows: [
        row("ho", "TRAINING"),
        row("cs1", "CENTER_MANAGER", ["audit-logs:view", "audit-logs:view-pii"]),
      ],
      orgNodes: ORG,
    });
  const cm = () =>
    buildActor({ userId: "u", rows: [row("cs1", "CENTER_MANAGER", ["audit-logs:view", "audit-logs:view-pii"])], orgNodes: ORG });

  it("SUPER_ADMIN → đọc + unmask PII", () => {
    expect(canReadLegacyAudit(sa())).toBe(true);
    expect(canViewLegacyPii(sa())).toBe(true);
  });
  it("role HO có audit-logs:view/view-pii (ALL) → đọc + unmask PII", () => {
    expect(canReadLegacyAudit(hoAudit())).toBe(true);
    expect(canViewLegacyPii(hoAudit())).toBe(true);
  });
  it("ca Toại — quyền audit chỉ gắn CS1 → MẤT legacy viewer (dù isHoLevel)", () => {
    expect(toai().isHoLevel).toBe(true);
    expect(canReadLegacyAudit(toai())).toBe(false);
    expect(canViewLegacyPii(toai())).toBe(false);
  });
  it("CM thuần → không đọc legacy (không đổi so với trước)", () => {
    expect(canReadLegacyAudit(cm())).toBe(false);
    expect(canViewLegacyPii(cm())).toBe(false);
  });
});
