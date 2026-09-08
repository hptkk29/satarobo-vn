/**
 * Dọn `ClassSessionPlan.customTitle` do MÁY chép — trả ô đó về cho người.
 *
 * Bối cảnh: `docs/dieu-tra-lech-bai-hoc.md` §4.1. `createSessionPlansForClass` từng chép
 * `Lesson.title` vào `customTitle` lúc tạo lớp (đã vá, nhưng lớp cũ vẫn mang di sản). Bản
 * sao đông cứng đó không tự đồng bộ khi giáo trình đổi tên ⇒ nhãn in tên CŨ. `customTitle`
 * để NULL thì nhãn rơi về `Lesson.title`, tức luôn khớp giáo trình hiện hành.
 *
 * ═══ BỐN CỔNG AN TOÀN — bỏ cái nào cũng mở lại một đường mất dữ liệu ═══
 *
 *  1. `--dry-run` là MẶC ĐỊNH. Chỉ ghi khi truyền `--apply`. Không có chế độ ngầm.
 *  2. GIỚI HẠN CỨNG theo mã lớp: không truyền `--lop=...` thì script DỪNG, không có
 *     nhánh "chạy tất". Cố ý — bảng có 960 dòng ở 20 lớp, một lần lỡ tay là mất hết.
 *  3. DUMP giá trị cũ ra file JSON TRƯỚC khi ghi. Không dump được thì KHÔNG ghi.
 *  4. LOẠI TRỪ nhóm NGƯỜI GÕ — phát hiện bằng `updatedAt` lệch `createdAt` (> 2 giây),
 *     KHÔNG hard-code id. Lần chạy sau có thể đã có thêm dòng người gõ; danh sách cứng
 *     sẽ bỏ sót đúng những dòng cần bảo vệ nhất.
 *
 * ═══ Nhóm nào bị dọn ═══
 *
 * Chỉ plan mà `customTitle` KHÔNG mang thông tin của người:
 *   · ô trống `"Buổi N"` — `meaningfulSessionTitle` vốn đã loại, dọn cho sạch;
 *   · chép trùng `Lesson.title` — thừa;
 *   · KHÁC `Lesson.title` **và không có dấu vết người sửa** — đây là tên giáo trình CŨ.
 * Plan có dấu vết người sửa thì GIỮ NGUYÊN dù thuộc nhóm nào, và được liệt kê riêng để
 * bàn giao Đào tạo xác nhận.
 *
 * ═══ CHẠY ═══
 *
 *   # xem trước (mặc định, không ghi gì)
 *   PROD_READONLY_URL='postgresql://…:5432/…' pnpm exec tsx scripts/don-customtitle-may-chep.ts \
 *     --lop=CS1.SATA3.26.001,CS1.SATA3.26.002,CS2.SATA3.26.001
 *
 *   # ghi thật — cần chuỗi CÓ QUYỀN GHI, và phải có --apply
 *   DATABASE_URL='…' pnpm exec tsx scripts/don-customtitle-may-chep.ts --lop=… --apply
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { meaningfulSessionTitle } from "../lib/lms/session-project-name";

const APPLY = process.argv.includes("--apply");
const DAU_VET_NGUOI_MS = 2000;

const maLop = (process.argv.find((a) => a.startsWith("--lop=")) ?? "")
  .slice("--lop=".length)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const duongDump =
  (process.argv.find((a) => a.startsWith("--dump=")) ?? "").slice("--dump=".length) ||
  `docs/ban-giao/dump-customtitle-truoc-khi-don.json`;

/** Xuất CSV nhóm người-gõ để bàn giao Đào tạo. Chạy được ở cả dry-run. */
const duongCsvNguoiGo = (
  process.argv.find((a) => a.startsWith("--csv-nguoi-go=")) ?? ""
).slice("--csv-nguoi-go=".length);

const chuoi = APPLY
  ? (process.env.DATABASE_URL ?? "")
  : (process.env.PROD_READONLY_URL ?? process.env.DATABASE_URL ?? "");

const db = new PrismaClient({ datasources: { db: { url: chuoi } } });
const norm = (s: string | null | undefined) => meaningfulSessionTitle(s).trim().toLowerCase();

async function main() {
  // ── CỔNG 2: không có danh sách lớp thì dừng hẳn.
  if (maLop.length === 0) {
    console.error(
      "DỪNG: thiếu --lop=<mã lớp>[,<mã lớp>…]. Script cố ý KHÔNG có chế độ chạy tất cả.",
    );
    process.exitCode = 1;
    return;
  }
  if (APPLY && !process.env.DATABASE_URL) {
    console.error("DỪNG: --apply cần DATABASE_URL (chuỗi có quyền ghi).");
    process.exitCode = 1;
    return;
  }

  const classes = await db.class.findMany({
    where: { classCode: { in: maLop } },
    select: { id: true, classCode: true, name: true },
  });
  const thieu = maLop.filter((m) => !classes.some((c) => c.classCode === m));
  if (thieu.length) console.error(`⚠️  không thấy lớp: ${thieu.join(", ")}`);
  if (classes.length === 0) {
    process.exitCode = 1;
    return;
  }
  const C = new Map(classes.map((c) => [c.id, c.classCode ?? c.name]));

  const plans = await db.classSessionPlan.findMany({
    where: { classId: { in: classes.map((c) => c.id) } },
    orderBy: [{ classId: "asc" }, { order: "asc" }],
    select: {
      id: true,
      classId: true,
      order: true,
      seq: true,
      customTitle: true,
      lessonId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const lessons = await db.lesson.findMany({ select: { id: true, title: true } });
  const L = new Map(lessons.map((l) => [l.id, l.title]));

  // ── CỔNG 4: tách nhóm người gõ bằng DẤU VẾT, không bằng danh sách id.
  const nguoiGo = plans.filter((p) => +p.updatedAt - +p.createdAt > DAU_VET_NGUOI_MS);
  const idNguoiGo = new Set(nguoiGo.map((p) => p.id));

  const canDon = plans.filter((p) => p.customTitle !== null && !idNguoiGo.has(p.id));

  // Phân loại để báo cáo — không đổi phạm vi dọn, chỉ để người đọc hiểu mình sắp xoá gì.
  const nhom = { oTrong: 0, trung: 0, tenCu: 0 };
  const mauTenCu: string[] = [];
  for (const p of canDon) {
    const a = norm(p.customTitle);
    const b = norm(p.lessonId ? L.get(p.lessonId) : null);
    if (!a) nhom.oTrong++;
    else if (a === b) nhom.trung++;
    else {
      nhom.tenCu++;
      if (mauTenCu.length < 40) {
        mauTenCu.push(
          `${(C.get(p.classId) ?? "?").padEnd(20)} order ${String(p.order).padStart(2)} | ` +
            `${JSON.stringify(p.customTitle)} → ${JSON.stringify(p.lessonId ? L.get(p.lessonId) : null)}`,
        );
      }
    }
  }

  console.log(`Chế độ            : ${APPLY ? "⚠️  APPLY (SẼ GHI)" : "dry-run (không ghi)"}`);
  console.log(`Lớp               : ${classes.map((c) => C.get(c.id)).join(", ")}`);
  console.log(`Plan trong phạm vi: ${plans.length}`);
  console.log(`\nSẼ DỌN (customTitle → NULL): ${canDon.length}`);
  console.log(`   ô trống "Buổi N"      : ${nhom.oTrong}`);
  console.log(`   chép trùng Lesson.title: ${nhom.trung}`);
  console.log(`   tên giáo trình CŨ      : ${nhom.tenCu}  ← đây là nhóm đang che tên đúng`);
  console.log(`\nGIỮ NGUYÊN — có dấu vết NGƯỜI sửa: ${nguoiGo.length}`);
  for (const p of nguoiGo) {
    const gio = Math.round((+p.updatedAt - +p.createdAt) / 3600e3);
    console.log(
      `   ${(C.get(p.classId) ?? "?").padEnd(20)} order ${String(p.order).padStart(2)} | ` +
        `${JSON.stringify(p.customTitle)} | sửa sau khi tạo +${gio}h`,
    );
  }
  if (nhom.tenCu > 0) {
    console.log(`\n— mẫu nhóm "tên giáo trình CŨ" (tối đa 40):`);
    for (const m of mauTenCu) console.log(`   ${m}`);
  }

  // Bàn giao Đào tạo: nhóm người-gõ, để họ xác nhận trước khi ai đó dọn nốt.
  // Sinh từ chính phép phát hiện ở trên nên lần chạy sau tự cập nhật, không phải danh
  // sách chép tay.
  if (duongCsvNguoiGo) {
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const dong = [
      ["ma_lop", "bai_so", "ten_da_go", "ten_bai_giao_trinh_hien_hanh", "sua_sau_khi_tao"]
        .map(q)
        .join(","),
      ...nguoiGo.map((p) =>
        [
          C.get(p.classId) ?? "?",
          String(p.order + 1),
          p.customTitle ?? "",
          (p.lessonId ? L.get(p.lessonId) : null) ?? "",
          `+${Math.round((+p.updatedAt - +p.createdAt) / 3600e3)}h`,
        ]
          .map(q)
          .join(","),
      ),
    ];
    const d = resolve(duongCsvNguoiGo);
    mkdirSync(dirname(d), { recursive: true });
    writeFileSync(d, dong.join("\n") + "\n", "utf8");
    console.log(`\nĐã xuất bàn giao nhóm người-gõ: ${d}`);
  }

  if (!APPLY) {
    console.log(`\n(chưa ghi gì — thêm --apply để chạy thật)`);
    return;
  }

  // ── CỔNG 3: dump TRƯỚC khi ghi. Dump hỏng thì không ghi.
  const duong = resolve(duongDump);
  mkdirSync(dirname(duong), { recursive: true });
  writeFileSync(
    duong,
    JSON.stringify(
      {
        chayLuc: new Date().toISOString(),
        lop: classes.map((c) => C.get(c.id)),
        giuNguyen: nguoiGo.map((p) => ({
          id: p.id,
          lop: C.get(p.classId),
          order: p.order,
          customTitle: p.customTitle,
        })),
        daDon: canDon.map((p) => ({
          id: p.id,
          lop: C.get(p.classId),
          order: p.order,
          seq: p.seq,
          customTitleCu: p.customTitle,
          lessonTitle: p.lessonId ? (L.get(p.lessonId) ?? null) : null,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\nĐã dump giá trị cũ: ${duong}`);

  const r = await db.classSessionPlan.updateMany({
    where: { id: { in: canDon.map((p) => p.id) } },
    data: { customTitle: null },
  });
  console.log(`Đã dọn ${r.count} dòng.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
