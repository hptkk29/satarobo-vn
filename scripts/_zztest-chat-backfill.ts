/**
 * ZZTEST — Backfill nhóm lớp cho lớp ĐÃ ACTIVE + Giáo vụ vào nhóm như QLCS.
 *
 *   pnpm exec tsx scripts/_zztest-chat-backfill.ts
 *
 * Chạy trên DB dev THẬT (quy ước ZZTEST: prefix ZZTEST_CHAT_BF_, cleanup try/finally,
 * chạy lại được, ép DIRECT_URL + thao tác tuần tự như US-03/US-04). Gọi CHÍNH lõi
 * `backfillClassConversations` của scripts/backfill-nhom-lop-chat.ts — không chép logic.
 *
 *   ZZ1 DRY-RUN     — đếm đúng (ACTIVE / đã có nhóm / thiếu nhóm), preview liệt kê đúng
 *                     người, và KHÔNG ghi một dòng nào (lớp thiếu vẫn thiếu sau khi chạy).
 *   ZZ2 APPLY       — tạo nhóm cho lớp ACTIVE chưa có; participant đúng vai.
 *   ZZ3 GIÁO VỤ     — Giáo vụ (UserOrgRole/CENTER_CLASS_MANAGER, KHÔNG có role v1
 *                     CENTER_MANAGER) LÀ participant MEMBER/CENTER_MANAGER; vai khác cùng
 *                     OrgUnit (Sale) thì KHÔNG. Đây là vế DB của chốt 09/08 — gỡ
 *                     CENTER_CLASS_MANAGER khỏi CHAT_CENTER_MANAGER_ROLE_CODES là đỏ.
 *   ZZ4 KHÔNG SPAM  — 0 SYSTEM message sau backfill. Lớp ACTIVE lâu ngày mới tạo nhóm thì
 *                     MỌI thành viên đều "mới vào"; nếu sync rải "đã tham gia nhóm" thì
 *                     mỗi phụ huynh ăn N thông báo × 24 lớp ngay lúc mở tính năng.
 *   ZZ5 IDEMPOTENT  — chạy --apply lần 2: created=0, đúng 1 conversation, participant giữ
 *                     nguyên id + joinedAt, vẫn 0 message.
 *   ZZ6 KHÔNG ĐỤNG LỚP ĐÃ CÓ NHÓM — lớp đã có nhóm kèm participant "lệch" (DERIVED, không
 *                     còn trong tập dẫn xuất): backfill phải BỎ QUA, không set leftAt,
 *                     không ghi SYSTEM "đã rời nhóm". Đỏ ngay nếu ai gỡ điều kiện lọc
 *                     "chưa có nhóm" trong backfill (khi đó sync chạy lên lớp này và thi
 *                     hành phần REMOVE — một đợt gỡ người hàng loạt không ai duyệt).
 *   ZZ7 BR-01       — lớp PLANNED không được tạo nhóm.
 *   ZZ8 ĐỐI SOÁT    — job US-04 đếm `missingConversations` (lớp ACTIVE chưa có nhóm) và
 *                     KHÔNG tự tạo nhóm.
 *
 * CHẠY 2 LẦN — cả 2 lần PASS toàn bộ mới đạt (quy tắc dự án).
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { PrismaClient } from "@prisma/client";

// ⚠️ Ép DIRECT_URL (session pooler) TRƯỚC rồi mới dynamic-import module chạm
// `@/lib/db` (singleton đọc DATABASE_URL lúc khởi tạo) — transaction pooler 6543 lỗi
// prepared-statement khi script bắn nhiều query. Static import bị hoist chạy trước dòng
// gán env ⇒ bắt buộc import() động, y hệt _zztest-chat-us04.ts.
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
const backfillModule = import("./backfill-nhom-lop-chat");
const reconcileModule = import("../lib/chat/reconcile-membership");

const db = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const P = "ZZTEST_CHAT_BF_";
const SLUG = "zztest-chat-bf";
const EMAIL = (x: string) => `${SLUG}-${x}@example.com`;

let pass = true;
function report(label: string, ok: boolean, detail: string) {
  pass = pass && ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}

/** RoleDef do script TỰ tạo (DB dev thiếu) → xoá ở cleanup; role có sẵn thì không đụng. */
const createdRoleDefIds: string[] = [];
const runIds: string[] = [];

async function cleanup(): Promise<void> {
  const users = await db.user.findMany({
    where: { email: { startsWith: `${SLUG}-` } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await db.userOrgRole.deleteMany({ where: { userId: { in: userIds } } });
  }
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
  if (studentIds.length > 0) await db.student.deleteMany({ where: { id: { in: studentIds } } });
  if (classIds.length > 0) await db.class.deleteMany({ where: { id: { in: classIds } } });
  if (userIds.length > 0) await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.course.deleteMany({ where: { slug: `${SLUG}-course` } });
  await db.orgUnit.deleteMany({ where: { code: { startsWith: P } } });
  await db.center.deleteMany({ where: { slug: { startsWith: `${SLUG}-center` } } });
  if (createdRoleDefIds.length > 0) {
    await db.rolePermission.deleteMany({ where: { roleId: { in: createdRoleDefIds } } });
    await db.roleDef.deleteMany({ where: { id: { in: createdRoleDefIds } } });
    createdRoleDefIds.length = 0;
  }
  if (runIds.length > 0) {
    await db.conversationReconcileRun.deleteMany({ where: { id: { in: runIds } } });
    runIds.length = 0;
  }
}

/** RoleDef thật của DB dev nếu có; thiếu thì tạo tối thiểu và nhớ để xoá. */
async function ensureRoleDef(code: string, name: string): Promise<string> {
  const found = await db.roleDef.findUnique({ where: { code }, select: { id: true } });
  if (found) return found.id;
  const made = await db.roleDef.create({ data: { code, name }, select: { id: true } });
  createdRoleDefIds.push(made.id);
  return made.id;
}

async function seed() {
  const center = await db.center.create({
    data: { name: `${P}Center`, slug: `${SLUG}-center`, address: "ZZTEST", city: "" },
  });
  // OrgUnit type CENTER trỏ Center này — nhánh v2 của resolveCenterManagerUserIds tìm
  // UserOrgRole theo orgUnitId này.
  const orgUnit = await db.orgUnit.create({
    data: { type: "CENTER", code: `${P}CS`, name: `${P}CS`, centerId: center.id },
  });
  const course = await db.course.create({
    data: { name: `${P}Course`, slug: `${SLUG}-course` },
  });

  // Tuần tự — pooler Supabase hay lỗi prepared-statement khi bắn song song.
  const gv1 = await db.user.create({
    data: { email: EMAIL("gv1"), name: `${P}GV`, role: "TEACHER", roles: ["TEACHER"], centerId: center.id },
  });
  const ph1 = await db.user.create({
    data: { email: EMAIL("ph1"), name: `${P}PH Một`, role: "PARENT", roles: ["PARENT"], centerId: center.id },
  });
  const ph2 = await db.user.create({
    data: { email: EMAIL("ph2"), name: `${P}PH Hai`, role: "PARENT", roles: ["PARENT"], centerId: center.id },
  });
  const ql1 = await db.user.create({
    data: {
      email: EMAIL("ql1"), name: `${P}QLCS`, role: "CENTER_MANAGER",
      roles: ["CENTER_MANAGER"], centerId: center.id,
    },
  });
  // ⚠️ Giáo vụ CỐ Ý mang role v1 = SALES_CSM: nếu để CENTER_MANAGER thì nhánh v1
  // (User.roles[]) sẽ tự nhặt họ vào nhóm và ZZ3 xanh giả dù nhánh v2 chưa nhận Giáo vụ.
  const gvu1 = await db.user.create({
    data: {
      email: EMAIL("gvu1"), name: `${P}Giao Vu`, role: "SALES_CSM",
      roles: ["SALES_CSM"], centerId: center.id,
    },
  });
  // Đối chứng ÂM: cùng OrgUnit, cùng kiểu gán UserOrgRole, nhưng vai Sale → KHÔNG vào nhóm.
  const sale1 = await db.user.create({
    data: {
      email: EMAIL("sale1"), name: `${P}Sale`, role: "SALES_CSM",
      roles: ["SALES_CSM"], centerId: center.id,
    },
  });
  const stray = await db.user.create({
    data: { email: EMAIL("stray"), name: `${P}PH Lac`, role: "PARENT", roles: ["PARENT"], centerId: center.id },
  });

  const roleGiaoVu = await ensureRoleDef("CENTER_CLASS_MANAGER", "Quản lý lớp học");
  const roleSale = await ensureRoleDef("CENTER_SALES_CSM", "Tư vấn & CSKH cơ sở");
  await db.userOrgRole.create({
    data: {
      userId: gvu1.id, orgUnitId: orgUnit.id, roleId: roleGiaoVu,
      status: "ACTIVE", grantedById: ql1.id,
    },
  });
  await db.userOrgRole.create({
    data: {
      userId: sale1.id, orgUnitId: orgUnit.id, roleId: roleSale,
      status: "ACTIVE", grantedById: ql1.id,
    },
  });

  // lopA — ĐÃ ACTIVE, CHƯA có nhóm: đúng tình trạng 24 lớp trên DB dev trước backfill.
  const lopA = await db.class.create({
    data: { name: `${P}LopA`, courseId: course.id, centerId: center.id, teacherId: gv1.id, status: "ACTIVE" },
  });
  // lopB — ACTIVE và ĐÃ có nhóm (sync bên dưới) → backfill phải bỏ qua.
  const lopB = await db.class.create({
    data: { name: `${P}LopB`, courseId: course.id, centerId: center.id, teacherId: gv1.id, status: "ACTIVE" },
  });
  // lopC — PLANNED → BR-01: không được tạo nhóm.
  const lopC = await db.class.create({
    data: { name: `${P}LopC`, courseId: course.id, centerId: center.id, teacherId: gv1.id, status: "PLANNED" },
  });

  const c1 = await db.student.create({
    data: { name: `${P}Con 1 (ph1)`, parentUserId: ph1.id, centerId: center.id },
  });
  const c2 = await db.student.create({
    data: { name: `${P}Con 2 (ph2)`, parentUserId: ph2.id, centerId: center.id },
  });
  await db.enrollment.createMany({
    data: [
      { studentId: c1.id, classId: lopA.id, courseId: course.id, centerId: center.id, status: "STUDYING" },
      { studentId: c2.id, classId: lopA.id, courseId: course.id, centerId: center.id, status: "STUDYING" },
    ],
  });
  return { center, orgUnit, course, gv1, ph1, ph2, ql1, gvu1, sale1, stray, lopA, lopB, lopC };
}

async function convOf(classId: string) {
  return db.conversation.findUnique({
    where: {
      type_subjectType_subjectId: { type: "CLASS_GROUP", subjectType: "CLASS", subjectId: classId },
    },
    include: { participants: true, messages: true },
  });
}

async function main() {
  console.log(`DB host: ${currentDbHost()}`);
  const { backfillClassConversations } = await backfillModule;
  const { reconcileConversationMembership } = await reconcileModule;
  try {
    await cleanup(); // dọn rác lần chạy trước
    const s = await seed();
    const SCOPE = [s.lopA.id, s.lopB.id, s.lopC.id]; // không đụng lớp thật trên DB dev
    const quiet = () => undefined;

    // ── Dựng sẵn nhóm cho lopB + 1 participant "lệch" (DERIVED, không thuộc tập dẫn xuất)
    const bf0 = await backfillClassConversations({
      apply: true, classIds: [s.lopB.id], client: db, log: quiet,
    });
    const convB0 = await convOf(s.lopB.id);
    if (!convB0 || bf0.created !== 1) throw new Error("Không dựng được nhóm nền cho LopB");
    await db.conversationParticipant.create({
      data: {
        conversationId: convB0.id, userId: s.stray.id, role: "MEMBER",
        source: "DERIVED", derivedFrom: "CLASS_STUDENT_PARENT",
      },
    });

    // ── ZZ8a: đối soát TRƯỚC backfill — lopA thiếu nhóm phải hiện thành con số ──
    // ⚠️ Phạm vi CHỈ lopA: cho lopB vào đây thì job đối soát sẽ làm đúng việc của nó —
    // set `leftAt` cho participant lệch vừa cắm ở trên — và ZZ6 mất mẫu thử.
    const RC_SCOPE = [s.lopA.id];
    const rc1 = await reconcileConversationMembership({ onlyClassIds: RC_SCOPE });
    runIds.push(rc1.runId);
    const rcRow1 = await db.conversationReconcileRun.findUnique({ where: { id: rc1.runId } });
    const convANull = await convOf(s.lopA.id);
    report(
      "ZZ8a đối soát ĐẾM lớp ACTIVE thiếu nhóm, KHÔNG tự tạo",
      rc1.missingConversations === 1 &&
        rcRow1?.missingConversations === 1 &&
        convANull === null,
      `missingConversations=${rc1.missingConversations} (ghi DB=${rcRow1?.missingConversations}), ` +
        `job tạo nhóm hộ=${convANull === null ? "KHÔNG (đúng)" : "CÓ (SAI luật)"}`,
    );

    // ── ZZ1: DRY-RUN — đếm đúng, preview đúng người, KHÔNG ghi gì ──
    const dry = await backfillClassConversations({
      classIds: SCOPE, client: db, log: quiet,
    });
    const convAafterDry = await convOf(s.lopA.id);
    const prevA = dry.preview.find((p) => p.classId === s.lopA.id);
    const prevIds = new Set((prevA?.members ?? []).map((m) => m.userId));
    report(
      "ZZ1 DRY-RUN đếm đúng + KHÔNG ghi gì",
      dry.dryRun &&
        dry.totalActive === 2 && // lopA + lopB (lopC PLANNED không tính)
        dry.alreadyHad === 1 &&
        dry.missing === 1 &&
        dry.created === 0 &&
        convAafterDry === null &&
        prevA !== undefined &&
        prevA.members.length === 5 &&
        [s.gv1.id, s.ph1.id, s.ph2.id, s.ql1.id, s.gvu1.id].every((id) => prevIds.has(id)) &&
        !prevIds.has(s.sale1.id),
      `ACTIVE=${dry.totalActive}, đãCóNhóm=${dry.alreadyHad}, thiếu=${dry.missing}, tạo=${dry.created}, ` +
        `LopA vẫn chưa có nhóm=${convAafterDry === null}, preview=${prevA?.members.length} người ` +
        `(GV+2PH+QLCS+Giáo vụ), có Sale=${prevIds.has(s.sale1.id)}`,
    );

    // ── ZZ2 + ZZ3 + ZZ4: APPLY ──
    const applied = await backfillClassConversations({
      apply: true, classIds: SCOPE, client: db, log: quiet,
    });
    const convA = await convOf(s.lopA.id);
    const byUser = new Map((convA?.participants ?? []).map((p) => [p.userId, p]));
    const gvRow = byUser.get(s.gv1.id);
    const phRow = byUser.get(s.ph1.id);
    report(
      "ZZ2 APPLY tạo nhóm + participant đúng vai",
      applied.created === 1 &&
        applied.failed.length === 0 &&
        !!convA &&
        convA.status === "ACTIVE" &&
        convA.centerId === s.center.id &&
        convA.orgUnitId === s.orgUnit.id &&
        (convA.participants.length ?? 0) === 5 &&
        gvRow?.role === "MODERATOR" && gvRow?.derivedFrom === "CLASS_TEACHER" &&
        phRow?.role === "MEMBER" && phRow?.derivedFrom === "CLASS_STUDENT_PARENT",
      `tạo=${applied.created}, lỗi=${applied.failed.length}, participants=${convA?.participants.length}, ` +
        `gv=${gvRow?.role}/${gvRow?.derivedFrom}, ph=${phRow?.role}/${phRow?.derivedFrom}, ` +
        `ghi kép centerId+orgUnitId=${convA?.centerId === s.center.id && convA?.orgUnitId === s.orgUnit.id}`,
    );

    const gvuRow = byUser.get(s.gvu1.id);
    const qlRow = byUser.get(s.ql1.id);
    report(
      "ZZ3 GIÁO VỤ (v2 UserOrgRole/CENTER_CLASS_MANAGER) vào nhóm Y HỆT QLCS",
      gvuRow?.role === "MEMBER" &&
        gvuRow?.derivedFrom === "CENTER_MANAGER" &&
        gvuRow?.leftAt === null &&
        gvuRow?.role === qlRow?.role &&
        gvuRow?.derivedFrom === qlRow?.derivedFrom &&
        !byUser.has(s.sale1.id),
      `giáo vụ=${gvuRow ? `${gvuRow.role}/${gvuRow.derivedFrom}` : "KHÔNG CÓ (BUG)"} vs ` +
        `QLCS=${qlRow?.role}/${qlRow?.derivedFrom}, Sale cùng OrgUnit lọt vào=${byUser.has(s.sale1.id)}`,
    );

    const sysA = (convA?.messages ?? []).filter((m) => m.kind === "SYSTEM");
    report(
      "ZZ4 KHÔNG rải SYSTEM message hàng loạt khi tạo nhóm bù",
      (convA?.messages.length ?? -1) === 0 && sysA.length === 0,
      `message trong nhóm vừa tạo=${convA?.messages.length} (kỳ vọng 0 — 5 thành viên "mới vào" ` +
        `mà vẫn im lặng nhờ cờ isNewConversation)`,
    );

    // ── ZZ5: idempotent ──
    const snapBefore = (convA?.participants ?? [])
      .map((p) => `${p.id}:${p.joinedAt.toISOString()}:${p.leftAt?.toISOString() ?? ""}`)
      .sort();
    const again = await backfillClassConversations({
      apply: true, classIds: SCOPE, client: db, log: quiet,
    });
    const convA2 = await convOf(s.lopA.id);
    const snapAfter = (convA2?.participants ?? [])
      .map((p) => `${p.id}:${p.joinedAt.toISOString()}:${p.leftAt?.toISOString() ?? ""}`)
      .sort();
    const convCount = await db.conversation.count({
      where: { type: "CLASS_GROUP", subjectType: "CLASS", subjectId: s.lopA.id },
    });
    report(
      "ZZ5 IDEMPOTENT — chạy lại: 0 tạo mới, 1 nhóm, participant nguyên vẹn, 0 message",
      again.created === 0 &&
        again.missing === 0 &&
        again.alreadyHad === 2 &&
        convCount === 1 &&
        JSON.stringify(snapBefore) === JSON.stringify(snapAfter) &&
        (convA2?.messages.length ?? -1) === 0,
      `tạo lần 2=${again.created}, thiếu=${again.missing}, đãCóNhóm=${again.alreadyHad}, ` +
        `số conversation=${convCount}, participant giữ nguyên id+joinedAt=${
          JSON.stringify(snapBefore) === JSON.stringify(snapAfter)
        }, message=${convA2?.messages.length}`,
    );

    // ── ZZ6: lớp đã có nhóm KHÔNG bị đụng (bảo vệ điều kiện lọc "chưa có nhóm") ──
    const convB = await convOf(s.lopB.id);
    const strayRow = convB?.participants.find((p) => p.userId === s.stray.id);
    report(
      "ZZ6 KHÔNG đụng lớp đã có nhóm — participant lệch còn nguyên, 0 SYSTEM 'rời nhóm'",
      strayRow?.leftAt === null && (convB?.messages.length ?? -1) === 0,
      `participant lệch leftAt=${
        strayRow?.leftAt ? "SET (BUG: backfill đã chạy sync lên lớp đã có nhóm)" : "null (đúng)"
      }, message LopB=${convB?.messages.length}`,
    );

    // ── ZZ7: BR-01 — lớp PLANNED không có nhóm ──
    const convC = await convOf(s.lopC.id);
    report(
      "ZZ7 BR-01 lớp PLANNED không được tạo nhóm",
      convC === null,
      `LopC conversation=${convC === null ? "không có (đúng)" : "ĐÃ TẠO (SAI BR-01)"}`,
    );

    // ── ZZ8b: sau backfill, đối soát báo 0 lớp thiếu ──
    const rc2 = await reconcileConversationMembership({ onlyClassIds: RC_SCOPE });
    runIds.push(rc2.runId);
    report(
      "ZZ8b sau backfill → missingConversations về 0, nhóm mới không sinh drift",
      rc2.missingConversations === 0 &&
        rc2.classesChecked === 1 &&
        rc2.removeCount === 0 &&
        rc2.addCount === 0,
      `missingConversations=${rc2.missingConversations}, classesChecked=${rc2.classesChecked}, ` +
        `drift REMOVE=${rc2.removeCount}/ADD=${rc2.addCount}`,
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
