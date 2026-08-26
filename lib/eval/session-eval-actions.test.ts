// @vitest-environment node
/**
 * A-01-6 · bất biến **L-A6** — hai cổng của phiếu ĐÁNH GIÁ BUỔI HỌC (SESSION_EVAL)
 * phải chấp nhận MỌI cơ sở mà người này đang GIỮ VAI `CENTER_MANAGER`, chứ không so với
 * MỘT cơ sở neo (`session.user.centerId` / `User.centerId` — xem `lib/auth.ts`).
 *
 * Hai cổng trong `lib/eval/session-eval-actions.ts`:
 *   · `gateFill`      — buổi LỚP CHÍNH (ClassSession),      dùng cho load + **save**
 *   · `gateTrialFill` — buổi LỚP TRẢI NGHIỆM (TrialClassSession), dùng cho load + **save**
 * Cả hai đều là cổng của đường GHI (`saveSessionEvalAction` / `saveTrialSessionEvalAction`
 * gọi thẳng chúng), nên mỗi ca dưới đây đều đo qua ĐƯỜNG GHI THẬT và khẳng định
 * `saveSessionEvalResponses` / `saveTrialSessionEvalResponses` KHÔNG được gọi khi từ chối.
 *
 * Ba ca bắt buộc cho MỖI cổng:
 *   1. cơ sở thứ HAI của chính QLCS đó  → CHO
 *   2. cơ sở NGOÀI phạm vi (thứ ba)     → TỪ CHỐI
 *   3. vai khác (TEACHER/SALES_CSM/TRAINING/SUPER_ADMIN) → KHÔNG rộng thêm một ly nào
 *
 * ⚠️ GHIM "không có tầng đọc lọc hộ": file nguồn đọc bằng `db` TRẦN (không `scopedDb`),
 * nên lớp cách ly cơ sở duy nhất của đường này chính là hai cổng trên. Ở đây `db` và
 * `getSessionRosterStudentIds` được thay bằng bản giả KHÔNG lọc gì — trả buổi/roster đầy
 * đủ bất kể actor — để mọi kết quả là do CHÍNH cổng quyền quyết định (luật cứng #3).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgUnitNode } from "@/lib/org/types";
import type { Actor, UserOrgRoleRow } from "@/lib/auth/actor";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  fresh: vi.fn(),
  resolveActor: vi.fn(),
  sessFindUnique: vi.fn(),
  trialSessFindUnique: vi.fn(),
  trialEnrollFindMany: vi.fn(),
  roster: vi.fn(),
  evalState: vi.fn(),
  trialEvalState: vi.fn(),
  saveResponses: vi.fn(),
  saveTrialResponses: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  // `lib/settings/read-global` (nạp gián tiếp qua actor.ts) bọc unstable_cache lúc import.
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
// Client giả KHÔNG lọc gì: buổi luôn đọc ra được, dù actor không thấy cơ sở đó.
vi.mock("@/lib/db", () => ({
  db: {
    classSession: { findUnique: h.sessFindUnique },
    trialClassSession: { findUnique: h.trialSessFindUnique },
    trialEnrollment: { findMany: h.trialEnrollFindMany },
  },
}));
vi.mock("@/lib/auth/fresh-gate-user", () => ({ getFreshGateUser: h.fresh }));
// Roster giả KHÔNG lọc gì — guard SEC-M02 luôn cho qua, để ca đỏ/xanh chỉ do cổng cơ sở.
vi.mock("@/lib/attendance/roster", () => ({ getSessionRosterStudentIds: h.roster }));
vi.mock("@/lib/eval/session-eval", () => ({
  getSessionEvalState: h.evalState,
  getTrialSessionEvalState: h.trialEvalState,
  saveSessionEvalResponses: h.saveResponses,
  saveTrialSessionEvalResponses: h.saveTrialResponses,
}));
// Giữ `buildActor` THẬT, chỉ thay đường nạp actor từ DB.
vi.mock("@/lib/auth/actor", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/actor")>();
  return { ...actual, resolveActor: h.resolveActor };
});

import { buildActor } from "@/lib/auth/actor";
import {
  loadSessionEvalAction,
  loadTrialSessionEvalAction,
  saveSessionEvalAction,
  saveTrialSessionEvalAction,
} from "./session-eval-actions";

// Cây theo hình CHỐT 11/08/2026: HO → REGION → CENTER (lib/org/org-tree.ts).
// Hai cơ sở của QLCS ở HAI VÙNG khác nhau — fixture mà L-A13 đòi.
const ORG: OrgUnitNode[] = [
  { id: "ho", code: "HO", type: "HO", parentId: null, centerId: null },
  { id: "rg-bac", code: "RG-BAC", type: "REGION", parentId: "ho", centerId: null },
  { id: "rg-nam", code: "RG-NAM", type: "REGION", parentId: "ho", centerId: null },
  { id: "rg-trung", code: "RG-TRUNG", type: "REGION", parentId: "ho", centerId: null },
  { id: "cs1", code: "CS1", type: "CENTER", parentId: "rg-bac", centerId: "c1" },
  { id: "cs1b", code: "CS1B", type: "CENTER", parentId: "rg-bac", centerId: "c1b" },
  { id: "cs2", code: "CS2", type: "CENTER", parentId: "rg-nam", centerId: "c2" },
  { id: "cs3", code: "CS3", type: "CENTER", parentId: "rg-trung", centerId: "c3" },
];

type Perms = UserOrgRoleRow["role"]["permissions"];
const CM_PERMS: Perms = [
  { action: "classes:view-all", scopeType: "GLOBAL" },
  { action: "classes:edit", scopeType: "GLOBAL" },
  { action: "students:view-all", scopeType: "GLOBAL" },
];
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
function loginAs(id: string, role: string, centerId: string | null, roles?: string[]) {
  h.auth.mockResolvedValue({ user: { id, role, centerId } });
  h.fresh.mockResolvedValue({ role, roles: roles ?? [role], centerId });
}

/** Buổi LỚP CHÍNH ở cơ sở `centerId`, GV là người khác trừ khi nói ngược lại. */
function armSession(
  centerId: string | null,
  over: Partial<{ teacherId: string | null; assistantId: string | null }> = {},
) {
  h.sessFindUnique.mockResolvedValue({
    id: "sess-1",
    class: {
      teacherId: over.teacherId ?? "u-gv-khac",
      assistantId: over.assistantId ?? null,
      centerId,
    },
  });
}

/** Buổi LỚP TRẢI NGHIỆM ở cơ sở `centerId`. */
function armTrialSession(
  centerId: string | null,
  over: Partial<{ teacherId: string | null; assistantId: string | null; sessionTeacherId: string | null }> = {},
) {
  h.trialSessFindUnique.mockResolvedValue({
    id: "tsess-1",
    teacherId: over.sessionTeacherId ?? "u-gv-khac",
    trialClassId: "tcl-1",
    trialClass: {
      teacherId: over.teacherId ?? "u-gv-khac",
      assistantId: over.assistantId ?? null,
      centerId,
    },
  });
}

const SAVE_INPUT = {
  sessionId: "sess-1",
  roundId: "r-1",
  submissions: [{ studentId: "s-1", answers: [{ questionId: "q-1", valueNumber: 4 }] }],
};
const SAVE_TRIAL_INPUT = {
  trialSessionId: "tsess-1",
  roundId: "r-1",
  submissions: [{ studentId: "lc-1", answers: [{ questionId: "q-1", valueNumber: 4 }] }],
};

const DENY_CLASS = "Không có quyền điền phiếu buổi học này";
const DENY_TRIAL = "Không có quyền điền phiếu buổi học thử này";

beforeEach(() => {
  vi.clearAllMocks();
  loginAs("u-cm", "CENTER_MANAGER", "c1");
  h.resolveActor.mockResolvedValue(QLCS_HAI_CO_SO());
  armSession("c1");
  armTrialSession("c1");
  h.roster.mockResolvedValue(new Set(["s-1"]));
  h.trialEnrollFindMany.mockResolvedValue([{ id: "te-1", leadChildId: "lc-1" }]);
  const state = {
    active: true as const,
    roundId: "r-1",
    roundName: "Đợt 1",
    formId: "f-1",
    formTitle: "Phiếu buổi",
    questions: [],
    answersByStudent: {},
  };
  h.evalState.mockResolvedValue(state);
  h.trialEvalState.mockResolvedValue(state);
  h.saveResponses.mockResolvedValue({ ok: true, saved: 1 });
  h.saveTrialResponses.mockResolvedValue({ ok: true, saved: 1 });
});

// ── Cổng 1: gateFill — buổi LỚP CHÍNH (đo qua saveSessionEvalAction, đường GHI) ──

describe("[L-A6] phiếu đánh giá buổi LỚP CHÍNH — QLCS đa cơ sở", () => {
  it("buổi ở cơ sở NEO (c1) → CHO + ghi thật (không làm hỏng ca đang chạy)", async () => {
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: true,
      data: { saved: 1 },
    });
    expect(h.saveResponses).toHaveBeenCalledTimes(1);
  });

  it("buổi ở cơ sở THỨ HAI (c2) → CHO — đây là ca hôm nay TỪ CHỐI oan", async () => {
    armSession("c2");
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: true,
      data: { saved: 1 },
    });
    expect(h.saveResponses).toHaveBeenCalledTimes(1);
  });

  it("buổi ở cơ sở NGOÀI phạm vi (c3) → TỪ CHỐI, KHÔNG ghi gì", async () => {
    armSession("c3");
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: false,
      error: DENY_CLASS,
    });
    expect(h.saveResponses).not.toHaveBeenCalled();
  });

  it("lớp chưa gắn cơ sở (centerId null) → TỪ CHỐI (fail-closed, như hôm nay)", async () => {
    armSession(null);
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: false,
      error: DENY_CLASS,
    });
    expect(h.saveResponses).not.toHaveBeenCalled();
  });

  it("QLCS chỉ MỘT cơ sở → buổi cơ sở khác vẫn TỪ CHỐI (cách ly giữ nguyên)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs1", "CENTER_MANAGER")]));
    armSession("c2");
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: false,
      error: DENY_CLASS,
    });
  });

  it("QLCS neo tại VÙNG (REGION) → mọi cơ sở trong vùng, không hơn", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("rg-bac", "CENTER_MANAGER")]));
    armSession("c1b");
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: true,
      data: { saved: 1 },
    });
    armSession("c2");
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: false,
      error: DENY_CLASS,
    });
  });

  it("vai QLCS đã bị GỠ trong DB (getFreshGateUser) → TỪ CHỐI dù JWT còn vai", async () => {
    h.fresh.mockResolvedValue({ role: "SALES_CSM", roles: ["SALES_CSM"], centerId: "c1" });
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: false,
      error: DENY_CLASS,
    });
  });

  it("loadSessionEvalAction đi CÙNG một cổng: c2 CHO, c3 TỪ CHỐI", async () => {
    armSession("c2");
    await expect(loadSessionEvalAction("sess-1")).resolves.toMatchObject({ ok: true });
    armSession("c3");
    await expect(loadSessionEvalAction("sess-1")).resolves.toEqual({
      ok: false,
      error: DENY_CLASS,
    });
  });

  // Grant per-user khớp tiền tố model bật `hasAll` trong `getModelVisibleCenterIds`
  // (lib/db-scope.ts) ⇒ `passesScope` trả "ALL" cho MỌI cơ sở. Cổng phải KHÔNG đọc
  // `grantsAllow`: một dòng `UserPermissionGrant` không phải là "được giao quản lý cơ sở".
  it("QLCS 2 cơ sở + grant per-user `classes:edit` → vẫn TỪ CHỐI cơ sở thứ ba", async () => {
    h.resolveActor.mockResolvedValue(
      buildActor({
        userId: "u-cm",
        rows: [row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_MANAGER")],
        orgNodes: ORG,
        now: new Date("2026-08-26"),
        grants: [{ action: "classes:edit", grant: "ALLOW" }],
      }),
    );
    armSession("c3");
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: false,
      error: DENY_CLASS,
    });
    expect(h.saveResponses).not.toHaveBeenCalled();
  });
});

// ── KIÊM NHIỆM: quyền ĐỌC của vai khác không được mở cổng GHI ───────────────────
// Bản 25/08 đo bằng `visibleCenterIds` AND `passesScope`. Cả hai vế đều nở theo vai kiêm
// nhiệm nên phép AND không cắt gì (khối chú thích đầu `lib/auth/managed-centers.ts`).

describe("[L-A6] kiêm nhiệm — vai KHÁC không nới cổng phiếu buổi LỚP CHÍNH", () => {
  it("CA1: QLCS@CS1 kiêm KẾ TOÁN@CS2 → TỪ CHỐI buổi CS2 (ở đó chỉ là kế toán)", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    // Vế `visibleCenterIds` của bản 25/08 CHO QUA c2 → ca này chỉ xanh nhờ phép đo mới.
    expect(actor.visibleCenterIds).toContain("c2");

    h.resolveActor.mockResolvedValue(actor);
    armSession("c2");
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: false,
      error: DENY_CLASS,
    });
    expect(h.saveResponses).not.toHaveBeenCalled();

    armSession("c1");
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: true,
      data: { saved: 1 },
    });
  });

  it("CA2: QLCS@CS1 kiêm MARKETING (⇒ HO_MARKETING@HO) → TỪ CHỐI mọi cơ sở ngoài CS1", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("ho", "HO_MARKETING", MARKETING_PERMS),
    ]);
    // Vai neo ở HO ⇒ `isHoLevel` ⇒ vế `visibleCenterIds` = MỌI cơ sở.
    expect(actor.isHoLevel).toBe(true);
    expect(actor.visibleCenterIds).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));

    h.resolveActor.mockResolvedValue(actor);
    for (const c of ["c2", "c3"]) {
      armSession(c);
      await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
        ok: false,
        error: DENY_CLASS,
      });
    }
    expect(h.saveResponses).not.toHaveBeenCalled();

    armSession("c1");
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: true,
      data: { saved: 1 },
    });
  });
});

describe("[L-A6] buổi LỚP CHÍNH — các vai KHÁC không rộng thêm một ly nào", () => {
  it("GV chính của lớp → CHO (nhánh TEACHER giữ nguyên, kể cả lớp ngoài cơ sở neo)", async () => {
    loginAs("u-gv", "TEACHER", "c1");
    h.resolveActor.mockResolvedValue(actorOf("u-gv", [row("cs1", "TEACHER")]));
    armSession("c2", { teacherId: "u-gv" });
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: true,
      data: { saved: 1 },
    });
  });

  it("GV KHÔNG dạy lớp, dù lớp CÙNG cơ sở → TỪ CHỐI (không hưởng tầm nhìn cơ sở)", async () => {
    loginAs("u-gv", "TEACHER", "c1");
    h.resolveActor.mockResolvedValue(actorOf("u-gv", [row("cs1", "TEACHER")]));
    armSession("c1");
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: false,
      error: DENY_CLASS,
    });
    expect(h.saveResponses).not.toHaveBeenCalled();
  });

  it("GV giữ THÊM vai QLCS ở CS1 → lớp mình dạy ở CS2 vẫn CHO (nhánh GV không bị siết)", async () => {
    loginAs("u-gv", "TEACHER", "c1", ["TEACHER", "CENTER_MANAGER"]);
    h.resolveActor.mockResolvedValue(
      actorOf("u-gv", [row("cs1", "CENTER_MANAGER"), row("cs1", "TEACHER")]),
    );
    armSession("c2", { teacherId: "u-gv" });
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: true,
      data: { saved: 1 },
    });
  });

  it("SALES_CSM cùng cơ sở với lớp → TỪ CHỐI (vai ngoài 4 nhánh)", async () => {
    loginAs("u-sale", "SALES_CSM", "c1");
    h.resolveActor.mockResolvedValue(actorOf("u-sale", [row("cs1", "CENTER_SALES_CSM")]));
    armSession("c1");
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: false,
      error: DENY_CLASS,
    });
  });

  it("TRAINING → CHO ở mọi cơ sở (hành vi KHÔNG đổi: Đào tạo điền/sửa hộ)", async () => {
    loginAs("u-dt", "TRAINING", null);
    armSession("c3");
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: true,
      data: { saved: 1 },
    });
  });

  it("SUPER_ADMIN → CHO ở mọi cơ sở, không cần hỏi actor (hành vi không đổi)", async () => {
    loginAs("u-sa", "SUPER_ADMIN", null);
    armSession("c3");
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: true,
      data: { saved: 1 },
    });
    expect(h.resolveActor).toHaveBeenCalledTimes(1); // chỉ lần cho guard roster, không cho gate
  });

  it("chưa đăng nhập → TỪ CHỐI", async () => {
    h.auth.mockResolvedValue(null);
    await expect(saveSessionEvalAction(SAVE_INPUT)).resolves.toEqual({
      ok: false,
      error: "Chưa đăng nhập",
    });
    expect(h.saveResponses).not.toHaveBeenCalled();
  });
});

// ── Cổng 2: gateTrialFill — buổi LỚP TRẢI NGHIỆM (đo qua saveTrialSessionEvalAction) ──

describe("[L-A6] phiếu đánh giá buổi LỚP TRẢI NGHIỆM — QLCS đa cơ sở", () => {
  it("buổi ở cơ sở NEO (c1) → CHO + ghi thật", async () => {
    await expect(saveTrialSessionEvalAction(SAVE_TRIAL_INPUT)).resolves.toEqual({
      ok: true,
      data: { saved: 1 },
    });
    expect(h.saveTrialResponses).toHaveBeenCalledTimes(1);
  });

  it("buổi ở cơ sở THỨ HAI (c2) → CHO — ca hôm nay TỪ CHỐI oan", async () => {
    armTrialSession("c2");
    await expect(saveTrialSessionEvalAction(SAVE_TRIAL_INPUT)).resolves.toEqual({
      ok: true,
      data: { saved: 1 },
    });
    expect(h.saveTrialResponses).toHaveBeenCalledTimes(1);
  });

  it("buổi ở cơ sở NGOÀI phạm vi (c3) → TỪ CHỐI, KHÔNG ghi gì", async () => {
    armTrialSession("c3");
    await expect(saveTrialSessionEvalAction(SAVE_TRIAL_INPUT)).resolves.toEqual({
      ok: false,
      error: DENY_TRIAL,
    });
    expect(h.saveTrialResponses).not.toHaveBeenCalled();
  });

  it("lớp trải nghiệm chưa gắn cơ sở (null) → TỪ CHỐI (fail-closed)", async () => {
    armTrialSession(null);
    await expect(saveTrialSessionEvalAction(SAVE_TRIAL_INPUT)).resolves.toEqual({
      ok: false,
      error: DENY_TRIAL,
    });
  });

  it("loadTrialSessionEvalAction đi CÙNG một cổng: c2 CHO, c3 TỪ CHỐI", async () => {
    armTrialSession("c2");
    await expect(loadTrialSessionEvalAction("tsess-1")).resolves.toMatchObject({ ok: true });
    armTrialSession("c3");
    await expect(loadTrialSessionEvalAction("tsess-1")).resolves.toEqual({
      ok: false,
      error: DENY_TRIAL,
    });
  });

  it("QLCS@CS1 kiêm KẾ TOÁN@CS2 → TỪ CHỐI buổi trải nghiệm CS2", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    expect(actor.visibleCenterIds).toContain("c2");
    h.resolveActor.mockResolvedValue(actor);
    armTrialSession("c2");
    await expect(saveTrialSessionEvalAction(SAVE_TRIAL_INPUT)).resolves.toEqual({
      ok: false,
      error: DENY_TRIAL,
    });
    expect(h.saveTrialResponses).not.toHaveBeenCalled();
  });

  it("QLCS@CS1 kiêm MARKETING (⇒ HO_MARKETING@HO) → TỪ CHỐI c2 và c3", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("ho", "HO_MARKETING", MARKETING_PERMS),
    ]);
    expect(actor.isHoLevel).toBe(true);
    h.resolveActor.mockResolvedValue(actor);
    for (const c of ["c2", "c3"]) {
      armTrialSession(c);
      await expect(saveTrialSessionEvalAction(SAVE_TRIAL_INPUT)).resolves.toEqual({
        ok: false,
        error: DENY_TRIAL,
      });
    }
    expect(h.saveTrialResponses).not.toHaveBeenCalled();
  });
});

describe("[L-A6] buổi TRẢI NGHIỆM — các vai KHÁC không rộng thêm một ly nào", () => {
  it("GV phụ trách lớp trải nghiệm → CHO (nhánh TEACHER giữ nguyên)", async () => {
    loginAs("u-gv", "TEACHER", "c1");
    h.resolveActor.mockResolvedValue(actorOf("u-gv", [row("cs1", "TEACHER")]));
    armTrialSession("c2", { teacherId: "u-gv" });
    await expect(saveTrialSessionEvalAction(SAVE_TRIAL_INPUT)).resolves.toEqual({
      ok: true,
      data: { saved: 1 },
    });
  });

  it("GV dạy ĐÚNG BUỔI đó (TrialClassSession.teacherId) → CHO (nhánh giữ nguyên)", async () => {
    loginAs("u-gv", "TEACHER", "c1");
    h.resolveActor.mockResolvedValue(actorOf("u-gv", [row("cs1", "TEACHER")]));
    armTrialSession("c2", { sessionTeacherId: "u-gv" });
    await expect(saveTrialSessionEvalAction(SAVE_TRIAL_INPUT)).resolves.toEqual({
      ok: true,
      data: { saved: 1 },
    });
  });

  it("GV không dính buổi, dù cùng cơ sở → TỪ CHỐI", async () => {
    loginAs("u-gv", "TEACHER", "c1");
    h.resolveActor.mockResolvedValue(actorOf("u-gv", [row("cs1", "TEACHER")]));
    armTrialSession("c1");
    await expect(saveTrialSessionEvalAction(SAVE_TRIAL_INPUT)).resolves.toEqual({
      ok: false,
      error: DENY_TRIAL,
    });
  });

  it("SALES_CSM cùng cơ sở → TỪ CHỐI (vai ngoài 4 nhánh)", async () => {
    loginAs("u-sale", "SALES_CSM", "c1");
    h.resolveActor.mockResolvedValue(actorOf("u-sale", [row("cs1", "CENTER_SALES_CSM")]));
    armTrialSession("c1");
    await expect(saveTrialSessionEvalAction(SAVE_TRIAL_INPUT)).resolves.toEqual({
      ok: false,
      error: DENY_TRIAL,
    });
  });

  it("TRAINING / SUPER_ADMIN → CHO ở mọi cơ sở (hành vi không đổi)", async () => {
    loginAs("u-dt", "TRAINING", null);
    armTrialSession("c3");
    await expect(saveTrialSessionEvalAction(SAVE_TRIAL_INPUT)).resolves.toEqual({
      ok: true,
      data: { saved: 1 },
    });

    loginAs("u-sa", "SUPER_ADMIN", null);
    await expect(saveTrialSessionEvalAction(SAVE_TRIAL_INPUT)).resolves.toEqual({
      ok: true,
      data: { saved: 1 },
    });
  });
});
