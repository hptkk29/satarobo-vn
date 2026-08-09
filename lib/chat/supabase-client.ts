"use client";

import {
  createClient,
  type SupabaseClient,
  type RealtimeChannel,
} from "@supabase/supabase-js";

/**
 * US-02 — Supabase client phía BROWSER cho chat realtime.
 *
 * Chỉ dùng anon key (NEXT_PUBLIC_*) — anon key một mình KHÔNG đọc được gì:
 * channel là private, policy SELECT trên `realtime.messages` đòi JWT có claim
 * `app_user_id` là participant còn hiệu lực. JWT lấy từ
 * `GET /api/chat/realtime-token` (TTL 15'), truyền vào `subscribeConversation`.
 *
 * KHÔNG import file này ở server — service role key không bao giờ ở client.
 */

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Thiếu NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — realtime chat chưa được cấu hình",
    );
  }

  browserClient = createClient(url, anonKey, {
    // Không dùng Supabase Auth (Auth.js là nguồn phiên duy nhất) — tắt persist.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return browserClient;
}

/**
 * Đổi JWT của KẾT NỐI realtime đang mở (không dựng lại kênh).
 *
 * US-07 — token sống 15': client xin token mới ở ~80% TTL rồi gọi hàm này, connection
 * đẩy `access_token` mới xuống các channel đã join ⇒ kênh không rớt giữa chừng.
 * ⚠️ Chỉ đổi token cho phiên hiện tại; quyền đọc THẬT vẫn do policy RLS quyết định
 * (và policy chỉ chạy lúc join — xem F-KICK: gỡ giữa phiên đi bằng `participant.removed`).
 */
export async function setRealtimeAuth(jwt: string): Promise<void> {
  await getSupabaseBrowserClient().realtime.setAuth(jwt);
}

export type SubscribeConversationHandlers = {
  /** Payload broadcast của hội thoại (server phát bằng service role). */
  onBroadcast?: (event: string, payload: Record<string, unknown>) => void;
  /** Trạng thái channel: SUBSCRIBED | CHANNEL_ERROR | TIMED_OUT | CLOSED. */
  onStatus?: (status: string, err?: Error) => void;
};

/**
 * Subscribe private channel `conv:{id}`. JWT do server mint (route
 * /api/chat/realtime-token) — hết TTL 15' thì caller xin token mới và gọi lại
 * `client.realtime.setAuth(...)`. Trả về channel để caller unsubscribe.
 */
export function subscribeConversation(
  conversationId: string,
  jwt: string,
  handlers: SubscribeConversationHandlers = {},
): RealtimeChannel {
  const client = getSupabaseBrowserClient();

  // JWT tự ký (claim app_user_id) — policy RLS quyết định cho vào hay không.
  void client.realtime.setAuth(jwt);

  const channel = client.channel(`conv:${conversationId}`, {
    config: { private: true },
  });

  if (handlers.onBroadcast) {
    const onBroadcast = handlers.onBroadcast;
    channel.on("broadcast", { event: "*" }, (message) => {
      onBroadcast(message.event, message.payload as Record<string, unknown>);
    });
  }

  channel.subscribe((status, err) => {
    handlers.onStatus?.(status, err);
  });

  return channel;
}

/**
 * Subscribe private channel `user:{userId}` — kênh mức NGƯỜI DÙNG (không phải hội thoại).
 *
 * Vì sao cần: kênh `conv:{id}` chỉ tới được người ĐANG MỞ hội thoại đó, nên tin đến ở hội
 * thoại khác không có tín hiệu nào tới trình duyệt ⇒ badge chưa đọc và danh sách hội thoại
 * đứng yên. Server bắn `conversation.bumped` (payload nhẹ, không PII) tới topic của từng
 * người nhận; client nhận xong đi hỏi lại server rồi mới vẽ.
 *
 * Quyền đọc do policy `user_can_receive_own_user_broadcast` quyết định: so `realtime.topic()`
 * với `'user:' || auth.jwt()->>'app_user_id'` ⇒ chỉ chính chủ join được topic của mình.
 *
 * ⚠️ `setAuth` đổi token ở mức CONNECTION (client là singleton) — kênh này và các kênh
 * `conv:` dùng CHUNG một kết nối và một token. Mọi token đều của cùng một người nên ai ghi
 * sau cũng hợp lệ; chỉ tốn thêm vài request gia hạn, không có tranh chấp quyền.
 */
export function subscribeUserTopic(
  userId: string,
  jwt: string,
  handlers: SubscribeConversationHandlers = {},
): RealtimeChannel {
  const client = getSupabaseBrowserClient();

  void client.realtime.setAuth(jwt);

  const channel = client.channel(`user:${userId}`, {
    config: { private: true },
  });

  if (handlers.onBroadcast) {
    const onBroadcast = handlers.onBroadcast;
    channel.on("broadcast", { event: "*" }, (message) => {
      onBroadcast(message.event, message.payload as Record<string, unknown>);
    });
  }

  channel.subscribe((status, err) => {
    handlers.onStatus?.(status, err);
  });

  return channel;
}
