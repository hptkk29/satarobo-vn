/**
 * Đắp `Enrollment.centerId` từ lớp (FL3-02 denormalize).
 *
 * Vì sao cần: Enrollment ∈ SCOPED_MODELS — bản ghi thiếu `centerId` KHÔNG lọt qua
 * bộ lọc cơ sở, nên vô hình với mọi người dùng cấp cơ sở (Sale/QLCS/GV) dù học viên
 * và lớp đều bình thường. Không báo lỗi, chỉ đơn giản là biến mất khỏi danh sách.
 * Phát hiện 05/08 khi sweep nghiệm thu luồng.
 *
 *   pnpm tsx scripts/backfill-enrollment-center.ts           # DRY-RUN
 *   pnpm tsx scripts/backfill-enrollment-center.ts --apply   # ghi thật
 */
import { db } from "@/lib/db";

const APPLY = process.argv.includes("--apply");

async function main() {
  const rows = await db.enrollment.findMany({
    where: { centerId: null, deletedAt: null },
    select: { id: true, class: { select: { centerId: true, classCode: true } }, student: { select: { name: true } } },
  });
  const vaDuoc = rows.filter((r) => r.class?.centerId);
  const khong = rows.length - vaDuoc.length;

  console.log(`Ghi danh thiếu cơ sở: ${rows.length} · đắp được từ lớp: ${vaDuoc.length} · lớp cũng không có cơ sở: ${khong}`);
  for (const r of vaDuoc.slice(0, 10)) {
    console.log(`  ${r.student?.name ?? "?"} · lớp ${r.class?.classCode ?? "?"} → ${r.class?.centerId}`);
  }
  if (!APPLY) {
    console.log("\nDRY-RUN — chưa ghi gì. Chạy lại với `--apply` để ghi thật.");
    return;
  }
  let n = 0;
  for (const r of vaDuoc) {
    await db.enrollment.update({ where: { id: r.id }, data: { centerId: r.class!.centerId } });
    n++;
  }
  console.log(`\n✓ Đã đắp ${n} bản ghi.`);
  if (khong > 0) console.log(`⚠️ Còn ${khong} bản ghi mà LỚP cũng không có cơ sở — phải sửa lớp trước.`);
}
main().catch((e) => console.error(String(e).slice(0, 400))).finally(() => db.$disconnect());
