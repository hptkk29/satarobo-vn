/**
 * BÁO CÁO HIỆN TRẠNG HỌC PHẦN CỦA GIÁO TRÌNH — CHỈ ĐỌC, KHÔNG GHI GÌ.
 *
 *   pnpm exec tsx scripts/bao-cao-hoc-phan.ts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 Chủ dự án 26/09/2026: *"để đúng thì tôi cần chia các khoá học hiện tại thành các học
 * phần luôn, nhưng các khoá học hiện tại trên prod đã up các file scorm rồi không xoá
 * được, hay tạo lại được. làm sao di chuyển các buổi đó vào đúng học phần"*.
 *
 * "Học phần" KHÔNG phải một bảng. Nó là hai cột chữ trên chính buổi học:
 * `Lesson.moduleCode` ("HP1") + `Lesson.moduleName` ("Học phần 1"). Còn SCORM gắn vào
 * `ScormPackage.lessonId`, file nằm ở R2 tại `scorm/{packageId}/` — không dính tới khoá,
 * không dính tới học phần. ⇒ **Gán nhãn học phần KHÔNG đụng một file R2 nào.**
 *
 * Nhưng có MỘT đường làm hỏng, và nó im lặng:
 *   `prisma/seed-curriculum-sata.ts` upsert theo khoá **`(curriculumId, order)`**.
 *   · Nếu `order` của một bài ĐỔI, upsert ghi nội dung bài A vào đúng HÀNG đang giữ bài B.
 *     Hàng giữ nguyên `id`, nên gói SCORM **đi theo hàng** và dính vào nội dung mới.
 *   · Nếu `order` trên prod KHUYẾT SỐ (bài từng bị xoá), upsert sẽ **TẠO HÀNG MỚI** cho số
 *     ấy — bài mới không có SCORM, còn SCORM cũ nằm lại hàng cũ, mồ côi.
 *
 * Báo cáo này đo đúng ba câu quyết định được việc:
 *   A · mỗi giáo trình đang có bao nhiêu buổi, bao nhiêu buổi ĐÃ có học phần, bao nhiêu SCORM;
 *   B · `order` có LIÊN TỤC và DUY NHẤT không — tức seed lại là DÁN NHÃN hay LÀ REMAP;
 *   C · bao nhiêu buổi ĐÃ DẠY đang trỏ vào các bài ấy — tức gán nhãn đổi nhãn hồi tố bao nhiêu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BỐN LỚP KHOÁ (cùng khuôn `bao-cao-doi-soat-tien.ts`, lưới `[BHP-*]` ghim):
 *   · KHÔNG một lệnh `create`/`update`/`delete`/`upsert` nào;
 *   · mọi truy vấn chạy trong `SET TRANSACTION READ ONLY` rồi **ROLLBACK** — Postgres tự
 *     từ chối phép ghi, không phụ thuộc vào việc người viết có nhớ hay không;
 *   · `kiemQuyen` in ra user đang dùng và nó có quyền GHI hay không, ngay dòng đầu báo cáo;
 *   · KHÔNG đọc và KHÔNG in bất kỳ dữ liệu cá nhân nào — báo cáo này chỉ chạm GIÁO TRÌNH
 *     (tên bài là nội dung giảng dạy, không phải dữ liệu của người), và chỉ ĐẾM
 *     `ClassSession`, không đọc học viên hay phụ huynh.
 */
import "./_cho-phep-server-only";
import { currentDbHost } from "./_load-env";
import { writeFileSync } from "node:fs";
import { db } from "../lib/db";
import { kiemQuyen } from "./_kiem-quyen";
import { buildSataCurricula } from "../lib/lms/curriculum-sata";

const ra: string[] = [];
const in_ = (s = "") => {
  ra.push(s);
  console.log(s);
};

/** Bảng markdown — cùng khuôn với các báo cáo chỉ-đọc khác. */
function bang(dong: string[][], tieuDe: string[]) {
  in_(`| ${tieuDe.join(" | ")} |`);
  in_(`|${tieuDe.map(() => "---").join("|")}|`);
  for (const d of dong) in_(`| ${d.join(" | ")} |`);
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function main() {
  in_(`# Hiện trạng HỌC PHẦN của giáo trình — CHỈ ĐỌC`);
  in_();
  const quyen = await kiemQuyen(db);
  in_(
    `**Kết nối:** \`${currentDbHost()}\` · user \`${quyen.nguoiDung}\` · ` +
      `ghi được: **${quyen.ghiDuoc === null ? "không kiểm được" : quyen.ghiDuoc ? "CÓ QUYỀN GHI ⚠️" : "KHÔNG (chỉ đọc)"}**`,
  );
  in_();

  // ⚠️ READ ONLY + ROLLBACK. `$transaction` của Prisma rollback khi callback NÉM; ném một
  // lỗi canh sẵn ở cuối để KHÔNG lượt chạy nào commit được, kể cả khi ai đó lỡ thêm phép ghi.
  const KET = "__BAO_CAO_XONG__";
  let xong = false;
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await phanA(tx);
        await phanB(tx);
        await phanC(tx);
        await phanD(tx);
        xong = true;
        throw new Error(KET);
      },
      // Trần mặc định của transaction TƯƠNG TÁC là 5 giây; báo cáo này quét toàn bộ
      // Lesson/ScormPackage qua WAN sang Supabase. Mọi phép đếm đều gom theo LÔ (không
      // N+1) — con số này chỉ để một transaction ĐỌC không bị cắt giữa đường.
      { timeout: 120_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (!(e instanceof Error) || e.message !== KET) throw e;
  }
  if (!xong) throw new Error("Không dựng được báo cáo");

  writeFileSync("bao-cao-hoc-phan.md", ra.join("\n"), "utf8");
  console.error("\n[ĐÃ GHI] bao-cao-hoc-phan.md");
}

// ═══════════════════════════════════════════════════════════════════════════
// A — MỖI GIÁO TRÌNH: bao nhiêu buổi · bao nhiêu có học phần · bao nhiêu SCORM
// ═══════════════════════════════════════════════════════════════════════════
async function phanA(tx: Tx) {
  in_(`## A · Giáo trình × học phần × SCORM`);
  in_();

  const gt = await tx.curriculum.findMany({
    select: {
      id: true,
      name: true,
      version: true,
      isActive: true,
      course: { select: { slug: true, code: true, totalSessions: true } },
      lessons: {
        select: { id: true, order: true, moduleCode: true, archivedAt: true },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  if (gt.length === 0) {
    in_(`**Không có giáo trình nào.**`);
    in_();
    return;
  }

  // ⚠️ MỘT câu tra cho TOÀN BỘ gói SCORM rồi gom trong bộ nhớ. Tra theo từng giáo trình là
  // N+1 — đúng lớp lỗi đã giết `backfill-orderitem-dry.ts` bằng `P2028` ngay lượt chạy prod
  // đầu tiên (nợ ghim ở CLAUDE.md).
  const goi = await tx.scormPackage.findMany({
    select: { id: true, lessonId: true, status: true, isActiveForLesson: true },
  });
  const goiTheoBuoi = new Map<string, number>();
  for (const g of goi) goiTheoBuoi.set(g.lessonId, (goiTheoBuoi.get(g.lessonId) ?? 0) + 1);

  const dong: string[][] = [];
  for (const c of gt) {
    const song = c.lessons.filter((l) => l.archivedAt === null);
    const coHp = song.filter((l) => l.moduleCode !== null && l.moduleCode !== "").length;
    const soHp = new Set(song.map((l) => l.moduleCode).filter((x) => x)).size;
    const soGoi = c.lessons.reduce((s, l) => s + (goiTheoBuoi.get(l.id) ?? 0), 0);
    dong.push([
      c.name,
      c.course?.slug ?? "—",
      String(c.version),
      c.isActive ? "bật" : "TẮT",
      String(song.length),
      String(c.lessons.length - song.length),
      `${coHp}/${song.length}`,
      String(soHp),
      String(soGoi),
    ]);
  }
  bang(dong, [
    "giáo trình",
    "khoá (slug)",
    "ver",
    "trạng thái",
    "buổi SỐNG",
    "đã lưu trữ",
    "có học phần",
    "số học phần",
    "gói SCORM",
  ]);
  in_();
  in_(
    `**Phép tính:** \`buổi SỐNG\` = \`Lesson\` có \`archivedAt IS NULL\`; \`có học phần\` = ` +
      `\`moduleCode\` khác rỗng; \`gói SCORM\` = số \`ScormPackage\` gắn vào các buổi của giáo trình ` +
      `(kể cả buổi đã lưu trữ — file R2 vẫn tồn tại).`,
  );
  in_();
  in_(
    `Tổng: **${gt.length} giáo trình** · **${gt.reduce((s, c) => s + c.lessons.length, 0)} buổi** · ` +
      `**${goi.length} gói SCORM** (đang bật cho buổi: ${goi.filter((g) => g.isActiveForLesson).length}).`,
  );
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
// B — `order` CÓ LIÊN TỤC VÀ DUY NHẤT KHÔNG (quyết định seed lại là DÁN NHÃN hay REMAP)
// ═══════════════════════════════════════════════════════════════════════════
async function phanB(tx: Tx) {
  in_(`## B · \`order\` có liên tục không — seed lại là DÁN NHÃN hay REMAP?`);
  in_();
  in_(
    `Seed upsert theo \`(curriculumId, order)\`. \`order\` liên tục \`1..N\` ⇒ mỗi bài trong nguồn ` +
      `rơi đúng vào hàng đang giữ nó ⇒ chỉ đổi mấy cột chữ, **SCORM không xê dịch**. ` +
      `\`order\` KHUYẾT SỐ ⇒ upsert **TẠO HÀNG MỚI** cho số khuyết: bài mới không có SCORM, ` +
      `còn gói cũ nằm lại hàng cũ — mồ côi, và không lỗi nào báo.`,
  );
  in_();

  const gt = await tx.curriculum.findMany({
    select: {
      name: true,
      lessons: { select: { order: true, archivedAt: true }, orderBy: { order: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  const dong: string[][] = [];
  for (const c of gt) {
    const song = c.lessons.filter((l) => l.archivedAt === null).map((l) => l.order);
    if (song.length === 0) {
      dong.push([c.name, "0", "—", "—", "— (không có buổi sống)"]);
      continue;
    }
    const min = Math.min(...song);
    const max = Math.max(...song);
    const khuyet: number[] = [];
    for (let i = 1; i <= max; i += 1) if (!song.includes(i)) khuyet.push(i);
    const lienTuc = min === 1 && khuyet.length === 0;
    dong.push([
      c.name,
      String(song.length),
      `${min}..${max}`,
      khuyet.length === 0 ? "—" : khuyet.slice(0, 12).join(", ") + (khuyet.length > 12 ? "…" : ""),
      lienTuc ? "✅ dán nhãn được" : "⚠️ SEED SẼ TẠO HÀNG MỚI",
    ]);
  }
  bang(dong, ["giáo trình", "buổi sống", "khoảng order", "số KHUYẾT", "seed lại nghĩa là gì"]);
  in_();
  in_(
    `⚠️ \`order\` KHÔNG thể TRÙNG trong cùng giáo trình — schema có \`@@unique([curriculumId, order])\`. ` +
      `Nên chỉ cần soi số KHUYẾT.`,
  );
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
// C — GÁN NHÃN ĐỔI NHÃN HỒI TỐ BAO NHIÊU BUỔI ĐÃ DẠY
// ═══════════════════════════════════════════════════════════════════════════
async function phanC(tx: Tx) {
  in_(`## C · Đổi học phần là đổi nhãn HỒI TỐ — bao nhiêu buổi đã dạy bị ảnh hưởng`);
  in_();
  in_(
    `\`ClassSession.lessonId\` trỏ thẳng vào \`Lesson\`, và nhãn buổi / tên gửi phụ huynh suy ra ` +
      `từ \`moduleCode\` (\`deriveSessionLabel\`). Đổi học phần ⇒ **buổi ĐÃ DẠY cũng đổi nhãn**, ` +
      `kể cả phiếu nhận xét đã gửi. Không mất dữ liệu, nhưng phụ huynh mở lại sẽ thấy tên khác.`,
  );
  in_();

  const [tong, coBai, theoTrangThai] = await Promise.all([
    tx.classSession.count(),
    tx.classSession.count({ where: { lessonId: { not: null } } }),
    tx.classSession.groupBy({
      by: ["status"],
      where: { lessonId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  bang(
    [
      ["Tổng buổi lớp", String(tong)],
      ["Có gắn bài (`lessonId` khác null)", String(coBai)],
      ...theoTrangThai
        .sort((a, b) => b._count._all - a._count._all)
        .map((r) => [`  · trạng thái \`${r.status}\``, String(r._count._all)]),
    ],
    ["mục", "số buổi"],
  );
  in_();
  in_(
    `**Con số cần nhìn:** buổi đã \`COMPLETED\` mà có gắn bài — đó chính là tập sẽ đổi nhãn hồi tố.`,
  );
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
// D — PROD so với NGUỒN (`lib/lms/curriculum-sata.ts`)
// ═══════════════════════════════════════════════════════════════════════════
async function phanD(tx: Tx) {
  in_(`## D · Prod so với NGUỒN giáo trình trong mã`);
  in_();
  in_(
    `Nguồn là \`lib/lms/curriculum-sata.ts\` (sinh từ 2 file marketing) — \`prisma/seed-curriculum-sata.ts\` ` +
      `ghi đè \`moduleCode\` mỗi lần chạy. Sửa tay trên DB **sẽ bị xoá**; chỗ sửa bền là NGUỒN.`,
  );
  in_();

  const trongMa = buildSataCurricula().map((bp) => ({
    slug: bp.courseSlug,
    ten: bp.name,
    soBuoi: bp.lessons.length,
    soHp: new Set(bp.lessons.map((l) => l.moduleCode).filter((x) => x)).size,
  }));

  // ⚠️ Tra TOÀN BỘ khoá, KHÔNG lọc theo `slug in (...)`.
  //
  // Lọc sẵn thì khoá nào không khớp chỉ ra "không thấy" — một câu vô dụng, vì nó không
  // phân biệt được "khoá chưa tồn tại" với "khoá CÓ nhưng slug viết khác". Đo local
  // 26/09: nguồn sinh `sata3` / `combo-luyen-thi` (`courseSlugFor` = `toLowerCase()`)
  // trong khi DB có `sata-3` / `combo-1-2` — lệch DẤU GẠCH. Seed chạy vào đó thì không
  // nối được giáo trình nào, và nó KHÔNG kêu.
  const khoa = await tx.course.findMany({
    select: {
      slug: true,
      name: true,
      curriculums: { select: { name: true, lessons: { select: { id: true } } } },
    },
    orderBy: { slug: "asc" },
  });
  const theoSlug = new Map(khoa.map((k) => [k.slug, k]));

  const dong: string[][] = [];
  for (const m of trongMa) {
    const k = theoSlug.get(m.slug);
    const soGtProd = k?.curriculums.length ?? 0;
    const soBuoiProd = k?.curriculums.reduce((s, c) => s + c.lessons.length, 0) ?? 0;
    const khop = soBuoiProd === m.soBuoi && soGtProd === 1;
    dong.push([
      m.slug,
      `${m.soBuoi} buổi · ${m.soHp === 0 ? "KHÔNG chia" : `${m.soHp} học phần`}`,
      k ? `${soGtProd} giáo trình · ${soBuoiProd} buổi` : "❌ KHÔNG THẤY KHOÁ",
      khop ? "✅ khớp" : "⚠️ LỆCH",
    ]);
  }
  bang(dong, ["khoá (slug) NGUỒN tìm", "NGUỒN sinh ra", "DB đang có", "khớp?"]);
  in_();
  in_(
    `⚠️ Dòng **LỆCH** nghĩa là chạy \`seed-curriculum-sata.ts\` KHÔNG phải một lượt dán nhãn — ` +
      `nó sẽ thêm/đổi bài, hoặc không nối được gì cả. Quyết định từng dòng một, đừng chạy ` +
      `seed cho cả lượt.`,
  );
  in_();

  // Đối chiếu SLUG — thứ duy nhất nối nguồn với DB.
  const thieu = trongMa.filter((m) => !theoSlug.has(m.slug)).map((m) => m.slug);
  if (thieu.length > 0) {
    in_(`### D2 · Slug nguồn KHÔNG khớp slug trong DB`);
    in_();
    in_(`Nguồn tìm: ${thieu.map((x) => `\`${x}\``).join(" · ")}`);
    in_();
    in_(`DB đang có ${khoa.length} khoá:`);
    in_();
    bang(
      khoa.map((k) => [`\`${k.slug}\``, k.name, String(k.curriculums.length)]),
      ["slug trong DB", "tên khoá", "số giáo trình"],
    );
    in_();
    in_(
      `⚠️ \`courseSlugFor\` sinh slug bằng \`productCode.toLowerCase()\` (\`"Sata3"\` → ` +
        `\`sata3\`). Nếu DB dùng \`sata-3\` thì seed **không nối được giáo trình nào** — và nó ` +
        `KHÔNG báo lỗi. Đây là thứ phải chốt TRƯỚC khi bàn tới học phần.`,
    );
    in_();
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
