/**
 * Seed 6 Recruitment records (Phase 4.UI.RESET.2 PART D5).
 * Uses new Recruitment model (separate from JobPosting).
 *
 * Run: pnpm dotenv -e .env.local -- pnpm tsx scripts/seed-recruitment.ts
 */
import { db } from "@/lib/db";

interface JobSeed {
  slug: string;
  title: string;
  department: string;
  location: string;
  workingHours?: string;
  salaryRange: string;
  jobType: string;
  experienceLevel: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  isFeatured: boolean;
  displayOrder: number;
}

const CONTACT_EMAIL = "tuyendung@satarobo.vn";
const CONTACT_PHONE = "0818.823.720";

const POSITIONS: JobSeed[] = [
  {
    slug: "chuyen-vien-tu-van-tuyen-sinh-cskh",
    title: "Chuyên Viên Tư Vấn Tuyển Sinh & Chăm Sóc Khách Hàng",
    department: "Phòng Kinh doanh",
    location: "258 Lê Thanh Nghị, Hòa Cường, Đà Nẵng",
    workingHours: "T2 - T7: 8:00 - 20:00",
    salaryRange: "Lương cứng + hoa hồng theo SR.QD.200",
    jobType: "Full-time",
    experienceLevel: "Junior - Senior",
    summary:
      "Cầu nối trực tiếp giữa Sata Robo và phụ huynh — học sinh, đảm nhận toàn bộ hành trình khách hàng từ tư vấn đến chốt đăng ký và duy trì mối quan hệ lâu dài.",
    responsibilities: [
      "Tư vấn tuyển sinh trực tiếp tại văn phòng, qua điện thoại, Zalo và mạng xã hội",
      "Phân tích nhu cầu từng học sinh để đề xuất chương trình phù hợp",
      "Trình bày lộ trình học, nội dung chương trình, học phí và chính sách ưu đãi",
      "Mời phụ huynh cho con tham gia học thử miễn phí (trial class)",
      "Follow-up có hệ thống: chu kỳ 24h - 3 ngày - 1 tuần",
      "Xử lý phản đối phổ biến: học phí, lịch học, so sánh đối thủ",
      "Chăm sóc khách hàng trong suốt quá trình học",
      "Tái đăng ký, upsell & referral - chủ động trước khi khoá kết thúc",
      "Quản lý hồ sơ học viên trên CRM / Google Sheet",
      "Lập báo cáo tuyển sinh hàng tuần",
    ],
    requirements: [
      "Tốt nghiệp Cao đẳng/Đại học các ngành: Quản trị, Marketing, Sư phạm, Tâm lý",
      "Kỹ năng giao tiếp tốt, có tư duy tư vấn",
      "Yêu trẻ em và giáo dục",
      "Ưu tiên có kinh nghiệm sales/tư vấn giáo dục 1+ năm",
      "Thành thạo Excel, Zalo, Facebook Messenger",
    ],
    benefits: [
      "Lương cứng cạnh tranh theo bậc/mức SR.QD.200",
      "Hoa hồng tư vấn tuyển sinh hấp dẫn (% trên doanh thu)",
      "Thưởng KPI tháng + tháng 13 + thâm niên",
      "BHXH/BHYT/BHTN đầy đủ theo Luật",
      "Đào tạo nghiệp vụ chuyên sâu",
      "Lộ trình thăng tiến: Tư vấn viên → Trưởng nhóm → Trưởng phòng KD",
    ],
    isFeatured: true,
    displayOrder: 1,
  },
  {
    slug: "giang-vien-dao-tao-cong-nghe",
    title: "Giảng Viên Đào Tạo Công Nghệ (Robotics/AI/STEM)",
    department: "Phòng Đào tạo",
    location: "269 Điện Biên Phủ, Thanh Khê, Đà Nẵng",
    workingHours: "T2 - T7: Linh hoạt theo lịch đào tạo",
    salaryRange: "Đơn giá buổi dạy + lương cơ bản (SR.QD.210)",
    jobType: "Full-time / Part-time",
    experienceLevel: "Trainee - Expert",
    summary:
      "Trực tiếp xây dựng, triển khai và chuẩn hoá chương trình đào tạo Robotics, lập trình và công nghệ STEM cho học sinh K12 trên nền tảng Online/Offline.",
    responsibilities: [
      "Xây dựng & chuẩn hoá chương trình từ các hãng Robotics (ZMRobo, etc.)",
      "Thiết kế giáo án, tài liệu phù hợp từng độ tuổi K12",
      "Phát triển chương trình cho lớp Online và Offline",
      "Trực tiếp giảng dạy Robotics, Scratch, Python, Arduino, Robosim",
      "Đánh giá tiến độ học tập, cá nhân hoá phương pháp",
      "Đào tạo, kèm cặp giáo viên mới trong đội ngũ",
      "Phát triển E-learning đào tạo giảng viên nội bộ",
      "Hỗ trợ CLB Robotics tại các trường đối tác",
      "Hỗ trợ học sinh tham gia cuộc thi cấp trường, tỉnh, toàn quốc",
      "Ứng dụng AI vào hoạt động giảng dạy",
    ],
    requirements: [
      "Tốt nghiệp ĐH các ngành: CNTT, Kỹ thuật, Sư phạm Tin, Toán-Tin, Robotics",
      "Đam mê công nghệ và giáo dục K12",
      "Thành thạo ít nhất 1: Python, Arduino, Scratch, lập trình robot",
      "Ưu tiên có kinh nghiệm giảng dạy trẻ em / có chứng chỉ Robotics",
      "Khả năng truyền đạt tốt, kiên nhẫn",
      "Sẵn sàng học hỏi và nghiên cứu công nghệ mới",
    ],
    benefits: [
      "Đơn giá buổi dạy theo ngạch (Trainee → Junior → Advanced → Senior → Expert)",
      "Lương cơ bản fulltime/parttime theo SR.QD.210",
      "Thưởng KPI dạy + đánh giá học viên",
      "Đào tạo chuyên sâu về hệ thống Sata Robo (Robosim, ZMRobo Alpha/Beta/Storm)",
      "Cơ hội phát triển: Giảng viên → Trưởng nhóm đào tạo → Giám đốc đào tạo",
      "Môi trường năng động, được tiếp xúc công nghệ mới",
    ],
    isFeatured: true,
    displayOrder: 2,
  },
  {
    slug: "ke-toan-tong-hop",
    title: "Kế Toán Tổng Hợp (kiêm Hành Chính Nhân Sự)",
    department: "Phòng Kế toán - HCNS",
    location: "258 Lê Thanh Nghị, Hòa Cường, Đà Nẵng",
    workingHours: "T2 - T7: 8:00 - 17:00",
    salaryRange: "Theo SR.QD.200 - thoả thuận",
    jobType: "Full-time",
    experienceLevel: "Junior - Senior",
    summary:
      "Đảm bảo toàn bộ nghĩa vụ tài chính - kế toán - thuế của Sata Robo đúng quy định pháp luật. Tỷ lệ: Kế toán tổng hợp ~65% / Hành chính NS ~35%.",
    responsibilities: [
      "Kế toán tổng hợp ~40%: Hạch toán toàn bộ nghiệp vụ, lập P&L, Balance Sheet, Cash Flow",
      "Kê khai thuế ~25%: GTGT/TNCN/TNDN, hoá đơn điện tử, quyết toán năm",
      "Quản lý thu-chi & kiểm soát nội bộ ~20%: Đối chiếu sao kê, công nợ, MISA",
      "Hành chính NS ~15%: Hồ sơ nhân sự, BHXH/BHYT/BHTN, tính lương",
      "Lập báo cáo tài chính phục vụ Giám đốc ra quyết định",
      "Phối hợp với kế toán dịch vụ / kiểm toán năm",
      "Cập nhật chính sách thuế, thông tư mới của Bộ Tài chính",
    ],
    requirements: [
      "Tốt nghiệp ĐH chuyên ngành Kế toán / Tài chính / Kiểm toán",
      "Tối thiểu 2 năm kinh nghiệm kế toán tổng hợp",
      "Thành thạo MISA hoặc phần mềm kế toán tương đương",
      "Excel thành thạo (VLOOKUP, PivotTable, SUMIFS)",
      "Nắm vững Luật Kế toán, Thuế GTGT, TNCN, TNDN",
      "Ưu tiên có chứng chỉ Kế toán trưởng",
      "Cẩn thận, trung thực, có tinh thần trách nhiệm",
    ],
    benefits: [
      "Lương theo bậc/mức SR.QD.200 (Bậc 4-6 tuỳ kinh nghiệm)",
      "Thưởng quyết toán năm + tháng 13 + thâm niên",
      "BHXH/BHYT/BHTN đầy đủ trên lương Gross",
      "Được hỗ trợ đào tạo chứng chỉ chuyên môn",
      "Môi trường startup giáo dục - AI First, có chỗ phát triển",
    ],
    isFeatured: false,
    displayOrder: 3,
  },
  {
    slug: "chuyen-vien-marketing-truyen-thong",
    title: "Chuyên Viên Marketing Truyền Thông",
    department: "Phòng Marketing",
    location: "258 Lê Thanh Nghị, Hòa Cường, Đà Nẵng",
    workingHours: "T2 - T7: 8:00 - 17:00",
    salaryRange: "Lương + thưởng KPI lead/CPL",
    jobType: "Full-time",
    experienceLevel: "Junior - Senior",
    summary:
      "Chịu trách nhiệm toàn diện về hiệu quả Paid Ads (Facebook/TikTok/Google) - trọng tâm tạo lead chất lượng cao với CPL tối ưu.",
    responsibilities: [
      "Lập kế hoạch media hàng tháng, phân bổ ngân sách theo kênh",
      "Setup, launch & quản lý chiến dịch Facebook/TikTok/Google Ads",
      "Viết copy quảng cáo hướng đến phụ huynh K12",
      "Phối hợp sản xuất creative (image, video, banner)",
      "Theo dõi & phân tích CPM, CPC, CTR, CPL hàng ngày",
      "A/B Testing creative + copy liên tục (2-3 phiên bản/chiến dịch)",
      "Xây dựng retargeting + remarketing",
      "Quản lý Fanpage, TikTok, YouTube của Sata Robo",
      "Lên content calendar tháng (3 nhóm: edu, brand, conversion)",
      "Phân tích & báo cáo Marketing hàng tuần/tháng",
    ],
    requirements: [
      "Tốt nghiệp ĐH Marketing / Truyền thông / Quản trị kinh doanh",
      "Tối thiểu 1-2 năm kinh nghiệm Facebook Ads/TikTok Ads",
      "Thành thạo Meta Business, TikTok Ads, Google Ads Manager",
      "Khả năng viết copy ngắn gọn, hook mạnh",
      "Phân tích data tốt (Excel/Google Sheets, GA4)",
      "Ưu tiên có kinh nghiệm ngành giáo dục/STEM",
      "Sáng tạo, chủ động, học hỏi nhanh",
    ],
    benefits: [
      "Lương theo SR.QD.200 + thưởng KPI (CPL, leads, conversion)",
      "Thưởng dự án + thưởng tháng 13",
      "BHXH/BHYT/BHTN đầy đủ",
      "Budget chạy ads + công cụ AI tạo content",
      "Đào tạo Meta Blueprint, TikTok Academy",
      "Cơ hội thăng tiến: Specialist → Lead → Trưởng phòng Marketing",
    ],
    isFeatured: true,
    displayOrder: 4,
  },
  {
    slug: "nhan-vien-telesales",
    title: "Nhân Viên Telesales",
    department: "Phòng Kinh doanh",
    location: "258 Lê Thanh Nghị, Hòa Cường, Đà Nẵng",
    workingHours: "T2 - T7: 8:00 - 17:00",
    salaryRange: "Lương cứng + hoa hồng theo doanh số",
    jobType: "Full-time",
    experienceLevel: "Junior",
    summary:
      "Khai thác và chuyển đổi data khách hàng tiềm năng (phụ huynh học sinh) thành đơn hàng thực tế qua điện thoại / Zalo / chat.",
    responsibilities: [
      "Tiếp nhận data nóng từ Marketing (FB Ads, TikTok Ads, form)",
      "Xác minh & phân loại khách hàng: tiềm năng cao / cần nurture / chưa phù hợp",
      "Ưu tiên xử lý data nóng trong vòng 30 phút",
      "Gọi điện tư vấn theo kịch bản chuẩn",
      "Giải đáp thắc mắc: học phí, lịch học, giảng viên",
      "Thuyết phục phụ huynh đăng ký trong 24 giờ",
      "Xử lý phản đối: 'đắt quá', 'để suy nghĩ thêm'",
      "Follow-up 24h - 48h - 72h",
      "Tái khai thác khách cũ để upsell",
      "Báo cáo kết quả hàng ngày",
    ],
    requirements: [
      "Tốt nghiệp Cao đẳng/Đại học các ngành liên quan",
      "Kỹ năng giao tiếp tốt, giọng nói rõ, dễ nghe",
      "Có kinh nghiệm telesales / sales 6 tháng+ là lợi thế",
      "Kiên trì, không ngại bị từ chối",
      "Yêu trẻ em, có hiểu biết về giáo dục",
      "Sử dụng được Zalo, Excel, CRM cơ bản",
    ],
    benefits: [
      "Lương cứng + hoa hồng % theo doanh thu",
      "Thưởng KPI tháng đạt/vượt mục tiêu",
      "Thưởng tháng 13 + thâm niên",
      "BHXH/BHYT/BHTN đầy đủ",
      "Đào tạo kịch bản telesales chuyên nghiệp",
      "Thăng tiến: Telesales → Sr.Telesales → Trưởng nhóm",
    ],
    isFeatured: false,
    displayOrder: 5,
  },
  {
    slug: "thuc-tap-sinh-marketing",
    title: "Thực Tập Sinh Marketing (Content AI)",
    department: "Phòng Marketing",
    location: "258 Lê Thanh Nghị, Hòa Cường, Đà Nẵng",
    workingHours: "Linh hoạt: 4-6h/ngày, ít nhất 3 ngày/tuần",
    salaryRange: "Trợ cấp 2-3 triệu/tháng + thưởng project",
    jobType: "Internship",
    experienceLevel: "Sinh viên năm 3-4 hoặc mới ra trường",
    summary:
      "Hỗ trợ triển khai marketing đa kênh (Facebook, TikTok, YouTube), ứng dụng AI vào sản xuất nội dung, thiết kế hình ảnh và làm video.",
    responsibilities: [
      "Vận hành kênh Facebook, TikTok, YouTube",
      "Đăng bài, lên lịch nội dung, theo dõi tương tác",
      "Sử dụng AI (Claude, ChatGPT, Gemini) viết content/caption/script",
      "Thiết kế ảnh bằng Canva / AI tools",
      "Dựng video ngắn bằng CapCut, Premiere, AI video tools",
      "Hỗ trợ campaign theo kế hoạch phòng",
      "Tham gia tổ chức sự kiện, livestream",
      "Theo dõi & báo cáo chỉ số tương tác hàng tuần",
    ],
    requirements: [
      "Sinh viên năm 3-4 hoặc mới ra trường",
      "Chuyên ngành: CNTT, Sư phạm Tin, Marketing, Truyền thông",
      "Sáng tạo, học hỏi nhanh, thích công nghệ",
      "Đã có dùng AI tools (ChatGPT, Claude, Midjourney, Canva AI)",
      "Biết dùng Canva / CapCut / Photoshop cơ bản",
      "Có thể commit 4-6h/ngày, 3+ ngày/tuần trong 3-6 tháng",
    ],
    benefits: [
      "Trợ cấp 2.000.000 - 3.000.000 VNĐ/tháng",
      "Thưởng dự án xuất sắc",
      "Cấp tài khoản AI tools (Claude, Canva Pro)",
      "Đào tạo thực tế từ Trưởng phòng Marketing",
      "Cơ hội ký HĐLĐ chính thức sau thực tập",
      "Chứng chỉ thực tập + bằng khen có thành tích tốt",
    ],
    isFeatured: false,
    displayOrder: 6,
  },
];

async function main() {
  console.log("🚀 Seeding 6 Recruitment records (Phase 4.UI.RESET.2 PART D5)...\n");

  for (const pos of POSITIONS) {
    const data = {
      title: pos.title,
      department: pos.department,
      location: pos.location,
      workingHours: pos.workingHours,
      salaryRange: pos.salaryRange,
      jobType: pos.jobType,
      experienceLevel: pos.experienceLevel,
      summary: pos.summary,
      responsibilities: pos.responsibilities,
      requirements: pos.requirements,
      benefits: pos.benefits,
      contactEmail: CONTACT_EMAIL,
      contactPhone: CONTACT_PHONE,
      isFeatured: pos.isFeatured,
      displayOrder: pos.displayOrder,
      isPublished: true,
    };

    const result = await db.recruitment.upsert({
      where: { slug: pos.slug },
      update: data,
      create: { slug: pos.slug, ...data },
    });
    console.log(`✅ ${result.slug} — ${result.title}`);
  }

  const total = await db.recruitment.count({ where: { isPublished: true } });
  console.log(`\n📊 Total published Recruitment: ${total}`);
}

main()
  .catch((err) => {
    console.error("❌", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
