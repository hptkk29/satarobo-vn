import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Compass, Backpack, Camera, Sparkles as SparklesIcon } from "lucide-react";
import { db } from "@/lib/db";
import { ProductPageTemplate } from "@/components/client/product-page-template";
import { pageImages } from "@/lib/page-images";

const BASE_URL = "https://satarobo.vn";

export const metadata: Metadata = {
  title: "SP4 SATAGO — Tour ngoại khoá Robotics + STEM | Sata Robo",
  description:
    "Tour ngoại khoá Robotics + STEM 1-3 ngày cho học sinh. Tham quan, thực hành, lắp ráp robot. Có thể kết hợp với SP3.",
  alternates: { canonical: `${BASE_URL}/khoa-hoc/sp4` },
};

export const revalidate = 300;

export default async function SP4Page() {
  const course = await db.course.findUnique({ where: { slug: "sp4" } }).catch(() => null);
  if (!course) notFound();

  const related = await db.course
    .findMany({
      where: { isPublished: true, slug: { not: "sp4" } },
      orderBy: { displayOrder: "asc" },
      take: 3,
    })
    .catch(() => []);

  return (
    <ProductPageTemplate
      slug="sp4"
      eyebrow="SP4 — SATAGO TRẢI NGHIỆM"
      title="Tour ngoại khoá Robotics + STEM"
      subtitle="105 tiết trải nghiệm chuẩn — học sinh khám phá Đà Nẵng + thực hành Robotics + lắp ráp robot mini mang về"
      heroImage={pageImages.sp4}
      features={[
        {
          icon: Compass,
          title: "105 tiết trải nghiệm chuẩn",
          desc: "Chương trình thiết kế theo chuẩn ngoại khoá Bộ GD — đảm bảo chất lượng giáo dục",
        },
        {
          icon: Backpack,
          title: "Kết nối với SP3",
          desc: "Trường đối tác SP3 được ưu đãi tour SATAGO — tiếp tục hành trình từ lab tới thực địa",
        },
        {
          icon: Camera,
          title: "Hoạt động đa dạng",
          desc: "Tham quan nhà máy + bảo tàng KH + làng nghề + workshop lắp robot",
        },
        {
          icon: SparklesIcon,
          title: "Hỗ trợ đầy đủ",
          desc: "Xe đưa đón, bảo hiểm, ăn uống, hướng dẫn viên giáo dục — phụ huynh yên tâm",
        },
      ]}
      curriculum={[
        { step: 1, title: "Buổi sáng — Khám phá thực địa", desc: "Tham quan nhà máy, bảo tàng KH, hoặc làng nghề truyền thống." },
        { step: 2, title: "Buổi trưa — Ăn nghỉ + giao lưu", desc: "Bữa trưa cộng đồng, học sinh giao lưu, chia sẻ trải nghiệm sáng." },
        { step: 3, title: "Buổi chiều — Workshop Robotics", desc: "Lắp ráp + lập trình robot mini, mỗi học sinh có robot mang về." },
        { step: 4, title: "Cuối tour — Tổng kết + chứng nhận", desc: "Thi đấu robot mini cuối tour, cấp chứng nhận tham gia chương trình." },
      ]}
      stats={[
        { value: 105, label: "Tiết trải nghiệm" },
        { value: 1500, suffix: "+", label: "Học sinh đã tham gia" },
        { value: 8, label: "Tour mỗi năm" },
        { value: 30, label: "Học sinh / tour" },
      ]}
      faqs={[
        {
          q: "Tour cho cá nhân hay phải đăng ký theo trường?",
          a: "Cả 2. Đăng ký cá nhân (theo lịch tour mở) hoặc tour riêng cho trường/nhóm phụ huynh ≥ 20 học sinh.",
        },
        {
          q: "Có hỗ trợ học sinh ở tỉnh khác đến Đà Nẵng tham gia không?",
          a: "Có. Sata Robo gợi ý homestay/khách sạn + đưa đón từ sân bay/ga tàu cho tour 3 ngày.",
        },
        {
          q: "Chi phí khoảng bao nhiêu?",
          a: "Tour 1 ngày: ~1.5tr/học sinh. Tour 3 ngày: ~5tr/học sinh (bao bữa ăn + di chuyển trong Đà Nẵng).",
        },
        {
          q: "Có chứng nhận giáo dục không?",
          a: "Có. Sata Robo cấp chứng nhận ngoại khoá Robotics & STEM — có thể dùng làm hồ sơ học bạ hoặc xin học bổng.",
        },
      ]}
      relatedCourses={related}
      ctaTitle="Đăng ký tour SATAGO"
      ctaSubtitle="Xem lịch tour gần nhất hoặc đặt tour riêng cho nhóm/trường"
      ctaPrimaryLabel="Xem lịch tour"
    />
  );
}
