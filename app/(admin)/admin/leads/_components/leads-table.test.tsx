/**
 * A-03 — NÚT XUẤT LEAD ở /admin/leads.
 *
 * Vì sao phải test phía GỌI, không chỉ phía route: `app/api/admin/leads/export/route.test.ts`
 * phủ kỹ 6 ca cổng quyền, nhưng nó gọi `GET()` trực tiếp nên không nhìn thấy được rằng bảng
 * lead vẫn render nút vô điều kiện. Mà nút này là thẻ `<a … download>`: trình duyệt LƯU
 * phần thân 403 thành một file tên `export` chứa `{"error":"Forbidden"}` — không toast,
 * không trang lỗi. Người dùng mở bằng Excel thấy rác và tưởng hệ thống hỏng file.
 *
 * Bối cảnh làm chuyện này thành ca THƯỜNG GẶP chứ không phải ca hiếm: A-03 gỡ `leads:export`
 * khỏi MỌI vai (`lib/auth/permissions.ts` chỉ còn SUPER_ADMIN; `prisma/seed-roles.ts` gỡ khỏi
 * HO_MARKETING và CENTER_MANAGER), cấp lại qua NHÓM quyền. Nghĩa là sau khi seed, quản lý cơ
 * sở / Marketing — hai vai VẪN có `leads:view-all` nên vẫn vào được trang — mặc định KHÔNG
 * còn quyền xuất.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
  useSearchParams: () => searchParams,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Server Actions của trang — import thật sẽ kéo `@/lib/db` vào jsdom.
vi.mock("../actions", () => ({
  updateLeadNote: vi.fn(),
  updateLeadStatus: vi.fn(),
  deleteLead: vi.fn(),
}));

import { LeadsTable, type LeadRow } from "./leads-table";

const LEAD: LeadRow = {
  id: "lead-1",
  parentName: "Nguyễn Văn A",
  phone: "0900000001",
  email: null,
  childName: "Bé A",
  childAge: 8,
  status: "NEW",
  source: "WEBSITE",
  note: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  eventId: null,
  landingPage: null,
  referrer: null,
  ipAddress: null,
  userAgent: null,
  consentMarketing: true,
  createdAt: "2026-08-20T03:00:00.000Z",
  center: { name: "Cơ sở 1" },
  courseName: "Lập trình Robot",
  assignedTo: { name: "Sale A" },
  isSharedWithTeam: false,
  assignedToId: null,
};

function bay(canExport: boolean) {
  return render(
    <LeadsTable
      leads={[LEAD]}
      total={1}
      page={1}
      pageSize={20}
      canUpdate={false}
      canDelete={false}
      canExport={canExport}
      currentUserId="u-1"
    />,
  );
}

/** Nút xuất = thẻ `<a download>` trỏ vào route xuất. Tìm theo ĐÍCH ĐẾN, không theo nhãn. */
const timNutXuat = (): HTMLAnchorElement | null =>
  document.querySelector<HTMLAnchorElement>('a[href^="/api/admin/leads/export"]');

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
});

describe("[A-03 · L-A7] nút xuất lead theo quyền `leads:export`", () => {
  it("KHÔNG có quyền xuất ⇒ không render nút nào trỏ vào /api/admin/leads/export", () => {
    bay(false);

    expect(timNutXuat()).toBeNull();
    // Và không còn chữ "Xuất" nào lảng vảng ở thanh lọc.
    expect(screen.queryByText(/xuất/i)).toBeNull();
  });

  it("bảng vẫn hiển thị bình thường khi không có quyền xuất (không phải khoá cả trang)", () => {
    bay(false);

    expect(screen.getByText("Nguyễn Văn A")).toBeInTheDocument();
  });

  it("CÓ quyền xuất ⇒ nút hiện, trỏ đúng route, giữ thuộc tính `download`", () => {
    bay(true);

    const a = timNutXuat();
    expect(a).not.toBeNull();
    expect(a?.getAttribute("href")).toBe("/api/admin/leads/export");
    expect(a?.hasAttribute("download")).toBe(true);
  });

  it("nhãn nói ĐÚNG định dạng route trả về (.xlsx từ A-03), không còn 'CSV'", () => {
    bay(true);

    const a = timNutXuat();
    expect(a?.textContent ?? "").toMatch(/Excel/i);
    expect(a?.textContent ?? "").not.toMatch(/CSV/i);
    expect(a?.getAttribute("title") ?? "").not.toMatch(/CSV/i);
  });

  it("bộ lọc đang áp (trạng thái + từ khoá) đi theo link xuất — xuất đúng thứ đang xem", () => {
    render(
      <LeadsTable
        leads={[LEAD]}
        total={1}
        page={1}
        pageSize={20}
        canUpdate={false}
        canDelete={false}
        canExport
        currentStatus="NEW"
        currentQ="an nhiên"
        currentUserId="u-1"
      />,
    );

    const href = timNutXuat()?.getAttribute("href") ?? "";
    expect(href).toContain("status=NEW");
    expect(href).toContain(`q=${encodeURIComponent("an nhiên")}`);
  });
});
