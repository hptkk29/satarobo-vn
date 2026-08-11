import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Thẻ số liệu cho admin. Port từ `nhhatvy/TeachUI` (`src/components/ui/stat-card.tsx`),
 * đổi màu theo DESIGN.md §1 — lấy HÌNH THỨC của TeachUI, KHÔNG lấy bảng màu của nó.
 *
 * VÌ SAO NẰM NGANG chứ không xếp dọc như bản cũ: bản cũ để nhãn trên, số dưới ở cỡ
 * `text-4xl`, và `955.563.000đ` TRÀN RA NGOÀI THẺ ở /dashboard (đã chụp được 11/08).
 * Tiền 9 chữ số là chuyện thường ở đây, không phải ca biên. Ba thứ cùng lúc mới sửa
 * hẳn được: số về `text-xl`, thẻ có `min-w-0`, và nhãn `truncate`.
 *
 * Tone dùng thang NGỮ NGHĨA (--state-*), tách khỏi màu thương hiệu — xem DESIGN.md §1.
 */
export type StatTone = "brand" | "success" | "warning" | "danger" | "info";

// CHỮ dùng bậc `-ink`, KHÔNG dùng màu tô đặc: đo trên nền trắng thì #10B981 được
// 2,3:1, #F59E0B 2,1:1, #EF4444 3,8:1, #3B82F6 3,7:1 — cả bốn đều trượt AA.
// Màu tô đặc chỉ hợp làm NỀN (ngưỡng 3:1), xem toneTint ngay dưới.
const toneText: Record<StatTone, string> = {
  brand: "text-[color:var(--primary-ink)]",
  success: "text-[color:var(--state-success-ink)]",
  warning: "text-[color:var(--state-warning-ink)]",
  danger: "text-[color:var(--state-danger-ink)]",
  info: "text-[color:var(--state-info-ink)]",
};

const toneTint: Record<StatTone, string> = {
  brand: "bg-[color:var(--primary-soft)]",
  success: "bg-[color:var(--state-success-soft)]",
  warning: "bg-[color:var(--state-warning-soft)]",
  danger: "bg-[color:var(--state-danger-soft)]",
  info: "bg-[color:var(--state-info-soft)]",
};

export function StatCard({
  icon: Icon,
  value,
  label,
  tone = "brand",
  hint,
  className,
}: {
  icon?: LucideIcon;
  /** Số đã định dạng sẵn. Component KHÔNG tự format — đơn vị/locale là việc của trang. */
  value: string | number;
  label: string;
  tone?: StatTone;
  /** Dòng phụ dưới nhãn: so sánh kỳ trước, số bản ghi liên quan… */
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card p-4",
        "transition-shadow hover:shadow-md",
        className,
      )}
    >
      {Icon && (
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            toneTint[tone],
          )}
        >
          <Icon
            className={cn("h-[18px] w-[18px]", toneText[tone])}
            strokeWidth={2}
            aria-hidden
          />
        </span>
      )}
      {/* min-w-0: không có nó thì con `truncate` bên trong không bao giờ co lại,
          và thẻ nở ra ngoài lưới thay vì cắt chữ — đúng lỗi của bản cũ. */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "mt-0.5 truncate text-xl font-bold leading-tight",
            toneText[tone],
          )}
        >
          {value}
        </p>
        {hint && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
