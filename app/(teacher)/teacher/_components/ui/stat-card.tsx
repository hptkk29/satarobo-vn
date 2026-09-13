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
  brand: "text-primary-ink",
  green: "text-state-success-ink",
  amber: "text-state-warning-ink",
  red: "text-state-danger-ink",
  blue: "text-state-info-ink",
};

const tints: Record<StatTone, string> = {
  brand: "bg-primary-soft",
  green: "bg-state-success-soft",
  amber: "bg-state-warning-soft",
  red: "bg-state-danger-soft",
  blue: "bg-state-info-soft",
};

export function StatCard({
  icon: Icon,
  value,
  label,
  tone = "brand",
  hint,
  xuongDong = false,
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
  tone?: StatTone;
  hint?: string;
  /**
   * Cho nhãn/ghi chú XUỐNG DÒNG thay vì cắt bằng `…`.
   *
   * Vì sao là tham số chứ không đổi mặc định: `truncate` đúng cho thẻ có nhãn một từ
   * ("Buổi dạy", "Lớp") — bỏ nó đi là mọi thẻ cũ đổi chiều cao. Nhưng nhãn dạng
   * "Ngày đã đi làm / ngày có ca" thì CẮT LÀ NÓI SAI: ở 375px mỗi thẻ chỉ còn ~88px cho
   * chữ, và "Công tháng này / công chuẩn" hoá thành "Công tháng nà…" — đúng cái lỗi nhãn
   * mà mục 1 sinh ra để sửa, chỉ là do CSS thay vì do phép đếm.
   */
  xuongDong?: boolean;
}) {
  return (
    <div
      className={cn(
        "t-card t-card-hover flex gap-3 p-3.5",
        // Chữ xuống dòng thì thẻ cao lên; canh giữa sẽ đẩy icon xuống lưng chừng.
        xuongDong ? "items-start" : "items-center",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          tints[tone],
        )}
      >
        <Icon
          className={cn("h-[18px] w-[18px]", tones[tone])}
          strokeWidth={2}
          aria-hidden
        />
      </span>
      <div className="min-w-0">
        <p className={cn("text-xl leading-tight font-bold", tones[tone])}>
          {value}
        </p>
        <p
          className={cn(
            "text-xs text-muted-foreground",
            xuongDong ? "leading-snug" : "truncate",
          )}
        >
          {label}
        </p>
        {hint && (
          <p
            className={cn(
              "text-[11px] text-muted-foreground",
              xuongDong ? "leading-snug" : "truncate",
            )}
          >
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
