/**
 * scripts/do-ngay-co-co-truoc-sau.ts — "NGÀY CÓ CỜ" trên màn Kỳ công sẽ nhảy bao nhiêu sau
 * khi `THIEU_GPS` vào `CO_CANH_BAO`. CHỈ ĐỌC.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO — chủ dự án 16/09/2026
 *
 *   *"Quản lý sẽ thấy con số nhảy. Chạy một lượt đọc, cho tôi con số hiện tại và con số sau
 *   khi THIEU_GPS vào CO_CANH_BAO. Tôi cần nói trước với người rà, không để họ tự phát hiện."*
 *
 * Bản vá cùng ngày gỡ chặn `NO_GPS` (53 lượt bị từ chối trên prod) và chuyển sang gắn cờ.
 * Gỡ chặn mà cờ không ai đếm là đổi một lỗi ồn ào lấy một lỗ hổng im lặng, nên `THIEU_GPS`
 * được thêm vào `CO_CANH_BAO` — tập mà `buildPeriodSummary` dùng để đếm `flaggedDays`.
 *
 * Hệ quả: con số "Ngày có cờ" trên màn Kỳ công TĂNG, ngay lượt deploy, mà không ai làm gì
 * sai cả. Người rà mở màn ra thấy số nhảy sẽ tưởng có sự cố.
 *
 * ⚠️ ĐO TRÊN DỮ LIỆU HIỆN CÓ, và nói rõ giới hạn: những dòng `THIEU_GPS` đang có trên DB là
 * do các đường KHÔNG bị chặn sinh ra (nút công tác, hoặc điểm chấm chưa bật geofence). 53
 * lượt bị từ chối vì `NO_GPS` thì **chưa từng được ghi thành dòng ngày công** — chúng bị
 * chặn trước đó. Nên con số "sau" ở đây là mức TĂNG DO CỜ ĐƯỢC ĐẾM, chưa gồm phần sẽ phát
 * sinh khi bản vá bắt đầu ghi những lượt trước kia bị chặn. Phần ấy chỉ đo được sau vài
 * ngày chạy thật.
 *
 * ⚠️ CHỈ ĐỌC. Không in họ tên.
 *
 * CHẠY: pnpm tsx scripts/do-ngay-co-co-truoc-sau.ts
 */
// `_load-env` phải chạy TRƯỚC mọi import chạm Prisma.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";
import { db } from "../lib/db";
import { CO_CANH_BAO } from "../lib/cham-cong/tong-hop-cong";

const kiemDb = scriptDb();

function tieu(s: string) {
  console.log("");
  console.log("═".repeat(100));
  console.log(s);
  console.log("═".repeat(100));
}
function dong(nhan: string, n: number | string) {
  console.log(`  ${nhan.padEnd(64)} ${String(n).padStart(10)}`);
}

async function main() {
  console.log(`DB host: ${currentDbHost() ?? "(không đọc được)"}`);
  inQuyen(await kiemQuyen(kiemDb), false);

  // TẬP SAU = `CO_CANH_BAO` đang có trong mã (đã thêm `THIEU_GPS`).
  // TẬP TRƯỚC = chính nó bỏ `THIEU_GPS` ra.
  //
  // Dựng "trước" bằng cách TRỪ khỏi tập thật, không gõ lại danh sách 12 cờ bằng tay: gõ lại
  // là mở đường cho hai danh sách lệch nhau, và lúc ấy phép đo nói dối mà không ai biết.
  const SAU = new Set(CO_CANH_BAO);
  const TRUOC = new Set([...CO_CANH_BAO].filter((f) => f !== "THIEU_GPS"));
  if (SAU.size === TRUOC.size) {
    console.log("");
    console.log("⚠️ DỪNG: `THIEU_GPS` KHÔNG có trong `CO_CANH_BAO` của nhánh đang chạy.");
    console.log("   Phép đo này chỉ có nghĩa khi chạy trên nhánh ĐÃ thêm cờ. Không có gì để so.");
    return;
  }
  console.log(`Tập cờ TRƯỚC: ${TRUOC.size} cờ · SAU: ${SAU.size} cờ (thêm THIEU_GPS)`);

  const ngay = await db.staffAttendanceDay.findMany({
    select: { userId: true, centerId: true, workDate: true, flags: true },
  });

  const coTrong = (fs: string[], t: Set<string>) => fs.some((f) => t.has(f));
  const truoc = ngay.filter((d) => coTrong(d.flags, TRUOC));
  const sau = ngay.filter((d) => coTrong(d.flags, SAU));
  const moi = sau.filter((d) => !coTrong(d.flags, TRUOC));

  tieu("TOÀN BỘ — số NGÀY CÓ CỜ trước và sau");
  dong("Tổng dòng ngày công", ngay.length);
  dong("Ngày có cờ — TRƯỚC", truoc.length);
  dong("Ngày có cờ — SAU", sau.length);
  dong("⇒ TĂNG THÊM", moi.length);
  dong("   — số người bị ảnh hưởng", new Set(moi.map((d) => d.userId)).size);

  // Màn Kỳ công xem theo (cơ sở × kỳ) ⇒ phải rải đúng chiều ấy, vì người rà mở từng màn.
  tieu("RẢI THEO (CƠ SỞ × KỲ) — đúng chiều người rà mở màn");
  const theo = new Map<string, { truoc: number; sau: number; moi: number }>();
  for (const d of ngay) {
    const k = `${d.workDate.toISOString().slice(0, 7)} · ${d.centerId}`;
    const v = theo.get(k) ?? { truoc: 0, sau: 0, moi: 0 };
    const t = coTrong(d.flags, TRUOC);
    const s2 = coTrong(d.flags, SAU);
    if (t) v.truoc += 1;
    if (s2) v.sau += 1;
    if (s2 && !t) v.moi += 1;
    theo.set(k, v);
  }
  console.log(`  ${"KỲ · CƠ SỞ".padEnd(36)}${"TRƯỚC".padStart(8)}${"SAU".padStart(7)}${"TĂNG".padStart(7)}`);
  for (const [k, v] of [...theo.entries()].sort()) {
    if (v.truoc === 0 && v.sau === 0) continue;
    console.log(`  ${k.padEnd(36)}${String(v.truoc).padStart(8)}${String(v.sau).padStart(7)}${String(v.moi).padStart(7)}`);
  }

  tieu("NHỮNG NGÀY TĂNG THÊM MANG CỜ GÌ — để người rà biết mình sắp thấy gì");
  const demCo = new Map<string, number>();
  for (const d of moi) for (const f of d.flags) demCo.set(f, (demCo.get(f) ?? 0) + 1);
  if (demCo.size === 0) console.log("  (không ngày nào tăng thêm)");
  for (const [f, n] of [...demCo.entries()].sort((a, b) => b[1] - a[1])) dong(`  ${f}`, n);

  console.log("");
  console.log("  ⓘ Con số TĂNG ở trên là phần cờ ĐÃ CÓ trên DB mà trước nay không được đếm.");
  console.log("    Nó CHƯA gồm phần sẽ phát sinh khi bản vá bắt đầu GHI những lượt trước kia");
  console.log("    bị chặn vì NO_GPS (đo được 53 lượt). Phần ấy chỉ thấy sau vài ngày chạy thật.");

  // ── PHẦN SẼ TĂNG VỀ SAU — ước lượng có cơ sở, không phải cảm tính ────────
  //
  // "Tăng 0 lúc deploy" là câu trả lời ĐÚNG nhưng CHƯA ĐỦ, và trả lời nửa vời ở đây là để
  // người rà yên tâm hôm nay rồi giật mình tuần sau.
  //
  // 53 lượt `NO_GPS` bị chặn chưa từng thành dòng ngày công nào. Sau bản vá chúng ĐƯỢC GHI,
  // và mỗi (người × ngày) có ít nhất một lượt như thế sẽ thành một "ngày có cờ" mới — đếm
  // theo CẶP chứ không theo lượt, vì một ngày chỉ được tính một lần dù quét hỏng năm lần.
  //
  // ⚠️ Đây là ước lượng theo NHỊP CŨ. Nó giả định tuần tới giống tuần trước, mà bản vá còn
  // hai lượt gọi định vị mới (GPS thật → hạ xuống wifi) sẽ CỨU phần lớn số ấy. Nên con số
  // dưới đây là CẬN TRÊN, và thực tế phải thấp hơn.
  const noGps = await db.staffTimeLog.findMany({
    where: { result: "REJECTED", rejectReason: "NO_GPS" },
    select: { userId: true, workDate: true },
  });
  const cap = new Set(noGps.map((l) => `${l.userId}|${l.workDate.toISOString().slice(0, 10)}`));
  const capTheoKy = new Map<string, Set<string>>();
  for (const l of noGps) {
    const k = l.workDate.toISOString().slice(0, 7);
    const set = capTheoKy.get(k) ?? new Set<string>();
    set.add(`${l.userId}|${l.workDate.toISOString().slice(0, 10)}`);
    capTheoKy.set(k, set);
  }

  tieu("PHẦN SẼ TĂNG VỀ SAU — những lượt trước kia bị CHẶN, nay sẽ được GHI");
  dong("Lượt bị chặn vì NO_GPS (đã xảy ra)", noGps.length);
  dong("⇒ quy về (người × ngày) — số NGÀY CÓ CỜ sẽ thêm", cap.size);
  dong("   — số người", new Set(noGps.map((l) => l.userId)).size);
  for (const [k, v] of [...capTheoKy.entries()].sort()) dong(`   kỳ ${k}`, `${v.size} ngày`);
  console.log("");
  console.log("  ⓘ Đây là CẬN TRÊN theo nhịp CŨ. Bản vá còn thêm lượt gọi định vị thứ hai");
  console.log("    (hạ độ chính xác, dùng wifi/sóng) sẽ cứu phần lớn số ấy — nên thực tế");
  console.log("    phải THẤP HƠN. Đo lại sau vài ngày chạy thật mới có con số đúng.");

  console.log("");
  console.log("Xong. Không dòng nào bị ghi.");
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
