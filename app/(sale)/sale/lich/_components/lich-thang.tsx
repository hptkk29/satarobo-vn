/**
 * Site Sale — lưới lịch tháng.
 *
 * ── BẢN ĐÔI CỦA `components/lms/month-calendar.tsx` ──────────────────────────
 * Quyết định 04/09/2026: màn Sale tách bản riêng, không dùng chung component với
 * khu quản trị nữa, để thiết kế lại giao diện site Sale mà không đụng một pixel
 * nào của khu quản trị. `MonthCalendar` dùng chung cho admin + portal, nên đổi
 * màu ở đó là đổi cả hai khu kia — đúng thứ đợt này cấm.
 *
 * ⚠️ VÌ SAO KHÔNG THỂ MOUNT LẠI, KỂ CẢ NẾU MUỐN: `MonthCalendar` gõ CỨNG màu
 *    cam vào mã (`text-orange-600` cho hôm nay, `bg-orange-100 text-orange-800`
 *    cho từng buổi, `bg-neutral-*` cho khung). Cam là màu nhận diện của site
 *    giáo viên; đặt nguyên khối cam giữa một site tím là hỏng cả cái quy ước
 *    "nhìn màu là biết đang đứng ở site nào" mà `sale.css` dựng ra. Bản dưới đây
 *    đi qua token của `sale.css`, không có một class màu rời nào.
 *
 * PHẦN LOGIC KHÔNG NHÂN BẢN: lưới ngày vẫn là `monthGrid()` thuần ở
 * `lib/lms/calendar.ts`, dùng chung với admin + portal. Chỉ lớp vẽ là bản riêng.
 *
 * GIỮ NGUYÊN 100% NỘI DUNG: nhãn tháng "Tháng N / YYYY", đầu tuần T2…CN, số
 * ngày, tối đa 4 buổi mỗi ô rồi "+N", mỗi buổi in "giờ bắt đầu · tên lớp".
 */
import { monthGrid, WEEKDAY_LABELS } from "@/lib/lms/calendar";
import type { CalEvent } from "@/components/lms/month-calendar";
import { cn } from "@/lib/utils";

/** Trần số buổi vẽ ra trong một ô — giống bản gốc, phần dư gộp thành "+N". */
const TRAN_BUOI_MOI_O = 4;

function homNayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

export function LichThangSale({
  year,
  month0,
  events,
}: {
  year: number;
  month0: number;
  events: CalEvent[];
}) {
  const weeks = monthGrid(year, month0);
  const theoNgay = new Map<string, CalEvent[]>();
  for (const e of events) {
    const ds = theoNgay.get(e.iso);
    if (ds) ds.push(e);
    else theoNgay.set(e.iso, [e]);
  }
  const nay = homNayIso();

  return (
    // `min-w` + vùng cuộn của `KhungDuLieu.Than` ở trang: bảy cột ở bề rộng
    // 375px thì mỗi ô còn ~50px — không đọc được tên lớp nào. Thà cuộn ngang
    // trong khung còn hơn bóp chữ đến mức vô dụng.
    <div className="min-w-[46rem] p-4">
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {/* Hàng đầu tuần mượn đúng ngôn ngữ của `.bang-sale thead th`: chữ nhỏ,
            in hoa, giãn chữ, nền chìm — để mắt đọc nó là "khung", không phải dữ liệu. */}
        {WEEKDAY_LABELS.map((w) => (
          <div
            key={w}
            className="bg-[color:var(--surface-chim)] py-2 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
          >
            {w}
          </div>
        ))}

        {weeks.flat().map((d) => {
          const buoi = theoNgay.get(d.iso) ?? [];
          const laHomNay = d.iso === nay;
          return (
            <div
              key={d.iso}
              className={cn(
                "min-h-[92px] p-1.5",
                // Ngày tràn từ tháng kề: chìm một bậc, chữ nhạt. Vẫn đọc được —
                // buổi học của ngày 31/8 nằm trong lưới tháng 9 vẫn là buổi thật.
                d.inMonth
                  ? "bg-card"
                  : "bg-[color:var(--surface-chim)] text-muted-foreground",
              )}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                    laHomNay
                      ? // Hôm nay: đĩa tím đặc + chữ trắng. Chỉ MỘT ô trong lưới
                        // được đánh dấu nên nó nổi lên mà không cần thêm màu nào.
                        "bg-[color:var(--primary)] font-semibold text-[color:var(--primary-foreground)]"
                      : d.inMonth
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                  aria-current={laHomNay ? "date" : undefined}
                >
                  {d.date.getDate()}
                </span>
              </div>

              <div className="space-y-1">
                {buoi.slice(0, TRAN_BUOI_MOI_O).map((e, i) => (
                  <div
                    key={`${d.iso}-${i}`}
                    title={`${e.label}${e.sublabel ? ` · ${e.sublabel}` : ""}`}
                    className="truncate rounded-md bg-[color:var(--primary-soft)] px-1.5 py-0.5 text-[11px] leading-4 text-[color:var(--primary-ink)]"
                  >
                    {e.sublabel ? (
                      <span className="font-medium tabular-nums">{e.sublabel} </span>
                    ) : null}
                    {e.label}
                  </div>
                ))}
                {buoi.length > TRAN_BUOI_MOI_O ? (
                  <div className="px-1.5 text-[11px] leading-4 text-muted-foreground">
                    +{buoi.length - TRAN_BUOI_MOI_O}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
