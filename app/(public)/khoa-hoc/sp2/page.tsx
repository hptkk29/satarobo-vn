import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin, Users, Wrench, Calendar } from "lucide-react";
import { db } from "@/lib/db";
import { ProductPageTemplate } from "@/components/client/product-page-template";
import { pageImages } from "@/lib/page-images";

const BASE_URL = "https://satarobo.vn";

export const metadata: Metadata = {
  title: "SP2 Offline Class — Lớp Robotics tại Đà Nẵng | Sata Robo",
  description:
    "Lớp học robotics offline tại 4 cơ sở Đà Nẵng. Robot vật lý, giảng viên 1:1, sĩ số ≤ 8 học viên/lớp.",
  alternates: { canonical: `${BASE_URL}/khoa-hoc/sp2` },
};

export const revalidate = 300;

export default async function SP2Page() {
  const course = await db.course.findUnique({ where: { slug: "sp2" } }).catch(() => null);
  if (!course) notFound();

  const related = await db.course
    .findMany({
      where: { isPublished: true, slug: { not: "sp2" } },
      orderBy: { displayOrder: "asc" },
      take: 3,
    })
    .catch(() => []);

  return (
    <ProductPageTemplate
      slug="sp2"
      eyebrow="SP2 — OFFLINE CLASS"
      title="Lớp Robotics Offline tại Đà Nẵng"
      subtitle="Học với robot vật lý, giáo viên kèm sát từng học viên, lớp nhỏ ≤ 8 con — tại 4 cơ sở Sata Robo"
      heroImage={pageImages.sp2}
      features={[
        {
          icon: MapPin,
          title: "4 cơ sở thuận tiện",
          desc: "Hoà Cường, Hải Châu, Sơn Trà, Ngũ Hành Sơn — chọn cơ sở gần nhà nhất",
        },
        {
          icon: Wrench,
          title: "Lab Robotics đầy đủ",
          desc: "Robot LEGO Education, sensor, controller — tất cả Sata Robo cung cấp",
        },
        {
          icon: Users,
          title: "Lớp 8-10 học viên",
          desc: "Đảm bảo giáo viên có thời gian kèm sát từng con",
        },
        {
          icon: Calendar,
          title: "Lịch linh hoạt",
          desc: "Sáng, chiều, tối, cuối tuần — phù hợp lịch học chính khoá của con",
        },
      ]}
      curriculum={[
        { step: 1, title: "Tháng 1: Làm quen Robotics", desc: "Lắp robot đầu tiên, cảm biến cơ bản, di chuyển có lập trình." },
        { step: 2, title: "Tháng 2: Lập trình nâng cao", desc: "Vòng lặp, điều kiện, biến số. Robot tự giải mê cung đơn giản." },
        { step: 3, title: "Tháng 3: Dự án cuối khoá", desc: "Mỗi học viên có dự án robot riêng — trình bày trước phụ huynh." },
        { step: 4, title: "Chứng chỉ hoàn thành", desc: "Cấp chứng nhận + đánh giá năng lực để chọn khoá tiếp theo." },
      ]}
      stats={[
        { value: 800, suffix: "+", label: "Học viên đã tham gia" },
        { value: 4, label: "Cơ sở Đà Nẵng" },
        { value: 8, label: "Tỉ lệ giáo viên" },
        { value: 4.9, label: "Đánh giá phụ huynh" },
      ]}
      faqs={[
        {
          q: "Có thể học thử 1 buổi miễn phí không?",
          a: "Có. Đặt lịch học thử 1-2 buổi miễn phí qua form Đăng ký tư vấn — con tham gia lớp thật để cảm nhận.",
        },
        {
          q: "Trẻ lớp 1 có theo được không?",
          a: "Có chương trình riêng cho lớp 1-3 (Robotics for Kids) với robot đơn giản hơn — vẫn đầy đủ kỹ năng tư duy.",
        },
        {
          q: "Có hoàn học phí nếu nghỉ giữa khoá?",
          a: "Hoàn 100% nếu nghỉ trong 14 ngày đầu. Sau đó hoàn theo tỷ lệ buổi học chưa sử dụng.",
        },
        {
          q: "Có nhóm phụ huynh trao đổi không?",
          a: "Có Zalo group + email báo cáo tháng + buổi gặp gỡ phụ huynh mỗi quý.",
        },
      ]}
      relatedCourses={related}
      ctaTitle="Đặt lịch học thử miễn phí"
      ctaSubtitle="Cho con tham gia 1-2 buổi thật để cảm nhận chất lượng trước khi đăng ký"
      ctaPrimaryLabel="Đặt lịch học thử"
    />
  );
}
