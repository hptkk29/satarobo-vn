"use client";

// Bộ lọc danh sách khách — đẩy vào URL để trạng thái lọc chia sẻ được và bấm
// Quay lại của trình duyệt chạy đúng.
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ALL_LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/leads/status";

export function LeadListFilters({
  status,
  q,
  gomDaDong,
}: {
  status: string;
  q: string;
  gomDaDong: boolean;
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
      <input
        name="q"
        defaultValue={q}
        placeholder="Tìm tên phụ huynh, tên con, số điện thoại…"
        className="h-9 min-w-[16rem] flex-1 rounded-lg border border-border bg-background px-3 text-sm"
      />
      <select
        value={status}
        onChange={(e) => dat("status", e.target.value)}
        className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
      >
        <option value="">Mọi trạng thái</option>
        {ALL_LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {LEAD_STATUS_LABEL[s] ?? s}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={gomDaDong}
          onChange={(e) => dat("dong", e.target.checked ? "1" : "")}
          className="h-4 w-4"
        />
        Gồm khách đã đóng
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-50"
      >
        {pending ? "Đang lọc…" : "Tìm"}
      </button>
    </form>
  );
}
