/**
 * scripts/nen-p3-bao-cao-shadow.ts — Nền Hệ thống P3 · US-12 · AC4.
 *
 *   pnpm tsx scripts/nen-p3-bao-cao-shadow.ts [--ngay 7]
 *
 * CHỈ ĐỌC. In báo cáo pha shadow của resolver dataScope + trạng thái CỔNG CUTOVER.
 * Thoát 0 luôn — đây là báo cáo, không phải cổng CI. Cổng nằm ở `nen-p4-kiem-cong.ts`.
 *
 * ── ĐỌC CON SỐ NÀO TRƯỚC ───────────────────────────────────────────────────────
 * Không phải "lệch". Là **CHƯA PHỦ**. Lệch = 0 trong khi chưa phủ còn cao nghĩa là
 * resolver mới hầu như chưa được thử — sạch trên mẫu rỗng. Thứ tự đúng là: kéo chưa
 * phủ xuống 0 trước (truyền `orgUnitId` vào Target ở những chỗ gọi mà báo cáo chỉ
 * đích danh), rồi mới nói chuyện "7 ngày sạch".
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";

const db = scriptDb();

function doiSo(ten: string, mac: number): number {
  const i = process.argv.indexOf(`--${ten}`);
  if (i === -1) return mac;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) && v > 0 ? v : mac;
}

async function main() {
  const soNgay = doiSo("ngay", 7);
  const tu = new Date(Date.now() - soNgay * 24 * 60 * 60 * 1000);

  console.log(`## Báo cáo shadow resolver dataScope — ${soNgay} ngày gần nhất`);
  console.log("");
  console.log(`DB: ${currentDbHost()}`);
  console.log("");

  const rows = await db.scopeShadowDiff.groupBy({
    by: ["ketQua", "nguon", "permissionKey"],
    where: { createdAt: { gte: tu } },
    _count: { _all: true },
  });

  if (rows.length === 0) {
    console.log("⚠️ **KHÔNG có bản ghi shadow nào trong cửa sổ.**");
    console.log("");
    console.log("Đây KHÔNG phải tin tốt — nó nghĩa là pha shadow chưa chạy, chứ không");
    console.log("phải hệ thống đã sạch. Kiểm theo thứ tự:");
    console.log("  1. env `SCOPE_SHADOW_ENABLED=\"true\"` trên môi trường đang đo?");
    console.log("  2. đã redeploy sau khi đặt env? (nơi nhận cắm ở instrumentation.ts,");
    console.log("     chỉ chạy lúc khởi động server)");
    console.log("  3. migration `20260813000000_nen_p3_us12_scope_shadow` đã áp?");
    process.exitCode = 0;
    return;
  }

  const tong = { GIONG: 0, LECH: 0, CHUA_PHU: 0 } as Record<string, number>;
  const theoNguon: Record<string, Record<string, number>> = {};
  const lechTheoQuyen: Record<string, number> = {};
  const chuaPhuTheoQuyen: Record<string, number> = {};

  for (const r of rows) {
    const n = r._count._all;
    tong[r.ketQua] = (tong[r.ketQua] ?? 0) + n;
    theoNguon[r.nguon] ??= {};
    theoNguon[r.nguon]![r.ketQua] = (theoNguon[r.nguon]![r.ketQua] ?? 0) + n;
    if (r.ketQua === "LECH") lechTheoQuyen[r.permissionKey] = (lechTheoQuyen[r.permissionKey] ?? 0) + n;
    if (r.ketQua === "CHUA_PHU")
      chuaPhuTheoQuyen[r.permissionKey] = (chuaPhuTheoQuyen[r.permissionKey] ?? 0) + n;
  }

  const ngay = await db.$queryRaw<{ ngay: Date }[]>`
    SELECT DISTINCT date_trunc('day', "createdAt") AS ngay
      FROM "ScopeShadowDiff"
     WHERE "createdAt" >= ${tu}
  `;

  console.log("| Kết quả | Số lượt | Nghĩa |");
  console.log("|---|--:|---|");
  console.log(`| LỆCH | ${tong.LECH ?? 0} | lật P4 sẽ ĐỔI quyết định — phải điều tra |`);
  console.log(
    `| CHƯA PHỦ | ${tong.CHUA_PHU ?? 0} | chỗ gọi chưa truyền orgUnitId — resolver mới CHƯA được thử |`,
  );
  console.log(`| GIỐNG (mẫu ~1/500) | ${tong.GIONG ?? 0} | bằng chứng shadow có chạy |`);
  console.log("");
  console.log(`Ngày có dữ liệu: **${ngay.length}/${soNgay}**`);
  console.log("");

  console.log("### Theo nhánh resolver");
  console.log("");
  console.log("| Nhánh | LỆCH | CHƯA PHỦ | GIỐNG |");
  console.log("|---|--:|--:|--:|");
  for (const [nguon, v] of Object.entries(theoNguon)) {
    const ten = nguon === "grant" ? "PermissionGrant (bảng P0)" : "PermEntry (đường đang enforce)";
    console.log(`| ${ten} | ${v.LECH ?? 0} | ${v.CHUA_PHU ?? 0} | ${v.GIONG ?? 0} |`);
  }
  console.log("");

  const top = (m: Record<string, number>) =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

  if (Object.keys(lechTheoQuyen).length > 0) {
    console.log("### LỆCH theo quyền — điều tra từ trên xuống");
    console.log("");
    console.log("| permissionKey | Số lượt |");
    console.log("|---|--:|");
    for (const [k, n] of top(lechTheoQuyen)) console.log(`| \`${k}\` | ${n} |`);
    console.log("");
    console.log("Xem chi tiết một ca (có đủ actor/target để tái hiện):");
    console.log("");
    console.log("```sql");
    console.log('SELECT * FROM "ScopeShadowDiff"');
    console.log(`WHERE "ketQua" = 'LECH' AND "permissionKey" = '${top(lechTheoQuyen)[0]?.[0]}'`);
    console.log('ORDER BY "createdAt" DESC LIMIT 20;');
    console.log("```");
    console.log("");
  }

  if (Object.keys(chuaPhuTheoQuyen).length > 0) {
    console.log("### CHƯA PHỦ theo quyền — đây là việc cần làm TRƯỚC");
    console.log("");
    console.log("Mỗi dòng là một quyền mà chỗ gọi chưa truyền `orgUnitId` vào `Target`.");
    console.log("Sửa = thêm `orgUnitId` vào target ở chỗ gọi (dữ liệu đã có sẵn nhờ ghi kép P1).");
    console.log("");
    console.log("| permissionKey | Số lượt |");
    console.log("|---|--:|");
    for (const [k, n] of top(chuaPhuTheoQuyen)) console.log(`| \`${k}\` | ${n} |`);
    console.log("");
  }

  const canTro: string[] = [];
  if ((tong.LECH ?? 0) > 0) canTro.push(`còn ${tong.LECH} lượt LỆCH`);
  if ((tong.CHUA_PHU ?? 0) > 0) canTro.push(`còn ${tong.CHUA_PHU} lượt CHƯA PHỦ`);
  if (ngay.length < soNgay) canTro.push(`chỉ có dữ liệu ${ngay.length}/${soNgay} ngày`);

  console.log("### Cổng cutover (US-13)");
  console.log("");
  if (canTro.length === 0) {
    console.log(`✅ **ĐẠT** — ${soNgay} ngày liên tục, 0 lệch, 0 chưa phủ.`);
  } else {
    console.log(`❌ **CHƯA ĐẠT** — ${canTro.join("; ")}.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
