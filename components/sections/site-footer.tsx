"use client";

import Link from "next/link";
import Image from "next/image";
import { Phone, Mail, MapPin, Plus } from "lucide-react";
import {
  SATA_ROBO_CONTACT,
  operationalLocations,
  upcomingLocations,
} from "@/lib/locations";

// F-UI-4 — New footer. Real data từ SATA_ROBO_LOCATIONS (mỗi cơ sở SĐT + Zalo
// riêng — không hard-code), 4-col desktop / 1-col accordion mobile.
const SECTIONS = [
  {
    title: "Khoá học",
    links: [
      { label: "Lập trình Robot (offline)", href: "/khoa-hoc/laptrinhrobot" },
      {
        label: "Luyện thi RoboSim (online)",
        href: "/khoa-hoc/luyenthirobosim",
      },
      { label: "Tất cả khoá học", href: "/khoa-hoc" },
      { label: "Học cụ STEM", href: "/hoc-cu" },
    ],
  },
  {
    title: "Sata Robo",
    links: [
      { label: "Về chúng tôi", href: "/ve-chung-toi" },
      { label: "Tin tức & Blog", href: "/tin-tuc" },
      { label: "Tuyển dụng", href: "/tuyen-dung" },
      { label: "Liên hệ", href: "/lien-he" },
    ],
  },
  {
    title: "Hỗ trợ",
    links: [
      ...operationalLocations().map((c) => ({
        label: `Chat Zalo ${c.code} (${c.hotline})`,
        href: c.zalo,
      })),
      { label: "Chính sách hoàn trả", href: "/chinh-sach-hoan-tra" },
      { label: "Chính sách bảo mật", href: "/chinh-sach-bao-mat" },
      { label: "Điều khoản sử dụng", href: "/dieu-khoan-su-dung" },
    ],
  },
];

const SOCIAL_LINKS = [
  {
    label: "Facebook",
    href: SATA_ROBO_CONTACT.facebook,
    bg: "bg-[#1877F2] hover:bg-[#0e64d3]",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 fill-white"
        aria-hidden="true"
      >
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    ),
  },
  {
    label: "TikTok",
    href: SATA_ROBO_CONTACT.tiktok,
    bg: "bg-black hover:bg-neutral-800",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 fill-white"
        aria-hidden="true"
      >
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
      </svg>
    ),
  },
  {
    label: "YouTube",
    href: SATA_ROBO_CONTACT.youtube,
    bg: "bg-[#FF0000] hover:bg-[#cc0000]",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 fill-white"
        aria-hidden="true"
      >
        <path d="M23 7s-.3-2-1.2-2.8c-1.1-1.2-2.4-1.2-3-1.3C16.4 2.8 12 2.8 12 2.8s-4.4 0-6.8.2c-.6 0-1.9.1-3 1.3C1.3 5 1 7 1 7S.7 9.3.7 11.5v2.1c0 2.2.3 4.4.3 4.4s.3 2 1.2 2.8c1.1 1.2 2.6 1.1 3.3 1.2C7.5 22.1 12 22.1 12 22.1s4.4 0 6.8-.2c.6-.1 1.9-.1 3-1.3.9-.8 1.2-2.8 1.2-2.8s.3-2.2.3-4.4v-2.1C23.3 9.3 23 7 23 7zM9.7 15.5V8.4l6.5 3.6-6.5 3.5z" />
      </svg>
    ),
  },
  ...operationalLocations().map((c) => ({
    label: `Zalo ${c.code}`,
    href: c.zalo,
    bg: "bg-[#0068FF] hover:bg-[#0050cc]",
    icon: (
      <span
        className="text-[10px] font-black leading-none text-white"
        aria-hidden="true"
      >
        {c.code}
      </span>
    ),
  })),
];

function isExternal(href: string) {
  return /^https?:\/\//.test(href);
}

export function SiteFooter() {
  const ops = operationalLocations().length;
  const upcoming = upcomingLocations().length;

  return (
    <footer className="bg-zinc-950 text-gray-300">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:gap-12">
          {/* Brand column */}
          <div>
            <Link
              href="/"
              aria-label="Sata Robo — Trang chủ"
              className="mb-4 inline-flex items-center rounded-xl bg-white px-3 py-2 shadow-sm transition-shadow hover:shadow-md"
            >
              <Image
                src="/brand/logo-satarobo.jpg"
                alt="Sata Robo"
                width={160}
                height={48}
                className="h-10 w-auto object-contain"
              />
            </Link>
            <p className="mb-4 text-sm leading-relaxed text-gray-400">
              Trung tâm đào tạo STEM – Lập trình Robotics & AI – Sata Robo.
              {ops > 0 ? ` ${ops} cơ sở đang hoạt động` : ""}
              {upcoming > 0 ? ` · ${upcoming} sắp khai trương` : ""}.
            </p>
            <div className="space-y-3 text-sm">
              {operationalLocations().map((c) => (
                <div key={c.code} className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    {c.code} — {c.name}
                  </p>
                  <a
                    href={`tel:${c.hotlineRaw}`}
                    className="flex items-center gap-2 transition-colors hover:text-orange-400"
                  >
                    <Phone className="h-4 w-4 text-orange-400" />
                    {c.hotline}
                  </a>
                  <div className="flex items-start gap-2 text-gray-400">
                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-400" />
                    <span>{c.address}</span>
                  </div>
                </div>
              ))}
              <a
                href={`mailto:${SATA_ROBO_CONTACT.emails.general}`}
                className="flex items-center gap-2 break-all transition-colors hover:text-orange-400"
              >
                <Mail className="h-4 w-4 flex-shrink-0 text-orange-400" />
                {SATA_ROBO_CONTACT.emails.general}
              </a>
            </div>
          </div>

          {/* Link sections — 2 render trees để giữ state đúng theo viewport:
              - Mobile (< md): <details> default closed, user tap để mở.
              - Desktop (≥ md): plain block luôn hiển thị.
              Tách 2 cây tránh tình trạng "đóng trên mobile xong resize
              desktop vẫn đóng" của approach 1-tree-with-CSS. */}
          {SECTIONS.map((section) => {
            const renderLinks = (
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    {isExternal(link.href) ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-400 transition-colors hover:text-orange-400"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-gray-400 transition-colors hover:text-orange-400"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            );
            return (
              <div key={section.title}>
                {/* Mobile accordion — default đóng (không có `open` attr) */}
                <details className="group border-b border-gray-800 pb-3 md:hidden">
                  <summary className="flex list-none cursor-pointer items-center justify-between py-2">
                    <h3 className="font-semibold text-white">
                      {section.title}
                    </h3>
                    <Plus className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-45" />
                  </summary>
                  <div className="pt-3">{renderLinks}</div>
                </details>

                {/* Desktop block — luôn hiển thị, không có toggle */}
                <div className="hidden md:block">
                  <h3 className="mb-4 font-semibold text-white">
                    {section.title}
                  </h3>
                  {renderLinks}
                </div>
              </div>
            );
          })}
        </div>

        {/* Social + Trust */}
        <div className="mt-12 flex flex-col items-start justify-between gap-6 border-t border-gray-800 pt-8 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Theo dõi:</span>
            {SOCIAL_LINKS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${s.bg}`}
              >
                {s.icon}
              </a>
            ))}
          </div>
          <div className="text-xs text-gray-500">
            {SATA_ROBO_CONTACT.companyName} · MST: {SATA_ROBO_CONTACT.taxCode}
          </div>
        </div>
      </div>

      {/* Copyright bar */}
      <div className="border-t border-gray-800 bg-zinc-900">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-gray-500 sm:flex-row sm:px-6 lg:px-8">
          <p>
            © {new Date().getFullYear()} {SATA_ROBO_CONTACT.shortName}. Bảo lưu
            mọi quyền.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/dieu-khoan-su-dung"
              className="transition-colors hover:text-orange-400"
            >
              Điều khoản
            </Link>
            <Link
              href="/quyen-rieng-tu"
              className="transition-colors hover:text-orange-400"
            >
              Quyền riêng tư
            </Link>
            <Link
              href="/chinh-sach-bao-mat"
              className="transition-colors hover:text-orange-400"
            >
              Bảo mật
            </Link>
            <Link
              href="/chinh-sach-hoan-tra"
              className="transition-colors hover:text-orange-400"
            >
              Hoàn trả
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile bottom padding để StickyMobileCta không che footer cuối */}
      <div className="h-20 lg:hidden" aria-hidden />
    </footer>
  );
}
