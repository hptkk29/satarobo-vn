import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedHonors } from "./seed-honors";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Bắt đầu seed data...");

  // ─── Centers ─────────────────────────────────────────────────────────────────
  // Phase 4.UI.RESET.1: 4 cơ sở operational + 2 cơ sở upcoming (isActive=false).
  // IDs match lib/locations.ts.
  const centersData = [
    {
      id: "tru-so-le-thanh-nghi",
      name: "Trụ sở chính - Hòa Cường",
      address: "258 Lê Thanh Nghị, Đà Nẵng",
      phone: "0818823720",
      email: "thongtin@satarobo.vn",
      isActive: true,
    },
    {
      id: "co-so-le-loi",
      name: "Cơ sở Hải Châu",
      address: "60 Lê Lợi, Đà Nẵng",
      phone: "0818823720",
      email: "thongtin@satarobo.vn",
      isActive: true,
    },
    {
      id: "co-so-dien-bien-phu",
      name: "Cơ sở Thanh Khê",
      address: "269 Điện Biên Phủ, Đà Nẵng",
      phone: "0818823720",
      email: "thongtin@satarobo.vn",
      isActive: true,
    },
    {
      id: "co-so-nguyen-phuoc-lan",
      name: "Cơ sở Cẩm Lệ",
      address: "232 Nguyễn Phước Lan, Đà Nẵng",
      phone: "0818823720",
      email: "thongtin@satarobo.vn",
      isActive: true,
    },
    {
      id: "co-so-hoang-dieu",
      name: "Cơ sở Hoàng Diệu (sắp khai trương)",
      address: "114 Hoàng Diệu, Đà Nẵng",
      phone: "0818823720",
      email: "thongtin@satarobo.vn",
      isActive: false,
    },
    {
      id: "co-so-nguyen-huu-tho",
      name: "Cơ sở Nguyễn Hữu Thọ (khai trương 08/2026)",
      address: "211 Nguyễn Hữu Thọ, Đà Nẵng",
      phone: "0818823720",
      email: "thongtin@satarobo.vn",
      isActive: false,
    },
  ];

  for (const data of centersData) {
    await db.center.upsert({
      where: { id: data.id },
      update: data,
      create: data,
    });
  }
  const validCenterIds = centersData.map((c) => c.id);

  // Re-point FK của User/Lead/Class/Student về HQ mới trước khi xoá cơ sở cũ
  // (relation onDelete mặc định Restrict, nên cần tay làm thế).
  const newHqId = centersData[0].id; // tru-so-le-thanh-nghi
  await db.user.updateMany({
    where: { centerId: { notIn: validCenterIds, not: null } },
    data: { centerId: newHqId },
  });
  await db.lead.updateMany({
    where: { centerId: { notIn: validCenterIds, not: null } },
    data: { centerId: newHqId },
  });
  await db.class.updateMany({
    where: { centerId: { notIn: validCenterIds, not: null } },
    data: { centerId: newHqId },
  });
  await db.student.updateMany({
    where: { centerId: { notIn: validCenterIds, not: null } },
    data: { centerId: newHqId },
  });
  // Employee.center has onDelete: SetNull — đặt về HQ luôn cho gọn
  await db.employee.updateMany({
    where: { centerId: { notIn: validCenterIds, not: null } },
    data: { centerId: newHqId },
  });

  const removedCenters = await db.center.deleteMany({
    where: { id: { notIn: validCenterIds } },
  });
  console.log(`✅ ${centersData.length} cơ sở đã tạo · removed ${removedCenters.count} cơ sở cũ`);

  // ─── Courses (Phase 4.UI.FIX.1) ──────────────────────────────────────────
  // Focus 2 khoá học chính. Loại bỏ 4 SP marketing + 2 legacy hyphenated slugs.
  const coursesData = [
    {
      slug: "laptrinhrobot",
      code: "LTR",
      name: "Lập trình Robot",
      type: "OFFLINE" as const,
      shortDescription:
        "Khoá học toàn diện về lập trình & điều khiển robot cho học sinh K-9. Tư duy logic, lập trình thực hành, dự án sáng tạo.",
      description: `Khoá học Lập trình Robot là chương trình giáo dục STEM toàn diện dành cho học sinh từ K-9, giúp các em làm quen với:

- Tư duy logic và lập trình cơ bản
- Cấu trúc và nguyên lý hoạt động của robot
- Lập trình robot thực hành với kit chuyên dụng
- Phát triển tư duy giải quyết vấn đề

Chương trình được thiết kế bài bản từ cơ bản đến nâng cao, học viên sẽ tự tay xây dựng và lập trình các robot từ đơn giản đến phức tạp.`,
      priceDisplay: "Liên hệ tư vấn",
      duration: 180,
      durationDisplay: "6 tháng",
      studentCount: 1200,
      displayOrder: 1,
      isActive: true,
      isPublished: true,
    },
    {
      slug: "luyenthirobosim",
      code: "LTRS",
      name: "Luyện thi Robosim",
      type: "HYBRID" as const,
      shortDescription:
        "Chuẩn bị thi đấu Robotics chuyên nghiệp (RoboSim, WRO) cho học sinh có nền tảng. Mentor 1-1, mô phỏng chuyên sâu.",
      description: `Luyện thi Robosim là chương trình chuyên sâu dành cho học viên muốn tham gia các cuộc thi Robotics cấp quốc gia và quốc tế (RoboSim, WRO, ...).

Học viên sẽ được:
- Luyện tập trên nền tảng mô phỏng Robosim chuyên nghiệp
- Học chiến thuật giải quyết các challenge cuộc thi
- Phát triển kỹ năng làm việc nhóm trong team thi
- Hướng dẫn 1-1 bởi mentor có kinh nghiệm thi đấu

Chương trình phù hợp cho học sinh đã có nền tảng lập trình robot cơ bản.`,
      priceDisplay: "Liên hệ tư vấn",
      duration: 120,
      durationDisplay: "3-6 tháng",
      studentCount: 800,
      displayOrder: 2,
      isActive: true,
      isPublished: true,
    },
  ];

  for (const data of coursesData) {
    await db.course.upsert({
      where: { slug: data.slug },
      update: data,
      create: data,
    });
  }

  // Xoá courses không nằm trong list mới (sp1-4 + lap-trinh-robot/luyen-thi-robosim legacy).
  // deleteMany an toàn vì lúc seed chưa có Lead/Class/Enrollment ref tới chúng.
  const validSlugs = coursesData.map((c) => c.slug);
  const deleted = await db.course.deleteMany({
    where: { slug: { notIn: validSlugs } },
  });
  console.log(
    `✅ ${coursesData.length} khoá học chính · removed ${deleted.count} legacy/SP courses`,
  );

  // ─── ZMRobo Kits (Phase 4.UI.FIX.2) ─────────────────────────────────────
  // 3 bộ học cụ ZMROBO: Alpha (nhập môn) / Beta (thi đấu) / Intelligence Storm (AI nâng cao)
  const zmRoboKits = [
    {
      slug: "alpha",
      brand: "ZMROBO",
      series: "α-Series",
      code: null,
      title: "Alpha Set",
      subtitle: "Bộ NHẬP MÔN cho trẻ từ 6 tuổi",
      shortDescription:
        "Lập trình robot KHÔNG cần máy tính qua thẻ lệnh OID — 320-378 chi tiết, 7 cảm biến, Smart Hub. Phương pháp PBL.",
      description: `Alpha Set (α-Series) là bộ học cụ NHẬP MÔN dành cho trẻ em từ 6 tuổi trở lên, được thiết kế bởi ZMROBO — thương hiệu hàng đầu thế giới về Robotics giáo dục.

ĐẶC ĐIỂM NỔI BẬT:
- 320-378 chi tiết lắp ráp chính xác cao, an toàn tuyệt đối
- Lập trình KHÔNG cần máy tính qua thẻ lệnh OID (Optical Identification)
- 7 cảm biến đa dạng giúp robot tương tác với môi trường
- Smart Hub trung tâm điều khiển thông minh
- Áp dụng phương pháp PBL (Project-Based Learning)

PHÙ HỢP CHO:
- Trẻ em từ 6 tuổi mới bắt đầu làm quen với Robotics
- Phụ huynh muốn con tiếp xúc công nghệ sớm
- Trung tâm STEM, trường tiểu học (K1-K3)

THƯƠNG HIỆU:
ZMROBO (JoinMax Digital Technology Co., Ltd) - thành lập 2002, chuyên STEAM education với 300+ patents.`,
      priceDisplay: "Liên hệ tư vấn",
      isAvailable: true,
      specs: {
        pieces: "320-378 PCS",
        age: "6+ tuổi",
        level: "Nhập môn",
        controller: "Smart Hub 330",
        sensors: [
          "Cảm biến chạm",
          "Cảm biến góc nghiêng",
          "Cảm biến IR",
          "Cảm biến khoảng cách",
          "Cảm biến light",
          "Cảm biến màu sắc",
          "Cảm biến thẻ lệnh OID",
        ],
        programmingMethod: "OID Coding Cards (không cần máy tính)",
        teachingMethod: "PBL - Project-Based Learning",
      },
      features: [
        { icon: "Cpu", title: "Smart Hub thông minh", desc: "Bộ điều khiển trung tâm tích hợp cho robot" },
        { icon: "CreditCard", title: "Lập trình qua thẻ lệnh", desc: "Không cần máy tính - chỉ scan thẻ OID" },
        { icon: "Activity", title: "7 cảm biến đa dạng", desc: "Tương tác với môi trường: chạm, ánh sáng, màu, khoảng cách..." },
        { icon: "Puzzle", title: "320-378 chi tiết", desc: "Lắp ráp nhiều mô hình robot khác nhau" },
      ],
      highlights: [
        "Không cần máy tính — phù hợp trẻ mầm non, tiểu học",
        "7 cảm biến — robot có thể 'cảm nhận' môi trường",
        "Phương pháp PBL — học qua dự án sáng tạo",
        "An toàn tuyệt đối — chứng nhận quốc tế",
      ],
      mainImage: "",
      galleryImages: [],
      sourceUrl: "https://zmrobo.net/products/80",
      displayOrder: 1,
      isPublished: true,
    },
    {
      slug: "beta",
      brand: "ZMROBO",
      series: "β-Series",
      code: null,
      title: "Beta Set Core",
      subtitle: "Bộ THI ĐẤU chuyên nghiệp",
      shortDescription:
        "β-Series Core Set 133 PCS — Bộ kit thi đấu Robotics dành cho học viên đã có nền tảng từ Alpha Set. Race-style robot.",
      description: `Beta Set (β-Series Core Set) là bộ học cụ THI ĐẤU dành cho học viên đã hoàn thành Alpha Set hoặc đã có nền tảng Robotics cơ bản.

ĐẶC ĐIỂM NỔI BẬT:
- 133 chi tiết tinh gọn, tối ưu cho thi đấu
- Thiết kế Race-style robot - tốc độ và độ chính xác cao
- Phù hợp với các cuộc thi Robotics quốc gia và quốc tế
- Lắp ráp nhanh - thi đấu hiệu quả

PHÙ HỢP CHO:
- Học viên có nền tảng Robotics, hướng tới thi đấu
- Đội tuyển Robotics trường học, trung tâm
- Phụ huynh muốn con tham gia các cuộc thi RBT, RoboSim, WRO

CƠ HỘI THI ĐẤU:
- RBT2026 (RoboSim)
- WRO (World Robot Olympiad)
- Các cuộc thi nội bộ Sata Robo`,
      priceDisplay: "Liên hệ tư vấn",
      isAvailable: true,
      specs: {
        pieces: "133 PCS",
        age: "6+ tuổi",
        level: "Thi đấu",
        formFactor: "Race-style Robot",
        compatibility: "Tương thích Alpha Set",
        labelText: "β-Series Core Set",
      },
      features: [
        { icon: "Trophy", title: "Thiết kế thi đấu", desc: "Race-style robot, tốc độ và độ chính xác cao" },
        { icon: "Zap", title: "Lắp ráp nhanh", desc: "133 chi tiết tinh gọn, dễ thao tác" },
        { icon: "Target", title: "Cuộc thi quốc tế", desc: "Phù hợp WRO, RoboSim, RBT2026" },
        { icon: "Link2", title: "Tương thích Alpha", desc: "Sử dụng cùng hệ sinh thái ZMROBO" },
      ],
      highlights: [
        "Thiết kế tối ưu cho thi đấu",
        "Tham gia các cuộc thi quốc gia + quốc tế",
        "Lắp ráp nhanh, thao tác dễ",
        "Tương thích với Alpha Set",
      ],
      mainImage: "",
      galleryImages: [],
      sourceUrl: "https://zmrobo.net/products/89",
      displayOrder: 2,
      isPublished: true,
    },
    {
      slug: "intelligence-storm",
      brand: "ZMROBO",
      series: "Intelligence Storm",
      code: "JMC-NY-2108E",
      title: "Intelligence Storm",
      subtitle: "Bộ NÂNG CAO AI + Python + C",
      shortDescription:
        "JMC-NY-2108E 619 PCS — E6-RCU Smart Controller, 96 bài học/6 stages, lập trình Graphical + Python + C, AI image recognition.",
      description: `Intelligence Storm (mã JMC-NY-2108E) là bộ học cụ NÂNG CAO cao cấp nhất của ZMROBO, dành cho học sinh trung học và những ai muốn tiến sâu vào AI, Robotics và lập trình chuyên nghiệp.

ĐẶC ĐIỂM NỔI BẬT:
- 619 chi tiết lắp ráp robot nhiều hình dạng phức tạp
- E6-RCU Smart Controller (8 sensor ports + 4 motor ports)
- 96 bài học chia thành 6 stages + 32 extensions
- 3 ngôn ngữ lập trình: Graphical (kéo thả), Python, C
- AI: Image recognition, Gesture detection
- Custom Android OS với ZMROBO AI library

CHƯƠNG TRÌNH 6 STAGES:
Stage 1: Structural knowledge
Stage 2: Force transfer
Stage 3: Master controller
Stage 4: Sensors
Stage 5: Software programming
Stage 6: AI applications

PHÙ HỢP CHO:
- Học sinh THCS, THPT (lớp 6-12)
- Học viên đã hoàn thành Alpha + Beta Set
- Người yêu thích AI, lập trình Python, C
- Trường THCS/THPT, trung tâm STEM cao cấp`,
      priceDisplay: "Liên hệ tư vấn",
      isAvailable: true,
      specs: {
        pieces: "619 PCS",
        age: "6+ tuổi (lý tưởng 10+)",
        level: "Nâng cao",
        productCode: "JMC-NY-2108E",
        controller: "E6-RCU Smart Controller (8 sensor + 4 motor ports)",
        processor: "8-core processor",
        operatingSystem: "Custom Android",
        sensors: ["Ultrasonic", "PhotorElectric", "Light"],
        motors: ["Large Motor", "Medium Motor"],
        programming: ["Graphical Programming", "Python", "C"],
        aiFeatures: ["Image Recognition", "Gesture Detection", "ZMROBO AI Library"],
        curriculum: "96 lessons / 6 stages + 32 extensions",
      },
      features: [
        { icon: "Brain", title: "AI Image Recognition", desc: "Robot nhận diện hình ảnh, vật thể, khuôn mặt" },
        { icon: "Code", title: "Python + C Programming", desc: "Lập trình chuyên nghiệp với 3 ngôn ngữ" },
        { icon: "Cpu", title: "E6-RCU Controller", desc: "8-core processor, 8 sensor ports, 4 motor ports" },
        { icon: "BookOpen", title: "96 bài học có sẵn", desc: "6 stages + 32 extensions chuẩn quốc tế" },
      ],
      highlights: [
        "619 chi tiết - robot hình dạng phức tạp",
        "E6-RCU Controller next-gen - 8 cổng cảm biến",
        "3 ngôn ngữ: Graphical + Python + C",
        "AI: Image recognition + Gesture detection",
        "96 bài học có sẵn - 6 stages chuẩn quốc tế",
      ],
      mainImage: "",
      galleryImages: [],
      sourceUrl: "https://zmrobo.net/products/67",
      displayOrder: 3,
      isPublished: true,
    },
  ];

  for (const kit of zmRoboKits) {
    await db.zMRoboKit.upsert({
      where: { slug: kit.slug },
      update: kit,
      create: kit,
    });
  }
  const validKitSlugs = zmRoboKits.map((k) => k.slug);
  const removedKits = await db.zMRoboKit.deleteMany({
    where: { slug: { notIn: validKitSlugs } },
  });
  console.log(
    `✅ ${zmRoboKits.length} ZMRobo kits đã tạo · removed ${removedKits.count} kit cũ`,
  );

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
      centerId: "center-nguyen-huu-tho",
      isActive: true,
    },
  });
  console.log(`✅ Admin tạo xong: ${admin.email}`);


  // ─── Job Postings ─────────────────────────────────────────────────────────────
  const jobsData = [
    {
      slug: 'sale-tu-van-tuyen-sinh',
      title: 'Sale Tư vấn Tuyển sinh',
      department: 'marketing-sale',
      location: 'danang',
      type: 'fulltime',
      description: `## Mô tả công việc\n\nSata Robo đang tìm 2 chuyên viên Sale Tư vấn Tuyển sinh năng động cho 4 trung tâm tại Đà Nẵng.\n\n**Trách nhiệm chính:**\n\n- Tư vấn các khoá học Robotics, lập trình, luyện thi cho phụ huynh và học sinh\n- Tiếp nhận lead từ marketing, gọi điện và hẹn lịch demo trực tiếp tại trung tâm\n- Theo dõi pipeline trong CRM, cập nhật trạng thái từng lead\n- Đạt KPI doanh số cá nhân hàng tháng\n- Phối hợp với đội Marketing để tối ưu chất lượng lead\n\n**Khu vực phụ trách:** Đà Nẵng (4 cơ sở)`,
      requirements: `## Yêu cầu\n\n**Kinh nghiệm:**\n- Tối thiểu 1 năm kinh nghiệm Sale/Telesales (ưu tiên ngành giáo dục)\n- Hoặc Fresher có khả năng học hỏi tốt, đam mê lĩnh vực giáo dục\n\n**Kỹ năng:**\n- Giao tiếp tốt với phụ huynh, có khả năng lắng nghe và thuyết phục\n- Kiên trì, chịu áp lực KPI cao\n- Sử dụng thành thạo Zalo, Facebook, email\n\n**Cá tính:**\n- Yêu trẻ em, kiên nhẫn với phụ huynh\n- Tinh thần đồng đội, sẵn sàng học hỏi`,
      benefits: `## Quyền lợi\n\n**Thu nhập:**\n- Lương cơ bản: 7–10 triệu/tháng\n- Hoa hồng theo doanh số (không giới hạn)\n- Tổng thu nhập trung bình: 12–20 triệu/tháng\n\n**Phúc lợi:**\n- BHXH, BHYT, BHTN đầy đủ\n- Thưởng các ngày lễ và lương tháng 13\n- Phụ cấp xăng xe, ăn trưa\n- Đào tạo nội bộ chuyên sâu\n\n**Môi trường:**\n- Team trẻ, năng động, lộ trình thăng tiến rõ ràng\n- Giờ làm: T2–T6 (8h30–17h30) + T7 sáng`,
      salaryMin: 7_000_000,
      salaryMax: 20_000_000,
      salaryNote: null as string | null,
      status: 'OPEN' as const,
      openings: 2,
      closesAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    {
      slug: 'giang-vien-robotics',
      title: 'Giảng viên Robotics & Lập trình',
      department: 'dao-tao',
      location: 'danang',
      type: 'fulltime',
      description: `## Mô tả công việc\n\nBạn sẽ trực tiếp giảng dạy các khoá **Lập trình Robot** và **Luyện thi RoboSim** cho học sinh lớp 1–8 tại các cơ sở Sata Robo.\n\n**Trách nhiệm:**\n\n- Lên giáo án và giảng dạy theo chương trình chuẩn WRO\n- Theo dõi và đánh giá tiến độ từng học viên\n- Tham gia nghiên cứu phát triển giáo trình mới\n- Hướng dẫn và huấn luyện đội tuyển thi đấu\n- Báo cáo định kỳ với Trưởng bộ môn`,
      requirements: `## Yêu cầu\n\n- Tốt nghiệp ĐH ngành Kỹ thuật, CNTT, Cơ điện tử hoặc liên quan\n- Đam mê giáo dục và làm việc với trẻ em\n- Có kiến thức lập trình (Scratch, Python, C++ là lợi thế)\n- Ưu tiên: đã từng thi đấu Robotics hoặc có chứng chỉ liên quan\n- Kiên nhẫn, có kỹ năng truyền đạt tốt`,
      benefits: `## Quyền lợi\n\n- Lương: 8–15 triệu/tháng tuỳ năng lực\n- Được đào tạo chuyên sâu 40 giờ trước khi đứng lớp\n- Cơ hội phát triển thành GV Lead hoặc Trưởng bộ môn\n- BHXH đầy đủ, phụ cấp ăn trưa\n- Môi trường học thuật, được tiếp cận thiết bị robot hiện đại`,
      salaryMin: 8_000_000,
      salaryMax: 15_000_000,
      salaryNote: null as string | null,
      status: 'OPEN' as const,
      openings: 3,
      closesAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
    },
    {
      slug: 'marketing-specialist',
      title: 'Marketing Specialist',
      department: 'marketing',
      location: 'danang',
      type: 'fulltime',
      description: `## Mô tả công việc\n\nBạn sẽ phụ trách toàn bộ hoạt động marketing digital cho Sata Robo — từ content creation đến performance ads.\n\n**Trách nhiệm:**\n\n- Lên kế hoạch và triển khai chiến lược content: blog, Facebook, TikTok, YouTube\n- Chạy và tối ưu quảng cáo Facebook Ads, Google Ads\n- Phân tích dữ liệu (GA4, Meta Pixel, CRM) và báo cáo hàng tuần\n- Phối hợp với team Sales để tối ưu conversion rate\n- Quản lý KOL/KOC và các chiến dịch collaboration`,
      requirements: `## Yêu cầu\n\n- Tốt nghiệp ĐH ngành Marketing, Truyền thông, QTKD hoặc liên quan\n- Tối thiểu 2 năm kinh nghiệm Digital Marketing\n- Thành thạo Facebook Ads Manager, Google Ads\n- Biết viết content chuẩn SEO, thiết kế cơ bản (Canva/Figma)\n- Có dữ liệu thành tích chiến dịch cụ thể (ROAS, CPL, CTR...)`,
      benefits: `## Quyền lợi\n\n- Lương: 10–18 triệu/tháng + thưởng KPI\n- Budget quảng cáo riêng để thử nghiệm và học hỏi\n- Được đầu tư công cụ: Canva Pro, scheduling tool, analytics\n- Môi trường sáng tạo, tự chủ cao\n- BHXH đầy đủ, thưởng tháng 13`,
      salaryMin: 10_000_000,
      salaryMax: 18_000_000,
      salaryNote: null as string | null,
      status: 'OPEN' as const,
      openings: 1,
      closesAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    {
      slug: 'frontend-developer-nextjs',
      title: 'Frontend Developer (React / Next.js)',
      department: 'it',
      location: 'online-hybrid',
      type: 'fulltime',
      description: `## Mô tả công việc\n\nBạn sẽ phát triển và duy trì **satarobo.vn** và các sản phẩm web nội bộ của Sata Robo — bao gồm website marketing, admin CRM và LMS học viên.\n\n**Trách nhiệm:**\n\n- Phát triển tính năng mới cho website theo yêu cầu của Product Owner\n- Tối ưu performance (Core Web Vitals, Lighthouse score ≥ 90)\n- Code review và maintain code quality\n- Phối hợp với team Marketing để implement tracking (GA4, Meta Pixel)\n- Báo cáo tiến độ và đề xuất cải tiến kỹ thuật`,
      requirements: `## Yêu cầu\n\n**Bắt buộc:**\n- Tối thiểu 2 năm kinh nghiệm React.js\n- Thành thạo Next.js App Router (RSC, Server Actions)\n- TypeScript strict mode\n- Tailwind CSS, responsive design\n- Hiểu biết về Web Performance và SEO kỹ thuật\n\n**Lợi thế:**\n- Có kinh nghiệm Prisma / PostgreSQL\n- Đã từng build CMS hoặc admin panel\n- Hiểu về tracking (GA4, Meta Pixel, CAPI)`,
      benefits: `## Quyền lợi\n\n- Lương: 15–30 triệu/tháng tuỳ năng lực\n- Làm việc Hybrid: 3 ngày remote, 2 ngày tại Đà Nẵng (hoặc Full Remote với senior)\n- Được chọn công cụ và setup môi trường làm việc\n- Review lương 2 lần/năm\n- Budget học tập 5 triệu/năm (sách, khoá học, conference)\n- BHXH đầy đủ`,
      salaryMin: 15_000_000,
      salaryMax: 30_000_000,
      salaryNote: null as string | null,
      status: 'OPEN' as const,
      openings: 1,
      closesAt: null,
    },
    {
      slug: 'thuc-tap-sinh-marketing',
      title: 'Thực tập sinh Marketing',
      department: 'marketing',
      location: 'danang',
      type: 'intern',
      description: `## Mô tả công việc\n\nBạn sẽ được trải nghiệm thực tế tại bộ phận Marketing — không phải pha cà phê và photo tài liệu, mà là **làm việc thật**.\n\n**Bạn sẽ làm:**\n\n- Sản xuất nội dung: viết bài blog, caption mạng xã hội, kịch bản TikTok\n- Thiết kế poster, banner sự kiện bằng Canva\n- Hỗ trợ chạy và theo dõi chiến dịch quảng cáo\n- Phân tích số liệu từ Facebook Insights, Google Analytics\n- Tham gia sự kiện và hoạt động của trung tâm`,
      requirements: `## Yêu cầu\n\n- Sinh viên năm 3–4 ngành Marketing, Truyền thông, QTKD hoặc liên quan\n- Có thể đi làm tối thiểu 4 buổi/tuần\n- Biết Canva (Figma là lợi thế)\n- Có tài khoản Facebook/TikTok/Instagram hoạt động\n- Nhiệt tình, ham học hỏi, có khiếu sáng tạo nội dung`,
      benefits: `## Quyền lợi\n\n- Phụ cấp: 3–5 triệu/tháng tuỳ mức độ đóng góp\n- Được mentor 1:1 với Marketing Manager\n- Thực hành thật với budget quảng cáo thật\n- Cơ hội chuyển thành nhân viên chính thức sau thực tập\n- Chứng nhận thực tập có giá trị, được ký và đóng dấu công ty`,
      salaryMin: 3_000_000,
      salaryMax: 5_000_000,
      salaryNote: null as string | null,
      status: 'OPEN' as const,
      openings: 2,
      closesAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    },
  ]

  let jobCount = 0
  for (const job of jobsData) {
    await db.jobPosting.upsert({
      where: { slug: job.slug },
      update: { ...job, authorId: admin.id },
      create: { ...job, authorId: admin.id },
    })
    jobCount++
  }
  console.log(`✅ ${jobCount} tin tuyển dụng đã tạo`)

  // ─── Hall of Fame ─────────────────────────────────────────────────────────────
  await seedHonors(db);

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
