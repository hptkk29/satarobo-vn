/**
 * Dữ liệu THỬ cho luồng sinh nhật học viên — dựng & xoá bằng một lệnh.
 *
 *   pnpm db:seed:birthday          # dựng
 *   pnpm db:seed:birthday clean    # xoá sạch
 *
 * Mọi bản ghi mang tiền tố `ZZTEST_SN` (lớp, buổi học, học viên) nên xoá được
 * trọn vẹn và không lẫn với dữ liệu thật.
 *
 * ⚠️ DB của môi trường `test` DÙNG CHUNG với máy local (xem CLAUDE.md) ⇒ chạy ở
 * local là dữ liệu hiện luôn trên test.satarobo.vn. Đó là chủ ý ở đây (để nghiệm
 * thu), nhưng nhớ chạy `clean` khi xong.
 *
 * Cổng an toàn: từ chối chạy nếu DATABASE_URL trỏ đúng DB đang khai cho PROD
 * (`PROD_DATABASE_URL`/`PROD_DIRECT_URL` nếu có trong env), và luôn IN RÕ host
 * trước khi ghi.
 */
import { currentDbHost } from "./_load-env";
import { db } from "../lib/db";

const TAG = "ZZTEST_SN";
const VN = "Asia/Ho_Chi_Minh";

const vnDayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: VN }).format(d);

function shift(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** Nửa đêm UTC của ngày lịch — đúng cách prod (TZ=UTC) sinh ClassSession.date. */
function utcMidnight(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/** Ngày sinh lưu UTC-midnight, đúng quy ước Student.dateOfBirth của repo. */
function dob(year: number, dayKey: string): Date {
  const [, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, m! - 1, d!));
}

function guardNotProd(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("Thiếu DATABASE_URL");
  for (const key of ["PROD_DATABASE_URL", "PROD_DIRECT_URL"]) {
    const prod = process.env[key];
    if (prod && new URL(url).host === new URL(prod).host) {
      throw new Error(`TỪ CHỐI: DATABASE_URL trùng host của ${key} — đây là DB PRODUCTION.`);
    }
  }
  console.log(`DB đang trỏ: ${currentDbHost()}`);
}

const todayKey = vnDayKey(new Date());

// ─── Kịch bản ────────────────────────────────────────────────────────────────
// Lớp có buổi vào các ngày lệch nhau, để sinh nhật RƠI VÀO NGÀY KHÔNG CÓ LỚP còn
// tìm được "buổi học trước đó" — đúng thứ cần xem.
const NEAR_SESSION_OFFSETS = [0, 2, 5, 8];

/** offset ngày sinh nhật → mong đợi buổi tổ chức (để in ra bảng đối chiếu). */
const NEAR_PEOPLE = [
  { suffix: "A", offset: 0, expect: "đúng hôm nay (có buổi)" },
  { suffix: "B", offset: 3, expect: "lùi về buổi +2" },
  { suffix: "C", offset: 5, expect: "đúng ngày (có buổi)" },
  { suffix: "D", offset: 7, expect: "lùi về buổi +5" },
  { suffix: "E", offset: 9, expect: "lùi về buổi +8" },
];

/** Tháng 6 năm tới: buổi học đặt TRƯỚC sinh nhật 1 ngày để tới lúc đó vẫn có buổi tổ chức. */
const JUNE_YEAR = Number(todayKey.slice(0, 4)) + (Number(todayKey.slice(5, 7)) > 6 ? 1 : 0);
const JUNE_DAYS = [5, 12, 18, 24, 29];

async function seed() {
  guardNotProd();

  const existing = await db.student.count({ where: { name: { startsWith: TAG } } });
  if (existing > 0) {
    console.log(`Đã có ${existing} học viên ${TAG} — chạy \`clean\` trước rồi seed lại.`);
    return;
  }

  const course = await db.course.findFirst({ select: { id: true, name: true } });
  if (!course) throw new Error("Không có Course nào để gắn lớp");

  // Hai cơ sở DẠY HỌC → kiểm được cách ly (QLCS cơ sở này KHÔNG thấy HV cơ sở kia).
  // Loại HO: Hội sở không dạy học, xếp học viên vào đó là dựng sai tổ chức thật
  // (Doc 15: HO là OrgUnit độc lập, KHÔNG phải cơ sở đào tạo).
  const centers = await db.center.findMany({
    where: { isActive: true, code: { not: "HO" } },
    select: { id: true, name: true, code: true },
    orderBy: { code: "asc" },
    take: 2,
  });
  if (centers.length === 0) throw new Error("Không có cơ sở dạy học nào (ngoài HO)");

  console.log(
    `Khoá: ${course.name} · Cơ sở: ${centers.map((c) => `${c.code ?? "?"} ${c.name}`).join(" | ")}\n`,
  );

  // Mỗi cơ sở một lớp thử, mỗi lớp một GV (để xem banner 🎂 trên site giáo viên).
  const classes: { id: string; centerId: string; centerName: string; teacher: string | null }[] = [];
  for (const center of centers) {
    const teacher = await db.user.findFirst({
      where: {
        roles: { has: "TEACHER" },
        isActive: true,
        deletedAt: null,
        // Ưu tiên GV đúng cơ sở; không có thì lấy GV bất kỳ (dữ liệu thử).
        OR: [{ centerId: center.id }, { centerId: null }],
      },
      select: { id: true, name: true },
    });
    const fallbackTeacher =
      teacher ??
      (await db.user.findFirst({
        where: { roles: { has: "TEACHER" }, isActive: true, deletedAt: null },
        select: { id: true, name: true },
      }));

    const cls = await db.class.create({
      data: {
        name: `${TAG}_Lop_${center.code ?? center.name}`,
        courseId: course.id,
        centerId: center.id,
        teacherId: fallbackTeacher?.id ?? null,
        status: "ACTIVE",
        maxStudents: 30,
      },
      select: { id: true },
    });
    classes.push({
      id: cls.id,
      centerId: center.id,
      centerName: center.code ?? center.name,
      teacher: fallbackTeacher?.name ?? null,
    });

    // Buổi cho nhóm gần (10 ngày tới).
    for (const off of NEAR_SESSION_OFFSETS) {
      await db.classSession.create({
        data: {
          classId: cls.id,
          centerId: center.id,
          date: utcMidnight(shift(todayKey, off)),
          status: "SCHEDULED",
          topic: `${TAG} buổi +${off}`,
        },
      });
    }
    // Buổi cho nhóm tháng 6: đặt TRƯỚC mỗi sinh nhật 1 ngày.
    for (const d of JUNE_DAYS) {
      const bKey = `${JUNE_YEAR}-06-${String(d).padStart(2, "0")}`;
      await db.classSession.create({
        data: {
          classId: cls.id,
          centerId: center.id,
          date: utcMidnight(shift(bKey, -1)),
          status: "SCHEDULED",
          topic: `${TAG} buổi trước SN ${d}/6`,
        },
      });
    }
    console.log(
      `Lớp ${TAG}_Lop_${center.code ?? center.name} — GV: ${fallbackTeacher?.name ?? "(chưa gán)"} · ${
        NEAR_SESSION_OFFSETS.length + JUNE_DAYS.length
      } buổi`,
    );
  }

  let phoneSeq = 0;
  const mkStudent = async (
    label: string,
    birthdayKey: string,
    birthYear: number,
    cls: (typeof classes)[number],
  ) => {
    phoneSeq++;
    const s = await db.student.create({
      data: {
        name: `${TAG}_${label}`,
        status: "ACTIVE",
        centerId: cls.centerId,
        dateOfBirth: dob(birthYear, birthdayKey),
        parentName: `${TAG}_PH_${label}`,
        parentPhone: `09999${String(phoneSeq).padStart(5, "0")}`,
      },
      select: { id: true },
    });
    await db.enrollment.create({
      data: {
        studentId: s.id,
        classId: cls.id,
        courseId: course.id,
        centerId: cls.centerId,
        status: "STUDYING",
      },
    });
    return s.id;
  };

  console.log(`\n── Nhóm 1: sinh nhật trong 10 ngày tới (xem được NGAY) ──`);
  for (const [i, p] of NEAR_PEOPLE.entries()) {
    const cls = classes[i % classes.length]!;
    const bKey = shift(todayKey, p.offset);
    await mkStudent(`Gan_${p.suffix}`, bKey, 2015, cls);
    console.log(`  ${TAG}_Gan_${p.suffix}  SN ${bKey}  → ${p.expect}  · ${cls.centerName}`);
  }

  console.log(`\n── Nhóm 2: sinh nhật tháng 6/${JUNE_YEAR} (nằm im tới ~10 ngày trước) ──`);
  for (const [i, d] of JUNE_DAYS.entries()) {
    const cls = classes[i % classes.length]!;
    const bKey = `${JUNE_YEAR}-06-${String(d).padStart(2, "0")}`;
    await mkStudent(`Thang6_${d}`, bKey, 2016, cls);
    console.log(`  ${TAG}_Thang6_${d}  SN ${bKey}  → buổi trước đó 1 ngày · ${cls.centerName}`);
  }

  console.log(
    `\nXong. Vào /admin/sinh-nhat bấm "Chạy quét sinh nhật" — nhóm 1 sẽ hiện, nhóm 2 thì chưa (đúng).`,
  );
  console.log(`Xoá sạch khi nghiệm thu xong:  pnpm db:seed:birthday clean`);
}

async function clean() {
  guardNotProd();

  const students = await db.student.findMany({
    where: { name: { startsWith: TAG } },
    select: { id: true },
  });
  const ids = students.map((s) => s.id);
  const greetings = await db.studentBirthdayGreeting.findMany({
    where: { studentId: { in: ids } },
    select: { id: true },
  });
  await db.staffNotification.deleteMany({
    where: { dedupeKey: { in: greetings.map((g) => `birthday:${g.id}`) } },
  });
  await db.studentBirthdayGreeting.deleteMany({ where: { studentId: { in: ids } } });
  await db.enrollment.deleteMany({ where: { studentId: { in: ids } } });
  await db.attendance.deleteMany({ where: { studentId: { in: ids } } });
  await db.classSession.deleteMany({ where: { topic: { startsWith: TAG } } });
  await db.student.deleteMany({ where: { id: { in: ids } } });
  await db.class.deleteMany({ where: { name: { startsWith: TAG } } });

  const left = {
    hocVien: await db.student.count({ where: { name: { startsWith: TAG } } }),
    lop: await db.class.count({ where: { name: { startsWith: TAG } } }),
    buoi: await db.classSession.count({ where: { topic: { startsWith: TAG } } }),
    sinhNhat: await db.studentBirthdayGreeting.count({ where: { studentId: { in: ids } } }),
  };
  console.log("Đã xoá. Còn sót:", JSON.stringify(left), "(phải toàn 0)");
  if (Object.values(left).some((v) => v !== 0)) process.exitCode = 1;
}

const cmd = process.argv[2] ?? "seed";
const run = cmd === "clean" ? clean : cmd === "seed" ? seed : null;
if (!run) {
  console.error("Dùng: pnpm db:seed:birthday [seed|clean]");
  process.exit(1);
}
run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
