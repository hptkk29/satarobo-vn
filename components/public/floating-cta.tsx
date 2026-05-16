"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, ArrowRight } from "lucide-react";
import { SATA_ROBO_CONTACT } from "@/lib/locations";

// Hide on legacy course landings (they have their own floating CTAs).
const HIDDEN_PREFIXES = ["/khoa-hoc/laptrinhrobot", "/khoa-hoc/luyenthirobosim", "/admin", "/login"];

export function FloatingCta() {
  const pathname = usePathname();
  if (pathname && HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <div className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 hidden lg:flex flex-col items-end gap-3 pointer-events-none">
      {/* Zalo chat — with subtle ping ring */}
      <a
        href={SATA_ROBO_CONTACT.zalo}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat Zalo với Sata Robo"
        className="relative pointer-events-auto group inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#0068FF] text-white shadow-2xl shadow-blue-500/40 hover:shadow-blue-500/60 hover:scale-110 active:scale-95 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-[#0068FF] animate-ping opacity-30"
        />
        <MessageCircle className="h-7 w-7 relative" />
        {/* Tooltip on desktop */}
        <span className="hidden sm:block absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none shadow-lg">
          Chat Zalo
          <span className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-neutral-900" />
        </span>
      </a>

      {/* Primary CTA pill */}
      <Link
        href="/lien-he?free-trial=true"
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 px-5 py-3 text-sm font-bold text-white shadow-2xl shadow-orange-500/40 hover:shadow-orange-500/60 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:outline-none"
      >
        Đăng ký miễn phí
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
