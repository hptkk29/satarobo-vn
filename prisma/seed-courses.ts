// FIX 7 — Seed Sata1–8 + Combo vào model Course (đồng bộ từ courses-pricing.ts).
// Idempotent (upsert theo slug). KHÔNG đụng 2 khoá cũ (laptrinhrobot, luyenthirobosim)
// và KHÔNG re-map Class hiện có — chỉ THÊM khoá mới để dropdown tạo lớp + tiên quyết
// + tự-điền học phí (FIX 8) hoạt động. Seed sẵn cặp tiên quyết Sata8 ← Sata1.
//
// Chạy: pnpm exec dotenv -e .env -- tsx prisma/seed-courses.ts
import { db } from "../lib/db";
import { courseGroups } from "../components/legacy-laptrinhrobot/_data/courses-pricing";

function slugFor(id: string): string {
  return id === "Combo" ? "combo-luyen-thi" : id.toLowerCase();
}

async function main() {
  const flat = courseGroups.flatMap((g) => g.courses);
  let order = 10;
  for (const c of flat) {
    const price =
      c.earlyBirdPrice ?? c.fixedPrice ?? c.comboPrice ?? c.listPrice ?? null;
    const slug = slugFor(c.id);
    const name = `${c.id} — ${c.displayName}`;
    await db.course.upsert({
      where: { slug },
      update: { name, code: c.id, price, isActive: true },
      create: {
        name,
        slug,
        code: c.id,
        price,
        type: "OFFLINE",
        isActive: true,
        isPublished: false, // nội bộ LMS — public site dùng CoursePackage
        displayOrder: order,
      },
    });
    console.log(`  ✓ ${slug} — ${name} (${price ?? "—"}đ)`);
    order += 10;
  }

  // Cặp tiên quyết mẫu: Sata8 (Vé Vàng Chung Kết) yêu cầu Sata1 (Robosim Master).
  const [sata8, sata1] = await Promise.all([
    db.course.findUnique({ where: { slug: "sata8" }, select: { id: true } }),
    db.course.findUnique({ where: { slug: "sata1" }, select: { id: true } }),
  ]);
  if (sata8 && sata1) {
    await db.coursePrerequisite.upsert({
      where: {
        courseId_requiredCourseId: {
          courseId: sata8.id,
          requiredCourseId: sata1.id,
        },
      },
      update: {},
      create: { courseId: sata8.id, requiredCourseId: sata1.id },
    });
    console.log("  ✓ Tiên quyết: Sata8 ← Sata1");
  }

  console.log(`\nĐã upsert ${flat.length} khoá.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
