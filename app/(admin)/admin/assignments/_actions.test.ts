// @vitest-environment node
/**
 * A-01-6c · bất biến **L-A6** — cổng GHI của BÀI TẬP (`classCenterVisible`, `_actions.ts`).
 *
 * Lỗ được vá ở đây là lỗ NGƯỢC CHIỀU với đợt 25-26/08: cổng này KHÔNG so với một cơ sở
 * neo, nó đo bằng `passesScope("Class", …)` MỘT MÌNH — mà phép đo đó nở theo hai đường
 * cổng ghi không được phép hưởng (`lib/db-scope.ts` `getModelVisibleCenterIds`):
 *   1. `grantsAllow` — MỘT dòng `UserPermissionGrant` ALLOW khớp tiền tố `classes:`
 *      bật `hasAll` ⇒ trả "ALL" cho MỌI cơ sở (db-scope.ts:248-253).
 *   2. tiền tố theo MODEL — `classes:view-all` của một vai KIÊM NHIỆM (kế toán cơ sở,
 *      marketing HO…) cũng được gom vào, dù vai đó không có một action LMS nào.
 *
 * Phép đo mới `actionCoversCenter(actor, action, centerId)` (lib/auth/managed-centers.ts)
 * suy từ ĐÚNG dòng `UserOrgRole` mang CHÍNH quyền đang thực hiện (`assignments:create` /
 * `assignments:edit` / `assignments:grade`) nên không nở theo hai đường trên.
 *
 * Ba ca bắt buộc, cho MỖI action của cổng:
 *   1. cơ sở thứ HAI mà chính quyền đó phủ tới → CHO
 *   2. cơ sở NGOÀI phạm vi                     → TỪ CHỐI (kể cả khi có grant per-user)
 *   3. vai khác (kế toán / marketing HO)       → KHÔNG rộng thêm một ly nào
 *
 * ⚠️ `scopedDb` bị thay bằng client giả **không lọc gì** — cố ý: nếu cổng ghi chỉ đúng
 * nhờ tầng đọc chặn hộ thì test này đỏ, đúng như luật cứng #3 đòi. Mỗi ca TỪ CHỐI còn
 * ghim luôn "vì sao ca này không tự xanh": `passesScope("Class", …)` một mình CHO QUA.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgUnitNode } from "@/lib/org/types";
import type { Actor, UserOrgRoleRow } from "@/lib/auth/actor";
import type { AssignmentInput } from "@/lib/validators/assignment";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveActor: vi.fn(),
  checkPermission: vi.fn(),
  canManageSessionClass: vi.fn(),
  classFindUnique: vi.fn(),
  assignmentFindUnique: vi.fn(),
  assignmentCreate: vi.fn(),
  assignmentUpdate: vi.fn(),
  submissionFindUnique: vi.fn(),
  submissionUpdate: vi.fn(),
  questionFindUnique: vi.fn(),
  questionDelete: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  // `lib/settings/read-global` (nạp gián tiếp qua actor.ts) bọc unstable_cache lúc import.
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/email/queue", () => ({ enqueueEmail: vi.fn() }));
vi.mock("@/lib/auth/check-permission", () => ({
  checkPermission: h.checkPermission,
  assertPermission: async (action: string) => {
    if (!(await h.checkPermission(action))) throw new Error("PERMISSION_DENIED");
  },
}));
// Ownership theo LỚP (GV chính/trợ giảng) là cổng KHÁC, đã có test riêng ở
// sessions/[id]/_actions.test.ts — chặn để bài test này chỉ đo cổng CƠ SỞ.
vi.mock("@/app/(admin)/admin/sessions/[id]/_actions", () => ({
  canManageSessionClass: h.canManageSessionClass,
}));
// Giữ `buildActor` THẬT, chỉ thay đường nạp actor từ DB.
vi.mock("@/lib/auth/actor", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/actor")>();
  return { ...actual, resolveActor: h.resolveActor };
});
// Giữ `passesScope` THẬT (nó vẫn là một vế của cổng), chỉ thay client đọc.
vi.mock("@/lib/db-scope", async (orig) => {
  const actual = await orig<typeof import("@/lib/db-scope")>();
  return {
    ...actual,
    scopedDb: () => ({
      class: { findUnique: h.classFindUnique },
      assignment: {
        findUnique: h.assignmentFindUnique,
        create: h.assignmentCreate,
        update: h.assignmentUpdate,
      },
      assignmentSubmission: {
        findUnique: h.submissionFindUnique,
        update: h.submissionUpdate,
      },
      question: { findUnique: h.questionFindUnique, delete: h.questionDelete },
      user: { findUnique: h.userFindUnique },
    }),
  };
});

import { buildActor } from "@/lib/auth/actor";
import { passesScope } from "@/lib/db-scope";
import {
  createAssignment,
  deleteAssignmentQuestion,
  gradeSubmission,
  updateAssignment,
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

/** Đào tạo — vai DUY NHẤT mang `assignments:create|edit`. KHÔNG có `classes:*` (gỡ 24/07). */
const TRAINING_PERMS: Perms = [
  { action: "training:manage", scopeType: "GLOBAL" },
  { action: "assignments:create", scopeType: "GLOBAL" },
  { action: "assignments:edit", scopeType: "GLOBAL" },
  { action: "assignments:grade", scopeType: "GLOBAL" },
];
/** QLCS — có `assignments:grade` + `classes:view-all` (prisma/seed-roles.ts). */
const CM_PERMS: Perms = [
  { action: "classes:view-all", scopeType: "GLOBAL" },
  { action: "students:view-all", scopeType: "GLOBAL" },
  { action: "assignments:grade", scopeType: "GLOBAL" },
];
/** Kế toán cơ sở — mang `classes:view-all` nhưng KHÔNG một action LMS nào. */
const KE_TOAN_PERMS: Perms = [
  { action: "payments:manage", scopeType: "GLOBAL" },
  { action: "students:view-all", scopeType: "GLOBAL" },
  { action: "classes:view-all", scopeType: "GLOBAL" },
];

function row(orgUnitId: string, code: string, perms: Perms): UserOrgRoleRow {
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

/** Đào tạo giữ CS1 + CS2 (hai vùng khác nhau) — "cơ sở thứ hai" của chính vai đó. */
const DAO_TAO_HAI_CO_SO = () =>
  actorOf("u-dt", [row("cs1", "TRAINING", TRAINING_PERMS), row("cs2", "TRAINING", TRAINING_PERMS)]);

const input = (classId: string): AssignmentInput => ({
  title: "Bài 1",
  description: "Mô tả",
  instructions: null,
  kind: "CLASSWORK",
  classId,
  lessonId: null,
  totalPoints: 10,
  dueAt: null,
  allowText: true,
  allowFile: true,
  status: "DRAFT",
});

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "u-dt", role: "TRAINING", centerId: null } });
  h.checkPermission.mockResolvedValue(true);
  h.canManageSessionClass.mockResolvedValue(false);
  h.resolveActor.mockResolvedValue(DAO_TAO_HAI_CO_SO());
  h.userFindUnique.mockResolvedValue({ employeeId: "emp-1" });
  h.assignmentCreate.mockResolvedValue({ id: "as-1" });
  h.assignmentUpdate.mockResolvedValue({});
  h.submissionUpdate.mockResolvedValue({});
  h.questionDelete.mockResolvedValue({});
});

/** Lớp đích của bài tập nằm ở cơ sở `centerId` (client giả KHÔNG lọc gì). */
function armClass(centerId: string | null) {
  h.classFindUnique.mockResolvedValue({ centerId });
}

// ── Cổng #1: `assignments:create` (soạn / sửa / publish — Đào tạo) ────────────────

describe("[L-A6] createAssignment — cổng cơ sở của quyền assignments:create", () => {
  it("CA1 cơ sở THỨ HAI của chính vai Đào tạo (c2) → CHO + có ghi", async () => {
    armClass("c2");
    await expect(createAssignment(input("cl-2"))).resolves.toEqual({
      ok: true,
      data: { assignmentId: "as-1" },
    });
    expect(h.assignmentCreate).toHaveBeenCalledTimes(1);
  });

  it("CA2 cơ sở NGOÀI phạm vi (c3) → TỪ CHỐI, KHÔNG ghi gì", async () => {
    armClass("c3");
    await expect(createAssignment(input("cl-3"))).resolves.toEqual({
      ok: false,
      error: "Lớp không tồn tại hoặc ngoài phạm vi cơ sở",
    });
    expect(h.assignmentCreate).not.toHaveBeenCalled();
  });

  it("CA2b grant per-user `classes:edit` → VẪN TỪ CHỐI cơ sở thứ ba", async () => {
    const grantActor = buildActor({
      userId: "u-dt",
      rows: [row("cs1", "TRAINING", TRAINING_PERMS), row("cs2", "TRAINING", TRAINING_PERMS)],
      orgNodes: ORG,
      now: new Date("2026-08-26"),
      grants: [{ action: "classes:edit", grant: "ALLOW" }],
    });
    // Ghim: một mình `passesScope` (phép đo CŨ của cổng) VẪN cho qua c3 → ca không tự xanh.
    expect(passesScope("Class", { centerId: "c3" }, grantActor)).toBe(true);
    h.resolveActor.mockResolvedValue(grantActor);
    armClass("c3");
    await expect(createAssignment(input("cl-3"))).resolves.toEqual({
      ok: false,
      error: "Lớp không tồn tại hoặc ngoài phạm vi cơ sở",
    });
    expect(h.assignmentCreate).not.toHaveBeenCalled();
  });

  it("CA3 vai KHÁC (kế toán@CS2) không nới: Đào tạo@CS1 vẫn TỪ CHỐI lớp c2", async () => {
    const actor = actorOf("u-dt", [
      row("cs1", "TRAINING", TRAINING_PERMS),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    // Ghim: `classes:view-all` của vai kế toán làm `passesScope` cho qua c2.
    expect(passesScope("Class", { centerId: "c2" }, actor)).toBe(true);
    h.resolveActor.mockResolvedValue(actor);
    armClass("c2");
    await expect(createAssignment(input("cl-2"))).resolves.toEqual({
      ok: false,
      error: "Lớp không tồn tại hoặc ngoài phạm vi cơ sở",
    });
    expect(h.assignmentCreate).not.toHaveBeenCalled();
  });

  it("Đào tạo neo tại HO → CHO ở mọi cơ sở (hành vi HO-level KHÔNG đổi)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-dt", [row("ho", "TRAINING", TRAINING_PERMS)]));
    armClass("c3");
    await expect(createAssignment(input("cl-3"))).resolves.toEqual({
      ok: true,
      data: { assignmentId: "as-1" },
    });
  });

  it("updateAssignment: lớp ĐÍCH ở cơ sở ngoài phạm vi → TỪ CHỐI, KHÔNG ghi gì", async () => {
    h.assignmentFindUnique.mockResolvedValue({ class: { centerId: "c1" } });
    armClass("c3");
    await expect(updateAssignment("as-1", input("cl-3"))).resolves.toEqual({
      ok: false,
      error: "Lớp không tồn tại hoặc ngoài phạm vi cơ sở",
    });
    expect(h.assignmentUpdate).not.toHaveBeenCalled();
  });

  it("updateAssignment: bài của lớp cơ sở thứ HAI (c2) → CHO", async () => {
    h.assignmentFindUnique.mockResolvedValue({ class: { centerId: "c2" } });
    armClass("c2");
    await expect(updateAssignment("as-1", input("cl-2"))).resolves.toEqual({ ok: true });
    expect(h.assignmentUpdate).toHaveBeenCalledTimes(1);
  });
});

// ── Cổng #2: `assignments:edit` (câu hỏi trong bài tập) ───────────────────────────

describe("[L-A6] deleteAssignmentQuestion — cổng cơ sở của quyền assignments:edit", () => {
  const armQuestion = (centerId: string) =>
    h.questionFindUnique.mockResolvedValue({
      assignmentId: "as-1",
      assignment: { class: { centerId } },
    });

  it("CA1 câu hỏi của bài ở cơ sở THỨ HAI (c2) → CHO + có xoá", async () => {
    armQuestion("c2");
    await expect(deleteAssignmentQuestion("q-1")).resolves.toEqual({ ok: true });
    expect(h.questionDelete).toHaveBeenCalledTimes(1);
  });

  it("CA2 cơ sở NGOÀI phạm vi (c3) → TỪ CHỐI, KHÔNG xoá gì", async () => {
    armQuestion("c3");
    await expect(deleteAssignmentQuestion("q-1")).resolves.toEqual({
      ok: false,
      error: "Không tìm thấy câu hỏi",
    });
    expect(h.questionDelete).not.toHaveBeenCalled();
  });

  it("CA3 vai KHÁC (marketing HO ⇒ 'ALL' cho classes:) không nới cổng sửa câu hỏi", async () => {
    const actor = actorOf("u-dt", [
      row("cs1", "TRAINING", TRAINING_PERMS),
      row("ho", "HO_MARKETING", KE_TOAN_PERMS),
    ]);
    // Ghim: vai neo HO ⇒ `classes:view-all` scope "ALL" ⇒ `passesScope` cho qua c3.
    expect(actor.isHoLevel).toBe(true);
    expect(passesScope("Class", { centerId: "c3" }, actor)).toBe(true);
    h.resolveActor.mockResolvedValue(actor);
    armQuestion("c3");
    await expect(deleteAssignmentQuestion("q-1")).resolves.toEqual({
      ok: false,
      error: "Không tìm thấy câu hỏi",
    });
    expect(h.questionDelete).not.toHaveBeenCalled();
  });
});

// ── Cổng #3: `assignments:grade` (chấm bài — QLCS / GV / Đào tạo) ─────────────────

describe("[L-A6] gradeSubmission — cổng cơ sở của quyền assignments:grade", () => {
  const cmUser = { id: "u-cm", role: "CENTER_MANAGER", centerId: "c1" };
  const armSubmission = (centerId: string) =>
    h.submissionFindUnique.mockResolvedValue({
      status: "SUBMITTED",
      assignmentId: "as-1",
      assignment: {
        totalPoints: 10,
        class: { teacherId: "u-gv-khac", assistantId: null, centerId },
      },
    });

  beforeEach(() => {
    h.auth.mockResolvedValue({ user: cmUser });
    // Quyền chấm theo LỚP do `canManageSessionClass` lo; ở đây cho TRUE để chắc chắn
    // kết quả TỪ CHỐI bên dưới đến từ cổng CƠ SỞ chứ không phải cổng lớp.
    h.canManageSessionClass.mockResolvedValue(true);
  });

  it("CA1 QLCS giữ CS1+CS2 → chấm bài lớp c2 CHO + có ghi điểm", async () => {
    h.resolveActor.mockResolvedValue(
      actorOf("u-cm", [row("cs1", "CENTER_MANAGER", CM_PERMS), row("cs2", "CENTER_MANAGER", CM_PERMS)]),
    );
    armSubmission("c2");
    await expect(gradeSubmission({ submissionId: "sub-1", score: 8 })).resolves.toEqual({ ok: true });
    expect(h.submissionUpdate).toHaveBeenCalledTimes(1);
  });

  it("CA2 cơ sở NGOÀI phạm vi (c3) → TỪ CHỐI, KHÔNG ghi điểm", async () => {
    h.resolveActor.mockResolvedValue(
      actorOf("u-cm", [row("cs1", "CENTER_MANAGER", CM_PERMS), row("cs2", "CENTER_MANAGER", CM_PERMS)]),
    );
    armSubmission("c3");
    await expect(gradeSubmission({ submissionId: "sub-1", score: 8 })).resolves.toEqual({
      ok: false,
      error: "Không tìm thấy submission",
    });
    expect(h.submissionUpdate).not.toHaveBeenCalled();
  });

  it("CA3 QLCS@CS1 kiêm KẾ TOÁN@CS2 → TỪ CHỐI chấm bài lớp c2", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER", CM_PERMS),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    // Ghim: phép đo cũ cho qua c2 (kế toán mang `classes:view-all` tại CS2).
    expect(passesScope("Class", { centerId: "c2" }, actor)).toBe(true);
    h.resolveActor.mockResolvedValue(actor);
    armSubmission("c2");
    await expect(gradeSubmission({ submissionId: "sub-1", score: 8 })).resolves.toEqual({
      ok: false,
      error: "Không tìm thấy submission",
    });
    expect(h.submissionUpdate).not.toHaveBeenCalled();

    // …và cơ sở người này THỰC SỰ làm QLCS vẫn chấm được (không siết oan).
    armSubmission("c1");
    await expect(gradeSubmission({ submissionId: "sub-1", score: 8 })).resolves.toEqual({ ok: true });
  });
});

// ── A-01-6d (26/08) — LỚP CÓ THẬT nhưng `centerId = null`: SIẾT KHÔNG CHỦ Ý ────────
// `actionCoversCenter` fail-closed trên centerId rỗng (managed-centers.ts) và docblock của
// nó đòi "chỗ gọi nào có ngoại lệ hợp lệ cho null thì tự xử lý nhánh null TRƯỚC". Bản
// A-01-6c chỉ xử lý `!cls` (bài không gắn lớp), KHÔNG xử lý lớp CÓ THẬT mà `centerId` null
// — trạng thái repo công nhận là hợp lệ (lib/enrollment-flow.ts:106 "GIỮ row có centerId =
// null (legacy chưa gán)"). Trước bản vá, vế duy nhất là `passesScope`, và nó thoát sớm ở
// `visibleCenters === "ALL"` TRƯỚC khi tới dòng kiểm null ⇒ actor cấp HO vẫn qua.
describe("[L-A6] lớp LEGACY chưa gán cơ sở (centerId null) — không được siết oan", () => {
  it("Đào tạo neo tại HO → vẫn sửa được bài của lớp legacy", async () => {
    const hoActor = actorOf("u-dt", [row("ho", "TRAINING", TRAINING_PERMS)]);
    // Ghim: phép đo CŨ (`passesScope` một mình) cho qua — đây là hành vi phải giữ.
    expect(passesScope("Class", { centerId: null }, hoActor)).toBe(true);
    h.resolveActor.mockResolvedValue(hoActor);
    armClass(null);
    h.assignmentFindUnique.mockResolvedValue({ class: { centerId: null } });
    await expect(updateAssignment("as-1", input("cl-legacy"))).resolves.toEqual({ ok: true });
    expect(h.assignmentUpdate).toHaveBeenCalledTimes(1);
  });

  it("Đào tạo neo tại CƠ SỞ → vẫn TỪ CHỐI lớp legacy (cách ly không nới)", async () => {
    // `passesScope` trả false (Class ∉ NULL_IS_GLOBAL_MODELS) — cổng vẫn đóng.
    expect(passesScope("Class", { centerId: null }, DAO_TAO_HAI_CO_SO())).toBe(false);
    armClass(null);
    h.assignmentFindUnique.mockResolvedValue({ class: { centerId: null } });
    await expect(updateAssignment("as-1", input("cl-legacy"))).resolves.toEqual({
      ok: false,
      error: "Không tìm thấy bài tập",
    });
    expect(h.assignmentUpdate).not.toHaveBeenCalled();
  });
});
