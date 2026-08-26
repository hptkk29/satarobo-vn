// @vitest-environment node
/**
 * A-01-6 · bất biến **L-A6** — 3 cổng GHI của hồ sơ giáo viên phải đo phạm vi QLCS bằng
 * "các cơ sở người này ĐANG GIỮ vai CENTER_MANAGER", không bằng MỘT cơ sở neo trong JWT
 * (`session.user.centerId`, ảnh chụp lúc đăng nhập).
 *
 * Ba cổng (đều nằm trong `./_actions.ts`):
 *   1. `requireTeacherManager` — cơ sở của GIÁO VIÊN đích (dùng chung cho
 *      `updateTeacherProfile` + `addTeacherReview`);
 *   2. `assignClassToTeacher`  — cơ sở của LỚP được gán;
 *   3. `unassignClassFromTeacher` — cơ sở của LỚP bị gỡ.
 *
 * Gate không được export (mọi export của file `"use server"` là một HTTP endpoint), nên
 * test đi qua chính Server Action — cũng đúng hơn: thứ cần chứng minh là **có ghi được
 * hay không**, không phải giá trị boolean trung gian.
 *
 * Ba ca bắt buộc cho MỖI cổng:
 *   · cơ sở thứ HAI người đó đang giữ vai QLCS → CHO
 *   · cơ sở NGOÀI phạm vi (thứ ba)            → TỪ CHỐI, không ghi gì
 *   · vai KHÁC (kiêm nhiệm / TEACHER)          → KHÔNG rộng thêm một ly nào
 *
 * ⚠️ `scopedDb` bị thay bằng client giả **không lọc gì**: mọi kết quả dưới đây là do chính
 * cổng quyền quyết định, không phải do tầng đọc lọc hộ (luật cứng #3 — `scopedDb` chỉ che
 * đường ĐỌC, cổng GHI phải tự kiểm).
 *
 * ⚠️ `checkPermission` mặc định trả TRUE (mô phỏng người có `employees:edit` — v1 cho
 * CENTER_MANAGER, v2 cho HO_HR/CENTER_HR/SUPER_ADMIN). Nhờ vậy mọi ca TỪ CHỐI dưới đây
 * là do NHÁNH QLCS chặn, không phải do quyền action thiếu.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgUnitNode } from "@/lib/org/types";
import type { Actor, UserOrgRoleRow } from "@/lib/auth/actor";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveActor: vi.fn(),
  checkPermission: vi.fn(),
  userFindUnique: vi.fn(),
  classFindFirst: vi.fn(),
  classFindUnique: vi.fn(),
  profileUpsert: vi.fn(),
  reviewCreate: vi.fn(),
  txUserUpdate: vi.fn(),
  txProfileUpsert: vi.fn(),
  txCourseDeleteMany: vi.fn(),
  txCourseCreateMany: vi.fn(),
  txClassUpdate: vi.fn(),
  syncMembership: vi.fn(),
  reconcile: vi.fn(),
  orgUnitIdForCenter: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth/check-permission", () => ({ checkPermission: h.checkPermission }));
vi.mock("@/lib/chat/sync-membership", () => ({ syncConversationMembership: h.syncMembership }));
vi.mock("@/lib/org/org-service", () => ({ orgUnitIdForCenter: h.orgUnitIdForCenter }));
vi.mock("@/lib/auth/org-role-sync", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/org-role-sync")>();
  return { ...actual, reconcileUserOrgRoles: h.reconcile };
});
vi.mock("@/lib/auth/actor", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/actor")>();
  return { ...actual, resolveActor: h.resolveActor };
});
vi.mock("@/lib/db-scope", async (orig) => {
  const actual = await orig<typeof import("@/lib/db-scope")>();
  const tx = {
    user: { update: h.txUserUpdate },
    teacherProfile: { upsert: h.txProfileUpsert },
    teacherCourse: { deleteMany: h.txCourseDeleteMany, createMany: h.txCourseCreateMany },
    class: { update: h.txClassUpdate },
  };
  return {
    ...actual,
    // Client giả KHÔNG lọc gì — xem khối chú thích đầu file.
    scopedDb: () => ({
      user: { findUnique: h.userFindUnique },
      class: { findFirst: h.classFindFirst, findUnique: h.classFindUnique },
      teacherProfile: { upsert: h.profileUpsert },
      teacherReview: { create: h.reviewCreate },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    }),
  };
});

import { buildActor } from "@/lib/auth/actor";
import {
  addTeacherReview,
  assignClassToTeacher,
  unassignClassFromTeacher,
  updateTeacherProfile,
} from "./_actions";

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
/** Bám prefix `employees:` / `classes:` để đi đúng đường permission thật. */
const CM_PERMS: Perms = [
  { action: "employees:view-all", scopeType: "GLOBAL" },
  { action: "employees:edit", scopeType: "GLOBAL" },
  { action: "classes:view-all", scopeType: "GLOBAL" },
  { action: "classes:edit", scopeType: "GLOBAL" },
];
/** Kế toán cơ sở: `students:view-all` + `classes:view-all` (prisma/seed-roles.ts:775+). */
const KE_TOAN_PERMS: Perms = [
  { action: "payments:manage", scopeType: "GLOBAL" },
  { action: "classes:view-all", scopeType: "GLOBAL" },
];
/** HO_MARKETING: `classes:view-all` GLOBAL neo tại HO (prisma/seed-roles.ts:254). */
const MARKETING_PERMS: Perms = [
  { action: "news:publish", scopeType: "GLOBAL" },
  { action: "classes:view-all", scopeType: "GLOBAL" },
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
  buildActor({ userId, rows, orgNodes: ORG, now: new Date("2026-08-26") });

/** QLCS **thuần** giữ CS1 + CS2 — hai vùng khác nhau. */
const QLCS_HAI_CO_SO = () =>
  actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_MANAGER")]);

function login(id: string, role: string, centerId: string | null, roles?: string[]) {
  h.auth.mockResolvedValue({
    user: { id, role, roles: roles ?? [role], centerId, name: "Người dùng", email: "u@x.vn" },
  });
}

/** GV đích nằm ở cơ sở `centerId` (dùng cho cả gate + phần đọc lại trong action). */
function teacherAt(centerId: string | null) {
  h.userFindUnique.mockResolvedValue({
    centerId,
    role: "TEACHER",
    roles: ["TEACHER"],
    orgUnitId: centerId === "c1" ? "cs1" : centerId === "c2" ? "cs2" : "cs3",
  });
}

const PROFILE_INPUT = (userId: string) => ({
  userId,
  rank: "JUNIOR",
  employmentType: "FULLTIME",
  status: "ACTIVE",
  bio: "",
  courseIds: [],
});
const REVIEW_INPUT = (userId: string) => ({ userId, score: 5, note: "Dự giờ tốt" });
const ASSIGN_INPUT = { classId: "cls-1", teacherUserId: "u-gv", as: "teacher" as const };

const DENIED_TEACHER = { ok: false, error: "Giáo viên không thuộc cơ sở của bạn" };
const DENIED_CLASS = { ok: false, error: "Lớp không thuộc cơ sở của bạn" };
const DENIED_PERM = { ok: false, error: "Không có quyền quản lý giáo viên" };

beforeEach(() => {
  vi.clearAllMocks();
  h.checkPermission.mockResolvedValue(true);
  h.profileUpsert.mockResolvedValue({ id: "tp-1" });
  h.txProfileUpsert.mockResolvedValue({ id: "tp-1" });
  h.reviewCreate.mockResolvedValue({ id: "rv-1" });
  h.txClassUpdate.mockResolvedValue({ id: "cls-1" });
  h.orgUnitIdForCenter.mockResolvedValue("cs1");
  login("u-cm", "CENTER_MANAGER", "c1");
  h.resolveActor.mockResolvedValue(QLCS_HAI_CO_SO());
  teacherAt("c1");
});

// ── CỔNG 1 — hồ sơ + đánh giá GV (requireTeacherManager, cơ sở của GIÁO VIÊN) ─────
describe("[L-A6] cổng 1 — updateTeacherProfile / addTeacherReview theo cơ sở của GV", () => {
  it("GV ở cơ sở NEO (c1) → lưu được (không làm hỏng ca đang chạy)", async () => {
    await expect(updateTeacherProfile(PROFILE_INPUT("u-gv"))).resolves.toEqual({ ok: true });
    expect(h.txProfileUpsert).toHaveBeenCalledTimes(1);
  });

  it("GV ở cơ sở THỨ HAI (c2) → lưu được — ca hôm nay TỪ CHỐI oan", async () => {
    teacherAt("c2");
    await expect(updateTeacherProfile(PROFILE_INPUT("u-gv"))).resolves.toEqual({ ok: true });
    expect(h.txProfileUpsert).toHaveBeenCalledTimes(1);
  });

  it("GV ở cơ sở NGOÀI phạm vi (c3) → từ chối, KHÔNG ghi gì", async () => {
    teacherAt("c3");
    await expect(updateTeacherProfile(PROFILE_INPUT("u-gv"))).resolves.toEqual(DENIED_TEACHER);
    expect(h.txProfileUpsert).not.toHaveBeenCalled();
  });

  it("GV chưa gắn cơ sở (null) → từ chối (fail-closed, như hôm nay)", async () => {
    teacherAt(null);
    await expect(updateTeacherProfile(PROFILE_INPUT("u-gv"))).resolves.toEqual(DENIED_TEACHER);
    expect(h.txProfileUpsert).not.toHaveBeenCalled();
  });

  it("QLCS cũng CHƯA gắn cơ sở + GV chưa gắn cơ sở → từ chối (ca suy biến bị SIẾT)", async () => {
    // Luật cũ so `null !== null` = false ⇒ CHO qua. Nay fail-closed, khớp cổng học viên.
    login("u-cm", "CENTER_MANAGER", null);
    teacherAt(null);
    await expect(updateTeacherProfile(PROFILE_INPUT("u-gv"))).resolves.toEqual(DENIED_TEACHER);
    expect(h.txProfileUpsert).not.toHaveBeenCalled();
  });

  it("QLCS chỉ MỘT cơ sở → GV cơ sở khác vẫn từ chối (cách ly giữ nguyên)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs1", "CENTER_MANAGER")]));
    teacherAt("c2");
    await expect(updateTeacherProfile(PROFILE_INPUT("u-gv"))).resolves.toEqual(DENIED_TEACHER);
    expect(h.txProfileUpsert).not.toHaveBeenCalled();
  });

  it("cơ sở neo LỆCH (JWT c1, vai neo ở c2) → lưu được ở c2: nguồn sự thật là vai", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs2", "CENTER_MANAGER")]));
    teacherAt("c2");
    await expect(updateTeacherProfile(PROFILE_INPUT("u-gv"))).resolves.toEqual({ ok: true });
  });

  it("addTeacherReview dùng CHUNG cổng: c2 cho, c3 từ chối", async () => {
    teacherAt("c2");
    await expect(addTeacherReview(REVIEW_INPUT("u-gv"))).resolves.toEqual({ ok: true });
    expect(h.reviewCreate).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    h.checkPermission.mockResolvedValue(true);
    h.resolveActor.mockResolvedValue(QLCS_HAI_CO_SO());
    login("u-cm", "CENTER_MANAGER", "c1");
    teacherAt("c3");
    await expect(addTeacherReview(REVIEW_INPUT("u-gv"))).resolves.toEqual(DENIED_TEACHER);
    expect(h.reviewCreate).not.toHaveBeenCalled();
  });
});

// ── CỔNG 2 — gán lớp (cơ sở của LỚP) ──────────────────────────────────────────────
describe("[L-A6] cổng 2 — assignClassToTeacher theo cơ sở của LỚP", () => {
  it("lớp ở cơ sở THỨ HAI (c2) → gán được — ca hôm nay TỪ CHỐI oan", async () => {
    teacherAt("c2");
    h.classFindFirst.mockResolvedValue({ id: "cls-1", centerId: "c2" });
    await expect(assignClassToTeacher(ASSIGN_INPUT)).resolves.toEqual({ ok: true });
    expect(h.txClassUpdate).toHaveBeenCalledTimes(1);
    expect(h.syncMembership).toHaveBeenCalledTimes(1);
  });

  it("lớp ở cơ sở NGOÀI phạm vi (c3) → từ chối, KHÔNG ghi gì", async () => {
    teacherAt("c1");
    h.classFindFirst.mockResolvedValue({ id: "cls-1", centerId: "c3" });
    await expect(assignClassToTeacher(ASSIGN_INPUT)).resolves.toEqual(DENIED_CLASS);
    expect(h.txClassUpdate).not.toHaveBeenCalled();
    expect(h.syncMembership).not.toHaveBeenCalled();
  });

  it("lớp chưa gắn cơ sở (null) → từ chối (fail-closed)", async () => {
    teacherAt("c1");
    h.classFindFirst.mockResolvedValue({ id: "cls-1", centerId: null });
    await expect(assignClassToTeacher(ASSIGN_INPUT)).resolves.toEqual(DENIED_CLASS);
    expect(h.txClassUpdate).not.toHaveBeenCalled();
  });

  it("QLCS chỉ MỘT cơ sở → lớp cơ sở khác vẫn từ chối", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs1", "CENTER_MANAGER")]));
    teacherAt("c1");
    h.classFindFirst.mockResolvedValue({ id: "cls-1", centerId: "c2" });
    await expect(assignClassToTeacher(ASSIGN_INPUT)).resolves.toEqual(DENIED_CLASS);
    expect(h.txClassUpdate).not.toHaveBeenCalled();
  });
});

// ── CỔNG 3 — gỡ lớp (cơ sở của LỚP) ───────────────────────────────────────────────
describe("[L-A6] cổng 3 — unassignClassFromTeacher theo cơ sở của LỚP", () => {
  it("lớp ở cơ sở THỨ HAI (c2) → gỡ được — ca hôm nay TỪ CHỐI oan", async () => {
    teacherAt("c2");
    h.classFindUnique.mockResolvedValue({ centerId: "c2", teacherId: "u-gv", assistantId: null });
    await expect(unassignClassFromTeacher(ASSIGN_INPUT)).resolves.toEqual({ ok: true });
    expect(h.txClassUpdate).toHaveBeenCalledTimes(1);
    expect(h.syncMembership).toHaveBeenCalledTimes(1);
  });

  it("lớp ở cơ sở NGOÀI phạm vi (c3) → từ chối, KHÔNG ghi gì", async () => {
    teacherAt("c1");
    h.classFindUnique.mockResolvedValue({ centerId: "c3", teacherId: "u-gv", assistantId: null });
    await expect(unassignClassFromTeacher(ASSIGN_INPUT)).resolves.toEqual(DENIED_CLASS);
    expect(h.txClassUpdate).not.toHaveBeenCalled();
    expect(h.syncMembership).not.toHaveBeenCalled();
  });

  it("QLCS chỉ MỘT cơ sở → lớp cơ sở khác vẫn từ chối", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs1", "CENTER_MANAGER")]));
    teacherAt("c1");
    h.classFindUnique.mockResolvedValue({ centerId: "c2", teacherId: "u-gv", assistantId: null });
    await expect(unassignClassFromTeacher(ASSIGN_INPUT)).resolves.toEqual(DENIED_CLASS);
    expect(h.txClassUpdate).not.toHaveBeenCalled();
  });
});

// ── KIÊM NHIỆM — vai KHÁC không nới cổng nào ──────────────────────────────────────
// Đây là chỗ hai cách làm SAI đã bị loại lộ ra: `visibleCenterIds` (tầm nhìn ĐỌC gộp)
// và `passesScope` (theo TIỀN TỐ model) đều NỞ theo vai kiêm nhiệm, nên AND hai vế
// không cắt gì. Xem khối chú thích đầu `lib/auth/managed-centers.ts`.
describe("[L-A6] kiêm nhiệm — vai KHÁC không rộng thêm một ly nào", () => {
  const CM_KIEM_KE_TOAN = () =>
    actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS)]);
  const CM_KIEM_MARKETING = () =>
    actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("ho", "HO_MARKETING", MARKETING_PERMS)]);

  it("CA1 · cổng 1: QLCS@CS1 kiêm KẾ TOÁN@CS2 → GV ở CS2 bị từ chối", async () => {
    const actor = CM_KIEM_KE_TOAN();
    // Ghim rằng ca này không tự xanh: vế cũ (đọc được CS2) VẪN cho qua.
    expect(actor.visibleCenterIds).toContain("c2");

    h.resolveActor.mockResolvedValue(actor);
    teacherAt("c2");
    await expect(updateTeacherProfile(PROFILE_INPUT("u-gv"))).resolves.toEqual(DENIED_TEACHER);
    expect(h.txProfileUpsert).not.toHaveBeenCalled();
  });

  it("CA1 · cổng 2+3: lớp ở CS2 (chỉ là kế toán) → gán/gỡ đều từ chối", async () => {
    h.resolveActor.mockResolvedValue(CM_KIEM_KE_TOAN());
    teacherAt("c1");
    h.classFindFirst.mockResolvedValue({ id: "cls-1", centerId: "c2" });
    h.classFindUnique.mockResolvedValue({ centerId: "c2", teacherId: "u-gv", assistantId: null });
    await expect(assignClassToTeacher(ASSIGN_INPUT)).resolves.toEqual(DENIED_CLASS);
    await expect(unassignClassFromTeacher(ASSIGN_INPUT)).resolves.toEqual(DENIED_CLASS);
    expect(h.txClassUpdate).not.toHaveBeenCalled();
  });

  it("CA2 · QLCS@CS1 kiêm MARKETING (⇒ HO_MARKETING@HO) → mọi cơ sở ngoài CS1 từ chối", async () => {
    const actor = CM_KIEM_MARKETING();
    expect(actor.isHoLevel).toBe(true);
    expect(actor.visibleCenterIds).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));

    h.resolveActor.mockResolvedValue(actor);
    login("u-cm", "CENTER_MANAGER", "c1", ["CENTER_MANAGER", "MARKETING"]);
    teacherAt("c3");
    await expect(updateTeacherProfile(PROFILE_INPUT("u-gv"))).resolves.toEqual(DENIED_TEACHER);

    teacherAt("c1");
    h.classFindFirst.mockResolvedValue({ id: "cls-1", centerId: "c3" });
    await expect(assignClassToTeacher(ASSIGN_INPUT)).resolves.toEqual(DENIED_CLASS);

    // …còn cơ sở CS1 (nơi thật sự giữ vai QLCS) vẫn làm việc bình thường.
    h.classFindFirst.mockResolvedValue({ id: "cls-1", centerId: "c1" });
    await expect(assignClassToTeacher(ASSIGN_INPUT)).resolves.toEqual({ ok: true });
  });
});

// ── Các vai khác + hành vi KHÔNG ĐỔI ──────────────────────────────────────────────
describe("[L-A6] vai khác + hành vi không đổi", () => {
  it("GV thuần (không có employees:edit) → từ chối ở chính cơ sở mình", async () => {
    login("u-gv2", "TEACHER", "c1");
    h.resolveActor.mockResolvedValue(
      actorOf("u-gv2", [row("cs1", "TEACHER", [{ action: "classes:view-own", scopeType: "GLOBAL" }])]),
    );
    h.checkPermission.mockResolvedValue(false);
    teacherAt("c1");
    await expect(updateTeacherProfile(PROFILE_INPUT("u-gv"))).resolves.toEqual(DENIED_PERM);
    expect(h.txProfileUpsert).not.toHaveBeenCalled();
  });

  it("SALES_CSM cùng cơ sở → từ chối (vai ngoài phạm vi cổng)", async () => {
    login("u-sale", "SALES_CSM", "c1");
    h.resolveActor.mockResolvedValue(actorOf("u-sale", [row("cs1", "CENTER_SALES_CSM", KE_TOAN_PERMS)]));
    h.checkPermission.mockResolvedValue(false);
    teacherAt("c1");
    await expect(addTeacherReview(REVIEW_INPUT("u-gv"))).resolves.toEqual(DENIED_PERM);
    expect(h.reviewCreate).not.toHaveBeenCalled();
  });

  it("SUPER_ADMIN → ghi được ở mọi cơ sở (hành vi KHÔNG đổi)", async () => {
    login("u-sa", "SUPER_ADMIN", null);
    h.resolveActor.mockResolvedValue(actorOf("u-sa", [row("ho", "SUPER_ADMIN")]));
    teacherAt("c3");
    await expect(updateTeacherProfile(PROFILE_INPUT("u-gv"))).resolves.toEqual({ ok: true });

    h.classFindFirst.mockResolvedValue({ id: "cls-1", centerId: "c3" });
    await expect(assignClassToTeacher(ASSIGN_INPUT)).resolves.toEqual({ ok: true });
  });

  it("HR Hội sở (employees:edit GLOBAL, KHÔNG phải QLCS) → mọi cơ sở, không đổi", async () => {
    login("u-hr", "HR", "c1");
    h.resolveActor.mockResolvedValue(
      actorOf("u-hr", [row("ho", "HO_HR", [{ action: "employees:edit", scopeType: "GLOBAL" }])]),
    );
    teacherAt("c3");
    await expect(updateTeacherProfile(PROFILE_INPUT("u-gv"))).resolves.toEqual({ ok: true });
  });

  it("chưa đăng nhập → từ chối trước mọi thứ", async () => {
    h.auth.mockResolvedValue(null);
    await expect(updateTeacherProfile(PROFILE_INPUT("u-gv"))).resolves.toEqual({
      ok: false,
      error: "Chưa đăng nhập",
    });
    expect(h.txProfileUpsert).not.toHaveBeenCalled();
  });
});
