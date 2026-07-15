import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Thẻ số liệu — port từ TeachUI.
 *
 * `brand` = cam thương hiệu. Các tone còn lại là NGỮ NGHĨA, không phải thương
 * hiệu: green = tốt/xong, amber = đang chờ, red = lỗi, blue = thông tin.
 * Mỗi tone có biến thể dark sáng hơn để số liệu không bị chìm trên nền tối.
 */
export type StatTone = "brand" | "green" | "amber" | "red" | "blue";

const tones: Record<StatTone, string> = {
  brand: "text-orange-600 dark:text-orange-400",
  green: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
  blue: "text-blue-600 dark:text-blue-400",
};

const tints: Record<StatTone, string> = {
  brand: "bg-orange-50 dark:bg-orange-500/15",
  green: "bg-emerald-50 dark:bg-emerald-500/15",
  amber: "bg-amber-50 dark:bg-amber-500/15",
  red: "bg-red-50 dark:bg-red-500/15",
  blue: "bg-blue-50 dark:bg-blue-500/15",
};

export function StatCard({
  icon: Icon,
  value,
  label,
  tone = "brand",
  hint,
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
  tone?: StatTone;
  hint?: string;
}) {
  return (
    <div className="t-card t-card-hover flex items-center gap-3 p-3.5">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          tints[tone],
        )}
      >
        <Icon className={cn("h-[18px] w-[18px]", tones[tone])} strokeWidth={2} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className={cn("text-xl leading-tight font-bold", tones[tone])}>{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
