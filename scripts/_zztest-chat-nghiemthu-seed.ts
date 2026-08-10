/**
 * ZZTEST — seed dữ liệu NGHIỆM THU [TAY] của module chat, chạy trên DB dev
 * (= DB mà test.satarobo.vn dùng).
 *
 *   pnpm exec tsx scripts/_zztest-chat-nghiemthu-seed.ts           # seed
 *   pnpm exec tsx scripts/_zztest-chat-nghiemthu-seed.ts cleanup   # dọn sạch
 *
 * Dựng đúng dàn vai mà TestScenarios yêu cầu:
 *   ADMIN (SUPER_ADMIN) · GV1 (TEACHER, dạy cả 2 lớp) · PH1 + PH2 (LopA) · PH3 (LopB)
 * rồi gọi `syncConversationMembership` để nhóm lớp sinh ra đúng đường nghiệp vụ thật.
 *
 * ⚠️ Dùng CENTER CÓ SẴN (không tạo cơ sở mới): `UserOrgRole` cần `OrgUnit` của cơ sở
 * để RBAC v2 có hiệu lực, mà cơ sở tự tạo thì không có OrgUnit nào trỏ tới.
 * Hệ quả chấp nhận: QLCS/giáo vụ THẬT của cơ sở đó cũng vào nhóm ZZTEST (đúng luật
 * sync) — `cleanup` xoá sạch hội thoại nên không để lại rác.
 *
 * ⚠️ `accountStatus` PHẢI là ACTIVE, nếu không `authorize()` từ chối im lặng
 * (lib/auth.ts — chặn tường minh PENDING_ACTIVATION/DISABLED).
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { syncConversationMembership } from "../lib/chat/sync-membership";

// `scopedDb`/sync bám singleton `@/lib/db` (đọc DATABASE_URL lúc khởi tạo) — ép
// DIRECT_URL (session pooler) trước mọi import động, y hệt _zztest-chat-us03.ts.
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;

const db = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

export const P = "ZZTEST_CHAT_NT";
const SLUG = "zztest-chat-nt";
export const PASSWORD = "ZZtest!ChatNT#2026";
const EMAIL = (x: string) => `${SLUG}-${x}@zztest.local`;

const ACCOUNTS = {
  admin: { email: EMAIL("admin"), name: `${P} Admin`, phone: "84900000801", role: "SUPER_ADMIN" },
  gv: { email: EMAIL("gv"), name: `${P} GV`, phone: "84900000802", role: "TEACHER" },
  ph1: { email: EMAIL("ph1"), name: `${P} PH Một`, phone: "84900000803", role: "PARENT" },
  ph2: { email: EMAIL("ph2"), name: `${P} PH Hai`, phone: "84900000804", role: "PARENT" },
  ph3: { email: EMAIL("ph3"), name: `${P} PH Ba`, phone: "84900000805", role: "PARENT" },
  // F5 — tư vấn viên được gán phụ trách HV1 (con của PH1).
  sale: { email: EMAIL("sale"), name: `${P} Sale`, phone: "84900000806", role: "SALES_CSM" },
} as const;

const TX_OPTS = { timeout: 30_000, maxWait: 10_000 } as const;

async function cleanup() {
  const users = await db.user.findMany({
    where: { email: { in: Object.values(ACCOUNTS).map((a) => a.email) } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const classes = await db.class.findMany({
    where: { name: { startsWith: P } },
    select: { id: true },
  });
  const classIds = classes.map((c) => c.id);
  const students = await db.student.findMany({
    where: { studentCode: { startsWith: P } },
    select: { id: true },
  });
  const studentIds = students.map((s) => s.id);
  const convs = await db.conversation.findMany({
    where: { OR: [{ subjectId: { in: classIds } }, { createdById: { in: userIds } }] },
    select: { id: true },
  });
  const convIds = convs.map((c) => c.id);

  const msgs = await db.message.findMany({
    where: { conversationId: { in: convIds } },
    select: { id: true },
  });
  const msgIds = msgs.map((m) => m.id);
  await db.announcementRead.deleteMany({ where: { messageId: { in: msgIds } } });
  await db.messageAttachment.deleteMany({ where: { messageId: { in: msgIds } } });
  await db.message.deleteMany({ where: { conversationId: { in: convIds } } });
  await db.conversationMembershipDrift.deleteMany({
    where: { OR: [{ conversationId: { in: convIds } }, { classId: { in: classIds } }] },
  });
  await db.conversationParticipant.deleteMany({ where: { conversationId: { in: convIds } } });
  await db.conversation.deleteMany({ where: { id: { in: convIds } } });
  await db.enrollment.deleteMany({ where: { classId: { in: classIds } } });
  await db.class.deleteMany({ where: { id: { in: classIds } } });
  await db.student.deleteMany({ where: { id: { in: studentIds } } });
  await db.userOrgRole.deleteMany({ where: { userId: { in: userIds } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } }).catch(() => null);
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.course.deleteMany({ where: { slug: `${SLUG}-course` } });

  console.log(
    `CLEANUP xong: users=${userIds.length} classes=${classIds.length} students=${studentIds.length} convs=${convIds.length} messages=${msgIds.length}`,
  );
}

async function upsertUser(
  spec: { email: string; name: string; phone: string; role: string },
  hash: string,
  centerId: string | null,
) {
  return db.user.upsert({
    where: { email: spec.email },
    update: {
      password: hash,
      isActive: true,
      accountStatus: "ACTIVE",
      deletedAt: null,
      name: spec.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      role: spec.role as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      roles: [spec.role] as any,
      ...(centerId ? { centerId } : {}),
    },
    create: {
      email: spec.email,
      name: spec.name,
      phone: spec.phone,
      password: hash,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      role: spec.role as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      roles: [spec.role] as any,
      isActive: true,
      accountStatus: "ACTIVE",
      ...(centerId ? { centerId } : {}),
    },
    select: { id: true, email: true, name: true },
  });
}

async function seed() {
  const wantCenterId = process.argv[3];
  const center = await db.center.findFirst({
    where: wantCenterId ? { id: wantCenterId } : undefined,
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!center) throw new Error("Không có Center nào trong DB");

  const centerOrg = await db.orgUnit.findFirst({
    where: { centerId: center.id },
    select: { id: true },
  });
  const rootOrg = await db.orgUnit.findFirst({ where: { parentId: null }, select: { id: true } });
  const saRole = await db.roleDef.findUnique({ where: { code: "SUPER_ADMIN" }, select: { id: true } });
  const gvRole = await db.roleDef.findUnique({ where: { code: "TEACHER" }, select: { id: true } });
  const saleRole = await db.roleDef.findUnique({
    where: { code: "CENTER_SALES_CSM" },
    select: { id: true },
  });

  const hash = await bcrypt.hash(PASSWORD, 10);

  const admin = await upsertUser(ACCOUNTS.admin, hash, null);
  const gv = await upsertUser(ACCOUNTS.gv, hash, center.id);
  const ph1 = await upsertUser(ACCOUNTS.ph1, hash, null);
  const ph2 = await upsertUser(ACCOUNTS.ph2, hash, null);
  const ph3 = await upsertUser(ACCOUNTS.ph3, hash, null);
  const sale = await upsertUser(ACCOUNTS.sale, hash, center.id);

  // RBAC v2: cờ RBAC_V2_ENABLED có thể ON trên env `test` (prod đang ON) — thiếu
  // UserOrgRole thì `can()` v2 từ chối sạch và mọi thứ trông như "chat hỏng".
  if (rootOrg && saRole) {
    await db.userOrgRole.upsert({
      where: {
        userId_orgUnitId_roleId: { userId: admin.id, orgUnitId: rootOrg.id, roleId: saRole.id },
      },
      update: { status: "ACTIVE", effectiveTo: null },
      create: { userId: admin.id, orgUnitId: rootOrg.id, roleId: saRole.id, grantedById: admin.id },
    });
  }
  if (centerOrg && gvRole) {
    await db.userOrgRole.upsert({
      where: {
        userId_orgUnitId_roleId: { userId: gv.id, orgUnitId: centerOrg.id, roleId: gvRole.id },
      },
      update: { status: "ACTIVE", effectiveTo: null },
      create: { userId: gv.id, orgUnitId: centerOrg.id, roleId: gvRole.id, grantedById: admin.id },
    });
  }

  if (centerOrg && saleRole) {
    await db.userOrgRole.upsert({
      where: {
        userId_orgUnitId_roleId: { userId: sale.id, orgUnitId: centerOrg.id, roleId: saleRole.id },
      },
      update: { status: "ACTIVE", effectiveTo: null },
      create: { userId: sale.id, orgUnitId: centerOrg.id, roleId: saleRole.id, grantedById: admin.id },
    });
  }

  const course = await db.course.upsert({
    where: { slug: `${SLUG}-course` },
    update: {},
    create: { name: `${P} Course`, slug: `${SLUG}-course` },
    select: { id: true },
  });

  const lopA = await db.class.upsert({
    where: { classCode: `${P}-LOPA` },
    update: { teacherId: gv.id, status: "ACTIVE", centerId: center.id },
    create: {
      classCode: `${P}-LOPA`,
      name: `${P} LopA`,
      courseId: course.id,
      centerId: center.id,
      teacherId: gv.id,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  const lopB = await db.class.upsert({
    where: { classCode: `${P}-LOPB` },
    update: { teacherId: gv.id, status: "ACTIVE", centerId: center.id },
    create: {
      classCode: `${P}-LOPB`,
      name: `${P} LopB`,
      courseId: course.id,
      centerId: center.id,
      teacherId: gv.id,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  const students: Record<string, string> = {};
  const roster: Array<{ key: string; parentId: string; parentName: string; classId: string }> = [
    { key: "hv1", parentId: ph1.id, parentName: ACCOUNTS.ph1.name, classId: lopA.id },
    { key: "hv2", parentId: ph2.id, parentName: ACCOUNTS.ph2.name, classId: lopA.id },
    { key: "hv3", parentId: ph3.id, parentName: ACCOUNTS.ph3.name, classId: lopB.id },
  ];
  for (const r of roster) {
    const s = await db.student.upsert({
      where: { studentCode: `${P}-${r.key.toUpperCase()}` },
      update: { parentUserId: r.parentId, centerId: center.id, deletedAt: null },
      create: {
        studentCode: `${P}-${r.key.toUpperCase()}`,
        name: `${P} HV ${r.key.slice(-1)}`,
        parentName: r.parentName,
        parentPhone: "0900000800",
        parentUserId: r.parentId,
        centerId: center.id,
      },
      select: { id: true },
    });
    students[r.key] = s.id;
    const existing = await db.enrollment.findFirst({
      where: { studentId: s.id, classId: r.classId },
      select: { id: true },
    });
    if (existing) {
      await db.enrollment.update({
        where: { id: existing.id },
        // F5 — CHỈ gán sale cho HV1: cần cả ca "có phụ trách" lẫn ca "không phụ trách"
        // để nghiệm thu được cả hai chiều của luật.
        data: {
          status: "STUDYING",
          deletedAt: null,
          ...(r.key === "hv1" ? { saleId: sale.id } : {}),
        },
      });
    } else {
      await db.enrollment.create({
        data: {
          studentId: s.id,
          classId: r.classId,
          courseId: course.id,
          centerId: center.id,
          status: "STUDYING",
        },
      });
    }
  }

  // Nhóm lớp sinh ra đúng đường nghiệp vụ thật (không tự INSERT Conversation).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.$transaction(async (tx) => syncConversationMembership(tx as any, lopA.id), TX_OPTS);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.$transaction(async (tx) => syncConversationMembership(tx as any, lopB.id), TX_OPTS);

  const convA = await db.conversation.findUnique({
    where: {
      type_subjectType_subjectId: { type: "CLASS_GROUP", subjectType: "CLASS", subjectId: lopA.id },
    },
    select: { id: true, _count: { select: { participants: true } } },
  });
  const convB = await db.conversation.findUnique({
    where: {
      type_subjectType_subjectId: { type: "CLASS_GROUP", subjectType: "CLASS", subjectId: lopB.id },
    },
    select: { id: true, _count: { select: { participants: true } } },
  });

  const out = {
    dbHost: currentDbHost(),
    center: center.name,
    password: PASSWORD,
    users: {
      admin: { id: admin.id, email: ACCOUNTS.admin.email },
      gv: { id: gv.id, email: ACCOUNTS.gv.email },
      ph1: { id: ph1.id, email: ACCOUNTS.ph1.email },
      ph2: { id: ph2.id, email: ACCOUNTS.ph2.email },
      ph3: { id: ph3.id, email: ACCOUNTS.ph3.email },
      sale: { id: sale.id, email: ACCOUNTS.sale.email },
    },
    classes: { lopA: lopA.id, lopB: lopB.id },
    students,
    conversations: {
      lopA: { id: convA?.id ?? null, participants: convA?._count.participants ?? 0 },
      lopB: { id: convB?.id ?? null, participants: convB?._count.participants ?? 0 },
    },
  };
  console.log(JSON.stringify(out, null, 2));
}

(process.argv[2] === "cleanup" ? cleanup() : seed())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
