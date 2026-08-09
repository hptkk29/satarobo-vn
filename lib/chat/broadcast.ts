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
 *
 * ── Bổ sung: topic mức NGƯỜI DÙNG `user:{User.id}` ──────────────────────────
 * Kênh `conv:{id}` chỉ tới được người ĐANG MỞ hội thoại đó ⇒ badge chưa đọc và danh
 * sách hội thoại đứng yên khi tin đến ở hội thoại khác. Thêm kênh mức người dùng để
 * server bắn một event NHẸ `conversation.bumped` tới từng người nhận. Endpoint REST
 * nhận MẢNG `messages` nên N người nhận vẫn nằm trong ĐÚNG MỘT POST — tuyệt đối không
 * lặp N lời gọi HTTP trong đường gửi tin (mỗi lời gọi có trần chờ 5s).
 * Quyền đọc do policy `user_can_receive_own_user_broadcast` trên `realtime.messages`
 * quyết định (so `realtime.topic()` với `'user:' || auth.jwt()->>'app_user_id'`).
 */

/** Trần thời gian chờ Realtime — Realtime treo không được giữ Server Action lại. */
const BROADCAST_TIMEOUT_MS = 5_000;

/** Env thiếu thì warn ĐÚNG MỘT LẦN rồi im (môi trường chưa cấu hình vẫn chạy được). */
let warnedMissingEnv = false;

/**
 * Trần số phần tử trong MỘT POST. Thực tế nhóm lớp lớn nhất (~30 HV × 2 PH + GV/QLCS)
 * mới tới ~65 ⇒ luôn 1 lô. Chia lô chỉ để một hội thoại bất thường không dựng một body
 * khổng lồ; đây KHÔNG phải "mỗi người một call".
 */
const BROADCAST_MAX_PER_POST = 200;

export type ChatBroadcastEvent =
  | "message.created"
  | "message.deleted"
  | "participant.removed"
  | "conversation.locked";

/** Event chạy trên topic mức NGƯỜI DÙNG `user:{User.id}`. */
export type ChatUserBroadcastEvent = "conversation.bumped";

/**
 * Payload `conversation.bumped` — chỉ là TÍN HIỆU "có gì đó mới ở hội thoại X",
 * KHÔNG phải dữ liệu. Client nhận xong đi hỏi lại server (đường đã kiểm quyền) rồi
 * mới vẽ.
 *
 * ⚠️ BR-30: cấm mọi thứ nhận dạng người — không body, không tên/SĐT/email người gửi,
 * không preview. Preview trong danh sách vẫn được DỰNG Ở SERVER (`lib/chat/queries.ts`)
 * sau khi đã lọc tin bị gỡ; nhét preview vào payload là đi vòng qua đúng chỗ đang lọc.
 * Cũng KHÔNG đẩy `unreadCount`: con số là kết quả của một truy vấn có kiểm quyền
 * (lọc `leftAt IS NULL` + BR-04), đẩy qua broadcast là tạo nguồn sự thật thứ hai.
 */
export type ConversationBumpedPayload = {
  /** Hội thoại vừa có tin — client dùng để biết có phải hội thoại đang mở không. */
  conversationId: string;
  /** cuid tin vừa tạo/đổi — CHỈ để khử trùng khi bump tới hai lần. Không hiển thị. */
  messageId: string;
  /** Để sau này ưu tiên push (US-14) mà không phải đổi hợp đồng. */
  kind: "CHAT" | "ANNOUNCEMENT" | "DELETED";
  /** ISO timestamp của sự kiện — client dùng để sắp lại thứ tự cục bộ nếu cần. */
  at: string;
};

/** Một phần tử trong mảng `messages` của REST broadcast. */
export type BroadcastMessage = {
  topic: string;
  event: string;
  payload: Record<string, unknown>;
  private: true;
};

/** Builder THUẦN (không I/O) cho topic `conv:{id}`. */
export function conversationBroadcast(
  conversationId: string,
  event: ChatBroadcastEvent | string,
  payload: Record<string, unknown>,
): BroadcastMessage {
  return { topic: `conv:${conversationId}`, event, payload, private: true };
}

/**
 * Builder THUẦN: 1 phần tử `conversation.bumped` cho MỖI người nhận, topic
 * `user:{userId}`. Đã khử trùng userId + bỏ chuỗi rỗng (một người có mặt hai lần
 * trong danh sách thì cũng chỉ nhận một bump).
 */
export function userBumpBroadcasts(
  userIds: readonly string[],
  payload: ConversationBumpedPayload,
): BroadcastMessage[] {
  const seen = new Set<string>();
  const out: BroadcastMessage[] = [];
  for (const id of userIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      topic: `user:${id}`,
      event: "conversation.bumped" satisfies ChatUserBroadcastEvent,
      payload: { ...payload },
      private: true,
    });
  }
  return out;
}

/**
 * Primitive DUY NHẤT gọi HTTP. Nhận NHIỀU topic trong CÙNG một POST (endpoint của
 * Supabase nhận mảng `messages`) ⇒ fan-out N người nhận vẫn chỉ tốn 1 request.
 *
 * @returns true nếu mọi lô được Realtime nhận; false nếu thiếu cấu hình / lỗi HTTP /
 *          lỗi mạng. KHÔNG throw trong mọi trường hợp (xem hợp đồng đầu file).
 */
export async function broadcastMessages(
  messages: readonly BroadcastMessage[],
): Promise<boolean> {
  if (messages.length === 0) return true;

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

  const batches: BroadcastMessage[][] = [];
  for (let i = 0; i < messages.length; i += BROADCAST_MAX_PER_POST) {
    batches.push(messages.slice(i, i + BROADCAST_MAX_PER_POST));
  }

  const results = await Promise.allSettled(
    batches.map(async (batch) => {
      const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: batch }),
        signal: AbortSignal.timeout(BROADCAST_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) {
        console.warn(
          `[chat/broadcast] Realtime từ chối (HTTP ${res.status}) topics=${batch.length} ` +
            `đầu=${batch[0]?.topic ?? "?"} event=${batch[0]?.event ?? "?"} — tin vẫn nằm trong DB.`,
        );
        return false;
      }
      return true;
    }),
  );

  let ok = true;
  for (const r of results) {
    if (r.status === "rejected") {
      ok = false;
      console.warn("[chat/broadcast] Không gọi được Realtime — tin vẫn nằm trong DB.", r.reason);
    } else if (!r.value) {
      ok = false;
    }
  }
  return ok;
}

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
  return broadcastMessages([conversationBroadcast(conversationId, event, payload)]);
}
