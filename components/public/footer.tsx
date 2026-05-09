import Link from "next/link";
import { MapPin, Phone, Mail } from "lucide-react";

const CENTERS = [
  { name: "Hoà Cường", address: "258 Lê Thanh Nghị, Hoà Cường, Đà Nẵng" },
  { name: "Cơ sở 2", address: "Đà Nẵng (sắp thông báo)" },
  { name: "Cơ sở 3", address: "Đà Nẵng (sắp thông báo)" },
  { name: "Cơ sở 4", address: "Đà Nẵng (sắp thông báo)" },
];

export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-1">
            <div className="mb-3 text-2xl font-bold">
              <span className="text-[#F97316]">Sata</span>
              <span className="text-[#7C3AED]">Robo</span>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Hệ sinh thái Robotics & STEM giáo dục hàng đầu tại Đà Nẵng
            </p>
            <p className="text-xs text-gray-500">
              Công ty Cổ phần Công nghệ Giáo dục Sata Robo
              <br />
              MSN: (đang cập nhật)
            </p>
          </div>

          {/* Khoá học */}
          <div>
            <h4 className="mb-4 font-semibold text-white">Khoá học</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/khoa-hoc/lap-trinh-robot" className="hover:text-[#F97316]">
                  Lập trình Robot Offline
                </Link>
              </li>
              <li>
                <Link href="/khoa-hoc/luyen-thi-robosim" className="hover:text-[#F97316]">
                  Luyện thi RoboSim Online
                </Link>
              </li>
              <li>
                <Link href="/khoa-hoc" className="hover:text-[#F97316]">
                  Sata Inno School (B2B)
                </Link>
              </li>
              <li>
                <Link href="/khoa-hoc" className="hover:text-[#F97316]">
                  SATAGO Du lịch giáo dục
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
          </div>

          {/* Liên hệ */}
          <div>
            <h4 className="mb-4 font-semibold text-white">Liên hệ</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-[#F97316]" />
                <a href="tel:0818823720" className="hover:text-[#F97316]">
                  0818.823.720
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-[#F97316]" />
                <a href="mailto:satarobo@gmail.com" className="hover:text-[#F97316]">
                  satarobo@gmail.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-gray-800 pt-6 flex flex-col gap-2 md:flex-row md:justify-between text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Sata Robo. Bảo lưu mọi quyền.</p>
          <div className="flex gap-4">
            <Link href="/chinh-sach-bao-mat" className="hover:text-gray-300">
              Chính sách bảo mật
            </Link>
            <Link href="/dieu-khoan-su-dung" className="hover:text-gray-300">
              Điều khoản sử dụng
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
