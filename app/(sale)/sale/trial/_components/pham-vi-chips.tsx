// app/(sale)/sale/trial/_components/pham-vi-chips.tsx — chọn phạm vi ngày.
//
// SERVER Component (không "use client"): chỉ render <Link>, không state/effect.
// Cùng khuôn với `ClassFilterChips` của màn Lớp Trial bên admin.
//
// Phải nằm trên URL chứ không phải trong state trình duyệt: phạm vi đổi CỬA SỔ
// TRUY VẤN ở server (`cuaSoTrial`), lọc phía client không cứu được buổi chưa bao
// giờ được tải về. Đi kèm là deep-link gửi cho nhau được.
import type { JSX } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { PHAM_VI, PHAM_VI_MAC_DINH, type PhamViTrial } from "@/lib/trial/sale-window";

/** Chip mặc định KHÔNG mang tham số — giữ `/sale/trial` là URL sạch. */
function href(value: PhamViTrial): string {
  return value === PHAM_VI_MAC_DINH ? "/sale/trial" : `/sale/trial?pham_vi=${value}`;
}

export function PhamViChips({ current }: { current: PhamViTrial }): JSX.Element {
  return (
    <nav className="mt-3 flex flex-wrap gap-2" aria-label="Phạm vi ngày">
      {PHAM_VI.map((p) => {
        const active = p.value === current;
        return (
          <Link
            key={p.value}
            href={href(p.value)}
            aria-current={active ? "page" : undefined}
            title={p.moTa}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-primary text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {p.nhan}
          </Link>
        );
      })}
    </nav>
  );
}
