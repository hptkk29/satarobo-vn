/**
 * scripts/bao-cao-hoan-thanh-khoa-prod.ts — ĐỌC PROD, KHÔNG GHI GÌ.
 *
 * Trả lời đúng một câu của chủ dự án (23/09/2026):
 *   "Có các học viên trên prod tôi đã chuyển hoàn thành. Giờ muốn các em đó nằm ở tab
 *    'Hoàn thành khoá' thì làm sao?"
 *
 * Câu đó KHÔNG trả lời được bằng suy luận, vì **"đã chuyển hoàn thành" có BA đường**, mỗi
 * đường để lại một dấu vết khác nhau, và chỉ MỘT đường làm em hiện ở tab mới:
 *
 *   (A) Sửa hồ sơ học viên → Trạng thái "Hoàn thành"  ⇒ `Student.status = GRADUATED`
 *       → Tab mới ĐÒI `status = ACTIVE` nên em KHÔNG hiện. Badge in "Hoàn thành".
 *         Em rơi ra ngoài MỌI tab vận hành, chỉ còn thấy ở "Tất cả".
 *   (B) /admin/enrollments → đổi trạng thái ghi danh sang "Hoàn thành khoá"
 *       ⇒ `Enrollment.status = COMPLETED`, `Student.status` vẫn ACTIVE
 *       → Em HIỆN ĐÚNG ở tab mới (nếu hết lớp đang học và chưa đăng ký khoá tiếp).
 *   (C) /hoan-thanh-khoa → cấp chứng chỉ
 *       ⇒ tạo `CourseCompletion` NHƯNG `completeCourse` KHÔNG ghi `Enrollment.status`
 *         (nợ đang ghim). Ghi danh vẫn STUDYING/ACTIVE ⇒ badge vẫn "Đang học".
 *
 * Báo cáo đếm từng nhóm để QUYẾT: nhóm (A) cần nới định nghĩa tab, nhóm (C) cần backfill
 * `Enrollment.status`. Không có số thì mọi phương án đều là phỏng đoán.
 *
 * ── KHOÁ AN TOÀN ─────────────────────────────────────────────────────────────────────
 * · Tệp này KHÔNG chứa lời gọi ghi nào, không cờ `--apply`.
 * · Mọi truy vấn trong transaction `SET TRANSACTION READ ONLY` rồi NÉM để rollback —
 *   `return` KHÔNG rollback (CLAUDE.md mục 7). Postgres tự chặn phép ghi nếu có.
 * · Chỉ đọc `DATABASE_URL`/`DIRECT_URL` mà workflow trỏ tới user CHỈ-ĐỌC.
 * · In dòng tự khai user + quyền ghi ở đầu — GitHub không cho đọc lại secret, nên đây là
 *   cách DUY NHẤT thấy secret bị đặt nhầm sang chuỗi đầy quyền.
 * · KHÔNG in họ tên học viên: báo cáo rời khỏi vòng kiểm soát của DB (job summary +
 *   artifact). Chỉ in ĐẾM; cần danh sách thì tra trong admin.
 */
import { writeFileSync } from "node:fs";
import { scriptDb } from "./_script-db";
import { kiemQuyen, inQuyen } from "./_kiem-quyen";
import { STUDYING_ENROLLMENT_STATUSES } from "../lib/enrollment-status";

const CHO_XEP = ["PENDING", "CONFIRMED"] as const;
const KET = "__XEM_TRUOC_XONG__";

async function main() {
  const db = scriptDb();
  const thongTin = await kiemQuyen(db);
  inQuyen(thongTin, false);

  const dong: string[] = [];
  const ghi = (s = "") => {
    dong.push(s);
    console.log(s);
  };

  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;

        const conSong = { deletedAt: null };
        const coLopDangHoc = {
          enrollments: {
            some: { status: { in: STUDYING_ENROLLMENT_STATUSES }, deletedAt: null },
          },
        };
        const hetLopDangHoc = {
          enrollments: {
            none: { status: { in: STUDYING_ENROLLMENT_STATUSES }, deletedAt: null },
          },
        };
        const coGhiDanhXong = {
          enrollments: { some: { status: "COMPLETED" as const, deletedAt: null } },
        };
        const daDangKyTiep = {
          enrollments: { some: { status: { in: [...CHO_XEP] }, deletedAt: null } },
        };
        const chuaDangKyTiep = {
          enrollments: { none: { status: { in: [...CHO_XEP] }, deletedAt: null } },
        };

        const [
          tongHocVien,
          theoTrangThai,
          graduated,
          graduatedCoGhiDanhXong,
          hienDungOTabMoi,
          tongChungChi,
          xongNhungConLopKhac,
          daDangKyTiepSauKhiXong,
          tangHinh,
          // ⚠️ HAI câu này thay cho một vòng N+1 (một `count` cho TỪNG chứng chỉ).
          // Đó đúng hình dạng đã giết `backfill-orderitem-dry.ts` bằng
          // `P2028 — Transaction … open for longer than the timeout` ngay lượt chạy prod
          // đầu tiên. Lấy cả hai tập rồi giao nhau trong bộ nhớ: 2 round-trip, không phải N.
          capChungChi,
          capDangHoc,
        ] = await Promise.all([
          tx.student.count({ where: conSong }),
          tx.student.groupBy({ by: ["status"], where: conSong, _count: true }),
          tx.student.count({ where: { ...conSong, status: "GRADUATED" } }),
          tx.student.count({ where: { ...conSong, status: "GRADUATED", ...coGhiDanhXong } }),
          tx.student.count({
            where: {
              ...conSong,
              status: "ACTIVE",
              AND: [coGhiDanhXong, hetLopDangHoc, chuaDangKyTiep],
            },
          }),
          tx.courseCompletion.count(),
          tx.student.count({
            where: { ...conSong, status: "ACTIVE", AND: [coGhiDanhXong, coLopDangHoc] },
          }),
          tx.student.count({
            where: {
              ...conSong,
              status: "ACTIVE",
              AND: [coGhiDanhXong, hetLopDangHoc, daDangKyTiep],
            },
          }),
          // Nhóm "tàng hình": ACTIVE, hết lớp đang học, KHÔNG có ghi danh COMPLETED, không
          // chờ xếp, nhưng CÓ ghi danh PAUSED — đúng 5 em đã đo ở local. Đếm để biết prod có.
          tx.student.count({
            where: {
              ...conSong,
              status: "ACTIVE",
              AND: [
                hetLopDangHoc,
                { enrollments: { none: { status: "COMPLETED", deletedAt: null } } },
                chuaDangKyTiep,
                { enrollments: { some: { status: "PAUSED", deletedAt: null } } },
              ],
            },
          }),
          tx.courseCompletion.findMany({ select: { studentId: true, courseId: true } }),
          tx.enrollment.findMany({
            where: { deletedAt: null, status: { in: STUDYING_ENROLLMENT_STATUSES } },
            select: { studentId: true, courseId: true },
          }),
        ]);

        const khoaDangHoc = new Set(capDangHoc.map((e) => `${e.studentId}|${e.courseId}`));
        const chungChiNhungChuaXongGhiDanh = capChungChi.filter((c) =>
          khoaDangHoc.has(`${c.studentId}|${c.courseId}`),
        ).length;

        ghi("# Hoàn thành khoá — hiện trạng PROD (chỉ đọc)");
        ghi();
        ghi(`Tổng học viên còn sống: **${tongHocVien}**`);
        ghi();
        ghi("## `Student.status`");
        ghi();
        ghi("| Trạng thái | Số em |");
        ghi("|---|---:|");
        for (const r of theoTrangThai) {
          ghi(`| ${r.status} | ${typeof r._count === "number" ? r._count : 0} |`);
        }
        ghi();
        ghi('## Ba đường "đã chuyển hoàn thành" — em nào hiện ở tab mới?');
        ghi();
        ghi('| Nhóm | Số em | Hiện ở tab "Hoàn thành khoá"? |');
        ghi("|---|---:|---|");
        ghi(
          `| **(B)** ghi danh COMPLETED, hết lớp, chưa đăng ký tiếp | ${hienDungOTabMoi} | ✅ CÓ — không phải làm gì |`,
        );
        ghi(
          `| **(A)** đặt tay \`Student.status = GRADUATED\` | ${graduated} | ❌ KHÔNG — tab đòi \`ACTIVE\` |`,
        );
        ghi(
          `| ↳ trong đó CÓ ghi danh COMPLETED | ${graduatedCoGhiDanhXong} | nới tab là đủ |`,
        );
        ghi(
          `| ↳ KHÔNG có ghi danh COMPLETED | ${graduated - graduatedCoGhiDanhXong} | nới tab CHƯA đủ |`,
        );
        ghi(
          `| **(C)** có chứng chỉ nhưng ghi danh vẫn đang học | ${chungChiNhungChuaXongGhiDanh} | ❌ KHÔNG — badge vẫn "Đang học" |`,
        );
        ghi();
        ghi(`Tổng bản ghi \`CourseCompletion\`: **${tongChungChi}**`);
        ghi();
        ghi("## Nhóm khác, để đối chiếu");
        ghi();
        ghi(`- Xong khoá nhưng **còn lớp khác** (đúng là "Đang học"): **${xongNhungConLopKhac}**`);
        ghi(
          `- Xong khoá và **đã đăng ký khoá tiếp** (đúng là "Chờ xếp lớp"): **${daDangKyTiepSauKhiXong}**`,
        );
        ghi(`- **Tàng hình** — ACTIVE, ghi danh chỉ có PAUSED, rớt khỏi mọi tab: **${tangHinh}**`);
        ghi();
        ghi("## Đọc số này thế nào");
        ghi();
        ghi(
          "- Nhóm **(A)** > 0 ⇒ nới định nghĩa tab để nhận cả `GRADUATED`. KHÔNG phải sửa tay từng hồ sơ.",
        );
        ghi(
          "- Nhánh **(A) không có ghi danh COMPLETED** > 0 ⇒ nới tab thôi chưa đủ (tab còn đòi có ghi danh đã xong); phải quyết: nhận theo `Student.status`, hay backfill ghi danh.",
        );
        ghi(
          "- Nhóm **(C)** > 0 ⇒ cần backfill `Enrollment.status = COMPLETED` cho em đã có chứng chỉ, VÀ vá `completeCourse` để lần sau không sinh thêm.",
        );
        ghi("- (A) và (C) đều = 0 ⇒ không phải làm gì, các em đã nằm đúng tab.");

        throw new Error(KET);
      },
      // Trần mặc định của transaction TƯƠNG TÁC là 5 giây — hợp lý cho transaction GHI ngắn,
      // không hợp lý cho một lượt ĐỌC dựng báo cáo qua WAN sang Supabase. Con số này KHÔNG
      // phải bản vá cho N+1: vòng lặp đã bị gộp thành 2 câu ở trên (xem chú thích).
      { timeout: 120_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (!(e instanceof Error) || e.message !== KET) throw e;
  }

  writeFileSync("bao-cao-hoan-thanh-khoa-prod.md", dong.join("\n") + "\n", "utf8");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
