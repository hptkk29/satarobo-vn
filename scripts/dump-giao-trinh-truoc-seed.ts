/**
 * DUMP trạng thái giáo trình TRƯỚC khi chạy seed — CHỈ ĐỌC.
 *
 *   pnpm exec tsx scripts/dump-giao-trinh-truoc-seed.ts
 *   → var/hoc-phan/dump-truoc-seed.json
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 ĐÂY LÀ ĐƯỜNG LÙI DUY NHẤT.
 *
 * `seed-curriculum-sata.ts --force` ghi đè `title` · `moduleCode` · `moduleName` ·
 * `description` · `objectives` của MỌI bài. `Lesson.title` **không có bản sao nào khác**
 * trong hệ thống — chính chú thích của seed nói vậy (`:58-62`). Không dump trước thì một
 * lượt seed sai là mất vĩnh viễn tên 309 buổi học.
 *
 * ⚠️ Dump đi lên **artifact**, KHÔNG commit vào repo: nó là nội dung giảng dạy thật của
 * công ty. Cùng lối với `sap-lai-bai-prod.yml`.
 *
 * ⚠️ Dump theo `Lesson.id`, KHÔNG theo `(slug, order)`. `id` là thứ `ScormPackage` và
 * `ClassSession` đang trỏ vào; khôi phục theo `id` thì chắc chắn trả đúng hàng, còn khôi
 * phục theo `order` sẽ sai ngay nếu lượt seed đã kịp chèn bài mới.
 */
import "./_cho-phep-server-only";
import { currentDbHost } from "./_load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { db } from "../lib/db";
import { kiemQuyen } from "./_kiem-quyen";
import { buildSataCurricula } from "../lib/lms/curriculum-sata";

const DICH = "var/hoc-phan/dump-truoc-seed.json";

async function main() {
  const quyen = await kiemQuyen(db);
  console.log(`[dump] ${currentDbHost()} · user ${quyen.nguoiDung}`);

  const slugs = buildSataCurricula().map((b) => b.courseSlug);

  // MỘT câu tra cho cả 9 khoá — không N+1.
  const khoa = await db.course.findMany({
    where: { slug: { in: slugs } },
    select: {
      slug: true,
      curriculums: {
        select: {
          id: true,
          name: true,
          version: true,
          lessons: {
            select: {
              id: true,
              order: true,
              title: true,
              moduleCode: true,
              moduleName: true,
              description: true,
              objectives: true,
              archivedAt: true,
            },
            orderBy: { order: "asc" },
          },
        },
      },
    },
    orderBy: { slug: "asc" },
  });

  const soBai = khoa.reduce(
    (s, k) => s + k.curriculums.reduce((t, c) => t + c.lessons.length, 0),
    0,
  );

  // ⚠️ DUMP RỖNG LÀ LỖI, KHÔNG PHẢI "không có gì để lùi".
  //
  // Nếu slug lệch (đo local 26/09: nguồn `sata3` vs DB `sata-3`) thì câu tra trả rỗng, dump
  // ghi ra `[]`, workflow upload một tệp rỗng và bước ghi vẫn chạy — tức MẤT đường lùi mà
  // mọi thứ trông vẫn trơn tru. Ném ở đây để lượt chạy dừng TRƯỚC khi ghi.
  if (soBai === 0) {
    throw new Error(
      `DUMP RỖNG: không đọc được bài nào cho ${slugs.length} slug (${slugs.join(", ")}). ` +
        `Kiểm slug của Course trước khi chạy seed — KHÔNG ghi khi chưa có đường lùi.`,
    );
  }

  mkdirSync(dirname(DICH), { recursive: true });
  writeFileSync(
    DICH,
    JSON.stringify({ dbHost: currentDbHost(), soKhoa: khoa.length, soBai, khoa }, null, 2),
    "utf8",
  );
  console.log(`[dump] ${khoa.length} khoá · ${soBai} bài → ${DICH}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
