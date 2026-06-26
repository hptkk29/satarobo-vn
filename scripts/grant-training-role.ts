// One-off: gán role TRAINING (Đào tạo) cho user theo tên. Idempotent.
// Chạy: pnpm tsx scripts/grant-training-role.ts "Phan Thành Toại"
import { db } from "@/lib/db";

async function main() {
  const nameArg = process.argv[2] ?? "Phan Thành Toại";
  const users = await db.user.findMany({
    where: { name: { contains: nameArg, mode: "insensitive" } },
    select: { id: true, name: true, email: true, roles: true },
  });

  if (users.length === 0) {
    console.error(`Không tìm thấy user khət khớp tên "${nameArg}".`);
    const sample = await db.user.findMany({
      where: { roles: { hasSome: ["SUPER_ADMIN", "CENTER_MANAGER", "HR", "TEACHER"] } },
      select: { name: true, email: true, roles: true },
      take: 20,
    });
    console.log("Một số user hiện có:", JSON.stringify(sample, null, 2));
    process.exit(1);
  }
  if (users.length > 1) {
    console.log("Nhiều user khớp — cần làm rõ:", JSON.stringify(users, null, 2));
    process.exit(1);
  }

  const u = users[0]!;
  if (u.roles.includes("TRAINING")) {
    console.log(`User ${u.name} (${u.email}) đã có role TRAINING — không đổi.`);
    return;
  }
  const updated = await db.user.update({
    where: { id: u.id },
    data: { roles: { set: [...u.roles, "TRAINING"] } },
    select: { name: true, email: true, roles: true },
  });
  console.log("Đã gán TRAINING:", JSON.stringify(updated, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
