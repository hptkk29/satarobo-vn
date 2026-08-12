/**
 * scripts/nen-p1-anh-chup-org-tree.ts — CHỈ ĐỌC. In toàn bộ cây OrgUnit ra JSON.
 *
 * VÌ SAO CÓ: runbook P1 (`docs/nen-he-thong/RUNBOOK-P1.md` §4) ghi rõ bước dời cây
 * "không có nút lùi tự động" — trước khi `--apply` phải chụp lại trạng thái để dựng
 * lại tay nếu cần. Trước đây việc chụp là câu SQL gõ tay trong Supabase SQL Editor,
 * nghĩa là chạy trên CI thì không ai chụp cả. Đưa vào script để workflow tự chụp và
 * đính kèm ảnh vào log lần chạy — muốn lùi thì mở đúng lần chạy đó ra mà đọc.
 *
 * CHẠY:  pnpm tsx scripts/nen-p1-anh-chup-org-tree.ts
 */
import "./_load-env";
import { scriptDb } from "./_script-db";

const db = scriptDb();

async function main() {
  const rows = await db.orgUnit.findMany({
    orderBy: [{ path: "asc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      parentId: true,
      path: true,
      depth: true,
      status: true,
      isActive: true,
      centerId: true,
      deletedAt: true,
      // US-06 AC2: mọi đơn vị phải neo vào pháp nhân. Đơn vị REGION do script dời
      // cây tạo ra khi CHƯA có pháp nhân gốc sẽ mang null ở đây cho tới khi chạy
      // `prisma/seed-orgunit.ts` — nên phải nhìn thấy cột này mới biết đã xong hay chưa.
      legalEntityId: true,
    },
  });
  const legalEntities = await db.legalEntity.findMany({
    select: { id: true, taxCode: true, legalName: true, isPrimary: true, isActive: true },
    orderBy: { taxCode: "asc" },
  });
  const roles = await db.userOrgRole.groupBy({
    by: ["orgUnitId"],
    _count: { _all: true },
  });

  console.log(`=== ẢNH CHỤP OrgUnit — ${rows.length} đơn vị (kể cả đã xoá mềm) ===`);
  console.log(JSON.stringify(rows, null, 2));
  console.log(`\n=== Pháp nhân (${legalEntities.length}) ===`);
  console.log(JSON.stringify(legalEntities, null, 2));
  const thieuPhapNhan = rows.filter((r) => r.deletedAt === null && r.legalEntityId === null);
  console.log(
    thieuPhapNhan.length === 0
      ? "✅ Mọi đơn vị đang sống đều đã neo pháp nhân."
      : `⚠️  ${thieuPhapNhan.length} đơn vị đang sống CHƯA neo pháp nhân: ${thieuPhapNhan
          .map((r) => r.code)
          .join(", ")} — chạy prisma/seed-orgunit.ts.`,
  );

  console.log(`\n=== Số dòng UserOrgRole đang neo theo từng đơn vị ===`);
  console.log(
    JSON.stringify(
      roles.map((r) => ({ orgUnitId: r.orgUnitId, soDong: r._count._all })),
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
