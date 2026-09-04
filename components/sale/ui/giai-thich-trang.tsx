/**
 * Site Sale — DẢI "hướng dẫn dùng trang này", thu lại theo mặc định.
 *
 * ── Vì sao không dùng thẳng `<PageHelp>` của khu quản trị ───────────────────
 * `components/admin/ui/page-help.tsx` tự vẽ một THẺ hoàn chỉnh
 * (`rounded-xl border bg-card`). Trên site Sale mọi màn dữ liệu đã nằm trong
 * `KhungDuLieu`, nên đặt nó vào trong là khung lồng khung — thứ
 * `khung-du-lieu.tsx` cấm thẳng: hai đường bao chồng nhau làm mắt phải đoán đâu
 * là ranh giới của khối việc. Còn đặt nó NGOÀI khung thì phần hướng dẫn của
 * trang lại trôi tách khỏi chính cái trang nó nói về.
 *
 * ⇒ Dải này là cùng một thứ, chỉ bỏ đường bao và bỏ nền thẻ: nó là một TẦNG bên
 * trong khung, ngay dưới dòng đầu, dùng nền `--surface-chim` như thanh lọc để
 * mắt đọc nó là "công cụ" chứ không phải "dữ liệu".
 *
 * ⚠️ Dùng `<details>` gốc chứ không phải state React — giữ nguyên lựa chọn của
 *    bản admin: nó hoạt động trước khi JS chạy, giữ được trạng thái khi in
 *    trang, và không tốn một client component cho mỗi màn.
 *
 * Nội dung viết cho NGƯỜI VẬN HÀNH — không ghi chú kỹ thuật.
 */
import { ChevronRight, CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function GiaiThichTrang({
  children,
  nhan = "Hướng dẫn dùng trang này",
  className,
}: {
  children: ReactNode;
  nhan?: string;
  className?: string;
}) {
  return (
    <details
      className={cn(
        "group border-b border-border bg-[color:var(--surface-chim)]",
        className,
      )}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 px-5 py-2.5",
          "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset",
          "focus-visible:ring-[color:var(--primary)]/40",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <CircleHelp
          aria-hidden="true"
          className="size-4 shrink-0 text-[color:var(--primary-ink)]"
        />
        {nhan}
        <ChevronRight
          aria-hidden="true"
          className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-90"
        />
      </summary>
      <div className="border-t border-border px-5 py-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}
