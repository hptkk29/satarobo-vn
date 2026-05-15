import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Wrench, Users, Trophy, MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { ProductPageTemplate } from "@/components/client/product-page-template";
import { pageImages } from "@/lib/page-images";

const BASE_URL = "https://satarobo.vn";
const SLUG = "laptrinhrobot";

export const metadata: Metadata = {
  title: "Khoá Lập trình Robot K-9 — Robotics & STEM | Sata Robo",
  description:
    "Khoá học Lập trình Robot toàn diện cho học sinh lớp 1-8. Robot vật lý, lớp 1:8, 4 cơ sở Đà Nẵng. Cam kết hoàn 100% học phí buổi 1-2.",
  alternates: { canonical: `${BASE_URL}/khoa-hoc/${SLUG}` },
};

export const revalidate = 300;

export default async function LapTrinhRobotPage() {
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
      eyebrow="LẬP TRÌNH ROBOT"
      title="Khoá Lập trình Robot toàn diện K-9"
      subtitle="Học robotics với robot vật lý, giáo viên kèm 1:8 — lộ trình bài bản từ lớp 1 đến lớp 8 tại 4 cơ sở Sata Robo Đà Nẵng"
      heroImage={pageImages.laptrinhrobot}
      features={[
        {
          icon: Wrench,
          title: "Lab Robotics đầy đủ",
          desc: "Robot LEGO Education, sensor, controller — Sata Robo cung cấp toàn bộ thiết bị",
        },
        {
          icon: Users,
          title: "Lớp nhỏ 1:8",
          desc: "Mỗi giáo viên kèm tối đa 8 học viên — đảm bảo từng con được hướng dẫn sát",
        },
        {
          icon: Trophy,
          title: "Lộ trình 6 tháng bài bản",
          desc: "Từ nền tảng tới dự án cuối khoá — 12 module rõ ràng, đánh giá năng lực sau mỗi giai đoạn",
        },
        {
          icon: MapPin,
          title: "4 cơ sở Đà Nẵng",
          desc: "Hoà Cường, Hải Châu, Sơn Trà, Ngũ Hành Sơn — chọn cơ sở gần nhà nhất",
        },
      ]}
      curriculum={[
        { step: 1, title: "Tháng 1-2: Làm quen Robotics", desc: "Lắp robot đầu tiên, cảm biến cơ bản, di chuyển có lập trình." },
        { step: 2, title: "Tháng 3: Nền tảng lập trình", desc: "Biến, vòng lặp, điều kiện. Robot tự giải mê cung đơn giản." },
        { step: 3, title: "Tháng 4: Cảm biến nâng cao", desc: "Ánh sáng, khoảng cách, màu sắc — bài toán thực tế." },
        { step: 4, title: "Tháng 5: Dự án nhóm", desc: "Học sinh chia nhóm thiết kế robot giải bài toán mở." },
        { step: 5, title: "Tháng 6: Dự án cuối khoá", desc: "Mỗi học viên có dự án robot riêng — trình bày trước phụ huynh." },
        { step: 6, title: "Chứng chỉ + định hướng", desc: "Cấp chứng nhận + đánh giá năng lực để chọn khoá tiếp theo." },
      ]}
      stats={[
        { value: 1200, suffix: "+", label: "Học viên đã tham gia" },
        { value: 4, label: "Cơ sở Đà Nẵng" },
        { value: 8, label: "Tỉ lệ giáo viên 1:8" },
        { value: 4.9, label: "Đánh giá phụ huynh" },
      ]}
      faqs={[
        {
          q: "Con tôi chưa biết lập trình có học được không?",
          a: "Hoàn toàn được. Module 1-2 dành cho người mới — bắt đầu từ khái niệm cơ bản nhất. Trẻ lớp 1 trở lên có thể theo kịp với chương trình riêng.",
        },
        {
          q: "Có thể học thử 1-2 buổi miễn phí không?",
          a: "Có. Đặt lịch học thử qua form Đăng ký tư vấn — con tham gia lớp thật để cảm nhận chất lượng trước khi đăng ký.",
        },
        {
          q: "Có hoàn học phí nếu con không phù hợp?",
          a: "Có. Hoàn 100% học phí trong 14 ngày đầu (buổi 1-2) nếu con không thấy phù hợp — không cần lý do.",
        },
        {
          q: "Lịch học linh hoạt thế nào?",
          a: "Sáng, chiều, tối, cuối tuần — phù hợp lịch học chính khoá. Học viên có thể đổi buổi miễn báo trước 24h.",
        },
        {
          q: "Sau khi hoàn thành khoá có chứng chỉ không?",
          a: "Có. Sata Robo cấp chứng chỉ hoàn thành module + đánh giá năng lực, hỗ trợ định hướng khoá Luyện thi RoboSim cho học viên muốn thi đấu.",
        },
      ]}
      relatedCourses={related}
      ctaTitle="Đặt lịch học thử miễn phí"
      ctaSubtitle="Cho con tham gia 1-2 buổi thật để cảm nhận chất lượng trước khi đăng ký"
      ctaPrimaryLabel="Đặt lịch học thử"
    />
  );
}
