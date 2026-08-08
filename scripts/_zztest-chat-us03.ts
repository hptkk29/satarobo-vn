/**
 * ZZTEST — US-03 Chat Realtime: syncConversationMembership (thành viên dẫn xuất).
 *
 *   pnpm tsx scripts/_zztest-chat-us03.ts
 *
 * Kiểm trên DB dev (quy ước ZZTEST của repo — record prefix ZZTEST_CHAT_US03_,
 * cleanup try/finally, chạy lại được):
 *   SEED    — sync lần đầu lớp ACTIVE: tạo Conversation(CLASS_GROUP) + GV MODERATOR/
 *             CLASS_TEACHER + PH MEMBER/CLASS_STUDENT_PARENT (1 bản ghi cho PH 2 con)
 *             + QLCS MEMBER/CENTER_MANAGER; lần đầu KHÔNG rải SYSTEM message.
 *   AC6     — chạy sync 2 lần liên tiếp → 0 diff (số bản ghi, joinedAt, số message).
 *   TS-05.4 — rollback giả lập: tx chuyển lớp fail ở bước cuối → không sync nửa vời.
 *   TS-05   — chuyển lớp trong 1 tx: rời nhóm cũ (leftAt) + vào nhóm mới + SYSTEM
 *             message ở CẢ HAI nhóm.
 *   TS-06   — PH 2 con cùng lớp: 1 con nghỉ → Ở LẠI; con cuối nghỉ → leftAt; suốt
 *             quá trình đúng 1 bản ghi participant. RE-JOIN: con học lại → leftAt=null
 *             trên bản ghi CŨ, joinedAt KHÔNG đổi (AC6).
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { Prisma, PrismaClient } from "@prisma/client";
import { syncConversationMembership } from "../lib/chat/sync-membership";

// Script chạy ngoài Next: đi session pooler (DIRECT_URL) nếu có — tránh lỗi pgbouncer
// "prepared statement does not exist" của transaction pooler khi chạy nhiều query.
const db = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const P = "ZZTEST_CHAT_US03_";
const SLUG = "zztest-chat-us03";
const EMAIL = (x: string) => `${SLUG}-${x}@example.com`;

let pass = true;
function report(label: string, ok: boolean, detail: string) {
  pass = pass && ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}

type Tx = Prisma.TransactionClient;

/** Xoá mọi record ZZTEST của script này (kể cả rác lần chạy trước) — idempotent. */
async function cleanup(): Promise<number> {
  const classes = await db.class.findMany({
    where: { name: { startsWith: P } },
    select: { id: true },
  });
  const classIds = classes.map((c) => c.id);
  const convs = classIds.length
    ? await db.conversation.findMany({
        where: { type: "CLASS_GROUP", subjectType: "CLASS", subjectId: { in: classIds } },
        select: { id: true },
      })
    : [];
  const convIds = convs.map((c) => c.id);
  if (convIds.length > 0) {
    await db.message.deleteMany({ where: { conversationId: { in: convIds } } });
    await db.conversationParticipant.deleteMany({
      where: { conversationId: { in: convIds } },
    });
    await db.conversation.deleteMany({ where: { id: { in: convIds } } });
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
  if (studentIds.length > 0) {
    await db.student.deleteMany({ where: { id: { in: studentIds } } });
  }
  if (classIds.length > 0) {
    await db.class.deleteMany({ where: { id: { in: classIds } } });
  }
  await db.user.deleteMany({ where: { email: { startsWith: `${SLUG}-` } } });
  await db.course.deleteMany({ where: { slug: `${SLUG}-course` } });
  await db.center.deleteMany({ where: { slug: `${SLUG}-center` } });
  return convIds.length;
}

async function seed() {
  const center = await db.center.create({
    data: { name: `${P}Center`, slug: `${SLUG}-center`, address: "ZZTEST", city: "" },
  });
  const course = await db.course.create({
    data: { name: `${P}Course`, slug: `${SLUG}-course` },
  });
  // Tạo tuần tự (không Promise.all) — pooler Supabase hay lỗi prepared-statement
  // khi bắn song song từ script ngoài Next.
  const gv1 = await db.user.create({
    data: { email: EMAIL("gv1"), name: `${P}GV Một`, role: "TEACHER", roles: ["TEACHER"], centerId: center.id },
  });
  const ph1 = await db.user.create({
    data: { email: EMAIL("ph1"), name: `${P}PH Một`, role: "PARENT", roles: ["PARENT"], centerId: center.id },
  });
  const ph3 = await db.user.create({
    data: { email: EMAIL("ph3"), name: `${P}PH Ba`, role: "PARENT", roles: ["PARENT"], centerId: center.id },
  });
  const ql1 = await db.user.create({
    data: {
      email: EMAIL("ql1"),
      name: `${P}QLCS`,
      role: "CENTER_MANAGER",
      roles: ["CENTER_MANAGER"],
      centerId: center.id,
    },
  });
  const lopA = await db.class.create({
    data: { name: `${P}LopA`, courseId: course.id, centerId: center.id, teacherId: gv1.id, status: "ACTIVE" },
  });
  const lopB = await db.class.create({
    data: { name: `${P}LopB`, courseId: course.id, centerId: center.id, status: "ACTIVE" },
  });
  const c1 = await db.student.create({
    data: { name: `${P}Con 1 (ph1)`, parentUserId: ph1.id, centerId: center.id },
  });
  const c2 = await db.student.create({
    data: { name: `${P}Con 2 (ph1)`, parentUserId: ph1.id, centerId: center.id },
  });
  const c3 = await db.student.create({
    data: { name: `${P}Con 3 (ph3)`, parentUserId: ph3.id, centerId: center.id },
  });
  await db.enrollment.createMany({
    data: [
      { studentId: c1.id, classId: lopA.id, courseId: course.id, centerId: center.id, status: "STUDYING" },
      { studentId: c2.id, classId: lopA.id, courseId: course.id, centerId: center.id, status: "STUDYING" },
      { studentId: c3.id, classId: lopB.id, courseId: course.id, centerId: center.id, status: "STUDYING" },
    ],
  });
  return { center, course, gv1, ph1, ph3, ql1, lopA, lopB, c1, c2, c3 };
}

const sync = (classId: string) =>
  db.$transaction(async (tx) => syncConversationMembership(tx as Tx, classId));

async function convOf(classId: string) {
  return db.conversation.findUnique({
    where: {
      type_subjectType_subjectId: { type: "CLASS_GROUP", subjectType: "CLASS", subjectId: classId },
    },
    include: {
      participants: true,
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
}

async function main() {
  console.log(`DB host: ${currentDbHost()}`);
  try {
    const pre = await cleanup();
    if (pre > 0) console.log(`(dọn ${pre} conversation ZZTEST sót từ lần trước)`);
    const s = await seed();

    // ── SEED: sync lần đầu ──
    await sync(s.lopA.id);
    await sync(s.lopB.id);

    const convA1 = await convOf(s.lopA.id);
    const convB1 = await convOf(s.lopB.id);
    {
      const ps = convA1?.participants ?? [];
      const by = new Map(ps.map((p) => [p.userId, p]));
      const gv = by.get(s.gv1.id);
      const ph = by.get(s.ph1.id);
      const ql = by.get(s.ql1.id);
      const ok =
        !!convA1 &&
        convA1.status === "ACTIVE" &&
        convA1.centerId === s.center.id &&
        ps.length === 3 &&
        gv?.role === "MODERATOR" &&
        gv?.derivedFrom === "CLASS_TEACHER" &&
        ph?.role === "MEMBER" &&
        ph?.derivedFrom === "CLASS_STUDENT_PARENT" &&
        ph?.leftAt === null &&
        ql?.role === "MEMBER" &&
        ql?.derivedFrom === "CENTER_MANAGER" &&
        convA1.messages.length === 0;
      report(
        "SEED LopA",
        ok,
        `participants=${ps.length} (kỳ vọng 3: GV+PH(2 con→1 bản ghi)+QLCS), ` +
          `gv=${gv?.role}/${gv?.derivedFrom}, ph=${ph?.role}/${ph?.derivedFrom}, ` +
          `ql=${ql?.role}/${ql?.derivedFrom}, systemMsgLầnĐầu=${convA1?.messages.length}`,
      );
    }
    {
      const ps = convB1?.participants ?? [];
      const ok =
        !!convB1 && ps.some((p) => p.userId === s.ph3.id && p.leftAt === null) && ps.length === 2; // ph3 + QLCS (LopB không GV)
      report("SEED LopB", ok, `participants=${ps.length} (ph3 + QLCS), ph3 active=${ok}`);
    }

    // ── AC6: idempotent — chạy 2 lần nữa, không đổi gì ──
    const snapBefore = (convA1?.participants ?? [])
      .map((p) => `${p.userId}:${p.joinedAt.toISOString()}:${p.leftAt?.toISOString() ?? ""}`)
      .sort();
    await sync(s.lopA.id);
    await sync(s.lopA.id);
    const convA2 = await convOf(s.lopA.id);
    const snapAfter = (convA2?.participants ?? [])
      .map((p) => `${p.userId}:${p.joinedAt.toISOString()}:${p.leftAt?.toISOString() ?? ""}`)
      .sort();
    report(
      "AC6 idempotent (sync ×2)",
      JSON.stringify(snapBefore) === JSON.stringify(snapAfter) &&
        (convA2?.messages.length ?? -1) === 0,
      `participants không đổi (${snapAfter.length} bản ghi, joinedAt giữ nguyên), message=${convA2?.messages.length}`,
    );

    // ── TS-05.4: rollback giả lập — chuyển lớp fail ở bước cuối → không sync nửa vời ──
    const enrB = await db.enrollment.findFirst({
      where: { studentId: s.c3.id, classId: s.lopB.id },
      select: { id: true },
    });
    if (!enrB) throw new Error("Mất enrollment seed của c3@LopB");
    let rolledBack = false;
    try {
      await db.$transaction(async (txRaw) => {
        const tx = txRaw as Tx;
        await tx.enrollment.update({
          where: { id: enrB.id },
          data: { status: "TRANSFERRED", endedAt: new Date() },
        });
        await tx.enrollment.create({
          data: {
            studentId: s.c3.id, classId: s.lopA.id, courseId: s.course.id,
            centerId: s.center.id, status: "STUDYING",
          },
        });
        await syncConversationMembership(tx, s.lopB.id);
        await syncConversationMembership(tx, s.lopA.id);
        throw new Error("SIMULATED_FAILURE"); // bước sau cùng fail
      });
    } catch (e) {
      rolledBack = e instanceof Error && e.message === "SIMULATED_FAILURE";
      if (!rolledBack) throw e;
    }
    {
      const convA = await convOf(s.lopA.id);
      const convB = await convOf(s.lopB.id);
      const ph3InA = convA?.participants.some((p) => p.userId === s.ph3.id) ?? false;
      const ph3B = convB?.participants.find((p) => p.userId === s.ph3.id);
      const enrStill = await db.enrollment.findUnique({
        where: { id: enrB.id },
        select: { status: true },
      });
      report(
        "TS-05.4 rollback không sync nửa vời",
        rolledBack && !ph3InA && ph3B?.leftAt === null && enrStill?.status === "STUDYING" &&
          (convB?.messages.length ?? -1) === 0,
        `rollback=${rolledBack}, ph3 chưa vào LopA=${!ph3InA}, ph3 còn active LopB=${ph3B?.leftAt === null}, ` +
          `enrollment giữ STUDYING=${enrStill?.status}, LopB 0 SYSTEM msg=${convB?.messages.length}`,
      );
    }

    // ── TS-05: chuyển lớp thật trong 1 tx ──
    await db.$transaction(async (txRaw) => {
      const tx = txRaw as Tx;
      await tx.enrollment.update({
        where: { id: enrB.id },
        data: { status: "TRANSFERRED", endedAt: new Date() },
      });
      await tx.enrollment.create({
        data: {
          studentId: s.c3.id, classId: s.lopA.id, courseId: s.course.id,
          centerId: s.center.id, status: "STUDYING",
        },
      });
      await syncConversationMembership(tx, s.lopB.id);
      await syncConversationMembership(tx, s.lopA.id);
    });
    {
      const convA = await convOf(s.lopA.id);
      const convB = await convOf(s.lopB.id);
      const ph3A = convA?.participants.find((p) => p.userId === s.ph3.id);
      const ph3B = convB?.participants.find((p) => p.userId === s.ph3.id);
      const sysA = (convA?.messages ?? []).filter((m) => m.kind === "SYSTEM");
      const sysB = (convB?.messages ?? []).filter((m) => m.kind === "SYSTEM");
      report(
        "TS-05 chuyển lớp (rời cũ + vào mới + 2 SYSTEM msg)",
        ph3B?.leftAt !== null && ph3B !== undefined &&
          ph3A?.leftAt === null &&
          sysB.length === 1 && sysB[0]!.body.includes("rời nhóm") && sysB[0]!.senderId === null &&
          sysA.length === 1 && sysA[0]!.body.includes("tham gia nhóm") && sysA[0]!.senderId === null,
        `LopB: ph3.leftAt=${ph3B?.leftAt ? "set" : "null"}, sys="${sysB[0]?.body}" · ` +
          `LopA: ph3.leftAt=${ph3A?.leftAt === null ? "null(active)" : "set"}, sys="${sysA[0]?.body}"`,
      );
    }

    // ── TS-06: PH 2 con, 1 con nghỉ → ở lại; con cuối nghỉ → leftAt; luôn 1 bản ghi ──
    const withdraw = (studentId: string) =>
      db.$transaction(async (txRaw) => {
        const tx = txRaw as Tx;
        await tx.enrollment.updateMany({
          where: { studentId, classId: s.lopA.id, status: "STUDYING" },
          data: { status: "WITHDREW", endedAt: new Date() },
        });
        await syncConversationMembership(tx, s.lopA.id);
      });

    await withdraw(s.c1.id);
    const after1 = await convOf(s.lopA.id);
    const ph1Rows1 = (after1?.participants ?? []).filter((p) => p.userId === s.ph1.id);
    report(
      "TS-06.1 con thứ nhất nghỉ → PH Ở LẠI (còn con thứ hai)",
      ph1Rows1.length === 1 && ph1Rows1[0]!.leftAt === null,
      `ph1 rows=${ph1Rows1.length}, leftAt=${ph1Rows1[0]?.leftAt ? "set (SAI)" : "null (đúng)"}`,
    );

    await withdraw(s.c2.id);
    const after2 = await convOf(s.lopA.id);
    const ph1Rows2 = (after2?.participants ?? []).filter((p) => p.userId === s.ph1.id);
    const leaveMsg = (after2?.messages ?? []).filter(
      (m) => m.kind === "SYSTEM" && m.body.includes(`${P}PH Một`) && m.body.includes("rời nhóm"),
    );
    report(
      "TS-06.2 con cuối nghỉ → leftAt set, vẫn đúng 1 bản ghi + SYSTEM msg",
      ph1Rows2.length === 1 && ph1Rows2[0]!.leftAt !== null && leaveMsg.length === 1,
      `ph1 rows=${ph1Rows2.length}, leftAt=${ph1Rows2[0]?.leftAt ? "set" : "null"}, msgRời=${leaveMsg.length}`,
    );

    // ── AC6 RE-JOIN: con 1 học lại → mở lại bản ghi CŨ, joinedAt không đổi ──
    const oldRow = ph1Rows2[0]!;
    // Giả lập "con quay lại lớp" ở mức dữ liệu: mở lại ghi danh cũ (unique partial
    // (studentId, classId) không cho tạo bản ghi thứ hai khi bản cũ chưa xoá mềm).
    await db.$transaction(async (txRaw) => {
      const tx = txRaw as Tx;
      await tx.enrollment.updateMany({
        where: { studentId: s.c1.id, classId: s.lopA.id },
        data: { status: "STUDYING", endedAt: null },
      });
      await syncConversationMembership(tx, s.lopA.id);
    });
    const after3 = await convOf(s.lopA.id);
    const ph1Rows3 = (after3?.participants ?? []).filter((p) => p.userId === s.ph1.id);
    report(
      "AC6 RE-JOIN: leftAt=null trên bản ghi CŨ, joinedAt giữ nguyên, không tạo trùng",
      ph1Rows3.length === 1 &&
        ph1Rows3[0]!.id === oldRow.id &&
        ph1Rows3[0]!.leftAt === null &&
        ph1Rows3[0]!.joinedAt.getTime() === oldRow.joinedAt.getTime(),
      `rows=${ph1Rows3.length}, sameId=${ph1Rows3[0]?.id === oldRow.id}, ` +
        `joinedAt ${ph1Rows3[0]?.joinedAt.toISOString()} == ${oldRow.joinedAt.toISOString()}`,
    );
  } finally {
    const n = await cleanup();
    const left = await db.class.count({ where: { name: { startsWith: P } } });
    report("CLEANUP", left === 0, `đã dọn (${n} conversation), còn sót ${left} lớp ZZTEST`);
    await db.$disconnect();
  }
  console.log(pass ? "\n=> TẤT CẢ PASS" : "\n=> CÓ FAIL");
  process.exitCode = pass ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
