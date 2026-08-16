/**
 * scripts/nen-p4-kiem-cong.ts — Nền Hệ thống P4 · US-13 · AC1.
 *
 *   pnpm tsx scripts/nen-p4-kiem-cong.ts [--ngay 7]
 *
 * CHỈ ĐỌC. Thoát khác 0 khi CHƯA đủ điều kiện bật cutover.
 *
 * ── ĐÂY LÀ CỔNG, KHÔNG PHẢI BÁO CÁO ────────────────────────────────────────────
 * Báo cáo là `nen-p3-bao-cao-shadow.ts` (luôn thoát 0, để đọc số). Cái này thoát
 * khác 0 để dùng được trong workflow: không ai bật cờ trước khi lệnh này xanh.
 *
 * ── BA ĐIỀU KIỆN, KHÔNG PHẢI MỘT ───────────────────────────────────────────────
 * ① 0 LỆCH trong cửa sổ — điều kiện ai cũng nghĩ tới.
 * ② 0 CHƯA PHỦ — chỗ gọi chưa truyền `orgUnitId` nghĩa là resolver mới CHƯA HỀ được
 *   thử ở đó. Bật lúc đó là bật một thứ chưa ai đo. Và vì resolver mới fail-closed
 *   khi thiếu `orgUnitId`, mỗi lượt "chưa phủ" hôm nay là một cú 403 ngày mai.
 * ③ Có dữ liệu shadow ở ĐỦ số ngày — "0 lệch" trên cửa sổ mà shadow không chạy ngày
 *   nào là XANH GIẢ. Đúng bài học `inconclusive` của đối soát OrgUnit: quét 0 dòng
 *   mà báo sạch thì con số vô nghĩa.
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

  console.log(`## Cổng cutover P4 — cửa sổ ${soNgay} ngày`);
  console.log("");
  console.log(`DB: ${currentDbHost()}`);
  console.log("");

  const rows = await db.scopeShadowDiff.groupBy({
    by: ["ketQua"],
    where: { createdAt: { gte: tu } },
    _count: { _all: true },
  });
  const dem = (k: string) => rows.find((r) => r.ketQua === k)?._count._all ?? 0;
  const lech = dem("LECH");
  const chuaPhu = dem("CHUA_PHU");
  const giong = dem("GIONG");

  const ngay = await db.$queryRaw<{ ngay: Date }[]>`
    SELECT DISTINCT date_trunc('day', "createdAt") AS ngay
      FROM "ScopeShadowDiff"
     WHERE "createdAt" >= ${tu}
  `;

  const dieuKien: { ten: string; dat: boolean; chiTiet: string }[] = [
    {
      ten: "① 0 lượt LỆCH",
      dat: lech === 0,
      chiTiet: lech === 0 ? "0 lệch" : `${lech} lượt lệch — chạy báo cáo để xem quyền nào`,
    },
    {
      ten: "② 0 lượt CHƯA PHỦ",
      dat: chuaPhu === 0,
      chiTiet:
        chuaPhu === 0
          ? "mọi chỗ gọi đã truyền orgUnitId"
          : `${chuaPhu} lượt chưa truyền orgUnitId — resolver mới sẽ TỪ CHỐI đúng những chỗ này`,
    },
    {
      ten: `③ có dữ liệu đủ ${soNgay} ngày`,
      dat: ngay.length >= soNgay,
      chiTiet:
        ngay.length >= soNgay
          ? `${ngay.length}/${soNgay} ngày (mẫu chứng: ${giong} lượt GIỐNG)`
          : `chỉ ${ngay.length}/${soNgay} ngày — chưa chứng minh shadow chạy liên tục`,
    },
  ];

  console.log("| Điều kiện | Kết quả | Chi tiết |");
  console.log("|---|---|---|");
  for (const d of dieuKien) console.log(`| ${d.ten} | ${d.dat ? "✅" : "❌"} | ${d.chiTiet} |`);
  console.log("");

  const hong = dieuKien.filter((d) => !d.dat);
  if (hong.length > 0) {
    console.log(`❌ **CHƯA ĐỦ ĐIỀU KIỆN** — ${hong.length}/3 mục chưa đạt. KHÔNG bật cutover.`);
    console.log("");
    console.log("Bước kế tiếp theo thứ tự: dọn CHƯA PHỦ trước (truyền `orgUnitId` vào");
    console.log("`Target` ở chỗ gọi), rồi mới điều tra LỆCH, rồi mới đếm 7 ngày.");
    process.exitCode = 1;
    return;
  }

  console.log("✅ **ĐỦ ĐIỀU KIỆN.** Bật cutover:");
  console.log("");
  console.log("  Cấu hình → `orgScope.cutoverEnabled` = true (nhớ ghi lý do — bắt buộc).");
  console.log("");
  console.log("Rollback: đặt lại `false`. Hiệu lực ≤5 phút (TTL cache), KHÔNG cần deploy.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
