import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

type JobSeed = {
  slug: string;
  title: string;
  department: string;
  location: string;
  type: string;
  workingHours: string;
  experienceLevel: "ENTRY" | "JUNIOR" | "MID" | "SENIOR" | "EXPERT";
  description: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  contactEmail: string;
  contactPhone: string;
  openings: number;
  status: "OPEN";
};

const JOBS: JobSeed[] = [
  {
    slug: "giao-vien-robotics",
    title: "Giáo Viên Robotics",
    department: "dao-tao",
    location: "danang",
    type: "fulltime",
    workingHours: "Full-time / Part-time",
    experienceLevel: "ENTRY",
    description:
      "Giảng dạy các khoá Robotics cho học sinh lớp 1–8 theo giáo trình Sata Robo. Hướng dẫn thực hành robot, lập trình Robosim, hỗ trợ chuẩn bị thi đấu.",
    responsibilities: [
      "Giảng dạy các khoá Robotics cho học sinh lớp 1–8 theo giáo trình Sata Robo",
      "Hướng dẫn thực hành robot, lập trình Robosim",
      "Hỗ trợ học viên chuẩn bị thi đấu, cuộc thi Robotics",
    ],
    requirements: [
      "Tốt nghiệp Đại học ngành Kỹ thuật / CNTT / Giáo dục / Toán",
      "Đam mê dạy học, có kinh nghiệm với trẻ em là lợi thế",
      "Nhiệt tình, kiên nhẫn, có tinh thần trách nhiệm",
    ],
    benefits: [
      "Lương theo cơ chế 3P (Position-Person-Performance) tại Sata Robo",
      "Thưởng hiệu suất theo KPI",
      "Được đào tạo nghiệp vụ chuyên sâu tại Sata Robo",
    ],
    contactEmail: "tuyendung@satarobo.vn",
    contactPhone: "0818823720",
    openings: 2,
    status: "OPEN",
  },
  {
    slug: "tu-van-tuyen-sinh",
    title: "Tư Vấn Tuyển Sinh (Sales Education)",
    department: "marketing-sale",
    location: "danang",
    type: "fulltime",
    workingHours: "Full-time",
    experienceLevel: "ENTRY",
    description:
      "Tư vấn và giới thiệu các chương trình học Robotics đến phụ huynh và học sinh. Chăm sóc khách hàng, theo dõi tiến trình học của học viên.",
    responsibilities: [
      "Tư vấn và giới thiệu các chương trình học Robotics đến phụ huynh và học sinh",
      "Chăm sóc khách hàng đã đăng ký, duy trì mối quan hệ với phụ huynh",
      "Theo dõi tiến trình học của học viên, hỗ trợ thông tin lớp học",
    ],
    requirements: [
      "Kỹ năng giao tiếp tốt, có tư duy tư vấn",
      "Yêu trẻ em và môi trường giáo dục",
      "Ưu tiên ứng viên có kinh nghiệm sales hoặc tư vấn giáo dục",
    ],
    benefits: [
      "Lương cơ bản + hoa hồng tư vấn tuyển sinh hấp dẫn theo chính sách SR.QD.200",
      "Môi trường giáo dục trẻ trung, năng động",
      "Cơ hội thăng tiến rõ ràng",
    ],
    contactEmail: "tuyendung@satarobo.vn",
    contactPhone: "0818823720",
    openings: 2,
    status: "OPEN",
  },
  {
    slug: "tro-ly-giao-hoc-vu",
    title: "Trợ Lý Giáo Học Vụ (Admin Education)",
    department: "van-hanh",
    location: "danang",
    type: "fulltime",
    workingHours: "Full-time",
    experienceLevel: "ENTRY",
    description:
      "Hỗ trợ quản lý hồ sơ học viên, lịch học, thiết bị robot. Phối hợp tổ chức các sự kiện, cuộc thi Robotics của Sata Robo.",
    responsibilities: [
      "Hỗ trợ quản lý hồ sơ học viên, lịch học, lịch giáo viên",
      "Quản lý thiết bị robot, kiểm kê học cụ",
      "Phối hợp tổ chức các sự kiện, cuộc thi Robotics của Sata Robo",
    ],
    requirements: [
      "Tốt nghiệp THPT trở lên",
      "Cẩn thận, có tổ chức, chú ý chi tiết",
      "Thành thạo Excel/Google Sheets",
      "Yêu trẻ và môi trường giáo dục",
    ],
    benefits: [
      "Lương theo ngạch bậc tại Sata Robo",
      "Môi trường trẻ trung, năng động",
      "Cơ hội thăng tiến rõ ràng",
    ],
    contactEmail: "tuyendung@satarobo.vn",
    contactPhone: "0818823720",
    openings: 2,
    status: "OPEN",
  },
];

async function main() {
  let created = 0;
  let updated = 0;

  for (const job of JOBS) {
    const existing = await db.jobPosting.findUnique({ where: { slug: job.slug } });
    if (existing) {
      await db.jobPosting.update({
        where: { slug: job.slug },
        data: job,
      });
      updated++;
      console.log(`✓ Updated: ${job.title}`);
    } else {
      await db.jobPosting.create({ data: job });
      created++;
      console.log(`✓ Created: ${job.title}`);
    }
  }

  console.log(`\n✅ Created: ${created}, Updated: ${updated}`);
}

main()
  .catch((err) => {
    console.error("[seed-job-postings] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
