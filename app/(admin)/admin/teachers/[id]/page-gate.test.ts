// @vitest-environment node
/**
 * A-01-6 · bất biến **L-A6** — GATE UI của trang hồ sơ giáo viên.
 *
 * ⚠️ ĐÂY KHÔNG PHẢI CỔNG GHI. Ba cổng GHI nằm ở `../_actions.ts` (đã có
 * `../_actions.test.ts`); trang này chỉ QUYẾT ĐỊNH HIỂN THỊ: `canView` (vào được trang
 * hay bị đá về /dashboard) và `canEdit` (có mã nút Lưu / gán lớp / chấm điểm hay không).
 * Nới ở đây KHÔNG cấp thêm quyền cho ai — server vẫn tự kiểm lần nữa.
 *
 * Vì sao vẫn phải sửa + ghim bằng test: luật cũ ở đây là bản CHÉP TAY
 * (`teacher.centerId === me.centerId`). Server đã đo bằng "cơ sở đang giữ vai QLCS" nên
 * với quản lý giữ 2 cơ sở, server CHO nhưng nút KHÔNG BAO GIỜ HIỆN ở cơ sở thứ hai —
 * fix đúng mà không nghiệm thu được bằng mắt. Nay trang gọi CHUNG `roleManagesCenter`
 * với server thay vì chép luật lần thứ hai.
 *
 * Cách đo: gọi thẳng Server Component (nó là một hàm async trả cây React) rồi đọc prop
 * `canEdit` mà nó truyền xuống 3 khối con. `scopedDb` là client giả KHÔNG lọc gì, nên
 * kết quả là do chính gate quyết định.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
import type { OrgUnitNode } from "@/lib/org/types";
import type { Actor, UserOrgRoleRow } from "@/lib/auth/actor";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveActor: vi.fn(),
  checkPermission: vi.fn(),
  getSetting: vi.fn(),
  userFindUnique: vi.fn(),
  courseFindMany: vi.fn(),
  classFindMany: vi.fn(),
  sessionFindMany: vi.fn(),
  enrollmentFindMany: vi.fn(),
  feedbackFindMany: vi.fn(),
  reviewFindMany: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
  // Khối con — chỉ dùng làm MỐC để tìm trong cây React, không render.
  ProfileForm: () => null,
  ClassAssignment: () => null,
  Evaluations: () => null,
}));

class RedirectSignal extends Error {}
class NotFoundSignal extends Error {}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    h.redirect(to);
    throw new RedirectSignal(to);
  },
  notFound: () => {
    h.notFound();
    throw new NotFoundSignal("not-found");
  },
}));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("lucide-react", () => ({ ChevronLeft: () => null }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth/check-permission", () => ({ checkPermission: h.checkPermission }));
vi.mock("@/lib/settings/service", () => ({ getSetting: h.getSetting }));
vi.mock("./_components/profile-form", () => ({ TeacherProfileForm: h.ProfileForm }));
vi.mock("./_components/class-assignment", () => ({ ClassAssignmentSection: h.ClassAssignment }));
vi.mock("./_components/evaluations", () => ({ TeacherEvaluations: h.Evaluations }));
vi.mock("./_components/weekly-schedule", () => ({ WeeklySchedule: () => null }));
vi.mock("@/lib/auth/actor", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/actor")>();
  return { ...actual, resolveActor: h.resolveActor };
});
vi.mock("@/lib/db-scope", async (orig) => {
  const actual = await orig<typeof import("@/lib/db-scope")>();
  return {
    ...actual,
    // KHÔNG lọc gì — kết quả phải do gate quyết định (luật cứng #3).
    scopedDb: () => ({
      user: { findUnique: h.userFindUnique },
      course: { findMany: h.courseFindMany },
      class: { findMany: h.classFindMany },
      classSession: { findMany: h.sessionFindMany },
      enrollment: { findMany: h.enrollmentFindMany },
      parentFeedback: { findMany: h.feedbackFindMany },
      teacherReview: { findMany: h.reviewFindMany },
    }),
  };
});

import { buildActor } from "@/lib/auth/actor";
import TeacherProfilePage from "./page";

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
const CM_PERMS: Perms = [
  { action: "employees:view-all", scopeType: "GLOBAL" },
  { action: "employees:edit", scopeType: "GLOBAL" },
];
const KE_TOAN_PERMS: Perms = [
  { action: "payments:manage", scopeType: "GLOBAL" },
  { action: "employees:view-all", scopeType: "GLOBAL" },
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

const QLCS_HAI_CO_SO = () =>
  actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_MANAGER")]);

function login(id: string, role: string, centerId: string | null, roles?: string[]) {
  h.auth.mockResolvedValue({ user: { id, role, roles: roles ?? [role], centerId } });
}

function teacherAt(centerId: string | null) {
  h.userFindUnique.mockResolvedValue({
    id: "u-gv",
    name: "Cô A",
    email: "a@x.vn",
    role: "TEACHER",
    roles: ["TEACHER"],
    centerId,
    center: { name: "CS" },
    employee: null,
    teacherProfile: null,
  });
}

/** Tìm props của khối con `type` trong cây React trả về (không render). */
function findProps(node: unknown, type: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProps(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<Record<string, unknown>>;
  if (el.type === type) return el.props;
  return findProps(el.props.children, type);
}

/** Chạy trang, trả `canEdit` mà nó truyền xuống 3 khối con (phải khớp nhau). */
async function renderCanEdit(): Promise<boolean> {
  const tree = await TeacherProfilePage({
    params: Promise.resolve({ id: "u-gv" }),
    searchParams: Promise.resolve({}),
  });
  const forms = [h.ProfileForm, h.ClassAssignment, h.Evaluations].map(
    (c) => findProps(tree, c)?.canEdit,
  );
  expect(forms[0]).toBe(forms[1]);
  expect(forms[1]).toBe(forms[2]);
  return forms[0] === true;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.checkPermission.mockResolvedValue(true);
  h.getSetting.mockResolvedValue(24);
  h.courseFindMany.mockResolvedValue([]);
  h.classFindMany.mockResolvedValue([]);
  h.sessionFindMany.mockResolvedValue([]);
  h.enrollmentFindMany.mockResolvedValue([]);
  h.feedbackFindMany.mockResolvedValue([]);
  h.reviewFindMany.mockResolvedValue([]);
  login("u-cm", "CENTER_MANAGER", "c1");
  h.resolveActor.mockResolvedValue(QLCS_HAI_CO_SO());
  teacherAt("c1");
});

describe("[L-A6] gate UI trang hồ sơ GV — canEdit theo vai QLCS đang giữ", () => {
  it("GV ở cơ sở NEO (c1) → mở nút sửa (không làm hỏng ca đang chạy)", async () => {
    await expect(renderCanEdit()).resolves.toBe(true);
  });

  it("GV ở cơ sở THỨ HAI (c2) → mở nút sửa — hôm nay chỉ hiện 'Chỉ xem'", async () => {
    teacherAt("c2");
    await expect(renderCanEdit()).resolves.toBe(true);
  });

  it("GV ở cơ sở NGOÀI phạm vi (c3) → đá về /dashboard (không cả xem)", async () => {
    teacherAt("c3");
    await expect(renderCanEdit()).rejects.toBeInstanceOf(RedirectSignal);
    expect(h.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("QLCS chỉ MỘT cơ sở → GV cơ sở khác vẫn bị chặn (cách ly giữ nguyên)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs1", "CENTER_MANAGER")]));
    teacherAt("c2");
    await expect(renderCanEdit()).rejects.toBeInstanceOf(RedirectSignal);
    expect(h.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("KIÊM NHIỆM: QLCS@CS1 kiêm KẾ TOÁN@CS2 → GV ở CS2 vẫn bị chặn", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    // Ghim rằng ca này không tự xanh: vế "đọc được CS2" VẪN đúng.
    expect(actor.visibleCenterIds).toContain("c2");
    h.resolveActor.mockResolvedValue(actor);
    teacherAt("c2");
    await expect(renderCanEdit()).rejects.toBeInstanceOf(RedirectSignal);
  });
});

describe("[L-A6] các vai khác — hành vi KHÔNG đổi", () => {
  it("GV tự xem hồ sơ mình → vào được nhưng CHỈ XEM", async () => {
    login("u-gv", "TEACHER", "c1");
    h.resolveActor.mockResolvedValue(actorOf("u-gv", [row("cs1", "TEACHER", [])]));
    h.checkPermission.mockResolvedValue(false);
    teacherAt("c1");
    await expect(renderCanEdit()).resolves.toBe(false);
  });

  it("GV xem hồ sơ NGƯỜI KHÁC → đá về /dashboard", async () => {
    login("u-gv2", "TEACHER", "c1");
    h.resolveActor.mockResolvedValue(actorOf("u-gv2", [row("cs1", "TEACHER", [])]));
    h.checkPermission.mockResolvedValue(false);
    teacherAt("c1");
    await expect(renderCanEdit()).rejects.toBeInstanceOf(RedirectSignal);
  });

  it("HR Hội sở → xem được mọi cơ sở, vẫn CHỈ XEM (như hôm nay)", async () => {
    login("u-hr", "HR", "c1");
    h.resolveActor.mockResolvedValue(
      actorOf("u-hr", [row("ho", "HO_HR", [{ action: "employees:edit", scopeType: "GLOBAL" }])]),
    );
    teacherAt("c3");
    await expect(renderCanEdit()).resolves.toBe(false);
  });

  it("SUPER_ADMIN → sửa được ở mọi cơ sở (không đổi)", async () => {
    login("u-sa", "SUPER_ADMIN", null);
    h.resolveActor.mockResolvedValue(actorOf("u-sa", [row("ho", "SUPER_ADMIN")]));
    teacherAt("c3");
    await expect(renderCanEdit()).resolves.toBe(true);
  });

  it("người dùng KHÔNG phải giáo viên → 404 (không đổi)", async () => {
    h.userFindUnique.mockResolvedValue({
      id: "u-gv",
      name: "Anh B",
      email: "b@x.vn",
      role: "SALES_CSM",
      roles: ["SALES_CSM"],
      centerId: "c1",
      center: { name: "CS1" },
      employee: null,
      teacherProfile: null,
    });
    await expect(renderCanEdit()).rejects.toBeInstanceOf(NotFoundSignal);
  });
});
