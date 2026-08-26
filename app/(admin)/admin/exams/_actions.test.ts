// @vitest-environment node
/**
 * A-01-6c · bất biến **L-A6** — cổng GHI của ĐỀ THI (`classCenterVisible`, `_actions.ts`).
 *
 * Cùng một lỗ NGƯỢC CHIỀU với bài tập: cổng đo bằng `passesScope("Class", …)` MỘT MÌNH,
 * mà phép đo đó gom theo TIỀN TỐ model (`classes:`/`class_group:`) nên
 *   1. bật "ALL" cho MỌI cơ sở khi có MỘT dòng `UserPermissionGrant` ALLOW khớp tiền tố
 *      (`lib/db-scope.ts:248-253`), và
 *   2. nở theo vai KIÊM NHIỆM chỉ có quyền ĐỌC lớp (kế toán cơ sở, marketing HO).
 *
 * MỌI action ghi ở file đề thi đều đi qua `requireRole()` = `exams:edit` (soạn/sửa/xoá/
 * đổi trạng thái/chấm), nên cổng cơ sở của cả file đo theo ĐÚNG quyền đó qua
 * `actionCoversCenter` (lib/auth/managed-centers.ts).
 *
 * ⚠️ `scopedDb` bị thay bằng client giả **không lọc gì** (luật cứng #3). Mỗi ca TỪ CHỐI
 * ghim luôn "vì sao không tự xanh": `passesScope("Class", …)` một mình CHO QUA.
 *
 * ⚠️ Đề NGÂN HÀNG (`classId = null`) là nội dung dùng chung 2 cơ sở (câu 74a) — cổng cơ
 * sở CỐ Ý không chặn, gate quyền `exams:edit` lo. Có ca ghim ở cuối file.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgUnitNode } from "@/lib/org/types";
import type { Actor, UserOrgRoleRow } from "@/lib/auth/actor";
import type { ExamInput } from "@/lib/validators/exam";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveActor: vi.fn(),
  checkPermission: vi.fn(),
  canManageSessionClass: vi.fn(),
  classFindUnique: vi.fn(),
  examFindUnique: vi.fn(),
  examCreate: vi.fn(),
  examUpdate: vi.fn(),
  examDelete: vi.fn(),
  attemptCount: vi.fn(),
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
vi.mock("@/lib/audit/audit-log", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/auth/check-permission", () => ({ checkPermission: h.checkPermission }));
// Ownership theo LỚP là cổng KHÁC (test riêng ở sessions/[id]/_actions.test.ts).
vi.mock("@/app/(admin)/admin/sessions/[id]/_actions", () => ({
  canManageSessionClass: h.canManageSessionClass,
}));
// Giữ `buildActor` THẬT, chỉ thay đường nạp actor từ DB.
vi.mock("@/lib/auth/actor", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/actor")>();
  return { ...actual, resolveActor: h.resolveActor };
});
// Giữ `passesScope` THẬT (vẫn là một vế của cổng), chỉ thay client đọc.
vi.mock("@/lib/db-scope", async (orig) => {
  const actual = await orig<typeof import("@/lib/db-scope")>();
  return {
    ...actual,
    scopedDb: () => ({
      class: { findUnique: h.classFindUnique },
      exam: {
        findUnique: h.examFindUnique,
        create: h.examCreate,
        update: h.examUpdate,
        delete: h.examDelete,
      },
      examAttempt: { count: h.attemptCount },
      user: { findUnique: h.userFindUnique },
    }),
  };
});

import { buildActor } from "@/lib/auth/actor";
import { passesScope } from "@/lib/db-scope";
import { changeExamStatus, createExam, deleteExam } from "./_actions";

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

/** Đào tạo — vai DUY NHẤT (ngoài SUPER_ADMIN) mang `exams:edit`. KHÔNG có `classes:*`. */
const TRAINING_PERMS: Perms = [
  { action: "training:manage", scopeType: "GLOBAL" },
  { action: "exams:view", scopeType: "GLOBAL" },
  { action: "exams:edit", scopeType: "GLOBAL" },
  { action: "exams:delete", scopeType: "GLOBAL" },
];
/** Kế toán cơ sở / marketing HO — mang `classes:view-all` nhưng KHÔNG action LMS nào. */
const CHI_DOC_LOP_PERMS: Perms = [
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

const input = (classId: string | null): ExamInput => ({
  examCode: null,
  title: "Đề kiểm tra 1",
  description: null,
  classId,
  lessonId: null,
  durationMinutes: 60,
  totalPoints: 10,
  passingScore: 5,
  shuffleQuestions: false,
  shuffleChoices: false,
  openAt: null,
  closeAt: null,
  status: "DRAFT",
});

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({
    user: { id: "u-dt", name: "Đào tạo", role: "TRAINING", roles: ["TRAINING"], centerId: null },
  });
  h.checkPermission.mockResolvedValue(true);
  h.canManageSessionClass.mockResolvedValue(false);
  h.resolveActor.mockResolvedValue(DAO_TAO_HAI_CO_SO());
  h.userFindUnique.mockResolvedValue({ employeeId: "emp-1" });
  h.examCreate.mockResolvedValue({ id: "ex-1" });
  h.examUpdate.mockResolvedValue({});
  h.examDelete.mockResolvedValue({});
  h.attemptCount.mockResolvedValue(0);
});

describe("[L-A6] createExam — cổng cơ sở của quyền exams:edit", () => {
  it("CA1 lớp ở cơ sở THỨ HAI của chính vai Đào tạo (c2) → CHO + có ghi", async () => {
    h.classFindUnique.mockResolvedValue({ centerId: "c2" });
    await expect(createExam(input("cl-2"))).resolves.toEqual({ ok: true, data: { examId: "ex-1" } });
    expect(h.examCreate).toHaveBeenCalledTimes(1);
  });

  it("CA2 lớp ở cơ sở NGOÀI phạm vi (c3) → TỪ CHỐI, KHÔNG ghi gì", async () => {
    h.classFindUnique.mockResolvedValue({ centerId: "c3" });
    await expect(createExam(input("cl-3"))).resolves.toEqual({
      ok: false,
      error: "Lớp không tồn tại hoặc ngoài phạm vi cơ sở",
    });
    expect(h.examCreate).not.toHaveBeenCalled();
  });

  it("CA2b grant per-user `classes:edit` → VẪN TỪ CHỐI cơ sở thứ ba", async () => {
    const grantActor = buildActor({
      userId: "u-dt",
      rows: [row("cs1", "TRAINING", TRAINING_PERMS), row("cs2", "TRAINING", TRAINING_PERMS)],
      orgNodes: ORG,
      now: new Date("2026-08-26"),
      grants: [{ action: "classes:edit", grant: "ALLOW" }],
    });
    // Ghim: một mình `passesScope` (phép đo CŨ) VẪN cho qua c3 → ca không tự xanh.
    expect(passesScope("Class", { centerId: "c3" }, grantActor)).toBe(true);
    h.resolveActor.mockResolvedValue(grantActor);
    h.classFindUnique.mockResolvedValue({ centerId: "c3" });
    await expect(createExam(input("cl-3"))).resolves.toEqual({
      ok: false,
      error: "Lớp không tồn tại hoặc ngoài phạm vi cơ sở",
    });
    expect(h.examCreate).not.toHaveBeenCalled();
  });

  it("CA3 vai KHÁC (kế toán@CS2, chỉ đọc lớp) không nới cổng soạn đề", async () => {
    const actor = actorOf("u-dt", [
      row("cs1", "TRAINING", TRAINING_PERMS),
      row("cs2", "CENTER_ACCOUNTANT", CHI_DOC_LOP_PERMS),
    ]);
    // Ghim: `classes:view-all` của vai kế toán làm `passesScope` cho qua c2.
    expect(passesScope("Class", { centerId: "c2" }, actor)).toBe(true);
    h.resolveActor.mockResolvedValue(actor);
    h.classFindUnique.mockResolvedValue({ centerId: "c2" });
    await expect(createExam(input("cl-2"))).resolves.toEqual({
      ok: false,
      error: "Lớp không tồn tại hoặc ngoài phạm vi cơ sở",
    });
    expect(h.examCreate).not.toHaveBeenCalled();
  });

  it("Đào tạo neo tại HO → CHO ở mọi cơ sở (hành vi HO-level KHÔNG đổi)", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-dt", [row("ho", "TRAINING", TRAINING_PERMS)]));
    h.classFindUnique.mockResolvedValue({ centerId: "c3" });
    await expect(createExam(input("cl-3"))).resolves.toEqual({ ok: true, data: { examId: "ex-1" } });
  });

  it("đề NGÂN HÀNG (classId null) → CHO: nội dung dùng chung, cổng cơ sở cố ý không chặn", async () => {
    await expect(createExam(input(null))).resolves.toEqual({ ok: true, data: { examId: "ex-1" } });
    expect(h.classFindUnique).not.toHaveBeenCalled();
  });
});

describe("[L-A6] changeExamStatus / deleteExam — cùng một luật", () => {
  const armExam = (centerId: string | null) =>
    h.examFindUnique.mockResolvedValue({
      status: "DRAFT",
      class: centerId === null ? null : { centerId },
    });

  it("CA1 đề gắn lớp ở cơ sở THỨ HAI (c2) → đổi trạng thái CHO", async () => {
    armExam("c2");
    await expect(changeExamStatus({ examId: "ex-1", status: "CLOSED" })).resolves.toEqual({
      ok: true,
    });
    expect(h.examUpdate).toHaveBeenCalledTimes(1);
  });

  it("CA2 cơ sở NGOÀI phạm vi (c3) → TỪ CHỐI, KHÔNG ghi gì", async () => {
    armExam("c3");
    await expect(changeExamStatus({ examId: "ex-1", status: "CLOSED" })).resolves.toEqual({
      ok: false,
      error: "Đề thi không tồn tại",
    });
    expect(h.examUpdate).not.toHaveBeenCalled();
  });

  it("CA3 vai KHÁC (marketing HO ⇒ classes: scope 'ALL') không nới cổng xoá đề", async () => {
    const actor = actorOf("u-dt", [
      row("cs1", "TRAINING", TRAINING_PERMS),
      row("ho", "HO_MARKETING", CHI_DOC_LOP_PERMS),
    ]);
    // Ghim: vai neo HO ⇒ `classes:view-all` scope "ALL" ⇒ `passesScope` cho qua c3.
    expect(actor.isHoLevel).toBe(true);
    expect(passesScope("Class", { centerId: "c3" }, actor)).toBe(true);
    h.resolveActor.mockResolvedValue(actor);
    armExam("c3");
    await expect(deleteExam("ex-1")).resolves.toEqual({ ok: false, error: "Đề thi không tồn tại" });
    expect(h.examDelete).not.toHaveBeenCalled();
  });

  it("xoá đề gắn lớp cơ sở THỨ HAI (c2) → CHO + có xoá", async () => {
    armExam("c2");
    await expect(deleteExam("ex-1")).resolves.toEqual({ ok: true });
    expect(h.examDelete).toHaveBeenCalledTimes(1);
  });
});

// ── A-01-6d (26/08) — LỚP CÓ THẬT nhưng `centerId = null`: SIẾT KHÔNG CHỦ Ý ────────
// KHÁC ca "đề NGÂN HÀNG" ở trên (`classId = null` — không gắn lớp). Đây là đề CÓ gắn lớp,
// nhưng lớp đó chưa được gán cơ sở (legacy). `actionCoversCenter` fail-closed trên centerId
// rỗng, còn `passesScope` thoát sớm ở `visibleCenters === "ALL"` TRƯỚC khi tới dòng kiểm
// null ⇒ trước A-01-6c actor cấp HO vẫn qua. Nhánh null phải được xử lý TRƯỚC khi hỏi
// `actionCoversCenter`, đúng như docblock của nó yêu cầu.
describe("[L-A6] lớp LEGACY chưa gán cơ sở (centerId null) — không được siết oan", () => {
  const armExamNullCenter = () =>
    h.examFindUnique.mockResolvedValue({ status: "DRAFT", class: { centerId: null } });

  it("Đào tạo neo tại HO → vẫn đổi được trạng thái đề của lớp legacy", async () => {
    const hoActor = actorOf("u-dt", [row("ho", "TRAINING", TRAINING_PERMS)]);
    // Ghim: phép đo CŨ (`passesScope` một mình) cho qua — đây là hành vi phải giữ.
    expect(passesScope("Class", { centerId: null }, hoActor)).toBe(true);
    h.resolveActor.mockResolvedValue(hoActor);
    armExamNullCenter();
    await expect(changeExamStatus({ examId: "ex-1", status: "CLOSED" })).resolves.toEqual({
      ok: true,
    });
    expect(h.examUpdate).toHaveBeenCalledTimes(1);
  });

  it("Đào tạo neo tại CƠ SỞ → vẫn TỪ CHỐI lớp legacy (cách ly không nới)", async () => {
    expect(passesScope("Class", { centerId: null }, DAO_TAO_HAI_CO_SO())).toBe(false);
    armExamNullCenter();
    await expect(changeExamStatus({ examId: "ex-1", status: "CLOSED" })).resolves.toEqual({
      ok: false,
      error: "Đề thi không tồn tại",
    });
    expect(h.examUpdate).not.toHaveBeenCalled();
  });
});

// ── A-01-6d (26/08) — GRANT PER-USER phải có hiệu lực ở cổng cơ sở ────────────────
// Cổng THÔ (`checkPermission` → `can()`) cho ALLOW ngay khi `grantsAllow` có action
// (lib/auth/can.ts:54). Bản A-01-6c bỏ hẳn `grantsAllow` khỏi `centerIdsGrantedByAction`
// ⇒ cổng cơ sở trả tập RỖNG ⇒ quyền cấp riêng từng người vô hiệu HOÀN TOÀN, mà lỗi lại
// hiện ra là "Đề thi không tồn tại" trong khi /admin/users/[id]/permissions vẫn khoe ALLOW.
describe("[L-A6] grant per-user `exams:edit` — cấp riêng phải dùng được, trong tầm nhìn", () => {
  /** Nhân sự cơ sở CS1, KHÔNG vai nào mang `exams:edit`; quyền đến từ UserPermissionGrant. */
  const nhanSuCoGrant = () =>
    buildActor({
      userId: "u-gv",
      rows: [row("cs1", "TEACHER", [{ action: "classes:view-own", scopeType: "GLOBAL" }])],
      orgNodes: ORG,
      now: new Date("2026-08-26"),
      grants: [{ action: "exams:edit", grant: "ALLOW" }],
    });

  beforeEach(() => {
    h.auth.mockResolvedValue({
      user: { id: "u-gv", name: "GV", role: "TEACHER", roles: ["TEACHER"], centerId: "c1" },
    });
    h.resolveActor.mockResolvedValue(nhanSuCoGrant());
  });

  it("đề của lớp CS1 (cơ sở của chính họ) → CHO + có ghi", async () => {
    h.examFindUnique.mockResolvedValue({ status: "DRAFT", class: { centerId: "c1" } });
    await expect(changeExamStatus({ examId: "ex-1", status: "CLOSED" })).resolves.toEqual({
      ok: true,
    });
    expect(h.examUpdate).toHaveBeenCalledTimes(1);
  });

  it("grant KHÔNG nở thành toàn hệ thống: đề của lớp CS3 vẫn TỪ CHỐI", async () => {
    h.examFindUnique.mockResolvedValue({ status: "DRAFT", class: { centerId: "c3" } });
    await expect(changeExamStatus({ examId: "ex-1", status: "CLOSED" })).resolves.toEqual({
      ok: false,
      error: "Đề thi không tồn tại",
    });
    expect(h.examUpdate).not.toHaveBeenCalled();
  });
});
