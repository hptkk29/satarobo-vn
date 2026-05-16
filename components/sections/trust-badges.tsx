"use client";

import { FadeIn } from "@/components/motion/fade-in";

// F-UI-2.5 — Social proof row ngay sau Hero. Achievements (DB snapshot,
// TODO: query thực tế sau) + partner names (text fallback, swap <Image>
// khi có logo SVG/PNG transparent).
const ACHIEVEMENTS = [
  { value: "10,000+", label: "Học viên đã đào tạo" },
  { value: "7", label: "Cơ sở Đà Nẵng + Online" },
  { value: "98%", label: "PH tiếp tục khoá tiếp theo" },
  { value: "150+", label: "Giải thưởng cuộc thi" },
];

const PARTNERS = [
  "ZMROBO Vietnam",
  "TW Đoàn TNCSHCM",
  "Sở GD&ĐT Đà Nẵng",
  "WRO Vietnam",
  "Robothon Quốc tế",
  "STEM Việt Nam",
];

export function TrustBadges() {
  return (
    <section className="border-y border-gray-100 bg-white px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <p className="mb-8 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 sm:text-sm">
            Tin tưởng bởi 10,000+ phụ huynh & học sinh
          </p>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="mb-10 grid grid-cols-2 gap-6 sm:gap-8 md:grid-cols-4 sm:mb-12">
            {ACHIEVEMENTS.map((a) => (
              <div key={a.label} className="text-center">
                <div className="text-2xl font-bold text-gradient-warm sm:text-3xl md:text-4xl">
                  {a.value}
                </div>
                <div className="mt-1 text-xs text-gray-600 sm:text-sm">
                  {a.label}
                </div>
              </div>
            ))}
          </div>
        </FadeIn>

        <FadeIn delay={0.2}>
          <div className="grid grid-cols-2 items-center gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-6">
            {PARTNERS.map((p) => (
              <div
                key={p}
                className="flex h-12 items-center justify-center px-2 sm:h-14"
                title={p}
              >
                <div className="text-center text-xs font-bold leading-tight text-gray-400 transition-colors hover:text-gray-700 sm:text-sm">
                  {p}
                </div>
                {/* TODO: thay text bằng <Image src={p.logo} alt={p.name}
                    width={120} height={48}
                    className="max-h-full object-contain grayscale hover:grayscale-0" />
                    khi có logo file (SVG ưu tiên, transparent PNG fallback). */}
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
