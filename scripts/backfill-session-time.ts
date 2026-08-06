/**
 * Đắp GIỜ cho buổi học đã tạo — bản vá 06/08 chỉ đúng cho buổi tạo MỚI.
 *
 * Vì sao cần: `applySlotTimeToDate` tìm slot theo ĐÚNG thứ; thứ nào lớp không khai
 * slot riêng thì rơi về 00:00 (không lùi về giờ chung của lớp). Buổi lưu 00:00 giờ
 * VN = 17:00Z ⇒ tab điểm danh hiện "17:00" cho mọi buổi, và phép so trùng lấy nhầm
 * mốc nên báo "Trùng lịch giáo viên" giữa hai lớp khác giờ.
 *
 *   pnpm tsx scripts/backfill-session-time.ts           # DRY-RUN (mặc định)
 *   pnpm tsx scripts/backfill-session-time.ts --apply   # ghi thật
 *
 * An toàn: chỉ đổi PHẦN GIỜ, giữ nguyên NGÀY (theo lịch VN). Buổi đã COMPLETED vẫn
 * đắp — giờ hiển thị sai không phải dữ liệu nghiệp vụ, và học bạ/điểm danh gắn theo
 * sessionId chứ không theo timestamp.
 */
import { db } from "@/lib/db";
import { resolveClassSlots, applySlotTimeToDate } from "@/lib/classes/slots";
import { vnParts } from "@/lib/time/vn";

const APPLY = process.argv.includes("--apply");

async function main() {
  const classes = await db.class.findMany({
    where: { deletedAt: null },
    select: {
      id: true, name: true, classCode: true, startTime: true, endTime: true, scheduleDays: true,
      scheduleSlots: { select: { weekday: true, startTime: true, endTime: true } },
      sessions: { select: { id: true, date: true }, orderBy: { date: "asc" } },
    },
  });

  let xet = 0, doi = 0;
  const mau: string[] = [];
  const capNhat: { id: string; date: Date }[] = [];

  for (const c of classes) {
    const slots = resolveClassSlots({
      scheduleDays: c.scheduleDays, startTime: c.startTime, endTime: c.endTime,
      slots: c.scheduleSlots,
    });
    for (const s of c.sessions) {
      // CHỈ đắp buổi đang ở 00:00 giờ VN — đúng dấu hiệu của lỗi (parseHm(null)→00:00,
      // lưu thành 17:00Z). Buổi đã có giờ khác 00:00 thì KHÔNG đụng: có thể do người
      // dùng dời buổi có chủ đích, hoặc lớp seed cũ đặt giờ riêng — đắp đè là phá dữ liệu.
      const hienTai = vnParts(s.date);
      if (hienTai.hour !== 0 || hienTai.minute !== 0) continue;
      xet++;
      const dung = applySlotTimeToDate(s.date, slots, c.startTime);
      if (dung.getTime() === s.date.getTime()) continue;
      // Chốt an toàn: chỉ đắp khi NGÀY (lịch VN) không đổi.
      const a = vnParts(s.date), b = vnParts(dung);
      if (a.year !== b.year || a.month !== b.month || a.day !== b.day) continue;
      doi++;
      capNhat.push({ id: s.id, date: dung });
      if (mau.length < 12) {
        const gio = (d: Date) => { const p = vnParts(d); return `${String(p.hour).padStart(2,"0")}:${String(p.minute).padStart(2,"0")}`; };
        mau.push(`  ${(c.classCode ?? c.name).padEnd(24)} ${b.day}/${b.month + 1}  ${gio(s.date)} → ${gio(dung)}`);
      }
    }
  }

  console.log(`Buổi đang ở 00:00 (dấu hiệu lỗi): ${xet} · đắp được: ${doi}`);
  if (mau.length) console.log(`\nMẫu:\n${mau.join("\n")}`);
  if (!APPLY) { console.log("\nDRY-RUN — chưa ghi gì. Chạy lại với `--apply`."); return; }

  let n = 0;
  for (let i = 0; i < capNhat.length; i += 20) {
    await Promise.all(capNhat.slice(i, i + 20).map((u) =>
      db.classSession.update({ where: { id: u.id }, data: { date: u.date } })));
    n += Math.min(20, capNhat.length - i);
  }
  console.log(`\n✓ Đã đắp giờ cho ${n} buổi.`);
}
main().catch((e) => console.error(String(e).slice(0, 400))).finally(() => db.$disconnect());
