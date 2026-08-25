// @vitest-environment node
/**
 * A-03-7 / [L-A4] — màn override từng người CHẶN CỨNG mọi khoá `leads:*`.
 *
 * Vì sao một thao tác quản trị trông vô hại lại là lỗ rò lớn nhất của khu vực A:
 * `lib/db-scope.ts:246-252` duyệt `actor.grantsAllow`, thấy action bắt đầu bằng prefix
 * của model là đặt `hasAll = true` → `getModelVisibleCenterIds` trả `"ALL"` →
 * `injectScope` trả `args` NGUYÊN VẸN. Prefix của `Lead` là `["leads:"]`
 * (`lib/db-scope.ts:133`), và `MessengerConversation` dùng CHUNG prefix đó (`:136`).
 * ⇒ Cấp BẤT KỲ khoá `leads:*` nào cho một người qua màn này sẽ **tắt cách ly cơ sở**
 * của cả `Lead` lẫn hội thoại Messenger cho người đó — trên UI lẫn trong file xuất.
 * Không phải chỉ `leads:export`; nên rào là theo TIỀN TỐ, không theo danh sách khoá.
 *
 * Hai điều file này pin mà đọc mã bằng mắt rất dễ bỏ sót:
 *
 * 1. **Rào phải chặn cả `DENY`, không chỉ `ALLOW`.** Bản trước chỉ chặn khi
 *    `grant === "ALLOW"` (`_actions.ts:69-70`). Đường vòng: tạo `DENY leads:export`
 *    (lọt, vì không phải ALLOW) → gọi `updateGrantAction` đổi sang `ALLOW`. Kết quả:
 *    có ALLOW mà không qua rào nào.
 * 2. **`updateGrantAction` phải có CÙNG rào.** Nó vốn không kiểm khoá nào cả — chỉ
 *    validate `grant` + `reason`. Chặn ở mỗi `addGrantAction` là chưa đủ.
 *
 * Kiểm bằng "DB có bị ghi không", không bằng chuỗi thông báo lỗi: một action trả
 * `{ ok: false }` sau khi đã `create` vẫn là quyền đã cấp.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type GrantRow = { userId: string; action: string; grant: "ALLOW" | "DENY" };

const h = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  findUniqueGrant: vi.fn(),
  findUniqueUser: vi.fn(),
  userUpdate: vi.fn(),
  logGrantAudit: vi.fn(),
  checkPermission: vi.fn(),
}));

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`NEXT_REDIRECT:${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "admin-1", name: "Quản trị" } }) }));
vi.mock("@/lib/auth/check-permission", () => ({ checkPermission: h.checkPermission }));
vi.mock("@/lib/auth/actor", () => ({ resolveActor: async (userId: string) => ({ userId }) }));
vi.mock("@/lib/db-scope", () => ({
  scopedDb: () => ({
    user: { findUnique: h.findUniqueUser, update: h.userUpdate },
    userPermissionGrant: {
      findUnique: h.findUniqueGrant,
      create: h.create,
      update: h.update,
      delete: vi.fn(),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        userPermissionGrant: { create: h.create, update: h.update, delete: vi.fn() },
        user: { update: h.userUpdate },
      }),
  }),
}));
vi.mock("@/lib/audit/log", () => ({
  logGrantAudit: h.logGrantAudit,
  getAuditActor: () => ({ actorId: "admin-1", actorName: "Quản trị" }),
}));

import { addGrantAction, updateGrantAction } from "./_actions";

function form(action: string, grant: "ALLOW" | "DENY", reason = "Lý do hợp lệ cho việc cấp quyền"): FormData {
  const fd = new FormData();
  fd.set("action", action);
  fd.set("grant", grant);
  fd.set("reason", reason);
  return fd;
}

/** Grant đang tồn tại trong DB (đường `updateGrantAction` đọc ở `:147-150`). */
function existing(row: GrantRow) {
  h.findUniqueGrant.mockResolvedValue(row);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.checkPermission.mockResolvedValue(true); // người thao tác CÓ users:manage
  h.findUniqueUser.mockResolvedValue({ id: "u-2", role: "CENTER_MANAGER" });
  h.findUniqueGrant.mockResolvedValue(null); // mặc định: chưa có grant trùng
  h.create.mockResolvedValue({ id: "g-1" });
  h.update.mockResolvedValue({ id: "g-1" });
  h.userUpdate.mockResolvedValue({ id: "u-2" });
  h.logGrantAudit.mockResolvedValue(undefined);
});

// ─── Thêm grant ─────────────────────────────────────────────────────────────

describe("[A-03-7 · L-A4] addGrantAction chặn mọi khoá leads:*", () => {
  it.each([
    ["leads:export", "ALLOW"],
    ["leads:export", "DENY"], // 🔴 chặn cả DENY: đóng đường DENY-rồi-đổi-thành-ALLOW
    ["leads:view-all", "ALLOW"],
    ["leads:view-pii", "ALLOW"], // prefix `leads:` ⇒ cũng bật hasAll ⇒ cũng phải chặn
    ["leads:import", "ALLOW"],
  ] as const)("%s / %s → từ chối, KHÔNG ghi UserPermissionGrant", async (action, grant) => {
    const res = await addGrantAction("u-2", form(action, grant));

    expect(res.ok).toBe(false);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.logGrantAudit).not.toHaveBeenCalled();
  });

  it("rào cũ (roles:* / users:manage) vẫn nguyên — và nay chặn cả DENY", async () => {
    for (const [action, grant] of [
      ["roles:assign", "ALLOW"],
      ["roles:manage", "DENY"],
      ["users:manage", "ALLOW"],
    ] as const) {
      const res = await addGrantAction("u-2", form(action, grant));
      expect({ action, grant, ok: res.ok }).toEqual({ action, grant, ok: false });
    }
    expect(h.create).not.toHaveBeenCalled();
  });

  it("khoá KHÔNG thuộc nhóm cấm vẫn cấp được (rào không phình ra quá tay)", async () => {
    const res = await addGrantAction("u-2", form("payments:view-pii", "ALLOW"));

    expect(res.ok).toBe(true);
    expect(h.create).toHaveBeenCalledTimes(1);
    const [arg] = h.create.mock.calls[0] as [{ data: { action: string; grant: string } }];
    expect(arg.data).toMatchObject({ action: "payments:view-pii", grant: "ALLOW" });
  });
});

// ─── Sửa grant ──────────────────────────────────────────────────────────────

describe("[A-03-7 · L-A4] updateGrantAction có CÙNG rào (đóng đường vòng)", () => {
  it("🔴 grant DENY leads:export đã tồn tại → KHÔNG đổi được sang ALLOW", async () => {
    existing({ userId: "u-2", action: "leads:export", grant: "DENY" });

    const res = await updateGrantAction("g-1", form("leads:export", "ALLOW"));

    expect(res.ok).toBe(false);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.logGrantAudit).not.toHaveBeenCalled();
  });

  it("grant leads:* cũ (nếu lỡ tồn tại từ trước) không sửa được theo chiều nào", async () => {
    existing({ userId: "u-2", action: "leads:view-pii", grant: "ALLOW" });

    const res = await updateGrantAction("g-1", form("leads:view-pii", "DENY"));

    expect(res.ok).toBe(false);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("roles:* cũng bị chặn ở đường sửa", async () => {
    existing({ userId: "u-2", action: "roles:assign", grant: "DENY" });

    const res = await updateGrantAction("g-1", form("roles:assign", "ALLOW"));

    expect(res.ok).toBe(false);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("khoá thường vẫn sửa được", async () => {
    existing({ userId: "u-2", action: "payments:view-pii", grant: "DENY" });

    const res = await updateGrantAction("g-1", form("payments:view-pii", "ALLOW"));

    expect(res.ok).toBe(true);
    expect(h.update).toHaveBeenCalledTimes(1);
  });
});

// ─── Cổng quyền của chính màn này (không được rơi rụng khi thêm rào) ────────

describe("cổng users:manage vẫn đứng trước mọi thứ", () => {
  it("không có users:manage → redirect, không đọc/ghi gì", async () => {
    h.checkPermission.mockResolvedValue(false);

    await expect(addGrantAction("u-2", form("payments:view-pii", "ALLOW"))).rejects.toBeInstanceOf(
      RedirectSignal,
    );
    expect(h.create).not.toHaveBeenCalled();
  });
});
