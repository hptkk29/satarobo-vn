/**
 * QUAY LUI `don-customtitle-may-chep.ts` — trả `customTitle` về đúng giá trị trong file dump.
 *
 * Cặp đôi với script dọn: nó dump giá trị cũ TRƯỚC khi ghi, file này đọc dump đó và ghi
 * ngược lại từng dòng theo `id`. Viết sẵn và thử trên DB nháp TRƯỚC khi ai đó gõ `--apply`,
 * vì lúc cần quay lui thì không còn thời gian viết.
 *
 * Cùng bốn cổng an toàn như script dọn:
 *   1. `--dry-run` MẶC ĐỊNH — chỉ ghi khi có `--apply`.
 *   2. Phạm vi là chính file dump, không có nhánh "quét cả bảng".
 *   3. So khớp trạng thái HIỆN TẠI trước khi ghi: dòng nào `customTitle` đã KHÁC `null` thì
 *      **không đụng** — có người sửa sau lần dọn, ghi đè lên là xoá công của họ.
 *   4. In đích kết nối (che mật khẩu) để đối chiếu trước khi gõ lệnh.
 *
 * CHẠY:
 *   # xem trước
 *   DATABASE_URL='…' pnpm exec tsx scripts/quay-lui-customtitle.ts \
 *     --dump=docs/ban-giao/dump-customtitle-truoc-khi-don.json
 *   # ghi thật
 *   DATABASE_URL='…' pnpm exec tsx scripts/quay-lui-customtitle.ts --dump=… --apply
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const duongDump = (process.argv.find((a) => a.startsWith("--dump=")) ?? "").slice(
  "--dump=".length,
);

const chuoi = process.env.DATABASE_URL ?? "";
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
  id: string;
  lop?: string;
  order?: number;
  customTitleCu: string | null;
  lessonTitle?: string | null;
};

async function main() {
  if (!duongDump) {
    console.error("DỪNG: thiếu --dump=<đường dẫn file JSON do script dọn sinh ra>.");
    process.exitCode = 1;
    return;
  }
  if (!chuoi) {
    console.error("DỪNG: thiếu DATABASE_URL.");
    process.exitCode = 1;
    return;
  }

  const noiDung = JSON.parse(readFileSync(resolve(duongDump), "utf8")) as {
    chayLuc?: string;
    lop?: string[];
    daDon?: DongDump[];
  };
  const dong = noiDung.daDon ?? [];

  console.log(`Chế độ  : ${APPLY ? "⚠️  APPLY (SẼ GHI)" : "dry-run (không ghi)"}`);
  console.log(`Đích    : ${moTaDich(chuoi)}`);
  console.log(`Dump    : ${resolve(duongDump)}  (chạy lúc ${noiDung.chayLuc ?? "?"})`);
  console.log(`Dòng    : ${dong.length}`);
  if (dong.length === 0) return;

  // ── CỔNG 3: chỉ trả lại dòng đang thực sự là NULL. Ai sửa sau lần dọn thì để yên.
  const hienTai = await db.classSessionPlan.findMany({
    where: { id: { in: dong.map((d) => d.id) } },
    select: { id: true, customTitle: true },
  });
  const H = new Map(hienTai.map((r) => [r.id, r.customTitle]));

  const seTra = dong.filter((d) => H.has(d.id) && H.get(d.id) === null);
  const daCoNguoiSua = dong.filter((d) => H.has(d.id) && H.get(d.id) !== null);
  const bienMat = dong.filter((d) => !H.has(d.id));

  console.log(`\nSẼ TRẢ LẠI              : ${seTra.length}`);
  console.log(`BỎ QUA — có người sửa sau: ${daCoNguoiSua.length}`);
  for (const d of daCoNguoiSua.slice(0, 10)) {
    console.log(`   ${d.lop ?? "?"} order ${d.order ?? "?"} | nay = ${JSON.stringify(H.get(d.id))}`);
  }
  console.log(`BỎ QUA — plan không còn  : ${bienMat.length}`);

  if (!APPLY) {
    console.log(`\n(chưa ghi gì — thêm --apply để chạy thật)`);
    return;
  }

  // Từng dòng một giá trị khác nhau nên không gộp `updateMany` được.
  let n = 0;
  for (const d of seTra) {
    await db.classSessionPlan.update({
      where: { id: d.id },
      data: { customTitle: d.customTitleCu },
    });
    n++;
  }
  console.log(`\nĐã trả lại ${n} dòng.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
