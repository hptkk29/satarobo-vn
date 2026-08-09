// lib/chat/queries.ts — US-08 + US-09 (+ US-07 AC2/AC5): TẦNG ĐỌC của module chat.
//
// Một chỗ duy nhất trả dữ liệu chat cho mọi bề mặt (portal PH / admin / site GV).
// Thuần server, KHÔNG UI, KHÔNG Server Action: mọi hàm nhận `actorUserId` TƯỜNG MINH
// nên test được bằng script/vitest mà không cần request hay `auth()`. Lớp gọi
// (Server Action / route) vẫn phải `auth()` trước — file này không tự lấy phiên.
//
// ⚠️ KHÔNG `import "server-only"` — CÓ CHỦ ĐÍCH, đúng tiền lệ lib/chat/sync-membership.ts
// và lib/chat/reconcile-membership.ts: gói `server-only` chỉ resolve được trong Next
// (ngoài Next nó ném ngay lúc import), trong khi module này phải chạy được dưới `tsx`
// cho ZZTEST (scripts/_zztest-chat-us08.ts) và cron. Chốt chặn "không lọt xuống client"
// là import `@/lib/db` (Prisma) — bundler nổ ngay nếu ai lỡ import từ Client Component.
//
// ⚠️ ĐỌC BẰNG `db` TRẦN, KHÔNG `scopedDb` — CÓ CHỦ ĐÍCH (luật E-bis #5 + delta E.3):
// phạm vi đọc chat là **participant-based** (ConversationParticipant tại thời điểm
// request), KHÔNG center-based. `Conversation` ∈ SCOPE_EXEMPT (lib/db-scope.ts) vì DM
// có `centerId = null`; còn `Class`/`Student`/`Enrollment` ∈ SCOPED_MODELS — đi qua
// scopedDb thì GV dạy chéo cơ sở (TS-01.5) hoặc học viên đã chuyển cơ sở mà còn học lớp
// cũ sẽ BIẾN MẤT khỏi kết quả, tức người dùng hợp lệ bị chặn im lặng. Cách ly ở đây do
// chính điều kiện `participant.leftAt IS NULL` bảo đảm — chặt hơn centerId.
import type { DerivedFrom, MessageKind, ParticipantRole } from "@prisma/client";
import { db } from "@/lib/db";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";

// ─── Hằng dùng chung ────────────────────────────────────────────────────────

/** US-12 AC3 — text thay thế cho tin đã gỡ; body thật KHÔNG bao giờ rời DB. */
export const DELETED_MESSAGE_TEXT = "Tin nhắn đã được gỡ";
/** US-08 AC4 — nhãn cạnh tên hội thoại đã lưu trữ. */
export const ARCHIVED_LABEL = "Đã lưu trữ";
/** US-09 AC1 — 30 tin mỗi trang. */
export const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const DEFAULT_CONVERSATION_LIMIT = 100;
const MAX_CONVERSATION_LIMIT = 500;
const PREVIEW_MAX_LENGTH = 120;

/**
 * Lỗi tầng đọc chat. Mã EN + thông điệp VI (quy ước API contract Doc 15).
 * `NOT_PARTICIPANT` cũng dùng cho hội thoại KHÔNG TỒN TẠI — cố ý không phân biệt để
 * không ai dò được id hội thoại người khác (TS-01.2/01.4b/01.7 chỉ đòi "403 ngay").
 */
export class ChatQueryError extends Error {
  constructor(
    readonly code: "NOT_PARTICIPANT",
    message: string,
  ) {
    super(message);
    this.name = "ChatQueryError";
  }
}

function notParticipant(): never {
  throw new ChatQueryError(
    "NOT_PARTICIPANT",
    "Bạn không còn là thành viên của hội thoại này.",
  );
}

// ─── PHẦN THUẦN (không DB — unit test ở queries.test.ts) ────────────────────

/** Khoá sắp xếp danh sách hội thoại. */
export type ConversationSortable = {
  conversationId: string;
  lastMessageAt: Date | null;
};

/**
 * US-08 AC2 — `lastMessageAt` GIẢM DẦN, hội thoại chưa có tin nào (null) xếp CUỐI,
 * tie-break bằng id để thứ tự tất định (không "nhảy dòng" giữa 2 lần tải).
 * (Hội thoại ARCHIVED KHÔNG bị đẩy xuống ở đây — AC4 do UI xếp theo cờ `isArchived`.)
 */
export function compareConversations(
  a: ConversationSortable,
  b: ConversationSortable,
): number {
  const ta = a.lastMessageAt?.getTime() ?? null;
  const tb = b.lastMessageAt?.getTime() ?? null;
  if (ta !== tb) {
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  }
  return a.conversationId < b.conversationId ? -1 : a.conversationId > b.conversationId ? 1 : 0;
}

const CURSOR_SEP = "|";

/** Cursor US-09 = cặp `(createdAt, id)` — thứ tự TOÀN PHẦN nên không trùng/sót tin. */
export type MessageCursor = { createdAt: Date; id: string };

/** ISO (giữ mili-giây) + id. Id có thể chứa dấu `|` → chỉ tách ở dấu ĐẦU TIÊN. */
export function encodeCursor(cursor: MessageCursor): string {
  return `${cursor.createdAt.toISOString()}${CURSOR_SEP}${cursor.id}`;
}

/** Cursor hỏng/thiếu → null = trang đầu (không ném lỗi ra người dùng). */
export function decodeCursor(raw: string | null | undefined): MessageCursor | null {
  if (!raw) return null;
  const sep = raw.indexOf(CURSOR_SEP);
  if (sep <= 0) return null;
  const id = raw.slice(sep + 1);
  if (!id) return null;
  const createdAt = new Date(raw.slice(0, sep));
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}

const PHONE_LIKE_RE = /(?<![0-9])(?:\+?84|0)(?:3|5|7|8|9)[0-9]{8}(?![0-9])/g;
const EMAIL_LIKE_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * BR-30 — che mọi thứ TRÔNG GIỐNG liên hệ trong một chuỗi tự do.
 * Cần vì `User.name` của tài khoản sinh từ lead cũ hay là "PH 0905123456": chỉ bỏ
 * cột `phone`/`email` khỏi payload là chưa đủ, SĐT vẫn đi lọt qua đường tên hiển thị.
 */
export function redactContactLike(text: string): string {
  return text.replace(EMAIL_LIKE_RE, "•••").replace(PHONE_LIKE_RE, "•••");
}

/** Người xem — chỉ 3 mẩu cần để quyết định ẩn liên hệ. */
export type ContactViewer = {
  role?: string | null;
  roles?: readonly string[] | null;
  /** Tư cách của chính người xem trong hội thoại (ConversationParticipant.derivedFrom). */
  derivedFrom?: string | null;
};

/**
 * BR-30 — quyết định "ẩn hay không" nằm ở TẦNG QUERY (permissions.md: PH thấy bản ẩn
 * liên hệ). FAIL-CLOSED: không nhận ra người xem là nhân viên → ẩn. Người vừa là GV
 * vừa là PH cũng ẩn (giữ nguyên văn "người xem có vai PARENT").
 */
export function shouldHideContacts(viewer: ContactViewer): boolean {
  if (viewer.derivedFrom === "CLASS_STUDENT_PARENT") return true;
  if (viewer.role === "PARENT") return true;
  if (viewer.roles?.includes("PARENT")) return true;
  // Nhân viên = có vai chính hoặc vai phụ KHÁC PARENT.
  const staff = [viewer.role, ...(viewer.roles ?? [])].filter(
    (r): r is string => typeof r === "string" && r.length > 0 && r !== "PARENT",
  );
  return staff.length === 0;
}

/** Tin nhắn thô đọc từ DB (subset của Message). */
export type MessageRow = {
  id: string;
  conversationId: string;
  kind: MessageKind;
  senderId: string | null;
  body: string;
  replyToId: string | null;
  clientMsgId: string | null;
  createdAt: Date;
  deletedAt: Date | null;
};

/**
 * Tin nhắn trả cho client. `body` của tin đã gỡ LUÔN là {@link DELETED_MESSAGE_TEXT}
 * (US-12 AC3) — không có `deletedReason`/`deletedById` (thông tin của kiểm duyệt).
 * KHÔNG kèm tên người gửi: UI ghép `senderId` với {@link getConversationMembers} để
 * việc ẩn liên hệ BR-30 chỉ có MỘT chỗ quyết định.
 */
export type ChatMessageView = {
  id: string;
  conversationId: string;
  kind: MessageKind;
  senderId: string | null;
  body: string;
  deleted: boolean;
  replyToId: string | null;
  clientMsgId: string | null;
  createdAt: Date;
};

export function toMessageView(row: MessageRow): ChatMessageView {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    conversationId: row.conversationId,
    kind: row.kind,
    senderId: row.senderId,
    body: deleted ? DELETED_MESSAGE_TEXT : row.body,
    deleted,
    replyToId: row.replyToId,
    clientMsgId: row.clientMsgId,
    createdAt: row.createdAt,
  };
}

/** Tin cuối dùng cho dòng preview trong danh sách hội thoại. */
export type ConversationPreview = {
  id: string;
  kind: MessageKind;
  senderId: string | null;
  createdAt: Date;
  text: string;
  deleted: boolean;
};

export function buildPreview(
  row: Pick<MessageRow, "id" | "kind" | "senderId" | "body" | "createdAt" | "deletedAt"> | null,
): ConversationPreview | null {
  if (!row) return null;
  const deleted = row.deletedAt !== null;
  const flat = row.body.replace(/\s+/g, " ").trim();
  const text = deleted
    ? DELETED_MESSAGE_TEXT
    : flat.length > PREVIEW_MAX_LENGTH
      ? `${flat.slice(0, PREVIEW_MAX_LENGTH)}…`
      : flat;
  return { id: row.id, kind: row.kind, senderId: row.senderId, createdAt: row.createdAt, text, deleted };
}

/** Thành viên thô (participant × user × con của PH trong lớp). */
export type ConversationMemberSource = {
  userId: string;
  role: ParticipantRole;
  derivedFrom: DerivedFrom | null;
  joinedAt: Date;
  name: string | null;
  phone: string | null;
  email: string | null;
  /** Tên các con của PH này đang thuộc lớp — chỉ để dựng nhãn "PH của ...". */
  childNames: string[];
};

/**
 * Thành viên trả cho client. Khoá `contact` **KHÔNG TỒN TẠI** khi người xem là PH —
 * không phải `null`, không phải chuỗi rỗng: payload sạch tuyệt đối (BR-30/TS-04.4).
 * `address` không bao giờ có mặt, kể cả với nhân viên (không phải nhu cầu của màn chat).
 */
export type ConversationMemberView = {
  userId: string;
  displayName: string;
  role: ParticipantRole;
  derivedFrom: DerivedFrom | null;
  roleLabel: string;
  joinedAt: Date;
  contact?: { phone: string | null; email: string | null };
};

function roleLabelOf(derivedFrom: DerivedFrom | null, childNames: string[]): string {
  if (derivedFrom === "CLASS_TEACHER") return "Giáo viên";
  if (derivedFrom === "CENTER_MANAGER") return "Quản lý cơ sở";
  if (derivedFrom === "CLASS_STUDENT_PARENT") {
    return childNames.length > 0 ? `PH của ${childNames.join(", ")}` : "Phụ huynh";
  }
  return "Thành viên";
}

export function toMemberView(
  source: ConversationMemberSource,
  opts: { hideContacts: boolean },
): ConversationMemberView {
  // Không rơi về phone/email làm tên khi `name` rỗng — đó chính là đường rò của
  // `displayName()` trong sync-membership (chỗ đó chỉ ghi SYSTEM message nội bộ).
  const rawName = source.name?.trim() ? source.name.trim() : "Thành viên";
  const label = roleLabelOf(source.derivedFrom, source.childNames);
  const base: ConversationMemberView = {
    userId: source.userId,
    displayName: opts.hideContacts ? redactContactLike(rawName) : rawName,
    role: source.role,
    derivedFrom: source.derivedFrom,
    roleLabel: opts.hideContacts ? redactContactLike(label) : label,
    joinedAt: source.joinedAt,
  };
  if (opts.hideContacts) return base; // khoá `contact` không được tạo ra
  return { ...base, contact: { phone: source.phone, email: source.email } };
}

// ─── PHẦN DB ────────────────────────────────────────────────────────────────

/** Field tin nhắn cần cho tầng đọc — dùng chung 2 hàm phân trang. */
const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  kind: true,
  senderId: true,
  body: true,
  replyToId: true,
  clientMsgId: true,
  createdAt: true,
  deletedAt: true,
} as const;

type ActiveParticipant = {
  id: string;
  role: ParticipantRole;
  derivedFrom: DerivedFrom | null;
  unreadCount: number;
  lastReadMessageId: string | null;
};

/**
 * Cổng chặn DUY NHẤT của tầng đọc: phải là participant CÒN HIỆU LỰC (`leftAt IS NULL`).
 * TS-01.7 — PH đã rời bị chặn NGAY, không có grace period ở API (hạn đọc 90 ngày của
 * BR-04 là việc của story riêng, không nới ở đây).
 */
async function assertActiveParticipant(
  conversationId: string,
  userId: string,
): Promise<ActiveParticipant> {
  const p = await db.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: {
      id: true,
      role: true,
      derivedFrom: true,
      leftAt: true,
      unreadCount: true,
      lastReadMessageId: true,
    },
  });
  if (!p || p.leftAt !== null) notParticipant();
  return {
    id: p.id,
    role: p.role,
    derivedFrom: p.derivedFrom,
    unreadCount: p.unreadCount,
    lastReadMessageId: p.lastReadMessageId,
  };
}

/** Một dòng trong danh sách hội thoại (M1). */
export type ConversationListItem = {
  conversationId: string;
  type: string;
  status: string;
  /** US-08 AC4 — UI xếp nhóm này XUỐNG DƯỚI khối ACTIVE. */
  isArchived: boolean;
  /** "Đã lưu trữ" khi ARCHIVED, "Đang khoá" khi LOCKED, còn lại null. */
  statusLabel: string | null;
  /** Nhóm lớp = TÊN LỚP hiện tại (không phải `Conversation.title` đã chụp lúc tạo). */
  displayName: string;
  lastMessageAt: Date | null;
  unreadCount: number;
  muted: boolean;
  participantRole: ParticipantRole;
  lastReadMessageId: string | null;
  lastMessage: ConversationPreview | null;
  centerId: string | null;
  subjectId: string | null;
};

type ConversationRowRaw = {
  conversationId: string;
  type: string;
  status: string;
  title: string | null;
  lastMessageAt: Date | null;
  subjectId: string | null;
  centerId: string | null;
  participantRole: ParticipantRole;
  unreadCount: number;
  muted: boolean;
  lastReadMessageId: string | null;
  className: string | null;
};

type PreviewRowRaw = {
  conversationId: string;
  id: string;
  kind: MessageKind;
  senderId: string | null;
  body: string;
  createdAt: Date;
  deletedAt: Date | null;
};

function statusLabelOf(status: string): string | null {
  if (status === "ARCHIVED") return ARCHIVED_LABEL;
  if (status === "LOCKED") return "Đang khoá";
  return null;
}

/**
 * US-08 AC1/AC2/AC4 — mọi hội thoại user đang là thành viên CÒN HIỆU LỰC.
 *
 * Phạm vi = `ConversationParticipant.leftAt IS NULL`, KHÔNG lọc theo cơ sở: PH thấy
 * nhóm lớp của con, GV thấy lớp mình dạy (kể cả dạy chéo cơ sở — TS-01.5), QLCS thấy
 * lớp cơ sở mình vì service đồng bộ đã cho họ vào nhóm.
 *
 * HIỆU NĂNG (không N+1 theo số hội thoại): đúng **2 truy vấn** bất kể user có bao
 * nhiêu hội thoại — (1) participant ⨝ conversation ⨝ class, (2) `DISTINCT ON` lấy tin
 * cuối của từng hội thoại (bám index `Message(conversationId, createdAt DESC)`).
 */
export async function listConversationsForUser(
  userId: string,
  opts?: { limit?: number },
): Promise<ConversationListItem[]> {
  const limit = Math.min(
    Math.max(opts?.limit ?? DEFAULT_CONVERSATION_LIMIT, 1),
    MAX_CONVERSATION_LIMIT,
  );

  // (1) Truy vấn chính. Raw có chủ đích: gộp 3 bảng trong MỘT lượt đi-về (Prisma
  // `include` bắn thêm query cho từng quan hệ), và Postgres cần `NULLS LAST` tường minh
  // cho `DESC` — hội thoại chưa có tin nào phải xuống cuối, không lên đầu.
  // `Class` ∈ SCOPED_MODELS nhưng đây là `db` trần (không extension) → không bị lọc.
  const rows = await db.$queryRaw<ConversationRowRaw[]>`
    SELECT
      c."id"                AS "conversationId",
      c."type"::text        AS "type",
      c."status"::text      AS "status",
      c."title"             AS "title",
      c."lastMessageAt"     AS "lastMessageAt",
      c."subjectId"         AS "subjectId",
      c."centerId"          AS "centerId",
      p."role"::text        AS "participantRole",
      p."unreadCount"       AS "unreadCount",
      p."muted"             AS "muted",
      p."lastReadMessageId" AS "lastReadMessageId",
      cls."name"            AS "className"
    FROM "ConversationParticipant" p
    JOIN "Conversation" c ON c."id" = p."conversationId"
    LEFT JOIN "Class" cls
      ON cls."id" = c."subjectId"
     AND c."type"::text = 'CLASS_GROUP'
     AND c."subjectType"::text = 'CLASS'
    WHERE p."userId" = ${userId}
      AND p."leftAt" IS NULL
    ORDER BY c."lastMessageAt" DESC NULLS LAST, c."id" ASC
    LIMIT ${limit}
  `;
  if (rows.length === 0) return [];

  // (2) Tin cuối của TỪNG hội thoại trong một truy vấn — `DISTINCT ON` là cách duy
  // nhất trong Postgres lấy "bản ghi đầu mỗi nhóm" mà không phải bắn N query.
  const ids = rows.map((r) => r.conversationId);
  const previews = await db.$queryRaw<PreviewRowRaw[]>`
    SELECT DISTINCT ON (m."conversationId")
      m."conversationId", m."id", m."kind"::text AS "kind", m."senderId",
      m."body", m."createdAt", m."deletedAt"
    FROM "Message" m
    WHERE m."conversationId" = ANY(${ids}::text[])
    ORDER BY m."conversationId", m."createdAt" DESC, m."id" DESC
  `;
  const previewByConv = new Map(previews.map((m) => [m.conversationId, m]));

  return rows
    .map((r) => ({
      conversationId: r.conversationId,
      type: r.type,
      status: r.status,
      isArchived: r.status === "ARCHIVED",
      statusLabel: statusLabelOf(r.status),
      displayName: r.className ?? r.title ?? "Hội thoại",
      lastMessageAt: r.lastMessageAt,
      unreadCount: r.unreadCount,
      muted: r.muted,
      participantRole: r.participantRole,
      lastReadMessageId: r.lastReadMessageId,
      lastMessage: buildPreview(previewByConv.get(r.conversationId) ?? null),
      centerId: r.centerId,
      subjectId: r.subjectId,
    }))
    .sort(compareConversations); // cùng quy tắc với ORDER BY — giữ 1 nơi kiểm chứng
}

export type MessagePage = {
  /** MỚI → CŨ (cùng chiều với cursor). UI đảo lại khi render luồng chat. */
  messages: ChatMessageView[];
  hasMore: boolean;
  nextCursor: string | null;
};

/**
 * US-09 AC1 — 30 tin mới nhất, cuộn lên tải tiếp bằng cursor `(createdAt, id)`.
 * KHÔNG OFFSET: tin mới chèn vào trong lúc người dùng cuộn cũng không làm lệch trang.
 * Cặp `(createdAt, id)` là thứ tự TOÀN PHẦN nên nhiều tin trùng `createdAt` tới
 * mili-giây vẫn không trùng/sót ở ranh giới trang.
 */
export async function getMessagesPage(
  conversationId: string,
  userId: string,
  opts?: { cursor?: string | null; limit?: number },
): Promise<MessagePage> {
  await assertActiveParticipant(conversationId, userId);

  const limit = Math.min(Math.max(opts?.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const cursor = decodeCursor(opts?.cursor);
  const rows = await db.message.findMany({
    where: {
      conversationId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: MESSAGE_SELECT,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    messages: page.map(toMessageView),
    hasMore,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}

export type MessagesSincePage = {
  /** CŨ → MỚI, đúng thứ tự để nối vào cuối luồng đang mở. */
  messages: ChatMessageView[];
  hasMore: boolean;
  /** Truyền lại vào `lastSeenMessageId` để lấy trang kế khi `hasMore`. */
  nextSinceMessageId: string | null;
};

/**
 * US-07 AC2 — reconcile sau khi mất mạng: trả các tin SAU `lastSeenMessageId`.
 *
 * `lastSeenMessageId = null` (hoặc id không thuộc hội thoại này — client giữ id cũ của
 * hội thoại khác) → trả từ tin ĐẦU TIÊN. Không ném lỗi: mục tiêu của reconcile là
 * không bao giờ mất tin, và id lạ không lộ gì vì mọi truy vấn đều khoá theo
 * `conversationId` mà người gọi đã qua cổng participant.
 */
export async function fetchMessagesSince(
  conversationId: string,
  userId: string,
  lastSeenMessageId: string | null,
  opts?: { limit?: number },
): Promise<MessagesSincePage> {
  await assertActiveParticipant(conversationId, userId);

  const limit = Math.min(Math.max(opts?.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const anchor = lastSeenMessageId
    ? await db.message.findFirst({
        where: { id: lastSeenMessageId, conversationId },
        select: { id: true, createdAt: true },
      })
    : null;

  const rows = await db.message.findMany({
    where: {
      conversationId,
      ...(anchor
        ? {
            OR: [
              { createdAt: { gt: anchor.createdAt } },
              { createdAt: anchor.createdAt, id: { gt: anchor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    select: MESSAGE_SELECT,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    messages: page.map(toMessageView),
    hasMore,
    nextSinceMessageId: last?.id ?? null,
  };
}

/**
 * US-08/M4 + **BR-30** — danh sách thành viên còn hiệu lực.
 *
 * Người xem có vai PARENT → payload KHÔNG chứa `phone`/`email`/`address` của BẤT KỲ AI,
 * kể cả GV (permissions.md: "PH thấy bản ẩn liên hệ"). Quyết định nằm ở ĐÂY, không ở
 * UI — mọi bề mặt (server action, route, RSC) gọi hàm này đều nhận cùng một bản đã lọc.
 */
export async function getConversationMembers(
  conversationId: string,
  viewerUserId: string,
): Promise<ConversationMemberView[]> {
  const viewerParticipant = await assertActiveParticipant(conversationId, viewerUserId);

  const [conversation, participants] = await Promise.all([
    db.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true, subjectType: true, subjectId: true },
    }),
    db.conversationParticipant.findMany({
      where: { conversationId, leftAt: null },
      select: { userId: true, role: true, derivedFrom: true, joinedAt: true },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    }),
  ]);
  if (participants.length === 0) return [];

  const userIds = participants.map((p) => p.userId);
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, phone: true, email: true, role: true, roles: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  const viewer = userById.get(viewerUserId);
  const hideContacts = shouldHideContacts({
    role: viewer?.role ?? null,
    roles: viewer?.roles ?? null,
    derivedFrom: viewerParticipant.derivedFrom,
  });

  // Nhãn "PH của <tên học viên>": con của từng PH ĐANG thuộc lớp của nhóm này.
  // `Student`/`Enrollment` ∈ SCOPED_MODELS — `db` trần cố ý (xem đầu file); `deletedAt`
  // của quan hệ lồng phải viết tay (extension soft-delete chỉ áp ở truy vấn top-level).
  const childNamesByParent = new Map<string, string[]>();
  const classId =
    conversation?.type === "CLASS_GROUP" && conversation.subjectType === "CLASS"
      ? conversation.subjectId
      : null;
  if (classId) {
    const parentIds = participants
      .filter((p) => p.derivedFrom === "CLASS_STUDENT_PARENT")
      .map((p) => p.userId);
    if (parentIds.length > 0) {
      const students = await db.student.findMany({
        where: {
          parentUserId: { in: parentIds },
          deletedAt: null,
          enrollments: {
            some: {
              classId,
              deletedAt: null,
              status: { in: ENROLLMENT_ACTIVE_STATUS_LIST },
            },
          },
        },
        select: { name: true, parentUserId: true },
        orderBy: { name: "asc" },
      });
      for (const s of students) {
        if (!s.parentUserId) continue;
        const list = childNamesByParent.get(s.parentUserId) ?? [];
        list.push(s.name);
        childNamesByParent.set(s.parentUserId, list);
      }
    }
  }

  return participants.map((p) => {
    const u = userById.get(p.userId);
    return toMemberView(
      {
        userId: p.userId,
        role: p.role,
        derivedFrom: p.derivedFrom,
        joinedAt: p.joinedAt,
        name: u?.name ?? null,
        phone: u?.phone ?? null,
        email: u?.email ?? null,
        childNames: childNamesByParent.get(p.userId) ?? [],
      },
      { hideContacts },
    );
  });
}

export type MarkReadResult = {
  unreadCount: 0;
  lastReadMessageId: string | null;
  lastReadAt: Date;
};

/**
 * US-07 AC5 — hội thoại đang mở ở foreground: `unreadCount` về 0 + ghi mốc đã đọc.
 * Idempotent: gọi lại với cùng tham số cho cùng kết quả, không sinh bản ghi mới.
 */
export async function markConversationRead(
  conversationId: string,
  userId: string,
  lastReadMessageId: string | null,
): Promise<MarkReadResult> {
  await assertActiveParticipant(conversationId, userId);

  const lastReadAt = new Date();
  await db.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { unreadCount: 0, lastReadMessageId, lastReadAt },
  });
  return { unreadCount: 0, lastReadMessageId, lastReadAt };
}
