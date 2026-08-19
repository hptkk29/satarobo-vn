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
 * nhận MẢNG `messages` nên N người nhận nằm trong RẤT ÍT lời gọi (≤60 phần tử/lô —
 * trần đo được của chính endpoint, xem `BROADCAST_MAX_PER_POST`) — tuyệt đối không lặp
 * N lời gọi HTTP trong đường gửi tin (mỗi lời gọi có trần chờ 5s).
 * Quyền đọc do policy `user_can_receive_own_user_broadcast` trên `realtime.messages`
 * quyết định (so `realtime.topic()` với `'user:' || auth.jwt()->>'app_user_id'`).
 */

/**
 * Trần thời gian chờ MỘT lô — Realtime treo không được giữ Server Action lại.
 *
 * ⚠️ ĐÃ ĐO 10/08 VÀ CON SỐ NÀY KHÔNG ĐỦ (`scripts/_zztest-chat-do-tre-broadcast.ts`, endpoint
 * NGUỘI, mỗi phép cách 20s — tức KHÔNG phải backpressure do chính phép đo gây ra):
 *
 *   n=1 → 1240ms / 953ms · n=10 → 7406ms · n=30 → 21819ms · n=60 → 41830ms và 41863ms
 *   ⇒ chi phí ~**0,70 s/phần tử**, TUYẾN TÍNH, lặp lại được trong 33ms.
 *
 * Nghĩa là trần 5s chỉ phủ nổi ~6 người nhận; mọi nhóm lớp thật (~65 phần tử) đều bị CẮT
 * NGANG, và cắt ngang là MẤT người nhận thật (đo: 8/12 mẫu mất bump, tai còn nghe được).
 * Chia lô nhỏ hơn KHÔNG cứu được vì chi phí tính theo phần tử chứ không theo request.
 *
 * ⛔ ĐÃ GIẢI QUYẾT bằng cách khác, đừng quay lại lối cũ: fan-out nay chạy SAU khi trả
 * response (`runAfterResponse`), nên trần này KHÔNG còn là thứ người gửi phải ngồi đợi.
 * Trước đó trần 5s "che" độ trễ bằng cách CẮT NGANG fan-out — đo được 8/12 người mẫu mất
 * bump trong khi `probeAlive` chứng minh tai họ vẫn nghe được. Đó là đổi lỗi treo màn hình
 * lấy lỗi mất tín hiệu, không phải một bản vá.
 *
 * ⚠️ Số đo lấy ở project Supabase DEV; **PROD là project khác và CHƯA ĐO**. Nếu prod cũng
 * ~0,7s/phần tử thì `after()` vẫn chưa đủ — Vercel có trần thời gian cho việc chạy sau
 * response, và một lớp 65 người sẽ mất ~45s để phát hết. Đo bằng
 * `scripts/_zztest-chat-do-tre-broadcast.ts` với env prod TRƯỚC khi mở chat cho phụ huynh.
 */
const BROADCAST_TIMEOUT_MS = 20_000;

/**
 * Trần thời gian chờ CẢ lượt fan-out. Nay chạy ngoài đường request nên rộng tay hơn 10s cũ,
 * nhưng vẫn CÓ TRẦN: việc chạy sau response bị Vercel cắt theo `maxDuration` của function,
 * và một fan-out treo vô hạn chỉ làm ta mất khả năng biết chuyện gì đã xảy ra.
 * Hết ngân sách thì bỏ nốt phần còn lại và GHI LOG ĐỦ ĐỂ TRUY (xem `describeBatch`) —
 * người bị bỏ vẫn nhận được tin khi client `reconcile()` ở lần SUBSCRIBED kế tiếp.
 */
const BROADCAST_TOTAL_BUDGET_MS = 45_000;

/** Env thiếu thì warn ĐÚNG MỘT LẦN rồi im (môi trường chưa cấu hình vẫn chạy được). */
let warnedMissingEnv = false;

/**
 * Trần số phần tử trong MỘT POST.
 *
 * ⛔ ĐỪNG NÂNG LẠI 200 "cho nhanh". Con số 200 cũ VƯỢT TRẦN CỦA CHÍNH ENDPOINT Supabase
 * ⇒ mọi lô 200 đều hỏng và KHÔNG GIAO CHO AI. Đo thật trên dev
 * (scripts/_zztest-chat-token-va-lo.ts, LỖ 4 — mỗi phép cách 12s):
 *   n=1 / 50 / 80 → HTTP 202, giao đủ
 *   n=95          → HTTP 502
 *   n=200         → HTTP 429 `{"message":"Too many messages to broadcast, please reduce
 *                   the batch size"}` — 0 người nhận
 *   mảng 205 chia [200,5] → 7/7 người mẫu trong lô 1 MẤT, 5/5 trong lô 2 NHẬN
 *   (đối chứng chống pass giả: bắn mồi vào `user:{id}` riêng của cả 12 người → 12/12 nhận)
 *
 * Chọn 60 chứ không phải 80: lúc endpoint xuống cấp, độ trễ đo được ~0,68 s/phần tử và
 * n=90 chạm trần gateway 60s. 80 chỉ sạch lúc endpoint tươi — hết biên an toàn.
 * Nhóm lớp lớn nhất (~30 HV × 2 PH + GV/QLCS) ra ~65 phần tử ⇒ 2 lô, vẫn chỉ 1 vòng.
 */
const BROADCAST_MAX_PER_POST = 60;

/**
 * Số lô chạy SONG SONG tối đa. Đo thật: 4 lô × 65 và 8 lô × 65 bắn song song không giới
 * hạn → 12/12 lô vượt xa `BROADCAST_TIMEOUT_MS` (5s). Bắn dồn không nhanh hơn, chỉ làm
 * endpoint xuống cấp rồi timeout cả loạt.
 */
const BROADCAST_MAX_CONCURRENCY = 2;

export type ChatBroadcastEvent =
  | "message.created"
  | "message.deleted"
  | "participant.removed"
  | "conversation.locked";

/**
 * Event chạy trên topic mức NGƯỜI DÙNG `user:{User.id}`.
 *
 * Thêm event mới ở đây KHÔNG cần migration: policy `user_can_receive_own_user_broadcast`
 * chỉ so `realtime.topic()` với `'user:' || auth.jwt()->>'app_user_id'`, KHÔNG lọc theo
 * tên event ⇒ ai nghe được topic của mình thì nghe được mọi event trên đó.
 * Nhưng client thì CÓ lọc theo tên (`components/chat/user-channel.ts`) — thêm tên ở đây
 * mà quên mở cửa bên đó là event bị nuốt CÂM, không log, không lỗi.
 */
export type ChatUserBroadcastEvent = "conversation.bumped" | "notification.bumped";

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

/**
 * Payload `notification.bumped` — tín hiệu "chuông của bạn vừa có gì đó mới", dùng để badge
 * chuông nhảy ngay thay vì đợi vòng poll 60s.
 *
 * ⚠️ BR-30, chặt hơn cả `conversation.bumped`: KHÔNG tiêu đề, KHÔNG `href`, KHÔNG tên/SĐT/
 * email/preview — thông báo nhân sự mang nội dung nghiệp vụ (tên học viên, tên lớp), mà kênh
 * `user:{id}` chỉ chứng minh được "đúng người", KHÔNG chứng minh được "đúng quyền xem nội
 * dung đó". Cũng KHÔNG đẩy số chưa đọc: con số là kết quả một truy vấn CÓ KIỂM QUYỀN, đẩy
 * qua broadcast là dựng nguồn sự thật thứ hai rồi hai bên lệch nhau.
 * Client nhận tín hiệu xong đi hỏi lại server (đường đã kiểm quyền) rồi mới vẽ.
 */
export type NotificationBumpedPayload = {
  /** ISO timestamp của sự kiện — chỉ để client khử trùng / bỏ tín hiệu cũ. */
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
 * Builder THUẦN: 1 phần tử `notification.bumped` cho MỖI người nhận, topic `user:{userId}`.
 * Cùng khuôn `userBumpBroadcasts` (khử trùng userId + bỏ chuỗi rỗng) — một người nhận hai
 * thông báo cùng lúc thì cũng chỉ cần một tín hiệu, vì client sẽ đi đếm lại chứ không cộng dồn.
 *
 * Payload dựng LẠI từng khoá thay vì `{ ...payload }`: nơi gọi thường có sẵn cả object
 * StaffNotification trong tay, và spread là đường ngắn nhất để tên học viên / `href` lọt ra
 * kênh realtime (BR-30). Ở đây chỉ `at` đi được ra ngoài, dù người gọi có đưa gì thêm.
 */
export function notificationBumpBroadcasts(
  userIds: readonly string[],
  payload: NotificationBumpedPayload,
): BroadcastMessage[] {
  const seen = new Set<string>();
  const out: BroadcastMessage[] = [];
  for (const id of userIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      topic: `user:${id}`,
      event: "notification.bumped" satisfies ChatUserBroadcastEvent,
      payload: { at: payload.at },
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
  // Fan-out chạy SAU khi đã trả response cho người gửi — xem {@link runAfterResponse}.
  return runAfterResponse(() => sendBroadcastNow(messages));
}

/**
 * Đẩy fan-out ra khỏi đường request bằng `after()` của Next.
 *
 * VÌ SAO CẦN: đo trên Supabase dev 10/08/2026, độ trễ endpoint broadcast ~**0,70 giây mỗi
 * phần tử** và TUYẾN TÍNH (n=1 → 1,2s · n=10 → 7,4s · n=30 → 21,8s · n=60 → 41,8s). Một
 * nhóm lớp ~65 người nhận nghĩa là người gửi ngồi chờ **cả phút** trước khi thấy tin mình
 * vừa gửi. Trần chờ 5s/lô trước đây "che" điều đó bằng cách CẮT NGANG fan-out — tức đổi
 * việc treo màn hình lấy việc mất tín hiệu của phần lớn người nhận (đo được: 8/12 người
 * mẫu mất bump, có `probeAlive` chứng minh tai họ vẫn nghe được).
 *
 * Cả hai lựa chọn đó đều sai. Đường đúng: trả response NGAY, fan-out chạy sau — đúng luật
 * kiến trúc của chính repo ("KHÔNG để side-effect dính chùm inline trong action"). Không
 * dùng DomainEvent outbox vì dispatcher chạy theo cron 1 phút, quá chậm cho realtime.
 *
 * An toàn khi việc sau-response bị cắt: Postgres là nguồn sự thật, client `reconcile()` ở
 * MỌI lần channel về SUBSCRIBED (US-07 AC2) nên tin không mất, chỉ chậm hiện.
 *
 * NGOÀI ngữ cảnh request (cron, script ZZTEST, vitest) `after()` ném lỗi ⇒ chạy thẳng và
 * AWAIT như cũ. Nhờ vậy mọi test hiện có giữ nguyên hành vi, không phải viết lại.
 */
async function runAfterResponse(work: () => Promise<boolean>): Promise<boolean> {
  try {
    const { after } = await import("next/server");
    after(async () => {
      await work();
    });
    // Chưa gửi xong, nhưng người gọi không còn phụ thuộc kết quả này nữa. Trả `true` =
    // "đã nhận việc". Ai cần biết giao được hay không phải đọc log, không đọc giá trị trả về.
    return true;
  } catch {
    return work();
  }
}

async function sendBroadcastNow(messages: readonly BroadcastMessage[]): Promise<boolean> {
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

  const deadline = Date.now() + BROADCAST_TOTAL_BUDGET_MS;
  let ok = true;

  const sendBatch = async (batch: BroadcastMessage[], index: number): Promise<void> => {
    const remainingBudget = deadline - Date.now();
    if (remainingBudget <= 0) {
      ok = false;
      console.warn(
        `[chat/broadcast] Hết ngân sách ${BROADCAST_TOTAL_BUDGET_MS}ms — BỎ ${describeBatch(batch, index, batches.length)}. Tin vẫn nằm trong DB.`,
      );
      return;
    }
    const startedAt = Date.now();
    try {
      const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: batch }),
        signal: AbortSignal.timeout(Math.min(BROADCAST_TIMEOUT_MS, remainingBudget)),
        cache: "no-store",
      });
      if (!res.ok) {
        ok = false;
        // Body mang mã lỗi thật của Realtime (vd trần lô: "Too many messages to broadcast,
        // please reduce the batch size"). Không đọc là mất đúng dòng chẩn đoán duy nhất.
        const detail = await res.text().catch(() => "");
        console.warn(
          `[chat/broadcast] Realtime TỪ CHỐI (HTTP ${res.status}) ` +
            `${describeBatch(batch, index, batches.length)} sau ${Date.now() - startedAt}ms — ` +
            // Đo 10/08: 429 "reduce the batch size" ⇒ KHÔNG ai nhận; 502 ở n=95 thì event
            // VẪN tới cả hai người mẫu. Đừng khẳng định "mất" cho mọi mã lỗi.
            `429 = không ai nhận; mã khác vẫn có thể đã tới. Tin vẫn nằm trong DB. ` +
            `${detail.slice(0, 200)}`,
        );
      }
    } catch (e) {
      ok = false;
      // ⚠️ ĐÍNH CHÍNH 10/08 — bản trước ghi "timeout ≠ rụng, có thể vẫn tới nơi". SAI.
      // Đo thật: fan-out 205 phần tử, mọi lô bị cắt ở 5s ⇒ 8/12 người mẫu MẤT bump, trong
      // khi `probeAlive` chứng minh 12/12 tai họ còn nghe được. Cắt ngang lời gọi LÀ mất
      // người nhận. (Có ca timeout mà event vẫn tới — nên vẫn không được khẳng định "mất
      // hết", nhưng cũng đừng trấn an rằng "chắc vẫn tới".)
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      if (timedOut) {
        console.warn(
          `[chat/broadcast] QUÁ HẠN CHỜ ${BROADCAST_TIMEOUT_MS}ms sau ${Date.now() - startedAt}ms ` +
            `${describeBatch(batch, index, batches.length)} — MỘT PHẦN người nhận trong lô này ` +
            `nhiều khả năng KHÔNG nhận được (đã đo 8/12 mẫu mất bump ở ca bị cắt); ` +
            `tin vẫn nằm trong DB và client bù khi kênh về SUBSCRIBED.`,
        );
      } else {
        console.warn(
          `[chat/broadcast] KHÔNG GỌI ĐƯỢC Realtime ` +
            `${describeBatch(batch, index, batches.length)} — tin vẫn nằm trong DB.`,
          e,
        );
      }
    }
  };

  // Chạy theo vòng, mỗi vòng tối đa `BROADCAST_MAX_CONCURRENCY` lô.
  for (let i = 0; i < batches.length; i += BROADCAST_MAX_CONCURRENCY) {
    await Promise.all(
      batches
        .slice(i, i + BROADCAST_MAX_CONCURRENCY)
        .map((batch, offset) => sendBatch(batch, i + offset)),
    );
  }

  return ok;
}

/**
 * Mô tả một lô đủ để TRUY RA AI MẤT TIN. Bản cũ chỉ in `batch[0].topic`: một lô 60 người
 * rụng thì không có đường nào biết 59 người còn lại là ai. In đủ topic khi lô nhỏ, còn lô
 * lớn thì in mẫu + tổng số (log không phải chỗ đổ 60 dòng, nhưng cũng không được im).
 */
function describeBatch(
  batch: readonly BroadcastMessage[],
  index: number,
  total: number,
): string {
  const SAMPLE = 10;
  const topics = batch.map((m) => m.topic);
  const shown = topics.slice(0, SAMPLE).join(",");
  const events = [...new Set(batch.map((m) => m.event))].join("|");
  return (
    `lô ${index + 1}/${total} n=${batch.length} event=${events || "?"} ` +
    `topics=[${shown}${topics.length > SAMPLE ? `,…+${topics.length - SAMPLE}` : ""}]`
  );
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
