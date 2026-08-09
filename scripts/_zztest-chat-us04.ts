/**
 * ZZTEST — US-04 Chat Realtime: job đối soát thành viên đêm (TS-07, đủ 4 bước).
 *
 *   pnpm tsx scripts/_zztest-chat-us04.ts
 *
 * Kiểm trên DB dev (quy ước ZZTEST — prefix ZZTEST_CHAT_US04_, cleanup try/finally,
 * chạy lại được; trỏ DIRECT_URL + thao tác tuần tự — quirk pooler như US-03):
 *   TS-07.1 — REMOVE drift: xoá quan hệ học bằng SQL TRẦN (không qua sync) → chạy
 *             reconcile → leftAt được set + drift REMOVE đúng lớp/user, autoEnforced=true.
 *   TS-07.1b— idempotent: chạy lại NGAY → removeCount=0, không drift REMOVE trùng.
 *   TS-07.2 — ADD drift: thêm Enrollment bằng SQL TRẦN → CHỈ log ADD (autoEnforced=false),
 *             KHÔNG tự thêm participant.
 *   TS-07.3 — đêm sạch (sau khi gỡ nguồn drift) → run record removeCount=addCount=0.
 *   TS-07.4 — chạy lại lần nữa → vẫn 0/0, tổng số drift không tăng (không ghi trùng).
 *
 * Job gọi với onlyClassIds=[lớp ZZTEST] để không đụng conversation thật trên DB dev.
 * Vế [TAY] của TS-07 (3 đêm staging) nằm ngoài script này.
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { Prisma, PrismaClient } from "@prisma/client";
import { syncConversationMembership } from "../lib/chat/sync-membership";

// ⚠️ reconcile-membership import `@/lib/db` (singleton đọc DATABASE_URL lúc khởi tạo)
// — ép đi DIRECT_URL (session pooler) TRƯỚC rồi mới dynamic-import bên dưới, tránh
// lỗi prepared-statement của transaction pooler khi script bắn nhiều query.
// (Static import bị hoist chạy trước dòng gán env → phải dùng import() động.)
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
const reconcileModule = import("../lib/chat/reconcile-membership");

const db = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const P = "ZZTEST_CHAT_US04_";
const SLUG = "zztest-chat-us04";
const EMAIL = (x: string) => `${SLUG}-${x}@example.com`;

let pass = true;
function report(label: string, ok: boolean, detail: string) {
  pass = pass && ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}

type Tx = Prisma.TransactionClient;
const runIds: string[] = [];

/** Xoá mọi record ZZTEST của script này (kể cả rác lần chạy trước) — idempotent. */
async function cleanup(): Promise<void> {
  const classes = await db.class.findMany({
    where: { name: { startsWith: P } },
    select: { id: true },
  });
  const classIds = classes.map((c) => c.id);
  if (classIds.length > 0) {
    await db.conversationMembershipDrift.deleteMany({
      where: { classId: { in: classIds } },
    });
    const convs = await db.conversation.findMany({
      where: { type: "CLASS_GROUP", subjectType: "CLASS", subjectId: { in: classIds } },
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
  // Run record của các lần reconcile do script này gọi (global, không có marker riêng).
  if (runIds.length > 0) {
    await db.conversationReconcileRun.deleteMany({ where: { id: { in: runIds } } });
    runIds.length = 0;
  }
}

async function seed() {
  const center = await db.center.create({
    data: { name: `${P}Center`, slug: `${SLUG}-center`, address: "ZZTEST", city: "" },
  });
  const course = await db.course.create({
    data: { name: `${P}Course`, slug: `${SLUG}-course` },
  });
  // Tuần tự — pooler Supabase hay lỗi prepared-statement khi bắn song song.
  const gv1 = await db.user.create({
    data: { email: EMAIL("gv1"), name: `${P}GV`, role: "TEACHER", roles: ["TEACHER"], centerId: center.id },
  });
  const ph3 = await db.user.create({
    data: { email: EMAIL("ph3"), name: `${P}PH Ba`, role: "PARENT", roles: ["PARENT"], centerId: center.id },
  });
  const ph4 = await db.user.create({
    data: { email: EMAIL("ph4"), name: `${P}PH Bốn`, role: "PARENT", roles: ["PARENT"], centerId: center.id },
  });
  const lopA = await db.class.create({
    data: { name: `${P}LopA`, courseId: course.id, centerId: center.id, teacherId: gv1.id, status: "ACTIVE" },
  });
  const c3 = await db.student.create({
    data: { name: `${P}Con 3 (ph3)`, parentUserId: ph3.id, centerId: center.id },
  });
  const c4 = await db.student.create({
    data: { name: `${P}Con 4 (ph4)`, parentUserId: ph4.id, centerId: center.id },
  });
  await db.enrollment.create({
    data: { studentId: c3.id, classId: lopA.id, courseId: course.id, centerId: center.id, status: "STUDYING" },
  });
  return { center, course, gv1, ph3, ph4, lopA, c3, c4 };
}

async function main() {
  console.log(`DB host: ${currentDbHost()}`);
  try {
    await cleanup(); // dọn rác lần chạy trước (nếu có)
    const s = await seed();

    // Baseline: sync US-03 dựng nhóm + participant đúng (gv1 + ph3 + QLCS nếu có).
    await db.$transaction(async (tx) => syncConversationMembership(tx as Tx, s.lopA.id), {
      timeout: 30_000,
      maxWait: 10_000,
    });
    const conv = await db.conversation.findUnique({
      where: {
        type_subjectType_subjectId: {
          type: "CLASS_GROUP", subjectType: "CLASS", subjectId: s.lopA.id,
        },
      },
      select: { id: true },
    });
    if (!conv) throw new Error("Baseline sync không tạo được conversation");
    const participantOf = (userId: string) =>
      db.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId: conv.id, userId } },
      });
    const driftRows = () =>
      db.conversationMembershipDrift.findMany({
        where: { classId: s.lopA.id },
        orderBy: { createdAt: "asc" },
      });
    const { reconcileConversationMembership } = await reconcileModule;
    const run = async () => {
      const r = await reconcileConversationMembership({ onlyClassIds: [s.lopA.id] });
      runIds.push(r.runId);
      return r;
    };

    // ── TS-07.1: REMOVE drift — xoá quan hệ học bằng SQL TRẦN, không qua sync ──
    await db.$executeRaw`DELETE FROM "Enrollment" WHERE "studentId" = ${s.c3.id} AND "classId" = ${s.lopA.id}`;
    const before = await participantOf(s.ph3.id);
    const r1 = await run();
    const after = await participantOf(s.ph3.id);
    const d1 = await driftRows();
    const removeRow = d1.find((x) => x.driftType === "REMOVE");
    report(
      "TS-07.1 REMOVE tự thi hành (leftAt + drift log cùng tx)",
      before?.leftAt === null &&
        after?.leftAt !== null &&
        r1.removeCount === 1 &&
        r1.addCount === 0 &&
        d1.length === 1 &&
        removeRow?.userId === s.ph3.id &&
        removeRow?.classId === s.lopA.id &&
        removeRow?.conversationId === conv.id &&
        removeRow?.autoEnforced === true &&
        removeRow?.centerId === s.center.id &&
        (removeRow?.detail ?? "").length > 0,
      `leftAt trước=null→sau=${after?.leftAt ? "set" : "null(SAI)"}, run remove=${r1.removeCount}/add=${r1.addCount}, ` +
        `drift REMOVE lớp/user đúng=${removeRow?.userId === s.ph3.id && removeRow?.classId === s.lopA.id}, ` +
        `autoEnforced=${removeRow?.autoEnforced}, centerId=${removeRow?.centerId === s.center.id ? "ghi kép OK" : "THIẾU"}`,
    );

    // ── TS-07.1b: idempotent — chạy lại NGAY, leftAt đã set là no-op ──
    const r1b = await run();
    const d1b = await driftRows();
    report(
      "TS-07.1b idempotent (rerun sau REMOVE → 0/0, không drift trùng)",
      r1b.removeCount === 0 && r1b.addCount === 0 && d1b.length === d1.length,
      `run remove=${r1b.removeCount}/add=${r1b.addCount}, drift ${d1.length}→${d1b.length}`,
    );

    // ── TS-07.2: ADD drift — thêm Enrollment bằng SQL TRẦN → CHỈ log, không tự thêm ──
    await db.$executeRaw`
      INSERT INTO "Enrollment" ("id","studentId","classId","courseId","status","centerId","updatedAt")
      VALUES (${`${SLUG}-enr-add`}, ${s.c4.id}, ${s.lopA.id}, ${s.course.id},
              'STUDYING'::"EnrollmentStatus", ${s.center.id}, now())`;
    const r2 = await run();
    const d2 = await driftRows();
    const addRow = d2.find((x) => x.driftType === "ADD");
    const ph4Participant = await participantOf(s.ph4.id);
    report(
      "TS-07.2 ADD chỉ log, KHÔNG tự thêm participant",
      r2.addCount === 1 &&
        r2.removeCount === 0 &&
        addRow?.userId === s.ph4.id &&
        addRow?.classId === s.lopA.id &&
        addRow?.autoEnforced === false &&
        ph4Participant === null,
      `run add=${r2.addCount}/remove=${r2.removeCount}, drift ADD user=${addRow?.userId === s.ph4.id ? "ph4" : addRow?.userId}, ` +
        `autoEnforced=${addRow?.autoEnforced}, participant ph4=${ph4Participant === null ? "KHÔNG tạo (đúng)" : "ĐÃ TẠO (SAI)"}`,
    );

    // ── TS-07.3: đêm sạch — gỡ nguồn drift ADD rồi chạy → run record 0/0 ──
    await db.$executeRaw`DELETE FROM "Enrollment" WHERE "id" = ${`${SLUG}-enr-add`}`;
    const r3 = await run();
    const run3 = await db.conversationReconcileRun.findUnique({ where: { id: r3.runId } });
    report(
      "TS-07.3 đêm sạch → run record removeCount=addCount=0 (khác 'job không chạy')",
      run3 !== null &&
        run3.removeCount === 0 &&
        run3.addCount === 0 &&
        run3.classesChecked === 1,
      `run record tồn tại=${run3 !== null}, remove=${run3?.removeCount}, add=${run3?.addCount}, classesChecked=${run3?.classesChecked}`,
    );

    // ── TS-07.4: chạy lại lần nữa — không ghi drift trùng, vẫn 0/0 ──
    const dBefore4 = await driftRows();
    const r4 = await run();
    const dAfter4 = await driftRows();
    report(
      "TS-07.4 rerun → không drift trùng (idempotent)",
      r4.removeCount === 0 && r4.addCount === 0 && dAfter4.length === dBefore4.length,
      `run remove=${r4.removeCount}/add=${r4.addCount}, tổng drift ${dBefore4.length}→${dAfter4.length}`,
    );

    // Mỗi lần chạy đều để lại run record riêng (4+1 lần = 5 run).
    const runCount = await db.conversationReconcileRun.count({
      where: { id: { in: runIds } },
    });
    report("Run record — mỗi lần chạy 1 dòng", runCount === 5, `${runCount}/5 run record`);
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
