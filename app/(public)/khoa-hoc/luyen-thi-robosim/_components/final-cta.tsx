'use client'

import Image from 'next/image'
import { trackAndOpen } from '../_utils/track-cta'

export function FinalCTA() {
  return (
    <section
      id="final-cta"
      aria-labelledby="final-cta-heading"
      className="section-padding"
      style={{ background: 'linear-gradient(160deg, #1a0845 0%, #2d1060 50%, #0a1535 100%)' }}
    >
      <div className="container-site text-center">
        <div className="flex justify-center mb-4">
          <Image
            src="/images/courses/luyen-thi-robosim/linh-vat.png"
            alt=""
            aria-hidden="true"
            width={96}
            height={96}
            className="object-contain"
          />
        </div>

        <h2
          id="final-cta-heading"
          className="text-2xl sm:text-3xl lg:text-4xl font-black text-white mb-4 leading-snug"
        >
          BỐ MẸ ĐÃ ĐỌC ĐẾN ĐÂY —
          <br />
          CHỈ CÒN 1 BƯỚC NỮA CHO CON.
        </h2>

        <p className="text-white/70 text-base sm:text-lg mb-8 leading-relaxed">
          Mỗi ngày trôi qua = 1 ngày các bạn khác đang luyện thêm.
          <br />
          Đừng để con bố mẹ bị bỏ lại trong nhóm đại trà.
        </p>

        <div className="flex gap-4 justify-center flex-wrap mb-8">
          <button
            onClick={() => trackAndOpen('R1', 'section7_R1')}
            className="flex-1 min-w-[200px] max-w-xs rounded-2xl py-4 px-6 font-extrabold text-base text-white leading-snug transition hover:opacity-90 hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, #F7941D, #FFAD4D)',
              boxShadow: '0 8px 24px rgba(247,148,29,0.40)',
            }}
            aria-label="Đăng ký Bảng R1 cho con Tiểu học — 490.000đ, mở trong tab mới"
          >
            🟦 ĐĂNG KÝ BẢNG R1 — 490.000đ
            <span className="block text-sm font-bold opacity-80 mt-0.5">(Cho con TIỂU HỌC)</span>
          </button>
          <button
            onClick={() => trackAndOpen('R2', 'section7_R2')}
            className="flex-1 min-w-[200px] max-w-xs rounded-2xl py-4 px-6 font-extrabold text-base text-white leading-snug transition hover:opacity-90 hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, #7C3AED, #a78bfa)',
              boxShadow: '0 8px 24px rgba(124,58,237,0.40)',
            }}
            aria-label="Đăng ký Bảng R2 cho con THCS — 490.000đ, mở trong tab mới"
          >
            🟪 ĐĂNG KÝ BẢNG R2 — 490.000đ
            <span className="block text-sm font-bold opacity-80 mt-0.5">(Cho con THCS)</span>
          </button>
        </div>

        <div className="inline-block bg-white/10 rounded-2xl px-6 py-5 text-center">
          <p className="text-white/80 text-sm mb-1">💡 Bố mẹ cần tư vấn riêng?</p>
          <p className="text-white/70 text-sm mb-4">Inbox mình ngay — Để được tư vấn.</p>
          <a
            href="https://zalo.me/0818823720"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold px-6 py-3 rounded-xl transition"
            aria-label="Chat Zalo với Sata Robo để được tư vấn miễn phí"
          >
            💬 Chat Zalo với mình →
          </a>
          <p className="text-white/50 text-xs mt-3">Sata Robo phản hồi trong 30 phút (giờ hành chính).</p>
        </div>
      </div>
    </section>
  )
}
