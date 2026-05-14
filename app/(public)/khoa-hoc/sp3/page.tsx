import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Building, BookOpen, GraduationCap, BarChart3 } from "lucide-react";
import { db } from "@/lib/db";
import { ProductPageTemplate } from "@/components/client/product-page-template";
import { pageImages } from "@/lib/page-images";

const BASE_URL = "https://satarobo.vn";

export const metadata: Metadata = {
  title: "SP3 Sata Inno School — Lab STEM cho trường K-12 | Sata Robo",
  description:
    "Giải pháp Lab STEM & Robotics tổng thể cho trường K-12: phòng lab, chương trình, đào tạo giáo viên, KPI dashboard.",
  alternates: { canonical: `${BASE_URL}/khoa-hoc/sp3` },
};

export const revalidate = 300;

export default async function SP3Page() {
  const course = await db.course.findUnique({ where: { slug: "sp3" } }).catch(() => null);
  if (!course) notFound();

  const related = await db.course
    .findMany({
      where: { isPublished: true, slug: { not: "sp3" } },
      orderBy: { displayOrder: "asc" },
      take: 3,
    })
    .catch(() => []);

  return (
    <ProductPageTemplate
      slug="sp3"
      eyebrow="SP3 — SATA INNO SCHOOL (B2B)"
      title="Giải pháp Lab STEM cho trường K-12"
      subtitle="Hợp tác chiến lược 8 trường tại Đà Nẵng. Cung cấp phòng lab, chương trình tích hợp, đào tạo giáo viên, KPI dashboard cho ban giám hiệu."
      heroImage={pageImages.sp3}
      features={[
        {
          icon: Building,
          title: "Lab STEM tiêu chuẩn quốc tế",
          desc: "Trang bị robot LEGO Education, sensor, controller, bàn thi đầy đủ",
        },
        {
          icon: BookOpen,
          title: "Chương trình tích hợp",
          desc: "Giáo trình kết nối với môn Toán-Lý-Tin học chính khoá",
        },
        {
          icon: GraduationCap,
          title: "Đào tạo giáo viên",
          desc: "Tập huấn 40 giờ + coaching tháng cho giáo viên nhà trường",
        },
        {
          icon: BarChart3,
          title: "KPI Dashboard quản lý",
          desc: "Báo cáo trực quan cho ban giám hiệu: tiến độ, engagement, kết quả",
        },
      ]}
      curriculum={[
        { step: 1, title: "Tháng 1-2: Khảo sát + Setup lab", desc: "Đánh giá hiện trạng, thiết kế lab, trang bị thiết bị, lắp đặt." },
        { step: 2, title: "Tháng 3-4: Đào tạo giáo viên", desc: "Workshop 40 giờ + tài liệu giáo án + coaching." },
        { step: 3, title: "Tháng 5-12: Triển khai chương trình", desc: "Giáo viên dạy theo giáo trình, Sata Robo hỗ trợ định kỳ + KPI dashboard." },
        { step: 4, title: "Đánh giá năm + nâng cấp", desc: "Tổng kết KPI, thi đấu cuối năm, plan năm tiếp theo." },
      ]}
      stats={[
        { value: 8, label: "Trường đối tác" },
        { value: 4000, suffix: "+", label: "Học sinh tiếp cận" },
        { value: 40, label: "Giờ đào tạo GV" },
        { value: 12, label: "Tháng triển khai" },
      ]}
      faqs={[
        {
          q: "Trường tôi chưa có phòng lab — có triển khai được không?",
          a: "Có. Sata Robo bao trọn gói thiết kế + setup phòng lab từ đầu. Trường chỉ cần cung cấp không gian phù hợp (~40m²).",
        },
        {
          q: "Giáo viên trường tôi không có kiến thức Robotics — có vấn đề không?",
          a: "Không. Đào tạo 40 giờ chuyên sâu + coaching hàng tháng. Sau 2 tháng giáo viên hoàn toàn có thể đứng lớp.",
        },
        {
          q: "Chi phí khoảng bao nhiêu?",
          a: "Tuỳ quy mô — từ 200-800 triệu/năm cho trường 200-2000 học sinh. Đặt lịch khảo sát miễn phí để có báo giá chính xác.",
        },
        {
          q: "Có cam kết kết quả không?",
          a: "Cam kết: 90% học sinh hoàn thành chương trình + ít nhất 5% đạt vòng tỉnh RoboSim. Hoàn 50% chi phí nếu không đạt.",
        },
      ]}
      relatedCourses={related}
      ctaTitle="Đặt lịch khảo sát miễn phí"
      ctaSubtitle="Sata Robo sẽ đến trường, đánh giá hiện trạng và đưa proposal chi tiết"
      ctaPrimaryLabel="Đặt lịch khảo sát"
    />
  );
}
