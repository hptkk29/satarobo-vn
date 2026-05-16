"use client";

import { Plus } from "lucide-react";
import { FadeIn } from "@/components/motion/fade-in";

// F-UI-3 — 8 FAQ phổ biến từ phụ huynh. Native <details>/<summary>
// (semantic + zero JS). Plus icon rotate 45° qua group-open: utility.
//
// Pricing 750k/2.5M phải khớp với CourseTeaser — sync 2 nơi khi BGĐ chốt giá.
const FAQS = [
  {
    q: "Con tôi 6 tuổi có học được không?",
    a: "Có. Sata Robo có khoá K1 dành cho HS 6-8 tuổi, học qua sa bàn ảo Robosim với giao diện kéo-thả đơn giản. GV hướng dẫn 1:8, đảm bảo con tiếp thu được từng bước.",
  },
  {
    q: "Học online qua Robosim có hiệu quả không?",
    a: "Robosim mô phỏng 100% robot thật. Con học logic lập trình, thuật toán, cảm biến qua sa bàn ảo. Kết thúc khoá K1 con có thể chuyển qua robot thật ở khoá SP2 offline mà không bỡ ngỡ.",
  },
  {
    q: "Phí khoá học bao nhiêu?",
    a: "SP1 Robosim Online: 750,000₫/khoá 12 buổi (~63k/buổi). SP2 Robotics Offline: 2,500,000₫/khoá 12 buổi. SP3 Lab STEM cho trường: liên hệ tư vấn. Tất cả đều có chương trình trả góp 0%.",
  },
  {
    q: "Có hoàn tiền nếu con không thích không?",
    a: "Có. Sau 3 buổi đầu nếu PH không hài lòng, Sata Robo hoàn 100% học phí, không hỏi lý do. Cam kết bằng văn bản trong hợp đồng.",
  },
  {
    q: "Lịch học như thế nào?",
    a: "Khoá online: linh hoạt 24/7, học khi nào con muốn. Khoá offline: 2 buổi/tuần, có ca sáng (T7, CN) và chiều/tối (T2-T6). PH chọn cơ sở gần nhà và ca phù hợp.",
  },
  {
    q: "Con học xong có gì?",
    a: "Mỗi khoá có kiểm tra cuối kỳ và cấp chứng chỉ. Con có cơ hội tham gia WRO Vietnam, Robothon, NQ57 TW Đoàn. Sata Robo đã có 150+ giải thưởng cấp tỉnh/quốc gia.",
  },
  {
    q: "Có chương trình cho trường học không?",
    a: "Có. Gói SP3 Lab STEM dành cho trường tiểu học/THCS bao gồm: thiết bị lab + đào tạo GV + giáo trình + thi đua giữa các trường. Đã triển khai cho 12+ trường tại Đà Nẵng.",
  },
  {
    q: "Tôi liên hệ tư vấn qua đâu?",
    a: "Hotline 0818.823.720 (8h-22h), Zalo OA Sata Robo, Fanpage Facebook, hoặc form đăng ký trên website. Tư vấn miễn phí 100%.",
  },
];

export function FAQ() {
  return (
    <section className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <FadeIn>
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-purple-100 px-4 py-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-purple-700">
                Câu hỏi thường gặp
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl md:text-5xl">
              Giải đáp <span className="text-gradient-tech">băn khoăn</span> của
              PH
            </h2>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="space-y-3">
            {FAQS.map((faq) => (
              <details
                key={faq.q}
                className="group overflow-hidden rounded-2xl border border-gray-200 bg-white transition-colors hover:border-orange-300"
              >
                <summary className="flex list-none cursor-pointer items-center justify-between gap-3 p-4 sm:p-5">
                  <h3 className="pr-4 text-sm font-semibold text-gray-900 sm:text-base">
                    {faq.q}
                  </h3>
                  <span className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 transition-colors group-hover:bg-orange-100">
                    <Plus className="h-4 w-4 text-gray-600 transition-transform group-open:rotate-45" />
                  </span>
                </summary>
                <div className="-mt-1 px-4 pb-4 sm:px-5 sm:pb-5">
                  <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
                    {faq.a}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </FadeIn>

        <FadeIn delay={0.3}>
          <div className="mt-10 text-center">
            <p className="mb-3 text-sm text-gray-600">Vẫn còn thắc mắc?</p>
            <a
              href="tel:0818823720"
              className="inline-flex items-center gap-2 font-semibold text-orange-600 hover:text-orange-700"
            >
              📞 Gọi tư vấn miễn phí: 0818.823.720
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
