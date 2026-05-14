import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Monitor, Trophy, Clock, Users } from "lucide-react";
import { db } from "@/lib/db";
import { ProductPageTemplate } from "@/components/client/product-page-template";
import { pageImages } from "@/lib/page-images";

const BASE_URL = "https://satarobo.vn";

export const metadata: Metadata = {
  title: "SP1 RoboSim Master — Học Robotics online | Sata Robo",
  description:
    "Khoá video online học robotics trên trình duyệt. Platform mô phỏng cuộc thi RoboSim đầu tiên Việt Nam — 4,000+ học viên đã luyện thi.",
  alternates: { canonical: `${BASE_URL}/khoa-hoc/sp1` },
};

export const revalidate = 300;

export default async function SP1Page() {
  const course = await db.course.findUnique({ where: { slug: "sp1" } }).catch(() => null);
  if (!course) notFound();

  const related = await db.course
    .findMany({
      where: { isPublished: true, slug: { not: "sp1" } },
      orderBy: { displayOrder: "asc" },
      take: 3,
    })
    .catch(() => []);

  return (
    <ProductPageTemplate
      slug="sp1"
      eyebrow="SP1 — ROBOSIM MASTER"
      title="Học Robotics trên trình duyệt"
      subtitle="Platform mô phỏng cuộc thi RoboSim đầu tiên tại Việt Nam — 4,000+ học viên đã luyện thi và đạt giải"
      heroImage={pageImages.sp1}
      features={[
        {
          icon: Monitor,
          title: "Mô phỏng cuộc thi chân thật",
          desc: "3 sa bàn thi chính thức, vật lý chuẩn, có thể chạy trên trình duyệt",
        },
        {
          icon: Clock,
          title: "Học mọi lúc mọi nơi",
          desc: "Video bài giảng có sẵn, không cần lên lịch, học theo nhịp riêng",
        },
        {
          icon: Trophy,
          title: "Lộ trình 6 tháng bài bản",
          desc: "Từ cơ bản đến luyện thi giải Quốc gia — chia 12 module rõ ràng",
        },
        {
          icon: Users,
          title: "Hỗ trợ 1-1 với mentor",
          desc: "Hỏi đáp qua group + 4 buổi live coaching cá nhân/tháng",
        },
      ]}
      curriculum={[
        { step: 1, title: "Tháng 1-2: Nền tảng lập trình", desc: "Biến, vòng lặp, điều kiện. Thực hành trên RoboSim Lite." },
        { step: 2, title: "Tháng 3: Điều khiển robot", desc: "Di chuyển chính xác, sử dụng cảm biến cơ bản." },
        { step: 3, title: "Tháng 4: Xử lý cảm biến", desc: "Ánh sáng, khoảng cách, màu sắc — bài toán thực tế." },
        { step: 4, title: "Tháng 5: Giải đề thi năm trước", desc: "Phân tích đề + giải mẫu + tự thi thử." },
        { step: 5, title: "Tháng 6: Luyện thi sprint", desc: "Mô phỏng điều kiện thi thật, giải đề trong thời gian giới hạn." },
        { step: 6, title: "Coaching 1-1 cá nhân", desc: "4 buổi/tháng với mentor — giải đáp khó khăn riêng của học viên." },
      ]}
      stats={[
        { value: 2400, suffix: "+", label: "Học viên đã đăng ký" },
        { value: 24, label: "Giải RoboSim 2026" },
        { value: 87, suffix: "%", label: "Pass vòng sơ loại" },
        { value: 12, label: "Modules bài bản" },
      ]}
      faqs={[
        {
          q: "Con tôi chưa biết lập trình có học được không?",
          a: "Hoàn toàn được. Module 1-2 dành cho người mới — bắt đầu từ khái niệm cơ bản nhất. Trẻ lớp 3 trở lên có thể theo kịp.",
        },
        {
          q: "Cần laptop chuyên dụng không?",
          a: "Không. Platform chạy trên trình duyệt Chrome/Edge bất kỳ. Cần internet ổn định (≥ 5 Mbps).",
        },
        {
          q: "Có hoàn tiền nếu con không phù hợp?",
          a: "Có. Hoàn 100% trong 14 ngày đầu nếu con không thấy phù hợp — không cần lý do.",
        },
        {
          q: "Sau khi học xong có chứng chỉ không?",
          a: "Có. Sata Robo cấp chứng chỉ hoàn thành module + chứng nhận cho học viên đạt giải RoboSim.",
        },
        {
          q: "Khác gì so với học offline (SP2)?",
          a: "SP1 phù hợp gia đình tự lập, linh hoạt giờ học, tiết kiệm chi phí. SP2 phù hợp gia đình muốn lớp bài bản, giáo viên 1:1, robot vật lý.",
        },
      ]}
      relatedCourses={related}
      ctaTitle="Sẵn sàng luyện thi RoboSim?"
      ctaSubtitle="Học thử miễn phí 1 module đầu tiên — không cần thẻ tín dụng"
      ctaPrimaryLabel="Học thử miễn phí"
    />
  );
}
