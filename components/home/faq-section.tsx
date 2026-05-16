"use client";

import { HelpCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import {
  SectionEyebrow,
  SectionHeading,
  SectionLead,
} from "@/components/design-system/sections/section-primitives";

interface FAQItem {
  q: string;
  a: string;
}

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
    a: "Hiện 4 cơ sở đang hoạt động: 258 Lê Thanh Nghị (Trụ sở chính - Hòa Cường), 60 Lê Lợi (Hải Châu), 269 Điện Biên Phủ (Thanh Khê), 232 Nguyễn Phước Lan (Cẩm Lệ). 2 cơ sở mới sắp khai trương tháng 8/2026: 114 Hoàng Diệu và 211 Nguyễn Hữu Thọ.",
  },
  {
    q: "Con học xong có thi đấu được không?",
    a: "Có. Sata Robo là đơn vị duy nhất tại Đà Nẵng đào tạo Robosim — phần mềm bắt buộc trong Cuộc thi Sáng tạo Robotics Toàn Quốc 2026. Vòng loại cấp TP Đà Nẵng dự kiến kết thúc 26/07/2026. Chung kết khu vực Miền Trung 13/09/2026 tại Nghệ An. Học viên thi đạt giải còn được thưởng chuyến du lịch 3-7 triệu kết hợp lễ khai trương 2 chi nhánh mới.",
  },
  {
    q: "Có học thử miễn phí trước khi đăng ký không?",
    a: "Có. Sata Robo tặng 5 buổi luyện thi cơ bản miễn phí + 1 buổi test năng lực 45 phút + 1 buổi học thử 90 phút — hoàn toàn 0 đồng, không điều kiện. Đăng ký qua form trên website hoặc gọi hotline 0818.823.720.",
  },
];

export function FAQSection() {
  return (
    <section className="bg-neutral-50 py-16 md:py-24">
      <div className="container mx-auto px-4 max-w-4xl">
        <SectionEyebrow icon={HelpCircle} label="CÂU HỎI THƯỜNG GẶP" tone="purple" />
        <SectionHeading>Phụ huynh thường hỏi</SectionHeading>
        <SectionLead>
          6 câu hỏi phổ biến nhất từ phụ huynh khi tìm hiểu về Sata Robo
        </SectionLead>

        <div className="mt-10">
          <RevealOnScroll direction="up" distance={20}>
            <Accordion className="rounded-2xl border border-neutral-200 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden divide-y divide-neutral-100">
{/* @base-ui/react accordion defaults to single-open; no `type`/`collapsible` props needed */}
              {FAQS.map((faq, i) => (
                <AccordionItem key={i} className="border-0 px-5 sm:px-6">
                  <AccordionTrigger className="text-left text-base sm:text-lg font-bold text-neutral-900 hover:text-orange-600 py-5 hover:no-underline">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-neutral-700 leading-relaxed pb-5">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}
