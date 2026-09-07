/**
 * scripts/do-lech-buoi-day.ts — ĐO chênh lệch của những chỗ đếm "buổi dạy" đang nghi sai.
 *
 * CHỈ ĐỌC. Không có chế độ ghi, không tham số nào bật ghi. Toàn bộ là `count`/`groupBy`.
 *
 * ⚠️ ĐỌC `docs/cham-cong/GHI-CHU-BA-CHO-DEM-BUOI-DAY.md` trước khi diễn giải số.
 *
 * CHẠY:
 *   pnpm tsx scripts/do-lech-buoi-day.ts               # 4 tháng gần nhất
 *   pnpm tsx scripts/do-lech-buoi-day.ts 2026-06 2026-10   # từ 01/06 đến hết 30/09
 *
 * Chuẩn so sánh là K-05 — chuỗi ưu tiên người đứng lớp của module chấm công:
 *   `actualTeacherId ?? substituteTeacherId ?? class.teacherId`
 * (`lib/cham-cong/period.ts` và `lib/cham-cong/cong-day-db.ts`).
 */
// `_load-env` phải chạy TRƯỚC `_script-db` — Prisma đọc DATABASE_URL ngay lúc khởi tạo module.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";

const db = scriptDb();

/** "2026-06" → mốc UTC đầu tháng. Dùng UTC như `period.ts`, KHÔNG dùng giờ máy — xem §4 ghi chú. */
function mocThang(s: string | undefined, mac: Date): Date {
  if (!s) return mac;
  const m = /^(\d{4})-(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`Mốc tháng sai định dạng: "${s}" (cần YYYY-MM)`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}

function dong(nhan: string, n: number | string) {
  console.log(`  ${nhan.padEnd(52)} ${String(n).padStart(8)}`);
}

async function main() {
  const nay = new Date();
  const macTo = new Date(Date.UTC(nay.getUTCFullYear(), nay.getUTCMonth() + 1, 1));
  const macFrom = new Date(Date.UTC(nay.getUTCFullYear(), nay.getUTCMonth() - 3, 1));
  const from = mocThang(process.argv[2], macFrom);
  const to = mocThang(process.argv[3], macTo);

  console.log(`[do-lech] DB: ${currentDbHost()} · CHỈ ĐỌC`);
  inQuyen(await kiemQuyen(db), false);
  console.log(`[do-lech] Khoảng: ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)} (nửa mở)\n`);

  // ══ 0. LỖI THƯỢNG NGUỒN — đo TRƯỚC, vì nó quyết định ba số dưới có nghĩa hay không ══
  //
  // Trước 07/09, `completeSession` ghi `actualTeacherId = class.teacherId`, NUỐT MẤT người dạy
  // thay. Vì `actualTeacherId` là bậc ưu tiên CAO NHẤT, dữ liệu cũ sai ở CẢ chuỗi đúng — tức kỳ
  // công và công dạy cũng đang trả buổi về nhầm người.
  //
  // Hệ quả cho phép đo: vá chỗ (1) mà không backfill sẽ ra ĐÚNG 0 THAY ĐỔI, và rất dễ bị kết
  // luận nhầm là "không có bug". Số dưới đây mới là thiệt hại thật.
  const buoi = await db.classSession.findMany({
    where: { date: { gte: from, lt: to } },
    select: {
      id: true,
      status: true,
      date: true,
      actualTeacherId: true,
      substituteTeacherId: true,
      class: { select: { teacherId: true, assistantId: true, deletedAt: true } },
    },
  });
  const xong = buoi.filter((b) => b.status === "COMPLETED");

  // 0 dòng trên prod KHÔNG phải sự thật — nhiều khả năng RLS đang lọc sạch với user chỉ-đọc.
  if (buoi.length === 0) {
    console.log(
      "\n⚠️ Không đọc được buổi nào trong khoảng. Nếu đây là prod thì con số 0 này KHÔNG phải sự\n" +
        '   thật — xem docs/cham-cong/USER-CHI-DOC-PROD.md mục "Nếu số đo ra 0".',
    );
    return;
  }

  const daBiNuot = xong.filter(
    (b) =>
      b.substituteTeacherId &&
      b.substituteTeacherId !== b.class.teacherId &&
      b.actualTeacherId === b.class.teacherId,
  ).length;
  const conCuuDuoc = xong.filter(
    (b) => b.actualTeacherId == null && b.substituteTeacherId && b.substituteTeacherId !== b.class.teacherId,
  ).length;

  console.log("══ 0. LỖI THƯỢNG NGUỒN (session-lifecycle.ts) — đọc số này TRƯỚC ══");
  dong("Buổi COMPLETED trong khoảng", xong.length);
  dong("ĐÃ BỊ NUỐT người dạy thay lúc hoàn tất", daBiNuot);
  dong("Còn cứu được (actualTeacherId chưa bị ghi đè)", conCuuDuoc);
  if (daBiNuot > 0) {
    console.log(
      `  ⚠️ ${daBiNuot} buổi đã mất dấu người dạy thay trong \`actualTeacherId\`. Vá ba chỗ dưới\n` +
        "     mà không backfill nhóm này thì số sẽ KHÔNG đổi — đừng kết luận là không có bug.",
    );
  }

  // ══ 1. Báo cáo hiệu suất GV — bỏ sót substituteTeacherId ══
  const hienThi = new Map<string, number>();
  const dung = new Map<string, number>();
  for (const b of xong) {
    const a = b.actualTeacherId ?? b.class.teacherId; // cách của màn hiệu suất GV
    const k = b.actualTeacherId ?? b.substituteTeacherId ?? b.class.teacherId; // K-05
    if (a) hienThi.set(a, (hienThi.get(a) ?? 0) + 1);
    if (k) dung.set(k, (dung.get(k) ?? 0) + 1);
  }
  const lech = [...new Set([...hienThi.keys(), ...dung.keys()])]
    .map((id) => ({ id, hienThi: hienThi.get(id) ?? 0, dung: dung.get(id) ?? 0 }))
    .filter((r) => r.hienThi !== r.dung);

  console.log("\n══ 1. /admin/bao-cao/hieu-suat-gv — QUY SAI NGƯỜI (không chạm tiền) ══");
  dong("Số giáo viên có số lệch", lech.length);
  // Đếm THẲNG số buổi quy sai. Bản cũ dùng `Σ|hiện − đúng| / 2` — đó là LƯU LƯỢNG RÒNG, nên giáo
  // viên vừa nhận nhầm buổi vừa bị mất buổi sẽ triệt tiêu và bị đếm THIẾU.
  const soBuoiQuySai = xong.filter(
    (b) =>
      (b.actualTeacherId ?? b.class.teacherId) !==
      (b.actualTeacherId ?? b.substituteTeacherId ?? b.class.teacherId),
  ).length;
  dong("Số buổi bị quy sai người", soBuoiQuySai);
  for (const r of lech.slice(0, 10)) {
    console.log(`    ${r.id}  màn hiện ${r.hienThi}  ·  đúng ${r.dung}`);
  }
  if (lech.length > 10) console.log(`    … và ${lech.length - 10} giáo viên nữa`);

  // ══ 2. /teacher/bang-cong — đếm cả buổi CHƯA hoàn tất ══
  //
  // ⚠️ Đây nhiều khả năng KHÔNG phải bug mà là màn LỊCH: chú thích tại chỗ, mô tả đầu file và
  // phụ đề in ra cho GV đều khai vậy, và mỗi dòng có cờ "Đã làm / Sắp tới". Vấn đề là NHÃN ô
  // "Buổi dạy". Số dưới đây đo ĐỘ LỆCH CỦA NHÃN, không phải độ lệch của bộ lọc.
  const theoTrangThai = new Map<string, number>();
  for (const b of buoi) {
    if (b.status === "CANCELLED") continue;
    theoTrangThai.set(b.status, (theoTrangThai.get(b.status) ?? 0) + 1);
  }
  const chuaXong = [...theoTrangThai.entries()]
    .filter(([k]) => k !== "COMPLETED")
    .reduce((s, [, v]) => s + v, 0);
  const laTroGiang = buoi.filter(
    (b) => b.status !== "CANCELLED" && b.class.assistantId && b.class.assistantId !== b.class.teacherId,
  ).length;

  console.log("\n══ 2. /teacher/bang-cong — ô \"Buổi dạy\" đếm cả buổi chưa hoàn tất ══");
  for (const [k, v] of [...theoTrangThai].sort()) dong(`  trạng thái ${k}`, v);
  dong("PHỒNG do buổi chưa hoàn tất", chuaXong);
  dong("Buổi thừa trên bảng của TRỢ GIẢNG", laTroGiang);
  console.log("  (hai dòng trên CHỒNG LẤN nhau — đừng cộng)");
  console.log(
    "  (xem GIỮA THÁNG thì phần lớn buổi còn SCHEDULED ⇒ chênh có thể xấp xỉ 100%.\n" +
      "   Đây là màn LỊCH — nhiều khả năng đổi NHÃN chứ không đổi bộ lọc.)",
  );

  // ══ 3. /admin/teachers/[id] — KHÔNG lọc status ⇒ tính cả buổi đã HUỶ ══
  //
  // ⚠️ BẢN TRƯỚC NÓI QUÁ CON SỐ, và đây là bản vá (07/09/2026).
  //
  // Màn thật lọc `{ gte: monthStart, lt: monthEnd, lte: now }` và chỉ lấy lớp GV CHÍNH còn sống.
  // Bản trước bỏ cả ba vế — tệ hơn, nó không `select` cột `date` nên KHÔNG THỂ cắt ở hiện tại,
  // mà nhãn vẫn in "đã qua ngày". Trên prod, khoảng đo kéo tới 01/10 trong khi hôm nay là 07/09,
  // nên con số in ra gồm cả buổi TƯƠNG LAI — chúng không lên màn này, không phải "phồng".
  const bay = new Date();
  const trenHoSoGv = buoi.filter((b) => b.class.deletedAt == null && b.class.teacherId != null);
  const daQua = trenHoSoGv.filter((b) => b.status !== "COMPLETED" && b.date <= bay);
  const tuongLai = trenHoSoGv.filter((b) => b.status !== "COMPLETED" && b.date > bay);
  const theoTrangThaiDaQua = new Map<string, number>();
  for (const b of daQua) theoTrangThaiDaQua.set(b.status, (theoTrangThaiDaQua.get(b.status) ?? 0) + 1);

  console.log("\n══ 3. /admin/teachers/[id] — \"Đã dạy N buổi\" không lọc trạng thái ══");
  for (const [k, v] of [...theoTrangThaiDaQua].sort()) dong(`  đã qua ngày · ${k}`, v);
  dong("PHỒNG THẬT (chưa COMPLETED · đã qua ngày · lớp có GV chính)", daQua.length);
  dong("(tham khảo) buổi tương lai — KHÔNG lên màn này", tuongLai.length);
  dong("(tham khảo) buổi bị loại: lớp đã xoá / chưa có GV chính", buoi.length - trenHoSoGv.length);
  const huy = theoTrangThaiDaQua.get("CANCELLED") ?? 0;
  console.log(
    `  Trong đó: buổi ĐÃ HUỶ ${huy} · buổi quên bấm "Hoàn tất" ${daQua.length - huy}.\n` +
      "  Hạng nào bằng 0 thì đừng kể nó là nguyên nhân.",
  );

  console.log("\n[do-lech] Xong. Không ghi gì.");
}

main()
  .catch((e) => {
    console.error("[do-lech] lỗi:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
