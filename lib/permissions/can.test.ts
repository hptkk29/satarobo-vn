// US-02 (TS-02 phần ROLE-grant) — engine can() hợp nhất · viết TRƯỚC hiện thực (luật #5).
//
// Hợp đồng đông cứng (thiết kế US-02 đã duyệt 09/08/2026):
// - resolveGrant(actor, key, target): PURE + SYNC, chỉ đọc bảng grant MỚI đã nạp sẵn
//   trên Actor (actor.permissionGrants) — TUYỆT ĐỐI không đọc UserPermissionGrant cũ
//   (test ghim [A0-03-T6-02] phải xanh nguyên trạng).
// - DENY (fieldMask rỗng) thắng ALLOW cùng key; DENY có fieldMask = DENY cấp trường
//   (không chặn action, chỉ góp mask). Grant ĐÃ nói về key thì nó là nguồn sự thật:
//   scope fail → false, KHÔNG rơi xuống đường cũ. Không grant nào khớp → fallback canV2.
// - SUPER_ADMIN bỏ qua grant (chống tự khoá admin bằng DENY nhầm).
import { describe, it, expect } from "vitest";
import type { Actor, Target } from "@/lib/auth/actor";
import { can as canV2 } from "@/lib/auth/can";
import {
  can,
  resolveGrant,
  getFieldMask,
  assertCan,
  type GrantRow,
} from "@/lib/permissions/can";

/** Actor tối giản — field mới của US-02 (roleIds/groupIds/permissionGrants/roleCenterScope) là optional additive. */
function makeActor(overrides: Partial<Actor> = {}): Actor {
  return {
    userId: "u1",
    isSuperAdmin: false,
    isHoLevel: false,
    orgRoles: [],
    permissions: [],
    visibleCenterIds: [],
    visibleOrgUnitIds: [],
    grantsAllow: new Set<string>(),
    assignedClassIds: new Set<string>(),
    ...overrides,
  };
}

const R1 = "roledef-1";

function grant(partial: Partial<GrantRow>): GrantRow {
  return {
    subjectType: "ROLE",
    subjectId: R1,
    permissionKey: "students:view-all",
    effect: "ALLOW",
    dataScope: "ALL",
    fieldMask: [],
    ...partial,
  };
}

describe("US-02 · DENY > ALLOW tường minh (ROLE grant)", () => {
  it("DENY fieldMask rỗng thắng ALLOW cùng key → chặn hẳn action", () => {
    const actor = makeActor({
      roleIds: [R1],
      permissionGrants: [
        grant({ effect: "ALLOW" }),
        grant({ effect: "DENY" }),
      ],
    });
    const d = resolveGrant(actor, "students:view-all");
    expect(d.hit).toBe(true);
    if (d.hit) expect(d.allowed).toBe(false);
    expect(can(actor, "students:view-all")).toBe(false);
    expect(() => assertCan(actor, "students:view-all")).toThrow();
  });

  it("DENY có fieldMask = DENY cấp trường: action vẫn ALLOW, trường bị che (TS-02)", () => {
    const actor = makeActor({
      roleIds: [R1],
      permissionGrants: [
        grant({ effect: "ALLOW" }),
        grant({ effect: "DENY", fieldMask: ["phone"] }),
      ],
    });
    expect(can(actor, "students:view-all")).toBe(true);
    expect(getFieldMask(actor, "students:view-all")).toEqual(["phone"]);
  });

  it("grant của role actor KHÔNG giữ (subjectId lạ) → không tính", () => {
    const actor = makeActor({
      roleIds: [R1],
      permissionGrants: [grant({ effect: "DENY", subjectId: "roledef-khac" })],
    });
    expect(resolveGrant(actor, "students:view-all").hit).toBe(false);
  });
});

describe("US-02 · grant là nguồn sự thật khi hit — scope fail KHÔNG fallback", () => {
  it("ALLOW UNIT_ONLY nhưng target lệch cơ sở → false, dù đường cũ (grantsAllow) cho phép", () => {
    const actor = makeActor({
      roleIds: [R1],
      roleCenterScope: { [R1]: ["c1"] },
      grantsAllow: new Set(["students:view-all"]), // đường cũ sẽ nói TRUE
      permissionGrants: [grant({ dataScope: "UNIT_ONLY" })],
    });
    const target: Target = { centerId: "c2" };
    expect(canV2(actor, "students:view-all", target)).toBe(true); // chứng minh lệch có chủ đích
    expect(can(actor, "students:view-all", target)).toBe(false);
  });
});

describe("US-02 · bảng chân trị 4 dataScope × {null, khớp, lệch} (AC3 — fallback centerId)", () => {
  const cases: Array<{
    scope: GrantRow["dataScope"];
    actor: () => Actor;
    nullExpect: boolean;
    match: { target: Target; expect: boolean };
    mismatch: { target: Target; expect: boolean };
  }> = [
    {
      scope: "ALL",
      actor: () => makeActor({ roleIds: [R1], permissionGrants: [grant({ dataScope: "ALL" })] }),
      nullExpect: true,
      match: { target: { centerId: "c1" }, expect: true },
      mismatch: { target: { centerId: "c9" }, expect: true },
    },
    {
      scope: "UNIT_AND_BELOW",
      actor: () =>
        makeActor({
          roleIds: [R1],
          visibleCenterIds: ["c1", "c2"],
          permissionGrants: [grant({ dataScope: "UNIT_AND_BELOW" })],
        }),
      nullExpect: false,
      match: { target: { centerId: "c2" }, expect: true },
      mismatch: { target: { centerId: "c3" }, expect: false },
    },
    {
      scope: "UNIT_ONLY",
      actor: () =>
        makeActor({
          roleIds: [R1],
          roleCenterScope: { [R1]: ["c1"] },
          permissionGrants: [grant({ dataScope: "UNIT_ONLY" })],
        }),
      nullExpect: false,
      match: { target: { centerId: "c1" }, expect: true },
      mismatch: { target: { centerId: "c2" }, expect: false },
    },
    {
      scope: "OWN",
      actor: () => makeActor({ roleIds: [R1], permissionGrants: [grant({ dataScope: "OWN" })] }),
      nullExpect: false,
      match: { target: { createdById: "u1" }, expect: true },
      mismatch: { target: { createdById: "u2" }, expect: false },
    },
  ];

  for (const c of cases) {
    it(`${c.scope}: null=${c.nullExpect} · khớp=${c.match.expect} · lệch=${c.mismatch.expect}`, () => {
      expect(can(c.actor(), "students:view-all")).toBe(c.nullExpect);
      expect(can(c.actor(), "students:view-all", c.match.target)).toBe(c.match.expect);
      expect(can(c.actor(), "students:view-all", c.mismatch.target)).toBe(c.mismatch.expect);
    });
  }
});

describe("US-02 · không grant khớp → fallback NGUYÊN TRẠNG canV2 (luật #2)", () => {
  it("bảng grant rỗng → kết quả HỆT canV2 (cả allow lẫn deny)", () => {
    const allowed = makeActor({ grantsAllow: new Set(["students:view-all"]) });
    const denied = makeActor();
    for (const [actor, target] of [
      [allowed, undefined],
      [allowed, { centerId: "c1" }],
      [denied, undefined],
      [denied, { centerId: "c1" }],
    ] as Array<[Actor, Target | undefined]>) {
      expect(can(actor, "students:view-all", target)).toBe(
        canV2(actor, "students:view-all", target),
      );
    }
  });

  it("grant về key KHÁC không ảnh hưởng key đang hỏi → fallback", () => {
    const actor = makeActor({
      roleIds: [R1],
      grantsAllow: new Set(["students:view-all"]),
      permissionGrants: [grant({ permissionKey: "leads:view-all", effect: "DENY" })],
    });
    expect(can(actor, "students:view-all")).toBe(true); // theo đường cũ
  });

  it("grant GROUP khi actor chưa có nhóm (groupIds rỗng/undefined) → miss → fallback", () => {
    const actor = makeActor({
      roleIds: [R1],
      permissionGrants: [grant({ subjectType: "GROUP", subjectId: "g1", effect: "DENY" })],
    });
    expect(resolveGrant(actor, "students:view-all").hit).toBe(false);
  });
});

describe("US-02 · SUPER_ADMIN bỏ qua grant + engine pure", () => {
  it("DENY trùm không khoá được SUPER_ADMIN", () => {
    const actor = makeActor({
      isSuperAdmin: true,
      roleIds: [R1],
      permissionGrants: [grant({ effect: "DENY" })],
    });
    expect(can(actor, "students:view-all")).toBe(true);
  });

  it("resolveGrant pure — gọi 2 lần cùng input cho cùng output", () => {
    const actor = makeActor({
      roleIds: [R1],
      permissionGrants: [grant({ effect: "ALLOW" }), grant({ effect: "DENY", fieldMask: ["phone"] })],
    });
    expect(resolveGrant(actor, "students:view-all")).toEqual(
      resolveGrant(actor, "students:view-all"),
    );
  });
});
