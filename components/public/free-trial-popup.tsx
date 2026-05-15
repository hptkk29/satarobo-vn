"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, Gift, ArrowRight, Phone, Check, Sparkles } from "lucide-react";
import { SATA_ROBO_CONTACT } from "@/lib/locations";

const STORAGE_KEY = "satarobo-free-trial-dismissed";
const DELAY_MS = 10_000;

// Hide on routes where popup would be redundant or noisy.
const HIDDEN_PREFIXES = [
  "/lien-he",
  "/admin",
  "/login",
  "/khoa-hoc/laptrinhrobot",
  "/khoa-hoc/luyenthirobosim",
];

export function FreeTrialPopup() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!pathname) return;
    if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return;
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      // sessionStorage blocked — proceed anyway
    }

    const id = window.setTimeout(() => setOpen(true), DELAY_MS);
    return () => window.clearTimeout(id);
  }, [pathname]);

  const dismiss = () => {
    setOpen(false);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="free-trial-popup-title"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={dismiss}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close — high-contrast, easy tap target on top-right corner */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Đóng"
          className="absolute top-3 right-3 z-10 inline-flex items-center justify-center rounded-full w-9 h-9 bg-white text-neutral-700 hover:text-neutral-900 hover:bg-neutral-50 ring-1 ring-black/5 shadow-md transition focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Compact gradient header — icon + title only, no awkward overlap */}
        <div className="relative bg-gradient-to-br from-orange-500 via-rose-500 to-purple-600 px-6 pt-7 pb-7 text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:20px_20px] opacity-50"
          />
          <div className="relative flex items-start gap-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/15 backdrop-blur ring-1 ring-white/30 shrink-0">
              <Gift className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0 pr-8">
              <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur ring-1 ring-white/30 rounded-full px-2.5 py-0.5 mb-2">
                <Sparkles className="h-3 w-3" />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Ưu đãi đặc biệt
                </span>
              </div>
              <h2
                id="free-trial-popup-title"
                className="text-lg sm:text-xl font-black leading-tight"
              >
                Học thử MIỄN PHÍ 5 buổi luyện thi Robosim
              </h2>
            </div>
          </div>
        </div>

        {/* White body — subtitle + bullets + CTAs, no overlap */}
        <div className="px-6 py-6">
          <p className="text-sm text-neutral-600 mb-4 leading-relaxed">
            Test năng lực <strong className="text-neutral-900">45 phút</strong> + Học
            thử <strong className="text-neutral-900">90 phút</strong>. Hoàn toàn{" "}
            <strong className="text-orange-600">0 đồng</strong>, không điều kiện.
          </p>

          <ul className="space-y-2.5 text-sm text-neutral-700 mb-5">
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-100 text-orange-600 shrink-0">
                <Check className="h-3 w-3" />
              </span>
              <span>Robosim độc quyền — phần mềm thi bắt buộc Cuộc thi 2026</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-100 text-orange-600 shrink-0">
                <Check className="h-3 w-3" />
              </span>
              <span>Cam kết hoàn 100% học phí bằng văn bản</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-100 text-orange-600 shrink-0">
                <Check className="h-3 w-3" />
              </span>
              <span>Lớp nhỏ ≤12 học viên — GV kèm sát từng con</span>
            </li>
          </ul>

          <Link
            href="/lien-he?free-trial=true"
            onClick={dismiss}
            className="inline-flex w-full items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3.5 rounded-xl shadow-lg shadow-orange-500/30 transition-all duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none"
          >
            Đăng ký học thử ngay
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href={`tel:${SATA_ROBO_CONTACT.hotlineRaw}`}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 text-sm text-neutral-600 hover:text-orange-600 font-semibold transition-colors"
          >
            <Phone className="w-4 h-4" />
            Hoặc gọi {SATA_ROBO_CONTACT.hotline}
          </a>
        </div>
      </div>
    </div>
  );
}
