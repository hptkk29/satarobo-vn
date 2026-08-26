// @vitest-environment node
/**
 * A-01-6b · bất biến **L-A6** — cổng GHI "checklist mở/đóng cơ sở" phải chấp nhận MỌI cơ
 * sở mà người này ĐANG GIỮ VAI QLCS, không so với MỘT cơ sở neo (`session.user.centerId`).
 *
 * Vai được nới ở cổng này: **CENTER_MANAGER** (đúng vai mà `hasRole(...)` đang lọc ở
 * `_actions.ts`). Không vai nào khác được rộng thêm một ly.
 *
 * Ba ca bắt buộc:
 *   1. cơ sở thứ HAI của chính QLCS đó  → CHO
 *   2. cơ sở NGOÀI phạm vi (thứ ba)     → TỪ CHỐI
 *   3. vai khác (CENTER_HR/TEACHER)     → KHÔNG rộng thêm một ly nào
 *
 * ⚠️ `scopedDb` bị thay bằng client giả **không lọc gì**, và `checkPermission` mặc định
 * TRẢ TRUE: mọi kết quả dưới đây do CHÍNH cổng cơ sở quyết định, không phải do tầng đọc
 * lọc hộ (luật cứng #3) hay do quyền action chặn hộ. `hr_attendance:view` của QLCS seed
 * scope CENTER, nhưng cổng này không được phép dựa vào đó — cách ly phải tự đứng.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgUnitNode } from "@/lib/org/types";
import type { Actor, UserOrgRoleRow } from "@/lib/auth/actor";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  flagOn: vi.fn(),
  checkPermission: vi.fn(),
  resolveActor: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth/check-permission", () => ({ checkPermission: h.checkPermission }));
vi.mock("@/lib/flags", async (orig) => {
  const actual = await orig<typeof import("@/lib/flags")>();
  return { ...actual, isCenterChecklistEnabled: h.flagOn };
});
vi.mock("@/lib/auth/actor", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/actor")>();
  return { ...actual, resolveActor: h.resolveActor };
});
vi.mock("@/lib/db-scope", async (orig) => {
  const actual = await orig<typeof import("@/lib/db-scope")>();
  return {
    ...actual,
    scopedDb: () => ({ centerDayChecklist: { upsert: h.upsert } }),
  };
});

import { buildActor } from "@/lib/auth/actor";
import { saveCenterChecklist } from "./_actions";

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
/** QLCS: `hr_attendance:view` seed scope CENTER, `adjust` GLOBAL (prisma/seed-roles.ts). */
const CM_PERMS: Perms = [
  { action: "hr_attendance:view", scopeType: "CENTER" },
  { action: "hr_attendance:adjust", scopeType: "GLOBAL" },
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

const INPUT = (centerId: string) => ({
  centerId,
  date: "2026-08-26",
  flags: { openLightsOn: true },
  note: "",
});

function login(id: string, role: string, centerId: string | null) {
  h.auth.mockResolvedValue({ user: { id, role, centerId } });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.flagOn.mockReturnValue(true);
  h.checkPermission.mockResolvedValue(true);
  h.upsert.mockResolvedValue({ id: "chk-1" });
  login("u-cm", "CENTER_MANAGER", "c1");
  h.resolveActor.mockResolvedValue(QLCS_HAI_CO_SO());
});

const DENIED = { ok: false, error: "Cơ sở không thuộc phạm vi của bạn" };

describe("[L-A6] saveCenterChecklist — QLCS đa cơ sở", () => {
  it("cơ sở NEO (c1) → ghi được (không làm hỏng ca đang chạy)", async () => {
    await expect(saveCenterChecklist(INPUT("c1"))).resolves.toEqual({ ok: true });
    expect(h.upsert).toHaveBeenCalledTimes(1);
  });

  it("cơ sở THỨ HAI (c2) → ghi được — ca hôm nay TỪ CHỐI oan", async () => {
    await expect(saveCenterChecklist(INPUT("c2"))).resolves.toEqual({ ok: true });
    expect(h.upsert).toHaveBeenCalledTimes(1);
  });

  it("cơ sở NGOÀI phạm vi (c3) → từ chối, KHÔNG ghi gì", async () => {
    await expect(saveCenterChecklist(INPUT("c3"))).resolves.toEqual(DENIED);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("QLCS chỉ MỘT cơ sở → cơ sở khác vẫn từ chối (cách ly giữ nguyên)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs1", "CENTER_MANAGER")]));
    await expect(saveCenterChecklist(INPUT("c2"))).resolves.toEqual(DENIED);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("cơ sở neo LỆCH (JWT c1, vai neo ở c2) → ghi được ở c2: nguồn sự thật là vai", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs2", "CENTER_MANAGER")]));
    await expect(saveCenterChecklist(INPUT("c2"))).resolves.toEqual({ ok: true });
  });

  it("thứ tự cổng giữ nguyên: thiếu quyền action → 'Không có quyền' TRƯỚC cổng cơ sở", async () => {
    h.checkPermission.mockResolvedValue(false);
    await expect(saveCenterChecklist(INPUT("c1"))).resolves.toEqual({
      ok: false,
      error: "Không có quyền",
    });
    expect(h.upsert).not.toHaveBeenCalled();
  });
});

// ── KIÊM NHIỆM — quyền ĐỌC của vai khác không được mở cổng GHI ──────────────────────
// Hai cách đo đã bị LOẠI: `visibleCenterIds` một mình, và `visibleCenterIds AND
// passesScope` — cả hai vế đều nở theo vai kiêm nhiệm nên phép AND không cắt gì.

/** Kế toán cơ sở: KHÔNG có hr_attendance:view, nhưng vẫn kéo cơ sở vào visibleCenterIds. */
const KE_TOAN_PERMS: Perms = [
  { action: "payments:manage", scopeType: "GLOBAL" },
  { action: "students:view-all", scopeType: "GLOBAL" },
];
/** Nhân sự Hội sở: `hr_attendance:view` GLOBAL tại HO ⇒ centerScope "ALL". */
const HO_HR_PERMS: Perms = [
  { action: "hr_attendance:view", scopeType: "GLOBAL" },
  { action: "employees:view-all", scopeType: "GLOBAL" },
];

describe("[L-A6] kiêm nhiệm — vai KHÁC không nới cổng checklist", () => {
  it("CA1: QLCS@CS1 kiêm KẾ TOÁN@CS2 → checklist CS2 bị từ chối, KHÔNG ghi gì", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    // Ghim rằng ca này không tự xanh: vế đã bị loại (đọc được CS2) VẪN cho qua.
    expect(actor.visibleCenterIds).toContain("c2");

    h.resolveActor.mockResolvedValue(actor);
    await expect(saveCenterChecklist(INPUT("c2"))).resolves.toEqual(DENIED);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("CA2: QLCS@CS1 kiêm NHÂN SỰ HỘI SỞ (neo HO) → mọi cơ sở ngoài CS1 bị từ chối", async () => {
    const actor = actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("ho", "HO_HR", HO_HR_PERMS)]);
    expect(actor.isHoLevel).toBe(true);
    expect(actor.visibleCenterIds).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));

    h.resolveActor.mockResolvedValue(actor);
    await expect(saveCenterChecklist(INPUT("c3"))).resolves.toEqual(DENIED);
    expect(h.upsert).not.toHaveBeenCalled();

    await expect(saveCenterChecklist(INPUT("c1"))).resolves.toEqual({ ok: true });
  });
});

describe("[L-A6] các vai KHÁC không rộng thêm một ly nào", () => {
  it("CENTER_HR: quyết định vẫn HOÀN TOÀN do checkPermission — false ⇒ từ chối", async () => {
    login("u-hr", "CENTER_HR", "c1");
    h.resolveActor.mockResolvedValue(
      actorOf("u-hr", [row("cs1", "CENTER_HR", [{ action: "hr_attendance:view", scopeType: "CENTER" }])]),
    );
    h.checkPermission.mockResolvedValue(false);
    await expect(saveCenterChecklist(INPUT("c2"))).resolves.toEqual({
      ok: false,
      error: "Không có quyền",
    });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("CENTER_HR có quyền ở cơ sở mình → vẫn ghi được (nhánh QLCS không đụng tới)", async () => {
    login("u-hr", "CENTER_HR", "c1");
    h.resolveActor.mockResolvedValue(
      actorOf("u-hr", [row("cs1", "CENTER_HR", [{ action: "hr_attendance:view", scopeType: "CENTER" }])]),
    );
    await expect(saveCenterChecklist(INPUT("c1"))).resolves.toEqual({ ok: true });
  });

  it("TEACHER kiêm tầm nhìn rộng (neo HO) → cổng cơ sở mới KHÔNG cấp gì thêm", async () => {
    login("u-gv", "TEACHER", "c1");
    const actor = actorOf("u-gv", [
      row("cs1", "TEACHER", [{ action: "hr_attendance:checkin", scopeType: "GLOBAL" }]),
      row("ho", "HO_HR", HO_HR_PERMS),
    ]);
    expect(actor.visibleCenterIds).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));
    h.resolveActor.mockResolvedValue(actor);
    h.checkPermission.mockResolvedValue(false);
    await expect(saveCenterChecklist(INPUT("c3"))).resolves.toEqual({
      ok: false,
      error: "Không có quyền",
    });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("SUPER_ADMIN → ghi được ở mọi cơ sở (hành vi KHÔNG đổi)", async () => {
    login("u-sa", "SUPER_ADMIN", null);
    h.resolveActor.mockResolvedValue(actorOf("u-sa", [row("ho", "SUPER_ADMIN")]));
    await expect(saveCenterChecklist(INPUT("c3"))).resolves.toEqual({ ok: true });
  });

  it("cờ tính năng OFF → từ chối trước mọi thứ (cổng gỡ tính năng giữ nguyên)", async () => {
    h.flagOn.mockReturnValue(false);
    await expect(saveCenterChecklist(INPUT("c1"))).resolves.toEqual({
      ok: false,
      error: "Tính năng checklist cơ sở đã tắt",
    });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("chưa đăng nhập → từ chối trước mọi thứ", async () => {
    h.auth.mockResolvedValue(null);
    await expect(saveCenterChecklist(INPUT("c1"))).resolves.toEqual({
      ok: false,
      error: "Chưa đăng nhập",
    });
    expect(h.upsert).not.toHaveBeenCalled();
  });
});
