// prisma/seed-cham-cong.ts — SEED NỀN module chấm công v3 (chạy 1 lần, idempotent).
//
//   pnpm db:seed:cham-cong            # 21 mã ca + 8 loại nghỉ + WorkLocation cho CS1/CS2
//   pnpm db:seed:cham-cong -- --force # cập nhật lại tên/giờ của 21 mã theo danh mục code
//
// Sau lần này, nguồn sự thật là DB và người vận hành sửa trên màn danh mục (PHẦN 6b): không
// có --force thì KHÔNG đè cột người dùng đã sửa. Không tạo WorkLocation cho Hội sở (Q-04).
// Toạ độ để trống → geofence tắt (Q-02). Trên PROD chạy qua workflow GitHub.
import { PrismaClient } from "@prisma/client";
import { seedLeaveTypes, seedShiftTemplates, seedTeachingCreditTypes, seedWorkLocations } from "../lib/cham-cong/seed-core";

const force = process.argv.includes("--force");
const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL });

async function main() {
  const t = await seedShiftTemplates(db, { force });
  const l = await seedLeaveTypes(db, { force });
  const w = await seedWorkLocations(db);
  const c = await seedTeachingCreditTypes(db, { force });
  console.log(
    `[seed-cham-cong] ShiftTemplate: +${t.created} tạo, ${t.updated} cập nhật${force ? " (--force)" : ""} · LeaveType: ${l} · WorkLocation: +${w} · TeachingCreditType: ${c}`,
  );
}

main()
  .catch((e) => {
    console.error("[seed-cham-cong] lỗi:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
