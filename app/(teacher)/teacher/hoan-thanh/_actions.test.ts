// @vitest-environment node
/**
 * A-01-6 · bất biến **L-A6** — cổng GHI "duyệt đề xuất hoàn thành khoá"
 * (`reviewCourseCompletion`) phải chấp nhận MỌI cơ sở mà người duyệt đang giữ CHÍNH vai
 * `CENTER_MANAGER`, không so với ĐÚNG MỘT cơ sở neo trên JWT (`session.user.centerId`).
 *
 * ⚠️ Đây là cổng GHI, và là cổng ghi ĐẮT NHẤT trong hai cổng đợt này: duyệt APPROVED gọi
 * `completeCourse` (`lib/completion/service.ts`) — sinh `CourseCompletion` + mã chứng chỉ.
 * Nó KHÔNG được trông vào `scopedDb` lọc hộ, và cũng không thể: `CourseCompletionRequest`
 * nằm trong `SCOPE_EXEMPT` (`lib/db-scope.ts:96-99` — "so centerId THỦ CÔNG trong
 * reviewCourseCompletion") nên `sdb.courseCompletionRequest.findUnique` là pass-through.
 *
 * ⚠️ `scopedDb` bị thay bằng client giả KHÔNG lọc gì để mọi kết quả dưới đây là do CHÍNH
 * cổng quyền quyết định (luật cứng #3).
 *
 * VAI ĐƯỢC XÉT = `CENTER_MANAGER`. Ở cổng này có HAI đường độc lập cùng chỉ về nó:
 *   (a) `_actions.ts:112` gác `hasRole(session.user, "CENTER_MANAGER")` (enum `Role` v1)
 *       → `lib/auth/legacy-role-map.ts:24` ánh xạ sang RoleDef `"CENTER_MANAGER"`;
 *   (b) quyền nghiệp vụ của việc này là `completions:manage`, và trong RBAC v2 nó CHỈ được
 *       khai ở RoleDef `CENTER_MANAGER` (`prisma/seed-roles.ts:474`) — `TEACHER` bị SIẾT
 *       có chủ đích (seed-roles.ts:679), `CENTER_CLASS_MANAGER` (seed-roles.ts:569) không
 *       có quyền này và cũng không nằm trong bảng ánh xạ legacy.
 *
 * Ba ca bắt buộc:
 *   1. cơ sở thứ HAI của chính QLCS đó    → CHO
 *   2. cơ sở NGOÀI phạm vi (thứ ba)       → TỪ CHỐI
 *   3. vai khác (kiêm nhiệm / GV / Sale)  → KHÔNG rộng thêm một ly nào
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgUnitNode } from "@/lib/org/types";
import type { Actor, UserOrgRoleRow } from "@/lib/auth/actor";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveActor: vi.fn(),
  checkPermission: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  completeCourse: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth/check-permission", () => ({ checkPermission: h.checkPermission }));
vi.mock("@/lib/completion/service", () => ({ completeCourse: h.completeCourse }));
vi.mock("@/lib/auth/actor", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/actor")>();
  return { ...actual, resolveActor: h.resolveActor };
});
vi.mock("@/lib/db-scope", async (orig) => {
  const actual = await orig<typeof import("@/lib/db-scope")>();
  return {
    ...actual,
    // Client giả KHÔNG lọc gì — mọi kết quả là do cổng quyền, không do tầng đọc.
    scopedDb: () => ({
      courseCompletionRequest: { findUnique: h.findUnique, update: h.update },
    }),
  };
});

import { buildActor } from "@/lib/auth/actor";
import { reviewCourseCompletion } from "./_actions";

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
/** Quyền THẬT của "Quản lý cơ sở" cho việc này (prisma/seed-roles.ts:473-474). */
const CM_PERMS: Perms = [
  { action: "completions:manage", scopeType: "GLOBAL" },
  { action: "completions:propose-own", scopeType: "GLOBAL" },
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

/** QLCS **thuần** (không SUPER_ADMIN) giữ CS1 + CS2 — hai vùng khác nhau. */
const QLCS_HAI_CO_SO = () =>
  actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_MANAGER")]);

/** Đề xuất PENDING của học viên thuộc cơ sở `centerId`. */
function pendingRequest(centerId: string | null) {
  return { status: "PENDING", centerId, studentId: "s-1", courseId: "co-1" };
}

const APPROVE = { id: "ccr-1", decision: "APPROVED", note: "OK" };
const REJECT = { id: "ccr-1", decision: "REJECTED", note: "Chưa đủ buổi" };

/** JWT: cổng này đọc vai TỪ session (chưa qua `getFreshGateUser`) — xem viecConLai. */
function login(id: string, role: string, centerId: string | null) {
  h.auth.mockResolvedValue({ user: { id, role, roles: [role], name: "Người duyệt", centerId } });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.update.mockResolvedValue({ id: "ccr-1" });
  h.completeCourse.mockResolvedValue({ ok: true, completionId: "cc-1" });
  h.checkPermission.mockResolvedValue(true);
  login("u-cm", "CENTER_MANAGER", "c1");
  h.resolveActor.mockResolvedValue(QLCS_HAI_CO_SO());
});

const DENIED_CENTER = { ok: false, error: "Đề xuất thuộc cơ sở khác" };
const DENIED_ROLE = { ok: false, error: "Không có quyền duyệt" };

describe("[L-A6] reviewCourseCompletion — QLCS đa cơ sở", () => {
  it("đề xuất ở cơ sở NEO (c1) → duyệt được (ca đang chạy không hỏng)", async () => {
    h.findUnique.mockResolvedValue(pendingRequest("c1"));
    await expect(reviewCourseCompletion(APPROVE)).resolves.toEqual({ ok: true });
    expect(h.completeCourse).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it("đề xuất ở cơ sở THỨ HAI (c2) → duyệt được — ca hôm nay TỪ CHỐI oan", async () => {
    h.findUnique.mockResolvedValue(pendingRequest("c2"));
    await expect(reviewCourseCompletion(APPROVE)).resolves.toEqual({ ok: true });
    expect(h.completeCourse).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it("đề xuất ở cơ sở NGOÀI phạm vi (c3) → từ chối, KHÔNG cấp chứng chỉ, KHÔNG ghi", async () => {
    h.findUnique.mockResolvedValue(pendingRequest("c3"));
    await expect(reviewCourseCompletion(APPROVE)).resolves.toEqual(DENIED_CENTER);
    expect(h.completeCourse).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it("đề xuất chưa gắn cơ sở (centerId null) → từ chối (fail-closed)", async () => {
    h.findUnique.mockResolvedValue(pendingRequest(null));
    await expect(reviewCourseCompletion(APPROVE)).resolves.toEqual(DENIED_CENTER);
    expect(h.completeCourse).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it("QLCS chỉ MỘT cơ sở → đề xuất cơ sở khác vẫn từ chối (cách ly giữ nguyên)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs1", "CENTER_MANAGER")]));
    h.findUnique.mockResolvedValue(pendingRequest("c2"));
    await expect(reviewCourseCompletion(APPROVE)).resolves.toEqual(DENIED_CENTER);
    expect(h.completeCourse).not.toHaveBeenCalled();
  });

  it("cơ sở neo LỆCH (JWT c1, vai neo ở c2) → duyệt được ở c2: nguồn sự thật là VAI", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs2", "CENTER_MANAGER")]));
    h.findUnique.mockResolvedValue(pendingRequest("c2"));
    await expect(reviewCourseCompletion(APPROVE)).resolves.toEqual({ ok: true });
  });

  it("TỪ CHỐI đề xuất ở cơ sở thứ hai → ghi status, KHÔNG cấp chứng chỉ", async () => {
    h.findUnique.mockResolvedValue(pendingRequest("c2"));
    await expect(reviewCourseCompletion(REJECT)).resolves.toEqual({ ok: true });
    expect(h.completeCourse).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it("đề xuất đã xử lý → từ chối (guard trạng thái giữ nguyên)", async () => {
    h.findUnique.mockResolvedValue({ ...pendingRequest("c2"), status: "APPROVED" });
    await expect(reviewCourseCompletion(APPROVE)).resolves.toEqual({
      ok: false,
      error: "Đề xuất đã được xử lý",
    });
    expect(h.completeCourse).not.toHaveBeenCalled();
  });
});

// ── KIÊM NHIỆM: quyền ĐỌC của vai khác không được mở cổng DUYỆT ───────────────────
// Lý do KHÔNG đo bằng `actor.visibleCenterIds` (hoặc `passesScope`): cả hai vế đều nở
// theo vai kiêm nhiệm — xem khối chú thích `lib/auth/managed-centers.ts`.

/** Kế toán cơ sở (seed-roles.ts:775) mang `students:view-all` + `classes:view-all`. */
const KE_TOAN_PERMS: Perms = [
  { action: "payments:manage", scopeType: "GLOBAL" },
  { action: "students:view-all", scopeType: "GLOBAL" },
];
/** HO_MARKETING (seed-roles.ts:226) neo tại HO ⇒ cross-center theo chức năng. */
const MARKETING_PERMS: Perms = [
  { action: "news:publish", scopeType: "GLOBAL" },
  { action: "classes:view-all", scopeType: "GLOBAL" },
];

describe("[L-A6] kiêm nhiệm — vai KHÁC không nới cổng duyệt hoàn thành khoá", () => {
  it("CA1: QLCS@CS1 kiêm KẾ TOÁN@CS2 → đề xuất CS2 bị từ chối, KHÔNG cấp chứng chỉ", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    // Ghim rằng ca này không tự xanh: vế cũ (nhìn thấy CS2) VẪN cho qua.
    expect(actor.visibleCenterIds).toContain("c2");

    h.resolveActor.mockResolvedValue(actor);
    h.findUnique.mockResolvedValue(pendingRequest("c2"));
    await expect(reviewCourseCompletion(APPROVE)).resolves.toEqual(DENIED_CENTER);
    expect(h.completeCourse).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it("CA2: QLCS@CS1 kiêm MARKETING (⇒ HO_MARKETING@HO) → đề xuất ngoài CS1 bị từ chối", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("ho", "HO_MARKETING", MARKETING_PERMS),
    ]);
    expect(actor.isHoLevel).toBe(true);
    expect(actor.visibleCenterIds).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));

    h.resolveActor.mockResolvedValue(actor);
    h.findUnique.mockResolvedValue(pendingRequest("c3"));
    await expect(reviewCourseCompletion(APPROVE)).resolves.toEqual(DENIED_CENTER);
    expect(h.completeCourse).not.toHaveBeenCalled();

    h.findUnique.mockResolvedValue(pendingRequest("c1"));
    await expect(reviewCourseCompletion(APPROVE)).resolves.toEqual({ ok: true });
  });
});

describe("[L-A6] các vai KHÁC không rộng thêm một ly nào", () => {
  it("GV (TEACHER) → chặn ngay ở cổng vai, dù đề xuất cùng cơ sở", async () => {
    login("u-gv", "TEACHER", "c1");
    h.resolveActor.mockResolvedValue(
      actorOf("u-gv", [
        row("cs1", "TEACHER", [{ action: "completions:propose-own", scopeType: "GLOBAL" }]),
      ]),
    );
    h.findUnique.mockResolvedValue(pendingRequest("c1"));
    await expect(reviewCourseCompletion(APPROVE)).resolves.toEqual(DENIED_ROLE);
    expect(h.completeCourse).not.toHaveBeenCalled();
  });

  it("SALES_CSM cùng cơ sở → từ chối (vai ngoài 2 nhánh)", async () => {
    login("u-sale", "SALES_CSM", "c1");
    h.resolveActor.mockResolvedValue(actorOf("u-sale", [row("cs1", "CENTER_SALES_CSM")]));
    h.findUnique.mockResolvedValue(pendingRequest("c1"));
    await expect(reviewCourseCompletion(APPROVE)).resolves.toEqual(DENIED_ROLE);
    expect(h.completeCourse).not.toHaveBeenCalled();
  });

  it("người giữ CENTER_CLASS_MANAGER (giáo vụ) → vẫn từ chối: không có completions:manage", async () => {
    login("u-gv2", "TEACHER", "c1");
    h.resolveActor.mockResolvedValue(actorOf("u-gv2", [row("cs1", "CENTER_CLASS_MANAGER", [])]));
    h.findUnique.mockResolvedValue(pendingRequest("c1"));
    await expect(reviewCourseCompletion(APPROVE)).resolves.toEqual(DENIED_ROLE);
    expect(h.completeCourse).not.toHaveBeenCalled();
  });

  it("SUPER_ADMIN → duyệt được ở mọi cơ sở (hành vi KHÔNG đổi)", async () => {
    login("u-sa", "SUPER_ADMIN", null);
    h.resolveActor.mockResolvedValue(actorOf("u-sa", [row("ho", "SUPER_ADMIN")]));
    h.findUnique.mockResolvedValue(pendingRequest("c3"));
    await expect(reviewCourseCompletion(APPROVE)).resolves.toEqual({ ok: true });
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it("SUPER_ADMIN → duyệt được cả đề xuất chưa gắn cơ sở (hành vi KHÔNG đổi)", async () => {
    login("u-sa", "SUPER_ADMIN", null);
    h.resolveActor.mockResolvedValue(actorOf("u-sa", [row("ho", "SUPER_ADMIN")]));
    h.findUnique.mockResolvedValue(pendingRequest(null));
    await expect(reviewCourseCompletion(APPROVE)).resolves.toEqual({ ok: true });
  });

  it("chưa đăng nhập → từ chối trước mọi thứ", async () => {
    h.auth.mockResolvedValue(null);
    await expect(reviewCourseCompletion(APPROVE)).resolves.toEqual({
      ok: false,
      error: "Chưa đăng nhập",
    });
    expect(h.completeCourse).not.toHaveBeenCalled();
  });
});
