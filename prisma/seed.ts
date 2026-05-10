import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Bắt đầu seed data...");

  // ─── Centers ─────────────────────────────────────────────────────────────────
  const centers = await Promise.all([
    db.center.upsert({
      where: { id: "center-hoa-cuong" },
      update: {},
      create: {
        id: "center-hoa-cuong",
        name: "Sata Robo — Hoà Cường",
        address: "258 Lê Thanh Nghị, Hoà Cường Nam, Hải Châu, Đà Nẵng",
        phone: "0818823720",
        email: "satarobo@gmail.com",
      },
    }),
    db.center.upsert({
      where: { id: "center-hai-chau" },
      update: {},
      create: {
        id: "center-hai-chau",
        name: "Sata Robo — Hải Châu",
        address: "Quận Hải Châu, Đà Nẵng (sắp khai trương)",
        phone: "0818823720",
      },
    }),
    db.center.upsert({
      where: { id: "center-son-tra" },
      update: {},
      create: {
        id: "center-son-tra",
        name: "Sata Robo — Sơn Trà",
        address: "Quận Sơn Trà, Đà Nẵng (sắp khai trương)",
        phone: "0818823720",
      },
    }),
    db.center.upsert({
      where: { id: "center-ngu-hanh-son" },
      update: {},
      create: {
        id: "center-ngu-hanh-son",
        name: "Sata Robo — Ngũ Hành Sơn",
        address: "Quận Ngũ Hành Sơn, Đà Nẵng (sắp khai trương)",
        phone: "0818823720",
      },
    }),
    db.center.upsert({
      where: { id: "center-thanh-khe" },
      update: {
        name: "Sata Robo — Thanh Khê",
        address: "269 Điện Biên Phủ, Thanh Khê, Đà Nẵng",
        phone: "0818823720",
      },
      create: {
        id: "center-thanh-khe",
        name: "Sata Robo — Thanh Khê",
        address: "269 Điện Biên Phủ, Thanh Khê, Đà Nẵng",
        phone: "0818823720",
      },
    }),
    db.center.upsert({
      where: { id: "center-hoa-khe" },
      update: {
        name: "Sata Robo — Hoà Khê",
        address: "232 Nguyễn Phước Lan, Hoà Khê, Đà Nẵng",
        phone: "0818823720",
      },
      create: {
        id: "center-hoa-khe",
        name: "Sata Robo — Hoà Khê",
        address: "232 Nguyễn Phước Lan, Hoà Khê, Đà Nẵng",
        phone: "0818823720",
      },
    }),
  ]);
  console.log(`✅ ${centers.length} trung tâm đã tạo`);

  // ─── Courses ─────────────────────────────────────────────────────────────────
  const courses = await Promise.all([
    db.course.upsert({
      where: { slug: "lap-trinh-robot" },
      update: {},
      create: {
        slug: "lap-trinh-robot",
        name: "Khoá Lập trình Robot Offline",
        type: "OFFLINE",
        description:
          "Khoá học lập trình robot thực tế cho học sinh lớp 1-8. Học viên được thực hành trực tiếp với robot, phát triển tư duy logic và kỹ năng STEM.",
        isActive: true,
      },
    }),
    db.course.upsert({
      where: { slug: "luyen-thi-robosim" },
      update: {},
      create: {
        slug: "luyen-thi-robosim",
        name: "Khoá Luyện thi RoboSim Online",
        type: "ONLINE",
        description:
          "Khoá luyện thi RoboSim trực tuyến, giúp học sinh chinh phục các kỳ thi Robotics cấp thành phố và quốc gia.",
        isActive: true,
      },
    }),
  ]);
  console.log(`✅ ${courses.length} khoá học đã tạo`);

  // ─── SUPER_ADMIN ──────────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash("ChangeMe@2026!", 12);
  const admin = await db.user.upsert({
    where: { email: "phuc@satarobo.vn" },
    update: {},
    create: {
      email: "phuc@satarobo.vn",
      name: "Hồ Đắc Phúc",
      password: hashedPassword,
      role: "SUPER_ADMIN",
      centerId: "center-hoa-cuong",
      isActive: true,
    },
  });
  console.log(`✅ Admin tạo xong: ${admin.email}`);

  console.log("\n🎉 Seed hoàn tất!");
  console.log("─".repeat(50));
  console.log("📧 Email:    phuc@satarobo.vn");
  console.log("🔑 Password: ChangeMe@2026!");
  console.log("⚠️  Đổi mật khẩu ngay sau khi đăng nhập lần đầu!");
  console.log("─".repeat(50));
}

main()
  .catch((e) => {
    console.error("❌ Seed thất bại:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
