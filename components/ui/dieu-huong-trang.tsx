"use client";

// THANH ĐIỀU HƯỚNG TRANG — Đầu · Trước · 4 [5] 6 · Sau · Cuối.
//
// Dùng chung cho CẢ hai kiểu phân trang trong hệ:
//   · cắt ở client (`PhanTrangBang`, `BangPhanTrang`) → truyền `onDoi`;
//   · cắt ở DB, trang điều hướng bằng URL (`/admin/students`…) → truyền `hrefCua`, khi đó
//     mỗi nút là một `<Link>` thật (bấm giữa chuột mở tab mới được, bot đọc được).
// Truyền đúng MỘT trong hai.

import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { NGAN, dayTrang } from "@/lib/ui/day-trang";
import { cn } from "@/lib/utils";

const NUT =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-border px-2 text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40";
const NUT_DANG_XEM =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-primary bg-primary px-2 text-sm font-semibold text-primary-foreground";

export function DieuHuongTrang({
  trang,
  soTrang,
  onDoi,
  hrefCua,
  className,
}: {
  trang: number;
  soTrang: number;
  onDoi?: (trang: number) => void;
  hrefCua?: (trang: number) => string;
  className?: string;
}) {
  if (soTrang <= 1) return null;
  const ht = Math.min(Math.max(1, trang), soTrang);

  function O({
    den,
    tat,
    nhan,
    con,
    dangXem,
  }: {
    den: number;
    tat?: boolean;
    nhan: string;
    con: React.ReactNode;
    dangXem?: boolean;
  }) {
    const lop = dangXem ? NUT_DANG_XEM : NUT;
    // Nút đã tắt phải là <button disabled>, KHÔNG phải <Link> mờ đi — Link mờ vẫn bấm được
    // và vẫn điều hướng.
    if (hrefCua && !tat) {
      return (
        <Link
          href={hrefCua(den)}
          aria-label={nhan}
          aria-current={dangXem ? "page" : undefined}
          className={lop}
        >
          {con}
        </Link>
      );
    }
    return (
      <button
        type="button"
        disabled={tat}
        aria-label={nhan}
        aria-current={dangXem ? "page" : undefined}
        onClick={() => !tat && onDoi?.(den)}
        className={lop}
      >
        {con}
      </button>
    );
  }

  return (
    <nav aria-label="Điều hướng trang" className={cn("flex flex-wrap items-center gap-1", className)}>
      <O den={1} tat={ht === 1} nhan="Trang đầu" con={<ChevronsLeft className="h-4 w-4" />} />
      <O den={ht - 1} tat={ht === 1} nhan="Trang trước" con={<ChevronLeft className="h-4 w-4" />} />

      {dayTrang(ht, soTrang).map((o, i) =>
        o === NGAN ? (
          <span key={`ngan-${i}`} className="px-1 text-sm text-muted-foreground" aria-hidden>
            {NGAN}
          </span>
        ) : (
          <O key={o} den={o} nhan={`Trang ${o}`} dangXem={o === ht} con={o} />
        ),
      )}

      <O den={ht + 1} tat={ht === soTrang} nhan="Trang sau" con={<ChevronRight className="h-4 w-4" />} />
      <O
        den={soTrang}
        tat={ht === soTrang}
        nhan="Trang cuối"
        con={<ChevronsRight className="h-4 w-4" />}
      />
    </nav>
  );
}
