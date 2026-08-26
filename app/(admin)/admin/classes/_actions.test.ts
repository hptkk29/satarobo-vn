// @vitest-environment node
/**
 * A-01-6 · bất biến **L-A6** — cổng GHI của workflow DUYỆT LỚP (`requireApprover`, dùng
 * chung cho `approveClass` + `rejectClass`) phải đo "cơ sở người này đang QUẢN LÝ", không
 * so với MỘT cơ sở neo (`session.user.centerId` — ảnh chụp lúc đăng nhập, `lib/auth.ts`).
 *
 * Vì sao đúng cổng này: `requireApprover` là cổng DUY NHẤT của hai đường ghi cuối cùng
 * trong vòng đời lớp — duyệt (PENDING_APPROVAL → ACTIVE, kèm sinh buổi + tạo nhóm chat)
 * và trả lại (→ RECRUITING). Một dòng `cls.centerId !== session.user.centerId` ở đây khoá
 * QLCS giữ 2 cơ sở ra khỏi việc duyệt lớp ở cơ sở thứ hai: họ XEM được lớp (A-01 đã mở
 * đường đọc), GỬI DUYỆT được (`submitClassForApproval` đi qua `passesScope`), nhưng lớp
 * nằm mãi ở "Chờ duyệt" mà không ai bấm được nút nào.
 *
 * Ba ca bắt buộc (yêu cầu A-01-6 §2):
 *   1. cơ sở thứ HAI của chính QLCS đó   → CHO
 *   2. cơ sở NGOÀI phạm vi (thứ ba)      → TỪ CHỐI
 *   3. vai khác (TEACHER/SALES_CSM/…)    → KHÔNG rộng thêm một ly nào
 *
 * ⚠️ `scopedDb` CHỈ che đường ĐỌC. Ở đây `scopedDb` được thay bằng client giả **không**
 * lọc gì (`class.findFirst` luôn trả lớp, bất kể cơ sở) — cố ý: nếu cổng ghi chỉ đúng nhờ
 * `scopedDb` chặn hộ thì test này sẽ đỏ, đúng như luật cứng #3 đòi.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgUnitNode } from "@/lib/org/types";
import type { Actor, UserOrgRoleRow } from "@/lib/auth/actor";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveActor: vi.fn(),
  classFindFirst: vi.fn(),
  classFindUnique: vi.fn(),
  enrollmentFindMany: vi.fn(),
  checkPermission: vi.fn(),
  classUpdate: vi.fn(),
  txClassUpdate: vi.fn(),
  genSessions: vi.fn(),
  syncMembership: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  // `lib/settings/read-global` (nạp gián tiếp qua actor.ts) bọc unstable_cache lúc import.
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth/check-permission", () => ({ checkPermission: h.checkPermission }));
// Ghi audit chạy SAU cổng quyền — chặn để test chỉ đo cổng (và để không chạm `@/lib/db`).
vi.mock("@/lib/audit/log", () => ({
  logClassAudit: vi.fn(),
  detectChangedFields: () => ({}),
  getAuditActor: (s: { user?: { id?: string; name?: string } }) => ({
    actorId: s?.user?.id ?? null,
    actorName: s?.user?.name ?? "?",
  }),
}));
// Sinh buổi học + đồng bộ nhóm chat chạy SAU cổng quyền — chặn để test chỉ đo cổng.
vi.mock("@/lib/classes/generate", () => ({ generateClassSessions: h.genSessions }));
vi.mock("@/lib/chat/sync-membership", () => ({ syncConversationMembership: h.syncMembership }));
// Giữ `buildActor` THẬT, chỉ thay đường nạp actor từ DB.
vi.mock("@/lib/auth/actor", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/actor")>();
  return { ...actual, resolveActor: h.resolveActor };
});
// Giữ `passesScope` THẬT (các cổng khác trong file vẫn dùng), chỉ thay client — và client
// giả KHÔNG lọc theo cơ sở, để mọi kết quả dưới đây là do chính cổng quyền quyết định.
vi.mock("@/lib/db-scope", async (orig) => {
  const actual = await orig<typeof import("@/lib/db-scope")>();
  return {
    ...actual,
    scopedDb: () => ({
      class: {
        findFirst: h.classFindFirst,
        findUnique: h.classFindUnique,
        update: h.classUpdate,
      },
      enrollment: { findMany: h.enrollmentFindMany },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ class: { update: h.txClassUpdate } }),
    }),
  };
});

import { buildActor } from "@/lib/auth/actor";
import { passesScope } from "@/lib/db-scope";
import {
  approveClass,
  cancelClassAction,
  deleteClass,
  rejectClass,
  submitClassForApproval,
} from "./_actions";

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
// Bám prefix `classes:` để `getModelVisibleCenterIds("Class", …)` (lib/db-scope.ts) đi
// đường permission thật, không rơi về fallback `isHoLevel ? ALL : visibleCenterIds`.
const CM_PERMS: Perms = [
  { action: "classes:view-all", scopeType: "GLOBAL" },
  { action: "classes:create", scopeType: "GLOBAL" },
  { action: "classes:edit", scopeType: "GLOBAL" },
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

/** Người dùng như JWT trao cho action: `centerId` = cơ sở NEO lúc đăng nhập. */
const cmUser = { id: "u-cm", role: "CENTER_MANAGER", centerId: "c1", name: "QLCS" };

const DENIED = { ok: false, error: "Lớp không thuộc cơ sở của bạn" };
const NOT_APPROVER = { ok: false, error: "Chỉ quản lý cơ sở / SUPER_ADMIN được duyệt" };

/**
 * Nạp sẵn 1 lớp cho cổng đọc. `class.findFirst` giả trả lớp cho MỌI cơ sở — cách ly (nếu
 * có) phải đến từ chính cổng quyền, không phải từ `scopedDb`.
 */
function armClass(
  centerId: string | null,
  over: { status?: string; user?: { id: string; role: string; centerId: string | null } } = {},
) {
  h.auth.mockResolvedValue({ user: over.user ?? cmUser });
  h.classFindFirst.mockResolvedValue({ status: over.status ?? "PENDING_APPROVAL", centerId });
  h.classUpdate.mockResolvedValue({});
  h.txClassUpdate.mockResolvedValue({});
  h.genSessions.mockResolvedValue({ ok: true, generated: 3 });
  h.syncMembership.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.checkPermission.mockResolvedValue(true);
  h.resolveActor.mockResolvedValue(QLCS_HAI_CO_SO());
});

describe("[L-A6] duyệt lớp — QLCS đa cơ sở", () => {
  it("lớp ở cơ sở NEO (c1) → CHO + ghi ACTIVE (không làm hỏng ca đang chạy)", async () => {
    armClass("c1");
    await expect(approveClass("cl-1")).resolves.toEqual({ ok: true });
    expect(h.txClassUpdate).toHaveBeenCalledTimes(1);
    expect(h.txClassUpdate.mock.calls[0][0].data.status).toBe("ACTIVE");
  });

  it("lớp ở cơ sở THỨ HAI (c2) → CHO — đây là ca hôm nay TỪ CHỐI oan", async () => {
    armClass("c2");
    await expect(approveClass("cl-1")).resolves.toEqual({ ok: true });
    expect(h.txClassUpdate.mock.calls[0][0].data.status).toBe("ACTIVE");
  });

  it("lớp ở cơ sở NGOÀI phạm vi (c3) → TỪ CHỐI, KHÔNG ghi gì", async () => {
    armClass("c3");
    await expect(approveClass("cl-1")).resolves.toEqual(DENIED);
    expect(h.txClassUpdate).not.toHaveBeenCalled();
    expect(h.genSessions).not.toHaveBeenCalled();
  });

  it("lớp chưa gắn cơ sở (centerId null) → TỪ CHỐI (fail-closed)", async () => {
    // Hôm nay lọt khi QLCS cũng có `user.centerId = null`; `roleManagesCenter` fail-closed
    // trên `centerId` rỗng — và lớp tại Hội sở vốn đã bị cấm từ lúc tạo/sửa
    // (`rejectHeadOfficeCenter`). SUPER_ADMIN vẫn duyệt được, xem nhóm test cuối.
    armClass(null, { user: { id: "u-cm", role: "CENTER_MANAGER", centerId: null } });
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs1", "CENTER_MANAGER")]));
    await expect(approveClass("cl-1")).resolves.toEqual(DENIED);
    expect(h.txClassUpdate).not.toHaveBeenCalled();
  });

  it("QLCS chỉ MỘT cơ sở → lớp cơ sở khác vẫn TỪ CHỐI (cách ly giữ nguyên)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs1", "CENTER_MANAGER")]));
    armClass("c2");
    await expect(approveClass("cl-1")).resolves.toEqual(DENIED);
    armClass("c1");
    await expect(approveClass("cl-1")).resolves.toEqual({ ok: true });
  });

  it("cơ sở neo LỆCH (JWT c1, vai neo ở c2) → CHO ở c2, TỪ CHỐI ở c1: nguồn sự thật là vai", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs2", "CENTER_MANAGER")]));
    armClass("c2");
    await expect(approveClass("cl-1")).resolves.toEqual({ ok: true });
    armClass("c1");
    await expect(approveClass("cl-1")).resolves.toEqual(DENIED);
  });

  it("QLCS neo tại VÙNG (REGION) → duyệt mọi cơ sở trong vùng, không hơn", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("rg-bac", "CENTER_MANAGER")]));
    armClass("c1");
    await expect(approveClass("cl-1")).resolves.toEqual({ ok: true });
    armClass("c2");
    await expect(approveClass("cl-1")).resolves.toEqual(DENIED);
  });

  // Grant per-user khớp tiền tố model bật `hasAll` trong `getModelVisibleCenterIds`
  // ⇒ `passesScope` trả "ALL" cho MỌI cơ sở. Cổng phải KHÔNG đọc `grantsAllow`: một dòng
  // `UserPermissionGrant` không phải là "được giao quản lý cơ sở".
  it("QLCS 2 cơ sở + grant per-user `classes:edit` → vẫn TỪ CHỐI cơ sở thứ ba", async () => {
    const grantActor = buildActor({
      userId: "u-cm",
      rows: [row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_MANAGER")],
      orgNodes: ORG,
      now: new Date("2026-08-26"),
      grants: [{ action: "classes:edit", grant: "ALLOW" }],
    });
    // Chốt rằng ca này KHÔNG tự xanh: một mình `passesScope` VẪN cho qua cơ sở thứ ba.
    expect(passesScope("Class", { centerId: "c3" }, grantActor)).toBe(true);
    h.resolveActor.mockResolvedValue(grantActor);
    armClass("c3");
    await expect(approveClass("cl-1")).resolves.toEqual(DENIED);
    armClass("c2");
    await expect(approveClass("cl-1")).resolves.toEqual({ ok: true });
  });
});

// ── KIÊM NHIỆM: quyền ĐỌC của vai khác không được mở cổng duyệt ──────────────────
// Mỗi ca dưới đây GHIM luôn "vì sao ca này không tự xanh": khẳng định rằng cả
// `visibleCenterIds` lẫn `passesScope("Class", …)` ĐỀU cho qua, rồi mới đòi cổng TỪ CHỐI.

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

describe("[L-A6] kiêm nhiệm — vai KHÁC không nới cổng duyệt lớp", () => {
  it("CA1: QLCS@CS1 kiêm KẾ TOÁN@CS2 → TỪ CHỐI lớp CS2 (ở đó chỉ là kế toán)", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    expect(actor.visibleCenterIds).toContain("c2");
    expect(passesScope("Class", { centerId: "c2" }, actor)).toBe(true);

    h.resolveActor.mockResolvedValue(actor);
    armClass("c2");
    await expect(approveClass("cl-1")).resolves.toEqual(DENIED);
    expect(h.txClassUpdate).not.toHaveBeenCalled();
    armClass("c1");
    await expect(approveClass("cl-1")).resolves.toEqual({ ok: true });
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
    armClass("c2");
    await expect(approveClass("cl-1")).resolves.toEqual(DENIED);
    armClass("c3");
    await expect(approveClass("cl-1")).resolves.toEqual(DENIED);
    expect(h.txClassUpdate).not.toHaveBeenCalled();
    armClass("c1");
    await expect(approveClass("cl-1")).resolves.toEqual({ ok: true });
  });
});

describe("[L-A6] các vai KHÁC không rộng thêm một ly nào", () => {
  it("SUPER_ADMIN → CHO ở mọi cơ sở, kể cả lớp chưa gắn cơ sở (hành vi không đổi)", async () => {
    const sa = { id: "u-sa", role: "SUPER_ADMIN", centerId: null };
    h.resolveActor.mockResolvedValue(actorOf("u-sa", [row("ho", "SUPER_ADMIN")]));
    armClass("c3", { user: sa });
    await expect(approveClass("cl-1")).resolves.toEqual({ ok: true });
    armClass(null, { user: sa });
    await expect(approveClass("cl-1")).resolves.toEqual({ ok: true });
  });

  it("SALES_CSM cùng cơ sở với lớp → TỪ CHỐI ngay ở vòng vai (không phải người duyệt)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-sale", [row("cs1", "CENTER_SALES_CSM")]));
    armClass("c1", { user: { id: "u-sale", role: "SALES_CSM", centerId: "c1" } });
    await expect(approveClass("cl-1")).resolves.toEqual(NOT_APPROVER);
    expect(h.txClassUpdate).not.toHaveBeenCalled();
  });

  it("TEACHER dạy lớp → vẫn TỪ CHỐI duyệt (nhánh GV không tồn tại ở cổng này)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-gv", [row("cs1", "TEACHER")]));
    armClass("c1", { user: { id: "u-gv", role: "TEACHER", centerId: "c1" } });
    await expect(approveClass("cl-1")).resolves.toEqual(NOT_APPROVER);
  });

  it("TRAINING@HO (HO-level, thấy mọi cơ sở) → TỪ CHỐI (hành vi không đổi)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-dt", [row("ho", "TRAINING")]));
    armClass("c1", { user: { id: "u-dt", role: "TRAINING", centerId: null } });
    await expect(approveClass("cl-1")).resolves.toEqual(NOT_APPROVER);
  });

  it("CENTER_CLASS_MANAGER (Giáo vụ) — vai v2 ngoài APPROVE_ROLES: không mở được cổng", async () => {
    // Vai này có `classes:view-all` nên `passesScope` cho qua, nhưng nó KHÔNG phải
    // CENTER_MANAGER: cả vòng vai (legacy) lẫn `roleManagesCenter` đều đóng.
    const actor = actorOf("u-gv-vu", [row("cs1", "CENTER_CLASS_MANAGER", KE_TOAN_PERMS)]);
    expect(passesScope("Class", { centerId: "c1" }, actor)).toBe(true);
    h.resolveActor.mockResolvedValue(actor);
    armClass("c1", { user: { id: "u-gv-vu", role: "TRAINING", centerId: "c1" } });
    await expect(approveClass("cl-1")).resolves.toEqual(NOT_APPROVER);
  });
});

// ── Đường ghi THỨ HAI của cùng cổng: trả lại lớp ────────────────────────────────

describe("[L-A6] trả lại lớp (rejectClass) — cùng cổng requireApprover", () => {
  it("lớp ở cơ sở THỨ HAI (c2) → CHO + ghi RECRUITING", async () => {
    armClass("c2");
    await expect(rejectClass("cl-1", "Thiếu giáo viên")).resolves.toEqual({ ok: true });
    expect(h.classUpdate).toHaveBeenCalledTimes(1);
    expect(h.classUpdate.mock.calls[0][0].data.status).toBe("RECRUITING");
  });

  it("lớp ở cơ sở NGOÀI phạm vi (c3) → TỪ CHỐI, KHÔNG ghi gì", async () => {
    armClass("c3");
    await expect(rejectClass("cl-1", "Thiếu giáo viên")).resolves.toEqual(DENIED);
    expect(h.classUpdate).not.toHaveBeenCalled();
  });

  it("vai khác (SALES_CSM) → TỪ CHỐI ở vòng vai, KHÔNG ghi gì", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-sale", [row("cs1", "CENTER_SALES_CSM")]));
    armClass("c1", { user: { id: "u-sale", role: "SALES_CSM", centerId: "c1" } });
    await expect(rejectClass("cl-1", "Thiếu giáo viên")).resolves.toEqual(NOT_APPROVER);
    expect(h.classUpdate).not.toHaveBeenCalled();
  });
});

// ── A-01-6d (26/08) — L-A6 áp cho CẢ FILE, không riêng `requireApprover` ───────────
// Bốn cổng GHI còn lại đo cách ly cơ sở bằng `passesScope("Class", …)` MỘT MÌNH — đúng
// phép đo mà khối chú thích của `requireApprover` tuyên bố là hỏng vì nở theo vai kiêm
// nhiệm. Nặng nhất là `cancelClassAction`: cổng thô chỉ là `classes:edit` (CENTER_MANAGER
// giữ nó scope GLOBAL — prisma/seed-roles.ts:431) nên KHÔNG cắt theo cơ sở, toàn bộ cách
// ly phó thác cho `passesScope`.
//
// Fixture cố ý TRÙNG với nhóm "kiêm nhiệm" ở trên: nếu `approveClass("cl-9")` bị chặn mà
// `cancelClassAction("cl-9")` vẫn chạy thì bản vá 26/08 chỉ đóng được một cánh cửa.
const QLCS_KIEM_KE_TOAN = () =>
  actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS)]);

describe("[L-A6] huỷ lớp (cancelClassAction) — cascade nặng nhất của file", () => {
  it("QLCS@CS1 kiêm KẾ TOÁN@CS2 → KHÔNG huỷ được lớp CS2, KHÔNG ghi gì", async () => {
    const actor = QLCS_KIEM_KE_TOAN();
    // Ghim "vì sao ca này không tự xanh": phép đo cũ CHO QUA c2.
    expect(passesScope("Class", { centerId: "c2" }, actor)).toBe(true);
    h.resolveActor.mockResolvedValue(actor);
    h.auth.mockResolvedValue({ user: cmUser });
    h.classFindFirst.mockResolvedValue({ id: "cl-9", name: "Lớp CS2", status: "ACTIVE", centerId: "c2" });
    await expect(cancelClassAction("cl-9", "đổi lịch")).resolves.toEqual({
      ok: false,
      error: "Lớp không tồn tại",
    });
    expect(h.enrollmentFindMany).not.toHaveBeenCalled();
    expect(h.txClassUpdate).not.toHaveBeenCalled();
  });

  it("cơ sở người này THỰC SỰ làm QLCS → cổng cơ sở MỞ (không siết oan)", async () => {
    h.resolveActor.mockResolvedValue(QLCS_KIEM_KE_TOAN());
    h.auth.mockResolvedValue({ user: cmUser });
    // Lớp đã huỷ sẵn: nếu cổng CƠ SỞ đóng thì lỗi là "Lớp không tồn tại"; nhận được lỗi
    // TRẠNG THÁI nghĩa là đã đi qua cổng cơ sở.
    h.classFindFirst.mockResolvedValue({ id: "cl-1", name: "Lớp CS1", status: "CANCELLED", centerId: "c1" });
    await expect(cancelClassAction("cl-1", "đổi lịch")).resolves.toEqual({
      ok: false,
      error: "Lớp đã ở trạng thái đã hủy",
    });
  });

  it("QLCS 2 cơ sở → huỷ được lớp ở cơ sở THỨ HAI", async () => {
    h.auth.mockResolvedValue({ user: cmUser });
    h.classFindFirst.mockResolvedValue({ id: "cl-2", name: "Lớp CS2", status: "CANCELLED", centerId: "c2" });
    await expect(cancelClassAction("cl-2", "đổi lịch")).resolves.toEqual({
      ok: false,
      error: "Lớp đã ở trạng thái đã hủy",
    });
  });

  it("grant per-user `classes:edit` KHÔNG mở cửa cơ sở thứ ba", async () => {
    const grantActor = buildActor({
      userId: "u-cm",
      rows: [row("cs1", "CENTER_MANAGER")],
      orgNodes: ORG,
      now: new Date("2026-08-26"),
      grants: [{ action: "classes:edit", grant: "ALLOW" }],
    });
    // Ghim: `passesScope` một mình trả true cho c3 (grant khớp tiền tố ⇒ hasAll).
    expect(passesScope("Class", { centerId: "c3" }, grantActor)).toBe(true);
    h.resolveActor.mockResolvedValue(grantActor);
    h.auth.mockResolvedValue({ user: cmUser });
    h.classFindFirst.mockResolvedValue({ id: "cl-3", name: "Lớp CS3", status: "ACTIVE", centerId: "c3" });
    await expect(cancelClassAction("cl-3", "đổi lịch")).resolves.toEqual({
      ok: false,
      error: "Lớp không tồn tại",
    });
    expect(h.txClassUpdate).not.toHaveBeenCalled();
  });
});

describe("[L-A6] gửi duyệt lớp (submitClassForApproval) — trục VAI được phép gửi", () => {
  /** Sale cơ sở: `SUBMIT_ROLES` có SALES_CSM ⇒ RoleDef `CENTER_SALES_CSM` (legacy-role-map). */
  const SALE_PERMS: Perms = [{ action: "classes:view-all", scopeType: "GLOBAL" }];
  const armSubmit = (centerId: string, enrollments = 0) =>
    h.classFindFirst.mockResolvedValue({
      status: "PENDING_APPROVAL",
      centerId,
      _count: { enrollments },
    });

  it("QLCS@CS1 kiêm KẾ TOÁN@CS2 → KHÔNG gửi duyệt được lớp CS2", async () => {
    h.resolveActor.mockResolvedValue(QLCS_KIEM_KE_TOAN());
    h.auth.mockResolvedValue({ user: cmUser });
    armSubmit("c2");
    await expect(submitClassForApproval("cl-9")).resolves.toEqual({
      ok: false,
      error: "Lớp không tồn tại",
    });
    expect(h.classUpdate).not.toHaveBeenCalled();
  });

  it("cơ sở mình quản lý → qua cổng cơ sở (dừng ở luật trạng thái)", async () => {
    h.resolveActor.mockResolvedValue(QLCS_KIEM_KE_TOAN());
    h.auth.mockResolvedValue({ user: cmUser });
    armSubmit("c1");
    await expect(submitClassForApproval("cl-1")).resolves.toEqual({
      ok: false,
      error: "Lớp đang PENDING_APPROVAL, không thể gửi duyệt",
    });
  });

  it("SALES_CSM gửi duyệt lớp cơ sở mình → CHO; cơ sở khác → TỪ CHỐI", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-sale", [row("cs1", "CENTER_SALES_CSM", SALE_PERMS)]));
    h.auth.mockResolvedValue({ user: { id: "u-sale", role: "SALES_CSM", centerId: "c1" } });
    armSubmit("c1");
    await expect(submitClassForApproval("cl-1")).resolves.toEqual({
      ok: false,
      error: "Lớp đang PENDING_APPROVAL, không thể gửi duyệt",
    });
    armSubmit("c2");
    await expect(submitClassForApproval("cl-2")).resolves.toEqual({
      ok: false,
      error: "Lớp không tồn tại",
    });
  });
});

describe("[L-A6] xoá lớp (deleteClass) — trục quyền `classes:delete`", () => {
  /** Vai giả định CÓ `classes:delete` tại CS1 (seed thật chưa cấp cho vai nào ⇒ chỉ SUPER_ADMIN). */
  const CM_CO_QUYEN_XOA: Perms = [...CM_PERMS, { action: "classes:delete", scopeType: "GLOBAL" }];

  it("có `classes:delete` tại CS1 nhưng chỉ là KẾ TOÁN ở CS2 → xoá được CS1, KHÔNG xoá được CS2", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER", CM_CO_QUYEN_XOA),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    expect(passesScope("Class", { centerId: "c2" }, actor)).toBe(true);
    h.resolveActor.mockResolvedValue(actor);
    h.auth.mockResolvedValue({ user: cmUser });

    h.classFindUnique.mockResolvedValue({ id: "cl-9", centerId: "c2" });
    await expect(deleteClass("cl-9")).resolves.toEqual({ error: "Không thể xoá lớp này" });
    expect(h.txClassUpdate).not.toHaveBeenCalled();

    h.classFindUnique.mockResolvedValue({ id: "cl-1", centerId: "c1" });
    await expect(deleteClass("cl-1")).resolves.toEqual({});
    expect(h.txClassUpdate).toHaveBeenCalledTimes(1);
  });

  it("SUPER_ADMIN xoá được ở mọi cơ sở (hành vi không đổi)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-sa", [row("ho", "SUPER_ADMIN")]));
    h.auth.mockResolvedValue({ user: { id: "u-sa", role: "SUPER_ADMIN", centerId: null } });
    h.classFindUnique.mockResolvedValue({ id: "cl-3", centerId: "c3" });
    await expect(deleteClass("cl-3")).resolves.toEqual({});
    expect(h.txClassUpdate).toHaveBeenCalledTimes(1);
  });
});
