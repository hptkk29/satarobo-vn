import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// The 3 active positions seeded in FIX-2. Everything else with status=OPEN
// gets moved to CLOSED. JobPosting rows are NOT deleted; restorable from
// /admin/jobs by flipping status back to OPEN.
const KEEP_SLUGS = new Set<string>([
  "giao-vien-robotics",
  "tu-van-tuyen-sinh",
  "tro-ly-giao-hoc-vu",
]);

async function main() {
  const all = await db.jobPosting.findMany({
    select: { id: true, slug: true, title: true, status: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Total JobPosting: ${all.length}`);

  const toClose = all.filter((j) => j.status === "OPEN" && !KEEP_SLUGS.has(j.slug));
  console.log(`Closing ${toClose.length} legacy OPEN job(s):`);
  for (const job of toClose) {
    await db.jobPosting.update({
      where: { id: job.id },
      data: { status: "CLOSED" },
    });
    console.log(`  ✓ CLOSED  ${job.slug.padEnd(40)} ${job.title}`);
  }

  // Sanity: make sure the 3 keepers are OPEN
  for (const slug of KEEP_SLUGS) {
    const job = await db.jobPosting.findUnique({
      where: { slug },
      select: { id: true, slug: true, title: true, status: true },
    });
    if (!job) {
      console.log(`  ⚠️  MISSING  ${slug}`);
      continue;
    }
    if (job.status !== "OPEN") {
      await db.jobPosting.update({
        where: { id: job.id },
        data: { status: "OPEN" },
      });
      console.log(`  → OPENED  ${job.slug.padEnd(40)} ${job.title}`);
    } else {
      console.log(`  ✓ OPEN    ${job.slug.padEnd(40)} ${job.title}`);
    }
  }

  const finalOpen = await db.jobPosting.count({ where: { status: "OPEN" } });
  console.log(`\nFinal OPEN count: ${finalOpen}`);
}

main()
  .catch((err) => {
    console.error("[close-legacy-jobs] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
