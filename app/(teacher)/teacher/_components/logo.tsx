import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Logo chữ SATA ROBO. Repo không có file logo trong `public/`, nên dùng text
 * lockup. Gradient hổ phách→cam→cam đậm là chỗ DUY NHẤT còn dùng gradient trong
 * site GV (theo TeachUI: "gradient dành riêng cho logo/avatar").
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/teacher"
      aria-label="Sata Robo — Giáo viên"
      className={cn("inline-flex items-baseline gap-1.5", className)}
    >
      <span className="brand-text text-lg font-extrabold tracking-tight">
        Sata Robo
      </span>
      <span className="text-xs font-medium text-muted-foreground">Giáo viên</span>
    </Link>
  );
}
