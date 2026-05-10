'use client'

import { useState } from 'react'
import { faqs } from '../_data/faqs'

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="section-padding bg-soft-cream"
    >
      <div className="container-site">
        <div className="text-center mb-10 sm:mb-14 max-w-3xl mx-auto">
          <h2 id="faq-heading" className="heading-2 mb-4">
            BỐ MẸ THƯỜNG HỎI MÌNH NHỮNG CÂU NÀY
          </h2>
          <p className="text-base sm:text-lg text-text-muted">
            Mình tổng hợp 5 câu hỏi phụ huynh hay hỏi nhất —
            <br />
            trước khi quyết định cho con đăng ký Khoá Luyện Thi RoboSim.
          </p>
        </div>

        <div className="max-w-2xl mx-auto space-y-3" role="list">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index
            const panelId = `lts-faq-answer-${index}`
            const btnId = `lts-faq-btn-${index}`
            return (
              <div
                key={index}
                className={`card-base overflow-hidden transition-shadow ${isOpen ? 'shadow-lg' : ''}`}
                role="listitem"
              >
                <button
                  id={btnId}
                  className="w-full flex items-center justify-between gap-3 p-5 text-left"
                  onClick={() => toggle(index)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                >
                  <span className="font-bold text-sm sm:text-base text-text-dark leading-snug">
                    ❓ {faq.question}
                  </span>
                  <span
                    className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                      isOpen
                        ? 'border-primary-orange bg-primary-orange text-white rotate-45'
                        : 'border-gray-300 text-gray-400'
                    }`}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth={2.5} fill="none">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </span>
                </button>

                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={btnId}
                  className={`grid transition-all duration-300 ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                >
                  <div className="overflow-hidden">
                    <div className="px-5 pb-5 text-sm sm:text-base text-text-muted leading-relaxed whitespace-pre-line border-t border-gray-100">
                      {faq.answer}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-10 text-center">
          <p className="text-sm text-text-muted mb-4">Vẫn còn câu hỏi khác? Inbox mình Zalo — phản hồi trong 30 phút.</p>
          <a
            href="https://zalo.me/0818823720"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
            aria-label="Chat Zalo với Sata Robo — phản hồi trong 30 phút"
          >
            💬 Chat Zalo với mình →
          </a>
        </div>
      </div>
    </section>
  )
}
