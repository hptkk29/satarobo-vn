/**
 * ZZTEST — US-06 Chat Realtime: gửi tin CHAT qua Server Action (F-SEND).
 *
 *   pnpm exec tsx scripts/_zztest-chat-us06.ts
 *
 * Kiểm trên DB dev THẬT (quy ước ZZTEST: prefix ZZTEST_CHAT_US06_, cleanup
 * try/finally, chạy lại được, ép DIRECT_URL như US-03/US-04):
 *   1. Gửi tin OK       — Message vào DB + `lastMessageAt` cập nhật + `unreadCount`
 *                         +1 cho MỌI thành viên còn hiệu lực, người GỬI không tăng,
 *                         người đã rời không tăng.
 *   2. Idempotency      — gửi lại cùng `clientMsgId` → vẫn ĐÚNG 1 tin, trả về chính
 *                         tin cũ, `unreadCount` KHÔNG tăng lần thứ hai (AC4/TS-10.4).
 *   3. Đã rời nhóm      — participant có `leftAt` gửi → NOT_PARTICIPANT.
 *   4. Hội thoại lưu trữ— ARCHIVED → CONVERSATION_ARCHIVED (mã KHÁC case 3 — AC1/TS-03.7).
 *   5. Broadcast hỏng   — ép Realtime không tới được → action VẪN ok và tin VẪN trong
 *                         DB (AC3/TS-12: Postgres là nguồn sự thật).
 *   6. Rate limit       — quá 20 tin/phút/user → RATE_LIMITED.
 *
 * Tự dựng RoleDef riêng (ZZTEST_CHAT_US06_PARENT + perm chat:send/chat:read scope OWN)
 * để KHÔNG phụ thuộc việc DB dev đã seed `prisma/seed-roles.ts` bản mới hay chưa, và
 * KHÔNG đụng vào role thật. Toàn bộ dấu vết bị xoá ở finally.
 * CHẠY 2 LẦN — cả 2 lần PASS toàn bộ mới đạt (quy tắc dự án).
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import Module from "node:module";

// ⚠️ `lib/chat/broadcast.ts` mở đầu bằng `import "server-only"` (chặn service role key
// lọt xuống client). Package đó do Next tự cấp lúc build, KHÔNG nằm trong node_modules →
// chạy dưới `tsx` sẽ chết MODULE_NOT_FOUND (đúng vết đã gặp ở realtime-token, xem
// _zztest-chat-us02.ts). Trỏ nó về đúng file stub mà vitest đang dùng — chỉ ảnh hưởng
// tiến trình script này.
{
  type ResolveFn = (this: unknown, request: string, ...rest: unknown[]) => string;
  const loader = Module as unknown as { _resolveFilename: ResolveFn };
  const original = loader._resolveFilename;
  const stub = path.resolve(process.cwd(), "tests/stubs/server-only.ts");
  loader._resolveFilename = function (request: string, ...rest: unknown[]): string {
    if (request === "server-only") return stub;
    return original.call(this, request, ...rest);
  };
}

// ⚠️ `lib/chat/messages` bám singleton `@/lib/db` (đọc DATABASE_URL LÚC KHỞI TẠO) — ép
// đi DIRECT_URL (session pooler) TRƯỚC rồi mới dynamic-import, tránh lỗi prepared
// statement của transaction pooler khi script bắn nhiều query.
// (Static import bị hoist chạy trước dòng gán env → phải dùng import() động.)
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
const chatModule = import("../lib/chat/messages");
const actorModule = import("../lib/auth/actor");

const db = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const P = "ZZTEST_CHAT_US06_";
const ROLE_CODE = `${P}PARENT`;
const EMAIL = (x: string) => `zztest-chat-us06-${x}@zztest.local`;
const EMAILS = ["sender", "other", "left", "spam"].map(EMAIL);
const DM_ACTIVE = `${P}DM_ACTIVE`;
const DM_ARCHIVED = `${P}DM_ARCHIVED`;

let pass = true;
function report(label: string, ok: boolean, detail: string) {
  pass = pass && ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}

/** Xoá mọi dấu vết ZZTEST của script này (kể cả rác lần chạy trước) — idempotent. */
async function cleanup(): Promise<void> {
  const convs = await db.conversation.findMany({
    where: { dmKey: { in: [DM_ACTIVE, DM_ARCHIVED] } },
    select: { id: true },
  });
  const convIds = convs.map((c) => c.id);
  if (convIds.length > 0) {
    await db.message.deleteMany({ where: { conversationId: { in: convIds } } });
    await db.conversationParticipant.deleteMany({
      where: { conversationId: { in: convIds } },
    });
    await db.conversation.deleteMany({ where: { id: { in: convIds } } });
  }

  const users = await db.user.findMany({
    where: { email: { in: EMAILS } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await db.userOrgRole.deleteMany({ where: { userId: { in: userIds } } });
  }

  const role = await db.roleDef.findUnique({ where: { code: ROLE_CODE } });
  if (role) {
    await db.userOrgRole.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.roleDef.delete({ where: { id: role.id } });
  }

  await db.user.deleteMany({ where: { email: { in: EMAILS } } });
}

async function unreadOf(conversationId: string, userId: string): Promise<number> {
  const p = await db.conversationParticipant.findFirst({
    where: { conversationId, userId },
    select: { unreadCount: true },
  });
  return p?.unreadCount ?? -1;
}

async function main() {
  console.log(`DB host: ${currentDbHost()}`);
  const { sendChatMessageAsActor } = await chatModule;
  const { resolveActorUncached } = await actorModule;

  await cleanup(); // dọn rác lần chạy trước (idempotent)

  try {
    // ── Seed ────────────────────────────────────────────────────────────────
    const orgUnit =
      (await db.orgUnit.findFirst({ where: { type: "CENTER", deletedAt: null } })) ??
      (await db.orgUnit.findFirst({ where: { deletedAt: null } }));
    if (!orgUnit) throw new Error("DB dev không có OrgUnit nào — không dựng được actor");

    const role = await db.roleDef.create({
      data: {
        code: ROLE_CODE,
        name: "ZZTEST US-06 phụ huynh",
        permissions: {
          create: [
            { action: "chat:send", scopeType: "OWN" },
            { action: "chat:read", scopeType: "OWN" },
          ],
        },
      },
    });

    const mkUser = (slug: string) =>
      db.user.create({
        data: {
          email: EMAIL(slug),
          name: `${P}${slug}`,
          role: "PARENT",
          roles: ["PARENT"],
        },
      });
    const sender = await mkUser("sender");
    const other = await mkUser("other");
    const left = await mkUser("left");
    const spam = await mkUser("spam");

    for (const u of [sender, other, left, spam]) {
      await db.userOrgRole.create({
        data: {
          userId: u.id,
          orgUnitId: orgUnit.id,
          roleId: role.id,
          status: "ACTIVE",
          grantedById: sender.id,
        },
      });
    }

    // Hội thoại 1-1 (centerId null như DM thật) — ACTIVE + ARCHIVED.
    const convActive = await db.conversation.create({
      data: {
        type: "DM_TEACHER_PARENT",
        subjectType: "NONE",
        status: "ACTIVE",
        dmKey: DM_ACTIVE,
        title: `${P}active`,
      },
    });
    const convArchived = await db.conversation.create({
      data: {
        type: "DM_TEACHER_PARENT",
        subjectType: "NONE",
        status: "ARCHIVED",
        archivedAt: new Date(),
        dmKey: DM_ARCHIVED,
        title: `${P}archived`,
      },
    });

    for (const u of [sender, other, spam]) {
      await db.conversationParticipant.create({
        data: { conversationId: convActive.id, userId: u.id, role: "MEMBER", source: "MANUAL" },
      });
    }
    await db.conversationParticipant.create({
      data: {
        conversationId: convActive.id,
        userId: left.id,
        role: "MEMBER",
        source: "MANUAL",
        leftAt: new Date(),
      },
    });
    await db.conversationParticipant.create({
      data: { conversationId: convArchived.id, userId: sender.id, role: "MEMBER", source: "MANUAL" },
    });

    const actorSender = await resolveActorUncached(sender.id);
    const actorLeft = await resolveActorUncached(left.id);
    const actorSpam = await resolveActorUncached(spam.id);
    console.log(
      `Seed xong: conv=${convActive.id} · actor perms=${actorSender.permissions
        .map((p) => `${p.action}/${p.scopeType}`)
        .join(",")}`,
    );

    // ── 1. Gửi tin OK ───────────────────────────────────────────────────────
    const clientMsgId1 = randomUUID();
    const t0 = Date.now();
    const res1 = await sendChatMessageAsActor(actorSender, `${P}sender`, {
      conversationId: convActive.id,
      body: "  Chào cả nhà, con hôm nay học tốt chứ ạ?  ",
      clientMsgId: clientMsgId1,
    });

    const stored = await db.message.findMany({
      where: { conversationId: convActive.id, clientMsgId: clientMsgId1 },
    });
    const convAfter = await db.conversation.findUniqueOrThrow({
      where: { id: convActive.id },
      select: { lastMessageAt: true },
    });
    const unread = {
      other: await unreadOf(convActive.id, other.id),
      spam: await unreadOf(convActive.id, spam.id),
      sender: await unreadOf(convActive.id, sender.id),
      left: await unreadOf(convActive.id, left.id),
    };
    const ok1 =
      res1.ok &&
      stored.length === 1 &&
      stored[0]?.kind === "CHAT" &&
      stored[0]?.senderId === sender.id &&
      stored[0]?.body === "Chào cả nhà, con hôm nay học tốt chứ ạ?" && // đã trim
      convAfter.lastMessageAt !== null &&
      convAfter.lastMessageAt.getTime() >= t0 - 60_000 &&
      unread.other === 1 &&
      unread.spam === 1 &&
      unread.sender === 0 &&
      unread.left === 0;
    report(
      "1. gửi tin OK (message + lastMessageAt + unreadCount)",
      ok1,
      `ok=${res1.ok} · tin=${stored.length} · lastMessageAt=${convAfter.lastMessageAt?.toISOString()} · unread=${JSON.stringify(unread)}${res1.ok ? "" : ` · err=${JSON.stringify(res1.error)}`}`,
    );

    // ── 2. Idempotency: gửi lại cùng clientMsgId ────────────────────────────
    const res2 = await sendChatMessageAsActor(actorSender, `${P}sender`, {
      conversationId: convActive.id,
      body: "Chào cả nhà, con hôm nay học tốt chứ ạ?",
      clientMsgId: clientMsgId1,
    });
    const stored2 = await db.message.findMany({
      where: { conversationId: convActive.id, clientMsgId: clientMsgId1 },
    });
    const unreadOther2 = await unreadOf(convActive.id, other.id);
    const sameId =
      res1.ok && res2.ok ? res2.data.id === res1.data.id : false;
    report(
      "2. idempotency clientMsgId (AC4/TS-10.4)",
      res2.ok && stored2.length === 1 && sameId && unreadOther2 === 1,
      `ok=${res2.ok} · tin=${stored2.length} · cùng id=${sameId} · unread(other)=${unreadOther2} (phải giữ 1)`,
    );

    // ── 3. Người đã rời nhóm gửi → NOT_PARTICIPANT ──────────────────────────
    const res3 = await sendChatMessageAsActor(actorLeft, `${P}left`, {
      conversationId: convActive.id,
      body: "Tôi đã rời nhóm mà vẫn gửi được sao?",
      clientMsgId: randomUUID(),
    });
    const countAfter3 = await db.message.count({ where: { conversationId: convActive.id } });
    report(
      "3. participant đã rời → NOT_PARTICIPANT",
      !res3.ok && res3.error.code === "NOT_PARTICIPANT" && countAfter3 === 1,
      `${res3.ok ? "ok:true (SAI)" : `code=${res3.error.code} · msg="${res3.error.message}"`} · tổng tin=${countAfter3}`,
    );

    // ── 4. Hội thoại ARCHIVED → CONVERSATION_ARCHIVED (mã KHÁC case 3) ──────
    const res4 = await sendChatMessageAsActor(actorSender, `${P}sender`, {
      conversationId: convArchived.id,
      body: "Lớp kết thúc rồi vẫn gửi được sao?",
      clientMsgId: randomUUID(),
    });
    const countArch = await db.message.count({ where: { conversationId: convArchived.id } });
    report(
      "4. hội thoại ARCHIVED → CONVERSATION_ARCHIVED",
      // Mã riêng, KHÁC hẳn case 3 (AC1/TS-03.7): so sánh chéo nằm ở
      // lib/chat/messages.test.ts vì ở đây TS đã hẹp kiểu nên viết ra là dòng chết.
      !res4.ok && res4.error.code === "CONVERSATION_ARCHIVED" && countArch === 0,
      `${res4.ok ? "ok:true (SAI)" : `code=${res4.error.code} · msg="${res4.error.message}"`} · tin trong hội thoại=${countArch}`,
    );

    // ── 5. Broadcast hỏng → tin VẪN tồn tại, action VẪN ok (AC3/TS-12) ──────
    const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    // Cổng không ai nghe → fetch ném ngay (Realtime sập), đi đúng nhánh catch.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:59999";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zztest-invalid-service-role-key";
    const clientMsgId5 = randomUUID();
    const res5 = await sendChatMessageAsActor(actorSender, `${P}sender`, {
      conversationId: convActive.id,
      body: "Tin gửi lúc Realtime chết",
      clientMsgId: clientMsgId5,
    });
    if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;

    const stored5 = await db.message.count({
      where: { conversationId: convActive.id, clientMsgId: clientMsgId5 },
    });
    report(
      "5. broadcast hỏng → tin vẫn tồn tại + ok (TS-12)",
      res5.ok && stored5 === 1,
      `ok=${res5.ok} · tin trong DB=${stored5}${res5.ok ? "" : ` · err=${JSON.stringify(res5.error)}`}`,
    );

    // ── 6. Rate limit 20 tin/phút/user → tin thứ 21 bị chặn ────────────────
    // KHÔNG bắn 21 tin thật: mỗi tin đi vài round-trip tới pooler Supabase, 21 lượt dễ
    // vượt quá cửa sổ 60s ⇒ bộ đếm tự reset và case đỏ/xanh theo TỐC ĐỘ MẠNG (đúng kiểu
    // flake đã burn ở R7). Cách làm ở đây: 1 tin THẬT đi lọt (chứng minh đường thường),
    // rồi bơm 19 lượt còn lại bằng CHÍNH helper + CHÍNH key mà action dùng, rồi 1 tin
    // THẬT nữa phải bị chặn. Nếu key/max của action lệch với chỗ bơm thì tin thứ hai sẽ
    // lọt ⇒ case này đỏ — tức nó vẫn kiểm đúng thứ cần kiểm.
    const { rateLimit } = await import("../lib/rate-limit");
    const r6a = await sendChatMessageAsActor(actorSpam, `${P}spam`, {
      conversationId: convActive.id,
      body: "spam 1",
      clientMsgId: randomUUID(),
    });
    for (let i = 0; i < 19; i++) {
      await rateLimit({ key: `chat:send:${spam.id}`, max: 20, windowMs: 60_000 });
    }
    const r6b = await sendChatMessageAsActor(actorSpam, `${P}spam`, {
      conversationId: convActive.id,
      body: "spam 21",
      clientMsgId: randomUUID(),
    });
    const spamStored = await db.message.count({
      where: { conversationId: convActive.id, senderId: spam.id },
    });
    report(
      "6. vượt 20 tin/phút → RATE_LIMITED",
      r6a.ok &&
        !r6b.ok &&
        r6b.error.code === "RATE_LIMITED" &&
        /quá nhanh/i.test(r6b.error.message) &&
        spamStored === 1,
      `tin 1=${r6a.ok ? "ok" : r6a.error.code} · tin 21=${r6b.ok ? "ok (SAI)" : `${r6b.error.code} · msg="${r6b.error.message}"`} · tin của spam trong DB=${spamStored} (phải là 1)`,
    );
  } finally {
    await cleanup();
    await db.$disconnect();
  }

  console.log(`\n=== ${pass ? "TẤT CẢ PASS" : "CÓ CASE FAIL"} ===`);
  if (!pass) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
