/**
 * ZZTEST — US-08 + US-09 Chat Realtime: TẦNG ĐỌC (lib/chat/queries.ts).
 *
 *   pnpm tsx scripts/_zztest-chat-us08.ts
 *
 * Kiểm trên DB dev (quy ước ZZTEST của repo — record prefix ZZTEST_CHAT_US08_,
 * cleanup try/finally, chạy lại được; ép DIRECT_URL + thao tác tuần tự như US-03/04):
 *
 *   TS-01.1 — ph1 (2 con cùng LopA) listConversations → CHỈ nhóm LopA + DM của mình;
 *             KHÔNG LopB (khác cơ sở), KHÔNG LopC (không phải thành viên).
 *   TS-01.2 — ph1 getMessagesPage(LopB) bằng ID → NOT_PARTICIPANT ngay.
 *   TS-01.3 — ph2 (con ở cả 2 lớp, 2 cơ sở) → đúng 2 nhóm LopA + LopB.
 *   TS-01.4 — ql1 (QLCS CS1) → LopA + LopC(ARCHIVED), KHÔNG LopB; đọc LopB → chặn.
 *   TS-01.5 — gv3 dạy chéo (trợ giảng LopA CS1 + LopB CS2) → thấy CẢ HAI.
 *   TS-01.7 — ph4 (con đã nghỉ → leftAt đã set) đọc LopA → NOT_PARTICIPANT NGAY,
 *             không grace period; fetchMessagesSince cũng chặn.
 *   US-08.2 — sắp theo lastMessageAt giảm dần, hội thoại chưa có tin xuống CUỐI;
 *             badge unreadCount; preview tin cuối.
 *   US-08.4 — hội thoại ARCHIVED vẫn trả, có cờ isArchived + nhãn "Đã lưu trữ".
 *   US-09.1 — phân trang cursor 35 tin (có 3 tin TRÙNG createdAt tới mili-giây nằm
 *             ĐÚNG ranh giới trang): không trùng, không sót, đúng thứ tự.
 *   US-12.3 — tin đã gỡ: body KHÔNG BAO GIỜ rời DB (page + preview + reconcile).
 *   US-07.2 — fetchMessagesSince phân trang khi > 30 tin, thứ tự tăng dần.
 *   US-07.5 — markConversationRead reset unread + idempotent.
 *   TS-04.4 — BR-30: payload thành viên cho PH KHÔNG chứa SĐT/email của bất kỳ ai
 *             (DUYỆT SÂU toàn object: tên khoá nhạy cảm + giá trị khớp SĐT VN/email),
 *             GV thấy đầy đủ.
 *
 * Nhóm + participant dựng bằng CHÍNH syncConversationMembership (US-03) — không chế
 * participant bằng tay, để cái được kiểm là đường đi thật.
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { Prisma, PrismaClient } from "@prisma/client";
import { syncConversationMembership } from "../lib/chat/sync-membership";

// ⚠️ `lib/chat/queries.ts` bám singleton `@/lib/db` (đọc DATABASE_URL lúc khởi tạo)
// — ép DIRECT_URL (session pooler) TRƯỚC rồi mới dynamic-import, y hệt _zztest-chat-us04:
// transaction pooler 6543 chạy lặp sẽ lỗi prepared-statement/42P05. (Static import bị
// hoist chạy trước dòng gán env → bắt buộc import() động.)
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
const queriesModule = import("../lib/chat/queries");

const db = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const P = "ZZTEST_CHAT_US08_";
const SLUG = "zztest-chat-us08";
const EMAIL = (x: string) => `${SLUG}-${x}@example.com`;
const MSG_ID = (i: number) => `${SLUG}-m-${String(i).padStart(2, "0")}`;

let pass = true;
function report(label: string, ok: boolean, detail: string) {
  pass = pass && ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}

type Tx = Prisma.TransactionClient;
// timeout 30s cho mọi tx có sync (luật E-bis #2) — trần 5s mặc định đứt giữa chừng.
const TX_OPTS = { timeout: 30_000, maxWait: 10_000 } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Máy dò rò rỉ liên hệ (BR-30 / TS-04.4) — viết ĐỘC LẬP với hiện thực: duyệt sâu
// mọi khoá/giá trị chứ không kiểm vài field biết trước.
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
          ? [{ type: "CLASS_GROUP" as const, subjectType: "CLASS" as const, subjectId: { in: classIds } }]
          : []),
        { title: { startsWith: P } },
        { dmKey: { startsWith: `${SLUG}:` } },
      ],
    },
    select: { id: true },
  });
  const convIds = convs.map((c) => c.id);
  if (convIds.length > 0) {
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
  await db.user.deleteMany({ where: { email: { startsWith: `${SLUG}-` } } });
  await db.course.deleteMany({ where: { slug: `${SLUG}-course` } });
  await db.center.deleteMany({ where: { slug: { startsWith: `${SLUG}-center` } } });
  return convIds.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed — 2 cơ sở × lớp × PH/GV/QLCS theo tinh thần "Seed chuẩn" của TestScenarios.
// SĐT cố ý ĐÚNG dạng SĐT VN để máy dò bắt được nếu lọt ra payload của PH.
// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  const cs1 = await db.center.create({
    data: { name: `${P}CS1`, slug: `${SLUG}-center-1`, address: "ZZTEST CS1", city: "Đà Nẵng" },
  });
  const cs2 = await db.center.create({
    data: { name: `${P}CS2`, slug: `${SLUG}-center-2`, address: "ZZTEST CS2", city: "Đà Nẵng" },
  });
  const course = await db.course.create({
    data: { name: `${P}Course`, slug: `${SLUG}-course` },
  });

  // Tạo tuần tự (không Promise.all) — pooler Supabase hay lỗi prepared-statement
  // khi bắn song song từ script ngoài Next.
  const mkUser = (key: string, name: string, role: "TEACHER" | "CENTER_MANAGER" | "PARENT", centerId: string | null, phone: string) =>
    db.user.create({
      data: { email: EMAIL(key), name, role, roles: [role], centerId, phone },
    });

  const gv1 = await mkUser("gv1", `${P}GV Một`, "TEACHER", cs1.id, "0900008801");
  const gv2 = await mkUser("gv2", `${P}GV Hai`, "TEACHER", cs2.id, "0900008802");
  const gv3 = await mkUser("gv3", `${P}GV Ba (dạy chéo)`, "TEACHER", null, "0900008803");
  const ql1 = await mkUser("ql1", `${P}QLCS Một`, "CENTER_MANAGER", cs1.id, "0900008811");
  const ql2 = await mkUser("ql2", `${P}QLCS Hai`, "CENTER_MANAGER", cs2.id, "0900008812");
  const ph1 = await mkUser("ph1", `${P}PH Một`, "PARENT", cs1.id, "0900008821");
  // Tên user THẬT chứa SĐT (data lead cũ hay thế) — đường rò BR-30 ngoài cột phone.
  const ph2 = await mkUser("ph2", `${P}PH Hai 0900008822`, "PARENT", cs1.id, "0900008822");
  const ph3 = await mkUser("ph3", `${P}PH Ba`, "PARENT", cs2.id, "0900008823");
  const ph4 = await mkUser("ph4", `${P}PH Bốn`, "PARENT", cs1.id, "0900008824");

  const lopA = await db.class.create({
    data: { name: `${P}LopA`, courseId: course.id, centerId: cs1.id, teacherId: gv1.id, assistantId: gv3.id, status: "ACTIVE" },
  });
  const lopB = await db.class.create({
    data: { name: `${P}LopB`, courseId: course.id, centerId: cs2.id, teacherId: gv2.id, assistantId: gv3.id, status: "ACTIVE" },
  });
  const lopC = await db.class.create({
    data: { name: `${P}LopC`, courseId: course.id, centerId: cs1.id, teacherId: gv1.id, status: "ACTIVE" },
  });

  const mkStudent = (name: string, parentUserId: string, centerId: string) =>
    db.student.create({ data: { name, parentUserId, centerId } });
  const con1 = await mkStudent(`${P}Con Anh (ph1)`, ph1.id, cs1.id);
  const con2 = await mkStudent(`${P}Con Bình (ph1)`, ph1.id, cs1.id);
  const con3 = await mkStudent(`${P}Con Chi (ph2 - LopA)`, ph2.id, cs1.id);
  const con4 = await mkStudent(`${P}Con Dung (ph2 - LopB)`, ph2.id, cs2.id);
  const con5 = await mkStudent(`${P}Con Em (ph3)`, ph3.id, cs2.id);
  const con6 = await mkStudent(`${P}Con Phong (ph4)`, ph4.id, cs1.id);
  const con7 = await mkStudent(`${P}Con Giang (LopC)`, ph3.id, cs1.id);

  await db.enrollment.createMany({
    data: [
      { studentId: con1.id, classId: lopA.id, courseId: course.id, centerId: cs1.id, status: "STUDYING" },
      { studentId: con2.id, classId: lopA.id, courseId: course.id, centerId: cs1.id, status: "STUDYING" },
      { studentId: con3.id, classId: lopA.id, courseId: course.id, centerId: cs1.id, status: "STUDYING" },
      { studentId: con4.id, classId: lopB.id, courseId: course.id, centerId: cs2.id, status: "STUDYING" },
      { studentId: con5.id, classId: lopB.id, courseId: course.id, centerId: cs2.id, status: "STUDYING" },
      { studentId: con6.id, classId: lopA.id, courseId: course.id, centerId: cs1.id, status: "STUDYING" },
      { studentId: con7.id, classId: lopC.id, courseId: course.id, centerId: cs1.id, status: "STUDYING" },
    ],
  });

  return { cs1, cs2, course, gv1, gv2, gv3, ql1, ql2, ph1, ph2, ph3, ph4, lopA, lopB, lopC, con1, con2, con6 };
}

const sync = (classId: string) =>
  db.$transaction(async (tx) => syncConversationMembership(tx as Tx, classId), TX_OPTS);

async function convIdOf(classId: string): Promise<string> {
  const c = await db.conversation.findUniqueOrThrow({
    where: { type_subjectType_subjectId: { type: "CLASS_GROUP", subjectType: "CLASS", subjectId: classId } },
    select: { id: true },
  });
  return c.id;
}

const BASE_AT = new Date("2026-08-01T02:00:00.000Z");
/** 35 tin; i=24,25,26 TRÙNG createdAt tới mili-giây (rơi đúng ranh giới trang limit=10). */
const msgAt = (i: number) => new Date(BASE_AT.getTime() + (i >= 24 && i <= 26 ? 24 : i) * 60_000);
const SECRET_BODY = "NOI-DUNG-DA-GO-KHONG-DUOC-LO-RA-API";

/** Thứ tự MỚI→CŨ kỳ vọng: 34..27, rồi cụm trùng 26,25,24 (id giảm dần), rồi 23..0. */
function expectedDescIds(): string[] {
  const out: string[] = [];
  for (let i = 34; i >= 27; i--) out.push(MSG_ID(i));
  out.push(MSG_ID(26), MSG_ID(25), MSG_ID(24));
  for (let i = 23; i >= 0; i--) out.push(MSG_ID(i));
  return out;
}

async function main() {
  console.log(`DB host: ${currentDbHost()}`);
  const Q = await queriesModule;
  try {
    const pre = await cleanup();
    if (pre > 0) console.log(`(dọn ${pre} conversation ZZTEST sót từ lần trước)`);
    const s = await seed();

    // ── Dựng nhóm bằng service thật ──
    await sync(s.lopA.id);
    await sync(s.lopB.id);
    await sync(s.lopC.id);
    const convA = await convIdOf(s.lopA.id);
    const convB = await convIdOf(s.lopB.id);
    const convC = await convIdOf(s.lopC.id);

    // ph4: con nghỉ học → sync lại → leftAt được set (tiền đề TS-01.7).
    await db.enrollment.updateMany({
      where: { studentId: s.con6.id, classId: s.lopA.id },
      data: { status: "CANCELLED" },
    });
    await sync(s.lopA.id);
    const ph4Part = await db.conversationParticipant.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId: convA, userId: s.ph4.id } },
      select: { leftAt: true },
    });

    // LopC kết thúc → nhóm ARCHIVED, KHÔNG có tin nào (lastMessageAt null).
    await db.class.update({ where: { id: s.lopC.id }, data: { status: "COMPLETED" } });
    await sync(s.lopC.id);

    report(
      "TIỀN ĐỀ seed",
      ph4Part.leftAt !== null,
      `ph4.leftAt=${ph4Part.leftAt ? "đã set" : "NULL (sai)"} — convA/convB/convC dựng bằng syncConversationMembership`,
    );

    // ── Tin nhắn: xoá SYSTEM message do sync sinh, nạp đúng 35 tin kiểm soát được ──
    await db.message.deleteMany({ where: { conversationId: { in: [convA, convB, convC] } } });
    await db.message.createMany({
      data: Array.from({ length: 35 }, (_, i) => ({
        id: MSG_ID(i),
        conversationId: convA,
        senderId: i % 2 === 0 ? s.ph1.id : s.gv1.id,
        kind: "CHAT" as const,
        body: i === 34 ? SECRET_BODY : `${P}tin số ${i}`,
        createdAt: msgAt(i),
      })),
    });
    // Tin mới nhất bị GỠ (soft delete) — kiểm cả preview lẫn page.
    await db.message.update({
      where: { id: MSG_ID(34) },
      data: { deletedAt: new Date(), deletedById: s.gv1.id, deletedReason: "ZZTEST gỡ tin" },
    });
    await db.conversation.update({
      where: { id: convA },
      data: { lastMessageAt: msgAt(34) },
    });

    // convB: 1 tin (cũ hơn convA) — để ph2/gv3 có 2 dòng sắp xếp được.
    await db.message.create({
      data: { id: `${SLUG}-b-0`, conversationId: convB, senderId: s.gv2.id, kind: "CHAT", body: `${P}tin LopB`, createdAt: new Date(BASE_AT.getTime() - 60 * 60_000) },
    });
    await db.conversation.update({
      where: { id: convB },
      data: { lastMessageAt: new Date(BASE_AT.getTime() - 60 * 60_000) },
    });

    // DM gv1 ↔ ph1 (centerId = NULL — nếu ai lỡ dùng scopedDb thì dòng này BIẾN MẤT).
    const dm = await db.conversation.create({
      data: {
        type: "DM_TEACHER_PARENT",
        subjectType: "NONE",
        dmKey: `${SLUG}:${[s.gv1.id, s.ph1.id].sort().join(":")}`,
        centerId: null,
        status: "ACTIVE",
        title: `${P}DM gv1-ph1`,
        lastMessageAt: new Date(BASE_AT.getTime() - 10 * 60_000),
      },
    });
    await db.conversationParticipant.createMany({
      data: [
        { conversationId: dm.id, userId: s.gv1.id, role: "MEMBER", source: "MANUAL" },
        { conversationId: dm.id, userId: s.ph1.id, role: "MEMBER", source: "MANUAL" },
      ],
    });
    await db.message.create({
      data: { id: `${SLUG}-dm-0`, conversationId: dm.id, senderId: s.gv1.id, kind: "CHAT", body: `${P}tin riêng`, createdAt: new Date(BASE_AT.getTime() - 10 * 60_000) },
    });

    // Badge chưa đọc của ph1 ở convA.
    await db.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: convA, userId: s.ph1.id } },
      data: { unreadCount: 7 },
    });

    // ═════════════ TS-01 · Cách ly đọc ═════════════
    const listPh1 = await Q.listConversationsForUser(s.ph1.id);
    const idsPh1 = listPh1.map((c) => c.conversationId);
    report(
      "TS-01.1 ph1 → CHỈ LopA + DM của mình",
      idsPh1.length === 2 && idsPh1.includes(convA) && idsPh1.includes(dm.id) &&
        !idsPh1.includes(convB) && !idsPh1.includes(convC),
      `${idsPh1.length} hội thoại: LopA=${idsPh1.includes(convA)}, DM=${idsPh1.includes(dm.id)}, LopB=${idsPh1.includes(convB)} (phải false), LopC=${idsPh1.includes(convC)} (phải false)`,
    );

    let blocked = "";
    try {
      await Q.getMessagesPage(convB, s.ph1.id);
      blocked = "KHÔNG chặn (SAI)";
    } catch (e) {
      blocked = e instanceof Q.ChatQueryError ? e.code : `lỗi lạ: ${String(e)}`;
    }
    report("TS-01.2 ph1 đọc LopB bằng ID → NOT_PARTICIPANT", blocked === "NOT_PARTICIPANT", `mã lỗi = ${blocked}`);

    const idsPh2 = (await Q.listConversationsForUser(s.ph2.id)).map((c) => c.conversationId);
    report(
      "TS-01.3 ph2 (con ở 2 lớp / 2 cơ sở) → đúng LopA + LopB",
      idsPh2.length === 2 && idsPh2.includes(convA) && idsPh2.includes(convB),
      `${idsPh2.length} hội thoại: LopA=${idsPh2.includes(convA)}, LopB=${idsPh2.includes(convB)}`,
    );

    const listQl1 = await Q.listConversationsForUser(s.ql1.id);
    const idsQl1 = listQl1.map((c) => c.conversationId);
    let blockedQl = "";
    try {
      await Q.getMessagesPage(convB, s.ql1.id);
      blockedQl = "KHÔNG chặn (SAI)";
    } catch (e) {
      blockedQl = e instanceof Q.ChatQueryError ? e.code : `lỗi lạ: ${String(e)}`;
    }
    report(
      "TS-01.4 ql1 → LopA + LopC (cùng CS1), KHÔNG LopB; đọc LopB bị chặn",
      idsQl1.length === 2 && idsQl1.includes(convA) && idsQl1.includes(convC) &&
        !idsQl1.includes(convB) && blockedQl === "NOT_PARTICIPANT",
      `${idsQl1.length} hội thoại (LopA=${idsQl1.includes(convA)}, LopC=${idsQl1.includes(convC)}, LopB=${idsQl1.includes(convB)}), getMessages(LopB)=${blockedQl}`,
    );

    const idsGv3 = (await Q.listConversationsForUser(s.gv3.id)).map((c) => c.conversationId);
    report(
      "TS-01.5 gv3 dạy chéo 2 CƠ SỞ → thấy CẢ LopA + LopB (theo phân công, không theo centerId)",
      idsGv3.length === 2 && idsGv3.includes(convA) && idsGv3.includes(convB),
      `${idsGv3.length} hội thoại: LopA=${idsGv3.includes(convA)}, LopB=${idsGv3.includes(convB)}`,
    );

    let ph4Page = "";
    let ph4Since = "";
    try {
      await Q.getMessagesPage(convA, s.ph4.id);
      ph4Page = "KHÔNG chặn (SAI)";
    } catch (e) {
      ph4Page = e instanceof Q.ChatQueryError ? e.code : `lỗi lạ: ${String(e)}`;
    }
    try {
      await Q.fetchMessagesSince(convA, s.ph4.id, null);
      ph4Since = "KHÔNG chặn (SAI)";
    } catch (e) {
      ph4Since = e instanceof Q.ChatQueryError ? e.code : `lỗi lạ: ${String(e)}`;
    }
    const idsPh4 = (await Q.listConversationsForUser(s.ph4.id)).map((c) => c.conversationId);
    report(
      "TS-01.7 ph4 đã rời → chặn NGAY (không grace period) + biến khỏi danh sách",
      ph4Page === "NOT_PARTICIPANT" && ph4Since === "NOT_PARTICIPANT" && idsPh4.length === 0,
      `getMessagesPage=${ph4Page}, fetchMessagesSince=${ph4Since}, danh sách=${idsPh4.length} dòng`,
    );

    // ═════════════ US-08 · danh sách ═════════════
    const rowA = listPh1.find((c) => c.conversationId === convA);
    report(
      "US-08.2 sắp xếp + badge + preview + tên lớp",
      idsPh1[0] === convA && rowA?.unreadCount === 7 && rowA.displayName === `${P}LopA` &&
        rowA.lastMessage?.deleted === true && rowA.lastMessage.text === Q.DELETED_MESSAGE_TEXT,
      `thứ tự=[LopA, DM] (${idsPh1[0] === convA}), unread=${rowA?.unreadCount}, tên="${rowA?.displayName}", preview="${rowA?.lastMessage?.text}"`,
    );
    report(
      "US-12.3 preview KHÔNG lộ body tin đã gỡ",
      !JSON.stringify(listPh1).includes(SECRET_BODY),
      `JSON danh sách ${JSON.stringify(listPh1).includes(SECRET_BODY) ? "CÓ CHỨA body (SAI)" : "sạch"}`,
    );

    const rowC = listQl1.find((c) => c.conversationId === convC);
    report(
      "US-08.4 ARCHIVED vẫn trả + cờ + nhãn; hội thoại chưa có tin xếp CUỐI",
      rowC?.isArchived === true && rowC.statusLabel === "Đã lưu trữ" && rowC.lastMessageAt === null &&
        idsQl1[idsQl1.length - 1] === convC,
      `isArchived=${rowC?.isArchived}, nhãn="${rowC?.statusLabel}", lastMessageAt=${rowC?.lastMessageAt}, vị trí cuối=${idsQl1[idsQl1.length - 1] === convC}`,
    );

    // ═════════════ US-09 · phân trang cursor ═════════════
    const collected: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    let firstPageDeleted: { deleted: boolean; body: string } | null = null;
    for (;;) {
      const page: Awaited<ReturnType<typeof Q.getMessagesPage>> =
        await Q.getMessagesPage(convA, s.ph1.id, { cursor, limit: 10 });
      pages += 1;
      if (pages === 1) {
        const m0 = page.messages[0];
        firstPageDeleted = m0 ? { deleted: m0.deleted, body: m0.body } : null;
      }
      collected.push(...page.messages.map((m) => m.id));
      if (!page.hasMore) break;
      cursor = page.nextCursor;
      if (pages > 10) break; // chống lặp vô hạn nếu cursor hỏng
    }
    const expected = expectedDescIds();
    const dup = collected.length !== new Set(collected).size;
    report(
      "US-09.1 phân trang cursor 35 tin (3 tin trùng createdAt tới ms nằm ĐÚNG ranh giới trang)",
      collected.length === 35 && !dup && JSON.stringify(collected) === JSON.stringify(expected) && pages === 4,
      `${pages} trang, ${collected.length}/35 tin, trùng=${dup}, đúng thứ tự=${JSON.stringify(collected) === JSON.stringify(expected)}`,
    );
    report(
      "US-12.3 getMessagesPage: tin đã gỡ trả cờ + text thay thế, KHÔNG body",
      firstPageDeleted?.deleted === true && firstPageDeleted.body === Q.DELETED_MESSAGE_TEXT,
      `deleted=${firstPageDeleted?.deleted}, body="${firstPageDeleted?.body}"`,
    );

    // ═════════════ US-07 · reconcile ═════════════
    const since1 = await Q.fetchMessagesSince(convA, s.ph1.id, MSG_ID(0));
    const since2 = await Q.fetchMessagesSince(convA, s.ph1.id, since1.nextSinceMessageId);
    const asc = [...since1.messages, ...since2.messages].map((m) => m.id);
    const expectedAsc = Array.from({ length: 34 }, (_, k) => MSG_ID(k + 1));
    const deletedInSince = [...since1.messages, ...since2.messages].find((m) => m.id === MSG_ID(34));
    report(
      "US-07.2 fetchMessagesSince: đúng tin SAU mốc, tăng dần, phân trang khi > 30",
      since1.messages.length === 30 && since1.hasMore === true && since2.messages.length === 4 &&
        since2.hasMore === false && JSON.stringify(asc) === JSON.stringify(expectedAsc) &&
        new Set(asc).size === 34,
      `trang1=${since1.messages.length}(hasMore=${since1.hasMore}), trang2=${since2.messages.length}(hasMore=${since2.hasMore}), tổng ${asc.length}/34 đúng thứ tự=${JSON.stringify(asc) === JSON.stringify(expectedAsc)}`,
    );
    report(
      "US-12.3 reconcile cũng không lộ body tin đã gỡ",
      deletedInSince?.deleted === true && deletedInSince.body === Q.DELETED_MESSAGE_TEXT &&
        !JSON.stringify(since2).includes(SECRET_BODY),
      `tin m-34: deleted=${deletedInSince?.deleted}, body="${deletedInSince?.body}"`,
    );

    // ═════════════ US-07 AC5 · đánh dấu đã đọc ═════════════
    const read1 = await Q.markConversationRead(convA, s.ph1.id, MSG_ID(34));
    const after1 = await db.conversationParticipant.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId: convA, userId: s.ph1.id } },
      select: { unreadCount: true, lastReadMessageId: true, lastReadAt: true },
    });
    await Q.markConversationRead(convA, s.ph1.id, MSG_ID(34));
    const after2 = await db.conversationParticipant.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId: convA, userId: s.ph1.id } },
      select: { unreadCount: true, lastReadMessageId: true },
    });
    const partCount = await db.conversationParticipant.count({ where: { conversationId: convA } });
    report(
      "US-07.5 markConversationRead reset unread + idempotent",
      read1.unreadCount === 0 && after1.unreadCount === 0 && after1.lastReadMessageId === MSG_ID(34) &&
        after2.unreadCount === 0 && after2.lastReadMessageId === MSG_ID(34) && partCount === 6,
      `unread ${7}→${after1.unreadCount}, lastRead=${after1.lastReadMessageId}, gọi lần 2 vẫn ${after2.unreadCount}, participant convA=${partCount} (không nhân bản)`,
    );

    // ═════════════ TS-04.4 · BR-30 ═════════════
    const membersForPh = await Q.getConversationMembers(convA, s.ph1.id);
    const leaks = findContactLeaks(membersForPh);
    const rawJson = JSON.stringify(membersForPh);
    const rawLeak = ["0900008801", "0900008811", "0900008822", EMAIL("gv1"), EMAIL("ph2")].filter((x) => rawJson.includes(x));
    const ph1View = membersForPh.find((m) => m.userId === s.ph1.id);
    report(
      "TS-04.4a BR-30 — payload thành viên cho PH KHÔNG chứa SĐT/email của BẤT KỲ AI (duyệt sâu)",
      leaks.length === 0 && rawLeak.length === 0 && membersForPh.length === 5 &&
        !membersForPh.some((m) => m.userId === s.ph4.id),
      `${membersForPh.length} thành viên (ph4 đã rời: ${!membersForPh.some((m) => m.userId === s.ph4.id)}), rò rỉ duyệt sâu=${leaks.length}${leaks.length ? ` → ${leaks.join(" | ")}` : ""}, chuỗi thô lọt=${rawLeak.length}`,
    );
    report(
      "TS-04.4a' vẫn đủ dùng: nhãn 'PH của <tên học viên>' + tên hiển thị đã che SĐT trong tên",
      ph1View?.roleLabel === `PH của ${P}Con Anh (ph1), ${P}Con Bình (ph1)` &&
        membersForPh.find((m) => m.userId === s.ph2.id)?.displayName === `${P}PH Hai •••`,
      `ph1.roleLabel="${ph1View?.roleLabel}", ph2.displayName="${membersForPh.find((m) => m.userId === s.ph2.id)?.displayName}"`,
    );

    const membersForGv = await Q.getConversationMembers(convA, s.gv1.id);
    const gvSelf = membersForGv.find((m) => m.userId === s.gv1.id);
    const gvSeesPh1 = membersForGv.find((m) => m.userId === s.ph1.id);
    report(
      "TS-04.4b GV thấy ĐẦY ĐỦ liên hệ",
      gvSelf?.contact?.phone === "0900008801" && gvSeesPh1?.contact?.phone === "0900008821" &&
        gvSeesPh1.contact.email === EMAIL("ph1") && findContactLeaks(membersForGv).length > 0,
      `gv1.phone=${gvSelf?.contact?.phone}, ph1.phone=${gvSeesPh1?.contact?.phone}, ph1.email=${gvSeesPh1?.contact?.email}`,
    );

    let membersBlocked = "";
    try {
      await Q.getConversationMembers(convA, s.ph3.id);
      membersBlocked = "KHÔNG chặn (SAI)";
    } catch (e) {
      membersBlocked = e instanceof Q.ChatQueryError ? e.code : `lỗi lạ: ${String(e)}`;
    }
    report(
      "TS-04.4c người ngoài nhóm xin danh sách thành viên → NOT_PARTICIPANT",
      membersBlocked === "NOT_PARTICIPANT",
      `mã lỗi = ${membersBlocked}`,
    );
  } finally {
    await cleanup();
    const left = await db.class.count({ where: { name: { startsWith: P } } });
    report("CLEANUP", left === 0, `còn sót ${left} lớp ZZTEST`);
    await db.$disconnect();
  }
  console.log(pass ? "\n=> TẤT CẢ PASS" : "\n=> CÓ FAIL");
  process.exitCode = pass ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
