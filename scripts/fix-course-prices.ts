/**
 * O4 (data fix) — Nạp lại `Course.price` cho các khoá DẠY ĐƯỢC đã publish nhưng
 * còn `price` NULL/0 (vd Sata5), lấy giá niêm yết từ `courses-pricing.ts`.
 *
 *   pnpm exec tsx scripts/fix-course-prices.ts          # DRY-RUN (chỉ liệt kê)
 *   pnpm exec tsx scripts/fix-course-prices.ts --apply  # thực thi cập nhật
 *
 * Gốc rễ: row Course teachable+published trong DB có `price=NULL` (publish ngoài
 * seed / admin xoá giá) → trang tạo đơn ra "đơn giá 0". Seed value vẫn đúng
 * (`courses-pricing.ts`), nên ở đây chỉ vá DỮ LIỆU.
 *
 * AN TOÀN (idempotent):
 *   - CHỈ đụng row WHERE isTeachable AND isPublished AND (price IS NULL OR price = 0).
 *   - CHỈ set `price`. KHÔNG lật `isPublished`/`isTeachable`/`isActive`
 *     (đừng chạy lại `seed-courses.ts` vì nó set isPublished:false).
 *   - Khớp theo `code` (seed set code = id, vd "Sata5") hoặc `slug`
 *     (id.toLowerCase(), Combo → "combo-luyen-thi") — đồng bộ với seed-courses.ts.
 *   - Chạy lại lần 2 = no-op (row đã có giá > 0 không còn lọt query).
 */
import { PrismaClient } from "@prisma/client";
import { courseGroups } from "../components/legacy-laptrinhrobot/_data/courses-pricing";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// Đồng bộ với prisma/seed-courses.ts: id → slug.
function slugFor(id: string): string {
  return id === "Combo" ? "combo-luyen-thi" : id.toLowerCase();
}

// Đồng bộ với prisma/seed-courses.ts: thứ tự ưu tiên giá niêm yết.
function priceFor(c: {
  earlyBirdPrice?: number;
  fixedPrice?: number;
  comboPrice?: number;
  listPrice: number;
}): number {
  return c.earlyBirdPrice ?? c.fixedPrice ?? c.comboPrice ?? c.listPrice;
}

function formatVnd(n: number): string {
  return n.toLocaleString("vi-VN");
}

async function main() {
  console.log(
    `\n🔧 Fix Course.price (teachable+published, price NULL/0) — ${
      APPLY ? "APPLY" : "DRY-RUN"
    }\n`,
  );

  // Bảng tra giá theo cả code (lowercase) lẫn slug → giá niêm yết.
  const priceByKey = new Map<string, number>();
  for (const c of courseGroups.flatMap((g) => g.courses)) {
    const p = priceFor(c);
    priceByKey.set(c.id.toLowerCase(), p); // khớp theo code (vd "sata5")
    priceByKey.set(slugFor(c.id), p); // khớp theo slug (vd "combo-luyen-thi")
  }

  const affected = await db.course.findMany({
    where: {
      isTeachable: true,
      isPublished: true,
      OR: [{ price: null }, { price: 0 }],
    },
    select: { id: true, name: true, slug: true, code: true, price: true },
    orderBy: { displayOrder: "asc" },
  });

  if (affected.length === 0) {
    console.log("  ✓ Không có khoá teachable+published nào còn price NULL/0.\n");
    return;
  }

  console.log(`  Tìm thấy ${affected.length} khoá cần nạp giá:\n`);

  const toUpdate: { id: string; name: string; price: number }[] = [];
  const noSource: { name: string; slug: string; code: string | null }[] = [];

  for (const course of affected) {
    const key = (course.code ?? "").toLowerCase() || course.slug.toLowerCase();
    const price = priceByKey.get(key) ?? priceByKey.get(course.slug.toLowerCase());
    if (price == null) {
      noSource.push({ name: course.name, slug: course.slug, code: course.code });
      continue;
    }
    toUpdate.push({ id: course.id, name: course.name, price });
    console.log(
      `   • ${course.name} [${course.code ?? course.slug}] ${
        course.price ?? "NULL"
      } → ${formatVnd(price)}đ`,
    );
  }

  if (noSource.length > 0) {
    console.log(
      `\n  ⚠️  ${noSource.length} khoá KHÔNG có giá nguồn trong courses-pricing.ts (bỏ qua):`,
    );
    for (const c of noSource) {
      console.log(`     - ${c.name} [code=${c.code ?? "—"}, slug=${c.slug}]`);
    }
  }

  if (!APPLY) {
    console.log(
      `\nℹ️  DRY-RUN — chưa thay đổi (${toUpdate.length} khoá sẽ được cập nhật). Chạy lại với --apply.\n`,
    );
    return;
  }

  for (const u of toUpdate) {
    await db.course.update({
      where: { id: u.id },
      data: { price: u.price }, // CHỈ price — không đụng isPublished/isTeachable
    });
  }
  console.log(`\n✅ Đã cập nhật giá cho ${toUpdate.length} khoá.\n`);
}

main()
  .catch((e) => {
    console.error("❌ Lỗi:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
