// @vitest-environment node
//
// Ca [QHD-*] — nhánh HOÁ ĐƠN của worker hàng đợi email (`processEmailQueue`, PLAN §7), bằng mock.
// Bản chạm DB của luật đọc lại hoá đơn ở `tests/finance/hoa-don-email.test.ts`; ở đây đo DÂY NỐI:
//   · dòng `contextType = HoaDonGuiEmail` ⇒ hỏi `chuanBiGuiHoaDon` TRƯỚC khi gửi;
//   · bị chặn (hoá đơn không còn hiệu lực) ⇒ FAILED ngay, KHÔNG gửi, ghi LOI lên lượt gửi;
//   · gửi được ⇒ `sendEmail` nhận đúng đính kèm + khoá chống gửi đôi, rồi ghi DA_GUI;
//   · dòng email THƯỜNG không đi qua nhánh này.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(async () => ({})),
  send: vi.fn(),
  chuanBi: vi.fn(),
  ghiKq: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db", () => ({
  db: {
    emailQueue: { findMany: h.findMany, update: h.update },
    emailTemplate: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock("./send", () => ({ sendEmail: h.send }));
vi.mock("@/lib/finance/hoa-don/dinh-kem-email", () => ({
  NGU_CANH_EMAIL_HOA_DON: "HoaDonGuiEmail",
  chuanBiGuiHoaDon: h.chuanBi,
  ghiKetQuaGuiHoaDon: h.ghiKq,
}));

import { processEmailQueue } from "./queue";

const dong = (o: Record<string, unknown> = {}) => ({
  id: "q1",
  toEmail: "ph@example.com",
  toName: null,
  templateKey: null,
  subject: "Hoá đơn điện tử 1C26TSR - 127",
  bodyText: "Nội dung",
  bodyHtml: "<p>Nội dung</p>",
  payload: {},
  contextType: "HoaDonGuiEmail",
  contextId: "gui1",
  attempts: 0,
  maxAttempts: 3,
  scheduledAt: new Date("2026-09-26T00:00:00Z"),
  ...o,
});
const DINH_KEM = [{ filename: "hd.pdf", path: "https://r2.test/hoa-don/x.pdf" }];

beforeEach(() => {
  vi.clearAllMocks();
  h.send.mockResolvedValue({ ok: true, logId: "log1", resendId: "r1" });
});

describe("[QHD-01] dòng hoá đơn", () => {
  it("gửi được ⇒ sendEmail nhận đính kèm + idempotencyKey; ghi DA_GUI", async () => {
    h.findMany.mockResolvedValue([dong()]);
    h.chuanBi.mockResolvedValue({ ok: true, attachments: DINH_KEM, idempotencyKey: "hoa-don:gui1" });
    expect(await processEmailQueue()).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(h.chuanBi).toHaveBeenCalledWith("gui1");
    expect(h.send.mock.calls[0]![0]).toMatchObject({ attachments: DINH_KEM, idempotencyKey: "hoa-don:gui1" });
    expect(h.ghiKq).toHaveBeenCalledWith("gui1", { daGui: true });
  });

  it("hoá đơn không còn hiệu lực (chặn) ⇒ FAILED ngay, KHÔNG gửi, lượt gửi LOI cuối cùng", async () => {
    h.findMany.mockResolvedValue([dong()]);
    h.chuanBi.mockResolvedValue({ ok: false, chan: true, loi: "Hoá đơn không còn hiệu lực" });
    expect(await processEmailQueue()).toEqual({ processed: 1, sent: 0, failed: 1 });
    expect(h.send).not.toHaveBeenCalled();
    expect((h.update.mock.calls[0] as unknown as [{ data: { status: string } }])[0].data.status).toBe("FAILED");
    expect(h.ghiKq).toHaveBeenCalledWith("gui1", { daGui: false, loi: "Hoá đơn không còn hiệu lực", cuoiCung: true });
  });

  it("lỗi tạm (ký URL hỏng) ⇒ giữ PENDING để thử lại, lượt gửi CHƯA LOI", async () => {
    h.findMany.mockResolvedValue([dong()]);
    h.chuanBi.mockResolvedValue({ ok: false, chan: false, loi: "Kho chưa cấu hình" });
    await processEmailQueue();
    expect(h.send).not.toHaveBeenCalled();
    expect((h.update.mock.calls[0] as unknown as [{ data: { status: string } }])[0].data.status).toBe("PENDING");
    expect(h.ghiKq).toHaveBeenCalledWith("gui1", { daGui: false, loi: "Kho chưa cấu hình", cuoiCung: false });
  });

  it("Resend lỗi ở lần cuối ⇒ lượt gửi LOI cuối cùng", async () => {
    h.findMany.mockResolvedValue([dong({ attempts: 2 })]);
    h.chuanBi.mockResolvedValue({ ok: true, attachments: DINH_KEM, idempotencyKey: "hoa-don:gui1" });
    h.send.mockResolvedValue({ ok: false, logId: "log1", error: "rate limited" });
    await processEmailQueue();
    expect(h.ghiKq).toHaveBeenCalledWith("gui1", { daGui: false, loi: "rate limited", cuoiCung: true });
  });
});

describe("[QHD-02] dòng email THƯỜNG không đi qua nhánh hoá đơn", () => {
  it("contextType khác ⇒ không hỏi chuanBi, không đính kèm, không ghi lượt gửi hoá đơn", async () => {
    h.findMany.mockResolvedValue([dong({ contextType: "Lead", contextId: "l1" })]);
    await processEmailQueue();
    expect(h.chuanBi).not.toHaveBeenCalled();
    expect(h.ghiKq).not.toHaveBeenCalled();
    expect(h.send.mock.calls[0]![0]).toMatchObject({ attachments: undefined, idempotencyKey: undefined });
  });
});
