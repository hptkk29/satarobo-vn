/**
 * scripts/nen-p1-backfill-orgunit.ts — Nền Hệ thống P1 · US-07 AC1.
 *
 * Điền `orgUnitId` cho các dòng ĐANG THIẾU, trên cả 52 bảng (24 bảng US-07 vừa thêm cột +
 * 28 bảng PR-A đã có cột từ 15/06 nhưng backfill chỉ chạy một lần).
 *
 * CHẠY:
 *   pnpm tsx scripts/nen-p1-backfill-orgunit.ts            # DRY-RUN (mặc định, chỉ đếm)
 *   pnpm tsx scripts/nen-p1-backfill-orgunit.ts --apply    # ghi thật
 *
 * THỨ TỰ BẮT BUỘC trên DB đang có dữ liệu:
 *   1. `pnpm prisma migrate deploy`            (thêm cột)
 *   2. `scripts/nen-p1-reshape-org-tree.ts --apply`  (dời cây — để có đủ node đích)
 *   3. script này `--apply`
 *   4. `scripts/nen-p1-doi-soat-orgunit.ts`    (xác nhận 0 lệch, có mẫu số)
 *
 * AN TOÀN:
 *  · Mặc định KHÔNG ghi.
 *  · Idempotent: chỉ đụng `WHERE orgUnitId IS NULL` ⇒ chạy lại là 0 dòng (AC1).
 *  · KHÔNG bao giờ điền cho dòng `centerId IS NULL`. Ở nhiều bảng null có nghĩa
 *    ("toàn hệ thống" / "chưa đối khớp") — xem BACKFILL_SPECS. Đây là lý do dùng INNER
 *    JOIN chứ không LEFT JOIN.
 *  · KHÔNG đụng dữ liệu còn nằm ngoài hệ (sheet của Sale) — E5 pre-mortem, ngoài phạm vi.
 */
import { ALL_DRIFT_SPECS } from "../lib/org/drift-report";
import "./_load-env";
import { scriptDb } from "./_script-db";

const APPLY = process.argv.includes("--apply");
// scriptDb, KHÔNG phải `new PrismaClient()`: 52 truy vấn liên tiếp qua transaction pooler
// :6543 chết ở câu thứ 36 với `prepared statement "s36" does not exist` — ăn thật ở lần
// dry-run ĐẦU TIÊN trên DB dev (11/08). Xem scripts/_script-db.ts.
const db = scriptDb();

/**
 * Cùng công thức ánh xạ với migration và với script đối soát: hai nhánh, nhánh thứ hai là
 * cầu cho Center mồ côi (`Center("hoi-so")` code "HO" — không OrgUnit nào trỏ tới vì luật
 * V7 cấm đơn vị HO mang centerId).
 */
function sqlFor(model: string, applying: boolean): string {
  const t = `"${model}"`;
  const join = `
    FROM "Center" c
    JOIN "OrgUnit" ou
      ON ou."deletedAt" IS NULL
     AND (ou."centerId" = c."id"
          OR (ou."centerId" IS NULL AND c."code" IS NOT NULL AND ou."code" = c."code"))
    WHERE t."centerId" = c."id" AND t."orgUnitId" IS NULL`;
  return applying
    ? `UPDATE ${t} t SET "orgUnitId" = ou."id" ${join}`
    : `SELECT count(*)::int AS c FROM ${t} t WHERE EXISTS (
         SELECT 1 FROM "Center" c
         JOIN "OrgUnit" ou
           ON ou."deletedAt" IS NULL
          AND (ou."centerId" = c."id"
               OR (ou."centerId" IS NULL AND c."code" IS NOT NULL AND ou."code" = c."code"))
         WHERE c."id" = t."centerId"
       ) AND t."orgUnitId" IS NULL`;
}

async function main() {
  console.log(`\n=== BACKFILL orgUnitId — ${APPLY ? "GHI THẬT (--apply)" : "DRY-RUN (chỉ đếm)"} ===\n`);

  // Cảnh báo sớm nếu cây chưa dời: không có node đích thì backfill "sạch" một cách vô nghĩa.
  const soOrgUnit = await db.orgUnit.count({ where: { deletedAt: null } });
  const coVung = await db.orgUnit.count({ where: { type: "REGION", deletedAt: null } });
  console.log(`Cây tổ chức: ${soOrgUnit} đơn vị sống, ${coVung} khối vùng.`);
  if (coVung === 0) {
    console.warn(
      "⚠️  Chưa có đơn vị REGION nào — nhiều khả năng CHƯA chạy scripts/nen-p1-reshape-org-tree.ts.\n" +
        "    Backfill vẫn chạy đúng (ánh xạ theo Center), nhưng nên dời cây trước cho đúng thứ tự.\n",
    );
  }

  let tong = 0;
  const dong: Array<{ model: string; so: number }> = [];

  for (const spec of ALL_DRIFT_SPECS) {
    if (APPLY) {
      const so = await db.$executeRawUnsafe(sqlFor(spec.model, true));
      if (so > 0) dong.push({ model: spec.model, so });
      tong += so;
    } else {
      const r = await db.$queryRawUnsafe<Array<{ c: number }>>(sqlFor(spec.model, false));
      const so = Number(r[0]?.c ?? 0);
      if (so > 0) dong.push({ model: spec.model, so });
      tong += so;
    }
  }

  if (dong.length === 0) {
    console.log("✅ Không có dòng nào cần điền. (Chạy lại là no-op — đúng AC1.)\n");
    return;
  }

  console.log(`${APPLY ? "Đã điền" : "Sẽ điền"} ${tong} dòng ở ${dong.length} bảng:`);
  for (const d of dong.sort((a, b) => b.so - a.so)) {
    console.log(`  ${d.model.padEnd(28)} ${String(d.so).padStart(8)}`);
  }

  if (!APPLY) {
    console.log("\n⚠️  DRY-RUN — chưa ghi gì. Xem kỹ rồi chạy lại với --apply.\n");
  } else {
    console.log("\n✅ Xong. Chạy `pnpm tsx scripts/nen-p1-doi-soat-orgunit.ts` để xác nhận.\n");
  }
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
