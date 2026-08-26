// @vitest-environment node
/**
 * S-2a — NÚT "Gửi" Ở HỘP THƯ MESSENGER BÁO THÀNH CÔNG GIẢ.
 *
 * Hiện trạng đo được (25/08/2026): `replyAction` ghi một dòng `MessengerMessage`
 * hướng OUT vào DB rồi trả `{ ok: true }`, và hộp trả lời bắn toast **"Đã gửi"**.
 * Trong toàn repo KHÔNG có một lời gọi nào ra Meta Send API — `graph.facebook.com`
 * chỉ xuất hiện ở `lib/crm/ads-insights.ts` (số liệu quảng cáo) và `lib/tracking.ts`
 * (CAPI). Tức **khách không nhận được gì**, còn người trực thì tin là đã trả lời.
 * Biên bản đã ký cũng ghi đúng vậy: `docs/sale-hub/bien-ban-chot-14-cau-2108.md`
 * gọi `MessengerConversation` là hội thoại **"một chiều"**.
 *
 * ⚠️ Thiệt hại KHÔNG dừng ở cái toast. `recordOutgoingMessage` set
 * `MessengerConversation.respondedAt` ở tin OUT đầu tiên, mà `lib/crm/sla.ts:71`
 * đọc đúng cột đó: `if (!respondedAt && over(firstMessageAt, ...)) push("SLA-0")`.
 * Nên mỗi lần bấm "Gửi" là **tắt cảnh báo chậm phản hồi** của một khách chưa hề
 * được trả lời — báo cáo SLA đẹp lên bằng số liệu bịa. Vá cái toast mà vẫn ghi
 * dòng OUT thì mới chữa được một nửa, nửa nguy hiểm hơn còn nguyên.
 *
 * Nối Send API thật là TÍCH HỢP NGOÀI (page access token theo từng `pageId`, cửa
 * sổ nhắn tin 24h, message tag) — ngoài phạm vi việc này. Nên chọn đường "nói
 * thật": chặn ở server, tắt ô nhập ở giao diện, ghi lý do tại chỗ.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { MESSENGER_SEND_SAN_SANG } from "@/lib/crm/messenger-send-gate";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  checkPermission: vi.fn(),
  resolveActor: vi.fn(),
  convFindUnique: vi.fn(),
  recordOutgoingMessage: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/auth/check-permission", () => ({ checkPermission: h.checkPermission }));
vi.mock("@/lib/auth/actor", () => ({ resolveActor: h.resolveActor }));
vi.mock("@/lib/db-scope", () => ({
  scopedDb: vi.fn(() => ({ messengerConversation: { findUnique: h.convFindUnique } })),
}));
vi.mock("@/lib/crm/messenger-service", () => ({
  recordOutgoingMessage: h.recordOutgoingMessage,
}));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));

import { replyAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "u-sale" } });
  h.checkPermission.mockResolvedValue(true);
  h.resolveActor.mockResolvedValue({ userId: "u-sale", isHoLevel: false });
  h.convFindUnique.mockResolvedValue({ id: "conv-1", respondedAt: null });
});

describe("[S-2a] hộp thư Messenger — không được báo 'đã gửi' khi không gửi", () => {
  it("người có quyền, nội dung hợp lệ → KHÔNG trả ok:true", async () => {
    const res = await replyAction("conv-1", "Dạ em chào chị ạ");
    expect(res.ok).toBe(false);
  });

  it("lời nhắn nói rõ vì sao chưa gửi được (nhắc Meta), không phải lỗi chung chung", async () => {
    const res = await replyAction("conv-1", "Dạ em chào chị ạ");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/Meta/);
    expect(res.error.length).toBeGreaterThan(20);
  });

  it("KHÔNG ghi dòng tin OUT — ghi là tự tay tắt cảnh báo SLA-0 của khách chưa ai trả lời", async () => {
    await replyAction("conv-1", "Dạ em chào chị ạ");
    expect(h.recordOutgoingMessage).not.toHaveBeenCalled();
  });

  it("cổng quyền giữ nguyên: chưa đăng nhập vẫn là 'Chưa đăng nhập'", async () => {
    h.auth.mockResolvedValue(null);
    const res = await replyAction("conv-1", "x");
    expect(res).toEqual({ ok: false, error: "Chưa đăng nhập" });
  });

  it("cổng quyền giữ nguyên: thiếu leads:edit vẫn là 'Không có quyền'", async () => {
    h.checkPermission.mockResolvedValue(false);
    const res = await replyAction("conv-1", "x");
    expect(res).toEqual({ ok: false, error: "Không có quyền" });
  });
});

describe("[S-2a] chốt chặn nguồn — cờ phải khớp SỰ THẬT trong mã", () => {
  /**
   * Hai chiều, cố ý: hôm nay bắt cờ TẮT vì chưa có đường gửi; ngày ai đó nối
   * Send API thật thì test này đỏ và bắt họ bật cờ + gỡ chốt chặn ở giao diện.
   * Không có nó, cờ tắt sẽ nằm lại vĩnh viễn sau khi tích hợp xong.
   */
  it("`MESSENGER_SEND_SAN_SANG` bật ⟺ trong lib/crm có lời gọi Send API", () => {
    const svc = fs.readFileSync("lib/crm/messenger-service.ts", "utf8");
    const gate = fs.readFileSync("lib/crm/messenger-send-gate.ts", "utf8");
    const boChuThich = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    const coDuongGui = /\/messages\b/.test(boChuThich(svc) + boChuThich(gate));
    expect(MESSENGER_SEND_SAN_SANG).toBe(coDuongGui);
  });

  it("giao diện hộp trả lời không được bỏ chốt: có nhắc cờ cổng gửi", () => {
    const ui = fs.readFileSync(
      "app/(admin)/admin/crm/messenger/_components/reply-box.tsx",
      "utf8",
    );
    expect(ui).toContain("MESSENGER_SEND_SAN_SANG");
  });
});
