/**
 * Chụp nhãn buổi TRƯỚC và SAU bản vá "lệch tên bài" — để Đào tạo xác nhận.
 *
 * ⚠️ CHỈ ĐỌC. Không `create`/`update`/`delete`, không `$executeRaw`.
 *
 * TRƯỚC = thứ tự ưu tiên cũ: hạng-theo-ngày thắng (`sessionNumber` → `Lesson.order`).
 * SAU   = `deriveSessionLabel` hiện hành: số LỘ TRÌNH thắng (`plan.order + 1` → `Lesson.order`
 *         → hạng-theo-ngày).
 *
 * Chỉ in những buổi ĐỔI nhãn — buổi không đổi thì không có gì để xác nhận.
 *
 * CHẠY (chuỗi chỉ-đọc, cổng 5432 — KHÔNG dùng pooler 6543):
 *   PROD_READONLY_URL='postgresql://…:5432/postgres' pnpm exec tsx scripts/doi-chieu-nhan-truoc-sau.ts
 *
 * Không truyền mã lớp thì chạy 3 lớp mẫu Sata3/4/6 của đợt điều tra.
 */
import { PrismaClient } from "@prisma/client";
import { deriveSessionLabel } from "../lib/lms/session-project-name";
import { buildSessionNumberMap } from "../lib/lms/session-order";

const MAU_MAC_DINH = ["CS1.SATA3.26.001", "CS2.SATA4.26.001", "CS2.SATA6.26.001"];
const maLop = process.argv.slice(2).length ? process.argv.slice(2) : MAU_MAC_DINH;

const db = new PrismaClient({
  datasources: { db: { url: process.env.PROD_READONLY_URL ?? process.env.DATABASE_URL ?? "" } },
});

async function main() {
  const classes = await db.class.findMany({
    where: { classCode: { in: maLop }, deletedAt: null },
    select: { id: true, classCode: true, name: true },
  });
  if (classes.length === 0) {
    console.error(`Không thấy lớp nào trong: ${maLop.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  for (const cls of classes) {
    const buoi = await db.classSession.findMany({
      where: { classId: cls.id },
      orderBy: { date: "asc" },
      select: {
        id: true,
        classId: true,
        date: true,
        topic: true,
        status: true,
        plan: { select: { customTitle: true, order: true } },
        lesson: { select: { title: true, order: true, moduleCode: true } },
      },
    });
    const soLich = buildSessionNumberMap(
      buoi.map((s) => ({ id: s.id, classId: s.classId, date: s.date })),
    );

    const doi: string[] = [];
    for (const s of buoi) {
      const chung = {
        planTitle: s.plan?.customTitle ?? null,
        lessonTitle: s.lesson?.title ?? null,
        moduleCode: s.lesson?.moduleCode ?? null,
        topic: s.topic,
      };
      const n = soLich.get(s.id) ?? null;
      // TRƯỚC: hạng-theo-ngày thắng — mô phỏng bằng cách KHÔNG truyền planOrder và
      // cho lessonOrder = null, để `sessionNumber` là nguồn số duy nhất.
      const truoc = deriveSessionLabel({ ...chung, sessionNumber: n });
      // SAU: truyền đủ nguồn, hàm tự chọn theo thứ tự ưu tiên mới.
      const sau = deriveSessionLabel({
        ...chung,
        sessionNumber: n,
        planOrder: s.plan?.order ?? null,
        lessonOrder: s.lesson?.order ?? null,
      });
      if (truoc !== sau) {
        doi.push(
          `  ${s.date.toISOString().slice(0, 10)}  ${s.status.padEnd(10)}  ${truoc}\n` +
            `${" ".repeat(26)}→ ${sau}`,
        );
      }
    }

    console.log(`\n═══ ${cls.classCode ?? cls.name} — ${buoi.length} buổi, ${doi.length} buổi ĐỔI nhãn`);
    if (doi.length === 0) console.log("  (không buổi nào đổi)");
    else console.log(doi.join("\n"));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
