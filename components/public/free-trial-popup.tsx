"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, Gift, ArrowRight, Phone } from "lucide-react";
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
        {/* Close */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Đóng"
          className="absolute top-3 right-3 z-10 inline-flex items-center justify-center rounded-full w-8 h-8 bg-white/80 backdrop-blur text-neutral-600 hover:bg-white hover:text-neutral-900 shadow-sm transition"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Gradient header */}
        <div className="relative bg-gradient-to-br from-orange-500 via-rose-500 to-purple-600 px-6 pt-8 pb-12 text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:20px_20px] opacity-50"
          />
          <div className="relative">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 backdrop-blur ring-1 ring-white/30 mb-4">
              <Gift className="w-7 h-7" />
            </div>
            <h2
              id="free-trial-popup-title"
              className="text-2xl font-black leading-tight mb-2"
            >
              Học thử MIỄN PHÍ 5 buổi luyện thi Robosim
            </h2>
            <p className="text-sm opacity-95">
              Test năng lực 45 phút + Học thử 90 phút. Hoàn toàn 0 đồng, không điều
              kiện.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 -mt-6 pb-6">
          <div className="rounded-2xl bg-white shadow-xl border border-neutral-200 p-5 mb-4">
            <ul className="space-y-2 text-sm text-neutral-700">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
                Robosim độc quyền — phần mềm thi bắt buộc Cuộc thi 2026
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
                Cam kết hoàn 100% học phí bằng văn bản
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
                Lớp nhỏ ≤12 học viên — GV kèm sát từng con
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <Link
              href="/lien-he?free-trial=true"
              onClick={dismiss}
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3.5 rounded-xl shadow-lg shadow-orange-500/30 transition-all duration-200 hover:-translate-y-0.5"
            >
              Đăng ký học thử ngay
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href={`tel:${SATA_ROBO_CONTACT.hotlineRaw}`}
              className="inline-flex items-center justify-center gap-2 text-sm text-neutral-600 hover:text-orange-600 font-semibold py-2"
            >
              <Phone className="w-4 h-4" />
              Hoặc gọi {SATA_ROBO_CONTACT.hotline}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
