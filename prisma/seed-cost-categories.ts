import type { PrismaClient } from "@prisma/client";

/**
 * B-03/B-05 — danh mục đầu phí (`CostCategory`). Idempotent bằng `upsert` theo `code`.
 *
 * 🔴 `ADS` mang `isSystemFed = true` và đó là **chốt chặn chống trừ hai lần**, không
 * phải nhãn trang trí: chi phí quảng cáo đọc thẳng từ D1 (`lib/reports/ads-spend.ts`),
 * KHÔNG đọc từ `CostEntry`. Nếu kế toán nhập tay được hoá đơn Meta thì B3 (lợi nhuận)
 * trừ tiền quảng cáo **hai lần** — sai theo hướng bi quan, và không ai đối chiếu ra vì
 * hai con số nằm ở hai màn khác nhau.
 *
 * Cờ đó được ép ở **hai tầng**, cố ý trùng nhau:
 *  1. validator nhập tay/import từ chối `categoryId` trỏ tới đầu phí `isSystemFed`;
 *  2. truy vấn B2 lọc `category.isSystemFed = false`.
 * Bỏ một trong hai vẫn "chạy được" — đó chính là lý do phải giữ cả hai.
 *
 * ⚠️ `upsert` dưới đây CỐ Ý không đè `label`/`displayOrder` đã có: sau khi lên prod,
 * người dùng đổi nhãn cho hợp cách gọi của họ thì seed lần sau không được giật lại.
 * Thứ DUY NHẤT seed ép đúng là `isSystemFed` — vì nó là ràng buộc an toàn số liệu,
 * không phải sở thích hiển thị.
 */
export async function seedCostCategories(db: PrismaClient) {
  const CATEGORIES = [
    { code: "ADS", label: "Chi phí quảng cáo", isSystemFed: true, displayOrder: 10 },
    { code: "MARKETING_OFFLINE", label: "Marketing ngoài kênh số (tờ rơi, sự kiện, KOL)", isSystemFed: false, displayOrder: 20 },
    { code: "RENT", label: "Thuê mặt bằng", isSystemFed: false, displayOrder: 30 },
    { code: "SALARY", label: "Lương & phụ cấp", isSystemFed: false, displayOrder: 40 },
    { code: "UTILITY", label: "Điện nước, internet, vận hành", isSystemFed: false, displayOrder: 50 },
    { code: "OTHER", label: "Chi phí khác", isSystemFed: false, displayOrder: 90 },
  ];

  for (const c of CATEGORIES) {
    await db.costCategory.upsert({
      where: { code: c.code },
      // Chỉ đồng bộ lại cờ an toàn; nhãn và thứ tự để người dùng tự quản.
      update: { isSystemFed: c.isSystemFed },
      create: c,
    });
  }

  console.log(`  ✓ CostCategory: ${CATEGORIES.length} đầu phí (ADS = isSystemFed)`);
}
