/**
 * scripts/do-cong-ngay-khong-quet.ts — NGÀY ĐÃ QUA mà KHÔNG quét lần nào thì có ăn công
 * không, và nếu có thì bao nhiêu tiền đang treo ở đó. CHỈ ĐỌC.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO — hai câu hỏi của chủ dự án 16/09/2026
 *
 * ① *"Cho tôi tên 2 người [thiếu loại hợp đồng], tôi đi hỏi Nhân sự."* — mục 4 chốt khoá
 *    `department × contractType`, và 2/19 người không khai `contractType` nên không xếp
 *    nhóm được. Chủ dự án chọn phương án (a): hệ thống TỪ CHỐI xếp nhóm khi thiếu.
 *
 * ② *"Việc của bạn bây giờ chỉ là ĐO cho đủ: 29 dòng đó thuộc bao nhiêu người, kỳ nào, đã
 *    chốt kỳ chưa, và trong số đó bao nhiêu là ngày có cờ KHONG_CO_LUOT. Số ấy quyết định
 *    nó là 'nhãn sai' hay 'tiền sai'."*
 *
 * ⚠️ TÔI CỐ Ý ĐO RỘNG HƠN CÂU HỎI, và nói rõ vì sao. Con số 29 hôm qua là "ngày đã qua
 * MANG CỜ `KHONG_CO_LUOT`" — nên hỏi "bao nhiêu trong 29 có cờ" thì câu trả lời là 29, tức
 * không biết thêm gì. Tập cần nhìn là **ngày đã qua có CÔNG mà KHÔNG có phút làm nào**, rồi
 * mới tách theo cờ. Tập ấy rộng hơn và nó mới là tập chạm tiền.
 *
 * ⚠️ VÀ PHẢI TÁCH `dayType`. Ngày NGHỈ PHÉP và ngày LỄ đương nhiên 0 phút làm mà vẫn có
 * công — đó là đúng, không phải lỗi. Gộp chúng vào là báo động giả và sẽ làm người đọc mất
 * niềm tin vào cả phép đo. Chỉ ngày `WORK` có kế hoạch công mới đáng ngờ.
 *
 * ⚠️ CHỈ ĐỌC. Không tham số nào bật ghi.
 * ⚠️ KHÔNG in họ tên/email (repo PUBLIC — log Actions ai cũng đọc được). Mục ① in `employeeCode`
 *    + phòng ban: đủ để Nhân sự tra ra người, mà không phải là tên thật trên một log mở.
 *
 * CHẠY: pnpm tsx scripts/do-cong-ngay-khong-quet.ts
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
  console.log("═".repeat(96));
  console.log(s);
  console.log("═".repeat(96));
}
function dong(nhan: string, n: number | string) {
  console.log(`  ${nhan.padEnd(62)} ${String(n).padStart(10)}`);
}

async function main() {
  console.log(`DB host: ${currentDbHost() ?? "(không đọc được)"}`);
  inQuyen(await kiemQuyen(kiemDb), false);
  const homNayYmd = vnYmd(new Date());
  const homNay = new Date(`${homNayYmd}T00:00:00.000Z`);
  console.log(`Hôm nay (giờ VN): ${homNayYmd}`);

  // ══ ① AI THIẾU LOẠI HỢP ĐỒNG ══════════════════════════════════════════════
  //
  // Đúng tập người mục 4 cần xếp nhóm: có ngày công HOẶC có ca trong kỳ gần nhất.
  const kyMoiNhat = (
    await db.attendancePeriod.findFirst({
      select: { periodKey: true },
      orderBy: { periodKey: "desc" },
    })
  )?.periodKey;

  tieu(`① NGƯỜI KHÔNG XẾP NHÓM ĐƯỢC (thiếu contractType) — kỳ ${kyMoiNhat ?? "?"}`);
  if (kyMoiNhat) {
    const [y, m] = kyMoiNhat.split("-").map(Number);
    const from = new Date(Date.UTC(y!, m! - 1, 1));
    const to = new Date(Date.UTC(y!, m!, 0));
    const [ngay, ca] = await Promise.all([
      db.staffAttendanceDay.findMany({
        where: { workDate: { gte: from, lte: to } },
        select: { userId: true },
      }),
      db.shiftAssignment.findMany({
        where: { workDate: { gte: from, lte: to }, status: "ACTIVE" },
        select: { userId: true },
      }),
    ]);
    const userIds = [...new Set([...ngay.map((r) => r.userId), ...ca.map((r) => r.userId)])];

    const thieu = await db.employee.findMany({
      where: { userAccount: { id: { in: userIds } }, contractType: null },
      // KHÔNG `select` name/email — xem chú thích đầu file.
      select: { employeeCode: true, department: true, status: true },
      orderBy: { employeeCode: "asc" },
    });
    dong("Số người trong kỳ", userIds.length);
    dong("Trong đó THIẾU contractType", thieu.length);
    console.log("");
    for (const e of thieu) {
      console.log(
        `  mã NV = ${e.employeeCode.padEnd(14)} phòng ban = ${String(e.department).padEnd(20)} trạng thái = ${e.status}`,
      );
    }
    if (thieu.length === 0) console.log("  (không ai — mọi người đều đã khai loại hợp đồng)");
    console.log("");
    console.log("  ⓘ In MÃ NV chứ không in họ tên: log Actions của repo PUBLIC ai cũng đọc được.");
    console.log("    Nhân sự tra mã này ra người ngay trên màn /admin/nhan-su.");
  }

  // ══ ② NGÀY ĐÃ QUA, KHÔNG QUÉT, VẪN ĂN CÔNG ════════════════════════════════
  const daQua = await db.staffAttendanceDay.findMany({
    where: { workDate: { lte: homNay } },
    select: {
      userId: true,
      workDate: true,
      dayType: true,
      status: true,
      templateCode: true,
      dayCreditExpected: true,
      dayCreditEarned: true,
      overrideUnits: true,
      workedMinutes: true,
      flags: true,
    },
  });

  const cong = (d: (typeof daQua)[number]) => d.overrideUnits ?? d.dayCreditEarned;
  // Tập đáng ngờ: ngày LÀM VIỆC, có kế hoạch công, ăn công, mà KHÔNG phút làm nào.
  const dangNgo = daQua.filter(
    (d) => d.dayType === "WORK" && d.dayCreditExpected > 0 && cong(d) > 0 && d.workedMinutes === 0,
  );
  // Vế đối chứng: nghỉ/lễ cũng 0 phút và có công — nhưng đó là ĐÚNG.
  const nghiLe = daQua.filter((d) => d.dayType !== "WORK" && cong(d) > 0 && d.workedMinutes === 0);

  tieu("② NGÀY ĐÃ QUA · dayType = WORK · có công · KHÔNG phút làm nào");
  dong("Tổng dòng ngày đã qua", daQua.length);
  dong("⇒ ĐÁNG NGỜ (work · có công · 0 phút)", dangNgo.length);
  dong("   — số NGƯỜI dính", new Set(dangNgo.map((d) => d.userId)).size);
  dong("   — Σ CÔNG đang treo ở đó", Math.round(dangNgo.reduce((s, d) => s + cong(d), 0) * 100) / 100);
  console.log("");
  dong("Đối chứng: ngày nghỉ/lễ (0 phút + có công là ĐÚNG)", nghiLe.length);

  tieu("②a TÁCH THEO CỜ — 'nhãn sai' hay 'tiền sai'");
  const coLuot = dangNgo.filter((d) => d.flags.includes("KHONG_CO_LUOT"));
  const khongCo = dangNgo.filter((d) => d.flags.length === 0);
  const coKhac = dangNgo.filter((d) => d.flags.length > 0 && !d.flags.includes("KHONG_CO_LUOT"));
  dong("Mang cờ KHONG_CO_LUOT (Quản lý NHÌN THẤY)", coLuot.length);
  dong("KHÔNG cờ nào (Quản lý KHÔNG thấy gì)", khongCo.length);
  dong("Cờ khác, không có KHONG_CO_LUOT", coKhac.length);
  console.log("");
  console.log("  ⓘ Dòng KHÔNG CỜ là dòng nguy hiểm nhất: ăn công, không ai quét, và trên màn");
  console.log("    không có gì báo. Dòng CÓ CỜ ít nhất còn hiện ra để Quản lý xử lý.");

  tieu("②b ĐÃ CHỐT KỲ CHƯA — chốt rồi thì số đã đóng băng vào bảng lương");
  dong("Dòng thuộc ngày đã CHỐT (status = LOCKED)", dangNgo.filter((d) => d.status === "LOCKED").length);
  dong("Dòng CHƯA chốt", dangNgo.filter((d) => d.status !== "LOCKED").length);

  tieu("②c RẢI THEO KỲ");
  const theoKy = new Map<string, { dong: number; nguoi: Set<string>; cong: number }>();
  for (const d of dangNgo) {
    const k = d.workDate.toISOString().slice(0, 7);
    const v = theoKy.get(k) ?? { dong: 0, nguoi: new Set<string>(), cong: 0 };
    v.dong += 1;
    v.nguoi.add(d.userId);
    v.cong += cong(d);
    theoKy.set(k, v);
  }
  for (const [k, v] of [...theoKy.entries()].sort())
    console.log(
      `  ${k}   dòng=${String(v.dong).padStart(4)}   người=${String(v.nguoi.size).padStart(3)}   công=${String(Math.round(v.cong * 100) / 100).padStart(7)}`,
    );

  tieu("②d RẢI THEO MÃ CA — mã nào hay rơi vào tình trạng này");
  const theoMa = new Map<string, number>();
  for (const d of dangNgo) theoMa.set(d.templateCode ?? "(không mã)", (theoMa.get(d.templateCode ?? "(không mã)") ?? 0) + 1);
  for (const [k, n] of [...theoMa.entries()].sort((a, b) => b[1] - a[1])) dong(`  ${k}`, n);

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
