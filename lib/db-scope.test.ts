// A0-04 — scopedDb: inject/passesScope (THUẦN) + introspection chống miss model.
import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  injectScope,
  passesScope,
  SCOPED_MODELS,
  SCOPE_EXEMPT,
} from "@/lib/db-scope";
import { buildActor } from "@/lib/auth/actor";
import type { OrgUnitNode } from "@/lib/org/types";

const ORG: OrgUnitNode[] = [
  { id: "root", code: "SATAROBO", type: "ROOT", parentId: null, centerId: null },
  { id: "ho", code: "HO", type: "HO", parentId: "root", centerId: null },
  { id: "cs1", code: "CS1", type: "CENTER", parentId: "root", centerId: "c1" },
  { id: "cs2", code: "CS2", type: "CENTER", parentId: "root", centerId: "c2" },
];
const row = (orgUnitId: string, code: string) => ({
  orgUnitId, status: "ACTIVE", effectiveFrom: new Date("2000-01-01"), effectiveTo: null,
  role: { code, isActive: true, permissions: [] },
});
const make = (rows: ReturnType<typeof row>[]) => buildActor({ userId: "u1", rows, orgNodes: ORG });

const center = make([row("cs1", "CENTER_MANAGER")]); // visible [c1]
const ho = make([row("ho", "HO_ACCOUNTANT")]); // isHoLevel
const sa = make([row("ho", "SUPER_ADMIN")]); // isSuperAdmin
const noCenter = make([]); // visible []

describe("[A0-04] injectScope", () => {
  it("center user → thêm where centerId IN [visible]", () => {
    expect(injectScope("Lead", {}, center)).toEqual({ where: { centerId: { in: ["c1"] } } });
  });

  it("giữ where cũ qua AND", () => {
    expect(injectScope("Lead", { where: { status: "NEW" } }, center)).toEqual({
      where: { AND: [{ status: "NEW" }, { centerId: { in: ["c1"] } }] },
    });
  });

  it("[A0-04-T10-03] where rỗng cố lấy tất cả → vẫn bị AND scope", () => {
    const r = injectScope("Lead", { where: {} }, center) as { where: unknown };
    expect(r.where).toEqual({ AND: [{}, { centerId: { in: ["c1"] } }] });
  });

  it("SUPER_ADMIN / HO → không inject (cross-center)", () => {
    expect(injectScope("Lead", {}, sa)).toEqual({});
    expect(injectScope("Lead", {}, ho)).toEqual({});
  });

  it("[A0-04-T1-01] model không scope (RoleDef) → không inject (AC9)", () => {
    expect(injectScope("RoleDef", {}, center)).toEqual({});
  });

  it("[A0-04-T8-01] visibleCenterIds rỗng → centerId IN [] (list rỗng, không lộ)", () => {
    expect(injectScope("Lead", {}, noCenter)).toEqual({ where: { centerId: { in: [] } } });
  });
});

describe("[A0-04] passesScope (IDOR findUnique)", () => {
  it("center: record cùng center true, khác center false", () => {
    expect(passesScope("Lead", { centerId: "c1" }, center)).toBe(true);
    expect(passesScope("Lead", { centerId: "c2" }, center)).toBe(false);
  });
  it("[A0-04-T8-02] center: record centerId=null → false (an toàn)", () => {
    expect(passesScope("Lead", { centerId: null }, center)).toBe(false);
  });
  it("[A0-04-T8-03] HO: record centerId=null → true", () => {
    expect(passesScope("Lead", { centerId: null }, ho)).toBe(true);
  });
  it("SUPER_ADMIN: mọi record true", () => {
    expect(passesScope("Lead", { centerId: "c2" }, sa)).toBe(true);
  });
  it("model không scope → true", () => {
    expect(passesScope("RoleDef", { centerId: "c2" }, center)).toBe(true);
  });
  it("record null → false", () => {
    expect(passesScope("Lead", null, center)).toBe(false);
  });
});

describe("[A0-04-T12-01] introspection — mọi model có centerId đều được phân loại", () => {
  it("không model nào bị bỏ sót khỏi SCOPED_MODELS ∪ SCOPE_EXEMPT", () => {
    const withCenterId = Prisma.dmmf.datamodel.models
      .filter((m) => m.fields.some((f) => f.name === "centerId"))
      .map((m) => m.name);
    const categorized = new Set([...SCOPED_MODELS, ...SCOPE_EXEMPT]);
    const missed = withCenterId.filter((m) => !categorized.has(m));
    expect(missed).toEqual([]); // thêm model mới có centerId → phải đưa vào 1 trong 2 set
  });

  it("SCOPED_MODELS và SCOPE_EXEMPT rời nhau", () => {
    const overlap = [...SCOPED_MODELS].filter((m) => SCOPE_EXEMPT.has(m));
    expect(overlap).toEqual([]);
  });
});
