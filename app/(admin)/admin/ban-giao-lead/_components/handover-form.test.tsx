/**
 * Màn BÀN GIAO LEAD — bộ test cho ĐƯỜNG MẶC ĐỊNH của người dùng.
 *
 * Vì sao phải test ở tầng component chứ không chỉ ở `lib/lead-handover/service.test.ts`:
 * bộ test service luôn truyền `filters: {}` (nhánh `onlyActive` chưa bao giờ bị chạm), nên
 * toàn bộ phần vá "kéo `Enrollment.saleId` + đóng kênh DM_SALE_PARENT của sale cũ" có thể
 * XANH 100% ở tầng dưới mà KHÔNG BAO GIỜ chạy khi người ta bấm nút thật.
 *
 * Cơ chế của cái bẫy đó:
 *   • lượt convert đặt `Lead.status = "ENROLLED"` VÀ tạo `Enrollment` (có `saleId`) trong
 *     CÙNG một thao tác (`lib/crm/convert-lead-v2.ts`) ⇒ **mọi lead CÓ ghi danh đều mang
 *     status ENROLLED**;
 *   • `onlyActive` dịch thành `status: { notIn: TERMINAL_STATUSES }`, mà `TERMINAL_STATUSES`
 *     (`lib/lead-handover/service.ts`) gồm đúng `ENROLLED`.
 * ⇒ Ô tick mặc định `true` = loại sạch đúng nhóm mà bản vá nhắm tới: `Enrollment.saleId`
 * không đổi, kênh riêng của sale cũ không đóng, job đối soát đêm cũng không dọn (vì
 * `saleId` vẫn khớp sale cũ) — trong khi giao diện vẫn báo "Đã chuyển N lead".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

type RunResult = {
  ok: boolean;
  error?: string;
  moved?: number;
  tasksMoved?: number;
  enrollmentsMoved?: number;
  enrollmentsUnassigned?: number;
  dmArchived?: number;
};

const h = vi.hoisted(() => ({
  previewHandoverAction: vi.fn(async () => ({ ok: true, count: 320 })),
  runHandoverAction: vi.fn(
    async (): Promise<{
      ok: boolean;
      error?: string;
      moved?: number;
      tasksMoved?: number;
      enrollmentsMoved?: number;
      enrollmentsUnassigned?: number;
      dmArchived?: number;
    }> => ({
      ok: true,
      moved: 320,
      tasksMoved: 12,
      enrollmentsMoved: 40,
      enrollmentsUnassigned: 0,
      dmArchived: 37,
    }),
  ),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}));
const { previewHandoverAction, runHandoverAction, toastSuccess, toastWarning } = h;

vi.mock("sonner", () => ({
  toast: { success: h.toastSuccess, error: h.toastError, warning: h.toastWarning },
}));
// Server Actions của trang — import thật sẽ kéo `@/lib/db` vào jsdom.
vi.mock("../_actions", () => ({
  previewHandoverAction: h.previewHandoverAction,
  runHandoverAction: h.runHandoverAction,
}));

import { HandoverForm } from "./handover-form";

const SALES = [
  { id: "sale-my", label: "Đinh Thảo My (đã nghỉ)" },
  { id: "sale-lien", label: "Lê Thị Phương Liên" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

/** Dựng màn hình + đi đúng thao tác thật: chọn 2 sale → Xem trước → Thực hiện. */
async function renderAndRun(): Promise<void> {
  const { container } = render(
    <HandoverForm sales={SALES} statuses={["NEW", "ENROLLED"]} campaigns={[]} />,
  );
  const selects = container.querySelectorAll("select");
  fireEvent.change(selects[0]!, { target: { value: "sale-my" } });
  fireEvent.change(selects[1]!, { target: { value: "sale-lien" } });

  fireEvent.click(screen.getByRole("button", { name: /xem trước/i }));
  await waitFor(() => expect(previewHandoverAction).toHaveBeenCalled());
  const runBtn = await screen.findByRole("button", { name: /thực hiện bàn giao/i });
  await waitFor(() => expect(runBtn).not.toBeDisabled());
  fireEvent.click(runBtn);
  await waitFor(() => expect(runHandoverAction).toHaveBeenCalled());
}

describe("bàn giao lead — đường mặc định KHÔNG được bỏ sót nhóm đã ghi danh", () => {
  it("mặc định gửi onlyActive = false ⇒ lead ENROLLED (nhóm DUY NHẤT có Enrollment) lọt vào lượt bàn giao", async () => {
    await renderAndRun();
    expect(previewHandoverAction).toHaveBeenCalledWith(
      expect.objectContaining({ onlyActive: false }),
    );
    expect(runHandoverAction).toHaveBeenCalledWith(
      expect.objectContaining({ onlyActive: false }),
    );
  });

  it("mặc định KHÔNG tick ô 'Chỉ lead chưa đóng'", () => {
    const { container } = render(
      <HandoverForm sales={SALES} statuses={["NEW"]} campaigns={[]} />,
    );
    const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(box?.checked).toBe(false);
  });

  it("tick ô đó thì phải NÓI RÕ hậu quả (không im lặng bỏ phần ghi danh + kênh chat)", () => {
    const { container } = render(
      <HandoverForm sales={SALES} statuses={["NEW"]} campaigns={[]} />,
    );
    const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(screen.queryByText(/kênh chat riêng của sale cũ/i)).toBeNull();
    fireEvent.click(box);
    expect(screen.getByText(/kênh chat riêng của sale cũ/i)).toBeInTheDocument();
  });
});

describe("bàn giao lead — báo cáo kết quả phải đủ số", () => {
  it("toast nói cả số ghi danh đổi sale VÀ số kênh chat đã đóng, không chỉ 'N lead'", async () => {
    await renderAndRun();
    const msg = String(toastSuccess.mock.calls[0]?.[0] ?? "");
    expect(msg).toContain("320 lead");
    expect(msg).toContain("40 ghi danh");
    expect(msg).toContain("37 kênh chat đóng");
  });

  it("có ghi danh bị gỡ phân công vì khác cơ sở ⇒ cảnh báo riêng để còn gán tay lại", async () => {
    const withStranded: RunResult = {
      ok: true,
      moved: 320,
      tasksMoved: 12,
      enrollmentsMoved: 30,
      enrollmentsUnassigned: 10,
      dmArchived: 37,
    };
    runHandoverAction.mockResolvedValueOnce(withStranded);
    await renderAndRun();
    expect(toastWarning).toHaveBeenCalledWith(expect.stringContaining("10 ghi danh"));
  });

  it("không có ghi danh nào bị gỡ ⇒ KHÔNG bắn cảnh báo thừa", async () => {
    await renderAndRun();
    expect(toastWarning).not.toHaveBeenCalled();
  });
});
