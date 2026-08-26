/**
 * TRANG SỬA TÀI KHOẢN — ô "Hành động nhạy cảm" phải NÓI ĐƯỢC kết quả bật/tắt.
 *
 * LỖI ĐƯỢC VÁ (bản cũ, page.tsx:256-261): nút bật/tắt là `<form action={async () => {
 * "use server"; await toggleUserActiveAction(user.id); }}>` — gọi xong VỨT giá trị trả về.
 * Mà `toggleUserActiveAction` (app/(admin)/admin/users/_actions.ts:413-503) KHÔNG ném lỗi,
 * nó TRẢ VỀ `{ ok:false, error }` ở 4 nhánh: tự-disable (:419), không tìm thấy user (:426),
 * SUPER_ADMIN duy nhất (:441), và lỗi DB đã bắt (:490). Cả 4 câu đó rơi vào hư không: người
 * dùng bấm nút, trang render lại y nguyên, KHÔNG một chữ nào. Đây là kiểu hỏng câm — người
 * vận hành tưởng đã tắt tài khoản trong khi nó vẫn đang bật.
 *
 * ⚠️ ĐÂY KHÔNG PHẢI LỖI PHÂN QUYỀN, không có chiều "cơ sở" nào ở đây. Cổng GHI thật vẫn nằm
 * nguyên trong `toggleUserActiveAction` (`requireUsersManage` → auth + checkPermission
 * "users:manage", rồi `scopedDb`). Hai thuộc tính `disabled`/`title` của nút chỉ là lớp
 * TRANG TRÍ báo trước — bởi vậy test dưới đây kiểm cả hai mặt: nút khoá đúng lúc, VÀ khi
 * server từ chối thì câu từ chối đến được mắt người.
 *
 * CÁCH GHIM: `scopedDb` bị thay bằng client GIẢ không lọc gì, nên mọi thứ test khẳng định là
 * do CHÍNH trang quyết định, không phải do tầng đọc lọc hộ. `redirect`/`notFound` được mock
 * NÉM lỗi như bản thật của Next — nếu chúng chỉ ghi nhận lời gọi rồi để hàm chạy tiếp thì
 * một trang mất gate vẫn "có gọi redirect" mà test vẫn xanh.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Role } from "@prisma/client";

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
  roles: Role[];
  orgUnitId: string | null;
  employeeId: string | null;
  isActive: boolean;
  tokenVersion: number;
  createdAt: Date;
  lastLoginAt: Date | null;
  employee: { id: string; fullName: string; employeeCode: string | null } | null;
  center: { id: string; name: string } | null;
  _count: { permissionGrants: number };
};

type ToggleResult = { ok: boolean; error?: string };

// ── Trạng thái bàn thí nghiệm (đọc LÚC GỌI, nên khai top-level được) ──────────
let row: UserRow;
let superAdminCount: number;
let orgUnits: { orgUnitId: string; name: string }[];

const auth = vi.fn(async () => ({ user: { id: "admin-1" } }));
const checkPermission = vi.fn(async (_action: string) => true);
const resolveActor = vi.fn(async (userId: string) => ({ userId }) as unknown);
const toggleUserActiveAction = vi.fn(
  async (_id: string): Promise<ToggleResult> => ({ ok: true }),
);
const deleteUserAction = vi.fn(
  async (_id: string): Promise<ToggleResult> => ({ ok: true }),
);
const toastSuccess = vi.fn();
const toastError = vi.fn();

class RedirectSignal extends Error {}
class NotFoundSignal extends Error {}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(`NEXT_REDIRECT:${to}`);
  },
  notFound: () => {
    throw new NotFoundSignal("NEXT_NOT_FOUND");
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/auth", () => ({ auth: () => auth() }));
vi.mock("@/lib/auth/check-permission", () => ({
  checkPermission: (action: string) => checkPermission(action),
}));
vi.mock("@/lib/auth/actor", () => ({
  resolveActor: (userId: string) => resolveActor(userId),
}));
vi.mock("@/lib/org/org-service", () => ({
  getSelectableOrgUnits: async () => orgUnits,
}));

// Client GIẢ: trả nguyên si, KHÔNG đọc `where`. Mọi kết luận của test là do cổng của
// trang, không phải do tầng đọc lọc hộ.
vi.mock("@/lib/db-scope", () => ({
  scopedDb: () => ({
    user: {
      findFirst: async () => row,
      count: async () => superAdminCount,
    },
    employee: { findMany: async () => [] },
    userOrgRole: { count: async () => 0 },
  }),
}));

// Form sửa tài khoản kéo theo react-hook-form + server action — ngoài phạm vi file này.
vi.mock("../../_components/user-form", () => ({
  UserForm: () => <div data-testid="user-form" />,
}));

// Server Actions — import thật sẽ kéo `@/lib/db` vào jsdom. Cùng module với đường
// `../_actions` mà `user-row-actions.tsx` import, nên một mock phủ cả hai.
vi.mock("../../_actions", () => ({
  toggleUserActiveAction: (id: string) => toggleUserActiveAction(id),
  deleteUserAction: (id: string) => deleteUserAction(id),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

import EditUserPage from "./page";

function baseRow(over: Partial<UserRow> = {}): UserRow {
  return {
    id: "u-2",
    email: "nhanvien@satarobo.vn",
    name: "Nhân Viên",
    role: "SALES_CSM" as Role,
    roles: ["SALES_CSM"] as Role[],
    orgUnitId: "ou-cs1",
    employeeId: null,
    isActive: true,
    tokenVersion: 3,
    createdAt: new Date("2026-01-02T03:04:00Z"),
    lastLoginAt: new Date("2026-08-20T03:04:00Z"),
    employee: null,
    center: { id: "cs1", name: "Cơ sở 1" },
    _count: { permissionGrants: 0 },
    ...over,
  };
}

async function moTrang() {
  return render(await EditUserPage({ params: Promise.resolve({ id: row.id }) }));
}

/** Nút bật/tắt trong ô "Hành động nhạy cảm" — nhãn theo trạng thái hiện tại. */
function nutBatTat(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: /Hoạt động|Đã disable/,
  }) as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "admin-1" } });
  checkPermission.mockResolvedValue(true);
  toggleUserActiveAction.mockResolvedValue({ ok: true });
  deleteUserAction.mockResolvedValue({ ok: true });
  orgUnits = [{ orgUnitId: "ou-cs1", name: "Cơ sở 1" }];
  superAdminCount = 2;
  row = baseRow();
});

describe("Sửa tài khoản — bật/tắt phải có phản hồi", () => {
  it("server từ chối → hiện ĐÚNG câu từ chối, không nuốt im lặng", async () => {
    toggleUserActiveAction.mockResolvedValue({
      ok: false,
      error: "Không thể disable SUPER_ADMIN duy nhất",
    });
    await moTrang();

    fireEvent.click(nutBatTat());

    await waitFor(() => expect(toggleUserActiveAction).toHaveBeenCalledWith("u-2"));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Không thể disable SUPER_ADMIN duy nhất",
      ),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("server lỗi mà không nêu lý do → vẫn có câu mặc định, không im", async () => {
    toggleUserActiveAction.mockResolvedValue({ ok: false });
    await moTrang();

    fireEvent.click(nutBatTat());

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Lỗi thao tác"));
  });

  it("thành công cũng báo — người bấm biết việc đã xong", async () => {
    await moTrang();

    fireEvent.click(nutBatTat());

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Đã disable tài khoản"),
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it("không còn <form> server-action nuốt kết quả", async () => {
    await moTrang();
    const nut = nutBatTat();

    // `<form action={serverAction}>` submit xong là điều hướng lại: kết quả trả về
    // không có đường nào tới người dùng. Nút phải là nút thường, ngoài mọi form.
    expect(nut.type).toBe("button");
    expect(nut.closest("form")).toBeNull();
  });
});

describe("Sửa tài khoản — hai chặn báo trước vẫn nguyên", () => {
  it("chính mình → khoá nút + nêu lý do + không gọi server", async () => {
    row = baseRow({ id: "admin-1" });
    await moTrang();
    const nut = nutBatTat();

    expect(nut).toBeDisabled();
    expect(nut).toHaveAttribute("title", "Không thể tự disable chính mình");

    fireEvent.click(nut);
    expect(toggleUserActiveAction).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("SUPER_ADMIN đang bật DUY NHẤT → khoá nút + nêu lý do", async () => {
    row = baseRow({ id: "u-9", role: "SUPER_ADMIN" as Role, roles: ["SUPER_ADMIN"] as Role[] });
    superAdminCount = 1;
    await moTrang();
    const nut = nutBatTat();

    expect(nut).toBeDisabled();
    expect(nut).toHaveAttribute("title", "Không thể disable SUPER_ADMIN duy nhất");
  });

  it("còn SUPER_ADMIN khác đang bật → mở khoá, bấm được", async () => {
    row = baseRow({ id: "u-9", role: "SUPER_ADMIN" as Role, roles: ["SUPER_ADMIN"] as Role[] });
    superAdminCount = 2;
    await moTrang();
    const nut = nutBatTat();

    expect(nut).not.toBeDisabled();
    fireEvent.click(nut);
    await waitFor(() => expect(toggleUserActiveAction).toHaveBeenCalledWith("u-9"));
  });

  it("tài khoản đã tắt → nút mời bật lại, thành công báo đúng câu", async () => {
    row = baseRow({ isActive: false });
    await moTrang();

    fireEvent.click(nutBatTat());

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Đã kích hoạt tài khoản"),
    );
  });
});
