/**
 * ZZTEST — US-10 Chat Realtime: gửi & theo dõi ANNOUNCEMENT (F-ANN).
 *
 *   pnpm exec tsx scripts/_zztest-chat-us10.ts
 *
 * Kiểm trên DB dev THẬT (quy ước ZZTEST: prefix ZZTEST_CHAT_US10_, cleanup try/finally,
 * chạy lại được, ép DIRECT_URL — như US-06/US-08):
 *
 *   1. GV gửi ANNOUNCEMENT       → ok, `kind=ANNOUNCEMENT`, unreadCount +1 cho MỌI PH,
 *                                   người gửi KHÔNG tăng, `lastMessageAt` cập nhật.
 *   2. PH gửi ANNOUNCEMENT       → PERMISSION_DENIED [TS-03.1b], không ghi tin nào.
 *   3. QLCS gửi vào lớp cơ sở mình → ok [TS-03.3a] (scope CENTER).
 *   4. Quota 10/ngày/LỚP         → cái thứ 11 bị ANNOUNCEMENT_QUOTA_EXCEEDED (AC2),
 *                                   và tin của NGÀY HÔM QUA (23:59:59.999 giờ VN)
 *                                   KHÔNG bị tính vào hôm nay — ranh giới ngày VN.
 *   5. PH đánh dấu đã đọc        → có `AnnouncementRead`; gọi LẠI → `readAt` KHÔNG đổi (AC3).
 *   6. GV xem thống kê           → "đã đọc 1/3" + danh sách chưa đọc KHÔNG chứa SĐT/email
 *                                   (duyệt sâu như US-08 — BR-30), mẫu số chỉ đếm PH.
 *   7. PH xem thống kê           → PERMISSION_DENIED (permissions.md: "Xem đã-đọc
 *                                   ANNOUNCEMENT — PH ❌").
 *   8. listAnnouncements         → chỉ `kind=ANNOUNCEMENT`, mới nhất trước, cursor
 *                                   không trùng/sót (US-09 AC2).
 *   9. Rate limit 20/phút/NGƯỜI  → hết lượt thì RATE_LIMITED và KHÔNG ghi tin nào
 *                                   (F-ANN kế thừa bước 4 của F-SEND); bộ đếm theo
 *                                   người nên người khác không bị lây.
 *
 * Nhóm + participant dựng bằng CHÍNH `syncConversationMembership` (US-03) — không chế
 * participant bằng tay, để cái được kiểm là đường đi thật.
 * Tự dựng Center/OrgUnit/RoleDef RIÊNG (prefix ZZTEST) nên KHÔNG phụ thuộc DB dev đã
 * seed `prisma/seed-roles.ts` bản mới hay chưa, và KHÔNG kéo nhân sự thật vào nhóm test.
 * CHẠY 2 LẦN — cả 2 lần PASS toàn bộ mới đạt (quy tắc dự án).
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { Prisma, PrismaClient } from "@prisma/client";
import path from "node:path";
import Module from "node:module";
import { syncConversationMembership } from "../lib/chat/sync-membership";
// Module thuần (không `server-only`, không Prisma) — import tĩnh an toàn dưới tsx.
import { rateLimit } from "../lib/rate-limit";

// ⚠️ `lib/chat/broadcast.ts` mở đầu bằng `import "server-only"` (chặn service role key
// lọt xuống client). Package đó do Next tự cấp lúc build, KHÔNG nằm trong node_modules →
// chạy dưới `tsx` sẽ chết MODULE_NOT_FOUND. Trỏ về đúng stub mà vitest đang dùng —
// chỉ ảnh hưởng tiến trình script này. (Y hệt _zztest-chat-us06.ts.)
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

// ⚠️ `lib/chat/announcements` bám singleton `@/lib/db` (đọc DATABASE_URL LÚC KHỞI TẠO) —
// ép đi DIRECT_URL (session pooler) TRƯỚC rồi mới dynamic-import: transaction pooler 6543
// lỗi prepared-statement khi script bắn nhiều query. (Static import bị hoist chạy trước
// dòng gán env → bắt buộc import() động.)
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
const annModule = import("../lib/chat/announcements");
const actorModule = import("../lib/auth/actor");

const db = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const P = "ZZTEST_CHAT_US10_";
const SLUG = "zztest-chat-us10";
const EMAIL = (x: string) => `${SLUG}-${x}@example.com`;
/** id user đặt TAY (không cuid ngẫu nhiên): máy dò BR-30 không bao giờ bắt nhầm id. */
const UID = (x: string) => `${SLUG}-u-${x}`;
const ROLE_GV = `${P}TEACHER`;
const ROLE_QL = `${P}MANAGER`;
const ROLE_PH = `${P}PARENT`;
const ROLE_CODES = [ROLE_GV, ROLE_QL, ROLE_PH];

type Tx = Prisma.TransactionClient;
const TX_OPTS = { timeout: 30_000, maxWait: 10_000 } as const;

let pass = true;
function report(label: string, ok: boolean, detail: string) {
  pass = pass && ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Máy dò rò rỉ liên hệ (BR-30) — viết ĐỘC LẬP với hiện thực: duyệt sâu mọi
// khoá/giá trị chứ không kiểm vài field biết trước. (Bê nguyên từ US-08.)
// ─────────────────────────────────────────────────────────────────────────────
const CONTACT_KEY_RE = /phone|email|sdt|address|sđt/i;
const VN_PHONE_RE = /(?<![0-9])(?:\+?84|0)(?:3|5|7|8|9)[0-9]{8}(?![0-9])/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function findContactLeaks(value: unknown, path = "$", out: string[] = []): string[] {
  if (value === null || value === undefined) return out;
  if (value instanceof Date) return out;
  if (typeof value === "string") {
    if (VN_PHONE_RE.test(value)) out.push(`${path}="${value}" (SĐT VN)`);
    if (EMAIL_RE.test(value)) out.push(`${path}="${value}" (email)`);
    return out;
  }
  if (typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => findContactLeaks(v, `${path}[${i}]`, out));
    return out;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (CONTACT_KEY_RE.test(k)) out.push(`${path}.${k} (khoá nhạy cảm)`);
    findContactLeaks(v, `${path}.${k}`, out);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup — idempotent, dọn cả rác lần chạy trước.
// ─────────────────────────────────────────────────────────────────────────────
async function cleanup(): Promise<number> {
  const classes = await db.class.findMany({
    where: { name: { startsWith: P } },
    select: { id: true },
  });
  const classIds = classes.map((c) => c.id);
  const convs = await db.conversation.findMany({
    where: {
      OR: [
        ...(classIds.length
          ? [
              {
                type: "CLASS_GROUP" as const,
                subjectType: "CLASS" as const,
                subjectId: { in: classIds },
              },
            ]
          : []),
        { title: { startsWith: P } },
      ],
    },
    select: { id: true },
  });
  const convIds = convs.map((c) => c.id);
  if (convIds.length > 0) {
    const msgs = await db.message.findMany({
      where: { conversationId: { in: convIds } },
      select: { id: true },
    });
    const msgIds = msgs.map((m) => m.id);
    if (msgIds.length > 0) {
      await db.announcementRead.deleteMany({ where: { messageId: { in: msgIds } } });
      // Outbox: điểm móc push US-14 — dedupeKey mang đúng messageId.
      await db.domainEvent.deleteMany({
        where: { dedupeKey: { in: msgIds.map((id) => `chat.announcement_created:${id}`) } },
      });
    }
    await db.message.deleteMany({ where: { conversationId: { in: convIds } } });
    await db.conversationParticipant.deleteMany({ where: { conversationId: { in: convIds } } });
    await db.conversation.deleteMany({ where: { id: { in: convIds } } });
  }
  if (classIds.length > 0) {
    await db.conversationMembershipDrift.deleteMany({ where: { classId: { in: classIds } } });
  }

  const students = await db.student.findMany({
    where: { name: { startsWith: P } },
    select: { id: true },
  });
  const studentIds = students.map((s) => s.id);
  if (studentIds.length > 0 || classIds.length > 0) {
    await db.enrollment.deleteMany({
      where: {
        OR: [
          ...(studentIds.length ? [{ studentId: { in: studentIds } }] : []),
          ...(classIds.length ? [{ classId: { in: classIds } }] : []),
        ],
      },
    });
  }
  if (studentIds.length > 0) await db.student.deleteMany({ where: { id: { in: studentIds } } });
  if (classIds.length > 0) await db.class.deleteMany({ where: { id: { in: classIds } } });

  const users = await db.user.findMany({
    where: { email: { startsWith: `${SLUG}-` } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await db.userOrgRole.deleteMany({ where: { userId: { in: userIds } } });
  }
  const roles = await db.roleDef.findMany({ where: { code: { in: ROLE_CODES } }, select: { id: true } });
  if (roles.length > 0) {
    const roleIds = roles.map((r) => r.id);
    await db.userOrgRole.deleteMany({ where: { roleId: { in: roleIds } } });
    await db.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await db.roleDef.deleteMany({ where: { id: { in: roleIds } } });
  }
  await db.user.deleteMany({ where: { email: { startsWith: `${SLUG}-` } } });
  await db.course.deleteMany({ where: { slug: `${SLUG}-course` } });
  await db.orgUnit.deleteMany({ where: { code: `${P}CS` } });
  await db.center.deleteMany({ where: { slug: `${SLUG}-center` } });
  return convIds.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed — 1 cơ sở ZZTEST + 1 lớp + GV/QLCS/3 PH. Tên user cố ý chứa SĐT/email
// (data lead cũ hay thế) để máy dò BR-30 có cái để bắt.
// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  const center = await db.center.create({
    data: { name: `${P}CS`, slug: `${SLUG}-center`, address: "ZZTEST", city: "Đà Nẵng" },
  });
  const root = await db.orgUnit.findFirst({
    where: { type: "ROOT", deletedAt: null },
    select: { id: true },
  });
  const orgUnit = await db.orgUnit.create({
    data: {
      code: `${P}CS`,
      name: `${P}Cơ sở`,
      type: "CENTER",
      parentId: root?.id ?? null,
      centerId: center.id,
    },
  });

  // RoleDef riêng — KHÔNG đụng role thật, KHÔNG phụ thuộc seed-roles đã chạy hay chưa.
  const mkRole = (code: string, name: string, perms: { action: string; scopeType: "ASSIGNED" | "CENTER" | "OWN" }[]) =>
    db.roleDef.create({ data: { code, name, permissions: { create: perms } } });
  const roleGv = await mkRole(ROLE_GV, "ZZTEST US-10 giáo viên", [
    { action: "chat:read", scopeType: "ASSIGNED" },
    { action: "chat:send", scopeType: "ASSIGNED" },
    { action: "chat:announce", scopeType: "ASSIGNED" },
  ]);
  const roleQl = await mkRole(ROLE_QL, "ZZTEST US-10 QLCS", [
    { action: "chat:read", scopeType: "CENTER" },
    { action: "chat:send", scopeType: "CENTER" },
    { action: "chat:announce", scopeType: "CENTER" },
  ]);
  // PH: KHÔNG có chat:announce — đúng ma trận permissions.md.
  const rolePh = await mkRole(ROLE_PH, "ZZTEST US-10 phụ huynh", [
    { action: "chat:read", scopeType: "OWN" },
    { action: "chat:send", scopeType: "OWN" },
  ]);

  const mkUser = (
    key: string,
    name: string,
    role: "TEACHER" | "CENTER_MANAGER" | "PARENT",
    _phone: string,
  ) =>
    db.user.create({
      data: {
        id: UID(key),
        email: EMAIL(key),
        name,
        role,
        roles: [role],
        centerId: center.id,
        isActive: true,
      },
    });

  const gv = await mkUser("gv", `${P}GV Một`, "TEACHER", "0900001001");
  const ql = await mkUser("ql", `${P}QLCS Một`, "CENTER_MANAGER", "0900001002");
  const ph1 = await mkUser("ph1", `${P}PH Một`, "PARENT", "0900001011");
  // SĐT nằm ngay trong TÊN — đường rò BR-30 ngoài cột phone.
  const ph2 = await mkUser("ph2", `${P}PH Hai 0900001012`, "PARENT", "0900001012");
  // Email nằm trong tên.
  const ph3 = await mkUser("ph3", `${P}PH Ba lienhe@example.com`, "PARENT", "0900001013");

  const mkRoleAssign = (userId: string, roleId: string) =>
    db.userOrgRole.create({
      data: { userId, orgUnitId: orgUnit.id, roleId, status: "ACTIVE", grantedById: gv.id },
    });
  await mkRoleAssign(gv.id, roleGv.id);
  await mkRoleAssign(ql.id, roleQl.id);
  for (const ph of [ph1, ph2, ph3]) await mkRoleAssign(ph.id, rolePh.id);

  const course = await db.course.create({
    data: { name: `${P}Course`, slug: `${SLUG}-course` },
  });
  const lop = await db.class.create({
    data: {
      name: `${P}LopA`,
      courseId: course.id,
      centerId: center.id,
      teacherId: gv.id,
      status: "ACTIVE",
    },
  });

  let i = 0;
  for (const ph of [ph1, ph2, ph3]) {
    i += 1;
    const st = await db.student.create({
      data: { name: `${P}Con ${i}`, parentUserId: ph.id, centerId: center.id },
    });
    await db.enrollment.create({
      data: {
        studentId: st.id,
        classId: lop.id,
        courseId: course.id,
        centerId: center.id,
        status: "STUDYING",
      },
    });
  }

  return { center, orgUnit, course, lop, gv, ql, ph1, ph2, ph3 };
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
  const A = await annModule;
  const { resolveActorUncached } = await actorModule;

  try {
    const pre = await cleanup();
    if (pre > 0) console.log(`(dọn ${pre} conversation ZZTEST sót từ lần trước)`);
    const s = await seed();

    // ── Dựng nhóm bằng service thật ──
    await db.$transaction(async (tx) => syncConversationMembership(tx as Tx, s.lop.id), TX_OPTS);
    const conv = await db.conversation.findUniqueOrThrow({
      where: {
        type_subjectType_subjectId: {
          type: "CLASS_GROUP",
          subjectType: "CLASS",
          subjectId: s.lop.id,
        },
      },
      select: { id: true },
    });
    const convId = conv.id;

    // Xoá SYSTEM message do sync sinh + reset unread để con số kiểm được tất định.
    await db.message.deleteMany({ where: { conversationId: convId } });
    await db.conversationParticipant.updateMany({
      where: { conversationId: convId },
      data: { unreadCount: 0 },
    });
    await db.conversation.update({ where: { id: convId }, data: { lastMessageAt: null } });

    const parts = await db.conversationParticipant.findMany({
      where: { conversationId: convId, leftAt: null },
      select: { userId: true, derivedFrom: true, role: true },
    });
    const byUser = new Map(parts.map((p) => [p.userId, p]));
    report(
      "TIỀN ĐỀ seed — nhóm dựng bằng syncConversationMembership, đủ vai",
      byUser.get(s.gv.id)?.derivedFrom === "CLASS_TEACHER" &&
        byUser.get(s.ql.id)?.derivedFrom === "CENTER_MANAGER" &&
        byUser.get(s.ph1.id)?.derivedFrom === "CLASS_STUDENT_PARENT" &&
        parts.length === 5,
      `conv=${convId} · ${parts.length} thành viên (gv=${byUser.get(s.gv.id)?.derivedFrom}, ql=${byUser.get(s.ql.id)?.derivedFrom}, ph1=${byUser.get(s.ph1.id)?.derivedFrom})`,
    );

    const actorGv = await resolveActorUncached(s.gv.id);
    const actorQl = await resolveActorUncached(s.ql.id);
    const actorPh1 = await resolveActorUncached(s.ph1.id);

    // ── 1. GV gửi ANNOUNCEMENT ─────────────────────────────────────────────
    const t0 = Date.now();
    const res1 = await A.sendAnnouncementAsActor(actorGv, `${P}gv`, {
      conversationId: convId,
      body: "  Thứ 7 này lớp nghỉ, bù vào Chủ nhật 8h30.  ",
    });
    const annId = res1.ok ? res1.data.id : "";
    const stored1 = annId
      ? await db.message.findUnique({
          where: { id: annId },
          select: { kind: true, senderId: true, body: true },
        })
      : null;
    const convAfter = await db.conversation.findUniqueOrThrow({
      where: { id: convId },
      select: { lastMessageAt: true },
    });
    const unread1 = {
      ph1: await unreadOf(convId, s.ph1.id),
      ph2: await unreadOf(convId, s.ph2.id),
      ph3: await unreadOf(convId, s.ph3.id),
      ql: await unreadOf(convId, s.ql.id),
      gv: await unreadOf(convId, s.gv.id),
    };
    report(
      "1. GV gửi ANNOUNCEMENT → ok, kind=ANNOUNCEMENT, unread +1 cho PH",
      res1.ok &&
        stored1?.kind === "ANNOUNCEMENT" &&
        stored1.senderId === s.gv.id &&
        stored1.body === "Thứ 7 này lớp nghỉ, bù vào Chủ nhật 8h30." && // đã trim
        convAfter.lastMessageAt !== null &&
        convAfter.lastMessageAt.getTime() >= t0 - 60_000 &&
        unread1.ph1 === 1 &&
        unread1.ph2 === 1 &&
        unread1.ph3 === 1 &&
        unread1.ql === 1 &&
        unread1.gv === 0,
      `ok=${res1.ok} · kind=${stored1?.kind} · lastMessageAt=${convAfter.lastMessageAt?.toISOString()} · unread=${JSON.stringify(unread1)}${res1.ok ? "" : ` · err=${JSON.stringify(res1.error)}`}`,
    );

    // Điểm móc US-14: DomainEvent vào outbox CÙNG transaction.
    const evt = annId
      ? await db.domainEvent.findUnique({
          where: { dedupeKey: `chat.announcement_created:${annId}` },
          select: { type: true, status: true },
        })
      : null;
    report(
      "1b. điểm móc AC5 — DomainEvent chat.announcement_created vào outbox (push để US-14)",
      evt?.type === "chat.announcement_created" && evt.status === "PENDING",
      `event=${evt ? `${evt.type}/${evt.status}` : "KHÔNG CÓ"}`,
    );

    // ── 2. PH gửi ANNOUNCEMENT → PERMISSION_DENIED [TS-03.1b] ──────────────
    const res2 = await A.sendAnnouncementAsActor(actorPh1, `${P}ph1`, {
      conversationId: convId,
      body: "Phụ huynh cũng gửi thông báo được sao?",
    });
    const countAfter2 = await db.message.count({
      where: { conversationId: convId, kind: "ANNOUNCEMENT" },
    });
    report(
      "2. PH gửi ANNOUNCEMENT → PERMISSION_DENIED [TS-03.1b]",
      !res2.ok && res2.error.code === "PERMISSION_DENIED" && countAfter2 === 1,
      `${res2.ok ? "ok:true (SAI)" : `code=${res2.error.code} · msg="${res2.error.message}"`} · tổng ANNOUNCEMENT=${countAfter2} (phải là 1)`,
    );

    // ── 3. QLCS gửi vào lớp cơ sở mình → ok [TS-03.3a] ─────────────────────
    const res3 = await A.sendAnnouncementAsActor(actorQl, `${P}ql`, {
      conversationId: convId,
      body: "Cơ sở thông báo lịch nghỉ lễ.",
    });
    const countAfter3 = await db.message.count({
      where: { conversationId: convId, kind: "ANNOUNCEMENT" },
    });
    report(
      "3. QLCS gửi vào lớp cơ sở mình → ok [TS-03.3a]",
      res3.ok && countAfter3 === 2,
      `ok=${res3.ok} · tổng ANNOUNCEMENT=${countAfter3} (phải là 2)${res3.ok ? "" : ` · err=${JSON.stringify(res3.error)}`}`,
    );

    // ── 4. Quota 10/ngày/LỚP + ranh giới ngày VN ───────────────────────────
    // Đã có 2 thông báo hôm nay. Bơm thẳng vào DB:
    //   • 1 tin lúc ĐÚNG 00:00 giờ VN hôm nay  → PHẢI tính (biên dưới, gte)
    //   • 6 tin lúc bây giờ                    → tính
    //   • 1 tin lúc 23:59:59.999 giờ VN HÔM QUA → PHẢI KHÔNG tính (biên trên, lt)
    // ⇒ hôm nay = 9. Cái thứ 10 qua action phải LỌT, cái thứ 11 phải bị chặn.
    // Nếu ai đó tính ngày bằng UTC trần thì tin 00:00 VN (=17:00Z hôm qua) rơi ra
    // ngoài cửa sổ ⇒ cái thứ 11 lọt ⇒ case này ĐỎ. (Helper `vnDayWindow` được pin
    // riêng bằng mốc ISO tuyệt đối ở lib/chat/announcements.test.ts.)
    const now = new Date();
    const win = A.vnDayWindow(now);
    await db.message.createMany({
      data: [
        {
          conversationId: convId,
          senderId: s.gv.id,
          kind: "ANNOUNCEMENT" as const,
          body: `${P}00:00 giờ VN hôm nay`,
          createdAt: win.start,
        },
        {
          conversationId: convId,
          senderId: s.gv.id,
          kind: "ANNOUNCEMENT" as const,
          body: `${P}23:59:59.999 giờ VN HÔM QUA`,
          createdAt: new Date(win.start.getTime() - 1),
        },
        ...Array.from({ length: 6 }, (_, i) => ({
          conversationId: convId,
          senderId: s.gv.id,
          kind: "ANNOUNCEMENT" as const,
          body: `${P}bơm ${i}`,
          createdAt: now,
        })),
      ],
    });

    const res4a = await A.sendAnnouncementAsActor(actorGv, `${P}gv`, {
      conversationId: convId,
      body: "Thông báo thứ 10 trong ngày.",
    });
    const res4b = await A.sendAnnouncementAsActor(actorGv, `${P}gv`, {
      conversationId: convId,
      body: "Thông báo thứ 11 — phải bị chặn.",
    });
    const todayCount = await db.message.count({
      where: {
        conversationId: convId,
        kind: "ANNOUNCEMENT",
        createdAt: { gte: win.start, lt: win.endExclusive },
      },
    });
    const totalCount = await db.message.count({
      where: { conversationId: convId, kind: "ANNOUNCEMENT" },
    });
    report(
      "4. quota 10/ngày/lớp — cái thứ 11 → ANNOUNCEMENT_QUOTA_EXCEEDED (AC2)",
      res4a.ok &&
        !res4b.ok &&
        res4b.error.code === "ANNOUNCEMENT_QUOTA_EXCEEDED" &&
        /gộp/i.test(res4b.error.message) &&
        todayCount === 10 &&
        totalCount === 11,
      `thứ 10=${res4a.ok ? "ok" : res4a.error.code} · thứ 11=${res4b.ok ? "ok (SAI)" : `${res4b.error.code} · msg="${res4b.error.message}"`} · hôm nay=${todayCount} (phải 10) · tổng=${totalCount} (phải 11 — tin hôm qua vẫn còn nhưng KHÔNG tính)`,
    );

    // ── 5. PH đánh dấu đã đọc — idempotent (AC3) ───────────────────────────
    const r5a = await A.markAnnouncementRead(annId, s.ph1.id);
    const row5a = await db.announcementRead.findUnique({
      where: { messageId_userId: { messageId: annId, userId: s.ph1.id } },
      select: { readAt: true },
    });
    await new Promise((r) => setTimeout(r, 30)); // đủ để readAt mới khác readAt cũ nếu bị ghi đè
    const r5b = await A.markAnnouncementRead(annId, s.ph1.id);
    const row5b = await db.announcementRead.findUnique({
      where: { messageId_userId: { messageId: annId, userId: s.ph1.id } },
      select: { readAt: true },
    });
    const rowCount5 = await db.announcementRead.count({ where: { messageId: annId } });
    report(
      "5. PH đánh dấu đã đọc + gọi LẠI → readAt KHÔNG đổi (AC3 idempotent)",
      row5a !== null &&
        row5b !== null &&
        row5a.readAt.getTime() === row5b.readAt.getTime() &&
        r5a.alreadyRead === false &&
        r5b.alreadyRead === true &&
        r5b.readAt.getTime() === r5a.readAt.getTime() &&
        rowCount5 === 1,
      `readAt lần 1=${row5a?.readAt.toISOString()} · lần 2=${row5b?.readAt.toISOString()} · alreadyRead=${r5a.alreadyRead}/${r5b.alreadyRead} · số bản ghi=${rowCount5} (phải 1)`,
    );

    // ── 6. GV xem thống kê — "đã đọc 1/3" + BR-30 ──────────────────────────
    const stats = await A.getAnnouncementReadStats(annId, s.gv.id);
    const leaks = findContactLeaks(stats.unreadMembers);
    const rawJson = JSON.stringify(stats.unreadMembers);
    const rawLeak = ["0900001012", "lienhe@example.com", "0900001011", "0900001013"].filter((x) =>
      rawJson.includes(x),
    );
    const unreadIds = stats.unreadMembers.map((m) => m.userId).sort();
    report(
      "6. GV xem thống kê → đã đọc 1/3, mẫu số chỉ đếm PH (không đếm GV/QLCS)",
      stats.readCount === 1 &&
        stats.totalRecipients === 3 &&
        unreadIds.length === 2 &&
        unreadIds.includes(s.ph2.id) &&
        unreadIds.includes(s.ph3.id),
      `đã đọc ${stats.readCount}/${stats.totalRecipients} · chưa đọc=[${stats.unreadMembers.map((m) => m.displayName).join(" | ")}]`,
    );
    report(
      "6b. BR-30 — danh sách chưa đọc KHÔNG chứa SĐT/email của bất kỳ ai (duyệt sâu)",
      leaks.length === 0 && rawLeak.length === 0 && findContactLeaks(stats).length === 0,
      `rò rỉ duyệt sâu=${leaks.length}${leaks.length ? ` → ${leaks.join(" | ")}` : ""} · chuỗi thô lọt=${rawLeak.length} · tên đã che="${stats.unreadMembers.map((m) => m.displayName).join(" | ")}"`,
    );

    // ── 7. PH xem thống kê → PERMISSION_DENIED ─────────────────────────────
    let code7 = "";
    try {
      await A.getAnnouncementReadStats(annId, s.ph1.id);
      code7 = "KHÔNG chặn (SAI)";
    } catch (e) {
      code7 = e instanceof A.ChatAnnouncementError ? e.code : `lỗi lạ: ${String(e)}`;
    }
    report(
      "7. PH xem thống kê đã-đọc → PERMISSION_DENIED (permissions.md: PH ❌)",
      code7 === "PERMISSION_DENIED",
      `mã lỗi = ${code7}`,
    );

    // ── 8. listAnnouncements — chỉ ANNOUNCEMENT, mới nhất trước, cursor ─────
    await db.message.create({
      data: {
        conversationId: convId,
        senderId: s.ph1.id,
        kind: "CHAT",
        body: `${P}tin chat thường (KHÔNG được lọt vào danh sách thông báo)`,
      },
    });
    const page1 = await A.listAnnouncements(convId, s.ph1.id, { limit: 4 });
    const page2 = await A.listAnnouncements(convId, s.ph1.id, {
      limit: 4,
      cursor: page1.nextCursor,
    });
    const ids = [...page1.announcements, ...page2.announcements].map((m) => m.id);
    const allAnn = page1.announcements.concat(page2.announcements).every((m) => m.kind === "ANNOUNCEMENT");
    const descOk = page1.announcements
      .concat(page2.announcements)
      .every((m, i, arr) => i === 0 || arr[i - 1]!.createdAt.getTime() >= m.createdAt.getTime());
    let blocked8 = "";
    try {
      await A.listAnnouncements(convId, UID("nguoi-la"), { limit: 4 });
      blocked8 = "KHÔNG chặn (SAI)";
    } catch (e) {
      blocked8 = e instanceof A.ChatAnnouncementError ? e.code : `lỗi lạ: ${String(e)}`;
    }
    report(
      "8. listAnnouncements — chỉ kind=ANNOUNCEMENT, mới→cũ, cursor không trùng/sót; người ngoài → NOT_PARTICIPANT",
      allAnn &&
        descOk &&
        new Set(ids).size === ids.length &&
        page1.announcements.length === 4 &&
        page1.hasMore &&
        blocked8 === "NOT_PARTICIPANT",
      `trang1=${page1.announcements.length} (hasMore=${page1.hasMore}) · trang2=${page2.announcements.length} · trùng=${ids.length - new Set(ids).size} · toàn ANNOUNCEMENT=${allAnn} · giảm dần=${descOk} · người ngoài=${blocked8}`,
    );

    // ── 9. Rate limit 20/phút/NGƯỜI (F-ANN kế thừa F-SEND bước 4) ──────────
    // ⚠️ userId sinh THEO LẦN CHẠY: bộ đếm có thể là Upstash (dùng chung giữa các
    // tiến trình, TTL 60s) — id cố định sẽ làm lần chạy thứ 2 trong vòng 1 phút đỏ
    // oan. Không cần User thật: `ConversationParticipant.userId` cố ý không có FK, và
    // `can()` quyết theo perm/assignedClassIds của Actor chứ không theo userId.
    const rl1 = `${SLUG}-u-rl1-${Date.now()}`;
    const rl2 = `${SLUG}-u-rl2-${Date.now()}`;
    await db.conversationParticipant.createMany({
      data: [rl1, rl2].map((userId) => ({
        conversationId: convId,
        userId,
        role: "MODERATOR" as const,
        source: "MANUAL" as const,
        derivedFrom: "CLASS_TEACHER" as const,
      })),
    });
    // Tiêu hết 20 lượt của rl1 bằng CHÍNH khoá/ngưỡng/cửa sổ mà action dùng.
    for (let i = 0; i < A.ANNOUNCEMENT_RATE_MAX; i += 1) {
      await rateLimit({
        key: A.announcementRateKey(rl1),
        max: A.ANNOUNCEMENT_RATE_MAX,
        windowMs: A.ANNOUNCEMENT_RATE_WINDOW_MS,
      });
    }
    const annBefore9 = await db.message.count({
      where: { conversationId: convId, kind: "ANNOUNCEMENT" },
    });
    const res9a = await A.sendAnnouncementAsActor({ ...actorGv, userId: rl1 }, `${P}rl1`, {
      conversationId: convId,
      body: "Thông báo thứ 21 trong phút — phải bị chặn vì rate limit.",
    });
    // rl2 chưa tiêu lượt nào ⇒ KHÔNG được dính RATE_LIMITED (bộ đếm theo NGƯỜI).
    // Quota ngày của lớp đã cạn ở case 4 nên kỳ vọng là ANNOUNCEMENT_QUOTA_EXCEEDED —
    // điều cần chứng minh chỉ là "không phải RATE_LIMITED".
    const res9b = await A.sendAnnouncementAsActor({ ...actorGv, userId: rl2 }, `${P}rl2`, {
      conversationId: convId,
      body: "Người khác vẫn còn lượt riêng.",
    });
    const annAfter9 = await db.message.count({
      where: { conversationId: convId, kind: "ANNOUNCEMENT" },
    });
    report(
      "9. rate limit 20/phút/NGƯỜI — hết lượt → RATE_LIMITED, không ghi tin; người khác không bị lây",
      !res9a.ok &&
        res9a.error.code === "RATE_LIMITED" &&
        !res9b.ok &&
        res9b.error.code !== "RATE_LIMITED" &&
        annAfter9 === annBefore9,
      `rl1=${res9a.ok ? "ok:true (SAI)" : res9a.error.code} · rl2=${res9b.ok ? "ok:true" : res9b.error.code} (phải KHÁC RATE_LIMITED) · số ANNOUNCEMENT ${annBefore9}→${annAfter9} (phải không đổi)`,
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
