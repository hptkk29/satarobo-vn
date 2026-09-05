/**
 * scripts/cham-cong-doi-soat.ts — L6 chấm công v3: đối soát Sheet ↔ hệ thống, bản CHẠY TAY
 * (cùng lõi `lib/cham-cong/reconcile.ts` với màn /cham-cong/doi-soat — một hiện thực, hai vỏ).
 *
 * CHẠY:
 *   pnpm tsx scripts/cham-cong-doi-soat.ts <file.xlsx> [--ky 2026-12]
 *
 * CHỈ ĐỌC. Mã thoát 1 khi có lệch → dùng được trong workflow đêm. Đọc `DIRECT_URL` (pooler
 * session) — đường transaction pooler ném 42P05 với prepared statement.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseWorkbook } from "../lib/cham-cong/sheet-parse";
import { reconcileGridWithDb } from "../lib/cham-cong/reconcile-db";
import { formatReconcileMarkdown } from "../lib/cham-cong/reconcile";

async function main() {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) {
    console.error("Cách dùng: pnpm tsx scripts/cham-cong-doi-soat.ts <file.xlsx> [--ky YYYY-MM]");
    process.exitCode = 2;
    return;
  }
  const kyIdx = rest.indexOf("--ky");
  const ky = kyIdx >= 0 ? rest[kyIdx + 1] : null;
  const parsed = parseWorkbook(readFileSync(file));
  const grids = ky ? parsed.months.filter((m) => m.periodKey === ky) : parsed.months;
  if (grids.length === 0) {
    console.error(`File không có tab LỊCH cho kỳ ${ky ?? "(bất kỳ)"}`);
    process.exitCode = 2;
    return;
  }
  const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
  try {
    let drift = 0;
    for (const grid of grids) {
      const rep = await reconcileGridWithDb({ db, grid });
      console.log("\n" + formatReconcileMarkdown(rep) + "\n");
      drift += rep.cellDiffs.length + rep.totalDiffs.length + rep.unmapped.length;
    }
    if (drift > 0) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error("❌", e);
  process.exitCode = 1;
});
