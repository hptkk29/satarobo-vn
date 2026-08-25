// @vitest-environment node
/**
 * A-01-6 · bất biến **L-A6** — cổng GHI phải chấp nhận MỌI cơ sở trong tầm nhìn của
 * actor, không so với MỘT cơ sở neo.
 *
 * Vì sao file này tồn tại: `canAssessStudent` ở đây đọc bằng `db` TRẦN (`skill-access.ts:2`),
 * tức KHÔNG có `scopedDb` đứng trước để lọc giúp. Cách ly cơ sở của đường này nằm trọn
 * trong chính điều kiện của cổng — nếu điều kiện đó so `student.centerId === user.centerId`
 * thì QLCS giữ 2 cơ sở chấm được năng lực ở cơ sở neo và **câm lặng** ở cơ sở kia.
 *
 * Ba ca bắt buộc (yêu cầu A-01-6 §2):
 *   1. cơ sở thứ HAI của chính QLCS đó  → CHO
 *   2. cơ sở NGOÀI phạm vi (thứ ba)     → TỪ CHỐI
 *   3. vai khác (TEACHER/SALES_CSM)     → KHÔNG rộng thêm một ly nào
 *
 * Actor dựng bằng `buildActor` THẬT (không bịa literal) để test đo đúng thứ production
 * đo: `visibleCenterIds` + `PermEntry.centerScope` sinh từ cây OrgUnit + `UserOrgRole`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgUnitNode } from "@/lib/org/types";
import type { Actor, UserOrgRoleRow } from "@/lib/auth/actor";

const h = vi.hoisted(() => ({
  studentFindUnique: vi.fn(),
  enrollmentFindFirst: vi.fn(),
  resolveActor: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    student: { findUnique: h.studentFindUnique },
    enrollment: { findFirst: h.enrollmentFindFirst },
  },
}));

// Giữ `buildActor` THẬT, chỉ thay đường nạp actor từ DB.
vi.mock("@/lib/auth/actor", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/actor")>();
  return { ...actual, resolveActor: h.resolveActor };
});

import { buildActor } from "@/lib/auth/actor";
import { canAssessStudent } from "./skill-access";

// Cây theo hình CHỐT 11/08/2026: HO → REGION → CENTER (xem lib/org/org-tree.ts).
// Hai cơ sở của QLCS nằm ở HAI VÙNG khác nhau — đúng fixture mà L-A13 đòi.
const ORG: OrgUnitNode[] = [
  { id: "ho", code: "HO", type: "HO", parentId: null, centerId: null },
  { id: "rg-bac", code: "RG-BAC", type: "REGION", parentId: "ho", centerId: null },
  { id: "rg-nam", code: "RG-NAM", type: "REGION", parentId: "ho", centerId: null },
  { id: "rg-trung", code: "RG-TRUNG", type: "REGION", parentId: "ho", centerId: null },
  { id: "cs1", code: "CS1", type: "CENTER", parentId: "rg-bac", centerId: "c1" },
  { id: "cs2", code: "CS2", type: "CENTER", parentId: "rg-nam", centerId: "c2" },
  { id: "cs3", code: "CS3", type: "CENTER", parentId: "rg-trung", centerId: "c3" },
];

// Bộ quyền tối thiểu để `getModelVisibleCenterIds("Student", …)` bám prefix `students:`
// (lib/db-scope.ts:149-154) thay vì rơi về fallback `isHoLevel ? ALL : visibleCenterIds`.
type Perms = UserOrgRoleRow["role"]["permissions"];
const CM_PERMS: Perms = [
  { action: "students:view-all", scopeType: "GLOBAL" },
  { action: "students:edit", scopeType: "GLOBAL" },
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

const actorOf = (rows: UserOrgRoleRow[]): Actor =>
  buildActor({ userId: "u-cm", rows, orgNodes: ORG, now: new Date("2026-08-25") });

/** QLCS **thuần** (không SUPER_ADMIN) giữ CS1 + CS2 — hai vùng khác nhau. */
const QLCS_HAI_CO_SO = () =>
  actorOf([row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_MANAGER")]);

beforeEach(() => {
  vi.clearAllMocks();
  h.enrollmentFindFirst.mockResolvedValue(null);
});

/** Người dùng QLCS thuần; `centerId` = cơ sở NEO (ảnh chụp lúc đăng nhập). */
const cm = (centerId: string | null) => ({
  id: "u-cm",
  role: "CENTER_MANAGER",
  roles: ["CENTER_MANAGER"],
  centerId,
});

describe("[L-A6] canAssessStudent — QLCS đa cơ sở", () => {
  it("cơ sở NEO (c1) → CHO (không được làm hỏng ca đang chạy)", async () => {
    h.studentFindUnique.mockResolvedValue({ centerId: "c1" });
    h.resolveActor.mockResolvedValue(QLCS_HAI_CO_SO());
    await expect(canAssessStudent(cm("c1"), "s-1")).resolves.toBe(true);
  });

  it("cơ sở THỨ HAI (c2) → CHO — đây là ca hôm nay đang TỪ CHỐI oan", async () => {
    h.studentFindUnique.mockResolvedValue({ centerId: "c2" });
    h.resolveActor.mockResolvedValue(QLCS_HAI_CO_SO());
    await expect(canAssessStudent(cm("c1"), "s-2")).resolves.toBe(true);
  });

  it("cơ sở NGOÀI phạm vi (c3) → TỪ CHỐI", async () => {
    h.studentFindUnique.mockResolvedValue({ centerId: "c3" });
    h.resolveActor.mockResolvedValue(QLCS_HAI_CO_SO());
    await expect(canAssessStudent(cm("c1"), "s-3")).resolves.toBe(false);
  });

  it("cơ sở neo LỆCH (JWT c1, vai neo ở c2) → vẫn CHO ở c2: nguồn sự thật là vai, không phải ảnh chụp", async () => {
    h.studentFindUnique.mockResolvedValue({ centerId: "c2" });
    h.resolveActor.mockResolvedValue(actorOf([row("cs2", "CENTER_MANAGER")]));
    await expect(canAssessStudent(cm("c1"), "s-2")).resolves.toBe(true);
  });

  it("học viên chưa gắn cơ sở (centerId null) → TỪ CHỐI (fail-closed, như hôm nay)", async () => {
    h.studentFindUnique.mockResolvedValue({ centerId: null });
    h.resolveActor.mockResolvedValue(QLCS_HAI_CO_SO());
    await expect(canAssessStudent(cm("c1"), "s-0")).resolves.toBe(false);
  });

  it("học viên không tồn tại → TỪ CHỐI, không hỏi actor", async () => {
    h.studentFindUnique.mockResolvedValue(null);
    await expect(canAssessStudent(cm("c1"), "s-x")).resolves.toBe(false);
  });
});

describe("[L-A6] các vai KHÁC không rộng thêm một ly nào", () => {
  it("GV dạy lớp của HS → CHO (nhánh TEACHER giữ nguyên)", async () => {
    h.studentFindUnique.mockResolvedValue({ centerId: "c1" });
    h.enrollmentFindFirst.mockResolvedValue({ id: "e-1" });
    h.resolveActor.mockResolvedValue(
      actorOf([row("cs1", "TEACHER", [{ action: "students:view-all", scopeType: "GLOBAL" }])]),
    );
    const gv = { id: "u-gv", role: "TEACHER", roles: ["TEACHER"], centerId: "c1" };
    await expect(canAssessStudent(gv, "s-1")).resolves.toBe(true);
  });

  it("GV KHÔNG dạy lớp của HS, dù HS CÙNG cơ sở → TỪ CHỐI (không được hưởng tầm nhìn cơ sở)", async () => {
    h.studentFindUnique.mockResolvedValue({ centerId: "c1" });
    h.enrollmentFindFirst.mockResolvedValue(null);
    h.resolveActor.mockResolvedValue(
      actorOf([row("cs1", "TEACHER", [{ action: "students:view-all", scopeType: "GLOBAL" }])]),
    );
    const gv = { id: "u-gv", role: "TEACHER", roles: ["TEACHER"], centerId: "c1" };
    await expect(canAssessStudent(gv, "s-1")).resolves.toBe(false);
  });

  it("SALES_CSM cùng cơ sở với HS → TỪ CHỐI (vai ngoài 3 nhánh)", async () => {
    h.studentFindUnique.mockResolvedValue({ centerId: "c1" });
    h.resolveActor.mockResolvedValue(
      actorOf([row("cs1", "CENTER_SALES_CSM", [{ action: "students:view-all", scopeType: "GLOBAL" }])]),
    );
    const sale = { id: "u-sale", role: "SALES_CSM", roles: ["SALES_CSM"], centerId: "c1" };
    await expect(canAssessStudent(sale, "s-1")).resolves.toBe(false);
  });

  it("SUPER_ADMIN → CHO ở mọi cơ sở, không đọc DB (hành vi không đổi)", async () => {
    const sa = { id: "u-sa", role: "SUPER_ADMIN", roles: ["SUPER_ADMIN"], centerId: null };
    await expect(canAssessStudent(sa, "s-3")).resolves.toBe(true);
    expect(h.studentFindUnique).not.toHaveBeenCalled();
  });
});

describe("[L-A6] QLCS chỉ MỘT cơ sở — cách ly giữ nguyên", () => {
  it("QLCS@CS1 chấm HS c2 → TỪ CHỐI", async () => {
    h.studentFindUnique.mockResolvedValue({ centerId: "c2" });
    h.resolveActor.mockResolvedValue(actorOf([row("cs1", "CENTER_MANAGER")]));
    await expect(canAssessStudent(cm("c1"), "s-2")).resolves.toBe(false);
  });
});

// ── A-01-6b (26/08) — KIÊM NHIỆM: quyền ĐỌC của vai khác không được mở cổng chấm ────
// Đường này KHÔNG có `scopedDb` phía sau, nên điều kiện của cổng là lớp cách ly DUY NHẤT.
// Bản 25/08 (`visibleCenterIds` AND `passesScope`) để lọt cả hai ca dưới đây.

/** Kế toán cơ sở mang `students:view-all` (prisma/seed-roles.ts). */
const KE_TOAN_PERMS: Perms = [
  { action: "payments:manage", scopeType: "GLOBAL" },
  { action: "students:view-all", scopeType: "GLOBAL" },
];
/** HO_MARKETING mang `students:view-all` GLOBAL tại HO (seed-roles.ts). */
const MARKETING_PERMS: Perms = [
  { action: "news:publish", scopeType: "GLOBAL" },
  { action: "students:view-all", scopeType: "GLOBAL" },
];

describe("[L-A6] kiêm nhiệm — vai KHÁC không nới cổng chấm năng lực", () => {
  it("CA1: QLCS@CS1 kiêm KẾ TOÁN@CS2 → HS ở CS2 TỪ CHỐI (ở đó chỉ là kế toán)", async () => {
    const actor = actorOf([
      row("cs1", "CENTER_MANAGER"),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    // Ghim rằng ca này không tự xanh: vế cũ (đọc được CS2) VẪN cho qua.
    expect(actor.visibleCenterIds).toContain("c2");

    h.studentFindUnique.mockResolvedValue({ centerId: "c2" });
    h.resolveActor.mockResolvedValue(actor);
    await expect(canAssessStudent(cm("c1"), "s-2")).resolves.toBe(false);
  });

  it("CA2: QLCS@CS1 kiêm MARKETING (⇒ HO_MARKETING@HO) → HS ngoài CS1 TỪ CHỐI", async () => {
    const actor = actorOf([
      row("cs1", "CENTER_MANAGER"),
      row("ho", "HO_MARKETING", MARKETING_PERMS),
    ]);
    expect(actor.isHoLevel).toBe(true);
    expect(actor.visibleCenterIds).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));

    h.resolveActor.mockResolvedValue(actor);
    h.studentFindUnique.mockResolvedValue({ centerId: "c3" });
    await expect(canAssessStudent(cm("c1"), "s-3")).resolves.toBe(false);
    h.studentFindUnique.mockResolvedValue({ centerId: "c1" });
    await expect(canAssessStudent(cm("c1"), "s-1")).resolves.toBe(true);
  });
});
