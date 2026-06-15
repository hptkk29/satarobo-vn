import { PrismaClient } from "@prisma/client";
import { promotions } from "../components/legacy-laptrinhrobot/_data/promotions";
import { testimonials } from "../components/legacy-laptrinhrobot/_data/testimonials";

// Seed nội dung marketing (Promotion + Testimonial) từ dữ liệu tĩnh _data/*.
// Idempotent: Promotion upsert theo slug; Testimonial findFirst theo name+content.
// Nguồn gốc: trang khoá học Lập trình Robot (courseSlug = "laptrinhrobot").
export async function seedMarketingContent(db: PrismaClient) {
  console.log("🎁 Seeding marketing content (Promotion + Testimonial)...");

  // ─── Promotions ─────────────────────────────────────────────────────────────
  let order = 0;
  for (const p of promotions.primary) {
    await db.promotion.upsert({
      where: { slug: p.id },
      update: {
        kind: "PRIMARY",
        title: p.title,
        highlight: p.highlight,
        description: p.description,
        details: p.details,
        cta: p.cta,
        target: p.target,
        icon: p.icon,
        featured: p.featured ?? false,
        courseSlug: "laptrinhrobot",
        displayOrder: order,
      },
      create: {
        slug: p.id,
        kind: "PRIMARY",
        title: p.title,
        highlight: p.highlight,
        description: p.description,
        details: p.details,
        cta: p.cta,
        target: p.target,
        icon: p.icon,
        featured: p.featured ?? false,
        courseSlug: "laptrinhrobot",
        displayOrder: order,
      },
    });
    order++;
  }

  order = 0;
  for (const s of promotions.secondary) {
    await db.promotion.upsert({
      where: { slug: s.id },
      update: {
        kind: "SECONDARY",
        title: s.title,
        highlight: s.highlight,
        description: s.description,
        condition: s.condition,
        note: s.note,
        icon: s.icon,
        courseSlug: "laptrinhrobot",
        displayOrder: order,
      },
      create: {
        slug: s.id,
        kind: "SECONDARY",
        title: s.title,
        highlight: s.highlight,
        description: s.description,
        condition: s.condition,
        note: s.note,
        icon: s.icon,
        courseSlug: "laptrinhrobot",
        displayOrder: order,
      },
    });
    order++;
  }

  // ─── Testimonials ─────────────────────────────────────────────────────────────
  let tOrder = 0;
  for (const t of testimonials) {
    const existing = await db.testimonial.findFirst({
      where: { name: t.name, content: t.content },
      select: { id: true },
    });
    const data = {
      name: t.name,
      role: t.role,
      location: t.location,
      rating: t.rating,
      avatar: t.avatar,
      avatarColor: t.avatarColor,
      content: t.content,
      displayOrder: tOrder,
      isPublished: true,
    };
    if (existing) {
      await db.testimonial.update({ where: { id: existing.id }, data });
    } else {
      await db.testimonial.create({ data });
    }
    tOrder++;
  }

  console.log(
    `✅ Marketing content: ${promotions.primary.length + promotions.secondary.length} promotion, ${testimonials.length} testimonial`,
  );
}

// Cho phép chạy độc lập: tsx prisma/seed-marketing-content.ts
if (require.main === module) {
  const db = new PrismaClient();
  seedMarketingContent(db)
    .catch((e) => {
      console.error("❌ Seed marketing content thất bại:", e);
      process.exit(1);
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
