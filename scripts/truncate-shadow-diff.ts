import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// "Bấm đồng hồ" shadow-compare — TRUNCATE "RbacShadowDiff" để đếm lại ngày sạch từ
// đầu sau khi ĐỔI MAPPING QUYỀN (seed-roles / can.ts / gán-rút UserOrgRole). Xem
// quy tắc vàng: docs/ke-hoach-go-live-2607/shadow-log.md. Bảng này CHỈ là dữ liệu
// chẩn đoán (traffic tự sinh lại), không phải dữ liệu nghiệp vụ → truncate an toàn.
// Chạy qua workflow "Reset đồng hồ shadow" (DATABASE_URL = PROD_DIRECT_URL).
async function main() {
  const db = new PrismaClient();
  try {
    const before = await db.rbacShadowDiff.count();
    await db.$executeRaw`TRUNCATE "RbacShadowDiff"`;
    const after = await db.rbacShadowDiff.count();
    console.log(`✅ RbacShadowDiff: ${before} → ${after} — đồng hồ shadow đã reset, đếm lại ngày sạch từ đầu.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error("LỖI truncate shadow:", e instanceof Error ? e.message : e);
  process.exit(1);
});
