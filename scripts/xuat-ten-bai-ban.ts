/**
 * Liệt kê tên bài trong giáo trình có KHOẢNG TRẮNG BẤT THƯỜNG — bàn giao Đào tạo.
 *
 * ⚠️ CHỈ ĐỌC. Không create/update/delete, không $executeRaw.
 *
 * Hàm dựng nhãn đã tự gộp khoảng trắng (`clean()` trong `lib/lms/session-project-name.ts`)
 * nên phụ huynh KHÔNG còn thấy tên bẩn — danh sách này để Đào tạo dọn nguồn, không phải
 * việc chặn. Xuất riêng vì cột `Lesson.title` còn đi vào nơi khác ngoài nhãn buổi.
 *
 * CHẠY: PROD_READONLY_URL='postgresql://…:5432/postgres' pnpm exec tsx scripts/xuat-ten-bai-ban.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: { db: { url: process.env.PROD_READONLY_URL ?? process.env.DATABASE_URL ?? "" } },
});
const csv = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function main() {
  const lessons = await db.lesson.findMany({
    orderBy: [{ curriculumId: "asc" }, { order: "asc" }],
    select: { id: true, order: true, title: true, curriculum: { select: { name: true, version: true } } },
  });

  const ban = lessons.filter((l) => l.title !== l.title.replace(/\s+/g, " ").trim());
  console.log(["giao_trinh", "bai_so", "ten_hien_tai", "ten_sau_khi_don", "van_de"].map(csv).join(","));
  for (const l of ban) {
    const sach = l.title.replace(/\s+/g, " ").trim();
    const loi: string[] = [];
    if (/\s{2,}/.test(l.title)) loi.push("dấu cách lặp");
    if (l.title !== l.title.trim()) loi.push("thừa ở hai đầu");
    if (/[\t\n\r]/.test(l.title)) loi.push("tab/xuống dòng");
    console.log([
      `${l.curriculum?.name ?? "?"} v${l.curriculum?.version ?? "?"}`,
      String(l.order),
      l.title,
      sach,
      loi.join(" + "),
    ].map(csv).join(","));
  }
  console.error(`\n→ ${ban.length}/${lessons.length} tên bài có khoảng trắng bất thường`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
