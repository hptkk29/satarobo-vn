/**
 * Seed 9 CoursePackage records: Sata1-Sata8 + Combo Sata1+Sata2.
 * Idempotent via upsert. Removes any record not in this list.
 *
 * Run: pnpm dotenv -e .env.local -- pnpm tsx scripts/seed-course-packages.ts
 */
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

interface PackageSeed
  extends Omit<Prisma.CoursePackageCreateInput, "createdAt" | "updatedAt"> {
  slug: string;
}

const PACKAGES: PackageSeed[] = [
  // ========== SATA1 ==========
  {
    slug: "sata1",
    code: "Sata1",
    name: "Robosim Master",
    shortName: "Sata1 — Robosim Master",
    subtitle: "Luyện thi vòng loại với phần mềm Robosim độc quyền",
    shortDescription:
      "Khoá Robosim 16 buổi luyện thi vòng loại Cuộc thi Sáng tạo Robotics Toàn Quốc 2026 — Robosim là công cụ thi bắt buộc, chỉ Sata Robo đào tạo.",
    description:
      "Sata1 — Robosim Master là khoá học luyện thi vòng loại Cuộc thi 2026. 16 buổi chuyên sâu về Robosim. Lớp ≤12 HV. Cam kết hoàn 100% nếu không vượt vòng loại.\n\nLỘ TRÌNH 16 BUỔI:\n- Phần 1 (Buổi 1-4): Đại cương Robosim - Giao diện, công cụ, lệnh cơ bản\n- Phần 2 (Buổi 5-10): Giải đề - Phân tích từng bài thi vòng loại 2026\n- Phần 3 (Buổi 11-16): Chiến thuật thi đấu - Tối ưu thuật toán, mô phỏng thi thử",
    ageGroup: "Lớp 1-8",
    level: "Nhập môn",
    lessons: 16,
    duration: "2 tháng",
    priceOriginal: 2_400_000,
    priceEarlyBird: 1_800_000,
    priceMember: 2_040_000,
    features: [
      { icon: "Code", title: "Robosim độc quyền", desc: "Phần mềm thi bắt buộc 2026" },
      { icon: "Users", title: "Lớp ≤12 HV", desc: "GV kèm sát từng học viên" },
      { icon: "Target", title: "Luyện đề thật", desc: "Đề thi vòng loại 2026" },
      { icon: "Trophy", title: "Cam kết hoàn 100%", desc: "Nếu không vượt vòng loại" },
    ],
    highlights: [
      "Robosim — Phần mềm bắt buộc Cuộc thi 2026",
      "Lớp nhỏ ≤12 HV — GV tận tâm",
      "Học bằng đề thi thật vòng loại",
      "Cam kết hoàn 100% nếu không qua vòng loại",
    ],
    curriculum: [
      { topic: "Đại cương Robosim", lessons: 4 },
      { topic: "Giải đề vòng loại 2026", lessons: 6 },
      { topic: "Chiến thuật + Thi thử", lessons: 6 },
    ],
    badge: "🎯",
    color: "orange",
    displayOrder: 1,
    isPublished: true,
    isFeatured: true,
    parentCourseSlug: "laptrinhrobot",
    seoTitle: "Sata1 Robosim Master | Luyện Thi Robotics 2026",
    seoDescription:
      "Khoá Robosim 16 buổi luyện thi vòng loại Robotics 2026. Học phí 2.4M, EB từ 1.8M.",
  },
  // ========== SATA2 ==========
  {
    slug: "sata2",
    code: "Sata2",
    name: "Đấu Trường Robot",
    shortName: "Sata2 — Đấu Trường Robot",
    subtitle: "Thực chiến robot thật trên sa bàn 100% giống cuộc thi",
    shortDescription:
      "Khoá 16 buổi thực chiến robot thật với sa bàn 100% giống Cuộc thi Robotics 2026.",
    description:
      "Sata2 — Đấu Trường Robot là khoá thực chiến robot thật. ZMRobo Beta Set 133 PCS. Sa bàn 100% giống cuộc thi chính thức. Phối hợp Robosim + Robot thật.\n\nPHÙ HỢP CHO:\n- Học viên lớp 3-8 đã hoàn thành Sata1\n- Đội tuyển Robotics chuẩn bị thi cấp TP\n- Học sinh yêu thích lập trình robot vật lý",
    ageGroup: "Lớp 3-8",
    level: "Trung cấp",
    lessons: 16,
    duration: "2 tháng",
    priceOriginal: 3_040_000,
    priceEarlyBird: 2_280_000,
    priceMember: 2_584_000,
    features: [
      { icon: "Cpu", title: "Robot thật ZMRobo", desc: "Beta Set 133 PCS" },
      { icon: "Map", title: "Sa bàn chuẩn", desc: "100% điều kiện thi đấu" },
      { icon: "Zap", title: "Thi thử mô phỏng", desc: "Thời gian + điều kiện như thi" },
      { icon: "Trophy", title: "Phối hợp Sata1", desc: "Robosim + Robot thật" },
    ],
    highlights: [
      "Thực chiến trên robot vật lý",
      "Sa bàn chuẩn cuộc thi 2026",
      "Lớp ≤12 HV — GV tận tâm",
      "Phù hợp đội tuyển thi đấu",
    ],
    badge: "🏟️",
    color: "purple",
    displayOrder: 2,
    isPublished: true,
    isFeatured: true,
    parentCourseSlug: "laptrinhrobot",
    seoTitle: "Sata2 Đấu Trường Robot | Thực Chiến Robot",
    seoDescription:
      "16 buổi thực chiến robot thật. ZMRobo Beta Set. 3.04M, EB 2.28M.",
  },
  // ========== SATA3 ==========
  {
    slug: "sata3",
    code: "Sata3",
    name: "Ươm Mầm Tài Năng",
    shortName: "Sata3 — Ươm Mầm Tài Năng",
    subtitle: "Lộ trình chuyên sâu 48 buổi - cấp độ Sơ cấp",
    shortDescription:
      "Khoá chuyên sâu 48 buổi cấp độ Sơ cấp - khởi đầu hành trình Robotics dài hạn.",
    description:
      "Sata3 — Ươm Mầm Tài Năng là khoá đầu tiên trong lộ trình chuyên sâu 5 cấp độ (Sata3 → Sata7).\n\n48 buổi học - lộ trình dài hạn 6 tháng. Cấp độ Sơ cấp. Học cụ ZMRobo Alpha Set 320-378 PCS. Trả góp 0% — VPBank/Sacombank/Home Credit.",
    ageGroup: "Lớp 1-8",
    level: "Sơ cấp",
    lessons: 48,
    duration: "6 tháng",
    priceOriginal: 10_560_000,
    priceEarlyBird: 7_920_000,
    priceMember: 8_976_000,
    features: [
      { icon: "Sprout", title: "Lộ trình 48 buổi", desc: "Bài bản căn bản → trung cấp" },
      { icon: "Award", title: "Alpha Set", desc: "ZMRobo 320-378 PCS" },
      { icon: "CreditCard", title: "Trả góp 0%", desc: "VPBank/Sacombank/Home Credit" },
      { icon: "TrendingUp", title: "Tiếp nối Sata4-7", desc: "Hành trình liên tục" },
    ],
    highlights: [
      "Lộ trình 48 buổi bài bản",
      "Alpha Set chính hãng",
      "Trả góp 0% linh hoạt",
      "Tiếp nối lên cấp cao",
    ],
    badge: "🌱",
    color: "green",
    displayOrder: 3,
    isPublished: true,
    isFeatured: true,
    parentCourseSlug: "laptrinhrobot",
    seoTitle: "Sata3 Ươm Mầm Tài Năng | Robotics 48 Buổi",
    seoDescription:
      "Khoá Robotics 48 buổi cấp Sơ cấp. ZMRobo Alpha Set. 10.56M, trả góp 0%.",
  },
  // ========== SATA4 - DRAFT ==========
  {
    slug: "sata4",
    code: "Sata4",
    name: "Phát Triển Tư Duy",
    shortName: "Sata4 — Phát Triển Tư Duy",
    subtitle: "Lộ trình chuyên sâu 48 buổi - cấp độ Cơ bản",
    shortDescription:
      "[Đang cập nhật] Khoá Robotics chuyên sâu cấp Cơ bản, tiếp nối Sata3.",
    description: "[PLACEHOLDER — sẽ cập nhật content qua /admin]",
    ageGroup: "Lớp 1-8",
    level: "Cơ bản",
    lessons: 48,
    duration: "6 tháng",
    priceOriginal: 12_000_000,
    features: [{ icon: "Brain", title: "Phát triển tư duy", desc: "Cấp độ Cơ bản" }],
    highlights: ["[Đang cập nhật content]"],
    badge: "🌿",
    color: "teal",
    displayOrder: 4,
    isPublished: false,
    isFeatured: false,
    parentCourseSlug: "laptrinhrobot",
  },
  // ========== SATA5 - DRAFT ==========
  {
    slug: "sata5",
    code: "Sata5",
    name: "Khám Phá Công Nghệ",
    shortName: "Sata5 — Khám Phá Công Nghệ",
    subtitle: "Lộ trình chuyên sâu 48 buổi - cấp độ Trung cấp",
    shortDescription:
      "[Đang cập nhật] Khoá Robotics chuyên sâu cấp Trung cấp.",
    description: "[PLACEHOLDER]",
    ageGroup: "Lớp 3-8",
    level: "Trung cấp",
    lessons: 48,
    duration: "6 tháng",
    priceOriginal: 13_500_000,
    features: [{ icon: "Compass", title: "Khám phá CN", desc: "Cấp Trung cấp" }],
    highlights: ["[Đang cập nhật content]"],
    badge: "🌳",
    color: "blue",
    displayOrder: 5,
    isPublished: false,
    isFeatured: false,
    parentCourseSlug: "laptrinhrobot",
  },
  // ========== SATA6 - DRAFT ==========
  {
    slug: "sata6",
    code: "Sata6",
    name: "Chinh Phục Đỉnh Cao",
    shortName: "Sata6 — Chinh Phục Đỉnh Cao",
    subtitle: "Lộ trình chuyên sâu 48 buổi - cấp độ Khá",
    shortDescription: "[Đang cập nhật] Khoá Robotics chuyên sâu cấp Khá.",
    description: "[PLACEHOLDER]",
    ageGroup: "Lớp 5-8",
    level: "Khá",
    lessons: 48,
    duration: "6 tháng",
    priceOriginal: 15_000_000,
    features: [{ icon: "Mountain", title: "Đỉnh cao", desc: "Cấp Khá" }],
    highlights: ["[Đang cập nhật content]"],
    badge: "🏔️",
    color: "indigo",
    displayOrder: 6,
    isPublished: false,
    isFeatured: false,
    parentCourseSlug: "laptrinhrobot",
  },
  // ========== SATA7 ==========
  {
    slug: "sata7",
    code: "Sata7",
    name: "Chắp Cánh Tương Lai",
    shortName: "Sata7 — Chắp Cánh Tương Lai",
    subtitle: "AI + Robot tự hành — cấp độ Cao cấp",
    shortDescription:
      "Khoá cao cấp nhất - AI + Robot tự hành. Python, Image Recognition, Gesture Detection.",
    description:
      "Sata7 — Chắp Cánh Tương Lai là khoá cao cấp nhất.\n\n- ZMRobo Intelligence Storm (619 PCS, E6-RCU)\n- 48 buổi AI applications\n- 3 ngôn ngữ: Graphical + Python + C\n- AI: Image Recognition, Gesture Detection\n- Robot tự hành decision-making\n\nPHÙ HỢP: Học viên đã hoàn thành Sata3-6, THCS/THPT yêu thích AI, hướng WRO 2027.",
    ageGroup: "Lớp 6-12",
    level: "Cao cấp",
    lessons: 48,
    duration: "6 tháng",
    priceOriginal: 18_000_000,
    priceEarlyBird: 13_500_000,
    priceMember: 15_300_000,
    features: [
      { icon: "Brain", title: "AI + Robot tự hành", desc: "Image Recognition" },
      { icon: "Code", title: "Python + C", desc: "3 ngôn ngữ" },
      { icon: "Cpu", title: "Intelligence Storm", desc: "619 PCS + E6-RCU" },
      { icon: "Trophy", title: "WRO 2027", desc: "Hướng quốc tế" },
    ],
    highlights: [
      "AI Image Recognition",
      "Python + C programming",
      "Robot tự hành thông minh",
      "Chuẩn bị thi quốc tế WRO",
    ],
    badge: "🚀",
    color: "purple",
    displayOrder: 7,
    isPublished: true,
    isFeatured: true,
    parentCourseSlug: "laptrinhrobot",
    seoTitle: "Sata7 Chắp Cánh Tương Lai | AI + Robot Tự Hành",
    seoDescription:
      "AI + Robot tự hành - Python, C, Image Recognition. ZMRobo Intelligence Storm. 48 buổi.",
  },
  // ========== SATA8 ==========
  {
    slug: "sata8",
    code: "Sata8",
    name: "Vé Vàng Chung Kết",
    shortName: "Sata8 — Vé Vàng Chung Kết",
    subtitle: "Cam kết hoàn 100% nếu không vượt vòng loại",
    shortDescription:
      "Khoá đặc biệt 5 buổi chuyên binh cam kết vào chung kết Khu vực Miền Trung. Không đạt — hoàn 100%.",
    description:
      "Sata8 — Vé Vàng Chung Kết Khu Vực Miền Trung — gói 5 buổi chuyên binh cho học viên có nền tảng Robosim, muốn chắc chắn vượt vòng loại Robotics 2026.\n\n5 BUỔI:\n- Buổi 1 — Giải Mã Sa Bàn: Phân tích đề thi, chiến lược\n- Buổi 2 — Thi Thử Lần 1: Mô phỏng 100% điều kiện thi\n- Buổi 3 — Mổ Xẻ Điểm Yếu: Sửa lỗi, tối ưu thuật toán\n- Buổi 4 — Thi Thử Lần 2 Full Pressure\n- Buổi 5 — Tổng Duyệt & Bản Lĩnh\n\nCAM KẾT HOÀN 100%: Nếu HV hoàn thành đầy đủ cam kết chuyên cần nhưng không vượt vòng loại để thi CK Miền Trung tại Nghệ An tháng 9/2026 → hoàn 100% trong 7 ngày. Không tranh luận.\n\nVòng loại cấp TP ĐN: 26/07/2026\nCK Khu vực Miền Trung: 13/09/2026 tại Nghệ An",
    ageGroup: "Lớp 1-8",
    level: "Chuyên binh thi đấu",
    lessons: 5,
    duration: "2 tuần",
    priceOriginal: 2_500_000,
    features: [
      { icon: "Trophy", title: "Hoàn 100%", desc: "Không đạt - hoàn ngay" },
      { icon: "Target", title: "Chuyên binh", desc: "5 buổi chiến thuật" },
      { icon: "TrendingUp", title: "Thi thử 2 lần", desc: "Full pressure" },
      { icon: "ShieldCheck", title: "Cam kết văn bản", desc: "Đặt cược uy tín" },
    ],
    highlights: [
      "★ Cam kết hoàn 100% nếu không vượt vòng loại",
      "5 buổi chuyên binh chiến thuật",
      "Thi thử Full Pressure 2 lần",
      "Tối đa 12 HV/lớp - GV kèm sát",
    ],
    badge: "★",
    color: "amber",
    displayOrder: 8,
    isPublished: true,
    isFeatured: true,
    parentCourseSlug: "laptrinhrobot",
    seoTitle: "Sata8 Vé Vàng Chung Kết | Cam Kết Hoàn 100%",
    seoDescription:
      "Sata8 — 5 buổi chuyên binh, cam kết vượt vòng loại Robotics 2026. Không đạt - hoàn 100% học phí 2.5M.",
  },
  // ========== COMBO ==========
  {
    slug: "combo-sata1-sata2",
    code: "Combo",
    name: "Combo Sata1 + Sata2",
    shortName: "Combo — Sata1 + Sata2",
    subtitle: "Tiết kiệm 30% khi đăng ký cùng lúc 2 khoá",
    shortDescription:
      "Gói combo Sata1 Robosim Master + Sata2 Đấu Trường Robot - giảm 30%. Chỉ Early Bird đến 31/05/2026.",
    description:
      "COMBO SATA1 + SATA2\n\nGói tiết kiệm cho học viên muốn LUYỆN THI + THỰC CHIẾN cùng lúc.\n\nBao gồm:\n- Sata1 — Robosim Master (16 buổi)\n- Sata2 — Đấu Trường Robot (16 buổi)\n- Tổng: 32 buổi học\n\nGiá:\n- Niêm yết: 5.440.000đ (2.4M + 3.04M)\n- Combo Early Bird (-30%): 3.808.000đ\n- Tiết kiệm: 1.632.000đ\n\nƯu đãi DUY NHẤT đến 31/05/2026.",
    ageGroup: "Lớp 3-8",
    level: "Combo",
    lessons: 32,
    duration: "4 tháng",
    priceOriginal: 5_440_000,
    priceEarlyBird: 3_808_000,
    features: [
      { icon: "Package", title: "Gói 2 khoá", desc: "Sata1 + Sata2" },
      { icon: "Percent", title: "Tiết kiệm 30%", desc: "Tiết kiệm 1.6M" },
      { icon: "Trophy", title: "Robosim + Robot thật", desc: "Phối hợp tối ưu" },
      { icon: "Clock", title: "32 buổi học", desc: "4 tháng chuyên sâu" },
    ],
    highlights: [
      "★ Tiết kiệm 30% (1.6M) so với đăng ký riêng",
      "Robosim + Robot thật phối hợp",
      "32 buổi học chuyên sâu",
      "Phù hợp đội tuyển thi đấu cấp TP",
    ],
    badge: "📦",
    color: "amber",
    displayOrder: 9,
    isPublished: true,
    isFeatured: true,
    parentCourseSlug: "laptrinhrobot",
    seoTitle: "Combo Sata1+Sata2 | Tiết Kiệm 30% Robotics 2026",
    seoDescription:
      "Combo Robosim Master + Đấu Trường Robot. Tiết kiệm 1.6M (-30%). EB đến 31/05.",
  },
];

async function main() {
  console.log("🚀 Seeding CoursePackage records...\n");

  for (const pkg of PACKAGES) {
    const { slug, ...rest } = pkg;
    const result = await db.coursePackage.upsert({
      where: { slug },
      update: rest,
      create: { slug, ...rest },
    });
    console.log(
      `${result.isPublished ? "✅" : "📝"} ${result.code} — ${result.name}`,
    );
  }

  // Cleanup any not in seed list
  const validSlugs = PACKAGES.map((p) => p.slug);
  const deleted = await db.coursePackage.deleteMany({
    where: { slug: { notIn: validSlugs } },
  });
  if (deleted.count > 0) console.log(`\n🗑️ Removed ${deleted.count} old records`);

  const all = await db.coursePackage.findMany({ orderBy: { displayOrder: "asc" } });
  console.log(`\n📊 Total: ${all.length} packages`);
  all.forEach((p) =>
    console.log(
      `  ${p.displayOrder}. ${p.code} - ${p.name} ${p.isPublished ? "(published)" : "(draft)"}`,
    ),
  );
}

main()
  .catch((err) => {
    console.error("❌", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
