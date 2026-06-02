"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Phone } from "lucide-react";
import { SATA_ROBO_CONTACT_CENTERS } from "@/lib/locations";

// F-UI-4 — Bottom-pinned bar (mobile only). Đối trọng với
// <FloatingCta /> (bubble bottom-right, đã scope desktop only).
// Ẩn trên admin/login/lien-he?free-trial (user đang ở flow đăng ký rồi).
const HIDDEN_PREFIXES = ["/admin", "/login"];

export function StickyMobileCta() {
  const [isVisible, setIsVisible] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => setIsVisible(window.scrollY > 300);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl lg:hidden"
        >
          <div className="flex items-center gap-2 p-3">
            {SATA_ROBO_CONTACT_CENTERS.map((c) => (
              <a
                key={c.code}
                href={`tel:${c.hotlineRaw}`}
                aria-label={`Gọi ${c.code} ${c.hotline}`}
                className="flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-full bg-orange-100 text-orange-700 transition-colors hover:bg-orange-200"
              >
                <Phone className="h-4 w-4" />
                <span className="text-[9px] font-bold leading-none">{c.code}</span>
              </a>
            ))}
            <Link
              href="/lien-he?free-trial=true"
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-gradient-sata-warm text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Calendar className="h-4 w-4" />
              Đăng ký tư vấn miễn phí
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
