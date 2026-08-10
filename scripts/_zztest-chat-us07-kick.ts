/**
 * ZZTEST — F-KICK bước 3 (US-07 AC3): khi `syncConversationMembership` set `leftAt`,
 * phải có DomainEvent `chat.participant_removed` sinh ra TRONG CÙNG transaction, để
 * dispatcher bắn `participant.removed` xuống kênh realtime và client tự thoát.
 *
 *   pnpm exec tsx scripts/_zztest-chat-us07-kick.ts
 *
 * Kiểm 3 điều:
 *   1. Gỡ học viên khỏi lớp → participant PH có `leftAt` + có ĐÚNG 1 DomainEvent
 *      `chat.participant_removed` với payload {conversationId, userId} đúng.
 *   2. Transaction nghiệp vụ ROLLBACK → KHÔNG còn event nào sót lại (event nằm trong
 *      cùng tx, không phải bắn ra ngoài rồi mới commit).
 *   3. Chạy sync lại khi không còn ai phải rời → KHÔNG sinh event mới (idempotent).
 *
 * Prefix ZZTEST_CHAT_US07K_, cleanup try/finally, chạy lại được. Ép DIRECT_URL.
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { PrismaClient, Prisma } from "@prisma/client";
import path from "node:path";
import Module from "node:module";

// `lib/chat/_handlers/participant-removed` kéo `lib/chat/broadcast` — file đó mở đầu
// bằng `import "server-only"`, package do Next cấp lúc build nên chạy dưới tsx sẽ chết
// MODULE_NOT_FOUND. Trỏ về stub vitest đang dùng (cùng cách _zztest-chat-us06.ts).
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

if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;

const db = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const P = "ZZTEST_CHAT_US07K_";
const EVENT = "chat.participant_removed";
type Tx = Prisma.TransactionClient;

let pass = true;
function report(label: string, ok: boolean, detail: string) {
  pass = pass && ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}

async function cleanup() {
  const classes = await db.class.findMany({ where: { name: { startsWith: P } }, select: { id: true } });
  const classIds = classes.map((c) => c.id);
  const convs = await db.conversation.findMany({
    where: { subjectId: { in: classIds } },
    select: { id: true },
  });
  const convIds = convs.map((c) => c.id);
  const students = await db.student.findMany({ where: { studentCode: { startsWith: P } }, select: { id: true } });
  const users = await db.user.findMany({ where: { email: { startsWith: P.toLowerCase() } }, select: { id: true } });

  await db.domainEvent.deleteMany({ where: { type: EVENT, dedupeKey: { contains: P } } });
  for (const cid of convIds) {
    await db.domainEvent.deleteMany({ where: { type: EVENT, payloadJson: { path: ["conversationId"], equals: cid } } });
  }
  await db.message.deleteMany({ where: { conversationId: { in: convIds } } });
  await db.conversationParticipant.deleteMany({ where: { conversationId: { in: convIds } } });
  await db.conversation.deleteMany({ where: { id: { in: convIds } } });
  await db.enrollment.deleteMany({ where: { studentId: { in: students.map((s) => s.id) } } });
  await db.class.deleteMany({ where: { id: { in: classIds } } });
  await db.student.deleteMany({ where: { id: { in: students.map((s) => s.id) } } });
  await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
}

async function countEvents(conversationId: string): Promise<number> {
  return db.domainEvent.count({
    where: { type: EVENT, payloadJson: { path: ["conversationId"], equals: conversationId } },
  });
}

async function main() {
  console.log(`DB host: ${currentDbHost()}`);
  const { syncConversationMembership } = await import("../lib/chat/sync-membership");
  await cleanup();

  const center = await db.center.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!center) throw new Error("DB không có Center nào");
  const course = await db.course.findFirst({ select: { id: true } });
  if (!course) throw new Error("DB không có Course nào");

  let convId = "";
  try {
    const gv = await db.user.create({
      data: { email: `${P.toLowerCase()}gv@zztest.local`, name: `${P}GV`, role: "TEACHER", roles: ["TEACHER"], centerId: center.id, isActive: true },
      select: { id: true },
    });
    const ph = await db.user.create({
      data: { email: `${P.toLowerCase()}ph@zztest.local`, name: `${P}PH`, role: "PARENT", roles: ["PARENT"], isActive: true },
      select: { id: true },
    });
    const hv = await db.student.create({
      data: { studentCode: `${P}HV`, name: `${P}HocVien`, parentName: `${P}PH`, parentPhone: "0900000777", parentUserId: ph.id, centerId: center.id },
      select: { id: true },
    });
    const cls = await db.class.create({
      data: { name: `${P}Lop`, courseId: course.id, centerId: center.id, teacherId: gv.id, status: "ACTIVE", minStudents: 1, maxStudents: 20 },
      select: { id: true },
    });
    const enr = await db.enrollment.create({
      data: { studentId: hv.id, classId: cls.id, courseId: course.id, status: "STUDYING", centerId: center.id },
      select: { id: true },
    });

    await db.$transaction(async (tx) => syncConversationMembership(tx as Tx, cls.id), { timeout: 30_000, maxWait: 10_000 });
    const conv = await db.conversation.findFirst({ where: { subjectId: cls.id }, select: { id: true } });
    if (!conv) throw new Error("sync không tạo Conversation");
    convId = conv.id;
    const eventsAfterSeed = await countEvents(convId);
    const phIn = await db.conversationParticipant.findFirst({ where: { conversationId: convId, userId: ph.id }, select: { leftAt: true } });
    report("SEED: PH trong nhóm, chưa có event kick", phIn?.leftAt === null && eventsAfterSeed === 0,
      `ph.leftAt=null=${phIn?.leftAt === null}, event=${eventsAfterSeed} (kỳ vọng 0)`);

    // ── 2. ROLLBACK: gỡ enrollment rồi sync, nhưng cho tx nổ ở cuối ──
    await db.$transaction(async (tx) => {
      await (tx as Tx).enrollment.update({ where: { id: enr.id }, data: { status: "WITHDREW" } });
      await syncConversationMembership(tx as Tx, cls.id);
      throw new Error("ép rollback");
    }, { timeout: 30_000, maxWait: 10_000 }).catch(() => null);
    const afterRollback = await countEvents(convId);
    const phAfterRollback = await db.conversationParticipant.findFirst({ where: { conversationId: convId, userId: ph.id }, select: { leftAt: true } });
    const enrAfterRollback = await db.enrollment.findUnique({ where: { id: enr.id }, select: { status: true } });
    report("ROLLBACK: không sót event, không sót leftAt (event nằm TRONG tx)",
      afterRollback === 0 && phAfterRollback?.leftAt === null && enrAfterRollback?.status === "STUDYING",
      `event=${afterRollback} (kỳ vọng 0), ph.leftAt=${phAfterRollback?.leftAt ? "SET" : "null"}, enrollment=${enrAfterRollback?.status}`);

    // ── 1. Gỡ thật ──
    await db.$transaction(async (tx) => {
      await (tx as Tx).enrollment.update({ where: { id: enr.id }, data: { status: "WITHDREW" } });
      await syncConversationMembership(tx as Tx, cls.id);
    }, { timeout: 30_000, maxWait: 10_000 });
    const phGone = await db.conversationParticipant.findFirst({ where: { conversationId: convId, userId: ph.id }, select: { leftAt: true } });
    const evs = await db.domainEvent.findMany({
      where: { type: EVENT, payloadJson: { path: ["conversationId"], equals: convId } },
      select: { payloadJson: true, status: true },
    });
    const payload = evs[0]?.payloadJson as { conversationId?: string; userId?: string } | undefined;
    report("US-07 AC3: gỡ HV → leftAt + ĐÚNG 1 event chat.participant_removed đúng payload",
      phGone?.leftAt !== null && evs.length === 1 && payload?.conversationId === convId && payload?.userId === ph.id,
      `ph.leftAt=${phGone?.leftAt ? "SET" : "null"}, event=${evs.length}, payload.userId khớp=${payload?.userId === ph.id}, status=${evs[0]?.status}`);

    // ── 3. Idempotent ──
    await db.$transaction(async (tx) => syncConversationMembership(tx as Tx, cls.id), { timeout: 30_000, maxWait: 10_000 });
    const evs2 = await countEvents(convId);
    report("Idempotent: sync lại khi không còn ai phải rời → KHÔNG sinh event mới", evs2 === 1, `event 1→${evs2}`);
  } finally {
    await cleanup();
    const sot = await db.class.count({ where: { name: { startsWith: P } } });
    const sotEv = convId ? await countEvents(convId) : 0;
    report("CLEANUP", sot === 0 && sotEv === 0, `lớp sót=${sot}, event sót=${sotEv}`);
  }

  console.log(pass ? "=== TẤT CẢ PASS ===" : "=== CÓ FAIL ===");
  if (!pass) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
