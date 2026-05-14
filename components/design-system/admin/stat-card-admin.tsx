import type { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { tokens } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number;
  trend?: { direction: "up" | "down"; value: string };
  icon?: ReactNode;
  iconColor?: "orange" | "purple" | "neutral";
  className?: string;
}

// Admin stat card. KHÔNG animation daily-blocking — chỉ shadow on hover.
export function StatCardAdmin({
  label,
  value,
  trend,
  icon,
  iconColor = "orange",
  className,
}: Props) {
  const iconColors = {
    orange: "bg-orange-50 text-orange-500",
    purple: "bg-purple-50 text-purple-700",
    neutral: "bg-neutral-100 text-neutral-600",
  };

  return (
    <div
      className={cn(
        "bg-white p-6",
        tokens.radius.card,
        tokens.borders.subtle,
        tokens.shadows.subtle,
        "hover:shadow-md transition-shadow duration-200",
        className,
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-medium text-neutral-600">{label}</p>
        {icon && (
          <div
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center",
              iconColors[iconColor],
            )}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="text-2xl md:text-3xl font-bold text-neutral-900 mb-1">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {trend && (
        <div
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium",
            trend.direction === "up" ? "text-emerald-600" : "text-red-600",
          )}
        >
          {trend.direction === "up" ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          {trend.value}
        </div>
      )}
    </div>
  );
}
