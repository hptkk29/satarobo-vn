'use client'

import { useState } from 'react'
import { ChevronDown, HelpCircle } from 'lucide-react'
import { faqs, type Faq } from '../_data/faqs'

function AnswerBlock({ block }: { block: Faq['answer'][number] }) {
  if (typeof block === 'string') {
    return <p className="text-sm leading-relaxed text-text-muted">{block}</p>
  }
  return (
    <ul className="space-y-1.5 pl-1">
      {block.items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-text-muted">
          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary-orange" aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  )
}

function FaqItem({ faq, defaultOpen }: { faq: Faq; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const panelId = `faq-panel-${faq.id}`

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left sm:px-6 sm:py-5"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="text-sm font-bold leading-snug text-text-dark sm:text-base">
          {faq.question}
        </span>
        <ChevronDown
          className={`mt-0.5 h-5 w-5 flex-shrink-0 text-primary-orange transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      <div
        id={panelId}
        className={`grid transition-all duration-300 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
            {faq.answer.map((block, i) => (
              <AnswerBlock key={i} block={block} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function FAQ() {
  return (
    <section id="faq" className="section-padding bg-white" aria-labelledby="faq-heading">
      <div className="container-site">
        <div className="mb-10 text-center sm:mb-14">
          <div className="badge-orange mb-4">
            <HelpCircle className="h-4 w-4" />
            CÂU HỎI THƯỜNG GẶP
          </div>
          <h2 id="faq-heading" className="heading-2 mb-4 text-text-dark">
            Phụ huynh hay hỏi trước khi quyết định
          </h2>
          <p className="mx-auto max-w-2xl text-base text-text-muted sm:text-lg">
            Giải đáp các thắc mắc về lộ trình, học phí, thời gian và chính sách của Sata Robo
          </p>
        </div>

        <div className="mx-auto max-w-3xl space-y-3">
          {faqs.map((faq, i) => (
            <FaqItem key={faq.id} faq={faq} defaultOpen={i === 0} />
          ))}
        </div>
      </div>
    </section>
  )
}
