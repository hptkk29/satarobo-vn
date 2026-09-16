/**
 * scripts/do-ngay-cong-tac.ts — NGÀY CÔNG TÁC trên prod. CHỈ ĐỌC.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO — câu 5 của PHẦN A, và nó CHẶN một quyết định
 *
 * Phần A đảo `NG` (Công tác ngoài) từ **1 công / 0 cặp quét** sang **1 công / 1 CẶP QUÉT**.
 * Nghĩa là sau khi đảo, mọi ngày `NG` **đã có sẵn trên lưới** lập tức bị engine coi là
 * "phải có cặp quét" — và ngày nào không có sẽ mang cờ thiếu lượt.
 *
 * Người đi công tác hôm qua KHÔNG có nút nào để bấm, nên họ không thể đã quét. ⇒ Con số
 * dưới đây chính là **số ngày sẽ bị gắn cờ oan** nếu đảo mà không xử lý quá khứ.
 *
 * Chủ dự án chốt 15/09: đảo `NG` **chờ B1** (`soCapQuetKyVong`). Phép đo này nói cho biết
 * việc xử lý quá khứ to bằng nào — và nó phải chạy TRƯỚC khi đảo, không phải sau.
 *
 * ⚠️ CHỈ ĐỌC. Không tham số nào bật ghi. KHÔNG in họ tên (repo PUBLIC — xem
 * `docs/cham-cong/VE-TEN-THAT-TRONG-LOG-ACTIONS.md`).
 *
 * CHẠY: pnpm tsx scripts/do-ngay-cong-tac.ts
 */
// `_load-env` phải chạy TRƯỚC mọi import chạm Prisma.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";
import { db } from "../lib/db";

const kiemDb = scriptDb();

function tieu(s: string) {
  console.log("");
  console.log("═".repeat(96));
  console.log(s);
  console.log("═".repeat(96));
}
function dong(nhan: string, n: number | string) {
  console.log(`  ${nhan.padEnd(62)} ${String(n).padStart(8)}`);
}

async function main() {
  console.log(`DB host: ${currentDbHost() ?? "(không đọc được)"}`);
  inQuyen(await kiemQuyen(kiemDb), false);

  // ── Mã ca nào là CÔNG TÁC ──────────────────────────────────────────────────
  // Hỏi theo `placeMode = OFFSITE`, KHÔNG hỏi theo mã "NG": mã là tên, `placeMode` là
  // nghĩa. Mã nào sau này khai OFFSITE cũng phải vào phép đo này mà không ai nhớ sửa.
  const maCongTac = await db.shiftTemplate.findMany({
    where: { defaultPlace: "OFFSITE" },
    select: { code: true, attendanceMode: true, dayCredit: true, nominalMinutes: true },
    orderBy: { code: "asc" },
  });

  tieu("Mã ca CÔNG TÁC (defaultPlace = OFFSITE) — danh mục thật trên prod");
  if (maCongTac.length === 0) {
    console.log("  KHÔNG mã nào. (Đây là số ĐO — nếu bất ngờ thì danh mục prod khác seed.)");
  }
  for (const m of maCongTac) {
    console.log(
      `  ${m.code.padEnd(8)} attendanceMode=${String(m.attendanceMode).padEnd(9)}` +
        ` dayCredit=${String(m.dayCredit).padEnd(5)} nominalMinutes=${m.nominalMinutes ?? "null"}`,
    );
  }
  const codes = maCongTac.map((m) => m.code);
  if (codes.length === 0) {
    console.log("\n  Không có mã công tác ⇒ không đo tiếp được. DỪNG.");
    return;
  }

  // ── Ô CA đã xếp ────────────────────────────────────────────────────────────
  const oCa = await db.shiftAssignment.findMany({
    where: { templateCode: { in: codes }, status: "ACTIVE" },
    select: { userId: true, workDate: true, templateCode: true, centerId: true },
    orderBy: { workDate: "asc" },
  });

  tieu("Ô ca công tác đã xếp (ShiftAssignment ACTIVE)");
  dong("tổng ô ca", oCa.length);
  dong("số NGƯỜI", new Set(oCa.map((o) => o.userId)).size);
  if (oCa.length > 0) {
    dong("ngày sớm nhất", oCa[0]!.workDate.toISOString().slice(0, 10));
    dong("ngày muộn nhất", oCa[oCa.length - 1]!.workDate.toISOString().slice(0, 10));
  }

  const theoThang = new Map<string, number>();
  for (const o of oCa) {
    const k = o.workDate.toISOString().slice(0, 7);
    theoThang.set(k, (theoThang.get(k) ?? 0) + 1);
  }
  if (theoThang.size > 0) {
    console.log("");
    for (const [k, n] of [...theoThang.entries()].sort()) dong(`  tháng ${k}`, n);
  }

  // ── 🔑 SỐ QUAN TRỌNG NHẤT: ngày công tác CHƯA có cặp quét ───────────────────
  //
  // Đây là số ngày sẽ bị gắn cờ OAN nếu đảo NG sang "1 cặp quét" mà không xử lý quá khứ.
  // Đếm bằng `StaffAttendanceDay.pairs` — cùng cột mà `noi-quy.ts` dùng để hỏi "có đủ
  // vào/ra chưa", KHÔNG tự đếm lại từ `StaffTimeLog` (luật 12b: một nguồn).
  const ngay = await db.staffAttendanceDay.findMany({
    where: { templateCode: { in: codes } },
    select: { userId: true, workDate: true, templateCode: true, pairs: true, flags: true },
  });

  const coDuCap = (pairs: unknown) =>
    Array.isArray(pairs) &&
    pairs.some((p) => {
      if (!p || typeof p !== "object") return false;
      const o = p as Record<string, unknown>;
      return o.open === false && typeof o.inId === "string" && typeof o.outId === "string";
    });

  let du = 0;
  let thieu = 0;
  const nguoiThieu = new Set<string>();
  for (const d of ngay) {
    if (coDuCap(d.pairs)) du += 1;
    else {
      thieu += 1;
      nguoiThieu.add(d.userId);
    }
  }

  tieu("🔑 Ngày công tác ĐÃ TÍNH (StaffAttendanceDay) — sẽ bị gắn cờ oan bao nhiêu?");
  dong("tổng ngày công mã công tác", ngay.length);
  dong("· ĐÃ có đủ cặp vào/ra", du);
  dong("· CHƯA có đủ cặp  ← sẽ bị gắn cờ nếu đảo", thieu);
  dong("  (của bao nhiêu người)", nguoiThieu.size);

  console.log("");
  if (thieu === 0) {
    console.log("  ⇒ Đảo NG sang 1 cặp quét KHÔNG gắn cờ oan ngày nào. Không cần xử lý quá khứ.");
    console.log("    (Đây là số ĐO, không phải chưa đo.)");
  } else {
    console.log(`  ⇒ Đảo NG mà không xử lý quá khứ sẽ gắn cờ ${thieu} ngày của ${nguoiThieu.size} người,`);
    console.log("    cho một việc họ KHÔNG THỂ đã làm — hôm đó chưa có nút nào để bấm.");
    console.log("    Ba hướng, chủ dự án chọn: (a) chỉ áp từ ngày đảo trở đi;");
    console.log("    (b) đảo hết rồi chấp nhận cờ trên quá khứ; (c) đảo hết + chạy một lượt");
    console.log("    xoá cờ cho ngày trước mốc. Số trên là thứ để cân ba hướng đó.");
  }

  console.log("");
  console.log("  ⚠️ Script này KHÔNG sửa gì.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([db.$disconnect(), kiemDb.$disconnect()]);
  });
