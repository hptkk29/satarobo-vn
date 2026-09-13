/**
 * scripts/tinh-lai-mot-ngay.ts — TÍNH LẠI ĐÚNG MỘT (người × ngày). Chụp TRƯỚC/SAU.
 *
 * ⚠️ CHẠY THỬ LÀ MẶC ĐỊNH. Ghi thật phải có `--apply`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO — bug prod 13/09/2026 (PR #243)
 *
 * `recompute.ts` từng chốt nơi chịu công bằng
 * `assignment?.centerId ?? logs[0]?.centerId ?? home.centerId` — NƠI QUÉT chen vào giữa.
 * Mã đã vá, nhưng dòng ĐÃ GHI chỉ đổi khi có lượt tính lại.
 *
 * Đo prod 13/09 bằng `scripts/do-noi-chiu-cong-lech.ts`:
 *
 *   dòng ngày công đã đọc                525
 *   LỆCH nơi chịu công                     1   ← đúng MỘT dòng
 *     · nhóm KHÔNG CÓ CA                   1   ← đúng nạn nhân của bug
 *     · thuộc kỳ ĐÃ CHỐT                   0
 *   dòng CenterSetting đè khoá shift.*     0   ← tham số vận hành KHÔNG lệch theo
 *
 * ⇒ Việc cần làm nhỏ đúng bằng một dòng. Script này CỐ Ý chỉ nhận MỘT người và MỘT ngày —
 * không có chế độ chạy cả dải. Muốn dải thì đó là việc khác, có phép đo khác, và phải báo
 * kế toán trước.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NÓ CHẠM GÌ
 *
 * Gọi `recomputeAttendanceDay(userId, workDate)` — ĐÚNG hàm mà cron và đường điểm danh gọi,
 * không tự chế `UPDATE` (luật 9: cổng phải được cho ăn bằng đường THẬT). Nghĩa là:
 *   · kỳ `LOCKED` ⇒ hàm tự trả `skipped: "LOCKED"`, không ghi gì — cổng nằm trong hàm;
 *   · miễn chấm công (`timesheetExempt`) ⇒ `skipped: "EXEMPT"` — và hàm **XOÁ** dòng ngày công.
 *     Đọc kỹ: với người miễn chấm công, "tính lại" nghĩa là MẤT dòng. Ca của ta không phải vậy
 *     (người có dòng công thật), nhưng nhánh chạy thử in sẵn cờ ấy để thấy trước khi bấm;
 *   · mọi cờ / công / phút làm đều do engine tính lại, không phải số tôi gõ.
 *
 * CHẠY:
 *   pnpm tsx scripts/tinh-lai-mot-ngay.ts --user=<id> --ngay=2026-09-08          # chạy thử
 *   pnpm tsx scripts/tinh-lai-mot-ngay.ts --user=<id> --ngay=2026-09-08 --apply  # ghi thật
 */
// `_load-env` phải chạy TRƯỚC mọi import chạm Prisma.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";
import { db } from "../lib/db";
import { resolveHomeCenter } from "../lib/cham-cong/home-center";
import { vnYmd } from "../lib/time/vn";

const kiemDb = scriptDb();

const argv = process.argv.slice(2);
const GHI = argv.includes("--apply");
const lay = (ten: string): string | null => {
  const p = argv.find((a) => a.startsWith(`--${ten}=`));
  return p ? p.slice(ten.length + 3) : null;
};

function tieu(s: string) {
  console.log("");
  console.log("═".repeat(92));
  console.log(s);
  console.log("═".repeat(92));
}

/** Đúng những cột mà bug này chạm tới, cộng số công để thấy nó KHÔNG đổi. */
const CHUP = {
  id: true,
  centerId: true,
  orgUnitId: true,
  dayType: true,
  workedMinutes: true,
  dayCreditExpected: true,
  dayCreditEarned: true,
  overrideUnits: true,
  status: true,
  flags: true,
  updatedAt: true,
} as const;

function inDong(nhan: string, r: Record<string, unknown> | null) {
  if (!r) {
    console.log(`  ${nhan.padEnd(8)} (không có dòng nào)`);
    return;
  }
  console.log(`  ${nhan.padEnd(8)} centerId=${String(r.centerId)}`);
  console.log(`  ${"".padEnd(8)} orgUnitId=${String(r.orgUnitId ?? "null")}`);
  console.log(
    `  ${"".padEnd(8)} dayType=${String(r.dayType)} · phút=${String(r.workedMinutes)}` +
      ` · côngChuẩn=${String(r.dayCreditExpected)} · côngĐạt=${String(r.dayCreditEarned)}` +
      ` · ghiĐè=${String(r.overrideUnits ?? "—")}` +
      ` · status=${String(r.status)}`,
  );
  console.log(`  ${"".padEnd(8)} cờ=[${(r.flags as string[]).join(", ")}]`);
}

async function main() {
  const userId = lay("user");
  const ngayStr = lay("ngay");
  if (!userId || !ngayStr || !/^\d{4}-\d{2}-\d{2}$/.test(ngayStr)) {
    console.error("Thiếu tham số. Cần: --user=<userId> --ngay=YYYY-MM-DD [--apply]");
    process.exitCode = 1;
    return;
  }
  const [y, m, d] = ngayStr.split("-").map(Number);
  const workDate = new Date(Date.UTC(y, m - 1, d));

  console.log(`DB host: ${currentDbHost() ?? "(không đọc được)"}`);
  // Tự khai: lượt này CÓ ý định ghi khi `--apply`. Dòng đầu log phải nói thật về quyền.
  inQuyen(await kiemQuyen(kiemDb), GHI);
  tieu(GHI ? "TÍNH LẠI MỘT NGÀY — GHI THẬT (--apply)" : "TÍNH LẠI MỘT NGÀY — CHẠY THỬ (chưa ghi gì)");

  const nguoi = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!nguoi) {
    console.error(`Không có user id=${userId}. DỪNG, không chạm gì.`);
    process.exitCode = 1;
    return;
  }
  // Cơ sở "nhà" đọc bằng ĐÚNG hàm `recompute` sẽ gọi — không tự suy từ `User.centerId`
  // (`timesheetExempt` nằm trên `Employee`, không nằm trên `User`).
  const nha = await resolveHomeCenter(userId);
  console.log(`  người : ${nguoi.name ?? nguoi.email ?? nguoi.id}  (id=${nguoi.id})`);
  console.log(`  ngày  : ${vnYmd(workDate)}`);
  console.log(`  nhà   : ${nha.centerCode} (${nha.centerId})${nha.isHo ? "  ← Hội sở" : ""}`);
  if (nha.timesheetExempt) {
    console.error("");
    console.error("  ⛔ Người này MIỄN CHẤM CÔNG. `recomputeAttendanceDay` sẽ XOÁ dòng ngày công,");
    console.error("     không phải sửa nó. DỪNG — đây không phải việc đang làm.");
    process.exitCode = 1;
    return;
  }

  // Bối cảnh — vì sao dòng này lệch. Không có ca xếp chính là điều kiện để bug cũ nổ.
  const ca = await db.shiftAssignment.findFirst({
    where: { userId, workDate, status: "ACTIVE" },
    select: { templateCode: true, centerId: true },
  });
  const soLuot = await db.staffTimeLog.count({ where: { userId, workDate, result: "ACCEPTED" } });
  console.log(`  ca xếp: ${ca ? `${ca.templateCode} @ ${ca.centerId}` : "KHÔNG CÓ  ← điều kiện của bug cũ"}`);
  console.log(`  lượt quét ACCEPTED: ${soLuot}`);

  tieu("TRƯỚC");
  const truoc = await db.staffAttendanceDay.findUnique({
    where: { userId_workDate: { userId, workDate } },
    select: CHUP,
  });
  inDong("trước", truoc);

  if (!GHI) {
    console.log("");
    console.log("  Chưa ghi gì. Thêm `--apply` để tính lại thật.");
    console.log("  Khi chạy thật, script gọi ĐÚNG `recomputeAttendanceDay` mà cron dùng —");
    console.log("  kỳ đã chốt thì chính hàm đó trả `skipped: LOCKED` và không ghi gì.");
    return;
  }

  // Import ĐỘNG: `lib/cham-cong/recompute` kéo theo cây `lib/*`, để tới đây mới nạp thì
  // nhánh chạy thử ở trên không phải trả giá nạp module.
  const { recomputeAttendanceDay } = await import("../lib/cham-cong/recompute");
  const kq = await recomputeAttendanceDay(userId, workDate);
  console.log("");
  console.log(`  kết quả: ${kq.skipped ? `BỎ QUA (${kq.skipped})` : "đã tính lại"}`);

  tieu("SAU");
  const sau = await db.staffAttendanceDay.findUnique({
    where: { userId_workDate: { userId, workDate } },
    select: CHUP,
  });
  inDong("sau", sau);

  tieu("ĐỔI GÌ");
  if (!truoc || !sau) {
    console.log("  (một trong hai phía không có dòng — xem lại ở trên)");
  } else {
    const khoa = Object.keys(CHUP) as (keyof typeof CHUP)[];
    let n = 0;
    for (const k of khoa) {
      const a = JSON.stringify(truoc[k as keyof typeof truoc]);
      const b = JSON.stringify(sau[k as keyof typeof sau]);
      if (a === b) continue;
      n += 1;
      console.log(`  ${String(k).padEnd(18)} ${a}  →  ${b}`);
    }
    if (n === 0) console.log("  KHÔNG cột nào đổi.");
    console.log("");
    console.log("  ⚠️ Đọc kỹ: hai cột CÔNG không được đổi. Bug này chỉ gán sai CƠ SỞ.");
    console.log("     Nếu `dayCreditExpected` / `dayCreditEarned` đổi ⇒ có chuyện khác;");
    console.log("     DỪNG và báo trước khi chạy thêm bất kỳ dòng nào.");
  }

  console.log("");
  console.log("  Bước tiếp: chạy lại workflow ĐO (viec = noi-chiu-cong-lech) — phải ra LỆCH = 0.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([db.$disconnect(), kiemDb.$disconnect()]);
  });
