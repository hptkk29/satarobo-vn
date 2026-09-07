// Cầu dao "Điều chỉnh khoản thu" — chặn CẢ SUPER_ADMIN.
//
// Vì sao cần ca này (07/09/2026): lớp quyền `payments:adjust` KHÔNG khoá được
// SUPER_ADMIN trên prod — `can()` v2 (lib/auth/can.ts:52) trả true vô điều kiện trước
// khi tra bảng. Cầu dao sinh ra chính vì lỗ đó, nên phải có bằng chứng nó bịt được.
//
// Test gọi THẲNG `adjustPaymentAction` với phiên SUPER_ADMIN và khẳng định hai điều:
// action trả về thông điệp cầu dao, và `adjustPayment` của tầng lib KHÔNG hề được gọi.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// Phiên SUPER_ADMIN — vai cao nhất, đúng thứ mà lớp quyền để lọt.
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "u-super", name: "Chủ hệ thống", email: "super@satarobo.vn", role: "SUPER_ADMIN" },
  })),
}));
// Quyền trả TRUE hết — mô phỏng đúng hành vi v2 với SUPER_ADMIN. Cầu dao vẫn phải chặn.
vi.mock("@/lib/auth/check-permission", () => ({
  checkPermission: vi.fn(async () => true),
  assertPermission: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/actor", () => ({ resolveActor: vi.fn(async () => ({ userId: "u-super" })) }));
vi.mock("@/lib/db-scope", () => ({
  scopedDb: vi.fn(() => ({})),
  passesScope: vi.fn(() => true),
}));
vi.mock("@/lib/audit/audit-log", () => ({ writeAudit: vi.fn(async () => ({})) }));
vi.mock("@/lib/audit/log", () => ({ getAuditActor: vi.fn(async () => ({ id: "u-super", name: "x" })) }));
vi.mock("@/lib/audit/headers", () => ({ getRequestMetadata: vi.fn(async () => ({})) }));
vi.mock("@/lib/finance/payment", () => ({
  recordPayment: vi.fn(),
  confirmPayment: vi.fn(),
  rejectPayment: vi.fn(),
  adjustPayment: vi.fn(async () => ({ ok: true, adjustmentId: "KHONG-DUOC-PHEP" })),
  refundPayment: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { writeAudit } from "@/lib/audit/audit-log";
import { adjustPayment } from "@/lib/finance/payment";
import { adjustPaymentAction } from "@/app/(admin)/admin/payments/_actions";
import {
  ADJUST_PAYMENT_DISABLED,
  ADJUST_PAYMENT_DISABLED_MESSAGE,
} from "@/lib/finance/cau-dao-dieu-chinh";

const adjustLib = adjustPayment as unknown as Mock;
const audit = writeAudit as unknown as Mock;

beforeEach(() => {
  adjustLib.mockClear();
  audit.mockClear();
});

describe("Cầu dao điều chỉnh khoản thu", () => {
  it("đang BẬT (tính năng tắt)", () => {
    expect(ADJUST_PAYMENT_DISABLED).toBe(true);
  });

  it("thông điệp nói ĐÚNG SỰ THẬT — tạm khoá, không phải thiếu quyền", () => {
    // Nói "bạn không có quyền" với kế toán là đổ lỗi sai chỗ: họ có quyền, tính năng
    // mới là thứ đang hỏng.
    expect(ADJUST_PAYMENT_DISABLED_MESSAGE).toMatch(/tạm khoá/i);
    expect(ADJUST_PAYMENT_DISABLED_MESSAGE).not.toMatch(/không có quyền/i);
  });

  it("chặn SUPER_ADMIN — dù quyền trả về true hết", async () => {
    const res = await adjustPaymentAction({
      paymentId: "pay-1",
      amount: 3_500_000,
      reason: "Kế toán gõ nhầm số",
    });
    expect(res).toEqual({ ok: false, error: ADJUST_PAYMENT_DISABLED_MESSAGE });
  });

  it("KHÔNG chạm tới tầng lib — không bút toán nào được sinh", async () => {
    await adjustPaymentAction({
      paymentId: "pay-1",
      amount: 3_500_000,
      reason: "Kế toán gõ nhầm số",
    });
    expect(adjustLib).not.toHaveBeenCalled();
  });

  it("ghi lại người chạm cầu dao — ai, khoản nào", async () => {
    await adjustPaymentAction({ paymentId: "pay-42", amount: 1, reason: "thử" });
    expect(audit).toHaveBeenCalledTimes(1);
    const arg = audit.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.action).toBe("ADJUST_BLOCKED");
    expect(arg.entityId).toBe("pay-42");
    expect((arg.actor as { id: string }).id).toBe("u-super");
  });

  it("input rác vẫn ghi log được, không nổ", async () => {
    // Gọi thẳng endpoint với payload sai hình dạng — cầu dao chặn TRƯỚC zod nên
    // không được phép ném.
    const res = await adjustPaymentAction({ khong: "phai-payload" });
    expect(res).toEqual({ ok: false, error: ADJUST_PAYMENT_DISABLED_MESSAGE });
    const arg = audit.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.entityId).toBe("(không rõ)");
  });
});
