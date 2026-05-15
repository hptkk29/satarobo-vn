import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Monitor, Trophy, Clock, Users } from "lucide-react";
import { db } from "@/lib/db";
import { ProductPageTemplate } from "@/components/client/product-page-template";
import { pageImages } from "@/lib/page-images";

const BASE_URL = "https://satarobo.vn";
const SLUG = "luyenthirobosim";

export const metadata: Metadata = {
  title: "Luyện thi RoboSim — Pass vòng loại Sáng tạo Robotics | Sata Robo",
  description:
    "Khoá Luyện thi RoboSim chuyên sâu — pass vòng loại cuộc thi Sáng tạo Robotics. Học online + offline, bảng R1 (Tiểu học) & R2 (THCS). 4,000+ học viên đã tham gia.",
  alternates: { canonical: `${BASE_URL}/khoa-hoc/${SLUG}` },
};

export const revalidate = 300;

export default async function LuyenThiRobosimPage() {
  const course = await db.course.findUnique({ where: { slug: SLUG } }).catch(() => null);
  if (!course) notFound();

  const related = await db.course
    .findMany({
      where: { isPublished: true, slug: { not: SLUG } },
      orderBy: { displayOrder: "asc" },
      take: 3,
    })
    .catch(() => []);

  return (
    <ProductPageTemplate
      slug={SLUG}
      eyebrow="LUYỆN THI ROBOSIM"
      title="Pass vòng loại Sáng tạo Robotics"
      subtitle="Khoá luyện thi chuyên sâu trên platform RoboSim — bảng R1 (Tiểu học) & R2 (THCS). Học online tự lập + coaching 1-1 với mentor"
      heroImage={pageImages.luyenthirobosim}
      features={[
        {
          icon: Monitor,
          title: "Platform RoboSim chân thật",
          desc: "3 sa bàn thi chính thức, vật lý chuẩn — mô phỏng cuộc thi đầu tiên tại Việt Nam",
        },
        {
          icon: Clock,
          title: "Học mọi lúc mọi nơi",
          desc: "18 buổi video bài giảng có sẵn, không cần lên lịch, học theo nhịp riêng của con",
        },
        {
          icon: Trophy,
          title: "Lộ trình luyện thi rõ ràng",
          desc: "Từ nền tảng tới giải đề thi năm trước — chia module theo từng bảng R1/R2",
        },
        {
          icon: Users,
          title: "Coaching 1-1 với mentor",
          desc: "Hỏi đáp qua group + buổi coaching cá nhân giải đáp khó khăn riêng của học viên",
        },
      ]}
      curriculum={[
        { step: 1, title: "Module 1: Nền tảng lập trình", desc: "Biến, vòng lặp, điều kiện. Thực hành trên RoboSim Lite." },
        { step: 2, title: "Module 2: Điều khiển robot", desc: "Di chuyển chính xác, sử dụng cảm biến cơ bản." },
        { step: 3, title: "Module 3: Xử lý cảm biến", desc: "Ánh sáng, khoảng cách, màu sắc — bài toán thực tế." },
        { step: 4, title: "Module 4: Giải đề năm trước", desc: "Phân tích đề + giải mẫu + tự thi thử." },
        { step: 5, title: "Module 5: Luyện thi sprint", desc: "Mô phỏng điều kiện thi thật, giải đề trong thời gian giới hạn." },
        { step: 6, title: "Coaching 1-1 cá nhân", desc: "Buổi coaching với mentor — giải đáp khó khăn riêng của học viên." },
      ]}
      stats={[
        { value: 800, suffix: "+", label: "Học viên luyện thi" },
        { value: 24, label: "Giải RoboSim 2026" },
        { value: 87, suffix: "%", label: "Pass vòng sơ loại" },
        { value: 18, label: "Buổi video bài giảng" },
      ]}
      faqs={[
        {
          q: "Con tôi chưa biết lập trình có học khoá luyện thi được không?",
          a: "Khuyến nghị con học khoá Lập trình Robot trước để có nền tảng. Khoá Luyện thi RoboSim phù hợp với học viên đã biết cơ bản, muốn nâng cao để thi đấu.",
        },
        {
          q: "Cần laptop chuyên dụng không?",
          a: "Không. Platform RoboSim chạy trên trình duyệt Chrome/Edge bất kỳ. Cần internet ổn định (≥ 5 Mbps).",
        },
        {
          q: "Có hoàn tiền nếu con không phù hợp?",
          a: "Có. Hoàn 100% trong 14 ngày đầu nếu con không thấy phù hợp — không cần lý do.",
        },
        {
          q: "Sau khi học xong có chứng chỉ không?",
          a: "Có. Sata Robo cấp chứng chỉ hoàn thành + chứng nhận đặc biệt cho học viên đạt giải RoboSim các cấp.",
        },
        {
          q: "Bảng R1 và R2 khác nhau thế nào?",
          a: "R1 dành cho học sinh Tiểu học (lớp 1-5), độ khó vừa phải. R2 dành cho học sinh THCS (lớp 6-9), bài toán phức tạp hơn, đòi hỏi tư duy thuật toán cao.",
        },
      ]}
      relatedCourses={related}
      ctaTitle="Sẵn sàng luyện thi RoboSim?"
      ctaSubtitle="Học thử miễn phí 1 module đầu tiên — không cần thẻ tín dụng"
      ctaPrimaryLabel="Học thử miễn phí"
    />
  );
}
