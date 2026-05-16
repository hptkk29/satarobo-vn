"use client";

import { useEffect, useState } from "react";
import { X, Calendar, Clock, MapPin, Phone } from "lucide-react";
import { SATA_ROBO_CONTACT } from "@/lib/locations";

// sessionStorage key — checked by FreeTrialPopup to coordinate timing
// (kept in sync via CAMPAIGN_DISMISSED_KEY there).
const STORAGE_KEY = "satarobo-campaign-20-suat-dismissed";

// Window in which this popup is allowed to show.
const CAMPAIGN_START = new Date("2026-05-15T00:00:00+07:00");
const CAMPAIGN_END = new Date("2026-05-31T23:59:59+07:00");

const INITIAL_DELAY_MS = 15_000; // first show 15s after page load

interface CenterInfo {
  cs: string;
  address: string;
  openingDate: string;
  openingDay: string;
  time: string;
  schedule: string;
}

const CENTERS: CenterInfo[] = [
  {
    cs: "CS1",
    address: "211 Nguyễn Hữu Thọ — Hoà Cường",
    openingDate: "23/05/2026",
    openingDay: "Thứ 7",
    time: "Ca 15h45",
    schedule: "T7 & T4",
  },
  {
    cs: "CS2",
    address: "114 Hoàng Diệu — Hải Châu",
    openingDate: "25/05/2026",
    openingDay: "Thứ 2",
    time: "Ca 17h30",
    schedule: "T2 & T5",
  },
  {
    cs: "CS3",
    address: "89 Xô Viết Nghệ Tĩnh",
    openingDate: "24/05/2026",
    openingDay: "Chủ nhật",
    time: "Ca 8h00",
    schedule: "CN & T3",
  },
];

const ZALO_LINK = `https://zalo.me/${SATA_ROBO_CONTACT.hotlineRaw}`;

function hasBeenDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, "true");
  } catch {
    /* sessionStorage blocked — popup will reappear next mount, acceptable */
  }
}

export function CampaignPopup20Suat() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const now = new Date();
    if (now < CAMPAIGN_START || now > CAMPAIGN_END) return;
    if (hasBeenDismissed()) return;

    const id = window.setTimeout(() => setIsOpen(true), INITIAL_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  const handleDismiss = () => {
    markDismissed();
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-20-suat-title"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={handleDismiss}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Đóng"
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/95 hover:bg-white shadow-md flex items-center justify-center transition-colors ring-1 ring-black/5"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="bg-gradient-to-br from-orange-500 to-red-500 text-white px-6 py-6 pr-14">
          <div className="text-xs uppercase tracking-wider opacity-90 mb-1">
            🔥 Đặc quyền duy nhất
          </div>
          <h2
            id="campaign-20-suat-title"
            className="text-2xl sm:text-3xl font-bold leading-tight"
          >
            Tặng 20 suất khoá học Robotics MIỄN PHÍ
          </h2>
          <p className="mt-2 text-sm sm:text-base opacity-95">
            Chỉ 20 suất / cơ sở. Đăng ký đóng tự động khi đủ chỉ tiêu.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              <strong>🎁 Khoá học Đại cương Lập trình Robotics</strong> — tập trung Tư duy
              hệ thống và Lập trình tự động trên phần mềm <strong>RoboSim</strong> chuẩn
              quốc tế.
            </p>
            <p className="text-xs text-gray-500">
              💻 Học sinh mang laptop cá nhân để cài đặt phần mềm và thực hành.
            </p>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Lịch khai giảng 3 cơ sở mới
            </h3>
            <div className="space-y-2">
              {CENTERS.map((c) => (
                <div
                  key={c.cs}
                  className="border border-gray-200 rounded-lg p-3 hover:bg-orange-50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{c.address}</div>
                      <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Khai giảng {c.openingDate} ({c.openingDay})
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {c.time}
                        </span>
                        <span>Lịch học: {c.schedule}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2 italic">
              Lưu ý: Vào nghỉ hè, mỗi tuần có 2 buổi học.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <a
              href={ZALO_LINK}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleDismiss}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors text-sm sm:text-base"
            >
              💬 Giữ suất ngay qua Zalo
            </a>
            <a
              href={`tel:${SATA_ROBO_CONTACT.hotlineRaw}`}
              onClick={handleDismiss}
              className="flex-1 inline-flex items-center justify-center gap-2 border-2 border-orange-500 text-orange-500 hover:bg-orange-50 font-semibold py-3 px-4 rounded-lg transition-colors text-sm sm:text-base"
            >
              <Phone className="h-4 w-4" />
              {SATA_ROBO_CONTACT.hotline}
            </a>
          </div>

          <p className="text-xs text-gray-500 text-center pt-1">
            Cú pháp giữ suất:{" "}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">
              [ĐỒNG Ý – Tên Cơ Sở]
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}
