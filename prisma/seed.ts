import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedHonors } from "./seed-honors";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Bắt đầu seed data...");

  // ─── Centers ─────────────────────────────────────────────────────────────────
  // 2 cơ sở mới (Phase 4.UI.FIX.2). Loại bỏ cơ sở cũ.
  const centersData = [
    {
      id: "center-nguyen-huu-tho",
      name: "Cơ sở 1 - Hải Châu (Trụ sở chính)",
      address: "211 Nguyễn Hữu Thọ, Đà Nẵng",
      phone: "0818823720",
      email: "satarobo@gmail.com",
    },
    {
      id: "center-hoang-dieu",
      name: "Cơ sở 2 - Hải Châu",
      address: "114 Hoàng Diệu, Đà Nẵng",
      phone: "0818823720",
      email: "satarobo@gmail.com",
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
  const newHqId = centersData[0].id;
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

  // ─── Blog Posts ───────────────────────────────────────────────────────────────
  // Xoá blog posts legacy đã đổi slug khi chuyển từ 4 SPs về 2 khoá học chính.
  await db.blogPost.deleteMany({
    where: {
      slug: { in: ['sata-inno-school-giai-phap-stem-truong-hoc', 'satago-du-lich-giao-duc-stem'] },
    },
  });

  const blogPosts = await Promise.all([
    db.blogPost.upsert({
      where: { slug: 'tai-sao-tre-can-hoc-lap-trinh-robot' },
      update: {},
      create: {
        slug: 'tai-sao-tre-can-hoc-lap-trinh-robot',
        title: 'Tại sao trẻ em cần học lập trình Robot từ sớm?',
        excerpt: 'Trong thế giới công nghệ phát triển vũ bão, tư duy lập trình và kỹ năng STEM không còn là "môn học thêm" mà là nền tảng thiết yếu cho tương lai của con.',
        content: `## Thế giới đang thay đổi — và con cần được chuẩn bị

Theo báo cáo của World Economic Forum, **65% công việc của thế hệ Z chưa tồn tại** vào thời điểm hiện tại. Điều đó có nghĩa là gì? Nghĩa là chúng ta cần chuẩn bị cho con không phải bằng kiến thức cụ thể, mà bằng **tư duy linh hoạt, khả năng giải quyết vấn đề và sáng tạo**.

Lập trình Robot chính là môi trường lý tưởng để rèn luyện những kỹ năng này.

## 5 lý do phụ huynh nên cho con học lập trình Robot

### 1. Phát triển tư duy logic có hệ thống

Khi lập trình, trẻ phải chia nhỏ vấn đề lớn thành các bước nhỏ có thứ tự. Đây chính là **computational thinking** — kỹ năng tư duy nền tảng mà các nhà tuyển dụng hàng đầu thế giới tìm kiếm.

### 2. Học qua thất bại — không sợ sai

Robot không biết nói dối. Code chạy sai thì robot làm sai. Trẻ phải tự tìm lỗi, sửa, chạy lại. Quá trình đó xây dựng **khả năng chịu đựng thất bại và kiên trì** — điều mà không có sách giáo khoa nào dạy được.

### 3. Kết hợp lý thuyết và thực hành

Toán học không còn trừu tượng khi trẻ thấy robot di chuyển đúng quãng đường đã tính. Vật lý không còn khô khan khi cảm biến đo được lực chính xác. **STEM trở nên sống động và có ý nghĩa**.

### 4. Phát triển kỹ năng làm việc nhóm

Dự án Robot thường làm theo nhóm. Trẻ phải phân công nhiệm vụ, giải quyết xung đột ý kiến, cùng nhau đạt mục tiêu chung — **kỹ năng mềm quan trọng không kém kỹ năng kỹ thuật**.

### 5. Mở ra cơ hội thi đấu quốc tế

Các kỳ thi như **WRO (World Robot Olympiad), RoboSim, FLL** là cơ hội để con thể hiện tài năng ở sân chơi quốc tế, xây dựng hồ sơ học bổng ấn tượng.

## Bắt đầu từ đâu?

Sata Robo thiết kế lộ trình học phù hợp cho từng độ tuổi:

- **Lớp 1-3:** Làm quen với tư duy lập trình qua trò chơi và robot đơn giản
- **Lớp 4-6:** Lập trình logic cơ bản, điều khiển cảm biến
- **Lớp 7-8:** Lập trình nâng cao, chuẩn bị thi đấu

> "Con tôi học được 3 tháng, bây giờ tự mày mò sửa đồ điện tử trong nhà. Quan trọng hơn là con không còn nản lòng khi gặp khó khăn nữa." — Phụ huynh học viên lớp 5

Hãy để con bước vào thế giới của tương lai từ hôm nay. **[Đăng ký tư vấn miễn phí →](/lien-he)**`,
        isPublished: true,
        publishedAt: new Date('2026-04-15'),
        category: 'phu-huynh',
        tags: ['lập trình', 'robotics', 'stem', 'giáo dục', 'kỹ năng'],
        readingTime: 5,
        seoTitle: 'Tại sao trẻ cần học lập trình Robot từ sớm? — Sata Robo',
        seoDesc: 'Khám phá 5 lý do khoa học chứng minh lập trình Robot giúp trẻ phát triển tư duy, kỹ năng mềm và chuẩn bị cho tương lai số.',
        authorId: admin.id,
      },
    }),
    db.blogPost.upsert({
      where: { slug: 'robosim-la-gi-huong-dan-thi-dau' },
      update: {},
      create: {
        slug: 'robosim-la-gi-huong-dan-thi-dau',
        title: 'RoboSim là gì? Hướng dẫn thi đấu từ A đến Z cho học sinh',
        excerpt: 'RoboSim là sân thi đấu Robotics ảo lớn nhất Việt Nam. Bài viết này giải thích cấu trúc giải đấu, cách tính điểm và lộ trình luyện tập hiệu quả.',
        content: `## RoboSim — Giải đấu Robotics ảo hàng đầu Việt Nam

**RoboSim** (Robot Simulation) là nền tảng thi đấu lập trình robot ảo do Bộ GD&ĐT phối hợp tổ chức, dành cho học sinh tiểu học và THCS. Khác với các giải đấu robot vật lý, RoboSim thi trên môi trường mô phỏng — giúp mọi học sinh đều có cơ hội tham gia dù không có robot thật.

## Cấu trúc giải đấu

### Các vòng thi

| Vòng | Hình thức | Thời gian |
|------|-----------|-----------|
| Vòng sơ loại | Thi trực tuyến trên nền tảng | Tháng 10-11 |
| Vòng chung kết cấp tỉnh | Thi tập trung | Tháng 12 |
| Vòng chung kết toàn quốc | Thi tập trung tại Hà Nội | Tháng 1-2 |

### Bảng thi

- **Bảng A (Tiểu học):** Lớp 3-5
- **Bảng B (THCS):** Lớp 6-8

## Nội dung thi

Đề thi RoboSim thường gồm 3 phần:

### Phần 1: Lập trình cơ bản (30 điểm)
Viết code điều khiển robot di chuyển theo lộ trình cho sẵn. Yêu cầu hiểu biết về vòng lặp, điều kiện, biến số.

### Phần 2: Xử lý cảm biến (40 điểm)
Robot phải phản ứng với môi trường: tránh vật cản, theo đường kẻ, nhận diện màu sắc.

### Phần 3: Bài toán tổng hợp (30 điểm)
Kết hợp tất cả kỹ năng để giải quyết một kịch bản thực tế phức tạp hơn.

## Lộ trình luyện tập tại Sata Robo

\`\`\`
Tháng 1-2: Nền tảng lập trình — biến, vòng lặp, điều kiện
Tháng 3-4: Điều khiển robot — di chuyển chính xác
Tháng 5-6: Xử lý cảm biến — ánh sáng, khoảng cách, màu sắc
Tháng 7-8: Giải đề thi năm trước, phân tích lỗi
Tháng 9:   Luyện thi sprint, mô phỏng điều kiện thi thật
\`\`\`

## Học sinh Sata Robo đã đạt được gì?

- 🏆 **12 giải thưởng** cấp thành phố năm học 2024-2025
- 🥇 **3 học sinh** vào vòng chung kết toàn quốc
- 📈 **87%** học sinh hoàn thành khoá vượt qua vòng sơ loại

> Đăng ký **khóa luyện thi RoboSim** tại Sata Robo ngay hôm nay để con được học đúng lộ trình, đúng đề thi. **[Xem khóa học →](/khoa-hoc/luyen-thi-robosim)**`,
        isPublished: true,
        publishedAt: new Date('2026-04-22'),
        category: 'giao-duc',
        tags: ['robosim', 'thi đấu', 'luyện thi', 'robotics', 'học sinh'],
        readingTime: 6,
        seoTitle: 'RoboSim là gì? Hướng dẫn thi đấu từ A đến Z — Sata Robo',
        seoDesc: 'Tìm hiểu cấu trúc giải đấu RoboSim, nội dung thi, cách tính điểm và lộ trình luyện tập hiệu quả để học sinh đạt giải cao.',
        authorId: admin.id,
      },
    }),
    db.blogPost.upsert({
      where: { slug: 'lop-1-8-co-nen-hoc-lap-trinh-robot' },
      update: {},
      create: {
        slug: 'lop-1-8-co-nen-hoc-lap-trinh-robot',
        title: 'Trẻ lớp 1-8 có nên học Lập trình Robot? — Góc nhìn từ Sata Robo',
        excerpt: 'Phân tích khoa học về độ tuổi vàng học Robotics, lợi ích tư duy thuật toán và cách phụ huynh có thể bắt đầu cùng con.',
        content: `## Tại sao lớp 1-8 là độ tuổi vàng?

Theo nghiên cứu của **Carnegie Mellon University** và **MIT Media Lab**, trẻ em từ 6-14 tuổi đang ở giai đoạn:
- Phát triển mạnh tư duy logic (executive function)
- Não bộ linh hoạt nhất với khái niệm trừu tượng
- Hình thành thái độ với khoa học và công nghệ

Đây chính là lý do **chương trình Lập trình Robot của Sata Robo** thiết kế riêng cho học sinh K-9.

## 4 lợi ích thực tế khi con học Robotics sớm

### 🧠 1. Tư duy thuật toán
Khi viết chương trình điều khiển robot, con phải chia bài toán thành các bước nhỏ — kỹ năng này áp dụng được cho Toán, Lý, Tin và cả viết văn.

### 🔧 2. Kỹ năng giải quyết vấn đề
Robot không hoạt động đúng? Con phải tự debug. Sata Robo dạy phương pháp tư duy "thử — sai — sửa" theo khoa học, không phải "cứ thử đại".

### 👥 3. Làm việc nhóm
Dự án cuối khoá luôn theo nhóm 2-4 học sinh. Con học chia việc, lắng nghe, phản biện — kỹ năng cần thiết suốt đời.

### 🎯 4. Sự tự tin
Khi robot do chính tay con lập trình chạy đúng, đó là niềm tự hào không gì sánh được. Phụ huynh Sata Robo phản hồi: con trở nên chủ động và dám thử cái mới hơn.

## Lộ trình Lập trình Robot tại Sata Robo

| Cấp độ | Đối tượng | Nội dung chính |
|--------|-----------|----------------|
| **Beginner** | Lớp 1-3 | Lắp robot, di chuyển cơ bản, cảm biến đơn giản |
| **Intermediate** | Lớp 4-6 | Lập trình block-based, giải mê cung, dự án nhóm |
| **Advanced** | Lớp 7-8 | Python cơ bản, cảm biến nâng cao, chuẩn bị thi RoboSim |

## Cách bắt đầu

1. **Đặt lịch học thử miễn phí 1-2 buổi** tại 1 trong 4 cơ sở Sata Robo
2. Tham khảo phản hồi của 1,200+ phụ huynh đã đồng hành
3. Bắt đầu lộ trình phù hợp với con

**[Đăng ký học thử miễn phí →](/lien-he?subject=laptrinhrobot)**`,
        isPublished: true,
        publishedAt: new Date('2026-05-01'),
        category: 'phu-huynh',
        tags: ['lập trình robot', 'k-9', 'tư duy', 'sata robo', 'phụ huynh'],
        readingTime: 5,
        seoTitle: 'Trẻ lớp 1-8 có nên học Lập trình Robot? | Sata Robo',
        seoDesc: 'Phân tích khoa học độ tuổi vàng học Robotics K-9. Lộ trình Lập trình Robot tại Sata Robo cho học sinh lớp 1-8, 4 cơ sở Đà Nẵng.',
        authorId: admin.id,
      },
    }),
    db.blogPost.upsert({
      where: { slug: 'luyen-thi-robosim-lo-trinh-pass-vong-loai' },
      update: {},
      create: {
        slug: 'luyen-thi-robosim-lo-trinh-pass-vong-loai',
        title: 'Luyện thi RoboSim — Lộ trình pass vòng loại Sáng tạo Robotics 2026',
        excerpt: 'Tổng hợp bí quyết luyện thi RoboSim cho bảng R1 (Tiểu học) và R2 (THCS) — từ nền tảng đến giải đề năm trước.',
        content: `## Cuộc thi Sáng tạo Robotics RoboSim là gì?

**RoboSim** là cuộc thi Robotics chính thức tại Việt Nam, sử dụng platform mô phỏng thay vì robot vật lý. Học sinh thi 2 bảng:
- **R1**: Tiểu học (lớp 1-5)
- **R2**: THCS (lớp 6-9)

Mỗi năm, hàng nghìn học sinh tham gia vòng sơ loại online — chỉ top ~15% được vào vòng tỉnh, top ~3% vào vòng quốc gia.

## 3 sai lầm thường gặp khi luyện thi

### ❌ 1. Học lập trình chung chung, không bám đề
Nhiều bạn học Python/Scratch tốt nhưng không biết cách giải đề RoboSim cụ thể. **Phải luyện đúng đề.**

### ❌ 2. Bỏ qua vòng giải đề năm trước
Đề thi RoboSim có pattern. Học sinh giải kỹ 3-4 đề cũ thường có lợi thế lớn trong vòng sơ loại.

### ❌ 3. Không có coaching cá nhân
Học video một mình dễ bị "stuck" 2-3 tuần ở một bug. Mentor 1-1 giải đáp trong 24h thường tiết kiệm hàng tháng tự mò.

## Lộ trình luyện thi 3-6 tháng tại Sata Robo

| Giai đoạn | Thời gian | Nội dung |
|-----------|-----------|----------|
| **Nền tảng** | Tuần 1-4 | Biến, vòng lặp, điều kiện. Thực hành RoboSim Lite. |
| **Cảm biến** | Tuần 5-8 | Ánh sáng, khoảng cách, màu — bài toán thực tế. |
| **Giải đề năm trước** | Tuần 9-12 | Phân tích đề 2024, 2025. Giải mẫu + tự thi thử. |
| **Sprint luyện thi** | Tuần 13-16 | Mô phỏng điều kiện thi thật, giải đề trong giới hạn thời gian. |
| **Coaching 1-1** | Xuyên suốt | Buổi cá nhân với mentor, giải đáp khó khăn riêng. |

## Kết quả Sata Robo 2026

- **87%** học viên pass vòng sơ loại
- **24 giải thưởng** RoboSim 2026 (5 vàng, 8 bạc, 11 đồng)
- **800+ học viên** đã tham gia khoá luyện thi từ 2023

> "Con nhà tôi không thông minh xuất sắc, nhưng với khoá Luyện thi RoboSim ở Sata Robo, con pass được vòng tỉnh năm đầu tiên." — Chị Hà, phụ huynh lớp 7

**[Học thử miễn phí 1 module →](/lien-he?subject=luyenthirobosim)**`,
        isPublished: true,
        publishedAt: new Date('2026-05-05'),
        category: 'tin-tuc',
        tags: ['luyện thi', 'robosim', 'r1', 'r2', 'sáng tạo robotics'],
        readingTime: 5,
        seoTitle: 'Luyện thi RoboSim 2026 — Lộ trình pass vòng loại | Sata Robo',
        seoDesc: 'Bí quyết luyện thi RoboSim bảng R1 & R2: nền tảng, cảm biến, giải đề năm trước, coaching 1-1. 87% học viên Sata Robo pass vòng sơ loại.',
        authorId: admin.id,
      },
    }),
    db.blogPost.upsert({
      where: { slug: 'cha-me-can-biet-chon-trung-tam-robot' },
      update: {},
      create: {
        slug: 'cha-me-can-biet-chon-trung-tam-robot',
        title: '5 tiêu chí phụ huynh cần kiểm tra khi chọn trung tâm học Robot cho con',
        excerpt: 'Thị trường trung tâm dạy Robot đang bùng nổ, khiến phụ huynh khó lựa chọn. Đây là 5 tiêu chí thực tế giúp bạn đánh giá đúng chất lượng.',
        content: `## Đừng để "giảm giá 50%" làm mờ mắt

Khi trung tâm Robotics mọc lên như nấm, phụ huynh đứng trước rừng lựa chọn: quảng cáo nào cũng hứa hẹn "chuẩn quốc tế", "giáo viên chuyên nghiệp", "đảm bảo vào WRO". Vậy làm sao phân biệt thật — giả?

Dưới đây là **5 tiêu chí cứng** mà Sata Robo khuyên phụ huynh nên hỏi thẳng trước khi đăng ký.

## Tiêu chí 1: Giáo viên được đào tạo bài bản chưa?

Câu hỏi cần hỏi:
- Giáo viên có chứng chỉ lập trình/robotics từ tổ chức nào?
- Giáo viên có từng thi đấu hoặc huấn luyện đội tuyển?
- Tỉ lệ giáo viên/học sinh trong lớp là bao nhiêu?

**Lớp lý tưởng:** Tối đa 8-10 học sinh/giáo viên để đảm bảo sự chú ý cá nhân.

## Tiêu chí 2: Chương trình học có lộ trình rõ ràng không?

Trung tâm tốt phải cung cấp được:
- Syllabus chi tiết cho từng cấp độ
- Mục tiêu cụ thể sau mỗi khoá (con làm được gì?)
- Cách đánh giá tiến độ học viên

❌ **Cảnh báo:** Trung tâm không có syllabus, chỉ nói chung chung "học robot WeDo/LEGO/Scratch" mà không có lộ trình cụ thể.

## Tiêu chí 3: Thiết bị và cơ sở vật chất

- Robot có phải hàng chính hãng? (LEGO Education, Makeblock, VEX...)
- Phòng học có đủ ánh sáng, diện tích, máy tính?
- Thiết bị có được bảo trì thường xuyên?

💡 **Mẹo:** Hỏi xin tham quan cơ sở trước khi đăng ký. Trung tâm tự tin về cơ sở vật chất sẽ không từ chối.

## Tiêu chí 4: Thành tích thi đấu thực tế

- Có bao nhiêu học viên từng thi RoboSim, WRO, FLL?
- Kết quả cụ thể: giải mấy, vòng nào?
- Có thể liên hệ phụ huynh học viên cũ để hỏi thêm không?

Thành tích là minh chứng khách quan nhất cho chất lượng đào tạo.

## Tiêu chí 5: Chính sách học thử và hoàn tiền

Trung tâm có niềm tin vào chương trình của mình sẽ không ngại:
- Cho học thử **1-2 buổi miễn phí**
- Hoàn tiền nếu con không phù hợp sau 2-3 buổi đầu

❌ **Cảnh báo:** Yêu cầu đóng cả khoá ngay từ đầu mà không có học thử — rủi ro cao cho phụ huynh.

---

## Sata Robo cam kết 5 tiêu chí trên như thế nào?

| Tiêu chí | Sata Robo |
|---------|-----------|
| Giáo viên | Tốt nghiệp ĐH kỹ thuật, chứng chỉ WRO, tỉ lệ 1:8 |
| Chương trình | Syllabus 36 tuần/cấp độ, đánh giá hàng tháng |
| Thiết bị | LEGO Education chính hãng, phòng lab 40m² |
| Thành tích | 12 giải thành phố, 3 top 10 quốc gia (2024-2025) |
| Học thử | 2 buổi miễn phí, hoàn 100% phí khoá 1 nếu không hài lòng |

**[Đăng ký học thử miễn phí ngay →](/lien-he?subject=hoc-thu)**`,
        isPublished: true,
        publishedAt: new Date('2026-05-08'),
        category: 'phu-huynh',
        tags: ['tư vấn', 'chọn trung tâm', 'phụ huynh', 'chất lượng', 'robotics'],
        readingTime: 6,
        seoTitle: '5 tiêu chí chọn trung tâm học Robot cho con — Sata Robo',
        seoDesc: 'Hướng dẫn thực tế giúp phụ huynh đánh giá đúng chất lượng trung tâm dạy Robot: giáo viên, chương trình, thiết bị, thành tích và chính sách học thử.',
        authorId: admin.id,
      },
    }),
  ])
  console.log(`✅ ${blogPosts.length} bài viết blog đã tạo`)

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
