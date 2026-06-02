import Link from "next/link";
import Image from "next/image";
import { MapPin, Phone, Mail } from "lucide-react";
import {
  SATA_ROBO_LOCATIONS,
  SATA_ROBO_CONTACT,
  operationalLocations,
  upcomingLocations,
} from "@/lib/locations";

const HQ_FOOTER = SATA_ROBO_LOCATIONS.find((l) => l.isHQ) ?? SATA_ROBO_LOCATIONS[0];

const SOCIAL_LINKS = [
  {
    label: "Facebook",
    href: SATA_ROBO_CONTACT.facebook,
    bg: "bg-[#1877F2]",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" aria-hidden="true">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    ),
  },
  {
    label: "TikTok",
    href: "https://tiktok.com/@satarobo",
    bg: "bg-black",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" aria-hidden="true">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
      </svg>
    ),
  },
  {
    label: "YouTube",
    href: SATA_ROBO_CONTACT.youtube,
    bg: "bg-[#FF0000]",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" aria-hidden="true">
        <path d="M23 7s-.3-2-1.2-2.8c-1.1-1.2-2.4-1.2-3-1.3C16.4 2.8 12 2.8 12 2.8s-4.4 0-6.8.2c-.6 0-1.9.1-3 1.3C1.3 5 1 7 1 7S.7 9.3.7 11.5v2.1c0 2.2.3 4.4.3 4.4s.3 2 1.2 2.8c1.1 1.2 2.6 1.1 3.3 1.2C7.5 22.1 12 22.1 12 22.1s4.4 0 6.8-.2c.6-.1 1.9-.1 3-1.3.9-.8 1.2-2.8 1.2-2.8s.3-2.2.3-4.4v-2.1C23.3 9.3 23 7 23 7zM9.7 15.5V8.4l6.5 3.6-6.5 3.5z" />
      </svg>
    ),
  },
  ...operationalLocations().map((c) => ({
    label: `Zalo ${c.code}`,
    href: c.zalo,
    bg: "bg-[#0068FF]",
    icon: (
      <span className="text-white text-[10px] font-black leading-none" aria-hidden="true">
        {c.code}
      </span>
    ),
  })),
];

export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-1">
            <Link
              href="/"
              aria-label="Sata Robo — Trang chủ"
              className="inline-flex items-center bg-white rounded-xl px-3 py-2 mb-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <Image
                src="/brand/logo-satarobo.jpg"
                alt="Sata Robo"
                width={160}
                height={48}
                className="h-10 w-auto object-contain"
              />
            </Link>
            <p className="text-sm text-gray-400 mb-4">
              Hệ sinh thái Robotics & STEM giáo dục hàng đầu tại Đà Nẵng
            </p>
            <p className="text-xs text-gray-500 mb-5">
              {SATA_ROBO_CONTACT.companyName}
              <br />
              MST: {SATA_ROBO_CONTACT.taxCode}
              <br />
              {HQ_FOOTER.address}
            </p>
            {/* Social icons */}
            <div className="flex gap-2">
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition hover:opacity-80 ${s.bg}`}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Khoá học */}
          <div>
            <h4 className="mb-4 font-semibold text-white">Khoá học</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/khoa-hoc/laptrinhrobot" className="hover:text-[#F97316] transition-colors">
                  Lập trình Robot
                </Link>
              </li>
              <li>
                <Link href="/khoa-hoc/luyenthirobosim" className="hover:text-[#F97316] transition-colors">
                  Luyện thi RoboSim
                </Link>
              </li>
              <li>
                <Link href="/khoa-hoc" className="hover:text-[#F97316] transition-colors">
                  Tất cả khoá học
                </Link>
              </li>
              <li>
                <Link href="/hoc-cu" className="hover:text-[#F97316] transition-colors">
                  Học cụ STEM
                </Link>
              </li>
            </ul>
          </div>

          {/* Công ty */}
          <div>
            <h4 className="mb-4 font-semibold text-white">Công ty</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/ve-chung-toi" className="hover:text-[#F97316] transition-colors">
                  Về chúng tôi
                </Link>
              </li>
              <li>
                <Link href="/tin-tuc" className="hover:text-[#F97316] transition-colors">
                  Tin tức & Blog
                </Link>
              </li>
              <li>
                <Link href="/tuyen-dung" className="hover:text-[#F97316] transition-colors">
                  Tuyển dụng
                </Link>
              </li>
              <li>
                <Link href="/lien-he" className="hover:text-[#F97316] transition-colors">
                  Liên hệ
                </Link>
              </li>
            </ul>
          </div>

          {/* Hỗ trợ */}
          <div>
            <h4 className="mb-4 font-semibold text-white">Hỗ trợ</h4>
            <ul className="space-y-2 text-sm">
              {operationalLocations().map((c) => (
                <li key={c.code}>
                  <a
                    href={c.zalo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#F97316] transition-colors"
                  >
                    Chat Zalo {c.code}
                  </a>
                </li>
              ))}
              <li>
                <Link href="/chinh-sach-hoan-tra" className="hover:text-[#F97316] transition-colors">
                  Chính sách hoàn trả
                </Link>
              </li>
              <li>
                <Link href="/chinh-sach-bao-mat" className="hover:text-[#F97316] transition-colors">
                  Chính sách bảo mật
                </Link>
              </li>
              <li>
                <Link href="/dieu-khoan-su-dung" className="hover:text-[#F97316] transition-colors">
                  Điều khoản sử dụng
                </Link>
              </li>
            </ul>
          </div>

          {/* Hệ thống cơ sở */}
          <div>
            <h4 className="mb-4 font-semibold text-white">Hệ thống cơ sở</h4>
            <div className="space-y-3 text-sm">
              <div className="flex gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#F97316]" />
                <div>
                  <p className="font-medium text-white">
                    {HQ_FOOTER.name}{" "}
                    <span className="text-xs text-gray-400">(Trụ sở chính)</span>
                  </p>
                  <p className="text-xs text-gray-400">{HQ_FOOTER.address}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                {operationalLocations().length} cơ sở đang hoạt động ·{" "}
                {upcomingLocations().length} sắp khai trương
              </p>
              <Link
                href="/lien-he"
                className="inline-flex items-center gap-1 text-sm font-medium text-[#F97316] hover:text-orange-400 transition-colors"
              >
                Xem tất cả cơ sở
                <span aria-hidden="true">→</span>
              </Link>
            </div>
            {/* Contact */}
            <ul className="mt-5 space-y-2 text-sm">
              {operationalLocations().map((c) => (
                <li key={c.code} className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-[#F97316]" />
                  <a
                    href={`tel:${c.hotlineRaw}`}
                    className="hover:text-[#F97316] transition-colors"
                  >
                    <span className="text-gray-500">{c.code}</span> {c.hotline}
                  </a>
                </li>
              ))}
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-[#F97316]" />
                <a
                  href={`mailto:${SATA_ROBO_CONTACT.emails.general}`}
                  className="hover:text-[#F97316] transition-colors"
                >
                  {SATA_ROBO_CONTACT.emails.general}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-[#F97316]" />
                <a
                  href={`mailto:${SATA_ROBO_CONTACT.emails.recruitment}`}
                  className="hover:text-[#F97316] transition-colors"
                >
                  {SATA_ROBO_CONTACT.emails.recruitment}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-gray-800 pt-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Sata Robo. Bảo lưu mọi quyền.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/chinh-sach-hoan-tra" className="hover:text-gray-300 transition-colors">
              Chính sách hoàn trả
            </Link>
            <Link href="/chinh-sach-bao-mat" className="hover:text-gray-300 transition-colors">
              Chính sách bảo mật
            </Link>
            <Link href="/dieu-khoan-su-dung" className="hover:text-gray-300 transition-colors">
              Điều khoản sử dụng
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
