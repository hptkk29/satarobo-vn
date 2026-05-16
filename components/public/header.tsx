"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Menu, X, Phone, ArrowRight } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { usePathname } from "next/navigation";
import { SATA_ROBO_CONTACT } from "@/lib/locations";

const NAV_LINKS = [
  { label: "Trang chủ", href: "/" },
  { label: "Về chúng tôi", href: "/ve-chung-toi" },
  { label: "Khoá học", href: "/khoa-hoc" },
  { label: "Học cụ", href: "/hoc-cu" },
  { label: "Tin tức", href: "/tin-tuc" },
  // Hidden temporarily — re-enable along with /vinh-danh pages when ready.
  // { label: "Vinh danh", href: "/vinh-danh" },
  { label: "Tuyển dụng", href: "/tuyen-dung" },
  { label: "Liên hệ", href: "/lien-he" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/90 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.04)] border-b border-neutral-200/60"
          : "bg-white/60 backdrop-blur border-b border-transparent"
      }`}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link
          href="/"
          aria-label="Sata Robo — Trang chủ"
          className="flex items-center focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none rounded-md"
        >
          <Image
            src="/brand/logo-satarobo.jpg"
            alt="Sata Robo"
            width={160}
            height={48}
            priority
            className="h-9 w-auto object-contain"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-3 py-2 text-sm font-semibold rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none ${
                  active
                    ? "text-orange-600"
                    : "text-neutral-600 hover:text-orange-600 hover:bg-orange-50/60"
                }`}
              >
                {link.label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-gradient-to-r from-orange-500 to-purple-600" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden lg:flex items-center gap-3">
          <a
            href={`tel:${SATA_ROBO_CONTACT.hotlineRaw}`}
            className="hidden xl:inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 hover:text-orange-600 transition-colors"
          >
            <Phone className="h-4 w-4" />
            {SATA_ROBO_CONTACT.hotline}
          </a>
          <Link
            href="/lien-he?free-trial=true"
            className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-lg shadow-orange-500/30 hover:shadow-xl hover:shadow-orange-500/40 hover:-translate-y-0.5 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none"
          >
            Đăng ký tư vấn
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Mobile hamburger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="lg:hidden inline-flex items-center justify-center rounded-lg p-2 text-neutral-700 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Mở menu</span>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 p-6">
            <SheetTitle className="sr-only">Menu điều hướng</SheetTitle>

            <div className="flex items-center justify-between mb-8">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                aria-label="Sata Robo — Trang chủ"
                className="flex items-center"
              >
                <Image
                  src="/brand/logo-satarobo.jpg"
                  alt="Sata Robo"
                  width={160}
                  height={48}
                  className="h-9 w-auto object-contain"
                />
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 hover:bg-neutral-100"
                aria-label="Đóng menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex flex-col gap-1 mb-6">
              {NAV_LINKS.map((link) => {
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={`block px-3 py-2.5 rounded-lg text-base font-semibold transition-colors ${
                      active
                        ? "bg-orange-50 text-orange-600"
                        : "text-neutral-700 hover:bg-neutral-50 hover:text-orange-600"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="space-y-3 pt-6 border-t border-neutral-200">
              <a
                href={`tel:${SATA_ROBO_CONTACT.hotlineRaw}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 text-sm font-semibold text-neutral-600 hover:text-orange-600"
              >
                <Phone className="h-4 w-4" />
                {SATA_ROBO_CONTACT.hotline}
              </a>
              <Link
                href="/lien-he?free-trial=true"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-3 rounded-xl shadow-lg shadow-orange-500/30 transition-colors"
              >
                Đăng ký tư vấn
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
