"use client";

import useScrollPosition from "./_hooks/useScrollPosition";
import { MessageCircle, Target } from "lucide-react";
import { trackPixelEvent, trackGA4Event } from "./_utils/tracking";
import { SATA_ROBO_CONTACT_CENTERS } from "@/lib/locations";

export default function FloatingCTA() {
  const scrollY = useScrollPosition();
  const isVisible = scrollY > 600;

  const handleScrollToForm = () => {
    trackPixelEvent("FloatingCTA_RegisterClick");
    trackGA4Event("floating_cta_click", { action: "register" });
    document.getElementById("registration-form")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleZaloClick = () => {
    trackPixelEvent("FloatingCTA_ZaloClick");
    trackGA4Event("floating_cta_click", { action: "zalo" });
  };

  return (
    <div
      className={`fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-40 flex flex-col gap-2.5 transition-all duration-300 ${
        isVisible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-8 pointer-events-none"
      }`}
    >
      <button
        onClick={handleScrollToForm}
        className="group flex items-center gap-2 px-3.5 sm:px-5 py-2.5 sm:py-3 bg-gradient-orange-purple text-white font-bold text-xs sm:text-sm rounded-full
          shadow-xl hover:scale-105 hover:shadow-2xl active:scale-95 transition-all"
        aria-label="Đăng ký tư vấn"
      >
        <Target className="w-4 h-4 sm:w-5 sm:h-5 group-hover:rotate-90 transition" />
        <span className="hidden sm:inline">Đăng Ký</span>
        <span className="sm:hidden">Đăng ký</span>
      </button>

      {SATA_ROBO_CONTACT_CENTERS.map((c) => (
        <a
          key={c.code}
          href={c.zalo}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleZaloClick}
          className="group flex items-center gap-2 px-3.5 sm:px-5 py-2.5 sm:py-3 bg-[#0068FF] text-white font-bold text-xs sm:text-sm rounded-full
            shadow-xl hover:scale-105 hover:shadow-2xl active:scale-95 transition-all relative"
          aria-label={`Chat Zalo ${c.code}`}
        >
          <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />
          <span>Zalo {c.code}</span>
        </a>
      ))}
    </div>
  );
}
