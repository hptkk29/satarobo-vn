// @vitest-environment node
/**
 * Fan-out broadcast phải chạy SAU khi trả response, không nằm trong đường request.
 *
 * Vì sao bất biến này đáng một file riêng: đo trên Supabase dev 10/08/2026, endpoint
 * broadcast tốn ~0,70 giây MỖI PHẦN TỬ và tuyến tính (n=60 → 41,8s). Một nhóm lớp ~65
 * người nhận nghĩa là người gửi ngồi chờ cả phút để thấy tin của chính mình.
 *
 * Bản trước "che" điều đó bằng trần chờ 5s — tức CẮT NGANG fan-out giữa chừng. Đo được
 * hậu quả: 8/12 người mẫu mất tín hiệu, trong khi phép thử `probeAlive` chứng minh tai họ
 * vẫn nghe được. Đổi lỗi treo màn hình lấy lỗi mất tín hiệu không phải là vá.
 *
 * Ai đó "đơn giản hoá" bằng cách gọi thẳng lại đường cũ sẽ làm file này đỏ.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  /** Bắt callback mà `after()` nhận được, KHÔNG chạy ngay — đúng như Next làm thật. */
  deferred: [] as Array<() => Promise<void> | void>,
  after: vi.fn((cb: () => Promise<void> | void) => {
    h.deferred.push(cb);
  }),
  fetch: vi.fn(async () => new Response("{}", { status: 202 })),
}));

vi.mock("next/server", () => ({ after: h.after }));

import { broadcastMessages, type BroadcastMessage } from "./broadcast";

beforeEach(() => {
  h.deferred.length = 0;
  h.after.mockClear();
  h.fetch.mockClear();
  vi.stubGlobal("fetch", h.fetch);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://zztest.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "zztest-service-role-khong-that");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// Khai kiểu tường minh: `private: true` là literal type trong `BroadcastMessage`, để suy
// diễn tự do thì TS ra `boolean` và typecheck đỏ trong khi vitest vẫn xanh — đúng cái bẫy
// "test xanh mà typecheck đỏ" đã cắn một lần ở dự án này.
const MSG: BroadcastMessage[] = [
  { topic: "user:u1", event: "conversation.bumped", payload: {}, private: true },
];

describe("fan-out chạy sau response", () => {
  it("KHÔNG gọi HTTP trong lúc người gửi còn đang chờ", async () => {
    await broadcastMessages(MSG);

    // Đây là cả điểm của bản vá: lúc `broadcastMessages` trả về, chưa một byte nào rời máy.
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.after).toHaveBeenCalledTimes(1);
  });

  it("việc được HOÃN chứ không bị BỎ — chạy callback thì HTTP mới đi", async () => {
    // Đối chứng dương bắt buộc: thiếu nó thì một bản vá "không gửi gì cả" cũng làm ca trên xanh.
    await broadcastMessages(MSG);
    expect(h.deferred).toHaveLength(1);

    await h.deferred[0]!();

    expect(h.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = h.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/realtime/v1/api/broadcast");
    expect(JSON.parse(String(init.body))).toEqual({ messages: MSG });
  });

  it("mảng rỗng thì không hoãn gì cả (đừng đẻ việc rác sau response)", async () => {
    await broadcastMessages([]);
    expect(h.after).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("lỗi trong việc đã hoãn KHÔNG ném ra ngoài (hợp đồng fail-and-forget giữ nguyên)", async () => {
    h.fetch.mockRejectedValueOnce(new Error("Realtime sập"));

    await broadcastMessages(MSG);
    // Postgres là nguồn sự thật; broadcast hỏng thì log, không rollback, và tuyệt đối
    // không được ném ra ngoài — ở đây "ngoài" là runtime của Next, ném là 500 không ai bắt.
    await expect(h.deferred[0]!()).resolves.toBeUndefined();
  });
});
