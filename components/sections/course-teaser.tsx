"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FadeIn } from "@/components/motion/fade-in";
import { BackgroundGradient } from "@/components/aceternity/background-gradient";

// F-UI-2.5 — 3 sản phẩm chính SP1/SP2/SP3. Giá ở đây là placeholder
// (TODO: pull từ Course model khi sản phẩm SP1/SP3 vào DB).
const COURSES = [
  {
    code: "SP1",
    name: "Robosim Online",
    desc: "Khoá học online cho HS 6-12 tuổi qua sa bàn ảo Robosim. Không cần mua kit. Học 24/7.",
    price: "750,000",
    priceUnit: "/khoá 12 buổi",
    badge: "Phổ biến nhất",
    badgeColor: "bg-orange-500",
    priceColor: "text-gradient-warm",
    href: "/khoa-hoc/luyenthirobosim",
  },
  {
    code: "SP2",
    name: "Robotics Offline",
    desc: "Học trực tiếp tại 7 cơ sở Đà Nẵng. Robot ZMROBO thật, lớp 1:8, kèm GV cá nhân.",
    price: "2,500,000",
    priceUnit: "/khoá 12 buổi",
    badge: "Tại trung tâm",
    badgeColor: "bg-purple-500",
    priceColor: "text-gradient-tech",
    href: "/khoa-hoc/laptrinhrobot",
  },
  {
    code: "SP3",
    name: "Lab STEM Trường học",
    desc: "Giải pháp Lab STEM + đào tạo GV cho trường. NQ57, TW Đoàn lần 6.",
    price: "Liên hệ",
    priceUnit: "B2B Trường học",
    badge: "B2B",
    badgeColor: "bg-blue-500",
    priceColor: "text-gray-900",
    href: "/lien-he",
  },
];

export function CourseTeaser() {
  return (
    <section className="bg-gray-50 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl md:text-5xl">
              Chọn lộ trình phù hợp{" "}
              <span className="text-gradient-tech">cho con</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-gray-600 sm:text-lg">
              3 sản phẩm chính — từ học online linh hoạt đến giải pháp toàn diện
              cho trường.
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {COURSES.map((c, i) => (
            <FadeIn key={c.code} delay={i * 0.15}>
              <BackgroundGradient className="flex h-full flex-col rounded-3xl bg-white p-6 sm:p-7">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <span className="font-mono text-xs text-gray-400">
                      {c.code}
                    </span>
                    <h3 className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">
                      {c.name}
                    </h3>
                  </div>
                  <span
                    className={`${c.badgeColor} whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold text-white`}
                  >
                    {c.badge}
                  </span>
                </div>

                <p className="flex-grow text-sm leading-relaxed text-gray-600">
                  {c.desc}
                </p>

                <div className="mt-6 border-t border-gray-200 pt-4">
                  <div className="mb-3 flex items-baseline gap-1">
                    <span
                      className={`text-2xl font-bold sm:text-3xl ${c.priceColor}`}
                    >
                      {c.price === "Liên hệ" ? c.price : `${c.price}₫`}
                    </span>
                    {c.price !== "Liên hệ" && (
                      <span className="text-sm text-gray-500">
                        {c.priceUnit}
                      </span>
                    )}
                  </div>

                  <Link
                    href={c.href}
                    className="group inline-flex items-center gap-2 text-sm font-semibold text-orange-600 hover:text-orange-700"
                  >
                    Tìm hiểu chi tiết
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </BackgroundGradient>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
