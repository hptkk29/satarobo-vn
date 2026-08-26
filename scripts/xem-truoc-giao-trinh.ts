// scripts/xem-truoc-giao-trinh.ts — XEM TRƯỚC tên buổi/tên dự án của giáo trình mockup.
//
// Không đụng DB, không cần .env: chỉ chạy lib/lms/curriculum-sata.ts qua đúng hai hàm
// mà site GV dùng để in ra màn hình. Dùng để soi nhanh "phụ huynh sẽ đọc thấy chữ gì"
// TRƯỚC khi chạy prisma/seed-curriculum-sata.ts ghi xuống DB.
//
//   pnpm exec tsx scripts/xem-truoc-giao-trinh.ts
import { buildSataCurricula } from "@/lib/lms/curriculum-sata";
import {
  deriveSessionLabel,
  deriveSessionProjectName,
} from "@/lib/lms/session-project-name";

for (const c of buildSataCurricula()) {
  console.log(`\n${c.productCode} (${c.courseSlug}) — ${c.lessons.length} buổi`);
  for (const n of [1, 13, c.lessons.length]) {
    const l = c.lessons.find((x) => x.order === n);
    if (!l) continue;
    const src = {
      sessionNumber: l.order,
      lessonTitle: l.title,
      moduleCode: l.moduleCode,
    };
    console.log(
      `   bảng: "${deriveSessionLabel(src)}"  |  phiếu PH: "${deriveSessionProjectName(src)}"`,
    );
  }
}
