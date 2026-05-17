"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, PlayCircle, Sparkles } from "lucide-react";
import { TextGenerateEffect } from "@/components/aceternity/text-generate-effect";
import { ShimmerButton } from "@/components/magic/shimmer-button";
import { NumberTicker } from "@/components/magic/number-ticker";

// Hero — tone SÁNG (redesigned). Gradient cream/orange-50 base + 2
// pastel halos (cam + tím) + grid mảnh xám nhạt. Nội dung giữ nguyên:
// badge → eyebrow → H1 → subtitle → CTAs → stats strip → social-proof.
const HERO_STATS = [
  { value: 1000, suffix: "+", label: "Học viên" },
  { value: 2, suffix: " cơ sở", label: "Đà Nẵng + Online" },
  { value: 100, suffix: "%", label: "Cam kết hoàn tiền" },
];

export function HeroMain() {
  return (
    <section className="relative w-full overflow-hidden bg-gradient-to-b from-orange-50 via-amber-50/50 to-white pb-20 pt-24 sm:pb-24 sm:pt-28 md:pb-28 md:pt-32">
      {/* Pastel halos — orange (trái) + purple (phải) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-0 h-[500px] w-[500px] rounded-full bg-orange-300/40 blur-3xl md:-top-20 md:left-32"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-10 right-0 h-[500px] w-[500px] rounded-full bg-purple-300/40 blur-3xl md:right-32 md:top-20"
      />

      {/* Conic accent — soft spectrum cho depth */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background:conic-gradient(from_180deg_at_50%_50%,rgba(249,115,22,0.08)_0deg,rgba(124,58,237,0.08)_120deg,rgba(244,114,182,0.06)_240deg,rgba(249,115,22,0.08)_360deg)] opacity-70"
      />

      {/* Light grid pattern với radial mask */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,rgba(124,58,237,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(124,58,237,0.06)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]"
      />

      <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        {/* Live campaign badge */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-300 bg-orange-100 px-3 py-1.5 shadow-sm shadow-orange-500/20 sm:px-4"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-600" />
          </span>
          <span className="text-xs font-semibold text-orange-800 sm:text-sm">
            🎉 20 suất Robotics MIỄN PHÍ — Tháng 5/2026
          </span>
        </motion.div>

        {/* Secondary eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white/80 px-3 py-1 backdrop-blur"
        >
          <Sparkles className="h-3.5 w-3.5 text-purple-600" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-700 sm:text-xs">
            Học Viện Robotics &amp; AI Đà Nẵng
          </span>
        </motion.div>

        {/* H1 với gradient highlights */}
        <h1 className="text-3xl font-extrabold leading-[1.1] tracking-tight text-neutral-900 drop-shadow-sm sm:text-5xl md:text-6xl lg:text-7xl">
          Lập trình Robot <span className="text-gradient-warm">cùng con</span>
          <br className="hidden sm:block" /> từ{" "}
          <span className="text-gradient-tech">tuổi tiểu học</span>
        </h1>

        {/* Subtitle */}
        <div className="mx-auto mt-5 max-w-2xl">
          <TextGenerateEffect
            words="2 cơ sở Đà Nẵng + Robosim độc quyền cho Cuộc thi 2026. Lớp ≤12 HV, cam kết hoàn 100%."
            className="text-base font-normal leading-relaxed text-neutral-700 sm:text-lg"
          />
        </div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4"
        >
          <Link href="/lien-he?free-trial=true" className="w-full sm:w-auto">
            <ShimmerButton
              background="linear-gradient(135deg, #F97316 0%, #EAB308 100%)"
              className="w-full px-6 py-3 text-sm font-semibold shadow-xl shadow-orange-500/30 sm:w-auto sm:px-8 sm:py-3.5 sm:text-base"
            >
              <span className="flex items-center gap-2 text-white">
                Liên hệ Đăng ký học
                <ArrowRight className="h-4 w-4" />
              </span>
            </ShimmerButton>
          </Link>

          <Link
            href="/khoa-hoc"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-neutral-300 bg-white/90 px-6 py-3 text-sm font-medium text-neutral-800 backdrop-blur transition-all hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 sm:w-auto sm:py-3 sm:text-base"
          >
            <PlayCircle className="h-5 w-5" />
            Xem các khoá học
          </Link>
        </motion.div>

        {/* Stats strip — white card với shadow */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.9 }}
          className="mx-auto mt-10 grid max-w-2xl grid-cols-3 gap-3 rounded-2xl border border-neutral-200 bg-white/90 p-4 shadow-lg shadow-orange-500/5 backdrop-blur sm:gap-6 sm:p-5"
        >
          {HERO_STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-xl font-extrabold text-neutral-900 sm:text-3xl">
                <NumberTicker value={s.value} className="text-neutral-900" />
                <span className="text-gradient-warm">{s.suffix}</span>
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-neutral-500 sm:text-xs">
                {s.label}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Mini social-proof row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.1 }}
          className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-neutral-600"
        >
          <div className="flex items-center gap-1.5">
            <div className="flex -space-x-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-5 w-5 rounded-full bg-gradient-to-br from-orange-400 to-purple-500 ring-2 ring-white"
                />
              ))}
            </div>
            <span>PH tin tưởng</span>
          </div>
          <span className="hidden text-neutral-300 sm:inline">·</span>
          <span className="flex items-center gap-1 text-yellow-500">
            ★★★★★ <span className="text-neutral-700">4.9 / 5</span>
          </span>
        </motion.div>
      </div>
    </section>
  );
}
