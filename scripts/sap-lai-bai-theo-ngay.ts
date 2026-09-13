/**
 * Gán lại BÀI cho từng buổi theo **thứ tự NGÀY** — vá gốc của sự cố "lệch tên bài".
 *
 * ══ Vì sao cần, và vì sao bản vá trước KHÔNG đủ ══
 *
 * Đợt 1/1b/1c đã vá phần HIỂN THỊ: nhãn buổi nay in số LỘ TRÌNH (bài thứ mấy của giáo trình)
 * thay vì hạng-theo-ngày. Nhưng đó là làm cho hệ thống **nói thật về một dữ liệu vẫn hỏng**.
 *
 * Dữ liệu hỏng thế nào — đo prod 13/09, lớp `CS2.SATA6.26.001`, số BÀI xếp theo NGÀY:
 *
 *     1, 43, 2, 44, 3, 45, 4, 46, 5, 47, 6, 48, 7, 8, …
 *
 * Lớp học Thứ 7 hằng tuần, xen 6 buổi Thứ 5. Sáu buổi Thứ 5 đó được gán **bài 43–48** —
 * tức các bài CUỐI khoá — trong khi lớp mới đang học bài 1–6. Giáo viên mở buổi 25/06 ra thì
 * hệ thống bảo dạy "HP4 - Chạy tổng hợp nhiệm vụ", còn cả lớp đang ở HP1.
 *
 * Script này sắp lại: buổi thứ N theo NGÀY nhận BÀI thứ N của giáo trình.
 *
 * ⚠️ CHỦ DỰ ÁN CHỐT 13/09 — phương án (a): sắp lại **TẤT CẢ**, kể cả buổi ĐÃ DẠY.
 * Phương án (b) "chỉ sắp buổi chưa diễn ra" đã bị loại vì 10/21 chỗ gãy nằm ở buổi đã dạy;
 * giữ chúng thì lớp Sata6 mãi hiện `1, 43, 2, 44…`.
 * Hệ quả phải biết: học bạ / phiếu nhận xét đã gửi phụ huynh sẽ đổi tên bài kèm theo.
 *
 * ══ BỐN CỔNG AN TOÀN ══
 *
 *  1. `--dry-run` là MẶC ĐỊNH. Chỉ ghi khi có `--apply`.
 *  2. Phạm vi phải khai tường minh: `--lop=<mã>[,<mã>…]` hoặc `--tat-ca`. Không có mặc định.
 *  3. DUMP `(sessionId → planId, lessonId)` cũ ra JSON TRƯỚC khi ghi. Không dump được thì
 *     không ghi. Đây là thứ duy nhất để quay lui.
 *  4. BỎ QUA lớp có hình dạng lạ (buổi không có plan · plan không có lesson · số buổi > số
 *     plan). Script này chỉ làm một việc rất hẹp: hoán vị thứ tự. Gặp lớp cần suy đoán thì
 *     nó dừng tay và báo, chứ không đoán.
 *
 * ══ CHẠY ══
 *
 *   # xem trước (mặc định, không ghi gì)
 *   PROD_READONLY_URL='postgresql://…:5432/…' pnpm exec tsx scripts/sap-lai-bai-theo-ngay.ts --tat-ca
 *
 *   # ghi thật
 *   DATABASE_URL='<prod quyền ghi>' pnpm exec tsx scripts/sap-lai-bai-theo-ngay.ts --tat-ca --apply
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const TAT_CA = process.argv.includes("--tat-ca");

const maLop = (process.argv.find((a) => a.startsWith("--lop=")) ?? "")
  .slice("--lop=".length)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const duongDump =
  (process.argv.find((a) => a.startsWith("--dump=")) ?? "").slice("--dump=".length) ||
  "var/sap-lai-bai/dump-truoc-khi-sap.json";

const chuoi = APPLY
  ? (process.env.DATABASE_URL ?? "")
  : (process.env.PROD_READONLY_URL ?? process.env.DATABASE_URL ?? "");

const db = new PrismaClient({ datasources: { db: { url: chuoi } } });

function moTaDich(url: string): string {
  if (!url) return "(TRỐNG — sẽ lỗi)";
  try {
    const u = new URL(url);
    return `${u.username}@${u.hostname}:${u.port || "5432"}${u.pathname} (mật khẩu đã che)`;
  } catch {
    return "(chuỗi không đọc được)";
  }
}

type DongDump = {
  sessionId: string;
  lop: string;
  ngay: string;
  planIdCu: string | null;
  lessonIdCu: string | null;
  planIdMoi: string;
  lessonIdMoi: string | null;
  baiCu: number | null;
  baiMoi: number;
};

async function main() {
  if (maLop.length === 0 && !TAT_CA) {
    console.error("DỪNG: thiếu --lop=<mã lớp>[,…] hoặc --tat-ca. Script cố ý KHÔNG có phạm vi mặc định.");
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
  if (classes.length === 0) {
    console.error("DỪNG: không thấy lớp nào.");
    process.exitCode = 1;
    return;
  }

  console.log(`Chế độ            : ${APPLY ? "⚠️  APPLY (SẼ GHI)" : "dry-run (không ghi)"}`);
  console.log(`Đích              : ${moTaDich(chuoi)}`);
  console.log(`Lớp trong phạm vi : ${classes.length}\n`);

  const canGhi: DongDump[] = [];
  const boQua: string[] = [];
  let lopDoiThuTu = 0;

  for (const cls of classes) {
    const ma = cls.classCode ?? cls.name;
    const [ss, ps] = await Promise.all([
      db.classSession.findMany({
        where: { classId: cls.id },
        select: { id: true, date: true, status: true, planId: true, lessonId: true },
      }),
      db.classSessionPlan.findMany({
        where: { classId: cls.id },
        orderBy: { order: "asc" },
        select: { id: true, order: true, lessonId: true },
      }),
    ]);

    // ── CỔNG 4: hình dạng lạ thì DỪNG TAY, không đoán.
    const huy = ss.filter((s) => s.status === "CANCELLED");
    const chay = ss.filter((s) => s.status !== "CANCELLED");
    if (ps.length === 0) {
      boQua.push(`${ma}: không có plan nào`);
      continue;
    }
    if (chay.length > ps.length) {
      boQua.push(`${ma}: ${chay.length} buổi > ${ps.length} plan — không đủ bài để gán`);
      continue;
    }
    if (ps.some((p) => !p.lessonId)) {
      boQua.push(`${ma}: có plan KHÔNG gắn bài`);
      continue;
    }

    const xep = chay.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
    const P = new Map(ps.map((p) => [p.id, p]));

    // ⚠️ HOÁN VỊ, không phải "gán lại 1..N".
    //
    // Lấy đúng tập plan ĐANG ĐƯỢC GÁN cho lớp này, sắp theo `order`, rồi phát lại theo thứ
    // tự NGÀY. Việc duy nhất script làm là sửa chỗ GÃY.
    //
    // Vì sao không gán thẳng `ps[i]` (bài thứ i của giáo trình): lớp có buổi bị huỷ từ trước
    // thì tập bài đang gán KHÔNG liên tục — ví dụ `CS2.SATA3.26.001` đang là `1..19, 21..48`
    // (khuyết bài 20). Gán `1..N` sẽ KÉO bài 20 vào và dịch mọi bài sau đó lùi một nấc, tức
    // đổi nội dung của 29 buổi mà chẳng ai yêu cầu. Hoán vị thì lớp đó KHÔNG đổi gì — thứ tự
    // của nó vốn đã tăng dần.
    const dangGan = xep
      .map((s) => (s.planId ? P.get(s.planId) : null))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .sort((a, b) => a.order - b.order);
    if (dangGan.length !== xep.length) {
      boQua.push(`${ma}: ${xep.length} buổi nhưng chỉ ${dangGan.length} buổi có plan hợp lệ`);
      continue;
    }

    const doiCuaLop: DongDump[] = [];
    for (let i = 0; i < xep.length; i++) {
      const s = xep[i]!;
      const dung = dangGan[i]!;
      if (s.planId === dung.id && s.lessonId === dung.lessonId) continue;
      const cu = s.planId ? P.get(s.planId) : null;
      doiCuaLop.push({
        sessionId: s.id,
        lop: ma,
        ngay: s.date.toISOString().slice(0, 10),
        planIdCu: s.planId,
        lessonIdCu: s.lessonId,
        planIdMoi: dung.id,
        lessonIdMoi: dung.lessonId,
        baiCu: cu ? cu.order + 1 : null,
        baiMoi: dung.order + 1,
      });
    }

    if (doiCuaLop.length === 0) continue;
    lopDoiThuTu++;
    canGhi.push(...doiCuaLop);

    const truoc = xep.map((s) => (s.planId ? (P.get(s.planId)?.order ?? -1) + 1 : "?"));
    const sau = dangGan.map((p) => p.order + 1);
    console.log(`── ${ma}  (${doiCuaLop.length} buổi đổi bài${huy.length ? ` · ${huy.length} buổi huỷ, bỏ qua` : ""})`);
    console.log(`   TRƯỚC: ${truoc.slice(0, 16).join(",")}${truoc.length > 16 ? "…" : ""}`);
    console.log(`   SAU  : ${sau.slice(0, 16).join(",")}${sau.length > 16 ? "…" : ""}`);
    for (const d of doiCuaLop.slice(0, 8)) {
      console.log(`     ${d.ngay}  bài ${String(d.baiCu ?? "?").padStart(2)} → ${String(d.baiMoi).padStart(2)}`);
    }
    if (doiCuaLop.length > 8) console.log(`     …còn ${doiCuaLop.length - 8} buổi nữa`);
    console.log("");
  }

  console.log(`TỔNG: ${lopDoiThuTu} lớp · ${canGhi.length} buổi đổi bài`);
  if (boQua.length) {
    console.log(`\nBỎ QUA (hình dạng lạ — script không đoán):`);
    for (const b of boQua) console.log(`   ${b}`);
  }

  if (!APPLY) {
    console.log(`\n(chưa ghi gì — thêm --apply để chạy thật)`);
    return;
  }
  if (canGhi.length === 0) {
    console.log(`\nKhông có gì để ghi.`);
    return;
  }

  // ── CỔNG 3: dump TRƯỚC khi ghi.
  const tuongDoi = duongDump.replace(/\\/g, "/");
  if (/^(docs|app|lib|components|prisma|scripts|tests)\//.test(tuongDoi)) {
    console.error(`DỪNG: dump là dữ liệu thật của khách hàng, không ghi vào "${tuongDoi}" — git theo dõi thư mục đó.`);
    process.exitCode = 1;
    return;
  }
  const duong = resolve(duongDump);
  mkdirSync(dirname(duong), { recursive: true });
  writeFileSync(duong, JSON.stringify({ chayLuc: new Date().toISOString(), doi: canGhi }, null, 2), "utf8");
  console.log(`\nĐã dump giá trị cũ: ${duong}`);

  // Từng buổi một giá trị khác nhau nên không gộp `updateMany` được.
  let n = 0;
  for (const d of canGhi) {
    await db.classSession.update({
      where: { id: d.sessionId },
      data: { planId: d.planIdMoi, lessonId: d.lessonIdMoi },
    });
    n++;
  }
  console.log(`Đã sắp lại ${n} buổi.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
