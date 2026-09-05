"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SaleNav } from "@/components/sale/sale-nav";
import { SaleUserMenu } from "@/components/sale/shell/sale-user-menu";

/**
 * Khung site Sale — thanh bên + thanh đầu trang.
 *
 * ── 28/08/2026 · mượn HÌNH DÁNG của site giáo viên ──────────────────────────
 * Chốt của chủ dự án: *"lấy thiết kế giống, không lấy màu, không lấy nội dung"*.
 * Nên bố cục ở đây khớp `app/(teacher)/teacher/_components/app-shell.tsx`:
 *   · thanh bên cố định 16rem từ `lg`, ngăn kéo trượt ở màn hẹp hơn;
 *   · ngăn kéo có nền mờ bấm-ra-để-đóng + nút đóng ở góc, KHÔNG bẫy người dùng;
 *   · MỘT ruột thanh bên vẽ ở hai nơi (cố định + ngăn kéo) — không nhân bản;
 *   · thanh đầu trang dính đỉnh, cao 4rem, nền mờ có làm nhoè phía sau;
 *   · cột nội dung `lg:pl-64`, thân trang có trần bề rộng và đệm theo bậc.
 *
 * Lấy MÀU và NỘI DUNG của chính site Sale: token tím, các mục menu của Sale,
 * menu người dùng chỉ có những lối đi CÓ THẬT ở site này.
 *
 * KHÔNG mượn ba thứ của site GV, và mỗi thứ đều có lý do chứ không phải bỏ sót:
 *   · **Chuông thông báo** — site Sale chưa có nguồn thông báo riêng. Treo một
 *     cái chuông không bao giờ kêu là dựng một lời hứa suông.
 *   · **Nút Sáng/Tối** — site này CHỈ có chế độ Sáng, có chủ đích (xem đầu
 *     `sale.css`: chưa có provider nào gắn được class `.dark` lên `.sale-root`).
 *     Nút chuyển chế độ mà không có chế độ để chuyển là nút chết.
 *   · **Badge tin nhắn** — hộp thư đa kênh chưa nối nhà cung cấp nào, nên số
 *     chưa đọc hôm nay luôn bằng 0.
 */
export function SaleShell({
  granted,
  userLabel,
  children,
}: {
  granted: readonly string[];
  userLabel: string;
  children: React.ReactNode;
}) {
  const [moNganKeo, setMoNganKeo] = useState(false);

  return (
    <>
      {/* Thanh bên cố định — desktop. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border lg:block print:hidden">
        <SaleNav granted={granted} userLabel={userLabel} />
      </aside>

      {/* Ngăn kéo — màn hẹp. Giữ trong cây DOM kể cả khi đóng để có hiệu ứng
          trượt; `pointer-events-none` chặn nó nuốt cú bấm lúc đang ẩn. */}
      <div
        className={cn(
          "fixed inset-0 z-40 lg:hidden",
          moNganKeo ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!moNganKeo}
      >
        <div
          className={cn(
            "absolute inset-0 bg-foreground/30 transition-opacity",
            moNganKeo ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setMoNganKeo(false)}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-64 border-r border-border shadow-xl transition-transform",
            moNganKeo ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            type="button"
            onClick={() => setMoNganKeo(false)}
            className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Đóng menu"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <SaleNav
            granted={granted}
            userLabel={userLabel}
            onNavigate={() => setMoNganKeo(false)}
          />
        </div>
      </div>

      {/* Cột nội dung. */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64 print:pl-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-[color:var(--surface-chrome)]/90 px-4 backdrop-blur sm:px-6 print:hidden">
          <button
            type="button"
            onClick={() => setMoNganKeo(true)}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted lg:hidden"
            aria-label="Mở menu"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>

          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <SaleUserMenu name={userLabel} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
    </>
  );
}
