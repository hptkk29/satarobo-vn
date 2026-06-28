/**
 * Seed buổi học + điểm danh cho lớp test (để Portal v2 hiển thị đầy đủ như SataUI).
 *   pnpm tsx prisma/seed-test-sessions.ts
 * Idempotent: xoá session/attendance cũ của lớp test rồi tạo lại. KHÔNG cho prod.
 */
import { db } from "../lib/db";

const CLASS_ID = "cmqqhcvoj00061ey49q5eqc20";
const CURRICULUM_ID = "cmqhwollz002v5z4dnja4uoks";

const TITLES = [
  "Làm quen robot & an toàn",
  "Cảm biến cơ bản",
  "Động cơ & bánh xe",
  "Lập trình di chuyển",
  "Cảm biến dò line",
  "Lắp ráp khung gầm",
  "Lắp ráp khung gầm nâng cao",
  "Cánh tay robot & servo",
  "Lập trình theo kịch bản",
  "Dự án nhóm: robot phân loại",
  "Xử lý lỗi & tối ưu",
  "Robot tránh vật cản",
  "Ôn tập & kiểm tra",
  "Tổng kết & trình diễn",
];

function atMidday(d: Date): Date {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x;
}

async function main() {
  const students = await db.student.findMany({
    where: { studentCode: { in: ["CS1-TEST-001", "CS1-TEST-002"] } },
    select: { id: true },
  });
  if (students.length === 0) throw new Error("Chưa có học viên test — chạy seed-test-parent trước.");

  // 1) Lessons (upsert theo unique curriculumId+order)
  const lessons = [];
  for (let i = 0; i < TITLES.length; i++) {
    const l = await db.lesson.upsert({
      where: { curriculumId_order: { curriculumId: CURRICULUM_ID, order: i + 1 } },
      update: { title: TITLES[i] },
      create: { curriculumId: CURRICULUM_ID, order: i + 1, title: TITLES[i] },
      select: { id: true },
    });
    lessons.push(l.id);
  }

  // 2) Xoá session + attendance cũ của lớp (idempotent)
  const old = await db.classSession.findMany({ where: { classId: CLASS_ID }, select: { id: true } });
  const oldIds = old.map((s) => s.id);
  if (oldIds.length) {
    await db.attendance.deleteMany({ where: { sessionId: { in: oldIds } } });
    await db.classSession.deleteMany({ where: { id: { in: oldIds } } });
  }

  // 3) 14 buổi: i=0..6 đã qua (mỗi 3 ngày trước), i=7..13 sắp tới
  const today = atMidday(new Date());
  const sessions: { id: string; idx: number; past: boolean }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + (i - 6) * 3); // i=6 ≈ hôm nay
    const past = d.getTime() < today.getTime();
    const s = await db.classSession.create({
      data: {
        classId: CLASS_ID,
        date: d,
        lessonId: lessons[i],
        status: past ? "COMPLETED" : "SCHEDULED",
      },
      select: { id: true },
    });
    sessions.push({ id: s.id, idx: i, past });
  }

  // 4) Điểm danh các buổi đã qua: ~83% có mặt (1 buổi vắng cần học bù)
  let att = 0;
  for (const st of students) {
    for (const s of sessions) {
      if (!s.past) continue;
      const absent = s.idx === 2; // 1/7 buổi vắng → ~86% chuyên cần
      await db.attendance.create({
        data: {
          sessionId: s.id,
          studentId: st.id,
          status: absent ? "ABSENT" : "PRESENT",
          makeupStatus: absent ? "NEEDS_MAKEUP" : "NONE",
        },
      });
      att++;
    }
  }

  console.log(`✅ Seed lịch học: ${lessons.length} lesson, ${sessions.length} buổi (7 đã qua + 7 sắp tới), ${att} điểm danh.`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("❌", e);
    await db.$disconnect();
    process.exit(1);
  });
