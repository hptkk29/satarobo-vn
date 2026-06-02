"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Phone, ChevronRight, ArrowRight } from "lucide-react";
import { SATA_ROBO_CONTACT_CENTERS } from "@/lib/locations";

// F-UI-4 — Right-slide drawer cho mobile. Replace mobile half của
// <Header /> (Sheet trigger trước đó). Nav data dùng slug thực tế
// trong repo (laptrinhrobot / luyenthirobosim) — KHÔNG dùng spec stub
// SP1/SP2/SP3 (route chưa tồn tại).
interface NavChild {
  label: string;
  href: string;
}

interface NavItem {
  label: string;
  href: string;
  children?: NavChild[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Trang chủ", href: "/" },
  { label: "Về chúng tôi", href: "/ve-chung-toi" },
  {
    label: "Khoá học",
    href: "/khoa-hoc",
    children: [
      { label: "Lập trình Robot (offline)", href: "/khoa-hoc/laptrinhrobot" },
      {
        label: "Luyện thi RoboSim (online)",
        href: "/khoa-hoc/luyenthirobosim",
      },
      { label: "Tất cả khoá học", href: "/khoa-hoc" },
    ],
  },
  { label: "Học cụ", href: "/hoc-cu" },
  { label: "Tin tức", href: "/tin-tuc" },
  { label: "Tuyển dụng", href: "/tuyen-dung" },
  { label: "Liên hệ", href: "/lien-he" },
];

export function MobileNavDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    setIsOpen(false);
    setExpandedItem(null);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Mở menu"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-neutral-700 transition-colors hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setIsOpen(false)}
              aria-hidden
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 z-50 flex h-full w-[85vw] max-w-sm flex-col bg-white shadow-2xl lg:hidden"
              role="dialog"
              aria-label="Menu điều hướng"
            >
              <div className="flex items-center justify-between border-b border-gray-100 p-4">
                <Link
                  href="/"
                  onClick={() => setIsOpen(false)}
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
                  onClick={() => setIsOpen(false)}
                  aria-label="Đóng menu"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-gray-100"
                >
                  <X className="h-5 w-5 text-gray-600" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto p-4">
                <ul className="space-y-1">
                  {NAV_ITEMS.map((item) => {
                    const active = isActive(item.href);
                    const isExpanded = expandedItem === item.label;
                    const hasChildren = !!item.children?.length;
                    return (
                      <li key={item.href}>
                        {hasChildren ? (
                          <>
                            <button
                              onClick={() =>
                                setExpandedItem(isExpanded ? null : item.label)
                              }
                              aria-expanded={isExpanded}
                              className={`flex w-full items-center justify-between rounded-lg p-3 font-medium transition-colors ${
                                active
                                  ? "bg-orange-50 text-orange-700"
                                  : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              <span>{item.label}</span>
                              <ChevronRight
                                className={`h-4 w-4 transition-transform ${
                                  isExpanded ? "rotate-90" : ""
                                }`}
                              />
                            </button>
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.ul
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="ml-4 mt-1 space-y-1 overflow-hidden border-l-2 border-orange-100 pl-2"
                                >
                                  {item.children!.map((child) => (
                                    <li key={child.href}>
                                      <Link
                                        href={child.href}
                                        onClick={() => setIsOpen(false)}
                                        className={`block rounded p-2 text-sm transition-colors ${
                                          pathname === child.href
                                            ? "font-semibold text-orange-600"
                                            : "text-gray-600 hover:bg-orange-50 hover:text-orange-600"
                                        }`}
                                      >
                                        {child.label}
                                      </Link>
                                    </li>
                                  ))}
                                </motion.ul>
                              )}
                            </AnimatePresence>
                          </>
                        ) : (
                          <Link
                            href={item.href}
                            onClick={() => setIsOpen(false)}
                            className={`block rounded-lg p-3 font-medium transition-colors ${
                              active
                                ? "bg-orange-50 text-orange-700"
                                : "text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            {item.label}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div className="space-y-2 border-t border-gray-100 bg-gray-50 p-4">
                <Link
                  href="/lien-he?free-trial=true"
                  onClick={() => setIsOpen(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-sata-warm py-3 font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Đăng ký tư vấn
                  <ArrowRight className="h-4 w-4" />
                </Link>
                {SATA_ROBO_CONTACT_CENTERS.map((c) => (
                  <a
                    key={c.code}
                    href={`tel:${c.hotlineRaw}`}
                    className="flex w-full items-center justify-center gap-2 rounded-full border border-orange-300 py-3 font-semibold text-orange-700 transition-colors hover:bg-orange-50"
                  >
                    <Phone className="h-4 w-4" />
                    <span className="text-orange-400">{c.code}</span>
                    {c.hotline}
                  </a>
                ))}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
