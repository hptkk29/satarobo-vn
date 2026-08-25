// @vitest-environment node
/**
 * A-01-6 · bất biến **L-A6** — cổng GHI "chấm năng lực học viên" phải chấp nhận MỌI cơ sở
 * trong tầm nhìn của actor, không so với MỘT cơ sở neo (`session.user.centerId`).
 *
 * Gate `canAssessStudent` KHÔNG được export (mọi export của file `"use server"` là một
 * HTTP endpoint — xem chú thích đầu `_feedback-core.ts`), nên test đi qua chính Server
 * Action `saveStudentSkills`. Điều đó cũng đúng hơn: thứ cần chứng minh là **có ghi
 * được hay không**, chứ không phải giá trị boolean trung gian.
 *
 * Ba ca bắt buộc (yêu cầu A-01-6 §2):
 *   1. cơ sở thứ HAI của chính QLCS đó  → CHO
 *   2. cơ sở NGOÀI phạm vi (thứ ba)     → TỪ CHỐI
 *   3. vai khác (TEACHER/SALES_CSM)     → KHÔNG rộng thêm một ly nào
 *
 * ⚠️ `scopedDb` bị thay bằng client giả **không lọc gì**: mọi kết quả dưới đây là do
 * chính cổng quyền quyết định, không phải do `scopedDb` chặn hộ (luật cứng #3 — cổng
 * GHI phải tự kiểm, `scopedDb` chỉ che đường ĐỌC).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgUnitNode } from "@/lib/org/types";
import type { Actor, UserOrgRoleRow } from "@/lib/auth/actor";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  fresh: vi.fn(),
  resolveActor: vi.fn(),
  studentFindUnique: vi.fn(),
  enrollmentFindFirst: vi.fn(),
  createMany: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
// 26/08 — cổng đọc vai TỪ DB (không từ JWT), giống `canManageSessionClass`.
vi.mock("@/lib/auth/fresh-gate-user", () => ({ getFreshGateUser: h.fresh }));
vi.mock("@/lib/auth/actor", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/actor")>();
  return { ...actual, resolveActor: h.resolveActor };
});
vi.mock("@/lib/db-scope", async (orig) => {
  const actual = await orig<typeof import("@/lib/db-scope")>();
  return {
    ...actual,
    scopedDb: () => ({
      student: { findUnique: h.studentFindUnique },
      enrollment: { findFirst: h.enrollmentFindFirst },
      studentSkillAssessment: { createMany: h.createMany },
    }),
  };
});

import { buildActor } from "@/lib/auth/actor";
import { saveStudentSkills } from "./_actions";

// Cây theo hình CHỐT 11/08/2026: HO → REGION → CENTER (lib/org/org-tree.ts).
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
// Bám prefix `students:` (lib/db-scope.ts:149-154) để đi đường permission thật.
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

const actorOf = (userId: string, rows: UserOrgRoleRow[]): Actor =>
  buildActor({ userId, rows, orgNodes: ORG, now: new Date("2026-08-25") });

/** QLCS **thuần** (không SUPER_ADMIN) giữ CS1 + CS2 — hai vùng khác nhau (L-A13). */
const QLCS_HAI_CO_SO = () =>
  actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_MANAGER")]);

const INPUT = (studentId: string) => ({
  studentId,
  items: [{ skill: "PROGRAMMING", level: "GOOD", note: "" }],
});

/** JWT (`auth()`) + vai đọc lại từ DB (`getFreshGateUser`) — mặc định hai bên khớp nhau. */
function login(id: string, role: string, centerId: string | null) {
  h.auth.mockResolvedValue({ user: { id, role, centerId } });
  h.fresh.mockResolvedValue({ role, roles: [role], centerId });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.enrollmentFindFirst.mockResolvedValue(null);
  h.createMany.mockResolvedValue({ count: 1 });
  login("u-cm", "CENTER_MANAGER", "c1");
  h.resolveActor.mockResolvedValue(QLCS_HAI_CO_SO());
});

const DENIED = { ok: false, error: "Không có quyền chấm năng lực học sinh này" };

describe("[L-A6] saveStudentSkills — QLCS đa cơ sở", () => {
  it("học viên ở cơ sở NEO (c1) → ghi được (không làm hỏng ca đang chạy)", async () => {
    h.studentFindUnique.mockResolvedValue({ centerId: "c1" });
    await expect(saveStudentSkills(INPUT("s-1"))).resolves.toEqual({ ok: true });
    expect(h.createMany).toHaveBeenCalledTimes(1);
  });

  it("học viên ở cơ sở THỨ HAI (c2) → ghi được — ca hôm nay TỪ CHỐI oan", async () => {
    h.studentFindUnique.mockResolvedValue({ centerId: "c2" });
    await expect(saveStudentSkills(INPUT("s-2"))).resolves.toEqual({ ok: true });
    expect(h.createMany).toHaveBeenCalledTimes(1);
  });

  it("học viên ở cơ sở NGOÀI phạm vi (c3) → từ chối, KHÔNG ghi gì", async () => {
    h.studentFindUnique.mockResolvedValue({ centerId: "c3" });
    await expect(saveStudentSkills(INPUT("s-3"))).resolves.toEqual(DENIED);
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it("học viên chưa gắn cơ sở (centerId null) → từ chối (fail-closed, như hôm nay)", async () => {
    h.studentFindUnique.mockResolvedValue({ centerId: null });
    await expect(saveStudentSkills(INPUT("s-0"))).resolves.toEqual(DENIED);
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it("QLCS chỉ MỘT cơ sở → học viên cơ sở khác vẫn từ chối (cách ly giữ nguyên)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs1", "CENTER_MANAGER")]));
    h.studentFindUnique.mockResolvedValue({ centerId: "c2" });
    await expect(saveStudentSkills(INPUT("s-2"))).resolves.toEqual(DENIED);
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it("cơ sở neo LỆCH (JWT c1, vai neo ở c2) → ghi được ở c2: nguồn sự thật là vai", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs2", "CENTER_MANAGER")]));
    h.studentFindUnique.mockResolvedValue({ centerId: "c2" });
    await expect(saveStudentSkills(INPUT("s-2"))).resolves.toEqual({ ok: true });
  });
});

// ── A-01-6b (26/08) — KIÊM NHIỆM: quyền ĐỌC của vai khác không được mở cổng GHI ────
// Bản 25/08 kiểm `visibleCenterIds` AND `passesScope("Student", …)`; vế sau TRÙNG đúng lớp
// lọc mà `sdb.student.findUnique` vừa chạy (cùng `getModelVisibleCenterIds("Student", …)`)
// nên cổng thực chất chỉ còn MỘT vế, và vế đó nở theo `students:view-all` của vai kiêm nhiệm.

/** Kế toán cơ sở mang `students:view-all` + `classes:view-all` (prisma/seed-roles.ts). */
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
  it("CA1: QLCS@CS1 kiêm KẾ TOÁN@CS2 → học viên CS2 bị từ chối, KHÔNG ghi gì", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    // Ghim rằng ca này không tự xanh: vế cũ (đọc được CS2) VẪN cho qua.
    expect(actor.visibleCenterIds).toContain("c2");

    h.resolveActor.mockResolvedValue(actor);
    h.studentFindUnique.mockResolvedValue({ centerId: "c2" });
    await expect(saveStudentSkills(INPUT("s-2"))).resolves.toEqual(DENIED);
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it("CA2: QLCS@CS1 kiêm MARKETING (⇒ HO_MARKETING@HO) → mọi HS ngoài CS1 bị từ chối", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("ho", "HO_MARKETING", MARKETING_PERMS),
    ]);
    expect(actor.isHoLevel).toBe(true);
    expect(actor.visibleCenterIds).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));

    h.resolveActor.mockResolvedValue(actor);
    h.studentFindUnique.mockResolvedValue({ centerId: "c3" });
    await expect(saveStudentSkills(INPUT("s-3"))).resolves.toEqual(DENIED);
    expect(h.createMany).not.toHaveBeenCalled();

    h.studentFindUnique.mockResolvedValue({ centerId: "c1" });
    await expect(saveStudentSkills(INPUT("s-1"))).resolves.toEqual({ ok: true });
  });
});

describe("[L-A6] các vai KHÁC không rộng thêm một ly nào", () => {
  it("GV dạy lớp của HS → ghi được (nhánh TEACHER giữ nguyên)", async () => {
    login("u-gv", "TEACHER", "c1");
    h.resolveActor.mockResolvedValue(
      actorOf("u-gv", [row("cs1", "TEACHER", [{ action: "students:view-all", scopeType: "GLOBAL" }])]),
    );
    h.studentFindUnique.mockResolvedValue({ centerId: "c1" });
    h.enrollmentFindFirst.mockResolvedValue({ id: "e-1" });
    await expect(saveStudentSkills(INPUT("s-1"))).resolves.toEqual({ ok: true });
  });

  it("GV KHÔNG dạy lớp của HS, dù cùng cơ sở → từ chối (không hưởng tầm nhìn cơ sở)", async () => {
    login("u-gv", "TEACHER", "c1");
    h.resolveActor.mockResolvedValue(
      actorOf("u-gv", [row("cs1", "TEACHER", [{ action: "students:view-all", scopeType: "GLOBAL" }])]),
    );
    h.studentFindUnique.mockResolvedValue({ centerId: "c1" });
    await expect(saveStudentSkills(INPUT("s-1"))).resolves.toEqual(DENIED);
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it("SALES_CSM cùng cơ sở với HS → từ chối (vai ngoài 3 nhánh)", async () => {
    login("u-sale", "SALES_CSM", "c1");
    h.resolveActor.mockResolvedValue(actorOf("u-sale", [row("cs1", "CENTER_SALES_CSM")]));
    h.studentFindUnique.mockResolvedValue({ centerId: "c1" });
    await expect(saveStudentSkills(INPUT("s-1"))).resolves.toEqual(DENIED);
    expect(h.createMany).not.toHaveBeenCalled();
  });

  // 26/08 — trước đây cổng này đọc vai từ JWT (`session.user`), nên gỡ vai QLCS trong DB
  // không có tác dụng cho tới khi người đó đăng xuất (lệch với cổng buổi học).
  it("vai QLCS đã bị GỠ trong DB → từ chối ngay, dù JWT còn vai", async () => {
    h.fresh.mockResolvedValue({ role: "SALES_CSM", roles: ["SALES_CSM"], centerId: "c1" });
    h.studentFindUnique.mockResolvedValue({ centerId: "c1" });
    await expect(saveStudentSkills(INPUT("s-1"))).resolves.toEqual(DENIED);
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it("SUPER_ADMIN → ghi được ở mọi cơ sở (hành vi không đổi)", async () => {
    login("u-sa", "SUPER_ADMIN", null);
    h.resolveActor.mockResolvedValue(actorOf("u-sa", [row("ho", "SUPER_ADMIN")]));
    h.studentFindUnique.mockResolvedValue({ centerId: "c3" });
    await expect(saveStudentSkills(INPUT("s-3"))).resolves.toEqual({ ok: true });
  });

  it("chưa đăng nhập → từ chối trước mọi thứ", async () => {
    h.auth.mockResolvedValue(null);
    await expect(saveStudentSkills(INPUT("s-1"))).resolves.toEqual({
      ok: false,
      error: "Chưa đăng nhập",
    });
    expect(h.createMany).not.toHaveBeenCalled();
  });
});
