/**
 * scripts/xoa-ngay-chua-toi.ts — XOÁ các dòng `StaffAttendanceDay` của NGÀY CHƯA DIỄN RA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO — chốt của chủ dự án 16/09/2026, câu 2: **"xoá hẳn"**
 *
 * `recomputeRange` lặp trọn kỳ kể cả kỳ ĐANG CHẠY, nên nút "Tính lại" giữa tháng sinh dòng
 * ngày công cho những ngày chưa tới. `computeDay` xử chúng như ngày đã khép: gắn
 * `KHONG_CO_LUOT` và ghi đủ công. Đo prod 16/09: **250 dòng · 196 cờ oan · 185 công**.
 *
 * Engine đã được vá (`ketQuaNgayChuaDienRa`) nên từ nay dòng mới sinh ra sẽ SẠCH. Script này
 * dọn những dòng ĐÃ GHI trước bản vá.
 *
 * ── HAI LỚP KHOÁ ─────────────────────────────────────────────────────────────
 *   1. KHÔNG `--apply` ⇒ không câu lệnh ghi nào chạy. Mặc định là CHẠY THỬ.
 *   2. Bước chạy thử đi qua workflow ĐO (user chỉ-đọc) ⇒ có gõ nhầm `--apply` ở đó thì
 *      Postgres vẫn từ chối. Ghi thật nằm ở workflow GHI, do người vận hành bấm.
 *
 * ── BA VẾ KHÔNG BAO GIỜ ĐỘNG TỚI ─────────────────────────────────────────────
 *   · `workDate <= hôm nay` — ngày đã diễn ra là dữ liệu thật, tuyệt đối không đụng;
 *   · `status = LOCKED` — kỳ đã chốt thì số đã đóng băng, xoá là sửa sổ đã khoá;
 *   · `overrideUnits != null` — Quản lý đã ghi đè tay cho ngày ấy. Dù là ngày tương lai,
 *     đó là một QUYẾT ĐỊNH CỦA NGƯỜI, không phải rác do máy sinh. Xoá là xoá việc người
 *     ta đã làm — script chỉ LIỆT KÊ chúng ra để người vận hành tự quyết.
 *
 * CHẠY THỬ: pnpm tsx scripts/xoa-ngay-chua-toi.ts
 * GHI THẬT: pnpm tsx scripts/xoa-ngay-chua-toi.ts --apply
 */
// `_load-env` phải chạy TRƯỚC mọi import chạm Prisma.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";
import { db } from "../lib/db";
import { vnYmd } from "../lib/time/vn";

const kiemDb = scriptDb();
const APPLY = process.argv.includes("--apply");

function tieu(s: string) {
  console.log("");
  console.log("═".repeat(96));
  console.log(s);
  console.log("═".repeat(96));
}
function dong(nhan: string, n: number | string) {
  console.log(`  ${nhan.padEnd(62)} ${String(n).padStart(10)}`);
}

async function main() {
  console.log(`DB host: ${currentDbHost() ?? "(không đọc được)"}`);
  inQuyen(await kiemQuyen(kiemDb), APPLY);
  console.log(APPLY ? "CHẾ ĐỘ: GHI THẬT (--apply)" : "CHẾ ĐỘ: CHẠY THỬ (không --apply ⇒ không ghi gì)");

  // Mốc hôm nay theo giờ VN — runner GitHub chạy UTC, tự cắt chuỗi là lệch một ngày lúc
  // nửa đêm giờ VN và sẽ xoá nhầm ngày HÔM NAY.
  const homNayYmd = vnYmd(new Date());
  const homNay = new Date(`${homNayYmd}T00:00:00.000Z`);
  console.log(`Hôm nay (giờ VN): ${homNayYmd} — chỉ đụng workDate LỚN HƠN ngày này`);

  const tuongLai = await db.staffAttendanceDay.findMany({
    where: { workDate: { gt: homNay } },
    select: {
      id: true,
      workDate: true,
      status: true,
      overrideUnits: true,
      dayCreditEarned: true,
      flags: true,
    },
    orderBy: { workDate: "asc" },
  });

  const locked = tuongLai.filter((d) => d.status === "LOCKED");
  const coGhiDe = tuongLai.filter((d) => d.status !== "LOCKED" && d.overrideUnits != null);
  const seXoa = tuongLai.filter((d) => d.status !== "LOCKED" && d.overrideUnits == null);

  tieu("PHẠM VI — dòng ngày CHƯA DIỄN RA");
  dong("Tổng dòng workDate > hôm nay", tuongLai.length);
  dong("  — BỎ QUA vì kỳ đã chốt (LOCKED)", locked.length);
  dong("  — BỎ QUA vì Quản lý đã ghi đè tay", coGhiDe.length);
  dong("  ⇒ SẼ XOÁ", seXoa.length);
  dong("Công sẽ biến mất khỏi ngày chưa tới", Math.round(seXoa.reduce((s, d) => s + d.dayCreditEarned, 0) * 100) / 100);
  dong("Cờ sẽ biến mất", seXoa.filter((d) => d.flags.length > 0).length);

  if (coGhiDe.length > 0) {
    tieu("⚠️ NHỮNG DÒNG CÓ GHI ĐÈ TAY — script KHÔNG đụng, người vận hành tự quyết");
    for (const d of coGhiDe.slice(0, 20)) {
      console.log(`  ${d.workDate.toISOString().slice(0, 10)}  ghi đè = ${d.overrideUnits}`);
    }
    if (coGhiDe.length > 20) console.log(`  … và ${coGhiDe.length - 20} dòng nữa.`);
  }

  // Rải theo ngày, để người bấm thấy phạm vi trải tới đâu trước khi đồng ý.
  const theoNgay = new Map<string, number>();
  for (const d of seXoa) {
    const k = d.workDate.toISOString().slice(0, 10);
    theoNgay.set(k, (theoNgay.get(k) ?? 0) + 1);
  }
  tieu("RẢI THEO NGÀY");
  for (const [k, n] of [...theoNgay.entries()].sort()) console.log(`  ${k}   ${n} dòng`);

  if (seXoa.length === 0) {
    console.log("");
    console.log("Không có dòng nào để xoá. Dừng.");
    return;
  }

  if (!APPLY) {
    tieu("CHẠY THỬ — KHÔNG XOÁ GÌ");
    console.log("  Đọc kỹ bảng phạm vi ở trên rồi mới sang workflow GHI.");
    console.log("  Nhắc: dòng ngày ĐÃ DIỄN RA không nằm trong phạm vi này, ở bất kỳ chế độ nào.");
    return;
  }

  // Xoá theo `id` đã liệt kê, KHÔNG xoá lại bằng điều kiện `workDate > now`. Giữa lúc đọc và
  // lúc ghi có thể có người bấm "Tính lại" và sinh thêm dòng; xoá theo điều kiện là xoá cả
  // những dòng KHÔNG nằm trong bảng phạm vi mà người vận hành vừa đọc và đồng ý.
  const ids = seXoa.map((d) => d.id);
  const r = await db.staffAttendanceDay.deleteMany({ where: { id: { in: ids } } });
  tieu("ĐÃ GHI");
  dong("Số dòng đã xoá", r.count);
  if (r.count !== ids.length) {
    console.log(`  ⚠️ Lệch: định xoá ${ids.length}, xoá được ${r.count}. Ai đó vừa đổi dữ liệu giữa chừng — chạy lại phép đo.`);
  }
  console.log("  Dòng ngày đã diễn ra: KHÔNG đụng.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await kiemDb.$disconnect();
    await db.$disconnect();
  });
