// lib/chat/messages.ts — US-06: gửi tin CHAT (F-SEND, docs/chat-realtime/flows.md).
//
// Đi qua pipeline chuẩn của `lib/actions/factory.ts`:
//   auth → resolveActor → zod → can() → scopedDb → mutation → writeAudit
//
// ⚠️ VÌ SAO KHÔNG GỌI THẲNG `defineAction` (đọc trước khi "sửa lại cho đúng chuẩn"):
// `defineAction` tự resolve Actor BÊN TRONG rồi mới gọi `runAction`, mà `runAction`
// suy `Target` cho `can()` bằng một hàm ĐỒNG BỘ chỉ nhận `input`
// (`target?: (input) => Target`). Quyền chat lại là **participant-based** và target
// của nó phụ thuộc CẢ hội thoại (đọc DB) LẪN chính actor:
//   • PARENT có `chat:send` scope OWN ⇒ chỉ khớp khi `target.createdById === actor.userId`
//     (docs/chat-realtime/permissions.md + lib/auth/chat-permissions.test.ts:170 —
//     "hội thoại CỦA MÌNH"; nhóm lớp thì `Conversation.createdById` là NULL).
//   • TEACHER scope ASSIGNED cần `classId` của lớp, QLCS scope CENTER cần `centerId`
//     — cả hai chỉ có sau khi đọc `Conversation`.
// ⇒ Không có target đồng bộ nào đúng cho cả ba vai. Nên file này tự làm đúng 3 việc
// mà `defineAction` làm (auth → resolveActor → runAction; KHÔNG có revalidatePath vì
// luồng chat cập nhật bằng realtime), rồi giao TOÀN BỘ phần còn lại cho `runAction`.
// Việc kiểm quyền vẫn đi qua DUY NHẤT `can()` (luật Nền Hệ thống #1) — không có
// điều kiện quyền viết tay ở đây.
// Hướng dọn nợ (ngoài phạm vi US-06): cho `ActionConfig.target` nhận thêm `actor` và
// cho phép async, khi đó file này quay về `defineAction` một dòng.
//
// ⚠️ VÌ SAO KHÔNG CÓ `"use server"` Ở ĐẦU FILE: luật E-bis #1 — module `"use server"`
// chỉ được export async function (mọi export khác bị loader biến thành action rỗng ⇒
// ReferenceError lúc eval, chết cả module). File này còn export schema + 2 hàm THUẦN
// cho test. Khi màn hình chat cần gọi từ Client Component, tạo `_actions.ts` có
// `"use server"` rồi `export { sendChatMessage } from "@/lib/chat/messages"`.
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import {
  runAction,
  actionFail,
  ActionError,
  type ActionConfig,
  type ActionResult,
} from "@/lib/actions/factory";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { broadcastToConversation } from "@/lib/chat/broadcast";

/** AC1 — 20 tin/phút/user. */
export const CHAT_SEND_RATE_MAX = 20;
const CHAT_SEND_RATE_WINDOW_MS = 60_000;
/** AC5 — trần độ dài nội dung, chặn ở CẢ server (không tin client). */
export const CHAT_BODY_MAX = 4000;

export const sendChatMessageSchema = z.object({
  conversationId: z.uuid("Hội thoại không hợp lệ"),
  body: z
    .string()
    .trim()
    .min(1, "Nội dung tin nhắn không được để trống")
    .max(CHAT_BODY_MAX, `Tin nhắn tối đa ${CHAT_BODY_MAX} ký tự`),
  /** Client sinh — khoá idempotency + khử trùng khi broadcast dội về (AC4). */
  clientMsgId: z.uuid("clientMsgId phải là UUID"),
  replyToId: z.uuid("Tin được trả lời không hợp lệ").optional(),
});

export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;

export type SentChatMessage = {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: string;
  body: string;
  replyToId: string | null;
  clientMsgId: string | null;
  createdAt: Date;
};

/** Mã lỗi EN + thông điệp VI (quy ước API contract) — client hiển thị nguyên văn message. */
export type ChatSendError = { code: string; message: string };

// ─── Ngữ cảnh gửi tin: hội thoại + tư cách thành viên của CHÍNH người gửi ────

export type SendContext = {
  conversationId: string;
  /** ConversationStatus dạng text: ACTIVE | ARCHIVED | LOCKED. */
  status: string;
  centerId: string | null;
  orgUnitId: string | null;
  /** ConversationSubjectType dạng text: CLASS | NONE. */
  subjectType: string;
  subjectId: string | null;
  createdById: string | null;
  /** null = người gửi CHƯA từng là thành viên hội thoại này. */
  participantId: string | null;
  /** khác null = đã rời nhóm. */
  participantLeftAt: Date | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Đọc hội thoại + participant của người gửi. **KHÔNG đi qua `scopedDb`** — cùng lý do
 * đã ghi ở `lib/chat/sync-membership.ts` (BẪY scopedDb, luật E-bis #5): tư cách thành
 * viên là dữ kiện MỨC HỆ THỐNG, không phải dữ liệu cần cách ly theo cơ sở. `Conversation`
 * nằm trong `SCOPE_EXEMPT` và `ConversationParticipant` không thuộc `SCOPED_MODELS`, tức
 * hiện tại đi Prisma API cũng không bị lọc — nhưng dùng `$queryRaw` (client extension
 * KHÔNG áp lên raw) để việc này không vỡ nếu mai có ai đưa 2 model đó vào diện scoped:
 * lúc đó GV dạy chéo cơ sở / PH có con chuyển cơ sở sẽ bị hiểu nhầm là "không phải thành
 * viên" và mất quyền nhắn tin mà không có lỗi nào nổi lên.
 * (`$queryRaw` tagged template — KHÔNG dùng `$queryRawUnsafe`, CLAUDE.md cấm.)
 */
async function loadSendContext(
  conversationId: string,
  userId: string,
): Promise<SendContext | null> {
  const rows = await db.$queryRaw<SendContext[]>`
    SELECT c."id"                AS "conversationId",
           c."status"::text      AS "status",
           c."centerId",
           c."orgUnitId",
           c."subjectType"::text AS "subjectType",
           c."subjectId",
           c."createdById",
           p."id"                AS "participantId",
           p."leftAt"            AS "participantLeftAt"
    FROM "Conversation" c
    LEFT JOIN "ConversationParticipant" p
      ON p."conversationId" = c."id" AND p."userId" = ${userId}
    WHERE c."id" = ${conversationId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

// ─── PHẦN THUẦN (không DB — unit test được) ─────────────────────────────────

/**
 * Guard F-SEND bước 2 + 3, theo ĐÚNG thứ tự đó.
 *
 * Mã lỗi phải PHÂN BIỆT được (AC1 / TS-03.7): "lớp đã kết thúc" khác hẳn "bạn không
 * còn trong nhóm" — client hiện 2 câu khác nhau, gộp mã là bắt phụ huynh đoán.
 * Hội thoại không tồn tại cũng trả NOT_PARTICIPANT: không xác nhận hộ người lạ rằng
 * một conversationId có tồn tại hay không.
 */
export function checkConversationSendable(ctx: SendContext | null): ChatSendError | null {
  if (!ctx || !ctx.participantId || ctx.participantLeftAt !== null) {
    return {
      code: "NOT_PARTICIPANT",
      message: "Bạn không còn là thành viên của hội thoại này.",
    };
  }
  if (ctx.status === "ARCHIVED") {
    return {
      code: "CONVERSATION_ARCHIVED",
      message: "Lớp đã kết thúc — hội thoại chỉ còn đọc, không gửi tin được.",
    };
  }
  if (ctx.status === "LOCKED") {
    return {
      code: "CONVERSATION_LOCKED",
      message: "Hội thoại đang bị khoá — vui lòng liên hệ quản trị viên.",
    };
  }
  return null;
}

/** Reply 1 cấp: tin gốc phải nằm trong CHÍNH hội thoại đang gửi (không trích chéo nhóm). */
export function checkReplyTarget(
  conversationId: string,
  reply: { conversationId: string } | null,
): ChatSendError | null {
  if (!reply || reply.conversationId !== conversationId) {
    return {
      code: "REPLY_NOT_IN_CONVERSATION",
      message: "Tin được trả lời không thuộc hội thoại này.",
    };
  }
  return null;
}

/** P2002 (unique) — nhận diện theo `code` để không phụ thuộc instanceof (test mock được). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

function toSent(row: {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: string;
  body: string;
  replyToId: string | null;
  clientMsgId: string | null;
  createdAt: Date;
}): SentChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    kind: row.kind,
    body: row.body,
    replyToId: row.replyToId,
    clientMsgId: row.clientMsgId,
    createdAt: row.createdAt,
  };
}

/** Tin đã gửi với đúng `clientMsgId` này (khoá idempotency `@@unique([conversationId, senderId, clientMsgId])`). */
async function findByClientMsgId(
  conversationId: string,
  senderId: string,
  clientMsgId: string,
): Promise<SentChatMessage | null> {
  const row = await db.message.findFirst({
    where: { conversationId, senderId, clientMsgId },
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      kind: true,
      body: true,
      replyToId: true,
      clientMsgId: true,
      createdAt: true,
    },
  });
  return row ? toSent(row) : null;
}

// ─── ActionConfig ───────────────────────────────────────────────────────────

/**
 * Target cho `can()`. Đọc kèm khối "VÌ SAO KHÔNG GỌI defineAction" ở đầu file.
 *
 * `createdById = actor.userId` khi người gọi CÓ bản ghi participant — tức hội thoại này
 * là "của mình" theo đúng nghĩa participant-based của module chat (permissions.md; PARENT
 * chỉ có scope OWN nên đây là ô duy nhất khớp cho phụ huynh trong nhóm lớp). Cố ý KHÔNG
 * xét `leftAt` ở đây: người đã rời vẫn qua cổng vai để nhận đúng mã `NOT_PARTICIPANT` từ
 * guard, thay vì `PERMISSION_DENIED` chung chung.
 * `classId`/`centerId` phục vụ scope ASSIGNED (GV) và CENTER (QLCS).
 */
function sendTargetOf(ctx: SendContext | null, actor: Actor) {
  return {
    createdById: ctx?.participantId ? actor.userId : (ctx?.createdById ?? null),
    classId: ctx?.subjectType === "CLASS" ? (ctx.subjectId ?? null) : null,
    centerId: ctx?.centerId ?? null,
  };
}

function buildSendChatMessageConfig(
  ctx: SendContext | null,
  actor: Actor,
): ActionConfig<SendChatMessageInput, SentChatMessage> {
  return {
    name: "chat.sendMessage",
    permission: "chat:send",
    schema: sendChatMessageSchema,
    target: () => sendTargetOf(ctx, actor),
    module: "chat",
    entityType: "Message",
    auditAction: "CREATE",
    handler: async ({ input }) => {
      // ── F-SEND bước 2 + 3: participant hiệu lực → trạng thái hội thoại ──
      const guard = checkConversationSendable(ctx);
      if (guard) throw new ActionError(guard.code, guard.message);
      const conv = ctx as SendContext;

      // ── F-SEND bước 4: rate limit 20 tin/phút/user ──
      const limit = await rateLimit({
        key: `chat:send:${actor.userId}`,
        max: CHAT_SEND_RATE_MAX,
        windowMs: CHAT_SEND_RATE_WINDOW_MS,
      });
      if (!limit.success) {
        const giay = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
        throw new ActionError(
          "RATE_LIMITED",
          `Bạn gửi tin quá nhanh (tối đa ${CHAT_SEND_RATE_MAX} tin/phút). Vui lòng thử lại sau ${giay} giây.`,
        );
      }

      // ── AC4: gửi lại cùng clientMsgId → trả CHÍNH tin cũ ──
      // Kiểm TRƯỚC transaction có chủ đích: bắt P2002 *bên trong* tx là vô nghĩa vì
      // Postgres đánh dấu transaction hỏng ngay khi một câu lệnh lỗi, mọi truy vấn sau
      // đó trong tx đều chết ("current transaction is aborted").
      const replay = await findByClientMsgId(
        input.conversationId,
        actor.userId,
        input.clientMsgId,
      );
      if (replay) {
        return {
          entityId: replay.id,
          data: replay,
          newValues: {
            conversationId: input.conversationId,
            clientMsgId: input.clientMsgId,
            idempotentReplay: true,
          },
          orgUnitId: conv.orgUnitId,
        };
      }

      // ── Reply 1 cấp: tin gốc phải cùng hội thoại ──
      if (input.replyToId) {
        const reply = await db.message.findUnique({
          where: { id: input.replyToId },
          select: { conversationId: true },
        });
        const replyErr = checkReplyTarget(input.conversationId, reply);
        if (replyErr) throw new ActionError(replyErr.code, replyErr.message, "replyToId");
      }

      // ── F-SEND bước 5: transaction (message + lastMessageAt + unreadCount) ──
      // timeout 30s/maxWait 10s theo luật E-bis #2 (trần 5s mặc định của Prisma đứt
      // giữa chừng khi pooler chậm ⇒ tin mất mà UI báo thành công).
      let created: SentChatMessage;
      try {
        created = await db.$transaction(
          async (tx) => {
            const msg = await tx.message.create({
              data: {
                conversationId: input.conversationId,
                senderId: actor.userId,
                kind: "CHAT",
                body: input.body,
                replyToId: input.replyToId ?? null,
                clientMsgId: input.clientMsgId,
              },
              select: {
                id: true,
                conversationId: true,
                senderId: true,
                kind: true,
                body: true,
                replyToId: true,
                clientMsgId: true,
                createdAt: true,
              },
            });

            await tx.conversation.update({
              where: { id: input.conversationId },
              data: { lastMessageAt: msg.createdAt },
            });

            // +1 cho MỌI thành viên còn hiệu lực TRỪ người gửi (AC2).
            await tx.conversationParticipant.updateMany({
              where: {
                conversationId: input.conversationId,
                leftAt: null,
                userId: { not: actor.userId },
              },
              data: { unreadCount: { increment: 1 } },
            });

            return toSent(msg);
          },
          { timeout: 30_000, maxWait: 10_000 },
        );
      } catch (err) {
        // Đua 2 tab cùng clientMsgId → unique chặn; đọc lại và trả tin đã có (AC4).
        if (isUniqueViolation(err)) {
          const raced = await findByClientMsgId(
            input.conversationId,
            actor.userId,
            input.clientMsgId,
          );
          if (raced) {
            return {
              entityId: raced.id,
              data: raced,
              newValues: {
                conversationId: input.conversationId,
                clientMsgId: input.clientMsgId,
                idempotentReplay: true,
              },
              orgUnitId: conv.orgUnitId,
            };
          }
        }
        throw err;
      }

      // ── F-SEND bước 6: broadcast SAU commit, NGOÀI transaction (AC3) ──
      // `broadcastToConversation` đã cam kết không throw; bọc thêm một lớp ở đây để
      // dù hợp đồng đó có bị phá thì tin ĐÃ commit cũng không biến thành lỗi đỏ.
      // Payload mang `clientMsgId` để client khử trùng với bản optimistic (AC4).
      try {
        await broadcastToConversation(created.conversationId, "message.created", {
          id: created.id,
          conversationId: created.conversationId,
          senderId: created.senderId,
          kind: created.kind,
          body: created.body,
          replyToId: created.replyToId,
          clientMsgId: created.clientMsgId,
          createdAt: created.createdAt.toISOString(),
        });
      } catch (err) {
        console.warn("[chat/sendMessage] broadcast lỗi — tin vẫn đã lưu:", err);
      }

      return {
        entityId: created.id,
        data: created,
        // KHÔNG ghi nội dung tin vào AuditLog (nhật ký quản trị không phải bản sao hội thoại).
        newValues: {
          conversationId: created.conversationId,
          kind: created.kind,
          clientMsgId: created.clientMsgId,
          replyToId: created.replyToId,
          bodyLength: created.body.length,
        },
        orgUnitId: conv.orgUnitId,
      };
    },
  };
}

// ─── Lõi + Server Action ────────────────────────────────────────────────────

/**
 * conversationId lấy từ input THÔ (preload chạy trước zod của `runAction`) — chỉ nhận
 * dạng UUID, đúng dạng `Conversation.id` sinh ra. Sai dạng → bỏ qua preload, để zod
 * báo VALIDATION như thường.
 */
function extractConversationId(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = (raw as { conversationId?: unknown }).conversationId;
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
}

/**
 * Lõi THUẦN NGỮ CẢNH — nhận Actor đã resolve, không chạm `auth()`/HTTP.
 * Test gọi thẳng hàm này với actor seed (như `runAction` của factory).
 */
export async function sendChatMessageAsActor(
  actor: Actor,
  actorName: string,
  rawInput: unknown,
): Promise<ActionResult<SentChatMessage>> {
  const conversationId = extractConversationId(rawInput);
  const ctx = conversationId ? await loadSendContext(conversationId, actor.userId) : null;
  const { res } = await runAction(
    buildSendChatMessageConfig(ctx, actor),
    actor,
    rawInput,
    { actorName },
  );
  return res;
}

/**
 * Server Action gửi tin CHAT (F-SEND). Không revalidatePath: luồng chat cập nhật
 * bằng realtime + optimistic render, revalidate cả trang sẽ giật màn hình.
 */
export async function sendChatMessage(
  rawInput: unknown,
): Promise<ActionResult<SentChatMessage>> {
  const session = await auth();
  if (!session?.user?.id) return actionFail("AUTH", "Chưa đăng nhập");
  const actor = await resolveActor(session.user.id);
  const actorName = session.user.name ?? session.user.email ?? session.user.id;
  return sendChatMessageAsActor(actor, actorName, rawInput);
}
