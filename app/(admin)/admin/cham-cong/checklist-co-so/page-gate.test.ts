// @vitest-environment node
/**
 * A-01-6b · bất biến **L-A6** — cổng UI của trang Checklist cơ sở.
 *
 * ⚠️ ĐÂY KHÔNG PHẢI CỔNG GHI. Cổng GHI là `saveCenterChecklist` (`_actions.ts`, có bộ test
 * riêng); trang này chỉ quyết định **thấy cơ sở nào** và **form có mở để sửa không**
 * (`canEdit`). Vá riêng nó vì nếu bỏ qua thì bản vá cổng GHI thành vô nghĩa trên thực tế:
 * trang cũ GHIM CỨNG `session.user.centerId` và ẩn tuyệt đối ô chọn cơ sở với QLCS
 * (`!isCM && centers.length > 1`), nên QLCS hai cơ sở không có đường nào mở checklist của
 * cơ sở thứ hai — cổng GHI cho phép cũng không ai bấm tới được.
 *
 * Ba ca bắt buộc: cơ sở thứ HAI → thấy + sửa được · cơ sở NGOÀI phạm vi → không · vai
 * khác → không rộng thêm một ly.
 *
 * Cách đo: gọi thẳng RSC (`async function`) rồi đọc props của `<CenterChecklistForm>`
 * trong cây React trả về — không render DOM. `scopedDb` là client giả chỉ thi hành ĐÚNG
 * mệnh đề `where` mà trang tự viết (không lọc hộ theo cơ sở), nên danh sách cơ sở hiện ra
 * là do CHÍNH trang quyết định.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { OrgUnitNode } from "@/lib/org/types";
import type { Actor, UserOrgRoleRow } from "@/lib/auth/actor";

type CenterRow = { id: string; name: string };
type FormProps = { centerId: string; canEdit: boolean };

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  checkPermission: vi.fn(),
  resolveActor: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  // Sentinel thay component client thật (nó import ngược `../_actions`).
  Form: (() => null) as unknown as (p: FormProps) => null,
}));

const ALL_CENTERS: CenterRow[] = [
  { id: "c1", name: "CS1" },
  { id: "c2", name: "CS2" },
  { id: "c3", name: "CS3" },
];

/** DB giả: thi hành đúng mệnh đề `where` trang viết ra, không thêm bộ lọc cơ sở nào. */
function centerFindMany(args: { where?: { id?: { in: string[] }; isActive?: boolean } }) {
  const ids = args.where?.id?.in;
  return Promise.resolve(ids ? ALL_CENTERS.filter((c) => ids.includes(c.id)) : ALL_CENTERS);
}

vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth/check-permission", () => ({ checkPermission: h.checkPermission }));
vi.mock("./_components/checklist-form", () => ({ CenterChecklistForm: h.Form }));
vi.mock("@/lib/auth/actor", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/actor")>();
  return { ...actual, resolveActor: h.resolveActor };
});
vi.mock("@/lib/db-scope", async (orig) => {
  const actual = await orig<typeof import("@/lib/db-scope")>();
  return {
    ...actual,
    scopedDb: () => ({
      center: { findMany: centerFindMany },
      centerDayChecklist: { findUnique: () => Promise.resolve(null) },
    }),
  };
});

import { buildActor } from "@/lib/auth/actor";
import CenterChecklistPage from "./page";

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
const CM_PERMS: Perms = [{ action: "hr_attendance:view", scopeType: "CENTER" }];
const KE_TOAN_PERMS: Perms = [{ action: "students:view-all", scopeType: "GLOBAL" }];
const HO_HR_PERMS: Perms = [{ action: "hr_attendance:view", scopeType: "GLOBAL" }];

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

function login(id: string, role: string, centerId: string | null) {
  h.auth.mockResolvedValue({ user: { id, role, centerId } });
}

// ── Đọc cây React trả về ─────────────────────────────────────────────────────────────

function childrenOf(el: ReactElement): ReactNode {
  return (el.props as { children?: ReactNode }).children ?? null;
}

function walk(node: ReactNode, hit: (el: ReactElement) => boolean): ReactElement | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = walk(n, hit);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (hit(node)) return node;
  return walk(childrenOf(node), hit);
}

function collect(node: ReactNode, hit: (el: ReactElement) => boolean, out: ReactElement[]): ReactElement[] {
  if (Array.isArray(node)) {
    node.forEach((n) => collect(n, hit, out));
    return out;
  }
  if (!isValidElement(node)) return out;
  if (hit(node)) out.push(node);
  collect(childrenOf(node), hit, out);
  return out;
}

/** Props form + danh sách cơ sở trong ô chọn (rỗng = ô chọn KHÔNG hiện). */
async function renderPage(sp: { date?: string; centerId?: string } = {}) {
  const tree = await CenterChecklistPage({ searchParams: Promise.resolve(sp) });
  const form = walk(tree, (el) => el.type === h.Form);
  const select = walk(tree, (el) => el.type === "select");
  const options = select
    ? collect(childrenOf(select), (el) => el.type === "option", []).map(
        (el) => (el.props as { value: string }).value,
      )
    : [];
  // Chỉ giữ 2 prop là CỔNG (form còn nhận date/initial/initialNote — không thuộc phạm vi).
  const p = form ? (form.props as FormProps) : null;
  return { form: p ? { centerId: p.centerId, canEdit: p.canEdit } : null, options };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.redirect.mockImplementation(() => {
    throw new Error("REDIRECT");
  });
  h.checkPermission.mockResolvedValue(true);
  login("u-cm", "CENTER_MANAGER", "c1");
  h.resolveActor.mockResolvedValue(
    actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("cs2", "CENTER_MANAGER")]),
  );
});

describe("[L-A6] trang Checklist cơ sở — QLCS đa cơ sở", () => {
  it("QLCS 2 cơ sở: thấy CẢ HAI trong ô chọn (trang cũ ẩn tuyệt đối ô này)", async () => {
    const { form, options } = await renderPage();
    expect(options).toEqual(["c1", "c2"]);
    expect(form).toEqual({ centerId: "c1", canEdit: true });
  });

  it("chọn cơ sở THỨ HAI (c2) → mở đúng c2 và SỬA được — ca hôm nay ghim cứng c1", async () => {
    const { form } = await renderPage({ centerId: "c2" });
    expect(form).toEqual({ centerId: "c2", canEdit: true });
  });

  it("ép ?centerId=c3 (ngoài phạm vi) → KHÔNG mở c3, rơi về cơ sở đầu mình quản lý", async () => {
    const { form, options } = await renderPage({ centerId: "c3" });
    expect(form?.centerId).toBe("c1");
    expect(options).not.toContain("c3");
  });

  it("QLCS 1 cơ sở: y hệt hôm nay — ô chọn ẨN, ghim đúng cơ sở đó", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs1", "CENTER_MANAGER")]));
    const { form, options } = await renderPage({ centerId: "c2" });
    expect(options).toEqual([]);
    expect(form).toEqual({ centerId: "c1", canEdit: true });
  });

  it("KIÊM NHIỆM: QLCS@CS1 kiêm KẾ TOÁN@CS2 → CS2 KHÔNG vào danh sách, ép cũng không mở", async () => {
    const actor = actorOf("u-cm", [
      row("cs1", "CENTER_MANAGER"),
      row("cs2", "CENTER_ACCOUNTANT", KE_TOAN_PERMS),
    ]);
    // Ghim rằng ca này không tự xanh: vế đã bị loại (đọc được CS2) VẪN cho qua.
    expect(actor.visibleCenterIds).toContain("c2");

    h.resolveActor.mockResolvedValue(actor);
    const { form, options } = await renderPage({ centerId: "c2" });
    expect(options).toEqual([]);
    expect(form).toEqual({ centerId: "c1", canEdit: true });
  });

  it("KIÊM NHIỆM: QLCS@CS1 kiêm NHÂN SỰ HỘI SỞ (neo HO) → vẫn chỉ CS1", async () => {
    const actor = actorOf("u-cm", [row("cs1", "CENTER_MANAGER"), row("ho", "HO_HR", HO_HR_PERMS)]);
    expect(actor.isHoLevel).toBe(true);
    expect(actor.visibleCenterIds).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));

    h.resolveActor.mockResolvedValue(actor);
    const { form, options } = await renderPage({ centerId: "c3" });
    expect(options).toEqual([]);
    expect(form?.centerId).toBe("c1");
  });

  it("cơ sở neo LỆCH (JWT c1, vai neo ở c2) → trang mở c2: nguồn sự thật là vai", async () => {
    h.resolveActor.mockResolvedValue(actorOf("u-cm", [row("cs2", "CENTER_MANAGER")]));
    const { form } = await renderPage();
    expect(form).toEqual({ centerId: "c2", canEdit: true });
  });

  // Desync đã gặp trên prod (14 người mất UserOrgRole, xem lịch sử #09): JWT còn vai QLCS
  // mà DB không còn dòng neo vai. Trang phải giữ NGUYÊN hành vi cũ, không hoá trang rỗng.
  it("desync (JWT có vai QLCS, DB không có dòng UserOrgRole) → vẫn là trang 1 cơ sở neo", async () => {
    h.resolveActor.mockResolvedValue(
      actorOf("u-cm", [row("cs1", "CENTER_HR", [{ action: "hr_attendance:view", scopeType: "CENTER" }])]),
    );
    const { form, options } = await renderPage();
    expect(options).toEqual([]);
    expect(form).toEqual({ centerId: "c1", canEdit: true });
  });
});

describe("[L-A6] trang Checklist — vai KHÁC không rộng thêm một ly nào", () => {
  it("CENTER_HR: vẫn chọn tự do trong danh sách cơ sở, canEdit do checkPermission (như cũ)", async () => {
    login("u-hr", "CENTER_HR", "c1");
    h.resolveActor.mockResolvedValue(
      actorOf("u-hr", [row("cs1", "CENTER_HR", [{ action: "hr_attendance:view", scopeType: "CENTER" }])]),
    );
    const on = await renderPage({ centerId: "c2" });
    expect(on.options).toEqual(["c1", "c2", "c3"]);
    expect(on.form).toEqual({ centerId: "c2", canEdit: true });

    // Cổng VÀO trang vẫn cho qua (lần gọi đầu), nhưng quyền ở c2 thì không ⇒ chỉ đọc.
    h.checkPermission.mockReset().mockResolvedValueOnce(true).mockResolvedValue(false);
    const off = await renderPage({ centerId: "c2" });
    expect(off.form?.canEdit).toBe(false);
  });

  it("TEACHER kiêm tầm nhìn rộng (neo HO): thiếu quyền → form CHỈ ĐỌC", async () => {
    login("u-gv", "TEACHER", "c1");
    h.resolveActor.mockResolvedValue(
      actorOf("u-gv", [
        row("cs1", "TEACHER", [{ action: "hr_attendance:checkin", scopeType: "GLOBAL" }]),
        row("ho", "HO_HR", HO_HR_PERMS),
      ]),
    );
    // Cổng vào trang vẫn cho qua (mock true lần đầu), nhưng canEdit thì không.
    h.checkPermission.mockResolvedValueOnce(true).mockResolvedValue(false);
    const { form } = await renderPage({ centerId: "c3" });
    expect(form).toEqual({ centerId: "c3", canEdit: false });
  });

  it("SUPER_ADMIN → thấy mọi cơ sở, sửa được (hành vi KHÔNG đổi)", async () => {
    login("u-sa", "SUPER_ADMIN", null);
    h.resolveActor.mockResolvedValue(actorOf("u-sa", [row("ho", "SUPER_ADMIN")]));
    const { form, options } = await renderPage({ centerId: "c3" });
    expect(options).toEqual(["c1", "c2", "c3"]);
    expect(form).toEqual({ centerId: "c3", canEdit: true });
  });

  it("không đủ quyền vào trang → redirect /dashboard (cổng vào giữ nguyên)", async () => {
    h.checkPermission.mockResolvedValue(false);
    await expect(renderPage()).rejects.toThrow("REDIRECT");
    expect(h.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("chưa đăng nhập → redirect /login", async () => {
    h.auth.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("REDIRECT");
    expect(h.redirect).toHaveBeenCalledWith("/login");
  });
});
