/**
 * P1-b — Backfill: user là GV (role chính TEACHER hoặc có TeacherProfile) nhưng
 * roles[] thiếu "TEACHER" → thêm vào, để danh sách GV + RBAC đa vai trò đúng.
 *
 *   pnpm exec tsx scripts/backfill-teacher-roles.ts          # DRY-RUN
 *   pnpm exec tsx scripts/backfill-teacher-roles.ts --apply  # thực thi
 *
 * An toàn: chỉ THÊM "TEACHER" vào roles (không xoá vai trò khác). Không đụng data khác.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`\n🔧 Backfill TEACHER role — ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  const candidates = await db.user.findMany({
    where: {
      deletedAt: null,
      OR: [{ role: "TEACHER" }, { teacherProfile: { isNot: null } }],
      NOT: { roles: { has: "TEACHER" } },
    },
    select: { id: true, name: true, email: true, roles: true },
  });

  console.log(`  Tìm thấy ${candidates.length} GV thiếu "TEACHER" trong roles[]:`);
  for (const u of candidates) {
    console.log(`   • ${u.name ?? u.email} [${u.roles.join(", ") || "—"}] → + TEACHER`);
  }

  if (!APPLY) {
    console.log("\nℹ️  DRY-RUN — chưa thay đổi. Chạy lại với --apply.\n");
    return;
  }

  for (const u of candidates) {
    await db.user.update({
      where: { id: u.id },
      data: { roles: { set: Array.from(new Set([...u.roles, "TEACHER"])) } },
    });
  }
  console.log(`\n✅ Đã cập nhật ${candidates.length} user.\n`);
}

main()
  .catch((e) => {
    console.error("❌ Lỗi:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
