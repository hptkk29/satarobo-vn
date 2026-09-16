/**
 * scripts/do-luoi-ca-gv-parttime.ts — LƯỚI CA của GV parttime có khớp SỐ BUỔI DẠY THẬT
 * không. CHỈ ĐỌC.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO — giả thuyết phải bác hoặc xác nhận TRƯỚC khi hỏi Kế toán (16/09/2026)
 *
 * Đo trước đó: 13 người "có công mà không quét lần nào", **9/13 thuộc phòng Đào tạo**, mà
 * 8/10 giáo viên là **parttime**. Giả thuyết:
 *
 *   Lưới ca sinh cho GV parttime NHIỀU NGÀY HƠN số ngày họ thực dạy ⇒ những "ngày thiếu
 *   quét" kia là **lưới sai**, không phải người vắng mặt.
 *
 * Chủ dự án 16/09: *"Nếu lưới xếp nhiều hơn buổi dạy một cách có hệ thống ⇒ đây là bug lưới,
 * không phải câu hỏi tiền, và tôi không hỏi chị Huệ về nó nữa."*
 *
 * ⚠️ "MỘT CÁCH CÓ HỆ THỐNG" là vế phải đo, không phải cảm nhận. Một hai người lệch thì có
 * thể là họ nghỉ thật. Nên script in TỪNG NGƯỜI, và chỉ kết luận khi đa số cùng lệch một
 * chiều — vế đối chứng (người lệch ngược, hoặc khớp) cũng in ra để thấy mình không chỉ nhìn
 * thứ mình muốn thấy.
 *
 * ⚠️ BUỔI DẠY đếm theo `actualTeacherId ?? substituteTeacherId ?? class.teacherId` — ĐÚNG
 * chuỗi ưu tiên `buildPeriodSummary` dùng, không tự chế. Và đếm buổi KHÔNG bị huỷ, không chỉ
 * `COMPLETED`: câu hỏi là "hôm ấy có lịch dạy không", chứ không phải "buổi đã chốt chưa".
 *
 * ⚠️ CHỈ ĐỌC. Không in họ tên — xem luật ở `docs/cham-cong/USER-CHI-DOC-PROD.md`.
 *
 * CHẠY: pnpm tsx scripts/do-luoi-ca-gv-parttime.ts
 */
// `_load-env` phải chạy TRƯỚC mọi import chạm Prisma.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";
import { db } from "../lib/db";
import { vnYmd } from "../lib/time/vn";

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
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  console.log(`DB host: ${currentDbHost() ?? "(không đọc được)"}`);
  inQuyen(await kiemQuyen(kiemDb), false);
  const homNayYmd = vnYmd(new Date());
  const homNay = new Date(`${homNayYmd}T00:00:00.000Z`);

  const ky =
    (await db.attendancePeriod.findFirst({ select: { periodKey: true }, orderBy: { periodKey: "desc" } }))
      ?.periodKey ?? homNayYmd.slice(0, 7);
  const [y, m] = ky.split("-").map(Number);
  const from = new Date(Date.UTC(y!, m! - 1, 1));
  const to = new Date(Date.UTC(y!, m!, 0));
  console.log(`Kỳ đo: ${ky}   (hôm nay giờ VN: ${homNayYmd})`);

  // ── AI LÀ GV PARTTIME ─────────────────────────────────────────────────────
  // Theo khoá B chủ dự án chốt: `department` × `contractType`. KHÔNG dùng vai RBAC —
  // 7/19 người mang nhiều vai nên vai không đơn trị (xem `do-cong-chuan-theo-role.ts`).
  const gvPt = await db.employee.findMany({
    where: {
      department: { in: ["DAO_TAO", "GIANG_DAY"] },
      contractType: "PARTTIME",
      userAccount: { isNot: null },
    },
    select: { employeeCode: true, userAccount: { select: { id: true } } },
    orderBy: { employeeCode: "asc" },
  });
  const ids = gvPt.map((e) => e.userAccount!.id);
  tieu(`GV PARTTIME (department ∈ {DAO_TAO, GIANG_DAY} × contractType = PARTTIME)`);
  dong("Số người", gvPt.length);
  if (ids.length === 0) {
    console.log("  Không ai — dừng. (Nếu bất ngờ thì khoá B đang không khớp dữ liệu thật.)");
    return;
  }

  const [ca, buoi, ngayCong] = await Promise.all([
    db.shiftAssignment.findMany({
      where: { userId: { in: ids }, workDate: { gte: from, lte: to }, status: "ACTIVE" },
      select: { userId: true, workDate: true, templateCode: true, source: true, isLeave: true },
    }),
    db.classSession.findMany({
      where: {
        date: { gte: from, lt: new Date(to.getTime() + 86_400_000) },
        status: { not: "CANCELLED" },
      },
      select: {
        date: true,
        status: true,
        actualTeacherId: true,
        substituteTeacherId: true,
        class: { select: { teacherId: true } },
      },
    }),
    db.staffAttendanceDay.findMany({
      where: { userId: { in: ids }, workDate: { gte: from, lte: homNay } },
      select: { userId: true, workDate: true, dayType: true, dayCreditExpected: true, dayCreditEarned: true, overrideUnits: true, workedMinutes: true, flags: true },
    }),
  ]);

  // Buổi dạy quy về NGƯỜI theo đúng chuỗi ưu tiên `buildPeriodSummary` dùng.
  const buoiCuaNguoi = new Map<string, Set<string>>();
  for (const s of buoi) {
    const t = s.actualTeacherId ?? s.substituteTeacherId ?? s.class.teacherId;
    if (!t || !ids.includes(t)) continue;
    const set = buoiCuaNguoi.get(t) ?? new Set<string>();
    set.add(ymd(s.date));
    buoiCuaNguoi.set(t, set);
  }

  // ── BẢNG CHÍNH ────────────────────────────────────────────────────────────
  tieu(`SO LƯỚI XẾP ↔ BUỔI DẠY THẬT — từng người (kỳ ${ky}, cả tháng)`);
  console.log(
    `  ${"MÃ NV".padEnd(13)}${"NGÀY LƯỚI".padStart(10)}${"NGÀY DẠY".padStart(10)}${"LỆCH".padStart(7)}` +
      `${"LƯỚI ko DẠY".padStart(13)}${"DẠY ko LƯỚI".padStart(13)}${"THIẾU QUÉT".padStart(12)}`,
  );

  let tongLuoiThua = 0;
  let soNguoiLuoiThua = 0;
  let soNguoiKhop = 0;
  let soNguoiDayThua = 0;

  for (const e of gvPt) {
    const uid = e.userAccount!.id;
    // Ngày LƯỚI: ca ACTIVE, KHÔNG phải mã nghỉ (nghỉ thì không ai mong họ đến).
    const ngayLuoi = new Set(ca.filter((c) => c.userId === uid && !c.isLeave).map((c) => ymd(c.workDate)));
    const ngayDay = buoiCuaNguoi.get(uid) ?? new Set<string>();
    const luoiKhongDay = [...ngayLuoi].filter((d) => !ngayDay.has(d)).length;
    const dayKhongLuoi = [...ngayDay].filter((d) => !ngayLuoi.has(d)).length;
    // "Thiếu quét" = đúng nhóm ① của phép đo trước: ngày WORK đã qua, có công, 0 phút,
    // mang cờ KHONG_CO_LUOT.
    const thieuQuet = ngayCong.filter(
      (d) =>
        d.userId === uid &&
        d.dayType === "WORK" &&
        d.dayCreditExpected > 0 &&
        (d.overrideUnits ?? d.dayCreditEarned) > 0 &&
        d.workedMinutes === 0 &&
        d.flags.includes("KHONG_CO_LUOT"),
    ).length;

    const lech = ngayLuoi.size - ngayDay.size;
    if (lech > 0) {
      tongLuoiThua += lech;
      soNguoiLuoiThua += 1;
    } else if (lech === 0) soNguoiKhop += 1;
    else soNguoiDayThua += 1;

    console.log(
      `  ${e.employeeCode.padEnd(13)}${String(ngayLuoi.size).padStart(10)}${String(ngayDay.size).padStart(10)}` +
        `${(lech > 0 ? `+${lech}` : String(lech)).padStart(7)}${String(luoiKhongDay).padStart(13)}` +
        `${String(dayKhongLuoi).padStart(13)}${String(thieuQuet).padStart(12)}`,
    );
  }

  tieu("CÓ 'MỘT CÁCH CÓ HỆ THỐNG' KHÔNG — vế đối chứng in cùng, không chỉ vế thuận");
  dong("Người có LƯỚI NHIỀU HƠN buổi dạy", soNguoiLuoiThua);
  dong("Người KHỚP đúng", soNguoiKhop);
  dong("Người có BUỔI DẠY NHIỀU HƠN lưới (lệch ngược)", soNguoiDayThua);
  dong("Σ ngày lưới thừa", tongLuoiThua);
  console.log("");
  console.log("  ⓘ Kết luận 'bug lưới' CHỈ đứng được khi đa số lệch CÙNG MỘT CHIỀU.");
  console.log("    Vài người lệch thì có thể họ nghỉ thật, hoặc dạy thay ở lớp không thuộc mình.");

  // ── CA LẤY TỪ ĐÂU ─────────────────────────────────────────────────────────
  tieu("CA CỦA GV PARTTIME LẤY TỪ ĐÂU — `ShiftAssignment.source`");
  const theoNguon = new Map<string, number>();
  for (const c of ca) theoNguon.set(String(c.source), (theoNguon.get(String(c.source)) ?? 0) + 1);
  for (const [k, n] of [...theoNguon.entries()].sort((a, b) => b[1] - a[1])) dong(`  ${k}`, n);
  console.log("");
  console.log("  PATTERN = sinh từ khung ca tuần · IMPORT = nạp lưới Excel · MANUAL = sửa tay");

  // ── KHUNG CA TUẦN KHAI HỌ LÀM MẤY NGÀY/TUẦN ──────────────────────────────
  const khung = await db.shiftWeeklyPattern.findMany({
    where: { userId: { in: ids } },
    select: { userId: true, weekday: true, templateCode: true, effectiveFrom: true, effectiveTo: true },
  });
  const maCua = new Map(gvPt.map((e) => [e.userAccount!.id, e.employeeCode]));
  tieu("KHUNG CA TUẦN đang khai GV parttime làm mấy ngày/tuần");
  dong("Tổng dòng khung ca của nhóm này", khung.length);
  if (khung.length === 0) {
    console.log("  KHÔNG dòng nào ⇒ ca của họ KHÔNG đến từ khung ca tuần.");
    console.log("  Đối chiếu bảng `source` ở trên để biết nó đến từ đâu.");
  } else {
    console.log("");
    console.log(`  ${"MÃ NV".padEnd(13)}${"NGÀY/TUẦN".padStart(11)}   MÃ CA THEO THỨ (0=CN … 6=T7)`);
    const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    for (const uid of ids) {
      const cua = khung.filter((k) => k.userId === uid);
      if (cua.length === 0) continue;
      const theoThu = cua
        .sort((a, b) => a.weekday - b.weekday)
        .map((k) => `${WD[k.weekday]}:${k.templateCode}`)
        .join(" ");
      console.log(`  ${(maCua.get(uid) ?? "—").padEnd(13)}${String(cua.length).padStart(11)}   ${theoThu}`);
    }
    const khongCoKhung = ids.filter((u) => !khung.some((k) => k.userId === u));
    console.log("");
    dong("GV parttime KHÔNG có dòng khung ca nào", khongCoKhung.length);
    for (const u of khongCoKhung) console.log(`    ${maCua.get(u) ?? u}`);
  }

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
