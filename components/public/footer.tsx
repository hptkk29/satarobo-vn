import Link from "next/link";
import { MapPin, Phone, Mail } from "lucide-react";

const CENTERS = [
  { name: "Hoà Cường", address: "258 Lê Thanh Nghị, Hoà Cường, Đà Nẵng" },
  { name: "Cơ sở 2", address: "Đà Nẵng (sắp thông báo)" },
  { name: "Cơ sở 3", address: "Đà Nẵng (sắp thông báo)" },
  { name: "Cơ sở 4", address: "Đà Nẵng (sắp thông báo)" },
];

const SOCIAL_LINKS = [
  {
    label: "Facebook",
    href: "https://facebook.com/satarobo",
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
    href: "https://youtube.com/@satarobo",
    bg: "bg-[#FF0000]",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" aria-hidden="true">
        <path d="M23 7s-.3-2-1.2-2.8c-1.1-1.2-2.4-1.2-3-1.3C16.4 2.8 12 2.8 12 2.8s-4.4 0-6.8.2c-.6 0-1.9.1-3 1.3C1.3 5 1 7 1 7S.7 9.3.7 11.5v2.1c0 2.2.3 4.4.3 4.4s.3 2 1.2 2.8c1.1 1.2 2.6 1.1 3.3 1.2C7.5 22.1 12 22.1 12 22.1s4.4 0 6.8-.2c.6-.1 1.9-.1 3-1.3.9-.8 1.2-2.8 1.2-2.8s.3-2.2.3-4.4v-2.1C23.3 9.3 23 7 23 7zM9.7 15.5V8.4l6.5 3.6-6.5 3.5z" />
      </svg>
    ),
  },
  {
    label: "Zalo",
    href: "https://zalo.me/0818823720",
    bg: "bg-[#0068FF]",
    icon: (
      <span className="text-white text-xs font-black leading-none" aria-hidden="true">
        Z
      </span>
    ),
  },
];

export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-1">
            <div className="mb-3 text-2xl font-bold">
              <span className="text-[#F97316]">Sata</span>
              <span className="text-[#7C3AED]">Robo</span>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Hệ sinh thái Robotics & STEM giáo dục hàng đầu tại Đà Nẵng
            </p>
            <p className="text-xs text-gray-500 mb-5">
              Công ty Cổ phần Công nghệ Giáo dục Sata Robo
              <br />
              258 Lê Thanh Nghị, Hoà Cường, Đà Nẵng
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

          {/* Sản phẩm */}
          <div>
            <h4 className="mb-4 font-semibold text-white">Sản phẩm</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/khoa-hoc/luyen-thi-robosim" className="hover:text-[#F97316] transition-colors">
                  Luyện thi RoboSim Online
                </Link>
              </li>
              <li>
                <Link href="/khoa-hoc/lap-trinh-robot" className="hover:text-[#F97316] transition-colors">
                  Lập trình Robot Offline
                </Link>
              </li>
              <li>
                <Link href="/lien-he" className="hover:text-[#F97316] transition-colors">
                  Sata Inno School (B2B)
                </Link>
              </li>
              <li>
                <Link href="/lien-he" className="hover:text-[#F97316] transition-colors">
                  SATAGO Du lịch giáo dục
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
              <li>
                <Link href="/admin" className="hover:text-[#F97316] transition-colors">
                  Đăng nhập Admin
                </Link>
              </li>
            </ul>
          </div>

          {/* Hỗ trợ */}
          <div>
            <h4 className="mb-4 font-semibold text-white">Hỗ trợ</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://zalo.me/0818823720"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#F97316] transition-colors"
                >
                  Chat Zalo hỗ trợ
                </a>
              </li>
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
            <ul className="space-y-3 text-sm">
              {CENTERS.map((c) => (
                <li key={c.name} className="flex gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#F97316]" />
                  <span>
                    <span className="font-medium text-white">{c.name}:</span>
                    <br />
                    {c.address}
                  </span>
                </li>
              ))}
            </ul>
            {/* Contact */}
            <ul className="mt-5 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-[#F97316]" />
                <a href="tel:0818823720" className="hover:text-[#F97316] transition-colors">
                  0818.823.720
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-[#F97316]" />
                <a href="mailto:satarobo@gmail.com" className="hover:text-[#F97316] transition-colors">
                  satarobo@gmail.com
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
