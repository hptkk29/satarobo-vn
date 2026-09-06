// components/admin/cham-cong/kpi-strip.tsx — hàng số liệu đầu màn.
//
// Vì sao file này tồn tại: mỗi màn cũ tự dựng lưới thẻ số với cột khác nhau, nên cùng một hàng KPI
// mà chỗ 3 cột chỗ 5 cột, và số thì có thẻ tràn ra ngoài. Ở đây một lưới, còn thẻ mượn `StatCard`
// chuẩn của admin.
//
// `href` là điểm chính: KPI của module này KHÔNG phải để ngắm — "Cờ cần rà 7" phải bấm được để ra
// đúng bộ lọc sinh ra số 7 đó, không thì người dùng lại đi lọc tay và ra số khác.
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { StatCard, type StatTone } from "@/components/admin/ui/stat-card";

export type KpiItem = {
  icon?: LucideIcon;
  /** Số ĐÃ định dạng ở page (`toLocaleString('vi-VN')`) — thẻ không tự format. */
  value: string | number;
  label: string;
  tone?: StatTone;
  hint?: string;
  href?: string;
};

export function KpiStrip({ items, cols = 4 }: { items: KpiItem[]; cols?: 4 | 5 }) {
  if (items.length === 0) return null;
  // Class phải là chuỗi TĨNH — Tailwind quét mã nguồn, `lg:grid-cols-${cols}` không sinh ra CSS.
  const lg = cols === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";
  return (
    <div className={`mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 ${lg}`}>
      {items.map((it) => {
        const card = (
          <StatCard
            icon={it.icon}
            value={it.value}
            label={it.label}
            tone={it.tone}
            hint={it.hint}
          />
        );
        return it.href ? (
          <Link key={it.label} href={it.href} className="block rounded-xl">
            {card}
          </Link>
        ) : (
          <div key={it.label}>{card}</div>
        );
      })}
    </div>
  );
}
