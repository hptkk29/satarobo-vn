"use client";

import { FadeIn } from "@/components/motion/fade-in";
import { HoverEffect } from "@/components/aceternity/card-hover-effect";

// F-UI-2.5 — 6 lý do chọn Sata Robo. Mỗi card render qua HoverEffect
// (shared-layout gradient halo trượt giữa các cell khi hover).
const USP_ITEMS = [
  {
    icon: "🤖",
    title: "Học qua Robosim",
    description:
      "Sa bàn ảo điều khiển robot không cần bộ kit. Tiết kiệm 50 triệu so với bộ kit truyền thống.",
    link: "/khoa-hoc/luyenthirobosim",
  },
  {
    icon: "👨‍🏫",
    title: "GV chuyên môn cao",
    description:
      "100% giáo viên đại học CNTT, kinh nghiệm dạy 3+ năm. Tỉ lệ 1:8 - 1:12.",
    link: "/ve-chung-toi",
  },
  {
    icon: "🏆",
    title: "Đấu trường Robot",
    description:
      "Tham gia cuộc thi cấp trường, cấp tỉnh, quốc gia. WRO, NQ57 TW Đoàn lần 6.",
    link: "/dau-truong-robot",
  },
  {
    icon: "📚",
    title: "Lộ trình rõ ràng",
    description:
      "K1 → K2 → K3 → Senior. Mỗi cấp 24 buổi, kiểm tra cuối kỳ, cấp chứng chỉ.",
    link: "/lo-trinh",
  },
  {
    icon: "🏫",
    title: "7 cơ sở Đà Nẵng",
    description:
      "Mạng lưới cơ sở khắp Đà Nẵng. Học online toàn quốc qua Zoom + Robosim cho HS xa.",
    link: "/cac-co-so",
  },
  {
    icon: "💰",
    title: "Giá hợp lý",
    description:
      "Chỉ từ 30k/buổi online. Trả góp 0%. Hoàn 100% nếu không hài lòng sau 3 buổi.",
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
