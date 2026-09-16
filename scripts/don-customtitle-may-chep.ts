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

/**
 * Quét MỌI lớp có plan.
 *
 * Vì sao cần: phạm vi "3 lớp Sata3" chỉ chạm 144/960 dòng, tức chỉ nhóm đang HỎNG hôm nay.
 * 345 dòng ở 7 lớp khác đang "trùng `Lesson.title`" — vô hại đúng tới lúc Đào tạo đổi tên
 * một bài, rồi lập tức thành tên cũ, đúng ca Sata3 lặp lại. Vá gốc chỉ bảo vệ lớp MỚI.
 *
 * ⚠️ Cờ này KHÔNG nới cổng 2 — nó vẫn phải in ra DANH SÁCH LỚP sẽ chạm và vẫn phải có
 * `--apply` mới ghi. Nó chỉ thay việc gõ 22 mã lớp bằng tay, chứ không thêm chế độ ngầm.
 */
const TAT_CA = process.argv.includes("--tat-ca");

/**
 * Nơi ghi bản sao giá trị cũ. Mặc định nằm dưới `var/` — thư mục đã `.gitignore`.
 *
 * ⚠️ Dump là **nội dung thật của khách hàng**, không được lọt vào repo. `docs/` KHÔNG bị
 * ignore nên script từ chối ghi vào đó (xem `kiemDuongDump`); CSV bàn giao thì được, vì nó
 * chỉ có 2 dòng đã rà tay.
 */
const duongDump =
  (process.argv.find((a) => a.startsWith("--dump=")) ?? "").slice("--dump=".length) ||
  `var/customtitle/dump-truoc-khi-don.json`;

/** Xuất CSV nhóm người-gõ để bàn giao Đào tạo. Chạy được ở cả dry-run. */
const duongCsvNguoiGo = (
  process.argv.find((a) => a.startsWith("--csv-nguoi-go=")) ?? ""
).slice("--csv-nguoi-go=".length);

const chuoi = APPLY
  ? (process.env.DATABASE_URL ?? "")
  : (process.env.PROD_READONLY_URL ?? process.env.DATABASE_URL ?? "");

const db = new PrismaClient({ datasources: { db: { url: chuoi } } });
const norm = (s: string | null | undefined) => meaningfulSessionTitle(s).trim().toLowerCase();

/**
 * Mô tả chuỗi kết nối để người vận hành ĐỐI CHIẾU trước khi gõ `--apply` — **che mật khẩu**.
 * In ra host + cổng + tên database + user, đủ để phân biệt prod với dev mà không lộ gì.
 */
function moTaDich(url: string): string {
  if (!url) return "(TRỐNG — sẽ lỗi)";
  try {
    const u = new URL(url);
    return `${u.username}@${u.hostname}:${u.port || "5432"}${u.pathname} (mật khẩu đã che)`;
  } catch {
    return "(chuỗi không đọc được)";
  }
}

async function main() {
  // ── CỔNG 2: phải nói rõ chạm lớp nào. Không --lop và không --tat-ca thì dừng hẳn.
  if (maLop.length === 0 && !TAT_CA) {
    console.error(
      "DỪNG: thiếu --lop=<mã lớp>[,<mã lớp>…] hoặc --tat-ca.\n" +
        "Script cố ý KHÔNG có phạm vi mặc định — một lần lỡ tay là mất cả bảng.",
    );
    process.exitCode = 1;
    return;
  }
  if (maLop.length > 0 && TAT_CA) {
    console.error("DỪNG: truyền CẢ --lop và --tat-ca thì không rõ ý. Chọn một.");
    process.exitCode = 1;
    return;
  }
  if (APPLY && !process.env.DATABASE_URL) {
    console.error("DỪNG: --apply cần DATABASE_URL (chuỗi có quyền ghi).");
    process.exitCode = 1;
    return;
  }

  // `--tat-ca` = mọi lớp CÓ plan, không phải mọi lớp — lớp không plan thì không có gì để dọn.
  const idCoPlan = TAT_CA
    ? (await db.classSessionPlan.findMany({ distinct: ["classId"], select: { classId: true } })).map(
        (r) => r.classId,
      )
    : [];

  const classes = await db.class.findMany({
    where: TAT_CA ? { id: { in: idCoPlan } } : { classCode: { in: maLop } },
    orderBy: { classCode: "asc" },
    select: { id: true, classCode: true, name: true, status: true, deletedAt: true },
  });
  const thieu = maLop.filter((m) => !classes.some((c) => c.classCode === m));
  if (thieu.length) console.error(`⚠️  không thấy lớp: ${thieu.join(", ")}`);
  if (classes.length === 0) {
    process.exitCode = 1;
    return;
  }
  const C = new Map(classes.map((c) => [c.id, c.classCode ?? c.name]));

  // ── CỔNG 2 (vế hai): --tat-ca vẫn phải BÀY RA từng lớp sẽ chạm, không giấu sau một chữ.
  if (TAT_CA) {
    console.log(`--tat-ca → ${classes.length} lớp CÓ plan sẽ bị chạm:`);
    for (const c of classes) {
      console.log(
        `   ${(c.classCode ?? c.name).padEnd(30)} ${c.status ?? ""}${c.deletedAt ? "  [ĐÃ XOÁ]" : ""}`,
      );
    }
    console.log("");
  }

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
  console.log(`Đích              : ${moTaDich(chuoi)}`);
  console.log(`Lớp               : ${classes.length} lớp`);
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

  // Bảng theo lớp — để người duyệt thấy phân bố, không chỉ một con số tổng.
  const theoLop = new Map<string, { oTrong: number; trung: number; tenCu: number; giu: number }>();
  for (const p of plans) {
    const k = C.get(p.classId) ?? p.classId;
    const r = theoLop.get(k) ?? { oTrong: 0, trung: 0, tenCu: 0, giu: 0 };
    if (idNguoiGo.has(p.id)) r.giu++;
    else if (p.customTitle !== null) {
      const a = norm(p.customTitle);
      const b = norm(p.lessonId ? L.get(p.lessonId) : null);
      if (!a) r.oTrong++;
      else if (a === b) r.trung++;
      else r.tenCu++;
    }
    theoLop.set(k, r);
  }
  console.log(`\n── theo lớp (ô trống / trùng / tên CŨ / GIỮ):`);
  for (const [k, r] of [...theoLop.entries()].sort()) {
    console.log(
      `   ${k.padEnd(30)} ${String(r.oTrong).padStart(3)} / ${String(r.trung).padStart(3)} / ` +
        `${String(r.tenCu).padStart(3)} / ${String(r.giu).padStart(2)}`,
    );
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
  // Chặn ghi dữ liệu prod vào chỗ git theo dõi được — `docs/` không nằm trong .gitignore.
  const tuongDoi = duongDump.replace(/\\/g, "/");
  if (/^docs\//.test(tuongDoi) || /^(app|lib|components|prisma|scripts|tests)\//.test(tuongDoi)) {
    console.error(
      `DỪNG: dump là dữ liệu thật của khách hàng, không ghi vào "${tuongDoi}" — git theo dõi thư mục đó.\n` +
        `Dùng var/… (đã .gitignore) hoặc một đường tuyệt đối ngoài repo.`,
    );
    process.exitCode = 1;
    return;
  }
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
