"use client";

import { FadeIn } from "@/components/motion/fade-in";
import { HoverEffect } from "@/components/aceternity/card-hover-effect";

// F-UI-2.5 — 6 lý do chọn Sata Robo. Mỗi card render qua HoverEffect
// (shared-layout gradient halo trượt giữa các cell khi hover).
const USP_ITEMS = [
  {
    icon: "🤖",
    title: "Hoàn tiền 100% nếu không hài lòng",
    description:
      "Buổi học đầu tiên 90 phút, nếu con không thích sẽ hoàn tiền 100% học phí đã đóng, không câu hỏi. Hoàn lại sau 3 ngày làm việc.",
    link: "/khoa-hoc/luyenthirobosim",
  },
  {
    icon: "👨‍🏫",
    title: "Lớp nhỏ ≤12 Học viên",
    description:
      "GV tận tâm, học kèm để các con tiến bộ mỗi ngày.",
    link: "/ve-chung-toi",
  },
  {
    icon: "🏆",
    title: "Giải thưởng du lịch 3-7 triệu",
    description:
      "Dành cho HV đạt giải cuộc thi cấp TP Đà Nẵng.",
    link: "/dau-truong-robot",
  },
  {
    icon: "📚",
    title: "Thuyết trình cuối mỗi học phần",
    description:
      "Phụ huynh được xem kết quả thực tế, ghi hình kỷ niệm.",
    link: "/lo-trinh",
  },
  {
    icon: "🏫",
    title: "Hỗ trợ 3 triệu lệ phí thi Quốc gia",
    description:
      "Cho HV tham dự cuộc thi Quốc gia theo đoàn Sata Robo.",
    link: "/cac-co-so",
  },
  {
    icon: "💰",
    title: "Cam kết văn bản cho gói Sata8",
    description:
      "Quyền lợi hoàn tiền của phụ huynh được ghi rõ bằng văn bản trước khi đăng ký gói Sata8.",
    link: "/khoa-hoc",
  },
];

export function UspGrid() {
  return (
    <section className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-orange-100 px-4 py-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-orange-700">
                Vì sao chọn Sata Robo
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl md:text-5xl">
              6 lý do PH tin tưởng{" "}
              <span className="text-gradient-warm">Sata Robo</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-gray-600 sm:text-lg">
              Hệ thống giáo dục Robotics hàng đầu Đà Nẵng, kết hợp công nghệ
              Robosim độc quyền.
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.2}>
          <HoverEffect items={USP_ITEMS} />
        </FadeIn>
      </div>
    </section>
  );
}
