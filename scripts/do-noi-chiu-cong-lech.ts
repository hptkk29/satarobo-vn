/**
 * scripts/do-noi-chiu-cong-lech.ts — NGÀY CÔNG bị gán sai cơ sở. CHỈ ĐỌC.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO — bug prod 13/09/2026
 *
 * `recompute.ts` từng chốt nơi chịu công bằng:
 *
 *     assignment?.centerId ?? logs[0]?.centerId ?? home.centerId
 *                             ^^^^^^^^^^^^^^^^^^ NƠI QUÉT
 *
 * Ngày KHÔNG có ca xếp thì vế giữa thắng ⇒ ngày công rơi vào cơ sở người đó vừa ghé.
 * Bản vá bỏ vế ấy, nhưng **mã sửa KHÔNG tự sửa dòng đã ghi**: `StaffAttendanceDay` chỉ đổi
 * khi có lượt tính lại. Script này đếm dòng đang sai để quyết định có cần tính lại hay không.
 *
 * ⚠️ CHỈ ĐỌC. Không có chế độ ghi, không tham số nào bật ghi. Việc tính lại (nếu cần) là một
 * lượt RIÊNG, và theo chốt của chủ dự án phải BÁO TRƯỚC để nói với kế toán.
 *
 * Đọc số ra sao:
 *   · `LỆCH` = dòng có `centerId` khác nơi đáng ra phải chịu công (ca xếp, hoặc nơi trực thuộc).
 *   · Tách theo `CÓ CA` / `KHÔNG CA` vì chỉ nhóm KHÔNG CA mới là nạn nhân của bug này;
 *     nhóm CÓ CA mà lệch nghĩa là chuyện khác, phải soi riêng.
 *   · Tách theo KỲ ĐÃ CHỐT / chưa chốt: kỳ đã chốt thì tính lại cũng bị `recompute` bỏ qua.
 *
 * CHẠY: pnpm tsx scripts/do-noi-chiu-cong-lech.ts
 */
// `_load-env` phải chạy TRƯỚC mọi import chạm Prisma.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";
import { db } from "../lib/db";
import { HO_CENTER_ID } from "../lib/cham-cong/home-center";
import { noiChiuCongCuaNgay } from "../lib/cham-cong/noi-chiu-cong";
import { vnYmd } from "../lib/time/vn";

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
  tieu("NGÀY CÔNG bị gán sai cơ sở (chỉ đọc)");

  const rows = await db.staffAttendanceDay.findMany({
    select: { id: true, userId: true, workDate: true, centerId: true, status: true },
    orderBy: { workDate: "asc" },
  });
  if (rows.length === 0) {
    console.log('\n⚠️ Không đọc được dòng nào — xem docs/cham-cong/USER-CHI-DOC-PROD.md mục "Nếu số đo ra 0".');
    return;
  }

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const [cas, users, centers, kys] = await Promise.all([
    db.shiftAssignment.findMany({
      where: { userId: { in: userIds }, status: "ACTIVE" },
      select: { userId: true, workDate: true, centerId: true },
    }),
    db.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true, name: true, centerId: true,
        employee: { select: { centerId: true, center: { select: { code: true } } } },
        center: { select: { code: true } },
      },
    }),
    db.center.findMany({ select: { id: true, code: true, name: true } }),
    db.attendancePeriod.findMany({ select: { centerId: true, periodKey: true, status: true } }),
  ]);

  const tenCoSo = new Map(centers.map((c) => [c.id, c.code ?? c.name]));
  tenCoSo.set(HO_CENTER_ID, "HO");
  const khoaCa = (u: string, d: Date) => `${u}|${vnYmd(d)}`;
  const caTheoNgay = new Map(cas.map((a) => [khoaCa(a.userId, a.workDate), a.centerId]));
  const kyChot = new Map(kys.map((k) => [`${k.centerId}|${k.periodKey}`, k.status]));

  /** Bản sao luật `resolveHomeCenter` — chỉ đọc, không gọi DB từng người. */
  const nhaTheoUser = new Map<string, string>();
  for (const u of users) {
    const cid = u.employee?.centerId ?? u.centerId ?? null;
    const code = u.employee?.center?.code ?? u.center?.code ?? null;
    nhaTheoUser.set(u.id, !cid || cid === HO_CENTER_ID || code === "HO" ? HO_CENTER_ID : cid);
  }
  const tenNguoi = new Map(users.map((u) => [u.id, u.name ?? u.id]));

  type Lech = { userId: string; ngay: string; dang: string; dung: string; coCa: boolean; kyChot: boolean };
  const lech: Lech[] = [];
  let coCa = 0;
  for (const r of rows) {
    const ca = caTheoNgay.get(khoaCa(r.userId, r.workDate)) ?? null;
    if (ca) coCa += 1;
    const dung = noiChiuCongCuaNgay({
      centerIdCaDuocXep: ca,
      centerIdNha: nhaTheoUser.get(r.userId) ?? HO_CENTER_ID,
    });
    if (dung === r.centerId) continue;
    const ky = vnYmd(r.workDate).slice(0, 7);
    lech.push({
      userId: r.userId,
      ngay: vnYmd(r.workDate),
      dang: tenCoSo.get(r.centerId) ?? r.centerId,
      dung: tenCoSo.get(dung) ?? dung,
      coCa: Boolean(ca),
      kyChot: kyChot.get(`${r.centerId}|${ky}`) === "LOCKED" || kyChot.get(`${dung}|${ky}`) === "LOCKED",
    });
  }

  dong("dòng ngày công đã đọc", rows.length);
  dong("  trong đó CÓ ca xếp", coCa);
  dong("  trong đó KHÔNG có ca xếp", rows.length - coCa);
  dong("LỆCH nơi chịu công", lech.length);
  dong("  · nhóm KHÔNG CÓ CA — đúng nạn nhân của bug", lech.filter((x) => !x.coCa).length);
  dong("  · nhóm CÓ CA — chuyện KHÁC, phải soi riêng", lech.filter((x) => x.coCa).length);
  dong("  · thuộc kỳ ĐÃ CHỐT (tính lại cũng bị bỏ qua)", lech.filter((x) => x.kyChot).length);

  // ── Câu 4: orgUnitId sai kéo theo THAM SỐ VẬN HÀNH nào? ───────────────────
  //
  // `recompute` đọc 6 tham số theo `orgUnitId`: 5 cái trong `loadEngineRules`
  // (lateGrace · earlyArrival · duplicateTap · maxLogsPerDay · pairingMaxGap) + weeklyOffDays.
  // Override theo cơ sở nằm ở `CenterSetting (orgUnitId, key)`. KHÔNG có dòng nào thì mọi
  // orgUnit cùng rơi về giá trị toàn hệ thống ⇒ gán sai `orgUnitId` KHÔNG đổi tham số nào,
  // và tính lại cũng không làm ngưỡng trễ / ngày nghỉ tuần nhúc nhích.
  //
  // Đây là phép đo RẺ NHẤT trả lời được "số đó có đổi sau khi tính lại không" — và nó chạy
  // BẤT KỂ có dòng lệch hay không, vì câu trả lời "không ai đè" tự nó đã là kết luận.
  tieu("Câu 4 — tham số vận hành có bị lệch theo không?");
  const KHOA_SHIFT = [
    "shift.lateGraceMinutes",
    "shift.earlyArrivalMinutes",
    "shift.duplicateTapMinutes",
    "shift.maxLogsPerDay",
    "shift.pairingMaxGapMinutes",
    "shift.weeklyOffDays",
  ];
  const override = await db.centerSetting.findMany({
    where: { key: { in: KHOA_SHIFT } },
    select: { orgUnitId: true, key: true, valueJson: true },
  });
  dong("dòng CenterSetting đè khoá shift.*", override.length);
  if (override.length === 0) {
    console.log("");
    console.log("  ⇒ KHÔNG cơ sở nào đè tham số `shift.*`. Mọi orgUnit cùng rơi về giá trị toàn");
    console.log("    hệ thống, nên `orgUnitId` bị gán sai KHÔNG đổi tham số nào: ngưỡng trễ và");
    console.log("    ngày nghỉ tuần của các ngày lệch đã tính bằng ĐÚNG bộ tham số.");
    console.log("    (Đây là số ĐO, không phải chưa đo.)");
  } else {
    const donVi = await db.orgUnit.findMany({
      where: { id: { in: [...new Set(override.map((o) => o.orgUnitId))] } },
      select: { id: true, code: true, name: true },
    });
    const tenDonVi = new Map(donVi.map((o) => [o.id, o.code ?? o.name]));
    console.log("");
    console.log(`  ${"đơn vị".padEnd(22)}${"khoá".padEnd(32)}giá trị đè`);
    for (const o of override) {
      console.log(
        `  ${String(tenDonVi.get(o.orgUnitId) ?? o.orgUnitId).slice(0, 21).padEnd(22)}` +
          `${o.key.padEnd(32)}${JSON.stringify(o.valueJson)}`,
      );
    }
    console.log("");
    console.log("  ⚠️ CÓ đè ⇒ phải soi từng ngày lệch: nếu `orgUnitId` nó đã dùng có đè khoá nào ở");
    console.log("     trên thì ngưỡng trễ / nghỉ tuần của ngày đó ĐÃ tính sai, và tính lại sẽ đổi");
    console.log("     cả cờ DI_MUON / VE_SOM chứ không chỉ đổi cột cơ sở.");
  }


  if (lech.length === 0) {
    console.log("\n  KHÔNG có dòng nào lệch. (Đây là số ĐO, không phải chưa đo.)");
    return;
  }

  tieu("Gom theo NGƯỜI");
  const theoNguoi = new Map<string, Lech[]>();
  for (const l of lech) {
    const a = theoNguoi.get(l.userId) ?? [];
    a.push(l);
    theoNguoi.set(l.userId, a);
  }
  console.log(`  ${"người".padEnd(30)}${"số ngày".padStart(8)}  đang ghi → đáng ra`);
  for (const [uid, ds] of [...theoNguoi.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const cap = [...new Set(ds.map((x) => `${x.dang} → ${x.dung}`))].join(" · ");
    console.log(`  ${String(tenNguoi.get(uid)).slice(0, 29).padEnd(30)}${String(ds.length).padStart(8)}  ${cap}`);
  }

  tieu("Gom theo THÁNG — để biết kỳ nào phải tính lại");
  const theoThang = new Map<string, number>();
  for (const l of lech) theoThang.set(l.ngay.slice(0, 7), (theoThang.get(l.ngay.slice(0, 7)) ?? 0) + 1);
  for (const [k, n] of [...theoThang.entries()].sort()) dong(k, n);

  console.log("");
  console.log("  ⚠️ Script này KHÔNG sửa gì. Muốn các dòng trên mang đúng cơ sở thì phải TÍNH LẠI");
  console.log("     (`recomputeRange`) — một lượt RIÊNG, và phải báo kế toán trước vì số công theo");
  console.log("     cơ sở sẽ đổi ở cả hai đầu (nơi mất đi và nơi nhận về).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    await kiemDb.$disconnect();
  });
