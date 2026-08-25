// @vitest-environment node
/**
 * A-01-6 · bất biến **L-A6** — cổng GHI của buổi học (điểm danh / bắt đầu / **chốt buổi**)
 * phải chấp nhận MỌI cơ sở trong tầm nhìn của actor, không so với MỘT cơ sở neo
 * (`session.user.centerId` — ảnh chụp lúc đăng nhập, `lib/auth.ts`).
 *
 * Vì sao đúng file này: `canManageSessionClass` là cổng DÙNG CHUNG của cả cụm ghi —
 * `attendance/_actions.ts:99,288` (điểm danh), `assignments/_actions.ts:81`,
 * `exams/_actions.ts:48`, `sessions/[id]/page.tsx:92` (nút sửa) đều gọi nó. Một dòng
 * `cls.centerId === u.centerId` ở đây khoá QLCS giữ 2 cơ sở ra khỏi TOÀN BỘ việc dạy
 * ở cơ sở thứ hai, dù họ XEM được (A-01 đã mở đường đọc).
 *
 * Ba ca bắt buộc (yêu cầu A-01-6 §2):
 *   1. cơ sở thứ HAI của chính QLCS đó  → CHO
 *   2. cơ sở NGOÀI phạm vi (thứ ba)     → TỪ CHỐI
 *   3. vai khác (TEACHER/SALES_CSM)     → KHÔNG rộng thêm một ly nào
 *
 * ⚠️ `scopedDb` CHỈ che đường ĐỌC. Ở nhóm test cuối, `scopedDb` được thay bằng client
 * giả **không** lọc gì — cố ý: nếu cổng ghi chỉ đúng nhờ `scopedDb` chặn hộ thì test
 * này sẽ đỏ, đúng như luật cứng #3 đòi.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgUnitNode } from "@/lib/org/types";
import type { Actor, UserOrgRoleRow } from "@/lib/auth/actor";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  fresh: vi.fn(),
  resolveActor: vi.fn(),
  sessFindUnique: vi.fn(),
  sessUpdate: vi.fn(),
  attCount: vi.fn(),
  attFindMany: vi.fn(),
  fbFindMany: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  // `lib/settings/read-global` (nạp gián tiếp qua actor.ts) bọc unstable_cache lúc import.
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth/fresh-gate-user", () => ({ getFreshGateUser: h.fresh }));
// Logic phiếu nhận xét không liên quan cổng cơ sở — chặn để khỏi kéo cả cụm email/notify.
vi.mock("./_feedback-core", () => ({
  saveSessionFeedbackCore: vi.fn(),
  saveSessionEvalCore: vi.fn(),
}));
// Giữ `buildActor` THẬT, chỉ thay đường nạp actor từ DB.
vi.mock("@/lib/auth/actor", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/actor")>();
  return { ...actual, resolveActor: h.resolveActor };
});
// Giữ `passesScope` THẬT (đây là khuôn cổng ghi dùng lại), chỉ thay client.
vi.mock("@/lib/db-scope", async (orig) => {
  const actual = await orig<typeof import("@/lib/db-scope")>();
  return {
    ...actual,
    scopedDb: () => ({
      classSession: { findUnique: h.sessFindUnique, update: h.sessUpdate },
      attendance: { count: h.attCount, findMany: h.attFindMany },
      studentSessionFeedback: { findMany: h.fbFindMany },
    }),
  };
});

import { buildActor } from "@/lib/auth/actor";
import { passesScope } from "@/lib/db-scope";
import { canManageSessionClass, completeSession, startSession } from "./_actions";

// Cây theo hình CHỐT 11/08/2026: HO → REGION → CENTER (lib/org/org-tree.ts).
// Hai cơ sở của QLCS ở HAI VÙNG khác nhau — fixture mà L-A13 đòi.
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
// Bám prefix `classes:` để `getModelVisibleCenterIds("Class", …)` (lib/db-scope.ts:155-157)
// đi đường permission thật, không rơi về fallback `isHoLevel ? ALL : visibleCenterIds`.
const CM_PERMS: Perms = [
  { action: "classes:view-all", scopeType: "GLOBAL" },
  { action: "classes:edit", scopeType: "GLOBAL" },
  { action: "sessions:edit", scopeType: "GLOBAL" },
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

/** QLCS **thuần** (không SUPER_ADMIN) giữ CS1 + CS2 — hai vùng khác nhau. */
const QLCS_HAI_CO_SO = () =>
  actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_MANAGER")]);

const cls = (centerId: string | null, over: Partial<{ teacherId: string; assistantId: string }> = {}) => ({
  teacherId: over.teacherId ?? "u-gv-khac",
  assistantId: over.assistantId ?? null,
  centerId,
});

/** Người dùng như JWT trao cho action: `centerId` = cơ sở NEO lúc đăng nhập. */
const cmUser = { id: "u-cm", role: "CENTER_MANAGER", centerId: "c1" };

beforeEach(() => {
  vi.clearAllMocks();
  // Mặc định: vai đọc lại từ DB khớp JWT (getFreshGateUser — 19/08).
  h.fresh.mockResolvedValue({
    role: "CENTER_MANAGER",
    roles: ["CENTER_MANAGER"],
    centerId: "c1",
  });
  h.resolveActor.mockResolvedValue(QLCS_HAI_CO_SO());
});

describe("[L-A6] canManageSessionClass — QLCS đa cơ sở", () => {
  it("lớp ở cơ sở NEO (c1) → CHO (không làm hỏng ca đang chạy)", async () => {
    await expect(canManageSessionClass(cmUser, cls("c1"))).resolves.toBe(true);
  });

  it("lớp ở cơ sở THỨ HAI (c2) → CHO — đây là ca hôm nay TỪ CHỐI oan", async () => {
    await expect(canManageSessionClass(cmUser, cls("c2"))).resolves.toBe(true);
  });

  it("lớp ở cơ sở NGOÀI phạm vi (c3) → TỪ CHỐI", async () => {
    await expect(canManageSessionClass(cmUser, cls("c3"))).resolves.toBe(false);
  });

  it("lớp chưa gắn cơ sở (centerId null) → TỪ CHỐI (fail-closed, như hôm nay)", async () => {
    await expect(canManageSessionClass(cmUser, cls(null))).resolves.toBe(false);
  });

  it("QLCS chỉ MỘT cơ sở → lớp cơ sở khác vẫn TỪ CHỐI (cách ly giữ nguyên)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs1", "CENTER_MANAGER")]));
    await expect(canManageSessionClass(cmUser, cls("c2"))).resolves.toBe(false);
    await expect(canManageSessionClass(cmUser, cls("c1"))).resolves.toBe(true);
  });

  it("cơ sở neo LỆCH (JWT c1, vai neo ở c2) → CHO ở c2, TỪ CHỐI ở c1: nguồn sự thật là vai", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs2", "CENTER_MANAGER")]));
    await expect(canManageSessionClass(cmUser, cls("c2"))).resolves.toBe(true);
    await expect(canManageSessionClass(cmUser, cls("c1"))).resolves.toBe(false);
  });

  it("vai QLCS đã bị GỠ trong DB (getFreshGateUser) → TỪ CHỐI dù JWT còn vai", async () => {
    h.fresh.mockResolvedValue({ role: "SALES_CSM", roles: ["SALES_CSM"], centerId: "c1" });
    await expect(canManageSessionClass(cmUser, cls("c1"))).resolves.toBe(false);
  });

  // Grant per-user khớp tiền tố model bật `hasAll` trong `getModelVisibleCenterIds`
  // (lib/db-scope.ts:248-253) ⇒ `passesScope` trả "ALL" cho MỌI cơ sở. Cổng phải KHÔNG
  // đọc `grantsAllow`: một dòng `UserPermissionGrant` không phải là "được giao quản lý
  // cơ sở", và nếu nó lọt vào thì cổng GHI của buổi học thành toàn hệ thống.
  it("QLCS 2 cơ sở + grant per-user `classes:edit` → vẫn TỪ CHỐI cơ sở thứ ba", async () => {
    const grantActor = buildActor({
      userId: "u-cm",
      rows: [row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_MANAGER")],
      orgNodes: ORG,
      now: new Date("2026-08-25"),
      grants: [{ action: "classes:edit", grant: "ALLOW" }],
    });
    // Chốt rằng ca này KHÔNG tự xanh: một mình `passesScope` VẪN cho qua cơ sở thứ ba.
    expect(passesScope("Class", { centerId: "c3" }, grantActor)).toBe(true);
    h.resolveActor.mockResolvedValue(grantActor);
    await expect(canManageSessionClass(cmUser, cls("c3"))).resolves.toBe(false);
    await expect(canManageSessionClass(cmUser, cls("c2"))).resolves.toBe(true);
  });
});

// ── A-01-6b (26/08) — KIÊM NHIỆM: quyền ĐỌC của vai khác không được mở cổng GHI ────
// Bản A-01-6 đo bằng `visibleCenterIds` AND `passesScope("Class", …)`. Cả hai vế đều nở
// theo vai kiêm nhiệm nên phép AND không cắt gì. Mỗi ca dưới đây GHIM luôn "vì sao ca này
// không tự xanh": khẳng định rằng CẢ HAI vế cũ đều CHO QUA, rồi mới đòi cổng TỪ CHỐI.

/** Kế toán cơ sở mang `students:view-all` + `classes:view-all` (prisma/seed-roles.ts). */
const KE_TOAN_PERMS: Perms = [
  { action: "payments:manage", scopeType: "GLOBAL" },
  { action: "students:view-all", scopeType: "GLOBAL" },
  { action: "classes:view-all", scopeType: "GLOBAL" },
];
/** HO_MARKETING mang `classes:view-all` + `students:view-all` GLOBAL (seed-roles.ts). */
const MARKETING_PERMS: Perms = [
  { action: "news:publish", scopeType: "GLOBAL" },
  { action: "students:view-all", scopeType: "GLOBAL" },
  { action: "classes:view-all", scopeType: "GLOBAL" },
];

describe("[L-A6] kiêm nhiệm — vai KHÁC không nới cổng GHI của buổi học", () => {
  it("CA1: QLCS@CS1 kiêm KẾ TOÁN@CS2 → TỪ CHỐI lớp CS2 (ở đó chỉ là kế toán)", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    // Hai vế của bản 25/08 ĐỀU cho qua c2 → ca này chỉ xanh nhờ phép đo mới.
    expect(actor.visibleCenterIds).toContain("c2");
    expect(passesScope("Class", { centerId: "c2" }, actor)).toBe(true);

    h.resolveActor.mockResolvedValue(actor);
    await expect(canManageSessionClass(cmUser, cls("c2"))).resolves.toBe(false);
    await expect(canManageSessionClass(cmUser, cls("c1"))).resolves.toBe(true);
  });

  it("CA2: QLCS@CS1 kiêm MARKETING (⇒ HO_MARKETING@HO) → TỪ CHỐI mọi cơ sở ngoài CS1", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("ho", "HO_MARKETING", MARKETING_PERMS),
    ]);
    // Vai neo ở HO ⇒ `isHoLevel` ⇒ vế (1) = MỌI cơ sở, vế (2) = "ALL". AND không cắt gì.
    expect(actor.isHoLevel).toBe(true);
    expect(actor.visibleCenterIds).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));
    expect(passesScope("Class", { centerId: "c3" }, actor)).toBe(true);

    h.resolveActor.mockResolvedValue(actor);
    await expect(canManageSessionClass(cmUser, cls("c2"))).resolves.toBe(false);
    await expect(canManageSessionClass(cmUser, cls("c3"))).resolves.toBe(false);
    await expect(canManageSessionClass(cmUser, cls("c1"))).resolves.toBe(true);
  });

  it("CA2 đường GHI thật: chốt buổi ở cơ sở chỉ 'thấy nhờ vai HO' → từ chối, KHÔNG ghi gì", async () => {
    h.resolveActor.mockResolvedValue(
      actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("ho", "HO_MARKETING", MARKETING_PERMS)]),
    );
    armSession("c2");
    await expect(completeSession("sess-1")).resolves.toEqual({
      ok: false,
      error: "Không có quyền thao tác buổi học này",
    });
    expect(h.sessUpdate).not.toHaveBeenCalled();
  });

  it("QLCS neo tại VÙNG (REGION) → quản lý mọi cơ sở trong vùng, không hơn", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("rg-bac", "CENTER_MANAGER")]));
    await expect(canManageSessionClass(cmUser, cls("c1"))).resolves.toBe(true);
    await expect(canManageSessionClass(cmUser, cls("c2"))).resolves.toBe(false);
  });
});

describe("[L-A6] các vai KHÁC không rộng thêm một ly nào", () => {
  it("GV chính của lớp → CHO (nhánh TEACHER giữ nguyên, kể cả lớp ngoài cơ sở neo)", async () => {
    h.fresh.mockResolvedValue({ role: "TEACHER", roles: ["TEACHER"], centerId: "c1" });
    h.resolveActor.mockResolvedValue(actorOf("u-gv", [row("cs1", "TEACHER")]));
    const gv = { id: "u-gv", role: "TEACHER", centerId: "c1" };
    await expect(canManageSessionClass(gv, cls("c2", { teacherId: "u-gv" }))).resolves.toBe(true);
  });

  it("GV KHÔNG dạy lớp, dù lớp CÙNG cơ sở → TỪ CHỐI (không hưởng tầm nhìn cơ sở)", async () => {
    h.fresh.mockResolvedValue({ role: "TEACHER", roles: ["TEACHER"], centerId: "c1" });
    h.resolveActor.mockResolvedValue(actorOf("u-gv", [row("cs1", "TEACHER")]));
    const gv = { id: "u-gv", role: "TEACHER", centerId: "c1" };
    await expect(canManageSessionClass(gv, cls("c1"))).resolves.toBe(false);
  });

  it("SALES_CSM cùng cơ sở với lớp → TỪ CHỐI (vai ngoài 3 nhánh)", async () => {
    h.fresh.mockResolvedValue({ role: "SALES_CSM", roles: ["SALES_CSM"], centerId: "c1" });
    h.resolveActor.mockResolvedValue(actorOf("u-sale", [row("cs1", "CENTER_SALES_CSM")]));
    const sale = { id: "u-sale", role: "SALES_CSM", centerId: "c1" };
    await expect(canManageSessionClass(sale, cls("c1"))).resolves.toBe(false);
  });

  it("TRAINING@HO (HO-level, không phải QLCS/GV) → TỪ CHỐI (hành vi không đổi)", async () => {
    h.fresh.mockResolvedValue({ role: "TRAINING", roles: ["TRAINING"], centerId: null });
    h.resolveActor.mockResolvedValue(actorOf("u-dt", [row("ho", "TRAINING")]));
    const dt = { id: "u-dt", role: "TRAINING", centerId: null };
    await expect(canManageSessionClass(dt, cls("c1"))).resolves.toBe(false);
  });

  it("SUPER_ADMIN → CHO ở mọi cơ sở, không cần hỏi actor (hành vi không đổi)", async () => {
    h.fresh.mockResolvedValue({ role: "SUPER_ADMIN", roles: ["SUPER_ADMIN"], centerId: null });
    const sa = { id: "u-sa", role: "SUPER_ADMIN", centerId: null };
    await expect(canManageSessionClass(sa, cls("c3"))).resolves.toBe(true);
    expect(h.resolveActor).not.toHaveBeenCalled();
  });
});

// ── Đường GHI thật: bắt đầu buổi + CHỐT buổi ở cơ sở thứ hai ────────────────────
// `scopedDb` bị thay bằng client giả KHÔNG lọc gì → mọi kết quả dưới đây là do
// chính cổng quyền quyết định, không phải do scopedDb chặn hộ (luật cứng #3).

function armSession(centerId: string, status: "SCHEDULED" | "IN_PROGRESS" = "IN_PROGRESS") {
  h.auth.mockResolvedValue({ user: { id: "u-cm", role: "CENTER_MANAGER", centerId: "c1" } });
  h.sessFindUnique.mockImplementation(async (args: { select?: Record<string, unknown> }) =>
    args?.select && "class" in args.select
      ? {
          id: "sess-1",
          centerId,
          lessonId: "l-1",
          status,
          class: { id: "cl-1", teacherId: "u-gv-khac", assistantId: null, centerId },
        }
      : { centerId, ckLessonConfirmed: true },
  );
  h.attCount.mockResolvedValue(2);
  h.attFindMany.mockResolvedValue([{ studentId: "s-1" }, { studentId: "s-2" }]);
  h.fbFindMany.mockResolvedValue([{ studentId: "s-1" }, { studentId: "s-2" }]);
  h.sessUpdate.mockResolvedValue({});
}

describe("[L-A6] chốt buổi / bắt đầu buổi ở cơ sở thứ hai", () => {
  it("completeSession lớp cơ sở THỨ HAI (c2) → ok + ghi COMPLETED", async () => {
    armSession("c2");
    await expect(completeSession("sess-1")).resolves.toEqual({ ok: true });
    expect(h.sessUpdate).toHaveBeenCalledTimes(1);
    expect(h.sessUpdate.mock.calls[0][0].data.status).toBe("COMPLETED");
  });

  it("completeSession lớp cơ sở NGOÀI phạm vi (c3) → từ chối, KHÔNG ghi gì", async () => {
    armSession("c3");
    await expect(completeSession("sess-1")).resolves.toEqual({
      ok: false,
      error: "Không có quyền thao tác buổi học này",
    });
    expect(h.sessUpdate).not.toHaveBeenCalled();
  });

  it("startSession lớp cơ sở THỨ HAI (c2) → ok + IN_PROGRESS", async () => {
    armSession("c2", "SCHEDULED");
    await expect(startSession("sess-1")).resolves.toEqual({ ok: true });
    expect(h.sessUpdate.mock.calls[0][0].data.status).toBe("IN_PROGRESS");
  });

  it("startSession lớp cơ sở NGOÀI phạm vi (c3) → từ chối, KHÔNG ghi gì", async () => {
    armSession("c3", "SCHEDULED");
    await expect(startSession("sess-1")).resolves.toEqual({
      ok: false,
      error: "Không có quyền thao tác buổi học này",
    });
    expect(h.sessUpdate).not.toHaveBeenCalled();
  });
});
