"use client";

import { useState } from "react";
import { HelpCircle, Plus, Minus, MessageCircle } from "lucide-react";
import { SATA_ROBO_CONTACT } from "@/lib/locations";

interface FAQItem {
  q: string;
  a: string;
}

// ─── NỘI DUNG FAQ — sửa nội dung tại đây ─────────────────────────────
// Mỗi item: { q: "Câu hỏi?", a: "Câu trả lời..." }
// Thêm/xoá item tuỳ ý — order quyết định thứ tự hiển thị.
const FAQS: FAQItem[] = [
  {
    q: "Khoá học Sata Robo phù hợp với con từ độ tuổi nào?",
    a: "Sata Robo có lộ trình đầy đủ cho học sinh từ lớp 1 đến lớp 8 (6-14 tuổi). Mỗi khoá học được thiết kế phù hợp với năng lực tư duy và độ tinh xảo của từng độ tuổi — từ Sata3 (Ươm Mầm Tài Năng, lớp 1-2) đến Sata7 (Chắp Cánh Tương Lai, AI cho lớp 6-8).",
  },
  {
    q: "Học phí các khoá học bao nhiêu?",
    a: "Học phí từ 2.400.000đ (khoá luyện thi Sata1 — Robosim Master) đến 18.000.000đ (khoá cao cấp 48 buổi Sata7 — AI + Robot tự hành). Trong tháng 5/2026 có ưu đãi Early Bird khai trương giảm đến 30%. Combo Sata1 + Sata2 chỉ 3.808.000đ (tiết kiệm 1.6 triệu). Trả góp 0% qua VPBank / Sacombank / Home Credit cho khoá 48 buổi.",
  },
  {
    q: "Sata Robo có cam kết hoàn tiền không?",
    a: "Có 2 cam kết bằng văn bản: (1) Hoàn 100% trong 2 buổi đầu nếu con không thích — không câu hỏi. (2) Với khoá Sata8 — Vé Vàng Chung Kết, cam kết hoàn 100% học phí trong 7 ngày làm việc nếu học viên hoàn thành đầy đủ cam kết chuyên cần nhưng không vượt vòng loại để thi chung kết Khu vực Miền Trung tại Nghệ An tháng 9/2026.",
  },
  {
    q: "Sata Robo có bao nhiêu cơ sở tại Đà Nẵng?",
    a: "Hiện có 2 cơ sở tại Đà Nẵng: 211 Nguyễn Hữu Thọ (Trụ sở chính) và 114 Hoàng Diệu (Hải Châu). Phụ huynh chọn cơ sở thuận tiện nhất; ngoài giờ học offline, học sinh có thể học online qua Robosim toàn quốc.",
  },
  {
    q: "Con học xong có thi đấu được không?",
    a: "Có, duy nhất học chi tiết chương trình đào tạo robosim có kết hơp hệ thống bài test theo gamificaton và Ai đánh giá kết quả học tập và trao chứng nhận tự động từ Sata Robo. Chương trình biên tập theo sát thể lệ cuộc thi sáng tạo Robotics 2026 do TW đoàn phát động",
  },
  {
    q: "Có học trải nghiệm miễn phí trước khi đăng ký không?",
    a: "Có. Sata Robo tặng 5 buổi luyện thi cơ bản robosim miễn phí trước thời điểm tháng 5/2026. Hướng đến cuộc thi sáng tạo robotics 2026. Sau thời điểm này là 1 buổi test năng lực 45 phút + 1 buổi học trải nghiệm 90 phút — hoàn toàn 0 đồng, không điều kiện.",
  },
];

export function FAQSection() {
  // First FAQ open by default (đồng nhất với design laptrinhrobot)
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const toggle = (i: number) => setOpenIdx(openIdx === i ? null : i);

  return (
    <section
      id="faq"
      className="bg-gradient-to-b from-orange-50 via-amber-50/40 to-white py-16 md:py-24"
    >
      <div className="container mx-auto max-w-3xl px-4">
        {/* Header */}
        <div className="mb-10 text-center sm:mb-14">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-orange-100 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-orange-700">
            <HelpCircle className="h-4 w-4" />
            CÂU HỎI THƯỜNG GẶP
          </div>
          <h2 className="mb-4 text-3xl font-black text-neutral-900 md:text-4xl">
            Bố mẹ thường hỏi mình{" "}
            <span className="bg-gradient-to-r from-orange-500 to-purple-600 bg-clip-text text-transparent">
              những câu này
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-base text-neutral-600 sm:text-lg">
            Những câu hỏi phụ huynh thường hỏi nhất trước khi quyết định cho
            con học.
          </p>
        </div>

        {/* Accordion */}
        <div className="space-y-3">
          {FAQS.map((faq, i) => {
            const isOpen = openIdx === i;
            return (
              <div
                key={faq.q}
                className={`overflow-hidden rounded-2xl border bg-white transition-all ${
                  isOpen
                    ? "border-orange-300 shadow-lg ring-2 ring-orange-500/30"
                    : "border-neutral-200 shadow-sm"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-orange-50/50 sm:p-5"
                >
                  <span className="flex flex-1 items-start gap-2 text-sm font-bold text-neutral-900 sm:text-base">
                    <span className="flex-shrink-0 text-orange-500">?</span>
                    <span>{faq.q}</span>
                  </span>
                  <span
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition sm:h-8 sm:w-8 ${
                      isOpen
                        ? "rotate-180 bg-orange-500 text-white"
                        : "bg-amber-100 text-orange-600"
                    }`}
                  >
                    {isOpen ? (
                      <Minus className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </span>
                </button>

                <div
                  className={`grid transition-all duration-300 ease-in-out ${
                    isOpen
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
                      <div className="rounded-2xl border border-orange-500/15 bg-orange-50/55 px-4 py-4 text-sm leading-7 text-neutral-700 sm:px-5 sm:text-base sm:leading-8">
                        {faq.a}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Zalo CTA card */}
        <div className="mx-auto mt-10 max-w-2xl rounded-2xl border-2 border-purple-200 bg-white p-6 text-center shadow-md sm:p-7">
          <p className="mb-4 text-sm text-neutral-700 sm:text-base">
            Còn câu hỏi khác? <strong>Inbox Zalo</strong> — Sata Robo sẽ phản
            hồi trong{" "}
            <strong className="text-orange-600">ít phút</strong>.
          </p>
          <a
            href={SATA_ROBO_CONTACT.zalo}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:scale-105 hover:bg-purple-700 sm:text-base"
          >
            <MessageCircle className="h-5 w-5" />
            Chat Zalo Ngay →
          </a>
        </div>
      </div>
    </section>
  );
}
