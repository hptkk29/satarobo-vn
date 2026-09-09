/**
 * scripts/do-cong-day-thuc-te.ts — ĐO con số màn Công dạy ĐANG hiển thị trên prod. CHỈ ĐỌC.
 *
 * Không có chế độ ghi. Toàn bộ là `findMany`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO ĐO BẰNG SCRIPT CHỨ KHÔNG MỞ MÀN
 *
 * Luật 9: cổng phải được cho ăn bằng thứ đường THẬT cho nó ăn. Script này gọi ĐÚNG hai hàm
 * mà `app/(admin)/admin/cham-cong/cong-day/page.tsx` gọi — `loadLoaiCongDay()`,
 * `loadBuoiDay()` — rồi `congDayCuaNguoi()`. Không chép lại luật, nên số ra đây LÀ số màn
 * hiển thị, không phải một phép tính song song có thể lệch.
 *
 * Khác biệt DUY NHẤT so với màn: màn đọc qua `scopedDb(actor)` (lọc theo cơ sở người xem),
 * script đọc trần rồi tự lặp từng cơ sở. Với SUPER_ADMIN hai vế cho cùng kết quả.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SỐ CẦN NHÌN NHẤT: "buổi RƠI RA"
 *
 * `congDayCuaNguoi` bỏ hẳn buổi không khớp loại nào đang bật (`loaiCua` trả null ⇒
 * `continue`). Trước 09/09/2026 bảng `TeachingCreditType` RỖNG trên prod nên **mọi** buổi
 * rơi ra và công dạy = 0 cho tất cả — im lặng, không exception.
 *
 * Nên script in riêng con số đó: buổi rơi ra > 0 nghĩa là còn nhóm buổi nào đó không có
 * dòng danh mục nhận. Đó là thứ mà tổng công dạy KHÔNG nói cho ta biết.
 *
 * CHẠY: pnpm tsx scripts/do-cong-day-thuc-te.ts [YYYY-MM] [số tháng lùi lại]
 */
// `_load-env` phải chạy TRƯỚC mọi import chạm Prisma.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";
import { db } from "../lib/db";
import { congDayCuaNguoi } from "../lib/cham-cong/cong-day";
import { loadBuoiDay, loadLoaiCongDay } from "../lib/cham-cong/cong-day-db";

const kiemDb = scriptDb();

function tieu(s: string) {
  console.log("");
  console.log("═".repeat(88));
  console.log(s);
  console.log("═".repeat(88));
}
function muc(s: string) {
  console.log("");
  console.log(`── ${s} ${"─".repeat(Math.max(0, 82 - s.length))}`);
}
const so = (n: number) => (Math.round(n * 100) / 100).toString().replace(".", ",");

async function main() {
  console.log(`DB host: ${currentDbHost() ?? "(không đọc được)"}`);
  inQuyen(await kiemQuyen(kiemDb), false);
  tieu("ĐO CON SỐ MÀN CÔNG DẠY (chỉ đọc) — gọi đúng hàm màn dùng");

  const danhMuc = await loadLoaiCongDay();
  muc("Danh mục loại công dạy đang có");
  console.log(`  ${danhMuc.length} dòng · đang bật: ${danhMuc.filter((d) => d.isActive).length} · cộng vào kỳ: ${danhMuc.filter((d) => d.countsInPeriod).length}`);
  for (const d of danhMuc) {
    console.log(
      `    ${d.code.padEnd(14)}${d.source}/${d.role}/${d.basis} hệ số=${d.factor}` +
        ` bật=${d.isActive} vàoKỳ=${d.countsInPeriod} phânLoại=${d.categoryCode ?? "null(bao sân)"}`,
    );
  }
  if (danhMuc.length === 0) {
    console.log("  🔴 RỖNG ⇒ mọi buổi sẽ rơi ra và công dạy = 0 cho TẤT CẢ. Dừng đọc số dưới.");
  }

  // `Center.code` là `String?` trong schema — lọc `not: null` ở `where` KHÔNG hẹp kiểu trả
  // về, nên phải tự thu hẹp. `tsc` bắt đúng chỗ này (luật 7: kiểu bảo vệ chỗ nó nhìn thấy).
  const coSoRaw = await db.center.findMany({
    where: { isActive: true, code: { not: null } },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  const coSo = coSoRaw.flatMap((c) => (c.code ? [{ id: c.id, code: c.code, name: c.name }] : []));

  const nay = new Date();
  const mocArg = process.argv[2];
  const soThang = Number(process.argv[3] ?? 3) || 3;
  const [y0, m0] = mocArg?.match(/^(\d{4})-(\d{2})$/)
    ? [Number(mocArg.slice(0, 4)), Number(mocArg.slice(5, 7)) - 1]
    : [nay.getUTCFullYear(), nay.getUTCMonth()];

  for (let i = 0; i < soThang; i += 1) {
    const from = new Date(Date.UTC(y0, m0 - i, 1));
    const to = new Date(Date.UTC(y0, m0 - i + 1, 0)); // ngày cuối tháng
    const ky = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, "0")}`;
    muc(`Kỳ ${ky}`);

    for (const c of coSo) {
      if (c.code === "HO") continue; // Hội sở không có lớp
      const [oLuoi, buoiCuaCoSo] = await Promise.all([
        db.shiftAssignment.findMany({
          where: { centerId: c.id, workDate: { gte: from, lte: to }, status: "ACTIVE" },
          select: { userId: true },
          distinct: ["userId"],
        }),
        db.classSession.findMany({
          where: {
            status: "COMPLETED",
            date: { gte: from, lt: new Date(to.getTime() + 86_400_000) },
            class: { centerId: c.id },
          },
          select: {
            actualTeacherId: true,
            substituteTeacherId: true,
            class: { select: { teacherId: true, assistantId: true } },
          },
        }),
      ]);
      const userIds = [
        ...new Set([
          ...oLuoi.map((n) => n.userId),
          ...buoiCuaCoSo.flatMap((s) =>
            [s.actualTeacherId, s.substituteTeacherId, s.class?.teacherId, s.class?.assistantId].filter(
              (x): x is string => typeof x === "string",
            ),
          ),
        ]),
      ];
      if (userIds.length === 0) {
        console.log(`  ${c.code.padEnd(6)} (không ai trong kỳ)`);
        continue;
      }

      const buoi = await loadBuoiDay(userIds, from, to);
      const theoNguoi = new Map<string, typeof buoi>();
      for (const b of buoi) {
        const ds = theoNguoi.get(b.userId) ?? [];
        ds.push(b);
        theoNguoi.set(b.userId, ds);
      }

      let tongCong = 0;
      let tongBuoiTinh = 0;
      let coCong = 0;
      let thieuGio = 0;
      for (const uid of userIds) {
        const t = congDayCuaNguoi(theoNguoi.get(uid) ?? [], danhMuc);
        tongCong += t.tongCong;
        tongBuoiTinh += t.tongBuoi;
        if (t.tongCong > 0) coCong += 1;
        thieuGio += t.dong.reduce((x, d) => x + d.boQuaThieuGio, 0);
      }

      // ⚠️ SỐ QUAN TRỌNG NHẤT: buổi `loadBuoiDay` trả về nhưng KHÔNG dòng nào nhận.
      // `tongBuoi` của `congDayCuaNguoi` chỉ đếm buổi ĐÃ khớp loại — hiệu hai vế là số bị bỏ.
      const roiRa = buoi.length - tongBuoiTinh;
      console.log(
        `  ${c.code.padEnd(6)}` +
          `người=${String(userIds.length).padStart(3)}  ` +
          `buổi nạp=${String(buoi.length).padStart(4)}  ` +
          `buổi tính=${String(tongBuoiTinh).padStart(4)}  ` +
          `RƠI RA=${String(roiRa).padStart(4)}  ` +
          `tổng công=${so(tongCong).padStart(8)}  ` +
          `người có công>0=${String(coCong).padStart(3)}` +
          `${thieuGio ? `  thiếu giờ=${thieuGio}` : ""}`,
      );
      if (roiRa > 0) {
        console.log(`      ⚠️ ${roiRa} buổi không khớp dòng danh mục nào — kiểm source/role/phân loại của chúng.`);
      }
    }
  }

  console.log("");
  console.log("Toàn bộ phép đo trên là SELECT. Không dòng nào bị ghi.");
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
