/**
 * scripts/noti-backfill-classification.ts — gán NHÓM + MỨC cho thông báo đã có sẵn.
 *
 * VÌ SAO CẦN: migration `20260819110000_noti_v2_staff_notification_fields` thêm cột `groupKey`,
 * `priority`, `entityType` với giá trị mặc định ("system" / 2 / null). Nghĩa là mọi bản ghi
 * SINH TRƯỚC migration đều nằm ở nhóm "Hệ thống", mức thường — tức chip lọc "Tin nhắn PH" trống
 * trơn và mọi việc quá hạn cũ không được đẩy lên đầu panel, dù dữ liệu vẫn còn nguyên.
 *
 * Bản ghi MỚI không cần script này: `notifyStaff()` và vòng đồng bộ việc tồn đều đọc catalog ở
 * cả nhánh create lẫn update.
 *
 * VÌ SAO LÀ SCRIPT CHỨ KHÔNG PHẢI SQL TRONG MIGRATION: bảng phân loại nằm trong TypeScript
 * (`lib/notifications/catalog.ts`) và có luật "khớp tiền tố dài nhất" + "quá hạn thì nâng mức".
 * Chép logic đó sang SQL là dựng nguồn sự thật thứ hai, và lần sau sửa catalog thì SQL cũ lệch
 * mà không ai biết. Chạy lại script này sau mỗi lần sửa catalog là cách chữa đúng.
 *
 * CHẠY:
 *   pnpm tsx scripts/noti-backfill-classification.ts           # DRY-RUN (mặc định, chỉ in)
 *   pnpm tsx scripts/noti-backfill-classification.ts --apply   # ghi thật
 *
 * AN TOÀN:
 *  · Mặc định KHÔNG ghi. Phải có --apply (luật cứng Nền Hệ thống #4: có dry-run, người vận
 *    hành chạy tay).
 *  · Idempotent: chạy lần 2 → "không có gì để làm".
 *  · CHỈ đụng 3 cột phân loại. KHÔNG bao giờ đụng `readAt`/`seenAt` — hai mốc đó là dữ liệu có
 *    hệ quả (chủ dự án chốt 19/08 rằng số liệu đọc được dùng cho đánh giá nhân sự); một lệnh
 *    ghi đè ở đây là làm sai lệch số liệu đó vĩnh viễn.
 */
import { classifyNotification } from "../lib/notifications/catalog";
import "./_load-env";
import { scriptDb } from "./_script-db";

const APPLY = process.argv.includes("--apply");
const LO = 500;

async function main(): Promise<void> {
  const db = scriptDb();

  const tong = await db.staffNotification.count();
  console.log(`Tổng thông báo: ${tong}`);
  console.log(APPLY ? "CHẾ ĐỘ: GHI THẬT (--apply)" : "CHẾ ĐỘ: DRY-RUN (thêm --apply để ghi)");

  let cursor: string | undefined;
  let daXem = 0;
  let canSua = 0;
  let chuaKhai = 0;
  const theoNhom = new Map<string, number>();

  for (;;) {
    const rows = await db.staffNotification.findMany({
      take: LO,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
      select: { id: true, dedupeKey: true, groupKey: true, priority: true, entityType: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;
    daXem += rows.length;

    for (const r of rows) {
      const p = classifyNotification(r.dedupeKey);
      if (!p.known) chuaKhai += 1;

      const lech =
        r.groupKey !== p.groupKey ||
        r.priority !== p.priority ||
        r.entityType !== p.entityType;
      if (!lech) continue;

      canSua += 1;
      theoNhom.set(p.groupKey, (theoNhom.get(p.groupKey) ?? 0) + 1);

      if (APPLY) {
        await db.staffNotification.update({
          where: { id: r.id },
          data: { groupKey: p.groupKey, priority: p.priority, entityType: p.entityType },
        });
      }
    }
  }

  console.log(`\nĐã xem:      ${daXem}`);
  console.log(`Cần sửa:     ${canSua}`);
  console.log(`Chưa khai trong catalog: ${chuaKhai}  ← nếu > 0, bổ sung tiền tố vào lib/notifications/catalog.ts rồi chạy lại`);
  console.log("\nPhân bố nhóm của phần cần sửa:");
  for (const [k, v] of [...theoNhom].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(18)} ${v}`);
  }
  if (!APPLY && canSua > 0) {
    console.log("\nChưa ghi gì. Thêm --apply để thực hiện.");
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
