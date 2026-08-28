/**
 * Site Sale — BỀ MẶT DỮ LIỆU dùng chung cho mọi màn có bảng hoặc danh sách.
 *
 * ── Vì sao nó ra đời (28/08/2026) ───────────────────────────────────────────
 * Trước đợt này mọi bảng của site Sale **trôi thẳng trên nền trang**: không
 * khung, không đường bao, thanh lọc dính vào tiêu đề, tiêu đề dính vào bảng.
 * Ba khối việc khác nhau nằm cùng một mặt phẳng nên mắt không biết đâu là đâu.
 *
 * Khung này dựng đúng ba tầng mà một màn dữ liệu cần:
 *   1. `<KhungDuLieu.Dau>`   — tên màn + hành động chính (nút ở PHẢI, cùng dòng)
 *   2. `<KhungDuLieu.Loc>`   — thanh lọc, nằm TRONG khung, nền chìm hơn thân
 *   3. `<KhungDuLieu.Than>`  — bảng/danh sách
 *
 * ⚠️ KHÔNG lồng khung trong khung. Một màn = một `KhungDuLieu`. Khung lồng khung
 *    là dấu hiệu màn đang làm hai việc và nên tách thành hai màn.
 *
 * ⚠️ Bóng đổ CÓ offset và blur mềm (`--bong-the`), không phải quầng sáng bao
 *    quanh. Quầng zero-offset là trang trí, không phải chiều sâu.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function KhungDuLieu({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-[var(--bong-the)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * Dòng đầu khung: tên màn bên trái, hành động chính bên phải.
 *
 * `min-w-0` + `truncate` trên khối chữ là bắt buộc: tên màn tiếng Việt có dấu
 * dài hơn tiếng Anh, và khi thu hẹp cửa sổ thì chính nó đẩy nút hành động rơi
 * xuống dòng — lỗi đã chụp được ở màn `/students` (nút "Áp dụng" chiếm nguyên
 * một hàng).
 */
function Dau({
  ten,
  mo,
  hanhDong,
}: {
  ten: string;
  mo?: ReactNode;
  hanhDong?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">{ten}</h1>
        {mo ? <p className="mt-0.5 text-sm text-muted-foreground">{mo}</p> : null}
      </div>
      {hanhDong ? <div className="flex shrink-0 items-center gap-2">{hanhDong}</div> : null}
    </div>
  );
}

/**
 * Thanh lọc. Nền `--surface-chim` — chìm hơn thân bảng một bậc, để mắt đọc nó
 * là "công cụ" chứ không phải "dữ liệu".
 */
function Loc({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-border bg-[color:var(--surface-chim)] px-5 py-3">{children}</div>
  );
}

/**
 * Thân khung. `overflow-x-auto` nằm ở ĐÂY chứ không ở trang: bảng rộng phải tự
 * cuộn ngang bên trong khung của nó, không được đẩy cả trang trượt ngang.
 */
function Than({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto", className)}>{children}</div>;
}

/** Dòng chân: đếm số, phân trang, chú giải. */
function Chan({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-border bg-[color:var(--surface-chim)] px-5 py-2.5 text-xs text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * Trạng thái rỗng. `operate.md`: màn rỗng phải DẠY giao diện, không phải nói
 * "không có gì". Nên nó nhận một hành động.
 */
function Rong({
  ten,
  mo,
  hanhDong,
}: {
  ten: string;
  mo?: string;
  hanhDong?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
      <p className="text-sm font-medium text-foreground">{ten}</p>
      {mo ? <p className="max-w-sm text-sm text-muted-foreground">{mo}</p> : null}
      {hanhDong ? <div className="mt-2">{hanhDong}</div> : null}
    </div>
  );
}

KhungDuLieu.Dau = Dau;
KhungDuLieu.Loc = Loc;
KhungDuLieu.Than = Than;
KhungDuLieu.Chan = Chan;
KhungDuLieu.Rong = Rong;
