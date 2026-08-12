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
    },
  });
  const roles = await db.userOrgRole.groupBy({
    by: ["orgUnitId"],
    _count: { _all: true },
  });

  console.log(`=== ẢNH CHỤP OrgUnit — ${rows.length} đơn vị (kể cả đã xoá mềm) ===`);
  console.log(JSON.stringify(rows, null, 2));
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
