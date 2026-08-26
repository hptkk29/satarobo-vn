// @vitest-environment node
/**
 * A-01-6 · bất biến **L-A6** — cổng GHI "duyệt đơn từ GV" (`reviewWorkRequest`) phải chấp
 * nhận MỌI cơ sở mà người duyệt đang giữ CHÍNH vai `CENTER_MANAGER`, không so với ĐÚNG MỘT
 * cơ sở neo trên JWT (`session.user.centerId`).
 *
 * ⚠️ Đây là cổng GHI: action đổi `WorkRequest.status` rồi gọi `applyApprovedWorkRequest`
 * (huỷ buổi / gán GV dạy thay — `lib/work-request-apply.ts`). Nó KHÔNG được trông vào
 * `scopedDb` lọc hộ, và cũng không thể: `WorkRequest` nằm trong `SCOPE_EXEMPT`
 * (`lib/db-scope.ts:93-95` — "duyệt gate CENTER_MANAGER + so centerId THỦ CÔNG") nên
 * `sdb.workRequest.findUnique` là pass-through thật sự.
 *
 * ⚠️ VÌ SAO `scopedDb` bị thay bằng client giả KHÔNG lọc gì: để mọi kết quả dưới đây là do
 * CHÍNH cổng quyền quyết định (luật cứng #3). Ở file này việc đó còn phản ánh đúng runtime —
 * xem đoạn `SCOPE_EXEMPT` ở trên.
 *
 * VAI ĐƯỢC XÉT = `CENTER_MANAGER` (không phải vai nào khác), suy từ đúng chuỗi:
 *   `_actions.ts:114` gác bằng `hasRole(session.user, "CENTER_MANAGER")` (enum `Role` v1)
 *   → `lib/auth/legacy-role-map.ts:24` ánh xạ `CENTER_MANAGER → RoleDef "CENTER_MANAGER"`
 *   → `prisma/seed-roles.ts:410` là RoleDef mang tên "Quản lý cơ sở".
 * `CENTER_CLASS_MANAGER` (seed-roles.ts:569) KHÔNG dính đến cổng này: nó không có mặt trong
 * bảng ánh xạ legacy nên `hasRole(...,"CENTER_MANAGER")` không bao giờ đúng cho người giữ nó.
 *
 * Ba ca bắt buộc:
 *   1. cơ sở thứ HAI của chính QLCS đó         → CHO
 *   2. cơ sở NGOÀI phạm vi (thứ ba)            → TỪ CHỐI
 *   3. vai khác (kiêm nhiệm / GV / Sale)       → KHÔNG rộng thêm một ly nào
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgUnitNode } from "@/lib/org/types";
import type { Actor, UserOrgRoleRow } from "@/lib/auth/actor";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveActor: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  apply: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/work-request-apply", () => ({ applyApprovedWorkRequest: h.apply }));
vi.mock("@/lib/auth/actor", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/actor")>();
  return { ...actual, resolveActor: h.resolveActor };
});
vi.mock("@/lib/db-scope", async (orig) => {
  const actual = await orig<typeof import("@/lib/db-scope")>();
  return {
    ...actual,
    // Client giả KHÔNG lọc gì — mọi kết quả là do cổng quyền, không do tầng đọc.
    scopedDb: () => ({ workRequest: { findUnique: h.findUnique, update: h.update } }),
  };
});

import { buildActor } from "@/lib/auth/actor";
import { reviewWorkRequest } from "./_actions";

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
/** Vài quyền thật của "Quản lý cơ sở" (prisma/seed-roles.ts:410+). */
const CM_PERMS: Perms = [
  { action: "sessions:edit", scopeType: "GLOBAL" },
  { action: "attendance:edit", scopeType: "CENTER" },
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

/** Đơn PENDING loại nghỉ cá nhân (không chạm lịch) ở cơ sở `centerId`. */
function pendingRequest(centerId: string | null) {
  return {
    id: "wr-1",
    centerId,
    status: "PENDING",
    kind: "LEAVE",
    classId: null,
    fromDate: new Date("2026-09-01"),
    targetUserId: null,
    reason: "Việc gia đình",
    requesterId: "u-gv",
  };
}

const REJECT = { id: "wr-1", decision: "REJECTED", note: "Không duyệt" };

/** JWT: cổng này đọc vai TỪ session (chưa qua `getFreshGateUser`) — xem viecConLai. */
function login(id: string, role: string, centerId: string | null) {
  h.auth.mockResolvedValue({ user: { id, role, roles: [role], name: "Người duyệt", centerId } });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.update.mockResolvedValue({ id: "wr-1" });
  h.apply.mockResolvedValue({ applied: false });
  login("u-cm", "CENTER_MANAGER", "c1");
  h.resolveActor.mockResolvedValue(QLCS_HAI_CO_SO());
});

const DENIED_CENTER = { ok: false, error: "Đơn thuộc cơ sở khác" };
const DENIED_ROLE = { ok: false, error: "Không có quyền duyệt đơn" };

describe("[L-A6] reviewWorkRequest — QLCS đa cơ sở", () => {
  it("đơn ở cơ sở NEO (c1) → duyệt được (ca đang chạy không hỏng)", async () => {
    h.findUnique.mockResolvedValue(pendingRequest("c1"));
    await expect(reviewWorkRequest(REJECT)).resolves.toEqual({ ok: true });
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it("đơn ở cơ sở THỨ HAI (c2) → duyệt được — ca hôm nay TỪ CHỐI oan", async () => {
    h.findUnique.mockResolvedValue(pendingRequest("c2"));
    await expect(reviewWorkRequest(REJECT)).resolves.toEqual({ ok: true });
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it("đơn ở cơ sở NGOÀI phạm vi (c3) → từ chối, KHÔNG ghi gì", async () => {
    h.findUnique.mockResolvedValue(pendingRequest("c3"));
    await expect(reviewWorkRequest(REJECT)).resolves.toEqual(DENIED_CENTER);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("đơn chưa gắn cơ sở (centerId null) → từ chối (fail-closed)", async () => {
    h.findUnique.mockResolvedValue(pendingRequest(null));
    await expect(reviewWorkRequest(REJECT)).resolves.toEqual(DENIED_CENTER);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("QLCS chỉ MỘT cơ sở → đơn cơ sở khác vẫn từ chối (cách ly giữ nguyên)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs1", "CENTER_MANAGER")]));
    h.findUnique.mockResolvedValue(pendingRequest("c2"));
    await expect(reviewWorkRequest(REJECT)).resolves.toEqual(DENIED_CENTER);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("cơ sở neo LỆCH (JWT c1, vai neo ở c2) → duyệt được ở c2: nguồn sự thật là VAI", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs2", "CENTER_MANAGER")]));
    h.findUnique.mockResolvedValue(pendingRequest("c2"));
    await expect(reviewWorkRequest(REJECT)).resolves.toEqual({ ok: true });
  });

  it("duyệt APPROVED ở cơ sở thứ hai → có áp lên lịch (đường ghi thật chạy tới cuối)", async () => {
    h.findUnique.mockResolvedValue(pendingRequest("c2"));
    h.apply.mockResolvedValue({ applied: true, message: "Đã huỷ buổi 01/09" });
    await expect(
      reviewWorkRequest({ id: "wr-1", decision: "APPROVED", note: null }),
    ).resolves.toEqual({ ok: true, note: "Đã huỷ buổi 01/09" });
    expect(h.apply).toHaveBeenCalledTimes(1);
  });

  it("đơn đã xử lý → từ chối (guard trạng thái giữ nguyên)", async () => {
    h.findUnique.mockResolvedValue({ ...pendingRequest("c2"), status: "APPROVED" });
    await expect(reviewWorkRequest(REJECT)).resolves.toEqual({
      ok: false,
      error: "Đơn đã được xử lý",
    });
    expect(h.update).not.toHaveBeenCalled();
  });
});

// ── KIÊM NHIỆM: quyền ĐỌC của vai khác không được mở cổng DUYỆT ───────────────────
// Hai ca này là lý do KHÔNG được đo bằng `actor.visibleCenterIds` (hoặc `passesScope`):
// cả hai vế đều nở theo vai kiêm nhiệm — xem khối chú thích `lib/auth/managed-centers.ts`.

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

describe("[L-A6] kiêm nhiệm — vai KHÁC không nới cổng duyệt đơn", () => {
  it("CA1: QLCS@CS1 kiêm KẾ TOÁN@CS2 → đơn CS2 bị từ chối, KHÔNG ghi gì", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    // Ghim rằng ca này không tự xanh: vế cũ (nhìn thấy CS2) VẪN cho qua.
    expect(actor.visibleCenterIds).toContain("c2");

    h.resolveActor.mockResolvedValue(actor);
    h.findUnique.mockResolvedValue(pendingRequest("c2"));
    await expect(reviewWorkRequest(REJECT)).resolves.toEqual(DENIED_CENTER);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("CA2: QLCS@CS1 kiêm MARKETING (⇒ HO_MARKETING@HO) → đơn ngoài CS1 bị từ chối", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("ho", "HO_MARKETING", MARKETING_PERMS),
    ]);
    expect(actor.isHoLevel).toBe(true);
    expect(actor.visibleCenterIds).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));

    h.resolveActor.mockResolvedValue(actor);
    h.findUnique.mockResolvedValue(pendingRequest("c3"));
    await expect(reviewWorkRequest(REJECT)).resolves.toEqual(DENIED_CENTER);
    expect(h.update).not.toHaveBeenCalled();

    h.findUnique.mockResolvedValue(pendingRequest("c1"));
    await expect(reviewWorkRequest(REJECT)).resolves.toEqual({ ok: true });
  });
});

describe("[L-A6] các vai KHÁC không rộng thêm một ly nào", () => {
  it("GV (TEACHER) → chặn ngay ở cổng vai, dù đơn cùng cơ sở", async () => {
    login("u-gv", "TEACHER", "c1");
    h.resolveActor.mockResolvedValue(actorOf("u-gv", [row("cs1", "TEACHER")]));
    h.findUnique.mockResolvedValue(pendingRequest("c1"));
    await expect(reviewWorkRequest(REJECT)).resolves.toEqual(DENIED_ROLE);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("SALES_CSM cùng cơ sở với đơn → từ chối (vai ngoài 2 nhánh)", async () => {
    login("u-sale", "SALES_CSM", "c1");
    h.resolveActor.mockResolvedValue(actorOf("u-sale", [row("cs1", "CENTER_SALES_CSM")]));
    h.findUnique.mockResolvedValue(pendingRequest("c1"));
    await expect(reviewWorkRequest(REJECT)).resolves.toEqual(DENIED_ROLE);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("người giữ CENTER_CLASS_MANAGER (giáo vụ) → vẫn từ chối: không ánh xạ sang vai này", async () => {
    login("u-gv2", "TEACHER", "c1");
    h.resolveActor.mockResolvedValue(actorOf("u-gv2", [row("cs1", "CENTER_CLASS_MANAGER")]));
    h.findUnique.mockResolvedValue(pendingRequest("c1"));
    await expect(reviewWorkRequest(REJECT)).resolves.toEqual(DENIED_ROLE);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("SUPER_ADMIN → duyệt được ở mọi cơ sở (hành vi KHÔNG đổi)", async () => {
    login("u-sa", "SUPER_ADMIN", null);
    h.resolveActor.mockResolvedValue(actorOf("u-sa", [row("ho", "SUPER_ADMIN")]));
    h.findUnique.mockResolvedValue(pendingRequest("c3"));
    await expect(reviewWorkRequest(REJECT)).resolves.toEqual({ ok: true });
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it("SUPER_ADMIN → duyệt được cả đơn chưa gắn cơ sở (hành vi KHÔNG đổi)", async () => {
    login("u-sa", "SUPER_ADMIN", null);
    h.resolveActor.mockResolvedValue(actorOf("u-sa", [row("ho", "SUPER_ADMIN")]));
    h.findUnique.mockResolvedValue(pendingRequest(null));
    await expect(reviewWorkRequest(REJECT)).resolves.toEqual({ ok: true });
  });

  it("chưa đăng nhập → từ chối trước mọi thứ", async () => {
    h.auth.mockResolvedValue(null);
    await expect(reviewWorkRequest(REJECT)).resolves.toEqual({
      ok: false,
      error: "Chưa đăng nhập",
    });
    expect(h.update).not.toHaveBeenCalled();
  });
});
