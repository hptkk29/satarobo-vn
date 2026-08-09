import "server-only";

/**
 * US-06 — Đẩy realtime xuống private channel `conv:{id}` bằng SERVICE ROLE.
 *
 * Vì sao gọi REST thay vì supabase-js: client chỉ có policy SELECT trên
 * `realtime.messages` (US-02) — KHÔNG có policy INSERT, nên không ai gửi
 * broadcast từ trình duyệt được. Server phát bằng service role qua đúng endpoint
 * đã chạy thật ở `scripts/_zztest-chat-us02.ts` bước 6:
 *   POST {SUPABASE_URL}/realtime/v1/api/broadcast
 *   { messages: [{ topic, event, payload, private: true }] }
 *
 * ⚠️ FAIL-AND-FORGET (AC3 + NT1 "Postgres là nguồn sự thật"):
 * hàm này KHÔNG BAO GIỜ throw. Nó chạy SAU khi tin đã commit; một cú throw sẽ
 * biến "tin đã gửi thành công" thành lỗi đỏ trước mặt người dùng trong khi tin
 * vẫn nằm trong DB — mất niềm tin còn tệ hơn mất realtime. Realtime rớt thì
 * client tự bù bằng `fetchMessagesSince` khi channel về SUBSCRIBED (US-07 AC2).
 *
 * ⚠️ SUPABASE_SERVICE_ROLE_KEY là SERVER ONLY — file này `import "server-only"`
 * để bundler chặn cứng nếu có ai lỡ import từ component client.
 */

/** Trần thời gian chờ Realtime — Realtime treo không được giữ Server Action lại. */
const BROADCAST_TIMEOUT_MS = 5_000;

/** Env thiếu thì warn ĐÚNG MỘT LẦN rồi im (môi trường chưa cấu hình vẫn chạy được). */
let warnedMissingEnv = false;

export type ChatBroadcastEvent =
  | "message.created"
  | "message.deleted"
  | "participant.removed"
  | "conversation.locked";

/**
 * Đẩy 1 event xuống topic `conv:{conversationId}` (private channel).
 * @returns true nếu Realtime nhận; false nếu thiếu cấu hình / lỗi HTTP / lỗi mạng.
 *          KHÔNG throw trong mọi trường hợp.
 */
export async function broadcastToConversation(
  conversationId: string,
  event: ChatBroadcastEvent | string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    if (!warnedMissingEnv) {
      warnedMissingEnv = true;
      console.warn(
        "[chat/broadcast] Thiếu NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — " +
          "bỏ qua realtime (tin nhắn vẫn ghi vào DB bình thường).",
      );
    }
    return false;
  }

  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ topic: `conv:${conversationId}`, event, payload, private: true }],
      }),
      signal: AbortSignal.timeout(BROADCAST_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(
        `[chat/broadcast] Realtime từ chối (HTTP ${res.status}) topic=conv:${conversationId} event=${event} — tin vẫn nằm trong DB.`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      `[chat/broadcast] Không gọi được Realtime topic=conv:${conversationId} event=${event} — tin vẫn nằm trong DB.`,
      err,
    );
    return false;
  }
}
