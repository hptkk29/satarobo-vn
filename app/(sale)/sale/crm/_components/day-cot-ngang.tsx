/**
 * Site Sale — DÃY CỘT NGANG: một danh sách "nhãn — thanh — số".
 * Dùng cho cả "Phễu chuyển đổi" lẫn "Lead theo nguồn" của màn CRM.
 *
 * ── BẢN ĐÔI CỦA `<FunnelChart>` và `<BarChart>` trong
 *    `app/(admin)/admin/crm/page.tsx` ─────────────────────────────────────────
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị.
 *
 * ── VÌ SAO KHÔNG DÙNG RECHARTS Ở ĐÂY — ĐÂY LÀ RÀNG BUỘC, KHÔNG PHẢI SỞ THÍCH ─
 * `eslint.config.mjs` chặn `@/components/charts/*` và `recharts` trong CẢ
 * `app/(sale)/**` LẪN `components/sale/**` (khối "Đợt B site Sale": site nghiệp
 * vụ nội bộ chịu cùng luật với site giáo viên — chặn Magic/Motion VÀ Recharts).
 * Bản mount cũ lách được là vì nó gọi trang admin, tức lời gọi Recharts nằm trong
 * tệp `app/(admin)/**`. Tách bản riêng thì không còn chỗ nào để giấu nó.
 * Chính thông báo của luật đó chỉ đường: *"Client cần visualization → dùng SVG
 * đơn giản"*. Nên hai biểu đồ nay là HTML + CSS thuần, không một dòng JS nào —
 * và cũng không còn 40KB thư viện cho hai biểu đồ tĩnh.
 *
 * DỮ LIỆU GIỮ NGUYÊN 100%: cùng bậc phễu, cùng nhãn, cùng con số, cùng trần 8
 * nguồn. Chỉ HÌNH của biểu đồ là khác.
 *
 * ── MÀU ─────────────────────────────────────────────────────────────────────
 * ⚠️ MỌI thanh MỘT màu, và đó là chủ đích. Độ dài đã mã hoá độ lớn rồi; cho mỗi
 *    bậc một màu là dựng một trục thứ hai không mang tin nào — đúng lỗi đã phải
 *    sửa hai lần ở `khach-cua-toi/_components/lead-table.tsx` ("tô cả một cột là
 *    làm màu mất nghĩa").
 * ⚠️ Màu ấy là TÍM THƯƠNG HIỆU, và điều đó KHÔNG vi phạm luật "trạng thái không
 *    được mượn tone brand": ở đây không có trạng thái nào được mã hoá bằng màu
 *    cả. Nếu bậc "Đã chốt" được tô `success` còn "Đã mất" tô `danger` thì mới là
 *    vi phạm — thang ngữ nghĩa phải để dành cho nhãn trạng thái thật.
 */
import { cn } from "@/lib/utils";

export type CotNgang = { ten: string; soLuong: number };

export function DayCotNgang({
  du,
  rong,
}: {
  du: ReadonlyArray<CotNgang>;
  /** `null` = màn chưa có dữ liệu; in đúng câu của bản admin. */
  rong?: string;
}) {
  if (du.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-muted-foreground">
        {rong ?? "Chưa có dữ liệu."}
      </p>
    );
  }

  // Mốc so sánh là giá trị LỚN NHẤT, không phải tổng: mắt đọc thanh dài nhất là
  // "nhiều nhất", và với phễu thì bậc đầu luôn là mốc — đúng cách đọc một cái phễu.
  const lonNhat = Math.max(...du.map((x) => x.soLuong), 1);

  return (
    <ul className="space-y-2.5 px-5 py-4">
      {du.map((x) => {
        const phanTram = Math.round((x.soLuong / lonNhat) * 100);
        return (
          <li key={x.ten} className="flex items-center gap-3">
            <span
              className="w-32 shrink-0 truncate text-sm text-muted-foreground"
              title={x.ten}
            >
              {x.ten}
            </span>
            <span
              className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[color:var(--surface-chim)]"
              // Thanh là HÌNH, số ngay bên phải mới là dữ liệu đọc được — nên
              // thanh bị ẩn khỏi trình đọc màn hình, không đọc hai lần.
              aria-hidden="true"
            >
              <span
                className={cn("block h-full rounded-full bg-[color:var(--primary)]")}
                style={{ width: `${phanTram}%` }}
              />
            </span>
            <span className="w-14 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
              {x.soLuong.toLocaleString("vi-VN")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
