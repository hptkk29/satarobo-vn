/**
 * scripts/do-ngay-chua-toi.ts — NGÀY CHƯA DIỄN RA có đang được tính công không. CHỈ ĐỌC.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO — câu hỏi của chủ dự án 16/09/2026
 *
 *   *"Đối với những ngày chưa đến, những ngày chưa diễn ra trong tương lai thì không
 *   tính vào chứ? Sao thống kê lại tính cả full cả tháng trong khi những ngày đó hoàn
 *   toàn chưa diễn ra?"*
 *
 * Tái hiện trên DB local 16/09 bằng ĐÚNG đường ghi thật (`recomputeRange`, tức nút
 * "Tính lại" ở màn Kỳ công) cho kỳ ĐANG CHẠY:
 *
 *   · sinh 14 dòng `StaffAttendanceDay` cho ngày CHƯA TỚI;
 *   · 12 dòng mang cờ `KHONG_CO_LUOT` — một ngày chưa diễn ra thì không thể "thiếu lượt";
 *   · và cả 12 dòng ấy mang `dayCreditEarned = 0.5` với `workedMinutes = 0`
 *     ⇒ **6 công được ghi cho những ngày chưa xảy ra**.
 *
 * ⚠️ ĐỪNG VỘI KẾT LUẬN "engine ghi khống công". Đo tiếp ngày ĐÃ QUA: 19/19 dòng có cờ
 * `KHONG_CO_LUOT` cũng nhận ĐỦ công (earned = expected). Tức công tính theo KẾ HOẠCH CA
 * chứ không theo lượt quét — đúng cho cả ngày đã qua, và đó là luật đang chạy, không phải
 * lỗi của riêng ngày tương lai. Mục 6 dưới đây in cả hai vế để người đọc sau không đi vá
 * nhầm chỗ.
 *
 * ⇒ Ba cái SAI thật sự, tách bạch:
 *   1. Cờ `KHONG_CO_LUOT` gắn cho ngày CHƯA DIỄN RA — không ai quét được cho ngày mai.
 *   2. Thống kê gộp ngày chưa tới vào các số "đã xảy ra" (ngày có ca · chưa chấm ·
 *      ngày cần xử lý), trong khi nhãn vẫn in "chưa gồm ngày chưa tới".
 *   3. Nhãn gọi con số ấy là "Công THỰC TẾ" trong khi nó là công theo KẾ HOẠCH.
 *
 * Nguyên do đọc được trong mã: `recomputeRange` (`recompute.ts:243`) lặp MỌI ngày từ
 * `from` tới `to` không có vế nào so với hôm nay, và `recomputeAttendanceDay` cũng không
 * có tham số "hôm nay". Kỳ đang chạy thì `periodRange(ky)` trả trọn tháng.
 *
 * Script này đo xem PROD đã dính chưa, và dính bao nhiêu. Không sửa gì.
 *
 * ⚠️ CHỈ ĐỌC. Không tham số nào bật ghi.
 * ⚠️ KHÔNG in họ tên/email (repo PUBLIC). Chỉ in ĐẾM, mã ca và ngày.
 *
 * CHẠY: pnpm tsx scripts/do-ngay-chua-toi.ts
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

/** Cờ "thiếu mốc quét" — thứ một ngày CHƯA DIỄN RA không thể nào mang. */
const CO_THIEU_QUET = [
  "KHONG_CO_LUOT",
  "THIEU_LUOT_RA",
  "RA_KHONG_CO_VAO",
  "THIEU_BUOI_SANG",
  "THIEU_BUOI_CHIEU",
];

async function main() {
  console.log(`DB host: ${currentDbHost() ?? "(không đọc được)"}`);
  inQuyen(await kiemQuyen(kiemDb), false);

  // Mốc "hôm nay" theo giờ VN, lấy ĐÚNG hàm hệ thống dùng — không tự dựng `new Date()`
  // rồi cắt chuỗi, vì runner GitHub chạy UTC và sẽ lệch một ngày lúc nửa đêm VN.
  const homNayYmd = vnYmd(new Date());
  const homNay = new Date(`${homNayYmd}T00:00:00.000Z`);
  console.log(`Hôm nay (giờ VN): ${homNayYmd}`);

  // ── 1. CÓ BAO NHIÊU DÒNG NGÀY CHƯA TỚI ────────────────────────────────────
  const tuongLai = await db.staffAttendanceDay.findMany({
    where: { workDate: { gt: homNay } },
    select: {
      workDate: true,
      dayType: true,
      templateCode: true,
      dayCreditExpected: true,
      dayCreditEarned: true,
      overrideUnits: true,
      workedMinutes: true,
      flags: true,
    },
    orderBy: { workDate: "asc" },
  });

  tieu("1. DÒNG NGÀY CÔNG CHO NGÀY CHƯA DIỄN RA");
  dong("Tổng số dòng có workDate > hôm nay", tuongLai.length);
  if (tuongLai.length === 0) {
    console.log("");
    console.log("  ⓘ HIỆN CHƯA CÓ DÒNG NÀO. Nhưng đây KHÔNG phải 'không sao' (luật 1):");
    console.log("    đường ghi vẫn còn sống — bất kỳ ai bấm nút 'Tính lại' ở màn Kỳ công");
    console.log("    cho kỳ ĐANG CHẠY sẽ sinh ra chúng ngay lượt bấm đó.");
  }

  // ── 2. CÔNG được ghi cho ngày chưa xảy ra ─────────────────────────────────
  const congCuaTuongLai = tuongLai.reduce(
    (s, d) => s + (d.overrideUnits ?? d.dayCreditEarned),
    0,
  );
  const coCongKhongGio = tuongLai.filter(
    (d) => (d.overrideUnits ?? d.dayCreditEarned) > 0 && d.workedMinutes === 0,
  );
  tieu("2. CÔNG ghi cho ngày chưa xảy ra — con số gần LƯƠNG nhất");
  dong("Σ công thực nhận của các ngày chưa tới", Math.round(congCuaTuongLai * 100) / 100);
  dong("Số dòng CÓ công nhưng 0 phút làm", coCongKhongGio.length);

  // ── 3. CỜ "thiếu lượt quét" trên ngày chưa tới ────────────────────────────
  const coOan = tuongLai.filter((d) => d.flags.some((f) => CO_THIEU_QUET.includes(f)));
  tieu("3. CỜ 'thiếu mốc quét' gắn cho ngày CHƯA DIỄN RA");
  dong("Số dòng mang ít nhất một cờ thiếu quét", coOan.length);
  const theoCo = new Map<string, number>();
  for (const d of coOan)
    for (const f of d.flags)
      if (CO_THIEU_QUET.includes(f)) theoCo.set(f, (theoCo.get(f) ?? 0) + 1);
  for (const [f, n] of [...theoCo.entries()].sort((a, b) => b[1] - a[1])) dong(`  ${f}`, n);

  // ── 4. Rải theo kỳ, để biết kỳ nào đang bị thổi số ────────────────────────
  tieu("4. RẢI THEO KỲ — kỳ nào đang bị thổi số");
  const theoKy = new Map<string, { dong: number; cong: number; co: number }>();
  for (const d of tuongLai) {
    // Khoá kỳ suy từ chính ngày — `StaffAttendanceDay` không có cột `periodKey`.
    const ky = d.workDate.toISOString().slice(0, 7);
    const k = theoKy.get(ky) ?? { dong: 0, cong: 0, co: 0 };
    k.dong += 1;
    k.cong += d.overrideUnits ?? d.dayCreditEarned;
    if (d.flags.some((f) => CO_THIEU_QUET.includes(f))) k.co += 1;
    theoKy.set(ky, k);
  }
  for (const [k, v] of [...theoKy.entries()].sort())
    console.log(
      `  ${k}   dòng=${String(v.dong).padStart(4)}   công=${String(Math.round(v.cong * 100) / 100).padStart(7)}   cờ oan=${String(v.co).padStart(4)}`,
    );

  // ── 5. Vài dòng đầu để nhìn tận mắt ───────────────────────────────────────
  if (tuongLai.length) {
    tieu("5. MƯỜI DÒNG ĐẦU (không in tên ai)");
    for (const d of tuongLai.slice(0, 10)) {
      console.log(
        `  ${d.workDate.toISOString().slice(0, 10)}  ${String(d.dayType).padEnd(12)}` +
          ` mã=${(d.templateCode ?? "—").padEnd(5)}` +
          ` KH=${String(d.dayCreditExpected).padEnd(5)}` +
          ` NHẬN=${String(d.overrideUnits ?? d.dayCreditEarned).padEnd(5)}` +
          ` phút=${String(d.workedMinutes).padEnd(5)}` +
          ` cờ=[${d.flags.join(",")}]`,
      );
    }
  }

  // ── 6. VẾ ĐỐI CHỨNG — ngày ĐÃ QUA không quét thì có nhận công không? ──────
  //
  // Bắt buộc phải in vế này cạnh vế trên. Thiếu nó, người đọc thấy "ngày tương lai nhận
  // công" rồi kết luận engine ghi khống, và đi vá chỗ không hỏng. Nếu ngày đã qua cũng
  // nhận đủ công thì luật đang chạy là "công theo KẾ HOẠCH CA, cờ để quản lý xử lý" —
  // lúc ấy việc phải bàn là NHÃN và PHẠM VI, không phải phép tính công.
  const daQua = await db.staffAttendanceDay.findMany({
    where: { workDate: { lte: homNay }, flags: { has: "KHONG_CO_LUOT" } },
    select: { dayCreditExpected: true, dayCreditEarned: true, overrideUnits: true },
  });
  const duCong = daQua.filter(
    (d) => d.dayCreditExpected > 0 && (d.overrideUnits ?? d.dayCreditEarned) === d.dayCreditExpected,
  ).length;
  const khongCong = daQua.filter((d) => (d.overrideUnits ?? d.dayCreditEarned) === 0).length;
  tieu("6. ĐỐI CHỨNG — ngày ĐÃ QUA mà KHÔNG có lượt quét nào");
  dong("Số dòng ngày đã qua mang cờ KHONG_CO_LUOT", daQua.length);
  dong("  — trong đó nhận ĐỦ công (earned = expected)", duCong);
  dong("  — trong đó KHÔNG nhận công (earned = 0)", khongCong);
  console.log("");
  if (daQua.length > 0 && duCong === daQua.length) {
    console.log("  ⇒ Ngày đã qua không quét VẪN nhận đủ công. Vậy công tính theo KẾ HOẠCH CA,");
    console.log("    không theo lượt quét — luật đang chạy, KHÔNG phải lỗi riêng của ngày mai.");
    console.log("    Việc phải bàn là NHÃN (\"Công thực tế\"?) và PHẠM VI (có gộp ngày chưa tới?),");
    console.log("    cộng với CỜ gắn oan — không phải phép tính công.");
  } else if (daQua.length > 0) {
    console.log("  ⇒ KHÔNG đồng nhất: ngày đã qua không quét thì có dòng mất công, có dòng không.");
    console.log("    Đây là phát hiện RIÊNG, nặng hơn câu hỏi ban đầu — phải truy trước khi vá gì.");
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
