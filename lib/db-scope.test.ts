// A0-04 — scopedDb: inject/passesScope (THUẦN) + introspection chống miss model.
import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  injectScope,
  injectSoftDelete,
  passesScope,
  SCOPED_MODELS,
  SCOPE_EXEMPT,
  SOFT_DELETE_MODELS,
} from "@/lib/db-scope";
import { buildActor } from "@/lib/auth/actor";
import type { OrgUnitNode } from "@/lib/org/types";

const ORG: OrgUnitNode[] = [
  { id: "root", code: "SATAROBO", type: "ROOT", parentId: null, centerId: null },
  { id: "ho", code: "HO", type: "HO", parentId: "root", centerId: null },
  { id: "cs1", code: "CS1", type: "CENTER", parentId: "root", centerId: "c1" },
  { id: "cs2", code: "CS2", type: "CENTER", parentId: "root", centerId: "c2" },
];
const row = (
  orgUnitId: string,
  code: string,
  permissions: { action: string; scopeType: "GLOBAL" | "CENTER" | "CLASS" | "OWN" | "CHILDREN" | "ASSIGNED" }[] = []
) => ({
  orgUnitId, status: "ACTIVE", effectiveFrom: new Date("2000-01-01"), effectiveTo: null,
  role: { code, isActive: true, permissions },
});
const make = (rows: ReturnType<typeof row>[]) => buildActor({ userId: "u1", rows, orgNodes: ORG });

const center = make([
  row("cs1", "CENTER_MANAGER", [
    { action: "leads:view-all", scopeType: "CENTER" },
    { action: "orders:view", scopeType: "CENTER" },
  ]),
]); // visible [c1]
const ho = make([
  row("ho", "HO_ACCOUNTANT", [
    { action: "payments:manage", scopeType: "CENTER" },
    { action: "leads:view-all", scopeType: "CENTER" },
    { action: "orders:view", scopeType: "CENTER" },
  ]),
]); // isHoLevel
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

describe("[FIX-C3] injectSoftDelete", () => {
  it("model tài chính, where rỗng → thêm deletedAt: null (ẩn row đã xóa)", () => {
    expect(injectSoftDelete("Order", {})).toEqual({ where: { deletedAt: null } });
    expect(injectSoftDelete("Payment", {})).toEqual({ where: { deletedAt: null } });
    expect(injectSoftDelete("Receipt", {})).toEqual({ where: { deletedAt: null } });
    expect(injectSoftDelete("Enrollment", {})).toEqual({ where: { deletedAt: null } });
  });

  it("giữ where cũ qua AND", () => {
    expect(injectSoftDelete("Order", { where: { status: "PAID" } })).toEqual({
      where: { AND: [{ status: "PAID" }, { deletedAt: null }] },
    });
  });

  it("call-site cố ý đọc trash (deletedAt đề cập) → KHÔNG override", () => {
    expect(injectSoftDelete("Order", { where: { deletedAt: { not: null } } })).toEqual({
      where: { deletedAt: { not: null } },
    });
    // include cả đã xóa
    expect(injectSoftDelete("Order", { where: { deletedAt: undefined } })).toEqual({
      where: { deletedAt: undefined },
    });
  });

  it("model không soft-delete → không đụng", () => {
    expect(injectSoftDelete("Lead", {})).toEqual({});
    expect(injectSoftDelete("Student", { where: { status: "ACTIVE" } })).toEqual({
      where: { status: "ACTIVE" },
    });
  });

  it("SOFT_DELETE_MODELS đúng 4 model tài chính", () => {
    expect([...SOFT_DELETE_MODELS].sort()).toEqual(
      ["Enrollment", "Order", "Payment", "Receipt"].sort(),
    );
  });
});

describe("[A0-04] passesScope (IDOR findUnique)", () => {
  it("center: record cùng center true, khác center false", () => {
    expect(passesScope("Lead", { centerId: "c1" }, center)).toBe(true);
    expect(passesScope("Lead", { centerId: "c2" }, center)).toBe(false);
  });
  it("[R7-00-AC4] Order/Lead chéo cơ sở → false (chặn IDOR sửa-theo-id)", () => {
    // CM@CS1 thao tác record CS2 bằng id → bị chặn ở tầng passesScope.
    expect(passesScope("Order", { centerId: "c2" }, center)).toBe(false);
    expect(passesScope("Order", { centerId: "c1" }, center)).toBe(true);
    expect(passesScope("Order", { centerId: "c2" }, sa)).toBe(true); // SUPER_ADMIN bypass
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

describe("[R7-08-AC6] makeup exception KHÔNG rò sang query khác", () => {
  it("whitelist chỉ gồm model lịch/lớp/bù — Class & MakeupNeed được nới", () => {
    expect(isMakeupExceptionModel("Class")).toBe(true);
    expect(isMakeupExceptionModel("MakeupNeed")).toBe(true);
    expect(isMakeupExceptionModel("ClassSession")).toBe(true);
    expect(isMakeupExceptionModel("Lesson")).toBe(true);
  });

  it("Lead/Order/Student/Payment KHÔNG nằm trong exception → vẫn cách ly cơ sở", () => {
    for (const m of ["Lead", "Order", "Student", "Payment"]) {
      expect(isMakeupExceptionModel(m)).toBe(false);
      // Vẫn là model scoped → injectScope phải ép centerId IN [visible].
      expect(SCOPED_MODELS.has(m)).toBe(true);
      expect(injectScope(m, {}, center)).toEqual({ where: { centerId: { in: ["c1"] } } });
    }
  });

  it("không vô tình whitelist model nhạy cảm (Lead/Order/Student/Payment)", () => {
    const sensitive = ["Lead", "Order", "Student", "Payment"];
    const leaked = sensitive.filter((m) => MAKEUP_EXCEPTION_MODELS.has(m));
    expect(leaked).toEqual([]);
  });
});
