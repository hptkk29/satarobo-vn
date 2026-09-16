/**
 * scripts/do-noi-quet.ts — NƠI QUÉT vs NƠI CHỊU CÔNG trên prod. CHỈ ĐỌC.
 *
 * Không có chế độ ghi, không tham số nào bật ghi. Toàn bộ là `findMany`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO — D1, ảnh prod 10/09/2026
 *
 * Bảng công ngày hiện một lượt của người Hội sở là `08:39 → — ·1 · quét nơi khác`. Nhãn đó
 * VÔ NGHĨA với người đọc: hệ **biết chính xác** lượt đó ở đâu — nó đến từ QR của một điểm
 * chấm cụ thể, và `StaffTimeLog` lưu cả `centerId` lẫn `workLocationId` của điểm ấy.
 *
 * Chuỗi dữ liệu (đọc mã, không suy):
 *   `WorkLocation` → `recordTimeLog`: `centerId = wl.centerId`  ⇒ NƠI QUÉT
 *   `recomputeAttendanceDay`: `centerId = assignment?.centerId ?? logs[0]?.centerId ?? home`
 *                                                                ⇒ NƠI CHỊU CÔNG
 * Hai cái CỐ Ý khác nhau. Chỗ làm rụng tên là **nhãn ở bảng công ngày**, nơi so
 * `l.centerId !== coSo` rồi in một chuỗi cố định thay vì in tên cơ sở đã biết.
 *
 * Script này đếm xem chuyện đó xảy ra bao nhiêu lần thật, của ai, và mang cờ gì — để biết
 * bản vá nhãn có đáng không, và để trả lời "cờ nào đang gắn cho ca này".
 *
 * CHẠY: pnpm tsx scripts/do-noi-quet.ts [số ngày lùi lại, mặc định 60]
 */
// `_load-env` phải chạy TRƯỚC `_script-db` — Prisma đọc DATABASE_URL ngay lúc khởi tạo module.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";

const db = scriptDb();

function tieu(s: string) {
  console.log("");
  console.log("═".repeat(92));
  console.log(s);
  console.log("═".repeat(92));
}
function dong(nhan: string, n: number | string) {
  console.log(`  ${nhan.padEnd(58)} ${String(n).padStart(8)}`);
}

async function main() {
  console.log(`DB host: ${currentDbHost() ?? "(không đọc được)"}`);
  inQuyen(await kiemQuyen(db), false);

  const soNgay = Number(process.argv[2] ?? 60) || 60;
  const tu = new Date(Date.now() - soNgay * 86_400_000);
  tieu(`NƠI QUÉT vs NƠI CHỊU CÔNG — ${soNgay} ngày gần nhất (chỉ đọc)`);

  const logs = await db.staffTimeLog.findMany({
    where: { result: "ACCEPTED", workDate: { gte: tu } },
    select: {
      id: true, userId: true, workDate: true, direction: true, loggedAt: true,
      centerId: true, workLocationId: true, flags: true, source: true,
    },
    orderBy: { loggedAt: "asc" },
  });
  dong("lượt quét ACCEPTED", logs.length);
  if (logs.length === 0) {
    console.log('\n⚠️ 0 lượt. Nếu đây là prod thì xem docs/cham-cong/USER-CHI-DOC-PROD.md mục "Nếu số đo ra 0".');
    return;
  }

  // Ngày công tương ứng — NƠI CHỊU CÔNG.
  const ngay = await db.staffAttendanceDay.findMany({
    where: {
      userId: { in: [...new Set(logs.map((l) => l.userId))] },
      workDate: { gte: tu },
    },
    select: { userId: true, workDate: true, centerId: true, templateCode: true },
  });
  const chiuCong = new Map(ngay.map((d) => [`${d.userId}|${d.workDate.toISOString().slice(0, 10)}`, d]));

  const [coSo, diem, users] = await Promise.all([
    db.center.findMany({ select: { id: true, code: true, name: true } }),
    db.workLocation.findMany({ select: { id: true, code: true, name: true, centerId: true } }),
    db.user.findMany({
      where: { id: { in: [...new Set(logs.map((l) => l.userId))] } },
      select: { id: true, name: true, email: true, employee: { select: { employeeCode: true, fullName: true } } },
    }),
  ]);
  const maCoSo = new Map(coSo.map((c) => [c.id, c.code ?? c.id]));
  const tenDiem = new Map(diem.map((d) => [d.id, `${d.code} · ${d.name}`]));
  const tenNguoi = new Map(
    users.map((u) => [u.id, u.employee?.fullName ?? u.name ?? u.email ?? u.id]),
  );

  // ── Lượt quét ở cơ sở KHÁC nơi chịu công ───────────────────────────────────
  const khac = logs.filter((l) => {
    const d = chiuCong.get(`${l.userId}|${l.workDate.toISOString().slice(0, 10)}`);
    return d != null && d.centerId !== l.centerId;
  });
  const chuaTinh = logs.filter(
    (l) => !chiuCong.has(`${l.userId}|${l.workDate.toISOString().slice(0, 10)}`),
  );

  dong("  quét ĐÚNG nơi chịu công", logs.length - khac.length - chuaTinh.length);
  dong("  quét ở cơ sở KHÁC nơi chịu công", khac.length);
  dong("  ngày chưa được tính (không so được)", chuaTinh.length);

  if (khac.length > 0) {
    tieu("Chi tiết: lượt quét ở cơ sở KHÁC (tối đa 25 dòng)");
    console.log(
      `  ${"người".padEnd(26)}${"ngày".padEnd(12)}${"giờ".padEnd(7)}${"chiều".padEnd(6)}` +
        `${"NƠI QUÉT".padEnd(10)}${"CHỊU CÔNG".padEnd(11)}${"mã ca".padEnd(8)}cờ`,
    );
    for (const l of khac.slice(0, 25)) {
      const d = chiuCong.get(`${l.userId}|${l.workDate.toISOString().slice(0, 10)}`)!;
      const gio = new Date(l.loggedAt.getTime() + 7 * 3_600_000).toISOString().slice(11, 16);
      console.log(
        `  ${(tenNguoi.get(l.userId) ?? l.userId).slice(0, 24).padEnd(26)}` +
          `${l.workDate.toISOString().slice(0, 10).padEnd(12)}${gio.padEnd(7)}` +
          `${(l.direction === "CHECK_IN" ? "vào" : "ra").padEnd(6)}` +
          `${(maCoSo.get(l.centerId) ?? "?").padEnd(10)}${(maCoSo.get(d.centerId) ?? "?").padEnd(11)}` +
          `${(d.templateCode ?? "—").padEnd(8)}${l.flags.join(",") || "(không cờ)"}`,
      );
      console.log(`      điểm chấm: ${l.workLocationId ? (tenDiem.get(l.workLocationId) ?? l.workLocationId) : "(không có)"}`);
    }
    if (khac.length > 25) console.log(`    … và ${khac.length - 25} lượt nữa`);

    // Cờ đang gắn cho đúng nhóm này — câu "cờ nào đang gắn, còn đúng không sau thay đổi".
    tieu("Cờ đang gắn trên nhóm quét-ở-cơ-sở-khác");
    const demCo = new Map<string, number>();
    for (const l of khac) {
      if (l.flags.length === 0) demCo.set("(không cờ)", (demCo.get("(không cờ)") ?? 0) + 1);
      for (const f of l.flags) demCo.set(f, (demCo.get(f) ?? 0) + 1);
    }
    for (const [f, n] of [...demCo.entries()].sort((a, b) => b[1] - a[1])) dong(f, n);
  }

  // ── Toạ độ: phần A cần biết cột nào đang có, và có bao nhiêu lượt thực sự có ─
  tieu("Toạ độ đang lưu được bao nhiêu (phần A cần số này)");
  const coToaDo = await db.staffTimeLog.count({
    where: { result: "ACCEPTED", workDate: { gte: tu }, latitude: { not: null }, longitude: { not: null } },
  });
  const coDoChinhXac = await db.staffTimeLog.count({
    where: { result: "ACCEPTED", workDate: { gte: tu }, accuracyMeters: { not: null } },
  });
  dong("lượt CÓ latitude + longitude", coToaDo);
  dong("lượt CÓ accuracyMeters", coDoChinhXac);
  dong("lượt KHÔNG có toạ độ", logs.length - coToaDo);

  // ── Mã ca NG (công tác ngoài) — phần A câu 5 ────────────────────────────────
  tieu("Ngày công mã NG (công tác ngoài) — phần A câu 5");
  const ngNgay = await db.staffAttendanceDay.findMany({
    where: { templateCode: "NG" },
    select: { userId: true, workDate: true, centerId: true },
  });
  dong("ngày công mã NG (mọi thời điểm)", ngNgay.length);
  dong("  của bao nhiêu người", new Set(ngNgay.map((x) => x.userId)).size);
  const ngLuoi = await db.shiftAssignment.count({ where: { templateCode: "NG", status: "ACTIVE" } });
  dong("ô lưới phân ca mã NG đang ACTIVE", ngLuoi);

  console.log("");
  console.log("Toàn bộ phép đo trên là SELECT. Không dòng nào bị ghi.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
