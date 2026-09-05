// @vitest-environment node
/**
 * NHẬT KÝ TÍCH HỢP của trục ZaloCRM (`IntegrationLog`).
 *
 * Bảng này là thứ làm mục "Tích hợp" ĐỎ LÊN khi webhook rơi vào 404/401. Nó vì thế
 * mang hai rủi ro ngược chiều nhau:
 *  · ghi quá ít ⇒ org gõ sai một ký tự trong `webhook_url` không để lại vết nào,
 *    triệu chứng là "hộp thư trống" chứ không phải "lỗi";
 *  · ghi quá nhiều / ghi nguyên văn ⇒ SĐT và nội dung chat nằm plaintext trong một
 *    bảng KHÔNG cách ly cơ sở (`IntegrationLog` không thuộc `SCOPED_MODELS` lẫn
 *    `SCOPE_EXEMPT`), và một máy chủ lạ có thể bơm dòng vô hạn.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state: { tao: unknown[]; nem: boolean; choQua: boolean } = {
  tao: [],
  nem: false,
  choQua: true,
};

vi.mock("@/lib/db", () => ({
  db: {
    integrationLog: {
      create: vi.fn(async (args: { data: unknown }) => {
        if (state.nem) throw new Error("Prisma ngã");
        state.tao.push(args.data);
        return { id: `log-${state.tao.length}` };
      }),
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ success: state.choQua, remaining: 0, resetAt: 0 })),
}));

import { ghiNhatKyZalocrm, providerLogKey } from "./log";

beforeEach(() => {
  state.tao = [];
  state.nem = false;
  state.choQua = true;
  // `vi.fn` trong factory của `vi.mock` sống suốt tệp — không xoá lượt gọi thì ca
  // "không hỏi rate-limit" đọc phải lượt gọi của ca TRƯỚC và xanh/đỏ sai lý do.
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const cuoi = () => state.tao[state.tao.length - 1] as Record<string, unknown>;

describe("ghiNhatKyZalocrm", () => {
  it("[ZC-LG-01] `contact.phone` bị đục khỏi requestPayload", async () => {
    await ghiNhatKyZalocrm({
      orgCode: "cs1",
      action: "WEBHOOK_NHAN_TIN",
      status: "FAILED",
      requestPayload: { data: { contact: { phone: "0912345678" }, content: "chào chị" } },
    });
    const ghi = JSON.stringify(cuoi().requestPayload);
    expect(ghi).not.toContain("0912345678");
    expect(ghi).not.toContain("chào chị");
  });

  it("provider là `ZALOCRM:<org>` — ăn đúng index [provider, status, createdAt]", async () => {
    // Màn Tích hợp lọc `provider: { startsWith: "ZALOCRM" }`; thiếu hậu tố org thì ba
    // cơ sở trộn vào một dòng thời gian và không tách được.
    expect(providerLogKey("cs2")).toBe("ZALOCRM:cs2");
    await ghiNhatKyZalocrm({ orgCode: "cs2", action: "X", status: "SUCCESS" });
    expect(cuoi().provider).toBe("ZALOCRM:cs2");
  });

  it("chiều mặc định là PULL — webhook là dữ liệu ĐI VÀO, không phải mình đẩy đi", async () => {
    await ghiNhatKyZalocrm({ orgCode: "cs1", action: "X", status: "SUCCESS" });
    expect(cuoi().direction).toBe("PULL");
  });

  it("errorMessage bị CẮT — cột Text nhưng đây là chuỗi từ máy chủ người khác", async () => {
    await ghiNhatKyZalocrm({
      orgCode: "cs1",
      action: "X",
      status: "FAILED",
      errorMessage: "z".repeat(5_000),
    });
    expect(String(cuoi().errorMessage).length).toBeLessThanOrEqual(1_000);
  });

  it("KHÔNG BAO GIỜ ném — nhật ký hỏng không được làm hỏng lượt webhook", async () => {
    state.nem = true;
    await expect(
      ghiNhatKyZalocrm({ orgCode: "cs1", action: "X", status: "FAILED" }),
    ).resolves.toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it("có khoá throttle và quá ngưỡng ⇒ KHÔNG ghi (chặn bơm dòng vô hạn)", async () => {
    // Đường "org lạ" nhận request từ bất kỳ ai: mỗi org bịa là một khoá rate-limit
    // riêng, nên nếu không có van thứ hai thì `IntegrationLog` phình không giới hạn.
    state.choQua = false;
    const id = await ghiNhatKyZalocrm({
      orgCode: "cs-la",
      action: "WEBHOOK_ORG_LA",
      status: "FAILED",
      khoaThrottle: "zalocrm:log-org-la:1.2.3.4",
    });
    expect(id).toBeNull();
    expect(state.tao.length).toBe(0);
  });

  it("không truyền khoá throttle ⇒ ghi thẳng, không hỏi rate-limit", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    await ghiNhatKyZalocrm({ orgCode: "cs1", action: "X", status: "SUCCESS" });
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it("responsePayload cũng được đục — phản hồi của fork có thể kèm SĐT", async () => {
    await ghiNhatKyZalocrm({
      orgCode: "cs1",
      action: "X",
      status: "SUCCESS",
      responsePayload: { contact: { phone: "0912345678", fullName: "Chị Lan" } },
    });
    const ghi = JSON.stringify(cuoi().responsePayload);
    expect(ghi).not.toContain("0912345678");
    expect(ghi).not.toContain("Chị Lan");
  });
});
