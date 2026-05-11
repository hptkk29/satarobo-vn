'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const FAQS = [
  {
    q: 'Con tôi 6 tuổi nên học SP1 hay SP2?',
    a: 'Với trẻ 6 tuổi (lớp 1), SP2 — Lập trình Robot Offline là lựa chọn tốt hơn. Học offline có giáo viên trực tiếp hướng dẫn, phù hợp với trẻ nhỏ cần môi trường học tương tác. SP1 RoboSim Master phù hợp từ lớp 3 trở lên, khi trẻ đã có thể tự học theo video hướng dẫn.',
  },
  {
    q: 'Khoá nào nên bắt đầu trước nếu con mới làm quen Robotics?',
    a: 'Nếu con học offline được, hãy bắt đầu với SP2 — lộ trình 5 năm bài bản sẽ xây nền tảng vững nhất. Nếu gia đình cần linh hoạt về thời gian hoặc muốn thử trước, SP1 RoboSim Master gói R1 là điểm khởi đầu tốt — chỉ 18 buổi, có thể hoàn thành trong 2–3 tháng.',
  },
  {
    q: 'Con có cần mua học cụ riêng không?',
    a: 'SP1 (Online): Không cần — học trên sa bàn ảo. SP2 (Offline): Có bộ học cụ riêng, trung tâm sẽ tư vấn cụ thể theo cấp độ học viên. SP3 & SP4: Lab và thiết bị được trang bị sẵn tại địa điểm. Sata Robo cũng có bộ học cụ bán lẻ tại trang /hoc-cu nếu phụ huynh muốn con thực hành tại nhà.',
  },
  {
    q: 'Bao lâu thì con biết tự lập trình được?',
    a: 'Phụ thuộc vào độ tuổi và hình thức học. Với SP2 Offline học đều đặn 2 buổi/tuần, sau 3–4 tháng con đã có thể lập trình robot cơ bản. Với SP1 Online học đúng lộ trình, sau 18 buổi con hoàn toàn tự tin thi vòng loại RoboSim. Cam kết: nếu không đạt, Sata Robo hoàn 100% học phí.',
  },
  {
    q: 'Trường tôi muốn triển khai SP3 thì quy trình thế nào?',
    a: 'Gồm 4 bước: (1) Liên hệ tư vấn qua form hoặc hotline 0818.823.720, (2) Khảo sát nhu cầu và cơ sở vật chất của trường, (3) Sata Robo đề xuất gói Lab STEM phù hợp và báo giá chi tiết, (4) Ký hợp đồng, triển khai lắp đặt Lab và đào tạo giáo viên. Toàn bộ quy trình từ tư vấn đến vận hành thường mất 4–8 tuần.',
  },
  {
    q: 'Con có thể chuyển từ Online (SP1) sang Offline (SP2) không?',
    a: 'Hoàn toàn được! Nhiều học viên bắt đầu với SP1 để luyện thi nhanh, sau đó đăng ký SP2 để tiếp tục lộ trình dài hạn. Kiến thức từ SP1 sẽ được công nhận và điều chỉnh lộ trình SP2 cho phù hợp — con không bị học lại phần đã biết.',
  },
]

export function CoursesFaq() {
  return (
    <section className="section-padding bg-white">
      <div className="container-site max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <span className="badge-orange mb-3 inline-block">Câu hỏi thường gặp</span>
          <h2 className="heading-2 text-text-dark">
            Phụ huynh hay{' '}
            <span className="text-gradient-orange-purple">hỏi nhất</span>
          </h2>
        </div>

        {/* multiple={false} = chỉ mở 1 item tại một thời điểm */}
        <Accordion className="space-y-3">
          {FAQS.map((faq, i) => (
            <AccordionItem
              key={i}
              value={`faq-${i}`}
              className="card-base px-6 border border-gray-100 data-[state=open]:border-primary-orange/30 not-last:border-b-0"
            >
              <AccordionTrigger className="text-left font-semibold text-text-dark py-5 no-underline hover:no-underline">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-text-muted leading-relaxed pb-5">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <p className="text-center text-text-muted mt-10">
          Còn câu hỏi khác?{' '}
          <a href="tel:0818823720" className="font-bold text-primary-orange hover:underline">
            Gọi ngay 0818.823.720
          </a>{' '}
          để được tư vấn miễn phí.
        </p>
      </div>
    </section>
  )
}
