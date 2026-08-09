// @vitest-environment node
/**
 * Khoá HAI bất biến của đường subscribe THẬT (`subscribeConversation`) — đường mà
 * production dùng, và trước bài test này KHÔNG có gì chạm tới:
 *
 *   • `_zztest-chat-us02.ts` tự dựng channel riêng để kiểm policy RLS, nên nó chứng
 *     minh CẤU HÌNH Supabase đúng, không chứng minh CLIENT của ta gọi đúng.
 *   • `use-chat-channel.test.ts` inject `transport` giả nên `defaultTransport` →
 *     `subscribeConversation` không bao giờ chạy dưới test.
 *
 * Hệ quả nếu để hở (audit 09/08 chỉ ra): bỏ `private: true` thì client join topic
 * PUBLIC trong khi server vẫn phát private ⇒ hoặc chat chết câm (không tin nào tới,
 * không lỗi nào ném), hoặc — nếu "Allow public access" bị bật lại trên Dashboard —
 * bất kỳ ai cầm anon key (nằm sẵn trong bundle) đọc chéo mọi hội thoại. Cả hai
 * nhánh đều đi qua toàn bộ cổng CI mà không đỏ một dòng.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type ChannelOpts = { config?: { private?: boolean } };
const channelMock = { on: vi.fn(), subscribe: vi.fn() };
const createChannel = vi.fn((_topic: string, _opts: ChannelOpts) => channelMock);
const setAuth = vi.fn((_jwt: string) => undefined);

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    channel: (topic: string, opts: ChannelOpts) => createChannel(topic, opts),
    realtime: { setAuth: (jwt: string) => setAuth(jwt) },
  }),
}));

beforeEach(() => {
  vi.resetModules();
  createChannel.mockClear();
  setAuth.mockClear();
  channelMock.on.mockClear();
  channelMock.subscribe.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://zztest.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-gia";
});

async function load() {
  return import("@/lib/chat/supabase-client");
}

describe("subscribeConversation — bất biến của đường subscribe thật", () => {
  it("LUÔN join private channel (bỏ private:true = mất cửa chặn RLS)", async () => {
    const { subscribeConversation } = await load();
    subscribeConversation("conv-abc", "jwt-x");

    expect(createChannel).toHaveBeenCalledTimes(1);
    const [topic, opts] = createChannel.mock.calls[0]!;
    expect(topic).toBe("conv:conv-abc");
    // Đây là dòng chốt: private phải là true, không phải "truthy nhờ tình cờ".
    expect(opts?.config?.private).toBe(true);
  });

  it("đặt JWT do server mint TRƯỚC khi join (join trước = policy đọc token cũ/rỗng)", async () => {
    const { subscribeConversation } = await load();
    subscribeConversation("conv-abc", "jwt-x");

    expect(setAuth).toHaveBeenCalledWith("jwt-x");
    expect(setAuth.mock.invocationCallOrder[0]).toBeLessThan(
      createChannel.mock.invocationCallOrder[0],
    );
  });

  it("topic bám đúng quy ước conv:{id} — policy so 'conv:' || conversationId", async () => {
    const { subscribeConversation } = await load();
    subscribeConversation("11111111-2222-3333-4444-555555555555", "jwt");
    expect(createChannel.mock.calls[0]![0]).toBe("conv:11111111-2222-3333-4444-555555555555");
  });
});
