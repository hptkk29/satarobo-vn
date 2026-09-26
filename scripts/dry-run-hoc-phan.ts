/**
 * DRY-RUN: chạy `seed-curriculum-sata.ts` sẽ đổi ĐÚNG NHỮNG GÌ trên prod.
 * CHỈ ĐỌC — KHÔNG GHI GÌ.
 *
 *   pnpm exec tsx scripts/dry-run-hoc-phan.ts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 Chủ dự án 26/09/2026 chốt cách chia: *"sata1, sata2 gồm 1 học phần 16 bài; sata
 * 3,4,5,6,7 gồm 4 học phần mỗi học phần 12 bài; Combo Luyện thi gồm 2 học phần mỗi học
 * phần 16 bài (16 bài đầu của sata1, 16 bài sau của sata2); sata8: 1 học phần 5 buổi"*.
 *
 * ⚠️ VÌ SAO BÁO CÁO NÀY KHÔNG CHỈ NÓI VỀ HỌC PHẦN.
 *
 * Nhánh `update` của seed ghi đè **NĂM cột**, không phải một:
 *     title · moduleCode · moduleName · description · objectives
 * ⇒ Chạy seed không chỉ gán học phần — nó **viết lại TÊN của mọi bài** theo nguồn. Tên bài
 * là chuỗi đi tới nhãn buổi và (sau khi cắt tiền tố học phần) tới phiếu gửi PHỤ HUYNH.
 * Nếu Đào tạo từng sửa tên trên prod, lượt seed sẽ xoá công sức ấy **và không báo gì**.
 *
 * Nên báo cáo chia thẳng ba nhóm, theo đúng mức phải soi:
 *   ① chỉ GÁN HỌC PHẦN (tên y nguyên)      — đúng thứ chủ dự án yêu cầu, an toàn;
 *   ② ĐỔI CẢ TÊN BÀI                        — phải đọc từng dòng trước khi bấm;
 *   ③ TẠO BÀI MỚI / LƯU TRỮ BÀI THỪA        — seed đụng cấu trúc, không chỉ nhãn.
 *
 * Và một cột riêng: bài đó có GÓI SCORM không. Gói bám `Lesson.id`, mà `id` không đổi khi
 * upsert trúng hàng — nên SCORM an toàn. Nhưng nếu TÊN BÀI đổi thì gói vẫn nằm đúng hàng
 * trong khi hàng ấy nay mang nội dung khác: file không mất, mà ý nghĩa thì lệch.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BỐN LỚP KHOÁ — giống hệt `bao-cao-hoc-phan.ts`, lưới `[DRH-*]` ghim.
 */
import "./_cho-phep-server-only";
import { currentDbHost } from "./_load-env";
import { writeFileSync } from "node:fs";
import { db } from "../lib/db";
import { kiemQuyen } from "./_kiem-quyen";
import { buildSataCurricula } from "../lib/lms/curriculum-sata";
import { isPlaceholderTitle } from "../lib/lms/curriculum-merge";
import { NHAN_DOI_TEN, phanLoaiDoiTen, type LoaiDoiTen } from "../lib/lms/doi-ten-bai";

const ra: string[] = [];
const in_ = (s = "") => {
  ra.push(s);
  console.log(s);
};

function bang(dong: string[][], tieuDe: string[]) {
  in_(`| ${tieuDe.join(" | ")} |`);
  in_(`|${tieuDe.map(() => "---").join("|")}|`);
  for (const d of dong) in_(`| ${d.join(" | ")} |`);
}

/** Ô bảng markdown: `|` trong tên bài sẽ phá bảng. */
function o(s: string | null): string {
  return (s ?? "—").replace(/\|/g, "\\|");
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

type Doi = {
  slug: string;
  order: number;
  tenCu: string;
  tenMoi: string;
  hpCu: string | null;
  hpMoi: string | null;
  coScorm: number;
};

async function main() {
  in_(`# DRY-RUN · seed giáo trình sẽ đổi những gì — CHỈ ĐỌC`);
  in_();
  const quyen = await kiemQuyen(db);
  in_(
    `**Kết nối:** \`${currentDbHost()}\` · user \`${quyen.nguoiDung}\` · ` +
      `ghi được: **${quyen.ghiDuoc === null ? "không kiểm được" : quyen.ghiDuoc ? "CÓ QUYỀN GHI ⚠️" : "KHÔNG (chỉ đọc)"}**`,
  );
  in_();
  in_(
    `⚠️ Báo cáo này **không ghi gì**. Nó dựng lại đúng phép \`upsert\` của ` +
      `\`prisma/seed-curriculum-sata.ts\` rồi in ra TRƯỚC → SAU.`,
  );
  in_();

  const KET = "__DRY_RUN_XONG__";
  let xong = false;
  let tongThayDoi = -1;
  try {
    await db.$transaction(
      async (tx) => {
        tongThayDoi = await chay(tx);
        xong = true;
        throw new Error(KET);
      },
      { timeout: 120_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (!(e instanceof Error) || e.message !== KET) throw e;
  }
  if (!xong) throw new Error("Không dựng được báo cáo");

  // ⚠️ DÒNG MỐC CHO BƯỚC NGHIỆM THU — `grep` được.
  //
  // Workflow GHI chạy lại đúng báo cáo này SAU khi seed và đòi thấy `TONG THAY DOI: 0 bai`.
  // Không có dòng mốc thì bước "nghiệm thu" chỉ là một lời hứa: seed xong, không ai kiểm
  // lại, và một lượt ghi hụt trông y hệt một lượt ghi đủ.
  //
  // KHÔNG dấu tiếng Việt: `grep -q` trong runner so theo byte và một dòng có dấu rất dễ
  // trượt vì lệch locale — thứ làm cổng nghiệm thu đỏ vì lý do sai.
  in_();
  in_(`TONG THAY DOI: ${tongThayDoi} bai`);
  in_();

  writeFileSync("dry-run-hoc-phan.md", ra.join("\n"), "utf8");
  console.error("\n[ĐÃ GHI] dry-run-hoc-phan.md");
}

async function chay(tx: Tx): Promise<number> {
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;

  const nguon = buildSataCurricula();

  // ⚠️ Gom TẤT CẢ theo lô — không N+1. Tra theo từng giáo trình là đúng lớp lỗi đã giết
  // `backfill-orderitem-dry.ts` bằng `P2028` ngay lượt chạy prod đầu tiên.
  const khoa = await tx.course.findMany({
    where: { slug: { in: nguon.map((n) => n.courseSlug) } },
    select: {
      slug: true,
      curriculums: {
        select: {
          id: true,
          name: true,
          lessons: {
            select: { id: true, order: true, title: true, moduleCode: true, archivedAt: true },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });
  const goi = await tx.scormPackage.findMany({ select: { lessonId: true } });
  const scormTheoBuoi = new Map<string, number>();
  for (const g of goi) scormTheoBuoi.set(g.lessonId, (scormTheoBuoi.get(g.lessonId) ?? 0) + 1);

  const theoSlug = new Map(khoa.map((k) => [k.slug, k]));

  /** Khoá nào bị seed THƯỜNG bỏ qua (có bài mang tên do người soạn). */
  const boQuaNeuKhongForce: { slug: string; soBaiNguoiSoan: number; tong: number; vd: string }[] =
    [];

  const chiHocPhan: Doi[] = [];
  const doiTen: Doi[] = [];
  const taoMoi: Doi[] = [];
  const luuTru: { slug: string; order: number; ten: string; coScorm: number }[] = [];
  const khongThayKhoa: string[] = [];
  const nhieuGiaoTrinh: string[] = [];

  for (const bp of nguon) {
    const k = theoSlug.get(bp.courseSlug);
    if (!k) {
      khongThayKhoa.push(bp.courseSlug);
      continue;
    }
    if (k.curriculums.length !== 1) {
      // ⚠️ Seed `upsert` Curriculum theo `(courseId, version)`. Khoá có ≠1 giáo trình là
      // hình dạng seed KHÔNG lường trước — dừng tay, không đoán.
      nhieuGiaoTrinh.push(`${bp.courseSlug} (${k.curriculums.length} giáo trình)`);
      continue;
    }
    const cur = k.curriculums[0]!;
    const theoOrder = new Map(cur.lessons.map((l) => [l.order, l]));

    // ⚠️ CỔNG "TÊN DO NGƯỜI SOẠN" của seed — `prisma/seed-curriculum-sata.ts:71`.
    //
    // Seed THƯỜNG chỉ ghi khi giáo trình TOÀN ô trống dạng `"Buổi N"`; có bài mang tên
    // thật thì nó **BỎ QUA CẢ KHOÁ** và đi tiếp. Tên trên prod là `"HP1 - Bàn tay ma
    // thuật"` ⇒ chạy seed thường **không ghi một dòng nào**.
    //
    // Không dựng lại cổng này ở đây thì báo cáo NÓI QUÁ: nó in ra thứ chỉ xảy ra với
    // `--force`, trong khi người đọc lại tưởng đó là kết quả của lệnh seed bình thường.
    const nguoiSoan = cur.lessons.filter((l) => !isPlaceholderTitle(l.title, l.order));
    if (nguoiSoan.length > 0) {
      boQuaNeuKhongForce.push({
        slug: bp.courseSlug,
        soBaiNguoiSoan: nguoiSoan.length,
        tong: cur.lessons.length,
        vd: nguoiSoan[0]!.title,
      });
    }

    for (const l of bp.lessons) {
      const cu = theoOrder.get(l.order);
      const coScorm = cu ? (scormTheoBuoi.get(cu.id) ?? 0) : 0;
      const d: Doi = {
        slug: bp.courseSlug,
        order: l.order,
        tenCu: cu?.title ?? "(chưa có)",
        tenMoi: l.title,
        hpCu: cu?.moduleCode ?? null,
        hpMoi: l.moduleCode,
        coScorm,
      };
      if (!cu) taoMoi.push(d);
      else if (cu.title !== l.title) doiTen.push(d);
      else if (cu.moduleCode !== l.moduleCode) chiHocPhan.push(d);
    }

    // Bài THỪA so với nguồn → seed lưu trữ mềm (`archivedAt`).
    for (const cu of cur.lessons) {
      if (cu.order > bp.lessons.length && cu.archivedAt === null) {
        luuTru.push({
          slug: bp.courseSlug,
          order: cu.order,
          ten: cu.title,
          coScorm: scormTheoBuoi.get(cu.id) ?? 0,
        });
      }
    }
  }

  // ── TÓM TẮT ────────────────────────────────────────────────────────────────
  // ── ⓪ CHẠY SEED KIỂU NÀO ───────────────────────────────────────────────────
  const daDoiChieu = nguon.length - khongThayKhoa.length - nhieuGiaoTrinh.length;

  in_(`## ⓪ Hai cách chạy seed — KHÁC NHAU HOÀN TOÀN`);
  in_();
  if (daDoiChieu === 0) {
    // ⚠️ Không đối chiếu được khoá nào thì KHÔNG có căn cứ nói seed thường ghi được.
    // Im lặng khẳng định điều tốt ở đây là đúng kiểu báo cáo nói dối mà vẫn 'sạch'.
    in_(`🔴 **Chưa đối chiếu được khoá nào** — không kết luận được seed thường ghi hay bỏ qua.`);
  } else if (boQuaNeuKhongForce.length === 0) {
    in_(
      `Không giáo trình nào có bài mang tên do người soạn ⇒ seed **thường** cũng ghi được, ` +
        `không cần \`--force\`.`,
    );
  } else {
    in_(
      `🔴 **Seed THƯỜNG sẽ KHÔNG GHI GÌ.** Cổng \`isPlaceholderTitle\` ` +
        `(\`seed-curriculum-sata.ts:71\`) chỉ cho ghi khi giáo trình TOÀN ô trống dạng ` +
        `\`"Buổi N"\`; có bài mang tên thật thì nó **bỏ qua cả khoá**.`,
    );
    in_();
    bang(
      boQuaNeuKhongForce.map((x) => [
        x.slug,
        `${x.soBaiNguoiSoan}/${x.tong}`,
        o(x.vd),
        "⏭ BỎ QUA nếu không `--force`",
      ]),
      ["khoá", "bài mang tên người soạn", "ví dụ", "seed thường làm gì"],
    );
    in_();
    in_(
      `⇒ **Mọi con số bên dưới là của \`--force\`.** Đó là cờ ghi đè cổng vừa nói, và nó ` +
        `tồn tại vì \`Lesson.title\` không có bản sao nào để lùi.`,
    );
  }
  in_();

  in_(`## Tóm tắt — bấm seed \`--force\` thì đụng bao nhiêu`);
  in_();

  // ⚠️ ĐỘ PHỦ ĐỨNG TRƯỚC MỌI CON SỐ.
  //
  // Không có dòng này thì một lượt chạy đối chiếu được 0/9 khoá vẫn in ra bảng toàn số 0
  // kèm chữ "an toàn" — đọc lướt thành "chạy seed được". Đúng lớp lỗi mà `[SB-FLAG]` đã
  // trả giá: một kết quả "sạch" và một tính năng CHẾT HẲN trông y hệt nhau.
  if (daDoiChieu < nguon.length) {
    in_(
      `🔴 **CHỈ đối chiếu được ${daDoiChieu}/${nguon.length} khoá.** Mọi con số dưới đây ` +
        `CHỈ nói về ${daDoiChieu} khoá ấy — đừng đọc chúng như thể đã phủ hết.`,
    );
  } else {
    in_(`Đã đối chiếu **đủ ${daDoiChieu}/${nguon.length} khoá**.`);
  }
  in_();

  bang(
    [
      ["① Chỉ GÁN HỌC PHẦN (tên y nguyên)", String(chiHocPhan.length), "an toàn"],
      ["② ĐỔI CẢ TÊN BÀI", String(doiTen.length), doiTen.length > 0 ? "⚠️ đọc từng dòng" : "—"],
      ["③ TẠO BÀI MỚI", String(taoMoi.length), taoMoi.length > 0 ? "⚠️ đụng cấu trúc" : "—"],
      ["④ LƯU TRỮ bài thừa", String(luuTru.length), luuTru.length > 0 ? "⚠️ đụng cấu trúc" : "—"],
    ],
    ["nhóm", "số bài", "mức phải soi"],
  );
  in_();
  const scormDoiTen = doiTen.filter((d) => d.coScorm > 0).length;
  in_(
    `Trong nhóm ② có **${scormDoiTen} bài đang mang gói SCORM**. Gói bám \`Lesson.id\` nên ` +
      `KHÔNG mất và KHÔNG phải up lại — nhưng hàng ấy sẽ mang tên khác, tức nội dung gói và ` +
      `tên bài lệch nhau.`,
  );
  in_();

  if (khongThayKhoa.length > 0) {
    in_(`⚠️ **Không thấy khoá cho slug:** ${khongThayKhoa.map((s) => `\`${s}\``).join(" · ")}`);
    in_();
  }
  if (nhieuGiaoTrinh.length > 0) {
    in_(
      `⚠️ **Khoá có số giáo trình ≠ 1, BỎ QUA (không đoán):** ${nhieuGiaoTrinh.join(" · ")}`,
    );
    in_();
  }

  // ── ① ──────────────────────────────────────────────────────────────────────
  in_(`## ① Chỉ gán học phần — tên bài y nguyên`);
  in_();
  if (chiHocPhan.length === 0) {
    in_(`Không có bài nào.`);
  } else {
    // Gộp theo (khoá, HP cũ → HP mới) — 272 dòng thì không ai đọc hết, mà nhóm thì đọc được.
    const gom = new Map<string, number[]>();
    for (const d of chiHocPhan) {
      const k = `${d.slug}|${d.hpCu ?? "—"}|${d.hpMoi ?? "—"}`;
      (gom.get(k) ?? gom.set(k, []).get(k)!).push(d.order);
    }
    bang(
      [...gom.entries()].map(([k, orders]) => {
        const [slug, cu, moi] = k.split("|");
        const min = Math.min(...orders);
        const max = Math.max(...orders);
        return [slug!, `${cu} → **${moi}**`, String(orders.length), `buổi ${min}..${max}`];
      }),
      ["khoá", "học phần", "số bài", "khoảng buổi"],
    );
  }
  in_();

  // ── ② ──────────────────────────────────────────────────────────────────────
  in_(`## ② ĐỔI TÊN BÀI — phân loại HẾT, không cắt bảng`);
  in_();
  if (doiTen.length === 0) {
    in_(`✅ Không bài nào đổi tên. Lượt seed này **chỉ gán học phần**.`);
  } else {
    // ⚠️ PHÂN LOẠI, KHÔNG IN BẢNG DÀI RỒI CẮT [sửa 26/09/2026].
    //
    // Bản đầu in bảng và `slice(0, 200)` — tức 40 dòng cuối KHÔNG AI NHÌN, mà dòng nguy
    // hiểm thì chẳng có lý do gì phải nằm trong 200 dòng đầu. Một bảng 240 dòng cũng
    // không ai đọc hết, nên "đã in ra" không bằng "đã đọc".
    //
    // Thứ người quyết CẦN biết không phải "240 dòng đổi", mà **có dòng nào đổi NỘI DUNG
    // không**. Phép phân loại ở `lib/lms/doi-ten-bai.ts` (bộ ca `[DTB-*]`).
    const theoLoai = new Map<LoaiDoiTen, typeof doiTen>();
    for (const d of doiTen) {
      const loai = phanLoaiDoiTen(d.tenCu, d.tenMoi).loai;
      (theoLoai.get(loai) ?? theoLoai.set(loai, []).get(loai)!).push(d);
    }
    const noiDung = theoLoai.get("doi-noi-dung") ?? [];

    bang(
      [...theoLoai.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([loai, ds]) => [
          NHAN_DOI_TEN[loai],
          String(ds.length),
          String(ds.filter((d) => d.coScorm > 0).length),
        ]),
      ["nhóm", "số bài", "trong đó có SCORM"],
    );
    in_();
    in_(
      `**Tổng ${doiTen.length} bài** — và phép cộng phải khớp: ` +
        `${[...theoLoai.values()].reduce((s, x) => s + x.length, 0)}.`,
    );
    in_();

    // ⚠️ Nhóm ĐỔI NỘI DUNG in ĐỦ, KHÔNG BAO GIỜ cắt. Đây là nhóm duy nhất phải đọc từng
    // dòng: tên bài đi tới nhãn buổi và tới phiếu gửi PHỤ HUYNH, và `Lesson.title` là bản
    // DUY NHẤT — không có đường lùi.
    in_(`### ②a · ĐỔI NỘI DUNG — in ĐỦ, không cắt`);
    in_();
    if (noiDung.length === 0) {
      in_(`✅ **Không bài nào đổi nội dung.** Cả ${doiTen.length} bài chỉ là dọn hình thức.`);
    } else {
      bang(
        noiDung.map((d) => [
          d.slug,
          String(d.order),
          o(d.tenCu),
          o(d.tenMoi),
          d.coScorm > 0 ? `⚠️ ${d.coScorm}` : "—",
        ]),
        ["khoá", "buổi", "tên HIỆN TẠI", "tên SAU khi seed", "SCORM"],
      );
    }
    in_();

    // Nhóm hình thức chỉ cần MẪU — đọc 10 dòng là hiểu hình dạng của cả nhóm.
    in_(`### ②b · Dọn hình thức — mẫu 10 dòng mỗi nhóm`);
    in_();
    for (const [loai, ds] of theoLoai) {
      if (loai === "doi-noi-dung") continue;
      in_(`**${NHAN_DOI_TEN[loai]}** — ${ds.length} bài:`);
      in_();
      bang(
        ds.slice(0, 10).map((d) => [d.slug, String(d.order), o(d.tenCu), o(d.tenMoi)]),
        ["khoá", "buổi", "tên HIỆN TẠI", "tên SAU khi seed"],
      );
      in_();
    }
  }
  in_();

  // ── ③ ④ ────────────────────────────────────────────────────────────────────
  const tongThayDoi = chiHocPhan.length + doiTen.length + taoMoi.length + luuTru.length;

  in_(`## ③ Tạo bài mới · ④ Lưu trữ bài thừa`);
  in_();
  if (taoMoi.length === 0 && luuTru.length === 0) {
    in_(`✅ Không bài nào bị tạo mới hay lưu trữ — seed không đụng cấu trúc giáo trình.`);
  } else {
    if (taoMoi.length > 0) {
      bang(
        taoMoi.map((d) => [d.slug, String(d.order), o(d.tenMoi)]),
        ["khoá", "buổi", "tên bài SẼ TẠO"],
      );
      in_();
    }
    if (luuTru.length > 0) {
      in_("Bài sẽ bị **lưu trữ mềm** (`archivedAt`, không xoá):");
      in_();
      bang(
        luuTru.map((d) => [d.slug, String(d.order), o(d.ten), d.coScorm > 0 ? `⚠️ ${d.coScorm}` : "—"]),
        ["khoá", "buổi", "tên bài", "SCORM"],
      );
    }
  }
  in_();

  return tongThayDoi;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
