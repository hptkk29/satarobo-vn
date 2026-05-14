import type { ReactNode } from "react";
import { tokens } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

type Variant = "success" | "warning" | "error" | "info" | "neutral";

interface Props {
  variant: Variant;
  children: ReactNode;
  className?: string;
}

// Status badge cho admin lists. Consistent colors across admin pages.
export function StatusBadge({ variant, children, className }: Props) {
  const variants: Record<Variant, string> = {
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    error: "bg-red-50 text-red-700",
    info: "bg-blue-50 text-blue-700",
    neutral: "bg-neutral-100 text-neutral-700",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 text-xs font-medium",
        tokens.radius.badge,
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
