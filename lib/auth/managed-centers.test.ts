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
import {
  actionCoversCenter,
  centerIdsGrantedByAction,
  centerIdsManagedByRole,
  centerWhereManagedByRole,
  roleManagesCenter,
} from "@/lib/auth/managed-centers";
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

// ── A-01-6c (26/08) — vá lỗ NGƯỢC CHIỀU của các cổng LMS (bài tập / đề thi) ────────
// `classCenterVisible` ở assignments/exams đo bằng `passesScope("Class", …)` MỘT MÌNH,
// mà phép đo đó gom theo TIỀN TỐ action (`classes:`/`class_group:`) nên nở theo vai kiêm
// nhiệm, và còn bật `hasAll` khi gặp một dòng `UserPermissionGrant` ALLOW khớp tiền tố
// (`lib/db-scope.ts:248-253`). `centerIdsGrantedByAction` là phép đo KHÔNG nở: khớp ĐÚNG
// chuỗi action, chỉ đọc `PermEntry` (tức đúng dòng `UserOrgRole`), không đọc `grantsAllow`.
const TRAINING_PERMS: Perms = [
  { action: "training:manage", scopeType: "GLOBAL" },
  { action: "assignments:create", scopeType: "GLOBAL" },
  { action: "assignments:grade", scopeType: "GLOBAL" },
  { action: "exams:edit", scopeType: "GLOBAL" },
];
/** Kế toán cơ sở: `classes:view-all` + `students:view-all`, KHÔNG có action LMS nào. */
const KE_TOAN_PERMS: Perms = [
  { action: "payments:manage", scopeType: "GLOBAL" },
  { action: "students:view-all", scopeType: "GLOBAL" },
  { action: "classes:view-all", scopeType: "GLOBAL" },
];

describe("[L-A6] centerIdsGrantedByAction", () => {
  it("khớp ĐÚNG chuỗi action, không theo tiền tố", () => {
    const actor = actorOf([row("cs1", "TRAINING", TRAINING_PERMS)]);
    expect(centerIdsGrantedByAction(actor, "assignments:create")).toEqual(["c1"]);
    // `assignments:delete` KHÔNG có trong vai này → rỗng, dù cùng tiền tố `assignments:`.
    expect(centerIdsGrantedByAction(actor, "assignments:delete")).toEqual([]);
  });

  it("cùng một action ở NHIỀU đơn vị neo → hợp lại", () => {
    const actor = actorOf([
      row("cs1", "TRAINING", TRAINING_PERMS),
      row("cs2", "TRAINING", TRAINING_PERMS),
    ]);
    expect(centerIdsGrantedByAction(actor, "exams:edit")).toEqual(
      expect.arrayContaining(["c1", "c2"]),
    );
    expect(centerIdsGrantedByAction(actor, "exams:edit")).not.toContain("c1b");
  });

  it("KIÊM NHIỆM: vai khác (kế toán) không kéo cơ sở của nó vào quyền LMS", () => {
    const actor = actorOf([
      row("cs1", "TRAINING", TRAINING_PERMS),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    expect(actor.visibleCenterIds).toEqual(expect.arrayContaining(["c1", "c2"]));
    expect(centerIdsGrantedByAction(actor, "assignments:create")).toEqual(["c1"]);
  });

  it("vai neo tại HO → 'ALL' (Đào tạo toàn LMS — hành vi không đổi)", () => {
    expect(centerIdsGrantedByAction(actorOf([row("ho", "TRAINING", TRAINING_PERMS)]), "exams:edit")).toBe(
      "ALL",
    );
  });

  it("grant per-user KHÔNG cộng vào tập cơ sở của action", () => {
    const actor = buildActor({
      userId: "u-1",
      rows: [row("cs1", "TRAINING", TRAINING_PERMS)],
      orgNodes: ORG,
      now: new Date("2026-08-26"),
      grants: [{ action: "classes:edit", grant: "ALLOW" }],
    });
    expect(centerIdsGrantedByAction(actor, "assignments:create")).toEqual(["c1"]);
  });
});

describe("[L-A6] actionCoversCenter", () => {
  const actor = actorOf([
    row("cs1", "TRAINING", TRAINING_PERMS),
    row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
  ]);

  it("cơ sở đang giữ chính quyền đó → true", () => {
    expect(actionCoversCenter(actor, "assignments:create", "c1")).toBe(true);
  });

  it("cơ sở chỉ ĐỌC được nhờ vai khác → false", () => {
    expect(actionCoversCenter(actor, "assignments:create", "c2")).toBe(false);
  });

  it("centerId null/rỗng → false (fail-closed)", () => {
    expect(actionCoversCenter(actor, "assignments:create", null)).toBe(false);
    expect(actionCoversCenter(actor, "assignments:create", "")).toBe(false);
  });
});

// ── A-01-6d (26/08) — GRANT PER-USER phải có hiệu lực trong tầm nhìn cơ sở của chính
// người được cấp. `checkPermission`/`can()` cho ALLOW ngay khi `grantsAllow` có action
// (lib/auth/can.ts:54); nếu phép đo CƠ SỞ bỏ qua `grantsAllow` thì cổng thô CHO còn cổng
// cơ sở trả RỖNG ⇒ quyền cấp riêng vô hiệu hoàn toàn, lỗi lại hiện ra là "không tìm thấy".
// Ranh giới giữ nguyên: grant KHÔNG bao giờ nở thành "ALL".
describe("[L-A6] centerIdsGrantedByAction — grant per-user", () => {
  const withGrant = (rows: UserOrgRoleRow[], action: string) =>
    buildActor({
      userId: "u-1",
      rows,
      orgNodes: ORG,
      now: new Date("2026-08-26"),
      grants: [{ action, grant: "ALLOW" }],
    });

  it("grant ĐÚNG action → có hiệu lực tại các cơ sở actor nhìn thấy", () => {
    // GV cơ sở CS1: không vai nào mang `exams:edit`, chỉ có grant per-user.
    const actor = withGrant([row("cs1", "TEACHER", [{ action: "classes:view-own", scopeType: "GLOBAL" }])], "exams:edit");
    expect(actor.visibleCenterIds).toEqual(["c1"]);
    expect(centerIdsGrantedByAction(actor, "exams:edit")).toEqual(["c1"]);
    expect(actionCoversCenter(actor, "exams:edit", "c1")).toBe(true);
  });

  it("grant KHÔNG nở thành 'ALL': cơ sở ngoài tầm nhìn vẫn TỪ CHỐI", () => {
    const actor = withGrant([row("cs1", "TEACHER", [{ action: "classes:view-own", scopeType: "GLOBAL" }])], "exams:edit");
    expect(centerIdsGrantedByAction(actor, "exams:edit")).not.toBe("ALL");
    expect(actionCoversCenter(actor, "exams:edit", "c2")).toBe(false);
    expect(actionCoversCenter(actor, "exams:edit", null)).toBe(false);
  });

  it("grant cho action KHÁC không đụng tới action đang xét", () => {
    const actor = withGrant([row("cs1", "TRAINING", TRAINING_PERMS)], "classes:edit");
    expect(centerIdsGrantedByAction(actor, "assignments:create")).toEqual(["c1"]);
    expect(centerIdsGrantedByAction(actor, "assignments:delete")).toEqual([]);
  });

  it("grant KHÔNG cộng vào tập QUẢN LÝ theo vai (trục roleCode giữ nguyên)", () => {
    const actor = withGrant([row("cs1", "CENTER_MANAGER")], "classes:edit");
    expect(centerIdsManagedByRole(actor, "CENTER_MANAGER")).toEqual(["c1"]);
    expect(roleManagesCenter(actor, "CENTER_MANAGER", "c2")).toBe(false);
  });
});

// ── A-01-6d (26/08) — DANH SÁCH phải đo cùng thước với CỔNG GHI. Ba màn duyệt
// (/admin/don-tu, /admin/teachers, /admin/cham-cong/chinh-cong) trước đây lọc bằng
// `session.user.centerId` (một cơ sở neo trong JWT) trong khi action đã đo bằng
// `roleManagesCenter` ⇒ hồ sơ/đơn của cơ sở thứ hai không bao giờ hiện ra.
describe("[L-A6] centerWhereManagedByRole", () => {
  it("vai neo tại cơ sở → điều kiện `centerId IN (…)` đúng tập đang quản lý", () => {
    const actor = actorOf([row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_MANAGER")]);
    const where = centerWhereManagedByRole(actor, "CENTER_MANAGER");
    expect(where.centerId?.in).toEqual(expect.arrayContaining(["c1", "c2"]));
    expect(where.centerId?.in).not.toContain("c1b");
  });

  it("KIÊM NHIỆM: cơ sở của vai khác KHÔNG lọt vào danh sách", () => {
    const actor = actorOf([row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_ACCOUNTANT")]);
    expect(centerWhereManagedByRole(actor, "CENTER_MANAGER").centerId?.in).toEqual(["c1"]);
  });

  it("vai neo tại HO ⇒ 'ALL' → KHÔNG thêm điều kiện nào", () => {
    const actor = actorOf([row("ho", "HO_MARKETING")]);
    expect(centerWhereManagedByRole(actor, "HO_MARKETING")).toEqual({});
  });

  it("không giữ vai đó → `IN []` (không dòng nào), KHÔNG phải 'bỏ lọc'", () => {
    const actor = actorOf([row("cs1", "TEACHER")]);
    expect(centerWhereManagedByRole(actor, "CENTER_MANAGER")).toEqual({ centerId: { in: [] } });
  });
});
