/**
 * ZZTEST — seed dữ liệu NGHIỆM THU ĐỢT 0 trên DB dev (= DB của test.satarobo.vn).
 *
 *   pnpm exec tsx scripts/_zztest-chat-dot0-seed.ts          # seed
 *   pnpm exec tsx scripts/_zztest-chat-dot0-seed.ts cleanup  # dọn sạch
 *
 * Tạo: 1 admin SUPER_ADMIN (v1 + UserOrgRole v2 @ ROOT), 1 GV, 1 PH + 2 học viên
 * (center = center thật ĐẦU TIÊN trong DB — không tạo center mới để form lớp có
 * đủ dropdown thật). Mọi entity prefix ZZTEST_CHAT_DOT0. Không đụng dữ liệu khác.
 * Lớp KHÔNG seed ở đây — lớp phải tạo qua UI trên test.satarobo.vn (đó là thứ
 * đang nghiệm thu: server action deployed có gọi syncConversationMembership không).
 */
import "./_load-env";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const P = "ZZTEST_CHAT_DOT0";
const ADMIN_EMAIL = "zztest-chat-dot0-admin@zztest.local";
const GV_EMAIL = "zztest-chat-dot0-gv@zztest.local";
const PH_EMAIL = "zztest-chat-dot0-ph@zztest.local";
const PASSWORD = "ZZtest!ChatDot0#2026";

async function cleanup() {
  const users = await db.user.findMany({
    where: { email: { in: [ADMIN_EMAIL, GV_EMAIL, PH_EMAIL] } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const students = await db.student.findMany({
    where: { studentCode: { startsWith: P } },
    select: { id: true },
  });
  const studentIds = students.map((s) => s.id);
  const classes = await db.class.findMany({
    where: { name: { startsWith: P } },
    select: { id: true },
  });
  const classIds = classes.map((c) => c.id);
  const convs = await db.conversation.findMany({
    where: { OR: [{ subjectId: { in: classIds } }, { createdById: { in: userIds } }] },
    select: { id: true },
  });
  const convIds = convs.map((c) => c.id);

  await db.conversationMembershipDrift.deleteMany({ where: { classId: { in: classIds } } });
  await db.message.deleteMany({ where: { conversationId: { in: convIds } } });
  await db.conversationParticipant.deleteMany({ where: { conversationId: { in: convIds } } });
  await db.conversation.deleteMany({ where: { id: { in: convIds } } });
  await db.attendance.deleteMany({ where: { studentId: { in: studentIds } } });
  await db.enrollment.deleteMany({ where: { studentId: { in: studentIds } } });
  await db.classSession.deleteMany({ where: { classId: { in: classIds } } }).catch(() => null);
  await db.classSchedulePhase.deleteMany({ where: { classId: { in: classIds } } }).catch(() => null);
  await db.class.deleteMany({ where: { id: { in: classIds } } });
  await db.student.deleteMany({ where: { id: { in: studentIds } } });
  // Bản ghi lần chạy đối soát do nghiệm thu tay sinh ra — xoá để sổ vận hành
  // không có dòng giả (thiếu dòng 2 đêm liên tiếp là tín hiệu điều tra thật).
  const runs = await db.conversationReconcileRun.findMany({
    where: { ranAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } },
    select: { id: true },
  });
  await db.conversationReconcileRun.deleteMany({ where: { id: { in: runs.map((r) => r.id) } } });
  await db.userOrgRole.deleteMany({ where: { userId: { in: userIds } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } }).catch(() => null);
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  console.log(
    `CLEANUP xong: users=${userIds.length}, students=${studentIds.length}, classes=${classIds.length}, convs=${convIds.length}`,
  );
}

async function seed() {
  // Cơ sở của bộ seed — mặc định cơ sở đầu tiên; ép cơ sở khác bằng
  // `pnpm exec tsx scripts/_zztest-chat-dot0-seed.ts seed <centerId>` để khớp
  // cơ sở của lớp tạo qua UI (ghi danh chéo cơ sở bị scopedDb chặn).
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
  const hash = await bcrypt.hash(PASSWORD, 10);

  const admin = await db.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { password: hash, isActive: true, deletedAt: null },
    create: {
      email: ADMIN_EMAIL,
      name: `${P} Admin`,
      phone: "84900000701",
      password: hash,
      role: "SUPER_ADMIN",
      roles: ["SUPER_ADMIN"],
      isActive: true,
    },
    select: { id: true },
  });
  if (rootOrg && saRole) {
    await db.userOrgRole.upsert({
      where: {
        userId_orgUnitId_roleId: { userId: admin.id, orgUnitId: rootOrg.id, roleId: saRole.id },
      },
      update: { status: "ACTIVE", effectiveTo: null },
      create: { userId: admin.id, orgUnitId: rootOrg.id, roleId: saRole.id, grantedById: admin.id },
    });
  }

  const gv = await db.user.upsert({
    where: { email: GV_EMAIL },
    update: { isActive: true, deletedAt: null },
    create: {
      email: GV_EMAIL,
      name: `${P} GV`,
      phone: "84900000702",
      password: hash,
      role: "TEACHER",
      roles: ["TEACHER"],
      centerId: center.id,
      isActive: true,
    },
    select: { id: true },
  });
  if (centerOrg && gvRole) {
    await db.userOrgRole.upsert({
      where: {
        userId_orgUnitId_roleId: { userId: gv.id, orgUnitId: centerOrg.id, roleId: gvRole.id },
      },
      update: { status: "ACTIVE", effectiveTo: null },
      create: { userId: gv.id, orgUnitId: centerOrg.id, roleId: gvRole.id, grantedById: admin.id },
    });
  }

  const ph = await db.user.upsert({
    where: { email: PH_EMAIL },
    update: { isActive: true, deletedAt: null },
    create: {
      email: PH_EMAIL,
      name: `${P} PH`,
      phone: "84900000703",
      password: hash,
      role: "PARENT",
      roles: ["PARENT"],
      isActive: true,
    },
    select: { id: true },
  });

  for (const n of ["Mot", "Hai"]) {
    await db.student.upsert({
      where: { studentCode: `${P}-HV-${n}` },
      update: { parentUserId: ph.id, centerId: center.id, deletedAt: null },
      create: {
        studentCode: `${P}-HV-${n}`,
        name: `${P} HocVien ${n}`,
        parentName: `${P} PH`,
        parentPhone: "0900000703",
        parentUserId: ph.id,
        centerId: center.id,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        center: center.name,
        admin: ADMIN_EMAIL,
        gv: `${P} GV`,
        ph: PH_EMAIL,
        students: [`${P} HocVien Mot`, `${P} HocVien Hai`],
        note: "password chung cho 3 tài khoản — xem hằng PASSWORD trong script",
      },
      null,
      2,
    ),
  );
}

(process.argv[2] === "cleanup" ? cleanup() : seed())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
