"use client";

import Link from "next/link";
import { MessageCircle, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  href: string;
  /** Display variant */
  variant?: "chat" | "phone";
  label?: string;
  className?: string;
}

// Mobile floating action button. Pinned bottom-right.
// Use cho /khoa-hoc, product pages — quick contact.
export function CTAFloating({ href, variant = "chat", label, className }: Props) {
  const Icon = variant === "phone" ? Phone : MessageCircle;
  const fallbackLabel = variant === "phone" ? "Gọi tư vấn" : "Tư vấn ngay";

  return (
    <Link
      href={href}
      className={cn(
        "fixed bottom-6 right-6 z-50 md:hidden",
        "inline-flex items-center gap-2 px-5 py-3 rounded-full",
        "bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold text-sm",
        "shadow-[0_10px_30px_rgba(249,115,22,0.45)]",
        "hover:shadow-[0_12px_36px_rgba(249,115,22,0.55)]",
        "active:scale-95 transition-all duration-200",
        className,
      )}
      aria-label={label ?? fallbackLabel}
    >
      <Icon className="w-5 h-5" />
      <span>{label ?? fallbackLabel}</span>
    </Link>
  );
}
