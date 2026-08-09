// @vitest-environment node
/**
 * US-06 — `sendChatMessage`: gửi tin CHAT (F-SEND).
 *
 * Hai tầng, đúng khuôn `lib/actions/factory.ts`:
 *  • THUẦN — `checkConversationSendable` / `checkReplyTarget` / schema zod: quyết
 *    định mã lỗi từ dữ liệu đã đọc, không chạm DB.
 *  • PIPELINE — gọi `sendChatMessageAsActor(actor, name, input)` (lõi của Server
 *    Action, nhận Actor đã resolve ⇒ test không cần HTTP/next-auth). DB được mock
 *    ở mức Prisma client nên chạy được ở MỌI máy, kể cả không có Postgres local
 *    (nghiệm thu DB thật nằm ở scripts/_zztest-chat-us06.ts).
 *
 * Điểm phải giữ bằng mọi giá:
 *  • ARCHIVED và "không phải thành viên" là HAI mã lỗi KHÁC NHAU (AC1 / TS-03.7a)
 *    — client cần phân biệt "lớp đã kết thúc" với "bạn không còn trong nhóm".
 *  • Broadcast hỏng KHÔNG được làm hỏng việc gửi tin (AC3 / TS-12).
 *  • Gửi lại cùng `clientMsgId` = trả tin cũ, KHÔNG tạo tin thứ hai và KHÔNG tăng
 *    unreadCount lần nữa (AC4 / TS-10.4).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock hạ tầng (hoisted — vi.mock chạy trước mọi import) ──────────────────
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    ctxRow: null as Row | null,
    existing: null as Row | null,
    reply: null as Row | null,
    seq: 0,
    created: [] as Row[],
    convUpdates: [] as Row[],
    unreadUpdates: [] as Row[],
    txOptions: null as Row | null,
    txCalls: 0,
  };
  const mockDb: Record<string, unknown> = {
    $extends: () => mockDb,
    $queryRaw: vi.fn(async () => (state.ctxRow ? [state.ctxRow] : [])),
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>, opts?: Row) => {
      state.txCalls += 1;
      state.txOptions = opts ?? null;
      return fn(mockDb);
    }),
    message: {
      findFirst: vi.fn(async () => state.existing),
      findUnique: vi.fn(async () => state.reply),
      create: vi.fn(async ({ data }: { data: Row }) => {
        state.seq += 1;
        const row = {
          id: `msg-${state.seq}`,
          createdAt: new Date("2026-08-09T03:00:00.000Z"),
          replyToId: null,
          ...data,
        };
        state.created.push(row);
        return row;
      }),
    },
    conversation: {
      update: vi.fn(async (args: Row) => {
        state.convUpdates.push(args);
        return {};
      }),
    },
    conversationParticipant: {
      updateMany: vi.fn(async (args: Row) => {
        state.unreadUpdates.push(args);
        return { count: 1 };
      }),
    },
  };
  return {
    state,
    mockDb,
    broadcast: vi.fn(async () => true),
    writeAudit: vi.fn(async () => ({})),
  };
});

vi.mock("@/lib/db", () => ({ db: h.mockDb }));
vi.mock("@/lib/audit/audit-log", () => ({ writeAudit: h.writeAudit }));
vi.mock("@/lib/chat/broadcast", () => ({ broadcastToConversation: h.broadcast }));
// Không kéo next-auth vào test node (lõi nhận Actor seed, không cần phiên thật).
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));

import { buildActor, type UserOrgRoleRow } from "@/lib/auth/actor";
import type { OrgUnitNode } from "@/lib/org/types";
import { ROLE_SEED } from "../../prisma/seed-roles";
import {
  checkConversationSendable,
  checkReplyTarget,
  sendChatMessageAsActor,
  sendChatMessageSchema,
  CHAT_SEND_RATE_MAX,
} from "./messages";

// ─── Actor seed (cùng khuôn lib/auth/chat-permissions.test.ts) ───────────────
const ORG: OrgUnitNode[] = [
  { id: "root", code: "SATAROBO", type: "ROOT", parentId: null, centerId: null },
  { id: "ho", code: "HO", type: "HO", parentId: "root", centerId: null },
  { id: "cs1", code: "CS1", type: "CENTER", parentId: "root", centerId: "c1" },
  { id: "cs2", code: "CS2", type: "CENTER", parentId: "root", centerId: "c2" },
];
const PAST = new Date("2000-01-01");

function seedPermsOf(code: string): UserOrgRoleRow["role"]["permissions"] {
  const r = ROLE_SEED.find((x) => x.code === code);
  if (!r) throw new Error(`ROLE_SEED thiếu RoleDef ${code}`);
  return r.perms.map((p) => ({ action: p.action, scopeType: p.scopeType }));
}

/** userId RIÊNG cho mỗi test — rate limiter là Map theo user, dùng chung sẽ dính nhau. */
function actorOf(code: string, orgUnitId: string, userId: string, classes?: string[]) {
  return buildActor({
    userId,
    rows: [
      {
        orgUnitId,
        status: "ACTIVE",
        effectiveFrom: PAST,
        effectiveTo: null,
        role: { code, isActive: true, permissions: seedPermsOf(code) },
      },
    ],
    orgNodes: ORG,
    assignedClassIds: classes,
    now: new Date("2026-08-09"),
  });
}

const CONV = "11111111-1111-4111-8111-111111111111";
const CONV_KHAC = "22222222-2222-4222-8222-222222222222";
const MSG_KHAC = "33333333-3333-4333-8333-333333333333";
const cid = (n: number) => `44444444-4444-4444-8444-4444444444${String(n).padStart(2, "0")}`;

type CtxRow = Record<string, unknown>;
function ctxRow(over: CtxRow = {}): CtxRow {
  return {
    conversationId: CONV,
    status: "ACTIVE",
    centerId: "c1",
    orgUnitId: "cs1",
    subjectType: "CLASS",
    subjectId: "lopA",
    createdById: null,
    participantId: "part-1",
    participantLeftAt: null,
    ...over,
  };
}

function input(over: Record<string, unknown> = {}) {
  return {
    conversationId: CONV,
    body: "Chào cả nhà",
    clientMsgId: cid(1),
    ...over,
  };
}

beforeEach(() => {
  h.state.ctxRow = ctxRow();
  h.state.existing = null;
  h.state.reply = null;
  h.state.seq = 0;
  h.state.created = [];
  h.state.convUpdates = [];
  h.state.unreadUpdates = [];
  h.state.txOptions = null;
  h.state.txCalls = 0;
  h.broadcast.mockClear();
  h.broadcast.mockImplementation(async () => true);
  h.writeAudit.mockClear();
  // Ép rate limiter về nhánh in-memory (không bắn HTTP tới Upstash trong unit test).
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

// ═════════════════════════════════════════════════════════════════════════════
// TẦNG THUẦN
// ═════════════════════════════════════════════════════════════════════════════

describe("[US-06] schema — chặn nội dung sai từ server (AC5)", () => {
  it("body > 4000 ký tự → VALIDATION (AC5: chặn ở CẢ server, không tin client)", () => {
    const res = sendChatMessageSchema.safeParse(input({ body: "a".repeat(4001) }));
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.path.join(".")).toBe("body");
  });

  it("body đúng 4000 ký tự → hợp lệ (biên không bị lệch 1)", () => {
    expect(sendChatMessageSchema.safeParse(input({ body: "a".repeat(4000) })).success).toBe(true);
  });

  it("body toàn khoảng trắng → VALIDATION (trim trước khi đo độ dài)", () => {
    expect(sendChatMessageSchema.safeParse(input({ body: "   \n\t  " })).success).toBe(false);
  });

  it("body được trim trước khi ghi (không lưu khoảng trắng thừa)", () => {
    const res = sendChatMessageSchema.safeParse(input({ body: "  xin chào  " }));
    expect(res.success).toBe(true);
    expect(res.data?.body).toBe("xin chào");
  });

  it("clientMsgId không phải UUID → VALIDATION (idempotency dựa trên khoá này)", () => {
    expect(sendChatMessageSchema.safeParse(input({ clientMsgId: "abc" })).success).toBe(false);
  });
});

describe("[US-06] checkConversationSendable — mã lỗi PHÂN BIỆT (AC1 / TS-03.7)", () => {
  it("không phải thành viên (không có bản ghi participant) → NOT_PARTICIPANT", () => {
    expect(
      checkConversationSendable(ctxRow({ participantId: null }) as never)?.code,
    ).toBe("NOT_PARTICIPANT");
  });

  it("đã rời nhóm (leftAt đã set) → NOT_PARTICIPANT, không có ân hạn", () => {
    expect(
      checkConversationSendable(ctxRow({ participantLeftAt: new Date() }) as never)?.code,
    ).toBe("NOT_PARTICIPANT");
  });

  it("hội thoại không tồn tại → NOT_PARTICIPANT (không lộ hội thoại có tồn tại hay không)", () => {
    expect(checkConversationSendable(null)?.code).toBe("NOT_PARTICIPANT");
  });

  it("ARCHIVED → CONVERSATION_ARCHIVED, KHÁC mã 'không phải thành viên' [TS-03.7a]", () => {
    const err = checkConversationSendable(ctxRow({ status: "ARCHIVED" }) as never);
    expect(err?.code).toBe("CONVERSATION_ARCHIVED");
    expect(err?.code).not.toBe("NOT_PARTICIPANT");
    expect(err?.message).toMatch(/kết thúc|lưu trữ/i);
  });

  it("LOCKED → CONVERSATION_LOCKED [TS-03.7b]", () => {
    expect(checkConversationSendable(ctxRow({ status: "LOCKED" }) as never)?.code).toBe(
      "CONVERSATION_LOCKED",
    );
  });

  it("ACTIVE + thành viên hiệu lực → không lỗi", () => {
    expect(checkConversationSendable(ctxRow() as never)).toBeNull();
  });

  it("đã rời VÀ hội thoại ARCHIVED → ưu tiên NOT_PARTICIPANT (thứ tự F-SEND bước 2 trước bước 3)", () => {
    expect(
      checkConversationSendable(
        ctxRow({ participantLeftAt: new Date(), status: "ARCHIVED" }) as never,
      )?.code,
    ).toBe("NOT_PARTICIPANT");
  });
});

describe("[US-06] checkReplyTarget — reply 1 cấp, không xuyên hội thoại", () => {
  it("tin gốc cùng hội thoại → hợp lệ", () => {
    expect(checkReplyTarget(CONV, { conversationId: CONV })).toBeNull();
  });

  it("tin gốc thuộc hội thoại KHÁC → REPLY_NOT_IN_CONVERSATION (chống trích dẫn xuyên nhóm)", () => {
    expect(checkReplyTarget(CONV, { conversationId: CONV_KHAC })?.code).toBe(
      "REPLY_NOT_IN_CONVERSATION",
    );
  });

  it("tin gốc không tồn tại → REPLY_NOT_IN_CONVERSATION", () => {
    expect(checkReplyTarget(CONV, null)?.code).toBe("REPLY_NOT_IN_CONVERSATION");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TẦNG PIPELINE — runAction qua sendChatMessageAsActor (Actor seed, không HTTP)
// ═════════════════════════════════════════════════════════════════════════════

describe("[US-06] đường thành công (AC2 + AC3)", () => {
  it("PH gửi tin: 1 Message CHAT + lastMessageAt + unreadCount +1 cho MỌI người trừ người gửi", async () => {
    const actor = actorOf("PARENT", "cs1", "ph-ok");
    const res = await sendChatMessageAsActor(actor, "PH Test", input());

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.body).toBe("Chào cả nhà");
    expect(res.data.kind).toBe("CHAT");
    expect(res.data.senderId).toBe("ph-ok");
    expect(res.data.clientMsgId).toBe(cid(1));

    // Ghi đúng 1 tin, kind=CHAT, senderId = người gửi.
    expect(h.state.created).toHaveLength(1);
    expect(h.state.created[0]).toMatchObject({ kind: "CHAT", senderId: "ph-ok" });

    // lastMessageAt cập nhật theo đúng thời điểm tin.
    expect(h.state.convUpdates).toHaveLength(1);

    // unreadCount: +1, loại trừ người gửi + người đã rời.
    expect(h.state.unreadUpdates).toHaveLength(1);
    const where = (h.state.unreadUpdates[0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ conversationId: CONV, leftAt: null });
    expect(where.userId).toEqual({ not: "ph-ok" });
    const data = (h.state.unreadUpdates[0] as { data: Record<string, unknown> }).data;
    expect(data).toEqual({ unreadCount: { increment: 1 } });
  });

  it("transaction đặt timeout 30s / maxWait 10s (luật E-bis #2 — trần 5s mặc định đứt giữa chừng)", async () => {
    const actor = actorOf("PARENT", "cs1", "ph-tx");
    await sendChatMessageAsActor(actor, "PH Test", input());
    expect(h.state.txOptions).toEqual({ timeout: 30_000, maxWait: 10_000 });
  });

  it("broadcast SAU commit, event message.created, payload có clientMsgId để client khử trùng (AC4)", async () => {
    const actor = actorOf("PARENT", "cs1", "ph-bc");
    await sendChatMessageAsActor(actor, "PH Test", input());

    expect(h.broadcast).toHaveBeenCalledTimes(1);
    const [convId, event, payload] = h.broadcast.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(convId).toBe(CONV);
    expect(event).toBe("message.created");
    expect(payload.clientMsgId).toBe(cid(1));
    expect(payload.id).toBe("msg-1");
  });

  it("ghi AuditLog module=chat / entityType=Message / action=CREATE, KHÔNG kèm nội dung tin", async () => {
    const actor = actorOf("PARENT", "cs1", "ph-audit");
    await sendChatMessageAsActor(actor, "PH Test", input());

    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    const arg = (h.writeAudit.mock.calls as unknown as Record<string, unknown>[][])[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(arg).toMatchObject({ module: "chat", entityType: "Message", action: "CREATE" });
    expect(JSON.stringify(arg.newValues)).not.toContain("Chào cả nhà");
  });

  it("GV lớp mình dạy gửi được (scope ASSIGNED)", async () => {
    const actor = actorOf("TEACHER", "cs1", "gv-ok", ["lopA"]);
    const res = await sendChatMessageAsActor(actor, "GV Test", input());
    expect(res.ok).toBe(true);
  });

  it("[TS-01.6] Sale (CENTER_SALES_CSM) → PERMISSION_DENIED, không ghi tin nào", async () => {
    const actor = actorOf("CENTER_SALES_CSM", "cs1", "sale-1");
    const res = await sendChatMessageAsActor(actor, "Sale Test", input());
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("PERMISSION_DENIED");
    expect(h.state.created).toHaveLength(0);
  });
});

describe("[US-06] guard qua pipeline — đúng mã lỗi, không ghi gì vào DB", () => {
  it("người đã rời nhóm → NOT_PARTICIPANT [TS-03.8]", async () => {
    h.state.ctxRow = ctxRow({ participantLeftAt: new Date() });
    const actor = actorOf("PARENT", "cs1", "ph-left");
    const res = await sendChatMessageAsActor(actor, "PH Test", input());

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("NOT_PARTICIPANT");
    expect(h.state.created).toHaveLength(0);
    expect(h.state.txCalls).toBe(0);
    expect(h.broadcast).not.toHaveBeenCalled();
  });

  it("hội thoại ARCHIVED → CONVERSATION_ARCHIVED [TS-03.7a]", async () => {
    h.state.ctxRow = ctxRow({ status: "ARCHIVED" });
    const actor = actorOf("PARENT", "cs1", "ph-arch");
    const res = await sendChatMessageAsActor(actor, "PH Test", input());

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("CONVERSATION_ARCHIVED");
    expect(h.state.created).toHaveLength(0);
  });

  it("hội thoại LOCKED → CONVERSATION_LOCKED, kể cả GV [TS-03.7b]", async () => {
    h.state.ctxRow = ctxRow({ status: "LOCKED" });
    const actor = actorOf("TEACHER", "cs1", "gv-lock", ["lopA"]);
    const res = await sendChatMessageAsActor(actor, "GV Test", input());

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("CONVERSATION_LOCKED");
  });

  it("replyToId thuộc hội thoại khác → REPLY_NOT_IN_CONVERSATION, không ghi tin", async () => {
    h.state.reply = { id: MSG_KHAC, conversationId: CONV_KHAC };
    const actor = actorOf("PARENT", "cs1", "ph-reply");
    const res = await sendChatMessageAsActor(actor, "PH Test", input({ replyToId: MSG_KHAC }));

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("REPLY_NOT_IN_CONVERSATION");
    expect(h.state.created).toHaveLength(0);
  });

  it("body quá 4000 ký tự qua pipeline → VALIDATION ở field body (AC5)", async () => {
    const actor = actorOf("PARENT", "cs1", "ph-long");
    const res = await sendChatMessageAsActor(actor, "PH Test", input({ body: "a".repeat(4001) }));

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION");
    expect(res.error.field).toBe("body");
    expect(h.state.created).toHaveLength(0);
  });
});

describe("[US-06][AC1] rate limit 20 tin/phút/user", () => {
  it(`tin thứ ${CHAT_SEND_RATE_MAX + 1} trong 1 phút → RATE_LIMITED, thông điệp tiếng Việt`, async () => {
    const actor = actorOf("PARENT", "cs1", "ph-rate");
    for (let i = 0; i < CHAT_SEND_RATE_MAX; i++) {
      const res = await sendChatMessageAsActor(actor, "PH Test", input({ clientMsgId: cid(i) }));
      expect(res.ok).toBe(true);
    }
    const res = await sendChatMessageAsActor(
      actor,
      "PH Test",
      input({ clientMsgId: cid(90) }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("RATE_LIMITED");
    expect(res.error.message).toMatch(/quá nhanh|thử lại/i);
    expect(h.state.created).toHaveLength(CHAT_SEND_RATE_MAX); // tin thứ 21 KHÔNG vào DB
  });
});

describe("[US-06][AC4] idempotency theo clientMsgId (TS-10.4)", () => {
  it("gửi lại cùng clientMsgId → trả CHÍNH tin cũ, không tạo tin thứ hai, unreadCount không tăng lần nữa", async () => {
    h.state.existing = {
      id: "msg-cu",
      conversationId: CONV,
      senderId: "ph-idem",
      kind: "CHAT",
      body: "Chào cả nhà",
      replyToId: null,
      clientMsgId: cid(1),
      createdAt: new Date("2026-08-09T02:00:00.000Z"),
    };
    const actor = actorOf("PARENT", "cs1", "ph-idem");
    const res = await sendChatMessageAsActor(actor, "PH Test", input());

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.id).toBe("msg-cu");
    expect(h.state.created).toHaveLength(0); // KHÔNG tạo tin mới
    expect(h.state.unreadUpdates).toHaveLength(0); // KHÔNG tăng unread lần 2
    expect(h.state.convUpdates).toHaveLength(0);
    expect(h.state.txCalls).toBe(0);
  });
});

describe("[US-06][AC3][TS-12] broadcast hỏng KHÔNG làm hỏng việc gửi tin", () => {
  it("broadcast trả false (Realtime chết/401) → tin vẫn ghi, action vẫn ok", async () => {
    h.broadcast.mockImplementation(async () => false);
    const actor = actorOf("PARENT", "cs1", "ph-bc-false");
    const res = await sendChatMessageAsActor(actor, "PH Test", input());

    expect(res.ok).toBe(true);
    expect(h.state.created).toHaveLength(1);
  });

  it("broadcast NÉM lỗi (vi phạm hợp đồng) → vẫn ok, tin vẫn còn (phòng thủ 2 lớp)", async () => {
    h.broadcast.mockImplementation(async () => {
      throw new Error("realtime sập");
    });
    const actor = actorOf("PARENT", "cs1", "ph-bc-throw");
    const res = await sendChatMessageAsActor(actor, "PH Test", input());

    expect(res.ok).toBe(true);
    expect(h.state.created).toHaveLength(1);
  });
});
