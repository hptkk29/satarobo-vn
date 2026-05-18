"use client";

import { useEffect, useState } from "react";
import { X, Calendar, Clock, MapPin, Phone, Star } from "lucide-react";
import { SATA_ROBO_CONTACT } from "@/lib/locations";

// sessionStorage key — prevents re-showing within the same browsing session
// once the visitor dismisses the popup.
const STORAGE_KEY = "satarobo-campaign-20-suat-dismissed";

// Window in which this popup is allowed to show.
const CAMPAIGN_START = new Date("2026-05-15T00:00:00+07:00");
const CAMPAIGN_END = new Date("2026-05-31T23:59:59+07:00");

const INITIAL_DELAY_MS = 15_000; // first show 15s after page load

interface BatchInfo {
  priority?: boolean;
  openingDate: string;
  openingDay: string;
  schedule: string;
}

// 2 ĐỢT KHAI GIẢNG — mỗi đợt áp dụng cho CẢ 2 cơ sở (211 NHT + 114 HD).
const BATCHES: BatchInfo[] = [
  {
    priority: true,
    openingDate: "23/5/2026",
    openingDay: "Thứ 7",
    schedule: "T4/T7 hằng tuần — 15h45-17h15",
  },
  {
    openingDate: "25/5/2026",
    openingDay: "Thứ 2",
    schedule: "T2/T5 hằng tuần — 17h30-19h00",
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
      // Mobile: p-2 (8px) thay vì p-4 (16px) để khung popup rộng hơn.
      // KHÔNG dùng overflow-y-auto trên outer (gây tràn body khi content
      // dài) — thay vào đó, scroll riêng trên body section của modal.
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4"
      onClick={handleDismiss}
    >
      <div
        // Constrain max-height = 95vh trên mobile / 90vh trên desktop để
        // modal không bao giờ tràn viewport. flex flex-col + overflow-hidden
        // ở modal frame; header shrink-0 giữ nguyên kích thước; body
        // overflow-y-auto cho phép scroll nội dung khi cần.
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* X close — absolute top-right, smaller trên mobile, z-20 cao hơn
            mọi nội dung khác trong modal */}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Đóng"
          className="absolute top-2 right-2 sm:top-3 sm:right-3 z-20 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/95 hover:bg-white shadow-md flex items-center justify-center transition-colors ring-1 ring-black/5"
        >
          <X className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>

        {/* Header — không scroll, shrink-0. Bớt padding mobile để tiết kiệm
            không gian dọc. */}
        <div className="shrink-0 bg-gradient-to-br from-orange-500 to-red-500 text-white px-4 sm:px-6 py-4 sm:py-6 pr-12 sm:pr-14">
          <div className="text-[11px] sm:text-xs uppercase tracking-wider opacity-90 mb-1">
            🔥 Đặc quyền duy nhất
          </div>
          <h2
            id="campaign-20-suat-title"
            className="text-xl sm:text-2xl md:text-3xl font-bold leading-tight"
          >
            Tặng 24 suất khoá học Robotics MIỄN PHÍ
          </h2>
          <p className="mt-2 text-xs sm:text-sm md:text-base opacity-95">
            Chỉ 24 suất / cơ sở. Đăng ký đóng tự động khi đủ chỉ tiêu.
          </p>
        </div>

        {/* Body — scrollable nếu content vượt phần còn lại của modal. min-h-0
            cho phép flex child shrink để overflow hoạt động đúng. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4">
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              <strong>🎁 Khoá học Đại cương Lập trình Robotics</strong> — tập trung
              Tư duy hệ thống và Lập trình tự động trên phần mềm{" "}
              <strong>RoboSim</strong> chuẩn quốc tế.
            </p>
            <p className="text-xs text-gray-500">
              💻 Học sinh mang laptop cá nhân để cài đặt phần mềm và thực hành.
            </p>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              2 đợt khai giảng
            </h3>
            <div className="space-y-2">
              {BATCHES.map((b, i) => (
                <div
                  key={b.openingDate}
                  className={`rounded-lg p-3 transition-colors ${
                    b.priority
                      ? "border-2 border-orange-400 bg-orange-50/60"
                      : "border border-gray-200 hover:bg-orange-50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        b.priority
                          ? "bg-orange-500 text-white"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">
                          Khai giảng {b.openingDay}, {b.openingDate}
                        </span>
                        {b.priority && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                            <Star className="h-2.5 w-2.5" />
                            Ưu tiên
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-600">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>Lịch học: {b.schedule}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Cả 2 đợt áp dụng cho cả 2 cơ sở */}
            <div className="mt-3 rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-orange-50 px-3 py-2.5">
              <div className="flex items-start gap-2 text-xs sm:text-sm text-gray-700">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" />
                <span>
                  Áp dụng cho <strong>cả 2 cơ sở</strong>: 211 Nguyễn Hữu Thọ
                  &amp; 114 Hoàng Diệu
                </span>
              </div>
            </div>

            <p className="mt-2 text-[11px] italic text-gray-500 sm:text-xs">
              Lưu ý: Vào nghỉ hè, mỗi tuần có 2 buổi học.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <a
              href={ZALO_LINK}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleDismiss}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 sm:py-3 sm:text-base"
            >
              💬 Giữ suất ngay qua Zalo
            </a>
            <a
              href={`tel:${SATA_ROBO_CONTACT.hotlineRaw}`}
              onClick={handleDismiss}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border-2 border-orange-500 px-4 py-2.5 text-sm font-semibold text-orange-500 transition-colors hover:bg-orange-50 sm:py-3 sm:text-base"
            >
              <Phone className="h-4 w-4" />
              {SATA_ROBO_CONTACT.hotline}
            </a>
          </div>

          <p className="pt-1 text-center text-[11px] text-gray-500 sm:text-xs">
            Cú pháp giữ suất:{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] sm:text-[11px]">
              [ĐỒNG Ý – Tên Cơ Sở]
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}
