/**
 * ZZTEST — verify DB cho nghiệm thu từ xa Đợt 0 (chạy sau mỗi thao tác UI trên
 * test.satarobo.vn). Chỉ ĐỌC. Argument: bước cần kiểm (default: all).
 */
import "./_load-env";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const P = "ZZTEST_CHAT_DOT0";

async function main() {
  const classes = await db.class.findMany({
    where: { name: { startsWith: P } },
    select: { id: true, name: true, status: true, centerId: true, teacherId: true },
  });
  console.log(`CLASSES: ${classes.length}`);
  for (const c of classes) console.log(`  ${c.name} · status=${c.status} · id=${c.id}`);

  const convs = await db.conversation.findMany({
    where: { subjectId: { in: classes.map((c) => c.id) } },
    select: {
      id: true, type: true, status: true, centerId: true, orgUnitId: true, subjectId: true,
      participants: {
        select: { userId: true, role: true, source: true, derivedFrom: true, leftAt: true, joinedAt: true },
      },
      messages: { select: { kind: true, body: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });
  console.log(`CONVERSATIONS: ${convs.length}`);
  const users = await db.user.findMany({
    where: { name: { startsWith: P } },
    select: { id: true, name: true },
  });
  const uname = (id: string) => users.find((u) => u.id === id)?.name ?? id.slice(0, 10);
  for (const cv of convs) {
    const cls = classes.find((c) => c.id === cv.subjectId);
    console.log(`  conv cho [${cls?.name}] · type=${cv.type} · status=${cv.status} · centerId=${cv.centerId ? "SET" : "NULL"} · orgUnitId=${cv.orgUnitId ? "SET" : "NULL"}`);
    for (const p of cv.participants) {
      console.log(`    - ${uname(p.userId)} · ${p.role}/${p.derivedFrom} · source=${p.source} · leftAt=${p.leftAt ? "SET" : "null"}`);
    }
    for (const m of cv.messages) console.log(`    MSG[${m.kind}] ${m.body}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
