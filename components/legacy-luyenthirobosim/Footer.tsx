"use client";

import Image from "next/image";
import { SATA_ROBO_CONTACT_CENTERS } from "@/lib/locations";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer role="contentinfo">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Image
              src="/brand/logo-satarobo.jpg"
              alt="Logo Sata Robo"
              className="footer-brand-logo"
              loading="lazy"
              width={72}
              height={72}
            />
            <p className="footer-brand__desc">
              Sata Robo — Đơn vị luyện thi Robotics chuyên biệt.<br />
              Khoá Luyện Thi RBT2026 dành cho học sinh Tiểu học và THCS toàn quốc.
            </p>
          </div>

          <nav aria-label="Khoá học">
            <h4>Khoá học</h4>
            <ul className="footer-links">
              <li>
                <a href="#courses">
                  <span className="fi">🟦</span> Khoá Luyện Thi R1 — Tiểu học
                </a>
              </li>
              <li>
                <a href="#courses">
                  <span className="fi">🟪</span> Khoá Luyện Thi R2 — THCS
                </a>
              </li>
              <li>
                <a href="#faq">
                  <span className="fi">❓</span> Câu hỏi thường gặp
                </a>
              </li>
              <li>
                <a
                  href="https://sataworld.vn"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <span className="fi">🌐</span> sataworld.vn
                </a>
              </li>
            </ul>
          </nav>

          <address>
            <h4>Liên hệ</h4>
            <ul className="footer-links">
              {SATA_ROBO_CONTACT_CENTERS.map((c) => (
                <li key={`tel-${c.code}`}>
                  <a href={`tel:${c.hotlineRaw}`} aria-label={`Gọi ${c.code} Sata Robo`}>
                    <span className="fi">📞</span> {c.code}: {c.hotline}
                  </a>
                </li>
              ))}
              {SATA_ROBO_CONTACT_CENTERS.map((c) => (
                <li key={`zalo-${c.code}`}>
                  <a
                    href={c.zalo}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Chat Zalo ${c.code}`}
                  >
                    <span className="fi">💬</span> Zalo {c.code}: {c.hotline}
                  </a>
                </li>
              ))}
              <li>
                <a href="mailto:thongtin@satarobo.vn" aria-label="Gửi email cho Sata Robo">
                  <span className="fi">✉️</span> thongtin@satarobo.vn
                </a>
              </li>
              <li className="footer-hide-mobile">
                <a
                  href="https://maps.google.com/?q=211+Nguy%E1%BB%85n+H%E1%BB%AFu+Th%E1%BB%8D,+%C4%90%C3%A0+N%E1%BA%B5ng"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Xem địa chỉ trụ sở chính trên Google Maps"
                >
                  <span className="fi">📍</span> 211 Nguyễn Hữu Thọ, Đà Nẵng (Trụ sở chính)
                </a>
              </li>
              <li>
                <a
                  href="http://facebook.com/Satarobo"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook Sata Robo"
                >
                  <span className="fi">📘</span> Facebook: Sata Robo
                </a>
              </li>
            </ul>
          </address>
        </div>

        <div className="footer-bottom">
          <p>
            © {year}{" "}
            <a href="https://sataworld.vn/" rel="noopener noreferrer" target="_blank">
              Sata Robo
            </a>.
            {" "}Tất cả quyền được bảo lưu.
          </p>
          <p>
            <a href="/chinh-sach-bao-mat">Chính sách bảo mật</a>
            {" | "}
            <a href="/dieu-khoan-su-dung">Điều khoản sử dụng</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
