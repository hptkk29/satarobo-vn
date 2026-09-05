/**
 * Site Sale — DẢI SỐ LIỆU đầu màn "Bảng việc hôm nay".
 *
 * ── Vì sao không giữ bốn thẻ số cũ (28/08/2026) ─────────────────────────────
 * Bản trước là bốn thẻ rời, mỗi thẻ một nhãn nhỏ trên một số `text-2xl`. Ba vấn
 * đề, không phải một:
 *   1. **Số không bấm được.** Tư vấn viên đọc "Quá hạn: 3" rồi phải tự đi tìm
 *      ba việc đó ở đâu. Một con số không dẫn tới hành động là trang trí.
 *   2. **"Quá hạn" tô `text-amber-600` gõ tay** — cùng màu với mọi chỗ khác
 *      trong site đang dùng amber, nên nó không nổi lên được. Quá hạn là
 *      `danger` theo DESIGN.md §1, không phải `warning`.
 *   3. Bốn thẻ rời nổi trên nền trang làm nhiễu tầng bề mặt: mắt phải quyết
 *      định bốn lần "đây có phải một khối không".
 *
 * Nay: MỘT dải liền chia ô bằng đường kẻ dọc; số `text-xl` (DESIGN.md §3 — số
 * `text-4xl` là thứ đã làm `955.563.000đ` tràn thẻ ở admin); ô nào dẫn đi được
 * thì là liên kết thật, có trạng thái di chuột và tiêu điểm bàn phím.
 *
 * ⚠️ Màu CHỈ bật khi con số đòi hành động. `soLuong = 0` ở ô "Quá hạn" phải về
 *    màu chữ thường — một số 0 màu đỏ dạy người dùng bỏ qua màu đỏ.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type OSoLieu = {
  nhan: string;
  soLuong: number;
  /** Đường dẫn tới chỗ XỬ LÝ con số này. Bỏ trống = ô chỉ để đọc. */
  href?: string;
  /**
   * Mức chú ý khi `soLuong > 0`. Bỏ trống = không tô màu bao giờ.
   * `danger` cho việc đã trễ, `warning` cho việc sắp trễ.
   */
  mucChuY?: "danger" | "warning";
  /** Câu phụ dưới số — đơn vị hoặc gợi ý, giữ ngắn. */
  phu?: string;
};

const MAU_SO: Record<"danger" | "warning", string> = {
  danger: "text-[color:var(--state-danger)]",
  warning: "text-[color:var(--state-warning)]",
};

function NoiDungO({ o }: { o: OSoLieu }) {
  const boiDam = o.mucChuY && o.soLuong > 0;
  return (
    <>
      <span className="text-xs font-medium text-muted-foreground">{o.nhan}</span>
      <span
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums leading-none",
          boiDam ? MAU_SO[o.mucChuY!] : "text-foreground",
        )}
      >
        {o.soLuong}
      </span>
      {o.phu ? <span className="mt-1 text-xs text-muted-foreground">{o.phu}</span> : null}
    </>
  );
}

export function DaiSoLieu({ o: danhSach }: { o: OSoLieu[] }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-4",
        "shadow-[var(--bong-the)]",
        // Đường kẻ chia ô vẽ bằng viền của chính ô, không bằng `divide-*`:
        // `divide` không xử lý được lúc xuống 2 cột trên màn hẹp.
        "[&>*]:border-border [&>*]:border-b [&>*]:border-r",
        "[&>*:nth-child(2n)]:border-r-0 sm:[&>*:nth-child(2n)]:border-r",
        "sm:[&>*]:border-b-0 [&>*:nth-last-child(-n+2)]:border-b-0",
        "sm:[&>*:last-child]:border-r-0",
      )}
    >
      {danhSach.map((o) => {
        const noi = "flex flex-col px-4 py-3";
        return o.href ? (
          <Link
            key={o.nhan}
            href={o.href}
            className={cn(
              noi,
              "transition-colors hover:bg-[color:var(--surface-chim)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset",
              "focus-visible:ring-[color:var(--primary)]/40",
            )}
          >
            <NoiDungO o={o} />
          </Link>
        ) : (
          <div key={o.nhan} className={noi}>
            <NoiDungO o={o} />
          </div>
        );
      })}
    </div>
  );
}

/** Tiêu đề nhóm dùng chung cho các khối danh sách của màn chủ. */
export function TieuDeNhom({
  children,
  bieuTuong,
  mucChuY,
}: {
  children: ReactNode;
  bieuTuong?: ReactNode;
  mucChuY?: "danger";
}) {
  return (
    <h2
      className={cn(
        "flex items-center gap-2 text-sm font-semibold",
        mucChuY === "danger" ? "text-[color:var(--state-danger)]" : "text-foreground",
      )}
    >
      {bieuTuong}
      {children}
    </h2>
  );
}
