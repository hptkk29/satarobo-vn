/**
 * Site Sale — chip "Dùng chung" trên bảng và trên thẻ kanban.
 *
 * ── BẢN ĐÔI CỦA `SharedBadge` (bản admin khai HAI LẦN: một bản trong
 *    `leads-table.tsx`, một bản y hệt trong `leads-kanban.tsx`) ───────────────
 * Ở đây chỉ có MỘT bản cho cả hai chế độ xem. Đó là chỗ duy nhất bản Sale cố ý
 * gọn hơn bản admin, và nó không đổi thứ người dùng nhìn thấy.
 *
 * GIỮ NGUYÊN 100%: chữ "Dùng chung", và sự phân biệt hai chiều chia sẻ —
 * “Bạn đang chia sẻ lead này” (lead của mình) so với lead người khác chia cho mình.
 *
 * ⚠️ KHÔNG dùng `<Badge>`. `lib/sale/ky-luat-mau.test.ts` cấm `<Badge>` trong mọi
 *    tệp bảng của site Sale, và lý do không phải hình thức: mười trạng thái vẽ
 *    bằng `variant="outline"` ra MỘT màu tím nhạt, màu hết mang tin.
 *
 * ⚠️ Cũng KHÔNG dùng `StatusPill`. Chip này không phải trạng thái của lead — nó
 *    là một thuộc tính quyền truy cập. Cho nó mượn thang màu ngữ nghĩa là làm
 *    loãng đúng thang mà cột "Trạng thái" ngay cạnh đang dùng. Nên nó trung tính,
 *    và chiều chia sẻ diễn đạt bằng NÉT VIỀN (đứt = người khác chia cho mình) chứ
 *    không bằng màu.
 */
import { cn } from "@/lib/utils";

const CHUNG =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 " +
  "text-[11px] font-medium text-muted-foreground";

export function ChipDungChung({
  dangChiaSe,
  cuaToi,
}: {
  /** `Lead.isSharedWithTeam` — đã cắt sẵn ở server khi chính sách đang TẮT. */
  dangChiaSe: boolean;
  /** Lead này do CHÍNH người đang xem phụ trách. */
  cuaToi: boolean;
}) {
  if (!dangChiaSe) return null;
  return (
    <span
      title={cuaToi ? "Bạn đang chia sẻ lead này" : "Đồng nghiệp chia sẻ lead này cho team"}
      className={cn(
        CHUNG,
        cuaToi
          ? "bg-[color:var(--surface-chim)] ring-1 ring-inset ring-border"
          : "border border-dashed border-border",
      )}
    >
      Dùng chung
    </span>
  );
}
