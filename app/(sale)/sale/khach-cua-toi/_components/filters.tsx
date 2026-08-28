"use client";

// Bộ lọc danh sách khách — đẩy vào URL để trạng thái lọc chia sẻ được và bấm
// Quay lại của trình duyệt chạy đúng.
//
// ── ĐỢT THIẾT KẾ LẠI 28/08/2026 ─────────────────────────────────────────────
// Bản trước trộn ba thứ tiếng khác nhau trên cùng một hàng: `<input>` bo góc
// theo tông của kho, `<select>` GỐC của trình duyệt (mũi tên và chiều cao do hệ
// điều hành vẽ), và `<input type=checkbox>` trần. Ba kiểu điều khiển cho một
// thanh lọc là dấu hiệu rõ nhất của giao diện chắp vá — người dùng không đọc ra
// lỗi đó thành lời, họ chỉ thấy "trông chưa xong".
// Nay cả ba đi theo một bộ: ô nhập của kho, `<Select>` của kho, và cái công tắc
// "gồm khách đã đóng" thành CHIP BẤM ĐƯỢC (`aria-pressed`) thay vì ô tích trần.
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ALL_LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/leads/status";

const MOI_TRANG_THAI = "__tat_ca__";

export function LeadListFilters({
  status,
  q,
  gomDaDong,
  // S-1 — ô tìm không quét cột SĐT khi người xem không có quyền xem SĐT. Nói
  // thẳng trong placeholder, không thì người dùng gõ số rồi tưởng hệ thống mất dữ
  // liệu khách.
  timDuocSdt = false,
}: {
  status: string;
  q: string;
  gomDaDong: boolean;
  timDuocSdt?: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  // Đổi lọc → thay URL. `replace` chứ không `push`: gõ tìm kiếm mà đẩy vào lịch
  // sử thì bấm Quay lại phải bấm mười lần mới ra khỏi trang.
  function dat(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    start(() => router.replace(`/sale/khach-cua-toi?${next.toString()}`));
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const v = new FormData(e.currentTarget).get("q");
        dat("q", typeof v === "string" ? v.trim() : "");
      }}
    >
      {/* Ô tìm: biểu tượng nằm TRONG ô, không đứng cạnh làm một nút giả. */}
      <div className="relative min-w-[15rem] flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          name="q"
          defaultValue={q}
          aria-label="Tìm khách"
          placeholder={
            timDuocSdt
              ? "Tìm tên phụ huynh, tên con, số điện thoại…"
              : "Tìm tên phụ huynh hoặc tên con…"
          }
          className={cn(
            "h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm",
            "placeholder:text-muted-foreground",
            "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
          )}
        />
      </div>

      <Select
        value={status || MOI_TRANG_THAI}
        onValueChange={(v) => {
          if (v !== null) dat("status", v === MOI_TRANG_THAI ? "" : String(v));
        }}
      >
        <SelectTrigger
          aria-label="Lọc theo trạng thái"
          className="h-9 w-auto min-w-[10.5rem] rounded-lg bg-card text-sm"
          disabled={pending}
        >
          <SelectValue>
            {(v: string | null) =>
              v && v !== MOI_TRANG_THAI
                ? (LEAD_STATUS_LABEL[v as keyof typeof LEAD_STATUS_LABEL] ?? String(v))
                : "Mọi trạng thái"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={MOI_TRANG_THAI}>Mọi trạng thái</SelectItem>
          {ALL_LEAD_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {LEAD_STATUS_LABEL[s] ?? s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Công tắc dạng chip: trạng thái bật/tắt đọc được bằng NỀN, không phải
          bằng một dấu tích 16px. `aria-pressed` để trình đọc màn hình vẫn hiểu
          đây là công tắc hai trạng thái. */}
      <button
        type="button"
        aria-pressed={gomDaDong}
        disabled={pending}
        onClick={() => dat("dong", gomDaDong ? "" : "1")}
        className={cn(
          "h-9 shrink-0 rounded-lg border px-3 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30",
          "disabled:opacity-50",
          gomDaDong
            ? "border-[color:var(--primary)]/35 bg-[color:var(--primary-soft)] font-medium text-[color:var(--primary-ink)]"
            : "border-border bg-card text-muted-foreground hover:bg-[color:var(--surface-chim)]",
        )}
      >
        Gồm khách đã đóng
      </button>

      <button
        type="submit"
        disabled={pending}
        className={cn(
          "h-9 shrink-0 rounded-lg px-4 text-sm font-medium transition-colors",
          "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
          "hover:bg-[color:var(--primary-dark)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
          "disabled:opacity-50",
        )}
      >
        {pending ? "Đang lọc…" : "Tìm"}
      </button>
    </form>
  );
}
