"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";

export function FloatingCta() {
  const pathname = usePathname();
  if (pathname.startsWith("/khoa-hoc/")) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Zalo */}
      <a
        href="https://zalo.me/0905250544"
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0068FF] shadow-lg transition-transform hover:scale-110"
        aria-label="Chat Zalo"
      >
        <MessageCircle className="h-6 w-6 text-white" />
      </a>

      {/* Đăng ký */}
      <Link
        href="/lien-he"
        className="flex items-center gap-2 rounded-full bg-[#F97316] px-4 py-3 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
      >
        Đăng ký ngay
      </Link>
    </div>
  );
}
